import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './auth.dto';
import {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  ReuseDetectedError,
  RefreshTokenInvalidError,
  type RefreshTokenRow,
  type IssuedRefreshToken,
} from './refresh-token';

/** 认证响应用户形状（ADR-0013：role 已随 schema 删除） */
export interface AuthUserPayload {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: AuthUserPayload;
}

@Injectable()
export class AuthService {
  /**
   * 复用检测 tombstone 登记（进程内）：已轮换作废旧行的副本。
   * 旧 token 再提交时在这里命中 → 整族吊销。
   * 单实例部署下够用；实例重启后 tombstone 清空，被泄露的旧 token 表现为
   * 普通 401（对应行早已删除，无法再换发凭据）。
   */
  private readonly refreshTombstones: RefreshTokenRow[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    const valid = await compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    return this.issuePair(user);
  }

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('该邮箱已注册');
    }

    const passwordHash = await hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email: dto.email,
        passwordHash,
        displayName: dto.displayName ?? dto.email.split('@')[0],
      },
    });

    return this.issuePair(user);
  }

  /** refresh 轮换：旧 refresh token → 新对（access + refresh）+ 最新 user 快照 */
  async refresh(oldRefreshToken: string): Promise<AuthResult> {
    let rotated: { userId: string; token: string; expiresAt: Date };
    try {
      rotated = await rotateRefreshToken(
        this.prisma,
        oldRefreshToken,
        this.refreshTombstones,
      );
    } catch (err) {
      if (err instanceof ReuseDetectedError) {
        throw new UnauthorizedException('会话已被吊销，请重新登录');
      }
      if (err instanceof RefreshTokenInvalidError) {
        throw new UnauthorizedException('refresh token 无效或已过期');
      }
      throw err;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
    });
    if (!user) {
      // 行还在 user 没了（理论上 onDelete: Cascade 不会发生）—— 防御性 401
      throw new UnauthorizedException('refresh token 无效或已过期');
    }

    return this.buildResult(user, {
      token: rotated.token,
      expiresAt: rotated.expiresAt,
    });
  }

  /** 登出：作废该 refresh token 行。幂等 —— token 无效/不存在也正常返回 */
  async logout(userId: string, refreshToken: string): Promise<void> {
    await revokeRefreshToken(this.prisma, userId, refreshToken);
  }

  /** 按 refresh token 定位所属用户（logout 无 guard，需先认人再删行） */
  async findUserIdByRefreshToken(token: string): Promise<string | null> {
    const rows = await this.prisma.refreshToken.findMany({
      select: { id: true, userId: true, tokenHash: true, expiresAt: true },
    });
    for (const row of rows) {
      if (await compare(token, row.tokenHash)) {
        return row.userId;
      }
    }
    return null;
  }

  /** 签发 access + refresh 新对（login/register 共用） */
  private async issuePair(user: AuthUserPayload): Promise<AuthResult> {
    const issued = await issueRefreshToken(this.prisma, user.id);
    return this.buildResult(user, issued);
  }

  private buildResult(
    user: AuthUserPayload,
    refresh: IssuedRefreshToken,
  ): AuthResult {
    const accessToken = this.jwt.sign({
      sub: user.id,
      email: user.email,
      type: 'access',
    });
    return {
      accessToken,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
    };
  }
}

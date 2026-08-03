import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

/** 挂到 request.user 上的 JWT payload 形状,与 AuthService 签发时一致 */
export interface JwtPayload {
  sub: string;
  email: string;
}

/**
 * JWT 认证守卫:不引入 passport,直接用 JwtService.verifyAsync 验签。
 * 成功后把 { sub, email } 挂到 request.user;失败抛 401。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = req.headers['authorization'] ?? '';
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m) {
      throw new UnauthorizedException('缺少认证凭据');
    }
    try {
      // JwtService 已在 AuthModule 注册时绑定 secret,这里不再传 { secret }
      const payload = await this.jwt.verifyAsync<JwtPayload>(m[1]);
      (req as unknown as { user: JwtPayload }).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('无效或过期的认证凭据');
    }
  }
}

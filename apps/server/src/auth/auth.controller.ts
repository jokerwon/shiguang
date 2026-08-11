import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, type AuthResult } from './auth.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { REFRESH_TOKEN_TTL_MS } from './refresh-token';

/**
 * refresh token 的 httpOnly cookie（ADR-0013 决策 3）。
 * Path=/auth：只在认证端点上由浏览器自动携带，缩小暴露面；
 * Secure 由部署环境决（本地 http 开发不能加，生产 https 必须加）。
 */
const RT_COOKIE = 'shiguang_rt';

function setRefreshCookie(res: Response, token: string): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${RT_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=${Math.floor(
      REFRESH_TOKEN_TTL_MS / 1000,
    )}${secure}`,
  );
}

function clearRefreshCookie(res: Response): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${RT_COOKIE}=; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=0${secure}`,
  );
}

/** 手写 cookie 解析（就一个 key，不引 cookie-parser） */
function readRefreshCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const m = new RegExp(`(?:^|;\\s*)${RT_COOKIE}=([^;]+)`).exec(header);
  return m?.[1];
}

/** body 优先，cookie 兜底（ADR-0013 决策 3：Web 走 cookie，原生 app 走 body） */
function extractRefreshToken(req: Request, bodyToken?: string): string {
  const token = bodyToken ?? readRefreshCookie(req);
  if (!token) {
    throw new UnauthorizedException('缺少 refresh token');
  }
  return token;
}

/** 响应 body（refreshTokenExpiresAt 为服务端内部字段，不下发） */
function toResponse(result: AuthResult) {
  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    user: result.user,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto);
    setRefreshCookie(res, result.refreshToken);
    return toResponse(result);
  }

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.register(dto);
    setRefreshCookie(res, result.refreshToken);
    return toResponse(result);
  }

  /** 无 guard：凭 refresh token 本身认证；一次一换（轮换），旧 token 立即作废 */
  @Post('refresh')
  async refresh(
    @Body('refreshToken') bodyToken: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const oldToken = extractRefreshToken(req, bodyToken);
    const result = await this.auth.refresh(oldToken);
    setRefreshCookie(res, result.refreshToken);
    return toResponse(result);
  }

  /** 无 guard：拿得到 refresh 就能登出自己；幂等（token 无效/不存在也返回 ok） */
  @Post('logout')
  async logout(
    @Body('refreshToken') bodyToken: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    clearRefreshCookie(res);
    const token = bodyToken ?? readRefreshCookie(req);
    if (!token) {
      return { ok: true };
    }
    const userId = await this.auth.findUserIdByRefreshToken(token);
    if (userId) {
      await this.auth.logout(userId, token);
    }
    return { ok: true };
  }
}

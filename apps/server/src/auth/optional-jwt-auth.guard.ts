import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { JwtPayload } from './jwt-auth.guard';

/** Express Request 上的已验签用户（guard 写入，decorator 读取） */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * 可选认证守卫（Phase 8-1）：菜谱列表是公开端点，但登录用户的安全设置
 * （忌口/过敏原）必须在筛选时生效。带凭据则验签并挂 request.user，
 * 无效凭据同样拒绝（不静默降级为「无设置」），不带凭据按匿名处理。
 *
 * 安全判断永远来自服务端上下文，不信任客户端声称「我没有过敏设置」。
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = req.headers['authorization'] ?? '';
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m) return true;
    const payload = await this.jwt.verifyAsync<JwtPayload>(m[1]);
    if (payload.type !== 'access') return false;
    req.user = payload;
    return true;
  }
}

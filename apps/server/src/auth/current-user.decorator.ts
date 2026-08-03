import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from './jwt-auth.guard';

/**
 * 从 request.user 取当前用户 id (sub)。
 * 必须与 JwtAuthGuard 同 controller 使用,否则 user 为 undefined。
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();
    return req.user?.sub ?? '';
  },
);

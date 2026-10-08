/* eslint-disable @typescript-eslint/require-await */
// OptionalJwtAuthGuard 回归（Phase 8）：公开端点（/recipes）带无效、过期或类型不符的
// 凭据必须给 401，不能因未捕获的 JsonWebTokenError/TokenExpiredError 变成 500 ——
// 前端只在 401 时触发 refresh 重放（ADR-0013 决策 4），500 会直接落到「加载失败」。
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
import type { JwtPayload } from './jwt-auth.guard';

type FakeRequest = Pick<Request, 'headers'> & { user?: JwtPayload };

/** 只提供守卫用到的那部分 ExecutionContext */
function contextOf(req: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function guardWith(verifyAsync: (token: string) => Promise<unknown>) {
  return new OptionalJwtAuthGuard({
    verifyAsync,
  } as unknown as JwtService);
}

describe('OptionalJwtAuthGuard', () => {
  it('无凭据按匿名放行，不挂 user', async () => {
    const req: FakeRequest = { headers: {} };
    const guard = guardWith(async () => {
      throw new Error('不该验签');
    });

    await expect(guard.canActivate(contextOf(req))).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('有效 access 凭据放行并挂上 request.user', async () => {
    const req: FakeRequest = { headers: { authorization: 'Bearer good' } };
    const guard = guardWith(async () => ({ sub: 'u1', type: 'access' }));

    await expect(guard.canActivate(contextOf(req))).resolves.toBe(true);
    expect(req.user).toEqual({ sub: 'u1', type: 'access' });
  });

  it.each([
    ['畸形 token', new Error('jwt malformed')],
    [
      '过期 token',
      Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' }),
    ],
    ['签名不符', new Error('invalid signature')],
  ])('%s 给 401 而不是 500', async (_label, error) => {
    const req: FakeRequest = { headers: { authorization: 'Bearer bad' } };
    const guard = guardWith(async () => {
      throw error;
    });

    await expect(guard.canActivate(contextOf(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(req.user).toBeUndefined();
  });

  it('非 access 类型（refresh JWT）给 401，不静默降级为匿名', async () => {
    const req: FakeRequest = { headers: { authorization: 'Bearer other' } };
    const guard = guardWith(async () => ({ sub: 'u1', type: 'refresh' }));

    await expect(guard.canActivate(contextOf(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(req.user).toBeUndefined();
  });
});

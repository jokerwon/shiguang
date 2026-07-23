import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

// Next.js 16 中 middleware 约定已更名为 proxy。
// next-intl 的 createMiddleware 返回的函数签名兼容 proxy 约定。
const intlProxy = createMiddleware(routing)

export default function proxy(...args: Parameters<typeof intlProxy>) {
  return intlProxy(...args)
}

export const config = {
  // 跳过 _next 内部路径与含点号的静态资源
  matcher: ['/((?!_next|.*\\..*).*)'],
}

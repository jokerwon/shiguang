import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  // 支持的语言
  locales: ['zh', 'en'],
  // 无匹配时回退的语言（中文，且不出现在 URL 中）
  defaultLocale: 'zh',
  // 默认 locale 无前缀（/），其余带前缀（/en）
  localePrefix: 'as-needed',
})

import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

// 考虑 routing 配置（locale 前缀）的导航 API 封装
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)

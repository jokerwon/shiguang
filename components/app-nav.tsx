'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HomeIcon, BookOpenIcon, CalendarDaysIcon, PackageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/', label: '对话', icon: HomeIcon },
  { href: '/recipes', label: '菜品库', icon: BookOpenIcon },
  { href: '/records', label: '饮食记录', icon: CalendarDaysIcon },
  { href: '/inventory', label: '库存', icon: PackageIcon },
]

export function AppNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-sm border-t border-border paper-texture md:top-0 md:bottom-auto md:border-t-0 md:border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo - 仅桌面端显示 */}
          <div className="hidden md:block">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center ink-brush">
                <span className="text-2xl font-serif font-bold text-primary">食</span>
              </div>
              <div>
                <h1 className="text-xl font-serif font-semibold text-foreground group-hover:text-primary transition-colors">
                  食光
                </h1>
                <p className="text-xs text-muted-foreground">记录每一刻的美味</p>
              </div>
            </Link>
          </div>

          {/* 导航项 */}
          <div className="flex items-center justify-around w-full md:w-auto md:gap-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex flex-col md:flex-row items-center gap-1 md:gap-2 px-3 md:px-4 py-2 rounded-lg transition-all',
                    'hover:bg-primary/10',
                    isActive
                      ? 'text-primary bg-primary/5'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="size-5 md:size-4" />
                  <span className="text-xs md:text-sm font-medium">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )
}

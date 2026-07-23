'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { NavigationMenu, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, navigationMenuTriggerStyle } from '@/components/ui/navigation-menu'
import { cn } from '@/lib/utils'
import { Bookmark, Ham, Home, MessageCircle } from 'lucide-react'

import type { LucideIcon } from 'lucide-react'

const links: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/', label: '发现', icon: Home },
  { href: '/pantry', label: '食材', icon: Ham },
  { href: '/chat', label: '对话', icon: MessageCircle },
  { href: '/favorite', label: '收藏', icon: Bookmark },
]

export function Navbar() {
  const pathname = usePathname()

  return (
    <NavigationMenu className="hidden md:flex">
      <NavigationMenuList>
        {links.map((link) => {
          const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
          return (
            <NavigationMenuItem key={link.href}>
              <NavigationMenuLink
                active={active}
                aria-current={active ? 'page' : undefined}
                className={cn(navigationMenuTriggerStyle(), 'text-muted-foreground hover:text-foreground data-active:text-foreground')}
                render={<Link href={link.href}>{link.label}</Link>}
              />
            </NavigationMenuItem>
          )
        })}
      </NavigationMenuList>
    </NavigationMenu>
  )
}

export function Tabbar() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 flex items-stretch justify-around h-(--nav-h) bg-background backdrop-blur-md border-t border-border md:hidden">
      {links.map((link) => {
        const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
        const Icon = link.icon
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={cn('relative flex flex-1 flex-col items-center justify-center gap-0.75 text-xs text-muted-foreground transition-colors', active && 'text-foreground')}
          >
            <Icon size={20} className={cn('transition-transform', active && 'scale-110')} />
            <span>{link.label}</span>
            {active && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary" />}
          </Link>
        )
      })}
    </nav>
  )
}

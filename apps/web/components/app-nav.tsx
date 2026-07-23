'use client'

import { Link, usePathname } from '@/i18n/navigation'

import { NavigationMenu, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, navigationMenuTriggerStyle } from '@/components/ui/navigation-menu'
import { cn } from '@/lib/utils'
import { Bookmark, Ham, Home, MessageCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { LucideIcon } from 'lucide-react'

const links: { href: string; labelKey: 'discover' | 'pantry' | 'chat' | 'favorite'; icon: LucideIcon }[] = [
  { href: '/', labelKey: 'discover', icon: Home },
  { href: '/pantry', labelKey: 'pantry', icon: Ham },
  { href: '/chat', labelKey: 'chat', icon: MessageCircle },
  { href: '/favorite', labelKey: 'favorite', icon: Bookmark },
]

export function Navbar() {
  const pathname = usePathname()
  const t = useTranslations('Nav')

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
                render={<Link href={link.href}>{t(link.labelKey)}</Link>}
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
  const t = useTranslations('Nav')

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
            <span>{t(link.labelKey)}</span>
            {active && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary" />}
          </Link>
        )
      })}
    </nav>
  )
}

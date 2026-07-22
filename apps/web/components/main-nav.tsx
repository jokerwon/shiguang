'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { NavigationMenu, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, navigationMenuTriggerStyle } from '@/components/ui/navigation-menu'
import { cn } from '@/lib/utils'

const links = [
  { href: '/', label: '发现' },
  { href: '/pantry', label: '食材' },
  { href: '/chat', label: '对话' },
  { href: '/favorite', label: '收藏' },
]

export function MainNav() {
  const pathname = usePathname()

  return (
    <NavigationMenu>
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

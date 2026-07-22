import { NavigationMenu, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, navigationMenuTriggerStyle } from '@/components/ui/navigation-menu'
import Link from 'next/link'

export default function ScreenLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="min-h-full">
      {/* position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  height: var(--nav-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-md);
  padding-inline: max(var(--gap-md), calc((100vw - var(--shell-w)) / 2 + var(--gap-md)));
  background: var(--bg);
  @supports (color: color-mix(in lab, red, red)) {
    background: color-mix(in oklch, var(--bg) 88%, transparent);
  }
  backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--border);
} */}
      <header
        className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between h-(--nav-h) bg-background backdrop-blur-md border-b border-border"
        style={{ paddingInline: 'max(var(--gap-md), calc((100vw - var(--shell-w)) / 2 + var(--gap-md)))' }}
      >
        <div className="text-lg font-bold">
          {/* <LogoMark /> */}
          食光
        </div>
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink className={navigationMenuTriggerStyle()} render={<Link href="/">发现</Link>} />
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink className={navigationMenuTriggerStyle()} render={<Link href="/pantry">食材</Link>} />
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink className={navigationMenuTriggerStyle()} render={<Link href="/chat">对话</Link>} />
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink className={navigationMenuTriggerStyle()} render={<Link href="/favorite">收藏</Link>} />
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
        {/* <nav className="topnav" aria-label="主导航">
          <NavBtn on={tabIs('home')} onClick={() => go('home')} aria-current={tabIs('home') || undefined}>
            发现
          </NavBtn>
          <NavBtn on={tabIs('pantry')} onClick={() => go('pantry')}>
            食材
          </NavBtn>
          <NavBtn on={tabIs('chat')} onClick={() => go('chat')}>
            Agent
          </NavBtn>
          <NavBtn on={tabIs('saved')} onClick={() => go('saved')}>
            收藏
          </NavBtn>
        </nav> */}
        <div style={{ display: 'flex', gap: 8 }}></div>
      </header>
      <main>
        <section className="pt-(--nav-h) px-0 pb-24 md:max-w-(--shell-w) md:m-auto md:pb-14">{children}</section>
      </main>
    </div>
  )
}

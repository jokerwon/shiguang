import { MainNav } from '@/components/main-nav'

export default function ScreenLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="min-h-full">
      <header
        className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between h-(--nav-h) bg-background backdrop-blur-md border-b border-border"
        style={{ paddingInline: 'max(var(--gap-md), calc((100vw - var(--shell-w)) / 2 + var(--gap-md)))' }}
      >
        <div className="text-lg font-bold">
          {/* <LogoMark /> */}
          食光
        </div>
        <MainNav />
        <div style={{ display: 'flex', gap: 8 }}></div>
      </header>
      <main>
        <section className="pt-(--nav-h) px-0 pb-24 md:max-w-(--shell-w) md:m-auto md:pb-14">{children}</section>
      </main>
    </div>
  )
}

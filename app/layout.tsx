import type { Metadata } from 'next'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppNav } from '@/components/app-nav'
import './globals.css'

export const metadata: Metadata = {
  title: '食光 - 记录每一刻的美味',
  description: '通过自然对话管理你的饮食生活',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased min-h-screen warm-gradient paper-texture">
        <TooltipProvider>
          <div className="pb-20 md:pt-20 md:pb-0">
            {children}
          </div>
          <AppNav />
        </TooltipProvider>
      </body>
    </html>
  )
}

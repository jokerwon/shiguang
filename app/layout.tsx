import type { Metadata } from 'next'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

export const metadata: Metadata = {
  title: '食光',
  description: '记录每一刻的美味',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased h-screen">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}

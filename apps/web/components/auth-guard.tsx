'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/use-auth'

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !user) {
      const target = pathname ? `?redirect=${encodeURIComponent(pathname)}` : ''
      router.replace(`/login${target}`)
    }
  }, [loading, user, router, pathname])

  // 会话恢复中 — 显示 loading
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 size={32} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  // 未认证 — 显示空白，等待重定向
  if (!user) {
    return null
  }

  return <>{children}</>
}

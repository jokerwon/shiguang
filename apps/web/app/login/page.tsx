'use client'

import { SyntheticEvent, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CircleX, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/use-auth'
import LogoIcon from '@/components/logo'
import { Alert, AlertTitle } from '@/components/ui/alert'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading, login, register } = useAuth()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const redirectTo = searchParams.get('redirect') ?? '/'

  // 已登录用户直接跳转
  useEffect(() => {
    if (!loading && user) {
      router.replace(redirectTo)
    }
  }, [loading, user, router, redirectTo])

  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, password, displayName || undefined)
      }
      router.push(redirectTo)
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  // 会话恢复中 — 显示 loading
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 size={32} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  // 已登录 — 空白，等待重定向
  if (user) {
    return null
  }

  const toggleMode = () => {
    setMode((prev) => (prev === 'login' ? 'register' : 'login'))
    setError('')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <Link href="/" className="mb-8 flex flex-col items-center gap-2 text-center">
          <LogoIcon background className="size-12" />
          <span className="text-xl font-bold tracking-tight">食光</span>
        </Link>

        {/* Card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="mb-1 text-[19px] font-bold tracking-tight">{mode === 'login' ? '欢迎回来' : '创建账号'}</h1>
          <p className="mb-5 text-[13px] text-muted-foreground">{mode === 'login' ? '登录你的食光账号' : '注册后即可收藏菜谱、管理食材'}</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === 'register' && (
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">昵称</span>
                <Input placeholder="你的昵称" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </label>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">邮箱</span>
              <Input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">密码</span>
              <Input type="password" required minLength={6} placeholder="至少 6 位密码" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>

            {error && (
              <Alert className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                <CircleX />
                <AlertTitle>{error}</AlertTitle>
              </Alert>
            )}

            <Button type="submit" disabled={submitting} className="mt-1 w-full">
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {mode === 'login' ? '登录' : '注册'}
            </Button>
          </form>

          <p className="mt-4 text-center text-[13px] text-muted-foreground">
            {mode === 'login' ? '还没有账号？' : '已有账号？'}
            <button type="button" onClick={toggleMode} className="ml-1 font-medium text-primary hover:underline">
              {mode === 'login' ? '立即注册' : '去登录'}
            </button>
          </p>
        </div>

        <p className="mt-6 text-center text-[12px] text-muted-foreground">点击登录即表示同意我们的服务条款和隐私政策</p>
      </div>
    </div>
  )
}

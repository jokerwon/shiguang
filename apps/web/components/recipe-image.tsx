'use client'

import * as React from 'react'
import Image from 'next/image'
import type { Recipe } from '@/lib/recipes'
import { cn } from '@/lib/utils'

/* 占位符视觉（ADR-0003）：首字 + 菜系配色。
   五个菜系各有专属渐变与前景色，无图/断图时不再是千篇一律的灰块。 */
const CUISINE_THEME: Record<string, { from: string; to: string; fg: string }> = {
  home: { from: 'oklch(0.93 0.06 78)', to: 'oklch(0.85 0.11 58)', fg: 'oklch(0.52 0.12 55)' }, // 家常 · 暖橙
  western: { from: 'oklch(0.93 0.045 50)', to: 'oklch(0.84 0.09 38)', fg: 'oklch(0.5 0.12 38)' }, // 西餐 · 砖红
  japanese: { from: 'oklch(0.93 0.03 262)', to: 'oklch(0.84 0.06 256)', fg: 'oklch(0.48 0.1 268)' }, // 日料 · 靛蓝
  sichuan: { from: 'oklch(0.92 0.05 30)', to: 'oklch(0.83 0.11 26)', fg: 'oklch(0.5 0.16 27)' }, // 川菜 · 辣椒红
  light: { from: 'oklch(0.94 0.05 158)', to: 'oklch(0.86 0.09 150)', fg: 'oklch(0.5 0.1 155)' }, // 轻食 · 青绿
}

const FALLBACK_THEME = {
  from: 'var(--primary-soft)',
  to: 'color-mix(in oklch, var(--foreground) 6%, transparent)',
  fg: 'var(--muted-foreground)',
}

function Placeholder({ r, hero, className }: { r: Recipe; hero: boolean; className?: string }) {
  const theme = CUISINE_THEME[r.cuisine] ?? FALLBACK_THEME
  return (
    <div
      aria-label={r.name}
      className={cn('grid h-full w-full place-items-center', className)}
      style={{ backgroundImage: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}
    >
      <span
        className={cn('font-bold tracking-tight', hero ? 'text-7xl' : 'text-4xl')}
        style={{ color: theme.fg }}
      >
        {r.name[0]}
      </span>
    </div>
  )
}

/**
 * 菜谱图片：有图显示图（onError 回退占位符），无图显示首字占位符。
 * variant='card' — 卡片内 fill（父容器需 relative + 定高宽比）
 * variant='hero' — 详情页头图（aspect-4/3，桌面 21/9）
 */
export function RecipeImage({
  r,
  variant = 'card',
  className,
}: {
  r: Recipe
  variant?: 'card' | 'hero'
  className?: string
}) {
  const [err, setErr] = React.useState(false)
  const hero = variant === 'hero'

  if (!r.img || err) {
    return (
      <Placeholder
        r={r}
        hero={hero}
        className={hero ? cn('aspect-4/3 w-full md:aspect-21/9', className) : className}
      />
    )
  }

  if (hero) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={r.img}
        alt={r.name}
        onError={() => setErr(true)}
        className={cn('aspect-4/3 w-full object-cover md:aspect-21/9', className)}
      />
    )
  }

  return (
    <Image
      fill
      src={r.img}
      alt={r.name}
      sizes="(max-width: 640px) 50vw, 220px"
      loading="lazy"
      onError={() => setErr(true)}
      className={cn('h-full w-full object-cover', className)}
    />
  )
}

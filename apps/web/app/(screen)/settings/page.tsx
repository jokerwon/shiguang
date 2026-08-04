'use client'

import * as React from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePreferences } from '@/lib/use-preferences'
import type { HealthGoal } from '@/lib/api'
import { cn } from '@/lib/utils'

const HEALTH_GOALS: { value: HealthGoal; label: string; hint: string }[] = [
  { value: 'BALANCED', label: '均衡', hint: '不特别偏向' },
  { value: 'FAT_LOSS', label: '减脂', hint: '低卡低碳优先' },
  { value: 'MUSCLE_GAIN', label: '增肌', hint: '高蛋白优先' },
]

export default function SettingsScreen() {
  const { prefs, update, isLoading } = usePreferences()

  // 本地草稿：保存前不写入服务端
  const [disliked, setDisliked] = React.useState<string[]>([])
  const [allergens, setAllergens] = React.useState<string[]>([])
  const [goal, setGoal] = React.useState<HealthGoal>('BALANCED')
  const [saving, setSaving] = React.useState(false)
  const [savedAt, setSavedAt] = React.useState(false)

  // 服务端数据到达后同步进草稿（仅一次：数据从 undefined 变为有值时）
  const hydrated = React.useRef(false)
  React.useEffect(() => {
    if (!isLoading && !hydrated.current) {
      hydrated.current = true
      setDisliked(prefs.dislikedIngredients)
      setAllergens(prefs.allergens)
      setGoal(prefs.healthGoal)
    }
  }, [isLoading, prefs])

  const dirty =
    disliked.join('') !== prefs.dislikedIngredients.join('') ||
    allergens.join('') !== prefs.allergens.join('') ||
    goal !== prefs.healthGoal

  const save = async () => {
    setSaving(true)
    try {
      await update({
        dislikedIngredients: disliked,
        allergens,
        healthGoal: goal,
      })
      setSavedAt(true)
      setTimeout(() => setSavedAt(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mx-auto max-w-xl pb-4 animate-in fade-in slide-in-from-bottom-1.5 duration-200">
      <div className="px-4 pb-2 pt-6">
        <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">个性化 · 推荐偏好</span>
        <h2 className="mt-1 text-[clamp(22px,2.8vw,30px)] font-bold tracking-tight">我的偏好</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          用于首页推荐与 AI 对话：忌口和过敏原会被硬过滤，健康目标影响排序。
        </p>
      </div>

      <div className="space-y-8 p-4">
        <ChipEditor
          title="忌口食材"
          desc="不吃的食材，含它们的菜谱不会出现"
          placeholder="如 香菜、动物内脏"
          items={disliked}
          onChange={setDisliked}
        />

        <ChipEditor
          title="过敏原"
          desc="比忌口更严格，同样会被完全排除"
          placeholder="如 花生、虾"
          items={allergens}
          onChange={setAllergens}
        />

        <div>
          <h3 className="text-[15px] font-bold">健康目标</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">影响推荐排序，不做硬过滤</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {HEALTH_GOALS.map((g) => (
              <button
                key={g.value}
                type="button"
                aria-pressed={goal === g.value}
                onClick={() => setGoal(g.value)}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-center transition-colors',
                  goal === g.value
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-background hover:border-foreground',
                )}
              >
                <span className="block text-[14px] font-medium">{g.label}</span>
                <span className={cn('mt-0.5 block text-[11px]', goal === g.value ? 'opacity-70' : 'text-muted-foreground')}>
                  {g.hint}
                </span>
              </button>
            ))}
          </div>
        </div>

        <Button onClick={save} disabled={!dirty || saving || isLoading} className="w-full">
          {savedAt ? (
            <>
              <Check size={16} /> 已保存
            </>
          ) : saving ? (
            '保存中…'
          ) : (
            '保存'
          )}
        </Button>
      </div>
    </section>
  )
}

/** 标签式列表编辑：回车/点按钮添加，点 chip 移除（交互仿 pantry 页） */
function ChipEditor({
  title,
  desc,
  placeholder,
  items,
  onChange,
}: {
  title: string
  desc: string
  placeholder: string
  items: string[]
  onChange: (next: string[]) => void
}) {
  const [field, setField] = React.useState('')

  const add = () => {
    const v = field.trim()
    if (v && !items.includes(v)) onChange([...items, v])
    setField('')
  }

  return (
    <div>
      <h3 className="text-[15px] font-bold">{title}</h3>
      <p className="mt-0.5 text-[13px] text-muted-foreground">{desc}</p>
      <div className="mt-3 flex gap-2">
        <Input
          placeholder={placeholder}
          value={field}
          onChange={(e) => setField(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
        />
        <Button variant="outline" onClick={add} className="px-4">
          添加
        </Button>
      </div>
      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <button
              key={item}
              type="button"
              aria-label={`移除 ${item}`}
              onClick={() => onChange(items.filter((x) => x !== item))}
              className="inline-flex items-center gap-1.5 rounded-full border border-foreground bg-foreground px-3.5 py-1.5 text-[13px] font-medium text-background"
            >
              {item}
              <span aria-hidden className="opacity-50">✕</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

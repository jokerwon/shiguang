'use client'

import * as React from 'react'
import { useSWRConfig } from 'swr'
import {
  fetchPreferences,
  updatePreferences,
  type PreferenceInput,
} from '@/lib/api'

/**
 * update_preferences 草稿的确认卡片（Phase 3 E 验收，ADR-0012）。
 * 草稿 = 操作集：add 并集 / remove 差集 / healthGoal 覆盖。
 * 「确认」= 读**当前**偏好（fetchPreferences，不用草稿快照）→ apply 操作集 →
 * PUT /preferences 全量三字段 → mutate('/preferences')。对并行修改鲁棒（决策 3）。
 * 「取消」= 会话内标记已取消，不落库。确认/取消状态只活在当前页面会话内（决策 2）。
 * readOnly（历史消息/刷新后）：显示「该草稿已过期」，操作入口锁定。
 */

type HealthGoal = 'BALANCED' | 'FAT_LOSS' | 'MUSCLE_GAIN'

interface PreferenceDraft {
  addDisliked?: string[]
  removeDisliked?: string[]
  addAllergens?: string[]
  removeAllergens?: string[]
  setHealthGoal?: HealthGoal
}

interface PreferenceSnapshot {
  dislikedIngredients: string[]
  allergens: string[]
  healthGoal: HealthGoal
}

interface ConfirmCardProps {
  output?: unknown
  readOnly?: boolean
}

type Status = 'pending' | 'confirmed' | 'cancelled'

const HEALTH_GOAL_LABELS: Record<HealthGoal, string> = {
  BALANCED: '均衡',
  FAT_LOSS: '减脂',
  MUSCLE_GAIN: '增肌',
}

/** 按操作集合并出全量三字段（对服务器当前偏好 apply，不用草稿快照） */
function applyDraft(
  draft: PreferenceDraft,
  current: PreferenceSnapshot,
): PreferenceInput {
  const add = (list: string[], incoming?: string[]) => [
    ...new Set([...list, ...(incoming ?? [])]),
  ]
  const remove = (list: string[], outgoing?: string[]) =>
    list.filter((x) => !(outgoing ?? []).includes(x))
  return {
    dislikedIngredients: remove(
      add(current.dislikedIngredients, draft.addDisliked),
      draft.removeDisliked,
    ),
    allergens: remove(add(current.allergens, draft.addAllergens), draft.removeAllergens),
    healthGoal: draft.setHealthGoal ?? current.healthGoal,
  }
}

interface DiffRow {
  label: string
  text: string
  tone: 'add' | 'remove' | 'warn' | 'goal'
}

const TONE_CLASS: Record<DiffRow['tone'], string> = {
  add: 'text-emerald-600 dark:text-emerald-400',
  remove: 'text-muted-foreground',
  warn: 'text-amber-600 dark:text-amber-400',
  goal: 'text-primary',
}

export function ChatConfirmCard({ output, readOnly }: ConfirmCardProps) {
  const { mutate } = useSWRConfig()
  const [status, setStatus] = React.useState<Status>('pending')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const out = (output ?? {}) as {
    draft?: PreferenceDraft
    current?: PreferenceSnapshot
    note?: string
  }
  const draft = out.draft ?? {}
  const current = out.current

  const handleConfirm = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      // 读-apply-PUT：以服务器当前偏好为基准（ADR-0012 决策 3）
      const fresh = await fetchPreferences()
      const next = applyDraft(draft, fresh)
      const result = await updatePreferences(next)
      await mutate('/preferences', result, { revalidate: false })
      setStatus('confirmed')
    } catch (e) {
      setError(e instanceof Error ? e.message : '确认失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  // 历史消息（刷新后）：只读提示，不渲染操作
  if (readOnly) {
    return (
      <div className="my-1 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[13px] text-muted-foreground">
        该草稿已过期，请再告诉我一次。
      </div>
    )
  }

  const rows: DiffRow[] = []
  if (draft.addDisliked?.length)
    rows.push({ label: '新增忌口', text: draft.addDisliked.join('、'), tone: 'add' })
  if (draft.removeDisliked?.length)
    rows.push({ label: '解除忌口', text: draft.removeDisliked.join('、'), tone: 'remove' })
  if (draft.addAllergens?.length)
    rows.push({ label: '新增过敏原', text: draft.addAllergens.join('、'), tone: 'add' })
  if (draft.removeAllergens?.length)
    rows.push({ label: '解除过敏原', text: draft.removeAllergens.join('、'), tone: 'warn' })
  if (draft.setHealthGoal) {
    const before = current?.healthGoal ?? 'BALANCED'
    rows.push({
      label: '健康目标',
      text: `${HEALTH_GOAL_LABELS[before] ?? before} → ${HEALTH_GOAL_LABELS[draft.setHealthGoal] ?? draft.setHealthGoal}`,
      tone: 'goal',
    })
  }

  return (
    <div className="my-1 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[13px]">
      <div className="mb-1.5 font-medium text-foreground">偏好变更待确认</div>

      {out.note && (
        <p className="mb-1.5 text-muted-foreground">{out.note}</p>
      )}

      {rows.length > 0 && (
        <ul className="mb-2 space-y-1">
          {rows.map((r) => (
            <li key={r.label} className="flex gap-2">
              <span className="shrink-0 text-muted-foreground">{r.label}</span>
              <span className={TONE_CLASS[r.tone]}>{r.text}</span>
            </li>
          ))}
        </ul>
      )}

      {status === 'pending' && (
        <>
          {error && <p className="mb-2 text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="rounded-md bg-primary px-3 py-1 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? '确认中…' : '确认'}
            </button>
            <button
              type="button"
              onClick={() => setStatus('cancelled')}
              disabled={busy}
              className="rounded-md px-3 py-1 font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              取消
            </button>
          </div>
        </>
      )}

      {status === 'confirmed' && (
        <p className="font-medium text-emerald-600 dark:text-emerald-400">已生效</p>
      )}
      {status === 'cancelled' && (
        <p className="text-muted-foreground">已取消</p>
      )}
    </div>
  )
}

'use client'

import * as React from 'react'
import { ShoppingBasket } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { usePantry } from '@/lib/use-pantry'
import { missingIngredients, type Recipe } from '@/lib/recipes'
import { cn } from '@/lib/utils'

/**
 * 缺料购物清单（ADR-0007）：详情页即时快照。
 * 缺料 = 菜谱食材 − pantry（纯函数，pantry 变化自动重算）；
 * 勾选状态不持久化，关闭浮层即重置。
 */
export function ShoppingListDialog({ recipe }: { recipe: Recipe }) {
  const { pantry } = usePantry()
  const [open, setOpen] = React.useState(false)
  const [checked, setChecked] = React.useState<ReadonlySet<string>>(new Set())

  const missing = missingIngredients(recipe, pantry)

  const toggle = (name: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setChecked(new Set()) // 关闭即重置勾选
      }}
    >
      <Button variant="outline" className="flex-2" onClick={() => setOpen(true)}>
        <ShoppingBasket size={18} />
        {missing.length > 0 ? `缺料清单 · ${missing.length}` : '食材齐全'}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>缺料清单</DialogTitle>
        </DialogHeader>
        {missing.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            食材齐全，可以直接开做 🎉
          </p>
        ) : (
          <>
            <p className="text-[13px] text-muted-foreground">
              你的食材清单里还缺 {missing.length} 样，勾掉已买到的：
            </p>
            <ul className="mt-1 flex flex-col">
              {missing.map((i) => {
                const done = checked.has(i.name)
                return (
                  <li key={i.name}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={done}
                      onClick={() => toggle(i.name)}
                      className="flex w-full items-center gap-3 border-b border-border py-2.5 text-left text-sm last:border-b-0"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'grid size-5 shrink-0 place-items-center rounded border transition-colors',
                          done
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-border bg-background',
                        )}
                      >
                        {done ? '✓' : ''}
                      </span>
                      <span
                        className={cn(
                          'flex-1 transition-colors',
                          done && 'text-muted-foreground line-through',
                        )}
                      >
                        {i.name}
                      </span>
                      <span className="font-mono text-[13px] text-muted-foreground">
                        {i.amount}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

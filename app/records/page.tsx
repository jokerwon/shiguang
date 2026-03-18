'use client'

import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useState } from 'react'

// 模拟饮食记录数据
const mockRecords = [
  {
    id: '1',
    date: '2024-03-16',
    meals: [
      {
        type: '早餐',
        time: '08:30',
        items: ['牛奶', '面包', '鸡蛋'],
        calories: 350,
      },
      {
        type: '午餐',
        time: '12:15',
        items: ['番茄炒蛋', '米饭', '青菜'],
        calories: 580,
      },
      {
        type: '晚餐',
        time: '18:45',
        items: ['清蒸鱼', '米饭', '炒豆角'],
        calories: 620,
      },
    ],
    totalCalories: 1550,
  },
  {
    id: '2',
    date: '2024-03-15',
    meals: [
      {
        type: '早餐',
        time: '07:50',
        items: ['豆浆', '包子'],
        calories: 280,
      },
      {
        type: '午餐',
        time: '12:30',
        items: ['宫保鸡丁', '米饭', '凉拌黄瓜'],
        calories: 650,
      },
      {
        type: '晚餐',
        time: '19:00',
        items: ['红烧排骨', '米饭', '西兰花'],
        calories: 720,
      },
    ],
    totalCalories: 1650,
  },
]

export default function RecordsPage() {
  const [selectedDate, setSelectedDate] = useState(0)

  const currentRecord = mockRecords[selectedDate]

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl page-enter">
      {/* 页面标题 */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center ink-brush">
            <CalendarDaysIcon className="size-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">饮食记录</h1>
            <p className="text-sm text-muted-foreground">回顾你的饮食习惯</p>
          </div>
        </div>
      </div>

      {/* 日期切换器 */}
      <div className="mb-6 flex items-center justify-between bg-card/50 backdrop-blur-sm rounded-2xl border border-border p-4">
        <button
          onClick={() => setSelectedDate(Math.min(selectedDate + 1, mockRecords.length - 1))}
          disabled={selectedDate === mockRecords.length - 1}
          className="p-2 rounded-lg hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeftIcon className="size-5" />
        </button>

        <div className="text-center">
          <p className="text-lg font-serif font-semibold text-foreground">
            {currentRecord.date}
          </p>
          <p className="text-sm text-muted-foreground font-serif">
            总热量: {currentRecord.totalCalories} kcal
          </p>
        </div>

        <button
          onClick={() => setSelectedDate(Math.max(selectedDate - 1, 0))}
          disabled={selectedDate === 0}
          className="p-2 rounded-lg hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRightIcon className="size-5" />
        </button>
      </div>

      {/* 餐食列表 */}
      <div className="space-y-4">
        {currentRecord.meals.map((meal, index) => (
          <div
            key={index}
            className="note-card p-5 rounded-2xl decorative-border"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-xl font-serif font-semibold text-foreground mb-1">
                  {meal.type}
                </h3>
                <p className="text-sm text-muted-foreground font-serif">{meal.time}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-serif font-bold text-primary">
                  {meal.calories}
                </p>
                <p className="text-xs text-muted-foreground">kcal</p>
              </div>
            </div>

            <div className="border-t border-border/50 pt-3">
              <p className="text-xs text-muted-foreground mb-2 font-serif">食物清单:</p>
              <div className="flex flex-wrap gap-2">
                {meal.items.map((item, i) => (
                  <span
                    key={i}
                    className="px-3 py-1.5 text-sm bg-secondary/30 text-secondary-foreground rounded-lg font-serif"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 统计信息 */}
      <div className="mt-8 grid grid-cols-3 gap-4">
        <div className="note-card p-4 rounded-xl text-center">
          <p className="text-3xl font-serif font-bold text-primary mb-1">3</p>
          <p className="text-xs text-muted-foreground font-serif">餐次</p>
        </div>
        <div className="note-card p-4 rounded-xl text-center">
          <p className="text-3xl font-serif font-bold text-primary mb-1">
            {currentRecord.meals.reduce((sum, meal) => sum + meal.items.length, 0)}
          </p>
          <p className="text-xs text-muted-foreground font-serif">食物种类</p>
        </div>
        <div className="note-card p-4 rounded-xl text-center">
          <p className="text-3xl font-serif font-bold text-primary mb-1">
            {currentRecord.totalCalories}
          </p>
          <p className="text-xs text-muted-foreground font-serif">总热量(kcal)</p>
        </div>
      </div>

      {/* 提示信息 */}
      <div className="mt-8 text-center">
        <div className="inline-block note-card px-6 py-4 rounded-xl">
          <p className="text-sm text-muted-foreground font-serif">
            📝 通过对话记录饮食,这里可以查看历史记录
          </p>
        </div>
      </div>
    </div>
  )
}

'use client'

import { BookOpenIcon, SearchIcon, FilterIcon } from 'lucide-react'
import { useState } from 'react'

// 模拟菜品数据
const mockRecipes = [
  {
    id: '1',
    name: '番茄炒蛋',
    ingredients: ['番茄', '鸡蛋', '葱'],
    calories: 250,
    tags: ['家常菜', '快手菜'],
    lastCooked: '2024-03-15',
  },
  {
    id: '2',
    name: '红烧排骨',
    ingredients: ['排骨', '生抽', '老抽', '料酒'],
    calories: 450,
    tags: ['硬菜', '宴客菜'],
    lastCooked: '2024-03-10',
  },
  {
    id: '3',
    name: '清炒时蔬',
    ingredients: ['青菜', '蒜'],
    calories: 80,
    tags: ['素菜', '健康'],
    lastCooked: '2024-03-16',
  },
  {
    id: '4',
    name: '宫保鸡丁',
    ingredients: ['鸡胸肉', '花生', '干辣椒'],
    calories: 380,
    tags: ['川菜', '下饭菜'],
    lastCooked: '2024-03-12',
  },
]

export default function RecipesPage() {
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl page-enter">
      {/* 页面标题 */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center ink-brush">
            <BookOpenIcon className="size-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">菜品库</h1>
            <p className="text-sm text-muted-foreground">浏览和管理你的菜品收藏</p>
          </div>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="mb-6 flex gap-3">
        <div className="flex-1 relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索菜品..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 font-serif"
          />
        </div>
        <button className="px-4 py-2.5 bg-card border border-border rounded-xl hover:bg-primary/5 transition-colors flex items-center gap-2">
          <FilterIcon className="size-4" />
          <span className="font-serif">筛选</span>
        </button>
      </div>

      {/* 菜品网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockRecipes.map((recipe) => (
          <div
            key={recipe.id}
            className="note-card p-5 rounded-2xl hover:shadow-lg transition-all cursor-pointer group decorative-border"
          >
            {/* 菜品名称 */}
            <h3 className="text-xl font-serif font-semibold text-foreground mb-3 group-hover:text-primary transition-colors">
              {recipe.name}
            </h3>

            {/* 标签 */}
            <div className="flex flex-wrap gap-2 mb-3">
              {recipe.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 text-xs font-serif bg-primary/10 text-primary rounded-lg"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* 食材 */}
            <div className="mb-3">
              <p className="text-xs text-muted-foreground mb-1 font-serif">主要食材:</p>
              <p className="text-sm text-foreground font-serif">
                {recipe.ingredients.join('、')}
              </p>
            </div>

            {/* 底部信息 */}
            <div className="flex items-center justify-between pt-3 border-t border-border/50">
              <div className="text-sm">
                <span className="text-muted-foreground font-serif">热量: </span>
                <span className="text-foreground font-semibold font-serif">{recipe.calories}</span>
                <span className="text-muted-foreground text-xs ml-0.5">kcal</span>
              </div>
              <div className="text-xs text-muted-foreground font-serif">
                最近: {recipe.lastCooked}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 提示信息 */}
      <div className="mt-8 text-center">
        <div className="inline-block note-card px-6 py-4 rounded-xl">
          <p className="text-sm text-muted-foreground font-serif">
            💡 通过对话添加新菜品,或者在这里查看和管理已有的菜品
          </p>
        </div>
      </div>
    </div>
  )
}

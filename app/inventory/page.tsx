'use client'

import { PackageIcon, SearchIcon, AlertCircleIcon } from 'lucide-react'
import { useState } from 'react'

// 模拟库存数据
const mockInventory = [
  {
    id: '1',
    name: '鸡蛋',
    quantity: 12,
    unit: '个',
    category: '蛋奶',
    expiryDate: '2024-03-25',
    daysLeft: 9,
  },
  {
    id: '2',
    name: '牛奶',
    quantity: 2,
    unit: '盒',
    category: '蛋奶',
    expiryDate: '2024-03-20',
    daysLeft: 4,
  },
  {
    id: '3',
    name: '番茄',
    quantity: 6,
    unit: '个',
    category: '蔬菜',
    expiryDate: '2024-03-18',
    daysLeft: 2,
  },
  {
    id: '4',
    name: '排骨',
    quantity: 500,
    unit: 'g',
    category: '肉类',
    expiryDate: '2024-03-17',
    daysLeft: 1,
  },
  {
    id: '5',
    name: '大米',
    quantity: 5,
    unit: 'kg',
    category: '主食',
    expiryDate: '2024-12-31',
    daysLeft: 290,
  },
  {
    id: '6',
    name: '青菜',
    quantity: 3,
    unit: '把',
    category: '蔬菜',
    expiryDate: '2024-03-19',
    daysLeft: 3,
  },
]

const categories = ['全部', '蔬菜', '肉类', '蛋奶', '主食']

export default function InventoryPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('全部')

  const filteredInventory = mockInventory.filter((item) => {
    const matchesSearch = item.name.includes(searchQuery)
    const matchesCategory = selectedCategory === '全部' || item.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const expiringItems = mockInventory.filter((item) => item.daysLeft <= 3)

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl page-enter">
      {/* 页面标题 */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center ink-brush">
            <PackageIcon className="size-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">库存管理</h1>
            <p className="text-sm text-muted-foreground">查看你的食材库存</p>
          </div>
        </div>
      </div>

      {/* 即将过期提醒 */}
      {expiringItems.length > 0 && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-2xl">
          <div className="flex items-start gap-3">
            <AlertCircleIcon className="size-5 text-destructive mt-0.5 shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-serif font-semibold text-foreground mb-2">即将过期食材</h3>
              <div className="flex flex-wrap gap-2">
                {expiringItems.map((item) => (
                  <span key={item.id} className="px-3 py-1 text-sm bg-background/80 rounded-lg font-serif">
                    {item.name} ({item.daysLeft}天后过期)
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 搜索和筛选 */}
      <div className="mb-6 space-y-3">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索食材..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 font-serif"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-xl font-serif whitespace-nowrap transition-all ${
                selectedCategory === category ? 'bg-primary text-primary-foreground' : 'bg-card border border-border hover:bg-primary/5'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* 库存网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredInventory.map((item) => {
          const isExpiring = item.daysLeft <= 3
          const isUrgent = item.daysLeft <= 1

          return (
            <div key={item.id} className={`note-card p-5 rounded-2xl transition-all decorative-border ${isUrgent ? 'border-destructive/50 bg-destructive/5' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-xl font-serif font-semibold text-foreground mb-1">{item.name}</h3>
                  <span className="inline-block px-2 py-0.5 text-xs bg-secondary/50 text-secondary-foreground rounded font-serif">{item.category}</span>
                </div>
                {isExpiring && <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />}
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground font-serif">数量:</span>
                  <span className="text-base font-serif font-semibold text-foreground">
                    {item.quantity} {item.unit}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground font-serif">保质期:</span>
                  <span className={`text-sm font-serif ${isUrgent ? 'text-destructive font-semibold' : isExpiring ? 'text-destructive/80' : 'text-foreground'}`}>{item.daysLeft} 天后</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 统计信息 */}
      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="note-card p-4 rounded-xl text-center">
          <p className="text-3xl font-serif font-bold text-primary mb-1">{mockInventory.length}</p>
          <p className="text-xs text-muted-foreground font-serif">食材种类</p>
        </div>
        <div className="note-card p-4 rounded-xl text-center">
          <p className="text-3xl font-serif font-bold text-primary mb-1">{categories.length - 1}</p>
          <p className="text-xs text-muted-foreground font-serif">分类数</p>
        </div>
        <div className="note-card p-4 rounded-xl text-center">
          <p className="text-3xl font-serif font-bold text-destructive mb-1">{expiringItems.length}</p>
          <p className="text-xs text-muted-foreground font-serif">即将过期</p>
        </div>
        <div className="note-card p-4 rounded-xl text-center">
          <p className="text-3xl font-serif font-bold text-primary mb-1">92%</p>
          <p className="text-xs text-muted-foreground font-serif">新鲜度</p>
        </div>
      </div>

      {/* 提示信息 */}
      <div className="mt-8 text-center">
        <div className="inline-block note-card px-6 py-4 rounded-xl">
          <p className="text-sm text-muted-foreground font-serif">🥬 通过对话添加食材,系统会自动追踪保质期</p>
        </div>
      </div>
    </div>
  )
}

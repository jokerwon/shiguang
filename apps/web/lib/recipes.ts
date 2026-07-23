export interface Recipe {
  id: string
  name: string
  cuisine: string
  time: number
  kcal: number
  img: string
  tags: string[]
  ingredients: string[]
  steps: string[]
  desc: string
}

export const RECIPES: Recipe[] = [
  { id: 'r1', name: '番茄罗勒意面', cuisine: '西餐', time: 25, kcal: 520, img: '/assets/pasta.png',
    tags: ['素食', '快手'], ingredients: ['意面', '番茄', '罗勒', '大蒜', '橄榄油', '盐', '黑胡椒'],
    steps: ['烧一锅水加盐煮意面至弹牙', '同时热橄榄油爆香蒜片', '下番茄丁炒至出汁', '拌入煮好的意面与罗勒', '撒盐与黑胡椒调味'],
    desc: '最经典的意面之一，番茄与罗勒的组合永远不出错。' },
  { id: 'r2', name: '香煎三文鱼配时蔬', cuisine: '西餐', time: 20, kcal: 480, img: '/assets/salmon.jpg',
    tags: ['高蛋白', '低碳'], ingredients: ['三文鱼', '芦笋', '柠檬', '橄榄油', '盐', '黑胡椒'],
    steps: ['三文鱼擦干、两面撒盐黑胡椒', '热锅少油鱼皮朝下煎脆', '翻面煎至中心半熟', '芦笋另锅快炒至断生', '挤柠檬汁装盘'],
    desc: '高蛋白低碳的一餐，鱼皮煎脆是关键。' },
  { id: 'r3', name: '日式咖喱鸡饭', cuisine: '日料', time: 35, kcal: 640, img: '/assets/curry.jpg',
    tags: ['治愈系'], ingredients: ['鸡腿肉', '土豆', '胡萝卜', '洋葱', '咖喱块', '米饭'],
    steps: ['鸡肉切块焯水去腥', '洋葱炒香至透明', '下土豆胡萝卜翻炒', '加水煮至蔬菜软烂', '关火放入咖喱块融化，浇在米饭上'],
    desc: '浓郁暖胃，剩一锅第二天更入味。' },
  { id: 'r4', name: '藜麦牛油果碗', cuisine: '轻食', time: 15, kcal: 410, img: '/assets/bowl.jpg',
    tags: ['素食', '高蛋白', '低卡'], ingredients: ['藜麦', '牛油果', '鹰嘴豆', '菠菜', '柠檬', '橄榄油'],
    steps: ['藜麦煮熟沥干', '鹰嘴豆与菠菜快速焯烫', '所有食材码入碗中', '牛油果切片摆上', '淋柠檬汁与橄榄油'],
    desc: '一碗补齐碳水、蛋白与健康脂肪。' },
  { id: 'r5', name: '西红柿炒鸡蛋', cuisine: '家常', time: 10, kcal: 300, img: '',
    tags: ['快手', '家常'], ingredients: ['西红柿', '鸡蛋', '葱', '盐', '糖', '食用油'],
    steps: ['鸡蛋打散炒熟盛出', '西红柿切块下锅炒至出汁', '加少许糖提鲜', '倒回鸡蛋翻炒均匀', '撒葱花出锅'],
    desc: '国民下饭菜，十分钟搞定。' },
  { id: 'r6', name: '蒜蓉蒸豆腐', cuisine: '家常', time: 18, kcal: 220, img: '',
    tags: ['素食', '低卡'], ingredients: ['嫩豆腐', '大蒜', '葱花', '酱油', '香油'],
    steps: ['豆腐切块装盘入锅蒸8分钟', '蒜蓉用热油泼香', '淋酱油与香油', '撒葱花'],
    desc: '清淡鲜嫩，减脂期友好。' },
  { id: 'r7', name: '照烧鸡腿饭', cuisine: '日料', time: 25, kcal: 560, img: '',
    tags: ['高蛋白'], ingredients: ['鸡腿肉', '酱油', '味醂', '糖', '米饭', '姜'],
    steps: ['鸡腿去骨擦干', '皮朝下煎至金黄', '翻面煎熟', '酱油味醂糖调汁收浓', '切块盖在米饭上'],
    desc: '甜咸适口，便当党最爱。' },
  { id: 'r8', name: '凯撒沙拉', cuisine: '西餐', time: 15, kcal: 380, img: '',
    tags: ['低卡', '快手'], ingredients: ['罗马生菜', '面包丁', '帕玛森芝士', '凯撒酱', '柠檬'],
    steps: ['生菜洗净沥干撕成小块', '面包切丁烤脆', '生菜拌凯撒酱', '撒面包丁与芝士碎', '挤柠檬汁'],
    desc: '清爽开胃，主食前的小仪式。' },
  { id: 'r9', name: '麻婆豆腐', cuisine: '川菜', time: 20, kcal: 340, img: '',
    tags: ['下饭'], ingredients: ['嫩豆腐', '猪肉末', '豆瓣酱', '花椒', '葱花', '蒜'],
    steps: ['豆腐切块焯水定型', '肉末炒至变色', '下豆瓣酱炒出红油', '加豆腐炖煮入味', '勾芡撒花椒面葱花'],
    desc: '麻辣鲜香烫，一碗饭不够。' },
  { id: 'r10', name: '味噌汤', cuisine: '日料', time: 12, kcal: 120, img: '',
    tags: ['低卡', '快手'], ingredients: ['味噌', '豆腐', '海带', '葱花', '裙带菜'],
    steps: ['水烧开下裙带菜与豆腐', '味噌用少量汤化开倒入', '小火不再煮沸', '撒葱花'],
    desc: '日料餐桌的暖场，三分钟。' },
  { id: 'r11', name: '土豆炖牛肉', cuisine: '家常', time: 45, kcal: 520, img: '',
    tags: ['高蛋白', '治愈系'], ingredients: ['牛腩', '土豆', '胡萝卜', '洋葱', '酱油', '八角'],
    steps: ['牛腩切块焯水', '炒香洋葱下牛肉', '加酱油与水炖40分钟', '下土豆胡萝卜炖至软烂', '收汁'],
    desc: '慢炖出味，冬天的一锅满足。' },
  { id: 'r12', name: '凉拌黄瓜', cuisine: '川菜', time: 8, kcal: 80, img: '',
    tags: ['低卡', '快手', '素食'], ingredients: ['黄瓜', '大蒜', '醋', '辣椒油', '盐'],
    steps: ['黄瓜拍裂切段', '蒜蓉与调料调汁', '拌匀冷藏10分钟更入味'],
    desc: '开胃凉菜，酸辣脆爽。' },
]

export const CUISINES = ['家常', '西餐', '日料', '川菜', '轻食']
export const PREFS = ['素食', '高蛋白', '低卡', '低碳', '快手', '下饭', '治愈系']
export const TIMES = ['≤15分钟', '≤30分钟', '不限']
export const SUGGEST_INGS = ['西红柿', '鸡蛋', '鸡肉', '豆腐', '土豆', '三文鱼', '意面', '牛油果']

export type ScreenId = 'home' | 'pantry' | 'chat' | 'saved' | 'filter' | 'detail'

export function norm(s: string) {
  return s.trim().toLowerCase()
}

export function matchScore(recipe: Recipe, pantry: string[]) {
  if (pantry.length === 0) return { score: 0, have: [] as string[] }
  const have = recipe.ingredients.filter((i) =>
    pantry.some((p) => norm(i).includes(norm(p)) || norm(p).includes(norm(i))),
  )
  return { score: Math.round((have.length / recipe.ingredients.length) * 100), have }
}

export function matchRecipes(pantry: string[]) {
  return RECIPES.map((r) => ({ r, ...matchScore(r, pantry) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.r.time - b.r.time)
}

/** 双语文本：zh 为 canonical（匹配逻辑基于 zh），en 为英文展示。 */
export interface L {
  zh: string
  en: string
}

export interface Recipe {
  id: string
  name: L
  /** 菜系 key，对应 messages 的 Cuisine 命名空间 */
  cuisine: string
  time: number
  kcal: number
  img: string
  /** 标签 key 数组，对应 messages 的 Pref 命名空间 */
  tags: string[]
  ingredients: L[]
  steps: L[]
  desc: L
}

export const RECIPES: Recipe[] = [
  { id: 'r1', name: { zh: '番茄罗勒意面', en: 'Tomato Basil Pasta' }, cuisine: 'western', time: 25, kcal: 520, img: '/assets/pasta.png',
    tags: ['vegetarian', 'quick'], ingredients: [
      { zh: '意面', en: 'Pasta' }, { zh: '番茄', en: 'Tomato' }, { zh: '罗勒', en: 'Basil' },
      { zh: '大蒜', en: 'Garlic' }, { zh: '橄榄油', en: 'Olive oil' }, { zh: '盐', en: 'Salt' }, { zh: '黑胡椒', en: 'Black pepper' },
    ],
    steps: [
      { zh: '烧一锅水加盐煮意面至弹牙', en: 'Boil salted water and cook pasta until al dente' },
      { zh: '同时热橄榄油爆香蒜片', en: 'Meanwhile, heat olive oil and sauté sliced garlic' },
      { zh: '下番茄丁炒至出汁', en: 'Add diced tomatoes and cook until juicy' },
      { zh: '拌入煮好的意面与罗勒', en: 'Toss in cooked pasta and basil' },
      { zh: '撒盐与黑胡椒调味', en: 'Season with salt and black pepper' },
    ],
    desc: { zh: '最经典的意面之一，番茄与罗勒的组合永远不出错。', en: 'A pasta classic—tomato and basil never miss.' } },
  { id: 'r2', name: { zh: '香煎三文鱼配时蔬', en: 'Pan-Seared Salmon with Veggies' }, cuisine: 'western', time: 20, kcal: 480, img: '/assets/salmon.jpg',
    tags: ['high-protein', 'low-carb'], ingredients: [
      { zh: '三文鱼', en: 'Salmon' }, { zh: '芦笋', en: 'Asparagus' }, { zh: '柠檬', en: 'Lemon' },
      { zh: '橄榄油', en: 'Olive oil' }, { zh: '盐', en: 'Salt' }, { zh: '黑胡椒', en: 'Black pepper' },
    ],
    steps: [
      { zh: '三文鱼擦干、两面撒盐黑胡椒', en: 'Pat salmon dry, season both sides with salt and pepper' },
      { zh: '热锅少油鱼皮朝下煎脆', en: 'Sear skin-side down in a hot pan until crispy' },
      { zh: '翻面煎至中心半熟', en: 'Flip and cook until center is medium' },
      { zh: '芦笋另锅快炒至断生', en: 'Quick-char asparagus in another pan' },
      { zh: '挤柠檬汁装盘', en: 'Squeeze lemon juice and plate' },
    ],
    desc: { zh: '高蛋白低碳的一餐，鱼皮煎脆是关键。', en: 'High-protein, low-carb; crispy skin is the key.' } },
  { id: 'r3', name: { zh: '日式咖喱鸡饭', en: 'Japanese Chicken Curry Rice' }, cuisine: 'japanese', time: 35, kcal: 640, img: '/assets/curry.jpg',
    tags: ['comforting'], ingredients: [
      { zh: '鸡腿肉', en: 'Chicken thigh' }, { zh: '土豆', en: 'Potato' }, { zh: '胡萝卜', en: 'Carrot' },
      { zh: '洋葱', en: 'Onion' }, { zh: '咖喱块', en: 'Curry roux' }, { zh: '米饭', en: 'Rice' },
    ],
    steps: [
      { zh: '鸡肉切块焯水去腥', en: 'Cut chicken and blanch to remove scum' },
      { zh: '洋葱炒香至透明', en: 'Sauté onion until translucent' },
      { zh: '下土豆胡萝卜翻炒', en: 'Add potato and carrot and stir-fry' },
      { zh: '加水煮至蔬菜软烂', en: 'Add water and cook until veggies are tender' },
      { zh: '关火放入咖喱块融化，浇在米饭上', en: 'Off heat, stir in curry roux; serve over rice' },
    ],
    desc: { zh: '浓郁暖胃，剩一锅第二天更入味。', en: 'Rich and warming; even better the next day.' } },
  { id: 'r4', name: { zh: '藜麦牛油果碗', en: 'Quinoa Avocado Bowl' }, cuisine: 'light', time: 15, kcal: 410, img: '/assets/bowl.jpg',
    tags: ['vegetarian', 'high-protein', 'low-cal'], ingredients: [
      { zh: '藜麦', en: 'Quinoa' }, { zh: '牛油果', en: 'Avocado' }, { zh: '鹰嘴豆', en: 'Chickpea' },
      { zh: '菠菜', en: 'Spinach' }, { zh: '柠檬', en: 'Lemon' }, { zh: '橄榄油', en: 'Olive oil' },
    ],
    steps: [
      { zh: '藜麦煮熟沥干', en: 'Cook quinoa and drain' },
      { zh: '鹰嘴豆与菠菜快速焯烫', en: 'Quick-blanch chickpeas and spinach' },
      { zh: '所有食材码入碗中', en: 'Arrange ingredients in a bowl' },
      { zh: '牛油果切片摆上', en: 'Top with sliced avocado' },
      { zh: '淋柠檬汁与橄榄油', en: 'Drizzle with lemon juice and olive oil' },
    ],
    desc: { zh: '一碗补齐碳水、蛋白与健康脂肪。', en: 'Carbs, protein and healthy fats in one bowl.' } },
  { id: 'r5', name: { zh: '西红柿炒鸡蛋', en: 'Tomato and Egg Stir-fry' }, cuisine: 'home', time: 10, kcal: 300, img: '',
    tags: ['quick', 'home'], ingredients: [
      { zh: '番茄', en: 'Tomato' }, { zh: '鸡蛋', en: 'Egg' }, { zh: '葱', en: 'Scallion' },
      { zh: '盐', en: 'Salt' }, { zh: '糖', en: 'Sugar' }, { zh: '食用油', en: 'Cooking oil' },
    ],
    steps: [
      { zh: '鸡蛋打散炒熟盛出', en: 'Beat eggs, scramble and set aside' },
      { zh: '西红柿切块下锅炒至出汁', en: 'Add chopped tomato and cook until juicy' },
      { zh: '加少许糖提鲜', en: 'Add a pinch of sugar to brighten' },
      { zh: '倒回鸡蛋翻炒均匀', en: 'Return eggs and toss' },
      { zh: '撒葱花出锅', en: 'Scatter scallions and plate' },
    ],
    desc: { zh: '国民下饭菜，十分钟搞定。', en: 'A national comfort dish done in ten minutes.' } },
  { id: 'r6', name: { zh: '蒜蓉蒸豆腐', en: 'Steamed Tofu with Garlic' }, cuisine: 'home', time: 18, kcal: 220, img: '',
    tags: ['vegetarian', 'low-cal'], ingredients: [
      { zh: '嫩豆腐', en: 'Soft tofu' }, { zh: '大蒜', en: 'Garlic' }, { zh: '葱花', en: 'Scallion' },
      { zh: '酱油', en: 'Soy sauce' }, { zh: '香油', en: 'Sesame oil' },
    ],
    steps: [
      { zh: '豆腐切块装盘入锅蒸8分钟', en: 'Steam tofu for 8 minutes' },
      { zh: '蒜蓉用热油泼香', en: 'Pour hot oil over minced garlic' },
      { zh: '淋酱油与香油', en: 'Drizzle soy and sesame oil' },
      { zh: '撒葱花', en: 'Scatter scallions' },
    ],
    desc: { zh: '清淡鲜嫩，减脂期友好。', en: 'Light and tender; diet-friendly.' } },
  { id: 'r7', name: { zh: '照烧鸡腿饭', en: 'Teriyaki Chicken Rice Bowl' }, cuisine: 'japanese', time: 25, kcal: 560, img: '',
    tags: ['high-protein'], ingredients: [
      { zh: '鸡腿肉', en: 'Chicken thigh' }, { zh: '酱油', en: 'Soy sauce' }, { zh: '味醂', en: 'Mirin' },
      { zh: '糖', en: 'Sugar' }, { zh: '米饭', en: 'Rice' }, { zh: '姜', en: 'Ginger' },
    ],
    steps: [
      { zh: '鸡腿去骨擦干', en: 'Bone and pat dry the chicken thigh' },
      { zh: '皮朝下煎至金黄', en: 'Sear skin-side down until golden' },
      { zh: '翻面煎熟', en: 'Flip and cook through' },
      { zh: '酱油味醂糖调汁收浓', en: 'Reduce soy, mirin and sugar into a glaze' },
      { zh: '切块盖在米饭上', en: 'Slice and serve over rice' },
    ],
    desc: { zh: '甜咸适口，便当党最爱。', en: 'Sweet-savory; a bento favorite.' } },
  { id: 'r8', name: { zh: '凯撒沙拉', en: 'Caesar Salad' }, cuisine: 'western', time: 15, kcal: 380, img: '',
    tags: ['low-cal', 'quick'], ingredients: [
      { zh: '罗马生菜', en: 'Romaine' }, { zh: '面包丁', en: 'Croutons' }, { zh: '帕玛森芝士', en: 'Parmesan' },
      { zh: '凯撒酱', en: 'Caesar dressing' }, { zh: '柠檬', en: 'Lemon' },
    ],
    steps: [
      { zh: '生菜洗净沥干撕成小块', en: 'Wash, dry and tear romaine into bites' },
      { zh: '面包切丁烤脆', en: 'Toast bread cubes until crisp' },
      { zh: '生菜拌凯撒酱', en: 'Toss lettuce with Caesar dressing' },
      { zh: '撒面包丁与芝士碎', en: 'Top with croutons and shaved parmesan' },
      { zh: '挤柠檬汁', en: 'Squeeze lemon' },
    ],
    desc: { zh: '清爽开胃，主食前的小仪式。', en: 'Crisp and appetizing—a pre-meal ritual.' } },
  { id: 'r9', name: { zh: '麻婆豆腐', en: 'Mapo Tofu' }, cuisine: 'sichuan', time: 20, kcal: 340, img: '',
    tags: ['rice-friendly'], ingredients: [
      { zh: '嫩豆腐', en: 'Soft tofu' }, { zh: '猪肉末', en: 'Pork mince' }, { zh: '豆瓣酱', en: 'Doubanjiang' },
      { zh: '花椒', en: 'Sichuan peppercorn' }, { zh: '葱花', en: 'Scallion' }, { zh: '蒜', en: 'Garlic' },
    ],
    steps: [
      { zh: '豆腐切块焯水定型', en: 'Blanch tofu cubes to set' },
      { zh: '肉末炒至变色', en: 'Brown the pork mince' },
      { zh: '下豆瓣酱炒出红油', en: 'Add doubanjiang and fry until oil turns red' },
      { zh: '加豆腐炖煮入味', en: 'Add tofu and simmer to absorb flavor' },
      { zh: '勾芡撒花椒面葱花', en: 'Thicken, dust with pepper and scallion' },
    ],
    desc: { zh: '麻辣鲜香烫，一碗饭不够。', en: 'Numbing, spicy and hot—one bowl isn’t enough.' } },
  { id: 'r10', name: { zh: '味噌汤', en: 'Miso Soup' }, cuisine: 'japanese', time: 12, kcal: 120, img: '',
    tags: ['low-cal', 'quick'], ingredients: [
      { zh: '味噌', en: 'Miso' }, { zh: '豆腐', en: 'Tofu' }, { zh: '海带', en: 'Kelp' },
      { zh: '葱花', en: 'Scallion' }, { zh: '裙带菜', en: 'Wakame' },
    ],
    steps: [
      { zh: '水烧开下裙带菜与豆腐', en: 'Boil water, add wakame and tofu' },
      { zh: '味噌用少量汤化开倒入', en: 'Dissolve miso in a ladle of broth, then stir in' },
      { zh: '小火不再煮沸', en: 'Keep on low heat; do not re-boil' },
      { zh: '撒葱花', en: 'Scatter scallions' },
    ],
    desc: { zh: '日料餐桌的暖场，三分钟。', en: 'A three-minute opener for any Japanese meal.' } },
  { id: 'r11', name: { zh: '土豆炖牛肉', en: 'Beef and Potato Stew' }, cuisine: 'home', time: 45, kcal: 520, img: '',
    tags: ['high-protein', 'comforting'], ingredients: [
      { zh: '牛腩', en: 'Beef brisket' }, { zh: '土豆', en: 'Potato' }, { zh: '胡萝卜', en: 'Carrot' },
      { zh: '洋葱', en: 'Onion' }, { zh: '酱油', en: 'Soy sauce' }, { zh: '八角', en: 'Star anise' },
    ],
    steps: [
      { zh: '牛腩切块焯水', en: 'Cut and blanch the brisket' },
      { zh: '炒香洋葱下牛肉', en: 'Sauté onion, add beef' },
      { zh: '加酱油与水炖40分钟', en: 'Add soy and water; simmer 40 min' },
      { zh: '下土豆胡萝卜炖至软烂', en: 'Add potato and carrot; cook until tender' },
      { zh: '收汁', en: 'Reduce the sauce' },
    ],
    desc: { zh: '慢炖出味，冬天的一锅满足。', en: 'Slow-stewed comfort for winter.' } },
  { id: 'r12', name: { zh: '凉拌黄瓜', en: 'Smashed Cucumber Salad' }, cuisine: 'sichuan', time: 8, kcal: 80, img: '',
    tags: ['low-cal', 'quick', 'vegetarian'], ingredients: [
      { zh: '黄瓜', en: 'Cucumber' }, { zh: '大蒜', en: 'Garlic' }, { zh: '醋', en: 'Vinegar' },
      { zh: '辣椒油', en: 'Chili oil' }, { zh: '盐', en: 'Salt' },
    ],
    steps: [
      { zh: '黄瓜拍裂切段', en: 'Smash and cut cucumber' },
      { zh: '蒜蓉与调料调汁', en: 'Mix garlic and seasonings into a dressing' },
      { zh: '拌匀冷藏10分钟更入味', en: 'Toss and chill 10 min for more flavor' },
    ],
    desc: { zh: '开胃凉菜，酸辣脆爽。', en: 'A tangy, spicy, crisp appetizer.' } },
]

/** 菜系 key 列表 */
export const CUISINES = ['home', 'western', 'japanese', 'sichuan', 'light']
/** 偏好/标签 key 列表 */
export const PREFS = ['vegetarian', 'high-protein', 'low-cal', 'low-carb', 'quick', 'rice-friendly', 'comforting']
/** 烹饪时间 key 列表（值由 messages 决定，匹配按 key） */
export const TIMES = ['le15', 'le30', 'any']

/** 常见食材（点选添加到 pantry）。canonical 为 zh，匹配逻辑基于 zh。 */
export const SUGGEST_INGS: L[] = [
  { zh: '西红柿', en: 'Tomato' },
  { zh: '鸡蛋', en: 'Egg' },
  { zh: '鸡肉', en: 'Chicken' },
  { zh: '豆腐', en: 'Tofu' },
  { zh: '土豆', en: 'Potato' },
  { zh: '三文鱼', en: 'Salmon' },
  { zh: '意面', en: 'Pasta' },
  { zh: '牛油果', en: 'Avocado' },
]

export type ScreenId = 'home' | 'pantry' | 'chat' | 'saved' | 'filter' | 'detail'

export function norm(s: string) {
  return s.trim().toLowerCase()
}

/**
 * 将用户输入的食材文本归一到 canonical（zh）。
 * 优先匹配 SUGGEST_INGS 的 zh/en，匹配不到则原样返回。
 */
export function resolveIng(text: string): string {
  const t = norm(text)
  const hit = SUGGEST_INGS.find((s) => norm(s.zh) === t || norm(s.en) === t)
  return hit ? hit.zh : text.trim()
}

export function matchScore(recipe: Recipe, pantry: string[]) {
  if (pantry.length === 0) return { score: 0, have: [] as string[] }
  const have = recipe.ingredients.filter((i) =>
    pantry.some((p) => norm(i.zh).includes(norm(p)) || norm(p).includes(norm(i.zh))),
  ).map((i) => i.zh)
  return { score: Math.round((have.length / recipe.ingredients.length) * 100), have }
}

export function matchRecipes(pantry: string[]) {
  return RECIPES.map((r) => ({ r, ...matchScore(r, pantry) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.r.time - b.r.time)
}

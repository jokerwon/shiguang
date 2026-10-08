// Phase 10 离线实验：冻结场景（人工中文请求 + 硬条件 + 软偏好及优先级 + 虚构偏好）。
//
// 本文件是实验输入的事实源，一旦开始正式评估就不得按 Jev 输赢增删或改写（实施清单 B1/B4）。
// 选取规则（事先固定）：30 个主场景 = 5 个菜系 × 6 种需求形态，每格恰好一个场景；
// 场景由人工撰写，不依据模型结果挑选。开发样例与边界场景不计入 30 个主评估场景。
//
// 硬条件（`hard`）复用在线 search_recipes 的筛选语义，由代码执行；
// 软偏好（`soft`）只交给模型判断，不转成标签硬过滤。
import type { SearchInput } from '../chat/tools/read-tools-logic';
import type { HealthGoalKey } from '../recipe/recommendation.scoring';

/** 冻结时间：本地 2026-10-08 19:30（晚间，时间适配权重生效）。用本地时间构造，不依赖 TZ。 */
export const FROZEN_NOW = new Date(2026, 9, 8, 19, 30, 0);
/** 虚构偏好档案：不读取真实用户标识、真实偏好或历史聊天 */
export interface FictionalProfile {
  /** 虚构标识，仅用于派生轮换种子 */
  userId: string;
  dislikedIngredients: string[];
  allergens: string[];
  healthGoal: HealthGoalKey;
}

/** 需求形态：主评估按「菜系 × 形态」覆盖 */
export type DemandShape =
  'tired' | 'light-rice' | 'priority' | 'either' | 'fat-loss' | 'protein';

/** 边界场景的预先固定期望（主/开发场景为空） */
export type EdgeExpect =
  | 'empty'
  | 'insufficient'
  | 'clarify'
  | 'safety-excluded'
  | 'allergen-unknown'
  | 'service-failure'
  | 'budget-pause';

export interface Scenario {
  id: string;
  kind: 'main' | 'dev' | 'edge';
  /** 原始中文请求（人工固定；两组共用，不分别调用聊天模型提取条件） */
  request: string;
  /** 需求形态（仅主场景） */
  shape?: DemandShape;
  /** 硬条件：由代码执行 */
  hard: SearchInput;
  /** 软偏好及优先级：由模型判断 */
  soft: { primary: string; secondary?: string };
  profile: FictionalProfile;
  /** 边界场景期望；主/开发场景为空 */
  expect?: EdgeExpect;
  /** 边界场景说明（人工固定） */
  note?: string;
}

const profile = (
  n: number,
  healthGoal: HealthGoalKey = 'BALANCED',
  dislikedIngredients: string[] = [],
  allergens: string[] = [],
): FictionalProfile => ({
  userId: `phase10-user-${String(n).padStart(2, '0')}`,
  dislikedIngredients,
  allergens,
  healthGoal,
});

/** 30 个主评估场景：每个至少有 4 道合格候选（由实验脚本实际校验） */
export const MAIN_SCENARIOS: Scenario[] = [
  // ---- 家常（home）----
  {
    id: 'home-tired',
    kind: 'main',
    shape: 'tired',
    request: '今天下班太累了，不想折腾，半小时内能搞定的家常菜就行',
    hard: { cuisine: 'home', maxTime: 30 },
    soft: {
      primary: '省事、步骤少、烹饪时间短',
      secondary: '味道不能太寡淡，得能就着饭吃完',
    },
    profile: profile(1),
  },
  {
    id: 'home-light-rice',
    kind: 'main',
    shape: 'light-rice',
    request: '想吃清淡一点的，但是要下饭，别整得像病号饭',
    hard: { cuisine: 'home' },
    soft: { primary: '清淡少油', secondary: '咸香下饭' },
    profile: profile(2),
  },
  {
    id: 'home-priority',
    kind: 'main',
    shape: 'priority',
    request: '孩子不吃辣，我自己想吃点重口下饭的，主要还是得孩子能吃',
    hard: { cuisine: 'home' },
    soft: { primary: '不辣、适合孩子吃', secondary: '咸香下饭' },
    profile: profile(3),
  },
  {
    id: 'home-either',
    kind: 'main',
    shape: 'either',
    request: '晚上随便做个家常菜就行，别太油',
    hard: { cuisine: 'home' },
    soft: { primary: '不要太油腻', secondary: '家常、好上手' },
    profile: profile(4),
  },
  {
    id: 'home-fat-loss',
    kind: 'main',
    shape: 'fat-loss',
    request: '在减脂，晚上想吃个家常的，别有太多油',
    hard: { cuisine: 'home', maxKcal: 400 },
    soft: { primary: '低卡少油', secondary: '有蛋白质、能吃饱' },
    profile: profile(5, 'FAT_LOSS'),
  },
  {
    id: 'home-protein',
    kind: 'main',
    shape: 'protein',
    request: '想多吃点蛋白质，家常菜就行，最好是肉多的',
    hard: { cuisine: 'home' },
    soft: { primary: '高蛋白', secondary: '味道家常、下饭' },
    profile: profile(6, 'MUSCLE_GAIN'),
  },

  // ---- 川菜（sichuan）----
  {
    id: 'sichuan-tired',
    kind: 'main',
    shape: 'tired',
    request: '累了一天想吃点重口的下饭菜，但要快，二十分钟内',
    hard: { cuisine: 'sichuan', maxTime: 20 },
    soft: { primary: '省时快做', secondary: '麻辣下饭' },
    profile: profile(7),
  },
  {
    id: 'sichuan-light-rice',
    kind: 'main',
    shape: 'light-rice',
    request: '想吃川味但别太油，能下饭就行',
    hard: { cuisine: 'sichuan' },
    soft: { primary: '不那么油腻', secondary: '麻辣、下饭' },
    profile: profile(8),
  },
  {
    id: 'sichuan-priority',
    kind: 'main',
    shape: 'priority',
    request: '想吃辣，但是肠胃不太好，主要还是别太辣太油',
    hard: { cuisine: 'sichuan' },
    soft: { primary: '辣度温和、不油腻', secondary: '川味下饭' },
    profile: profile(9),
  },
  {
    id: 'sichuan-either',
    kind: 'main',
    shape: 'either',
    request: '想整点川菜，随便哪道都行，要能配米饭',
    hard: { cuisine: 'sichuan' },
    soft: { primary: '适合配米饭', secondary: '麻辣风味' },
    profile: profile(10),
  },
  {
    id: 'sichuan-fat-loss',
    kind: 'main',
    shape: 'fat-loss',
    request: '减脂期但馋川味，想找相对低卡的',
    hard: { cuisine: 'sichuan', maxKcal: 350 },
    soft: { primary: '低卡', secondary: '保留川味、有蛋白质' },
    profile: profile(11, 'FAT_LOSS'),
  },
  {
    id: 'sichuan-protein',
    kind: 'main',
    shape: 'protein',
    request: '健身想吃川味的高蛋白菜',
    hard: { cuisine: 'sichuan', minProtein: 30 },
    soft: { primary: '高蛋白', secondary: '川味、下饭' },
    profile: profile(12, 'MUSCLE_GAIN'),
  },

  // ---- 日料（japanese）----
  {
    id: 'japanese-tired',
    kind: 'main',
    shape: 'tired',
    request: '加班回家只想十五分钟吃上，日式的最好',
    hard: { cuisine: 'japanese', maxTime: 15 },
    soft: { primary: '快、步骤少', secondary: '有主食或汤，能当一顿饭' },
    profile: profile(13),
  },
  {
    id: 'japanese-light-rice',
    kind: 'main',
    shape: 'light-rice',
    request: '想吃日料，清淡但要下饭，不要生冷',
    hard: { cuisine: 'japanese' },
    soft: { primary: '清淡、热食', secondary: '下饭或能配米饭' },
    profile: profile(14),
  },
  {
    id: 'japanese-priority',
    kind: 'main',
    shape: 'priority',
    request: '想吃日式定食，主要想吃到肉，次要希望清爽不腻',
    hard: { cuisine: 'japanese' },
    soft: { primary: '有肉、蛋白质足', secondary: '清爽不油腻' },
    profile: profile(15),
  },
  {
    id: 'japanese-either',
    kind: 'main',
    shape: 'either',
    request: '随便来个日料，暖和一点就行',
    hard: { cuisine: 'japanese' },
    soft: { primary: '热食、暖和', secondary: '日式风味' },
    profile: profile(16),
  },
  {
    id: 'japanese-fat-loss',
    kind: 'main',
    shape: 'fat-loss',
    request: '减脂想吃日料，低卡高蛋白的',
    hard: { cuisine: 'japanese', maxKcal: 350 },
    soft: { primary: '低卡', secondary: '高蛋白、不油腻' },
    profile: profile(17, 'FAT_LOSS'),
  },
  {
    id: 'japanese-protein',
    kind: 'main',
    shape: 'protein',
    request: '增肌，日式高蛋白来一份',
    hard: { cuisine: 'japanese', minProtein: 25 },
    soft: { primary: '高蛋白', secondary: '日式、饱腹' },
    profile: profile(18, 'MUSCLE_GAIN'),
  },

  // ---- 西餐（western）----
  {
    id: 'western-tired',
    kind: 'main',
    shape: 'tired',
    request: '懒得做，西式简餐二十分钟内',
    hard: { cuisine: 'western', maxTime: 20 },
    soft: { primary: '省事快做', secondary: '不寡淡、有点满足感' },
    profile: profile(19),
  },
  {
    id: 'western-light',
    kind: 'main',
    shape: 'light-rice',
    request: '想吃西式清淡的，别太腻',
    hard: { cuisine: 'western' },
    soft: { primary: '清淡不腻', secondary: '有饱腹感' },
    profile: profile(20),
  },
  {
    id: 'western-priority',
    kind: 'main',
    shape: 'priority',
    request: '想吃西式，主要是要够顶饱，其次别太油',
    hard: { cuisine: 'western' },
    soft: { primary: '饱腹顶饿', secondary: '不油腻' },
    profile: profile(21),
  },
  {
    id: 'western-either',
    kind: 'main',
    shape: 'either',
    request: '晚上吃西餐，随便挑一个，不要太甜',
    hard: { cuisine: 'western' },
    soft: { primary: '不甜', secondary: '经典西式、吃得饱' },
    profile: profile(22),
  },
  {
    id: 'western-fat-loss',
    kind: 'main',
    shape: 'fat-loss',
    request: '减脂，西式低卡高蛋白的来一份',
    hard: { cuisine: 'western', maxKcal: 400 },
    soft: { primary: '低卡', secondary: '高蛋白、清淡' },
    profile: profile(23, 'FAT_LOSS'),
  },
  {
    id: 'western-protein',
    kind: 'main',
    shape: 'protein',
    request: '健身餐，西式高蛋白，最好有鱼或鸡',
    hard: { cuisine: 'western', minProtein: 30 },
    soft: { primary: '高蛋白（鱼或鸡）', secondary: '低脂、做法简单' },
    profile: profile(24, 'MUSCLE_GAIN'),
  },

  // ---- 轻食（light）----
  {
    id: 'light-tired',
    kind: 'main',
    shape: 'tired',
    request: '想吃得清爽点，五分钟到十分钟能弄好的',
    hard: { cuisine: 'light', maxTime: 15 },
    soft: { primary: '省事、少步骤', secondary: '清爽、低卡' },
    profile: profile(25),
  },
  {
    id: 'light-rice',
    kind: 'main',
    shape: 'light-rice',
    request: '想吃清淡但能下饭的，别是纯草',
    hard: { cuisine: 'light' },
    soft: { primary: '清淡', secondary: '有蛋白质或主食感、下饭' },
    profile: profile(26),
  },
  {
    id: 'light-priority',
    kind: 'main',
    shape: 'priority',
    request: '轻食为主，主要是低卡，其次要有饱腹感',
    hard: { cuisine: 'light' },
    soft: { primary: '低卡', secondary: '饱腹、有蛋白质' },
    profile: profile(27),
  },
  {
    id: 'light-either',
    kind: 'main',
    shape: 'either',
    request: '想吃点轻食，随便哪个都行，别太甜',
    hard: { cuisine: 'light' },
    soft: { primary: '不甜', secondary: '清爽轻食' },
    profile: profile(28),
  },
  {
    id: 'light-fat-loss',
    kind: 'main',
    shape: 'fat-loss',
    request: '减脂期，想吃低卡高蛋白的轻食',
    hard: { cuisine: 'light', maxKcal: 320, minProtein: 15 },
    soft: { primary: '低卡高蛋白', secondary: '清淡、饱腹' },
    profile: profile(29, 'FAT_LOSS'),
  },
  {
    id: 'light-protein',
    kind: 'main',
    shape: 'protein',
    request: '想吃高蛋白的轻食，最好有肉或蛋',
    hard: { cuisine: 'light', minProtein: 20 },
    soft: { primary: '高蛋白', secondary: '清爽、少油' },
    profile: profile(30, 'MUSCLE_GAIN'),
  },
];

/** 开发样例：独立于正式评估，用于打通 SDK 调用路径；其结果不用于任何效果结论 */
export const DEV_SCENARIOS: Scenario[] = [
  {
    id: 'dev-hot-rice-bowl',
    kind: 'dev',
    request: '今天特别累，想吃个二十分钟以内、热乎的日式盖饭',
    hard: { cuisine: 'japanese', maxTime: 20 },
    soft: { primary: '热乎、能当一顿饭', secondary: '省事' },
    profile: profile(91),
  },
];

/** 边界场景：不计入 30 个主评估场景的净胜数 */
export const EDGE_SCENARIOS: Scenario[] = [
  {
    id: 'edge-empty',
    kind: 'edge',
    expect: 'empty',
    note: '硬条件交集为空：不发模型请求，不凑数、不放宽条件',
    request: '想吃一道根本不存在的菜',
    hard: { keyword: '不存在的菜名xyz' },
    soft: { primary: '（无）' },
    profile: profile(92),
  },
  {
    id: 'edge-insufficient',
    kind: 'edge',
    expect: 'insufficient',
    note: '合格候选不足 4 道：如实返回，不凑数',
    request: '想吃十分钟内能做好的高蛋白低卡轻食',
    hard: { cuisine: 'light', tags: ['high-protein', 'low-cal'], maxTime: 12 },
    soft: { primary: '快、高蛋白、低卡' },
    profile: profile(93),
  },
  {
    id: 'edge-safety-dislike',
    kind: 'edge',
    expect: 'safety-excluded',
    note: '忌口命中：安全排除优先于场景条件，且不得被模型恢复',
    request: '想吃豆腐',
    hard: { keyword: '豆腐' },
    soft: { primary: '豆腐类' },
    profile: profile(94, 'BALANCED', ['豆腐']),
  },
  {
    id: 'edge-allergen-unknown',
    kind: 'edge',
    expect: 'allergen-unknown',
    note: '有过敏设置时成分信息不足 → 保守排除（unknown 不等于安全）',
    request: '想吃黄瓜',
    hard: { keyword: '黄瓜' },
    soft: { primary: '黄瓜类' },
    profile: profile(95, 'BALANCED', [], ['乳']),
  },
  {
    id: 'edge-clarify',
    kind: 'edge',
    expect: 'clarify',
    note: '矛盾且无优先级：标记需要澄清，不让模型猜，不发模型请求',
    request: '想吃特别辣的，但我一点辣都不能碰',
    hard: { cuisine: 'sichuan' },
    soft: { primary: '（未给出优先级：同时要求很辣与完全不辣）' },
    profile: profile(96),
  },
  {
    id: 'edge-service-failure',
    kind: 'edge',
    expect: 'service-failure',
    note: '服务失败单独记录，不计胜/平/负，不用基线冒充 Jev；仅用确定性控制触发',
    request: '想吃二十分钟内的家常菜',
    hard: { cuisine: 'home', maxTime: 20 },
    soft: { primary: '省事' },
    profile: profile(97),
  },
  {
    id: 'edge-budget-pause',
    kind: 'edge',
    expect: 'budget-pause',
    note: '预算不足时暂停：不发付费请求，不自动加预算或减候选',
    request: '想吃二十分钟内的家常菜',
    hard: { cuisine: 'home', maxTime: 20 },
    soft: { primary: '省事' },
    profile: profile(98),
  },
];

export const SCENARIOS: Scenario[] = [
  ...MAIN_SCENARIOS,
  ...DEV_SCENARIOS,
  ...EDGE_SCENARIOS,
];

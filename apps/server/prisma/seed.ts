// Seed：把前端 RECIPES 数组写入 Recipe 表。
// 运行：pnpm exec prisma db seed
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Cuisine, Tag } from '../generated/prisma/client';

type SeedRecipe = {
  name: string;
  desc: string;
  cuisine: Cuisine;
  time: number;
  kcal: number;
  img: string;
  tags: Tag[];
  ingredients: string[];
  steps: string[];
};

// 与前端 apps/web/lib/recipes.ts 的 RECIPES 保持一致
const RECIPES: SeedRecipe[] = [
  {
    name: '番茄罗勒意面',
    desc: '最经典的意面之一，番茄与罗勒的组合永远不出错。',
    cuisine: Cuisine.WESTERN,
    time: 25,
    kcal: 520,
    img: '/assets/pasta.png',
    tags: [Tag.VEGETARIAN, Tag.QUICK],
    ingredients: ['意面', '番茄', '罗勒', '大蒜', '橄榄油', '盐', '黑胡椒'],
    steps: [
      '烧一锅水加盐煮意面至弹牙',
      '同时热橄榄油爆香蒜片',
      '下番茄丁炒至出汁',
      '拌入煮好的意面与罗勒',
      '撒盐与黑胡椒调味',
    ],
  },
  {
    name: '香煎三文鱼配时蔬',
    desc: '高蛋白低碳的一餐，鱼皮煎脆是关键。',
    cuisine: Cuisine.WESTERN,
    time: 20,
    kcal: 480,
    img: '/assets/salmon.jpg',
    tags: [Tag.HIGH_PROTEIN, Tag.LOW_CARB],
    ingredients: ['三文鱼', '芦笋', '柠檬', '橄榄油', '盐', '黑胡椒'],
    steps: [
      '三文鱼擦干、两面撒盐黑胡椒',
      '热锅少油鱼皮朝下煎脆',
      '翻面煎至中心半熟',
      '芦笋另锅快炒至断生',
      '挤柠檬汁装盘',
    ],
  },
  {
    name: '日式咖喱鸡饭',
    desc: '浓郁暖胃，剩一锅第二天更入味。',
    cuisine: Cuisine.JAPANESE,
    time: 35,
    kcal: 640,
    img: '/assets/curry.jpg',
    tags: [Tag.COMFORTING],
    ingredients: ['鸡腿肉', '土豆', '胡萝卜', '洋葱', '咖喱块', '米饭'],
    steps: [
      '鸡肉切块焯水去腥',
      '洋葱炒香至透明',
      '下土豆胡萝卜翻炒',
      '加水煮至蔬菜软烂',
      '关火放入咖喱块融化，浇在米饭上',
    ],
  },
  {
    name: '藜麦牛油果碗',
    desc: '一碗补齐碳水、蛋白与健康脂肪。',
    cuisine: Cuisine.LIGHT,
    time: 15,
    kcal: 410,
    img: '/assets/bowl.jpg',
    tags: [Tag.VEGETARIAN, Tag.HIGH_PROTEIN, Tag.LOW_CAL],
    ingredients: ['藜麦', '牛油果', '鹰嘴豆', '菠菜', '柠檬', '橄榄油'],
    steps: [
      '藜麦煮熟沥干',
      '鹰嘴豆与菠菜快速焯烫',
      '所有食材码入碗中',
      '牛油果切片摆上',
      '淋柠檬汁与橄榄油',
    ],
  },
  {
    name: '西红柿炒鸡蛋',
    desc: '国民下饭菜，十分钟搞定。',
    cuisine: Cuisine.HOME,
    time: 10,
    kcal: 300,
    img: '',
    tags: [Tag.QUICK],
    ingredients: ['番茄', '鸡蛋', '葱', '盐', '糖', '食用油'],
    steps: [
      '鸡蛋打散炒熟盛出',
      '西红柿切块下锅炒至出汁',
      '加少许糖提鲜',
      '倒回鸡蛋翻炒均匀',
      '撒葱花出锅',
    ],
  },
  {
    name: '蒜蓉蒸豆腐',
    desc: '清淡鲜嫩，减脂期友好。',
    cuisine: Cuisine.HOME,
    time: 18,
    kcal: 220,
    img: '',
    tags: [Tag.VEGETARIAN, Tag.LOW_CAL],
    ingredients: ['嫩豆腐', '大蒜', '葱花', '酱油', '香油'],
    steps: [
      '豆腐切块装盘入锅蒸8分钟',
      '蒜蓉用热油泼香',
      '淋酱油与香油',
      '撒葱花',
    ],
  },
  {
    name: '照烧鸡腿饭',
    desc: '甜咸适口，便当党最爱。',
    cuisine: Cuisine.JAPANESE,
    time: 25,
    kcal: 560,
    img: '',
    tags: [Tag.HIGH_PROTEIN],
    ingredients: ['鸡腿肉', '酱油', '味醂', '糖', '米饭', '姜'],
    steps: [
      '鸡腿去骨擦干',
      '皮朝下煎至金黄',
      '翻面煎熟',
      '酱油味醂糖调汁收浓',
      '切块盖在米饭上',
    ],
  },
  {
    name: '凯撒沙拉',
    desc: '清爽开胃，主食前的小仪式。',
    cuisine: Cuisine.WESTERN,
    time: 15,
    kcal: 380,
    img: '',
    tags: [Tag.LOW_CAL, Tag.QUICK],
    ingredients: ['罗马生菜', '面包丁', '帕玛森芝士', '凯撒酱', '柠檬'],
    steps: [
      '生菜洗净沥干撕成小块',
      '面包切丁烤脆',
      '生菜拌凯撒酱',
      '撒面包丁与芝士碎',
      '挤柠檬汁',
    ],
  },
  {
    name: '麻婆豆腐',
    desc: '麻辣鲜香烫，一碗饭不够。',
    cuisine: Cuisine.SICHUAN,
    time: 20,
    kcal: 340,
    img: '',
    tags: [Tag.RICE_FRIENDLY],
    ingredients: ['嫩豆腐', '猪肉末', '豆瓣酱', '花椒', '葱花', '蒜'],
    steps: [
      '豆腐切块焯水定型',
      '肉末炒至变色',
      '下豆瓣酱炒出红油',
      '加豆腐炖煮入味',
      '勾芡撒花椒面葱花',
    ],
  },
  {
    name: '味噌汤',
    desc: '日料餐桌的暖场，三分钟。',
    cuisine: Cuisine.JAPANESE,
    time: 12,
    kcal: 120,
    img: '',
    tags: [Tag.LOW_CAL, Tag.QUICK],
    ingredients: ['味噌', '豆腐', '海带', '葱花', '裙带菜'],
    steps: [
      '水烧开下裙带菜与豆腐',
      '味噌用少量汤化开倒入',
      '小火不再煮沸',
      '撒葱花',
    ],
  },
  {
    name: '土豆炖牛肉',
    desc: '慢炖出味，冬天的一锅满足。',
    cuisine: Cuisine.HOME,
    time: 45,
    kcal: 520,
    img: '',
    tags: [Tag.HIGH_PROTEIN, Tag.COMFORTING],
    ingredients: ['牛腩', '土豆', '胡萝卜', '洋葱', '酱油', '八角'],
    steps: [
      '牛腩切块焯水',
      '炒香洋葱下牛肉',
      '加酱油与水炖40分钟',
      '下土豆胡萝卜炖至软烂',
      '收汁',
    ],
  },
  {
    name: '凉拌黄瓜',
    desc: '开胃凉菜，酸辣脆爽。',
    cuisine: Cuisine.SICHUAN,
    time: 8,
    kcal: 80,
    img: '',
    tags: [Tag.LOW_CAL, Tag.QUICK, Tag.VEGETARIAN],
    ingredients: ['黄瓜', '大蒜', '醋', '辣椒油', '盐'],
    steps: ['黄瓜拍裂切段', '蒜蓉与调料调汁', '拌匀冷藏10分钟更入味'],
  },
];

async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const adapter = new PrismaPg(url);
  const prisma = new PrismaClient({ adapter });

  try {
    // 幂等：按 name upsert，避免重复 seed 堆叠
    for (const r of RECIPES) {
      await prisma.recipe.upsert({
        where: { name: r.name },
        update: {
          desc: r.desc,
          cuisine: r.cuisine,
          time: r.time,
          kcal: r.kcal,
          img: r.img,
          tags: r.tags,
          ingredients: r.ingredients,
          steps: r.steps,
        },
        create: {
          name: r.name,
          desc: r.desc,
          cuisine: r.cuisine,
          time: r.time,
          kcal: r.kcal,
          img: r.img,
          tags: r.tags,
          ingredients: r.ingredients,
          steps: r.steps,
        },
      });
    }
    console.log(`✅ Seeded ${RECIPES.length} recipes`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});

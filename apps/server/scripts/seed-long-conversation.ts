// 长会话种子脚本（Phase 3 F3 验收前置，ADR-0012 决策 5）。
// 直插 DB 构造一个 40+ 条消息的会话（text parts，seq 连续，话题：减脂餐 → 周末聚餐），
// 随后进程内直调摘要纯函数（src/chat/summary.ts）预生成摘要并写回会话行——
// 不走 HTTP、不烧 20+ 轮真实对话。走查时打开该会话发第一条探测消息即达完整形态（滑窗 + 摘要）。
//
// 用法：
//   pnpm seed:long-conversation -- --user <userId|email>
// 幂等：重复跑先删旧种子会话（固定 title 前缀识别）。
// 环境变量（apps/server/.env）：DATABASE_URL 必填；
//   OPENAI_API_KEY / OPENAI_BASE_URL / MODEL_NAME 用于预生成摘要（缺省则跳过摘要，仅造滑窗数据）。
import 'dotenv/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import type { UIMessage } from 'ai';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { CONTEXT_WINDOW } from '../src/conversation/conversation.service';
import { summarizeOverflow, type SummaryModel } from '../src/chat/summary';

/** 种子会话识别前缀（幂等删除依据） */
const SEED_TITLE_PREFIX = '【种子】长会话·';

/**
 * 话题内容：先「减脂餐」（seq 1–20，滑窗外，靠摘要恢复），后「周末聚餐」（seq 21–40，滑窗内）。
 * 探测消息「我们之前聊的减脂餐里，有没有适合带饭的？」引用 seq 13–14，需摘要才能答出。
 */
const EXCHANGES: { role: 'user' | 'assistant'; text: string }[] = [
  { role: 'user', text: '我在减脂，想问问今晚吃什么。' },
  {
    role: 'assistant',
    text: '减脂期建议高蛋白、低脂低糖的搭配。你现在手边有食材吗？或者我可以直接推荐几道减脂友好的菜。',
  },
  {
    role: 'user',
    text: '手边有鸡胸肉、西兰花、鸡蛋、燕麦，还有一点虾。',
  },
  {
    role: 'assistant',
    text: '这些很适合。推荐一道「西兰花炒鸡胸」，蛋白质充足、热量可控，15 分钟就能做好。要详细做法吗？',
  },
  { role: 'user', text: '要。另外主食我想换成粗粮，推荐一下。' },
  {
    role: 'assistant',
    text: '主食可以选蒸红薯或燕麦粥，都是低升糖的粗粮。你刚才说的西兰花炒鸡胸配一小份红薯就很合适。',
  },
  { role: 'user', text: '那道菜具体怎么做？' },
  {
    role: 'assistant',
    text: '做法：鸡胸切片用料酒和黑胡椒腌 10 分钟，西兰花焯水；热锅少油下鸡胸炒至变色，加西兰花翻匀，调味后出锅。全程约 15 分钟。',
  },
  { role: 'user', text: '虾可以怎么吃？也低卡一点。' },
  {
    role: 'assistant',
    text: '虾可以做成「白灼虾」，水开后下锅煮 2–3 分钟，配姜醋汁，几乎零脂肪。作为减脂期的优质蛋白很合适。',
  },
  { role: 'user', text: '我早餐一般吃燕麦，会不会太单调？' },
  {
    role: 'assistant',
    text: '燕麦可以换着吃：加鸡蛋做成燕麦鸡蛋饼，或者加牛奶和少量水果，营养更均衡，也不容易腻。',
  },
  { role: 'user', text: '午饭在公司，想带饭。有适合带的减脂餐吗？' },
  {
    role: 'assistant',
    text: '带饭建议选不易出水、复热不变质的菜：比如鸡胸肉丁炒杂蔬、虾仁炒蛋、西兰花拌鸡丝，都适合提前一晚备好。',
  },
  {
    role: 'user',
    text: '那调味上有什么要注意的？我总做得很淡。',
  },
  {
    role: 'assistant',
    text: '减脂期少油少盐但可以善用香料：黑胡椒、孜然、蒜末、姜、柠檬汁都能提味，避免依赖高热量酱料。',
  },
  { role: 'user', text: '周末想吃顿好的，减脂餐先放一放。' },
  {
    role: 'assistant',
    text: '没问题，周末可以放开一点。你想吃家常菜、西式还是别的？我可以按你的口味推荐。',
  },
  {
    role: 'user',
    text: '家里要聚餐，来大概 6 个人，想整点硬菜。',
  },
  {
    role: 'assistant',
    text: '6 人聚餐建议荤素搭配、有一两道硬菜镇场。我先推荐几个方向：红烧肉、清蒸鲈鱼、大盘鸡、可乐鸡翅，看你想吃哪种。',
  },
  { role: 'user', text: '红烧肉太腻，来清蒸鲈鱼和大盘鸡怎么样？' },
  {
    role: 'assistant',
    text: '好搭配！清蒸鲈鱼鲜嫩不腻，大盘鸡管饱又热闹。再加一道凉菜和一道青菜，六个人吃刚好。',
  },
  { role: 'user', text: '凉菜推荐一个简单又能下酒的。' },
  {
    role: 'assistant',
    text: '拍黄瓜最简单，蒜末香醋一拌就能上桌；想吃荤一点可以加口水鸡。你选哪个？',
  },
  { role: 'user', text: '拍黄瓜吧。大盘鸡的食材都有什么？' },
  {
    role: 'assistant',
    text: '大盘鸡需要鸡腿、土豆、青红椒、洋葱，加上八角、桂皮等香料炖煮。你也可以加宽面吸汁，很过瘾。',
  },
  { role: 'user', text: '鲈鱼买多大合适？' },
  {
    role: 'assistant',
    text: '六个人吃建议一条 1 斤半左右的鲈鱼，清蒸 8–10 分钟，出锅淋蒸鱼豉油和热油即可。',
  },
  { role: 'user', text: '有没有配菜的素菜推荐？' },
  {
    role: 'assistant',
    text: '蒜蓉空心菜或者蚝油生菜都很快手，提前备好蒜末，上桌前 3 分钟就能炒好。',
  },
  { role: 'user', text: '主食呢，这么多人吃什么好？' },
  {
    role: 'assistant',
    text: '可以煮一大锅米饭，再配点馒头花卷；如果大盘鸡加了宽面，主食可以适当减量。',
  },
  { role: 'user', text: '饮料有什么推荐？家里人多口杂。' },
  {
    role: 'assistant',
    text: '可以备两类：啤酒/果酒给想喝酒的，再加一大壶自制酸梅汤或柠檬水，解腻又照顾不喝酒的。',
  },
  { role: 'user', text: '我家里人有个对海鲜过敏，鲈鱼还能上吗？' },
  {
    role: 'assistant',
    text: '那鲈鱼不建议上，避免风险。可以换成「糖醋里脊」或「红烧排骨」这类同样镇场、又避开过敏原的硬菜。',
  },
  { role: 'user', text: '那换糖醋里脊吧，好做吗？' },
  {
    role: 'assistant',
    text: '糖醋里脊不难：里脊切条腌好，裹淀粉炸到金黄，另起锅调糖醋汁收汁裹匀即可。提前备好料，上桌前 20 分钟就能完成。',
  },
  {
    role: 'user',
    text: '行，就按这个方案。帮我记一下：周日聚餐，鲈鱼换成糖醋里脊。',
  },
  {
    role: 'assistant',
    text: '好的，已记下你的安排：周日聚餐、6 人、硬菜糖醋里脊加大盘鸡，配拍黄瓜和青菜，主食米饭。到时按这个来。',
  },
];

/** 缺 API key 返回 null（脚本降级为只造滑窗数据）；否则复用与 /chat 相同的模型端点 */
function buildSummaryModel(): SummaryModel | null {
  const apiKey = process.env['OPENAI_API_KEY'];
  const modelName = process.env['MODEL_NAME'];
  if (!apiKey || !modelName) return null;
  const openai = createOpenAI({
    apiKey,
    baseURL: process.env['OPENAI_BASE_URL'],
  });
  const model = openai.chat(modelName);
  return {
    summarize: async (messages: string) => {
      const { text } = await generateText({ model, prompt: messages });
      return text;
    },
  };
}

async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url)
    throw new Error('DATABASE_URL is not set（在 apps/server/.env 中配置）');
  const adapter = new PrismaPg(url);
  const prisma = new PrismaClient({ adapter });

  // 目标用户：--user 接受 userId 或 email
  const argv = process.argv.slice(2).join(' ');
  const userMatch = argv.match(/--user\s+(\S+)/);
  const userArg = userMatch?.[1];
  if (!userArg) throw new Error('缺少 --user <userId|email>');
  const user = await prisma.user.findFirst({
    where: userArg.includes('@') ? { email: userArg } : { id: userArg },
  });
  if (!user) throw new Error(`未找到用户: ${userArg}`);

  // 幂等：删旧种子会话（级联删消息）
  await prisma.conversation.deleteMany({
    where: { userId: user.id, title: { startsWith: SEED_TITLE_PREFIX } },
  });

  const conv = await prisma.conversation.create({
    data: {
      userId: user.id,
      title: `${SEED_TITLE_PREFIX}减脂餐与周末聚餐`,
    },
  });

  // 构造消息（UIMessage → DB 行，seq 1..N 连续）
  const uiMessages: UIMessage[] = EXCHANGES.map((e) => ({
    id: crypto.randomUUID(),
    role: e.role,
    parts: [{ type: 'text', text: e.text }],
  }));
  await prisma.message.createMany({
    data: uiMessages.map((m, i) => ({
      id: m.id,
      conversationId: conv.id,
      seq: i + 1,
      role: m.role,
      parts: m.parts as never, // 与 appendMessage 一致：parts 落库原始 UIMessage parts
    })),
  });

  // 预生成摘要：覆盖 seq 1..(maxSeq − CONTEXT_WINDOW) 的溢出区
  const maxSeq = uiMessages.length;
  const overflowEnd = maxSeq - CONTEXT_WINDOW;
  const summaryModel = buildSummaryModel();
  if (summaryModel) {
    const overflow = uiMessages.slice(0, overflowEnd);
    const summary = await summarizeOverflow(summaryModel, null, overflow);
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { summary, summaryUpToSeq: overflowEnd },
    });
    console.log(`✅ 已预生成摘要（覆盖至 seq ${overflowEnd}）`);
  } else {
    console.warn(
      '⚠️ 缺少 OPENAI_API_KEY / MODEL_NAME，跳过摘要预生成（仅造滑窗数据，探测消息将测不到滑窗外话题）',
    );
  }

  await prisma.$disconnect();

  console.log(`✅ 种子会话已就绪：${conv.id}`);
  console.log(`   URL: http://localhost:3000/chat/${conv.id}`);
  console.log(
    `   消息数 ${maxSeq}，滑窗 ${CONTEXT_WINDOW}，摘要覆盖 seq 1..${overflowEnd}`,
  );
  console.log(
    '   走查：打开该会话，发送「我们之前聊的减脂餐里，有没有适合带饭的？」',
  );
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});

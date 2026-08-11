/* eslint-disable @typescript-eslint/require-await */
// 偏好服务单测（Phase 3.5 / W0.2）：upsert 部分更新语义。
// 零 DB：注入对象字面量 fake prisma，只实现 userPreference.upsert，
// 断言落库的 create/update 体字段——只传某字段时不得覆盖其余字段（ADR-0012 决策 3
// 并行修改场景的 service 层保障：update 用条件展开，缺省字段不进 update 体）。
// jest.mock 拦截 PrismaService，避免加载真实 PrismaClient（generated/prisma/client
// 运行时导入在 jest 下解析失败；service 本身只用 prisma.userPreference.upsert）。
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class {},
}));
import { PreferenceService } from './preference.service';

/** 最小 fake prisma：只实现 userPreference.upsert，捕获入参供断言 */
function makeFakePrisma() {
  const calls: {
    where: { userId: string };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }[] = [];
  return {
    calls,
    prisma: {
      userPreference: {
        upsert: async (args: {
          where: { userId: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          calls.push(args);
          // 回返合并后的「落库行」，供 service 组装 PreferenceResponse
          return {
            dislikedIngredients: args.create.dislikedIngredients ?? [],
            allergens: args.create.allergens ?? [],
            healthGoal: args.create.healthGoal ?? 'BALANCED',
            ...args.update,
          } as {
            dislikedIngredients: string[];
            allergens: string[];
            healthGoal: 'BALANCED' | 'FAT_LOSS' | 'MUSCLE_GAIN';
          };
        },
      },
    },
  };
}

describe('PreferenceService', () => {
  it('只传 dislikedIngredients 时 update 体不含 allergens/healthGoal（部分更新不覆盖）', async () => {
    const { calls, prisma } = makeFakePrisma();
    const svc = new PreferenceService(prisma as never);

    await svc.upsert('u1', { dislikedIngredients: ['香菜'] });

    expect(calls).toHaveLength(1);
    const update = calls[0].update;
    expect(update.dislikedIngredients).toEqual(['香菜']);
    // 关键：未传字段不得进 update 体，否则会覆盖为默认值（ADR-0012 并行修改丢失）
    expect(update).not.toHaveProperty('allergens');
    expect(update).not.toHaveProperty('healthGoal');
  });

  it('只传 healthGoal 时 update 体仅含 healthGoal', async () => {
    const { calls, prisma } = makeFakePrisma();
    const svc = new PreferenceService(prisma as never);

    await svc.upsert('u1', { healthGoal: 'FAT_LOSS' });

    expect(calls[0].update).toEqual({ healthGoal: 'FAT_LOSS' });
    expect(calls[0].update).not.toHaveProperty('dislikedIngredients');
    expect(calls[0].update).not.toHaveProperty('allergens');
  });

  it('create 分支用缺省值补齐（无记录时建库行）', async () => {
    const { calls, prisma } = makeFakePrisma();
    const svc = new PreferenceService(prisma as never);

    await svc.upsert('u1', { allergens: ['花生'] });

    // create 体三字段齐全：未传的用默认值（[] / BALANCED）
    expect(calls[0].create).toEqual({
      userId: 'u1',
      dislikedIngredients: [],
      allergens: ['花生'],
      healthGoal: 'BALANCED',
    });
  });

  it('全字段传入时 update 体含全部三字段', async () => {
    const { calls, prisma } = makeFakePrisma();
    const svc = new PreferenceService(prisma as never);

    await svc.upsert('u1', {
      dislikedIngredients: ['香菜'],
      allergens: ['虾'],
      healthGoal: 'MUSCLE_GAIN',
    });

    expect(calls[0].update).toEqual({
      dislikedIngredients: ['香菜'],
      allergens: ['虾'],
      healthGoal: 'MUSCLE_GAIN',
    });
  });
});

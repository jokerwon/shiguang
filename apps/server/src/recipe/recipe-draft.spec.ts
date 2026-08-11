import { validateRecipeDraft } from './recipe-draft';

const VALID = {
  name: '测试菜',
  desc: '一道用于单测的菜。',
  cuisine: 'HOME',
  time: 20,
  kcal: 400,
  protein: 25,
  carb: 40,
  fat: 16, // 4*25 + 4*40 + 9*16 = 404，与 400 偏差 1%
  img: '',
  tags: ['QUICK'],
  ingredients: [
    { name: '鸡蛋', amount: '2个' },
    { name: '番茄', amount: '1个' },
    { name: '盐', amount: '适量' },
  ],
  steps: ['步骤一', '步骤二', '步骤三'],
};

describe('validateRecipeDraft', () => {
  it('接受合法草稿', () => {
    const result = validateRecipeDraft(VALID);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('拒绝非对象', () => {
    expect(validateRecipeDraft(null).ok).toBe(false);
    expect(validateRecipeDraft('x').ok).toBe(false);
    expect(validateRecipeDraft([1, 2]).ok).toBe(false);
  });

  it('拒绝缺失必填字段', () => {
    const noName = { ...VALID, name: undefined };
    delete noName.name;
    expect(validateRecipeDraft(noName).ok).toBe(false);
    const noDesc = { ...VALID, desc: undefined };
    delete noDesc.desc;
    expect(validateRecipeDraft(noDesc).ok).toBe(false);
  });

  it('拒绝空字符串 name/desc', () => {
    expect(validateRecipeDraft({ ...VALID, name: '  ' }).ok).toBe(false);
    expect(validateRecipeDraft({ ...VALID, desc: '' }).ok).toBe(false);
  });

  it('拒绝非法 cuisine', () => {
    const result = validateRecipeDraft({ ...VALID, cuisine: 'FRENCH' });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('cuisine');
  });

  it('拒绝非法 tag', () => {
    const result = validateRecipeDraft({ ...VALID, tags: ['SPICY'] });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('tags');
  });

  it('接受空 tags 数组', () => {
    expect(validateRecipeDraft({ ...VALID, tags: [] }).ok).toBe(true);
  });

  it.each([
    ['time', 2],
    ['time', 300],
    ['kcal', 10],
    ['kcal', 5000],
    ['protein', -1],
    ['fat', 200],
  ])('拒绝越界数值 %s=%s', (key, value) => {
    expect(validateRecipeDraft({ ...VALID, [key]: value }).ok).toBe(false);
  });

  it('拒绝 kcal 与宏量营养素偏差过大的草稿', () => {
    const result = validateRecipeDraft({ ...VALID, kcal: 900 }); // 估算 404，偏差 >30%
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('偏差');
  });

  it('拒绝 ingredients 少于 3 项', () => {
    const result = validateRecipeDraft({
      ...VALID,
      ingredients: VALID.ingredients.slice(0, 2),
    });
    expect(result.ok).toBe(false);
  });

  it('拒绝 name/amount 为空的食材项', () => {
    const result = validateRecipeDraft({
      ...VALID,
      ingredients: [...VALID.ingredients, { name: '', amount: '1个' }],
    });
    expect(result.ok).toBe(false);
  });

  it('拒绝 steps 少于 3 条或含空步骤', () => {
    expect(validateRecipeDraft({ ...VALID, steps: ['一', '二'] }).ok).toBe(
      false,
    );
    expect(validateRecipeDraft({ ...VALID, steps: ['一', '二', ''] }).ok).toBe(
      false,
    );
  });
});

import type { MeasurementDimension } from '@study-agent/contracts';
import type { Exercise, FoundationDefinition } from './foundation-curriculum';
import { buildArithmeticProbeFamilies } from './authored-arithmetic-probes';
import { buildNumberProbeFamilies } from './authored-number-probes';
import { buildSpatialProbeFamilies } from './authored-spatial-probes';
import { buildSecondGradeProbeFamilies } from './authored-second-grade-probes';

export type AuthoredProbeFamily = { atomId: string; family: string; dimension: MeasurementDimension; behavior: string;
  structure: string; distinction: string; exercises: Exercise[] };
const prefix = 'foundation:math:';
const choose = (stem: string, answer: string, alternatives: string[], analysis: string): Omit<Exercise, 'dimension' | 'family'> =>
  ({ stem, answer, mode: 'single_choice', options: [answer, ...alternatives], analysis });
const blanks = (stem: string, values: Array<[string, string, number]>, analysis: string): Omit<Exercise, 'dimension' | 'family'> =>
  ({ stem, mode: 'multi_blank', answer: values.map(([key, , value]) => ({ key, value: String(value) })),
    responseShape: { entries: values.map(([key, label]) => ({ key, label })) }, analysis });

/** Explicitly authored task structures. Changing numbers within one structure never creates a new family. */
export function buildAuthoredMathProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const add = (code: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string, distinction: string,
    build: (index: number) => Omit<Exercise, 'dimension' | 'family'>) => {
    result.push({ atomId: prefix + code, family, dimension, behavior, structure, distinction,
      exercises: Array.from({ length: 12 }, (_, index) => ({ ...build(index), identityVersion: 2, family, dimension })) });
  };

  add('placevalue', 'placevalue-regroup-units', 'procedure', '把超过十个的一重新打包，保持总数', '未规范的十和一组成 → 重新打包 → 数值',
    '原有组成题个位数量小于十；此组必须处理满十重新打包，不按输入中的十数直接抄写。', n => {
      const tens = 1 + n % 6, units = 11 + n % 9;
      return { stem: `${tens}捆小棒，每捆10根，另外有${units}根单独的小棒。重新把每10根扎成一捆后，一共有多少根小棒？`,
        answer: tens * 10 + units, analysis: `${units}个一可重新分为1个十和${units - 10}个一；总数是${tens * 10 + units}，打包不会改变总数。` };
    });
  add('placevalue', 'placevalue-conservation-check', 'understanding', '辨别位值与数字相加的混淆', '检查表示等式 → 判断数量是否守恒',
    '此组核对一个表示是否成立，不是读取某一数位或直接组成一个数。', n => {
      const tens = 2 + n % 7, units = 1 + n % 8, correct = n % 2 === 0, written = correct ? tens * 10 + units : tens + units;
      return { stem: `小禾说：“${tens}个十和${units}个一，合起来是${written}。”这句话正确吗？`, answer: correct, mode: 'boolean',
        analysis: `${tens}个十表示${tens * 10}，再加${units}个一是${tens * 10 + units}。${correct ? '这次表示正确。' : '不能只把十的个数与一的个数直接相加。'}` };
    });
  add('placevalue', 'placevalue-inventory-inverse', 'transfer', '从十进包装记录反推整包数', '实际数量与散件表 → 识别十进包装单位 → 反推整包数',
    '原有题直接给出数位；这里从包装制度和库存记录提取单位，反向恢复数量组成。', n => {
      const boxes = 2 + n % 7, loose = n % 10, total = boxes * 10 + loose;
      return { stem: `卡片每整盒装10张。记录中“整盒”一栏被遮住了；这些卡片共有${total}张。原来有几整盒？`, answer: boxes,
        blocks: [{ id: 'inventory', type: 'table', headers: ['包装', '数量'], rows: [['整盒（每盒10张）', '被遮住'], ['散张', String(loose)]] }],
        analysis: `先去掉${loose}张散张，剩下${boxes * 10}张；每10张为一盒，所以有${boxes}整盒。` };
    });
  add('placevalue', 'placevalue-permutation-tracking', 'transfer', '位置交换后追踪同一数字表示的数量', '数字卡换位 → 追踪一个数字的原值与新值',
    '同时看两个数并追踪同一数字的计数单位，不是另问一次十位或个位数字。', n => {
      const tens = 5 + n % 4, units = 1 + Math.floor(n / 4) % 4;
      return choose(`用数字卡${tens}和${units}先摆成${tens * 10 + units}，再交换位置摆成${units * 10 + tens}。同一张数字卡“${tens}”表示的数量怎样变化？`,
        `从${tens * 10}变成${tens}`, [`从${tens}变成${tens * 10}`, `一直都是${tens}`],
        `交换前${tens}在十位，表示${tens * 10}；交换后在个位，表示${tens}。数字卡没变，计数单位变了。`);
    });

  add('borrowdecision', 'borrow-decision-rule-audit', 'understanding', '区分整数量大小与本位是否够减', '两个减法反例 → 选择正确的局部判断依据',
    '核对判断规则，并用十位大小相同但个位条件不同的反例排除整数量误判。', n => {
      const tens = 4 + n % 5, subTens = tens - 2, low = n % 4, high = 5 + n % 4;
      return choose(`比较${tens * 10 + low}−${subTens * 10 + high}与${tens * 10 + high}−${subTens * 10 + low}。哪句话能正确说明两题个位是否需要退位？`,
        '第一题需要，第二题不需要，要比较各题个位够不够减', ['两题被减数都大于减数，所以都不需要', '两题十位都比较大，所以都需要'],
        `第一题个位${low}<${high}，不够减；第二题个位${high}≥${low}，够减。比较整数量大小不能代替本位判断。`);
    });
  add('borrowdecision', 'borrow-decision-construct-condition', 'procedure', '根据退位要求确定未知个位的边界', '给出需要退位的约束 → 构造满足约束的最大个位',
    '已知条件反向求可用数字，需要应用“小于”关系，不能只给一个已有算式贴标签。', n => {
      const tens = 4 + n % 5, subTens = tens - 2, units = 2 + n % 7;
      return { stem: `要让${tens}□−${subTens}${units}在个位计算时需要向十位退位，□里最大能填几？`, answer: units - 1,
        analysis: `个位要不够减，□必须小于${units}；可填0至${units - 1}，最大为${units - 1}。` };
    });
  add('borrowdecision', 'borrow-decision-loose-pieces', 'transfer', '从捆和散根的实物状态判断是否要拆捆', '十根一捆的实物清单 → 本位需求 → 拆捆决策',
    '先把实物包装识别为十和一，再判断拿散根是否够，改变了符号算式的表示。', n => {
      const tens = 3 + n % 5, loose = n % 8, needed = 2 + (n * 3) % 7;
      return { stem: `每捆小棒有10根。现在只先拿出${needed}根散棒；按下表的摆放，是否必须先拆开一捆？`, mode: 'single_choice',
        answer: loose < needed ? '必须拆一捆' : '不用拆捆', options: ['必须拆一捆', '不用拆捆'],
        blocks: [{ id: 'bundles', type: 'table', headers: ['摆放方式', '数量'], rows: [['整捆', `${tens}捆`], ['散棒', `${loose}根`]] }],
        analysis: `现有散棒${loose}根，与要拿的${needed}根比较，${loose < needed ? '不够，需要拆一捆换出10根。' : '已经足够，不需要拆捆。'}` };
    });
  add('borrowdecision', 'borrow-decision-work-check', 'transfer', '复核解题者使用的退位判断理由', '给出他人的判断过程 → 找出整数量与个位条件是否冲突',
    '核对一个真实的中间决策及其理由，不要求算出整道减法，避免把减法结果当成判断证据。', n => {
      const tens = 5 + n % 4, subTens = 2 + n % 2, units = n % 5, subUnits = 5 + n % 4;
      return choose(`小林看${tens * 10 + units}−${subTens * 10 + subUnits}，说：“${tens}>${subTens}，所以个位不用退位。”你怎样核对他的决定？`,
        `决定不对，应比较${units}和${subUnits}，个位需要退位`, [`决定正确，十位较大就不用退位`, '还必须先算出整道减法才能判断'],
        `要核对个位是否够减。${units}<${subUnits}，即使十位较大也需要先退1个十。`);
    });

  add('borrowexchange', 'borrow-exchange-balanced-parts', 'procedure', '同时更新被退的十位与增加的个位', '退一次十 → 联动记录两个计数单位',
    '原有单空只问个位；此组同时记录两个位置，观察是否减少十位并增加十个一。', n => {
      const tens = 2 + n % 7, units = n % 8;
      return blanks(`${tens}个十和${units}个一，退1个十换成10个一后，现在各有多少？`,
        [['tens', '现在有几个十', tens - 1], ['ones', '现在有几个一', units + 10]],
        `退去1个十，十的个数为${tens - 1}；换来的10个一与原来的${units}个一合并为${units + 10}。总数仍为${tens * 10 + units}。`);
    });
  add('borrowexchange', 'borrow-exchange-conservation-audit', 'understanding', '检查换算前后数量守恒', '给出三个换算记录 → 排除只加不减或减错单位',
    '需要对比错误表示并识别守恒关系，不是照着“退1”在一个空内加10。', n => {
      const tens = 3 + n % 6, units = n % 8;
      return choose(`把${tens}个十和${units}个一中的1个十换成10个一，下面哪份记录保持了原来的总数？`,
        `${tens - 1}个十和${units + 10}个一`, [`${tens}个十和${units + 10}个一`, `${tens - 1}个十和${units + 1}个一`],
        `只增加10个一会多出10；退去的1个十应换为10个一而不是1个一。正确记录的总数是${(tens - 1) * 10}+${units + 10}=${tens * 10 + units}。`);
    });
  add('borrowexchange', 'borrow-exchange-reverse-representation', 'transfer', '从换算后的非标准表示还原换算前的状态', '已知退位后表示 → 逆向追踪一次交换',
    '正向换算的逆问题，要求还原被改变的两个位置，不是换一个物品名称重复正向操作。', n => {
      const tens = 2 + n % 6, units = 1 + n % 8;
      return blanks(`小禾做过一次“退1个十换10个一”。记录显示换后为${tens}个十和${units + 10}个一。换之前各有多少？`,
        [['tens', '换之前有几个十', tens + 1], ['ones', '换之前有几个一', units]],
        `把换来的10个一还原为1个十：一的个数是${units + 10}−10=${units}，十的个数是${tens}+1=${tens + 1}。`);
    });
  add('borrowexchange', 'borrow-exchange-subtraction-equivalence', 'transfer', '把退位表示带回减法并保持被减数不变', '原减法 → 非标准十和一表示的等价减法',
    '从实物换算迁移到运算等价关系，区分换单位与改变被减数，不要求用整题得分代推该步骤。', n => {
      const tens = 3 + n % 6, units = n % 5, take = units + 2 + n % 3, total = tens * 10 + units;
      return choose(`计算${total}−${take}时先退1个十。哪条算式只改变了表示方式，仍表示原来的减法？`,
        `(${(tens - 1) * 10}+${units + 10})−${take}`, [`(${tens * 10}+${units + 10})−${take}`, `(${(tens - 1) * 10}+${units + 1})−${take}`],
        `退位后的被减数应写为${(tens - 1) * 10}+${units + 10}=${total}；减数${take}保持不变。`);
    });

  add('multiplydigits', 'multiply-digits-tens-contribution', 'understanding', '解释十位部分积的计数单位', '错误的数位分解 → 找到十位部分应贡献的数量',
    '原有算式只看最终乘积，此组直接核查把几个十当几个一的混淆。', n => {
      const tens = 2 + n % 6, units = 1 + n % 8, factor = 2 + n % 6;
      return { stem: `小林把${tens * 10 + units}×${factor}拆成“${tens}×${factor}+${units}×${factor}”。这里十位的${tens}实际表示${tens}个十，十位这一部分应该贡献多少？`,
        answer: tens * 10 * factor, analysis: `${tens}个十是${tens * 10}，十位部分应为${tens * 10}×${factor}=${tens * 10 * factor}；不能把${tens}个十当${tens}个一。` };
    });
  add('multiplydigits', 'multiply-digits-linked-partial-products', 'procedure', '分别算部分积并合并，保留中间观察', '数位分解 → 两个部分积 → 总积',
    '联动记录部分积与总积，能区分漏掉一个数位、部分积计算和合并，不只是再换一个总分输入框。', n => {
      const tens = 2 + n % 6, units = 1 + n % 8, factor = 2 + n % 6;
      return blanks(`按十和一分开计算${tens * 10 + units}×${factor}，分别记录两部分与合并结果。`,
        [['tensProduct', '十位这部分的积', tens * 10 * factor], ['onesProduct', '个位这部分的积', units * factor], ['total', '合并后的积', (tens * 10 + units) * factor]],
        `${tens * 10}×${factor}=${tens * 10 * factor}，${units}×${factor}=${units * factor}，合并得${(tens * 10 + units) * factor}。`);
    });
  add('multiplydigits', 'multiply-digits-split-array', 'transfer', '把空间分区的每行数量转为部分积', '左右分区阵列 → 共同的行数 → 合并两区覆盖数',
    '把分区阵列识别为两块共享行数的量，区别于每袋数量的单层文字题。', n => {
      const tens = 2 + n % 6, units = 1 + n % 8, rows = 2 + n % 6;
      return { stem: `一幅点阵有${rows}行，每一行都按表格分成左区和右区。整幅点阵共有多少个点？`, answer: (tens * 10 + units) * rows,
        blocks: [{ id: 'array', type: 'table', headers: ['区域', '每行点数', '行数'], rows: [['左区', String(tens * 10), String(rows)], ['右区', String(units), String(rows)]] }],
        analysis: `左区${tens * 10}×${rows}=${tens * 10 * rows}，右区${units}×${rows}=${units * rows}；两区合并为${(tens * 10 + units) * rows}个点。` };
    });
  add('multiplydigits', 'multiply-digits-group-model-selection', 'transfer', '从复合包装情境选择同时作用于十和一的模型', '每组十进包装与散件 → 多组复制 → 选择正确的分配模型',
    '题目问数量模型而非直接算答案；需要识别两部分都随组数重复，排除只复制散件或忽略计数单位。', n => {
      const tens = 2 + n % 6, units = 1 + n % 8, groups = 2 + n % 6;
      return choose(`每份材料有${tens}包卡片（每包10张）和${units}张散卡。准备${groups}份相同材料，哪条算式完整表示所需卡片总数？`,
        `${tens * 10}×${groups}+${units}×${groups}`, [`${tens}×${groups}+${units}×${groups}`, `${tens * 10}+${units}×${groups}`],
        `一份中的整包部分是${tens * 10}张，散卡部分是${units}张；准备${groups}份时，两部分都要乘${groups}。`);
    });
  return result;
}

export function buildAllAuthoredMathProbeFamilies() {
  return [...buildAuthoredMathProbeFamilies(), ...buildArithmeticProbeFamilies(), ...buildNumberProbeFamilies(), ...buildSpatialProbeFamilies(), ...buildSecondGradeProbeFamilies()];
}

export function addAuthoredMathProbes(definitions: FoundationDefinition[]) {
  const byId = new Map(definitions.map(definition => [definition.atom.id, definition]));
  for (const family of buildAllAuthoredMathProbeFamilies()) {
    const target = byId.get(family.atomId); if (!target) throw new Error(`Authored probe atom missing: ${family.atomId}`);
    target.exercises.push(...family.exercises);
  }
  return definitions;
}

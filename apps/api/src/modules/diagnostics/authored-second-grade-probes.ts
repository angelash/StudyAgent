import type { MeasurementDimension, QuestionBlock } from '@study-agent/contracts';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'dimension' | 'family'>;
const table = (headers: string[], rows: string[][]): QuestionBlock => ({ id: 'record', type: 'table', headers, rows });
const blanks = (stem: string, values: Array<[string, string, number]>, analysis: string, blocks?: QuestionBlock[]): Task =>
  ({ stem, answer: values.map(([key, , value]) => ({ key, value: String(value) })), mode: 'multi_blank',
    responseShape: { entries: values.map(([key, label]) => ({ key, label })) }, analysis, ...(blocks ? { blocks } : {}) });
const choose = (stem: string, answer: string, alternatives: string[], analysis: string, blocks: QuestionBlock[]): Task =>
  ({ stem, answer, mode: 'single_choice', options: [answer, ...alternatives], analysis, blocks });
const addition = (n: number) => ({ ta: 1 + n % 4, ua: 6 + n % 4, tb: 1 + n % 3, ub: 4 + n % 6 });
const subtraction = (n: number) => ({ ta: 4 + n % 5, ua: n % 4, tb: 1 + n % 2, ub: 5 + (n * 3) % 5 });
const factors = (n: number) => ({ groups: 2 + n % 7, each: 2 + Math.floor(n / 3) % 7 });

/** Original task contrasts. Intermediate records reveal observations, not an automatic claim about a child's cause. */
export function buildSecondGradeProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const add = (code: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string, distinction: string,
    make: (index: number) => Task) => result.push({ atomId: `core:math:${code}`, family, dimension, behavior, structure, distinction,
    exercises: Array.from({ length: 12 }, (_, index) => ({ ...make(index), family, dimension, identityVersion: 2 })) });

  add('carry100', 'carry-quantity-conservation', 'understanding', '核对进位后的十和一是否守恒', '两个加数 → 满十换单位的记录 → 数量核对',
    '核对只保留个位而漏掉新十的记录，不以一次最终算式结果代替单位理解。', n => {
      const { ta, ua, tb, ub } = addition(n), tens = ta + tb + (n % 2 === 0 ? 1 : 0), ones = (ua + ub) % 10;
      return { stem: `把${ta * 10 + ua}与${tb * 10 + ub}合并，个位满十换单位后记为“${tens}个十和${ones}个一”。这份记录与原来的总数相同吗？`,
        answer: n % 2 === 0, mode: 'boolean', analysis: `个位合并有${ua + ub}个一，须换出1个十并留下${ones}个一；十应有${ta + tb + 1}个，总数为${(ta + tb) * 10 + ua + ub}。` };
    });
  add('carry100', 'carry-column', 'procedure', '记录进位加法的个位合并与十位更新', '两位数加法 → 个位总数与进位 → 十位与结果',
    '沿用原竖式加法题族；增加中间观察不因多空或步骤控件另算一个独立题族。', n => {
      const { ta, ua, tb, ub } = addition(n), a = ta * 10 + ua, b = tb * 10 + ub;
      return blanks(`计算${a}+${b}，把个位合并、进位和最后结果分别记下。`, [['ones', '个位合并共有几个一', ua + ub], ['carry', '向十位进几', 1],
        ['tens', '计入进位后共有几个十', ta + tb + 1], ['total', '最后的和', a + b]],
      `${ua}+${ub}=${ua + ub}，满10进1；十位为${ta}+${tb}+1=${ta + tb + 1}，留下个位${(ua + ub) % 10}，和为${a + b}。`);
    });
  add('carry100', 'carry-packaged-merge', 'transfer', '合并两份十进包装并重新规范散件', '两批整捆和散根清单 → 合并与重包 → 新的两栏库存',
    '把包装状态转换成进位后的两单位记录，区别于只给两个总数的普通合并文字题。', n => {
      const { ta, ua, tb, ub } = addition(n);
      return blanks('两批小棒合并，每10根散棒重新扎成一捆，剩余散棒必须少于10根。最后有几捆、几根散棒？',
        [['bundles', '最后的整捆数', ta + tb + 1], ['loose', '最后的散棒数', (ua + ub) % 10]],
        `原有${ta + tb}捆，散棒共${ua + ub}根，可新扎1捆并留下${(ua + ub) % 10}根，最终为${ta + tb + 1}捆。`,
        [table(['批次', '整捆（每捆10根）', '散棒（根）'], [['甲批', String(ta), String(ua)], ['乙批', String(tb), String(ub)]])]);
    });
  add('carry100', 'carry-capacity-decision', 'transfer', '用合并总量核对容量约束', '现有人数与待上车人数 → 进位求和 → 与容量比较',
    '任务要求同时满足数量与容量，不把完成合并运算自动当作会做应用决策。', n => {
      const { ta, ua, tb, ub } = addition(n), current = ta * 10 + ua, waiting = tb * 10 + ub, capacity = current + waiting + (n % 2 ? -1 : 1);
      return { stem: '只考虑表中的乘客人数，不计司机。等待的乘客全部上车后，会超出载客容量吗？', answer: current + waiting > capacity, mode: 'boolean',
        blocks: [table(['记录项目', '人数'], [['已在车上', String(current)], ['等待上车', String(waiting)], ['载客容量', String(capacity)]])],
        analysis: `上车后共${current}+${waiting}=${current + waiting}人，与容量${capacity}人比较，${current + waiting > capacity ? '多1人，会超出。' : '还少1人，不会超出。'}` };
    });

  add('borrow100', 'borrow-value-conservation', 'understanding', '核对退一作十是否保留被减数', '原数 → 换单位记录 → 数量守恒判断',
    '先审查被减数的等值表示，区别于仅看最后差值，不把漏减十位直接归因为某种能力。', n => {
      const { ta, ua } = subtraction(n), tens = ta - (n % 2 === 0 ? 1 : 0);
      return { stem: `为了计算减法，把${ta * 10 + ua}中的1个十换成10个一，记录为“${tens}个十和${ua + 10}个一”。记录仍表示原来的数吗？`,
        mode: 'boolean', answer: n % 2 === 0, analysis: `多出的10个一必须来自退去的1个十，所以正确表示是${ta - 1}个十和${ua + 10}个一，合起来仍为${ta * 10 + ua}。` };
    });
  add('borrow100', 'borrow-column', 'procedure', '跟踪退位后的两个数位及完整差', '两位数减法 → 换单位 → 分位相减 → 合并',
    '沿用原退位竖式题族；中间记录用于观察步骤，不因响应变为多空而新造独立题族。', n => {
      const { ta, ua, tb, ub } = subtraction(n), a = ta * 10 + ua, b = tb * 10 + ub;
      return blanks(`计算${a}−${b}，分别记下退位后的十位、个位相减结果及完整差。`,
        [['tensAfterBorrow', '退位后被减数有几个十', ta - 1], ['onesDifference', '个位相减的结果', ua + 10 - ub], ['total', '完整的差', a - b]],
        `个位${ua}<${ub}，退1个十后为${ta - 1}个十与${ua + 10}个一。个位减得${ua + 10 - ub}，十位减得${ta - 1 - tb}，差为${a - b}。`);
    });
  add('borrow100', 'borrow-packaged-removal', 'transfer', '在整捆和散根库存中完成拆捆与取走', '两单位库存及领取单 → 拆捆换单位 → 两栏剩余',
    '要同时处理完整单位与散件，并保留剩余的两种单位，不是把金额故事换一个物品名称。', n => {
      const { ta, ua, tb, ub } = subtraction(n);
      return blanks('每捆小棒有10根。按清单领取，散根不够时先拆一捆。领取后还剩几整捆、几根散棒？',
        [['bundles', '剩余整捆数', ta - 1 - tb], ['loose', '剩余散棒数', ua + 10 - ub]],
        `先拆1捆，库存改为${ta - 1}捆和${ua + 10}根散棒；领取后剩${ta - 1 - tb}捆与${ua + 10 - ub}根，总数仍符合原库存减去领取数。`,
        [table(['清单', '整捆（每捆10根）', '散棒（根）'], [['原库存', String(ta), String(ua)], ['本次领取', String(tb), String(ub)]])]);
    });
  add('borrow100', 'borrow-first-invalid-step', 'transfer', '定位完整退位记录中最早不成立的步骤', '按顺序的三步记录 → 逐步核对约束 → 首个矛盾',
    '核对过程中的局部守恒与计算，后续步骤可能跟随错误状态；不能只凭最终答案猜错误位置。', n => {
      const { ta, ua, tb, ub } = subtraction(n), faulty = n % 3, tens = ta - (faulty === 0 ? 0 : 1), ones = ua + 10;
      const onesDifference = ones - ub + (faulty === 1 ? 1 : 0), tensDifference = tens - tb + (faulty === 2 ? 1 : 0);
      const names = ['换单位', '减个位', '减十位'];
      return choose(`为计算${ta * 10 + ua}−${tb * 10 + ub}，有人作了以下三步。最早哪一步不符合数量或计算？`, names[faulty], names.filter(name => name !== names[faulty]),
        faulty === 0 ? '换入10个一时，原来的十应减少1；第一步没有减少十，总量已经改变，后续即使按此状态相减也不能补救。' :
          faulty === 1 ? `第一步换单位守恒，但第二步应为${ones}−${ub}=${ones - ub}，这里先出现计算不符。` :
            `前两步均成立，第三步应为${tens}−${tb}=${tens - tb}，这里才出现计算不符。`,
        [table(['步骤', '记录'], [['换单位', `${ta}个十和${ua}个一 → ${tens}个十和${ones}个一`], ['减个位', `${ones}−${ub}=${onesDifference}`], ['减十位', `${tens}−${tb}=${tensDifference}`]])]);
    });

  add('multiplymissing', 'missing-factor-candidate-check', 'understanding', '把候选因数代回乘法检查', '乘法关系与候选值 → 恢复乘积 → 核对原条件',
    '检查一个候选解是否成立，区别于直接给出商；不把错误答案直接映射为某个深层原因。', n => {
      const { groups, each } = factors(n), candidate = each + (n % 2 ? 1 : 0);
      return { stem: `${groups}×□=${groups * each}，有人把□填成${candidate}。代回后等式成立吗？`, answer: n % 2 === 0, mode: 'boolean',
        analysis: `代入得到${groups}×${candidate}=${groups * candidate}，与${groups * each}比较。正确因数为${each}，需要满足完整的乘法关系。` };
    });
  add('multiplymissing', 'missing-factor-equation', 'procedure', '求未知因数并记录代回检查', '符号乘法 → 未知因数 → 代回乘积',
    '保留原未知因数等式题族；求值与验算的多空不额外提供独立题族。', n => {
      const { groups, each } = factors(n);
      return blanks(`${groups}×□=${groups * each}。填写□，再填写把答案代回后算出的乘积。`,
        [['factor', '□里的因数', each], ['check', '代回后算出的乘积', groups * each]],
        `总量${groups * each}分成${groups}个相同部分，每部分为${each}；代回${groups}×${each}=${groups * each}，原条件成立。`);
    });
  add('multiplymissing', 'missing-factor-hidden-array', 'transfer', '由总点数和可数的行数恢复每行点数', '遮挡点阵的全部行记录 → 行数与总数关系 → 每行数量',
    '从空间分行提取组数，每行内容被遮住；不能直接抄表中某个每组数字。', n => {
      const { groups, each } = factors(n);
      return { stem: `下表列出了点阵的全部行，每行点数相同，但各行的点都被遮住。整幅点阵共有${groups * each}个点，每行有几个？`, answer: each,
        blocks: [table(['行标记', '这一行的点'], Array.from({ length: groups }, (_, row) => [String.fromCharCode(65 + row), '整行已遮住']))],
        analysis: `表中共有${groups}行，每行一样多；每行数×${groups}=${groups * each}，因此每行有${each}个点。行标记是位置，不是点数。` };
    });
  add('multiplymissing', 'missing-factor-equal-jumps', 'transfer', '从非零起点和等长跳跃恢复跳数', '起终位置与每跳长度 → 净移动量 → 缺失组数',
    '把位置差对应到总移动量，再恢复等组次数，区别于给定袋数求每袋数的单层故事。', n => {
      const { groups, each } = factors(n), start = 2 + n % 4, end = start + groups * each;
      return { stem: `棋子从刻度${start}出发，每次向右跳${each}格，每次一样长、不回退，最后正好到刻度${end}。一共跳了几次？`, answer: groups,
        analysis: `净移动${end}−${start}=${groups * each}格，不是终点刻度本身。每跳${each}格，共跳${groups}次；${each}×${groups}等于净移动量。` };
    });

  add('multiplerelation', 'multiple-reference-audit', 'understanding', '核对倍数是否以较小量为一份', '两数量与倍数主张 → 明确一份 → 核对份数',
    '核查把较大量本身当倍数的主张；倍数不是物品总数，也不是相差数。', n => {
      const base = 2 + n % 7, ratio = 2 + Math.floor(n / 3) % 6, claim = n % 2 ? base * ratio : ratio;
      return { stem: `甲有${base}枚棋子，乙有${base * ratio}枚。有人说“乙的枚数是甲的${claim}倍”，这句话正确吗？`, answer: n % 2 === 0, mode: 'boolean',
        analysis: `以甲的${base}枚为1份，乙有${ratio}份，所以倍数是${ratio}。不能直接把${base * ratio}枚的数量抄成倍数。` };
    });
  add('multiplerelation', 'multiple-groups', 'procedure', '记录比较量的一份大小与份数', '较大量与参考量 → 每份数量 → 份数',
    '沿用原“几个较小量”的题族；显式记录参考单位不因多空改变关系归属。', n => {
      const base = 2 + n % 7, ratio = 2 + Math.floor(n / 3) % 6;
      return blanks(`${base * ratio}是${base}的几倍？先写比较时每份应有几个，再写一共有几份。`,
        [['unit', '每份应有几个', base], ['groups', '共有几份，也就是几倍', ratio]],
        `用${base}作为一份，${base * ratio}里有${ratio}个这样的份，所以为${ratio}倍，不用两个数相减。`);
    });
  add('multiplerelation', 'multiple-unmarked-strips', 'transfer', '把两条实际点列按参考量重新分组', '两条未分组点列 → 选上条为一份 → 下条包含份数',
    '需要从实际对象建立比较单位；下条不预先画好分组线，也不直接给两条的数字。', n => {
      const base = 2 + n % 4, ratio = 2 + Math.floor(n / 4);
      return { stem: '把上条的全部点看作1份，下条一共包含几份这样的点？只数圆点，文字不是点。', answer: ratio,
        blocks: [table(['点列', '圆点'], [['上条（作为1份）', '● '.repeat(base).trim()], ['下条', '● '.repeat(base * ratio).trim()]])],
        analysis: `上条有${base}个点，是1份；下条有${base * ratio}个点，可分成${ratio}份，所以是${ratio}倍。` };
    });
  add('multiplerelation', 'multiple-changed-reference', 'transfer', '同一比较量在改变参考量后重新确定倍数', '三组数量 → 固定比较量 → 两种参考单位的倍数',
    '保持丙的数量而改变一份大小，观察倍数随参考量变化，不把第一个倍数机械复制。', n => {
      const base = 2 + n % 6, ratio = 4 + Math.floor(n / 6) * 2;
      return blanks('根据表中数量，分别以甲和乙为一份，记录丙是它们的几倍。',
        [['toA', '丙是甲的几倍', ratio], ['toB', '丙是乙的几倍', ratio / 2]],
        `以${base}个为一份时有${ratio}份；以${base * 2}个为一份时，每份加大，份数变为${ratio / 2}。丙的总数没有改变。`,
        [table(['组别', '数量（个）'], [['甲', String(base)], ['乙', String(base * 2)], ['丙', String(base * ratio)]])]);
    });

  add('cmmeters', 'length-unit-conservation', 'understanding', '核对混合单位记录是否保留长度', '米与厘米 → 同单位记录主张 → 进率核对',
    '核对100进率与10进率的差异，不用最终换算题一次错误就确定单位概念原因。', n => {
      const meters = 1 + n % 8, cm = 5 + n * 3, stated = meters * (n % 2 ? 10 : 100) + cm;
      return { stem: `${meters}米${cm}厘米记为${stated}厘米，记录的长度与原来相同吗？`, answer: n % 2 === 0, mode: 'boolean',
        analysis: `1米是100厘米，${meters}米应为${meters * 100}厘米，再加${cm}厘米，合计${meters * 100 + cm}厘米。不能沿用十和一的10进率。` };
    });
  add('cmmeters', 'length-normalized-record', 'procedure', '把超过一米的厘米部分重新记录为米和厘米', '非规范的米厘米记录 → 换出整米 → 保留余厘米',
    '执行两个单位联动更新，并检查总长度守恒，不仅把一个数字乘100。', n => {
      const meters = 1 + n % 5, cm = 105 + n * 7;
      return blanks(`一段绳子记作${meters}米${cm}厘米。把厘米部分换出整米，重新记录，厘米一栏应小于100。`,
        [['meters', '重新记录的米数', meters + 1], ['cm', '重新记录的厘米数', cm - 100]],
        `${cm}厘米可换为1米${cm - 100}厘米，米数应同时增加1，变为${meters + 1}米${cm - 100}厘米，总长度不变。`);
    });
  add('cmmeters', 'length-shifted-ruler-selection', 'transfer', '从非零起点的厘米刻度选择指定米长', '给定米长 → 换同单位 → 检查两端刻度差',
    '区别长度与终点刻度，候选起点非零；不能只寻找数字看起来相同的终点。', n => {
      const meters = 2 + n % 7, start = 20 + n * 13, end = start + meters * 100;
      const candidates = [[start, end], [start, start + meters], [start, meters * 100]], labels = ['甲', '乙', '丙'];
      const rows = labels.map((label, i) => [label, ...candidates[(i + n) % 3].map(String)]), answer = labels[(3 - n % 3) % 3];
      return choose(`纸带长${meters}米。尺子不一定从0开始，下列哪组两端刻度能表示这段长度？所有刻度都用厘米。`,
        answer, labels.filter(label => label !== answer),
        `${meters}米为${meters * 100}厘米，长度是终点减起点；${answer}记录中${end}−${start}=${meters * 100}，不能把终点直接当长度。`,
        [table(['候选纸带', '起点刻度（厘米）', '终点刻度（厘米）'], rows)]);
    });
  add('cmmeters', 'length-composite-inventory', 'transfer', '合并多段混合单位的独立长度记录', '两段米厘米清单 → 各自统一单位 → 合并长度',
    '需要保留每段的单位并合并四个组成部分，区别于读取一个混合单位数或尺上两端位置。', n => {
      const am = 1 + n % 4, ac = 11 + n * 3, bm = 2 + n % 3, bc = 7 + n * 2;
      return { stem: '两段纸带首尾相接，不重叠也不留空隙。按表中长度，接好的纸带长多少厘米？', answer: (am + bm) * 100 + ac + bc,
        blocks: [table(['纸带', '整米部分（米）', '另外的厘米部分（厘米）'], [['甲段', String(am), String(ac)], ['乙段', String(bm), String(bc)]])],
        analysis: `甲段为${am * 100 + ac}厘米，乙段为${bm * 100 + bc}厘米，接好后为${(am + bm) * 100 + ac + bc}厘米。整米与厘米部分都要保留。` };
    });

  add('minutes', 'time-unit-conservation', 'understanding', '区分时分进率与十进单位', '整小时时长与分钟主张 → 60进率核对',
    '各小时数都有正确和错误主张，不让时长本身决定真假；不把时间长度与钟面小时数混用。', n => {
      const hours = 1 + Math.floor(n / 2), claimed = hours * (n % 2 ? 100 : 60);
      return { stem: `一段活动持续${hours}小时，记录员写成${claimed}分钟。这两个时长相同吗？`, answer: n % 2 === 0, mode: 'boolean',
        analysis: `每1小时对应60分钟，${hours}小时是${hours * 60}分钟；不能把时间进率当成100。这里比较的是持续时间，不是某个时刻。` };
    });
  add('minutes', 'time-normalized-record', 'procedure', '把超过一小时的分钟部分换入小时', '小时与超过60的分钟 → 同步换单位 → 规范记录',
    '需要减少分钟并增加小时，记录两个单位的联动；不是仅改变输入控件重做整时乘法。', n => {
      const hours = 1 + n % 5, minutes = 65 + n * 2;
      return blanks(`一段时长记作${hours}小时${minutes}分钟。换出整小时后重新记录，分钟一栏应少于60。`,
        [['hours', '重新记录的小时数', hours + 1], ['minutes', '重新记录的分钟数', minutes - 60]],
        `${minutes}分钟可换为1小时${minutes - 60}分钟，与原来的${hours}小时合并为${hours + 1}小时${minutes - 60}分钟。两个记录的总分钟数相同。`);
    });
  add('minutes', 'time-consecutive-whole-blocks', 'transfer', '合并不重叠的整小时区段再统一成分钟', '连续区段表 → 排除重叠 → 总时长的单位转换',
    '从多个不重叠区段建立整段时长；不读取钟面，不引入跨日或分钟时刻相减。', n => {
      const first = 1 + n % 3, second = 1 + Math.floor(n / 3);
      return { stem: '两个区段依次进行，没有重叠，也没有中间休息。整段活动共持续多少分钟？', answer: (first + second) * 60,
        blocks: [table(['连续区段', '持续时间（小时）'], [['先进行的区段', String(first)], ['接着进行的区段', String(second)]])],
        analysis: `不重叠的时长可以相加，共${first + second}小时；每小时60分钟，合计${(first + second) * 60}分钟。这里的数字是时长，不是开始或结束时刻。` };
    });
  add('minutes', 'time-mixed-unit-budget', 'transfer', '把分钟活动时长与小时预算统一后比较', '小时预算与分钟需求 → 统一单位 → 是否足够',
    '换算后还要判断容量条件；每个小时预算配有一项够用和一项不足的需求，不凭预算大小猜答案。', n => {
      const hours = 1 + Math.floor(n / 2), required = hours * 60 + (n % 2 ? 15 : -15);
      return { stem: `一项活动需要${required}分钟，安排了${hours}小时。只比较总时长，这份时间安排够用吗？`, answer: required <= hours * 60, mode: 'boolean',
        analysis: `预算${hours}小时为${hours * 60}分钟，活动需要${required}分钟。${required <= hours * 60 ? '预算还多15分钟，够用。' : '还缺15分钟，不够用。'}先统一单位再比较。` };
    });
  return result;
}

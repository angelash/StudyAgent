import type { MeasurementDimension, QuestionBlock } from '@study-agent/contracts';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'dimension' | 'family'>;
const table = (headers: string[], rows: string[][]): QuestionBlock => ({ id: 'record', type: 'table', headers, rows });
const blanks = (stem: string, values: Array<[string, string, number | string]>, analysis: string, blocks?: QuestionBlock[]): Task =>
  ({ stem, answer: values.map(([key, , value]) => ({ key, value: String(value) })), mode: 'multi_blank',
    responseShape: { entries: values.map(([key, label]) => ({ key, label })) }, analysis, ...(blocks ? { blocks } : {}) });
const choose = (stem: string, answer: string, alternatives: string[], analysis: string, blocks: QuestionBlock[]): Task =>
  ({ stem, answer, mode: 'single_choice', options: [answer, ...alternatives], analysis, blocks });
const places = ['千位', '百位', '十位', '个位'];
const largerPair = (n: number) => {
  const position = n % 4, a = [2 + Math.floor(n / 4), 2 + n % 4, 3 + n % 5, 1 + n % 6], b = [...a];
  b[position]++;
  for (let i = position + 1; i < 4; i++) { a[i] = 9; b[i] = 0; }
  const first = Number(a.join('')), second = Number(b.join(''));
  return { a: Math.floor(n / 4) % 2 ? second : first, b: Math.floor(n / 4) % 2 ? first : second, position };
};
const addition = (n: number) => ({ ah: 1 + Math.floor(n / 4), at: 6 + n % 4, au: 6 + n % 4,
  bh: 1 + n % 3, bt: 4 + Math.floor(n / 3) % 3, bu: 4 + (n * 3) % 6 });
const subtraction = (n: number) => ({ ah: 5 + n % 4, au: n % 5, bh: 1 + Math.floor(n / 4), bt: 5 + n % 4, bu: 6 + n % 4 });
const grouped = (n: number) => { const size = 3 + n % 6, groups = 2 + Math.floor(n / 2) % 6; return { size, groups, loose: 1 + n % (size - 1) }; };

/** Different observations of unit conservation, grouping and comparison, with explicit response-time estimates. */
export function buildThirdGradeProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const add = (code: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string, distinction: string,
    count: number, expectedSeconds: number, make: (index: number) => Task) => result.push({ atomId: `core:math:${code}`, family, dimension, behavior, structure, distinction,
    exercises: Array.from({ length: count }, (_, index) => ({ ...make(index), family, dimension, expectedSeconds, identityVersion: 2 })) });

  add('compare10000', 'large-first-difference-audit', 'understanding', '核对从高位起第一个不同数位', '两个四位数与数位主张 → 从高到低核对 → 首个不同位',
    '每一对数有正确与错误主张，低位可与高位给出相反表象；不只比较最后一个数字。', 24, 45, n => {
      const { a, b, position } = largerPair(Math.floor(n / 2)), claimed = n % 2 ? (position + 1) % 4 : position;
      return { stem: `比较${a}和${b}。有人记录“从高位起，第一个不同的数位是${places[claimed]}”，这条记录正确吗？`, answer: position === claimed, mode: 'boolean',
        analysis: `先从千位起核对，相同才向下一位移动。两数首个不同位是${places[position]}，较低位的大小不能抵消这里的单位差。` };
    });
  add('compare10000', 'large-compare-symbol', 'procedure', '记录首个不同数位并确定较大整数', '两个四位数 → 逐位比较 → 关键位与较大数',
    '沿用原四位数比较题族；把关键位和最终数分别填写仍是同一逐位比较，不另造题族。', 12, 65, n => {
      const { a, b, position } = largerPair(n);
      return blanks(`比较${a}和${b}，记录从高位起首个不同的数位，再填写较大的完整整数。数位请填千位、百位、十位或个位。`,
        [['place', '首个不同的数位', places[position]], ['larger', '较大的完整整数', Math.max(a, b)]],
        `两数都是四位数；首个不同位为${places[position]}，按该位的计数单位比较，${Math.max(a, b)}较大，不用后面较小的单位推翻结论。`);
    });
  add('compare10000', 'large-split-inventory-compare', 'transfer', '比较分开记录的整千与零件库存', '整千箱与不足一千散件 → 合成同单位总数 → 两仓比较',
    '需要先保留两部分的位值，再比较总量；不能只找散件栏最大的数。', 12, 75, n => {
      const { a, b } = largerPair(n);
      return { stem: '每整箱有1000件，散件栏另记、不包括在整箱内。根据库存表，数量较多的仓库共有多少件？', answer: Math.max(a, b),
        blocks: [table(['仓库', '整箱数（每箱1000件）', '另有散件（件）'], [['甲仓', String(Math.floor(a / 1000)), String(a % 1000)], ['乙仓', String(Math.floor(b / 1000)), String(b % 1000)]])],
        analysis: `甲仓${a}件，乙仓${b}件，整箱和另有散件都要保留。统一为件后逐位比较，多者为${Math.max(a, b)}件。` };
    });
  add('compare10000', 'large-two-bound-eligibility', 'transfer', '同时检查数量的下限与上限', '三个库存候选与两条数量约束 → 双向比较 → 唯一合格候选',
    '任务由找较大数改为同时满足上下限，不能只检查一个方向；综合错答仍需结合基础证据核查。', 12, 75, n => {
      const low = 1100 + n * 157, high = low + 4 + n % 3, quantities = [low - 1, n % 3 === 0 ? low : n % 3 === 1 ? high : low + 1, high + 1], labels = ['甲', '乙', '丙'];
      const rows = labels.map((label, i) => [label, String(quantities[(i + n) % 3])]), answer = rows.find(([, count]) => Number(count) >= low && Number(count) <= high)![0];
      return choose(`需要选择一份库存，数量至少${low}件、至多${high}件。哪个候选同时符合两条要求？`, answer, labels.filter(label => label !== answer),
        `${answer}同时不低于${low}、不高于${high}；另两份分别低于下限或高于上限。不能只选数量最大的一份。`, [table(['候选', '库存数量（件）'], rows)]);
    });

  add('add1000', 'three-digit-carry-conservation', 'understanding', '核对连续进位后各单位是否守恒', '两个三位数 → 两次满十换单位的记录 → 数量核对',
    '先查单位交换后的总量，不把漏记百位进位直接认定为某种能力缺陷。', 12, 60, n => {
      const { ah, at, au, bh, bt, bu } = addition(Math.floor(n / 2)), total = (ah + bh) * 100 + (at + bt) * 10 + au + bu;
      const h = Math.floor(total / 100) - n % 2, t = Math.floor(total / 10) % 10, u = total % 10;
      return { stem: `${ah * 100 + at * 10 + au}+${bh * 100 + bt * 10 + bu}完成连续进位后，记录为${h}个百、${t}个十和${u}个一。记录与原总数相同吗？`, answer: n % 2 === 0, mode: 'boolean',
        analysis: `个位与十位都满十，换出的高一级单位都要计入。总量应为${Math.floor(total / 100)}个百、${t}个十和${u}个一，即${total}，漏记新百会少100。` };
    });
  add('add1000', 'three-digit-add', 'procedure', '跟踪两次进位及最后的和', '三位数加法 → 个位合并与进位 → 十位合并与进位 → 总数',
    '保留原三位数加法题族，五项记录观察连续换单位，不因多空而增加独立题族。', 12, 100, n => {
      const { ah, at, au, bh, bt, bu } = addition(n), a = ah * 100 + at * 10 + au, b = bh * 100 + bt * 10 + bu;
      return blanks(`计算${a}+${b}，分别记录两次合并及进位，再填写最后的和。`,
        [['onesSum', '个位合并共有几个一', au + bu], ['toTens', '向十位进几', Math.floor((au + bu) / 10)],
          ['tensSum', '计入上次进位后共有几个十', at + bt + 1], ['toHundreds', '向百位进几', Math.floor((at + bt + 1) / 10)], ['total', '最后的和', a + b]],
        `个位合并${au + bu}，留${(au + bu) % 10}进1；十位含上次进位共${at + bt + 1}，留${(at + bt + 1) % 10}再进1；百位为${ah + bh + 1}，总数${a + b}。`);
    });
  add('add1000', 'three-digit-packaged-merge', 'transfer', '合并百箱、十捆与散件并重新包装', '两批三级包装库存 → 散件换捆、整捆换箱 → 三栏规范记录',
    '同时更新三个物理单位，不能只写最终总数或遗漏从下一级换来的新单位。', 12, 100, n => {
      const { ah, at, au, bh, bt, bu } = addition(n), total = (ah + bh) * 100 + (at + bt) * 10 + au + bu;
      return blanks('每箱100件、每捆10件，散件和捆均另记、不含在上级包装中。两批合并后，满10散件扎1捆、满10捆装1箱。最后每栏应记多少？捆和散件均少于10。',
        [['hundreds', '整箱数', Math.floor(total / 100)], ['tens', '另外的整捆数', Math.floor(total / 10) % 10], ['ones', '另外的散件数', total % 10]],
        `两批共${total}件，先把散件满十换捆，再把捆满十换箱；最终${Math.floor(total / 100)}箱、${Math.floor(total / 10) % 10}捆、${total % 10}散件，三栏合计仍为原总数。`,
        [table(['批次', '整箱（100件）', '另有整捆（10件）', '另有散件（件）'], [['甲批', String(ah), String(at), String(au)], ['乙批', String(bh), String(bt), String(bu)]])]);
    });
  add('add1000', 'three-digit-first-carry-error', 'transfer', '定位连续进位记录中的最早错误', '按顺序的个位、十位、百位计算 → 跟踪已有进位 → 首个不符',
    '后续步骤可能正确跟随前面的错误记录，不能从最后的数字反猜错误位置。', 12, 100, n => {
      const { ah, at, au, bh, bt, bu } = addition(n), faulty = n % 3, names = ['个位合并', '十位合并', '百位合并'];
      const ones = au + bu + Number(faulty === 0), carry1 = Math.floor(ones / 10), tens = at + bt + carry1 + Number(faulty === 1), carry2 = Math.floor(tens / 10);
      const hundreds = ah + bh + carry2 + Number(faulty === 2);
      return choose(`为计算${ah * 100 + at * 10 + au}+${bh * 100 + bt * 10 + bu}，有人按顺序作了这些记录。最早哪一步的计算不符合它所用的数？`, names[faulty], names.filter(name => name !== names[faulty]),
        `应逐行核对加数与本行结果；后一步使用的是表中上一步实际记下的进位。最早错误在${names[faulty]}，后续计算即使跟随错误进位也不能证明前面成立。`,
        [table(['步骤', '本行计算', '留在本位', '向高位进'], [[names[0], `${au}+${bu}=${ones}`, String(ones % 10), String(carry1)],
          [names[1], `${at}+${bt}+${carry1}=${tens}`, String(tens % 10), String(carry2)], [names[2], `${ah}+${bh}+${carry2}=${hundreds}`, String(hundreds), '不再进位']])]);
    });

  add('subtract1000', 'three-digit-borrow-conservation', 'understanding', '核对跨零退位后的百十个是否保留原数', '零个十的三位数 → 两次换单位 → 原数守恒',
    '区分借到个位与更高位必须同步减少；这里只核对换单位，不把一个判断当作确诊。', 12, 65, n => {
      const { ah, au } = subtraction(Math.floor(n / 2)), claimedH = ah - 1 + n % 2, a = ah * 100 + au;
      return { stem: `把${a}换成便于退位减法的形式，记作${claimedH}个百、9个十和${au + 10}个一。这个表示仍等于原数吗？`, answer: n % 2 === 0, mode: 'boolean',
        analysis: `先拿1个百换10个十，再拿其中1个十换10个一，因此应有${ah - 1}个百、9个十、${au + 10}个一；三项合计仍为${a}。` };
    });
  add('subtract1000', 'three-digit-subtract', 'procedure', '记录跨零退位后的三个单位和差', '百位换十、十位换个 → 当前三单位 → 分位相减',
    '沿用原三位数减法题族；中间值和完整差分别保留，不因字段数另造题族。', 12, 100, n => {
      const { ah, au, bh, bt, bu } = subtraction(n), a = ah * 100 + au, b = bh * 100 + bt * 10 + bu;
      return blanks(`计算${a}−${b}。先完成两次换单位，记录此时被减数的百、十、个数量，再填完整的差。`,
        [['hundreds', '换单位后有几个百', ah - 1], ['tens', '换单位后有几个十', 9], ['ones', '换单位后有几个一', au + 10], ['total', '完整的差', a - b]],
        `${a}先换成${ah - 1}百10十${au}一，再换为${ah - 1}百9十${au + 10}一；逐位相减得到${a - b}。每次换出1个高位单位，都要在原位减1。`);
    });
  add('subtract1000', 'three-digit-packaged-removal', 'transfer', '从无整捆的三级库存拆箱拆捆后领取', '百箱、十捆、散件库存及领取单 → 两次拆包 → 三栏余量',
    '实物包装约束要求从上级依次拆开，不把散件不足只处理成一次增加10。', 12, 100, n => {
      const { ah, au, bh, bt, bu } = subtraction(n);
      return blanks('每箱100件、每捆10件，三栏各自另记。原库存没有整捆，按领取单取货；不足时依次拆箱、拆捆。最后还剩几箱、几捆、几散件？',
        [['hundreds', '剩余整箱数', ah - 1 - bh], ['tens', '另剩整捆数', 9 - bt], ['ones', '另剩散件数', au + 10 - bu]],
        `先拆1箱得10捆，再拆1捆得10散件；领取前为${ah - 1}箱9捆${au + 10}散件，领取后各栏减去对应数量，保留同一总量。`,
        [table(['清单', '整箱（100件）', '另有整捆（10件）', '另有散件（件）'], [['原库存', String(ah), '0', String(au)], ['本次领取', String(bh), String(bt), String(bu)]])]);
    });
  add('subtract1000', 'three-digit-first-borrow-error', 'transfer', '定位跨零退位状态链中最早的数量矛盾', '原数 → 拆百记录 → 拆十记录 → 相减结果 → 最早不成立处',
    '分别核对两次守恒与最后相减，后续状态可以沿错误状态继续正确计算。', 12, 100, n => {
      const { ah, au, bh, bt, bu } = subtraction(n), faulty = n % 3, h = ah - 1 + Number(faulty === 0), tens = 9 + Number(faulty === 1);
      const a = ah * 100 + au, b = bh * 100 + bt * 10 + bu, after = h * 100 + tens * 10 + au + 10, answer = after - b + Number(faulty === 2);
      const names = ['拆百换十', '拆十换一', '计算差'];
      return choose(`为计算${a}−${b}，下面三步按顺序发生。最早哪一步与它前面的数量或相减关系不一致？`, names[faulty], names.filter(name => name !== names[faulty]),
        `先核对拆百是否仍等于${a}，再核对拆十是否保留上一步的总量，最后核对按该状态减${b}的差。最早不成立处为${names[faulty]}，不能只看最终结果。`,
        [table(['步骤', '记录'], [[names[0], `${h}个百、10个十、${au}个一`], [names[1], `${h}个百、${tens}个十、${au + 10}个一`], [names[2], `${after}−${b}=${answer}`]])]);
    });

  add('remainderdivision', 'remainder-complete-claim', 'understanding', '同时核对分组重建与余数小于除数', '总量、每组数及商余主张 → 数量重建与边界 → 是否分完',
    '保留总量不一定已经分完，余数够一组必须继续分；也检查看似合法但总量不符的记录。', 12, 65, n => {
      const { size, groups, loose } = grouped(Math.floor(n / 2)), total = size * groups + loose;
      const q = groups - Number(n % 4 === 1), r = loose + (n % 4 === 1 ? size : n % 4 === 3 ? 1 : 0);
      const valid = q * size + r === total && r >= 0 && r < size;
      return { stem: `${total}÷${size}，有人写“商${q}，余${r}”，并说已经分完。数量关系和分完的条件都成立吗？`, answer: valid, mode: 'boolean',
        analysis: `须同时满足${size}×商+余数=${total}及0≤余数<${size}。正确为商${groups}、余${loose}；只重建总量或只检查余数大小，都不足以判定。` };
    });
  add('remainderdivision', 'remainder-expression', 'procedure', '分别计算完整组数和不足一组的余量', '有余数除法 → 完整组数 → 剩余量与重建',
    '保留原求余题族，显式区分商的组与余数的个，不因双空拆成两种独立任务。', 12, 75, n => {
      const { size, groups, loose } = grouped(n), total = size * groups + loose;
      return blanks(`计算${total}÷${size}，分别记录商和余数。必须分到剩余数量不足再成一组。`, [['quotient', '完整组数，也就是商', groups], ['remainder', '不足一组的数量，也就是余数', loose]],
        `${size}×${groups}=${size * groups}，再留下${loose}，两部分合计${total}；${loose}<${size}，不能再成一组。商与余数的单位不同。`);
    });
  add('remainderdivision', 'remainder-actual-rows', 'transfer', '从全部实际点列区分满行与未满行余量', '按固定容量排好的全部圆点 → 满行计数 → 末行点数',
    '从实际对象恢复两种数量，不把行号或最后一行的位置当成余数，也不预写总量答案。', 12, 85, n => {
      const { size, groups, loose } = grouped(n);
      return blanks(`按每行最多${size}枚、满一行才放下一行的规则摆圆点，下面列出全部圆点。分别记录有几行已放满、未满行还放着几枚。文字和表格线不是圆点。`,
        [['fullRows', '已放满的行数', groups], ['loose', '未满行的圆点枚数', loose]],
        `逐行按每行${size}枚核对，有${groups}行已满，未满行有${loose}枚。后者不足${size}枚，对应余量，不是${groups + 1}这个行号。`,
        [table(['行标记', '这一行的圆点'], Array.from({ length: groups + 1 }, (_, row) => [String.fromCharCode(65 + row), '● '.repeat(row < groups ? size : loose).trim()]))]);
    });
  add('remainderdivision', 'remainder-completion-constraint', 'transfer', '按目标区分只数整盒与全部装完', '同一总量与容量 → 目标是否允许未装散件 → 需要的盒数',
    '同一分组条件分别询问完整盒数和全部装入的最少盒数，不能把商一律直接当最终决策。', 12, 75, n => {
      const { size, groups, loose } = grouped(Math.floor(n / 2)), all = n % 2 === 1, total = size * groups + loose;
      return { stem: `${total}枚棋子，每盒最多装${size}枚，按先装满一盒再装下一盒的规则。${all ? '要把全部棋子装入，最后一盒允许不满，最少需要几个盒子？' : '只统计恰好装满的盒子，零散棋子先不装盒，能装满几个盒子？'}`,
        answer: groups + Number(all), analysis: `${total}可分为${groups}整盒与${loose}枚散件。${all ? `散件也必须装入，还需1盒，所以最少${groups + 1}盒。` : `只数已装满的盒子，散件不计整盒，因此为${groups}盒。`}需先核对完成目标。` };
    });

  add('mixedorder', 'mixed-precedence-record-audit', 'understanding', '核对乘除部分先形成整体的计算记录', '不带括号的加乘或加除记录 → 高优先部分 → 总量主张',
    '乘法和除法都有成立与不成立主张；不能把从左到右的结果直接当顺序成立。', 12, 65, n => {
      const index = Math.floor(n / 2), divisor = 2 + index % 4, groups = 3 + index, extra = divisor * (2 + index % 3), divide = index % 2 === 1;
      const a = extra, b = divide ? divisor * groups : groups, c = divisor, first = divide ? b / c : b * c;
      const claimed = n % 2 ? divide ? (a + b) / c : (a + b) * c : a + first;
      return { stem: `核对记录“${a}+${b}${divide ? '÷' : '×'}${c}=${claimed}”。按规定的运算顺序，这条记录正确吗？`, answer: n % 2 === 0, mode: 'boolean',
        analysis: `先把${b}${divide ? '÷' : '×'}${c}算成${first}，再加外面的${a}，正确结果${a + first}；不能让外面的加数也参加右边的乘除。` };
    });
  add('mixedorder', 'product-before-add-start', 'procedure', '先记录乘积再合并外部加数', '散加数＋乘法部分 → 局部乘积 → 整式结果',
    '沿用原乘法先于加法题族；局部和最终双栏记录不另造题族。', 12, 75, n => {
      const extra = 3 + n, groups = 2 + n % 7, each = 2 + Math.floor(n / 4) % 3;
      return blanks(`计算${extra}+${groups}×${each}。先写乘法部分的结果，再写整个式子的结果。`, [['first', '乘法部分的结果', groups * each], ['total', '整式结果', extra + groups * each]],
        `先算${groups}×${each}=${groups * each}，再算${extra}+${groups * each}=${extra + groups * each}。外部加数不被重复相乘。`);
    });
  add('mixedorder', 'division-before-additive', 'procedure', '先记录除法分组结果再相加', '散加数＋除法部分 → 完整分组数量 → 整式结果',
    '补充原点目标中的除法优先，不把除法假称为原乘法题族，也不由同题的两栏获得两份独立证据。', 12, 75, n => {
      const extra = 2 + n, size = 2 + n % 7, groups = 3 + Math.floor(n / 3) % 5;
      return blanks(`计算${extra}+${size * groups}÷${size}。先写除法部分的结果，再写整个式子的结果。`, [['first', '除法部分的结果', groups], ['total', '整式结果', extra + groups]],
        `先算${size * groups}÷${size}=${groups}，再加${extra}，得${extra + groups}；除法只作用于它两侧的数。`);
    });
  add('mixedorder', 'mixed-repeated-price-and-fee', 'transfer', '区分重复单价与只收一次的费用', '单价、份数与一次费用清单 → 确定重复范围 → 应付总额',
    '从收费约束建立运算关系，不能把只收一次的费用也按份数重复。', 12, 80, n => {
      const fee = 2 + n, price = 3 + n % 5, count = 2 + Math.floor(n / 3) % 5;
      return { stem: '票价按张数计算，服务费整单只收一次。按表中收费记录，这一单共需付多少元？', answer: price * count + fee,
        blocks: [table(['收费项目', '金额（元）', '计费条件'], [['每张票价', String(price), `共${count}张`], ['整单服务费', String(fee), '只收一次']])],
        analysis: `票款为${price}×${count}=${price * count}元，整单费用只加${fee}元一次，合计${price * count + fee}元，不能把服务费也乘${count}。` };
    });
  add('mixedorder', 'mixed-group-summary', 'transfer', '先把散件总量平均装包再汇总已有包数', '待分散件与每包数、已有包数 → 转换为同单位 → 总包数',
    '将物品数通过除法转成包数后才能相加，区别于直接把不同单位数字合并。', 12, 80, n => {
      const existing = 2 + n, size = 2 + n % 6, groups = 3 + Math.floor(n / 4) % 3;
      return { stem: `已有${existing}包装好的棋子。另外还有${size * groups}枚散棋子，未计入这些包，按每包${size}枚恰好装完。最后一共有几包？`, answer: existing + groups,
        analysis: `先把${size * groups}枚按每包${size}枚装成${groups}包，再与已有${existing}包相加，得${existing + groups}包。枚数不能直接与包数相加。` };
    });

  add('mass', 'mass-unit-conservation', 'understanding', '核对千克克记录的1000进率', '混合质量记录 → 单位统一主张 → 等值核对',
    '同一质量分别有正确与100进率的错误记录，不让质量本身决定真假。', 12, 60, n => {
      const index = Math.floor(n / 2), kg = 1 + index, grams = 25 + index * 17, claimed = kg * (n % 2 ? 100 : 1000) + grams;
      return { stem: `${kg}千克${grams}克写作${claimed}克，这条记录表示的质量与原来相同吗？`, answer: n % 2 === 0, mode: 'boolean',
        analysis: `1千克=1000克，${kg}千克为${kg * 1000}克，再加${grams}克，应为${kg * 1000 + grams}克；不能沿用100的进率。` };
    });
  add('mass', 'mass-simple', 'procedure', '把整千克换成克', '整千克数量 → 1000进率 → 同一质量的克数',
    '保留原整千克换算题族；补原题中尚无的2、4、6、7、8、9千克，不机械补足12题，也不因换单位另造族。', 6, 45, n => ({
      stem: `${[2, 4, 6, 7, 8, 9][n]}千克等于多少克？`, answer: [2, 4, 6, 7, 8, 9][n] * 1000,
      analysis: `每1千克对应1000克，${[2, 4, 6, 7, 8, 9][n]}千克合计${[2, 4, 6, 7, 8, 9][n] * 1000}克。换的是表示单位，质量没有改变。`,
    }));
  add('mass', 'mass-mixed-label-compare', 'transfer', '统一不同包装标签后比较质量', '一个千克克混合标签与一个克标签 → 同单位 → 轻重比较',
    '先确认单位再比较，不能把单位前数字较大的包装直接当作较重。', 12, 80, n => {
      const kg = 1 + Math.floor(n / 2), grams = 50 + Math.floor(n / 2) * 31, a = kg * 1000 + grams, b = a + (n % 2 ? -50 : 50), answer = a > b ? '甲' : '乙';
      return choose('只比较表中包装的质量，哪份更重？请先把单位统一。', answer, ['甲', '乙', '两份一样重'].filter(value => value !== answer),
        `甲为${kg}千克${grams}克，即${a}克；乙为${b}克。同单位比较后${answer}更重，不能只看原标签上的数字。`,
        [table(['包装', '质量标签'], [['甲', `${kg}千克${grams}克`], ['乙', `${b}克`]])]);
    });
  add('mass', 'mass-label-normalization', 'transfer', '把非规范质量标签换成规范千克克双栏', '克部分超过1000的混合标签 → 换出整千克 → 两栏联动',
    '需要同时改变千克与克两栏并保留质量，不是只抄小数或只去掉克前的一位。', 12, 80, n => {
      const kg = 1 + n % 5, grams = 1005 + n % 3 * 1000 + Math.floor(n / 3) * 73, exchanged = Math.floor(grams / 1000);
      return blanks(`一份质量标签记为${kg}千克${grams}克。改成克部分小于1000的千克克记录，填写两个部分。`,
        [['kg', '重新记录的千克数', kg + Math.floor(grams / 1000)], ['grams', '另有的克数', grams % 1000]],
        `${grams}克可换出${exchanged}千克并留下${grams % 1000}克；千克部分同时增加${exchanged}，变成${kg + exchanged}千克${grams % 1000}克，质量仍为${kg * 1000 + grams}克。`);
    });
  return result;
}

import type { MeasurementDimension, QuestionBlock } from '@study-agent/contracts';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'family' | 'dimension'>;
const table = (headers: string[], rows: string[][]): QuestionBlock => ({ id: 'record', type: 'table', headers, rows });
const blanks = (stem: string, values: Array<[string, string, number | string]>, analysis: string, blocks?: QuestionBlock[]): Task => ({ stem,
  mode: 'multi_blank', answer: values.map(([key, , value]) => ({ key, value: String(value) })),
  responseShape: { entries: values.map(([key, label]) => ({ key, label })) }, analysis, ...(blocks ? { blocks } : {}) });
const factors = (value: number) => Array.from({ length: value }, (_, index) => index + 1).filter(divisor => value % divisor === 0);
const kind = (value: number) => value === 1 ? '既不是质数也不是合数' : factors(value).length === 2 ? '质数' : '合数';
const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
const lcm = (a: number, b: number) => a * b / gcd(a, b);
const pairs: Array<[number, number]> = [[1, 7], [6, 6], [4, 12], [8, 12], [9, 15], [14, 21], [7, 9], [12, 18], [10, 25], [16, 24], [18, 30], [15, 20]];

/** Finite original structures. Intermediate fields remain one response and do not create child estimates. */
export function buildFactorMultipleProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const add = (code: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string,
    distinction: string, expectedSeconds: number, make: (index: number) => Task) => result.push({ atomId: `core:math:${code}`, family, dimension,
    behavior, structure, distinction, exercises: Array.from({ length: 12 }, (_, index) => ({ ...make(index), family, dimension, identityVersion: 2, expectedSeconds })) });

  add('factor', 'factor-divisibility', 'understanding', '用整除核对因数关系的方向',
    '明确两个正整数 → 判断有方向的因数关系', '沿用旧因数判定结构；相同数量成对核对正确与反向主张，相等时另用非因数反例。', 70, n => {
      const [a, b] = [[1, 7], [2, 6], [3, 12], [5, 5], [6, 24], [7, 35]][Math.floor(n / 2)];
      const divisor = n % 2 ? a === b ? a - 1 : b : a, target = n % 2 && a !== b ? a : b;
      return { stem: `只讨论正整数因数。判断“${divisor}是${target}的因数”是否成立。`, mode: 'boolean', answer: target % divisor === 0,
        analysis: `应检查${target}能否被${divisor}整除，不能把关系方向倒过来；${target}÷${divisor}${target % divisor ? '有余数，不能整除' : '没有余数，可以整除'}。1和一个正整数本身也可作它的因数。` };
    });
  add('factor', 'factor-paired-enumeration', 'procedure', '补全因数对并去除平方数的重复记录',
    '全部正整数因数对的表 → 恢复被遮因数 → 统计不同正因数', '平方根在同一对出现两次时只算一个不同因数，1也单独核对。', 105, n => {
      const value = [1, 2, 4, 9, 16, 18, 24, 25, 30, 36, 49, 60][n], small = factors(value).filter(divisor => divisor * divisor <= value), hidden = n % small.length;
      return blanks(`下表包含${value}的全部正整数因数对，每对乘积均为${value}，其中一个搭档被遮住。补全后统计不同的正因数，重复数只记一次。`,
        [['partner', '被遮住的搭档', value / small[hidden]], ['distinct', '不同正因数的个数', factors(value).length]],
        `每对乘积都要等于${value}；被遮住的搭档为${value / small[hidden]}。合并各行且去除重复后，正因数是${factors(value).join('、')}，共${factors(value).length}个。`,
        [table(['较小因数', '搭档'], small.map((divisor, index) => [String(divisor), index === hidden ? '被遮住' : String(value / divisor)]))]);
    });
  add('factor', 'factor-pack-remainder-record', 'transfer', '从实际商余记录确认可整装的容量',
    '每盒容量及真实装盒商余表 → 选择因数资格', '不凭容量小于总数推断；有余数即不满足整装，容量1与全部装一盒均保留。', 100, n => {
      const total = 18 + n * 3, capacities = [1, 2 + n % 4, total - 1, total], options = capacities.map(String);
      return { stem: `有${total}枚棋子。下表分别尝试每盒装不同数量，完整列出装满盒数和剩余枚数。哪些每盒容量是棋子总数的因数，能恰好全部装满且无剩余？选择所有符合的容量。`,
        mode: 'multiple_choice', options, answer: capacities.filter(capacity => total % capacity === 0).map(String),
        blocks: [table(['每盒容量（枚）', '装满盒数', '剩余（枚）'], capacities.map(capacity => [String(capacity), String(Math.floor(total / capacity)), String(total % capacity)]))],
        analysis: `因数资格要求整除，商余表中只有剩余为0的容量符合。应选${capacities.filter(capacity => total % capacity === 0).join('、')}，不能因为某容量较小或装满过几盒就确认。` };
    });
  add('factor', 'factor-integer-rectangle-bound', 'transfer', '由面积和允许边长范围反向恢复可行整数边',
    '精确面积、宽的闭区间和长的下界 → 枚举完整整数矩形', '先核对面积能被宽整除，再核对另一边范围；不是在无限因数集合中只求最大值。', 110, n => {
      const area = 24 + n * 6, maxWidth = 6 + n % 4;
      const feasible = factors(area).filter(width => width >= 2 && width <= maxWidth && area / width >= 2);
      return blanks(`一个矩形面积恰为${area}平方厘米，其中一条指定边只能取2到${maxWidth}厘米之间的整数（含两端），另一条边也必须是整数且至少2厘米。共有几种指定边长可用？其中最大值是多少厘米？指定边既可以是较长边，也可以是较短边，按它的不同长度计数。`,
        [['widthCount', '指定边可行长度的个数', feasible.length], ['largestWidth', '指定边的最大可行长度（厘米）', Math.max(...feasible)]],
        `逐个检查允许的指定边长能否整除${area}，且所得另一边至少2厘米。可行长度为${feasible.join('、')}，共${feasible.length}种，最大为${Math.max(...feasible)}厘米。`);
    });

  add('multiple', 'multiple-positive-direction-claim', 'understanding', '核对倍数的方向与正数范围',
    '一组整倍数量 → 有方向的正倍数主张', '相等关系成立；0即使能写成乘0也不是本题要求的正倍数。', 70, n => {
      const [a, b] = [[2, 6], [3, 12], [5, 5], [1, 9], [7, 28], [4, 20]][Math.floor(n / 2)];
      const claimed = n % 2 ? a === b || a === 1 ? 0 : a : b, base = n % 2 && a !== b && a !== 1 ? b : a;
      return { stem: `本题只讨论正倍数（不包括0）。判断“${claimed}是${base}的正倍数”是否成立。`, mode: 'boolean', answer: claimed > 0 && claimed % base === 0,
        analysis: `正倍数要能写成${base}乘一个正整数，且大于0。${claimed === 0 ? '0不在正倍数范围内。' : `${claimed}÷${base}${claimed % base ? '有余数，方向不成立。' : '为正整数，关系成立。'}`}` };
    });
  add('multiple', 'multiple-generation', 'procedure', '按正倍数序号保留当前和后继数量',
    '基数与第几个正倍数 → 当前数量 → 后一个正倍数', '沿用旧给定倍数的计算结构；多一个记录空不增加独立样本。', 85, n => {
      const base = 2 + n % 7, index = 1 + n;
      return blanks(`把${base}依次乘1、2、3……得到正倍数表。记录它的第${index}个正倍数，以及紧接的后一个正倍数。`,
        [['current', '当前指定正倍数', base * index], ['next', '后一个正倍数', base * (index + 1)]],
        `第${index}个正倍数为${base}×${index}=${base * index}，后一个再多${base}，为${base * (index + 1)}。序号从1开始，不能把0算作第1个正倍数。`);
    });
  add('multiple', 'multiple-offset-event-ledger', 'transfer', '分开首次事件与之后的等间隔倍数',
    '非零首次记录与等间隔表 → 数间隔 → 恢复指定次事件', '第1次就是首个记录，事件次数比此后的间隔数多1，不能把起点当0或直接乘事件序号。', 105, n => {
      const first = 5 + n * 3, interval = 2 + n % 5, count = 3 + n % 4;
      return blanks(`观察员从计时第${first}分钟记录第1次响铃，此后每隔${interval}分钟响一次。下表开头记录完整。第${count + 1}次响铃相对第1次经过几个间隔？发生在计时第几分钟？`,
        [['intervals', '相对第1次的间隔数', count], ['minute', '计时第几分钟', first + interval * count]],
        `从第1次到第${count + 1}次共经过${count}个间隔，经过${interval * count}分钟。加上首次的计时位置${first}，得到第${first + interval * count}分钟。`,
        [table(['事件次序', '计时位置（分钟）'], Array.from({ length: 3 }, (_, index) => [String(index + 1), String(first + index * interval)]))]);
    });
  add('multiple', 'multiple-inverse-whole-groups', 'transfer', '由全部数量恢复完整组数并检查余数',
    '每完整组数量与全部库存 → 可组成的完整组 → 正倍数资格', '存在零散时不能把全部库存看成整倍数；先恢复组数，不把商近似为整数倍。', 105, n => {
      const per = 3 + n % 5, groups = 2 + n, remainder = n % 2, total = per * groups + remainder;
      return blanks(`一整组有${per}枚棋子，现有${total}枚，必须保留全部库存，不丢弃、不补充。最多可组成几整组？还剩几枚？全部库存是否恰好是每组数量的正倍数（填是或否）？`,
        [['groups', '完整组数', groups], ['remainder', '剩余枚数', remainder], ['isMultiple', '全部库存恰是正倍数', remainder ? '否' : '是']],
        `${total}=${per}×${groups}+${remainder}。可组成${groups}整组，余${remainder}枚；${remainder ? '存在零散，全部库存不是整倍数。' : '无剩余，全部库存是正倍数。'}`);
    });

  add('prime', 'prime-rule-counterexample', 'understanding', '用实际反例核对列表中的分类规则',
    '有限正整数列表 → 核对奇偶规则或两个因数的定义', '比较整份分类主张，不把某个奇数或大于1的数直接当质数；所有结论只针对给出的列表。', 85, n => {
      const values = [[1, 2, 9, 11], [2, 3, 15, 17], [1, 5, 21, 23], [2, 7, 25, 29], [1, 11, 49, 31], [2, 13, 27, 37]][Math.floor(n / 2)];
      const rule = n % 2 ? '奇数' : '恰有两个不同正因数的数';
      const named = values.filter(value => n % 2 ? value % 2 === 1 : factors(value).length === 2);
      return { stem: `只评价下表中的正整数。有人说：“本表中所有${rule}都是质数。”这份分类主张成立吗？`, mode: 'boolean', answer: named.every(value => kind(value) === '质数'),
        blocks: [table(['待核对正整数'], values.map(value => [String(value)]))],
        analysis: n % 2 ? `奇数不一定是质数，本表中的${values.filter(value => value % 2 && kind(value) !== '质数').join('、')}就是反例；1也不能当质数。`
          : '质数要求恰有1和自身两个不同的正因数，这个标准能正确分类本表中的对应数；不能改成只看奇偶。' };
    });
  add('prime', 'prime-factor-count', 'procedure', '按完整正因数个数恢复分类',
    '给定正整数 → 完整枚举不同因数 → 质合数分类', '沿用旧分类结构，不因增加因数个数空而重新计算一份独立分类证据。', 110, n => {
      const value = [1, 2, 4, 7, 9, 11, 15, 17, 25, 29, 49, 97][n];
      return blanks(`完整检查正整数${value}的所有正因数，重复的数只计一次。记录不同正因数的个数和分类（填质数、合数或既不是质数也不是合数）。`,
        [['divisorCount', '不同正因数的个数', factors(value).length], ['kind', '分类', kind(value)]],
        `${value}的正因数为${factors(value).join('、')}，共${factors(value).length}个，分类为${kind(value)}。1只有一个正因数；2虽然是偶数，仍是质数。`);
    });
  add('prime', 'prime-nontrivial-rectangle-existence', 'transfer', '用非单行整数矩形辨别合数与1的例外',
    '单位方片总数 → 是否存在两边都至少2的完整矩形 → 分类', '形状存在性要求非平凡因数；不能因为无法排成多行就把1也叫质数。', 105, n => {
      const value = [1, 2, 3, 4, 5, 6, 9, 11, 16, 19, 25, 49][n], possible = factors(value).some(divisor => divisor >= 2 && value / divisor >= 2);
      return blanks(`有${value}块相同单位正方形，全部使用、不重叠、不留空。能否排成至少2行、每行也至少2块的完整长方形（填是或否）？再按正因数定义给总块数分类。`,
        [['rectangle', '能排出所要求的长方形', possible ? '是' : '否'], ['kind', '总块数分类', kind(value)]],
        `${possible ? `${value}存在两边都至少2的整数因数对，能形成所要求的长方形，因此为合数。` : value === 1 ? '1无法形成所要求的长方形，但只有一个正因数，质数和合数都不是。' : `${value}只有1和自身两个正因数，只能形成单行或单列，因此是质数。`}`);
    });
  add('prime', 'prime-factorization-certificate', 'transfer', '区分真正的合数证书与信息不足',
    '给定乘积记录 → 是否给出非平凡因数 → 证据能够确认的结论', '1×一个数不能据此确认合数或质数；即使那个数实际为合数，这张证书也可能不足。', 100, n => {
      const [a, b] = [[1, 1], [1, 2], [2, 2], [3, 3], [1, 9], [2, 7], [3, 5], [1, 23], [5, 5], [3, 11], [1, 49], [7, 7]][n];
      const value = a * b, nontrivial = a > 1 && b > 1;
      return blanks(`证书只给出“${value}=${a}×${b}”。只使用这张证书，不补做别的因数检查：它是否已经给出大于1且小于总数的因数、足以确认总数为合数（填是或否）？若有，记录等号右侧的第一个因数；没有则填0。不能把证据不足改说成质数。`,
        [['provesComposite', '这张证书足以确认合数', nontrivial ? '是' : '否'], ['nontrivialFactor', '证书第一个非平凡因数，无则0', nontrivial ? a : 0]],
        nontrivial ? `${a}大于1且小于${value}，与${b}相乘得到${value}，已经给出非平凡因数，足以确认合数。`
          : `这张证书只有1与总数，未给非平凡因数，不能只凭它确认合数，也不能由证据不足推断为质数。`);
    });

  add('gcd', 'gcd-common-and-largest-claim', 'understanding', '同时核对共同与最大的条件',
    '两个正整数与一个候选 → 检查整除两边及最大性', '包含互质、相等和一数整除另一数；共同因数不一定最大，只整除一边也不成立。', 80, n => {
      const [a, b] = pairs[Math.floor(n / 2)], greatest = gcd(a, b), candidate = n % 2 ? greatest === 1 ? b : 1 : greatest;
      return { stem: `有人说：“${candidate}是${a}与${b}的最大公因数。”这个结论成立吗？须同时满足共同与最大两个条件。`, mode: 'boolean', answer: candidate === greatest,
        analysis: `先确认候选能同时整除${a}和${b}，再检查是否还有更大的共同因数。它们的公因数为${factors(greatest).join('、')}，最大是${greatest}。` };
    });
  add('gcd', 'gcd-numbers', 'procedure', '从两份完整因数集合记录共有部分',
    '两个整数 → 共有因数的个数 → 最大公因数', '沿用旧最大公因数直接计算结构，多空仍是一份过程响应。', 110, n => {
      const [a, b] = pairs[n], greatest = gcd(a, b);
      return blanks(`求${a}与${b}的最大公因数。先分别检查全部正因数，记录公因数的个数，再记录其中最大的一个。`,
        [['commonCount', '不同公因数的个数', factors(greatest).length], ['greatest', '最大公因数', greatest]],
        `两个数共有的正因数是${factors(greatest).join('、')}，共${factors(greatest).length}个，最大为${greatest}；只检查一个数不够。`);
    });
  add('gcd', 'gcd-sharing', 'transfer', '在最多相同份约束下保持两种库存守恒',
    '两种库存 → 最多相同份 → 每份各自数量', '沿用旧平均分给尽可能多人的结构；既要无剩余，也要每份构成相同。', 115, n => {
      const [pens, books] = pairs[n], people = gcd(pens, books);
      return blanks(`把${pens}支笔和${books}本簿全部分成尽可能多的相同份，每份都有这两种物品，各份中的笔数相同、簿数也相同，两种都不能剩余。最多几份？每份各有多少？`,
        [['shares', '最多相同份数', people], ['pensEach', '每份笔数', pens / people], ['booksEach', '每份簿数', books / people]],
        `份数须同时整除${pens}与${books}且尽可能大，所以取最大公因数${people}；每份${pens / people}支笔、${books / people}本簿，分别乘回${people}份可核对原库存。`);
    });
  add('gcd', 'gcd-largest-square-tiling', 'transfer', '将最大等边切分转成两个边长的共同因数',
    '矩形两边 → 整格切成最大正方形 → 边长与块数', '明确沿边成行成列切分、不拼接、不浪费；最大边长与最终块数的单位不同。', 115, n => {
      const [width, height] = pairs[n], side = gcd(width, height);
      return blanks(`一张长方形纸的两条相邻边分别为${width}厘米和${height}厘米，沿边成行成列切成同样大的正方形，不拼接、无剩余。每块边长须为正整数厘米，并且尽可能大。边长应是多少厘米？一共切成几块？`,
        [['side', '最大正方形边长（厘米）', side], ['pieces', '正方形块数', width / side * (height / side)]],
        `正方形边长必须同时整除${width}和${height}，最大为${side}厘米。两向分别为${width / side}和${height / side}块，共${width / side * (height / side)}块；不是把最大公因数直接当块数。`);
    });

  add('lcm', 'lcm-common-positive-minimum-claim', 'understanding', '同时核对共同、正数和最小三个条件',
    '两个周期单位与候选 → 判断是否最小正公倍数', '积可能是共同但非最小；互质时积可成立，0始终不满足正数要求。', 85, n => {
      const [a, b] = [[1, 7], [6, 6], [4, 12], [6, 8], [7, 9], [3, 5]][Math.floor(n / 2)], least = lcm(a, b);
      const candidate = n % 2 ? a * b !== least ? a * b : a === 1 ? 0 : Math.max(a, b) : least;
      return { stem: `有人说：“${candidate}是${a}与${b}的最小正公倍数。”结论成立吗？这里明确排除0。`, mode: 'boolean', answer: candidate === least,
        analysis: `候选须是正数，同时能被${a}和${b}整除，并且没有更小正数也满足。最小为${least}，积${a * b}${a * b === least ? '在这组数中恰好最小' : '虽然是共同倍数，但还不是最小'}。` };
    });
  add('lcm', 'lcm-numbers', 'procedure', '保留首个共同正倍数及两边次数',
    '两个整数 → 最小正公倍数 → 各自倍数序号', '沿用旧最小公倍数直接计算结构，不把两边次数当两个知识点样本。', 110, n => {
      const [a, b] = pairs[n], least = lcm(a, b);
      return blanks(`求${a}与${b}的最小正公倍数，并分别记录它是这两个数的第几个正倍数（按题目先后顺序）。`,
        [['least', '最小正公倍数', least], ['copiesA', '是前一个数的第几个正倍数', least / a], ['copiesB', '是后一个数的第几个正倍数', least / b]],
        `第一个共同正倍数为${least}；${a}×${least / a}=${least}，${b}×${least / b}=${least}。0不能算入最小正倍数。`);
    });
  add('lcm', 'lcm-cycle', 'transfer', '由共同起点恢复下次共同事件的时间位置',
    '同起点两周期 → 首个正共同间隔 → 下一次计时位置', '沿用旧再次共同值日的周期结构；共同起点不是再次事件，不把0当答案。', 115, n => {
      const [a, b] = pairs[n], first = 5 + n * 2, elapsed = lcm(a, b);
      return blanks(`甲灯每${a}分钟亮一次，乙灯每${b}分钟亮一次。两灯在计时第${first}分钟同时亮，此后各自按周期继续。至少再过多少分钟才会再次同时亮？下一次在计时第几分钟？起点这一次不算再次。`,
        [['elapsed', '至少再过的分钟数', elapsed], ['minute', '下次计时第几分钟', first + elapsed]],
        `再次同时亮的间隔必须为两个周期的共同正倍数，最小是${elapsed}分钟；计时位置为${first}+${elapsed}=${first + elapsed}分钟。`);
    });
  add('lcm', 'lcm-alternative-whole-pack-inventory', 'transfer', '在两种各自整包装方案中求最小正库存',
    '两种可选整包装容量 → 每种方案都可无剩余 → 最少库存与盒数', '两种方案分别包装同一库存，不混用两种盒子、不把容量直接相加；必须同时满足并取最小正数。', 115, n => {
      const [a, b] = pairs[n], least = lcm(a, b);
      return blanks(`一批棋子可选择每盒${a}枚或每盒${b}枚的包装。两种方案分别试装同一整批，每一种都要求装满所有盒且恰好无剩余；不是把两种盒子混装。库存须大于0，最少有几枚？两种方案分别需要几盒？`,
        [['inventory', '最少正库存（枚）', least], ['boxesA', '前一种方案盒数', least / a], ['boxesB', '后一种方案盒数', least / b]],
        `库存需同时是${a}与${b}的正倍数，最小为${least}枚。两种方案分别为${least / a}和${least / b}盒，各自乘回对应容量都等于同一库存。`);
    });
  return result;
}

import type { MeasurementDimension, QuestionBlock } from '@study-agent/contracts';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'dimension' | 'family'>;
const table = (headers: string[], rows: string[][]): QuestionBlock => ({ id: 'record', type: 'table', headers, rows });
const blanks = (stem: string, values: Array<[string, string, number | string]>, analysis: string, blocks?: QuestionBlock[]): Task => ({ stem,
  mode: 'multi_blank', answer: values.map(([key, , value]) => ({ key, value: String(value) })),
  responseShape: { entries: values.map(([key, label]) => ({ key, label })) }, analysis, ...(blocks ? { blocks } : {}) });
const choose = (index: number, stem: string, answer: string, alternatives: string[], analysis: string, blocks?: QuestionBlock[]): Task => {
  const options = [answer, ...alternatives], offset = index % options.length;
  return { stem, mode: 'single_choice', answer, options: [...options.slice(offset), ...options.slice(0, offset)], analysis, ...(blocks ? { blocks } : {}) };
};
const decimal = (hundredths: number) => (hundredths / 100).toFixed(2);
const compact = (hundredths: number) => decimal(hundredths).replace(/0+$/, '').replace(/\.$/, '');

/** Remainder bounds, the scope of parentheses and decimal counting units are distinct observations. */
export function buildRemainderDecimalProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const add = (atomId: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string,
    distinction: string, expectedSeconds: number, make: (index: number) => Task) => result.push({ atomId, family, dimension, behavior, structure, distinction,
    exercises: Array.from({ length: 12 }, (_, index) => ({ ...make(index), family, dimension, identityVersion: 2, expectedSeconds })) });

  add('foundation:math:remainder', 'remainder-bound-and-conservation-audit', 'understanding', '同时核对总量守恒和余数边界',
    '乘回等式成立的两份商余记录 → 余量能否再分一组 → 合法商余判断', '错误记录仍满足被除数=除数×商+余数；必须另核对余数小于除数。', 75, n => {
      const index = Math.floor(n / 2), divisor = 4 + index, quotient = 5 + index, remainder = index % divisor;
      const recordedQ = quotient - n % 2, recordedR = remainder + (n % 2 ? divisor : 0), total = divisor * quotient + remainder;
      return { stem: `${total}÷${divisor}，有人记录商${recordedQ}、余数${recordedR}。这份记录是否已经尽量分成满组，并且余数符合要求？`, mode: 'boolean',
        answer: recordedQ * divisor + recordedR === total && recordedR >= 0 && recordedR < divisor,
        analysis: `两部分相加虽为${total}，还要检查余数。余数须在0至${divisor - 1}之间；余下${recordedR}时${recordedR >= divisor ? '还能再分一组，原商少了1。' : '不能再分满一组，本次记录满足边界。'}` };
    });
  add('foundation:math:remainder', 'remainder-symbol', 'procedure', '记录尽量分满的组数、已分量和余量',
    '整数除法 → 最大满组数 → 已分走数量 → 余数', '沿用旧求余数计算题族，三个记录不增加独立样本；含商0与余数0。', 95, n => {
      const divisor = 3 + n % 7, quotient = n ? 2 + n : 0, remainder = n === 0 ? 2 : n % divisor, total = divisor * quotient + remainder;
      return blanks(`把${total}件物品按每组${divisor}件尽量分成满组。分别记录满组数、这些组分走的数量和剩余量，没有的填0。`,
        [['fullGroups', '分成几满组', quotient], ['allocated', '满组分走几件', divisor * quotient], ['remainder', '余下几件', remainder]],
        `${divisor}×${quotient}=${divisor * quotient}，余下${remainder}件，小于每组${divisor}件，不能再分一满组。商为0或余数为0也应如实保留。`);
    });
  add('foundation:math:remainder', 'remainder-capacity-ceiling', 'transfer', '从余量判断运完所有人所需车辆和空位',
    '总人数与每车座位 → 满车与剩余人员 → 最少车辆和空位', '余数表示剩余人员，不是所需车辆数；非零余量还要一辆，恰好分完则不增加。', 100, n => {
      const capacity = 3 + n % 7, full = n ? 2 + n : 0, remainder = n ? n % capacity : 2, people = full * capacity + remainder;
      const needed = full + (remainder > 0 ? 1 : 0);
      return blanks(`有${people}人乘车，每辆车恰好有${capacity}个座位，每人占一座。所有人必须一次坐车出发，车辆相同且不超载。`,
        [['fullVehicles', '能坐满几辆', full], ['neededVehicles', '最少需要几辆', needed], ['emptySeats', '这些车合计空几个座位', needed * capacity - people]],
        `先坐满${full}辆，余${remainder}人；${remainder ? '还有人，须增加一辆。' : '恰好坐满，不再加车。'}所以共${needed}辆，空位${needed * capacity - people}个。`);
    });
  add('foundation:math:remainder', 'remainder-inverse-package-size', 'transfer', '由总库存和满包余量反推每包数量',
    '总库存、已装满包数与散件 → 包内总量 → 每包数量及余数检验', '未知量是除数所表示的每包数量；不同于给定每组量直接求商余。', 95, n => {
      const packages = 3 + n, perPackage = 4 + n % 6, loose = n % perPackage;
      return { stem: '所有整包每包数量相同，清单表示已经尽量装满，另外散件还不够装一整包。按下表恢复每整包有几件。', answer: perPackage,
        blocks: [table(['记录', '数量'], [['精确总库存（件）', String(packages * perPackage + loose)], ['已装满包数（包）', String(packages)], ['另外散件（件）', String(loose)]])],
        analysis: `去掉${loose}件散件，包内共${packages * perPackage}件，平均在${packages}包中，每包${perPackage}件；散件${loose}<${perPackage}，也符合已尽量装满的条件。` };
    });

  add('core:math:brackets', 'bracket-whole-operation-audit', 'understanding', '核查括号内整体是否先求出再重复',
    '同一带括号算式的完整与忽略括号结果 → 运算范围核对', '同一算式含正确和只重复减数的错误结果，所有数值为非负，不依赖负数知识。', 75, n => {
      const index = Math.floor(n / 2), b = 2 + index, factor = 2 + index % 4, a = b * factor + 5 + index;
      const claim = n % 2 ? a - b * factor : (a - b) * factor;
      return { stem: `计算(${a}−${b})×${factor}，有人记录结果为${claim}。这份结果正确吗？`, mode: 'boolean', answer: claim === (a - b) * factor,
        analysis: `先把括号作为一个整体，${a}−${b}=${a - b}，再重复${factor}次得${(a - b) * factor}。${a}−${b}×${factor}只重复减去的部分，改变了原来整体。` };
    });
  add('core:math:brackets', 'bracket-left', 'procedure', '分别记录括号内的量和外部计算结果',
    '括号内加/减 → 一个中间整体 → 乘外部因数', '沿用旧左括号直接计算族，不因两个空位新建独立族。', 85, n => {
      const a = 12 + n * 2, b = 2 + n % 4, factor = 2 + n % 6, operation = n % 2 ? '−' : '+', inside = n % 2 ? a - b : a + b;
      return blanks(`计算(${a}${operation}${b})×${factor}，先记录括号内的整体，再计算外部运算。`,
        [['inside', '括号内的结果', inside], ['whole', '整个算式的结果', inside * factor]],
        `括号内${a}${operation}${b}=${inside}，再用${inside}×${factor}=${inside * factor}。中间整体与最后总量不能交换。`);
    });
  add('core:math:brackets', 'bracket-discount-scope-model', 'transfer', '区分每份优惠和整单优惠的作用范围',
    '单价、份数与优惠制度 → 判断先减的整体或最后的一次减法', '两个制度交替出现，区别重复每份的减量与只减一次，不把相似数字串当同一数量关系。', 95, n => {
      const price = 20 + n * 8, discount = 1 + n % 5, copies = 2 + n % 6, each = n % 2 === 0;
      const perCopy = `(${price}−${discount})×${copies}`, perOrder = `${price}×${copies}−${discount}`;
      return choose(n, `每份材料原价${price}元，买${copies}份。${each ? `每一份都优惠${discount}元` : `整单只优惠一次，共减${discount}元`}，没有其他费用。哪条算式准确表示实付款？`,
        each ? perCopy : perOrder, [each ? perOrder : perCopy, `${price}−${discount}×${copies}`],
        each ? `每份先降为${price - discount}元，这个整体重复${copies}次，用${perCopy}。` : `先按原价算${copies}份，再整单只减${discount}元，用${perOrder}。`);
    });
  add('core:math:brackets', 'bracket-inverse-per-box-removal', 'transfer', '从重复后的剩余量反向恢复每盒原量',
    '相同盒数、每盒去掉量和全部剩余 → 每盒剩余 → 每盒原量', '逆向恢复括号内被减数，先分清全部和每盒，不能把每盒去掉量只加一次给全部。', 100, n => {
      const boxes = 2 + n % 7, original = 12 + n, removed = 2 + n % 5, remaining = original - removed;
      return blanks('各盒原来数量相同，每盒都取走表中同样的数量。根据全部剩余，恢复每盒剩余量和每盒原有量。',
        [['remainingPerBox', '每盒还剩几个', remaining], ['originalPerBox', '每盒原有几个', original]],
        `全部剩余${boxes * remaining}个先平均给${boxes}盒，每盒剩${remaining}个；每盒另加回取走的${removed}个，原来每盒${original}个。`,
        [table(['记录', '数量'], [['相同盒数（盒）', String(boxes)], ['每盒取走（个）', String(removed)], ['全部剩余（个）', String(boxes * remaining)]])]);
    });

  add('core:math:decimalcompare', 'decimal-trailing-zero-equality-audit', 'understanding', '区分末尾补0与改变原数字的数位',
    '同一小数的一位与两位表示 → 相等主张 → 位值守恒核对', '补在末尾不改数量，插在十分位会把原数字移位；同一数字组成配两种主张。', 75, n => {
      const index = Math.floor(n / 2), whole = index, digit = 1 + index, left = `${whole}.${digit}`, right = n % 2 ? `${whole}.0${digit}` : `${whole}.${digit}0`;
      return { stem: `有人说：“${left}与${right}表示相同大小的数。”这项主张正确吗？`, mode: 'boolean', answer: Number(left) === Number(right),
        analysis: `${left}等于${whole}.${digit}0，末尾的0只补出空的百分位。${whole}.0${digit}中的${digit}已经在百分位，计数单位改变，不能据数字相同判断相等。` };
    });
  add('core:math:decimalcompare', 'decimal-place-compare', 'procedure', '统一计数单位后记录大小关系',
    '不同位数的小数 → 都改记为百分之一的个数 → 比较符号', '沿用旧位值比较题族，整数单位记录与最后符号是一题的过程，含相等和整数部分跨界。', 95, n => {
      const pairs: Array<[string, string]> = [['4.1', '4.09'], ['3.05', '3.5'], ['0', '0.00'], ['7.09', '7.1'], ['2.50', '2.5'], ['9.99', '10'],
        ['10.01', '9.9'], ['0.8', '0.80'], ['1.01', '1.1'], ['6', '5.99'], ['0.09', '0.1'], ['12.30', '12.3']];
      const [left, right] = pairs[n], a = Math.round(Number(left) * 100), b = Math.round(Number(right) * 100);
      return blanks(`比较${left}与${right}，统一按百分之一为一个单位记录。最后填写“左边数与右边数”的比较符号（填<、=或>）。`,
        [['leftHundredths', '左边有几个百分之一', a], ['rightHundredths', '右边有几个百分之一', b], ['relation', '左边与右边的比较符号', a < b ? '<' : a > b ? '>' : '=']],
        `左边是${a}个百分之一，右边是${b}个百分之一。同单位后比较${a}与${b}；位数较多不代表数值更大，末尾补0保持原量。`);
    });
  add('core:math:decimalcompare', 'decimal-comparison-mixed-length-labels', 'transfer', '统一不同单位标签后比较实际长度',
    '米的小数标签与厘米的整数标签 → 同一长度单位 → 长短判断', '不能直接比较两张标签的数字，含甲长、乙长和等长，不按单位标签猜结论。', 95, n => {
      const a = 101 + n * 13, b = a + (n % 3 - 1) * 3, labels = ['甲较长', '乙较长', '两者等长'], answer = a > b ? labels[0] : a < b ? labels[1] : labels[2];
      return choose(n, '两段绳子按下表贴长度标签，没有误差。按实际长度比较，哪个结论成立？', answer, labels.filter(label => label !== answer),
        `甲${decimal(a)}米等于${a}厘米，乙${b}厘米；统一单位后再比较，所以${answer}。标签数字位数或直接大小不能代替长度。`,
        [table(['绳子', '长度标签'], [['甲', `${decimal(a)}米`], ['乙', `${b}厘米`]])]);
    });
  add('core:math:decimalcompare', 'decimal-strict-between-digit-range', 'transfer', '反向构造严格介于两个数之间的未知数位',
    '两端同整数/十分位的小数与严格大小约束 → 可填百分位集合 → 最小/最大数字', '不是对两个现成数重复比较；端点不能取，包含只有一个可填数位的边界。', 95, n => {
      const [low, high] = [[0, 2], [1, 4], [2, 6], [3, 8], [4, 9], [0, 9], [5, 8], [6, 9], [1, 3], [2, 4], [0, 5], [3, 6]][n];
      const whole = 1 + n, tenth = n % 10;
      return blanks(`要让${whole}.${tenth}${low}<${whole}.${tenth}□<${whole}.${tenth}${high}，□只能填一个数字，且中间数必须严格在两端之间。`,
        [['minimumDigit', '最小能填几', low + 1], ['maximumDigit', '最大能填几', high - 1]],
        `整数部分与十分位相同，要使百分位严格大于${low}、严格小于${high}，可填${low + 1}至${high - 1}，不能把端点当成允许值。`);
    });

  add('core:math:decimalsubtract', 'decimal-subtract-alignment-audit', 'understanding', '核查不同小数位数相减时的单位对齐',
    '一位与两位小数相减及一份差记录 → 同单位表示 → 正误判断', '同一算式配正确差与末尾数字对齐的错差；错误差也非负，不能靠负号识别。', 75, n => {
      const index = Math.floor(n / 2), a = (9 + index) * 100 + (2 + index) * 10, b = 85 - index * 3;
      const left = compact(a), right = decimal(b), falseDifference = Number(left.replace('.', '')) - b, claim = n % 2 ? falseDifference : a - b;
      return { stem: `计算${left}−${right}，有人把差记成${decimal(claim)}。这份结果正确吗？`, mode: 'boolean', answer: claim === a - b,
        analysis: `${left}要按${decimal(a)}表示，和${right}按相同数位单位对齐，差为${decimal(a - b)}。只把末尾数字排齐，会把十分位误当百分位。` };
    });
  add('core:math:decimalsubtract', 'decimal-subtract-symbol', 'procedure', '统一为百分之一后保留减法与小数结果',
    '整数/一位/两位小数 → 两个百分之一数量 → 差的单位数 → 小数差', '沿用旧小数减法计算族；四空只计一个独立样本，保留0、跨0退位和末尾0。', 110, n => {
      const pairs: Array<[string, string]> = [['6.2', '0.85'], ['5', '0.08'], ['4.03', '1.97'], ['9', '9'], ['10.02', '0.09'], ['3.4', '0.04'],
        ['12.01', '2.02'], ['1', '0.99'], ['0.5', '0.05'], ['7.1', '0.8'], ['10', '0.01'], ['9.90', '0.9']];
      const [left, right] = pairs[n], a = Math.round(Number(left) * 100), b = Math.round(Number(right) * 100);
      return blanks(`计算${left}−${right}。先统一为百分之一的个数，再记录差和小数形式；补0只改变表示，不改变数量。`,
        [['minuendHundredths', '被减数有几个百分之一', a], ['subtrahendHundredths', '减数有几个百分之一', b], ['differenceHundredths', '差有几个百分之一', a - b], ['difference', '差的小数形式', decimal(a - b)]],
        `${left}=${decimal(a)}，${right}=${decimal(b)}；同单位整数相减${a}−${b}=${a - b}，换回小数为${decimal(a - b)}。退位仍按十进制，不按字符串末尾对齐。`);
    });
  add('core:math:decimalsubtract', 'decimal-subtract-mixed-length-shortfall', 'transfer', '统一混合单位库存与小数长度目标后测量缺口',
    '小数米的目标与米/厘米库存 → 分别统一为厘米 → 缺口与小数米记录', '先组合库存的两种单位，再与小数目标比较求差，区别于单一货币标签的直接减法。', 110, n => {
      const target = [632, 520, 403, 705, 1002, 340, 1201, 99, 50, 710, 1000, 990][n], gap = [0, 1, 9, 25, 99, 10, 7, 0, 50, 2, 20, 8][n];
      const stock = target - gap, meters = Math.floor(stock / 100), centimeters = stock % 100;
      return blanks('按表中目标准备一段绳子，可以无损拼接，现有库存全部可用。先统一为厘米，缺多少再补多少；恰好够用时缺口填0。',
        [['targetCentimeters', '目标合计几厘米', target], ['stockCentimeters', '库存合计几厘米', stock], ['shortfallCentimeters', '还差几厘米', gap], ['shortfallMeters', '还差几米（小数）', decimal(gap)]],
        `目标${decimal(target)}米为${target}厘米，库存${meters}米另${centimeters}厘米为${stock}厘米；缺${gap}厘米，等于${decimal(gap)}米。米和厘米的分量不能直接相减。`,
        [table(['记录', '长度'], [['目标长度', `${decimal(target)}米`], ['现有库存', `${meters}米另${centimeters}厘米`]])]);
    });
  add('core:math:decimalsubtract', 'decimal-subtract-balance-conservation', 'transfer', '复核支出前后余额是否保持数量守恒',
    '支出前余额、唯一支出与登记余额 → 支出加登记余额 → 与原量核对', '不是直接填差；对已有账本反向检验，真实和错误余额成对出现，含余额0。', 90, n => {
      const index = Math.floor(n / 2), before = [620, 500, 403, 1002, 100, 990][index], spent = [85, 8, 197, 9, 99, 990][index];
      const recorded = before - spent + (n % 2 ? 10 : 0);
      return { stem: '下表是一笔支出的记录。期间没有收入、手续费或其他支出，登记余额与支出前的数量是否守恒？', mode: 'boolean', answer: spent + recorded === before,
        blocks: [table(['记录', '元'], [['支出前余额', compact(before)], ['唯一支出', decimal(spent)], ['登记余额', decimal(recorded)]])],
        analysis: `用登记余额${decimal(recorded)}元加支出${decimal(spent)}元，应还原支出前${decimal(before)}元。实际合计${decimal(recorded + spent)}元，${recorded + spent === before ? '本次守恒。' : '比原量多0.10元，本次余额记录不成立。'}` };
    });
  return result;
}

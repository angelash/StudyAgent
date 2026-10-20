import type { MeasurementDimension, QuestionBlock } from '@study-agent/contracts';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'dimension' | 'family'>;
const table = (headers: string[], rows: string[][]): QuestionBlock => ({ id: 'record', type: 'table', headers, rows });
const blanks = (stem: string, values: Array<[string, string, number | string]>, analysis: string, blocks?: QuestionBlock[]): Task =>
  ({ stem, answer: values.map(([key, , value]) => ({ key, value: String(value) })), mode: 'multi_blank',
    responseShape: { entries: values.map(([key, label]) => ({ key, label })) }, analysis, ...(blocks ? { blocks } : {}) });
const choose = (stem: string, answer: string, options: string[], analysis: string, blocks?: QuestionBlock[]): Task =>
  ({ stem, answer, options, mode: 'single_choice', analysis, ...(blocks ? { blocks } : {}) });
const clock = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
const divisions = [[84, 3], [96, 4], [75, 3], [92, 4], [72, 4], [65, 5], [78, 6], [91, 7], [81, 3], [98, 7], [85, 5], [95, 5]];
const decimalParts = [[0, 4], [4, 0], [0, 7], [7, 0], [3, 8], [8, 3], [0, 9], [9, 0], [2, 6], [6, 2], [0, 5], [5, 0]];

/** Explicitly separate a quantity, its current unit and the whole being measured. */
export function buildUnitProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const add = (atomId: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string,
    distinction: string, expectedSeconds: number, make: (index: number) => Task) => result.push({ atomId, family, dimension, behavior, structure, distinction,
    exercises: Array.from({ length: 12 }, (_, index) => ({ ...make(index), family, dimension, expectedSeconds, identityVersion: 2 })) });

  add('foundation:math:divisiondigits', 'division-regroup-conservation', 'understanding', '核对高位余量换成低位后的数量',
    '高位平均分后的剩余十与原个位 → 换成一 → 核对待分数量', '同一分配有成立与不成立记录，直接检查剩余十的单位，不由最终商代推。', 65, n => {
      const [total, divisor] = divisions[Math.floor(n / 2)], tens = Math.floor(total / 10), ones = total % 10;
      const remaining = tens % divisor, claim = remaining * (n % 2 ? 1 : 10) + ones;
      return { stem: `${total}÷${divisor}，先把${tens}个十尽量平均分完，还剩${remaining}个十，原来另有${ones}个一。把这些剩余量合起来，记成${claim}个一，数量保持不变吗？`,
        mode: 'boolean', answer: n % 2 === 0,
        analysis: `剩下的${remaining}个十应换成${remaining * 10}个一，再与${ones}个一合为${remaining * 10 + ones}个一。还没有分的量不能只把两栏个数直接相加。` };
    });
  add('foundation:math:divisiondigits', 'division-digits-symbol', 'procedure', '联动记录高位商、余十、合并的一和最后的商',
    '两位数整除 → 高位尽量分 → 余十换一 → 低位分 → 商', '沿用原按位除法题族；五栏只保留一个过程的观察，不算五个独立题族。', 110, n => {
      const [total, divisor] = divisions[n], tens = Math.floor(total / 10), remaining = tens % divisor, combined = remaining * 10 + total % 10;
      return blanks(`按位计算${total}÷${divisor}，先把高位的十尽量平均分完，再把剩余十换成一继续分。填写各项记录。`,
        [['tensEach', '每份先分到几个十', Math.floor(tens / divisor)], ['remainingTens', '高位分后剩几个十', remaining],
          ['combinedOnes', '与原个位合起来待分的几个一', combined], ['onesEach', '每份再分到几个一', combined / divisor], ['quotient', '完整的商', total / divisor]],
        `先分到每份${Math.floor(tens / divisor)}个十，余${remaining}个十；换成一并加原个位，待分${combined}个一，每份再得${combined / divisor}个一，商为${total / divisor}。`);
    });
  add('foundation:math:divisiondigits', 'division-packaged-sharing', 'transfer', '把成捆和散件平均分配并保留每份的两种单位',
    '整捆与散件清单 → 高位余量拆捆 → 每份的捆与散件', '从未合成总数的实物记录恢复单位并分配，区别于只给书本总数的旧文字题。', 90, n => {
      const [total, divisor] = divisions[n], quotient = total / divisor;
      return blanks(`每捆有10根，整捆和散根另记。把表中所有小棒平均分给${divisor}人，需要时拆捆；最后每人尽量保留整捆，另外散根少于10。每人各有多少？`,
        [['bundles', '每人有几整捆', Math.floor(quotient / 10)], ['loose', '每人另有几根散棒', quotient % 10]],
        `原清单共${total}根，平均分后每人${quotient}根，表示为${Math.floor(quotient / 10)}捆与${quotient % 10}根散棒。高位没有分完的捆须拆成10根再分，不能留给某一人。`,
        [table(['摆放方式', '数量'], [['整捆（每捆10根）', String(Math.floor(total / 10))], ['另外散根（根）', String(total % 10)]])]);
    });
  add('foundation:math:divisiondigits', 'division-first-regroup-error', 'transfer', '定位按位分配中最早的不成立记录',
    '高位尽量分完、余量换单位、低位平均分的记录链 → 首个不成立处', '后续可以正确跟随此前错误的状态；核对数量守恒和高位是否已经分尽，不能只看最后商。', 105, n => {
      const [total, divisor] = divisions[n], tens = Math.floor(total / 10), faulty = n % 3, qTens = Math.floor(tens / divisor) - Number(faulty === 0);
      const remaining = tens - qTens * divisor, combined = remaining * 10 + total % 10 + (faulty === 1 ? divisor : 0);
      const qOnes = combined / divisor + Number(faulty === 2), labels = ['高位尽量分完', '余量换成一', '低位平均分'];
      return choose(`核查${total}÷${divisor}的三步记录，哪一步最早不成立？高位记录必须分到剩下的十不够再平均分一次；后面的行按前面实际记录继续。`, labels[faulty], labels,
        `高位应每份${Math.floor(tens / divisor)}个十且余十少于${divisor}；换单位须用剩余十×10加原个位；低位每份数乘${divisor}须等于它所用的待分数。最早不成立的是“${labels[faulty]}”。`,
        [table(['步骤', '每份分到的十', '剩下的十', '待分的一', '每份分到的一'], [
          [labels[0], String(qTens), String(remaining), '尚未换', '尚未分'],
          [labels[1], '沿用上行', '已经换成一', String(combined), '尚未分'],
          [labels[2], '沿用上行', '已经换成一', String(combined), String(qOnes)]])]);
    });

  add('core:math:elapsedtime', 'elapsed-sixty-minute-audit', 'understanding', '核对跨整时的60分单位',
    '同日跨整时的起止时刻与时长主张 → 核对60分进率', '一组时刻分别给出60与100进率记录，不由是否跨整时直接决定对错。', 60, n => {
      const index = Math.floor(n / 2), hour = 8 + index, startMinute = 40 + index * 3, endMinute = 5 + index * 2;
      const duration = 60 - startMinute + endMinute, claim = duration + (n % 2 ? 40 : 0);
      return { stem: `同一天，从${hour}:${String(startMinute).padStart(2, '0')}到${hour + 1}:${String(endMinute).padStart(2, '0')}，有人记“经过${claim}分钟”。记录正确吗？`,
        mode: 'boolean', answer: n % 2 === 0,
        analysis: `1小时是60分钟，到下一个整时先经过${60 - startMinute}分，再走${endMinute}分，共${duration}分。不能用100分向前借一时。` };
    });
  add('core:math:elapsedtime', 'elapsed-same-day', 'procedure', '按下一个整时分段记录同日时长',
    '起止时刻 → 到第一个整时 → 后续分钟 → 总时长', '沿用原同日经过时间题族，分段记录不另造独立题族。', 90, n => {
      const start = (8 + n % 5) * 60 + [40, 45, 50, 55, 35, 25][n % 6], duration = 45 + n * 7, end = start + duration;
      const nextHour = Math.floor(start / 60 + 1) * 60;
      return blanks(`同一天，活动从${clock(start)}开始，到${clock(end)}结束。以开始后的第一个整时${clock(nextHour)}为界，分段记录分钟数。`,
        [['first', '开始到这个整时经过几分钟', nextHour - start], ['later', '这个整时到结束又经过几分钟', end - nextHour], ['total', '总共经过几分钟', duration]],
        `第一段${nextHour - start}分，后面仍按每小时60分计，共${end - nextHour}分；两段合计${duration}分。中间可以跨不止一个整时。`);
    });
  add('core:math:elapsedtime', 'elapsed-reverse-arrival', 'transfer', '由开始时刻和持续时长还原结束时刻',
    '起点与持续分钟数 → 满60分进一时 → 终点时分', '将求间隔改为恢复终点，不把时刻当十进制小数相加。', 85, n => {
      const start = (7 + n % 6) * 60 + 35 + n % 5 * 5, duration = 40 + n * 7, end = start + duration;
      return blanks(`当天从${clock(start)}出发，路上连续用了${duration}分钟，中间没有停留。到达时是几时几分？`,
        [['hour', '到达时的时数（24小时制）', Math.floor(end / 60)], ['minute', '到达时的分钟数（0至59）', end % 60]],
        `先累计${start % 60}+${duration}=${start % 60 + duration}分，每满60分向时数进1，得到${clock(end)}。分钟栏应小于60，到达时刻与持续时间要分开。`);
    });
  add('core:math:elapsedtime', 'elapsed-active-intervals', 'transfer', '区别整段经过时间与排除休息的活动时间',
    '连续的学习、休息、学习记录 → 整段时长与只计活动的时长', '同一起止时刻因计入条件不同产生两种量，不能把休息也计入有效活动。', 95, n => {
      const start = (8 + n % 5) * 60 + 35 + n % 4 * 5, first = 20 + n, rest = 10 + n % 3 * 5, second = 15 + n % 5 * 3;
      return blanks('记录发生在同一天，三段连续衔接。“学习分钟”只计学习两段，不包括休息。分别求整段经过时间与学习时间。',
        [['span', '从第一次开始到最后结束经过几分钟', first + rest + second], ['active', '其中实际学习几分钟', first + second]],
        `按每小时60分钟计算各段，学习为${first}+${second}=${first + second}分；整段还包括${rest}分休息，经过${first + rest + second}分。两个答案对应不同的计入条件。`,
        [table(['活动', '开始时刻', '结束时刻'], [['学习', clock(start), clock(start + first)], ['休息', clock(start + first), clock(start + first + rest)],
          ['学习', clock(start + first + rest), clock(start + first + rest + second)]])]);
    });

  add('core:math:fractionunit', 'fraction-equal-shares-audit', 'understanding', '核对单位分数所需的平均分条件',
    '整体分成若干份的全部圆片 → 逐份等量核对 → 每份是否都是单位分数', '总份数相同的等分与不等分成对出现，不能只数行数就断定一份的占比。', 75, n => {
      const index = Math.floor(n / 2), count = 3 + index, each = 2 + index % 3;
      const rows = Array.from({ length: count }, (_, i) => [`第${i + 1}份`, '● '.repeat(each + (n % 2 ? i === 0 ? 1 : i === 1 ? -1 : 0 : 0)).trim()]);
      return { stem: `把表中的全部圆片看作一个整体，每枚圆片表示同样的量。现在分成${count}份，每一份都恰好是整体的1/${count}吗？表中已列出全部圆片。`,
        mode: 'boolean', answer: n % 2 === 0, blocks: [table(['份', '实际圆片'], rows)],
        analysis: `总份数为${count}还不够，须每份圆片数相同。${n % 2 ? '前两份数量不相等，所以不能说每份都是相同的单位分数。' : `每份都是${each}枚，确实平均分为${count}份，每份是1/${count}。`}` };
    });
  add('core:math:fractionunit', 'fraction-unit-number', 'procedure', '把总等份数分别对应到分母和一份的数值',
    '固定整体与等份数 → 分母 → 一份占比', '沿用原单位分数题族；增加分母栏仍只是一份平均分操作。', 65, n => {
      const denominator = 3 + n;
      return blanks(`把一个整体平均分成${denominator}份，只取其中1份。分母应填几？这一份占整体多少？占比可填分数。`,
        [['denominator', '这个单位分数的分母', denominator], ['part', '一份占整体的数值', `1/${denominator}`]],
        `平均分成${denominator}份，分母记录总份数${denominator}，取1份作分子，所以一份是1/${denominator}。分母与分子不能颠倒。`);
    });
  add('core:math:fractionunit', 'fraction-changing-whole', 'transfer', '整体边界变化后重新确定一份的分母',
    '原来等量的多份与取走记录 → 剩下的量改作整体 → 原一份的新占比', '同一份的实际数量不变，但整体缩小，需要重建分母，不能沿用原整体的份数。', 85, n => {
      const initial = 5 + n % 6, removed = 1 + Math.floor(n / 4), remaining = initial - removed;
      return blanks(`原有${initial}份同样多的圆片。完整取走${removed}份后，把所有剩下的圆片改看作一个新整体，剩余每份未拆开。现在其中1份占新整体多少？`,
        [['shares', '新整体还包含几份原来的等量份', remaining], ['part', '其中1份占新整体的数值（可填分数）', `1/${remaining}`]],
        `新整体只有${initial}−${removed}=${remaining}份相同的量，每份应为新整体的1/${remaining}。原来每份的大小没变，变化的是用来比较的整体。`);
    });
  add('core:math:fractionunit', 'fraction-length-unit-recovery', 'transfer', '从整条与小段的长度重建等份数',
    '整条长度与重复小段长度 → 无剩余铺满的次数 → 小段所占单位分数', '没有直接给等份数，必须把小段作为一个单位恢复分母；不能把厘米数直接当分母。', 85, n => {
      const count = 3 + n % 6, segment = 2 + Math.floor(n / 3) % 4;
      return blanks('小段重复首尾相接可以恰好铺满整条长绳，不留空隙、没有重叠。根据长度表，填写等份数和一小段占整条的数值。',
        [['shares', '整条可以铺几段这样的小段', count], ['part', '一小段占整条的数值（可填分数）', `1/${count}`]],
        `整条${count * segment}厘米，每段${segment}厘米，可铺${count}个同样的小段，因此每段占1/${count}。分母记录小段的个数，不是整条的厘米数。`,
        [table(['测量对象', '长度（厘米）'], [['整条长绳', String(count * segment)], ['同样的小段', String(segment)]])]);
    });

  add('core:math:fractioncompare', 'fraction-same-unit-claim', 'understanding', '核对同一分数单位下的份数比较理由',
    '同一整体同分母的两个分数 → 所取份数的比较理由 → 是否成立', '检查看似相同分母就一样大的理由，不直接把一次比较结果当成理解证据。', 65, n => {
      const index = Math.floor(n / 2), denominator = 5 + index, a = 1 + index % 2, b = a + 2;
      return { stem: `对同一整体的${a}/${denominator}和${b}/${denominator}，有人说：“${n % 2 ? '分母相同，所以两个分数一样大。' : `单位份大小相同，取${b}份比取${a}份多，所以${b}/${denominator}更大。`}”这个理由成立吗？`,
        answer: n % 2 === 0, mode: 'boolean',
        analysis: `同一整体平均分${denominator}份，每个单位份相同；取的份数${b}>${a}，所以${b}/${denominator}更大。相同的是单位份，不是最终取到的总量。` };
    });
  add('core:math:fractioncompare', 'same-denominator-compare', 'procedure', '记录分数单位和较大的同分母分数',
    '两个分母相同的分数 → 每一份的单位 → 较大分数', '沿用原同分母比较题族；分别填写比较单位与结果不会新增独立题族。', 70, n => {
      const denominator = 6 + n % 7, a = 1 + n % 3, b = a + 2, reverse = n % 2 === 1;
      return blanks(`同一整体的${reverse ? b : a}/${denominator}与${reverse ? a : b}/${denominator}，每个单位份占整体多少？较大的分数是多少？两项都可填分数。`,
        [['unit', '每个单位份占整体的数值', `1/${denominator}`], ['larger', '较大的分数', `${b}/${denominator}`]],
        `每份是1/${denominator}，比较的是取${a}份还是取${b}份；${b}>${a}，较大为${b}/${denominator}，与先写哪一个无关。`);
    });
  add('core:math:fractioncompare', 'fraction-covered-strip-compare', 'transfer', '从实际等分条恢复并比较覆盖量',
    '两条同长等分条的全部深浅格 → 数所取份数 → 比较覆盖量', '先从图示恢复份数，不预写分子；包含两边相等及较大者左右交换。', 85, n => {
      const denominator = 6 + n % 5, a = 1 + n % 3, b = n % 3 === 0 ? a : n % 3 === 1 ? a + 2 : Math.max(1, a - 1);
      const symbols = (filled: number) => Array.from({ length: denominator }, (_, i) => i < filled ? '■' : '□').join(' ');
      const labels = ['甲更多', '乙更多', '两份一样多'], answer = a > b ? labels[0] : b > a ? labels[1] : labels[2];
      return choose('甲、乙两条纸带一样长，各自平均分成相同份数。■为取到的一份，□为没取的一份。表中列出完整纸带，哪条取到的总长度更多？', answer, labels,
        `每条有${denominator}个同样单位份，甲取${a}份、乙取${b}份；${a === b ? '份数相同，长度相同。' : '单位份相同，取到份数较多的一条总长度更多。'}`,
        [table(['纸带', '完整的等分条'], [['甲', symbols(a)], ['乙', symbols(b)]])]);
    });
  add('core:math:fractioncompare', 'fraction-whole-boundary', 'transfer', '区别分数大小与缺少整体条件的实际量',
    '两个同分母比例及整体条件 → 判断能否推出实际量的多少', '同一比例记录配有相同容量或未知容量条件，不把分数较大直接推成不同整体的实际量较大。', 85, n => {
      const index = Math.floor(n / 2), denominator = 6 + index, a = index % 2 ? 4 : 2, b = index % 2 ? 2 : 4, sameWhole = n % 2 === 0;
      const labels = ['甲杯水更多', '乙杯水更多', '现有信息不能确定'], answer = sameWhole ? a > b ? labels[0] : labels[1] : labels[2];
      return choose(`甲杯水占它容量的${a}/${denominator}，乙杯水占它容量的${b}/${denominator}。${sameWhole ? '已知两杯装满时的容量相同。' : '没有给两杯装满时的容量，也不知道容量是否相同。'}仅凭这些信息，能确定哪杯实际水量更多吗？`, answer, labels,
        sameWhole ? `整体容量相同，单位份大小相同，比较${a}与${b}，可确定${a > b ? '甲' : '乙'}杯更多。` : '两个分数各自以自己的杯容量为整体。没有整体容量关系，较大的比例可能对应较小的杯，不能确定实际水量多少。');
    });

  add('core:math:decimalvalue', 'decimal-zero-placeholder-claim', 'understanding', '核对空数位的0和计数单位',
    '十分之一或百分之一的单一单位数量 → 含0的记录主张 → 等值核对', '相同数量分别给正确数位和错一位记录，不让出现0本身成为错误信号。', 60, n => {
      const index = Math.floor(n / 2), digit = 2 + index, hundredths = index % 2 === 0;
      const actual = digit / (hundredths ? 100 : 10), claim = n % 2 ? digit / (hundredths ? 10 : 100) : actual;
      return { stem: `${digit}个${hundredths ? '百分之一' : '十分之一'}，有人记作${claim.toFixed(2)}。这个记录表示的量正确吗？`, answer: n % 2 === 0, mode: 'boolean',
        analysis: `${hundredths ? '百分之一在小数点右边第二位，十分位没有量要用0占位' : '十分之一在小数点右边第一位，百分位为0不改变已有十分位的量'}，正确为${actual.toFixed(2)}。不能仅按数字${digit}判断大小。` };
    });
  add('core:math:decimalvalue', 'decimal-compose-parts', 'procedure', '把两个小数单位分别表示再合并',
    '十分之一与百分之一的份数 → 各自的量 → 总量', '沿用原小数合成题族；包括一个单位为0的情况，多栏不算多个独立样本。', 85, n => {
      const [tenths, hundredths] = decimalParts[n];
      return blanks(`${tenths}个十分之一和${hundredths}个百分之一合起来，分别记录两部分表示的量和合计的量。各项可填数值。`,
        [['tenthsValue', '十分之一这一部分表示的量', (tenths / 10).toFixed(2)], ['hundredthsValue', '百分之一这一部分表示的量', (hundredths / 100).toFixed(2)],
          ['total', '合起来表示的量', ((tenths * 10 + hundredths) / 100).toFixed(2)]],
        `${tenths}个十分之一是${(tenths / 10).toFixed(2)}，${hundredths}个百分之一是${(hundredths / 100).toFixed(2)}，合计${((tenths * 10 + hundredths) / 100).toFixed(2)}；为0的单位要保留正确位置。`);
    });
  add('core:math:decimalvalue', 'decimal-mixed-length-label', 'transfer', '把混合长度记录对应到米的小数位',
    '分米与厘米分开登记 → 十分米单位与百分米单位 → 米数及数位', '换成有量纲的测量记录，给定进率后核对数位，区别于直接读给定小数。', 85, n => {
      const [dm, cm] = decimalParts[n];
      return blanks('1米=10分米=100厘米。表中是同一根短带的两部分长度，不互相包含，合起来不足1米。以米为单位合并，并记录十分位与百分位的数字。',
        [['tenths', '米数的十分位数字', dm], ['hundredths', '米数的百分位数字', cm], ['meters', '这根短带合起来有多少米', ((dm * 10 + cm) / 100).toFixed(2)]],
        `${dm}分米对应${dm}个十分之一米，${cm}厘米对应${cm}个百分之一米，合为${((dm * 10 + cm) / 100).toFixed(2)}米。某一部分为0时，该数位仍需正确占位。`,
        [table(['分开记录的部分', '长度'], [['分米部分', `${dm}分米`], ['另外的厘米部分', `${cm}厘米`]])]);
    });
  add('core:math:decimalvalue', 'decimal-hundred-grid', 'transfer', '由实际百格恢复十分位和百分位的量',
    '整张100格与实际选中格 → 十个百分之一换十分之一 → 两位与总量', '需要数实际格子并组合单位，保留4与40等不同量；表格不是预写小数的变体。', 105, n => {
      const filled = [4, 40, 7, 70, 18, 81, 30, 3, 50, 5, 26, 62][n];
      const rows = Array.from({ length: 10 }, (_, row) => [String.fromCharCode(65 + row), Array.from({ length: 10 }, (_, column) => {
        const position = n % 3 === 0 ? row * 10 + column : n % 3 === 1 ? column * 10 + row : row % 2 ? row * 10 + 9 - column : row * 10 + column;
        return position < filled ? '■' : '□';
      }).join(' ')]);
      return blanks('整张表恰好100个同样大的方格，整张的量是1。■为选中的格，□为没选中的格，行标不是方格。把选中部分按每10格换成一个十分之一，记录尽量换完后的两种单位和总量。',
        [['tenths', '选中部分含几个完整的十分之一', Math.floor(filled / 10)], ['hundredths', '另有几个百分之一', filled % 10], ['value', '选中部分占整张的数值', (filled / 100).toFixed(2)]],
        `实际选中${filled}格，每格1/100；每10个百分之一可换1个十分之一，得到${Math.floor(filled / 10)}个十分之一另${filled % 10}个百分之一，总量为${(filled / 100).toFixed(2)}。换单位不会改变选中量。`,
        [table(['行标', '每行的全部10格'], rows)]);
    });
  return result;
}

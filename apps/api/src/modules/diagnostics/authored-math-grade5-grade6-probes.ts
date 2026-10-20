import type { QuestionBlock } from '@study-agent/contracts';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'family' | 'dimension'>;
type Entry = [string, string, string];
type Case = { stem: string; options?: string[]; answer: string | Entry[]; analysis: string; blocks?: QuestionBlock[] };
type Spec = { atomId: string; code: string; behavior: string; make: (n: number) => [Case, Case, Case, Case] };

const rotate = <T,>(values: readonly T[], n: number) => [...values.slice(n % values.length), ...values.slice(0, n % values.length)];
const table = (headers: string[], rows: string[][]): QuestionBlock => ({ id: 'record', type: 'table', headers, rows });
const fmt = (value: number, digits = 6) => Number(value.toFixed(digits)).toString();
const choiceCase = (stem: string, answer: string, wrong: readonly string[], analysis: string, blocks?: QuestionBlock[]): Case => {
  const options = [...new Set([answer, ...wrong])];
  if (options.length < 3) throw new Error(`Choice needs two distinct distractors: ${stem}`);
  return { stem, options: rotate(options, stem.length), answer, analysis, ...(blocks ? { blocks } : {}) };
};
const blankCase = (stem: string, entries: Entry[], analysis: string, blocks?: QuestionBlock[]): Case => ({ stem, answer: entries, analysis, ...(blocks ? { blocks } : {}) });
const asTask = (item: Case, expectedSeconds: number): Task => item.options ? { stem: item.stem, answer: item.answer, options: item.options,
  mode: 'single_choice', analysis: item.analysis, ...(item.blocks ? { blocks: item.blocks } : {}) } : {
  stem: item.stem, answer: (item.answer as Entry[]).map(([key, , value]) => ({ key, value })), mode: 'multi_blank',
  responseShape: { entries: (item.answer as Entry[]).map(([key, label]) => ({ key, label })) }, analysis: item.analysis,
  ...(item.blocks ? { blocks: item.blocks } : {}) };
const gcd = (a: number, b: number): number => b === 0 ? Math.abs(a) : gcd(b, a % b);
const fraction = (numerator: number, denominator: number) => {
  if (denominator === 0) throw new Error('Zero denominator'); const sign = denominator < 0 ? -1 : 1, divisor = gcd(numerator, denominator);
  return `${sign * numerator / divisor}/${Math.abs(denominator) / divisor}`;
};
const distort = (value: string) => {
  if (value.includes('/')) { const [a, b] = value.split('/').map(Number); return fraction(a + (a >= 0 ? 1 : -1), b); }
  const number = Number(value); if (Number.isFinite(number)) return fmt(number + (Math.abs(number) >= 10 ? 1 : 0.1));
  return `错误写法：${value}`;
};
const repairCase = (topic: string, rows: Array<{ record: string; correct: string }>, n: number): Case => {
  const broken = n % 3, displayed = rows.map((row, index) => [String(index + 1), row.record, index === broken ? distort(row.correct) : row.correct]);
  return blankCase(`${topic}共有三条完整记录，只有一条已有结果与同条数据不符。填写错误行编号，并写该行正确结果。`,
    [['row', '错误行编号', String(broken + 1)], ['corrected', '该行正确结果', rows[broken].correct]],
    `逐条按当前数据重算，第${broken + 1}行应为${rows[broken].correct}；其他两行与各自数据一致。`,
    [table(['行', '记录', '已有结果'], displayed)]);
};
const specs: Spec[] = [];
const spec = (atomId: string, code: string, behavior: string, make: Spec['make']) => specs.push({ atomId, code, behavior, make });

spec('foundation:math:decimalplace', 'g5-decimal-place', '辨认小数数位与位值', n => {
  const whole = 2 + n % 8, tenths = (n + 1) % 10, hundredths = (n + 3) % 10, thousandths = (n + 5) % 10, value = `${whole}.${tenths}${hundredths}${thousandths}`;
  const rule = choiceCase(`记录${n + 1}显示小数 ${value}。十分位上的数字是几？`, String(tenths), [String(whole), String(hundredths), String(thousandths)],
    `${value}的小数点后第一位是十分位，数字是${tenths}。`);
  const produce = blankCase(`把 ${value} 拆成整数部分、十分位和百分位，分别填写数字；不写小数点。`,
    [['ones', '整数部分', String(whole)], ['tenths', '十分位', String(tenths)], ['hundredths', '百分位', String(hundredths)]],
    `${value}整数部分为${whole}，十分位为${tenths}，百分位为${hundredths}。`);
  const repair = repairCase(`小数数位记录 ${n + 1}`, [{ record: `${value}的十分位`, correct: String(tenths) },
    { record: `${value}的百分位`, correct: String(hundredths) }, { record: `${value}的千分位`, correct: String(thousandths) }], n);
  const transfer = blankCase(`测量卡写着“${whole}个一、${tenths}个0.1、${hundredths}个0.01、${thousandths}个0.001”合起来是多少？同时填写百分位对应的单位值。`,
    [['number', '合成小数', value], ['hundredth', '百分位对应的单位值', '0.01']], `按数位合成得到${value}；百分位的单位值是0.01。`);
  return [rule, produce, repair, transfer];
});

spec('foundation:math:decimaladd', 'g5-decimal-add', '按小数点对齐计算小数加法', n => {
  const aTenths = 12 + n * 3, bTenths = 7 + n * 2, sum = (aTenths + bTenths) / 10, a = fmt(aTenths / 10), b = fmt(bTenths / 10);
  const rule = choiceCase(`计算 ${a} + ${b}。哪种竖式对齐方式正确？`, '把两个数的小数点对齐，再按同数位相加',
    ['把两个数的末位数字对齐，即使小数点错开', '只对齐整数部分后直接相加'], '小数加减要对齐相同数位，小数点对齐是最直观的检查方式。');
  const produce = blankCase(`计算 ${a} + ${b}，填写小数点对齐后的可加性检查和最终和。`,
    [['aligned', '小数点对齐后相同数位是否可相加（是/否）', '是'], ['sum', '和', fmt(sum)]], `${a}+${b}=${fmt(sum)}；个位、十分位分别相加。`);
  const rows = [0, 1, 2].map(offset => { const aa = aTenths + offset, bb = bTenths + offset; return { record: `${fmt(aa / 10)} + ${fmt(bb / 10)}`, correct: fmt((aa + bb) / 10) }; });
  const repair = repairCase(`小数加法记录 ${n + 1}`, rows, n);
  const first = fmt((20 + n * 2) / 10), second = fmt((6 + n) / 10), third = fmt((4 + n) / 10), total = Number(first) + Number(second) + Number(third);
  const transfer = blankCase(`三次路程记录分别为 ${first} km、${second} km、${third} km。先求前两段和，再求总路程。`,
    [['subtotal', '前两段和（km）', fmt(Number(first) + Number(second))], ['total', '总路程（km）', fmt(total)]],
    `前两段和为${fmt(Number(first) + Number(second))} km，三段合计${fmt(total)} km。`);
  return [rule, produce, repair, transfer];
});

spec('foundation:math:fractionequivalence', 'g5-fraction-equivalence', '通分、约分并保持分数等值', n => {
  const base = 2 + n % 5, factor = 2 + n % 4, other = 3 + (n + 1) % 5, scaled = base * factor, denom = other * factor;
  const rule = choiceCase(`分数 ${base}/${other} 与下列哪个分数等值？`, `${scaled}/${denom}`, [`${scaled + 1}/${denom}`, `${base}/${denom}`],
    `分子分母同时乘${factor}，数值不变，所以${base}/${other}=${scaled}/${denom}。`);
  const targetDen = other * 5;
  const produce = blankCase(`把 ${base}/${other} 变成分母为${targetDen}的等值分数，填写分子和乘数。`,
    [['factor', '同时乘的数', '5'], ['numerator', '新分子', String(base * 5)]], '分母乘5，分子也必须乘5。');
  const rows = [0, 1, 2].map(offset => { const f = 2 + offset + n % 3; return { record: `${base}/${other} 同时乘${f}`, correct: `${base * f}/${other * f}` }; });
  const repair = repairCase(`分数等值记录 ${n + 1}`, rows, n);
  const transfer = blankCase(`配方卡每份需要 ${base}/${other} 杯原料。做3份时，填写扩大后的分子、分母和已约分的等值分数。`,
    [['numerator', '扩大后的分子', String(base * 3)], ['denominator', '扩大后的分母', String(other * 3)], ['equal', '与原分数等值的分数', fraction(base, other)]],
    `每份等值关系不变；${base}/${other}=${base * 3}/${other * 3}=${fraction(base, other)}。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:decimalmultiply', 'g5-decimal-multiply', '按因数的小数位数确定积的小数位数', n => {
  const aHundredths = 105 + n * 7, bTenths = 12 + n % 6, raw = aHundredths * bTenths, value = raw / 1000, a = fmt(aHundredths / 100), b = fmt(bTenths / 10);
  const rule = choiceCase(`计算 ${a} × ${b}。先不看小数点，得到的整数积是${raw}；最终小数点怎样处理？`, '从右向左点三位小数', ['从右向左点一位小数', '不点小数点'],
    `${a}有两位小数，${b}有一位小数，共三位，所以积是${fmt(value)}。`);
  const produce = blankCase(`计算 ${a} × ${b}，填写忽略小数点后的整数积和带小数点的积。`,
    [['raw', '忽略小数点后的整数积', String(raw)], ['product', '最终积', fmt(value)]], `${aHundredths}×${bTenths}=${raw}；两位加一位共三位小数，积为${fmt(value)}。`);
  const rows = [0, 1, 2].map(offset => { const aa = aHundredths + offset * 3, bb = bTenths + offset; return { record: `${fmt(aa / 100)} × ${fmt(bb / 10)}`, correct: fmt(aa * bb / 1000) }; });
  const repair = repairCase(`小数乘法记录 ${n + 1}`, rows, n);
  const unitPrice = fmt((125 + n * 5) / 100), count = 4 + n % 5, total = Number(unitPrice) * count;
  const transfer = blankCase(`每本材料 ${unitPrice} 元，买 ${count} 本。先按“元”的百分之一计数，再写总价（元）。`,
    [['hundredths', '把单价看作多少个0.01元', String(Math.round(Number(unitPrice) * 100))], ['total', '总价（元）', fmt(total)]],
    `先计算${Math.round(Number(unitPrice) * 100)}个百分之一乘${count}，再恢复小数得到${fmt(total)}元。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:decimaldivide', 'g5-decimal-divide', '把除数为小数的除法等值转化为整数除法', n => {
  const divisorHundredths = 20 + (n % 4) * 5, dividendHundredths = divisorHundredths * (4 + n % 7), quotient = dividendHundredths / divisorHundredths,
    dividend = fmt(dividendHundredths / 100), divisor = fmt(divisorHundredths / 100);
  const rule = choiceCase(`计算 ${dividend} ÷ ${divisor}。为了把除数变成整数，应怎样处理两个数？`, '被除数和除数同时乘100', ['只把被除数乘100', '只移动被除数的小数点'],
    '除数有两位小数；被除数和除数同时乘100，商不变。');
  const produce = blankCase(`计算 ${dividend} ÷ ${divisor}，填写同时扩大100后的被除数和商。`,
    [['scaled', '扩大100后的被除数', String(dividendHundredths)], ['quotient', '商', fmt(quotient)]],
    `${dividend}÷${divisor}=${dividendHundredths}÷${divisorHundredths}=${fmt(quotient)}。`);
  const rows = [0, 1, 2].map(offset => { const d = divisorHundredths + offset * 5, dividendValue = d * (3 + offset + n % 4); return { record: `${fmt(dividendValue / 100)} ÷ ${fmt(d / 100)}`, correct: fmt(dividendValue / d) }; });
  const repair = repairCase(`小数除法记录 ${n + 1}`, rows, n);
  const boxes = 2 + n % 5, perBoxTenths = 25 + n * 2, totalTenths = boxes * perBoxTenths;
  const transfer = blankCase(`总量 ${fmt(totalTenths / 10)} kg 平均分成 ${boxes} 份。先把总量换成分解记录，再求每份。`,
    [['tenths', '总量含多少个0.1', String(totalTenths)], ['perBox', '每份（kg）', fmt(perBoxTenths / 10)]],
    `总量${fmt(totalTenths / 10)} kg，含${totalTenths}个0.1，平均每份${fmt(perBoxTenths / 10)} kg。`);
  return [rule, produce, repair, transfer];
});

const fractionPair = (n: number, subtract = false) => {
  const denA = 2 + n % 4, denB = denA + 1 + (n % 3), lcm = denA * denB / gcd(denA, denB),
    numA = 1 + n % Math.max(1, denA - 1), numB = subtract ? Math.max(1, 1 + n % denB) : 1 + n % Math.max(1, denB - 1),
    scaledA = numA * lcm / denA, scaledB = numB * lcm / denB, resultNum = subtract ? Math.max(0, scaledA - scaledB) : scaledA + scaledB;
  return { denA, denB, lcm, numA, numB, scaledA, scaledB, resultNum, result: fraction(resultNum, lcm) };
};

spec('core:math:fractionadd', 'g5-fraction-add', '异分母分数通分后相加', n => {
  const p = fractionPair(n), left = fraction(p.numA, p.denA), right = fraction(p.numB, p.denB);
  const rule = choiceCase(`计算 ${left} + ${right} 时，公共分母应取什么？`, String(p.lcm), [String(p.denA + p.denB), String(p.denA * p.denB), String(p.lcm + 1)],
    `${p.denA}和${p.denB}的最小公倍数是${p.lcm}，通分后两数分母相同才能相加。`);
  const produce = blankCase(`计算 ${left} + ${right}，填写通分后的两个分子与最简结果。`,
    [['left', '第一个通分分子', String(p.scaledA)], ['right', '第二个通分分子', String(p.scaledB)], ['sum', '和（最简分数）', p.result]],
    `公分母${p.lcm}，${p.scaledA}+${p.scaledB}=${p.resultNum}，最简分数为${p.result}。`);
  const rows = [0, 1, 2].map(offset => { const q = fractionPair(n + offset + 1); return { record: `${fraction(q.numA, q.denA)} + ${fraction(q.numB, q.denB)}`, correct: q.result }; });
  const repair = repairCase(`异分母加法记录 ${n + 1}`, rows, n);
  const transfer = blankCase(`一张纸先用于 ${left}，又用于 ${right}。填写已用比例和剩余比例（均须最简）。`,
    [['used', '已用比例', p.result], ['left', '剩余比例', fraction(p.lcm - p.resultNum, p.lcm)]],
    `已用${p.result}，把整张纸看作${p.lcm}/${p.lcm}，剩余${fraction(p.lcm - p.resultNum, p.lcm)}。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:fractionsubtract', 'g5-fraction-subtract', '异分母分数通分后相减', n => {
  const p = fractionPair(n, true), left = fraction(p.numA, p.denA), right = fraction(p.numB, p.denB);
  const rule = choiceCase(`计算 ${left} − ${right} 前，先通分。哪个分子对应 ${left}？`, String(p.scaledA), [String(p.numA), String(p.scaledB), String(p.lcm)],
    `${left}的通分分母是${p.lcm}，分子变为${p.scaledA}。`);
  const produce = blankCase(`计算 ${left} − ${right}，填写两个通分分子和差（最简分数）。`,
    [['left', '被减数通分后分子', String(p.scaledA)], ['right', '减数通分后分子', String(p.scaledB)], ['difference', '差（最简分数）', p.result]],
    `通分后${p.scaledA}−${p.scaledB}=${p.resultNum}，结果${p.result}。`);
  const rows = [0, 1, 2].map(offset => { const q = fractionPair(n + offset + 1, true); return { record: `${fraction(q.numA, q.denA)} − ${fraction(q.numB, q.denB)}`, correct: q.result }; });
  const repair = repairCase(`异分母减法记录 ${n + 1}`, rows, n);
  const transfer = blankCase(`一段材料全长的 ${left} 中已使用 ${right}。填写未使用比例，并判断是否超过一半。`,
    [['left', '未使用比例', p.result], ['moreThanHalf', '是否超过一半（是/否）', p.resultNum * 2 > p.lcm ? '是' : '否']],
    `未使用${p.result}；与一半比较时保持同一整体。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:equation', 'g5-equation-balance', '用等式两边同加同减求未知量', n => {
  const x = 7 + n * 2, add = 3 + n % 6, right = x + add, mode = n % 3;
  const equation = mode === 0 ? `x + ${add} = ${right}` : mode === 1 ? `x − ${add} = ${right - add * 2}` : `${add} + x = ${right}`;
  const expected = mode === 1 ? right - add : right - add;
  const rule = choiceCase(`解方程 ${equation}。为保持等式成立，应对两边同时做什么？`, mode === 1 ? `同时加${add}` : `同时减${add}`,
    ['只改变右边', '只改变左边', '两边同时乘0'], '等式两边执行相同运算，等式仍成立；先恢复x所在的加法或减法。');
  const produce = blankCase(`解方程 ${equation}，填写对两边执行的数与x。`, [['operation', '两边同时操作的数', String(add)], ['x', 'x的值', String(expected)]],
    `把方程变换为x=${expected}，代回原方程两边相等。`);
  const rows = [0, 1, 2].map(offset => { const value = x + offset, delta = 2 + offset + n % 4; return { record: `x + ${delta} = ${value + delta}`, correct: String(value) }; });
  const repair = repairCase(`等式记录 ${n + 1}`, rows, n);
  const before = x + 5, after = before - 3;
  const transfer = blankCase(`箱中原有未知数量x，放入5件后共有${before}件，再取出3件。填写原数量和取出后数量，并用等式核查。`,
    [['x', '原数量', String(x)], ['after', '取出后数量', String(after)]], `x+5=${before}得x=${x}；再减3等于${after}。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:trianglearea', 'g5-triangle-area', '用底和对应高求三角形面积', n => {
  const base = 12 + n * 2, height = 5 + n % 7, area = base * height / 2;
  const rule = choiceCase(`三角形的底为${base} cm、对应高为${height} cm。求面积应怎样列式？`, `${base}×${height}÷2`,
    [`(${base}+${height})÷2`, `${base}×${height}`, `${base}÷${height}÷2`], '三角形面积=底×对应高÷2，高必须垂直于这条底。');
  const produce = blankCase(`底${base} cm，高${height} cm。填写底与高的乘积和三角形面积（cm²）。`,
    [['product', '底×高', String(base * height)], ['area', '面积（cm²）', fmt(area)]], `${base}×${height}=${base * height}；再除以2得${fmt(area)} cm²。`);
  const rows = [0, 1, 2].map(offset => { const b = base + offset * 2, h = height + offset; return { record: `底${b} cm，高${h} cm`, correct: fmt(b * h / 2) }; });
  const repair = repairCase(`三角形面积记录 ${n + 1}`, rows, n);
  const knownArea = area + base * 2, solvedHeight = knownArea * 2 / base;
  const transfer = blankCase(`一个三角形面积是${fmt(knownArea)} cm²，底是${base} cm。反向求对应高：填写底×高的积和高。`,
    [['product', '底×高', fmt(knownArea * 2)], ['height', '对应高（cm）', fmt(solvedHeight)]], `面积×2÷底=${fmt(knownArea)}×2÷${base}=${fmt(solvedHeight)} cm。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:parallelogramarea', 'g5-parallelogram-area', '用底和垂直高求平行四边形面积', n => {
  const base = 9 + n * 2, height = 4 + n % 7, area = base * height;
  const rule = choiceCase(`平行四边形相邻斜边为${base + 3} cm，底为${base} cm，对应高为${height} cm。使用哪两个数据求面积？`, `${base} cm与${height} cm`,
    [`${base} cm与${base + 3} cm`, '三条边相加', '只使用底'], '平行四边形面积=底×对应高，不能把斜边当作高。');
  const produce = blankCase(`底${base} cm，对应高${height} cm。填写两个因数与面积（cm²）。`,
    [['base', '底', String(base)], ['height', '对应高', String(height)], ['area', '面积（cm²）', String(area)]], `${base}×${height}=${area}。`);
  const rows = [0, 1, 2].map(offset => { const b = base + offset, h = height + offset; return { record: `底${b} cm，高${h} cm`, correct: String(b * h) }; });
  const repair = repairCase(`平行四边形面积记录 ${n + 1}`, rows, n);
  const knownArea = area + base, solvedBase = knownArea / height;
  const transfer = blankCase(`平行四边形面积${knownArea} cm²，高${height} cm。反向求底，并填写所用运算。`,
    [['operation', '求底应使用的运算', '除法'], ['base', '底（cm）', fmt(solvedBase)]], `底=面积÷高=${knownArea}÷${height}=${fmt(solvedBase)} cm。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:trapezoidarea', 'g5-trapezoid-area', '用上底、下底和高求梯形面积', n => {
  const upper = 4 + n % 5, lower = upper + 3 + n % 4, height = 4 + n % 6, sum = upper + lower, area = sum * height / 2;
  const rule = choiceCase(`梯形上底${upper} cm、下底${lower} cm、高${height} cm。正确面积列式是哪个？`, `(${upper}+${lower})×${height}÷2`,
    [`${upper}×${lower}×${height}`, `(${upper}+${lower}+${height})÷2`, `(${lower}-${upper})×${height}`], '梯形面积=(上底+下底)×高÷2。');
  const produce = blankCase(`上底${upper} cm、下底${lower} cm、高${height} cm。填写上下底之和、乘积与面积（cm²）。`,
    [['sum', '上底+下底', String(sum)], ['product', '和×高', String(sum * height)], ['area', '面积（cm²）', fmt(area)]], `(${upper}+${lower})×${height}÷2=${fmt(area)} cm²。`);
  const rows = [0, 1, 2].map(offset => { const a = upper + offset, b = lower + offset, h = height + offset; return { record: `上底${a}，下底${b}，高${h}`, correct: fmt((a + b) * h / 2) }; });
  const repair = repairCase(`梯形面积记录 ${n + 1}`, rows, n);
  const knownArea = area + sum, solvedHeight = knownArea * 2 / sum;
  const transfer = blankCase(`梯形面积${fmt(knownArea)} cm²，上下底之和${sum} cm。反向求高，填写面积×2和高。`,
    [['doubled', '面积×2', fmt(knownArea * 2)], ['height', '高（cm）', fmt(solvedHeight)]], `高=面积×2÷上下底和=${fmt(solvedHeight)} cm。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:cuboidvolume', 'g5-cuboid-volume', '用长、宽、高求长方体体积', n => {
  const length = 4 + n % 7, width = 3 + n % 5, height = 2 + n % 6, baseArea = length * width, volume = baseArea * height;
  const rule = choiceCase(`长方体长${length} cm、宽${width} cm、高${height} cm。求体积的正确算式是什么？`, `${length}×${width}×${height}`,
    [`${length}+${width}+${height}`, `${length}×${width}+${height}`, `2×(${length}+${width}+${height})`], '长方体体积=长×宽×高。');
  const produce = blankCase(`长${length} cm、宽${width} cm、高${height} cm。填写底面积、体积数值和体积单位。`,
    [['base', '底面积', String(baseArea)], ['volume', '体积数值', String(volume)], ['unit', '体积单位', 'cm³']], `${length}×${width}=${baseArea}，再乘${height}得${volume} cm³。`);
  const rows = [0, 1, 2].map(offset => { const l = length + offset, w = width + offset, h = height + offset; return { record: `${l}×${w}×${h} cm`, correct: String(l * w * h) }; });
  const repair = repairCase(`长方体体积记录 ${n + 1}`, rows, n);
  const knownVolume = volume + baseArea, solvedHeight = knownVolume / baseArea;
  const transfer = blankCase(`一个长方体体积为${knownVolume} cm³，底面积${baseArea} cm²。反向求高，并写体积与容量单位关系。`,
    [['height', '高（cm）', fmt(solvedHeight)], ['relation', '1 cm³等于多少mL', '1']], `高=体积÷底面积=${fmt(solvedHeight)} cm；1 cm³=1 mL。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:cuboidsurface', 'g5-cuboid-surface', '用相对面的成对面积求长方体表面积', n => {
  const length = 3 + n % 6, width = 2 + n % 5, height = 2 + n % 4, pairs = [length * width, length * height, width * height],
    surface = 2 * (pairs[0] + pairs[1] + pairs[2]);
  const rule = choiceCase(`长${length} cm、宽${width} cm、高${height} cm 的长方体有几个互相平行的面组？`, '3组', ['2组', '4组', '6组'],
    '前后、左右、上下分别成三组，每组面积相等。');
  const produce = blankCase(`长${length} cm、宽${width} cm、高${height} cm。填写三类单个面面积和总表面积（cm²）。`,
    [['lw', '长×宽', String(pairs[0])], ['lh', '长×高', String(pairs[1])], ['total', '表面积（cm²）', String(surface)]],
    `三组单个面面积为${pairs.join('、')}，总和乘2得${surface} cm²。`);
  const rows = [0, 1, 2].map(offset => { const l = length + offset, w = width + offset, h = height + offset; return { record: `${l}×${w}, ${l}×${h}, ${w}×${h} cm`, correct: String(2 * (l * w + l * h + w * h)) }; });
  const repair = repairCase(`长方体表面积记录 ${n + 1}`, rows, n);
  const openTop = surface - pairs[0];
  const transfer = blankCase(`同一长方体要去掉一个${length} cm×${width} cm的上面。填写完整表面积和无盖表面积（cm²）。`,
    [['full', '完整表面积', String(surface)], ['open', '无盖表面积', String(openTop)]], `完整表面积${surface} cm²，减去顶面${pairs[0]} cm²得${openTop} cm²。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:volumeconvert', 'g5-volume-convert', '按1000进率换算立方分米和立方厘米', n => {
  const dm3 = 2 + n, cm3 = dm3 * 1000, reverse = 3000 + n * 500;
  const rule = choiceCase('1 dm³等于多少cm³？', '1000', ['100', '10', '10000'], '长度1 dm=10 cm，体积需三个方向同时换算，因此1 dm³=1000 cm³。');
  const produce = blankCase(`${dm3} dm³换成cm³，填写进率和结果。`, [['rate', '1 dm³等于多少cm³', '1000'], ['result', '换算结果（cm³）', String(cm3)]],
    `${dm3}×1000=${cm3} cm³。`);
  const rows = [0, 1, 2].map(offset => { const dm = dm3 + offset; return { record: `${dm} dm³ → cm³`, correct: String(dm * 1000) }; });
  const repair = repairCase(`体积单位换算记录 ${n + 1}`, rows, n);
  const transfer = blankCase(`容器容量写成${reverse} cm³。把它换成dm³，并填写以升表示的容量。`,
    [['dm3', '容量（dm³）', fmt(reverse / 1000)], ['liters', '容量（L）', fmt(reverse / 1000)]], `${reverse} cm³÷1000=${fmt(reverse / 1000)} dm³；1 dm³=1 L。`);
  return [rule, produce, repair, transfer];
});

spec('foundation:math:fractionmultiply', 'g6-fraction-multiply', '分数乘法先约分再相乘', n => {
  const a = 2 + n % 5, b = 3 + n % 4, c = 2 + (n + 1) % 5, d = 4 + n % 6, left = fraction(a, b), right = fraction(c, d), product = fraction(a * c, b * d);
  const rule = choiceCase(`计算 ${left} × ${right}。下列哪种做法保持乘积不变？`, '分子分母有公因数时先约分，再分子相乘、分母相乘',
    ['只乘分子，分母不变', '把分子分母交叉相加', '先求公分母再相乘'], '分数乘分数时，分子乘分子、分母乘分母；先约分可简化，但等值关系不变。');
  const produce = blankCase(`计算 ${left} × ${right}，填写分子乘积、分母乘积和最简结果。`,
    [['numerator', '分子乘积', String(a * c)], ['denominator', '分母乘积', String(b * d)], ['product', '最简积', product]],
    `${a}×${c}=${a * c}，${b}×${d}=${b * d}，约分后为${product}。`);
  const rows = [0, 1, 2].map(offset => { const aa = a + offset, bb = b, cc = c, dd = d + offset; return { record: `${fraction(aa, bb)} × ${fraction(cc, dd)}`, correct: fraction(aa * cc, bb * dd) }; });
  const repair = repairCase(`分数乘法记录 ${n + 1}`, rows, n);
  const whole = 2 + n % 7, part = fraction(1 + n % 3, 3 + n % 5);
  const transfer = blankCase(`一条材料全长${whole} m，用去全长的${part}。填写“全长×比例”的分子分母和最简用去长度（m）。`,
    [['numerator', '乘法分子', String(whole * Number(part.split('/')[0]))], ['denominator', '乘法分母', part.split('/')[1]],
      ['length', '用去长度（m，最简分数）', fraction(whole * Number(part.split('/')[0]), Number(part.split('/')[1]))]],
    `用去${whole}×${part}=${fraction(whole * Number(part.split('/')[0]), Number(part.split('/')[1]))} m。`);
  return [rule, produce, repair, transfer];
});

spec('foundation:math:percentage', 'g6-percentage-part', '用百分率求整体的指定部分', n => {
  const percent = [10, 20, 25, 40][n % 4], total = (5 + n % 8) * 20, part = total * percent / 100;
  const rule = choiceCase(`求${total}的${percent}%。应把百分率先变成哪个数再乘？`, fmt(percent / 100), [String(percent), String(100 - percent), fmt(percent / 10)],
    `${percent}%=${percent}/100=${fmt(percent / 100)}，再用整体乘这个比例。`);
  const produce = blankCase(`${total}名参与者的${percent}%完成作品。填写人数对应的比例和小数结果。`,
    [['rate', '百分率写成小数', String(percent / 100)], ['part', '完成人数', String(part)]], `${percent}%=${percent / 100}，${total}×${percent / 100}=${part}。`);
  const rows = [0, 1, 2].map(offset => { const p = percent, t = total + offset * 20; return { record: `${t}的${p}%`, correct: String(t * p / 100) }; });
  const repair = repairCase(`百分率部分记录 ${n + 1}`, rows, n);
  const leftPercent = percent, rightPercent = 100 - percent;
  const transfer = blankCase(`全部${total}份中${leftPercent}%已登记。填写已登记份数、未登记份数和未登记百分率。`,
    [['done', '已登记份数', String(part)], ['remaining', '未登记份数', String(total - part)], ['remainingRate', '未登记百分率（%）', String(rightPercent)]],
    `已登记${part}份，余下${total - part}份，即${rightPercent}%。`);
  return [rule, produce, repair, transfer];
});

spec('foundation:math:ratio', 'g6-ratio-sharing', '按比的份数分配总量', n => {
  const a = 1 + n % 4, b = 2 + n % 5, parts = a + b, unit = 3 + n % 7, total = parts * unit;
  const rule = choiceCase(`把总量${total}按${a}:${b}分配。总份数是多少？`, String(parts), [String(a * b), String(total), String(b - a)],
    `${a}:${b}表示甲${a}份、乙${b}份，共${parts}份。`);
  const produce = blankCase(`总量${total}按${a}:${b}分配，填写总份数、每份量和两份结果。`,
    [['parts', '总份数', String(parts)], ['unit', '每份量', String(unit)], ['aShare', '第一份结果', String(a * unit)], ['bShare', '第二份结果', String(b * unit)]],
    `总量÷${parts}=${unit}，分别乘${a}、${b}得到${a * unit}和${b * unit}。`);
  const rows = [0, 1, 2].map(offset => { const aa = a + offset, bb = b + offset, tt = (aa + bb) * unit; return { record: `${tt}按${aa}:${bb}`, correct: String(aa * unit) }; });
  const repair = repairCase(`按比分配记录 ${n + 1}`, rows, n);
  const changedA = a + 1, changedParts = changedA + b, updatedTotal = changedParts * (unit + 1);
  const transfer = blankCase(`总量更新为${updatedTotal}，比从${a}:${b}更新为${changedA}:${b}。填写新总份数和更新后的每份量。`,
    [['parts', '更新后的总份数', String(changedParts)], ['unit', '更新后的每份量', String(unit + 1)]], `更新比例为${changedA}:${b}，总份数变为${changedParts}，每份为${unit + 1}。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:fractiondivide', 'g6-fraction-divide', '分数除法转乘除数倒数', n => {
  const p = fractionPair(n), left = fraction(p.numA, p.denA), right = fraction(p.numB, p.denB), quotient = fraction(p.numA * p.denB, p.denA * p.numB);
  const rule = choiceCase(`计算 ${left} ÷ ${right}，应把哪个分数取倒数？`, right, [left, fraction(1, 1), `${p.numA}/${p.denB}`],
    '除以一个非零分数，等于乘它的倒数；被除数保持不变。');
  const produce = blankCase(`计算 ${left} ÷ ${right}，填写倒数和最简商。`,
    [['reciprocal', '除数的倒数', fraction(p.denB, p.numB)], ['quotient', '商（最简分数）', quotient]], `${left}×${fraction(p.denB, p.numB)}=${quotient}。`);
  const rows = [0, 1, 2].map(offset => { const q = fractionPair(n + offset + 1); const a = fraction(q.numA, q.denA), b = fraction(q.numB, q.denB); return { record: `${a} ÷ ${b}`, correct: fraction(q.numA * q.denB, q.denA * q.numB) }; });
  const repair = repairCase(`分数除法记录 ${n + 1}`, rows, n);
  const total = fraction(p.numA, p.denA), portions = p.numB + 1;
  const transfer = blankCase(`总量${total}平均分成${portions}份。把整数份数写成分数，再求每份（最简）。`,
    [['divisor', '整数份数写成假分数', `${portions}/1`], ['each', '每份（最简分数）', fraction(p.numA, p.denA * portions)]],
    `${total}÷${portions}=${total}×1/${portions}=${fraction(p.numA, p.denA * portions)}。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:percentagerate', 'g6-percentage-rate', '用部分除以整体求百分率', n => {
  const whole = 40 + (n % 6) * 10, part = whole * [20, 25, 40, 50][n % 4] / 100, percent = part / whole * 100;
  const rule = choiceCase(`${whole}名中有${part}名完成。求完成百分率，应怎样列式？`, `${part}÷${whole}×100%`, [`${whole}÷${part}×100%`, `${part}×${whole}÷100`, `${whole}−${part}`],
    '百分率=部分÷整体×100%。');
  const produce = blankCase(`${whole}份中${part}份合格。填写部分与整体的比值和百分率（%）。`,
    [['ratio', '部分÷整体（小数）', fmt(part / whole)], ['percent', '百分率（%）', fmt(percent)]], `${part}÷${whole}=${fmt(part / whole)}，乘100%得${fmt(percent)}%。`);
  const rows = [0, 1, 2].map(offset => { const w = whole + offset * 10, p = w * [20, 25, 40][(n + offset) % 3] / 100; return { record: `${p}÷${w}`, correct: `${fmt(p / w * 100)}%` }; });
  const repair = repairCase(`百分率记录 ${n + 1}`, rows, n);
  const transfer = blankCase(`全部${whole}份中有${part}份完成。填写未完成份数和未完成百分率。`,
    [['remaining', '未完成份数', String(whole - part)], ['remainingRate', '未完成百分率（%）', fmt(100 - percent)]],
    `未完成${whole - part}份，占${fmt(100 - percent)}%；两部分百分率合为100%。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:percentagewhole', 'g6-percentage-whole', '由部分和百分率反求整体', n => {
  const percent = [10, 20, 25, 40, 50][n % 5], unit = 4 + n % 8, total = 100 * unit, part = total * percent / 100;
  const rule = choiceCase(`已知一部分为${part}，占整体的${percent}%，求整体。应按哪种关系计算？`, `${part}÷${percent / 100}`, [`${part}×${percent / 100}`, `${part}+${percent}`, `${percent}÷${part}`],
    '部分=整体×百分率，所以整体=部分÷百分率。');
  const produce = blankCase(`部分${part}占整体的${percent}%。填写百分率小数和整体。`,
    [['rate', '百分率小数', String(percent / 100)], ['whole', '整体', String(total)]], `${part}÷${percent / 100}=${total}。`);
  const rows = [0, 1, 2].map(offset => { const pct = [20, 25, 40][(n + offset) % 3], whole = 80 + offset * 20; return { record: `${whole * pct / 100}占整体的${pct}%`, correct: String(whole) }; });
  const repair = repairCase(`反求整体记录 ${n + 1}`, rows, n);
  const remainder = total - part;
  const transfer = blankCase(`部分${part}占整体的${percent}%，其余部分占${100 - percent}%。填写整体和其余部分。`,
    [['whole', '整体', String(total)], ['remaining', '其余部分', String(remainder)]], `整体${part}÷${percent / 100}=${total}，其余${total - part}。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:ratioequivalent', 'g6-ratio-equivalent', '用同乘同除保持比等值', n => {
  const a = 2 + n % 5, b = 3 + n % 6, factor = 2 + n % 4, c = a * factor, d = b * factor;
  const rule = choiceCase(`${a}:${b} 与哪个比等值？`, `${c}:${d}`, [`${c + 1}:${d}`, `${a}:${d}`, `${b}:${a}`], `前项、后项同时乘${factor}，比值不变。`);
  const produce = blankCase(`把${a}:${b}的前项变成${c}，填写乘数和新的后项，并写最简比。`,
    [['factor', '前项乘数', String(factor)], ['posterior', '新后项', String(d)], ['simplified', '最简比', `${a / gcd(a, b)}:${b / gcd(a, b)}`]],
    `前项乘${factor}，后项也乘${factor}，得到${c}:${d}；最简比为${a / gcd(a, b)}:${b / gcd(a, b)}。`);
  const rows = [0, 1, 2].map(offset => { const aa = a + offset, bb = b + offset, f = 2 + offset; return { record: `${aa}:${bb} 同时乘${f}`, correct: `${aa * f}:${bb * f}` }; });
  const repair = repairCase(`等值比记录 ${n + 1}`, rows, n);
  const times = 3 + n % 4;
  const transfer = blankCase(`设计图把比例${a}:${b}放大${times}倍仍保持形状。填写放大后的前后项和最简比。`,
    [['anterior', '放大后前项', String(a * times)], ['posterior', '放大后后项', String(b * times)], ['simplified', '最简比', `${a / gcd(a, b)}:${b / gcd(a, b)}`]],
    `同乘${times}得${a * times}:${b * times}，约分仍为${a / gcd(a, b)}:${b / gcd(a, b)}。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:proportion', 'g6-proportion-cross-product', '比例内项积等于外项积', n => {
  const a = 2 + n % 7, b = 3 + n % 6, factor = 2 + n % 5, c = a * factor, d = b * factor;
  const rule = choiceCase(`判断 ${a}:${b}=${c}:x 时，哪组乘积相等？`, `${a}×x = ${b}×${c}`, [`${a}×${b}=${c}×x`, `${a}×${c}=${b}×x`, '只需比较最大数'],
    '比例中两个外项、两个内项分别相乘，乘积相等。');
  const produce = blankCase(`解比例 ${a}:${b}=${c}:x，填写内项积和x。`,
    [['product', '内项积', String(b * c)], ['x', 'x值', String(d)]], `${b}×${c}=${a}×x=${b * c}，x=${d}。`);
  const rows = [0, 1, 2].map(offset => { const aa = a + offset, bb = b + offset, cc = aa * factor; return { record: `${aa}:${bb}=${cc}:x`, correct: String(bb * factor) }; });
  const repair = repairCase(`比例求解记录 ${n + 1}`, rows, n);
  const transfer = blankCase(`两个比 ${a}:${b} 和 ${c}:x 要组成比例。先写外项积和内项积，再求x。`,
    [['outer', '外项积', String(a * d)], ['inner', '内项积', String(b * c)], ['x', 'x值', String(d)]], `外项积${a}×${d}，内项积${b}×${c}，二者相等。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:diameter', 'g6-circle-diameter', '圆半径与直径互为2倍关系', n => {
  const radius = 2 + n, diameter = radius * 2;
  const rule = choiceCase(`圆半径是${radius} cm，直径是多少？`, String(diameter), [String(radius * 4), String(radius * 5)], '同圆中直径=2×半径。');
  const produce = blankCase(`圆直径${diameter + 2} cm。填写半径和直径与半径的倍数关系。`,
    [['radius', '半径（cm）', String((diameter + 2) / 2)], ['ratio', '直径是半径的几倍', '2']], `半径=${diameter + 2}÷2=${(diameter + 2) / 2} cm。`);
  const rows = [0, 1, 2].map(offset => { const r = radius + offset; return { record: `半径${r} cm`, correct: `${r * 2} cm` }; });
  const repair = repairCase(`半径直径记录 ${n + 1}`, rows, n);
  const circumferenceRadius = radius + 3;
  const transfer = blankCase(`一个图形的圆边到圆心距离${circumferenceRadius} cm。填写直径和下一步计算周长时要用的数。`,
    [['diameter', '直径（cm）', String(circumferenceRadius * 2)], ['factor', '直径是半径的倍数', '2']], `直径=${circumferenceRadius}×2=${circumferenceRadius * 2} cm。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:circumference', 'g6-circumference', '用圆周率和直径求圆周长', n => {
  const radius = 1 + n % 12, diameter = radius * 2, circumference = 3.14 * diameter;
  const rule = choiceCase(`圆半径为${radius} cm，至少先换算成直径。周长算式错误的是哪个？`, `${3.14}×${radius}`, [`3.14×${diameter}`, `3.14×2×${radius}`, `2×3.14×${radius}`],
    '周长=πd=2πr；把半径直接乘π少乘了一个2。');
  const produce = blankCase(`圆半径${radius} cm，取π=3.14。填写直径和周长（cm）。`,
    [['diameter', '直径', String(diameter)], ['circumference', '周长（cm）', fmt(circumference)]], `周长=3.14×${diameter}=${fmt(circumference)} cm。`);
  const rows = [0, 1, 2].map(offset => { const d = diameter + offset; return { record: `直径${d} cm，π=3.14`, correct: fmt(3.14 * d) }; });
  const repair = repairCase(`圆周长记录 ${n + 1}`, rows, n);
  const circumference2 = 3.14 * (diameter + 4);
  const transfer = blankCase(`一个轮子直径变为${diameter + 4} cm。填写新直径、转1圈的周长（cm）和转3圈的路程（cm）。`,
    [['diameter', '新直径（cm）', String(diameter + 4)], ['oneTurn', '1圈（cm）', fmt(circumference2)], ['threeTurns', '3圈（cm）', fmt(circumference2 * 3)]],
    `1圈为3.14×${diameter + 4}=${fmt(circumference2)} cm，3圈为${fmt(circumference2 * 3)} cm。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:circlearea', 'g6-circle-area', '用半径的平方求圆面积', n => {
  const radius = 1 + n % 10, area = 3.14 * radius * radius;
  const rule = choiceCase(`圆半径${radius} cm，取π=3.14。求面积应使用哪个算式？`, `3.14×${radius}×${radius}`, [`3.14×${radius}`, `3.14×${radius * 2}`, `3.14×${radius}×2`],
    '圆面积=πr²，先算半径×半径，再乘3.14。');
  const produce = blankCase(`圆半径${radius} cm，取π=3.14。填写半径平方和面积（cm²）。`,
    [['square', '半径平方', String(radius * radius)], ['area', '面积（cm²）', fmt(area)]], `${radius}²=${radius * radius}，3.14×${radius * radius}=${fmt(area)} cm²。`);
  const rows = [0, 1, 2].map(offset => { const r = radius + offset; return { record: `半径${r} cm，π=3.14`, correct: fmt(3.14 * r * r) }; });
  const repair = repairCase(`圆面积记录 ${n + 1}`, rows, n);
  const diameter = radius * 2;
  const transfer = blankCase(`一个圆直径${diameter} cm。先把直径化成半径，再求面积（cm²）。`,
    [['radius', '半径（cm）', String(radius)], ['area', '面积（cm²）', fmt(area)]], `半径${diameter}÷2=${radius} cm，面积3.14×${radius}²=${fmt(area)} cm²。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:cylindervolume', 'g6-cylinder-volume', '用底面积乘高求圆柱体积', n => {
  const radius = 1 + n % 8, height = 3 + n % 9, base = 3.14 * radius * radius, volume = base * height;
  const rule = choiceCase(`圆柱底面半径${radius} cm、高${height} cm。体积的正确关系是什么？`, '底面积×高', ['底面积+高', '侧面积×半径', '底面周长÷高'],
    '圆柱体积等于底面积乘高，底面积按圆面积πr²计算。');
  const produce = blankCase(`圆柱底面半径${radius} cm、高${height} cm，取π=3.14。填写底面积和体积（cm³）。`,
    [['base', '底面积（cm²）', fmt(base)], ['volume', '体积（cm³）', fmt(volume)]], `底面积3.14×${radius}²=${fmt(base)} cm²，再乘高${height}得${fmt(volume)} cm³。`);
  const rows = [0, 1, 2].map(offset => { const r = radius + offset, h = height + offset; return { record: `半径${r}，高${h}，π=3.14`, correct: fmt(3.14 * r * r * h) }; });
  const repair = repairCase(`圆柱体积记录 ${n + 1}`, rows, n);
  const containerVolume = volume + base;
  const transfer = blankCase(`圆柱容器体积为${fmt(containerVolume)} cm³，底面积${fmt(base)} cm²。反向求高，并填写以升表示的容量（结果取三位小数）。`,
    [['height', '高（cm）', fmt(containerVolume / base)], ['liters', '容量（L，三位小数）', (containerVolume / 1000).toFixed(3)]],
    `高=体积÷底面积；1 L=1000 cm³，故容量为${(containerVolume / 1000).toFixed(3)} L。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:cylinderlateral', 'g6-cylinder-lateral', '把圆柱侧面展开为长方形', n => {
  const radius = 1 + n % 9, height = 2 + n % 8, circumference = 3.14 * 2 * radius, lateral = circumference * height;
  const rule = choiceCase('把圆柱侧面沿高剪开并展开，得到的图形是什么？', '长为底面周长、宽为高的长方形', ['两个半径为高的三角形', '直径为底、半径为高的平行四边形', '边长为高的正方形'],
    '侧面展开后，卷起来的方向是底面周长，竖直方向是高。');
  const produce = blankCase(`圆柱底面半径${radius} cm、高${height} cm，取π=3.14。填写底面周长和侧面积（cm²）。`,
    [['circumference', '底面周长（cm）', fmt(circumference)], ['lateral', '侧面积（cm²）', fmt(lateral)]], `底面周长2×3.14×${radius}=${fmt(circumference)} cm，侧面积再乘高${height}。`);
  const rows = [0, 1, 2].map(offset => { const r = radius + offset, h = height + offset; return { record: `半径${r}，高${h}`, correct: fmt(3.14 * 2 * r * h) }; });
  const repair = repairCase(`圆柱侧面积记录 ${n + 1}`, rows, n);
  const labelHeight = lateral / circumference;
  const transfer = blankCase(`展开图的长为${fmt(circumference)} cm，面积为${fmt(lateral)} cm²。反向填写展开图的宽和高。`,
    [['width', '展开图宽（cm）', fmt(labelHeight)], ['cylinderHeight', '圆柱高（cm）', fmt(labelHeight)]], `长方形面积÷长=${fmt(lateral)}÷${fmt(circumference)}=${fmt(labelHeight)} cm，这个宽就是圆柱高。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:conevolume', 'g6-cone-volume', '等底等高圆锥体积是圆柱的三分之一', n => {
  const radius = [3, 4, 5][n % 3], height = [6, 9, 12][n % 3], cylinder = 3.14 * radius * radius * height, cone = cylinder / 3;
  const rule = choiceCase('等底等高的圆柱和圆锥，圆锥体积与圆柱体积是什么关系？', '圆锥体积是圆柱体积的1/3', ['两者相等', '圆锥是圆柱的2倍', '圆锥是圆柱的1/6'],
    '在底面积和高都相同的条件下，圆锥体积V=1/3πr²h。');
  const produce = blankCase(`圆锥半径${radius} cm、高${height} cm，取π=3.14。先填写同底等高圆柱体积，再填写圆锥体积（cm³）。`,
    [['cylinder', '圆柱体积（cm³）', fmt(cylinder)], ['cone', '圆锥体积（cm³）', fmt(cone)]], `圆柱体积${fmt(cylinder)} cm³，圆锥为它的1/3，即${fmt(cone)} cm³。`);
  const rows = [0, 1, 2].map(offset => { const r = radius + offset, h = height; return { record: `圆锥半径${r}，高${h}`, correct: fmt(3.14 * r * r * h / 3) }; });
  const repair = repairCase(`圆锥体积记录 ${n + 1}`, rows, n);
  const sameBase = (radius + 2) ** 2 * 3.14, coneHeight = 9;
  const coneV = sameBase * coneHeight / 3;
  const transfer = blankCase(`一个圆锥底面积${fmt(sameBase)} cm²、高${coneHeight} cm。填写圆柱体积和圆锥体积（cm³）。`,
    [['cylinder', '同底等高圆柱体积', fmt(sameBase * coneHeight)], ['cone', '圆锥体积', fmt(coneV)]], `圆锥体积=底面积×高÷3=${fmt(coneV)} cm³。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:scale', 'g6-scale', '按比例尺在图上距离与实际距离间换算', n => {
  const scale = [100, 200, 500, 1000][n % 4], mapCm = 3 + n % 8, actualMeters = mapCm * scale / 100;
  const rule = choiceCase(`比例尺1:${scale}表示图上1 cm对应实际多少cm？`, String(scale), [String(Math.round(scale / 2)), String(scale * 10), String(mapCm)],
    `比例尺前项1、后项${scale}，图上1 cm对应实际${scale} cm。`);
  const produce = blankCase(`比例尺1:${scale}，图上距离${mapCm} cm。填写实际厘米和实际米数。`,
    [['cm', '实际距离（cm）', String(mapCm * scale)], ['meters', '实际距离（m）', fmt(actualMeters)]],
    `${mapCm}×${scale}=${mapCm * scale} cm，再除以100得${fmt(actualMeters)} m。`);
  const rows = [0, 1, 2].map(offset => { const cm = mapCm + offset; return { record: `1:${scale}，图上${cm} cm`, correct: `${fmt(cm * scale / 100)} m` }; });
  const repair = repairCase(`比例尺记录 ${n + 1}`, rows, n);
  const actualKm = 0.2 + n * 0.1, mapOutputCm = actualKm * 100000 / scale;
  const transfer = blankCase(`实际距离${fmt(actualKm)} km，比例尺1:${scale}。先把实际距离换成cm，再求图上距离（cm）。`,
    [['actualCm', '实际距离（cm）', fmt(actualKm * 100000)], ['mapCm', '图上距离（cm）', fmt(mapOutputCm)]], `实际${fmt(actualKm)} km=${fmt(actualKm * 100000)} cm，图上为实际÷${scale}=${fmt(mapOutputCm)} cm。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:speed', 'g6-speed-relation', '路程、速度和时间的关系', n => {
  const speed = [40, 45, 50, 60, 75, 80][n % 6], time = 2 + n % 5, distance = speed * time;
  const rule = choiceCase(`速度${speed} km/h，运动${time} h。求路程应怎样计算？`, `${speed}×${time}`, [`${speed}÷${time}`, `${distance}÷${speed}`, `${speed}+${time}`],
    '路程=速度×时间；单位中的每小时与小时数对应。');
  const produce = blankCase(`速度${speed} km/h，时间${time} h。填写路程，并写若总路程为${distance * 2} km需要的时间。`,
    [['distance', '本次路程（km）', String(distance)], ['doubledTime', '路程是2倍时的时间（h）', String(time * 2)]], `路程${speed}×${time}=${distance} km；速度不变，2倍路程需${time * 2} h。`);
  const rows = [0, 1, 2].map(offset => { const v = speed + offset * 5, t = time + offset; return { record: `${v} km/h，${t} h`, correct: `${v * t} km` }; });
  const repair = repairCase(`路程记录 ${n + 1}`, rows, n);
  const knownDistance = distance + speed;
  const transfer = blankCase(`总路程${knownDistance} km，计划${time + 1} h完成。填写平均速度和若提前1 h所需的平均速度。`,
    [['speed', '计划平均速度（km/h）', fmt(knownDistance / (time + 1))], ['faster', '提前1 h的速度（km/h）', fmt(knownDistance / time)]],
    `平均速度=路程÷时间；${knownDistance}÷${time + 1}=${fmt(knownDistance / (time + 1))} km/h。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:negativeorder', 'g6-negative-order', '负整数在数轴上的顺序', n => {
  const a = -(2 + n % 8), b = -(5 + n % 9), c = n % 4;
  const min = Math.min(a, b), max = Math.max(a, b, c);
  const rule = choiceCase(`在数轴上比较 ${a}、${b}、${c}。最小的数是哪个？`, String(min), [String(max), String(Math.abs(min)), String(c)],
    '数轴上越靠左的数越小；负数绝对值越大，位置越靠左。');
  const produce = blankCase(`把 ${a}、${b}、${c} 从小到大排列，填写最小值和最大值。`,
    [['min', '最小值', String(min)], ['max', '最大值', String(max)]], `从小到大的端点分别是${min}和${max}。`);
  const rows = [0, 1, 2].map(offset => { const x = -(2 + offset + n % 5), y = -(5 + offset + n % 4); return { record: `${x}与${y}，较小值`, correct: String(Math.min(x, y)) }; });
  const repair = repairCase(`负整数比较记录 ${n + 1}`, rows, n);
  const boundary = -(4 + n % 7), moved = boundary + 3;
  const transfer = blankCase(`数轴上从 ${boundary} 向右移动3个单位。填写移动后的数，并说明它比原数大还是小。`,
    [['moved', '移动后的数', String(moved)], ['direction', '相比原数（大/小）', '大']], `向右移动增加数值：${boundary}+3=${moved}。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:sectorcount', 'g6-sector-count', '扇形百分率对应频数', n => {
  const total = 100 * (2 + n % 6), percent = [10, 20, 25, 40][n % 4], count = total * percent / 100;
  const rule = choiceCase(`扇形统计图总量${total}，某扇形占${percent}%。该扇形代表多少？`, String(count), [String(percent), String(total - count), String(total * percent)],
    `扇形频数=总量×百分率=${total}×${percent / 100}=${count}。`);
  const produce = blankCase(`总量${total}，某扇形${percent}%。填写比例小数和频数，并写剩余频数。`,
    [['rate', '比例小数', String(percent / 100)], ['count', '该扇形频数', String(count)], ['remaining', '剩余频数', String(total - count)]],
    `该扇形${count}，剩余${total - count}。`);
  const rows = [0, 1, 2].map(offset => { const p = [20, 25, 40][(n + offset) % 3], t = total + offset * 100; return { record: `${t}的${p}%扇形`, correct: String(t * p / 100) }; });
  const repair = repairCase(`扇形频数记录 ${n + 1}`, rows, n);
  const changedPercent = percent + 5, changedCount = total * changedPercent / 100;
  const transfer = blankCase(`扇形从${percent}%更新为${changedPercent}%，总量仍为${total}。填写新增频数和更新后频数。`,
    [['added', '新增频数', String(changedCount - count)], ['updated', '更新后频数', String(changedCount)]], `更新后${total}×${changedPercent / 100}=${changedCount}，比原来多${changedCount - count}。`);
  return [rule, produce, repair, transfer];
});

spec('core:math:possibility', 'g6-equal-possibility', '在等可能结果中比较有利结果数量', n => {
  const red = 1 + n % 7, blue = 1 + (n + 3) % 7, total = red + blue, more = red === blue ? '一样大' : red > blue ? '红球' : '蓝球';
  const rule = choiceCase(`袋中红球${red}个、蓝球${blue}个，球除颜色外完全相同。随机摸出红球和蓝球的可能性怎样比较？`, more,
    [more === '红球' ? '蓝球' : '红球', '不可能摸到球', '一定摸到红球'], '每种球被摸到的可能性与其数量对应；数量多则有利结果多。');
  const produce = blankCase(`袋中红球${red}个、蓝球${blue}个，共${total}个。填写各颜色有利结果数和总结果数。`,
    [['red', '红球有利结果数', String(red)], ['blue', '蓝球有利结果数', String(blue)], ['total', '等可能结果总数', String(total)]], `在球除颜色外相同的条件下，各球等可能；总数为${total}。`);
  const rows = [0, 1, 2].map(offset => { const r = red + offset, b = blue + offset; return { record: `红${r}、蓝${b}，可能性较大颜色`, correct: r === b ? '一样大' : r > b ? '红球' : '蓝球' }; });
  const repair = repairCase(`等可能结果记录 ${n + 1}`, rows, n);
  const extraRed = 2, newRed = red + extraRed;
  const transfer = blankCase(`袋中原来红${red}、蓝${blue}，再加入${extraRed}个红球。填写更新后的红蓝结果数和可能性较大的颜色。`,
    [['red', '更新后红球数', String(newRed)], ['blue', '更新后蓝球数', String(blue)], ['more', '可能性较大颜色（或“一样大”）', newRed === blue ? '一样大' : newRed > blue ? '红球' : '蓝球']],
    `加入红球后，红球有利结果变为${newRed}，蓝球仍为${blue}。`);
  return [rule, produce, repair, transfer];
});

const familyMeta = [
  { suffix: 'rule-understanding', dimension: 'understanding' as const, seconds: 50, structure: '明确数量、单位或图形关系 → 选择正确关系', distinction: '核对规则与当前数据是否对应，不以数字大小或关键词猜。' },
  { suffix: 'procedure', dimension: 'procedure' as const, seconds: 80, structure: '已知数据与中间量 → 分步计算并填写结果', distinction: '要求独立执行中间步骤和最终计算，保留可观察过程证据。' },
  { suffix: 'record-repair', dimension: 'transfer' as const, seconds: 105, structure: '三条完整记录 → 定位唯一结果冲突并修复', distinction: '逐条重算并定位错误，额外阅读、计算或记录追踪是替代解释。' },
  { suffix: 'updated-transfer', dimension: 'transfer' as const, seconds: 110, structure: '反向求量、单位变化或更新记录 → 应用当前关系', distinction: '改变条件或方向后重新建模，不能复用上一项结果位置或固定公式答案。' },
];

export function buildMathGrade5Grade6ProbeFamilies(): AuthoredProbeFamily[] {
  const families: AuthoredProbeFamily[] = [];
  for (const definition of specs) for (const [index, meta] of familyMeta.entries()) {
    const family = `${definition.code}-${meta.suffix}`;
    families.push({ atomId: definition.atomId, family, dimension: meta.dimension, behavior: definition.behavior, structure: meta.structure, distinction: meta.distinction,
      exercises: Array.from({ length: 12 }, (_, n) => {
        const item = definition.make(n)[index], task = asTask({ ...item, stem: `第${n + 1}份材料：${item.stem}` }, meta.seconds);
        return { ...task, family, dimension: meta.dimension, identityVersion: 2, expectedSeconds: meta.seconds };
      }) });
  }
  return families;
}

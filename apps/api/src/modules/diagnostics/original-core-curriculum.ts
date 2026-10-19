import type { KnowledgeAtom, MeasurementDimension, Subject } from '@study-agent/contracts';
import type { Exercise, FoundationDefinition } from './foundation-curriculum';
import { addChineseCurriculum, addEnglishCurriculum } from './original-language-curriculum';
import { addSpokenCurriculum } from './spoken-curriculum';

export type CurriculumAuthor = (subject: Subject, grade: number, code: string, strand: string, name: string,
  objective: string, prerequisites: string[], template: (n: number) => Exercise, count?: number) => void;
export const coreId = (subject: Subject, code: string) => `core:${subject}:${code}`;
export const numberItem = (stem: string, answer: number | string, family: string, dimension: MeasurementDimension = 'procedure'): Exercise =>
  ({ stem, answer, family, dimension, mode: 'numeric_blank' });
export const choiceItem = (stem: string, answer: string, options: string[], family: string, dimension: MeasurementDimension = 'understanding'): Exercise =>
  ({ stem, answer, options: [...new Set([answer, ...options])], family, dimension, mode: 'single_choice' });

/** Original, inspectable skill tasks. Grade is a progression recommendation, not an edition equivalence or norm. */
export function buildCoreCurriculum(): FoundationDefinition[] {
  const definitions: FoundationDefinition[] = [];
  const add: CurriculumAuthor = (subject, grade, code, strand, name, objective, prerequisiteIds, template, count = 24) => {
    const atom: KnowledgeAtom = { id: coreId(subject, code), subject, grade, term: 'both', name, strand, objective,
      successCriterion: `按题目条件独立完成${name}；用另一个结构的新题核查，并在延迟复测时再次验证。`,
      prerequisiteIds, curriculumVersion: 'original-core-v2', status: 'published', version: 1 };
    const exercises = new Map<string, Exercise>();
    for (let n = 0; n < count; n++) { const item = template(n); exercises.set(JSON.stringify([item.stem, item.answer]), item); }
    definitions.push({ atom, exercises: [...exercises.values()] });
  };
  const f = (code: string) => `foundation:math:${code}`, m = (code: string) => coreId('math', code);
  const math = (grade: number, code: string, strand: string, name: string, objective: string, pre: string[], template: (n: number) => Exercise, count = 24) =>
    add('math', grade, code, strand, name, objective, pre, template, count);
  const num = '数与运算', relation = '数量关系', shape = '图形与空间', measure = '度量与实践', stats = '数据与可能性';

  math(1, 'count', num, '按一一对应计数', '将每个对象计入一次，确定集合基数', [], n => numberItem(`数一数：${'● '.repeat(2 + n % 9)}。一共有几个圆点？`, 2 + n % 9, 'count-dots', 'understanding'), 9);
  math(1, 'compare20', num, '20以内数量比较', '比较两个不相等的数量并确定较大的数', [m('count')], n => {
    const a = 1 + n % 19, b = a + 1;
    return n % 2 ? numberItem(`两盒分别有${a}支和${b}支笔，较多的一盒有几支？`, b, 'compare-story', 'transfer') : numberItem(`${b}和${a}，较大的数是多少？`, b, 'compare-symbol', 'understanding');
  });
  math(1, 'ordinal', num, '位置序数与数量区分', '根据从左或从右的指定方向确定序位', [m('count')], n => {
    const total = 5 + n % 6, pos = 1 + n % total;
    return numberItem(`${total}人排成一排，小禾从左数第${pos}。从右数是第几？`, total - pos + 1, 'ordinal-reversal', 'understanding');
  });
  math(1, 'neighbors', num, '相邻整数关系', '确定给定整数前面或后面的一个数', [m('count')], n => {
    const a = 2 + n % 17; return numberItem(`${a}${n % 2 ? '前面' : '后面'}的一个整数是多少？`, n % 2 ? a - 1 : a + 1, n % 2 ? 'predecessor' : 'successor', 'understanding');
  });
  math(1, 'tensones', num, '十和一的组成', '把十个一看作一个十，合成两位数', [m('count')], n => {
    const t = 1 + n % 8, u = n % 10;
    return n % 2 ? numberItem(`${t * 10 + u}中十位上的数字是多少？`, t, 'tens-extract', 'understanding') : numberItem(`${t}个十和${u}个一合起来是多少？`, t * 10 + u, 'tens-compose', 'understanding');
  });
  math(1, 'complement10', num, '凑成十的补数', '由已知部分找出合成十的另一部分', [f('decompose10')], n => {
    const a = 1 + n % 9; return n % 2 ? numberItem(`盒中要放满10个球，已有${a}个，还缺几个？`, 10 - a, 'complement-capacity', 'transfer') : numberItem(`${a}+?=10，问号是多少？`, 10 - a, 'complement-equation', 'understanding');
  });
  math(1, 'unknownadd', relation, '由和求未知加数', '从已知总数与一部分确定另一部分', [f('subtract20')], n => {
    const a = 3 + n % 8, b = 2 + n % 6; return n % 2 ? numberItem(`共${a + b}人，男生${a}人，女生几人？`, b, 'unknown-addend-story', 'transfer') : numberItem(`${a}+?=${a + b}，问号是多少？`, b, 'unknown-addend-equation');
  });
  math(1, 'difference', relation, '两个数量的相差关系', '求一个数量比另一个多或少的数量', [f('subtract20')], n => {
    const a = 5 + n % 8, b = 1 + n % 4; return numberItem(n % 2 ? `红花${a}朵，蓝花${b}朵，红花比蓝花多几朵？` : `${a}比${b}多多少？`, a - b, n % 2 ? 'difference-story' : 'difference-numeric', n % 2 ? 'transfer' : 'understanding');
  });
  math(1, 'mixed20', num, '20以内连加连减的顺序', '从左到右逐步计算没有括号的加减式', [f('add20'), f('subtract20')], n => {
    const a = 4 + n % 6, b = 2 + n % 5, c = 1 + n % 3; return numberItem(`${a}+${b}-${c}=?`, a + b - c, 'addition-subtraction-chain');
  });
  const planes = [['有3条直边、3个角的平面图形', '三角形'], ['有4条相等的边、4个直角的平面图形', '正方形'], ['没有直边、没有角的平面图形', '圆'], ['4个直角，邻边长不同的四边形', '长方形']];
  math(1, 'planeshapes', shape, '按边角特征识别平面图形', '根据明确的边角条件识别图形', [], n => { const [s, a] = planes[n % 4]; return choiceItem(`${s}是？`, a, planes.map(p => p[1]), 'plane-properties'); }, 4);
  const solids = [['有6个完全相同正方形面的立体', '正方体'], ['上下两个等大的圆形面，侧面为曲面的立体', '圆柱'], ['表面为球面的立体', '球']];
  math(1, 'solidshapes', shape, '按表面特征识别立体', '根据面的形状识别常见立体图形', [], n => { const [s, a] = solids[n % 3]; return choiceItem(`${s}是？`, a, solids.map(p => p[1]), 'solid-properties'); }, 3);
  math(1, 'wholehour', measure, '整时的时针与分针', '由整点时钟的指针位置确定小时数', [], n => numberItem(`钟表分针指向12，时针指向${1 + n % 12}，现在是几时？`, 1 + n % 12, 'wholehour-pointers', 'understanding'), 12);
  math(1, 'money10', measure, '元角十进换算', '依据1元等于10角进行单步换算', [m('tensones')], n => n % 2 ? numberItem(`${1 + n % 8}元${n % 10}角，一共多少角？`, (1 + n % 8) * 10 + n % 10, 'money-compose', 'transfer') : numberItem(`${(1 + n % 8) * 10}角是多少元？`, 1 + n % 8, 'money-convert'));

  math(2, 'carry100', num, '两位数加法满十进一', '个位合并满十后向十位进一', [m('tensones'), f('add20')], n => {
    const a = 17 + n % 20, b = 16 + n % 7; return numberItem(n % 2 ? `上午借出${a}本书，下午借出${b}本，共借出几本？` : `${a}+${b}=?`, a + b, n % 2 ? 'carry-context' : 'carry-column', n % 2 ? 'transfer' : 'procedure');
  });
  math(2, 'borrow100', num, '两位数退位减法', '个位不够减时退一作十，再完成减法', [f('borrowexchange')], n => {
    const a = 40 + n % 5 * 10 + n % 3, b = 13 + n % 6; return numberItem(n % 2 ? `原有${a}元，花掉${b}元，还剩几元？` : `${a}-${b}=?`, a - b, n % 2 ? 'borrow-context' : 'borrow-column', n % 2 ? 'transfer' : 'procedure');
  });
  math(2, 'multiplymissing', relation, '由积求未知因数', '利用等组关系确定缺少的每组数或组数', [f('multiplytable'), f('divisiontable')], n => {
    const a = 2 + n % 8, b = 2 + Math.floor(n / 3) % 8; return numberItem(n % 2 ? `${a}袋一共装${a * b}个球，每袋装几个？` : `${a}×?=${a * b}，问号是多少？`, b, n % 2 ? 'missing-factor-story' : 'missing-factor-equation', n % 2 ? 'transfer' : 'procedure');
  });
  math(2, 'multiplerelation', relation, '一个量是另一个的几倍', '把较小数量作为一份求倍数', [f('divisiontable')], n => {
    const base = 2 + n % 7, k = 2 + n % 8; return numberItem(n % 2 ? `红花${base * k}朵，蓝花${base}朵。红花是蓝花的几倍？` : `${base * k}里面有几个${base}？`, k, n % 2 ? 'multiple-context' : 'multiple-groups', n % 2 ? 'transfer' : 'understanding');
  });
  math(2, 'cmmeters', measure, '米与厘米换算', '依据1米等于100厘米在整米和厘米间换算', [m('tensones')], n => n % 2 ? numberItem(`${1 + n % 9}米${10 + n}厘米，一共多少厘米？`, (1 + n % 9) * 100 + 10 + n, 'length-compose', 'transfer') : numberItem(`${(1 + n % 9) * 100}厘米是多少米？`, 1 + n % 9, 'length-meters'));
  math(2, 'minutes', measure, '时与分的换算', '依据1时等于60分完成整时换算', [m('wholehour'), f('multiplytable')], n => numberItem(n % 2 ? `一节活动持续${1 + n % 5}小时，共多少分钟？` : `${1 + n % 5}时等于多少分？`, (1 + n % 5) * 60, n % 2 ? 'time-duration-context' : 'time-unit'), 10);
  math(2, 'clockminutes', measure, '钟面分针格与分钟', '根据分针所在数字换算分钟', [f('multiplytable')], n => numberItem(`分针从12走到数字${1 + n % 11}，经过多少分钟？`, (1 + n % 11) * 5, 'minute-hand-groups', 'understanding'), 11);
  math(2, 'counttable', stats, '分类计数表读数', '从含类别和数量的文本表格中取出指定类别数量', [m('count')], n => {
    const a = 3 + n, b = 8 + n, c = 5 + n; return numberItem(`喜欢的水果调查：苹果${a}人；香蕉${b}人；梨${c}人。喜欢${n % 2 ? '梨' : '香蕉'}的有几人？`, n % 2 ? c : b, n % 2 ? 'table-third-column' : 'table-second-column', 'understanding');
  });
  math(2, 'periodic', relation, '重复排列的周期', '依据完整重复节确定指定位置的对象', [f('divisiontable')], n => { const pos = 4 + n, a = ['红', '黄', '蓝'][(pos - 1) % 3]; return choiceItem(`按红、黄、蓝循环排列，第${pos}个是什么颜色？`, a, ['红', '黄', '蓝'], 'periodic-three', 'understanding'); });
  math(2, 'directions4', shape, '东南西北的相对方位', '根据面向的方向确定相反方向', [], n => { const dirs = ['东', '南', '西', '北'], d = n % 4; return choiceItem(`面向${dirs[d]}，背后是什么方向？`, dirs[(d + 2) % 4], dirs, 'opposite-compass'); }, 4);

  math(3, 'compare10000', num, '万以内整数位值比较', '先比较最高不同数位以确定较大整数', [f('placevalue')], n => {
    const a = 1200 + n * 37, b = a + 100; return numberItem(n % 2 ? `甲仓库存${a}件、乙仓库存${b}件，较多仓库有几件？` : `${b}和${a}哪个更大？`, b, n % 2 ? 'large-compare-context' : 'large-compare-symbol', n % 2 ? 'transfer' : 'understanding');
  });
  math(3, 'add1000', num, '三位数连续进位加法', '逐位合并并传递进位', [m('carry100')], n => { const a = 175 + n * 7, b = 268 + n * 3; return numberItem(`${a}+${b}=?`, a + b, 'three-digit-add'); });
  math(3, 'subtract1000', num, '三位数连续退位减法', '相邻数位借位后求差', [m('borrow100')], n => { const a = 601 + n * 10, b = 285 + n; return numberItem(n % 2 ? `图书馆有${a}本书，借出${b}本，剩下几本？` : `${a}-${b}=?`, a - b, n % 2 ? 'three-digit-subtract-context' : 'three-digit-subtract', n % 2 ? 'transfer' : 'procedure'); });
  math(3, 'remainderdivision', num, '有余数除法求余数', '按每组数量分组，求不足一组的剩余量', [f('divisiontable')], n => { const d = 3 + n % 6, q = 3 + n % 7, r = 1 + n % (d - 1); return numberItem(n % 2 ? `${d * q + r}个果子，每袋${d}个，装满后剩几个？` : `${d * q + r}÷${d}，余数是多少？`, r, n % 2 ? 'remainder-sharing' : 'remainder-expression', n % 2 ? 'transfer' : 'procedure'); });
  math(3, 'mixedorder', num, '乘除先于加减', '识别并先计算不带括号式子中的乘除部分', [f('multiplytable'), m('mixed20')], n => { const a = 3 + n, b = 2 + n % 7, c = 3 + n % 5; return numberItem(n % 2 ? `${b}×${c}+${a}=?` : `${a}+${b}×${c}=?`, a + b * c, n % 2 ? 'product-before-add-end' : 'product-before-add-start'); });
  math(3, 'squareperimeter', shape, '正方形周长', '将四条相等的边合计', [f('multiplytable')], n => { const a = 2 + n; return numberItem(n % 2 ? `边长${a}米的正方形菜地围一圈，篱笆长几米？` : `正方形边长${a}厘米，周长几厘米？`, a * 4, n % 2 ? 'square-boundary-context' : 'square-perimeter', n % 2 ? 'transfer' : 'procedure'); });
  math(3, 'rectanglecover', shape, '长方形面积', '以单位正方形覆盖行数和列数求面积', [f('multiplytable')], n => { const a = 4 + n, b = 2 + n % 8; return numberItem(n % 2 ? `地面每行铺${a}块1平方米地砖，共${b}行，面积几平方米？` : `长方形长${a}厘米、宽${b}厘米，面积几平方厘米？`, a * b, n % 2 ? 'area-array' : 'rectangle-cover', n % 2 ? 'transfer' : 'procedure'); });
  math(3, 'elapsedtime', measure, '同日经过时间', '将开始结束时刻转换成分钟再求差', [m('minutes')], n => { const h = 8 + n % 8, start = 10 + n % 20, duration = 25 + n; const end = start + duration; return numberItem(`活动${h}:${String(start).padStart(2, '0')}开始，${h + Math.floor(end / 60)}:${String(end % 60).padStart(2, '0')}结束，经过多少分钟？`, duration, 'elapsed-same-day', 'transfer'); });
  math(3, 'mass', measure, '千克与克换算', '依据1千克等于1000克转换数量', [m('tensones')], n => numberItem(n % 2 ? `${1 + n % 6}千克${100 + n}克，一共多少克？` : `${1 + n % 6}千克等于多少克？`, (1 + n % 6) * 1000 + (n % 2 ? 100 + n : 0), n % 2 ? 'mass-compound' : 'mass-simple'));
  math(3, 'fractionunit', num, '单位分数与平均分', '由平均分的总份数写出一份占整体的分数', [f('divisiontable')], n => { const d = 2 + n % 11; return numberItem(n % 2 ? `一个圆平均分成${d}份，其中一份占整个圆的几分之几？（填分数）` : `把1平均分成${d}份，每份是几？（填分数）`, `1/${d}`, n % 2 ? 'fraction-shape-part' : 'fraction-unit-number', 'understanding'); });
  math(3, 'fractioncompare', num, '同分母分数比较', '等分单位相同的情况下比较所取份数', [m('fractionunit')], n => { const d = 5 + n % 8, a = 1 + n % (d - 2), b = a + 1; return numberItem(`在${a}/${d}和${b}/${d}中，较大的分数是多少？（填分数）`, `${b}/${d}`, 'same-denominator-compare', 'understanding'); });
  math(3, 'decimalvalue', num, '一位两位小数的位值', '把十分之一与百分之一的份数对应到小数位置', [m('tensones'), m('fractionunit')], n => { const a = 1 + n % 8, b = 1 + n % 9; return n % 2 ? numberItem(`小数0.${a}${b}的百分位数字是多少？`, b, 'decimal-hundredth-read', 'understanding') : numberItem(`${a}个十分之一和${b}个百分之一合起来是多少？`, (a * 10 + b) / 100, 'decimal-compose-parts', 'understanding'); });
  math(3, 'areaconvert', measure, '相邻面积单位换算', '区分长度进率与面积进率，按100换算', [m('rectanglecover')], n => numberItem(n % 2 ? `${2 + n}平方米等于多少平方分米？` : `${2 + n}平方分米等于多少平方厘米？`, (2 + n) * 100, n % 2 ? 'sqm-sqdm' : 'sqdm-sqcm'));

  math(4, 'bigplace', num, '大数的数级与位值', '由万级和个级的数量合成整数', [m('compare10000')], n => { const a = 3 + n, b = 100 + n * 11; return numberItem(n % 2 ? `${a}个万与${b}个一合起来是多少？` : `一个数万级是${a}、个级是${b}，这个数是多少？`, a * 10000 + b, n % 2 ? 'ten-thousand-compose' : 'number-class-compose', 'understanding'); });
  math(4, 'round1000', num, '四舍五入到千位', '观察百位数字确定保留千位的近似整数', [m('bigplace')], n => { const a = 3120 + n * 173; return numberItem(`把${a}四舍五入到千位，近似整数是多少？`, Math.round(a / 1000) * 1000, 'round-thousand'); });
  math(4, 'multiply3by2', num, '三位数乘两位数', '按十位和个位分解乘数并合并部分积', [f('multiplytwo')], n => { const a = 105 + n * 4, b = 12 + n % 13; return numberItem(n % 2 ? `每箱${a}件，${b}箱共有多少件？` : `${a}×${b}=?`, a * b, n % 2 ? 'multiply-large-context' : 'multiply-large-column', n % 2 ? 'transfer' : 'procedure'); });
  math(4, 'divide2digit', num, '除数是两位数的整除', '试商并用乘法检验商', [f('divisiondigits'), f('multiplytwo')], n => { const q = 12 + n, d = 11 + n % 18; return numberItem(n % 2 ? `${q * d}本书，每箱${d}本，要装几箱？` : `${q * d}÷${d}=?`, q, n % 2 ? 'divide-two-context' : 'divide-two-symbol', n % 2 ? 'transfer' : 'procedure'); });
  math(4, 'brackets', num, '带括号的四则顺序', '先求括号中的结果，再进行乘除', [m('mixedorder')], n => { const a = 4 + n, b = 3 + n % 7, c = 2 + n % 6; return numberItem(n % 2 ? `${c}×(${a}+${b})=?` : `(${a}+${b})×${c}=?`, (a + b) * c, n % 2 ? 'bracket-right' : 'bracket-left'); });
  math(4, 'distribute', num, '乘法分配律的对应因数', '在乘法分配的两种表示中对应相同因数', [m('brackets')], n => { const a = 5 + n, b = 2 + n % 6, c = 3 + n % 5; return numberItem(`(${a}+${b})×${c}=${a}×${c}+?×${c}，问号是多少？`, b, 'distribute-factor', 'understanding'); });
  math(4, 'decimalcompare', num, '小数位值比较', '按整数部分、十分位、百分位依次比较小数', [m('decimalvalue')], n => { const a = 210 + n * 7, b = a + 3; return numberItem(`比较${(a / 100).toFixed(2)}与${(b / 100).toFixed(2)}，较大的数是多少？`, b / 100, 'decimal-place-compare', 'understanding'); });
  math(4, 'decimalsubtract', num, '小数减法数位对齐', '将相同小数数位对齐再相减', [m('borrow100'), m('decimalvalue')], n => { const a = 630 + n * 17, b = 175 + n * 3; return numberItem(n % 2 ? `有${(a / 100).toFixed(2)}元，花掉${(b / 100).toFixed(2)}元，剩几元？` : `${(a / 100).toFixed(2)}-${(b / 100).toFixed(2)}=?`, (a - b) / 100, n % 2 ? 'decimal-subtract-money' : 'decimal-subtract-symbol', n % 2 ? 'transfer' : 'procedure'); });
  math(4, 'anglekind', shape, '锐角直角钝角分类', '按与90度和180度的关系判断角的类型', [], n => { const angles = [35, 90, 120, 75, 160, 15], a = angles[n % 6]; return choiceItem(`${a}°的角属于哪类？`, a < 90 ? '锐角' : a === 90 ? '直角' : '钝角', ['锐角', '直角', '钝角'], 'angle-threshold'); }, 6);
  math(4, 'triangleangles', shape, '三角形内角和', '用180度减去已知两个内角求第三角', [m('anglekind')], n => { const a = 30 + n, b = 40 + n % 20; return numberItem(`三角形两个内角分别为${a}°和${b}°，第三个内角多少度？`, 180 - a - b, 'triangle-third-angle'); });
  math(4, 'average', stats, '平均数的总量等分', '先合计总量再按数据个数平均', [f('divisiondigits')], n => { const a = 10 + n, b = a + 2, c = a + 7; return numberItem(`三天分别读${a}、${b}、${c}页，平均每天读几页？`, a + 3, 'average-three-days', 'transfer'); });
  math(4, 'chartdifference', stats, '两组统计数量的差', '从分类计数中选择正确两类再求差', [m('counttable'), m('borrow100')], n => { const a = 45 + n, b = 18 + n % 8; return numberItem(`调查：步行${a}人；骑车${b}人；乘车${12 + n}人。步行比骑车多几人？`, a - b, 'chart-difference', 'transfer'); });

  math(5, 'decimalmultiply', num, '小数乘法小数位', '先按整数相乘，再按因数小数位确定结果', [f('decimalplace'), f('multiplytwo')], n => { const a = 12 + n, b = 3 + n % 7; return numberItem(n % 2 ? `每千克${(a / 10).toFixed(1)}元，买${(b / 10).toFixed(1)}千克，应付几元？` : `${(a / 10).toFixed(1)}×${(b / 10).toFixed(1)}=?`, a * b / 100, n % 2 ? 'decimal-product-money' : 'decimal-product-symbol', n % 2 ? 'transfer' : 'procedure'); });
  math(5, 'decimaldivide', num, '除数为小数的等值变换', '同时扩大被除数和除数，使除数化为整数', [f('decimalplace'), m('divide2digit')], n => { const q = 12 + n, d = 2 + n % 7; return numberItem(n % 2 ? `有${(q * d / 10).toFixed(1)}米绳子，每段${(d / 10).toFixed(1)}米，可分成几段？` : `${(q * d / 10).toFixed(1)}÷${(d / 10).toFixed(1)}=?`, q, n % 2 ? 'decimal-division-length' : 'decimal-division-symbol', n % 2 ? 'transfer' : 'procedure'); });
  math(5, 'factor', num, '因数的整除条件', '用能否整除判断一个整数是否是另一整数的因数', [f('divisiontable')], n => { const a = 3 + n % 8, b = 3 + n % 7, exact = n % 2 === 0, value = a * b + (exact ? 0 : 1); return choiceItem(`${a}是${value}的因数吗？`, exact ? '是' : '不是', ['是', '不是'], 'factor-divisibility'); });
  math(5, 'multiple', num, '求一个数的指定倍数', '把给定整数乘自然数以求倍数', [f('multiplytable')], n => { const a = 3 + n % 9, k = 2 + n % 7; return numberItem(`${a}的${k}倍是多少？`, a * k, 'multiple-generation'); });
  const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29], composites = [4, 6, 8, 9, 10, 12, 14, 15, 16, 18];
  math(5, 'prime', num, '质数与合数的因数特征', '依据正因数个数区别质数和合数，排除1', [m('factor')], n => { const value = n % 2 ? primes[Math.floor(n / 2) % 10] : composites[Math.floor(n / 2) % 10]; return choiceItem(`${value}属于哪类正整数？`, n % 2 ? '质数' : '合数', ['质数', '合数', '既不是质数也不是合数'], 'prime-factor-count'); }, 20);
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  math(5, 'gcd', num, '最大公因数', '找出两个整数共有因数中最大的一个', [m('factor')], n => { const a = 8 + n, b = 12 + n * 2; return numberItem(n % 2 ? `${a}支笔和${b}本本子平均分给尽可能多的人且无剩余，最多几人？` : `${a}与${b}的最大公因数是多少？`, gcd(a, b), n % 2 ? 'gcd-sharing' : 'gcd-numbers', n % 2 ? 'transfer' : 'procedure'); });
  math(5, 'lcm', num, '最小公倍数', '找出两个整数共同的最小正倍数', [m('multiple')], n => { const a = 3 + n % 9, b = 4 + n % 8; return numberItem(n % 2 ? `甲每${a}天值日，乙每${b}天值日。今天一起值日，至少几天后再次一起？` : `${a}与${b}的最小公倍数是多少？`, a * b / gcd(a, b), n % 2 ? 'lcm-cycle' : 'lcm-numbers', n % 2 ? 'transfer' : 'procedure'); });
  math(5, 'fractionadd', num, '异分母分数加法', '通分到共同单位后相加', [f('fractionequivalence'), m('lcm')], n => { const a = 2 + n % 7, b = 3 + n % 8; return numberItem(n % 2 ? `上午用去全程的1/${a}，下午走了全程的1/${b}，合计占全程多少？（填分数）` : `1/${a}+1/${b}=?（填分数）`, `${a + b}/${a * b}`, n % 2 ? 'fraction-add-context' : 'fraction-add-symbol', n % 2 ? 'transfer' : 'procedure'); });
  math(5, 'fractionsubtract', num, '异分母分数减法', '通分后求所占部分的差', [f('fractionequivalence'), m('lcm')], n => { const d = 3 + n % 7; return numberItem(`1/2-1/${d}=?（填分数）`, `${d - 2}/${d * 2}`, 'fraction-subtract-symbol'); });
  math(5, 'equation', relation, '等式两边同加同减', '运用等式性质求形如x+a=b的未知数', [m('unknownadd')], n => { const x = 4 + n, a = 5 + n % 9; return numberItem(n % 2 ? `一本书原有若干页未读，又读${a}页后还剩${x}页。原来有几页未读？` : `x+${a}=${x + a}，x是多少？`, n % 2 ? x + a : x, n % 2 ? 'equation-inverse-story' : 'equation-addition', n % 2 ? 'transfer' : 'procedure'); });
  math(5, 'trianglearea', shape, '三角形面积的底高关系', '用对应底乘高再除以2求面积', [m('rectanglecover')], n => { const b = 4 + n * 2, h = 3 + n % 8; return numberItem(n % 2 ? `三角形地块底${b}米，对应高${h}米，面积几平方米？` : `三角形底${b}厘米、对应高${h}厘米，面积几平方厘米？`, b * h / 2, n % 2 ? 'triangle-area-land' : 'triangle-area-symbol', n % 2 ? 'transfer' : 'procedure'); });
  math(5, 'parallelogramarea', shape, '平行四边形面积', '将对应底和高相乘，排除斜边长度', [m('rectanglecover')], n => { const b = 6 + n, h = 3 + n % 7; return numberItem(`平行四边形底${b}厘米，对应高${h}厘米，斜边${h + 2}厘米，面积几平方厘米？`, b * h, 'parallelogram-height-not-side'); });
  math(5, 'trapezoidarea', shape, '梯形面积', '将上下底之和乘高再除以2', [m('trianglearea')], n => { const a = 4 + n, b = a + 4, h = 3 + n % 8; return numberItem(`梯形上底${a}米、下底${b}米，高${h}米，面积几平方米？`, (a + b) * h / 2, 'trapezoid-area'); });
  math(5, 'cuboidvolume', shape, '长方体体积', '以长宽高确定单位立方体个数', [m('rectanglecover'), f('multiplydigits')], n => { const a = 4 + n, b = 3 + n % 6, h = 2 + n % 5; return numberItem(n % 2 ? `一个长方体盒子内部长${a}分米、宽${b}分米、高${h}分米，内部体积多少立方分米？` : `长方体长${a}厘米、宽${b}厘米、高${h}厘米，体积多少立方厘米？`, a * b * h, n % 2 ? 'cuboid-capacity-context' : 'cuboid-volume', n % 2 ? 'transfer' : 'procedure'); });
  math(5, 'cuboidsurface', shape, '长方体表面积', '将三组相对面的面积求和', [m('rectanglecover')], n => { const a = 4 + n, b = 3 + n % 6, h = 2 + n % 5; return numberItem(`有盖长方体盒子长${a}厘米、宽${b}厘米、高${h}厘米，六个面的总面积几平方厘米？`, 2 * (a * b + a * h + b * h), 'cuboid-six-faces'); });
  math(5, 'volumeconvert', measure, '立方分米与立方厘米', '依据每边10倍导致体积1000倍完成换算', [m('cuboidvolume')], n => numberItem(`${2 + n}立方分米等于多少立方厘米？`, (2 + n) * 1000, 'volume-unit-cube'));

  math(6, 'fractiondivide', num, '分数除法转乘倒数', '除以非零分数时乘它的倒数', [f('fractionmultiply')], n => { const a = 1 + n % 5, b = a + 3, c = 1 + n % 4, d = c + 2; return numberItem(n % 2 ? `长${a}/${b}米的绳子是${c}/${d}米的多少倍？（填分数或小数）` : `${a}/${b}÷${c}/${d}=?（填分数）`, `${a * d}/${b * c}`, n % 2 ? 'fraction-division-measure' : 'fraction-division-symbol', n % 2 ? 'transfer' : 'procedure'); });
  math(6, 'percentagerate', relation, '由部分与整体求百分率', '将部分除以整体，再转换成百分数数值', [f('percentage')], n => { const total = 20 + n % 9 * 20, percent = 10 + n % 8 * 10; return numberItem(`共${total}人，其中${total * percent / 100}人参加，参加率是多少？（只填百分号前的数）`, percent, 'percentage-rate-context', 'transfer'); });
  math(6, 'percentagewhole', relation, '由部分和百分率求整体', '把已知部分除以对应的百分率', [f('percentage'), m('decimaldivide')], n => { const total = 100 + n * 20, p = 10 + n % 8 * 10; return numberItem(`图书中故事书有${total * p / 100}本，占总数${p}%，图书共几本？`, total, 'percentage-whole-context', 'transfer'); });
  math(6, 'ratioequivalent', relation, '比的等值化简', '将比的前后项同时除以共同因数', [f('ratio'), m('gcd')], n => { const a = 2 + n % 7, k = 2 + n % 6; return numberItem(`补全等值比：${a * k}:${k}=? : 1。问号是多少？`, a, 'ratio-equivalence', 'understanding'); });
  math(6, 'proportion', relation, '比例内外项关系', '用两内项之积等于两外项之积求未知项', [f('ratio'), m('equation')], n => { const a = 2 + n % 6, b = 3 + n % 8, k = 2 + n % 7; return numberItem(`${a}:${b}=x:${b * k}，x是多少？`, a * k, 'proportion-unknown'); });
  math(6, 'diameter', shape, '圆直径与半径', '理解直径通过圆心且等于两条半径', [f('multiplytable')], n => { const r = 2 + n; return numberItem(n % 2 ? `圆形花坛半径${r}米，直径几米？` : `圆的直径${r * 2}厘米，半径几厘米？`, n % 2 ? r * 2 : r, n % 2 ? 'radius-to-diameter' : 'diameter-to-radius', 'understanding'); });
  math(6, 'circumference', shape, '圆的周长', '依据半径或直径求圆的边界长度', [m('diameter'), m('decimalmultiply')], n => { const r = 2 + n; return numberItem(n % 2 ? `圆形花坛直径${r * 2}米，绕一周几米？（π取3.14）` : `圆半径${r}厘米，周长几厘米？（π取3.14）`, 628 * r / 100, n % 2 ? 'circle-boundary-context' : 'circle-circumference', n % 2 ? 'transfer' : 'procedure'); });
  math(6, 'circlearea', shape, '圆的面积', '将半径平方乘圆周率，区分直径与半径', [m('diameter'), m('decimalmultiply')], n => { const r = 2 + n; return numberItem(n % 2 ? `圆形草地直径${r * 2}米，面积几平方米？（π取3.14）` : `圆半径${r}厘米，面积几平方厘米？（π取3.14）`, 314 * r * r / 100, n % 2 ? 'circle-area-diameter-context' : 'circle-area-radius', n % 2 ? 'transfer' : 'procedure'); });
  math(6, 'cylindervolume', shape, '圆柱体积', '以底面积乘高求圆柱体积', [m('circlearea'), m('cuboidvolume')], n => { const base = 12 + n * 2, h = 3 + n % 8; return numberItem(`圆柱底面积${base}平方厘米、高${h}厘米，体积几立方厘米？`, base * h, 'cylinder-base-height'); });
  math(6, 'cylinderlateral', shape, '圆柱侧面积展开', '将底面周长乘高确定展开侧面的面积', [m('circumference'), m('rectanglecover')], n => { const c = 12 + n, h = 3 + n % 7; return numberItem(`圆柱底面周长${c}厘米、高${h}厘米，侧面积几平方厘米？`, c * h, 'cylinder-unrolled-rectangle'); });
  math(6, 'conevolume', shape, '圆锥与等底等高圆柱体积', '将等底等高圆柱体积除以3求圆锥体积', [m('cylindervolume')], n => { const base = 6 + n * 3, h = 3 + n % 7; return numberItem(`圆锥底面积${base}平方厘米、高${h}厘米，体积几立方厘米？`, base * h / 3, 'cone-one-third'); });
  math(6, 'scale', relation, '比例尺与实际距离', '统一长度单位后按比例尺换算实际距离', [m('proportion')], n => { const cm = 2 + n % 8, scale = (1 + n % 5) * 10000; return numberItem(`地图比例尺1:${scale}，图上${cm}厘米代表实际多少米？`, cm * scale / 100, 'map-scale-distance', 'transfer'); });
  math(6, 'speed', relation, '路程速度时间关系', '由均匀速度与时间求路程', [m('decimalmultiply')], n => { const v = 35 + n, t = 2 + n % 5; return numberItem(n % 2 ? `汽车以每小时${v}千米匀速行驶${t}小时，行驶几千米？` : `速度${v}米/分，运动${t}分，路程几米？`, v * t, n % 2 ? 'speed-km-context' : 'speed-m-context', 'transfer'); });
  math(6, 'negativeorder', num, '负整数的顺序', '在数轴语义下比较两个负数', [m('compare20')], n => { const a = 2 + n, b = a + 3; return numberItem(n % 2 ? `气温-${a}℃与-${b}℃，较高的气温是多少℃？` : `-${a}和-${b}中，较大的数是多少？`, -a, n % 2 ? 'negative-temperature' : 'negative-order', n % 2 ? 'transfer' : 'understanding'); });
  math(6, 'sectorcount', stats, '扇形百分比与频数', '把扇形统计图中的比例换算为调查人数', [f('percentage')], n => { const total = 100 + n * 20, p = 10 + n % 8 * 10; return numberItem(`一份扇形统计图表示${total}人喜好，阅读占${p}%，喜欢阅读的有几人？`, total * p / 100, 'sector-proportion-count', 'transfer'); });
  math(6, 'possibility', stats, '等可能结果的数量比较', '在每个球被抽到机会相同的条件下比较事件可能性', [m('compare20')], n => { const a = 2 + n, b = a + 3; return choiceItem(`袋里有${a}个红球、${b}个蓝球，每个球大小质地相同，随机摸一个，哪种颜色可能性更大？`, '蓝色', ['红色', '蓝色', '一样大'], 'equal-likelihood-counts', 'understanding'); });

  addChineseCurriculum(add);
  addEnglishCurriculum(add);
  addSpokenCurriculum(add);
  return definitions;
}

import type { MeasurementDimension, QuestionBlock } from '@study-agent/contracts';
import fixtures from '../../../../../resources/curriculum/fourth-grade-geometry-statistics-v1.json';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'dimension' | 'family'>;
const table = (headers: string[], rows: string[][]): QuestionBlock => ({ id: 'record', type: 'table', headers, rows });
const figure = (name: string, alt: string): QuestionBlock => ({ id: 'figure', type: 'image', url: `/question-assets/fourth-grade-geometry-statistics-v1/${name}.svg`, alt });
const blanks = (stem: string, values: Array<[string, string, number | string]>, analysis: string, blocks?: QuestionBlock[]): Task => ({ stem,
  mode: 'multi_blank', answer: values.map(([key, , value]) => ({ key, value: String(value) })),
  responseShape: { entries: values.map(([key, label]) => ({ key, label })) }, analysis, ...(blocks ? { blocks } : {}) });
const choose = (index: number, stem: string, answer: string, alternatives: string[], analysis: string, blocks?: QuestionBlock[]): Task => {
  const options = [answer, ...alternatives], offset = index % options.length;
  return { stem, mode: 'single_choice', answer, options: [...options.slice(offset), ...options.slice(0, offset)], analysis, ...(blocks ? { blocks } : {}) };
};
const angleKind = (degrees: number) => degrees > 0 && degrees < 90 ? '锐角' : degrees === 90 ? '直角' : degrees > 90 && degrees < 180 ? '钝角' : '不属于锐角、直角或钝角';

/** Observe geometric invariants and conserved statistical totals through different task structures. */
export function buildFourthGradeGeometryStatisticsProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const add = (atomId: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string,
    distinction: string, expectedSeconds: number, make: (index: number) => Task) => result.push({ atomId, family, dimension, behavior, structure, distinction,
    exercises: Array.from({ length: 12 }, (_, index) => ({ ...make(index), family, dimension, identityVersion: 2, expectedSeconds })) });

  add('foundation:math:rectanglearea', 'rectangle-area-boundary-unit-audit', 'understanding', '区别内部覆盖与边界长度并保留单位',
    '长宽和覆盖任务 → 核对数量及平方单位的主张', '相同长宽同时有正确与错误的记录；周长、面积数值或单位都不能互相替代。', 70, n => {
      const index = Math.floor(n / 2), length = 8 + index, width = 3 + index % 3;
      const claim = n % 2 ? index % 2 ? `${length * width}厘米` : `${2 * (length + width)}平方厘米` : `${length * width}平方厘米`;
      return { stem: `长方形长${length}厘米、宽${width}厘米。要记录内部全部覆盖的面积，有人写成“${claim}”。数量和单位都正确吗？`,
        mode: 'boolean', answer: n % 2 === 0,
        analysis: `内部覆盖按${length}×${width}=${length * width}个1平方厘米计，单位为平方厘米。${2 * (length + width)}厘米量的是完整边界；只写厘米也不能表示面积。` };
    });
  add('foundation:math:rectanglearea', 'area-direct', 'procedure', '按等行单位覆盖记录两个方向与面积',
    '长宽 → 一行单位方格数、行数 → 全部覆盖', '沿用原长方形面积直接计算族；多个过程空仍是一份响应。', 90, n => {
      const length = 9 + n, width = 2 + n % 6;
      return blanks(`长方形长${length}厘米、宽${width}厘米，用边长1厘米的小正方形无空隙、无重叠铺满。沿长边排成一行，再排满各行。`,
        [['columns', '一行排几个小正方形', length], ['rows', '共排几行', width], ['area', '全部面积几平方厘米', length * width]],
        `每行${length}个，沿宽排${width}行，共${length * width}个1平方厘米方格。两个方向是长度，全部覆盖使用平方单位。`);
    });
  add('foundation:math:rectanglearea', 'rectangle-area-recover-edge', 'transfer', '从完整覆盖反推缺少的方向',
    '已知面积和一边 → 每行份数 → 恢复另一边', '把覆盖总量反向分成等行，不能把面积直接当长度或再次相乘。', 90, n => {
      const length = 12 + n, width = 2 + n % 7, area = length * width;
      return blanks(`完整长方形的面积是${area}平方厘米，长为${length}厘米，宽的记录被遮住。用边长1厘米的方格重新核对。`,
        [['rows', '沿长边每行铺满后，需要几行', width], ['width', '宽是几厘米', width]],
        `每行沿${length}厘米长边铺${length}格，总覆盖${area}格需要${area}÷${length}=${width}行；每行在宽方向占1厘米，所以宽${width}厘米。`);
    });
  add('foundation:math:rectanglearea', 'rectangle-equal-perimeter-area-comparison', 'transfer', '同边界约束下分别核对覆盖量',
    '两个同周长的完整长方形 → 分别记录面积 → 比较实际覆盖', '固定的是边界总长，不保证内部覆盖相同；两块均为完整长方形。', 100, n => {
      const length = 10 + n, width = 2 + n % 3, a = length * width, b = (length - 1) * (width + 1);
      return blanks('两张完整长方形卡纸的边长如下。先核对两张的周长相同，再比较各自内部覆盖的面积。',
        [['perimeter', '两张各自完整一圈几厘米', (length + width) * 2], ['aArea', '甲面积几平方厘米', a], ['bArea', '乙面积几平方厘米', b], ['difference', '乙比甲面积多几平方厘米', b - a]],
        `甲乙的长与宽之和都是${length + width}厘米，所以周长同为${(length + width) * 2}厘米；面积分别为${a}和${b}平方厘米，乙多${b - a}平方厘米。同周长不能推出同面积。`,
        [table(['卡纸', '长（厘米）', '宽（厘米）'], [['甲', String(length), String(width)], ['乙', String(length - 1), String(width + 1)]])]);
    });

  add('core:math:anglekind', 'angle-opening-invariance-audit', 'understanding', '核对角的开口与旋转和边长的关系',
    '相同开口的两次展示 → 核对是否改变角的类别', '同一旋转与伸长操作配有正反主张，观察开口保持而非图形朝向。', 65, n => {
      const degrees = [35, 90, 120, 55, 90, 150][Math.floor(n / 2)], turn = 20 + Math.floor(n / 2) * 13;
      const claim = n % 2 ? '边画长了，角就一定变大并改了类别' : '开口没有改变，角的类别也不变';
      return { stem: `一个${degrees}°的角，整体旋转${turn}°，并把两条边画得更长；两条边之间的开口保持原样。有人说：“${claim}。”这个判断正确吗？`, mode: 'boolean', answer: n % 2 === 0,
        analysis: `角的类别由开口与90°、180°的关系决定。整体转向和延长两边都没有改变${degrees}°开口，本次仍为${angleKind(degrees)}。` };
    });
  add('core:math:anglekind', 'angle-threshold', 'procedure', '按严格数值边界分类并排除零角和平角',
    '已知角度 → 与0、90、180的关系 → 类别', '沿用旧按度数分类族；包括89/90/91及0/180边界。', 60, n => {
      const degrees = [0, 1, 45, 89, 90, 91, 120, 179, 180, 30, 60, 150][n], answer = angleKind(degrees);
      const labels = ['锐角', '直角', '钝角', '不属于锐角、直角或钝角'];
      return choose(n, `已知角的开口为${degrees}°，按严格范围应归入哪一类？`, answer, labels.filter(label => label !== answer),
        `锐角严格大于0°且小于90°，直角等于90°，钝角严格大于90°且小于180°。0°为零角，180°为平角；本次${degrees}°应选“${answer}”。`);
    });
  add('core:math:anglekind', 'angle-rotated-visual-reference', 'transfer', '用直角基准比较真实旋转角的开口',
    '不等边且旋转的真实角图与直角参照 → 开口比较 → 类别', '图中边长和方向变化，但分类只依据开口；与直接提供度数的算式表示不同。', 85, n => {
      const { degrees, rotation, lengths } = fixtures.angles[n], answer = angleKind(degrees), labels = ['锐角', '直角', '钝角'];
      return choose(n, '左边蓝色角按真实比例绘制，右边为带直角标记的参照。只比较开口，蓝色角属于哪类？不要把两边长短或整体方向当作依据。', answer, labels.filter(label => label !== answer),
        `蓝色角实际开口为${degrees}°，${degrees < 90 ? '比直角小' : degrees > 90 ? '比直角大但小于平角' : '与直角相同'}，所以是${answer}。转向和两边长度不改变开口。`,
        [figure(`rotated-angle-${n}`, `蓝色角顶点O，开口${degrees}度，整体方向旋转${rotation}度，两条绘图线段长度分别为${lengths[0]}和${lengths[1]}；右边参照角为90度。`)]);
    });
  add('core:math:anglekind', 'angle-straight-split-recovery', 'transfer', '由平角的相邻部分恢复缺少开口再分类',
    '平角两部分与已知一部分 → 剩余角度 → 类别', '先恢复隐藏开口再分类，不把已知的另一个角直接归类。', 90, n => {
      const known = [30, 45, 60, 89, 90, 91, 100, 120, 135, 150, 1, 179][n], missing = 180 - known;
      return blanks(`一条射线把一个180°平角分成相邻的甲、乙两部分，两部分无重叠也无空隙。甲为${known}°，乙的开口被遮住。恢复乙并分类。`,
        [['degrees', '乙的开口几度', missing], ['kind', '乙的类别（填锐角、直角或钝角）', angleKind(missing)]],
        `甲乙相邻合成180°，所以乙为180°−${known}°=${missing}°。乙与90°比较后属于${angleKind(missing)}，不能把甲的类别直接当乙的类别。`);
    });

  add('core:math:triangleangles', 'triangle-positive-angle-sum-audit', 'understanding', '同时核对内角为正与180度守恒',
    '三个候选内角 → 核对角度和及每个角的合法范围', '含总和180但有零角的退化反例，不能仅凭加法总和接受三角形。', 75, n => {
      const index = Math.floor(n / 2), a = 25 + index * 5, b = 55 + index;
      const angles = n % 2 ? index % 2 ? [0, b, 180 - b] : [a, b, 180 - a - b + 10] : [a, b, 180 - a - b];
      return { stem: `有三个内角记录为${angles[0]}°、${angles[1]}°、${angles[2]}°。这组记录能组成一个真正的三角形吗？`, mode: 'boolean', answer: n % 2 === 0,
        analysis: `三角形每个内角都要大于0°，三角和为180°。本次总和${angles.reduce((a, b) => a + b, 0)}°，${angles.some(angle => angle <= 0) ? '其中有零角，不能形成真正的三角形。' : n % 2 ? '总和不等于180°，记录不成立。' : '且各角都为正，记录成立。'}` };
    });
  add('core:math:triangleangles', 'triangle-third-angle', 'procedure', '保留已知角和并恢复剩余内角',
    '两个正内角 → 已知部分合计 → 第三个角', '沿用原直接求第三角族，多空不增加结构或独立观察次数。', 85, n => {
      const a = 25 + n * 3, b = 35 + n % 5 * 5, remaining = 180 - a - b;
      return blanks(`一个三角形两个内角为${a}°和${b}°。先记录已知两角的合计，再恢复第三角。`,
        [['knownSum', '已知两角合计几度', a + b], ['third', '第三个内角几度', remaining]],
        `已知部分为${a}°+${b}°=${a + b}°，三角总和180°，剩余内角为${remaining}°，三个角均为正。`);
    });
  add('core:math:triangleangles', 'triangle-explicit-equal-angle-recovery', 'transfer', '利用明确等角条件恢复缺失内角',
    '实际等腰角图与一个已知角 → 等角约束和总和 → 缺少的角', '等角关系明确给出，不能凭看起来对称就假定相等；与已知两个角直接相减不同。', 100, n => {
      const { apex, given } = fixtures.isosceles[n], base = (180 - apex) / 2, known = given === 'C' ? apex : base;
      return blanks(`图中三角形ABC明确满足∠A=∠B，已知∠${given}=${known}°。按这个等角条件恢复记录，不凭外观猜测。`,
        [['a', '∠A几度', base], ['b', '∠B几度', base], ['c', '∠C几度', apex]],
        given === 'C' ? `去掉顶角${apex}°，另外两角合计${180 - apex}°且相等，各为${base}°。三角和仍为180°。` : `∠A和∠B相等，所以均为${base}°，剩余∠C=180°−${base}°−${base}°=${apex}°。`,
        [figure(`equal-angle-triangle-${n}`, `三角形ABC按实际角度绘制，明确∠A=∠B，已知∠${given}为${known}度；其余角需根据条件恢复。`)]);
    });
  add('core:math:triangleangles', 'triangle-exterior-adjacent-recovery', 'transfer', '从相邻外角还原内角再核对三角和',
    '边延长后的相邻外角和另一个内角 → 还原相邻内角 → 第三个角', '先分清外角与内部角，不能把外角直接当成三角形内角相加。', 105, n => {
      const { a, b } = fixtures.exteriorTriangles[n], exterior = 180 - a, c = 180 - a - b;
      return blanks(`图中把BA经过A向外延长至D，D、A、B共线且A在D和B之间。已知相邻外角∠DAC=${exterior}°，内角∠ABC=${b}°。先还原∠CAB，再求∠ACB。`,
        [['a', '内角∠CAB几度', a], ['c', '内角∠ACB几度', c]],
        `∠DAC和∠CAB相邻合成平角，∠CAB=180°−${exterior}°=${a}°。三角形内部再用180°减${a}°与${b}°，得到∠ACB=${c}°；外角本身不属于内部三角和。`,
        [figure(`exterior-triangle-${n}`, `三角形ABC，BA经过A延长至D，D、A、B共线，A在中间。相邻外角DAC为${exterior}度，内部角ABC为${b}度，图形按真实内角绘制。`)]);
    });

  add('core:math:average', 'average-redistribution-conservation-audit', 'understanding', '核对移多补少后的总量与份数',
    '不等量的三份和平均分配主张 → 总量是否保持 → 平均值', '相同原数据有正确与错误的均分主张；平均值不表示原来每份的真实数量。', 75, n => {
      const index = Math.floor(n / 2), mean = 6 + index, delta = 2 + index % 3, claim = mean + n % 2;
      return { stem: `三个盒子原来分别有${mean - delta}、${mean}、${mean + delta}颗珠子。只在这三个盒子之间移多补少，不增加也不取走。有人说最后每盒都能恰有${claim}颗。这个主张正确吗？`, mode: 'boolean', answer: n % 2 === 0,
        analysis: `原总量${mean * 3}颗、盒子数3个保持不变；均分后每盒应为${mean}颗。每盒${claim}颗会需要${claim * 3}颗，${n % 2 ? '与原总量不同。' : '恰好保持总量。'}平均数是均分表示，不能当成原来每盒都有这么多。` };
    });
  add('core:math:average', 'average-three-days', 'procedure', '把零数据也计入数据个数并平均总量',
    '三天实际阅读记录 → 数据个数与总量 → 平均每天', '沿用原三天平均直接计算族，原transfer标签不变；新过程题不能因维度不同被另算独立结构。', 95, n => {
      const a = n % 3 === 0 ? 0 : 6 + n, b = 9 + n * 2, c = (3 - (a + b) % 3) % 3 + 12 + n * 3, total = a + b + c;
      return blanks('三天阅读页数如下，0页表示这一天没有阅读，仍是一天。按全部三天核对平均每天的页数。',
        [['count', '数据共有几天', 3], ['total', '三天合计几页', total], ['mean', '平均每天几页', total / 3]],
        `三条记录包含0也都计入，共3天；总页数为${a}+${b}+${c}=${total}，平均为${total}÷3=${total / 3}页。不能漏掉没有阅读的一天。`,
        [table(['日期', '阅读页数'], [['第1天', String(a)], ['第2天', String(b)], ['第3天', String(c)]])]);
    });
  add('core:math:average', 'average-missing-datum-recovery', 'transfer', '由平均值先恢复总量再补齐原记录',
    '平均值与三份已知数据 → 四份总量 → 缺失数据', '平均值不是缺失那份的实际值，必须满足整体总量约束。', 100, n => {
      const mean = 8 + n, a = mean - 3, b = mean + 1, c = mean - 2, missing = mean + 4;
      return blanks(`四名同学捐书，平均每人${mean}本。记录中的一人被遮住，其余三人分别为${a}、${b}、${c}本。恢复四人总量和被遮住的记录。`,
        [['total', '四人合计几本', mean * 4], ['missing', '被遮住的人捐了几本', missing]],
        `平均${mean}本对应4人，总量为${mean * 4}本；去掉已知${a + b + c}本，缺少${missing}本。平均数约束的是总量，不能直接把${mean}填入缺失记录。`);
    });
  add('core:math:average', 'average-group-weighted-merge', 'transfer', '按各组人数恢复总量后合并平均',
    '各组人数和组内平均 → 两组总量与总人数 → 整体平均', '包含人数相等可直接平均的对照；人数不等时不能将两个组均值直接平分。', 110, n => {
      const aCount = 2 + n % 3, bCount = n % 3 === 0 ? aCount : aCount * 2, aMean = 5 + n, bMean = aMean + 6;
      const total = aCount * aMean + bCount * bMean, count = aCount + bCount;
      return blanks('两个互不重叠小组的阅读记录如下。所有人都计入合并统计，恢复总量后求平均，并核对直接平均两个组均值是否恰好成立。',
        [['total', '两组合计读几页', total], ['count', '合计几人', count], ['mean', '合并后平均每人几页', total / count], ['direct', '两组均值直接相加除2是否成立（填是或否）', aCount === bCount ? '是' : '否']],
        `甲组总量${aCount * aMean}页、乙组${bCount * bMean}页，合计${total}页、${count}人，整体平均${total / count}页。${aCount === bCount ? '本次两组人数相等，直接平均两个组均值也成立。' : '本次人数不等，每个组均值代表的人数不同，不能直接相加除2。'}`,
        [table(['小组', '人数', '平均每人阅读页数'], [['甲', String(aCount), String(aMean)], ['乙', String(bCount), String(bMean)]])]);
    });

  add('core:math:chartdifference', 'chart-question-category-selection', 'understanding', '根据问题选择两类并排除无关类别',
    '三类计数与指定比较问题 → 选择有根据的差量表达', '无关类别可能最大，不能把最大减最小自动当作问题所求。', 70, n => {
      const a = 32 + n * 2, b = 11 + n, c = 70 + n;
      return choose(n, '调查结果如下。要回答“步行比骑车多几人”，哪条计算记录对应这个问题？', `${a}−${b}`, [`${c}−${b}`, `${a}+${b}`],
        `问题指定步行${a}人与骑车${b}人，应求${a}−${b}=${a - b}人。乘车${c}人虽最多但与本次比较无关；相加求的是两类合计。`,
        [table(['方式', '人数'], [['步行', String(a)], ['骑车', String(b)], ['乘车', String(c)]])]);
    });
  add('core:math:chartdifference', 'chart-scaled-bar-difference', 'procedure', '从零基线与明确刻度恢复两类数量及差',
    '实际条形图 → 对应类别柱高和刻度 → 两类差量', '不是把屏幕长度直接当人数；包含一类为0、两类相等和不同比例尺。', 95, n => {
      const chart = fixtures.barCharts[n], a = chart.values[chart.labels.indexOf(chart.first)], b = chart.values[chart.labels.indexOf(chart.second)];
      return blanks(`从图中读取${chart.first}和${chart.second}的人数。纵轴从0起且刻度明确，其他类别不参与本次比较；没有人数的类别填0。`,
        [['first', `${chart.first}几人`, a], ['second', `${chart.second}几人`, b], ['difference', `${chart.first}比${chart.second}多几人`, a - b]],
        `纵轴每格${chart.step}人，从0基线恢复${chart.first}${a}人、${chart.second}${b}人，两类差为${a - b}人。不要把第三类或屏幕像素混入人数。`,
        [figure(`bar-chart-${n}`, `上学方式条形图：${chart.labels.map((label, i) => `${label}${chart.values[i]}人`).join('，')}；纵轴0起，每格${chart.step}人。`)]);
    });
  add('core:math:chartdifference', 'chart-inverse-category-difference', 'transfer', '由明确比较方向与差量恢复另一类',
    '已知一类及谁比谁多 → 反向恢复另一类', '交替给出较大或较小类别，不能见到“多”就一律做加法。', 85, n => {
      const smaller = 12 + n, difference = n % 4 ? 3 + n : 0, larger = smaller + difference;
      const largerKnown = n % 2 === 0;
      return { stem: `同一次调查，步行比骑车多${difference}人。${largerKnown ? `步行有${larger}人，骑车人数被遮住` : `骑车有${smaller}人，步行人数被遮住`}。被遮住的类别有几人？`,
        answer: largerKnown ? smaller : larger,
        analysis: `步行人数=骑车人数+${difference}。本次${largerKnown ? `已知较大的步行${larger}人，应去掉差量得骑车${smaller}人。` : `已知骑车${smaller}人，加上差量得步行${larger}人。`}差为0时两类人数相同。` };
    });
  add('core:math:chartdifference', 'chart-difference-over-time', 'transfer', '分别核对两次差量并辨别差距变化',
    '两次分类统计 → 两个差量 → 差距增大、缩小或不变', '人数合计增加不保证差距增大；含零差、差距不变与缩小。', 105, n => {
      const bBefore = 10 + n, diffBefore = n % 4 === 0 ? 0 : 4 + n % 4, aBefore = bBefore + diffBefore;
      const bAfter = bBefore + 4, diffAfter = n % 3 === 0 ? diffBefore : n % 3 === 1 ? diffBefore + 3 : Math.max(0, diffBefore - 3), aAfter = bAfter + diffAfter;
      const change = diffAfter > diffBefore ? '增大' : diffAfter < diffBefore ? '缩小' : '不变';
      return blanks('两次统计均覆盖各自全部调查对象，类别含义相同。只比较每次“步行比骑车多的人数”，再判断两次差距的变化；不把合计人数当差距。',
        [['before', '第一次步行比骑车多几人', diffBefore], ['after', '第二次步行比骑车多几人', diffAfter], ['change', '差距怎样变化（填增大、缩小或不变）', change]],
        `第一次差${aBefore}−${bBefore}=${diffBefore}人，第二次差${aAfter}−${bAfter}=${diffAfter}人，差距${change}。总人数的变化不能代替两类差量的变化。`,
        [table(['统计', '步行（人）', '骑车（人）'], [['第一次', String(aBefore), String(bBefore)], ['第二次', String(aAfter), String(bAfter)]])]);
    });
  return result;
}

import type { MeasurementDimension, QuestionBlock } from '@study-agent/contracts';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'dimension' | 'family'>;
type Point = readonly [number, number];
const asset = (name: string) => `/question-assets/spatial-probes-v1/${name}.svg`;
const image = (name: string, alt: string): QuestionBlock => ({ id: 'figure', type: 'image', url: asset(name), alt });
const choose = (stem: string, answer: string, alternatives: string[], analysis: string, blocks: QuestionBlock[]): Task =>
  ({ stem, answer, mode: 'single_choice', options: [answer, ...alternatives], analysis, blocks });
const planeNames = ['三角形', '正方形', '圆', '长方形'], solidNames = ['正方体', '圆柱', '球'], cards = ['甲', '乙', '丙'];
const planeFeatures = ['3条直边、3个角', '4条相等的直边、4个直角', '没有直边、没有角', '4个直角、相邻两条边不一样长'];
const solidFeatures = ['6个完全相同的正方形平面，没有曲面', '上下两个相同的圆形平面，中间有一个完整曲面', '只有球面，没有平面'];
const planeAlt = [
  '封闭轮廓从顶点A沿直线依次到B、C，最后回到A。',
  '封闭轮廓从A沿直线依次到B、C、D，最后回到A。各边有相同等长标记，各角有直角标记。',
  '一条光滑、闭合的圆周曲线，没有拐弯的顶点。',
  '封闭轮廓从A沿直线依次到B、C、D，最后回到A。各角有直角标记，相邻两边的等长标记不同。',
];
const constraintAlt = [
  '封闭轮廓按A、B、C、D、A连接。各边有相同等长标记，上下角较小、左右角较大，均非直角。', planeAlt[3], planeAlt[1],
];
const solidAlt = '三张立体卡从左到右标为甲、乙、丙。甲：外表面均为大小相同的正方形，图中只露出部分面；' +
  '乙：顶面和底面是等大的圆形平面，中间是一圈连续弯曲的侧面；丙：各方向的外表面都弯曲，没有平整的底面。';

const planes: ReadonlyArray<readonly Point[]> = [
  [[0, -62], [60, 48], [-60, 48]], [[-48, -48], [48, -48], [48, 48], [-48, 48]], [],
  [[-75, -36], [75, -36], [75, 36], [-75, 36]],
];
export const planeVertices = (index: number): readonly Point[] => planes[index];
const constraints: ReadonlyArray<readonly Point[]> = [
  [[0, -60], [40, 0], [0, 60], [-40, 0]], [[-74, -34], [74, -34], [74, 34], [-74, 34]],
  [[-48, -48], [48, -48], [48, 48], [-48, 48]],
];
export const constraintVertices = (index: number): readonly Point[] => constraints[index];
const square = planeVertices(1), rectangle: readonly Point[] = [[-80, -40], [80, -40], [80, 40], [-80, 40]];
const cuts = [
  { vertices: square, from: [0, -48], to: [0, 48], source: '正方形', result: '长方形',
    description: '正方形的各角有直角标记，各边有相同等长标记；虚线连接上边和下边的中点。',
    reason: '切线连接两条对边的中点。每块仍有直角，但相邻两边长度不同，所以都是长方形。' },
  { vertices: square, from: [-48, -48], to: [48, 48], source: '正方形', result: '三角形',
    description: '正方形的各角有直角标记，各边有相同等长标记；虚线连接顶点A和相对顶点C。',
    reason: '每块保留原来的两条边并增加一条切边，都是3条直边、3个角的三角形。' },
  { vertices: rectangle, from: [0, -40], to: [0, 40], source: '长方形', result: '正方形',
    description: '长方形各角为直角。虚线连接上边和下边的中点；标记说明半条长边与一条短边等长。',
    reason: '切开后，每块的相邻两边由标记可知等长，四个角都是直角，所以都是正方形。' },
  { vertices: rectangle, from: [-80, -40], to: [80, 40], source: '长方形', result: '三角形',
    description: '长方形各角为直角，相邻两边长度不同；虚线连接顶点A和相对顶点C。',
    reason: '切线连接相对顶点；每块由原来的两条边和新切边围成，都是三角形。' },
] as const;
const clockAlt = (hour: number) => `钟面数字1至12，长针指12，短针指${hour}；两针用长短区分，不能根据粗细或颜色判断职责。`;
const hiddenClockAlt = (index: number) => index === 0 ? '钟面数字1至12，只看得见长针指12，短针被遮住，无法观察其方向。' :
  `钟面数字1至12，只看得见短针指${index}，长针被遮住。题目另给出当前为整时。`;
const repair = (index: number) => ({ hour: index + 1, minute: index < 6 ? index + 3 : 12,
  target: index < 6 ? index + 1 : 1 + (index + 4) % 12 });

/** Counts are deliberately finite. Renamed files, rotations and option changes do not create extra tasks. */
export function buildSpatialProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const add = (code: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string, distinction: string,
    count: number, make: (index: number) => Task) => result.push({ atomId: `core:math:${code}`, family, dimension, behavior, structure, distinction,
    exercises: Array.from({ length: count }, (_, index) => ({ ...make(index), family, dimension, identityVersion: 2 })) });

  add('planeshapes', 'plane-properties', 'understanding', '按边角条件核对图形名称', '边角标记的轮廓 → 条件核对 → 名称主张',
    '继续沿用原平面图形特征题族；每种图形各核对一个正确和一个错误名称，旋转不额外制造题目。', 8, n => {
      const kind = Math.floor(n / 2), proposed = n % 2 ? planeNames[(kind + 1) % 4] : planeNames[kind];
      return { stem: `有人把这张卡片的图形记为“${proposed}”，记录正确吗？`, answer: proposed === planeNames[kind], mode: 'boolean',
        blocks: [image(`plane-${kind}`, planeAlt[kind])], analysis: `核对${planeFeatures[kind]}，图形是${planeNames[kind]}；摆放姿态不会改变这些特征。` };
    });
  add('planeshapes', 'plane-boundary-count', 'procedure', '沿封闭边界分别数直边与角', '完整轮廓 → 逐段、逐角计数 → 两项记录',
    '执行边界计数，不以名称作答；四种轮廓各一题，不用旋转或换文件名增加数量。', 4, n => {
      const count = [3, 4, 0, 4][n];
      return { stem: '沿卡片的封闭边界观察，分别记录直边和角的数量。弯曲的线不算直边，字母与标记也不算边。', mode: 'multi_blank',
        answer: [{ key: 'sides', value: String(count) }, { key: 'corners', value: String(count) }],
        responseShape: { entries: [{ key: 'sides', label: '直边有几条' }, { key: 'corners', label: '角有几个' }] },
        blocks: [image(`plane-${n}`, planeAlt[n])], analysis: count ? `从一个顶点开始绕一圈，每条直边和每个角各计一次，得到${count}条直边、${count}个角。` :
          '完整曲线没有直边，也没有角，两项都记0。字母和等长标记不属于封闭边界。' };
    });
  add('planeshapes', 'plane-cut-pieces', 'transfer', '跟踪剪分后每块纸片的新边界', '原纸片与切线 → 重建各块边角 → 两块图形',
    '四个有实际几何区别的切分任务；要求重建每块的条件，不沿用原纸片的名称。', cuts.length, n => {
      const cut = cuts[n];
      return choose(`一张${cut.source}纸沿图中的虚线剪成两块，不再移动切线。剪开的两块纸分别是什么图形？`, `两块都是${cut.result}`,
        ['三角形', '正方形', '长方形'].filter(name => name !== cut.result).map(name => `两块都是${name}`), cut.reason, [image(`cut-${n}`, cut.description)]);
    });
  add('planeshapes', 'plane-property-insufficiency', 'transfer', '同时核对边和角，找出不成立的判断', '只查一个条件的说法 → 检查这张卡是否能说明说法不成立',
    '同时检查前提和结论；同一规则在三种边角条件下核对，不把不满足前提的图形当反例。', 9, n => {
      const kind = n % 3, rule = Math.floor(n / 3), claims = ['只要四条边一样长，就一定是正方形', '只要有四个直角，就一定是正方形', '只要有四条直边，就一定是正方形'];
      const premise = rule === 0 ? kind !== 1 : rule === 1 ? kind !== 0 : true, counter = premise && kind !== 2;
      return { stem: `有人说：“${claims[rule]}。”图中这张卡能说明这句话不一定对吗？`, mode: 'boolean', answer: counter,
        blocks: [image(`constraint-${kind}`, constraintAlt[kind])], analysis: counter ? '这张卡符合说法中“只要”的条件，却不是正方形，所以能说明这句话不一定对。判断正方形要同时核对边和角。' :
          !premise ? '这张卡不满足这句话中“只要”的条件，不能用来说明这条说法不成立。要核对同一组条件。' :
            '这张卡既符合所说的条件，也确实是正方形，不能用它说明这句话不成立；但这也没有证明其他图形一定成立。' };
    });

  const solidFigure = () => image('solids-0', solidAlt);
  add('solidshapes', 'solid-properties', 'understanding', '按整个立体的表面特征核对名称', '立体图与完整表面特征 → 核对整体名称',
    '保留原立体表面特征题族；固定一张三模型卡，每个模型各有正确和错误名称主张。', 6, n => {
      const kind = Math.floor(n / 2), proposed = n % 2 ? solidNames[(kind + 1) % 3] : solidNames[kind];
      return { stem: `观察${cards[kind]}卡的整个立体。有人把它记为“${proposed}”，名称正确吗？`, mode: 'boolean', answer: proposed === solidNames[kind],
        blocks: [solidFigure()], analysis: `${cards[kind]}卡有${solidFeatures[kind]}，整体是${solidNames[kind]}；不能把一个面的名字当成整个立体的名字。` };
    });
  add('solidshapes', 'solid-surface-observations', 'procedure', '分别记录整个立体的平面与曲面', '完整表面（包括背面） → 分类清点 → 平面、曲面数量',
    '逐类清点完整表面，不只数透视图中可见的面，也不要求命名；三模型各一题。', 3, n => {
      const flat = [6, 2, 0][n], curved = n === 0 ? 0 : 1;
      return { stem: `把${cards[n]}卡当成可以拿起来观察的完整立体，包括背面。记录整个立体有几个平面和几个完整的曲面。`, mode: 'multi_blank',
        answer: [{ key: 'flat', value: String(flat) }, { key: 'curved', value: String(curved) }],
        responseShape: { entries: [{ key: 'flat', label: '平面的数量' }, { key: 'curved', label: '完整曲面的数量' }] },
        blocks: [solidFigure()], analysis: `${cards[n]}卡的整体表面是${solidFeatures[n]}，平面有${flat}个，完整曲面有${curved}个。背面也要计入，连续曲面只计一次。` };
    });
  add('solidshapes', 'solid-contact-trace', 'transfer', '把平底面对应到平面印迹，识别条件不适用', '平底面轻按纸面 → 检查是否有该面 → 平面图形或不适用',
    '区分整体和接触面，球没有平底面；不把球的圆形外观当成真实平面。', 3, n => {
      const answers = ['正方形', '圆', '这个模型没有平底面，不能按这个要求印'], answer = answers[n];
      return choose(`选${cards[n]}卡的模型，要求用一个完整的平底面蘸色后，平放在纸上印出图形，不挤压模型。哪条记录合适？`, answer, answers.filter(value => value !== answer), n === 2 ?
        '球的外表面都是曲面，没有要求使用的平底面，不能把看起来圆的轮廓当作一个平面。' :
        `${cards[n]}卡是${solidNames[n]}，接触纸的是它的一个${n === 0 ? '正方形面' : '圆形底面'}，所以完整印迹是${answer}。`, [solidFigure()]);
    });
  add('solidshapes', 'solid-functional-constraint', 'transfer', '同时核对滚动方式与平面支撑条件', '两项用途要求 → 逐项检查表面 → 满足全部条件的模型',
    '球与圆柱都能靠曲面滚动，还要检查平底面条件；仅凭一项不能选定模型。', 3, n => {
      const rule = ['所有表面都是平面，而且能用一个平面平稳放在桌上', '能靠曲面连续滚动，而且还有平底面可平稳放在桌上', '能靠曲面连续滚动，而且没有任何平底面'][n];
      return choose(`只在图中的三个理想立体模型里选，哪张卡同时符合“${rule}”？只翻倒棱角不算靠曲面连续滚动。`, cards[n], cards.filter(card => card !== cards[n]),
        `${cards[n]}卡是${solidNames[n]}，有${solidFeatures[n]}，满足两个条件；不能只凭其中一项选择。`, [solidFigure()]);
    });

  add('wholehour', 'wholehour-pointers', 'understanding', '在钟面上读取整时', '长短指针的钟面 → 确认整时 → 读取小时',
    '沿用原整时指针题族；每个小时一张图，不把颜色与粗细变化计为另一道新题。', 12, n => ({ stem: '观察钟面，现在是几时整？只填小时数。', answer: n + 1,
      blocks: [image(`clock-${n}`, clockAlt(n + 1))], analysis: `长针指12，说明正好整时；短针指${n + 1}，应读${n + 1}时整。` }));
  add('wholehour', 'wholehour-identify-hands', 'procedure', '先从长短确定指针职责', '两针 → 辨长短 → 确定指定职责',
    '核查职责而不是再读一次小时；仅保留时针、分针两个目标，不以背景小时换图扩题。', 2, n => {
      const hour = n === 0;
      return choose(`要用哪根针来${hour ? '表示小时' : '表示分钟'}？根据长短选择。`, hour ? '短针' : '长针', [hour ? '长针' : '短针'],
        `${hour ? '时针较短，表示小时' : '分针较长，表示分钟'}；颜色与粗细是画法，不能改变指针职责。`, [image('clock-3', clockAlt(4))]);
    });
  add('wholehour', 'wholehour-missing-hand-evidence', 'transfer', '部分遮挡时判断能否确定小时', '明确已知整时 + 部分指针 → 区分充分与不足的信息',
    '只见长针指12仅保留一题；可见短针的十二种小时各一题，不用隐藏值或干扰项制造新题。', 13, n => {
      const unknown = n === 0, answer = unknown ? '还不能确定是几时整' : `${n}时整`;
      return choose('已确认现在正好是整时，但钟面有一根针被遮住。只根据还看得见的针，应该怎样记录？', answer,
        unknown ? ['12时整', '1时整'] : ['还不能确定是几时整', `${n % 12 + 1}时整`], unknown ?
          '只能看到长针指12，它说明整时，却没有告诉我们小时；短针被遮住，不能把12当作小时。' :
          `题目已经明确当前为整时，短针清楚地指${n}，因此可以记录${n}时整。`, [image(`clock-hidden-${n}`, hiddenClockAlt(n))]);
    });
  add('wholehour', 'wholehour-model-repair', 'transfer', '根据目标整时只修正一根错误的指针', '可单独拨针的练习盘 + 目标小时 → 保留正确针 → 修正另一针',
    '从读数转向有约束的设置动作，只用指针职责和整时条件；不混入时长计算、加减或时段推断。', 12, n => {
      const model = repair(n), minuteWrong = model.minute !== 12;
      const answer = minuteWrong ? '只把长针拨到12，短针不动' : `只把短针拨到${model.target}，长针不动`;
      const alternatives = minuteWrong ? [`只把短针拨到${model.minute}，长针不动`, '两针都不用动'] : [`只把长针拨到${model.target}，短针不动`, '两针都不用动'];
      return choose(`这是两根针可分别拨动的练习盘，图中位置不是正在走动的钟。要把它拨成${model.target}时整，并且只动一根针，怎样做？`, answer, alternatives,
        `${model.target}时整要求短针指${model.target}、长针指12。${minuteWrong ? '短针已经正确，只需把长针拨到12。' : '长针已经指12，只需把短针拨到目标小时。'}不计算经过的时间。`,
        [image(minuteWrong ? `clock-model-${n}` : `clock-${model.hour - 1}`, `可分别拨针的练习盘，短针指${model.hour}，长针指${model.minute}。这是给定的教具状态，不代表当前时间。`)]);
    });
  return result;
}

const number = (value: number) => String(Number(value.toFixed(5)));
const points = (vertices: readonly Point[]) => vertices.map(([x, y]) => `${x},${y}`).join(' ');
const polygon = (vertices: readonly Point[]) => `<polygon id="outline" points="${points(vertices)}"/>`;
const line = (a: Point, b: Point, attrs = '') => `<line x1="${number(a[0])}" y1="${number(a[1])}" x2="${number(b[0])}" y2="${number(b[1])}" ${attrs}/>`;
const svg = (width: number, height: number, title: string, drawing: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${title}</title><rect width="${width}" height="${height}" rx="16" fill="#faf9ef"/>${drawing}</svg>\n`;
function markings(vertices: readonly Point[], right: boolean, equal: boolean) {
  return vertices.map(([x, y], i) => {
    const next = vertices[(i + 1) % vertices.length], previous = vertices[(i + vertices.length - 1) % vertices.length];
    const toward = (point: Point): Point => { const d = Math.hypot(point[0] - x, point[1] - y); return [(point[0] - x) * 10 / d, (point[1] - y) * 10 / d]; };
    const a = toward(next), b = toward(previous), mid: Point = [(x + next[0]) / 2, (y + next[1]) / 2];
    const length = Math.hypot(next[0] - x, next[1] - y), normal: Point = [(next[1] - y) * 5 / length, (x - next[0]) * 5 / length];
    const tick = (offset: number) => line([mid[0] - normal[0] + a[0] * offset, mid[1] - normal[1] + a[1] * offset],
      [mid[0] + normal[0] + a[0] * offset, mid[1] + normal[1] + a[1] * offset]);
    return `<text x="${number(x * 1.2)}" y="${number(y * 1.2 + 5)}" text-anchor="middle" stroke="none" fill="#244d40" font-size="15" font-family="sans-serif">${String.fromCharCode(65 + i)}</text>` +
      (right ? `<path d="M${number(x + a[0])},${number(y + a[1])}l${number(b[0])},${number(b[1])}l${number(-a[0])},${number(-a[1])}" fill="none"/>` : '') +
      (vertices.length === 3 ? '' : equal || i % 2 === 1 ? tick(0) : tick(-0.25) + tick(0.25));
  }).join('');
}
function planar(index: number, constraint = false) {
  const vertices = constraint ? constraintVertices(index) : planeVertices(index), circular = !vertices.length;
  const right = constraint ? index !== 0 : index === 1 || index === 3, equal = constraint ? index !== 1 : index === 1;
  return svg(340, 240, '供观察边界与角的图形卡', `<g transform="translate(170 120) rotate(${constraint ? 25 : index * 10})">` +
    `<g fill="#e4ecdc" stroke="#244d40" stroke-width="3" stroke-linejoin="round">${circular ? '<circle id="outline" cx="0" cy="0" r="52"/>' : polygon(vertices)}</g>` +
    (!circular ? `<g stroke="#244d40" stroke-width="1.5">${markings(vertices, right, equal)}</g>` : '') + '</g>');
}
function cutFigure(index: number) {
  const cut = cuts[index];
  const halfTicks = index === 2 ? [[-40, -40], [40, -40], [-40, 40], [40, 40]].map(([x, y]) => line([x, y - 5], [x, y + 5])).join('') : '';
  return svg(340, 240, '沿虚线剪开的纸片', '<g transform="translate(170 120)">' +
    `<g fill="#e4ecdc" stroke="#244d40" stroke-width="3">${polygon(cut.vertices)}</g><g stroke="#244d40" stroke-width="1.5">${markings(cut.vertices, true, index < 2)}${halfTicks}</g>` +
    line(cut.from, cut.to, 'id="cut" stroke="#b55830" stroke-width="3" stroke-dasharray="7 5"') + '</g>');
}
function solids() {
  const drawing = (kind: number) => kind === 0 ? '<path d="M-42-25 0-48 42-25 42 25 0 49-42 25Z" fill="#d7e5ce"/><path d="M-42-25 0 0 42-25M0 0V49" fill="none"/>' :
    kind === 1 ? '<path d="M-40-34V34C-40 58 40 58 40 34V-34" fill="#d7e5ce"/><ellipse cx="0" cy="-34" rx="40" ry="15" fill="#edf4e6"/><path d="M-40 34C-40 12 40 12 40 34" stroke-dasharray="5 4" fill="none"/>' :
      '<circle cx="0" cy="0" r="46" fill="#d7e5ce"/><ellipse cx="0" cy="0" rx="46" ry="14" fill="none" stroke-dasharray="5 4"/><path d="M-18-31C-34-25-35-13-35-7" stroke="#fffef9" stroke-width="5" fill="none"/>';
  return svg(570, 200, '甲乙丙三张立体观察卡', cards.map((card, position) =>
    `<g transform="translate(${95 + 190 * position} 88)" stroke="#244d40" stroke-width="3" stroke-linejoin="round">${drawing(position)}</g><text x="${95 + 190 * position}" y="172" text-anchor="middle" fill="#244d40" font-size="22" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif">${card}</text>`).join(''));
}
function clock(hour: number, minute = 12, hidden: 'hour' | 'minute' | null = null, style = 0) {
  const colors = ['#244d40', '#b55830'], end = (position: number, length: number): Point => [130 + length * Math.sin(Math.PI * position / 6), 130 - length * Math.cos(Math.PI * position / 6)];
  const numbers = Array.from({ length: 12 }, (_, n) => {
    const [x, y] = end(n + 1, 96);
    return `<text x="${number(x)}" y="${number(y + 4)}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="19" fill="#244d40">${n + 1}</text>`;
  }).join('');
  return svg(260, hidden ? 300 : 260, hidden ? '一根指针被遮挡的钟面' : '长短两针的练习钟面', `<circle cx="130" cy="130" r="119" fill="#fffef9" stroke="#9aab91" stroke-width="3"/>${numbers}` +
    (hidden !== 'minute' ? line([130, 130], end(minute, 72), `id="minute-hand" stroke="${colors[style % 2]}" stroke-width="${style % 2 ? 10 : 5}" stroke-linecap="round"`) : '') +
    (hidden !== 'hour' ? line([130, 130], end(hour, 45), `id="hour-hand" stroke="${colors[(style + 1) % 2]}" stroke-width="${style % 2 ? 5 : 10}" stroke-linecap="round"`) : '') +
    `<circle cx="130" cy="130" r="7" fill="#244d40"/>${hidden ? '<rect x="69" y="265" width="122" height="25" rx="6" fill="#f3e3c8"/><text x="130" y="283" text-anchor="middle" fill="#775029" font-size="14" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif">一根针已遮住</text>' : ''}`);
}

/** Original vector teaching assets. Canonical stimuli are reused rather than renamed into new questions. */
export function spatialProbeAssets(): Record<string, string> {
  return Object.fromEntries([
    ...Array.from({ length: 4 }, (_, n) => [`plane-${n}.svg`, planar(n)]),
    ...Array.from({ length: 3 }, (_, n) => [`constraint-${n}.svg`, planar(n, true)]),
    ...cuts.map((_, n) => [`cut-${n}.svg`, cutFigure(n)]), ['solids-0.svg', solids()],
    ...Array.from({ length: 12 }, (_, n) => [`clock-${n}.svg`, clock(n + 1, 12, null, n)]),
    ['clock-hidden-0.svg', clock(0, 12, 'hour')],
    ...Array.from({ length: 12 }, (_, n) => [`clock-hidden-${n + 1}.svg`, clock(n + 1, 12, 'minute', n)]),
    ...Array.from({ length: 6 }, (_, n) => { const model = repair(n); return [`clock-model-${n}.svg`, clock(model.hour, model.minute, null, n)]; }),
  ]);
}

import type { MeasurementDimension, QuestionBlock } from '@study-agent/contracts';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'dimension' | 'family'>;
const table = (headers: string[], rows: string[][]): QuestionBlock => ({ id: 'record', type: 'table', headers, rows });
const image = (name: string, alt: string): QuestionBlock => ({ id: 'figure', type: 'image',
  url: `/question-assets/data-probes-v1/${name}.svg`, alt });
const blanks = (stem: string, values: Array<[string, string, string | number]>, analysis: string, blocks?: QuestionBlock[]): Task =>
  ({ stem, answer: values.map(([key, , value]) => ({ key, value: String(value) })), mode: 'multi_blank',
    responseShape: { entries: values.map(([key, label]) => ({ key, label })) }, analysis, ...(blocks ? { blocks } : {}) });
const choose = (stem: string, answer: string, alternatives: string[], analysis: string, blocks?: QuestionBlock[]): Task =>
  ({ stem, answer, mode: 'single_choice', options: [answer, ...alternatives], analysis, ...(blocks ? { blocks } : {}) });
const directions = ['北', '东', '南', '西'];
const places = ['果园', '邮局', '书店', '学校'];
const paperDirections = ['上', '右', '下', '左'];
const categories = ['故事', '科学', '诗歌'];
const periods = [['红', '黄', '蓝'], ['圆', '星'], ['红', '红', '蓝'], ['圆', '星', '方', '三角']];
const sweeps = [[1, 1], [1, 2], [2, 2], [2, 3], [1, 5], [3, 4], [2, 6], [4, 5], [3, 7], [5, 6], [1, 4], [2, 5]];
const at = (period: string[], position: number) => period[(position - 1) % period.length];
const clockAlt = (number: number) => `钟面有数字1至12。长针指向数字${number}，短针在3和4之间；长短针由长度区分。`;

// Rotate actual columns as well as rows; the old family name is not a hard-coded column coordinate.
function categoryTable(n: number): QuestionBlock {
  const headers = ['登记编号', '类别', '数量（本）'];
  const rows = categories.map((category, i) => [String(701 + n * 3 + i), category, String(4 + n * 2 + i * 3)]);
  const columnOrder = [n % 3, (n + 1) % 3, (n + 2) % 3];
  return table(columnOrder.map(i => headers[i]), rows.map((_, i) => rows[(i + n) % 3]).map(row => columnOrder.map(i => row[i])));
}

/** Finite original observations. A response can test an explanation; it cannot establish a child's underlying cause on its own. */
export function buildDataProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const add = (code: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string, distinction: string,
    count: number, make: (index: number) => Task) => result.push({ atomId: `core:math:${code}`, family, dimension, behavior, structure, distinction,
    exercises: Array.from({ length: count }, (_, index) => ({ ...make(index), family, dimension, identityVersion: 2 })) });

  add('clockminutes', 'minute-unit-claim', 'understanding', '核对钟面数字与分钟单位的对应', '从12出发的大格终点 → 分钟数主张 → 5分单位核对',
    '每个终点分别有成立与不成立的主张，不让钟面数字本身决定真假；只涉及整大格。', 22, n => {
      const number = 1 + Math.floor(n / 2), claimed = n % 2 ? number : number * 5;
      return { stem: `分针从12顺时针走到数字${number}，尚未走满一圈。有人记录“经过${claimed}分钟”，这条记录正确吗？`,
        answer: claimed === number * 5, mode: 'boolean',
        analysis: `从12到数字${number}经过${number}个大格，每大格5分钟，共${number * 5}分钟。钟面数字与分钟数不是同一个单位。` };
    });
  add('clockminutes', 'minute-hand-groups', 'procedure', '观察真实钟面并分别记录大格数与分钟数', '长短两针的钟面 → 分针终点 → 大格与分钟双栏',
    '沿用原分针大格题族；由文字改成钟面并增加分项记录，不因此另造独立题族。', 11, n => {
      const number = n + 1;
      return blanks('观察钟面长针的位置。从12顺时针到长针所指数字，尚未满一圈，分别记录大格数和分钟数。',
        [['groups', '经过几个大格', number], ['minutes', '这些大格表示几分钟', number * 5]],
        `长针是分针，指向${number}；从12起经过${number}个大格，每格5分，所以是${number * 5}分。短针不能代替分针。`,
        [image(`minute-${number}`, clockAlt(number))]);
    });
  add('clockminutes', 'minute-reverse-position', 'transfer', '从分钟记录反向确定分针终点', '给定从12起的分钟数 → 还原大格数 → 钟面数字',
    '反向恢复位置而不是读取已给的指针；11个终点共用一个空盘，不用换文件扩题。', 11, n => {
      const number = n + 1;
      return { stem: `分针从12顺时针走了${number * 5}分钟，尚未走满一圈。应把分针画到钟面哪个数字上？填写这个数字。`, answer: number,
        blocks: [image('minute-blank', '空钟面有数字1至12，没有指针。')],
        analysis: `${number * 5}分钟包含${number}个5分钟的大格。从12顺时针数${number}格，终点是数字${number}，不是数字${number * 5}。` };
    });
  add('clockminutes', 'minute-composed-sweep', 'transfer', '把连续的大格移动记录合成同一钟面终点', '从12出发的两段连续记录 → 累计大格 → 当前分钟数',
    '保留两次连续观察并合成终点，区别于直接给最终数字；不混入非零时刻相减、跨圈或经过时长题。', sweeps.length, n => {
      const [first, second] = sweeps[n];
      return { stem: '分针从12出发，按表中顺序连续顺时针走，两次之间不复位，合起来尚未走满一圈。最后所在位置表示从12起多少分钟？',
        answer: (first + second) * 5, blocks: [table(['移动记录', '走过的大格数'], [['第一段', String(first)], ['接着的第二段', String(second)]])],
        analysis: `两段连续走过${first}+${second}=${first + second}个大格，每格5分钟，最终表示从12起${(first + second) * 5}分钟；不能只保留第二段。` };
    });

  add('counttable', 'category-record-audit', 'understanding', '根据类别与数量标题核对抄录', '含登记编号的分类表 → 找目标类别与数量列 → 核对记录',
    '登记编号、行位置和数量分开；行列会变化，不能把第一个数一律当数量。', 12, n => {
      const category = n % 3, quantity = 4 + n * 2 + category * 3;
      const claimed = n % 2 ? n % 4 === 1 ? 701 + n * 3 + category : 4 + n * 2 + ((category + 1) % 3) * 3 : quantity;
      return { stem: `有人抄录“${categories[category]}类已登记${claimed}本”。仅根据表中记录，这条抄录正确吗？`, answer: claimed === quantity, mode: 'boolean',
        blocks: [categoryTable(n)], analysis: `先找到“${categories[category]}”行，再找到“数量（本）”列，相交处为${quantity}本。登记编号不是数量，也不能使用相邻类别的数。` };
    });
  add('counttable', 'table-second-column', 'procedure', '按指定类别逐项读取数量', '行列重排的分类表 → 两个指定类别 → 两项数量记录',
    '保留原分类读数题族；历史名称不表示始终读第二列，多空与行列重排不另算新题族。', 12, n => {
      const first = n % 3, second = (n + 1) % 3;
      return blanks(`按表分别登记${categories[first]}类和${categories[second]}类的数量，不填写登记编号。`,
        [['first', `${categories[first]}类有几本`, 4 + n * 2 + first * 3], ['second', `${categories[second]}类有几本`, 4 + n * 2 + second * 3]],
        `沿类别行与“数量（本）”列相交定位，${categories[first]}为${4 + n * 2 + first * 3}本，${categories[second]}为${4 + n * 2 + second * 3}本。行列顺序改变不改变对应关系。`, [categoryTable(n)]);
    });
  add('counttable', 'table-two-condition-lookup', 'transfer', '同时用行类别和列班级定位', '类别×班级二维记录 → 同时满足两条件 → 唯一交叉数量',
    '从一类一数量变为同类有多个班级记录，必须同时检查两个标题，不能只选对一行。', 12, n => {
      const row = Math.floor(n / 3) % 3, col = n % 3, classes = ['甲班', '乙班', '丙班'];
      const records = categories.map((name, i) => [name, ...classes.map((_, j) => String(3 + n + i * 4 + j * 2))]);
      return { stem: `统计表记录各班借书数量（本）。${classes[col]}借了多少本${categories[row]}类图书？`, answer: Number(records[row][col + 1]),
        blocks: [table(['类别', ...classes], records)],
        analysis: `先确认“${categories[row]}”行，再确认“${classes[col]}”列，两者交叉为${records[row][col + 1]}本。同一类别的其他班级数量不能代用。` };
    });
  add('counttable', 'table-missing-versus-zero', 'transfer', '区分已登记零值与尚无记录', '含0与未登记的分类表 → 检查记录状态 → 可得结论',
    '三类各有零与缺失两种真实条件；未登记没有隐藏的真值，不能推断为0，也不靠无关数字扩题。', 6, n => {
      const target = Math.floor(n / 2), missing = n % 2 === 1, answers = ['已登记为0本', '未登记，不能确定有几本', '未登记，所以一定有0本'];
      const rows = categories.map((name, i) => [name, i === target ? missing ? '未登记' : '0' : '8']);
      const answer = answers[missing ? 1 : 0];
      return choose(`只根据当前表格，关于${categories[target]}类的数量，哪条结论有依据？`, answer, answers.filter(value => value !== answer),
        missing ? '“未登记”只表示还没有数量记录，不能知道实际有几本，尤其不能直接当作0本。需要补登记才能进一步判断。' :
          '这里明确登记了数字0，表示记录的数量为0本；它与尚未登记的状态不同。结论仅限于这份记录。', [table(['类别', '数量记录（本）'], rows)]);
    });

  add('periodic', 'period-claim-audit', 'understanding', '按已明确的完整重复节核对位置主张', '完整重复节与总位置 → 节内定位 → 核对符号',
    '直接给出完整重复规则，不从有限前缀推断唯一规律；包括整除与紧邻位置。', 12, n => {
      const period = periods[Math.floor(n / 3)], position = period.length * 2 + n % 3, expected = at(period, position);
      const claimed = n % 2 ? period.find(symbol => symbol !== expected)! : expected;
      return { stem: `完整重复节为“${period.join('、')}”，从重复节的第1项开始，按整个节反复排列。有人说“第${position}个是${claimed}”，这句话正确吗？`,
        answer: claimed === expected, mode: 'boolean',
        analysis: `重复节长${period.length}，第${position}个落在一节的第${(position - 1) % period.length + 1}项，应为${expected}。整除时对应一节的最后一项，不是第0项。` };
    });
  add('periodic', 'periodic-three', 'procedure', '分别记录所在重复节与节内位置', '完整重复节与位置 → 第几节、节内第几项 → 对应符号',
    '沿用原重复排列题族，节长变化和多空步骤记录不构成新独立题族；含重复符号但相位明确。', 12, n => {
      const period = periods[Math.floor(n / 3)], position = period.length * 3 + [0, 1, -1][n % 3];
      return blanks(`完整重复节为“${period.join('、')}”，从节的第1项开始反复排列。第${position}个落在哪里？从第1节起计数，分别填写。`,
        [['cycle', '所在第几节', Math.floor((position - 1) / period.length) + 1], ['slot', '节内第几项', (position - 1) % period.length + 1], ['symbol', '对应的符号或颜色', at(period, position)]],
        `每节${period.length}项，第${position}个在第${Math.floor((position - 1) / period.length) + 1}节、第${(position - 1) % period.length + 1}项，对应${at(period, position)}。位置是从1起，不使用第0项。`);
    });
  add('periodic', 'period-new-origin', 'transfer', '在明确的新起点下恢复后续轮值', '完整重复节与起始项 → 今天记第1天 → 指定天的符号',
    '保持重复节但改变相位，起点明确到节内项号；同色重复时也不留下起点歧义。', 12, n => {
      const period = periods[Math.floor(n / 3)], start = [1, 2, period.length][n % 3], day = [period.length + 1, period.length * 2, period.length * 3 + 1][n % 3];
      const answer = period[(start + day - 2) % period.length];
      return { stem: `值日标记的完整重复节为“${period.join('、')}”。今天从这个节的第${start}项开始，把今天记为第1天，以后每天前进一项并循环。第${day}天用什么标记？`,
        answer, mode: 'text_blank', analysis: `今天已占第1天，从节内第${start}项出发，到第${day}天只再前进${day - 1}项，落在节内第${(start + day - 2) % period.length + 1}项，是${answer}。` };
    });
  add('periodic', 'period-exclusive-next-target', 'transfer', '在不含边界的范围寻找下一次目标', '完整重复节、边界与目标 → 排除边界 → 首次目标总位置',
    '由指定位置正向读数改为带排除条件的查找；不能把边界处已有目标算作下一次。', 12, n => {
      const period = periods[Math.floor(n / 3)], boundary = period.length * 2 - 1 + n % 3, unique = [...new Set(period)], target = unique[(n % 3) % unique.length];
      let answer = boundary + 1; while (at(period, answer) !== target) answer++;
      return { stem: `完整重复节为“${period.join('、')}”，从节的第1项开始反复排列。只看第${boundary}个之后（不含第${boundary}个），第一次出现“${target}”的是整个排列的第几个？`, answer,
        analysis: `第${boundary}个本身不在查找范围内。从第${boundary + 1}个开始逐项核对，首次${target}在第${answer}个；填整个排列的位置，不是节内序号。` };
    });

  add('directions4', 'opposite-claim-audit', 'understanding', '核对面向和背后的相反方向', '明确前方固定方位 → 背后方向主张 → 相反关系',
    '四个面向各有正确与错误主张，不让面向本身决定真假；不涉及左转或右转。', 8, n => {
      const front = Math.floor(n / 2), claimed = directions[(front + (n % 2 ? 1 : 2)) % 4];
      return { stem: `面向${directions[front]}站立。有人说“背后是${claimed}”，这句话正确吗？`, answer: claimed === directions[(front + 2) % 4], mode: 'boolean',
        analysis: `${directions[front]}与${directions[(front + 2) % 4]}相对。背后是前方的相反方向，不是纸面左右，也不是相邻方向。` };
    });
  add('directions4', 'opposite-compass', 'procedure', '跟踪半圈转身前后的背后方向', '前方面向 → 原来背后 → 转半圈后的背后',
    '沿用相反方向题族；转身与分项填写仍检验同一相反关系，不因步骤控件另算独立题族。', 4, n =>
    blanks(`原来面向${directions[n]}站立，先记录原来背后的方向。然后原地转半圈，再记录转身后背后的方向。`,
      [['before', '原来背后的方向', directions[(n + 2) % 4]], ['after', '转半圈后背后的方向', directions[n]]],
      `原来背后为${directions[(n + 2) % 4]}；转半圈后前方变为${directions[(n + 2) % 4]}，所以新的背后为${directions[n]}。前后角色改变，但相反关系不变。`));
  add('directions4', 'opposite-return-route', 'transfer', '把去程方向转换为原路返程方向', '两地之间直路的去程记录 → 交换起终点 → 返程方位',
    '把身体前后关系迁移到有明确起终点的路程，不额外更换地名增加题量。', 4, n => ({
      stem: '甲地与乙地由一条直路相连。根据去程记录，从乙地沿原直路返回甲地，应朝什么方向走？', answer: directions[(n + 2) % 4], mode: 'text_blank',
      blocks: [table(['起点', '终点', '从起点到终点的方向'], [['甲地', '乙地', directions[n]]])],
      analysis: `甲到乙为${directions[n]}，交换起点和终点后方向相反，乙到甲为${directions[(n + 2) % 4]}，不能沿用去程方向。`,
    }));
  add('directions4', 'opposite-oriented-map', 'transfer', '根据地图北向标判断回到中心的方位', '北向标与实际位置 → 确定地图方向 → 外地到中心返程',
    '北向标有四种必要条件，纸面上方不一定是北；同一地图复用于四条真实不同的回程，不靠图片重命名扩题。', 16, n => {
      const north = Math.floor(n / 4), place = n % 4, answer = directions[(place + 2 - north + 4) % 4];
      return { stem: `${places[place]}与广场有直路相连。从${places[place]}沿这条直路回到广场，应朝什么方向走？请先看北向标。`,
        answer, mode: 'text_blank', blocks: [image(`map-${north}`,
          `图中广场在中心，果园在纸面上方、邮局在纸面右方、书店在纸面下方、学校在纸面左方，各有直路连向广场。北向标的箭头指向纸面${paperDirections[north]}方。`)],
        analysis: `先按北向标把纸面方向对应为实际方位，再看从${places[place]}指向广场的方向，应为${answer}。回程与广场出发的去程相反；不能默认纸面上方为北。` };
    });
  return result;
}

const fixed = (n: number) => String(Math.round(n * 1000) / 1000);
const endpoint = (cx: number, cy: number, angle: number, length: number) =>
  [fixed(cx + Math.sin(angle * Math.PI / 180) * length), fixed(cy - Math.cos(angle * Math.PI / 180) * length)];
const startSvg = (width: number, height: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#faf9ef"/>`;
const text = (x: number | string, y: number | string, value: string | number, size = 18) =>
  `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-size="${size}" fill="#173e32">${value}</text>`;
const line = (id: string, from: Array<string | number>, to: Array<string | number>, width: number) =>
  `<line id="${id}" x1="${from[0]}" y1="${from[1]}" x2="${to[0]}" y2="${to[1]}" stroke="#173e32" stroke-width="${width}" stroke-linecap="round"/>`;

/** Deterministic, original self-contained diagrams. Tests read actual endpoints independently of task-generation formulas. */
export function dataProbeAssets(): Record<string, string> {
  const result: Record<string, string> = {};
  const face = () => {
    let body = startSvg(280, 280) + '<circle cx="140" cy="140" r="113" fill="#fffef8" stroke="#173e32" stroke-width="2"/>';
    for (let i = 0; i < 12; i++) body += line(`tick-${i}`, endpoint(140, 140, i * 30, 104), endpoint(140, 140, i * 30, 110), 2);
    for (let i = 1; i <= 12; i++) { const [x, y] = endpoint(140, 140, i * 30, 88); body += text(x, y, i, 20); }
    return body;
  };
  result['minute-blank.svg'] = face() + '</svg>';
  for (let number = 1; number <= 11; number++) {
    // A running clock: the hour hand advances by half a degree for every minute.
    const minutes = number * 5;
    result[`minute-${number}.svg`] = face() + line('hour', [140, 140], endpoint(140, 140, 90 + minutes / 2, 47), number % 2 ? 5 : 3) +
      line('minute', [140, 140], endpoint(140, 140, number * 30, 70), number % 2 ? 3 : 5) + '<circle cx="140" cy="140" r="4" fill="#173e32"/></svg>';
  }
  const coordinates = [[210, 85], [320, 195], [210, 305], [100, 195]];
  for (let north = 0; north < 4; north++) {
    let body = startSvg(420, 360);
    for (let i = 0; i < 4; i++) body += line(`route-${i}`, coordinates[i], [210, 195], 3);
    body += '<rect id="center" x="172" y="174" width="76" height="42" rx="10" fill="#d6e8dc" stroke="#173e32"/>' + text(210, 195, '广场');
    for (let i = 0; i < 4; i++) {
      const [x, y] = coordinates[i];
      body += `<rect id="place-${i}" x="${x - 38}" y="${y - 21}" width="76" height="42" rx="10" fill="#fffef8" stroke="#173e32"/>` + text(x, y, places[i]);
    }
    const [tipX, tipY] = endpoint(360, 49, north * 90, 22), [labelX, labelY] = endpoint(360, 49, north * 90, 36);
    const [wing1X, wing1Y] = endpoint(Number(tipX), Number(tipY), north * 90 + 150, 9);
    const [wing2X, wing2Y] = endpoint(Number(tipX), Number(tipY), north * 90 - 150, 9);
    body += '<rect x="313" y="3" width="94" height="92" rx="8" fill="#fffef8" stroke="#b9c7bd"/>' +
      line('north', [360, 49], [tipX, tipY], 3) + `<polyline points="${wing1X},${wing1Y} ${tipX},${tipY} ${wing2X},${wing2Y}" fill="none" stroke="#173e32" stroke-width="3"/>` +
      text(labelX, labelY, '北', 16) + text(360, 110, '北向标', 14);
    result[`map-${north}.svg`] = body + '</svg>';
  }
  return result;
}

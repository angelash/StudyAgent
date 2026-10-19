import type { MeasurementDimension } from '@study-agent/contracts';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'dimension' | 'family'>;
const blanks = (stem: string, values: Array<[string, string, number]>, analysis: string): Task => ({ stem, mode: 'multi_blank',
  answer: values.map(([key, , value]) => ({ key, value: String(value) })),
  responseShape: { entries: values.map(([key, label]) => ({ key, label })) }, analysis });
const choice = (stem: string, answer: string, alternatives: string[], analysis: string): Task =>
  ({ stem, answer, mode: 'single_choice', options: [answer, ...alternatives], analysis });
const dots = (count: number) => '● '.repeat(count).trim();

/** Quantity, order and representation tasks. Retained families explicitly prevent interaction-only diversity. */
export function buildNumberProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const add = (code: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string, distinction: string,
    make: (index: number) => Task) => result.push({ atomId: `core:math:${code}`, family, dimension, behavior, structure, distinction,
    exercises: Array.from({ length: 12 }, (_, index) => ({ ...make(index), identityVersion: 2, family, dimension })) });

  add('count', 'count-enumeration-audit', 'understanding', '核查每个对象是否恰好计入一次', '实物标签与点数记录 → 检查重计或漏计',
    '记录总长度相同也可能有重复和遗漏，不能只凭最后一个数或标记数判断。', n => {
      const total = 4 + n, labels = Array.from({ length: total }, (_, i) => String(i + 1)), recorded = [...labels];
      if (n % 2) recorded[recorded.length - 1] = recorded[0];
      return { stem: '桌上的物品各有一个不同标签。下面的点数记录是否把每件物品恰好数了一次？标签只用来分清物品。', mode: 'boolean', answer: n % 2 === 0,
        blocks: [{ id: 'ledger', type: 'table', headers: ['桌上物品的标签', '点数时依次指到的标签'], rows: [[labels.join('、'), recorded.join('、')]] }],
        analysis: n % 2 ? `标签1被指了两次，标签${total}没有被指到；记录长度虽为${total}，也不能证明逐件计数正确。` : `每个标签都出现一次，没有重复或遗漏，因此逐件计数正确，共${total}件。` };
    });
  add('count', 'count-partition-tracking', 'procedure', '跨分区逐个计数且不重启累计数量', '两个不重叠摆放区 → 逐个累计全部对象',
    '需要追踪跨区域的计数过程；题目不给两个区的数字，不以加法公式替代观察。', n => {
      const left = 2 + n % 5, right = 2 + Math.floor(n / 5);
      return { stem: '两块桌面互不重叠，每个“●”是一颗珠子。把两块桌面上的珠子全部数一遍，一共有几颗？', answer: left + right,
        blocks: [{ id: 'areas', type: 'table', headers: ['左区', '右区'], rows: [[dots(left), dots(right)]] }],
        analysis: `左区数到${left}颗后接着数右区的${right}颗，最后数到${left + right}；每颗只计一次。` };
    });
  add('count', 'count-target-filter', 'transfer', '从混合标记中只计入指定对象', '混合物品记录 → 筛选目标形状 → 一一计数',
    '把所有标记都计入会产生不同答案，增加对计数对象范围的核查。', n => {
      const target = 2 + n % 6, other = 1 + Math.floor(n / 6), tokens = [...Array.from({ length: target }, () => '●'), ...Array.from({ length: other }, () => '▲')];
      const shift = n % tokens.length, arranged = [...tokens.slice(shift), ...tokens.slice(0, shift)];
      return { stem: '清点珠子时只登记“●”，不登记“▲”。下表应该登记几颗珠子？', answer: target,
        blocks: [{ id: 'mixed', type: 'table', headers: ['物品标记'], rows: [[arranged.join(' ')]] }],
        analysis: `逐一指认“●”，共有${target}个；${other}个“▲”不属于本次登记范围。` };
    });
  add('count', 'count-layout-conservation', 'transfer', '在摆放方式改变后核对集合基数', '两次不同分行记录 → 分别计数 → 核对数量是否相同',
    '必须摆脱行长或行数的表面差别，用全部对象的数量核对同样多的主张。', n => {
      const total = 4 + n, after = total + n % 2, half = Math.floor(after / 2);
      return { stem: '记录员说：“这两次摆放的珠子数量一样。”请核对记录，这句话正确吗？每个“●”是一颗珠子。', mode: 'boolean', answer: total === after,
        blocks: [{ id: 'before', type: 'table', headers: ['第一次'], rows: [[dots(total)]] },
          { id: 'after', type: 'table', headers: ['第二次'], rows: [[dots(half)], [dots(after - half)]] }],
        analysis: `第一次${total}颗，第二次两行合计${after}颗；${total === after ? '分行改变而数量相同。' : '第二次多1颗，不能说数量相同。'}` };
    });

  add('compare20', 'compare-place-counterexample', 'understanding', '不只看个位数字比较一位数与两位数', '一个错误比较规则 → 用完整位值核对结论',
    '在个位看似更大的干扰下检查十与一，区别于直接询问两个数谁大。', n => {
      const a = 10 + n % 10, b = 4 + Math.floor(n / 4), claim = n % 2 ? b : a;
      return { stem: `有人比较${a}和${b}，写下“${claim}更大”。这个比较结论正确吗？`, mode: 'boolean', answer: claim === a,
        analysis: `${a}包含一个十，${b}不到一个十；因此${a}较大，不能只比较个位。` };
    });
  add('compare20', 'compare-symbol', 'procedure', '按指定大小方向排列多个数', '四个数 → 逐次比较 → 有序序列',
    '继续沿用原数字比较题族，不把排序控件或数字个数改变计为独立新族。', n => {
      const base = 1 + n % 10, values = [base + 10, base, base + 4, base + 7], descending = n >= 10;
      return { stem: `把${values.join('、')}按${descending ? '从大到小' : '从小到大'}排列。`, mode: 'sorting',
        responseShape: { items: values.map((value, i) => ({ id: `v${i}`, label: String(value) })) }, answer: descending ? ['v0', 'v3', 'v2', 'v1'] : ['v1', 'v2', 'v3', 'v0'],
        analysis: `先比较完整数值，正确顺序是${[...values].sort((a, b) => descending ? b - a : a - b).join('、')}。` };
    });
  add('compare20', 'compare-select-quantity-field', 'transfer', '排除编号后比较真实数量', '含编号的库存表 → 选择数量字段 → 比较',
    '记录编号与物品数量不相同，需先选对字段，不能把最大的表格数字当答案。', n => {
      const a = 2 + n, b = a + 3;
      return { stem: '只比较物品数量。较多的货架上有多少件物品？', answer: b,
        blocks: [{ id: 'stock', type: 'table', headers: ['货架编号', '物品数量（件）'], rows: [['108', String(a)], ['52', String(b)]] }],
        analysis: `编号108和52不是物品数量。应比较${a}件与${b}件，较多的是${b}件。` };
    });
  add('compare20', 'compare-one-to-one-matching', 'transfer', '通过一一配对和多出部分判断多少', '两行对齐对象 → 检查未配对对象 → 判断较多的一组',
    '用对应关系比较集合，不能根据图形名称、编号或仅一个数字直接作答。', n => {
      const low = 3 + n % 6, extra = 1 + Math.floor(n / 6), topMore = n % 2 === 0;
      return { ...choice('表中每列上下两个标记配成一对，“—”表示没有物品。哪组物品更多？', topMore ? '上组' : '下组', [topMore ? '下组' : '上组', '两组同样多'],
        `先配好${low}对，多出的${extra}个在${topMore ? '上' : '下'}组，因此该组更多。`),
        blocks: [{ id: 'pairs', type: 'table', headers: ['组别', ...Array.from({ length: low + extra }, (_, i) => `配对位${i + 1}`)],
          rows: [['上组', ...Array.from({ length: low + extra }, (_, i) => i < low || topMore ? '●' : '—')],
            ['下组', ...Array.from({ length: low + extra }, (_, i) => i < low || !topMore ? '▲' : '—')]] }] };
    });

  add('ordinal', 'ordinal-total-from-sides', 'understanding', '把目标本人计入队列总人数', '前面人数与后面人数 → 目标本人 → 队列总数',
    '逆向恢复总数，检查是否遗漏作为参照的本人，区别于已知总数求反向序数。', n => {
      const front = n % 4, back = 1 + Math.floor(n / 4);
      return { stem: `一列队伍中，小禾前面有${front}人，后面有${back}人。这列队伍一共有几人？`, answer: front + back + 1,
        analysis: `前面${front}人、后面${back}人都不包括小禾，必须再计小禾1人，共${front + back + 1}人。` };
    });
  const names = ['星', '月', '山', '云', '花', '叶', '树', '鱼', '鸟', '灯'];
  add('ordinal', 'ordinal-sequence-select', 'procedure', '从指定方向逐个定位队列标记', '实际有序队列 → 确认起点与方向 → 目标标记',
    '直接执行有向定位，不使用已知左右序数互换公式。', n => {
      const total = 5 + n % 6, fromRight = n % 2 === 1, position = 1 + Math.floor(n / 2) % total, line = names.slice(0, total), answer = line[fromRight ? total - position : position - 1];
      return { stem: `表中队伍从左到右依次排列。从${fromRight ? '右' : '左'}数第${position}个的标记是什么？`, mode: 'text_blank', answer,
        blocks: [{ id: 'line', type: 'table', headers: ['左端 → 右端'], rows: [[line.join('　')]] }],
        analysis: `从${fromRight ? '右' : '左'}端开始，把端点算第1个，依次定位到第${position}个，是“${answer}”。` };
    });
  add('ordinal', 'ordinal-removal-update', 'transfer', '在排队人员离开后更新目标序位', '原序位与离队位置 → 保留顺序 → 新序位',
    '队列发生真实变化，需判断离队者是否在目标前面，不能原样沿用旧序数。', n => {
      const total = 7 + n % 4, position = 3 + Math.floor(n / 4), removed = n % 2 ? total : 1;
      return { stem: `${total}人排成一排，从左数小禾是第${position}人。原来从左数第${removed}人离开，其余人顺序不变。现在小禾从左数第几？`, answer: position - (removed < position ? 1 : 0),
        analysis: removed < position ? `离开的人在小禾前面，前面少1人，小禾变为第${position - 1}。` : `离开的人在小禾后面，小禾前面人数不变，仍为第${position}。` };
    });
  add('ordinal', 'ordinal-reversal', 'transfer', '把从右记录的序号定位回从左展示的标记', '从右序数记录与从左标记表 → 同一对象定位',
    '沿用原反向序数题族；表格中的名称对应增加表示转换，不把方向改写当成新题族。', n => {
      const total = 5 + n % 6, fromRight = 1 + Math.floor(n / 2) % total, line = names.slice(0, total), answer = line[total - fromRight];
      return { stem: `名单按从左到右记录了所有标记。记录卡写“目标从右数第${fromRight}个”。目标的标记是什么？`, mode: 'text_blank', answer,
        blocks: [{ id: 'roster', type: 'table', headers: ['左端 → 右端'], rows: [[line.join('　')]] }],
        analysis: `全队${total}个，从右第${fromRight}个是从左第${total - fromRight + 1}个，对应“${answer}”。` };
    });

  add('neighbors', 'integer-step-continuity', 'understanding', '核对相邻整数每步恰差1', '声称连续的三个数 → 检查两次间隔',
    '检查整段连续关系而非只生成一个前驱或后继，保留跨十的情况。', n => {
      const first = 4 + n, middle = first + 1 + n % 2, last = first + 2;
      return { stem: `“${first}、${middle}、${last}是从小到大连续的三个整数。”这句话正确吗？`, mode: 'boolean', answer: middle - first === 1 && last - middle === 1,
        analysis: `相邻整数每步都加1。${n % 2 ? `中间应是${first + 1}，记录跳过它并重复了${last}。` : '这两步都正好增加1。'}` };
    });
  add('neighbors', 'predecessor', 'procedure', '同时写出给定数前后的相邻整数', '给定中间数 → 分别减1与加1',
    '沿用原相邻数题族；多空记录两侧结果不增加独立题族数。', n => {
      const value = 5 + n;
      return blanks(`写出${value}前面和后面紧挨着的整数。`, [['before', '前一个整数', value - 1], ['after', '后一个整数', value + 1]],
        `前一个是${value}−1=${value - 1}，后一个是${value}+1=${value + 1}，两边都只差1。`);
    });
  add('neighbors', 'integer-between-boundaries', 'transfer', '用两个相邻边界恢复缺失的中间编号', '相邻三页的两端编号 → 同时满足前后约束',
    '从两端约束求中间，避免只看到一个“后面”词就做加法。', n => {
      const start = 4 + n;
      return { stem: '三张相邻页的页码连续增加1，中间一页的页码被遮住。中间是多少？', answer: start + 1,
        blocks: [{ id: 'pages', type: 'table', headers: ['前一页', '中间页', '后一页'], rows: [[String(start), '遮住', String(start + 2)]] }],
        analysis: `中间比${start}大1，又比${start + 2}小1，两个条件都得到${start + 1}。` };
    });
  add('neighbors', 'successor', 'transfer', '把连续编号的下一张对应到后继整数', '当前连续编号 → 发出下一张 → 相邻后继',
    '继续沿用原后继题族，不把页码或票号换名计作额外结构。', n => {
      const current = 5 + n;
      return { stem: `取号机按整数连续编号，每张比上一张大1，没有跳号。刚发出${current}号，下一张是多少号？`, answer: current + 1,
        analysis: `连续发出的下一张只增加1，${current}+1=${current + 1}。` };
    });

  add('tensones', 'tensones-unit-audit', 'understanding', '核查数位数字与计数单位的对应', '十与一记录 → 完整数的主张 → 核对',
    '干扰项将两位互换，检查单位角色而不是把两个数字相加。', n => {
      const tens = 2 + n % 6, ones = 1 + Math.floor(n / 6), correct = tens * 10 + ones, claimed = n % 2 ? ones * 10 + tens : correct;
      return { stem: `${tens}个十和${ones}个一，有人写成${claimed}。记录正确吗？`, mode: 'boolean', answer: claimed === correct,
        analysis: `${tens}个十是${tens * 10}，再加${ones}个一，应为${correct}；十和一的单位不能互换。` };
    });
  add('tensones', 'tens-compose', 'procedure', '从分单位记录合成完整数值', '十与一的表格 → 换成同单位数量 → 合成',
    '保留原十和一合成题族，表格或多空不额外制造独立证据。', n => {
      const tens = 2 + n % 6, ones = 1 + Math.floor(n / 6);
      return { ...blanks('照表记录各部分表示的数量，再写出合成的数。', [['tensValue', '十这部分表示多少个一', tens * 10], ['number', '合成的数', tens * 10 + ones]],
        `${tens}个十表示${tens * 10}个一，和${ones}个一合成${tens * 10 + ones}。`),
        blocks: [{ id: 'units', type: 'table', headers: ['单位', '个数'], rows: [['十', String(tens)], ['一', String(ones)]] }] };
    });
  add('tensones', 'tensones-reverse-packs', 'transfer', '从总数和散件反推十件包装数', '全部件数与散件 → 分离整十部分 → 包装数',
    '求未知的十单位个数，方向与给定十和一求总数相反。', n => {
      const packs = 2 + n % 6, loose = 1 + Math.floor(n / 6);
      return { stem: `一包恰好10枚棋子，桌上有若干完整包装和${loose}枚散棋子，一共${packs * 10 + loose}枚。完整包装有几包？`, answer: packs,
        analysis: `先去掉${loose}枚散棋子，留下${packs * 10}枚；每10枚一包，正好${packs}包。` };
    });
  add('tensones', 'tensones-card-position', 'transfer', '追踪数字卡在十位与个位互换后的位值', '同一对数字卡 → 交换数位 → 两种完整数值',
    '卡片本身不变而位置改变，必须同时追踪两个计数单位。', n => {
      const left = 2 + n % 6, right = 1 + Math.floor(n / 6);
      return blanks(`把数字卡${left}放在十位，数字卡${right}放在个位，然后交换两张卡的位置。`, [['before', '交换前的数', left * 10 + right], ['after', '交换后的数', right * 10 + left]],
        `交换前是${left}个十和${right}个一，即${left * 10 + right}；交换后是${right}个十和${left}个一，即${right * 10 + left}。`);
    });

  add('complement10', 'complement10-conservation', 'understanding', '核对已有与补入部分是否正好组成十', '两部分记录 → 固定容量十 → 守恒核对',
    '检查给出的补数而非直接求补数，覆盖不足、正好和超过容量。', n => {
      const filled = 1 + n % 8, added = 10 - filled + n % 3 - 1;
      return { stem: `十格框每格只放1颗珠子。已有${filled}颗，又补入${added}颗。现在能否恰好放满10格，既不缺也不多？`, mode: 'boolean', answer: filled + added === 10,
        analysis: `${filled}+${added}=${filled + added}，${filled + added === 10 ? '正好10，恰好满框。' : filled + added < 10 ? '不足10，仍有空格。' : '超过10，多于框的容量。'}` };
    });
  add('complement10', 'complement-equation', 'procedure', '分别求两条凑十等式的未知部分', '已知部分 → 补数 → 代回凑十',
    '沿用原凑十等式族；多填一条等式仍不是另一独立题族。', n => {
      const first = 1 + n % 8, second = 1 + Math.floor(n / 4);
      return blanks(`分别补全两条等式：${first}+□=10；${second}+△=10。`, [['square', '□', 10 - first], ['triangle', '△', 10 - second]],
        `10−${first}=${10 - first}，10−${second}=${10 - second}；分别与原部分相加都应得到10。`);
    });
  add('complement10', 'complement10-empty-frame', 'transfer', '从十格空间表示识别未占用部分', '两行十格框 → 已占与空格分区 → 空格数量',
    '不在题干中给出已放数量，需从空间记录提取整体与缺少部分。', n => {
      const occupied = 1 + n % 8, offset = Math.floor(n / 8) * 3, cells = Array.from({ length: 10 }, (_, i) => (i - offset + 10) % 10 < occupied ? '●' : '空');
      return { stem: '这是一个十格框，“●”表示已放1颗，“空”表示还没放。还要放几颗才能每格恰好1颗？', answer: 10 - occupied,
        blocks: [{ id: 'frame', type: 'table', rows: [cells.slice(0, 5), cells.slice(5)] }],
        analysis: `十格中已有${occupied}颗，空着${10 - occupied}格，每个空格再放1颗，共需${10 - occupied}颗。` };
    });
  add('complement10', 'complement10-combined-model', 'transfer', '把两个已放部分合起来再选择凑十关系', '两部分已放记录 → 已有总量 → 剩余容量模型',
    '已知部分分开呈现，需先合并再求不足，干扰项将取出或加入方向混淆。', n => {
      const first = 1 + n % 4, second = 1 + Math.floor(n / 4);
      return choice(`一个盒子恰好装10颗珠子，先放${first}颗，再放${second}颗。还要放几颗才满？哪条算式正确表示还要放的数量？`,
        `10−(${first}+${second})`, [`10−${first}+${second}`, `10+${first}+${second}`], `已经放了${first}+${second}颗，应从容量10中减去全部已放部分。`);
    });

  add('unknownadd', 'unknownadd-part-model', 'understanding', '根据未知量是部分选择整体减已知部分', '总量和已知部分 → 识别未知角色 → 数量关系',
    '问关系模型而非算出和，排除看见“合起来”就把整体再加一次。', n => {
      const known = 2 + n % 6, total = 12 + Math.floor(n / 6);
      return choice(`两盒彩珠合起来${total}颗，左盒${known}颗。要表示右盒数量，应选哪条算式？`, `${total}−${known}`,
        [`${total}+${known}`, `${known}−${total}`], `总数${total}包含左盒${known}和右盒，未知的是另一部分，应用整体减去已知部分。`);
    });
  add('unknownadd', 'unknownadd-candidate-audit', 'procedure', '把候选未知加数代回等式核查', '候选值 → 代回相加 → 核对是否恢复和',
    '逆运算后的独立检验，不只再做一道原来的未知加数等式。', n => {
      const known = 2 + n % 6, total = 12 + Math.floor(n / 6), candidate = total - known + n % 2;
      return { stem: `在${known}+□=${total}中，有人填□=${candidate}。把候选数代回去，这个答案正确吗？`, mode: 'boolean', answer: known + candidate === total,
        analysis: `${known}+${candidate}=${known + candidate}，${known + candidate === total ? '与给定的和相同，候选值正确。' : `与给定的${total}不同，候选值不正确。`}` };
    });
  add('unknownadd', 'unknownadd-initial-state', 'transfer', '由增加后的数量倒推原来数量', '初始量未知 → 明确加入量 → 已知结束量',
    '未知的是时间变化前的状态，不能把结束量与加入量继续相加。', n => {
      const added = 2 + n % 6, after = 12 + Math.floor(n / 6);
      return { stem: `盒里原来有一些卡片，又放入${added}张后，现在共有${after}张。原来有多少张？`, answer: after - added,
        analysis: `现在${after}张包含原来数量与新放入${added}张，倒推原来为${after}−${added}=${after - added}张。` };
    });
  add('unknownadd', 'unknownadd-hidden-two-parts', 'transfer', '从整体与分开的可见部分求被遮部分', '图示中两个可见部分 → 合并已知 → 补全整体',
    '已知部分不是题干里一个直接数字，需要从图示提取并合并，保留信息整合的观察。', n => {
      const left = 1 + n % 4, right = 1 + Math.floor(n / 4), total = 12 + n % 3;
      return { stem: `三个区域共有${total}颗珠子，右边被盖住，另外两区如下表。盖住的区域有几颗？`, answer: total - left - right,
        blocks: [{ id: 'visible', type: 'table', headers: ['左区', '中区', '右区'], rows: [[dots(left), dots(right), '遮住']] }],
        analysis: `可见两区是${left}和${right}颗，共${left + right}颗；盖住部分为${total}−${left + right}=${total - left - right}颗。` };
    });

  add('difference', 'difference-pairing-remainder', 'understanding', '把一一配对后未配上的部分解释为差', '共同部分与多出部分 → 相差数量',
    '明确观察差对应的对象，而不是把总数或其中一组数误当成差。', n => {
      const common = 3 + n % 4, extra = 1 + Math.floor(n / 4);
      return { stem: '两行从左边一一配对，“—”表示没有卡片。上排比下排多几张卡片？', answer: extra,
        blocks: [{ id: 'pairs', type: 'table', headers: ['上排', '下排'], rows: Array.from({ length: common + extra }, (_, i) => ['●', i < common ? '●' : '—']) }],
        analysis: `共同部分${common}张已配好，多出的${extra}张没有配对；相差就是这${extra}张。` };
    });
  add('difference', 'difference-numeric', 'procedure', '在交换比较措辞后保持相差量相同', '两个数量 → 多多少与少多少 → 同一差值',
    '沿用原数字相差族；两个空用于核对方向语言，不把控件变化当新关系。', n => {
      const smaller = 2 + n % 6, larger = 12 + Math.floor(n / 6), gap = larger - smaller;
      return blanks(`甲有${larger}张，乙有${smaller}张。分别填出数量差。`, [['more', '甲比乙多几张', gap], ['less', '乙比甲少几张', gap]],
        `${larger}−${smaller}=${gap}；甲比乙多和乙比甲少，说的都是同一个多出部分。`);
    });
  add('difference', 'difference-equalization', 'transfer', '求较少组补足到较多组的数量', '两组不等量 → 给较少组补入 → 达到相等',
    '目标是使两组相等的行动量，而非复述“多多少”的直接比较。', n => {
      const smaller = 2 + n % 6, larger = 12 + Math.floor(n / 6);
      return { stem: `左盒${larger}颗珠子，右盒${smaller}颗。左盒不动，只从储备中给右盒添珠子，要添几颗才两盒一样多？`, answer: larger - smaller,
        analysis: `右盒要从${smaller}补到${larger}，需添${larger}−${smaller}=${larger - smaller}颗；左盒数量不变。` };
    });
  add('difference', 'difference-shifted-endpoints', 'transfer', '从非零起点的标记求两端距离', '同单位数线两端 → 去掉起点偏移 → 间隔',
    '数量差迁移为距离，不能把较大端点的编号当作长度。', n => {
      const start = 2 + n % 6, end = 12 + Math.floor(n / 6);
      return { stem: `数线上每相邻整数之间是1格。一段带子从刻度${start}铺到刻度${end}，中间铺满，带子长几格？`, answer: end - start,
        analysis: `从${start}到${end}的间隔为${end}−${start}=${end - start}格；因为起点不是0，不能直接读右端刻度。` };
    });

  add('mixed20', 'mixed-chain-order-audit', 'understanding', '核对连续加减的首步是否保持事件顺序', '已有解法的首步 → 比较原运算的顺序',
    '错误做法把减后加误改为减去两数之和，检查结构而非碰巧得到的一个结果。', n => {
      const initial = 12 + n % 4, removed = 2 + Math.floor(n / 4), added = 1 + n % 3, proper = n % 2 === 0;
      return { stem: `计算${initial}−${removed}+${added}，小禾先${proper ? `算${initial}−${removed}` : `算${removed}+${added}，再从${initial}中减去这个和`}。这个首步安排正确吗？`, mode: 'boolean', answer: proper,
        analysis: `只有加减且没有括号，应从左到右，先${initial}−${removed}=${initial - removed}，再加${added}；不能把后两数合成一起被减去。` };
    });
  add('mixed20', 'addition-subtraction-chain', 'procedure', '记录从左到右的中间结果与最终结果', '连续加减 → 第一状态 → 第二状态',
    '保持原连续运算题族，多空只补充分步表现，不提高独立题族数。', n => {
      const first = 4 + n % 4, added = 2 + Math.floor(n / 4), removed = 1 + n % 3;
      return blanks(`从左到右计算${first}+${added}−${removed}，记录每一步。`, [['middle', '先算出的结果', first + added], ['final', '最后结果', first + added - removed]],
        `先${first}+${added}=${first + added}；这个中间结果是下一步的起点，再算${first + added}−${removed}=${first + added - removed}。`);
    });
  add('mixed20', 'mixed-inventory-events', 'transfer', '按发生顺序追踪多次增减后的状态', '初始库存与有序事件表 → 逐步更新 → 结束库存',
    '需要先把事件方向对应到加减，不能把表格中的所有数量直接合计。', n => {
      const initial = 12 + n % 4, issued = 2 + Math.floor(n / 4), received = 1 + n % 3;
      return { stem: `盒中原有${initial}张卡，随后只发生下表两件事，按表格顺序执行。结束时有多少张？`, answer: initial - issued + received,
        blocks: [{ id: 'events', type: 'table', headers: ['顺序', '事件', '数量（张）'], rows: [['先', '取出', String(issued)], ['后', '放入', String(received)]] }],
        analysis: `先取出${issued}，由${initial}变${initial - issued}；再放入${received}，结束有${initial - issued + received}张。` };
    });
  add('mixed20', 'mixed-inverse-reconstruction', 'transfer', '从结束状态逆向撤销连续取添动作', '结束库存 → 撤销最后动作 → 撤销前一动作',
    '未知的是开始状态，要求按相反次序还原，不能照抄正向算式。', n => {
      const initial = 12 + n % 4, removed = 2 + Math.floor(n / 4), added = 1 + n % 3, final = initial - removed + added;
      return blanks(`盒中先取走${removed}颗珠子，再放入${added}颗，最后有${final}颗。倒着还原数量。`,
        [['beforeLast', '放入之前有几颗', initial - removed], ['initial', '最开始有几颗', initial]],
        `撤销最后放入${added}颗，${final}−${added}=${initial - removed}；再把取走的${removed}颗还原，${initial - removed}+${removed}=${initial}。`);
    });

  add('money10', 'money10-conservation-audit', 'understanding', '核对不同元角表示是否等值', '两种单位记录 → 统一成角 → 等值核查',
    '保留单位与数值的联动，干扰是把元角数字直接拼错或少算角。', n => {
      const yuan = 2 + n % 6, jiao = 1 + Math.floor(n / 6), claim = yuan * 10 + jiao + n % 2;
      return { stem: `${yuan}元${jiao}角和${claim}角，价值相同吗？`, mode: 'boolean', answer: claim === yuan * 10 + jiao,
        analysis: `1元=10角，${yuan}元是${yuan * 10}角，加${jiao}角应为${yuan * 10 + jiao}角，再与${claim}角核对。` };
    });
  add('money10', 'money10-exchange-record', 'procedure', '把整元换成角并同步更新两种数量', '换出1元 → 换入10角 → 核对元角两部分',
    '必须联动减少元与增加角，区别于只做一个方向的最终换算。', n => {
      const yuan = 2 + n % 6, jiao = 1 + Math.floor(n / 6);
      return blanks(`原有${yuan}张1元和${jiao}枚1角，把其中1张1元恰好换成10枚1角，不花钱。换好后：`,
        [['yuan', '还剩几张1元', yuan - 1], ['jiao', '共有几枚1角', jiao + 10]],
        `换出1张1元后剩${yuan - 1}张，1角硬币增加10枚变成${jiao + 10}枚；价值没有改变。`);
    });
  add('money10', 'money10-compare-prices', 'transfer', '比较使用不同单位的标价', '复合元角价与纯角价 → 同单位比较',
    '不能只比较印出的数字大小，要先保持单位一致后比较实际价值。', n => {
      const yuan = 2 + n % 6, jiao = 1 + Math.floor(n / 6), other = yuan * 10 + jiao + (n % 2 ? -1 : 1);
      return choice(`甲标价${yuan}元${jiao}角，乙标价${other}角。哪件更贵？`, other > yuan * 10 + jiao ? '乙' : '甲', [other > yuan * 10 + jiao ? '甲' : '乙', '一样贵'],
        `甲为${yuan * 10 + jiao}角，与乙${other}角比较，${Math.max(yuan * 10 + jiao, other)}角对应的更贵。`);
    });
  add('money10', 'money10-missing-coins', 'transfer', '由总价值和整元部分反推角币个数', '总价值与整元币数 → 去掉整元价值 → 角币数量',
    '从整体价值反求一个单位部分，不是给定两部分再相加。', n => {
      const yuan = 2 + n % 6, loose = 1 + Math.floor(n / 6);
      return { stem: `钱袋里只有${yuan}张1元纸币和一些1角硬币，总价值为${yuan * 10 + loose}角。1角硬币有几枚？`, answer: loose,
        analysis: `${yuan}张1元价值${yuan * 10}角，剩余${yuan * 10 + loose}−${yuan * 10}=${loose}角来自1角硬币，因此有${loose}枚。` };
    });
  return result;
}

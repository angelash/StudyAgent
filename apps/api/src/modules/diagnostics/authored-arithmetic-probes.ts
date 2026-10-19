import type { MeasurementDimension } from '@study-agent/contracts';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

/** Arithmetic structures distinguish quantity relations, models and procedures; variants retain one family. */
export function buildArithmeticProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const add = (code: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string, distinction: string,
    make: (index: number) => Omit<Exercise, 'dimension' | 'family'>) => result.push({ atomId: `foundation:math:${code}`, family, dimension,
    behavior, structure, distinction, exercises: Array.from({ length: 12 }, (_, index) => ({ ...make(index), identityVersion: 2, family, dimension })) });
  const choice = (stem: string, answer: string, alternatives: string[], analysis: string) => ({ stem, answer, mode: 'single_choice' as const,
    options: [answer, ...alternatives], analysis });
  const blanks = (stem: string, entries: Array<[string, string, number]>, analysis: string) => ({ stem, mode: 'multi_blank' as const,
    answer: entries.map(([key, , value]) => ({ key, value: String(value) })), responseShape: { entries: entries.map(([key, label]) => ({ key, label })) }, analysis });

  // The equation retains the existing symbolic family: switching to an equation alone is not a new independent structure.
  add('decompose10', 'part-whole-symbol', 'procedure', '在加法等式中完成整体与部分的关系', '整体与一个部分 → 补全同一分解等式',
    '沿用原符号题族，不把文字改成等式或把输入框改变计为新增题族。', n => {
      const total = 5 + n % 6, part = 1 + Math.floor(n / 3) % (total - 1);
      return { stem: `补全分解：${part}+□=${total}，□里填几？`, answer: total - part,
        analysis: `两个部分合起来是${total}，已知部分是${part}，另一个部分为${total}−${part}=${total - part}。` };
    });
  add('decompose10', 'part-whole-conservation-audit', 'understanding', '核对两个部分是否恰好组成给定整体', '一个完整分组记录 → 检查有无多算或少算',
    '检查给出的划分是否保持总量，不是再求一次已知部分以外的数量。', n => {
      const total = 5 + n % 6, left = 1 + n % 4, right = total - left + n % 2;
      return { stem: `盒里原有${total}颗珠子，全部分到左、右两边，没有加入或拿走。记录写“左边${left}颗，右边${right}颗”。记录可能正确吗？`,
        answer: left + right === total, mode: 'boolean', analysis: `核对两边合起来是否仍为${total}：${left}+${right}=${left + right}，因此${left + right === total ? '记录符合总数。' : '记录多算了1颗。'}` };
    });
  add('decompose10', 'part-whole-occluded-collection', 'transfer', '从可见集合和总数推断被遮住的部分', '数清可见实物标记 → 对照总数 → 推断遮挡集合',
    '用实物标记恢复可见部分，再推断隐藏部分；不直接在文字中给出两个数量。', n => {
      const total = 5 + n % 6, shown = 1 + Math.floor(n / 3) % (total - 1);
      return { stem: `盘里一共有${total}颗珠子，一部分露在盖子外，另一部分在盖子下。盖子外的珠子如表所示。盖子下有几颗？`, answer: total - shown,
        blocks: [{ id: 'visible', type: 'table', headers: ['位置', '珠子'], rows: [['盖子外', '● '.repeat(shown).trim()], ['盖子下', '被盖住，看不见']] }],
        analysis: `盖子外数出${shown}颗，盘中总共${total}颗，因此盖子下有${total}−${shown}=${total - shown}颗。` };
    });
  add('decompose10', 'part-whole-model-selection', 'transfer', '从整体与部分情境选择求缺少部分的关系', '完整集合与一个子集 → 选择表示另一部分的算式',
    '问数量关系而非计算结果，排除把整体和部分再次相加或把已知部分当成答案。', n => {
      const total = 5 + n % 6, part = 1 + Math.floor(n / 2) % (total - 1);
      return choice(`一张图上总共有${total}个小格，其中${part}格涂了色，其余没有涂。要表示“没有涂色的格数”，应选哪条算式？`,
        `${total}−${part}`, [`${total}+${part}`, `${total}+0`], `整体${total}格包含已涂色的${part}格；求另一部分应从整体中去掉已知部分。`);
    });

  add('add20', 'addition-make-ten-steps', 'procedure', '把第二个加数拆成凑十部分与剩余部分', '凑十所需量 → 剩余量 → 合并结果',
    '记录凑十时的数量分配过程，区别于原有只提交总和的题；控件本身不构成新题族。', n => {
      const a = 6 + n % 4, b = 5 + Math.floor(n / 3) % 4, need = 10 - a;
      return blanks(`用凑十的方法计算${a}+${b}。把后面的${b}分成两部分，先让${a}凑成10，再计算。`,
        [['need', '先分给前面多少', need], ['left', '后面还剩多少', b - need], ['total', '最后的和', a + b]],
        `${a}还需要${need}才能凑成10；${b}分出${need}后还剩${b - need}；10+${b - need}=${a + b}。`);
    });
  add('add20', 'addition-regrouping-audit', 'understanding', '检查凑十时被拆开的数量是否守恒', '他人的拆分步骤 → 检查拆分与合并是否等价',
    '针对中间表示的守恒作判断，避免只用最终和评价孩子是否理解凑十。', n => {
      const a = 6 + n % 4, b = 5 + Math.floor(n / 3) % 4, remaining = a + b - 10 + n % 2;
      return { stem: `小禾算${a}+${b}，先从${b}里拿出${10 - a}与${a}凑成10，再写“还剩${remaining}，所以等于10+${remaining}”。他的拆分记录正确吗？`,
        answer: remaining === a + b - 10, mode: 'boolean', analysis: `${b}拿出${10 - a}，应剩${b - (10 - a)}。只有拿出与剩余合起来仍是原加数，才保持原来的和。` };
    });
  add('add20', 'addition-disjoint-inventory', 'transfer', '从分类清单合并两个不重叠的部分', '分类清单 → 识别互不重叠的两部分 → 总数',
    '从静态分类而非时间上的收到/增加提取两个部分，明示无重叠以免把重复登记当成加法。', n => {
      const red = 4 + n % 6, blue = 3 + Math.floor(n / 3) % 6;
      return { stem: '这张清单把桌上的全部卡片按颜色分成两类，每张只登记一次。桌上一共有多少张卡片？', answer: red + blue,
        blocks: [{ id: 'stock', type: 'table', headers: ['颜色', '张数'], rows: [['红色', String(red)], ['蓝色', String(blue)]] }],
        analysis: `红色${red}张、蓝色${blue}张互不重叠，合起来是${red}+${blue}=${red + blue}张。` };
    });
  add('add20', 'addition-number-line-motion', 'transfer', '将连续向前移动表示为两个量的合并', '数线起点与两段同向移动 → 终点',
    '把数线位移转为加法，表示与物品的合并不同，仍保持两个正向部分与整体的关系。', n => {
      const first = 4 + n % 6, second = 3 + Math.floor(n / 3) % 6;
      return { stem: `数线上每相邻两个整数之间是1格。棋子从0先向右走${first}格，再向右走${second}格，停在几？`, answer: first + second,
        analysis: `从0向右走${first}格到${first}，继续向右${second}格，终点是${first}+${second}=${first + second}。` };
    });

  add('subtract20', 'subtraction-inverse-check', 'understanding', '用剩余与拿走的数量恢复原来的整体', '减法记录 → 用逆向合并检查结果',
    '不直接执行减法，而是核对剩余与拿走合起来能否恢复原数。', n => {
      const total = 11 + n % 9, removed = 2 + Math.floor(n / 3) % 7, remaining = total - removed + n % 2;
      return { stem: `原有${total}张卡，拿走${removed}张，小林记录“剩${remaining}张”。如果把拿走的卡放回去，这份记录能恢复原来的总数吗？`,
        mode: 'boolean', answer: remaining + removed === total, analysis: `${remaining}+${removed}=${remaining + removed}，${remaining + removed === total ? '能恢复原来的总数。' : '比原来多1，原剩余记录不正确。'}` };
    });
  add('subtract20', 'subtraction-via-ten-steps', 'procedure', '先减到十，再减掉尚未减去的数量', '减到十所需量 → 剩余减量 → 剩余数量',
    '观察分段减法是否累计减去正确数量，不只是换一道直接算式。', n => {
      const total = 11 + n % 4, first = total - 10, removed = first + 1 + Math.floor(n / 4) % 3;
      return blanks(`分两步计算${total}−${removed}：先减到10，再减完剩下的部分。`,
        [['first', '先减几到10', first], ['then', '还要减几', removed - first], ['remaining', '最后还剩几', total - removed]],
        `先减${first}到10；一共要减${removed}，还要减${removed - first}，最后10−${removed - first}=${total - removed}。`);
    });
  add('subtract20', 'subtraction-number-line-backward', 'transfer', '将数线向左退回的格数映射为减去的量', '已知数线位置 → 反向位移 → 终点',
    '表示从物品剩余变为数线运动；区分起点、移动量和终点。', n => {
      const start = 11 + n % 9, back = 2 + Math.floor(n / 3) % 7;
      return { stem: `棋子在数线的${start}处。每格表示1，向左退${back}格后，停在几？`, answer: start - back,
        analysis: `向左退${back}格表示减少${back}，终点是${start}−${back}=${start - back}。` };
    });
  add('subtract20', 'subtraction-stock-record', 'transfer', '从库存变动记录选出真正减少的数量', '库存记录与无关编号 → 识别减少量 → 剩余',
    '需要从带有无关编号的记录提取库存和发出数量，核查信息选择的迁移表现。', n => {
      const stock = 11 + n % 9, issued = 2 + Math.floor(n / 3) % 7, serial = 30 + n;
      return { stem: '卡片库只发生了下表这一笔发出记录，没有新卡入库。现在还剩多少张？', answer: stock - issued,
        blocks: [{ id: 'transaction', type: 'table', headers: ['记录编号', '原有张数', '发出张数'], rows: [[String(serial), String(stock), String(issued)]] }],
        analysis: `记录编号${serial}用于查找记录，不是卡片数量。从原有${stock}张中减去发出的${issued}张，剩${stock - issued}张。` };
    });

  add('multiplytable', 'equal-groups-factor-roles', 'understanding', '将组数与每组数量分别对应到乘法关系', '等组情境 → 区分组数与每组数',
    '目标是两个因数在情境中的含义，不能仅因乘积碰巧相同就算理解了对应关系。', n => {
      const groups = 2 + n % 4, each = 6 + Math.floor(n / 4) % 3;
      return blanks(`有${groups}排椅子，每排${each}把。按“组数×每组数”记录：`, [['groups', '组数', groups], ['each', '每组数', each]],
        `${groups}排就是${groups}组，每排${each}把就是每组${each}个；两种数量在情境中不能互换名称。`);
    });
  add('multiplytable', 'equal-groups-equality-audit', 'procedure', '判断相同加数重复的次数并选完整乘法模型', '展开的重复加法 → 识别重复次数 → 乘法模型',
    '原题要求算重复加法的总数；本组要求恢复乘法的两个角色，观察把项数或加数认错的情况。', n => {
      const groups = 2 + n % 4, each = 6 + Math.floor(n / 4) % 3, sum = Array.from({ length: groups }, () => String(each)).join('+');
      return choice(`把${sum}改写为乘法。约定前一个因数写“相同加数出现的次数”，应选哪条？`, `${groups}×${each}`,
        [`${groups + 1}×${each}`, `${groups}×${each + 1}`], `相同加数${each}出现${groups}次，表示${groups}个${each}，按约定写${groups}×${each}。`);
    });
  add('multiplytable', 'equal-groups-spatial-array', 'transfer', '将相同长度的图案行识别为等组', '数出空间阵列的行与列 → 等组总数',
    '从空间排列识别两个因数，不在题干中直接给出组数和每组数。', n => {
      const rows = 2 + n % 4, columns = 3 + Math.floor(n / 4) % 3;
      return { stem: '表格中每一行的圆点数相同，每个“●”表示1个。图中一共有多少个圆点？', answer: rows * columns,
        blocks: [{ id: 'array', type: 'table', headers: ['排列'], rows: Array.from({ length: rows }, () => ['● '.repeat(columns).trim()]) }],
        analysis: `数出${rows}行，每行${columns}个圆点；用${rows}×${columns}=${rows * columns}求总数。` };
    });
  add('multiplytable', 'equal-groups-equal-jumps', 'transfer', '把相同步长的数线移动看作等组累加', '重复同长度跳跃 → 重复次数与步长 → 总位移',
    '把运动中的等量重复转为乘法，不是更换每盒物品的名称。', n => {
      const jumps = 2 + n % 4, stride = 3 + Math.floor(n / 4) % 3;
      return { stem: `数线上每格表示1。小棋子从0开始，每次向右跳${stride}格，连续跳${jumps}次，停在几？`, answer: stride * jumps,
        analysis: `每次${stride}格，相同的${stride}重复${jumps}次，总共移动${jumps}×${stride}=${jumps * stride}格。` };
    });

  add('divisiontable', 'division-share-conservation', 'understanding', '核对平均分的每份数量与总数是否一致', '给定平均分记录 → 逐份合并 → 检查是否用尽整体',
    '核对一个声称已经完成的平均分方案，不直接求商；同时保持每份相同和总量用尽。', n => {
      const people = 2 + n % 4, each = 3 + Math.floor(n / 4) % 3, recorded = each + n % 2;
      return { stem: `把${people * each}颗珠子全部平均分给${people}人。记录说“每人${recorded}颗，没有剩余”。这个记录可能正确吗？`, mode: 'boolean',
        answer: people * recorded === people * each, analysis: `按记录共分出${people}×${recorded}=${people * recorded}颗，应与原来的${people * each}颗相同。` };
    });
  add('divisiontable', 'division-dealing-rounds', 'procedure', '将逐轮公平发放与每份数量联系', '每人每轮1个 → 完整轮数 → 每人所得',
    '通过均匀发放过程恢复每份数，检查是否把总发出数当成每人得到数。', n => {
      const people = 2 + n % 4, rounds = 3 + Math.floor(n / 4) % 3;
      return blanks(`有${people * rounds}张卡，给${people}人轮流发，每轮每人各得1张，恰好全部发完。`,
        [['rounds', '一共发了几整轮', rounds], ['each', '每人共得到几张', rounds]],
        `每轮用去${people}张；${people * rounds}张可发${rounds}轮，每人每轮得到1张，所以每人得${rounds}张。`);
    });
  add('divisiontable', 'division-equal-intervals', 'transfer', '从总位移与相同跳跃次数推断每次移动量', '总距离与等长跳跃次数 → 每次位移',
    '平均分从离散物品转为数线上相同的距离，要求识别每份对应的步长。', n => {
      const jumps = 2 + n % 4, stride = 3 + Math.floor(n / 4) % 3;
      return { stem: `数线上每格表示1。棋子从0用${jumps}次一样长的向右跳跃，正好到${jumps * stride}。每次跳几格？`, answer: stride,
        analysis: `总共${jumps * stride}格，平均分成${jumps}次相同跳跃，每次为${jumps * stride}÷${jumps}=${stride}格。` };
    });
  add('divisiontable', 'division-cut-equal-lengths', 'transfer', '把连续长度平均分为若干相同部分', '完整纸带长度 → 等长分段 → 单段长度',
    '平均分对象为连续长度而不是人数与件数，区分段数和切口数；题干明确段数而不引入额外计数目标。', n => {
      const pieces = 2 + n % 4, length = 3 + Math.floor(n / 4) % 3;
      return { stem: `一条纸带长${pieces * length}格，每格长度相同。把它全部平均分成${pieces}段，每段长几格？`, answer: length,
        analysis: `把总长度${pieces * length}格平均分成${pieces}份，每段长度是${pieces * length}÷${pieces}=${length}格。这里给的是段数，不是切口数。` };
    });
  return result;
}

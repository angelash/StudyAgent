import type { MeasurementDimension, QuestionBlock } from '@study-agent/contracts';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'family' | 'dimension'>;
const colors = [['red', '红色'], ['blue', '蓝色'], ['green', '绿色'], ['yellow', '黄色']];
const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const objects = ['纸卡', '书皮', '笔杆', '盒盖', '积木', '瓶身', '标签', '画框', '布片', '玩具', '包装纸', '封面'];
const nouns = [['cat', '猫'], ['dog', '狗'], ['book', '书'], ['pen', '笔'], ['map', '地图'], ['cup', '杯子']];
const rotate = <T,>(values: T[], n: number) => [...values.slice(n % values.length), ...values.slice(0, n % values.length)];
const table = (headers: string[], rows: string[][]): QuestionBlock => ({ id: 'record', type: 'table', headers, rows });
const blanks = (stem: string, values: Array<[string, string, string]>, analysis: string, blocks?: QuestionBlock[]): Task => ({ stem,
  mode: 'multi_blank', answer: values.map(([key, , value]) => ({ key, value })), responseShape: { entries: values.map(([key, label]) => ({ key, label })) },
  analysis, ...(blocks ? { blocks } : {}) });
const nounForm = (noun: string, count: number) => noun + (count > 1 ? 's' : '');

/** Written tasks: counting, record tracking and scope reasoning remain alternative explanations for compound errors. */
export function buildEnglishLexicalProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const add = (code: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string,
    distinction: string, seconds: number, make: (index: number) => Task) => result.push({ atomId: `core:english:${code}`, family, dimension,
    behavior, structure, distinction, exercises: Array.from({ length: 12 }, (_, n) => ({ ...make(n), family, dimension, identityVersion: 2, expectedSeconds: seconds })) });

  add('color', 'color-context', 'understanding', '从明确颜色描述提取对应英语词',
    '已明示的中文颜色 → 对应的书面英语词', '沿用既有颜色描述结构；对象名称变化不增加独立结构，也不测屏幕辨色。', 50, n => {
      const color = colors[n % colors.length];
      return { stem: `记录明确写着“${objects[n]}是${color[1]}的”。只看颜色词，哪一个英语词与这个描述对应？`,
        mode: 'single_choice', options: rotate(colors.map(row => row[0]), n), answer: color[0],
        analysis: `${color[1]}对应${color[0]}。这里根据明确文字描述选择，不需要根据物品常见颜色猜测。` };
    });
  add('color', 'color-meaning', 'procedure', '完整匹配颜色词与中文意义',
    '三张书面颜色词卡 → 三种明确中文意义的完整配对', '沿用既有词义映射身份；完整匹配与多项作答不额外增加结构。', 80, n => {
      const selected = [0, 1, 2].map(i => colors[(n + i) % colors.length]);
      return { stem: '把三张英语颜色词卡与各自的中文意义完整配对，每个中文意义使用一次。', mode: 'matching',
        responseShape: { left: rotate(selected.map(([word], i) => ({ id: `word${i}`, label: word })), n),
          right: rotate(selected.map(([, label], i) => ({ id: `meaning${i}`, label })), n + 1) },
        answer: { pairs: selected.map((_, i) => ({ left: `word${i}`, right: `meaning${i}` })) },
        analysis: selected.map(([word, meaning]) => `${word}表示${meaning}`).join('；') + '。逐词核对，不能只按两列显示位置连线。' };
    });
  add('color', 'color-record-repair', 'transfer', '核对多行物品记录并修复唯一冲突标签',
    '物品实际颜色与已有英语标签表 → 定位冲突行并替换', '同时核对多行记录并定位不一致；与单词直接提取、完整配对分别观察，额外阅读负担仍是替代解释。', 100, n => {
      const broken = n % 3, indices = [0, 1, 2].map(i => (n + i) % colors.length);
      const rows = indices.map((index, i) => [String(i + 1), objects[(n + i) % objects.length], colors[index][1], colors[index][0]]);
      rows[broken][3] = colors[(indices[broken] + 1) % colors.length][0];
      return blanks('下表只有一行的英语颜色标签与实际颜色不符。先填该行编号，再从red / blue / green / yellow中填写正确的替换词。',
        [['row', '需要改正的行编号', String(broken + 1)], ['word', '正确英语颜色词', colors[indices[broken]][0]]],
        `第${broken + 1}行记录的实际颜色是${colors[indices[broken]][1]}，应改为${colors[indices[broken]][0]}；其他行标签与各自颜色一致。`,
        [table(['行', '物品', '实际颜色', '已有英语标签'], rows)]);
    });
  add('color', 'color-object-update', 'transfer', '按对象追踪多次更新后的实际颜色',
    '交错的不同对象更新记录 → 只保留目标对象的最新颜色 → 英语编码', '每次更新覆盖该对象旧记录，不能按全表最后一行或最早标签作答；不涉及颜料混色。', 105, n => {
      const target = objects[n], other = objects[(n + 4) % objects.length], another = objects[(n + 8) % objects.length];
      const updates = [[target, colors[n % 4][1]], [other, colors[(n + 3) % 4][1]], [target, colors[(n + 1) % 4][1]]];
      const tail = [[target, colors[(n + 2) % 4][1]], [another, colors[(n + 3) % 4][1]]];
      updates.push(...(n % 2 ? tail.reverse() : tail));
      return { stem: `下表按先后顺序记录颜色更新，每行完整替换该物品旧颜色，不涉及混色。现在只问“${target}”的实际颜色，应使用哪个英语词？`,
        mode: 'single_choice', options: rotate(colors.map(row => row[0]), n + 1), answer: colors[(n + 2) % 4][0],
        blocks: [table(['先后', '物品', '更新后的实际颜色'], updates.map((row, i) => [String(i + 1), ...row]))],
        analysis: `只追踪${target}，最后一次更新把它改为${colors[(n + 2) % 4][1]}，英语为${colors[(n + 2) % 4][0]}。其他物品的后续更新不会改变它。` };
    });

  add('numberword', 'number-word-read', 'understanding', '核对一至十书面数量词的数值意义',
    '书面英语数量词及一个数字主张 → 判断对应是否成立', '沿用既有数量词读取身份；判断题不单独增加结构。', 50, n => {
      const count = n % 10 + 1, correct = n % 2 === 0, claimed = correct ? count : count % 10 + 1;
      return { stem: `一份${objects[n]}的数量记录写着“${words[count - 1]}”。有人把这个数量记成${claimed}个。这个数字与英语数量词对应吗？`,
        mode: 'boolean', answer: correct, analysis: `${words[count - 1]}表示${count}，所以数字${claimed}${correct ? '与它对应' : '与它不对应'}。` };
    });
  add('numberword', 'number-word-produce', 'procedure', '把三个已知数量分别写成英语数量词',
    '三个明确数字记录 → 逐项写出一至十的英语词', '沿用既有数字到数量词身份；三个空不等于三个独立结构，不把拼写变化算成新的题族。', 85, n => {
      const counts = [n % 10 + 1, (n + 3) % 10 + 1, (n + 7) % 10 + 1];
      return blanks('按表中数字记录，在对应空位写出英语数量词，只写one至ten中的单词。',
        counts.map((count, i) => [`record${i}`, `${['甲', '乙', '丙'][i]}的数量词`, words[count - 1]]),
        counts.map((count, i) => `${['甲', '乙', '丙'][i]}为${count}，写${words[count - 1]}`).join('；') + '。',
        [table(['记录', '物品', '已知数量'], counts.map((count, i) => [['甲', '乙', '丙'][i], objects[(n + i) % objects.length], String(count)]))]);
    });
  add('numberword', 'numberword-inventory-check', 'transfer', '按完整符号库存逐行核对所有数量词',
    '逐个物品符号与数量标签 → 独立点数并核对所有记录', '每个符号只代表一个物品，需要从库存重建数量；不能把计数失败直接确定为词义未掌握。', 110, n => {
      const counts = [0, 1, 2, 3].map(i => (n + i * 3) % 10 + 1), labels = ['甲', '乙', '丙', '丁'];
      const rows = counts.map((count, i) => [labels[i], Array.from({ length: count }, () => '●').join(' '), words[((n + i) % 3 ? count : count % 10 + 1) - 1]]);
      return { stem: '每个●代表一个物品，空格只用来分隔符号。逐行点数，选择所有“已有数量词”与该行实际物品数相符的记录。',
        mode: 'multiple_choice', options: rotate(labels, n), answer: rotate(labels, n).filter(label => (n + labels.indexOf(label)) % 3 !== 0),
        blocks: [table(['记录', '逐个物品', '已有数量词'], rows)],
        analysis: counts.map((count, i) => `${labels[i]}实际${count}个，应为${words[count - 1]}`).join('；') + '。必须逐行核对，不能只按标签猜数量。' };
    });
  add('numberword', 'numberword-stock-events', 'transfer', '解码出入库存记录并恢复中间与当前数量',
    '英语初始数量及移入/移出事件 → 恢复每步库存 → 英语编码', '需要解码数量词、按实际操作更新数量再编码；算术、事件顺序和工作记忆都是综合失败的替代解释。', 110, n => {
      const start = 2 + n % 5, incoming = 1 + n % 3, outgoing = 1 + n % 2, afterIn = start + incoming, final = afterIn - outgoing;
      return blanks('只追踪同一个盒子，记录完整且按先后执行。填写第1步移入后和第2步移出后的英语数量词，只写one至ten中的单词。',
        [['afterIn', '第1步结束时', words[afterIn - 1]], ['final', '第2步结束时', words[final - 1]]],
        `初始${start}个，移入${incoming}个后为${afterIn}，移出${outgoing}个后为${final}，分别写${words[afterIn - 1]}、${words[final - 1]}。这是综合记录核查，不单凭该题确定词汇或算术根因。`,
        [table(['先后', '操作', '数量词'], [['初始', '盒内已有', words[start - 1]], ['第1步', '移入', words[incoming - 1]], ['第2步', '移出', words[outgoing - 1]]])]);
    });

  add('simpleplural', 'plural-number', 'understanding', '核对单个与多个物品对应的规则名词词形',
    '明确数量、已给单数词与候选词形 → 判断是否一致', '沿用既有数量与复数关系身份；只使用直接加s的名词，单数对照不增加新结构。', 55, n => {
      const [noun, meaning] = nouns[n % nouns.length], count = n % 5 === 0 ? 1 : 2 + n % 4, correct = n % 2 === 0;
      const offered = correct ? nounForm(noun, count) : nounForm(noun, count === 1 ? 2 : 1);
      return { stem: `${noun}是“${meaning}”的单数词。记录明确有${count}个这种物品，标签只写名词“${offered}”。这个词形与数量一致吗？`,
        mode: 'boolean', answer: correct,
        analysis: `${count === 1 ? '一个用单数' : '多于一个用直接加s的规则复数'}，这里应写${nounForm(noun, count)}。` };
    });
  add('simpleplural', 'plural-phrase', 'procedure', '根据三个明确数量产出正确规则词形',
    '已给单数词和三条数量记录 → 分别写出适当名词词形', '沿用既有数量短语产出身份；增加空位仍是一份作答，不把不同名词当作不同结构。', 85, n => {
      const [noun, meaning] = nouns[n % nouns.length], counts = [1, 2 + n % 4, 6 + n % 3];
      return blanks(`给定单数词${noun}（${meaning}），分别按下表数量填写名词词形，只写该名词的单数或复数，不写数字。`,
        counts.map((count, i) => [`record${i}`, `${['甲', '乙', '丙'][i]}的名词词形`, nounForm(noun, count)]),
        `${noun}的规则复数为${noun}s；甲是一个，用${noun}，乙与丙都多于一个，用${noun}s。`,
        [table(['记录', '物品数量'], counts.map((count, i) => [['甲', '乙', '丙'][i], String(count)]))]);
    });
  add('simpleplural', 'plural-record-repair', 'transfer', '按完整物品记录定位并修复数量词形冲突',
    '三种已给单数词、各自数量与现有标签 → 找出唯一冲突并改正', '同时保持每行对象、数量与词形对应；额外阅读或定位错误不能单独确定为复数规则失败。', 100, n => {
      const broken = n % 3, rows = [0, 1, 2].map(i => {
        const noun = nouns[(n + i) % nouns.length][0], count = 1 + (n + i) % 4;
        return [String(i + 1), noun, String(count), nounForm(noun, i === broken ? count === 1 ? 2 : 1 : count)];
      });
      return blanks('表内所有名词都采用直接加s的规则复数。只有一行“已有标签”与该行数量不一致，填写行编号和修正后的名词，只写词形。',
        [['row', '需要改正的行编号', String(broken + 1)], ['noun', '正确名词词形', nounForm(rows[broken][1], Number(rows[broken][2]))]],
        `第${broken + 1}行有${rows[broken][2]}个，${Number(rows[broken][2]) === 1 ? '用单数' : '用复数'}，应写${nounForm(rows[broken][1], Number(rows[broken][2]))}；其他行保持。`,
        [table(['行', '给定单数词', '物品数量', '已有标签'], rows)]);
    });
  add('simpleplural', 'plural-container-scope', 'transfer', '区分一个容器内与全部容器中的物品数量',
    '相同容器数量与每个容器内物品数 → 分别判断两种指定范围的词形', '外层容器数不能直接代替单个容器内的物品数，两个范围必须分别核对；综合失误仍需基础独立题反证。', 105, n => {
      const [noun, meaning] = nouns[n % nouns.length], boxes = 2 + n % 3, each = n < 6 ? 1 : 2 + n % 2;
      return blanks(`所有盒子内容相同且记录完整，给定物品单数词${noun}（${meaning}）。分别描述“任意一个盒子里的这种物品”和“全部盒子里合计的这种物品”，两个空位只写名词词形，不写盒子一词或数字。`,
        [['inside', '一个盒子内的物品词形', nounForm(noun, each)], ['all', '全部盒子中物品的词形', nounForm(noun, boxes * each)]],
        `每个盒内${each}个，用${nounForm(noun, each)}；全部${boxes}盒共${boxes * each}个，用${nounForm(noun, boxes * each)}。先确定描述范围，再判断词形。`,
        [table(['记录范围', '数量'], [['外层盒子', String(boxes)], ['每个盒子里的同类物品', String(each)]])]);
    });
  return result;
}

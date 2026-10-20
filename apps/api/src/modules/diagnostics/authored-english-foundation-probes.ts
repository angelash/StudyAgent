import type { MeasurementDimension, QuestionBlock } from '@study-agent/contracts';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'family' | 'dimension'>;
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const table = (headers: string[], rows: string[][]): QuestionBlock => ({ id: 'record', type: 'table', headers, rows });
const blanks = (stem: string, values: Array<[string, string, string]>, analysis: string, blocks?: QuestionBlock[], caseSensitive = true): Task => ({ stem,
  mode: 'multi_blank', answer: values.map(([key, , value]) => ({ key, value })), responseShape: { entries: values.map(([key, label]) => ({ key, label })) },
  gradingConfig: { caseSensitive }, analysis, ...(blocks ? { blocks } : {}) });
const rotate = <T,>(values: T[], n: number) => [...values.slice(n % values.length), ...values.slice(0, n % values.length)];
const phrase = ['Good morning!', 'Good afternoon!', 'Good evening!', 'Goodbye!', 'Good night!', 'Hello!'];
const scenes = ['早上见面，开口问候', '下午见面，开口问候', '晚上见面，开口问候', '正在离开，与对方道别', '准备上床睡觉，互道晚安', '刚见面，对方说Hello，回应问候'];
const names = ['Nora', 'Leo', 'Mia', 'Ben', 'Lily', 'Tom', 'Amy', 'Sam', 'Lucy', 'Mike', 'Eva', 'Max'];
const replyOptions = (index: number, n: number) => rotate([phrase[index], ...[
  [phrase[1], phrase[4]], [phrase[2], phrase[4]], [phrase[0], phrase[4]],
  [phrase[5], phrase[4]], [phrase[0], phrase[3]], [phrase[4], phrase[3]],
][index]], n);

/** Written evidence only. Context, counting and sequence demands remain alternative explanations, not certified causes. */
export function buildEnglishFoundationProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const add = (code: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string,
    distinction: string, seconds: number, make: (index: number) => Task) => result.push({ atomId: `core:english:${code}`, family, dimension,
    behavior, structure, distinction, exercises: Array.from({ length: 12 }, (_, n) => ({ ...make(n), family, dimension, identityVersion: 2, expectedSeconds: seconds })) });

  add('lettercase', 'upper-to-lower', 'understanding', '辨别同一字母的大小写身份',
    '给定大写与候选小写 → 判断是否同一个字母', '沿用既有大小写映射结构，判断形式不增加独立题族。', 45, n => {
      const upper = letters[n * 2], lower = letters[(n * 2 + n % 2) % 26].toLowerCase();
      return { stem: `字母卡“${upper}”与“${lower}”是同一个英文字母的大写和小写形式。这个判断正确吗？`, mode: 'boolean', answer: n % 2 === 0,
        analysis: `${upper}对应的小写是${upper.toLowerCase()}；${lower === upper.toLowerCase() ? '两张卡身份相同。' : `“${lower}”属于另一个字母，不能只按形状接近判断。`}` };
    });
  add('lettercase', 'lower-to-upper', 'procedure', '按要求准确写出大写形式',
    '三张小写卡 → 分别写出大写', '沿用既有反向大小写映射；多空仍为一个结构，严格核对大小写。', 80, n => {
      const lower = [letters[n], letters[n + 5], letters[n + 12]].map(value => value.toLowerCase());
      return blanks(`小写字母卡依次是“${lower.join('、')}”。在三个对应空位分别写出它们的大写字母，每空只填一个大写字母。`,
        lower.map((value, i) => [`letter${i}`, `“${value}”的大写`, value.toUpperCase()]),
        `依次应写${lower.map(value => value.toUpperCase()).join('、')}。这里要求产出大写形式，写回小写不满足要求。`);
    });
  add('lettercase', 'case-code-position-check', 'transfer', '逐位置核对忽略大小写的两位代码',
    '原始两位字母代码与候选标签 → 保持位置逐个核对字母身份', '同时保持两位的先后位置；相同字母的换位不能当作同一代码。', 85, n => {
      const a = letters[n], b = letters[n + 9], c = letters[n + 13], code = a + b.toLowerCase();
      const options = rotate([a.toLowerCase() + b, a + b, b + a.toLowerCase(), a + c.toLowerCase()], n);
      return { stem: `储物盒的两位代码是“${code}”。核对标签时忽略大小写，但两位的先后位置必须不变。哪些标签与原代码一致？选择所有符合的标签。`,
        mode: 'multiple_choice', options, answer: options.filter(value => value.toUpperCase() === code.toUpperCase()),
        blocks: [table(['原代码', '第一位', '第二位'], [[code, a, b.toLowerCase()]])],
        analysis: `应按位置核对为${a}、${b}。${a.toLowerCase() + b}与${a + b}符合；调换位置或换成${c}都改变了代码。` };
    });
  add('lettercase', 'case-finite-card-stock', 'transfer', '归并大小写身份并核对有限卡片库存',
    '每张只能使用一次的卡片记录 → 判断哪些字母组合能够独立凑出', '允许调换卡片位置、忽略大小写，但不能重复使用同一张卡；与逐位置代码核对分别观察。', 100, n => {
      const a = letters[n], b = letters[n + 8], c = letters[n + 14], stock = [a, a.toLowerCase(), b.toLowerCase()];
      const options = rotate([a + a, a + b, b + b, a + c], n);
      return { stem: `只有下表这三张字母卡。每次尝试一个组合时从完整库存重新开始，可以调换卡片顺序并忽略大小写，每张卡最多用一次。哪些组合能够凑出？选择所有符合的组合。`,
        mode: 'multiple_choice', options, answer: options.filter(value => value === a + a || value === a + b),
        blocks: [table(['卡片编号', '卡上的字母'], stock.map((value, i) => [String(i + 1), value]))],
        analysis: `库存中${a}类有两张、${b}类只有一张，没有${c}类。${a + a}和${a + b}能分别凑出；不能把同一张${b}卡用两次。` };
    });

  add('alphabet', 'alphabet-next', 'understanding', '核对相邻关系且字母表不循环',
    '给定下一字母主张 → 检查顺序及终点', '沿用既有向后相邻结构，判断与端点反例不另计新结构。', 50, n => {
      const start = n >= 10 ? 'Z' : letters[n + 1], claim = n === 11 ? '没有后一个字母' : n === 10 ? 'A' : letters[n + 2 + n % 2];
      const correct = n === 11 || n < 10 && n % 2 === 0;
      return { stem: `按A到Z的字母表顺序，判断“${n === 11 ? 'Z后面没有相邻字母' : `${start}后面紧邻的是${claim}`}”是否正确。字母表到Z结束，不循环。`, mode: 'boolean', answer: correct,
        analysis: start === 'Z' ? `Z是字母表的终点，后面没有字母，不能从Z绕回A。` : `${start}后紧邻${letters[letters.indexOf(start) + 1]}，不能跳过中间字母。` };
    });
  add('alphabet', 'alphabet-previous', 'procedure', '分别恢复前后相邻字母',
    '给定中间字母 → 填写前一个与后一个', '沿用相邻字母提取结构；两个空位不算两个新结构，端点用规定的“无”记录。', 75, n => {
      const center = n === 10 ? 0 : n === 11 ? 25 : n + 2, previous = center ? letters[center - 1] : '无', next = center < 25 ? letters[center + 1] : '无';
      return blanks(`按A到Z的顺序，填写字母${letters[center]}前面紧邻和后面紧邻的字母。字母用大写；字母表不循环，没有相邻字母的空位统一填“无”。`,
        [['previous', '前一个', previous], ['next', '后一个', next]], `${letters[center]}前面是${previous}，后面是${next}。A之前、Z之后都不能绕回另一端。`);
    });
  add('alphabet', 'alphabet-one-card-repair', 'transfer', '在一次允许移动内恢复字母队列',
    '打乱的连续三张字母卡与移动限制 → 找到唯一可移动卡', '需要同时满足完整队列顺序与移动位置限制，不只是填写一个已知相邻字母。', 85, n => {
      const ordered = letters.slice(n + 1, n + 4).split(''), front = n % 2 === 0;
      const shown = front ? [ordered[1], ordered[2], ordered[0]] : [ordered[2], ordered[0], ordered[1]], answer = front ? ordered[0] : ordered[2];
      return { stem: `三张连续字母卡当前从左到右是“${shown.join('、')}”。要按A到Z的先后顺序排好，只允许把一张卡移到队${front ? '首' : '尾'}，其余两张的相对次序不变。应移动哪一张？`,
        mode: 'single_choice', options: rotate([...ordered], n), answer,
        analysis: `正确顺序是${ordered.join('、')}。把${answer}移到队${front ? '首' : '尾'}后正好满足，另外两张的相对顺序保持。` };
    });
  add('alphabet', 'alphabet-hidden-route', 'transfer', '根据终点与方向记录反推起点和中间状态',
    '最终字母与三条相邻移动指令 → 恢复起点及第二步状态', '必须按记录逐步核对；前/后方向固定且不跨A、Z，不由综合失败确定记忆或语言根因。', 100, n => {
      const moves = [[1, 1, -1], [1, -2, -1], [-1, 2, 1], [-1, -1, 1]][n % 4], start = 5 + n, trace = [start];
      for (const move of moves) trace.push(trace.at(-1)! + move);
      const records = moves.map((move, i) => [String(i + 1), `向${move > 0 ? '后' : '前'}移动${Math.abs(move)}个字母`]);
      return blanks(`按A到Z，向后表示朝Z方向，向前表示朝A方向。某人从一个未记录的字母出发，严格执行下表三步后停在${letters[trace[3]]}。全程不跨越A或Z。填写起点字母和第二步结束时的字母，均用大写。`,
        [['start', '起点字母', letters[start]], ['afterTwo', '第二步结束时', letters[trace[2]]]],
        `逐步记录为${trace.map(index => letters[index]).join('→')}，所以起点${letters[start]}，第二步结束在${letters[trace[2]]}。`, [table(['步骤', '指令'], records)]);
    });

  add('greeting', 'greeting-time', 'understanding', '结合时段与交际意图辨别表达',
    '一个明确情境与一个候选表达 → 判断是否适用', '沿用既有问候时段结构，场景变体不增加题族。', 55, n => {
      const index = n % 6, offered = n < 6 ? phrase[index] : [phrase[4], phrase[0], phrase[0], phrase[5], phrase[0], phrase[3]][index];
      return { stem: `${names[n]}当前的情境是“${scenes[index]}”。使用“${offered}”作为此刻的回应是否合适？`, mode: 'boolean', answer: n < 6,
        analysis: `要同时核对时段和交际意图。这里适用${phrase[index]}，不能把见面问候、离开道别和睡前祝语混用。` };
    });
  add('greeting', 'greeting-response', 'procedure', '把交际行为与合适回应完整配对',
    '三段清楚区分的见面/离开/睡前情境 → 完整匹配回应', '沿用既有回应结构，多项配对不额外计独立结构。', 85, n => {
      const contexts = [`${names[n]}刚见面，对方说Hello!`, `${names[n]}正离开教室，与同伴道别`, `${names[n]}要上床睡觉，互道晚安`];
      const labels = ['Hello!', 'Goodbye!', 'Good night!'], left = rotate(contexts.map((label, i) => ({ id: `scene${i}`, label })), n);
      return { stem: `为${names[n]}的三个不同交际情境分别选择合适回应，每个回应使用一次。`, mode: 'matching',
        responseShape: { left, right: rotate(labels.map((label, i) => ({ id: `reply${i}`, label })), n + 1) },
        answer: { pairs: contexts.map((_, i) => ({ left: `scene${i}`, right: `reply${i}` })) },
        analysis: `回应见面问候用Hello!；离开时道别用Goodbye!；上床前互道晚安用Good night!。先识别交际行为，再匹配回应。` };
    });
  add('greeting', 'greeting-dialogue-repair', 'transfer', '从多轮情境记录中找出唯一不合适的回应并改正',
    '三条不同情境回应记录 → 定位唯一冲突 → 从给定语句中替换', '必须逐行核对时段与行为，而非直接给某时段贴词；替换按提供语句填写以避免同义表述误判。', 105, n => {
      const base = n % 2 ? [1, 3, 4] : [0, 2, 5], indices = n >= 6 ? [...base].reverse() : base, broken = n % 3;
      const rows = indices.map((index, i) => [String(i + 1), scenes[index], phrase[index]]);
      // Every replacement has a conflicting time or speech act; none competes with another valid greeting.
      const wrong = { 0: phrase[4], 1: phrase[0], 2: phrase[0], 3: phrase[5], 4: phrase[0], 5: phrase[3] };
      rows[broken][2] = wrong[indices[broken] as keyof typeof wrong];
      return blanks(`下表记录${names[n]}的三次交际，其中只有一行的回应不合适。填写该行编号，再从“${replyOptions(indices[broken], n).join(' / ')}”中照写替换语句，保留感叹号。`,
        [['row', '需要改正的行编号', String(broken + 1)], ['reply', '替换语句', phrase[indices[broken]]]],
        `第${broken + 1}行的情境是${scenes[indices[broken]]}，应改为${phrase[indices[broken]]}；其他行与情境一致。`, [table(['行', '此刻情境', '已写回应'], rows)], false);
    });
  add('greeting', 'greeting-updated-event', 'transfer', '用最新事件核对当前时段与回应目的',
    '旧安排与明确更新 → 选择现在实际应说的话', '旧安排提供可被排除的线索，必须以更新后的交际行为为依据；不把额外阅读负担判成确定语言根因。', 90, n => {
      const now = n % 6, old = (now + (n < 6 ? 3 : 4)) % 6;
      return { stem: `记录原先写“${scenes[old]}”，随后已明确更新为“${scenes[now]}”。${names[n]}现在应按更新后的实际情境回应。下列哪一句合适？`,
        mode: 'single_choice', options: replyOptions(now, n), answer: phrase[now],
        blocks: [table(['记录顺序', '情境'], [['旧安排（已被更新）', scenes[old]], ['最新实际事件', scenes[now]]])],
        analysis: `当前依据是${scenes[now]}，选择${phrase[now]}。旧安排已经更新，不能继续据此决定回应。` };
    });
  return result;
}

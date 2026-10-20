import type { MeasurementDimension, QuestionBlock } from '@study-agent/contracts';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'family' | 'dimension'>;
const names = ['小禾', '小林', '小雨', '小文', '小宁', '小安', '小川', '小贝', '小晴', '小乐', '小星', '小满'];
const rotate = <T,>(values: readonly T[], n: number) => [...values.slice(n % values.length), ...values.slice(0, n % values.length)];
const table = (headers: string[], rows: string[][]): QuestionBlock => ({ id: 'record', type: 'table', headers, rows });
const choice = (stem: string, answer: string, options: string[], analysis: string, blocks?: QuestionBlock[]): Task => ({ stem, answer,
  options: rotate([...new Set([answer, ...options])], stem.length), mode: 'single_choice', analysis, ...(blocks ? { blocks } : {}) });
const blanks = (stem: string, values: Array<[string, string, string]>, analysis: string, blocks?: QuestionBlock[]): Task => ({ stem,
  answer: values.map(([key, , value]) => ({ key, value })), mode: 'multi_blank', responseShape: { entries: values.map(([key, label]) => ({ key, label })) }, analysis,
  ...(blocks ? { blocks } : {}) });
const writtenRubric = [{ criterion: '判断明确且有材料细节支持', weight: 0.4 }, { criterion: '说明细节与判断之间的联系', weight: 0.3 },
  { criterion: '语言完整通顺，不添加无依据信息', weight: 0.3 }];
const written = (stem: string, answer: string, blocks?: QuestionBlock[]): Task => ({ stem, answer, mode: 'short_answer', rubric: writtenRubric,
  analysis: `参考表达：${answer}。量规核对判断、证据及二者联系；合理同义表述可接受。`, ...(blocks ? { blocks } : {}) });
const oralRubric = [{ criterion: '区分可观察事实和原因解释', weight: 0.4 }, { criterion: '原因与依据对应，说明合理联系', weight: 0.3 },
  { criterion: '关键内容可听清；允许自然停顿和自我修正且不因口音差异扣分', weight: 0.3 }];
const audio = (stem: string, answer: string, analysis: string, blocks?: QuestionBlock[]): Task => ({ stem: `${stem} 请录音回答，可先试听，最长3分钟。`, answer,
  mode: 'audio_record', responseShape: { mediaPolicy: 'student-media-v1' }, rubric: oralRubric, analysis, ...(blocks ? { blocks } : {}) });

const ids = { locate: 'foundation:chinese:g4-locate', cause: 'foundation:chinese:g4-cause', contrast: 'core:chinese:contrast', chain: 'core:chinese:reference-chain',
  inference: 'core:chinese:inference', order: 'core:chinese:observation-order', comparison: 'core:chinese:comparison-method', numbers: 'core:chinese:numbers-method',
  emotion: 'core:chinese:emotion-evidence', letter: 'core:chinese:letter-format', redundancy: 'core:chinese:remove-redundancy',
  explanation: 'core:chinese:evidence-explanation', oral: 'core:chinese:oral-explain' };

export function buildChineseGrade4ProbeFamilies(): AuthoredProbeFamily[] {
  const families: AuthoredProbeFamily[] = [];
  const add = (atomId: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string, distinction: string,
    seconds: number, make: (n: number) => Task) => families.push({ atomId, family, dimension, behavior, structure, distinction,
    exercises: Array.from({ length: 12 }, (_, n) => { const task = make(n); return { ...task,
      stem: `${names[n]}的四年级${['阅读记录', '说明材料', '校对清单', '迁移任务'][n % 4]}：${task.stem}`,
      family, dimension, identityVersion: 2, expectedSeconds: seconds }; }) });

  add(ids.locate, 'locate-structure-0', 'understanding', '在同人物多事件中定位指定动作地点', '包含无关经历的短材料 → 指定动作地点', '先找到所问动作，不能用人物最初停留的位置。', 55, n => {
    const place = ['图书馆', '实验室', '礼堂', '花园'][n % 4], action = ['查阅资料', '观察标本', '排练合唱', '记录植物'][n % 4]; return choice(`${names[n]}先经过走廊，随后在${place}${action}。${action}发生在哪里？`, place,
      ['走廊', '校门口', '教室'], `${action}与${place}直接相连；走廊只表示经过。`);
  });
  add(ids.locate, 'locate-structure-1', 'procedure', '从两张活动记录填写各自地点', '两条带时间的活动 → 两个地点字段', '时间与活动必须成对保留。', 85, n => {
    const a = ['图书馆', '教室'][n % 2], b = ['花园', '实验室'][n % 2]; return blanks('根据上午和下午记录分别填写地点。', [['am', '上午', a], ['pm', '下午', b]],
      `上午在${a}，下午在${b}；两个时间不能互换。`, [table(['时段', '材料'], [['上午', `在${a}查资料`], ['下午', `在${b}做观察`]])]);
  });
  add(ids.locate, 'locate-updated', 'transfer', '依据最新通知排除旧地点', '原地点与更新通知 → 当前地点', '旧地点已被最新通知替换，保留时间和新地点两个条件。', 85, n => {
    const old = ['东楼', '旧礼堂'][n % 2], latest = ['西楼三层', '新活动室'][n % 2]; return choice(`活动原定${old}，最新通知改为${latest}。现在去哪里？`, latest,
      [old, '两处都去', '没有地点'], `最新通知替代原地点，只选择${latest}。`, [table(['版本', '地点'], [['原通知', old], ['最新通知', latest]])]);
  });
  add(ids.locate, 'locate-multi', 'transfer', '在完整活动表中筛选指定地点全部记录', '四条人物地点动作记录 → 所有匹配活动', '需要检查全部行，地点关系和活动名称一并保留。', 105, n => {
    const target = ['图书馆', '实验室'][n % 2], rows = [0, 1, 2, 3].map(i => [names[(n + i) % 12], i % 2 ? target : ['操场', '教室'][i % 2], `${['查资料', '观察', '排练', '整理'][i]}${n}`]);
    return { stem: `选择所有在${target}发生的活动。`, mode: 'multiple_choice', options: rows.map(row => row[2]), answer: rows.filter(row => row[1] === target).map(row => row[2]),
      blocks: [table(['人物', '地点', '活动'], rows)], analysis: `只选地点列为${target}的活动，其他行地点不同。` };
  });

  const causes = [['路面积水', '活动改到室内'], ['器材损坏', '暂停实验'], ['资料缺页', '补查原书'], ['风太大', '收起展板'], ['光线不足', '打开台灯'], ['人数增加', '增加座位'],
    ['材料受潮', '重新晾干'], ['雾很浓', '推迟出发'], ['水壶空了', '重新装水'], ['标签磨损', '重新标写'], ['场地狭窄', '分组活动'], ['噪声太大', '换到安静教室']] as const;
  add(ids.cause, 'cause-syntax-0', 'understanding', '区分明确因果句中的原因', '原因结果短句 → 原因事实', '原因和结果方向不能颠倒。', 55, n => {
    const [why, result] = causes[n]; return choice(`由于${why}，${result}。哪项是原因？`, why, [result, '两者都是结果', '没有原因'], `${why}是先发条件，${result}是随后变化。`);
  });
  add(ids.cause, 'cause-syntax-1', 'procedure', '恢复三条结果的直接原因', '完整材料与结果表 → 三项原因', '多个因果链不能交叉复用。', 90, n => {
    const selected = [0, 4, 8].map(i => causes[(n + i) % 12]); return blanks('按完整材料填写每个结果的直接原因。', selected.map(([why], i) => [`c${i}`, `结果${i + 1}`, why]),
      selected.map(([why, result]) => `${result}源于${why}`).join('；') + '。', [table(['记录', '完整材料'], selected.map(([why, result], i) => [String(i + 1), `${why}导致${result}`]))]);
  });
  add(ids.cause, 'cause-direction', 'transfer', '从连续结果中恢复中间原因', '两段连续因果 → 指定结果直接原因', '不能越过中间结果回到更早条件。', 95, n => {
    const chains = [['纸张受潮', '字迹模糊', '重新誊写'], ['零件短缺', '装配停止', '补领零件'], ['座位不足', '增加椅子', '调整空间'], ['地面湿滑', '放置标牌', '清理地面']]; const [a, b, c] = chains[n % 4];
    return choice(`材料记录“${a}导致${b}，因此${c}”。“${c}”的直接前因是什么？`, b, [a, c, '没有前因'], `${b}直接引发${c}；${a}只解释${b}。`);
  });
  add(ids.cause, 'cause-repair', 'transfer', '修复表中颠倒的因果方向', '三条因果输入 → 找出颠倒行与正确原因', '需要重新建立起点和结果关系。', 110, n => {
    const broken = n % 3, selected = [0, 4, 8].map(i => causes[(n + i) % 12]); const rows = selected.map(([why, result], i) => [String(i + 1), i === broken ? `${result}导致${why}` : `${why}导致${result}`]);
    return blanks('下表只有一行因果颠倒，填写行号和正确原因。', [['row', '颠倒行', String(broken + 1)], ['cause', '正确原因', selected[broken][0]]],
      `第${broken + 1}行应为${selected[broken][0]}导致${selected[broken][1]}。`, [table(['行', '材料'], rows)]);
  });

  const contrasts = [['路远', '按时到达'], ['题难', '没有放弃'], ['天气冷', '继续训练'], ['时间紧', '核对了步骤'], ['条件有限', '完成任务'], ['很疲惫', '坚持整理'],
    ['声音不大', '表达清楚'], ['模型很小', '结构完整'], ['雨很大', '行程继续'], ['材料普通', '设计新颖'], ['经验不足', '认真请教'], ['工具简单', '结果可靠']] as const;
  add(ids.contrast, 'although-but-focus', 'understanding', '辨认转折句强调的后半事实', '虽然后半转折句 → 重点事实', '转折后不能因此否认前半已经承认的条件。', 55, n => {
    const [limit, result] = contrasts[n]; return choice(`“虽然${limit}，但是${result}。”句子重点强调什么？`, result, [limit, '困难不存在', '两句意思相同'], `${limit}作为让步条件，转折后强调的是${result}。`);
  });
  add(ids.contrast, 'but-condition', 'procedure', '分别填写让步条件与转折重点', '三个转折句 → 两字段', '前后两项事实都必须被保留。', 90, n => {
    const selected = [0, 4, 8].map(i => contrasts[(n + i) % 12]); return blanks('为每句填写让步条件和转折后的重点事实。', selected.flatMap(([limit, result], i) => [[`l${i}`, `句${i + 1}让步`, limit], [`r${i}`, `句${i + 1}重点`, result]]),
      selected.map(([limit, result], i) => `第${i + 1}句承认${limit}，重点仍是${result}`).join('；') + '。', [table(['记录', '转折句'], selected.map(([limit, result], i) => [String(i + 1), `虽然${limit}，但是${result}`]))]);
  });
  add(ids.contrast, 'but-focus', 'transfer', '按转折连接词更新句子表达重点', '同一事实与不同连接方式 → 判断重点', '连接词变化会改变语义重心。', 95, n => {
    const [limit, result] = contrasts[(n + 3) % 12]; return choice(`“${limit}，因此${result}”与“虽然${limit}，但是${result}”相比，后一句突出的重点是什么？`, result,
      [limit, '因果关系', '没有任何重点'], `后一句通过“虽然……但是……”承认${limit}，更突出${result}。`);
  });
  add(ids.contrast, 'contrast-repair', 'transfer', '修复转折记录中的唯一方向错误', '三行让步/重点记录 → 定位错行并修正重点', '先辨连接方式，再找转折后的事实。', 110, n => {
    const broken = n % 3, selected = [0, 4, 8].map(i => contrasts[(n + i) % 12]); const rows = selected.map(([limit, result], i) => [String(i + 1), limit, i === broken ? limit : result]);
    return blanks('下表只有一行把让步条件误写成重点，填写行号和正确重点。', [['row', '错误行', String(broken + 1)], ['focus', '正确重点', selected[broken][1]]],
      `第${broken + 1}行转折后的事实是${selected[broken][1]}。`, [table(['行', '让步条件', '已有重点'], rows)]);
  });

  const handoffs = [['地图', '小禾', '小林'], ['钥匙', '老师', '小安'], ['画册', '小晴', '小乐'], ['模型', '小宁', '小文'], ['种子', '小林', '小雨'], ['借书卡', '小贝', '小满'],
    ['尺子', '小川', '小星'], ['水壶', '小文', '小禾'], ['信封', '小雨', '小宁'], ['球拍', '小安', '小晴'], ['地图夹', '小乐', '小贝'], ['工具箱', '小满', '小川']] as const;
  add(ids.chain, 'recipient-chain', 'understanding', '追踪人物交接后的动作主体', '两人交接物品 → 后续动作承担者', '代词由动作语义与交接关系共同确定。', 55, n => {
    const [object, sender, receiver] = handoffs[n]; return choice(`${sender}把${object}交给${receiver}，请他收好。谁负责收好${object}？`, receiver, [sender, object, '没有人'],
      `${receiver}是接收者，“他”在这一动作中指向${receiver}。`);
  });
  add(ids.chain, 'object-chain', 'procedure', '分别恢复人物与物品代词指向', '跨句交接材料 → “他/它”字段', '人物代词和物品代词不能混用。', 90, n => {
    const [object, sender, receiver] = handoffs[(n + 2) % 12]; return blanks(`${sender}把${object}交给${receiver}，提醒他检查它。填写“他”和“它”的指向。`,
      [['person', '“他”指', receiver], ['object', '“它”指', object]], `“他”指收物者${receiver}，“它”指物品${object}。`);
  });
  add(ids.chain, 'chain-update', 'transfer', '在第二次交接后更新代词对象', '物品经两次转手 → 最终持有者', '需要按事件顺序而不是按最近句子机械匹配。', 100, n => {
    const first = names[n], middle = names[(n + 4) % 12], last = names[(n + 8) % 12], object = ['地图', '钥匙', '画册'][n % 3];
    return choice(`${object}先由${first}交给${middle}，后来${middle}又把它交给${last}。现在“它”在谁那里？`, last, [first, middle, object],
      `${object}经历两次交接，最终持有者是${last}；第一次接收者已被后续事件更新。`, [table(['次序', '发出者', '接收者'], [['第一次', first, middle], ['第二次', middle, last]])]);
  });
  add(ids.chain, 'ambiguous-boundary', 'transfer', '在候选不足时保留指代未定', '两个同性别候选与代词 → 判断是否需要改写', '两个候选都能匹配代词时必须保留未定，并要求明确姓名。', 95, n => {
    const a = names[n], b = names[(n + 3) % 12]; return choice(`${a}和${b}都拿着地图。有人只说“他会先走”。仅根据这句话能确定是谁吗？`, '不能确定，需要写出姓名',
      [`一定是${a}`, `一定是${b}`, '指地图'], '两个候选都可用“他”，材料不足以唯一确定，只能要求明确姓名。');
  });

  const clues = [['额头冒汗、拿着跑步号码牌', '刚参加跑步活动', '一定得了第一'], ['反复练台词、演出前背词', '重视这次演出', '一定从不紧张'], ['书页磨损、旁边有读书笔记', '这本书被多次阅读', '他读过所有书'],
    ['桌面整理有序、材料有编号', '这次准备有次序', '他永远都不丢东西'], ['鞋底沾泥、手中有植物记录表', '刚进行户外观察', '活动一定很危险'], ['窗台有水迹、杯子倒在旁边', '水可能从杯子洒出', '是谁碰倒的已确定'],
    ['座位旁有湿伞、衣服也湿了', '可能刚遇到下雨', '今天雨一定下了整天'], ['照片中有两人举着同一模型', '他们一起展示模型', '两人是亲兄弟'], ['板上有多次修改痕迹', '方案经过反复调整', '最终方案一定最好'],
    ['水壶已经空了、记录表写着上午喝完', '上午确实消耗了一壶水', '下午一定没有水'], ['模型缺少一颗螺丝、旁人正在找零件', '缺少零件可能影响装配', '螺丝一定被同学藏起'], ['地面有脚印、门口刚下过雨', '脚印可能与雨水有关', '脚印一定属于老师']] as const;
  add(ids.inference, 'evidence-limited-event', 'understanding', '从明确线索作有限事件推断', '动作与物证 → 有依据的有限推断', '不能补充材料未说明的结果。', 55, n => {
    const [evidence, inference] = clues[n]; return choice(`材料只写“${evidence}”。哪项是较有根据的有限推断？`, inference, ['材料可以解释所有情况', '完全无法推断', clues[(n + 2) % 12][2]],
      `${evidence}直接支持“${inference}”，但不能证明更强或材料外结果。`);
  });
  add(ids.inference, 'evidence-limited-attitude', 'procedure', '区分可推断态度与确定动机', '三条行为和语言记录 → 写有限结论', '结论只能描述有证据的态度或状态。', 95, n => {
    const selected = [0, 4, 8].map(i => clues[(n + i) % 12]); return blanks('根据每项线索填写最稳妥的有限推断。', selected.map(([evidence, inference], i) => [`i${i}`, `第${i + 1}项线索`, inference]),
      selected.map(([evidence, inference]) => `${evidence}支持${inference}`).join('；') + '。', [table(['记录', '线索'], selected.map(([evidence], i) => [String(i + 1), evidence]))]);
  });
  add(ids.inference, 'unknown-boundary', 'transfer', '确认材料无法确定的信息', '观察事实与候选未知问题 → 选择无法确定项', '可确认事实不等于可确认原因。', 90, n => {
    const [evidence] = clues[n]; return choice(`材料只记录“${evidence}”。哪项仍无法仅凭这些确定？`, clues[(n + 1) % 12][2], ['直接观察到的现象', '可见物品', '文字记录'],
      `材料提供的是可见线索，不能据此确定${clues[(n + 1) % 12][2]}这类更强结论。`);
  });
  add(ids.inference, 'inference-repair', 'transfer', '修复过度推断表唯一结论', '线索与已有推断 → 定位超出证据项并改正', '需要把强断言改为有限推断。', 110, n => {
    const broken = n % 3, selected = [0, 4, 8].map(i => clues[(n + i) % 12]); const rows = selected.map((base, i) => [String(i + 1), base[0], i === broken ? base[2] : base[1]]);
    return blanks('下表只有一行推断超出材料证据，填写行号和更稳妥的推断。', [['row', '错误行', String(broken + 1)], ['inference', '有限推断', selected[broken][1]]],
      `第${broken + 1}行只能支持“${selected[broken][1]}”，原结论超出材料。`, [table(['行', '线索', '已有推断'], rows)]);
  });

  const routes = [['先看脚边小草，再看前方池塘', '由近到远'], ['从树梢写到树根', '从上到下'], ['远处山峰写起，再写眼前小桥', '由远到近'], ['从门口走进院子，再进入大厅', '地点转换'],
    ['先写天空云层，再写地面人群', '从上到下'], ['先看河岸，再看河心，最后看对岸', '由近到远'], ['从后院返回前门', '地点转换'], ['先在近处观察花朵，再抬头看远处山景', '由近到远'],
    ['先记录屋顶，再记录窗户和台阶', '从上到下'], ['依次描述北端、中央和南端', '按方位顺序'], ['从山顶向下写到山谷', '从上到下'], ['先写院外，再走进院内', '由外到内']] as const;
  add(ids.order, 'near-far', 'understanding', '识别由近到远的观察顺序', '位置连续移动 → 空间顺序', '方位词必须形成完整序列。', 55, n => {
    const [desc, order] = routes[n]; return choice(`“${desc}。”采用什么观察顺序？`, order, ['按照人物年龄', '按照数字大小', '没有顺序'], `描述位置依次变化，形成${order}的观察路径。`);
  });
  add(ids.order, 'vertical-order', 'procedure', '恢复三处位置呈现的顺序', '路线描述 → 填写第一和最后位置', '首尾位置根据路径变化确定。', 90, n => {
    const [desc, order] = routes[n], parts = desc.replace('先', '').split(/，再|，然后|最后/).filter(Boolean); return blanks('填写描述中的第一和最后观察位置。', [['first', '第一位置', parts[0]], ['last', '最后位置', parts.at(-1)!]],
      `路径按${order}展开，首处是${parts[0]}，末处是${parts.at(-1)}。`);
  });
  add(ids.order, 'route-update', 'transfer', '依据更新路线改变观察顺序', '原路线与明确更新 → 当前第一处', '最新路线完整替代原起点和后续观察方向。', 90, n => {
    const [desc] = routes[n], updated = `${names[n]}的最新路线写“先看远处山景，再看脚边花朵”。按更新后的路线，第一处观察是什么？`; return choice(updated, '远处山景', ['脚边花朵', '校门口', '无法判断'],
      '最新路线明确先看远处山景；原记录中的起点不再采用。', [table(['版本', '起点'], [['原路线', desc.split('，')[0]], ['最新路线', '远处山景']])]);
  });
  add(ids.order, 'route-evidence', 'transfer', '用连续位置词核对整体顺序', '路线句与候选顺序 → 选择连续变化项', '不能只凭一个方位词确定全段顺序。', 100, n => {
    const [desc, order] = routes[n]; return choice(`能从“${desc}”确认的完整顺序是？`, order, ['只有第一地点，没有后续', '所有位置同时出现', '顺序由物品颜色决定'],
      `句中有连续位置变化，因此可以判断为${order}。`);
  });

  const comparisons = [['这棵树比旁边的树高一倍', '作比较', '列数字'], ['新电池使用时间是旧电池的两倍', '作比较', '拟人'], ['这座桥比旧桥长五十米', '作比较', '反问'], ['这个盒子比那个轻一半', '作比较', '设问'],
    ['今年的水量比去年少三成', '作比较', '夸张'], ['跑步比骑车多用了十分钟', '作比较', '排比'], ['新方案比原方案少两个步骤', '作比较', '比喻'], ['左袋比右袋重二百克', '作比较', '反复'],
    ['这间教室比隔壁宽两米', '作比较', '引用'], ['旧机器比新机器多耗一度电', '作比较', '拟人'], ['甲队比乙队早到十分钟', '作比较', '列数字'], ['今天的温度比昨天低五度', '作比较', '设问']] as const;
  add(ids.comparison, 'explicit-comparison', 'understanding', '识别带有比较对象的说明句', '两对象与同一维度 → 说明方法', '仅出现两个对象不等于完成比较。', 55, n => {
    const [sentence, method, wrong] = comparisons[n]; return choice(`“${sentence}。”主要运用什么说明方法？`, method, [wrong, '下定义', '作假设'], `句子在同一维度比较两个对象，属于${method}。`);
  });
  add(ids.comparison, 'method-select', 'procedure', '从多个句子选择完整作比较句', '短句库存 → 找出全部比较句', '需要同时有基准对象、比较词和维度。', 90, n => {
    const answer = comparisons[(n + 2) % 12][0], decoys = ['桥很坚固', '电池可以反复使用', '盒子放在桌上']; return { stem: '选择所有通过两个对象对照说明特点的句子。', mode: 'multiple_choice',
      options: rotate([answer, ...decoys], n), answer: [answer], analysis: '只有给出两个对象及同一比较维度的句子完成作比较。' };
  });
  add(ids.comparison, 'comparison-parameter', 'transfer', '恢复比较对象、维度与结果', '明确比较句 → 三个字段', '不能把比较结果推广到未比较属性。', 100, n => {
    const [sentence] = comparisons[n]; return blanks(`句子“${sentence}”说明两个对象在同一属性上的差异。填写比较结论。`, [['method', '说明方法', '作比较'], ['scope', '结论只描述这一属性', '是']],
      `本句只说明一个比较属性；不能据此推断其他属性也相同或不同。`);
  });
  add(ids.comparison, 'comparison-repair', 'transfer', '修复比较记录中唯一无效推断', '观察句与已有推断 → 找过度推广项并改正', '比较只支持同一维度内的结论。', 110, n => {
    const broken = n % 3, selected = [0, 4, 8].map(i => comparisons[(n + i) % 12]); const rows = selected.map(([sentence], i) => [String(i + 1), sentence, i === broken ? '比较结果可证明所有方面都更好' : '比较只说明同一属性差异']);
    return blanks('下表只有一行的结论超出比较范围，填写行号与稳妥结论。', [['row', '错误行', String(broken + 1)], ['claim', '稳妥结论', '比较只说明同一属性差异']],
      `第${broken + 1}行只能支持该属性的对照，不能推广到所有方面。`, [table(['行', '比较句', '已有推断'], rows)]);
  });

  const numeric = [['塔高三十米，共七层', '具体说明高度和层数'], ['车站有二十个检票口', '具体说明检票口数量'], ['树龄约二百年', '具体说明估计树龄'], ['水深五米', '具体说明深度'],
    ['步道长八百米', '具体说明长度'], ['展厅面积为四百平方米', '具体说明面积'], ['该样品重二百克', '具体说明质量'], ['活动持续九十分钟', '具体说明时长'],
    ['书架分为五层', '具体说明层数'], ['水面温度为十二摄氏度', '具体说明温度'], ['模型比例是一比五十', '说明比例'], ['参观人数约六百人', '说明人数']] as const;
  add(ids.numbers, 'number-function', 'understanding', '解释数字在说明中的具体作用', '对象+单位+数值 → 支持哪项说明', '数字需与对象和单位一起解释。', 55, n => {
    const [sentence, functionText] = numeric[n]; return choice(`“${sentence}。”其中的数字主要起什么作用？`, functionText, ['证明个人喜好', '让语句更短', '代替全部结论'],
      `数字与明确对象、单位相连，作用是${functionText}；不能超出所测属性。`);
  });
  add(ids.numbers, 'number-select', 'procedure', '从候选句中选择使用具体数字的句子', '三个句子 → 找出全部列数字表达', '列出并无对象单位的单个数字不算说明。', 85, n => {
    const answer = numeric[(n + 2) % 12][0], decoys = ['桥非常坚固', '树很古老', '活动很热闹']; return { stem: '选择所有使用具体数量和单位来说明特征的句子。', mode: 'multiple_choice',
      options: rotate([answer, ...decoys], n), answer: [answer], analysis: '只有给出被说明对象和具体数值单位的句子属于列数字。' };
  });
  add(ids.numbers, 'number-update', 'transfer', '采用最新测量值而不沿用过时数字', '旧值与最新核对值 → 当前数值', '更新测量只改变对应属性。', 90, n => {
    const [sentence] = numeric[n], latest = `${sentence}（最新核对值保持不变，单位为原单位）`; return choice(`旧记录为“${sentence}”，最新核对确认数字为原来的两倍但其他对象单位不变。应怎样更新？`, '只把对应数值改为两倍，对象和单位保留',
      ['删除对象和单位', '保留旧值不更新', '把单位换成人'], '更新测量必须保留对象和单位，只替换对应数值；不能改变属性范围。', [table(['版本', '记录'], [['旧', sentence], ['更新原则', '只替换数值，对象/单位不变']])]);
  });
  add(ids.numbers, 'number-boundary', 'transfer', '按数字所在对象和单位核对支持范围', '数字说明和候选结论 → 选择没有过度推广的解释', '一个数字只支持对应对象、属性和单位。', 90, n => {
    const [sentence, functionText] = numeric[n]; return choice(`“${sentence}”能直接支持哪项结论？`, functionText, ['它可以证明对象最美', '它能证明所有条件可靠', '它能证明个人感受'],
      `数字只支持“${functionText}”这一具体说明，不自动证明质量或主观评价。`);
  });

  const emotions = [['看到小树发芽，他笑着说“太好了”', '高兴', '一直都很乐观'], ['得知比赛取消，她低头说“真可惜”', '失落', '从此不再比赛'], ['握着结果单反复踱步', '可能紧张，但仍需更多线索', '一定害怕'],
    ['收到礼物后笑着道谢', '感谢和高兴', '总喜欢所有礼物'], ['伙伴摔倒后马上扶起并询问', '关心', '他永远都不会害怕'], ['面对批评先记下再核对', '愿意改进', '立刻完全改正'],
    ['读到结局时轻轻叹气', '可能有遗憾或感慨', '讨厌整本书'], ['听到队伍获胜后与同伴击掌', '兴奋', '以后一定每次都赢'], ['约好的活动被取消后沉默', '可能失望', '对任何活动都无兴趣'],
    ['实验成功后与同伴整理器材', '高兴且负责', '所有实验都会成功'], ['看到旧照片笑了笑', '可能回忆起愉快经历', '照片一定来自童年'], ['面对新任务皱眉后开始列步骤', '可能有压力但开始行动', '一定不能完成']] as const;
  add(ids.emotion, 'emotion-dialogue', 'understanding', '从动作和话语推断当时情感', '动作+原话 → 有依据情感', '情感判断限定在当时情境。', 55, n => {
    const [evidence, emotion] = emotions[n]; return choice(`材料写“${evidence}”。较有依据的当时情感是？`, emotion, ['确定且永久的性格', '材料没有动作', '与情境无关'],
      `${evidence}直接支持${emotion}；不能扩大成长久性格或未来表现。`);
  });
  add(ids.emotion, 'emotion-uncertainty', 'procedure', '保留单一动作带来的解释不确定性', '三个动作记录 → 有限情感判断', '同一动作可能有多种解释。', 95, n => {
    const selected = [0, 4, 8].map(i => emotions[(n + i) % 12]); return blanks('为每项动作填写最稳妥的情感判断。', selected.map(([evidence, emotion], i) => [`e${i}`, `第${i + 1}项`, emotion]),
      selected.map(([evidence, emotion]) => `${evidence}较支持${emotion}`).join('；') + '，但不能据此确定固定性格。', [table(['记录', '动作与话语'], selected.map(([evidence], i) => [String(i + 1), evidence]))]);
  });
  add(ids.emotion, 'emotion-update', 'transfer', '按后续事件更新人物当前情感', '原情感与上下文更新 → 当前状态', '后文可能改变表达但不能改写过去。', 95, n => {
    const [, first] = emotions[n], [, later] = emotions[(n + 3) % 12]; return choice(`起初材料支持“${first}”，随后出现新的动作支持“${later}”。描述人物现在的状态应怎样写？`, `起初${first}，后来变为${later}`,
      [`一直只有${first}`, `一直只有${later}`, '没有任何情感变化'], '两个时间点分别记录，不能用后来状态覆盖起初或反向覆盖。', [table(['时间', '有限判断'], [['起初', first], ['后来', later]])]);
  });
  add(ids.emotion, 'emotion-evidence', 'transfer', '把情感判断与直接动作证据配对', '情感判断与动作库 → 选择直接证据', '评价性形容词不能代替动作细节。', 90, n => {
    const [evidence, emotion] = emotions[n]; return choice(`要支持“人物当时${emotion}”，哪项是直接证据？`, evidence, ['他穿蓝色衣服', '窗外有树', '材料只写了日期'],
      `${evidence}是可直接观察的动作或话语，能够支持${emotion}的有限判断。`);
  });

  const letters = [['小禾', '奶奶', '亲爱的奶奶'], ['小雨', '老师', '敬爱的老师'], ['小林', '爷爷', '亲爱的爷爷'], ['小宁', '朋友', '亲爱的小宁'], ['小安', '校长', '尊敬的校长'], ['小川', '外婆', '亲爱的外婆'],
    ['小贝', '同学', '亲爱的小贝'], ['小晴', '阿姨', '亲爱的阿姨'], ['小乐', '辅导员', '敬爱的辅导员'], ['小星', '伯伯', '亲爱的伯伯'], ['小满', '同桌', '亲爱的小满'], ['小文', '妈妈', '亲爱的妈妈']] as const;
  add(ids.letter, 'letter-addressee', 'understanding', '根据收信人写开头称呼', '写信人与收信人 → 称呼', '书信开头称呼必须面向收信人，不能写成写信人自己。', 50, n => {
    const [sender, recipient, salutation] = letters[n]; return choice(`${sender}写信给${recipient}，开头称呼应写什么？`, salutation, [sender, '写信人自己', '没有称呼'], `收信人是${recipient}，开头称呼面向${recipient}。`);
  });
  add(ids.letter, 'letter-sender', 'procedure', '分别填写称呼和署名', '三封信的双方信息 → 两字段', '收信人与写信人不能互换。', 90, n => {
    const selected = [0, 4, 8].map(i => letters[(n + i) % 12]); return blanks('为每封信填写开头称呼与结尾署名。', selected.flatMap(([sender, , salutation], i) => [[`s${i}`, `信${i + 1}称呼`, salutation], [`n${i}`, `信${i + 1}署名`, sender]]),
      selected.map(([sender, recipient], i) => `第${i + 1}封称呼${recipient}，署名${sender}`).join('；') + '。', [table(['记录', '写信人', '收信人'], selected.map(([sender, recipient], i) => [String(i + 1), sender, recipient]))]);
  });
  add(ids.letter, 'letter-repair', 'transfer', '修复书信角色表中唯一错位', '三行称呼/署名记录 → 找错并改正', '角色错位会改变收信和写信关系。', 105, n => {
    const broken = n % 3, selected = [0, 4, 8].map(i => letters[(n + i) % 12]); const rows = selected.map(([sender, , salutation], i) => [String(i + 1), i === broken ? sender : salutation, i === broken ? '亲爱的称呼' : sender]);
    return blanks('下表只有一行称呼与署名互换，填写行号和正确称呼。', [['row', '交换行', String(broken + 1)], ['salutation', '正确称呼', selected[broken][2]]],
      `第${broken + 1}封信开头仍应称呼${selected[broken][1]}，结尾署名${selected[broken][0]}。`, [table(['行', '已有称呼', '已有署名'], rows)]);
  });
  add(ids.letter, 'letter-signature', 'transfer', '在回信中按发送者与接收者交换角色', '原信双方与回信动作 → 回信称呼署名', '回信者与原写信人身份交换。', 95, n => {
    const [sender, recipient] = letters[n]; return choice(`${sender}曾写信给${recipient}。现在${recipient}给${sender}写回信，开头称呼应写什么？`, `亲爱的${sender}`, [`亲爱的${recipient}`, sender, recipient],
      `回信者是${recipient}，收信人变为${sender}，称呼要面向${sender}。`);
  });

  const redundant = [['我再次又检查了一遍', '我再次检查了一遍'], ['大约十人左右参加', '大约十人参加'], ['他首先第一个发言', '他第一个发言'], ['我们共同一起完成任务', '我们共同完成任务'],
    ['这个结果非常十分清楚', '这个结果十分清楚'], ['他大概可能迟到了', '他可能迟到了'], ['大家全都一致同意', '大家一致同意'], ['我重新再把题做了一遍', '我重新把题做了一遍'],
    ['基本上差不多完成', '基本完成'], ['这次会议大约于九点左右开始', '会议约九点开始'], ['他亲自本人来到现场', '他亲自来到现场'], ['再次重复说明一遍', '再次说明一遍']] as const;
  add(ids.redundancy, 'redundant-adverb', 'understanding', '识别同义重复并保留原意', '冗余句 → 简洁改写', '删除重复成分但不删限制信息。', 55, n => {
    const [original, revised] = redundant[n]; return choice(`“${original}”怎样修改更简洁且保留原意？`, revised, [original, '删除全部动词', '改成无法判断的句子'],
      `${original}中的重复成分表达同一意义，保留一个即可写成${revised}。`);
  });
  add(ids.redundancy, 'approximation-redundancy', 'procedure', '分别写出三句的简洁版本', '三条冗余句 → 逐句修改', '删改后不得增加或丢失否定、范围。', 100, n => {
    const selected = [0, 4, 8].map(i => redundant[(n + i) % 12]); return blanks('修改三句，只删去重复语意并保留关键限制。', selected.map(([, revised], i) => [`r${i}`, `第${i + 1}句改写`, revised]),
      selected.map(([original, revised]) => `${original}可改为${revised}`).join('；') + '。', [table(['记录', '原句'], selected.map(([original], i) => [String(i + 1), original]))]);
  });
  add(ids.redundancy, 'qualifier-preservation', 'transfer', '修改重复时保留否定或范围词', '带限制的冗余句 → 选择正确简写', '不能为简洁删除“并非、约”等限制。', 90, n => {
    const [original, revised] = redundant[n]; return choice(`“${original}”的修改中，哪项仍保留了原句的限制程度？`, revised, ['删除所有对象', '把肯定改成否定', '省略时间和数量限制'],
      `修改只去掉重复语义，${revised}仍保留原句对象、范围和语气。`);
  });
  add(ids.redundancy, 'revision-repair', 'transfer', '修复修改表中唯一丢失原意的句子', '三行原句/改写 → 找错并修正', '改写应简洁且不改变信息。', 110, n => {
    const broken = n % 3, selected = [0, 4, 8].map(i => redundant[(n + i) % 12]); const rows = selected.map(([original, revised], i) => [String(i + 1), original, i === broken ? '句子已删得没有动作' : revised]);
    return blanks('下表只有一行的修改丢失了原意，填写行号和正确简写。', [['row', '错误行', String(broken + 1)], ['revision', '正确简写', selected[broken][1]]],
      `第${broken + 1}行应只删除重复成分，保留对象和动作，可写成${selected[broken][1]}。`, [table(['行', '原句', '已有修改'], rows)]);
  });

  const explanations = [['发现标牌日期写错，核对原表后重新制作', '重视核对信息', '核对原表'], ['看到同学搬书吃力，主动一起搬', '愿意帮助同学', '主动分担搬书'], ['模型晃动后逐一检查支架并加固', '遇到问题会查找原因', '检查并加固支架'],
    ['听说展板难懂，先请同学试读再修改', '关注读者理解', '请同学试读'], ['每次任务结束都整理工具并登记', '做事有始有终', '整理工具并登记'], ['比赛失利后复盘步骤，下一次调整方法', '能从失败中改进', '复盘并调整方法'],
    ['发现资料冲突，追查原始日期和出处', '重视来源核查', '追查日期出处'], ['面对不同意见先记录再逐条比较', '愿意听取不同观点', '记录并逐条比较'], ['按时把借来的材料完整归还', '守信负责', '按时完整归还'],
    ['实验中重复测量并记录差异', '重视结果可靠性', '重复测量记录差异'], ['主动承认误放物品并恢复位置', '诚实负责', '承认并恢复位置'], ['为方便同伴查找给工具分类贴签', '考虑使用便利', '分类贴签']] as const;
  add(ids.explanation, 'source-based-production', 'understanding', '判断与直接证据的对应', '行动记录 → 品质判断与证据', '评价词必须由具体行动支撑。', 60, n => {
    const [action, judgment] = explanations[n]; return choice(`材料写“${action}”。哪项评价同时给出直接依据？`, `${judgment}，因为${action}`, [judgment, action, '没有任何依据'],
      `判断为${judgment}，证据是同一条行动：${action}。`);
  });
  add(ids.explanation, 'personal-production', 'procedure', '用冻结量规写判断与证据', '完整行动材料 → 一句话评价加证据', '短答允许多种准确措辞。', 120, n => {
    const [action, judgment] = explanations[n]; return written(`根据材料“${action}”，写出对人物的一个判断，并引用支持判断的具体行动。`, `${judgment}，因为${action}。`);
  });
  add(ids.explanation, 'evidence-repair', 'transfer', '修复评价后没有证据的短答', '已有空泛评价与材料 → 补上证据链', '不能重复评价词充当证据。', 120, n => {
    const [action, judgment] = explanations[n]; return written(`请修改句“他很${judgment}，因为他很好”，保留材料中的具体行动作为证据。`, `${judgment}，因为${action}。`,
      [table(['空泛判断', '可用材料'], [['他很优秀，因为他很好', action]])]);
  });
  add(ids.explanation, 'claim-limit', 'transfer', '在判断中保留证据适用边界', '一次具体行动 → 限定范围评价', '不能把一次行动推广成稳定人格。', 110, n => {
    const [action, judgment] = explanations[n]; return written(`依据“${action}”评价这次表现，并明确只适用于这一事件。`, `在这次事情中，人物表现出${judgment}，依据是${action}。`);
  });

  add(ids.oral, 'oral-explain-source', 'procedure', '口头区分事实和原因解释', '明确事件材料 → 事实、依据、解释录音', '解释不得超出材料事实。', 105, n => {
    const [action, judgment] = explanations[n]; return audio(`材料只写“${action}”。请先复述事实，再说明你作出的有限判断和依据。`, `${judgment}，依据是${action}。`, '量规分开核对事实、判断和证据关系。');
  });
  add(ids.oral, 'oral-explain-table', 'procedure', '依据结构表口头解释原因', '事实/观察/判断表 → 录音说明', '不能把未观察的原因当作事实。', 115, n => {
    const [action, judgment] = explanations[n]; return audio('根据表格口头说明可观察到的事实、你的判断以及判断依据。', `${judgment}，依据是${action}。`, '量规要求先事实后解释。',
      [table(['字段', '内容'], [['可观察事实', action], ['尚待验证', '行为动机或更广程度']])]);
  });
  add(ids.oral, 'oral-explain-personal', 'transfer', '口头说明个人行动的原因与证据', '个人经历提纲 → 原因、观察、结果录音', '允许真实自述，不逐字匹配参考。', 120, n => {
    const topic = ['改变学习计划', '调整小组分工', '修复班级物品', '选择新的阅读方法'][n % 4]; return audio(`讲一次你${topic}的经历：说明当时观察到的事实、为什么这样调整、结果怎样。`, `围绕${topic}说明事实、原因和结果。`,
      '量规区分自述事实、原因解释与结果，不能确认经历真伪。');
  });
  add(ids.oral, 'oral-explain-boundary', 'transfer', '口头回应超过材料证据的解释', '有限材料与过强主张 → 重述合理解释', '口头回答必须明确材料事实与推测边界，不能把动机说成事实。', 120, n => {
    const [action] = explanations[n]; return audio(`有人说：“仅凭‘${action}’就能证明这个人永远都优秀。”请用材料回应该说法，并给出有依据的有限解释。`, `${judgmentFor(action)}，但不能由一次行动推断永远优秀。`,
      '量规核对证据范围和反驳关系；不能把材料外动机当事实。', [table(['材料事实', '过强主张'], [[action, '永远优秀']])]);
  });
  return families;
}

const judgmentFor = (action: string) => {
  const index = [
    '发现标牌日期写错，核对原表后重新制作', '看到同学搬书吃力，主动一起搬', '模型晃动后逐一检查支架并加固',
    '听说展板难懂，先请同学试读再修改', '每次任务结束都整理工具并登记', '比赛失利后复盘步骤，下一次调整方法',
    '发现资料冲突，追查原始日期和出处', '面对不同意见先记录再逐条比较', '按时把借来的材料完整归还',
    '实验中重复测量并记录差异', '主动承认误放物品并恢复位置', '为方便同伴查找给工具分类贴签',
  ].indexOf(action);
  return ['这次重视核对信息', '这次愿意帮助同学', '这次会查找并处理问题', '这次关注读者理解', '这次做事有始有终',
    '这次能从失败中改进', '这次重视来源核查', '这次愿意听取不同观点', '这次守信负责', '这次重视可靠性',
    '这次诚实负责', '这次考虑到使用便利'][index];
};

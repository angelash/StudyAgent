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
const summaryRubric = [{ criterion: '保留主要人物或对象及核心事件', weight: 0.4 }, { criterion: '保留行动结果且不添加材料外情节', weight: 0.3 },
  { criterion: '语言简短连贯，句意清楚', weight: 0.3 }];
const summary = (stem: string, answer: string, blocks?: QuestionBlock[]): Task => ({ stem, answer, mode: 'short_answer', rubric: summaryRubric,
  analysis: `参考概括：${answer}。量规核对人物、事件与结果，接受不改变信息的合理简写。`, ...(blocks ? { blocks } : {}) });
const oralRubric = [{ criterion: '保留材料中的对象、问题、行动与结果', weight: 0.4 }, { criterion: '按合理顺序连贯复述，不补造事实', weight: 0.3 },
  { criterion: '关键内容可听清；允许自然停顿、自我修正且不因口音差异扣分', weight: 0.3 }];
const audio = (stem: string, answer: string, analysis: string, blocks?: QuestionBlock[]): Task => ({ stem: `${stem} 请录音回答，可先试听，最长3分钟。`, answer,
  mode: 'audio_record', responseShape: { mediaPolicy: 'student-media-v1' }, rubric: oralRubric, analysis, ...(blocks ? { blocks } : {}) });

const ids = { locate: 'foundation:chinese:g3-locate', cause: 'foundation:chinese:g3-cause', context: 'core:chinese:contextmeaning',
  simile: 'core:chinese:simile', personification: 'core:chinese:personification', main: 'core:chinese:main-sentence',
  evidence: 'core:chinese:detail-evidence', classification: 'core:chinese:classification', dialogue: 'core:chinese:dialoguepunctuation',
  fact: 'core:chinese:factopinion', notice: 'core:chinese:notice', summary: 'core:chinese:paragraph-summary', oral: 'core:chinese:oral-retell' };

export function buildChineseGrade3ProbeFamilies(): AuthoredProbeFamily[] {
  const families: AuthoredProbeFamily[] = [];
  const add = (atomId: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string, distinction: string,
    seconds: number, make: (n: number) => Task) => families.push({ atomId, family, dimension, behavior, structure, distinction,
    exercises: Array.from({ length: 12 }, (_, n) => { const task = make(n); return { ...task,
      stem: `${names[n]}的三年级${['材料阅读', '词句辨析', '记录核对', '迁移练习'][n % 4]}：${task.stem}`,
      family, dimension, identityVersion: 2, expectedSeconds: seconds }; }) });

  add(ids.locate, 'locate-structure-0', 'understanding', '同时保留动作和地点条件', '明确短材料 → 指定动作地点', '背景停留地点不能替代目标动作地点。', 55, n => {
    const place = ['图书馆', '操场', '礼堂', '花园', '阅览室', '门厅'][n % 6], action = ['查找资料', '清理落叶', '排练合唱', '观察植物', '归还图书', '张贴通知'][n % 6];
    return choice(`${names[n]}经过走廊后在${place}${action}。题目问${action}发生在哪里。`, place,
      ['走廊', '校门口', '树荫下'], `${action}与${place}在同一动作记录中；经过走廊不是目标动作地点。`);
  });
  add(ids.locate, 'locate-structure-1', 'procedure', '从时间/地点表恢复两次活动', '两条有时间标记的事件记录 → 分别填写地点', '需要保持时间与动作对应。', 85, n => {
    const a = ['教室', '花园', '礼堂'][n % 3], b = ['图书馆', '阅览室', '活动室'][(n + 1) % 3];
    return blanks(`${names[n]}上午和下午去了不同地点，按下表填写地点。`, [['am', '上午地点', a], ['pm', '下午地点', b]],
      `上午记录对应${a}，下午记录对应${b}；不能交换时间。`, [table(['时段', '活动'], [['上午', `在${a}整理材料`], ['下午', `在${b}阅读记录`]])]);
  });
  add(ids.locate, 'locate-updated', 'transfer', '按最新通知确定活动地点', '原地点与明确更新 → 当前地点', '原地点必须先排除，只采用明确生效的最新通知地点。', 85, n => {
    const old = ['东楼', '旧礼堂', '一层教室'][n % 3], latest = ['西楼三层', '新活动室', '阅览室'][n % 3];
    return choice(`活动原定在${old}集合，最新通知改为${latest}。现在去哪里？`, latest, [old, '两处都去', '留在教室'], '最新更新覆盖原地点；只能选择更新后的集合地点。',
      [table(['版本', '地点'], [['原通知', old], ['最新通知', latest]])]);
  });
  add(ids.locate, 'locate-multi', 'transfer', '从多条记录选择某地点的全部活动', '四条人物/地点/活动记录 → 完整筛选', '必须检查全表并保留地点动作关系。', 105, n => {
    const target = ['图书馆', '花园', '礼堂'][n % 3], rows = [0, 1, 2, 3].map(i => [names[(n + i) % 12], i % 2 ? target : ['操场', '教室'][i % 2], `${['查资料', '浇水', '排练', '整理'][i]}${n}`]);
    return { stem: `选择所有在${target}发生的活动。`, mode: 'multiple_choice', options: rows.map(row => row[2]), answer: rows.filter(row => row[1] === target).map(row => row[2]),
      blocks: [table(['人物', '地点', '活动'], rows)], analysis: `只保留地点列为${target}的完整记录，其他记录的地点不同。` };
  });

  const causes = [['路面积水', '比赛改期'], ['书页破损', '修补书页'], ['忘带尺子', '向同伴借用'], ['光线暗', '打开台灯'], ['风很大', '收起纸张'],
    ['水壶空了', '重新装水'], ['人太多', '增加座位'], ['雾很浓', '推迟出发'], ['纸不够', '改用卡片'], ['鞋带松开', '停下来系好'],
    ['天气转凉', '增添外套'], ['标签模糊', '重新标写']] as const;
  add(ids.cause, 'cause-syntax-0', 'understanding', '明确区分原因与结果', '因果短句 → 指定原因', '结果不能被重复成原因。', 55, n => {
    const [why, result] = causes[n]; return choice(`因为${why}，所以${result}。哪项是原因？`, why, [result, '结果与原因相同', '材料没有因果'], `${why}引发${result}；题目问原因，应选先发条件。`);
  });
  add(ids.cause, 'cause-syntax-1', 'procedure', '恢复三条因果记录的原因', '结果和完整材料表 → 逐项填写原因', '多个因果链必须按各自结果独立核对。', 90, n => {
    const selected = [0, 4, 8].map(i => causes[(n + i) % 12]); return blanks('按下表明确材料填写每条结果的原因。',
      selected.map(([why], i) => [`c${i}`, `结果${i + 1}的原因`, why]), selected.map(([why, result]) => `${result}来自${why}`).join('；') + '。',
      [table(['记录', '完整材料'], selected.map(([why, result], i) => [String(i + 1), `${why}导致${result}`]))]);
  });
  add(ids.cause, 'cause-direction', 'transfer', '从结果反查直接原因', '连续两段结果 → 指定结果的前因', '不能跨过中间结果取最早原因。', 95, n => {
    const chains = [['材料潮湿', '字迹模糊', '重新誊写'], ['零件缺失', '暂停装配', '补领零件'], ['人数增加', '座位不足', '增加椅子'], ['水管漏水', '地面湿滑', '放置提示牌']]; const [a, b, c] = chains[n % 4];
    return choice(`完整记录是“${a}导致${b}，因此${c}”。${c}的直接原因是什么？`, b, [a, c, '没有原因'], `${b}直接导致${c}；${a}只解释更早的${b}。`);
  });
  add(ids.cause, 'cause-repair', 'transfer', '修复颠倒的因果记录', '三条材料 → 找因果方向颠倒项并改正', '需要指出正确起点而不是只找行号。', 110, n => {
    const broken = n % 3, selected = [0, 4, 8].map(i => causes[(n + i) % 12]);
    const rows = selected.map(([why, result], i) => [String(i + 1), i === broken ? `${result}导致${why}` : `${why}导致${result}`]);
    return blanks('下表只有一行因果方向颠倒，填写行号和正确原因。', [['row', '颠倒行', String(broken + 1)], ['cause', '正确原因', selected[broken][0]]],
      `第${broken + 1}行应写成${selected[broken][0]}导致${selected[broken][1]}。`, [table(['行', '材料'], rows)]);
  });

  const polysemy = [['这道题很深，我还不懂。', '深', '难以理解', '水深'], ['他有一副热心肠，常帮助人。', '热', '热情', '温度高'], ['沿路风景让人开了眼界。', '开', '扩大', '开门'],
    ['这句话分量很重。', '重', '意义重要', '重量大'], ['他把话说得很明白。', '明白', '清楚', '白天'], ['这个办法行得通。', '行', '可以', '走路'],
    ['舞台上的她很亮眼。', '亮眼', '引人注意', '眼睛发亮'], ['这次活动很有意义。', '意义', '价值', '字面意思'], ['屋里一下子热闹起来。', '热闹', '气氛活跃', '温度高'],
    ['他把书翻得很熟。', '熟', '熟悉', '食物熟'], ['风把树叶吹得沙沙响。', '响', '声音', '有名'], ['这个小工具很实用。', '实用', '有用', '具体物品']] as const;
  add(ids.context, 'abstract-polysemy', 'understanding', '结合句义选择多义词的具体含义', '明确语境 → 词语意义', '同一字在其他语境可有不同意义。', 55, n => {
    const [sentence, word, answer, distractor] = polysemy[n]; return choice(`句子“${sentence}”中“${word}”的意思是？`, answer, [distractor, '没有任何意义', '只表示声音'],
      `整句表达的是${answer}；“${word}”的意义由具体语境确定。`);
  });
  add(ids.context, 'idiomatic-context', 'procedure', '为三个语境填写词语意义', '三条短句 → 分别恢复词义', '需要回到句子的实际意思。', 90, n => {
    const selected = [0, 4, 8].map(i => polysemy[(n + i) % 12]); return blanks('根据完整句子填写加引号词语在本句中的意思。',
      selected.map(([, word, answer], i) => [`m${i}`, `${word}的本句意义`, answer]), selected.map(([sentence, word, answer]) => `${sentence}中${word}表示${answer}`).join('；') + '。',
      [table(['记录', '句子'], selected.map(([sentence], i) => [String(i + 1), sentence]))]);
  });
  add(ids.context, 'meaning-update', 'transfer', '区分同一词在不同句中的意义', '同字两个不同语境 → 当前句义', '不能机械复用前一句义项。', 90, n => {
    const [sentence, word, answer] = polysemy[n], [previousSentence, previousWord, other] = polysemy[(n + 3) % 12];
    return choice(`前一句“${previousSentence}”中的${previousWord}表示${other}。现在句子是“${sentence}”，这里${word}表示什么？`, answer,
      [other, '与上一句的解释完全相同', '无法判断'], `要按当前句子重新判断；上一句关于${previousWord}的${other}不能直接套用。`);
  });
  add(ids.context, 'meaning-stock', 'transfer', '按语境在词义库存中筛选正确解释', '句义解释库存 → 选择全部符合当前句的义项', '理解任务允许多项选择；多义字只有本句一个义项。', 100, n => {
    const [sentence, word, answer] = polysemy[n], decoys = rotate(polysemy.filter(([, char]) => char !== word).map(row => row[2]), n).slice(0, 2);
    return choice(`句子“${sentence}”中“${word}”的意义，选择一个最准确解释。`, answer, [...decoys, '只表示字形'], `${sentence}中${word}表示${answer}；其他解释属于不同义项。`);
  });

  const similes = [['弯弯的月亮', '小船'], ['荷叶', '一把伞'], ['雪花', '白蝴蝶'], ['河面', '镜子'], ['云朵', '棉花糖'], ['星星', '小眼睛'],
    ['柳枝', '长辫子'], ['雨点', '小豆子'], ['稻田', '金色海洋'], ['晚霞', '红绸带'], ['松树', '绿色宝塔'], ['露珠', '小珍珠']] as const;
  add(ids.simile, 'simile-source', 'understanding', '识别被比喻的本体', '“甲像乙” → 本体甲', '本体是被说明的对象，喻体是借用的形象。', 50, n => {
    const [source, image] = similes[n]; return choice(`“${source}像${image}。”被比喻的对象是什么？`, source, [image, '比喻词', '没有对象'], `${source}是正在被说明的本体，${image}只是借用来作比较的喻体。`);
  });
  add(ids.simile, 'simile-image', 'procedure', '分别填写本体与喻体', '三个明确比喻句 → 两个字段', '同一句保持两个角色不互换。', 90, n => {
    const selected = [0, 4, 8].map(i => similes[(n + i) % 12]); return blanks('为三句比喻填写本体和喻体。', selected.flatMap(([source, image], i) => [[`s${i}`, `第${i + 1}句本体`, source], [`i${i}`, `第${i + 1}句喻体`, image]]),
      selected.map(([source, image], i) => `第${i + 1}句把${source}比作${image}`).join('；') + '。', [table(['记录', '比喻句'], selected.map(([source, image], i) => [String(i + 1), `${source}像${image}`]))]);
  });
  add(ids.simile, 'simile-record-check', 'transfer', '核对本体、喻体记录是否对应', '比喻句和已有角色表 → 选择全部一致记录', '需要同时检查两个角色。', 100, n => {
    const selected = [0, 3, 6, 9].map(i => similes[(n + i) % 12]), labels = ['甲', '乙', '丙', '丁'];
    const rows = selected.map(([source, image], i) => [labels[i], `${source}像${image}`, i === n % 4 ? image : source, i === n % 4 ? source : image]);
    return { stem: '选择所有本体、喻体记录与句子一致的项。', mode: 'multiple_choice', options: rotate(labels, n), answer: rows.filter(row => row[2] !== row[3]).map(row => row[0]),
      blocks: [table(['记录', '比喻句', '已有本体', '已有喻体'], rows)], analysis: '逐行核对被说明对象与借用形象，不能只看两个词是否都出现在句中。' };
  });
  add(ids.simile, 'simile-repair', 'transfer', '修复唯一喻体错误记录', '三条比喻角色表 → 定位错误并替换', '需要定位角色表中的错误而非重写整句。', 105, n => {
    const broken = n % 3, selected = [0, 4, 8].map(i => similes[(n + i) % 12]), wrong = similes[(n + 5) % 12][1];
    const rows = selected.map(([source, image], i) => [String(i + 1), source, i === broken ? wrong : image]);
    return blanks('下表只有一行的喻体与原句不符，填写行号和正确喻体。', [['row', '错误行', String(broken + 1)], ['image', '正确喻体', selected[broken][1]]],
      `第${broken + 1}行“${selected[broken][0]}”使用的喻体是${selected[broken][1]}。`, [table(['行', '本体', '已有喻体'], rows)]);
  });

  const personified = [['小草向我们点头', '小草'], ['花儿露出笑脸', '花儿'], ['风儿唱着歌走来', '风儿'], ['星星眨着眼睛', '星星'], ['雨点在窗上跳舞', '雨点'],
    ['柳枝挥着手', '柳枝'], ['太阳公公露出笑脸', '太阳'], ['小溪一路奔跑', '小溪'], ['树叶在枝头说悄悄话', '树叶'], ['云朵慢慢散步', '云朵'], ['麦穗弯着腰行礼', '麦穗'], ['闹钟催我起床', '闹钟']] as const;
  add(ids.personification, 'human-action', 'understanding', '辨认人物化动作', '明确句子 → 使用的修辞', '动作必须让非人事物具有人的特征。', 50, n => {
    const sentence = personified[n][0]; return choice(`“${sentence}”运用了什么修辞？`, '拟人', ['作比较', '列数字', '下定义'], `句中把人的动作赋予非人事物，属于拟人。`);
  });
  add(ids.personification, 'select-personification', 'procedure', '比较多个句子选择拟人表达', '三个句子 → 找出全部拟人句', '普通动作句不因主语是事物就算拟人。', 85, n => {
    const answer = [personified[(n + 2) % 12][0]], decoys = ['风速每秒三米', '天上有许多星星', '河水向东方流去']; return { stem: '选择所有把人的情感或行为赋予非人事物的句子。', mode: 'multiple_choice', options: rotate([...answer, ...decoys], n), answer,
      analysis: '只有把人的表情、动作或语言赋予人事物的句子属于拟人；普通状态描述不是拟人。' };
  });
  add(ids.personification, 'personification-repair', 'transfer', '把错误修辞标签修复为拟人', '三行句子与已有修辞标签 → 找错并改正', '需要检查拟人依据而非只因对象不是人。', 105, n => {
    const broken = n % 3, selected = [0, 4, 8].map(i => personified[(n + i) % 12]);
    const rows = selected.map(([sentence], i) => [String(i + 1), sentence, i === broken ? '作比较' : '拟人']);
    return blanks('下表只有一行的修辞标签错误，填写行号与正确修辞。', [['row', '错误行', String(broken + 1)], ['figure', '正确修辞', '拟人']],
      `第${broken + 1}行把人的动作赋予${selected[broken][1]}，应标为拟人。`, [table(['行', '句子', '已有标签'], rows)]);
  });
  add(ids.personification, 'personification-evidence', 'transfer', '指出拟人判断的直接语言证据', '拟人句和候选动作 → 说明依据', '结论必须来自人物化动词或表情。', 90, n => {
    const [sentence, subject] = personified[n], action = sentence.slice(subject.length); return choice(`“${sentence}”中哪部分让人判断为拟人？`, action,
      [subject, '句子长度', '标点符号'], `${action}本属于人的动作或表现，题目把它赋予${subject}，所以构成拟人。`);
  });

  const paragraphs = [['花园真美。红花开了，绿树成荫。', '花园真美。'], ['弟弟很爱运动。他每天跑步，周末游泳。', '弟弟很爱运动。'],
    ['操场能跑步、打球。我们的操场用途真多。', '我们的操场用途真多。'], ['小林帮助同桌，主动值日。他真热心。', '他真热心。'],
    ['图书角很整洁。书本按类别摆放，桌面没有杂物。', '图书角很整洁。'], ['雨后的山特别清新。天空湛蓝，树叶发亮。', '雨后的山特别清新。'],
    ['小晴准备得很充分。她核对材料，试讲两遍。', '小晴准备得很充分。'], ['小队的计划很周密。时间、分工和备选都说清了。', '小队的计划很周密。'],
    ['花园里花儿多，树木多，鸟儿也多。花园真热闹。', '花园真热闹。'], ['小安做事很细心。他先检查题号，又核对单位。', '小安做事很细心。'],
    ['展板内容很丰富。有照片、文字和模型。', '展板内容很丰富。'], ['这次活动很有意义。大家学会合作，也懂得保护环境。', '这次活动很有意义。']] as const;
  add(ids.main, 'general-first', 'understanding', '识别段首总说句', '总说在前、例子在后的段落 → 中心句', '例子的数量不改变总说句位置。', 55, n => {
    const [paragraph, answer] = paragraphs[n]; return choice(`“${paragraph}”的总说句或中心句是哪一句？`, answer, [paragraph.split('。')[1] + '。', '段中每个例子', '没有中心'], `${answer}概括全段，其他句子是支持它的具体例子。`);
  });
  add(ids.main, 'general-last', 'procedure', '从段末总结句恢复中心', '三个具体例子与末尾总结 → 填写中心句', '总说句也可能在段末，需要比较概括句与具体例子。', 90, n => {
    const selected = [0, 4, 8].map(i => paragraphs[(n + i) % 12]); return blanks('为每段填写概括全段的中心句。',
      selected.map(([, answer], i) => [`m${i}`, `第${i + 1}段中心句`, answer]), selected.map(([paragraph, answer]) => `${paragraph}中心为${answer}`).join('；') + '。',
      [table(['记录', '段落'], selected.map(([paragraph], i) => [String(i + 1), paragraph]))]);
  });
  add(ids.main, 'main-record-repair', 'transfer', '修复中心句表唯一错误', '段落与已有中心摘要 → 找错并改正', '需要区分概括全段的总说句与只说明一例的细节句。', 105, n => {
    const broken = n % 3, selected = [0, 4, 8].map(i => paragraphs[(n + i) % 12]), wrong = selected[(broken + 1) % 3][1];
    const rows = selected.map(([paragraph, answer], i) => [String(i + 1), paragraph, i === broken ? wrong : answer]);
    return blanks('下表只有一行的中心句概括了另一段，填写行号和正确中心句。', [['row', '错误行', String(broken + 1)], ['main', '正确中心句', selected[broken][1]]],
      `第${broken + 1}段的总说是“${selected[broken][1]}”；其他句子只是例子。`, [table(['行', '段落', '已有中心'], rows)]);
  });
  add(ids.main, 'main-support-separation', 'transfer', '区分中心句与支持细节', '一段文本 → 选择所有直接例子', '不能把所有句子都当中心。', 95, n => {
    const [paragraph] = paragraphs[n], parts = paragraph.split('。').filter(Boolean), main = parts[0], details = parts.slice(1);
    return { stem: `选择“${paragraph}”中用于支持中心“${main}”的具体细节。`, mode: 'multiple_choice', options: parts, answer: details,
      analysis: `${details.join('、')}提供具体例子；“${main}”是对全段的概括。` };
  });

  const evidence = [['反复检查三遍并核对单位', '认真'], ['同学摔倒时马上上前扶起', '乐于助人'], ['连续一个月每天跑步', '坚持锻炼'], ['把破损书页修补好', '爱惜书本'], ['主动整理散落图书', '有责任心'],
    ['先听同伴说完再回答', '尊重别人'], ['遇到新问题主动查资料', '好奇好学'], ['把实验步骤逐项记录', '做事细致'], ['比赛落后仍坚持完成', '有毅力'], ['把座位让给需要的人', '关心他人'], ['按时归还借来的雨伞', '守信'], ['主动说出自己的不同意见', '独立思考']] as const;
  add(ids.evidence, 'action-support', 'understanding', '用具体动作支持明确判断', '动作记录与判断 → 直接证据', '无关事实不能支持结论。', 55, n => {
    const [action, claim] = evidence[n]; return choice(`哪项直接支持“他${claim}”这一判断？`, action, ['他今天穿蓝色衣服', '材料没有行动', '他的名字很短'], `${action}与${claim}直接相关，其他信息只属于无关事实。`);
  });
  add(ids.evidence, 'claim-to-evidence', 'procedure', '从三条材料分别恢复判断所需证据', '判断与材料记录表 → 填写最直接动作', '多个空位分别保持主张与证据关系。', 95, n => {
    const selected = [0, 4, 8].map(i => evidence[(n + i) % 12]); return blanks('为每条判断填写直接证据。', selected.map(([action], i) => [`e${i}`, `判断${i + 1}的证据`, action]),
      selected.map(([action, claim]) => `${claim}依据${action}`).join('；') + '。', [table(['记录', '需要支持的判断'], selected.map(([, claim], i) => [String(i + 1), claim]))]);
  });
  add(ids.evidence, 'evidence-limit', 'transfer', '区分可支持与超出材料的推断', '证据与候选结论 → 选择边界恰当的判断', '结论不能超过动作能证明的范围。', 90, n => {
    const [action, claim] = evidence[n]; return choice(`材料只记录“${action}”。哪种判断最稳妥？`, `这能支持他${claim}`, [`他永远都${claim}`, '这说明他所有事情都做得好', '材料证明不了任何事'],
      `一次具体行为支持当时的${claim}判断，但不能推广成永远或在所有情境都如此。`);
  });
  add(ids.evidence, 'evidence-record-repair', 'transfer', '修复判断与证据表的唯一错配', '三行判断和证据 → 定位无关证据并改正', '需要根据判断选直接动作。', 110, n => {
    const broken = n % 3, selected = [0, 4, 8].map(i => evidence[(n + i) % 12]), wrong = evidence[(n + 7) % 12][0];
    const rows = selected.map(([action, claim], i) => [String(i + 1), claim, i === broken ? wrong : action]);
    return blanks('下表只有一行证据不能直接支持其判断，填写行号与正确证据。', [['row', '错误行', String(broken + 1)], ['evidence', '正确证据', selected[broken][0]]],
      `第${broken + 1}行要支持“${selected[broken][1]}”，应使用${selected[broken][0]}。`, [table(['行', '判断', '已有证据'], rows)]);
  });

  const categories = [['苹果、梨、香蕉', '水果', '蔬菜'], ['跑步、跳绳、游泳', '运动', '乐器'], ['汽车、轮船、飞机', '交通工具', '植物'], ['铅笔、橡皮、尺子', '文具', '水果'],
    ['小麦、水稻、玉米', '粮食作物', '家具'], ['松树、柳树、杨树', '树木', '动物'], ['猫、狗、兔子', '动物', '交通工具'], ['桌子、椅子、书架', '家具', '运动'],
    ['诗歌、小说、散文', '文学作品', '工具'], ['雨、雪、雾', '天气现象', '文具'], ['长江、黄河、珠江', '河流', '乐器'], ['足球、篮球、排球', '球类运动', '蔬菜']] as const;
  add(ids.classification, 'category-examples', 'understanding', '从多个同类例子概括上位概念', '三个同类词 → 类别', '上位类别必须覆盖全部例子，不能只符合其中一个。', 50, n => {
    const [examples, answer, wrong] = categories[n]; return choice(`“${examples}”共同属于哪一类？`, answer, [wrong, '单个例子', '没有共同属性'], `${examples}都具有“${answer}”的共同属性。`);
  });
  add(ids.classification, 'category-all', 'procedure', '检查三个例子是否同属一类', '类别与例子表 → 判断并填写类别', '需要全体成员符合，不能以一个例子代替全部。', 90, n => {
    const selected = [0, 4, 8].map(i => categories[(n + i) % 12]); return blanks('根据每组三个例子填写共同类别。', selected.map(([, answer], i) => [`c${i}`, `第${i + 1}组类别`, answer]),
      selected.map(([examples, answer]) => `${examples}同属${answer}`).join('；') + '。', [table(['记录', '例子'], selected.map(([examples], i) => [String(i + 1), examples]))]);
  });
  add(ids.classification, 'category-repair', 'transfer', '修复分类表中唯一混入的异类', '三组四词记录 → 找不属于共同类别的一项', '需要比较全组共同属性，不能只凭前两项归类。', 105, n => {
    const broken = n % 3, selected = [0, 4, 8].map(i => categories[(n + i) % 12]), intruder = ['水杯', '铜号', '雨伞'][broken];
    const rows = selected.map(([examples, answer], i) => [String(i + 1), answer, `${examples}、${i === broken ? intruder : examples.split('、')[0]}`]);
    return blanks('下表只有一组混入了不同类别的一项，填写行号和类别。', [['row', '混入异类的一组', String(broken + 1)], ['category', '该组共同类别', selected[broken][1]]],
      `第${broken + 1}组正例应同属${selected[broken][1]}；${intruder}不属于该类别。`, [table(['行', '已有类别', '词项记录'], rows)]);
  });
  add(ids.classification, 'category-relation', 'transfer', '从例子反推类别的共同属性', '类别与两个例子 → 选择说明共同属性的句子', '类别名称只是标签，需要理解共同属性。', 85, n => {
    const [examples, answer] = categories[n]; return choice(`为什么“${examples}”可以归为${answer}？`, `它们都具有${answer}的共同属性`, ['它们字数相同', '它们读音完全一样', '其中只有一个是例子'],
      `归纳类别要覆盖全部例子并说明共同属性；字数或读音不是分类依据。`);
  });

  const speeches = [['妈妈说', '快回家', '妈妈', '快回家'], ['老师问', '谁愿意参加', '老师', '谁愿意参加'], ['小林说', '我来帮忙', '小林', '我来帮忙'], ['小禾提醒', '别忘了带水杯', '小禾', '别忘了带水杯'],
    ['同伴喊道', '比赛开始了', '同伴', '比赛开始了'], ['爷爷说', '慢慢走', '爷爷', '慢慢走'], ['小雨回答', '我已经准备好了', '小雨', '我已经准备好了'], ['老师宣布', '活动现在开始', '老师', '活动现在开始'],
    ['小贝问', '地图放在哪里', '小贝', '地图放在哪里'], ['小安说', '请保持安静', '小安', '请保持安静'], ['姐姐回答', '我马上来', '姐姐', '我马上来'], ['同学提醒', '注意脚下', '同学', '注意脚下']] as const;
  add(ids.dialogue, 'speech-introducer', 'understanding', '在提示语后选择冒号', '明确提示语与直接引语 → 标点', '冒号引出人物所说内容。', 50, n => {
    const [introducer, speech] = speeches[n]; return choice(`“${introducer}____‘${speech}。’”提示语后应填什么？`, '冒号', ['顿号', '问号', '句号'], `${introducer}提示后面是人物原话，应使用冒号并配合引号。`);
  });
  add(ids.dialogue, 'quotation-boundary', 'procedure', '分别填写直接引语两端的引号', '三条提示语+原话 → 引号位置', '引号包住完整原话而不包提示语。', 85, n => {
    const selected = [0, 4, 8].map(i => speeches[(n + i) % 12]); return blanks('直接引语两端都使用同一种引号，填写两端标点。',
      selected.flatMap(([introducer, speech], i) => [[`l${i}`, `第${i + 1}句开头引号`, '“'], [`r${i}`, `第${i + 1}句结尾引号`, '”']]),
      selected.map(([introducer, speech], i) => `${introducer}：“${speech}。”`).join('；') + '。引号包住原话。', [table(['记录', '提示语', '原话'], selected.map(([introducer, speech], i) => [String(i + 1), introducer, speech]))]);
  });
  add(ids.dialogue, 'speech-record-repair', 'transfer', '修复直接引语记录中的唯一边界错误', '三行提示语/原话/已写句 → 找错误并替换', '原话和提示语边界不能互换。', 105, n => {
    const broken = n % 3, selected = [0, 4, 8].map(i => speeches[(n + i) % 12]);
    const rows = selected.map(([introducer, speech], i) => [String(i + 1), introducer, i === broken ? `“${introducer}”：${speech}。` : `${introducer}：“${speech}。”`]);
    return blanks('下表只有一句把提示语和原话的引号边界写错，填写行号和正确句子。', [['row', '错误行', String(broken + 1)], ['sentence', '正确句子', `${selected[broken][0]}：“${selected[broken][1]}。”`]],
      `第${broken + 1}行应让${selected[broken][0]}留在引号外，完整原话“${selected[broken][1]}”放在引号内。`, [table(['行', '提示语', '已有句子'], rows)]);
  });
  add(ids.dialogue, 'quotation-function', 'transfer', '区分人物原话与叙述事实', '引号内容 → 话语功能', '引号表示直接引用而非强调任意词。', 80, n => {
    const [introducer, speech] = speeches[n]; return choice(`句子“${introducer}：‘${speech}。’”引号内是什么？`, '人物直接说的话', ['叙述者的动作', '书名', '数字记录'],
      `冒号后的引号保留${introducer}说出的原话，属于直接引语。`);
  });

  const facts = [['花坛里有十二棵树', '个人评价'], ['图书馆周一闭馆', '个人感受'], ['教室里有四排桌子', '个人喜好'], ['活动九点开始', '个人意见'], ['小渠长二百米', '个人评价'], ['队里有六名成员', '个人感受'],
    ['表格有三列', '个人看法'], ['花园里有五种花', '个人偏好'], ['这本书共八十页', '个人评价'], ['操场有两副球架', '个人感受'], ['水杯容量是四百毫升', '个人意见'], ['展示板贴了八张照片', '个人偏好']] as const;
  add(ids.fact, 'fact-select', 'understanding', '识别可核查的具体事实', '可计数/可核对句 → 查找条件', '事实有对象和可核查值。', 50, n => {
    const [fact] = facts[n]; return choice(`哪一句包含可以直接核对的明确事实？`, fact, ['我觉得这里最美', '这个活动很有趣', '大家都应该喜欢'], `${fact}包含明确对象和可核查信息，另外的是个人评价或感受。`);
  });
  add(ids.fact, 'opinion-identify', 'procedure', '区分三个判断中的事实与评价', '三条陈述 → 标出类型', '评价词需要观点支持，不能与测量事实混同。', 90, n => {
    const selected = [0, 3, 6].map(i => facts[(n + i) % 12]), opinions = ['我觉得这里最美', '我个人最喜欢这次活动', '在我看来这个方案最方便'];
    const options = rotate([...selected.map(row => row[0]), opinions[n % 3]], n);
    return { stem: '选择所有属于个人评价或感受的陈述。', mode: 'multiple_choice', options, answer: [opinions[n % 3]],
      analysis: `“${opinions[n % 3]}”含有个人判断；其他三项是对象和数值可核查的事实。` };
  });
  add(ids.fact, 'fact-value-check', 'transfer', '核对事实中的对象和数值', '事实记录与变更 → 只采用最新可核查值', '主观评价不会覆盖测量事实。', 85, n => {
    const [fact] = facts[n], updated = fact.replace('十二', '十四').replace('四', '五').replace('九', '十').replace('二百', '二百五十').replace('六', '七').replace('三', '四').replace('五', '六').replace('八十', '九十').replace('两', '三').replace('四百', '五百').replace('八', '九');
    return choice(`旧记录是“${fact}”，最新核对记录是“${updated}”。应当采用哪一个当前值？`, updated, [fact, '个人觉得都行', '没有可核查内容'], '事实更新需要采用最新核对记录；个人偏好不能改变测量值。');
  });
  add(ids.fact, 'fact-opinion-repair', 'transfer', '修复事实/评价分类表的唯一错误', '三行陈述与已有类型 → 找错并修正', '需要检查语句是否含可核查对象或主观词。', 105, n => {
    const broken = n % 3, selected = [0, 4, 8].map(i => facts[(n + i) % 12]); const rows = selected.map(([fact, opinion], i) => [String(i + 1), fact, i === broken ? opinion : '可核查事实']);
    return blanks('下表只有一行把可直接核对的事实误标为个人评价，填写行号和正确类型。', [['row', '错误行', String(broken + 1)], ['type', '正确类型', '可核查事实']],
      `第${broken + 1}行含明确对象和数值，属于可核查事实。`, [table(['行', '陈述', '已有类型'], rows)]);
  });

  const notices = [['周三14点在礼堂排练，请带水杯', '周三14点', '礼堂', '水杯'], ['周六9点公园集合，自带雨衣', '周六9点', '公园', '雨衣'], ['周五16点图书馆阅读，携带借书卡', '周五16点', '图书馆', '借书卡'],
    ['周日10点音乐室练唱，带歌谱', '周日10点', '音乐室', '歌谱'], ['周四15点实验室观察，穿平底鞋', '周四15点', '实验室', '平底鞋'], ['周二8点操场晨练，戴帽子', '周二8点', '操场', '帽子'],
    ['周一13点活动室制作，带剪刀', '周一13点', '活动室', '剪刀'], ['周六14点花园测量，带软尺', '周六14点', '花园', '软尺'], ['周三16点阅览室查资料，带笔记本', '周三16点', '阅览室', '笔记本'],
    ['周日9点门厅签到，带通知单', '周日9点', '门厅', '通知单'], ['周五11点教室展示，带模型', '周五11点', '教室', '模型'], ['周四10点庭院观察，带记录表', '周四10点', '庭院', '记录表']] as const;
  add(ids.notice, 'notice-equipment', 'understanding', '从通知提取明确携带条件', '通知句 → 必带物品', '不能依据活动常识补造通知中没有写出的物品。', 50, n => {
    const [notice, , , equipment] = notices[n]; return choice(`通知：“${notice}。”通知要求携带什么？`, equipment, ['画笔', '足球', '没有说明'], `${notice}明确列出${equipment}，不能依据常见活动增加物品。`);
  });
  add(ids.notice, 'notice-location', 'procedure', '分别填写通知时间和地点', '三条通知记录 → 两字段', '时间地点字段不能互换。', 90, n => {
    const selected = [0, 4, 8].map(i => notices[(n + i) % 12]); return blanks('从通知分别填写时间和地点。', selected.flatMap(([, time, place], i) => [[`t${i}`, `第${i + 1}条时间`, time], [`p${i}`, `第${i + 1}条地点`, place]]),
      selected.map(([notice, time, place]) => `${notice}：时间${time}，地点${place}`).join('；') + '。', [table(['记录', '通知'], selected.map(([notice], i) => [String(i + 1), notice]))]);
  });
  add(ids.notice, 'notice-updated', 'transfer', '采用最新通知的全部条件', '原地点与更新 → 当前地点', '通知更新优先于旧安排。', 85, n => {
    const [, time, old] = notices[n], latest = ['新礼堂', '西楼二层', '线上活动室', '南门大厅'][n % 4]; return choice(`活动${time}原定在${old}，最新通知改到${latest}。现在应去哪里？`, latest, [old, '两个地方都去', '不去活动'],
      `最新通知只改变地点，时间和其他要求仍按原通知保留；当前地点是${latest}。`, [table(['版本', '地点'], [['原通知', old], ['最新通知', latest]])]);
  });
  add(ids.notice, 'notice-complete-record', 'transfer', '核对通知时间地点携带条件是否齐全', '四条通知字段表 → 选择全部完整有效项', '时间、地点或携带条件缺任一项，都不能算完整有效。', 105, n => {
    const labels = ['甲', '乙', '丙', '丁'], selected = [0, 3, 6, 9].map(i => notices[(n + i) % 12]);
    const rows = selected.map(([notice, time, place, equipment], i) => [labels[i], notice, i === n % 4 ? '未写' : time, place, equipment]);
    return { stem: '选择所有时间、地点和携带条件都明确写出的通知。', mode: 'multiple_choice', options: rotate(labels, n), answer: rows.filter(row => row.slice(2).every(Boolean)).map(row => row[0]),
      blocks: [table(['记录', '通知', '时间', '地点', '携带'], rows)], analysis: '逐行核对三个字段；出现“未写”的记录存在缺口。' };
  });

  const summaries = [['小禾发现图书角杂乱，按类别整理，大家很快找到书。', '小禾整理图书角，方便大家找书。'], ['小雨发现花叶发黄，查资料后减少浇水，花恢复健康。', '小雨调整浇水，使花恢复。'],
    ['小林发现小组缺少分工，重新安排任务，制作按时完成。', '小林重新分工，使任务按时完成。'], ['小晴发现展板位置太低，调整高度后观众更容易阅读。', '小晴调整展板高度，方便阅读。'],
    ['小川发现模型不稳，检查支架并加固，模型稳定完成。', '小川加固支架，使模型稳定。'], ['小安发现路线不清，补上标牌，大家顺利到达。', '小安补上标牌，帮助大家到达。'],
    ['小贝发现水迹，放好提示牌并擦干地面，避免滑倒。', '小贝处理水迹，避免滑倒。'], ['小乐发现材料散乱，按步骤编号，制作效率提高。', '小乐整理编号，提高制作效率。'],
    ['小星发现同学误解任务，画出示意图并解释，大家明确分工。', '小星画图解释，澄清任务。'], ['小满发现图书分类混乱，制作标签后重新上架。', '小满制作标签，整理图书。'],
    ['小林发现排练节奏不齐，分组练习后合练更整齐。', '小林组织分组练习，改善合奏。'], ['小禾发现实验步骤遗漏，补写记录后复现成功。', '小禾补全步骤，使实验复现。']] as const;
  add(ids.summary, 'source-based-production', 'understanding', '辨认保留人物事件结果的简洁概括', '一段问题解决材料 → 完整概括', '概括应包含主要行动和结果。', 65, n => {
    const [paragraph, answer] = summaries[n]; return choice(`材料：“${paragraph}”哪项概括保留主要行动和结果？`, answer,
      [paragraph.split('，')[0], '人物换了衣服', '材料没有结果'], `${answer}保留主要人物、解决问题行动和结果，省略无关细节。`);
  });
  add(ids.summary, 'personal-production', 'procedure', '用冻结量规写人物事件结果', '完整材料 → 一句话概括', '短答人工复核，允许合理措辞。', 115, n => {
    const [paragraph, answer] = summaries[n]; return summary(`用一句话概括材料：“${paragraph}”`, answer);
  });
  add(ids.summary, 'summary-repair', 'transfer', '删去无关细节并补回结果', '含衣服颜色、缺少结果的概括 → 修复', '先识别主要事件，再恢复行动结果。', 115, n => {
    const [paragraph, answer] = summaries[n]; return summary(`一份概括只写了“${names[n]}穿着蓝色衣服”，漏掉主要行动和结果。请依据材料重写。`, answer,
      [table(['材料', '已有概括'], [[paragraph, `${names[n]}穿着蓝色衣服`]])]);
  });
  add(ids.summary, 'summary-table', 'transfer', '从人物/问题/行动/结果表写概括', '结构化事件表 → 一句话概括', '需要跨列组织，不补造动机。', 120, n => {
    const [paragraph, answer] = summaries[n], [person, rest] = paragraph.split('发现'); const details = rest.split('，');
    return summary(`只根据表中信息写一句概括，保留人物、问题和处理结果。`, answer, [table(['人物', '问题/起点', '行动与结果'], [[person, `发现${details[0]}`, details.slice(1).join('，')]])]);
  });

  add(ids.oral, 'oral-retell-source', 'procedure', '依据材料口头复述完整信息', '短材料 → 问题、行动与结果录音', '复述只保留材料事实，不补造人物动机或未出现的结果。', 105, n => {
    const [paragraph, answer] = summaries[n]; return audio(`请口头复述材料：“${paragraph}”`, answer, '量规核对问题起点、行动和结果，允许合理简写及自我修正。');
  });
  add(ids.oral, 'oral-retell-table', 'procedure', '依据事件表口头组织复述', '人物/问题/行动/结果表 → 完整录音', '跨列信息必须来自表格。', 115, n => {
    const [paragraph, answer] = summaries[n], [person, rest] = paragraph.split('发现'); const details = rest.split('，'); return audio('根据事件表口头复述，讲清谁遇到了什么问题、做了什么、结果如何。', answer,
      '量规按表格四类信息核对，不接受补造的结果。', [table(['人物', '问题/起点', '行动与结果'], [[person, `发现${details[0]}`, details.slice(1).join('，')]])]);
  });
  add(ids.oral, 'oral-retell-personal', 'transfer', '口头复述个人问题解决经历', '个人事件提纲 → 问题、行动、结果录音', '允许真实自述，不按参考文本逐字评分。', 120, n => {
    const topic = ['整理散乱的图书', '修改容易误解的提示牌', '重新安排小组任务', '检查并修复漏水的水壶'][n % 4]; return audio(`请讲一件你${topic}的真实小事，说清遇到的问题、采取的行动和最终结果。`, `围绕${topic}说明问题、行动和结果。`,
      '没有标准措辞；量规只核对事件完整、顺序合理、事实与结果清楚，不能确认经历真伪。');
  });
  add(ids.oral, 'oral-retell-limit', 'transfer', '区分材料事实与个人补充的解释', '事实材料与可能原因 → 复述时遵守证据边界', '可以说明合理猜测，但必须标明非材料事实。', 120, n => {
    const [paragraph, answer] = summaries[n]; return audio(`材料事实是：“${paragraph}”为什么采取行动，材料没有直接说明。请先复述事实，再说一个可能原因，并明确哪部分是推测。`, answer,
      '量规分别核对事实复述和无依据推测的边界；不奖励把猜测说成事实。', [table(['材料事实', '未说明'], [[paragraph, '行动动机']])]);
  });
  return families;
}

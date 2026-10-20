import type { MeasurementDimension, QuestionBlock } from '@study-agent/contracts';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'family' | 'dimension'>;
const names = ['小禾', '小林', '小雨', '小文', '小宁', '小安', '小川', '小贝', '小晴', '小乐', '小星', '小满'];
const places = ['图书馆', '花园', '教室', '庭院', '厨房', '窗台', '活动室', '门厅'];
const actions = ['借书', '浇花', '擦黑板', '摆椅子', '洗水果', '擦花盆', '收画笔', '贴标签'];
const table = (headers: string[], rows: string[][]): QuestionBlock => ({ id: 'record', type: 'table', headers, rows });
const rotate = <T,>(values: readonly T[], n: number) => [...values.slice(n % values.length), ...values.slice(0, n % values.length)];
const choice = (stem: string, answer: string, options: string[], analysis: string, blocks?: QuestionBlock[]): Task => ({
  stem, answer, options: rotate([...new Set([answer, ...options])], stem.length), mode: 'single_choice', analysis, ...(blocks ? { blocks } : {}) });
const blanks = (stem: string, values: Array<[string, string, string]>, analysis: string, blocks?: QuestionBlock[]): Task => ({ stem,
  answer: values.map(([key, , value]) => ({ key, value })), mode: 'multi_blank', responseShape: { entries: values.map(([key, label]) => ({ key, label })) }, analysis,
  ...(blocks ? { blocks } : {}) });
const sequenceRubric = [{ criterion: '两个动作准确且顺序合理', weight: 0.4 }, { criterion: '使用合适的先后连接词', weight: 0.3 },
  { criterion: '句子完整通顺，不添加材料外信息', weight: 0.3 }];
const written = (stem: string, reference: string, blocks?: QuestionBlock[]): Task => ({ stem, answer: reference, mode: 'short_answer', rubric: sequenceRubric,
  analysis: `参考表达：${reference}。量规核对两个动作、顺序连接和句子完整性；同一顺序的合理措辞可以接受。`, ...(blocks ? { blocks } : {}) });

const locate = 'foundation:chinese:g2-locate', cause = 'foundation:chinese:g2-cause', polyphone = 'core:chinese:polyphone';
const homophone = 'core:chinese:homophone', synonym = 'core:chinese:synonym', reduplication = 'core:chinese:reduplication';
const because = 'core:chinese:because', pronoun = 'core:chinese:pronoun', timeword = 'core:chinese:timeword';
const listpunct = 'core:chinese:listpunctuation', instruction = 'core:chinese:instruction', sequence = 'core:chinese:sequence-writing';

export function buildChineseGrade2ProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const add = (atomId: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string, distinction: string,
    seconds: number, make: (n: number) => Task) => result.push({ atomId, family, dimension, behavior, structure, distinction,
    exercises: Array.from({ length: 12 }, (_, n) => { const item = make(n); return { ...item, stem: `${names[n]}的${['课堂记录', '家庭练习', '阅读任务', '操作记录'][n % 4]}：${item.stem}`,
      family, dimension, identityVersion: 2, expectedSeconds: seconds }; }) });

  add(locate, 'locate-structure-0', 'understanding', '核对人物、动作与地点三个条件', '多条件短句 → 定位对应地点', '沿用显式定位；更多条件不等于独立结构。', 50, n => {
    const name = names[n], place = places[n % places.length], action = actions[n % actions.length];
    return choice(`${name}先在走廊停留，随后在${place}${action}。题目问${name}实际${action}的地点。`, place,
      [places[(n + 3) % places.length], '走廊', places[(n + 6) % places.length]], `${action}发生在${place}；“先在走廊停留”不是问题所问动作的地点。`);
  });
  add(locate, 'locate-structure-1', 'procedure', '从两段时间记录分别填写地点', '两条带时间的事件表 → 填写地点', '需要同时保留时间和动作。', 80, n => {
    const first = places[n % places.length], second = places[(n + 3) % places.length];
    return blanks('按下表两次活动分别填写地点。', [['first', '上午活动地点', first], ['second', '下午活动地点', second]],
      `上午在${first}，下午在${second}；按时间与动作分别定位。`, [table(['时段', '人物', '动作'], [['上午', names[n], actions[n % actions.length]], ['下午', names[n], actions[(n + 2) % actions.length]]])]);
  });
  add(locate, 'locate-update', 'transfer', '只采用最新更新的地点', '原地点与明确新地点 → 最新地点', '先出现的旧信息必须排除。', 80, n => {
    const old = places[n % places.length], latest = places[(n + 4) % places.length];
    return choice(`活动原定在${old}登记，随后最新通知改为${latest}。现在应该去哪里登记？`, latest, [old, places[(n + 6) % places.length], '原地点和新地点都去'],
      `最新通知把登记地点改为${latest}；原地点已经更新。`, [table(['版本', '登记地点'], [['原通知', old], ['最新通知', latest]])]);
  });
  add(locate, 'locate-event-filter', 'transfer', '从事件表选出指定地点的全部活动', '四条地点/动作记录 → 全部匹配项', '需要筛选完整记录并排除同人物其他地点。', 100, n => {
    const target = places[n % places.length], rows = [0, 1, 2, 3].map(i => [names[(n + i) % names.length], i % 2 ? target : places[(n + i + 2) % places.length], `${actions[(n + i) % actions.length]}${i + 1}号`]);
    return { stem: `选择所有地点为${target}的活动。`, mode: 'multiple_choice', options: rows.map(row => row[2]), answer: rows.filter(row => row[1] === target).map(row => row[2]),
      blocks: [table(['人物', '地点', '活动'], rows)], analysis: `只选地点列等于${target}的两项，其他动作即使在表中出现也不匹配。` };
  });

  add(cause, 'cause-syntax-0', 'understanding', '从明示因果句识别原因', '材料事实 → 对应结果 → 原因', '原因和结果方向固定。', 50, n => {
    const pairs = [['路面积水', '活动改到室内'], ['忘带尺子', '向同伴借用'], ['风太大', '收起纸牌'], ['光线不足', '打开台灯'], ['书页破损', '贴上修补纸'], ['人太多', '增加一组座位'],
      ['水壶空了', '重新装水'], ['雾很浓', '推迟出发'], ['地面湿滑', '放慢脚步'], ['纸张不够', '改用卡片'], ['鞋带松开', '停下来系好'], ['天气变凉', '增加外套']]; const [why, result] = pairs[n];
    return choice(`因为${why}，所以${result}。哪项说明原因？`, why, [result, '结果和原因相同', '材料没有因果'], `${why}引起${result}；题目问原因，不能选结果。`);
  });
  add(cause, 'cause-syntax-1', 'procedure', '为三个结果填写明示原因', '三条短材料与结果表 → 分别写原因', '需要保持多个因果链。', 90, n => {
    const pairs = [['下雨', '路滑'], ['缺水', '叶子变软'], ['闹钟响', '按时起床'], ['灯坏了', '使用手电'], ['纸太薄', '装入硬夹'], ['人数增加', '增加桌椅'],
      ['桥面检修', '公交改道'], ['风变大了', '收起纸牌'], ['书页破损', '贴修补贴'], ['场地积水', '比赛延期'], ['忘带水杯', '借杯子'], ['雾很大', '推迟出发']];
    const selected = [0, 4, 8].map(i => pairs[(n + i) % 12]);
    return blanks('按下表明确材料填写各结果的原因。', selected.map(([why], i) => [`c${i}`, `结果${i + 1}的原因`, why]),
      selected.map(([why, result]) => `${result}对应${why}`).join('；') + '。', [table(['记录', '明确材料', '结果'], selected.map(([why, result], i) => [String(i + 1), `${why}导致${result}`, result]))]);
  });
  add(cause, 'cause-chain-reverse', 'transfer', '从最终结果反查同一条因果链', '两个连续结果与完整事件表 → 指定结果的直接原因', '不能把上一条链的原因移给下一条结果。', 90, n => {
    const rows = [['材料受潮', '字迹模糊', '重新誊写'], ['零件不全', '暂停装配', '补领零件'], ['人数增加', '座位不足', '增加座位'], ['水管漏水', '地面湿滑', '放置提示牌']]; const [why, middle, final] = rows[n % 4];
    return choice(`完整记录为“${why}导致${middle}，因此${final}”。题目问“${final}”的直接原因。`, middle, [why, final, '材料没有说明'],
      `直接导致${final}的是${middle}；${why}是更早的前因，不能跨过中间结果。`, [table(['先后', '事件'], [['先', `${why}→${middle}`], ['后', `${middle}→${final}`]])]);
  });
  add(cause, 'cause-record-repair', 'transfer', '修复因果表中唯一颠倒记录', '三条材料、因、果记录 → 定位颠倒行并改因果方向', '需要定位错误后重新写起点与结果。', 110, n => {
    const broken = n % 3, pairs = [['下雨', '带伞'], ['缺水', '浇水'], ['灯坏', '换灯']];
    const rows = pairs.map(([why, result], i) => [String(i + 1), i === broken ? `${result}导致${why}` : `${why}导致${result}`]);
    return blanks('下表只有一行的因果方向颠倒，填写行号和正确的起点事件。', [['row', '颠倒行编号', String(broken + 1)], ['cause', '正确原因', pairs[broken][0]]],
      `第${broken + 1}行应是“${pairs[broken][0]}导致${pairs[broken][1]}”，而不是把结果写成原因。`, [table(['行', '材料'], rows)]);
  });

  const pinyin = [['行走', '行', 'xíng'], ['银行', '行', 'háng'], ['长大', '长', 'zhǎng'], ['长河', '长', 'cháng'], ['快乐', '乐', 'lè'], ['音乐', '乐', 'yuè'],
    ['重新', '重', 'chóng'], ['重量', '重', 'zhòng'], ['发现', '发', 'fā'], ['头发', '发', 'fà'], ['干净', '干', 'gān'], ['干活', '干', 'gàn']];
  add(polyphone, 'word-polyphone', 'understanding', '按词语意义选择多音字读音', '明确词语 → 多音字读音', '读音由整个词的意义决定。', 50, n => {
    const [word, char, reading] = pinyin[n], alternatives = pinyin.filter(row => row[1] === char && row[2] !== reading).map(row => row[2]);
    return choice(`“${word}”中的“${char}”读什么？`, reading, [...alternatives, 'bù'], `“${word}”的固定词义对应读音${reading}；相同字形在其他词里可能读别的音。`);
  });
  add(polyphone, 'phrase-polyphone', 'procedure', '根据三个语境填写多音字读音', '三张带意义说明的词语卡 → 逐项写读音', '同一字的多个读音分开核对。', 90, n => {
    const selected = [0, 4, 8].map(i => pinyin[(n + i) % 12]);
    return blanks('按下表词语填写加引号字的读音。', selected.map(([word, , reading], i) => [`p${i}`, `${word}的读音`, reading]),
      selected.map(([word, char, reading]) => `${word}中${char}读${reading}`).join('；') + '。', [table(['记录', '词语', '意义提示'], selected.map(([word, , reading], i) => [String(i + 1), word, `按常用词义读${reading}`]))]);
  });
  add(polyphone, 'polyphone-record-check', 'transfer', '逐行核对词语与读音记录', '四个词语/读音记录 → 选出所有一致项', '需要同时读词义与拼音标签。', 100, n => {
    const rows = [0, 3, 6, 9].map(i => pinyin[(n + i) % 12]), labels = ['甲', '乙', '丙', '丁'];
    const displayed = rows.map(([word, , reading], i) => [labels[i], word, i === n % 4 ? pinyin.find(([, , value]) => value !== reading)![2] : reading]);
    return { stem: '选择所有词语与其读音记录一致的项。', mode: 'multiple_choice', options: rotate(labels, n),
      answer: displayed.filter(row => pinyin.find(([word]) => word === row[1])![2] === row[2]).map(row => row[0]), blocks: [table(['记录', '词语', '已有读音'], displayed)],
      analysis: '逐行按词语意义核对读音；只有一个故意改动项。' };
  });
  add(polyphone, 'polyphone-record-repair', 'transfer', '修复多音字读音表中唯一错误', '三条词语读音表 → 定位错误并替换', '复合任务保留阅读和字形辨认替代解释。', 110, n => {
    const broken = n % 3, selected = [0, 4, 8].map(i => pinyin[(n + i) % 12]), wrong = pinyin.find(row => row[2] !== selected[broken][2])![2];
    const rows = selected.map(([word, , reading], i) => [String(i + 1), word, i === broken ? wrong : reading]);
    return blanks('下表只有一行读音不符合词语意义，填写行号和正确读音。', [['row', '错误行', String(broken + 1)], ['reading', '正确读音', selected[broken][2]]],
      `第${broken + 1}行“${selected[broken][0]}”应读${selected[broken][2]}。`, [table(['行', '词语', '已有读音'], rows)]);
  });

  const homophones = [['时间', '间', ['肩', '坚']], ['阳光', '阳', ['洋', '杨']], ['河水', '河', ['和', '合']], ['和平', '和', ['禾', '河']],
    ['站立', '站', ['战', '占']], ['再见', '再', ['在', '载']], ['公园', '园', ['圆', '员']], ['座位', '座', ['坐', '作']], ['已经', '已', ['以', '己']],
    ['远近', '近', ['进', '尽']], ['爱护', '护', ['户', '互']], ['完成', '完', ['玩', '碗']]] as const;
  add(homophone, 'compound-meaning', 'understanding', '按词语意义选择同音字', '词义说明与缺字词 → 正确汉字', '同音不表示可以互换。', 50, n => {
    const [word, answer, decoys] = homophones[n]; return choice(`“${word}”缺少的字应选哪一个？`, answer, [...decoys], `“${word}”表示固定词语意义，必须用“${answer}”；另外的字虽然可能同音但意义不同。`);
  });
  add(homophone, 'semantic-context', 'procedure', '根据三个短句填写同音字', '语义与搭配明确的短句 → 逐项选字', '需要整句意义而不只看读音。', 90, n => {
    const selected = [0, 4, 8].map(i => homophones[(n + i) % 12]);
    return blanks('按短句意义填写正确汉字。', selected.map(([word, answer], i) => [`h${i}`, `“${word}”的正确字`, answer]),
      selected.map(([word, answer]) => `${word}用${answer}`).join('；') + '。', [table(['记录', '词语', '意义说明'], selected.map(([word, answer], i) => [String(i + 1), word, `该词使用${answer}`]))]);
  });
  add(homophone, 'homophone-stock', 'transfer', '从有限同音字库存选字', '缺字短语 + 四字库存 → 选择唯一搭配', '需要把语义与完整库存比较。', 90, n => {
    const [word, answer, decoys] = homophones[n], options = rotate([answer, ...decoys, '口'], n);
    return choice(`从给定库存中为“____”所在词语“${word}”选择正确汉字。`, answer, options.filter(value => value !== answer),
      `只有“${answer}”能组成“${word}”，其他字符库存存在但不能表达该词义。`);
  });
  add(homophone, 'homophone-repair', 'transfer', '修复同音字表中唯一搭配错误', '三行词语与汉字记录 → 定位错误并修正', '必须按词义定位，不能按读音或字形相似。', 110, n => {
    const broken = n % 3, selected = [0, 4, 8].map(i => homophones[(n + i) % 12]);
    const rows = selected.map(([word, answer, decoys], i) => [String(i + 1), word, i === broken ? decoys[0] : answer]);
    return blanks('下表只有一行的汉字与词语意义不符，填写行号和正确汉字。', [['row', '错误行编号', String(broken + 1)], ['char', '正确汉字', selected[broken][1]]],
      `第${broken + 1}行“${selected[broken][0]}”应使用${selected[broken][1]}；其他词语与字义一致。`, [table(['行', '词语', '已有汉字'], rows)]);
  });

  const synonyms = [['高兴', '开心'], ['美丽', '漂亮'], ['认真', '仔细'], ['立刻', '马上'], ['寒冷', '冰冷'], ['安静', '宁静'],
    ['帮助', '协助'], ['清楚', '明白'], ['爱护', '保护'], ['寻找', '搜寻'], ['惊讶', '吃惊'], ['坚固', '结实']] as const;
  add(synonym, 'synonym-isolated', 'understanding', '在同一语境选择近义替换', '句子中的词语与候选 → 意义基本不变', '近义不代表任何语境都可互换。', 50, n => {
    const [word, replacement] = synonyms[n]; return choice(`把句子中的“${word}”换成哪个词后意思最接近？`, replacement,
      rotate(synonyms.map(row => row[0]).filter(value => value !== word), n).slice(0, 2), `${word}与${replacement}意义相近，替换后原句关系基本保持。`);
  });
  add(synonym, 'synonym-context', 'procedure', '为三个句境填写近义表达', '三句明确语境 → 逐项填近义词', '替换后要读回整句。', 90, n => {
    const selected = [0, 4, 8].map(i => synonyms[(n + i) % 12]);
    return blanks('为每个原词填写本句可接受的近义词。', selected.map(([word, replacement], i) => [`s${i}`, word, replacement]),
      selected.map(([word, replacement]) => `${word}可换${replacement}`).join('；') + '。', [table(['记录', '原词', '语境'], selected.map(([word], i) => [String(i + 1), word, `在句子中表示${word}的常用意义`]))]);
  });
  add(synonym, 'synonym-stock', 'transfer', '从有限词卡核对近义关系', '五张词卡与一个目标词 → 选择合适替换', '需要检查词义范围而非熟悉程度。', 90, n => {
    const [word, replacement] = synonyms[n], others = rotate(synonyms, n + 3).slice(0, 2).map(row => row[0]);
    return choice(`目标词为“${word}”。从库存中选最接近的近义词。`, replacement, others, `${word}与${replacement}意义最接近；另外的词只是同主题或不同动作。`);
  });
  add(synonym, 'synonym-record-repair', 'transfer', '修复近义词表中唯一不成立的替换', '三行原词/替换/语境 → 找不保留原意的行并修正', '综合失败保留语境理解替代解释。', 110, n => {
    const broken = n % 3, selected = [0, 4, 8].map(i => synonyms[(n + i) % 12]);
    const rows = selected.map(([word, replacement], i) => [String(i + 1), word, i === broken ? synonyms[(n + 1) % 12][0] : replacement, '检查替换后意义是否保持']);
    return blanks('下表只有一行的替换词与原词意义不相近，填写行号与正确近义词。', [['row', '错误行', String(broken + 1)], ['word', '正确近义词', selected[broken][1]]],
      `第${broken + 1}行“${selected[broken][0]}”应换为${selected[broken][1]}；其他行保持原句意义。`, [table(['行', '原词', '已有替换', '核对'], rows)]);
  });

  const redup = [['干干净净', 'AABB', '干净'], ['研究研究', 'ABAB', '研究'], ['明明白白', 'AABB', '明白'], ['讨论讨论', 'ABAB', '讨论'],
    ['高高兴兴', 'AABB', '高兴'], ['整理整理', 'ABAB', '整理'], ['清清楚楚', 'AABB', '清楚'], ['练习练习', 'ABAB', '练习'],
    ['安安静静', 'AABB', '安静'], ['考虑考虑', 'ABAB', '考虑'], ['漂漂亮亮', 'AABB', '漂亮'], ['商量商量', 'ABAB', '商量']] as const;
  add(reduplication, 'pattern-identify', 'understanding', '按逐位置重复关系辨认叠词形式', '一个明确叠词 → AABB或ABAB', '不能只数四个字。', 50, n => {
    const [word, form] = redup[n]; return choice(`“${word}”属于哪种重复形式？`, form, [form === 'AABB' ? 'ABAB' : 'AABB', 'ABAC', 'ABCA'], `${word}逐位置对应${form}；判断依据是重复单元，不是总字数。`);
  });
  add(reduplication, 'pattern-select', 'procedure', '为有限词卡选择指定形式', '四张词卡与目标形式 → 找出全部匹配', '需要逐卡分解重复结构。', 85, n => {
    const target = n % 2 ? 'ABAB' : 'AABB', chosen = rotate(redup, n).slice(0, 4), answer = chosen.filter(row => row[1] === target).map(row => row[0]);
    return { stem: `选择所有符合${target}形式的词语。`, mode: 'multiple_choice', options: chosen.map(row => row[0]), answer,
      analysis: `${answer.join('、')}符合${target}；其余四字词的结构不同。` };
  });
  add(reduplication, 'pattern-card-match', 'transfer', '把词卡与重复形式完整配对', '三张词卡与形式卡 → 完整配对', '需要在有限库存内保持一对一。', 90, n => {
    const selected = [0, 3].map(i => redup[(n + i) % 12]);
    return { stem: '为三张词卡选择各自的重复形式，每张使用一次。', mode: 'matching', responseShape: {
      left: rotate(selected.map(([word], i) => ({ id: `w${i}`, label: word })), n), right: rotate([...new Set(selected.map(([, form]) => form))].map((form, i) => ({ id: `f${i}`, label: form })), n + 1) },
      answer: { pairs: selected.map(([, form], i) => ({ left: `w${i}`, right: `f${['AABB', 'ABAB', 'ABAC'].indexOf(form)}` })) },
      analysis: selected.map(([word, form]) => `${word}为${form}`).join('；') + '。' };
  });
  add(reduplication, 'pattern-record-repair', 'transfer', '修复叠词形式表中唯一错误', '三条词语/形式记录 → 定位错误并替换', '需要逐字比较四次位置。', 105, n => {
    const broken = n % 3, selected = [0, 4, 8].map(i => redup[(n + i) % 12]);
    const rows = selected.map(([word, form], i) => [String(i + 1), word, i === broken ? (form === 'AABB' ? 'ABAB' : 'AABB') : form]);
    return blanks('下表只有一行的重复形式标错，填写行号和正确形式。', [['row', '错误行', String(broken + 1)], ['form', '正确形式', selected[broken][1]]],
      `第${broken + 1}行“${selected[broken][0]}”按逐位置关系是${selected[broken][1]}。`, [table(['行', '词语', '已有形式'], rows)]);
  });

  add(because, 'cause-to-result', 'understanding', '选择结果前的因果连接词', '因为+原因与空格结果 → 所以', '连接词要与因果方向匹配。', 45, n => {
    const [why, result] = [['下雨', '带伞'], ['天冷', '穿外套'], ['路滑', '放慢脚步'], ['灯坏', '换灯泡']][n % 4]; return choice(`因为${why}，____${result}。`, '所以', ['但是', '虽然', '如果'], `${why}是原因，后面${result}是结果，用“所以”连接。`);
  });
  add(because, 'result-to-cause', 'procedure', '在三个结果前填写原因连接词', '三组原因/结果 → 逐项填“因为”', '反向语境观察同一关联。', 80, n => {
    const pairs = [['下雨', '带伞'], ['缺水', '浇水'], ['路滑', '慢走'], ['人少', '合并座位'], ['纸破', '修补'], ['光线暗', '开灯']];
    return blanks('每组结果前填写原因连接词“因为”。', pairs.map(([why], i) => [`c${i}`, `说明${why}的连接词`, '因为']), '三组都先用“因为”引出来源条件，再用“所以”说明结果。',
      [table(['记录', '原因', '结果'], pairs.map(([why, result], i) => [String(i + 1), why, result]))]);
  });
  add(because, 'connector-chain', 'transfer', '保持连续因果链的连接方向', '两个前后相连结果 → 区分前因与直接原因', '不能把某一结果后的“所以”倒置。', 90, n => {
    const chain = [['纸张破损', '字迹漏出', '重新誊写'], ['人数增加', '座位不足', '增加椅子'], ['场地积水', '活动危险', '改到室内'], ['水壶空了', '无法喝水', '重新装水']][n % 4];
    return choice(`完整记录：“因为${chain[0]}，所以${chain[1]}；因此${chain[2]}。”哪个是“${chain[2]}”的直接前因？`, chain[1], [chain[0], chain[2], '没有原因'], `${chain[1]}直接导致${chain[2]}；${chain[0]}是更早的条件。`);
  });
  add(because, 'connector-record-repair', 'transfer', '修复关联词表中唯一方向错误', '三行原因、连接词、结果 → 找错行并修正', '连接词改变会颠倒逻辑关系。', 105, n => {
    const broken = n % 3, pairs = [['下雨', '所以', '带伞'], ['缺水', '然后', '浇水'], ['路滑', '所以', '慢走']]; const rows = pairs.map(([why, connector, result], i) => [String(i + 1), why, i === broken ? '所以但' : connector, result]);
    return blanks('下表只有一行连接词不能正确连接因果，填写行号和应有连接词。', [['row', '错误行', String(broken + 1)], ['connector', '正确连接词', '所以']],
      `第${broken + 1}行原因在前、结果在后，应使用“所以”；“然后”只表先后。`, [table(['行', '原因', '已有连接词', '结果'], rows)]);
  });

  add(pronoun, 'adjacent-pronoun', 'understanding', '依据明确性别与动作还原相邻代词', '两句人物/动作 → 指代对象', '不能按最近名词机械匹配。', 50, n => {
    const name = names[n], action = ['画画', '读书', '浇花', '跑步'][n % 4], gender = n % 2 ? '女' : '男', pronoun = gender === '女' ? '她' : '他';
    return choice(`${name}是${gender}孩。${pronoun}在${action}。“${pronoun}”指谁？`, name, [names[(n + 3) % 12], action, '没有人物'], `${gender}孩${name}与代词${pronoun}一致；动作词不是人物。`);
  });
  add(pronoun, 'speaker-pronoun', 'procedure', '区分说话者、受话者与第三人称', '一段明确对话 → 填写代词指向', '说话视角会改变“你/他/她”。', 80, n => {
    const speaker = names[n], listener = names[(n + 2) % 12], other = names[(n + 5) % 12];
    return blanks(`记录为：“${other}是男孩。${speaker}对${listener}说：‘他完成了任务。’”填写“你/他”的指向。`, [['you', '“你”指', listener], ['he', '“他”指', other]],
      `对话中“你”面向${listener}；“他”按材料明确指向男孩${other}。`, [table(['角色', '人物'], [['说话者', speaker], ['受话者', listener], ['被谈论者', other]])]);
  });
  add(pronoun, 'reference-chain', 'transfer', '追踪两段交接后的代词指向', '两人交接物品 → 后续“他/它”指代', '距离最近与动作角色要分开判断。', 95, n => {
    const first = names[n], second = names[(n + 3) % 12], object = ['地图', '钥匙', '画册'][n % 3];
    return blanks(`${first}把${object}交给${second}，提醒他收好。填写“他”和“它”的指向。`, [['he', '“他”指', second], ['it', '“它”指', object]],
      `“他”指接收者${second}，“它”指被交接的${object}；人物和物品类型不同。`);
  });
  add(pronoun, 'ambiguous-reference', 'transfer', '辨认代词不明并要求明确改写', '含两个候选人物与代词 → 选择唯一不含歧义的表达', '材料不足时改写应明确对象。', 100, n => {
    const first = names[n], second = names[(n + 4) % 12];
    return choice(`${first}对${second}说：“你拿好地图。”谁说“你”指${second}？`, `${first}说：“${second}，请你拿好地图。”`, [`${first}和${second}说她拿好地图`, '她说：“你拿好地图”', '他不知道谁拿地图'],
      `只有明确指出受话者${second}的表达没有歧义；单纯“她/他”无法确认指向。`);
  });

  add(timeword, 'schedule-slot', 'understanding', '把动作与具体时间槽对应', '两条日程记录 → 指定动作时间', '需要同时保留日期与活动。', 50, n => {
    const day = ['周一', '周二', '周三', '周四'][n % 4], time = ['上午', '下午'][n % 2], other = `${day}${time === '上午' ? '下午' : '上午'}`;
    return choice(`记录写“${day}${time}参观，${other}整理资料”。参观在什么时间？`, `${day}${time}`, [other, '周五晚上', '没有日期'], `${day}${time}与“参观”同句；另一时间对应整理资料。`);
  });
  add(timeword, 'start-end-distinction', 'procedure', '分别填写开始与结束时间', '一条活动时间记录 → 两个时间字段', '开始与结束不能互换。', 75, n => {
    const start = 8 + n % 4, end = start + 2; return blanks(`活动${start}点开始、${end}点结束。填写开始与结束时间。`, [['start', '开始', `${start}点`], ['end', '结束', `${end}点`]],
      `记录明确从${start}点开始到${end}点结束，两个字段不能互换。`);
  });
  add(timeword, 'time-update', 'transfer', '按最新通知确定当前时间', '原时间与更新后时间 → 现在执行时间', '旧时间必须排除。', 80, n => {
    const old = `${8 + n % 3}点`, latest = `${14 + n % 3}点`; return choice(`集合原定${old}，最新通知改为${latest}。按最新通知什么时候集合？`, latest, [old, '原定和新时间都可以', '没有时间'],
      `最新通知将集合时间改为${latest}；${old}已经失效。`, [table(['版本', '时间'], [['原通知', old], ['最新通知', latest]])]);
  });
  add(timeword, 'schedule-filter', 'transfer', '从完整日程筛选指定时段活动', '四行日期/时段/活动表 → 选择全部匹配项', '日期、上午/下午和活动都要核对。', 95, n => {
    const target = ['周一上午', '周二下午', '周三上午', '周四下午'][n % 4], rows = [0, 1, 2, 3].map(i => [['周一上午', '周二下午', '周三上午', '周四下午'][(n + i) % 4], `${actions[i]}${n + i}`]);
    return { stem: `选择所有安排在${target}的活动。`, mode: 'multiple_choice', options: rows.map(row => row[1]), answer: rows.filter(row => row[0] === target).map(row => row[1]), blocks: [table(['时间', '活动'], rows)], analysis: `只有时间列等于${target}的活动匹配。` };
  });

  add(listpunct, 'enumeration-function', 'understanding', '辨认顿号表示同层并列', '三个并列词语 → 标点作用', '顿号不结束句子也不提问。', 45, n => {
    const list = [['苹果', '香蕉', '梨'], ['红色', '黄色', '蓝色'], ['跳绳', '跑步', '游泳'], ['铅笔', '橡皮', '尺子']][n % 4]; return choice(`“${list.join('、')}”中的“、”表示什么？`, '同层并列词语间的停顿', ['一句话结束', '提出问题', '解释原因'], '三项处于同一列表层级，顿号分隔并列词语，不是句末标点。');
  });
  add(listpunct, 'enumeration-insert', 'procedure', '在三个并列项之间填写标点', '连续并列词语 → 顿号', '多个空位仍是一份作答。', 75, n => {
    const lists = [['苹果', '香蕉', '梨'], ['红', '黄', '蓝'], ['跑', '跳', '游']]; return blanks('在两个并列位置填写同一种标点。', [['a', '第1项后', '、'], ['b', '第2项后', '、']],
      `${lists[n % 3].join('、')}中同层并列项之间都使用顿号。`);
  });
  add(listpunct, 'list-record-repair', 'transfer', '修复列举表中唯一错误标点', '三条三项列表 → 找错误行并改标点', '需要区分顿号、句号和问号。', 100, n => {
    const broken = n % 3, lists = [['苹果、香蕉、梨。', '苹果，香蕉，梨。'], ['红色、黄色、蓝色。', '红色。黄色。蓝色。'], ['铅笔、橡皮、尺子。', '铅笔？橡皮？尺子？']]; const rows = lists.map(([, wrong], i) => [String(i + 1), i === broken ? wrong : lists[i][0]]);
    return blanks('下表只有一行没有用顿号分隔同层并列词语，填写行号与正确列表。', [['row', '错误行', String(broken + 1)], ['list', '正确列表', lists[broken][0]]],
      `第${broken + 1}行同层词语之间应使用顿号；其他行已经正确。`, [table(['行', '现有列表'], rows)]);
  });
  add(listpunct, 'enumeration-scope', 'transfer', '按并列层级选择完整标点方案', '句内并列与句末功能 → 选择正确方案', '顿号只处理同层并列，句末仍用句号。', 80, n => {
    const items = [['苹果', '梨', '香蕉'], ['红', '黄', '蓝'], ['读', '写', '算'], ['书', '笔', '尺']][n % 4]; return choice(`把“${items.join('')}”写成完整陈述句，哪种标点正确？`, `${items.join('、')}。`, [`${items.join('，')}。`, `${items.join('、')}？`, `${items.join('。')}。`],
      `同层并列项之间用顿号，整句结束用句号。`);
  });

  add(instruction, 'object-condition', 'understanding', '同时保留对象和排除条件', '两对象指令 → 目标对象', '不能忽略“只、不要”等限制。', 50, n => {
    const colors = ['红色', '蓝色', '绿色'][n % 3], other = colors === '红色' ? '蓝色' : '红色'; return choice(`“只把${colors}积木放进盒子，${other}留在桌上。”盒中应放？`, `${colors}积木`, [`${other}积木`, '全部积木', '空盒子'], `“只”限定${colors}，“${other}留在桌上”是排除条件。`);
  });
  add(instruction, 'operation-sequence', 'procedure', '分别填写两步操作', '先……再……指令 → 两步顺序', '两个空位必须保持先后。', 75, n => {
    const pairs = [['圈出动词', '给名词画线'], ['读题', '写答案'], ['核对题号', '填写表格']]; return blanks(`指令：“先${pairs[n % 3][0]}，再${pairs[n % 3][1]}。”填写步骤。`, [['first', '第一步', pairs[n % 3][0]], ['next', '第二步', pairs[n % 3][1]]],
      `“先”对应${pairs[n % 3][0]}，“再”对应${pairs[n % 3][1]}。`);
  });
  add(instruction, 'instruction-update', 'transfer', '按最新指令排除旧动作', '原指令与明确更新 → 当前操作', '旧步骤已经更新。', 90, n => {
    const old = '把圆片放进红盒', latest = '把圆片放进蓝盒'; return choice(`原指令是“${old}”，随后更新为“${latest}”。现在应怎么做？`, latest, [old, '两个盒子都放', '停止操作'],
      `最新指令明确改为${latest}，原动作已经失效。`, [table(['版本', '操作'], [['原指令', old], ['最新指令', latest]])]);
  });
  add(instruction, 'instruction-table', 'transfer', '从对象/动作/条件表执行完整指令', '三行指令表 → 指定对象应执行动作', '目标行必须同时满足对象和条件。', 100, n => {
    const rows = [['红色圆片', '放入蓝盒', '圆形'], ['蓝色方片', '留在桌上', '方形'], ['绿色圆片', '放入绿盒', '圆形']]; const target = rows[n % 3];
    return choice(`只根据条件“${target[2]}且颜色为${target[0].slice(0, 2)}”执行，应做什么？`, target[1], [rows[(n + 1) % 3][1], '移动全部卡片', '不用操作'],
      `${target[0]}同时满足指定颜色和形状，对应动作是${target[1]}。`, [table(['对象', '条件', '动作'], rows.map(([object, action, condition]) => [object, condition, action]))]);
  });

  add(sequence, 'source-based-production', 'understanding', '辨认正确保留两个动作顺序的表达', '两个已排序动作 → 选择完整句', '只核对顺序和句子完整。', 55, n => {
    const pairs = [['洗水果', '吃水果'], ['读题', '答题'], ['装书', '穿外套']][n % 3]; return choice(`材料明确先${pairs[0]}再${pairs[1]}。哪句完整保留顺序？`, `先${pairs[0]}，再${pairs[1]}。`, [`只${pairs[1]}。`, `先${pairs[1]}，再${pairs[0]}。`, pairs.join('和') + '。'],
      `参考句保留两个动作及“先……再……”顺序，其他选项漏动作或颠倒。`);
  });
  add(sequence, 'personal-production', 'procedure', '用先后连接词写两步个人经历', '两张个人经历动作卡 → 完整顺序句', '短答按冻结量规复核，允许合理措辞。', 110, n => {
    const pairs = [['先在纸上画草图', '再给图上色'], ['先把书放回书架', '再整理文具'], ['先洗苹果', '再把苹果装盘']]; return written(`用“先……再……”写清：${pairs[n % 3][0]}、${pairs[n % 3][1]}。`, `${pairs[n % 3][0]}，${pairs[n % 3][1]}。`);
  });
  add(sequence, 'sequence-repair', 'transfer', '修复遗漏顺序词或动作的短答任务', '残缺步骤句 → 写出完整两步经过', '需要补全而不是只替换一个词。', 110, n => {
    const pairs = [['读题', '答题'], ['洗米', '煮饭'], ['穿袜', '穿鞋']]; return written(`提纲只写“${pairs[n % 3].join('、')}”，没有先后连接。请写成完整通顺的两步顺序句。`, `先${pairs[n % 3][0]}，再${pairs[n % 3][1]}。`);
  });
  add(sequence, 'sequence-event-table', 'transfer', '依据两行事件卡写指定顺序经过', '起始动作和后续动作表 → 完整短答', '必须使用正确目标行并保留先后。', 115, n => {
    const selected = [0, 1, 2].map(i => [['洗水果', '摆盘'], ['读题', '答题'], ['折纸', '贴标签']][(n + i) % 3]); const target = selected[n % 3];
    return written(`只根据表的第${n % 3 + 1}行，用“先……再……”写清两个动作。`, `先${target[0]}，再${target[1]}。`, [table(['行', '先做', '再做'], selected.map(([first, second], i) => [String(i + 1), first, second]))]);
  });
  return result;
}

export function buildChineseOralGrade2ProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const rubric = [{ criterion: '两个动作及其先后关系准确', weight: 0.4 }, { criterion: '使用清楚合理的口头顺序表达', weight: 0.3 },
    { criterion: '关键内容可听清；允许自然停顿和自我修正，不因口音差异扣分', weight: 0.3 }];
  const add = (family: string, dimension: MeasurementDimension, behavior: string, structure: string, distinction: string, seconds: number, make: (n: number) => Task) =>
    result.push({ atomId: 'core:chinese:oral-sequence', family, dimension, behavior, structure, distinction,
      exercises: Array.from({ length: 12 }, (_, n) => { const item = make(n); return { ...item, stem: `${names[n]}的口头顺序任务：${item.stem}`,
        family, dimension, identityVersion: 2, expectedSeconds: seconds }; }) });
  const audio = (stem: string, answer: string, analysis: string, blocks?: QuestionBlock[]): Task => ({ stem: `${stem} 请录音回答，可先试听，最长3分钟。`, answer,
    mode: 'audio_record', responseShape: { mediaPolicy: 'student-media-v1' }, rubric, analysis, ...(blocks ? { blocks } : {}) });
  add('oral-sequence-source', 'procedure', '口头说出材料中的两步顺序', '已明示两个动作 → 录制顺序表达', '不得颠倒材料。', 100, n => {
    const [a, b] = [['洗苹果', '吃苹果'], ['读题', '答题'], ['折纸', '贴标签'], ['洗米', '煮饭']][n % 4]; return audio(`材料明确先${a}，再${b}。请按顺序完整说一遍。`, `先${a}，再${b}。`, '量规核对两个动作及顺序，语句完整可听清。');
  });
  add('oral-sequence-cards', 'procedure', '用两张动作卡组织自己的口头顺序', '先做/再做信息卡 → 自主措辞', '不提供整句，允许自然连接。', 110, n => {
    const [a, b] = [['洗水果', '摆盘'], ['装书', '穿外套'], ['擦桌面', '摆书架'], ['穿袜', '穿鞋']][n % 4]; return audio('根据两张动作卡，说明先做什么、再做什么。', `先${a}，再${b}。`, '量规接受合理口头连接，不按参考句逐字。', [table(['卡片', '动作'], [['先做', a], ['再做', b]])]);
  });
  add('oral-sequence-repair', 'transfer', '纠正颠倒提纲后口头重说', '错误顺序与正确说明 → 重述完整经过', '需要识别并纠正颠倒。', 120, n => {
    const [a, b] = [['读题', '答题'], ['洗米', '煮饭'], ['折纸', '贴标签']][n % 3]; return audio(`提纲错误地写成“先${b}，再${a}”。请纠正后完整说出正确顺序。`, `先${a}，再${b}。`, '先纠正颠倒关系，再组织口头句；复合失误仍需独立题反证。');
  });
  add('oral-sequence-update', 'transfer', '只按更新后的顺序口头说明', '原顺序与最新交换记录 → 当前两步顺序', '旧顺序作为可排除反例。', 120, n => {
    const [a, b] = [['洗水果', '摆盘'], ['装书', '穿外套'], ['擦桌面', '摆书架']][n % 3]; return audio(`原安排先${a}再${b}，随后更新为先${b}再${a}。请按最新安排完整说一遍。`, `先${b}，再${a}。`, '只核对更新后的当前顺序，旧安排不能保留。', [table(['版本', '顺序'], [['原安排', `${a}→${b}`], ['最新安排', `${b}→${a}`]])]);
  });
  return result;
}

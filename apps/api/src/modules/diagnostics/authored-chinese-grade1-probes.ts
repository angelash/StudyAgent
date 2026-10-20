import type { MeasurementDimension, QuestionBlock } from '@study-agent/contracts';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'family' | 'dimension'>;
const names = ['小禾', '小林', '小雨', '小文', '小宁', '小安', '小川', '小贝'];
const places = ['教室', '图书馆', '操场', '花园', '礼堂', '阅览室', '门厅', '庭院', '西楼一层', '实验室'];
const rotate = <T,>(values: T[], n: number) => [...values.slice(n % values.length), ...values.slice(0, n % values.length)];
const table = (headers: string[], rows: string[][]): QuestionBlock => ({ id: 'record', type: 'table', headers, rows });
const blanks = (stem: string, values: Array<[string, string, string]>, analysis: string, blocks?: QuestionBlock[]): Task => ({ stem,
  mode: 'multi_blank', answer: values.map(([key, , value]) => ({ key, value })), responseShape: { entries: values.map(([key, label]) => ({ key, label })) },
  analysis, ...(blocks ? { blocks } : {}) });
const choice = (stem: string, answer: string, options: string[], analysis: string, blocks?: QuestionBlock[]): Task => ({ stem,
  mode: 'single_choice', options: rotate([...new Set([answer, ...options])], stem.length), answer, analysis, ...(blocks ? { blocks } : {}) });
const sentenceRubric = [{ criterion: '写明题目指定的人物或对象', weight: 1 / 3 }, { criterion: '写明可核对的动作及必要对象', weight: 1 / 3 },
  { criterion: '组成完整通顺的句子并使用适当句末标点', weight: 1 / 3 }];
const sentenceTask = (stem: string, reference: string, blocks?: QuestionBlock[]): Task => ({ stem, answer: reference, mode: 'short_answer',
  rubric: sentenceRubric, analysis: `参考表达：${reference}。评分核对人物/对象、动作及句子完整性；其他能准确表达同一材料信息的合理措辞也可接受。`, ...(blocks ? { blocks } : {}) });

const syllables = [
  ['mā', 'm'], ['bā', 'b'], ['pā', 'p'], ['fā', 'f'], ['dā', 'd'], ['tā', 't'],
  ['nā', 'n'], ['lā', 'l'], ['gā', 'g'], ['kā', 'k'], ['hā', 'h'], ['jī', 'j'],
] as const;
const tones = [['mā', '第一声'], ['má', '第二声'], ['mǎ', '第三声'], ['mà', '第四声'], ['bā', '第一声'],
  ['bá', '第二声'], ['bǎ', '第三声'], ['bà', '第四声'], ['gē', '第一声'], ['gé', '第二声'], ['gě', '第三声'], ['gè', '第四声']] as const;
const radicalRows = [
  ['河', '氵', '左'], ['树', '木', '左'], ['他', '亻', '左'], ['吗', '口', '左'], ['花', '艹', '上'], ['林', '木', '左'],
  ['妈', '女', '左'], ['请', '讠', '左'], ['江', '氵', '左'], ['喵', '口', '左'], ['锋', '钅', '左'], ['校', '木', '左'],
] as const;
const structures = [
  ['林', '木+木', '左右结构'], ['尖', '小+大', '上下结构'], ['休', '亻+木', '左右结构'], ['苗', '艹+田', '上下结构'],
  ['口', '口', '独体字'], ['山', '山', '独体字'], ['从', '人+人', '左右结构'], ['看', '手+目', '上下结构'],
  ['星', '日+生', '上下结构'], ['秋', '禾+火', '左右结构'], ['明', '日+月', '左右结构'], ['架', '加+木', '上下结构'],
] as const;
const opposites: Array<[string, string]> = [['大', '小'], ['上', '下'], ['开', '关'], ['白天', '黑夜'], ['高', '低'], ['长', '短'],
  ['前', '后'], ['冷', '热'], ['多', '少'], ['快', '慢'], ['远', '近'], ['新', '旧']];
const classifiers = [['书', '本'], ['笔', '支'], ['鱼', '条'], ['树', '棵'], ['鸟', '只'], ['纸', '张'], ['花', '朵'],
  ['衣服', '件'], ['鞋', '双'], ['钥匙', '把'], ['伞', '把'], ['马', '匹']] as const;
const actions = ['借书', '浇花', '画画', '读书', '整理书包', '唱歌', '跑步', '拼模型', '收画笔', '擦桌子'];

export function buildChineseGrade1ProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const add = (atomId: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string,
    distinction: string, seconds: number, make: (index: number) => Task) => result.push({ atomId, family, dimension, behavior, structure, distinction,
    exercises: Array.from({ length: 12 }, (_, n) => ({ ...make(n), family, dimension, identityVersion: 2, expectedSeconds: seconds })) });

  const locate = 'foundation:chinese:g1-locate';
  add(locate, 'locate-structure-0', 'understanding', '从一句短材料定位指定动作的地点',
    '人物与动作明确的短句 → 找到对应地点', '沿用既有显式定位结构；只替换人物和地点不增加独立结构。', 45, n => {
      const place = places[n % places.length], action = actions[n % actions.length], name = names[n % names.length];
      return choice(`${name}在${place}${action}。${name}在哪里${action}？`, place, [places[(n + 3) % places.length], places[(n + 6) % places.length]],
        `材料把“${action}”与“${place}”写在同一个短句中，答案应为${place}。`);
    });
  add(locate, 'locate-structure-1', 'procedure', '按动作和时间从记录表逐项恢复地点',
    '两条带时间的事件表 → 为指定动作填写地点', '现有题常单句直接匹配；此组需要从表格定位两个条件，仍是一项定位结构。', 75, n => {
      const name = names[n % names.length], first = places[n % places.length], second = places[(n + 3) % places.length];
      return blanks(`${name}的记录如下：先在${first}${actions[n % actions.length]}，随后在${second}${actions[(n + 4) % actions.length]}。填写两次活动地点。`,
        [['first', '第一次活动地点', first], ['second', '随后活动地点', second]], `第一次事件对应${first}，随后事件对应${second}；按“先/随后”和时间记录分别提取。`,
        [table(['先后', '人物', '动作'], [['先', name, actions[n % actions.length]], ['随后', name, actions[(n + 4) % actions.length]]])]);
    });
  add(locate, 'locate-updated-plan', 'transfer', '依照最新更新排除已经更改的地点',
    '旧地点与明确更新记录 → 只采用最新地点', '先写地点不能作为最终答案；更新语句是需要保留的新结构。', 75, n => {
      const old = places[n % places.length], now = places[(n + 4) % places.length], name = names[n % names.length];
      return choice(`原通知写${name}去${old}领书，随后明确更新为去${now}领书。依照更新后的安排，${name}应该去哪里？`, now, [old, places[(n + 7) % places.length]],
        `旧通知已被明确更新，最新领书地点是${now}；不能按先出现的${old}作答。`, [table(['资料状态', '领书地点'], [['原通知', old], ['最新更新', now]])]);
    });
  add(locate, 'locate-multi-event-table', 'transfer', '从多事件表找出符合地点条件的所有活动',
    '三条人物、地点、动作记录 → 按指定地点筛选全部活动', '需要同时保留地点与活动关系，并检查所有记录；与单句定位不同。', 95, n => {
      const target = places[n % places.length], records = [0, 1, 2, 3].map(i => ({ name: names[(n + i) % names.length], place: i % 2 === 1 ? target : places[(n + i + 3) % places.length],
        action: actions[(n + i) % actions.length] }));
      const correct = records.filter(row => row.place === target).map(row => row.action);
      return { stem: `从表中选出所有发生在${target}的活动。选择所有符合项。`, mode: 'multiple_choice',
        options: rotate(records.map(row => row.action), n), answer: correct,
        blocks: [table(['人物', '地点', '动作'], records.map(row => [row.name, row.place, row.action]))],
        analysis: `${target}对应${correct.join('、')}；其他活动记录的地点是不同地点，不能按人物熟悉程度选择。` };
    });

  const cause = 'foundation:chinese:g1-cause';
  add(cause, 'cause-syntax-0', 'understanding', '在明确因果句中辨认原因',
    '因为……所以……短句 → 找到引起结果的条件', '沿用既有原因提取结构；因果词和词例变化不增加独立结构。', 50, n => {
      const scenarios = [['下雨', '带伞'], ['忘带水杯', '借杯子'], ['场地积水', '比赛延期'], ['风大', '纸船翻倒'],
        ['菜叶缺水', '叶子变软'], ['桥面检修', '公交改道'], ['灯坏了', '拿出台灯'], ['人数减少', '调整分组'],
        ['闹钟响了', '按时起床'], ['太阳太晒', '走到树荫下'], ['纸不够', '改用卡片'], ['墨水用完', '换一支笔']] as const;
      const [why, result] = scenarios[n % scenarios.length];
      return choice(`因为${why}，所以${result}。哪一项说明了原因？`, why, [result, '没有说明', '结果发生在原因之后'], `${why}是引发变化的条件，${result}是结果；不能把结果倒置成原因。`);
    });
  add(cause, 'cause-syntax-1', 'procedure', '为三个明确结果分别恢复原因',
    '结果—原因记录表 → 填写每个结果的原因', '需要区分多个因果链，而不是在同一句中单向提取。', 85, n => {
      const scenarioRows = [['下雨', '路滑'], ['缺水', '叶子变软'], ['闹钟响', '起床'], ['球滚走', '追球'],
        ['忘带水杯', '借杯子'], ['纸太薄', '装入硬夹'], ['地面湿', '放慢脚步'], ['灯坏了', '打开手电'], ['人数少', '调整分组'],
        ['风太大', '收起纸牌'], ['书页破损', '贴上修补贴'], ['水壶太满', '倒出少量水']] as const;
      const pick = [0, 4, 8].map(i => scenarioRows[(n + i) % scenarioRows.length]);
      return blanks(`填写每个结果所对应的原因。`, pick.flatMap(([why, result], i) => [[`c${i}`, `${result}的原因`, why]]),
        pick.map(([why, result]) => `${result}对应原因${why}`).join('；') + '。逐行保留各自的因果链。',
        [table(['记录', '明确材料', '结果'], pick.map(([why, result], i) => [['甲', '乙', '丙'][i], `${why}，所以${result}`, result]))]);
    });
  add(cause, 'cause-result-reverse', 'transfer', '由结果反查对应原因并排除倒置关系',
    '先给结果再问曾发生什么 → 原因和结果方向反转', '与“因为……所以……”阅读方向相反，需要保持实际因果方向。', 80, n => {
      const scenarios = [['地面湿滑', '刚洒过水'], ['比赛延期', '场地积水'], ['纸船翻', '风很大'], ['叶子变软', '缺水'],
        ['公交改走北路', '桥面检修'], ['大家加快脚步', '即将上课'], ['工具盒打开', '需要找尺子'], ['分组重新调整', '人数减少'],
        ['纸牌被收起', '风变大了'], ['书页补上修补贴', '书页破损'], ['桌面被擦干', '刚才洒了水'], ['队伍停下来', '前方正在检修']] as const;
      const [result, why] = scenarios[n % scenarios.length];
      return choice(`记录显示“${result}”。下列哪项可能是材料明确记录的原因，而没有把结果反过来？`, why,
        [result, '原因和结果完全相同', '材料没有事件可核对'], `材料把${why}作为先发条件，因而出现${result}；题目问原因，不能重复结果。`);
    });
  add(cause, 'cause-pair-table', 'transfer', '从两条相邻因果链核对指定结果',
    '干扰原因与目标原因不同的事件表 → 找到对应指定结果的那一条', '两条链共享人物但结果不同，必须按结果选原因；与单链提取不同。', 105, n => {
      const pairs = [
        [['积水', '活动延期'], ['人数增加', '增加桌椅']], [['忘带钥匙', '等待开门'], ['灯管损坏', '更换灯管']],
        [['缺少零件', '暂停装配'], ['纸不够', '改用卡片']], [['天气转凉', '增添外套'], ['雾很大', '推迟出发']],
        [['退烧', '恢复上课'], ['晚到门口', '按门铃']], [['水用完', '补充水壶'], ['纸张破损', '贴修补贴']],
        [['太阳太晒', '走到树荫下'], ['鞋带松开', '重新系紧']], [['线路故障', '关闭电源'], ['雨停了', '收起雨伞']],
        [['书架歪斜', '加固支架'], ['标签模糊', '重新标写']], [['光线不足', '打开台灯'], ['地面有水', '放置提示牌']],
        [['零件齐全', '开始装配'], ['图纸找到', '继续制作']], [['页面破损', '更换新页'], ['文具散落', '放回笔袋']],
      ] as const;
      const [[why1, result1], [why2, result2]] = pairs[n % pairs.length];
      return choice(`一件事中，${why1}导致${result1}；随后${why2}导致${result2}。题目只问“${result2}”的直接原因。`, why2,
        [why1, result1, why2 + result1], `“${result2}”对应同一条因果链中的${why2}；${why1}说明的是另一结果${result1}。`,
        [table(['事件', '实际结果'], [[why1, result1], [why2, result2]])]);
    });

  const initial = 'core:chinese:initial';
  add(initial, 'syllable-initial', 'understanding', '从给定音节读取起始声母',
    '常用音节 → 第一个声母成分', '沿用既有声母提取身份；书面音节不等于实际发音。', 45, n => {
      const [syllable, start] = syllables[n % syllables.length];
      const options = syllables.map(row => row[1]).filter((value, index, all) => all.indexOf(value) === index).slice(0, 5);
      return choice(`书面音节“${syllable}”的声母是哪一个？只看拼写开头，不需要发声。`, start, rotate(options.filter(value => value !== start), n).slice(0, 2),
        `该音节记录以${start}开始，所以声母填${start}；这是书面拼音核查，不证明听辨或发音准确。`);
    });
  add(initial, 'sound-role', 'procedure', '分别填写三个音节的声母',
    '三个常用音节记录 → 逐项写起始声母', '沿用既有成分角色判断；三个空仍是一份作答。', 80, n => {
      const selected = [0, 4, 8].map(i => syllables[(n + i) % syllables.length]);
      return blanks('按表中音节，在每个空位填写拼写开头的声母。', selected.map(([syllable, start], i) => [`s${i}`, `${syllable}的声母`, start]),
        selected.map(([syllable, start]) => `${syllable}写${start}`).join('；') + '。每一格只记录声母。',
        [table(['记录', '书面音节'], selected.map(([syllable], i) => [['甲', '乙', '丙'][i], syllable]))]);
    });
  add(initial, 'initial-record-check', 'transfer', '按音节逐条核对已写声母记录',
    '音节与已有声母的四行记录 → 只选完全一致的记录', '需要同时读取音节和标签并核对所有行，不把多选看作新结构。', 95, n => {
      const records = [0, 2, 5, 8].map(i => syllables[(n + i) % syllables.length]);
      const labels = ['甲', '乙', '丙', '丁'];
      const rows = records.map(([syllable, start], i) => {
        const alternate = syllables.find(([, candidate]) => candidate !== start)![1];
        return [labels[i], syllable, i === (n % 4) ? alternate : start];
      });
      const correct = rows.filter(row => syllables.find(([syllable]) => syllable === row[1])![1] === row[2]).map(row => row[0]);
      return { stem: '逐行核对音节拼写的起始声母，选择所有一致的记录。', mode: 'multiple_choice', options: rotate(labels, n), answer: correct,
        blocks: [table(['记录', '音节', '已有声母'], rows)], analysis: `${correct.join('、')}记录一致；其他行已有声母与音节开头不符。` };
    });
  add(initial, 'initial-group-common', 'transfer', '从一组音节恢复共同声母并定位异项',
    '三个同声母音节与一个异项 → 同时指出共同声母和异项', '要求比较整组开头而非只拆一个音节，额外字母辨认仍可能影响结果。', 100, n => {
      const groups: Array<[readonly string[], string, string]> = [
        [['māo', 'mǐ', 'mù'], 'm', 'nǚ'], [['bā', 'bǐ', 'bù'], 'b', 'pá'], [['dā', 'dǐ', 'dú'], 'd', 'tā'],
        [['lā', 'lí', 'lù'], 'l', 'rè'], [['mā', 'mí', 'mù'], 'm', 'bǔ'], [['bāo', 'bǐ', 'bù'], 'b', 'pāo'],
        [['dāo', 'dí', 'dù'], 'd', 'tī'], [['lāo', 'lǐ', 'lù'], 'l', 'nǎ'], [['māo', 'mǐ', 'mào'], 'm', 'fǔ'],
        [['bāo', 'bǐ', 'bái'], 'b', 'pǎo'], [['dāo', 'dà', 'dú'], 'd', 'táo'], [['lāo', 'lǐ', 'lǎo'], 'l', 'rén'],
      ];
      const [common, start, odd] = groups[n % groups.length];
      return blanks(`一组书面音节是“${[...common, odd].join('、')}”。其中三个音节具有相同声母，另一个不同。填写共同声母和不同声母的音节。`,
        [['common', '三项共同声母', start], ['odd', '声母不同的音节', odd]], `${common.join('、')}都以${start}开始，${odd}的声母不同。比较全部音节开头，不能只按字形长短判断。`);
    });

  const tone = 'core:chinese:tone';
  add(tone, 'tone-symbol', 'understanding', '按调号形状辨认一至四声',
    '单个标调音节 → 对应声调名称', '沿用既有调号识别；书面选择不推断听辨或实际读法。', 45, n => {
      const [syllable, label] = tones[n % tones.length], labels = ['第一声', '第二声', '第三声', '第四声'];
      return choice(`音节“${syllable}”上方的调号表示什么？只看书面标记。`, label, rotate(labels.filter(value => value !== label), n).slice(0, 2),
        `${syllable}使用${label}的调号。这里核对Unicode调号与声调名称，不评价朗读是否准确。`);
    });
  add(tone, 'word-tone', 'procedure', '为三个标调词卡分别记录声调',
    '三个常用词卡及拼音 → 填写各自声调', '沿用既有词语声调识别；多空仍为同一结构。', 80, n => {
      const selected = [0, 4, 8].map(i => tones[(n + i) % tones.length]);
      return blanks('根据每个拼音上的调号，填写其声调名称。', selected.map(([syllable, label], i) => [`t${i}`, `${syllable}的声调`, label]),
        selected.map(([syllable, label]) => `${syllable}为${label}`).join('；') + '。逐项看调号。',
        [table(['记录', '标调拼音'], selected.map(([syllable], i) => [['甲', '乙', '丙'][i], syllable]))]);
    });
  add(tone, 'tone-card-check', 'transfer', '按实际调号核对声调标签记录',
    '四张标调音节卡与已有声调标签 → 选择所有一致项', '需要同时辨认四行调号，不能只看是否含有相近字母。', 95, n => {
      const selected = [0, 3, 6, 9].map(i => tones[(n + i) % tones.length]), labels = ['甲', '乙', '丙', '丁'];
      const rows = selected.map(([syllable, label], i) => [labels[i], syllable, i === (n % 4) ? labels.find(candidate => candidate !== label)! : label]);
      const correct = rows.filter(row => tones.find(([syllable]) => syllable === row[1])![1] === row[2]).map(row => row[0]);
      return { stem: '选择所有“已有声调”与音节调号一致的记录。', mode: 'multiple_choice', options: rotate(labels, n), answer: correct,
        blocks: [table(['记录', '标调拼音', '已有声调'], rows)], analysis: `${correct.join('、')}与各自调号一致；其他记录的标签需要按实际调号检查。` };
    });
  add(tone, 'tone-record-repair', 'transfer', '在三条记录中定位唯一声调冲突并修正',
    '三条标调记录表 → 找异常行并填写正确声调', '需要定位错误项后再修，不是直接判断一个音节；阅读与位置定位是替代解释。', 105, n => {
      const broken = n % 3, selected = [0, 4, 8].map(i => tones[(n + i) % tones.length]), labels = ['第一声', '第二声', '第三声', '第四声'];
      const rows = selected.map(([syllable, label], i) => [String(i + 1), syllable, i === broken ? labels[(labels.indexOf(label) + 1) % 4] : label]);
      return blanks('下表只有一行声调标签与其拼音调号不符，填写行编号和正确的声调名称。',
        [['row', '需要改正的行编号', String(broken + 1)], ['tone', '正确声调', selected[broken][1]]],
        `第${broken + 1}行标调为${selected[broken][0]}，对应${selected[broken][1]}，其他行与各自调号一致。`,
        [table(['行', '标调拼音', '已有声调'], rows)]);
    });

  const radical = 'core:chinese:radical';
  add(radical, 'radical-extract', 'understanding', '从明确合体字中提取主要偏旁',
    '常用合体字 → 指定偏旁', '沿用既有偏旁提取；字形部件只作视觉核查。', 45, n => {
      const [char, part] = radicalRows[n % radicalRows.length], options = radicalRows.map(row => row[1]).filter((value, i, all) => all.indexOf(value) === i);
      return choice(`汉字“${char}”的主要偏旁是哪一个？`, part, rotate(options.filter(value => value !== part), n).slice(0, 2), `从“${char}”中分离主要部件，按题目记录可得到${part}。`);
    });
  add(radical, 'radical-select', 'procedure', '按指定偏旁筛选三个汉字',
    '指定一个偏旁与候选汉字组 → 选择所有含该偏旁的常用字', '沿用既有偏旁归类；多选和字符变体不增加结构。', 75, n => {
      const part = ['氵', '木', '口', '亻'][n % 4], matching = radicalRows.filter(row => row[1] === part).slice(0, 2).map(row => row[0]);
      const others = radicalRows.filter(row => row[1] !== part).slice(n % 3, n % 3 + 2).map(row => row[0]);
      return { stem: `选择所有带“${part}”偏旁的汉字。`, mode: 'multiple_choice', options: rotate([...matching, ...others], n), answer: matching,
        analysis: `${matching.join('、')}带“${part}”偏旁；其他候选的主要偏旁不同。` };
    });
  add(radical, 'radical-layout-repair', 'transfer', '核对部件位置并修复错误偏旁标签',
    '三行汉字、部件位置与已有偏旁 → 定位唯一冲突并替换', '必须同时保留整字和部件位置；仅提取一个偏旁不足以完成。', 105, n => {
      const broken = n % 3, selected = [0, 2, 4].map(i => radicalRows[(n + i) % radicalRows.length]);
      const rows = selected.map(([char, part, side], i) => [String(i + 1), char, side,
        i === broken ? radicalRows.find(([, candidate]) => candidate !== part)![1] : part]);
      return blanks('下表只有一行的偏旁标签与实际汉字不符。填写行编号和正确偏旁。',
        [['row', '需要改正的行编号', String(broken + 1)], ['radical', '正确偏旁', selected[broken][1]]],
        `第${broken + 1}行汉字是“${selected[broken][0]}”，主要偏旁为${selected[broken][1]}；其他行标签与部件记录一致。`,
        [table(['行', '汉字', '偏旁位置', '已有标签'], rows)]);
    });
  add(radical, 'radical-stock-complete', 'transfer', '按有限汉字库存完成偏旁归并',
    '三张汉字卡与三张偏旁卡 → 为每张字卡选择正确偏旁', '需要在整个有限库存内完成配对，并检查没有把同一字误配到相近部件。', 90, n => {
      const selected: Array<(typeof radicalRows)[number]> = [];
      for (let offset = 0; selected.length < 3 && offset < radicalRows.length; offset++) {
        const candidate = radicalRows[(n + offset) % radicalRows.length];
        if (!selected.some(row => row[1] === candidate[1])) selected.push(candidate);
      }
      return { stem: '把三张汉字卡与各自主要偏旁完整配对，每张偏旁卡使用一次。', mode: 'matching',
        responseShape: { left: rotate(selected.map(([char], i) => ({ id: `char${i}`, label: char })), n),
          right: rotate(selected.map(([, part], i) => ({ id: `part${i}`, label: part })), n + 1) },
        answer: { pairs: selected.map((_, i) => ({ left: `char${i}`, right: `part${i}` })) },
        analysis: selected.map(([char, part]) => `${char}对应${part}`).join('；') + '。应逐字核对主要部件，不按常见词猜测。' };
    });

  const structure = 'core:chinese:structure';
  add(structure, 'structure-described', 'understanding', '依据题目说明的部件排列判断字形结构',
    '两个部件及位置说明 → 左右/上下结构', '沿用既有结构描述；字符意义和笔画数不参与判断。', 45, n => {
      const [char, parts, answer] = structures[n % structures.length], other = answer === '左右结构' ? '上下结构' : '左右结构';
      return choice(`“${char}”的主要部件是${parts}，题目记录它们的排列为“${answer}”。这个结构判断是？`, answer, [other, '按笔画数决定', '无法只看排列'],
        `${char}的部件记录为${parts}，排列对应${answer}；需要看空间布局而非只看部件数量。`);
    });
  add(structure, 'structure-word', 'procedure', '从完整汉字恢复部件关系与结构名称',
    '三个常用合体汉字 → 分别填写结构名称', '沿用既有结构识别；部件拆分与多空仍为一份作答。', 75, n => {
      const selected = [0, 2, 4].map(i => structures[(n + i) % structures.length]);
      return blanks('根据题目给出的部件记录，填写每个汉字的结构名称。', selected.map(([char, , layout], i) => [`s${i}`, `${char}的结构`, layout]),
        selected.map(([char, , layout]) => `${char}为${layout}`).join('；') + '。只依据部件排列。',
        [table(['记录', '汉字', '部件'], selected.map(([char, parts], i) => [['甲', '乙', '丙'][i], char, parts]))]);
    });
  add(structure, 'structure-table-repair', 'transfer', '核对结构表并修复唯一布局标签',
    '三行汉字、部件及已有结构 → 定位冲突并改正', '需要同时核对部件拆法与布局；额外阅读与工作记忆可影响结果。', 100, n => {
      const broken = n % 3, selected = [0, 4, 8].map(i => structures[(n + i) % structures.length]);
      const rows = selected.map(([char, parts, layout], i) => [String(i + 1), char, parts, i === broken ? (layout === '左右结构' ? '上下结构' : '左右结构') : layout]);
      return blanks('下表只有一行结构标签与部件实际排列不符，填写行编号和正确结构。',
        [['row', '需要改正的行编号', String(broken + 1)], ['layout', '正确结构', selected[broken][2]]],
        `第${broken + 1}行“${selected[broken][0]}”的部件是${selected[broken][1]}，排列为${selected[broken][2]}；其他行保持一致。`,
        [table(['行', '汉字', '部件', '已有结构'], rows)]);
    });
  add(structure, 'structure-label-stock', 'transfer', '按明确结构标签筛选所有匹配汉字',
    '一张结构标签与候选汉字卡 → 找出全部匹配项', '需要按结构类别检查多个字，不能因为都有两个部件就归为同一结构。', 90, n => {
      const layouts = ['左右结构', '上下结构'] as const, target = layouts[n % 2];
      const chosen = rotate(structures.map(row => row[0]), n).slice(0, 4);
      const correct = chosen.filter(char => structures.find(row => row[0] === char)![2] === target);
      return { stem: `选择所有结构为“${target}”的汉字。`, mode: 'multiple_choice', options: rotate(chosen, n), answer: correct,
        analysis: `${correct.join('、')}的部件按${target}排列；其余候选的结构不同。` };
    });

  const antonym = 'core:chinese:antonym';
  add(antonym, 'opposite-isolated', 'understanding', '在同一意义维度辨认反义词对',
    '一个基础词及候选词 → 找出相反项', '沿用既有反义词识别；不把任何不同词都当成反义词。', 40, n => {
      const [a, b] = opposites[n % opposites.length], distractors = opposites.map(row => row[0]).filter(value => value !== a && value !== b);
      return choice(`与“${a}”在同一意义维度上表达相反关系的词是哪一个？`, b, rotate(distractors, n).slice(0, 2), `${a}与${b}是一组明确反义关系；其他候选可能只是不同词。`);
    });
  add(antonym, 'opposite-context', 'procedure', '为三个具体情境填反义表达',
    '三条语境句 → 逐空选择相反状态的词', '沿用既有语境反义词结构；三个空不增加独立结构。', 75, n => {
      const contexts = [['门原来开着，现在____了。', '关'], ['这条路宽，旁边的小巷很____。', '窄'], ['白天过去，____来了。', '黑夜'],
        ['杯子原来是满的，现在____了。', '空'], ['小狗跑在前面，小猫在____面。', '后'], ['天气从冷变得很____。', '热'],
        ['盒子里面少，外面____。', '多'], ['刚才走得快，现在走得____。', '慢'], ['图在近处，山在____处。', '远'],
        ['旧衣服洗过后像____的一样。', '新'], ['声音从高变____。', '低'], ['纸条原来短，后来接____。', '长']];
      const selected = rotate(contexts, n).slice(0, 3);
      return blanks('按三条表示相反状态的句子填写词语。', selected.map(([prompt, answer], i) => [`c${i}`, prompt, answer]),
        selected.map(([prompt, answer]) => `${prompt.replace('____', `“${answer}”`)}`).join('；') + '。逐句按当前意义维度核对。',
        [table(['记录', '句子'], selected.map(([prompt], i) => [String(i + 1), prompt]))]);
    });
  add(antonym, 'opposite-dimension-check', 'transfer', '区分真正反义关系与仅仅不同的词',
    '有限四词库存与意义维度 → 找出所有构成反义关系的一对', '不是分类多义词；需要说明为何同维相反，词例变化不增加结构。', 85, n => {
      const pair = opposites[n % opposites.length], other = opposites[(n + 3) % opposites.length], third = opposites[(n + 6) % opposites.length];
      const options = [`${pair[0]}—${pair[1]}`, `${pair[0]}—${other[1]}`, `${other[0]}—${third[0]}`, `${third[0]}—${pair[1]}`];
      return choice('下列哪一组是同一意义维度上的反义关系？', options[0], options.slice(1), `${pair[0]}与${pair[1]}构成明确反义对；其他选项只是把不同词放在一起，需核对是否真的相反。`);
    });
  add(antonym, 'opposite-event-result', 'transfer', '按事件前后状态恢复相反表达',
    '一段状态改变记录 → 辨认变化后的性质 → 选择它的反义项', '需要先追踪明确变化，再取相反关系；复合失败仍需基础反义对照。', 100, n => {
      const [a, b] = opposites[(n + 4) % opposites.length], name = names[n % names.length];
      return choice(`${name}的物件原来是${a}状态，记录明确说“后来变成${b}”。现在若要找一个与“${b}”相反的词，应选什么？`, a,
        [b, '相同', '无法根据记录判断'], `记录当前状态是${b}，其同维反义项为${a}；不能继续把变化前的${a}当当前状态。`,
        [table(['时间', '状态'], [['原来', a], ['后来', b]])]);
    });

  const classifier = 'core:chinese:classifier';
  add(classifier, 'classifier-blank', 'understanding', '为明确名词选择常用量词',
    '一个完整名词和一个数量位置 → 常用量词', '沿用既有量词搭配；物品名称变化不增加独立结构。', 45, n => {
      const [item, amount] = classifiers[n % classifiers.length], all = classifiers.map(row => row[1]).filter((value, i, values) => values.indexOf(value) === i);
      return choice(`一____${item}，按日常整件计量应填哪个量词？`, amount, rotate(all.filter(value => value !== amount), n).slice(0, 2), `“${item}”的常用计量说法是一${amount}${item}；量词需要与名词和计量方式搭配。`);
    });
  add(classifier, 'classifier-judgment', 'procedure', '核对三个名词量词短语是否规范',
    '三个名词与已有量词记录 → 逐项判断并填写正确量词', '沿用既有量词判断；判断题和多个空位不增加结构。', 75, n => {
      const selected = [0, 4, 8].map(i => classifiers[(n + i) % classifiers.length]);
      return blanks('按日常整件或成对计量，为每项填写正确量词，只填量词。', selected.map(([item, amount], i) => [`q${i}`, `${item}的量词`, amount]),
        selected.map(([item, amount]) => `${item}用${amount}`).join('；') + '。逐项按题目明确的计量方式核对。',
        [table(['记录', '名词'], selected.map(([item], i) => [['甲', '乙', '丙'][i], item]))]);
    });
  add(classifier, 'classifier-record-repair', 'transfer', '在多行物品表中修复唯一量词冲突',
    '三种物品与已有“数量+量词+名词”记录 → 定位不成搭配的一行', '需要定位错误后修复，不是直接填一个量词；其他行可作即时对照。', 105, n => {
      const broken = n % 3, selected = [0, 3, 6].map(i => classifiers[(n + i) % classifiers.length]);
      const wrong = selected.map(row => row[1]).find(value => value !== selected[broken][1])!;
      const rows = selected.map(([item, amount], i) => [String(i + 1), '一', i === broken ? wrong : amount, item]);
      return blanks('下表只有一行的量词与物品不搭配。填写行编号和正确量词。',
        [['row', '需要改正的行编号', String(broken + 1)], ['amount', '正确量词', selected[broken][1]]],
        `第${broken + 1}行应说“一${selected[broken][1]}${selected[broken][0]}”；其他行保持正确搭配。`,
        [table(['行', '数量', '已有量词', '物品'], rows)]);
    });
  add(classifier, 'classifier-count-record', 'transfer', '从事件记录同时恢复数量与量词',
    '一组领用记录 → 合计同类物品件数 → 写出数量短语', '需要追踪增移和类别，再选择整件量词；计数失败不能单独判成量词规则问题。', 105, n => {
      const [item, amount] = classifiers[n % classifiers.length], start = 1 + n % 2, added = 1 + n % 2, lost = n % 3 === 0 ? 1 : 0, final = start + added - lost;
      return blanks('只统计同一种物品，记录完整。填写最终份数词和量词。',
        [['count', '最终数字（写一至九）', ['一', '二', '三', '四', '五'][final - 1]], ['amount', `${item}的量词`, amount]],
        `共有${['一', '二', '三', '四', '五'][final - 1]}${amount}${item}。量词仍按整件或成对的明确计量方式选择。`,
        [table(['先后', '物品', '操作', '数量'], [['初始', item, '已有', String(start)], ['后来', item, '加入', String(added)], ['最后', item, '移出', String(lost)]])]);
    });

  const questionmark = 'core:chinese:questionmark';
  add(questionmark, 'question-name', 'understanding', '按直接询问的交际意图选择问号',
    '一个明确向对方提出问题的句子 → 句末标点', '沿用既有问句识别；关键词变化不增加结构。', 40, n => {
      const questions = ['这本书是谁的', '你今天带水杯了吗', '操场在哪里', '你叫什么名字', '现在几点了', '我们要先去哪里',
        '这支铅笔是谁的', '你看到我的帽子了吗', '音乐教室怎么走', '你今天喜欢哪本书', '窗边有几个人', '我们什么时候出发']; const sentence = questions[n % questions.length];
      return choice(`句子“${sentence}”直接向对方询问，句末应加什么？`, '？', ['。', '！', '，'], `“${sentence}”是一个需要对方回答的直接问题，句末用问号。`);
    });
  add(questionmark, 'question-time', 'procedure', '为三种不同交际功能填写句末标点',
    '陈述、直接询问和感叹三条话语 → 分别填写句末标点', '沿用标点功能判断，并同时对照陈述和感叹；不能只凭有疑问词机械判断。', 75, n => {
      const name = names[n % names.length], place = places[n % places.length], samples = [[`${name}在${place}没有看到下雨`, '。'], [`${name}，你带好画笔了吗`, '？'], [`${name}，${place}的桥真长`, '！']];
      return blanks('按每句话的真实交际功能填写一个句末标点：陈述用句号，直接询问用问号，强烈感叹用感叹号。',
        samples.map(([sentence, mark], i) => [`p${i}`, `“${sentence}”的句末标点`, mark]),
        `${samples.map(([sentence, mark]) => `“${sentence}”用${mark}`).join('；')}。根据话语是否需要回答、是否陈述或感叹选择。`,
        [table(['记录', '话语'], samples.map(([sentence], i) => [String(i + 1), sentence]))]);
    });
  add(questionmark, 'punctuation-function', 'transfer', '区分含疑问词但表达陈述的句子',
    '两个相似词形句子及交际功能 → 选择实际问句', '不是只找“谁、哪里、吗”等字；需要判断是否向对方提出问题。', 80, n => {
      const pairs = [['我知道这是谁的书。', '这是谁的书？'], ['她问我们什么时候出发。', '我们什么时候出发？'], ['我想知道雨是不是停了。', '雨是不是停了？'], ['他说教室在哪里。', '教室在哪里？'],
        ['我记得你叫什么名字。', '你叫什么名字？'], ['她问我是否带了水杯。', '你是否带了水杯？'], ['我知道图书馆怎么走。', '图书馆怎么走？'], ['他说现在几点了。', '现在几点了？'],
        ['我想知道谁在做值日。', '谁在做值日？'], ['老师问我们准备好了没有。', '我们准备好了没有？'], ['我知道那本书放在哪里。', '那本书放在哪里？'], ['她想知道明天有没有活动。', '明天有没有活动？']];
      const [statement, question] = pairs[n % pairs.length];
      return choice('下列哪一句直接向读者提出问题，需要读者回答？', question, [statement, '两句都只是在陈述', '无法判断交际功能'],
        `${question}直接提问；${statement}虽含疑问相关词，但整体是在陈述“知道/说”的内容。`);
    });
  add(questionmark, 'dialogue-mark-repair', 'transfer', '在多行对话中定位唯一句末标点错误',
    '陈述、询问、感叹的对话表 → 定位冲突行并改标点', '需要同时核对多句话语功能；额外阅读可影响结果，不直接推断注意问题。', 100, n => {
      const broken = n % 3, samples = [['我已经收好书包', '。'], ['你看到我的铅笔了吗', '？'], ['这幅画真漂亮', '！']];
      const name = names[n % names.length];
      const marks = ['。', '？', '！'], wrongMark = marks.find(mark => mark !== samples[broken][1])!;
      const rows = samples.map(([sentence, mark], i) => [String(i + 1), `${name}${sentence}`, i === broken ? wrongMark : mark]);
      return blanks('下表只有一行的句末标点与其交际功能不符，填写行编号和正确标点。',
        [['row', '需要改正的行编号', String(broken + 1)], ['mark', '正确句末标点', samples[broken][1]]],
        `第${broken + 1}句是${['陈述', '直接询问', '强烈感叹'][broken]}，应使用${samples[broken][1]}；其他句保持。`,
        [table(['行', '句子', '已有标点'], rows)]);
    });

  const person = 'core:chinese:person';
  add(person, 'two-person-selection', 'understanding', '区分两个人物各自的动作',
    '两人同时做不同动作 → 找到问题指定的施事者', '沿用既有显式人物选择；姓名变化不增加结构。', 40, n => {
      const a = names[n % names.length], b = names[(n + 3) % names.length], act1 = ['画画', '读书', '浇花', '唱歌'][n % 4],
        act2 = ['跳绳', '看地图', '擦桌子', '拼模型'][n % 4], place = places[n % places.length];
      return choice(`${a}在${place}${act1}，${b}也在这里${act2}。谁在${act2}？`, b, [a, '两个人都在', '材料没有说明'], `${act2}由${b}完成；${a}对应另一个动作。`);
    });
  add(person, 'focus-sentence', 'procedure', '从传递动作中分别恢复发出者与接受者',
    '一方把物品交给另一方 → 填发出者与接受者', '沿用既有焦点句人物关系；两个空位仍是一份作答。', 70, n => {
      const sender = names[n % names.length], receiver = names[(n + 4) % names.length], object = ['地图', '铅笔', '水杯', '借书卡'][n % 4], place = places[n % places.length];
      return blanks(`${sender}在${place}把${object}交给${receiver}。填写物品发出者和接收者。`, [['sender', '发出者', sender], ['receiver', '接收者', receiver]],
        `${sender}执行“交给”动作，${receiver}接收${object}。要分别看动作方向。`);
    });
  add(person, 'person-role-reversal', 'transfer', '在被动语序中保持动作关系',
    '物品由某人交给某人的被动句 → 回答问题指定的角色', '词序与主动句相反，不能按姓名出现位置判断；与直接选择不同。', 85, n => {
      const sender = names[(n + 2) % names.length], receiver = names[(n + 6) % names.length], object = ['地图', '帽子', '画册', '钥匙'][n % 4], place = places[n % places.length];
      return choice(`在${place}，${object}由${sender}交给${receiver}。题目问“谁接收了${object}”？`, receiver, [sender, object, '材料没有人物'],
        `“${object}由${sender}交给${receiver}”中，${sender}发出，${receiver}接收。被动语序仍保留这个关系。`);
    });
  add(person, 'person-handoff-chain', 'transfer', '追踪物品多次转手后的最终持有人',
    '两段明确交接记录 → 逐次更新持有人', '需要按完整事件顺序保留当前持有者；额外工作记忆是替代解释。', 105, n => {
      const first = names[n % names.length], middle = names[(n + 2) % names.length], last = names[(n + 5) % names.length], object = ['地图', '钥匙', '书', '模型'][n % 4], place = places[n % places.length];
      return choice(`在${place}，${object}先由${first}交给${middle}，随后${middle}又把它交给${last}。现在谁持有${object}？`, last, [first, middle, '无法判断'],
        `最终一次交接把${object}交给${last}，因此当前持有者是${last}；前面的接收者已被后续事件更新。`,
        [table(['先后', '发出者', '接收者'], [['第一次', first, middle], ['第二次', middle, last]])]);
    });

  const eventorder = 'core:chinese:eventorder';
  add(eventorder, 'first-event', 'understanding', '按先再等连接词辨认第一步',
    '两个已排序动作及明确连接词 → 第一步', '沿用既有事件顺序识别；动作词变化不增加结构。', 45, n => {
      const steps = [['洗手', '吃饭'], ['穿袜子', '穿鞋'], ['读题', '写答案'], ['浇花', '收水壶'], ['整理桌面', '放文具'], ['翻到新页', '画图']];
      const [first, second] = steps[n % steps.length], name = names[n % names.length], place = places[n % places.length];
      return choice(`${name}在${place}的记录写“先${first}，再${second}”。哪一项先发生？`, first, [second, '两件事同时发生', '材料没有先后'], `“先”标记${first}在前，“再”标记${second}在后。`);
    });
  add(eventorder, 'later-event', 'procedure', '从完整步骤记录填写每步状态',
    '两步活动记录 → 分别填写最先和最后动作', '沿用既有先后提取；两个空位仍为同一结构。', 70, n => {
      const [first, second] = [['装书包', '穿外套'], ['画草图', '涂颜色'], ['擦桌面', '摆书本'], ['洗水果', '切水果']][n % 4];
      const name = names[n % names.length], place = places[n % places.length];
      return blanks(`${name}在${place}的记录写“${first}以后，才${second}”。填写最先和最后的动作。`, [['first', '最先', first], ['later', '最后', second]],
        `“${first}以后，才${second}”说明${first}在前，${second}在后。不能按词语在问题中出现的顺序作答。`);
    });
  add(eventorder, 'event-order-repair', 'transfer', '在编号步骤中定位顺序记录冲突',
    '编号、较早动作、较晚动作表 → 找出标签与实际先后冲突的一行', '需要同时保留编号及时间关系，定位后修正；不是只问第一步。', 100, n => {
      const broken = n % 3, pairs = [['洗手', '吃饭'], ['读题', '答题'], ['穿袜', '穿鞋']];
      const rows = pairs.map(([first, second], index) => [String(index + 1), names[(n + index) % names.length], index === broken ? second : first, index === broken ? first : second]);
      return blanks('下表每行的“较早动作/较晚动作”中只有一行颠倒，填写行编号并写出它正确的较早动作。',
        [['row', '颠倒的行编号', String(broken + 1)], ['first', '正确较早动作', pairs[broken][0]]],
        `第${broken + 1}行应把${pairs[broken][0]}写在较早位置、${pairs[broken][1]}写在较晚位置；其他行顺序一致。`,
        [table(['行', '人物', '较早动作', '较晚动作'], rows)]);
    });
  add(eventorder, 'event-updated-sequence', 'transfer', '按最新调整重排原先的活动顺序',
    '原安排与明确交换/更新 → 以最终顺序回答指定位置', '旧顺序只作对照，最终问题由更新记录决定；与单句先再不同。', 95, n => {
      const [a, b, c] = [['借书', '还书', '离馆'], ['洗米', '煮饭', '盛饭'], ['画线', '涂色', '写名称'], ['热身', '跑步', '拉伸']][n % 4];
      const name = names[n % names.length], place = places[n % places.length];
      return choice(`${name}在${place}的原安排是“${a}—${b}—${c}”，随后明确更新为“${b}—${a}—${c}”。按更新后的顺序，最先做什么？`, b, [a, c, '材料没有更新'],
        `更新记录把${b}移到最前，所以最先${b}；原安排中的${a}已不是首选顺序。`,
        [table(['版本', '顺序'], [['原安排', `${a}→${b}→${c}`], ['最新更新', `${b}→${a}→${c}`]])]);
    });

  const complete = 'core:chinese:complete-sentence';
  add(complete, 'source-based-production', 'understanding', '辨认包含人物和动作的完整句',
    '完整句与残缺词串 → 选择能独立说明谁做什么的一句', '书面识别完整句；不必套用参考句措辞。', 55, n => {
      const name = names[n % names.length], action = actions[n % actions.length], completeSentence = `${name}在教室里${action}。`;
      return choice(`题目给出人物“${name}”和动作“${action}”。下列哪一句完整说清了这件事？`, completeSentence,
        [`${name}和${action}`, `在教室里${action}`, `${action}。`], `完整句需要让读者明确${name}在做什么；${completeSentence}同时包含人物和动作。`);
    });
  add(complete, 'personal-production', 'procedure', '把明确人物、地点和动作写成完整句',
    '已给人物/地点/动作卡 → 自主写一句完整通顺的话', '共享量规允许不同措辞，只核对信息与句子完整；人工复核，不逐字匹配参考。', 100, n => {
      const name = names[n % names.length], place = places[n % places.length], action = actions[n % actions.length];
      return sentenceTask(`用“${name}”“${place}”“${action}”写一句完整的话，至少写清人物和动作。`, `${name}在${place}${action}。`,
        [table(['信息卡', '内容'], [['人物', name], ['地点', place], ['动作', action]])]);
    });
  add(complete, 'sentence-repair', 'transfer', '把残缺词串修复成可独立理解的句子',
    '省略人物或动作的残缺表达 → 补成完整句', '需要从残缺表达判断缺项并自主组织，不是选择现成完整句；允许多种补法。', 105, n => {
      const name = names[n % names.length], action = actions[n % actions.length], fragments = [`${name}和${action}`, `正在${action}`, `${action}。`];
      return sentenceTask(`把残缺表达“${fragments[n % 3]}”改成一句完整的话，让读者知道谁做什么。`, `${name}正在${action}。`,
        [table(['残缺表达', '需要补清的信息'], [[fragments[n % 3], '人物、动作及二者关系']])]);
    });
  add(complete, 'sentence-event-table', 'transfer', '依据事件表选择目标行并写完整句',
    '人物、对象和动作表 → 只写指定人物在指定时间的行为', '需要跨列组织信息，不能把相邻行对象混入；仍按共享量规人工复核。', 110, n => {
      const selected = [0, 1, 2].map(i => ({ name: names[(n + i) % names.length], object: ['花', '地图', '桌面'][i], action: ['浇水', '查看', '擦拭'][i] }));
      const target = selected[n % 3];
      const phrase = target.action === '浇水' ? `给${target.object}浇水` : `${target.action}${target.object}`;
      return sentenceTask(`只根据表的第${n % 3 + 1}行，写一句完整的话说明人物和动作，不能混入其他行的对象。`, `${target.name}${phrase}。`,
        [table(['行', '人物', '对象', '动作'], selected.map((row, i) => [String(i + 1), row.name, row.object, row.action]))]);
    });
  return result;
}

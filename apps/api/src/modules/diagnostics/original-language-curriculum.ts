import type { Subject } from '@study-agent/contracts';
import type { Exercise } from './foundation-curriculum';
import type { CurriculumAuthor } from './original-core-curriculum';

type Row = [prompt: string, answer: string, distractor: string, other: string, family?: string];
const atomId = (s: Subject, code: string) => `core:${s}:${code}`;
const item = (row: Row): Exercise => ({ stem: row[0], answer: row[1], options: [...new Set([row[1], row[2], row[3]])],
  family: row[4] ?? 'context-choice', mode: 'single_choice', dimension: 'understanding' });

function bank(add: CurriculumAuthor, s: Subject, grade: number, code: string, strand: string, name: string, objective: string,
  pre: string[], rows: Row[]) {
  add(s, grade, code, strand, name, objective, pre.map(p => atomId(s, p)), n => item(rows[n % rows.length]), rows.length);
}
function writing(add: CurriculumAuthor, s: Subject, grade: number, code: string, name: string, objective: string, pre: string[],
  prompts: Array<[string, string]>, criteria: string[]) {
  add(s, grade, code, s === 'chinese' ? '表达与习作' : '书面表达', name, objective, pre.map(p => atomId(s, p)), n => ({
    stem: prompts[n % prompts.length][0], answer: prompts[n % prompts.length][1], family: n % 2 ? 'personal-production' : 'source-based-production',
    dimension: n % 2 ? 'transfer' : 'procedure', mode: 'short_answer',
    rubric: criteria.map(criterion => ({ criterion, weight: 1 / criteria.length })),
  }), prompts.length);
}

/** Authored fragments contain all needed evidence; no external passage or textbook is silently assumed. */
export function addChineseCurriculum(add: CurriculumAuthor) {
  const s = 'chinese', word = '识字与词语', sentence = '句段与语言', reading = '阅读与信息';
  const b = (g: number, code: string, strand: string, name: string, objective: string, pre: string[], rows: Row[]) => bank(add, s, g, code, strand, name, objective, pre, rows);
  b(1, 'initial', word, '声母与韵母区分', '在给定音节中找出声母，排除整体音节记忆替代', [], [
    ['音节mā的声母是？', 'm', 'ā', 'ma', 'syllable-initial'], ['音节bā中哪个是声母？', 'b', 'ā', 'ba', 'syllable-initial'],
    ['p和a拼成pā，p在音节中是？', '声母', '韵母', '声调', 'sound-role'], ['l和i拼成lǐ，l在音节中是？', '声母', '韵母', '声调', 'sound-role']]);
  b(1, 'tone', word, '拼音声调识别', '根据标调符号辨认一至四声', ['initial'], [
    ['mā是第几声？', '第一声', '第二声', '第四声', 'tone-symbol'], ['má是第几声？', '第二声', '第三声', '第一声', 'tone-symbol'],
    ['“马”的拼音mǎ属于什么声调？', '第三声', '第一声', '第四声', 'word-tone'], ['“大”的拼音dà属于什么声调？', '第四声', '第二声', '第三声', 'word-tone']]);
  b(1, 'radical', word, '常用偏旁辨认', '从常用合体字中辨认指定偏旁', [], [
    ['“河”的偏旁是？', '氵', '亻', '木', 'radical-extract'], ['“树”的偏旁是？', '木', '口', '氵', 'radical-extract'],
    ['哪个字带单人旁“亻”？', '他', '河', '树', 'radical-select'], ['哪个字带口字旁“口”？', '吗', '休', '林', 'radical-select']]);
  b(1, 'structure', word, '左右与上下字形结构', '根据组成部件排列识别汉字结构', ['radical'], [
    ['“林”的两个“木”左右排列，属于？', '左右结构', '上下结构', '独体字', 'structure-described'],
    ['“尖”的“小”和“大”上下排列，属于？', '上下结构', '左右结构', '独体字', 'structure-described'],
    ['“休”字由“亻”和“木”左右组成，它是什么结构？', '左右结构', '上下结构', '独体字', 'structure-word'],
    ['“苗”字由“艹”和“田”上下组成，它是什么结构？', '上下结构', '左右结构', '独体字', 'structure-word']]);
  b(1, 'antonym', word, '常用反义词关系', '选择语义相反且符合句子条件的词', [], [
    ['“大”的反义词是？', '小', '高', '多', 'opposite-isolated'], ['“上”的反义词是？', '下', '左', '前', 'opposite-isolated'],
    ['门原来开着，现在把门____了。选与“开”相反的词。', '关', '推', '看', 'opposite-context'], ['白天过去，____来了。', '黑夜', '清晨', '中午', 'opposite-context']]);
  b(1, 'classifier', word, '常见名词量词搭配', '为具体名词选用规范的常用量词', [], [
    ['一____书，应该填？', '本', '只', '条', 'classifier-blank'], ['一____鱼，应该填？', '条', '本', '棵', 'classifier-blank'],
    ['哪个说法正确？', '一棵树', '一本树', '一条树', 'classifier-judgment'], ['哪个说法正确？', '一只鸟', '一棵鸟', '一本鸟', 'classifier-judgment']]);
  b(1, 'questionmark', sentence, '疑问句末标点', '识别直接提问并选择问号', [], [
    ['“你叫什么名字”句末应加？', '？', '。', '，', 'question-name'], ['“现在几点了”句末应加？', '？', '。', '，', 'question-time'],
    ['“这是谁的书”是在做什么？', '提出问题', '回答问题', '说明结果', 'question-intent'], ['“你要去哪里”句末应加？', '？', '。', '，', 'question-place']]);
  b(1, 'person', reading, '人物显式信息定位', '根据“谁”的提问找到对应人物', [], [
    ['小禾画画，小林读书。谁在读书？', '小林', '小禾', '没有说明', 'two-person-selection'], ['小文唱歌，小雨听歌。谁在唱歌？', '小文', '小雨', '没有说明', 'two-person-selection'],
    ['把书送来的是小安。谁送来了书？', '小安', '老师', '小禾', 'focus-sentence'], ['今天值日的是小宁。谁值日？', '小宁', '小安', '小林', 'focus-sentence']]);
  b(1, 'eventorder', reading, '两步事件先后', '根据“先”“再”等标记辨认事件顺序', ['person'], [
    ['小禾先洗手，再吃饭。先做什么？', '洗手', '吃饭', '睡觉', 'first-event'], ['先穿袜子，再穿鞋。先做什么？', '穿袜子', '穿鞋', '洗鞋', 'first-event'],
    ['读完书后，小林整理书包。后做什么？', '整理书包', '读书', '买书', 'later-event'], ['画完画后，小雨收起画笔。最后做什么？', '收起画笔', '画画', '买画笔', 'later-event']]);
  writing(add, s, 1, 'complete-sentence', '围绕人物写完整句', '用一个完整句说明谁在做什么', ['person'], [
    ['用“妈妈”和“读书”写一句完整的话。', '妈妈正在读书。'], ['写一句话，说清楚你今天做的一件事。', '我今天给花浇水。'],
    ['用“小鸟”和“唱歌”写一句完整的话。', '小鸟在树上唱歌。'], ['说清楚家中一个人正在做什么，写成一句话。', '爸爸正在做饭。']], ['有明确人物或对象', '有完整的动作或状态', '语意通顺且句末标点恰当']);

  b(2, 'polyphone', word, '语境中多音字读音', '依据词义选择多音字在具体词语中的读音', ['tone'], [
    ['“银行”的“行”读什么？', 'háng', 'xíng', 'hǎng', 'word-polyphone'], ['“行走”的“行”读什么？', 'xíng', 'háng', 'hàng', 'word-polyphone'],
    ['“长大了”中的“长”读什么？', 'zhǎng', 'cháng', 'zhàng', 'phrase-polyphone'], ['“一条长河”的“长”读什么？', 'cháng', 'zhǎng', 'zhàng', 'phrase-polyphone']]);
  b(2, 'homophone', word, '同音字按词义选字', '利用词语意义排除同音字', ['radical'], [
    ['“时____”表示时间，应该填？', '间', '肩', '坚', 'compound-meaning'], ['“____光照进窗户”应该填哪个同音字？', '阳', '洋', '杨', 'compound-meaning'],
    ['“____水”表示河中流动的水，选哪个字？', '河', '和', '合', 'semantic-context'], ['“____平”表示没有战争，选哪个字？', '和', '河', '禾', 'semantic-context']]);
  b(2, 'synonym', word, '常用近义词语境', '根据句中意义选择相近的词', ['antonym'], [
    ['“高兴”的近义词是？', '开心', '伤心', '生气', 'synonym-isolated'], ['“美丽”的近义词是？', '漂亮', '丑陋', '粗糙', 'synonym-isolated'],
    ['“他很认真地检查”中的“认真”可换成？', '仔细', '随便', '马虎', 'synonym-context'], ['“大家立刻出发”中的“立刻”可换成？', '马上', '以前', '从前', 'synonym-context']]);
  b(2, 'reduplication', word, '叠词形式辨认', '识别AABB与ABAB等明确的重复形式', [], [
    ['“干干净净”属于哪种形式？', 'AABB', 'ABAB', 'ABAC', 'pattern-identify'], ['“研究研究”属于哪种形式？', 'ABAB', 'AABB', 'ABAC', 'pattern-identify'],
    ['哪个词符合AABB形式？', '明明白白', '打扫打扫', '一心一意', 'pattern-select'], ['哪个词符合ABAB形式？', '讨论讨论', '高高兴兴', '自由自在', 'pattern-select']]);
  b(2, 'because', sentence, '因为所以的因果配对', '将表示原因和结果的关联词正确配对', [], [
    ['“因为下雨，____带上雨伞。”填？', '所以', '但是', '虽然', 'cause-to-result'], ['“因为天冷，____穿上外套。”填？', '所以', '可是', '如果', 'cause-to-result'],
    ['“____要按时到校，所以提前出门。”填？', '因为', '但是', '虽然', 'result-to-cause'], ['“____道路湿滑，所以放慢脚步。”填？', '因为', '即使', '但是', 'result-to-cause']]);
  b(2, 'pronoun', reading, '相邻句人称指代', '依据人物和性别线索还原代词指向', ['person'], [
    ['小林是个男孩。他喜欢画画。“他”指谁？', '小林', '画画', '没有人物', 'adjacent-pronoun'], ['小雨是个女孩。她带来一本书。“她”指谁？', '小雨', '书', '老师', 'adjacent-pronoun'],
    ['妈妈和小林走来，妈妈说：“他今天获奖了。”小林是男孩。“他”指谁？', '小林', '妈妈', '奖状', 'speaker-pronoun'], ['姐姐对弟弟说：“你先走。”这里的“你”指谁？', '弟弟', '姐姐', '别人', 'speaker-pronoun']]);
  b(2, 'timeword', reading, '文本中的时间信息', '区分活动日期、出发和结束等时间信息', ['eventorder'], [
    ['周六上午参观，周日下午休息。什么时候参观？', '周六上午', '周日下午', '周六晚上', 'schedule-slot'], ['周一借书，周五还书。什么时候还书？', '周五', '周一', '周三', 'schedule-slot'],
    ['通知：活动九点开始，十点结束。开始时间是？', '九点', '十点', '八点', 'start-end-distinction'], ['比赛下午两点开始，三点结束。结束时间是？', '下午三点', '下午两点', '上午三点', 'start-end-distinction']]);
  b(2, 'listpunctuation', sentence, '并列词语的顿号', '在同层并列词语间使用顿号', ['questionmark'], [
    ['“苹果、香蕉、梨”中的“、”表示？', '并列词语间的停顿', '一句话结束', '提出疑问', 'enumeration-function'], ['“铅笔、橡皮、尺子”中的标点是？', '顿号', '问号', '句号', 'enumeration-name'],
    ['“红色____黄色____蓝色”表示并列颜色，空处应填？', '顿号', '句号', '问号', 'enumeration-insert'], ['列举“跑步____跳绳____游泳”，空处宜用？', '顿号', '问号', '感叹号', 'enumeration-insert']]);
  b(2, 'instruction', reading, '两条件指令核对', '从指令中同时保留对象与操作条件', ['eventorder'], [
    ['“把红色积木放进盒子，蓝色留在桌上。”盒子里应放？', '红色积木', '蓝色积木', '所有积木', 'object-condition'], ['“只给圆形涂绿，方形不涂。”要涂绿的是？', '圆形', '方形', '所有图形', 'object-condition'],
    ['“先圈出动词，再给名词画线。”第一步是？', '圈出动词', '给名词画线', '全部画线', 'operation-sequence'], ['“先读题，再写答案。”写答案之前要做？', '读题', '交卷', '收书', 'operation-sequence']]);
  writing(add, s, 2, 'sequence-writing', '用顺序词写两步经过', '用先后标记写清楚两个动作及其顺序', ['eventorder', 'complete-sentence'], [
    ['把“洗水果、吃水果”写成一句有先后顺序的话。', '我先洗水果，再吃水果。'], ['用“先……再……”写出你整理书包的两步。', '我先放好课本，再收好文具。'],
    ['按顺序说明“播种、浇水”两个动作。', '先播种，再浇水。'], ['写出上床睡觉前按顺序做的两件事。', '我先刷牙，再洗脸。']], ['两个动作明确', '先后关系合理并有标记', '句子完整通顺']);

  b(3, 'contextmeaning', word, '结合上下文解释词义', '根据具体语境选出词语在文中的意义', ['synonym'], [
    ['“这道题太深了，我暂时不懂。”这里“深”指？', '难以理解', '水很深', '颜色浓', 'abstract-polysemy'], ['“他有一副热心肠，总帮助别人。”这里“热”表示？', '热情', '温度高', '流行', 'abstract-polysemy'],
    ['“沿路风景让大家开了眼界。”这里“开”表示？', '扩大', '打开门', '驾驶', 'idiomatic-context'], ['“这句话分量很重，让我认真思考。”这里“重”指？', '意义重要', '质量大', '数量多', 'idiomatic-context']]);
  b(3, 'simile', sentence, '比喻的本体与喻体', '识别明确比喻中被比对象和所借形象', ['contextmeaning'], [
    ['“弯弯的月亮像小船。”把什么比作小船？', '月亮', '小船', '天空', 'simile-source'], ['“荷叶像一把伞。”被比喻的对象是？', '荷叶', '伞', '雨水', 'simile-source'],
    ['“雪花像白蝴蝶。”用什么比喻雪花？', '白蝴蝶', '天空', '大树', 'simile-image'], ['“河面像镜子。”用什么比喻河面？', '镜子', '河岸', '波浪', 'simile-image']]);
  b(3, 'personification', sentence, '拟人与普通动作区分', '辨认把非人事物赋予人的情感或行为的表达', ['simile'], [
    ['“小草向我们点头。”运用？', '拟人', '列数字', '下定义', 'human-action'], ['“花儿露出笑脸。”运用？', '拟人', '列数字', '下定义', 'human-action'],
    ['哪句运用了拟人？', '风儿唱着歌走来', '风速每秒三米', '风从东边吹来', 'select-personification'], ['哪句运用了拟人？', '星星眨着眼睛', '天上有许多星星', '星星离我们很远', 'select-personification']]);
  b(3, 'main-sentence', reading, '总分段中的中心句', '区分总说句与其下的具体例子', ['person'], [
    ['“花园真美。红花开了，绿树成荫，小鸟飞来。”总说句是？', '花园真美', '红花开了', '小鸟飞来', 'general-first'], ['“弟弟很爱运动。他每天跑步，周末游泳。”中心句是？', '弟弟很爱运动', '他每天跑步', '周末游泳', 'general-first'],
    ['“操场能跑步、打球、做游戏。我们的操场用途真多。”总说句是？', '我们的操场用途真多', '操场能跑步', '打球', 'general-last'], ['“小林帮助同桌，照顾小树，还主动值日。他真热心。”中心句是？', '他真热心', '照顾小树', '主动值日', 'general-last']]);
  b(3, 'detail-evidence', reading, '从动作找到直接证据', '用文中具体动作支持一个明确判断', ['main-sentence'], [
    ['“小禾反复检查三遍，还核对了单位。”哪项支持“认真”？', '反复检查并核对单位', '他的名字叫小禾', '文中没有行动', 'action-support'], ['“小雨看见同学摔倒，马上上前扶起。”哪项支持“乐于助人”？', '上前扶起同学', '同学摔倒', '天气晴朗', 'action-support'],
    ['要证明“他坚持锻炼”，最直接的证据是？', '他连续一个月每天跑步', '他有一双跑鞋', '他看过比赛', 'claim-to-evidence'], ['要证明“她爱惜书本”，最直接的证据是？', '她把破损书页修补好', '她书包很大', '她坐在窗边', 'claim-to-evidence']]);
  b(3, 'classification', reading, '概括同类词语', '根据共同属性选择上位类别，避免以一例代全部', ['classifier'], [
    ['苹果、梨、香蕉共同属于？', '水果', '蔬菜', '文具', 'category-examples'], ['跑步、跳绳、游泳共同属于？', '运动', '乐器', '植物', 'category-examples'],
    ['哪组全是交通工具？', '汽车、轮船、飞机', '汽车、书本、飞机', '香蕉、轮船、铅笔', 'category-all'], ['哪组全是文具？', '铅笔、橡皮、尺子', '铅笔、苹果、尺子', '大树、橡皮、河流', 'category-all']]);
  b(3, 'dialoguepunctuation', sentence, '提示语在前的引号冒号', '为提示语在前的直接引语选择冒号与引号', ['listpunctuation'], [
    ['“妈妈说____‘快回家。’”提示语后宜用？', '冒号', '顿号', '问号', 'speech-introducer'], ['“老师问____‘谁愿意？’”提示语后宜用？', '冒号', '顿号', '感叹号', 'speech-introducer'],
    ['直接引用别人说的话，通常用什么标示引用内容？', '引号', '顿号', '书名号', 'quotation-boundary'], ['“小林说：‘我来帮忙。’”引号内是？', '人物说的话', '叙述者的地点', '书的名称', 'quotation-boundary']]);
  b(3, 'factopinion', reading, '可核查事实与感受', '区分文本中的可计数事实和个人评价', ['detail-evidence'], [
    ['哪句是可核查事实？', '花坛里有十二棵树', '花坛最漂亮', '我觉得花坛很有趣', 'fact-select'], ['哪句是可核查事实？', '图书馆周一闭馆', '图书馆最好玩', '我喜欢图书馆', 'fact-select'],
    ['“这本书太精彩了”属于？', '个人评价', '准确页数', '出版日期', 'opinion-identify'], ['“我觉得这条路最美”属于？', '个人感受', '道路长度', '道路宽度', 'opinion-identify']]);
  b(3, 'notice', reading, '通知中的必要条件', '从简短通知提取时间地点和携带条件', ['instruction', 'timeword'], [
    ['“周三14点在礼堂排练，请带水杯。”需要带什么？', '水杯', '画笔', '球拍', 'notice-equipment'], ['“周六9点公园集合，自带雨衣。”需自带？', '雨衣', '足球', '字典', 'notice-equipment'],
    ['“阅读会周五16点在图书馆举行。”地点是？', '图书馆', '礼堂', '操场', 'notice-location'], ['“音乐会周日10点在礼堂举行。”时间是？', '周日10点', '周五16点', '周六9点', 'notice-time']]);
  writing(add, s, 3, 'paragraph-summary', '提炼人物事件结果', '用简短语言保留人物、主要事件与结果', ['main-sentence', 'detail-evidence'], [
    ['“小禾发现图书角杂乱，主动按类别整理。大家很快找到了要看的书。”用一句话概括。', '小禾整理图书角，方便大家找书。'],
    ['概括你今天完成的一件事，写明做了什么和结果。', '我修好了书架，现在书本摆放整齐了。'],
    ['“小雨浇水太多使花叶发黄，她查资料后减少浇水，花恢复了。”用一句话概括。', '小雨调整浇水方法，使花恢复健康。'],
    ['用一句话概括一次你解决小问题的经过，说明结果。', '我把容易混淆的书分开，找书更方便了。']], ['主要人物与事件准确', '保留结果且不添加无依据情节', '语言简洁通顺']);

  b(4, 'contrast', sentence, '转折关系与重点', '辨认转折前后信息及转折后的表达重点', ['because'], [
    ['“虽然路远，但是他按时到了。”重点强调？', '他按时到了', '路很近', '他迟到了', 'although-but-focus'], ['“虽然题难，但是她没有放弃。”强调？', '她没有放弃', '题很简单', '她已经放弃', 'although-but-focus'],
    ['“我想去，可是今天有事。”实际限制是？', '今天有事', '不想去', '已经去了', 'but-condition'], ['“天气很冷，不过队员仍在训练。”突出？', '队员仍在训练', '队员停止训练', '天气变暖', 'but-focus']]);
  b(4, 'reference-chain', reading, '跨句指代线索', '利用语义一致和候选对象追踪跨句代词', ['pronoun'], [
    ['“小林把种子交给小雨，叮嘱她按时浇水。小雨点头。”谁要浇水？', '小雨', '小林', '种子', 'recipient-chain'], ['“老师把钥匙交给小禾，请他开门。小禾走向门口。”谁开门？', '小禾', '老师', '钥匙', 'recipient-chain'],
    ['“旧书包拉链坏了，妈妈修好了它。”这里“它”指？', '书包', '妈妈', '手', 'object-chain'], ['“桌上的台灯不亮了，爸爸检查后修好了它。”这里“它”指？', '台灯', '桌子', '爸爸', 'object-chain']]);
  b(4, 'inference', reading, '依据线索作有限推断', '选择由文中线索支持的推断并排除超出证据的猜测', ['detail-evidence'], [
    ['“小禾额头冒汗，手里拿着刚跑完步的号码牌。”较有根据的推断是？', '他刚参加过跑步活动', '他一定拿了冠军', '他每天都跑十公里', 'evidence-limited-event'], ['“她反复练习台词，演出前仍小声背诵。”较有根据的推断是？', '她重视这次演出', '她从不紧张', '演出一定失败', 'evidence-limited-attitude'],
    ['“地面有水，窗户开着，昨夜下雨。”哪项仍不能确定？', '是谁打开了窗户', '昨夜下过雨', '窗户是开着的', 'unknown-boundary'], ['“球场上有湿球和水迹。”仅凭这些不能确定？', '哪位同学最后离开', '球上有水', '地面有水迹', 'unknown-boundary']]);
  b(4, 'observation-order', reading, '观察描写的空间顺序', '从方位与位置变化识别观察顺序', ['eventorder'], [
    ['“先看近处的花，再看远山。”采用？', '由近到远', '从上到下', '时间倒叙', 'near-far'], ['“先写树梢，再写树干，最后写树根。”采用？', '从上到下', '由远到近', '从左到右', 'vertical-order'],
    ['“先描写远山，再描写眼前的小桥。”采用？', '由远到近', '从下到上', '随机顺序', 'far-near'], ['“从门口走进院子，再进入大厅。”采用？', '地点转换顺序', '按人物年龄', '数字大小顺序', 'moving-viewpoint']]);
  b(4, 'comparison-method', reading, '说明中的作比较', '识别用两个对象对照突出特征的说明方式', ['factopinion'], [
    ['“这棵树比旁边的树高一倍。”主要运用？', '作比较', '打比方', '作假设', 'explicit-comparison'], ['“新电池的使用时间是旧电池的两倍。”突出特点的方法是？', '作比较', '拟人', '设问', 'explicit-comparison'],
    ['哪句通过比较突出桥长？', '这座桥比旧桥长五十米', '桥很长', '我喜欢这座桥', 'method-select'], ['哪句通过比较说明重量？', '这个盒子比那个轻一半', '这个盒子是蓝色', '我买了盒子', 'method-select']]);
  b(4, 'numbers-method', reading, '说明中的列数字', '识别具体数字对说明精确性的作用', ['comparison-method'], [
    ['“塔高三十米，共七层。”数字主要使说明？', '具体准确', '含糊模糊', '一定夸张', 'number-function'], ['“车站有二十个检票口。”数字说明？', '检票口的具体数量', '作者心情', '车站一定最好', 'number-function'],
    ['哪句使用列数字？', '树龄约二百年', '树很古老', '树像老人', 'number-select'], ['哪句使用列数字？', '水深五米', '水很清', '水在唱歌', 'number-select']]);
  b(4, 'emotion-evidence', reading, '情感判断与文本证据', '用动作和语言判断有依据的当时情感', ['inference'], [
    ['“看到小树重新发芽，他笑着连声说：太好了！”此时心情较可能是？', '喜悦', '愤怒', '厌烦', 'emotion-dialogue'], ['“得知比赛取消，她垂下头说：真可惜。”此时心情是？', '失落', '兴奋', '得意', 'emotion-dialogue'],
    ['“他紧握双手，等待比赛结果。”仅凭这句较适合说？', '可能紧张，仍需其他线索', '一定愤怒', '完全不在意', 'emotion-uncertainty'], ['“她收好礼物，笑着道谢。”哪项有直接支持？', '她表现出感谢和高兴', '她一定最富有', '她永远不会难过', 'emotion-action']]);
  b(4, 'letter-format', sentence, '书信称呼与署名', '根据收信人与写信人区分称呼和署名', ['pronoun'], [
    ['小禾写信给奶奶，信开头称呼应是？', '亲爱的奶奶', '小禾', '全班同学', 'letter-addressee'], ['小雨写信给老师，开头称呼应是？', '敬爱的老师', '小雨', '我的同学们', 'letter-addressee'],
    ['小林写给爷爷的信，结尾署名应写？', '小林', '爷爷', '邮递员', 'letter-sender'], ['小宁写给朋友的信，结尾署名应写？', '小宁', '朋友', '收件人', 'letter-sender']]);
  b(4, 'remove-redundancy', sentence, '重复语意的修改', '识别同义成分重复并选择简洁通顺的表达', ['synonym'], [
    ['“我再次又检查了一遍。”哪项修改更简洁？', '我再次检查了一遍', '我再次又又检查', '我检查了再次又', 'redundant-adverb'], ['“大约十人左右参加。”可改为？', '大约十人参加', '大约十人左右约参加', '十人约大约参加', 'approximation-redundancy'],
    ['“他首先第一个发言。”可改为？', '他第一个发言', '他首先第一个最先发言', '他发言第首先', 'ordinal-redundancy'], ['“我们共同一起完成了任务。”去掉重复语意可改为？', '我们共同完成了任务', '我们没有完成任务', '只有我完成了任务', 'revision-preserve-meaning']]);
  writing(add, s, 4, 'evidence-explanation', '判断后引用具体证据', '先提出判断，再引用材料中能支持它的行动或语言', ['detail-evidence', 'inference'], [
    ['“小雨发现同学没带伞，便把自己的伞借给他，自己等家人来接。”说明小雨表现出的品质，并引用一个细节。', '小雨愿意帮助别人，依据是她把自己的伞借给同学。'],
    ['写出你对一位人物的一个判断，并举出你亲眼看到的一件事作为依据。', '同桌很负责，值日后还检查了门窗。'],
    ['“小禾第一次种植失败后查资料、调整方法，第二次终于发芽。”说明他的表现并给证据。', '小禾遇到困难仍愿意尝试，失败后查资料并改进了方法。'],
    ['用一段话说明某项活动为什么值得参加，给出一个具体理由或事实。', '阅读会值得参加，因为我们可以互相推荐并讨论读过的书。']], ['判断与证据对应', '证据具体且不歪曲材料', '不把猜测当成确定事实']);

  b(5, 'motivation', reading, '人物动机的条件推断', '结合前后事件判断行动目的并保留证据边界', ['inference'], [
    ['“同桌忘带午饭。小禾把自己的饭分出一半。”较有根据的动机是？', '帮助同桌解决午饭问题', '一定为了得奖', '不喜欢自己的午饭', 'action-purpose'], ['“发现游客迷路，小雨拿出地图指路。”较有根据的目的？', '帮助游客找到路线', '一定想卖地图', '不想回家', 'action-purpose'],
    ['“为了让大家看清实验，小林调低灯光。”调灯的目的？', '让大家看清实验', '省下所有电费', '取消实验', 'explicit-purpose'], ['“为保护幼苗，队员给它搭起遮阳棚。”搭棚是为了？', '保护幼苗', '让幼苗受冻', '遮住道路', 'explicit-purpose']]);
  b(5, 'environment', reading, '环境描写与后文联系', '依据具体上下文解释环境对情节的作用', ['emotion-evidence'], [
    ['“雨越下越大，山路泥泞。救援队放慢速度继续前进。”前两句突出？', '前进环境困难', '队员一定迷路', '队员不愿救援', 'environment-obstacle'], ['“四周一片漆黑，他摸索着寻找手电筒。”环境说明？', '需要照明的原因', '人物一定胆小', '手电筒一定损坏', 'environment-cause'],
    ['“阳光照进窗，收到好消息的她笑了。”结合上下文可说环境？', '与喜悦的氛围相协调', '证明她永远快乐', '说明消息一定虚假', 'environment-tone'], ['“烈日下，工人不停擦汗。”烈日与什么细节呼应？', '不停擦汗', '工人的名字', '城市人口', 'environment-detail']]);
  b(5, 'information-combine', reading, '两处信息合并', '结合两条互补材料满足同一任务的全部条件', ['notice', 'instruction'], [
    ['通知甲：周六开放。通知乙：每次限十人。周六十一人一起入内是否符合？', '不符合人数限制', '符合全部条件', '因为周六不开放', 'two-constraints'], ['规定：闭馆前一小时停止入场；17点闭馆。16点30分到能入场吗？', '不能，已过入场时间', '能，一定开放', '因为周日闭馆', 'time-rule-combination'],
    ['材料甲：A线路到公园。材料乙：A线路周一停运。周一可仅按甲材料坐A线吗？', '不能，还要考虑停运信息', '可以忽略乙', '说明公园不存在', 'cross-source-condition'], ['甲：活动需带笔。乙：在室外进行，预报下雨。合理准备？', '带笔并考虑雨具', '只带雨具不带笔', '什么都不带', 'task-preparation']]);
  b(5, 'source-reliability', reading, '信息来源的可核查性', '优先选择与问题相关且能核查原始出处的资料', ['factopinion'], [
    ['要查询图书馆今天是否开放，优先看？', '图书馆当天官方公告', '三年前游记', '匿名猜测', 'current-official-source'], ['要确认校运动会时间，优先看？', '学校最新通知', '去年的聊天截图', '不知来源的传言', 'current-official-source'],
    ['一篇文章给出数据但无日期和出处，合理做法是？', '核查原始数据及日期', '直接当作永远正确', '只看标题', 'data-verification'], ['网上一句话被说成名人原话，合理做法？', '查可靠原文出处', '转发次数多就相信', '配图好看就相信', 'quotation-verification']]);
  b(5, 'claim-support', reading, '观点与理由的关联', '选择直接支持给定观点的事实或理由', ['detail-evidence'], [
    ['观点“应节约用水”，哪项理由最相关？', '可用淡水有限', '水杯有多种颜色', '操场很宽', 'claim-resource'], ['观点“读书时可做批注”，相关理由是？', '批注有助记录疑问与理解', '书皮很厚', '窗外很亮', 'claim-method'],
    ['“步行上学可以增加活动量”，最相关的支持是？', '步行过程需要持续身体活动', '校门是蓝色', '书包有拉链', 'evidence-relevance'], ['“应保护校园树木”，最相关的支持是？', '树木能提供遮阴和生态空间', '椅子是新的', '钟表走得准', 'evidence-relevance']]);
  b(5, 'outline', reading, '主要事件与次要细节', '为提纲保留推动情节的主要事件', ['paragraph-summary'], [
    ['故事写“发现漏水、查找原因、修好水管”，另写衣服颜色。提纲宜保留？', '发现问题到解决问题的事件', '只写衣服颜色', '只写天气', 'plot-outline'], ['文章围绕“准备、试验、改进、成功”，提纲宜按？', '主要步骤组织', '纸张颜色组织', '人物身高组织', 'process-outline'],
    ['概括一次比赛，哪个细节通常最关键？', '参赛经过和结果', '鞋带颜色', '观众衣服花纹', 'key-detail-selection'], ['概括一次种植，哪个通常最关键？', '种植做法及生长结果', '花盆价格标签字体', '旁边路灯型号', 'key-detail-selection']]);
  b(5, 'ambiguity', sentence, '句子歧义与明确对象', '识别指代不明并选择对象明确的改写', ['reference-chain'], [
    ['“小林对小禾说他获奖了”指代不明，哪项明确是小禾获奖？', '小林对小禾说：“你获奖了。”', '小林对小禾说他自己他获奖了', '他们说他获奖了', 'pronoun-ambiguity'],
    ['“妈妈告诉姐姐她很忙”若要明确妈妈忙，可改为？', '妈妈对姐姐说：“我很忙。”', '妈妈告诉她她很忙', '她很忙告诉姐姐', 'pronoun-ambiguity'],
    ['“我看见拿着望远镜的同学”若要明确同学拿望远镜，可说？', '那个拿望远镜的同学被我看见了', '我用望远镜看见同学', '望远镜看见同学', 'modifier-ambiguity'],
    ['“我用望远镜看见同学”明确谁使用望远镜？', '我', '同学', '无法判断任何人', 'explicit-instrument']]);
  b(5, 'quoted-source', sentence, '引用与转述的区别', '区分保留原话的直接引用和意思转述', ['dialoguepunctuation'], [
    ['“老师说：‘请安静。’”属于？', '直接引用原话', '概括全部课程', '毫无人物语言', 'direct-quotation'], ['“爸爸说：‘我晚些回家。’”属于？', '直接引语', '间接转述', '书名', 'direct-quotation'],
    ['“老师请大家保持安静。”属于？', '转述意思', '逐字引用原话', '书名', 'indirect-report'], ['“他表示明天会参加。”属于？', '转述意思', '完整直接引语', '没有表达内容', 'indirect-report']]);
  b(5, 'logical-condition', sentence, '必要条件与充分条件的语言', '根据“只有才”“只要就”的明确表达判断条件', ['because', 'contrast'], [
    ['“只有持票才能入场。”没有票能按这条规则入场吗？', '不能', '一定能', '规则未涉及票', 'necessary-condition'], ['“只有完成登记才可借书。”未登记能借吗？', '不能', '一定能', '规则说不用登记', 'necessary-condition'],
    ['“只要按时提交就算完成本环节。”按时提交能满足本环节完成条件吗？', '能', '不能', '必须另交费用', 'sufficient-condition'], ['“只要气温低于零度就记录为负温。”-2℃是否应记录负温？', '应记录', '不应记录', '必须高于十度', 'sufficient-condition']]);
  writing(add, s, 5, 'compare-summary', '合并材料并说明限制', '合并两条材料形成建议，同时交代适用条件', ['information-combine', 'source-reliability'], [
    ['材料甲：骑车能锻炼身体。材料乙：这条路周一施工封闭。给周一上学提出建议并说明依据。', '骑车有锻炼作用，但周一道路封闭，应先查替代路线或选择其他安全方式。'],
    ['比较你用过的两种学习方法，写出各自适用条件，避免说一种方法永远最好。', '默写适合检查词语记忆，讲解适合检查理解，可以按目标搭配使用。'],
    ['材料甲：公园免费开放。材料乙：暴雨时临时关闭。为暴雨天出游写一句有依据的建议。', '公园通常免费，但暴雨可能关闭，应先核实当天公告并调整安排。'],
    ['为一次班级活动写建议，给出两条依据和一个需要核实的条件。', '阅读分享可互相推荐书籍，也能练习表达，但需先确认场地时间。']], ['准确合并至少两条相关信息', '建议与材料条件一致', '明确限制或待核实事项而不绝对化']);

  b(6, 'viewpoint-compare', reading, '不同观点的共同点与分歧', '分别记录两方主张，辨认真正分歧', ['claim-support', 'information-combine'], [
    ['甲赞成每天跑步，乙赞成每周跑三次；两人都赞成锻炼。分歧在？', '跑步频次', '是否需要锻炼', '跑步是否存在', 'shared-goal-different-method'], ['甲建议纸质阅读，乙建议电子阅读；都主张每天阅读。分歧在？', '阅读媒介', '是否阅读', '是否识字', 'shared-goal-different-method'],
    ['甲认为应延长开放时间，乙认为应增加馆藏。可确定？', '两人的建议重点不同', '乙一定反对延长时间', '甲一定反对增加馆藏', 'avoid-false-conflict'], ['甲强调速度，乙强调准确。仅凭这两句可说？', '关注重点不同，未必完全对立', '二人一定互相否定', '二人说的是同一指标', 'avoid-false-conflict']]);
  b(6, 'rhetorical-question', sentence, '反问句的肯定含义', '把明确反问转换为对应陈述含义', ['questionmark'], [
    ['“难道我们不该守时吗？”表达的意思是？', '我们应该守时', '我们不该守时', '在询问几点', 'negative-rhetorical'], ['“难道这不值得学习吗？”表达？', '这值得学习', '这不值得学习', '没有任何态度', 'negative-rhetorical'],
    ['“谁能否认努力的价值呢？”意思是？', '努力有价值', '努力没有价值', '只问人物姓名', 'universal-rhetorical'], ['“这样的帮助怎能忘记？”意思是？', '不能忘记这样的帮助', '应该忘记帮助', '只在问日期', 'rhetorical-impossibility']]);
  b(6, 'double-negative', sentence, '双重否定的基本含义', '在明确句子中把双重否定还原为肯定含义', ['logical-condition'], [
    ['“没有人不愿意参加”基本意思是？', '所有人都愿意参加', '所有人都不愿意参加', '只有一个人参加', 'universal-double-negative'], ['“没有一处不经过检查”基本意思是？', '每一处都经过检查', '没有地方被检查', '只检查一处', 'universal-double-negative'],
    ['“我不得不承认这个事实”意思是？', '我必须承认这个事实', '我完全否认事实', '我没有表达', 'necessity-double-negative'], ['“他不能不重视安全”意思是？', '他必须重视安全', '他不重视安全', '他只重视速度', 'necessity-double-negative']]);
  b(6, 'counterevidence', reading, '证据与反证的区分', '识别能削弱一个全称判断的具体反例', ['claim-support', 'inference'], [
    ['有人说“所有金属都不能浮在水面”，哪项可能构成反例线索、值得核查？', '有特殊形状的金属船能浮在水面', '木船能浮', '石头会沉', 'universal-counterexample'],
    ['有人说“每次走A路都更快”，哪项能直接检验这句话？', '某次相同出发条件下A路用时更长的记录', 'A路树很多', 'A路名字短', 'comparison-counterexample'],
    ['观点“本周天天下雨”，哪项是直接反证？', '周三全天没有降雨的可靠记录', '本周有一天很冷', '去年下过雨', 'dated-counterevidence'],
    ['观点“这页没有错字”，哪项能直接反驳？', '指出一处并用可靠字典核实的错字', '纸张发黄', '作者很认真', 'specific-counterevidence']]);
  b(6, 'explanation-vs-fact', reading, '观察事实与原因猜测', '分开直接观察和仍需验证的解释', ['factopinion', 'inference'], [
    ['“叶子发黄了，可能因为缺水。”直接观察是？', '叶子发黄', '一定缺水', '一定虫害', 'observation-explanation'],
    ['“这次答错，可能没理解题意。”已确认的事实是？', '这次答错', '一定不认真', '一定没有能力', 'observation-explanation'],
    ['要验证植物因缺水发黄，合适做法？', '控制其他条件比较合理浇水后的变化', '只给植物贴标签', '看一次便下结论', 'testable-explanation'],
    ['要判断错题是否因为看漏条件，合适做法？', '用明确提示条件的新题再检查，并对比过程', '直接说孩子粗心', '只抄正确答案', 'testable-explanation']]);
  b(6, 'narrative-order', reading, '顺叙与倒叙结构', '依据开头与后续事件的时间关系判断叙述方式', ['eventorder', 'outline'], [
    ['文章先写获奖一刻，再回忆准备和比赛经过，主要是？', '倒叙开头', '完全按时间顺序', '只写说明书', 'result-first-flashback'],
    ['先写小树长大，再回忆最初播种，开头运用？', '倒叙', '纯粹顺叙', '列数字', 'result-first-flashback'],
    ['按起床、上学、放学的发生先后写一天，是？', '顺叙', '倒叙', '下定义', 'chronological'],
    ['按准备、出发、抵达、返回的先后写旅行，是？', '顺叙', '倒叙', '打比方', 'chronological']]);
  b(6, 'perspective', reading, '叙述人称与信息限制', '辨认第一第三人称及叙述可知范围', ['pronoun'], [
    ['“我推开门，看到桌上有信。”采用？', '第一人称', '第二人称', '没有叙述者', 'first-person-identify'],
    ['“小林推开门，看到桌上有信。”采用？', '第三人称', '第一人称', '第二人称', 'third-person-identify'],
    ['“我猜他有些紧张。”其中哪部分仍是叙述者推测？', '他有些紧张', '叙述者在猜', '句中出现了我', 'perspective-boundary'],
    ['第一人称只写“我没听见”，能据此断定别处没人说话吗？', '不能，叙述者的信息有限', '一定能', '说明世界没有声音', 'perspective-boundary']]);
  b(6, 'title-theme', reading, '标题与核心内容对应', '选择覆盖主要事件及重点、不过度添加含义的标题', ['paragraph-summary', 'outline'], [
    ['短文主要写全班合力修复图书角并建立借阅规则。哪个标题更贴切？', '我们一起修复图书角', '一次远足', '神秘的深海', 'event-title'],
    ['文章主要说明蚂蚁如何交流寻找食物。哪个标题贴切？', '蚂蚁怎样传递食物信息', '春天的花', '我的学校', 'expository-title'],
    ['短文讲种植失败后改变方法终于发芽，哪个标题最相关？', '改进方法后的小苗', '最完美的人从不失败', '海上的风', 'theme-with-boundary'],
    ['文章只记录一次合作成功，标题不宜绝对化为？', '合作永远不会失败', '一次合作的经历', '一起完成任务', 'overgeneralized-title']]);
  b(6, 'evidence-citation', reading, '引用证据与过度推广', '区分忠实引用、合理概括与无依据推广', ['quoted-source', 'source-reliability'], [
    ['材料“本班20人中有12人喜欢阅读”，哪项表述忠实？', '本班受调查者中12人喜欢阅读', '全国所有人都喜欢阅读', '本班无人喜欢阅读', 'sample-scope'],
    ['材料“本周三次练习均完成”，可支持？', '本周三次练习完成', '今后永远不出错', '全部知识都掌握', 'time-scope'],
    ['引用原文时删去“不一定”会怎样？', '可能改变原意', '永远不影响意思', '一定更准确', 'qualification-preservation'],
    ['只引用支持自己的一半句子而隐去相反条件，合理吗？', '不合理，应保留影响结论的条件', '合理，越短越好', '只要引号正确就可以', 'context-preservation']]);
  writing(add, s, 6, 'argument-revision', '提出观点并回应另一解释', '用证据说明观点，同时回应一个合理替代解释或限制', ['viewpoint-compare', 'counterevidence', 'evidence-citation'], [
    ['材料：班级两周试行阅读批注，部分同学更易复习，另有同学认为记录过多影响阅读。写一段建议，同时回应两类体验。', '可以保留少量关键批注并按目标调整。部分同学复习更方便，但记录过多可能打断阅读，宜比较简短批注后的效果。'],
    ['就一种你试过的学习方法提出建议，说明依据、可能的其他解释，以及下一次怎么验证。', '分段复述帮助我发现遗漏，但也可能因为材料更熟悉；可用一篇难度相近的新文章再次比较。'],
    ['“两次练习后成绩提高”是否足以证明一种方法对所有人有效？写出判断、理由和后续验证建议。', '还不足以证明普遍有效，样本少且材料可能不同，需更多同条件新题与延迟检查。'],
    ['为班级选择一项改进措施，提出主张、两个证据要求和一条可能限制。', '建议优化图书借阅规则，需要记录找书时间和归还情况，也要考虑不同年级使用习惯。']], ['主张明确且证据对应', '保留材料范围与条件', '提出合理替代解释或限制', '给出可执行的后续验证']);
}

export function addEnglishCurriculum(add: CurriculumAuthor) {
  const s = 'english', word = '字母与词语', form = '句法与表达', read = '阅读与语用';
  const b = (g: number, code: string, strand: string, name: string, objective: string, pre: string[], rows: Row[]) => bank(add, s, g, code, strand, name, objective, pre, rows);
  b(1, 'lettercase', word, '英文字母大小写对应', '辨认同一个字母的大小写形式（启蒙路径）', [], [
    ['A对应的小写字母是？', 'a', 'b', 'd', 'upper-to-lower'], ['B对应的小写字母是？', 'b', 'd', 'p', 'upper-to-lower'],
    ['m对应的大写字母是？', 'M', 'N', 'W', 'lower-to-upper'], ['q对应的大写字母是？', 'Q', 'P', 'G', 'lower-to-upper']]);
  b(1, 'alphabet', word, '字母表相邻顺序', '按英文字母顺序确定相邻字母（启蒙路径）', ['lettercase'], [
    ['A, B, __。下一个字母？', 'C', 'D', 'E', 'alphabet-next'], ['L, M, __。下一个字母？', 'N', 'O', 'K', 'alphabet-next'],
    ['__, D, E。空缺字母？', 'C', 'B', 'F', 'alphabet-previous'], ['__, Y, Z。空缺字母？', 'X', 'W', 'V', 'alphabet-previous']]);
  b(1, 'greeting', read, '基本问候语回应', '根据见面时段与交际意图回应问候（启蒙路径）', [], [
    ['早上见面说：Good ____.', 'morning', 'night', 'bye', 'greeting-time'], ['晚上睡觉前说：Good ____.', 'night', 'morning', 'afternoon', 'greeting-time'],
    ['别人说“Hello!”时合适的回应？', 'Hello!', 'Goodbye forever.', 'I am a pencil.', 'greeting-response'], ['离开时说什么？', 'Goodbye!', 'Good morning!', 'Thank you for nothing.', 'farewell-response']]);
  b(1, 'iam', form, 'I与am的搭配', '用am完成第一人称单数身份句（启蒙路径）', [], [
    ['I ____ Amy.', 'am', 'is', 'are', 'i-name'], ['I ____ a student.', 'am', 'is', 'are', 'i-role'],
    ['____ am Tom.', 'I', 'He', 'They', 'am-subject'], ['____ am six.', 'I', 'She', 'We', 'am-subject']]);
  b(1, 'color', word, '颜色词与描述对应', '根据明确的颜色描述选择英语词（启蒙路径）', ['lettercase'], [
    ['“红色的书”应是a ____ book.', 'red', 'blue', 'green', 'color-context'], ['“蓝色的笔”应是a ____ pen.', 'blue', 'red', 'green', 'color-context'],
    ['green的中文意思是？', '绿色', '红色', '黑色', 'color-meaning'], ['black的中文意思是？', '黑色', '白色', '黄色', 'color-meaning']]);
  b(1, 'numberword', word, '一至十英语数量词', '把书面英语数量词与数字对应（启蒙路径）', [], [
    ['three对应哪个数字？', '3', '2', '4', 'number-word-read'], ['seven对应哪个数字？', '7', '6', '8', 'number-word-read'],
    ['5的英语是？', 'five', 'four', 'six', 'number-word-produce'], ['9的英语是？', 'nine', 'eight', 'ten', 'number-word-produce']]);
  b(1, 'simpleplural', form, '规则名词复数加s', '在明确多于一个的语境使用规则复数（启蒙路径）', [], [
    ['two ____.（cat）', 'cats', 'cat', 'cates', 'plural-number'], ['three ____.（book）', 'books', 'book', 'bookes', 'plural-number'],
    ['“一支笔”和“两支笔”，后者应写？', 'two pens', 'two pen', 'a pens', 'plural-phrase'], ['“四只狗”应写？', 'four dogs', 'four dog', 'a dogs', 'plural-phrase']]);
  b(1, 'he-she', form, 'he与she指代', '按明确人物线索选择he或she（启蒙路径）', ['iam'], [
    ['Amy is a girl. ____ is six.', 'She', 'He', 'It', 'gender-pronoun'], ['Tom is a boy. ____ is seven.', 'He', 'She', 'It', 'gender-pronoun'],
    ['“她是老师”应选？', 'She is a teacher.', 'He is a teacher.', 'It is a teacher.', 'pronoun-meaning'], ['“他是学生”应选？', 'He is a student.', 'She is a student.', 'They are students.', 'pronoun-meaning']]);
  b(1, 'this', form, 'this介绍单个近物', '用this is表达一个近处对象（启蒙路径）', ['iam'], [
    ['This ____ a book.', 'is', 'am', 'are', 'this-be'], ['This ____ a pen.', 'is', 'are', 'am', 'this-be'],
    ['“这是我的猫”应选？', 'This is my cat.', 'These is my cat.', 'This are my cat.', 'this-meaning'], ['“这是一本书”应选？', 'This is a book.', 'This are books.', 'These is a book.', 'this-meaning']]);
  writing(add, s, 1, 'introduce-self', '用简单句介绍自己', '用I am介绍姓名或角色（启蒙路径；不等同必修教材年级）', ['iam'], [
    ['用“I am ...”写一句话，介绍你的姓名。', 'I am Amy.'], ['用一句英语介绍自己是一名学生。', 'I am a student.'],
    ['把“我叫Tom”写成I am开头的句子。', 'I am Tom.'], ['用I am写一句符合你自己的介绍。', 'I am a student.']], ['句中主语与am匹配', '介绍信息明确', '句首及姓名大写，句末标点恰当']);

  b(2, 'article', form, 'a与an的基本读音规则', '在明确常见词前按首音选择a或an（启蒙路径）', ['lettercase'], [
    ['____ apple', 'an', 'a', 'many', 'vowel-apple'], ['____ egg', 'an', 'a', 'many', 'vowel-egg'],
    ['____ book', 'a', 'an', 'many', 'consonant-book'], ['____ cat', 'a', 'an', 'many', 'consonant-cat']]);
  b(2, 'be', form, 'am is are与主语匹配', '根据主语人称与单复数选择be形式', ['iam', 'he-she'], [
    ['She ____ my sister.', 'is', 'am', 'are', 'singular-be'], ['He ____ happy.', 'is', 'am', 'are', 'singular-be'],
    ['We ____ students.', 'are', 'is', 'am', 'plural-be'], ['They ____ at school.', 'are', 'is', 'am', 'plural-be']]);
  b(2, 'demonstrative', form, 'this these与单复数', '用this对应单数、these对应复数', ['this', 'simpleplural'], [
    ['____ is a book.（这是一本书）', 'This', 'These', 'They', 'demonstrative-singular'], ['____ is my pen.', 'This', 'These', 'We', 'demonstrative-singular'],
    ['____ are books.（这些是书）', 'These', 'This', 'That', 'demonstrative-plural'], ['____ are my cats.（这些是我的猫）', 'These', 'This', 'It', 'demonstrative-plural']]);
  b(2, 'have-has', form, 'have与has的基本人称', '按第三人称单数与其他人称选择have或has', ['he-she'], [
    ['I ____ a book.', 'have', 'has', 'is', 'first-person-have'], ['We ____ pencils.', 'have', 'has', 'is', 'plural-have'],
    ['She ____ a cat.', 'has', 'have', 'are', 'singular-has'], ['Tom ____ a dog.', 'has', 'have', 'are', 'singular-has']]);
  b(2, 'possessive', form, 'my your his her所属关系', '根据明确的所属对象使用物主限定词', ['he-she'], [
    ['I have a pen. It is ____ pen.', 'my', 'his', 'her', 'first-possessive'], ['You have a book. It is ____ book.', 'your', 'my', 'her', 'second-possessive'],
    ['Amy is a girl. This is ____ bag.', 'her', 'his', 'my', 'third-possessive'], ['Tom is a boy. This is ____ bike.', 'his', 'her', 'my', 'third-possessive']]);
  b(2, 'can', form, 'can后动词原形', '在能力表达中使用can加动词原形', [], [
    ['I can ____.（swim）', 'swim', 'swims', 'swimming', 'can-form'], ['She can ____.（run）', 'run', 'runs', 'running', 'can-form'],
    ['“他会唱歌”应选？', 'He can sing.', 'He can sings.', 'He can singing.', 'can-sentence'], ['“我们会跳舞”应选？', 'We can dance.', 'We can dances.', 'We can dancing.', 'can-sentence']]);
  b(2, 'placeword', word, 'in on under空间词', '把明确的物体位置与英语介词对应', [], [
    ['“在盒子里面”应是____ the box.', 'in', 'on', 'under', 'preposition-container'], ['“在桌子下面”应是____ the desk.', 'under', 'on', 'in', 'preposition-below'],
    ['The book is on the desk. 书在哪里？', '桌子上面', '桌子下面', '盒子里面', 'position-reading'], ['The cat is under the chair. 猫在哪里？', '椅子下面', '椅子上面', '门外', 'position-reading']]);
  b(2, 'questionword', read, 'who what where提问对象', '区分人物、事物和地点的提问词', [], [
    ['____ is she? She is my sister.', 'Who', 'Where', 'When', 'question-person'], ['____ is it? It is a book.', 'What', 'Who', 'When', 'question-thing'],
    ['____ is Tom? He is at school.', 'Where', 'Who', 'What', 'question-location'], ['Where提问的通常是？', '地点', '人物姓名', '颜色', 'question-function']]);
  b(2, 'polite', read, '感谢道歉与请求', '根据交际目的选择礼貌表达', ['greeting'], [
    ['别人帮助你后，你可以说？', 'Thank you.', 'Go away.', 'I am a book.', 'gratitude'], ['你不小心碰到别人，应说？', 'Sorry.', 'Good night.', 'I am ten.', 'apology'],
    ['礼貌请求一本书，可说？', 'A book, please.', 'I am a book.', 'Book no thank.', 'request'], ['别人说Thank you，合适回应？', 'You are welcome.', 'I am sorry.', 'Good night.', 'gratitude-response']]);
  writing(add, s, 2, 'object-description', '用两句英语描述物品', '写明物品名称并补充颜色或位置', ['this', 'color', 'placeword'], [
    ['写两句英语描述一本红色的书。', 'This is a book. It is red.'], ['用两句英语描述你的一件文具。', 'This is my pen. It is blue.'],
    ['写两句英语描述桌子上的一支笔。', 'This is a pen. It is on the desk.'], ['描述你的书包，至少给出名称和一个特征。', 'This is my bag. It is green.']], ['对象清楚且两句指代一致', 'be与主语匹配', '有一个符合要求的特征或位置']);

  b(3, 'phonics-a', word, '常见短元音a词族', '从书面常见词识别与cat同类的短元音拼写词族；不代替听说测量', ['lettercase'], [
    ['哪个词与cat同属-at拼写词族？', 'hat', 'dog', 'sun', 'rime-at'], ['哪个词以-an结尾并与man同词族？', 'fan', 'bed', 'sit', 'rime-an'],
    ['c + at组成哪个常见单词？', 'cat', 'cut', 'cot', 'blend-written'], ['m + ap组成哪个词？', 'map', 'mop', 'mat', 'blend-written']]);
  b(3, 'plural-es', form, 's x ch结尾复数加es', '对常见s x ch结尾名词使用es复数', ['simpleplural'], [
    ['two ____（box）', 'boxes', 'boxs', 'box', 'plural-box'], ['three ____（bus）', 'buses', 'buss', 'bus', 'plural-bus'],
    ['“两只手表”应选？', 'two watches', 'two watchs', 'two watch', 'plural-watch-context'], ['“三个盒子”应选？', 'three boxes', 'three boxs', 'three box', 'plural-box-context']]);
  b(3, 'do-does', form, '一般现在时do does疑问', '按主语单复数选择do或does构成疑问', ['be'], [
    ['____ you like apples?', 'Do', 'Does', 'Is', 'do-second-person'], ['____ they play football?', 'Do', 'Does', 'Is', 'do-plural'],
    ['____ she like milk?', 'Does', 'Do', 'Are', 'does-singular'], ['____ Tom read books?', 'Does', 'Do', 'Are', 'does-singular']]);
  b(3, 'third-s', form, '一般现在时第三人称单数', '在肯定句中按主语使用动词第三人称单数', ['do-does'], [
    ['He ____ books every day.（read）', 'reads', 'read', 'reading', 'habit-read'], ['Amy ____ milk every morning.（drink）', 'drinks', 'drink', 'drinking', 'habit-drink'],
    ['“Tom每天踢足球”应选？', 'Tom plays football every day.', 'Tom play football every day.', 'Tom playing football every day.', 'habit-sentence'], ['“她每天唱歌”应选？', 'She sings every day.', 'She sing every day.', 'She singing every day.', 'habit-sentence']]);
  b(3, 'there-is', form, 'there is are存在句', '根据存在对象单复数选择is或are', ['be', 'simpleplural'], [
    ['There ____ a book on the desk.', 'is', 'are', 'am', 'there-singular'], ['There ____ a cat in the room.', 'is', 'are', 'am', 'there-singular'],
    ['There ____ two books on the desk.', 'are', 'is', 'am', 'there-plural'], ['There ____ three dogs in the park.', 'are', 'is', 'am', 'there-plural']]);
  b(3, 'like-ing', form, 'like后动名词形式', '在指定like doing结构中使用动名词', ['can'], [
    ['在like doing结构中：I like ____.（read）', 'reading', 'reads', 'readed', 'like-reading'], ['在like doing结构中：She likes ____.（dance）', 'dancing', 'dances', 'danceing', 'like-spelling'],
    ['在like doing结构中：We like ____.（swim）', 'swimming', 'swiming', 'swims', 'like-double-consonant'], ['在like doing结构中：He likes ____.（run）', 'running', 'runing', 'runs', 'like-double-consonant']]);
  b(3, 'when', read, 'when与时间回答', '根据时间词和时间状语回答when问题', ['questionword'], [
    ['Amy reads at seven. When does Amy read?', 'At seven.', 'At school.', 'Amy.', 'time-numeric'], ['Tom gets up at six. When does Tom get up?', 'At six.', 'In the park.', 'A book.', 'time-numeric'],
    ['We play football on Sunday. When do we play?', 'On Sunday.', 'In the box.', 'Blue.', 'time-day'], ['The club meets on Friday. When does it meet?', 'On Friday.', 'At the library.', 'Tom.', 'time-day']]);
  b(3, 'simple-instruction', read, '英语课堂指令理解', '把简短书面英语指令对应到正确操作', ['polite'], [
    ['Open your book. 要做什么？', '打开书', '关上门', '坐下', 'instruction-open'], ['Close the door. 要做什么？', '关门', '开书', '举手', 'instruction-close'],
    ['“请坐下”应选？', 'Sit down, please.', 'Stand up, please.', 'Open the window.', 'instruction-produce'], ['“请举手”应选？', 'Put up your hand, please.', 'Close your eyes.', 'Sit down.', 'instruction-produce']]);
  b(3, 'short-text-detail', read, '短文中人物爱好对照', '在两个人物的不同爱好间定位对应信息', ['when', 'questionword'], [
    ['Amy likes books. Ben likes football. What does Ben like?', 'Football.', 'Books.', 'Music.', 'contrast-people'], ['Lucy likes apples. Tom likes bananas. What does Lucy like?', 'Apples.', 'Bananas.', 'Oranges.', 'contrast-people'],
    ['Sam reads on Monday and swims on Friday. What does Sam do on Friday?', 'Swims.', 'Reads.', 'Sings.', 'contrast-days'], ['Lily draws at school and reads at home. What does Lily do at home?', 'Reads.', 'Draws.', 'Runs.', 'contrast-places']]);
  writing(add, s, 3, 'daily-routine', '用现在时写日常活动', '用简单现在时写出两项日常活动，主语动词一致', ['third-s', 'when'], [
    ['用两句英语写Tom的习惯：每天阅读、每天跑步。', 'Tom reads every day. He runs every day.'], ['用两句英语写你的日常活动。', 'I read every day. I play football after school.'],
    ['写Amy的习惯：六点起床，七点读书。', 'Amy gets up at six. She reads at seven.'], ['用英语写一个家人的两项日常活动。', 'My mother reads every day. She walks in the park.']], ['日常习惯与时间信息明确', '现在时主语动词一致', '两句意思连贯且标点恰当']);

  b(4, 'present-continuous', form, '现在进行时be doing', '根据now语境使用be与动词ing', ['be', 'like-ing'], [
    ['She is ____ now.（read）', 'reading', 'reads', 'read', 'continuous-participle'], ['They are ____ now.（play）', 'playing', 'plays', 'played', 'continuous-participle'],
    ['Tom ____ running now.', 'is', 'are', 'am', 'continuous-be'], ['We ____ reading now.', 'are', 'is', 'am', 'continuous-be']]);
  b(4, 'simple-vs-continuous', form, '习惯与正在发生的动作', '依据every day和now选择正确时态形式', ['third-s', 'present-continuous'], [
    ['He ____ football every day.', 'plays', 'is play', 'playing', 'habit-marker'], ['She ____ books every morning.', 'reads', 'is read', 'reading', 'habit-marker'],
    ['Look! They ____.', 'are running', 'runs', 'run yesterday', 'current-marker'], ['Listen! She ____.', 'is singing', 'sings every day', 'sing yesterday', 'current-marker']]);
  b(4, 'some-any', form, 'some any基本肯否语境', '在普通陈述肯定与否定语境选择some或any', ['there-is'], [
    ['There are ____ apples.（普通肯定陈述）', 'some', 'any', 'an', 'affirmative-some'], ['I have ____ books.（普通肯定陈述）', 'some', 'any', 'a', 'affirmative-some'],
    ['There are not ____ bananas.', 'any', 'some', 'an', 'negative-any'], ['I do not have ____ pencils.', 'any', 'some', 'a', 'negative-any']]);
  b(4, 'how-many-much', form, 'how many much与可数性', '在常见名词中按可数复数和不可数选提问形式', ['plural-es'], [
    ['How ____ books do you have?', 'many', 'much', 'old', 'countable-many'], ['How ____ apples are there?', 'many', 'much', 'long', 'countable-many'],
    ['How ____ water do you need?', 'much', 'many', 'old', 'uncountable-much'], ['How ____ milk is there?', 'much', 'many', 'tall', 'uncountable-much']]);
  b(4, 'object-pronoun', form, '动词后宾格代词', '在give help等动词后按指代对象使用宾格', ['he-she', 'possessive'], [
    ['Please help ____.（我）', 'me', 'I', 'my', 'object-first'], ['Give ____ the book.（她）', 'her', 'she', 'hers', 'object-third'],
    ['Tom is here. Please ask ____.', 'him', 'he', 'his', 'object-reference'], ['We need help. Please help ____.', 'us', 'we', 'our', 'object-reference']]);
  b(4, 'time-preposition', form, 'at on in时间搭配', '根据钟点、星期和月份选择常用时间介词', ['when'], [
    ['____ seven o’clock', 'at', 'on', 'in', 'time-clock'], ['____ Monday', 'on', 'at', 'in', 'time-weekday'],
    ['____ May（在五月）', 'in', 'on', 'at', 'time-month'], ['____ the morning', 'in', 'on', 'at', 'time-daypart']]);
  b(4, 'reading-referent', read, '英语相邻句代词指代', '根据单复数及句意还原短文代词所指', ['object-pronoun'], [
    ['Amy has a dog. It is small. What does “It” refer to?', 'The dog.', 'Amy.', 'A book.', 'it-reference'], ['Tom buys a book. It is red. What is red?', 'The book.', 'Tom.', 'The shop.', 'it-reference'],
    ['Ben and Sam are friends. They play together. Who are “They”?', 'Ben and Sam.', 'Only Ben.', 'Only Sam.', 'they-reference'], ['The cats are hungry. They need food. What needs food?', 'The cats.', 'The dogs.', 'The books.', 'they-reference']]);
  b(4, 'because-so', read, '英语because与so因果', '区分英语因果连接中原因和结果', ['short-text-detail'], [
    ['Amy takes an umbrella because it is raining. Why does she take an umbrella?', 'Because it is raining.', 'Because it is sunny.', 'Because she has a book.', 'because-cause'], ['Tom drinks water because he is thirsty. Why?', 'He is thirsty.', 'He is cold.', 'He is late.', 'because-cause'],
    ['It is cold, so Ben wears a coat. What is the result?', 'Ben wears a coat.', 'It is cold.', 'Ben buys a bike.', 'so-result'], ['The bus is late, so Amy walks. What does Amy do?', 'She walks.', 'She swims.', 'She sleeps.', 'so-result']]);
  b(4, 'notice-reading', read, '英语通知的时间地点条件', '从短通知中取出活动时间地点或物品要求', ['when', 'simple-instruction'], [
    ['Book club: Friday, 4 pm, Library. Where is the club?', 'In the library.', 'In the park.', 'At home.', 'notice-where'], ['Sports day: Monday, 9 am, Playground. When does it start?', 'At 9 am on Monday.', 'At 4 pm on Friday.', 'At night.', 'notice-when'],
    ['Art class: Bring a pencil. What should you bring?', 'A pencil.', 'A ball.', 'An umbrella.', 'notice-bring'], ['Picnic: Sunday. Bring water. What is required?', 'Water.', 'Milk only.', 'A textbook.', 'notice-bring']]);
  writing(add, s, 4, 'describe-now', '描述当前情景并区别习惯', '以进行时描述正在发生的动作，再用现在时说明一个习惯', ['present-continuous', 'simple-vs-continuous'], [
    ['用两句英语表达：Tom现在在读书；他每天读书。', 'Tom is reading now. He reads every day.'], ['写出你现在正在做的事和你每天做的一件事。', 'I am writing now. I read every day.'],
    ['Amy现在在跑步，她每周日跑步。用两句表达。', 'Amy is running now. She runs on Sundays.'], ['描述一个家人现在的动作，再写一个日常习惯。', 'My father is cooking now. He cooks every day.']], ['正在发生与习惯明确区分', 'be doing与现在时形式正确', '人物指代一致且句子完整']);

  b(5, 'past-regular', form, '规则动词过去式', '在yesterday等明确过去语境使用规则过去式', ['third-s'], [
    ['Tom ____ football yesterday.（play）', 'played', 'plays', 'playing', 'past-play'], ['Amy ____ her room yesterday.（clean）', 'cleaned', 'cleans', 'cleaning', 'past-clean'],
    ['“我昨天步行去学校”应选？', 'I walked to school yesterday.', 'I walk to school yesterday.', 'I walking to school yesterday.', 'past-sentence'], ['“她昨晚看电视”应选？', 'She watched TV last night.', 'She watches TV last night.', 'She watching TV last night.', 'past-sentence']]);
  b(5, 'past-irregular', form, '常用不规则过去式', '对go see eat have使用常用过去式', ['past-regular'], [
    ['I ____ to the park yesterday.（go）', 'went', 'goed', 'goes', 'past-go'], ['She ____ a bird yesterday.（see）', 'saw', 'seed', 'sees', 'past-see'],
    ['“昨天吃了一个苹果”的eat应变为？', 'ate', 'eated', 'eats', 'past-eat'], ['“昨天有一个聚会”的have应变为？', 'had', 'haved', 'has', 'past-have']]);
  b(5, 'past-be', form, 'was were与过去主语', '根据过去语境和主语选择was或were', ['be', 'past-regular'], [
    ['I ____ at home yesterday.', 'was', 'were', 'am', 'past-singular'], ['She ____ happy yesterday.', 'was', 'were', 'is', 'past-singular'],
    ['They ____ at school yesterday.', 'were', 'was', 'are', 'past-plural'], ['We ____ tired last night.', 'were', 'was', 'is', 'past-plural']]);
  b(5, 'did-base', form, 'did后动词原形', '过去疑问与否定句中在did后还原动词', ['past-irregular'], [
    ['Did you ____ to school yesterday?', 'go', 'went', 'goes', 'past-question-base'], ['Did she ____ a book yesterday?', 'read', 'reads', 'reading', 'past-question-base'],
    ['He did not ____ football yesterday.', 'play', 'played', 'plays', 'past-negative-base'], ['They did not ____ apples yesterday.', 'eat', 'ate', 'eats', 'past-negative-base']]);
  b(5, 'future-going', form, 'be going to计划表达', '用be going to加动词原形表达明确计划', ['be', 'can'], [
    ['She is going to ____ tomorrow.', 'swim', 'swims', 'swimming', 'future-base'], ['They are going to ____ next week.', 'travel', 'travels', 'travelling', 'future-base'],
    ['I ____ going to read tonight.', 'am', 'is', 'are', 'future-be'], ['We ____ going to play tomorrow.', 'are', 'is', 'am', 'future-be']]);
  b(5, 'comparative', form, '规则形容词比较级', '在than比较语境中使用常见规则比较级', ['third-s'], [
    ['Tom is ____ than Ben.（tall）', 'taller', 'tall', 'tallest', 'comparative-er'], ['This bag is ____ than that one.（small）', 'smaller', 'small', 'smallest', 'comparative-er'],
    ['“这条路比那条短”应选？', 'This road is shorter than that one.', 'This road is short than that one.', 'This road is shortest than that one.', 'comparative-sentence'], ['“Amy比Lucy年轻”应选？', 'Amy is younger than Lucy.', 'Amy is young than Lucy.', 'Amy is youngest than Lucy.', 'comparative-sentence']]);
  b(5, 'must-rule', read, 'must must not规则与禁止', '区分必须执行和禁止执行的规则含义', ['can', 'polite'], [
    ['You must stop. 意思是？', '你必须停下', '你可以不停', '你必须跑', 'must-obligation'], ['You must wear a helmet. 意思是？', '必须戴头盔', '禁止戴头盔', '无需头盔', 'must-obligation'],
    ['You must not run here. 意思是？', '这里禁止奔跑', '这里必须奔跑', '这里可以随便跑', 'must-not-prohibition'], ['You must not touch it. 意思是？', '禁止触摸', '必须触摸', '建议握紧', 'must-not-prohibition']]);
  b(5, 'sequence-reading', read, '英语事件时间线', '依据before after then还原短文事件先后', ['because-so', 'when'], [
    ['Amy washed her hands before lunch. What happened first?', 'She washed her hands.', 'She had lunch.', 'She slept.', 'before-order'], ['Tom did homework before playing. What happened first?', 'He did homework.', 'He played.', 'He went swimming.', 'before-order'],
    ['Ben read a book. Then he went to bed. What happened later?', 'He went to bed.', 'He read a book.', 'He went to school.', 'then-order'], ['After breakfast, Lucy walked to school. What happened later?', 'She walked to school.', 'She had breakfast.', 'She ate dinner.', 'after-order']]);
  b(5, 'context-word', read, '英语词义的语境线索', '利用短句定义或对照选择词在文中的意义', ['reading-referent'], [
    ['The bag is light, not heavy. “light” means？', '轻的', '光线', '点燃', 'contrast-meaning'], ['The room is bright; we can see clearly. “bright” means？', '明亮的', '黑暗的', '潮湿的', 'result-meaning'],
    ['It is freezing, so wear a warm coat. “freezing” most likely means？', '非常冷', '非常热', '非常安静', 'action-clue'], ['The road is narrow; only one bike can pass. “narrow” means？', '狭窄的', '宽阔的', '弯曲的一定', 'explanation-clue']]);
  writing(add, s, 5, 'past-account', '用过去时写简短经历', '按时间顺序写过去发生的两到三件事', ['past-regular', 'past-irregular', 'sequence-reading'], [
    ['用两到三句写：昨天Tom去公园、踢球、回家。', 'Tom went to the park yesterday. He played football. Then he went home.'],
    ['用两到三句英语写你昨天的一段经历。', 'I walked to school yesterday. I read a book. Then I played with my friends.'],
    ['用英语写Amy昨天先打扫房间、再看书。', 'Amy cleaned her room yesterday. Then she read a book.'],
    ['写一次过去的活动，说明做了什么和感受。', 'I went to the library last Sunday. I read an interesting book. I was happy.']], ['过去时间与时态基本一致', '事件先后清楚', '人物与动作信息完整', '内容符合题意，不以参考范文逐字比对']);

  b(6, 'tense-discrimination', form, '过去现在将来的时间一致', '根据明确时间状语选择过去现在或将来结构', ['past-irregular', 'future-going', 'simple-vs-continuous'], [
    ['Yesterday, she ____ to the park.', 'went', 'goes', 'is going tomorrow', 'past-marker'], ['Every day, he ____ to school.', 'walks', 'walked yesterday', 'is going to tomorrow', 'habit-marker'],
    ['Tomorrow, we ____ visit the museum.', 'are going to', 'were', 'did', 'future-marker'], ['Look! The children ____.', 'are playing', 'played yesterday', 'will yesterday', 'current-marker']]);
  b(6, 'comparison-irregular', form, 'better worse等不规则比较级', '将good bad等常见词与不规则比较级对应', ['comparative'], [
    ['good的比较级是？', 'better', 'gooder', 'best', 'good-comparison'], ['bad的比较级是？', 'worse', 'badder', 'worst', 'bad-comparison'],
    ['This plan is ____ than the old one.（更好）', 'better', 'best', 'good', 'comparison-context'], ['The weather is ____ than yesterday.（更糟）', 'worse', 'worst', 'bad', 'comparison-context']]);
  b(6, 'conditional', form, 'if条件与结果', '区分明确if句中的条件及其对应结果', ['because-so', 'future-going'], [
    ['If it rains, we will stay home. What is the condition?', 'It rains.', 'We stay home.', 'It is sunny.', 'if-condition'], ['If I finish early, I will read. What is the condition?', 'I finish early.', 'I read.', 'I go shopping.', 'if-condition'],
    ['If the shop is closed, we will return tomorrow. What will we do if it is closed?', 'Return tomorrow.', 'Enter anyway.', 'Return yesterday.', 'if-result'], ['If you need help, ask the teacher. What should you do when you need help?', 'Ask the teacher.', 'Hide the question.', 'Leave without asking.', 'if-result']]);
  b(6, 'why-how', read, 'why原因与how方式', '根据提问意图区分原因和方式回答', ['questionword', 'because-so'], [
    ['Why do you like this book?', 'Because it is interesting.', 'By bus.', 'At seven.', 'why-reason'], ['Why does Tom take an umbrella?', 'Because it is raining.', 'By bike.', 'In the library.', 'why-reason'],
    ['How do you go to school?', 'By bus.', 'Because it is fun.', 'On Monday.', 'how-method'], ['How can I learn the route?', 'By reading the map.', 'Because it is cold.', 'At six.', 'how-method']]);
  b(6, 'inference-text', read, '短文有限推断', '选择由行动线索支持的英语推断，排除确定性过度推断', ['context-word', 'reading-referent'], [
    ['Tom puts on a raincoat before going out. What is most likely?', 'He expects rain.', 'He definitely won a race.', 'He is always late.', 'action-inference'],
    ['Amy checks her bag twice before the trip. What is supported?', 'She wants to be prepared.', 'She never forgets anything.', 'She dislikes all trips.', 'action-inference'],
    ['Ben is carrying a football. What can we NOT be sure of?', 'He won today’s match.', 'He has a football.', 'He is carrying something.', 'evidence-boundary'],
    ['Lily says, “I may visit on Sunday.” Is her visit certain?', 'No, it is a possibility.', 'Yes, it is guaranteed.', 'She visited yesterday.', 'modal-boundary']]);
  b(6, 'mainidea', read, '短段主旨概括', '综合相关细节选择覆盖全段的主题', ['short-text-detail', 'sequence-reading'], [
    ['Amy sorts paper, reuses bags and saves water. What is the paragraph mainly about?', 'Amy’s ways to protect the environment.', 'Amy’s favourite colour.', 'The price of paper.', 'action-theme'],
    ['Tom reads daily, writes notes and discusses books. The paragraph is mainly about?', 'Tom’s reading habits.', 'How to cook.', 'A football match.', 'habit-theme'],
    ['A library has books, quiet seats and helpful staff. Best topic?', 'What the library offers.', 'Only one red book.', 'A rainy journey.', 'place-features-theme'],
    ['The team planned, tested and improved a model until it worked. Main idea?', 'How the team solved the problem.', 'The colour of a table.', 'Everyone failed forever.', 'process-theme']]);
  b(6, 'two-source-reading', read, '英语两信息条件合并', '结合开放时间与限制条件作出可执行选择', ['notice-reading', 'conditional'], [
    ['Notice A: Open on Saturday. Notice B: Closed during heavy rain. It rains heavily on Saturday. What should you do?', 'Check the closure and change the plan.', 'Ignore the rain rule.', 'Assume it is always open.', 'schedule-condition'],
    ['The club starts at 4 pm. Registration closes at 3 pm. You arrive at 3:30 without registering. Can you assume entry?', 'No, registration has closed.', 'Yes, no registration is needed.', 'It starts yesterday.', 'deadline-combination'],
    ['The trip is outdoors. Bring water. The forecast says rain. Best preparation?', 'Water and suitable rain protection.', 'Only a football.', 'Nothing.', 'preparation-combination'],
    ['A ticket is required. Children must come with an adult. A child has a ticket but no adult. Are all conditions met?', 'No, an adult is also required.', 'Yes, the ticket is the only rule.', 'Adults are prohibited.', 'two-required-conditions']]);
  b(6, 'evidence-vs-claim', read, '英语观点与证据相关性', '选择直接支撑观点的英语事实并尊重样本范围', ['mainidea', 'inference-text'], [
    ['Claim: Reading notes help review. Which evidence is relevant?', 'Students use the notes to find key ideas later.', 'The notebook is blue.', 'The desk is near a window.', 'claim-evidence'],
    ['Claim: The route is shorter. Which evidence matters?', 'Measured distances of both routes.', 'The road names.', 'The colour of a sign.', 'claim-evidence'],
    ['Three students improved in one lesson. What is safe to say?', 'These three improved in this lesson.', 'Everyone will always improve.', 'No one needs more checks.', 'sample-boundary'],
    ['The notice says “usually open”. Does it mean always open?', 'No, there may be exceptions.', 'Yes, no exceptions.', 'It is never open.', 'qualification-boundary']]);
  b(6, 'self-correction', form, '时态与主谓错误定位', '在简短句中找出明确的时态或主谓不一致并选改写', ['tense-discrimination', 'be'], [
    ['改正“She go to school every day.”', 'She goes to school every day.', 'She going to school every day.', 'She gone to school every day.', 'agreement-revision'],
    ['改正“They is reading now.”', 'They are reading now.', 'They am reading now.', 'They was read now.', 'be-revision'],
    ['改正“I went there tomorrow.”以保留tomorrow的计划含义。', 'I am going to go there tomorrow.', 'I went there yesterday tomorrow.', 'I goes there tomorrow.', 'time-revision'],
    ['改正“Did she went home?”', 'Did she go home?', 'Did she goes home?', 'Did she going home?', 'auxiliary-revision']]);
  writing(add, s, 6, 'plan-with-reasons', '说明计划理由与备选方案', '写出可执行计划、一个理由与条件变化后的安排', ['future-going', 'conditional', 'why-how', 'evidence-vs-claim'], [
    ['Write 3–4 sentences: plan a library visit, give a reason, and say what you will do if it is closed.', 'I am going to visit the library on Saturday. I want to find a science book. If it is closed, I will check the next opening time.'],
    ['用3–4句英语写一个周末计划、理由，以及下雨时的备选方案。', 'I am going to walk in the park. Walking helps me relax. If it rains, I will read at home.'],
    ['Plan a group activity. State the time, one reason and a condition you need to check.', 'We are going to share books on Friday. We can learn from each other. We need to check the room booking first.'],
    ['写3–4句英语提出一条学习建议，说明理由并提醒一个适用条件。', 'You can write short notes while reading. Notes may help you review. Keep them brief if they interrupt your reading.']], ['计划或建议清楚可执行', '理由与计划相关', '条件或备选方案合理', '时态与主谓基本一致，不要求照抄参考范文']);
}

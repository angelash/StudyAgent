import type { CurriculumAuthor } from './original-core-curriculum';
import type { Subject } from '@study-agent/contracts';

/** Oral production is a separate observable skill. These text-prompt tasks do not measure listening or calibrated pronunciation. */
export function addSpokenCurriculum(add: CurriculumAuthor) {
  const oral = (subject: Subject, grade: number, code: string, name: string, objective: string, pre: string[],
    tasks: Array<[string, string]>, criteria: string[]) => add(subject, grade, code, '口语表达', name, objective,
    pre.map(id => `core:${subject}:${id}`), n => ({ stem: `${tasks[n][0]} 请录音回答，可先试听，最长3分钟。`, answer: tasks[n][1],
      mode: 'audio_record', responseShape: { mediaPolicy: 'student-media-v1' }, dimension: n % 2 ? 'transfer' : 'procedure',
      family: n % 2 ? `${code}-personal-production` : `${code}-source-production`,
      rubric: criteria.map((criterion, i) => ({ criterion, weight: i === 0 ? 0.4 : 0.3 })),
    }), tasks.length);
  oral('chinese', 1, 'oral-complete', '口头说清人物与动作', '在录音中用完整语句说清谁在做什么，和书面表达分别记录', ['person'], [
    ['小禾在给花浇水。用自己的话说清谁在做什么。', '小禾正在给花浇水。'], ['用一句话说说家中一个人正在做什么。', '如：妈妈正在看书。'],
    ['小林拿着扫帚打扫地面。请说清这个场景。', '小林正在扫地。'], ['用一句话说你今天在学校做过的一件事。', '如：我今天在操场上跑步。']],
  ['人物或对象和动作明确', '口头语句完整，意思连贯', '录音中的关键内容可听清；不以口音差异扣分']);
  oral('chinese', 2, 'oral-sequence', '口头说明两步顺序', '口头表达两个动作的先后关系，分别观察内容与顺序标记', ['eventorder', 'oral-complete'], [
    ['洗净苹果后再吃苹果。请按先后顺序说一遍。', '先洗苹果，再吃苹果。'], ['说说你整理书包的两个步骤。', '如：先收好课本，再放进文具。'],
    ['先把种子放进土里，然后浇水。请说清这两步。', '先播种，再浇水。'], ['说说你睡前按顺序做的两件事。', '如：先刷牙，再洗脸。']],
  ['两个动作及其先后关系准确', '使用合适的顺序词组织口头表达', '关键语句可听清；允许自然停顿和自我修正']);
  oral('chinese', 3, 'oral-retell', '口头复述关键信息', '依据给定短材料复述对象、问题与处理结果，不补造事实', ['detail-evidence', 'oral-sequence'], [
    ['材料：小林发现图书角的书散落在地上。他分类整理，把破损书交给老师修补。请简要复述。', '小林发现书散落，分类整理，并把破损的书交给老师。'],
    ['说一件你帮忙解决的小事，讲清发生了什么、你做了什么。', '围绕一个真实小事说明问题和行动。'],
    ['材料：小禾看到花盆的土很干，先松土再浇水，最后把花盆移到合适的光照处。请简要复述。', '保留土干、松土浇水和调整位置三个信息。'],
    ['回顾一次找回或整理物品的经历，说清问题、行动和结果。', '事件次序合理，结果与行动对应。']],
  ['保留材料关键事实或说清个人经历的关键环节', '按合理顺序组织，语句衔接可理解', '关键内容可听清，事实与推测分开']);
  oral('chinese', 4, 'oral-explain', '口头解释原因与依据', '用录音区分观察事实和原因解释，避免无依据断言', ['detail-evidence', 'oral-retell'], [
    ['材料：操场积水，老师把体育课改到室内。请说明这次调整的原因和依据。', '依据操场积水，说明为了活动安全改到室内。'],
    ['说一个你最近改变安排的例子，说明原因，并指出你亲自观察到的事实。', '事实和原因对应，不把猜测当事实。'],
    ['材料：图书的书脊破损，小林决定先修补再借阅。请说明理由。', '书脊破损是依据，修补可减少继续损坏。'],
    ['说一次你选择一种学习方法的原因，说明有什么实际例子支持。', '说明选择、理由与可核对的例子。']],
  ['原因与可核对事实对应', '口头说明有清楚的因果连接', '可听清并区分材料事实与个人推测']);
  oral('chinese', 5, 'oral-evidence', '口头用证据回应观点', '口头提出判断并引用相关细节，说明细节怎样支持判断', ['detail-evidence', 'oral-explain'], [
    ['材料：小林连续两周记录花苗高度，发现变化后又核对测量方法。有人说他观察认真，请用材料回应。', '连续记录和核对方法能支持认真观察的判断。'],
    ['选择一个你认可的学习习惯，说明观点并用一个具体经历支持。', '观点明确，具体经历与判断相关。'],
    ['材料：小禾见同学跌倒，先请附近老师帮助，再陪同学去休息。请用材料评价她的做法。', '引用求助和陪同两个细节说明有帮助意识。'],
    ['说一项你完成过的合作任务，用具体行动说明自己贡献了什么。', '用实际行动支持自己的贡献判断。']],
  ['观点和证据相关且不超出事实', '说明证据支持观点的关系', '口头表达可听清、有连贯结构']);
  oral('chinese', 6, 'oral-alternative', '口头比较方案并回应异议', '口头比较可行方案，权衡依据并回应一个合理异议', ['counterevidence', 'oral-evidence'], [
    ['班级阅读会只有20分钟。方案一每人分享一本书，方案二分组分享后各组选一人汇报。请选方案、说明依据，并回应一个可能的问题。', '结合时间与参与机会权衡，回应组内意见可能遗漏的问题。'],
    ['就你的一项学习安排比较两个方案，选一个并回应可能的反对理由。', '说明条件、取舍与可执行调整。'],
    ['操场临时关闭。方案一取消运动，方案二在教室安排安全伸展。请比较并回应一个合理顾虑。', '比较活动机会与空间安全，回应教室拥挤等顾虑。'],
    ['针对一次小组任务分工提出两个方案，解释取舍并回应一个公平性问题。', '有明确分工条件、依据与调整建议。']],
  ['比较条件、依据与选择对应', '回应一个真实相关的异议或限制', '口头结构清楚、关键表达可听清']);

  const english: Array<[number, string, string, string[], Array<[string, string]>]> = [
    [1, 'oral-greeting', '口头问候与介绍', ['greeting'], [
      ['早上见到同学，请用英语打招呼并说一个名字，可以使用虚构名字。', 'Good morning! My name is Lin.'], ['用英语向一个新朋友问好并介绍名字，可以虚构。', 'Hello! My name is He.'],
      ['你叫Lin，第一次见到同学。请用英语问好并介绍自己。', 'Hello! I am Lin.'], ['用英语向来访的小朋友问好，并说出你的名字，可以虚构。', 'Hello! I am An.']]],
    [2, 'oral-object', '口头描述物品', ['this', 'color', 'placeword', 'oral-greeting'], [
      ['用两句英语说：这是一支红色铅笔，它在桌上。', 'This is a red pencil. It is on the desk.'], ['选一个身边的物品，用英语说名称和颜色或位置。', 'This is a blue book. It is in my bag.'],
      ['用英语介绍：一个蓝色书包在椅子上。至少说两句。', 'This is a blue bag. It is on the chair.'], ['用英语介绍你想带给朋友看的一件物品，说明一个特征。', 'This is my ball. It is yellow.']]],
    [3, 'oral-routine', '口头说日常活动', ['third-s', 'when', 'oral-object'], [
      ['用英语说：你每天七点起床，八点上学。', 'I get up at seven. I go to school at eight.'], ['用英语说两项你平时做的活动，并说明时间。', 'I read in the evening. I play after school.'],
      ['用英语介绍：Lin每天放学后画画，晚饭后读书。', 'Lin draws after school. Lin reads after dinner.'], ['用英语向朋友介绍你周末通常做的两件事。', 'I play football. I read books at home.']]],
    [4, 'oral-now', '口头区分当前动作与习惯', ['present-continuous', 'simple-vs-continuous', 'oral-routine'], [
      ['用英语说：Lin现在正在读书；Lin每天晚上读书。', 'Lin is reading now. Lin reads every evening.'], ['用英语说一件现在正在发生的事，再说一个平时的习惯。', 'My friend is drawing now. I draw on Sundays.'],
      ['用英语说：他们现在踢足球；他们每周六踢足球。', 'They are playing football now. They play football on Saturdays.'], ['用英语介绍你想象中的当前课堂，再补充一个日常习惯。', 'We are writing now. We read every morning.']]],
    [5, 'oral-past', '口头讲述过去经历', ['past-regular', 'past-irregular', 'oral-now'], [
      ['用英语按顺序说：昨天你去了公园，玩了游戏，然后回家。', 'Yesterday I went to the park. I played a game. Then I went home.'], ['用英语讲一件过去发生的事，至少说两个先后动作。', 'I visited my friend. Then we played a game.'],
      ['用英语说：上周六Lin到图书馆借书，回家后读了书。', 'Last Saturday Lin went to the library. Lin borrowed a book and read it at home.'], ['用英语讲一个周末经历，说出时间和两项活动。', 'Last Sunday I walked in the park. Then I visited my aunt.']]],
    [6, 'oral-plan', '口头说明计划与备选安排', ['future-going', 'conditional', 'why-how', 'oral-past'], [
      ['用英语说明：你周六打算去公园，因为想运动；如果下雨就去室内游泳。', 'I am going to the park on Saturday because I want to exercise. If it rains, I will swim indoors.'], ['用英语介绍一项计划、一个理由和条件变化后的安排。', 'I am going to read at the library because it is quiet. If it is closed, I will read at home.'],
      ['用英语说明：Lin计划骑车，因为路不远；如果下雨就坐公交。', 'Lin is going to ride a bike because it is near. If it rains, Lin will take a bus.'], ['用英语为朋友介绍周末活动计划，解释理由并提出一个备选方案。', '说明可理解的计划、理由和条件变化后的调整。']]],
  ];
  for (const [grade, code, name, pre, tasks] of english) oral('english', grade, code, name,
    `以口头方式完成“${name}”任务，分别观察意义、语言组织和可理解性，不以书面题得分推定口语能力`, pre, tasks,
    ['完成交际任务，关键信息符合条件；允许合理的其他表达', '语言形式和句间组织足以表达所需关系', '关键内容可听懂；不要求某种口音，不自动评定音素准确率']);
}

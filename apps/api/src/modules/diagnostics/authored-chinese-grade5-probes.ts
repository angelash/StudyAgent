import type { MeasurementDimension, QuestionBlock } from '@study-agent/contracts';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'family' | 'dimension'>;
const names = ['小禾', '小林', '小雨', '小文', '小宁', '小安', '小川', '小贝', '小晴', '小乐', '小星', '小满'];
const rotate = <T,>(values: readonly T[], n: number) => [...values.slice(n % values.length), ...values.slice(0, n % values.length)];
const table = (headers: string[], rows: string[][]): QuestionBlock => ({ id: 'record', type: 'table', headers, rows });
const choice = (stem: string, answer: string, options: readonly string[], analysis: string, blocks?: QuestionBlock[]): Task => ({ stem, answer,
  options: rotate([...new Set([answer, ...options])], stem.length), mode: 'single_choice', analysis, ...(blocks ? { blocks } : {}) });
const blanks = (stem: string, values: Array<[string, string, string]>, analysis: string, blocks?: QuestionBlock[]): Task => ({ stem,
  answer: values.map(([key, , value]) => ({ key, value })), mode: 'multi_blank', responseShape: { entries: values.map(([key, label]) => ({ key, label })) }, analysis,
  ...(blocks ? { blocks } : {}) });
const writtenRubric = [{ criterion: '合并材料中的必要条件并保留来源或适用范围', weight: 0.4 }, { criterion: '建议/判断有明确证据联系', weight: 0.3 },
  { criterion: '语言完整清楚，不添加材料外事实', weight: 0.3 }];
const written = (stem: string, answer: string, blocks?: QuestionBlock[]): Task => ({ stem, answer, mode: 'short_answer', rubric: writtenRubric,
  analysis: `参考表达：${answer}。量规核对条件合并、证据联系和边界；合理措辞可接受。`, ...(blocks ? { blocks } : {}) });
const oralRubric = [{ criterion: '提出明确判断或选择，并引用相关材料细节', weight: 0.4 }, { criterion: '说明证据与判断的联系和适用边界', weight: 0.3 },
  { criterion: '关键内容可听清；允许自然停顿、自我修正且不因口音差异扣分', weight: 0.3 }];
const audio = (stem: string, answer: string, analysis: string, blocks?: QuestionBlock[]): Task => ({ stem: `${stem} 请录音回答，可先试听，最长3分钟。`, answer,
  mode: 'audio_record', responseShape: { mediaPolicy: 'student-media-v1' }, rubric: oralRubric, analysis, ...(blocks ? { blocks } : {}) });

const ids = { locate: 'foundation:chinese:g5-locate', cause: 'foundation:chinese:g5-cause', motivation: 'core:chinese:motivation',
  environment: 'core:chinese:environment', combine: 'core:chinese:information-combine', source: 'core:chinese:source-reliability',
  claim: 'core:chinese:claim-support', outline: 'core:chinese:outline', ambiguity: 'core:chinese:ambiguity', quote: 'core:chinese:quoted-source',
  condition: 'core:chinese:logical-condition', summary: 'core:chinese:compare-summary', oral: 'core:chinese:oral-evidence' } as const;

const locationEvents = [
  ['会议记录', '门厅签到', '东楼三层', '领取材料'], ['公告页', '大厅集合', '西楼报告厅', '参加讲座'], ['活动表', '经过操场', '阅览室', '查找旧报'],
  ['日程卡', '校门停留', '实验室', '观察标本'], ['值班表', '先到走廊', '图书角', '整理图书'], ['通知截图', '食堂旁等待', '音乐室', '练习合唱'],
  ['路线图', '登上北楼', '南楼展厅', '观看模型'], ['会议手册', '前台问询', '二层会议室', '提交方案'], ['家庭计划', '路过公园', '图书馆', '参加阅读会'],
  ['班级日志', '先看公告栏', '美术室', '领取画纸'], ['场馆导览', '穿过庭院', '温室', '记录温度'], ['比赛流程', '在检录处排队', '一号场地', '参加决赛'],
] as const;
const causalCases = [
  ['连续降雨', '排水口堵塞', '操场积水'], ['材料受潮', '字迹模糊', '重新誊写'], ['座位不足', '增加椅子', '调整空间'], ['资料冲突', '追查出处', '修正引文'],
  ['光线不足', '打开台灯', '继续记录'], ['设备故障', '暂停实验', '补做对照组'], ['噪声过大', '转移场地', '讨论恢复'], ['人数增加', '分组活动', '每人获得操作'],
  ['标签磨损', '重新标写', '库存清楚'], ['水管漏水', '关闭阀门', '减少浪费'], ['样品不足', '缩减测试', '保存证据'], ['版本过期', '下载新表', '数据一致'],
] as const;
const motivations = [
  ['为了便于同伴查找', '给工具分类贴签'], ['担心观众看不清', '放大展板文字'], ['希望减少重复劳动', '制作统一模板'], ['为了保留核对依据', '保存原始截图'],
  ['担心新同学迷路', '绘制路线图'], ['为了比较两种方法', '同时记录耗时'], ['希望读者理解步骤', '补充示意图'], ['为了减少纸张浪费', '改用双面打印'],
  ['担心材料受潮', '增加防潮袋'], ['为了让参与者都有机会', '轮流安排发言'], ['为了核对引用', '查回原始文章'], ['希望问题可被复核', '记录每次修改'],
] as const;
const environmentCases = [
  ['浓雾遮住路标', '队伍放慢并核对方向'], ['室内光线不足', '打开台灯继续阅读'], ['地面湿滑', '放置提示牌并清理水迹'], ['操场风很大', '移动展板到背风处'],
  ['天气炎热', '把活动改到清晨'], ['雨后山路松软', '改变观察路线'], ['窗外噪声很大', '关闭窗户继续讨论'], ['强光照在屏幕上', '调整座位减少反光'],
  ['河面起雾', '延迟开船以看清航标'], ['桥梁检修', '公交改走北路'], ['教室里很安静', '大家更能专注阅读'], ['阳光照进温室', '植物生长条件改善'],
] as const;
const combines = [
  ['地点：图书馆', '时间：周五', '周五去图书馆'], ['允许对象：三年级', '需带材料：借书卡', '三年级学生带借书卡'], ['区域：室内', '结束时间：16点前', '16点前室内活动'],
  ['人数不超过20', '需有老师陪同', '不超过20人且有老师陪同'], ['版本：最新', '内容：有盖章', '选用最新盖章版本'], ['预算：50元内', '交付：周五前', '50元内周五前交付'],
  ['上午开放', '只接受预约', '上午且提前预约'], ['作品在B展区', '要求两页以上', 'B展区两页以上作品'], ['材料耐水', '颜色为蓝色', '耐水蓝色材料'], ['对象为低年级', '分组最多六人', '低年级六人以内小组'],
  ['活动在二层', '入口为东门', '从东门进入二层'], ['证据需原始链接', '日期在10月后', '10月后原始链接'],
] as const;

export function buildChineseGrade5ProbeFamilies(): AuthoredProbeFamily[] {
  const families: AuthoredProbeFamily[] = [];
  const add = (atomId: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string, distinction: string,
    seconds: number, make: (n: number) => Task) => families.push({ atomId, family, dimension, behavior, structure, distinction,
    exercises: Array.from({ length: 12 }, (_, n) => { const base = make(n); return { ...base,
      stem: `${names[n]}的五年级${['材料辨析', '记录核对', '迁移任务', '讨论记录'][n % 4]}：${base.stem}`,
      family, dimension, identityVersion: 2, expectedSeconds: seconds }; }) });

  add(ids.locate, 'locate-structure-0', 'understanding', '从背景经历中分离目标动作地点', '多条件短材料 → 指定动作地点', '必须先确定问题所问动作，背景停留地不能替代。', 55, n => {
    const [source, background, place, action] = locationEvents[n]; return choice(`${source}写${names[n]}${background}，随后在${place}${action}。${action}发生在哪里？`, place,
      [background, '材料没有地点', '校园入口'], `${action}与${place}直接对应；${background}只是前置经历。`);
  });
  add(ids.locate, 'locate-structure-1', 'procedure', '合并来源、时间和地点字段', '两段活动记录 → 分别填写地点', '不同来源的时间地点必须配对保留。', 90, n => {
    const [source1, , place1, action1] = locationEvents[n], [source2, , place2, action2] = locationEvents[(n + 4) % 12];
    return blanks('从两份记录分别填写活动地点。', [['first', `“${action1}”地点`, place1], ['second', `“${action2}”地点`, place2]],
      `${action1}在${place1}，${action2}在${place2}；两份来源不能混用。`, [table(['来源', '动作', '已知条件'], [[source1, action1, '材料完整'], [source2, action2, '时间另列']])]);
  });
  add(ids.locate, 'locate-updated', 'transfer', '按最新通知更新地点并保留其他条件', '原地点与更新记录 → 当前地点', '最新地点替代旧地点，但时间和携带要求仍须核对。', 90, n => {
    const [, , old] = locationEvents[n], latest = ['西楼二层', '北门会议室', '图书馆研讨间'][n % 3];
    return choice(`原通知地点为${old}，最新更新只改地点为${latest}，时间与材料要求不变。现在应去哪里？`, latest, [old, '两处都去', '取消活动'],
      `只更新地点字段，因此当前地点是${latest}；不能保留旧地点或丢失其他条件。`, [table(['字段', '当前值'], [['地点', latest], ['时间/材料', '沿用原通知']])]);
  });
  add(ids.locate, 'locate-multi-source', 'transfer', '按地点筛选两来源全部活动', '两个来源的四条活动记录 → 指定地点项目', '需要全表检查并保留来源内动作关系。', 105, n => {
    const target = ['图书馆', '活动室'][n % 2], rows = [0, 1, 2, 3].map(i => [['公告', '日程'][i % 2], i % 2 ? target : ['操场', '教室'][i % 2], `${['查资料', '制作', '排练', '整理'][i]}${n}`]);
    return { stem: `选择所有地点为${target}的活动。`, mode: 'multiple_choice', options: rows.map(row => row[2]), answer: rows.filter(row => row[1] === target).map(row => row[2]),
      blocks: [table(['来源', '地点', '活动'], rows)], analysis: `只保留地点列为${target}的两项；来源不同不改变地点匹配。` };
  });

  add(ids.cause, 'cause-syntax-0', 'understanding', '在连续事件中定位指定结果原因', '起因、行动、结果三元组 → 直接原因', '不能把后续行动重新当作起因。', 55, n => {
    const [cause, action, result] = causalCases[n]; return choice(`因为${cause}，记录者先${action}，后来${result}。${result}的直接变化来自哪项？`, cause,
      [action, result, '没有原因'], `${cause}是触发链的起点；${action}是应对，${result}是最终变化。`);
  });
  add(ids.cause, 'cause-syntax-1', 'procedure', '从三组事件表恢复原因、行动、结果', '三套完整因果记录 → 三类字段', '需要保持每条链自己的顺序。', 95, n => {
    const selected = [0, 4, 8].map(i => causalCases[(n + i) % 12]); return blanks('按下表完整材料填写每条链的原因、行动和结果。',
      selected.flatMap(([cause, action, result], i) => [[`c${i}`, `链${i + 1}原因`, cause], [`a${i}`, `链${i + 1}行动`, action], [`r${i}`, `链${i + 1}结果`, result]]),
      selected.map(([cause, action, result], i) => `第${i + 1}链：${cause}→${action}→${result}`).join('；') + '。',
      [table(['记录', '完整事件'], selected.map(([cause, action, result], i) => [String(i + 1), `${cause}；${action}；${result}`]))]);
  });
  add(ids.cause, 'cause-result-reverse', 'transfer', '由最终结果反查干预行动', '完整因果链 → 指定结果的直接干预', '从结果倒查时不能跳过已验证行动。', 95, n => {
    const [cause, action, result] = causalCases[(n + 3) % 12]; return choice(`材料记录“${cause}后采取${action}，随后${result}”。题目问使${result}发生的直接干预。`, action,
      [cause, result, '材料没有行动'], `直接行动是${action}；${cause}先构成问题条件，不能替代干预。`);
  });
  add(ids.cause, 'cause-confounded', 'transfer', '识别同时出现但无因果证据的活动', '事件表加入无关同期事件 → 选择有证据的因果链', '同时发生不等于因果，题面必须明确连接。', 110, n => {
    const [cause, action, result] = causalCases[n]; return choice(`同一天还发生了“更换窗帘”，但材料只明确说“${cause}后${action}，所以${result}”。哪项有因果证据？`, `${cause}→${action}→${result}`,
      ['更换窗帘导致全部变化', '同一天发生就等于因果', result], `材料只把${cause}、${action}、${result}连成链；窗帘变化是同期无关事件。`, [table(['事件', '材料关系'], [['窗帘', '未说明关联'], ['目标链', `${cause}→${action}→${result}`]])]);
  });

  add(ids.motivation, 'action-purpose', 'understanding', '识别材料明确说明的行动目的', '目的句+行动 → 直接目的', '不能从有帮助的结果反推唯一隐藏动机。', 55, n => {
    const [purpose, action] = motivations[n]; return choice(`${names[n]}${purpose}，于是${action}。贴出的材料明确目的是什么？`, purpose,
      ['为了获得表扬', action, '材料没有行动'], `“${purpose}”直接说明目的；${action}是实现目的的行动。`);
  });
  add(ids.motivation, 'explicit-purpose', 'procedure', '依据三则行动记录恢复目的', '行动与条件表 → 填写每项明确目的', '需要把目的与对应行动成对保留。', 95, n => {
    const selected = [0, 4, 8].map(i => motivations[(n + i) % 12]); return blanks('按表中行动和上下文填写明确目的。', selected.map(([purpose], i) => [`p${i}`, `行动${i + 1}目的`, purpose]),
      selected.map(([purpose, action]) => `${action}是为了${purpose}`).join('；') + '。', [table(['记录', '行动'], selected.map(([, action], i) => [String(i + 1), action]))]);
  });
  add(ids.motivation, 'motivation-evidence-boundary', 'transfer', '区分明确动机与仅能观察的行为', '行为结果与候选解释 → 有证据的有限动机', '结果不证明隐藏动机，只能提出可能解释。', 95, n => {
    const [purpose, action] = motivations[(n + 3) % 12]; return choice(`材料只明确记录“为了${purpose}，记录者${action}”。哪种解释没有超出材料？`, `这次行动的目的可能是${purpose}`,
      ['这证明他永远无私', '这一定为了获奖', '这次行动没有任何依据'], `材料直接给出${purpose}，可支持本次目的；不能推广成长久性格或另一个奖励动机。`);
  });
  add(ids.motivation, 'motivation-update', 'transfer', '依据后来更新修正目的推断', '原目的与新条件 → 当前目的', '后来明确目的覆盖先前猜测，但必须说明变化时点。', 105, n => {
    const old = ['为了方便自己', '为了获得奖励'][n % 2], current = motivations[(n + 2) % 12][0]; return choice(`起初有人猜目的是“${old}”，后来材料明确改为“${current}”。描述当前可确认目的是什么？`, `后来明确为${current}`,
      [`一直是${old}`, '两个目的都已被证明', '材料没有目的'], `只在后来出现明确依据，当前应当记录为${current}；原先内容只是未经证实的猜测。`);
  });

  add(ids.environment, 'environment-obstacle', 'understanding', '解释环境条件对行动的影响', '环境与后文动作 → 具体障碍或条件', '环境作用必须连接后文，不能套用固定情绪。', 55, n => {
    const [environment, response] = environmentCases[n]; return choice(`材料：“${environment}，因此大家${response}。”环境在这里主要起什么作用？`, `造成“${response}”所需的具体条件`,
      ['证明人物性格不好', '与后文没有联系', '只提供装饰'], `环境与后文行动直接相连：${environment}解释了为什么${response}。`);
  });
  add(ids.environment, 'environment-cause', 'procedure', '恢复环境条件和对应行动', '三则环境/行动记录 → 两字段', '需要逐条连接环境与行动。', 95, n => {
    const selected = [0, 4, 8].map(i => environmentCases[(n + i) % 12]); return blanks('为每则材料填写环境条件和随之发生的行动。', selected.flatMap(([environment, response], i) => [[`e${i}`, `环境${i + 1}`, environment], [`r${i}`, `行动${i + 1}`, response]]),
      selected.map(([environment, response], i) => `第${i + 1}则：${environment}→${response}`).join('；') + '。', [table(['记录', '材料'], selected.map(([environment, response], i) => [String(i + 1), `${environment}；${response}`]))]);
  });
  add(ids.environment, 'environment-context', 'transfer', '区分相同环境在不同上下文的作用', '同一环境两个上下文 → 当前作用', '阳光、雨等不固定等于某种心情或作用。', 95, n => {
    const [environment] = environmentCases[n]; return choice(`同一环境“${environment}”可用于两种材料。当前材料明确写出它带来“${environmentCases[n][1]}”，所以作用是什么？`, `造成后续“${environmentCases[n][1]}”的条件`,
      ['必定渲染悲伤', '人物的固定性格', '证明故事结局'], `作用由当前后文决定，本材料把它与“${environmentCases[n][1]}”相连，不能套固定情感标签。`);
  });
  add(ids.environment, 'environment-removal', 'transfer', '删除环境句后判断线索缺失', '环境、行动、结果 → 删除环境造成的解释缺口', '环境是否重要取决于后文是否依赖它。', 105, n => {
    const [environment, response] = environmentCases[(n + 3) % 12]; return choice(`原文：“${environment}，所以${response}。”若删去环境句，读者最难知道什么？`, `为什么会出现“${response}”`,
      ['人物的名字', '句子数量', '环境永远决定情绪'], `后文行动“${response}”需要环境条件解释，删除后原因线索缺失；这与固定情绪解释无关。`);
  });

  add(ids.combine, 'two-constraints', 'understanding', '求两条必要条件的交集', '条件A与条件B → 同时满足', '单条满足不足以完成任务。', 55, n => {
    const [first, second, combined] = combines[n]; return choice(`任务要求同时满足“${first}”和“${second}”。哪项完整满足？`, combined,
      [first, second, '只需满足任意一项'], `完成任务要求交集：既满足${first}，又满足${second}。`);
  });
  add(ids.combine, 'time-rule-combination', 'procedure', '填写两来源共同约束', '两行来源条件 → 合并结论', '时间和对象限制均须保留。', 95, n => {
    const [first, second, combined] = combines[(n + 2) % 12]; return blanks('合并两行条件，只填写共同要求。', [['first', '条件一', first], ['second', '条件二', second], ['combined', '同时满足', combined]],
      `必须同时保留${first}与${second}，得到${combined}。`, [table(['来源', '条件'], [['来源A', first], ['来源B', second]])]);
  });
  add(ids.combine, 'cross-source-condition', 'transfer', '合并不同来源的互补信息', '来源A对象+来源B限制 → 可用候选', '只引用单一来源会漏条件。', 105, n => {
    const selected = [0, 3].map(i => combines[(n + i) % 12]); return choice(`来源A写“${selected[0][0]}”，来源B写“${selected[1][1]}”。应选择哪项？`, `${selected[0][0]}且${selected[1][1]}`,
      [selected[0][0], selected[1][1], '任选其中一条'], `跨来源需合并为交集：${selected[0][0]}且${selected[1][1]}。`, [table(['来源', '原文条件'], [['A', selected[0][0]], ['B', selected[1][1]]])]);
  });
  add(ids.combine, 'task-preparation', 'transfer', '按最新条件更新准备清单', '原清单与更新条件 → 当前完整准备', '更新只改变对应字段，其他条件仍保留。', 110, n => {
    const [first, second, combined] = combines[n], updated = `${combined}（时间改到下周）`; return choice(`原要求为“${first}”和“${second}”，随后只把时间更新为下周。当前完整准备是什么？`, updated,
      [combined, first, '只准备下周，不再核对其他条件'], `时间变化需更新，但仍须满足${first}和${second}；完整结论包含${updated}。`, [table(['字段', '当前'], [['内容条件', `${first}；${second}`], ['时间', '下周']])]);
  });

  const sources = [
    ['图书馆开放时间', '2026-10-20 官方公告', '2026-10-18'], ['比赛时间', '学校本周通知', '2026-10-19'], ['活动报名', '主办方原始报名页', '2026-10-20'],
    ['作者原话', '已发表原文第3段', '2026-09-30'], ['统计数据', '原始调查表及说明', '2026-10-01'], ['公交改线', '交通部门当天公告', '2026-10-20'],
    ['借阅规则', '图书馆最新规则页', '2026-10-15'], ['作品目录', '馆藏系统原始记录', '2026-10-20'], ['日程更新', '活动组委会邮件', '2026-10-20'],
    ['地址变更', '场馆官网最新公告', '2026-10-19'], ['价格', '主办方官方页面', '2026-10-20'], ['人物职务', '机构官方人员页', '2026-10-18'],
] as const;
  add(ids.source, 'current-official-source', 'understanding', '优先选择相关且可核查的最新来源', '问题、官方来源和旧游记 → 当前有效资料', '来源相关、更新和原始出处都需要核对。', 55, n => {
    const [topic, , date] = sources[n]; return choice(`要确认${topic}，应优先核对哪项？`, `${date}的${sources[n][1]}`, ['三年前的个人游记', '匿名转述', '只凭标题猜测'],
      `${sources[n][1]}与${topic}直接相关，日期为${date}，可回到原始页面核查。`);
  });
  add(ids.source, 'data-verification', 'procedure', '为三条资料填写来源与日期', '三则材料来源卡 → 来源、日期字段', '资料必须可追溯具体发布者与时间。', 95, n => {
    const selected = [0, 4, 8].map(i => sources[(n + i) % 12]); return blanks('为每条资料填写可追溯来源和发布日期。', selected.flatMap(([topic, source, date], i) => [[`s${i}`, `主题${i + 1}`, topic], [`o${i}`, `来源${i + 1}`, source], [`d${i}`, `日期${i + 1}`, date]]),
      selected.map(([topic, source, date], i) => `第${i + 1}条：${topic}，来源${source}，日期${date}`).join('；') + '。', [table(['记录', '资料卡'], selected.map(([topic], i) => [String(i + 1), topic]))]);
  });
  add(ids.source, 'quotation-verification', 'transfer', '核对引文原出处和上下文', '网络转引与原始文章 → 可核查原文', '转发次数不等于原文正确。', 100, n => {
    const [topic, source, date] = sources[(n + 2) % 12]; return choice(`一条网络帖子称“${source}说全部规则都改了”，但没有链接。要核查${topic}，最可靠做法是什么？`, `查${date}的${source}原文及上下文`,
      ['转发次数多就采信', '只看帖子标题', '找另一条匿名转述'], `必须回到${source}原文与日期，核对是否真的涉及${topic}、是否被断章取义。`);
  });
  add(ids.source, 'source-conflict', 'transfer', '在冲突资料中确定当前有效版本', '旧页与最新官方更新 → 当前版本', '资料冲突时应追查原始版本而非数量。', 105, n => {
    const [topic, source, date] = sources[n]; return choice(`关于${topic}，旧网页为2024版，${date}的${source}明确写着“替代旧版”。应采用哪项？`, `${date}的${source}`,
      ['2024旧网页', '传播更多的截图', '两份内容直接相加'], `来源明确声明替代旧版，当前有效资料是${date}的${source}；不能把冲突值相加。`);
  });

  const claims = [
    ['工具按类别存放便于查找', '分类前后平均寻找时间由6分钟降到2分钟'], ['减少纸张更节约资源', '双面打印使本项目纸张用量减少三成'], ['试读有助发现说明问题', '三位读者试读后指出两处步骤遗漏'],
    ['保留原始资料有助核查', '按截图日期成功查回原文并纠正误引'], ['分组练习能增加操作机会', '同一时段操作人数由8人增至20人'], ['提前检查设备减少中断', '预检后演示中断次数由3次降为0'],
    ['清晰标识能缩短定位时间', '标签统一后平均找到工具的时间减半'], ['复测可发现记忆变化', '隔三天复测时两个先前正确步骤出现遗漏'], ['同维度比较更公平', '比较时间都用同一路线与天气条件'],
    ['记录修改可支持复核', '每次变更均有时间、原因与前后版本'], ['分组合作能覆盖不同任务', '四人分别完成检索、记录、核对和汇报'], ['公开数据需交代范围', '说明只覆盖一个班级且为期一周'],
] as const;
  add(ids.claim, 'claim-resource', 'understanding', '匹配观点与直接相关证据', '观点与证据 → 相关关系', '同主题但无关细节不能支持主张。', 55, n => {
    const [claim, evidence] = claims[n]; return choice(`观点“${claim}”，哪项证据最直接？`, evidence, ['参与者衣服颜色', '活动地点在二楼', '有人说活动很好'],
      `${evidence}直接比较或支持“${claim}”，其他信息与主张没有证据联系。`);
  });
  add(ids.claim, 'claim-method', 'procedure', '恢复三条观点的支持理由', '观点/证据表 → 逐项填写证据', '每条证据必须对应自己的观点。', 95, n => {
    const selected = [0, 4, 8].map(i => claims[(n + i) % 12]); return blanks('为每个观点填写表中最直接证据。', selected.map(([, evidence], i) => [`e${i}`, `观点${i + 1}证据`, evidence]),
      selected.map(([claim, evidence], i) => `${claim}可引用${evidence}`).join('；') + '。', [table(['记录', '观点'], selected.map(([claim], i) => [String(i + 1), claim]))]);
  });
  add(ids.claim, 'evidence-relevance', 'transfer', '识别反例与替代解释对观点的限制', '主张、证据与反例 → 限定后的支持', '证据可支持一部分，但不能排除所有替代解释。', 100, n => {
    const [claim, evidence] = claims[(n + 3) % 12]; return choice(`材料“${evidence}”能怎样支持“${claim}”？`, '支持这一条件下的效果，但仍需核对其他变量',
      ['证明所有时间地点都成立', '完全不能提供任何支持', '说明人物永远正确'], `${evidence}与${claim}相关，但样本、时间和条件仍限制推广范围；不能把一次比较变成普遍定律。`);
  });
  add(ids.claim, 'claim-source-scope', 'transfer', '核对支持证据的样本和时间范围', '两条材料分别有范围 → 选择可合并主张', '超出样本或日期的推广不成立。', 110, n => {
    const [claim] = claims[n]; return choice(`材料只支持“${claim}”，但样本仅为一个班、时间为一周。哪项结论没有超出范围？`, `这一个班在这一周内观察到“${claim}”的效果`,
      [`所有学校都永久验证了“${claim}”`, `无关地区也必然相同`, '材料不能支持任何观察'], `主张必须继承材料的样本与时间边界，只能描述一个班、一周内的观察。`, [table(['条件', '范围'], [['样本', '一个班'], ['时间', '一周']])]);
  });

  const outlines = [
    ['发现模型不稳', '检查支架', '加固后演示成功', '衣服颜色'], ['发现工具散乱', '按用途分类', '贴签后快速找到', '桌面纹理'], ['发现书页破损', '核对破损位置', '修补后继续借阅', '窗外天气'],
    ['发现场地积水', '清理并设提示', '活动安全恢复', '椅子颜色'], ['发现资料冲突', '查原始出处', '修正引用并留档', '文件夹品牌'], ['发现读者误解步骤', '请三人试读', '补图后减少提问', '眼镜款式'],
    ['发现座位不足', '重新排布', '每个人有座位', '墙面装饰'], ['发现活动噪声大', '转移场地', '讨论顺利进行', '主持人衣服'], ['发现植物缺水', '调整浇水', '叶片恢复', '花盆品牌'],
    ['发现视频字幕错位', '逐句核对', '重新发布准确版本', '鼠标颜色'], ['发现问卷选项重叠', '拆分选项并试填', '获得独立回答', '页面图标'], ['发现库存标签过期', '按最新记录重贴', '扫码结果一致', '货架高度'],
] as const;
  add(ids.outline, 'plot-outline', 'understanding', '保留推动问题解决的主要事件', '问题解决材料与无关细节 → 主链纲', '外貌和装饰是否重要取决于叙述目标。', 55, n => {
    const [start, action, result] = outlines[n]; return choice(`材料写“${start}—${action}—${result}”，另记衣服颜色。用于问题解决提纲，应保留什么？`, `${start}—${action}—${result}`,
      ['只保留衣服颜色', '只保留人物名字', '保留每个无关细节并按字数排序'], `这三个环节形成问题解决主线；衣服颜色不影响这条链。`);
  });
  add(ids.outline, 'process-outline', 'procedure', '恢复过程提纲三个阶段', '过程记录 → 起点、行动、结果', '需要按事件因果顺序而非文本外观。', 95, n => {
    const [start, action, result] = outlines[(n + 3) % 12]; return blanks('填写过程提纲的三个关键环节。', [['start', '问题起点', start], ['action', '处理行动', action], ['result', '结果', result]],
      `主线为${start}→${action}→${result}，能解释事情如何发展。`);
  });
  add(ids.outline, 'key-detail-selection', 'transfer', '按不同写作目的重选关键细节', '同一材料两个目的 → 当前提纲重点', '主要细节由任务决定，不固定按句长。', 100, n => {
    const [start, action, result, detail] = outlines[n]; return choice(`同一材料的写作目的改为“说明人物如何解决问题”。哪个细节链最关键？`, `${start}→${action}→${result}`,
      [`只写${detail}`, '按衣服颜色分组', '只列所有人名'], `当前目的是解释问题解决，因此保留问题、行动和结果；${detail}不是这条主链的必要证据。`);
  });
  add(ids.outline, 'outline-repair', 'transfer', '修复丢失问题或结果的提纲', '残缺提纲与完整材料 → 补全关键环节', '提纲不能只有行动却无法说明起点与结果。', 110, n => {
    const [start, action, result] = outlines[n]; return choice(`一份提纲只写“${action}”，漏掉问题和结果。哪项完整修复？`, `${start}→${action}→${result}`,
      [`重复${action}`, `只写${outlines[n][3]}`, '把行动放到最后'], `完整过程应保留问题“${start}”、行动“${action}”和结果“${result}”。`);
  });

  const ambiguities = [
    ['小林对小禾说获奖了', '小林对小禾说：“你获奖了。”', '小林获奖'], ['妈妈告诉姐姐她很忙', '妈妈对姐姐说：“我很忙。”', '姐姐很忙'],
    ['我看见拿着望远镜的同学', '我透过望远镜看见同学。', '同学拿望远镜'], ['老师让小雨和小文带自己的书', '老师让小雨带她自己的书。', '小文带书'],
    ['小安把试卷交给老师时他正在笑', '小安把试卷交给老师时，小安正在笑。', '老师在笑'], ['两个人走过桥后他说累了', '两个人走过桥后，小文说：“我累了。”', '小禾说累了'],
    ['小晴请小乐读她写的报告', '小晴请小乐读小晴写的报告。', '小乐写报告'], ['小明告诉父亲他会去', '小明告诉父亲：“我会去。”', '父亲去'],
    ['只有一把椅子坏了它需要修', '椅子上的横杆坏了，需要修。', '修抽屉'], ['旧书放在桌上请把它拿走', '旧书放在桌上，请把旧书拿走。', '拿走桌子'],
    ['小川看见小贝拿着球追他', '小川看见小贝拿着球，小贝追小川。', '球追小川'], ['组员向组长报告她已经完成', '组员向组长报告：“组长已经完成。”', '组员完成'],
] as const;
  add(ids.ambiguity, 'pronoun-ambiguity', 'understanding', '识别材料中代词指向不明', '人物/动作/代词 → 哪种解释最清楚', '材料不足时不能擅自确定指代。', 55, n => {
    const [ambiguous, clear, alternative] = ambiguities[n]; return choice(`原句“${ambiguous}”存在指代或修饰范围歧义。哪种改写明确排除了“${alternative}”？`, clear,
      ['保留原句不解释', '再增加一个同性别代词', '删除所有人物'], `${clear}明确写出了候选对象，排除${alternative}；原句无法仅凭词序唯一判断。`);
  });
  add(ids.ambiguity, 'modifier-ambiguity', 'procedure', '分别填写明确对象和原歧义解释', '歧义句和明确改写 → 两字段', '需要写出原可误读的对象。', 95, n => {
    const [ambiguous, clear, alternative] = ambiguities[(n + 3) % 12]; return blanks('原句有两种解释，改写后只保留一种。填写被排除对象与明确改写。', [['excluded', '被排除解释', alternative], ['clear', '明确改写', clear]],
      `原句可被理解为${alternative}；改写${clear}明确排除了它。`, [table(['字段', '内容'], [['原句', ambiguous], ['目标', '消除歧义']])]);
  });
  add(ids.ambiguity, 'explicit-instrument', 'transfer', '明确动作工具由谁使用', '施事、工具和对象混合 → 改写后的关系', '需要显式写出使用者，而非依赖“用/拿”词序。', 100, n => {
    const [ambiguous, clear] = ambiguities[(n + 4) % 12]; return choice(`要把“${ambiguous}”写成执行者、工具、对象都明确的句子，哪项符合？`, clear,
      [ambiguous, '删去执行者和工具', '只保留一个名词'], `${clear}明确哪些人物做了什么、使用了什么工具，消除原句多种角色分配。`);
  });
  add(ids.ambiguity, 'ambiguous-boundary', 'transfer', '依据不足时保留未定并请求补充', '两个候选与代词 → 应保留的合理结论', '不能为追求唯一答案硬选。', 105, n => {
    const [ambiguous] = ambiguities[n]; return choice(`材料只有“${ambiguous}”，且有两个同性别候选。当前最合理处理是什么？`, '保留两种可能，补充姓名或上下文后再判断',
      ['按最近姓名机械确定', '认为句子没有人物', '任意选择并称已验证'], `${ambiguous}不能唯一确定指代；应保留未定并通过姓名、上下文或追问验证。`);
  });

  const quotes = [
    ['小禾', '“我会在周五提交。”', '小禾说，他会在周五提交。'], ['老师', '“请先核对题号。”', '老师提醒大家先核对题号。'], ['作者', '“样本只来自一个班级。”', '作者说明研究样本只来自一个班级。'],
    ['场馆公告', '“周一闭馆维护。”', '场馆公告称周一闭馆维护。'], ['主持人', '“活动推迟十分钟。”', '主持人宣布活动推迟十分钟。'], ['调查说明', '“数据截至十月一日。”', '调查说明指出数据截至十月一日。'],
    ['小组长', '“每组需要两份记录。”', '小组长要求每组准备两份记录。'], ['医生', '“休息时需要补水。”', '医生建议休息时补水。'], ['受访者', '“我以前住在河边。”', '受访者说他以前住在河边。'],
    ['说明书', '“每次使用不超过二十分钟。”', '说明书要求每次使用不超过二十分钟。'], ['报道', '“目前只确认了初步结果。”', '报道指出目前只确认初步结果。'], ['研究者', '“这仍需进一步验证。”', '研究者强调该发现仍需验证。'],
] as const;
  add(ids.quote, 'direct-quotation', 'understanding', '区分原话直引与意思转述', '原话与两种表述 → 直接引用边界', '直接引用需标出原话，转述不能混入伪引用。', 55, n => {
    const [speaker, original] = quotes[n]; return choice(`原文记录${speaker}说${original}。哪项保留直接引用？`, `${speaker}说：${original}`, [`${speaker}曾经说过一句相似的话`, `${original}由所有人共同说出`, '没有引号的感受'],
      `${speaker}说：${original}使用引号保留原话；其他选项改变了说话者或引用形式。`);
  });
  add(ids.quote, 'indirect-report', 'procedure', '分别填写说话者与原话/转述', '直接与间接引语 → 说话者及内容字段', '视角变化不能改变原话主体。', 95, n => {
    const [speaker, original, paraphrase] = quotes[(n + 2) % 12]; return blanks('填写原话说话者和保留原意的转述。', [['speaker', '原话说话者', speaker], ['report', '转述', paraphrase]],
      `原话由${speaker}说出，转述需保留${original}的意思而不伪造逐字原话。`, [table(['字段', '原文'], [['说话者', speaker], ['原话', original]])]);
  });
  add(ids.quote, 'quotation-context', 'transfer', '核对引文是否保留原限定', '原话与新引文 → 判断是否断章取义', '省略“样本、时间、仍需验证”等限制会改变结论。', 100, n => {
    const [speaker, original] = quotes[(n + 4) % 12]; return choice(`引用者只写“${speaker}确认结论已经普遍成立”，而原话是${original}。正确核查结论是什么？`, '新引文改变或删除了原话限制，不能算忠实引用',
      ['引号越多越可信', '说话者姓名一致就忠实', '只需看转发数量'], `必须比较原话与转引内容；这里说话者虽一致，但结论被过度推广，已删除原有范围/验证条件。`);
  });
  add(ids.quote, 'source-attribution', 'transfer', '为多次引用补充来源版本', '引文、发布者和日期表 → 当前可追溯版本', '出处需包含身份和版本/时间，不能只写“网上说”。', 105, n => {
    const [speaker, original] = quotes[n]; const date = `2026-10-${String(10 + n).padStart(2, '0')}`; return choice(`要引用${speaker}的原话${original}，哪项出处最便于核查？`, `${speaker}，${date}，原始记录`,
      ['网上有人说', '一张无名截图', '只写“某篇文章”'], `忠实引用需追溯到${speaker}、原话和${date}的原始记录，不能只保留二手截图。`);
  });

  const conditions = [
    ['只有完成预约，才能进入展厅', '完成预约为进入的必要条件'], ['只要提交完整材料，就能参加评审', '完整材料是参加评审的充分条件'], ['只有带借书卡，才能借出图书', '借书卡为借书的必要条件'],
    ['只要温度达到条件，装置就会启动', '温度达到为启动的充分条件'], ['只有年满十二岁，才能参加该组', '年龄为必要限制'], ['只要总分达到线，即可进入面试', '总分为进入面试的充分条件'],
    ['只有老师签字，报名才有效', '签字为有效的必要条件'], ['只要按时到站，就能赶上第一班车', '按时到站为赶车的充分条件'], ['只有数据完整，分析才可复核', '完整数据为可复核的必要条件'],
    ['只要完成两轮测试，就记录最终结果', '两轮完成作为记录充分条件'], ['只有取得授权，才能查看原图', '授权为查看原图必要条件'], ['只要选择室内路线，就不受降雨影响', '室内路线为避免降雨影响的充分条件'],
] as const;
  add(ids.condition, 'necessary-condition', 'understanding', '区分必要条件的方向', '只有……才…… → 缺少条件不能怎样', '不能把必要条件倒置成结果发生就证明条件。', 55, n => {
    const [sentence, relation] = conditions[n]; return choice(`“${sentence}”说明什么？`, relation, ['结果出现就必然满足条件', '条件和结果毫无关系', '任意条件都能替代'], relation);
  });
  add(ids.condition, 'sufficient-condition', 'procedure', '按规则填写条件与结果', '条件规则 → 两字段', '充分不等于必要，字段需按原文。', 95, n => {
    const [sentence] = conditions[(n + 3) % 12]; return blanks(`根据规则“${sentence}”填写条件与相应结果。`, [['rule', '规则', sentence], ['direction', '条件方向', sentence.includes('只有') ? '必要' : '充分']],
      `${sentence}明确连接条件与结果，应保留“${sentence.includes('只有') ? '只有' : '只要'}”表达方向。`);
  });
  add(ids.condition, 'condition-truth', 'transfer', '按明确规则核对是否满足', '条件已满足或未满足 → 能否进入结果', '结果规则来自材料，不由常识补造。', 100, n => {
    const [sentence] = conditions[n], necessary = sentence.includes('只有'); return choice(`规则：“${sentence}”。若结果已经出现，哪种结论最稳妥？`, necessary ? '条件应已满足，但仍需核对其他规定' : '当前规则允许结果，但仍需核对其他限制',
      ['条件与结果无关', '结果证明所有其他条件都满足', '可以忽略规则文字'], `规则只说明一个${necessary ? '必要' : '充分'}条件，不能据此声称所有限制均已满足。`);
  });
  add(ids.condition, 'condition-reverse', 'transfer', '识别条件和结果的错误倒置', '原规则与反向说法 → 选择被改变的逻辑', '“只有A才B”通常不能推出“只有B才A”。', 105, n => {
    const [sentence] = conditions[n], wrong = sentence.includes('只有') ? sentence.replace(/^只有(.+)，才(.+)$/, '只有$2，才$1') : '只要出现结果，就一定满足原所需条件';
    return choice(`原规则“${sentence}”与说法“${wrong}”相比，后者的问题是什么？`, '把条件与结果的关系倒置或扩大', ['增加了一个同义句', '保留了原范围', '只是换了标点'], `原规则的条件方向固定；${wrong}改变或倒置了条件与结果，不能由原句推出。`);
  });

  const summaries = [
    [['材料A：活动需在周五前报名', '材料B：三年级及以下可参加'], '三年级及以下学生应周五前报名，其他年级资格未说明。'],
    [['材料A：场地最多20人', '材料B：每组至少4人'], '在20人上限内可安排最多5组，其他限制未说明。'],
    [['来源A：入口上午开放', '来源B：需提前预约'], '上午可从入口进入，但须提前预约。'],
    [['材料A：预算50元', '材料B：优先耐用品'], '50元内应优先选择耐用品，价格和耐用性之外的条件待补。'],
    [['来源A：运输需两天', '来源B：周五验收'], '要周五验收最迟周三寄出，仍需确认承运安排。'],
    [['材料A：展板在B区', '材料B：作品至少两页'], 'B区只展示两页以上作品，短作品安排待定。'],
    [['来源A：旧时间九点', '来源B：最新通知改为十点'], '应按十点安排，九点已经更新。'],
    [['材料A：数据来自一个班', '材料B：观察持续一周'], '结论只适用于该班一周条件，不能推广到全体。'],
    [['材料A：设备需防水', '材料B：颜色指定蓝色'], '选择同时耐水且为蓝色的设备，其余参数未说明。'],
    [['来源A：引用原文', '来源B：说明截至10月'], '引用应带原文且标明数据截至10月，不能省略范围。'],
    [['材料A：只能室内活动', '材料B：活动不超过30分钟'], '安排30分钟以内的室内活动，其他组织条件待核。'],
    [['材料A：需两人同行', '材料B：路线限东门'], '两人从东门同行，其他人数路线限制未说明。'],
] as const;
  add(ids.summary, 'source-based-production', 'understanding', '识别完整合并两条材料的建议', '两条互补材料 → 同时满足的建议', '不能只使用一条材料或增加未说明条件。', 65, n => {
    const [materials, answer] = summaries[n]; return choice(`${materials.join('；')}。哪项建议同时保留两条件？`, answer,
      [materials[0], materials[1], '任选一条即可'], `${answer}保留两条材料的要求，并明确未说明的限制；其他选项遗漏条件。`);
  });
  add(ids.summary, 'personal-production', 'procedure', '合并两条材料并说明未说明边界', '两种来源 → 冻结量规短答', '短答人工复核，不允许补造缺失条件。', 120, n => {
    const [materials, answer] = summaries[n]; return written(`综合材料${materials[0]}和${materials[1]}，写出一条可执行建议，并说明仍有哪项未说明。`, answer,
      [table(['来源', '条件'], [['A', materials[0]], ['B', materials[1]]])]);
  });
  add(ids.summary, 'source-conflict', 'transfer', '处理时间或版本冲突后再概括', '两来源冲突 → 采用更新版本并说明', '冲突不能平均或相加，须说明证据优先级。', 115, n => {
    const [materials, answer] = summaries[(n + 6) % 12]; return written(`两条材料为“${materials[0]}”和“${materials[1]}”。若其中一条明确标明替代/更新，写一条处理冲突后的建议。`, answer,
      [table(['来源', '材料'], [['A', materials[0]], ['B', materials[1]]])]);
  });
  add(ids.summary, 'combined-limitation', 'transfer', '在合并建议中保留适用范围', '两条材料对样本/范围有约束 → 有限建议', '合并条件不能自动推广到未测人群。', 115, n => {
    const [materials, answer] = summaries[n]; return written(`合并“${materials[0]}”和“${materials[1]}”，提出下一步，同时写出至少一项尚不能确定的内容。`, answer,
      [table(['材料', '范围/条件'], [['A', materials[0]], ['B', materials[1]]])]);
  });

  add(ids.oral, 'oral-evidence-source', 'procedure', '口头用材料证据回应观点', '观点与两项事实 → 判断、证据录音', '观点必须来自材料并由细节支持。', 105, n => {
    const [claim, evidence] = claims[n]; return audio(`有人说“${claim}”，材料写“${evidence}”。请说明这个观点能否得到支持，并引用材料。`, `在本材料中“${claim}”有支持，依据是${evidence}。`,
      '量规核对判断、证据和二者联系；需保留原材料范围。');
  });
  add(ids.oral, 'oral-evidence-table', 'procedure', '口头根据证据表说明观点', '观点/证据/范围表 → 录音回应', '不能越过表中样本和时间。', 115, n => {
    const [claim, evidence] = claims[(n + 4) % 12]; return audio('根据证据表口头说明观点、支撑细节和适用范围。', `“${claim}”在表中得到${evidence}的支持，但只限表内条件。`,
      '量规区分证据与推测，并要求说明边界。', [table(['字段', '内容'], [['观点', claim], ['证据', evidence], ['范围', '仅限当前材料']])]);
  });
  add(ids.oral, 'oral-evidence-personal', 'transfer', '口头用个人可核对经历支持判断', '个人经历提纲 → 观点、具体行动录音', '允许真实自述，不能确认经历真伪。', 120, n => {
    const habit = ['分类整理', '提前检查', '保留原始记录', '按表核对'][n % 4]; return audio(`说一个你采用“${habit}”的真实经历，提出一个判断，并用具体行动支持。`, `我在一次活动中采用${habit}，依据是具体做了什么及观察到的结果。`,
      '量规只评述自述是否具体、证据是否相关；不能验证真实经历或普遍效果。');
  });
  add(ids.oral, 'oral-evidence-boundary', 'transfer', '口头区分支持和过度推广', '有限证据与强主张 → 有限支持录音', '一次证据不能证明永久或所有情境。', 120, n => {
    const [claim, evidence] = claims[(n + 8) % 12]; return audio(`材料只有“${evidence}”。请回答它能否证明“${claim}在所有情况下都成立”，并给出有边界的解释。`, `这个材料支持“${claim}”在当前条件下的效果，但不能证明所有情况。`,
      '量规要求明确当前证据、适用范围和不能推出的强结论。', [table(['有限证据', '过强主张'], [[evidence, `${claim}在所有情况下成立`]])]);
  });
  return families;
}

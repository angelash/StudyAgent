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
const argumentRubric = [{ criterion: '观点、相关证据与证据解释完整', weight: 0.4 }, { criterion: '回应一个合理替代解释或限制', weight: 0.3 },
  { criterion: '语言连贯，证据忠实且不添加无依据事实', weight: 0.3 }];
const written = (stem: string, answer: string, blocks?: QuestionBlock[]): Task => ({ stem, answer, mode: 'short_answer', rubric: argumentRubric,
  analysis: `参考表达：${answer}。量规核对观点、证据联系和替代解释；合理措辞可接受。`, ...(blocks ? { blocks } : {}) });
const oralRubric = [{ criterion: '比较两个方案的条件、依据与取舍', weight: 0.4 }, { criterion: '回应一个真实相关的异议或限制', weight: 0.3 },
  { criterion: '关键内容可听清；允许自然停顿、自我修正且不因口音差异扣分', weight: 0.3 }];
const audio = (stem: string, answer: string, analysis: string, blocks?: QuestionBlock[]): Task => ({ stem: `${stem} 请录音回答，可先试听，最长3分钟。`, answer,
  mode: 'audio_record', responseShape: { mediaPolicy: 'student-media-v1' }, rubric: oralRubric, analysis, ...(blocks ? { blocks } : {}) });

const ids = { locate: 'foundation:chinese:g6-locate', cause: 'foundation:chinese:g6-cause', viewpoint: 'core:chinese:viewpoint-compare',
  rhetorical: 'core:chinese:rhetorical-question', doubleNegative: 'core:chinese:double-negative', counterevidence: 'core:chinese:counterevidence',
  fact: 'core:chinese:explanation-vs-fact', narrative: 'core:chinese:narrative-order', perspective: 'core:chinese:perspective',
  title: 'core:chinese:title-theme', citation: 'core:chinese:evidence-citation', argument: 'core:chinese:argument-revision', oral: 'core:chinese:oral-alternative' } as const;

const locations = [
  ['公告', '从北门进校', '图书馆三层', '核对卷宗'], ['日程', '在门厅等候', '报告厅', '参加展示'], ['资料卡', '经过旧馆', '数字实验室', '测试程序'],
  ['通知', '先到前台登记', '西楼会议室', '参加讨论'], ['场馆图', '穿过下沉广场', '临时展馆', '观察模型'], ['值班表', '在走廊准备', '广播室', '播报通知'],
  ['路线说明', '先在桥边集合', '北岸观测点', '记录水位'], ['活动手册', '由东门进入', '二层档案室', '查阅原件'], ['家长通知', '在校门等待', '体育馆', '参加比赛'],
  ['实验安排', '经过准备间', '无菌室', '完成接种'], ['会议流程', '在茶歇区交流', '一号会议室', '提交方案'], ['导览记录', '从山坡上行', '温室', '测量湿度'],
] as const;
const chains = [
  ['传感器故障', '暂停采集', '补采缺失数据'], ['材料规格变化', '重新计算', '更新模型'], ['样本不足', '扩大抽样', '降低偶然影响'], ['资料版本冲突', '追查原始发布', '统一引用'],
  ['演示中断', '记录时间与错误', '修复并重演'], ['水量增加', '调整阀门', '水位恢复'], ['问题定义模糊', '访谈使用者', '明确需求'], ['噪声升高', '改变采样时段', '获得稳定读数'],
  ['路线临时关闭', '启用备选路线', '按时到达'], ['预算超限', '替换材料', '方案重新可行'], ['参与者理解不一致', '统一定义', '数据可比'], ['设备电量不足', '接入电源', '测试继续'],
] as const;
const viewpoints = [
  [['共同目标是减少排队', '方案A增加窗口', '方案B预约分流'], ['都希望减少排队', '一个靠增加容量，一个靠分散时间']],
  [['共同目标是保护旧树', '方案A原址加固', '方案B迁到邻近空地'], ['目标相同', '一个保留原址，一个改变位置']],
  [['共同目标是减少纸张', '方案A双面打印', '方案B电子发布'], ['都关注用纸量', '路径分别是打印优化与数字化']],
  [['共同目标是提高安全', '方案A限速', '方案B增加护栏'], ['都重视安全', '一个管速度，一个改设施']],
  [['共同目标是缩短找书时间', '方案A分类标签', '方案B电子检索'], ['目标相同', '分别使用物理标识与数字检索']],
  [['共同目标是降低能耗', '方案A换灯', '方案B调整开放时段'], ['都希望节能', '一个换设备，一个减少使用时长']],
  [['共同目标是提高回收率', '方案A增加分类桶', '方案B定期培训'], ['目标一致', '一个改设施，一个改行为']],
  [['共同目标是减少噪声', '方案A吸音板', '方案B调整活动区'], ['都降低噪声', '一个处理传播，一个移动声源']],
  [['共同目标是让读者看懂', '方案A补充图', '方案B重写步骤'], ['目标相同', '一个增加视觉说明，一个改文字']],
  [['共同目标是保证数据可靠', '方案A重复测量', '方案B增加独立复核'], ['都关注可靠性', '一个增加样本，一个增加审核']],
  [['共同目标是方便新同学', '方案A路线图', '方案B志愿引导'], ['目标一致', '分别提供静态说明和人员帮助']],
  [['共同目标是减少误报', '方案A调阈值', '方案B双人确认'], ['都希望减少误报', '一个改规则，一个改流程']],
] as const;
const rhetorical = [
  ['难道我们不应该珍惜时间吗', '我们应该珍惜时间'], ['谁能忽视安全的重要', '谁都不能忽视安全'], ['这样的证据难道还不足以说明问题', '这些证据足以说明问题'],
  ['难道不是每个人都需要尊重别人吗', '每个人都应尊重别人'], ['怎能只凭一张截图就下结论', '不能只凭一张截图下结论'], ['难道我们没有责任核实来源吗', '我们有责任核实来源'],
  ['谁能否认持续练习的作用', '不能否认持续练习的作用'], ['这难道不是大家共同完成的结果吗', '这是大家共同完成的结果'], ['面对错误怎能装作没看见', '面对错误不能装作没看见'],
  ['难道资料不需要交代时间范围吗', '资料需要交代时间范围'], ['谁会说一次成功就证明永远成功', '没有人会说一次成功就证明永远成功'], ['这不是值得进一步验证的问题吗', '这是值得进一步验证的问题'],
] as const;
const doubleNegatives = [
  ['没有谁不认同这项规则', '所有人都认同这项规则'], ['不能不说清数据来源', '必须说清数据来源'], ['没有一次核对可以被省略', '每次核对都不能省略'],
  ['没有人能否认证据存在冲突', '所有人都必须承认证据存在冲突'], ['并非没有改进空间', '确实有改进空间'], ['不能不保留原始记录', '必须保留原始记录'],
  ['没有一个直接条件可以忽略', '每个直接条件都必须核对'], ['这款工具并非无法使用', '这款工具可以使用'], ['没有同学不希望活动继续', '所有同学都希望活动继续'],
  ['不能不对引用范围加以说明', '必须说明引用范围'], ['谁也不能说材料没有边界', '所有人都必须承认材料有边界'], ['并不是没有备选方案', '存在备选方案'],
] as const;
const counterexamples = [
  ['所有电池都能使用十小时', '某块同型号电池只用了四小时', '一块同型号电池'], ['本校学生都喜欢阅读课', '一名本校学生明确表示不喜欢', '一名本校学生'],
  ['所有雨天路面都会结冰', '一场雨后气温较高、路面未结冰', '同条件未结冰记录'], ['每个样本都来自三年级', '有一份样本来自五年级', '五年级样本'],
  ['这项规则从设立起一直未改', '今年十月发布修订版', '修订公告'], ['所有人都在九点前到齐', '一人九点十分到达', '迟到记录'],
  ['两种方法效果完全相同', '重复测试中一组的误差明显更大', '重复测试差异'], ['文章没有引用任何原始资料', '文末列有三份原始访谈', '文末引用列表'],
  ['这个结论适用于全国', '调查只覆盖一个城市', '调查范围说明'], ['设备从未发生故障', '维护日志记录两次故障', '维护日志'],
  ['所有植物在温室中生长更快', '一株同品种植物在温室外生长更快', '同品种对照样本'], ['该活动每周都有二十人参加', '有五周只有十二人参加', '五周参与记录'],
] as const;
const observations = [
  ['地面有水迹', '水壶倒在旁边', '有人故意弄倒水壶'], ['叶片发黄', '花盆土明显干燥', '一定没有浇过水'], ['模型晃动', '一侧支架螺丝松动', '螺丝是同学故意拆下'],
  ['页面出现修改痕迹', '文末写明十月更新', '作者一定临时改变观点'], ['读数上下波动', '同组换了一台仪器读数不同', '仪器一定损坏'], ['排队时间增加', '当天开放窗口减少', '所有人都迟到了'],
  ['图表柱高变化', '横轴单位与旧图不同', '数据一定增加'], ['纸板受潮变软', '窗户整夜开着', '谁打开窗户已确定'], ['参赛者动作变慢', '当天气温明显升高', '炎热是唯一原因'],
  ['书页边角磨损', '该书借阅记录很多', '每个借阅者都损坏过书'], ['灯管闪烁', '更换镇流器后恢复', '镇流器故障得到进一步支持'], ['邮件没有回复', '系统日志显示地址无效', '收件人故意忽略邮件'],
] as const;

export function buildChineseGrade6ProbeFamilies(): AuthoredProbeFamily[] {
  const families: AuthoredProbeFamily[] = [];
  const add = (atomId: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string, distinction: string,
    seconds: number, make: (n: number) => Task) => families.push({ atomId, family, dimension, behavior, structure, distinction,
    exercises: Array.from({ length: 12 }, (_, n) => { const base = make(n); return { ...base,
      stem: `${names[n]}的六年级${['材料研读', '证据核对', '观点讨论', '迁移任务'][n % 4]}：${base.stem}`,
      family, dimension, identityVersion: 2, expectedSeconds: seconds }; }) });

  add(ids.locate, 'locate-structure-0', 'understanding', '在多段材料中定位目标动作地点', '来源、背景与目标动作 → 指定地点', '背景经过地点不是目标动作发生地。', 55, n => {
    const [source, background, place, action] = locations[n]; return choice(`${source}记录${names[n]}${background}，之后在${place}${action}。问题只问${action}地点。`, place,
      [background, '材料没有地点', '校园入口'], `${action}直接对应${place}；${background}不能替代目标动作地点。`);
  });
  add(ids.locate, 'locate-structure-1', 'procedure', '跨来源恢复时间和地点字段', '两条来源记录 → 时间地点配对', '来源、时间和动作需要保持同一记录。', 95, n => {
    const [source1, , place1, action1] = locations[n], [source2, , place2, action2] = locations[(n + 4) % 12]; return blanks('从两条来源分别填写动作地点。',
      [['first', `“${action1}”地点`, place1], ['second', `“${action2}”地点`, place2]], `${action1}在${place1}，${action2}在${place2}。`, [table(['来源', '动作'], [[source1, action1], [source2, action2]])]);
  });
  add(ids.locate, 'locate-updated', 'transfer', '按最新版本替换旧地点并保留范围', '原地点与更新日志 → 当前有效地点', '最新版本可能只改一个字段，其他条件仍有效。', 90, n => {
    const [, , old] = locations[n], latest = ['北楼资料室', '社区中心二层', '临时实验区'][n % 3]; return choice(`原记录地点为${old}，更新日志只把地点改为${latest}，其他条件不变。当前地点是什么？`, latest,
      [old, '两处都有效', '由材料数量决定'], `更新日志明确替换地点字段，其他时间/对象条件沿用；当前地点为${latest}。`);
  });
  add(ids.locate, 'locate-source-filter', 'transfer', '按来源与地点双条件筛选全部活动', '来源/地点/活动表 → 同时匹配的项目', '必须同时满足来源和地点，不可单条件筛选。', 110, n => {
    const targetSource = ['官方公告', '活动手册'][n % 2], targetPlace = ['图书馆', '报告厅'][n % 2],
      rows = [['官方公告', '报告厅', `核对${n}`], ['活动手册', '图书馆', `展示${n}`], ['官方公告', '图书馆', `记录${n}`], ['活动手册', '报告厅', `讨论${n}`]];
    return { stem: `选择同时来自“${targetSource}”且地点为“${targetPlace}”的活动。`, mode: 'multiple_choice', options: rows.map(row => row[2]),
      answer: rows.filter(row => row[0] === targetSource && row[1] === targetPlace).map(row => row[2]), blocks: [table(['来源', '地点', '活动'], rows)],
      analysis: `必须同时满足来源${targetSource}与地点${targetPlace}，只有一个单条件匹配的记录也不合格。` };
  });

  add(ids.cause, 'cause-syntax-0', 'understanding', '在复杂事件中分离直接原因与后续处理', '故障、处理、最终结果 → 直接触发条件', '后续处理不是最初原因。', 55, n => {
    const [cause, action, result] = chains[n]; return choice(`因为${cause}，记录者${action}，随后${result}。最初触发事件是什么？`, cause,
      [action, result, '没有事件'], `${cause}先触发问题，${action}是处理，${result}是处理后的状态。`);
  });
  add(ids.cause, 'cause-syntax-1', 'procedure', '恢复三组原因、处理与结果', '三组事件表 → 三类字段', '每条链内部顺序不能错，也不能把一组行动与另一组原因混用。', 95, n => {
    const selected = [0, 4, 8].map(i => chains[(n + i) % 12]); return blanks('填写每组事件的原因、处理行动与结果。', selected.flatMap(([cause, action, result], i) => [[`c${i}`, `组${i + 1}原因`, cause], [`a${i}`, `组${i + 1}行动`, action], [`r${i}`, `组${i + 1}结果`, result]]),
      selected.map(([cause, action, result], i) => `第${i + 1}组：${cause}→${action}→${result}`).join('；') + '。', [table(['记录', '材料'], selected.map(([cause, action, result], i) => [String(i + 1), `${cause}；${action}；${result}`]))]);
  });
  add(ids.cause, 'cause-result-reverse', 'transfer', '从最终结果反查直接行动', '结果与两条候选行动 → 直接干预', '不能把更早条件与直接行动混为一谈。', 95, n => {
    const [cause, action, result] = chains[(n + 3) % 12]; return choice(`完整材料“${cause}→${action}→${result}”中，${result}的直接干预是什么？`, action,
      [cause, result, '材料没有行动'], `${action}承接问题并促成${result}；${cause}是更早触发。`);
  });
  add(ids.cause, 'cause-confounding', 'transfer', '排除同时发生的无证据因素', '同期旁支事件与明确因果链 → 有证据原因', '相关性/同时性不等于因果。', 110, n => {
    const [cause, action, result] = chains[(n + 6) % 12]; return choice(`同一周还更换了桌布，但材料只写“${cause}→${action}→${result}”。哪项有直接因果证据？`, cause,
      ['更换桌布', '所有同期事件都是原因', result], `材料明确把${cause}、${action}、${result}连成链；桌布只是同期事件，未提供因果证据。`);
  });

  add(ids.viewpoint, 'shared-goal-different-method', 'understanding', '区分共同目标与方案分歧', '两方目标及不同方案 → 真正共同点/差异', '分歧在方法不等于目标相反。', 55, n => {
    const [[shared, methodA, methodB], [common, difference]] = viewpoints[n]; return choice(`A：${shared}，${methodA}。B：${methodB}。两方共同点和真正分歧分别是什么？`, `${common}；${difference}`,
      ['目标和方法完全一致', '目标相反，方法相同', '没有任何共同点'], `两方都围绕${common}，分歧在${difference}，不能把方法差异误判为目标冲突。`);
  });
  add(ids.viewpoint, 'avoid-false-conflict', 'procedure', '分别记录双方主张与方法', '两方陈述 → 目标/方法字段', '必须保留各自主张，不被强者声音替代。', 95, n => {
    const [[shared, methodA, methodB]] = viewpoints[(n + 2) % 12]; return blanks('填写两方共同目标和各自方法。', [['shared', '共同目标', shared], ['methodA', '方案A', methodA], ['methodB', '方案B', methodB]],
      `共同目标是${shared}；A采用${methodA}，B采用${methodB}。`, [table(['方面', 'A', 'B'], [['目标', shared, shared], ['方法', methodA, methodB]])]);
  });
  add(ids.viewpoint, 'common-evidence', 'transfer', '从两观点找到可共同接受的证据', '争论双方与共享记录 → 公平判断依据', '不能用只支持一方的材料掩盖共同问题。', 100, n => {
    const [[shared, methodA, methodB]] = viewpoints[n]; return choice(`A主张${methodA}，B主张${methodB}，双方共同目标是${shared}。哪类证据最能公平评估？`, '同一条件下两种方法对共同目标的实测结果',
      ['支持A的人数', '支持B的人数', '衣服颜色'], `共同目标为${shared}，因此应比较两方法在相同条件下对该目标的实际效果，而不是声量。`);
  });
  add(ids.viewpoint, 'viewpoint-limit', 'transfer', '识别两方都没说清的适用限制', '双方方案与条件缺口 → 待补限制', '共同目标不能证明方案适用于所有条件。', 105, n => {
    const [[shared, methodA, methodB]] = viewpoints[(n + 3) % 12]; return choice(`A：${methodA}；B：${methodB}；共同目标${shared}。继续决策前最需补充什么？`, '成本、时间或适用条件等可行性与限制',
      ['只统计谁说话更响', '直接认定A永远最优', '忽略共同目标'], `两种方法都需补足成本、时间、适用条件，才能判断在什么情境下有效；共同目标不排除这些限制。`);
  });

  add(ids.rhetorical, 'negative-rhetorical', 'understanding', '把否定式反问转换为陈述', '含“难道不/怎能”的反问 → 实际肯定或否定含义', '反问形式与字面疑问相反，需要根据整句还原。', 55, n => {
    const [sentence, meaning] = rhetorical[n]; return choice(`“${sentence}？”这句话实际表达什么？`, meaning, ['真的在要求回答', '没有任何判断', '句子含义无法判断'],
      `反问问句本身已有确定判断，实际意思是“${meaning}”，并非等待对方选择。`);
  });
  add(ids.rhetorical, 'universal-rhetorical', 'procedure', '为三条反问填写陈述含义', '反问句表 → 实际陈述', '需要保留全部/不能/应该等确定强度。', 95, n => {
    const selected = [0, 4, 8].map(i => rhetorical[(n + i) % 12]); return blanks('把每个反问改写为直接陈述。', selected.map(([, meaning], i) => [`m${i}`, `句${i + 1}含义`, meaning]),
      selected.map(([sentence, meaning], i) => `“${sentence}？”实际表示${meaning}`).join('；') + '。', [table(['记录', '反问句'], selected.map(([sentence], i) => [String(i + 1), sentence]))]);
  });
  add(ids.rhetorical, 'rhetorical-impossibility', 'transfer', '识别反问所强调的不可接受条件', '反问与实际主张 → 哪个做法被否定', '不能只依据问号判断观点不确定。', 95, n => {
    const [sentence, meaning] = rhetorical[(n + 3) % 12]; return choice(`“${sentence}？”主要否定或强调了什么？`, meaning, ['所有判断都未定', '句子只在询问时间', '与上下文无关'],
      `该反问有明确立场：“${meaning}”。问号不是不确定标记，而是加强判断。`);
  });
  add(ids.rhetorical, 'rhetorical-to-neutral', 'transfer', '把反问改成证据可检验的中性句', '反问与候选陈述 → 保留强度且去掉修辞', '改写不能减弱事实范围或增加新证据。', 105, n => {
    const [sentence, meaning] = rhetorical[n]; return choice(`把“${sentence}？”改成可直接核查的陈述，哪项最忠实？`, meaning,
      ['可能也许大概不知道', '所有人都不认同', '句子没有内容'], `中性陈述应保留反问原有强度与方向：“${meaning}”，不新增材料外结论。`);
  });

  add(ids.doubleNegative, 'universal-double-negative', 'understanding', '还原双重否定的肯定含义', '没有谁不/不能不 → 直接含义', '两个否定不能机械抵消成无意义。', 55, n => {
    const [sentence, meaning] = doubleNegatives[n]; return choice(`“${sentence}”表示什么？`, meaning, ['仍然否定全部', '句意无法确定', meaning + '，但任何人都可随意忽略'],
      `${sentence}含有两个否定，整体应还原为“${meaning}”。`);
  });
  add(ids.doubleNegative, 'necessity-double-negative', 'procedure', '为三条双重否定填写肯定陈述', '双重否定表 → 直接陈述', '保留“必须/全部/存在”等强度。', 95, n => {
    const selected = [0, 4, 8].map(i => doubleNegatives[(n + i) % 12]); return blanks('把双重否定改写为肯定陈述。', selected.map(([, meaning], i) => [`m${i}`, `句${i + 1}含义`, meaning]),
      selected.map(([sentence, meaning], i) => `${sentence}→${meaning}`).join('；') + '。', [table(['记录', '双重否定句'], selected.map(([sentence], i) => [String(i + 1), sentence]))]);
  });
  add(ids.doubleNegative, 'double-negative-scope', 'transfer', '核对双重否定中的范围和必要程度', '原句与强/弱改写 → 强度一致的陈述', '“全部、必须、存在”不能改写为“部分、可选、不存在”。', 100, n => {
    const [sentence, meaning] = doubleNegatives[(n + 3) % 12]; return choice(`“${sentence}”的肯定含义，哪种改写强度没有变化？`, meaning,
      ['只有部分情况如此', '可以完全不这样做', '也可能完全不存在'], `原双重否定实际表达${meaning}，改写必须保留相同的范围或必要性。`);
  });
  add(ids.doubleNegative, 'double-negative-context', 'transfer', '在语境中判断双重否定是否成立', '前后文条件与双重否定句 → 与证据一致的结论', '句法转换后仍需材料支持。', 105, n => {
    const [sentence, meaning] = doubleNegatives[n]; return choice(`材料先给出“${sentence}”，随后列出所有条件均有记录。哪项结论与两者一致？`, meaning,
      ['条件可以任意省略', '所有记录互相矛盾', '句子否定所有条件'], `“${sentence}”还原为${meaning}，与“所有条件均有记录”方向一致。`);
  });

  add(ids.counterevidence, 'universal-counterexample', 'understanding', '寻找削弱全称判断的具体反例', '全称判断与反例记录 → 反例本身', '一个真实同范围反例即可否定“所有/都/从不”。', 55, n => {
    const [claim, counter, label] = counterexamples[n]; return choice(`判断“${claim}”遇到哪项直接反例？`, counter, ['一个无关天气新闻', '支持该判断的同类样本', label],
      `${counter}与判断对象/条件相关，构成同范围内的反例；“${claim}”因此不能作为全称结论。`);
  });
  add(ids.counterevidence, 'comparison-counterexample', 'procedure', '为三条全称主张配对反例', '主张与记录表 → 逐项反例', '反例必须来自相同对象或可比条件。', 95, n => {
    const selected = [0, 4, 8].map(i => counterexamples[(n + i) % 12]); return blanks('为每条全称主张填写直接反例。', selected.map(([, counter], i) => [`e${i}`, `主张${i + 1}反例`, counter]),
      selected.map(([claim, counter], i) => `${claim}的反例是${counter}`).join('；') + '。', [table(['记录', '全称主张'], selected.map(([claim], i) => [String(i + 1), claim]))]);
  });
  add(ids.counterevidence, 'dated-counterevidence', 'transfer', '使用更新后的记录挑战旧结论', '旧全称结论与更新公告 → 当前有效反证', '新证据与旧范围是否可比要交代。', 100, n => {
    const [claim, counter] = counterexamples[(n + 3) % 12]; return choice(`旧材料得出“${claim}”，后来原始记录更新为“${counter}”。当前应当怎样处理旧结论？`, '保留旧结论范围，并用更新记录修正当前判断',
      ['删除全部历史记录', '忽略更新', '把两条互相冲突的数据相加'], `旧结论可作为历史观察，但${counter}构成当前反证；应修正判断并保留版本，不删除证据。`);
  });
  add(ids.counterevidence, 'specific-counterevidence', 'transfer', '区分同范围反例和无关反例', '主张、反例与无关事实 → 有效反证', '对象、条件或版本不同会使反例无效。', 105, n => {
    const [claim, counter] = counterexamples[n]; return choice(`主张“${claim}”，记录A为“${counter}”，记录B为“另一产品在另一年被称赞”。哪项能有效挑战主张？`, counter,
      ['另一产品被称赞', '两段都无关', '记录标题长度'], `${counter}与主张对象/条件可比，是有效反例；另一产品另一年的信息未说明与主张范围相同。`);
  });

  add(ids.fact, 'observation-explanation', 'understanding', '分离直接观察与原因解释', '观察事实与解释 → 哪项是事实', '解释可能合理，但仍需验证。', 55, n => {
    const [observation, explanation] = observations[n]; return choice(`记录写“${observation}”，并推测“${explanation}”。哪项属于直接观察？`, observation,
      [explanation, '作者一定正确', '没有任何事实'], `${observation}可直接看到/记录；${explanation}是对原因或意义的解释，需要进一步验证。`);
  });
  add(ids.fact, 'testable-explanation', 'procedure', '为观察填写事实与待验证解释', '三条观察记录 → 两字段', '解释需可验证且不冒充事实。', 95, n => {
    const selected = [0, 4, 8].map(i => observations[(n + i) % 12]); return blanks('分别填写可观察事实和需要验证的解释。', selected.flatMap(([observation, explanation], i) => [[`o${i}`, `观察${i + 1}`, observation], [`e${i}`, `解释${i + 1}`, explanation]]),
      selected.map(([observation, explanation], i) => `第${i + 1}项：事实“${observation}”，待验证“${explanation}”`).join('；') + '。', [table(['记录', '材料'], selected.map(([observation, explanation], i) => [String(i + 1), `${observation}；${explanation}`]))]);
  });
  add(ids.fact, 'explanation-test', 'transfer', '设计能区分原因假设的观察', '事实与两种竞争原因 → 最能区分的证据', '需要找到差异预测，而不是重复观察结果。', 105, n => {
    const [observation, explanation] = observations[(n + 3) % 12]; return choice(`已知事实“${observation}”，有人解释为“${explanation}”。哪种新观察最能检验该解释？`, '寻找能区分该解释与另一合理原因的对照记录',
      ['重复抄写原句', '只统计句子字数', '采访与问题无关的人'], `检验解释需寻找不同假设会给出不同预测的可观察结果，并设置可比条件。`);
  });
  add(ids.fact, 'unknown-cause', 'transfer', '在材料不足时保留原因未知', '事实与多个竞争解释 → 当前合理表述', '不能把最熟悉或最先出现的解释当结论。', 100, n => {
    const [observation, explanation] = observations[n]; return choice(`目前只观察到“${observation}”，还有至少一个替代解释。哪种表述最严谨？`, `不能仅凭“${observation}”确定“${explanation}”，仍需验证`,
      [`${explanation}已是事实`, '任何解释都不可能', '无需任何观察即可判定'], `目前只有${observation}这一事实，${explanation}仍是解释；竞争解释存在时应保持未定。`);
  });

  const narratives = [
    ['先写比赛结果，再回忆早上如何准备', '倒叙'], ['从清晨准备写到比赛结果', '顺叙'], ['开头写已经修好的模型，随后回顾零件如何损坏和修复', '倒叙'], ['按发现、调查、修复、成功的顺序写', '顺叙'],
    ['先呈现最终名单，再说明一个月训练经过', '倒叙'], ['从种子发芽写到结果记录', '顺叙'], ['先写结局的一封信，再展开此前通信', '倒叙'], ['循时间顺序记录雨天到晴天的变化', '顺叙'],
    ['开头从获奖照片切入，回溯首次排练', '倒叙'], ['按第一周到第四周记录方案迭代', '顺叙'], ['先写旧屋已拆除，再回忆勘测过程', '倒叙'], ['按早、中、晚依次叙述活动', '顺叙'],
] as const;
  add(ids.narrative, 'result-first-flashback', 'understanding', '根据结果先出现判断倒叙结构', '结果开头+回溯事件 → 叙述方式', '时间断裂由回溯标记连接。', 55, n => {
    const [description, order] = narratives[n]; return choice(`材料“${description}”采用什么叙述方式？`, order, ['只能按人物年龄', '没有时间关系', '按字数排列'], `${description}的时间位置对应${order}；判断依据是事件呈现顺序与回溯关系。`);
  });
  add(ids.narrative, 'chronological', 'procedure', '恢复开头、回溯段和当前结果', '叙述顺序表 → 三字段', '倒叙不等于所有事件都倒着读。', 95, n => {
    const [description, order] = narratives[(n + 2) % 12]; const parts = description.split('，'); return blanks('填写开头呈现内容、随后回溯内容和最终当前状态。',
      [['opening', '开头', parts[0]], ['middle', '随后', parts[1] ?? '继续说明经过'], ['current', '当前结果', order === '倒叙' ? '回到开头已呈现的结果' : parts.at(-1)!]],
      `材料采用${order}；开头“${parts[0]}”与后续回溯/推进共同形成完整时间线。`);
  });
  add(ids.narrative, 'narrative-reorder', 'transfer', '把倒叙材料恢复为时间顺序', '倒叙开头与回溯内容 → 真实事件先后', '需要区分文本顺序与事实时间顺序。', 105, n => {
    const [description] = narratives[n]; return choice(`从“${description}”恢复事实时间线，正确原则是什么？`, '先发生的事件在时间线上在前，即使它在文中后写',
      ['文本第一句永远最早发生', '按人物姓名排序', '把结果删掉'], `文本呈现顺序可能倒置；事实顺序依据内容时间标记，文中后写的准备/经过可能先发生。`);
  });
  add(ids.narrative, 'narrative-effect', 'transfer', '解释开头先写结果的结构作用', '结果开头与全文 → 结构效果', '倒叙作用由上下文决定，不固定为悬念或悲伤。', 100, n => {
    const [description] = narratives[(n + 3) % 12]; return choice(`“${description}”先呈现结果，这样的结构主要让读者怎样阅读？`, '先看到结果，再通过回溯理解形成过程',
      ['所有事件同时发生', '不需要任何时间线', '证明结果无法解释'], `开头结果提供阅读入口，回溯补足原因和过程；作用是建立结果与经过的联系。`);
  });

  const perspectives = [
    ['我走到门口，发现门锁已经换了', '第一人称', '“我”不知道换锁者的内心'], ['她打开抽屉，看见一张旧地图', '第三人称', '叙述只给动作，不能自动进入所有人内心'],
    ['我们沿着河边寻找标记', '第一人称复数', '不能直接知道未参与的家长所见'], ['他听见走廊里的脚步声，却没有回头', '第三人称', '材料没有说访客是谁'],
    ['我收到一封信，但没有拆开', '第一人称', '“我”不知道信内内容'], ['小禾把钥匙交给小安，小安什么也没说', '第三人称', '没有信息证明小安沉默原因'],
    ['我们只知道船在清晨出发', '第一人称复数', '不能补出所有乘客名单'], ['叙述者站在远处看见窗户亮起', '第三人称', '不知道屋内具体发生了什么'],
    ['我把记录封好后才离开', '第一人称', '“我”不知道之后谁打开记录'], ['她看见岸边留下两行脚印', '第三人称', '不知道脚印属于谁'],
    ['我们听见屋后有声音，但没有过去', '第一人称复数', '不能确定声音来源'], ['叙述者只描述桌上的茶杯，没有进入房间', '第三人称观察视角', '不知道谁喝过茶或何时放置'],
] as const;
  add(ids.perspective, 'first-person-identify', 'understanding', '识别人称和已知信息范围', '叙述句、人称和可知边界 → 视角判断', '叙述者知道的不等于全部人物知道。', 55, n => {
    const [description, person, boundary] = perspectives[n]; return choice(`材料“${description}”反映什么叙述视角？`, person, ['全知视角可读所有内心', '没有叙述者', boundary],
      `句中使用的人称对应${person}；${boundary}体现了视角限制。`);
  });
  add(ids.perspective, 'third-person-identify', 'procedure', '填写人称、可知事实与未知信息', '叙述段 → 三字段', '有限观察视角不等于全知，必须分别保留可确认事实和未知信息。', 95, n => {
    const [description, person, boundary] = perspectives[(n + 2) % 12]; return blanks('填写叙述视角、可直接确认的事实和不能确定的信息。', [['person', '视角', person], ['known', '可确认事实', description], ['unknown', '不能确定', boundary]],
      `${description}采用${person}；可见事实不等于能确定${boundary}。`);
  });
  add(ids.perspective, 'perspective-boundary', 'transfer', '判断叙述者是否可能知道某信息', '第一/第三人称与候选信息 → 可合理知道吗', '若没有观察/被告知线索，不得补造。', 100, n => {
    const [description, person, boundary] = perspectives[(n + 3) % 12]; return choice(`材料为“${description}”。叙述目前能直接确认“${boundary}”吗？`, '不能，材料没有提供该信息',
      ['能，因为叙述者全知', `能，因为${person}一定知道`, '能，忽略视角即可'], `当前材料只到“${description}”可见信息，没有提供${boundary}；不能借视角名称补造。`);
  });
  add(ids.perspective, 'perspective-shift', 'transfer', '发现叙述视角变化后更新信息限制', '原视角与新视角 → 当前可知道的信息', '视角切换若明确发生，可扩大/改变信息范围。', 105, n => {
    const [description, person, boundary] = perspectives[n]; return choice(`材料接续写“小禾后来告诉叙述者当时的原因”。此时关于“${boundary}”，视角发生什么变化？`, '叙述者从被告知获得新信息，但仍需区分转述与亲自观察',
      ['叙述者一直全知', '原视角限制仍然绝对', '转述自动成为事实'], `${description}原有信息限制为${boundary}；后来“被告知”可增加转述信息，但不能直接升级为亲自验证的事实。`);
  });

  const titles = [
    ['修好漏水水管后恢复供水', '修好水管，恢复供水', '一次难忘的旅行', '安全最重要'], ['比较两种方案的成本与耗时', '两种方案的成本与耗时比较', '春天来了', '所有人都应该环保'],
    ['记录一周内花苗高度的变化', '一周花苗高度记录', '勇敢的小花苗', '所有植物都会快速生长'], ['说明分类标签如何方便工具查找', '分类标签如何帮助查找工具', '一个普通星期三', '工具永远不用维修'],
    ['由一次实验说明控制变量的重要性', '从实验看控制变量的重要性', '我的实验本', '科学实验从不失败'], ['复述活动从发现问题到完成修复的过程', '一次从发现问题到修复的经过', '最好的班级', '所有问题都能一次解决'],
    ['比较两位同学对阅读会的不同建议', '两位同学对阅读会的建议比较', '读书多么快乐', '所有阅读会都很成功'], ['列出公交改线后三条可选路线', '公交改线后的三条路线', '城市变化真大', '所有人都会喜欢新路线'],
    ['说明展板从初稿到定稿的修改过程', '展板从初稿到定稿的修改过程', '展板颜色很好看', '这次活动完美无缺'], ['介绍图书馆开放时间与预约方式', '图书馆开放时间与预约说明', '我最喜欢的图书馆', '所有人都会来图书馆'],
    ['记录雨后观察到的三个变化', '雨后观察记录', '雨总是悲伤的', '雨改变所有事物'], ['比较两种环保材料在测试中的表现', '两种环保材料的测试比较', '未来的希望', '新材料一定取代旧材料'],
] as const;
  add(ids.title, 'event-title', 'understanding', '用主要事件和结果形成具体标题', '具体材料 → 覆盖核心事件的标题', '标题应匹配内容，不能过度抽象或添加评价。', 55, n => {
    const [content, appropriate, tooAbstract, overgeneralized] = titles[n]; return choice(`材料内容为“${content}”，哪个标题最具体且覆盖核心内容？`, appropriate, [tooAbstract, overgeneralized, '没有内容'],
      `${appropriate}直接概括材料主要对象和事件；另外的标题过宽或添加未证明评价。`);
  });
  add(ids.title, 'expository-title', 'procedure', '为三个材料填写具体标题', '材料摘要表 → 具体标题', '标题保留说明对象及核心关系。', 95, n => {
    const selected = [0, 4, 8].map(i => titles[(n + i) % 12]); return blanks('为每则材料填写一个具体标题。', selected.map(([, title], i) => [`t${i}`, `第${i + 1}标题`, title]),
      selected.map(([content, title], i) => `第${i + 1}则围绕${content}，可标题为“${title}”`).join('；') + '。', [table(['记录', '内容'], selected.map(([content], i) => [String(i + 1), content]))]);
  });
  add(ids.title, 'theme-with-boundary', 'transfer', '在标题中保留材料范围与结论边界', '材料样本范围与事件 → 不夸大的标题', '标题不能把局部观察变成全称结论。', 100, n => {
    const [content, appropriate, , overgeneralized] = titles[n]; return choice(`材料是“${content}”，且仅记录当前一次/一组情况。哪项标题没有过度推广？`, appropriate,
      [overgeneralized, '所有情况都已证明', '材料没有任何内容'], `${appropriate}保留材料具体对象与事件，没有把一次观察扩大成${overgeneralized}。`);
  });
  add(ids.title, 'overgeneralized-title', 'transfer', '识别标题超出材料范围', '材料及四个标题 → 找出最不忠实标题', '评价词和“所有/永远”不能自动由一次材料支持。', 105, n => {
    const [content, , , overgeneralized] = titles[n]; return choice(`材料为“${content}”。标题“${overgeneralized}”的问题是什么？`, '标题添加或扩大了材料未证明的范围与评价',
      ['标题比正文短', '出现名词', '没有使用引号'], `标题需覆盖材料事实；“${overgeneralized}”超出材料对象、范围或评价证据。`);
  });

  const citations = [
    ['调查只覆盖一个班、一周', '一个班一周内的结果', '所有学校长期如此'], ['样本中女生占三成', '样本内女生三成', '全国女生都占三成'], ['数据截至十月一日', '十月一日前的数据', '全年数据'],
    ['文章称可能相关', '相关仍需验证', '已经证明因果'], ['比较只测跑步路线', '跑步路线的用时差异', '所有运动都相同'], ['访谈来自五人', '五位受访者的观点', '所有家长都同意'],
    ['误差范围正负两度', '估计存在两度误差', '温度绝对不变'], ['案例来自城市A', '城市A案例的表现', '全国案例相同'], ['实验在常温下进行', '常温条件下的结果', '任何温度都成立'],
    ['原文说部分材料耐水', '部分材料耐水', '全部材料耐水'], ['问卷参与者自愿报名', '自愿参与者的回答', '全体学生平均意见'], ['模型预测到周三', '周三前预测', '整月预测均已验证'],
] as const;
  add(ids.citation, 'sample-scope', 'understanding', '引用时保留样本范围', '样本说明与材料结论 → 限定概括', '引用不能超过样本对象。', 55, n => {
    const [scope, supported] = citations[n]; return choice(`材料明确“${scope}”。哪项概括没有超出样本？`, supported, ['结论适用于所有对象', '所有时间和地区都相同', '证据范围无关紧要'],
      `只能概括“${supported}”；原范围“${scope}”必须随引用保留。`);
  });
  add(ids.citation, 'time-scope', 'procedure', '填写证据范围、支持结论与不可推出项', '三条证据范围表 → 三字段', '时间/样本/条件限制必须一起保留。', 100, n => {
    const selected = [0, 3, 6].map(i => citations[(n + i) % 12]); return blanks('为每组证据填写原始范围、可支持结论和不能推出项。',
      selected.flatMap(([scope, supported, unsupported], i) => [[`s${i}`, `范围${i + 1}`, scope], [`y${i}`, `可支持${i + 1}`, supported], [`n${i}`, `不可推出${i + 1}`, unsupported]]),
      selected.map(([scope, supported, unsupported], i) => `第${i + 1}组：${scope}，支持${supported}，不能推出${unsupported}`).join('；') + '。', [table(['记录', '范围'], selected.map(([scope], i) => [String(i + 1), scope]))]);
  });
  add(ids.citation, 'qualification-preservation', 'transfer', '保留可能、部分和误差限定', '原证据与去限定转述 → 最忠实引用', '省略“可能/部分/误差/截至”会改变结论。', 100, n => {
    const [scope, supported] = citations[(n + 3) % 12]; return choice(`原证据写“${scope}”，可支持的严谨概括是“${supported}”。哪种引用最忠实？`, `据该证据，${supported}`,
      ['证据已经证明所有情况', '删除时间与范围后仍等价', '把可能改写成确定'], `忠实引用必须保留${scope}中的样本、时间、相关程度或误差限制，只能概括为“${supported}”。`);
  });
  add(ids.citation, 'context-preservation', 'transfer', '核对转引是否改变上下文', '原证据、原文结论与转引 → 是否断章取义', '必须比对对象、范围和条件，而不只看关键词。', 105, n => {
    const [scope, supported, unsupported] = citations[n]; return choice(`原文条件“${scope}”，原结论“${supported}”。转引写成“${unsupported}”。这项转引是否忠实？`, '不忠实：它删除了原范围或把相关/部分扩大为确定/全部',
      ['忠实：关键词相同即可', '忠实：标题相似即可', '忠实：转发次数多即可'], `比较对象、范围、时间和结论强度可见，转引${unsupported}超出了原证据“${supported}”。`);
  });

  const argumentsData = [
    ['应增加图书馆晚间开放时段', '晚间借阅需求调查显示排队增加', '工作人员和成本可能限制'], ['应把分类标签改成大字号', '试读中三名同学能更快找到工具', '样本只有三人'],
    ['活动应安排两个备用方案', '一次场馆关闭导致活动临时中断', '备用方案也有组织成本'], ['实验记录应保留原始数据', '按原表成功查回并纠正漏记', '原始数据需隐私保护'],
    ['阅读会应设置小组讨论', '小组试点的参与发言人数增加', '安静读者可能更少发言'], ['项目应提前检查设备', '预检发现两处连接问题', '预检不能排除所有故障'],
    ['通知应同时写日期和适用对象', '旧通知因对象模糊产生误解', '过度细化可能增加阅读量'], ['工具应按使用频率摆放', '高频工具放在入口后取用时间缩短', '低频工具仍需可找到'],
    ['比较方案时应固定测试条件', '同路线同天气比较结果更可解释', '现实环境可能同时变化'], ['引用应按原文范围表述', '删除“部分”后造成误读', '原文本身也可能有误'],
    ['材料应保留修改原因', '复核时依靠原因与版本恢复判断', '记录会增加操作时间'], ['校园活动应设无障碍路线', '试走发现主入口台阶难以通过', '路线改造成本需要评估'],
] as const;
  add(ids.argument, 'source-based-production', 'understanding', '识别观点、证据与替代解释', '主张、证据、限制三栏 → 完整论证', '回应替代解释不等于否定证据。', 60, n => {
    const [claim, evidence, alternative] = argumentsData[n]; return choice(`观点“${claim}”，证据“${evidence}”，可能限制“${alternative}”。哪项回应同时保留三部分？`, `证据支持${claim}，但仍需考虑${alternative}`,
      [evidence, claim, '忽略限制即可证明永远正确'], `完整论证应说明${evidence}如何支持${claim}，并回应${alternative}这一替代解释或限制。`);
  });
  add(ids.argument, 'personal-production', 'procedure', '写观点、证据与替代解释', '完整材料 → 冻结量规短答', '短答人工复核，允许合理措辞。', 125, n => {
    const [claim, evidence, alternative] = argumentsData[n]; return written(`依据观点“${claim}”、证据“${evidence}”和限制“${alternative}”，写一段有观点、证据和回应的说明。`, `我支持“${claim}”，因为${evidence}；不过还要考虑${alternative}，因此结论应限于当前证据能够支持的范围。`,
      [table(['字段', '材料'], [['观点', claim], ['证据', evidence], ['替代解释/限制', alternative]])]);
  });
  add(ids.argument, 'counterargument-response', 'transfer', '回应直接反对理由而非回避', '观点被提出合理异议 → 补证据和调整结论', '论证要点名回应异议内容。', 120, n => {
    const [claim, evidence, alternative] = argumentsData[(n + 3) % 12]; return written(`有人支持“${claim}”，证据是“${evidence}”；另一方提出“${alternative}”。请回应这一理由，并给出不夸大的结论。`, `“${evidence}”支持${claim}，但${alternative}确实限制结论；应补充相关证据并限定方案，而非忽略反对理由。`);
  });
  add(ids.argument, 'revision-with-limit', 'transfer', '修复过度推广的论证版本', '过度主张与有限证据 → 限定后论证', '修正结论而不是掩盖证据。', 125, n => {
    const [claim, evidence, alternative] = argumentsData[n]; return written(`一份论证写“${evidence}，所以${claim}永远适用于所有情况”。请把它改成证据能够支持的限定论证，并保留对“${alternative}”的回应。`, `现有证据“${evidence}”支持在本次条件下考虑“${claim}”，但不能推广到所有情况；还需处理${alternative}。`,
      [table(['问题', '内容'], [['原证据', evidence], ['过度推广', '永远适用于所有情况'], ['限制', alternative]])]);
  });

  add(ids.oral, 'oral-alternative-source', 'procedure', '口头比较材料中的两个方案', '方案、条件、异议 → 选择与回应录音', '至少说明两个方案取舍和一个异议。', 110, n => {
    const [claim, evidence, alternative] = argumentsData[n]; return audio(`方案A：${claim}，依据${evidence}。方案B：暂不改变，先补足${alternative}相关信息。请比较并选择，同时回应一个异议。`, `可优先尝试方案A，但需先核实${alternative}；若限制无法解决，则选择方案B延迟实施。`,
      '量规要求比较条件、依据、取舍和异议，不承认单凭观点作出普遍结论。', [table(['方案', '依据/风险'], [['A', `${claim}；${evidence}`], ['B', `先处理${alternative}`]])]);
  });
  add(ids.oral, 'oral-alternative-table', 'procedure', '根据方案表口头权衡并回应异议', '成本/收益/风险表 → 方案选择录音', '必须使用表中条件而非常识补造。', 120, n => {
    const [claim, evidence, alternative] = argumentsData[(n + 3) % 12]; return audio('根据表中成本、收益和风险，口头比较两个方案，说明选择并回应一个异议。', `方案A在${evidence}方面有明确收益，但存在${alternative}；方案B更保守，却可能延误${claim}。应依据可接受风险选择。`,
      '量规核对方案条件、证据和取舍以及异议回应。', [table(['方案', '收益', '风险/成本'], [['A', evidence, alternative], ['B', '先收集更多证据', '延缓实施']])]);
  });
  add(ids.oral, 'oral-alternative-personal', 'transfer', '口头比较个人任务的两个可行方案', '个人任务条件 → 方案/取舍/备选录音', '允许真实自述，不能确认经历真伪。', 125, n => {
    const topic = ['安排小组分工', '选择阅读计划', '准备活动材料', '设计复习顺序'][n % 4]; return audio(`说明你在“${topic}”中比较过的两个方案，讲清条件、取舍、选择和一个备选安排。`, `围绕${topic}分别说明两个方案的条件和风险，选择依据必须来自实际条件。`,
      '量规只评述自述是否比较完整、有依据并回应限制；不能验证经历真伪或普遍效果。');
  });
  add(ids.oral, 'oral-alternative-counterclaim', 'transfer', '回应与选择相冲突的合理异议', '方案选择与反方理由 → 调整或守住理由录音', '需要明确何时改变选择。', 125, n => {
    const [claim, evidence, alternative] = argumentsData[(n + 6) % 12]; return audio(`你倾向“${claim}”，证据是“${evidence}”。有人指出“${alternative}”。请说明你仍选择、调整或放弃的条件，并回应异议。`, `选择取决于${alternative}能否被验证和控制；若风险不可接受，应调整方案，不能忽略${evidence}以外的条件。`,
      '量规要求证据、异议和决策条件清楚相连，允许合理调整结论。', [table(['支持理由', '异议'], [[evidence, alternative]])]);
  });
  return families;
}

import { createHash } from 'node:crypto';
import type { ClassroomCourse, ClassroomDiagram, ClassroomLesson, ClassroomStep, StudioCourse, StudioLesson } from '@study-agent/contracts';
import { conceptNotes } from './classroom-board-notes';
import { UNIT_CHECK_VERSION, unitChecks } from './classroom-unit-checks';
import { CLASSROOM_PRACTICE_VERSION, practiceVariations } from './classroom-practice-content';
import { freezeMultipleChoice, microChoices, unitChoice } from './classroom-choice-content';
import { supplementChemistryLesson } from './chemistry-tutorial';

// Independently authored teaching material. Topic structure follows the observed syllabus;
// no third-party narration, artwork, personal history or generated session code is embedded.
type Topic = [title: string, concept: string, example: string, misconception: string, inference: string];
type LectureSeed = [title: string, topics: Topic[]];
const seeds: Array<{ title: string; objective: string; project: string; lectures: LectureSeed[] }> = [
  { title: '社会学视角', objective: '把个人经验放回社会背景，比较理论解释并设计可检验的研究。', project: '选择一个社区现象，写出研究问题、调查对象、方法与保护参与者的办法。', lectures: [
    ['社会学思考', [
      ['社会学想象力', '米尔斯把个人的生活历程与时代、制度联系起来。分析时同时追问个人处境和处境形成的社会条件。', '同一地区多家工厂关闭，许多有经验的工人同时失业。个人技能可能相关，但岗位整体消失需要结构层面的解释。', '许多人失业，必定是每个人都不够努力。', '要比较产业变化、岗位数量与个人条件，不能只作性格归因。'],
      ['结构与能动性', '结构是持续的规则、资源和关系；能动性是人在这些条件中作出选择并改变处境的能力。两者相互作用。', '通勤者能选择交通方式，但线路、票价和无障碍设施会改变可选范围。改善交通也来自人的集体行动。', '承认社会结构的影响，就等于否认个人能做任何事。', '研究选择空间如何受条件影响，同时寻找能够改变条件的行动。'],
      ['社会事实', '涂尔干关注外在于个人、并具有约束力的行为与思维方式。判断约束要寻找可观察的规则和偏离后果。', '学校规定上课时间。即使某个学生不认可，迟到仍可能引来记名或他人的评价。', '只要许多人有相同的心情，它就一定是社会事实。', '要检查共同规则是否外在存在，以及违反规则会遇到什么约束。'],
      ['社会学与日常生活', '把熟悉的习惯暂时当作需要解释的现象：谁这样做，在何时何地做，规则怎样形成，谁受益或受限。', '排队看似自然，但不同场景用取号、预约或先到先得组织顺序。比较规则才能解释秩序。', '日常小事没有研究价值，因为它们只是个人喜好。', '可以比较情境、参与者和规则，寻找日常行为背后的社会模式。'],
    ]],
    ['理论传统', [
      ['功能主义', '功能主义考察制度之间如何配合，以及它们对社会维持产生的后果；同时区分公开目的、未预期后果和失调。', '学校传授知识是公开目的，同伴网络是可能的附带后果。考试过度挤压休息则可能产生失调。', '一种制度存在很久，就说明它对每个人都有好处。', '需要分别检验功能、失调，以及不同群体实际承担的结果。'],
      ['冲突论', '冲突视角关注资源分配、权力和利益差异，追问制度如何维持或改变群体之间的不平等。', '同一项加班政策可能提高企业产出，却让照护责任较重的人付出更多时间成本。', '社会冲突只来自个别人脾气不好。', '应比较资源、决策权和成本分配，再分析行动者的处境。'],
      ['符号互动论', '符号互动论研究人如何在具体交往中解释符号、协商意义，并据此行动。意义不是脱离情境固定不变的。', '同一个点赞在朋友聊天中可能表示赞同，在工作群中也可能只表示已读。', '一个手势在所有群体中都具有完全相同的含义。', '需要结合参与者、互动过程和共同约定理解这个符号。'],
      ['当代社会学理论', '女性主义、交叉性等视角检查经典理论忽略的经验。交叉性关注多种制度关系相互交织，而不是简单叠加身份。', '研究求职障碍时，性别、阶级、残障和制度安排可能以不同方式共同塑造机会。', '只要知道一个人的单一身份，就能完整预测其处境。', '要研究多种制度关系在具体情境中如何共同作用。'],
    ]],
    ['研究方法', [
      ['问卷调查与抽样', '总体是希望了解的人群，样本是实际研究的人。抽样方式、非回应和题目设计都会影响结论能推广到哪里。', '在健身房发问卷估计全市运动习惯，会漏掉不去健身房的人；扩大这类样本仍不能自动消除偏差。', '样本越大，任何抽样偏差都会自动消失。', '先检查覆盖范围与选择机制，再讨论样本规模和估计误差。'],
      ['实验与实地研究', '实验通过操纵变量、比较条件来检查因果机制；实地研究强调自然情境。两者在控制程度与情境真实性上有不同取舍。', '随机分配提醒短信能帮助比较出勤变化，但实验环境和真实学校仍可能存在差异。', '实验中观察到的结果在所有真实环境都必定相同。', '需要检查随机分配、干预执行和结果在其他场景中的适用范围。'],
      ['民族志与访谈', '民族志以持续观察理解群体实践，深度访谈重视参与者的解释。研究者需要记录位置、关系与可能影响。', '观察社区议事会并访谈不同参与者，可以解释沉默的原因，但不能把少数受访者比例直接当成全市比例。', '访谈到几个典型故事，就能精确估计全社会的发生率。', '用细致情境理解机制，同时说明样本和研究者位置的限制。'],
      ['测量、因果关系与伦理', '把抽象概念转成指标叫操作化。相关不等于因果，还需检查时间顺序、替代解释与测量效度，并保护参与者。', '冰淇淋销量和溺水事件同升，炎热天气可能同时影响两者。不能据此认定吃冰淇淋导致溺水。', '两项指标同时上升，就证明前者造成后者。', '提出共同原因，检查时间顺序，并用合适设计排除替代解释。'],
    ]],
  ] },
  { title: '文化与自我', objective: '解释文化如何传递，身份如何在互动、组织和网络中形成。', project: '记录社区中一项规范、一次身份协商和一种关系资源，区分观察与自己的推断。', lectures: [
    ['文化', [
      ['规范与价值观', '价值观表达值得追求的理想，规范规定特定情境下如何行动。正式和非正式制裁帮助维持规范。', '尊重他人是价值，图书馆保持安静是规范，提醒或处罚则是制裁。', '价值、规则与处罚是同一个概念，没有必要区分。', '分别指出理想、具体行为要求与偏离后的后果。'],
      ['符号与语言', '符号依赖共享解释，语言既传递经验，也让某些区别更容易被注意。语言影响思考不等于完全决定思考。', '一种职业拥有丰富的专业词汇，成员更容易讨论细小差异；新成员也能通过学习理解这些差异。', '没有一个现成词汇，人就绝不可能理解相关经验。', '比较语言提供的分类工具及实际使用，避免把影响说成绝对决定。'],
      ['亚文化与反文化', '亚文化具有相对独特的实践与意义；反文化还对主流价值或规范提出持续挑战。区别需要具体证据。', '爱好者使用特殊术语不必然反对主流制度；明确拒绝主流消费价值的群体可能具有反文化特征。', '只要穿着与多数人不同，就一定是反文化。', '要检查差异是否包含对主流价值与规则的系统性挑战。'],
      ['文化资本与变迁', '文化资本是可能在制度中获得承认的知识、表达和资格。技术与规范变化不同步会出现文化滞后。', '课堂更熟悉某种表达方式的学生可能更容易得到认可，这不等于其天生能力更强。', '学校认可的表达差异只能用天生智力解释。', '应比较家庭经验、制度标准和获得相关文化资源的机会。'],
    ]],
    ['社会化', [
      ['社会化主体', '家庭、学校、同伴与媒体传递规则、技能和自我期待。不同主体的信息可能冲突，个人也会解释和选择。', '家庭鼓励稳妥选择，同伴鼓励冒险尝试；学生需要在多种期待之间协商。', '社会化只有家庭一个来源，并在入学前全部完成。', '比较多个主体和它们的冲突，观察个人如何回应。'],
      ['生命历程中的社会化', '社会化贯穿生命历程。预期社会化为未来角色作准备，再社会化则涉及已有习惯和身份的重组。', '新员工学习团队规则，退休者重新安排时间，都可能经历角色转换。', '成年人一旦形成自我，就不会再学习新的社会角色。', '观察角色转换及规则学习，分析旧习惯如何被调整。'],
      ['角色与身份', '地位是社会位置，角色是附带的行为期待。不同角色相互冲突与同一角色内部期待紧张需要分开分析。', '照护家人与加班会议同时发生可能是角色冲突；同一教师同时被要求严格和鼓励则可能是角色紧张。', '任何压力都只能归因于个人时间管理差。', '明确社会位置与期待，再判断是跨角色冲突还是角色内部紧张。'],
      ['自我的呈现', '戈夫曼用前台、后台和印象管理分析互动。不同场合的呈现可以是角色需要，不必先解释成虚伪。', '服务人员面向顾客保持礼貌，在休息室表达疲惫，体现情境和观众的变化。', '只要不同场合表现不同，就证明这个人没有真实自我。', '比较观众、情境和角色规则，解释呈现方式为何改变。'],
    ]],
    ['群体与网络', [
      ['首属群体与次属群体', '首属群体重视持续、亲密的关系，次属群体通常围绕目标与角色组织；实际群体可能兼有两种特征。', '家人与项目团队提供不同支持，长期合作的团队也可能发展出亲密关系。', '一个群体只能永久属于一种类型，关系不会变化。', '按关系的亲密程度、持续性和目标来分析，而不是机械贴标签。'],
      ['组织与官僚制', '韦伯的官僚制理想型包括分工、层级、书面规则与专业资格。效率收益也可能伴随僵化和责任分散。', '标准流程让相似申请得到一致处理，也可能让特殊困难无法被现有表格容纳。', '有规则就一定不公平，因此取消全部规则便能解决问题。', '同时评估一致性、效率、例外处理和申诉渠道。'],
      ['社会网络', '社会网络关注关系结构。弱连接可能带来不同圈层的信息，强连接通常更利于稳定支持，但作用取决于情境。', '一位不常联系的同学提供其他行业岗位信息，亲近家人则提供持续照护。', '关系越亲密，它提供的信息就必然越新。', '区分支持和信息桥接，检查关系连接了哪些原本分开的圈层。'],
      ['社会资本', '社会资本是通过关系获得的资源。结合型关系促进内部支持，桥接型关系连接不同群体；资源获取并不均等。', '社区互助群提供照护，跨社区合作则可能引入设备和新知识。', '认识的人数相同，能获取的社会资源就完全一样。', '考察关系中的信任、资源和跨群体连接，而不只统计联系人数量。'],
    ]],
  ] },
  { title: '不平等', objective: '用分层、权力与制度机制解释机会差异，区分个体行为和结构过程。', project: '为社区绘制资源与障碍地图，提出阶级、族群及性别层面的可检验解释。', lectures: [
    ['阶级与分层', [
      ['社会分层体系', '分层意味着资源与地位系统性地分布不均。社会封闭决定进入优势位置的边界，先赋和自获机制可能同时存在。', '资格要求看似开放，但培训费用、家庭支持与进入渠道会影响谁有机会取得资格。', '只要形式上允许报名，每个人获得机会的条件就相同。', '区分形式资格和实际资源，检查进入优势位置的障碍。'],
      ['现代社会中的阶级', '马克思关注生产关系，韦伯同时考虑经济、地位和权力。收入、资产、声望与影响力不能简单互换。', '相同月收入的租房者和拥有多套房产者，面对失业时的安全程度可能不同。', '月收入一样就意味着阶级处境和生活保障完全相同。', '同时分析资产、劳动关系、声望与决策资源。'],
      ['社会流动性', '代内流动比较一个人生命历程中的位置变化，代际流动比较不同世代。结构变化和相对位置也应区分。', '更多人上大学不自动意味着家庭背景对进入优势职业的影响已消失。', '学历普遍提高就证明所有家庭的相对机会完全平等。', '比较不同家庭的转移概率，并区分整体扩张与相对机会。'],
      ['贫困与生活机会', '绝对贫困关注基本生活需要，相对贫困关注在特定社会中参与常规生活的资源差距。二者都可能影响健康与教育。', '同样收入在住房成本不同的城市购买力不同，照护负担也改变可支配资源。', '只比较名义收入就能完整判断生活困难。', '考虑物价、家庭需要、公共服务和参与社会生活的实际能力。'],
    ]],
    ['种族与族裔', [
      ['种族的社会建构', '种族分类是历史与制度形成的社会边界，不能把复杂的人类差异等同于固定的能力等级。分类仍会产生真实后果。', '同一身份在不同历史时期被归入不同类别，显示分类依赖规则和权力。', '社会分类是建构的，所以它不会造成任何真实影响。', '同时研究类别如何形成以及类别带来的资源、身份和待遇差异。'],
      ['偏见与歧视', '偏见指态度和预先判断，歧视指差别行为或制度待遇。研究时应分开测量意图、行动和结果。', '招聘者声称没有偏见，筛选规则仍可能让某些群体持续遭到排除。', '只要没有人公开表达偏见，就不可能存在歧视。', '检查实际筛选规则和待遇差异，同时分析可能的机制。'],
      ['隔离', '居住、教育或关系隔离使群体进入不同资源环境。空间分布可能由历史政策、市场和日常决策共同形成。', '社区税收与学校投入相连时，居住差异可能转变成教育资源差异。', '群体居住分开必定只是他们自由偏好的直接结果。', '比较政策历史、住房成本和实际选择空间。'],
      ['结构性不平等', '规则之间的连续作用可以复制群体差异，即使找不到一个决定全部结果的个人。机制解释仍需要证据。', '历史住房差距影响资产，资产影响教育支持，教育又影响工作机会，形成累积过程。', '找不到单个恶意行为者，就足以证明结果完全公平。', '沿制度链条追踪资源如何累积，并检验替代解释。'],
    ]],
    ['性别与性取向', [
      ['性别作为一种社会结构', '生理特征、身份认同与社会角色不是同一概念。性别规范组织互动和资源分配，需尊重个体差异。', '相同工作因被视为不同性别的工作而获得不同评价，体现社会期待的作用。', '所有劳动分工都能直接从生理差异完整推导出来。', '检查制度和日常期待怎样影响岗位安排与评价。'],
      ['性别社会化', '玩具、评价、媒体与互动会传递性别期待；社会化存在差异、冲突和改变，并非每个人得到同一结果。', '成年人更常鼓励某类孩子冒险，另一些孩子照顾他人，这可能改变练习机会。', '观察到偏好差异就能直接证明它完全来自天性。', '研究鼓励、约束和接触机会，并保留多种可能解释。'],
      ['工作、家庭与性别差异', '有偿工作和无偿照护相互依赖。分析差异时应同时考虑工作时间、职业分布、制度安排与家庭责任。', '两个人工作时长相近，但其中一人承担更多照护，能用于培训和休息的时间就可能更少。', '只看工资表就能完整反映每个人的劳动负担。', '将无偿照护、工作条件和职业机会一起纳入分析。'],
      ['性行为与社会', '社会通过规范、法律和文化组织亲密关系与身份。社会学分析关注权利、制度和尊重，不以身份推断个人品格。', '不同地区的伴侣权益安排影响财产、照护与医疗决策，体现制度后果。', '个人身份能直接决定其道德品质与能力。', '区分身份、行为和制度待遇，尊重个体并检查具体证据。'],
    ]],
  ] },
  { title: '制度', objective: '解释家庭、学校、经济、宗教、媒体和健康体系如何相互影响。', project: '选择一个制度，分析它怎样支持或限制社区成员，并提出证据与可行改进。', lectures: [
    ['家庭与教育', [
      ['家庭形式', '家庭的构成、照护和亲属责任存在历史与文化差异。描述家庭时应先明确具体关系和功能。', '多代同住、单亲、重组或共同照护的家庭可能以不同方式提供支持。', '只有一种家庭形式才可能提供稳定的照护。', '考察实际照护资源与关系质量，不能仅凭形式判断。'],
      ['家庭变迁', '婚育、同居和离婚趋势与经济条件、法律、性别期待和个人选择共同相关。单个指标不能概括全部家庭生活。', '住房成本上升与婚育推迟可能相关，但还需比较就业稳定性和政策。', '婚育时间变化只有一个原因：年轻人不重视家庭。', '比较成本、制度、文化和选择，用数据检验多种解释。'],
      ['学校教育与文凭主义', '教育包括知识与能力学习，也包括资格认证。文凭主义指资格在机会分配中的扩大作用，文凭和实际技能并非完全等同。', '一个岗位学历门槛提高，但具体任务没有变化，可以进一步研究文凭筛选。', '学历要求提高一定证明岗位技能难度同步提高。', '分别检查岗位任务、技能证据与资格筛选机制。'],
      ['教育与不平等的再生产', '学校既可能促进流动，也可能通过资源、期待和隐性规则延续差异。再生产是需要检验的机制，不是个人命运判决。', '同样的课外任务对拥有安静空间和成人帮助的学生更容易，可能放大家庭资源差异。', '给所有学生相同作业，就意味着完成条件完全一样。', '比较学习支持与隐性要求，同时寻找能缩小差距的制度安排。'],
    ]],
    ['工作与经济', [
      ['劳动力市场', '劳动力市场可按保障、晋升和稳定性分化。资格、网络与制度影响劳动者进入不同岗位的机会。', '同样技术水平的劳动者在正式岗位和临时岗位上可能面对不同保障。', '工作质量完全由个人能力单独决定。', '同时研究岗位结构、雇佣关系和进入渠道。'],
      ['职场变迁', '生产组织、自动化与平台规则改变工作安排。灵活性可能带来便利，也可能把风险转移给劳动者。', '平台工作允许自选时间，却可能让收入、保险和排班风险由个人承担。', '时间灵活就必定意味着劳动者掌握全部工作权力。', '比较定价、接单、保障和承担风险的实际控制权。'],
      ['消费', '消费既满足需要，也可能表达身份和地位。解释消费应结合预算、文化和社会比较，避免从物品推断个人价值。', '同一品牌在不同群体中代表不同意义，购买还可能受信贷与展示压力影响。', '购买昂贵商品就能证明一个人的真实财富和社会价值。', '区分展示信号、经济条件和群体赋予的意义。'],
      ['资本主义与全球化', '全球分工通过生产、金融和贸易连接地区。收益与风险的分配取决于价值链位置、制度和谈判资源。', '一件商品跨地区设计、制造和销售，各环节获取的收益可能不同。', '贸易规模扩大就意味着每个参与者按相同比例受益。', '追踪价值链、劳动条件与收益分配，说明具体机制。'],
    ]],
    ['宗教、媒体与健康', [
      ['宗教与社会', '社会学研究宗教的共同实践、意义与组织后果，区分这种分析和对信仰真假的裁决。', '共同仪式可能增强归属，也可能形成边界；后果需要在具体群体中观察。', '研究仪式的社会功能就等于证明信仰真或假。', '描述组织与互动的效果，不把社会分析替代信仰判断。'],
      ['世俗化', '世俗化可以指制度权威、公共实践或个人信仰的变化。这些维度未必同步，不同地区也有不同轨迹。', '宗教组织公共权力下降时，个人精神实践仍可能持续。', '现代化必然使所有地区的宗教在同一速度下完全消失。', '分别比较制度权威、实践与认同，检查具体地区和时期。'],
      ['媒体与技术', '媒体通过选择、呈现与分发影响可见性。算法、所有权与数字资源共同塑造信息环境。', '推荐系统反复展示一种观点可能加强曝光，但不能仅凭一次推送判断所有人的态度。', '首页内容就是社会上所有意见的随机且完整样本。', '检查分发机制、使用差异和未被展示的内容。'],
      ['健康差异', '健康受收入、劳动环境、住房、服务和社会支持影响。社会决定因素帮助解释群体模式，不替代个体医疗诊断。', '居住环境与就医机会不同，可能使同年龄人群健康风险不同。', '群体健康差异只能用个人自律程度解释。', '同时分析环境、资源和服务，避免把群体关联当成个人诊断。'],
    ]],
  ] },
  { title: '越轨与社会变迁', objective: '研究规范、人口和集体行动如何维持或改变社会。', project: '以此前社区研究为基础，提出可评估的改变方案，说明机制、参与者与可能副作用。', lectures: [
    ['越轨与控制', [
      ['定义越轨', '越轨指相对某种群体规范的偏离及其社会反应。越轨与违法有交集，但法律和非正式规范不是同一范围。', '在安静场所大声说话可能违反规范，却未必构成犯罪；同一行为换个场景评价也可能改变。', '违反社会规范的行为在任何情境都必定违法。', '先明确群体、情境和规则，再区分非正式反应与法律后果。'],
      ['偏离理论', '压力理论强调目标与手段的不匹配，标签理论考察社会反应，控制理论研究联结与约束。各视角回答不同问题。', '分析违规时，可以分别研究资源障碍、被贴标签后的机会变化和群体关系。', '一个理论解释一种情况，就能排除所有其他社会机制。', '比较理论提出的机制与证据，不把不同解释混成同一个概念。'],
      ['犯罪', '犯罪统计来自报告、记录与分类过程。官方数据、受害调查和自报研究各有覆盖限制。', '报案率变化可能改变记录数量，即使实际发生情况没有同比例改变。', '记录数量增加就能直接证明真实发生率按相同比例增加。', '检查报告意愿、记录规则和其他数据来源。'],
      ['惩罚与司法系统', '惩罚的目标可包括威慑、隔离、报应与复归。效果评估要明确目标、比较条件与长期结果。', '更重处罚可能改变某些行为，也可能产生就业与家庭后果，不能只看短期收押人数。', '处罚越严就必定在每个指标上效果越好。', '预先确定结果指标，比较长期效果及不同群体承担的后果。'],
    ]],
    ['人口与空间', [
      ['人口统计学', '出生、死亡与迁移共同改变人口数量和结构。总量、比率和年龄分布回答不同问题。', '出生人数变少可能与育龄人口规模改变有关，不能只从人数推断每个人的生育选择。', '出生人数下降就能证明每位育龄者的生育率同比例下降。', '同时查看分母、年龄结构和时期，区分人数与比率。'],
      ['人口迁移', '迁移由离开原地的推动因素、目的地吸引、政策、资源与网络共同影响。并非每个人拥有相同迁移条件。', '工作机会吸引迁移，但住房、签证和照护责任影响谁能够出发。', '所有想迁移的人都能以相同成本自由迁移。', '比较机会、限制与关系资源，解释实际迁移模式。'],
      ['老龄化社会', '人口老龄化涉及年龄结构变化与制度安排。年龄不直接等于能力，需要分析健康、劳动与照护的多样性。', '退休制度、无障碍设施和社区服务影响老年人的参与机会。', '年龄相同的人在能力与照护需求上完全一样。', '区分年龄结构和个人差异，研究制度如何支持参与。'],
      ['城市化与社区', '城市化改变空间、劳动和交往。更新与绅士化可能改善环境，也可能使原居民承受租金与迁出压力。', '一条街翻新后商铺增加，原租户却难以继续承担房租，需要同时分析两种结果。', '街区变漂亮就证明原有居民一定都受益。', '追踪居住成本、迁移和公共资源，比较不同群体的结果。'],
    ]],
    ['社会变迁', [
      ['社会运动', '社会运动需要持续的集体努力、资源和共同解释。资源动员、机会结构与框架帮助理解行动如何形成。', '同样存在不满的两个社区，组织网络和参与渠道不同，可能产生不同动员结果。', '只要人们不满，就必定自动形成成功的社会运动。', '检查组织、资源、共同框架和制度机会如何共同作用。'],
      ['集体行动', '集体行动面对协调、信任与搭便车问题。临时情境也可能形成新的行为规范，不等于群体必定失去理性。', '居民共享公共空间，需要协商维护规则、监督方式和分担成本。', '多人参与就必定意味着每个人都不再作任何判断。', '观察协调机制和涌现规范，分析合作成本与激励。'],
      ['技术与社会变迁', '技术影响组织和生活，同时也被政策、利益与文化塑造。技术扩散快于规则适应时可能出现文化滞后。', '自动化工具改变任务分配，但培训、劳动协商与监管决定影响怎样分布。', '新技术一出现，就会以完全相同的方式改变所有社会。', '比较采用条件、制度回应和收益风险分配。'],
      ['环境与社会的未来', '环境社会学研究生产、消费、权力和生态约束。环境风险与应对能力常不均等，应追踪责任和分配。', '同一次热浪中，住房条件、户外工作与降温设施造成不同暴露和保护。', '自然事件影响相同，所以每个人承受的社会后果必定相同。', '区分自然过程和社会脆弱性，设计可检验的公平应对方案。'],
    ]],
  ] },
];

function step(id: string, phase: ClassroomStep['phase'], title: string, narration: string, diagram?: ClassroomDiagram, notes?: string[]): ClassroomStep {
  return { id, phase, title, narration, durationMs: Math.max(5500, narration.length * 165), blocks: [
    { id: id + ':heading', kind: 'heading', text: title },
    { id: id + ':points', kind: 'points', text: title, items: notes ?? {
      orient: ['概念是什么？', '怎样解释生活？', '用什么证据核查？'],
      concept: ['识别关键概念', '区分适用条件与边界'],
      example: ['先记录观察事实', '再提出机制与替代解释'],
      contrast: ['警惕“全部、必然、唯一”等绝对判断', '补足条件，再检查证据'],
      check: ['独立判断', '说明理由', '对照反馈，修正解释'],
      transfer: ['新情境：观察 → 解释 → 证据', '加入项目，再用新题核查'],
    }[phase] },
    ...(diagram ? [{ id: id + ':diagram', kind: 'diagram' as const, text: diagram.title, diagram, atSentence: 1 }] : []),
  ] };
}

const lessonMap = new Map<string, ClassroomLesson>();
const keys = new Map<string, { answer: number | number[]; explanation: string; optionExplanations?: string[] }>();
const hints = new Map<string, string[]>();
const course: ClassroomCourse = {
  id: 'sociology-foundations', title: '社会学概论', level: '成人 · 自主学习', version: CLASSROOM_PRACTICE_VERSION,
  description: '从自己的生活出发，看见文化、关系和制度如何共同塑造社会。五个单元串起概念、案例、练习与一个持续推进的社区研究。',
  provenance: 'StudyAgent 自编教学内容；课程层级与交互参考用户指定HyperKnow页面的可见观察。成人课程记录独立于小学能力评测。',
  references: [{ title: 'OpenStax · Introduction to Sociology 3e', url: 'https://openstax.org/details/books/introduction-sociology-3e' }],
  units: seeds.map((unit, ui) => ({ id: `soc-u${ui + 1}`, title: unit.title, objective: unit.objective,
    project: { title: ['研究问题与方法设计', '文化与互动观察笔记', '社区资源与障碍地图', '制度影响分析', '变革提案与最终报告'][ui], brief: unit.project,
      rubric: ['把事实观察、参与者观点与自己的推断分开', '至少使用本单元两个概念并说明作用机制', '列出替代解释、证据局限与下一步验证', '保护隐私，只写匿名情境，不上传真实个人资料'] },
    lectures: unit.lectures.map(([title, topics], li) => ({ id: `soc-u${ui + 1}-l${li + 1}`, title, description: `围绕${title}，通过四段微课完成概念辨析与情境应用。`,
      lessons: topics.map(([name, concept, example, misconception, inference], ti) => {
        const id = `soc-${ui + 1}-${li + 1}-${ti + 1}`, questionId = id + ':check';
        const answer = (ui + li + ti) % 4;
        const options = [misconception, '只描述个人态度，不必比较情境或规则。', '只记录结果，不需要区分观察与解释。'];
        options.splice(answer, 0, inference);
        keys.set(questionId, { answer, explanation: inference + ' ' + concept });
        const diagram: ClassroomDiagram = id === 'soc-1-1-1'
          ? { kind: 'venn', title: '个人处境与社会条件的交汇', labels: ['个人经历', '社会条件', '社会学想象力'], captions: ['传记 · Biography', '历史 · History'] }
          : { kind: 'flow', title: '从观察走向可以核查的解释', labels: [name, '情境与规则', '证据与替代解释'] };
        const steps = [
          step(id + ':orient', 'orient', '本节课导航', `今天一起研究“${name}”。先记住三个问题：这个概念指什么？它怎样解释具体生活？什么证据能帮助我们判断解释是否站得住？`),
          step(id + ':concept', 'concept', name, concept, diagram, conceptNotes[name]),
          step(id + ':example', 'example', '把概念放进生活', example),
          step(id + ':contrast', 'contrast', '一个常见的误区', `先检验这句话：“${misconception}” 它省略了哪些条件？${inference}`),
          step(id + ':check', 'check', '停下来，检查理解', '请先用自己的话解释这个情境，再打开右侧的课堂练习。答错时先比较两种解释；使用提示也会记录下来，这只是学习记录。'),
          step(id + ':transfer', 'transfer', '带到一个新情境', `选择另一个与${name}有关的匿名日常情境。写清观察、解释和还需要的证据，然后把它加入本单元项目。看完讲解只表示接触过内容，能否迁移要用新情境再核查。`),
        ];
        if (id === 'soc-1-1-1') {
          steps[1].blocks = steps[1].blocks.filter(block => block.kind !== 'diagram');
          steps[1].blocks.push({ id: id + ':concept-image', kind: 'image', text: '个人处境与社会条件的交汇', atSentence: 1,
            image: { src: '/classroom/venn-d8b3f1.webp', alt: '个人处境与社会条件的交汇', caption: '传记与历史的交汇点 · 社会学想象力' } });
          steps.splice(2, 0, step(id + ':scale', 'example', '先看问题的规模', '一个人找不到工作时，可以调查技能和求职过程；同一产业大量岗位一起消失时，还必须检查需求、投资与政策。规模变化提示我们扩大解释范围，但规模本身还不是因果证明。',
            { kind: 'bars', title: '相同现象，不同分析层次', labels: ['个人处境', '行业岗位变化'], values: [1, 80] }));
          steps.splice(4, 0, step(id + ':agency', 'contrast', '行动仍然有位置', '看见结构不是放弃行动。把船放在河流中：你能调整划桨方式，也能与他人改善航道；但水流和航道决定行动需要面对什么条件。',
            undefined, ['划桨：个人能动性', '水流与航道：结构条件', '集体行动：也能改变航道']));
          steps[4].blocks.push({ id: id + ':agency-image', kind: 'image', text: '能动性与结构', atSentence: 1,
            image: { src: '/classroom/agency-river-c7a9e2.webp', alt: '划船者选择划桨方式，水流限制前进条件，岸边的人合作改善航道', caption: '划桨、河流与航道 · 概念示意' } });
          steps[2].blocks[1].items = ['个体处境：检查经历与求职过程', '群体变化：检查行业与制度条件', '规模提示分析层次，不直接证明因果'];
          steps[3].blocks[1].items = ['观察：多家工厂同时关闭', '问题：岗位变化还是个体差异？'];
          steps[5].blocks[1].items = ['个人困扰：近处情境中的经历', '公共议题：群体与制度层面的模式'];
          steps[2].blocks.push({ id: id + ':code', kind: 'code', text: '用数值比较数量与比例：可编辑的演示，不是真实社会数据',
            code: 'const groups = [{name: "甲地区", unemployed: 20, population: 100}, {name: "乙地区", unemployed: 40, population: 1000}];\nfor (const g of groups) console.log(g.name + ": " + (g.unemployed / g.population * 100).toFixed(1) + "%");' });
          steps[5].blocks.push({ id: id + ':comparison', kind: 'table', text: '个人困扰与公共议题', table: {
            headers: ['分析层次', '观察什么', '还需核查什么'], rows: [
              ['个人与近处情境', '经历、资源、求职过程', '技能、健康、关系和可选机会'],
              ['公共与制度条件', '群体分布、行业与时期变化', '岗位结构、政策和替代解释'],
            ] } });
        }
        const lesson: ClassroomLesson = { id, lectureId: `soc-u${ui + 1}-l${li + 1}`, title: name,
          objective: `能在新情境中区分关于“${name}”的解释，并指出需要进一步核查的证据。`, steps,
          questions: [{ id: questionId, prompt: example + '\n哪一种分析更符合本节概念？', options, hint: '先区分观察事实和解释，再检查哪一项把有条件的关系说成了绝对关系。' }] };
        if (id === 'soc-1-1-1') {
          const checks = [
            ['个人与历史', '根据 C. Wright Mills 的分析，“社会学想象力”帮助我们怎样理解个人经历与社会环境之间的关系？', ['把个人经历与时代、制度联系起来', '只研究人的性格', '证明个人没有任何选择', '用个人成功证明所有制度公平'], 0, '个人处境与社会条件需要放在一起分析。'],
            ['层次辨析', '同一行业多家工厂关闭，许多熟练工同时失业。下一步优先核查什么？', ['每个人是否都懒惰', '产业需求与岗位结构如何变化', '只看一个工人的简历', '直接认定所有个人因素都不相关'], 1, '群体模式提示结构层面的问题，但仍需比较证据。'],
            ['能动性', '划船比喻中，哪一项最能体现“结构中的能动性”？', ['水流完全决定结局', '划桨能无视所有水流', '调整划法，并合作改善航道', '只要努力，所有人的条件就相同'], 2, '行动发生在条件中，也可能改变条件。'],
            ['证据边界', '为什么不能仅凭大量失业就宣布已经证明某个原因？', ['人数没有研究价值', '个人经历才是唯一证据', '所有原因永远无法研究', '还需要比较时期、条件与替代解释'], 3, '规模是分析线索，因果判断还需其他证据。'],
            ['迁移应用', '一项相同作业在不同家庭中完成难度不同。哪种研究设计更合理？', ['比较安静空间、设备与成人支持', '只给学生贴上努力程度标签', '假定所有家庭的资源相同', '只收集一个成功故事就结束'], 0, '比较具体条件，才能解释相同任务中的机会差异。'],
          ] as const;
          lesson.questions = checks.map(([label, prompt, answers, correct, explanation], index) => {
            const checkId = index === 0 ? questionId : id + ':check:' + index;
            keys.set(checkId, { answer: correct, explanation });
            return { id: checkId, prompt, options: [...answers], hint: '回想“' + label + '”的分析边界，排除忽略条件或把关系说成绝对的解释。',
              ...(index === 0 ? { image: { src: '/classroom/venn-d8b3f1.webp', alt: '个人传记与历史结构相交的概念图', caption: '传记与历史' } } :
                index === 2 ? { image: { src: '/classroom/agency-river-c7a9e2.webp', alt: '个人调整划桨方式并合作改善航道，行动受到水流与航道条件影响', caption: '结构与能动性' } } : {}) };
          });
        }
        for (const [index, question] of lesson.questions.entries()) {
          question.topic = { lessonId: id, title: name };
          question.purpose = id === 'soc-1-1-1' ? (['boundary', 'evidence', 'application', 'evidence', 'application'] as const)[index] : 'application';
          question.hintCount = 2; hints.set(question.id, [question.hint, concept]);
        }
        const variations = practiceVariations[id];
        if (id !== 'soc-1-1-1' && (!variations || variations.length !== 2)) throw new Error('微课练习未补齐：' + id);
        for (const variation of variations ?? []) {
          if (variation.options.length !== 4 || new Set(variation.options).size !== 4 || variation.hints.length !== 2 ||
            !Number.isInteger(variation.answer) || variation.answer < 0 || variation.answer > 3) throw new Error('微课练习内容无效：' + id);
          const questionId = id + ':practice:v1:' + variation.purpose;
          const rotation = createHash('sha256').update(questionId).digest()[0] % 4;
          const options = [...variation.options.slice(rotation), ...variation.options.slice(0, rotation)];
          keys.set(questionId, { answer: (variation.answer - rotation + 4) % 4, explanation: variation.explanation });
          hints.set(questionId, [...variation.hints]);
          lesson.questions.push({ id: questionId, prompt: variation.prompt, options, hint: variation.hints[0], hintCount: 2,
            purpose: variation.purpose, topic: { lessonId: id, title: name },
            ...(variation.table ? { table: structuredClone(variation.table) } : {}), ...(variation.diagram ? { diagram: structuredClone(variation.diagram) } : {}) });
        }
        for (const choice of microChoices.filter(choice => choice.lessonId === id)) {
          const frozen = freezeMultipleChoice(id + ':practice:v2:multiple:' + choice.purpose, choice, name);
          lesson.questions.push(frozen.question); keys.set(frozen.question.id, frozen.key); hints.set(frozen.question.id, frozen.hints);
        }
        lesson.practiceVersion = CLASSROOM_PRACTICE_VERSION + ':' + createHash('sha256').update(JSON.stringify(lesson.questions.map(question =>
          [question, keys.get(question.id), hints.get(question.id)]))).digest('hex').slice(0, 16);
        lessonMap.set(id, lesson);
        return { id, title: name, objective: lesson.objective };
      }),
    })),
  })),
};

const unitLessons = new Map<string, ClassroomLesson>();
for (const unit of course.units) {
  const definitions = unitChecks[unit.id];
  const topics = unit.lectures.flatMap(lecture => lecture.lessons);
  if (!definitions || definitions.length !== topics.length || new Set(definitions.map(item => item.lessonId)).size !== topics.length)
    throw new Error('单元核查未覆盖全部微课：' + unit.id);
  const id = 'unit-exam:' + unit.id;
  const questions = definitions.map((item, index) => {
    const topic = topics.find(topic => topic.id === item.lessonId);
    if (!topic || item.options.length !== 4 || new Set(item.options).size !== 4 || !Number.isInteger(item.answer) || item.answer < 0 || item.answer > 3)
      throw new Error('单元核查内容无效：' + item.lessonId);
    const questionId = id + ':v1:' + (index + 1);
    if (unit.id === 'soc-u1' && item.lessonId === unitChoice.lessonId) {
      const frozen = freezeMultipleChoice(questionId, unitChoice, topic.title);
      keys.set(questionId, frozen.key); hints.set(questionId, frozen.hints); return frozen.question;
    }
    const rotation = createHash('sha256').update(questionId).digest()[0] % 4;
    const options = [...item.options.slice(rotation), ...item.options.slice(0, rotation)];
    keys.set(questionId, { answer: (item.answer - rotation + 4) % 4, explanation: item.explanation });
    hints.set(questionId, [item.purpose === 'evidence' ? '先明确要核查哪一种解释，区分直接观察、指标和进一步推断。' :
      item.purpose === 'boundary' ? '先比较相邻概念和适用条件，不把一个现象直接当作全部机制。' : '先指出情境中的规则、关系或资源，再用概念逐步核对。', item.hint]);
    return { id: questionId, prompt: item.prompt, options, hint: item.hint, hintCount: 2, purpose: item.purpose, topic: { lessonId: topic.id, title: topic.title } };
  });
  unitLessons.set(id, { id, title: unit.title + ' · 单元核查', lectureId: unit.id, objective: unit.objective,
    assessment: { kind: 'unit-check', version: UNIT_CHECK_VERSION + ':' + createHash('sha256').update(JSON.stringify(definitions)).digest('hex').slice(0, 16),
      notice: '这组题采用不同于课堂练习的新情境。提示、跳过和首次作答分别保留；结果只说明本组表现，不是标准化能力等级。' },
    practiceVersion: CLASSROOM_PRACTICE_VERSION + ':' + createHash('sha256').update(JSON.stringify(questions.map(question => [question, keys.get(question.id), hints.get(question.id)]))).digest('hex').slice(0, 16),
    steps: [step(id + ':orient', 'orient', '单元核查', '用十二个新情境核查本单元各个主题。可以先独立判断，需要帮助时再使用提示。结果保留首次答案和辅助情况，不将这次正确率直接称为掌握。'),
      step(id + ':transfer', 'transfer', unit.project.title, unit.project.brief)], questions });
}

export function classroomCourse(): ClassroomCourse { return structuredClone(course); }
export function classroomLesson(id: string): ClassroomLesson | undefined {
  const lesson = lessonMap.get(id);
  if (lesson) return structuredClone(lesson);
  const check = unitLessons.get(id);
  return check ? structuredClone(check) : undefined;
}
export function classroomAnswerKey(id: string) { return keys.get(id); }
export function classroomHintKeys(id: string) { return hints.get(id); }
export function classroomFingerprint(lesson: ClassroomLesson) { return createHash('sha256').update(JSON.stringify(lesson)).digest('hex'); }
export function classroomTeachingFingerprint(lesson: ClassroomLesson) {
  // This comparison is not persisted as the content/version identity. JSONB may
  // reorder nested object properties; preserve values and array order only.
  const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,child])=>[key,canonical(child)])):value;
  return createHash('sha256').update(JSON.stringify(canonical({ id: lesson.id, lectureId: lesson.lectureId, title: lesson.title,
    objective: lesson.objective, steps: lesson.steps, verificationHref: lesson.verificationHref }))).digest('hex');
}

export function curriculumClassroomLesson(studioCourse: StudioCourse, source: StudioLesson): ClassroomLesson | undefined {
  const teaching = source.teaching?.teaching;
  if (source.kind !== 'learn' || !teaching || teaching.reviewStatus !== 'approved') return undefined;
  const id = source.id;
  const steps = [
    step(id + ':orient', 'orient', '本节课导航', source.objective),
    step(id + ':concept', 'concept', source.title, teaching.explanation, undefined, [source.title, '注意适用条件与易混概念']),
    step(id + ':example', 'example', teaching.example.prompt, teaching.example.steps.join('。') + '。' + teaching.example.conclusion, undefined, teaching.example.steps),
    ...teaching.commonErrors.slice(0, 2).map((error, index) => step(id + ':contrast:' + index, 'contrast', '常见误区：' + error.observation,
      error.alternativeExplanations.join('；') + '。核查方法：' + error.verification)),
    step(id + ':check', 'check', '用新题检查', teaching.verification.understanding + '。' + teaching.verification.procedure),
    step(id + ':transfer', 'transfer', '迁移与复测', teaching.verification.transfer + '。' + teaching.verification.retention),
  ];
  if (studioCourse.subject === 'chemistry') for (const item of steps)
    item.blocks.splice(1, 0, { id: item.id + ':explanation', kind: 'text', text: item.narration });
  return supplementChemistryLesson(studioCourse, source, { id, title: source.title, objective: source.objective, lectureId: studioCourse.id, steps, questions: [], verificationHref: source.href });
}

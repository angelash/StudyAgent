import { createHash } from 'node:crypto';
import { normalizeClassroomSelection, type ClassroomQuestion } from '@study-agent/contracts';

type Choice = { lessonId: string; purpose: 'boundary' | 'evidence' | 'application'; prompt: string; options: string[];
  answer: number[]; explanation: string; optionExplanations: string[]; hints: [string, string] };
/** Independently authored examples. Structural validation does not imply teacher approval or calibration. */
export const microChoices: Choice[] = [
  { lessonId: 'soc-1-1-1', purpose: 'boundary', prompt: '同一城市多家工厂关闭后，许多工人同时失业。哪些分析符合社会学想象力？',
    options: ['比较岗位总量与产业政策的变化', '核查不同工人的技能、家庭支持和求职经历', '人数多已经证明某项政策是唯一原因', '承认结构影响后就不再研究个人行动', '追问个人经历与这一时期的制度条件怎样相连'],
    answer: [0, 1, 4], explanation: '社会学想象力把传记与历史联系起来。既研究共同机会条件，也比较个人处境；规模本身不能排除替代解释，结构分析也不取消能动性。',
    optionExplanations: ['岗位和政策变化提供历史与制度条件。', '个体差异仍需在共同条件下研究。', '人数只能提示模式，不能单独识别唯一原因。', '结构影响与个人行动可以同时研究。', '把生活历程与社会条件相连是核心分析任务。'],
    hints: ['把“研究哪些层面”和“已经证明什么”分开。', '同时检查个人处境与共同条件；判断结论是否越过现有证据。'] },
  { lessonId: 'soc-1-1-2', purpose: 'application', prompt: '夜班员工推动公交延长运营时间。哪些观察能同时体现结构约束与能动性？',
    options: ['现行末班车时间压缩了夜班员工的通勤选择', '员工只能接受现状，任何行动都没有意义', '员工协商、组织并提出线路调整建议', '建议提交后，预算和审批条件就自动消失', '方案效果还受到班次、经费和实际需求的影响'],
    answer: [0, 2, 4], explanation: '运营规则塑造选择空间，员工组织体现能动性；行动又在预算、程序与需求中展开。提出建议不等于条件已经改变，也不能由约束推出行动无意义。',
    optionExplanations: ['规则限制可选范围，是可观察的结构条件。', '存在约束不能推出行动必定无效。', '组织与协商是改变条件的行动。', '表达诉求不会自动消除制度与资源条件。', '行动效果需要联系具体实施条件。'],
    hints: ['分别寻找既有条件、人的行动和行动后的实施条件。', '留意“任何”“自动”等绝对判断是否抹去了条件与行动的关系。'] },
  { lessonId: 'soc-1-3-1', purpose: 'evidence', prompt: '研究者只在付费健身群发问卷，并得到很高的运动比例。哪些做法有助于核查能否推广到全市成年人？',
    options: ['检查未入群、未付费和不运动者是否被覆盖', '只要继续在同一个群增加样本，就认定偏差消失', '比较不同招募渠道和未回应者的情况', '把愿意填问卷的人直接当作全体市民', '用覆盖目标总体的抽样框重新招募，并报告仍存在的限制'],
    answer: [0, 2, 4], explanation: '推广范围取决于覆盖、选择与回应机制。扩大同源便利样本不能自动修复遗漏；更合适的抽样和渠道对照能提供核查证据，但仍需报告限制。',
    optionExplanations: ['覆盖缺口可能系统性遗漏部分成年人。', '样本量增加不能自动消除同源选择偏差。', '渠道和非回应比较帮助识别选择机制。', '参与意愿不等于对总体具有代表性。', '合适抽样框与透明限制有助于判断推广范围。'],
    hints: ['先追问“谁有机会进入样本”，再看人数多少。', '比较覆盖、招募与回应过程，区分发现偏差和已经消除偏差。'] },
];

export const unitChoice: Choice = {
  lessonId: 'soc-1-1-1', purpose: 'application', prompt: '同一时期，多地年轻租户推迟独立居住。哪些资料或分析能连接生活历程与社会条件？',
  options: ['比较各地租金与青年收入的同期变化', '比较不同家庭提供住房支持的条件', '只凭一位受访者的偏好推断所有青年动机', '追踪相似处境者在住房规则变化前后的经历', '把共同趋势当作每位租户都没有个人选择的证明'],
  answer: [0, 1, 3], explanation: '价格、收入、家庭资源和规则变化可以把个人经历放回共同条件。共同趋势不说明所有人的动机相同，也不证明个人行动不存在；比较仍须检查其他变化。',
  optionExplanations: ['同期机会条件帮助解释共同处境。', '家庭资源连接个体历程与社会差异。', '单个案例不能代表所有人的动机。', '历时比较能提出机制线索，仍要核查替代解释。', '群体趋势不能抹去个体选择与内部差异。'],
  hints: ['寻找能在个人经历和共同机会条件之间建立比较的资料。', '区分群体模式、个体动机和因果证明，不从其中一个直接跳到另一个。'],
};

export function freezeMultipleChoice(id: string, choice: Choice, title: string) {
  const count = choice.options.length, correct = normalizeClassroomSelection('multiple', count, choice.answer, 'answered');
  if (correct.length < 2 || correct.length >= count || new Set(choice.options).size !== count || choice.options.some(o => !o.trim()) ||
    choice.optionExplanations.length !== count || choice.optionExplanations.some(e => !e.trim()) || choice.hints.some(h => !h.trim())) throw Error('多选教学内容结构无效：' + id);
  const rotation = createHash('sha256').update(id).digest()[0] % count;
  const rotate = <T>(items: T[]) => [...items.slice(rotation), ...items.slice(0, rotation)];
  const question: ClassroomQuestion = { id, selectionMode: 'multiple', prompt: choice.prompt, options: rotate(choice.options),
    hint: choice.hints[0], hintCount: 2, purpose: choice.purpose, topic: { lessonId: choice.lessonId, title } };
  return { question, key: { answer: correct.map(index => (index - rotation + count) % count).sort((a,b) => a-b),
    explanation: choice.explanation, optionExplanations: rotate(choice.optionExplanations) }, hints: [...choice.hints] };
}

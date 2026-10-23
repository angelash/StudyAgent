import { createHash } from 'node:crypto';
import type { CourseProjectDefinition, ProjectCriterion, ProjectStage, StudioCourse, StudioUnit } from '@study-agent/contracts';
import { classroomCourse } from './classroom-curriculum';

const rubric: ProjectCriterion[] = [
  { id: 'observation', title: '事实与解释', levels: ['还没有可核对的观察', '有情境描述，事实与推断仍混合', '观察、观点和推断分开，并标明来源', '在前一级基础上检查来源限制和相互冲突的记录'] },
  { id: 'concept', title: '概念与机制', levels: ['尚未使用相关概念', '提到概念，但没有解释怎样起作用', '用至少两个相关概念解释具体过程', '比较概念的适用条件，并提出可区分的机制预测'] },
  { id: 'alternatives', title: '替代解释与验证', levels: ['只有一个未经核查的结论', '列出另一种可能解释', '为不同解释提出可区分的证据', '明确反证条件、证据不足和下一次检查方法'] },
  { id: 'ethics', title: '边界与参与者保护', levels: ['尚未说明资料与参与者边界', '提到匿名或不确定性', '匿名记录，区分能判断和不能判断的范围', '说明退出与资料最小化，并核查改进方案的风险'] },
];
const stage = (id: string, title: string, objective: string, fields: Array<[string, string, string]>): ProjectStage => ({
  id, title, objective, fields: fields.map(([id, label, prompt]) => ({ id, label, prompt })) });
const adultStages: ProjectStage[][] = [
  [stage('question', '界定研究问题', '把个人印象转成可以核对的社区问题。', [
    ['scene', '匿名情境与已知观察', '写清在哪里、何时、观察到什么；不写真实姓名。'],
    ['question', '可以研究的问题', '研究对象、比较范围和你希望解释的现象是什么？']]),
  stage('design', '比较机制与设计方法', '让不同解释有机会被证据区分。', [
    ['concepts', '概念与两种解释', '至少用两个本单元概念，写出它们怎样解释观察。'],
    ['method', '对象、方法与反证', '计划观察或比较什么？看到什么会让你放弃原解释？']]),
  stage('limits', '检查边界并形成研究方案', '形成可执行、保护参与者的小型方案。', [
    ['limits', '抽样、局限与参与者保护', '谁可能没有被观察到？如何匿名、避免收集隐私并允许退出？'],
    ['next', '下一步与判断标准', '先做哪一步？什么结果可以判断，什么结果仍只能等待？']])],
  [stage('observe', '记录文化与互动', '延续研究问题，保留具体互动的匿名记录。', [
    ['link', '与前一单元问题的联系', '沿用哪个问题，或为什么改变问题？可以引用此前已提交产物。'],
    ['observations', '规范、互动与原始记录', '记录一项规范、一次身份协商或一次互动，区分观察和参与者观点。']]),
  stage('interpret', '解释身份与关系资源', '从互动细节解释规范和关系如何起作用。', [
    ['concepts', '文化、身份与关系机制', '至少选两个概念解释具体细节，不用身份推断个人品格。'],
    ['alternative', '另一种解释与区分证据', '同一行为还可能来自什么情境？如何对照核查？']]),
  stage('reflect', '复查观察边界', '记录观察者立场以及仍需要补充的情境。', [
    ['limits', '观察者立场与缺失记录', '你的身份或在场方式会影响记录吗？哪些人和互动没看到？'],
    ['next', '后续观察与保护办法', '设计一次对照观察，说明匿名记录方式和不收集哪些信息。']])],
  [stage('map', '绘制资源与障碍地图', '按可获得资源、进入条件和障碍整理社区资料。', [
    ['map', '文字地图或资源表', '逐项写出资源、位置或使用场景、谁能使用以及进入条件。'],
    ['observed', '观察与资料来源', '说明哪些有记录，哪些只是猜测；用证据区保留可核查摘录。']]),
  stage('mechanism', '比较分层机制', '把机会差异放到资源、规则和权力关系中。', [
    ['concepts', '阶级、族群或性别相关机制', '至少选两个相关概念，写清规则怎样影响机会，避免给个人贴标签。'],
    ['alternative', '替代解释和公平比较', '还有哪些条件可能解释差异？比较时需要控制或补充什么？']]),
  stage('verify', '检验地图与缺口', '说明资料限制和下一次可区分的比较。', [
    ['limits', '遗漏、反例与匿名边界', '哪些人的使用经验不在资料中？什么反例挑战你的解释？'],
    ['next', '核查设计与可判断范围', '补充什么证据能改变判断？避免从群体模式诊断个体。']])],
  [stage('trace', '追踪制度中的具体过程', '选择家庭、教育、工作等制度中的一项流程。', [
    ['process', '制度与过程链条', '谁提出要求、谁能进入、资源如何分配、产生什么结果？'],
    ['evidence', '过程证据与前期联系', '使用此前观察或地图，指出每个环节的依据和缺口。']]),
  stage('compare', '比较支持与限制', '分析同一安排对不同处境的人有什么后果。', [
    ['concepts', '两个概念与作用机制', '将制度规则、资源和实际结果联系起来，保留个体差异。'],
    ['alternative', '反例与替代解释', '制度之外还有什么原因？什么证据能区分这些解释？']]),
  stage('improve', '提出可核查的改进', '明确改进对象、参与者、限制和副作用。', [
    ['proposal', '小规模改进及预期机制', '改变哪一步、由谁参与、为什么可能有效？'],
    ['limits', '风险、匿名与验证', '谁可能受损？如何保护资料、允许退出并检查不同群体的结果？']])],
  [stage('synthesize', '整合前四份研究产物', '把问题、观察、资源和制度分析连成有依据的解释。', [
    ['findings', '主要发现与产物引用', '引用具体已提交版本，分开事实、观点和解释。'],
    ['concepts', '机制与相互竞争的解释', '至少用两个概念，列出证据支持、冲突和仍未知的部分。']]),
  stage('proposal', '形成变革提案', '从解释走向范围明确、可实施的行动。', [
    ['action', '行动、参与者与资源', '谁做什么、需要什么、如何协调、何时可以停止？'],
    ['risk', '不同群体的后果与风险', '可能出现哪些副作用？匿名、退出和公平如何保障？']]),
  stage('evaluate', '设计评估与最终报告', '预先约定成功标准、比较方式和复盘条件。', [
    ['evaluation', '指标、比较与反证条件', '用什么过程和结果指标？如何检查是否来自其他变化？'],
    ['report', '局限、下一次复盘与报告结论', '能说什么、不能说什么？何时重新观察，什么结果使你修改提案？']])],
];
function define(input: Omit<CourseProjectDefinition, 'version' | 'fingerprint' | 'contentReview' | 'provenance'>): CourseProjectDefinition {
  const body = { ...input, version: 'project-v1-2026-10-24', contentReview: 'pending' as const,
    provenance: 'StudyAgent 原创项目与量规；参考已观察的课程项目流程。内容待教师审核，四级描述不代表标准化成绩。' };
  return { ...body, fingerprint: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
}
export function adultProjectDefinitions(): CourseProjectDefinition[] {
  return classroomCourse().units.map((unit, index) => define({ id: 'project:' + unit.id, courseId: 'sociology-foundations',
    unitId: unit.id, title: unit.project.title, brief: unit.project.brief, stages: structuredClone(adultStages[index]), rubric: structuredClone(rubric) }));
}
export function curriculumProjectDefinition(course: StudioCourse, unit: StudioUnit): CourseProjectDefinition | undefined {
  const project = unit.lessons.find(lesson => lesson.kind === 'project'); if (!project) return undefined;
  return define({ id: project.id, courseId: course.id, unitId: unit.id, title: project.title, brief: project.objective,
    stages: [stage('transfer', '在新情境中尝试', unit.objective, [
      ['scene', '我的新情境', '描述一个与课程不同但需要同样知识的例子。'], ['work', '我的做法或作品', '保留你的过程，可以分行写步骤。']]),
    stage('explain', '解释理由与依据', '说明每一步为什么可以这样做。', [
      ['reason', '知识与理由', '用自己的话解释用了哪些知识，哪些条件必须成立。'], ['check', '检查与另一种方法', '怎样检查结果？能比较另一种方法或一个反例吗？']]),
    stage('reflect', '核查并准备下一次尝试', '保留不会的部分和需要的帮助。', [
      ['limits', '帮助与不确定的地方', '使用过什么帮助？哪里还不能独立完成？'], ['next', '下一次怎么验证', '设计一个新例子，说明下一次怎样检查。']])],
    rubric: [
      { id: 'work', title: '过程与作品', levels: ['还未形成过程', '有部分尝试', '过程完整，条件清楚', '比较方法并检查适用条件'] },
      { id: 'reason', title: '理由与核查', levels: ['还未说明理由', '有理由但依据不清', '知识与步骤对应，有检查', '用反例或另一种方法验证'] },
      { id: 'reflection', title: '帮助与下一步', levels: ['还未记录', '知道哪里需要帮助', '明确帮助和下一次尝试', '提出能检验独立完成的新情境'] },
    ] });
}

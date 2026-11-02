import { textbookTeachingContentSchema, textbookTeachingPublicBaseSchema, type ClassroomLesson, type ClassroomStep,
  type TextbookTeachingPublicBase, type TextbookTeachingPublicSnapshot } from '@study-agent/contracts';
import { teachingHash, type PreparedTextbookTeaching } from './textbook-teaching-package';

/** Construct a public packet by allowlist. Private answer fingerprints, original
 * quotations, source pages, editorial review and commands never enter its hash. */
export function teachingPublicBase(packageId: string, contentVersion: number, value: Pick<PreparedTextbookTeaching, 'source' | 'body'>): TextbookTeachingPublicBase {
  const { source, body } = value, content = textbookTeachingContentSchema.parse(body.content);
  return textbookTeachingPublicBaseSchema.parse({ protocol: 'textbook-teaching-public-v1', packageId, contentVersion,
    source: { bookId: source.bookId, bookVersion: source.bookVersion, lessonId: source.lessonId, sourceBookId: source.sourceBookId,
      sourceSha256: source.sourceSha256, extractedSha256: source.extractedSha256, lessonFingerprint: source.lessonFingerprint,
      pageStart: source.pageStart, pageEnd: source.pageEnd, bookTitle: source.bookTitle, edition: source.edition, lessonName: source.lessonName,
      subject: source.subject, grade: source.grade, term: source.term },
    targets: body.targets.map(target => ({ ...structuredClone(target), status: target.status })),
    content: { ...structuredClone(content), citations: content.citations.map(({ page, usedFor }) => ({ page, usedFor })),
      checks: content.checks.map(check => ({ id: check.id, atomId: check.atomId, purpose: check.purpose, instructions: check.instructions,
        materials: check.materials.map(({ measurementId, version, questionId, questionVersion }) => ({ measurementId, version, questionId, questionVersion })) })) },
  });
}
export const teachingPublicFingerprint = (value: TextbookTeachingPublicBase) => teachingHash(textbookTeachingPublicBaseSchema.parse(value));

export type TeachingClassroomLocation = { courseId: string; lessonId: string; studentId: string; verificationHref: string };
function localHref(value: string) {
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value) || new URL(value, 'https://study.invalid').origin !== 'https://study.invalid') throw Error('teaching_public_local_href_required');
  return value;
}

/** Projection uses the original classroom's blocks/phases; materials continue
 * through its separate native practice route, never copied into choice questions. */
export function teachingClassroomSnapshot(raw: TextbookTeachingPublicBase, location: TeachingClassroomLocation): TextbookTeachingPublicSnapshot {
  const base = textbookTeachingPublicBaseSchema.parse(raw), content = base.content;
  for (const id of [location.courseId, location.lessonId, location.studentId]) if (!id || id.length > 180 || id !== id.trim() || /[\x00-\x1f]/.test(id)) throw Error('teaching_public_classroom_identity_required');
  const returnHref = '/studio?' + new URLSearchParams({ view: 'courses', course: location.courseId, student: location.studentId, subject: base.source.subject }),
    steps: ClassroomStep[] = [], prefix = location.lessonId + ':teaching';
  const add = (suffix: string, phase: ClassroomStep['phase'], title: string, narration: string, points: string[] = []) => {
    const id = prefix + ':' + suffix, step: ClassroomStep = { id, title, phase, narration,
      durationMs: Math.max(8000, Math.min(120000, [...narration].length * 220)),
      blocks: [{ id: id + ':title', kind: 'heading', text: title }, { id: id + ':text', kind: 'text', text: narration },
        ...(points.length ? [{ id: id + ':points', kind: 'points' as const, text: '', items: [...points] }] : [])] };
    steps.push(step); return step;
  };
  add('goals', 'orient', '本课目标与成功标准', content.goals.map(goal => goal.objective + '\n成功标准：' + goal.successCriterion).join('\n\n'));
  if (content.prerequisites.length) add('prerequisites', 'orient', '先修回顾', content.prerequisites.map(item => item.rationale).join('\n\n'));
  add('activation', 'orient', '先观察，再联系', content.activation.prompt + '\n观察线索：' + content.activation.expectedObservation + '\n联系：' + content.activation.bridge);
  add('concept', 'concept', content.title, content.concept.explanation, content.concept.points);
  add('example-context', 'example', '例题情境', content.example.situation);
  content.example.steps.forEach((item, index) => add('example-' + index, 'example', '例题 · 第' + (index + 1) + '步', item.explanation, item.board));
  add('example-conclusion', 'example', '例题结论', content.example.conclusion);
  content.visuals.forEach((visual, index) => {
    if (visual.kind === 'not_applicable') { add('visual-' + index, 'concept', '表征选择与依据', visual.rationale); return; }
    const title = visual.kind === 'diagram' ? visual.diagram.title : visual.kind === 'math' ? visual.figure.title : visual.kind === 'experiment' ? visual.experiment.title : visual.title,
      narration = visual.kind === 'experiment' ? [visual.experiment.prediction.question, visual.experiment.observation, visual.experiment.explanation, '模型限制：' + visual.experiment.limitation].join('\n') : visual.explanation,
      step = add('visual-' + index, 'concept', title, narration);
    if (visual.kind === 'diagram') step.blocks.push({ id: step.id + ':figure', kind: 'diagram', text: visual.explanation, diagram: structuredClone(visual.diagram) });
    if (visual.kind === 'math') step.blocks.push({ id: step.id + ':math', kind: 'math', text: visual.explanation, math: structuredClone(visual.figure) });
    if (visual.kind === 'table') step.blocks.push({ id: step.id + ':table', kind: 'table', text: visual.explanation, table: { headers: [...visual.headers], rows: structuredClone(visual.rows) } });
    if (visual.kind === 'experiment') step.blocks.push({ id: step.id + ':experiment', kind: 'experiment', text: '', experiment: structuredClone(visual.experiment) });
  });
  content.misconceptions.forEach((item, index) => add('misconception-' + index, 'contrast', '错因与替代解释 · ' + (index + 1),
    '观察：' + item.observation + '\n替代解释：' + item.alternatives.join('；') + '\n核查：' + item.verification + '\n反馈：' + item.correctiveFeedback));
  const purpose = { understanding: '理解', procedure: '执行', transfer: '迁移', retention: '保持' };
  content.checks.forEach((check, index) => add('check-' + index, 'check', purpose[check.purpose] + '检查 · ' + (base.targets.find(target => target.atomId === check.atomId)?.name ?? check.atomId),
    check.instructions + '\n请使用本课的独立练习入口作答，首次作答和所用帮助会分别记录。'));
  add('transfer', 'transfer', '换一个情境', content.transfer.scenario + '\n任务：' + content.transfer.prompt + '\n策略核对：' + content.transfer.expectedStrategy);
  add('summary', 'transfer', '总结与回顾', content.summary.synthesis, content.summary.takeaways);
  add('retention', 'transfer', '之后再用新题核查', content.retention.instructions + '\n保持安排从最后一次相关教学或帮助起算，分别在第1、3、7、14日到期；这不是已经取得的学习结果。');
  const fingerprint = teachingPublicFingerprint(base), lesson: ClassroomLesson = { id: location.lessonId, lectureId: location.courseId, title: content.title,
    objective: content.goals.map(goal => goal.objective).join('；'), steps, questions: [], verificationHref: localHref(location.verificationHref),
    practiceVersion: 'textbook-teaching-public-v1:' + fingerprint,
    sourceReferences: content.citations.map((citation, index) => ({ sourceKey: base.source.sourceBookId + ':' + citation.page + ':' + index,
      title: base.source.bookTitle + ' · ' + base.source.edition, page: citation.page, quote: '教学依据 · ' + citation.usedFor, href: returnHref,
      locator: 'PDF物理页' + citation.page + '，本课核对范围' + base.source.pageStart + '～' + base.source.pageEnd })) };
  return { ...structuredClone(base), fingerprint, lesson };
}

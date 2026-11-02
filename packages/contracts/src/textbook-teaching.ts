import { z } from 'zod';
import type { ClassroomLesson } from './classroom';
import { classroomMathDraftFigureSchema, classroomMathFigureSchema } from './classroom-math';
import type { QuestionAnswerMode, Question, QuestionDocument, QuestionAnswerSchema, QuestionSourceRecord } from './index';

const key = z.string().min(1).max(180).refine(value => value === value.trim() && !/[\x00-\x1f]/.test(value), '标识不能含首尾空白或控制字符');
const hash = z.string().regex(/^[a-f0-9]{64}$/), positive = z.number().int().min(1), revision = z.number().int().min(0);
const subject = z.enum(['math', 'chinese', 'english', 'chemistry']), term = z.enum(['upper', 'lower', 'both']);
/** Validate without transforming author text: command replay keeps the complete original strings. */
const text = (maximum: number, minimum = 1) => z.string().max(maximum).refine(value => value.trim().length >= minimum, `至少填写${minimum}个非首尾空白字符`)
  .refine(value => ![...value].some(char => { const point = char.codePointAt(0)!; return point >= 0xd800 && point <= 0xdfff; }), '文字包含不完整的Unicode字符');
const sourceDescriptorShape = {
  bookId: key, bookVersion: key, lessonId: key, sourceBookId: key, sourceSha256: hash, extractedSha256: hash, lessonFingerprint: hash,
  /** Legacy snapshots stay readable; new exact-version writes require this
   * current independent whole-book conformity identity at the I/O boundary. */
  editionProofFingerprint: hash.optional(),
  pageStart: positive.max(10000), pageEnd: positive.max(10000),
};
export const textbookTeachingSourceDescriptorSchema = z.object(sourceDescriptorShape).strict().refine(value => value.pageEnd >= value.pageStart && value.pageEnd - value.pageStart < 40, '请选择连续且不超过40页的完整课时范围');
export const textbookTeachingSourceSnapshotSchema = z.object({ ...sourceDescriptorShape,
  protocol: z.literal('textbook-teaching-source-v1'), bookTitle: text(250), edition: text(250), lessonName: text(250),
  subject, grade: positive.max(9), term: z.enum(['upper', 'lower']), sourcePages: positive.max(10000), fingerprint: hash,
  pages: z.array(z.object({ page: positive.max(10000), text: text(400000, 0), textCharacters: revision, textSha256: hash }).strict()).min(1).max(40),
}).strict().superRefine((value, context) => {
  if (value.pageEnd < value.pageStart || value.pageEnd > value.sourcePages || value.pages.length !== value.pageEnd - value.pageStart + 1)
    context.addIssue({ code: 'custom', path: ['pages'], message: '来源必须保留选定范围的每个完整物理页' });
  let characters = 0;
  value.pages.forEach((page, index) => { const length = [...page.text].length; characters += length;
    if (page.page !== value.pageStart + index || page.textCharacters !== length) context.addIssue({ code: 'custom', path: ['pages', index], message: '来源页码或完整字符数不一致' }); });
  if (characters > 200000) context.addIssue({ code: 'custom', path: ['pages'], message: '所选正文超过20万字符预算，请调整范围；不会截取正文' });
});
export type TextbookTeachingSourceDescriptor = z.infer<typeof textbookTeachingSourceDescriptorSchema>;
export type TextbookTeachingSourceSnapshot = z.infer<typeof textbookTeachingSourceSnapshotSchema>;

export const textbookTeachingTargetRefSchema = z.object({ atomId: key, version: positive, definitionFingerprint: hash }).strict();
export const textbookTeachingTargetSnapshotSchema = textbookTeachingTargetRefSchema.extend({ name: text(120), subject, grade: positive.max(9), term, strand: text(200, 0), curriculumVersion: key,
  objective: text(1000, 5), successCriterion: text(1000, 5), prerequisiteIds: z.array(key).max(30), status: z.enum(['draft', 'published', 'retired']) }).strict();
export type TextbookTeachingTargetRef = z.infer<typeof textbookTeachingTargetRefSchema>;
export type TextbookTeachingTargetSnapshot = z.infer<typeof textbookTeachingTargetSnapshotSchema>;

export const textbookTeachingMaterialRefSchema = z.object({ measurementId: key, version: positive, questionId: key, questionVersion: positive,
  definitionFingerprint: hash, contentFingerprint: hash }).strict();
const publicMaterialRefSchema = textbookTeachingMaterialRefSchema.omit({ definitionFingerprint: true, contentFingerprint: true });
export const textbookTeachingMaterialSnapshotSchema = textbookTeachingMaterialRefSchema.extend({ atomId: key, family: key, familyKey: key, familyIdentityVersion: key,
  dimension: z.enum(['understanding', 'procedure', 'transfer', 'retention']), probeRole: z.enum(['anchor', 'prerequisite', 'contrast', 'transfer', 'retention']), expectedSeconds: z.number().int().min(1).max(3600) }).strict();
export type TextbookTeachingMaterialRef = z.infer<typeof textbookTeachingMaterialRefSchema>;
export type TextbookTeachingMaterialSnapshot = z.infer<typeof textbookTeachingMaterialSnapshotSchema>;
export type TextbookTeachingMaterialOption = { reference: TextbookTeachingMaterialRef; atomId: string; family: string; familyKey: string; familyIdentityVersion: string;
  dimension: TextbookTeachingMaterialSnapshot['dimension']; probeRole: TextbookTeachingMaterialSnapshot['probeRole']; expectedSeconds: number;
  stem: string; answerMode: QuestionAnswerMode };
export type TextbookTeachingMaterialCatalog = { atom: TextbookTeachingTargetSnapshot; page: number; pageSize: number; total: number; items: TextbookTeachingMaterialOption[] };

const purpose = z.enum(['understanding', 'procedure', 'transfer', 'retention']);
const citationUse = z.enum(['activation', 'concept', 'example', 'visual', 'misconception', 'check', 'transfer', 'summary', 'retention']);
function visualSchema(complete: boolean) {
 const t = (maximum: number, minimum = 1) => text(maximum, complete ? minimum : 0);
 const diagram = z.object({ kind: z.enum(['venn', 'flow', 'bars', 'network']), title: t(160), labels: z.array(t(120)).min(2).max(16),
  values: z.array(z.number().finite()).max(16).optional(), captions: z.array(t(200)).max(16).optional() }).strict();
 return z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('diagram'), diagram, explanation: t(1500, 10) }).strict(),
  z.object({ kind: z.literal('table'), title: t(160), headers: z.array(t(200)).min(1).max(8), rows: z.array(z.array(t(1000)).min(1).max(8)).min(1).max(40), explanation: t(1500, 10) }).strict(),
  z.object({ kind: z.literal('math'), figure: complete ? classroomMathFigureSchema : classroomMathDraftFigureSchema, explanation: t(1500, 10) }).strict(),
  z.object({ kind: z.literal('experiment'), experiment: z.object({ kind: z.enum(['particle-change', 'air-mixture', 'catalysis', 'atom-ion', 'filtration', 'water-electrolysis', 'mass-conservation', 'balance-water', 'co2-test', 'combustion']),
    title: t(160), prediction: z.object({ question: t(1000), options: z.array(t(300)).min(2).max(4) }).strict(), observation: t(1500, 10), explanation: t(2000, 10), limitation: t(1500, 20) }).strict() }).strict(),
  z.object({ kind: z.literal('not_applicable'), rationale: t(1500, 20) }).strict(),
]);
}
const checkShape = { id: key, atomId: key, purpose, instructions: text(2000, 0), materials: z.array(textbookTeachingMaterialRefSchema).max(40) };
function contentShape(complete: boolean) {
  const t = (maximum: number, minimum = 1) => text(maximum, complete ? minimum : 0), list = <T extends z.ZodType>(item: T, minimum: number, maximum: number) => z.array(item).min(complete ? minimum : 0).max(maximum);
  return {
    title: t(180), goals: list(z.object({ id: key, atomId: key, objective: t(1000, 5), successCriterion: t(1000, 5) }).strict(), 1, 8),
    prerequisites: z.array(z.object({ atomId: key, rationale: t(1000, 10) }).strict()).max(20),
    activation: z.object({ prompt: t(1500, 10), expectedObservation: t(1500, 10), bridge: t(1500, 10) }).strict(),
    concept: z.object({ explanation: t(8000, 20), points: list(t(400), 1, 12) }).strict(),
    example: z.object({ situation: t(2500, 10), steps: list(z.object({ explanation: t(1500, 10), board: list(t(300), 1, 8) }).strict(), 2, 12), conclusion: t(1500, 10) }).strict(),
    visuals: list(visualSchema(complete), 1, 4),
    misconceptions: list(z.object({ observation: t(800, 10), alternatives: list(t(800, 10), 1, 5), verification: t(1800, 10), correctiveFeedback: t(1800, 10) }).strict(), 1, 8),
    checks: list(z.object({ ...checkShape, instructions: t(2000, 10) }).strict(), 4, 32),
    transfer: z.object({ scenario: t(2000, 10), prompt: t(2000, 10), expectedStrategy: t(2000, 10) }).strict(),
    summary: z.object({ synthesis: t(2000, 10), takeaways: list(t(400), 2, 8) }).strict(),
    retention: z.object({ intervalDays: z.tuple([z.literal(1), z.literal(3), z.literal(7), z.literal(14)]), anchor: z.literal('last_relevant_teaching_or_help'), instructions: t(2000, 20) }).strict(),
    citations: list(z.object({ page: positive.max(10000), quote: t(500, 8), usedFor: citationUse }).strict(), 1, 40),
  };
}
type CrossContent = { goals: Array<{ id: string; atomId: string }>; checks: Array<{ id: string; atomId: string; purpose: string }> };
function uniqueContent(value: CrossContent, context: z.RefinementCtx, complete: boolean) {
  const unique = (values: string[], field: string) => { if (new Set(values).size !== values.length) context.addIssue({ code: 'custom', path: [field], message: '条目标识或目标检查组不能重复' }); };
  unique(value.goals.map(goal => goal.id), 'goals'); unique(value.checks.map(check => check.id), 'checks'); unique(value.checks.map(check => JSON.stringify([check.atomId, check.purpose])), 'checks');
  if (complete) {
    const atoms = new Set(value.goals.map(goal => goal.atomId));
    for (const atomId of atoms) for (const purpose of ['understanding', 'procedure', 'transfer', 'retention']) if (!value.checks.some(check => check.atomId === atomId && check.purpose === purpose)) context.addIssue({ code: 'custom', path: ['checks'], message: '每个教学目标都需要理解、执行、迁移与保持检查安排' });
    if (value.checks.some(check => !atoms.has(check.atomId))) context.addIssue({ code: 'custom', path: ['checks'], message: '检查组必须对应本包教学目标' });
  }
}
const fullShape = contentShape(true);
export const textbookTeachingDraftVisualSchema = visualSchema(false);
export const textbookTeachingDraftContentSchema = z.object(contentShape(false)).strict().superRefine((value, context) => uniqueContent(value, context, false));
export const textbookTeachingContentSchema = z.object(fullShape).strict().superRefine((value, context) => uniqueContent(value, context, true));
/** Public references deliberately omit hashes of low-entropy private answer packets and source quotations. */
export const textbookTeachingPublicContentSchema = z.object({ ...fullShape,
  checks: z.array(z.object({ ...checkShape, instructions: text(2000, 10), materials: z.array(publicMaterialRefSchema).max(40) }).strict()).min(4).max(32),
  citations: z.array(z.object({ page: positive.max(10000), usedFor: citationUse }).strict()).min(1).max(40),
}).strict().superRefine((value, context) => uniqueContent(value, context, true));
export type TextbookTeachingDraftContent = z.infer<typeof textbookTeachingDraftContentSchema>;
export type TextbookTeachingContent = z.infer<typeof textbookTeachingContentSchema>;
export type TextbookTeachingPublicContent = z.infer<typeof textbookTeachingPublicContentSchema>;

const commandBase = { packageId: key, requestKey: key.refine(value => value.length >= 8, '请求标识至少8字符'), expectedRevision: revision };
export const textbookTeachingSourceReviewSchema = z.object({ confirmedRange: z.boolean(), statement: text(2000, 0),
  pages: z.array(z.object({ page: positive.max(10000), visualChecked: z.boolean(), statement: text(1000, 0) }).strict()).max(40) }).strict();
export const textbookTeachingRevisionBaseSchema = z.object({ contentVersion: positive.max(1000), contentFingerprint: hash }).strict().nullable();
export const textbookTeachingSaveSchema = z.object({ ...commandBase, action: z.literal('save'), source: textbookTeachingSourceDescriptorSchema, sourceFingerprint: hash,
  basedOn: textbookTeachingRevisionBaseSchema, targetRefs: z.array(textbookTeachingTargetRefSchema).min(1).max(8), sourceReview: textbookTeachingSourceReviewSchema, content: textbookTeachingDraftContentSchema }).strict();
export const textbookTeachingPublishSchema = z.object({ ...commandBase, action: z.literal('publish'), contentVersion: positive, contentFingerprint: hash, preflightFingerprint: hash,
  reviewed: z.literal(true), originalTeaching: z.literal(true), reason: text(2000, 20) }).strict();
export const textbookTeachingWithdrawSchema = z.object({ ...commandBase, action: z.literal('withdraw'), contentVersion: positive, contentFingerprint: hash, reason: text(2000, 10) }).strict();
export const textbookTeachingCommandSchema = z.discriminatedUnion('action', [textbookTeachingSaveSchema, textbookTeachingPublishSchema, textbookTeachingWithdrawSchema]);
export type TextbookTeachingSave = z.infer<typeof textbookTeachingSaveSchema>;
export type TextbookTeachingCommand = z.infer<typeof textbookTeachingCommandSchema>;

export type TextbookTeachingGap = { code: string; path: string; message: string };
export const textbookTeachingPreflightSchema = z.object({ protocol: z.literal('textbook-teaching-preflight-v1'), fingerprint: hash, contentFingerprint: hash, sourceFingerprint: hash,
  rules: z.object({ diagnosis: key, familyIdentity: key, materialCoverage: key }).strict(),
  publishable: z.boolean(), gaps: z.array(z.object({ code: key, path: text(250), message: text(2000) }).strict()).max(2000),
  targets: z.array(textbookTeachingTargetSnapshotSchema).min(1).max(8), prerequisites: z.array(textbookTeachingTargetSnapshotSchema).max(20),
  materials: z.array(textbookTeachingMaterialSnapshotSchema).max(1280), coverage: z.array(z.object({ atomId: key, ready: z.boolean(), families: revision,
    gaps: z.array(text(2000)).max(20), retentionStock: z.array(z.object({ intervalDays: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(14)]), ready: z.boolean(), questions: revision.max(4), measurementIds: z.array(key).max(4) }).strict()).length(4),
  }).strict()).min(1).max(8),
}).strict();
export type TextbookTeachingPreflight = z.infer<typeof textbookTeachingPreflightSchema>;
export const textbookTeachingPublicBaseSchema = z.object({ protocol: z.literal('textbook-teaching-public-v1'), packageId: key, contentVersion: positive,
  source: z.object({ ...sourceDescriptorShape, bookTitle: text(250), edition: text(250), lessonName: text(250), subject, grade: positive.max(9), term: z.enum(['upper', 'lower']) }).strict(),
  targets: z.array(textbookTeachingTargetSnapshotSchema.extend({ status: z.literal('published') }).strict()).min(1).max(8), content: textbookTeachingPublicContentSchema,
}).strict();
export type TextbookTeachingPublicBase = z.infer<typeof textbookTeachingPublicBaseSchema>;
export type TextbookTeachingPublicSnapshot = TextbookTeachingPublicBase & { fingerprint: string; lesson: ClassroomLesson };

/** This origin is public. The separately retained grading packets never enter
 * a course fingerprint, classroom packet, blueprint view or portable export. */
export const textbookTeachingPracticeOriginSchema = z.object({ protocol: z.literal('textbook-teaching-practice-v1'), courseId: key, lessonId: key,
  packageId: key, contentVersion: positive.max(1000), fingerprint: hash }).strict();
export type TextbookTeachingPracticeOrigin = z.infer<typeof textbookTeachingPracticeOriginSchema>;
export type TextbookTeachingQuestionPacket = { question: Question; document: QuestionDocument | null; answerSchema: QuestionAnswerSchema; source: QuestionSourceRecord };

/** Original course creation selects exact public releases. Private grading
 * fingerprints are resolved from the server's immutable published originals. */
export const textbookTeachingCourseSelectionSchema = z.object({ bookId: key, bookVersion: key,
  lessons: z.array(z.object({ lessonId: key, packageId: key, contentVersion: positive.max(1000), fingerprint: hash }).strict()).min(1).max(1000),
}).strict().superRefine((value, context) => {
  if (new Set(value.lessons.map(lesson => lesson.lessonId)).size !== value.lessons.length) context.addIssue({ code: 'custom', path: ['lessons'], message: '每个教材课时只能明确采用一个准确发布稿' });
});
export type TextbookTeachingCourseSelection = z.infer<typeof textbookTeachingCourseSelectionSchema>;
export const textbookTeachingCourseDraftSchema = z.object({ studentId: key, subject,
  title: text(180, 3).optional(), objective: text(1000, 5).optional(), minutesPerSession: z.number().int().min(5).max(60).optional(),
  teachingSelection: textbookTeachingCourseSelectionSchema,
}).strict();
export const textbookTeachingCourseCreateSchema = textbookTeachingCourseDraftSchema.extend({ previewFingerprint: hash, requestKey: key.refine(value => value.length >= 8) }).strict();
export type TextbookTeachingCourseDraft = z.infer<typeof textbookTeachingCourseDraftSchema>;
export type TextbookTeachingCourseCreate = z.infer<typeof textbookTeachingCourseCreateSchema>;
export type TextbookTeachingCourseOptions = { protocol: 'textbook-teaching-course-options-v1'; studentId: string; subject: TextbookTeachingPublicBase['source']['subject'];
  scopeVersion: number; bookId: string; bookVersion: string; title: string; edition: string; page: number; pageSize: number; total: number;
  lessons: Array<{ lessonId: string; lessonName: string; chapterName: string; mappingVersion: number | null; gaps: string[];
    packages: Array<{ packageId: string; contentVersion: number; fingerprint: string; title: string; targets: Array<{ atomId: string; name: string }> }> }>; notice: string };

const recordVersion = positive.max(1000), recordTime = z.string().datetime(), publication = z.object({ contentVersion: recordVersion, fingerprint: hash }).strict(),
  packageStatus = z.enum(['draft', 'published', 'withdrawn']);
/** Editor-only responses; none of these private receipts are student packets. */
export const textbookTeachingHeaderSchema = z.object({ protocol: z.literal('textbook-teaching-package-record-v1'), id: key, actorId: key,
  bookId: key, bookVersion: key, lessonId: key, revision: recordVersion, contentVersion: recordVersion, status: packageStatus, published: publication.nullable(),
  createdAt: recordTime, updatedAt: recordTime, lastCommandId: key }).strict();
export type TextbookTeachingPackageHeader = z.infer<typeof textbookTeachingHeaderSchema>;
export const textbookTeachingResultSchema = z.object({ protocol: z.literal('textbook-teaching-result-v1'), packageId: key, action: z.enum(['save', 'publish', 'withdraw']),
  revision: recordVersion, contentVersion: recordVersion, affectedVersion: recordVersion, contentFingerprint: hash, status: packageStatus, published: publication.nullable(), at: recordTime }).strict();
export type TextbookTeachingResult = z.infer<typeof textbookTeachingResultSchema>;
export type TextbookTeachingEditorDetail = { header: TextbookTeachingPackageHeader; source: TextbookTeachingSourceSnapshot;
  version: { protocol: 'textbook-teaching-version-record-v1'; id: string; actorId: string; packageId: string; contentVersion: number;
    basedOn: z.infer<typeof textbookTeachingRevisionBaseSchema>; sourceId: string; createdAt: string; commandId: string;
    body: { sourceFingerprint: string; sourceReview: TextbookTeachingSave['sourceReview']; content: TextbookTeachingDraftContent;
      targets: TextbookTeachingTargetSnapshot[]; prerequisites: TextbookTeachingTargetSnapshot[]; materials: TextbookTeachingMaterialSnapshot[] };
    report: TextbookTeachingPreflight };
  savedBy: { input: TextbookTeachingSave; result: TextbookTeachingResult };
  availability: { available: boolean; code: 'available' | 'draft' | 'withdrawn' | 'author_unavailable' | 'restore_confirmation_required' | 'source_or_material_changed'; message: string };
};

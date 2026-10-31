import { z } from 'zod';

export const paperSelectionIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
export const paperSelectionHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const paperSelectionTimeSchema = z.string().refine(value => {
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}, '时间必须是准确的UTC时刻');
export const paperSelectionRequestKeySchema = z.string().min(8).max(128);
const validText = (value: string) => {
  for (const character of value) {
    const point = character.codePointAt(0)!;
    if (point < 32 && ![9, 10, 13].includes(point) || point >= 0xd800 && point <= 0xdfff || [0xfffe, 0xffff].includes(point)) return false;
  }
  return Boolean(value.trim());
};
export const paperSelectionTitleSchema = z.string().max(180).refine(validText, '请填写有效标题');
export const paperSelectionScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('private_preparation'), studentId: z.null() }).strict(),
  z.object({ kind: z.literal('student_self'), studentId: paperSelectionIdSchema }).strict(),
]);
export type PaperSelectionScope = z.infer<typeof paperSelectionScopeSchema>;
// Library display UUIDs omit this namespace. Measurement provenance and
// retained paper-practice records use the complete catalog question_key.
export const paperSelectionOriginalQuestionIdSchema = paperSelectionIdSchema.refine(value => value.startsWith('paper:') && value.length > 6, '请使用准确的原卷题目键');

export const paperSelectionSourceIdentitySchema = z.object({
  paperId: paperSelectionIdSchema,
  position: z.number().int().min(1).max(100000),
  sourceQuestionId: paperSelectionOriginalQuestionIdSchema,
  detailSha256: paperSelectionHashSchema,
  publicationVersion: z.number().int().positive().nullable(),
}).strict();
export type PaperSelectionSourceIdentity = z.infer<typeof paperSelectionSourceIdentitySchema>;
export const paperSelectionSourceSchema = paperSelectionSourceIdentitySchema.extend({
  title: z.string().max(2000).refine(validText),
  originalPage: z.number().int().positive().max(100000).nullable(),
}).strict();
export type PaperSelectionSource = z.infer<typeof paperSelectionSourceSchema>;
export const paperSelectionItemSchema = z.object({
  id: paperSelectionIdSchema, source: paperSelectionSourceSchema, research: z.boolean(),
}).strict();
export type PaperSelectionItem = z.infer<typeof paperSelectionItemSchema>;
export const paperSelectionSourceKey = (value: PaperSelectionSourceIdentity) => JSON.stringify([value.paperId, value.position, value.sourceQuestionId]);

const selectedSources = z.array(paperSelectionSourceIdentitySchema).max(100).superRefine((items, context) => {
  if (new Set(items.map(paperSelectionSourceKey)).size !== items.length) context.addIssue({ code: 'custom', message: '同一原题位只能保留一份' });
  if (new Set(items.map(item => item.paperId)).size > 10) context.addIssue({ code: 'custom', message: '一份清单最多十份原卷' });
  if (items.some(item => items.some(other => other.paperId === item.paperId && (other.detailSha256 !== item.detailSha256 || other.publicationVersion !== item.publicationVersion))))
    context.addIssue({ code: 'custom', message: '同一原卷请使用同一版本的题位' });
});
export const paperSelectionCommandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create'), requestKey: paperSelectionRequestKeySchema, scope: paperSelectionScopeSchema,
    title: paperSelectionTitleSchema, items: selectedSources }).strict(),
  z.object({ kind: z.literal('revise'), requestKey: paperSelectionRequestKeySchema, listId: paperSelectionIdSchema,
    expectedRevision: z.number().int().positive().max(1000), expectedFingerprint: paperSelectionHashSchema,
    title: paperSelectionTitleSchema, items: selectedSources }).strict(),
]);
export type PaperSelectionCommand = z.infer<typeof paperSelectionCommandSchema>;
export const paperSelectionResultSchema = z.object({
  listId: paperSelectionIdSchema, revision: z.number().int().positive().max(1000),
  fingerprint: paperSelectionHashSchema, at: paperSelectionTimeSchema,
}).strict();
export type PaperSelectionResult = z.infer<typeof paperSelectionResultSchema>;
export const paperSelectionSnapshotSchema = z.object({ title: paperSelectionTitleSchema, items: z.array(paperSelectionItemSchema).max(100) }).strict();
export type PaperSelectionSnapshot = z.infer<typeof paperSelectionSnapshotSchema>;

export type PaperSelectionAvailability = { available: boolean; reason: string };
export type PaperSelectionListView = {
  id: string; scope: PaperSelectionScope; revision: number; fingerprint: string; createdAt: string; updatedAt: string;
  title: string; items: Array<PaperSelectionItem & { availability: PaperSelectionAvailability }>;
};

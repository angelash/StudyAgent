import { z } from 'zod';
import { paperSelectionIdSchema as id, paperSelectionHashSchema as hash, paperSelectionTimeSchema as time,
  paperSelectionScopeSchema, paperSelectionSourceSchema, paperSelectionSourceIdentitySchema, paperSelectionSourceKey,
  paperSelectionCommandSchema, paperSelectionResultSchema } from './paper-selection';
import { paperExportBookSchema, paperExportFormatSchema, paperExportCommandSchema, paperExportResultSchema } from './paper-export';

export const paperLibraryCopyOwnerSchema = z.object({ actorId: id, role: z.enum(['parent', 'teacher', 'operator', 'admin', 'student']), scope: paperSelectionScopeSchema }).strict()
  .superRefine((owner, context) => { if ((owner.role === 'student') !== (owner.scope.kind === 'student_self')) context.addIssue({ code: 'custom', message: '请使用准确的本人备课或学生学习身份' }); });
export type PaperLibraryCopyOwner = z.infer<typeof paperLibraryCopyOwnerSchema>;
export const paperLibraryDraftSlotSchema = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
const originals = z.array(paperSelectionSourceSchema).max(100).superRefine((items, context) => {
  if (new Set(items.map(paperSelectionSourceKey)).size !== items.length || new Set(items.map(row => row.paperId)).size > 10 ||
      items.some(row => items.some(other => row.paperId === other.paperId && (row.detailSha256 !== other.detailSha256 || row.publicationVersion !== other.publicationVersion))))
    context.addIssue({ code: 'custom', message: '请保留唯一准确题位，并核对同卷的原版本' });
});
export const paperLibraryBaselineSchema = z.object({ identity: paperSelectionResultSchema, title: z.string().max(180), items: originals }).strict();
const phase = z.enum(['prepared', 'unknown', 'received', 'rejected']);
export const paperLibraryJournalSchema = z.discriminatedUnion('family', [
  z.object({ family: z.literal('selection'), input: paperSelectionCommandSchema, requestFingerprint: hash, phase,
    result: paperSelectionResultSchema.nullable(), message: z.string().max(4000) }).strict(),
  z.object({ family: z.literal('export'), input: paperExportCommandSchema, requestFingerprint: hash, phase,
    result: paperExportResultSchema.nullable(), message: z.string().max(4000) }).strict(),
]).superRefine((entry, context) => {
  if ((entry.phase === 'received') !== (entry.result !== null)) context.addIssue({ code: 'custom', message: '原请求的回执与待核对状态不一致' });
});
export type PaperLibraryJournal = z.infer<typeof paperLibraryJournalSchema>;

/** All editable strings remain raw. Business validity is checked only when a
 * new immutable command is explicitly prepared. Copy receipts grant no rights. */
export const paperLibraryCompleteCopySchema = z.object({
  protocol: z.literal('paper-library-complete-copy-v1'), owner: paperLibraryCopyOwnerSchema, slot: paperLibraryDraftSlotSchema,
  title: z.string().max(180), items: originals, baseline: paperLibraryBaselineSchema.nullable(),
  exportSettings: z.object({ title: z.string().max(180), answerLines: z.string().max(32), breakBetweenQuestions: z.boolean(),
    books: z.array(paperExportBookSchema).max(2), formats: z.array(paperExportFormatSchema).max(2) }).strict(),
  editor: z.object({ pane: z.enum(['selection', 'exports']), listPage: z.number().int().min(1).max(10000), exportPage: z.number().int().min(1).max(10000),
    exportId: id.nullable() }).strict(),
  journal: z.array(paperLibraryJournalSchema).max(100), requiresOriginalResultLookup: z.literal(true), fingerprint: hash,
}).strict().superRefine((copy, context) => {
  if (new Set(copy.exportSettings.books).size !== copy.exportSettings.books.length || new Set(copy.exportSettings.formats).size !== copy.exportSettings.formats.length ||
      new Set(copy.journal.map(entry => JSON.stringify([entry.family, entry.input.requestKey]))).size !== copy.journal.length)
    context.addIssue({ code: 'custom', message: '副本中的选项或原请求重复，未覆盖当前草稿' });
  for (const entry of copy.journal) {
    if (entry.family === 'selection' && entry.input.kind === 'create' && JSON.stringify(entry.input.scope) !== JSON.stringify(copy.owner.scope))
      context.addIssue({ code: 'custom', message: '原创建请求不属于这个准确范围' });
  }
});
export type PaperLibraryCompleteCopy = z.infer<typeof paperLibraryCompleteCopySchema>;
export type PaperLibraryDraftBody = Omit<PaperLibraryCompleteCopy, 'fingerprint'>;
export const paperLibrarySourceIdentity = (source: z.infer<typeof paperSelectionSourceSchema>) => paperSelectionSourceIdentitySchema.parse({ paperId: source.paperId,
  position: source.position, sourceQuestionId: source.sourceQuestionId, detailSha256: source.detailSha256, publicationVersion: source.publicationVersion });

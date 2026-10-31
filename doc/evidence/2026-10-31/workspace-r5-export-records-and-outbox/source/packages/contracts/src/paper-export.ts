import { z } from 'zod';
import {
  paperSelectionIdSchema as id, paperSelectionHashSchema as hash, paperSelectionTimeSchema as time,
  paperSelectionRequestKeySchema, paperSelectionTitleSchema, paperSelectionSourceSchema,
} from './paper-selection';

export const paperExportBookSchema = z.enum(['practice', 'answers']);
export const paperExportFormatSchema = z.enum(['pdf', 'docx']);
export type PaperExportBook = z.infer<typeof paperExportBookSchema>;
export type PaperExportFormat = z.infer<typeof paperExportFormatSchema>;
export const paperExportLayoutSchema = z.object({ answerLines: z.number().int().min(0).max(12), breakBetweenQuestions: z.boolean() }).strict();
const unique = <T>(values: T[]) => new Set(values).size === values.length;
const books = z.array(paperExportBookSchema).min(1).max(2).refine(unique);
const formats = z.array(paperExportFormatSchema).min(1).max(2).refine(unique);
export const paperExportCommandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create'), requestKey: paperSelectionRequestKeySchema, listId: id,
    listRevision: z.number().int().min(1).max(1000), listFingerprint: hash, title: paperSelectionTitleSchema,
    layout: paperExportLayoutSchema, books, formats }).strict(),
  ...(['cancel', 'retry'] as const).map(kind => z.object({ kind: z.literal(kind), requestKey: paperSelectionRequestKeySchema,
    exportId: id, book: paperExportBookSchema, format: paperExportFormatSchema,
    expectedTaskVersion: z.number().int().positive(), expectedGeneration: z.number().int().positive() }).strict()),
]);
export type PaperExportCommand = z.infer<typeof paperExportCommandSchema>;
const slot = z.object({ book: paperExportBookSchema, format: paperExportFormatSchema, taskId: id, generation: z.literal(1) }).strict();
export const paperExportResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create'), exportId: id, intentFingerprint: hash, slots: z.array(slot).min(1).max(4), at: time }).strict(),
  ...(['cancel', 'retry'] as const).map(kind => z.object({ kind: z.literal(kind), exportId: id, book: paperExportBookSchema,
    format: paperExportFormatSchema, taskId: id, previousVersion: z.number().int().positive(), generation: z.number().int().positive(), at: time }).strict()),
]);
export type PaperExportResult = z.infer<typeof paperExportResultSchema>;

/** This is a frozen renderer input, never an accepted client-authored question.
 * HTML/MathML/font support remains the real per-book Python preflight's job. */
const text = (limit: number, empty = false) => z.string().refine(value => {
  if (!empty && !value.trim() || new TextEncoder().encode(value).byteLength > limit) return false;
  for (const character of value) { const point = character.codePointAt(0)!;
    if (point < 32 && ![9, 10, 13].includes(point) || point >= 0xd800 && point <= 0xdfff || [0xfffe, 0xffff].includes(point)) return false;
  }
  return true;
});
export const paperExportDocumentSourceSchema = paperSelectionSourceSchema.omit({ title: true, originalPage: true, publicationVersion: true }).extend({
  publicationVersion: z.string().regex(/^(research-v1|published-v[1-9][0-9]*)$/), paperTitle: text(128 * 1024),
  pageNumber: z.number().int().positive().max(100000).nullable(),
}).strict();
export const paperExportDocumentMediaSchema = z.object({ path: z.string().regex(/^media\/[a-f0-9]{64}\.png$/), sha256: hash,
  bytes: z.number().int().min(1).max(12 * 1024 * 1024), width: z.number().int().min(1).max(6000), height: z.number().int().min(1).max(6000) }).strict();
export const paperExportDocumentSchema = z.object({
  protocol: z.literal('paper-export-document-v1'), title: paperSelectionTitleSchema, layout: paperExportLayoutSchema,
  items: z.array(z.object({ id, source: paperExportDocumentSourceSchema, promptHtml: text(8 * 1024 * 1024),
    optionHtml: z.array(z.object({ label: text(128 * 1024), html: text(8 * 1024 * 1024, true) }).strict()).max(30),
    reference: z.object({ answerHtml: text(8 * 1024 * 1024, true).nullable(), analysisHtml: text(8 * 1024 * 1024, true).nullable() }).strict().nullable(),
  }).strict()).min(1).max(100), media: z.array(paperExportDocumentMediaSchema).max(500),
}).strict();
export type PaperExportDocument = z.infer<typeof paperExportDocumentSchema>;
export const paperExportMediaSchema = z.object({ id, sourceUrl: text(8192), paperId: id, sha256: hash,
  bytes: z.number().int().min(1).max(12 * 1024 * 1024), mediaType: z.literal('image/png'),
  width: z.number().int().min(1).max(6000), height: z.number().int().min(1).max(6000) }).strict();
export const paperExportSourceMapSchema = z.array(z.object({ itemId: id, number: z.number().int().min(1).max(100),
  source: paperExportDocumentSourceSchema, startPage: z.number().int().min(1).max(120), endPage: z.number().int().min(1).max(120),
  bookmark: z.string().regex(/^PaperItem[0-9]{4}$/), endBookmark: z.string().regex(/^PaperEnd[0-9]{4}$/),
  pdfDestinationName: z.string().regex(/^PaperItem[0-9]{4}$/),
}).strict()).min(1).max(100);
export type PaperExportSourceMap = z.infer<typeof paperExportSourceMapSchema>;

/** A deletion receipt binds only identities of rows which actually existed.
 * No source text, title, raw command, media URL or rendered source map survives. */
export const paperExportErasureProofSchema = z.object({ exportId: id, intentFingerprint: hash, actorFingerprint: hash,
  studentFingerprint: hash.nullable(), tasks: z.array(z.object({ id, payloadHash: hash }).strict()).min(1).max(4),
  files: z.array(z.object({ id, identityFingerprint: hash }).strict()).max(100000),
}).strict().superRefine((value, context) => {
  if (!unique(value.tasks.map(task => task.id)) || !unique(value.files.map(file => file.id))) context.addIssue({ code: 'custom', message: '删除证明中的任务和文件不能重复' });
});
export type PaperExportErasureProof = z.infer<typeof paperExportErasureProofSchema>;

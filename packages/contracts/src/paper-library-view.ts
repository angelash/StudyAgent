import { z } from 'zod';
import { paperSelectionIdSchema as id, paperSelectionHashSchema as hash, paperSelectionTimeSchema as time, paperSelectionTitleSchema,
  paperSelectionScopeSchema, paperSelectionItemSchema, paperSelectionSourceIdentitySchema } from './paper-selection';
import { paperExportBookSchema, paperExportFormatSchema, paperExportLayoutSchema } from './paper-export';

const availability = z.object({ available: z.boolean(), reason: z.string().max(4000) }).strict();
export const paperLibrarySelectionViewSchema = z.object({ id, scope: paperSelectionScopeSchema, revision: z.number().int().min(1).max(1000), fingerprint: hash,
  createdAt: time, updatedAt: time, title: paperSelectionTitleSchema,
  items: z.array(paperSelectionItemSchema.extend({ availability })).max(100) }).strict();
export type PaperLibrarySelectionView = z.infer<typeof paperLibrarySelectionViewSchema>;
export const paperLibraryMetadataSchema = z.object({ paperId: id, title: z.string().min(1).max(2000), detailSha256: hash,
  publicationVersion: z.number().int().positive().nullable(), positions: z.array(paperSelectionSourceIdentitySchema).max(10000), document: z.boolean() }).strict()
  .superRefine((value, context) => { if (value.positions.some(row => row.paperId !== value.paperId || row.detailSha256 !== value.detailSha256 || row.publicationVersion !== value.publicationVersion) ||
      new Set(value.positions.map(row => row.position)).size !== value.positions.length) context.addIssue({ code: 'custom', message: '准确题位目录与原卷身份不一致' }); });
export type PaperLibraryMetadata = z.infer<typeof paperLibraryMetadataSchema>;
const published = z.object({ sha256: hash, bytes: z.number().int().min(1).max(80 * 1024 * 1024), pageCount: z.number().int().min(1).max(120), generation: z.number().int().positive(), publishedAt: time }).strict();
const slot = z.object({ book: paperExportBookSchema, format: paperExportFormatSchema, taskId: id,
  state: z.enum(['queued', 'running', 'retry_wait', 'cancel_requested', 'cancelled', 'succeeded', 'failed']), version: z.number().int().positive(), generation: z.number().int().positive(),
  stage: z.enum(['reserved', 'rendered']).nullable(), errorCode: z.string().regex(/^paper_export_[a-z0-9_]{1,80}$/).nullable(), publication: published.nullable(), downloadUrl: z.string().max(500).nullable() }).strict();
export const paperLibraryExportViewSchema = z.object({ id, scope: paperSelectionScopeSchema, createdAt: time, title: paperSelectionTitleSchema, layout: paperExportLayoutSchema,
  listId: id, listRevision: z.number().int().min(1).max(1000), listFingerprint: hash, intentFingerprint: hash, documentSha256: hash,
  itemCount: z.number().int().min(1).max(100), availability, slots: z.array(slot).min(1).max(4) }).strict().superRefine((value, context) => {
  if (new Set(value.slots.map(row => row.book + '/' + row.format)).size !== value.slots.length) context.addIssue({ code: 'custom', message: '导出册和格式重复' });
  for (const row of value.slots) if (row.downloadUrl !== null && (!value.availability.available || row.state !== 'succeeded' || !row.publication || row.publication.generation !== row.generation ||
      row.downloadUrl !== '/api/library/exports/' + encodeURIComponent(value.id) + '/files/' + row.book + '/' + row.format)) context.addIssue({ code: 'custom', message: '实际产物地址与当前册格式或代次不一致' });
});
export type PaperLibraryExportView = z.infer<typeof paperLibraryExportViewSchema>;
const pageFields = { page: z.number().int().min(1).max(10000), pageSize: z.number().int().min(1).max(30), total: z.number().int().nonnegative() };
export const paperLibrarySelectionDirectorySchema = z.object({ ...pageFields, items: z.array(paperLibrarySelectionViewSchema).max(30) }).strict();
export const paperLibraryExportDirectorySchema = z.object({ ...pageFields, items: z.array(paperLibraryExportViewSchema).max(30) }).strict();
const capability = z.object({ available: z.boolean(), reason: z.string().regex(/^paper_export_[a-z0-9_]{1,80}$/).nullable(),
  items: z.number().int().min(1).max(100).nullable(), media: z.number().int().min(0).max(500).nullable() }).strict();
export const paperLibraryPreflightSchema = z.object({ protocol: z.literal('paper-export-preflight-v1'), inputSha256: hash,
  books: z.object({ practice: capability, answers: capability }).strict(), listId: id, listRevision: z.number().int().min(1).max(1000), listFingerprint: hash, documentSha256: hash }).strict()
  .superRefine((value, context) => { if (value.inputSha256 !== value.documentSha256 || Object.values(value.books).some(row => row.available ? row.reason !== null || row.items === null || row.media === null : row.reason === null || row.items !== null || row.media !== null)) context.addIssue({ code: 'custom', message: '逐册预检结果不完整' }); });
export type PaperLibraryPreflight = z.infer<typeof paperLibraryPreflightSchema>;

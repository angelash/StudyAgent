import { z } from 'zod';
import {
  paperSelectionIdSchema as id, paperSelectionHashSchema as hash, paperSelectionTimeSchema as time,
  paperSelectionRequestKeySchema, paperSelectionSourceSchema,
  paperSelectionOriginalQuestionIdSchema,
} from './paper-selection';

const positions = z.array(z.object({ position: z.number().int().min(1).max(100000), sourceQuestionId: paperSelectionOriginalQuestionIdSchema }).strict()).min(1).max(1000)
  .superRefine((values, context) => {
    if (new Set(values.map(value => value.position)).size !== values.length) context.addIssue({ code: 'custom', message: '原题位不能重复' });
  });
export const paperSourceReadCommandSchema = z.object({
  kind: z.enum(['read', 'selection', 'export']), requestKey: paperSelectionRequestKeySchema,
  paperId: id, detailSha256: hash, publicationVersion: z.number().int().positive(),
  positions: z.union([positions, z.literal('document')]), answers: z.boolean(),
  origin: z.object({ kind: z.enum(['selection_command', 'export_command']), id }).strict().nullable(),
}).strict().superRefine((value, context) => {
  if (value.kind === 'read' && value.origin !== null || value.kind === 'selection' && (value.origin?.kind !== 'selection_command' || value.positions === 'document' || value.answers) ||
      value.kind === 'export' && (value.origin?.kind !== 'export_command' || value.positions === 'document')) context.addIssue({ code: 'custom', message: '来源读取必须绑定准确原操作' });
});
export type PaperSourceReadCommand = z.infer<typeof paperSourceReadCommandSchema>;
export const paperSourceReadResultSchema = z.object({
  exposureId: id, sources: z.array(paperSelectionSourceSchema).max(1000), document: z.boolean(), answers: z.boolean(), at: time,
}).strict();
export type PaperSourceReadResult = z.infer<typeof paperSourceReadResultSchema>;

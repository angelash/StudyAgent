import { z } from 'zod';
import {
  paperSelectionIdSchema as id, paperSelectionHashSchema as hash, paperSelectionTimeSchema as time,
  paperSelectionRequestKeySchema, paperSourceReadCommandSchema, paperSourceReadResultSchema,
  type PaperSourceReadCommand, type PaperSelectionSource,
} from '@study-agent/contracts';
import { retentionDigest as digest } from '../diagnostics/retention-anchor';
import { assertPaperSelectionAuthorization, paperSelectionAuthorizationSchema, type PaperSelectionAuthorization } from './paper-selection-record';

export const paperSourceExposureRecordSchema = z.object({
  protocol: z.literal('paper-source-exposure-record-v1'), id, actorId: id, studentId: id,
  authorization: paperSelectionAuthorizationSchema, requestKey: paperSelectionRequestKeySchema, requestHash: hash,
  input: paperSourceReadCommandSchema, at: time, result: paperSourceReadResultSchema, resultHash: hash,
}).strict();
export type PaperSourceExposureRecord = z.infer<typeof paperSourceExposureRecordSchema>;
export const paperSourceExposureId = (actorId: string, requestKey: string) => 'paper_source_read_' + digest({ actorId, requestKey });
export const paperSelectionExposureKey = (commandId: string, paperId: string) => 'selection:' + digest({ commandId, paperId });
const same = (left: unknown, right: unknown) => digest(left) === digest(right);

export function assertPaperSourceExposure(value: unknown): PaperSourceExposureRecord {
  const row = paperSourceExposureRecordSchema.parse(value), command = row.input;
  assertPaperSelectionAuthorization({ kind: 'student_self', studentId: row.studentId }, row.authorization);
  if (!same(row, value) || row.id !== paperSourceExposureId(row.actorId, row.requestKey) || command.requestKey !== row.requestKey ||
      row.requestHash !== digest({ actorId: row.actorId, studentId: row.studentId, input: command }) || row.resultHash !== digest(row.result) ||
      row.at !== row.result.at || row.id !== row.result.exposureId || command.answers !== row.result.answers ||
      row.result.document !== (command.positions === 'document')) throw Error('paper_source_original_command_changed');
  if (command.positions === 'document') {
    if (row.result.sources.length) throw Error('paper_source_document_positions_changed');
  } else if (command.positions.length !== row.result.sources.length || row.result.sources.some((source, index) => {
    const position = (command.positions as Exclude<PaperSourceReadCommand['positions'], string>)[index];
    return source.paperId !== command.paperId || source.detailSha256 !== command.detailSha256 || source.publicationVersion !== command.publicationVersion ||
      source.position !== position.position || source.sourceQuestionId !== position.sourceQuestionId;
  })) throw Error('paper_source_original_positions_changed');
  if (command.kind === 'selection' && row.requestKey !== paperSelectionExposureKey(command.origin!.id, command.paperId)) throw Error('paper_source_original_selection_changed');
  return row;
}
export function preparePaperSourceExposure(input: {
  actorId: string; studentId: string; authorization: PaperSelectionAuthorization;
  input: PaperSourceReadCommand; sources: PaperSelectionSource[]; at: string;
}): PaperSourceExposureRecord {
  const exposureId = paperSourceExposureId(input.actorId, input.input.requestKey), result = {
    exposureId, sources: structuredClone(input.sources), document: input.input.positions === 'document', answers: input.input.answers, at: input.at,
  };
  return assertPaperSourceExposure({ protocol: 'paper-source-exposure-record-v1', id: exposureId, actorId: input.actorId, studentId: input.studentId,
    authorization: structuredClone(input.authorization), requestKey: input.input.requestKey,
    requestHash: digest({ actorId: input.actorId, studentId: input.studentId, input: input.input }), input: structuredClone(input.input), at: input.at, result, resultHash: digest(result) });
}

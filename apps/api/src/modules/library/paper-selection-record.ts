import { z } from 'zod';
import {
  paperSelectionCommandSchema, paperSelectionHashSchema as hash, paperSelectionIdSchema as id,
  paperSelectionItemSchema, paperSelectionRequestKeySchema, paperSelectionResultSchema,
  paperSelectionScopeSchema, paperSelectionSnapshotSchema, paperSelectionSourceKey, paperSelectionTimeSchema as time,
  type PaperSelectionCommand, type PaperSelectionItem, type PaperSelectionScope,
} from '@study-agent/contracts';
import { retentionDigest as digest } from '../diagnostics/retention-anchor';

export const paperSelectionAuthorizationSchema = z.object({
  actorRole: z.enum(['parent', 'admin', 'teacher', 'operator', 'student']), actorVersion: z.number().int().nonnegative(),
  learningAccess: z.object({ studentId: id, guardianId: id, accessVersion: z.number().int().positive() }).strict().nullable(),
}).strict();
export type PaperSelectionAuthorization = z.infer<typeof paperSelectionAuthorizationSchema>;
export const paperSelectionRevisionSchema = z.object({
  revision: z.number().int().positive().max(1000), commandId: id, at: time, previousFingerprint: hash.nullable(),
  snapshot: paperSelectionSnapshotSchema, fingerprint: hash,
}).strict();
export const paperSelectionListRecordSchema = z.object({
  protocol: z.literal('paper-selection-list-record-v1'), id, actorId: id, scope: paperSelectionScopeSchema,
  createdAt: time, updatedAt: time, revision: z.number().int().positive().max(1000),
  history: z.array(paperSelectionRevisionSchema).min(1).max(1000),
}).strict();
export type PaperSelectionListRecord = z.infer<typeof paperSelectionListRecordSchema>;
export const paperSelectionCommandRecordSchema = z.object({
  protocol: z.literal('paper-selection-command-record-v1'), id, actorId: id, scope: paperSelectionScopeSchema,
  authorization: paperSelectionAuthorizationSchema, requestKey: paperSelectionRequestKeySchema, requestHash: hash,
  input: paperSelectionCommandSchema, at: time, result: paperSelectionResultSchema, resultHash: hash,
}).strict();
export type PaperSelectionCommandRecord = z.infer<typeof paperSelectionCommandRecordSchema>;
export const paperSelectionCommandId = (actorId: string, requestKey: string) => 'paper_selection_command_' + digest({ actorId, requestKey });
export const paperSelectionListId = (actorId: string, requestKey: string) => 'paper_selection_' + digest({ actorId, requestKey });
export const paperSelectionItemId = (source: PaperSelectionItem['source']) => 'paper_selected_' + digest(paperSelectionSourceKey(source));
const same = (left: unknown, right: unknown) => digest(left) === digest(right);
export function assertPaperSelectionAuthorization(scope: PaperSelectionScope, authorization: PaperSelectionAuthorization) {
  if (authorization.actorRole === 'student') {
    if (scope.kind !== 'student_self' || !authorization.learningAccess || authorization.learningAccess.studentId !== scope.studentId) throw Error('paper_selection_original_authorization_changed');
  } else if (scope.kind !== 'private_preparation' || authorization.learningAccess !== null) throw Error('paper_selection_original_authorization_changed');
}
function revisionFingerprint(list: Pick<PaperSelectionListRecord, 'id' | 'actorId' | 'scope'>, value: Omit<PaperSelectionListRecord['history'][number], 'fingerprint'>) {
  return digest({ protocol: 'paper-selection-revision-v1', listId: list.id, actorId: list.actorId, scope: list.scope, ...value });
}
export function assertPaperSelectionList(value: unknown): PaperSelectionListRecord {
  const row = paperSelectionListRecordSchema.parse(value);
  if (!same(row, value) || row.revision !== row.history.length || row.createdAt !== row.history[0].at || row.updatedAt !== row.history.at(-1)!.at) throw Error('paper_selection_original_list_changed');
  const commands = new Set<string>();
  for (const [index, saved] of row.history.entries()) {
    const { fingerprint, ...body } = saved, previous = row.history[index - 1];
    const items = saved.snapshot.items;
    if (saved.revision !== index + 1 || saved.previousFingerprint !== (previous?.fingerprint ?? null) || fingerprint !== revisionFingerprint(row, body) ||
        previous && saved.at < previous.at || commands.has(saved.commandId) || new Set(items.map(item => paperSelectionSourceKey(item.source))).size !== items.length ||
        new Set(items.map(item => item.source.paperId)).size > 10 || items.some(item => item.id !== paperSelectionItemId(item.source) || items.some(other =>
          other.source.paperId === item.source.paperId && (other.source.detailSha256 !== item.source.detailSha256 || other.source.publicationVersion !== item.source.publicationVersion || other.research !== item.research)))) throw Error('paper_selection_original_history_changed');
    commands.add(saved.commandId);
  }
  return row;
}
export function assertPaperSelectionCommand(value: unknown): PaperSelectionCommandRecord {
  const row = paperSelectionCommandRecordSchema.parse(value);
  assertPaperSelectionAuthorization(row.scope, row.authorization);
  if (!same(row, value) || row.id !== paperSelectionCommandId(row.actorId, row.requestKey) || row.requestKey !== row.input.requestKey ||
      row.requestHash !== digest({ actorId: row.actorId, scope: row.scope, input: row.input }) || row.resultHash !== digest(row.result) || row.at !== row.result.at ||
      row.input.kind === 'create' && (!same(row.input.scope, row.scope) || row.result.revision !== 1 || row.result.listId !== paperSelectionListId(row.actorId, row.requestKey)) ||
      row.input.kind === 'revise' && (row.input.listId !== row.result.listId || row.result.revision !== row.input.expectedRevision + 1)) throw Error('paper_selection_original_command_changed');
  return row;
}

/** Pure preparation only. The caller resolves every source and commits the
 * returned list, command and any student exposure in one durable transaction. */
export function preparePaperSelectionChange(input: {
  actorId: string; authorization: PaperSelectionAuthorization; input: PaperSelectionCommand; at: string;
  previous: PaperSelectionListRecord | null; resolved: PaperSelectionItem[];
}): { list: PaperSelectionListRecord; command: PaperSelectionCommandRecord } {
  id.parse(input.actorId); time.parse(input.at);
  const commandInput = paperSelectionCommandSchema.parse(input.input);
  if (!same(commandInput, input.input)) throw Error('paper_selection_full_command_required');
  const previous = input.previous && assertPaperSelectionList(input.previous);
  if (commandInput.kind === 'create' && previous || commandInput.kind === 'revise' && !previous) throw Error('paper_selection_original_list_required');
  const scope = commandInput.kind === 'create' ? commandInput.scope : previous!.scope;
  assertPaperSelectionAuthorization(scope, paperSelectionAuthorizationSchema.parse(input.authorization));
  if (previous && (commandInput.kind !== 'revise' || previous.actorId !== input.actorId || previous.id !== commandInput.listId ||
      previous.revision !== commandInput.expectedRevision || previous.history.at(-1)!.fingerprint !== commandInput.expectedFingerprint)) throw Error('paper_selection_revision_conflict');
  if (previous && input.at < previous.updatedAt) throw Error('paper_selection_original_time_changed');
  if (previous && previous.revision >= 1000) throw Error('paper_selection_revision_limit');
  const resolved = input.resolved.map(value => paperSelectionItemSchema.parse(value));
  if (!same(resolved, input.resolved) || resolved.length !== commandInput.items.length || resolved.some((value, index) => {
    const { title: _title, originalPage: _page, ...identity } = value.source;
    return !same(identity, commandInput.items[index]) || value.id !== paperSelectionItemId(value.source);
  })) throw Error('paper_selection_resolved_source_changed');
  const commandId = paperSelectionCommandId(input.actorId, commandInput.requestKey);
  if (previous?.history.some(saved => saved.commandId === commandId)) throw Error('paper_selection_original_request_used');
  const listIdentity = { id: previous?.id ?? paperSelectionListId(input.actorId, commandInput.requestKey), actorId: input.actorId, scope: structuredClone(scope) };
  const body = { revision: (previous?.revision ?? 0) + 1, commandId, at: input.at, previousFingerprint: previous?.history.at(-1)!.fingerprint ?? null,
    snapshot: { title: commandInput.title, items: structuredClone(resolved) } };
  const saved = { ...body, fingerprint: revisionFingerprint(listIdentity, body) };
  const list = assertPaperSelectionList({ protocol: 'paper-selection-list-record-v1', ...listIdentity,
    createdAt: previous?.createdAt ?? input.at, updatedAt: input.at, revision: saved.revision, history: [...(previous?.history ?? []), saved] });
  const result = { listId: list.id, revision: saved.revision, fingerprint: saved.fingerprint, at: input.at };
  const command = assertPaperSelectionCommand({ protocol: 'paper-selection-command-record-v1', id: commandId, actorId: input.actorId,
    scope: structuredClone(scope), authorization: structuredClone(input.authorization), requestKey: commandInput.requestKey,
    requestHash: digest({ actorId: input.actorId, scope, input: commandInput }), input: structuredClone(commandInput), at: input.at, result, resultHash: digest(result) });
  return { list, command };
}

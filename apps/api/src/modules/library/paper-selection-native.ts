import { type PaperSelectionItem } from '@study-agent/contracts';
import { retentionDigest as digest } from '../diagnostics/retention-anchor';
import { assertPaperSelectionCommand, assertPaperSelectionList, preparePaperSelectionChange,
  type PaperSelectionAuthorization, type PaperSelectionListRecord } from './paper-selection-record';
import { assertPaperSourceExposure, paperSelectionExposureKey, preparePaperSourceExposure } from './paper-source-exposure-record';

type Row = { collection: string; record_id?: string; body: unknown };
const same = (left: unknown, right: unknown) => digest(left) === digest(right);
const fail = (): never => { throw Error('paper_selection_native_relation_changed'); };
const unique = <T>(values: readonly T[], key: (value: T) => string) => { if (new Set(values.map(key)).size !== values.length) fail(); };
export const PAPER_EXPORT_NATIVE_READY = false;

/** Reads all retained originals. This function never repairs missing history,
 * creates exposures, or uses current publication state to erase old sources. */
export function assertPaperSelectionNativeRows(rows: readonly Row[]) {
  try {
    const state: Record<string, any[]> = {};
    for (const row of rows) {
      const body = typeof row.body === 'string' ? JSON.parse(row.body) : row.body;
      if (!body || typeof body !== 'object' || row.record_id !== undefined && body.id !== row.record_id) fail();
      (state[row.collection] ??= []).push(body);
    }
    if (!PAPER_EXPORT_NATIVE_READY && ['paperExports', 'paperExportCommands', 'paperExportFiles'].some(name => state[name]?.length)) throw Error('paper_export_native_not_ready');
    const lists = (state.paperSelectionLists ?? []).map(assertPaperSelectionList), commands = (state.paperSelectionCommands ?? []).map(assertPaperSelectionCommand),
      exposures = (state.paperSourceExposures ?? []).map(assertPaperSourceExposure);
    unique(lists, value => value.id); unique(commands, value => value.id); unique(exposures, value => value.id);
    unique(commands, value => JSON.stringify([value.actorId, value.requestKey])); unique(exposures, value => JSON.stringify([value.actorId, value.requestKey]));
    const users = state.users ?? [], students = state.students ?? [], receipts = state.privacyRequests ?? [];
    const authors = (actorId: string, studentId: string | null, authorization: PaperSelectionAuthorization, at: string) => {
      const actor = users.find(value => value.id === actorId);
      if (!actor || studentId !== null && !students.some(value => value.id === studentId && value.userId === actorId)) fail();
      if (studentId !== null && authorization.actorRole !== 'student' || studentId === null && authorization.actorRole === 'student') fail();
      const access = authorization.learningAccess;
      const guardianDeleted = access && receipts.some(value => value.kind === 'account_delete' && value.actorId === access.guardianId &&
          value.subjectHash === digest({ id: access.guardianId }) && value.retainedStudentHashes?.includes(digest({ id: studentId })) &&
          !value.erasedStudentHashes?.includes(digest({ id: studentId })) && Number.isFinite(Date.parse(value.completedAt)) && value.completedAt >= at);
      if (access && !users.some(value => value.id === access.guardianId) && !guardianDeleted) fail();
    };
    const commandMap = new Map(commands.map(value => [value.id, value])), usedCommands = new Set<string>(), expectedExposures = new Set<string>();
    for (const list of lists) {
      let previous: PaperSelectionListRecord | null = null;
      for (const [index, saved] of list.history.entries()) {
        const command = commandMap.get(saved.commandId);
        if (!command) throw Error('paper_selection_original_command_missing');
        if (usedCommands.has(command.id) || command.actorId !== list.actorId || !same(command.scope, list.scope) || command.at !== saved.at ||
            command.result.listId !== list.id || command.result.revision !== saved.revision || command.result.fingerprint !== saved.fingerprint) fail();
        authors(command.actorId, command.scope.studentId, command.authorization, command.at);
        const items = saved.snapshot.items;
        if (items.some(item => item.research && !['admin', 'teacher', 'operator'].includes(command.authorization.actorRole) || !item.research && item.source.publicationVersion === null)) fail();
        const reconstructed = preparePaperSelectionChange({ actorId: command.actorId, authorization: command.authorization, input: command.input, at: command.at, previous, resolved: items });
        if (!same(reconstructed.command, command) || !same(reconstructed.list.history, list.history.slice(0, index + 1))) fail();
        previous = reconstructed.list; usedCommands.add(command.id);
        if (list.scope.kind === 'student_self') {
          const papers = new Map<string, PaperSelectionItem[]>();
          for (const item of items) { const paper = papers.get(item.source.paperId) ?? []; paper.push(item); papers.set(item.source.paperId, paper); }
          for (const [paperId, group] of papers) {
            const source = group[0].source;
            if (group.some(item => item.research || item.source.detailSha256 !== source.detailSha256 || item.source.publicationVersion !== source.publicationVersion)) fail();
            const requestKey = paperSelectionExposureKey(command.id, paperId);
            const expected = preparePaperSourceExposure({ actorId: list.actorId, studentId: list.scope.studentId, authorization: command.authorization, at: command.at,
              input: { kind: 'selection', requestKey, paperId, detailSha256: source.detailSha256, publicationVersion: source.publicationVersion!,
                positions: group.map(item => ({ position: item.source.position, sourceQuestionId: item.source.sourceQuestionId })), answers: false, origin: { kind: 'selection_command', id: command.id } },
              sources: group.map(item => item.source) });
            if (!exposures.some(value => value.id === expected.id && same(value, expected))) fail(); expectedExposures.add(expected.id);
          }
        }
      }
      if (!same(previous, list)) fail();
    }
    if (usedCommands.size !== commands.length) fail();
    for (const exposure of exposures) {
      authors(exposure.actorId, exposure.studentId, exposure.authorization, exposure.at);
      if (exposure.input.kind === 'selection' && !expectedExposures.has(exposure.id)) fail();
      if (exposure.input.kind === 'export') throw Error('paper_export_native_not_ready');
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'paper_export_native_not_ready') throw error;
    throw Error('paper_selection_native_integrity_failed', { cause: error });
  }
}

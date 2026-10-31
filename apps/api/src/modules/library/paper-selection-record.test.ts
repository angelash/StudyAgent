import { describe, expect, it } from 'vitest';
import { paperSelectionCommandSchema, paperSelectionSourceKey, type PaperSelectionCommand, type PaperSelectionItem, type PaperSelectionScope } from '@study-agent/contracts';
import { retentionDigest as digest } from '../diagnostics/retention-anchor';
import { assertPaperSelectionList, assertPaperSelectionCommand, preparePaperSelectionChange, paperSelectionItemId, type PaperSelectionAuthorization } from './paper-selection-record';
import { assertPaperSelectionNativeRows } from './paper-selection-native';
import { assertPaperSourceExposure, paperSelectionExposureKey, preparePaperSourceExposure } from './paper-source-exposure-record';

const at = '2026-10-31T01:00:00.000Z', later = '2026-10-31T01:01:00.000Z';
const parentAuthorization: PaperSelectionAuthorization = { actorRole: 'parent', actorVersion: 0, learningAccess: null };
const studentAuthorization: PaperSelectionAuthorization = { actorRole: 'student', actorVersion: 0, learningAccess: { studentId: 'child-one', guardianId: 'parent-one', accessVersion: 1 } };
const privateScope: PaperSelectionScope = { kind: 'private_preparation', studentId: null };
function question(paperId: string, position: number): PaperSelectionItem {
  const source = { paperId, position, sourceQuestionId: 'paper:question-' + position, detailSha256: digest(paperId), publicationVersion: 1, title: '原卷 ' + paperId, originalPage: null };
  return { id: paperSelectionItemId(source), source, research: false };
}
const firstItem = question('paper-a', 7), secondItem = question('paper-b', 3);
const identity = (item: PaperSelectionItem) => { const { title: _title, originalPage: _page, ...source } = item.source; return source; };
function create(student = false, items = [firstItem, secondItem]) {
  const actorId = student ? 'learner-one' : 'parent-one', scope: PaperSelectionScope = student ? { kind: 'student_self', studentId: 'child-one' } : privateScope;
  const input: PaperSelectionCommand = { kind: 'create', requestKey: 'create-first', scope, title: '  完整清单\n第一版  ', items: items.map(identity) };
  return preparePaperSelectionChange({ actorId, authorization: student ? studentAuthorization : parentAuthorization, input, at, previous: null, resolved: items });
}
function studentExposures(value: ReturnType<typeof create>) {
  const { list, command } = value, papers = new Map<string, PaperSelectionItem[]>();
  for (const item of list.history.at(-1)!.snapshot.items) { const group = papers.get(item.source.paperId) ?? []; group.push(item); papers.set(item.source.paperId, group); }
  return [...papers].map(([paperId, items]) => preparePaperSourceExposure({ actorId: list.actorId, studentId: list.scope.studentId!, authorization: command.authorization,
    input: { kind: 'selection', requestKey: paperSelectionExposureKey(command.id, paperId), paperId, detailSha256: items[0].source.detailSha256, publicationVersion: 1,
      positions: items.map(item => ({ position: item.source.position, sourceQuestionId: item.source.sourceQuestionId })), answers: false, origin: { kind: 'selection_command', id: command.id } },
    sources: items.map(item => item.source), at: command.at }));
}
function rows(value = create(), exposures: ReturnType<typeof studentExposures> = []) {
  return [
    { collection: 'users', body: { id: 'parent-one', role: 'parent', status: 'active' } },
    { collection: 'users', body: { id: 'learner-one', role: 'student', status: 'active' } },
    { collection: 'students', body: { id: 'child-one', userId: 'learner-one' } },
    { collection: 'paperSelectionLists', body: value.list },
    { collection: 'paperSelectionCommands', body: value.command },
    ...exposures.map(body => ({ collection: 'paperSourceExposures', body })),
  ];
}

describe('complete paper selection commands, historical revisions and source identity', () => {
  it('preserves exact strings and cross-paper order without carrying answers', () => {
    const value = create();
    expect(value.command.input.title).toBe('  完整清单\n第一版  ');
    expect(value.list.history[0].snapshot.items.map(item => [item.source.paperId, item.source.position])).toEqual([['paper-a', 7], ['paper-b', 3]]);
    expect(value.command.result).toEqual({ listId: value.list.id, revision: 1, fingerprint: value.list.history[0].fingerprint, at });
    expect(() => assertPaperSelectionNativeRows(rows(value))).not.toThrow();
    expect(JSON.stringify(value)).not.toContain('firstAnswer');
  });
  it('reorders and clears by new immutable revision while the original receipt stays exact', () => {
    const initial = create(), original = structuredClone(initial);
    const second = preparePaperSelectionChange({ actorId: initial.list.actorId, authorization: parentAuthorization,
      input: { kind: 'revise', requestKey: 'reverse-first', listId: initial.list.id, expectedRevision: 1, expectedFingerprint: initial.command.result.fingerprint,
        title: '重排', items: [secondItem, firstItem].map(identity) }, at: later, previous: initial.list, resolved: [secondItem, firstItem] });
    const cleared = preparePaperSelectionChange({ actorId: initial.list.actorId, authorization: parentAuthorization,
      input: { kind: 'revise', requestKey: 'clear-first', listId: initial.list.id, expectedRevision: 2, expectedFingerprint: second.command.result.fingerprint,
        title: '已清空', items: [] }, at: later, previous: second.list, resolved: [] });
    expect(initial).toEqual(original);
    expect(cleared.list.history.map(saved => saved.snapshot.items.map(item => item.source.paperId))).toEqual([['paper-a', 'paper-b'], ['paper-b', 'paper-a'], []]);
    const savedRows = rows(initial).filter(row => row.collection !== 'paperSelectionLists');
    savedRows.push({ collection: 'paperSelectionLists', body: cleared.list }, { collection: 'paperSelectionCommands', body: second.command }, { collection: 'paperSelectionCommands', body: cleared.command });
    expect(() => assertPaperSelectionNativeRows(savedRows)).not.toThrow();
  });
  it('has deterministic replay while a changed complete command changes its hash', () => {
    expect(create()).toEqual(create());
    const original = create(), changed = preparePaperSelectionChange({ actorId: original.list.actorId, authorization: parentAuthorization, input: { ...original.command.input, title: '另一份' },
      at, previous: null, resolved: [firstItem, secondItem] });
    expect(changed.command.id).toBe(original.command.id);
    expect(changed.command.requestHash).not.toBe(original.command.requestHash);
  });
  it.each(['expectedRevision', 'expectedFingerprint', 'listId', 'actorId'] as const)('rejects stale or foreign %s without changing the original', field => {
    const initial = create(), before = structuredClone(initial);
    const input = { kind: 'revise' as const, requestKey: 'revision-second', listId: initial.list.id, expectedRevision: 1,
      expectedFingerprint: initial.command.result.fingerprint, title: '下一版', items: [identity(firstItem)] };
    if (field === 'expectedRevision') input.expectedRevision = 2;
    if (field === 'expectedFingerprint') input.expectedFingerprint = digest('foreign');
    if (field === 'listId') input.listId = 'foreign-list';
    expect(() => preparePaperSelectionChange({ actorId: field === 'actorId' ? 'other-parent' : initial.list.actorId, authorization: parentAuthorization, input, at: later,
      previous: initial.list, resolved: [firstItem] })).toThrow('paper_selection_revision_conflict');
    expect(initial).toEqual(before);
  });
  it.each(['answer', 'firstAnswer', 'score', 'mediaPath', 'html'])('refuses private or client-authored %s fields', field => {
    const input = structuredClone(create().command.input) as any;
    input.items[0][field] = 'private';
    expect(paperSelectionCommandSchema.safeParse(input).success).toBe(false);
  });
  it('refuses duplicate original positions across versions and mixed versions of one paper', () => {
    const initial = create().command.input;
    expect(paperSelectionCommandSchema.safeParse({ ...initial, items: [identity(firstItem), { ...identity(firstItem), detailSha256: digest('new-version') }] }).success).toBe(false);
    expect(paperSelectionCommandSchema.safeParse({ ...initial, items: [identity(firstItem), { ...identity(question('paper-a', 8)), publicationVersion: 2 }] }).success).toBe(false);
    expect(paperSelectionSourceKey(firstItem.source)).not.toBe(paperSelectionSourceKey(secondItem.source));
  });
  it('refuses a server resolution with the wrong original or order', () => {
    const value = create();
    expect(() => preparePaperSelectionChange({ actorId: value.list.actorId, authorization: parentAuthorization, input: value.command.input, at, previous: null,
      resolved: [secondItem, firstItem] })).toThrow('paper_selection_resolved_source_changed');
  });
  it('rejects a display-only UUID at the public command boundary', () => {
    const value = create().command.input;
    expect(paperSelectionCommandSchema.safeParse({ ...value, items: [{ ...identity(firstItem), sourceQuestionId: 'question-7' }] }).success).toBe(false);
  });
  it.each(['scope', 'role', 'access'] as const)('prevents guardian rehearsal from impersonating student %s', field => {
    const value = create(true), authorization = structuredClone(studentAuthorization);
    if (field === 'role') authorization.actorRole = 'parent';
    if (field === 'access') authorization.learningAccess!.studentId = 'another-child';
    const input = field === 'scope' ? { ...value.command.input, scope: privateScope } : value.command.input;
    expect(() => preparePaperSelectionChange({ actorId: value.list.actorId, authorization, input, at, previous: null, resolved: [firstItem, secondItem] })).toThrow('paper_selection_original_authorization_changed');
  });
  it('rejects unknown scope fields, invalid Unicode and whitespace-only titles without trimming real strings', () => {
    const value = create();
    expect(paperSelectionCommandSchema.safeParse({ ...value.command.input, title: '\ud800' }).success).toBe(false);
    expect(paperSelectionCommandSchema.safeParse({ ...value.command.input, title: '\n\t' }).success).toBe(false);
    expect(paperSelectionCommandSchema.safeParse({ ...value.command.input, title: '有效🙂标题' }).success).toBe(true);
    expect(paperSelectionCommandSchema.safeParse({ ...value.command.input, scope: { ...privateScope, studentId: 'child-one' } }).success).toBe(false);
  });
  it.each(['history', 'result', 'input', 'recordId', 'author', 'orphan', 'duplicate'] as const)('rejects incomplete or tampered native %s', field => {
    const value = create(), records: any[] = rows(value);
    if (field === 'history') value.list.history[0].snapshot.title = '篡改';
    if (field === 'result') { value.command.result.revision = 2; value.command.resultHash = digest(value.command.result); }
    if (field === 'input') { value.command.input.title = '篡改'; value.command.requestHash = digest({ actorId: value.command.actorId, scope: value.command.scope, input: value.command.input }); }
    if (field === 'recordId') records[3].record_id = 'another-id';
    if (field === 'author') records.splice(0, 1);
    if (field === 'orphan') records.splice(3, 1);
    if (field === 'duplicate') records.push(structuredClone(records[4]));
    expect(() => assertPaperSelectionNativeRows(records)).toThrow('paper_selection_native_integrity_failed');
  });
  it('does not silently accept export rows before their full native verifier exists', () => {
    expect(() => assertPaperSelectionNativeRows([...rows(), { collection: 'paperExports', body: { id: 'unregistered-export' } }])).toThrow('paper_export_native_not_ready');
  });
  it('validates historical records even when the actor is disabled or current paper publication changed', () => {
    const records: any[] = rows(); records[0].body.status = 'disabled';
    records.push({ collection: 'paperPublications', body: { id: 'publication-a', paperId: 'paper-a', status: 'withdrawn', version: 2 } });
    expect(() => assertPaperSelectionNativeRows(records)).not.toThrow();
  });
});

describe('explicit conservative student exposure and retained source reconstruction', () => {
  it('requires every selected original in the same retained student command, without creating answer evidence', () => {
    const value = create(true), exposures = studentExposures(value);
    expect(() => assertPaperSelectionNativeRows(rows(value, exposures))).not.toThrow();
    expect(() => assertPaperSelectionNativeRows(rows(value))).toThrow('paper_selection_native_integrity_failed');
    expect(() => assertPaperSelectionNativeRows(rows(value, exposures.slice(1)))).toThrow('paper_selection_native_integrity_failed');
    expect(exposures.map(row => row.result.answers)).toEqual([false, false]);
    expect(JSON.stringify(exposures)).not.toMatch(/firstAnswer|correct|mastery/);
  });
  it('rejects a fake exposure even after its public result hash is recalculated', () => {
    const value = create(true), exposures = studentExposures(value), exposure = exposures[0];
    exposure.result.sources[0].sourceQuestionId = 'paper:another-question'; exposure.resultHash = digest(exposure.result);
    expect(() => assertPaperSourceExposure(exposure)).toThrow('paper_source_original_positions_changed');
  });
  it('does not turn an ordinary read into a selected-source proof', () => {
    const value = create(true), exposures = studentExposures(value);
    const extra = structuredClone(exposures[0]); extra.input.origin!.id = 'another-selection-command';
    expect(() => assertPaperSelectionNativeRows(rows(value, [extra, exposures[1]]))).toThrow('paper_selection_native_integrity_failed');
  });
  it('accepts an explicit whole-document reservation without inventing question identities', () => {
    const value = preparePaperSourceExposure({ actorId: 'learner-one', studentId: 'child-one', authorization: studentAuthorization, at, sources: [],
      input: { kind: 'read', requestKey: 'whole-document', paperId: 'paper-pdf', detailSha256: digest('pdf-original'), publicationVersion: 1, positions: 'document', answers: false, origin: null } });
    expect(value.result).toEqual({ exposureId: value.id, sources: [], document: true, answers: false, at });
    expect(() => assertPaperSelectionNativeRows([...rows(), { collection: 'paperSourceExposures', body: value }])).not.toThrow();
  });
  it('rejects foreign child linkage and missing guardian proofs on native restore', () => {
    const value = create(true), exposures = studentExposures(value), records: any[] = rows(value, exposures);
    records[2].body.userId = 'someone-else';
    expect(() => assertPaperSelectionNativeRows(records)).toThrow('paper_selection_native_integrity_failed');
    records[2].body.userId = 'learner-one'; records.splice(0, 1);
    expect(() => assertPaperSelectionNativeRows(records)).toThrow('paper_selection_native_integrity_failed');
  });
  it('requires a real retained-child deletion receipt for a removed guardian and rejects pre-operation or erased-child claims', () => {
    const value = create(true), records: any[] = rows(value, studentExposures(value)).filter(row => row.collection !== 'users' || row.body.id !== 'parent-one');
    const receipt = { id: 'actual-delete', kind: 'account_delete', actorId: 'parent-one', subjectHash: digest({ id: 'parent-one' }), completedAt: later,
      retainedStudentHashes: [digest({ id: 'child-one' })], erasedStudentHashes: [] as string[] };
    records.push({ collection: 'privacyRequests', body: receipt });
    expect(() => assertPaperSelectionNativeRows(records)).not.toThrow();
    receipt.completedAt = '2026-10-31T00:59:00.000Z';
    expect(() => assertPaperSelectionNativeRows(records)).toThrow('paper_selection_native_integrity_failed');
    receipt.completedAt = later; receipt.erasedStudentHashes = [digest({ id: 'child-one' })];
    expect(() => assertPaperSelectionNativeRows(records)).toThrow('paper_selection_native_integrity_failed');
  });
  it('rejects public rehashes that try to detach original selection commands', () => {
    const value = create(), detached = structuredClone(value.command);
    detached.input.title = '新标题'; detached.requestHash = digest({ actorId: detached.actorId, scope: detached.scope, input: detached.input });
    expect(() => assertPaperSelectionCommand(detached)).not.toThrow();
    const records = rows(value); records[4] = { collection: 'paperSelectionCommands', body: detached };
    expect(() => assertPaperSelectionNativeRows(records)).toThrow('paper_selection_native_integrity_failed');
    expect(() => assertPaperSelectionList(value.list)).not.toThrow();
  });
});

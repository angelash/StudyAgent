import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PaperLibraryCopyOwner, PaperLibraryJournal, PaperSelectionCommand } from '@study-agent/contracts';
import { paperLibrarySourceIdentity } from '@study-agent/contracts';
import { fixture } from './paper-export-fixture.spec';
import { retentionDigest } from '../diagnostics/retention-anchor';
import { completePaperLibraryCopy, emptyPaperLibraryDraft, paperLibraryJournalEntry, paperLibraryValueHash, readPaperLibraryCopy, assertPaperLibraryJournal } from '../../../../web/lib/paper-library-copy';
import { lookupPaperLibraryCommand, sendPaperLibraryCommand } from '../../../../web/lib/paper-library-client';

const owner: PaperLibraryCopyOwner = { actorId: 'parent', role: 'parent', scope: { kind: 'private_preparation', studentId: null } };
async function selection() { const f = fixture(), entry = await paperLibraryJournalEntry(owner, 'selection', f.selection.command.input); return { f, entry, response: { input: f.selection.command.input, result: f.selection.command.result, current: { original: 'current view remains separate' } } }; }
describe('browser complete paper-library copy and immutable original-command client', () => {
  it('round-trips all raw invalid/empty form strings, ordered sources and pending inputs without converting them into business commands', async () => {
    const { f, entry } = await selection(), body = { ...emptyPaperLibraryDraft(owner, randomUUID()), title: ' \t\n ', items: f.items.map(row => row.source).reverse(),
      baseline: { identity: f.selection.command.result, title: f.selection.list.history[0].snapshot.title, items: f.items.map(row => row.source) },
      exportSettings: { title: '', answerLines: ' 1.25e+2 ', breakBetweenQuestions: true, books: [], formats: [] }, journal: [entry] };
    const copy = await completePaperLibraryCopy(body); expect(copy.fingerprint).toBe(retentionDigest(body)); const restored = await readPaperLibraryCopy(JSON.parse(JSON.stringify(copy)), owner);
    expect(restored.copy).toEqual(copy); expect(restored.copy.items.map(row => row.position)).toEqual([3, 7]); expect(restored.copy.title).toBe(' \t\n '); expect(restored.copy.exportSettings.answerLines).toBe(' 1.25e+2 ');
    expect(restored.verifiedOriginalRequests).toEqual([]); expect(restored.requiresOriginalResultLookup).toBe(true); expect(restored.copy.journal[0].input).toEqual(f.selection.command.input);
  });
  it('rejects foreign actor/role/student ownership, extra fields and malformed scopes without normalizing away original data', async () => {
    const copy = await completePaperLibraryCopy(emptyPaperLibraryDraft(owner, randomUUID()));
    for (const other of [{ ...owner, actorId: 'other-parent' }, { ...owner, role: 'admin' as const }, { actorId: owner.actorId, role: 'student' as const, scope: { kind: 'student_self' as const, studentId: 'child' } }]) await expect(readPaperLibraryCopy(copy, other)).rejects.toThrow();
    await expect(readPaperLibraryCopy({ ...copy, bearer: 'synthetic-extra-field' }, owner)).rejects.toThrow();
    expect(() => emptyPaperLibraryDraft({ ...owner, scope: { kind: 'student_self', studentId: 'child' } }, randomUUID())).toThrow();
    const student: PaperLibraryCopyOwner = { actorId: 'learner', role: 'student', scope: { kind: 'student_self', studentId: 'child' } }, studentCopy = await completePaperLibraryCopy(emptyPaperLibraryDraft(student, randomUUID()));
    await expect(readPaperLibraryCopy(studentCopy, { ...student, scope: { kind: 'student_self', studentId: 'different-child' } })).rejects.toThrow();
  });
  it('refuses duplicate source positions and mixed original versions while retaining the caller original array', async () => {
    const f = fixture(), source = f.items[0].source, body = emptyPaperLibraryDraft(owner, randomUUID());
    await expect(completePaperLibraryCopy({ ...body, items: [source, source] })).rejects.toThrow();
    await expect(completePaperLibraryCopy({ ...body, items: [source, { ...source, position: source.position + 1, sourceQuestionId: 'paper:another', detailSha256: 'a'.repeat(64) }] })).rejects.toThrow();
    expect(source.detailSha256).toBe(f.items[0].source.detailSha256);
  });
  it('preserves actual native selection and four export-slot receipts and rejects forged task identities after public hashes are recomputed', async () => {
    const { f, entry } = await selection(), exportEntry = await paperLibraryJournalEntry(owner, 'export', f.command.input);
    const received: PaperLibraryJournal[] = [{ ...entry, phase: 'received', result: f.selection.command.result } as PaperLibraryJournal, { ...exportEntry, phase: 'received', result: f.command.result } as PaperLibraryJournal];
    const copy = await completePaperLibraryCopy({ ...emptyPaperLibraryDraft(owner, randomUUID()), journal: received }); expect(copy.journal).toEqual(received); expect((await readPaperLibraryCopy(copy, owner)).verifiedOriginalRequests).toEqual([]);
    const wrong = structuredClone(received[1]); if (wrong.family !== 'export' || wrong.result?.kind !== 'create') throw Error('Exact fixture required'); wrong.result.slots[0].taskId = 'paper_export_task_' + 'a'.repeat(64);
    await expect(completePaperLibraryCopy({ ...emptyPaperLibraryDraft(owner, randomUUID()), journal: [wrong] })).rejects.toThrow('对应关系');
  });
  it('requires a real original lookup even when an imported receipt has a recomputed valid public fingerprint', async () => {
    const { entry, response } = await selection(), forged = { ...entry, phase: 'received', result: { ...response.result, fingerprint: 'b'.repeat(64) } } as PaperLibraryJournal;
    const copy = await completePaperLibraryCopy({ ...emptyPaperLibraryDraft(owner, randomUUID()), journal: [forged] }), restored = await readPaperLibraryCopy(copy, owner); expect(restored.verifiedOriginalRequests).toEqual([]);
    let gets = 0; await expect(lookupPaperLibraryCommand(owner, restored.copy.journal[0], undefined, async () => { gets++; return response; })).rejects.toThrow('原回执'); expect(gets).toBe(1);
    expect(forged.result).toMatchObject({ fingerprint: 'b'.repeat(64) });
  });
  it('rejects the same request key attached to another full input and keeps current projections out of original receipts', async () => {
    const { entry, response } = await selection(); await expect(lookupPaperLibraryCommand(owner, entry, undefined, async () => ({ ...response, input: { ...response.input, title: 'Another complete command' } }))).rejects.toThrow('另一份完整命令');
    const actual = await lookupPaperLibraryCommand(owner, entry, undefined, async () => response); expect(actual.verified).toBe(true); expect(actual.entry.result).toEqual(response.result); expect(actual.current).toEqual(response.current); expect(actual.entry).not.toHaveProperty('current');
  });
  it('retains the entire unknown command before simulated IO and recovers a lost POST response from the exact GET', async () => {
    const { entry, response } = await selection(), retained: PaperLibraryJournal[] = [], order: string[] = [];
    const result = await sendPaperLibraryCommand(owner, entry, async value => { retained.push(structuredClone(value)); order.push('retain-' + value.phase); (value.input as PaperSelectionCommand).title = 'Caller mutation stays separate'; }, undefined,
      async (path, options) => { if (options.method === 'POST') { order.push('post'); expect(JSON.parse(String(options.body))).toEqual(response.input); throw Error('Simulated lost POST response'); } order.push('get'); return response; });
    expect(order[0]).toBe('retain-unknown'); expect(result.verified).toBe(true); expect(result.entry.result).toEqual(response.result); expect(retained[0].input).toEqual(response.input); expect(entry.phase).toBe('prepared');
  });
  it('keeps a null GET unknown and only explicitly retries the identical original body and key', async () => {
    const { entry } = await selection(), posts: string[] = [];
    const transport = async (_path: string, options: RequestInit) => { if (options.method === 'POST') { posts.push(String(options.body)); throw Error('Simulated network interruption'); } return null; };
    const first = await sendPaperLibraryCommand(owner, entry, async () => {}, undefined, transport); expect(first.verified).toBe(false); expect(first.entry.phase).toBe('unknown'); expect(posts).toHaveLength(1);
    const second = await sendPaperLibraryCommand(owner, first.entry, async () => {}, undefined, transport); expect(second.verified).toBe(false); expect(posts).toHaveLength(2); expect(posts[0]).toBe(posts[1]); expect(JSON.parse(posts[1]).requestKey).toBe(entry.input.requestKey);
  });
  it('does not send when complete-state retention fails and refuses late successful responses after abort', async () => {
    const { entry, response } = await selection(); let calls = 0; await expect(sendPaperLibraryCommand(owner, entry, async () => { throw Error('Actual caller did not preserve complete state'); }, undefined, async () => { calls++; return response.result; })).rejects.toThrow('did not preserve'); expect(calls).toBe(0);
    const controller = new AbortController(), retained: PaperLibraryJournal[] = [];
    await expect(sendPaperLibraryCommand(owner, entry, async value => { retained.push(value); }, controller.signal, async () => { controller.abort(); return response.result; })).rejects.toMatchObject({ name: 'AbortError' });
    expect(retained).toHaveLength(1); expect(retained[0].phase).toBe('unknown'); expect(retained[0].result).toBeNull();
  });
  it('checks the retained full command fingerprint rather than accepting a changed input under an old fingerprint', async () => {
    const { entry } = await selection(), changed = structuredClone(entry); if (changed.family !== 'selection') throw Error('Exact fixture required'); changed.input.title = 'Changed after preparation';
    await expect(assertPaperLibraryJournal(owner, changed)).rejects.toThrow('对应关系'); expect(await paperLibraryValueHash({ a: 2, b: [1] })).toBe(retentionDigest({ b: [1], a: 2 }));
  });
  it('refuses oversized complete copies without truncating the original command journal', async () => {
    const f = fixture(), source = f.items[0].source, sources = Array.from({ length: 100 }, (_, index) => ({ ...source, paperId: 'p'.repeat(120), position: index + 1, sourceQuestionId: 'paper:' + 'q'.repeat(110) + index })), journal: PaperLibraryJournal[] = [];
    for (let index = 0; index < 100; index++) journal.push(await paperLibraryJournalEntry(owner, 'selection', { kind: 'create', requestKey: 'large-original-command-' + index, scope: owner.scope, title: '完整大稿', items: sources.map(paperLibrarySourceIdentity) }));
    await expect(completePaperLibraryCopy({ ...emptyPaperLibraryDraft(owner, randomUUID()), items: sources, journal })).rejects.toThrow('2MiB'); expect(journal).toHaveLength(100); expect(journal[99].input).toHaveProperty('items');
  });
});

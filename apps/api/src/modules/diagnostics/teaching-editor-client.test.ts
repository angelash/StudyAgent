import { describe, expect, it } from 'vitest';
import { lookupTeachingEditorCommand, sendTeachingEditorCommand, type TeachingEditorTransport } from '../../../../web/lib/teaching-editor-client';
import { ApiRequestError } from '../../../../web/lib/api';
import { teachingJournalEntry, type TeachingEditorJournal } from '../../../../web/lib/teaching-editor-copy';
import { teachingFixture } from './textbook-teaching-fixture';
import { prepareTeachingChange } from './textbook-teaching-record';
import { prepareTextbookTeachingPackage, teachingHash } from './textbook-teaching-package';

async function fixture() {
  const f = teachingFixture(), owner = { actorId: 'qa:client:author', bookId: f.source.bookId, bookVersion: f.source.bookVersion, lessonId: f.source.lessonId };
  f.input.content.concept.explanation = ' \n' + f.input.content.concept.explanation + '\n ';
  const prepared = prepareTextbookTeachingPackage(f.store, f.input, f.source), changed = prepareTeachingChange({ actorId: owner.actorId,
    authorization: { role: 'teacher', accountVersion: 1, sessionId: 'qa-client-session' }, input: f.input, at: '2026-11-01T05:00:00.000Z', previous: null, prepared }),
    entry = await teachingJournalEntry(owner, f.input), response = { input: changed.command.input, result: changed.command.result, current: changed.header };
  return { ...f, owner, entry, changed, response };
}
describe('teaching editor full original command client and authoritative lookup boundary', () => {
  it('retains before POST, sends exact original strings and confirms only the full original-command lookup', async () => {
    const f = await fixture(), retained: TeachingEditorJournal[] = [], calls: Array<{ path: string; options: RequestInit }> = [];
    const transport: TeachingEditorTransport = async (path, options) => {
      calls.push({ path, options }); if (options.method === 'POST') { expect(retained.length).toBeGreaterThan(0); expect(JSON.parse(String(options.body))).toEqual(f.input); return f.response.result; }
      return f.response;
    };
    const value = await sendTeachingEditorCommand(f.owner, f.entry, async entry => { retained.push(structuredClone(entry)); }, undefined, transport);
    expect(value.verified).toBe(true); expect(value.entry.result).toEqual(f.response.result); expect(calls.filter(call => call.options.method === 'POST')).toHaveLength(1);
    expect(calls.every(call => (call.options.headers as Record<string, string>)['X-Study-Actor'] === f.owner.actorId)).toBe(true);
    expect(retained.every(entry => teachingHash(entry.input) === teachingHash(f.input))).toBe(true);
    expect(retained.some(entry => entry.phase === 'received')).toBe(true); expect(retained.at(-1)!.phase).toBe('confirmed');
  });
  it('recovers a lost POST response from the original GET without inventing another command or key', async () => {
    const f = await fixture(), calls: string[] = [], retained: TeachingEditorJournal[] = [];
    const transport: TeachingEditorTransport = async (path, options) => { calls.push(path); if (options.method === 'POST') throw Error('Generated lost response after a committed original'); return f.response; };
    const result = await sendTeachingEditorCommand(f.owner, f.entry, async entry => { retained.push(entry); }, undefined, transport);
    expect(result.verified).toBe(true); expect(calls).toHaveLength(2); expect(calls[1]).toContain(encodeURIComponent(f.input.requestKey)); expect(result.entry.input).toEqual(f.input);
    expect(retained.some(entry => entry.phase === 'unknown')).toBe(true);
  });
  it('does not use an acknowledged POST or a null lookup as proof that the original result is settled', async () => {
    const f = await fixture(), retained: TeachingEditorJournal[] = [], transport: TeachingEditorTransport = async (_path, options) => options.method === 'POST' ? f.response.result : null;
    const result = await sendTeachingEditorCommand(f.owner, f.entry, async entry => { retained.push(entry); }, undefined, transport);
    expect(result.verified).toBe(false); expect(result.entry.phase).toBe('received'); expect(result.entry.result).toEqual(f.response.result); expect(result.entry.input).toEqual(f.input);
    expect(result.entry.message).toContain('稍后完成'); expect(retained.at(-1)).toEqual(result.entry);
  });
  it('sends nothing when complete original retention fails', async () => {
    const f = await fixture(); let calls = 0;
    await expect(sendTeachingEditorCommand(f.owner, f.entry, async () => { throw Error('Generated full-copy write failure'); }, undefined, async () => { calls++; return f.response; })).rejects.toThrow('full-copy write failure');
    expect(calls).toBe(0); expect(f.entry.input).toEqual(f.input);
  });
  it('keeps an aborted acknowledged operation unknown and recovers it using the same original request later', async () => {
    const f = await fixture(), controller = new AbortController(), retained: TeachingEditorJournal[] = [];
    await expect(sendTeachingEditorCommand(f.owner, f.entry, async entry => { retained.push(entry); }, controller.signal, async () => { controller.abort(); return f.response.result; })).rejects.toMatchObject({ name: 'AbortError' });
    expect(retained.at(-1)!.phase).toBe('unknown'); expect(retained.at(-1)!.input).toEqual(f.input);
    const result = await lookupTeachingEditorCommand(f.owner, retained.at(-1)!, undefined, async () => f.response); expect(result.verified).toBe(true); expect(result.entry.result).toEqual(f.response.result);
  });
  it('rejects a same-key different original command and retains every original input unchanged', async () => {
    const f = await fixture(), wrong = structuredClone(f.response); if (wrong.input.action !== 'save') throw Error('Original save fixture required'); wrong.input.content.concept.explanation += ' ';
    const result = await sendTeachingEditorCommand(f.owner, f.entry, async () => {}, undefined, async (_path, options) => options.method === 'POST' ? f.response.result : wrong);
    expect(result.verified).toBe(false); expect(result.entry.message).toContain('另一份完整教学命令'); expect(result.entry.input).toEqual(f.input); expect(result.entry.result).toEqual(f.response.result);
  });
  it('does not replace an original result with a newer header or a changed same-key receipt', async () => {
    const f = await fixture(), current = { ...structuredClone(f.response.current), revision: 5 };
    const read = await lookupTeachingEditorCommand(f.owner, f.entry, undefined, async () => ({ ...f.response, current })); expect(read.verified).toBe(true); expect(read.entry.result!.revision).toBe(1);
    if (read.verified) expect(read.current.revision).toBe(5);
    const wrong = structuredClone(f.response); wrong.result.at = '2026-11-01T06:00:00.000Z';
    await expect(lookupTeachingEditorCommand(f.owner, read.entry, undefined, async () => wrong)).rejects.toThrow('原回执与本机保留的回执不同');
    expect(read.entry.result).toEqual(f.response.result);
  });
  it('retains the original operation and propagates current authorization loss so the editor can hide private content', async () => {
    const f = await fixture(), retained: TeachingEditorJournal[] = [], denied = new ApiRequestError('Generated current actor changed', 403);
    await expect(sendTeachingEditorCommand(f.owner, f.entry, async entry => { retained.push(entry); }, undefined, async () => { throw denied; })).rejects.toBe(denied);
    expect(retained.at(-1)!.input).toEqual(f.input); expect(retained.at(-1)!.phase).toBe('unknown');
  });
});

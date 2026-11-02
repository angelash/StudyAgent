import { describe, it, expect } from 'vitest';
import type { TextbookTeachingEditorDetail } from '@study-agent/contracts';
import { teachingFixture } from './textbook-teaching-fixture';
import { prepareTextbookTeachingPackage, teachingHash } from './textbook-teaching-package';
import { prepareTeachingChange } from './textbook-teaching-record';
import { teachingEditorDraftFromDetail, teachingEditorRebaseHeader, teachingEditorConfirmSavedVersion } from '../../../../web/lib/teaching-editor-state';
import { readTeachingEditorDetail, readTeachingEditorSource, readTeachingEditorPreflight } from '../../../../web/lib/teaching-editor-read';
import { teachingEditorBodyFingerprint, teachingEditorSaveCommand, completeTeachingEditorCopy } from '../../../../web/lib/teaching-editor-copy';
import { lookupTeachingEditorCommand } from '../../../../web/lib/teaching-editor-client';

async function fixture() {
  const f = teachingFixture(2), owner = { actorId: 'qa-state-author', bookId: f.source.bookId, bookVersion: f.source.bookVersion, lessonId: f.source.lessonId };
  f.input.content.concept.explanation = ' \n' + f.input.content.concept.explanation + '\n 保留原尾 🧪 ';
  const prepared = prepareTextbookTeachingPackage(f.store, f.input, f.source), change = prepareTeachingChange({ actorId: owner.actorId,
    authorization: { role: 'teacher', accountVersion: 1, sessionId: 'qa-state-session' }, input: f.input, previous: null, at: '2026-11-01T06:00:00.000Z', prepared });
  const detail: TextbookTeachingEditorDetail = { header: change.header, version: change.saved!, source: f.source,
    savedBy: { input: f.input, result: change.command.result }, availability: { available: false, code: 'draft', message: '合成工程稿尚未发布' } };
  const checked = await readTeachingEditorDetail(owner, f.input.packageId, undefined, undefined, async () => detail);
  return { ...f, owner, prepared, change, detail: checked };
}

describe('teaching workspace saved-base separation and source/preflight read boundaries', () => {
  it('opens the entire two-target saved body in a new slot without authenticating imported receipts', async () => {
    const f = await fixture(), original = teachingHash(f.detail), copy = await teachingEditorDraftFromDetail(f.owner, 'new-private-slot', f.detail);
    expect(copy.content).toEqual(f.input.content); expect(copy.targetRefs).toHaveLength(2); expect(copy.source?.pages).toEqual(f.source.pages);
    expect(copy.journal[0].phase).toBe('received'); expect(copy.journal[0].input).toEqual(f.input); expect(copy.journal[0].result).toEqual(f.change.command.result);
    expect(copy.baseline?.bodyFingerprint).toBe(await teachingEditorBodyFingerprint(copy)); expect(teachingHash(f.detail)).toBe(original);
    expect((await completeTeachingEditorCopy(copy)).slot).toBe('new-private-slot');
    expect(() => teachingEditorSaveCommand(copy, 'new-save-without-lookup')).toThrow(/核对原稿基准/);
  });
  it('uses the current header only for CAS while preserving exact old content lineage and all local edits', async () => {
    const f = await fixture(), copy = await teachingEditorDraftFromDetail(f.owner, 'old-content-new-header', f.detail);
    copy.journal[0] = (await lookupTeachingEditorCommand(f.owner, copy.journal[0], undefined, async () => ({ input: f.input, result: f.change.command.result, current: f.detail.header }))).entry;
    copy.content.concept.explanation += '\n当前未保存的新行'; copy.range.end = ' 3 '; copy.editor.publishReason = '独立保留的发布依据';
    copy.rawInputs['visual:0:value:0'] = ' 12x '; copy.sourceReview.pages[0].statement += '\n原审核补记';
    const newer = structuredClone(f.detail); newer.header.revision = 7; newer.header.contentVersion = 3;
    const rebased = teachingEditorRebaseHeader(copy, newer), command = teachingEditorSaveCommand(rebased, 'rebase-explicit-old-content', { baselineVerified: true, verifiedOriginalRequests: [f.input.requestKey] });
    expect(rebased.content).toEqual(copy.content); expect(rebased.rawInputs).toEqual(copy.rawInputs); expect(rebased.sourceReview).toEqual(copy.sourceReview); expect(rebased.range).toEqual(copy.range);
    expect(command.expectedRevision).toBe(7); expect(command.action === 'save' && command.basedOn).toEqual({ contentVersion: 1, contentFingerprint: f.prepared.report.contentFingerprint });
    expect(copy.baseline?.header.revision).toBe(1); expect(rebased.editor.publishReason).toBe(copy.editor.publishReason);
  });
  it.each(['actor', 'lesson', 'version', 'fingerprint', 'older_header'] as const)('refuses a %s rebase without mutating the current complete draft', async kind => {
    const f = await fixture(), copy = await teachingEditorDraftFromDetail(f.owner, 'preserve-before-rebase', f.detail), detail = structuredClone(f.detail), before = teachingHash(copy);
    if (kind === 'actor') detail.header.actorId = 'another-author';
    if (kind === 'lesson') detail.header.lessonId = 'another-lesson';
    if (kind === 'version') detail.version.contentVersion++;
    if (kind === 'fingerprint') detail.version.report.contentFingerprint = 'f'.repeat(64);
    if (kind === 'older_header') { copy.baseline!.header.revision = 3; detail.header.revision = 2; }
    const actualBefore = kind === 'older_header' ? teachingHash(copy) : before;
    expect(() => teachingEditorRebaseHeader(copy, detail)).toThrow(/无法核对/); expect(teachingHash(copy)).toBe(actualBefore);
  });
  it('verifies the full source and every page digest before adopting a source response', async () => {
    const f = await fixture(), calls: RequestInit[] = [];
    const source = await readTeachingEditorSource(f.owner, { start: '2', end: '3' }, undefined, async (_path, options) => { calls.push(options); return f.source; });
    expect(source).toEqual(f.source); expect(JSON.parse(String(calls[0].body))).toEqual({ bookId: f.owner.bookId, bookVersion: f.owner.bookVersion, lessonId: f.owner.lessonId, pageStart: 2, pageEnd: 3 });
    const bad = structuredClone(f.source); bad.pages[0].text += '伪造新增'; bad.pages[0].textCharacters += 4;
    const { fingerprint: _fingerprint, ...body } = bad; bad.fingerprint = teachingHash(body);
    await expect(readTeachingEditorSource(f.owner, { start: '2', end: '3' }, undefined, async () => bad)).rejects.toThrow();
    await expect(readTeachingEditorSource(f.owner, { start: '2', end: '3' }, undefined, async () => ({ ...f.source, lessonId: 'other' }))).rejects.toThrow();
  });
  it.each([{ start: '2x', end: '3' }, { start: '0', end: '3' }, { start: '4', end: '3' }, { start: '1', end: '41' }])('refuses an invalid whole range before I/O', async range => {
    const f = await fixture(); let calls = 0;
    await expect(readTeachingEditorSource(f.owner, range, undefined, async () => { calls++; return f.source; })).rejects.toThrow(); expect(calls).toBe(0);
  });
  it('binds a preflight to the entire original input and targets, even if an altered report has a recomputed public hash', async () => {
    const f = await fixture(), value = await readTeachingEditorPreflight(f.owner, f.input, undefined, async () => f.prepared.report); expect(value).toEqual(f.prepared.report);
    const changed = structuredClone(f.prepared.report); changed.targets[1].atomId = 'another-target';
    const { fingerprint: _fingerprint, ...body } = changed; changed.fingerprint = teachingHash(body);
    await expect(readTeachingEditorPreflight(f.owner, f.input, undefined, async () => changed)).rejects.toThrow(/不一致/);
    const input = structuredClone(f.input); input.content.concept.explanation += '本机新文字';
    await expect(readTeachingEditorPreflight(f.owner, input, undefined, async () => f.prepared.report)).rejects.toThrow(/不一致/);
  });
  it('confirms an older genuine receipt without downgrading a newer exact saved base or changing local edits', async () => {
    const f = await fixture(), input = { ...structuredClone(f.input), requestKey: 'second-genuine-save', expectedRevision: 1,
      basedOn: { contentVersion: 1, contentFingerprint: f.prepared.report.contentFingerprint } };
    input.content.concept.explanation += '\n第二版服务端正文'; const prepared = prepareTextbookTeachingPackage(f.store, input, f.source),
      change = prepareTeachingChange({ actorId: f.owner.actorId, authorization: { role: 'teacher', accountVersion: 1, sessionId: 'qa-state-session' }, input,
        previous: f.detail.header, base: f.change.saved, at: '2026-11-01T06:01:00.000Z', prepared });
    const detail: TextbookTeachingEditorDetail = { ...f.detail, header: change.header, version: change.saved!, savedBy: { input, result: change.command.result } },
      copy = await teachingEditorDraftFromDetail(f.owner, 'keep-newest-edit-base', detail);
    copy.content.concept.explanation += '\n仍未保存的新行'; copy.range.end = ' 3 '; const before = teachingHash(copy);
    const historical = { ...f.detail, header: change.header }, current = await teachingEditorConfirmSavedVersion(copy, historical);
    expect(current).toBe(copy); expect(current.baseline!.contentVersion).toBe(2); expect(teachingHash(current)).toBe(before);
    const old = await teachingEditorDraftFromDetail(f.owner, 'advance-genuine-save', f.detail), advanced = await teachingEditorConfirmSavedVersion(old, detail);
    expect(advanced.baseline!.contentVersion).toBe(2); expect(advanced.content).toEqual(old.content);
  });
  it('retains raw valid numeric characters while comparing submitted content with an exact saved body; unfinished numbers still block submission', async () => {
    const f = await fixture(), copy = await teachingEditorDraftFromDetail(f.owner, 'numeric-body-comparison', f.detail);
    copy.journal[0] = (await lookupTeachingEditorCommand(f.owner, copy.journal[0], undefined, async () => ({ input: f.input, result: f.change.command.result, current: f.detail.header }))).entry;
    copy.content.visuals = [{ kind: 'diagram', diagram: { kind: 'bars', title: '合成比例', labels: ['甲', '乙'], values: [1, 2] }, explanation: '合成比例帮助核对两个数量之间的关系。' }];
    const before = await teachingEditorBodyFingerprint(copy); copy.range = { start: ' 2 ', end: '03' }; copy.rawInputs['visual:0:value:0'] = ' 1.00 ';
    expect(await teachingEditorBodyFingerprint(copy)).toBe(before);
    const proof = { baselineVerified: true, verifiedOriginalRequests: [f.input.requestKey] }, saved = teachingEditorSaveCommand(copy, 'valid-number-original', proof);
    expect(saved.action === 'save' && saved.content.visuals[0]).toEqual(copy.content.visuals[0]);
    expect((await completeTeachingEditorCopy(copy)).rawInputs['visual:0:value:0']).toBe(' 1.00 ');
    copy.rawInputs['visual:0:value:0'] = ' 1x '; expect(() => teachingEditorSaveCommand(copy, 'invalid-number-original', proof)).toThrow(/数值仍有未完成输入/);
  });
});

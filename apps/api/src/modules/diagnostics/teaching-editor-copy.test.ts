import { describe, expect, it } from 'vitest';
import { completeTeachingEditorCopy, emptyTeachingEditorDraft, readTeachingEditorCopy, teachingEditorSaveCommand,
  teachingJournalEntry, teachingEditorValueHash, replaceTeachingVisual, restoreTeachingVisual, removeTeachingClock, teachingClockInput, type TeachingEditorDraft } from '../../../../web/lib/teaching-editor-copy';
import { teachingFixture } from './textbook-teaching-fixture';
import { prepareTeachingChange } from './textbook-teaching-record';
import { prepareTextbookTeachingPackage } from './textbook-teaching-package';
import { saveTeachingEditorLocal, TeachingEditorLocalUnavailable } from '../../../../web/lib/teaching-editor-local';

function draft() {
  const f = teachingFixture(2), owner = { actorId: 'qa:editor', bookId: f.source.bookId, bookVersion: f.source.bookVersion, lessonId: f.source.lessonId },
    body = emptyTeachingEditorDraft(owner, 'qa-local-complete-slot', f.input.packageId, { start: 2, end: 3 });
  Object.assign(body, { source: f.source, sourceReview: f.input.sourceReview, targetRefs: f.input.targetRefs, content: f.input.content });
  return { ...f, owner, body };
}
async function accepted() {
  const f = draft(), input = teachingEditorSaveCommand(f.body, 'qa-complete-original-request'), prepared = prepareTextbookTeachingPackage(f.store, input, f.source),
    change = prepareTeachingChange({ actorId: f.owner.actorId, authorization: { role: 'teacher', accountVersion: 1, sessionId: 'qa-session' },
      input, at: '2026-11-01T04:00:00.000Z', previous: null, prepared }), entry = await teachingJournalEntry(f.owner, input);
  f.body.journal.push({ ...entry, phase: 'confirmed', result: change.command.result });
  f.body.baseline = { header: change.header, contentVersion: change.header.contentVersion, contentFingerprint: change.command.result.contentFingerprint,
    preflightFingerprint: prepared.report.fingerprint, bodyFingerprint: await teachingEditorValueHash(f.body.content) };
  return { ...f, input, change };
}
describe('complete private teaching draft ownership, original commands and receipt recovery', () => {
  it.each(['', ' ', '-', '1e1', '3.5', '13', '0', '三'])('retains unfinished hour %j through full download/import and blocks saving', async raw => {
    const f = draft(); f.body.content.visuals = [{ kind: 'math', figure: { kind: 'clocks', title: '合成钟面', showDigitalTime: false, showHandLabels: true, clocks: [{ hour: 3, minute: 0, caption: ' 原注\n下一行 ' }] }, explanation: '比较长短针' }];
    f.body.rawInputs['visual:0:hour:0'] = raw;
    const restored = (await readTeachingEditorCopy(await completeTeachingEditorCopy(f.body), f.owner)).copy;
    expect(restored.rawInputs['visual:0:hour:0']).toBe(raw); expect(restored.content.visuals).toEqual(f.body.content.visuals);
    expect(teachingClockInput(raw, 'hour')).toBeNull(); expect(() => teachingEditorSaveCommand(restored, 'qa-invalid-clock-hour')).toThrow(/未完成输入/);
  });
  it('relocates raw numbers with surviving visuals and restores each removed original without inheriting another figure input', async () => {
    const f = draft(), model = { kind: 'math' as const, figure: { kind: 'clocks' as const, title: '独立钟面', showDigitalTime: false, showHandLabels: false, clocks: [{ hour: 12, minute: 0, caption: '' }] }, explanation: '保留原针位' };
    f.body.content.visuals = [structuredClone(model), structuredClone(model), structuredClone(model)];
    f.body.rawInputs = { 'visual:0:hour:0': ' 12 ', 'visual:1:minute:0': '6x', 'visual:2:hour:0': '-' };
    replaceTeachingVisual(f.body, 0); expect(f.body.rawInputs).toEqual({ 'visual:0:minute:0': '6x', 'visual:1:hour:0': '-' });
    replaceTeachingVisual(f.body, 0, { kind: 'not_applicable', rationale: '其他解释' }); expect(f.body.rawInputs).toEqual({ 'visual:1:hour:0': '-' });
    restoreTeachingVisual(f.body, 1); expect(f.body.rawInputs['visual:2:minute:0']).toBe('6x');
    restoreTeachingVisual(f.body, 0); expect(f.body.rawInputs['visual:3:hour:0']).toBe(' 12 ');
    expect((await readTeachingEditorCopy(await completeTeachingEditorCopy(f.body), f.owner)).copy.visualHistory).toEqual(f.body.visualHistory);
    expect(() => teachingEditorSaveCommand(f.body, 'qa-restored-clock-inputs')).toThrow(/未完成输入/);
  });
  it('preserves removed clock originals and rebinds the second clock raw input to its surviving model', () => {
    const f = draft(); f.body.content.visuals = [{ kind: 'math', figure: { kind: 'clocks', title: '两面钟', showDigitalTime: false, showHandLabels: false,
      clocks: [{ hour: 3, minute: 0, caption: '第一面' }, { hour: 7, minute: 58, caption: '第二面' }] }, explanation: '合成输入核查' }];
    f.body.rawInputs = { 'visual:0:hour:0': '', 'visual:0:minute:1': '5x' }; removeTeachingClock(f.body, 0, 0);
    expect(f.body.rawInputs).toEqual({ 'visual:0:minute:0': '5x' }); expect(f.body.visualHistory[0].rawInputs).toEqual({ 'visual:0:hour:0': '', 'visual:0:minute:1': '5x' });
    restoreTeachingVisual(f.body, 0); expect(f.body.rawInputs['visual:1:hour:0']).toBe(''); expect(f.body.rawInputs['visual:1:minute:1']).toBe('5x');
  });
  it('accepts exact valid clock text while refusing a mismatched stale numerical model', () => {
    const f = draft(); f.body.content.visuals = [{ kind: 'math', figure: { kind: 'clocks', title: '合成边界', showDigitalTime: true, showHandLabels: true, clocks: [{ hour: 12, minute: 59, caption: '' }] }, explanation: '核对12后连续针位' }];
    f.body.rawInputs = { 'visual:0:hour:0': ' 12 ', 'visual:0:minute:0': '59' };
    expect(teachingEditorSaveCommand(f.body, 'qa-valid-clock-save').action).toBe('save');
    f.body.rawInputs['visual:0:minute:0'] = '58'; expect(() => teachingEditorSaveCommand(f.body, 'qa-stale-clock-save')).toThrow(/未完成输入/);
  });
  it('retains incomplete visual/text fields and exact whitespace without declaring a publishable teaching package', async () => {
    const f = draft(); f.body.content.title = ' \n 合成稿 🧪 \n '; f.body.content.visuals = [{ kind: 'not_applicable', rationale: '' }]; f.body.content.summary.synthesis = '';
    const copy = await completeTeachingEditorCopy(f.body), restored = await readTeachingEditorCopy(copy, f.owner);
    expect(restored.copy.content).toEqual(f.body.content); expect(restored.copy.source?.pages).toEqual(f.source.pages);
    const input = teachingEditorSaveCommand(f.body, 'qa-incomplete-visual-save'), prepared = prepareTextbookTeachingPackage(f.store, input, f.source);
    expect(prepared.report.publishable).toBe(false); expect(prepared.report.gaps.some(gap => gap.code === 'content_incomplete')).toBe(true);
    expect(prepared.input.content.title).toBe(f.body.content.title);
  });
  it('requires fresh original lookups for an imported copy even when it contains a structurally correct actual server receipt', async () => {
    const f = await accepted(), copy = await completeTeachingEditorCopy(f.body), restored = await readTeachingEditorCopy(copy, f.owner);
    expect(restored.verifiedOriginalRequests).toEqual([]); expect(restored.requiresOriginalResultLookup).toBe(true); expect(restored.copy.journal[0].input).toEqual(f.input);
    expect(restored.copy.journal[0].result).toEqual(f.change.command.result); expect(() => teachingEditorSaveCommand(restored.copy, 'qa-next-original-save')).toThrow(/核对原稿基准/);
    const next = teachingEditorSaveCommand(restored.copy, 'qa-next-original-save', { baselineVerified: true, verifiedOriginalRequests: [f.input.requestKey] }); expect(next.expectedRevision).toBe(1);
  });
  it('keeps an unknown command complete and blocks a new dependent request until that same original is resolved', async () => {
    const f = draft(), input = teachingEditorSaveCommand(f.body, 'qa-unknown-original-save');
    f.body.journal = [{ ...await teachingJournalEntry(f.owner, input), phase: 'unknown', message: '连接中断，结果尚待确认。' }];
    const copy = await completeTeachingEditorCopy(f.body); expect(copy.journal[0].input).toEqual(input);
    expect(() => teachingEditorSaveCommand(copy, 'qa-different-next-key', { verifiedOriginalRequests: [input.requestKey] })).toThrow(/同一个原请求/);
  });
  it.each(['actorId', 'bookId', 'bookVersion', 'lessonId'] as const)('never imports a complete private copy into a different %s', async field => {
    const f = draft(), copy = await completeTeachingEditorCopy(f.body); await expect(readTeachingEditorCopy(copy, { ...f.owner, [field]: 'other' })).rejects.toThrow(/账号、教材课时/);
  });
  it.each(['original_text', 'receipt_package', 'receipt_revision', 'source_text', 'source_range', 'extra_field'] as const)('rejects changed %s before overwriting a local copy or preparing any network action', async kind => {
    const f = await accepted(), body = structuredClone(f.body);
    if (kind === 'original_text') { const input = body.journal[0].input; if (input.action === 'save') input.content.concept.explanation += ' '; }
    if (kind === 'receipt_package') body.journal[0].result!.packageId = 'another-package';
    if (kind === 'receipt_revision') body.journal[0].result!.revision++;
    if (kind === 'source_text') body.source!.pages[0].text += '篡改';
    if (kind === 'source_range') body.source!.pageStart = 1;
    if (kind === 'extra_field') (body as any).unretainedOriginal = '不能静默删除的原字段';
    await expect(completeTeachingEditorCopy(body)).rejects.toThrow();
  });
  it('preserves unfinished numeric characters, prior visuals and page review notes in the complete local copy', async () => {
    const f = draft(); f.body.visualHistory.push({ index: 0, visual: structuredClone(f.body.content.visuals[0]) });
    f.body.content.visuals = [{ kind: 'diagram', diagram: { kind: 'bars', title: '未完成比例', labels: ['第一组', '第二组'], values: [10, 20] }, explanation: '' }];
    f.body.rawInputs['visual:0:value:0'] = ' 12x '; f.body.sourceReview.pages[0].statement += '\n 原行保持 ';
    const restored = (await readTeachingEditorCopy(await completeTeachingEditorCopy(f.body), f.owner)).copy;
    expect(restored.rawInputs['visual:0:value:0']).toBe(' 12x '); expect(restored.visualHistory).toEqual(f.body.visualHistory); expect(restored.sourceReview).toEqual(f.body.sourceReview);
    expect(() => teachingEditorSaveCommand(restored, 'qa-incomplete-number')).toThrow(/未完成输入/);
  });
  it('does not save an earlier verified source after the author has changed the requested physical range', async () => {
    const f = draft(); f.body.range.end = '4'; const copy = await completeTeachingEditorCopy(f.body);
    expect(copy.range.end).toBe('4'); expect(copy.source!.pageEnd).toBe(3); expect(() => teachingEditorSaveCommand(copy, 'qa-range-needs-reread')).toThrow(/页码范围已改变/);
  });
  it('archives and reads back complete history above the local storage budget without losing original text or pending commands', async () => {
    const f = draft(), visual: TeachingEditorDraft['visualHistory'][number]['visual'] = { kind: 'table', title: '完整历史表', headers: Array(8).fill('列'),
      rows: Array.from({ length: 40 }, () => Array(8).fill('原'.repeat(1000))), explanation: '' };
    f.body.visualHistory = Array.from({ length: 10 }, () => ({ index: 0, visual: structuredClone(visual) }));
    const input = teachingEditorSaveCommand(f.body, 'qa-large-pending-original');
    f.body.journal = [{ ...await teachingJournalEntry(f.owner, input), phase: 'unknown', message: '原请求结果尚待核对。' }];
    const before = await teachingEditorValueHash(f.body), copy = await completeTeachingEditorCopy(f.body);
    expect(new TextEncoder().encode(JSON.stringify(copy)).length).toBeGreaterThan(8 * 1024 * 1024);
    const restored = await readTeachingEditorCopy(JSON.parse(JSON.stringify(copy)), f.owner);
    expect(restored.copy.visualHistory).toEqual(f.body.visualHistory); expect(restored.copy.source).toEqual(f.body.source);
    expect(restored.copy.journal[0].input).toEqual(input); expect(restored.verifiedOriginalRequests).toEqual([]);
    await expect(saveTeachingEditorLocal(copy, f.owner, f.body.slot, { revision: null, fingerprint: null })).rejects.toBeInstanceOf(TeachingEditorLocalUnavailable);
    expect(await teachingEditorValueHash(f.body)).toBe(before);
  });
});

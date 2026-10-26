import { describe, expect, it } from 'vitest';
import { whiteboardPresentation, type StudioWhiteboard, type StudioWhiteboardScene, type StudioTopicWhiteboard } from '@study-agent/contracts';
import { buildWhiteboardQuestionContext, parseWhiteboardQuestionReply } from './whiteboard-question-context';

function board(): StudioWhiteboard {
  const scenes: StudioWhiteboardScene[] = [
    { id: 'intro', kind: 'concept', title: '统一计数单位', narration: '第一要点。第二要点。', body: '同一整体下比较。', bullets: ['第一要点', '第二要点'],
      targetAtomIds: ['fraction-unit'], source: { materialId: 'source-local', page: 2, label: '合成原页' }, durationMs: 1000 },
    { id: 'table', kind: 'steps', title: '逐行比较', narration: '查看表头。读取第一行。读取第二行。核对最后行。', durationMs: 1000,
      exhibit: { kind: 'table', headers: ['计数单位', '份数'], rows: [['当前第一行', '1'], ['尚未展示第二行', '2'], ['尚未展示第三行', '3'], ['完整尾行', '4']] } },
    { id: 'future', kind: 'check', title: '未来知识块', narration: '未来还没讲到的结论。', body: '保留下一次验证。', durationMs: 1000 },
  ];
  return { id: 'board-one', studentId: 'child-one', subject: 'math', atomId: 'fraction-unit', title: '合成白板', prompt: '理解匿名分数关系',
    scenes, durationMs: 3000, width: 1280, height: 720, fingerprint: 'a'.repeat(64), createdAt: '2026-10-27T00:00:00Z', updatedAt: '2026-10-27T00:00:00Z' };
}
function at(value: StudioWhiteboard | StudioTopicWhiteboard, sceneId = value.scenes[0].id) {
  const unit = whiteboardPresentation(value).units.find(item => item.sceneId === sceneId)!;
  return buildWhiteboardQuestionContext(value, 'kind' in value ? 'topic' : 'guidance', unit.id, value.fingerprint);
}

describe('server-owned frozen whiteboard question context', () => {
  it('binds the exact original sentence and only the notes already revealed at that sentence', () => {
    const result = at(board());
    expect(result.view.position).toMatchObject({ sceneId: 'intro', sentenceText: '第一要点。', presentationVersion: 'whiteboard-speech-v1' });
    expect(result.context.blocks).toHaveLength(1); expect(result.context.blocks[0].bullets).toEqual(['第一要点']);
    expect(result.contextJson).not.toContain('未来还没讲到的结论'); expect(result.contextJson).not.toContain('尚未展示第二行');
    expect(result.context.audience).toBe('student'); expect(result.context.targetAtomIds).toEqual(['fraction-unit']);
  });
  it('includes complete earlier notes but only one whole current table row, without shortening its cells', () => {
    const result = at(board(), 'table');
    expect(result.context.blocks.map(item => item.id)).toEqual(['intro', 'table']);
    expect(result.context.blocks[0].bullets).toEqual(['第一要点', '第二要点']);
    expect(result.context.blocks[1].exhibit).toEqual({ kind: 'table', headers: ['计数单位', '份数'], rows: [['当前第一行', '1']], unshownRows: 3 });
    expect(result.contextJson).not.toContain('尚未展示第二行'); expect(result.contextJson).not.toContain('未来知识块');
  });
  it('retains the entire copyable formula and its last symbol as current readable source', () => {
    const value = board(), latex = '\\begin{aligned}' + 'a+'.repeat(500) + 'z\\end{aligned}';
    value.scenes[0].exhibit = { kind: 'formula', latex, explanation: '原式首尾都保留。' };
    expect(at(value).context.blocks[0].exhibit).toEqual({ kind: 'formula', latex, explanation: '原式首尾都保留。' });
  });
  it('accepts an adult topic without a child profile or fabricated school subject', () => {
    const value = { ...board(), kind: 'ai-topic-whiteboard', studentId: null, subject: null } as unknown as StudioTopicWhiteboard;
    const result = at(value); expect(result.context.audience).toBe('adult'); expect(result.context.subject).toBeNull();
    expect(result.view.boardKind).toBe('topic');
  });
  it('rejects another board kind, a stale fingerprint and a sentence from another original', () => {
    const value = board(), unit = whiteboardPresentation(value).units[0];
    expect(() => buildWhiteboardQuestionContext(value, 'topic', unit.id, value.fingerprint)).toThrow('类型');
    expect(() => buildWhiteboardQuestionContext(value, 'guidance', unit.id, 'b'.repeat(64))).toThrow('版本');
    const foreign = whiteboardPresentation({ ...value, fingerprint: 'c'.repeat(64) }).units[0].id;
    expect(() => buildWhiteboardQuestionContext(value, 'guidance', foreign, value.fingerprint)).toThrow('原句');
  });
  it('rejects ambiguous duplicate scene identities', () => {
    const value = board(); value.scenes[1].id = value.scenes[0].id;
    expect(() => at(value)).toThrow('重复');
  });
  it('selects teaching fields and figure descriptions without private session data, family ids or provider URLs', () => {
    const value = board(); Object.assign(value, { ownerUserId: 'private-owner', tokenHash: 'private-login', familyEvidence: { name: 'private-family-name' } });
    Object.assign(value.scenes[0], { privateKey: 'private-provider-key' });
    value.scenes[0].figure = { snapshotId: 'public-figure-ref', sha256: '1'.repeat(64), originalSha256: '2'.repeat(64), width: 512, height: 512,
      alt: '单位比较图', caption: '合成图示', imageUrl: 'https://private.invalid?token=private-image-token', originalUrl: 'https://private.invalid/original' };
    const result = at(value);
    for (const secret of ['private-owner', 'private-login', 'private-family-name', 'private-provider-key', 'private-image-token', 'https://', 'child-one']) expect(result.contextJson).not.toContain(secret);
    expect(result.context.blocks[0].figure).toMatchObject({ snapshotId: 'public-figure-ref', alt: '单位比较图', caption: '合成图示' });
  });
  it('fences a re-bound child or a future original edit even if the saved display fingerprint was not updated', () => {
    const value = board(), first = at(value); value.studentId = 'child-two'; expect(at(value).contextVersion).not.toBe(first.contextVersion);
    value.studentId = 'child-one'; value.scenes[2].body += '修改后的原结论'; const changed = at(value);
    expect(changed.contextVersion).not.toBe(first.contextVersion); expect(changed.contextJson).toBe(first.contextJson);
  });
  it('returns independent snapshots and stable identities without mutating the original', () => {
    const value = board(), original = JSON.stringify(value), first = at(value, 'table'), second = at(JSON.parse(original), 'table');
    expect(first.contextVersion).toBe(second.contextVersion); expect(first.contentHash).toBe(second.contentHash);
    const table = first.context.blocks[1].exhibit; if (table?.kind === 'table') table.rows[0][0] = '修改本次副本';
    first.view.anchors[0].label = '修改引用副本'; expect(JSON.stringify(value)).toBe(original);
    expect(second.context.blocks[1].exhibit?.kind === 'table' && second.context.blocks[1].exhibit.rows[0][0]).toBe('当前第一行');
  });
  it('bounds earlier teaching explicitly and reports the omitted scope instead of pretending the whole board was sent', () => {
    const value = board(); value.scenes = Array.from({ length: 8 }, (_, index) => ({ id: 'block-' + index, kind: 'concept', title: '知识块' + index, narration: '讲解' + index + '。', body: '完整要点' + index, durationMs: 1 }));
    const result = at(value, 'block-7'); expect(result.context.blocks.map(item => item.id)).toEqual(['block-4', 'block-5', 'block-6', 'block-7']);
    expect(result.context.coverage.earlierSceneCountNotIncluded).toBe(4); expect(result.contextJson).not.toContain('完整要点0');
  });
  it('rejects an oversized necessary block and preserves the original text for a more specific request', () => {
    const value = board(); value.scenes[0].body = '保留完整条件。'.repeat(3000); const original = value.scenes[0].body;
    expect(() => at(value)).toThrow('过长'); expect(value.scenes[0].body).toBe(original);
  });
  it('keeps the complete current block usable when earlier notes exceed the context budget, with explicit omitted coverage', () => {
    const value = board(); value.scenes = [0, 1, 2, 3].map(index => ({ id: 'long-' + index, kind: 'concept', title: '长笔记' + index,
      narration: '当前句' + index + '。', body: index < 3 ? '完整旧块' + index + '字'.repeat(10000) : '当前完整条件与尾部符号z', durationMs: 1 }));
    const result = at(value, 'long-3'); expect(result.context.blocks.map(item => item.id)).toEqual(['long-2', 'long-3']);
    expect(result.context.coverage.earlierSceneCountNotIncluded).toBe(2); expect(result.context.blocks[1].body).toBe('当前完整条件与尾部符号z');
    expect(result.contextJson.length).toBeLessThanOrEqual(18000); expect(result.contextJson).not.toContain('完整旧块0');
  });
});

describe('grounded whiteboard question reply references', () => {
  it('resolves a valid citation to the exact server-owned source and returns an independent copy', () => {
    const prepared = at(board()), source = prepared.view.anchors.find(item => item.source)!;
    const result = parseWhiteboardQuestionReply(prepared, { reply: '先确认计数单位。', anchors: [source.id] });
    expect(result.anchors[0].source).toEqual({ materialId: 'source-local', page: 2, label: '合成原页' });
    result.anchors[0].source!.label = '本次副本'; expect(source.source!.label).toBe('合成原页');
  });
  it('rejects a citation from another whiteboard even when the scene and source ids are identical', () => {
    const value = board(), prepared = at(value); value.id = 'other-board'; const other = at(value);
    expect(() => parseWhiteboardQuestionReply(prepared, { reply: '当前提示', anchors: [other.view.anchors[0].id] })).toThrow('以外');
  });
  it.each([
    { reply: '', anchors: [] }, { reply: '有效文本', anchors: ['invented-reference'] },
    { reply: '有效文本', anchors: [], evidenceIds: ['invented-measurement'] },
    { reply: '字'.repeat(8001), anchors: [] }, { reply: '<unparsed>', anchors: [{ id: 'arbitrary-object' }] },
  ])('rejects malformed or invented evidence instead of publishing it: %j', value => {
    expect(() => parseWhiteboardQuestionReply(at(board()), value)).toThrow();
  });
  it('rejects duplicated citations and accepts a plain explanation without invented citations', () => {
    const prepared = at(board()), id = prepared.view.anchors[0].id;
    expect(() => parseWhiteboardQuestionReply(prepared, { reply: '原句提示', anchors: [id, id] })).toThrow('以外');
    expect(parseWhiteboardQuestionReply(prepared, { reply: '  先说出同一整体。  ' })).toEqual({ reply: '先说出同一整体。', anchors: [] });
  });
});

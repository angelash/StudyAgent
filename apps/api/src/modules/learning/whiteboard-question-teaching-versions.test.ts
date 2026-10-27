import { describe, expect, it } from 'vitest';
import { whiteboardPresentation, type StudioWhiteboard } from '@study-agent/contracts';
import { buildWhiteboardQuestionContext } from './whiteboard-question-context';
import { buildQuestionWhiteboard, whiteboardAnswerFingerprint } from './whiteboard-question-teaching';
import { freezeQuestionVisualContext } from './whiteboard-question-visual-context';
import { adoptQuestionFigure, buildQuestionTeachingVersion, questionTeachingVersions } from './whiteboard-question-teaching-versions';
import type { WhiteboardQuestionRecord } from './whiteboard-question-record';
import type { QuestionVisualRecord } from './whiteboard-question-visual-record';
import { portableRecords } from '../privacy/privacy-records';

function fixture() {
  const source: StudioWhiteboard = { id: 'source', studentId: 'child', subject: 'math', atomId: 'unit', title: '原讲解', prompt: '匿名比较', fingerprint: 'a'.repeat(64),
    width: 1280, height: 720, durationMs: 1000, createdAt: '2026-10-27', updatedAt: '2026-10-27',
    scenes: [{ id: 'intro', title: '条件', kind: 'concept', narration: '先确认相同单位。', durationMs: 1000 }] };
  const unit = whiteboardPresentation(source).units[0], prepared = buildWhiteboardQuestionContext(source, 'guidance', unit.id, source.fingerprint), at = '2026-10-27T00:00:00.000Z';
  const reply = { text: '先把两个长度统一为厘米。再比较相同单位下的数值。', anchors: [], modelId: 'deepseek-v4-flash', modelName: '合成模型', createdAt: at };
  const turn: WhiteboardQuestionRecord = { id: 'turn', ownerUserId: 'owner', studentId: 'child', boardKind: 'guidance', boardId: source.id, intent: 'compare',
    requestKey: 'original-question', modelId: reply.modelId, modelName: reply.modelName, taskId: 'task', inputHash: 'b'.repeat(64), definitionHash: 'c'.repeat(64),
    message: '为什么先统一单位？', position: prepared.view.position, prepared, history: [], commands: [], status: 'completed', revision: 1, createdAt: at, updatedAt: at,
    authorization: { role: 'parent', sessionTokenHash: 'private-session', authorityHash: 'private-authority' }, reply: { ...reply, fingerprint: whiteboardAnswerFingerprint(reply) } };
  const frozen = freezeQuestionVisualContext(turn, { board: source, definitionHash: turn.definitionHash });
  const visual: QuestionVisualRecord = { id: 'whiteboard_question_visual_00000000-0000-4000-8000-000000000001', ownerUserId: turn.ownerUserId, studentId: turn.studentId,
    target: frozen.target, frozenContext: frozen, teachingFingerprint: frozen.teachingFingerprint, input: { target: frozen.target, operation: 'generate', purpose: 'comparison',
      requirements: '比较两段匿名长度。', preflightFingerprint: 'd'.repeat(64), requestKey: 'original-image' }, purpose: 'comparison', requirements: '比较两段匿名长度。', operation: 'generate', changes: null,
    parentVisualId: null, parentOriginal: null, authorization: turn.authorization, modelId: 'gpt-image-2', size: '1536x1024', promptVersion: 'whiteboard-question-image-v1', prompt: 'private-prompt',
    requestKey: 'original-image', requestHash: 'd'.repeat(64), preflightFingerprint: 'd'.repeat(64), taskId: 'image-task', generation: 1, revision: 2, status: 'ready',
    files: { original: { name: 'e'.repeat(64) + '.png', sha256: 'e'.repeat(64), size: 100 }, image: { name: 'f'.repeat(64) + '.png', sha256: 'f'.repeat(64), size: 120 },
      prompt: { name: 'd'.repeat(64) + '.txt', sha256: 'd'.repeat(64), size: 60 } }, width: 1536, height: 1024, commands: [], createdAt: at, updatedAt: at };
  const command = { target: frozen.target, visualId: visual.id, expectedTeachingVersionId: 'original', expectedVisualRevision: visual.revision,
    originalSha256: visual.files!.original.sha256, imageSha256: visual.files!.image.sha256, alt: '匿名长度比较图', caption: '先统一单位', acknowledgeImageReviewed: true, requestKey: 'original-adoption' };
  return { source, turn, visual, command, at };
}

describe('immutable supplementary image adoptions and exact teaching versions', () => {
  it('creates one reviewed version without changing the original reply, speech source or original manuscript', () => {
    const f = fixture(), reply = structuredClone(f.turn.reply), source = structuredClone(f.source), adopted = adoptQuestionFigure(f.turn, f.visual, f.command, f.at);
    expect(adopted.replayed).toBe(false); expect(f.turn.teachingVersions).toHaveLength(1); expect(f.turn.currentTeachingVersionId).toBe(adopted.version.id);
    expect(f.turn.revision).toBe(2); expect(f.turn.reply).toEqual(reply); expect(f.source).toEqual(source);
    const publicVersions = questionTeachingVersions(f.turn); expect(publicVersions.map(version => version.current)).toEqual([false, true]);
    const raw = JSON.stringify(publicVersions); for (const value of ['private-session', 'private-prompt', 'private-authority', f.visual.files!.original.name]) expect(raw).not.toContain(value);
    expect(publicVersions[1].figure).toMatchObject({ originalSha256: f.command.originalSha256, imageSha256: f.command.imageSha256, alt: f.command.alt });
  });
  it('keeps both adopted versions and the unchanged original addressable after a replacement', () => {
    const f = fixture(), original = buildQuestionWhiteboard(f.turn, f.source), first = adoptQuestionFigure(f.turn, f.visual, f.command, f.at).version;
    const saved = buildQuestionTeachingVersion(f.turn, f.source, first.id), other = { ...f.visual, id: 'whiteboard_question_visual_00000000-0000-4000-8000-000000000002' };
    const next = adoptQuestionFigure(f.turn, other, { ...f.command, visualId: other.id, expectedTeachingVersionId: first.id, alt: '另一张完整比较图', requestKey: 'second-adoption' }, '2026-10-27T00:01:00.000Z').version;
    expect(next.previousVersionId).toBe(first.id); expect(buildQuestionTeachingVersion(f.turn, f.source).teachingVersionId).toBe(next.id);
    expect(buildQuestionTeachingVersion(f.turn, f.source, first.id)).toEqual(saved); expect(saved.scenes[0].figure?.alt).toBe(f.command.alt);
    expect(buildQuestionTeachingVersion(f.turn, f.source, 'original')).toEqual({ ...original, teachingVersionId: 'original' });
    expect(saved.scenes[0].narration).toBe(original.scenes[0].narration); expect(saved.fingerprint).not.toBe(original.fingerprint);
    expect(saved.scenes[0].figure?.imageUrl).toContain('/teaching-versions/' + first.id + '/figure/image');
    expect(questionTeachingVersions(f.turn).map(version => version.current)).toEqual([false, false, true]);
  });
  it('replays the original adoption after a newer version without adopting twice or changing the current selection', () => {
    const f = fixture(), first = adoptQuestionFigure(f.turn, f.visual, f.command, f.at).version;
    const second = adoptQuestionFigure(f.turn, f.visual, { ...f.command, expectedTeachingVersionId: first.id, requestKey: 'second-adoption' }, f.at).version;
    const before = structuredClone(f.turn), replay = adoptQuestionFigure(f.turn, f.visual, f.command, f.at);
    expect(replay).toEqual({ version: first, replayed: true }); expect(f.turn.currentTeachingVersionId).toBe(second.id); expect(f.turn).toEqual(before);
  });
  it('rejects a reused adoption key with different requirements without changing either version', () => {
    const f = fixture(); adoptQuestionFigure(f.turn, f.visual, f.command, f.at); const before = structuredClone(f.turn);
    expect(() => adoptQuestionFigure(f.turn, f.visual, { ...f.command, caption: '异参回执不得覆盖' }, f.at)).toThrow('原采用请求'); expect(f.turn).toEqual(before);
  });
  it('rejects a stale competing tab instead of overwriting the committed teaching version', () => {
    const f = fixture(); adoptQuestionFigure(f.turn, f.visual, f.command, f.at); const before = structuredClone(f.turn);
    expect(() => adoptQuestionFigure(f.turn, f.visual, { ...f.command, requestKey: 'competing-adoption' }, f.at)).toThrow('当前采用版本'); expect(f.turn).toEqual(before);
  });
  it('rejects foreign, unfinished, changed and incomplete image candidates before mutating the conversation', () => {
    const changes: Array<Partial<QuestionVisualRecord>> = [{ ownerUserId: 'other-owner' }, { studentId: 'other-child' }, { status: 'generating' }, { files: null }, { revision: 3 }, { width: 1024 }];
    for (const change of changes) { const f = fixture(), before = structuredClone(f.turn); expect(() => adoptQuestionFigure(f.turn, { ...f.visual, ...change }, f.command, f.at)).toThrow(); expect(f.turn).toEqual(before); }
    const f = fixture(), before = structuredClone(f.turn); expect(() => adoptQuestionFigure(f.turn, f.visual, { ...f.command, imageSha256: 'a'.repeat(64) }, f.at)).toThrow(); expect(f.turn).toEqual(before);
  });
  it('detects modified persisted image metadata and reply identities when reading an old version', () => {
    const f = fixture(), version = adoptQuestionFigure(f.turn, f.visual, f.command, f.at).version; version.figure.caption += '未冻结改写';
    expect(() => buildQuestionTeachingVersion(f.turn, f.source, version.id)).toThrow('身份已变化');
    const other = fixture(), adopted = adoptQuestionFigure(other.turn, other.visual, other.command, other.at).version; other.turn.reply!.text += '改变原回答。';
    expect(() => buildQuestionTeachingVersion(other.turn, other.source, adopted.id)).toThrow();
  });
  it('does not project another original or a changed original identity into a saved teaching version', () => {
    const f = fixture(), version = adoptQuestionFigure(f.turn, f.visual, f.command, f.at).version;
    expect(() => buildQuestionTeachingVersion(f.turn, { ...f.source, id: 'other-original' }, version.id)).toThrow('原白板');
    expect(() => buildQuestionTeachingVersion(f.turn, { ...f.source, fingerprint: 'b'.repeat(64) }, version.id)).toThrow('原白板');
  });
  it('exports actual public version metadata while excluding private file descriptors and adoption commands', () => {
    const f = fixture(); adoptQuestionFigure(f.turn, f.visual, f.command, f.at); const before = structuredClone(f.turn);
    const exported = portableRecords({ whiteboardQuestionTurns: [f.turn] }, f.turn.ownerUserId), row = exported.whiteboardQuestionTurns[0] as Record<string, unknown>;
    expect(row.teachingVersions).toEqual(questionTeachingVersions(f.turn).slice(1));
    for (const field of ['authorization', 'prepared', 'history', 'inputHash', 'definitionHash', 'taskId', 'commands', 'figureAdoptionCommands']) expect(row).not.toHaveProperty(field);
    for (const value of ['private-session', 'private-authority', f.visual.files!.original.name, 'original-adoption']) expect(JSON.stringify(row)).not.toContain(value);
    expect(portableRecords({ whiteboardQuestionTurns: [f.turn] }, 'other-owner').whiteboardQuestionTurns).toEqual([]); expect(f.turn).toEqual(before);
  });
});

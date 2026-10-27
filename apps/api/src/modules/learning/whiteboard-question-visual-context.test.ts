import { describe, expect, it } from 'vitest';
import { questionVisualPreflightSchema, questionVisualAdoptSchema, whiteboardPresentation, type StudioTopicWhiteboard, type StudioWhiteboard } from '@study-agent/contracts';
import { buildWhiteboardQuestionContext } from './whiteboard-question-context';
import { parseWhiteboardQuestionTeaching, whiteboardAnswerFingerprint } from './whiteboard-question-teaching';
import { freezeQuestionVisualContext, questionVisualPrompt } from './whiteboard-question-visual-context';
import type { WhiteboardQuestionRecord } from './whiteboard-question-record';

function fixture(long = false) {
  const source: StudioTopicWhiteboard = { id: 'original', kind: 'ai-topic-whiteboard', studentId: null, subject: null, title: '匿名成人：比较长度', prompt: '解释单位',
    origin: { draftId: null, modelId: 'deepseek-v4-flash', modelName: '合成模型', review: null, teacherReviewStatus: 'pending', formalMeasurementEligible: false },
    fingerprint: 'a'.repeat(64), width: 1280, height: 720, durationMs: 1000, createdAt: '2026-10-27', updatedAt: '2026-10-27',
    scenes: [{ id: 'intro', kind: 'concept', title: '单位与条件', narration: '先确认相同计量单位。', bullets: ['相同计量单位'], durationMs: 1000 }] };
  const unit = whiteboardPresentation(source).units[0], prepared = buildWhiteboardQuestionContext(source, 'topic', unit.id, source.fingerprint);
  const input = { reply: '先统一计量单位。再核对整体条件。最后解释换算公式。' + (long ? '另一个匿名条件。'.repeat(600) : ''), anchors: [prepared.view.anchors[0].id],
    board: { title: '比较的条件', points: ['统一单位'], diagram: null, table: { title: '同维度比较', headers: ['对象', '条件'], rows: [['甲', '单位相同'], ['乙', '整体相同']] },
      formulas: Array.from({ length: long ? 3 : 1 }, () => ({ label: '换算', latex: long ? 'a+'.repeat(1900) + 'z' : '1\\,m=100\\,cm', meaning: '保留完整单位关系。' })),
      anchors: { points: ['先统一计量单位'], tableRows: ['先统一计量单位', '再核对整体条件'], formulas: Array.from({ length: long ? 3 : 1 }, () => '最后解释换算公式') } } };
  const parsed = parseWhiteboardQuestionTeaching(prepared, input), reply = { text: parsed.reply, board: parsed.board, speech: parsed.speech, anchors: parsed.anchors,
    modelId: 'deepseek-v4-flash', modelName: '合成模型', createdAt: '2026-10-27' };
  const turn: WhiteboardQuestionRecord = { id: 'turn', ownerUserId: 'PRIVATE-OWNER', studentId: null, boardKind: 'topic', boardId: source.id, intent: 'compare',
    requestKey: 'original-request', createdAt: reply.createdAt, updatedAt: reply.createdAt, revision: 1, modelId: reply.modelId, modelName: reply.modelName,
    taskId: 'original-task', inputHash: 'd'.repeat(64), history: [], commands: [],
    definitionHash: 'c'.repeat(64), status: 'completed', message: long ? '完整问题。'.repeat(400) : '为什么先统一单位？', position: prepared.view.position,
    authorization: { role: 'parent', sessionTokenHash: 'PRIVATE-SESSION', authorityHash: 'PRIVATE-AUTHORITY' }, prepared,
    reply: { ...reply, fingerprint: whiteboardAnswerFingerprint(reply) } };
  return { source, turn, current: { board: source, definitionHash: turn.definitionHash } };
}

describe('explicit original-answer image targets and complete private-free teaching context', () => {
  it('preserves the complete original sentence, answer, table and formula without moving private record fields into the prompt', () => {
    const value = fixture(), before = structuredClone(value), context = freezeQuestionVisualContext(value.turn, value.current);
    expect(context.target).toMatchObject({ targetKind: 'whiteboard-question', boardKind: 'topic', boardId: value.source.id, turnId: value.turn.id, replyFingerprint: value.turn.reply!.fingerprint });
    expect(context.teaching).toMatchObject({ audience: 'adult', originalSentence: value.turn.position.sentenceText, reply: value.turn.reply!.text,
      board: { table: value.turn.reply!.board!.table, formulas: value.turn.reply!.board!.formulas } });
    const prompt = questionVisualPrompt(context, { target: context.target, purpose: 'comparison', requirements: '比较统一前后的单位。', operation: 'generate' });
    for (const privateValue of ['PRIVATE-OWNER', 'PRIVATE-SESSION', 'PRIVATE-AUTHORITY', 'sessionTokenHash', 'authorization']) expect(prompt).not.toContain(privateValue);
    expect(prompt).toContain('1\\\\,m=100\\\\,cm'); expect(value).toEqual(before);
  });
  it('refuses another original kind with the same id and refuses a changed original version or sentence', () => {
    const value = fixture(), { kind: _kind, origin: _origin, ...guidance } = value.source;
    const other: StudioWhiteboard = { ...guidance, studentId: 'other-child', subject: 'math', atomId: 'unit' };
    expect(() => freezeQuestionVisualContext(value.turn, { ...value.current, board: other })).toThrow('原白板');
    expect(() => freezeQuestionVisualContext(value.turn, { ...value.current, definitionHash: 'd'.repeat(64) })).toThrow('原稿');
    value.turn.position.sentenceText = '别的原句。'; expect(() => freezeQuestionVisualContext(value.turn, value.current)).toThrow('原句');
  });
  it('rejects unpublished and changed answers before building image context', () => {
    const value = fixture(); value.turn.status = 'running'; expect(() => freezeQuestionVisualContext(value.turn, value.current)).toThrow('尚未完成');
    value.turn.status = 'completed'; value.turn.reply!.text += '迟到改写。'; expect(() => freezeQuestionVisualContext(value.turn, value.current)).toThrow();
  });
  it('rejects a target from another reply or modified frozen context before composing a supplier prompt', () => {
    const value = fixture(), context = freezeQuestionVisualContext(value.turn, value.current), input = { target: context.target, purpose: 'concept' as const, requirements: '解释完整单位关系。', operation: 'generate' as const };
    expect(() => questionVisualPrompt(context, { ...input, target: { ...context.target, replyFingerprint: 'b'.repeat(64) } })).toThrow('目标');
    context.teaching.reply += '未冻结的内容。'; expect(() => questionVisualPrompt(context, input)).toThrow('冻结');
  });
  it('keeps long conditions and formula tails intact and explicitly refuses a complete context over budget', () => {
    const value = fixture(true), before = structuredClone(value); expect(() => freezeQuestionVisualContext(value.turn, value.current)).toThrow('不会截断'); expect(value).toEqual(before);
    expect(value.turn.reply!.board!.formulas![2].latex.endsWith('z')).toBe(true);
  });
  it('retains a legacy text-only answer without manufacturing extracted board content', () => {
    const value = fixture(); delete value.turn.reply!.board; delete value.turn.reply!.speech; delete value.turn.reply!.fingerprint;
    const context = freezeQuestionVisualContext(value.turn, value.current); expect(context.teaching.board).toBeNull(); expect(context.teaching.reply).toBe(value.turn.reply!.text);
  });
  it('requires the explicit answer target and refuses fake draft or arbitrary image fields', () => {
    const value = fixture(), target = freezeQuestionVisualContext(value.turn, value.current).target, command = { target, purpose: 'concept', requirements: '完整说明单位。', operation: 'generate' };
    expect(questionVisualPreflightSchema.safeParse(command).success).toBe(true);
    for (const extra of [{ draftId: 'fake-topic-draft' }, { imageUrl: 'https://example.test/arbitrary.png' }]) expect(questionVisualPreflightSchema.safeParse({ ...command, ...extra }).success).toBe(false);
    expect(questionVisualPreflightSchema.safeParse({ ...command, target: { ...target, targetKind: 'topic-draft' } }).success).toBe(false);
    expect(questionVisualPreflightSchema.safeParse({ ...command, operation: 'edit', parentVisualId: 'topic_whiteboard_visual_00000000-0000-4000-8000-000000000001', changes: '保留原图其余部分。' }).success).toBe(false);
  });
  it('binds explicit adoption to reviewed bytes, a stable command and the expected teaching version', () => {
    const value = fixture(), target = freezeQuestionVisualContext(value.turn, value.current).target, command = { target, visualId: 'whiteboard_question_visual_00000000-0000-4000-8000-000000000001',
      expectedTeachingVersionId: 'original', expectedVisualRevision: 2, originalSha256: 'e'.repeat(64), imageSha256: 'f'.repeat(64), alt: '匿名单位比较图', caption: '核对单位', acknowledgeImageReviewed: true, requestKey: 'original-adoption-key' };
    expect(questionVisualAdoptSchema.safeParse(command).success).toBe(true);
    for (const changed of [{ acknowledgeImageReviewed: false }, { originalSha256: '' }, { expectedTeachingVersionId: 'unbound' }, { requestKey: '' }]) expect(questionVisualAdoptSchema.safeParse({ ...command, ...changed }).success).toBe(false);
  });
});

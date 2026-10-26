import { describe, expect, it } from 'vitest';
import { topicVisualGenerateSchema, topicVisualEditSchema, topicWhiteboardFigureSchema } from '@study-agent/contracts';
import { freezeTopicVisualContext, topicVisualPrompt } from './topic-whiteboard-visual-context';
import type { TopicWhiteboardDraftRecord } from './topic-whiteboard-record';

function draft() {
  return { id: 'private-original', status: 'ready', authorization: { sessionTokenHash: 'NEVER SEND AUTH' },
    privateFamilyEvidence: 'NEVER SEND FAMILY ANSWERS',
    prepared: { fingerprint: 'a'.repeat(64), grade: null, targets: [],
      input: { audience: { kind: 'adult' }, prompt: '匿名观察与推断', objective: '保留适用条件' } },
    content: { scenes: [{ kind: 'concept', title: '先核对观察', narration: '观察需要条件。', body: '保持对象一致。',
      bullets: ['观察需要条件。'], targetAtomIds: [], exhibit: null }] } } as unknown as TopicWhiteboardDraftRecord;
}
const command = { draftId: 'private-original', sceneIndex: 0, expectedRevision: 3, contentFingerprint: 'a'.repeat(64),
  purpose: 'concept', requirements: '用清晰标签保留观察条件', operation: 'generate', preflightFingerprint: 'b'.repeat(64), requestKey: 'original-image-key' };
const imageId = 'topic_whiteboard_visual_12345678-1234-1234-1234-123456789abc';

describe('frozen topic figure teaching context', () => {
  it('sends only the intended scene, original goal and approved targets without login or family answer data', () => {
    const row = draft(), context = freezeTopicVisualContext(row, 0), prompt = topicVisualPrompt(context, topicVisualGenerateSchema.parse(command));
    expect(prompt).toContain('观察需要条件。'); expect(prompt).toContain('保留适用条件');
    expect(prompt).not.toContain('NEVER SEND'); expect(prompt).not.toContain('sessionTokenHash');
    expect(context.sceneTeachingFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
  it('binds the same words to their exact original draft, position and approved input, while excluding future figure references', () => {
    const original = draft(), expected = freezeTopicVisualContext(original, 0).sceneTeachingFingerprint;
    (original.content!.scenes[0] as any).figure = { visualId: imageId, alt: '已选图的说明' };
    expect(freezeTopicVisualContext(original, 0).sceneTeachingFingerprint).toBe(expected);
    for (const change of [(row: any) => { row.id = 'another-original'; }, (row: any) => { row.prepared.fingerprint = 'c'.repeat(64); },
      (row: any) => { row.content.scenes[0].body = '不能悄悄更换这些条件。'; }]) {
      const row = draft(); change(row); expect(freezeTopicVisualContext(row, 0).sceneTeachingFingerprint).not.toBe(expected);
    }
    const row = draft(); row.content!.scenes.push(structuredClone(row.content!.scenes[0]));
    expect(freezeTopicVisualContext(row, 1).sceneTeachingFingerprint).not.toBe(expected);
  });
  it('rejects unavailable scenes, newly invented targets and oversized context instead of silently trimming it', () => {
    for (const index of [-1, 0.5, 8]) expect(() => freezeTopicVisualContext(draft(), index)).toThrow('topic_figure_scene_unavailable');
    const row = draft(); row.status = 'confirmed'; expect(() => freezeTopicVisualContext(row, 0)).toThrow('topic_figure_scene_unavailable');
    row.status = 'ready'; row.content!.scenes[0].targetAtomIds = ['unapproved']; expect(() => freezeTopicVisualContext(row, 0)).toThrow('topic_figure_target_changed');
    row.content!.scenes[0].targetAtomIds = []; row.content!.scenes[0].body = '完整'.repeat(10000);
    expect(() => freezeTopicVisualContext(row, 0)).toThrow('topic_figure_context_budget');
  });
  it('requires a real bound image identity for edits and rejects URLs, arbitrary models or missing alternative text', () => {
    expect(topicVisualGenerateSchema.safeParse({ ...command, imageUrl: 'https://invalid.test/image.png' }).success).toBe(false);
    expect(topicVisualGenerateSchema.safeParse({ ...command, modelId: 'some-other-model' }).success).toBe(false);
    expect(topicVisualEditSchema.safeParse({ ...command, operation: 'edit', parentVisualId: imageId, changes: '仅移除图片顶部标题' }).success).toBe(true);
    expect(topicVisualEditSchema.safeParse({ ...command, operation: 'edit', parentVisualId: 'https://invalid.test/image.png', changes: '修改标题' }).success).toBe(false);
    expect(topicWhiteboardFigureSchema.safeParse({ visualId: imageId, alt: '', caption: '' }).success).toBe(false);
  });
});

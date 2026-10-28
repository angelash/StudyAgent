import { topicWhiteboardDigest } from './topic-whiteboard-digest';
export { topicWhiteboardDigest } from './topic-whiteboard-digest';
export { topicWhiteboardJsonSchema, topicWhiteboardReviewJsonSchema } from './topic-whiteboard-schema';
import { z } from 'zod';
import { topicWhiteboardContentSchema, type TopicWhiteboardContent, type TopicWhiteboardInput } from '@study-agent/contracts';
import type { PreparedAssistantWhiteboard } from './assistant-whiteboard-source';
import { validateAssistantWhiteboardContent, validateAssistantWhiteboardReview } from './assistant-whiteboard-content';

export const topicWhiteboardVersion = 'topic-whiteboard-v1' as const;
export const topicWhiteboardTaskKind = 'studio.topic-whiteboard.generate';
export type TopicWhiteboardTarget = { id: string; name: string; objective: string; definitionFingerprint: string;
  teaching?: { explanation: string; example: { prompt: string; steps: string[]; conclusion: string } } };
export type PreparedFreeTopicWhiteboard = {
  version: typeof topicWhiteboardVersion; input: TopicWhiteboardInput; modelId: string; modelName: string;
  grade: number | null; scopeFingerprint: string | null; targets: TopicWhiteboardTarget[];
  context: string; fingerprint: string;
};
export type PreparedTopicWhiteboard = PreparedFreeTopicWhiteboard | PreparedAssistantWhiteboard;
type ContentPrepared = Pick<PreparedFreeTopicWhiteboard, 'input' | 'targets'> | PreparedAssistantWhiteboard;
export function validateTopicWhiteboardContent(prepared: ContentPrepared, value: unknown,
  options: { allowFigures?: boolean } = {}): TopicWhiteboardContent {
  if ('version' in prepared && prepared.version === 'assistant-topic-whiteboard-v1') return validateAssistantWhiteboardContent(prepared, value, options);
  if (prepared.input.audience.kind === 'assistant' || 'version' in prepared && String(prepared.version) !== topicWhiteboardVersion)
    throw Error('topic_whiteboard_unknown_protocol');
  const content = topicWhiteboardContentSchema.parse(value), expected = new Set(prepared.targets.map(target => target.id));
  if (!options.allowFigures && content.scenes.some(scene => scene.figure)) throw Error('topic_whiteboard_model_figure_forbidden');
  if (prepared.input.audience.kind === 'adult') {
    if (expected.size || content.scenes.some(scene => scene.targetAtomIds.length)) throw new Error('topic_whiteboard_adult_target_mismatch');
  } else {
    if (!expected.size || new Set(prepared.input.audience.atomIds).size !== expected.size || prepared.input.audience.atomIds.some(id => !expected.has(id)))
      throw new Error('topic_whiteboard_frozen_target_mismatch');
    if (content.scenes.some(scene => !scene.targetAtomIds.length || scene.targetAtomIds.some(id => !expected.has(id))))
      throw new Error('topic_whiteboard_target_outside_scope');
    const covered = new Set(content.scenes.flatMap(scene => scene.targetAtomIds));
    if ([...expected].some(id => !covered.has(id))) throw new Error('topic_whiteboard_missing_target');
  }
  return content;
}
export const topicWhiteboardReviewSchema = z.object({ decision: z.enum(['pass', 'revised', 'uncertain']),
  issues: z.array(z.string().trim().min(1).max(600)).max(12), revisedContent: topicWhiteboardContentSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.decision === 'pass' && (value.issues.length || value.revisedContent)) context.addIssue({ code: 'custom', message: 'pass需要无问题且无修改' });
  if (value.decision === 'revised' && (!value.issues.length || !value.revisedContent)) context.addIssue({ code: 'custom', message: '修订需说明具体问题并给出完整结果' });
  if (value.decision === 'uncertain' && (!value.issues.length || value.revisedContent)) context.addIssue({ code: 'custom', message: '不确定需列具体问题并保留原稿' });
});
export function validateTopicWhiteboardReview(prepared: ContentPrepared, original: TopicWhiteboardContent, value: unknown) {
  if ('version' in prepared && prepared.version === 'assistant-topic-whiteboard-v1') return validateAssistantWhiteboardReview(prepared, original, value);
  const review = topicWhiteboardReviewSchema.parse(value), content = validateTopicWhiteboardContent(prepared, review.revisedContent ?? original);
  if (review.decision === 'revised' && topicWhiteboardDigest(content) === topicWhiteboardDigest(original)) throw new Error('topic_whiteboard_empty_revision');
  return { decision: review.decision, issues: review.issues, content };
}

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { topicWhiteboardContentSchema, type TopicWhiteboardContent, type TopicWhiteboardInput } from '@study-agent/contracts';

export const topicWhiteboardVersion = 'topic-whiteboard-v1' as const;
export const topicWhiteboardTaskKind = 'studio.topic-whiteboard.generate';
export type TopicWhiteboardTarget = { id: string; name: string; objective: string; definitionFingerprint: string;
  teaching?: { explanation: string; example: { prompt: string; steps: string[]; conclusion: string } } };
export type PreparedTopicWhiteboard = {
  version: typeof topicWhiteboardVersion; input: TopicWhiteboardInput; modelId: string; modelName: string;
  grade: number | null; scopeFingerprint: string | null; targets: TopicWhiteboardTarget[];
  context: string; fingerprint: string;
};
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function topicWhiteboardDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function validateTopicWhiteboardContent(prepared: Pick<PreparedTopicWhiteboard, 'input' | 'targets'>, value: unknown): TopicWhiteboardContent {
  const content = topicWhiteboardContentSchema.parse(value), expected = new Set(prepared.targets.map(target => target.id));
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
export function validateTopicWhiteboardReview(prepared: Pick<PreparedTopicWhiteboard, 'input' | 'targets'>, original: TopicWhiteboardContent, value: unknown) {
  const review = topicWhiteboardReviewSchema.parse(value), content = validateTopicWhiteboardContent(prepared, review.revisedContent ?? original);
  if (review.decision === 'revised' && topicWhiteboardDigest(content) === topicWhiteboardDigest(original)) throw new Error('topic_whiteboard_empty_revision');
  return { decision: review.decision, issues: review.issues, content };
}

const text = (maxLength: number, minLength = 1) => ({ type: 'string', minLength, maxLength });
const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const array = (items: unknown, minItems: number, maxItems: number) => ({ type: 'array', items, minItems, maxItems });
export const topicWhiteboardJsonSchema = object({
  title: text(120), description: text(600, 3), scenes: array(object({
    kind: { type: 'string', enum: ['title', 'concept', 'steps', 'check'] }, title: text(120),
    narration: text(1800, 3), body: text(1000, 0), bullets: array(text(240), 0, 6), targetAtomIds: array(text(180), 0, 6),
    exhibit: { anyOf: [object({ kind: { const: 'table', type: 'string' }, headers: array(text(120), 2, 5), rows: array(array(text(240), 2, 5), 1, 12) }),
      object({ kind: { const: 'formula', type: 'string' }, latex: text(600), explanation: text(1000) }), { type: 'null' }] },
  }), 3, 8),
});
export const topicWhiteboardReviewJsonSchema = object({ decision: { type: 'string', enum: ['pass', 'revised', 'uncertain'] },
  issues: array(text(600), 0, 12), revisedContent: { anyOf: [topicWhiteboardJsonSchema, { type: 'null' }] },
});

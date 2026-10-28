import { z } from 'zod';
import { assistantWhiteboardContentSchema, type AssistantWhiteboardContent } from '@study-agent/contracts';
import { assertPreparedAssistantWhiteboard, type PreparedAssistantWhiteboard } from './assistant-whiteboard-source';
import { topicWhiteboardDigest } from './topic-whiteboard-digest';
import { topicWhiteboardJsonSchema, topicWhiteboardReviewJsonSchema } from './topic-whiteboard-schema';

export function validateAssistantWhiteboardContent(prepared: PreparedAssistantWhiteboard, value: unknown,
  options: { allowFigures?: boolean } = {}): AssistantWhiteboardContent {
  assertPreparedAssistantWhiteboard(prepared);
  const content = assistantWhiteboardContentSchema.parse(value), messages = new Map(prepared.source.origin.messages.map(message => [message.id, message]));
  for (const scene of content.scenes) {
    if (scene.targetAtomIds.length) throw Error('assistant_whiteboard_formal_target_forbidden');
    if (!options.allowFigures && scene.figure) throw Error('assistant_whiteboard_model_figure_forbidden');
    const references = new Set<string>();
    for (const id of scene.sourceMap.messageIds) {
      const message = messages.get(id); if (!message) throw Error('assistant_whiteboard_unknown_source_message');
      for (const reference of message.sourceReferences) references.add(reference.key);
    }
    if (scene.sourceMap.referenceKeys.some(key => !references.has(key))) throw Error('assistant_whiteboard_reference_outside_mapped_messages');
  }
  return content;
}

export const assistantWhiteboardReviewSchema = z.object({ decision: z.enum(['pass', 'revised', 'uncertain']),
  issues: z.array(z.string().trim().min(1).max(600)).max(12), revisedContent: assistantWhiteboardContentSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.decision === 'pass' && (value.issues.length || value.revisedContent)) context.addIssue({ code: 'custom', message: 'pass需要无问题且无修改' });
  if (value.decision === 'revised' && (!value.issues.length || !value.revisedContent)) context.addIssue({ code: 'custom', message: '修订需说明具体问题并给出完整结果' });
  if (value.decision === 'uncertain' && (!value.issues.length || value.revisedContent)) context.addIssue({ code: 'custom', message: '不确定需列具体问题并保留原稿' });
});
export function validateAssistantWhiteboardReview(prepared: PreparedAssistantWhiteboard, original: unknown, value: unknown) {
  const initial = validateAssistantWhiteboardContent(prepared, original), review = assistantWhiteboardReviewSchema.parse(value);
  const content = review.revisedContent ? validateAssistantWhiteboardContent(prepared, review.revisedContent) : initial;
  if (review.decision === 'revised' && topicWhiteboardDigest(content) === topicWhiteboardDigest(initial)) throw Error('assistant_whiteboard_empty_revision');
  return { decision: review.decision, issues: review.issues, content };
}

type JsonSchema = { [key: string]: unknown; properties?: Record<string, JsonSchema>; items?: JsonSchema; required?: string[] };
const text = (minLength: number, maxLength: number) => ({ type: 'string', minLength, maxLength });
const mapJsonSchema = { type: 'object', additionalProperties: false,
  properties: { messageIds: { type: 'array', items: text(1, 180), minItems: 0, maxItems: 20, uniqueItems: true },
    referenceKeys: { type: 'array', items: text(1, 180), minItems: 0, maxItems: 40, uniqueItems: true },
    status: { type: 'string', enum: ['sourced', 'supplementary'] }, explanation: text(3, 600) },
  required: ['messageIds', 'referenceKeys', 'status', 'explanation'] };
export const assistantWhiteboardJsonSchema = structuredClone(topicWhiteboardJsonSchema) as unknown as JsonSchema;
const scene = assistantWhiteboardJsonSchema.properties!.scenes.items!;
scene.properties!.sourceMap = mapJsonSchema; scene.required!.push('sourceMap');
export const assistantWhiteboardReviewJsonSchema = structuredClone(topicWhiteboardReviewJsonSchema) as unknown as JsonSchema;
assistantWhiteboardReviewJsonSchema.properties!.revisedContent = { anyOf: [assistantWhiteboardJsonSchema, { type: 'null' }] };

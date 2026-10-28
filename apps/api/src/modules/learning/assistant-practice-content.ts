import { ASSISTANT_PRACTICE_CONTENT_PROTOCOL, assistantPracticeContentSchema, assistantPracticeContentReviewSchema,
  type AssistantPracticeContent, type AssistantPracticeLearnerProjection } from '@study-agent/contracts';
import { assertPreparedAssistantPractice, type PreparedAssistantPractice } from './assistant-practice-source';
import { topicWhiteboardDigest as digest } from './topic-whiteboard-digest';

export function validateAssistantPracticeContent(prepared: PreparedAssistantPractice, value: unknown): AssistantPracticeContent {
  assertPreparedAssistantPractice(prepared);
  const content = assistantPracticeContentSchema.parse(value), messages = new Map(prepared.source.origin.messages.map(message => [message.id, message]));
  const expectedTargets = new Set(prepared.targetScope.kind === 'student' ? prepared.targetScope.targets.map(target => target.atomId) : []);
  const covered = new Set<string>();
  for (const question of content.questions) {
    if (question.targetAtomIds.length !== (prepared.targetScope.kind === 'student' ? 1 : 0)
      || question.targetAtomIds.some(id => !expectedTargets.has(id))) throw Error('assistant_practice_question_target_mismatch');
    question.targetAtomIds.forEach(id => covered.add(id));
    const references = new Set<string>();
    for (const id of question.sourceMap.messageIds) {
      const message = messages.get(id); if (!message) throw Error('assistant_practice_unknown_source_message');
      message.sourceReferences.forEach(reference => references.add(reference.key));
    }
    if (question.sourceMap.referenceKeys.some(key => !references.has(key))) throw Error('assistant_practice_reference_outside_mapped_messages');
  }
  if ([...expectedTargets].some(id => !covered.has(id))) throw Error('assistant_practice_uncovered_target');
  return content;
}

export function validateAssistantPracticeReview(prepared: PreparedAssistantPractice, original: unknown, value: unknown) {
  const initial = validateAssistantPracticeContent(prepared, original), review = assistantPracticeContentReviewSchema.parse(value);
  const content = review.revisedContent === null ? initial : validateAssistantPracticeContent(prepared, review.revisedContent);
  if (review.decision === 'revised' && digest(content) === digest(initial)) throw Error('assistant_practice_empty_revision');
  return { decision: review.decision, issues: review.issues, content };
}

export function projectAssistantPracticeForLearner(prepared: PreparedAssistantPractice, value: unknown): AssistantPracticeLearnerProjection {
  const content = validateAssistantPracticeContent(prepared, value);
  return { protocol: content.protocol, title: content.title, objective: content.objective,
    questions: content.questions.map(question => ({ id: question.id, kind: question.kind, prompt: question.prompt,
      options: question.options.map(option => ({ id: option.id, label: option.label })), reasonPrompt: question.reasonPrompt })) };
}

const text = (minLength: number, maxLength: number) => ({ type: 'string', minLength, maxLength });
const ids = (maxItems: number) => ({ type: 'array', items: text(1, 180), maxItems, uniqueItems: true });
const texts = (minItems: number, maxItems: number, maxLength: number) => ({ type: 'array', items: text(3, maxLength), minItems, maxItems });
const object = <T extends Record<string, unknown>>(properties: T) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });

/** Structural generation contract. Cross-field selection, canonical uniqueness and budgets are checked again locally. */
export const assistantPracticeContentJsonSchema = object({
  protocol: { type: 'string', enum: [ASSISTANT_PRACTICE_CONTENT_PROTOCOL] }, title: text(3, 160), objective: text(3, 1000),
  questions: { type: 'array', minItems: 2, maxItems: 6, items: object({
    id: text(1, 180), kind: { type: 'string', enum: ['classification', 'open_response'] }, prompt: text(3, 5000), reasonPrompt: text(3, 1000),
    options: { type: 'array', minItems: 0, maxItems: 6, items: object({ id: text(1, 180), label: text(1, 600) }) },
    referenceOptionId: { anyOf: [text(1, 180), { type: 'null' }] }, referenceExplanation: text(3, 4000),
    applicableConditions: texts(1, 6, 600), reasoningCriteria: texts(1, 6, 600), hints: texts(1, 3, 1200),
    contrast: object({ prompt: text(3, 2500), referenceExplanation: text(3, 2500) }), targetAtomIds: ids(1),
    sourceMap: object({ messageIds: ids(20), referenceKeys: ids(40), status: { type: 'string', enum: ['sourced', 'supplementary'] }, explanation: text(3, 600) }),
  }) },
});
export const assistantPracticeReviewJsonSchema = object({
  decision: { type: 'string', enum: ['pass', 'revised', 'uncertain'] }, issues: texts(0, 12, 600),
  revisedContent: { anyOf: [assistantPracticeContentJsonSchema, { type: 'null' }] },
});

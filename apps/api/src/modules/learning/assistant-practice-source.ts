import { createHash } from 'node:crypto';
import { ASSISTANT_PRACTICE_CONTENT_PROTOCOL, ASSISTANT_PRACTICE_SOURCE_BUDGET, assistantPracticeContentInputSchema,
  assistantPracticeTargetScopeSchema, type AssistantArtifactOrigin, type AssistantPracticeContentInput,
  type AssistantPracticeTargetScope } from '@study-agent/contracts';
import { stableAssistantWhiteboardOrigin } from './assistant-whiteboard-source';
import { topicWhiteboardDigest as digest, topicWhiteboardSerialize as serialize } from './topic-whiteboard-digest';

export type PreparedAssistantPractice = {
  version: typeof ASSISTANT_PRACTICE_CONTENT_PROTOCOL; input: AssistantPracticeContentInput;
  targetScope: AssistantPracticeTargetScope; modelId: string; modelName: string;
  source: { origin: AssistantArtifactOrigin; sourceFingerprint: string };
  context: string; fingerprint: string;
};
const sameIds = (a: string[], b: string[]) => a.length === new Set(a).size && b.length === new Set(b).size
  && digest([...a].sort()) === digest([...b].sort());
function fail(reason: string): never { throw Error('assistant_practice_' + reason); }

/** Offline consistency only. The caller must recheck live ownership, scope, withdrawal and assessment at every write. */
function sourceIdentity(origin: AssistantArtifactOrigin, input: AssistantPracticeContentInput, targetScope: AssistantPracticeTargetScope) {
  if (origin?.protocol !== 'assistant-artifact-origin-v1' || !origin.sessionId || !Array.isArray(origin.messages)
    || origin.messages.length < 1 || origin.messages.length > 20 || !origin.selection || !origin.location
    || origin.location.sessionId !== origin.sessionId || origin.location.studentId !== origin.studentId || origin.location.subject !== origin.subject)
    fail('source_mismatch');
  const messages = new Map(origin.messages.map(message => [message.id, message]));
  if (messages.size !== origin.messages.length || !sameIds(origin.messages.map(message => message.id), origin.selection.messageIds)
    || digest(origin.messages.map(message => message.id)) !== digest(origin.selection.messageIds)
    || !sameIds(input.selection.messageIds, origin.selection.requestedMessageIds)
    || input.selection.includeLinkedQuestions !== origin.selection.includeLinkedQuestions
    || input.selection.messageIds.some(id => !messages.has(id))) fail('source_selection_mismatch');
  const expectedLinked = new Set<string>();
  for (const id of input.selection.messageIds) {
    const message = messages.get(id)!;
    if (input.selection.includeLinkedQuestions && message.sender === 'assistant' && message.inReplyTo) {
      const linked = messages.get(message.inReplyTo);
      if (!linked || linked.sender !== 'user') fail('source_link_mismatch');
      if (!input.selection.messageIds.includes(linked.id)) expectedLinked.add(linked.id);
    }
  }
  if (!sameIds([...expectedLinked], origin.selection.linkedQuestionIds)
    || !sameIds([...input.selection.messageIds, ...expectedLinked], origin.selection.messageIds)) fail('source_link_mismatch');
  let sequence = -1;
  const referenceIdentities = new Map<string, string>();
  for (const message of origin.messages) {
    if (!message.id || !['assistant', 'user'].includes(message.sender) || typeof message.content !== 'string'
      || !Number.isInteger(message.sequence) || message.sequence <= sequence || !Number.isFinite(Date.parse(message.createdAt))
      || createHash('sha256').update(message.content).digest('hex') !== message.contentSha256 || !Array.isArray(message.sourceReferences)) fail('source_message_mismatch');
    sequence = message.sequence;
    const keys = message.sourceReferences.map(reference => reference.key);
    if (new Set(keys).size !== keys.length) fail('source_reference_mismatch');
    for (const reference of message.sourceReferences) {
      if (!reference.key || referenceIdentities.has(reference.key) && referenceIdentities.get(reference.key) !== digest(reference)) fail('source_reference_mismatch');
      referenceIdentities.set(reference.key, digest(reference));
    }
  }
  const historical = origin.course?.current === false || origin.lecture?.current === false;
  if (historical && !input.acknowledgeHistoricalSource) fail('historical_source_confirmation_required');
  if (input.audience.kind !== targetScope.kind) fail('target_scope_mismatch');
  if (targetScope.kind === 'adult') {
    if (origin.studentId !== null || origin.subject !== null) fail('adult_source_mismatch');
  } else {
    if (input.audience.kind !== 'student' || input.audience.studentId !== targetScope.studentId || input.audience.subject !== targetScope.subject
      || origin.studentId !== null && origin.studentId !== targetScope.studentId
      || origin.subject !== null && origin.subject !== targetScope.subject) fail('target_scope_mismatch');
    if (origin.studentId === null && !input.acknowledgeAudienceTransfer) fail('audience_transfer_confirmation_required');
    const audience = input.audience;
    if (audience.kind !== 'student' || !sameIds(audience.targetAtomIds, targetScope.targets.map(target => target.atomId))
      || targetScope.targets.some(target => target.subject !== targetScope.subject || target.grade > targetScope.scopeGrade
        || target.grade === targetScope.scopeGrade && targetScope.scopeTerm === 'upper' && target.term === 'lower')
      || origin.teachingScope?.grade != null && origin.teachingScope.grade !== targetScope.scopeGrade) fail('target_definition_mismatch');
  }
  return { origin: structuredClone(origin), sourceFingerprint: digest(stableAssistantWhiteboardOrigin(origin)) };
}

/** Does not consume D1 canPrepare or coverage: those are read-only observations, not generation credentials. */
export function prepareAssistantTeachingPractice(origin: AssistantArtifactOrigin, value: AssistantPracticeContentInput,
  scopeValue: AssistantPracticeTargetScope, model: { id: string; label: string }, available: boolean): PreparedAssistantPractice {
  const input = assistantPracticeContentInputSchema.parse(value), targetScope = assistantPracticeTargetScopeSchema.parse(scopeValue);
  if (typeof model.id !== 'string' || !model.id.trim() || model.id.length > 180 || typeof model.label !== 'string' || !model.label.trim()
    || model.label.length > 200 || input.modelId !== undefined && input.modelId !== model.id) fail('model_mismatch');
  const source = sourceIdentity(origin, input, targetScope);
  const context = serialize({ protocol: ASSISTANT_PRACTICE_CONTENT_PROTOCOL, input,
    origin: stableAssistantWhiteboardOrigin(origin), targetScope, modelId: model.id, modelName: model.label });
  if (context.length > ASSISTANT_PRACTICE_SOURCE_BUDGET) fail('source_budget_exceeded');
  if (!available) fail('model_unavailable');
  const identity = { version: ASSISTANT_PRACTICE_CONTENT_PROTOCOL, input, targetScope, modelId: model.id, modelName: model.label, source, context };
  return { ...structuredClone(identity), fingerprint: digest(identity) };
}

/** A hash proves internal identity only, never current authorization or reviewed curriculum status. */
export function assertPreparedAssistantPractice(prepared: PreparedAssistantPractice) {
  if (prepared?.version !== ASSISTANT_PRACTICE_CONTENT_PROTOCOL || !prepared.source || !prepared.input) fail('prepared_protocol');
  const { fingerprint, ...identity } = prepared;
  if (digest(identity) !== fingerprint) fail('prepared_changed');
  const rebuilt = prepareAssistantTeachingPractice(prepared.source.origin, prepared.input, prepared.targetScope,
    { id: prepared.modelId, label: prepared.modelName }, true);
  if (digest(rebuilt) !== digest(prepared)) fail('prepared_source_changed');
}

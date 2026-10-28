import type { AssistantArtifactOrigin, AssistantWhiteboardAudience, AssistantWhiteboardPreflight, AssistantWhiteboardPreflightInput } from '@study-agent/contracts';
import { assistantWhiteboardPreflightSchema } from '@study-agent/contracts';
import { createHash } from 'node:crypto';
import { topicWhiteboardDigest } from './topic-whiteboard-content';

/** Source identity excludes current permission labels. Callers must independently check current authority. */
export function stableAssistantWhiteboardOrigin(origin: AssistantArtifactOrigin): AssistantArtifactOrigin {
  const stable = structuredClone(origin);
  if (stable.course) { delete stable.course.canSend; delete stable.course.blocked; delete (stable.course as Partial<typeof stable.course>).current; }
  if (stable.lecture) delete (stable.lecture as Partial<typeof stable.lecture>).current;
  return stable;
}
export function prepareAssistantWhiteboardSource(origin: AssistantArtifactOrigin, input: AssistantWhiteboardPreflightInput,
  audience: AssistantWhiteboardAudience, model: { id: string; label: string }, available: boolean) {
  const protocol = 'assistant-topic-whiteboard-v1' as const, stable = stableAssistantWhiteboardOrigin(origin);
  const sourceFingerprint = topicWhiteboardDigest({ protocol, origin: stable });
  const context = JSON.stringify({ protocol, objective: input.objective, audience, origin: stable });
  const fits = context.length <= 18000, historical = origin.course?.current === false || origin.lecture?.current === false;
  const blocked: AssistantWhiteboardPreflight['blocked'] = !fits ? { code: 'source_budget_exceeded', message: '完整原对话与白板目标超过18000字符，请明确减少选择；全部原文仍保留，没有截断。' }
    : historical && !input.acknowledgeHistoricalSource ? { code: 'historical_source_confirmation_required', message: '来源属于原教学版本。请核对完整原文并明确确认使用旧来源，不会恢复旧对话发问资格。' }
    : !available ? { code: 'model_unavailable', message: '当前模型服务未启用。完整来源可核对，尚不能生成白板。' } : undefined;
  const fingerprint = topicWhiteboardDigest({ protocol, sourceFingerprint, audience, objective: input.objective,
    modelId: model.id, modelName: model.label, acknowledgeHistoricalSource: input.acknowledgeHistoricalSource, context });
  const view: AssistantWhiteboardPreflight = { protocol, origin: structuredClone(origin), audience: structuredClone(audience),
    objective: input.objective, modelId: model.id, modelName: model.label, available, sourceFingerprint, fingerprint,
    contextCharacters: context.length, maxContextCharacters: 18000, fits, historical, canGenerate: !blocked, ...(blocked ? { blocked } : {}) };
  return { view, context };
}

export type PreparedAssistantWhiteboard = {
  version: 'assistant-topic-whiteboard-v1';
  input: { audience: AssistantWhiteboardAudience; prompt: string; objective: string; modelId: string };
  modelId: string; modelName: string; grade: number | null; scopeFingerprint: string; targets: [];
  context: string; fingerprint: string;
  source: { sessionId: string; origin: AssistantArtifactOrigin; selection: AssistantWhiteboardPreflightInput['selection'];
    sourceFingerprint: string; preflightFingerprint: string; acknowledgeHistoricalSource: boolean };
};

/** Internal only. Ownership and current write authority must be checked before persistence. */
export function prepareAssistantTopicWhiteboard(origin: AssistantArtifactOrigin, input: AssistantWhiteboardPreflightInput,
  audience: AssistantWhiteboardAudience, model: { id: string; label: string }, available: boolean): PreparedAssistantWhiteboard {
  input = assistantWhiteboardPreflightSchema.parse(input);
  const { view, context } = prepareAssistantWhiteboardSource(origin, input, audience, model, available);
  if (!view.canGenerate) throw Error('assistant_whiteboard_' + view.blocked!.code);
  const identity = { version: view.protocol,
    input: { audience: structuredClone(audience), prompt: input.objective, objective: input.objective, modelId: model.id },
    modelId: model.id, modelName: model.label, grade: audience.courseGrade, scopeFingerprint: view.sourceFingerprint, targets: [] as [], context,
    source: { sessionId: origin.sessionId, origin: structuredClone(origin), selection: structuredClone(input.selection),
      sourceFingerprint: view.sourceFingerprint, preflightFingerprint: view.fingerprint, acknowledgeHistoricalSource: input.acknowledgeHistoricalSource } };
  const prepared = { ...identity, fingerprint: topicWhiteboardDigest(identity) };
  assertPreparedAssistantWhiteboard(prepared); return prepared;
}

/** Validate saved bytes without upgrading their source or inventing current access. */
export function assertPreparedAssistantWhiteboard(prepared: PreparedAssistantWhiteboard) {
  if (prepared?.version !== 'assistant-topic-whiteboard-v1' || !prepared.source || !prepared.input || !Array.isArray(prepared.targets))
    throw Error('assistant_whiteboard_prepared_protocol');
  const { fingerprint, ...identity } = prepared;
  if (topicWhiteboardDigest(identity) !== fingerprint) throw Error('assistant_whiteboard_prepared_changed');
  const { origin, selection } = prepared.source, audience = prepared.input.audience;
  const input = assistantWhiteboardPreflightSchema.parse({ selection, objective: prepared.input.objective,
    modelId: prepared.modelId, acknowledgeHistoricalSource: prepared.source.acknowledgeHistoricalSource });
  const messageIds = origin.messages.map(message => message.id);
  if (origin.protocol !== 'assistant-artifact-origin-v1' || audience.kind !== 'assistant' || audience.studentId !== origin.studentId || audience.subject !== origin.subject
    || audience.courseGrade !== (origin.teachingScope?.grade ?? null)
    || audience.sourceKind !== (origin.course?.kind ?? (origin.lecture ? 'classroom_lecture' : 'independent'))
    || origin.studentId === null && audience.profileGrade !== null
    || prepared.grade !== audience.courseGrade || prepared.source.sessionId !== origin.sessionId || prepared.targets.length
    || prepared.input.prompt !== prepared.input.objective || prepared.input.modelId !== prepared.modelId
    || origin.messages.some(message => createHash('sha256').update(message.content).digest('hex') !== message.contentSha256)
    || selection.includeLinkedQuestions !== origin.selection.includeLinkedQuestions
    || new Set(messageIds).size !== messageIds.length || topicWhiteboardDigest(messageIds) !== topicWhiteboardDigest(origin.selection.messageIds)
    || selection.messageIds.some(id => !messageIds.includes(id))
    || topicWhiteboardDigest([...selection.messageIds].sort()) !== topicWhiteboardDigest([...origin.selection.requestedMessageIds].sort()))
    throw Error('assistant_whiteboard_prepared_source_mismatch');
  const source = prepareAssistantWhiteboardSource(origin, input, audience,
  { id: prepared.modelId, label: prepared.modelName }, true);
  if (!source.view.canGenerate || prepared.context !== source.context || prepared.scopeFingerprint !== source.view.sourceFingerprint
    || prepared.source.sourceFingerprint !== source.view.sourceFingerprint || prepared.source.preflightFingerprint !== source.view.fingerprint)
    throw Error('assistant_whiteboard_prepared_source_changed');
}

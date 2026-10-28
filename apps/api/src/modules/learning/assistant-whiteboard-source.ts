import type { AssistantArtifactOrigin, AssistantWhiteboardAudience, AssistantWhiteboardPreflight, AssistantWhiteboardPreflightInput } from '@study-agent/contracts';
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

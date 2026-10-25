import { createHash } from 'node:crypto';
import type { AssistantSession, AssistantReply, AssistantTurnView } from '@study-agent/contracts';
import type { InMemoryAuthSession } from '../../infrastructure/in-memory-store.service';

export const assistantTurnKind = 'assistant.turn.reply', assistantTurnPort = 'assistant.turn.port', assistantWorkerPort = 'assistant.turn.worker';
export type AssistantChatCommand = { sessionId: string; message: string; modelId?: string; signal?: AbortSignal; requestKey?: string; authSession?: InMemoryAuthSession };
export type AssistantLegacyResult = AssistantReply & { assistanceRecorded: boolean; messages: unknown[] };
export type AssistantTurnPort = { legacy(command: AssistantChatCommand): Promise<AssistantLegacyResult> };
export type AssistantWorkerPort = { runNext(): Promise<boolean> };
export type AssistantPreparation = { session: AssistantSession; contextJson: string; message: string; requestedModelId: string | null;
  modelId: string | null; modelName: string; execution: AssistantReply['source']; history: Array<{ role: 'user' | 'assistant'; content: string }>;
  contextVersion: string; bindingHash: string };
export type AssistantTurnRecord = Omit<AssistantTurnView, 'task' | 'status'> & {
  ownerUserId: string; studentId: string | null; taskId: string; inputHash: string; commandHash: string;
  status: 'queued' | 'running' | 'validating' | 'completed'; prepared: AssistantPreparation;
  authorization: { role: string; bindingId?: string; guardianId?: string; accessId?: string; accessVersion?: number };
};
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a===b?0:a>b?1:-1).map(([k,v]) => [k,canonical(v)]));
  return value;
}
export const assistantDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

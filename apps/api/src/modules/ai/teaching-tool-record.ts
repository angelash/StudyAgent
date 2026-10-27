import { createHash } from 'node:crypto';
import type { TeachingToolRunView } from '@study-agent/contracts';
export const teachingToolKinds = ['ai.teaching.analysis', 'ai.teaching.hint'] as const;
export const teachingToolWorkerPort = 'ai.teaching.worker.port';
export type TeachingToolWorkerPort = { runNext(): Promise<boolean> };
export type TeachingToolRunRecord = Omit<TeachingToolRunView, 'task' | 'status'> & {
  ownerUserId: string; authorizationSessionId: string; taskId: string; commandHash: string; inputHash: string; context: string;
  status: 'queued' | 'running' | 'validating' | 'completed';
  commands: Array<{ requestKey: string; action: 'cancel' | 'retry'; hash: string }>;
};
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, ordered(item)]));
  return value;
}
export const teachingToolDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');

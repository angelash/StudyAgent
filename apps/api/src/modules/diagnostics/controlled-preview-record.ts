import { z } from 'zod';
import { controlledPreviewInputSchema,controlledStartInputSchema,type ControlledPreviewInput,type ControlledStartReceipt,type LearningScope } from '@study-agent/contracts';
import type { ControlledContrastBlueprint } from './controlled-contrast-selection';
import { retentionDigest } from './retention-anchor';

export { controlledPreviewInputSchema,controlledStartInputSchema } from '@study-agent/contracts';
export type { ControlledPreviewInput,ControlledStartReceipt } from '@study-agent/contracts';
export type ControlledPreviewSelectionCommand = Omit<ControlledPreviewInput, 'requestKey'>;
export type ControlledPreviewRecord = { protocol: 'controlled-preview-record-v1'; id: string; arrangedBy: string|null; arrangerFingerprint: string; arrangerDeletionHash?:string; command: ControlledPreviewSelectionCommand; studentId: string;
  subject: ControlledPreviewInput['subject']; requestKey: string|null; input: ControlledPreviewInput|null; requestHash: string;
  publicationId: string; publicationFingerprint: string; scopeSnapshot: LearningScope; seed: string; blueprint: ControlledContrastBlueprint;
  fingerprint: string; createdAt: string; expiresAt: string; sessionId: string | null;
  starts: Array<{ actorId: string; requestKey: string; input: z.infer<typeof controlledStartInputSchema>; requestHash: string; at: string; result: ControlledStartReceipt; resultHash: string }> };
export const controlledPreviewId = (actorId: string, requestKey: string) => 'controlled_preview:' + retentionDigest({ actorId, requestKey });
export const controlledPreviewRequestHash = (actorId: string, input: ControlledPreviewInput) => retentionDigest({ protocol: 'controlled-preview-command-v1', actorId, input });
export const controlledStartRequestHash = (actorId: string, previewId: string, input: z.infer<typeof controlledStartInputSchema>) => retentionDigest({ protocol: 'controlled-start-command-v1', actorId, previewId, input });
export const controlledPreviewFingerprint = (row: Pick<ControlledPreviewRecord, 'id'|'arrangerFingerprint'|'command'|'publicationFingerprint'|'scopeSnapshot'|'seed'|'blueprint'|'createdAt'|'expiresAt'>) =>
  retentionDigest({ protocol: 'controlled-preview-original-v1', id: row.id, arrangerFingerprint: row.arrangerFingerprint, command: row.command,
    publicationFingerprint: row.publicationFingerprint, scopeSnapshot: row.scopeSnapshot, seed: row.seed, blueprint: row.blueprint, createdAt: row.createdAt, expiresAt: row.expiresAt });

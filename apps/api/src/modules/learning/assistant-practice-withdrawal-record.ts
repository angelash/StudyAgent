import { z } from 'zod';
import { assistantPracticeAssignmentWithdrawSchema, type AssistantPracticeAssignmentWithdrawInput } from '@study-agent/contracts';
import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { assignmentPublisherFingerprint, type AssistantPracticeAssignmentRecord } from './assistant-practice-assignment-record';
import { topicWhiteboardDigest as digest } from './topic-whiteboard-digest';

const id = z.string().min(1).max(180), hash = z.string().regex(/^[a-f0-9]{64}$/), time = z.string().datetime();
export const assistantPracticeWithdrawalRecordSchema = z.object({
  id, protocol: z.literal('assistant-practice-assignment-withdrawal-v1'), assignmentId: id, studentId: id,
  subject: z.enum(['math','chinese','english','chemistry']), payloadFingerprint: hash, stateVersion: z.literal(1),
  actorUserId: id.nullable(), actorRole: z.enum(['parent','admin']), actorFingerprint: hash,
  input: assistantPracticeAssignmentWithdrawSchema, requestKey: z.string().min(8).max(180), requestHash: hash, withdrawnAt: time,
  receipt: z.object({ withdrawalId: id, assignmentId: id, stateVersion: z.literal(1), withdrawnAt: time, payloadFingerprint: hash }).strict(),
}).strict();
export type AssistantPracticeWithdrawalRecord = z.infer<typeof assistantPracticeWithdrawalRecordSchema>;
export function withdrawalRequestHash(actorFingerprint: string, assignmentId: string, input: AssistantPracticeAssignmentWithdrawInput) {
  const { requestKey: _key, ...body } = input; return digest({ kind: 'withdraw', actorFingerprint, assignmentId, body });
}
export function assertAssistantPracticeWithdrawal(value: unknown, assignment?: AssistantPracticeAssignmentRecord): AssistantPracticeWithdrawalRecord {
  try {
    const row = assistantPracticeWithdrawalRecordSchema.parse(value);
    if (digest(row) !== digest(value) || row.input.assignmentFingerprint !== row.payloadFingerprint || row.requestKey !== row.input.requestKey
      || row.requestHash !== withdrawalRequestHash(row.actorFingerprint, row.assignmentId, row.input)
      || row.actorUserId !== null && assignmentPublisherFingerprint(row.actorUserId) !== row.actorFingerprint
      || row.receipt.withdrawalId !== row.id || row.receipt.assignmentId !== row.assignmentId || row.receipt.stateVersion !== row.stateVersion
      || row.receipt.withdrawnAt !== row.withdrawnAt || row.receipt.payloadFingerprint !== row.payloadFingerprint
      || assignment && (row.assignmentId !== assignment.id || row.studentId !== assignment.studentId || row.subject !== assignment.subject
        || row.payloadFingerprint !== assignment.payloadFingerprint || Date.parse(row.withdrawnAt) < Date.parse(assignment.createdAt))) throw Error();
    return row;
  } catch { throw Error('assistant_practice_withdrawal_integrity_failed'); }
}
export function withdrawalView(row: AssistantPracticeWithdrawalRecord) {
  return { id: row.id, assignmentId: row.assignmentId, stateVersion: row.stateVersion, payloadFingerprint: row.payloadFingerprint,
    reason: row.input.reason, withdrawnAt: row.withdrawnAt };
}
export function assignmentWithdrawal(store: InMemoryStoreService, assignment: AssistantPracticeAssignmentRecord) {
  const row = store.find('assistantPracticeAssignmentWithdrawals', { assignmentId: assignment.id });
  return row ? assertAssistantPracticeWithdrawal(row, assignment) : null;
}
export function assignmentStateView(store: InMemoryStoreService, assignment: AssistantPracticeAssignmentRecord) {
  const row = assignmentWithdrawal(store, assignment);
  return { assignmentState: row ? 'withdrawn' as const : 'assigned' as const, stateVersion: row ? 1 : 0, withdrawal: row ? withdrawalView(row) : null };
}

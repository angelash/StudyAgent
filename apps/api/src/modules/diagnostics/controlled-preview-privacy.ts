import type { PrivacyReceipt } from '@study-agent/contracts';
import { controlledActorFingerprint } from './controlled-actor-identity';
import { controlledPreviewFingerprint, type ControlledPreviewRecord } from './controlled-preview-record';

/** Pure replacement proposal for the caller's real deletion transaction. Actual
 * account receipts must name this child among the retained shared children.
 */
export function anonymizeControlledPreviews(previews: readonly ControlledPreviewRecord[], actorId: string, receipt: PrivacyReceipt) {
  const fingerprint = controlledActorFingerprint(actorId);
  if (receipt.kind !== 'account_delete' || receipt.actorId !== actorId || receipt.subjectHash !== fingerprint || !Number.isFinite(Date.parse(receipt.completedAt))) throw Error('controlled_original_account_deletion_receipt_required');
  const retained = new Set(receipt.retainedStudentHashes ?? []);
  return previews.flatMap(row => {
    if (row.arrangedBy !== actorId) return [structuredClone(row)];
    if (!row.sessionId || !retained.has(controlledActorFingerprint(row.studentId))) return [];
    if (row.arrangerFingerprint !== fingerprint || Date.parse(receipt.completedAt) < Date.parse(row.createdAt) || controlledPreviewFingerprint(row) !== row.fingerprint) throw Error('controlled_preview_original_author_scope_changed');
    const next = { ...structuredClone(row), arrangedBy: null, input: null, requestKey: null, arrangerDeletionHash: fingerprint };
    if (controlledPreviewFingerprint(next) !== row.fingerprint) throw Error('controlled_shared_preview_changed_during_deletion');
    return [next];
  });
}

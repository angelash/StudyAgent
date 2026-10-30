import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { retentionDigest } from './retention-anchor';

// Same one-field account hash as the existing privacy deletion ledger. Shared
// immutable publications carry this identity from their first edition, so
// closing an author account never requires rewriting old publication hashes.
export const controlledActorFingerprint = (actorId: string) => retentionDigest({ id: actorId });
export const controlledActorIdentity = (actorId: string) => 'controlled-actor:' + controlledActorFingerprint(actorId);
export const isControlledActorIdentity = (value: string) => /^controlled-actor:[a-f0-9]{64}$/.test(value);
export function controlledReviewerSnapshot(store: InMemoryStoreService, identity: string) {
  if (!isControlledActorIdentity(identity)) throw Error('controlled_material_original_reviewer_identity_required');
  const retained = store.find('users', { id: identity, status: 'active' });
  const actual = retained ?? store.inspect('users').find(user => user.status === 'active' && controlledActorIdentity(user.id) === identity);
  if (!actual || !['admin','teacher'].includes(actual.role)) throw Error('controlled_material_original_reviewer_authority_required');
  return { id: identity, role: actual.role, status: 'active' };
}

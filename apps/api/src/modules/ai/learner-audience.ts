import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import type { TeachingOutputAudience } from './teaching-output-guard';

/**
 * 232 §4.3: the minor switch lives on the learner profile. A profile without the field counts as a minor (every
 * existing profile was created for a child); no profile at all is the adult learning for themself.
 * Call inside a request context or store transaction.
 */
export function learnerAudience(store: InMemoryStoreService, studentId: string | null | undefined): TeachingOutputAudience {
  if (!studentId) return 'adult';
  const profile = store.find('students', { id: studentId }) as { minor?: boolean } | undefined;
  return profile?.minor === false ? 'adult' : 'minor';
}

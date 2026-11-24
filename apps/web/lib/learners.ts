'use client';
import { sharedRequest } from './shared-resource';

export type LearnerSummary = { id: string; nickname: string; grade: number };

// Learner profiles the signed-in account may open. Shared across the page.
export function loadLearners(signal?: AbortSignal) {
  return sharedRequest<LearnerSummary[]>('/learning/students', { signal });
}

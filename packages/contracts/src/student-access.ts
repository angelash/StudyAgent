export type StudentLearningAccess = {
  id: string; studentId: string; userId: string; status: 'enabled' | 'disabled'; version: number;
  createdAt: string; updatedAt: string; createdBy: string;
};
export type StudentLearningCode = {
  id: string; studentId: string; accessVersion: number; tokenHash: string; createdBy: string; createdAt: string;
  expiresAt: string; usedAt: string | null; revokedAt: string | null; requestKey: string; requestHash: string;
};
export type StudentAccessRevision = {
  id: string; studentId: string; version: number; status: StudentLearningAccess['status']; actorId: string;
  at: string; reason: string; requestKey: string; requestHash: string;
};
export type StudentProgressProposal = {
  id: string; studentId: string; proposedBy: string; scope: z.infer<typeof learningScopeInputSchema>;
  baseScopeVersion: number; version: number; status: 'pending' | 'accepted' | 'rejected' | 'superseded'; createdAt: string;
  requestKey: string; requestHash: string; decidedAt?: string; decidedBy?: string; decisionNote?: string;
  decisionRequestKey?: string; decisionHash?: string; acceptedScopeId?: string;
  knowledgeSnapshot?: Array<{ id: string; name: string; objective: string; version: number }>;
};
import type { z } from 'zod';
import type { learningScopeInputSchema } from './diagnostics';

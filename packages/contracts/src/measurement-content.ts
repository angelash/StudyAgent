import { z } from 'zod';
import type { questionAnswerSchemaSchema, questionBlockSchema, subjectSchema } from './index';
import { dimensionSchema } from './diagnostics';

const id = z.string().trim().min(1).max(180);
export const createMeasurementDraftSchema = (subject: typeof subjectSchema, block: typeof questionBlockSchema, answerSchema: typeof questionAnswerSchemaSchema) => z.object({
  subject, grade: z.number().int().min(1).max(9),
  stem: z.string().trim().min(3).max(12000), analysis: z.string().trim().min(5).max(8000),
  blocks: z.array(block).max(40), answer: z.unknown(),
  answerSchema: answerSchema.omit({ questionId: true }).strict(),
  mapping: z.object({ primaryAtomId: id, prerequisiteAtomIds: z.array(id).max(30), secondaryAtomIds: z.array(id).max(30),
    dimension: dimensionSchema, family: z.string().trim().min(3).max(180),
    probeRole: z.enum(['anchor', 'prerequisite', 'contrast', 'transfer', 'retention']),
    expectedSeconds: z.number().int().min(5).max(1200), difficulty: z.number().int().min(1).max(5),
    observationCode: z.string().trim().min(3).max(100),
    observedSteps: z.array(z.string().trim().min(3).max(500)).min(1).max(12),
    rationale: z.string().trim().min(10).max(2000),
    familyRationale: z.string().trim().min(10).max(1500),
  }).strict(),
  license: z.object({ licenseClass: z.enum(['A_INTERNAL', 'B_OPEN', 'C_PUBLIC_REFERENCE_ONLY', 'D_COMMERCIAL_PARTNER']),
    evidence: z.string().trim().min(10).max(4000) }).strict(),
  scoringCases: z.array(z.object({ response: z.unknown(), expectedScore: z.number().min(0).max(1),
    rationale: z.string().trim().min(5).max(1200) }).strict()).min(2).max(12),
}).strict();
export type MeasurementDraft = z.infer<ReturnType<typeof createMeasurementDraftSchema>>;
export type MeasurementContentGate = 'source' | 'content' | 'media' | 'scoring' | 'mapping';
export type MeasurementContentCandidate = {
  id: string; paperId: string; position: number; sourceQuestionId: string; sourceHash: string;
  paperTitle: string; sourceGrade: string; sourceSubject: string;
  original: Record<string, unknown>; promptMedia: string[];
  createdAt: string; createdBy: string; version: number; status: 'draft' | 'published' | 'withdrawn';
  draft: MeasurementDraft | null; draftHash: string | null;
  atomFingerprints: Record<string, string>;
  reviews: Partial<Record<MeasurementContentGate, { decision: 'approved' | 'rejected'; draftHash: string;
    actorId: string; at: string; reason: string }>>;
  history: Array<{ version: number; action: string; actorId: string; at: string; reason: string;
    requestKey: string; inputHash: string; draft?: MeasurementDraft; draftHash?: string | null }>;
  questionId?: string; mappingId?: string; publishedHash?: string;
};

import { z } from 'zod';

const activity = z.object({ prompt: z.string().min(8).max(1200), referenceAnswer: z.string().min(8).max(2000),
  scoring: z.literal('human_review_required') }).strict();
export const gespTeachingCandidateSchema = z.object({
  id: z.string().regex(/^gesp-teaching-l[1-4]-[a-z-]+$/), atomId: z.string().regex(/^gesp-cpp\.l[1-4]\.[a-z-]+$/),
  level: z.number().int().min(1).max(4), title: z.string().min(3).max(150), goal: z.string().min(8).max(600),
  prerequisiteIds: z.array(z.string()).max(49),
  sourceEvidence: z.array(z.object({ pdfUrl: z.url(), pdfSha256: z.string().regex(/^[0-9a-f]{64}$/),
    pdfPages: z.array(z.number().int().positive()).min(1).max(10), clauseId: z.string() }).strict()).min(1).max(10),
  status: z.literal('editorial_candidate'), linkedTaskId: z.string().regex(/^gesp-student-[a-z0-9-]+$/),
  linkedTaskContentSha256: z.string().regex(/^[0-9a-f]{64}$/), explanation: z.string().min(30).max(3000),
  example: activity, check: activity, debug: activity, transfer: activity, retention: activity,
}).strict();
export const gespTeachingBundleSchema = z.object({ format: z.literal('gesp-teaching-candidates-v1'),
  status: z.literal('editorial_candidate'), automaticPublication: z.literal(false), notice: z.string().min(30).max(1000),
  teacherReviewed: z.literal(false), familyIndependenceReviewed: z.literal(false), officialScopeAlignmentReviewed: z.literal(false),
  lessons: z.array(gespTeachingCandidateSchema).length(49),
}).strict();
export type GespTeachingCandidate = z.infer<typeof gespTeachingCandidateSchema>;
export type GespTeachingCandidateView = { contentSha256: string; notice: string; lessons: GespTeachingCandidate[];
  automaticPublication: false; teacherReviewed: false };

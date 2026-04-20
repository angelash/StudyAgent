import { z } from 'zod';

export const subjectSchema = z.enum(['chinese', 'math', 'english']);
export type Subject = z.infer<typeof subjectSchema>;

export const roleSchema = z.enum(['parent', 'student', 'teacher', 'operator', 'admin']);
export type UserRole = z.infer<typeof roleSchema>;

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.any()).optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export type ApiResponse<T> = {
  data: T;
  error: ApiError | null;
  meta: {
    requestId: string;
    timestamp: string;
  };
};

export const domainEventEnvelopeSchema = z.object({
  eventName: z.string(),
  eventVersion: z.number().int().positive(),
  eventId: z.string(),
  occurredAt: z.string(),
  payload: z.record(z.any()),
});

export type DomainEventEnvelope<T> = {
  eventName: string;
  eventVersion: number;
  eventId: string;
  occurredAt: string;
  payload: T;
};

export const studentProfileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  nickname: z.string(),
  grade: z.number().int().min(1).max(6),
  defaultVersionMap: z.object({
    chinese: z.string(),
    math: z.string(),
    english: z.string(),
  }),
  preferredSessionMinutes: z.number().int().positive(),
});

export type StudentProfile = z.infer<typeof studentProfileSchema>;

export const subjectEnrollmentSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  subject: subjectSchema,
  enabled: z.boolean(),
  textbookVersionId: z.string(),
});

export type SubjectEnrollment = z.infer<typeof subjectEnrollmentSchema>;

export const textbookVolumeSchema = z.object({
  id: z.string(),
  subject: subjectSchema,
  publisherVersion: z.string(),
  grade: z.number().int().min(1).max(6),
  term: z.enum(['first', 'second']),
  displayName: z.string(),
  sourcePath: z.string(),
  status: z.enum(['draft', 'published']),
});

export type TextbookVolume = z.infer<typeof textbookVolumeSchema>;

export const knowledgePointSchema = z.object({
  id: z.string(),
  subject: subjectSchema,
  name: z.string(),
  parentId: z.string().nullable(),
  gradeBand: z.string(),
  difficultyLevel: z.number().int().min(1).max(5),
  lessonId: z.string().nullable(),
  status: z.enum(['draft', 'published']),
});

export type KnowledgePoint = z.infer<typeof knowledgePointSchema>;

export const questionSchema = z.object({
  id: z.string(),
  subject: subjectSchema,
  type: z.enum(['objective', 'subjective', 'stepwise', 'oral']),
  stem: z.string(),
  answer: z.any(),
  analysis: z.string(),
  difficultyLevel: z.number().int().min(1).max(5),
  knowledgePointIds: z.array(z.string()),
  status: z.enum(['draft', 'published']),
});

export type Question = z.infer<typeof questionSchema>;

export const assessmentSessionSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  subject: subjectSchema,
  assessmentType: z.enum(['initial', 'unit', 'stage', 'micro', 'retry']),
  itemIds: z.array(z.string()),
  status: z.enum(['pending', 'in_progress', 'completed', 'aborted']),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
});

export type AssessmentSession = z.infer<typeof assessmentSessionSchema>;

export const assessmentResultSchema = z.object({
  sessionId: z.string(),
  overallScore: z.number(),
  itemCount: z.number().int().nonnegative(),
  knowledgeResults: z.array(
    z.object({
      knowledgePointId: z.string(),
      score: z.number(),
      correctCount: z.number().int().nonnegative(),
      totalCount: z.number().int().positive(),
      errorTypes: z.array(z.string()),
    }),
  ),
  recommendedActions: z.array(z.string()),
  parentSummary: z.string(),
});

export type AssessmentResult = z.infer<typeof assessmentResultSchema>;

export const dailyMissionSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  subject: subjectSchema,
  missionType: z.enum(['new_learning', 'practice', 'retry', 'review']),
  title: z.string(),
  targetKnowledgePointIds: z.array(z.string()),
  questionIds: z.array(z.string()),
  estimatedMinutes: z.number().int().positive(),
  status: z.enum(['pending', 'in_progress', 'completed', 'skipped']),
});

export type DailyMission = z.infer<typeof dailyMissionSchema>;

export const aiAnalysisResponseSchema = z.object({
  summary: z.string(),
  structuredResult: z.record(z.any()),
  confidenceLevel: z.enum(['low', 'medium', 'high']),
  reviewRequired: z.boolean(),
  source: z.enum(['openai', 'mock']),
});

export type AIAnalysisResponse = z.infer<typeof aiAnalysisResponseSchema>;

export const assistantSessionSchema = z.object({
  id: z.string(),
  userRole: z.enum(['student', 'parent']),
  studentId: z.string().nullable(),
  pageContext: z.enum(['student_home', 'assessment', 'mission', 'review', 'weekly_report']),
  contextRefType: z.string().nullable(),
  contextRefId: z.string().nullable(),
  status: z.enum(['active', 'closed']),
});

export type AssistantSession = z.infer<typeof assistantSessionSchema>;


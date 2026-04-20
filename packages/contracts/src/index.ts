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

export const missionTypeSchema = z.enum(['new_learning', 'practice', 'retry', 'review']);
export type MissionType = z.infer<typeof missionTypeSchema>;

export const dailyMissionSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  subject: subjectSchema,
  missionType: missionTypeSchema,
  title: z.string(),
  targetKnowledgePointIds: z.array(z.string()),
  questionIds: z.array(z.string()),
  estimatedMinutes: z.number().int().positive(),
  status: z.enum(['pending', 'in_progress', 'completed', 'skipped']),
});

export type DailyMission = z.infer<typeof dailyMissionSchema>;

export const studyPlanDaySchema = z.object({
  date: z.string(),
  weekday: z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
  missionType: missionTypeSchema,
  estimatedMinutes: z.number().int().positive(),
  focusKnowledgePointIds: z.array(z.string()),
  focusKnowledgePointNames: z.array(z.string()),
  goal: z.string(),
});

export type StudyPlanDay = z.infer<typeof studyPlanDaySchema>;

export const studyPlanSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  subject: subjectSchema,
  weekStartDate: z.string(),
  weekEndDate: z.string(),
  availableMinutesPerDay: z.number().int().positive(),
  goals: z.array(z.string()),
  requiredKnowledgePointIds: z.array(z.string()),
  requiredKnowledgePointNames: z.array(z.string()),
  dailyPlans: z.array(studyPlanDaySchema),
  summary: z.string(),
  status: z.enum(['draft', 'active', 'completed']),
  generatedAt: z.string(),
});

export type StudyPlan = z.infer<typeof studyPlanSchema>;

export const generateWeeklyPlanRequestSchema = z.object({
  studentId: z.string(),
  subject: subjectSchema,
  weekStartDate: z.string().optional(),
  availableMinutesPerDay: z.number().int().positive().optional(),
});

export type GenerateWeeklyPlanRequest = z.infer<typeof generateWeeklyPlanRequestSchema>;

export const masteryStatusSchema = z.enum(['unknown', 'learning', 'unstable', 'mastered', 'at_risk']);
export type MasteryStatus = z.infer<typeof masteryStatusSchema>;

export const studentMasterySnapshotSchema = z.object({
  studentId: z.string(),
  subject: subjectSchema,
  knowledgePointId: z.string(),
  knowledgePointName: z.string(),
  masteryScore: z.number(),
  confidenceScore: z.number(),
  status: masteryStatusSchema,
  updatedAt: z.string(),
});

export type StudentMasterySnapshot = z.infer<typeof studentMasterySnapshotSchema>;

export const masteryHeatmapViewSchema = z.object({
  studentId: z.string(),
  subject: subjectSchema,
  summary: z.object({
    masteredCount: z.number().int().nonnegative(),
    learningCount: z.number().int().nonnegative(),
    unstableCount: z.number().int().nonnegative(),
    atRiskCount: z.number().int().nonnegative(),
    unknownCount: z.number().int().nonnegative(),
  }),
  snapshots: z.array(studentMasterySnapshotSchema),
});

export type MasteryHeatmapView = z.infer<typeof masteryHeatmapViewSchema>;

export const riskSignalSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  subject: subjectSchema,
  type: z.enum(['streak_break', 'retry_failure', 'mastery_drop', 'high_hint_dependency']),
  level: z.enum(['low', 'medium', 'high']),
  summary: z.string(),
  action: z.string(),
  knowledgePointId: z.string().nullable(),
  knowledgePointName: z.string().nullable(),
});

export type RiskSignal = z.infer<typeof riskSignalSchema>;

const weeklyReportKnowledgePointSchema = z.object({
  knowledgePointId: z.string(),
  knowledgePointName: z.string(),
  masteryScore: z.number(),
  status: masteryStatusSchema,
});

export const weeklyReportSchema = z.object({
  studentId: z.string(),
  subject: subjectSchema,
  weekStartDate: z.string(),
  weekEndDate: z.string(),
  assessmentCount: z.number().int().nonnegative(),
  missionCompletedCount: z.number().int().nonnegative(),
  totalAnsweredCount: z.number().int().nonnegative(),
  correctRate: z.number(),
  hintUsedCount: z.number().int().nonnegative(),
  highlights: z.array(z.string()),
  strongestKnowledgePoints: z.array(weeklyReportKnowledgePointSchema),
  focusKnowledgePoints: z.array(weeklyReportKnowledgePointSchema),
  masterySnapshots: z.array(studentMasterySnapshotSchema),
  riskSignals: z.array(riskSignalSchema),
  parentSummary: z.string(),
  generatedAt: z.string(),
});

export type WeeklyReport = z.infer<typeof weeklyReportSchema>;

export const analyticsOverviewSchema = z.object({
  studentCount: z.number().int().nonnegative(),
  activeParentCount: z.number().int().nonnegative(),
  textbookVolumeCount: z.number().int().nonnegative(),
  knowledgePointCount: z.number().int().nonnegative(),
  publishedQuestionCount: z.number().int().nonnegative(),
  completedAssessmentCount: z.number().int().nonnegative(),
  completedMissionCount: z.number().int().nonnegative(),
  activeStudyPlanCount: z.number().int().nonnegative(),
  aiInsightCount: z.number().int().nonnegative(),
});

export type AnalyticsOverview = z.infer<typeof analyticsOverviewSchema>;

export const aiInsightSummarySchema = z.object({
  id: z.string(),
  sourceType: z.enum(['assessment', 'hint', 'assistant']),
  studentId: z.string().nullable(),
  summary: z.string(),
  confidenceLevel: z.enum(['low', 'medium', 'high']),
  reviewRequired: z.boolean(),
  searchResultCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});

export type AIInsightSummary = z.infer<typeof aiInsightSummarySchema>;

export const aiQualityOverviewSchema = z.object({
  totalInsightCount: z.number().int().nonnegative(),
  sourceBreakdown: z.object({
    assessment: z.number().int().nonnegative(),
    hint: z.number().int().nonnegative(),
    assistant: z.number().int().nonnegative(),
  }),
  confidenceBreakdown: z.object({
    low: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
  }),
  reviewRequiredCount: z.number().int().nonnegative(),
  searchBackedAssistantCount: z.number().int().nonnegative(),
  searchBackedAssistantRate: z.number(),
  recentInsights: z.array(aiInsightSummarySchema),
});

export type AIQualityOverview = z.infer<typeof aiQualityOverviewSchema>;

export const aiAnalysisResponseSchema = z.object({
  summary: z.string(),
  structuredResult: z.record(z.any()),
  confidenceLevel: z.enum(['low', 'medium', 'high']),
  reviewRequired: z.boolean(),
  source: z.enum(['openai']),
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

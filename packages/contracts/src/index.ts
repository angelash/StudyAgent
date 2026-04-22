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

export const questionRuntimeSummarySchema = questionSchema.pick({
  id: true,
  subject: true,
  type: true,
  difficultyLevel: true,
  status: true,
});

export type QuestionRuntimeSummary = z.infer<typeof questionRuntimeSummarySchema>;

export const questionBlockTypeSchema = z.enum([
  'text',
  'math_inline',
  'math_display',
  'image',
  'table',
  'audio',
  'video',
  'reading_material',
  'sub_question_group',
  'geometry_canvas',
  'annotation',
  'divider',
]);

export type QuestionBlockType = z.infer<typeof questionBlockTypeSchema>;

const questionBlockBaseSchema = z.object({
  id: z.string(),
  type: questionBlockTypeSchema,
  text: z.string().optional(),
  latex: z.string().optional(),
  url: z.string().optional(),
  alt: z.string().optional(),
  caption: z.string().optional(),
  prompt: z.string().optional(),
  headers: z.array(z.string()).optional(),
  rows: z.array(z.array(z.string())).optional(),
  meta: z.record(z.any()).optional(),
});

export const questionBlockSchema: z.ZodType<{
  id: string;
  type: QuestionBlockType;
  text?: string;
  latex?: string;
  url?: string;
  alt?: string;
  caption?: string;
  prompt?: string;
  headers?: string[];
  rows?: string[][];
  meta?: Record<string, unknown>;
  children?: Array<{
    id: string;
    type: QuestionBlockType;
    text?: string;
    latex?: string;
    url?: string;
    alt?: string;
    caption?: string;
    prompt?: string;
    headers?: string[];
    rows?: string[][];
    meta?: Record<string, unknown>;
    children?: unknown[];
  }>;
}> = z.lazy(() =>
  questionBlockBaseSchema.extend({
    children: z.array(questionBlockSchema).optional(),
  }),
);

export type QuestionBlock = z.infer<typeof questionBlockSchema>;

export const questionAttachmentSchema = z.object({
  id: z.string(),
  kind: z.enum(['image', 'audio', 'video', 'file']),
  url: z.string(),
  mimeType: z.string(),
  alt: z.string().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  durationMs: z.number().int().positive().nullable().optional(),
  sizeBytes: z.number().int().positive().nullable().optional(),
});

export type QuestionAttachment = z.infer<typeof questionAttachmentSchema>;

export const questionLayoutModeSchema = z.enum(['default', 'reading_split', 'multi_part', 'canvas_assist']);
export type QuestionLayoutMode = z.infer<typeof questionLayoutModeSchema>;

export const questionDocumentSchema = z.object({
  questionId: z.string(),
  version: z.number().int().positive(),
  locale: z.literal('zh-CN'),
  blocks: z.array(questionBlockSchema),
  attachments: z.array(questionAttachmentSchema),
  layoutMode: questionLayoutModeSchema,
  accessibilityConfig: z.record(z.any()),
});

export type QuestionDocument = z.infer<typeof questionDocumentSchema>;

export const questionAnswerModeSchema = z.enum([
  'single_choice',
  'multiple_choice',
  'boolean',
  'text_blank',
  'numeric_blank',
  'formula_blank',
  'multi_blank',
  'table_fill',
  'matching',
  'sorting',
  'drag_drop',
  'hotspot',
  'geometry_draw',
  'stepwise',
  'image_upload',
  'short_answer',
  'audio_record',
]);

export type QuestionAnswerMode = z.infer<typeof questionAnswerModeSchema>;

export const questionOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  content: z.string().nullable().optional(),
});

export type QuestionOption = z.infer<typeof questionOptionSchema>;

export const questionAnswerSchemaSchema = z.object({
  questionId: z.string(),
  mode: questionAnswerModeSchema,
  responseShape: z.record(z.any()),
  validationRules: z.record(z.any()),
  gradingConfig: z.record(z.any()),
  options: z.array(questionOptionSchema).optional(),
  placeholder: z.string().nullable().optional(),
});

export type QuestionAnswerSchema = z.infer<typeof questionAnswerSchemaSchema>;

export const questionSourceTypeSchema = z.enum([
  'internal_authoring',
  'internal_textbook',
  'open_content',
  'public_reference',
  'partner',
]);

export type QuestionSourceType = z.infer<typeof questionSourceTypeSchema>;

export const questionLicenseClassSchema = z.enum([
  'A_INTERNAL',
  'B_OPEN',
  'C_PUBLIC_REFERENCE_ONLY',
  'D_COMMERCIAL_PARTNER',
]);

export type QuestionLicenseClass = z.infer<typeof questionLicenseClassSchema>;

export const questionSourceRecordSchema = z.object({
  questionId: z.string(),
  sourceType: questionSourceTypeSchema,
  sourceName: z.string(),
  sourcePathOrUrl: z.string(),
  licenseClass: questionLicenseClassSchema,
  licenseName: z.string().nullable(),
  importJobId: z.string().nullable(),
  reviewStatus: z.enum(['pending', 'approved', 'rejected']),
  notes: z.string().nullable(),
});

export type QuestionSourceRecord = z.infer<typeof questionSourceRecordSchema>;

export const questionImportTypeSchema = z.enum(['textbook_pdf', 'qti', 'h5p', 'manual_seed']);
export type QuestionImportType = z.infer<typeof questionImportTypeSchema>;

export const questionImportJobStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);
export type QuestionImportJobStatus = z.infer<typeof questionImportJobStatusSchema>;

export const questionImportReviewStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export type QuestionImportReviewStatus = z.infer<typeof questionImportReviewStatusSchema>;

export const questionImportSplitModeSchema = z.enum(['page', 'question']);
export type QuestionImportSplitMode = z.infer<typeof questionImportSplitModeSchema>;

export const questionImportQualityLevelSchema = z.enum(['low', 'medium', 'high']);
export type QuestionImportQualityLevel = z.infer<typeof questionImportQualityLevelSchema>;

export const questionImportAiSuggestionSchema = z.object({
  suggestedStem: z.string(),
  suggestedSectionLabel: z.string().nullable(),
  suggestedAnswerMode: questionAnswerModeSchema.nullable(),
  reviewAdvice: z.string(),
  actionablePoints: z.array(z.string()),
  confidenceLevel: z.enum(['low', 'medium', 'high']),
  reviewRequired: z.boolean(),
});

export type QuestionImportAiSuggestion = z.infer<typeof questionImportAiSuggestionSchema>;

export const questionImportSourcePolicySchema = z.object({
  sourceType: questionSourceTypeSchema,
  licenseClass: questionLicenseClassSchema,
  licenseName: z.string().nullable(),
});

export type QuestionImportSourcePolicy = z.infer<typeof questionImportSourcePolicySchema>;

export const questionImportJobSchema = z.object({
  id: z.string(),
  importType: questionImportTypeSchema,
  subject: subjectSchema,
  sourcePathOrUrl: z.string(),
  sourcePolicy: questionImportSourcePolicySchema,
  status: questionImportJobStatusSchema,
  fileCount: z.number().int().nonnegative(),
  recordCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});

export type QuestionImportJob = z.infer<typeof questionImportJobSchema>;

export const questionImportRecordSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  subject: subjectSchema,
  sourcePath: z.string(),
  sourceName: z.string(),
  pageNumber: z.number().int().positive().nullable(),
  candidateIndexOnPage: z.number().int().positive(),
  splitMode: questionImportSplitModeSchema,
  sectionLabel: z.string().nullable(),
  qualityLevel: questionImportQualityLevelSchema,
  qualityFlags: z.array(z.string()),
  excerpt: z.string(),
  previewImageDataUrl: z.string().nullable(),
  detectionReason: z.string(),
  candidateStem: z.string(),
  aiSuggestion: questionImportAiSuggestionSchema.nullable(),
  aiSuggestedAt: z.string().nullable(),
  reviewStatus: questionImportReviewStatusSchema,
  reviewComment: z.string().nullable(),
  candidateQuestionId: z.string().nullable(),
  createdAt: z.string(),
  reviewedAt: z.string().nullable(),
});

export type QuestionImportRecord = z.infer<typeof questionImportRecordSchema>;

export const questionRenderPayloadSchema = z.object({
  question: questionRuntimeSummarySchema,
  document: questionDocumentSchema,
  answerSchema: questionAnswerSchemaSchema,
  source: questionSourceRecordSchema,
});

export type QuestionRenderPayload = z.infer<typeof questionRenderPayloadSchema>;

export const studentAnswerPayloadSchema = z.object({
  questionId: z.string(),
  mode: questionAnswerModeSchema,
  response: z.record(z.any()),
  clientMeta: z
    .object({
      elapsedMs: z.number().int().positive().optional(),
      inputMethod: z.string().optional(),
      usedToolbar: z.array(z.string()).optional(),
    })
    .optional(),
});

export type StudentAnswerPayload = z.infer<typeof studentAnswerPayloadSchema>;

export const answerValidationFieldErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
});

export type AnswerValidationFieldError = z.infer<typeof answerValidationFieldErrorSchema>;

export const answerValidationResultSchema = z.object({
  valid: z.boolean(),
  normalizedAnswer: z.any().nullable(),
  fieldErrors: z.array(answerValidationFieldErrorSchema),
  message: z.string().nullable(),
});

export type AnswerValidationResult = z.infer<typeof answerValidationResultSchema>;

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
      knowledgePointName: z.string(),
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

export const assessmentProgressItemSchema = z.object({
  questionId: z.string(),
  questionStem: z.string(),
  answered: z.boolean(),
  correct: z.boolean().nullable(),
  score: z.number().nullable(),
  errorType: z.string().nullable(),
  analysis: z.string().nullable(),
  elapsedMs: z.number().int().nonnegative().nullable(),
});

export type AssessmentProgressItem = z.infer<typeof assessmentProgressItemSchema>;

export const assessmentProgressViewSchema = z.object({
  sessionId: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'aborted']),
  answeredCount: z.number().int().nonnegative(),
  totalCount: z.number().int().positive(),
  progressPercent: z.number(),
  currentIndex: z.number().int().nonnegative(),
  currentItemId: z.string().nullable(),
  items: z.array(assessmentProgressItemSchema),
});

export type AssessmentProgressView = z.infer<typeof assessmentProgressViewSchema>;

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

export const missionResultItemSchema = z.object({
  questionId: z.string(),
  questionStem: z.string(),
  attemptCount: z.number().int().positive(),
  correct: z.boolean(),
  score: z.number(),
  hintLevelUsed: z.number().int().nonnegative(),
  analysis: z.string(),
});

export type MissionResultItem = z.infer<typeof missionResultItemSchema>;

export const missionResultViewSchema = z.object({
  missionId: z.string(),
  subject: subjectSchema,
  missionType: missionTypeSchema,
  title: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'skipped']),
  correctCount: z.number().int().nonnegative(),
  totalCount: z.number().int().positive(),
  incorrectCount: z.number().int().nonnegative(),
  hintUsedCount: z.number().int().nonnegative(),
  totalAttempts: z.number().int().nonnegative(),
  summary: z.string(),
  targetKnowledgePointIds: z.array(z.string()),
  targetKnowledgePointNames: z.array(z.string()),
  nextActions: z.array(z.string()),
  itemResults: z.array(missionResultItemSchema),
});

export type MissionResultView = z.infer<typeof missionResultViewSchema>;

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
  subject: subjectSchema.nullable(),
  pageContext: z.enum(['student_home', 'assessment', 'mission', 'review', 'weekly_report']),
  contextRefType: z.string().nullable(),
  contextRefId: z.string().nullable(),
  status: z.enum(['active', 'closed']),
});

export type AssistantSession = z.infer<typeof assistantSessionSchema>;

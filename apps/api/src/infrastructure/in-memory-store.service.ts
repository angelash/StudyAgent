import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  AIAnalysisResponse,
  QuestionAnswerSchema,
  QuestionDocument,
  QuestionImportJob,
  QuestionImportRecord,
  QuestionSourceRecord,
  AssessmentResult,
  AssessmentSession,
  AssistantSession,
  DailyMission,
  KnowledgePoint,
  Question,
  StudyPlan,
  StudentProfile,
  SubjectEnrollment,
  TextbookVolume,
  UserRole,
} from '@study-agent/contracts';

export type InMemoryUserAccount = {
  id: string;
  principal: string;
  passwordHash: string;
  role: UserRole;
  displayName: string;
  status: 'active' | 'disabled';
};

export type InMemoryAuthSession = {
  id: string;
  token: string;
  userId: string;
  createdAt: string;
};

export type ParentStudentBinding = {
  id: string;
  parentUserId: string;
  studentId: string;
  relation: 'father' | 'mother' | 'guardian';
  status: 'active' | 'inactive';
};

export type TextbookUnit = {
  id: string;
  volumeId: string;
  title: string;
  sortOrder: number;
};

export type TextbookLesson = {
  id: string;
  unitId: string;
  title: string;
  sortOrder: number;
};

export type AssessmentAnswerRecord = {
  id: string;
  sessionId: string;
  questionId: string;
  answer: unknown;
  correct: boolean;
  score: number;
  errorType: string | null;
  analysis: string;
  elapsedMs: number;
};

export type DailyMissionInternal = DailyMission & {
  createdAt: string;
  studentSummary: string;
};

export type MissionAnswerRecord = {
  id: string;
  missionId: string;
  questionId: string;
  answer: unknown;
  correct: boolean;
  score: number;
  elapsedMs: number;
  attemptCount: number;
  hintLevelUsed: number;
  analysis: string;
};

export type AssistantMessage = {
  id: string;
  sessionId: string;
  sender: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

export type AIInsightRecord = {
  id: string;
  sourceType: 'assessment' | 'hint' | 'assistant';
  sourceId: string;
  studentId: string | null;
  summary: string;
  payload: AIAnalysisResponse;
  createdAt: string;
};

@Injectable()
export class InMemoryStoreService {
  users: InMemoryUserAccount[] = [];
  sessions: InMemoryAuthSession[] = [];
  students: StudentProfile[] = [];
  bindings: ParentStudentBinding[] = [];
  subjectEnrollments: SubjectEnrollment[] = [];
  textbookVolumes: TextbookVolume[] = [];
  textbookUnits: TextbookUnit[] = [];
  textbookLessons: TextbookLesson[] = [];
  knowledgePoints: KnowledgePoint[] = [];
  questions: Question[] = [];
  questionDocuments: QuestionDocument[] = [];
  questionAnswerSchemas: QuestionAnswerSchema[] = [];
  questionSources: QuestionSourceRecord[] = [];
  questionImportJobs: QuestionImportJob[] = [];
  questionImportRecords: QuestionImportRecord[] = [];
  assessments: AssessmentSession[] = [];
  assessmentAnswers: AssessmentAnswerRecord[] = [];
  assessmentResults: AssessmentResult[] = [];
  studyPlans: StudyPlan[] = [];
  missions: DailyMissionInternal[] = [];
  missionAnswers: MissionAnswerRecord[] = [];
  assistantSessions: AssistantSession[] = [];
  assistantMessages: AssistantMessage[] = [];
  aiInsights: AIInsightRecord[] = [];
  events: Array<Record<string, unknown>> = [];

  nextId(prefix: string): string {
    return `${prefix}_${randomUUID()}`;
  }

  reset() {
    this.users = [];
    this.sessions = [];
    this.students = [];
    this.bindings = [];
    this.subjectEnrollments = [];
    this.textbookVolumes = [];
    this.textbookUnits = [];
    this.textbookLessons = [];
    this.knowledgePoints = [];
    this.questions = [];
    this.questionDocuments = [];
    this.questionAnswerSchemas = [];
    this.questionSources = [];
    this.questionImportJobs = [];
    this.questionImportRecords = [];
    this.assessments = [];
    this.assessmentAnswers = [];
    this.assessmentResults = [];
    this.studyPlans = [];
    this.missions = [];
    this.missionAnswers = [];
    this.assistantSessions = [];
    this.assistantMessages = [];
    this.aiInsights = [];
    this.events = [];
  }
}

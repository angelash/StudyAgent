import { Injectable, OnModuleInit, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { DomainDatabase, DomainState, StateSnapshot } from './domain-database';
import { TaskFence, TaskIntent, TaskOperation } from './task-repository';
import type { PaperPublication, LibraryBookmark } from '../modules/library/library.types';
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
  KnowledgeAtom, LearningScope, MeasurementItem, DiagnosticSession, DiagnosticResponse,
  DiagnosticHypothesis, DiagnosticGuidancePlan, ReviewTask, ScoringRevision, DiagnosticReport,
  PracticeSession, PracticeAttempt, PracticeHint,
  TextbookAtomMapping, CurriculumRevision,
  TeacherStudentAssignment, EvidenceFeedback,
  ImportFile, ImportPageEvidenceRef, ProcessingArtifact,
  GuidancePlanRevision,
  StudentLearningAccess, StudentLearningCode, StudentAccessRevision, StudentProgressProposal,
} from '@study-agent/contracts';

export type InMemoryUserAccount = {
  id: string;
  principal: string;
  passwordHash: string;
  role: UserRole;
  displayName: string;
  status: 'active' | 'disabled';
  version?: number;
};

export type InMemoryAuthSession = {
  id: string;
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  studentId?: string; guardianId?: string; accessVersion?: number;
};

export type StudentInvitation = {
  id: string;
  studentId: string;
  issuerId: string;
  recipientPrincipal: string;
  tokenHash: string;
  expiresAt: string;
  consumedAt: string | null;
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
  requestKey?: string;
  inReplyTo?: string;
  source?: 'rules' | 'openai';
  evidenceIds?: string[];
  assistanceRecorded?: boolean;
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
export class InMemoryStoreService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly contexts = new AsyncLocalStorage<{ baseline: StateSnapshot; state: DomainState; enqueue: TaskIntent[]; taskOperations: TaskOperation[] }>();
  private readonly root: DomainState = {};
  private baseline: StateSnapshot = { revision: 0, state: {} };
  private database?: DomainDatabase;
  private memoryQueue?: DomainDatabase;

  constructor() {
    // Kept as the injection token for existing modules; production data is transactional and durable.
    for (const key of Object.keys(this)) {
      const value = (this as unknown as Record<string, unknown>)[key];
      if (!Array.isArray(value)) continue;
      this.root[key] = value;
      Object.defineProperty(this, key, { enumerable: true,
        get: () => (this.contexts.getStore()?.state ?? this.root)[key] ??= [],
        set: (items: unknown[]) => { (this.contexts.getStore()?.state ?? this.root)[key] = items; } });
    }
  }

  async onModuleInit() {
    if (process.env.STUDY_STORAGE === 'memory' || process.env.NODE_ENV === 'test') {
      if (process.env.NODE_ENV === 'production') throw new Error('Memory storage is not permitted in production');
      this.memoryQueue = new DomainDatabase(':memory:');
      await this.memoryQueue.open();
      return;
    }
    const localRoot = process.cwd().replace(/\\/g, '/').endsWith('/apps/api') ? resolve('../..') : process.cwd();
    if (existsSync(resolve(process.env.STUDY_DATA_DIR ?? resolve(localRoot, 'data'), '.study-restore-incomplete'))) throw new Error('Data restoration is incomplete; verify the restore receipt before starting the application');
    const location = process.env.STUDY_STORAGE === 'postgres' ? process.env.DATABASE_URL :
      resolve(process.env.STUDY_DATA_DIR ?? resolve(localRoot, 'data'), 'study-agent.sqlite3');
    if (!location) throw new Error('DATABASE_URL is required for PostgreSQL storage');
    this.database = new DomainDatabase(location);
    await this.database.open();
    this.baseline = await this.database.read();
    for (const [key, rows] of Object.entries(this.baseline.state)) this.root[key] = structuredClone(rows);
  }

  async onApplicationBootstrap() {
    if (this.database) {
      const revision = await this.database.commit(this.baseline, this.root);
      this.baseline = { revision, state: structuredClone(this.root) };
    }
  }

  async requestContext<T>(fn: () => T): Promise<T> {
    if (!this.database) return fn();
    const baseline = await this.database.read();
    const state = structuredClone(baseline.state);
    return this.contexts.run({ baseline, state, enqueue: [], taskOperations: [] }, fn);
  }

  async commitRequest(fence?: TaskFence) {
    const context = this.contexts.getStore();
    if (this.database && context) {
      context.baseline.revision = await this.database.commit(context.baseline, context.state, { enqueue: context.enqueue, fence, taskOperations: context.taskOperations });
      context.baseline.state = structuredClone(context.state);
      context.enqueue = [];
      context.taskOperations = [];
    } else if (this.memoryQueue && (context || fence)) {
      await this.memoryQueue.commit(await this.memoryQueue.read(), {}, { enqueue: context?.enqueue, fence, taskOperations: context?.taskOperations });
      if (context) { for (const [key, value] of Object.entries(context.state)) this.root[key] = value; context.enqueue = []; context.taskOperations = []; }
    }
  }

  async transaction<T>(fn: () => T | Promise<T>, fence?: TaskFence): Promise<T> {
    if (!this.database && this.memoryQueue) {
      const state = structuredClone(this.root);
      return this.contexts.run({ baseline: { revision: 0, state: structuredClone(state) }, state, enqueue: [], taskOperations: [] }, async () => {
        const result = await fn(); await this.commitRequest(fence); return result;
      });
    }
    return this.requestContext(async () => { const result = await fn(); await this.commitRequest(fence); return result; });
  }

  get tasks() { const db = this.database ?? this.memoryQueue; if (!db) throw new Error('Task storage is not initialized'); return db.tasks; }
  async enqueueTask(intent: TaskIntent) {
    const context = this.contexts.getStore();
    if (context) context.enqueue.push(intent);
    else if (this.memoryQueue) await this.memoryQueue.commit(await this.memoryQueue.read(), {}, { enqueue: [intent] });
    else throw new Error('Tasks must be requested inside a durable transaction');
  }
  async controlTask(operation: TaskOperation) {
    const context = this.contexts.getStore();
    if (context) context.taskOperations.push(operation);
    else if (this.memoryQueue) await this.memoryQueue.commit(await this.memoryQueue.read(), {}, { taskOperations: [operation] });
    else throw new Error('Task controls require a durable request transaction');
  }

  get persistence() { return { driver: this.database?.driver ?? 'memory', durable: Boolean(this.database) }; }
  async onModuleDestroy() { await this.database?.close(); await this.memoryQueue?.close(); }
  users: InMemoryUserAccount[] = [];
  paperPublications: PaperPublication[] = [];
  libraryBookmarks: LibraryBookmark[] = [];
  practiceSessions: PracticeSession[] = [];
  practiceAttempts: PracticeAttempt[] = [];
  practiceHints: PracticeHint[] = [];
  practiceScoringRevisions: ScoringRevision[] = [];
  teacherAssignments: TeacherStudentAssignment[] = [];
  evidenceFeedback: EvidenceFeedback[] = [];
  importFiles: ImportFile[] = [];
  processingArtifacts: ProcessingArtifact[] = [];
  importPages: ImportPageEvidenceRef[] = [];
  guidancePlanRevisions: GuidancePlanRevision[] = [];
  studentLearningAccess: StudentLearningAccess[] = [];
  studentLearningCodes: StudentLearningCode[] = [];
  studentAccessRevisions: StudentAccessRevision[] = [];
  studentProgressProposals: StudentProgressProposal[] = [];
  sessions: InMemoryAuthSession[] = [];
  students: StudentProfile[] = [];
  bindings: ParentStudentBinding[] = [];
  studentInvitations: StudentInvitation[] = [];
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
  assistantSessions: Array<AssistantSession & { ownerUserId: string; scopeKey?: string }> = [];
  assistantMessages: AssistantMessage[] = [];
  aiInsights: AIInsightRecord[] = [];
  events: Array<Record<string, unknown>> = [];
  knowledgeAtoms: KnowledgeAtom[] = [];
  learningScopes: LearningScope[] = [];
  measurementItems: MeasurementItem[] = [];
  textbookAtomMappings: TextbookAtomMapping[] = [];
  curriculumRevisions: CurriculumRevision[] = [];
  diagnosticSessions: DiagnosticSession[] = [];
  diagnosticResponses: DiagnosticResponse[] = [];
  diagnosticHypotheses: DiagnosticHypothesis[] = [];
  diagnosticPlans: DiagnosticGuidancePlan[] = [];
  reviewTasks: ReviewTask[] = [];
  scoringRevisions: ScoringRevision[] = [];
  diagnosticHints: Array<{ id: string; sessionId: string; itemId: string; level: number; at: string }> = [];
  diagnosticReports: Array<{ id: string; sessionId: string; version: number; createdAt: string; report: DiagnosticReport }> = [];
  diagnosticDrafts: Array<{ id: string; sessionId: string; itemId: string; answer: unknown; updatedAt: string }> = [];

  nextId(prefix: string): string {
    return `${prefix}_${randomUUID()}`;
  }

  reset() {
    if (this.database) throw new Error('reset is only available in isolated memory tests');
    this.users = [];
    this.paperPublications = [];
    this.libraryBookmarks = [];
    this.practiceSessions = [];
    this.practiceAttempts = [];
    this.practiceHints = [];
    this.practiceScoringRevisions = [];
    this.teacherAssignments = [];
    this.evidenceFeedback = [];
    this.importFiles = [];
    this.processingArtifacts = [];
    this.importPages = [];
    this.guidancePlanRevisions = [];
    this.studentLearningAccess = []; this.studentLearningCodes = []; this.studentAccessRevisions = [];
    this.studentProgressProposals = [];
    this.sessions = [];
    this.students = [];
    this.bindings = [];
    this.studentInvitations = [];
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
    this.knowledgeAtoms = [];
    this.learningScopes = [];
    this.measurementItems = [];
    this.textbookAtomMappings = [];
    this.curriculumRevisions = [];
    this.diagnosticSessions = [];
    this.diagnosticResponses = [];
    this.diagnosticHypotheses = [];
    this.diagnosticPlans = [];
    this.reviewTasks = [];
    this.scoringRevisions = [];
    this.diagnosticHints = [];
    this.diagnosticReports = [];
    this.diagnosticDrafts = [];
  }
}

import type { TeachingToolRunRecord } from '../modules/ai/teaching-tool-record';
import type { ProjectUploadRecord,ProjectAssetRecord } from '../modules/learning/project-file-record';
import type { SourceCourseCheckRecord,SourceCourseCheckPublication } from '../modules/learning/source-course-check-record';
import type { TopicWhiteboardDraftRecord, TopicWhiteboardRecord } from '../modules/learning/topic-whiteboard-record';
import type { TopicVisualRecord } from '../modules/learning/topic-whiteboard-visual-record';
import type { PaperPracticeSessionRecord, PaperPracticeCommandRecord } from '../modules/library/paper-practice-record';
import type { AnswerDraftMetadata } from '@study-agent/contracts';
import type { ClassroomCodeDraftRecord } from '../modules/learning/classroom-code.service';
import type { ClassroomTurnRecord } from '../modules/learning/classroom-turn-record';
import type { WhiteboardQuestionRecord } from '../modules/learning/whiteboard-question-record';
import type { QuestionVisualRecord } from '../modules/learning/whiteboard-question-visual-record';
import type { AssistantTurnRecord } from '../modules/ai/assistant-turn-record';
import type { AssistantLectureSnapshot } from '../modules/ai/assistant-lecture-context';
import type { GuidanceModelSuggestionRecord } from '../modules/diagnostics/guidance-model-record';
import { Injectable, OnModuleInit, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { ClassroomSessionRecord } from '../modules/learning/classroom.service';
import type { CourseProjectRecord } from '../modules/learning/course-project.service';
import type { SourceCourseRecord } from '../modules/learning/source-course-content';
import type { SourceCourseStageRecord } from '../modules/learning/source-course-compilation';
import type { StudioMaterialUploadRecord } from '../modules/learning/studio-material-upload.service';
import type { StudioMaterialAssetRecord } from '../modules/learning/studio-material-storage';
import type { StudioOriginalRepairRecord } from '../modules/learning/studio-original-repair-record';
import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { DomainDatabase, DomainState, StateSnapshot, freezeJson } from './domain-database';
import { TaskFence, TaskIntent, TaskOperation } from './task-repository';
import { DomainSelector, ReadDependency, compileSelector, indexedPositions, validateSelector } from './domain-selection';
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
  KnowledgeAtom, LearningScope, MeasurementItem, DiagnosticSession, DiagnosticResponse, DiagnosticBlueprintReservation,
  DiagnosticHypothesis, DiagnosticGuidancePlan, ReviewTask, ScoringRevision, DiagnosticReport,
  PracticeSession, PracticeAttempt, PracticeHint,
  TextbookAtomMapping, CurriculumRevision,
  TeacherStudentAssignment, EvidenceFeedback,
  ImportFile, ImportPageEvidenceRef, ProcessingArtifact,
  GuidancePlanRevision,
  StudentLearningAccess, StudentLearningCode, StudentAccessRevision, StudentProgressProposal,
  PrivacyReceipt, StudentMedia, ClassroomVisualRecord,
  MeasurementContentCandidate,
  MistakeNotebookEntry,
  GespLearningScope, GespLearningScopeRevision, GespCodeSubmissionReceipt, GespProbeSubmissionReceipt,
  GespHintEvent, GespGuidancePlan, GespGuidancePlanRevision, GespReviewTask, GespTaskReview, GespTaskReviewRevision,
  StudioCourse, StudioActivity, StudioWhiteboard, StudioConnector, StudioScheduleEvent, StudioStudyPlan, StudioSourceMaterial, StudioLearningPack,
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
  source?: 'rules' | 'openai' | 'xiaojiu';
  modelId?: string | null;
  modelName?: string | null;
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

type StoreCollection = { [K in keyof InMemoryStoreService]: InMemoryStoreService[K] extends unknown[] ? K : never }[keyof InMemoryStoreService];
type StoreRecord<K extends StoreCollection> = InMemoryStoreService[K] extends Array<infer T> ? T : never;
type RequestWorkspace = { baseline: StateSnapshot; state: DomainState; touched: Set<string>; copied: Set<string>;
  indexBases: DomainState; dirty: Map<string, Set<number>>; unindexed: Set<string>;
  reads: Map<string, Map<string, DomainSelector> | null>; enqueue: TaskIntent[]; taskOperations: TaskOperation[] };

@Injectable()
export class InMemoryStoreService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly contexts = new AsyncLocalStorage<RequestWorkspace>();
  private readonly root: DomainState = {};
  private baseline: StateSnapshot = { revision: 0, state: {} };
  private database?: DomainDatabase;
  private memoryQueue?: DomainDatabase;
  private readonly workspaceCounters = { collectionsCloned: 0, recordsCloned: 0 };

  constructor() {
    // Kept as the injection token for existing modules; production data is transactional and durable.
    for (const key of Object.keys(this)) {
      const value = (this as unknown as Record<string, unknown>)[key];
      if (!Array.isArray(value)) continue;
      this.root[key] = value;
      Object.defineProperty(this, key, { enumerable: true,
        get: () => {
          this.recordRead(key);
          return this.mutableCollection(key, true);
        },
        set: (items: unknown[]) => {
          const context = this.contexts.getStore();
          if (context) { this.recordRead(key); context.state[key] = items; context.touched.add(key); context.copied.add(key); }
          else this.root[key] = items;
        } });
    }
  }

  private recordRead(collection: string, where?: DomainSelector) {
    const context = this.contexts.getStore(); if (!context) return;
    if (!where || !Object.keys(where).length) { context.reads.set(collection, null); return; }
    if (context.reads.get(collection) === null) return;
    const reads = context.reads.get(collection) ?? new Map<string, DomainSelector>();
    const key = JSON.stringify(Object.entries(where).sort(([a], [b]) => a.localeCompare(b)).map(([field, expected]) =>
      [field, (Array.isArray(expected) ? expected : [expected]).map(value => value === undefined ? ['missing'] : ['value', value])]));
    reads.set(key, structuredClone(where)); context.reads.set(collection, reads);
  }

  private mutableCollection(collection: string, allRecords: boolean): unknown[] {
    const context = this.contexts.getStore();
    if (!context) return this.root[collection] ??= [];
    if (allRecords && !context.touched.has(collection)) {
      context.state[collection] = structuredClone(context.state[collection] ?? []);
      context.touched.add(collection); context.copied.add(collection);
      this.workspaceCounters.collectionsCloned++; this.workspaceCounters.recordsCloned += context.state[collection].length;
    } else if (!context.copied.has(collection)) {
      context.state[collection] = [...(context.state[collection] ?? [])]; context.copied.add(collection);
      this.workspaceCounters.collectionsCloned++;
    }
    return context.state[collection];
  }

  /** Equality selection records row and membership dependencies, including absent matches. */
  select<K extends StoreCollection>(collection: K, where: DomainSelector): Array<StoreRecord<K>> {
    validateSelector(where); this.recordRead(collection, where);
    const context = this.contexts.getStore(), predicate = compileSelector(where);
    let rows = (context ? context.state[collection] : this.root[collection]) ?? [];
    const dirty = context?.dirty.get(collection) ?? new Set<number>(); context?.dirty.set(collection, dirty);
    const candidates = context && !context.touched.has(collection) && !context.unindexed.has(collection) ? indexedPositions(context.indexBases[collection] ?? [], where) : undefined;
    const positions = candidates ? [...new Set([...candidates, ...dirty])].sort((a, b) => a - b) : rows.map((_, position) => position);
    const selected: Array<StoreRecord<K>> = [];
    for (const position of positions) {
      let row = rows[position]; if (!predicate(row)) continue;
      if (Object.isFrozen(row)) { rows = this.mutableCollection(collection, false); row = rows[position] = structuredClone(row); this.workspaceCounters.recordsCloned++; }
      dirty.add(position); selected.push(row as StoreRecord<K>);
    }
    return selected;
  }

  find<K extends StoreCollection>(collection: K, where: DomainSelector): StoreRecord<K> | undefined { return this.select(collection, where)[0]; }

  /** Immutable analysis view. Edits must use find/select so dependencies and local copies remain explicit. */
  inspect<K extends StoreCollection>(collection: K): ReadonlyArray<StoreRecord<K>> {
    this.recordRead(collection);
    const context = this.contexts.getStore(), rows = (context ? context.state[collection] : this.root[collection]) ?? [];
    if (Object.isFrozen(rows)) return rows as Array<StoreRecord<K>>;
    const copy = rows.map(row => {
      if (Object.isFrozen(row)) return row;
      if (context) this.workspaceCounters.recordsCloned++;
      return structuredClone(row);
    });
    return freezeJson(copy) as Array<StoreRecord<K>>;
  }

  /** Append never reads all existing records; the database checks every new identity. */
  append<K extends StoreCollection>(collection: K, ...records: Array<StoreRecord<K>>) {
    const rows = this.mutableCollection(collection, false), context = this.contexts.getStore();
    const dirty = context?.dirty.get(collection) ?? new Set<number>(); context?.dirty.set(collection, dirty);
    for (const record of records) { dirty.add(rows.length); rows.push(record); }
  }

  remove<K extends StoreCollection>(collection: K, where: DomainSelector) {
    validateSelector(where); this.recordRead(collection, where);
    const rows = this.mutableCollection(collection, false), context = this.contexts.getStore();
    const predicate = compileSelector(where), retained = rows.filter(row => !predicate(row));
    if (context) { context.state[collection] = retained; context.unindexed.add(collection); } else this.root[collection] = retained;
    return rows.length - retained.length;
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
    // Revision is checked in the database on every request. Only accessed
    // collections are copied; the frozen cache is never a mutable request store.
    const baseline = await this.database.readImmutable();
    const state = { ...baseline.state };
    return this.contexts.run({ baseline, state, touched: new Set(), copied: new Set(), indexBases: baseline.state, dirty: new Map(), unindexed: new Set(), reads: new Map(), enqueue: [], taskOperations: [] }, fn);
  }

  async commitRequest(fence?: TaskFence) {
    const context = this.contexts.getStore();
    if (this.database && context) {
      const reads: ReadDependency[] = [...context.reads].flatMap(([collection, selections]) => selections === null ? [{ collection }] : [...selections.values()].map(where => ({ collection, where })));
      const writeHints = Object.fromEntries([...context.copied].filter(collection => !context.touched.has(collection) && !context.unindexed.has(collection))
        .map(collection => [collection, [...(context.dirty.get(collection) ?? [])]]));
      const revision = await this.database.commit(context.baseline, context.state, { enqueue: context.enqueue, fence, taskOperations: context.taskOperations, reads, writeHints });
      // A scoped commit can merge with newer unrelated data. Its checkpoint must
      // describe this workspace, never pretend that old arrays are the latest snapshot.
      const checkpoint = { ...context.state };
      for (const key of context.copied) checkpoint[key] = context.state[key].map(row => Object.isFrozen(row) ? row : structuredClone(row));
      context.baseline = { revision, state: checkpoint };
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
      return this.contexts.run({ baseline: { revision: 0, state: structuredClone(state) }, state, touched: new Set(Object.keys(state)), copied: new Set(Object.keys(state)), indexBases: {}, dirty: new Map(), unindexed: new Set(), reads: new Map(), enqueue: [], taskOperations: [] }, async () => {
        const result = await fn(); await this.commitRequest(fence); return result;
      });
    }
    return this.requestContext(async () => { const result = await fn(); await this.commitRequest(fence); return result; });
  }

  get tasks() { const db = this.database ?? this.memoryQueue; if (!db) throw new Error('Task storage is not initialized'); return db.tasks; }
  get limits() { const db = this.database ?? this.memoryQueue; if (!db) throw new Error('Security storage is not initialized'); return db.limits; }
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
  get storageDiagnostics() {
    const database = this.database ?? this.memoryQueue;
    return database ? { ...database.diagnostics, ...this.workspaceCounters } : null;
  }
  async onModuleDestroy() { await this.database?.close(); await this.memoryQueue?.close(); }
  users: InMemoryUserAccount[] = [];
  paperPublications: PaperPublication[] = [];
  libraryBookmarks: LibraryBookmark[] = [];
  paperPracticeSessions: PaperPracticeSessionRecord[] = [];
  paperPracticeCommands: PaperPracticeCommandRecord[] = [];
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
  privacyRequests: PrivacyReceipt[] = [];
  studentMedia: StudentMedia[] = [];
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
  assistantSessions: Array<AssistantSession & { ownerUserId: string; scopeKey?: string; lectureSnapshot?: AssistantLectureSnapshot }> = [];
  assistantMessages: AssistantMessage[] = [];
  assistantTurns: AssistantTurnRecord[] = [];
  guidanceModelSuggestions: GuidanceModelSuggestionRecord[] = [];
  teachingToolRuns: TeachingToolRunRecord[] = [];
  aiInsights: AIInsightRecord[] = [];
  events: Array<Record<string, unknown>> = [];
  knowledgeAtoms: KnowledgeAtom[] = [];
  learningScopes: LearningScope[] = [];
  measurementItems: MeasurementItem[] = [];
  measurementCandidates: MeasurementContentCandidate[] = [];
  mistakeNotebookEntries: MistakeNotebookEntry[] = [];
  textbookAtomMappings: TextbookAtomMapping[] = [];
  curriculumRevisions: CurriculumRevision[] = [];
  diagnosticSessions: DiagnosticSession[] = [];
  diagnosticBlueprints: DiagnosticBlueprintReservation[] = [];
  diagnosticResponses: DiagnosticResponse[] = [];
  diagnosticHypotheses: DiagnosticHypothesis[] = [];
  diagnosticPlans: DiagnosticGuidancePlan[] = [];
  reviewTasks: ReviewTask[] = [];
  scoringRevisions: ScoringRevision[] = [];
  diagnosticHints: Array<{ id: string; sessionId: string; itemId: string; level: number; at: string }> = [];
  diagnosticReports: Array<{ id: string; sessionId: string; version: number; createdAt: string; report: DiagnosticReport;
    reanalysis?: { actorId: string; requestKey: string; inputHash: string } }> = [];
  diagnosticDrafts: Array<{ id: string; sessionId: string; itemId: string; answer: unknown; updatedAt: string } & AnswerDraftMetadata> = [];
  gespLearningScopes: GespLearningScope[] = [];
  gespLearningScopeRevisions: GespLearningScopeRevision[] = [];
  gespCodeSubmissions: GespCodeSubmissionReceipt[] = [];
  gespProbeSubmissions: GespProbeSubmissionReceipt[] = [];
  gespHintEvents: GespHintEvent[] = [];
  gespGuidancePlans: GespGuidancePlan[] = [];
  gespGuidancePlanRevisions: GespGuidancePlanRevision[] = [];
  gespReviewTasks: GespReviewTask[] = [];
  gespTaskReviews: GespTaskReview[] = [];
  gespTaskReviewRevisions: GespTaskReviewRevision[] = [];
  studioCourses: StudioCourse[] = [];
  classroomSessions: ClassroomSessionRecord[] = [];
  classroomTurns: ClassroomTurnRecord[] = [];
  whiteboardQuestionTurns: WhiteboardQuestionRecord[] = [];
  whiteboardQuestionVisuals: QuestionVisualRecord[] = [];
  classroomCodeDrafts: ClassroomCodeDraftRecord[] = [];
  classroomVisuals: ClassroomVisualRecord[] = [];
  courseProjects: CourseProjectRecord[] = [];
  projectAssetUploads: ProjectUploadRecord[] = [];
  projectAssets: ProjectAssetRecord[] = [];
  sourceCourses: SourceCourseRecord[] = [];
  sourceCourseChecks: SourceCourseCheckRecord[] = [];
  sourceCourseCheckPublications: SourceCourseCheckPublication[] = [];
  studioTopicWhiteboardDrafts: TopicWhiteboardDraftRecord[] = [];
  studioTopicWhiteboards: TopicWhiteboardRecord[] = [];
  studioTopicWhiteboardVisuals: TopicVisualRecord[] = [];
  sourceCourseStages: SourceCourseStageRecord[] = [];
  studioActivities: StudioActivity[] = [];
  studioStudyPlans: StudioStudyPlan[] = [];
  studioSourceMaterials: StudioSourceMaterial[] = [];
  studioMaterialUploads: StudioMaterialUploadRecord[] = [];
  studioMaterialAssets: StudioMaterialAssetRecord[] = [];
  studioOriginalRepairs: StudioOriginalRepairRecord[] = [];
  studioLearningPacks: StudioLearningPack[] = [];
  studioWhiteboards: StudioWhiteboard[] = [];
  studioConnectors: Array<StudioConnector & { encryptedFeedUrl: string; requestKey?: string; requestHash?: string; createdBy?: string }> = [];
  studioScheduleEvents: Array<StudioScheduleEvent & { createdBy?: string; requestHash?: string }> = [];

  nextId(prefix: string): string {
    return `${prefix}_${randomUUID()}`;
  }

  reset() {
    if (this.database) throw new Error('reset is only available in isolated memory tests');
    this.users = [];
    this.paperPublications = [];
    this.libraryBookmarks = [];
    this.paperPracticeSessions = [];
    this.paperPracticeCommands = [];
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
    this.privacyRequests = [];
    this.studentMedia = [];
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
    this.assistantTurns = [];
    this.guidanceModelSuggestions = [];
    this.teachingToolRuns = [];
    this.aiInsights = [];
    this.events = [];
    this.knowledgeAtoms = [];
    this.learningScopes = [];
    this.measurementItems = [];
    this.measurementCandidates = [];
    this.mistakeNotebookEntries = [];
    this.textbookAtomMappings = [];
    this.curriculumRevisions = [];
    this.diagnosticSessions = [];
    this.diagnosticBlueprints = [];
    this.diagnosticResponses = [];
    this.diagnosticHypotheses = [];
    this.diagnosticPlans = [];
    this.reviewTasks = [];
    this.scoringRevisions = [];
    this.diagnosticHints = [];
    this.diagnosticReports = [];
    this.diagnosticDrafts = [];
    this.gespLearningScopes = [];
    this.gespLearningScopeRevisions = [];
    this.gespCodeSubmissions = [];
    this.gespProbeSubmissions = [];
    this.gespHintEvents = [];
    this.gespGuidancePlans = [];
    this.gespGuidancePlanRevisions = [];
    this.gespReviewTasks = [];
    this.gespTaskReviews = [];
    this.gespTaskReviewRevisions = [];
    this.studioCourses = [];
    this.classroomSessions = [];
    this.classroomTurns = [];
    this.whiteboardQuestionTurns = [];
    this.whiteboardQuestionVisuals = [];
    this.classroomCodeDrafts = [];
    this.classroomVisuals = [];
    this.courseProjects = [];
    this.projectAssetUploads = [];
    this.projectAssets = [];
    this.sourceCourses = [];
    this.sourceCourseChecks = [];
    this.studioTopicWhiteboardDrafts = [];
    this.studioTopicWhiteboards = [];
    this.studioTopicWhiteboardVisuals = [];
    this.sourceCourseCheckPublications = [];
    this.sourceCourseStages = [];
    this.studioActivities = [];
    this.studioStudyPlans = [];
    this.studioSourceMaterials = [];
    this.studioMaterialUploads = [];
    this.studioMaterialAssets = [];
    this.studioOriginalRepairs = [];
    this.studioLearningPacks = [];
    this.studioWhiteboards = [];
    this.studioConnectors = [];
    this.studioScheduleEvents = [];
  }
}

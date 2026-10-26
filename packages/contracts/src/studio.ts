import type { AtomTeaching, KnowledgeAtom, LearningScope, MasteryEstimate, TeachingVisual } from './diagnostics';

export type StudioSubject = 'chinese' | 'math' | 'english';
export type StudioLessonKind = 'learn' | 'practice' | 'project' | 'exam';
export type StudioLessonState = 'not_started' | 'attempted' | 'familiar' | 'proficient' | 'mastered';

export type StudioLesson = {
  id: string;
  atomId: string | null;
  title: string;
  objective: string;
  kind: StudioLessonKind;
  state: StudioLessonState;
  href: string;
  teaching?: { atomVersion: number; teaching: AtomTeaching };
};

export type StudioUnit = {
  id: string;
  title: string;
  objective: string;
  lessons: StudioLesson[];
};

export type StudioCoursePace = {
  version: 'course-pace-v1';
  minutesPerSession: number;
  teachingLanguage: 'source';
  estimatedMinutes: number;
  notice: string;
  sessions: Array<{ id: string; minutes: number; activities: Array<{ lessonId: string; title: string; kind: StudioLessonKind; part: number; parts: number; minutes: number }> }>;
};

export type StudioCourse = {
  id: string;
  studentId: string;
  subject: StudioSubject;
  grade: number;
  term: 'upper' | 'lower';
  title: string;
  description: string;
  objective: string;
  status: 'draft' | 'active' | 'completed';
  source: 'studyagent_curriculum';
  scopeVersion: number;
  textbookVersion: string;
  focusAtomIds: string[];
  units: StudioUnit[];
  materials: Array<{ id: string; title: string; detail: string; status: 'available' | 'needs_review' }>;
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
  learningProgress?: { viewedLessonIds: string[]; startedLessonIds: string[]; lastLessonId: string | null; updatedAt: string | null };
  pace?: StudioCoursePace;
};

export type StudioCoursePreview = StudioCourse & { canCreate: boolean; warnings: string[] };

export type StudioActivity = {
  id: string;
  studentId: string;
  subject: StudioSubject;
  kind: 'course_created' | 'lesson_started' | 'assessment' | 'plan' | 'review' | 'memory' | 'material';
  title: string;
  detail: string;
  href: string;
  at: string;
  status: 'new' | 'opened' | 'complete';
  requestKey?: string;
  referenceId?: string;
  actorId?: string;
  requestHash?: string;
};

export type StudioPlanSessionKind = 'learn' | 'practice' | 'transfer' | 'review';
export type StudioPlanSession = {
  id: string;
  index: number;
  title: string;
  kind: StudioPlanSessionKind;
  atomIds: string[];
  objective: string;
  successCriterion: string;
  startsAt: string;
  endsAt: string;
  status: 'scheduled' | 'completed' | 'skipped';
  calendarEventId: string;
  evidenceBasis: string;
  reviewForSessionId?: string;
  reviewOffsetDays?: 1 | 3 | 7 | 14;
};

export type StudioStudyPlan = {
  id: string;
  studentId: string;
  subject: StudioSubject;
  title: string;
  goal: string;
  targetDate: string;
  minutesPerDay: number;
  status: 'active' | 'completed' | 'archived';
  sessions: StudioPlanSession[];
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

export type StudioStudyPlanPreview = StudioStudyPlan & {
  warnings: string[];
  evidence: Array<{ atomId: string; atomName: string; status: MasteryEstimate['status']; reason: string }>;
};

export type StudioPdfBBox = [number, number, number, number];

export type StudioPdfStructureBlock =
  | { id: string; kind: 'paragraph'; text: string; bbox?: StudioPdfBBox; confidence: number | null; reviewRequired: boolean }
  | { id: string; kind: 'formula'; latex: string; plainText: string; bbox?: StudioPdfBBox; confidence: number | null; reviewRequired: boolean }
  | { id: string; kind: 'table'; headers: string[]; rows: string[][]; plainText: string; bbox?: StudioPdfBBox; confidence: number | null; reviewRequired: boolean };

export type StudioSourcePage = {
  page: number;
  text: string;
  textCharacters?:number;
  method?: 'pdf_text' | 'ocr' | 'hybrid' | 'unreadable';
  confidence?: number | null;
  blocks?: StudioPdfStructureBlock[];
  warnings?: string[];
};

export type StudioMaterialStructure = {
  modelReviewedPages?:number[];
  method: 'native_text' | 'ocr' | 'hybrid' | 'unreadable';
  ocrPageCount: number;
  tableCount: number;
  formulaCount: number;
  confidence: number | null;
  reviewRequired: boolean;
  modelAssisted: boolean;
  modelSource: 'xiaojiu_cli' | 'local_fallback' | null;
  modelId?: string | null;
  reviewedAt?: string;
  warnings: string[];
};

export type StudioSourceMaterial = {
  contentVersion?:string;
  id: string;
  studentId: string | null;
  subject: StudioSubject | null;
  ownerUserId?: string;
  kind?: 'pdf' | 'text';
  originalFormat?:'txt';
  filename: string;
  title: string;
  pageCount: number;
  pages: StudioSourcePage[];
  sha256: string;
  byteSize: number;
  hasPageImages?: boolean;
  status?: 'queued' | 'processing' | 'ready' | 'needs_review' | 'failed' | 'cancelled';
  structure?: StudioMaterialStructure;
  processingTaskId?: string;
  error?: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type StudioLearningCitation = {
  atomId: string;
  atomName: string;
  materialId?: string;
  page?: number;
  label: string;
};

export type StudioLearningSection = {
  id: string;
  kind: 'explain' | 'example' | 'misconception' | 'transfer';
  title: string;
  body: string;
  bullets: string[];
  citations: StudioLearningCitation[];
};

export type StudioFlashcard = {
  id: string;
  prompt: string;
  answer: string;
  hint: string;
  citations: StudioLearningCitation[];
};

export type StudioLearningPack = {
  id: string;
  studentId: string;
  subject: StudioSubject;
  title: string;
  atomIds: string[];
  sourceMaterialId: string | null;
  sections: StudioLearningSection[];
  flashcards: StudioFlashcard[];
  practiceSteps: Array<{ id: string; title: string; detail: string; atomId: string; minutes: number }>;
  reviewDays: Array<1 | 3 | 7 | 14>;
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
};

export type StudioLearningPackPreview = StudioLearningPack & { warnings: string[] };

export type StudioFeedItem = {
  id: string;
  kind: 'review' | 'plan_confirmation' | 'assessment' | 'activity' | 'scope' | 'evidence';
  priority: number;
  title: string;
  reason: string;
  href: string;
};

export type StudioWhiteboardExhibit = { kind: 'table'; headers: string[]; rows: string[][] } |
  { kind: 'formula'; latex: string; explanation: string };
export type StudioWhiteboardScene = {
  id: string;
  kind: 'title' | 'concept' | 'steps' | 'fraction_bars' | 'pdf_page' | 'check';
  title: string;
  narration: string;
  body?: string;
  bullets?: string[];
  visual?: TeachingVisual;
  exhibit?: StudioWhiteboardExhibit | null;
  targetAtomIds?: string[];
  source?: { materialId: string; page: number; label: string };
  durationMs: number;
};

export type StudioWhiteboard = {
  id: string;
  studentId: string;
  subject: StudioSubject;
  atomId: string | null;
  sourceMaterialId?: string | null;
  title: string;
  prompt: string;
  scenes: StudioWhiteboardScene[];
  durationMs: number;
  width: number;
  height: number;
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
};

export type StudioConnectorKind = 'lms_ics' | 'calendar_ics';
export type StudioConnector = {
  id: string;
  studentId: string;
  subject: StudioSubject;
  kind: StudioConnectorKind;
  label: string;
  sourceHost: string;
  status: 'connected' | 'syncing' | 'error' | 'revoked';
  lastSyncedAt: string | null;
  eventCount: number;
  lastError: string | null;
  version: number;
  createdAt: string;
};

export type StudioScheduleEvent = {
  id: string;
  connectorId: string;
  studentId: string;
  subject: StudioSubject;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  externalUid: string;
  source: 'lms' | 'calendar' | 'studyagent';
  createdAt: string;
  requestKey?: string;
  planId?: string;
  planSessionId?: string;
  status?: 'scheduled' | 'completed' | 'skipped';
  confirmed?: boolean;
  revision?: number;
};

export type StudioIntegrationOverview = {
  connectors: StudioConnector[];
  events: StudioScheduleEvent[];
};

export type StudioSpeechVoice = { id: string; label: string; description?: string; language?: string;
  classroomPreset?: 'warm' | 'calm' | 'bright' | 'gentle' | 'professional' | 'lively' };
export type StudioSpeechCapabilities = {
  available: boolean;
  provider: 'minimax' | 'openai' | null;
  voices: StudioSpeechVoice[];
  preview?: { version: string; text: string; model: string | null };
  defaultVoice: string | null;
};

export type StudioOverview = {
  generatedAt: string;
  day: string;
  narrationAvailable: boolean;
  speech: StudioSpeechCapabilities;
  children: Array<{ id: string; nickname: string; grade: number }>;
  selected: {
    id: string; nickname: string; grade: number; subject: StudioSubject;
    scope: LearningScope | null;
    atoms: Array<Pick<KnowledgeAtom, 'id' | 'name' | 'strand' | 'objective' | 'grade'> & { teaching?: AtomTeaching }>;
    estimates: MasteryEstimate[];
  } | null;
  courses: StudioCourse[];
  feed: StudioFeedItem[];
  activities: StudioActivity[];
  plans: StudioStudyPlan[];
  materials: StudioSourceMaterial[];
  studyPacks: StudioLearningPack[];
  whiteboards: StudioWhiteboard[];
  integrations: StudioIntegrationOverview;
};

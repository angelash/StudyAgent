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
};

export type StudioCoursePreview = StudioCourse & { canCreate: boolean; warnings: string[] };

export type StudioActivity = {
  id: string;
  studentId: string;
  subject: StudioSubject;
  kind: 'course_created' | 'lesson_started' | 'assessment' | 'plan' | 'review' | 'memory';
  title: string;
  detail: string;
  href: string;
  at: string;
  status: 'new' | 'opened' | 'complete';
  requestKey?: string;
};

export type StudioFeedItem = {
  id: string;
  kind: 'review' | 'plan_confirmation' | 'assessment' | 'activity' | 'scope' | 'evidence';
  priority: number;
  title: string;
  reason: string;
  href: string;
};

export type StudioWhiteboardScene = {
  id: string;
  kind: 'title' | 'concept' | 'steps' | 'fraction_bars' | 'check';
  title: string;
  narration: string;
  body?: string;
  bullets?: string[];
  visual?: TeachingVisual;
  durationMs: number;
};

export type StudioWhiteboard = {
  id: string;
  studentId: string;
  subject: StudioSubject;
  atomId: string | null;
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
};

export type StudioIntegrationOverview = {
  connectors: StudioConnector[];
  events: StudioScheduleEvent[];
};

export type StudioSpeechVoice = { id: string; label: string };
export type StudioSpeechCapabilities = {
  available: boolean;
  provider: 'minimax' | 'openai' | null;
  voices: StudioSpeechVoice[];
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
  whiteboards: StudioWhiteboard[];
  integrations: StudioIntegrationOverview;
};

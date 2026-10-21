import type { AtomTeaching, KnowledgeAtom, LearningScope, MasteryEstimate } from './diagnostics';

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

export type StudioOverview = {
  generatedAt: string;
  day: string;
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
};

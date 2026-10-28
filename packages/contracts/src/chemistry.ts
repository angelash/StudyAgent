import type { AtomTeaching } from './diagnostics';
import type { StudioCourse } from './studio';

export type ChemistryCheckpoint = {
  id: string; title: string; kind: 'baseline' | 'unit' | 'midterm' | 'final'; unitIds: string[];
  targetAtomIds: string[]; itemLimit: number; minutes: number;
  ready: boolean; reason: string | null; lastSessionId: string | null;
  status: 'not_started' | 'in_progress' | 'paused' | 'completed' | 'aborted';
};
export type ChemistryCatalog = {
  version: string; title: string; description: string; pointCount: number; questionCount: number;
  studentId: string | null; courseId: string | null; canEnroll: boolean;
  course: StudioCourse | null;
  children: Array<{ id: string; nickname: string; grade: number }>;
  units: Array<{ id: string; title: string; lessons: Array<{ id: string; title: string; objective: string;
    teaching: AtomTeaching | null; classroomHref: string | null; practiceHref: string | null }> }>;
  checkpoints: ChemistryCheckpoint[];
  references: Array<{ id: string; title: string; href: string; status: 'reference' | 'published' }>;
  notices: string[];
};

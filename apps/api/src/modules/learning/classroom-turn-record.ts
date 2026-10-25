import type { ClassroomTurnView } from '@study-agent/contracts';

export type ClassroomTurnRecord = Omit<ClassroomTurnView, 'status' | 'task'> & {
  ownerUserId: string; studentId: string | null; taskId: string; inputHash: string;
  status: 'queued' | 'running' | 'completed'; lessonHash: string;
  authorization: { role: string; bindingId?: string; guardianId?: string; accessId?: string; accessVersion?: number };
  context: string; history: Array<{ role: 'user' | 'assistant'; content: string }>;
};

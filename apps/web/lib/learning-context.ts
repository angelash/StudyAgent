import type { Subject } from '@study-agent/contracts';

export const learningContextKey = 'study_agent_learning_context_v1';
export type LearningContext = { studentId?: string; subject: Subject };
const subjects: string[] = ['math', 'chinese', 'english'];

export function readLearningContext(actorId: string, search: string): LearningContext {
  const params = new URLSearchParams(search);
  const explicitStudent = params.get('student') ?? params.get('studentId');
  const explicitSubject = params.get('subject');
  let saved: { actorId?: string; studentId?: string; subject?: string } | null = null;
  try { saved = JSON.parse(sessionStorage.getItem(learningContextKey) ?? 'null'); } catch { /* Browser storage is optional. */ }
  if (!saved || typeof saved !== 'object' || saved.actorId !== actorId || (saved.subject !== undefined && !subjects.includes(saved.subject)) || (saved.studentId !== undefined && (typeof saved.studentId !== 'string' || !saved.studentId || saved.studentId.length > 180))) saved = null;
  return { studentId: explicitStudent !== null ? explicitStudent : saved?.studentId,
    subject: (explicitSubject ?? saved?.subject ?? 'math') as Subject };
}

export function saveLearningContext(actorId: string, context: LearningContext) {
  if (!subjects.includes(context.subject)) return;
  try { sessionStorage.setItem(learningContextKey, JSON.stringify({ actorId, ...context })); } catch { /* URL remains the source of explicit selection. */ }
}

export function clearLearningContext() {
  try { sessionStorage.removeItem(learningContextKey); } catch { /* Disabled storage must not block logout. */ }
}

/** Adapt the existing route conventions; never accept an external destination. */
export function learningContextHref(route: '/learn' | '/studio' | '/parent/dashboard' | '/student/assessment' | '/student/today' | '/library', context?: LearningContext) {
  if (!context) return route;
  const params = new URLSearchParams({ subject: context.subject });
  if (context.studentId) params.set(route === '/learn' || route === '/studio' ? 'student' : 'studentId', context.studentId);
  return route + '?' + params;
}

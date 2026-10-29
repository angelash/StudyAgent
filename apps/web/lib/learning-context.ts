import type { Subject } from '@study-agent/contracts';

export const learningContextKey = 'study_agent_learning_context_v1';
export type LearningContext = { studentId?: string; subject: Subject; audience?: 'self' | 'student' };
const subjects: string[] = ['math', 'chinese', 'english', 'chemistry'];

export function learningContextIssue(search: string): string | null {
  const params = new URLSearchParams(search), student = params.get('student'), studentId = params.get('studentId');
  if (['student', 'studentId', 'subject', 'audience', 'courseScope'].some(key => new Set(params.getAll(key)).size > 1)) return '链接中有重复且不一致的学习对象或学科，请重新选择。';
  if (student !== null && studentId !== null && student !== studentId) return '链接中的学习档案不一致，请重新选择可用档案。';
  if ((params.get('courseScope') === 'adult' || params.get('audience') === 'independent') && (student || studentId)) return '本人独立学习不能同时选择孩子档案，请重新选择学习对象。';
  const subject = params.get('subject');
  if (subject !== null && !subjects.includes(subject)) return '链接中的学科不可用，请重新选择。';
  if ([student, studentId].some(value => value !== null && (value.length > 180 || value.trim() !== value))) return '链接中的学习档案格式无效，请重新选择。';
  return null;
}

export function readLearningContext(actorId: string, search: string): LearningContext {
  const params = new URLSearchParams(search);
  const explicitStudent = params.get('student') ?? params.get('studentId');
  const explicitSubject = params.get('subject');
  const explicitIndependent = params.get('courseScope') === 'adult' || params.get('audience') === 'independent';
  let saved: { actorId?: string; studentId?: string; subject?: string; audience?: string } | null = null;
  try { saved = JSON.parse(sessionStorage.getItem(learningContextKey) ?? 'null'); } catch { /* Browser storage is optional. */ }
  if (!saved || typeof saved !== 'object' || saved.actorId !== actorId || (saved.subject !== undefined && !subjects.includes(saved.subject)) || (saved.studentId !== undefined && (typeof saved.studentId !== 'string' || !saved.studentId || saved.studentId.length > 180))) saved = null;
  const independent = explicitIndependent || explicitStudent === null && saved?.audience === 'self';
  return { studentId: independent ? undefined : explicitStudent !== null ? explicitStudent : saved?.studentId,
    subject: (explicitSubject ?? saved?.subject ?? 'math') as Subject, ...(independent ? { audience: 'self' as const } : {}) };
}

export function saveLearningContext(actorId: string, context: LearningContext) {
  if (!subjects.includes(context.subject)) return;
  try { sessionStorage.setItem(learningContextKey, JSON.stringify({ actorId, ...context, ...(context.audience === 'self' ? { studentId: undefined } : {}) })); } catch { /* URL remains the source of explicit selection. */ }
}

export function clearLearningContext() {
  try { sessionStorage.removeItem(learningContextKey); } catch { /* Disabled storage must not block logout. */ }
}

/** Adapt the existing route conventions; never accept an external destination. */
export function learningContextHref(route: '/learn' | '/studio' | '/parent/dashboard' | '/student/assessment' | '/student/today' | '/library' | '/chemistry', context?: LearningContext) {
  if (!context) return route;
  const params = new URLSearchParams({ subject: context.subject });
  if (context.studentId) params.set(route === '/learn' || route === '/studio' ? 'student' : 'studentId', context.studentId);
  if (context.audience === 'self') { params.delete('subject'); params.delete('student'); params.delete('studentId'); params.set(route === '/learn' || route === '/studio' ? 'courseScope' : 'audience', route === '/learn' || route === '/studio' ? 'adult' : 'independent'); }
  return route + '?' + params;
}

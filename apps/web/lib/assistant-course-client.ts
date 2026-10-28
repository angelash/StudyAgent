import type { AssistantCourseDescriptor, AssistantCourseKind, AssistantTeachingSelection } from '@study-agent/contracts';
import { internalAssistantHref } from './assistant-course-navigation';

const id = (value: unknown, maximum = 180): value is string => typeof value === 'string' && value.length > 0 && value.length <= maximum;
export function readTeachingSelection(value: string | null): AssistantTeachingSelection | undefined {
  if (value === null) return undefined;
  if (value.length > 12000) throw Error('所选条目太多，请保留问题并缩小范围。');
  let v: any; try { v = JSON.parse(value); } catch { throw Error('教学范围格式无效，请从课程重新打开。'); }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('教学范围格式无效。');
  if (['complete', 'overview'].includes(v.mode) && Object.keys(v).length === 1) return { mode: v.mode };
  if (v.mode === 'detail' && Object.keys(v).sort().join(',') === 'mode,partKeys' && Array.isArray(v.partKeys) && v.partKeys.length > 0 && v.partKeys.length <= 2000 &&
    v.partKeys.every((key: unknown) => id(key, 100)) && new Set(v.partKeys).size === v.partKeys.length) return { mode: 'detail', partKeys: v.partKeys };
  throw Error('教学范围格式无效，请保留问题并重新选择。');
}

export function validCourseDescriptor(v: AssistantCourseDescriptor, kind: AssistantCourseKind, courseId: string, itemId: string) {
  if (!v || v.kind !== kind || v.courseId !== courseId || v.itemId !== itemId || !/^[a-f0-9]{64}$/.test(v.fingerprint) || v.referenceId !== courseId + '@' + v.fingerprint ||
    typeof v.current !== 'boolean' || !['published', 'authoring'].includes(v.accessMode) || !id(v.courseTitle, 6000) || !id(v.itemTitle, 6000) ||
    !(v.studentId === null || id(v.studentId)) || !(v.subject === null || ['math', 'chinese', 'english'].includes(v.subject)) || Boolean(v.studentId) !== Boolean(v.subject) ||
    kind === 'primary_unit' && !v.studentId || !Array.isArray(v.targets) || !v.targets.length || v.targets.length > 200 ||
    !v.targets.every(t => id(t.id) && id(t.title, 6000) && typeof t.objective === 'string') || !Array.isArray(v.parts) || v.parts.length > 2000 ||
    !v.parts.every(p => id(p.key, 100) && id(p.title, 6000) && v.targets.some(t => t.id === p.targetId)) ||
    new Set(v.parts.map(p => p.key)).size !== v.parts.length || new Set(v.targets.map(t => t.id)).size !== v.targets.length) return false;
  const c = v.coverage;
  if (!c || ![c.totalParts, c.includedParts, c.totalTargets, c.includedTargets].every(n => Number.isInteger(n) && n >= 0) || c.totalParts < 1 || c.totalTargets < 1 ||
    c.includedParts > c.totalParts || c.includedTargets > c.totalTargets || typeof c.complete !== 'boolean') return false;
  try { const selection = readTeachingSelection(JSON.stringify(v.selection));
    if (!selection || selection.mode === 'detail' && selection.partKeys.some(key => !v.parts.some(p => p.key === key))) return false;
  } catch { return false; }
  if (!v.current && !id(v.sessionId) || v.current && (typeof v.selectionFits !== 'boolean' || typeof v.canSend !== 'boolean')) return false;
  const href = internalAssistantHref(v.href); if (!href) return false;
  const url = new URL(href, 'https://study.invalid');
  return url.pathname === (kind === 'primary_unit' ? '/studio' : '/studio/source-courses') && url.searchParams.get('course') === courseId &&
    url.searchParams.get(kind === 'primary_unit' ? 'unit' : 'lesson') === itemId;
}

export function assessmentHref(value: unknown) {
  const href = internalAssistantHref(value); if (!href) return undefined;
  const url = new URL(href, 'https://study.invalid'); return url.pathname === '/student/assessment' ? href : undefined;
}

export const transferKey = (ownerId: string, token: string) => 'studyagent.assistant.course-transfer.v1.' + encodeURIComponent(ownerId) + '.' + token;
export function readCourseTransfer(ownerId: string, token: string | null, reference: string, itemId: string): string | null {
  if (!token || !/^[a-f0-9-]{36}$/.test(token)) return null;
  try { const raw = sessionStorage.getItem(transferKey(ownerId, token)); if (!raw || raw.length > 20000) return null; const v = JSON.parse(raw);
    return v?.ownerId === ownerId && v.reference === reference && v.itemId === itemId && typeof v.question === 'string' && v.question.length > 0 && v.question.length <= 3000 ? v.question : null;
  } catch { return null; }
}

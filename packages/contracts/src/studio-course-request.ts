import type { StudioSubject } from './studio';
import { z } from 'zod';

export const studioCourseDraftSchema = z.object({ studentId: z.string().min(1).max(180), subject: z.enum(['math', 'chinese', 'english', 'chemistry']),
  focusAtomIds: z.array(z.string().min(1).max(180)).min(1).max(30).optional(), title: z.string().trim().min(3).max(180).optional(),
  objective: z.string().trim().min(5).max(1000).optional(), minutesPerSession: z.number().int().min(5).max(60).optional() }).strict();
export const studioCourseCreateSchema = studioCourseDraftSchema.extend({ previewFingerprint: z.string().regex(/^[a-f0-9]{64}$/), requestKey: z.string().min(8).max(180) }).strict();
export type StudioCourseDraft = z.infer<typeof studioCourseDraftSchema>;
export type StudioCourseCreate = z.infer<typeof studioCourseCreateSchema>;

const subjects: Array<[StudioSubject, RegExp]> = [
  ['math', /数学|\bmath(?:s|ematics)?\b/i], ['chinese', /语文|\bchinese\b/i],
  ['english', /英语|英文|\benglish\b/i], ['chemistry', /化学|\bchemistry\b/i],
];
export const studioSubjectNames: Record<StudioSubject, string> = { math: '数学', chinese: '语文', english: '英语', chemistry: '化学' };

/** Only explicit, unambiguous course names constrain the selected scope. */
export function studioCourseRequest(title = ''): { subject?: StudioSubject; grade?: number } {
  const found = subjects.filter(([, pattern]) => pattern.test(title));
  const grades = new Set<number>();
  const chineseDigits = '一二三四五六七八九';
  for (const match of title.matchAll(/([一二三四五六七八九1-9])年级|初([一二三123])|([一二三四五六七八九])(?:上|下)(?=\s|学期|册|语文|数学|英语|化学|$)/g)) {
    const token = match[1] ?? match[3];
    grades.add(match[2] ? 6 + (Number(match[2]) || chineseDigits.indexOf(match[2]) + 1) : Number(token) || chineseDigits.indexOf(token) + 1);
  }
  return { ...(found.length === 1 ? { subject: found[0][0] } : {}), ...(grades.size === 1 ? { grade: [...grades][0] } : {}) };
}

export function studioCourseRequestIssue(title: string | undefined, subject: StudioSubject, grade: number): string | null {
  const requested = studioCourseRequest(title);
  if (requested.subject && requested.subject !== subject)
    return `课程名称要求${studioSubjectNames[requested.subject]}，当前选择的是${studioSubjectNames[subject]}范围，请切换学科后创建。`;
  if (requested.grade && requested.grade !== grade)
    return `课程名称要求${requested.grade}年级，当前学习范围是${grade}年级，请先切换课程范围。`;
  return null;
}

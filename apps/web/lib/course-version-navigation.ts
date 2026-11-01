export type CourseVersionLocation = { kind: 'current'; lessonId: string | null } | { kind: 'version'; revision: number; lessonId: string | null } | { kind: 'invalid'; message: string };
const invalid = (): CourseVersionLocation => ({ kind: 'invalid', message: '原课程版本链接无法核对，请明确选择课程版本。' });
export function readCourseVersionLocation(search: string): CourseVersionLocation {
  const query = new URLSearchParams(search), raw = query.get('courseRevision'), lessonId = query.get('courseLesson');
  if (query.getAll('courseRevision').length > 1 || query.getAll('courseLesson').length > 1 || lessonId !== null && (!lessonId || lessonId.length > 180)) return invalid();
  if (raw === null) return { kind: 'current', lessonId };
  if (!/^(0|[1-9]\d{0,3})$/.test(raw) || Number(raw) > 1000) return invalid();
  return { kind: 'version', revision: Number(raw), lessonId };
}
export function setCourseVersion(params: URLSearchParams, revision: number | null) {
  if (revision === null) params.delete('courseRevision');
  else { if (!Number.isInteger(revision) || revision < 0 || revision > 1000) throw Error('课程修订无法核对。'); params.set('courseRevision', String(revision)); }
  for (const key of ['courseLesson', 'practiceLesson', 'upgradeDraft', 'unit', 'panel']) params.delete(key);
  return params;
}

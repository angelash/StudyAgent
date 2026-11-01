import { describe, it, expect } from 'vitest';
import { teachingCourseFixture } from '../learning/textbook-teaching-course-fixture';
import { buildTextbookTeachingCourse } from '../learning/textbook-teaching-course';
import { teachingPracticeHref, readTeachingPracticeLocation, teachingPracticeCourseHref } from '../../../../web/lib/teaching-practice-navigation';
describe('original course and all-target assessment navigation', () => {
  it('links the exact adopted lesson version to the original assessment and retains the actual course return address', () => {
    const f = teachingCourseFixture(), { course } = buildTextbookTeachingCourse(f.value, f.command, 'actual-course-id', f.record.createdAt, f.authorization), practice = course.units[0].lessons[1],
      href = teachingPracticeHref(course, practice)!, value = readTeachingPracticeLocation(href.split('?')[1]);
    expect(href).toMatch(/^\/studio\/assessment\?/); expect(value.kind).toBe('teaching'); if (value.kind !== 'teaching') throw Error();
    expect(value.origin).toMatchObject({ courseId: course.id, lessonId: course.units[0].lessons[0].id, packageId: course.teachingSelection!.lessons[0].packageId, contentVersion: 1 });
    expect(new URL(href, 'https://study.invalid').searchParams.has('atom')).toBe(false);
    const back = new URL(teachingPracticeCourseHref(value.origin, course.studentId, course.subject), 'https://study.invalid'); expect(back.pathname).toBe('/studio'); expect(back.searchParams.get('course')).toBe(course.id);
  });
  it.each(['missing_version', 'duplicate_course', 'invalid_fingerprint', 'leading_zero_version'] as const)('refuses %s instead of falling back to the first knowledge point', kind => {
    const f = teachingCourseFixture(), { course } = buildTextbookTeachingCourse(f.value, f.command, 'actual-course-id', f.record.createdAt, f.authorization), url = new URL(teachingPracticeHref(course, course.units[0].lessons[1])!, 'https://study.invalid');
    if (kind === 'missing_version') url.searchParams.delete('teachingVersion');
    if (kind === 'duplicate_course') url.searchParams.append('teachingCourse', 'another-course');
    if (kind === 'invalid_fingerprint') url.searchParams.set('teachingFingerprint', 'invalid');
    if (kind === 'leading_zero_version') url.searchParams.set('teachingVersion', '01');
    expect(readTeachingPracticeLocation(url.search).kind).toBe('invalid');
  });
  it('preserves generic assessment navigation without inventing a teaching origin', () => { expect(readTeachingPracticeLocation('?studentId=child&subject=math&atom=a')).toEqual({ kind: 'none' }); });
});

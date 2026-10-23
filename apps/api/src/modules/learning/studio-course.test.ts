import { describe, expect, it } from 'vitest';
import type { KnowledgeAtom, LearningScope } from '@study-agent/contracts';
import { buildStudioCourse, studioLessonCount } from './studio-course';

const scope: LearningScope = { id: 'scope', studentId: 'student', subject: 'math', grade: 5, term: 'upper',
  textbookVolumeId: 'book', textbookVersion: '数学教材 v1', learnedAtomIds: ['fraction-add', 'fraction-subtract'],
  currentAtomId: 'fraction-add', minutesPerSession: 15, progressMode: 'knowledge', selectedLessonIds: [], version: 3,
  confirmedAt: '2026-10-21T00:00:00.000Z' };
const atoms: KnowledgeAtom[] = ['fraction-add', 'fraction-subtract'].map((id, index) => ({ id, subject: 'math',
  name: index ? '异分母分数减法' : '异分母分数加法', strand: '分数运算', grade: 5, term: 'upper',
  objective: '统一分数单位后完成运算并验算', successCriterion: '在新题中独立完成', prerequisiteIds: [],
  curriculumVersion: 'v1', status: 'published', version: 2 }));

describe('studio course generation', () => {
  it('builds a teach-practice-project-exam path from confirmed atoms', () => {
    const course = buildStudioCourse({ id: 'course', studentId: 'student', subject: 'math', scope, atoms,
      focusAtomIds: atoms.map(atom => atom.id), now: '2026-10-21T01:00:00.000Z' });
    expect(course.units).toHaveLength(1);
    expect(course.units[0].lessons.map(lesson => lesson.kind)).toEqual(['learn', 'practice', 'learn', 'practice', 'project', 'exam']);
    expect(studioLessonCount(course)).toBe(6);
    expect(course.materials.some(material => material.status === 'needs_review')).toBe(true);
    expect(course.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes its frozen fingerprint when the selected scope changes', () => {
    const one = buildStudioCourse({ id: 'course', studentId: 'student', subject: 'math', scope, atoms, focusAtomIds: ['fraction-add'] });
    const two = buildStudioCourse({ id: 'course', studentId: 'student', subject: 'math', scope, atoms, focusAtomIds: ['fraction-subtract'] });
    expect(one.fingerprint).not.toBe(two.fingerprint);
  });

  it('keeps every selected strand and schedules all activities within the chosen budget', () => {
    const spread = Array.from({ length: 7 }, (_, index) => ({ ...atoms[0], id: 'point-' + index, strand: '领域' + index }));
    const input = { id: 'course', studentId: 'student', subject: 'math' as const, scope, atoms: spread, focusAtomIds: spread.map(atom => atom.id) };
    const course = buildStudioCourse({ ...input, minutesPerSession: 5 });
    expect(course.units).toHaveLength(7);
    const lessons = course.units.flatMap(unit => unit.lessons);
    const pace = course.pace!;
    expect(new Set(pace.sessions.flatMap(session => session.activities.map(activity => activity.lessonId)))).toEqual(new Set(lessons.map(lesson => lesson.id)));
    expect(pace.sessions.every(session => session.minutes > 0 && session.minutes <= 5)).toBe(true);
    for (const lesson of lessons) {
      const parts = pace.sessions.flatMap(session => session.activities).filter(activity => activity.lessonId === lesson.id);
      expect(parts.map(activity => activity.part)).toEqual(Array.from({ length: parts[0].parts }, (_, index) => index + 1));
    }
    expect(pace.estimatedMinutes).toBe(pace.sessions.reduce((sum, session) => sum + session.minutes, 0));
    expect(buildStudioCourse({ ...input, minutesPerSession: 15 }).fingerprint).not.toBe(course.fingerprint);
    expect(buildStudioCourse(input).pace).toBeUndefined();
  });

  it.each([0, -5, 4, 61, Number.NaN, Infinity, 7.5])('rejects a non-executable time budget %s', budget => {
    expect(() => buildStudioCourse({ id: 'course', studentId: 'student', subject: 'math', scope, atoms,
      focusAtomIds: ['fraction-add'], minutesPerSession: budget })).toThrow('课程时间预算');
  });
});

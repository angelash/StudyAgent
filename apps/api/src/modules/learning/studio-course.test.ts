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
});

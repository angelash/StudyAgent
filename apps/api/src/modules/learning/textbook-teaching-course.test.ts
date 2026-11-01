import { describe, it, expect } from 'vitest';
import type { CurriculumBook, LearningScope, TextbookTeachingCourseDraft } from '@study-agent/contracts';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { teachingFixture } from '../diagnostics/textbook-teaching-fixture';
import { teachingAdoptionNativeFixture } from '../diagnostics/textbook-teaching-adoption-fixture';
import { assertTeachingAdoptionRecords } from '../diagnostics/textbook-teaching-adoption';
import { atomDefinitionFingerprint, questionContentFingerprint } from '../diagnostics/measurement-definition';
import { prepareTextbookTeachingPackage, makeTeachingSourceSnapshot, teachingSourceDescriptor, teachingHash } from '../diagnostics/textbook-teaching-package';
import { lessonSourceFingerprint } from '../diagnostics/textbook-source-candidates';
import { teachingPublicBase, teachingPublicFingerprint } from '../diagnostics/textbook-teaching-public';
import { buildTextbookTeachingCourse, type ResolvedTeachingCourse } from './textbook-teaching-course';

import { teachingCourseFixture as fixture } from "./textbook-teaching-course-fixture";

describe('complete textbook public course blueprint and all-target adoption', () => {
  it('retains more than30 confirmed targets and every exact textbook lesson in original chapter order', () => {
    const f = fixture(4), built = buildTextbookTeachingCourse(f.value, f.command, 'complete-course', f.record.createdAt, f.authorization), course = built.course;
    expect(course.focusAtomIds).toHaveLength(32); expect(course.units[0].lessons).toHaveLength(8); expect(built.adoptions).toHaveLength(4);
    expect(course.units[0].lessons.every(lesson => lesson.targetAtomIds?.length === 8)).toBe(true); expect(course.teachingSelection!.lessons).toEqual(f.command.teachingSelection.lessons);
    expect(assertTeachingAdoptionRecords({ students: [{ id: course.studentId }], studioCourses: [course], textbookTeachingAdoptions: built.adoptions })).toHaveLength(4);
    expect(course.pace!.sessions.every(session => session.minutes <= 15)).toBe(true);
  });
  it('uses one stable public blueprint across different actual course IDs, clocks and adopter proofs', () => {
    const f = fixture(), first = buildTextbookTeachingCourse(f.value, f.command, 'first-real-course', f.record.createdAt, f.authorization),
      second = buildTextbookTeachingCourse(f.value, f.command, 'second-real-course', new Date(Date.parse(f.record.createdAt) + 5000).toISOString(), { ...f.authorization, actorHash: 'b'.repeat(64), sessionHash: 'c'.repeat(64) });
    expect(first.course.fingerprint).toBe(second.course.fingerprint); expect(first.adoptions[0].fingerprint).not.toBe(second.adoptions[0].fingerprint);
    expect(second.course.units[0].lessons[0].textbookTeaching!.lesson.lectureId).toBe('second-real-course');
    expect(second.course.units[0].lessons[0].href).toContain('studioCourseId=second-real-course');
    expect(second.course.units[0].lessons[1].href).toContain('/studio?view=courses&course=second-real-course');
  });
  it('never includes private source reviews, quotations, answer digests or adopter/session proofs in public course or pace', () => {
    const f = fixture(), built = buildTextbookTeachingCourse(f.value, f.command, 'private-boundary-course', f.record.createdAt, f.authorization), text = JSON.stringify(built.course);
    for (const entry of f.value.entries) for (const material of entry.prepared.body.materials) expect(text).not.toContain(material.contentFingerprint);
    for (const secret of [f.value.entries[0].prepared.source.pages[0].text, f.value.entries[0].prepared.body.sourceReview.statement, f.authorization.actorHash, f.authorization.sessionHash, built.adoptions[0].fingerprint]) expect(text).not.toContain(secret);
  });
  it('does not let a changed hidden digest alter the public blueprint when the explicit public release is identical', () => {
    const f = fixture(), original = buildTextbookTeachingCourse(f.value, f.command, 'public-independent-digest', f.record.createdAt, f.authorization), altered = structuredClone(f.value);
    altered.entries[0].prepared.body.materials[0].contentFingerprint = 'd'.repeat(64);
    // This is a fingerprint-boundary test, not native acceptance of a changed
    // material. Native creation separately requires the genuine published body.
    const changed = buildTextbookTeachingCourse(altered, f.command, 'public-independent-digest', f.record.createdAt, f.authorization);
    expect(changed.course.fingerprint).toBe(original.course.fingerprint); expect(changed.adoptions[0].fingerprint).not.toBe(original.adoptions[0].fingerprint);
  });
  it('changes the public blueprint when an exact publication version, mapping or requested budget changes', () => {
    const f = fixture(), before = buildTextbookTeachingCourse(f.value, f.command, 'change-boundaries', f.record.createdAt, f.authorization).course.fingerprint;
    const changed = structuredClone(f.value); changed.entries[0].publicBase.contentVersion = 2;
    expect(buildTextbookTeachingCourse(changed, f.command, 'change-boundaries', f.record.createdAt, f.authorization).course.fingerprint).not.toBe(before);
    const mapping = structuredClone(f.value); mapping.entries[0].mapping.version++;
    expect(buildTextbookTeachingCourse(mapping, f.command, 'change-boundaries', f.record.createdAt, f.authorization).course.fingerprint).not.toBe(before);
    expect(buildTextbookTeachingCourse(f.value, { ...f.command, minutesPerSession: 10 }, 'change-boundaries', f.record.createdAt, f.authorization).course.fingerprint).not.toBe(before);
  });
  it.each(['book_version', 'unconfirmed_target', 'wrong_grade_title'] as const)('refuses a %s mismatch instead of narrowing or changing the student profile', kind => {
    const f = fixture(), original = teachingHash(f.value);
    if (kind === 'book_version') f.value.scope.textbookRevision = 'wrong-version';
    if (kind === 'unconfirmed_target') f.value.scope.learnedAtomIds = f.value.scope.learnedAtomIds.slice(1);
    const command = kind === 'wrong_grade_title' ? { ...f.command, title: '九年级数学上学期' } : f.command;
    const expected = teachingHash(f.value); expect(() => buildTextbookTeachingCourse(f.value, command, 'no-silent-narrowing', f.record.createdAt, f.authorization)).toThrow(); expect(teachingHash(f.value)).toBe(expected);
    if (kind === 'wrong_grade_title') expect(expected).toBe(original);
  });
});

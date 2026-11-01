import { describe, it, expect } from 'vitest';
import type { LearningScope, StudioCourse } from '@study-agent/contracts';
import { teachingFixture } from './textbook-teaching-fixture';
import { prepareTextbookTeachingPackage, teachingHash } from './textbook-teaching-package';
import { teachingPublicBase } from './textbook-teaching-public';
import { buildStudioCourse } from '../learning/studio-course';
import { assertTeachingAdoption, assertTeachingAdoptionRecords, assertAdoptedTeachingLesson, currentTeachingAdoptionMaterials,
  freezeTeachingAdoption, teachingAdoptionAuthorization } from './textbook-teaching-adoption';

import { teachingAdoptionFixture as fixture } from "./textbook-teaching-adoption-fixture";

describe('server-only adopted textbook qualifications and independent public snapshots', () => {
  it('keeps both targets and all exact private materials outside the public course, classroom and practice version', () => {
    const f = fixture(), serialized = JSON.stringify(f.course); expect(assertTeachingAdoptionRecords(f.state)).toHaveLength(1);
    expect(f.snapshot.targets).toHaveLength(2); expect(f.course.units[0].lessons.every(lesson => lesson.targetAtomIds?.length === 2)).toBe(true);
    expect(currentTeachingAdoptionMaterials(f.store, f.record)).toHaveLength(40);
    for (const material of f.record.qualification.materials) expect(serialized).not.toContain(material.contentFingerprint);
    for (const privateValue of [f.privateText, f.input.sourceReview.statement, f.input.content.citations[0].quote, f.record.fingerprint, 'qa-adopter-parent', 'qa-adopter-session']) expect(serialized).not.toContain(privateValue);
    expect(serialized).not.toContain('privateTeaching'); expect(f.snapshot.lesson.practiceVersion).toBe('textbook-teaching-public-v1:' + f.snapshot.fingerprint);
  });
  it('validates legitimate existing student snapshots after author data/account removal, without private manuscripts', () => {
    const f = fixture(), before = teachingHash(f.state); expect(Object.keys(f.state)).not.toContain('textbookTeachingPackages');
    f.state.privacyRequests.push({ kind: 'account_delete', subjectHash: teachingHash({ id: 'qa-original-author' }), erasedStudentHashes: [], retainedStudentHashes: [teachingHash({ id: f.course.studentId })] });
    expect(assertTeachingAdoptionRecords(f.state)).toHaveLength(1); expect(teachingHash(f.state.studioCourses)).toBe(teachingHash([f.course])); expect(before).not.toBe(teachingHash(f.state));
  });
  it.each(['course', 'lesson', 'student', 'public_fingerprint', 'one_target', 'missing_qualification', 'erased_student', 'extra_private_field'] as const)('refuses a broken %s relation instead of inventing a qualification', kind => {
    const f = fixture();
    if (kind === 'course') f.state.studioCourses = [];
    if (kind === 'lesson') f.course.units[0].lessons = f.course.units[0].lessons.filter(lesson => lesson.kind === 'practice');
    if (kind === 'student') f.state.students = [];
    if (kind === 'public_fingerprint') f.course.units[0].lessons[0].textbookTeaching!.fingerprint = 'e'.repeat(64);
    if (kind === 'one_target') f.course.units[0].lessons[0].targetAtomIds = [f.atoms[0].id];
    if (kind === 'missing_qualification') f.state.textbookTeachingAdoptions = [];
    if (kind === 'erased_student') f.state.privacyRequests.push({ erasedStudentHashes: [teachingHash({ id: f.course.studentId })] });
    if (kind === 'extra_private_field') (f.course.units[0].lessons[0].textbookTeaching as any).privateAnswerHash = f.record.qualification.materials[0].contentFingerprint;
    expect(() => assertTeachingAdoptionRecords(f.state)).toThrow();
  });
  it('rejects changed private bytes even with a recomputed record hash when the public reference no longer matches', () => {
    const f = fixture(), changed = structuredClone(f.record); changed.qualification.materials[0].questionVersion++;
    const { fingerprint: _fingerprint, ...body } = changed; changed.fingerprint = teachingHash(body);
    expect(() => assertAdoptedTeachingLesson(changed, f.course, f.course.units[0].lessons[0])).toThrow(/integrity/);
  });
  it.each(['answer', 'definition', 'family', 'family_rules', 'source_review', 'input_mode'] as const)('refuses changed %s eligibility for a new practice without rewriting old course or historical qualification', kind => {
    const f = fixture(), before = teachingHash({ course: f.course, record: f.record }), material = f.record.qualification.materials[0];
    if (kind === 'answer') f.store.find('questions', { id: material.questionId })!.answer = 'changed-private-answer';
    if (kind === 'definition') f.store.find('knowledgeAtoms', { id: material.atomId })!.objective += '版本外变化';
    if (kind === 'family') f.store.find('measurementItems', { id: material.measurementId })!.family += ':merged';
    if (kind === 'family_rules') { const changed = structuredClone(f.record), { fingerprint: _fingerprint, ...body } = changed; body.qualification.materials[0].familyIdentityVersion += ':new'; Object.assign(f.record, body, { fingerprint: teachingHash(body) }); }
    if (kind === 'source_review') f.store.find('questionSources', { questionId: material.questionId })!.reviewStatus = 'rejected';
    if (kind === 'input_mode') f.store.find('questionAnswerSchemas', { questionId: material.questionId })!.mode = 'not-supported' as any;
    const current = teachingHash({ course: f.course, record: f.record }); expect(() => currentTeachingAdoptionMaterials(f.store, f.record)).toThrow(/adopted_material_changed/);
    expect(teachingHash({ course: f.course, record: f.record })).toBe(current); if (kind !== 'family_rules') expect(current).toBe(before);
  });
  it('preserves original mappings and rejects a manually substituted course target even if it is a published curriculum atom', () => {
    const f = fixture(), altered = structuredClone(f.record), { fingerprint: _fingerprint, ...body } = altered; body.mapping.atomIds = [f.atoms[0].id]; altered.mapping = body.mapping; altered.fingerprint = teachingHash(body);
    expect(() => assertAdoptedTeachingLesson(altered, f.course, f.course.units[0].lessons[0])).toThrow(); expect(assertTeachingAdoption(f.record)).toEqual(f.record);
  });
});

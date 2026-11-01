import { describe, expect, it } from 'vitest';
import { assertTeachingAdoptionWrites } from './textbook-teaching-adoption-native';
import { teachingAdoptionNativeFixture } from './textbook-teaching-adoption-fixture';
import { assertTeachingAdoptionRecords } from './textbook-teaching-adoption';
import { teachingHash } from './textbook-teaching-package';
import { portableRecords, studentRecords } from '../privacy/privacy-records';
import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';

describe('native textbook adoption creation and deletion boundaries', () => {
  it('accepts a current original publication, confirmed exact scope and parent session in the same new-course transaction', () => {
    const f = teachingAdoptionNativeFixture(), before = teachingHash(f.native);
    expect(assertTeachingAdoptionRecords(f.native.state)).toHaveLength(1);
    expect(() => assertTeachingAdoptionWrites(f.native.before, f.native.state, f.native.changes, f.native.now)).not.toThrow(); expect(teachingHash(f.native)).toBe(before);
  });
  it.each(['binding', 'actor_role', 'actor_version', 'session', 'scope_version', 'scope_book', 'scope_lesson', 'mapping', 'answer', 'withdrawn', 'existing_course', 'old_activity'] as const)('refuses changed %s during original course creation without touching either input snapshot', kind => {
    const f = teachingAdoptionNativeFixture(), { state, before, changes, now } = f.native;
    if (kind === 'binding') state.bindings = [];
    if (kind === 'actor_role') state.users.find(user => user.id === 'qa-adopter-parent').role = 'teacher';
    if (kind === 'actor_version') state.users.find(user => user.id === 'qa-adopter-parent').version++;
    if (kind === 'session') state.sessions.find(session => session.id === 'qa-adopter-session').revokedAt = f.record.createdAt;
    if (kind === 'scope_version') state.learningScopes[0].version++;
    if (kind === 'scope_book') state.learningScopes[0].textbookRevision = 'another-edition';
    if (kind === 'scope_lesson') state.learningScopes[0].selectedLessonIds = [];
    if (kind === 'mapping') state.textbookAtomMappings[0].status = 'rejected';
    if (kind === 'answer') state.questions[0].answer = 'changed-without-publishing';
    if (kind === 'withdrawn') { state.textbookTeachingPackages[0].status = 'withdrawn'; state.textbookTeachingPackages[0].published = null; }
    if (kind === 'existing_course') before.studioCourses = structuredClone(state.studioCourses);
    if (kind === 'old_activity') before.studioActivities = structuredClone(state.studioActivities);
    const original = teachingHash(f.native); expect(() => assertTeachingAdoptionWrites(before, state, changes, now)).toThrow(/integrity/); expect(teachingHash(f.native)).toBe(original);
  });
  it('does not expose server material qualifications in family portable data but includes them for actual student erasure', () => {
    const f = teachingAdoptionNativeFixture(), selected = studentRecords(f.native.state as unknown as InMemoryStoreService, f.course.studentId), portable = portableRecords(selected, 'qa-adopter-parent');
    expect(selected.textbookTeachingAdoptions).toHaveLength(1); expect(portable.textbookTeachingAdoptions).toBeUndefined();
    for (const ref of f.record.qualification.materials) expect(JSON.stringify(portable)).not.toContain(ref.contentFingerprint);
    expect(portable.studioCourses).toHaveLength(1);
  });
  it('retains adopted public teaching and qualification after an unrelated or original-author account closes', () => {
    const f = teachingAdoptionNativeFixture(), current = structuredClone(f.native.state);
    current.users = current.users.filter(user => user.id !== 'qa-original-author'); current.sessions = current.sessions.filter(session => session.userId !== 'qa-original-author');
    for (const name of ['textbookTeachingPackages', 'textbookTeachingVersions', 'textbookTeachingSources', 'textbookTeachingCommands']) current[name] = [];
    current.privacyRequests = [{ kind: 'account_delete', subjectHash: teachingHash({ id: 'qa-original-author' }), erasedStudentHashes: [], retainedStudentHashes: [teachingHash({ id: f.course.studentId })], completedAt: f.record.createdAt }];
    expect(assertTeachingAdoptionRecords(current)).toHaveLength(1);
    expect(() => assertTeachingAdoptionWrites(f.native.state, current, [], f.native.now)).not.toThrow();
  });
  it('requires actual student/course removal and a deletion receipt before removing a qualification', () => {
    const f = teachingAdoptionNativeFixture(), current = structuredClone(f.native.state), changes = [{ collection: 'textbookTeachingAdoptions', id: f.record.id, body: null }];
    current.textbookTeachingAdoptions = []; expect(() => assertTeachingAdoptionWrites(f.native.state, current, changes, f.native.now)).toThrow();
    current.students = []; current.studioCourses = []; expect(() => assertTeachingAdoptionWrites(f.native.state, current, changes, f.native.now)).toThrow();
    current.privacyRequests = [{ kind: 'student_delete', erasedStudentHashes: [teachingHash({ id: f.course.studentId })], completedAt: f.record.createdAt }];
    expect(() => assertTeachingAdoptionWrites(f.native.state, current, changes, f.native.now)).not.toThrow(); expect(assertTeachingAdoptionRecords(current)).toEqual([]);
  });
  it('refuses a changed immutable qualification and permits an unchanged row during unrelated position compaction', () => {
    const f = teachingAdoptionNativeFixture(), same = [{ collection: 'textbookTeachingAdoptions', id: f.record.id, body: JSON.stringify(f.record) }];
    expect(() => assertTeachingAdoptionWrites(f.native.state, f.native.state, same, f.native.now)).not.toThrow();
    const changed = structuredClone(f.record), { fingerprint: _fingerprint, ...body } = changed; body.scopeVersion++;
    const changes = [{ ...same[0], body: JSON.stringify({ ...body, fingerprint: teachingHash(body) }) }]; expect(() => assertTeachingAdoptionWrites(f.native.state, f.native.state, changes, f.native.now)).toThrow();
  });
});

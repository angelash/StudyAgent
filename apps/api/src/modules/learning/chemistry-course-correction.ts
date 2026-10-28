import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { studioCourseRequest } from '@study-agent/contracts';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { CHEMISTRY_VERSION, chemistryAtomId, chemistryUnits } from '../diagnostics/chemistry-curriculum';
import { buildChemistryCourse, chemistryCourseHref, chemistryScope, isChemistrySemesterCourse } from './chemistry-course';

/** Local maintenance only. The caller supplies an exact course and reviewed fingerprint. */
export async function correctChemistryCourse(store: InMemoryStoreService, courseId: string, expectedFingerprint: string, apply = false) {
  return store.transaction(() => {
    const previous = store.find('studioCourses', { id: courseId });
    if (!previous) throw new NotFoundException('待修正课程不存在');
    const requestKey = `chemistry-content-correction:${courseId}:${expectedFingerprint}`;
    const receipt = store.find('studioActivities', { requestKey });
    if (receipt && isChemistrySemesterCourse(previous)) return { applied: false, alreadyCorrected: true, courseId, fingerprint: previous.fingerprint };
    if (previous.fingerprint !== expectedFingerprint) throw new ConflictException('课程已变化，停止修正并重新审查');
    if (studioCourseRequest(previous.title).subject !== 'chemistry' || isChemistrySemesterCourse(previous))
      throw new BadRequestException('仅修正明确要求化学但内容与学科错误的课程');
    const atoms = chemistryUnits.flatMap(unit => unit.codes.map(code => {
      const atom = store.find('knowledgeAtoms', { id: chemistryAtomId(code), subject: 'chemistry', status: 'published' });
      if (!atom || atom.curriculumVersion !== CHEMISTRY_VERSION || atom.teaching?.reviewStatus !== 'approved') throw new ConflictException('化学教学内容未准备完成');
      return atom;
    }));
    const next = buildChemistryCourse(previous.studentId, atoms, { id: previous.id, title: previous.title, createdAt: previous.createdAt });
    const result = { applied: apply, alreadyCorrected: false, courseId, studentId: previous.studentId,
      previousSubject: previous.subject, previousGrade: previous.grade, subject: next.subject, grade: next.grade,
      previousFingerprint: previous.fingerprint, fingerprint: next.fingerprint, units: next.units.length, lessons: atoms.length };
    if (!apply) return result;
    const oldContent = structuredClone(previous), now = new Date().toISOString();
    Object.assign(previous, next);
    // Course selection is a study plan, not a learner-grade edit or a mastery observation.
    if (!store.find('learningScopes', { studentId: previous.studentId, subject: 'chemistry' }))
      store.append('learningScopes', chemistryScope(previous.studentId, atoms.map(atom => atom.id), store.nextId('scope'), 25));
    store.append('studioActivities', { id: store.nextId('studio_activity'), studentId: previous.studentId, subject: 'chemistry',
      kind: 'course_created', title: `修正课程内容「${previous.title}」`, detail: '替换误用的数学范围；七个化学单元、28节讲解，原始历史记录保留。',
      href: chemistryCourseHref(previous.studentId, previous.id), at: now, status: 'opened', referenceId: previous.id, requestKey });
    store.events.push({ eventId: store.nextId('audit'), eventName: 'studio.course_content_corrected', eventVersion: 1, occurredAt: now,
      payload: { channel: 'local-maintenance', reason: 'Explicit chemistry course was built from the selected mathematics scope',
        courseId, previousCourse: oldContent, replacementFingerprint: next.fingerprint, curriculumVersion: CHEMISTRY_VERSION } });
    return result;
  });
}

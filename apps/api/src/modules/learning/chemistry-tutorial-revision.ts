import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { chemistryCourseFingerprint, isChemistrySemesterCourse } from './chemistry-course';
import { withChemistryTutorial } from './chemistry-tutorial';
import { CHEMISTRY_TUTORIAL_VERSION } from './chemistry-tutorial-content';

/** Exact local maintenance command, independent of assessment and learner versions. */
export async function reviseChemistryTutorial(store: InMemoryStoreService, courseId: string, expectedFingerprint: string, apply = false) {
  return store.transaction(() => {
    const previous = store.find('studioCourses', { id: courseId });
    if (!previous) throw new NotFoundException('待更新课程不存在');
    const requestKey = `chemistry-tutorial-revision:${courseId}:${expectedFingerprint}:${CHEMISTRY_TUTORIAL_VERSION}`;
    const receipt = store.events.flatMap(event => event.eventName === 'studio.chemistry_tutorial_revised' && event.payload && typeof event.payload === 'object'
      ? [event.payload as Record<string, unknown>] : []).find(payload => payload.requestKey === requestKey);
    if (receipt && previous.fingerprint === receipt.replacementFingerprint) return { applied: false, alreadyRevised: true, courseId, fingerprint: previous.fingerprint };
    if (previous.fingerprint !== expectedFingerprint) throw new ConflictException('课程已变化，停止更新并重新审查');
    if (!isChemistrySemesterCourse(previous)) throw new BadRequestException('仅更新完整九上化学课程');
    if (previous.teachingVersion === CHEMISTRY_TUTORIAL_VERSION) return { applied: false, alreadyRevised: true, courseId, fingerprint: previous.fingerprint };
    const next = withChemistryTutorial(structuredClone(previous));
    next.updatedAt = new Date().toISOString(); next.fingerprint = chemistryCourseFingerprint(next);
    const result = { applied: apply, alreadyRevised: false, courseId, previousFingerprint: previous.fingerprint,
      fingerprint: next.fingerprint, teachingVersion: CHEMISTRY_TUTORIAL_VERSION, lessons: 28, figures: 28, experimentKinds: 10, classroomChecks: 28 };
    if (!apply) return result;
    const oldContent = structuredClone(previous);
    Object.assign(previous, next);
    store.events.push({ eventId: store.nextId('audit'), eventName: 'studio.chemistry_tutorial_revised', eventVersion: 1, occurredAt: next.updatedAt,
      payload: { requestKey, channel: 'local-maintenance', courseId, previousCourse: oldContent,
        replacementFingerprint: next.fingerprint, teachingVersion: CHEMISTRY_TUTORIAL_VERSION } });
    return result;
  });
}

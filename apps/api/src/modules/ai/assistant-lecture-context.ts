import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ClassroomCourse } from '@study-agent/contracts';
import { z } from 'zod';
import { classroomCourse } from '../learning/classroom-curriculum';
import { assistantDigest } from './assistant-turn-record';

const text = z.string().min(1).max(6000);
const identifier = z.string().min(1).max(180);
const snapshotSchema = z.object({
  protocol: z.literal('classroom-lecture-v1'), courseId: identifier, courseVersion: identifier, courseTitle: text,
  unitId: identifier, unitTitle: text, unitPosition: z.number().int().min(1).max(100),
  lectureId: identifier, lectureTitle: text, description: text, lecturePosition: z.number().int().min(1).max(100),
  lessons: z.array(z.object({ id: identifier, title: text, objective: text }).strict()).min(1).max(60),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type AssistantLectureSnapshot = z.infer<typeof snapshotSchema>;

export function freezeAssistantLecture(courseId: string, lectureId: string, course: ClassroomCourse = classroomCourse()): AssistantLectureSnapshot {
  if (course.id !== courseId) throw new NotFoundException('讲座课程不存在');
  const units = course.units.flatMap((unit, unitIndex) => unit.lectures.map((lecture, lectureIndex) => ({ unit, unitIndex, lecture, lectureIndex })));
  const found = units.filter(item => item.lecture.id === lectureId);
  if (found.length !== 1) throw new NotFoundException('讲座不存在或标识不唯一');
  const { unit, unitIndex, lecture, lectureIndex } = found[0];
  // Deliberate allowlist: never copy complete lessons, exercises or private scoring keys.
  const safe = { protocol: 'classroom-lecture-v1' as const, courseId: course.id, courseVersion: course.version, courseTitle: course.title,
    unitId: unit.id, unitTitle: unit.title, unitPosition: unitIndex + 1,
    lectureId: lecture.id, lectureTitle: lecture.title, description: lecture.description, lecturePosition: lectureIndex + 1,
    lessons: lecture.lessons.map(lesson => ({ id: lesson.id, title: lesson.title, objective: lesson.objective })) };
  const parsed = snapshotSchema.safeParse({ ...safe, fingerprint: assistantDigest(safe) });
  if (!parsed.success) throw new ConflictException('当前讲座原件不完整，请先核对课程内容');
  return parsed.data;
}

export const assistantLectureReference = (snapshot: AssistantLectureSnapshot) => snapshot.courseId + '@' + snapshot.fingerprint;

export function readAssistantLecture(value: unknown, referenceId: string, lectureId: string, requireCurrent: boolean,
  course: ClassroomCourse = classroomCourse()): { snapshot: AssistantLectureSnapshot; current: boolean } {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) throw new ConflictException('原讲座快照缺失或损坏；请保留原对话并打开当前讲座');
  const { fingerprint, ...safe } = parsed.data;
  if (assistantDigest(safe) !== fingerprint || assistantLectureReference(parsed.data) !== referenceId || parsed.data.lectureId !== lectureId)
    throw new ConflictException('原讲座标识与快照不一致；请保留原对话并重新核对');
  let current = false;
  try { current = assistantLectureReference(freezeAssistantLecture(parsed.data.courseId, lectureId, course)) === referenceId; }
  catch (error) { if (!(error instanceof NotFoundException)) throw error; }
  if (requireCurrent && !current) throw new ConflictException('讲座内容已更新；原对话保留，请打开当前版本后重新提问');
  return { snapshot: parsed.data, current };
}

export function assistantLectureSummary(snapshot: AssistantLectureSnapshot, current: boolean) {
  const query = new URLSearchParams({ unit: String(snapshot.unitPosition - 1), panel: 'units', lecture: snapshot.lectureId });
  return { courseId: snapshot.courseId, courseVersion: snapshot.courseVersion, courseTitle: snapshot.courseTitle,
    unitId: snapshot.unitId, unitTitle: snapshot.unitTitle, unitPosition: snapshot.unitPosition,
    lectureId: snapshot.lectureId, lectureTitle: snapshot.lectureTitle, lecturePosition: snapshot.lecturePosition,
    fingerprint: snapshot.fingerprint, referenceId: assistantLectureReference(snapshot), current,
    href: '/studio/classroom?' + query.toString() };
}

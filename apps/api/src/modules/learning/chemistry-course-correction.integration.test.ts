import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

describe.sequential('correct a chemistry-titled mathematics course using its original identity', () => {
  let app: any, store: any, parent: any, outsider: any, studentId: string, course: any, oldClassroom: any, oldScope: any;
  const source = (file: string) => require(`../../../dist/apps/api/src/${file}.js`);
  const wrongContent = /两位数乘两位数|余数与除数|长方形面积|异分母|通分|foundation:math:|core:math:/;
  beforeAll(async () => {
    app = await NestFactory.create(source('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(source('infrastructure/in-memory-store.service').InMemoryStoreService); store.reset();
    app.get(source('modules/diagnostics/foundation-seed.service').FoundationSeedService).seedAuthoredCurriculum();
    parent = await call('post', '/auth/register', { principal: 'correction-parent', credential: 'Correction-password-2026' }, null);
    outsider = await call('post', '/auth/register', { principal: 'correction-outsider', credential: 'Correction-password-2026' }, null);
    studentId = (await call('post', '/students', { nickname: '修正验收', grade: 4, preferredSessionMinutes: 15,
      defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } })).profile.id;
    oldScope = await call('put', `/students/${studentId}/learning-scope`, { subject: 'math', grade: 4, term: 'upper', textbookVolumeId: null,
      textbookVersion: '四年级数学范围', learnedAtomIds: ['foundation:math:multiplytwo', 'foundation:math:remainder', 'foundation:math:rectanglearea'],
      currentAtomId: 'foundation:math:multiplytwo', minutesPerSession: 15, progressMode: 'knowledge', selectedLessonIds: [] });
    const preview = await call('post', '/learning/studio/courses/preview', { studentId, subject: 'math', title: '四年级数学' });
    course = await call('post', '/learning/studio/courses', { studentId, subject: 'math', title: preview.title, objective: preview.objective,
      previewFingerprint: preview.fingerprint, requestKey: 'correction-fixture-create' });
    oldClassroom = await call('post', '/learning/classroom/sessions', { studioCourseId: course.id, lessonId: course.units[0].lessons[0].id });
    // Reproduce the exact legacy defect that is now blocked by the builder.
    const record = store.find('studioCourses', { id: course.id }); record.title = '广东初三化学上学期'; course.title = record.title;
  }, 120_000);
  afterAll(async () => { await app?.close(); });
  async function call(method: 'get' | 'post' | 'put', path: string, body?: unknown, actor: any = parent, expected = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path); if (actor?.token) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) query = query.send(body as object);
    const response = await query; expect(response.status, `${method} ${path}: ${JSON.stringify(response.body.error)}`).toBe(expected); return response.body.data;
  }
  it('rejects explicit chemistry or ninth-grade requests against the selected fourth-grade math scope', async () => {
    const before = store.inspect('studioCourses').length;
    for (const title of ['广东初三化学上学期', '广州人教版九上化学', '九年级数学', '9年级数学'])
      await call('post', '/learning/studio/courses/preview', { studentId, subject: 'math', title }, parent, 400);
    await call('post', '/learning/studio/courses', { studentId, subject: 'math', title: '广东初三化学上学期', objective: course.objective,
      previewFingerprint: course.fingerprint, requestKey: 'mismatch-must-not-save' }, parent, 400);
    expect(store.inspect('studioCourses')).toHaveLength(before);
  });
  it('previews, fences, applies and replays the exact correction while preserving grade and old evidence', async () => {
    const correct = source('modules/learning/chemistry-course-correction').correctChemistryCourse;
    const beforeCourse = JSON.stringify(store.find('studioCourses', { id: course.id }));
    const beforeSession = JSON.stringify(store.find('classroomSessions', { id: oldClassroom.id }));
    const beforeScopes = JSON.stringify(store.select('learningScopes', { studentId, subject: 'math' }));
    const preview = await correct(store, course.id, course.fingerprint);
    expect(preview).toMatchObject({ applied: false, previousSubject: 'math', subject: 'chemistry', grade: 9, units: 7, lessons: 28 });
    expect(JSON.stringify(store.find('studioCourses', { id: course.id }))).toBe(beforeCourse);
    await expect(correct(store, course.id, '0'.repeat(64), true)).rejects.toThrow('课程已变化');
    expect((await correct(store, course.id, course.fingerprint, true)).applied).toBe(true);
    expect((await correct(store, course.id, course.fingerprint, true)).alreadyCorrected).toBe(true);
    const saved = store.find('studioCourses', { id: course.id });
    expect(saved).toMatchObject({ id: course.id, title: course.title, studentId, grade: 9, subject: 'chemistry', createdAt: course.createdAt });
    expect(JSON.stringify(saved)).not.toMatch(wrongContent);
    expect(store.find('students', { id: studentId }).grade).toBe(4);
    expect(JSON.stringify(store.select('learningScopes', { studentId, subject: 'math' }))).toBe(beforeScopes);
    expect(JSON.stringify(store.find('classroomSessions', { id: oldClassroom.id }))).toBe(beforeSession);
    expect(store.inspect('diagnosticResponses')).toHaveLength(0);
    expect(store.inspect('events').filter((event: any) => event.eventName === 'studio.course_content_corrected')).toHaveLength(1);
  });
  it('resolves an old math-context URL to the original corrected course and enforces access', async () => {
    const path = '/learning/studio/overview?' + new URLSearchParams({ courseId: course.id, subject: 'math' });
    const overview = await call('get', path);
    expect(overview.selected).toMatchObject({ id: studentId, subject: 'chemistry', grade: 4 });
    expect(overview.selected.scope).toMatchObject({ grade: 9, subject: 'chemistry' });
    expect(overview.courses.map((item: any) => item.id)).toEqual([course.id]);
    expect(overview.courses[0].learningProgress.viewedLessonIds.filter((id: string) => id.includes('chemistry'))).toHaveLength(0);
    await call('get', path, undefined, outsider, 403);
    const catalog = await call('get', '/chemistry/catalog?studentId=' + studentId);
    expect(catalog.courseId).toBe(course.id); expect(catalog.course.units).toHaveLength(7);
  });
  it('opens all 28 actual classroom bodies with their chemical explanation and worked example', async () => {
    const catalog = await call('get', '/chemistry/catalog?studentId=' + studentId);
    const lessons = catalog.units.flatMap((unit: any) => unit.lessons);
    expect(lessons).toHaveLength(28);
    for (const lesson of lessons) {
      const classroom = await call('post', '/learning/classroom/sessions', { studioCourseId: course.id, lessonId: 'learn:' + lesson.id });
      const body = JSON.stringify(classroom.lesson);
      expect(classroom.studentId).toBe(studentId); expect(classroom.studioCourseId).toBe(course.id);
      expect(body).toContain(lesson.teaching.explanation); expect(body).toContain(lesson.teaching.example.prompt);
      expect(body).toContain(lesson.teaching.example.conclusion); expect(body).not.toMatch(wrongContent);
      expect(classroom.lesson.steps.find((step: any) => step.phase === 'concept').blocks.some((block: any) => block.kind === 'text' && block.text === lesson.teaching.explanation)).toBe(true);
      expect(classroom.lesson.steps.find((step: any) => step.phase === 'example').blocks.some((block: any) => block.kind === 'text' && block.text.includes(lesson.teaching.example.conclusion))).toBe(true);
      expect(new URL(classroom.lesson.verificationHref, 'http://local').searchParams.get('subject')).toBe('chemistry');
    }
  }, 120_000);
  it('starts a real chemistry check for the corrected course without changing the learner profile', async () => {
    const start = await call('post', '/chemistry/checkpoints/start', { studentId, version: 'guangzhou-pep-chemistry-9-upper-v1',
      checkpointId: 'u1:baseline', requestKey: 'corrected-course-baseline' });
    const session = await call('get', '/diagnostics/sessions/' + start.sessionId);
    expect(session).toMatchObject({ subject: 'chemistry' }); expect(session.scopeSnapshot.grade).toBe(9);
    for (const item of session.items) expect(store.find('questions', { id: item.questionId }).subject).toBe('chemistry');
    expect(JSON.stringify(session)).not.toMatch(wrongContent);
    expect(store.find('students', { id: studentId }).grade).toBe(4);
  });
});

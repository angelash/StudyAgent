import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

describe.sequential('versioned chemical teaching resources and preserved learning evidence', () => {
  const source = (file: string) => require(`../../../dist/apps/api/src/${file}.js`);
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  let app: any, store: any, parent: any, outsider: any, course: any, old: any, studentId: string, preserved: Record<string, string>;
  const protectedCollections = ['students', 'learningScopes', 'classroomSessions', 'diagnosticResponses', 'diagnosticSessions', 'questions', 'knowledgeAtoms', 'measurementItems'];
  beforeAll(async () => {
    app = await NestFactory.create(source('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(source('infrastructure/in-memory-store.service').InMemoryStoreService); store.reset();
    app.get(source('modules/diagnostics/foundation-seed.service').FoundationSeedService).seedAuthoredCurriculum();
    parent = await call('post', '/auth/register', { principal: 'tutorial-parent', credential: 'Tutorial-fixture-only-2026' }, null);
    outsider = await call('post', '/auth/register', { principal: 'tutorial-outsider', credential: 'Tutorial-fixture-only-2026' }, null);
    studentId = (await call('post', '/students', { nickname: '图示教程验收', grade: 9, preferredSessionMinutes: 25,
      defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } })).profile.id;
    const version = (await call('get', '/chemistry/catalog?studentId=' + studentId)).version;
    const enrolled = await call('post', '/chemistry/enroll', { studentId, version, requestKey: 'tutorial-enrollment-fixture' });
    course = store.find('studioCourses', { id: enrolled.courseId });
    // A persisted v1 course and frozen classroom, as on the real upgrade path.
    delete course.teachingVersion; course.description = '旧版化学课程';
    course.fingerprint = source('modules/learning/chemistry-course').chemistryCourseFingerprint(course);
    old = await call('post', '/learning/classroom/sessions', { studioCourseId: course.id, lessonId: course.units[0].lessons[0].id });
    preserved = Object.fromEntries(protectedCollections.map(key => [key, hash(store.inspect(key))]));
  }, 120_000);
  afterAll(async () => { await app?.close(); });
  async function call(method: 'get' | 'post', path: string, body?: unknown, actor: any = parent, expected = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path);
    if (actor?.token) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) query = query.send(body as object);
    const response = await query; expect(response.status, `${method} ${path}: ${JSON.stringify(response.body.error)}`).toBe(expected); return response.body.data;
  }
  it('previews and fences an exact revision, then preserves all old evidence and measurement content', async () => {
    const revise = source('modules/learning/chemistry-tutorial-revision').reviseChemistryTutorial;
    const before = JSON.stringify(course), expected = course.fingerprint;
    expect(await revise(store, course.id, expected)).toMatchObject({ applied: false, figures: 28, experimentKinds: 10, classroomChecks: 28 });
    expect(JSON.stringify(course)).toBe(before);
    await expect(revise(store, course.id, '0'.repeat(64), true)).rejects.toThrow('课程已变化');
    expect((await revise(store, course.id, expected, true)).applied).toBe(true);
    expect((await revise(store, course.id, expected, true)).alreadyRevised).toBe(true);
    course = store.find('studioCourses', { id: course.id });
    expect(course.description).toContain('模型演示'); expect(course.teachingVersion).toContain('v2');
    const previous = JSON.parse(before);
    for (const key of ['id', 'title', 'studentId', 'createdAt', 'curriculumVersion', 'focusAtomIds', 'units', 'pace']) expect(course[key]).toEqual(previous[key]);
    for (const key of protectedCollections) expect(hash(store.inspect(key)), key).toBe(preserved[key]);
  });
  it('keeps the old session readable and opens the new tutorial only through the version switch', async () => {
    const original = await call('get', '/learning/classroom/sessions/' + old.id);
    expect(original.contentStatus).toBe('archived'); expect(original.lesson).toEqual(old.lesson);
    const reopened = await call('post', '/learning/classroom/sessions', { studioCourseId: course.id, lessonId: old.lessonId });
    expect(reopened.id).toBe(old.id);
    const current = await call('post', '/learning/classroom/sessions', { studioCourseId: course.id, lessonId: old.lessonId, useCurrentVersion: true });
    expect(current.id).not.toBe(old.id); expect(current.contentStatus).toBe('current'); expect(current.lesson.questions).toHaveLength(1);
    expect(current.lesson.steps.flatMap((step: any) => step.blocks).some((block: any) => block.kind === 'experiment')).toBe(true);
    expect((await call('get', '/learning/classroom/sessions/' + old.id)).lesson).toEqual(old.lesson);
    await call('get', '/learning/classroom/sessions/' + current.id, undefined, outsider, 403);
  });
  it('renders all 28 complete lesson payloads with real assets, topic locators, 28 checks and ten model kinds', async () => {
    const catalog = await call('get', '/chemistry/catalog?studentId=' + studentId);
    expect(catalog.textbookBasis.mappings).toHaveLength(28);
    expect(catalog.textbookBasis.editionNotice).toContain('版权页未注明版次');
    const models = new Set(), figures = new Set();
    for (const unit of catalog.units) for (const atom of unit.lessons) {
      const session = await call('post', '/learning/classroom/sessions', { studioCourseId: course.id, lessonId: 'learn:' + atom.id, useCurrentVersion: true });
      const blocks = session.lesson.steps.flatMap((step: any) => step.blocks);
      expect(JSON.stringify(blocks)).toContain(atom.teaching.explanation);
      expect(JSON.stringify(blocks)).toContain(atom.teaching.example.conclusion);
      const figure = blocks.find((block: any) => block.kind === 'image'); figures.add(figure.image.src);
      const file = resolve('../web/public' + figure.image.src);
      expect(existsSync(file), file).toBe(true);
      const svg = readFileSync(file, 'utf8'); expect(svg).toContain('<title'); expect(svg).not.toMatch(/<script|<foreignObject|(?:href|src)\s*=\s*["']https?:/i);
      for (const block of blocks.filter((block: any) => block.kind === 'experiment')) models.add(block.experiment.kind);
      expect(session.lesson.sourceReferences[0].locator).toContain('参考本印刷页');
      expect(session.lesson.questions).toHaveLength(1); expect(session.lesson.questions[0].hint).toBe(''); expect(session.lesson.questions[0]).not.toHaveProperty('answer');
    }
    expect(figures.size).toBe(28); expect(models.size).toBe(10);
    expect(hash(store.inspect('measurementItems'))).toBe(preserved.measurementItems);
  });
  it('scores original classroom checks, preserves first receipts, and leaves independent-assessment records untouched', async () => {
    const session = await call('post', '/learning/classroom/sessions', { studioCourseId: course.id, lessonId: old.lessonId, useCurrentVersion: true });
    const question = session.lesson.questions[0]; expect(question.prompt).toContain('冰变成液态水');
    const command = { questionId: question.id, selectedIndex: 1, hintUsed: false, requestKey: 'tutorial-first-answer-immutable' };
    const first = await call('post', `/learning/classroom/sessions/${session.id}/answers`, command);
    expect(first.answers[0]).toMatchObject({ correct: true, hintUsed: false });
    expect((await call('post', `/learning/classroom/sessions/${session.id}/answers`, command)).answers).toEqual(first.answers);
    await call('post', `/learning/classroom/sessions/${session.id}/answers`, { ...command, selectedIndex: 0 }, parent, 409);
    expect((await call('get', '/learning/classroom/sessions/' + session.id)).answers).toEqual(first.answers);
    expect(hash(store.inspect('diagnosticResponses'))).toBe(preserved.diagnosticResponses);
    expect(hash(store.inspect('diagnosticSessions'))).toBe(preserved.diagnosticSessions);
    const verification = new URL(session.lesson.verificationHref, 'http://local'); expect(verification.searchParams.get('subject')).toBe('chemistry');
  });
});

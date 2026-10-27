import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';

describe('frozen classroom choice sets and immutable first feedback', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-classroom-choice-'));
  const names = ['NODE_ENV','STUDY_DATA_DIR','STUDY_STORAGE','DATABASE_URL','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','XIAOJIU_CHAT_ENABLED'] as const;
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
  let app: any, store: any, actor: any, other: any, pg: Pool | undefined, schema: string | undefined;
  async function call(method: 'get'|'post', path: string, body?: unknown, user = actor, expected = method === 'post' ? 201 : 200, target = app) {
    let query = request(target.getHttpServer())[method]('/api' + path);
    if (user) query = query.set('Authorization', 'Bearer ' + user.token); if (body !== undefined) query = query.send(body as object);
    const response = await query; expect(response.status, JSON.stringify(response.body.error)).toBe(expected); return response.body.data;
  }
  async function boot() { app = await NestFactory.create(require('../../../dist/apps/api/src/app.module.js').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init(); store = app.get(require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js').InMemoryStoreService); }
  beforeAll(async () => {
    let driver = 'sqlite'; const location = process.env.STUDY_TEST_CLASSROOM_CHOICE_POSTGRES_URL;
    if (location) { pg = new Pool({ connectionString: location }); expect((await pg.query('SELECT current_database() name')).rows[0].name).toBe('study_agent_qa'); schema = 'study_qa_choices_' + randomUUID().replace(/-/g, ''); await pg.query('CREATE SCHEMA "' + schema + '"'); const url = new URL(location); url.searchParams.set('options', '-c search_path=' + schema); process.env.DATABASE_URL = url.toString(); driver = 'postgres'; }
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: driver, STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'false' });
    await boot(); actor = await call('post', '/auth/register', { principal: 'choice-parent@local.test', credential: 'Choice-QA-only-20261025' }, null); other = await call('post', '/auth/register', { principal: 'choice-other@local.test', credential: 'Choice-QA-only-20261025' }, null);
  });
  afterAll(async () => { await app?.close(); if (pg) { if (!/^study_qa_choices_[a-f0-9]{32}$/.test(schema ?? '')) throw Error('Unsafe choice QA schema'); await pg.query('DROP SCHEMA "' + schema + '" CASCADE'); await pg.end(); }
    for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw Error('Unsafe choice QA directory'); rmSync(directory, { recursive: true, force: true });
  });
  async function fixture() {
    const opened = await call('post', '/learning/classroom/sessions', { lessonId: 'soc-1-1-1', useCurrentVersion: true });
    const questionId = 'synthetic-multiple-' + randomUUID();
    await store.transaction(() => { const row = store.find('classroomSessions', { id: opened.id });
      row.lesson.questions.push({ id: questionId, selectionMode: 'multiple', prompt: '合成多选：哪些行动能帮助核查条件？', options: ['保留观察','直接下结论','比较条件','忽略反例','记录一个结果就确定原因'], hint: '', hintCount: 2 });
      row.answerKeys[questionId] = { answer: [0,2], explanation: '核查需要保留观察并比较条件。这不是一次正式能力评测。', optionExplanations: ['观察是依据','仍缺验证','比较可形成对照','不能忽略反例','一次结果不足以确定原因'] };
      row.hintKeys[questionId] = ['先找依据与结论的区别。','再找哪项行动能形成对照。'];
    }); return { sessionId: opened.id, questionId, path: '/learning/classroom/sessions/' + opened.id + '/answers' };
  }
  it('freezes explicit question images without inventing images for a historical session or changing its first answer', async () => {
    const current = await call('post', '/learning/classroom/sessions', { lessonId: 'soc-1-1-1', useCurrentVersion: true });
    expect(current.lesson.questions.filter((question: any) => question.image)).toHaveLength(2);
    expect(current.lesson.questions[0].image.src).toBe('/classroom/venn-d8b3f1.webp');
    expect(current.lesson.questions[2].image.src).toBe('/classroom/agency-river-c7a9e2.webp');
    expect(current.lesson.questions[1].image).toBeUndefined();
    expect(current.lesson.questions.find((question: any) => question.selectionMode === 'multiple').image).toBeUndefined();
    const command = { questionId: current.lesson.questions[0].id, selectedIndex: 0, requestKey: randomUUID() };
    const answered = await call('post', '/learning/classroom/sessions/' + current.id + '/answers', command);
    await store.transaction(() => {
      const old = store.find('classroomSessions', { id: current.id });
      for (const question of old.lesson.questions) delete question.image;
      old.contentFingerprint = require('../../../dist/apps/api/src/modules/learning/classroom-curriculum.js').classroomFingerprint(old.lesson);
    });
    const historical = await call('get', '/learning/classroom/sessions/' + current.id);
    expect(historical.contentStatus).toBe('archived');
    expect(historical.lesson.questions.some((question: any) => question.image)).toBe(false);
    expect(historical.answers).toEqual(answered.answers);
    const reopened = await call('post', '/learning/classroom/sessions', { lessonId: 'soc-1-1-1', useCurrentVersion: true });
    expect(reopened.id).not.toBe(current.id); expect(reopened.lesson.questions[0].image).toEqual(current.lesson.questions[0].image);
    expect((await call('post', '/learning/classroom/sessions/' + current.id + '/answers', command)).answers).toEqual(answered.answers);
  });
  const command = (f: any, selectedIndices: number[], extra: object = {}) => ({ protocol: 'classroom-choice-v2', questionId: f.questionId, selectedIndices, disposition: 'answered', requestKey: randomUUID(), ...extra });
  it('withholds keys before submission and returns the exact frozen set and explanations only after answering', async () => {
    const f = await fixture(), before = await call('get', '/learning/classroom/sessions/' + f.sessionId); expect(before.lesson.questions.find((q: any) => q.id === f.questionId).selectionMode).toBe('multiple'); expect(JSON.stringify(before)).not.toMatch(/correctIndices|optionExplanations|answerKeys/);
    const row = await call('post', f.path, command(f, [2,0])); expect(row.answers.find((a: any) => a.questionId === f.questionId)).toMatchObject({ selectedIndex: null, selectedIndices: [0,2], correctIndices: [0,2], correct: true, hintUsed: false });
    expect(row.answers.at(-1).optionExplanations).toHaveLength(5); expect(row.revision).toBe(before.revision + 1);
  });
  it('preserves omitted, extra and wholly wrong selections without partial-credit invention', async () => {
    for (const selected of [[0],[0,1,2],[1,3]]) { const f = await fixture(), row = await call('post', f.path, command(f, selected)); expect(row.answers.at(-1)).toMatchObject({ correct: false, selectedIndices: selected, correctIndices: [0,2] }); }
  });
  it('rejects duplicates, empty answers, bounds, contradictory fields and the legacy scalar on a multiple-choice item', async () => {
    const f = await fixture();
    for (const body of [command(f, []), command(f, [0,0]), command(f, [-1]), command(f, [5]), command(f, [0,2], { disposition: 'skip' }), command(f, [0,2], { selectedIndex: 0 }), { questionId: f.questionId, selectedIndex: 0, requestKey: randomUUID() }]) await call('post', f.path, body, actor, 400);
    expect((await call('get', '/learning/classroom/sessions/' + f.sessionId)).answers.filter((a: any) => a.questionId === f.questionId)).toHaveLength(0);
  });
  it('recognizes unordered command replay while preserving the original first answer and assistance', async () => {
    const f = await fixture(), c = command(f, [2,0]); await call('post', '/learning/classroom/sessions/' + f.sessionId + '/hints', { questionId: f.questionId, level: 1, requestKey: randomUUID() });
    const first = await call('post', f.path, c), original = first.answers.at(-1); expect(original.hintUsed).toBe(true);
    expect((await call('post', f.path, { ...c, selectedIndices: [0,2] })).answers.at(-1)).toEqual(original);
    await call('post', f.path, { ...c, selectedIndices: [1,2] }, actor, 409);
    expect((await call('post', f.path, command(f, [1,3]))).answers.at(-1)).toEqual(original);
    await app.close(); await boot(); expect((await call('post', f.path, c)).answers.at(-1)).toEqual(original);
  });
  it('keeps skip and dont-know distinct and cannot convert a submitted skip to an independent success', async () => {
    for (const disposition of ['skip','dont_know']) { const f = await fixture(), row = await call('post', f.path, command(f, [], { disposition })); const first = row.answers.at(-1); expect(first).toMatchObject({ disposition, skipped: true, correct: false, selectedIndices: [] }); expect((await call('post', f.path, command(f, [0,2]))).answers.at(-1)).toEqual(first); }
  });
  it('retains a real legacy scalar receipt and original request hash after its historical key is unavailable', async () => {
    const opened = await call('post', '/learning/classroom/sessions', { lessonId: 'soc-1-1-2', useCurrentVersion: true }), question = opened.lesson.questions[0], path = '/learning/classroom/sessions/' + opened.id + '/answers';
    const c = { questionId: question.id, selectedIndex: 1, hintUsed: false, requestKey: randomUUID() }, first = await call('post', path, c);
    await store.transaction(() => { delete store.find('classroomSessions', { id: opened.id }).answerKeys[question.id]; });
    expect((await call('post', path, c)).answers).toEqual(first.answers);
  });
  it('isolates another account and serializes two actual instances without overwriting first feedback', async () => {
    const f = await fixture(), second = await NestFactory.create(require('../../../dist/apps/api/src/app.module.js').AppModule, { logger: false }); second.setGlobalPrefix('api'); await second.init();
    try { await call('post', f.path, command(f, [0,2]), other, 403); const c = command(f, [0,2]); const attempts = await Promise.all([app,second].map(target => request(target.getHttpServer()).post('/api'+f.path).set('Authorization','Bearer '+actor.token).send(c))); expect(attempts.every(r => [201,409].includes(r.status))).toBe(true); expect(attempts.some(r => r.status===201)).toBe(true); const replies = [await call('post', f.path, c), await call('post', f.path, c, actor, 201, second)]; expect(replies[0].answers.at(-1)).toEqual(replies[1].answers.at(-1)); expect(replies[0].answers.filter((a: any) => a.questionId === f.questionId)).toHaveLength(1); }
    finally { await second.close(); }
  });
  it('serializes different concurrent commands and retains one complete original set', async () => {
    const f = await fixture(), second = await NestFactory.create(require('../../../dist/apps/api/src/app.module.js').AppModule, { logger: false }); second.setGlobalPrefix('api'); await second.init();
    try {
      const commands = [command(f, [0,2]), command(f, [1,3])], attempts = await Promise.all([app,second].map((target,index) => request(target.getHttpServer()).post('/api'+f.path).set('Authorization','Bearer '+actor.token).send(commands[index])));
      expect(attempts.every(r => [201,409].includes(r.status))).toBe(true); expect(attempts.some(r => r.status===201)).toBe(true);
      const results = [await call('post', f.path, commands[0]), await call('post', f.path, commands[1], actor, 201, second)];
      const first = results[0].answers.find((a: any) => a.questionId === f.questionId);
      expect(results[1].answers.find((a: any) => a.questionId === f.questionId)).toEqual(first);
      expect([[0,2],[1,3]]).toContainEqual(first.selectedIndices);
      expect((await call('get', '/learning/classroom/sessions/' + f.sessionId)).answers.filter((a: any) => a.questionId === f.questionId)).toEqual([first]);
    } finally { await second.close(); }
  });
  it('exports submitted feedback but withholds all unsubmitted private keys and internal commands', async () => {
    const f = await fixture(), saved = await call('post', f.path, command(f, [0]));
    const exported = await call('post', '/privacy/account/export', { credential: 'Choice-QA-only-20261025', requestKey: randomUUID() });
    const row = exported.accountRecords.classroomSessions.find((row: any) => row.id === f.sessionId);
    expect(row.answers).toEqual(saved.answers); expect(row).not.toHaveProperty('answerKeys'); expect(row).not.toHaveProperty('hintKeys'); expect(row).not.toHaveProperty('requests');
    expect(row.lesson.questions.every((question: any) => !('correctIndices' in question) && !('optionExplanations' in question))).toBe(true);
  });
  it('keeps an old frozen single-choice receipt unchanged while the new lesson exposes its new multiple-choice item', async () => {
    const opened = await call('post', '/learning/classroom/sessions', { lessonId: 'soc-1-3-1', useCurrentVersion: true }), question = opened.lesson.questions[0];
    const c = { questionId: question.id, selectedIndex: 1, hintUsed: false, requestKey: randomUUID() }, path = '/learning/classroom/sessions/' + opened.id;
    await call('post', path + '/answers', c);
    await store.transaction(() => { const row = store.find('classroomSessions', { id: opened.id });
      row.lesson.questions = row.lesson.questions.filter((q: any) => q.selectionMode !== 'multiple'); row.lesson.practiceVersion = 'legacy-test-v1'; row.contentFingerprint = 'legacy-test-' + randomUUID();
      delete row.answers[0].selectedIndices; delete row.answers[0].correctIndices; delete row.answers[0].optionExplanations;
    });
    const legacy = await call('get', path); expect(legacy.contentStatus).toBe('archived'); expect(legacy.answers[0]).not.toHaveProperty('selectedIndices');
    const fresh = await call('post', '/learning/classroom/sessions', { lessonId: 'soc-1-3-1', useCurrentVersion: true });
    expect(fresh.id).not.toBe(opened.id); expect(fresh.lesson.questions.some((q: any) => q.selectionMode === 'multiple')).toBe(true);
    expect((await call('post', path + '/answers', c)).answers).toEqual(legacy.answers);
  });
});

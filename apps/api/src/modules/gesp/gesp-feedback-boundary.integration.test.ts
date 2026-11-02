import 'reflect-metadata';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import curriculum from '../../../../../resources/gesp/student-curriculum-v2.json';

describe('GESP first-group feedback through the actual HTTP boundary', () => {
  let app: any, base: any, parent: any, store: any;
  const task = curriculum.tasks.find(row => row.atomId === 'gesp-cpp.l1.io')!;
  beforeAll(async () => {
    const from = (file: string) => require('../../../dist/apps/api/src/' + file + '.js');
    app = await NestFactory.create(from('app.module').AppModule, { logger: false, abortOnError: false });
    app.setGlobalPrefix('api'); await app.init(); base = request(app.getHttpServer());
    store = app.get(from('infrastructure/in-memory-store.service').InMemoryStoreService);
    app.get(from('modules/gesp/gesp.service').GespService).runCpp = async (source: string, tests: any[]) => ({
      passed: true, sourceSha256: createHash('sha256').update(source).digest('hex'), toolchain: 'qa-control-flow',
      compile: { passed: true, stderr: '' }, tests: tests.map((_, index) => ({ index, passed: true, status: 'passed', exitCode: 0, durationMs: 1 })) });
    parent = await call('post', '/auth/register', { principal: 'feedback-' + randomUUID(), credential: randomBytes(18).toString('hex') }, null);
  });
  afterAll(async () => { await app?.close(); });
  async function call(method: 'get' | 'post' | 'put', route: string, body?: unknown, actor: any = parent) {
    let query = base[method]('/api' + route);
    if (actor?.token) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) query = query.send(body);
    const response = await query; expect(response.status).toBe(method === 'post' ? 201 : 200); return response.body.data;
  }
  async function child() {
    const studentId = (await call('post', '/students', { nickname: '合成首组反馈测试', grade: 4, preferredSessionMinutes: 15,
      defaultVersionMap: { math: '', chinese: '', english: '' } })).profile.id;
    const access = await call('post', `/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '家长开放隔离首组反馈验证' });
    const code = await call('post', `/students/${studentId}/learning-access/codes`, { expectedVersion: access.version, requestKey: randomUUID() });
    const actor = await call('post', '/auth/learning-code', { code: code.code }, null);
    await call('put', `/gesp/students/${studentId}/scope`, { level: 1, atomIds: [task.atomId], requestKey: randomUUID(), reason: '仅核对一个隔离原创编程任务的反馈边界' });
    return { studentId, actor };
  }
  it('holds correctness and explanations across dimensions until the complete first group is saved', async () => {
    const { studentId, actor } = await child(), probe = task.probes[0];
    const command = { studentId, atomId: task.atomId, probeId: probe.id, answer: probe.answer, requestKey: randomUUID() };
    const first = await call('post', '/gesp/probe-submissions', command, actor);
    expect(first.status).toBe('recorded');
    expect(first.analysis).not.toBe(probe.analysis);
    const pending = await call('get', `/gesp/students/${studentId}/workspace`, undefined, actor);
    expect(pending.probeSubmissions[0].status).toBe('recorded');
    expect(pending.capabilities[0].dimensions[0].status).toBe('recorded');
    expect(await call('post', '/gesp/probe-submissions', command, actor)).toEqual(first);
    for (const row of task.probes.slice(1)) await call('post', '/gesp/probe-submissions', { ...command, probeId: row.id, answer: row.answer, requestKey: randomUUID() }, actor);
    const code = await call('post', '/gesp/code-submissions', { studentId, atomId: task.atomId, source: 'int main(){}', requestKey: randomUUID() }, actor);
    expect(code).toMatchObject({ status: 'passed', independent: true });
    const complete = await call('get', `/gesp/students/${studentId}/workspace`, undefined, actor);
    expect(complete.probeSubmissions.every((row: any) => row.status === 'correct')).toBe(true);
    expect(complete.capabilities[0].state).toBe('current_evidence_met');
    expect(complete.reviewTasks).toHaveLength(4);
    expect(await call('post', '/gesp/probe-submissions', command, actor)).toEqual(first);
  });
  it('also completes and schedules when code arrives before the probes, preserving frozen replay', async () => {
    const { studentId, actor } = await child();
    const command = { studentId, atomId: task.atomId, source: 'int main(){}', requestKey: randomUUID() };
    const code = await call('post', '/gesp/code-submissions', command, actor);
    expect(code).toMatchObject({ status: 'recorded', compilePassed: null, tests: [], compileDiagnostics: [], runtimeDiagnostics: [] });
    for (const probe of task.probes) await call('post', '/gesp/probe-submissions', { studentId, atomId: task.atomId, probeId: probe.id, answer: probe.answer, requestKey: randomUUID() }, actor);
    const complete = await call('get', `/gesp/students/${studentId}/workspace`, undefined, actor);
    expect(complete.submissions[0]).toMatchObject({ id: code.id, status: 'passed', compilePassed: true });
    expect(complete.capabilities[0].state).toBe('current_evidence_met'); expect(complete.reviewTasks).toHaveLength(4);
    expect(await call('post', '/gesp/code-submissions', command, actor)).toEqual(code);
    const practice = await call('post', '/gesp/code-submissions', { ...command, requestKey: randomUUID() }, actor);
    expect(practice.evidence.classification).toBe('practice');
    const after = await call('get', `/gesp/students/${studentId}/workspace`, undefined, actor);
    expect(after.capabilities[0].state).toBe('current_evidence_met'); expect(after.reviewTasks).toHaveLength(4);
  });
  it('lets the learner end an incomplete group with help without restoring independence', async () => {
    const { studentId, actor } = await child(), probe = task.probes[0];
    const first = await call('post', '/gesp/probe-submissions', { studentId, atomId: task.atomId, probeId: probe.id, answer: probe.answer, requestKey: randomUUID() }, actor);
    expect(first.status).toBe('recorded');
    await call('post', '/gesp/hints', { studentId, atomId: task.atomId, taskId: task.id, level: 1, requestKey: randomUUID() }, actor);
    const workspace = await call('get', `/gesp/students/${studentId}/workspace`, undefined, actor);
    expect(workspace.probeSubmissions[0].status).toBe('correct');
    const code = await call('post', '/gesp/code-submissions', { studentId, atomId: task.atomId, source: 'int main(){}', requestKey: randomUUID() }, actor);
    expect(code).toMatchObject({ status: 'passed', independent: false, evidence: { classification: 'assisted', feedbackExposureIds: [first.id] } });
    expect((await call('get', `/gesp/students/${studentId}/workspace`, undefined, actor)).reviewTasks).toHaveLength(0);
  });
  it('does not promote legacy v1 feedback exposure into a new independent response', async () => {
    const { studentId, actor } = await child(), legacy = { id: 'legacy-' + randomUUID(), studentId, atomId: task.atomId,
      taskId: task.id, probeId: task.probes[0].id, dimension: 'understanding', status: 'correct', answer: task.probes[0].answer,
      analysis: 'Old feedback was already returned.', requestKey: randomUUID(), createdAt: new Date().toISOString(),
      evidence: { policy: 'gesp-first-response-v1', classification: 'independent', priorResponseIds: [], hintEventIds: [] } };
    await store.transaction(() => store.append('gespProbeSubmissions', legacy));
    const code = await call('post', '/gesp/code-submissions', { studentId, atomId: task.atomId, source: 'int main(){}', requestKey: randomUUID() }, actor);
    expect(code).toMatchObject({ independent: false, evidence: { classification: 'assisted', feedbackExposureIds: [legacy.id] } });
    expect(await store.requestContext(() => store.find('gespProbeSubmissions', { id: legacy.id }))).toEqual(legacy);
    const workspace = await call('get', `/gesp/students/${studentId}/workspace`, undefined, actor);
    expect(workspace.capabilities[0].state).not.toBe('current_evidence_met'); expect(workspace.reviewTasks).toHaveLength(0);
  });
  it('keeps an incorrect independent probe after a later correct practice response', async () => {
    const { studentId, actor } = await child(), probe = task.probes[0];
    const first = await call('post', '/gesp/probe-submissions', { studentId, atomId: task.atomId, probeId: probe.id,
      answer: probe.options.find(option => option !== probe.answer), requestKey: randomUUID() }, actor);
    for (const row of task.probes) await call('post', '/gesp/probe-submissions', { studentId, atomId: task.atomId, probeId: row.id, answer: row.answer, requestKey: randomUUID() }, actor);
    await call('post', '/gesp/code-submissions', { studentId, atomId: task.atomId, source: 'int main(){}', requestKey: randomUUID() }, actor);
    const workspace = await call('get', `/gesp/students/${studentId}/workspace`, undefined, actor);
    expect(workspace.capabilities[0]).toMatchObject({ state: 'needs_verification' });
    expect(workspace.capabilities[0].dimensions[0]).toMatchObject({ status: 'incorrect', attempts: 2 });
    expect(workspace.capabilities[0].independentEvidenceIds).toContain(first.id); expect(workspace.reviewTasks).toHaveLength(0);
  });
});

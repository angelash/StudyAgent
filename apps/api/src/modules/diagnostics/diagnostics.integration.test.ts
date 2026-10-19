import 'reflect-metadata';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

const require = createRequire(__filename);
describe('scope → atomic assessment → diagnosis → guidance → verification', () => {
  let app: INestApplication, store: any, auth: any, owner: any, admin: any, studentId: string;
  const originalKey = process.env.OPENAI_API_KEY;
  beforeAll(async () => {
    delete process.env.OPENAI_API_KEY;
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { AuthService } = require('../../../dist/apps/api/src/modules/auth/auth.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(InMemoryStoreService); auth = app.get(AuthService);
  });
  beforeEach(async () => {
    store.reset();
    owner = await auth.register({ principal: 'diagnostic-parent@test', credential: 'diagnostic-secret-123' }, 'fixture-parent');
    admin = await auth.register({ principal: 'diagnostic-reviewer@test', credential: 'diagnostic-secret-123' }, 'fixture-reviewer');
    store.users.find((user: any) => user.id === admin.user.id).role = 'admin';
    studentId = 'student';
    store.students.push({ id: studentId, userId: 'child-user', nickname: '小禾', grade: 3, preferredSessionMinutes: 15,
      defaultVersionMap: { math: 'common', chinese: '', english: '' } });
    store.bindings.push({ id: 'binding', studentId, parentUserId: owner.user.id, relation: 'guardian', status: 'active' });
    for (const [id, grade, prerequisiteIds] of [['base', 1, []], ['target', 3, ['base']], ['unmapped', 3, []], ['future', 6, []]] as const) {
      store.knowledgeAtoms.push({ id, grade, prerequisiteIds, subject: 'math', name: id, strand: '数与运算', term: 'both',
        objective: `独立完成${id}知识点的指定操作`, successCriterion: '在不同题族的新题中独立完成操作', curriculumVersion: 'test-v1', status: 'published', version: 1 });
      if (id === 'unmapped') continue;
      for (let index = 0; index < 16; index++) {
        const qid = `${id}-q${index}`, mid = `${id}-item${index}`;
        store.questions.push({ id: qid, subject: 'math', type: 'objective', stem: `第${index + 1}个变式：3+3=?`, answer: '6',
          analysis: '两组3合并。', difficultyLevel: 1, knowledgePointIds: [], status: 'published' });
        store.questionAnswerSchemas.push({ questionId: qid, mode: 'numeric_blank', responseShape: { value: 'number' }, validationRules: {}, gradingConfig: {} });
        store.questionSources.push({ questionId: qid, sourceType: 'internal_authoring', sourceName: '测试量化题', sourcePathOrUrl: '',
          licenseClass: 'A_INTERNAL', licenseName: 'test', importJobId: null, reviewStatus: 'approved', notes: null });
        store.measurementItems.push({ id: mid, questionId: qid, questionVersion: 1, atomId: id, dimension: 'procedure', family: `${id}-family${index % 4}`,
          probeRole: 'anchor', expectedSeconds: 15, difficulty: 1, reviewStatus: 'approved', mappingWeight: 1, observationCode: 'step_mismatch', version: 1 });
      }
    }
    await call('put', `/students/${studentId}/learning-scope`, {
      subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null, textbookVersion: '通用基础',
      learnedAtomIds: ['target', 'unmapped'], currentAtomId: 'target', minutesPerSession: 15,
    });
  });
  afterAll(async () => { await app.close(); if (originalKey) process.env.OPENAI_API_KEY = originalKey; });
  async function call(method: 'post' | 'get' | 'put' | 'patch', path: string, body?: unknown, status?: number, actor?: any) {
    let query = request(app.getHttpServer())[method](`/api${path}`).set('Authorization', `Bearer ${(actor ?? owner).token}`);
    if (body !== undefined) query = query.send(body);
    const response = await query.expect(status ?? (method === 'post' ? 201 : 200));
    return response.body.data;
  }
  const start = (extra = {}) => call('post', '/diagnostics/sessions', { studentId, subject: 'math', intent: 'baseline', maxItems: 8,
    includePrerequisites: true, ...extra });
  const submit = (session: any, item: any, answer: unknown) => call('post', `/diagnostics/sessions/${session.id}/responses`, { itemId: item.id, answer, elapsedMs: 1234 });

  it('enforces progress, records coverage gaps and preserves question/scope snapshots and first submissions', async () => {
    await start({ targetAtomIds: ['future'] }).then(() => { throw new Error('Expected progress rejection'); }).catch((error) => expect(String(error)).toContain('expected 201'));
    const session = await start();
    expect(session.items.every((item: any) => ['target', 'base'].includes(item.atomId))).toBe(true);
    expect(session.coverage.find((item: any) => item.atomId === 'unmapped').selected).toBe(0);
    expect(session.coverage.find((item: any) => item.atomId === 'base').role).toBe('prerequisite');
    const first = session.items[0];
    store.questions.find((item: any) => item.id === first.questionId).answer = '999';
    store.questions.find((item: any) => item.id === first.questionId).stem = '修改后的题干';
    const rendered = await call('get', `/diagnostics/sessions/${session.id}/items/${first.id}`);
    expect(JSON.stringify(rendered.payload)).not.toContain('999');
    expect(rendered.payload.document.blocks[0].text).not.toContain('修改后的题干');
    const saved = await submit(session, first, 6);
    expect((await submit(session, first, 6)).responseId).toBe(saved.responseId);
    await call('post', `/diagnostics/sessions/${session.id}/responses`, { itemId: first.id, answer: 7, elapsedMs: 1500 }, 409);
    expect(store.diagnosticResponses.filter((item: any) => item.itemId === first.id)).toHaveLength(1);
    for (const item of session.items.slice(1)) await submit(session, item, 6);
    const report = await call('post', `/diagnostics/sessions/${session.id}/complete`, {});
    expect(report.rawScore).toBe(100);
    expect(report.estimates.find((item: any) => item.atomId === 'unmapped').status).toBe('unknown');
    expect(report.estimates.every((item: any) => item.status !== 'secure')).toBe(true);
    const oldScopeId = session.scopeSnapshot.id;
    await call('put', `/students/${studentId}/learning-scope`, { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null,
      textbookVersion: '通用基础', learnedAtomIds: ['target'], currentAtomId: 'target', minutesPerSession: 10 });
    expect((await call('get', `/diagnostics/sessions/${session.id}`)).scopeSnapshot.id).toBe(oldScopeId);
  });

  it('verifies prerequisite hypotheses, produces budgeted plans without AI and schedules real delayed reviews', async () => {
    const session = await start();
    for (const item of session.items) await submit(session, item, 0);
    const report = await call('post', `/diagnostics/sessions/${session.id}/complete`, {});
    const root = report.hypotheses.find((item: any) => item.atomId === 'target' && item.cause === 'prerequisite_gap');
    expect(root.status).toBe('supported');
    expect(root.supportingEvidenceIds.length).toBeGreaterThanOrEqual(2);
    const plan = await call('post', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: session.id, minutesPerDay: 15, useAi: true });
    expect(plan.source).toBe('rules'); expect(plan.aiStatus).toBe('unavailable');
    expect(plan.actions.reduce((sum: number, item: any) => sum + item.minutes, 0)).toBe(15);
    expect(plan.actions[0].atomId).toBe('base');
    await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'active' });
    const reviews = await call('get', `/diagnostics/students/${studentId}/reviews?subject=math`);
    expect(new Set(reviews.map((item: any) => item.intervalDays))).toEqual(new Set([1, 3, 7, 14]));
    await call('post', `/diagnostics/reviews/${reviews[0].id}/start`, {}, 400);
    const probe = await start({ intent: 'verification', hypothesisId: root.id, targetAtomIds: ['base'], maxItems: 4 });
    expect(probe.items.every((item: any) => !session.items.some((old: any) => old.questionId === item.questionId))).toBe(true);
    for (const item of probe.items) await submit(probe, item, 6);
    await call('post', `/diagnostics/sessions/${probe.id}/complete`, {});
    const profile = await call('get', `/diagnostics/students/${studentId}/profile?subject=math`);
    const updated = profile.hypotheses.find((item: any) => item.id === root.id);
    expect(updated.counterEvidenceIds.length).toBeGreaterThanOrEqual(2);
    expect(updated.status).toBe('inconclusive');
    const retrospective = await call('get', `/diagnostics/plans/${plan.id}/retrospective`);
    expect(retrospective.comparisons.every((item: any) => item.outcome !== 'improved')).toBe(true);
  });

  it('keeps subjective scoring pending and preserves review versions rather than overwriting evidence', async () => {
    const session = await start({ targetAtomIds: ['target'], includePrerequisites: false, maxItems: 2 });
    const rawSession = store.diagnosticSessions.find((item: any) => item.id === session.id);
    for (const snapshot of rawSession.questionSnapshots) snapshot.answerSchema.mode = 'short_answer';
    for (const item of session.items) await submit(session, item, '我先按位分析，再检查结果');
    const firstReport = await call('post', `/diagnostics/sessions/${session.id}/complete`, {});
    expect(firstReport.pendingReviewCount).toBe(2); expect(firstReport.rawScore).toBeNull();
    const responseId = firstReport.evidence[0].id;
    await call('post', `/admin/diagnostic-responses/${encodeURIComponent(responseId)}/review`, { score: 1, reason: '按该题量规逐步核对，关键步骤正确' }, 201, admin);
    const report = await call('get', `/diagnostics/sessions/${session.id}/report`);
    expect(report.pendingReviewCount).toBe(1); expect(report.scoredCount).toBe(1);
    expect(store.diagnosticResponses.find((item: any) => item.id === responseId).score).toBeNull();
    expect(store.diagnosticReports.filter((item: any) => item.sessionId === session.id)).toHaveLength(2);
  });
});

import 'reflect-metadata';
import { createRequire } from 'node:module';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
const require = createRequire(__filename);

describe('evidence coach without search subprocess or a required AI key', () => {
  let app: INestApplication, store: any, ai: any, account: any;
  const previousKey = process.env.OPENAI_API_KEY;
  beforeAll(async () => {
    delete process.env.OPENAI_API_KEY;
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { AuthService } = require('../../../dist/apps/api/src/modules/auth/auth.service.js');
    const { AiService } = require('../../../dist/apps/api/src/modules/ai/ai.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(InMemoryStoreService); ai = app.get(AiService);
    account = await app.get(AuthService).register({ principal: 'coach-parent', credential: 'coach-fixture-123' });
    store.bindings.push({ id: 'binding', parentUserId: account.user.id, studentId: 'child', status: 'active', relation: 'guardian' });
    store.diagnosticPlans.push({ id: 'plan', studentId: 'child', subject: 'math', status: 'active', createdAt: new Date().toISOString(),
      summary: '每天十分钟，先单独核查退位再复测。', actions: [], evidenceIds: [] });
    store.diagnosticPlans.push({ id: 'foreign', studentId: 'other-child', subject: 'math', status: 'active', createdAt: '2099',
      summary: 'OTHER_CHILD_PRIVATE_MARKER', actions: [], evidenceIds: [] });
  });
  afterAll(async () => { await app?.close(); if (previousKey) process.env.OPENAI_API_KEY = previousKey; });
  const post = (path: string, body: unknown) => request(app.getHttpServer()).post(`/api/ai${path}`)
    .set('Authorization', `Bearer ${account.token}`).send(body as object);
  const question = (id: string) => ({ id, stem: '先整理两堆积木的条件，再说明怎样合并。', answer: 731, analysis: 'PRIVATE_REFERENCE_ANALYSIS',
    answerSchema: { questionId: id, mode: 'numeric_blank', responseShape: { value: 'number' }, validationRules: {}, gradingConfig: {} } });

  it('validates session scope and gives evidence-based local coaching in all three subjects', async () => {
    await post('/assistant/sessions', { userRole: 'parent', studentId: 'other-child', pageContext: 'review' }).expect(403);
    await post('/assistant/sessions', { userRole: 'unknown', studentId: null, pageContext: 'review' }).expect(400);
    for (const subject of ['math', 'chinese', 'english']) {
      const opened = await post('/assistant/sessions', { userRole: 'parent', studentId: 'child', subject, pageContext: 'review' }).expect(201);
      const response = await post(`/assistant/sessions/${opened.body.data.id}/messages`, { message: '我该怎样帮助孩子？' }).expect(201);
      expect(response.body.data.source).toBe('rules'); expect(response.body.data.messages).toHaveLength(2);
      expect(response.body.data.reply).not.toContain('OTHER_CHILD_PRIVATE_MARKER');
      if (subject === 'math') expect(response.body.data.reply).toContain('退位');
      else expect(response.body.data.reply).toContain('已学范围');
    }
  });
  it('rejects fabricated model evidence and cancels without saving a partial conversation', async () => {
    const session = ai.openAssistantSession({ userRole: 'parent', studentId: 'child', subject: 'math', pageContext: 'review' }, store.users[0]);
    ai.client = { chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: '这个结论没有合法依据，应该被系统拒绝。', evidenceIds: ['invented-evidence'] }) } }] }) } } };
    const response = await ai.chat({ sessionId: session.id, message: '请分析原因' });
    expect(response.source).toBe('rules'); expect(response.evidenceIds).toEqual([]);
    const before = store.assistantMessages.length, controller = new AbortController(); controller.abort();
    await expect(ai.chat({ sessionId: session.id, message: '取消本次请求', signal: controller.signal })).rejects.toThrow('取消');
    expect(store.assistantMessages).toHaveLength(before);
    ai.client = null;
    await post(`/assistant/sessions/${session.id}/messages`, { message: 'a'.repeat(3001) }).expect(400);
  });

  it('binds the visible practice question, restores one scoped conversation, redacts scoring data and records assistance once', async () => {
    store.knowledgeAtoms.push({ id: 'coach-atom', name: '数的组成', objective: '把已知数量与合并目标对应起来' });
    store.practiceSessions.push({ id: 'coach-practice', studentId: 'child', subject: 'math', planId: 'plan', actionId: 'action', atomId: 'coach-atom',
      status: 'in_progress', questionIds: ['coach-q1', 'coach-q2'], snapshots: [question('coach-q1'), question('coach-q2')],
      drafts: { 'coach-q1': { answer: { value: '我先把数量放在一起' }, savedAt: new Date().toISOString() } } });
    const input = { userRole: 'student', studentId: 'child', subject: 'math', pageContext: 'mission', contextRefType: 'practice', contextRefId: 'coach-practice', contextItemId: 'coach-q1' };
    const opened = await post('/assistant/sessions', input).expect(201), id = opened.body.data.id;
    expect((await post('/assistant/sessions', input).expect(201)).body.data.id).toBe(id);
    let prompt = '';
    ai.client = { chat: { completions: { create: async (command: any) => {
      prompt = JSON.stringify(command.messages);
      return { choices: [{ message: { content: JSON.stringify({ reply: '最终答案是731，这条泄露答案的回复应当被拒绝。', evidenceIds: [] }) } }] };
    } } } };
    const message = { message: '我已经写了想法，怎样检查条件？', requestKey: 'practice-help-1' };
    const response = (await post(`/assistant/sessions/${id}/messages`, message).expect(201)).body.data;
    expect(prompt).toContain('两堆积木'); expect(prompt).toContain('我先把数量');
    expect(prompt).not.toContain('PRIVATE_REFERENCE_ANALYSIS'); expect(prompt).not.toContain('731'); expect(prompt).not.toContain('gradingConfig');
    expect(response.source).toBe('rules'); expect(response.assistanceRecorded).toBe(true); expect(response.reply).toContain('草稿');
    expect(store.practiceHints.filter((h: any) => h.sessionId === 'coach-practice')).toHaveLength(1);
    expect((await post(`/assistant/sessions/${id}/messages`, message).expect(201)).body.data.messages).toHaveLength(2);
    expect(store.practiceHints.filter((h: any) => h.sessionId === 'coach-practice')).toHaveLength(1);
    await post(`/assistant/sessions/${id}/messages`, { ...message, message: '另一条不同的提问' }).expect(409);
    const attempt = await request(app.getHttpServer()).post('/api/learning/practice/coach-practice/responses').set('Authorization', `Bearer ${account.token}`)
      .send({ questionId: 'coach-q1', requestKey: 'after-assistant', answer: 731, elapsedMs: 3000 }).expect(201);
    expect(attempt.body.data.attempt.hintLevel).toBe(1); expect(attempt.body.data.notice).not.toContain('独立完成');
    const next = await post('/assistant/sessions', { ...input, contextItemId: 'coach-q2' }).expect(201);
    expect(next.body.data.id).not.toBe(id);
    const history = await request(app.getHttpServer()).get(`/api/ai/assistant/sessions/${id}/messages`).set('Authorization', `Bearer ${account.token}`).expect(200);
    expect(history.body.data).toHaveLength(2);
    ai.client = null;
  });

  it('validates reference ownership, subject and item, and preserves revoked access and pause boundaries', async () => {
    const input = { userRole: 'student', studentId: 'child', subject: 'math', pageContext: 'mission', contextRefType: 'practice', contextRefId: 'coach-practice', contextItemId: 'coach-q2' };
    await post('/assistant/sessions', { ...input, contextRefType: 'arbitrary' }).expect(400);
    await post('/assistant/sessions', { ...input, contextRefId: null }).expect(400);
    await post('/assistant/sessions', { ...input, contextItemId: 'foreign-question' }).expect(400);
    await post('/assistant/sessions', { ...input, subject: 'english' }).expect(404);
    store.practiceSessions.push({ ...store.practiceSessions[0], id: 'foreign-practice', studentId: 'other-child' });
    await post('/assistant/sessions', { ...input, contextRefId: 'foreign-practice' }).expect(404);
    const session = (await post('/assistant/sessions', input).expect(201)).body.data;
    store.bindings[0].status = 'inactive';
    await post(`/assistant/sessions/${session.id}/messages`, { message: '绑定已撤销后不应还能读取题目。' }).expect(403);
    store.bindings[0].status = 'active'; store.diagnosticPlans[0].status = 'paused';
    await post('/assistant/sessions', input).expect(400);
    store.diagnosticPlans[0].status = 'active';
  });

  it('keeps assisted diagnostic responses separate from independent evidence and cancellation leaves no assistance', async () => {
    const mapping = { id: 'coach-item', atomId: 'coach-atom', questionId: 'coach-dq', questionVersion: 1, version: 1, family: 'coach-family', dimension: 'understanding', observationCode: 'step_mismatch' };
    store.diagnosticSessions.push({ id: 'coach-diagnostic', studentId: 'child', subject: 'math', intent: 'baseline', status: 'in_progress',
      itemIds: [mapping.id], itemSnapshots: [mapping], questionSnapshots: [question('coach-dq')], startedAt: new Date().toISOString(),
      scopeSnapshot: { grade: 3, subject: 'math', learnedAtomIds: ['coach-atom'], term: 'upper', textbookVersion: 'test' } });
    const input = { userRole: 'student', studentId: 'child', subject: 'math', pageContext: 'assessment', contextRefType: 'diagnostic', contextRefId: 'coach-diagnostic', contextItemId: mapping.id };
    const session = (await post('/assistant/sessions', input).expect(201)).body.data;
    const canceled = new AbortController(); canceled.abort();
    await expect(ai.chat({ sessionId: session.id, message: '这次请求已取消', signal: canceled.signal })).rejects.toThrow('取消');
    expect(store.diagnosticHints.filter((h: any) => h.sessionId === 'coach-diagnostic')).toHaveLength(0);
    let called = false;
    ai.client = { chat: { completions: { create: async () => { called = true; throw new Error('Must not use a model to supply diagnostic answers'); } } } };
    const help = await post(`/assistant/sessions/${session.id}/messages`, { message: '帮我整理条件', requestKey: 'diagnostic-help' }).expect(201);
    expect(help.body.data.assistanceRecorded).toBe(true); expect(called).toBe(false);
    const answer = await request(app.getHttpServer()).post('/api/diagnostics/sessions/coach-diagnostic/responses').set('Authorization', `Bearer ${account.token}`)
      .send({ itemId: mapping.id, answer: 731, elapsedMs: 3000 }).expect(201);
    expect(store.diagnosticResponses.find((r: any) => r.id === answer.body.data.responseId).hintLevel).toBe(1);
    const afterSubmit = await post(`/assistant/sessions/${session.id}/messages`, { message: '刚才的回答对了吗', requestKey: 'diagnostic-after-submit-help' }).expect(201);
    expect(afterSubmit.body.data.source).toBe('rules'); expect(afterSubmit.body.data.assistanceRecorded).toBe(false); expect(called).toBe(false);
    ai.client = null;
  });

  it('uses the selected frozen definition and baseline report across report, plan and practice coaching', async () => {
    const original = { id: 'frozen-coach-atom', name: '旧定义中的数量关系', objective: '根据原来条件说明两组数量的合并关系',
      successCriterion: '独立核对原条件并说明关系', prerequisiteIds: [], grade: 3, term: 'upper', subject: 'math', status: 'published', version: 1 };
    store.knowledgeAtoms.push({ ...original, name: 'LIVE_DEFINITION_NAME', objective: 'LIVE_DEFINITION_OBJECTIVE', version: 2 });
    const scopeSnapshot = { grade: 3, subject: 'math', learnedAtomIds: [original.id], term: 'upper', textbookVersion: '原范围' };
    store.diagnosticSessions.push({ id: 'frozen-coach-baseline', studentId: 'child', subject: 'math', status: 'completed',
      atomSnapshots: [original], scopeSnapshot, itemSnapshots: [], questionSnapshots: [], coverage: [] });
    const baseline = { studentId: 'child', subject: 'math', sessionId: 'frozen-coach-baseline',
      summary: 'FROZEN_REPORT_MARKER', evidence: [], estimates: [], hypotheses: [] };
    store.diagnosticReports.push({ id: 'frozen-coach-report', version: 1, createdAt: '2026-01-01T00:00:00Z', report: baseline });
    store.diagnosticReports.push({ id: 'unrelated-coach-report', version: 1, createdAt: '2026-12-01T00:00:00Z',
      report: { ...baseline, sessionId: 'another-assessment', summary: 'UNRELATED_REPORT_MARKER' } });
    store.diagnosticPlans.push({ id: 'frozen-coach-plan', studentId: 'child', subject: 'math', status: 'active', createdAt: '2026-01-01T01:00:00Z',
      baselineSessionId: 'frozen-coach-baseline', summary: '采用原基线指导', actions: [], evidenceIds: [] });
    store.practiceSessions.push({ id: 'frozen-coach-practice', studentId: 'child', subject: 'math', planId: 'frozen-coach-plan',
      atomId: original.id, status: 'in_progress', questionIds: ['frozen-coach-q'], snapshots: [question('frozen-coach-q')] });
    let prompt = '';
    ai.client = { chat: { completions: { create: async (command: any) => {
      prompt = JSON.stringify(command.messages);
      return { choices: [{ message: { content: JSON.stringify({ reply: '请对照当时的数量条件说明思路，并通过当前范围的新评测重新核查。', evidenceIds: [] }) } }] };
    } } } };
    try {
      for (const [kind, ref, item] of [['diagnostic', 'frozen-coach-baseline', null], ['plan', 'frozen-coach-plan', null],
        ['practice', 'frozen-coach-practice', 'frozen-coach-q']] as const) {
        const session = (await post('/assistant/sessions', { userRole: 'parent', studentId: 'child', subject: 'math', pageContext: 'review',
          contextRefType: kind, contextRefId: ref, contextItemId: item }).expect(201)).body.data;
        await post(`/assistant/sessions/${session.id}/messages`, { message: '请根据这次记录解释当时的表现', requestKey: `frozen-${kind}-coaching` }).expect(201);
        expect(prompt).toContain(original.name); expect(prompt).toContain('FROZEN_REPORT_MARKER');
        expect(prompt).not.toContain('UNRELATED_REPORT_MARKER'); expect(prompt).not.toContain('LIVE_DEFINITION_NAME');
        expect(prompt).not.toContain('LIVE_DEFINITION_OBJECTIVE'); expect(prompt).toContain('重新评测');
        if (kind === 'practice') expect(prompt).toContain(original.objective);
        ai.client = null;
        const fallback = (await post(`/assistant/sessions/${session.id}/messages`, { message: '现在应该怎样继续？', requestKey: `frozen-${kind}-fallback` }).expect(201)).body.data;
        expect(fallback.reply).toContain('重新评测');
        ai.client = { chat: { completions: { create: async (command: any) => {
          prompt = JSON.stringify(command.messages);
          return { choices: [{ message: { content: JSON.stringify({ reply: '请对照当时的条件说明思路，并按当前范围重新评测。', evidenceIds: [] }) } }] };
        } } } };
      }
    } finally { ai.client = null; }
  });
});

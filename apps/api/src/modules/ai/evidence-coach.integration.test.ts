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
    .set('Authorization', `Bearer ${account.token}`).send(body);

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
});

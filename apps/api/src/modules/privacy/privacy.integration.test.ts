import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

describe('guardian-controlled portable learning data and permanent deletion', () => {
  let app: any, store: any, auth: any, parent: any, other: any, child: any, sibling: any;
  const credential = 'privacy-fixture-secret';
  beforeAll(async () => {
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { AuthService } = require('../../../dist/apps/api/src/modules/auth/auth.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(InMemoryStoreService); auth = app.get(AuthService);
  });
  beforeEach(async () => {
    store.reset();
    parent = await auth.register({ principal: 'privacy-parent@test', credential }, 'privacy-fixture');
    other = await auth.register({ principal: 'privacy-other@test', credential }, 'privacy-other');
    async function create(nickname: string) { return (await call('post', '/students', { nickname, grade: 3, preferredSessionMinutes: 15,
      defaultVersionMap: { math: 'original', chinese: '', english: '' } })).profile; }
    child = await create('小禾'); sibling = await create('小麦');
    for (const profile of [child, sibling]) {
      const tag = profile.id;
      store.learningScopes.push({ id: `${tag}-scope`, studentId: tag, subject: 'math', version: 1 });
      store.diagnosticSessions.push({ id: `${tag}-diagnostic`, studentId: tag, subject: 'math', status: 'completed' });
      store.diagnosticResponses.push({ id: `${tag}-response`, studentId: tag, sessionId: `${tag}-diagnostic`, answer: { value: '原始作答' }, score: 0.5 });
      store.diagnosticDrafts.push({ id: `${tag}-draft`, sessionId: `${tag}-diagnostic`, answer: { value: '原始草稿' } });
      store.diagnosticHints.push({ id: `${tag}-hint`, sessionId: `${tag}-diagnostic`, level: 1 });
      store.scoringRevisions.push({ id: `${tag}-scoring`, responseId: `${tag}-response`, score: 0.75, version: 1, requestHash: 'private-grading-digest' });
      store.diagnosticReports.push({ id: `${tag}-report`, sessionId: `${tag}-diagnostic`, version: 1, report: { studentId: tag, summary: '保留不确定性' } });
      store.diagnosticPlans.push({ id: `${tag}-plan`, studentId: tag, baselineSessionId: `${tag}-diagnostic`, actions: [], summary: '先观察再验证' });
      store.guidancePlanRevisions.push({ id: `${tag}-plan-v1`, planId: `${tag}-plan`, actorId: parent.user.id, snapshot: { studentId: tag, retrospectiveReview: { actorId: parent.user.id } } });
      store.reviewTasks.push({ id: `${tag}-review`, studentId: tag, planId: `${tag}-plan`, status: 'pending' });
      store.practiceSessions.push({ id: `${tag}-practice`, studentId: tag, planId: `${tag}-plan`, drafts: { q: { answer: { value: '训练草稿' } } } });
      store.practiceAttempts.push({ id: `${tag}-attempt`, sessionId: `${tag}-practice`, answer: { value: '独立训练作答' }, score: 1 });
      store.practiceHints.push({ id: `${tag}-practice-hint`, sessionId: `${tag}-practice`, level: 1 });
      store.mistakeNotebookEntries.push({ id: `${tag}-notebook`, studentId: tag, responseId: `${tag}-response`,
        metadata: { reflection: '保留的错题步骤便签', tags: ['关系对应'] },
        history: [{ actorId: parent.user.id, requestKey: 'private-notebook-request', inputHash: 'private-notebook-digest' }] });
      store.practiceScoringRevisions.push({ id: `${tag}-practice-scoring`, responseId: `${tag}-attempt`, score: 1, version: 1 });
      store.evidenceFeedback.push({ id: `${tag}-feedback`, studentId: tag, responseId: `${tag}-response`, message: '请核对表达', history: [{ actorId: parent.user.id }] });
      store.events.push({ eventId: `${tag}-score-event`, eventName: 'diagnostic.score_reviewed', payload: { responseId: `${tag}-response` } });
      store.assistantSessions.push({ id: `${tag}-chat-own`, ownerUserId: parent.user.id, studentId: tag, scopeKey: 'private-scope' });
      store.assistantMessages.push({ id: `${tag}-chat-own-message`, sessionId: `${tag}-chat-own`, content: '本人私有对话' });
      store.assistantSessions.push({ id: `${tag}-chat-other`, ownerUserId: other.user.id, studentId: tag });
      store.assistantMessages.push({ id: `${tag}-chat-other-message`, sessionId: `${tag}-chat-other`, content: '另一监护人的私有对话' });
      store.aiInsights.push({ id: `${tag}-other-insight`, sourceType: 'assistant', sourceId: `${tag}-chat-other`, studentId: tag, summary: '另一监护人的AI摘要' });
      store.gespLearningScopes.push({ id: `${tag}-gesp-scope`, studentId: tag, level: 1, atomIds: ['gesp-cpp.l1.io'],
        status: 'active', version: 1, confirmedByUserId: parent.user.id, confirmedAt: '2026-10-21T00:00:00.000Z',
        updatedAt: '2026-10-21T00:00:00.000Z', requestKey: 'private-gesp-scope-request', reason: '家庭私有编程范围' } as any);
      store.gespLearningScopeRevisions.push({ ...store.gespLearningScopes.at(-1), id: `${tag}-gesp-scope-v1`, scopeId: `${tag}-gesp-scope` } as any);
      store.gespCodeSubmissions.push({ id: `${tag}-gesp-code`, studentId: tag, atomId: 'gesp-cpp.l1.io', taskId: 'gesp-student-cpp-sum-two',
        sourceSha256: 'private-source-hash', status: 'passed', createdAt: '2026-10-21T00:00:00.000Z', toolchain: 'test', compilePassed: true,
        requestKey: 'private-gesp-code-request', source: 'int main(){ /* private source */ }', compileDiagnostics: [], runtimeDiagnostics: [],
        tests: [{ index: 0, passed: true, status: 'passed', exitCode: 0, durationMs: 1 }], hintEventId: null, hintLevel: 0,
        independent: true, reviewTaskId: null } as any);
      store.gespProbeSubmissions.push({ id: `${tag}-gesp-probe`, studentId: tag, atomId: 'gesp-cpp.l1.io', taskId: 'gesp-student-cpp-sum-two',
        probeId: 'gesp-student-cpp-sum-two-concept', dimension: 'understanding', status: 'correct', requestKey: 'private-probe-request',
        answer: '家庭私有探针回答', createdAt: '2026-10-21T00:00:00.000Z', analysis: '独立理解证据' });
      store.gespHintEvents.push({ id: `${tag}-gesp-hint`, studentId: tag, atomId: 'gesp-cpp.l1.io', taskId: 'gesp-student-cpp-sum-two',
        level: 1, text: '家庭私有提示记录', revealsAnswer: false, requestKey: 'private-hint-request', createdAt: '2026-10-21T00:00:00.000Z' });
      store.gespGuidancePlans.push({ id: `${tag}-gesp-plan`, studentId: tag, scopeVersion: 1, evidenceFingerprint: 'private-gesp-fingerprint',
        source: 'rules', status: 'active', version: 2, minutesPerDay: 20, requestKey: 'private-plan-request', reason: '家庭私有计划原因',
        createdAt: '2026-10-21T00:00:00.000Z', updatedAt: '2026-10-21T00:00:00.000Z', createdByUserId: parent.user.id,
        decidedByUserId: parent.user.id, decidedAt: '2026-10-21T00:00:00.000Z', actions: [] });
      store.gespGuidancePlanRevisions.push({ ...store.gespGuidancePlans.at(-1), id: `${tag}-gesp-plan-v2`, planId: `${tag}-gesp-plan`,
        requestKey: 'private-plan-decision' });
      store.gespReviewTasks.push({ id: `${tag}-gesp-review`, studentId: tag, atomId: 'gesp-cpp.l1.io', taskId: 'gesp-student-cpp-sum-two',
        sourceSubmissionId: `${tag}-gesp-code`, stageDay: 1, dueAt: '2026-10-22T00:00:00.000Z', createdAt: '2026-10-21T00:00:00.000Z',
        status: 'scheduled', testPackSha256: 'private-test-pack-hash', attemptCount: 0, lastSubmissionId: null, lastStatus: null,
        completedSubmissionId: null, completedAt: null });
      store.events.push({ eventId: `${tag}-gesp-event`, eventName: 'gesp.plan_updated', payload: { planId: `${tag}-gesp-plan`,
        hintId: `${tag}-gesp-hint` } });
    }
    store.knowledgeAtoms.push({ id: 'shared-curriculum', name: '不随家庭删除的共享课程' });
    store.libraryBookmarks.push({ id: 'own-bookmark', userId: parent.user.id, paperId: 'shared-paper' }, { id: 'other-bookmark', userId: other.user.id, paperId: 'shared-paper' });
  });
  afterAll(async () => { await app.close(); });
  async function call(method: 'get' | 'post', path: string, body?: unknown, actor = parent, expected = method === 'post' ? 201 : 200) {
    let q = request(app.getHttpServer())[method]('/api' + path); if (actor?.token) q = q.set('Authorization', `Bearer ${actor.token}`);
    if (body !== undefined) q = q.send(body as object); return (await q.expect(expected)).body.data;
  }
  async function learner(actor = parent, requestKey = 'privacy-learning-code') {
    if (!store.studentLearningAccess.length) await call('post', `/students/${child.id}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: 'privacy-enable', reason: '核对资料导出与删除后的独立学习权限。' });
    const code = await call('post', `/students/${child.id}/learning-access/codes`, { expectedVersion: 1, requestKey }, actor);
    return call('post', '/auth/learning-code', { code: code.code }, null);
  }
  async function sharedChild() {
    const invite = await call('post', `/students/${child.id}/invitations`, { recipientPrincipal: other.user.principal });
    await call('post', `/parents/${other.user.id}/bindings`, { studentId: child.id, inviteToken: invite.token }, other);
  }
  const command = (preview: any, requestKey: string) => ({ credential, requestKey, confirmation: preview.confirmation, fingerprint: preview.fingerprint });

  it('exports owned raw evidence and revisions, excludes secrets and other private conversations, and replays one committed snapshot', async () => {
    const student = await learner();
    await call('get', '/privacy/overview', undefined, null, 401);
    await call('post', `/privacy/students/${child.id}/export`, { credential, requestKey: 'foreign-export' }, other, 404);
    await call('post', `/privacy/students/${child.id}/export`, { credential, requestKey: 'student-export' }, student, 403);
    const body = { credential, requestKey: 'first-export' };
    const data = await call('post', `/privacy/students/${child.id}/export`, body);
    expect(data.format).toBe('study-agent-family-export-v1'); expect(data.students).toHaveLength(1);
    const records = data.students[0].records;
    expect(records.diagnosticResponses[0].answer).toEqual({ value: '原始作答' }); expect(records.scoringRevisions[0].version).toBe(1);
    expect(records.practiceSessions[0].drafts.q.answer).toEqual({ value: '训练草稿' });
    expect(records.mistakeNotebookEntries[0].metadata.reflection).toBe('保留的错题步骤便签');
    expect(records.gespCodeSubmissions[0].source).toContain('private source');
    expect(records.gespHintEvents[0].text).toBe('家庭私有提示记录');
    expect(records.gespGuidancePlans[0].reason).toBe('家庭私有计划原因');
    expect(records.gespGuidancePlanRevisions[0].planId).toBe(`${child.id}-gesp-plan`);
    expect(records.gespReviewTasks[0].stageDay).toBe(1);
    const serialized = JSON.stringify(data);
    for (const secret of ['passwordHash', 'tokenHash', 'private-grading-digest', 'private-notebook-request', 'private-notebook-digest', 'private-scope', 'private-gesp-scope-request', 'private-gesp-code-request', 'private-probe-request', 'private-hint-request', 'private-plan-request', 'private-plan-decision', '另一监护人的私有对话', '另一监护人的AI摘要', sibling.id, credential, student.token]) expect(serialized).not.toContain(secret);
    expect(await call('post', `/privacy/students/${child.id}/export`, body)).toEqual(data);
    expect(store.privacyRequests).toHaveLength(1);
    await call('post', '/privacy/account/export', body, parent, 409);
    store.diagnosticResponses[0].score = 0.9;
    await call('post', `/privacy/students/${child.id}/export`, body, parent, 409);
    const account = await call('post', '/privacy/account/export', { credential, requestKey: 'complete-account-export' });
    expect(account.students).toHaveLength(2); expect(account.accountRecords.libraryBookmarks.map((row: any) => row.id)).toEqual(['own-bookmark']);
  });

  it('requires the current password, exact confirmation and an unchanged preview before destructive work', async () => {
    const preview = await call('get', `/privacy/students/${child.id}/deletion-preview`);
    const before = JSON.stringify(store.students);
    await call('post', `/privacy/students/${child.id}/delete`, { ...command(preview, 'bad-password'), credential: 'wrong-password-123' }, parent, 401);
    await call('post', `/privacy/students/${child.id}/delete`, { ...command(preview, 'bad-confirmation'), confirmation: '另一个孩子' }, parent, 400);
    expect(JSON.stringify(store.students)).toBe(before); expect(store.privacyRequests).toHaveLength(0);
    store.diagnosticResponses.push({ id: 'new-response', studentId: child.id, sessionId: `${child.id}-diagnostic`, answer: '新增证据' });
    await call('post', `/privacy/students/${child.id}/delete`, command(preview, 'stale-preview'), parent, 409);
    expect(JSON.stringify(store.students)).toBe(before); expect(store.privacyRequests).toHaveLength(0);
  });

  it('keeps family exports and deletion unavailable to teaching and administration identities', async () => {
    for (const role of ['teacher', 'operator', 'admin']) {
      store.users.find((row: any) => row.id === other.user.id).role = role;
      await call('get', '/privacy/overview', undefined, other, 403);
      await call('post', `/privacy/students/${child.id}/export`, { credential, requestKey: `role-export-${role}` }, other, 403);
    }
    expect(store.students).toHaveLength(2); expect(store.privacyRequests).toHaveLength(0);
  });

  it('deletes a full linked child history and learning access once while preserving siblings, parent identity and shared content', async () => {
    const student = await learner(); const preview = await call('get', `/privacy/students/${child.id}/deletion-preview`);
    const receipt = await call('post', `/privacy/students/${child.id}/delete`, command(preview, 'delete-child-once'));
    expect(receipt.kind).toBe('student_delete'); expect(receipt.counts.observations).toBe(2);
    expect(await call('post', `/privacy/students/${child.id}/delete`, command(preview, 'delete-child-once'))).toEqual(receipt);
    expect(store.privacyRequests).toHaveLength(1);
    await call('get', '/auth/me', undefined, student, 401); await call('get', '/auth/me');
    for (const name of ['students', 'diagnosticSessions', 'diagnosticResponses', 'scoringRevisions', 'diagnosticDrafts', 'diagnosticReports', 'guidancePlanRevisions', 'reviewTasks', 'practiceAttempts', 'practiceHints', 'practiceScoringRevisions', 'mistakeNotebookEntries', 'assistantSessions', 'assistantMessages', 'evidenceFeedback', 'gespLearningScopes', 'gespLearningScopeRevisions', 'gespCodeSubmissions', 'gespProbeSubmissions', 'gespHintEvents', 'gespGuidancePlans', 'gespGuidancePlanRevisions', 'gespReviewTasks']) {
      expect(JSON.stringify(store[name])).not.toContain(child.id); expect(JSON.stringify(store[name])).toContain(sibling.id);
    }
    expect(store.studentLearningAccess).toHaveLength(0); expect(store.studentLearningCodes).toHaveLength(0);
    expect(store.events.some((row: any) => row.eventId === `${child.id}-score-event`)).toBe(false);
    expect(store.knowledgeAtoms[0].id).toBe('shared-curriculum'); expect(store.users.some((row: any) => row.id === parent.user.id)).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain(child.nickname); expect(JSON.stringify(receipt)).not.toContain(child.id);
  });

  it('rejects unilateral shared-child deletion and closes a parent account without erasing another guardian learning history or access', async () => {
    await sharedChild(); const ownStudent = await learner(); const otherStudent = await learner(other, 'other-guardian-code');
    const childPreview = await call('get', `/privacy/students/${child.id}/deletion-preview`);
    expect(childPreview.canDelete).toBe(false);
    await call('post', `/privacy/students/${child.id}/delete`, command(childPreview, 'shared-delete-denied'), parent, 409);
    const preview = await call('get', '/privacy/account/deletion-preview');
    expect(preview.deletedChildren.map((row: any) => row.id)).toEqual([sibling.id]); expect(preview.retainedChildren.map((row: any) => row.id)).toEqual([child.id]);
    const receipt = await call('post', '/privacy/account/delete', command(preview, 'close-account-once'));
    expect(receipt.kind).toBe('account_delete');
    await call('get', '/auth/me', undefined, parent, 401); await call('get', '/auth/me', undefined, ownStudent, 401);
    await call('get', '/auth/me', undefined, otherStudent); await call('get', `/students/${child.id}/profile`, undefined, other);
    expect(store.students.map((row: any) => row.id)).toEqual([child.id]); expect(store.users.some((row: any) => row.id === parent.user.id)).toBe(false);
    expect(store.bindings.every((row: any) => row.parentUserId !== parent.user.id)).toBe(true);
    expect(store.assistantMessages.map((row: any) => row.content)).toEqual(['另一监护人的私有对话']);
    expect(store.libraryBookmarks.map((row: any) => row.id)).toEqual(['other-bookmark']);
    expect(store.diagnosticResponses[0].answer).toEqual({ value: '原始作答' });
    expect(store.guidancePlanRevisions[0].actorId).toBe('deleted-account'); expect(store.guidancePlanRevisions[0].snapshot.retrospectiveReview.actorId).toBe('deleted-account');
    expect(store.gespLearningScopes.every((row: any) => row.confirmedByUserId === 'deleted-account')).toBe(true);
    expect(store.gespCodeSubmissions.every((row: any) => row.studentId === child.id)).toBe(true);
    expect(store.gespCodeSubmissions.some((row: any) => row.studentId === sibling.id)).toBe(false);
    expect(store.events.filter((row: any) => row.eventName === 'privacy.deletion_completed')).toHaveLength(1);
  });
});

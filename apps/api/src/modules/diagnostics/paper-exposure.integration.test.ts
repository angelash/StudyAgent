import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

describe('original-paper exposure remains separate from independent assessment evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'study-paper-exposure-'));
  const keys = ['STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_SEED_FOUNDATION', 'STUDY_WORKER_ENABLED'] as const;
  const prior = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const load = (file: string) => require('../../../dist/apps/api/src/' + file + '.js');
  let app: any, store: any, owner: any, learner: any, studentId: string;
  async function call(method: 'post' | 'put', path: string, body: object, token = owner.token, expected = method === 'post' ? 201 : 200) {
    const result = await request(app.getHttpServer())[method]('/api' + path).set('Authorization', 'Bearer ' + token).send(body);
    expect(result.status, result.body.error?.message).toBe(expected); return result.body.data;
  }
  beforeAll(async () => {
    Object.assign(process.env, { STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: root, STUDY_SEED_FOUNDATION: 'false', STUDY_WORKER_ENABLED: 'false' });
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
  });
  beforeEach(async () => {
    await store.transaction(() => store.reset());
    owner = await call('post', '/auth/register', { principal: 'exposure-parent-' + randomUUID(), credential: 'Synthetic-exposure-only-20261027' }, '');
    learner = await call('post', '/auth/register', { principal: 'exposure-student-' + randomUUID(), credential: 'Synthetic-exposure-only-20261027' }, '');
    studentId = (await call('post', '/students', { nickname: '合成来源曝光', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile.id;
    await store.transaction(() => {
      store.find('users', { id: learner.user.id }).role = 'student';
      store.find('students', { id: studentId }).userId = learner.user.id;
      store.append('knowledgeAtoms', { id: 'paper-target', subject: 'math', name: '合成加法', strand: 'QA', grade: 3, term: 'both', objective: '独立合并两个量', successCriterion: '独立完成不同题族', prerequisiteIds: [], curriculumVersion: 'QA', status: 'published', version: 1 });
      for (let i = 0; i < 4; i++) {
        const questionId = 'exposure-q-' + i;
        store.append('questions', { id: questionId, subject: 'math', type: 'objective', stem: '合成原题' + i + '：3+3=?', answer: 6, analysis: '两个3合并', difficultyLevel: 1, knowledgePointIds: [], status: 'published' });
        store.append('questionAnswerSchemas', { questionId, mode: 'numeric_blank', responseShape: { value: 'number' }, validationRules: {}, gradingConfig: {} });
        store.append('questionSources', { questionId, sourceType: 'internal_authoring', sourceName: '独立合成原题', sourcePathOrUrl: '', licenseClass: 'A_INTERNAL', licenseName: 'QA', importJobId: null, reviewStatus: 'approved', notes: null });
        store.append('measurementItems', { id: 'exposure-map-' + i, questionId, questionVersion: 1, atomId: 'paper-target', dimension: 'procedure', family: 'exposure-independent-family-' + i, probeRole: 'anchor', expectedSeconds: 15, difficulty: 1, reviewStatus: 'approved', mappingWeight: 1, observationCode: 'step_mismatch', version: 1 });
        // Synthetic already-reviewed packets isolate selection from the separate five-gate authoring journey.
        store.append('measurementCandidates', { id: 'exposure-candidate-' + i, paperId: 'qa-source-paper', position: i + 1, sourceQuestionId: 'paper:original-' + i, sourceHash: 'different-original-packet-hash-' + i, paperTitle: '合成来源', sourceGrade: '三年级', sourceSubject: '数学', original: {}, promptMedia: [], createdAt: new Date().toISOString(), createdBy: owner.user.id, version: 1, status: 'published', draft: null, draftHash: null, atomFingerprints: {}, reviews: {}, history: [], questionId, mappingId: 'exposure-map-' + i, publishedHash: load('modules/diagnostics/measurement-definition').questionContentFingerprint(store, questionId) });
      }
    });
    await call('put', '/students/' + studentId + '/learning-scope', { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null, textbookVersion: '合成原创', learnedAtomIds: ['paper-target'], currentAtomId: 'paper-target', minutesPerSession: 15 });
  });
  afterAll(async () => {
    await app?.close(); for (const key of keys) if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key];
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw Error('Unknown synthetic temporary directory'); rmSync(root, { recursive: true, force: true });
  });
  async function paper(actorId: string, sourceQuestionId = 'paper:original-0') {
    await store.transaction(() => store.append('paperPracticeSessions', { id: 'exposure-practice', ownerUserId: actorId, studentId, requestKey: randomUUID(), inputHash: 'qa', sourceHash: 'paper-detail-hash-is-not-candidate-hash', status: 'completed', version: 1, currentItemId: 'exposure-paper-item', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: new Date().toISOString(), sources: [], items: [{ id: 'exposure-paper-item', paperId: 'qa-source-paper', position: 1, sourceQuestionId, kind: 'question', html: '<p>3+3=?</p>', options: [], answerHtml: '6', analysisHtml: '', hasAnswer: true, pdfUrl: null, promptMedia: [], referenceMedia: [], draft: '', firstAnswer: null, revealed: false, selfReview: null, corrections: [] }] }));
  }
  const assess = (intent = 'verification') => call('post', '/diagnostics/sessions', { studentId, subject: 'math', intent, targetAtomIds: ['paper-target'], includePrerequisites: false, maxItems: 8 });

  it('excludes a learner-selected original source from new probes even without a submitted answer or equal packet hash', async () => {
    await paper(learner.user.id); const session = await assess();
    expect(store.find('diagnosticSessions', { id: session.id }).itemSnapshots.map((item: any) => item.questionId)).not.toContain('exposure-q-0');
  });
  it('does not attribute a guardian private rehearsal to the child', async () => {
    await paper(owner.user.id); const session = await assess();
    expect(store.find('diagnosticSessions', { id: session.id }).itemSnapshots.map((item: any) => item.questionId)).toContain('exposure-q-0');
  });
  it('does not match another original identity merely because its paper and position are equal', async () => {
    await paper(learner.user.id, 'paper:different-original'); const session = await assess();
    expect(store.find('diagnosticSessions', { id: session.id }).itemSnapshots.map((item: any) => item.questionId)).toContain('exposure-q-0');
  });
  it('preserves an exposed baseline answer without counting it as independent evidence', async () => {
    await paper(learner.user.id); const session = await assess('baseline');
    expect(store.find('diagnosticSessions', { id: session.id }).exposedQuestionIds).toContain('exposure-q-0');
    await call('post', '/diagnostics/sessions/' + session.id + '/responses', { itemId: 'exposure-map-0', answer: 6, elapsedMs: 1000 });
    expect(store.find('diagnosticResponses', { sessionId: session.id, questionId: 'exposure-q-0' })).toMatchObject({ correct: true, priorExposure: true });
  });
  it('conservatively excludes an opened whole-document source and keeps unavailable independent coverage unknown', async () => {
    await paper(learner.user.id);
    await store.transaction(() => { const item = store.find('paperPracticeSessions', { id: 'exposure-practice' }).items[0]; item.kind = 'document'; item.position = 0; item.sourceQuestionId = 'original-pdf'; });
    await call('post', '/diagnostics/sessions', { studentId, subject: 'math', intent: 'verification', targetAtomIds: ['paper-target'], includePrerequisites: false, maxItems: 8 }, owner.token, 400);
    expect(store.inspect('diagnosticSessions')).toHaveLength(0);
  });
  it('rechecks a paper opened after assessment start without rewriting the frozen selection', async () => {
    const session = await assess('baseline');
    expect(store.find('diagnosticSessions', { id: session.id }).exposedQuestionIds).not.toContain('exposure-q-0');
    await paper(learner.user.id);
    await call('post', '/diagnostics/sessions/' + session.id + '/responses', { itemId: 'exposure-map-0', answer: 6, elapsedMs: 1000 });
    expect(store.find('diagnosticResponses', { sessionId: session.id, questionId: 'exposure-q-0' })).toMatchObject({ correct: true, priorExposure: true });
    expect(store.find('diagnosticSessions', { id: session.id }).exposedQuestionIds).not.toContain('exposure-q-0');
  });
});

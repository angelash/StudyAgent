import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { DomainDatabase } from '../../infrastructure/domain-database';

const configured = process.env.STUDY_TEST_PAPER_BUSINESS_POSTGRES_URL;
describe('actual private selection and learner source-read HTTP transactions on ' + (configured ? 'PostgreSQL' : 'SQLite'), () => {
  const repo = resolve(process.cwd(), '../..'), qa = join(repo, 'data/qa'); mkdirSync(qa, { recursive: true });
  const directory = mkdtempSync(join(qa, 'selection-business-')), data = join(directory, 'source');
  const names = ['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_ASSET_ROOT', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'DATABASE_URL'] as const;
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const assets = require(join(repo, 'scripts/qa/paper-practice-fixture.cjs')).preparePaperPracticeAssets(directory, repo);
  const credential = 'synthetic-selection-business-only', key = () => randomUUID(), load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  let app: any, store: any, administrator: any, index = 0;
  async function boot() {
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
  }
  async function api(actor: any, method: 'get' | 'post', path: string, body?: unknown, status = method === 'post' ? 201 : 200) {
    let call = request(app.getHttpServer())[method]('/api' + path); if (actor) call = call.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) call = call.send(body as object); const response = await call;
    expect(response.status, JSON.stringify(response.body.error)).toBe(status); return response.body.data;
  }
  const register = () => api(null, 'post', '/auth/register', { principal: 'selection-' + key(), credential });
  async function paper(actor: any, kind: 'complete' | 'partial' | 'pdf' = 'complete', publish = true) {
    const id = 'qa:paper:' + index++ + ':' + kind;
    if (publish) await api(administrator, 'post', '/library/papers/' + id + '/publication', {
      status: 'published', licenseEvidence: '仅用于工程测试的原创合成题卷及媒体', contentReviewed: true, mediaReviewed: true, reason: '合成来源的当前发布版本验证',
    });
    return api(actor, 'get', '/library/papers/' + id + '/metadata');
  }
  const create = (metadata: any, scope = { kind: 'private_preparation', studentId: null } as any) => ({
    kind: 'create', requestKey: key(), scope, title: '  完整原始清单标题  ', items: metadata.positions.slice(0, 1),
  });
  const read = (metadata: any) => ({ kind: 'read', requestKey: key(), paperId: metadata.paperId, detailSha256: metadata.detailSha256,
    publicationVersion: metadata.publicationVersion, positions: metadata.document ? 'document' : metadata.positions.map(({ position, sourceQuestionId }: any) => ({ position, sourceQuestionId })),
    answers: metadata.document, origin: null });
  async function learner() {
    const parent = await register(), child = (await api(parent, 'post', '/students', { nickname: '匿名工程学生', grade: 3, preferredSessionMinutes: 15,
      defaultVersionMap: { math: 'synthetic', chinese: '', english: '' } })).profile;
    await api(parent, 'post', '/students/' + child.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: key(), reason: '仅用于隔离工程验证的本人来源权限。' });
    const code = await api(parent, 'post', '/students/' + child.id + '/learning-access/codes', { expectedVersion: 1, requestKey: key() });
    const actor = await api(null, 'post', '/auth/learning-code', { code: code.code }); return { parent, child, actor, scope: { kind: 'student_self', studentId: child.id } };
  }
  async function cold() { const db = new DomainDatabase(configured ?? join(data, 'study-agent.sqlite3')); await db.open(); try { return await db.read(); } finally { await db.close(); } }
  const projection = (state: any) => Object.fromEntries(['paperSelectionLists', 'paperSelectionCommands', 'paperSourceExposures'].map(name => [name, state[name] ?? []]));
  beforeAll(async () => {
    if (configured) { const target = new URL(configured); if (target.hostname !== '127.0.0.1' || target.port !== '15444' || target.pathname !== '/study_paper_business') throw Error('Owned paper business PostgreSQL fixture required'); }
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: configured ? 'postgres' : 'sqlite', STUDY_DATA_DIR: data, STUDY_ASSET_ROOT: assets, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false' });
    if (configured) process.env.DATABASE_URL = configured; else delete process.env.DATABASE_URL; await boot(); administrator = await register();
    await store.transaction(() => { store.find('users', { id: administrator.user.id }).role = 'admin'; });
  });
  afterAll(async () => { await app?.close(); for (const name of names) { if (prior[name] === undefined) delete process.env[name]; else process.env[name] = prior[name]; } });

  it('returns only source identities from metadata and does not write an exposure or business revision on GET', async () => {
    const actor = await register(), metadata = await paper(actor), before = await cold();
    const again = await api(actor, 'get', '/library/papers/' + metadata.paperId + '/metadata'); expect(again).toEqual(metadata);
    expect(JSON.stringify(again)).not.toMatch(/prompt|answer|analysis|https:|合成原题|合成原参考/);
    expect(again.positions[0].sourceQuestionId).toBe('paper:one'); const after = await cold();
    expect(after.revision).toBe(before.revision); expect(projection(after.state)).toEqual(projection(before.state));
  });
  it('commits exact parent originals, reads original receipts and keeps other accounts outside the private list', async () => {
    const actor = await register(), other = await register(), metadata = await paper(actor), input = create(metadata), saved = await api(actor, 'post', '/library/selection-commands', input);
    const original = await api(actor, 'get', '/library/selection-commands/' + encodeURIComponent(input.requestKey)); expect(original.input).toEqual(input); expect(original.result).toEqual(saved);
    expect(original.current.title).toBe(input.title); expect(original.current.items[0].availability.available).toBe(true);
    expect((await api(actor, 'get', '/library/selection-lists')).items.map((row: any) => row.id)).toContain(saved.listId);
    await api(other, 'get', '/library/selection-lists/' + saved.listId, undefined, 404);
    expect(await api(other, 'get', '/library/selection-commands/' + encodeURIComponent(input.requestKey))).toBeNull();
    const stored = await cold(); expect((stored.state.paperSourceExposures ?? []).some((row: any) => row.actorId === actor.user.id)).toBe(false);
  });
  it('returns the exact old receipt after a later clear and rejects same-key different full commands without writes', async () => {
    const actor = await register(), input = create(await paper(actor)), saved = await api(actor, 'post', '/library/selection-commands', input);
    const revise = { kind: 'revise', requestKey: key(), listId: saved.listId, expectedRevision: saved.revision, expectedFingerprint: saved.fingerprint, title: '明确清空后的标题', items: [] };
    await api(actor, 'post', '/library/selection-commands', revise); const before = await cold();
    expect(await api(actor, 'post', '/library/selection-commands', input)).toEqual(saved);
    await api(actor, 'post', '/library/selection-commands', { ...input, title: '另一个完整输入' }, 409);
    const old = await api(actor, 'get', '/library/selection-commands/' + input.requestKey); expect(old.result.revision).toBe(1); expect(old.current.revision).toBe(2); expect(old.current.items).toHaveLength(0);
    expect(projection((await cold()).state)).toEqual(projection(before.state));
  });
  it('keeps exactly one winner from two real concurrent revisions and rolls the losing command back', async () => {
    const actor = await register(), saved = await api(actor, 'post', '/library/selection-commands', create(await paper(actor)));
    const input = { kind: 'revise', listId: saved.listId, expectedRevision: saved.revision, expectedFingerprint: saved.fingerprint, items: [] };
    const commands = [{ ...input, requestKey: key(), title: '第一份完整稿' }, { ...input, requestKey: key(), title: '第二份完整稿' }];
    const responses = await Promise.all(commands.map(body => request(app.getHttpServer()).post('/api/library/selection-commands').set('Authorization', 'Bearer ' + actor.token).send(body)));
    expect(responses.map(row => row.status).sort()).toEqual([201, 409]);
    const state = (await cold()).state, list = (state.paperSelectionLists as any[]).find(row => row.id === saved.listId)!;
    expect(list.history).toHaveLength(2); expect(state.paperSelectionCommands!.filter((row: any) => row.actorId === actor.user.id)).toHaveLength(2);
    const loser = commands[responses.findIndex(row => row.status === 409)]; expect(await api(actor, 'get', '/library/selection-commands/' + loser.requestKey)).toBeNull();
  });
  it('requires exact qualified slots and rejects missing placeholders and untrusted client fields', async () => {
    const actor = await register(), metadata = await paper(actor, 'partial'), input = create(metadata), before = await cold();
    await api(actor, 'post', '/library/selection-commands', { ...input, items: [{ ...input.items[0], sourceQuestionId: 'one' }] }, 400);
    await api(actor, 'post', '/library/selection-commands', { ...input, items: [{ ...input.items[0], position: 3, sourceQuestionId: 'paper:missing' }] }, 409);
    await api(actor, 'post', '/library/selection-commands', { ...input, clientBody: '不能写入替代正文' }, 400);
    expect(projection((await cold()).state)).toEqual(projection(before.state));
  });
  it('detects actual archive-byte changes, preserves an old list and recovers its old receipt without silently refreezing', async () => {
    const actor = await register(), metadata = await paper(actor), input = create(metadata), saved = await api(actor, 'post', '/library/selection-commands', input);
    const archive = new DatabaseSync(join(assets, 'shijuanbao/archive.sqlite3')), original = archive.prepare('SELECT detail FROM papers WHERE key=?').get(metadata.paperId)!.detail as string;
    try {
      archive.prepare('UPDATE papers SET detail=? WHERE key=?').run(original + ' ', metadata.paperId);
      await api(actor, 'post', '/library/selection-commands', { ...input, requestKey: key() }, 409);
      expect((await api(actor, 'get', '/library/selection-lists/' + saved.listId)).items[0].availability.available).toBe(false);
      expect(await api(actor, 'post', '/library/selection-commands', input)).toEqual(saved);
    } finally { archive.prepare('UPDATE papers SET detail=? WHERE key=?').run(original, metadata.paperId); archive.close(); }
  });
  it('keeps unpublished research limited to current privileged private preparation', async () => {
    const metadata = await paper(administrator, 'complete', false), saved = await api(administrator, 'post', '/library/selection-commands', create(metadata));
    expect((await api(administrator, 'get', '/library/selection-lists/' + saved.listId)).items[0].research).toBe(true);
    const actor = await register(); await api(actor, 'post', '/library/selection-commands', create(metadata), 403);
  });
  it('saves learner lists and exact per-paper exposures atomically while refusing private or another child scope', async () => {
    const f = await learner(), metadata = await paper(f.actor), input = create(metadata, f.scope), saved = await api(f.actor, 'post', '/library/selection-commands', input);
    const state = (await cold()).state, exposure = state.paperSourceExposures!.find((row: any) => row.actorId === f.actor.user.id) as any;
    expect(exposure.input.origin.kind).toBe('selection_command'); expect(exposure.result.sources).toHaveLength(1); expect(exposure.result.sources[0].sourceQuestionId).toBe('paper:one');
    expect(exposure.studentId).toBe(f.child.id); expect(exposure.authorization.learningAccess.guardianId).toBe(f.parent.user.id);
    await api(f.parent, 'get', '/library/selection-lists/' + saved.listId, undefined, 404);
    await api(f.parent, 'post', '/library/selection-commands', { ...input, requestKey: key() }, 403);
    await api(f.actor, 'post', '/library/selection-commands', { ...input, requestKey: key(), scope: { kind: 'private_preparation', studentId: null } }, 403);
    await api(f.actor, 'post', '/library/selection-commands', { ...input, requestKey: key(), scope: { kind: 'student_self', studentId: 'other-child' } }, 403);
  });
  it('records explicit learner reads with full original input/result and refuses fabricated selection origins', async () => {
    const f = await learner(), metadata = await paper(f.actor), input = read(metadata), saved = await api(f.actor, 'post', '/library/source-reads', input);
    expect(await api(f.actor, 'get', '/library/source-reads/' + input.requestKey)).toEqual({ input, result: saved });
    expect(await api(f.actor, 'post', '/library/source-reads', input)).toEqual(saved);
    await api(f.actor, 'post', '/library/source-reads', { ...input, answers: true }, 409);
    await api(f.actor, 'post', '/library/source-reads', { ...input, requestKey: key(), kind: 'selection', origin: { kind: 'selection_command', id: 'fabricated' } }, 403);
    await api(f.parent, 'post', '/library/source-reads', input, 403);
    expect((await cold()).state.paperSourceExposures!.filter((row: any) => row.actorId === f.actor.user.id)).toHaveLength(1);
  });
  it('blocks new learner content during an actual persisted diagnostic guard but allows clear, metadata and original recovery', async () => {
    const f = await learner(), metadata = await paper(f.actor), input = create(metadata, f.scope), saved = await api(f.actor, 'post', '/library/selection-commands', input), originalRead = read(metadata);
    const receipt = await api(f.actor, 'post', '/library/source-reads', originalRead);
    await store.transaction(() => store.append('diagnosticSessions', { id: 'synthetic-diagnostic-' + key(), studentId: f.child.id, status: 'in_progress', startedAt: new Date().toISOString() }));
    const before = await cold(); await api(f.actor, 'post', '/library/selection-commands', { ...input, requestKey: key() }, 409);
    await api(f.actor, 'post', '/library/source-reads', { ...originalRead, requestKey: key() }, 409);
    expect(await api(f.actor, 'post', '/library/selection-commands', input)).toEqual(saved); expect(await api(f.actor, 'post', '/library/source-reads', originalRead)).toEqual(receipt);
    await api(f.actor, 'get', '/library/papers/' + metadata.paperId + '/metadata'); expect(projection((await cold()).state)).toEqual(projection(before.state));
    const cleared = await api(f.actor, 'post', '/library/selection-commands', { kind: 'revise', requestKey: key(), listId: saved.listId, expectedRevision: 1, expectedFingerprint: saved.fingerprint, title: input.title, items: [] });
    expect(cleared.revision).toBe(2); expect((await api(f.actor, 'get', '/library/selection-lists/' + saved.listId)).items).toHaveLength(0);
  });
  it('excludes exact source identities from measurement without confusing packet hashes or treating parent preparation as learner exposure', async () => {
    const f = await learner(), metadata = await paper(f.actor), input = read(metadata); input.positions = input.positions.slice(0, 1);
    const candidates = [{ id: key(), paperId: metadata.paperId, position: 1, sourceQuestionId: 'paper:one', questionId: 'source-match-' + key(), sourceHash: 'different-packet-hash' },
      { id: key(), paperId: metadata.paperId, position: 2, sourceQuestionId: 'paper:two', questionId: 'unread-' + key(), sourceHash: 'different-packet-hash' }];
    await store.transaction(() => candidates.forEach(row => store.append('measurementCandidates', row)));
    const exposed = () => store.requestContext(() => [...load('modules/diagnostics/paper-exposure').originalPaperExposure(store, f.child.id)]);
    await api(f.parent, 'post', '/library/selection-commands', create(metadata)); expect(await exposed()).toEqual([]);
    await api(f.actor, 'post', '/library/source-reads', input); expect(await exposed()).toEqual([candidates[0].questionId]);
  });
  it('uses an explicit whole-document exposure for PDF, excludes its complete provenance and rejects an answer-free document claim', async () => {
    const f = await learner(), metadata = await paper(f.actor, 'pdf'), input = read(metadata);
    await api(f.actor, 'post', '/library/source-reads', { ...input, answers: false }, 400);
    const result = await api(f.actor, 'post', '/library/source-reads', input); expect(result.document).toBe(true); expect(result.answers).toBe(true); expect(result.sources).toEqual([]);
    const questionId = 'document-match-' + key(); await store.transaction(() => store.append('measurementCandidates', { id: key(), paperId: metadata.paperId, position: 27, sourceQuestionId: 'paper:future-mapping', questionId }));
    expect(await store.requestContext(() => [...load('modules/diagnostics/paper-exposure').originalPaperExposure(store, f.child.id)])).toContain(questionId);
  });
  it('actually omits a newly read original from a new independent diagnostic session without equal packet hashes', async () => {
    const f = await learner(), metadata = await paper(f.actor), atomId = 'selection-atom-' + key(), questionIds = Array.from({ length: 4 }, () => 'selection-probe-' + key());
    await store.transaction(() => {
      store.append('knowledgeAtoms', { id: atomId, subject: 'math', name: '工程合成加法', strand: 'QA', grade: 3, term: 'both', objective: '独立合并两个量', successCriterion: '独立完成不同题族', prerequisiteIds: [], curriculumVersion: 'QA', status: 'published', version: 1 });
      for (const [i, questionId] of questionIds.entries()) {
        const mappingId = 'selection-map-' + key();
        store.append('questions', { id: questionId, subject: 'math', type: 'objective', stem: '工程合成新题：3+3=?', answer: 6, analysis: '两个3合并', difficultyLevel: 1, knowledgePointIds: [], status: 'published' });
        store.append('questionAnswerSchemas', { questionId, mode: 'numeric_blank', responseShape: { value: 'number' }, validationRules: {}, gradingConfig: {} });
        store.append('questionSources', { questionId, sourceType: 'internal_authoring', sourceName: '工程合成来源', sourcePathOrUrl: '', licenseClass: 'A_INTERNAL', licenseName: 'QA', importJobId: null, reviewStatus: 'approved', notes: null });
        store.append('measurementItems', { id: mappingId, questionId, questionVersion: 1, atomId, dimension: 'procedure', family: 'selection-family-' + i, probeRole: 'anchor', expectedSeconds: 15, difficulty: 1, reviewStatus: 'approved', mappingWeight: 1, observationCode: 'step_mismatch', version: 1 });
        store.append('measurementCandidates', { id: key(), paperId: i === 0 ? metadata.paperId : 'different-unread-paper', position: i + 1, sourceQuestionId: i === 0 ? 'paper:one' : 'paper:unread-' + i,
          sourceHash: 'candidate-packet-is-not-the-original-detail-hash-' + i, paperTitle: '工程合成来源', sourceGrade: '三年级', sourceSubject: '数学', original: {}, promptMedia: [], createdAt: new Date().toISOString(), createdBy: administrator.user.id,
          version: 1, status: 'published', draft: null, draftHash: null, atomFingerprints: {}, reviews: {}, history: [], questionId, mappingId,
          publishedHash: load('modules/diagnostics/measurement-definition').questionContentFingerprint(store, questionId) });
      }
    });
    await request(app.getHttpServer()).put('/api/students/' + f.child.id + '/learning-scope').set('Authorization', 'Bearer ' + f.parent.token).send({ subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null,
      textbookVersion: '工程合成原创', learnedAtomIds: [atomId], currentAtomId: atomId, minutesPerSession: 15 }).expect(200);
    const reading = read(metadata); reading.positions = reading.positions.slice(0, 1); await api(f.actor, 'post', '/library/source-reads', reading);
    const session = await api(f.parent, 'post', '/diagnostics/sessions', { studentId: f.child.id, subject: 'math', intent: 'verification', targetAtomIds: [atomId], includePrerequisites: false, maxItems: 8 });
    const frozen = await store.requestContext(() => store.find('diagnosticSessions', { id: session.id }).itemSnapshots.map((row: any) => row.questionId));
    expect(frozen).not.toContain(questionIds[0]); expect(frozen).toContain(questionIds[1]);
  });
  it('rejects a new publication version while retaining the exact old command and its current unavailable projection', async () => {
    const actor = await register(), metadata = await paper(actor), input = create(metadata), saved = await api(actor, 'post', '/library/selection-commands', input);
    await api(administrator, 'post', '/library/papers/' + metadata.paperId + '/publication', { status: 'published', licenseEvidence: '仅工程合成的第二个明确发布版本', contentReviewed: true, mediaReviewed: true, reason: '真实更新发布版本用于准确来源校验' });
    await api(actor, 'post', '/library/selection-commands', { ...input, requestKey: key() }, 409);
    const old = await api(actor, 'get', '/library/selection-commands/' + input.requestKey); expect(old.result).toEqual(saved); expect(old.current.items[0].availability.available).toBe(false);
  });
  it('rejects revoked learning sessions and keeps previously recorded exposure unchanged', async () => {
    const f = await learner(), metadata = await paper(f.actor), input = read(metadata); await api(f.actor, 'post', '/library/source-reads', input);
    const before = projection((await cold()).state);
    await api(f.parent, 'post', '/students/' + f.child.id + '/learning-access', { enabled: false, expectedVersion: 1, requestKey: key(), reason: '隔离工程测试明确撤回本人学习权限。' });
    await api(f.actor, 'post', '/library/source-reads', { ...input, requestKey: key() }, 401); expect(projection((await cold()).state)).toEqual(before);
  });
  it('cold reopens the actual application and recovers original full commands, revisions and exposures byte for byte', async () => {
    const f = await learner(), metadata = await paper(f.actor), input = create(metadata, f.scope), saved = await api(f.actor, 'post', '/library/selection-commands', input), reading = read(metadata);
    await api(f.actor, 'post', '/library/source-reads', reading); const before = await cold(); await app.close(); await boot();
    expect(projection((await cold()).state)).toEqual(projection(before.state));
    expect((await api(f.actor, 'get', '/library/selection-commands/' + input.requestKey)).result).toEqual(saved);
    expect((await api(f.actor, 'get', '/library/source-reads/' + reading.requestKey)).input).toEqual(reading);
  });
});

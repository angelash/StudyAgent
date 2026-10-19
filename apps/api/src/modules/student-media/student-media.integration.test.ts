import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { mkdtempSync, mkdirSync, existsSync, rmSync, symlinkSync, unlinkSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

describe('student media ownership, frozen evidence, streaming export and durable cleanup', () => {
  let app: any, store: any, auth: any, media: any, cleanup: any, parent: any, other: any, teacher: any, session: any;
  const credential = 'media-fixture-secret', directory = mkdtempSync(join(tmpdir(), 'study-media-http-'));
  const previousRoot = process.env.STUDY_DATA_DIR;
  let png: Buffer;
  beforeAll(async () => {
    process.env.STUDY_DATA_DIR = directory;
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { AuthService } = require('../../../dist/apps/api/src/modules/auth/auth.service.js');
    const { StudentMediaService } = require('../../../dist/apps/api/src/modules/student-media/student-media.service.js');
    const { StudentMediaCleanupService } = require('../../../dist/apps/api/src/modules/student-media/student-media-cleanup.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(InMemoryStoreService); auth = app.get(AuthService); media = app.get(StudentMediaService); cleanup = app.get(StudentMediaCleanupService);
    png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#a38256' } }).png().toBuffer();
  });
  afterAll(async () => { await app?.close(); if (previousRoot === undefined) delete process.env.STUDY_DATA_DIR; else process.env.STUDY_DATA_DIR = previousRoot; rmSync(directory, { recursive: true, force: true }); });
  async function call(method: 'get' | 'post' | 'put' | 'patch', path: string, body?: unknown, actor = parent, expected = method === 'post' ? 201 : 200) {
    let q = request(app.getHttpServer())[method]('/api' + path); if (actor?.token) q = q.set('Authorization', `Bearer ${actor.token}`);
    if (body !== undefined) q = q.send(body as object); const response = await q.expect(expected); return response.body.data;
  }
  beforeEach(async () => {
    store.reset();
    parent = await auth.register({ principal: 'media-parent@test', credential }, 'media-parent');
    other = await auth.register({ principal: 'media-other@test', credential }, 'media-other');
    teacher = await auth.register({ principal: 'media-teacher@test', credential }, 'media-teacher');
    store.users.find((u: any) => u.id === teacher.user.id).role = 'teacher';
    store.students.push({ id: 'child', userId: 'child-user', nickname: '小禾', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: '', english: '' } });
    store.bindings.push({ id: 'binding', studentId: 'child', parentUserId: parent.user.id, status: 'active', relation: 'guardian' });
    store.knowledgeAtoms.push({ id: 'media-atom', subject: 'math', grade: 3, term: 'both', name: '展示思考过程', strand: '测试用表示',
      objective: '展示思考过程以供量规复核', successCriterion: '逐项核对学生提供的独立表现', prerequisiteIds: [], curriculumVersion: 'fixture', status: 'published', version: 1 });
    for (let n = 0; n < 12; n++) {
      const id = `media-q${n}`;
      store.questions.push({ id, subject: 'math', type: 'subjective', stem: `展示解题过程${n}`, answer: '依据学生原始过程逐项复核', analysis: '量规复核', difficultyLevel: 1, knowledgePointIds: [], status: 'published' });
      store.questionAnswerSchemas.push({ questionId: id, mode: 'image_upload', responseShape: { mediaPolicy: 'student-media-v1' }, validationRules: {}, gradingConfig: { rubric: [{ criterion: '表示关系完整', weight: 0.6 }, { criterion: '解释与表示相符', weight: 0.4 }] } });
      store.questionSources.push({ questionId: id, sourceType: 'internal_authoring', sourceName: '合成QA', sourcePathOrUrl: '', licenseClass: 'A_INTERNAL', licenseName: 'test', importJobId: null, reviewStatus: 'approved', notes: null });
      store.measurementItems.push({ id: `media-item${n}`, questionId: id, questionVersion: 1, atomId: 'media-atom', dimension: 'understanding', family: `test-family${n % 4}`, probeRole: 'anchor', expectedSeconds: 30, difficulty: 1, reviewStatus: 'approved', mappingWeight: 1, observationCode: 'representation_mismatch', version: 1 });
    }
    await call('put', '/students/child/learning-scope', { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null, textbookVersion: '测试', learnedAtomIds: ['media-atom'], currentAtomId: 'media-atom', minutesPerSession: 15 });
    session = await call('post', '/diagnostics/sessions', { studentId: 'child', subject: 'math', intent: 'baseline', maxItems: 4, includePrerequisites: false });
    session = { ...session, itemIds: session.items.map((item: any) => item.id), itemSnapshots: session.items };
  });
  const target = (itemId = session.itemIds[0]) => ({ kind: 'diagnostic', sessionId: session.id, itemId });
  const envelope = (itemId: string, ids: string[]) => ({ questionId: session.itemSnapshots.find((i: any) => i.id === itemId).questionId, mode: 'image_upload', response: { mediaIds: ids, description: '每组含相同个数，一共三组。' } });
  const start = (extra = {}) => call('post', '/learning/media', { ...target(), name: '作答.png', mediaType: 'image/png', size: png.length, requestKey: randomUUID(), ...extra });
  async function chunk(file: any, bytes = png, index = 0, expected = 200, actor = parent) { return (await request(app.getHttpServer()).put(`/api/learning/media/${file.id}/chunks/${index}`).set('Authorization', `Bearer ${actor.token}`).set('Content-Type', 'application/octet-stream').send(bytes).expect(expected)).body.data; }
  async function ready(extra = {}) { const file = await start(extra); await chunk(file); return call('post', `/learning/media/${file.id}/complete`, {}); }

  it('resumes immutable chunks, validates content and scope, and keeps a pending manual score with reversible review', async () => {
    const key = randomUUID(), file = await start({ requestKey: key });
    expect((await start({ requestKey: key })).id).toBe(file.id);
    await start({ requestKey: key, name: 'different.png' }).then(() => { throw new Error('expected conflict'); }, error => expect(String(error)).toContain('409'));
    await call('post', `/learning/media/${file.id}/complete`, {}, parent, 400);
    await chunk(file); await chunk(file); const corrupt = Buffer.from(png); corrupt[corrupt.length - 1] ^= 1; await chunk(file, corrupt, 0, 409);
    const saved = await call('post', `/learning/media/${file.id}/complete`, {}); expect(saved.status).toBe('ready');
    expect((await call('post', `/learning/media/${file.id}/complete`, {})).sha256).toBe(saved.sha256);
    await call('get', `/learning/media/${file.id}`, undefined, other, 403); await chunk(file, png, 0, 403, teacher);
    await call('post', `/diagnostics/sessions/${session.id}/responses`, { itemId: session.itemIds[1], answer: envelope(session.itemIds[1], [file.id]), elapsedMs: 1234 }, parent, 400);
    expect(store.diagnosticResponses).toHaveLength(0);
    const itemId = session.itemIds[0], answer = envelope(itemId, [file.id]);
    await call('patch', `/diagnostics/sessions/${session.id}/items/${itemId}/draft`, { answer });
    await call('post', `/learning/media/${file.id}/cancel`, {}, parent, 409);
    const submitted = await call('post', `/diagnostics/sessions/${session.id}/responses`, { itemId, answer, elapsedMs: 1234 });
    expect(submitted.status).toBe('pending_review'); expect(store.diagnosticResponses[0].score).toBeNull();
    const assignment = await call('post', '/students/child/reviewers', { principal: teacher.user.principal });
    await call('get', `/learning/media/${file.id}/content`, undefined, teacher, 403);
    for (const id of session.itemIds.slice(1)) await call('post', `/diagnostics/sessions/${session.id}/responses`, { itemId: id, disposition: 'skip', elapsedMs: 100 });
    await call('post', `/diagnostics/sessions/${session.id}/complete`, {});
    const range = await request(app.getHttpServer()).get(`/api/learning/media/${file.id}/content`).set('Authorization', `Bearer ${teacher.token}`).set('Range', 'bytes=0-7').expect(206);
    expect(range.headers['content-range']).toBe(`bytes 0-7/${saved.storedSize}`); expect(range.headers['cache-control']).toContain('no-store');
    await call('post', `/admin/reviews/diagnostic/${encodeURIComponent(submitted.responseId)}`, { expectedVersion: 0, requestKey: 'media-review-first', reason: '根据图片中的表示与解释逐项核对。', ratings: [{ criterionIndex: 0, score: 1, observation: '图片清楚显示三组，每组数量一致。' }, { criterionIndex: 1, score: 0.5, observation: '说明对应了分组，但总数关系未写完整。' }] }, teacher);
    expect(store.scoringRevisions[0].score).toBe(0.8); expect(store.diagnosticResponses[0].score).toBeNull();
    await call('post', `/students/child/reviewers/${assignment.id}/revoke`, {});
    await call('get', `/learning/media/${file.id}/content`, undefined, teacher, 403);
    await expect(media.purge(file.id)).rejects.toThrow('仍被保留');
  });

  it('rejects a fake image before scoring and cleans cancelled and expired uploads without deleting draft evidence', async () => {
    const fake = Buffer.from('<script>not an image</script>'), bad = await start({ size: fake.length }); await chunk(bad, fake);
    await call('post', `/learning/media/${bad.id}/complete`, {}, parent, 400); expect(store.diagnosticResponses).toHaveLength(0);
    await call('post', `/learning/media/${bad.id}/cancel`, {}); for (let n = 0; n < 20 && await cleanup.runNext(); n++) { /* Drain this isolated suite's older jobs too. */ } expect(existsSync(media.path(bad.id))).toBe(false);
    const keep = await ready(), itemId = session.itemIds[0]; await call('patch', `/diagnostics/sessions/${session.id}/items/${itemId}/draft`, { answer: envelope(itemId, [keep.id]) });
    const old = await start({ itemId: session.itemIds[1] }); await chunk(old);
    store.studentMedia.find((m: any) => m.id === keep.id).createdAt = new Date(Date.now() - 9 * 86400000).toISOString();
    store.studentMedia.find((m: any) => m.id === old.id).createdAt = new Date(Date.now() - 2 * 86400000).toISOString();
    await store.transaction(() => media.expireUnused());
    for (let n = 0; n < 20 && await cleanup.runNext(); n++) { /* Idempotent dispatch. */ }
    expect(existsSync(media.path(old.id))).toBe(false); expect(existsSync(media.path(keep.id))).toBe(true); expect(existsSync(media.path(keep.id, 'chunks'))).toBe(false);
    expect(store.studentMedia.find((m: any) => m.id === keep.id).status).toBe('ready');
  });

  it('refuses storage junctions without reading or writing their destination', async () => {
    const file = await start(), outside = join(directory, `isolated-link-target-${randomUUID()}`), link = join(media.root, file.id);
    mkdirSync(media.root, { recursive: true }); mkdirSync(outside); writeFileSync(join(outside, 'keeper.txt'), 'must remain unchanged');
    symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    try { await chunk(file, png, 0, 400); expect(readFileSync(join(outside, 'keeper.txt'), 'utf8')).toBe('must remain unchanged'); }
    finally { unlinkSync(link); }
  });

  it('accepts a real recording under the child identity and rejects cross-session, cross-kind and revoked student access', async () => {
    const frozen = store.diagnosticSessions.find((s: any) => s.id === session.id);
    for (const snapshot of frozen.questionSnapshots) snapshot.answerSchema.mode = 'audio_record';
    await call('post', '/students/child/learning-access', { enabled: true, expectedVersion: 0, requestKey: 'media-child-enable', reason: '核对录音作答只能由当前授权孩子完成。' });
    const code = await call('post', '/students/child/learning-access/codes', { expectedVersion: 1, requestKey: 'media-child-code' });
    const learner = await call('post', '/auth/learning-code', { code: code.code }, null);
    const bytes = execFileSync(process.env.STUDY_FFMPEG ?? 'ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.4', '-ac', '1', '-ar', '16000', '-f', 'wav', 'pipe:1'], { windowsHide: true, timeout: 10000 });
    const file = await call('post', '/learning/media', { ...target(), name: '回答.wav', mediaType: 'audio/wav', size: bytes.length, requestKey: 'media-real-recording' }, learner);
    await chunk(file, bytes, 0, 200, learner); const saved = await call('post', `/learning/media/${file.id}/complete`, {}, learner); expect(saved.durationMs).toBe(400);
    const answer = { ...envelope(session.itemIds[0], [file.id]), mode: 'audio_record' };
    const parallel = structuredClone(frozen); parallel.id = 'another-media-session'; store.diagnosticSessions.push(parallel);
    await call('post', '/diagnostics/sessions/another-media-session/responses', { itemId: session.itemIds[0], answer, elapsedMs: 1000 }, learner, 400);
    const practice = { id: 'media-practice', studentId: 'child', planId: 'media-plan', status: 'in_progress', snapshots: frozen.questionSnapshots, questionIds: [file.questionId] };
    store.practiceSessions.push(practice); store.diagnosticPlans.push({ id: 'media-plan', status: 'active' });
    expect(() => media.assertAnswer(store.users.find((u: any) => u.id === learner.user.id), { kind: 'practice', sessionId: practice.id, itemId: file.questionId }, { ...answer, questionId: file.questionId })).toThrow('不属于这道题');
    const submitted = await call('post', `/diagnostics/sessions/${session.id}/responses`, { itemId: session.itemIds[0], answer, elapsedMs: 1000 }, learner); expect(submitted.status).toBe('pending_review');
    await call('post', '/students/child/learning-access', { enabled: false, expectedVersion: 1, requestKey: 'media-child-revoke', reason: '撤销学习身份后附件访问应立即结束。' });
    await call('get', `/learning/media/${file.id}/content`, undefined, learner, 401);
  }, 20000);

  it('streams a self-contained tar only for the preparing session, rechecks current guardianship, and physically erases a deleted child', async () => {
    const file = await ready();
    const prepared = await call('post', '/privacy/students/child/prepare-archive', { credential, requestKey: 'media-archive-first' });
    await call('get', prepared.downloadPath.slice(4), undefined, other, 404);
    const secondLogin = await auth.login({ principal: parent.user.principal, credential }, 'media-second-session');
    await call('get', prepared.downloadPath.slice(4), undefined, secondLogin, 404);
    const response = await request(app.getHttpServer()).get(prepared.downloadPath).set('Authorization', `Bearer ${parent.token}`).buffer(true).parse((res, callback) => {
      const bytes: Buffer[] = []; res.on('data', chunk => bytes.push(chunk)); res.on('end', () => callback(null, Buffer.concat(bytes)));
    }).expect(200);
    const path = join(directory, 'family.tar'); writeFileSync(path, response.body);
    const checked = JSON.parse(execFileSync(process.env.STUDY_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3'), ['-X', 'utf8', '-c', 'import tarfile,json,hashlib,sys\nwith tarfile.open(sys.argv[1]) as t:\n m=json.load(t.extractfile("media-manifest.json")); d=json.load(t.extractfile("study-agent-family.json")); f=m["files"][0]; b=t.extractfile(f["name"]).read(); assert hashlib.sha256(b).hexdigest()==f["sha256"]; print(json.dumps({"files":len(m["files"]),"children":len(d["students"]),"size":len(b)}))', path], { encoding: 'utf8', windowsHide: true }));
    expect(checked).toEqual({ files: 1, children: 1, size: file.storedSize });
    expect(response.body.includes(Buffer.from(credential))).toBe(false);
    await call('get', prepared.downloadPath.slice(4), undefined, parent, 404);
    const revoked = await call('post', '/privacy/students/child/prepare-archive', { credential, requestKey: 'media-archive-revoke' });
    store.bindings[0].status = 'inactive'; await call('get', revoked.downloadPath.slice(4), undefined, parent, 404); store.bindings[0].status = 'active';
    const preview = await call('get', '/privacy/students/child/deletion-preview');
    await call('post', '/privacy/students/child/delete', { credential, requestKey: 'media-delete-child', confirmation: preview.confirmation, fingerprint: preview.fingerprint });
    expect(store.studentMedia).toHaveLength(0); expect(existsSync(media.path(file.id))).toBe(true);
    for (let n = 0; n < 20 && await cleanup.runNext(); n++) { /* Idempotent dispatch. */ }
    expect(existsSync(media.path(file.id))).toBe(false);
  });
});

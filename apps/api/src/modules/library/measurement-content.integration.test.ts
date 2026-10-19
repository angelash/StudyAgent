import 'reflect-metadata';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

const require = createRequire(__filename);
describe('original paper → independent measurement reviews → primary evidence', () => {
  let app: INestApplication, store: any, auth: any, root: string, admin: any, parent: any;
  const originalAssetRoot = process.env.STUDY_ASSET_ROOT;
  const image = 'https://source.example/prompt.png', answerImage = 'https://source.example/answer.png';
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'study-measurement-content-')); process.env.STUDY_ASSET_ROOT = root;
    mkdirSync(join(root, 'shijuanbao/media'), { recursive: true });
    const bytes = Buffer.from('verified-image-fixture'); writeFileSync(join(root, 'shijuanbao/media/prompt.png'), bytes);
    const sha = createHash('sha256').update(bytes).digest('hex');
    const manifest = new DatabaseSync(join(root, 'manifest.sqlite3'));
    manifest.exec('CREATE TABLE files(path TEXT PRIMARY KEY,bytes INTEGER,sha256 TEXT,state TEXT)');
    manifest.prepare('INSERT INTO files VALUES(?,?,?,?)').run('shijuanbao/media/prompt.png', bytes.length, sha, 'verified'); manifest.close();
    const archive = new DatabaseSync(join(root, 'shijuanbao/archive.sqlite3'));
    archive.exec('CREATE TABLE papers(key TEXT PRIMARY KEY,detail TEXT); CREATE TABLE questions(key TEXT PRIMARY KEY,body BLOB); CREATE TABLE media_jobs(url TEXT,path TEXT,sha256 TEXT,state TEXT)');
    for (const url of [image, answerImage]) archive.prepare('INSERT INTO media_jobs VALUES(?,?,?,?)').run(url, 'media/prompt.png', sha, 'done');
    archive.prepare('INSERT INTO papers VALUES(?,?)').run('qa:paper', JSON.stringify({ questions: [1, 2, 3].map(n => ({ uuid: `q${n}`,
      title: `<p>${n + 2} + 2 = ?</p><script>evil()</script><img src="${image}" onerror="evil()">`,
      answer: `<p>${n + 4}</p><img src="${answerImage}">`, details: '<p>把两个部分合并。</p>', options: [] })) })); archive.close();
    const catalog = new DatabaseSync(join(root, 'catalog.sqlite3'));
    catalog.exec(`CREATE TABLE papers(id TEXT PRIMARY KEY,title TEXT,grade TEXT,subject TEXT,province TEXT,paper_type TEXT,
      year INTEGER,content_state TEXT,expected INTEGER,available INTEGER,missing INTEGER,pdf_url TEXT,detail_sha256 TEXT,metadata_flags TEXT);
      CREATE TABLE paper_items(paper_id TEXT,position INTEGER,question_key TEXT,available INTEGER);`);
    catalog.prepare('INSERT INTO papers VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('qa:paper', '原创QA纸卷', '三年级', '数学', 'QA', '单元', 2026, 'partial', 4, 3, 1, null, 'qa', '[]');
    for (let n = 1; n <= 4; n++) catalog.prepare('INSERT INTO paper_items VALUES(?,?,?,?)').run('qa:paper', n, `paper:q${n}`, n === 4 ? 0 : 1);
    catalog.close();
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { AuthService } = require('../../../dist/apps/api/src/modules/auth/auth.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(InMemoryStoreService); auth = app.get(AuthService);
  });
  beforeEach(async () => {
    store.reset();
    admin = await auth.register({ principal: 'measurement-content-editor', credential: 'fixture-measurement-secret' });
    parent = await auth.register({ principal: 'measurement-content-parent', credential: 'fixture-measurement-secret' });
    store.users.find((u: any) => u.id === admin.user.id).role = 'admin';
    for (const id of ['target', 'base', 'secondary']) store.knowledgeAtoms.push({ id, subject: 'math', name: id, strand: '数与运算', grade: id === 'base' ? 1 : 3,
      term: 'both', objective: `独立执行${id}的可观察操作`, successCriterion: '用新材料独立说明并完成指定操作',
      prerequisiteIds: id === 'target' ? ['base'] : [], curriculumVersion: 'qa-v1', status: 'published', version: 1 });
    store.students.push({ id: 'qa-child', userId: 'qa-child-user', grade: 3, nickname: 'QA孩子', preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } });
    store.bindings.push({ id: 'qa-binding', studentId: 'qa-child', parentUserId: parent.user.id, status: 'active', relation: 'guardian' });
  });
  afterAll(async () => { await app?.close(); if (originalAssetRoot === undefined) delete process.env.STUDY_ASSET_ROOT; else process.env.STUDY_ASSET_ROOT = originalAssetRoot; rmSync(root, { recursive: true, force: true }); });
  async function call(method: 'get' | 'post' | 'put', path: string, body?: any, expected?: number, actor = admin) {
    let query = request(app.getHttpServer())[method](`/api${path}`).set('Authorization', `Bearer ${actor.token}`);
    if (body !== undefined) query = query.send(body);
    const response = await query;
    expect(response.status, JSON.stringify(response.body)).toBe(expected ?? (method === 'post' ? 201 : 200)); return response.body.data;
  }
  async function stage(position = 1) {
    const result = await call('post', '/measurement-content/candidates', { paperId: 'qa:paper', positions: [position] });
    return call('get', `/measurement-content/candidates/${encodeURIComponent(result.items[0].id)}`);
  }
  const command = (row: any, extra = {}) => ({ expectedVersion: row.version, requestKey: crypto.randomUUID(), reason: '逐项对照原创QA原卷、量规和原子定义后核实', ...extra });
  const path = (row: any, action = '') => `/measurement-content/candidates/${encodeURIComponent(row.id)}${action ? '/' + action : ''}`;
  function draft(row: any) {
    return { subject: 'math', grade: 3, stem: '三个积木和两个积木合并，一共有几个？', analysis: '把3和2两个部分合并，结果为5。',
      answer: 5, answerSchema: { mode: 'numeric_blank', responseShape: { value: 'number' }, validationRules: {}, gradingConfig: {} },
      blocks: [{ id: 'figure', type: 'image', url: row.media[0].url, alt: '两组积木的示意图' }],
      mapping: { primaryAtomId: 'target', prerequisiteAtomIds: ['base'], secondaryAtomIds: ['secondary'], dimension: 'transfer',
        family: 'qa:part-whole-model', probeRole: 'transfer', expectedSeconds: 45, difficulty: 2, observationCode: 'part_whole_mismatch',
        observedSteps: ['识别两个部分与同一整体', '选择合并关系并独立计算'], rationale: '答案直接观察主测点的整体与部分关系，次测点不单独计分', familyRationale: '根据图示建立合并模型，与直接计算式的任务结构不同' },
      license: { licenseClass: 'A_INTERNAL', evidence: '本卷完全由集成测试原创构造，仅用于验证产品流程' },
      scoringCases: [{ response: 5, expectedScore: 1, rationale: '两个部分正确合并得到总量' }, { response: 1, expectedScore: 0, rationale: '把合并误当成求两个部分的差' }] };
  }
  async function ready(position = 1, amend?: (draft: any) => void) {
    let row = await stage(position); const value = draft(row); amend?.(value);
    row = await call('post', path(row, 'draft'), command(row, { draft: value }));
    for (const gate of ['source', 'content', 'media', 'scoring', 'mapping']) row = await call('post', path(row, 'reviews'), command(row, { gate, decision: 'approved' }));
    return row;
  }
  it('keeps originals immutable, preserves missing positions, separates permissions and deduplicates staging', async () => {
    await call('get', '/measurement-content/candidates', undefined, 403, parent);
    await call('post', '/measurement-content/candidates', { paperId: 'qa:paper', positions: [1] }, 403, parent);
    const result = await call('post', '/measurement-content/candidates', { paperId: 'qa:paper', positions: [1, 4] });
    expect(result.created).toBe(1); expect(result.items[1].issue).toContain('缺少');
    const row = await stage(); expect(row.original.title).toContain('<script>'); expect(row.sourcePreview.html).not.toMatch(/<script|onerror|src="https:/);
    expect(row.promptMedia).toEqual([image]); expect(row.media).toHaveLength(1); expect(row.usable).toBe(false);
    expect(store.questions).toHaveLength(0); expect(store.paperPublications).toHaveLength(0);
    expect((await call('post', '/measurement-content/candidates', { paperId: 'qa:paper', positions: [1] })).created).toBe(0);
    await call('get', path(row), undefined, 403, parent);
  });
  it('rejects incompatible grading gold cases, foreign media, bad scope and unsupported mappings', async () => {
    const row = await stage(), value = draft(row);
    await call('post', path(row, 'draft'), command(row, { draft: { ...value, scoringCases: value.scoringCases.map(s => ({ ...s, expectedScore: 1 })) } }), 400);
    await call('post', path(row, 'draft'), command(row, { draft: { ...value, blocks: [{ id: 'answer', type: 'image', url: answerImage, alt: '答案图' }] } }), 400);
    await call('post', path(row, 'draft'), command(row, { draft: { ...value, grade: 2 } }), 400);
    await call('post', path(row, 'draft'), command(row, { draft: { ...value, mapping: { ...value.mapping, prerequisiteAtomIds: ['secondary'], secondaryAtomIds: [] } } }), 400);
    expect((await call('get', path(row))).version).toBe(1); expect(store.questions).toHaveLength(0);
  });
  it('requires all five reviews, invalidates them on edit and blocks reference-only sources', async () => {
    let row = await stage(); row = await call('post', path(row, 'draft'), command(row, { draft: draft(row) }));
    row = await call('post', path(row, 'reviews'), command(row, { gate: 'source', decision: 'approved' }));
    await call('post', path(row, 'publish'), command(row), 400);
    row = await call('post', path(row, 'draft'), command(row, { draft: { ...row.draft, analysis: '新版本重新核查合并两个部分的过程。' } }));
    expect(row.reviews).toEqual({});
    row = await ready(2, value => { value.license.licenseClass = 'C_PUBLIC_REFERENCE_ONLY'; });
    await call('post', path(row, 'publish'), command(row), 400); expect(store.measurementItems).toHaveLength(0);
  });
  it('publishes one primary measurement, withholds answers and reviews from learners, and freezes sessions on withdrawal', async () => {
    let row = await ready(); const publish = command(row);
    row = await call('post', path(row, 'publish'), publish); expect(row.usable).toBe(true);
    expect((await call('post', path(row, 'publish'), publish)).questionId).toBe(row.questionId);
    expect(store.measurementItems).toHaveLength(1); expect(store.measurementItems[0].atomId).toBe('target');
    expect(store.questionDocuments[0].accessibilityConfig.secondaryAtomIds).toEqual(['secondary']);
    await call('get', `/library/papers/${encodeURIComponent(row.paperId)}`, undefined, 403, parent);
    const media = await request(app.getHttpServer()).get(row.media[0].url).set('Authorization', `Bearer ${parent.token}`).set('Range', 'bytes=0-7').expect(206);
    expect(media.body.toString()).toBe('verified');
    await call('put', '/students/qa-child/learning-scope', { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null,
      textbookVersion: '原创QA路径', learnedAtomIds: ['target'], currentAtomId: 'target', minutesPerSession: 15 }, 200, parent);
    const session = await call('post', '/diagnostics/sessions', { studentId: 'qa-child', subject: 'math', intent: 'micro', includePrerequisites: false }, 201, parent);
    expect(session.items).toHaveLength(1);
    const render = await call('get', `/diagnostics/sessions/${session.id}/items/${session.items[0].id}`, undefined, 200, parent);
    expect(render.payload.answerSchema.gradingConfig).toEqual({}); expect(JSON.stringify(render)).not.toContain('scoringCases');
    row = await call('post', path(row, 'withdraw'), command(row)); expect(row.usable).toBe(false);
    await request(app.getHttpServer()).get(row.media[0].url).set('Authorization', `Bearer ${parent.token}`).expect(200);
    const unrelated = await auth.register({ principal: 'measurement-unrelated-family', credential: 'fixture-measurement-secret' });
    await request(app.getHttpServer()).get(row.media[0].url).set('Authorization', `Bearer ${unrelated.token}`).expect(403);
    const response = await call('post', `/diagnostics/sessions/${session.id}/responses`, { itemId: session.items[0].id, answer: 5, elapsedMs: 1200 }, 201, parent);
    expect(store.diagnosticResponses.find((r: any) => r.id === response.responseId).score).toBe(1);
    const report = await call('post', `/diagnostics/sessions/${session.id}/complete`, {}, 201, parent);
    expect(report.evidence.every((r: any) => r.atomId === 'target')).toBe(true);
    const latest = await call('get', path(row));
    expect(latest.history.some((h: any) => h.draft)).toBe(true); expect(latest.original.answer).toContain(answerImage);
  });
  it('binds approvals to current knowledge definitions and rejects stale concurrent edits', async () => {
    let row = await ready();
    store.knowledgeAtoms.find((atom: any) => atom.id === 'target').objective = '新定义要求解释合并与数量守恒';
    await call('post', path(row, 'publish'), command(row), 400);
    const save = command(row, { draft: row.draft });
    row = await call('post', path(row, 'draft'), save);
    expect(row.reviews).toEqual({}); expect((await call('post', path(row, 'draft'), save)).version).toBe(row.version);
    await call('post', path(row, 'draft'), { ...save, requestKey: crypto.randomUUID() }, 409);
    await call('post', path(row, 'draft'), { ...save, reason: '相同请求键不能被改作另一份说明或内容' }, 409);
  });
  it('removes changed rendered or scored content from new selection until reviewed again', async () => {
    let row = await ready(); row = await call('post', path(row, 'publish'), command(row));
    store.questionAnswerSchemas.find((schema: any) => schema.questionId === row.questionId).gradingConfig.absoluteTolerance = 1;
    expect((await call('get', path(row))).usable).toBe(false);
    // A generic mapping review cannot replace the candidate's five-gate approval.
    await call('post', '/admin/measurement-items', { ...store.measurementItems[0] }, 201);
    expect((await call('get', path(row))).usable).toBe(false);
    await request(app.getHttpServer()).get(row.media[0].url).set('Authorization', `Bearer ${parent.token}`).expect(403);
  });
  it('accepts explicit subjective rubric examples and keeps scoring in human review', async () => {
    let row = await ready(1, value => {
      value.answer = '先确认3和2是同一整体的两个部分，再合并得到5。';
      value.answerSchema = { mode: 'short_answer', responseShape: { value: 'string' }, validationRules: {},
        gradingConfig: { rubric: [{ criterion: '明确识别两个部分并说明合并理由', weight: 0.5 }, { criterion: '正确得到总量5并核对整体', weight: 0.5 }], reviewRequired: true } };
      value.scoringCases = [{ response: value.answer, expectedScore: 1, rationale: '关系与结果均符合量规' }, { response: '答案是1，因为做减法', expectedScore: 0, rationale: '把整体部分关系误当比较差' }];
    });
    row = await call('post', path(row, 'publish'), command(row));
    expect(row.usable).toBe(true); expect(store.questions[0].type).toBe('subjective');
    const { gradeResponse } = require('../../../dist/apps/api/src/modules/diagnostics/scoring.js');
    expect(gradeResponse(store.questionAnswerSchemas[0], row.draft.answer, '我还想画图说明').status).toBe('pending_review');
  });
});

import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { DomainDatabase } from '../../infrastructure/domain-database';

const installation = process.env.STUDY_TEST_PAPER_EXPORT_INSTALLATION, workspace = process.env.STUDY_TEST_PAPER_TEX_WORKSPACE;
const postgres = process.env.STUDY_TEST_PAPER_TEX_POSTGRES_URL;
describe.skipIf(!installation || !workspace)('real source TeX export, frozen recovery and book boundaries on ' + (postgres ? 'PostgreSQL' : 'SQLite'), () => {
  if (!installation || !workspace) { it.skip('requires explicit tools and unused generated QA workspace', () => {}); return; }
  const candidate = resolve(process.cwd(), '../..'), root = resolve(process.env.STUDY_TEST_PAPER_EXPORT_PROJECT_ROOT ?? candidate), directory = resolve(workspace);
  if (!directory.startsWith(resolve(root, 'data/qa') + sep) || existsSync(directory)) throw Error('Unused generated QA directory required');
  mkdirSync(directory);
  const assets = require(join(candidate, 'scripts/qa/paper-practice-fixture.cjs')).preparePaperPracticeAssets(directory, root);
  const names = ['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_ASSET_ROOT', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'DATABASE_URL', 'STUDY_PAPER_EXPORT_INSTALLATION'] as const;
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]])), sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex'), key = () => randomUUID();
  const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  let app: any, store: any, worker: any, admin: any, caseIndex = 0;
  const receipts: any[] = [];
  async function api(actor: any, method: 'get' | 'post', route: string, input?: unknown, expected = method === 'post' ? 201 : 200) {
    let call = request(app.getHttpServer())[method]('/api' + route);
    if (actor) call = call.set('Authorization', 'Bearer ' + actor.token);
    if (input !== undefined) call = call.send(input as object);
    const response = await call; expect(response.status, JSON.stringify(response.body.error)).toBe(expected); return response.body.data;
  }
  const register = () => api(null, 'post', '/auth/register', { principal: 'tex-' + key(), credential: 'synthetic-tex-fixture-only' });
  async function boot() {
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
    worker = app.get(load('modules/library/paper-export-render-worker.service').PaperExportRenderWorkerService);
  }
  async function selected(actor: any, variant = caseIndex++) {
    const paperId = 'qa:paper:' + variant + ':complete';
    await api(admin, 'post', '/library/papers/' + paperId + '/publication', { status: 'published', licenseEvidence: '原创合成TeX工程材料', contentReviewed: true, mediaReviewed: true, reason: '仅验证公式与原题位工程语义' });
    const metadata = await api(actor, 'get', '/library/papers/' + paperId + '/metadata');
    const list = await api(actor, 'post', '/library/selection-commands', { kind: 'create', requestKey: key(), scope: { kind: 'private_preparation', studentId: null }, title: '  原始TeX题单  ', items: metadata.positions });
    const input = { kind: 'create', requestKey: key(), listId: list.listId, listRevision: list.revision, listFingerprint: list.fingerprint, title: '原生公式合成验收', layout: { answerLines: 2, breakBetweenQuestions: false }, books: ['practice', 'answers'], formats: ['pdf', 'docx'] };
    return { input, paperId };
  }
  async function cold() { const db = new DomainDatabase(postgres ?? join(directory, 'study-agent.sqlite3')); await db.open(); try { return await db.read(); } finally { await db.close(); } }
  beforeAll(async () => {
    if (postgres) { const url = new URL(postgres); if (url.hostname !== '127.0.0.1' || url.port !== '15451' || !['/study_paper_tex', '/study_paper_tex_second'].includes(url.pathname)) throw Error('Owned PostgreSQL fixture required'); }
    const archive = new DatabaseSync(join(assets, 'shijuanbao/archive.sqlite3')), catalog = new DatabaseSync(join(assets, 'catalog.sqlite3'));
    try { for (const row of archive.prepare('SELECT key,detail FROM papers').all() as Array<{ key: string; detail: string }>) {
      const value = JSON.parse(row.detail); if (!value.questions.length) continue;
      Object.assign(value.questions[0], { title: '<p>ORIGINALONE：分别观察分式 \\(\\frac{1}{2}+x^2\\)、根式 \\(\\sqrt[3]{8}\\) 和括号 \\(\\left(\\frac{a}{b}+x\\right)\\)。</p><p>符号关系：\\(\\alpha+\\beta\\leq 2\\)。</p>', options: ['<p>\\(\\frac{1}{2}\\)</p>', '<p>\\(\\frac{2}{3}\\)</p>'], answer: '<p>REFERENCEONE：保留分式 \\(\\frac{1}{2}\\)。</p>', details: '<p>原生分子分母分别是1和2；合成内容只验证结构。</p>' });
      Object.assign(value.questions[1], { title: '<p>ORIGINALTWO：PREBLOCK $$x_1^2+1=2$$ POSTBLOCK。</p><p>PREBRACKET \\[\\sqrt{9}=3\\] POSTBRACKET。</p>', options: [], answer: '<p>REFERENCETWO：$$x+1=2$$</p>', details: '<p>合成结构核对，不代表教师内容审核。</p>' });
      if (row.key.includes(':30:')) {
        value.questions[0].title = '<p>MATRIXPROMPT：保留两行两列及嵌套分式。\\(\\begin{pmatrix}\\frac{1}{2}&x^2\\\\3&4\\end{pmatrix}\\)</p>';
        value.questions[0].answer = '<p>MATRIXREFERENCE：\\(\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}\\)</p>';
        value.questions[0].title += '<p>CJKPROMPT：\\(\\text{速度}=\\frac{\\text{路程}}{\\text{时间}}\\)</p>';
        value.questions[0].answer += '<p>CJKREFERENCE：\\(\\text{面积}=\\text{长}\\times\\text{宽}\\)</p>';
      }
      if (row.key.includes(':31:')) value.questions[0].title = '<p>\\(\\thisCommandDoesNotExist\\)</p>';
      if (row.key.includes(':32:')) value.questions[0].answer = '<p>\\(\\overline{x}\\)</p>';
      const text = JSON.stringify(value); archive.prepare('UPDATE papers SET detail=? WHERE key=?').run(text, row.key); catalog.prepare('UPDATE papers SET detail_sha256=? WHERE id=?').run(sha(text), row.key);
    } } finally { archive.close(); catalog.close(); }
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: postgres ? 'postgres' : 'sqlite', STUDY_DATA_DIR: directory, STUDY_ASSET_ROOT: assets, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', STUDY_PAPER_EXPORT_INSTALLATION: installation! });
    if (postgres) process.env.DATABASE_URL = postgres; else delete process.env.DATABASE_URL;
    await boot(); admin = await register(); await store.transaction(() => { store.find('users', { id: admin.user.id }).role = 'admin'; });
  });
  afterAll(async () => {
    writeFileSync(join(directory, 'tex-product-receipt.json'), JSON.stringify({ receipts, generatedOnly: true, noTeacherPhysicalPrinterOrNewMachineClaim: true }, null, 2));
    await app?.close(); for (const name of names) if (prior[name] === undefined) delete process.env[name]; else process.env[name] = prior[name];
  });
  it('preflights, freezes and downloads all four actual native files, then cold-restores the same original command', async () => {
    const actor = await register(), f = await selected(actor), before = await cold();
    const report = await api(actor, 'post', '/library/export-preflight', f.input);
    expect(report.books.practice.available).toBe(true); expect(report.books.answers.available).toBe(true);
    expect((await cold()).revision).toBe(before.revision);
    const result = await api(actor, 'post', '/library/export-commands', f.input);
    const frozen = (await cold()).state.paperExports!.find((row: any) => row.id === result.exportId) as any;
    expect(frozen.intent.document.items[0].promptHtml).toContain('<annotation encoding="application/x-tex">');
    expect(frozen.intent.document.items[0].optionHtml[0].html).toContain('<mfrac>');
    expect(frozen.intent.document.items[0].reference.answerHtml).toContain('<mfrac>');
    const original = new DatabaseSync(join(assets, 'shijuanbao/archive.sqlite3'), { readOnly: true });
    try { const value = JSON.parse((original.prepare('SELECT detail FROM papers WHERE key=?').get(f.paperId) as any).detail); expect(value.questions[0].title).toContain('\\(\\frac'); expect(value.questions[0].title).not.toContain('<math'); } finally { original.close(); }
    for (let index = 0; index < 4; index++) expect(await worker.runNext()).toBe(true);
    const view = await api(actor, 'get', '/library/exports/' + result.exportId);
    expect(view.slots.map((slot: any) => slot.state)).toEqual(['succeeded', 'succeeded', 'succeeded', 'succeeded']);
    mkdirSync(join(directory, 'downloaded'));
    for (const slot of view.slots) {
      const response = await request(app.getHttpServer()).get(slot.downloadUrl).set('Authorization', 'Bearer ' + actor.token).buffer(true).parse((response: any, done: any) => { const chunks: Buffer[] = []; response.on('data', (chunk: Buffer) => chunks.push(chunk)); response.on('end', () => done(null, Buffer.concat(chunks))); });
      expect(response.status).toBe(200); expect(sha(response.body)).toBe(slot.publication.sha256);
      writeFileSync(join(directory, 'downloaded', slot.book + '.' + slot.format), response.body);
      receipts.push({ book: slot.book, format: slot.format, bytes: response.body.length, sha256: sha(response.body), pages: slot.publication.pageCount });
    }
    const other = await register(); await api(other, 'get', '/library/exports/' + result.exportId, undefined, 404);
    await app.close(); await boot();
    expect(await api(actor, 'post', '/library/export-commands', f.input)).toEqual(result);
    const recovered = await api(actor, 'get', '/library/export-commands/' + f.input.requestKey);
    expect(recovered.input).toEqual(f.input); expect(recovered.result).toEqual(result);
    expect(((await cold()).state.paperExports!.find((row: any) => row.id === result.exportId) as any).intent).toEqual(frozen.intent);
  }, 240000);
  it('exports actual native matrix rows and columns in both books without changing their source or frozen request', async () => {
    const actor = await register(), f = await selected(actor, 30);
    const report = await api(actor, 'post', '/library/export-preflight', f.input);
    expect(report.books.practice.available).toBe(true); expect(report.books.answers.available).toBe(true);
    const result = await api(actor, 'post', '/library/export-commands', f.input), frozen = (await cold()).state.paperExports!.find((row: any) => row.id === result.exportId) as any;
    expect(frozen.intent.document.items[0].promptHtml).toContain('<mtable');
    expect(frozen.intent.document.items[0].reference.answerHtml).toContain('<mtable');
    for (let index = 0; index < 4; index++) expect(await worker.runNext()).toBe(true);
    const view = await api(actor, 'get', '/library/exports/' + result.exportId);
    expect(view.slots.map((slot: any) => slot.state)).toEqual(['succeeded', 'succeeded', 'succeeded', 'succeeded']);
    mkdirSync(join(directory, 'matrix-downloaded'));
    for (const slot of view.slots) {
      const response = await request(app.getHttpServer()).get(slot.downloadUrl).set('Authorization', 'Bearer ' + actor.token).buffer(true).parse((response: any, done: any) => { const chunks: Buffer[] = []; response.on('data', (chunk: Buffer) => chunks.push(chunk)); response.on('end', () => done(null, Buffer.concat(chunks))); });
      expect(response.status).toBe(200); expect(sha(response.body)).toBe(slot.publication.sha256);
      writeFileSync(join(directory, 'matrix-downloaded', slot.book + '.' + slot.format), response.body);
      receipts.push({ kind: 'matrix', book: slot.book, format: slot.format, bytes: response.body.length, sha256: sha(response.body), pages: slot.publication.pageCount });
    }
    expect(((await cold()).state.paperExports!.find((row: any) => row.id === result.exportId) as any).intent).toEqual(frozen.intent);
    expect(await api(actor, 'post', '/library/export-commands', f.input)).toEqual(result);
  }, 240000);
  it('refuses unproved or malformed formulas only in the affected book without changing the original source', async () => {
    const actor = await register();
    for (const [variant, available] of [[31, [false, true]], [32, [true, false]]] as const) {
      const f = await selected(actor, variant), before = await cold(), report = await api(actor, 'post', '/library/export-preflight', f.input);
      expect([report.books.practice.available, report.books.answers.available]).toEqual(available);
      const refused = available[0] ? 'answers' : 'practice'; expect(report.books[refused].reason).toMatch(/^paper_export_(unsupported_markup|missing_glyph)$/);
      await api(actor, 'post', '/library/export-commands', f.input, 409);
      expect((await cold()).revision).toBe(before.revision);
      receipts.push({ variant, availability: report.books, noQueueOrNativeWrite: true });
    }
  });
});

import { installSyntheticEditionConformities } from './textbook-edition-conformity.fixture';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CurriculumBook, TextbookTeachingSave } from '@study-agent/contracts';
import { DomainDatabase } from '../../infrastructure/domain-database';
import { teachingFixture } from './textbook-teaching-fixture';
import { teachingHash, teachingSourceDescriptor } from './textbook-teaching-package';
import { readTeachingEditorDetail } from '../../../../web/lib/teaching-editor-read';

const postgres = process.env.STUDY_TEST_TEACHING_POSTGRES_URL, root = resolve(process.cwd(), '../..'), qa = join(root, 'data/qa'); mkdirSync(qa, { recursive: true });
const directory = mkdtempSync(join(qa, 'teaching33-http-')), dataDir = join(directory, 'source'), assets = join(directory, 'assets'); mkdirSync(dataDir); mkdirSync(assets);
const names = ['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'DATABASE_URL', 'STUDY_ASSET_ROOT', 'TEXTBOOK_BASE_PATH', 'STUDY_TEXTBOOK_REGISTRY', 'STUDY_TEXTBOOK_SOURCE_MANIFEST', 'STUDY_PRIMARY_TEXTBOOK_SOURCE_MANIFEST', 'STUDY_TEXTBOOK_MAPPING_CANDIDATES', 'STUDY_TEXTBOOK_EDITION_CONFORMITIES'] as const;
const prior = Object.fromEntries(names.map(name => [name, process.env[name]])), sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex'), fixture = teachingFixture(2),
  sourceInput = { bookId: fixture.source.bookId, bookVersion: fixture.source.bookVersion, lessonId: fixture.source.lessonId, pageStart: 2, pageEnd: 3 }, route = '/admin/curriculum/teaching-packages',
  load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
let app: any, store: any, sources: any, admin: any, other: any, teacher: any, parent: any, student: any, source: any, childId: string;
const credential = 'generated-teaching33-only';
async function call(method: 'get' | 'post', path: string, body?: unknown, actor = admin, expected = method === 'post' ? 201 : 200) {
  const query = request(app.getHttpServer())[method]('/api' + path); if (actor) query.set('Authorization', 'Bearer ' + actor.token); if (body !== undefined) query.send(body as object);
  const response = await query; expect(response.status, JSON.stringify(response.body.error)).toBe(expected); return response;
}
const get = async (path: string, actor = admin, expected = 200) => (await call('get', path, undefined, actor, expected)).body.data;
const post = async (path: string, body: unknown, actor = admin, expected = 201) => (await call('post', path, body, actor, expected)).body.data;
async function cold(url = postgres ?? join(dataDir, 'study-agent.sqlite3')) { const db = new DomainDatabase(url); await db.open(); try { return await db.read(); } finally { await db.close(); } }
function saveInput(label: string, actor = admin): TextbookTeachingSave {
  return { ...structuredClone(fixture.input), packageId: 'qa:teaching:http:' + label + ':' + actor.user.id, requestKey: randomUUID(), source: teachingSourceDescriptor(source), sourceFingerprint: source.fingerprint };
}
async function create(label: string, actor = admin) { const input = saveInput(label, actor), result = await post(route + '/commands', input, actor), detail = await get(route + '/' + encodeURIComponent(input.packageId), actor); return { input, result, detail }; }
function publishInput(saved: Awaited<ReturnType<typeof create>>) { return { action: 'publish', packageId: saved.input.packageId, requestKey: randomUUID(), expectedRevision: saved.result.revision,
  contentVersion: saved.result.contentVersion, contentFingerprint: saved.result.contentFingerprint, preflightFingerprint: saved.detail.version.report.fingerprint,
  reviewed: true, originalTeaching: true, reason: '明确确认合成完整稿的工程版本，测试不代表教材或教师审核结论。' }; }

describe('actual ' + (postgres ? 'PostgreSQL' : 'SQLite') + ' teaching package HTTP, originals, privacy and restore', () => {
  beforeAll(async () => {
    if (postgres) { const url = new URL(postgres); if (url.hostname !== '127.0.0.1' || url.port !== '15455' || !/^\/study_teaching_package33_http_[a-f0-9]{32}$/.test(url.pathname)) throw Error('Exact generated PostgreSQL required'); }
    const original = Buffer.from('%PDF-1.4\nGenerated original for teaching range verification only\n%%EOF'), pdf = join(assets, 'book.pdf'); writeFileSync(pdf, original);
    const pages = [1, 2, 3, 4, 5].map(page => ({ page, text: page === 2 || page === 3 ? fixture.privateText : '' })), extraction = Buffer.from(JSON.stringify({ format: 'chinatextbook-extraction-v1', id: fixture.source.sourceBookId, sourceSha256: sha(original), pages })); writeFileSync(join(assets, 'extracted.json'), extraction);
    const book: CurriculumBook = { id: fixture.source.bookId, version: fixture.source.bookVersion, subject: 'math', grade: 3, term: 'upper', title: fixture.source.bookTitle, edition: fixture.source.edition,
      source: 'public_catalog', sourceRef: 'Generated original QA only', sourceSha256: sha(original), chapterState: 'available', chapters: [{ id: 'qa-unit', name: '合成单元', lessons: [{ id: fixture.source.lessonId, name: fixture.source.lessonName }, { id: 'qa-reference', name: '附录', kind: 'reference' }] }] };
    const largeBook = { ...structuredClone(book), id: book.id + ':large', edition: '工程合成大型第一版' }, largeSourceId = fixture.source.sourceBookId + ':large',
      largePages = pages.map(page => ({ ...page, text: page.page === 2 || page.page === 3 ? '完整范围正文'.repeat(50000) : '' })),
      largeExtraction = Buffer.from(JSON.stringify({ format: 'chinatextbook-extraction-v1', id: largeSourceId, sourceSha256: sha(original), pages: largePages }));
    writeFileSync(join(assets, 'large-extracted.json'), largeExtraction);
    writeFileSync(join(directory, 'registry.json'), JSON.stringify({ books: [book, largeBook] })); writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ books: [
      { id: fixture.source.sourceBookId, subject: 'math', grade: 3, term: 'upper', title: book.title, edition: book.edition, assetPath: 'data/assets/book.pdf', sha256: sha(original), bytes: original.length, pages: 5, extractedPath: 'data/assets/extracted.json', extractedSha256: sha(extraction) },
      { id: largeSourceId, subject: 'math', grade: 3, term: 'upper', title: largeBook.title, edition: largeBook.edition, assetPath: 'data/assets/book.pdf', sha256: sha(original), bytes: original.length, pages: 5, extractedPath: 'data/assets/large-extracted.json', extractedSha256: sha(largeExtraction) },
    ] }));
    installSyntheticEditionConformities(directory);
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: postgres ? 'postgres' : 'sqlite', STUDY_DATA_DIR: dataDir, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', STUDY_ASSET_ROOT: assets,
      TEXTBOOK_BASE_PATH: '', STUDY_TEXTBOOK_REGISTRY: join(directory, 'registry.json'), STUDY_TEXTBOOK_SOURCE_MANIFEST: join(directory, 'no-chinese.json'), STUDY_PRIMARY_TEXTBOOK_SOURCE_MANIFEST: join(directory, 'manifest.json'), STUDY_TEXTBOOK_MAPPING_CANDIDATES: join(directory, 'no-candidates.json') });
    if (postgres) process.env.DATABASE_URL = postgres; else delete process.env.DATABASE_URL;
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init(); store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService); sources = app.get(load('modules/diagnostics/textbook-registry.service').TextbookRegistryService);
    async function register(role: string) { const actor = await post('/auth/register', { principal: 'teaching33-' + randomUUID(), credential }, null); if (role !== 'parent') await store.transaction(() => { store.find('users', { id: actor.user.id }).role = role; }); return actor; }
    admin = await register('admin'); other = await register('admin'); teacher = await register('teacher'); parent = await register('parent');
    await store.transaction(() => { for (const name of ['knowledgeAtoms', 'questions', 'questionSources', 'questionAnswerSchemas', 'measurementItems'] as const) for (const row of fixture.store.inspect(name)) store.append(name, structuredClone(row)); });
    const child = (await post('/students', { nickname: '合成教研权限测试', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } }, parent)).profile;
    childId = child.id; await post('/students/' + child.id + '/reviewers', { principal: teacher.user.principal }, parent);
    await post('/students/' + child.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: 'Generated learning identity for editorial access denial' }, parent);
    const code = await post('/students/' + child.id + '/learning-access/codes', { expectedVersion: 1, requestKey: randomUUID() }, parent); student = await post('/auth/learning-code', { code: code.code }, null);
    source = await post(route + '/source-preview', sourceInput);
  });
  afterAll(async () => { vi.restoreAllMocks(); await app?.close(); for (const name of names) if (prior[name] === undefined) delete process.env[name]; else process.env[name] = prior[name]; });

  it('reads an exact manually corrected full range without any automatic locator or native write', async () => {
    const before = await cold(), response = await call('post', route + '/source-preview', sourceInput, teacher);
    expect(response.headers['cache-control']).toBe('private, no-store'); expect(response.body.data.pages.map((row: any) => row.text)).toEqual([fixture.privateText, fixture.privateText]);
    expect(response.body.data.pages.map((row: any) => row.page)).toEqual([2, 3]); expect(teachingHash(await cold())).toBe(teachingHash(before)); expect(JSON.stringify(response.body.data)).not.toContain(directory);
    const empty = await post(route + '/source-preview', { ...sourceInput, pageStart: 1, pageEnd: 1 }); expect(empty.pages[0]).toMatchObject({ text: '', textCharacters: 0 });
    await post(route + '/source-preview', { ...sourceInput, bookVersion: 'wrong-version' }, admin, 409); await post(route + '/source-preview', { ...sourceInput, pageEnd: 6 }, admin, 400);
    await post(route + '/source-preview', { ...sourceInput, lessonId: 'qa-reference' }, admin, 404);
  });
  it('preflights real material/definition eligibility without storing a command or learner result', async () => {
    const before = await cold(), report = await post(route + '/preflight', saveInput('preview')); expect(report.gaps).toEqual([]); expect(report.publishable).toBe(true);
    expect(teachingHash(await cold())).toBe(teachingHash(before));
    const incomplete = saveInput('incomplete'); incomplete.content.summary.synthesis = ''; incomplete.sourceReview.pages = [];
    const pending = await post(route + '/preflight', incomplete); expect(pending.publishable).toBe(false); expect(pending.gaps.some((gap: any) => gap.code === 'source_page_review_pending')).toBe(true);
  });
  it('paginates actual eligible material references for this target without returning private grading answers', async () => {
    const before = await cold(), first = await get(route + '/materials?' + new URLSearchParams({ atomId: fixture.atoms[0].id, pageSize: '7' }), teacher),
      second = await get(route + '/materials?' + new URLSearchParams({ atomId: fixture.atoms[0].id, pageSize: '7', page: '2' }), teacher);
    expect(first.total).toBe(20); expect(first.items).toHaveLength(7); expect(second.items).toHaveLength(7); expect(first.atom.atomId).toBe(fixture.atoms[0].id);
    expect(new Set([...first.items, ...second.items].map((row: any) => row.reference.measurementId)).size).toBe(14);
    for (const row of first.items) { expect(row.answerMode).toBe('numeric_blank'); expect(row.reference.definitionFingerprint).toBe(fixture.input.targetRefs[0].definitionFingerprint); expect(row).not.toHaveProperty('answer'); expect(row).not.toHaveProperty('gradingConfig'); }
    await get(route + '/materials?atomId=' + encodeURIComponent(fixture.atoms[0].id), parent, 403); await get(route + '/materials?atomId=' + encodeURIComponent(fixture.atoms[0].id), student, 403);
    expect(teachingHash(await cold())).toBe(teachingHash(before));
  });
  it('returns an actionable full-range budget rejection without saving or truncating any source', async () => {
    const before = await cold(), response = await call('post', route + '/source-preview', { ...sourceInput, bookId: sourceInput.bookId + ':large' }, teacher, 400);
    expect(JSON.stringify(response.body.error)).toContain('20万'); expect(JSON.stringify(response.body.error)).toContain('未截取正文'); expect(teachingHash(await cold())).toBe(teachingHash(before));
  });
  it('saves complete original strings once, replays the original receipt and rejects same-key changes', async () => {
    const input = saveInput('replay'); input.content.title += ' \n🧪 '; const saved = await post(route + '/commands', input), before = await cold();
    expect(await post(route + '/commands', input)).toEqual(saved); expect(teachingHash(await cold())).toBe(teachingHash(before));
    const recovered = await get(route + '/commands/' + input.requestKey); expect(recovered.input).toEqual(input); expect(recovered.result).toEqual(saved);
    const changed = structuredClone(input); changed.content.concept.explanation += ' '; await post(route + '/commands', changed, admin, 409);
    const detail = await get(route + '/' + encodeURIComponent(input.packageId)); expect(detail.version.body.content.title).toBe(input.content.title); expect(detail.source.pages).toEqual(source.pages);
    expect(detail.savedBy.input).toEqual(input); expect(detail.savedBy.result).toEqual(saved);
    const checked = await readTeachingEditorDetail({ actorId: admin.user.id, bookId: source.bookId, bookVersion: source.bookVersion, lessonId: source.lessonId }, input.packageId, undefined, undefined,
      async (path, options) => { const query = request(app.getHttpServer()).get('/api' + path).set('Authorization', 'Bearer ' + admin.token); new Headers(options.headers).forEach((value, name) => query.set(name, value)); const response = await query; expect(response.status).toBe(200); return response.body.data; });
    expect(checked).toEqual(detail);
    await get(route + '/' + encodeURIComponent(input.packageId), other, 404);
  });
  it('keeps v1 published while v2 is saved, explicitly publishes v2 and then withdraws it', async () => {
    const saved = await create('publication'), first = await post(route + '/commands', publishInput(saved)), input = { ...structuredClone(saved.input), expectedRevision: first.revision, requestKey: randomUUID(),
      basedOn: { contentVersion: saved.result.contentVersion, contentFingerprint: saved.result.contentFingerprint } }; input.content.title += '第二稿';
    const second = await post(route + '/commands', input); expect(second).toMatchObject({ contentVersion: 2, status: 'published', published: { contentVersion: 1 } });
    expect((await get(route + '/' + encodeURIComponent(input.packageId) + '?version=1')).version).toEqual(saved.detail.version);
    const detail = await get(route + '/' + encodeURIComponent(input.packageId)), publish = publishInput({ input, result: second, detail }), released = await post(route + '/commands', publish);
    expect(released.published.contentVersion).toBe(2); expect(released.published.fingerprint).not.toBe(first.published.fingerprint);
    const withdrawal = { action: 'withdraw', packageId: input.packageId, expectedRevision: released.revision, requestKey: randomUUID(), contentVersion: 2, contentFingerprint: second.contentFingerprint, reason: '合成材料需要重新核对，明确停止新的课程采用。' },
      result = await post(route + '/commands', withdrawal); expect(result).toMatchObject({ status: 'withdrawn', published: null, contentVersion: 2 });
    expect((await get(route + '/commands/' + saved.input.requestKey)).result).toEqual(saved.result);
  });
  it('commits only one of two competing saves at the same exact revision', async () => {
    const saved = await create('concurrent'), inputs = [1, 2].map(n => ({ ...structuredClone(saved.input), expectedRevision: 1, requestKey: randomUUID(),
      basedOn: { contentVersion: saved.result.contentVersion, contentFingerprint: saved.result.contentFingerprint }, content: { ...structuredClone(saved.input.content), title: '并发完整稿' + n } }));
    const results = await Promise.all(inputs.map(input => request(app.getHttpServer()).post('/api' + route + '/commands').set('Authorization', 'Bearer ' + admin.token).send(input)));
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    const detail = await get(route + '/' + encodeURIComponent(saved.input.packageId)); expect(detail.header.revision).toBe(2); expect(detail.header.contentVersion).toBe(2);
    const accepted = results.findIndex(result => result.status === 201); expect(detail.version.body.content.title).toBe(inputs[accepted].content.title);
  });
  it('rechecks current material approval at publication while retaining the saved original and old receipt', async () => {
    const saved = await create('changed-material'), mapping = fixture.store.inspect('measurementItems')[0];
    await store.transaction(() => { store.find('measurementItems', { id: mapping.id }).reviewStatus = 'rejected'; });
    try { await post(route + '/commands', publishInput(saved), admin, 409); expect((await get(route + '/' + encodeURIComponent(saved.input.packageId))).version).toEqual(saved.detail.version); }
    finally { await store.transaction(() => { store.find('measurementItems', { id: mapping.id }).reviewStatus = 'approved'; }); }
  });
  it.each(['role', 'session'] as const)('rechecks the exact %s after asynchronous source I/O before returning private text', async kind => {
    const read = sources.teachingSource.bind(sources), session = await store.requestContext(() => store.find('sessions', { userId: teacher.user.id, revokedAt: null }));
    vi.spyOn(sources, 'teachingSource').mockImplementationOnce(async (...args: any[]) => { const value = await read(...args); await store.transaction(() => {
      if (kind === 'role') store.find('users', { id: teacher.user.id }).role = 'parent'; else store.find('sessions', { id: session.id }).revokedAt = new Date().toISOString();
    }); return value; });
    try { await post(route + '/source-preview', sourceInput, teacher, 403); }
    finally { vi.restoreAllMocks(); await store.transaction(() => { store.find('users', { id: teacher.user.id }).role = 'teacher'; store.find('sessions', { id: session.id }).revokedAt = null; }); }
  });
  it('denies parent/student/anonymous source, commands and private originals', async () => {
    for (const actor of [parent, student]) { await post(route + '/source-preview', sourceInput, actor, 403); await post(route + '/commands', saveInput('denied'), actor, 403); }
    await post(route + '/source-preview', sourceInput, null, 401);
  });
  it('rejects a legacy imported source descriptor instead of silently qualifying it with a new whole-book proof', async () => {
    const input = saveInput('legacy-source'), before = await cold(); delete input.source.editionProofFingerprint;
    await post(route + '/preflight', input, admin, 409); await post(route + '/commands', input, admin, 409);
    expect(teachingHash(await cold())).toBe(teachingHash(before));
  });
  it('rechecks the edition proof after source I/O and before a new editorial command is stored', async () => {
    const file = process.env.STUDY_TEXTBOOK_EDITION_CONFORMITIES!, bytes = readFileSync(file), input = saveInput('late-edition-change'), before = await cold(), original = sources.teachingSource.bind(sources);
    vi.spyOn(sources, 'teachingSource').mockImplementationOnce(async (...args: any[]) => { const result = await original(...args), document = JSON.parse(bytes.toString('utf8'));
      document.rows[0].review.statement += ' Changed after complete source I/O.'; writeFileSync(file, JSON.stringify(document)); return result; });
    try { await post(route + '/commands', input, admin, 409); expect(teachingHash(await cold())).toBe(teachingHash(before)); }
    finally { vi.restoreAllMocks(); writeFileSync(file, bytes); }
  });
  it('retains accepted originals and exact receipts after whole-book qualification is withdrawn, while refusing new publication', async () => {
    const saved = await create('withdrawn-edition-proof'), released = await post(route + '/commands', publishInput(saved)), file = process.env.STUDY_TEXTBOOK_EDITION_CONFORMITIES!, bytes = readFileSync(file), before = await cold();
    writeFileSync(file, JSON.stringify({ format: 'textbook-edition-conformities-v1', rows: [] }));
    try {
      const detail = await get(route + '/' + encodeURIComponent(saved.input.packageId)); expect(detail.availability.code).toBe('source_or_material_changed');
      expect(detail.version).toEqual(saved.detail.version); expect(detail.savedBy).toEqual(saved.detail.savedBy);
      expect(await post(route + '/commands', saved.input)).toEqual(saved.result);
      expect((await get(route + '/commands/' + saved.input.requestKey)).result).toEqual(saved.result);
      await post(route + '/commands', { ...publishInput(saved), expectedRevision: released.revision }, admin, 409);
      expect(teachingHash(await cold())).toBe(teachingHash(before));
    } finally { writeFileSync(file, bytes); }
  });
  it('exports only the current author originals, closes that account and applies the latest deletion ledger to an old native backup', async () => {
    const saved = await create('privacy', teacher), otherSaved = await create('other-private', other), otherReleased = await post(route + '/commands', publishInput(otherSaved), other),
      exported = await post('/privacy/account/export', { credential, requestKey: randomUUID() }, teacher);
    expect(exported.students).toEqual([]); await post('/privacy/students/' + childId + '/export', { credential, requestKey: randomUUID() }, teacher, 403);
    expect(exported.accountRecords.textbookTeachingPackages.some((row: any) => row.id === saved.input.packageId)).toBe(true);
    expect(exported.accountRecords.textbookTeachingPackages.some((row: any) => row.id === otherSaved.input.packageId)).toBe(false);
    expect(exported.accountRecords.textbookTeachingSources.some((row: any) => row.snapshot.pages[0].text === fixture.privateText)).toBe(true);
    const bundle = join(directory, 'before-deletion-bundle'), destination = join(directory, 'restored-with-latest-ledger'), ledgerFile = join(directory, 'latest-deletions.json'), backup = require(resolve(root, 'scripts/operations/backup.cjs')),
      pgBackup = require(resolve(root, 'scripts/operations/postgres-backup.cjs')), ledger = require(resolve(root, 'scripts/operations/privacy-ledger.cjs'));
    const pgBin = process.env.STUDY_TEST_TEACHING_PG_BIN;
    if (postgres) await pgBackup.createPostgresBundle({ connectionString: postgres, pgBin, dataDir, destination: bundle }); else await backup.createBundle({ dataDir, destination: bundle });
    const beforeDeletion = await cold(), preview = await get('/privacy/account/deletion-preview', teacher), commit = store.commitRequest.bind(store);
    expect(preview.deletedChildren).toEqual([]);
    vi.spyOn(store, 'commitRequest').mockImplementation(async (...args: any[]) => {
      try { return await commit(...args); } catch (error) {
        const causes: string[] = []; let value: any = error; while (value instanceof Error && causes.length < 12) { causes.push(value.stack ?? value.message); value = (value as any).cause; }
        writeFileSync(join(directory, 'delete-commit-failure.private.json'), JSON.stringify({ causes }, null, 2), { flag: 'wx' }); throw error;
      }
    });
    const deletion = await post('/privacy/account/delete', { credential, requestKey: randomUUID(), confirmation: preview.confirmation, fingerprint: preview.fingerprint }, teacher); vi.restoreAllMocks(); expect(deletion.kind).toBe('account_delete'); expect(deletion.erasedStudentHashes).toEqual([]);
    const current = await cold(); expect(current.state.students).toEqual(beforeDeletion.state.students); expect(current.state.bindings).toEqual(beforeDeletion.state.bindings);
    for (const name of ['textbookTeachingPackages', 'textbookTeachingVersions', 'textbookTeachingSources', 'textbookTeachingCommands']) expect((current.state[name] ?? []).every((row: any) => row.actorId !== teacher.user.id)).toBe(true);
    await ledger.exportLedger({ dataDir, connectionString: postgres, destination: ledgerFile });
    let restoredUrl = join(destination, 'study-agent.sqlite3');
    if (postgres) {
      const pool = new Pool({ connectionString: postgres, max: 1 }), databaseName = 'teaching33_restore_' + randomUUID().replaceAll('-', ''); try { await pool.query('CREATE DATABASE "' + databaseName + '"'); } finally { await pool.end(); }
      const url = new URL(postgres); url.pathname = '/' + databaseName; restoredUrl = url.toString();
      await pgBackup.restorePostgresBundle({ bundle, destination, connectionString: restoredUrl, pgBin, deletionLedger: ledgerFile });
    } else await backup.restoreBundle({ bundle, destination, deletionLedger: ledgerFile });
    const restored = await cold(restoredUrl);
    for (const name of ['textbookTeachingPackages', 'textbookTeachingVersions', 'textbookTeachingSources', 'textbookTeachingCommands']) {
      expect((restored.state[name] ?? []).every((row: any) => row.actorId !== teacher.user.id)).toBe(true);
      expect((restored.state[name] ?? []).filter((row: any) => row.actorId === other.user.id)).toEqual((current.state[name] ?? []).filter((row: any) => row.actorId === other.user.id));
    }
    expect((restored.state.privacyRequests as any[]).some(row => row.id === deletion.id)).toBe(true);
    expect(restored.state.students).toEqual(beforeDeletion.state.students); expect(restored.state.bindings).toEqual(beforeDeletion.state.bindings);
    expect((restored.state.sessions as any[]).every(row => row.revokedAt)).toBe(true);
    const originalDir = process.env.STUDY_DATA_DIR, originalUrl = process.env.DATABASE_URL; let restoredApp: any;
    try {
      process.env.STUDY_DATA_DIR = destination; if (postgres) process.env.DATABASE_URL = restoredUrl;
      restoredApp = await NestFactory.create(load('app.module').AppModule, { logger: false }); restoredApp.setGlobalPrefix('api'); await restoredApp.init();
      const login = await request(restoredApp.getHttpServer()).post('/api/auth/login').send({ principal: other.user.principal, credential }); expect(login.status).toBe(201);
      const read = async () => { const response = await request(restoredApp.getHttpServer()).get('/api' + route + '/' + encodeURIComponent(otherSaved.input.packageId)).set('Authorization', 'Bearer ' + login.body.data.token); expect(response.status).toBe(200); return response.body.data; };
      const suspended = await read(); expect(suspended.availability.code).toBe('restore_confirmation_required'); expect(suspended.header.published).toEqual(otherReleased.published);
      const confirm = publishInput({ ...otherSaved, detail: suspended, result: { ...otherSaved.result, revision: suspended.header.revision } }),
        released = await request(restoredApp.getHttpServer()).post('/api' + route + '/commands').set('Authorization', 'Bearer ' + login.body.data.token).send(confirm);
      expect(released.status).toBe(201); expect(released.body.data.published).toEqual(otherReleased.published); expect((await read()).availability.code).toBe('available');
    } finally { await restoredApp?.close(); process.env.STUDY_DATA_DIR = originalDir; if (originalUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalUrl; }
    writeFileSync(join(directory, 'native-privacy-restore.receipt.json'), JSON.stringify({ generatedOnly: true, driver: postgres ? 'postgres' : 'sqlite', fourPrivateCollectionsRemoved: true,
      otherOwnerOriginalsRetained: true, nativeBackupAndEmptyRestore: true, latestDeletionLedger: true, restoredOldPublicationSuspended: true, explicitReconfirmationAfterRestore: true,
      schema: 35, realLearnerEvidence: false }, null, 2), { flag: 'wx' });
  });
});

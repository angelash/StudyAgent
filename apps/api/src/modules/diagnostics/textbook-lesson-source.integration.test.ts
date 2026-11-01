import { installSyntheticEditionConformities } from './textbook-edition-conformity.fixture';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { CurriculumBook } from '@study-agent/contracts';
import { DomainDatabase } from '../../infrastructure/domain-database';
import { lessonSourceFingerprint } from './textbook-source-candidates';

const postgres = process.env.STUDY_TEST_TEXTBOOK_SOURCE_POSTGRES_URL;
describe('actual textbook source HTTP and native read-only state on ' + (postgres ? 'PostgreSQL' : 'SQLite'), () => {
  const candidate = resolve(process.cwd(), '../..'), qa = join(candidate, 'data/qa'); mkdirSync(qa, { recursive: true });
  const directory = mkdtempSync(join(qa, 'textbook-source-http-')), assets = join(directory, 'assets'); mkdirSync(assets);
  const names = ['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'DATABASE_URL', 'STUDY_ASSET_ROOT', 'TEXTBOOK_BASE_PATH', 'STUDY_TEXTBOOK_REGISTRY', 'STUDY_TEXTBOOK_SOURCE_MANIFEST', 'STUDY_PRIMARY_TEXTBOOK_SOURCE_MANIFEST', 'STUDY_TEXTBOOK_MAPPING_CANDIDATES', 'STUDY_TEXTBOOK_EDITION_CONFORMITIES'] as const;
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]])), sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  const load = (file: string) => require('../../../dist/apps/api/src/' + file + '.js');
  const original = Buffer.from('%PDF-1.4\nOriginal isolated source fixture\n%%EOF'), pdf = join(assets, 'book.pdf');
  const pages = [{ page: 1, text: '准确原页\n条件  与空格保持\nOriginal source 😀' }, { page: 2, text: '' }, { page: 3, text: 'Final source page\n原始边界' }];
  let app: any, store: any, sources: any, admin: any, teacher: any, parent: any, student: any, book: CurriculumBook, extraction: Buffer;
  const route = (id = 'qa:valid', lesson = 'lesson', suffix = '') => `/admin/curriculum/textbooks/${encodeURIComponent(id)}/lessons/${encodeURIComponent(lesson)}/source${suffix}`;
  const documentRoute = '/admin/curriculum/textbooks/qa%3Avalid/document';
  async function api(actor: any, path: string, expected = 200) {
    const call = request(app.getHttpServer()).get('/api' + path); if (actor) call.set('Authorization', 'Bearer ' + actor.token);
    const response = await call; expect(response.status, JSON.stringify(response.body.error)).toBe(expected); return response;
  }
  async function cold() { const db = new DomainDatabase(postgres ?? join(directory, 'study-agent.sqlite3')); await db.open(); try { return await db.read(); } finally { await db.close(); } }
  beforeAll(async () => {
    if (postgres) { const url = new URL(postgres); if (url.hostname !== '127.0.0.1' || !(url.port === '15453' && url.pathname === '/study_textbook_sources' || url.port === '15455' && /^\/study_teaching_package33_http_[a-f0-9]{32}$/.test(url.pathname))) throw Error('Exact owned PostgreSQL required'); }
    writeFileSync(pdf, original);
    const books: CurriculumBook[] = [], manifests: any[] = [], rows: any[] = [];
    for (const kind of ['valid', 'wrong-id', 'wrong-pdf', 'missing-page', 'duplicate-page', 'reordered-page', 'long-page', 'stale', 'unbound', 'duplicate']) {
      const entry: CurriculumBook = { id: 'qa:' + kind, subject: 'chinese', grade: 3, term: 'upper', edition: 'Original QA ' + kind, title: 'Original QA ' + kind, version: 'v1', source: 'public_catalog', sourceRef: 'QA generated fixture only', sourceSha256: 'a'.repeat(64), chapterState: 'available',
        chapters: [{ id: 'unit', name: '原始单元', lessons: [{ id: 'lesson', name: '原始课时', printedPage: 1 }, { id: 'empty', name: '图示候选', printedPage: 2 }, { id: 'appendix', name: '附录', kind: 'reference' }] }] };
      books.push(entry); if (kind === 'valid') book = entry;
      const sourceId = 'source:' + kind, sourcePages = kind === 'missing-page' ? pages.slice(0, 2) : kind === 'duplicate-page' ? [pages[0], pages[0], pages[2]] : kind === 'reordered-page' ? [...pages].reverse() : kind === 'long-page' ? [{ page: 1, text: '完整正文😀\n'.repeat(30000) }, pages[1], pages[2]] : pages;
      const raw = Buffer.from(JSON.stringify({ format: 'chinatextbook-extraction-v1', id: kind === 'wrong-id' ? 'different-source' : sourceId, sourceSha256: kind === 'wrong-pdf' ? 'b'.repeat(64) : sha(original), pages: sourcePages }));
      writeFileSync(join(assets, kind + '.json'), raw); if (kind === 'valid') extraction = raw;
      manifests.push({ id: sourceId, grade: 3, term: 'upper', edition: entry.edition, assetPath: 'data/assets/book.pdf', sha256: sha(original), bytes: original.length, pages: 3, extractedPath: 'data/assets/' + kind + '.json', extractedSha256: sha(raw) });
      for (const lesson of entry.chapters[0].lessons.filter(lesson => lesson.kind !== 'reference')) {
        const row = { bookId: entry.id, bookVersion: kind === 'stale' ? 'old-version' : entry.version, sourceBookId: sourceId, sourceSha256: sha(original), extractedSha256: sha(raw), lessonId: lesson.id, lessonFingerprint: lessonSourceFingerprint(entry.chapters[0], lesson), pdfStartPage: lesson.id === 'empty' ? 2 : 1, pdfEndPage: lesson.id === 'empty' ? 2 : 3, titleMatched: lesson.id !== 'empty', candidateAtomIds: [], rationale: 'Candidate only', evidence: [], reviewStatus: 'unreviewed', approvedAtomIds: [] };
        rows.push(kind === 'unbound' ? { ...row, bookVersion: undefined } : row); if (kind === 'duplicate') rows.push(row);
      }
    }
    const registryPath = join(directory, 'registry.json'), manifestPath = join(directory, 'manifest.json'), candidatesPath = join(directory, 'candidates.json');
    writeFileSync(registryPath, JSON.stringify({ books })); writeFileSync(manifestPath, JSON.stringify({ books: manifests })); writeFileSync(candidatesPath, JSON.stringify({ format: 'textbook-mapping-candidates-v1', sourceIdentityVersion: 'textbook-source-candidate-v1', rows }));
    const proofIds = installSyntheticEditionConformities(directory);
    for (const row of rows) row.editionProofFingerprint = proofIds.get(row.bookId);
    writeFileSync(candidatesPath, JSON.stringify({ format: 'textbook-mapping-candidates-v1', sourceIdentityVersion: 'textbook-source-candidate-v1', rows }));
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: postgres ? 'postgres' : 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', STUDY_ASSET_ROOT: assets, TEXTBOOK_BASE_PATH: '', STUDY_TEXTBOOK_REGISTRY: registryPath, STUDY_TEXTBOOK_SOURCE_MANIFEST: manifestPath, STUDY_PRIMARY_TEXTBOOK_SOURCE_MANIFEST: join(directory, 'not-installed.json'), STUDY_TEXTBOOK_MAPPING_CANDIDATES: candidatesPath });
    if (postgres) process.env.DATABASE_URL = postgres; else delete process.env.DATABASE_URL;
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init(); store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService); sources = app.get(load('modules/diagnostics/textbook-registry.service').TextbookRegistryService);
    async function register(role: string) { const response = await request(app.getHttpServer()).post('/api/auth/register').send({ principal: 'source-' + randomUUID(), credential: 'generated-source-test-only' }); expect(response.status).toBe(201); const actor = response.body.data; if (role !== 'parent') await store.transaction(() => { store.find('users', { id: actor.user.id }).role = role; }); return actor; }
    admin = await register('admin'); teacher = await register('teacher'); parent = await register('parent');
    async function post(path: string, body: unknown) { const response = await request(app.getHttpServer()).post('/api' + path).set('Authorization', 'Bearer ' + parent.token).send(body as object); expect(response.status).toBe(201); return response.body.data; }
    const child = (await post('/students', { nickname: 'Original source authorization fixture', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile;
    await post('/students/' + child.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: 'Generated actual learning identity for a source denial check' });
    const code = await post('/students/' + child.id + '/learning-access/codes', { expectedVersion: 1, requestKey: randomUUID() });
    const login = await request(app.getHttpServer()).post('/api/auth/learning-code').send({ code: code.code }); expect(login.status).toBe(201); student = login.body.data;
  });
  afterAll(async () => { await app?.close(); for (const name of names) if (prior[name] === undefined) delete process.env[name]; else process.env[name] = prior[name]; });

  it('returns complete exact text and empty-page status without changing any native row or task', async () => {
    const before = await cold(), tasks = await store.tasks.summary(), first = await api(admin, route()), body = first.body.data;
    expect(body).toMatchObject({ bookId: book.id, bookVersion: book.version, lessonId: 'lesson', page: 1, text: pages[0].text, textCharacters: [...pages[0].text].length, locatorStatus: 'candidate_needs_review', contentReview: 'not_reviewed', pageRange: { start: 1, end: 3 }, sourceSha256: sha(original), extractedSha256: sha(extraction) });
    expect(first.headers['cache-control']).toBe('private, no-store'); expect(JSON.stringify(body)).not.toContain(directory); expect(body).not.toHaveProperty('path');
    const empty = (await api(teacher, route('qa:valid', 'empty'))).body.data; expect(empty).toMatchObject({ page: 2, text: '', extractionStatus: 'no_text', titleMatched: false });
    const last = (await api(admin, route('qa:valid', 'lesson', '?page=3'))).body.data; expect(last.text).toBe(pages[2].text); expect(last.fingerprint).not.toBe(body.fingerprint);
    const long = (await api(admin, route('qa:long-page'))).body.data; expect(long.text).toBe('完整正文😀\n'.repeat(30000)); expect(long.textCharacters).toBe([...long.text].length);
    expect(await cold()).toEqual(before); expect(await store.tasks.summary()).toEqual(tasks);
  });
  it('rejects unbound, stale, duplicate and incorrectly identified extraction sources', async () => {
    const before = await cold();
    for (const kind of ['wrong-id', 'wrong-pdf', 'missing-page', 'duplicate-page', 'reordered-page', 'stale', 'unbound', 'duplicate']) await api(admin, route('qa:' + kind), 409);
    for (const suffix of ['?page=0', '?page=4', '?page=1.5', '?page=1&page=2', '?unknown=1']) await api(admin, route('qa:valid', 'lesson', suffix), 400);
    await api(admin, route('qa:valid', 'appendix'), 404); await api(admin, route('qa:valid', 'missing'), 404);
    expect(await cold()).toEqual(before);
  });
  it('requires a current editor identity before reading private textbook text or originals', async () => {
    const before = await cold(); for (const actor of [parent, student]) { await api(actor, route(), 403); await api(actor, documentRoute, 403); }
    await api(null, route(), 401); expect(await cold()).toEqual(before);
  });
  it('streams complete and ranged original bytes while closing malformed ranges', async () => {
    const before = await cold(); expect((await api(admin, documentRoute)).body).toEqual(original);
    for (const [range, expected] of [['bytes=0-7', original.subarray(0, 8)], ['bytes=-5', original.subarray(-5)], ['bytes=8-', original.subarray(8)]] as const) {
      const response = await request(app.getHttpServer()).get('/api' + documentRoute).set('Authorization', 'Bearer ' + teacher.token).set('Range', range); expect(response.status).toBe(206); expect(response.body).toEqual(expected); expect(response.headers.etag).toBe('"' + sha(original) + '"');
    }
    for (const range of ['bytes=99999-', 'bytes=1-0', 'bytes=-0', 'bytes=0-1,3-4']) { const response = await request(app.getHttpServer()).get('/api' + documentRoute).set('Authorization', 'Bearer ' + admin.token).set('Range', range); expect(response.status).toBe(416); }
    expect(await cold()).toEqual(before);
  });
  it('rehashes both source files after same-size writes with restored modification times', async () => {
    const when = new Date('2026-01-01T00:00:00Z'); utimesSync(pdf, when, when); await api(admin, documentRoute); const before = statSync(pdf), changed = Buffer.from(original); changed[12] ^= 1;
    try { writeFileSync(pdf, changed); utimesSync(pdf, when, when); expect(statSync(pdf).mtimeMs).toBe(before.mtimeMs); expect(statSync(pdf).size).toBe(before.size); await api(admin, documentRoute, 503); await api(admin, route(), 503); }
    finally { writeFileSync(pdf, original); }
    const file = join(assets, 'valid.json'); utimesSync(file, when, when); await api(admin, route()); const tampered = Buffer.from(extraction); tampered[tampered.indexOf(Buffer.from('Original'))] ^= 1;
    try { writeFileSync(file, tampered); utimesSync(file, when, when); await api(admin, route(), 409); }
    finally { writeFileSync(file, extraction); }
    await api(admin, route());
  });
  it.each(['role', 'session'])('rechecks %s changes during asynchronous source verification and closes the held descriptor', async kind => {
    let enter!: () => void, resume!: () => void, handle: any; const entered = new Promise<void>(resolve => { enter = resolve; }), proceed = new Promise<void>(resolve => { resume = resolve; });
    const originalDocument = sources.document.bind(sources), spy = vi.spyOn(sources, 'document').mockImplementationOnce(async (...args: unknown[]) => { const document = await originalDocument(...args); handle = document.handle; enter(); await proceed; return document; });
    const pending = api(admin, kind === 'role' ? documentRoute : route(), 403); await entered;
    try { await store.transaction(() => { if (kind === 'role') store.find('users', { id: admin.user.id }).role = 'parent'; else store.find('sessions', { userId: admin.user.id }).revokedAt = new Date().toISOString(); }); resume(); await pending; expect(handle.fd).toBe(-1); }
    finally { resume(); spy.mockRestore(); await store.transaction(() => { store.find('users', { id: admin.user.id }).role = 'admin'; store.find('sessions', { userId: admin.user.id }).revokedAt = null; }); }
    await api(admin, route());
  });
});

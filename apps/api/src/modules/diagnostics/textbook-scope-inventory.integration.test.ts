import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { CurriculumBook } from '@study-agent/contracts';
import { DomainDatabase } from '../../infrastructure/domain-database';

const postgres = process.env.STUDY_TEST_TEXTBOOK_SCOPE_POSTGRES_URL;
describe('actual full textbook scope and missing-book HTTP on ' + (postgres ? 'PostgreSQL' : 'SQLite'), () => {
  const candidate = resolve(process.cwd(), '../..'), qa = join(candidate, 'data/qa'); mkdirSync(qa, { recursive: true });
  const directory = mkdtempSync(join(qa, 'textbook-scope-')), registryPath = join(directory, 'registry.json');
  const names = ['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'DATABASE_URL', 'STUDY_TEXTBOOK_REGISTRY'] as const;
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const load = (file: string) => require('../../../dist/apps/api/src/' + file + '.js');
  let app: any, store: any, admin: any, teacher: any, parent: any, student: any;
  async function api(actor: any, route: string, expected = 200) { const call = request(app.getHttpServer()).get('/api' + route); if (actor) call.set('Authorization', 'Bearer ' + actor.token); const result = await call; expect(result.status, JSON.stringify(result.body.error)).toBe(expected); return result.body.data; }
  const list = (query = '', actor = admin, expected = 200) => api(actor, '/admin/curriculum/textbook-mapping-worklist' + query, expected);
  async function cold() { const db = new DomainDatabase(postgres ?? join(directory, 'study-agent.sqlite3')); await db.open(); try { return await db.read(); } finally { await db.close(); } }
  beforeAll(async () => {
    if (postgres) { const url = new URL(postgres); if (url.hostname !== '127.0.0.1' || url.port !== '15452' || url.pathname !== '/study_textbook_scope') throw Error('Exact generated PostgreSQL required'); }
    const registry = JSON.parse(readFileSync(join(candidate, 'resources/curriculum/textbooks-v1.json'), 'utf8'));
    const book = (id: string, term: 'upper' | 'lower', chapters: CurriculumBook['chapters'] = [], chapterState: 'available' | 'missing' = 'missing'): CurriculumBook => ({ id: 'qa-scope:' + id, subject: 'chemistry', grade: 9, term, title: 'Original QA ' + id, edition: 'Synthetic inventory edition', version: 'qa-v1', source: 'public_catalog', sourceRef: 'original QA metadata only', sourceSha256: 'a'.repeat(64), chapterState, chapters });
    const chapter = (lessons: CurriculumBook['chapters'][number]['lessons']) => [{ id: 'qa-unit', name: 'Original QA unit', lessons }];
    registry.books.push(...Array.from({ length: 12 }, (_, index) => book('missing-' + index, 'upper')),
      book('usable', 'upper', chapter([{ id: 'combined', name: 'Combined', parts: [{ name: 'Part one', printedPage: 1 }, { name: 'Part two', printedPage: 2 }] }, { id: 'activity', name: 'Activity', kind: 'activity' }, { id: 'reference', name: 'Appendix', kind: 'reference' }]), 'available'),
      book('appendix', 'upper', chapter([{ id: 'only-reference', name: 'Reference only', kind: 'reference' }]), 'available'),
      book('unconfirmed', 'upper', chapter([{ id: 'unconfirmed', name: 'Unconfirmed' }])), book('lower-one', 'lower'), book('lower-two', 'lower'));
    writeFileSync(registryPath, JSON.stringify(registry));
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: postgres ? 'postgres' : 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', STUDY_TEXTBOOK_REGISTRY: registryPath });
    if (postgres) process.env.DATABASE_URL = postgres; else delete process.env.DATABASE_URL;
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init(); store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
    async function register(role: string) { const result = await request(app.getHttpServer()).post('/api/auth/register').send({ principal: 'scope-' + randomUUID(), credential: 'synthetic-textbook-scope-only' }); expect(result.status).toBe(201); const actor = result.body.data; if (role !== 'parent') await store.transaction(() => { store.find('users', { id: actor.user.id }).role = role; }); return actor; }
    admin = await register('admin'); teacher = await register('teacher'); parent = await register('parent');
    async function parentPost(route: string, input: unknown) { const response = await request(app.getHttpServer()).post('/api' + route).set('Authorization', 'Bearer ' + parent.token).send(input as object); expect(response.status, JSON.stringify(response.body.error)).toBe(201); return response.body.data; }
    const child = (await parentPost('/students', { nickname: 'Synthetic scope authorization', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile;
    await parentPost('/students/' + child.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: 'Only generated actual learner authorization for a read-only denial check' });
    const code = await parentPost('/students/' + child.id + '/learning-access/codes', { expectedVersion: 1, requestKey: randomUUID() });
    const login = await request(app.getHttpServer()).post('/api/auth/learning-code').send({ code: code.code }); expect(login.status).toBe(201); student = login.body.data;
  });
  afterAll(async () => { await app?.close(); for (const name of names) if (prior[name] === undefined) delete process.env[name]; else process.env[name] = prior[name]; });
  it('accounts for the actual 449 primary books and 3512 lessons while preserving every native row and queue', async () => {
    const before = await cold(), tasks = await store.tasks.summary(), totals = { books: 0, structured: 0, gaps: 0, lessons: 0 };
    for (const subject of ['math', 'chinese', 'english']) {
      const result = await list('?subject=' + subject + '&pageSize=1&bookPageSize=1');
      totals.books += result.inventory.registeredBooks; totals.structured += result.inventory.booksWithProgressLessons; totals.gaps += result.inventory.booksWithoutProgressLessons; totals.lessons += result.inventory.progressLessons;
      expect(result.bookGaps.rows.length).toBeLessThanOrEqual(1); expect(result.bookGaps.total).toBe(result.inventory.booksWithoutProgressLessons);
    }
    expect(totals).toEqual({ books: 449, structured: 113, gaps: 336, lessons: 3512 });
    const registered = JSON.parse(readFileSync(process.env.STUDY_TEXTBOOK_REGISTRY!, 'utf8')).books, independent = registered.find((book: any) => book.id === 'archive-book:chinese-g3-upper-02915a7db6517258');
    expect(independent.chapters.flatMap((chapter: any) => chapter.lessons)).toHaveLength(51); expect(independent.chapters.flatMap((chapter: any) => chapter.lessons).filter((lesson: any) => lesson.number)).toHaveLength(27);
    expect(registered.filter((book: any) => ['math', 'chinese', 'english'].includes(book.subject) && book.id !== independent.id)).toHaveLength(448);
    expect(await cold()).toEqual(before); expect(await store.tasks.summary()).toEqual(tasks);
  });
  it('keeps whole-book gaps independent of lesson filters and pages the exact book identities separately', async () => {
    const query = '?subject=chemistry&grade=9&term=upper&status=approved&candidate=with&source=matched&pageSize=1&bookPageSize=2', before = await cold();
    const first = await list(query), second = await list(query + '&bookPage=2', teacher);
    expect(first.inventory).toEqual({ registeredBooks: 15, booksWithProgressLessons: 1, booksWithoutProgressLessons: 14, progressLessons: 2 });
    expect(first.rows).toEqual([]); expect(first.total).toBe(0); expect(first.bookGaps.total).toBe(14);
    expect(first.bookGaps.rows.map((row: any) => row.bookId)).toEqual(['qa-scope:missing-0', 'qa-scope:missing-1']);
    expect(second.bookGaps.rows.map((row: any) => row.bookId)).toEqual(['qa-scope:missing-2', 'qa-scope:missing-3']);
    const end = await list(query + '&bookPage=7'); expect(end.bookGaps.rows.map((row: any) => row.reason)).toEqual(['no_progress_lessons', 'unconfirmed_chapters']);
    const all = await list('?subject=chemistry&grade=9&term=upper'); expect(all.rows.map((row: any) => row.lessonId)).toEqual(['combined', 'activity']);
    expect(await cold()).toEqual(before);
  });
  it('represents wholly missing and empty scopes without inventing a lesson and rejects unbounded or unknown queries', async () => {
    const missing = await list('?subject=chemistry&grade=9&term=lower'); expect(missing.inventory).toEqual({ registeredBooks: 2, booksWithProgressLessons: 0, booksWithoutProgressLessons: 2, progressLessons: 0 }); expect(missing.rows).toEqual([]);
    const empty = await list('?subject=math&grade=9'); expect(empty.inventory).toEqual({ registeredBooks: 0, booksWithProgressLessons: 0, booksWithoutProgressLessons: 0, progressLessons: 0 }); expect(empty.bookGaps).toEqual({ total: 0, page: 1, pageSize: 10, rows: [] });
    for (const query of ['?bookPage=0', '?bookPage=10001', '?bookPageSize=31', '?bookPageSize=0', '?bookPageSize=1.5', '?unknown=1']) await list(query, admin, 400);
  });
  it('checks current editor roles on every read, including a real teacher revocation', async () => {
    await list('', null, 401); await list('', parent, 403); await list('', student, 403);
    await store.transaction(() => { store.find('users', { id: teacher.user.id }).role = 'parent'; }); const before = await cold();
    await list('', teacher, 403); expect(await cold()).toEqual(before);
  });
});

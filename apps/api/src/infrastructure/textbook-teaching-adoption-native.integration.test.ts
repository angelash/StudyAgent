import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { DomainDatabase } from './domain-database';
import { teachingAdoptionNativeFixture } from '../modules/diagnostics/textbook-teaching-adoption-fixture';
import { currentTeachingAdoptionMaterials, teachingAdoptionStore } from '../modules/diagnostics/textbook-teaching-adoption';
import { teachingHash } from '../modules/diagnostics/textbook-teaching-package';
import { accountRecords, studentRecords, removeSelected, selectionCounts } from '../modules/privacy/privacy-records';
import type { InMemoryStoreService } from './in-memory-store.service';

const configured = process.env.STUDY_TEST_TEACHING_POSTGRES_URL, qa = resolve(process.cwd(), '../../data/qa'); mkdirSync(qa, { recursive: true });
const directory = mkdtempSync(join(qa, 'teaching-adoption33-native-')); let pool: Pool | undefined;
async function location(label: string) {
  if (!configured) return join(directory, label + '.sqlite3');
  const url = new URL(configured); if (url.hostname !== '127.0.0.1' || url.port !== '15455' || url.pathname !== '/study_teaching_package33') throw Error('Exact isolated teaching33 database required');
  pool ??= new Pool({ connectionString: configured, max: 2 }); const schema = 'teaching_adoption33_' + randomUUID().replaceAll('-', ''); await pool.query('CREATE SCHEMA "' + schema + '"');
  url.searchParams.set('options', '-c search_path=' + schema); return url.toString();
}
async function sql(url: string, text: string, values: any[] = []): Promise<any[]> {
  if (!configured) { const database = new DatabaseSync(url); try { return database.prepare(text).all(...values); } finally { database.close(); } }
  const database = new Pool({ connectionString: url, max: 1 }); try { let position = 0; return (await database.query(text.replace(/\?/g, () => '$' + ++position), values)).rows; } finally { await database.end(); }
}
async function native(url: string) { return { records: (await sql(url, 'SELECT collection,record_id,body,position FROM domain_records ORDER BY collection,position,record_id')).map(row => ({ ...row, body: typeof row.body === 'string' ? JSON.parse(row.body) : row.body })),
  meta: await sql(url, 'SELECT * FROM store_meta'), tasks: await sql(url, 'SELECT * FROM durable_tasks'), history: await sql(url, 'SELECT * FROM durable_task_history') }; }
async function setup(label: string, adopt = true) {
  const f = teachingAdoptionNativeFixture(), url = await location(label), database = new DomainDatabase(url); await database.open();
  const common = structuredClone(f.native.before); for (const name of ['textbookTeachingPackages', 'textbookTeachingVersions', 'textbookTeachingSources', 'textbookTeachingCommands']) common[name] = [];
  await database.commit(await database.read(), common);
  const saved = f.native.saved, initial = { ...common, textbookTeachingPackages: [saved.header], textbookTeachingVersions: [saved.saved!], textbookTeachingSources: [saved.source!], textbookTeachingCommands: [saved.command] };
  await database.commit(await database.read(), initial);
  const published = { ...initial, textbookTeachingPackages: [f.native.published.header], textbookTeachingCommands: [saved.command, f.native.published.command] };
  await database.commit(await database.read(), published);
  if (adopt) await database.commit(await database.read(), f.native.state);
  return { ...f, url, database };
}
afterAll(async () => { await pool?.end(); });
describe('actual ' + (configured ? 'PostgreSQL' : 'SQLite') + ' fifth textbook adoption collection', () => {
  it('creates original author commands then atomically freezes all goals/materials with the real course, and cold-opens twice', async () => {
    const f = await setup('cold'); await f.database.close(); const before = await native(f.url);
    for (let n = 0; n < 2; n++) { const cold = new DomainDatabase(f.url); await cold.open(); const state = (await cold.read()).state; await cold.close();
      expect(state.textbookTeachingAdoptions).toEqual([f.record]); expect(state.studioCourses).toEqual([f.course]); expect(currentTeachingAdoptionMaterials(teachingAdoptionStore(state), f.record)).toHaveLength(40);
      for (const ref of f.record.qualification.materials) expect(JSON.stringify(state.studioCourses)).not.toContain(ref.contentFingerprint);
    }
    expect(teachingHash(await native(f.url))).toBe(teachingHash(before));
  });
  it.each(['answer', 'binding', 'scope', 'withdrawn'] as const)('rolls back the entire real native transaction when %s changes before adoption', async kind => {
    const f = await setup('reject-' + kind, false), before = await native(f.url), next = structuredClone(f.native.state);
    if (kind === 'answer') next.questions[0].answer = 'changed-private-answer';
    if (kind === 'binding') next.bindings = [];
    if (kind === 'scope') next.learningScopes[0].version++;
    if (kind === 'withdrawn') { next.textbookTeachingPackages[0].status = 'withdrawn'; next.textbookTeachingPackages[0].published = null; }
    await expect(f.database.commit(await f.database.read(), next)).rejects.toThrow(/integrity/); await f.database.close(); expect(teachingHash(await native(f.url))).toBe(teachingHash(before));
  });
  it('enforces the actual unique adopted-lesson index before a direct duplicate insert', async () => {
    const f = await setup('unique'); await f.database.close(); const before = await native(f.url), duplicate = { ...structuredClone(f.record), id: 'another-native-identity' };
    await expect(sql(f.url, 'INSERT INTO domain_records(collection,record_id,body,position) VALUES(?,?,?,?)', ['textbookTeachingAdoptions', duplicate.id, JSON.stringify(duplicate), 1])).rejects.toThrow();
    expect(teachingHash(await native(f.url))).toBe(teachingHash(before));
  });
  it('refuses immutable qualification rewrites and removal without actual erasure, preserving every native row/task/history', async () => {
    const f = await setup('immutable'), before = await native(f.url), saved = await f.database.read(), next = structuredClone(saved.state), changed = next.textbookTeachingAdoptions[0] as any;
    changed.scopeVersion++; const { fingerprint: _fingerprint, ...body } = changed; changed.fingerprint = teachingHash(body);
    await expect(f.database.commit(saved, next)).rejects.toThrow(/integrity/);
    const removed = structuredClone(saved.state); removed.textbookTeachingAdoptions = []; await expect(f.database.commit(saved, removed)).rejects.toThrow(/integrity/);
    await f.database.close(); expect(teachingHash(await native(f.url))).toBe(teachingHash(before));
  });
  it('preserves adopted student teaching and private material eligibility when the original author closes', async () => {
    const f = await setup('author-close'), next = (await f.database.read()).state, selected = accountRecords(next as unknown as InMemoryStoreService, 'qa-original-author', 'qa-original-author-only'), counts = selectionCounts(selected);
    removeSelected(next as unknown as InMemoryStoreService, selected); next.privacyRequests ??= []; next.privacyRequests.push({ id: 'qa-close-author', actorId: 'qa-original-author', kind: 'account_delete',
      subjectHash: teachingHash({ id: 'qa-original-author' }), requestKey: 'qa-native-close-author', inputHash: teachingHash({ synthetic: 'author-close' }), completedAt: new Date().toISOString(), counts, erasedStudentHashes: [], retainedStudentHashes: [] });
    await f.database.commit(await f.database.read(), next); await f.database.close(); const cold = new DomainDatabase(f.url); await cold.open(); const state = (await cold.read()).state; await cold.close();
    expect(state.textbookTeachingPackages ?? []).toEqual([]); expect(state.textbookTeachingCommands ?? []).toEqual([]); expect(state.studioCourses).toEqual([f.course]); expect(state.textbookTeachingAdoptions).toEqual([f.record]);
    expect(currentTeachingAdoptionMaterials(teachingAdoptionStore(state), f.record)).toHaveLength(40);
  });
  it('removes the server qualification only with the original student/course under its actual native deletion receipt', async () => {
    const f = await setup('student-erase'), next = (await f.database.read()).state, selected = studentRecords(next as unknown as InMemoryStoreService, f.course.studentId), counts = selectionCounts(selected);
    removeSelected(next as unknown as InMemoryStoreService, selected); next.privacyRequests ??= []; next.privacyRequests.push({ id: 'qa-erase-adopted-child', actorId: 'qa-adopter-parent', kind: 'student_delete',
      subjectHash: teachingHash({ id: f.course.studentId }), requestKey: 'qa-native-erase-adopted-child', inputHash: teachingHash({ synthetic: 'student-erasure' }), completedAt: new Date().toISOString(), counts,
      erasedStudentHashes: [teachingHash({ id: f.course.studentId })], retainedStudentHashes: [] });
    await f.database.commit(await f.database.read(), next); await f.database.close(); const cold = new DomainDatabase(f.url); await cold.open(); const state = (await cold.read()).state; await cold.close();
    expect(state.textbookTeachingAdoptions ?? []).toEqual([]); expect(state.studioCourses ?? []).toEqual([]); expect(state.students ?? []).toEqual([]); expect(state.questions).toHaveLength(40);
  });
  it('refuses a missing legacy33 adoption index without silently changing the current database', async () => {
    const f = await setup('obsolete', false); await f.database.close(); await sql(f.url, 'DROP INDEX textbook_teaching_adopted_lesson'); const before = await native(f.url), cold = new DomainDatabase(f.url);
    try { await expect(cold.open()).rejects.toThrow('textbook_teaching_schema33_candidate_incomplete'); } finally { await cold.close(); }
    expect(teachingHash(await native(f.url))).toBe(teachingHash(before)); expect(Number((await sql(f.url, 'SELECT MAX(version) version FROM schema_migrations'))[0].version)).toBe(37);
  });
});

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { workspaceRoot } from '../../infrastructure/workspace-paths';

const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
describe('GESP certification research: provenance, bounded reads and isolation', () => {
  let app: any, service: any, store: any, admin: any, teacher: any, parent: any, student: any, rows: any[], docSha: string;
  const root = mkdtempSync(join(tmpdir(), 'study-gesp-'));
  const previous = { data: process.env.STUDY_DATA_DIR, gesp: process.env.STUDY_GESP_ROOT };
  const resource = (name: string) => join(workspaceRoot(), 'resources/gesp', name);
  beforeAll(async () => {
    process.env.STUDY_DATA_DIR = join(root, 'business'); process.env.STUDY_GESP_ROOT = root;
    mkdirSync(join(root, 'questions')); mkdirSync(join(root, 'raw'));
    const all = readFileSync(resource('questions.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    rows = [all[0], all[1], all.find(q => q.sourceKind === 'mirror_exam' && q.kind === 'choice'), all.find(q => q.sourceKind === 'sample' && q.certificationLevel === 3)];
    const pdf = Buffer.from('%PDF-1.4\nsynthetic QA bytes\n%%EOF'); docSha = sha(pdf);
    writeFileSync(join(root, 'raw', `${docSha}.pdf`), pdf);
    const db = new DatabaseSync(join(root, 'catalog.sqlite3'));
    db.exec(`CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE documents(sha256 TEXT PRIMARY KEY,path TEXT,bytes INTEGER);
      CREATE TABLE questions(id TEXT PRIMARY KEY,level INTEGER,session TEXT,kind TEXT,source_kind TEXT,number INTEGER,title TEXT,search_text TEXT,body TEXT);
      CREATE TABLE question_atoms(question_id TEXT,atom_id TEXT);`);
    for (const row of rows) {
      const prompt = `题面 ${row.id} contains literal 100% and 'quote'`, raw = prompt + '\n参考材料';
      row.textSha256 = sha(raw); row.pdfSha256 = docSha;
      writeFileSync(join(root, 'questions', `${row.id}.json`), JSON.stringify({ id: row.id, pdfSha256: docSha,
        rawText: raw, promptMachineText: prompt, referenceMaterialMachineText: '\n参考材料' }));
      db.prepare('INSERT INTO questions VALUES(?,?,?,?,?,?,?,?,?)').run(row.id, row.certificationLevel, row.session ?? 'sample', row.kind,
        row.sourceKind, row.number, row.title, prompt, JSON.stringify(row));
      for (const a of row.atomCandidates) db.prepare('INSERT INTO question_atoms VALUES(?,?)').run(row.id, a.atomId);
    }
    db.prepare('INSERT INTO documents VALUES(?,?,?)').run(docSha, `data/gesp/raw/${docSha}.pdf`, pdf.length);
    const inputSha256 = Object.fromEntries(['questions.jsonl', 'sources.json', 'supplements.json', 'coverage.json', 'knowledge-map.json', 'syllabus-clauses.json', 'teaching-plan.json']
      .map(name => [name, sha(readFileSync(resource(name)))]));
    db.prepare('INSERT INTO metadata VALUES(?,?)').run('summary', JSON.stringify({ format: 'gesp-research-index-v1', questions: 4, inputSha256 })); db.close();
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { AuthService } = require('../../../dist/apps/api/src/modules/auth/auth.service.js');
    const { GespService } = require('../../../dist/apps/api/src/modules/gesp/gesp.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    service = app.get(GespService); store = app.get(InMemoryStoreService); const auth = app.get(AuthService);
    const actors = [];
    for (const role of ['admin', 'teacher', 'parent', 'student']) {
      const actor = await auth.register({ principal: `gesp-${role}-qa`, credential: 'gesp-fixture-credential' });
      store.users.find((u: any) => u.id === actor.user.id).role = role; actors.push(actor);
    }
    [admin, teacher, parent, student] = actors;
    store.bindings.push({ id: 'gesp-binding', parentUserId: parent.user.id, studentId: 'gesp-child', status: 'active', relation: 'guardian' });
    store.studentLearningAccess.push({ id: 'gesp-access', studentId: 'gesp-child', userId: student.user.id, status: 'enabled', version: 1 });
    Object.assign(store.sessions.find((s: any) => s.userId === student.user.id), { guardianId: parent.user.id, studentId: 'gesp-child', accessVersion: 1 });
  });
  afterAll(async () => {
    await app?.close(); rmSync(root, { recursive: true, force: true });
    for (const [key, value] of [['STUDY_DATA_DIR', previous.data], ['STUDY_GESP_ROOT', previous.gesp]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
  });
  const get = (path: string, actor = admin) => request(app.getHttpServer()).get(`/api/gesp${path}`).set('Authorization', `Bearer ${actor.token}`);
  it('requires authentication and denies parents and valid student identities on every route', async () => {
    await request(app.getHttpServer()).get('/api/gesp/overview').expect(401);
    for (const route of ['/overview', '/atoms', '/questions', `/questions/${rows[0].id}`, `/documents/${docSha}`]) {
      await get(route, parent).expect(403); await get(route, student).expect(403);
    }
    await get('/overview', teacher).expect(200);
  });
  it('keeps certification levels outside primary curriculum and preserves official gaps', async () => {
    const before = [store.knowledgeAtoms.length, store.measurementItems.length];
    const result = (await get('/overview').expect(200)).body.data;
    expect(result.track).toBe('gesp-cpp'); expect(result.levels).toHaveLength(8);
    expect(result.sourceGaps.find((x: any) => x.session === '2024-09' && x.level === 4)).toMatchObject({ status: 'public_mirror_fallback', officialStatus: 'missing_official_source' });
    expect([store.knowledgeAtoms.length, store.measurementItems.length]).toEqual(before);
    expect(result.levels[7]).not.toHaveProperty('grade');
  });
  it('paginates and filters in SQLite; literal query text cannot change SQL or expose answers and paths', async () => {
    const page1 = (await get('/questions?level=1&pageSize=1').expect(200)).body.data;
    const page2 = (await get('/questions?level=1&pageSize=1&page=2').expect(200)).body.data;
    expect(page1.total).toBe(2); expect(page1.items).toHaveLength(1); expect(page2.items[0].id).not.toBe(page1.items[0].id);
    expect(page1.items[0]).not.toHaveProperty('answer'); expect(page1.items[0]).not.toHaveProperty('textPath'); expect(page1.items[0]).not.toHaveProperty('pdfPath');
    const literal = (await get('/questions?q=' + encodeURIComponent("100% and 'quote'")).expect(200)).body.data;
    expect(literal.total).toBe(4);
    const samples = (await get('/questions?session=sample&level=3').expect(200)).body.data;
    expect(samples.total).toBe(1); expect(samples.items[0].session).toBe('sample');
    expect((await get('/questions?q=' + encodeURIComponent("' OR 1=1 --")).expect(200)).body.data.total).toBe(0);
    for (const query of ['level=9', 'grade=4', 'pageSize=1000', 'session=2024-13', 'atomId=gesp-cpp.l1.unknown']) await get('/questions?' + query).expect(400);
  });
  it('retains mirror provenance and uses a mirror answer basis, never an official label', async () => {
    const result = (await get('/questions?session=2024-09&level=4&sourceKind=mirror_exam&kind=choice').expect(200)).body.data;
    expect(result.total).toBe(1); expect(result.items[0].sourceAuthority).toBe('public_mirror_not_official');
    const detail = (await get(`/questions/${rows[2].id}`).expect(200)).body.data;
    expect(detail.answerBasis).toContain('mirror_'); expect(detail.publicationStatus).toBe('research_only');
    expect(detail.hiddenTestDataStatus).toBe('not_collected');
  });
  it('verifies single-question bytes; missing assets are explicit and corrupted text is rejected', async () => {
    const path = join(root, 'questions', `${rows[0].id}.json`), original = readFileSync(path);
    expect((await get(`/questions/${rows[0].id}`).expect(200)).body.data.archiveStatus).toBe('available');
    renameSync(path, path + '.saved');
    expect((await get(`/questions/${rows[0].id}`).expect(200)).body.data).toMatchObject({ archiveStatus: 'missing', content: null });
    renameSync(path + '.saved', path);
    const altered = JSON.parse(original.toString()); altered.rawText += 'wrong'; writeFileSync(path, JSON.stringify(altered));
    await get(`/questions/${rows[0].id}`).expect(503); writeFileSync(path, original);
    await get('/questions/gesp-cpp-2020-03-l01-choice-01').expect(404);
  });
  it('serves only registered hash-verified PDF bytes', async () => {
    const response = await get(`/documents/${docSha}`).expect(200);
    expect(response.headers['content-type']).toContain('application/pdf'); expect(response.headers['cache-control']).toContain('private');
    await get(`/documents/${'a'.repeat(64)}`).expect(404); await get('/documents/not-a-hash').expect(400);
    const path = join(root, 'raw', `${docSha}.pdf`), original = readFileSync(path); writeFileSync(path, 'damaged');
    await get(`/documents/${docSha}`).expect(503); writeFileSync(path, original);
  });
  it('covers all 49 initial atoms in the 15-unit teaching draft without inventing student mastery', async () => {
    const atoms = (await get('/atoms').expect(200)).body.data;
    const plan = (await get('/overview').expect(200)).body.data.teachingPlan;
    const ids = plan.units.flatMap((u: any) => u.atomIds);
    expect(plan.units).toHaveLength(15); expect(ids).toHaveLength(49); expect(new Set(ids).size).toBe(49);
    expect(new Set(ids)).toEqual(new Set(atoms.filter((a: any) => a.level <= 4).map((a: any) => a.id)));
    expect(atoms.every((a: any) => a.reviewStatus === 'draft' && a.publicationStatus === 'research_only')).toBe(true);
    await get('/atoms?grade=4').expect(400);
  });
  it('supports metadata without an index and rejects a mismatched index version', () => {
    const { GespService } = require('../../../dist/apps/api/src/modules/gesp/gesp.service.js');
    const isolated = join(root, 'isolated'); mkdirSync(isolated); process.env.STUDY_GESP_ROOT = isolated;
    const fresh = new GespService(), actor = { role: 'admin' };
    expect(fresh.overview(actor).ready).toBe(false); expect(() => fresh.search(actor, {})).toThrow('GESP索引未安装');
    const db = new DatabaseSync(join(isolated, 'catalog.sqlite3'));
    db.exec('CREATE TABLE metadata(key TEXT,value TEXT)'); db.prepare('INSERT INTO metadata VALUES(?,?)').run('summary', JSON.stringify({ format: 'gesp-research-index-v1', inputSha256: {} })); db.close();
    expect(() => fresh.search(actor, {})).toThrow('GESP索引与资料版本不符');
    process.env.STUDY_GESP_ROOT = root; expect(existsSync(join(root, 'catalog.sqlite3'))).toBe(true);
  });
});

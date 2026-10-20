import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AtomTeaching, CurriculumPackage, KnowledgeAtom } from '@study-agent/contracts';
import { atomTeachingSchema } from '@study-agent/contracts';
import { buildFoundationCurriculum } from './foundation-curriculum';
import { authoredTeachingUpdates } from './foundation-seed.service';

const definition = (id: string, extra: Partial<KnowledgeAtom> = {}): KnowledgeAtom => ({ id, subject: 'math', grade: 3, term: 'both',
  name: id, strand: '数与运算', objective: '独立比较两个数量并说明数量关系', successCriterion: '在不同新题中独立比较并解释关系',
  prerequisiteIds: [], curriculumVersion: 'fixture-v1', status: 'published', version: 1, ...extra });
const teaching = (): AtomTeaching => structuredClone(buildFoundationCurriculum().find(row => row.atom.teaching)!.atom.teaching!);
const pack = (atoms: KnowledgeAtom[], versions?: number[]): CurriculumPackage => ({ format: 'study-curriculum-package-v1',
  title: '隔离课程定义测试包', provenance: '独立合成课程资料，仅用于验证导入、版本和审核边界。',
  atoms: atoms.map((atom, i) => ({ atom, expectedVersion: versions?.[i] ?? 0 })) });

describe('versioned curriculum packages and instructional evidence', () => {
  let app: any, store: any, auth: any, admin: any, other: any, parent: any, teacher: any;
  const directory = mkdtempSync(join(tmpdir(), 'study-curriculum-package-'));
  const previousDir = process.env.STUDY_DATA_DIR;
  beforeAll(async () => {
    process.env.STUDY_DATA_DIR = directory;
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { AuthService } = require('../../../dist/apps/api/src/modules/auth/auth.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(InMemoryStoreService); auth = app.get(AuthService);
  });
  beforeEach(async () => {
    store.reset();
    const actors: any[] = [];
    for (const role of ['admin', 'admin', 'parent', 'teacher']) {
      const actor: any = await auth.register({ principal: `package-${role}-${actors.length}`, credential: 'package-secret-123' }, `package-fixture-${actors.length}`);
      store.users.find((user: any) => user.id === actor.user.id).role = role; actors.push(actor);
    }
    [admin, other, parent, teacher] = actors;
  });
  afterAll(async () => {
    await app.close(); rmSync(directory, { recursive: true, force: true });
    if (previousDir === undefined) delete process.env.STUDY_DATA_DIR; else process.env.STUDY_DATA_DIR = previousDir;
  });
  async function call(method: 'get' | 'post' | 'put' | 'patch', path: string, body?: unknown, actor = admin, expected?: number) {
    let query = request(app.getHttpServer())[method](`/api${path}`).set('Authorization', `Bearer ${actor.token}`);
    if (Buffer.isBuffer(body)) query = query.set('Content-Type', 'application/octet-stream').send(body);
    else if (body !== undefined) query = query.send(body as object);
    const response = await query.expect(expected ?? (method === 'post' ? 201 : 200)); return response.body.data;
  }
  async function upload(content: unknown, mediaType = 'application/json') {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(JSON.stringify(content));
    const file = await call('post', '/admin/import-files', { name: mediaType === 'application/json' ? '课程.json' : '原卷.pdf',
      mediaType, size: bytes.length, requestKey: crypto.randomUUID() });
    for (let index = 0; index < Math.ceil(bytes.length / file.chunkSize); index++)
      await call('put', `/admin/import-files/${file.id}/chunks/${index}`, bytes.subarray(index * file.chunkSize, (index + 1) * file.chunkSize));
    return call('post', `/admin/import-files/${file.id}/complete`, {});
  }
  const preview = (fileId: string, actor = admin, expected?: number) => call('post', '/admin/curriculum/packages/preview', { fileId }, actor, expected);
  const apply = (view: any, requestKey: string = crypto.randomUUID(), actor = admin, expected?: number) => call('post', '/admin/curriculum/packages/apply',
    { fileId: view.fileId, fingerprint: view.fingerprint, reviewed: true, requestKey }, actor, expected);

  it('previews and applies forward references atomically, deduplicates receipts and round-trips without version inflation', async () => {
    const file = await upload(pack([definition('child', { prerequisiteIds: ['base'], parentId: 'base',
      confusableAtomIds: ['base'], transferAtomIds: ['base'], teaching: teaching() }), definition('base')]));
    const view = await preview(file.id);
    expect(view).toMatchObject({ added: 2, changed: 0, total: 2 });
    expect(store.knowledgeAtoms).toHaveLength(0);
    await call('post', '/admin/curriculum/packages/apply', { fileId: file.id, fingerprint: view.fingerprint, reviewed: false, requestKey: 'not-reviewed' }, admin, 400);
    const result = await apply(view, 'first-package');
    expect(result.applied).toBe(2); expect(result.versions.every((row: any) => row.version === 1)).toBe(true);
    expect(await apply(view, 'first-package')).toEqual(result);
    await call('post', '/admin/curriculum/packages/apply', { fileId: file.id, fingerprint: '0'.repeat(64), reviewed: true, requestKey: 'first-package' }, admin, 409);
    const exported = await call('get', '/admin/curriculum/package?subject=math', undefined, teacher);
    expect(exported.atoms).toHaveLength(2);
    const again = await upload(exported), unchanged = await preview(again.id);
    expect(unchanged).toMatchObject({ added: 0, changed: 0, unchanged: 2 });
    expect((await apply(unchanged)).applied).toBe(0);
    expect(store.knowledgeAtoms.every((atom: KnowledgeAtom) => atom.version === 1)).toBe(true);
  });

  it('rejects duplicate, missing, cyclic, cross-subject and unpublished relationships without partial writes', async () => {
    const invalid: KnowledgeAtom[][] = [
      [definition('a'), definition('a')],
      [definition('a', { prerequisiteIds: ['missing'] })],
      [definition('a', { prerequisiteIds: ['b'] }), definition('b', { prerequisiteIds: ['a'] })],
      [definition('a', { parentId: 'b' }), definition('b', { parentId: 'a' })],
      [definition('a', { confusableAtomIds: ['b'] }), definition('b', { subject: 'english' })],
      [definition('a', { transferAtomIds: ['b'] }), definition('b', { status: 'draft' })],
      [definition('a', { transferAtomIds: ['a'] })],
      [definition('a', { prerequisiteIds: ['b', 'b'] }), definition('b')],
    ];
    for (const atoms of invalid) {
      const file = await upload(pack(atoms)); await preview(file.id, admin, 400);
      await apply({ fileId: file.id, fingerprint: '0'.repeat(64) }, crypto.randomUUID(), admin, 400);
      expect(store.knowledgeAtoms).toHaveLength(0); expect(store.curriculumRevisions).toHaveLength(0);
    }
    // Confusable and transfer edges are not prerequisites and may be reciprocal.
    const file = await upload(pack([definition('a', { confusableAtomIds: ['b'] }), definition('b', { confusableAtomIds: ['a'] })]));
    expect((await apply(await preview(file.id))).applied).toBe(2);
  });

  it('rejects stale definitions and graph changes after preview, including individual editor saves', async () => {
    const original = definition('target'); store.knowledgeAtoms.push(original);
    const file = await upload(pack([definition('target', { objective: '对照不同材料独立完成比较并解释数量关系' })], [1]));
    const view = await preview(file.id);
    const unrelated = await call('post', '/admin/knowledge-atoms', definition('other'));
    await apply(view, 'stale-graph', admin, 409);
    expect(store.knowledgeAtoms.find((atom: KnowledgeAtom) => atom.id === 'target').version).toBe(1);
    const updated = await preview(file.id); expect(updated.fingerprint).not.toBe(view.fingerprint);
    await apply(updated);
    await preview(file.id, admin, 409);
    await call('post', '/admin/knowledge-atoms', { ...unrelated, objective: '根据新的材料再次独立说明数量关系' });
    await call('post', '/admin/knowledge-atoms', unrelated, admin, 409);
  });

  it('removes omitted optional definitions, preserves old revisions and rejects stale additions', async () => {
    store.knowledgeAtoms.push(definition('base'), definition('child', { parentId: 'base', confusableAtomIds: ['base'], transferAtomIds: ['base'], teaching: teaching() }));
    const file = await upload(pack([definition('child')], [1])), view = await preview(file.id);
    expect(view.changes[0].fields.map((field: any) => field.field)).toEqual(expect.arrayContaining(['parentId', 'confusableAtomIds', 'transferAtomIds', 'teaching']));
    expect((await apply(view)).applied).toBe(1);
    expect(store.knowledgeAtoms.find((atom: KnowledgeAtom) => atom.id === 'child')).toEqual(definition('child', { version: 2 }));
    const history = await call('get', '/admin/curriculum/revisions/child');
    expect(history.map((entry: any) => entry.version)).toEqual([2, 1]);
    expect(history[1].snapshot.teaching.example).toEqual(teaching().example);
    const stale = await upload(pack([definition('child')])); await preview(stale.id, admin, 409);
  });

  it('enforces actor, upload ownership, type and size boundaries', async () => {
    const file = await upload(pack([definition('a')]));
    for (const actor of [parent, teacher, other]) await preview(file.id, actor, 403);
    const view = await preview(file.id);
    for (const actor of [parent, teacher, other]) await apply(view, 'permission-check', actor, 403);
    await call('get', '/admin/curriculum/package', undefined, parent, 403);
    await call('post', '/admin/import-files', { name: 'large.json', mediaType: 'application/json', size: 8 * 1024 * 1024 + 1, requestKey: 'large-package' }, admin, 400);
    const pdf = await upload(Buffer.from('%PDF-1.4\nIsolated type test\n%%EOF'), 'application/pdf'); await preview(pdf.id, admin, 400);
    await call('post', '/admin/processing/handwriting-preview', { fileId: file.id, requestKey: 'not-an-image' }, admin, 400);
    await call('post', '/admin/question-import-jobs', { importType: 'textbook_pdf', subject: 'math', fileIds: [file.id], requestKey: 'not-a-pdf',
      sourcePolicy: { sourceType: 'internal_textbook', licenseClass: 'A_INTERNAL', licenseName: null } }, admin, 400);
  });

  it('rejects malformed UTF-8, strict-schema errors and blob tampering before any definition is applied', async () => {
    for (const content of [Buffer.from('{invalid'), Buffer.from([123, 34, 255, 34, 58, 49, 125]),
      { ...pack([definition('a')]), unexpected: true }, pack([definition('a', { teaching: { ...teaching(), explanation: '短' } })])]) {
      const file = await upload(content); await preview(file.id, admin, 400);
    }
    const file = await upload(pack([definition('a')]));
    const { ImportFilesService } = require('../../../dist/apps/api/src/modules/processing/import-files.service.js');
    const { path } = await app.get(ImportFilesService).readyPath(file.id);
    writeFileSync(path, 'tampered'); await preview(file.id, admin, 400);
    expect(store.knowledgeAtoms).toHaveLength(0);
  });

  it('accepts BOM and leading whitespace while still verifying the complete JSON document', async () => {
    const file = await upload(Buffer.from('\uFEFF' + ' '.repeat(40) + JSON.stringify(pack([definition('whitespace')]))));
    expect((await apply(await preview(file.id))).applied).toBe(1);
  });

  it('keeps draft teaching out of student curriculum and freezes approved guidance and practice snapshots', async () => {
    const draft = { ...teaching(), reviewStatus: 'draft' as const };
    store.knowledgeAtoms.push(definition('target', { teaching: draft }));
    expect((await call('get', '/diagnostics/curriculum?subject=math'))[0].teaching).toBeUndefined();
    const studentId = 'student';
    store.students.push({ id: studentId, userId: 'child-user', nickname: '测试孩子', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: '', english: '' } });
    store.bindings.push({ id: 'binding', studentId, parentUserId: parent.user.id, relation: 'guardian', status: 'active' });
    for (let i = 0; i < 24; i++) {
      const questionId = `q-${i}`;
      store.questions.push({ id: questionId, subject: 'math', type: 'objective', stem: `变式${i}：3+3等于几？`, answer: '6', analysis: '把两组3合在一起。', difficultyLevel: 1, knowledgePointIds: [], status: 'published' });
      store.questionAnswerSchemas.push({ questionId, mode: 'numeric_blank', responseShape: { value: 'number' }, validationRules: {}, gradingConfig: {} });
      store.questionSources.push({ questionId, sourceType: 'internal_authoring', sourceName: '合成测量题', sourcePathOrUrl: '', licenseClass: 'A_INTERNAL', licenseName: 'fixture', importJobId: null, reviewStatus: 'approved', notes: null });
      store.measurementItems.push({ id: `m-${i}`, questionId, questionVersion: 1, atomId: 'target', dimension: 'procedure', family: `f-${i % 6}`, probeRole: 'anchor', expectedSeconds: 15, difficulty: 1, reviewStatus: 'approved', mappingWeight: 1, observationCode: 'mismatch', version: 1 });
    }
    await call('put', `/students/${studentId}/learning-scope`, { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null, textbookVersion: '合成范围', learnedAtomIds: ['target'], currentAtomId: 'target', minutesPerSession: 15 }, parent);
    const session = await call('post', '/diagnostics/sessions', { studentId, subject: 'math', intent: 'baseline', maxItems: 4, includePrerequisites: false }, parent);
    for (const item of session.items) await call('post', `/diagnostics/sessions/${session.id}/responses`, { itemId: item.id, answer: '0', elapsedMs: 2000 }, parent);
    await call('post', `/diagnostics/sessions/${session.id}/complete`, {}, parent);
    const create = () => call('post', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: session.id, minutesPerDay: 10, useAi: false }, parent);
    expect((await create()).actions[0].teachingSnapshot).toBeUndefined();
    const approved = await call('post', '/admin/knowledge-atoms', definition('target', { teaching: teaching() }));
    expect((await call('get', '/diagnostics/curriculum?subject=math'))[0].teaching.reviewStatus).toBe('approved');
    const plan = await create(), snapshot = structuredClone(plan.actions[0].teachingSnapshot);
    expect(snapshot.atomVersion).toBe(approved.version);
    await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'active', expectedRevision: plan.revision, requestKey: crypto.randomUUID() }, parent);
    const practice = await call('post', `/learning/plans/${plan.id}/actions/${plan.actions[0].id}/start`, {}, parent);
    await call('post', '/admin/knowledge-atoms', { ...approved, teaching: { ...approved.teaching, explanation: '这是编辑后新的讲解，用于验证历史指导和练习仍保留旧内容。' } });
    expect((await call('get', `/diagnostics/plans/${plan.id}`, undefined, parent)).actions[0].teachingSnapshot).toEqual(snapshot);
    expect((await call('get', `/learning/practice/${practice.id}`, undefined, parent)).action.teachingSnapshot).toEqual(snapshot);
  });

  it('validates authored cards and enriches only exact unedited seed definitions', () => {
    const definitions = buildFoundationCurriculum(), cards = definitions.filter(row => row.atom.teaching);
    expect(definitions).toHaveLength(257); expect(cards).toHaveLength(definitions.length);
    for (const { atom } of cards) expect(atomTeachingSchema.safeParse(atom.teaching).success, atom.id).toBe(true);
    for (const { atom, exercises } of definitions) {
      expect(exercises.some(item => item.stem === atom.teaching!.example.prompt), atom.id).toBe(false);
      expect(atom.teaching!.commonErrors.every(error => error.alternativeExplanations.length >= 2), atom.id).toBe(true);
    }
    const originals = cards.map(({ atom }) => { const { teaching: _teaching, ...original } = atom; return original; });
    originals[1].name += '用户修改'; originals[2].version = 2;
    const withTeaching = { ...originals[3], teaching: { ...teaching(), reviewStatus: 'draft' as const } };
    const withRelations = { ...originals[4], transferAtomIds: [] };
    const current = originals.map((atom, i) => i === 3 ? withTeaching : i === 4 ? withRelations : atom);
    const updates = authoredTeachingUpdates(current, definitions);
    expect(updates).toHaveLength(cards.filter(row => row.atom.version === 1).length - 4); expect(updates.every(row => row.expectedVersion === 1)).toBe(true);
    const migrated = current.map(atom => updates.find(row => row.atom.id === atom.id)?.atom ?? atom);
    expect(authoredTeachingUpdates(migrated, definitions)).toHaveLength(0);
  });
});

import { installSyntheticEditionConformities } from '../diagnostics/textbook-edition-conformity.fixture';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Pool } from 'pg';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { DomainDatabase } from '../../infrastructure/domain-database';
import { teachingCourseFixture } from './textbook-teaching-course-fixture';
import { teachingHash, teachingSourceDescriptor } from '../diagnostics/textbook-teaching-package';
import { currentTeachingAdoptionMaterials, teachingAdoptionStore } from '../diagnostics/textbook-teaching-adoption';
import { studioCourseCreateSchema } from '@study-agent/contracts';

const root = resolve(process.cwd(), '../..'), qa = join(root, 'data/qa'); mkdirSync(qa, { recursive: true });
const directory = mkdtempSync(join(qa, 'teaching-course33-http-')), dataDir = join(directory, 'data'), assets = join(directory, 'assets'); mkdirSync(dataDir); mkdirSync(assets);
const postgres = process.env.STUDY_TEST_TEACHING_POSTGRES_URL, names = ['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'DATABASE_URL', 'STUDY_ASSET_ROOT', 'TEXTBOOK_BASE_PATH', 'STUDY_TEXTBOOK_REGISTRY', 'STUDY_TEXTBOOK_SOURCE_MANIFEST', 'STUDY_PRIMARY_TEXTBOOK_SOURCE_MANIFEST', 'STUDY_TEXTBOOK_MAPPING_CANDIDATES', 'STUDY_TEXTBOOK_EDITION_CONFORMITIES'] as const,
  previous = Object.fromEntries(names.map(name => [name, process.env[name]])), f = teachingCourseFixture(4), book = structuredClone(f.value.book), credential = 'qa-course-only-' + randomUUID(),
  load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js'), sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex'), teaching = '/admin/curriculum/teaching-packages';
let app: any, store: any, textbooks: any, parent: any, teacher: any, admin: any, other: any, student: any, childId: string, selection: any, scopeInput: any,
  preview: any, created: any, createInput: any, latest: any, sourcePdf: Buffer, bundle: string, practiceBlueprint: any, practiceSession: any, practiceOrigin: any;
async function call(method: 'get' | 'post' | 'put' | 'patch', path: string, body?: unknown, actor = parent, expected = method === 'post' ? 201 : 200) {
  const pending = request(app.getHttpServer())[method]('/api' + path); if (actor) pending.set('Authorization', 'Bearer ' + actor.token); if (body !== undefined) pending.send(body as object);
  const response = await pending; expect(response.status, JSON.stringify(response.body.error)).toBe(expected); return response;
}
const get = async (path: string, actor = parent, expected = 200) => (await call('get', path, undefined, actor, expected)).body.data;
const post = async (path: string, body: unknown, actor = parent, expected = 201) => (await call('post', path, body, actor, expected)).body.data;
const draft = (extra = {}) => ({ studentId: childId, subject: 'math', minutesPerSession: 15, teachingSelection: selection, ...extra });
async function cold(url = postgres ?? join(dataDir, 'study-agent.sqlite3')) { const database = new DomainDatabase(url); await database.open(); try { return await database.read(); } finally { await database.close(); } }
async function restore(label: string, ledgerFile: string) {
  const destination = join(directory, label); let restoredUrl = join(destination, 'study-agent.sqlite3');
  if (postgres) { const pool = new Pool({ connectionString: postgres, max: 1 }), name = 'teaching_course33_restore_' + randomUUID().replaceAll('-', '');
    try { await pool.query('CREATE DATABASE "' + name + '"'); } finally { await pool.end(); }
    const url = new URL(postgres); url.pathname = '/' + name; restoredUrl = url.toString();
    await require(resolve(root, 'scripts/operations/postgres-backup.cjs')).restorePostgresBundle({ bundle, destination, connectionString: restoredUrl, pgBin: process.env.STUDY_TEST_TEACHING_PG_BIN, deletionLedger: ledgerFile });
  } else await require(resolve(root, 'scripts/operations/backup.cjs')).restoreBundle({ bundle, destination, deletionLedger: ledgerFile });
  return cold(restoredUrl);
}
describe('actual ' + (postgres ? 'PostgreSQL' : 'SQLite') + ' exact textbook course creation, all goals, privacy and restore', () => {
  beforeAll(async () => {
    if (postgres) { const url = new URL(postgres); if (url.hostname !== '127.0.0.1' || url.port !== '15455' || !/^\/study_teaching_package33_http_[a-f0-9]{32}$/.test(url.pathname)) throw Error('Exact isolated generated course database required'); }
    const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica); for (let n = 1; n <= 5; n++) pdf.addPage([600, 800]).drawText('Synthetic engineering source only, page ' + n, { x: 40, y: 740, size: 16, font });
    sourcePdf = Buffer.from(await pdf.save()); book.sourceSha256 = sha(sourcePdf); writeFileSync(join(assets, 'book.pdf'), sourcePdf);
    const extracted = Buffer.from(JSON.stringify({ format: 'chinatextbook-extraction-v1', id: f.source.sourceBookId, sourceSha256: book.sourceSha256,
      pages: [1, 2, 3, 4, 5].map(page => ({ page, text: [2, 3].includes(page) ? f.privateText : '' })) })); writeFileSync(join(assets, 'extracted.json'), extracted);
    writeFileSync(join(directory, 'registry.json'), JSON.stringify({ books: [book] })); writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ books: [{ id: f.source.sourceBookId,
      subject: 'math', grade: 3, term: 'upper', title: book.title, edition: book.edition, assetPath: 'data/assets/book.pdf', sha256: book.sourceSha256, bytes: sourcePdf.length, pages: 5,
      extractedPath: 'data/assets/extracted.json', extractedSha256: sha(extracted) }] }));
    installSyntheticEditionConformities(directory);
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: postgres ? 'postgres' : 'sqlite', STUDY_DATA_DIR: dataDir, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false',
      STUDY_ASSET_ROOT: assets, TEXTBOOK_BASE_PATH: '', STUDY_TEXTBOOK_REGISTRY: join(directory, 'registry.json'), STUDY_TEXTBOOK_SOURCE_MANIFEST: join(directory, 'no-chinese.json'),
      STUDY_PRIMARY_TEXTBOOK_SOURCE_MANIFEST: join(directory, 'manifest.json'), STUDY_TEXTBOOK_MAPPING_CANDIDATES: join(directory, 'no-candidates.json') });
    if (postgres) process.env.DATABASE_URL = postgres; else delete process.env.DATABASE_URL;
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); load('common/http-body').configureJsonBody(app); app.setGlobalPrefix('api'); await app.init();
    store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService); textbooks = app.get(load('modules/diagnostics/textbook-registry.service').TextbookRegistryService);
    async function register(role: string) { const actor = await post('/auth/register', { principal: 'qa-course-' + randomUUID(), credential }, null); if (role !== 'parent') await store.transaction(() => { store.find('users', { id: actor.user.id }).role = role; }); return actor; }
    parent = await register('parent'); other = await register('parent'); teacher = await register('teacher'); admin = await register('admin');
    await store.transaction(() => {
      const legacyAtoms = new Set(f.value.entries.flatMap(entry => entry.mapping.atomIds.slice(0, 3)));
      for (const name of ['knowledgeAtoms', 'questions', 'questionSources', 'questionAnswerSchemas', 'measurementItems'] as const) for (const row of f.store.inspect(name)) {
        const saved = structuredClone(row);
        // Reproduce valid legacy approvals alongside current explicit fingerprints.
        if (name === 'measurementItems' && legacyAtoms.has((saved as any).atomId)) delete (saved as any).contentFingerprint;
        store.append(name, saved);
      }
    });
    childId = (await post('/students', { nickname: '合成完整课程测试', grade: 4, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile.id;
    selection = { bookId: book.id, bookVersion: book.version, lessons: [] };
    for (const entry of f.value.entries) {
      await post('/admin/curriculum/textbook-mappings', { bookId: book.id, lessonId: entry.mapping.lessonId, atomIds: entry.mapping.atomIds, status: 'approved', rationale: '合成工程材料逐目标对齐，不代表真实教材或教师审阅结论。' }, admin);
      const source = await post(teaching + '/source-preview', { bookId: book.id, bookVersion: book.version, lessonId: entry.mapping.lessonId, pageStart: 2, pageEnd: 3 }, teacher),
        input = { ...structuredClone(entry.prepared.input), requestKey: randomUUID(), source: teachingSourceDescriptor(source), sourceFingerprint: source.fingerprint },
        result = await post(teaching + '/commands', input, teacher), detail = await get(teaching + '/' + encodeURIComponent(input.packageId), teacher),
        released = await post(teaching + '/commands', { action: 'publish', packageId: input.packageId, requestKey: randomUUID(), expectedRevision: result.revision, contentVersion: result.contentVersion,
          contentFingerprint: result.contentFingerprint, preflightFingerprint: detail.version.report.fingerprint, reviewed: true, originalTeaching: true, reason: '明确核对完整合成工程稿、材料与来源；此测试不表示真实教材或教师审核已完成。' }, teacher);
      selection.lessons.push({ lessonId: source.lessonId, packageId: input.packageId, contentVersion: result.contentVersion, fingerprint: released.published.fingerprint });
    }
    scopeInput = { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: book.id, textbookVersion: book.title, progressMode: 'textbook', selectedLessonIds: f.value.scope.selectedLessonIds,
      learnedAtomIds: f.value.scope.learnedAtomIds, currentAtomId: f.value.scope.currentAtomId, minutesPerSession: 15 };
    await call('put', '/students/' + childId + '/learning-scope', scopeInput);
    await post('/students/' + childId + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '合成本人建课授权，仅为工程权限验证' });
    const code = await post('/students/' + childId + '/learning-access/codes', { expectedVersion: 1, requestKey: randomUUID() }); student = await post('/auth/learning-code', { code: code.code }, null);
  });
  afterAll(async () => { vi.restoreAllMocks(); await app?.close(); for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; });
  it('lists only current public releases for the exact confirmed textbook lessons, withholding author originals and answers', async () => {
    const result = await get('/learning/studio/courses/teaching-options?' + new URLSearchParams({ studentId: childId, subject: 'math' })); expect(result.total).toBe(4); expect(result.lessons).toHaveLength(4);
    expect(result.lessons.every((lesson: any) => lesson.packages.length === 1 && lesson.packages[0].targets.length === 8)).toBe(true);
    const text = JSON.stringify(result); for (const value of [f.privateText, teacher.user.id, f.input.sourceReview.statement]) expect(text).not.toContain(value);
    await get('/learning/studio/courses/teaching-options?' + new URLSearchParams({ studentId: childId, subject: 'math' }), other, 403);
  });
  it('rejects changed whole-book qualification after actual course source I/O without changing the learner scope or stored courses', async () => {
    const file = process.env.STUDY_TEXTBOOK_EDITION_CONFORMITIES!, bytes = readFileSync(file), before = await cold(), original = textbooks.teachingSources.bind(textbooks);
    vi.spyOn(textbooks, 'teachingSources').mockImplementationOnce(async (...args: any[]) => { const result = await original(...args), document = JSON.parse(bytes.toString('utf8'));
      document.rows[0].review.statement += ' Changed after course source I/O.'; writeFileSync(file, JSON.stringify(document)); return result; });
    try { await post('/learning/studio/courses/preview', draft(), parent, 409); expect(teachingHash(await cold())).toBe(teachingHash(before)); }
    finally { vi.restoreAllMocks(); writeFileSync(file, bytes); }
  });
  it('previews all32 targets without native writes and verifies the complete original/extraction once for the selected book', async () => {
    const before = await cold(), opened = vi.spyOn(textbooks, 'document'); preview = await post('/learning/studio/courses/preview', draft());
    expect(opened).toHaveBeenCalledTimes(1); opened.mockRestore(); expect(preview.canCreate).toBe(true); expect(preview.focusAtomIds).toHaveLength(32); expect(preview.units[0].lessons).toHaveLength(8);
    expect(preview.previewFingerprint).not.toBe(preview.fingerprint); expect(teachingHash(await cold())).toBe(teachingHash(before));
  });
  it('atomically creates the original course with four server-only qualifications and keeps the child profile grade unchanged', async () => {
    createInput = { ...draft(), previewFingerprint: preview.previewFingerprint, requestKey: randomUUID() }; created = await post('/learning/studio/courses', createInput);
    expect(created.focusAtomIds).toHaveLength(32); expect(created.units[0].lessons.every((lesson: any) => lesson.targetAtomIds.length === 8)).toBe(true); expect(created.grade).toBe(3);
    const native = await cold(); expect(native.state.textbookTeachingAdoptions).toHaveLength(4); expect((native.state.students as any[]).find(row => row.id === childId).grade).toBe(4);
    for (const record of native.state.textbookTeachingAdoptions as any[]) for (const material of record.qualification.materials) expect(JSON.stringify(created)).not.toContain(material.contentFingerprint);
    expect(native.state.diagnosticResponses ?? []).toEqual([]);
  });
  it('replays only the same accepted complete request and exposes an authorized original-request lookup', async () => {
    const before = await cold(); expect(await post('/learning/studio/courses', createInput)).toEqual(created); const original = await get('/learning/studio/courses/requests/' + createInput.requestKey);
    const { requestKey: _requestKey, ...input } = createInput; expect(original.requestHash).toBe(teachingHash({ protocol: 'textbook-teaching-course-create-v1', input })); expect(original.course).toEqual(created);
    await post('/learning/studio/courses', { ...createInput, objective: '同键不同完整命令应被明确拒绝' }, parent, 409); expect(teachingHash(await cold())).toBe(teachingHash(before));
    expect(await get('/learning/studio/courses/requests/' + createInput.requestKey, other)).toBeNull();
  });
  it('opens the complete public lesson through the original classroom without turning independent materials into choice questions', async () => {
    const source = created.units[0].lessons[0], opened = await post('/learning/classroom/sessions', { studioCourseId: created.id, lessonId: source.id });
    expect(opened.lesson).toEqual(source.textbookTeaching.lesson); expect(opened.contentStatus).toBe('current'); expect(opened.lesson.questions).toEqual([]);
    expect(opened.retentionContext).toBeUndefined(); expect(opened.lesson.objective.split('；')).toHaveLength(8);
    const text = JSON.stringify(opened); for (const value of [f.privateText, 'answerKeys', 'contentFingerprint\":\"' + f.input.content.checks[0].materials[0].contentFingerprint]) expect(text).not.toContain(value);
    await post('/learning/classroom/sessions', { studioCourseId: created.id, lessonId: source.id }, other, 403);
  });
  it('records an actual synthetic child display for all eight frozen targets and cold-reads that same origin', async () => {
    const source = created.units[0].lessons[0], opened = await post('/learning/classroom/sessions', { studioCourseId: created.id, lessonId: source.id }, student);
    expect(opened.retentionContext.targets).toHaveLength(8); expect(opened.retentionContext.unmappedTarget).toBe(false);
    const shown = (await call('patch', '/learning/classroom/sessions/' + opened.id, { expectedRevision: opened.revision, cursor: 0, revealed: 1 }, student)).body.data,
      step = shown.lesson.steps[0], unit = shown.presentation.tracks[step.id].units[0],
      command = { protocol: 'classroom-retention-display-v1', contentFingerprint: shown.contentFingerprint, stepId: step.id, sentence: 0, presentationVersion: shown.presentation.version, unitId: unit.id, requestKey: randomUUID() },
      receipt = await post('/learning/classroom/sessions/' + shown.id + '/retention-displays', command, student);
    expect(receipt.recordedTargets).toBe(8); expect(await post('/learning/classroom/sessions/' + shown.id + '/retention-displays', command, student)).toEqual(receipt);
    const native = await cold(), session = (native.state.classroomSessions as any[]).find(row => row.id === shown.id), events = (native.state.retentionExposureEvents as any[]).filter(row => row.sourceId === shown.id);
    expect(session.retentionContext).toEqual(opened.retentionContext); expect(events).toHaveLength(16); expect(new Set(events.map(row => row.atomId)).size).toBe(8);
    expect(native.state.diagnosticResponses ?? []).toEqual([]);
  });
  it('rejects native writes that reduce the retained classroom to only the first goal, leaving the complete original untouched', async () => {
    const database = new DomainDatabase(postgres ?? join(dataDir, 'study-agent.sqlite3')); await database.open();
    try { const before = await database.read(), state = structuredClone(before.state), session = (state.classroomSessions as any[]).find(row => row.retentionContext);
      session.retentionContext.targets = session.retentionContext.targets.slice(0, 1); await expect(database.commit(before, state)).rejects.toThrow(/integrity/);
      expect(teachingHash(await database.read())).toBe(teachingHash(before));
    } finally { await database.close(); }
  });
  it('previews all original lesson goals and purpose gaps without consuming retention materials or mutating legacy documents', async () => {
    const source = created.units[0].lessons[0], before = await cold(); practiceOrigin = { protocol: 'textbook-teaching-practice-v1', courseId: created.id, lessonId: source.id,
      packageId: source.textbookTeaching.packageId, contentVersion: source.textbookTeaching.contentVersion, fingerprint: source.textbookTeaching.fingerprint };
    practiceBlueprint = await post('/diagnostics/blueprints', { studentId: childId, subject: 'math', intent: 'unit', maxItems: 20, includePrerequisites: false,
      teachingOrigin: practiceOrigin, requestKey: randomUUID() }, student);
    expect(practiceBlueprint.coverage).toHaveLength(8); expect(practiceBlueprint.coverage.every((point: any) => point.selected > 0)).toBe(true);
    expect(practiceBlueprint.blueprint.teachingCoverage).toHaveLength(24); expect(practiceBlueprint.blueprint.teachingCoverage.some((point: any) => point.missingReason)).toBe(true);
    expect(practiceBlueprint.teachingOrigin).toEqual(practiceOrigin); expect(JSON.stringify(practiceBlueprint)).not.toContain('teachingPackets');
    expect((await cold()).state.questionDocuments ?? []).toEqual(before.state.questionDocuments ?? []);
  });
  it('shows the final original-purpose coverage notice without rewriting its retained blueprint or request fingerprint', async () => {
    const original = await store.requestContext(() => structuredClone(store.find('diagnosticBlueprints', { id: practiceBlueprint.id }))),
      displayed = await get('/diagnostics/blueprints/' + encodeURIComponent(practiceBlueprint.id), student),
      missing = displayed.coverage.filter((point: any) => point.selected < point.required).length;
    expect(missing).toBe(8); expect(displayed.canStart).toBe(true);
    expect(displayed.blueprint.warnings.filter((warning: string) => warning.includes('个点本次证据覆盖不足')))
      .toEqual([`${missing} 个点本次证据覆盖不足，结果会保留未知或待补充。`]);
    const after = await store.requestContext(() => structuredClone(store.find('diagnosticBlueprints', { id: practiceBlueprint.id })));
    expect(teachingHash(after)).toBe(teachingHash(original));
  });
  it('starts and recovers the exact original blueprint with server-only source packets and all targets through the original assessment API', async () => {
    practiceSession = await post('/diagnostics/blueprints/' + encodeURIComponent(practiceBlueprint.id) + '/start', undefined, student);
    expect(await post('/diagnostics/blueprints/' + encodeURIComponent(practiceBlueprint.id) + '/start', undefined, student)).toEqual(practiceSession);
    const native = await cold(), session = (native.state.diagnosticSessions as any[]).find(row => row.id === practiceSession.id), source = created.units[0].lessons[0].textbookTeaching,
      reserve = new Set(source.content.checks.filter((check: any) => check.purpose === 'retention').flatMap((check: any) => check.materials.map((material: any) => material.measurementId)));
    expect(session.teachingPackets).toHaveLength(session.itemIds.length); expect(session.itemIds.every((id: string) => !reserve.has(id))).toBe(true);
    const legacy = session.itemSnapshots.filter((item: any) => !(native.state.measurementItems as any[]).find(row => row.id === item.id).contentFingerprint);
    expect(legacy.length).toBeGreaterThanOrEqual(3); expect(legacy.length).toBeLessThan(session.itemSnapshots.length);
    const packetHash = load('modules/diagnostics/measurement-definition').questionPacketContentFingerprint;
    expect(session.itemSnapshots.every((item: any, index: number) => item.contentFingerprint === packetHash(session.teachingPackets[index]))).toBe(true);
    for (const item of legacy) expect((native.state.measurementItems as any[]).find(row => row.id === item.id).contentFingerprint).toBeUndefined();
    expect(practiceSession.coverage).toHaveLength(8); expect(JSON.stringify(practiceSession)).not.toContain('contentFingerprint'); expect(JSON.stringify(practiceSession)).not.toContain('teachingPackets');
    await get('/diagnostics/sessions/' + practiceSession.id, other, 403);
  });
  it('rejects removal or forgery of a frozen legacy packet digest while retaining every original mapping', async () => {
    const database = new DomainDatabase(postgres ?? join(dataDir, 'study-agent.sqlite3')); await database.open();
    try {
      const before = await database.read();
      for (const value of [undefined, 'f'.repeat(64)]) {
        const state = structuredClone(before.state), session = (state.diagnosticSessions as any[]).find(row => row.id === practiceSession.id),
          item = session.itemSnapshots.find((row: any) => !(state.measurementItems as any[]).find(mapping => mapping.id === row.id).contentFingerprint);
        if (value === undefined) delete item.contentFingerprint; else item.contentFingerprint = value;
        await expect(database.commit(before, state)).rejects.toThrow(/integrity/);
        expect(teachingHash(await database.read())).toBe(teachingHash(before));
      }
    } finally { await database.close(); }
  });
  it('rejects first-target narrowing, extra prerequisites, an altered release and immediate use of retention reserves', async () => {
    const input = { studentId: childId, subject: 'math', intent: 'unit', includePrerequisites: false, teachingOrigin: practiceOrigin };
    await post('/diagnostics/sessions', { ...input, targetAtomIds: [created.focusAtomIds[0]] }, student, 400);
    await post('/diagnostics/sessions', { ...input, includePrerequisites: true }, student, 400);
    await post('/diagnostics/sessions', { ...input, teachingOrigin: { ...practiceOrigin, fingerprint: 'd'.repeat(64) } }, student, 409);
    await post('/diagnostics/sessions', { ...input, intent: 'retest' }, student, 400);
    const next = await post('/diagnostics/blueprints', { ...input, maxItems: 20, requestKey: randomUUID() }, student), first = new Set(practiceSession.items.map((item: any) => item.questionId));
    const second = await post('/diagnostics/blueprints/' + encodeURIComponent(next.id) + '/start', undefined, student);
    expect(second.items.every((item: any) => !first.has(item.questionId))).toBe(true); expect(second.coverage).toHaveLength(8);
  });
  it('accepts only the actual synthetic child first-response command and deterministic numeric grading, preserving replay and every target report', async () => {
    const first = practiceSession.items[0], render = await get('/diagnostics/sessions/' + practiceSession.id + '/items/' + encodeURIComponent(first.id), student),
      command = { itemId: first.id, answer: { questionId: first.questionId, mode: 'numeric_blank', response: { value: Number(first.questionId.split(':').at(-1)) } }, elapsedMs: 1200, disposition: 'answered', requestKey: randomUUID(),
        draftFence: { actorId: render.draftState.actorId, revision: render.draftState.revision, baseHash: render.draftState.baseHash, attempt: render.draftState.attempt } };
    await post('/diagnostics/sessions/' + practiceSession.id + '/responses', command, parent, 403);
    await post('/diagnostics/sessions/' + practiceSession.id + '/responses', { itemId: first.id, answer: command.answer, elapsedMs: 1200, disposition: 'answered' }, student, 409);
    const accepted = await post('/diagnostics/sessions/' + practiceSession.id + '/responses', command, student);
    expect((await post('/diagnostics/sessions/' + practiceSession.id + '/responses', command, student)).responseId).toBe(accepted.responseId);
    await post('/diagnostics/sessions/' + practiceSession.id + '/responses', { ...command, answer: { questionId: first.questionId, mode: 'numeric_blank', response: { value: 9999 } } }, student, 409);
    for (const item of practiceSession.items.slice(1)) { const shown = await get('/diagnostics/sessions/' + practiceSession.id + '/items/' + encodeURIComponent(item.id), student), state = shown.draftState;
      await post('/diagnostics/sessions/' + practiceSession.id + '/responses', { itemId: item.id, answer: { questionId: item.questionId, mode: 'numeric_blank', response: { value: Number(item.questionId.split(':').at(-1)) } }, elapsedMs: 1200,
        disposition: 'answered', requestKey: randomUUID(), draftFence: { actorId: state.actorId, revision: state.revision, baseHash: state.baseHash, attempt: state.attempt } }, student);
    }
    await post('/diagnostics/sessions/' + practiceSession.id + '/complete', undefined, student);
    const native = await cold(), responses = (native.state.diagnosticResponses as any[]).filter(row => row.sessionId === practiceSession.id);
    expect(responses).toHaveLength(practiceSession.totalCount); expect(responses.every(row => row.correct && row.status === 'scored' && !row.priorExposure && row.hintLevel === 0)).toBe(true);
    expect(new Set(responses.map(row => row.atomId)).size).toBe(8); const report = await get('/diagnostics/sessions/' + practiceSession.id + '/report', student);
    expect(report.coverage).toHaveLength(8); expect(report.scopeSnapshot.learnedAtomIds).toHaveLength(32);
  });
  it('starts a due original ReviewTask with only its adopted target and reserve, rolling back the engineering clock probe', async () => {
    const plan = await post('/diagnostics/students/' + childId + '/plans', { baselineSessionId: practiceSession.id, minutesPerDay: 15, useAi: false, requestKey: randomUUID() });
    expect(plan.actions.every((action: any) => practiceSession.coverage.some((point: any) => point.atomId === action.atomId))).toBe(true);
    expect((await get('/diagnostics/sessions/' + practiceSession.id + '/report')).scopeSnapshot.learnedAtomIds).toHaveLength(32);
    await call('patch', '/diagnostics/plans/' + plan.id, { status: 'active', expectedRevision: plan.revision, requestKey: randomUUID() });
    const tasks = await get('/diagnostics/plans/' + plan.id + '/reviews'), task = tasks.find((row: any) => row.intervalDays === 1), before = await cold(),
      reserve = new Set(created.units[0].lessons[0].textbookTeaching.content.checks.filter((check: any) => check.purpose === 'retention').flatMap((check: any) => check.materials.map((material: any) => material.measurementId)));
    await post('/diagnostics/reviews/' + encodeURIComponent(task.id) + '/start', undefined, student, 400);
    await expect(store.transaction(() => {
      vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(Date.parse(task.dueAt) + 1000));
      try {
        const guidance = app.get(load('modules/diagnostics/guidance.service').GuidanceService), user = store.find('users', { id: student.user.id });
        expect(guidance.planReviews(user, plan.id).find((row: any) => row.id === task.id).retentionReadiness.canStart).toBe(true);
        const started = guidance.startReview(user, task.id), original = store.find('diagnosticSessions', { id: started.id });
        expect(started.coverage.map((row: any) => row.atomId)).toEqual([task.atomId]); expect(started.teachingOrigin).toEqual(practiceOrigin);
        expect(started.items.length).toBeGreaterThan(0); expect(started.items.every((item: any) => reserve.has(item.id))).toBe(true);
        expect(original.reviewTaskId).toBe(task.id); expect(original.planId).toBe(plan.id);
        expect(guidance.startReview(user, task.id).id).toBe(started.id);
      } finally { vi.useRealTimers(); }
      // No future-dated synthetic observation is left in this original HTTP fixture.
      throw Error('original_due_review_engineering_probe_rollback');
    })).rejects.toThrow('original_due_review_engineering_probe_rollback');
    expect(teachingHash(await cold())).toBe(teachingHash(before));
  });
  it('rolls back a changed native grading packet and retains the same cold-readable original assessment', async () => {
    const database = new DomainDatabase(postgres ?? join(dataDir, 'study-agent.sqlite3')); await database.open();
    try { const before = await database.read(), state = structuredClone(before.state), session = (state.diagnosticSessions as any[]).find(row => row.id === practiceSession.id);
      session.teachingPackets[0].question.answer = 'forged-native-answer'; session.questionSnapshots[0].answer = 'forged-native-answer';
      await expect(database.commit(before, state)).rejects.toThrow(/integrity/); expect(teachingHash(await database.read())).toBe(teachingHash(before));
    } finally { await database.close(); }
  });
  it('rejects changed preview authority before creating another course, even when the public blueprint is unchanged', async () => {
    const stale = await post('/learning/studio/courses/preview', draft()), before = await cold();
    await store.transaction(() => { const user = store.find('users', { id: parent.user.id }); user.version = (user.version ?? 1) + 1; });
    await post('/learning/studio/courses', { ...draft(), previewFingerprint: stale.previewFingerprint, requestKey: randomUUID() }, parent, 409);
    const after = await cold(); expect(after.state.studioCourses).toEqual(before.state.studioCourses); expect(after.state.textbookTeachingAdoptions).toEqual(before.state.textbookTeachingAdoptions);
  });
  it('rechecks current material eligibility after actual original/extraction I/O before creating a course', async () => {
    const input = draft({ title: '材料改变前的完整课程' }), current = await post('/learning/studio/courses/preview', input), questionId = f.value.entries[0].prepared.body.materials[0].questionId,
      originalAnswer = await store.requestContext(() => structuredClone(store.find('questions', { id: questionId }).answer)), read = textbooks.teachingSources.bind(textbooks);
    let signalRead!: () => void, resume!: () => void; const seen = new Promise<void>(yes => { signalRead = yes; }), gate = new Promise<void>(yes => { resume = yes; });
    const spy = vi.spyOn(textbooks, 'teachingSources').mockImplementationOnce(async (...args: any[]) => { const result = await read(...args); signalRead(); await gate; return result; });
    const pending = call('post', '/learning/studio/courses', { ...input, previewFingerprint: current.previewFingerprint, requestKey: randomUUID() }, parent, 409);
    try { await seen; await store.transaction(() => { store.find('questions', { id: questionId }).answer = '合成变更后答案'; }); resume();
      const response = await pending; expect(response.body.error.message).toContain('材料');
    } finally { resume(); spy.mockRestore(); await store.transaction(() => { store.find('questions', { id: questionId }).answer = originalAnswer; }); }
    expect((await cold()).state.studioCourses).toHaveLength(1);
  });
  it('refuses changed original bytes without truncating or replacing the requested teaching selection', async () => {
    const before = await cold(); writeFileSync(join(assets, 'book.pdf'), Buffer.concat([sourcePdf, Buffer.from('\nGenerated changed bytes')]));
    try { await post('/learning/studio/courses/preview', draft(), parent, 503); } finally { writeFileSync(join(assets, 'book.pdf'), sourcePdf); }
    expect(teachingHash(await cold())).toBe(teachingHash(before));
  });
  it('uses the newest confirmed scope rather than an older retained version and rejects stale preview creation', async () => {
    const stale = await post('/learning/studio/courses/preview', draft()); await call('put', '/students/' + childId + '/learning-scope', scopeInput);
    await post('/learning/studio/courses', { ...draft(), previewFingerprint: stale.previewFingerprint, requestKey: randomUUID() }, parent, 409);
    latest = await post('/learning/studio/courses/preview', draft()); expect(latest.scopeVersion).toBe(2);
    const second = await post('/learning/studio/courses', { ...draft(), previewFingerprint: latest.previewFingerprint, requestKey: randomUUID() }); expect(second.scopeVersion).toBe(2); expect(second.id).not.toBe(created.id);
    await post('/learning/studio/courses/preview', draft({ title: '九年级数学上学期' }), parent, 400); expect((await get('/students/' + childId + '/profile')).grade).toBe(4);
  });
  it('lets the current student create all32 goals under the original guardian grant without exposing server-only proofs', async () => {
    const input = draft({ title: '学生本人完整课时' }), own = await post('/learning/studio/courses/preview', input, student), course = await post('/learning/studio/courses', { ...input, previewFingerprint: own.previewFingerprint, requestKey: randomUUID() }, student);
    expect(course.focusAtomIds).toHaveLength(32); const native = await cold(), records = (native.state.textbookTeachingAdoptions as any[]).filter(record => record.courseId === course.id);
    expect(records).toHaveLength(4); expect(records.every(record => record.authorization.role === 'student' && record.authorization.learningAccess.version === 1)).toBe(true);
    expect(JSON.stringify(course)).not.toContain('sessionHash'); expect(JSON.stringify(course)).not.toContain('authorization');
  });
  it('recovers the original knowledge-point course through the same authorized request lookup and unchanged complete-input hash', async () => {
    const input = { studentId: childId, subject: 'math', focusAtomIds: created.focusAtomIds.slice(0, 2), title: '原知识点建课兼容', minutesPerSession: 15 },
      preview = await post('/learning/studio/courses/preview', input), command = studioCourseCreateSchema.parse({ ...input, previewFingerprint: preview.fingerprint, requestKey: randomUUID() }),
      course = await post('/learning/studio/courses', command), original = await get('/learning/studio/courses/requests/' + command.requestKey), { requestKey: _key, ...hashInput } = command;
    expect(original.course).toEqual(course); expect(original.requestHash).toBe(createHash('sha256').update(JSON.stringify(hashInput)).digest('hex')); expect(course.teachingVersion).not.toBe('textbook-teaching-course-v1');
    expect(await post('/learning/studio/courses', command)).toEqual(course); await post('/learning/studio/courses', { ...command, title: '同键另一份课程输入' }, parent, 409);
    expect(await get('/learning/studio/courses/requests/' + command.requestKey, other)).toBeNull(); expect((await cold()).state.textbookTeachingAdoptions).toHaveLength(12);
  });
  it('exports the retained public courses for their family while excluding every private material qualification', async () => {
    const exported = await post('/privacy/account/export', { credential, requestKey: randomUUID() }), native = await cold(), text = JSON.stringify(exported);
    expect(text).toContain(created.id); expect(text).not.toContain('textbookTeachingAdoptions'); expect(text).not.toContain(f.privateText);
    for (const record of native.state.textbookTeachingAdoptions as any[]) for (const material of record.qualification.materials) expect(text).not.toContain(material.contentFingerprint);
    expect(native.state.studioCourses).toHaveLength(4); bundle = join(directory, 'before-author-close');
    if (postgres) await require(resolve(root, 'scripts/operations/postgres-backup.cjs')).createPostgresBundle({ connectionString: postgres, pgBin: process.env.STUDY_TEST_TEACHING_PG_BIN, dataDir, destination: bundle });
    else await require(resolve(root, 'scripts/operations/backup.cjs')).createBundle({ dataDir, destination: bundle });
  });
  it('closes the real author account and restores the old backup with the latest ledger while preserving lawful adopted teaching', async () => {
    const before = await cold(), preview = await get('/privacy/account/deletion-preview', teacher); expect(preview.deletedChildren).toEqual([]);
    await post('/privacy/account/delete', { credential, requestKey: randomUUID(), confirmation: preview.confirmation, fingerprint: preview.fingerprint }, teacher);
    const actual = await cold(); expect(actual.state.studioCourses).toEqual(before.state.studioCourses); expect(actual.state.textbookTeachingAdoptions).toEqual(before.state.textbookTeachingAdoptions);
    expect(actual.state.textbookTeachingPackages ?? []).toEqual([]); const ledgerFile = join(directory, 'latest-author-deletions.json');
    await require(resolve(root, 'scripts/operations/privacy-ledger.cjs')).exportLedger({ dataDir, connectionString: postgres, destination: ledgerFile }); const restored = await restore('restored-author-close', ledgerFile);
    expect(restored.state.studioCourses).toEqual(before.state.studioCourses); expect(restored.state.textbookTeachingAdoptions).toEqual(before.state.textbookTeachingAdoptions); expect(restored.state.textbookTeachingPackages ?? []).toEqual([]);
    for (const record of restored.state.textbookTeachingAdoptions as any[]) expect(currentTeachingAdoptionMaterials(teachingAdoptionStore(restored.state), record)).toHaveLength(160);
    const source = created.units[0].lessons[2], retained = await post('/learning/classroom/sessions', { studioCourseId: created.id, lessonId: source.id }, student);
    expect(retained.contentStatus).toBe('current'); expect(retained.lesson).toEqual(source.textbookTeaching.lesson); expect(retained.retentionContext.targets).toHaveLength(8);
    const options = await get('/learning/studio/courses/teaching-options?' + new URLSearchParams({ studentId: childId, subject: 'math' })); expect(options.lessons.every((lesson: any) => lesson.packages.length === 0)).toBe(true);
  });
  it('deletes the actual student courses and server qualifications and applies that deletion when restoring the same old backup', async () => {
    const before = await cold(), preview = await get('/privacy/students/' + childId + '/deletion-preview');
    await post('/privacy/students/' + childId + '/delete', { credential, requestKey: randomUUID(), confirmation: preview.confirmation, fingerprint: preview.fingerprint });
    const native = await cold(); expect(native.state.textbookTeachingAdoptions ?? []).toEqual([]); expect(native.state.studioCourses ?? []).toEqual([]);
    expect(native.state.questions).toEqual(before.state.questions); const ledgerFile = join(directory, 'latest-student-deletions.json');
    await require(resolve(root, 'scripts/operations/privacy-ledger.cjs')).exportLedger({ dataDir, connectionString: postgres, destination: ledgerFile }); const restored = await restore('restored-student-delete', ledgerFile);
    expect(restored.state.textbookTeachingAdoptions ?? []).toEqual([]); expect(restored.state.studioCourses ?? []).toEqual([]); expect(restored.state.students ?? []).toEqual([]); expect(restored.state.questions).toEqual(before.state.questions);
    writeFileSync(join(directory, 'course-privacy-restore.receipt.json'), JSON.stringify({ generatedOnly: true, driver: postgres ? 'postgres' : 'sqlite', allTargets: 32, exactLessons: 4,
      adoptedCourses: 3, legacyCourses: 1, privateQualifications: 12, nativeBackupAndLatestLedgerRestore: true, authorClosurePreservesPublicTeaching: true, studentErasureRemovesQualification: true,
      publicAnswerHashes: false, syntheticLearnerResponses: true, realLearnerResponses: false }), { flag: 'wx' });
  });
});

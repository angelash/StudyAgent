import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { beforeAll, afterAll, it, expect, vi, describe } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
describe('classroom generated images, private files and durable task lifecycle', () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-visuals-')), names = ['NODE_ENV', 'STUDY_STORAGE', 'DATABASE_URL', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'XIAOJIU_CHAT_ENABLED'] as const, prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
    let app: any, store: any, worker: any, images: any, parent: any, other: any, session: any, counter = 0, pg: Pool | undefined, schema: string | undefined;
    const base = () => '/learning/classroom/sessions/' + session.id + '/visuals';
    async function call(method: 'get' | 'post' | 'patch', path: string, body?: unknown, actor = parent, status = method === 'post' ? 201 : 200) { let query = request(app.getHttpServer())[method]('/api' + path); if (actor)
        query = query.set('Authorization', 'Bearer ' + actor.token); if (body !== undefined)
        query = query.send(body as object); return (await query.expect(status)).body.data; }
    async function boot() { const { AppModule } = require('../../../dist/apps/api/src/app.module.js'), { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js'), { ClassroomImageService } = require('../../../dist/apps/api/src/modules/ai/classroom-image.service.js'), { ClassroomVisualWorkerService } = require('../../../dist/apps/api/src/modules/learning/classroom-visual-worker.service.js'); app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init(); store = app.get(InMemoryStoreService); worker = app.get(ClassroomVisualWorkerService); images = app.get(ClassroomImageService); vi.spyOn(images, 'capabilities').mockResolvedValue({ available: true, modelId: 'gpt-image-2', reason: 'ready', message: 'Test fixture only' }); }
    beforeAll(async () => { let backend = 'sqlite'; const url = process.env.STUDY_TEST_CLASSROOM_VISUAL_POSTGRES_URL; if (url) {
        pg = new Pool({ connectionString: url });
        expect((await pg.query('select current_database() as name')).rows[0].name).toBe('study_agent_qa');
        schema = 'study_qa_visual_' + randomUUID().replace(/-/g, '');
        await pg.query('CREATE SCHEMA "' + schema + '"');
        const scoped = new URL(url);
        scoped.searchParams.set('options', '-c search_path=' + schema);
        process.env.DATABASE_URL = scoped.toString();
        backend = 'postgres';
    } Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: backend, STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'false' }); await boot(); parent = await call('post', '/auth/register', { principal: 'visual-parent@test', credential: 'Visual-fixture-only' }, undefined); other = await call('post', '/auth/register', { principal: 'visual-other@test', credential: 'Visual-fixture-only' }, undefined); const catalog = await call('get', '/learning/classroom/catalog'), lessonId = catalog.course.units[0].lectures[0].lessons[0].id; session = await call('post', '/learning/classroom/sessions', { lessonId }); });
    afterAll(async () => { vi.restoreAllMocks(); await app?.close(); if (pg && schema) {
        if (!/^study_qa_visual_[a-f0-9]{32}$/.test(schema))
            throw new Error('Invalid owned QA schema');
        await pg.query('DROP SCHEMA "' + schema + '" CASCADE');
        await pg.end();
    } for (const [name, value] of Object.entries(prior)) {
        if (value === undefined)
            delete process.env[name];
        else
            process.env[name] = value;
    } rmSync(directory, { recursive: true, force: true }); });
    function command() { return { stepId: session.lesson.steps[session.cursor].id, contentFingerprint: session.contentFingerprint, purpose: 'scene', requirements: '用并排匿名场景表达当前概念。', requestKey: randomUUID() }; }
    function control(row: any) { return { expectedRevision: row.revision, expectedTaskVersion: row.task?.version, requestKey: randomUUID() }; }
    function model() { return vi.spyOn(images, 'generate').mockImplementation(async (prompt: any, dir: any) => { counter++; const output = join(dir, 'fixture-' + counter + '.png'); await sharp({ create: { width: 1024, height: 1024, channels: 3, background: { r: counter % 255, g: 80, b: 140 } } }).png().toFile(output); const promptPath = join(dir, 'fixture-prompt.txt'); writeFileSync(promptPath, prompt); return { output, promptPath }; }); }
    async function ready() { const draft = await call('post', base(), command()), mock = model(); try {
        expect(await worker.runNext()).toBe(true);
    }
    finally {
        mock.mockRestore();
    } const row = (await call('get', base())).visuals.find((row: any) => row.id === draft.id); expect(row.status).toBe('ready'); return row; }
    it('admits only the current revealed node and replays an acknowledged generation without creating another task', async () => {
        await call('post', base(), command(), parent, 409);
        session = await call('patch', '/learning/classroom/sessions/' + session.id, { expectedRevision: session.revision, cursor: 0, revealed: 1, sentenceCursor: 0 });
        await call('get', base(), undefined, other, 403);
        const input = command(), draft = await call('post', base(), input), again = await call('post', base(), input);
        expect(again.id).toBe(draft.id);
        expect(draft.task).toMatchObject({ state: 'queued', version: 1, generation: 1 });
        await call('post', base(), { ...input, purpose: 'concept' }, parent, 409);
        await call('post', base(), command(), parent, 409);
        const mock = model();
        await worker.runNext();
        mock.mockRestore();
        const rows = (await call('get', base())).visuals;
        expect(rows).toHaveLength(1);
        expect(JSON.stringify(rows)).not.toMatch(/Teaching context|promptVersion|inputHash|answerKeys/);
    });
    it('validates actual decoded PNG bytes, keeps prompts private and supports authorized ranges', async () => {
        const row = (await call('get', base())).visuals[0], file = await request(app.getHttpServer()).get('/api' + row.imageUrl).set('Authorization', 'Bearer ' + parent.token).expect(200);
        expect(file.headers['content-type']).toContain('image/png');
        expect(file.headers['cache-control']).toBe('private, no-store');
        expect((await sharp(file.body).metadata()).width).toBe(1024);
        await request(app.getHttpServer()).get('/api' + row.imageUrl).set('Authorization', 'Bearer ' + other.token).expect(403);
        await request(app.getHttpServer()).get('/api' + row.imageUrl).set('Authorization', 'Bearer ' + parent.token).set('Range', 'bytes=0-7').expect(206);
        await request(app.getHttpServer()).get('/api' + row.imageUrl).set('Authorization', 'Bearer ' + parent.token).set('Range', 'bytes=999999999-').expect(416);
        await store.requestContext(() => { const raw = store.find('classroomVisuals', { id: row.id }), { portableRecords, accountRecords } = require('../../../dist/apps/api/src/modules/privacy/privacy-records.js'), portable = portableRecords(accountRecords(store, parent.user.id, parent.user.principal), parent.user.id); expect(raw.prompt).toContain('Teaching context'); expect(raw.prompt).not.toContain('answerKeys'); expect(portable.classroomVisuals).toHaveLength(1); expect(JSON.stringify(portable.classroomVisuals)).not.toMatch(/Teaching context|inputHash|requestKey/); });
    });
    it('exports verified original and display bytes in the family archive without private drawing instructions', async () => {
        const prepared = await call('post', '/privacy/account/prepare-archive', { credential: 'Visual-fixture-only', requestKey: randomUUID() }), archive = await request(app.getHttpServer()).get(prepared.downloadPath).set('Authorization', 'Bearer ' + parent.token).buffer(true).parse((response: any, callback: any) => { const chunks: Buffer[] = []; response.on('data', (chunk: Buffer) => chunks.push(chunk)); response.on('end', () => callback(null, Buffer.concat(chunks))); response.on('error', callback); }).expect(200), files = new Map<string, Buffer>();
        for (let offset = 0; offset + 512 <= archive.body.length;) {
            const header = archive.body.subarray(offset, offset + 512), name = header.subarray(0, 100).toString().replace(/\0.*$/s, '');
            if (!name)
                break;
            const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/s, '').trim(), 8);
            files.set(name, archive.body.subarray(offset + 512, offset + 512 + size));
            offset += 512 + Math.ceil(size / 512) * 512;
        }
        const manifest = JSON.parse(files.get('media-manifest.json')!.toString());
        expect(manifest.visuals).toHaveLength(2);
        for (const file of manifest.visuals) {
            const bytes = files.get(file.name)!;
            expect(bytes.length).toBe(file.size);
            expect((await sharp(bytes).metadata()).width).toBe(1024);
        }
        const portable = JSON.parse(files.get('study-agent-family.json')!.toString());
        expect(portable.accountRecords.classroomVisuals).toHaveLength(1);
        for (const record of portable.accountRecords.classroomVisuals) {
            expect(record).not.toHaveProperty('prompt');
            expect(record).not.toHaveProperty('inputHash');
            expect(record).not.toHaveProperty('requests');
            expect(record.files).not.toHaveProperty('prompt');
        }
        expect(JSON.stringify(portable)).not.toContain('Teaching context');
    });
    it('selects one immutable version without advancing teaching and leaves another selection intact on an unrelated unselect', async () => {
        const first = (await call('get', base())).visuals[0], selected = await call('post', base() + '/' + first.id + '/select', control(first));
        expect(selected.selected).toBe(true);
        const second = await ready(), chosen = await call('post', base() + '/' + second.id + '/select', control(second));
        expect(chosen.selected).toBe(true);
        let rows = (await call('get', base())).visuals;
        expect(rows.filter((row: any) => row.selected)).toHaveLength(1);
        const old = rows.find((row: any) => row.id === first.id);
        await call('post', base() + '/' + old.id + '/unselect', control(old));
        rows = (await call('get', base())).visuals;
        expect(rows.find((row: any) => row.id === second.id).selected).toBe(true);
        const actual = await call('get', '/learning/classroom/sessions/' + session.id);
        expect(actual.cursor).toBe(session.cursor);
        expect(actual.revision).toBe(session.revision);
        expect(actual.answers).toEqual([]);
    });
    it('keeps one selection when two pages choose different versions concurrently', async () => {
        const rows = (await call('get', base())).visuals.filter((row: any) => row.status === 'ready');
        expect(rows.length).toBeGreaterThan(1);
        const results = await Promise.all(rows.slice(0, 2).map((row: any) => request(app.getHttpServer()).post('/api' + base() + '/' + row.id + '/select').set('Authorization', 'Bearer ' + parent.token).send(control(row))));
        expect(results.every(result => [201, 409].includes(result.status))).toBe(true);
        expect((await call('get', base())).visuals.filter((row: any) => row.selected)).toHaveLength(1);
    });
    it('rejects corrupted downloads and selection but still lets the owner stop using the corrupt image', async () => {
        const row = await ready(), selected = await call('post', base() + '/' + row.id + '/select', control(row));
        let file: any;
        await store.requestContext(() => { file = require('../../../dist/apps/api/src/modules/learning/classroom-visual-storage.js').visualFile(store.find('classroomVisuals', { id: row.id })); });
        try {
            writeFileSync(file.path, Buffer.alloc(file.size));
            await request(app.getHttpServer()).get('/api' + row.imageUrl).set('Authorization', 'Bearer ' + parent.token).expect(409);
            await call('post', base() + '/' + row.id + '/select', control(selected), parent, 409);
            const unselected = await call('post', base() + '/' + row.id + '/unselect', control(selected));
            expect(unselected.selected).toBe(false);
        }
        finally {
            writeFileSync(file.path, file.bytes);
        }
    });
    it('retains failed work, explicitly retries the same task, cancels a late image and prevents a partial publication', async () => {
        const draft = await call('post', base(), command()), bad = vi.spyOn(images, 'generate').mockRejectedValue(new Error('private provider credential fixture'));
        await worker.runNext();
        bad.mockRestore();
        let failed = (await call('get', base())).visuals.find((row: any) => row.id === draft.id);
        expect(failed.status).toBe('failed');
        expect(failed.task.errorCode).toBe('image_generation_failed');
        expect(JSON.stringify(failed)).not.toContain('private provider');
        const retried = await call('post', base() + '/' + failed.id + '/retry', control(failed));
        expect(retried.task).toMatchObject({ generation: 2, state: 'queued' });
        const good = model();
        await worker.runNext();
        good.mockRestore();
        expect((await call('get', base())).visuals.find((row: any) => row.id === draft.id).status).toBe('ready');
        const pending = await call('post', base(), command());
        let entered!: () => void, release!: () => void;
        const arrival = new Promise<void>(resolve => entered = resolve), held = new Promise<void>(resolve => release = resolve), late = vi.spyOn(images, 'generate').mockImplementation(async (prompt: any, dir: any) => { entered(); await held; const output = join(dir, 'late.png'); await sharp({ create: { width: 1024, height: 1024, channels: 3, background: 'red' } }).png().toFile(output); return { output }; });
        const running = worker.runNext();
        await arrival;
        const current = (await call('get', base())).visuals.find((row: any) => row.id === pending.id);
        expect(current.revision).toBeGreaterThan(pending.revision);
        const cancelIntent = { ...control(pending), expectedGeneration: pending.task.generation };
        const stopping = await call('post', base() + '/' + pending.id + '/cancel', cancelIntent);
        expect(stopping.status).toBe('cancelling');
        release();
        await running;
        late.mockRestore();
        const cancelled = (await call('get', base())).visuals.find((row: any) => row.id === pending.id);
        expect(cancelled.status).toBe('cancelled');
        expect(cancelled.imageUrl).toBeNull();
        expect(existsSync(join(directory, 'classroom-visuals', pending.id))).toBe(false);
        const nextRun = await call('post', base() + '/' + pending.id + '/retry', control(cancelled));
        expect(nextRun.task.generation).toBe(2);
        // A lost acknowledgement may replay its receipt, but cannot cancel the new generation.
        expect((await call('post', base() + '/' + pending.id + '/cancel', cancelIntent)).task.generation).toBe(2);
        await call('post', base() + '/' + pending.id + '/cancel', { ...cancelIntent, requestKey: randomUUID() }, parent, 409);
        expect((await call('get', base())).visuals.find((row: any) => row.id === pending.id).task.state).toBe('queued');
        const recovered = model(); await worker.runNext(); recovered.mockRestore();
    });
    it('rejects a fabricated or oversized model file and preserves failure diagnosis', async () => {
        const draft = await call('post', base(), command()), fake = vi.spyOn(images, 'generate').mockImplementation(async (_prompt: any, dir: any) => { const output = join(dir, 'not-image.png'); writeFileSync(output, 'not a generated PNG'); return { output }; });
        await worker.runNext();
        fake.mockRestore();
        expect((await call('get', base())).visuals.find((row: any) => row.id === draft.id).status).toBe('failed');
    });
    it('rejects an old expired lease while a new worker produces the selected task output', async () => {
        const draft = await call('post', base(), command());
        let releaseOld!: () => void, releaseNew!: () => void, arriveOld!: () => void, arriveNew!: () => void, calls = 0;
        const oldHeld = new Promise<void>(resolve => releaseOld = resolve), newHeld = new Promise<void>(resolve => releaseNew = resolve), oldArrival = new Promise<void>(resolve => arriveOld = resolve), newArrival = new Promise<void>(resolve => arriveNew = resolve);
        const generated = vi.spyOn(images, 'generate').mockImplementation(async (_prompt: any, dir: any) => { const order = ++calls; if (order === 1) {
            arriveOld();
            await oldHeld;
        }
        else {
            arriveNew();
            await newHeld;
        } const output = join(dir, 'lease.png'); await sharp({ create: { width: 1024, height: 1024, channels: 3, background: order === 1 ? 'red' : 'blue' } }).png().toFile(output); return { output }; });
        const first = worker.runNext();
        await oldArrival;
        const future = Date.now() + 60000, clock = vi.spyOn(Date, 'now').mockReturnValue(future), { ClassroomVisualWorkerService } = require('../../../dist/apps/api/src/modules/learning/classroom-visual-worker.service.js'), { StudentsService } = require('../../../dist/apps/api/src/modules/students/students.service.js'), second = new ClassroomVisualWorkerService(store, app.get(StudentsService), images), next = second.runNext();
        try {
            await newArrival;
            releaseOld();
            await first;
            expect((await call('get', base())).visuals.find((row: any) => row.id === draft.id).imageUrl).toBeNull();
            releaseNew();
            await next;
            const ready = (await call('get', base())).visuals.find((row: any) => row.id === draft.id);
            expect(ready.status).toBe('ready');
            const file = await request(app.getHttpServer()).get('/api' + ready.imageUrl).set('Authorization', 'Bearer ' + parent.token).expect(200), pixel = await sharp(file.body).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
            expect([...pixel]).toEqual([0, 0, 255]);
        }
        finally {
            releaseOld();
            releaseNew();
            await Promise.allSettled([first, next]);
            clock.mockRestore();
            generated.mockRestore();
            await second.onModuleDestroy();
        }
    });
    it('rechecks a real child source classroom after guardian revocation and refuses the late file', async () => {
        const adult = session, studentId = (await call('post', '/students', { nickname: '图片验证', grade: 4, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile.id;
        const source = await call('post', '/learning/source-courses/materials/text', { studentId, subject: 'math', title: '匿名观察', sections: ['匿名观察记录：两个时段的人数有所不同。需要比较开放时间和活动条件，不能从一次记录直接确定唯一原因。'], requestKey: randomUUID() }), draft = await call('post', '/learning/source-courses', { studentId, subject: 'math', title: '匿名观察课程', goal: '比较匿名观察与尚待验证的条件。', language: 'zh-CN', minutesPerSession: 10, modelId: 'auto', selections: [{ materialId: source.material.id, version: source.version, pages: [1] }], requestKey: randomUUID() });
        const { XiaojiuChatService } = require('../../../dist/apps/api/src/modules/ai/xiaojiu-chat.service.js'), { SourceCourseWorkerService } = require('../../../dist/apps/api/src/modules/learning/source-course-worker.service.js'), { sourceCoursePipelineFixture } = require('../../../../../scripts/qa/source-course-fixture.cjs'), chat = app.get(XiaojiuChatService), mock = vi.spyOn(chat, 'structured').mockImplementation(async (input: any, _schema: any, check: any) => ({ ...check(sourceCoursePipelineFixture(JSON.parse(input.context), input.message)), modelId: input.modelId, modelName: 'Test fixture only' }));
        await app.get(SourceCourseWorkerService).runNext();
        mock.mockRestore();
        let course = await call('get', '/learning/source-courses/' + draft.id);
        course = await call('post', '/learning/source-courses/' + course.id + '/confirm', { expectedRevision: course.revision, fingerprint: course.fingerprint, requestKey: randomUUID() });
        session = await call('post', '/learning/classroom/sessions', { sourceCourseId: course.id, lessonId: course.lessons[0].id });
        session = await call('patch', '/learning/classroom/sessions/' + session.id, { expectedRevision: session.revision, cursor: 0, revealed: 1, sentenceCursor: 0 });
        const visual = await call('post', base(), command());
        let entered!: () => void, release!: () => void;
        const arrived = new Promise<void>(resolve => entered = resolve), held = new Promise<void>(resolve => release = resolve), late = vi.spyOn(images, 'generate').mockImplementation(async (_prompt: any, dir: any) => { entered(); await held; const output = join(dir, 'revoked.png'); await sharp({ create: { width: 1024, height: 1024, channels: 3, background: 'green' } }).png().toFile(output); return { output }; });
        const pending = worker.runNext();
        await arrived;
        await store.transaction(() => { store.find('bindings', { studentId, parentUserId: parent.user.id }).status = 'revoked'; });
        release();
        await pending;
        late.mockRestore();
        await call('get', base(), undefined, parent, 403);
        await store.requestContext(() => { const raw = store.find('classroomVisuals', { id: visual.id }); expect(raw.files).toBeNull(); });
        await store.transaction(() => { store.find('bindings', { studentId, parentUserId: parent.user.id }).status = 'active'; });
        session = adult;
    });
    it('survives an API restart, backs up referenced bytes and prevents deletion-ledger resurrection', async () => {
        const queued = await call('post', base(), command());
        await app.close();
        vi.restoreAllMocks();
        await boot();
        const mock = model();
        await worker.runNext();
        mock.mockRestore();
        const row = (await call('get', base())).visuals.find((row: any) => row.id === queued.id);
        expect(row.status).toBe('ready');
        expect((await call('post', base() + '/' + row.id + '/select', control(row))).selected).toBe(true);
        if (!pg) {
            const { createBundle, restoreBundle } = require(resolve(__dirname, '../../../../../scripts/operations/backup.cjs')), { makeLedger } = require(resolve(__dirname, '../../../../../scripts/operations/privacy-ledger.cjs'));
            const backupRoot = mkdtempSync(join(tmpdir(), 'study-visual-backup-')), bundle = join(backupRoot, 'bundle'), restored = join(backupRoot, 'restored');
            try {
                const backup = await createBundle({ dataDir: directory, destination: bundle });
                expect(backup.files).toBeGreaterThan(2);
                const clean = join(backupRoot, 'clean');
                await restoreBundle({ bundle, destination: clean });
                const restoredDb = new DatabaseSync(join(clean, 'study-agent.sqlite3'), { readOnly: true });
                try {
                    const raw = JSON.parse((restoredDb.prepare("SELECT body FROM domain_records WHERE collection='classroomVisuals' AND record_id=?").get(row.id) as any).body);
                    expect(raw.status).toBe('ready');
                    expect(raw.selectionKey).not.toBeNull();
                    const bytes = readFileSync(join(clean, 'classroom-visuals', row.id, raw.files.image.name));
                    expect((await sharp(bytes).metadata()).width).toBe(1024);
                    expect(require('../../../dist/apps/api/src/modules/learning/classroom-visual-storage.js').visualSha(bytes)).toBe(raw.files.image.sha256);
                }
                finally {
                    restoredDb.close();
                }
                const prepared = await call('get', '/privacy/account/deletion-preview');
                const receipt = await call('post', '/privacy/account/delete', { credential: 'Visual-fixture-only', requestKey: randomUUID(), confirmation: prepared.confirmation, fingerprint: prepared.fingerprint });
                const ledger = join(directory, 'latest-deletion.json');
                writeFileSync(ledger, JSON.stringify(makeLedger([receipt])));
                await restoreBundle({ bundle, destination: restored, deletionLedger: ledger });
                expect(existsSync(join(restored, 'classroom-visuals', row.id))).toBe(false);
                while (await worker.runNext()) { }
                expect(existsSync(join(directory, 'classroom-visuals', row.id))).toBe(false);
            }
            finally {
                rmSync(backupRoot, { recursive: true, force: true });
            }
        }
    });
});

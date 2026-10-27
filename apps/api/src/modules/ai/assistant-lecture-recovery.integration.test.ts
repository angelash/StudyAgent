import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { describe, it, expect, vi } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import request from 'supertest';

const pgLocation = process.env.STUDY_TEST_LECTURE_RECOVERY_POSTGRES_URL;
for (const driver of ['sqlite', 'postgres'] as const) {
  (driver === 'sqlite' || pgLocation ? describe : describe.skip)(driver + ' lecture assistant native backup and deletion recovery', () => {
    it('restores frozen adult lectures and independent turns while newer child and account deletion ledgers retain their distinct scope', async () => {
      const directory = mkdtempSync(join(tmpdir(), 'study-lecture-recovery-'));
      const names = ['NODE_ENV','DATABASE_URL','STUDY_STORAGE','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','XIAOJIU_CHAT_ENABLED'] as const;
      const prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
      const repo = resolve(__dirname, '../../../../..');
      const backup = require(join(repo, 'scripts/operations/' + (driver === 'sqlite' ? 'backup.cjs' : 'postgres-backup.cjs')));
      const ledger = require(join(repo, 'scripts/operations/privacy-ledger.cjs'));
      const principal = 'lecture-recovery-' + randomUUID() + '@local.test', credential = 'Lecture-Recovery-QA-20261028';
      const databases: string[] = [];
      let app: any, store: any, worker: any, actor: any, provider: any, admin: Pool | undefined;
      async function database(root: string) {
        if (driver === 'sqlite') return join(root, 'study-agent.sqlite3');
        const name = 'study_qa_lecture_recovery_' + randomUUID().replace(/-/g, '');
        await admin!.query('CREATE DATABASE "' + name + '" OWNER study_agent_app'); databases.push(name);
        const url = new URL(pgLocation!); url.pathname = '/' + name; return url.toString();
      }
      async function boot(location: string, root: string) {
        Object.assign(process.env, { NODE_ENV: 'development', DATABASE_URL: location, STUDY_STORAGE: driver, STUDY_DATA_DIR: root,
          STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'true' });
        const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
        app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
        store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
        worker = app.get(load('modules/ai/assistant-turn-worker.service').AssistantTurnWorkerService);
        provider = vi.spyOn(app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService), 'reply').mockResolvedValue({
          reply: '先核对已学范围，再用独立新例子继续观察。', evidenceIds: [], modelId: 'deepseek-v4-flash', modelName: 'Synthetic recovery model' });
      }
      async function call(method: 'get'|'post', path: string, body?: unknown, expected = method === 'post' ? 201 : 200, token = actor?.token) {
        let q = request(app.getHttpServer())[method]('/api' + path);
        if (token) q = q.set('Authorization', 'Bearer ' + token); if (body !== undefined) q = q.send(body as object);
        const response = await q; expect(response.status, JSON.stringify(response.body.error)).toBe(expected); return response.body.data;
      }
      const prefix = (id: string) => '/ai/assistant/sessions/' + id;
      async function create(session: any, message: string) {
        const { contextVersion } = await call('get', prefix(session.id) + '/context');
        const command = { requestKey: randomUUID(), message, modelId: 'deepseek-v4-flash', contextVersion };
        return { command, turn: await call('post', prefix(session.id) + '/turns', command) };
      }
      const bundle = join(directory, 'bundle');
      async function restore(location: string, destination: string, deletionLedger?: string) {
        const options = { bundle, destination, deletionLedger, connectionString: location, pgBin: process.env.STUDY_TEST_PG_BIN };
        return driver === 'sqlite' ? backup.restoreBundle(options) : backup.restorePostgresBundle(options);
      }
      try {
        if (driver === 'postgres') {
          const probe = new Pool({ connectionString: pgLocation });
          try { expect((await probe.query('SELECT current_database() name,current_user owner')).rows[0]).toEqual({ name: 'study_agent_qa', owner: 'study_agent_app' }); }
          finally { await probe.end(); }
          if (!process.env.STUDY_TEST_POSTGRES_ADMIN_URL || !process.env.STUDY_TEST_PG_BIN) throw new Error('Dedicated assistant QA native tools required');
          admin = new Pool({ connectionString: process.env.STUDY_TEST_POSTGRES_ADMIN_URL });
          expect((await admin.query('SELECT current_user name')).rows[0].name).toBe('study_qa_admin');
        }
        const source = join(directory, 'source'), sourceLocation = await database(source);
        await boot(sourceLocation, source); actor = await call('post', '/auth/register', { principal, credential });
        const studentId = (await call('post', '/students', { nickname: '匿名助教恢复', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile.id;
        const course=require('../../../dist/apps/api/src/modules/learning/classroom-curriculum.js').classroomCourse();
        const descriptor=await call('get','/ai/assistant/lecture-context?'+new URLSearchParams({courseId:course.id,lectureId:course.units[0].lectures[0].id}));
        const session=await call('post','/ai/assistant/sessions',{userRole:'parent',studentId:null,subject:null,pageContext:'classroom',contextRefType:'classroom_lecture',contextRefId:descriptor.referenceId,contextItemId:descriptor.lectureId});
        const originalSnapshot=await store.requestContext(()=>structuredClone(store.find('assistantSessions',{id:session.id}).lectureSnapshot));
        const completed=await create(session,'原成人讲座的匿名概念问题。');await worker.runNext();
        const independent=await call('post','/ai/assistant/sessions',{userRole:'parent',studentId:null,subject:null,pageContext:'studio'});
        const child=await call('post','/ai/assistant/sessions',{userRole:'parent',studentId,pageContext:'review'}),cancelled=await create(child,'已取消的孩子范围问题。');
        await call('post',prefix(child.id)+'/turns/'+cancelled.turn.id+'/cancel',{generation:cancelled.turn.task.generation,version:cancelled.turn.task.version});
        const queued=await create(independent,'尚未完成的匿名独立学习问题。');
        const createOptions={dataDir:source,destination:bundle,connectionString:sourceLocation,pgBin:process.env.STUDY_TEST_PG_BIN};
        if(driver==='sqlite')await backup.createBundle(createOptions);else await backup.createPostgresBundle(createOptions);
        await app.close();app=null;
        const target=join(directory,'target'),targetLocation=await database(target);await restore(targetLocation,target);await boot(targetLocation,target);
        await call('get','/auth/me',undefined,401,actor.token);actor=await call('post','/auth/login',{principal,credential},201,'');
        expect(await store.requestContext(()=>structuredClone(store.find('assistantSessions',{id:session.id}).lectureSnapshot))).toStrictEqual(originalSnapshot);
        expect((await call('get',prefix(session.id)+'/context')).lecture).toEqual(expect.objectContaining({fingerprint:descriptor.fingerprint,current:true}));
        expect((await call('post',prefix(session.id)+'/turns',completed.command)).status).toBe('completed');
        expect((await call('post',prefix(independent.id)+'/turns',queued.command)).id).toBe(queued.turn.id);await worker.runNext();expect(provider).toHaveBeenCalledTimes(1);
        expect((await call('get',prefix(independent.id)+'/turns/'+queued.turn.id))).toMatchObject({status:'completed',modelId:'deepseek-v4-flash'});
        expect((await call('get',prefix(session.id)+'/messages')).length).toBe(2);expect((await call('get',prefix(independent.id)+'/messages')).length).toBe(2);
        const childPreview=await call('get','/privacy/students/'+studentId+'/deletion-preview');
        await call('post','/privacy/students/'+studentId+'/delete',{credential,confirmation:childPreview.confirmation,fingerprint:childPreview.fingerprint,requestKey:randomUUID()});
        await call('get',prefix(child.id)+'/turns',undefined,404);expect((await call('get',prefix(session.id)+'/messages')).length).toBe(2);
        const childLedger=join(directory,'child-deletions.json');expect((await ledger.exportLedger({...(driver==='sqlite'?{dataDir:target}:{connectionString:targetLocation}),destination:childLedger})).deletions).toBe(1);
        await app.close();app=null;
        const childOnly=join(directory,'child-only'),childLocation=await database(childOnly);expect((await restore(childLocation,childOnly,childLedger)).appliedDeletionReceipts).toBe(1);await boot(childLocation,childOnly);
        actor=await call('post','/auth/login',{principal,credential},201,'');await call('get',prefix(child.id)+'/turns',undefined,404);
        expect((await call('get',prefix(session.id)+'/messages')).length).toBe(2);expect((await call('get',prefix(independent.id)+'/turns/'+queued.turn.id)).status).toBe('queued');
        expect(await store.requestContext(()=>structuredClone(store.find('assistantSessions',{id:session.id}).lectureSnapshot))).toStrictEqual(originalSnapshot);
        const accountPreview=await call('get','/privacy/account/deletion-preview');
        await call('post','/privacy/account/delete',{credential,confirmation:accountPreview.confirmation,fingerprint:accountPreview.fingerprint,requestKey:randomUUID()});
        const deletionLedger=join(directory,'latest-deletions.json');expect((await ledger.exportLedger({...(driver==='sqlite'?{dataDir:childOnly}:{connectionString:childLocation}),destination:deletionLedger})).deletions).toBe(2);
        await app.close();app=null;
        const deleted=join(directory,'deleted'),deletedLocation=await database(deleted);expect((await restore(deletedLocation,deleted,deletionLedger)).appliedDeletionReceipts).toBe(2);await boot(deletedLocation,deleted);
        await call('post','/auth/login',{principal,credential},401,'');
        await store.requestContext(()=>{expect(store.assistantSessions).toHaveLength(0);expect(store.assistantTurns).toHaveLength(0);expect(store.assistantMessages).toHaveLength(0);});
        await worker.runNext();expect(provider).not.toHaveBeenCalled();
      } finally {
        await app?.close(); vi.restoreAllMocks();
        if (admin) { try { for (const name of databases) { if (!/^study_qa_lecture_recovery_[a-f0-9]{32}$/.test(name)) throw new Error('Unsafe assistant QA database'); await admin.query('DROP DATABASE "' + name + '" WITH (FORCE)'); } } finally { await admin.end(); } }
        for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
        if (dirname(resolve(directory))!==resolve(tmpdir())||!basename(directory).startsWith('study-lecture-recovery-')) throw new Error('Unsafe lecture recovery directory');
        rmSync(directory, { recursive: true, force: true });
      }
    }, 120000);
  });
}

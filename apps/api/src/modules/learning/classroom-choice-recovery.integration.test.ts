import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import request from 'supertest';

const pgLocation = process.env.STUDY_TEST_CLASSROOM_CHOICE_RECOVERY_POSTGRES_URL;
for (const driver of ['sqlite','postgres'] as const) {
  (driver === 'sqlite' || pgLocation ? describe : describe.skip)(driver + ' frozen classroom choices native recovery', () => {
    it('restores private frozen scoring, original replay and portable feedback, then honors a newer deletion ledger', async () => {
      const directory = mkdtempSync(join(tmpdir(), 'study-choice-recovery-')), databases: string[] = [];
      const names = ['NODE_ENV','DATABASE_URL','STUDY_STORAGE','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','XIAOJIU_CHAT_ENABLED'] as const;
      const prior = Object.fromEntries(names.map(name => [name, process.env[name]])), repo = resolve(__dirname, '../../../../..');
      const backup = require(join(repo,'scripts/operations/',driver === 'sqlite' ? 'backup.cjs' : 'postgres-backup.cjs'));
      const ledger = require(join(repo,'scripts/operations/privacy-ledger.cjs')), bundle = join(directory,'bundle');
      const principal = 'choice-recovery-' + randomUUID() + '@local.test', credential = 'Choice-Recovery-QA-20261025';
      let app: any, store: any, actor: any, admin: Pool | undefined;
      async function database(root: string) {
        if (driver === 'sqlite') return join(root,'study-agent.sqlite3');
        const name = 'study_qa_choice_recovery_' + randomUUID().replace(/-/g,''); await admin!.query('CREATE DATABASE "' + name + '" OWNER study_agent_app'); databases.push(name);
        const url = new URL(pgLocation!); url.pathname = '/' + name; return url.toString();
      }
      async function boot(location: string, root: string) {
        Object.assign(process.env,{NODE_ENV:'development',DATABASE_URL:location,STUDY_STORAGE:driver,STUDY_DATA_DIR:root,STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'false',XIAOJIU_CHAT_ENABLED:'false'});
        const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
        app = await NestFactory.create(load('app.module').AppModule,{logger:false}); app.setGlobalPrefix('api'); await app.init();
        store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
      }
      async function call(method:'get'|'post', path:string, body?:unknown, expected=method==='post'?201:200, token=actor?.token) {
        let query = request(app.getHttpServer())[method]('/api'+path); if(token)query=query.set('Authorization','Bearer '+token);if(body!==undefined)query=query.send(body as object);
        const response=await query;expect(response.status,JSON.stringify(response.body.error)).toBe(expected);return response.body.data;
      }
      async function restore(location:string,destination:string,deletionLedger?:string) {
        const options={bundle,destination,deletionLedger,connectionString:location,pgBin:process.env.STUDY_TEST_PG_BIN};
        return driver==='sqlite'?backup.restoreBundle(options):backup.restorePostgresBundle(options);
      }
      try {
        if(driver==='postgres') {
          const probe=new Pool({connectionString:pgLocation});try{expect((await probe.query('SELECT current_database() name,current_user owner')).rows[0]).toEqual({name:'study_agent_qa',owner:'study_agent_app'});}finally{await probe.end();}
          if(!process.env.STUDY_TEST_POSTGRES_ADMIN_URL||!process.env.STUDY_TEST_PG_BIN)throw Error('Dedicated choice QA native tools required');
          admin=new Pool({connectionString:process.env.STUDY_TEST_POSTGRES_ADMIN_URL});expect((await admin.query('SELECT current_user name')).rows[0].name).toBe('study_qa_admin');
        }
        const source=join(directory,'source'),sourceLocation=await database(source);await boot(sourceLocation,source);
        actor=await call('post','/auth/register',{principal,credential});
        const studentId=(await call('post','/students',{nickname:'匿名选择恢复',grade:3,preferredSessionMinutes:15,defaultVersionMap:{math:'',chinese:'',english:''}})).profile.id;
        const adult=await call('post','/learning/classroom/sessions',{lessonId:'soc-1-1-2'}),child=await call('post','/learning/classroom/sessions',{lessonId:'soc-1-3-1'});
        // Explicit synthetic ownership setup tests both deletion scopes without publishing adult content as a child course.
        await store.transaction(()=>{store.find('classroomSessions',{id:child.id}).studentId=studentId;});
        const question=adult.lesson.questions.find((q:any)=>q.selectionMode==='multiple'),path='/learning/classroom/sessions/'+adult.id;
        const command={protocol:'classroom-choice-v2',questionId:question.id,selectedIndices:[0,2],disposition:'answered',hintUsed:false,requestKey:randomUUID()};
        const saved=await call('post',path+'/answers',command),first=saved.answers[0];
        await call('post','/learning/classroom/sessions/'+child.id+'/answers',{protocol:'classroom-choice-v2',questionId:child.lesson.questions.find((q:any)=>q.selectionMode==='multiple').id,selectedIndices:[],disposition:'dont_know',requestKey:randomUUID()});
        const options={dataDir:source,destination:bundle,connectionString:sourceLocation,pgBin:process.env.STUDY_TEST_PG_BIN};
        if(driver==='sqlite')await backup.createBundle(options);else await backup.createPostgresBundle(options);
        await app.close();app=null;const target=join(directory,'target'),targetLocation=await database(target);await restore(targetLocation,target);await boot(targetLocation,target);
        await call('get','/auth/me',undefined,401,actor.token);actor=await call('post','/auth/login',{principal,credential},201,'');
        const replay=await call('post',path+'/answers',{...command,selectedIndices:[2,0]});expect(replay.answers[0]).toEqual(first);
        expect((await call('post',path+'/answers',{...command,selectedIndices:[1],requestKey:randomUUID()})).answers[0]).toEqual(first);
        await store.requestContext(()=>{const record=store.find('classroomSessions',{id:adult.id});expect(record.answerKeys[question.id].answer.length).toBeGreaterThanOrEqual(2);expect(record.answerKeys[question.id].optionExplanations).toHaveLength(5);});
        const exported=await call('post','/privacy/account/export',{credential,requestKey:randomUUID()}),portable=exported.accountRecords.classroomSessions.find((s:any)=>s.id===adult.id);
        expect(portable.answers[0]).toEqual(first);expect(portable).not.toHaveProperty('answerKeys');expect(portable).not.toHaveProperty('requests');
        const childPreview=await call('get','/privacy/students/'+studentId+'/deletion-preview');await call('post','/privacy/students/'+studentId+'/delete',{credential,confirmation:childPreview.confirmation,fingerprint:childPreview.fingerprint,requestKey:randomUUID()});
        await call('get','/learning/classroom/sessions/'+child.id,undefined,404);expect((await call('get',path)).answers[0]).toEqual(first);
        const accountPreview=await call('get','/privacy/account/deletion-preview');await call('post','/privacy/account/delete',{credential,confirmation:accountPreview.confirmation,fingerprint:accountPreview.fingerprint,requestKey:randomUUID()});
        const deletionLedger=join(directory,'latest-deletions.json');expect((await ledger.exportLedger({...driver==='sqlite'?{dataDir:target}:{connectionString:targetLocation},destination:deletionLedger})).deletions).toBe(2);
        await app.close();app=null;const deleted=join(directory,'deleted'),deletedLocation=await database(deleted);expect((await restore(deletedLocation,deleted,deletionLedger)).appliedDeletionReceipts).toBe(2);
        await boot(deletedLocation,deleted);await call('post','/auth/login',{principal,credential},401,'');await store.requestContext(()=>expect(store.classroomSessions).toHaveLength(0));
      } finally {
        await app?.close();if(admin){try{for(const name of databases){if(!/^study_qa_choice_recovery_[a-f0-9]{32}$/.test(name))throw Error('Unsafe choice QA database');await admin.query('DROP DATABASE "'+name+'" WITH (FORCE)');}}finally{await admin.end();}}
        for(const[name,value]of Object.entries(prior)){if(value===undefined)delete process.env[name];else process.env[name]=value;}
        if(!resolve(directory).startsWith(resolve(tmpdir())+sep))throw Error('Unsafe choice recovery directory');rmSync(directory,{recursive:true,force:true});
      }
    },60000);
  });
}

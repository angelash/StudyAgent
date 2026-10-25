import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { describe,it,expect,vi } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve,sep } from 'node:path';
import request from 'supertest';

const pgLocation=process.env.STUDY_TEST_GUIDANCE_RECOVERY_POSTGRES_URL;
for(const driver of ['sqlite','postgres'] as const)(driver==='sqlite'||pgLocation?describe:describe.skip)(driver+' original guidance plans native recovery',()=>{
  it('restores rule creation, frozen model, cancellation and adoption receipts, then applies the latest deletion ledger',async()=>{
    const directory=mkdtempSync(join(tmpdir(),'study-guidance-recovery-')),databases:string[]=[];
    const names=['NODE_ENV','DATABASE_URL','STUDY_STORAGE','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','XIAOJIU_CHAT_ENABLED'] as const;
    const prior=Object.fromEntries(names.map(name=>[name,process.env[name]])),repo=resolve(__dirname,'../../../../..');
    const backup=require(join(repo,'scripts/operations',driver==='sqlite'?'backup.cjs':'postgres-backup.cjs'));
    const ledger=require(join(repo,'scripts/operations/privacy-ledger.cjs')),bundle=join(directory,'bundle');
    const principal='guidance-recovery-'+randomUUID()+'@local.test',credential='Guidance-Recovery-QA-20261025';
    let app:any,store:any,worker:any,provider:any,actor:any,admin:Pool|undefined;
    async function database(root:string){
      if(driver==='sqlite')return join(root,'study-agent.sqlite3');
      const name='study_qa_guidance_recovery_'+randomUUID().replace(/-/g,'');await admin!.query('CREATE DATABASE "'+name+'" OWNER study_agent_app');databases.push(name);
      const url=new URL(pgLocation!);url.pathname='/'+name;return url.toString();
    }
    async function boot(location:string,root:string,seed=false){
      Object.assign(process.env,{NODE_ENV:'development',DATABASE_URL:location,STUDY_STORAGE:driver,STUDY_DATA_DIR:root,STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:String(seed),XIAOJIU_CHAT_ENABLED:'true'});
      const load=(name:string)=>require('../../../dist/apps/api/src/'+name+'.js');
      app=await NestFactory.create(load('app.module').AppModule,{logger:false});app.setGlobalPrefix('api');await app.init();
      store=app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);worker=app.get(load('modules/diagnostics/guidance-model-worker.service').GuidanceModelWorkerService);
      provider=vi.spyOn(app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService),'structured').mockImplementation(async(input:any,_schema:any,check:any)=>{
        const original=JSON.parse(input.context).original;
        return {...check({summary:'先保留观察与未知，再通过新题独立验证下一步。',activities:original.actions.map((a:any)=>({actionId:a.id,activity:'先安排独立小测，记录观察和证据，再核查是否需要讲解，保留未知的状态。',evidenceIds:a.evidenceIds}))}),modelId:input.modelId,modelName:'Synthetic recovery provider'};
      });
    }
    async function call(method:'get'|'post'|'put',path:string,body?:unknown,expected=method==='post'?201:200,token=actor?.token){
      let q=request(app.getHttpServer())[method]('/api'+path);if(token)q=q.set('Authorization','Bearer '+token);if(body!==undefined)q=q.send(body as object);
      const result=await q;expect(result.status,JSON.stringify(result.body.error)).toBe(expected);return result.body.data;
    }
    const prefix=(id:string)=>'/diagnostics/plans/'+id+'/model-suggestions';
    async function restore(location:string,destination:string,deletionLedger?:string){
      const options={bundle,destination,deletionLedger,connectionString:location,pgBin:process.env.STUDY_TEST_PG_BIN};return driver==='sqlite'?backup.restoreBundle(options):backup.restorePostgresBundle(options);
    }
    try {
      if(driver==='postgres'){
        const probe=new Pool({connectionString:pgLocation});try{expect((await probe.query('SELECT current_database() name,current_user owner')).rows[0]).toEqual({name:'study_agent_qa',owner:'study_agent_app'});}finally{await probe.end();}
        if(!process.env.STUDY_TEST_POSTGRES_ADMIN_URL||!process.env.STUDY_TEST_PG_BIN)throw Error('Dedicated guidance QA native tools required');
        admin=new Pool({connectionString:process.env.STUDY_TEST_POSTGRES_ADMIN_URL});expect((await admin.query('SELECT current_user name')).rows[0].name).toBe('study_qa_admin');
      }
      const source=join(directory,'source'),sourceLocation=await database(source);await boot(sourceLocation,source,true);actor=await call('post','/auth/register',{principal,credential});
      const studentId=(await call('post','/students',{nickname:'匿名指导恢复',grade:4,preferredSessionMinutes:10,defaultVersionMap:{math:'',chinese:'',english:''}})).profile.id,atom='atomic:math:averagecount';
      await call('put','/students/'+studentId+'/learning-scope',{subject:'math',grade:4,term:'upper',textbookVolumeId:null,textbookVersion:'原创能力路径',learnedAtomIds:[atom],currentAtomId:atom,minutesPerSession:10});
      const baseline=await call('post','/diagnostics/sessions',{studentId,subject:'math',intent:'baseline',targetAtomIds:[atom],includePrerequisites:false,maxItems:4});
      for(const item of baseline.items)await call('post','/diagnostics/sessions/'+baseline.id+'/responses',{itemId:item.id,disposition:'skip',elapsedMs:100});await call('post','/diagnostics/sessions/'+baseline.id+'/complete',{});
      async function create(){
        const planCommand={baselineSessionId:baseline.id,minutesPerDay:10,useAi:false,expectedReportVersion:1,requestKey:randomUUID()};
        const plan=await call('post','/diagnostics/students/'+studentId+'/plans',planCommand),command={requestKey:randomUUID(),modelId:'auto',expectedRevision:plan.revision};
        return {plan,planCommand,command,row:await call('post',prefix(plan.id),command)};
      }
      const completed=await create();await worker.runNext();const done=await call('get',prefix(completed.plan.id)+'/'+completed.row.id);
      const adoption={requestKey:randomUUID(),expectedRevision:completed.plan.revision,suggestionRevision:done.revision};
      const adopted=await call('post',prefix(completed.plan.id)+'/'+done.id+'/adopt',adoption);
      const cancelled=await create();await call('post',prefix(cancelled.plan.id)+'/'+cancelled.row.id+'/cancel',{generation:cancelled.row.task.generation,version:cancelled.row.task.version});
      const queued=await create(),options={dataDir:source,destination:bundle,connectionString:sourceLocation,pgBin:process.env.STUDY_TEST_PG_BIN};
      if(driver==='sqlite')await backup.createBundle(options);else await backup.createPostgresBundle(options);
      await app.close();app=null;const target=join(directory,'target'),targetLocation=await database(target);await restore(targetLocation,target);await boot(targetLocation,target);
      await call('get','/auth/me',undefined,401,actor.token);actor=await call('post','/auth/login',{principal,credential},201,'');
      expect((await call('post','/diagnostics/students/'+studentId+'/plans',completed.planCommand)).id).toBe(completed.plan.id);
      expect((await call('get','/diagnostics/students/'+studentId+'/plan-requests/'+completed.planCommand.requestKey)).id).toBe(completed.plan.id);
      expect((await call('post',prefix(completed.plan.id)+'/'+done.id+'/adopt',adoption)).revision).toBe(adopted.revision);
      expect((await call('get',prefix(cancelled.plan.id)+'/'+cancelled.row.id)).status).toBe('cancelled');
      expect((await call('post',prefix(queued.plan.id),queued.command)).id).toBe(queued.row.id);
      await worker.runNext();expect(provider).toHaveBeenCalledTimes(1);expect((await call('get',prefix(queued.plan.id)+'/'+queued.row.id))).toMatchObject({status:'completed',modelId:'deepseek-v4-flash'});
      const exported=await call('post','/privacy/account/export',{credential,requestKey:randomUUID()}),portable=exported.accountRecords.guidanceModelSuggestions.find((row:any)=>row.id===done.id);
      expect(portable).toMatchObject({publication:'published',adoptedRevision:adopted.revision,modelId:'deepseek-v4-flash'});
      for(const key of ['context','taskId','inputHash','commandHash','definitionHash','planHash','bindingId','authorizationRole','requests','requestKey','status'])expect(portable).not.toHaveProperty(key);
      const preview=await call('get','/privacy/students/'+studentId+'/deletion-preview');await call('post','/privacy/students/'+studentId+'/delete',{credential,confirmation:preview.confirmation,fingerprint:preview.fingerprint,requestKey:randomUUID()});
      await call('get',prefix(completed.plan.id),undefined,404);
      const account=await call('get','/privacy/account/deletion-preview');await call('post','/privacy/account/delete',{credential,confirmation:account.confirmation,fingerprint:account.fingerprint,requestKey:randomUUID()});
      const deletionLedger=join(directory,'latest-deletions.json');expect((await ledger.exportLedger({...driver==='sqlite'?{dataDir:target}:{connectionString:targetLocation},destination:deletionLedger})).deletions).toBe(2);
      await app.close();app=null;const deleted=join(directory,'deleted'),deletedLocation=await database(deleted);expect((await restore(deletedLocation,deleted,deletionLedger)).appliedDeletionReceipts).toBe(2);
      await boot(deletedLocation,deleted);await call('post','/auth/login',{principal,credential},401,'');await store.requestContext(()=>{expect(store.guidanceModelSuggestions).toHaveLength(0);expect(store.diagnosticPlans).toHaveLength(0);expect(store.guidancePlanRevisions).toHaveLength(0);});
      await worker.runNext();expect(provider).not.toHaveBeenCalled();
    }finally{
      await app?.close();vi.restoreAllMocks();if(admin){try{for(const name of databases){if(!/^study_qa_guidance_recovery_[a-f0-9]{32}$/.test(name))throw Error('Unsafe guidance QA database');await admin.query('DROP DATABASE "'+name+'" WITH (FORCE)');}}finally{await admin.end();}}
      for(const[name,value]of Object.entries(prior)){if(value===undefined)delete process.env[name];else process.env[name]=value;}
      if(!resolve(directory).startsWith(resolve(tmpdir())+sep))throw Error('Unsafe guidance recovery directory');rmSync(directory,{recursive:true,force:true});
    }
  },60000);
});

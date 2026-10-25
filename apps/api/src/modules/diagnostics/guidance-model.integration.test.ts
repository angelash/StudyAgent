import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve,sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Pool } from 'pg';

describe('durable parent guidance suggestions and immutable rule actions',()=>{
  const directory=mkdtempSync(join(tmpdir(),'study-guidance-model-'));
  const names=['NODE_ENV','STUDY_DATA_DIR','STUDY_STORAGE','DATABASE_URL','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','XIAOJIU_CHAT_ENABLED'] as const;
  const prior=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  let app:any,store:any,worker:any,provider:any,actor:any,other:any,studentId:string,baseline:any,pg:Pool|undefined,schema:string|undefined;
  let mode:'valid'|'invalid'|'hold'='valid',releaseModel:(()=>void)|null=null;
  async function call(method:'get'|'post'|'put'|'patch',path:string,body?:unknown,expected=method==='post'?201:200,user=actor) {
    let query=request(app.getHttpServer())[method]('/api'+path);if(user)query=query.set('Authorization','Bearer '+user.token);if(body!==undefined)query=query.send(body as object);
    const response=await query;expect(response.status,JSON.stringify(response.body.error)).toBe(expected);return response.body.data;
  }
  beforeAll(async()=>{
    const location=process.env.STUDY_TEST_GUIDANCE_MODEL_POSTGRES_URL;if(location){pg=new Pool({connectionString:location});expect((await pg.query('SELECT current_database() name')).rows[0].name).toBe('study_agent_qa');schema='study_qa_guidance_'+randomUUID().replace(/-/g,'');await pg.query('CREATE SCHEMA \"'+schema+'\"');const url=new URL(location);url.searchParams.set('options','-c search_path='+schema);process.env.DATABASE_URL=url.toString();}
    Object.assign(process.env,{NODE_ENV:'development',STUDY_DATA_DIR:directory,STUDY_STORAGE:location?'postgres':'sqlite',STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'true',XIAOJIU_CHAT_ENABLED:'true'});
    const load=(name:string)=>require('../../../dist/apps/api/src/'+name+'.js');
    app=await NestFactory.create(load('app.module').AppModule,{logger:false});app.setGlobalPrefix('api');await app.init();
    store=app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);worker=app.get(load('modules/diagnostics/guidance-model-worker.service').GuidanceModelWorkerService);
    provider=vi.spyOn(app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService),'structured').mockImplementation(async(input:any,_schema:any,check:any)=>{
      const original=JSON.parse(input.context).original,value={summary:'先保留观察和未知，再核查每一项行动的下一步。',activities:original.actions.map((action:any)=>({actionId:action.id,
        activity:'先让孩子独立完成两个新情境小测，记录观察，再核查是否需要讲解；已有结果继续保留不确定性。',evidenceIds:action.evidenceIds}))};
      if(mode==='invalid')Object.assign(value.activities[0],{minutes:60});
      if(mode==='hold')await new Promise<void>((accept,reject)=>{releaseModel=()=>{releaseModel=null;accept();};input.signal?.addEventListener('abort',()=>{releaseModel=null;reject(Error('synthetic stopped'));},{once:true});});
      return {...check(value),modelId:input.modelId,modelName:'Synthetic guidance QA provider'};
    });
    actor=await call('post','/auth/register',{principal:'guidance-model-'+randomUUID()+'@local.test',credential:'Guidance-QA-only-20261025'},201,null);
    other=await call('post','/auth/register',{principal:'guidance-other-'+randomUUID()+'@local.test',credential:'Guidance-QA-only-20261025'},201,null);
    studentId=(await call('post','/students',{nickname:'匿名指导建议',grade:4,preferredSessionMinutes:15,defaultVersionMap:{math:'',chinese:'',english:''}})).profile.id;
    const atom='atomic:math:averagecount';await call('put','/students/'+studentId+'/learning-scope',{subject:'math',grade:4,term:'upper',textbookVolumeId:null,textbookVersion:'原创能力路径',learnedAtomIds:[atom],currentAtomId:atom,minutesPerSession:15});
    baseline=await call('post','/diagnostics/sessions',{studentId,subject:'math',intent:'baseline',targetAtomIds:[atom],includePrerequisites:false,maxItems:4});
    for(const item of baseline.items)await call('post','/diagnostics/sessions/'+baseline.id+'/responses',{itemId:item.id,disposition:'skip',elapsedMs:100});
    await call('post','/diagnostics/sessions/'+baseline.id+'/complete',{});
  },60000);
  afterAll(async()=>{releaseModel?.();await app?.close();vi.restoreAllMocks();if(pg){if(!/^study_qa_guidance_[a-f0-9]{32}$/.test(schema??''))throw Error('Unsafe guidance schema');await pg.query('DROP SCHEMA \"'+schema+'\" CASCADE');await pg.end();}for(const[name,value]of Object.entries(prior)){if(value===undefined)delete process.env[name];else process.env[name]=value;}
    if(!resolve(directory).startsWith(resolve(tmpdir())+sep))throw Error('Unsafe guidance QA directory');rmSync(directory,{recursive:true,force:true});});
  const prefix=(id:string)=>'/diagnostics/plans/'+id+'/model-suggestions';
  async function plan(useAi=false) {return call('post','/diagnostics/students/'+studentId+'/plans',{baselineSessionId:baseline.id,minutesPerDay:10,useAi,requestKey:randomUUID()});}
  async function suggestion(plan:any) {return call('post',prefix(plan.id),{modelId:'auto',expectedRevision:plan.revision,requestKey:randomUUID()});}
  it('creates one rule plan and queued suggestion atomically, replays its creation and leaves its text unchanged until explicit adoption',async()=>{
    const command={baselineSessionId:baseline.id,minutesPerDay:10,useAi:true,requestKey:randomUUID()},first=await call('post','/diagnostics/students/'+studentId+'/plans',command);
    expect(first.source).toBe('rules');expect(first.modelRequest.status).toBe('queued');expect(provider).not.toHaveBeenCalled();
    const same=await call('post','/diagnostics/students/'+studentId+'/plans',command);expect(same.id).toBe(first.id);
    await call('post','/diagnostics/students/'+studentId+'/plans',{...command,minutesPerDay:15},409);
    const list=await call('get',prefix(first.id));expect(list.suggestions).toHaveLength(1);expect(list.suggestions[0].modelId).toBe('deepseek-v4-flash');
    await worker.runNext();const done=await call('get',prefix(first.id)+'/'+list.suggestions[0].id);expect(done.status).toBe('completed');expect(done.eligibility.canAdopt).toBe(true);
    expect((await call('get','/diagnostics/plans/'+first.id)).summary).toBe(first.summary);
    const adopt={requestKey:randomUUID(),expectedRevision:first.revision,suggestionRevision:done.revision},path=prefix(first.id)+'/'+done.id+'/adopt';
    const adopted=await call('post',path,adopt);expect(adopted.source).toBe('ai');expect(adopted.revision).toBe(first.revision+1);expect((await call('post',path,adopt)).revision).toBe(adopted.revision);
    expect(adopted.actions.map(({activity:_,...action}:any)=>action)).toEqual(first.actions.map(({activity:_,...action}:any)=>action));
    expect((await call('get','/diagnostics/plans/'+first.id+'/history')).at(-1).snapshot.summary).toBe(first.summary);
  });
  it('retains failure without changing the plan and retries the original actual model',async()=>{
    const original=await plan(),row=await suggestion(original);mode='invalid';await worker.runNext();mode='valid';
    const failed=await call('get',prefix(original.id)+'/'+row.id);expect(failed.status).toBe('failed');expect(failed.result).toBeNull();expect((await call('get','/diagnostics/plans/'+original.id)).source).toBe('rules');
    await call('post',prefix(original.id)+'/'+row.id+'/retry',{generation:failed.task.generation,version:failed.task.version});await worker.runNext();expect((await call('get',prefix(original.id)+'/'+row.id)).status).toBe('completed');
  });
  it('prevents a model finishing after plan activation from publishing or replacing the active plan',async()=>{
    const original=await plan(),row=await suggestion(original);mode='hold';const work=worker.runNext();await expect.poll(()=>!!releaseModel).toBe(true);
    await call('patch','/diagnostics/plans/'+original.id,{status:'active',expectedRevision:original.revision});releaseModel!();await work;mode='valid';
    const failed=await call('get',prefix(original.id)+'/'+row.id);expect(failed.status).toBe('failed');expect(failed.result).toBeNull();expect((await call('get','/diagnostics/plans/'+original.id)).summary).toBe(original.summary);
  });
  it('cancels a queued suggestion and keeps another account outside the task and adoption boundaries',async()=>{
    const original=await plan(),row=await suggestion(original);await call('get',prefix(original.id)+'/'+row.id,undefined,404,other);
    const cancelled=await call('post',prefix(original.id)+'/'+row.id+'/cancel',{generation:row.task.generation,version:row.task.version});expect(cancelled.status).toBe('cancelled');
    await call('post',prefix(original.id)+'/'+row.id+'/adopt',{requestKey:randomUUID(),expectedRevision:original.revision,suggestionRevision:cancelled.revision},409);
  });
  it('keeps the rule plan when a requested model is unavailable and returns exact creation receipts',async()=>{
    const command={baselineSessionId:baseline.id,minutesPerDay:10,useAi:true,modelId:'unavailable-qa-model',requestKey:randomUUID()};
    const saved=await call('post','/diagnostics/students/'+studentId+'/plans',command);
    expect(saved).toMatchObject({source:'rules',aiStatus:'unavailable',modelRequest:{status:'unavailable'}});
    expect((await call('get',prefix(saved.id))).suggestions).toHaveLength(0);
    expect((await call('get','/diagnostics/students/'+studentId+'/plan-requests/'+command.requestKey)).id).toBe(saved.id);
    expect((await call('post','/diagnostics/students/'+studentId+'/plans',command)).id).toBe(saved.id);
    await call('get','/diagnostics/students/'+studentId+'/plan-requests/'+command.requestKey,undefined,403,other);
    const revision=(await call('get','/diagnostics/plans/'+saved.id+'/history'))[0];expect(revision).not.toHaveProperty('requestKey');expect(revision).not.toHaveProperty('inputHash');
  });
  it('serializes identical commands across two app instances and refuses two active suggestions for a plan',async()=>{
    const second=await NestFactory.create(require('../../../dist/apps/api/src/app.module.js').AppModule,{logger:false});second.setGlobalPrefix('api');await second.init();
    const post=(path:string,body:unknown)=>request(second.getHttpServer()).post('/api'+path).set('Authorization','Bearer '+actor.token).send(body as object);
    try {
      const command={baselineSessionId:baseline.id,minutesPerDay:10,useAi:false,requestKey:randomUUID()};
      const [one,two]=await Promise.all([call('post','/diagnostics/students/'+studentId+'/plans',command),post('/diagnostics/students/'+studentId+'/plans',command)]);
      expect(two.status,JSON.stringify(two.body.error)).toBe(201);expect(two.body.data.id).toBe(one.id);
      const suggestionCommand={expectedRevision:one.revision,modelId:'auto',requestKey:randomUUID()};
      const [first,again]=await Promise.all([call('post',prefix(one.id),suggestionCommand),post(prefix(one.id),suggestionCommand)]);
      expect(again.status,JSON.stringify(again.body.error)).toBe(201);expect(again.body.data.id).toBe(first.id);
      await call('post',prefix(one.id),{...suggestionCommand,requestKey:randomUUID()},409);
      await call('post',prefix(one.id),{...suggestionCommand,modelId:'claude-sonnet-5'},409);
      await call('post',prefix(one.id)+'/'+first.id+'/cancel',{generation:first.task.generation,version:first.task.version});
    } finally {await second.close();}
  });
  it('pages immutable completed history and locates an original request independently of the page',async()=>{
    const original=await plan(),created=[];
    for(let index=0;index<3;index++){const row=await suggestion(original);await worker.runNext();created.push(row);}
    const first=await call('get',prefix(original.id)+'?pageSize=2');expect(first.suggestions).toHaveLength(2);expect(first.hasMore).toBe(true);
    const next=await call('get',prefix(original.id)+'?pageSize=2&page=2');expect(next.suggestions).toHaveLength(1);expect(next.hasMore).toBe(false);
    expect(new Set([...first.suggestions,...next.suggestions].map((row:any)=>row.id)).size).toBe(3);
    expect((await call('get',prefix(original.id)+'?requestKey='+created[0].requestKey)).suggestions[0].id).toBe(created[0].id);
  });
  for(const change of ['paused','adjusted'] as const)it('rejects a late model result after the plan is '+change,async()=>{
    const original=await plan(),row=await suggestion(original);mode='hold';const work=worker.runNext();await expect.poll(()=>!!releaseModel).toBe(true);
    try {
      if(change==='paused')await call('patch','/diagnostics/plans/'+original.id,{status:'paused',expectedRevision:original.revision});
      else await call('post','/diagnostics/plans/'+original.id+'/adjust',{expectedRevision:original.revision,requestKey:randomUUID(),reason:'合成测试中由家长明确调整活动说明',minutesPerDay:original.minutesPerDay,acknowledgeReportVersion:original.baselineReportVersion,
        actions:original.actions.map((action:any)=>({actionId:action.id,minutes:action.minutes,activity:'家长手工保留的独立观察活动，不允许迟到建议替换。'}))});
      releaseModel?.();await work;const done=await call('get',prefix(original.id)+'/'+row.id);expect(done.status).toBe('failed');expect(done.result).toBeNull();
      expect((await call('get','/diagnostics/plans/'+original.id)).revision).toBe(original.revision+1);
    }finally{releaseModel?.();await work;mode='valid';}
  });
  it('cannot publish or retry after the exact original guardian authorization was revoked',async()=>{
    const original=await plan(),row=await suggestion(original);mode='hold';const work=worker.runNext();await expect.poll(()=>!!releaseModel).toBe(true);
    const bindingId=await store.requestContext(()=>store.find('bindings',{studentId,parentUserId:actor.user.id,status:'active'}).id);
    try {
      await store.transaction(()=>{store.find('bindings',{id:bindingId}).status='revoked';});releaseModel?.();await work;
      const failed=await store.requestContext(async()=>{const saved=store.find('guidanceModelSuggestions',{id:row.id});expect(saved.result).toBeNull();const task=await store.tasks.get(saved.taskId);expect(task.state).toBe('failed');return task;});
      await call('get',prefix(original.id)+'/'+row.id,undefined,403);
      await call('post',prefix(original.id)+'/'+row.id+'/retry',{generation:failed.generation,version:failed.version},403);
    }finally{releaseModel?.();await work;mode='valid';await store.transaction(()=>{store.find('bindings',{id:bindingId}).status='active';});}
  });
  it('does not publish an obsolete report, and adopting a completed suggestion requires its original plan revision',async()=>{
    const original=await plan(),row=await suggestion(original);await worker.runNext();
    await call('post',prefix(original.id)+'/'+row.id+'/adopt',{requestKey:randomUUID(),expectedRevision:original.revision+1,suggestionRevision:3},409);
    const late=await plan(),pending=await suggestion(late);mode='hold';const work=worker.runNext();await expect.poll(()=>!!releaseModel).toBe(true);
    try{
      // Simulate a real measurement-method upgrade before invoking the public report reanalysis command.
      await store.transaction(()=>{store.select('diagnosticReports',{sessionId:baseline.id}).at(-1).report.familyIdentityVersion='previous-qa-method';});
      await call('post','/diagnostics/sessions/'+baseline.id+'/reanalyze',{requestKey:randomUUID(),expectedReportVersion:late.baselineReportVersion,reason:'合成测试在生成期间按新计量方法重分析原始证据'});releaseModel?.();await work;
      expect((await call('get',prefix(late.id)+'/'+pending.id)).status).toBe('failed');
      const done=await call('get',prefix(original.id)+'/'+row.id);expect(done.eligibility.canAdopt).toBe(false);
      await call('post',prefix(original.id)+'/'+row.id+'/adopt',{requestKey:randomUUID(),expectedRevision:original.revision,suggestionRevision:done.revision},409);
    }finally{releaseModel?.();await work;mode='valid';}
  });
});

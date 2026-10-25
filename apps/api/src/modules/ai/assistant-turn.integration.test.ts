import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { beforeAll,afterAll,afterEach,describe,it,expect,vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

describe('ordinary assistant durable turns and immutable publication context',()=>{
  const directory=mkdtempSync(join(tmpdir(),'study-assistant-turns-'));
  const names=['NODE_ENV','STUDY_STORAGE','DATABASE_URL','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','XIAOJIU_CHAT_ENABLED'] as const;
  const prior=Object.fromEntries(names.map(n=>[n,process.env[n]]));
  let app:any,store:any,worker:any,chat:any,ai:any,parent:any,other:any,pg:Pool|undefined,schema:string|undefined;
  const base=(id:string)=>'/ai/assistant/sessions/'+id;
  async function call(method:'get'|'post',path:string,body?:unknown,actor=parent,status=method==='post'?201:200,target=app){
    let q=request(target.getHttpServer())[method]('/api'+path);if(actor)q=q.set('Authorization','Bearer '+actor.token);if(body!==undefined)q=q.send(body as object);return (await q.expect(status)).body.data;
  }
  async function boot(){const {AppModule}=require('../../../dist/apps/api/src/app.module.js');app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api');await app.init();
    store=app.get(require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js').InMemoryStoreService);
    worker=app.get(require('../../../dist/apps/api/src/modules/ai/assistant-turn-worker.service.js').AssistantTurnWorkerService);
    chat=app.get(require('../../../dist/apps/api/src/modules/ai/xiaojiu-chat.service.js').XiaojiuChatService);ai=app.get(require('../../../dist/apps/api/src/modules/ai/ai.service.js').AiService);}
  beforeAll(async()=>{
    let driver='sqlite';const url=process.env.STUDY_TEST_ASSISTANT_TURN_POSTGRES_URL;if(url){pg=new Pool({connectionString:url});expect((await pg.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa');schema='study_qa_assistant_'+randomUUID().replace(/-/g,'');await pg.query('CREATE SCHEMA "'+schema+'"');const scoped=new URL(url);scoped.searchParams.set('options','-c search_path='+schema);process.env.DATABASE_URL=scoped.toString();driver='postgres';}
    Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:driver,STUDY_DATA_DIR:directory,STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'false',XIAOJIU_CHAT_ENABLED:'true'});
    await boot();parent=await call('post','/auth/register',{principal:'assistant-parent@local.test',credential:'Assistant-QA-only-20261025'},null);other=await call('post','/auth/register',{principal:'assistant-other@local.test',credential:'Assistant-QA-only-20261025'},null);
  });
  afterEach(()=>vi.restoreAllMocks());
  afterAll(async()=>{await app?.close();if(pg){if(!/^study_qa_assistant_[a-f0-9]{32}$/.test(schema??''))throw Error('Unsafe QA schema');await pg.query('DROP SCHEMA "'+schema+'" CASCADE');await pg.end();}
    for(const[n,v]of Object.entries(prior)){if(v===undefined)delete process.env[n];else process.env[n]=v;}rmSync(directory,{recursive:true,force:true});});
  const child=async(actor=parent)=>(await call('post','/students',{nickname:'匿名测试学习者',grade:3,preferredSessionMinutes:15,defaultVersionMap:{math:'',chinese:'',english:''}},actor)).profile;
  async function open(actor=parent,extra:Record<string,unknown>={}){const studentId='studentId' in extra?extra.studentId:(await child(actor)).id;return call('post','/ai/assistant/sessions',{userRole:'parent',studentId,pageContext:'review',...extra},actor);}
  async function input(session:any,actor=parent,extra:object={}){const c=await call('get',base(session.id)+'/context',undefined,actor);return {requestKey:randomUUID(),message:'请根据已有证据说明下一步。',modelId:'deepseek-v4-flash',contextVersion:c.contextVersion,...extra};}
  const reply=()=>vi.spyOn(chat,'reply').mockResolvedValue({reply:'先比较已有条件，再用一个新情境验证。',evidenceIds:[],modelId:'deepseek-v4-flash',modelName:'Synthetic assistant model'});
  const read=(s:any,t:any)=>call('get',base(s.id)+'/turns/'+t.id);
  const control=(s:any,t:any,action:string)=>call('post',base(s.id)+'/turns/'+t.id+'/'+action,{generation:t.task.generation,version:t.task.version});
  async function practice(){const student=await child(),childId=student.id,practice='practice-'+randomUUID(),question='question-'+randomUUID();
    const binding=await store.requestContext(()=>store.find('bindings',{studentId:childId,parentUserId:parent.user.id,status:'active'}).id);
    await store.transaction(()=>{
      store.append('diagnosticPlans',{id:practice+'-plan',studentId:childId,subject:'math',status:'active',createdAt:new Date().toISOString(),summary:'核对条件后做独立新题。',actions:[],evidenceIds:[]});
      store.append('practiceSessions',{id:practice,studentId:childId,subject:'math',planId:practice+'-plan',status:'in_progress',atomId:'synthetic-atom',questionIds:[question],snapshots:[{id:question,stem:'匿名积木：先整理数量与目标。',answer:731,analysis:'PRIVATE_SCORING_REFERENCE',answerSchema:{gradingConfig:{private:'PRIVATE_KEY'},mode:'numeric_blank'}}],drafts:{}});});
    const session=await open(parent,{userRole:'student',studentId:childId,subject:'math',pageContext:'mission',contextRefType:'practice',contextRefId:practice,contextItemId:question});return {child:childId,practice,question,binding,session};
  }
  it('queues once, returns a public view, freezes model resolution and saves one validated pair',async()=>{
    const s=await open(parent,{studentId:null}),c=await input(s),mock=reply(),t=await call('post',base(s.id)+'/turns',c);
    expect(t.status).toBe('queued');expect(JSON.stringify(t)).not.toMatch(/prepared|authorization|contextJson|inputHash|commandHash|taskId/);
    expect((await call('post',base(s.id)+'/turns',c)).id).toBe(t.id);expect(mock).not.toHaveBeenCalled();
    await worker.runNext();const done=await read(s,t);expect(done.status).toBe('completed');expect(done.assistantMessageId).toBeTruthy();
    const messages=await call('get',base(s.id)+'/messages');expect(messages).toHaveLength(2);expect(messages[1].modelId).toBe('deepseek-v4-flash');expect(mock).toHaveBeenCalledTimes(1);
    const models=app.get(require('../../../dist/apps/api/src/modules/ai/xiaojiu-models.service.js').XiaojiuModelsService);vi.spyOn(models,'resolve').mockImplementation(()=>{throw Error('catalog changed');});
    expect((await call('post',base(s.id)+'/turns',c)).assistantMessageId).toBe(done.assistantMessageId);
    await call('post',base(s.id)+'/turns',{...c,modelId:'gpt-6.1-sol'},parent,409);expect(await worker.runNext()).toBe(false);
  });
  it('serializes concurrent creation from two application instances and isolates other owners',async()=>{
    const s=await open(),c=await input(s),{AppModule}=require('../../../dist/apps/api/src/app.module.js'),second=await NestFactory.create(AppModule,{logger:false});second.setGlobalPrefix('api');await second.init();
    try{const results=await Promise.all([call('post',base(s.id)+'/turns',c),call('post',base(s.id)+'/turns',c,parent,201,second)]);expect(results[0].id).toBe(results[1].id);
      await call('post',base(s.id)+'/turns',{...c,requestKey:randomUUID()},parent,409);
      await call('get',base(s.id)+'/turns/'+results[0].id,undefined,other,404);await call('get',base(s.id)+'/messages/page',undefined,other,404);
      await control(s,results[0],'cancel');expect((await read(s,results[0])).status).toBe('cancelled');
    }finally{await second.close();}
  });
  it('cancels queued work without a message and retries the original command with a new generation',async()=>{
    const s=await open(),c=await input(s),t=await call('post',base(s.id)+'/turns',c),mock=reply();
    const cancelled=await control(s,t,'cancel');expect(cancelled.status).toBe('cancelled');expect(await worker.runNext()).toBe(false);expect(mock).not.toHaveBeenCalled();
    const retry=await control(s,cancelled,'retry');expect(retry.task.generation).toBe(cancelled.task.generation+1);expect(retry.message).toBe(c.message);
    await worker.runNext();expect((await read(s,t)).status).toBe('completed');expect(await call('get',base(s.id)+'/messages')).toHaveLength(2);
  });
  it('acknowledges running cancellation and fences the late provider result',async()=>{
    const s=await open(),t=await call('post',base(s.id)+'/turns',await input(s));let release!:()=>void,entered!:()=>void;
    const gate=new Promise<void>(r=>release=r),arrival=new Promise<void>(r=>entered=r);vi.spyOn(chat,'reply').mockImplementation(async()=>{entered();await gate;return {reply:'这份迟到回答不能发布。',evidenceIds:[],modelId:'deepseek-v4-flash',modelName:'Synthetic'};});
    const running=worker.runNext();try{await arrival;const active=await read(s,t),cancelled=await control(s,active,'cancel');expect(cancelled.status).toBe('cancelling');release();await running;
      expect((await read(s,t)).status).toBe('cancelled');expect(await call('get',base(s.id)+'/messages')).toHaveLength(0);
    }finally{release();await running;}
  });
  it('rejects a changed first answer rather than retroactively recording assistance',async()=>{
    const f=await practice(),c=await input(f.session),t=await call('post',base(f.session.id)+'/turns',c);let release!:()=>void,entered!:()=>void;
    const gate=new Promise<void>(r=>release=r),arrival=new Promise<void>(r=>entered=r);vi.spyOn(chat,'reply').mockImplementation(async(cmd:any)=>{expect(cmd.context).not.toContain('PRIVATE_SCORING_REFERENCE');expect(cmd.context).not.toContain('731');entered();await gate;return {reply:'先核对条件再解释。',evidenceIds:[],modelId:'deepseek-v4-flash',modelName:'Synthetic'};});
    const running=worker.runNext();try{await arrival;await store.transaction(()=>store.append('practiceAttempts',{id:'first-'+randomUUID(),sessionId:f.practice,questionId:f.question,attempt:1,status:'answered',correct:true,hintLevel:0,answer:731,at:new Date().toISOString()}));release();await running;
      const done=await read(f.session,t);expect(done.status).toBe('failed');expect(done.task.errorCode).toBe('assistant_context_changed');expect(await call('get',base(f.session.id)+'/messages')).toHaveLength(0);
      await store.requestContext(()=>expect(store.select('practiceHints',{sessionId:f.practice})).toHaveLength(0));
      await call('post',base(f.session.id)+'/turns/'+t.id+'/retry',{generation:done.task.generation,version:done.task.version},parent,409);
    }finally{release();await running;}
  });
  it('does not revive work after the original binding is revoked and a different binding is granted',async()=>{
    const f=await practice(),t=await call('post',base(f.session.id)+'/turns',await input(f.session));let release!:()=>void,entered!:()=>void;
    const gate=new Promise<void>(r=>release=r),arrival=new Promise<void>(r=>entered=r);vi.spyOn(chat,'reply').mockImplementation(async()=>{entered();await gate;return {reply:'只给当前下一步提示。',evidenceIds:[],modelId:'deepseek-v4-flash',modelName:'Synthetic'};});
    const running=worker.runNext();try{await arrival;await store.transaction(()=>{store.find('bindings',{id:f.binding}).status='inactive';store.append('bindings',{id:'new-'+randomUUID(),parentUserId:parent.user.id,studentId:f.child,status:'active',relation:'guardian'});});release();await running;
      const done=await read(f.session,t);expect(done.status).toBe('failed');expect(await call('get',base(f.session.id)+'/messages')).toHaveLength(0);
      await call('post',base(f.session.id)+'/turns/'+t.id+'/retry',{generation:done.task.generation,version:done.task.version},parent,403);
    }finally{release();await running;}
  });
  it('reads all historical messages through bounded pages and binds a search cursor to its session and query',async()=>{
    const s=await open(),foreign=await open(other);
    await store.transaction(()=>{for(let i=0;i<75;i++)store.append('assistantMessages',{id:'history-'+String(i).padStart(3,'0'),sessionId:s.id,sender:i%2?'assistant':'user',content:i%10===0?'needle '+i:'匿名历史 '+i,createdAt:'2026-10-24T10:00:00.000Z'});store.append('assistantMessages',{id:'foreign-message',sessionId:foreign.id,sender:'user',content:'FOREIGN_PRIVATE_NEEDLE',createdAt:'2026-10-24T10:00:00.000Z'});});
    expect(await call('get',base(s.id)+'/messages')).toHaveLength(50);let cursor:string|null=null;const ids:string[]=[];
    do{const p=await call('get',base(s.id)+'/messages/page?pageSize=17'+(cursor?'&cursor='+encodeURIComponent(cursor):''));ids.push(...p.messages.map((m:any)=>m.id));cursor=p.nextCursor;}while(cursor);
    expect(ids).toHaveLength(75);expect(new Set(ids).size).toBe(75);
    expect(ids.slice(0,3)).toEqual(['history-074','history-073','history-072']);
    const first=await call('get',base(s.id)+'/messages/page?query=needle&pageSize=3');expect(first.nextCursor).toBeTruthy();
    await call('get',base(s.id)+'/messages/page?query=changed&cursor='+encodeURIComponent(first.nextCursor),undefined,parent,400);
    await call('get',base(s.id)+'/messages/page?pageSize=51',undefined,parent,400);
    const history=await call('get','/ai/assistant/history?query=needle');expect(JSON.stringify(history)).not.toContain('FOREIGN_PRIVATE_NEEDLE');expect(history.sessions.find((r:any)=>r.sessionId===s.id).messageCount).toBe(75);
  });
  it('retains one queued command over a cold restart and rejects the expired worker lease',async()=>{
    const s=await open(),c=await input(s),t=await call('post',base(s.id)+'/turns',c),old=await store.tasks.claim(['assistant.turn.reply'],100);
    expect(old.id).toBeTruthy();await app.close();await new Promise(r=>setTimeout(r,120));await boot();reply();
    expect((await call('post',base(s.id)+'/turns',c)).id).toBe(t.id);await worker.runNext();expect((await read(s,t)).status).toBe('completed');
    await expect(store.transaction(()=>{store.find('assistantTurns',{id:t.id}).message='OLD_WORKER_LEAK';},{id:old.id,token:old.leaseToken})).rejects.toThrow();
    expect((await read(s,t)).message).toBe(c.message);expect(await call('get',base(s.id)+'/messages')).toHaveLength(2);
  });
  it('exports public turns but removes frozen scoring, authorization and worker commands from portable records',async()=>{
    const f=await practice(),t=await call('post',base(f.session.id)+'/turns',await input(f.session));reply();await worker.runNext();expect((await read(f.session,t)).status).toBe('completed');
    await store.requestContext(()=>{const {portableRecords,accountRecords,studentRecords}=require('../../../dist/apps/api/src/modules/privacy/privacy-records.js');
      const selected=accountRecords(store,parent.user.id,parent.user.principal),portable=portableRecords(selected,parent.user.id),row=portable.assistantTurns.find((r:any)=>r.id===t.id);
      expect(row.message).toBe(t.message);expect(JSON.stringify(row)).not.toMatch(/PRIVATE_SCORING_REFERENCE|PRIVATE_KEY|prepared|authorization|inputHash|commandHash|taskId|requestKey/);
      expect(studentRecords(store,f.child).assistantTurns.some((r:any)=>r.id===t.id)).toBe(true);
    });
  });
  it('keeps cancelled and failed questions searchable without inventing a saved assistant reply',async()=>{
    const s=await open(),c=await input(s,parent,{message:'SEARCH_CANCELLED_QUESTION'}),t=await call('post',base(s.id)+'/turns',c);await control(s,t,'cancel');
    const h=await call('get','/ai/assistant/history?query=SEARCH_CANCELLED_QUESTION');expect(h.sessions).toHaveLength(1);expect(h.sessions[0].lastTurn.status).toBe('cancelled');expect(h.sessions[0].messageCount).toBe(0);
  });
  it('retains readable history but does not navigate to a deleted original activity',async()=>{
    const f=await practice(),t=await call('post',base(f.session.id)+'/turns',await input(f.session));reply();await worker.runNext();
    expect((await call('get',base(f.session.id)+'/messages/page')).location.href).toContain('question='+f.question);
    await store.transaction(()=>store.remove('practiceSessions',{id:f.practice}));
    const saved=await call('get',base(f.session.id)+'/messages/page');expect(saved.messages).toHaveLength(2);expect(saved.location.href).toBeNull();
    expect((await read(f.session,t)).status).toBe('completed');
  });
  it('preserves user-before-reply causality at the same timestamp across a page boundary',async()=>{
    const s=await open();await store.transaction(()=>store.append('assistantMessages',
      {id:'z-causal-question',sessionId:s.id,sender:'user',content:'匿名原问题',createdAt:'2026-10-25T00:00:00.000Z'},
      {id:'a-causal-answer',sessionId:s.id,sender:'assistant',content:'匿名原回答',inReplyTo:'z-causal-question',createdAt:'2026-10-25T00:00:00.000Z'}));
    const latest=await call('get',base(s.id)+'/messages/page?pageSize=1');expect(latest.messages[0].id).toBe('a-causal-answer');
    const earlier=await call('get',base(s.id)+'/messages/page?pageSize=1&cursor='+encodeURIComponent(latest.nextCursor));expect(earlier.messages[0].id).toBe('z-causal-question');
    expect(earlier.messages[0].sequence).toBeLessThan(latest.messages[0].sequence);
  });
  it('rejects invalid citations and answer leaks without falling back or recording a hint',async()=>{
    const f=await practice(),t=await call('post',base(f.session.id)+'/turns',await input(f.session));
    const mock=vi.spyOn(chat,'reply').mockResolvedValue({reply:'这份回答包含731。',evidenceIds:['invented-evidence'],modelId:'deepseek-v4-flash',modelName:'Synthetic'});
    await worker.runNext();expect((await read(f.session,t)).status).toBe('failed');expect(await call('get',base(f.session.id)+'/messages')).toHaveLength(0);
    await store.requestContext(()=>expect(store.select('practiceHints',{sessionId:f.practice})).toHaveLength(0));
    const failed=await read(f.session,t);mock.mockResolvedValue({reply:'先重新核对已知条件。',evidenceIds:[],modelId:'deepseek-v4-flash',modelName:'Synthetic'});
    await control(f.session,failed,'retry');await worker.runNext();expect((await read(f.session,t)).status).toBe('completed');
    await store.requestContext(()=>expect(store.select('practiceHints',{sessionId:f.practice})).toHaveLength(1));
  });
  it('counts pending and cancelled commands once in the daily quota and permits exact replay',async()=>{
    const owner=await call('post','/auth/register',{principal:'assistant-quota@local.test',credential:'Assistant-QA-only-20261025'},null),s=await open(owner,{studentId:null}),at=new Date().toISOString();
    await store.transaction(()=>{for(let i=0;i<99;i++)store.append('assistantMessages',{id:'quota-'+i,sessionId:s.id,sender:'user',content:'合成旧提问',createdAt:at});});
    const c=await input(s,owner),t=await call('post',base(s.id)+'/turns',c,owner),cancelled=await call('post',base(s.id)+'/turns/'+t.id+'/cancel',{generation:t.task.generation,version:t.task.version},owner);
    expect(cancelled.status).toBe('cancelled');expect((await call('post',base(s.id)+'/turns',c,owner)).id).toBe(t.id);
    await call('post',base(s.id)+'/turns',{...c,requestKey:randomUUID()},owner,400);
  });
  it('the compatibility call cancels its actual latest task version when a running wait is aborted',async()=>{
    const s=await open(),controller=new AbortController();let release!:()=>void,entered!:()=>void;
    const gate=new Promise<void>(r=>release=r),arrival=new Promise<void>(r=>entered=r);vi.spyOn(chat,'reply').mockImplementation(async()=>{entered();await gate;return {reply:'这份兼容回答不能迟到发布。',evidenceIds:[],modelId:'deepseek-v4-flash',modelName:'Synthetic'};});
    const pending=ai.chat({sessionId:s.id,message:'兼容取消验证',modelId:'deepseek-v4-flash',requestKey:randomUUID(),signal:controller.signal});
    try{await arrival;controller.abort();await expect(pending).rejects.toThrow('请求取消');
      const latest=(await call('get',base(s.id)+'/turns')).turns[0];expect(latest.status).toBe('cancelling');release();
      await vi.waitFor(async()=>expect((await read(s,latest)).status).toBe('cancelled'));expect(await call('get',base(s.id)+'/messages')).toHaveLength(0);
    }finally{release();await pending.catch(()=>{});}
  });
  it('uses actual learner routes and rejects an original learning grant after disable and re-enable',async()=>{
    const f=await practice(),access=await call('post','/students/'+f.child+'/learning-access',{enabled:true,expectedVersion:0,requestKey:randomUUID(),reason:'匿名助教任务授权验证'});
    const code=await call('post','/students/'+f.child+'/learning-access/codes',{expectedVersion:access.version,requestKey:randomUUID()}),learner=await call('post','/auth/learning-code',{code:code.code},null);
    const s=await open(learner,{userRole:'student',studentId:f.child,subject:'math',pageContext:'mission',contextRefType:'practice',contextRefId:f.practice,contextItemId:f.question}),c=await input(s,learner),t=await call('post',base(s.id)+'/turns',c,learner);
    expect((await call('get',base(s.id)+'/turns/'+t.id,undefined,learner)).status).toBe('queued');
    const disabled=await call('post','/students/'+f.child+'/learning-access',{enabled:false,expectedVersion:access.version,requestKey:randomUUID(),reason:'撤回原学习授权验证'});
    const enabled=await call('post','/students/'+f.child+'/learning-access',{enabled:true,expectedVersion:disabled.version,requestKey:randomUUID(),reason:'启用新的学习授权验证'});
    const newCode=await call('post','/students/'+f.child+'/learning-access/codes',{expectedVersion:enabled.version,requestKey:randomUUID()}),current=await call('post','/auth/learning-code',{code:newCode.code},null),mock=reply();
    await worker.runNext();expect(mock).not.toHaveBeenCalled();const failed=await call('get',base(s.id)+'/turns/'+t.id,undefined,current);expect(failed.status).toBe('failed');
    await call('post',base(s.id)+'/turns/'+t.id+'/retry',{generation:failed.task.generation,version:failed.task.version},current,403);
    expect((await call('get',base(s.id)+'/messages/page',undefined,current)).messages).toHaveLength(0);
    await call('get',base(s.id)+'/turns/'+t.id,undefined,parent,404);
  });
  for(const kind of ['student','account'])it('fences an in-flight answer after actual '+kind+' deletion',async()=>{
    const credential='Assistant-QA-only-20261025',owner=await call('post','/auth/register',{principal:'assistant-delete-'+kind+'@local.test',credential},null);
    const s=await open(owner,kind==='account'?{studentId:null}:{}),t=await call('post',base(s.id)+'/turns',await input(s,owner),owner);
    const taskId=await store.requestContext(()=>store.find('assistantTurns',{id:t.id}).taskId);
    let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>release=r),arrival=new Promise<void>(r=>entered=r);
    vi.spyOn(chat,'reply').mockImplementation(async()=>{entered();await gate;return {reply:'删除之后不能发布这份回答。',evidenceIds:[],modelId:'deepseek-v4-flash',modelName:'Synthetic'};});
    const running=worker.runNext();try{await arrival;const target=kind==='account'?'/privacy/account':'/privacy/students/'+s.studentId,preview=await call('get',target+'/deletion-preview',undefined,owner);
      await call('post',target+'/delete',{credential,confirmation:preview.confirmation,fingerprint:preview.fingerprint,requestKey:randomUUID()},owner);
      release();await running;await store.requestContext(()=>{expect(store.select('assistantTurns',{id:t.id})).toHaveLength(0);expect(store.select('assistantMessages',{sessionId:s.id})).toHaveLength(0);});
      expect((await store.tasks.get(taskId)).state).toBe('cancelled');
    }finally{release();await running;}
  });
});

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { beforeAll,afterAll,describe,it,expect,vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve,sep } from 'node:path';
import { Pool } from 'pg';

describe('frozen guided project steps and instruction-only narration',()=>{
  const directory=mkdtempSync(join(tmpdir(),'study-project-teaching-'));
  const names=['NODE_ENV','DATABASE_URL','STUDY_STORAGE','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','MINIMAX_API_KEY','OPENAI_API_KEY'] as const;
  const prior=Object.fromEntries(names.map(name=>[name,process.env[name]]));let app:any,store:any,speech:any,teaching:any,synthesis:any,other:any,pg:Pool|undefined,schema:string|undefined,address=0;
  async function call(method:'get'|'post'|'patch',path:string,body?:unknown,actor?:any,status=method==='post'?201:200){let q=request(app.getHttpServer())[method]('/api'+path);if(path==='/auth/register')q=q.set('X-Forwarded-For','198.18.14.'+(++address));if(actor)q=q.set('Authorization','Bearer '+actor.token);if(body!==undefined)q=q.send(body as object);const r=await q;expect(r.status,JSON.stringify(r.body.error)).toBe(status);return r.body.data;}
  const register=()=>call('post','/auth/register',{principal:'project-teaching-'+randomUUID()+'@local.test',credential:'Project-teaching-QA-only-20261025'});
  async function setup(){const actor=await register(),row=await call('post','/learning/projects',{unitId:'soc-u1'},actor),view=await call('get','/learning/projects/'+row.id+'/teaching',undefined,actor);return{actor,row,view};}
  function command(view:any,step=view.stages[0].steps[1]){return{version:view.version,definitionFingerprint:view.definitionFingerprint,stageId:view.stages[0].stageId,stepId:step.id,sentenceIndex:0,unitId:step.speech.units[0].id,voice:view.speech.voices[0].id};}
  async function narration(actor:any,id:string,body:unknown){return request(app.getHttpServer()).post('/api/learning/projects/'+id+'/narration').set('Authorization','Bearer '+actor.token).send(body as object).buffer(true).parse((res,done)=>{const chunks:Buffer[]=[];res.on('data',(b:Buffer)=>chunks.push(b));res.on('end',()=>done(null,Buffer.concat(chunks)));});}
  beforeAll(async()=>{
    const location=process.env.STUDY_TEST_PROJECT_TEACHING_POSTGRES_URL;
    if(location){pg=new Pool({connectionString:location});expect((await pg.query('SELECT current_database() name')).rows[0].name).toBe('study_agent_qa');schema='study_qa_project_teaching_'+randomUUID().replace(/-/g,'');await pg.query('CREATE SCHEMA "'+schema+'"');const url=new URL(location);url.searchParams.set('options','-c search_path='+schema);process.env.DATABASE_URL=url.toString();}
    Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:location?'postgres':'sqlite',STUDY_DATA_DIR:directory,STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'false',MINIMAX_API_KEY:'synthetic-key-never-sent',OPENAI_API_KEY:''});
    const load=(name:string)=>require('../../../dist/apps/api/src/'+name+'.js');app=await NestFactory.create(load('app.module').AppModule,{logger:false});app.setGlobalPrefix('api');await app.init();
    store=app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);speech=app.get(load('modules/ai/speech.service').SpeechService);teaching=app.get(load('modules/learning/project-teaching.service').ProjectTeachingService);
    synthesis=vi.spyOn(speech,'synthesize').mockResolvedValue({content:Buffer.from('synthetic project audio'),contentType:'audio/mpeg',provider:'minimax'});other=await register();
  });
  afterAll(async()=>{await app?.close();vi.restoreAllMocks();if(pg){try{if(!/^study_qa_project_teaching_[a-f0-9]{32}$/.test(schema??''))throw Error('Unsafe teaching QA schema');await pg.query('DROP SCHEMA "'+schema+'" CASCADE');}finally{await pg.end();}}for(const[name,value]of Object.entries(prior)){if(value===undefined)delete process.env[name];else process.env[name]=value;}if(!resolve(directory).startsWith(resolve(tmpdir())+sep))throw Error('Unsafe teaching QA directory');rmSync(directory,{recursive:true,force:true});});
  it('derives navigation from the original frozen fields and narrates only its verified instruction unit',async()=>{
    const {actor,row,view}=await setup(),before=await call('get','/learning/projects/'+row.id,undefined,actor),stage=row.definition.stages[0];
    expect(view.stages[0].steps.map((s:any)=>s.id)).toEqual(['intro',...stage.fields.map((f:any)=>'field:'+f.id),'evidence','reflection']);
    const body=command(view),step=view.stages[0].steps[1],reply=await narration(actor,row.id,body);expect(reply.status).toBe(201);expect(reply.headers['content-type']).toContain('audio/mpeg');
    expect(synthesis).toHaveBeenLastCalledWith(step.speech.units[0].text,body.voice,expect.any(AbortSignal));expect(await call('get','/learning/projects/'+row.id,undefined,actor)).toEqual(before);
    expect(view).not.toHaveProperty('drafts');expect(view).not.toHaveProperty('submissions');
  });
  it('rejects other accounts, arbitrary text, stale content and unknown navigation or voice without calling speech',async()=>{
    const {actor,row,view}=await setup(),body=command(view),path='/learning/projects/'+row.id+'/narration',before=synthesis.mock.calls.length;
    await call('get','/learning/projects/'+row.id+'/teaching',undefined,other,403);await call('get','/learning/projects/'+row.id+'/teaching',undefined,undefined,401);
    await call('post',path,body,other,403);
    for(const bad of [{...body,text:'private answer'},{...body,path:'../../private'},{...body,stageId:'unknown'},{...body,stepId:'unknown'},{...body,voice:'unknown'}])await call('post',path,bad,actor,400);
    for(const bad of [{...body,definitionFingerprint:'old'},{...body,unitId:'old-unit'},{...body,sentenceIndex:999}])await call('post',path,bad,actor,409);
    expect(synthesis.mock.calls.length).toBe(before);
  });
  it('ignores private answer edits while preserving their exact drafts and the old frozen teaching definition',async()=>{
    const {actor,row,view}=await setup(),stage=row.currentStageId,values=Object.fromEntries(row.definition.stages[0].fields.map((f:any)=>[f.id,'PRIVATE ANSWER NEVER NARRATED '+randomUUID()]));
    const saved=await call('patch','/learning/projects/'+row.id,{expectedRevision:row.revision,requestKey:randomUUID(),stageId:stage,artifact:{values,evidence:[]}},actor);
    const priorCalls=synthesis.mock.calls.length;for(const step of view.stages[0].steps)await narration(actor,row.id,command(view,step));
    expect(JSON.stringify(synthesis.mock.calls.slice(priorCalls))).not.toContain('PRIVATE ANSWER');expect(await call('get','/learning/projects/'+row.id,undefined,actor)).toEqual(saved);
  });
  it('refuses an in-flight result after its original login is revoked and honors exact cancellation',async()=>{
    const {actor,row,view}=await setup(),body=command(view),load=(name:string)=>require('../../../dist/apps/api/src/'+name+'.js');
    let release!:(value:any)=>void,arrive!:()=>void;const arrival=new Promise<void>(resolve=>arrive=resolve);synthesis.mockImplementationOnce(()=>{arrive();return new Promise(resolve=>release=resolve);});
    const operation=narration(actor,row.id,body).then(result=>result);await arrival;await call('post','/auth/logout',{},actor);release({content:Buffer.from('late audio'),contentType:'audio/mpeg',provider:'minimax'});expect((await operation).status).toBe(401);
    const next=await setup(),fresh=await store.requestContext(()=>({user:structuredClone(store.find('users',{id:next.actor.user.id})),session:structuredClone(store.find('sessions',{tokenHash:load('modules/auth/auth.service').hashToken(next.actor.token)}))}));
    const controller=new AbortController();controller.abort();const count=synthesis.mock.calls.length;await expect(teaching.narrate(fresh.user,next.row.id,fresh.session,command(next.view),controller.signal)).rejects.toThrow('项目朗读已停止');expect(synthesis.mock.calls.length).toBe(count);
  });
});

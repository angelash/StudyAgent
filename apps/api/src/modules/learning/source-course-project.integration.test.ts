import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { beforeAll,afterAll,describe,it,expect,vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve,sep } from 'node:path';
import { Pool } from 'pg';

describe('source-course projects, frozen objectives and original permissions',()=>{
  const directory=mkdtempSync(join(tmpdir(),'study-source-project-')),names=['NODE_ENV','DATABASE_URL','STUDY_STORAGE','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','XIAOJIU_CHAT_ENABLED','MINIMAX_API_KEY','OPENAI_API_KEY'] as const;
  const prior=Object.fromEntries(names.map(name=>[name,process.env[name]]));let app:any,store:any,owner:any,other:any,teacher:any,speech:any,pg:Pool|undefined,schema:string|undefined,address=0;
  const load=(name:string)=>require('../../../dist/apps/api/src/'+name+'.js');
  async function boot(){app=await NestFactory.create(load('app.module').AppModule,{logger:false});app.setGlobalPrefix('api');await app.init();store=app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);speech=app.get(load('modules/ai/speech.service').SpeechService);}
  async function call(method:'get'|'post'|'patch',path:string,body?:unknown,actor=owner,status=method==='post'?201:200){let query=request(app.getHttpServer())[method]('/api'+path);if(actor)query=query.set('Authorization','Bearer '+actor.token);if(path==='/auth/register')query=query.set('X-Forwarded-For','198.18.21.'+(++address));if(body!==undefined)query=query.send(body as object);const reply=await query;expect(reply.status,JSON.stringify(reply.body.error)).toBe(status);return reply.body.data;}
  const register=()=>call('post','/auth/register',{principal:'source-project-'+randomUUID()+'@local.test',credential:'Synthetic-source-project-'+randomUUID()},null);
  async function source(studentId:string|null=null){const id='source-project-course-'+randomUUID(),now=new Date().toISOString();await store.transaction(()=>store.append('sourceCourses',{
    id,ownerUserId:owner.user.id,studentId,subject:studentId?'math':null,status:'active',revision:1,fingerprint:'published-content-'+id,input:{title:'合成来源课程',goal:'用来源和新情境核查解释',language:'zh-CN',minutesPerSession:10,modelId:'auto',targetAtomIds:[]},
    sources:[{key:'source-1',materialId:'synthetic-material',page:1,title:'合成资料',kind:'text',text:'PRIVATE SOURCE BODY',blocks:[],sha256:'source-sha',version:'source-v1',fingerprint:'source-fingerprint',structureReviewRequired:false}],
    result:{title:'合成资料课程',overview:'公开导向',lessons:[{title:'条件与解释',objective:'区分观察、解释和需要核查的条件',questions:[{prompt:'PRIVATE QUESTION',answer:2,explanation:'PRIVATE KEY'}]}]},
    lessonIds:['source-lesson-'+id],createdAt:now,updatedAt:now,confirmedAt:now,requests:[],generation:{private:'PRIVATE GENERATION PAYLOAD'}}));return id;}
  const catalog=(id:string,actor=owner)=>call('get','/learning/projects/catalog?sourceCourseId='+id,undefined,actor);
  async function open(id:string,actor=owner){const list=await catalog(id,actor);return call('post','/learning/projects',{sourceCourseId:id,unitId:list.definitions[0].unitId},actor);}
  const ratings=(row:any)=>row.definition.rubric.map((criterion:any)=>({criterionId:criterion.id,level:1,evidence:'保留来源和自己的初步尝试。'}));
  beforeAll(async()=>{
    const location=process.env.STUDY_TEST_SOURCE_PROJECT_POSTGRES_URL;if(location){pg=new Pool({connectionString:location});expect((await pg.query('SELECT current_database() name')).rows[0].name).toBe('study_agent_qa');schema='study_qa_source_projects_'+randomUUID().replace(/-/g,'');await pg.query('CREATE SCHEMA "'+schema+'"');const url=new URL(location);url.searchParams.set('options','-c search_path='+schema);process.env.DATABASE_URL=url.toString();}
    Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:location?'postgres':'sqlite',STUDY_DATA_DIR:directory,STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'false',XIAOJIU_CHAT_ENABLED:'false',MINIMAX_API_KEY:'synthetic-never-sent',OPENAI_API_KEY:''});await boot();owner=await register();other=await register();teacher=await register();
  });
  afterAll(async()=>{await app?.close();vi.restoreAllMocks();if(pg){try{if(!/^study_qa_source_projects_[a-f0-9]{32}$/.test(schema??''))throw Error('Unsafe source project QA schema');await pg.query('DROP SCHEMA "'+schema+'" CASCADE');}finally{await pg.end();}}for(const[name,value]of Object.entries(prior)){if(value===undefined)delete process.env[name];else process.env[name]=value;}if(!resolve(directory).startsWith(resolve(tmpdir())+sep))throw Error('Unsafe source project QA root');rmSync(directory,{recursive:true,force:true});});
  it('reads a published definition without creating a project or exposing authoring and answer payloads',async()=>{
    const id=await source(),before=await store.requestContext(()=>store.inspect('courseProjects').length),list=await catalog(id);expect(list.definitions).toHaveLength(1);expect(list.projects).toEqual([]);expect(list.definitions[0].sourceCourse.objectives[0].title).toBe('条件与解释');expect(JSON.stringify(list)).not.toContain('PRIVATE');expect(await store.requestContext(()=>store.inspect('courseProjects').length)).toBe(before);
    await call('get','/learning/projects/catalog?sourceCourseId='+id,undefined,other,403);await call('get','/learning/projects/catalog?sourceCourseId='+id+'&studioCourseId=wrong',undefined,owner,400);
  });
  it('creates once on explicit opening, binds a recoverable original save and survives actual storage restart',async()=>{
    const id=await source();let row=await open(id);expect(row.sourceCourseId).toBe(id);expect((await open(id)).id).toBe(row.id);const command={stageId:'sources',expectedRevision:0,requestKey:randomUUID(),artifact:{values:{claim:'本人的主张',source:'合成来源第1段，有条件的解释'},evidence:[]}};
    row=await call('patch','/learning/projects/'+row.id,command);await app.close();await boot();const restored=await call('get','/learning/projects/'+row.id);expect(restored.drafts.sources).toEqual(command.artifact);expect((await call('get','/learning/projects/'+row.id+'/requests/'+command.requestKey)).appliedRevision).toBe(1);expect((await call('patch','/learning/projects/'+row.id,command)).revision).toBe(1);
  });
  it('keeps frozen project objectives while a new definition requires an explicit version choice',async()=>{
    const id=await source(),old=await open(id),snapshot=structuredClone(old.definition);await store.transaction(()=>{const course=store.find('sourceCourses',{id});course.result.lessons[0].objective='修改后的公开目标';course.fingerprint='published-content-v2';});
    expect((await call('get','/learning/projects/'+old.id)).definition).toEqual(snapshot);expect((await open(id)).id).toBe(old.id);const next=await call('post','/learning/projects',{sourceCourseId:id,unitId:old.definition.unitId,useCurrentVersion:true});expect(next.id).not.toBe(old.id);expect(next.definition.fingerprint).not.toBe(old.definition.fingerprint);
  });
  it('blocks creation for an unconfirmed or archived source while retaining readable frozen project history',async()=>{
    const id=await source(),row=await open(id);await store.transaction(()=>{store.find('sourceCourses',{id}).status='archived';});const old=await call('get','/learning/projects/'+row.id);expect(old.contentStatus).toBe('archived');expect(old.permissions.startCurrentVersion).toBe(false);expect((await catalog(id)).permissions.start).toBe(false);await call('post','/learning/projects',{sourceCourseId:id,unitId:row.definition.unitId},owner,409);
    const ready=await source();await store.transaction(()=>{store.find('sourceCourses',{id:ready}).status='ready';});expect((await catalog(ready)).definitions).toEqual([]);await call('post','/learning/projects',{sourceCourseId:ready,unitId:'source-project:'+ready},owner,409);
  });
  it('lets a real learning-code owner submit and an assigned teacher review only that frozen submission',async()=>{
    const studentId=(await call('post','/students',{nickname:'合成来源项目学习者',grade:5,preferredSessionMinutes:10,defaultVersionMap:{math:'',chinese:'',english:''}})).profile.id;
    const access=await call('post',`/students/${studentId}/learning-access`,{enabled:true,expectedVersion:0,requestKey:randomUUID(),reason:'合成来源项目权限测试'}),code=await call('post',`/students/${studentId}/learning-access/codes`,{expectedVersion:access.version,requestKey:randomUUID()}),learner=await call('post','/auth/learning-code',{code:code.code},null),id=await source(studentId);
    await store.transaction(()=>{store.find('users',{id:teacher.user.id}).role='teacher';store.append('teacherAssignments',{id:randomUUID(),studentId,teacherUserId:teacher.user.id,grantedBy:owner.user.id,permission:'scoring_review',status:'active',createdAt:new Date().toISOString(),revokedAt:null,revokedBy:null});});
    let row=await open(id,learner);row=await call('post','/learning/projects/'+row.id+'/submissions',{expectedRevision:0,requestKey:randomUUID(),stageId:'sources',artifact:{values:{claim:'匿名情境中的初步解释',source:'合成来源第1段，有支持也有局限'},evidence:[]},selfRatings:ratings(row),revisionNote:''},learner);
    const frozen=structuredClone(row.submissions);await call('patch','/learning/projects/'+row.id,{expectedRevision:row.revision,requestKey:randomUUID(),stageId:'sources',artifact:row.drafts.sources},teacher,403);
    row=await call('post','/learning/projects/'+row.id+'/reviews',{expectedRevision:row.revision,requestKey:randomUUID(),submissionId:row.submissions[0].id,ratings:ratings(row),comment:'来源对应仍需补充反例。',decision:'needs_revision'},teacher);expect(row.submissions).toEqual(frozen);expect(row.reviews[0].reviewerRole).toBe('teacher');
    await store.transaction(()=>{store.find('teacherAssignments',{teacherUserId:teacher.user.id}).status='revoked';});await call('get','/learning/projects/'+row.id,undefined,teacher,403);expect((await call('get','/learning/projects/'+row.id,undefined,learner)).submissions).toEqual(frozen);
  });
  it('refuses late narration when a shared source becomes private, without changing the frozen project',async()=>{
    const studentId=(await call('post','/students',{nickname:'合成撤回核查',grade:4,preferredSessionMinutes:10,defaultVersionMap:{math:'',chinese:'',english:''}})).profile.id;
    const access=await call('post',`/students/${studentId}/learning-access`,{enabled:true,expectedVersion:0,requestKey:randomUUID(),reason:'合成延迟朗读测试'}),code=await call('post',`/students/${studentId}/learning-access/codes`,{expectedVersion:access.version,requestKey:randomUUID()}),learner=await call('post','/auth/learning-code',{code:code.code},null),id=await source(studentId),row=await open(id,learner),view=await call('get','/learning/projects/'+row.id+'/teaching',undefined,learner),step=view.stages[0].steps[0];
    let release!:(value:unknown)=>void,arrive!:()=>void;const arrival=new Promise<void>(resolve=>arrive=resolve);const spy=vi.spyOn(speech,'synthesize').mockImplementationOnce(()=>{arrive();return new Promise(resolve=>release=resolve);});
    const pending=call('post','/learning/projects/'+row.id+'/narration',{version:view.version,definitionFingerprint:view.definitionFingerprint,stageId:'sources',stepId:'intro',sentenceIndex:0,unitId:step.speech.units[0].id},learner,403);await arrival;await store.transaction(()=>{store.find('sourceCourses',{id}).status='ready';});release({content:Buffer.from('late synthetic audio'),contentType:'audio/mpeg',provider:'minimax'});await pending;spy.mockRestore();
    expect(await store.requestContext(()=>store.find('courseProjects',{id:row.id}).revision)).toBe(0);
  });
});

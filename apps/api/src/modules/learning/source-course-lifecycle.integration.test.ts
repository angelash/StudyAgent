import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { beforeAll,afterAll,afterEach,describe,it,expect,vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

describe('source-course revisions, impact previews and frozen historical learning',()=>{
  const directory=mkdtempSync(join(tmpdir(),'study-course-lifecycle-')),names=['NODE_ENV','DATABASE_URL','STUDY_STORAGE','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','XIAOJIU_CHAT_ENABLED']as const,prior=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  let app:any,store:any,worker:any,provider:any,parent:any,other:any,pg:Pool|undefined,schema:string|undefined;
  const base='/learning/source-courses',credential='Course-lifecycle-QA-only';
  async function call(method:'get'|'post'|'patch',path:string,body?:unknown,actor=parent,status=method==='post'?201:200){let query=request(app.getHttpServer())[method]('/api'+path);if(actor)query=query.set('Authorization','Bearer '+actor.token);if(body!==undefined)query=query.send(body as object);return(await query.expect(status)).body.data;}
  async function boot(){const{AppModule}=require('../../../dist/apps/api/src/app.module.js');app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api');await app.init();store=app.get(require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js').InMemoryStoreService);worker=app.get(require('../../../dist/apps/api/src/modules/learning/source-course-worker.service.js').SourceCourseWorkerService);provider=app.get(require('../../../dist/apps/api/src/modules/ai/xiaojiu-chat.service.js').XiaojiuChatService);}
  beforeAll(async()=>{let backend='sqlite';const url=process.env.STUDY_TEST_SOURCE_LIFECYCLE_POSTGRES_URL;if(url){pg=new Pool({connectionString:url});expect((await pg.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa');schema='study_qa_lifecycle_'+randomUUID().replace(/-/g,'');await pg.query('CREATE SCHEMA "'+schema+'"');const scoped=new URL(url);scoped.searchParams.set('options','-c search_path='+schema);process.env.DATABASE_URL=scoped.toString();backend='postgres';}Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:backend,STUDY_DATA_DIR:directory,STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'false',XIAOJIU_CHAT_ENABLED:'false'});await boot();parent=await call('post','/auth/register',{principal:'lifecycle-parent@test',credential},null);other=await call('post','/auth/register',{principal:'lifecycle-other@test',credential},null);});
  afterEach(()=>vi.restoreAllMocks());
  afterAll(async()=>{await app?.close();if(pg){if(!/^study_qa_lifecycle_[a-f0-9]{32}$/.test(schema??''))throw new Error('Invalid owned lifecycle schema');await pg.query('DROP SCHEMA "'+schema+'" CASCADE');await pg.end();}for(const[name,value]of Object.entries(prior)){if(value===undefined)delete process.env[name];else process.env[name]=value;}rmSync(directory,{recursive:true,force:true});});
  const read=(id:string)=>call('get',base+'/'+id);
  async function course(long=false,studentId?:string){const source=await call('post',base+'/materials/text',{title:'匿名时段观察',sections:['匿名阅览室观察：周末排队，工作日有空位；尚未观察晚间，也不知道当天是否有活动。只记录人数和开放时段，不记录姓名。'],...(studentId?{studentId,subject:'math'}:{}),requestKey:randomUUID()});
    const input={title:'理解观察的边界',goal:'区分观察和推断，用相同条件验证解释。',language:'zh-CN',minutesPerSession:15,modelId:'deepseek-v4-flash',selections:[{materialId:source.material.id,version:source.version,pages:[1]}],...(studentId?{studentId,subject:'math'}:{})};
    const preflight=long?await call('post',base+'/preflight',input):null,row=await call('post',base,{...input,...(long?{mode:'long',previewFingerprint:preflight.fingerprint}:{}),requestKey:randomUUID()});
    const fixture=require('../../../../../scripts/qa/source-course-fixture.cjs'),mock=vi.spyOn(provider,'structured').mockImplementation(async(input:any,_schema:any,check:any)=>({...check((long?fixture.sourceCourseLongFixture:fixture.sourceCoursePipelineFixture)(JSON.parse(input.context),input.message)),modelId:input.modelId,modelName:'Synthetic lifecycle fixture'}));
    await worker.runNext();mock.mockRestore();const ready=await read(row.id);expect(ready.status).toBe('ready');return{source,row:await call('post',base+'/'+row.id+'/confirm',{expectedRevision:ready.revision,fingerprint:ready.fingerprint,requestKey:randomUUID()})};
  }
  const forkCommand=(row:any)=>({requestKey:randomUUID(),expectedRevision:row.revision,fingerprint:row.fingerprint});
  const revise=(row:any,command=forkCommand(row))=>call('post',base+'/'+row.id+'/revisions',command);
  async function preview(row:any,action:string){return call('post',base+'/'+row.id+'/lifecycle/preview',{action});}
  const applyCommand=(value:any,reason='修正课程内容，保留旧版本学习记录')=>({action:value.action,expectedRevision:value.expectedRevision,fingerprint:value.fingerprint,impactFingerprint:value.impactFingerprint,reason,requestKey:randomUUID()});
  const apply=(row:any,command:any)=>call('post',base+'/'+row.id+'/lifecycle',command);

  it('copies a short published course once without another model task and replays before new source checks',async()=>{
    const{row,source}=await course(),command=forkCommand(row),mock=vi.spyOn(provider,'structured').mockRejectedValue(new Error('No model is allowed'));
    const candidate=await revise(row,command);expect(candidate.id).not.toBe(row.id);expect(candidate.status).toBe('ready');expect(candidate.task).toBeNull();expect(candidate.versioning).toMatchObject({familyId:row.id,parentCourseId:row.id,number:2,state:'draft'});
    expect(candidate.lessons.map((lesson:any)=>lesson.id)).toEqual(row.lessons.map((lesson:any)=>lesson.id));expect((await read(row.id)).status).toBe('active');expect(await worker.runNext()).toBe(false);expect(mock).not.toHaveBeenCalled();
    await store.transaction(()=>{store.find('studioSourceMaterials',{id:source.material.id}).pages[0].text+='已变化';});expect((await revise(row,command)).id).toBe(candidate.id);
    await call('post',base+'/'+row.id+'/revisions',{...command,fingerprint:'f'.repeat(64)},parent,409);
  });
  it('publishes a reviewed revision atomically and preserves the exact old lesson, answers and original line',async()=>{
    const{row}=await course(),old=await call('post','/learning/classroom/sessions',{sourceCourseId:row.id,lessonId:row.lessons[0].id});
    const positioned=await call('patch','/learning/classroom/sessions/'+old.id,{expectedRevision:old.revision,cursor:1,revealed:2,sentenceCursor:0,presentationVersion:old.presentation.version,unitId:old.presentation.tracks[old.lesson.steps[1].id].units[0].id,projectDraft:'保留原课堂草稿'});
    await call('post','/learning/classroom/sessions/'+old.id+'/answers',{questionId:old.lesson.questions[0].id,selectedIndex:0,requestKey:randomUUID()});
    const before=await call('get','/learning/classroom/sessions/'+old.id),draft=await revise(row),author=await call('post',base+'/'+draft.id+'/authoring',{}),content=structuredClone(author.content);content.lessons[0].concept='修订后的讲解。'+content.lessons[0].concept;
    const edited=await call('patch',base+'/'+draft.id+'/content',{content,expectedRevision:draft.revision,requestKey:randomUUID()});
    await call('post',base+'/'+draft.id+'/confirm',{expectedRevision:edited.revision,fingerprint:edited.fingerprint,requestKey:randomUUID()},parent,409);
    const impact=await preview(edited,'publish');expect(impact.existing.sessions).toBe(1);expect(impact.existing.answeredQuestions).toBe(1);expect(impact.changes).toHaveLength(2);
    const command=applyCommand(impact),published=await apply(edited,command);expect(published.status).toBe('active');expect((await read(row.id)).status).toBe('archived');expect((await apply(edited,command)).revision).toBe(published.revision);
    const after=await call('get','/learning/classroom/sessions/'+old.id);for(const field of ['lesson','presentation','cursor','sentenceCursor','answers','projectDraft'])expect(after[field]).toEqual(before[field]);
    expect(after.sentenceCursor).toBe(positioned.sentenceCursor);const fresh=await call('post','/learning/classroom/sessions',{sourceCourseId:draft.id,lessonId:draft.lessons[0].id});expect(fresh.id).not.toBe(old.id);expect(fresh.answers).toHaveLength(0);expect(fresh.lesson.steps[1].narration).toContain('修订后的讲解');
  });
  it('invalidates impact previews after a competing family change and requires a replacement reason',async()=>{
    const{row}=await course(),first=await revise(row),second=await revise(await read(row.id)),a=await preview(first,'publish'),b=await preview(second,'publish');
    await call('post',base+'/'+first.id+'/lifecycle',applyCommand(a,''),parent,400);
    await apply(first,applyCommand(a));await call('post',base+'/'+second.id+'/lifecycle',applyCommand(b),parent,409);
    expect((await read(second.id)).status).toBe('ready');expect((await preview(second,'publish')).changes[0].courseId).toBe(first.id);
  });
  it('retains withdrawal reasons and can explicitly restore an older version while archiving its replacement',async()=>{
    const{row}=await course(),draft=await revise(row);await apply(draft,applyCommand(await preview(draft,'publish')));
    const old=await read(row.id),restored=await apply(old,applyCommand(await preview(old,'restore'),'选择旧版重新使用'));
    expect(restored.status).toBe('active');expect((await read(draft.id)).status).toBe('archived');
    const withdrawn=await apply(restored,applyCommand(await preview(restored,'withdraw'),'例子还需进一步核查'));expect(withdrawn.versioning.state).toBe('withdrawn');expect(withdrawn.versioning.events.at(-1).reason).toBe('例子还需进一步核查');
    const next=await revise(withdrawn);expect((await read(row.id)).versioning.state).toBe('withdrawn');expect(next.versioning.number).toBe(3);
    await call('post','/learning/classroom/sessions',{sourceCourseId:row.id,lessonId:row.lessons[0].id},parent,409);
  });
  it('copies actual long-course stages with new identities and can edit the original-backed lesson after reopen',async()=>{
    const{row}=await course(true),draft=await revise(row);expect(draft.compilation).toBeDefined();expect(draft.task).toBeNull();
    await store.requestContext(()=>{const original=store.select('sourceCourseStages',{courseId:row.id}),copied=store.select('sourceCourseStages',{courseId:draft.id});expect(copied).toHaveLength(original.length);expect(copied.every((part:any)=>part.copiedFrom?.courseId===row.id&&original.some((source:any)=>source.id===part.copiedFrom.stageId&&source.id!==part.id&&source.outputFingerprint===part.outputFingerprint))).toBe(true);});
    await app.close();await boot();const reopened=await read(draft.id),author=await call('post',base+'/'+draft.id+'/lessons/'+draft.lessons[0].id+'/authoring',{});expect(author.originalContent.lessons).toHaveLength(1);
    const edited=await call('patch',base+'/'+draft.id+'/lessons/'+draft.lessons[0].id+'/content',{expectedRevision:reopened.revision,requestKey:randomUUID(),title:author.content.title,overview:author.content.overview,content:{...author.content.lessons[0],concept:'新版本核查说明。'+author.content.lessons[0].concept}});
    const published=await apply(edited,applyCommand(await preview(edited,'publish')));expect(published.status).toBe('active');expect(published.compilation.reviewCurrent).toBe(false);
  });
  it('refuses corrupt original stages without leaving a partial draft or family event',async()=>{
    const{row}=await course(true);await store.transaction(()=>{const stage=store.select('sourceCourseStages',{courseId:row.id}).find((part:any)=>part.kind==='draft');stage.payload={changed:'unknown original'};});
    const before=await call('get',base);await call('post',base+'/'+row.id+'/revisions',forkCommand(row),parent,409);expect(await call('get',base)).toHaveLength(before.length);expect((await read(row.id)).versioning).toBeUndefined();
  });
  it('blocks restore after changed sources and refuses another account before revealing a family',async()=>{
    const{row,source}=await course(),archived=await apply(row,applyCommand(await preview(row,'archive')));await store.transaction(()=>{store.find('studioSourceMaterials',{id:source.material.id}).pages[0].text+='新材料';});
    await call('post',base+'/'+row.id+'/lifecycle/preview',{action:'restore'},parent,409);expect((await read(row.id)).status).toBe('archived');
    for(const path of ['/versions','/lifecycle/preview','/revisions'])await call(path==='/versions'?'get':'post',base+'/'+row.id+path,path==='/versions'?undefined:path==='/revisions'?forkCommand(archived):{action:'restore'},other,403);
  });
  it('hides discarded unpublished revisions from an actual learner and removes their relations on actual child deletion',async()=>{
    const studentId=(await call('post','/students',{nickname:'版本授权验证',grade:4,preferredSessionMinutes:15,defaultVersionMap:{math:'',chinese:'',english:''}})).profile.id;
    const access=await call('post',`/students/${studentId}/learning-access`,{enabled:true,expectedVersion:0,requestKey:randomUUID(),reason:'验证课程版本'}),code=await call('post',`/students/${studentId}/learning-access/codes`,{expectedVersion:access.version,requestKey:randomUUID()}),learner=await call('post','/auth/learning-code',{code:code.code},null);
    const{row}=await course(true,studentId),draft=await revise(row),discarded=await apply(draft,applyCommand(await preview(draft,'discard')));expect(discarded.versioning.state).toBe('discarded');
    await call('get',base+'/'+draft.id,undefined,learner,403);const list=await call('get',base+'?studentId='+studentId+'&subject=math',undefined,learner);expect(list.some((item:any)=>item.id===draft.id)).toBe(false);
    const versions=await call('get',base+'/'+row.id+'/versions',undefined,learner);expect(versions.map((item:any)=>item.id)).toEqual([row.id]);
    await call('post',base+'/'+row.id+'/revisions',forkCommand(await read(row.id)),learner,403);
    const deletion=await call('get',`/privacy/students/${studentId}/deletion-preview`);await call('post',`/privacy/students/${studentId}/delete`,{credential,confirmation:deletion.confirmation,fingerprint:deletion.fingerprint,requestKey:randomUUID()});
    await store.requestContext(()=>{expect(store.find('sourceCourses',{id:draft.id})).toBeUndefined();expect(store.select('sourceCourseStages',{courseId:draft.id})).toHaveLength(0);});
  });
  it('serializes duplicate revision creation and competing publication without two current versions',async()=>{
    const{row}=await course(),command=forkCommand(row),submitted=await Promise.all([1,2].map(()=>request(app.getHttpServer()).post('/api'+base+'/'+row.id+'/revisions').set('Authorization','Bearer '+parent.token).send(command)));
    expect(submitted.every(response=>[201,409].includes(response.status))).toBe(true);const first=await revise(row,command),second=await revise(await read(row.id));
    expect((await call('get',base+'/'+row.id+'/versions')).filter((value:any)=>value.parentCourseId===row.id)).toHaveLength(2);
    const a=applyCommand(await preview(first,'publish')),b=applyCommand(await preview(second,'publish')),results=await Promise.all([[first,a],[second,b]].map(([value,input])=>request(app.getHttpServer()).post('/api'+base+'/'+value.id+'/lifecycle').set('Authorization','Bearer '+parent.token).send(input)));
    expect(results.map(response=>response.status).sort()).toEqual([201,409]);const versions=await call('get',base+'/'+row.id+'/versions');expect(versions.filter((value:any)=>value.status==='active')).toHaveLength(1);expect(versions.filter((value:any)=>value.status==='ready')).toHaveLength(1);
  });
  it.skipIf(Boolean(process.env.STUDY_TEST_SOURCE_LIFECYCLE_POSTGRES_URL))('cold restores an actual long-course revision, original-backed editing and lifecycle receipts',async()=>{
    const{row}=await course(true),draft=await revise(row),recovery=mkdtempSync(join(tmpdir(),'study-lifecycle-backup-')),previousParent=parent;
    try{const backup=require('../../../../../scripts/operations/backup.cjs');await backup.createBundle({dataDir:directory,destination:join(recovery,'bundle')});expect((await backup.verifyBundle({bundle:join(recovery,'bundle')})).verifiedFiles).toBe(1);await app.close();await backup.restoreBundle({bundle:join(recovery,'bundle'),destination:join(recovery,'restored')});process.env.STUDY_DATA_DIR=join(recovery,'restored');await boot();parent=await call('post','/auth/login',{principal:previousParent.user.principal,credential},null);
      const restored=await read(draft.id);expect(restored.versioning).toEqual(draft.versioning);expect(restored.task).toBeNull();const original=await call('post',base+'/'+draft.id+'/lessons/'+draft.lessons[0].id+'/authoring',{});expect(original.originalContent.lessons[0].concept).toBeTruthy();
      const published=await apply(restored,applyCommand(await preview(restored,'publish')));expect(published.status).toBe('active');expect((await read(row.id)).status).toBe('archived');
    }finally{await app.close();process.env.STUDY_DATA_DIR=directory;await boot();parent=previousParent;rmSync(recovery,{recursive:true,force:true});}
    expect((await read(row.id)).status).toBe('active');expect((await read(draft.id)).status).toBe('ready');
  });
  it('keeps a shared published version while actually erasing its creator private discarded drafts and stage payloads',async()=>{
    const studentId=(await call('post','/students',{nickname:'共享版本隐私验证',grade:4,preferredSessionMinutes:15,defaultVersionMap:{math:'',chinese:'',english:''}})).profile.id;
    await store.transaction(()=>store.append('bindings',{id:randomUUID(),parentUserId:other.user.id,studentId,relation:'guardian',status:'active'}));
    const{row}=await course(true,studentId),draft=await revise(row);await apply(draft,applyCommand(await preview(draft,'discard')));
    const visible=await call('get',base+'/'+row.id,undefined,other);expect(JSON.stringify(visible.versioning)).not.toContain(draft.id);
    await store.requestContext(()=>{const {portableRecords,studentRecords}=require('../../../dist/apps/api/src/modules/privacy/privacy-records.js'),exported=portableRecords(studentRecords(store,studentId),other.user.id);expect(exported.sourceCourses.map((course:any)=>course.id)).toEqual([row.id]);expect(exported.sourceCourseStages.every((stage:any)=>stage.courseId===row.id)).toBe(true);expect(JSON.stringify(exported.sourceCourses)).not.toContain(draft.id);});
    const recovery=process.env.STUDY_TEST_SOURCE_LIFECYCLE_POSTGRES_URL?null:mkdtempSync(join(tmpdir(),'study-lifecycle-deletion-')),backup=require('../../../../../scripts/operations/backup.cjs');
    if(recovery)await backup.createBundle({dataDir:directory,destination:join(recovery,'bundle')});
    const deletion=await call('get','/privacy/account/deletion-preview');expect(deletion.retainedChildren.some((child:any)=>child.id===studentId)).toBe(true);
    await call('post','/privacy/account/delete',{credential,confirmation:deletion.confirmation,fingerprint:deletion.fingerprint,requestKey:randomUUID()});
    const retained=await call('get',base+'/'+row.id,undefined,other);expect(retained.status).toBe('active');expect(retained.permissions.manage).toBe(false);
    await store.requestContext(()=>{expect(store.find('sourceCourses',{id:draft.id})).toBeUndefined();expect(store.select('sourceCourseStages',{courseId:draft.id})).toHaveLength(0);expect(store.select('sourceCourseStages',{courseId:row.id}).length).toBeGreaterThan(0);});
    if(recovery)try{const ledger=join(recovery,'latest-deletions.json');await require('../../../../../scripts/operations/privacy-ledger.cjs').exportLedger({dataDir:directory,destination:ledger});await app.close();await backup.restoreBundle({bundle:join(recovery,'bundle'),destination:join(recovery,'restored'),deletionLedger:ledger});process.env.STUDY_DATA_DIR=join(recovery,'restored');await boot();const retainedActor=await call('post','/auth/login',{principal:other.user.principal,credential},null);expect((await call('get',base+'/'+row.id,undefined,retainedActor)).status).toBe('active');
      await store.requestContext(()=>{expect(store.find('sourceCourses',{id:draft.id})).toBeUndefined();expect(store.select('sourceCourseStages',{courseId:draft.id})).toHaveLength(0);});
    }finally{await app.close();process.env.STUDY_DATA_DIR=directory;await boot();rmSync(recovery,{recursive:true,force:true});}

  });
});

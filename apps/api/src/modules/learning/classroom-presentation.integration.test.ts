import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { beforeAll,afterAll,afterEach,describe,it,expect,vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { classroomSentences } from '@study-agent/contracts';

describe('frozen bilingual captions, explicit historical upgrade and authorized narration',()=>{
  const directory=mkdtempSync(join(tmpdir(),'study-captions-')),names=['NODE_ENV','STUDY_STORAGE','DATABASE_URL','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','XIAOJIU_CHAT_ENABLED']as const;
  const prior=Object.fromEntries(names.map(name=>[name,process.env[name]]));let app:any,store:any,speech:any,parent:any,other:any,pg:Pool|undefined,schema:string|undefined;
  const base=(id:string)=>'/learning/classroom/sessions/'+id;
  async function call(method:'get'|'post'|'patch',path:string,body?:unknown,actor=parent,status=method==='post'?201:200){let query=request(app.getHttpServer())[method]('/api'+path);if(actor)query=query.set('Authorization','Bearer '+actor.token);if(body!==undefined)query=query.send(body as object);return(await query.expect(status)).body.data;}
  async function boot(){const{AppModule}=require('../../../dist/apps/api/src/app.module.js'),{InMemoryStoreService}=require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js'),{SpeechService}=require('../../../dist/apps/api/src/modules/ai/speech.service.js');app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api');await app.init();store=app.get(InMemoryStoreService);speech=app.get(SpeechService);}
  beforeAll(async()=>{let backend='sqlite';const url=process.env.STUDY_TEST_CLASSROOM_PRESENTATION_POSTGRES_URL;if(url){pg=new Pool({connectionString:url});expect((await pg.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa');schema='study_qa_captions_'+randomUUID().replace(/-/g,'');await pg.query('CREATE SCHEMA "'+schema+'"');const scoped=new URL(url);scoped.searchParams.set('options','-c search_path='+schema);process.env.DATABASE_URL=scoped.toString();backend='postgres';}Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:backend,STUDY_DATA_DIR:directory,STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'false',XIAOJIU_CHAT_ENABLED:'false'});await boot();parent=await call('post','/auth/register',{principal:'captions-parent@local.test',credential:'Captions-QA-only-20261024'},null);other=await call('post','/auth/register',{principal:'captions-other@local.test',credential:'Captions-QA-only-20261024'},null);});
  afterEach(()=>vi.restoreAllMocks());
  afterAll(async()=>{await app?.close();if(pg){if(schema){if(!/^study_qa_captions_[a-f0-9]{32}$/.test(schema))throw new Error('Invalid owned QA schema');await pg.query('DROP SCHEMA "'+schema+'" CASCADE');}await pg.end();}for(const[name,value]of Object.entries(prior)){if(value===undefined)delete process.env[name];else process.env[name]=value;}rmSync(directory,{recursive:true,force:true});});
  const text='Dr. Lee measured 3.14 cm. Next, compare 1/2 and 50%. Finally, retain a counterexample.';
  async function fixture(legacy=false,narration=text){
    const row=await call('post','/learning/classroom/sessions',{lessonId:'soc-5-1-1',useCurrentVersion:true});
    // An authored QA snapshot, never a mutation of shared curriculum or production family records.
    await store.transaction(()=>{const saved=store.find('classroomSessions',{id:row.id}),{freezeClassroomPresentation}=require('../../../dist/apps/api/src/modules/learning/classroom-presentation.js'),{classroomFingerprint}=require('../../../dist/apps/api/src/modules/learning/classroom-curriculum.js');saved.lesson.steps[0].narration=narration;saved.lesson.steps[0].blocks=[{id:'qa-table',kind:'table',text:'匿名观察',table:{headers:['时段','人数'],rows:[['上午','3'],['下午','5'],['复查','4']]}}];saved.contentFingerprint=classroomFingerprint(saved.lesson);if(legacy)delete saved.presentation;else saved.presentation=freezeClassroomPresentation(saved.lesson,saved.createdAt);});
    return call('get',base(row.id));
  }
  function position(row:any,index=0,cursor=0){return{expectedRevision:row.revision,cursor,revealed:Math.max(row.revealed,cursor+1),sentenceCursor:index,presentationVersion:row.presentation.version,unitId:row.presentation.tracks[row.lesson.steps[cursor].id].units[index]?.id};}
  function upgrade(row:any){return{expectedRevision:row.revision,expectedVersion:'legacy-v1',requestKey:randomUUID()};}
  function audio(){return vi.spyOn(speech,'synthesize').mockResolvedValue({content:Buffer.alloc(44),contentType:'audio/wav',provider:'minimax'});}

  it('freezes complete English units, rejects unbound new requests and synthesizes exactly the requested unit',async()=>{
    const row=await fixture(),step=row.lesson.steps[0],track=row.presentation.tracks[step.id],mock=audio();expect(track.units.map((unit:any)=>unit.text)).toEqual(['Dr. Lee measured 3.14 cm.','Next, compare 1/2 and 50%.','Finally, retain a counterexample.']);
    await call('post',base(row.id)+'/narration/'+step.id,{sentenceIndex:1},parent,409);await call('post',base(row.id)+'/narration/'+step.id,{sentenceIndex:99},parent,400);
    await call('patch',base(row.id),{expectedRevision:0,cursor:0,revealed:1,sentenceCursor:1},parent,409);expect((await call('get',base(row.id))).revision).toBe(0);
    await request(app.getHttpServer()).post('/api'+base(row.id)+'/narration/'+step.id).set('Authorization','Bearer '+parent.token).send({sentenceIndex:1,presentationVersion:'speech-v2',unitId:track.units[1].id}).expect(201);expect(mock).toHaveBeenCalledWith(track.units[1].text,undefined,expect.any(AbortSignal));expect(mock).toHaveBeenCalledTimes(1);
    const saved=await call('patch',base(row.id),position(row,1));expect(saved.sentenceCursor).toBe(1);await call('get',base(row.id),undefined,other,403);
  });
  it('projects the exact old rule without persisting a silent migration and keeps legacy narration usable',async()=>{
    const row=await fixture(true),step=row.lesson.steps[0],mock=audio();expect(row.presentation.version).toBe('legacy-v1');expect(row.presentation.tracks[step.id].units.map((unit:any)=>unit.text)).toEqual(classroomSentences(text));
    await request(app.getHttpServer()).post('/api'+base(row.id)+'/narration/'+step.id).set('Authorization','Bearer '+parent.token).send({sentenceIndex:0}).expect(201);expect(mock.mock.calls[0][0]).toBe(classroomSentences(text)[0]);
    await store.requestContext(()=>{expect(store.find('classroomSessions',{id:row.id}).presentation).toBeUndefined();});
  });
  it('upgrades from the saved source range, retains hints/answers/reading facts and stores the exact prior snapshot',async()=>{
    const narration='An older explanation uses several clauses with careful observations, then compares another observation and keeps the original counterexample. A final sentence follows.',row=await fixture(true,narration),oldUnits=row.presentation.tracks[row.lesson.steps[0].id].units;expect(oldUnits.length).toBeGreaterThan(1);
    let saved=await call('patch',base(row.id),{expectedRevision:0,cursor:0,revealed:1,sentenceCursor:1});saved=await call('post',base(row.id)+'/hints',{questionId:row.lesson.questions[0].id,level:1,requestKey:randomUUID()});saved=await call('post',base(row.id)+'/answers',{questionId:row.lesson.questions[0].id,selectedIndex:0,requestKey:randomUUID()});
    const before=structuredClone(saved),mock=audio(),result=await call('post',base(row.id)+'/presentation',upgrade(saved));expect(mock).not.toHaveBeenCalled();expect(result.presentation.version).toBe('speech-v2');expect(result.cursor).toBe(before.cursor);expect(result.revealed).toBe(before.revealed);expect(result.answers).toEqual(before.answers);expect(result.hintReceipts).toEqual(before.hintReceipts);expect(result.lesson).toEqual(before.lesson);expect(result.contentFingerprint).toBe(before.contentFingerprint);expect(result.status).toBe(before.status);
    expect(result.presentationRevisions).toHaveLength(1);expect(result.presentationRevisions[0].previous).toEqual(before.presentation);const unit=result.presentation.tracks[row.lesson.steps[0].id].units[result.sentenceCursor],old=oldUnits[1],first=old.start+old.text.length-old.text.trimStart().length;expect(unit.start).toBeLessThanOrEqual(first);expect(unit.end).toBeGreaterThan(first);
    await store.requestContext(()=>{expect(store.inspect('diagnosticResponses')).toHaveLength(0);expect(store.inspect('diagnosticPlans')).toHaveLength(0);});
  });
  it('replays a lost upgrade acknowledgement without resetting later progress and refuses changed or stale commands',async()=>{
    const row=await fixture(true),command=upgrade(row),changed=await call('post',base(row.id)+'/presentation',command),progress=await call('patch',base(row.id),position(changed,1));
    const replay=await call('post',base(row.id)+'/presentation',command);expect(replay.revision).toBe(progress.revision);expect(replay.sentenceCursor).toBe(1);expect(replay.presentationRevisions).toHaveLength(1);
    await call('post',base(row.id)+'/presentation',{...command,expectedRevision:99},parent,409);await call('post',base(row.id)+'/presentation',{...command,requestKey:randomUUID()},parent,409);await call('post',base(row.id)+'/presentation',{...command,units:['arbitrary replacement']},parent,400);
    await call('post',base(row.id)+'/narration/'+row.lesson.steps[0].id,{sentenceIndex:0,presentationVersion:'legacy-v1',unitId:row.presentation.tracks[row.lesson.steps[0].id].units[0].id},parent,409);
  });
  it('allows only one concurrent upgrade of a historical session',async()=>{
    const row=await fixture(true),responses=await Promise.all([1,2].map(()=>request(app.getHttpServer()).post('/api'+base(row.id)+'/presentation').set('Authorization','Bearer '+parent.token).send(upgrade(row))));expect(responses.map(response=>response.status).sort()).toEqual([201,409]);expect((await call('get',base(row.id))).presentationRevisions).toHaveLength(1);
  });
  it('rechecks real child authorization before reading, upgrading or obtaining narration',async()=>{
    const row=await fixture(true),studentId=(await call('post','/students',{nickname:'字幕验证',grade:4,preferredSessionMinutes:15,defaultVersionMap:{math:'',chinese:'',english:''}})).profile.id,mock=audio();await store.transaction(()=>{store.find('classroomSessions',{id:row.id}).studentId=studentId;store.find('bindings',{studentId,parentUserId:parent.user.id}).status='revoked';});
    await call('get',base(row.id),undefined,parent,403);await call('post',base(row.id)+'/presentation',upgrade(row),parent,403);await call('post',base(row.id)+'/narration/'+row.lesson.steps[0].id,{sentenceIndex:0},parent,403);expect(mock).not.toHaveBeenCalled();
  });
  it('lets an actual learner use only their own caption and image routes through the student allowlist',async()=>{
    const row=await fixture(true),studentId=(await call('post','/students',{nickname:'学生字幕入口',grade:4,preferredSessionMinutes:15,defaultVersionMap:{math:'',chinese:'',english:''}})).profile.id;
    const access=await call('post',`/students/${studentId}/learning-access`,{enabled:true,expectedVersion:0,requestKey:randomUUID(),reason:'验证学生字幕与配图入口'}),code=await call('post',`/students/${studentId}/learning-access/codes`,{expectedVersion:access.version,requestKey:randomUUID()}),learner=await call('post','/auth/learning-code',{code:code.code},null);
    await store.transaction(()=>{const saved=store.find('classroomSessions',{id:row.id});saved.ownerUserId=learner.user.id;saved.studentId=studentId;});let saved=await call('get',base(row.id),undefined,learner);saved=await call('post',base(row.id)+'/presentation',upgrade(saved),learner);saved=await call('patch',base(row.id),position(saved),learner);
    const{ClassroomImageService}=require('../../../dist/apps/api/src/modules/ai/classroom-image.service.js');vi.spyOn(app.get(ClassroomImageService),'capabilities').mockResolvedValue({available:true,modelId:'gpt-image-2',reason:'ready',message:'Anonymous fixture only'});expect((await call('get',base(row.id)+'/visuals',undefined,learner)).visuals).toEqual([]);
    const visual=await call('post',base(row.id)+'/visuals',{stepId:saved.lesson.steps[0].id,contentFingerprint:saved.contentFingerprint,purpose:'scene',requirements:'匿名课堂情境',requestKey:randomUUID()},learner);expect(visual.status).toBe('queued');await call('get',base(row.id)+'/visuals/'+visual.id+'/file',undefined,learner,404);await call('post',base(row.id)+'/visuals/'+visual.id+'/cancel',{expectedRevision:visual.revision,expectedTaskVersion:visual.task.version,expectedGeneration:visual.task.generation,requestKey:randomUUID()},learner);
    await call('get',base(row.id),undefined,parent,403);await call('post',base(row.id)+'/visuals/'+visual.id+'/publish',{},learner,403);await call('post',base(row.id)+'/presentation',upgrade(saved),other,403);
  });
  it('freezes new replies independently and retains old reply rhythm after a classroom upgrade',async()=>{
    const row=await fixture(true),oldId='old-reply-'+randomUUID();await store.transaction(()=>{store.find('classroomSessions',{id:row.id}).messages.push({id:oldId,role:'assistant',content:'An older reply. Its original line stays intact.',at:new Date().toISOString()});});let saved=await call('post',base(row.id)+'/presentation',upgrade(row));expect(saved.messages[0].speech.version).toBe('legacy-v1');
    const{XiaojiuChatService}=require('../../../dist/apps/api/src/modules/ai/xiaojiu-chat.service.js');vi.spyOn(app.get(XiaojiuChatService),'reply').mockResolvedValue({reply:'Dr. Lee checks the evidence. Keep 3.14 intact. Compare another observation.',modelName:'Anonymous fixture',board:{title:'检查证据',points:['比较条件'],diagram:null}});
    saved=await call('post',base(row.id)+'/messages',{message:'请换一个解释方式。',requestKey:randomUUID()});const message=saved.messages.at(-1);expect(message.speech.version).toBe('speech-v2');expect(message.speech.units).toHaveLength(3);const mock=audio();await request(app.getHttpServer()).post('/api'+base(row.id)+'/narration/'+message.id).set('Authorization','Bearer '+parent.token).send({sentenceIndex:1,presentationVersion:'speech-v2',unitId:message.speech.units[1].id}).expect(201);expect(mock.mock.calls[0][0]).toBe('Keep 3.14 intact.');
  });
  it('rejects a corrupt frozen unit without re-splitting or invoking a paid provider',async()=>{
    const row=await fixture(),step=row.lesson.steps[0],track=row.presentation.tracks[step.id],mock=audio();await store.transaction(()=>{store.find('classroomSessions',{id:row.id}).presentation.tracks[step.id].units[0].text='Fabricated replacement';});
    try{await call('post',base(row.id)+'/narration/'+step.id,{sentenceIndex:0,presentationVersion:'speech-v2',unitId:track.units[0].id},parent,409);expect(mock).not.toHaveBeenCalled();}finally{await store.transaction(()=>{store.find('classroomSessions',{id:row.id}).presentation.tracks[step.id]=track;});}
    expect((await call('get',base(row.id))).sentenceCursor).toBe(0);
  });
  it('aborts synthesis when the requesting browser disconnects',async()=>{
    const row=await fixture(),step=row.lesson.steps[0],unit=row.presentation.tracks[step.id].units[0];let arrive!:()=>void,aborted=false;const arrival=new Promise<void>(resolve=>{arrive=resolve;});vi.spyOn(speech,'synthesize').mockImplementation((_text:any,_voice:any,signal:any)=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(new Error('Anonymous cancelled fixture'));},{once:true});arrive();}));
    const query=request(app.getHttpServer()).post('/api'+base(row.id)+'/narration/'+step.id).set('Authorization','Bearer '+parent.token).send({sentenceIndex:0,presentationVersion:'speech-v2',unitId:unit.id}),finished=new Promise<void>(resolve=>{query.once('abort',()=>resolve());query.end(()=>resolve());});await arrival;query.abort();await expect.poll(()=>aborted).toBe(true);await finished;await call('get',base(row.id));
  });
  it('retains units, history and semantic identities through database reopen and portable export',async()=>{
    const row=await fixture(true),upgraded=await call('post',base(row.id)+'/presentation',upgrade(row)),saved=await call('patch',base(row.id),position(upgraded,1));await app.close();await boot();const restored=await call('get',base(row.id));expect(restored.presentation).toEqual(saved.presentation);expect(restored.presentationRevisions).toEqual(saved.presentationRevisions);expect(restored.sentenceCursor).toBe(1);
    await store.requestContext(()=>{const{portableRecords,accountRecords}=require('../../../dist/apps/api/src/modules/privacy/privacy-records.js'),portable=portableRecords(accountRecords(store,parent.user.id,parent.user.principal),parent.user.id),record=portable.classroomSessions.find((entry:any)=>entry.id===row.id);expect(record.presentation).toEqual(saved.presentation);expect(record.presentationRevisions).toEqual(saved.presentationRevisions);expect(record).not.toHaveProperty('requests');expect(record).not.toHaveProperty('answerKeys');});
  });
});

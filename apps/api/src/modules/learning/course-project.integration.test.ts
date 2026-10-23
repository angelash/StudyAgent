import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('versioned course projects, artifacts, review and persistence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-projects-'));
  const names = ['NODE_ENV','STUDY_STORAGE','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','XIAOJIU_CHAT_ENABLED'] as const;
  const prior = Object.fromEntries(names.map(name => [name,process.env[name]]));
  let app:any,store:any,parent:any,other:any,learner:any,teacher:any,studentId:string,courseId:string;
  const base = '/learning/projects';
  async function boot() {
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api');await app.init();store=app.get(InMemoryStoreService);
  }
  async function call(method:'get'|'post'|'patch',path:string,body?:unknown,actor=parent,status=method==='post'?201:200) {
    let query=request(app.getHttpServer())[method]('/api'+path);if(actor)query=query.set('Authorization','Bearer '+actor.token);
    if(body!==undefined)query=query.send(body as object);return (await query.expect(status)).body.data;
  }
  beforeAll(async()=>{
    Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:'sqlite',STUDY_DATA_DIR:directory,STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'false',XIAOJIU_CHAT_ENABLED:'false'});
    await boot();
    const register=(principal:string)=>call('post','/auth/register',{principal,credential:'Project-test-only-20261024'},null);
    parent=await register('project-parent@test');other=await register('project-other@test');teacher=await register('project-teacher@test');
    const created=await call('post','/students',{nickname:'项目核查',grade:5,preferredSessionMinutes:15,defaultVersionMap:{math:'',chinese:'',english:''}});studentId=created.profile.id;
    const access=await call('post',`/students/${studentId}/learning-access`,{enabled:true,expectedVersion:0,requestKey:randomUUID(),reason:'项目独立测试'});
    const code=await call('post',`/students/${studentId}/learning-access/codes`,{expectedVersion:access.version,requestKey:randomUUID()});
    learner=await call('post','/auth/learning-code',{code:code.code},null);
    courseId='project-test-course';
    await store.transaction(()=>{
      store.find('users',{id:teacher.user.id}).role='teacher';
      store.append('teacherAssignments',{id:randomUUID(),studentId,teacherUserId:teacher.user.id,grantedBy:parent.user.id,permission:'scoring_review',status:'active',createdAt:new Date().toISOString(),revokedAt:null,revokedBy:null});
      store.append('studioCourses',{id:courseId,studentId,subject:'math',grade:5,term:'upper',title:'迁移项目测试',description:'',objective:'解释新情境',status:'active',source:'studyagent_curriculum',scopeVersion:1,textbookVersion:'测试范围',focusAtomIds:[],materials:[],fingerprint:'project-fixture-v1',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),units:[{id:'transfer-unit',title:'迁移',objective:'解释每一步的条件',lessons:[{id:'transfer-project',atomId:null,title:'在新情境中解释',objective:'用新情境检查自己的方法',kind:'project',state:'not_started',href:'/learn'}]}]});
    });
  });
  afterAll(async()=>{await app?.close();for(const [name,value]of Object.entries(prior)){if(value===undefined)delete process.env[name];else process.env[name]=value;}rmSync(directory,{recursive:true,force:true});});
  const artifact=(row:any,stageId=row.currentStageId,text='匿名记录：观察与解释分别保留。')=>({values:Object.fromEntries(row.definition.stages.find((s:any)=>s.id===stageId).fields.map((f:any)=>[f.id,text])),evidence:[{id:'source-1',label:'匿名观察',content:'在图书馆记录了两次提醒；不能推出所有时间都相同。',source:'https://example.org/notes'}]});
  const ratings=(row:any)=>row.definition.rubric.map((criterion:any)=>({criterionId:criterion.id,level:1,evidence:'作品列出当前观察，仍需要比较条件。'}));
  const open=(unitId='soc-u1',actor=parent)=>call('post',base,{unitId},actor);
  const submit=(row:any,extra={})=>({expectedRevision:row.revision,requestKey:randomUUID(),stageId:row.currentStageId,artifact:artifact(row),selfRatings:ratings(row),revisionNote:'',...extra});

  it('catalog reads do not create facts; five original projects freeze three distinct phases and four-level rubrics',async()=>{
    const before=await store.requestContext(()=>store.inspect('courseProjects').length);
    const catalog=await call('get',base+'/catalog');expect(catalog.definitions).toHaveLength(5);expect(catalog.projects).toEqual([]);
    expect(await store.requestContext(()=>store.inspect('courseProjects').length)).toBe(before);
    const fields=new Set<string>();for(const definition of catalog.definitions){expect(definition.stages).toHaveLength(3);expect(definition.contentReview).toBe('pending');expect(definition.rubric.every((r:any)=>r.levels.length===4)).toBe(true);fields.add(JSON.stringify(definition.stages));}
    expect(fields.size).toBe(5);
    const row=await open();expect((await open()).id).toBe(row.id);expect(row).not.toHaveProperty('requests');expect(row.permissions).toEqual({edit:true,review:false});
    await call('get',base+'/catalog',undefined,learner,403);await call('post',base,{unitId:'soc-u1'},learner,403);
    await call('get',base+'/'+row.id,undefined,other,403);await call('patch',base+'/'+row.id,{expectedRevision:0,stageId:row.currentStageId,artifact:artifact(row),requestKey:randomUUID()},other,403);
    await call('post',base+'/'+row.id+'/reviews',{},parent,403);
  });
  it('saves unfinished artifacts and self-reflections, prevents stale overwrites and replays lost acknowledgments',async()=>{
    let row=await open('soc-u2');const command={expectedRevision:row.revision,requestKey:randomUUID(),stageId:row.currentStageId,artifact:artifact(row),selfRatings:[{criterionId:'observation',level:0,evidence:''}],revisionNote:'待补充'};
    row=await call('patch',base+'/'+row.id,command);expect(row.revision).toBe(1);expect(row.draftReflections[row.currentStageId].revisionNote).toBe('待补充');
    expect((await call('patch',base+'/'+row.id,command)).revision).toBe(1);
    await call('patch',base+'/'+row.id,{...command,requestKey:randomUUID()},parent,409);
    await call('patch',base+'/'+row.id,{...command,artifact:{values:{},evidence:[]}},parent,409);
    const saved=row.drafts;await call('patch',base+'/'+row.id,{...command,expectedRevision:1,requestKey:randomUUID(),artifact:{values:{foreign:'bad'},evidence:[]}},parent,400);
    expect((await call('get',base+'/'+row.id)).drafts).toEqual(saved);
    const unfinished=await call('patch',base+'/'+row.id,{expectedRevision:row.revision,requestKey:randomUUID(),stageId:row.currentStageId,artifact:{values:{},evidence:[{id:'unfinished',label:'',content:'',source:'https://'}]}});
    expect(unfinished.drafts[row.currentStageId].evidence[0].source).toBe('https://');
  });
  it('rejects incomplete submissions and unsafe or duplicate evidence without writing facts',async()=>{
    const row=await open('soc-u3'), command=submit(row);
    await call('post',base+'/'+row.id+'/submissions',{...command,selfRatings:[]},parent,400);
    await call('post',base+'/'+row.id+'/submissions',{...command,artifact:{values:{},evidence:[]}},parent,400);
    await call('post',base+'/'+row.id+'/submissions',{...command,selfRatings:[ratings(row)[0],ratings(row)[0]]},parent,400);
    for(const source of ['javascript:alert(1)','https://user:secret@example.org/','https://'])await call('post',base+'/'+row.id+'/submissions',{...command,artifact:{...command.artifact,evidence:[{...command.artifact.evidence[0],source}]}},parent,400);
    await call('post',base+'/'+row.id+'/submissions',{...command,artifact:{...command.artifact,evidence:[command.artifact.evidence[0],command.artifact.evidence[0]]}},parent,400);
    expect((await call('get',base+'/'+row.id)).submissions).toEqual([]);
  });
  it('freezes each submission, requires revision notes and survives a SQLite restart',async()=>{
    let row=await open('soc-u4'),command=submit(row);row=await call('post',base+'/'+row.id+'/submissions',command);
    const first=structuredClone(row.submissions[0]);expect((await call('post',base+'/'+row.id+'/submissions',command)).submissions).toEqual([first]);
    await call('post',base+'/'+row.id+'/submissions',submit(row),parent,400);
    row=await call('patch',base+'/'+row.id,{expectedRevision:row.revision,requestKey:randomUUID(),stageId:row.currentStageId,artifact:artifact(row,row.currentStageId,'修改后的过程解释')});
    expect(row.submissions[0]).toEqual(first);
    row=await call('post',base+'/'+row.id+'/submissions',submit(row,{artifact:artifact(row,row.currentStageId,'修改后的过程解释'),revisionNote:'补充过程环节与反例'}));
    expect(row.submissions[1]).toMatchObject({number:2,previousSubmissionId:first.id,rubricVersion:row.definition.fingerprint});
    await app.close();await boot();expect((await call('get',base+'/'+row.id)).submissions).toEqual(row.submissions);
    await store.requestContext(()=>{expect(store.inspect('diagnosticResponses')).toHaveLength(0);expect(store.inspect('diagnosticPlans')).toHaveLength(0);});
  });
  it('keeps changed project definitions archived and opens a new version only explicitly',async()=>{
    let row=await open('soc-u5');await store.transaction(()=>{const record=store.find('courseProjects',{id:row.id});record.definition.fingerprint='old-definition';record.definition.title='保留项目';});
    row=await call('get',base+'/'+row.id);expect(row.contentStatus).toBe('archived');expect((await open('soc-u5')).id).toBe(row.id);
    const current=await call('post',base,{unitId:'soc-u5',useCurrentVersion:true});expect(current.id).not.toBe(row.id);expect(current.contentStatus).toBe('current');
    expect((await call('get',base+'/'+row.id)).definition.title).toBe('保留项目');
  });
  it('imports only owned same-course legacy drafts as references and preserves the original',async()=>{
    let session=await call('post','/learning/classroom/sessions',{lessonId:'soc-1-1-1'});
    session=await call('patch','/learning/classroom/sessions/'+session.id,{expectedRevision:session.revision,cursor:0,revealed:0,projectDraft:'旧稿：匿名观察，请继续核查。'});
    let row=await open();const command={expectedRevision:row.revision,requestKey:randomUUID(),sessionId:session.id};
    row=await call('post',base+'/'+row.id+'/legacy',command);expect(row.legacyImports).toHaveLength(1);expect(row.submissions).toEqual([]);
    row=await call('post',base+'/'+row.id+'/legacy',command);expect(row.legacyImports).toHaveLength(1);
    row=await call('post',base+'/'+row.id+'/legacy',{...command,expectedRevision:row.revision,requestKey:randomUUID()});expect(row.legacyImports).toHaveLength(1);
    expect((await call('get','/learning/classroom/sessions/'+session.id)).projectDraft).toBe(session.projectDraft);
    const foreign=await call('post','/learning/classroom/sessions',{lessonId:'soc-1-1-1'},other);
    await call('post',base+'/'+row.id+'/legacy',{expectedRevision:row.revision,requestKey:randomUUID(),sessionId:foreign.id},parent,400);
  });
  it('keeps authorized human reviews bound to a learner submission and denies changes after revocation',async()=>{
    let row=await call('post',base,{unitId:'transfer-unit',studioCourseId:courseId},learner);
    row=await call('post',base+'/'+row.id+'/submissions',submit(row),learner);expect(row.definition.rubric).toHaveLength(3);
    const command={expectedRevision:row.revision,requestKey:randomUUID(),submissionId:row.submissions[0].id,ratings:ratings(row),comment:'检查是否有具体核查方法。',decision:'needs_revision'};
    await call('post',base+'/'+row.id+'/reviews',command,learner,403);await call('post',base+'/'+row.id+'/reviews',command,other,403);
    await call('patch',base+'/'+row.id,{expectedRevision:row.revision,requestKey:randomUUID(),stageId:row.currentStageId,artifact:artifact(row)},parent,403);
    row=await call('post',base+'/'+row.id+'/reviews',command,parent);expect(row.reviews[0].reviewerRole).toBe('parent');expect(row.reviews[0].submissionId).toBe(row.submissions[0].id);
    expect((await call('post',base+'/'+row.id+'/reviews',command,parent)).reviews).toHaveLength(1);
    row=await call('post',base+'/'+row.id+'/reviews',{...command,expectedRevision:row.revision,requestKey:randomUUID(),decision:'ready'},teacher);expect(row.reviews[1].reviewerRole).toBe('teacher');
    expect((await call('get',base+'/catalog?studioCourseId='+courseId+'&studentId='+studentId,undefined,teacher)).projects.some((project:any)=>project.id===row.id)).toBe(true);
    await store.transaction(()=>{store.find('teacherAssignments',{teacherUserId:teacher.user.id}).status='revoked';});
    await call('get',base+'/'+row.id,undefined,teacher,403);
    await store.transaction(()=>{store.find('bindings',{parentUserId:parent.user.id,studentId}).status='inactive';});
    await call('get',base+'/'+row.id,undefined,parent,403);await call('get',base+'/'+row.id,undefined,learner,401);
    await store.transaction(()=>{store.find('bindings',{parentUserId:parent.user.id,studentId}).status='active';});
  });
  it('labels AI advice as draft-specific suggestions, retries once and honors cancellation without a review',async()=>{
    let row=await open('soc-u2');row=await call('patch',base+'/'+row.id,{expectedRevision:row.revision,requestKey:randomUUID(),stageId:row.currentStageId,artifact:artifact(row)});
    const { XiaojiuChatService }=require('../../../dist/apps/api/src/modules/ai/xiaojiu-chat.service.js');
    const provider=app.get(XiaojiuChatService),mock=vi.spyOn(provider,'reply').mockResolvedValue({reply:'比较观察条件，并记录可能的反例。',modelName:'test-only',evidenceIds:[]});
    const command={expectedRevision:row.revision,requestKey:randomUUID(),stageId:row.currentStageId,modelId:'auto'};
    row=await call('post',base+'/'+row.id+'/advice',command);expect(row.advice).toHaveLength(1);expect(row.reviews).toEqual([]);expect(row.advice[0].artifactFingerprint).toContain('匿名记录');
    await call('post',base+'/'+row.id+'/advice',command);expect(mock).toHaveBeenCalledTimes(1);
    const context=mock.mock.calls[0][0] as any;expect(context.context).not.toContain('passwordHash');expect(context.context).not.toContain('answerKeys');
    const { CourseProjectService }=require('../../../dist/apps/api/src/modules/learning/course-project.service.js');
    const stopped=new AbortController();stopped.abort();
    await expect(store.requestContext(()=>app.get(CourseProjectService).advise(parent.user,row.id,{...command,expectedRevision:row.revision,requestKey:randomUUID()},stopped.signal))).rejects.toThrow('已停止');
    expect((await call('get',base+'/'+row.id)).advice).toHaveLength(1);mock.mockRestore();
  });
  it('includes project artifacts in portable privacy records and removes only the selected owner',async()=>{
    const {accountRecords,portableRecords,removeSelected}=require('../../../dist/apps/api/src/modules/privacy/privacy-records.js');
    const otherProject=await open('soc-u3',other);
    await store.transaction(()=>{const selected=accountRecords(store,parent.user.id,parent.user.principal),portable=portableRecords(selected,parent.user.id);expect(portable.courseProjects.length).toBeGreaterThan(0);expect(JSON.stringify(portable.courseProjects)).not.toContain('requests');expect(JSON.stringify(portable.courseProjects)).not.toContain('requestKey');expect(portable.courseProjects.some((row:any)=>row.id===otherProject.id)).toBe(false);removeSelected(store,{courseProjects:selected.courseProjects});});
    expect((await call('get',base+'/catalog')).projects).toEqual([]);expect((await call('get',base+'/'+otherProject.id,undefined,other)).id).toBe(otherProject.id);
  });
});

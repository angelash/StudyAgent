import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';

const {sourceCourseFixture,sourceCoursePipelineFixture}=require('../../../../../scripts/qa/source-course-fixture.cjs');
describe('source-backed courses, real durable tasks and frozen classroom evidence',()=>{
  const directory=mkdtempSync(join(tmpdir(),'study-source-course-')),names=['NODE_ENV','DATABASE_URL','STUDY_STORAGE','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','STUDY_PDF_STRUCTURE_MODEL','XIAOJIU_CHAT_ENABLED']as const;
  const prior=Object.fromEntries(names.map(name=>[name,process.env[name]]));let app:any,store:any,worker:any,provider:any,parent:any,other:any,learner:any,studentId:string;
  const base='/learning/source-courses',postgresUrl=process.env.STUDY_TEST_SOURCE_COURSE_POSTGRES_URL;let pgControl:Pool|undefined,pgSchema:string|undefined;
  async function call(method:'get'|'post'|'patch',path:string,body?:unknown,actor=parent,status=method==='post'?201:200){let query=request(app.getHttpServer())[method]('/api'+path);if(actor)query=query.set('Authorization','Bearer '+actor.token);if(body!==undefined)query=query.send(body as object);return(await query.expect(status)).body.data;}
  async function boot(){const{AppModule}=require('../../../dist/apps/api/src/app.module.js'),{InMemoryStoreService}=require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js'),{SourceCourseWorkerService}=require('../../../dist/apps/api/src/modules/learning/source-course-worker.service.js'),{XiaojiuChatService}=require('../../../dist/apps/api/src/modules/ai/xiaojiu-chat.service.js');app=await NestFactory.create(AppModule,{logger:false});require('../../../dist/apps/api/src/common/http-body.js').configureJsonBody(app);app.setGlobalPrefix('api');await app.init();store=app.get(InMemoryStoreService);worker=app.get(SourceCourseWorkerService);provider=app.get(XiaojiuChatService);}
  function model(){return vi.spyOn(provider,'structured').mockImplementation(async(input:any,_schema:any,check:any)=>({...check(sourceCoursePipelineFixture(JSON.parse(input.context),input.message)),modelId:input.modelId,modelName:'test-only'}));}
  beforeAll(async()=>{let backend='sqlite';if(postgresUrl){pgControl=new Pool({connectionString:postgresUrl});if((await pgControl.query('SELECT current_database() AS name')).rows[0].name!=='study_agent_qa')throw new Error('Only the dedicated study_agent_qa database is allowed');pgSchema='study_qa_source_'+randomUUID().replace(/-/g,'');await pgControl.query('CREATE SCHEMA "'+pgSchema+'"');const scoped=new URL(postgresUrl);scoped.searchParams.set('options','-c search_path='+pgSchema);process.env.DATABASE_URL=scoped.toString();backend='postgres';}Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:backend,STUDY_DATA_DIR:directory,STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'false',STUDY_PDF_STRUCTURE_MODEL:'false',XIAOJIU_CHAT_ENABLED:'false'});await boot();
    parent=await call('post','/auth/register',{principal:'source-parent@test',credential:'Source-course-test-only'},null);other=await call('post','/auth/register',{principal:'source-other@test',credential:'Source-course-test-only'},null);
    studentId=(await call('post','/students',{nickname:'资料学习',grade:4,preferredSessionMinutes:15,defaultVersionMap:{math:'',chinese:'',english:''}})).profile.id;
    const access=await call('post',`/students/${studentId}/learning-access`,{enabled:true,expectedVersion:0,requestKey:randomUUID(),reason:'验证资料课程学生入口'}),code=await call('post',`/students/${studentId}/learning-access/codes`,{expectedVersion:access.version,requestKey:randomUUID()});learner=await call('post','/auth/learning-code',{code:code.code},null);
  });
  afterAll(async()=>{vi.restoreAllMocks();await app?.close();if(pgControl){if(pgSchema){if(!/^study_qa_source_[a-f0-9]{32}$/.test(pgSchema))throw new Error('Invalid owned source-course QA schema');await pgControl.query('DROP SCHEMA "'+pgSchema+'" CASCADE');}await pgControl.end();}for(const[name,value]of Object.entries(prior)){if(value===undefined)delete process.env[name];else process.env[name]=value;}rmSync(directory,{recursive:true,force:true});});
  async function text(actor=parent,child=false){return call('post',base+'/materials/text',{title:'匿名社区记录',sections:['匿名阅览室观察：两个周末排队，两个工作日有空位。尚未记录晚间，也不知道当天是否有活动。只记录人数和开放时段，不收集个人姓名。'],...(child?{studentId,subject:'math'}:{}),requestKey:randomUUID()},actor);}
  function generation(source:any,child=false){return{title:'从记录到解释',goal:'区分观察与推断，比较替代解释，并设计可验证的下一步。',language:'zh-CN',minutesPerSession:10,modelId:'auto',selections:[{materialId:source.material.id,version:source.version,pages:[1]}],...(child?{studentId,subject:'math'}:{}),requestKey:randomUUID()};}
  async function ready(child=false){const source=await text(parent,child),draft=await call('post',base,generation(source,child)),mock=model();expect(await worker.runNext()).toBe(true);mock.mockRestore();const row=await call('get',base+'/'+draft.id);expect(row.status).toBe('ready');return{source,row};}
  async function confirm(row:any){return call('post',base+'/'+row.id+'/confirm',{expectedRevision:row.revision,fingerprint:row.fingerprint,requestKey:randomUUID()});}

  it('lets adults add private sources without a child, preserves retry receipts and refuses cross-account or unbounded selections',async()=>{
    const source=await text();expect(source.material.studentId).toBeNull();expect(source.material.ownerUserId).toBe(parent.user.id);expect(source.material).not.toHaveProperty('requestHash');
    expect((await call('get',base+'/materials',undefined,other)).some((row:any)=>row.material.id===source.material.id)).toBe(false);
    await call('post',base,generation(source),other,403);await call('post',base+'/materials/text',{title:'私人',sections:['不能通过学生身份创建没有档案的私人资料。'],requestKey:randomUUID()},learner,403);
    await call('post',base,{...generation(source),selections:[{materialId:source.material.id,version:'f'.repeat(64),pages:[1]}]},parent,409);
    await call('post',base,{...generation(source),selections:[{materialId:source.material.id,version:source.version,pages:[1,1]}]},parent,400);
    const huge=await call('post',base+'/materials/text',{title:'较长资料',sections:['原始资料内容。'.repeat(1000),'另一个段落内容。'.repeat(1000)],requestKey:randomUUID()});
    await call('post',base,{...generation(huge),selections:[{materialId:huge.material.id,version:huge.version,pages:[1,2]}]},parent,400);
    const escaped=await call('post',base+'/materials/text',{title:'格式字符较多',sections:['"\\'.repeat(2500),'"\\'.repeat(2500)],requestKey:randomUUID()});
    await call('post',base,{...generation(escaped),selections:[{materialId:escaped.material.id,version:escaped.version,pages:[1,2]}]},parent,400);
    expect((await call('get',base)).length).toBe(0);
  });
  it('persists a queued task across restart and generates a complete candidate with verifiable quotations',async()=>{
    const source=await text(),command=generation(source),draft=await call('post',base,command);expect(draft.status).toBe('queued');expect((await call('post',base,command)).id).toBe(draft.id);
    await call('post',base,{...command,title:'不同命令'},parent,409);await app.close();await boot();const mock=model();await worker.runNext();expect(mock).toHaveBeenCalledTimes(5);mock.mockRestore();
    const row=await call('get',base+'/'+draft.id);expect(row.status).toBe('ready');expect(row.lessons).toHaveLength(2);expect(row.lessons[0].steps).toHaveLength(6);expect(row.lessons[0].sourceReferences[0].quote).toBe(source.material.pages[0].text.slice(0,40));
    expect(row).not.toHaveProperty('result');expect(row).not.toHaveProperty('requests');expect(JSON.stringify(row.lessons)).not.toContain('"answer":');expect(row.formalMeasurementEligible).toBe(false);
    await call('get',base+'/'+draft.id,undefined,other,403);
  });
  it('keeps built-in teaching directions in English for an English course and an English source lesson',async()=>{
    const {sourceCourseLesson}=require('../../../dist/apps/api/src/modules/learning/source-course-content.js');
    const source={key:'src-1-1',text:'A fraction describes equal parts of one whole.',title:'Fractions',page:1,blocks:[]};
    const content=sourceCourseFixture([{sourceKey:source.key,text:source.text}]);content.lessons[0].concept='Equivalent fractions name the same quantity.';
    const row={id:randomUUID(),input:{language:'en'},result:content,sources:[source],fingerprint:'test-only'};
    for(const language of ['en','source']){row.input.language=language;const lesson=sourceCourseLesson(row,0);const check=lesson.steps.find((step:any)=>step.phase==='check');
      expect(check.narration).toContain('Explain the idea in your own words');expect(check.narration).not.toMatch(/[\p{Script=Han}]/u);expect(lesson.steps[0].title).toBe('Your learning route');}
  });
  it('rejects invented citations and repeated choices before publishing a candidate',async()=>{
    const source=await text(),draft=await call('post',base,generation(source));const mock=vi.spyOn(provider,'structured').mockImplementation(async(input:any,_schema:any,check:any)=>{const fixture=sourceCoursePipelineFixture(JSON.parse(input.context),input.message);if(JSON.parse(input.message).stage==='lesson')fixture.citations[0].quote='这句话从未出现在所选资料的正文里面。';return{...check(fixture),modelId:input.modelId,modelName:'test-only'};});
    await worker.runNext();mock.mockRestore();const failed=await call('get',base+'/'+draft.id);expect(failed.status).toBe('failed');expect(failed.lessons).toEqual([]);
    const{checkGeneratedCourse}=require('../../../dist/apps/api/src/modules/learning/source-course-content.js'),fixture=sourceCourseFixture([{sourceKey:source.material.id,text:source.material.pages[0].text}]);fixture.lessons[0].questions[0].options[1]=fixture.lessons[0].questions[0].options[0];
    expect(()=>checkGeneratedCourse(fixture,[{key:source.material.id,text:source.material.pages[0].text}])).toThrow('选项重复');
    const predictable=sourceCourseFixture([{sourceKey:source.material.id,text:source.material.pages[0].text}]);predictable.lessons.forEach((lesson:any)=>lesson.questions.forEach((question:any)=>{question.answer=0;}));
    expect(()=>checkGeneratedCourse(predictable,[{key:source.material.id,text:source.material.pages[0].text}])).toThrow('正确答案位置相同');
  });
  it('edits a candidate, rejects stale confirmation and freezes a single active course on a lost confirmation response',async()=>{
    let{row}=await ready();const old=row.fingerprint,command={expectedRevision:row.revision,requestKey:randomUUID(),title:'审阅后的课程',goal:'保留具体来源，重点比较解释。',lessons:[{id:row.lessons[0].id,title:'审阅后的课时',objective:'写清条件与核查方法。'}]};
    row=await call('patch',base+'/'+row.id,command);expect((await call('patch',base+'/'+row.id,command)).fingerprint).toBe(row.fingerprint);expect(row.lessons).toHaveLength(1);expect(row.fingerprint).not.toBe(old);
    await call('post',base+'/'+row.id+'/confirm',{expectedRevision:row.revision,fingerprint:old,requestKey:randomUUID()},parent,409);
    const confirmation={expectedRevision:row.revision,fingerprint:row.fingerprint,requestKey:randomUUID()};row=await call('post',base+'/'+row.id+'/confirm',confirmation);expect(row.status).toBe('active');
    expect((await call('post',base+'/'+row.id+'/confirm',confirmation)).revision).toBe(row.revision);await call('patch',base+'/'+row.id,{...command,expectedRevision:row.revision,requestKey:randomUUID()},parent,409);
    const session=await call('post','/learning/classroom/sessions',{sourceCourseId:row.id,lessonId:row.lessons[0].id});expect(session.sourceCourseId).toBe(row.id);expect(session.lesson.questions).toHaveLength(2);expect(session).not.toHaveProperty('answerKeys');expect(session).not.toHaveProperty('hintKeys');
    const hint=await call('post','/learning/classroom/sessions/'+session.id+'/hints',{questionId:session.lesson.questions[0].id,level:1,requestKey:randomUUID()});expect(hint.hintReceipts).toHaveLength(1);
    const answered=await call('post','/learning/classroom/sessions/'+session.id+'/answers',{questionId:session.lesson.questions[0].id,selectedIndex:0,requestKey:randomUUID()});expect(answered.answers[0]).toMatchObject({correct:true,hintUsed:true});
    await store.requestContext(()=>expect(store.inspect('diagnosticResponses')).toHaveLength(0));
  });
  it('invalidates a stale source preview while an active classroom retains its frozen original text',async()=>{
    const{row,source}=await ready();await store.transaction(()=>{const material=store.find('studioSourceMaterials',{id:source.material.id});material.pages[0].text='已更新的资料正文，与原先选择的内容不同，需要重新选择原页。';material.updatedAt=new Date(Date.now()+1000).toISOString();});
    await call('post',base+'/'+row.id+'/confirm',{expectedRevision:row.revision,fingerprint:row.fingerprint,requestKey:randomUUID()},parent,409);expect((await call('get',base+'/'+row.id)).sources[0].text).toBe(source.material.pages[0].text);
    const fresh=await ready(),active=await confirm(fresh.row),session=await call('post','/learning/classroom/sessions',{sourceCourseId:active.id,lessonId:active.lessons[0].id});
    await store.transaction(()=>{store.find('studioSourceMaterials',{id:fresh.source.material.id}).pages[0].text='新的识别正文，不能改变旧课堂引用。';});
    expect((await call('get','/learning/classroom/sessions/'+session.id)).lesson).toEqual(session.lesson);expect((await call('get',base+'/'+active.id)).sourceStatus).toBe('changed');
  });
  it('cancels queued and in-flight generation; the old task cannot publish after cancellation',async()=>{
    const source=await text(),draft=await call('post',base,generation(source));let entered!:()=>void,release!:()=>void;const arrival=new Promise<void>(resolve=>entered=resolve),held=new Promise<void>(resolve=>release=resolve);
    const mock=vi.spyOn(provider,'structured').mockImplementation(async(input:any,_schema:any,check:any)=>{entered();await held;return{...check(sourceCoursePipelineFixture(JSON.parse(input.context),input.message)),modelId:input.modelId,modelName:'test-only'};});
    const running=worker.runNext();await arrival;let current=await call('get',base+'/'+draft.id);expect(current.status).toBe('generating');
    current=await call('post',base+'/'+draft.id+'/cancel',{expectedRevision:current.revision,expectedTaskVersion:current.task.version,requestKey:randomUUID()});expect(current.status).toBe('cancelled');release();await running;mock.mockRestore();
    current=await call('get',base+'/'+draft.id);expect(current.lessons).toEqual([]);expect(current.task.state).toBe('cancelled');
    current=await call('post',base+'/'+draft.id+'/retry',{expectedRevision:current.revision,expectedTaskVersion:current.task.version,requestKey:randomUUID()});expect(current.task.generation).toBe(2);const retryModel=model();await worker.runNext();retryModel.mockRestore();expect((await call('get',base+'/'+draft.id)).status).toBe('ready');
  });
  it('lets a child learn a parent-confirmed course and denies publishing after guardian access is revoked',async()=>{
    const {row}=await ready(true);await call('get',base+'/'+row.id,undefined,learner,403);const active=await confirm(row);
    const childView=await call('get',base+'/'+active.id,undefined,learner);expect(childView.permissions.manage).toBe(false);
    expect((await call('get',base+'?studentId='+studentId+'&subject=math',undefined,learner)).some((item:any)=>item.id===active.id)).toBe(true);
    await call('post',base+'/'+active.id+'/archive',{expectedRevision:active.revision,requestKey:randomUUID()},learner,403);
    const session=await call('post','/learning/classroom/sessions',{sourceCourseId:active.id,lessonId:active.lessons[0].id},learner);expect(session.studentId).toBe(studentId);
    const source=await text(parent,true),draft=await call('post',base,generation(source,true));let release!:()=>void,entered!:()=>void;const held=new Promise<void>(resolve=>release=resolve),arrived=new Promise<void>(resolve=>entered=resolve);
    const mock=vi.spyOn(provider,'structured').mockImplementation(async(input:any,_schema:any,check:any)=>{entered();await held;return{...check(sourceCoursePipelineFixture(JSON.parse(input.context),input.message)),modelId:input.modelId,modelName:'test-only'};});const running=worker.runNext();await arrived;
    await store.transaction(()=>{store.find('bindings',{parentUserId:parent.user.id,studentId}).status='inactive';});release();await running;mock.mockRestore();await call('get',base+'/'+draft.id,undefined,parent,403);
    await store.transaction(()=>{expect(store.find('sourceCourses',{id:draft.id}).result).toBeNull();store.find('bindings',{parentUserId:parent.user.id,studentId}).status='active';});
  });
  it('archives new course starts without breaking saved classroom sessions and exports no private keys',async()=>{
    const{row}=await ready(),active=await confirm(row),session=await call('post','/learning/classroom/sessions',{sourceCourseId:active.id,lessonId:active.lessons[0].id});
    const archived=await call('post',base+'/'+active.id+'/archive',{expectedRevision:active.revision,requestKey:randomUUID()});expect(archived.status).toBe('archived');
    await call('post','/learning/classroom/sessions',{sourceCourseId:active.id,lessonId:active.lessons[1].id},parent,409);expect((await call('get','/learning/classroom/sessions/'+session.id)).lesson).toEqual(session.lesson);
    const{accountRecords,portableRecords}=require('../../../dist/apps/api/src/modules/privacy/privacy-records.js');
    await store.requestContext(()=>{const portable=portableRecords(accountRecords(store,parent.user.id,parent.user.principal),parent.user.id);expect(portable.sourceCourses.some((item:any)=>item.id===active.id)).toBe(true);const all=JSON.stringify(portable);expect(all).not.toContain('answerKeys');expect(all).not.toContain('hintKeys');expect(all).not.toContain('originalResult');expect(all).not.toContain('requestKey');});
  });
  it('processes an adult PDF through the existing worker and includes its verified original in a family archive',async()=>{
    const stream='BT /F1 18 Tf 72 700 Td (Community observations compare conditions and alternative explanations.) Tj 0 -25 Td (Keep anonymous records and check the limits before drawing conclusions.) Tj ET';
    const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
    let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const result=await request(app.getHttpServer()).post('/api/learning/studio/materials/pdf').set('Authorization','Bearer '+parent.token).field('requestKey',randomUUID()).attach('file',Buffer.from(pdf),{filename:'community.pdf',contentType:'application/pdf'}).expect(201);
    expect(result.body.data.studentId).toBeNull();const materialId=result.body.data.id;
    const{ProcessingWorkerService}=require('../../../dist/apps/api/src/modules/processing/processing-worker.service.js');expect(await app.get(ProcessingWorkerService).runNext()).toBe(true);
    const source=(await call('get',base+'/materials')).find((item:any)=>item.material.id===materialId);expect(source.material.status).toMatch(/ready|needs_review/);expect(source.material.hasPageImages).toBe(true);
    const uploadKey=randomUUID(),duplicate=await request(app.getHttpServer()).post('/api/learning/studio/materials/pdf').set('Authorization','Bearer '+parent.token).field('requestKey',uploadKey).attach('file',Buffer.from(pdf),{filename:'duplicate.pdf',contentType:'application/pdf'}).expect(201);expect(duplicate.body.data.id).toBe(materialId);
    await request(app.getHttpServer()).post('/api/learning/studio/materials/pdf').set('Authorization','Bearer '+parent.token).field('requestKey',uploadKey).attach('file',Buffer.from(pdf+'\nchanged'),{filename:'duplicate.pdf',contentType:'application/pdf'}).expect(409);
    await request(app.getHttpServer()).get(`/api/learning/studio/materials/${materialId}/pages/1`).set('Authorization','Bearer '+other.token).expect(403);
    const page=await request(app.getHttpServer()).get(`/api/learning/studio/materials/${materialId}/pages/1`).set('Authorization','Bearer '+parent.token).expect(200);expect(page.headers['content-type']).toContain('image/png');
    const draft=await call('post',base,generation(source)),mock=model();await worker.runNext();mock.mockRestore();expect((await call('get',base+'/'+draft.id)).status).toBe('ready');
    const archive=await request(app.getHttpServer()).post('/api/privacy/account/export-archive').set('Authorization','Bearer '+parent.token).send({credential:'Source-course-test-only',requestKey:randomUUID()}).buffer(true).parse((response:any,callback:any)=>{const chunks:Buffer[]=[];response.on('data',(chunk:Buffer)=>chunks.push(chunk));response.on('end',()=>callback(null,Buffer.concat(chunks)));}).expect(201);
    const bytes=archive.body as Buffer;let position=0;const files=new Map<string,Buffer>();while(position+512<=bytes.length){const name=bytes.subarray(position,position+100).toString('utf8').replace(/\0.*$/s,'');if(!name)break;const size=parseInt(bytes.subarray(position+124,position+136).toString('ascii').replace(/\0.*$/s,'').trim(),8);files.set(name,bytes.subarray(position+512,position+512+size));position+=512+Math.ceil(size/512)*512;}
    expect(files.get('sources/'+source.material.sha256+'.pdf')).toEqual(Buffer.from(pdf));const manifest=JSON.parse(files.get('media-manifest.json')!.toString('utf8'));expect(manifest.sources.some((item:any)=>item.materialId===materialId)).toBe(true);
  });
  it('lets only the adult creator read and repair the complete candidate, preserving the original and freezing edited answers',async()=>{
    const{row}=await ready(),draft=await call('post',base+'/'+row.id+'/authoring');
    await call('post',base+'/'+row.id+'/authoring',undefined,other,403);await call('post',base+'/'+row.id+'/authoring',undefined,learner,403);
    const original=structuredClone(draft.content),content=structuredClone(draft.content);content.title='修订后的完整课程';content.overview='核对来源、讲解和题目，保留尚未验证的解释。';content.lessons[0].concept='这是核对原文以后修订的概念讲解。';
    const question=content.lessons[0].questions[0];[question.options[0],question.options[1]]=[question.options[1],question.options[0]];question.answer=1;question.explanation='修订后的解释与第二个选项一致。';question.hints=['先核对原始记录。','再比较仍未验证的条件。'];
    const command={expectedRevision:draft.revision,requestKey:randomUUID(),content},saved=await call('patch',base+'/'+row.id+'/content',command);expect(saved.overview).toBe(content.overview);expect(saved.lessons[0].steps[1].narration).toBe(content.lessons[0].concept);expect(JSON.stringify(saved)).not.toContain('修订后的解释与第二个选项一致。');
    expect((await call('patch',base+'/'+row.id+'/content',command)).revision).toBe(saved.revision);
    await call('patch',base+'/'+row.id+'/content',{...command,content:{...content,title:'同键不同内容'}},parent,409);
    const edited=await call('post',base+'/'+row.id+'/authoring');expect(edited.content).toEqual(content);expect(edited.originalContent).toEqual(original);
    await call('post',base+'/'+row.id+'/confirm',{expectedRevision:row.revision,fingerprint:row.fingerprint,requestKey:randomUUID()},parent,409);
    const active=await confirm(saved);await call('post',base+'/'+row.id+'/authoring',undefined,parent,409);await call('patch',base+'/'+row.id+'/content',{...command,expectedRevision:active.revision,requestKey:randomUUID()},parent,409);
    const session=await call('post','/learning/classroom/sessions',{sourceCourseId:row.id,lessonId:active.lessons[0].id});expect(session).not.toHaveProperty('answerKeys');
    const hint=await call('post','/learning/classroom/sessions/'+session.id+'/hints',{questionId:session.lesson.questions[0].id,level:1,requestKey:randomUUID()});expect(hint.hintReceipts[0].text??hint.hintReceipts[0].hint).toBe(question.hints[0]);
    const answered=await call('post','/learning/classroom/sessions/'+session.id+'/answers',{questionId:session.lesson.questions[0].id,selectedIndex:1,requestKey:randomUUID()});expect(answered.answers[0]).toMatchObject({correct:true,explanation:question.explanation,answerExposure:'authorship'});const{classroomPracticeSummary}=require('@study-agent/contracts');expect(classroomPracticeSummary(session.lesson.questions,[{...answered.answers[0],hintUsed:false}]).independentCorrect).toBe(0);
    await store.requestContext(()=>{const{portableRecords,accountRecords}=require('../../../dist/apps/api/src/modules/privacy/privacy-records.js');const portable=portableRecords(accountRecords(store,parent.user.id,parent.user.principal),parent.user.id).sourceCourses.find((course:any)=>course.id===row.id);expect(portable).not.toHaveProperty('result');expect(portable).not.toHaveProperty('originalResult');expect(portable).not.toHaveProperty('edits');});
  });
  it('rejects invalid content atomically and never uses a refreshed public revision to overwrite a stale editor',async()=>{
    const{row}=await ready(),draft=await call('post',base+'/'+row.id+'/authoring'),bad=structuredClone(draft.content);bad.lessons[0].questions[0].options[1]=bad.lessons[0].questions[0].options[0];
    await call('patch',base+'/'+row.id+'/content',{expectedRevision:row.revision,requestKey:randomUUID(),content:bad},parent,400);expect((await call('get',base+'/'+row.id)).revision).toBe(row.revision);
    bad.lessons[0].questions[0].options[1]='不同的选项';bad.lessons[0].citations[0].quote='这段引用不在冻结来源中，不能保存。';
    await call('patch',base+'/'+row.id+'/content',{expectedRevision:row.revision,requestKey:randomUUID(),content:bad},parent,400);
    const updated={...draft.content,title:'另一页已保存'};await call('patch',base+'/'+row.id+'/content',{expectedRevision:row.revision,requestKey:randomUUID(),content:updated});
    await call('patch',base+'/'+row.id+'/content',{expectedRevision:draft.revision,requestKey:randomUUID(),content:{...draft.content,title:'旧页本地编辑'}},parent,409);expect((await call('post',base+'/'+row.id+'/authoring')).content.title).toBe(updated.title);
  });
  it('saves a complete six-lesson manuscript beyond 100KB but rejects unbounded bodies without partial writes',async()=>{
    const{row}=await ready(),draft=await call('post',base+'/'+row.id+'/authoring'),content=structuredClone(draft.content);content.lessons=Array.from({length:6},(_,index)=>{
      const lesson=structuredClone(draft.content.lessons[0]);lesson.title='完整课时 '+(index+1);lesson.concept='概'.repeat(900);lesson.introduction='引'.repeat(400);
      lesson.questions=Array.from({length:4},(_,qi)=>({...structuredClone(lesson.questions[0]),prompt:'题'.repeat(700),options:Array.from({length:4},(_,oi)=>String.fromCharCode(65+oi)+'项'.repeat(219)),answer:qi,explanation:'解'.repeat(600),hints:['先'.repeat(200),'再'.repeat(200)]}));return lesson;});
    const command={expectedRevision:row.revision,requestKey:randomUUID(),content};expect(Buffer.byteLength(JSON.stringify(command))).toBeGreaterThan(100*1024);const saved=await call('patch',base+'/'+row.id+'/content',command);expect(saved.lessons).toHaveLength(6);expect((await call('post',base+'/'+row.id+'/authoring')).content).toEqual(content);
    await call('patch',base+'/'+row.id+'/content',{...command,expectedRevision:saved.revision,requestKey:randomUUID(),padding:'x'.repeat(600*1024)},parent,413);expect((await call('get',base+'/'+row.id)).revision).toBe(saved.revision);
    const invalid=await request(app.getHttpServer()).patch('/api'+base+'/'+row.id+'/content').set('Authorization','Bearer '+parent.token).set('content-type','application/json').send('{private malformed content').expect(400);expect(invalid.body.error.code).toBe('invalid_json');expect(JSON.stringify(invalid.body)).not.toContain('private malformed content');
  });
  it('records direct editing as answer exposure for the author while a child keeps an independent first attempt',async()=>{
    const{row}=await ready(true),content=sourceCourseFixture(row.sources.map((source:any)=>({sourceKey:source.key,text:source.text})));
    const saved=await call('patch',base+'/'+row.id+'/content',{expectedRevision:row.revision,requestKey:randomUUID(),content}),active=await confirm(saved),lessonId=active.lessons[0].id;
    const parentSession=await call('post','/learning/classroom/sessions',{sourceCourseId:row.id,lessonId}),childSession=await call('post','/learning/classroom/sessions',{sourceCourseId:row.id,lessonId},learner);
    expect(parentSession.authoringAnswerExposure).toBe(true);expect(childSession.authoringAnswerExposure).toBeUndefined();
    const parentAnswer=await call('post','/learning/classroom/sessions/'+parentSession.id+'/answers',{questionId:parentSession.lesson.questions[0].id,selectedIndex:0,hintUsed:false,requestKey:randomUUID()}),childAnswer=await call('post','/learning/classroom/sessions/'+childSession.id+'/answers',{questionId:childSession.lesson.questions[0].id,selectedIndex:0,hintUsed:false,requestKey:randomUUID()},learner);
    const{classroomPracticeSummary}=require('@study-agent/contracts');expect(classroomPracticeSummary(parentSession.lesson.questions,parentAnswer.answers).independentCorrect).toBe(0);expect(classroomPracticeSummary(childSession.lesson.questions,childAnswer.answers).independentCorrect).toBe(1);
  });
  it('blocks complete editing after source changes or guardian revocation',async()=>{
    const{row,source}=await ready(),draft=await call('post',base+'/'+row.id+'/authoring');await store.transaction(()=>{store.find('studioSourceMaterials',{id:source.material.id}).pages[0].text='这份来源发生了变化，需要重新选页核对。';});
    await call('patch',base+'/'+row.id+'/content',{expectedRevision:row.revision,requestKey:randomUUID(),content:draft.content},parent,409);
    const child=await ready(true),childDraft=await call('post',base+'/'+child.row.id+'/authoring');await store.transaction(()=>{store.find('bindings',{parentUserId:parent.user.id,studentId}).status='inactive';});
    await call('post',base+'/'+child.row.id+'/authoring',undefined,parent,403);await call('patch',base+'/'+child.row.id+'/content',{expectedRevision:childDraft.revision,requestKey:randomUUID(),content:childDraft.content},parent,403);
    await store.transaction(()=>{store.find('bindings',{parentUserId:parent.user.id,studentId}).status='active';});
  });
  it('preserves initial input and initial teaching when AI revises, while public review summaries hide answer details',async()=>{
    const source=await text(),command={...generation(source),goal:'核对有限观察与解释 [review-revise]'},draft=await call('post',base,command),mock=model();await worker.runNext();mock.mockRestore();const row=await call('get',base+'/'+draft.id);
    expect(row.generation).toMatchObject({stage:'completed',plannedLessons:2,draftedLessons:2,reviewedLessons:2,reviewCurrent:true});expect(row.generation.reviews[0]).toMatchObject({decision:'revised',issueCount:1});
    await store.requestContext(()=>{const state=store.find('sourceCourses',{id:row.id}).generation,{generationDigest}=require('../../../dist/apps/api/src/modules/learning/source-course-pipeline.js');expect(state.outlineAt).toMatch(/^\d{4}-/);expect(state.outlineFingerprint).toBe(generationDigest(state.outline));expect(state.lessons.every((lesson:any)=>lesson.draftedAt&&lesson.draftFingerprint===generationDigest(lesson.initial))).toBe(true);});
    const manuscript=await call('post',base+'/'+row.id+'/authoring');expect(manuscript.content.lessons[0].concept).not.toBe(manuscript.originalContent.lessons[0].concept);expect(JSON.stringify(row)).not.toContain(manuscript.generationReviews[0].review.issues[0].detail);
    const edited=await call('patch',base+'/'+row.id,{expectedRevision:row.revision,requestKey:randomUUID(),title:'后来审阅的名称',goal:'后来调整的学习目标，原始生成目标不能被覆盖。',lessons:row.lessons.map((lesson:any)=>({id:lesson.id,title:lesson.title,objective:lesson.objective}))});
    expect(edited.generationInput.goal).toBe(command.goal);expect(edited.input.goal).not.toBe(command.goal);expect(edited.generation.reviewCurrent).toBe(false);expect((await call('post',base+'/'+row.id+'/authoring')).generationInput.goal).toBe(command.goal);
    await store.requestContext(()=>{const{portableRecords,accountRecords}=require('../../../dist/apps/api/src/modules/privacy/privacy-records.js');const portable=portableRecords(accountRecords(store,parent.user.id,parent.user.principal),parent.user.id).sourceCourses.find((course:any)=>course.id===row.id);expect(portable.generation).not.toHaveProperty('lessons');expect(JSON.stringify(portable)).not.toContain(manuscript.generationReviews[0].review.issues[0].detail);});
  });
  it('keeps uncertain checks explicit and rejects fabricated review excerpts without releasing a partial course',async()=>{
    const source=await text(),draft=await call('post',base,{...generation(source),goal:'核对来源能支持的范围 [review-uncertain]'}),mock=model();await worker.runNext();mock.mockRestore();const uncertain=await call('get',base+'/'+draft.id);expect(uncertain.status).toBe('ready');expect(uncertain.generation.reviews.every((review:any)=>review.decision==='uncertain')).toBe(true);expect(uncertain.contentReview).toBe('pending');expect((await confirm(uncertain)).formalMeasurementEligible).toBe(false);
    const rejected=await call('post',base,generation(source)),invalid=vi.spyOn(provider,'structured').mockImplementation(async(input:any,_schema:any,check:any)=>{const value=sourceCoursePipelineFixture(JSON.parse(input.context),input.message);if(JSON.parse(input.message).stage==='review'){value.decision='uncertain';value.issues=[{field:'concept',questionIndex:null,quote:'这是课文里不存在的复核摘录',detail:'需要检查的说明。'}];}return{...check(value),modelId:input.modelId,modelName:'test-only'};});await worker.runNext();invalid.mockRestore();const failed=await call('get',base+'/'+rejected.id);expect(failed.status).toBe('failed');expect(failed.task.errorCode).toBe('course_reviewing_failed');expect(failed.lessons).toEqual([]);expect(failed.generation.draftedLessons).toBe(1);expect(failed.generation.reviewedLessons).toBe(0);
  });
  it('applies individual question repairs without changing the first draft or accepting an unchanged repair',async()=>{
    const source=await text(),draft=await call('post',base,generation(source));
    const patched=vi.spyOn(provider,'structured').mockImplementation(async(input:any,_schema:any,check:any)=>{const stage=JSON.parse(input.message),value=sourceCoursePipelineFixture(JSON.parse(input.context),input.message);
      if(stage.stage==='review'&&stage.lessonIndex===0)Object.assign(value,{decision:'revised',issues:[{field:'questions',questionIndex:0,quote:stage.lesson.questions[0].explanation,detail:'明确区分观察与解释，保留原始证据。'}],changes:null,questionChanges:[{questionIndex:0,question:{...stage.lesson.questions[0],explanation:'核对后应保留实际观察，再比较替代解释。'}}]});
      return{...check(value),modelId:input.modelId,modelName:'test-only'};});
    await worker.runNext();patched.mockRestore();const row=await call('get',base+'/'+draft.id),manuscript=await call('post',base+'/'+row.id+'/authoring');expect(row.status).toBe('ready');expect(manuscript.content.lessons[0].questions[0].explanation).toBe('核对后应保留实际观察，再比较替代解释。');expect(manuscript.originalContent.lessons[0].questions[0].explanation).not.toBe(manuscript.content.lessons[0].questions[0].explanation);
    await store.requestContext(()=>{const cached=structuredClone(store.find('sourceCourses',{id:row.id})),{checkCourseReview,savedReviewPayload}=require('../../../dist/apps/api/src/modules/learning/source-course-pipeline.js'),lesson=cached.generation.lessons[0],valid=savedReviewPayload(lesson.initial,lesson.final,lesson.review);expect(checkCourseReview(valid,cached,0).lesson).toEqual(lesson.final);expect(()=>checkCourseReview({...valid,changes:null,questionChanges:[{questionIndex:0,question:lesson.initial.questions[0]}]},cached,0)).toThrow('实际修订');expect(()=>checkCourseReview({...valid,questionChanges:[{questionIndex:0,question:lesson.final.questions[0]}]},cached,0)).toThrow('不能同时使用');});
  });
  it('rejects internal source identifiers in teaching and refuses an incompatible cached retry',async()=>{
    const source=await text(),draft=await call('post',base,generation(source)),leaked=vi.spyOn(provider,'structured').mockImplementation(async(input:any,_schema:any,check:any)=>{const stage=JSON.parse(input.message),context=JSON.parse(input.context),value=sourceCoursePipelineFixture(context,input.message);if(stage.stage==='lesson')value.concept+=' 内部来源 '+context.sources[0].sourceKey;return{...check(value),modelId:input.modelId,modelName:'test-only'};});
    await worker.runNext();leaked.mockRestore();const failed=await call('get',base+'/'+draft.id);expect(failed.status).toBe('failed');expect(failed.task.errorCode).toBe('course_writing_failed');expect(failed.generation.draftedLessons).toBe(0);expect(failed.lessons).toEqual([]);
    await store.transaction(()=>{store.find('sourceCourses',{id:failed.id}).generation.inputFingerprint='invalid-input-fingerprint';});await call('post',base+'/'+failed.id+'/retry',{expectedRevision:failed.revision,expectedTaskVersion:failed.task.version,requestKey:randomUUID()},parent,409);const retained=await call('get',base+'/'+failed.id);expect(retained.task.generation).toBe(failed.task.generation);expect(retained.status).toBe('failed');
  });
  it('restarts after a later lesson fails, reuses completed checkpoints and keeps Auto pinned to the original model',async()=>{
    const source=await text(),draft=await call('post',base,generation(source));const failing=vi.spyOn(provider,'structured').mockImplementation(async(input:any,_schema:any,check:any)=>{const stage=JSON.parse(input.message);if(stage.stage==='lesson'&&stage.lessonIndex===1)throw new Error('isolated provider failure');return{...check(sourceCoursePipelineFixture(JSON.parse(input.context),input.message)),modelId:input.modelId,modelName:'test-only'};});
    await worker.runNext();failing.mockRestore();let row=await call('get',base+'/'+draft.id);expect(row.status).toBe('failed');expect(row.generation).toMatchObject({draftedLessons:1,reviewedLessons:1});expect(row.lessons).toEqual([]);const pinned=row.generation.modelId,priorDefault=process.env.XIAOJIU_CHAT_DEFAULT_MODEL;
    const reorder=(value:any):any=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).reverse().map(key=>[key,reorder(value[key])])):value;
    await store.transaction(()=>{const current=store.find('sourceCourses',{id:row.id});current.generation=reorder(current.generation);current.sources=reorder(current.sources);current.targetGoals=reorder(current.targetGoals);});
    await app.close();process.env.XIAOJIU_CHAT_DEFAULT_MODEL=pinned==='gpt-6.1-sol'?'deepseek-v4-flash':'gpt-6.1-sol';await boot();
    try{row=await call('get',base+'/'+row.id);await call('post',base+'/'+row.id+'/retry',{expectedRevision:row.revision,expectedTaskVersion:row.task.version,requestKey:randomUUID()});const resumed=model();await worker.runNext();expect(resumed).toHaveBeenCalledTimes(2);expect(resumed.mock.calls.every((args:any)=>args[0].modelId===pinned&&JSON.parse(args[0].message).lessonIndex===1)).toBe(true);resumed.mockRestore();const ready=await call('get',base+'/'+row.id);expect(ready.status).toBe('ready');expect(ready.generation.reviewedLessons).toBe(2);expect(ready.generation.modelId).toBe(pinned);expect(ready.task.generation).toBe(2);}
    finally{await app.close();if(priorDefault===undefined)delete process.env.XIAOJIU_CHAT_DEFAULT_MODEL;else process.env.XIAOJIU_CHAT_DEFAULT_MODEL=priorDefault;await boot();}
  });
  it('rejects an expired worker checkpoint while a new worker resumes the same unfinished lesson',async()=>{
    const source=await text(),draft=await call('post',base,generation(source));let releaseOld!:()=>void,releaseNew!:()=>void,enteredOld!:()=>void,enteredNew!:()=>void,heldCount=0;
    const oldHeld=new Promise<void>(resolve=>releaseOld=resolve),newHeld=new Promise<void>(resolve=>releaseNew=resolve),oldArrival=new Promise<void>(resolve=>enteredOld=resolve),newArrival=new Promise<void>(resolve=>enteredNew=resolve);
    const mocked=vi.spyOn(provider,'structured').mockImplementation(async(input:any,_schema:any,check:any)=>{const task=JSON.parse(input.message),value=sourceCoursePipelineFixture(JSON.parse(input.context),input.message);if(task.stage==='lesson'&&task.lessonIndex===1){heldCount++;if(heldCount===1){enteredOld();await oldHeld;value.concept='过期worker的讲解不能覆盖新租约结果。';}else if(heldCount===2){enteredNew();await newHeld;}}return{...check(value),modelId:input.modelId,modelName:'test-only'};});
    const first=worker.runNext();await oldArrival;const future=Date.now()+60000,clock=vi.spyOn(Date,'now').mockReturnValue(future);
    const{SourceCourseWorkerService}=require('../../../dist/apps/api/src/modules/learning/source-course-worker.service.js'),{StudentsService}=require('../../../dist/apps/api/src/modules/students/students.service.js'),{XiaojiuModelsService}=require('../../../dist/apps/api/src/modules/ai/xiaojiu-models.service.js');const second=new SourceCourseWorkerService(store,app.get(StudentsService),provider,app.get(XiaojiuModelsService));const next=second.runNext();
    try{await newArrival;releaseOld();await first;const retained=await call('get',base+'/'+draft.id);expect(retained.generation).toMatchObject({draftedLessons:1,reviewedLessons:1});expect(retained.lessons).toEqual([]);releaseNew();await next;const ready=await call('get',base+'/'+draft.id);expect(ready.status).toBe('ready');expect(JSON.stringify(ready)).not.toContain('过期worker');expect(ready.task.state).toBe('succeeded');}
    finally{releaseOld();releaseNew();await Promise.allSettled([first,next]);clock.mockRestore();mocked.mockRestore();await second.onModuleDestroy();}
  });
  it('handles six complete lessons and legacy provenance without inventing original inputs',async()=>{
    const source=await text(),draft=await call('post',base,{...generation(source),goal:'六课完整路线 [six-lessons]'}),six=model();await worker.runNext();expect(six).toHaveBeenCalledTimes(13);six.mockRestore();const completed=await call('get',base+'/'+draft.id);expect(completed.lessons).toHaveLength(6);expect(completed.generation).toMatchObject({draftedLessons:6,reviewedLessons:6});
    const queued=await call('post',base,generation(source));await store.transaction(()=>{delete store.find('sourceCourses',{id:queued.id}).generation;});const legacy=model();await worker.runNext();legacy.mockRestore();expect((await call('get',base+'/'+queued.id)).generation.inputCapture).toBe('worker-start');
    await store.transaction(()=>{delete store.find('sourceCourses',{id:queued.id}).generation;store.find('sourceCourses',{id:queued.id}).input.goal='旧记录后来修改的目标，不能据此猜测原始输入。';});const old=await call('get',base+'/'+queued.id);expect(old.generation).toBeNull();expect(old.generationInput).toBeNull();expect((await call('post',base+'/'+queued.id+'/authoring')).generationInput).toBeNull();
  });
  it('closing an account retains a shared child published course and prevents a deleted in-flight draft from reappearing',async()=>{
    const retained=await store.requestContext(()=>structuredClone(store.select('sourceCourses',{studentId,status:'active'})[0]));expect(retained).toBeTruthy();
    await store.transaction(()=>store.append('bindings',{id:randomUUID(),parentUserId:other.user.id,studentId,relation:'guardian',status:'active'}));
    const source=await text(),draft=await call('post',base,generation(source));
    const preview=await call('get','/privacy/account/deletion-preview');expect(preview.retainedChildren.map((child:any)=>child.id)).toContain(studentId);
    await call('post','/privacy/account/delete',{credential:'Source-course-test-only',requestKey:randomUUID(),confirmation:preview.confirmation,fingerprint:preview.fingerprint});
    expect(await worker.runNext()).toBe(true);await store.requestContext(()=>{expect(store.find('sourceCourses',{id:draft.id})).toBeUndefined();expect(store.find('sourceCourses',{id:retained.id}).ownerUserId).toBe('deleted-account');});
    const shared=await call('get',base+'/'+retained.id,undefined,other);expect(shared.status).toBe('active');expect(shared.permissions.manage).toBe(false);
    expect((await call('get',base+'?studentId='+studentId+'&subject=math',undefined,other)).some((course:any)=>course.id===shared.id)).toBe(true);
    await call('patch',base+'/'+retained.id,{},other,403);
  });
});

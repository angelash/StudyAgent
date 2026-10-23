import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const {sourceCourseFixture}=require('../../../../../scripts/qa/source-course-fixture.cjs');
describe('source-backed courses, real durable tasks and frozen classroom evidence',()=>{
  const directory=mkdtempSync(join(tmpdir(),'study-source-course-')),names=['NODE_ENV','STUDY_STORAGE','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','STUDY_PDF_STRUCTURE_MODEL','XIAOJIU_CHAT_ENABLED']as const;
  const prior=Object.fromEntries(names.map(name=>[name,process.env[name]]));let app:any,store:any,worker:any,provider:any,parent:any,other:any,learner:any,studentId:string;
  const base='/learning/source-courses';
  async function call(method:'get'|'post'|'patch',path:string,body?:unknown,actor=parent,status=method==='post'?201:200){let query=request(app.getHttpServer())[method]('/api'+path);if(actor)query=query.set('Authorization','Bearer '+actor.token);if(body!==undefined)query=query.send(body as object);return(await query.expect(status)).body.data;}
  async function boot(){const{AppModule}=require('../../../dist/apps/api/src/app.module.js'),{InMemoryStoreService}=require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js'),{SourceCourseWorkerService}=require('../../../dist/apps/api/src/modules/learning/source-course-worker.service.js'),{XiaojiuChatService}=require('../../../dist/apps/api/src/modules/ai/xiaojiu-chat.service.js');app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api');await app.init();store=app.get(InMemoryStoreService);worker=app.get(SourceCourseWorkerService);provider=app.get(XiaojiuChatService);}
  function model(){return vi.spyOn(provider,'structured').mockImplementation(async(input:any,_schema:any,check:any)=>({...check(sourceCourseFixture(JSON.parse(input.context).sources)),modelId:'test-model',modelName:'test-only'}));}
  beforeAll(async()=>{Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:'sqlite',STUDY_DATA_DIR:directory,STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'false',STUDY_PDF_STRUCTURE_MODEL:'false',XIAOJIU_CHAT_ENABLED:'false'});await boot();
    parent=await call('post','/auth/register',{principal:'source-parent@test',credential:'Source-course-test-only'},null);other=await call('post','/auth/register',{principal:'source-other@test',credential:'Source-course-test-only'},null);
    studentId=(await call('post','/students',{nickname:'资料学习',grade:4,preferredSessionMinutes:15,defaultVersionMap:{math:'',chinese:'',english:''}})).profile.id;
    const access=await call('post',`/students/${studentId}/learning-access`,{enabled:true,expectedVersion:0,requestKey:randomUUID(),reason:'验证资料课程学生入口'}),code=await call('post',`/students/${studentId}/learning-access/codes`,{expectedVersion:access.version,requestKey:randomUUID()});learner=await call('post','/auth/learning-code',{code:code.code},null);
  });
  afterAll(async()=>{vi.restoreAllMocks();await app?.close();for(const[name,value]of Object.entries(prior)){if(value===undefined)delete process.env[name];else process.env[name]=value;}rmSync(directory,{recursive:true,force:true});});
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
    await call('post',base,{...command,title:'不同命令'},parent,409);await app.close();await boot();const mock=model();await worker.runNext();expect(mock).toHaveBeenCalledTimes(1);mock.mockRestore();
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
    const source=await text(),draft=await call('post',base,generation(source));const mock=vi.spyOn(provider,'structured').mockImplementation(async(input:any,_schema:any,check:any)=>{const fixture=sourceCourseFixture(JSON.parse(input.context).sources);fixture.lessons[0].citations[0].quote='这句话从未出现在所选资料的正文里面。';return check(fixture);});
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
    const mock=vi.spyOn(provider,'structured').mockImplementation(async(input:any,_schema:any,check:any)=>{entered();await held;return{...check(sourceCourseFixture(JSON.parse(input.context).sources)),modelId:'test',modelName:'test-only'};});
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
    const mock=vi.spyOn(provider,'structured').mockImplementation(async(input:any,_schema:any,check:any)=>{entered();await held;return{...check(sourceCourseFixture(JSON.parse(input.context).sources)),modelId:'test',modelName:'test-only'};});const running=worker.runNext();await arrived;
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

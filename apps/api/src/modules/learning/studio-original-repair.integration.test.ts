import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {afterAll,afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import request from 'supertest';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,renameSync,rmSync,unlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Pool} from 'pg';

describe('durable authorized PDF original repair and internal cancellation cleanup',()=>{
 const directory=mkdtempSync(join(tmpdir(),'study-product-repair-')),data=join(directory,'source'),credential='Repair-fixture-only-20261025';
 const names=['NODE_ENV','STUDY_STORAGE','DATABASE_URL','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','STUDY_PDF_STRUCTURE_MODEL','XIAOJIU_CHAT_ENABLED']as const,prior=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex'),base='/learning/source-courses/materials/',uploads='/learning/material-uploads';
 let app:any,store:any,worker:any,maintenance:any,processor:any,parent:any,other:any,pdf:Buffer,large:Buffer,pg:Pool|undefined;const databases:string[]=[];
 async function boot(){const{AppModule}=require('../../../dist/apps/api/src/app.module.js');app=await NestFactory.create(AppModule,{logger:false});require('../../../dist/apps/api/src/common/http-body.js').configureJsonBody(app);app.setGlobalPrefix('api');await app.init();store=app.get(require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js').InMemoryStoreService);worker=app.get(require('../../../dist/apps/api/src/modules/learning/studio-original-repair-worker.service.js').StudioOriginalRepairWorkerService);maintenance=app.get(require('../../../dist/apps/api/src/modules/learning/studio-material-maintenance.service.js').StudioMaterialMaintenanceService);processor=app.get(require('../../../dist/apps/api/src/modules/processing/processing-worker.service.js').ProcessingWorkerService);worker.pendingDelayMs=2;}
 async function call(method:'get'|'post'|'put',path:string,body?:unknown,actor=parent,status=method==='post'?201:200){let q=request(app.getHttpServer())[method]('/api'+path);if(actor)q=q.set('Authorization','Bearer '+actor.token);if(Buffer.isBuffer(body))q=q.set('content-type','application/octet-stream').send(body);else if(body!==undefined)q=q.send(body as object);return(await q.expect(status)).body.data;}
 async function upload(bytes:Buffer,scope={},actor=parent){let row=await call('post',uploads,{name:'same-name.pdf',size:bytes.length,sha256:digest(bytes),requestKey:randomUUID(),...scope},actor);for(let index=0;index<Math.ceil(bytes.length/row.chunkSize);index++)row=await call('put',uploads+'/'+row.id+'/chunks/'+index,bytes.subarray(index*row.chunkSize,(index+1)*row.chunkSize),actor);return row;}
 async function fixture(options:{missing?:boolean;large?:boolean;studentId?:string;actor?:any}={}){
  const actor=options.actor??parent,bytes=Buffer.concat([options.large?large:pdf,Buffer.from('\n% anonymous case '+randomUUID())]),sha=digest(bytes),id='studio_material_'+randomUUID(),now=new Date().toISOString();
  const material={id,ownerUserId:actor.user.id,studentId:options.studentId??null,subject:options.studentId?'math':null,kind:'pdf',filename:'same-name.pdf',title:'Anonymous original repair',sha256:sha,byteSize:bytes.length,pageCount:options.large?120:3,pages:[{page:1,text:'Keep this exact saved text and original condition.'}],hasPageImages:false,status:'failed',createdAt:now,updatedAt:now};
  await store.transaction(async()=>{await require('../../../dist/apps/api/src/modules/learning/studio-material-storage.js').persistStudioMaterial(store,sha,bytes);store.append('studioSourceMaterials',material);});
  const file=join(data,'studio-materials',sha+'.pdf');if(options.missing)unlinkSync(file);else writeFileSync(file,'known damaged original');
  const pending=await upload(bytes,options.studentId?{studentId:options.studentId,subject:'math'}:{},actor),current=await call('get',base+id,undefined,actor);
  const command={version:current.version,uploadId:pending.id,requestKey:randomUUID()};return{actor,id,bytes,sha,file,material,upload:pending,version:current.version,command,path:base+id+'/repairs'};
 }
 const start=(f:Awaited<ReturnType<typeof fixture>>)=>call('post',f.path,f.command,f.actor);
 async function runTo(id:string){for(let i=0;i<100;i++){const task=await store.tasks.get(id);if(task&&['succeeded','failed','cancelled'].includes(task.state))return task;if(!await worker.runNext())break;}return store.tasks.get(id);}
 async function saved(id:string){return store.requestContext(()=>structuredClone(store.find('studioOriginalRepairs',{id})));}
 async function completed(f:Awaited<ReturnType<typeof fixture>>,id:string){const row=await saved(id);expect((await runTo(row.taskId)).state).toBe('succeeded');const result=await call('get',f.path+'/'+id,undefined,f.actor);expect(result.status).toBe('completed');expect(result.receipt).toMatchObject({sha256:f.sha,size:f.bytes.length});expect(readFileSync(f.file).equals(f.bytes)).toBe(true);expect((await call('get',base+f.id,undefined,f.actor)).version).toBe(f.version);return result;}
 async function cancel(f:Awaited<ReturnType<typeof fixture>>,id:string){const view=await call('get',f.path+'/'+id,undefined,f.actor);return call('post',f.path+'/'+id+'/cancel',{expectedRevision:view.revision,requestKey:randomUUID()},f.actor);}
 beforeAll(async()=>{
  const location=process.env.STUDY_TEST_ORIGINAL_REPAIR_POSTGRES_URL;
  if(location){const probe=new Pool({connectionString:location});try{expect((await probe.query('SELECT current_database() AS name,current_user AS owner')).rows[0]).toEqual({name:'study_agent_qa',owner:'study_agent_app'});}finally{await probe.end();}if(!process.env.STUDY_TEST_POSTGRES_ADMIN_URL)throw new Error('Isolated QA administration required');pg=new Pool({connectionString:process.env.STUDY_TEST_POSTGRES_ADMIN_URL});const name='study_qa_repair_'+randomUUID().replace(/-/g,'');await pg.query('CREATE DATABASE "'+name+'" OWNER study_agent_app');databases.push(name);const url=new URL(location);url.pathname='/'+name;process.env.DATABASE_URL=url.toString();}
  Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:location?'postgres':'sqlite',STUDY_DATA_DIR:data,STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'false',STUDY_PDF_STRUCTURE_MODEL:'false',XIAOJIU_CHAT_ENABLED:'false'});await boot();parent=await call('post','/auth/register',{principal:'repair-parent@test',credential},null);other=await call('post','/auth/register',{principal:'repair-other@test',credential},null);
  execFileSync(process.env.STUDY_PYTHON??(process.platform==='win32'?'python':'python3'),['-X','utf8','-c','import fitz,random,sys\nfor count,name in [(3,sys.argv[1]),(120,sys.argv[2])]:\n d=fitz.open()\n for i in range(count):\n  p=d.new_page();p.insert_text((40,80),"Page "+str(i+1)+". Original condition and counterexample.")\n  if count==120 and i==0:p.insert_image(fitz.Rect(40,100,500,650),pixmap=fitz.Pixmap(fitz.csRGB,2100,2100,random.Random(17).randbytes(2100*2100*3),False))\n d.save(name);d.close()',join(directory,'small.pdf'),join(directory,'large.pdf')],{windowsHide:true,timeout:30000});pdf=readFileSync(join(directory,'small.pdf'));large=readFileSync(join(directory,'large.pdf'));expect(large.length).toBeGreaterThan(10*1024*1024);
 });
 afterEach(()=>{worker.afterPhase=undefined;vi.restoreAllMocks();});
 afterAll(async()=>{await app?.close();if(pg){try{for(const name of databases){if(!/^study_qa_repair_[a-f0-9]{32}$/.test(name))throw new Error('Unsafe repair QA database');await pg.query('DROP DATABASE "'+name+'" WITH (FORCE)');}}finally{await pg.end();}}for(const[name,value]of Object.entries(prior)){if(value===undefined)delete process.env[name];else process.env[name]=value;}rmSync(directory,{recursive:true,force:true});});

 it('repairs missing and damaged originals through real endpoints, survives database reopen and replays one receipt',async()=>{
  for(const missing of [true,false]){const f=await fixture({missing}),repair=await start(f);expect(await start(f)).toMatchObject({id:repair.id,status:'queued'});await app.close();await boot();const result=await completed(f,repair.id);expect(await start(f)).toEqual(result);const dto=JSON.stringify(result);for(const secret of ['baseline','identity','authorization','requestKey',data,'bindingHash'])expect(dto).not.toContain(secret);expect((await call('get',f.path)).some((row:any)=>row.id===repair.id)).toBe(true);}
 });
 it('rejects wrong files, other upload owners, changed versions and request-key mutation without modifying old bytes',async()=>{
  const f=await fixture(),wrong=await upload(Buffer.concat([pdf,Buffer.from('wrong')])),foreign=await upload(f.bytes,{},other);
  await call('post',f.path,{...f.command,uploadId:wrong.id},parent,400);await call('post',f.path,{...f.command,uploadId:foreign.id},parent,403);await call('post',f.path,{...f.command,version:'0'.repeat(64)},parent,409);await call('post',f.path,f.command,other,403);
  const repair=await start(f);await call('post',f.path,{...f.command,uploadId:wrong.id},parent,409);expect(readFileSync(f.file,'utf8')).toBe('known damaged original');await completed(f,repair.id);
 });
 it('protects reserved chunks past expiry against completion, cancellation, deduplication and physical maintenance',async()=>{
  const f=await fixture(),repair=await start(f);await store.transaction(()=>{store.find('studioMaterialUploads',{id:f.upload.id}).expiresAt='2020-01-01T00:00:00Z';});
  await call('post',uploads+'/'+f.upload.id+'/complete',{},parent,409);await call('post',uploads+'/'+f.upload.id+'/cancel',{expectedRevision:f.upload.revision},parent,409);
  expect((await call('get',uploads)).find((row:any)=>row.id===f.upload.id).repairId).toBe(repair.id);
  await maintenance.sweep();const task=await store.transaction(()=>maintenance.schedule('upload',f.upload.id,parent.user.id,'reserved-repair-test'));for(let i=0;i<100;i++){if((await store.tasks.get(task)).state==='succeeded')break;await maintenance.runNext(false);}
  expect((await store.tasks.get(task)).result.retained).toBe(true);expect(existsSync(join(data,'studio-uploads',f.upload.id,'0-'+f.upload.chunks[0].sha256))).toBe(true);
  await call('post',uploads,{name:'new.pdf',size:f.bytes.length,sha256:f.sha,requestKey:randomUUID()},parent,409);await completed(f,repair.id);
 });
 it('blocks processing, file checks and an actual database backup while repairing',async()=>{
  const f=await fixture(),repair=await start(f);
  await call('post',base+f.id+'/files/check',{version:f.version,requestKey:randomUUID()},parent,409);
  await call('post','/learning/studio/materials/'+f.id+'/process/retry',{expectedUpdatedAt:f.material.updatedAt,requestKey:randomUUID()},parent,409);
  const rows=await store.requestContext(()=>[{collection:'studioMaterialAssets',body:store.find('studioMaterialAssets',{id:f.sha})}]);
  expect(()=>require('../../../../../scripts/operations/backup.cjs').files.referencesFromRecords(rows)).toThrow('material_original_repair_active');
  const destination=join(directory,'refused-backup-'+randomUUID());
  const backup=process.env.STUDY_STORAGE==='postgres'?require('../../../../../scripts/operations/postgres-backup.cjs').createPostgresBundle({connectionString:process.env.DATABASE_URL,pgBin:process.env.STUDY_TEST_PG_BIN,dataDir:data,destination}):require('../../../../../scripts/operations/backup.cjs').createBundle({dataDir:data,destination});
  await expect(backup).rejects.toThrow('material_original_repair_active');await completed(f,repair.id);
 });
 it('preserves a file installed after the queued request and retains the original immutable baseline on retry',async()=>{
  const f=await fixture(),repair=await start(f),row=await saved(repair.id);renameSync(f.file,join(directory,'known-before-'+randomUUID()));writeFileSync(f.file,'new unrelated original');
  expect((await runTo(row.taskId)).errorCode).toBe('original_repair_baseline_changed');expect(readFileSync(f.file,'utf8')).toBe('new unrelated original');
  const before=(await saved(repair.id)).baseline,view=await call('get',f.path+'/'+repair.id);await call('post',f.path+'/'+repair.id+'/retry',{expectedRevision:view.revision,requestKey:randomUUID()});expect((await saved(repair.id)).baseline).toEqual(before);expect((await runTo(row.taskId)).state).toBe('failed');
  await cancel(f,repair.id);await worker.runNext();expect((await call('get',f.path+'/'+repair.id)).status).toBe('cancelled');expect(readFileSync(f.file,'utf8')).toBe('new unrelated original');
 });
 it('waits for live source readers without exhausting attempts and resumes after they release',async()=>{
  const f=await fixture(),repair=await start(f),row=await saved(repair.id),release=await require('../../../dist/apps/api/src/infrastructure/studio-file-coordination.js').acquireStudioFileLease(data,'source',f.sha);
  try{for(let i=0;i<7;i++){await worker.runNext();const task=await store.tasks.get(row.taskId);expect(task.state).toBe('retry_wait');expect(task.attempts).toBe(0);await new Promise(resolve=>setTimeout(resolve,3));}}finally{await release();}
  await new Promise(resolve=>setTimeout(resolve,3));await completed(f,repair.id);
 });
 it('cancels queued work transactionally, cleans after restart and releases the source and upload',async()=>{
  const f=await fixture(),repair=await start(f),view=await call('get',f.path+'/'+repair.id),command={expectedRevision:view.revision,requestKey:randomUUID()};
  expect((await call('post',f.path+'/'+repair.id+'/cancel',command)).status).toBe('cleaning');expect((await call('post',f.path+'/'+repair.id+'/cancel',command)).status).toBe('cleaning');
  await app.close();await boot();await worker.runNext();expect((await call('get',f.path+'/'+repair.id)).status).toBe('cancelled');expect(readFileSync(f.file,'utf8')).toBe('known damaged original');
  await store.requestContext(()=>{expect(store.find('studioMaterialAssets',{id:f.sha})).toMatchObject({state:'available',generation:3});expect(store.find('studioMaterialUploads',{id:f.upload.id}).status).toBe('cancelled');});
 });
 it('does not roll back a correct file when cancellation happens after publication',async()=>{
  const f=await fixture(),repair=await start(f);
  worker.afterPhase=async(phase:string)=>{if(phase==='original_published'){worker.afterPhase=undefined;await cancel(f,repair.id);}};
  await worker.runNext();expect(readFileSync(f.file).equals(f.bytes)).toBe(true);await worker.runNext();expect((await call('get',f.path+'/'+repair.id)).status).toBe('cancelled');expect(readFileSync(f.file).equals(f.bytes)).toBe(true);
 });
 it('finishes file publication after a domain failure without using deleted upload bytes or changing saved content',async()=>{
  const f=await fixture(),repair=await start(f),row=await saved(repair.id);worker.afterPhase=async(phase:string)=>{if(phase==='before_domain_complete')throw new Error('isolated domain failure');};
  await worker.runNext();expect(readFileSync(f.file).equals(f.bytes)).toBe(true);expect((await store.tasks.get(row.taskId)).state).toBe('failed');worker.afterPhase=undefined;
  for(const chunk of f.upload.chunks)unlinkSync(join(data,'studio-uploads',f.upload.id,`${chunk.index}-${chunk.sha256}`));const view=await call('get',f.path+'/'+repair.id);await call('post',f.path+'/'+repair.id+'/retry',{expectedRevision:view.revision,requestKey:randomUUID()});await completed(f,repair.id);
 });
 it('reaps an inaccessible owner without publishing, even when business repair and upload records are deleted',async()=>{
  const f=await fixture(),repair=await start(f);await store.transaction(()=>{store.remove('studioOriginalRepairs',{id:repair.id});store.remove('studioMaterialUploads',{id:f.upload.id});});
  await worker.runNext();expect(readFileSync(f.file,'utf8')).toBe('known damaged original');await store.requestContext(()=>{const asset=store.find('studioMaterialAssets',{id:f.sha});expect(asset.state).toBe('available');expect(asset.repair).toBeUndefined();});
 });
 it('uses an actual learning-code identity and stops publication after its original guardian authorization is revoked',async()=>{
  const studentId=(await call('post','/students',{nickname:'恢复授权核查',grade:4,preferredSessionMinutes:15,defaultVersionMap:{math:'',chinese:'',english:''}})).profile.id;
  const invite=await call('post',`/students/${studentId}/invitations`,{recipientPrincipal:other.user.principal});await call('post',`/parents/${other.user.id}/bindings`,{studentId,inviteToken:invite.token},other);
  const access=await call('post',`/students/${studentId}/learning-access`,{enabled:true,expectedVersion:0,requestKey:randomUUID(),reason:'核查原件恢复授权'}),code=await call('post',`/students/${studentId}/learning-access/codes`,{expectedVersion:access.version,requestKey:randomUUID()}),learner=await call('post','/auth/learning-code',{code:code.code},null);
  const f=await fixture({studentId,actor:learner}),repair=await start(f);expect((await call('get',f.path+'/'+repair.id,undefined,other)).canManage).toBe(false);
  await call('post',f.path+'/'+repair.id+'/cancel',{expectedRevision:repair.revision,requestKey:randomUUID()},other,403);
  worker.afterPhase=async(phase:string)=>{if(phase==='candidate_synced'){worker.afterPhase=undefined;await store.transaction(()=>{store.find('bindings',{studentId,parentUserId:parent.user.id}).status='revoked';});}};
  await worker.runNext();expect(readFileSync(f.file,'utf8')).toBe('known damaged original');await worker.runNext();expect((await call('get',f.path+'/'+repair.id,undefined,other)).status).toBe('cancelled');
  await call('get',f.path+'/'+repair.id,undefined,learner,401);expect(readFileSync(f.file,'utf8')).toBe('known damaged original');
 });
 it('continues technical cleanup after a real child privacy deletion removes the business repair records',async()=>{
  const studentId=(await call('post','/students',{nickname:'资料删除核查',grade:4,preferredSessionMinutes:15,defaultVersionMap:{math:'',chinese:'',english:''}})).profile.id;
  const f=await fixture({studentId}),repair=await start(f);
  worker.afterPhase=async(phase:string)=>{if(phase==='candidate_published'){
   worker.afterPhase=undefined;const preview=await call('get',`/privacy/students/${studentId}/deletion-preview`);
   await call('post',`/privacy/students/${studentId}/delete`,{credential,confirmation:preview.confirmation,fingerprint:preview.fingerprint,requestKey:randomUUID()});
  }};
  await worker.runNext();expect(readFileSync(f.file,'utf8')).toBe('known damaged original');expect(await saved(repair.id)).toBeUndefined();
  await worker.runNext();await store.requestContext(()=>{const asset=store.find('studioMaterialAssets',{id:f.sha});expect(asset.state).toBe('available');expect(asset.repair).toBeUndefined();expect(store.find('studioMaterialUploads',{id:f.upload.id})).toBeUndefined();});
  expect(readFileSync(f.file,'utf8')).toBe('known damaged original');
 });
 it('keeps shared and frozen content unchanged when repairing one source SHA',async()=>{
  const f=await fixture(),sharedId='studio_material_'+randomUUID(),frozenId='source_course_'+randomUUID();
  await store.transaction(()=>{
   store.append('studioSourceMaterials',{...f.material,id:sharedId,ownerUserId:other.user.id});
   store.append('sourceCourses',{id:frozenId,ownerUserId:other.user.id,studentId:null,subject:null,audience:'adult',targetGoals:[],input:{title:'Frozen evidence',goal:'Keep the original source unchanged',language:'source',minutesPerSession:15,modelId:'auto',targetAtomIds:[]},sources:[{key:'fixed',materialId:f.id,kind:'pdf',sha256:f.sha,title:'Frozen',version:f.version,page:1,text:'Immutable frozen classroom text'}],revision:0,status:'archived',taskId:'task_'+randomUUID(),result:null,originalResult:null,edits:[],fingerprint:null,modelName:null,confirmedAt:null,createdAt:f.material.createdAt,updatedAt:f.material.createdAt,requests:[]});
  });
  const before=await store.requestContext(()=>JSON.stringify(store.find('sourceCourses',{id:frozenId}))),repair=await start(f);await completed(f,repair.id);
  const shared=await call('get',base+sharedId,undefined,other);expect(shared.material.pages).toEqual([{page:1,text:'',textCharacters:f.material.pages[0].text.length}]);expect(shared.version).toBe(f.version);
  expect(await store.requestContext(()=>JSON.stringify(store.find('sourceCourses',{id:frozenId})))).toBe(before);
 });
 it('invalidates repair authority when scope metadata changes despite the same text version',async()=>{
  const f=await fixture(),repair=await start(f);await store.transaction(()=>{store.find('studioSourceMaterials',{id:f.id}).subject='math';});
  expect((await call('get',base+f.id)).version).toBe(f.version);await worker.runNext();
  expect(readFileSync(f.file,'utf8')).toBe('known damaged original');expect((await call('get',f.path+'/'+repair.id)).status).toBe('cancelled');
 });
 it('restores an actual large 120-page PDF and successfully regenerates original pages with the real processor',async()=>{
  const f=await fixture({large:true}),repair=await start(f);await completed(f,repair.id);
  await call('post','/learning/studio/materials/'+f.id+'/process/retry',{expectedUpdatedAt:f.material.updatedAt,requestKey:randomUUID()});await processor.runNext();const material=await call('get',base+f.id),progress=await call('get',base+f.id+'/progress');
  expect(progress.status).toBe('ready');expect(progress.processedPages).toBe(120);expect(material.material.pageCount).toBe(120);
  const last=await call('get',base+f.id+'/pages/120?version='+material.version);expect(last.text).toContain('Page 120.');expect(readFileSync(f.file).equals(f.bytes)).toBe(true);
 },120000);
});

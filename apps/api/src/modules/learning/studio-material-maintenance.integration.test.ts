import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { beforeAll,afterAll,afterEach,describe,it,expect,vi } from 'vitest';
import request from 'supertest';
import { createHash,randomUUID } from 'node:crypto';
import { execFileSync,spawn } from 'node:child_process';
import { mkdtempSync,readFileSync,rmSync,existsSync,mkdirSync,writeFileSync,unlinkSync,utimesSync,symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve,sep } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { Pool } from 'pg';

describe('durable private source collection with shared references and process/write fences',()=>{
 const directory=mkdtempSync(join(tmpdir(),'study-material-collection-')),data=join(directory,'data'),names=['NODE_ENV','STUDY_STORAGE','DATABASE_URL','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','STUDY_PDF_STRUCTURE_MODEL','XIAOJIU_CHAT_ENABLED']as const,prior=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 const credential='Material-collection-fixture-only',base='/learning/material-uploads';let app:any,store:any,maintenance:any,processing:any,uploads:any,parent:any,other:any,pdf:Buffer,pg:Pool|undefined,schema:string|undefined;
 const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
 async function boot(){const{AppModule}=require('../../../dist/apps/api/src/app.module.js');app=await NestFactory.create(AppModule,{logger:false});require('../../../dist/apps/api/src/common/http-body.js').configureJsonBody(app);app.setGlobalPrefix('api');await app.init();store=app.get(require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js').InMemoryStoreService);maintenance=app.get(require('../../../dist/apps/api/src/modules/learning/studio-material-maintenance.service.js').StudioMaterialMaintenanceService);processing=app.get(require('../../../dist/apps/api/src/modules/processing/processing-worker.service.js').ProcessingWorkerService);uploads=app.get(require('../../../dist/apps/api/src/modules/learning/studio-material-upload.service.js').StudioMaterialUploadService);maintenance.pendingDelayMs=2;}
 async function call(method:'get'|'post'|'put',path:string,body?:unknown,actor=parent,status=method==='post'?201:200){let query=request(app.getHttpServer())[method]('/api'+path);if(actor)query=query.set('Authorization','Bearer '+actor.token);if(Buffer.isBuffer(body))query=query.set('content-type','application/octet-stream').send(body);else if(body!==undefined)query=query.send(body as object);return(await query.expect(status)).body.data;}
 async function tasks(){const result:any[]=[];for(let page=1;page<100;page++){const chunk=await store.tasks.list(page);result.push(...chunk.rows);if(result.length>=chunk.total)break;}return result;}
 async function runTo(id:string){for(let turn=0;turn<150;turn++){const row=await store.tasks.get(id);if(row.state==='succeeded')return row;if(!await maintenance.runNext(false))await pause(5);}throw new Error('Collection did not finish: '+(await store.tasks.get(id)).errorCode);}
 async function schedule(targetKind:'source'|'upload',key:string,graceMs=0){return store.transaction(()=>maintenance.schedule(targetKind,key,parent.user.id,'fixture:'+randomUUID(),graceMs));}
 async function orphan(format:'pdf'|'txt'='txt'){const bytes=Buffer.from('Anonymous private original. '+randomUUID()),sha=digest(bytes),{persistStudioMaterial}=require('../../../dist/apps/api/src/modules/learning/studio-material-storage.js');await store.transaction(()=>persistStudioMaterial(store,sha,bytes,format));return{sha,bytes,file:join(data,'studio-materials',sha+'.'+format)};}
 async function begin(bytes:Buffer,actor=parent){const row=await call('post',base,{name:'anonymous.pdf',size:bytes.length,sha256:digest(bytes),requestKey:randomUUID()},actor);await call('put',base+'/'+row.id+'/chunks/0',bytes,actor);return call('get',base+'/'+row.id,undefined,actor);}
 async function upload(bytes:Buffer,actor=parent){const row=await begin(bytes,actor);return call('post',base+'/'+row.id+'/complete',{},actor);}
 const sample=()=>Buffer.concat([pdf,Buffer.from('\n% isolated fixture '+randomUUID()+'\n')]);
 const studioCollections=['studioCourses','studioActivities','studioStudyPlans','studioLearningPacks','studioWhiteboards','studioConnectors','studioScheduleEvents'];
 async function studioRows(studentId:string,actorId=parent.user.id){
  const rows:any={};await store.transaction(()=>{for(const collection of studioCollections){const row:any={id:collection+'_'+randomUUID(),studentId,subject:'math',createdBy:actorId,actorId,title:'Private studio fixture',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceMaterialId:null,scenes:[],sections:[],flashcards:[]};if(collection==='studioConnectors')Object.assign(row,{kind:'calendar_ics',label:'Family calendar',status:'connected',version:1,sourceHost:'calendar.invalid',encryptedFeedUrl:'opaque-private-feed-'+studentId,requestKey:randomUUID(),requestHash:'private-internal-hash'});store.append(collection,row);rows[collection]=row;}});return rows;
 }
 beforeAll(async()=>{
  const location=process.env.STUDY_TEST_MATERIAL_MAINTENANCE_POSTGRES_URL;let backend='sqlite';
  if(location){pg=new Pool({connectionString:location});expect((await pg.query('SELECT current_database() AS name,current_user AS owner')).rows[0]).toEqual({name:'study_agent_qa',owner:'study_agent_app'});schema='study_qa_collect_'+randomUUID().replace(/-/g,'');await pg.query('CREATE SCHEMA "'+schema+'"');const scoped=new URL(location);scoped.searchParams.set('options','-c search_path='+schema);process.env.DATABASE_URL=scoped.toString();backend='postgres';}
  Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:backend,STUDY_DATA_DIR:data,STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'false',STUDY_PDF_STRUCTURE_MODEL:'false',XIAOJIU_CHAT_ENABLED:'false'});await boot();parent=await call('post','/auth/register',{principal:'collect-parent@local.test',credential},null);other=await call('post','/auth/register',{principal:'collect-other@local.test',credential},null);
  const file=join(directory,'anonymous.pdf');execFileSync(process.env.STUDY_PYTHON??(process.platform==='win32'?'python':'python3'),['-X','utf8','-c','import fitz,sys; d=fitz.open();\nfor i in range(2):\n p=d.new_page(); p.insert_text((40,80),"Original conditions and counterexamples. Page "+str(i+1))\nd.save(sys.argv[1]); d.close()',file],{windowsHide:true,timeout:30000});pdf=readFileSync(file);
 });
 afterEach(()=>vi.restoreAllMocks());
 afterAll(async()=>{await app?.close();if(pg){try{if(schema){if(!/^study_qa_collect_[a-f0-9]{32}$/.test(schema))throw new Error('Unsafe collection QA schema');await pg.query('DROP SCHEMA "'+schema+'" CASCADE');}}finally{await pg.end();}}for(const[name,value]of Object.entries(prior)){if(value===undefined)delete process.env[name];else process.env[name]=value;}if(!resolve(directory).startsWith(resolve(tmpdir())+sep))throw new Error('Unsafe collection fixture directory');rmSync(directory,{recursive:true,force:true});});

 it('does not revoke or unlink before a cancellation transaction commits, then resumes its durable cleanup after reopening',async()=>{
  const bytes=sample(),row=await begin(bytes),chunk=join(data,'studio-uploads',row.id,'0-'+digest(bytes)),revoked=join(data,'studio-uploads','control',row.id,'revoked.json'),before=(await tasks()).length;
  await expect(store.transaction(async()=>{await uploads.cancel(parent.user,row.id,{expectedRevision:row.revision});throw new Error('controlled transaction rollback');})).rejects.toThrow('rollback');
  expect((await call('get',base+'/'+row.id)).status).toBe('uploading');expect(readFileSync(chunk)).toEqual(bytes);expect(existsSync(revoked)).toBe(false);expect((await tasks()).length).toBe(before);
  await call('post',base+'/'+row.id+'/cancel',{expectedRevision:row.revision});const queued=(await tasks()).filter(task=>task.kind==='studio.material.collect'&&[row.id,digest(bytes)].includes(task.payload.key));expect(queued).toHaveLength(2);
  await app.close();await boot();for(const task of queued)await runTo(task.id);expect(existsSync(join(data,'studio-uploads',row.id))).toBe(false);expect(existsSync(revoked)).toBe(true);
  const {acquireStudioFileLease}=require('../../../dist/apps/api/src/infrastructure/studio-file-coordination.js');await expect(acquireStudioFileLease(data,'upload',row.id)).rejects.toThrow('撤销');expect(await call('get',base+'/'+row.id)).not.toHaveProperty('filesCollectedAt');
 });

 it('deduplicates the same source cleanup from two paths inside one real outbox transaction',async()=>{
  const source=await orphan(),salt='two-domain-paths:'+randomUUID();let first:string,second:string;
  await store.transaction(async()=>{first=await maintenance.schedule('source',source.sha,parent.user.id,salt);second=await maintenance.schedule('source',source.sha,parent.user.id,salt);});
  expect(first!).toBe(second!);expect((await tasks()).filter(task=>task.id===first)).toHaveLength(1);await runTo(first!);expect(existsSync(source.file)).toBe(false);
 });

 it('removes successful upload chunks while retaining the verified original, shared families and frozen course sources',async()=>{
  const bytes=sample(),first=await upload(bytes),second=await upload(bytes,other),sha=digest(bytes),file=join(data,'studio-materials',sha+'.pdf');
  await processing.runNext();await processing.runNext();
  const working=join(data,'processing','runs',first.material.processingTaskId);expect(existsSync(working)).toBe(true);
  for(const task of(await tasks()).filter(task=>task.kind==='studio.material.collect'&&[sha,first.upload.id,second.upload.id].includes(task.payload.key)))await runTo(task.id);
  expect(existsSync(join(data,'studio-uploads',first.upload.id))).toBe(false);expect(readFileSync(file)).toEqual(bytes);
  const material=await call('get','/learning/source-courses/materials/'+first.material.id),course=await call('post','/learning/source-courses',{title:'Frozen source preservation',goal:'Preserve the original conditions and counterexamples.',language:'en',minutesPerSession:10,modelId:'auto',selections:[{materialId:first.material.id,version:material.version,pages:[1]}],requestKey:randomUUID()});
  await store.transaction(()=>store.remove('studioSourceMaterials',{id:first.material.id}));await runTo(await schedule('source',sha));expect(readFileSync(file)).toEqual(bytes);
  await store.transaction(()=>store.remove('studioSourceMaterials',{id:second.material.id}));await runTo(await schedule('source',sha));expect(readFileSync(file)).toEqual(bytes);
  await store.transaction(()=>store.remove('sourceCourses',{id:course.id}));const final=await runTo(await schedule('source',sha));expect(final.result.retained).toBe(false);expect(existsSync(file)).toBe(false);expect(existsSync(join(data,'studio-materials','processed',sha))).toBe(false);expect(existsSync(working)).toBe(false);
 });

 it('waits beyond maxAttempts for a live writer, survives a real reopen, then collects after its exact lease ends',async()=>{
  const source=await orphan(),{acquireStudioFileLease}=require('../../../dist/apps/api/src/infrastructure/studio-file-coordination.js'),release=await acquireStudioFileLease(data,'source',source.sha),id=await schedule('source',source.sha);
  for(let attempt=0;attempt<7;attempt++){await pause(4);await maintenance.runNext(false);const task=await store.tasks.get(id);expect(task.state).toBe('retry_wait');expect(task.attempts).toBe(0);expect(task.errorCode).toBe('material_file_process_active_or_unknown');expect(existsSync(source.file)).toBe(true);}
  await app.close();await boot();await pause(4);await maintenance.runNext(false);expect((await store.tasks.get(id)).state).toBe('retry_wait');await release();const done=await runTo(id);expect(done.state).toBe('succeeded');expect(existsSync(source.file)).toBe(false);
  await store.requestContext(()=>{expect(store.find('studioMaterialAssets',{id:source.sha})).toMatchObject({state:'available',generation:3});});
 });

 it('retains a removed material original while its real processing task remains queued',async()=>{
  const bytes=sample(),uploaded=await upload(bytes);await store.transaction(()=>store.remove('studioSourceMaterials',{id:uploaded.material.id}));const task=(await tasks()).find(task=>task.kind==='studio.material.collect'&&task.payload.targetKind==='source'&&task.payload.key===digest(bytes));
  for(let turn=0;turn<10;turn++){await maintenance.runNext(false);if((await store.tasks.get(task.id)).state==='retry_wait')break;}
  expect((await store.tasks.get(task.id)).errorCode).toBe('material_processing_task_active');expect(existsSync(join(data,'studio-materials',digest(bytes)+'.pdf'))).toBe(true);
  const processingTask=await store.tasks.get(uploaded.material.processingTaskId);await store.tasks.cancel(processingTask.id,processingTask.version,'qa-finished-cancellation');await runTo(task.id);expect(existsSync(join(data,'studio-materials',digest(bytes)+'.pdf'))).toBe(false);
 });

 it('keeps a separate live Python process protected and prunes its marker only after the child actually exits',async()=>{
  const source=await orphan(),control=join(data,'studio-materials','control',source.sha),python=process.env.STUDY_PYTHON??(process.platform==='win32'?'python':'python3'),code='import sys,time; from file_leases import file_lease;\nwith file_lease(sys.argv[1]):\n print("lease-ready",flush=True)\n time.sleep(30)';
  const child=spawn(python,['-X','utf8','-c',code,control],{cwd:resolve(__dirname,'../../../../../scripts/processing'),windowsHide:true,stdio:['ignore','pipe','pipe']});
  try{
   await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Python lease did not become ready')),10000);child.once('error',reject);child.stdout.on('data',bytes=>{if(bytes.toString().includes('lease-ready')){clearTimeout(timer);resolve();}});child.once('exit',()=>{clearTimeout(timer);reject(new Error('Python lease exited before readiness'));});});
   const id=await schedule('source',source.sha);await maintenance.runNext(false);expect((await store.tasks.get(id)).errorCode).toBe('material_file_process_active_or_unknown');expect(existsSync(source.file)).toBe(true);
   const exited=new Promise<void>(resolve=>child.once('close',()=>resolve()));child.kill();await exited;await runTo(id);expect(existsSync(source.file)).toBe(false);
  }finally{if(child.exitCode===null&&child.signalCode===null)child.kill();}
 });

 it('inventories the whole group before deletion and preserves unknown files and Windows directory junctions',async()=>{
  const source=await orphan(),cache=join(data,'studio-materials','processed',source.sha),outside=join(directory,'outside-'+randomUUID());mkdirSync(cache,{recursive:true});mkdirSync(outside);writeFileSync(join(cache,'page-1.png'),'known page');writeFileSync(join(cache,'private-memo.txt'),'unknown data');writeFileSync(join(outside,'sentinel.txt'),'outside sentinel');const link=join(cache,'unknown-link');symlinkSync(outside,link,process.platform==='win32'?'junction':'dir');
  const id=await schedule('source',source.sha);await maintenance.runNext(false);expect((await store.tasks.get(id)).state).toBe('retry_wait');expect(existsSync(source.file)).toBe(true);expect(readFileSync(join(cache,'page-1.png'),'utf8')).toBe('known page');expect(readFileSync(join(outside,'sentinel.txt'),'utf8')).toBe('outside sentinel');
  unlinkSync(join(cache,'private-memo.txt'));unlinkSync(link);await runTo(id);expect(existsSync(cache)).toBe(false);expect(readFileSync(join(outside,'sentinel.txt'),'utf8')).toBe('outside sentinel');
 });

 it('reclaims an identifiable dead purge owner but preserves an actually live owner',async()=>{
  const source=await orphan(),control=join(data,'studio-materials','control',source.sha),file=join(control,'purge.json'),id=await schedule('source',source.sha),marker={format:'study-file-purge-v1',kind:'source',key:source.sha,generation:2,taskId:id,token:randomUUID(),nonce:randomUUID(),pid:process.pid,createdAt:new Date().toISOString()};mkdirSync(control,{recursive:true});writeFileSync(file,JSON.stringify(marker));await maintenance.runNext(false);expect((await store.tasks.get(id)).errorCode).toBe('material_collection_owner_active');expect(existsSync(source.file)).toBe(true);
  const child=spawn(process.execPath,['-e','process.exit(0)'],{windowsHide:true,stdio:'ignore'}),pid=child.pid!;await new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('exit',()=>resolve());});writeFileSync(file,JSON.stringify({...marker,pid}));await runTo(id);expect(existsSync(source.file)).toBe(false);expect(existsSync(file)).toBe(false);
 });

 it('stops a cancelled old collector between files and lets the persistent sweep safely resume the remaining work',async()=>{
  const source=await orphan('pdf'),txt=join(data,'studio-materials',source.sha+'.txt');writeFileSync(txt,source.bytes);const id=await schedule('source',source.sha),inventory=require('../../../dist/apps/api/src/infrastructure/studio-file-inventory.js'),remove=inventory.removeInventoriedStudioFile;let stopped=false;
  vi.spyOn(inventory,'removeInventoriedStudioFile').mockImplementation(async(file:any)=>{const removed=await remove(file);if(!stopped){stopped=true;const task=await store.tasks.get(id);await store.tasks.cancel(id,task.version,'qa-cancel');await store.tasks.fail(id,task.leaseToken,'qa_cancel',false);}return removed;});
  await maintenance.runNext(false);vi.restoreAllMocks();expect((await store.tasks.get(id)).state).toBe('cancelled');expect(existsSync(source.file)).toBe(false);expect(existsSync(txt)).toBe(true);
  await maintenance.sweep();await runTo(id);expect(existsSync(txt)).toBe(false);await store.requestContext(()=>expect(store.find('studioMaterialAssets',{id:source.sha}).state).toBe('available'));
 });

 it('keeps grace-period bytes available, expires incomplete uploads and collects SHA-addressed assembly leftovers',async()=>{
  const source=await orphan(),id=await schedule('source',source.sha,86400000);await maintenance.runNext(false);expect((await store.tasks.get(id)).errorCode).toBe('material_collection_grace_period');await store.requestContext(()=>expect(store.find('studioMaterialAssets',{id:source.sha}).state).toBe('available'));
  const old=new Date(Date.now()-2*86400000);utimesSync(source.file,old,old);const staging=join(data,'studio-materials','assembling-'+source.sha+'-'+randomUUID());writeFileSync(staging,'private assembly bytes');utimesSync(staging,old,old);await runTo(id);expect(existsSync(staging)).toBe(false);
  const bytes=sample(),upload=await begin(bytes);await store.transaction(()=>{store.find('studioMaterialUploads',{id:upload.id}).expiresAt='2020-01-01T00:00:00.000Z';});await maintenance.sweep();const cleanup=(await tasks()).find(task=>task.kind==='studio.material.collect'&&task.payload.key===upload.id);await runTo(cleanup.id);expect(existsSync(join(data,'studio-uploads',upload.id))).toBe(false);expect((await call('get',base+'/'+upload.id)).status).toBe('cancelled');
 });

 it('exports and deletes every legacy studio relation for an actual child without leaking encrypted subscription credentials',async()=>{
  const studentId=(await call('post','/students',{nickname:'工作台关系验证',grade:3,preferredSessionMinutes:10,defaultVersionMap:{math:'',chinese:'',english:''}})).profile.id,rows=await studioRows(studentId);
  const exported=await call('post',`/privacy/students/${studentId}/export`,{credential,requestKey:randomUUID()});
  for(const collection of studioCollections)expect(exported.students[0].records[collection].some((row:any)=>row.id===rows[collection].id)).toBe(true);
  expect(JSON.stringify(exported)).not.toContain('encryptedFeedUrl');expect(JSON.stringify(exported)).not.toContain('opaque-private-feed');expect(JSON.stringify(exported)).not.toContain('private-internal-hash');
  const preview=await call('get',`/privacy/students/${studentId}/deletion-preview`);await call('post',`/privacy/students/${studentId}/delete`,{credential,confirmation:preview.confirmation,fingerprint:preview.fingerprint,requestKey:randomUUID()});
  await store.requestContext(()=>{for(const collection of studioCollections)expect(store.find(collection,{id:rows[collection].id})).toBeUndefined();});
 });

 it('executes a committed cleanup after an actual worker-enabled application bootstrap without a manual run call',async()=>{
  const source=await orphan(),id=await schedule('source',source.sha);await app.close();process.env.STUDY_WORKER_ENABLED='true';
  try{
   await boot();const deadline=Date.now()+25000;
   while(Date.now()<deadline&&(await store.tasks.get(id)).state!=='succeeded')await pause(100);
   expect((await store.tasks.get(id)).state).toBe('succeeded');expect(existsSync(source.file)).toBe(false);
  }finally{await app?.close();process.env.STUDY_WORKER_ENABLED='false';await boot();}
 },40000);

 it('continues private original, page and upload cleanup after the owning account has actually been deleted',async()=>{
  const shared=(await call('post','/students',{nickname:'共同监护的工作台',grade:4,preferredSessionMinutes:10,defaultVersionMap:{math:'',chinese:'',english:''}})).profile.id,invite=await call('post',`/students/${shared}/invitations`,{recipientPrincipal:other.user.principal});await call('post',`/parents/${other.user.id}/bindings`,{studentId:shared,inviteToken:invite.token},other);const sharedRows=await studioRows(shared),otherConnector={...sharedRows.studioConnectors,id:'other_connector_'+randomUUID(),createdBy:other.user.id,actorId:other.user.id,encryptedFeedUrl:'other-guardian-opaque-secret'};await store.transaction(()=>store.append('studioConnectors',otherConnector));
  const bytes=sample(),uploaded=await upload(bytes);await processing.runNext();const unrelated=join(data,'processing','runs','task_'+randomUUID(),randomUUID());mkdirSync(unrelated,{recursive:true});writeFileSync(join(unrelated,'admin-original.txt'),'unrelated administrator evidence');const preview=await call('get','/privacy/account/deletion-preview');await call('post','/privacy/account/delete',{credential,confirmation:preview.confirmation,fingerprint:preview.fingerprint,requestKey:randomUUID()});await call('get','/privacy/overview',undefined,parent,401);
  const matching=(await tasks()).filter(task=>task.kind==='studio.material.collect'&&[uploaded.upload.id,digest(bytes)].includes(task.payload.key));expect(matching.length).toBeGreaterThan(0);for(const task of matching)await runTo(task.id);
  expect(existsSync(join(data,'studio-materials',digest(bytes)+'.pdf'))).toBe(false);expect(existsSync(join(data,'studio-materials','processed',digest(bytes)))).toBe(false);expect(existsSync(join(data,'studio-uploads',uploaded.upload.id))).toBe(false);expect(existsSync(join(data,'processing','runs',uploaded.material.processingTaskId))).toBe(false);expect(readFileSync(join(unrelated,'admin-original.txt'),'utf8')).toBe('unrelated administrator evidence');await store.requestContext(()=>expect(store.find('users',{id:parent.user.id})).toBeUndefined());
  await store.requestContext(()=>{for(const collection of studioCollections){const retained=store.find(collection,{id:sharedRows[collection].id});expect(retained).toBeTruthy();expect(retained.createdBy).toBe('deleted-account');}expect(store.find('studioConnectors',{id:sharedRows.studioConnectors.id})).toMatchObject({status:'revoked',encryptedFeedUrl:'',version:2});expect(store.find('studioConnectors',{id:otherConnector.id})).toMatchObject({status:'connected',encryptedFeedUrl:'other-guardian-opaque-secret',createdBy:other.user.id});});
 });
});

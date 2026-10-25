import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import sharp from 'sharp';
import {Pool} from 'pg';

describe('project files retain actual bytes, immutable submissions and original authorization',()=>{
  const directory=mkdtempSync(join(tmpdir(),'study-project-files-'));
  const names=['NODE_ENV','DATABASE_URL','STUDY_STORAGE','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','XIAOJIU_CHAT_ENABLED'] as const;
  const prior=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  let app:any,store:any,worker:any,parent:any,other:any,learner:any,studentId:string,courseId:string;
  let pg:Pool|undefined,schema:string|undefined;
  const base='/learning/project-files',digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
  async function boot(){const{AppModule}=require('../../../dist/apps/api/src/app.module.js'),{InMemoryStoreService}=require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js'),{ProjectFileWorkerService}=require('../../../dist/apps/api/src/modules/learning/project-file-worker.service.js');app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api');await app.init();store=app.get(InMemoryStoreService);worker=app.get(ProjectFileWorkerService);}
  async function call(method:'get'|'post'|'patch',path:string,body?:unknown,actor=parent,status=method==='post'?201:200){let query=request(app.getHttpServer())[method]('/api'+path);if(actor)query=query.set('Authorization','Bearer '+actor.token);if(body!==undefined)query=query.send(body as object);const response=await query;expect(response.status,JSON.stringify(response.body.error)).toBe(status);return response.body.data;}
  const open=(unitId='soc-u1',actor=parent)=>call('post','/learning/projects',{unitId},actor);
  const start=(project:any,bytes:Buffer,type='text/plain',actor=parent,extra={})=>call('post',base+'/uploads',{projectId:project.id,stageId:project.currentStageId,definitionFingerprint:project.definition.fingerprint,name:'anonymous.txt',size:bytes.length,mediaType:type,sha256:digest(bytes),requestKey:randomUUID(),...extra},actor);
  async function chunk(upload:any,bytes:Buffer,index=0,actor=parent,status=200){return(await request(app.getHttpServer()).put('/api'+base+'/uploads/'+upload.id+'/chunks/'+index).set('Authorization','Bearer '+actor.token).set('Content-Type','application/octet-stream').send(bytes).expect(status)).body.data;}
  async function upload(project:any,bytes:Buffer,type='text/plain',actor=parent){let row=await start(project,bytes,type,actor);for(let index=0;index<Math.ceil(row.size/row.chunkSize);index++)row=await chunk(row,bytes.subarray(index*row.chunkSize,Math.min(bytes.length,(index+1)*row.chunkSize)),index,actor);return(await call('post',base+'/uploads/'+row.id+'/complete',{},actor)).asset;}
  async function settleAsset(id:string,actor=parent){for(let i=0;i<20;i++){const row=await call('get',base+'/assets/'+id,undefined,actor);if(['ready','failed','cancelled'].includes(row.status))return row;await worker.runNext(false);}throw Error('Project file processing did not settle');}
  beforeAll(async()=>{
    let backend='sqlite';const url=process.env.STUDY_TEST_PROJECT_FILES_POSTGRES_URL;if(url){pg=new Pool({connectionString:url});expect((await pg.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa');schema='study_qa_project_files_'+randomUUID().replace(/-/g,'');await pg.query('CREATE SCHEMA "'+schema+'"');const scoped=new URL(url);scoped.searchParams.set('options','-c search_path='+schema);process.env.DATABASE_URL=scoped.toString();backend='postgres';}
    Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:backend,STUDY_DATA_DIR:directory,STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'false',XIAOJIU_CHAT_ENABLED:'false'});await boot();
    parent=await call('post','/auth/register',{principal:'file-parent@test',credential:'Project-files-only-20261025'},null);other=await call('post','/auth/register',{principal:'file-other@test',credential:'Project-files-only-20261025'},null);
    studentId=(await call('post','/students',{nickname:'文件合成核查',grade:5,preferredSessionMinutes:15,defaultVersionMap:{math:'',chinese:'',english:''}})).profile.id;
    const access=await call('post',`/students/${studentId}/learning-access`,{enabled:true,expectedVersion:0,requestKey:randomUUID(),reason:'独立文件测试'}),code=await call('post',`/students/${studentId}/learning-access/codes`,{expectedVersion:access.version,requestKey:randomUUID()});learner=await call('post','/auth/learning-code',{code:code.code},null);
    courseId='files-course';await store.transaction(()=>store.append('studioCourses',{id:courseId,studentId,subject:'math',grade:5,term:'upper',title:'文件核查',description:'',objective:'核对原件',status:'active',source:'studyagent_curriculum',scopeVersion:1,textbookVersion:'合成',focusAtomIds:[],materials:[],fingerprint:'file-course-v1',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),units:[{id:'file-unit',title:'迁移',objective:'说明依据',lessons:[{id:'file-project',atomId:null,title:'项目',objective:'核对',kind:'project',state:'not_started',href:'/learn'}]}]}));
  });
  afterAll(async()=>{await app?.close();if(pg){if(!/^study_qa_project_files_[a-f0-9]{32}$/.test(schema??''))throw Error('Invalid owned file QA schema');await pg.query('DROP SCHEMA "'+schema+'" CASCADE');await pg.end();}for(const[name,value]of Object.entries(prior)){if(value===undefined)delete process.env[name];else process.env[name]=value;}for(const target of [directory,directory+'-bundle',directory+'-restored',directory+'-deleted',directory+'-ledger.json'])rmSync(target,{recursive:true,force:true});});
  it('resumes hashed chunks after restart, replays complete, keeps upload changes independent of text revisions and serves real ranges',async()=>{
    let project=await open();const bytes=Buffer.from('original project evidence\n'.repeat(50000)),command={requestKey:randomUUID()};let row=await start(project,bytes,'text/plain',parent,command);
    expect((await start(project,bytes,'text/plain',parent,command)).id).toBe(row.id);await call('post',base+'/uploads',{projectId:project.id,stageId:project.currentStageId,definitionFingerprint:project.definition.fingerprint,name:'anonymous.txt',size:9,mediaType:'text/plain',sha256:digest(Buffer.from('different')),...command},parent,409);
    row=await chunk(row,bytes.subarray(0,row.chunkSize));expect((await chunk(row,bytes.subarray(0,row.chunkSize))).chunks).toHaveLength(1);await chunk(row,Buffer.alloc(row.chunkSize,1),0,parent,409);
    await app.close();await boot();row=await call('get',base+'/uploads/'+row.id);expect(row.chunks).toHaveLength(1);
    project=await call('patch','/learning/projects/'+project.id,{expectedRevision:project.revision,requestKey:randomUUID(),stageId:project.currentStageId,artifact:{values:{},evidence:[]}});expect(project.revision).toBe(1);
    for(let i=1;i<Math.ceil(row.size/row.chunkSize);i++)row=await chunk(row,bytes.subarray(i*row.chunkSize,Math.min(bytes.length,(i+1)*row.chunkSize)),i);
    const completed=await call('post',base+'/uploads/'+row.id+'/complete',{});expect((await call('post',base+'/uploads/'+row.id+'/complete',{})).asset.id).toBe(completed.asset.id);
    const asset=await settleAsset(completed.asset.id);expect(asset.status).toBe('failed');expect(asset.task.errorCode).toBe('project_text_limit');
    const small=Buffer.from('真实文字 evidence: 12 / 3 = 4\n'),file=await settleAsset((await upload(project,small)).id);expect(file.status).toBe('ready');expect(file.original.sha256).toBe(digest(small));expect(file).not.toHaveProperty('authorization');
    const before=await call('get','/learning/projects/'+project.id),audit=await call('get',base+'/assets/'+file.id+'/integrity');expect(audit.complete).toBe(true);expect(audit.files[0].sha256).toBe(file.original.sha256);expect((await call('get','/learning/projects/'+project.id)).revision).toBe(before.revision);
    const savedPath=join(directory,'project-assets',file.id,file.original.name);writeFileSync(savedPath,'corrupted local original');expect((await call('get',base+'/assets/'+file.id+'/integrity')).complete).toBe(false);writeFileSync(savedPath,small);expect((await call('get',base+'/assets/'+file.id+'/integrity')).complete).toBe(true);
    const range=await request(app.getHttpServer()).get('/api'+base+'/assets/'+file.id+'/files/original').set('Authorization','Bearer '+parent.token).set('Range','bytes=0-5').expect(206);expect(range.headers['content-range']).toBe('bytes 0-5/'+small.length);expect(range.headers['content-disposition']).toContain('attachment');
    await request(app.getHttpServer()).get('/api'+base+'/assets/'+file.id+'/files/original').set('Authorization','Bearer '+parent.token).set('Range','bytes=99999-').expect(416);
    await call('get',base+'/assets/'+file.id,undefined,other,403);
  });
  it('decodes real images, PDFs, audio and Office containers, preserving original hashes separately from sanitized previews',async()=>{
    const project=await open('soc-u2'),png=await sharp({create:{width:12,height:9,channels:3,background:'#336699'}}).jpeg().withMetadata({exif:{IFD0:{Artist:'synthetic-metadata'}}}).toBuffer();
    const image=await settleAsset((await upload(project,png,'image/jpeg')).id);expect(image).toMatchObject({status:'ready',width:12,height:9});expect(image.original.sha256).toBe(digest(png));expect(image.display.sha256).not.toBe(image.original.sha256);
    const clean=readFileSync(join(directory,'project-assets',image.id,image.display.name));expect((await sharp(clean).metadata()).exif).toBeUndefined();
    execFileSync(process.env.STUDY_PYTHON??(process.platform==='win32'?'python':'python3'),['-X','utf8','-c','import fitz,sys,zipfile,wave\nd=fitz.open()\nfor i in range(2):\n p=d.new_page();p.insert_text((40,70),"Synthetic project evidence "+str(i+1))\nd.save(sys.argv[1]);d.close()\nwith zipfile.ZipFile(sys.argv[2],"w") as z:\n z.writestr("[Content_Types].xml",\'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>\');z.writestr("word/document.xml",\'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>\')\nwith wave.open(sys.argv[3],"w") as w:\n w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(bytes(16000))',join(directory,'fixture.pdf'),join(directory,'fixture.docx'),join(directory,'fixture.wav')],{windowsHide:true,timeout:30000});
    const noise=join(directory,'python-startup-noise');mkdirSync(noise);writeFileSync(join(noise,'sitecustomize.py'),'from pathlib import Path\nPath(__file__).with_name("startup-observed").write_text("seen")\nprint("Synthetic native dependency startup banner before the framed result")\n');const previousPythonPath=process.env.PYTHONPATH;process.env.PYTHONPATH=noise+(previousPythonPath?delimiter+previousPythonPath:'');
    try{const pdf=await settleAsset((await upload(project,readFileSync(join(directory,'fixture.pdf')),'application/pdf')).id);expect(pdf.status,pdf.task?.errorCode).toBe('ready');expect(pdf.pageCount).toBe(2);expect(existsSync(join(noise,'startup-observed'))).toBe(true);expect(pdf.previews).toHaveLength(2);for(const preview of pdf.previews)expect((await sharp(readFileSync(join(directory,'project-assets',pdf.id,preview.file.name))).metadata()).format).toBe('png');}finally{if(previousPythonPath===undefined)delete process.env.PYTHONPATH;else process.env.PYTHONPATH=previousPythonPath;}
    const audio=await settleAsset((await upload(project,readFileSync(join(directory,'fixture.wav')),'audio/wav')).id);expect(audio.status).toBe('ready');expect(audio.durationMs).toBe(500);expect(audio.display.mediaType).toBe('audio/wav');
    const office=await settleAsset((await upload(project,readFileSync(join(directory,'fixture.docx')),'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).id);expect(office.status).toBe('ready');expect(office.display).toBeUndefined();expect(office.previews).toEqual([]);
  });
  it('freezes file identities in each submitted version and rejects cross-stage refs, incomplete assets and removing historical bytes',async()=>{
    let project=await open('soc-u3');const file=await settleAsset((await upload(project,Buffer.from('version one'))).id),second=await settleAsset((await upload(project,Buffer.from('version two'))).id);
    const stage=project.definition.stages[0],artifact={values:Object.fromEntries(stage.fields.map((field:any)=>[field.id,'说明原件与依据'])),evidence:[],attachments:[{assetId:file.id,label:'文字原件',caption:'第一次提交'}]},selfRatings=project.definition.rubric.map((criterion:any)=>({criterionId:criterion.id,level:1,evidence:'文件给出可核对的原始记录',attachmentIds:[file.id]}));
    project=await call('post','/learning/projects/'+project.id+'/submissions',{expectedRevision:project.revision,requestKey:randomUUID(),stageId:stage.id,artifact,selfRatings,revisionNote:''});
    const first=structuredClone(project.submissions[0]);expect(first.attachmentManifest[0].original.sha256).toBe(file.original.sha256);
    await call('post',base+'/assets/'+file.id+'/delete',{expectedRevision:file.revision,requestKey:randomUUID()},parent,409);
    const changed={...artifact,attachments:[{assetId:second.id,label:'新原件',caption:'第二次提交'}]};project=await call('post','/learning/projects/'+project.id+'/submissions',{expectedRevision:project.revision,requestKey:randomUUID(),stageId:stage.id,artifact:changed,selfRatings:selfRatings.map((rating:any)=>({...rating,attachmentIds:[second.id]})),revisionNote:'替换原件并保留第一次提交'});
    expect(project.submissions[0]).toEqual(first);expect(project.submissions[1].attachmentManifest[0].original.sha256).toBe(second.original.sha256);
    await call('patch','/learning/projects/'+project.id,{expectedRevision:project.revision,requestKey:randomUUID(),stageId:project.definition.stages[1].id,artifact},parent,400);
    await app.close();await boot();expect((await call('get','/learning/projects/'+project.id)).submissions[0]).toEqual(first);
  });
  it('rejects invalid UTF8 and disguised documents, and cancellation collects exact unreferenced bytes without resurrection',async()=>{
    const project=await open('soc-u4');for(const[bytes,type]of [[Buffer.from([0xff,0xfe]),'text/plain'],[Buffer.from('not a PDF'),'application/pdf'],[Buffer.from('not a ZIP'),'application/vnd.openxmlformats-officedocument.wordprocessingml.document']] as const){const asset=await settleAsset((await upload(project,bytes,type)).id);expect(asset.status).toBe('failed');}
    let row=await start(project,Buffer.from('cancel these chunks'));row=await chunk(row,Buffer.from('cancel these chunks'));await call('post',base+'/uploads/'+row.id+'/cancel',{expectedRevision:row.revision});await chunk(row,Buffer.from('cancel these chunks'),0,parent,409);
    for(let i=0;i<20;i++)if(!await worker.runNext(false))break;
    expect((await call('get',base+'/uploads/'+row.id)).status).toBe('cancelled');
    const asset=await upload(project,Buffer.from('cancel before decoding'));const current=await call('get',base+'/assets/'+asset.id);await call('post',base+'/assets/'+asset.id+'/cancel',{expectedRevision:current.revision,expectedTaskVersion:current.task.version,requestKey:randomUUID()});
    for(let i=0;i<20;i++)if(!await worker.runNext(false))break;
    expect((await call('get',base+'/assets/'+asset.id)).status).toBe('cancelled');await call('get',base+'/assets/'+asset.id+'/files/original',undefined,parent,404);
  });
  it.skipIf(Boolean(process.env.STUDY_TEST_PROJECT_FILES_POSTGRES_URL))('includes actual original and preview bytes in family archives and cold recovery; latest deletion receipts erase old restored attachments',async()=>{
    const project=await open('soc-u5',other),file=await settleAsset((await upload(project,Buffer.from('private archive bytes'),'text/plain',other)).id,other);
    const archive=await request(app.getHttpServer()).post('/api/privacy/account/export-archive').set('Authorization','Bearer '+other.token).send({credential:'Project-files-only-20261025',requestKey:randomUUID()}).buffer(true).parse((res:any,done:any)=>{const parts:Buffer[]=[];res.on('data',(bytes:Buffer)=>parts.push(bytes));res.on('end',()=>done(null,Buffer.concat(parts)));}).expect(201);
    const tar=join(directory,'export.tar');writeFileSync(tar,archive.body);
    const inspected=JSON.parse(execFileSync(process.env.STUDY_PYTHON??(process.platform==='win32'?'python':'python3'),['-X','utf8','-c','import tarfile,json,hashlib,sys\nwith tarfile.open(sys.argv[1]) as t:\n m=json.load(t.extractfile("media-manifest.json"));d=json.load(t.extractfile("study-agent-family.json"));f=next(f for f in m["projects"] if f["assetId"]==sys.argv[2]);b=t.extractfile(f["name"]).read();assert hashlib.sha256(b).hexdigest()==f["sha256"];print(json.dumps({"projects":len(d["accountRecords"]["courseProjects"]),"assets":len(d["accountRecords"]["projectAssets"]),"bytes":b.decode()}))',tar,file.id],{encoding:'utf8',windowsHide:true}));expect(inspected).toEqual({projects:1,assets:1,bytes:'private archive bytes'});
    const repo=join(process.cwd(),'../..'),backup=require(join(repo,'scripts/operations/backup.cjs')),ledgerTool=require(join(repo,'scripts/operations/privacy-ledger.cjs'));
    await backup.createBundle({dataDir:directory,destination:directory+'-bundle'});await backup.restoreBundle({bundle:directory+'-bundle',destination:directory+'-restored'});
    expect(readFileSync(join(directory+'-restored','project-assets',file.id,file.original.name),'utf8')).toBe('private archive bytes');
    const preview=await call('get','/privacy/account/deletion-preview',undefined,other);await call('post','/privacy/account/delete',{credential:'Project-files-only-20261025',confirmation:preview.confirmation,fingerprint:preview.fingerprint,requestKey:randomUUID()},other);
    await ledgerTool.exportLedger({dataDir:directory,destination:directory+'-ledger.json'});await backup.restoreBundle({bundle:directory+'-bundle',destination:directory+'-deleted',deletionLedger:directory+'-ledger.json'});
    expect(existsSync(join(directory+'-deleted','project-assets',file.id))).toBe(false);
    const{DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(join(directory+'-deleted','study-agent.sqlite3'),{readOnly:true});try{expect(db.prepare("SELECT COUNT(*) n FROM domain_records WHERE collection='projectAssets' AND record_id=?").get(file.id).n).toBe(0);expect(db.prepare("SELECT COUNT(*) n FROM domain_records WHERE collection='courseProjects' AND record_id=?").get(project.id).n).toBe(0);}finally{db.close();}
    for(let i=0;i<40;i++)if(!await worker.runNext(false))break;expect(existsSync(join(directory,'project-assets',file.id))).toBe(false);
  });
  it('grants learner file routes explicitly and fences the original learning grant before background publication',async()=>{
    const project=await call('post','/learning/projects',{unitId:'file-unit',studioCourseId:courseId},learner),pending=await upload(project,Buffer.from('student own evidence'),'text/plain',learner);
    await call('get',base+'/assets/'+pending.id,undefined,learner);await call('get',base+'/assets/'+pending.id,undefined,parent,403);
    await store.transaction(()=>{const access=store.find('studentLearningAccess',{studentId});access.version++;});
    await call('get',base+'/assets/'+pending.id,undefined,learner,401);await worker.sweep();for(let i=0;i<20;i++)if(!await worker.runNext(false))break;
    const record=await store.requestContext(()=>structuredClone(store.find('projectAssets',{id:pending.id})));expect(record.status).toBe('cancelled');expect(record.normalizationVersion).toBeNull();
    await store.requestContext(()=>{expect(store.inspect('diagnosticResponses')).toHaveLength(0);expect(store.inspect('diagnosticPlans')).toHaveLength(0);});
  });
  it('cancellation after real decoding fences a late worker before it publishes any normalized file',async()=>{
    const project=await open(),png=await sharp({create:{width:20,height:14,channels:3,background:'#336699'}}).png().toBuffer(),asset=await upload(project,png,'image/png');
    const processor=require('../../../dist/apps/api/src/modules/learning/project-file-processing.js'),original=processor.processProjectFile;
    let unlock!:()=>void,arrived!:()=>void,pending:Promise<boolean>|undefined;const gate=new Promise<void>(resolve=>{unlock=resolve;}),atGate=new Promise<void>(resolve=>{arrived=resolve;});
    const mocked=vi.spyOn(processor,'processProjectFile').mockImplementation(async(input:any)=>{const result=await original(input);if(input.assetId===asset.id){arrived();await gate;}return result;});
    try{
      for(let i=0;i<5;i++){pending=worker.runNext(false);if(await Promise.race([atGate.then(()=>true),pending!.then(()=>false)]))break;}
      const current=await call('get',base+'/assets/'+asset.id);expect(current.status).toBe('processing');const cancellation=await call('post',base+'/assets/'+asset.id+'/cancel',{expectedRevision:current.revision,expectedTaskVersion:current.task.version,requestKey:randomUUID()});expect(cancellation.status).toBe('cancelling');expect(cancellation.task.state).toBe('cancel_requested');unlock();await pending;
      for(let i=0;i<20;i++)if(!await worker.runNext(false))break;
      const after=await call('get',base+'/assets/'+asset.id);expect(after.status).toBe('cancelled');expect(after.normalizationVersion).toBeNull();expect(existsSync(join(directory,'project-assets',asset.id,'display.png'))).toBe(false);
    }finally{unlock();await pending?.catch(()=>{});mocked.mockRestore();}
  });
  it('releases the actual file lease when a client disconnects while content verification is still awaiting its response',async()=>{
    const project=await open(),file=await settleAsset((await upload(project,Buffer.from('disconnect-protected original'))).id),service=app.get(require('../../../dist/apps/api/src/modules/learning/project-file.service.js').ProjectFileService),original=service.file.bind(service);
    let unlock!:()=>void,arrived!:()=>void;const gate=new Promise<void>(resolve=>{unlock=resolve;}),atGate=new Promise<void>(resolve=>{arrived=resolve;});const mocked=vi.spyOn(service,'file').mockImplementation(async(...args:any[])=>{const result=await original(...args);arrived();await gate;return result;});
    await app.listen(0,'127.0.0.1');const port=app.getHttpServer().address().port,http=require('node:http'),client=http.get({hostname:'127.0.0.1',port,path:'/api'+base+'/assets/'+file.id+'/files/original',headers:{Authorization:'Bearer '+parent.token}});client.on('error',()=>{});
    try{await atGate;client.destroy();await new Promise(resolve=>setTimeout(resolve,20));unlock();const leases=join(directory,'project-assets','control',file.id,'leases'),deadline=Date.now()+3000;let count=1;while(Date.now()<deadline){count=require('node:fs').readdirSync(leases).length;if(!count)break;await new Promise(resolve=>setTimeout(resolve,10));}expect(count).toBe(0);}finally{client.destroy();unlock();mocked.mockRestore();}
  });
  it('keeps active readers and unknown files intact, then resumes exact deletion when their blockers end',async()=>{
    const project=await open(),file=await settleAsset((await upload(project,Buffer.from('reader protected bytes'))).id);
    const{acquireStudioFileLease}=require('../../../dist/apps/api/src/infrastructure/studio-file-coordination.js'),release=await acquireStudioFileLease(directory,'project-asset',file.id);worker.collectionDelayMs=1;
    try{await call('post',base+'/assets/'+file.id+'/delete',{expectedRevision:file.revision,requestKey:randomUUID()});for(let i=0;i<5;i++)if(!await worker.runNext(false))break;expect(readFileSync(join(directory,'project-assets',file.id,file.original.name),'utf8')).toBe('reader protected bytes');expect((await call('get',base+'/assets/'+file.id)).status).toBe('deleting');}finally{await release();}
    await new Promise(resolve=>setTimeout(resolve,10));for(let i=0;i<20;i++)if(!await worker.runNext(false))break;expect((await call('get',base+'/assets/'+file.id)).status).toBe('deleted');
    const unknown=await settleAsset((await upload(project,Buffer.from('unreferenced file bytes'))).id),note=join(directory,'project-assets',unknown.id,'operator-note.txt');writeFileSync(note,'retained operator evidence');await call('post',base+'/assets/'+unknown.id+'/delete',{expectedRevision:unknown.revision,requestKey:randomUUID()});for(let i=0;i<5;i++)if(!await worker.runNext(false))break;expect(readFileSync(note,'utf8')).toBe('retained operator evidence');expect((await call('get',base+'/assets/'+unknown.id)).status).toBe('deleting');rmSync(note);await new Promise(resolve=>setTimeout(resolve,10));for(let i=0;i<20;i++)if(!await worker.runNext(false))break;expect((await call('get',base+'/assets/'+unknown.id)).status).toBe('deleted');worker.collectionDelayMs=30000;
  });
  it('keeps a large artifact complete and asks the model only about an explicitly selected saved scope',async()=>{
    let project=await open();const stage=project.definition.stages[0],values=Object.fromEntries(stage.fields.map((field:any,index:number)=>[field.id,(index?'SECOND_FIELD_':'FIRST_FIELD_').repeat(950).slice(0,12000)]));
    project=await call('patch','/learning/projects/'+project.id,{expectedRevision:project.revision,requestKey:randomUUID(),stageId:stage.id,artifact:{values,evidence:[]}});
    const provider=app.get(require('../../../dist/apps/api/src/modules/ai/xiaojiu-chat.service.js').XiaojiuChatService),mocked=vi.spyOn(provider,'reply').mockResolvedValue({reply:'比较所选文字中的条件并补充一个反例。',modelName:'Synthetic scope QA'});
    try{
      const command={expectedRevision:project.revision,requestKey:randomUUID(),stageId:stage.id};await call('post','/learning/projects/'+project.id+'/advice',command,parent,400);expect(mocked).not.toHaveBeenCalled();
      await call('post','/learning/projects/'+project.id+'/advice',{...command,requestKey:randomUUID(),scope:{fieldIds:['foreign-field'],evidenceIds:[],attachmentIds:[]}},parent,400);
      const scope={fieldIds:[stage.fields[0].id],evidenceIds:[],attachmentIds:[]},saved=await call('post','/learning/projects/'+project.id+'/advice',{...command,requestKey:randomUUID(),scope});expect(saved.drafts[stage.id].values).toEqual(values);expect(saved.advice.at(-1).scope).toEqual(scope);
      const context=(mocked.mock.calls[0][0] as any).context;expect(context.length).toBeLessThanOrEqual(18000);expect(context).toContain('FIRST_FIELD_');expect(context).not.toContain('SECOND_FIELD_');expect(JSON.parse(context).artifact.values[stage.fields[0].id]).toBe(values[stage.fields[0].id]);
    }finally{mocked.mockRestore();}
  });
  it('retains a shared learner submission and real bytes after its original guardian closes their account',async()=>{
    const keeper=await call('post','/auth/register',{principal:'file-keeper@test',credential:'Project-files-only-20261025'},null),invite=await call('post',`/students/${studentId}/invitations`,{recipientPrincipal:keeper.user.principal});await call('post',`/parents/${keeper.user.id}/bindings`,{studentId,inviteToken:invite.token},keeper);
    const grant=await store.requestContext(()=>structuredClone(store.find('studentLearningAccess',{studentId}))),code=await call('post',`/students/${studentId}/learning-access/codes`,{expectedVersion:grant.version,requestKey:randomUUID()}),fresh=await call('post','/auth/learning-code',{code:code.code},null);
    let project=await call('post','/learning/projects',{unitId:'file-unit',studioCourseId:courseId},fresh);const file=await settleAsset((await upload(project,Buffer.from('shared learner original'),'text/plain',fresh)).id,fresh),artifact={values:Object.fromEntries(project.definition.stages[0].fields.map((field:any)=>[field.id,'保留共同监护下的真实作品'])),evidence:[],attachments:[{assetId:file.id,label:'共同保留原件',caption:'本次提交'}]};
    project=await call('post','/learning/projects/'+project.id+'/submissions',{expectedRevision:project.revision,requestKey:randomUUID(),stageId:project.currentStageId,artifact,selfRatings:project.definition.rubric.map((criterion:any)=>({criterionId:criterion.id,level:1,evidence:'原件中有步骤记录'})),revisionNote:''},fresh);const frozen=structuredClone(project.submissions[0]);
    const preview=await call('get','/privacy/account/deletion-preview');await call('post','/privacy/account/delete',{credential:'Project-files-only-20261025',confirmation:preview.confirmation,fingerprint:preview.fingerprint,requestKey:randomUUID()});
    await worker.sweep();for(let i=0;i<100;i++)if(!await worker.runNext(false))break;
    expect((await call('get','/learning/projects/'+project.id,undefined,keeper)).submissions[0]).toEqual(frozen);expect((await call('get',base+'/assets/'+file.id,undefined,keeper)).original.sha256).toBe(file.original.sha256);expect(readFileSync(join(directory,'project-assets',file.id,file.original.name),'utf8')).toBe('shared learner original');
    await store.requestContext(()=>expect(store.find('projectAssets',{id:file.id}).authorization.guardianId).toBe('deleted-account'));
  });
});

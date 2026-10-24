import { afterEach, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { DomainDatabase } from './domain-database';
const repo=resolve(__dirname,'../../../..'),backup=require(join(repo,'scripts/operations/backup.cjs')),ledgerTools=require(join(repo,'scripts/operations/privacy-ledger.cjs'));
const hash=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
describe('SQLite restores resume from bound copies and transactional completion',()=>{
 const roots:string[]=[],children:ChildProcess[]=[];
 afterEach(async()=>{
  for(const child of children.splice(0)){if(child.exitCode===null&&child.signalCode===null){const ended=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill('SIGKILL');await ended;}}
  for(const root of roots.splice(0)){if(!resolve(root).startsWith(resolve(tmpdir())+sep))throw new Error('Unsafe restore QA root');fs.rmSync(root,{recursive:true,force:true});}
 });
 async function fixture(){
  const root=fs.mkdtempSync(join(tmpdir(),'study-resume-'));roots.push(root);const source=join(root,'source'),bundle=join(root,'bundle'),target=join(root,'target');fs.mkdirSync(source);
  const db=new DomainDatabase(join(source,'study-agent.sqlite3'));await db.open();
  const original=Buffer.from('private original '+randomUUID()),sha=hash(original),page=Buffer.from('private source page'),chunk=Buffer.from('cancelled upload chunk'),upload='studio_upload_'+randomUUID(),uploadSha=hash(chunk),blob=Buffer.alloc(2*1024*1024,81),blobSha=hash(blob),media='student_media_'+randomUUID(),mediaBytes=Buffer.from('private student recording'),mediaSha=hash(mediaBytes);
  function file(relative:string,bytes:Buffer){const path=join(source,relative);fs.mkdirSync(dirname(path),{recursive:true});fs.writeFileSync(path,bytes);}
  file('studio-materials/'+sha+'.pdf',original);file('studio-materials/processed/'+sha+'/page-1.png',page);file('studio-uploads/'+upload+'/0-'+uploadSha,chunk);file('processing/blobs/'+blobSha,blob);
  file('student-media/'+media+'/ready/'+mediaSha,mediaBytes);
  try{await db.commit(await db.read(),{users:[{id:'owner',role:'parent',status:'active'}],students:[{id:'erased-child'}],studentMedia:[{id:media,ownerUserId:'owner',studentId:'erased-child',status:'ready',sha256:mediaSha,storedSize:mediaBytes.length}],sessions:[{id:'old',userId:'owner',tokenHash:'fixture-old-session',revokedAt:null}],studioSourceMaterials:[{id:'private-source',ownerUserId:'owner',studentId:'erased-child',kind:'pdf',sha256:sha,byteSize:original.length,pageFiles:[{page:1,size:page.length,sha256:hash(page)}]}],studioMaterialUploads:[{id:upload,ownerUserId:'owner',studentId:null,subject:null,status:'cancelled',revision:1,sha256:uploadSha,expiresAt:'2099-01-01T00:00:00Z',chunks:[{index:0,size:chunk.length,sha256:uploadSha}]}],importFiles:[{id:'import_file_'+randomUUID(),status:'ready',sha256:blobSha,size:blob.length,chunks:[]}],diagnosticResponses:[{id:'preserved-evidence',score:0.75}]});await backup.createBundle({dataDir:source,destination:bundle});}finally{await db.close();}
  const ledger=join(root,'deletions.json'),receipt=ledgerTools.makeLedger([{id:'privacy-'+randomUUID(),actorId:'owner',kind:'student_delete',subjectHash:hash(Buffer.from(JSON.stringify({id:'erased-child'}))),inputHash:'a'.repeat(64),requestKey:randomUUID(),completedAt:new Date().toISOString(),erasedStudentHashes:[hash(Buffer.from(JSON.stringify({id:'erased-child'})))],retainedStudentHashes:[],counts:{records:1,observations:0,activities:0,plans:0,conversations:0,accessRecords:0}}]);fs.writeFileSync(ledger,JSON.stringify(receipt));
  return{root,source,bundle,target,ledger,sha,upload,uploadSha,media,blobSha,blob,manifest:fs.readFileSync(join(bundle,'manifest.json')),databaseHash:hash(fs.readFileSync(join(bundle,'database/study-agent.sqlite3')))};
 }
 const restore=(f:any,options:any={})=>backup.restoreBundle({bundle:f.bundle,destination:f.target,deletionLedger:f.ledger,...options});
 async function childAt(f:any,phase:string,selection='any'){
  const child=spawn(process.execPath,[join(repo,'scripts/qa/fixtures/sqlite-restore-child.cjs'),f.root,phase,selection],{windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(child);
  await new Promise<void>((resolve,reject)=>{let output='';const timeout=setTimeout(()=>reject(new Error('Restore child phase timeout')),20000);child.stdout!.on('data',bytes=>{output+=bytes;if(output.includes('\n')){clearTimeout(timeout);expect(JSON.parse(output.trim()).phase).toBe(phase);resolve();}});child.once('error',error=>{clearTimeout(timeout);reject(error);});child.once('exit',()=>{clearTimeout(timeout);reject(new Error('Restore child exited before phase'));});});return child;
 }
 async function kill(child:ChildProcess){const done=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill('SIGKILL');await done;}
 async function verified(f:any){
  if(fs.existsSync(join(f.target,'.study-restore-incomplete'))){
   const names=['NODE_ENV','STUDY_STORAGE','STUDY_DATA_DIR','STUDY_SEED_FOUNDATION'],prior=Object.fromEntries(names.map(name=>[name,process.env[name]]));
   try{Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:'sqlite',STUDY_DATA_DIR:f.target,STUDY_SEED_FOUNDATION:'false'});const{InMemoryStoreService}=require('../../dist/apps/api/src/infrastructure/in-memory-store.service.js');await expect(new InMemoryStoreService().onModuleInit()).rejects.toThrow('Data restoration is incomplete');}finally{for(const[name,value]of Object.entries(prior)){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
  }
  const receipt=await restore(f,{resume:true});expect(receipt.appliedDeletionReceipts).toBe(1);expect(fs.existsSync(join(f.target,'student-media',f.media))).toBe(false);expect(fs.existsSync(join(f.target,'.study-restore-incomplete'))).toBe(false);expect(fs.existsSync(join(f.target,'studio-materials',f.sha+'.pdf'))).toBe(false);expect(fs.existsSync(join(f.target,'studio-uploads',f.upload,'0-'+f.uploadSha))).toBe(false);expect(fs.readFileSync(join(f.target,'processing/blobs',f.blobSha))).toEqual(f.blob);
  const db=new DomainDatabase(join(f.target,'study-agent.sqlite3'));await db.open();try{const snapshot=await db.read();expect((snapshot.state.students??[])).toEqual([]);expect((snapshot.state.studioSourceMaterials??[])).toEqual([]);expect(snapshot.state.diagnosticResponses).toEqual([{id:'preserved-evidence',score:0.75}]);expect((snapshot.state.sessions[0]as any).revokedAt).toBeTruthy();expect(snapshot.state.events.filter((row:any)=>row.eventName==='operations.restored')).toHaveLength(1);}finally{await db.close();}
  expect(fs.readFileSync(join(f.bundle,'manifest.json'))).toEqual(f.manifest);expect(hash(fs.readFileSync(join(f.bundle,'database/study-agent.sqlite3')))).toBe(f.databaseHash);expect(JSON.parse(fs.readFileSync(join(f.target,'restore-receipt.json'),'utf8'))).toEqual(receipt);return receipt;
 }
 for(const[phase,selection]of [['copy_created','database'],['copy_chunk','ordinary'],['copy_synced','database'],['copy_published','database'],['copy_published','ordinary'],['database_imported','any'],['ledger_applied','any'],['material_file_deleted','any'],['before_commit','any'],['sql_committed','any'],['receipt_copy_created','any'],['receipt_copy_published','any'],['restore_finished','any']]){
  it('recovers after a real parent SIGKILL at '+phase+'/'+selection,async()=>{const f=await fixture(),child=await childAt(f,phase,selection);await kill(child);await verified(f);},60000);
 }
 it('rejects a competing live operation and resumes after its actual process exits',async()=>{const f=await fixture(),child=await childAt(f,'operation_acquired');await expect(restore(f,{resume:true})).rejects.toThrow('restore_operation_active');await kill(child);await verified(f);});
 it('returns the original completed receipt after legal subsequent learning without repeating fences or cleanup',async()=>{
  const f=await fixture(),receipt=await restore(f),db=new DomainDatabase(join(f.target,'study-agent.sqlite3'));await db.open();let expected;
  try{const snapshot=await db.read();await db.commit(snapshot,{...snapshot.state,diagnosticResponses:[...snapshot.state.diagnosticResponses,{id:'new-learning',score:1}]});expected=await db.read();}finally{await db.close();}
  expect(await restore(f,{resume:true})).toEqual(receipt);const reopened=new DomainDatabase(join(f.target,'study-agent.sqlite3'));await reopened.open();try{expect(await reopened.read()).toEqual(expected);}finally{await reopened.close();}
 });
 it('refuses changed backup/ledger/target identities and preserves an unexpected destination file',async()=>{
  const f=await fixture(),child=await childAt(f,'database_imported');await kill(child);
  const changed=join(f.root,'other-ledger.json');fs.writeFileSync(changed,JSON.stringify(ledgerTools.makeLedger([])));await expect(restore(f,{resume:true,deletionLedger:changed})).rejects.toThrow('identity_mismatch');
  const moved=join(f.root,'moved-target');fs.renameSync(f.target,moved);await expect(restore(f,{resume:true,destination:moved})).rejects.toThrow('identity_mismatch');fs.renameSync(moved,f.target);
  const original=fs.readFileSync(join(f.bundle,'manifest.json'),'utf8'),manifest=JSON.parse(original);manifest.id=randomUUID();fs.writeFileSync(join(f.bundle,'manifest.json'),JSON.stringify(manifest));await expect(restore(f,{resume:true})).rejects.toThrow('identity_mismatch');fs.writeFileSync(join(f.bundle,'manifest.json'),original);
  const conflict=join(f.target,'processing/blobs',f.blobSha);fs.mkdirSync(dirname(conflict),{recursive:true});fs.writeFileSync(conflict,'administrator bytes');await expect(restore(f,{resume:true})).rejects.toThrow('existing_file_mismatch');expect(fs.readFileSync(conflict,'utf8')).toBe('administrator bytes');expect(fs.existsSync(join(f.target,'.study-restore-incomplete'))).toBe(true);
 });
 it('keeps linked or unknown material controls and refuses to remove the restore guard',async()=>{
  const f=await fixture(),child=await childAt(f,'files_copied');await kill(child);const directory=join(f.target,'studio-materials/control',f.sha);fs.mkdirSync(directory,{recursive:true});const unknown=join(directory,'notes.txt');fs.writeFileSync(unknown,'unrelated control');await expect(restore(f,{resume:true})).rejects.toThrow('inventory_unknown');expect(fs.readFileSync(unknown,'utf8')).toBe('unrelated control');
  fs.unlinkSync(unknown);const original=join(f.target,'studio-materials',f.sha+'.pdf'),outside=join(f.root,'outside');fs.mkdirSync(outside);fs.renameSync(original,join(outside,'original'));fs.symlinkSync(outside,join(f.target,'linked'),process.platform==='win32'?'junction':'dir');fs.rmSync(join(f.target,'studio-materials/processed'),{recursive:true});fs.symlinkSync(outside,join(f.target,'studio-materials/processed'),process.platform==='win32'?'junction':'dir');await expect(restore(f,{resume:true})).rejects.toThrow('symbolic_link_not_allowed');expect(fs.existsSync(join(outside,'original'))).toBe(true);
 });
 it('fails closed if imported business data changed before the cleanup transaction committed',async()=>{const f=await fixture(),child=await childAt(f,'database_imported');await kill(child);const db=new DatabaseSync(join(f.target,'study-agent.sqlite3'));try{db.exec('UPDATE store_meta SET revision=revision+1');}finally{db.close();}await expect(restore(f,{resume:true})).rejects.toThrow('restore_imported_database_changed');});
 it('supports the explicit CLI resume flag and refuses a different already-published receipt',async()=>{
  const f=await fixture(),child=await childAt(f,'sql_committed');await kill(child);
  const receiptFile=join(f.target,'restore-receipt.json');fs.writeFileSync(receiptFile,'unrelated receipt');await expect(restore(f,{resume:true})).rejects.toThrow('existing_file_mismatch');expect(fs.readFileSync(receiptFile,'utf8')).toBe('unrelated receipt');fs.unlinkSync(receiptFile);
  const result=execFileSync(process.execPath,[join(repo,'scripts/operations/backup.cjs'),'restore','--resume','--bundle',f.bundle,'--destination',f.target,'--deletion-ledger',f.ledger],{encoding:'utf8',windowsHide:true,timeout:20000});expect(JSON.parse(result)).toEqual(await verified(f));
 });
 it('keeps an unknown operation database intact and rejects a linked database sidecar',async()=>{
  const f=await fixture(),child=await childAt(f,'database_imported');await kill(child);const file=join(f.target,'.study-restore-control/operation.sqlite3'),saved=fs.readFileSync(file),unknown=Buffer.from('unrelated database bytes');fs.writeFileSync(file,unknown);await expect(restore(f,{resume:true})).rejects.toThrow();expect(fs.readFileSync(file)).toEqual(unknown);fs.writeFileSync(file,saved);
  const outside=join(f.root,'outside-sidecar');fs.mkdirSync(outside);fs.writeFileSync(join(outside,'original'),'outside original');const target=join(f.target,'study-agent.sqlite3-journal');fs.symlinkSync(outside,target,process.platform==='win32'?'junction':'dir');await expect(restore(f,{resume:true})).rejects.toThrow('symbolic_link_not_allowed');expect(fs.readFileSync(join(outside,'original'),'utf8')).toBe('outside original');
 });
 it('preserves unlisted media bytes after failed cleanup and replenishes deleted source files before retrying',async()=>{
  const f=await fixture(),child=await childAt(f,'files_copied');await kill(child);const notes=join(f.target,'student-media',f.media,'notes.txt');fs.writeFileSync(notes,'unlisted administrator bytes');await expect(restore(f,{resume:true})).rejects.toThrow('restore_media_inventory_unknown');expect(fs.readFileSync(notes,'utf8')).toBe('unlisted administrator bytes');expect(fs.existsSync(join(f.target,'.study-restore-incomplete'))).toBe(true);fs.unlinkSync(notes);await verified(f);
 });
});

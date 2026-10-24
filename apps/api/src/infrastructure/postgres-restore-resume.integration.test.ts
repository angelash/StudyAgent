import { afterAll, beforeAll, afterEach, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { Pool } from 'pg';
import { DomainDatabase } from './domain-database';
const location=process.env.STUDY_TEST_POSTGRES_RESTORE_RESUME_URL,repo=resolve(__dirname,'../../../..'),backup=require(join(repo,'scripts/operations/postgres-backup.cjs')),ledgerTools=require(join(repo,'scripts/operations/privacy-ledger.cjs'));
const hash=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
describe.runIf(Boolean(location))('PostgreSQL full restore continuation and durable completion',()=>{
 const roots:string[]=[],databases:string[]=[],children:ChildProcess[]=[];let admin:Pool;
 beforeAll(async()=>{const probe=new Pool({connectionString:location});try{expect((await probe.query('SELECT current_database() AS name,current_user AS owner')).rows[0]).toEqual({name:'study_agent_qa',owner:'study_agent_app'});}finally{await probe.end();}if(!process.env.STUDY_TEST_POSTGRES_ADMIN_URL)throw new Error('Dedicated QA admin required');admin=new Pool({connectionString:process.env.STUDY_TEST_POSTGRES_ADMIN_URL});expect((await admin.query('SELECT current_user AS name')).rows[0].name).toBe('study_qa_admin');});
 afterEach(async()=>{
  for(const child of children.splice(0)){if(child.exitCode===null&&child.signalCode===null){const ended=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill('SIGKILL');await ended;}}
  for(const name of databases.splice(0)){if(!/^study_qa_resume_[a-f0-9]{32}$/.test(name))throw new Error('Unsafe PG resume QA database');await admin.query('DROP DATABASE "'+name+'" WITH (FORCE)');}
  for(const root of roots.splice(0)){if(!resolve(root).startsWith(resolve(tmpdir())+sep))throw new Error('Unsafe PG resume QA root');fs.rmSync(root,{recursive:true,force:true});}
 });
 afterAll(async()=>{await admin?.end();});
 async function databaseUrl(){const name='study_qa_resume_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE "'+name+'" OWNER study_agent_app');databases.push(name);const url=new URL(location!);url.pathname='/'+name;return url.toString();}
 async function fixture(){
  const root=fs.mkdtempSync(join(tmpdir(),'study-pg-resume-'));roots.push(root);const source=join(root,'source'),bundle=join(root,'bundle'),target=join(root,'target'),sourceUrl=await databaseUrl(),targetUrl=await databaseUrl();fs.mkdirSync(source);
  const db=new DomainDatabase(sourceUrl);await db.open();
  const original=Buffer.from('private original '+randomUUID()),sha=hash(original),page=Buffer.from('private source page'),chunk=Buffer.from('cancelled upload chunk'),upload='studio_upload_'+randomUUID(),uploadSha=hash(chunk),blob=Buffer.alloc(2*1024*1024,81),blobSha=hash(blob),media='student_media_'+randomUUID(),mediaBytes=Buffer.from('private student recording'),mediaSha=hash(mediaBytes);
  function file(relative:string,bytes:Buffer){const path=join(source,relative);fs.mkdirSync(dirname(path),{recursive:true});fs.writeFileSync(path,bytes);}
  file('studio-materials/'+sha+'.pdf',original);file('studio-materials/processed/'+sha+'/page-1.png',page);file('studio-uploads/'+upload+'/0-'+uploadSha,chunk);file('processing/blobs/'+blobSha,blob);file('student-media/'+media+'/ready/'+mediaSha,mediaBytes);
  try{await db.commit(await db.read(),{users:[{id:'owner',role:'parent',status:'active'}],students:[{id:'erased-child'}],studentMedia:[{id:media,ownerUserId:'owner',studentId:'erased-child',status:'ready',sha256:mediaSha,storedSize:mediaBytes.length}],sessions:[{id:'old',userId:'owner',tokenHash:'fixture-old-session',revokedAt:null}],studioSourceMaterials:[{id:'private-source',ownerUserId:'owner',studentId:'erased-child',kind:'pdf',sha256:sha,byteSize:original.length,pageFiles:[{page:1,size:page.length,sha256:hash(page)}]}],studioMaterialUploads:[{id:upload,ownerUserId:'owner',studentId:null,subject:null,status:'cancelled',revision:1,sha256:uploadSha,expiresAt:'2099-01-01T00:00:00Z',chunks:[{index:0,size:chunk.length,sha256:uploadSha}]}],importFiles:[{id:'import_file_'+randomUUID(),status:'ready',sha256:blobSha,size:blob.length,chunks:[]}],diagnosticResponses:[{id:'preserved-evidence',score:0.75}]});await backup.createPostgresBundle({connectionString:sourceUrl,pgBin:process.env.STUDY_TEST_PG_BIN,dataDir:source,destination:bundle});}finally{await db.close();}
  const ledger=join(root,'deletions.json'),receipt=ledgerTools.makeLedger([{id:'privacy-'+randomUUID(),actorId:'owner',kind:'student_delete',subjectHash:hash(Buffer.from(JSON.stringify({id:'erased-child'}))),inputHash:'a'.repeat(64),requestKey:randomUUID(),completedAt:new Date().toISOString(),erasedStudentHashes:[hash(Buffer.from(JSON.stringify({id:'erased-child'})))],retainedStudentHashes:[],counts:{records:1,observations:0,activities:0,plans:0,conversations:0,accessRecords:0}}]);fs.writeFileSync(ledger,JSON.stringify(receipt));
  return{root,source,bundle,target,ledger,sha,upload,uploadSha,media,blobSha,blob,sourceUrl,targetUrl,manifest:fs.readFileSync(join(bundle,'manifest.json')),databaseHash:hash(fs.readFileSync(join(bundle,'database/postgres.dump')))};
 }
 const restore=(f:any,options:any={})=>backup.restorePostgresBundle({bundle:f.bundle,destination:f.target,connectionString:f.targetUrl,pgBin:process.env.STUDY_TEST_PG_BIN,deletionLedger:f.ledger,...options});
 async function childAt(f:any,phase:string,selection='any'){
  const child=spawn(process.execPath,[join(repo,'scripts/qa/fixtures/postgres-restore-child.cjs'),f.root,phase,selection],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,STUDY_TEST_RESTORE_RESUME_TARGET_URL:f.targetUrl}});children.push(child);
  await new Promise<void>((resolve,reject)=>{let output='';const timeout=setTimeout(()=>reject(new Error('PG restore child phase timeout')),20000);child.stdout!.on('data',bytes=>{output+=bytes;if(output.includes('\n')){clearTimeout(timeout);expect(JSON.parse(output.trim()).phase).toBe(phase);resolve();}});child.once('error',error=>{clearTimeout(timeout);reject(error);});child.once('exit',()=>{clearTimeout(timeout);reject(new Error('PG restore child exited before phase'));});});return child;
 }
 async function kill(child:ChildProcess){const done=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill('SIGKILL');await done;}
 async function verified(f:any){
  let receipt:any;for(let attempt=0;;attempt++){try{receipt=await restore(f,{resume:true});break;}catch(error){if(attempt>=20||!(error as Error).message.includes('postgres_restore_native_import_active'))throw error;await new Promise(resolve=>setTimeout(resolve,25));}}
  expect(receipt.appliedDeletionReceipts).toBe(1);expect(fs.existsSync(join(f.target,'.study-restore-incomplete'))).toBe(false);expect(fs.existsSync(join(f.target,'studio-materials',f.sha+'.pdf'))).toBe(false);expect(fs.existsSync(join(f.target,'studio-uploads',f.upload,'0-'+f.uploadSha))).toBe(false);expect(fs.existsSync(join(f.target,'student-media',f.media))).toBe(false);expect(fs.readFileSync(join(f.target,'processing/blobs',f.blobSha))).toEqual(f.blob);
  const db=new DomainDatabase(f.targetUrl);await db.open();try{const snapshot=await db.read();expect(snapshot.state.students??[]).toEqual([]);expect(snapshot.state.studioSourceMaterials??[]).toEqual([]);expect(snapshot.state.diagnosticResponses).toEqual([{id:'preserved-evidence',score:0.75}]);expect((snapshot.state.sessions[0]as any).revokedAt).toBeTruthy();expect(snapshot.state.events.filter((row:any)=>row.eventName==='operations.restored')).toHaveLength(1);}finally{await db.close();}
  expect(fs.readFileSync(join(f.bundle,'manifest.json'))).toEqual(f.manifest);expect(hash(fs.readFileSync(join(f.bundle,'database/postgres.dump')))).toBe(f.databaseHash);expect(JSON.parse(fs.readFileSync(join(f.target,'restore-receipt.json'),'utf8'))).toEqual(receipt);return receipt;
 }
 for(const[phase,selection]of [['operation_acquired','any'],['postgres_initialized','any'],['copy_chunk','large'],['copy_published','ordinary'],['files_copied','any'],['prefix_sent','any'],['archive_sent','any'],['import_committed','any'],['ledger_applied','any'],['material_file_deleted','any'],['before_commit','any'],['sql_committed','any'],['receipt_copy_published','any'],['restore_finished','any']]){
  it('resumes after real parent SIGKILL at '+phase+'/'+selection,async()=>{const f=await fixture(),child=await childAt(f,phase,selection);await kill(child);await verified(f);},60000);
 }
 it('rejects a live controller then continues after that process actually exits',async()=>{const f=await fixture(),child=await childAt(f,'postgres_initialized');await expect(restore(f,{resume:true})).rejects.toThrow('postgres_restore_controller_active');await kill(child);await verified(f);});
 it('keeps new legal learning unchanged when reading an already-completed recovery receipt',async()=>{
  const f=await fixture(),receipt=await restore(f),db=new DomainDatabase(f.targetUrl);await db.open();let expected;
  try{const snapshot=await db.read();await db.commit(snapshot,{...snapshot.state,diagnosticResponses:[...snapshot.state.diagnosticResponses,{id:'new-learning',score:1}]});expected=await db.read();}finally{await db.close();}
  expect(await restore(f,{resume:true})).toEqual(receipt);const reopened=new DomainDatabase(f.targetUrl);await reopened.open();try{expect(await reopened.read()).toEqual(expected);}finally{await reopened.close();}
 });
 it('refuses backup, ledger, target database and imported content changes before cleanup',async()=>{
  const f=await fixture(),child=await childAt(f,'import_committed');await kill(child);const ledger=join(f.root,'other-ledger.json');fs.writeFileSync(ledger,JSON.stringify(ledgerTools.makeLedger([])));await expect(restore(f,{resume:true,deletionLedger:ledger})).rejects.toThrow('identity_mismatch');await expect(restore(f,{resume:true,connectionString:await databaseUrl()})).rejects.toThrow('identity_mismatch');
  const original=fs.readFileSync(join(f.bundle,'manifest.json'),'utf8'),manifest=JSON.parse(original);manifest.id=randomUUID();fs.writeFileSync(join(f.bundle,'manifest.json'),JSON.stringify(manifest));await expect(restore(f,{resume:true})).rejects.toThrow('identity_mismatch');fs.writeFileSync(join(f.bundle,'manifest.json'),original);
  const pool=new Pool({connectionString:f.targetUrl});try{await pool.query('UPDATE store_meta SET revision=revision+1');}finally{await pool.end();}await expect(restore(f,{resume:true})).rejects.toThrow('restore_imported_database_changed');
 });
 it('preserves unknown media bytes after failed cleanup and replenishes source files before another resume',async()=>{const f=await fixture(),child=await childAt(f,'files_copied');await kill(child);const file=join(f.target,'student-media',f.media,'notes.txt');fs.writeFileSync(file,'administrator bytes');await expect(restore(f,{resume:true})).rejects.toThrow('restore_media_inventory_unknown');expect(fs.readFileSync(file,'utf8')).toBe('administrator bytes');fs.unlinkSync(file);await verified(f);});
 it('runs the native CLI resume and restores a committed receipt without reapplying the ledger',async()=>{
  const f=await fixture(),child=await childAt(f,'sql_committed');await kill(child);
  const result=execFileSync(process.execPath,[join(repo,'scripts/operations/postgres-backup.cjs'),'restore','--resume','--bundle',f.bundle,'--destination',f.target,'--deletion-ledger',f.ledger,'--connection-env','STUDY_TEST_RESTORE_RESUME_TARGET_URL',...(process.env.STUDY_TEST_PG_BIN?['--pg-bin',process.env.STUDY_TEST_PG_BIN]:[])],{encoding:'utf8',windowsHide:true,timeout:20000,env:{...process.env,STUDY_TEST_RESTORE_RESUME_TARGET_URL:f.targetUrl}});expect(JSON.parse(result)).toEqual(await verified(f));
 });
});

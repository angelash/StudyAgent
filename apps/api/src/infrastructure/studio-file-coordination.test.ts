import { afterEach,describe,it,expect } from 'vitest';
import { mkdtemp,mkdir,writeFile,readFile,unlink,rm,symlink,readdir,stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { acquireStudioFileLease,withStudioFileLease,revokeStudioUploadFiles,inspectStudioFileLeases,studioCoordinationRoot } from './studio-file-coordination';
import { InMemoryStoreService } from './in-memory-store.service';
import { assertStudioAssetAvailable,persistStudioMaterial } from '../modules/learning/studio-material-storage';

describe('studio process/write fences and transactional source identities',()=>{
 const directories:string[]=[];
 afterEach(async()=>{for(const directory of directories.splice(0))await rm(directory,{recursive:true,force:true});});
 async function fixture(){const root=await mkdtemp(join(tmpdir(),'study-file-coordination-'));directories.push(root);return root;}
 it('registers a live lease before checking the purge fence and releases only its own marker',async()=>{
  const root=await fixture(),sha='a'.repeat(64),control=studioCoordinationRoot(root,'source',sha),release=await acquireStudioFileLease(root,'source',sha);
  expect((await inspectStudioFileLeases(root,'source',sha)).map(row=>row.status)).toEqual(['active']);
  const fence=join(control,'purge.json');await writeFile(fence,JSON.stringify({format:'study-file-purge-v1',key:sha}));let writes=0;
  await expect(withStudioFileLease(root,'source',sha,async()=>{writes++;})).rejects.toThrow('回收');expect(writes).toBe(0);
  expect(await inspectStudioFileLeases(root,'source',sha)).toHaveLength(1);await release();expect(await inspectStudioFileLeases(root,'source',sha)).toHaveLength(0);expect(JSON.parse(await readFile(fence,'utf8')).key).toBe(sha);
  await unlink(fence);await withStudioFileLease(root,'source',sha,async()=>{writes++;});expect(writes).toBe(1);
 });
 it('retains a permanent upload revocation outside the chunks, blocking late writers after chunks have gone',async()=>{
  const root=await fixture(),id='studio_upload_'+randomUUID(),chunkRoot=join(root,'studio-uploads',id);await mkdir(chunkRoot,{recursive:true});await writeFile(join(chunkRoot,'temporary'),'private');
  const release=await acquireStudioFileLease(root,'upload',id);await revokeStudioUploadFiles(root,id);await revokeStudioUploadFiles(root,id);
  expect((await inspectStudioFileLeases(root,'upload',id))[0].status).toBe('active');await release();await unlink(join(chunkRoot,'temporary'));let written=false;
  await expect(withStudioFileLease(root,'upload',id,async()=>{written=true;await writeFile(join(chunkRoot,'late'),'private');})).rejects.toThrow('撤销');
  expect(written).toBe(false);expect(await readdir(chunkRoot)).toEqual([]);expect(await inspectStudioFileLeases(root,'upload',id)).toEqual([]);
 });
 it('distinguishes an actually exited process from a live or unknown marker without deleting either',async()=>{
  const root=await fixture(),sha='b'.repeat(64),control=studioCoordinationRoot(root,'source',sha),child=spawn(process.execPath,['-e','process.exit(0)'],{windowsHide:true,stdio:'ignore'});const pid=child.pid!;await new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('exit',()=>resolve());});
  const directory=join(control,'leases');await mkdir(directory,{recursive:true});const nonce=randomUUID();await writeFile(join(directory,nonce+'.json'),JSON.stringify({format:'study-file-lease-v1',nonce,pid,createdAt:new Date().toISOString()}));await writeFile(join(directory,'unknown.txt'),'operator file');
  const leases=await inspectStudioFileLeases(root,'source',sha);expect(leases.find(row=>row.name===nonce+'.json')?.status).toBe('dead');expect(leases.find(row=>row.name==='unknown.txt')?.status).toBe('unknown');expect(await readdir(directory)).toHaveLength(2);
 });
 it('refuses links and unsafe identities before creating a writer marker',async()=>{
  const root=await fixture(),outside=await fixture(),sha='c'.repeat(64);await mkdir(join(root,'studio-materials','control'),{recursive:true});await symlink(outside,studioCoordinationRoot(root,'source',sha),process.platform==='win32'?'junction':'dir');
  await expect(acquireStudioFileLease(root,'source',sha)).rejects.toThrow('link_refused');expect(await readdir(outside)).toEqual([]);
  await expect(acquireStudioFileLease(root,'upload','../outside')).rejects.toThrow('invalid_studio_file_identity');
 });
 it('rejects a stale registration snapshot across independent stores and retains the new generation',async()=>{
  const root=await fixture(),names=['NODE_ENV','STUDY_STORAGE','STUDY_DATA_DIR','DATABASE_URL']as const,prior=Object.fromEntries(names.map(name=>[name,process.env[name]])),location=process.env.STUDY_TEST_FILE_COORDINATION_POSTGRES_URL;let pg:Pool|undefined,schema:string|undefined;
  const first=new InMemoryStoreService(),second=new InMemoryStoreService(),sha='d'.repeat(64);
  try{
   if(location){pg=new Pool({connectionString:location});expect((await pg.query('SELECT current_database() AS name,current_user AS owner')).rows[0]).toEqual({name:'study_agent_qa',owner:'study_agent_app'});schema='study_qa_file_'+randomUUID().replace(/-/g,'');await pg.query('CREATE SCHEMA "'+schema+'"');const url=new URL(location);url.searchParams.set('options','-c search_path='+schema);process.env.DATABASE_URL=url.toString();}
   Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:location?'postgres':'sqlite',STUDY_DATA_DIR:root});
   await first.onModuleInit();await first.onApplicationBootstrap();await second.onModuleInit();await second.onApplicationBootstrap();
   await first.transaction(()=>assertStudioAssetAvailable(first,sha));
   await first.requestContext(async()=>{expect(assertStudioAssetAvailable(first,sha).generation).toBe(1);first.append('studioSourceMaterials',{id:'stale-registration',sha256:sha} as any);await second.transaction(()=>{const row=second.find('studioMaterialAssets',{id:sha})!;row.state='deleting';row.generation++;});await expect(first.commitRequest()).rejects.toThrow('数据已更新');});
   await expect(first.transaction(()=>assertStudioAssetAvailable(first,sha))).rejects.toThrow('回收');
   await second.transaction(()=>{const row=second.find('studioMaterialAssets',{id:sha})!;row.state='available';row.generation++;});
   await first.transaction(()=>{expect(assertStudioAssetAvailable(first,sha).generation).toBe(3);});
   await first.requestContext(async()=>{
    expect(assertStudioAssetAvailable(first,sha).generation).toBe(3);
    await second.transaction(()=>{const row=second.find('studioMaterialAssets',{id:sha})!;row.state='deleting';row.generation++;});
    await second.transaction(()=>{const row=second.find('studioMaterialAssets',{id:sha})!;row.state='available';row.generation++;});
    await expect(persistStudioMaterial(first,sha,Buffer.from('delayed private bytes'))).rejects.toThrow('版本已变化');
    await expect(stat(join(root,'studio-materials',sha+'.pdf'))).rejects.toMatchObject({code:'ENOENT'});
   });
  }finally{await first.onModuleDestroy();await second.onModuleDestroy();if(pg){try{if(schema){if(!/^study_qa_file_[a-f0-9]{32}$/.test(schema))throw new Error('Unsafe file-fence QA schema');await pg.query('DROP SCHEMA "'+schema+'" CASCADE');}}finally{await pg.end();}}for(const[name,value]of Object.entries(prior)){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
 });
});

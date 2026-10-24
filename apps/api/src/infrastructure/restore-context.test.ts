import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DomainDatabase } from './domain-database';
const contexts=require(resolve(__dirname,'../../../../scripts/operations/restore-context.cjs'));
describe('immutable restore context publication and identity',()=>{
 const roots:string[]=[];
 afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
 async function fixture(){const root=await mkdtemp(join(tmpdir(),'study-restore-context-'));roots.push(root);return root;}
 const manifest=()=>({id:randomUUID(),files:[{path:'database/study-agent.sqlite3',size:100,sha256:'a'.repeat(64)}]});
 it('binds the backup, ledger, driver and target, and excludes passwords/URLs/paths from stored identity',async()=>{
  const root=await fixture(),connectionString='postgresql://study_agent_app:only-fixture-secret@127.0.0.1:15439/study_qa_context?sslmode=disable',input={root,driver:'postgres',manifest:manifest(),ledger:{sha256:'b'.repeat(64)},connectionString},value=await contexts.createRestoreContext(input),loaded=await contexts.readRestoreContext(root);
  expect(loaded).toEqual(value);expect(()=>contexts.assertRestoreContextMatches(loaded,input)).not.toThrow();const content=await readFile(join(root,'.study-restore-control/context.json'),'utf8');expect(content).not.toContain('only-fixture-secret');expect(content).not.toContain('postgresql://');expect(content).not.toContain(root);expect(await readdir(join(root,'.study-restore-control/staging'))).toEqual([]);
  const passwordChanged=new URL(connectionString);passwordChanged.password='new-fixture-password';expect(()=>contexts.assertRestoreContextMatches(loaded,{...input,connectionString:passwordChanged.toString()})).not.toThrow();
  for(const change of [{root:await fixture()},{driver:'sqlite'},{manifest:{...input.manifest,files:[]}},{ledger:{sha256:'c'.repeat(64)}},{connectionString:connectionString.replace('study_qa_context','study_qa_other')}])expect(()=>contexts.assertRestoreContextMatches(loaded,{...input,...change})).toThrow('identity_mismatch');
 });
 it('retains a fully published identity on later errors and never exposes partial official JSON at any phase',async()=>{
  for(const phase of ['created','written','synced','published','cleaned']){
   const root=await fixture(),input={root,driver:'sqlite',manifest:manifest(),afterPhase:async(current:string)=>{if(current===phase)throw new Error('injected context publication error');}};
   await expect(contexts.createRestoreContext(input)).rejects.toThrow('injected');
   if(['published','cleaned'].includes(phase))expect((await contexts.readRestoreContext(root)).backupId).toBe(input.manifest.id);else await expect(readFile(join(root,'.study-restore-control/context.json'))).rejects.toMatchObject({code:'ENOENT'});
   expect(await readdir(join(root,'.study-restore-control/staging'))).toEqual([]);
  }
 });
 it('refuses to replace an existing identity even when the caller supplies another valid backup',async()=>{
  const root=await fixture(),input={root,driver:'sqlite',manifest:manifest()},value=await contexts.createRestoreContext(input),before=await readFile(join(root,'.study-restore-control/context.json'));
  await expect(contexts.createRestoreContext({...input,manifest:manifest()})).rejects.toMatchObject({code:'EEXIST'});expect(await readFile(join(root,'.study-restore-control/context.json'))).toEqual(before);expect(await contexts.readRestoreContext(root)).toEqual(value);
 });
 it('rejects incomplete, oversized and linked context records while preserving their original bytes',async()=>{
  const root=await fixture(),control=join(root,'.study-restore-control');await mkdir(control);const file=join(control,'context.json');await writeFile(file,'{');await expect(contexts.readRestoreContext(root)).rejects.toThrow();expect(await readFile(file,'utf8')).toBe('{');await writeFile(file,Buffer.alloc(4097));await expect(contexts.readRestoreContext(root)).rejects.toThrow('invalid_restore_context');
  const linked=await fixture(),outside=await fixture();await contexts.createRestoreContext({root:outside,driver:'sqlite',manifest:manifest()});const outsideFile=join(outside,'.study-restore-control/context.json'),before=await readFile(outsideFile);await symlink(join(outside,'.study-restore-control'),join(linked,'.study-restore-control'),process.platform==='win32'?'junction':'dir');await expect(contexts.readRestoreContext(linked)).rejects.toThrow('link_refused');expect(await readFile(outsideFile)).toEqual(before);
 });
 it('verifies a read-only backup without loading the compiled application runtime',async()=>{
  const root=await fixture(),source=join(root,'source'),bundle=join(root,'bundle');await mkdir(source);const db=new DomainDatabase(join(source,'study-agent.sqlite3'));await db.open();
  try{
   const repo=resolve(__dirname,'../../../..'),backup=require(join(repo,'scripts/operations/backup.cjs'));await backup.createBundle({dataDir:source,destination:bundle});
   const code="const M=require('node:module'),p=require('node:path'),load=M._load;M._load=function(name,...args){if(String(name).split(String.fromCharCode(92)).join('/').includes('apps/api/dist'))throw new Error('Compiled application runtime must not load');return load.call(this,name,...args);};require(p.join(process.argv[1],'scripts/operations/backup.cjs')).verifyBundle({bundle:process.argv[2]}).then(r=>process.stdout.write(JSON.stringify({verifiedFiles:r.verifiedFiles}))).catch(()=>process.exit(1));";
   expect(JSON.parse(execFileSync(process.execPath,['-e',code,repo,bundle],{encoding:'utf8',windowsHide:true,timeout:15000}))).toEqual({verifiedFiles:1});
  }finally{await db.close();}
 });
});

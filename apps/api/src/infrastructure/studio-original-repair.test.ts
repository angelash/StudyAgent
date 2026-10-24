import { afterEach, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { recoverStudioOriginal, type OriginalRepairIdentity, type OriginalRepairPhase } from './studio-original-repair';
import { acquireStudioFileLease } from './studio-file-coordination';
const repo=resolve(__dirname,'../../../..'),hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
describe('recoverable byte protocol for an explicitly authorized original repair',()=>{
 const roots:string[]=[],children:ChildProcess[]=[];
 afterEach(async()=>{
  for(const child of children.splice(0)){if(child.exitCode===null&&child.signalCode===null){const ended=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill('SIGKILL');await ended;}}
  for(const root of roots.splice(0)){if(!resolve(root).startsWith(resolve(tmpdir())+sep))throw new Error('Unsafe original repair root');fs.rmSync(root,{recursive:true,force:true});}
 });
 function fixture(options:{missing?:boolean;bytes?:Buffer}={}){
  const root=fs.mkdtempSync(join(tmpdir(),'study-original-repair-'));roots.push(root);const bytes=options.bytes??Buffer.concat([Buffer.from('%PDF-1.7\n'),Buffer.alloc(5*1024*1024-9,81)]),sha256=hash(bytes),original=join(root,'studio-materials',sha256+'.pdf'),old=Buffer.from('known truncated original'),identity:OriginalRepairIdentity={id:'studio_repair_'+randomUUID(),sha256,size:bytes.length,generation:7,taskId:'task_'+randomUUID(),token:randomUUID(),bindingHash:hash(Buffer.from(randomUUID()))};
  fs.mkdirSync(dirname(original),{recursive:true});if(!options.missing)fs.writeFileSync(original,old);
  const chunks:Array<{path:string;size:number;sha256:string}>=[];fs.mkdirSync(join(root,'uploads'));
  for(let offset=0,index=0;offset<bytes.length;offset+=4*1024*1024,index++){const part=bytes.subarray(offset,offset+4*1024*1024),path=join(root,'uploads',index+'.bin');fs.writeFileSync(path,part);chunks.push({path,size:part.length,sha256:hash(part)});}
  fs.writeFileSync(join(root,'fixture.json'),JSON.stringify({identity,chunks:chunks.map(({size,sha256})=>({size,sha256}))}));
  return{root,bytes,old,original,identity,chunks,directory:join(root,'studio-materials/control',sha256,'repairs',identity.id)};
 }
 const run=(f:ReturnType<typeof fixture>,options:Partial<Parameters<typeof recoverStudioOriginal>[0]>={})=>recoverStudioOriginal({root:f.root,identity:f.identity,chunks:f.chunks,guard:async()=>{},...options});
 async function childAt(f:ReturnType<typeof fixture>,phase:string){
  const child=spawn(process.execPath,[join(repo,'scripts/qa/fixtures/original-repair-child.cjs'),f.root,phase],{windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(child);
  await new Promise<void>((resolve,reject)=>{let output='';const timeout=setTimeout(()=>reject(new Error('Original repair phase timeout')),20000);child.stdout!.on('data',bytes=>{output+=bytes;if(output.includes('\n')){clearTimeout(timeout);expect(JSON.parse(output.trim()).phase).toBe(phase);resolve();}});child.once('error',error=>{clearTimeout(timeout);reject(error);});child.once('exit',()=>{clearTimeout(timeout);reject(new Error('Original repair child exited early'));});});return child;
 }
 async function kill(child:ChildProcess){const done=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill('SIGKILL');await done;}
 async function finished(f:ReturnType<typeof fixture>){
  const result=await run(f);expect(result).toMatchObject({sha256:f.identity.sha256,size:f.bytes.length});expect(fs.readFileSync(f.original).equals(f.bytes)).toBe(true);expect(fs.existsSync(join(f.directory,'previous.bin'))).toBe(false);expect(fs.existsSync(join(f.directory,'candidate.pdf'))).toBe(false);expect(fs.existsSync(join(f.root,'studio-materials/control',f.identity.sha256,'purge.json'))).toBe(false);
  expect(await run(f)).toMatchObject({reusedOriginal:true});expect(fs.readFileSync(f.original).equals(f.bytes)).toBe(true);
 }
 for(const phase of ['intent_created','intent_written','intent_synced','intent_published','candidate_created','candidate_chunk','candidate_synced','candidate_published','previous_linked','original_removed','original_published','original_verified','previous_removed','candidate_removed','files_finished']){
  it('recovers exact bytes after real Node SIGKILL at '+phase,async()=>{const f=fixture(),child=await childAt(f,phase);await kill(child);await finished(f);},60000);
 }
 it('also restores a missing original, keeping unrelated files intact',async()=>{const f=fixture({missing:true}),other=join(f.root,'studio-materials','unrelated.bin');fs.writeFileSync(other,'untouched');await finished(f);expect(fs.readFileSync(other,'utf8')).toBe('untouched');});
 it('blocks another live writer and a live source reader before creating any private repair candidate',async()=>{
  const f=fixture(),release=await acquireStudioFileLease(f.root,'source',f.identity.sha256);try{await expect(run(f)).rejects.toThrow('active_or_unknown');expect(fs.existsSync(f.directory)).toBe(false);}finally{await release();}
  const child=await childAt(f,'candidate_chunk');await expect(run(f)).rejects.toThrow('owner_active');await kill(child);await finished(f);
 });
 it('checks the authoritative guard again before publication and can continue without rolling back to damaged bytes',async()=>{
  for(const phase of ['candidate_synced','original_removed','original_published']as OriginalRepairPhase[]){const f=fixture();let authorized=true;await expect(run(f,{guard:async()=>{if(!authorized)throw new Error('fixture authorization revoked');},afterPhase:async current=>{if(current===phase)authorized=false;}})).rejects.toThrow('authorization revoked');if(phase==='candidate_synced')expect(fs.readFileSync(f.original)).toEqual(f.old);if(phase==='original_removed')expect(fs.existsSync(f.original)).toBe(false);if(phase==='original_published')expect(fs.readFileSync(f.original).equals(f.bytes)).toBe(true);await finished(f);}
 });
 it('refuses a corrupt chunk and an invalid PDF candidate before touching the original',async()=>{
  const f=fixture();fs.writeFileSync(f.chunks[0].path,'wrong upload bytes');await expect(run(f)).rejects.toThrow('chunk_changed');expect(fs.readFileSync(f.original)).toEqual(f.old);
  const invalid=fixture({bytes:Buffer.from('not a PDF original')});await expect(run(invalid)).rejects.toThrow('candidate_invalid');expect(fs.readFileSync(invalid.original)).toEqual(invalid.old);
 });
 it('preserves a third file replacing the original after intent publication',async()=>{
  const f=fixture(),held=join(f.root,'administrator-held-old');await expect(run(f,{afterPhase:async phase=>{if(phase==='candidate_published'){fs.renameSync(f.original,held);fs.writeFileSync(f.original,'unrelated administrator bytes');}}})).rejects.toThrow('original_changed');expect(fs.readFileSync(f.original,'utf8')).toBe('unrelated administrator bytes');expect(fs.readFileSync(held)).toEqual(f.old);
 });
 it('does not publish a candidate that changed after the old original was retained',async()=>{
  const f=fixture();await expect(run(f,{afterPhase:async phase=>{if(phase==='original_removed')fs.writeFileSync(join(f.directory,'candidate.pdf'),'third candidate bytes');}})).rejects.toThrow('candidate_changed');expect(fs.existsSync(f.original)).toBe(false);expect(fs.readFileSync(join(f.directory,'previous.bin'))).toEqual(f.old);expect(fs.readFileSync(join(f.directory,'candidate.pdf'),'utf8')).toBe('third candidate bytes');
 });
 it('leaves unexpected retained bytes in place after a correct original was published',async()=>{
  const f=fixture();await expect(run(f,{afterPhase:async phase=>{if(phase==='original_published')fs.writeFileSync(join(f.directory,'previous.bin'),'unknown retained bytes');}})).rejects.toThrow('previous_changed');expect(fs.readFileSync(f.original).equals(f.bytes)).toBe(true);expect(fs.readFileSync(join(f.directory,'previous.bin'),'utf8')).toBe('unknown retained bytes');
 });
 it('requires the same immutable repair binding and preserves unknown staged files',async()=>{
  const f=fixture(),child=await childAt(f,'candidate_published');await kill(child);await expect(run(f,{identity:{...f.identity,bindingHash:'a'.repeat(64)}})).rejects.toThrow('intent_unknown');expect(fs.readFileSync(f.original)).toEqual(f.old);
  const unknown=join(f.directory,'notes.txt');fs.writeFileSync(unknown,'administrator bytes');await expect(run(f)).rejects.toThrow('inventory_unknown');expect(fs.readFileSync(unknown,'utf8')).toBe('administrator bytes');
 });
 it('rejects a directory junction introduced during publication and preserves the outside bytes',async()=>{
  const f=fixture(),outside=join(f.root,'outside'),held=join(f.root,'held-directory');fs.mkdirSync(outside);const outsideOriginal=join(outside,f.identity.sha256+'.pdf');fs.writeFileSync(outsideOriginal,'outside original');
  await expect(run(f,{afterPhase:async phase=>{if(phase==='candidate_synced'){fs.renameSync(join(f.root,'studio-materials'),held);fs.symlinkSync(outside,join(f.root,'studio-materials'),process.platform==='win32'?'junction':'dir');}}})).rejects.toThrow('link_refused');expect(fs.readFileSync(outsideOriginal,'utf8')).toBe('outside original');expect(fs.readFileSync(join(held,f.identity.sha256+'.pdf'))).toEqual(f.old);
 });
 it('finishes a previously published correct original even after upload chunks are no longer present',async()=>{const f=fixture(),child=await childAt(f,'original_published');await kill(child);for(const part of f.chunks)fs.unlinkSync(part.path);await finished(f);});
 it('keeps private staged bytes when their immutable intent is missing or belongs to another binding',async()=>{
  const f=fixture(),directory=join(f.directory,'candidates');fs.mkdirSync(directory,{recursive:true});const file=join(directory,'candidate-99999999-'+randomUUID()+'.pending');fs.writeFileSync(file,'unbound private bytes');await expect(run(f)).rejects.toThrow('unbound_candidate');expect(fs.readFileSync(file,'utf8')).toBe('unbound private bytes');expect(fs.readFileSync(f.original)).toEqual(f.old);
  const other=fixture(),child=await childAt(other,'candidate_chunk');await kill(child);const staged=fs.readdirSync(join(other.directory,'candidates'));expect(staged).toHaveLength(1);const pending=join(other.directory,'candidates',staged[0]),before=hash(fs.readFileSync(pending));await expect(run(other,{identity:{...other.identity,bindingHash:'b'.repeat(64)}})).rejects.toThrow('intent_unknown');expect(hash(fs.readFileSync(pending))).toBe(before);
 });
});

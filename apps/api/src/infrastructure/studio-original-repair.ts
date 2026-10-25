import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { publishAtomicMarker } from './atomic-marker-publication';
import { acquireStudioPurgeFence, assertNoFileLinks, pruneDeadStudioFileLeases, StudioFileCollectionPending } from './studio-file-coordination';
import { studioFileUuid } from './studio-file-paths';

const hashPattern=/^[a-f0-9]{64}$/, sourceLimit=50*1024*1024;
export type OriginalRepairIdentity={id:string;sha256:string;size:number;generation:number;taskId:string;token:string;bindingHash:string};
type RegularObservation={kind:'regular';sha256:string;size:number;dev:number;ino:number;mtimeMs:number;pdf:boolean};
export type OriginalRepairObservation={kind:'missing'}|RegularObservation;
type Observation=OriginalRepairObservation;
type Intent={format:'study-original-repair-v1';nonce:string;pid:number;binding:OriginalRepairIdentity;original:Observation};
export type OriginalRepairPhase='intent_created'|'intent_written'|'intent_synced'|'intent_published'|'intent_cleaned'|'candidate_created'|'candidate_chunk'|'candidate_synced'|'candidate_published'|'previous_linked'|'original_removed'|'original_published'|'original_verified'|'previous_removed'|'candidate_removed'|'files_finished';
type GuardedInput={root:string;identity:OriginalRepairIdentity;baseline:Observation;guard:()=>Promise<void>;afterPhase?:(phase:OriginalRepairPhase|'cleanup_finished')=>Promise<void>};
type Input=GuardedInput&{chunks:Array<{path:string;size:number;sha256:string}>};
const pending=(code:string):never=>{throw new StudioFileCollectionPending(code);};
function validateIdentity(value:OriginalRepairIdentity){
 if(!value.id.startsWith('studio_repair_')||!studioFileUuid.test(value.id.slice(14))||!hashPattern.test(value.sha256)||!hashPattern.test(value.bindingHash)||!studioFileUuid.test(value.token)||!value.taskId.startsWith('task_')||!studioFileUuid.test(value.taskId.slice(5))||!Number.isSafeInteger(value.generation)||value.generation<1||!Number.isSafeInteger(value.size)||value.size<5||value.size>sourceLimit)pending('original_repair_identity_unknown');
}
function binding(value:OriginalRepairIdentity){return JSON.stringify({id:value.id,sha256:value.sha256,size:value.size,generation:value.generation,taskId:value.taskId,token:value.token,bindingHash:value.bindingHash});}
function paths(root:string,value:OriginalRepairIdentity){
 validateIdentity(value);const directory=resolve(root,'studio-materials','control',value.sha256,'repairs',value.id);
 return{directory,intent:resolve(directory,'intent.json'),candidate:resolve(directory,'candidate.pdf'),previous:resolve(directory,'previous.bin'),original:resolve(root,'studio-materials',value.sha256+'.pdf')};
}
async function exists(file:string){try{await fs.lstat(file);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}}
function validObservation(value:Observation){return value?.kind==='missing'||value?.kind==='regular'&&hashPattern.test(value.sha256)&&Number.isSafeInteger(value.size)&&value.size>=0&&value.size<=sourceLimit&&Number.isFinite(value.dev)&&Number.isFinite(value.ino)&&Number.isFinite(value.mtimeMs)&&typeof value.pdf==='boolean';}
/** A bounded read through one handle, followed by a path/handle identity check. */
async function observe(file:string):Promise<Observation>{
 await assertNoFileLinks(file);
 let handle;
 try{handle=await fs.open(file,'r');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return{kind:'missing'};throw error;}
 try{
  const before=await handle.stat();if(!before.isFile()||before.size>sourceLimit)pending('original_repair_file_unknown');
  const hash=createHash('sha256');let size=0,pdf=false;
  for await(const chunk of handle.createReadStream({autoClose:false})){if(!size)pdf=chunk.subarray(0,5).toString()==='%PDF-';size+=chunk.length;if(size>sourceLimit)pending('original_repair_file_unknown');hash.update(chunk);}
  await assertNoFileLinks(file);const after=await fs.lstat(file);
  if(!after.isFile()||before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||size!==before.size)pending('original_repair_file_changed');
  return{kind:'regular',sha256:hash.digest('hex'),size,dev:before.dev,ino:before.ino,mtimeMs:before.mtimeMs,pdf};
 }finally{await handle.close();}
}
/** Capture under a source lease in the requesting authorization transaction,
 * before queueing. A worker must never choose a new damaged-file baseline. */
export async function observeStudioOriginal(root:string,sha256:string){
 if(!hashPattern.test(sha256))pending('original_repair_identity_unknown');
 return observe(resolve(root,'studio-materials',sha256+'.pdf'));
}
/** Read-only ownership inventory for the operations audit. Unknown entries throw;
 * a controlled name alone never makes private bytes eligible for deletion. */
export async function inspectStudioOriginalRepair(root:string,identity:OriginalRepairIdentity,baseline:Observation){
 const target=paths(root,identity);assertBaseline(baseline);
 await assertNoFileLinks(target.directory);if(!await exists(target.directory))return{files:[] as string[],directories:[] as string[]};
 const intent=await exists(target.intent)?await readIntent(target.intent,identity):undefined;
 if(intent)assertIntentBaseline(intent,baseline);
 const files:string[]=[],directories=[target.directory];
 for(const name of await fs.readdir(target.directory)){
  const file=resolve(target.directory,name);await assertNoFileLinks(file);const stat=await fs.lstat(file);
  if(name==='intent.json'&&intent){files.push(file);continue;}
  if(name==='candidate.pdf'&&intent&&correct(await observe(file),identity)){files.push(file);continue;}
  if(name==='previous.bin'&&intent&&sameOriginal(await observe(file),intent.original)){files.push(file);continue;}
  if((name==='staging'||name==='candidates')&&stat.isDirectory()){
   directories.push(file);const names=await fs.readdir(file);if(names.length>100)pending('original_repair_inventory_limit');
   for(const pendingName of names){
    const match=(name==='staging'?/^repair-([1-9]\d*)-([a-f0-9-]+)\.pending$/:/^candidate-([1-9]\d*)-([a-f0-9-]+)\.pending$/).exec(pendingName);
    const pendingFile=resolve(file,pendingName);await assertNoFileLinks(pendingFile);const info=await fs.lstat(pendingFile);
    if(!match||!studioFileUuid.test(match[2])||!Number.isSafeInteger(Number(match[1]))||!info.isFile()||info.size>(name==='staging'?4096:sourceLimit)||name==='candidates'&&!intent)pending('original_repair_staging_unknown');
    files.push(pendingFile);
   }continue;
  }
  pending('original_repair_inventory_unknown');
 }
 return{files,directories};
}
function sameOriginal(left:Observation,right:Observation){
 if(left.kind==='missing'||right.kind==='missing')return left.kind===right.kind;
 // Creating/removing our own hard links changes ctime, while the inode and bytes stay the same.
 return left.dev===right.dev&&left.ino===right.ino&&left.size===right.size&&left.mtimeMs===right.mtimeMs&&left.sha256===right.sha256;
}
function correct(value:Observation,identity:OriginalRepairIdentity){return value.kind==='regular'&&value.pdf&&value.size===identity.size&&value.sha256===identity.sha256;}
async function readIntent(file:string,identity:OriginalRepairIdentity):Promise<Intent>{
 await assertNoFileLinks(file);const before=await fs.lstat(file);if(!before.isFile()||before.size>4096)pending('original_repair_intent_unknown');
 const value=JSON.parse(await fs.readFile(file,'utf8')) as Intent;
 if(value.format!=='study-original-repair-v1'||!studioFileUuid.test(value.nonce)||!Number.isSafeInteger(value.pid)||value.pid<1||binding(value.binding)!==binding(identity)||!validObservation(value.original))pending('original_repair_intent_unknown');
 await assertNoFileLinks(file);const after=await fs.lstat(file);
 if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs)pending('original_repair_intent_changed');return value;
}
function dead(pid:number){try{process.kill(pid,0);return false;}catch(error){return(error as NodeJS.ErrnoException).code==='ESRCH';}}
/** Producer names remain meaningful even if a process died before it wrote any JSON or file bytes. */
async function prunePending(directory:string,pattern:RegExp,limit:number,guard:()=>Promise<void>){
 await assertNoFileLinks(directory);if(!await exists(directory))return;
 const names=await fs.readdir(directory);if(names.length>100)pending('original_repair_inventory_limit');
 for(const name of names){
  const match=pattern.exec(name),file=resolve(directory,name);await assertNoFileLinks(file);const before=await fs.lstat(file);
  if(!match)return pending('original_repair_staging_unknown');
  if(!before.isFile()||before.size>limit||!studioFileUuid.test(match[2])||!Number.isSafeInteger(Number(match[1])))pending('original_repair_staging_unknown');
  if(!dead(Number(match[1])))pending('original_repair_producer_active');
  const after=await fs.lstat(file);if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||!dead(Number(match[1])))pending('original_repair_staging_changed');
  await guard();await assertNoFileLinks(file);await fs.unlink(file);
 }
}
async function inventory(directory:string,boundIntent:boolean,guard:()=>Promise<void>){
 await assertNoFileLinks(directory);if(!await exists(directory))return;
 for(const name of await fs.readdir(directory))if(!['intent.json','candidate.pdf','previous.bin','staging','candidates'].includes(name))pending('original_repair_inventory_unknown');
 if(!boundIntent){
  if(await exists(resolve(directory,'candidate.pdf'))||await exists(resolve(directory,'previous.bin')))pending('original_repair_unbound_candidate');
  const candidates=resolve(directory,'candidates');await assertNoFileLinks(candidates);
  if(await exists(candidates)&&(await fs.readdir(candidates)).length)pending('original_repair_unbound_candidate');
 }
 await prunePending(resolve(directory,'staging'),/^repair-([1-9]\d*)-([a-f0-9-]+)\.pending$/,4096,guard);
 if(boundIntent)await prunePending(resolve(directory,'candidates'),/^candidate-([1-9]\d*)-([a-f0-9-]+)\.pending$/,sourceLimit,guard);
}
function assertBaseline(baseline:Observation){if(!validObservation(baseline))pending('original_repair_baseline_unknown');}
function assertIntentBaseline(intent:Intent,baseline:Observation){if(!sameOriginal(intent.original,baseline))pending('original_repair_baseline_changed');}
async function retireIntent(input:GuardedInput,target:ReturnType<typeof paths>){
 await input.guard();
 if(await exists(target.candidate)||await exists(target.previous))pending('original_repair_private_files_remain');
 if(await exists(target.intent)){
  assertIntentBaseline(await readIntent(target.intent,input.identity),input.baseline);
  await input.guard();await assertNoFileLinks(target.intent);await fs.unlink(target.intent);
 }
 for(const directory of [resolve(target.directory,'staging'),resolve(target.directory,'candidates'),target.directory]){
  await input.guard();await assertNoFileLinks(directory);
  try{await fs.rmdir(directory);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')pending('original_repair_directory_not_empty');}
 }
}
async function candidate(input:Input,target:ReturnType<typeof paths>){
 if(input.chunks.length<1||input.chunks.length>13)pending('original_repair_chunk_unknown');
 if(await exists(target.candidate)){if(!correct(await observe(target.candidate),input.identity))pending('original_repair_candidate_changed');return;}
 const directory=resolve(target.directory,'candidates');await assertNoFileLinks(directory);await fs.mkdir(directory,{recursive:true,mode:0o700});await assertNoFileLinks(directory);
 const temporary=resolve(directory,`candidate-${process.pid}-${randomUUID()}.pending`),handle=await fs.open(temporary,'wx',0o600);let owned=true;
 try{
  await input.afterPhase?.('candidate_created');const hash=createHash('sha256');let total=0,header:Buffer|undefined;
  for(const part of input.chunks){
   await input.guard();if(!Number.isSafeInteger(part.size)||part.size<1||part.size>4*1024*1024||!hashPattern.test(part.sha256))pending('original_repair_chunk_unknown');
   await assertNoFileLinks(part.path);const before=await fs.lstat(part.path);if(!before.isFile()||before.size!==part.size)pending('original_repair_chunk_changed');
   const bytes=await fs.readFile(part.path),after=await fs.lstat(part.path);await assertNoFileLinks(part.path);
   if(bytes.length!==part.size||createHash('sha256').update(bytes).digest('hex')!==part.sha256||before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs)pending('original_repair_chunk_changed');
   header??=bytes.subarray(0,5);total+=bytes.length;if(total>input.identity.size)pending('original_repair_chunk_changed');hash.update(bytes);await handle.writeFile(bytes);await input.afterPhase?.('candidate_chunk');
  }
  if(total!==input.identity.size||hash.digest('hex')!==input.identity.sha256||header?.toString()!=='%PDF-')pending('original_repair_candidate_invalid');
  await handle.sync();await handle.close();await input.afterPhase?.('candidate_synced');await input.guard();await assertNoFileLinks(target.candidate);
  await fs.link(temporary,target.candidate);await assertNoFileLinks(target.candidate);await input.afterPhase?.('candidate_published');
  await fs.unlink(temporary);owned=false;
 }finally{await handle.close().catch(()=>{});if(owned){await assertNoFileLinks(temporary);await fs.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}}
}

/** File portion only. The caller must guard the durable task, authorization and repairing generation.
 * Completion in the domain database is deliberately separate; retry never restores corrupted bytes.
 */
export async function recoverStudioOriginal(input:Input){
 const target=paths(input.root,input.identity);assertBaseline(input.baseline);await input.guard();
 const release=await acquireStudioPurgeFence(input.root,'source',input.identity.sha256,{generation:input.identity.generation,taskId:input.identity.taskId,token:input.identity.token});
 try{
  await input.guard();await pruneDeadStudioFileLeases(input.root,'source',input.identity.sha256);
  let intent=await exists(target.intent)?await readIntent(target.intent,input.identity):undefined;
  if(intent)assertIntentBaseline(intent,input.baseline);
  await inventory(target.directory,Boolean(intent),input.guard);
  if(!intent){
   const original=await observe(target.original);
   if(correct(original,input.identity)){await retireIntent(input,target);return{sha256:input.identity.sha256,size:input.identity.size,reusedOriginal:true};}
   if(!sameOriginal(original,input.baseline))pending('original_repair_baseline_changed');
   intent={format:'study-original-repair-v1',nonce:randomUUID(),pid:process.pid,binding:input.identity,original};await input.guard();
   await publishAtomicMarker({directory:target.directory,file:target.intent,purpose:'repair',persistent:true,value:intent,afterPhase:async phase=>input.afterPhase?.(('intent_'+phase) as OriginalRepairPhase)});
  }
  if(await exists(target.previous)&&(intent.original.kind!=='regular'||!sameOriginal(await observe(target.previous),intent.original)))pending('original_repair_previous_changed');
  let current=await observe(target.original);
  const reusedOriginal=correct(current,input.identity);
  if(!reusedOriginal){
   await candidate(input,target);await input.guard();current=await observe(target.original);
   if(intent.original.kind==='regular'){
    if(await exists(target.previous)){if(!sameOriginal(await observe(target.previous),intent.original))pending('original_repair_previous_changed');}
    else{
     if(!sameOriginal(current,intent.original))pending('original_repair_original_changed');
     await input.guard();await assertNoFileLinks(target.previous);await fs.link(target.original,target.previous);await input.afterPhase?.('previous_linked');
    }
    if(current.kind!=='missing'){
     if(!sameOriginal(current,intent.original))pending('original_repair_original_changed');
     if(!sameOriginal(await observe(target.previous),intent.original))pending('original_repair_previous_changed');
     await input.guard();if(!sameOriginal(await observe(target.original),intent.original))pending('original_repair_original_changed');await input.guard();await fs.unlink(target.original);await input.afterPhase?.('original_removed');
    }
   }else if(current.kind!=='missing')pending('original_repair_original_changed');
   await input.guard();if(!correct(await observe(target.candidate),input.identity))pending('original_repair_candidate_changed');await input.guard();await assertNoFileLinks(target.original);await fs.link(target.candidate,target.original);await assertNoFileLinks(target.original);await input.afterPhase?.('original_published');
  }
  await input.guard();if(!correct(await observe(target.original),input.identity))pending('original_repair_publication_changed');await input.afterPhase?.('original_verified');
  if(await exists(target.previous)){
   await input.guard();if(intent.original.kind!=='regular'||!sameOriginal(await observe(target.previous),intent.original))pending('original_repair_previous_changed');await fs.unlink(target.previous);await input.afterPhase?.('previous_removed');
  }
  if(await exists(target.candidate)){
   await input.guard();if(!correct(await observe(target.candidate),input.identity))pending('original_repair_candidate_changed');await fs.unlink(target.candidate);await input.afterPhase?.('candidate_removed');
  }
  await input.guard();await input.afterPhase?.('files_finished');await retireIntent(input,target);return{sha256:input.identity.sha256,size:input.identity.size,reusedOriginal};
 }finally{await release();}
}

/** Internal cancellation/revocation cleanup. Remove only verified, intent-bound
 * private artifacts. Never publish, roll back or unlink the shared original. */
export async function cleanupStudioOriginalRepair(input:GuardedInput){
 const target=paths(input.root,input.identity);assertBaseline(input.baseline);await input.guard();
 const release=await acquireStudioPurgeFence(input.root,'source',input.identity.sha256,{generation:input.identity.generation,taskId:input.identity.taskId,token:input.identity.token});
 try{
  await input.guard();await pruneDeadStudioFileLeases(input.root,'source',input.identity.sha256);
  const intent=await exists(target.intent)?await readIntent(target.intent,input.identity):undefined;
  if(intent)assertIntentBaseline(intent,input.baseline);
  await inventory(target.directory,Boolean(intent),input.guard);
  if(intent){
   if(await exists(target.previous)){
    if(intent.original.kind!=='regular'||correct(intent.original,input.identity)||!sameOriginal(await observe(target.previous),intent.original))pending('original_repair_previous_changed');
    await input.guard();await assertNoFileLinks(target.previous);await fs.unlink(target.previous);await input.afterPhase?.('previous_removed');
   }
   if(await exists(target.candidate)){
    if(!correct(await observe(target.candidate),input.identity))pending('original_repair_candidate_changed');
    await input.guard();await assertNoFileLinks(target.candidate);await fs.unlink(target.candidate);await input.afterPhase?.('candidate_removed');
   }
  }
  await input.guard();await input.afterPhase?.('cleanup_finished');
  const current=await observe(target.original);
  await retireIntent(input,target);
  return{sha256:input.identity.sha256,size:input.identity.size,original:correct(current,input.identity)?'verified' as const:current.kind==='missing'?'missing' as const:'mismatch' as const};
 }finally{await release();}
}

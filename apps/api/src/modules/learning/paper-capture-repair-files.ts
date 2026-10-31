import {promises as fs} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {z} from 'zod';
import {acquireStudioPurgeFence,assertNoFileLinks,pruneDeadStudioFileLeases,StudioFileCollectionPending} from '../../infrastructure/studio-file-coordination';
import {publishAtomicMarker} from '../../infrastructure/atomic-marker-publication';
import {retentionDigest} from '../diagnostics/retention-anchor';
import {observePaperCaptureFile,type PaperFileObservation} from './paper-capture-file-observation';
import {paperRepairObservationSchema,type PaperRepairObservation} from './paper-capture-repair-record';

const hash=z.string().regex(/^[a-f0-9]{64}$/),uuid=z.string().uuid();
const identitySchema=z.object({repairId:z.string().regex(/^paper_repair_[a-f0-9-]{36}$/),intentFingerprint:hash,kind:z.enum(['paper-file','source']),key:hash,role:z.enum(['original','baseline','derived','pdf','material_pdf']),sha256:hash,bytes:z.number().int().positive().max(80*1024*1024),mediaType:z.enum(['image/png','image/jpeg','application/pdf']),generation:z.number().int().positive(),taskId:z.string().regex(/^task_[a-f0-9-]{36}$/),token:uuid}).strict();
export type PaperRepairFileIdentity=z.infer<typeof identitySchema>;
const intentSchema=z.object({format:z.literal('paper-exact-repair-files-v1'),nonce:uuid,pid:z.number().int().positive(),identity:identitySchema,baseline:paperRepairObservationSchema}).strict();
type Intent=z.infer<typeof intentSchema>;
export type PaperRepairFilePhase='intent_created'|'intent_written'|'intent_synced'|'intent_published'|'intent_cleaned'|'candidate_created'|'candidate_chunk'|'candidate_synced'|'candidate_published'|'previous_linked'|'original_removed'|'original_published'|'original_verified'|'previous_removed'|'candidate_removed'|'intent_removed'|'rollback_removed'|'rollback_published'|'files_finished';
type Guarded={root:string;identity:PaperRepairFileIdentity;baseline:PaperRepairObservation;guard:()=>Promise<void>;afterPhase?:(phase:PaperRepairFilePhase)=>Promise<void>};
function pending(code:string):never{throw new StudioFileCollectionPending(code);}
const same=(a:unknown,b:unknown)=>retentionDigest(a)===retentionDigest(b);
function paths(root:string,identity:PaperRepairFileIdentity){
 identitySchema.parse(identity);uuid.parse(identity.repairId.slice('paper_repair_'.length));uuid.parse(identity.taskId.slice('task_'.length));
 const pdf=identity.role==='pdf'||identity.role==='material_pdf',limit=identity.role==='original'?12*1024*1024:pdf?80*1024*1024:40*1024*1024;
 if(identity.bytes>limit||(identity.kind==='source')!==(identity.role==='material_pdf')||identity.key!==(identity.kind==='source'?identity.sha256:retentionDigest({role:identity.role,sha256:identity.sha256}))||pdf!==(identity.mediaType==='application/pdf')||!['original','pdf','material_pdf'].includes(identity.role)&&identity.mediaType!=='image/png')pending('paper_repair_file_identity_unknown');
 const directory=resolve(root,'paper-repairs',identity.repairId),extension=pdf?'.pdf':identity.mediaType==='image/jpeg'?'.jpg':'.png';
 return{directory,intent:resolve(directory,'intent.json'),candidate:resolve(directory,'candidate.bin'),previous:resolve(directory,'previous.bin'),original:identity.kind==='source'?resolve(root,'studio-materials',identity.sha256+'.pdf'):resolve(root,'paper-images',identity.role,identity.sha256+extension)};
}
async function exists(file:string){await assertNoFileLinks(file);try{await fs.lstat(file);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}}
async function observe(file:string):Promise<PaperRepairObservation>{const value=await observePaperCaptureFile(file);if(value.kind==='unavailable')return pending('paper_repair_file_unknown');return value;}
function sameOriginal(left:PaperFileObservation,right:PaperRepairObservation){return left.kind==='missing'||right.kind==='missing'?left.kind===right.kind:left.kind==='regular'&&left.dev===right.dev&&left.ino===right.ino&&left.size===right.size&&left.mtimeNs===right.mtimeNs&&left.sha256===right.sha256;}
const correct=(value:PaperRepairObservation,identity:PaperRepairFileIdentity)=>value.kind==='regular'&&value.sha256===identity.sha256&&value.size===identity.bytes;
async function readIntent(file:string,input:Guarded):Promise<Intent>{
 await assertNoFileLinks(file);const before=await fs.lstat(file,{bigint:true});if(!before.isFile()||before.size>8192n)pending('paper_repair_intent_unknown');
 const value=intentSchema.parse(JSON.parse(await fs.readFile(file,'utf8')));if(!same(value.identity,input.identity)||!same(value.baseline,input.baseline))pending('paper_repair_intent_changed');
 await assertNoFileLinks(file);const after=await fs.lstat(file,{bigint:true});if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs)pending('paper_repair_intent_changed');return value;
}
function dead(pid:number){try{process.kill(pid,0);return false;}catch(error){return(error as NodeJS.ErrnoException).code==='ESRCH';}}
/** Read-only inventory for the operations audit. This never retires a partial
 * or treats an unknown entry as an eligible deletion candidate. */
export async function inspectExactPaperRepair(input:Pick<Guarded,'root'|'identity'|'baseline'>){
 const target=paths(input.root,input.identity);paperRepairObservationSchema.parse(input.baseline);const files:string[]=[],directories:string[]=[];if(!await exists(target.directory))return{files,directories};directories.push(target.directory);
 const intent=await exists(target.intent)?await readIntent(target.intent,{...input,guard:async()=>{}}):undefined;
 for(const name of await fs.readdir(target.directory)){
  const file=resolve(target.directory,name);await assertNoFileLinks(file);const stat=await fs.lstat(file);
  if(name==='intent.json'&&intent){files.push(file);continue;}
  if(name==='candidate.bin'&&intent&&correct(await observe(file),input.identity)){files.push(file);continue;}
  if(name==='previous.bin'&&intent&&sameOriginal(await observe(file),intent.baseline)){files.push(file);continue;}
  if(!['staging','candidates'].includes(name)||!stat.isDirectory())pending('paper_repair_inventory_unknown');directories.push(file);const names=await fs.readdir(file);if(names.length>100)pending('paper_repair_inventory_limit');
  for(const name of names){const match=/^(repair|candidate)-([1-9]\d*)-([a-f0-9-]{36})\.pending$/.exec(name),partial=resolve(file,name);await assertNoFileLinks(partial);const info=await fs.lstat(partial);if(!match||!uuid.safeParse(match[3]).success||!Number.isSafeInteger(Number(match[2]))||!info.isFile()||info.size>(match[1]==='repair'?8192:input.identity.bytes)||match[1]==='candidate'&&!intent)pending('paper_repair_partial_unknown_or_active');files.push(partial);}
 }
 return{files,directories};
}
/** The only removable partials have a controlled producer name in this exact
 * repair directory. Unknown entries, links and live producers remain intact. */
async function inventory(input:Guarded,target:ReturnType<typeof paths>,intent:Intent|undefined){
 await assertNoFileLinks(target.directory);if(!await exists(target.directory))return;
 for(const name of await fs.readdir(target.directory)){
  const file=resolve(target.directory,name);await assertNoFileLinks(file);const stat=await fs.lstat(file,{bigint:true});
  if(name==='intent.json'&&intent||['candidate.bin','previous.bin'].includes(name)&&intent){if(!stat.isFile())pending('paper_repair_private_file_unknown');continue;}
  if(!['staging','candidates'].includes(name)||!stat.isDirectory())pending('paper_repair_inventory_unknown');
  const names=await fs.readdir(file);if(names.length>100)pending('paper_repair_inventory_limit');
  for(const name of names){
   const match=/^(repair|candidate)-([1-9]\d*)-([a-f0-9-]{36})\.pending$/.exec(name),temporary=resolve(file,name);await assertNoFileLinks(temporary);const before=await fs.lstat(temporary,{bigint:true});
   if(!match||!uuid.safeParse(match[3]).success||!Number.isSafeInteger(Number(match[2]))||!before.isFile()||before.size>BigInt(match[1]==='repair'?8192:input.identity.bytes)||match[1]==='candidate'&&!intent||!dead(Number(match[2])))pending('paper_repair_partial_unknown_or_active');
   await input.guard();await assertNoFileLinks(temporary);const after=await fs.lstat(temporary,{bigint:true});if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs||!dead(Number(match[2])))pending('paper_repair_partial_changed');await fs.unlink(temporary);
  }
 }
}
function headerMatches(bytes:Buffer,type:PaperRepairFileIdentity['mediaType']){return type==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':type==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;}
async function makeCandidate(input:Guarded&{chunks:Array<{path:string;bytes:number;sha256:string}>},target:ReturnType<typeof paths>){
 if(await exists(target.candidate)){if(!correct(await observe(target.candidate),input.identity))pending('paper_repair_candidate_changed');return;}
 if(input.chunks.length<1||input.chunks.length>80)pending('paper_repair_chunks_unknown');
 const directory=resolve(target.directory,'candidates');await assertNoFileLinks(directory);await fs.mkdir(directory,{recursive:true,mode:0o700});await assertNoFileLinks(directory);
 const temporary=resolve(directory,`candidate-${process.pid}-${randomUUID()}.pending`),handle=await fs.open(temporary,'wx',0o600);let owned=true;
 try{
  await input.afterPhase?.('candidate_created');const digest=createHash('sha256');let total=0,header:Buffer|undefined;
  for(const chunk of input.chunks){
   await input.guard();if(!Number.isSafeInteger(chunk.bytes)||chunk.bytes<1||chunk.bytes>1024*1024||!hash.safeParse(chunk.sha256).success)pending('paper_repair_chunk_unknown');
   const expected=await observePaperCaptureFile(chunk.path,1024*1024);if(expected.kind!=='regular'||expected.size!==chunk.bytes||expected.sha256!==chunk.sha256)pending('paper_repair_chunk_changed');
   await assertNoFileLinks(chunk.path);const bytes=await fs.readFile(chunk.path);if(bytes.length!==chunk.bytes||createHash('sha256').update(bytes).digest('hex')!==chunk.sha256)pending('paper_repair_chunk_changed');
   header??=bytes.subarray(0,8);total+=bytes.length;if(total>input.identity.bytes)pending('paper_repair_candidate_oversized');digest.update(bytes);await handle.writeFile(bytes);await input.afterPhase?.('candidate_chunk');
  }
  if(total!==input.identity.bytes||digest.digest('hex')!==input.identity.sha256||!header||!headerMatches(header,input.identity.mediaType))pending('paper_repair_candidate_mismatch');
  await handle.sync();await handle.close();await input.afterPhase?.('candidate_synced');await input.guard();await assertNoFileLinks(target.candidate);await fs.link(temporary,target.candidate);await input.afterPhase?.('candidate_published');await fs.unlink(temporary);owned=false;
 }finally{await handle.close().catch(()=>{});if(owned){await assertNoFileLinks(temporary);await fs.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}}
}

/** The successful database/task completion happens inside the same exclusive
 * file fence. Previous bytes stay available until that actual commit is known.
 * A crash or losing authorization is reconciled by the durable cleanup task. */
export async function repairExactPaperFile<T>(input:Guarded&{chunks:Array<{path:string;bytes:number;sha256:string}>;commit:()=>Promise<T>}):Promise<T>{
 const target=paths(input.root,input.identity);paperRepairObservationSchema.parse(input.baseline);await input.guard();
 const release=await acquireStudioPurgeFence(input.root,input.identity.kind,input.identity.key,{generation:input.identity.generation,taskId:input.identity.taskId,token:input.identity.token});
 try{
  await input.guard();await pruneDeadStudioFileLeases(input.root,input.identity.kind,input.identity.key);let intent=await exists(target.intent)?await readIntent(target.intent,input):undefined;await inventory(input,target,intent);
  if(!intent){const baseline=await observe(target.original);if(!same(baseline,input.baseline))pending('paper_repair_preflight_changed');intent={format:'paper-exact-repair-files-v1',nonce:randomUUID(),pid:process.pid,identity:input.identity,baseline};await input.guard();await publishAtomicMarker({directory:target.directory,file:target.intent,purpose:'repair',persistent:true,value:intent,afterPhase:async phase=>input.afterPhase?.(('intent_'+phase)as PaperRepairFilePhase)});}
  await makeCandidate(input,target);let current=await observe(target.original);
  if(correct(current,input.identity)){if(!sameOriginal(current,await observe(target.candidate)))pending('paper_repair_published_identity_changed');}
  else{
   if(intent.baseline.kind==='regular'){
    if(await exists(target.previous)){if(!sameOriginal(await observe(target.previous),intent.baseline))pending('paper_repair_previous_changed');}
    else{if(!sameOriginal(current,intent.baseline))pending('paper_repair_original_changed');await input.guard();await assertNoFileLinks(target.previous);await fs.link(target.original,target.previous);await input.afterPhase?.('previous_linked');}
    if(current.kind!=='missing'){if(!sameOriginal(current,intent.baseline)||!sameOriginal(await observe(target.previous),intent.baseline))pending('paper_repair_original_changed');await input.guard();if(!sameOriginal(await observe(target.original),intent.baseline))pending('paper_repair_original_changed');await fs.unlink(target.original);await input.afterPhase?.('original_removed');}
   }else if(current.kind!=='missing')pending('paper_repair_original_changed');
   await input.guard();if(!correct(await observe(target.candidate),input.identity))pending('paper_repair_candidate_changed');await assertNoFileLinks(target.original);await fs.mkdir(resolve(target.original,'..'),{recursive:true});await input.guard();await fs.link(target.candidate,target.original);await input.afterPhase?.('original_published');
  }
  await input.guard();current=await observe(target.original);if(!correct(current,input.identity)||!sameOriginal(current,await observe(target.candidate)))pending('paper_repair_readback_failed');await input.afterPhase?.('original_verified');await input.guard();return await input.commit();
 }finally{await release();}
}
/** Cancellation/revocation can roll back only this intent's actual inode. An
 * unrelated replacement remains untouched and requires explicit investigation. */
export async function cleanupExactPaperRepair(input:Guarded&{committed:boolean;discardBaseline?:boolean}){
 const target=paths(input.root,input.identity);paperRepairObservationSchema.parse(input.baseline);await input.guard();const release=await acquireStudioPurgeFence(input.root,input.identity.kind,input.identity.key,{generation:input.identity.generation,taskId:input.identity.taskId,token:input.identity.token});
 try{
  await input.guard();await pruneDeadStudioFileLeases(input.root,input.identity.kind,input.identity.key);const intent=await exists(target.intent)?await readIntent(target.intent,input):undefined;await inventory(input,target,intent);
  if(intent){
   const candidate=await exists(target.candidate)?await observe(target.candidate):undefined,previous=await exists(target.previous)?await observe(target.previous):undefined;if(candidate&&!correct(candidate,input.identity)||previous&&!sameOriginal(previous,intent.baseline))pending('paper_repair_private_file_changed');
   if(!input.committed){
    let current=await observe(target.original);
    if(candidate&&sameOriginal(current,candidate)){await input.guard();if(!sameOriginal(await observe(target.original),candidate))pending('paper_repair_rollback_changed');await fs.unlink(target.original);await input.afterPhase?.('rollback_removed');current={kind:'missing'};}
    if(intent.baseline.kind==='regular'){
     if(input.discardBaseline){
      if(current.kind!=='missing'){if(!sameOriginal(current,intent.baseline))pending('paper_repair_rollback_original_unknown');await input.guard();if(!sameOriginal(await observe(target.original),intent.baseline))pending('paper_repair_rollback_original_unknown');await fs.unlink(target.original);await input.afterPhase?.('rollback_removed');}
     }else{
      if(current.kind==='missing'){if(!previous||!sameOriginal(previous,intent.baseline))pending('paper_repair_rollback_previous_missing');await input.guard();await fs.link(target.previous,target.original);await input.afterPhase?.('rollback_published');}
      else if(!sameOriginal(current,intent.baseline))pending('paper_repair_rollback_original_unknown');
      if(!sameOriginal(await observe(target.original),intent.baseline))pending('paper_repair_rollback_readback_failed');
     }
    }else if(current.kind!=='missing')pending('paper_repair_rollback_original_unknown');
   }
   if(previous){await input.guard();if(!sameOriginal(await observe(target.previous),intent.baseline))pending('paper_repair_previous_changed');await fs.unlink(target.previous);await input.afterPhase?.('previous_removed');}
   if(candidate){await input.guard();if(!correct(await observe(target.candidate),input.identity))pending('paper_repair_candidate_changed');await fs.unlink(target.candidate);await input.afterPhase?.('candidate_removed');}
   await input.guard();await readIntent(target.intent,input);await fs.unlink(target.intent);await input.afterPhase?.('intent_removed');
  }
  for(const directory of [resolve(target.directory,'staging'),resolve(target.directory,'candidates'),target.directory]){await input.guard();await assertNoFileLinks(directory);try{await fs.rmdir(directory);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')pending('paper_repair_directory_not_empty');}}
  await input.afterPhase?.('files_finished');
 }finally{await release();}
}

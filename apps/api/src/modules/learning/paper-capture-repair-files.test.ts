import {describe,it,expect} from 'vitest';
import {promises as fs,mkdirSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {PDFDocument} from 'pdf-lib';
import {retentionDigest} from '../diagnostics/retention-anchor';
import {observePaperCaptureFile} from './paper-capture-file-observation';
import {repairExactPaperFile,cleanupExactPaperRepair,inspectExactPaperRepair,type PaperRepairFileIdentity,type PaperRepairFilePhase} from './paper-capture-repair-files';

const qa=resolve(process.cwd(),'../../data/qa');mkdirSync(qa,{recursive:true});const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
async function fixture(role:'original'|'baseline'|'pdf'|'material_pdf'='original',previous:Buffer|null=Buffer.from('precisely retained damaged bytes'),large=false){
 const root=mkdtempSync(join(qa,'paper-repair-io-')),document=await PDFDocument.create();document.addPage([40,40]);let bytes=role==='pdf'||role==='material_pdf'?Buffer.from(await document.save()):await sharp({create:{width:8,height:6,channels:3,background:'white'}}).png().toBuffer();
 if(large){const exact=Buffer.alloc(80*1024*1024,32);bytes.copy(exact);bytes=exact;}
 const sha256=digest(bytes),kind=role==='material_pdf'?'source' as const:'paper-file' as const,identity:PaperRepairFileIdentity={repairId:'paper_repair_'+randomUUID(),intentFingerprint:retentionDigest({root,role,sha256}),kind,key:kind==='source'?sha256:retentionDigest({role,sha256}),role,sha256,bytes:bytes.length,mediaType:role==='pdf'||role==='material_pdf'?'application/pdf':'image/png',generation:2,taskId:'task_'+randomUUID(),token:randomUUID()},original=kind==='source'?resolve(root,'studio-materials',sha256+'.pdf'):resolve(root,'paper-images',role,sha256+(role==='pdf'?'.pdf':'.png'));
 await fs.mkdir(resolve(original,'..'),{recursive:true});if(previous)await fs.writeFile(original,previous);const baseline=await observePaperCaptureFile(original);if(baseline.kind==='unavailable')throw Error('Generated actual baseline unavailable');const chunks=[];
 const parts=resolve(root,'candidate-parts');await fs.mkdir(parts);for(let offset=0,index=0;offset<bytes.length;offset+=1024*1024,index++){const value=bytes.subarray(offset,offset+1024*1024),path=resolve(parts,String(index));await fs.writeFile(path,value);chunks.push({path,bytes:value.length,sha256:digest(value)});}
 return{root,identity,baseline,chunks,bytes,original,previous,directory:resolve(root,'paper-repairs',identity.repairId),guard:async()=>{}};
}
describe('actual exact paper repair IO, retained old bytes and crash recovery',()=>{
 for(const role of ['original','baseline','pdf','material_pdf']as const)it('publishes exact '+role+' bytes while retaining the previous inode until an actual completion decision',async()=>{
  const f=await fixture(role);let commits=0;await repairExactPaperFile({...f,commit:async()=>{expect((await fs.readFile(f.original)).equals(f.bytes)).toBe(true);expect((await fs.readFile(join(f.directory,'previous.bin'))).equals(f.previous!)).toBe(true);commits++;}});expect(commits).toBe(1);await cleanupExactPaperRepair({...f,committed:true});expect((await fs.readFile(f.original)).equals(f.bytes)).toBe(true);await expect(fs.lstat(f.directory)).rejects.toMatchObject({code:'ENOENT'});
 });
 const phases:PaperRepairFilePhase[]=['intent_created','intent_written','intent_synced','intent_published','intent_cleaned','candidate_created','candidate_chunk','candidate_synced','candidate_published','previous_linked','original_removed','original_published','original_verified'];
 for(const interrupted of phases)it('rolls back precise prior bytes after interruption at actual '+interrupted+' IO',async()=>{
  const f=await fixture();let commits=0,observed=false;await expect(repairExactPaperFile({...f,afterPhase:async phase=>{if(phase===interrupted){observed=true;throw Error('actual generated interruption');}},commit:async()=>{commits++;}})).rejects.toThrow('actual generated interruption');expect(observed).toBe(true);expect(commits).toBe(0);await cleanupExactPaperRepair({...f,committed:false});expect((await fs.readFile(f.original)).equals(f.previous!)).toBe(true);await expect(fs.lstat(f.directory)).rejects.toMatchObject({code:'ENOENT'});
 });
 for(const interrupted of ['original_published','original_verified']as const)it('returns a previously missing target to missing when cancelled after '+interrupted,async()=>{
  const f=await fixture('original',null);await expect(repairExactPaperFile({...f,afterPhase:async phase=>{if(phase===interrupted)throw Error('cancelled missing original');},commit:async()=>{throw Error('completion must not run');}})).rejects.toThrow('cancelled missing original');await cleanupExactPaperRepair({...f,committed:false});await expect(fs.lstat(f.original)).rejects.toMatchObject({code:'ENOENT'});
 });
 it('preserves an unrelated replacement inode even when it has exactly the expected bytes',async()=>{
  const f=await fixture();await expect(repairExactPaperFile({...f,afterPhase:async phase=>{if(phase==='original_removed'){await fs.copyFile(f.chunks[0].path,f.original);throw Error('an unrelated writer won');}},commit:async()=>{throw Error('must not complete');}})).rejects.toThrow('an unrelated writer won');await expect(cleanupExactPaperRepair({...f,committed:false})).rejects.toThrow('paper_repair_rollback_original_unknown');expect((await fs.readFile(f.original)).equals(f.bytes)).toBe(true);expect((await fs.readFile(join(f.directory,'previous.bin'))).equals(f.previous!)).toBe(true);
 });
 it('retires the known damaged baseline only for an explicitly fenced unreferenced-source cleanup',async()=>{
  const f=await fixture();await expect(repairExactPaperFile({...f,afterPhase:async phase=>{if(phase==='original_published')throw Error('actual deleted source interruption');},commit:async()=>{throw Error('must not complete');}})).rejects.toThrow('actual deleted source interruption');const before=await inspectExactPaperRepair(f);expect(before.files.length).toBe(3);expect((await fs.readFile(f.original)).equals(f.bytes)).toBe(true);await cleanupExactPaperRepair({...f,committed:false,discardBaseline:true});await expect(fs.lstat(f.original)).rejects.toMatchObject({code:'ENOENT'});await expect(fs.lstat(f.directory)).rejects.toMatchObject({code:'ENOENT'});
 });
 it('refuses a changed preflight inode and an unknown private file without overwriting either',async()=>{
  const f=await fixture();await fs.unlink(f.original);await fs.writeFile(f.original,f.previous!);await expect(repairExactPaperFile({...f,commit:async()=>{throw Error('must not complete');}})).rejects.toThrow('paper_repair_preflight_changed');expect((await fs.readFile(f.original)).equals(f.previous!)).toBe(true);
  const g=await fixture();await fs.mkdir(g.directory,{recursive:true});const unknown=join(g.directory,'user-note.txt');await fs.writeFile(unknown,'preserve this unknown entry');await expect(repairExactPaperFile({...g,commit:async()=>{throw Error('must not complete');}})).rejects.toThrow('paper_repair_inventory_unknown');expect(await fs.readFile(unknown,'utf8')).toBe('preserve this unknown entry');expect((await fs.readFile(g.original)).equals(g.previous!)).toBe(true);
 });
 it('rejects a complete candidate whose parts match their own hashes but differ from the exact original',async()=>{
  const f=await fixture(),wrong=Buffer.alloc(f.bytes.length,65);await fs.writeFile(f.chunks[0].path,wrong);f.chunks[0].sha256=digest(wrong);await expect(repairExactPaperFile({...f,commit:async()=>{throw Error('must not complete');}})).rejects.toThrow('paper_repair_candidate_mismatch');await cleanupExactPaperRepair({...f,committed:false});expect((await fs.readFile(f.original)).equals(f.previous!)).toBe(true);
 });
 it('recovers from a real exited writer after unlinking the original, using its durable intent and retained inode',async()=>{
  const f=await fixture(),module=resolve(process.cwd(),'dist/apps/api/src/modules/learning/paper-capture-repair-files.js'),input={root:f.root,identity:f.identity,baseline:f.baseline,chunks:f.chunks};
  const script="require('reflect-metadata');const input=JSON.parse(process.argv[1]);require(process.argv[2]).repairExactPaperFile({...input,guard:async()=>{},afterPhase:async phase=>{if(phase==='original_removed')process.exit(73);},commit:async()=>{process.exit(74);}}).catch(()=>process.exit(75));",result=spawnSync(process.execPath,['-e',script,JSON.stringify(input),module],{cwd:process.cwd(),windowsHide:true,encoding:'utf8'});expect(result.status,result.stderr).toBe(73);await expect(fs.lstat(f.original)).rejects.toMatchObject({code:'ENOENT'});expect((await fs.readFile(join(f.directory,'previous.bin'))).equals(f.previous!)).toBe(true);await cleanupExactPaperRepair({...f,committed:false});expect((await fs.readFile(f.original)).equals(f.previous!)).toBe(true);
 },30000);
 it('streams an exact80MiB PDF through80 real1MiB parts and rejects a larger identity before changing any file',async()=>{
  const f=await fixture('pdf',null,true);expect(f.chunks.length).toBe(80);await repairExactPaperFile({...f,commit:async()=>{const current=await observePaperCaptureFile(f.original);expect(current.kind==='regular'&&current.sha256===f.identity.sha256&&current.size===80*1024*1024).toBe(true);}});await cleanupExactPaperRepair({...f,committed:true});await expect(repairExactPaperFile({...f,identity:{...f.identity,bytes:80*1024*1024+1},commit:async()=>{throw Error('must not complete');}})).rejects.toThrow();expect((await observePaperCaptureFile(f.original)).kind).toBe('regular');
 },60000);
});

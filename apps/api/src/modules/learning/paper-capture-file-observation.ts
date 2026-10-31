import {constants, type BigIntStats} from 'node:fs';
import {promises as fs} from 'node:fs';
import {createHash} from 'node:crypto';
import {assertNoFileLinks} from '../../infrastructure/studio-file-coordination';

type StatIdentity={dev:string;ino:string;size:number;mtimeNs:string;ctimeNs:string};
export type PaperFileObservation={kind:'missing'}|{kind:'unavailable'}|({kind:'regular';sha256:string}&StatIdentity);
export class PaperFileObservationChanged extends Error{constructor(){super('paper_capture_file_observation_changed');}}
const identity=(stat:BigIntStats):StatIdentity=>({dev:stat.dev.toString(),ino:stat.ino.toString(),size:Number(stat.size),mtimeNs:stat.mtimeNs.toString(),ctimeNs:stat.ctimeNs.toString()});
const same=(left:StatIdentity,right:StatIdentity)=>left.dev===right.dev&&left.ino===right.ino&&left.size===right.size&&left.mtimeNs===right.mtimeNs&&left.ctimeNs===right.ctimeNs;

/** Read through one bounded file handle, then compare that handle and the path.
 * A link, directory or oversized unknown file never becomes a repair baseline. */
export async function observePaperCaptureFile(file:string,limit=80*1024*1024):Promise<PaperFileObservation>{
 let handle;
 try{
  await assertNoFileLinks(file);
  handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  const before=await handle.stat({bigint:true});if(!before.isFile()||before.size>BigInt(limit))return{kind:'unavailable'};
  await assertNoFileLinks(file);const pathBefore=await fs.lstat(file,{bigint:true});if(!pathBefore.isFile()||!same(identity(before),identity(pathBefore)))throw new PaperFileObservationChanged();
  const digest=createHash('sha256');let size=0;
  for await(const chunk of handle.createReadStream({autoClose:false})){size+=chunk.length;if(size>limit)throw new PaperFileObservationChanged();digest.update(chunk);}
  await assertNoFileLinks(file);const after=await handle.stat({bigint:true}),pathAfter=await fs.lstat(file,{bigint:true});
  if(!after.isFile()||!pathAfter.isFile()||size!==Number(before.size)||!same(identity(before),identity(after))||!same(identity(before),identity(pathAfter)))throw new PaperFileObservationChanged();
  return{kind:'regular',...identity(before),sha256:digest.digest('hex')};
 }catch(error){
  if(error instanceof PaperFileObservationChanged)throw error;
  const code=(error as NodeJS.ErrnoException).code;
  if(code==='ENOENT'){if(handle)throw new PaperFileObservationChanged();return{kind:'missing'};}
  return{kind:'unavailable'};
 }finally{await handle?.close();}
}
/** The actual preflight stays tied to the inode and exact stat observation,
 * including a file that was missing when it was checked. */
export async function recheckPaperCaptureObservation(file:string,observation:PaperFileObservation){
 if(observation.kind==='unavailable')return;
 try{
  await assertNoFileLinks(file);const stat=await fs.lstat(file,{bigint:true});
  if(observation.kind==='missing'||!stat.isFile()||!same(observation,identity(stat)))throw new PaperFileObservationChanged();
 }catch(error){if(observation.kind==='missing'&&(error as NodeJS.ErrnoException).code==='ENOENT')return;throw new PaperFileObservationChanged();}
}
/** A candidate retains bytes from the same bounded handle whose inode and path
 * were checked, rather than reopening the path after a metadata-only check. */
export async function readExactPaperCaptureBytes(file:string,expected:{sha256:string;bytes:number},limit=80*1024*1024){
 if(!Number.isSafeInteger(expected.bytes)||expected.bytes<1||expected.bytes>limit||!/^[a-f0-9]{64}$/.test(expected.sha256))throw new PaperFileObservationChanged();
 let handle;
 try{await assertNoFileLinks(file);handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const before=await handle.stat({bigint:true});if(!before.isFile()||before.size!==BigInt(expected.bytes))throw new PaperFileObservationChanged();await assertNoFileLinks(file);const pathBefore=await fs.lstat(file,{bigint:true});if(!pathBefore.isFile()||!same(identity(before),identity(pathBefore)))throw new PaperFileObservationChanged();
  const chunks:Buffer[]=[],digest=createHash('sha256');let size=0;
  for await(const chunk of handle.createReadStream({autoClose:false})){size+=chunk.length;if(size>expected.bytes)throw new PaperFileObservationChanged();digest.update(chunk);chunks.push(Buffer.from(chunk));}
  await assertNoFileLinks(file);const after=await handle.stat({bigint:true}),pathAfter=await fs.lstat(file,{bigint:true});if(!after.isFile()||!pathAfter.isFile()||size!==expected.bytes||digest.digest('hex')!==expected.sha256||!same(identity(before),identity(after))||!same(identity(before),identity(pathAfter)))throw new PaperFileObservationChanged();return Buffer.concat(chunks,size);
 }catch(error){if(error instanceof PaperFileObservationChanged)throw error;throw new PaperFileObservationChanged();}finally{await handle?.close();}
}

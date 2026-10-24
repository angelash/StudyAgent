import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';

type FileKind = 'source' | 'upload';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export async function assertNoFileLinks(input:string) {
  let cursor=resolve(input);
  for(;;){try{if((await fs.lstat(cursor)).isSymbolicLink())throw new Error('studio_file_link_refused');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}const parent=dirname(cursor);if(parent===cursor)return;cursor=parent;}
}
export function studioCoordinationRoot(root:string,kind:FileKind,key:string){
  if(kind==='source'?!/^[a-f0-9]{64}$/.test(key):!key.startsWith('studio_upload_')||!uuid.test(key.slice('studio_upload_'.length)))throw new Error('invalid_studio_file_identity');
  return resolve(root,kind==='source'?'studio-materials':'studio-uploads','control',key);
}
async function exists(file:string){try{await fs.lstat(file);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}}
async function marker(file:string){
  await assertNoFileLinks(file);const stat=await fs.lstat(file);if(!stat.isFile()||stat.size>4096)throw new Error('invalid_studio_file_marker');return JSON.parse(await fs.readFile(file,'utf8')) as Record<string,unknown>;
}
/** Register first, then check fences. A collector creates its fence before inspecting leases. */
export async function acquireStudioFileLease(root:string,kind:FileKind,key:string){
  const control=studioCoordinationRoot(root,kind,key),nonce=randomUUID(),file=resolve(control,'leases',nonce+'.json');
  await assertNoFileLinks(file);await fs.mkdir(dirname(file),{recursive:true,mode:0o700});await assertNoFileLinks(file);
  const value={format:'study-file-lease-v1',nonce,pid:process.pid,createdAt:new Date().toISOString()};
  const handle=await fs.open(file,'wx',0o600);try{await handle.writeFile(JSON.stringify(value));await handle.sync();}finally{await handle.close();}
  const release=async()=>{try{const current=await marker(file);if(current.nonce===nonce&&current.pid===process.pid&&current.format===value.format)await fs.unlink(file);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}};
  try{
    if(await exists(resolve(control,'purge.json')))throw new ConflictException('资料正在回收，请稍后重试');
    if(kind==='upload'&&await exists(resolve(control,'revoked.json')))throw new ConflictException('这次上传已撤销，请重新开始');
  }catch(error){await release();throw error;}
  return release;
}
export async function withStudioFileLease<T>(root:string,kind:FileKind,key:string,action:()=>Promise<T>){const release=await acquireStudioFileLease(root,kind,key);try{return await action();}finally{await release();}}

/** Permanent, outside the chunk directory. Upload IDs are never reused. Called only after domain cancellation commits. */
export async function revokeStudioUploadFiles(root:string,id:string){
  const control=studioCoordinationRoot(root,'upload',id),file=resolve(control,'revoked.json');await assertNoFileLinks(file);await fs.mkdir(control,{recursive:true,mode:0o700});
  const value={format:'study-upload-revocation-v1',id,createdAt:new Date().toISOString()};
  try{const handle=await fs.open(file,'wx',0o600);try{await handle.writeFile(JSON.stringify(value));await handle.sync();}finally{await handle.close();}}
  catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;const current=await marker(file);if(current.format!==value.format||current.id!==id)throw new Error('invalid_studio_upload_revocation');}
}
export async function inspectStudioFileLeases(root:string,kind:FileKind,key:string){
  const control=studioCoordinationRoot(root,kind,key),directory=resolve(control,'leases');await assertNoFileLinks(directory);
  let names:string[];try{names=await fs.readdir(directory);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return[];throw error;}
  if(names.length>10000)throw new Error('studio_file_lease_limit');
  const leases:Array<{name:string;status:'active'|'dead'|'unknown';pid?:number}>=[];
  for(const name of names){
    if(!name.endsWith('.json')||!uuid.test(name.slice(0,-5))){leases.push({name,status:'unknown'});continue;}
    try{
      const value=await marker(resolve(directory,name));
      if(value.format!=='study-file-lease-v1'||value.nonce!==name.slice(0,-5)||!Number.isSafeInteger(value.pid)||(value.pid as number)<1||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt)))throw new Error('invalid_lease');
      let status:'active'|'dead'|'unknown'='active';try{process.kill(value.pid as number,0);}catch(error){status=(error as NodeJS.ErrnoException).code==='ESRCH'?'dead':'unknown';}
      leases.push({name,status,pid:value.pid as number});
    }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')leases.push({name,status:'unknown'});}
  }
  return leases;
}

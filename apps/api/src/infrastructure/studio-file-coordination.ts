import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import type { Stats } from 'node:fs';
import { assertNoFileLinks, studioCoordinationRoot, studioFileUuid as uuid, type FileKind } from './studio-file-paths';
import { parseStudioMarkerStagingName, publishStudioMarker, releaseOwnStudioMarker } from './studio-atomic-marker';
export { assertNoFileLinks, studioCoordinationRoot, type FileKind } from './studio-file-paths';
async function exists(file:string){try{await fs.lstat(file);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}}
async function marker(file:string){
  await assertNoFileLinks(file);const stat=await fs.lstat(file);if(!stat.isFile()||stat.size>4096)throw new Error('invalid_studio_file_marker');return JSON.parse(await fs.readFile(file,'utf8')) as Record<string,unknown>;
}
/** Register first, then check fences. A collector creates its fence before inspecting leases. */
export async function acquireStudioFileLease(root:string,kind:FileKind,key:string){
  const control=studioCoordinationRoot(root,kind,key),nonce=randomUUID(),file=resolve(control,'leases',nonce+'.json');
  const value={format:'study-file-lease-v1',nonce,pid:process.pid,createdAt:new Date().toISOString()};
  await publishStudioMarker(control,file,'lease',value);
  const release=()=>releaseOwnStudioMarker(file,value);
  try{
    if(await exists(resolve(control,'purge.json')))throw new ConflictException('资料正在回收，请稍后重试');
    if(kind==='upload'&&await exists(resolve(control,'revoked.json')))throw new ConflictException('这次上传已撤销，请重新开始');
  }catch(error){await release();throw error;}
  return release;
}
export async function withStudioFileLease<T>(root:string,kind:FileKind,key:string,action:()=>Promise<T>){const release=await acquireStudioFileLease(root,kind,key);try{return await action();}finally{await release();}}

/** Permanent, outside the chunk directory. Upload IDs are never reused. Called only after domain cancellation commits. */
export async function revokeStudioUploadFiles(root:string,id:string){
  const control=studioCoordinationRoot(root,'upload',id),file=resolve(control,'revoked.json');
  const value={format:'study-upload-revocation-v1',id,nonce:randomUUID(),pid:process.pid,createdAt:new Date().toISOString()};
  try{await publishStudioMarker(control,file,'revoked',value);}
  catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;const current=await marker(file);if(current.format!==value.format||current.id!==id)throw new Error('invalid_studio_upload_revocation');}
}
export async function inspectStudioFileLeases(root:string,kind:FileKind,key:string){
  const control=studioCoordinationRoot(root,kind,key),directory=resolve(control,'leases');
  const names=await markerNames(directory);
  const leases:Array<{name:string;status:'active'|'dead'|'unknown';pid?:number;area?:'staging';stat?:Stats}>=[];
  for(const name of names){
    if(!name.endsWith('.json')||!uuid.test(name.slice(0,-5))){leases.push({name,status:'unknown'});continue;}
    try{
      const value=await marker(resolve(directory,name));
      if(value.format!=='study-file-lease-v1'||value.nonce!==name.slice(0,-5)||!Number.isSafeInteger(value.pid)||(value.pid as number)<1||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt)))throw new Error('invalid_lease');
      leases.push({name,status:processStatus(value.pid as number),pid:value.pid as number});
    }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')leases.push({name,status:'unknown'});}
  }
  // Even an empty pending file identifies its producer. All purposes protect this key.
  const staging=resolve(control,'staging');
  for(const name of await markerNames(staging)){
    try{
      const parsed=parseStudioMarkerStagingName(name),file=resolve(staging,name);await assertNoFileLinks(file);
      const stat=await fs.lstat(file);
      if(!parsed||!stat.isFile()||stat.size>4096){leases.push({name,area:'staging',status:'unknown'});continue;}
      leases.push({name,area:'staging',status:processStatus(parsed.pid),pid:parsed.pid,stat});
    }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')leases.push({name,area:'staging',status:'unknown'});}
  }
  return leases;
}
async function markerNames(directory:string){
  await assertNoFileLinks(directory);
  try{const names=await fs.readdir(directory);if(names.length>10000)throw new Error('studio_file_lease_limit');return names;}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return[];throw error;}
}
function processStatus(pid:number):'active'|'dead'|'unknown'{try{process.kill(pid,0);return'active';}catch(error){return(error as NodeJS.ErrnoException).code==='ESRCH'?'dead':'unknown';}}

export class StudioFileCollectionPending extends Error {constructor(readonly code:string){super(code);}}
export async function acquireStudioPurgeFence(root:string,kind:FileKind,key:string,identity:{generation:number;taskId:string;token:string}){
  const control=studioCoordinationRoot(root,kind,key),file=resolve(control,'purge.json'),nonce=randomUUID();
  if(!Number.isSafeInteger(identity.generation)||identity.generation<0||!uuid.test(identity.token))throw new Error('invalid_material_collection_identity');
  const value={format:'study-file-purge-v1',kind,key,...identity,nonce,pid:process.pid,createdAt:new Date().toISOString()};
  for(let attempt=0;attempt<2;attempt++){
    try{await publishStudioMarker(control,file,'purge',value);
      return async()=>{const current=await marker(file);if(current.nonce!==nonce||current.pid!==process.pid||current.key!==key)throw new StudioFileCollectionPending('material_collection_fence_changed');await fs.unlink(file);};
    }catch(error){
      if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
      try{
        const current=await marker(file);
        if(current.format!=='study-file-purge-v1'||current.key!==key||current.kind!==kind||!uuid.test(String(current.nonce))||!uuid.test(String(current.token))||!Number.isSafeInteger(current.pid)||(current.pid as number)<1||!Number.isSafeInteger(current.generation))throw new StudioFileCollectionPending('material_collection_fence_unknown');
        try{process.kill(current.pid as number,0);throw new StudioFileCollectionPending('material_collection_owner_active');}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}
        const again=await marker(file);if(JSON.stringify(again)!==JSON.stringify(current))throw new StudioFileCollectionPending('material_collection_fence_changed');await fs.unlink(file);
      }catch(error){if(error instanceof StudioFileCollectionPending)throw error;throw new StudioFileCollectionPending('material_collection_fence_unknown');}
    }
  }
  throw new StudioFileCollectionPending('material_collection_fence_busy');
}
/** Requires the caller's purge fence to remain held. Unknown/live markers are never removed. */
export async function pruneDeadStudioFileLeases(root:string,kind:FileKind,key:string){
  const leases=await inspectStudioFileLeases(root,kind,key);if(leases.some(item=>item.status!=='dead'))throw new StudioFileCollectionPending('material_file_process_active_or_unknown');
  const directory=resolve(studioCoordinationRoot(root,kind,key),'leases');
  for(const lease of leases){
    if(lease.area==='staging'){
      const file=resolve(studioCoordinationRoot(root,kind,key),'staging',lease.name);await assertNoFileLinks(file);
      let current:Stats;try{current=await fs.lstat(file);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
      const prior=lease.stat;
      if(!prior||!current.isFile()||current.ino!==prior.ino||current.dev!==prior.dev||current.size!==prior.size||current.mtimeMs!==prior.mtimeMs||processStatus(lease.pid!)!=='dead')throw new StudioFileCollectionPending('material_file_staging_changed');
      await fs.unlink(file);continue;
    }
    const file=resolve(directory,lease.name);let current:Record<string,unknown>;try{current=await marker(file);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
    if(current.pid!==lease.pid||current.nonce!==lease.name.slice(0,-5))throw new StudioFileCollectionPending('material_file_lease_changed');
    try{process.kill(lease.pid!,0);throw new StudioFileCollectionPending('material_file_process_active_or_unknown');}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}
    await fs.unlink(file);
  }
}

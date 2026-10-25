import { ConflictException } from '@nestjs/common';
import { resolve } from 'node:path';
import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { withStudioFileLease } from '../../infrastructure/studio-file-coordination';
import { writeImmutableBytes,verifyImmutableFile } from '../../infrastructure/immutable-files';
import type { OriginalRepairIdentity,OriginalRepairObservation } from '../../infrastructure/studio-original-repair';

export type StudioMaterialAssetRecord={id:string;state:'available'|'deleting'|'repairing';generation:number;updatedAt:string;cleanupTaskId?:string;cleanupToken?:string;
 repair?:{identity:OriginalRepairIdentity;baseline:OriginalRepairObservation;uploadId:string;cleanupTaskId:string;cleanupRequested:boolean}};
/** Every original registration reads this identity in its domain transaction, even when bytes already exist. */
export function assertStudioAssetAvailable(store:InMemoryStoreService,sha256:string){
  if(!/^[a-f0-9]{64}$/.test(sha256))throw new Error('invalid_material_checksum');
  let row=store.find('studioMaterialAssets',{id:sha256});if(row&&(!['available','deleting','repairing'].includes(row.state)||!Number.isSafeInteger(row.generation)||row.generation<1))throw new ConflictException('资料原件状态需要核对，请稍后重试');if(row?.state==='deleting')throw new ConflictException('资料原件正在回收，请稍后重新上传');if(row?.state==='repairing')throw new ConflictException('资料原件正在恢复，请从原件恢复进度继续');
  if(!row){row={id:sha256,state:'available',generation:1,updatedAt:new Date().toISOString()};store.append('studioMaterialAssets',row);}return row;
}
/** A delayed request may acquire its file lease after a full collection cycle. Recheck the fresh generation while leased. */
export async function withStudioSourceFileWrite<T>(store:InMemoryStoreService,sha256:string,write:()=>Promise<T>){
  const generation=assertStudioAssetAvailable(store,sha256).generation;
  return withStudioFileLease(studioMaterialRoot(),'source',sha256,async()=>{
    const current=await store.requestContext(()=>store.find('studioMaterialAssets',{id:sha256}));
    if(current?current.state!=='available'||current.generation!==generation:generation!==1)throw new ConflictException('原件存储版本已变化，请重新读取上传状态');
    return write();
  });
}

export function studioMaterialRoot() {
  return process.env.STUDY_DATA_DIR ??
    resolve(process.cwd().replace(/\\/g, '/').endsWith('/apps/api') ? '../..' : '.', 'data');
}

export function studioMaterialFile(sha256: string,format:'pdf'|'txt'='pdf') {
  if(!/^[a-f0-9]{64}$/.test(sha256))throw new Error('invalid_material_checksum');
  return resolve(studioMaterialRoot(), 'studio-materials', sha256 + '.'+format);
}

export function studioMaterialCache(sha256: string) {
  return resolve(studioMaterialRoot(), 'studio-materials', 'processed', sha256);
}

export async function persistStudioMaterial(store:InMemoryStoreService,sha256: string, bytes: Buffer,format:'pdf'|'txt'='pdf') {
  const path = studioMaterialFile(sha256,format);
  await withStudioSourceFileWrite(store,sha256,async()=>{await writeImmutableBytes(path,bytes);await verifyImmutableFile(path,sha256,bytes.length);});
  return path;
}

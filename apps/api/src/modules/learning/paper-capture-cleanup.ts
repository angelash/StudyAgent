import type {InMemoryStoreService} from '../../infrastructure/in-memory-store.service';
import {retentionDigest} from '../diagnostics/retention-anchor';
import {paperCaptureFileId} from './paper-capture-record';

export const paperCaptureCleanupKind='learning.paper-capture.cleanup';
export function paperCaptureFileReferenced(store:InMemoryStoreService,id:string,includeRepair=true){
 // Reading the legacy mutable array getter after find() can detach the row
 // being edited. Reference discovery must use immutable analysis views.
 const asset=(store.inspect?store.inspect('paperCaptureFileAssets'):store.paperCaptureFileAssets??[]).find(row=>row.id===id);if(!asset)return false;
 if(includeRepair&&asset.paperCaptureRepair)return true;
 if((store.inspect?store.inspect('paperCapturePages'):store.paperCapturePages??[]).some(page=>page.versions.some(version=>version.receipt.files.some(file=>paperCaptureFileId(file.role,file.sha256)===id))))return true;
 if((store.inspect?store.inspect('paperImageUploads'):store.paperImageUploads??[]).some(row=>row.status==='uploading'&&row.preparedFileIds.includes(id)))return true;
 if((store.inspect?store.inspect('paperCaptureCommands'):store.paperCaptureCommands??[]).some(row=>row.status==='preparing'&&row.fileIds.includes(id)))return true;
 // All saved derivations, including superseded/cancelled snapshots, retain
 // their actual bytes. Group histories in turn retain their page versions.
 if((store.inspect?store.inspect('paperCaptureDerivations'):store.paperCaptureDerivations??[]).some(row=>row.pdf&&asset.role==='pdf'&&row.pdf.pdfSha256===asset.sha256))return true;
 if((store.inspect?store.inspect('studioSourceMaterials'):store.studioSourceMaterials??[]).some(row=>asset.role==='pdf'&&row.sha256===asset.sha256))return true;
 return false;
}

/** The caller commits this intention with its actual deletion/cancellation. */
export async function schedulePaperCaptureCleanup(store:InMemoryStoreService,targetKind:'paper-upload'|'paper-file',key:string,ownerUserId:string){
 const asset=targetKind==='paper-file'?store.find('paperCaptureFileAssets',{id:key}):undefined;
 if(targetKind==='paper-file'&&(!asset||asset.state==='deleted'||asset.state==='repairing'))return;
 if(targetKind==='paper-upload'&&store.find('paperImageUploads',{id:key})?.filesCollectedAt)return;
 let prior=asset?.cleanupTaskId?await store.tasks.get(asset.cleanupTaskId):targetKind==='paper-upload'?await store.tasks.find(ownerUserId,paperCaptureCleanupKind,'paper-upload-cleanup:'+key):null;
 if(prior){
  if(['failed','cancelled'].includes(prior.state)){await store.controlTask({id:prior.id,action:'retry',expectedVersion:prior.version,actorId:'system-paper-capture'});return;}
  if(prior.state!=='succeeded'||targetKind==='paper-upload')return;
 }
 const taskId=store.nextId('task'),payload={targetKind,key,generation:asset?.generation??1};
 await store.enqueueTask({id:taskId,kind:paperCaptureCleanupKind,ownerUserId,requestKey:targetKind==='paper-upload'?'paper-upload-cleanup:'+key:'paper-file-cleanup:'+key+':'+taskId,payloadHash:retentionDigest(payload),payload,createdAt:new Date().toISOString(),maxAttempts:5});
 if(asset)asset.cleanupTaskId=taskId;
}

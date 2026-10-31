// Only a new cold target under the existing restore transaction and operation lock.
const fs=require('node:fs'),{randomUUID}=require('node:crypto');
const fail=code=>{throw Error(code);},decode=value=>typeof value==='string'?JSON.parse(value):value;
async function cleanupRestoredPaperCaptures({root,query,manifest,afterPhase,now=Date.now()}){
 const {within,digest}=require('./backup.cjs').files,guard=(await query('SELECT state,backup_id FROM study_restore_guard WHERE id=1'))[0];
 if(guard?.state!=='restoring'||guard.backup_id!==manifest.id||!fs.lstatSync(within(root,'.study-restore-incomplete')).isFile())fail('restore_paper_capture_guard_required');
 const rows=await query("SELECT collection,record_id,body FROM domain_records WHERE collection IN ('users','students','privacyRequests','studioSourceMaterials','paperImageUploads','paperCapturePages','paperCaptureGroups','paperCaptureCommands','paperCaptureDerivations','paperCaptureFileAssets','paperCaptureRepairUploads','paperCaptureRepairCommands','paperCaptureRepairs','studioMaterialAssets') LIMIT 1000001");
 if(rows.length>1000000)fail('restore_paper_capture_record_limit');
 const store={};for(const row of rows)(store[row.collection]??=[]).push(decode(row.body));
 const {paperCaptureFileReferenced}=require('../../apps/api/dist/apps/api/src/modules/learning/paper-capture-cleanup.js'),at=new Date(now).toISOString(),changed=new Map(),write=(collection,row)=>changed.set(collection+'\0'+row.id,{collection,row});
 for(const command of store.paperCaptureCommands??[])if(command.status==='preparing'){command.status='rejected';command.errorCode='restored_interruption';command.generation++;command.at=at;write('paperCaptureCommands',command);}
 for(const upload of store.paperImageUploads??[])if(upload.status==='uploading'&&Date.parse(upload.expiresAt)<=now){upload.status='cancelled';upload.systemClosure='expired';upload.endedAt=at;upload.terminalCommandId=null;upload.revision++;write('paperImageUploads',upload);}
 for(const upload of store.paperCaptureRepairUploads??[])if(upload.status==='uploading'&&Date.parse(upload.expiresAt)<=now){upload.status='cancelled';upload.systemClosure='expired';upload.endedAt=at;upload.terminalCommandId=null;upload.revision++;write('paperCaptureRepairUploads',upload);}
 const keep=new Set();
 for(const asset of store.paperCaptureFileAssets??[]){
  if(asset.state==='repairing'||asset.paperCaptureRepair)fail('restore_paper_capture_repair_active');
  if(!Number.isSafeInteger(asset.generation)||asset.generation<1||asset.generation>=Number.MAX_SAFE_INTEGER)fail('restore_paper_capture_generation_unknown');
  const retained=paperCaptureFileReferenced(store,asset.id);asset.generation++;asset.cleanupTaskId=null;asset.updatedAt=at;asset.state=retained?'available':'deleted';write('paperCaptureFileAssets',asset);
  if(retained)keep.add('paper-images/'+asset.role+'/'+asset.sha256+(asset.mediaType==='application/pdf'?'.pdf':asset.mediaType==='image/jpeg'?'.jpg':'.png'));
 }
 for(const upload of store.paperImageUploads??[]){if(upload.status==='uploading'){for(const chunk of upload.chunks)keep.add('paper-image-uploads/'+upload.id+'/'+chunk.index+'-'+chunk.sha256);}else{upload.filesCollectedAt=at;write('paperImageUploads',upload);}}
 for(const upload of store.paperCaptureRepairUploads??[]){if(upload.status==='uploading'){for(const chunk of require('../../apps/api/dist/apps/api/src/modules/learning/paper-capture-repair-record.js').paperRepairUploadChunks(upload))keep.add('paper-repair-uploads/'+upload.id+'/'+chunk.index+'-'+chunk.sha256);}else{upload.filesCollectedAt=at;write('paperCaptureRepairUploads',upload);}}
 const inventory=manifest.files.filter(file=>/^data\/paper-(?:images|image-uploads|repair-uploads)\//.test(file.path)),expected=new Map();
 const valid=/^(?:paper-images\/(?:original|baseline|derived|pdf)\/[a-f0-9]{64}\.(?:png|jpg|pdf)|paper-image-uploads\/paper_upload_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/(?:[0-9]|1[01])-[a-f0-9]{64}|paper-repair-uploads\/paper_repair_upload_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/(?:[0-9]|[1-7][0-9])-[a-f0-9]{64})$/;
 function check(relative,file){const location=within(root,relative),stat=fs.lstatSync(location);if(!stat.isFile()||stat.size!==file.size||digest(location)!==file.sha256)fail('restore_paper_capture_file_changed');const after=fs.lstatSync(within(root,relative));if(after.ino!==stat.ino||after.dev!==stat.dev||after.mtimeMs!==stat.mtimeMs||after.size!==stat.size)fail('restore_paper_capture_file_changed');return location;}
 for(const file of inventory){const relative=file.path.slice(5);if(!valid.test(relative)||expected.has(relative))fail('restore_paper_capture_inventory_unknown');check(relative,file);expected.set(relative,file);}
 for(const relative of keep)if(!expected.has(relative))fail('restore_paper_capture_retained_file_missing');
 const tasks=await query("SELECT id,state FROM durable_tasks WHERE kind LIKE 'learning.paper-capture.%' AND state IN ('queued','running','retry_wait','cancel_requested') LIMIT 100001");if(tasks.length>100000)fail('restore_paper_capture_task_limit');
 for(const task of tasks){await query("UPDATE durable_tasks SET state='cancelled',lease_token=NULL,lease_until=NULL,generation=generation+1,version=version+1,updated_at=?,error_code='restored_paper_capture_fence' WHERE id=?",[at,task.id]);await query('INSERT INTO durable_task_history VALUES(?,?,?,?,?,?)',[randomUUID(),task.id,'restored_paper_capture_fence','local-restore',at,JSON.stringify({backupId:manifest.id,previousState:task.state})]);}
 let filesDeleted=0,bytesDeleted=0;
 for(const [relative,file]of expected){if(keep.has(relative))continue;const location=check(relative,file);fs.unlinkSync(location);filesDeleted++;bytesDeleted+=file.size;await afterPhase?.('paper_capture_file_deleted',relative);}
 for(const {collection,row}of changed.values())await query('UPDATE domain_records SET body=? WHERE collection=? AND record_id=?',[JSON.stringify(row),collection,row.id]);
 const {verifyPaperImageFileSet}=require('../../apps/api/dist/apps/api/src/modules/learning/paper-capture-files.js');for(const page of store.paperCapturePages??[])for(const version of page.versions)await verifyPaperImageFileSet(root,version.receipt);
 const {verifyPaperCapturePdf}=require('../../apps/api/dist/apps/api/src/modules/learning/paper-capture-derived-pdf.js'),{retainedPaperCapturePage}=require('../../apps/api/dist/apps/api/src/modules/learning/paper-capture-group-record.js');
 for(const row of store.paperCaptureDerivations??[])if(row.pdf){
  const group=(store.paperCaptureGroups??[]).find(group=>group.id===row.groupId),saved=group?.history.find(saved=>saved.version.revision===row.groupRevision);if(!saved)fail('restore_paper_capture_original_group_missing');
  const retained=(store.paperCapturePages??[]).map(retainedPaperCapturePage),files=saved.version.pages.map(reference=>{const page=(store.paperCapturePages??[]).find(page=>page.id===reference.pageId),version=page?.versions.find(version=>version.receipt.version.fingerprint===reference.versionFingerprint);if(!version)fail('restore_paper_capture_original_page_missing');return version.receipt;});
  await verifyPaperCapturePdf({root,group:saved.version,history:group.history.slice(0,row.groupRevision-1).map(saved=>saved.version),retained,files},fs.readFileSync(within(root,'paper-images/pdf/'+row.pdf.pdfSha256+'.pdf')),row.pdf);
 }
 const nativeTasks=await query("SELECT * FROM durable_tasks WHERE kind IN ('learning.paper-capture.derive','studio.material.process','learning.paper-capture.repair','learning.paper-capture.repair.cleanup','learning.paper-capture.repair-upload.cleanup') LIMIT 100001");if(nativeTasks.length>100000)fail('paper_capture_integrity_task_limit');
 require('../../apps/api/dist/apps/api/src/modules/learning/paper-capture-native.js').assertPaperCaptureNativeRows(Object.entries(store).flatMap(([collection,values])=>values.map(body=>({collection,record_id:body.id,body}))),nativeTasks);
 return{paperCaptureFilesRetained:keep.size,paperCaptureFilesDeleted:filesDeleted,paperCaptureBytesDeleted:bytesDeleted,paperCaptureTasksFenced:tasks.length};
}
module.exports={cleanupRestoredPaperCaptures};

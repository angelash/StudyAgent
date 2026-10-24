// Cold restores only. The caller holds the database restore guard and owns a newly created target.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { materialCollections, materialReferences, managedEntry, auditMaterials } = require('./material-audit.cjs');
const hash = /^[a-f0-9]{64}$/, uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', uploadId = new RegExp('^studio_upload_' + uuid + '$');
const active = new Set(['queued','running','retry_wait','cancel_requested']), limit = 100000;
const fail = code => { throw new Error(code); };
const body = row => typeof row.body === 'string' ? JSON.parse(row.body) : row.body;
const payload = task => typeof task.payload === 'string' ? JSON.parse(task.payload) : task.payload;
async function records(query) {
  const rows = await query(`SELECT collection,record_id,body,position FROM domain_records WHERE collection IN (${materialCollections.map(() => '?').join(',')}) LIMIT ${limit + 1}`, materialCollections);
  if (rows.length > limit) fail('restore_material_record_limit');
  return rows.map(row => { const value=body(row); if (!value || typeof value !== 'object' || value.id !== row.record_id) fail('restore_material_record_identity_unknown'); return {...row,body:value}; });
}
function addKeys(rows, sources, uploads) {
  for (const row of rows) {
    if (row.collection === 'studioSourceMaterials') { if (!hash.test(row.body.sha256 ?? '')) fail('restore_material_identity_unknown'); sources.add(row.body.sha256); }
    if (row.collection === 'studioMaterialAssets') { if (!hash.test(row.body.id ?? '')) fail('restore_material_identity_unknown'); sources.add(row.body.id); }
    if (row.collection === 'studioMaterialUploads') { if (!uploadId.test(row.body.id ?? '') || !hash.test(row.body.sha256 ?? '')) fail('restore_upload_identity_unknown'); uploads.add(row.body.id); sources.add(row.body.sha256); }
  }
}
async function captureMaterialKeys(query) { const sources = new Set(), uploads = new Set(); addKeys(await records(query),sources,uploads); return { sources,uploads }; }
/** Old process PIDs have no authority in the new target. Permanent revocations are rebuilt from state. */
function omitRestoredMaterialControl(relative) {
  const entry = managedEntry(relative,false);
  return Boolean(entry && ['lease','purge','revocation','marker_staging'].includes(entry.part));
}
function uploadAuthorized(row, users, students, bindings, learning) {
  if (Boolean(row.studentId) !== Boolean(row.subject) || row.subject && !['math','chinese','english'].includes(row.subject)) return false;
  const owner = users.find(user => user.id === row.ownerUserId && user.status === 'active');
  if (!owner) return false;
  if (!row.studentId) return owner.role === 'parent' || owner.role === 'admin';
  if (!students.some(student => student.id === row.studentId)) return false;
  if (owner.role === 'admin') return true;
  const bound = id => bindings.some(binding => binding.studentId === row.studentId && binding.parentUserId === id && binding.status === 'active');
  if (owner.role === 'parent') return bound(owner.id);
  const guardian = users.find(user => user.id === row.guardianId && user.status === 'active');
  return owner.role === 'student' && Boolean(guardian && (guardian.role === 'admin' || bound(guardian.id))) && learning.some(access => access.studentId === row.studentId && access.userId === owner.id && access.status === 'enabled' && access.version === row.accessVersion);
}

async function cleanupRestoredMaterials({ root, query, manifest, before, now = Date.now(), restoreContext, afterPhase }) {
  const { files: { within, digest } } = require('./backup.cjs');
  const { acquireStudioPurgeFence, pruneDeadStudioFileLeases, revokeStudioUploadFiles } = require('../../apps/api/dist/apps/api/src/infrastructure/studio-file-coordination.js');
  const { inventoryStudioCollection, removeInventoriedStudioFile, removeEmptyStudioDirectory } = require('../../apps/api/dist/apps/api/src/infrastructure/studio-file-inventory.js');
  root = path.resolve(root);
  // These guards are created only by the cold restore wrappers, before copying any source bytes.
  if (!fs.lstatSync(within(root,'.study-restore-incomplete')).isFile()) fail('restore_material_guard_required');
  const guard = (await query('SELECT state,backup_id FROM study_restore_guard WHERE id=1'))[0];
  if (guard?.state !== 'restoring' || guard.backup_id !== manifest.id) fail('restore_material_guard_mismatch');
  const sources = new Set(before.sources), uploads = new Set(before.uploads), manifestFiles = new Map(), priorRevocations = new Set();
  for (const file of manifest.files) if (file.path.startsWith('data/')) {
    const relative = file.path.slice(5), entry = managedEntry(relative,false);
    if (entry?.kind === 'source') sources.add(entry.key);
    if (entry?.kind === 'upload') uploads.add(entry.key);
    if (entry?.part === 'revocation') priorRevocations.add(entry.key);
    if (!omitRestoredMaterialControl(relative)) manifestFiles.set(relative,file);
  }
  let rows = await records(query); addKeys(rows,sources,uploads);
  const auth = new Map();
  for (const entry of await query("SELECT collection,body FROM domain_records WHERE collection IN ('users','students','bindings','studentLearningAccess')")) { if (!auth.has(entry.collection)) auth.set(entry.collection,[]); auth.get(entry.collection).push(body(entry)); }
  const counts = { materialSourcesRetained:0,materialSourcesCollected:0,materialUploadsRetained:0,materialUploadsRevoked:0,materialUploadsCancelled:0,materialUploadsExpired:0,materialTasksFenced:0,materialFilesDeleted:0,materialBytesDeleted:0,materialFilesRetained:0 };
  const at = new Date(now).toISOString();
  for (const entry of rows.filter(row => row.collection === 'studioMaterialUploads')) {
    const row = entry.body;
    if (!['uploading','completed','cancelled'].includes(row.status) || !Number.isFinite(Date.parse(row.expiresAt))) fail('restore_upload_state_unknown');
    if (row.status === 'uploading' && (Date.parse(row.expiresAt) <= now || !uploadAuthorized(row,auth.get('users') ?? [],auth.get('students') ?? [],auth.get('bindings') ?? [],auth.get('studentLearningAccess') ?? []))) {
      if (!Number.isSafeInteger(row.revision) || row.revision < 0) fail('restore_upload_state_unknown');
      if (Date.parse(row.expiresAt) <= now) counts.materialUploadsExpired++;
      row.status='cancelled'; row.revision++; counts.materialUploadsCancelled++;
      await query('UPDATE domain_records SET body=? WHERE collection=? AND record_id=?',[JSON.stringify(row),entry.collection,entry.record_id]);
    }
    if (row.status === 'uploading' && priorRevocations.has(row.id)) fail('restore_upload_revocation_conflict');
  }
  const tasks = await query("SELECT id,kind,state,payload,owner_id FROM durable_tasks WHERE kind IN ('studio.material.process','studio.material.collect') LIMIT " + (limit + 1));
  if (tasks.length > limit) fail('restore_material_task_limit');
  const materials = new Map(rows.filter(row => row.collection === 'studioSourceMaterials').map(row => [row.record_id,row.body]));
  const processingIds = new Map(), activeUserIds = new Set((auth.get('users') ?? []).filter(user=>user.status==='active').map(user=>user.id));
  for (const task of tasks) {
    task.payload=payload(task);
    if (task.kind === 'studio.material.process' && !hash.test(task.payload?.sha256 ?? '')) fail('restore_processing_identity_unknown');
    if (task.kind === 'studio.material.process') { sources.add(task.payload.sha256); if (!processingIds.has(task.payload.sha256)) processingIds.set(task.payload.sha256,[]); processingIds.get(task.payload.sha256).push(task.id); }
    const material=materials.get(task.payload?.materialId);
    const stale = task.kind === 'studio.material.collect' || !material || material.processingTaskId !== task.id || material.sha256 !== task.payload.sha256 || material.status === 'cancelled' || !activeUserIds.has(task.owner_id);
    if (active.has(task.state) && stale) {
      await query("UPDATE durable_tasks SET state='cancelled',lease_token=NULL,lease_until=NULL,version=version+1,generation=generation+1,updated_at=?,error_code='restored_source_revoked' WHERE id=?",[at,task.id]);
      await query('INSERT INTO durable_task_history VALUES(?,?,?,?,?,?)',[randomUUID(),task.id,'restored_source_revoked','local-restore',at,JSON.stringify({previousState:task.state,backupId:manifest.id})]); task.state='cancelled'; counts.materialTasksFenced++;
    }
  }
  // No application is allowed into this root yet. Advance every asset identity and drop old collection ownership.
  const assets = new Map(rows.filter(row => row.collection === 'studioMaterialAssets').map(row => [row.record_id,row]));
  let position=Number((await query("SELECT COALESCE(MAX(position),-1)+1 AS position FROM domain_records WHERE collection='studioMaterialAssets'"))[0].position);
  for (const key of sources) {
    const entry=assets.get(key), old=entry?.body;
    if (old && (!['available','deleting'].includes(old.state) || !Number.isSafeInteger(old.generation) || old.generation < 1 || old.generation >= Number.MAX_SAFE_INTEGER)) fail('restore_material_asset_unknown');
    const row={id:key,state:'available',generation:old ? old.generation+1 : 2,updatedAt:at};
    if (entry) await query('UPDATE domain_records SET body=? WHERE collection=? AND record_id=?',[JSON.stringify(row),'studioMaterialAssets',key]);
    else await query('INSERT INTO domain_records VALUES(?,?,?,?)',['studioMaterialAssets',key,JSON.stringify(row),position++]);
  }
  rows=await records(query);
  const references=materialReferences(rows,tasks,now);
  if (references.issues.length) fail('restore_material_references_unknown');
  const report=await auditMaterials({dataDir:root,snapshot:{rows,tasks,driver:'restore',revision:0},graceHours:0,now});
  if (!report.complete) fail('restore_material_inventory_unknown');
  function verifyCopied(relative) {
    const expected=manifestFiles.get(relative); if (!expected) fail('restore_material_file_not_in_manifest');
    const file=within(root,relative),before=fs.lstatSync(file);
    if (!before.isFile() || before.size !== expected.size || digest(file) !== expected.sha256) fail('restore_material_file_changed');
    const after=fs.lstatSync(within(root,relative));
    if (after.ino !== before.ino || after.dev !== before.dev || after.size !== before.size || after.mtimeMs !== before.mtimeMs) fail('restore_material_file_changed');
  }
  // Check the entire inventory before deleting any file; each planned deletion is checked again below.
  const controlParts=new Set(['lease','purge','revocation','marker_staging']);
  for (const entry of report.entries) {
    if (!controlParts.has(entry.part)) { verifyCopied(entry.path); continue; }
    if (!restoreContext) fail('restore_material_unexpected_control');
    const location=within(root,entry.path),stat=fs.lstatSync(location);
    if (!stat.isFile()||stat.size>4096) fail('restore_material_control_unknown');
    if(entry.part==='marker_staging') {
      const parsed=require('../../apps/api/dist/apps/api/src/infrastructure/studio-atomic-marker.js').parseStudioMarkerStagingName(path.basename(location));
      if(!parsed||!(sources.has(entry.key)||uploads.has(entry.key)))fail('restore_material_control_unknown');
      try{process.kill(parsed.pid,0);fail('restore_material_control_active');}catch(error){if(error.code!=='ESRCH')throw error;}
    } else {
      const value=JSON.parse(fs.readFileSync(location,'utf8'));
      if(value.restoreId!==restoreContext.restoreId||value.restoreContextHash!==restoreContext.bindingHash||entry.part==='lease')fail('restore_material_control_unknown');
      if(entry.part==='purge'&&value.taskId!=='restore_'+manifest.id)fail('restore_material_control_unknown');
    }
  }
  const plans=[];
  for (const key of uploads) {
    if (references.uploads.get(key)?.active) { counts.materialUploadsRetained++; continue; }
    plans.push({kind:'upload',key,inventory:await inventoryStudioCollection(root,'upload',key)});
  }
  for (const key of sources) {
    const ref=references.assets.get(key);
    if (ref?.references.size || ref?.active) { counts.materialSourcesRetained++; continue; }
    plans.push({kind:'source',key,inventory:await inventoryStudioCollection(root,'source',key,processingIds.get(key) ?? [])});
  }
  for (const plan of plans) for (const file of plan.inventory.files) verifyCopied(path.relative(root,file.path).replaceAll('\\','/'));
  for (const plan of plans) {
    if (plan.kind==='upload') {
      if(restoreContext){
        const {studioCoordinationRoot}=require('../../apps/api/dist/apps/api/src/infrastructure/studio-file-paths.js');
        const {publishStudioMarker}=require('../../apps/api/dist/apps/api/src/infrastructure/studio-atomic-marker.js');
        const directory=studioCoordinationRoot(root,'upload',plan.key),file=path.resolve(directory,'revoked.json');
        try{await publishStudioMarker(directory,file,'revoked',{format:'study-upload-revocation-v1',id:plan.key,nonce:randomUUID(),pid:process.pid,createdAt:at,restoreId:restoreContext.restoreId,restoreContextHash:restoreContext.bindingHash});}
        catch(error){if(error.code!=='EEXIST')throw error;const value=JSON.parse(fs.readFileSync(within(root,path.relative(root,file)),'utf8'));if(value.id!==plan.key||value.restoreId!==restoreContext.restoreId||value.restoreContextHash!==restoreContext.bindingHash)fail('restore_material_control_unknown');}
      }else await revokeStudioUploadFiles(root,plan.key);
      counts.materialUploadsRevoked++;
    }
    const release=await acquireStudioPurgeFence(root,plan.kind,plan.key,{generation:0,taskId:'restore_'+manifest.id,token:randomUUID(),...(restoreContext?{restoreId:restoreContext.restoreId,restoreContextHash:restoreContext.bindingHash}:{})});
    try {
      await pruneDeadStudioFileLeases(root,plan.kind,plan.key);
      for (const file of plan.inventory.files) { const relative=path.relative(root,file.path).replaceAll('\\','/');verifyCopied(relative); if (await removeInventoriedStudioFile(file)) { counts.materialFilesDeleted++; counts.materialBytesDeleted+=file.stat.size;await afterPhase?.('material_file_deleted',relative); } }
      for (const directory of plan.inventory.directories) await removeEmptyStudioDirectory(directory);
    } finally { await release(); }
    if (plan.kind==='source') counts.materialSourcesCollected++;
  }
  counts.materialFilesRetained=report.entries.filter(entry=>!controlParts.has(entry.part)).length-counts.materialFilesDeleted;
  return counts;
}
module.exports={captureMaterialKeys,omitRestoredMaterialControl,cleanupRestoredMaterials};

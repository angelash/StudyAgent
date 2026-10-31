const fs = require('node:fs'), { randomUUID } = require('node:crypto');
const fail = code => { throw Error(code); }, decode = value => typeof value === 'string' ? JSON.parse(value) : value;

/** A cold restore only: the database guard and operation lock exclude live
 * application workers. Delete only exact verified manifest entries belonging
 * to a registered workspace; unknown files remain for inspection. */
async function cleanupRestoredPaperExports({ root, query, manifest, afterPhase, now = Date.now }) {
  const { within, digest } = require('./backup.cjs').files;
  const guard = (await query('SELECT state,backup_id FROM study_restore_guard WHERE id=1'))[0];
  if (guard?.state !== 'restoring' || guard.backup_id !== manifest.id || !fs.lstatSync(within(root, '.study-restore-incomplete')).isFile()) fail('restore_paper_export_guard_required');
  const rows = await query("SELECT collection,record_id,body FROM domain_records WHERE collection IN ('paperExports','paperExportFiles') LIMIT 1000001");
  if (rows.length > 1000000) fail('restore_paper_export_record_limit');
  const inventory = manifest.files.filter(file => file.path.startsWith('data/paper-exports/'));
  if (!rows.length && !inventory.length) return { paperExportFilesRetained: 0, paperExportFilesDeleted: 0, paperExportBytesDeleted: 0, paperExportTasksFenced: 0 };
  const { assertPaperExportFile, collectPaperExportFile } = require('../../apps/api/dist/apps/api/src/modules/library/paper-export-file-record.js');
  const { registerPaperExportWriterProtocol, revokePaperExportWorkspace } = require('../../apps/api/dist/apps/api/src/infrastructure/studio-file-coordination.js');
  const { paperExportBackupReferences } = require('../../apps/api/dist/apps/api/src/modules/library/paper-export-backup.js');
  const records = rows.filter(row => row.collection === 'paperExports').map(row => decode(row.body)), files = rows.filter(row => row.collection === 'paperExportFiles').map(row => assertPaperExportFile(decode(row.body)));
  const keep = paperExportBackupReferences(rows), expected = new Map(), knownWorkspaces = new Set(files.map(file => file.workspace));
  const valid = /^paper-exports\/[a-f0-9]{64}\/(?:input\.json|media\/[a-f0-9]{64}\.png|artifacts-(practice|answers)\/\1\.(pdf|docx))$/;
  function checked(relative, file) {
    const target = within(root, relative), before = fs.lstatSync(target);
    if (!before.isFile() || before.size !== file.size || digest(target) !== file.sha256) fail('restore_paper_export_file_changed');
    const after = fs.lstatSync(within(root, relative));
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) fail('restore_paper_export_file_changed');
    return target;
  }
  for (const file of inventory) {
    const relative = file.path.slice(5), workspace = relative.split('/').slice(0, 2).join('/');
    if (!valid.test(relative) || !knownWorkspaces.has(workspace) || expected.has(relative)) fail('restore_paper_export_inventory_unknown');
    checked(relative, file); expected.set(relative, file);
  }
  for (const [relative, descriptor] of keep) if (!expected.has(relative) || expected.get(relative).sha256 !== descriptor.sha256 || expected.get(relative).size !== descriptor.size) fail('restore_paper_export_retained_file_missing');
  // Refuse any unlisted file before removing even a known entry in its workspace.
  for (const workspace of knownWorkspaces) {
    const location = within(root, workspace); if (!fs.existsSync(location)) continue;
    const visit = relative => { for (const entry of fs.readdirSync(within(root, relative), { withFileTypes: true })) {
      const name = relative + '/' + entry.name; within(root, name);
      if (entry.isSymbolicLink()) fail('restore_paper_export_unknown_file');
      if (entry.isDirectory()) visit(name);
      else if (!entry.isFile() || !expected.has(name)) fail('restore_paper_export_unknown_file');
    } }; visit(workspace);
  }
  const at = new Date(now()).toISOString();
  const active = await query("SELECT id,state FROM durable_tasks WHERE kind='library.paper-export.render' AND state IN ('queued','running','retry_wait','cancel_requested') LIMIT 100001");
  if (active.length > 100000) fail('restore_paper_export_task_limit');
  for (const task of active) {
    // Generic restoration already increments a genuinely interrupted lease.
    // This terminal fence also covers queued work, without inventing a retry.
    await query("UPDATE durable_tasks SET state='cancelled',lease_token=NULL,lease_until=NULL,version=version+1,updated_at=?,error_code='restored_paper_export_fence' WHERE id=?", [at, task.id]);
    await query('INSERT INTO durable_task_history VALUES(?,?,?,?,?,?)', [randomUUID(), task.id, 'restored_paper_export_fence', 'local-restore', at, JSON.stringify({ backupId: manifest.id, previousState: task.state })]);
  }
  let filesDeleted = 0, bytesDeleted = 0;
  for (const file of files) {
    await registerPaperExportWriterProtocol(root, file.workspace.split('/')[1]);
    const published = records.some(row => row.slots.some(slot => slot.published?.fileId === file.id));
    if (published) { if (file.state !== 'available') fail('restore_paper_export_publication_changed'); continue; }
    if (file.state === 'deleted') { await revokePaperExportWorkspace(root, file.workspace.split('/')[1]); continue; }
    let current = file;
    if (!current.cleanupTaskId) {
      const prepared = collectPaperExportFile(current, current.deletionReceiptId, new Date(now()).toISOString()); current = prepared.file;
      const task = prepared.task;
      const old = (await query('SELECT id,payload_hash FROM durable_tasks WHERE id=? OR (owner_id=? AND kind=? AND request_key=?)', [task.id, task.ownerUserId, task.kind, task.requestKey]))[0];
      if (old) { if (old.id !== task.id || old.payload_hash !== task.payloadHash) fail('restore_paper_export_cleanup_changed'); }
      else {
        await query("INSERT INTO durable_tasks(id,kind,owner_id,request_key,payload_hash,payload,state,max_attempts,available_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'queued',?,?,?,?)", [task.id, task.kind, task.ownerUserId, task.requestKey, task.payloadHash, JSON.stringify(task.payload), task.maxAttempts, now(), task.createdAt, task.createdAt]);
        await query('INSERT INTO durable_task_history VALUES(?,?,?,?,?,?)', ['requested:' + task.id, task.id, 'requested', task.ownerUserId, task.createdAt, JSON.stringify({ kind: task.kind })]);
      }
    }
    let cleanup = (await query('SELECT * FROM durable_tasks WHERE id=?', [current.cleanupTaskId]))[0];
    if (!cleanup || cleanup.kind !== 'library.paper-export.cleanup' || cleanup.owner_id !== 'system-paper-export' || decode(cleanup.payload).fileId !== file.id || cleanup.state === 'succeeded') fail('restore_paper_export_cleanup_changed');
    if (['failed', 'cancelled'].includes(cleanup.state) || cleanup.attempts >= cleanup.max_attempts) {
      await query("UPDATE durable_tasks SET state='queued',attempts=0,generation=generation+1,version=version+1,lease_token=NULL,lease_until=NULL,result=NULL,error_code=NULL,progress='{}',available_at=?,updated_at=? WHERE id=?", [now(), at, cleanup.id]);
      cleanup = (await query('SELECT * FROM durable_tasks WHERE id=?', [cleanup.id]))[0];
      await query('INSERT INTO durable_task_history VALUES(?,?,?,?,?,?)', [randomUUID(), cleanup.id, 'retried', 'local-restore', at, JSON.stringify({ generation: cleanup.generation })]);
    }
    const token = randomUUID(), leaseUntil = now() + 60000;
    const claimed = await query("UPDATE durable_tasks SET state='running',attempts=attempts+1,version=version+1,lease_token=?,lease_until=?,updated_at=? WHERE id=? AND state IN ('queued','retry_wait') AND attempts<max_attempts RETURNING id", [token, leaseUntil, at, cleanup.id]);
    if (claimed.length !== 1) fail('restore_paper_export_cleanup_lease_changed');
    await query('INSERT INTO durable_task_history VALUES(?,?,?,?,?,?)', [randomUUID(), cleanup.id, 'claimed', 'worker', at, JSON.stringify({ attempt: cleanup.attempts + 1, generation: cleanup.generation, restoration: true })]);
    await query('UPDATE domain_records SET body=? WHERE collection=? AND record_id=?', [JSON.stringify(current), 'paperExportFiles', current.id]);
    await revokePaperExportWorkspace(root, file.workspace.split('/')[1]);
    for (const [relative, descriptor] of expected) {
      if (!relative.startsWith(current.workspace + '/')) continue;
      if (keep.has(relative)) fail('restore_paper_export_file_still_referenced');
      fs.unlinkSync(checked(relative, descriptor)); filesDeleted++; bytesDeleted += descriptor.size;
      await afterPhase?.('paper_export_file_deleted', relative);
    }
    const result = { ...decode(cleanup.payload), filesFinished: true }, completedAt = new Date(now()).toISOString();
    const completed = await query("UPDATE durable_tasks SET state='succeeded',result=?,progress=?,lease_token=NULL,lease_until=NULL,version=version+1,updated_at=? WHERE id=? AND lease_token=? AND state='running' AND lease_until>? RETURNING id", [JSON.stringify(result), JSON.stringify({ stage: 'completed' }), completedAt, cleanup.id, token, now()]);
    if (completed.length !== 1) fail('restore_paper_export_cleanup_lease_changed');
    await query('INSERT INTO durable_task_history VALUES(?,?,?,?,?,?)', [randomUUID(), cleanup.id, 'succeeded', 'worker', completedAt, JSON.stringify(result)]);
    current = assertPaperExportFile({ ...current, state: 'deleted', updatedAt: completedAt });
    await query('UPDATE domain_records SET body=? WHERE collection=? AND record_id=?', [JSON.stringify(current), 'paperExportFiles', current.id]);
  }
  const { assertPaperLibraryPersisted } = require('../../apps/api/dist/apps/api/src/modules/library/paper-export-persistence.js');
  // Use portable JSON extraction: the rows below are sufficient for the full
  // relation reader on both drivers, including actual restoration events.
  const finalRows = await query("SELECT collection,record_id,body FROM domain_records WHERE collection IN ('paperSelectionLists','paperSelectionCommands','paperExports','paperExportCommands','paperSourceExposures','paperExportFiles','users','students','privacyRequests','events')");
  const tasks = await query("SELECT * FROM durable_tasks WHERE kind IN ('library.paper-export.render','library.paper-export.cleanup')"), history = await query("SELECT h.* FROM durable_task_history h JOIN durable_tasks t ON t.id=h.task_id WHERE t.kind IN ('library.paper-export.render','library.paper-export.cleanup')");
  require('../../apps/api/dist/apps/api/src/modules/library/paper-export-native.js').assertPaperExportNativeRows(finalRows, tasks, history);
  return { paperExportFilesRetained: keep.size, paperExportFilesDeleted: filesDeleted, paperExportBytesDeleted: bytesDeleted, paperExportTasksFenced: active.length };
}
module.exports = { cleanupRestoredPaperExports };

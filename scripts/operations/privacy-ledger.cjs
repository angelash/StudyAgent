#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { Pool } = require('pg');
const FORMAT = 'study-agent-deletion-ledger-v1';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = code => { throw new Error(code); };
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function validateReceipt(receipt) {
  if (!receipt || !['student_delete', 'account_delete'].includes(receipt.kind) ||
    !['id', 'actorId', 'requestKey'].every(key => typeof receipt[key] === 'string' && receipt[key].length >= 1 && receipt[key].length <= 180) ||
    !isHash(receipt.subjectHash) || !isHash(receipt.inputHash) || !Number.isFinite(Date.parse(receipt.completedAt)) ||
    !['erasedStudentHashes', 'retainedStudentHashes'].every(key => Array.isArray(receipt[key]) && receipt[key].length <= 10000 && receipt[key].every(isHash)) ||
    new Set(receipt.erasedStudentHashes).size !== receipt.erasedStudentHashes.length || new Set(receipt.retainedStudentHashes).size !== receipt.retainedStudentHashes.length ||
    receipt.erasedStudentHashes.some(value => receipt.retainedStudentHashes.includes(value)) ||
    (receipt.kind === 'student_delete' && (receipt.erasedStudentHashes.length !== 1 || receipt.erasedStudentHashes[0] !== receipt.subjectHash || receipt.retainedStudentHashes.length)) ||
    !receipt.counts || !['records', 'observations', 'activities', 'plans', 'conversations', 'accessRecords'].every(key => Number.isSafeInteger(receipt.counts[key]) && receipt.counts[key] >= 0)) fail('invalid_privacy_deletion_receipt');
  return Object.fromEntries(['id', 'actorId', 'kind', 'subjectHash', 'requestKey', 'inputHash', 'completedAt', 'counts', 'erasedStudentHashes', 'retainedStudentHashes'].map(key => [key, receipt[key]]));
}
function makeLedger(receipts) {
  const entries = receipts.filter(receipt => receipt.kind.endsWith('_delete')).map(validateReceipt).sort((a, b) => a.completedAt.localeCompare(b.completedAt) || a.id.localeCompare(b.id));
  if (new Set(entries.map(entry => entry.id)).size !== entries.length || entries.length > 100000) fail('invalid_privacy_ledger_entries');
  const payload = { format: FORMAT, entries }; return { ...payload, sha256: hash(payload) };
}
function readLedger(file) {
  if (!file) return undefined;
  // Require the backup helper lazily: restore-state imports this module too.
  const { noLinks } = require('./backup.cjs').files; const target = noLinks(file), stat = fs.statSync(target);
  if (!stat.isFile() || stat.size > 64 * 1024 * 1024) fail('invalid_privacy_ledger_file');
  const supplied = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (supplied.format !== FORMAT || !Array.isArray(supplied.entries) || supplied.entries.length > 100000) fail('invalid_privacy_ledger_format');
  const canonical = makeLedger(supplied.entries);
  if (!isHash(supplied.sha256) || canonical.sha256 !== supplied.sha256 || canonical.entries.length !== supplied.entries.length) fail('privacy_ledger_integrity_failed');
  return canonical;
}
async function exportLedger({ dataDir, connectionString, destination }) {
  const { noLinks } = require('./backup.cjs').files; let receipts;
  if (connectionString) {
    if (!/^postgres(ql)?:/.test(connectionString)) fail('postgres_connection_required');
    const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
    try { receipts = (await pool.query("SELECT body FROM domain_records WHERE collection='privacyRequests'")).rows.map(row => row.body); } finally { await pool.end(); }
  } else {
    const database = new DatabaseSync(noLinks(path.resolve(dataDir, 'study-agent.sqlite3')), { readOnly: true });
    try { receipts = database.prepare("SELECT body FROM domain_records WHERE collection='privacyRequests'").all().map(row => JSON.parse(row.body)); } finally { database.close(); }
  }
  const ledger = makeLedger(receipts), target = noLinks(destination);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 }); fs.writeFileSync(target, JSON.stringify(ledger, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { deletions: ledger.entries.length, sha256: ledger.sha256 };
}
async function applyDeletionLedger(query, ledger) {
  if (!ledger) return { appliedDeletionReceipts: 0, privacyRowsRemoved: 0 };
  const helpers = require('../../apps/api/dist/apps/api/src/modules/privacy/privacy-records.js');
  const records = await query('SELECT collection,record_id,body,position FROM domain_records ORDER BY collection,position'), store = {};
  for (const row of records) (store[row.collection] ??= []).push(typeof row.body === 'string' ? JSON.parse(row.body) : row.body);
  store.privacyRequests ??= [];
  for (const receipt of ledger.entries) {
    const erased = (store.students ?? []).filter(child => receipt.erasedStudentHashes.includes(helpers.privacyHash({ id: child.id })));
    const retained = (store.students ?? []).filter(child => receipt.retainedStudentHashes.includes(helpers.privacyHash({ id: child.id })));
    const actor = (store.users ?? []).find(user => user.id === receipt.actorId);
    if (receipt.kind === 'account_delete' && actor && (actor.role !== 'parent' || helpers.privacyHash({ id: actor.id }) !== receipt.subjectHash)) fail('privacy_ledger_account_identity_conflict');
    const selected = helpers.mergeSelections(...erased.map(child => helpers.studentRecords(store, child.id)),
      receipt.kind === 'account_delete' && actor ? helpers.accountRecords(store, actor.id, actor.principal) : {});
    helpers.removeSelected(store, selected);
    if (receipt.kind === 'account_delete') helpers.anonymizeSharedAttribution(store, retained.map(child => child.id), receipt.actorId);
    const previous = store.privacyRequests.find(row => row.id === receipt.id || row.actorId === receipt.actorId && row.requestKey === receipt.requestKey);
    if (previous && JSON.stringify(validateReceipt(previous)) !== JSON.stringify(receipt)) fail('privacy_ledger_receipt_conflict');
    if (!previous) store.privacyRequests.push(receipt);
  }
  const id = row => String(row.id ?? row.eventId ?? row.questionId ?? row.sessionId);
  let removed = 0;
  const previous = new Map(records.map(row => [`${row.collection}\0${row.record_id}`, row]));
  for (const [collection, values] of Object.entries(store)) {
    for (let position = 0; position < values.length; position++) {
      const row = values[position], key = `${collection}\0${id(row)}`, before = previous.get(key);
      if (!before) await query('INSERT INTO domain_records VALUES(?,?,?,?)', [collection, id(row), JSON.stringify(row), position]);
      else {
        const body = typeof before.body === 'string' ? JSON.parse(before.body) : before.body;
        if (JSON.stringify(body) !== JSON.stringify(row) || before.position !== position) await query('UPDATE domain_records SET body=?,position=? WHERE collection=? AND record_id=?', [JSON.stringify(row), position, collection, id(row)]);
        previous.delete(key);
      }
    }
  }
  for (const before of previous.values()) { await query('DELETE FROM domain_records WHERE collection=? AND record_id=?', [before.collection, before.record_id]); removed++; }
  const event = { eventId: randomUUID(), eventName: 'privacy.restore_deletions_applied', eventVersion: 1, occurredAt: new Date().toISOString(),
    payload: { ledgerSha256: ledger.sha256, appliedDeletionReceipts: ledger.entries.length, privacyRowsRemoved: removed } };
  const position = Number((await query("SELECT COALESCE(MAX(position),-1)+1 AS position FROM domain_records WHERE collection='events'"))[0].position);
  await query('INSERT INTO domain_records VALUES(?,?,?,?)', ['events', event.eventId, JSON.stringify(event), position]);
  const retainedMedia = new Set((store.studentMedia ?? []).map(row => row.id));
  const removedMediaIds = records.filter(row => row.collection === 'studentMedia' && !retainedMedia.has(row.record_id)).map(row => row.record_id);
  return { appliedDeletionReceipts: ledger.entries.length, privacyRowsRemoved: removed, deletionLedgerSha256: ledger.sha256, removedMediaIds: [...removedMediaIds,...records.filter(row=>row.collection==='classroomVisuals'&&!(store.classroomVisuals??[]).some(item=>item.id===row.record_id)).map(row=>row.record_id)] };
}
function purgeRestoredMedia(root, ids = [], manifest, onDelete) {
  const { within } = require('./backup.cjs').files;
  for (const id of ids) {
    if (!/^(?:student_media|classroom_visual)_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) fail('invalid_student_media_reference');
    const directory = within(root, `${id.startsWith('classroom_visual_')?'classroom-visuals':'student-media'}/${id}`);
    if (fs.existsSync(directory)) {
      if(!manifest)fs.rmSync(directory,{recursive:true,force:true});
      else {
        const {walk,digest,within}=require('./backup.cjs').files,expected=new Map(manifest.files.map(file=>[file.path,file])),files=[...walk(directory)],directories=new Set();
        for(const item of files){const relative=path.relative(root,item.path).replaceAll('\\','/'),entry=expected.get('data/'+relative),stat=fs.lstatSync(item.path);if(!entry||stat.size!==entry.size||digest(item.path)!==entry.sha256)fail('restore_media_inventory_unknown');}
        for(const item of files){
          const relative=path.relative(root,item.path).replaceAll('\\','/'),file=within(root,relative),entry=expected.get('data/'+relative),before=fs.lstatSync(file);
          if(!before.isFile()||before.size!==entry.size||digest(file)!==entry.sha256)fail('restore_media_file_changed');
          const after=fs.lstatSync(within(root,relative));if(before.ino!==after.ino||before.dev!==after.dev||before.size!==after.size||before.mtimeMs!==after.mtimeMs)fail('restore_media_file_changed');
          let parent=path.dirname(file);while(parent===directory||parent.startsWith(directory+path.sep)){directories.add(parent);parent=path.dirname(parent);}fs.unlinkSync(file);onDelete?.(relative);
        }
        for(const target of [...directories].sort((a,b)=>b.length-a.length))fs.rmdirSync(target);
        if(!files.length)fs.rmdirSync(directory);
      }
    }
  }
  return ids.length;
}
module.exports = { makeLedger, readLedger, exportLedger, applyDeletionLedger, purgeRestoredMedia };
if (require.main === module) {
  (async () => {
    const [command, ...args] = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i].slice(2); if (!args[i].startsWith('--') || !['data-dir', 'connection-env', 'destination', 'ledger'].includes(key) || !args[i + 1] || options[key]) fail('invalid_arguments'); options[key] = args[i + 1];
    }
    if (command === 'verify') { const ledger = readLedger(options.ledger); if (!ledger) fail('ledger_required'); return { deletions: ledger.entries.length, sha256: ledger.sha256 }; }
    if (command !== 'export' || !options.destination || Boolean(options['data-dir']) === Boolean(options['connection-env'])) fail('usage_export_or_verify');
    const connectionString = options['connection-env'] ? process.env[options['connection-env']] : undefined;
    if (options['connection-env'] && !connectionString) fail('connection_environment_missing');
    return exportLedger({ dataDir: options['data-dir'], connectionString, destination: options.destination });
  })().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(`Privacy ledger operation failed: ${error.code ?? error.message}`); process.exitCode = 1; });
}

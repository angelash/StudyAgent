// Shared file protocol. Callers must retain the independent operation transaction until finalization.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createHash, randomUUID } = require('node:crypto');
const { fingerprint } = require('./restore-context.cjs');
const fail = code => { throw new Error(code); };
const paths = () => require('./backup.cjs').files;
const publisher = () => require('../../apps/api/dist/apps/api/src/infrastructure/atomic-marker-publication.js');
const exists = file => { try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };

async function acquireRestoreOperation(root, context) {
  const { within, noLinks } = paths(), file = within(root, '.study-restore-control/operation.sqlite3');
  if (!exists(file)) {
    const staging = within(root, `.study-restore-control/operation-${process.pid}-${randomUUID()}.sqlite3`);
    const db = new DatabaseSync(staging);
    try {
      db.exec('PRAGMA application_id=1397903186; CREATE TABLE identity(id INTEGER PRIMARY KEY CHECK(id=1),context_id TEXT NOT NULL,context_hash TEXT NOT NULL,pid INTEGER,nonce TEXT)');
      db.prepare('INSERT INTO identity(id,context_id,context_hash) VALUES(1,?,?)').run(context.restoreId,context.bindingHash);
    } finally { db.close(); }
    const fd=fs.openSync(staging,'r+');try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    noLinks(file);
    try { fs.linkSync(staging,file); } catch (error) { if (error.code!=='EEXIST') throw error; }
    finally { noLinks(staging); fs.unlinkSync(staging); }
  }
  noLinks(file);for(const suffix of ['-journal','-wal','-shm'])noLinks(file+suffix);
  if (!fs.lstatSync(file).isFile()) fail('restore_operation_unknown');
  const db=new DatabaseSync(file); let acquired=false;
  try {
    db.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE'); acquired=true;
    if (db.prepare('PRAGMA application_id').get().application_id!==1397903186) fail('restore_operation_unknown');
    const identity=db.prepare('SELECT context_id,context_hash FROM identity WHERE id=1').get();
    if (identity?.context_id!==context.restoreId||identity.context_hash!==context.bindingHash) fail('restore_operation_identity_mismatch');
    db.prepare('UPDATE identity SET pid=?,nonce=? WHERE id=1').run(process.pid,randomUUID());
    return () => { try { db.exec('ROLLBACK'); } finally { db.close(); } };
  } catch(error) {
    if(acquired)db.exec('ROLLBACK'); db.close();
    if(error.errcode===5||error.code==='SQLITE_BUSY')fail('restore_operation_active');
    throw error;
  }
}

function verifyFile(file, expected) {
  const { noLinks, digest }=paths(); noLinks(file);
  const before=fs.lstatSync(file);
  if(!before.isFile()||before.size!==expected.size||digest(file)!==expected.sha256)fail('restore_existing_file_mismatch');
  noLinks(file); const after=fs.lstatSync(file);
  if(after.ino!==before.ino||after.dev!==before.dev||after.size!==before.size||after.mtimeMs!==before.mtimeMs)fail('restore_file_changed');
}

async function copyRestoreFile({ root,context,relative,source,bytes,expected,transform,verifyExisting,afterPhase }) {
  const {within,noLinks,digest}=paths(),target=within(root,relative),key=fingerprint(relative);
  const directory=within(root,'.study-restore-control/copies'),intentFile=within(root,`.study-restore-control/copies/${key}.json`),staging=within(root,`.study-restore-control/copies/${key}.partial`);
  const binding={restoreId:context.restoreId,contextHash:context.bindingHash,relative,sha256:expected.sha256,size:expected.size};
  if(exists(intentFile)) {
    noLinks(intentFile);const stat=fs.lstatSync(intentFile);
    if(!stat.isFile()||stat.size>4096)fail('restore_copy_intent_unknown');
    const value=JSON.parse(fs.readFileSync(intentFile,'utf8'));
    if(value.format!=='study-restore-copy-v1'||fingerprint(value.binding)!==fingerprint(binding))fail('restore_copy_intent_mismatch');
  } else {
    await publisher().publishAtomicMarker({directory,file:intentFile,purpose:'copy',persistent:true,value:{format:'study-restore-copy-v1',nonce:randomUUID(),pid:process.pid,binding}});
  }
  if(exists(target)) {
    if(verifyExisting)await verifyExisting(target);else verifyFile(target,expected);
    if(exists(staging)) { noLinks(staging); if(!fs.lstatSync(staging).isFile())fail('restore_copy_staging_unknown'); fs.unlinkSync(staging); }
    return {copied:false};
  }
  if(exists(staging)) { noLinks(staging);if(!fs.lstatSync(staging).isFile())fail('restore_copy_staging_unknown');fs.unlinkSync(staging); }
  noLinks(staging);let input,output;
  try {
    output=fs.openSync(staging,'wx',0o600);await afterPhase?.('copy_created',relative);
    const hash=createHash('sha256');let count=0,before;
    if(source){noLinks(source);before=fs.lstatSync(source);if(!before.isFile())fail('restore_source_not_regular');input=fs.openSync(source,'r');}
    const buffer=source?Buffer.allocUnsafe(1024*1024):Buffer.from(bytes);
    for(;;) {
      const length=source?fs.readSync(input,buffer):count===0?buffer.length:0;
      if(!length)break;
      let written=0;while(written<length)written+=fs.writeSync(output,buffer,written,length-written);
      hash.update(buffer.subarray(0,length));count+=length;await afterPhase?.('copy_chunk',relative);
      if(!source)break;
    }
    if(count!==expected.size||hash.digest('hex')!==expected.sha256)fail('restore_source_integrity_failed');
    if(source){noLinks(source);const after=fs.lstatSync(source);if(before.ino!==after.ino||before.dev!==after.dev||before.size!==after.size||before.mtimeMs!==after.mtimeMs||digest(source)!==expected.sha256)fail('restore_source_changed');}
    fs.fsyncSync(output);
  } finally { if(input!==undefined)fs.closeSync(input);if(output!==undefined)fs.closeSync(output); }
  await transform?.(staging);
  noLinks(staging);const handle=fs.openSync(staging,'r+');try{fs.fsyncSync(handle);}finally{fs.closeSync(handle);}
  await afterPhase?.('copy_synced',relative);
  noLinks(target);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});noLinks(target);
  fs.linkSync(staging,target);noLinks(target);
  const published=fs.lstatSync(target),pending=fs.lstatSync(staging);
  if(published.ino!==pending.ino||published.dev!==pending.dev)fail('restore_copy_publication_changed');
  await afterPhase?.('copy_published',relative);
  fs.unlinkSync(staging);return {copied:true};
}

async function publishRestoreReceipt({root,context,receipt,afterPhase}) {
  const bytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n');
  await afterPhase?.('receipt_before');
  await copyRestoreFile({root,context,relative:'restore-receipt.json',bytes,expected:{size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},afterPhase:async phase=>afterPhase?.('receipt_'+phase)});
  await afterPhase?.('receipt_published');
  const marker=paths().within(root,'.study-restore-incomplete');
  if(exists(marker)){if(!fs.lstatSync(marker).isFile())fail('restore_marker_unknown');fs.unlinkSync(marker);}
  await afterPhase?.('restore_finished');return receipt;
}

module.exports={acquireRestoreOperation,copyRestoreFile,publishRestoreReceipt,verifyFile,exists};

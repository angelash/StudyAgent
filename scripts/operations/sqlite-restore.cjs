const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const {createHash}=require('node:crypto');
const {createRestoreContext,readRestoreContext,assertRestoreContextMatches}=require('./restore-context.cjs');
const {acquireRestoreOperation,copyRestoreFile,publishRestoreReceipt,verifyFile,exists}=require('./restore-files.cjs');
const {readLedger,applyDeletionLedger,purgeRestoredMedia}=require('./privacy-ledger.cjs');
const {fenceRestoredState}=require('./restore-state.cjs');
const {captureMaterialKeys,omitRestoredMaterialControl,cleanupRestoredMaterials}=require('./restored-materials.cjs');
const fail=code=>{throw new Error(code);};
function dataDigest(db){
  const hash=createHash('sha256');
  for(const table of ['schema_migrations','store_meta','domain_records','durable_tasks','durable_task_history']){
    hash.update(table+'|');const rows=[];
    for(const row of db.prepare('SELECT * FROM '+table).iterate())rows.push(createHash('sha256').update(JSON.stringify(row)).digest('hex'));
    for(const row of rows.sort())hash.update(row+'|');
  }
  return hash.digest('hex');
}
function state(db,context){
  const row=db.prepare('SELECT * FROM study_restore_runtime WHERE id=1').get(),guard=db.prepare('SELECT * FROM study_restore_guard WHERE id=1').get();
  if(row?.context_id!==context.restoreId||row.context_hash!==context.bindingHash||guard?.backup_id!==context.backupId)fail('restore_database_identity_mismatch');
  if(row.receipt){if(guard.state!=='ready')fail('restore_completion_guard_mismatch');return{receipt:JSON.parse(row.receipt),files:JSON.parse(row.final_files)};}
  if(guard.state!=='restoring'||row.data_digest!==dataDigest(db))fail('restore_imported_database_changed');
  return null;
}
async function restoreSqlite({bundle,destination,deletionLedger,resume=false,afterPhase}){
  const backup=require('./backup.cjs'),{within,noLinks,freshDestination}=backup.files;
  const ledger=readLedger(deletionLedger),verified=await backup.verifyBundle({bundle});
  const root=resume?noLinks(destination):freshDestination(destination,[bundle]),marker=within(root,'.study-restore-incomplete');
  let context;
  const input={root,driver:'sqlite',manifest:verified.manifest,ledger};
  if(resume){context=await readRestoreContext(root);assertRestoreContextMatches(context,input);}
  else{fs.writeFileSync(marker,'Restore has not completed. Do not start the application.\n',{flag:'wx',mode:0o600});context=await createRestoreContext(input);}
  const release=await acquireRestoreOperation(root,context);
  let db;
  try{
    await afterPhase?.('operation_acquired');
    const databaseFile=within(root,'study-agent.sqlite3');let completion;
    if(exists(databaseFile)){
      for(const suffix of ['-journal','-wal','-shm'])noLinks(databaseFile+suffix);
      if(!fs.lstatSync(databaseFile).isFile())fail('restore_database_unknown');
      db=new DatabaseSync(databaseFile);completion=state(db,context);
    }
    if(completion){
      db.close();db=undefined;
      // Once startup is allowed, legal subsequent learning must not rerun restoration.
      if(!exists(marker)){
        const receiptFile=within(root,'restore-receipt.json');
        const bytes=Buffer.from(JSON.stringify(completion.receipt,null,2)+'\n');
        verifyFile(receiptFile,{size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
        return completion.receipt;
      }
      for(const file of completion.files){const target=within(root,file.path);if(file.present)verifyFile(target,file);else if(exists(target))fail('restore_deleted_file_reappeared');}
      return await publishRestoreReceipt({root,context,receipt:completion.receipt,afterPhase});
    }
    if(!exists(marker)||!fs.lstatSync(marker).isFile())fail('restore_incomplete_marker_required');
    if(!db){
      const archive=verified.manifest.files.find(file=>file.path==='database/study-agent.sqlite3');
      await copyRestoreFile({root,context,relative:'study-agent.sqlite3',source:within(bundle,archive.path),expected:archive,afterPhase,transform:async file=>{
        const staged=new DatabaseSync(file);
        try{
          if(staged.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')fail('restore_database_integrity_failed');
          staged.exec('PRAGMA journal_mode=DELETE; BEGIN IMMEDIATE');
          staged.exec('CREATE TABLE IF NOT EXISTS study_restore_guard(id INTEGER PRIMARY KEY CHECK(id=1),state TEXT NOT NULL,backup_id TEXT,updated_at TEXT NOT NULL); DROP TABLE IF EXISTS study_restore_runtime; CREATE TABLE study_restore_runtime(id INTEGER PRIMARY KEY CHECK(id=1),context_id TEXT NOT NULL,context_hash TEXT NOT NULL,data_digest TEXT NOT NULL,receipt TEXT,final_files TEXT)');
          staged.prepare("INSERT INTO study_restore_guard VALUES(1,'restoring',?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,backup_id=excluded.backup_id,updated_at=excluded.updated_at").run(context.backupId,new Date().toISOString());
          staged.prepare('INSERT INTO study_restore_runtime VALUES(1,?,?,?,NULL,NULL)').run(context.restoreId,context.bindingHash,dataDigest(staged));
          staged.exec('COMMIT');
        }finally{staged.close();}
      }});
      db=new DatabaseSync(databaseFile);state(db,context);
    }
    await afterPhase?.('database_imported');
    let copiedFiles=0,skippedFiles=0,omittedControlFiles=0;
    for(const file of verified.manifest.files){
      if(file.path.startsWith('database/'))continue;
      const relative=file.path.startsWith('data/')?file.path.slice(5):file.path;
      if(file.path.startsWith('data/')&&omitRestoredMaterialControl(relative)){omittedControlFiles++;continue;}
      const result=await copyRestoreFile({root,context,relative,source:within(bundle,file.path),expected:file,afterPhase});
      if(result.copied)copiedFiles++;else skippedFiles++;
    }
    await afterPhase?.('files_copied');
    db.exec('BEGIN IMMEDIATE');let receipt;
    try{
      state(db,context);
      const query=(sql,params=[])=>db.prepare(sql).all(...params);
      const before=await captureMaterialKeys(query);
      const{removedMediaIds,topicVisualRetentions,...privacy}=await applyDeletionLedger(query,ledger);
      await afterPhase?.('ledger_applied');
      const access=await fenceRestoredState(query,context.backupId,verified.database.revision);
      const deleted=new Set();
      const materials=await cleanupRestoredMaterials({root,query,manifest:verified.manifest,before,restoreContext:context,afterPhase:async(phase,relative)=>{if(phase==='material_file_deleted')deleted.add(relative);await afterPhase?.(phase,relative);}});
      privacy.mediaDirectoriesPurged=purgeRestoredMedia(root,removedMediaIds,verified.manifest,relative=>deleted.add(relative),topicVisualRetentions);
      receipt={format:verified.manifest.format,backupId:context.backupId,restoreId:context.restoreId,sourceRevision:verified.database.revision,assetsIncluded:verified.manifest.assetsIncluded,verifiedFiles:verified.verifiedFiles,...access,...privacy,...materials,copiedFiles,skippedFiles,omittedControlFiles,databaseImported:true};
      const finalFiles=[];
      for(const file of verified.manifest.files){
        if(file.path.startsWith('database/'))continue;
        const relative=file.path.startsWith('data/')?file.path.slice(5):file.path;
        if(omitRestoredMaterialControl(relative))continue;
        const present=exists(within(root,relative));if(present===deleted.has(relative))fail('restore_final_file_state_changed');
        if(present)verifyFile(within(root,relative),file);
        finalFiles.push({path:relative,sha256:file.sha256,size:file.size,present});
      }
      db.prepare('UPDATE study_restore_runtime SET receipt=?,final_files=? WHERE id=1 AND context_id=? AND context_hash=?').run(JSON.stringify(receipt),JSON.stringify(finalFiles),context.restoreId,context.bindingHash);
      if(Number(db.prepare("UPDATE study_restore_guard SET state='ready',updated_at=? WHERE id=1 AND backup_id=? AND state='restoring'").run(access.restoredAt,context.backupId).changes)!==1)fail('restore_guard_changed');
      await afterPhase?.('before_commit');db.exec('COMMIT');
    }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
    db.close();db=undefined;await afterPhase?.('sql_committed');
    return await publishRestoreReceipt({root,context,receipt,afterPhase});
  }finally{db?.close();release();}
}
module.exports={restoreSqlite,dataDigest};

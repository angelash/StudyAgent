const fs=require('node:fs');
const {createHash}=require('node:crypto');
const {Pool}=require('pg');
const {createRestoreContext,readRestoreContext,assertRestoreContextMatches}=require('./restore-context.cjs');
const {acquireRestoreOperation,copyRestoreFile,publishRestoreReceipt,verifyFile,exists}=require('./restore-files.cjs');
const {connectionEnvironment,lockRestoreController,initializeImport,reserveImportEpoch,importedState,contentDigestSql,runFencedImport}=require('./postgres-restore-import.cjs');
const {readLedger,applyDeletionLedger,purgeRestoredMedia}=require('./privacy-ledger.cjs');
const {fenceRestoredState}=require('./restore-state.cjs');
const {captureMaterialKeys,omitRestoredMaterialControl,cleanupRestoredMaterials}=require('./restored-materials.cjs');
const fail=code=>{throw new Error(code);};
async function restorePostgres({bundle,destination,connectionString,pgBin,deletionLedger,resume=false,afterPhase}){
  const backup=require('./postgres-backup.cjs'),{within,noLinks,freshDestination,referencesFromRecords}=require('./backup.cjs').files;
  connectionEnvironment(connectionString);
  const ledger=readLedger(deletionLedger),verified=await backup.verifyPostgresBundle({bundle,pgBin});
  const pool=new Pool({connectionString,max:1});let client,releaseController,releaseOperation,root,context;
  try{
    client=await pool.connect();releaseController=await lockRestoreController(client);
    const existing=Number((await client.query("SELECT COUNT(*) AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','v','m','S','f')")).rows[0].count);
    if(!resume&&existing)fail('restore_requires_empty_database');
    root=resume?noLinks(destination):freshDestination(destination,[bundle]);
    const marker=within(root,'.study-restore-incomplete'),input={root,driver:'postgres',manifest:verified.manifest,ledger,connectionString};
    if(resume){context=await readRestoreContext(root);assertRestoreContextMatches(context,input);}
    else{fs.writeFileSync(marker,'PostgreSQL restore has not completed. Do not start the application.\n',{flag:'wx',mode:0o600});context=await createRestoreContext(input);}
    releaseOperation=await acquireRestoreOperation(root,context);await afterPhase?.('operation_acquired');
    if(!existing){
      if(!exists(marker))fail('restore_incomplete_marker_required');
      await initializeImport(client,context,{createGuard:true});await afterPhase?.('postgres_initialized');
    }
    let imported=await importedState(client,context);
    const guard=(await client.query('SELECT state,backup_id FROM study_restore_guard WHERE id=1')).rows[0];
    if(guard?.backup_id!==context.backupId)fail('restore_database_identity_mismatch');
    if(imported.final_receipt){
      if(guard.state!=='ready'||imported.phase!=='imported'||!Array.isArray(imported.final_files))fail('restore_completion_guard_mismatch');
      if(!exists(marker)){
        const bytes=Buffer.from(JSON.stringify(imported.final_receipt,null,2)+'\n');
        verifyFile(within(root,'restore-receipt.json'),{size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});return imported.final_receipt;
      }
      for(const file of imported.final_files){const target=within(root,file.path);if(file.present)verifyFile(target,file);else if(exists(target))fail('restore_deleted_file_reappeared');}
      return await publishRestoreReceipt({root,context,receipt:imported.final_receipt,afterPhase});
    }
    if(guard.state!=='restoring'||!exists(marker)||!fs.lstatSync(marker).isFile())fail('restore_incomplete_marker_required');
    let epoch;
    if(imported.phase==='prepared')epoch=await reserveImportEpoch(client,context);
    else if(imported.phase!=='imported')fail('restore_import_state_unknown');
    else if((await client.query('SELECT '+contentDigestSql()+' AS digest')).rows[0].digest!==imported.data_digest)fail('restore_imported_database_changed');
    let copiedFiles=0,skippedFiles=0,omittedControlFiles=0;
    for(const file of verified.manifest.files){
      if(file.path.startsWith('database/'))continue;
      const relative=file.path.startsWith('data/')?file.path.slice(5):file.path;
      if(file.path.startsWith('data/')&&omitRestoredMaterialControl(relative)){omittedControlFiles++;continue;}
      const result=await copyRestoreFile({root,context,relative,source:within(bundle,file.path),expected:file,afterPhase});
      if(result.copied)copiedFiles++;else skippedFiles++;
    }
    await afterPhase?.('files_copied');
    if(epoch)imported=await runFencedImport({client,context,epoch,archive:within(bundle,'database/postgres.dump'),pgBin,connectionString,afterPhase});
    await afterPhase?.('database_imported');
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');let receipt;
    try{
      if((await client.query('SELECT '+contentDigestSql()+' AS digest')).rows[0].digest!==imported.data_digest)fail('restore_imported_database_changed');
      if(JSON.stringify(await backup.summary(client))!==JSON.stringify(verified.manifest.database))fail('restored_database_summary_mismatch');
      const refs=referencesFromRecords((await client.query("SELECT collection,body FROM domain_records WHERE collection IN ('importFiles','importPages','processingArtifacts','studentMedia','classroomVisuals','studioTopicWhiteboardVisuals','studioTopicWhiteboards','studioSourceMaterials','studioMaterialUploads','projectAssetUploads','projectAssets','sourceCourses','sourceCourseChecks','classroomSessions')")).rows);
      for(const[relative,expected]of refs){const item=verified.manifest.references.find(row=>row.path==='data/'+relative);if(!item||expected.sha256!==item.sha256||expected.size!==null&&expected.size!==item.size)fail('restored_file_reference_mismatch');}
      if(refs.size!==verified.manifest.referencedFileCount)fail('restored_file_reference_mismatch');
      const query=async(sql,params=[])=>{let index=0;return(await client.query(sql.replace(/\?/g,()=>'$'+(++index)),params)).rows;};
      const before=await captureMaterialKeys(query),{removedMediaIds,topicVisualRetentions,...privacy}=await applyDeletionLedger(query,ledger);
      await afterPhase?.('ledger_applied');
      const access=await fenceRestoredState(query,context.backupId,verified.manifest.database.revision),deleted=new Set();
      const materials=await cleanupRestoredMaterials({root,query,manifest:verified.manifest,before,restoreContext:context,afterPhase:async(phase,relative)=>{if(phase==='material_file_deleted')deleted.add(relative);await afterPhase?.(phase,relative);}});
      privacy.mediaDirectoriesPurged=purgeRestoredMedia(root,removedMediaIds,verified.manifest,relative=>deleted.add(relative),topicVisualRetentions);
      receipt={format:verified.manifest.format,backupId:context.backupId,restoreId:context.restoreId,sourceRevision:verified.manifest.database.revision,assetsIncluded:verified.manifest.assetsIncluded,verifiedFiles:verified.verifiedFiles,...access,...privacy,...materials,copiedFiles,skippedFiles,omittedControlFiles,databaseImported:true};
      const finalFiles=[];
      for(const file of verified.manifest.files){
        if(file.path.startsWith('database/'))continue;
        const relative=file.path.startsWith('data/')?file.path.slice(5):file.path;if(omitRestoredMaterialControl(relative))continue;
        const present=exists(within(root,relative));if(present===deleted.has(relative))fail('restore_final_file_state_changed');if(present)verifyFile(within(root,relative),file);
        finalFiles.push({path:relative,sha256:file.sha256,size:file.size,present});
      }
      // JSONB canonicalizes object keys. Persist and return that same canonical representation.
      const saved=(await client.query('UPDATE study_restore_runtime.imports SET final_receipt=$1::jsonb,final_files=$2::jsonb WHERE context_id=$3 AND phase=\'imported\' AND final_receipt IS NULL RETURNING final_receipt',[JSON.stringify(receipt),JSON.stringify(finalFiles),context.restoreId])).rows[0];
      if(!saved)fail('restore_completion_changed');receipt=saved.final_receipt;
      if((await client.query("UPDATE study_restore_guard SET state='ready',updated_at=$1 WHERE id=1 AND backup_id=$2 AND state='restoring'",[access.restoredAt,context.backupId])).rowCount!==1)fail('restore_guard_changed');
      await afterPhase?.('before_commit');await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
    await afterPhase?.('sql_committed');return await publishRestoreReceipt({root,context,receipt,afterPhase});
  }finally{
    try{releaseOperation?.();}finally{try{await releaseController?.();}finally{client?.release();await pool.end();}}
  }
}
module.exports={restorePostgres};

// Native SQL import has its own database fence. A dead Node parent does not authorize a second writer.
const { createHash, randomUUID } = require('node:crypto');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { finished } = require('node:stream/promises');
const key = name => createHash('sha256').update('StudyAgent restore v1: '+name).digest().readBigInt64BE().toString();
const locks={control:key('control'),import:key('import'),tail:key('archive-tail')};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, hash=/^[a-f0-9]{64}$/;
const fail=code=>{throw new Error(code);},literal=value=>"'"+String(value).replaceAll("'","''")+"'";

function connectionEnvironment(connectionString) {
  const url=new URL(connectionString);if(!['postgres:','postgresql:'].includes(url.protocol))fail('postgres_connection_required');
  return{PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1)),...(url.searchParams.get('sslmode')?{PGSSLMODE:url.searchParams.get('sslmode')}:{}),...(url.searchParams.get('options')?{PGOPTIONS:url.searchParams.get('options')}:{})};
}
function validateContext(context) {
  if(context.driver!=='postgres'||!uuid.test(context.restoreId)||!uuid.test(context.backupId)||!hash.test(context.bindingHash)||!hash.test(context.manifestHash)||!hash.test(context.targetHash))fail('invalid_postgres_restore_context');
}
async function lockRestoreController(client) {
  if(!(await client.query('SELECT pg_try_advisory_lock($1::bigint) AS acquired',[locks.control])).rows[0].acquired)fail('postgres_restore_controller_active');
  return async()=>{if(!(await client.query('SELECT pg_advisory_unlock($1::bigint) AS released',[locks.control])).rows[0].released)fail('postgres_restore_controller_changed');};
}
async function initializeImport(client,context) {
  validateContext(context);
  await client.query('BEGIN');
  try{
    await client.query('CREATE SCHEMA study_restore_runtime');
    await client.query(`CREATE TABLE study_restore_runtime.identity(id INTEGER PRIMARY KEY CHECK(id=1),context_id TEXT NOT NULL,context_hash TEXT NOT NULL,epoch TEXT NOT NULL);
      CREATE TABLE study_restore_runtime.imports(context_id TEXT PRIMARY KEY,phase TEXT NOT NULL CHECK(phase IN ('prepared','importing','imported')),epoch TEXT,data_digest TEXT);`);
    await client.query('INSERT INTO study_restore_runtime.identity VALUES(1,$1,$2,$3)',[context.restoreId,context.bindingHash,randomUUID()]);
    await client.query("INSERT INTO study_restore_runtime.imports(context_id,phase) VALUES($1,'prepared')",[context.restoreId]);
    await client.query(`CREATE FUNCTION study_restore_runtime.require_complete_import() RETURNS trigger LANGUAGE plpgsql AS $restore$
      BEGIN IF (SELECT phase FROM study_restore_runtime.imports WHERE context_id=NEW.context_id) IS DISTINCT FROM 'imported'
        THEN RAISE EXCEPTION 'postgres_restore_incomplete_import'; END IF; RETURN NEW; END $restore$;
      CREATE CONSTRAINT TRIGGER restore_import_must_complete AFTER UPDATE ON study_restore_runtime.imports
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION study_restore_runtime.require_complete_import();`);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
async function reserveImportEpoch(client,context) {
  validateContext(context);await client.query('BEGIN');
  try{
    if(!(await client.query('SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired',[locks.import])).rows[0].acquired)fail('postgres_restore_native_import_active');
    const current=(await client.query('SELECT context_id,context_hash FROM study_restore_runtime.identity WHERE id=1 FOR UPDATE')).rows[0];
    if(current?.context_id!==context.restoreId||current.context_hash!==context.bindingHash)fail('postgres_restore_context_changed');
    if((await client.query('SELECT phase FROM study_restore_runtime.imports WHERE context_id=$1',[context.restoreId])).rows[0]?.phase!=='prepared')fail('postgres_restore_import_already_complete');
    const epoch=randomUUID();await client.query('UPDATE study_restore_runtime.identity SET epoch=$1 WHERE id=1',[epoch]);await client.query('COMMIT');return epoch;
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
/** Per-row hashes keep the aggregate bounded to 64 bytes per row, without sending private data to Node. */
function contentDigestSql() {
  const tables=['schema_migrations','store_meta','domain_records','durable_tasks','durable_task_history'];
  const parts=tables.map(table=>`(SELECT encode(sha256(convert_to(COALESCE(string_agg(h,'|' ORDER BY h),''),'UTF8')),'hex') FROM (SELECT encode(sha256(convert_to(row_to_json(r)::text,'UTF8')),'hex') AS h FROM ${table} r) hashes)`);
  return`encode(sha256(convert_to('study-restore-data-v1|' || ${parts.join(" || '|' || ")},'UTF8')),'hex')`;
}
async function importedState(client,context) {
  validateContext(context);
  const value=(await client.query('SELECT i.phase,i.epoch,i.data_digest,c.context_hash FROM study_restore_runtime.imports i JOIN study_restore_runtime.identity c ON c.context_id=i.context_id WHERE i.context_id=$1',[context.restoreId])).rows[0];
  if(!value||value.context_hash!==context.bindingHash)fail('postgres_restore_context_changed');return value;
}
async function runFencedImport({client,context,epoch,archive,pgBin,connectionString,afterPhase}) {
  validateContext(context);if(!uuid.test(epoch))fail('invalid_postgres_restore_epoch');
  const environment=connectionEnvironment(connectionString),searchPath=(await client.query('SHOW search_path')).rows[0].search_path;
  const executable=name=>pgBin?path.join(pgBin,name+(process.platform==='win32'?'.exe':'')):name;
  const options={windowsHide:true,env:{...process.env,...environment,PGAPPNAME:'study-restore-'+context.restoreId}};
  const consumer=spawn(executable('psql'),['--no-psqlrc','--no-password','--set=ON_ERROR_STOP=1','--set=VERBOSITY=sqlstate','--single-transaction','--file=-','--dbname='+environment.PGDATABASE],{...options,stdio:['pipe','ignore','pipe']});
  let producer,producerDone;
  const completion=(child,tool)=>new Promise((resolve,reject)=>{let sqlState=null,tail='';child.once('error',()=>reject(new Error('postgres_restore_native_start_failed ('+tool+')')));child.once('close',(code,signal)=>{
    if(code===0)return resolve();const error=new Error((signal?'postgres_restore_native_interrupted':'postgres_restore_native_failed')+' ('+tool+(sqlState?', SQLSTATE='+sqlState:'')+')');error.tool=tool;error.sqlState=sqlState;error.exitCode=code;reject(error);
  });child.stderr?.on('data',bytes=>{if(tool!=='psql')return;tail=(tail+String(bytes)).slice(-256);const found=/\b(?:ERROR|FATAL):\s+([0-9A-Z]{5})\b/.exec(tail);if(found)sqlState=found[1];});});
  const consumerDone=completion(consumer,'psql');consumerDone.catch(()=>{});consumer.stdin.on('error',()=>{});
  const write=text=>new Promise((resolve,reject)=>consumer.stdin.write(text,'utf8',error=>error?reject(new Error('postgres_restore_native_input_failed')):resolve()));
  try{
    await write(`SELECT pg_advisory_xact_lock(${locks.import}::bigint);
      DO $restore$ BEGIN IF NOT EXISTS(SELECT 1 FROM study_restore_runtime.identity c JOIN study_restore_runtime.imports i ON i.context_id=c.context_id
        WHERE c.id=1 AND c.context_id=${literal(context.restoreId)} AND c.context_hash=${literal(context.bindingHash)} AND c.epoch=${literal(epoch)} AND i.phase='prepared')
        OR NOT EXISTS(SELECT 1 FROM study_restore_guard WHERE id=1 AND state='restoring' AND backup_id=${literal(context.backupId)})
        THEN RAISE EXCEPTION 'postgres_restore_epoch_changed'; END IF; END $restore$;
      UPDATE study_restore_runtime.imports SET phase='importing',epoch=${literal(epoch)} WHERE context_id=${literal(context.restoreId)};\n`);
    await afterPhase?.('prefix_sent');
    producer=spawn(executable('pg_restore'),['--no-owner','--no-acl','--no-tablespaces','--file=-',archive],{...options,stdio:['ignore','pipe','pipe']});
    producerDone=completion(producer,'pg_restore');producerDone.catch(()=>{});
    producer.stdout.pipe(consumer.stdin,{end:false});
    const generated=Promise.all([producerDone,finished(producer.stdout)]);
    await Promise.race([generated,consumerDone.then(()=>{throw new Error('postgres_restore_native_ended_early');})]);
    await write(`\nSELECT pg_advisory_xact_lock(${locks.tail}::bigint);\n`);
    await afterPhase?.('archive_sent');
    await write(`SELECT pg_catalog.set_config('search_path',${literal(searchPath)},true);
      UPDATE study_restore_runtime.imports SET phase='imported',data_digest=${contentDigestSql()}
        WHERE context_id=${literal(context.restoreId)} AND epoch=${literal(epoch)};\n`);
    consumer.stdin.end();await consumerDone;
    const state=await importedState(client,context);
    if(state.phase!=='imported'||state.epoch!==epoch||!hash.test(state.data_digest??''))fail('postgres_restore_import_not_committed');
    await afterPhase?.('import_committed');return state;
  }catch(error){
    producer?.kill();consumer.stdin.destroy();consumer.kill();
    // The deferred database constraint also protects an EOF that happens between complete SQL statements.
    let receiverFailure;await consumerDone.catch(failure=>{receiverFailure=failure;});
    await producerDone?.catch(()=>{});
    if(!error.tool&&String(error.message).startsWith('postgres_restore_native')&&receiverFailure?.sqlState)throw receiverFailure;
    throw error;
  }
}
module.exports={locks,connectionEnvironment,lockRestoreController,initializeImport,reserveImportEpoch,contentDigestSql,importedState,runFencedImport};

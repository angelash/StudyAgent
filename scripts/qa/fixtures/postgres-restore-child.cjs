const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{Pool}=require('pg');
const root=path.resolve(process.argv[2]),phase=process.argv[3],selection=process.argv[4],relative=path.relative(os.tmpdir(),root);
if(path.isAbsolute(relative)||!/^study-pg-resume-[^/\\]+$/.test(relative))throw new Error('Dedicated PG restore QA root required');
const url=process.env.STUDY_TEST_RESTORE_RESUME_TARGET_URL,parsed=new URL(url);
if(!/^\/study_qa_resume_[a-f0-9]{32}$/.test(parsed.pathname)||decodeURIComponent(parsed.username)!=='study_agent_app')throw new Error('Dedicated PG restore QA target required');
const phases=new Set(['operation_acquired','postgres_initialized','copy_chunk','copy_published','files_copied','prefix_sent','archive_sent','import_committed','ledger_applied','material_file_deleted','before_commit','sql_committed','receipt_copy_published','restore_finished']);
if(!phases.has(phase)||!['ordinary','large','any'].includes(selection))throw new Error('Unknown PG restore phase');
const {restorePostgresBundle}=require('../../operations/postgres-backup.cjs'),{locks}=require('../../operations/postgres-restore-import.cjs');
restorePostgresBundle({connectionString:url,pgBin:process.env.STUDY_TEST_PG_BIN,bundle:path.join(root,'bundle'),destination:path.join(root,'target'),deletionLedger:path.join(root,'deletions.json'),resume:fs.existsSync(path.join(root,'target')),afterPhase:async(current,file)=>{
 if(current!==phase||selection==='ordinary'&&!file||selection==='large'&&!file?.startsWith('processing/blobs/'))return;
 if(['prefix_sent','archive_sent'].includes(phase)){
  const pool=new Pool({connectionString:url,max:1}),key=phase==='prefix_sent'?locks.import:locks.tail;
  try{let observed=false;const deadline=Date.now()+15000;while(Date.now()<deadline){const acquired=(await pool.query('SELECT pg_try_advisory_lock($1::bigint) AS acquired',[key])).rows[0].acquired;if(!acquired){observed=true;break;}await pool.query('SELECT pg_advisory_unlock($1::bigint)',[key]);await new Promise(resolve=>setTimeout(resolve,15));}if(!observed)throw new Error('Native backend did not reach phase');}finally{await pool.end();}
 }
 process.stdout.write(JSON.stringify({phase,pid:process.pid})+'\n');await new Promise(()=>{setInterval(()=>{},1000);});
}}).then(()=>{throw new Error('PG restore fixture missed its phase');}).catch(()=>{process.stderr.write('PostgreSQL restore fixture failed\n');process.exitCode=1;});

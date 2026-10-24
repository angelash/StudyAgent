const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(process.argv[2]),phase=process.argv[3],selection=process.argv[4],relative=path.relative(os.tmpdir(),root);
if(path.isAbsolute(relative)||!/^study-resume-[^/\\]+$/.test(relative))throw new Error('Dedicated restore QA root required');
const phases=new Set(['operation_acquired','copy_created','copy_chunk','copy_synced','copy_published','database_imported','files_copied','ledger_applied','material_file_deleted','before_commit','sql_committed','receipt_before','receipt_copy_created','receipt_copy_synced','receipt_copy_published','receipt_published','restore_finished']);
if(!phases.has(phase)||!['database','ordinary','any'].includes(selection))throw new Error('Unknown restore fixture phase');
const {restoreBundle}=require('../../operations/backup.cjs');
restoreBundle({bundle:path.join(root,'bundle'),destination:path.join(root,'target'),deletionLedger:path.join(root,'deletions.json'),resume:fs.existsSync(path.join(root,'target')),afterPhase:async(current,file)=>{
 if(current!==phase||selection==='database'&&file!=='study-agent.sqlite3'||selection==='ordinary'&&(!file||file==='study-agent.sqlite3'))return;
 process.stdout.write(JSON.stringify({phase,pid:process.pid})+'\n');await new Promise(()=>{setInterval(()=>{},1000);});
}}).then(()=>{throw new Error('Restore fixture did not reach its phase');}).catch(()=>{process.stderr.write('SQLite restore fixture failed\n');process.exitCode=1;});

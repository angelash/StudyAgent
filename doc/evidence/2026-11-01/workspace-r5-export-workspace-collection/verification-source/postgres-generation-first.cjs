const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'postgres-runtime.private.json'),'utf8'));
if(config.port!==15448||new URL(config.connectionString).pathname!=='/study_paper_export_cleanup')throw Error('Exact generated cleanup cluster required');
const result=spawnSync(process.execPath,[path.join(__dirname,'check.cjs'),'generation-postgres-first','test','src/modules/library/paper-export-generation-cleanup.integration.test.ts'],
 {windowsHide:true,env:{...process.env,STUDY_TEST_PAPER_EXPORT_CLEANUP_POSTGRES_URL:config.connectionString},stdio:'inherit',timeout:660000});process.exitCode=result.status??1;

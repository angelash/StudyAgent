// Use the existing owned loopback QA cluster without copying or logging credentials.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),root=path.resolve(__dirname,'../..');
const configPath=path.resolve(process.argv[2]??path.join(root,'data/qa/postgres/credentials.json')),config=JSON.parse(fs.readFileSync(configPath,'utf8'));
if(config.purpose!=='StudyAgent isolated QA cluster'||config.port!==15439||config.database!=='study_agent_qa'||config.appUser!=='study_agent_app'||config.adminUser!=='study_qa_admin')throw Error('Expected isolated note QA cluster');
const url=new URL('postgresql://127.0.0.1:'+config.port+'/'+config.database);url.username=config.appUser;url.password=config.appPassword;
const admin=new URL(url);admin.pathname='/postgres';admin.username=config.adminUser;admin.password=config.adminPassword;
const report=path.resolve(root,process.env.STUDY_ASSISTANT_NOTES_REPORT??'data/qa/assistant-notes-postgres.json');
if(!report.startsWith(path.join(root,'data/qa')+path.sep)||fs.existsSync(report))throw Error('Choose a new original note report path');
const child=spawn(process.execPath,['--env-file=../../.env','../../node_modules/vitest/vitest.mjs','run',
 'src/modules/ai/assistant-note.integration.test.ts','src/infrastructure/assistant-note-storage.integration.test.ts','src/infrastructure/assistant-note-recovery.integration.test.ts',
 '--maxWorkers=1','--reporter=default','--reporter=json','--outputFile='+report],
 {cwd:path.join(root,'apps/api'),windowsHide:true,stdio:'inherit',env:{...process.env,
 STUDY_TEST_ASSISTANT_NOTE_POSTGRES_URL:url.toString(),STUDY_TEST_ASSISTANT_NOTE_STORAGE_POSTGRES_URL:url.toString(),STUDY_TEST_ASSISTANT_NOTE_RECOVERY_POSTGRES_URL:url.toString(),
 STUDY_TEST_POSTGRES_ADMIN_URL:admin.toString(),STUDY_TEST_PG_BIN:path.resolve(path.dirname(configPath),'../../tools/postgresql-17.11-5/pgsql/bin')}});
child.on('error',()=>{console.error('Private-note PostgreSQL checks could not start');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});

// Dedicated owned QA cluster only. Never print credentials or put them in command arguments.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),root=path.resolve(__dirname,'../..');
const configPath=path.resolve(process.argv[2]??path.join(root,'data/qa/postgres/credentials.json')),config=JSON.parse(fs.readFileSync(configPath,'utf8'));
if(config.purpose!=='StudyAgent isolated QA cluster'||config.port!==15439||config.database!=='study_agent_qa'||config.appUser!=='study_agent_app'||config.adminUser!=='study_qa_admin')throw Error('Expected isolated guidance QA cluster');
const url=new URL('postgresql://127.0.0.1:'+config.port+'/'+config.database);url.username=config.appUser;url.password=config.appPassword;
const admin=new URL(url);admin.pathname='/postgres';admin.username=config.adminUser;admin.password=config.adminPassword;
const child=spawn(process.execPath,['--env-file=../../.env','../../node_modules/vitest/vitest.mjs','run','src/modules/diagnostics/guidance-model.integration.test.ts','src/modules/diagnostics/guidance-model-recovery.integration.test.ts','--reporter=default','--reporter=json','--outputFile='+path.resolve(root,process.env.STUDY_GUIDANCE_MODEL_REPORT??'data/qa/guidance-model-postgres.json')],
 {cwd:path.join(root,'apps/api'),windowsHide:true,stdio:'inherit',env:{...process.env,STUDY_TEST_GUIDANCE_MODEL_POSTGRES_URL:url.toString(),STUDY_TEST_GUIDANCE_RECOVERY_POSTGRES_URL:url.toString(),STUDY_TEST_POSTGRES_ADMIN_URL:admin.toString(),STUDY_TEST_PG_BIN:path.resolve(path.dirname(configPath),'../../tools/postgresql-17.11-5/pgsql/bin')}});
child.on('error',()=>{console.error('Guidance PostgreSQL tests could not start');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});

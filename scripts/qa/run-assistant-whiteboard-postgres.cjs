// Read the original owned QA cluster config; never copy or print credentials.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),root=path.resolve(__dirname,'../..');
const configPath=path.resolve(process.argv[2]??path.join(root,'data/qa/postgres/credentials.json')),config=JSON.parse(fs.readFileSync(configPath,'utf8'));
if(config.purpose!=='StudyAgent isolated QA cluster'||config.port!==15439||config.database!=='study_agent_qa'||config.appUser!=='study_agent_app'||config.adminUser!=='study_qa_admin')throw Error('Expected isolated assistant whiteboard QA cluster');
const url=new URL('postgresql://127.0.0.1:'+config.port+'/'+config.database);url.username=config.appUser;url.password=config.appPassword;
const report=path.resolve(root,process.env.STUDY_ASSISTANT_WHITEBOARD_REPORT??'data/qa/assistant-whiteboard-postgres.json');
if(!report.startsWith(path.join(root,'data/qa')+path.sep)||fs.existsSync(report))throw Error('Choose a new assistant whiteboard report');
const child=spawn(process.execPath,['--env-file=../../.env','../../node_modules/vitest/vitest.mjs','run','src/modules/learning/assistant-whiteboard.integration.test.ts',
 '--maxWorkers=1','--reporter=default','--reporter=json','--outputFile='+report],{cwd:path.join(root,'apps/api'),windowsHide:true,stdio:'inherit',env:{...process.env,STUDY_TEST_ASSISTANT_WHITEBOARD_POSTGRES_URL:url.toString()}});
child.on('error',()=>{console.error('Assistant whiteboard PostgreSQL checks could not start');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});

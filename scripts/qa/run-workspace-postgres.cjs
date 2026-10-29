// Workspace identity/overview compatibility against the owned local QA database.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),root=path.resolve(__dirname,'../..');
const config=JSON.parse(fs.readFileSync(path.resolve(process.argv[2]??path.join(root,'data/qa/postgres/credentials.json')),'utf8'));
if(config.purpose!=='StudyAgent isolated QA cluster'||config.port!==15439||config.database!=='study_agent_qa'||config.appUser!=='study_agent_app')throw Error('Expected isolated workspace QA cluster');
const url=new URL('postgresql://127.0.0.1:'+config.port+'/'+config.database);url.username=config.appUser;url.password=config.appPassword;
const report=path.resolve(root,process.env.STUDY_WORKSPACE_REPORT??'data/qa/workspace-postgres.json');
if(!report.startsWith(path.join(root,'data/qa')+path.sep)||fs.existsSync(report))throw Error('Use a new report inside the isolated workspace data/qa');
const child=spawn(process.execPath,['--env-file=../../.env','../../node_modules/vitest/vitest.mjs','run','src/modules/learning/workspace-overview.integration.test.ts','--reporter=default','--reporter=json','--outputFile='+report],
 {cwd:path.join(root,'apps/api'),windowsHide:true,stdio:'inherit',env:{...process.env,STUDY_TEST_WORKSPACE_POSTGRES_URL:url.toString()}});
child.on('error',()=>{console.error('Workspace PostgreSQL tests could not start');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});

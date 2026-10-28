// Explicit owned local QA cluster only. Credentials remain in memory and are never printed or copied.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),configPath=path.resolve(process.argv[2]??path.join(root,'data/qa/postgres/credentials.json'));
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
if(config.purpose!=='StudyAgent isolated QA cluster'||config.port!==15439||config.database!=='study_agent_qa'||config.appUser!=='study_agent_app')throw Error('Expected owned local source-practice QA cluster');
const report=path.resolve(root,process.env.STUDY_PRACTICE_PREFLIGHT_REPORT??'data/qa/practice-preflight-postgres.json');
if(!report.startsWith(path.join(root,'data/qa')+path.sep)||fs.existsSync(report))throw Error('Choose a new source-practice report inside this worktree');
const url=new URL('postgresql://127.0.0.1:'+config.port+'/'+config.database);url.username=config.appUser;url.password=config.appPassword;
const env={...process.env,STUDY_TEST_ASSISTANT_PRACTICE_POSTGRES_URL:url.toString(),STUDY_TEST_ASSISTANT_WHITEBOARD_POSTGRES_URL:url.toString()};
const child=spawn(process.execPath,['--env-file=../../.env',path.join(root,'node_modules/vitest/vitest.mjs'),'run','src/modules/learning/assistant-practice-preflight.integration.test.ts','src/modules/learning/assistant-whiteboard.integration.test.ts','--maxWorkers=1','--reporter=default','--reporter=json','--outputFile='+report],{cwd:path.join(root,'apps/api'),env,stdio:'inherit',windowsHide:true});
child.once('error',error=>{console.error(error.message);process.exitCode=1;});child.once('exit',(code,signal)=>{process.exitCode=Number.isInteger(code)?code:1;});

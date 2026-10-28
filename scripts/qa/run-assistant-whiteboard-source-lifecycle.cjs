// Uses only the explicitly supplied owned local QA cluster. Never prints/copies credentials.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),configPath=path.resolve(process.argv[2]??path.join(root,'data/qa/postgres/credentials.json'));
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
if(config.purpose!=='StudyAgent isolated QA cluster'||config.port!==15439||config.database!=='study_agent_qa'||config.appUser!=='study_agent_app'||config.adminUser!=='study_qa_admin')throw Error('Expected owned local source-whiteboard QA cluster');
const report=path.resolve(root,process.env.STUDY_SOURCE_WHITEBOARD_REPORT??'data/qa/source-whiteboard-lifecycle-postgres.json');
if(!report.startsWith(path.join(root,'data/qa')+path.sep)||fs.existsSync(report))throw Error('Choose a new source-whiteboard report inside this worktree');
const url=new URL('postgresql://127.0.0.1:'+config.port+'/'+config.database);url.username=config.appUser;url.password=config.appPassword;
const admin=new URL(url);admin.pathname='/postgres';admin.username=config.adminUser;admin.password=config.adminPassword;
const files=['modules/learning/assistant-whiteboard-lifecycle.integration.test.ts','modules/learning/assistant-whiteboard-content.test.ts',
 'modules/learning/assistant-whiteboard.integration.test.ts','modules/learning/topic-whiteboard-content.test.ts','modules/learning/topic-whiteboard-access.test.ts',
 'modules/learning/topic-whiteboard.integration.test.ts','modules/learning/topic-whiteboard-visual.integration.test.ts',
 'modules/learning/topic-whiteboard-visual-context.test.ts','modules/learning/topic-whiteboard-visual-files.test.ts',
 'infrastructure/topic-whiteboard-storage.integration.test.ts','infrastructure/topic-whiteboard-visual-storage.integration.test.ts',
 'infrastructure/topic-whiteboard-postgres.integration.test.ts','infrastructure/topic-whiteboard-visual-postgres.integration.test.ts',
 'infrastructure/topic-whiteboard-visual-recovery.integration.test.ts','infrastructure/assistant-whiteboard-reader.integration.test.ts','infrastructure/assistant-note-recovery.integration.test.ts',
 'infrastructure/assistant-whiteboard-recovery.integration.test.ts'];
const env={...process.env,STUDY_TEST_POSTGRES_ADMIN_URL:admin.toString(),STUDY_TEST_PG_BIN:path.resolve(path.dirname(configPath),'../../tools/postgresql-17.11-5/pgsql/bin')};
for(const file of files)for(const match of fs.readFileSync(path.join(root,'apps/api/src',file),'utf8').matchAll(/process\.env\.(STUDY_TEST_[A-Z_]*POSTGRES_URL)/g))env[match[1]]=url.toString();
const child=spawn(process.execPath,['--env-file=../../.env','../../node_modules/vitest/vitest.mjs','run',...files.map(file=>'src/'+file),
 '--maxWorkers=1','--reporter=default','--reporter=json','--outputFile='+report],{cwd:path.join(root,'apps/api'),env,windowsHide:true,stdio:'inherit'});
child.on('error',()=>{console.error('Owned source-whiteboard checks could not start');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});

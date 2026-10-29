// Real owned SQLite/PostgreSQL HTTP and native recovery. Never copy/print QA credentials or invoke providers.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),attempt=process.argv[2],engine=process.argv[3]??'sqlite';
if(!attempt||!/^[a-z0-9-]+$/.test(attempt)||!['sqlite','postgres'].includes(engine))throw Error('Choose a new attempt and explicit QA engine');
const output=path.join(root,'data/qa/assistant-practice-artifacts',attempt);if(fs.existsSync(output))throw Error('Original attempt already exists');fs.mkdirSync(output,{recursive:true});
const env={...process.env,XIAOJIU_CHAT_ENABLED:'false',OPENAI_API_KEY:'',STUDY_WORKER_ENABLED:'false'};
delete env.STUDY_TEST_PRACTICE_ARTIFACT_POSTGRES_URL;
if(engine==='postgres'){
 const configPath=path.resolve(process.argv[4]??path.join(root,'data/qa/postgres/credentials.json')),config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 if(config.purpose!=='StudyAgent isolated QA cluster'||config.port!==15439||config.database!=='study_agent_qa'||config.appUser!=='study_agent_app'||config.adminUser!=='study_qa_admin')throw Error('Owned local artifact QA cluster required');
 const url=new URL('postgresql://127.0.0.1:'+config.port+'/'+config.database);url.username=config.appUser;url.password=config.appPassword;
 const admin=new URL(url);admin.pathname='/postgres';admin.username=config.adminUser;admin.password=config.adminPassword;
 env.STUDY_TEST_PRACTICE_ARTIFACT_POSTGRES_URL=url.toString();env.STUDY_TEST_POSTGRES_ADMIN_URL=admin.toString();
 env.STUDY_TEST_PG_BIN=path.resolve(path.dirname(configPath),'../../tools/postgresql-17.11-5/pgsql/bin');
 if(!fs.existsSync(path.join(env.STUDY_TEST_PG_BIN,process.platform==='win32'?'pg_dump.exe':'pg_dump')))throw Error('Prepared native QA binaries not found');
}
function walk(relative,extensions){const dir=path.join(root,relative);return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(relative,e.name),extensions):e.isFile()&&extensions.some(ext=>e.name.endsWith(ext))?[path.join(relative,e.name).replaceAll('\\','/')]:[])}
const inputs=[...walk('apps/api/src',['.ts']),...walk('packages/contracts/src',['.ts']),...walk('packages/config/src',['.ts']),
 ...walk('resources/curriculum',['.json']),...walk('resources/qa/legacy-readers',['.json','.gz']),...walk('scripts/operations',['.cjs']),
 'apps/api/vitest.config.ts','apps/api/tsconfig.json','apps/api/tsconfig.build.json','apps/api/package.json','package-lock.json','package.json','tsconfig.base.json',
 'packages/contracts/package.json','packages/contracts/tsconfig.json','packages/config/package.json','packages/config/tsconfig.json','scripts/qa/run-assistant-practice-artifacts.cjs'];
const sha=relative=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex'),manifest={};
for(const relative of inputs){const file=path.join(output,'source',relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(root,relative),file,fs.constants.COPYFILE_EXCL);manifest[relative]={sha256:sha(relative),bytes:fs.statSync(path.join(root,relative)).size}}
const compiled=Object.fromEntries([...walk('apps/api/dist',['']),...walk('packages/contracts/dist',['']),...walk('packages/config/dist',[''])].map(relative=>[relative,{sha256:sha(relative)}]));
for(const relative of Object.keys(compiled)){const file=path.join(output,'build',relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(root,relative),file,fs.constants.COPYFILE_EXCL)}
fs.writeFileSync(path.join(output,'inputs-before.json'),JSON.stringify({at:new Date().toISOString(),manifest,compiled},null,2)+'\n',{flag:'wx'});
const run=spawnSync(process.execPath,[path.join(root,'node_modules/vitest/vitest.mjs'),'run','src/modules/learning/assistant-practice-artifact.integration.test.ts',
 '--maxWorkers=1','--reporter=default','--reporter=json','--outputFile='+path.join(output,'vitest.json')],{cwd:path.join(root,'apps/api'),env,windowsHide:true,encoding:'utf8',maxBuffer:30*1024*1024});
fs.writeFileSync(path.join(output,'stdout.log'),run.stdout??'',{flag:'wx'});fs.writeFileSync(path.join(output,'stderr.log'),run.stderr??'',{flag:'wx'});
const changed=inputs.filter(relative=>sha(relative)!==manifest[relative].sha256),changedCompiled=Object.keys(compiled).filter(relative=>sha(relative)!==compiled[relative].sha256);
const report=fs.existsSync(path.join(output,'vitest.json'))?JSON.parse(fs.readFileSync(path.join(output,'vitest.json'),'utf8')):null;
const receipt={at:new Date().toISOString(),engine,passed:run.status===0&&report?.success===true&&!changed.length&&!changedCompiled.length,exitCode:run.status,error:run.error?.message??null,
 sourceInputs:inputs.length,compiledInputs:Object.keys(compiled).length,changed,changedCompiled,
 tests:report?{total:report.numTotalTests,passed:report.numPassedTests,failed:report.numFailedTests,pending:report.numPendingTests}:null,
 limits:['Owned generated learners/content only. No actual provider or original student evidence.','Reviewed candidate and shared arrangement APIs only; learner start/answering UI and complete schema24 delivery remain separate.']};
fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));if(!receipt.passed)process.exitCode=1;

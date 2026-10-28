// Offline allocation only: no service, learner record, database or provider call.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),attempt=process.argv[2];
if(!attempt||!/^[a-z0-9-]+$/.test(attempt))throw Error('Pass a new unique attempt name');
const folder=path.join(root,'data/qa/assistant-practice-bank-selection',attempt);
if(fs.existsSync(folder))throw Error('Attempt already exists');fs.mkdirSync(folder,{recursive:true});
const inputs=['apps/api/src/modules/learning/assistant-practice-bank-selection.ts','apps/api/src/modules/learning/assistant-practice-bank-selection.test.ts',
 'apps/api/src/modules/learning/topic-whiteboard-digest.ts','apps/api/vitest.config.ts','apps/api/tsconfig.json','apps/api/package.json','package-lock.json',
 'scripts/qa/run-assistant-practice-bank-selection.cjs'];
const sha=relative=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex'),manifest={};
for(const relative of inputs){const target=path.join(folder,'source',relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,relative),target,fs.constants.COPYFILE_EXCL);manifest[relative]={sha256:sha(relative),bytes:fs.statSync(path.join(root,relative)).size}}
const compiled=Object.fromEntries(['apps/api/dist/apps/api/src/modules/learning/assistant-practice-bank-selection.js',
 'apps/api/dist/apps/api/src/modules/learning/topic-whiteboard-digest.js'].map(relative=>[relative,{sha256:sha(relative)}]));
fs.writeFileSync(path.join(folder,'inputs-before.json'),JSON.stringify({at:new Date().toISOString(),manifest,compiled},null,2)+'\n',{flag:'wx'});
const run=spawnSync(process.execPath,[path.join(root,'node_modules/vitest/vitest.mjs'),'run','src/modules/learning/assistant-practice-bank-selection.test.ts',
 '--reporter=default','--reporter=json','--outputFile='+path.join(folder,'vitest.json')],{cwd:path.join(root,'apps/api'),encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024,
 env:{...process.env,XIAOJIU_CHAT_ENABLED:'false',OPENAI_API_KEY:'',STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'false'}});
fs.writeFileSync(path.join(folder,'stdout.log'),run.stdout??'',{flag:'wx'});fs.writeFileSync(path.join(folder,'stderr.log'),run.stderr??'',{flag:'wx'});
const changed=inputs.filter(relative=>sha(relative)!==manifest[relative].sha256),changedCompiled=Object.keys(compiled).filter(relative=>sha(relative)!==compiled[relative].sha256);
const report=fs.existsSync(path.join(folder,'vitest.json'))?JSON.parse(fs.readFileSync(path.join(folder,'vitest.json'),'utf8')):null;
const receipt={at:new Date().toISOString(),passed:run.status===0&&report?.success===true&&!changed.length&&!changedCompiled.length,exitCode:run.status,error:run.error?.message??null,
 inputs:inputs.length,compiled:Object.keys(compiled).length,changed,changedCompiled,tests:report?{total:report.numTotalTests,passed:report.numPassedTests,failed:report.numFailedTests,pending:report.numPendingTests}:null,
 limits:['Offline joint question allocation only; caller must supply actual eligible/canonical/exposure identities and recheck live authority.',
 'No new API, schema24, persistence, learner evidence, actual provider or whole-product acceptance.']};
fs.writeFileSync(path.join(folder,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));if(!receipt.passed)process.exitCode=1;

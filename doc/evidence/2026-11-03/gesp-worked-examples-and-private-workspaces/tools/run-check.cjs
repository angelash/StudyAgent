const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),qa=path.join(root,'data/qa/p187'),[label,mode]=process.argv.slice(2),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert(/^[a-z0-9-]+$/.test(label??''));assert(['api','full','build','webtype','apitype','browser'].includes(mode));const output=path.join(__dirname,label+'.json');assert(!fs.existsSync(output));
const attempt=fs.existsSync(path.join(__dirname,'sync-second.json'))?'second':'first';
const inputs=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'application-inputs-'+attempt+'.json.gz')))).concat(JSON.parse(fs.readFileSync(path.join(__dirname,'sync-'+attempt+'.json'))).sync.filter(row=>!row.path.startsWith('apps/')));
if(mode==='full'){
 const included=new Set(inputs.map(row=>row.path));
 function walk(relative){for(const entry of fs.readdirSync(path.join(qa,relative),{withFileTypes:true})){assert(!entry.isSymbolicLink());const file=relative+'/'+entry.name;if(entry.isDirectory())walk(file);else if(!included.has(file)){inputs.push({path:file,sha256:sha(fs.readFileSync(path.join(qa,file)))});included.add(file);}}}
 for(const relative of ['resources/curriculum','resources/gesp','scripts/content','scripts/qa'])walk(relative);
}
for(const row of inputs)assert.equal(sha(fs.readFileSync(path.join(qa,row.path))),row.sha256);
fs.writeFileSync(path.join(__dirname,label+'-inputs.json.gz'),zlib.gzipSync(JSON.stringify(inputs)),{flag:'wx'});
const env={...process.env,NODE_ENV:'development',OPENAI_API_KEY:'',MINIMAX_API_KEY:'',XIAOJIU_CHAT_ENABLED:'false',E2E_API_PORT:'4296',E2E_WEB_PORT:'3296',E2E_WEB_DIRECTORY:path.join(qa,'data/qa/b4-gesp220-web')};
for(const key of ['DATABASE_URL','STUDY_DATA_DIR','STUDY_STORAGE','STUDY_WEB_DIST_DIR','CI','STUDY_TEST_POSTGRES_URL'])delete env[key];
if(mode==='api'){
 env.STUDY_STORAGE='sqlite';env.STUDY_DATA_DIR=path.join(qa,'data/qa/gesp220-'+label+'-api-data');
 assert(!fs.existsSync(env.STUDY_DATA_DIR),'Every API attempt needs fresh storage');
 env.STUDY_SEED_FOUNDATION='true';env.STUDY_WORKER_ENABLED='false';
}
if(mode==='full'){
 env.NODE_ENV='test';env.STUDY_STORAGE='memory';env.STUDY_DATA_DIR=path.join(qa,'data/qa/gesp220-'+label+'-full-data');
 assert(!fs.existsSync(env.STUDY_DATA_DIR));env.STUDY_SEED_FOUNDATION='true';env.STUDY_WORKER_ENABLED='false';
}
let cwd=qa,args;
if(mode==='build')args=['scripts/qa/experience-web.cjs','build'];
if(mode==='webtype')args=[path.join(root,'node_modules/typescript/bin/tsc'),'-p','apps/web/tsconfig.json','--noEmit','--incremental','false'];
if(mode==='apitype')args=[path.join(root,'node_modules/typescript/bin/tsc'),'-p','apps/api/tsconfig.json','--noEmit','--incremental','false'];
if(mode==='api'){cwd=path.join(qa,'apps/api');args=[path.join(root,'node_modules/vitest/vitest.mjs'),'run','src/modules/gesp','--reporter=json','--outputFile='+path.join(__dirname,label+'-vitest.json')];}
if(mode==='full'){cwd=path.join(qa,'apps/api');args=[path.join(root,'node_modules/vitest/vitest.mjs'),'run','--reporter=json','--outputFile='+path.join(__dirname,label+'-vitest.json')];}
if(mode==='browser')args=['scripts/qa/run-source-course-browser.cjs','--full','--skip-build','--grep','GESP teaching:','--result-file','data/qa/gesp220-'+label+'-playwright.json'];
const log=fs.openSync(path.join(__dirname,label+'.private.log'),'wx'),run=spawnSync(process.execPath,args,{cwd,env,windowsHide:true,stdio:['ignore',log,log],timeout:7200000});fs.closeSync(log);
const changed=inputs.filter(row=>sha(fs.readFileSync(path.join(qa,row.path)))!==row.sha256).map(row=>row.path),report={at:new Date().toISOString(),mode,exit:run.status,error:run.error?.message??null,inputCount:inputs.length,changedDuringRun:changed,formalContacted:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(run.status||changed.length)process.exitCode=1;
if(mode==='browser'){const result=path.join(qa,'data/qa/gesp220-'+label+'-playwright.json');if(fs.existsSync(result))fs.copyFileSync(result,path.join(__dirname,label+'-playwright.json'),fs.constants.COPYFILE_EXCL);}

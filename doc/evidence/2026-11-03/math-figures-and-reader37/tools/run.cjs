const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),qa=path.join(root,'data/qa/p187'),[label,mode]=process.argv.slice(2),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert(/^[a-z0-9-]+$/.test(label||''));assert(['postgres','webbuild'].includes(mode));assert(!fs.existsSync(path.join(__dirname,label+'.json')));
const inputs=[];function walk(rel){for(const e of fs.readdirSync(path.join(qa,rel),{withFileTypes:true})){const f=rel+'/'+e.name;assert(!e.isSymbolicLink());if(e.isDirectory())walk(f);else inputs.push({path:f,sha256:sha(fs.readFileSync(path.join(qa,f)))});}}
for(const rel of ['apps/api/src','apps/web/app','apps/web/components','apps/web/lib','packages/contracts/src','scripts/qa','scripts/operations','resources/compatibility'])walk(rel);
const env={...process.env,OPENAI_API_KEY:'',MINIMAX_API_KEY:'',XIAOJIU_CHAT_ENABLED:'false',E2E_API_PORT:'4296',E2E_WEB_PORT:'3296',E2E_WEB_DIRECTORY:path.join(qa,'data/qa/b4-math37-web')};
for(const key of ['DATABASE_URL','STUDY_DATA_DIR','STUDY_STORAGE','STUDY_WEB_DIST_DIR','CI','STUDY_TEST_POSTGRES_URL'])delete env[key];
fs.writeFileSync(path.join(__dirname,label+'-inputs.json.gz'),zlib.gzipSync(JSON.stringify(inputs)),{flag:'wx'});
(async()=>{
let args,cwd=qa;
if(mode==='webbuild')args=['scripts/qa/experience-web.cjs','build'];
else{
 const {Pool}=require('pg'),config=JSON.parse(fs.readFileSync(path.join(root,'data/qa/b4pg/runtime.private.json'))),u=new URL(config.connectionString);
 assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'15456');assert.equal(u.pathname,'/study_b4_gesp');assert.equal(path.resolve(config.data),path.join(root,'data/qa/b4pg/cluster'));
 const pool=new Pool({connectionString:config.connectionString,max:1});try{assert.equal(path.resolve((await pool.query('SHOW data_directory')).rows[0].data_directory),path.resolve(config.data));}finally{await pool.end();}
 env.STUDY_TEST_MATH_FIGURES_POSTGRES_URL=config.connectionString;cwd=path.join(qa,'apps/api');
 args=[path.join(root,'node_modules/vitest/vitest.mjs'),'run','src/infrastructure/math-figures-reader.integration.test.ts','--reporter=json','--outputFile='+path.join(__dirname,label+'-vitest.json')];
}
const log=fs.openSync(path.join(__dirname,label+'.private.log'),'wx'),r=spawnSync(process.execPath,args,{cwd,env,windowsHide:true,stdio:['ignore',log,log],timeout:7200000});fs.closeSync(log);
const changed=inputs.filter(row=>sha(fs.readFileSync(path.join(qa,row.path)))!==row.sha256).map(row=>row.path),report={at:new Date().toISOString(),mode,exit:r.status,error:r.error?.message??null,inputCount:inputs.length,changedDuringRun:changed,formalContacted:false};
fs.writeFileSync(path.join(__dirname,label+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(r.status||changed.length)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});

const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),candidate=path.join(root,'data/qa/p187'),[label,mode,...files]=process.argv.slice(2),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(!/^[a-z0-9-]+$/.test(label??'')||!['contracts','build','type','webtype','webbuild','tests','all'].includes(mode)||fs.existsSync(path.join(__dirname,label+'.log')))throw Error('New label and mode required');
const inputs=[];function walk(rel){for(const entry of fs.readdirSync(path.join(candidate,rel),{withFileTypes:true})){const file=rel+'/'+entry.name;if(entry.isSymbolicLink())throw Error('No input links');if(entry.isDirectory()){if(entry.name!=='__pycache__')walk(file);}else inputs.push({path:file,sha256:sha(fs.readFileSync(path.join(candidate,file)))});}}
for(const rel of ['apps/api/src','apps/web/app','apps/web/components','apps/web/lib','packages/contracts/src','scripts/processing'])walk(rel);
if(['tests','all'].includes(mode))for(const rel of ['apps/api/dist','packages/contracts/dist','packages/config/dist'])walk(rel);
const executable=process.execPath;let args,cwd=candidate;
if(mode==='contracts'){args=[path.join(candidate,'node_modules/tsup/dist/cli-default.js'),'src/index.ts','--format','cjs','--dts','--clean'];cwd=path.join(candidate,'packages/contracts');}
else if(mode==='build')args=[path.join(candidate,'node_modules/typescript/bin/tsc'),'-p','apps/api/tsconfig.build.json'];
else if(mode==='type'||mode==='webtype')args=[path.join(candidate,'node_modules/typescript/bin/tsc'),'-p',mode==='type'?'apps/api/tsconfig.json':'apps/web/tsconfig.json','--noEmit','--incremental','false'];
else if(mode==='webbuild'){args=[path.join(candidate,'node_modules/next/dist/bin/next'),'build'];cwd=path.join(candidate,'apps/web');}
else{args=[path.join(candidate,'node_modules/vitest/vitest.mjs'),'run',...(mode==='all'?[]:files),'--reporter=json','--outputFile='+path.join(__dirname,label+'-vitest.json')];cwd=path.join(candidate,'apps/api');}
const temp=path.join(root,'data/qa',label.slice(0,20));if(fs.existsSync(temp))throw Error('Unused short TEMP required');fs.mkdirSync(temp);
const env={...process.env,TEMP:temp,TMP:temp,OPENAI_API_KEY:'',MINIMAX_API_KEY:'',XIAOJIU_CHAT_ENABLED:'false',STUDY_WEB_DIST_DIR:'.next-b3',API_PORT:'4287'};
for(const key of ['DATABASE_URL','STUDY_DATA_DIR','STUDY_STORAGE','STUDY_TEST_PAPER_TEX_WORKSPACE','STUDY_TEST_PAPER_EXPORT_INSTALLATION'])delete env[key];
fs.writeFileSync(path.join(__dirname,label+'-inputs.json.gz'),zlib.gzipSync(JSON.stringify(inputs)),{flag:'wx'});
const log=fs.openSync(path.join(__dirname,label+'.log'),'wx'),r=spawnSync(executable,args,{cwd,env,windowsHide:true,stdio:['ignore',log,log],timeout:10800000});fs.closeSync(log);
const changed=inputs.filter(row=>sha(fs.readFileSync(path.join(candidate,row.path)))!==row.sha256).map(row=>row.path);
const report={at:new Date().toISOString(),mode,exit:r.status,error:r.error?.message??null,inputCount:inputs.length,changedDuringRun:changed,compiledOutputsExcludedFromChangeCheck:['contracts','build','webbuild'].includes(mode)};
fs.writeFileSync(path.join(__dirname,label+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(r.status||changed.length)process.exitCode=1;

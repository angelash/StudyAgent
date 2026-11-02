const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),mode=process.argv[2],sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(!['api','web'].includes(mode))throw Error('API or Web required');
const inputs=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'doc/evidence/2026-11-02/block-three-materials-native-structures/sources.json.gz')))).files.map(({path:filename,sha256})=>({path:filename,sha256}));
for(const row of inputs)if(sha(fs.readFileSync(path.join(root,row.path)))!==row.sha256)throw Error('Main source changed since snapshot');
const log=fs.openSync(path.join(__dirname,'main-'+mode+'-types-first.log'),'wx'),result=spawnSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p','apps/'+mode+'/tsconfig.json','--noEmit','--incremental','false'],{cwd:root,windowsHide:true,stdio:['ignore',log,log]});fs.closeSync(log);
const changed=inputs.filter(row=>sha(fs.readFileSync(path.join(root,row.path)))!==row.sha256).map(row=>row.path),report={at:new Date().toISOString(),main:true,mode,exit:result.status,sourceFiles:inputs.length,changedDuringRun:changed,outputsWritten:false};
fs.writeFileSync(path.join(__dirname,'main-'+mode+'-types-first.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(result.status||changed.length)process.exitCode=1;

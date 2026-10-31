const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const qa=__dirname,root=path.resolve(qa,'../../..'),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function check(name,config){return new Promise((resolve,reject)=>{const log=fs.openSync(path.join(qa,name+'-first.log'),'wx');const child=spawn(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',config,'--noEmit'],{cwd:root,windowsHide:true,stdio:['ignore',log,log]});child.once('error',reject);child.once('exit',code=>{fs.closeSync(log);if(code!==0)reject(Error(name+' failed'));else resolve({name,exit:code});});});}
(async()=>{
 const checks=[];for(const[name,config]of[['main-contracts','packages/contracts/tsconfig.json'],['main-api','apps/api/tsconfig.json']])checks.push(await check(name,config));
 const final=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(qa,'source-fifth.json.gz'))));for(const row of final.files)if(sha(fs.readFileSync(path.join(root,row.path)))!==row.sha256)throw Error('Final main source changed');
 const protection=JSON.parse(fs.readFileSync(path.join(root,'data/qa/workspace-adult-models-first-20261031/adult165-main-protection-third.json')));
 for(const row of protection.files)if(sha(fs.readFileSync(path.join(root,row.path)))!==row.sha256)throw Error('Protected runtime changed');
 const db=new DatabaseSync(path.join(root,'data/study-agent.sqlite3'),{readOnly:true}),formal={schema:db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version,revision:db.prepare('SELECT revision FROM store_meta WHERE id=1').get().revision};db.close();
 if(JSON.stringify(formal)!==JSON.stringify(protection.formal))throw Error('Formal metadata changed');
 const result={at:new Date().toISOString(),checks,finalSources:final.files.length,formal,protectedFiles:protection.files.length,allProtectedUnchanged:true,schema32Registered:false,applicationRoutesRegistered:false};
 fs.writeFileSync(path.join(qa,'main-validation-first.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
})().catch(error=>{console.error(error.message);process.exitCode=1;});

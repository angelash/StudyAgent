const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),env={...process.env,E2E_API_PORT:'4127',E2E_WEB_PORT:'3127'};
const prefix='data/qa/note-full-browser-second',log=path.join(root,prefix+'.log');if(fs.existsSync(log)||fs.existsSync(path.join(root,prefix+'.json')))throw Error('Original full browser output exists');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{cwd:root,env,windowsHide:true,...options});if(r.error)throw r.error;return r.status??1}
if(run('python',['-X','utf8','data/qa/freeze-note-full-browser-second.py'],{stdio:'inherit'}))throw Error('Input freeze failed');
const fd=fs.openSync(log,'wx');let code;try{code=run(process.execPath,['scripts/qa/run-source-course-browser.cjs','--full','--skip-build','--result-file',prefix+'.json'],{stdio:['ignore',fd,fd]})}finally{fs.closeSync(fd)}
const checked=spawnSync('python',['-X','utf8','data/qa/freeze-note-full-browser-second.py','--verify'],{cwd:root,env,encoding:'utf8',windowsHide:true});fs.writeFileSync(path.join(root,prefix+'-inputs-verification.log'),(checked.stdout??'')+(checked.stderr??''),{flag:'wx'});
const receipt={at:new Date().toISOString(),testExit:code,verificationExit:checked.status,reportPresent:fs.existsSync(path.join(root,prefix+'.json'))};fs.writeFileSync(path.join(root,prefix+'-process-result.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));process.exitCode=code||checked.status||0;

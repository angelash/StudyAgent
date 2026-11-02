// Deterministic two-namespace overlap: one workspace must survive the other's cleanup.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
async function verifyConcurrentWorkspaces(){
 const distribution=process.env.STUDY_GESP_WSL_DISTRO||'Ubuntu';assert(/^[A-Za-z0-9._-]{1,80}$/.test(distribution));
 const call=(args,input)=>spawnSync('wsl.exe',['-d',distribution,...args],{input,encoding:'utf8',windowsHide:true,timeout:10000});
 const made=call(['mktemp','-d','/tmp/study-gesp-XXXXXX']);assert.equal(made.status,0,made.stderr);const payload=made.stdout.trim();assert(/^\/tmp\/study-gesp-[A-Za-z0-9]+$/.test(payload));
 let child,completion,peer;
 try{
  assert.equal(call(['tee',payload+'/marker.txt'],'private-workspace\n').status,0);
  const script='const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(0,"utf8"));const r=require(p.runner).isolatedBash({distribution:p.distribution},p.payload,p.command,15000);process.stdout.write(JSON.stringify({status:r.status,stdout:r.stdout,stderr:r.stderr,error:r.error?.message??null}));';
  child=spawn(process.execPath,['-e',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const chunks=[],errors=[];child.stdout.on('data',b=>chunks.push(b));child.stderr.on('data',b=>errors.push(b));
  completion=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>{try{assert.equal(code,0,Buffer.concat(errors).toString());resolve(JSON.parse(Buffer.concat(chunks).toString()));}catch(error){reject(error);}});});
  // Capture early rejection while the ready barrier is being polled.
  completion.catch(()=>{});
  child.stdin.end(JSON.stringify({runner:path.join(root,'scripts/gesp/run_submission.cjs'),distribution,payload,command:'printf ready >ready; attempts=0; until test -f peer-finished; do attempts=$((attempts+1)); test "$attempts" -lt 200 || exit 71; sleep 0.05; done; cat /dev/shm/study-agent-gesp-work/marker.txt'}));
  const deadline=Date.now()+8000;let ready=false;
  while(Date.now()<deadline){if(call(['test','-f',payload+'/ready']).status===0){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,40));}assert(ready,'First namespace reached the workspace barrier');
  peer=require('../gesp/run_submission.cjs').isolatedBash({distribution},payload,'printf peer-cleanup-complete',10000);
  assert.equal(peer.status,0,peer.stderr);
  // Signal only after peer's EXIT trap and cleanup have finished.
  assert.equal(call(['touch',payload+'/peer-finished']).status,0);
  const first=await completion;
  return{passed:first.status===0&&first.stdout==='private-workspace\n',first,peer:{status:peer.status,stdout:peer.stdout,stderr:peer.stderr},host:'wsl:'+distribution,overlapConfirmed:true,peerCleanupCompletedBeforeFirstAbsoluteLookup:true,sourceOrLearnerWrites:false};
 }finally{
  call(['touch',payload+'/peer-finished']);
  if(child&&child.exitCode===null){await Promise.race([completion.catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1000))]);if(child.exitCode===null)child.kill();}
  assert(/^\/tmp\/study-gesp-[A-Za-z0-9]+$/.test(payload));call(['rm','-rf','--',payload]);
 }
}
if(require.main===module){const output=path.resolve(root,process.argv[2]??'');assert(output.startsWith(path.join(root,'data/qa')+path.sep)&&output.endsWith('.json')&&!fs.existsSync(output),'New owned QA JSON required');verifyConcurrentWorkspaces().then(result=>{fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({at:new Date().toISOString(),...result},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;}).catch(error=>{fs.writeFileSync(output,JSON.stringify({at:new Date().toISOString(),passed:false,error:error.message},null,2)+'\n',{flag:'wx'});console.error(error.message);process.exitCode=1;});}
module.exports={verifyConcurrentWorkspaces};

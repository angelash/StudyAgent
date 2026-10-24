const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(process.argv[2]),phase=process.argv[3],relative=path.relative(os.tmpdir(),root);
if(path.isAbsolute(relative)||!/^study-original-repair-[^/\\]+$/.test(relative))throw new Error('Dedicated original repair QA root required');
const phases=new Set(['intent_created','intent_written','intent_synced','intent_published','candidate_created','candidate_chunk','candidate_synced','candidate_published','previous_linked','original_removed','original_published','original_verified','previous_removed','candidate_removed','files_finished']);
if(!phases.has(phase))throw new Error('Unknown original repair phase');
const config=JSON.parse(fs.readFileSync(path.join(root,'fixture.json'),'utf8'));
const {recoverStudioOriginal}=require('../../../apps/api/dist/apps/api/src/infrastructure/studio-original-repair.js');
recoverStudioOriginal({root,identity:config.identity,chunks:config.chunks.map((part,index)=>({...part,path:path.join(root,'uploads',index+'.bin')})),guard:async()=>{},afterPhase:async current=>{
 if(current!==phase)return;process.stdout.write(JSON.stringify({phase,pid:process.pid})+'\n');await new Promise(()=>{setInterval(()=>{},1000);});
}}).then(()=>{throw new Error('Original repair fixture missed phase');}).catch(()=>{process.stderr.write('Original repair fixture failed\n');process.exitCode=1;});

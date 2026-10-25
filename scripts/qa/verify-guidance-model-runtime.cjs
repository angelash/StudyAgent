// Actual default-model completion and CLI cancellation with independent synthetic learning evidence only.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const processes=require('node:child_process'),realSpawn=processes.spawn,spawns=[],candidates=[];
const root=path.resolve(__dirname,'../..'),report=path.resolve(root,process.argv[2]??'data/qa/guidance-model-live-default.json');
if(!report.startsWith(path.join(root,'data/qa')+path.sep))throw Error('Live report must remain in QA');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'study-guidance-live-'));let app,onSpawn;
Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:'sqlite',STUDY_DATA_DIR:directory,STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'true',XIAOJIU_CHAT_ENABLED:'true'});
processes.spawn=function(command,args,options){
  const child=realSpawn(command,args,options);
  if(Array.isArray(args)&&args.includes('--output-schema')){
    const row={pid:child.pid,shell:!!options?.shell,startedAt:new Date().toISOString(),eventTypes:[],closed:false};spawns.push(row);
    let pending='';child.stdout?.on('data',bytes=>{pending+=String(bytes);let end;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);try{const value=JSON.parse(line);if(typeof value.type==='string'&&!row.eventTypes.includes(value.type))row.eventTypes.push(value.type);}catch{}}});
    child.once('close',(code,signal)=>Object.assign(row,{closed:true,code,signal,closedAt:new Date().toISOString()}));onSpawn?.(row);
  }return child;
};
async function main(){
  require('reflect-metadata');const {NestFactory}=require('@nestjs/core'),request=require('supertest');
  const load=name=>require(path.join(root,'apps/api/dist/apps/api/src',name+'.js'));
  app=await NestFactory.create(load('app.module').AppModule,{logger:false});app.setGlobalPrefix('api');await app.init();let actor;
  async function call(method,url,body,expected=method==='post'?201:200){let q=request(app.getHttpServer())[method]('/api'+url);if(actor)q=q.set('Authorization','Bearer '+actor.token);if(body!==undefined)q=q.send(body);const r=await q;if(r.status!==expected)throw Error('Synthetic guidance endpoint failed: '+url+' ('+r.status+')');return r.body.data;}
  const provider=app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService),structured=provider.structured.bind(provider);
  provider.structured=(input,schema,check,custom)=>structured(input,schema,value=>{candidates.push(value);return check(value);},custom);
  const worker=app.get(load('modules/diagnostics/guidance-model-worker.service').GuidanceModelWorkerService);
  actor=await call('post','/auth/register',{principal:'guidance-live-'+crypto.randomUUID()+'@local.test',credential:'Synthetic-guidance-'+crypto.randomUUID()});
  const studentId=(await call('post','/students',{nickname:'匿名合成指导',grade:4,preferredSessionMinutes:10,defaultVersionMap:{math:'',chinese:'',english:''}})).profile.id,atom='atomic:math:averagecount';
  await call('put','/students/'+studentId+'/learning-scope',{subject:'math',grade:4,term:'upper',textbookVolumeId:null,textbookVersion:'原创能力路径',learnedAtomIds:[atom],currentAtomId:atom,minutesPerSession:10});
  const baseline=await call('post','/diagnostics/sessions',{studentId,subject:'math',intent:'baseline',targetAtomIds:[atom],includePrerequisites:false,maxItems:4});
  for(const item of baseline.items)await call('post','/diagnostics/sessions/'+baseline.id+'/responses',{itemId:item.id,disposition:'skip',elapsedMs:100});await call('post','/diagnostics/sessions/'+baseline.id+'/complete',{});
  async function create(){const plan=await call('post','/diagnostics/students/'+studentId+'/plans',{baselineSessionId:baseline.id,minutesPerDay:10,useAi:false,requestKey:crypto.randomUUID(),expectedReportVersion:1}),base='/diagnostics/plans/'+plan.id+'/model-suggestions';return{plan,base,row:await call('post',base,{requestKey:crypto.randomUUID(),modelId:'auto',expectedRevision:plan.revision})};}
  const first=await create(),started=Date.now();await worker.runNext();const completed=await call('get',first.base+'/'+first.row.id);
  if(completed.status!=='completed'||completed.modelId!=='deepseek-v4-flash'||!completed.eligibility.canAdopt)throw Error('Default guidance model failed: '+(completed.task?.errorCode??completed.status));
  const unchanged=await call('get','/diagnostics/plans/'+first.plan.id);if(JSON.stringify(unchanged.actions)!==JSON.stringify(first.plan.actions)||unchanged.summary!==first.plan.summary)throw Error('Generation modified the original rule plan');
  const adopted=await call('post',first.base+'/'+first.row.id+'/adopt',{requestKey:crypto.randomUUID(),expectedRevision:first.plan.revision,suggestionRevision:completed.revision});
  const identity=actions=>actions.map(({activity,...action})=>action);
  if(adopted.revision!==first.plan.revision+1||JSON.stringify(identity(adopted.actions))!==JSON.stringify(identity(first.plan.actions)))throw Error('Explicit adoption changed a rule action identity');
  const completionLatencyMs=Date.now()-started,second=await create();let cancelPromise,controlError,spawned=false;
  onSpawn=()=>{spawned=true;cancelPromise=new Promise(resolve=>setTimeout(resolve,250)).then(async()=>{const current=await call('get',second.base+'/'+second.row.id);await call('post',second.base+'/'+second.row.id+'/cancel',{generation:current.task.generation,version:current.task.version});}).catch(error=>{controlError=error;});};
  await worker.runNext();await cancelPromise;onSpawn=undefined;if(controlError)throw controlError;
  const cancelled=await call('get',second.base+'/'+second.row.id);if(!spawned||cancelled.status!=='cancelled'||cancelled.result!==null)throw Error('Actual guidance CLI cancellation was not confirmed');
  const observedAt=Date.now(),observe=()=>spawns.map(row=>{let stillAlive=false;try{process.kill(row.pid,0);stillAlive=true;}catch{}return{...row,stillAlive};});
  let observed=observe();while(observed.some(row=>!row.closed||row.stillAlive)&&Date.now()-observedAt<5000){await new Promise(resolve=>setTimeout(resolve,25));observed=observe();}
  if(observed.some(row=>!row.closed||row.stillAlive))throw Error('An owned guidance CLI process remained');
  return{at:new Date().toISOString(),passed:true,modelId:completed.modelId,modelName:completed.modelName,completionLatencyMs,actions:completed.result.activities.length,candidates,
    checks:{rulesUnchangedBeforeAdoption:true,identityPreservedAfterAdoption:true,explicitRevision:adopted.revision,actualCliCancellation:true},cancellation:{status:cancelled.status,result:cancelled.result,processObservationMs:Date.now()-observedAt},processes:observed,
    limitations:['One synthetic default-model workflow only; not all-model connectivity or teacher validation.','No real learner records, actual teaching outcome, TTS or image generation were tested.']};
}
main().then(value=>{fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify(value,null,2)+'\n');console.log(JSON.stringify({passed:value.passed,modelId:value.modelId,completionLatencyMs:value.completionLatencyMs,processes:value.processes.length}));}).catch(error=>{
  fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify({at:new Date().toISOString(),passed:false,error:String(error.message).slice(0,400),candidates,processes:spawns},null,2)+'\n');console.error('Synthetic guidance runtime verification failed: '+String(error.message).slice(0,200));process.exitCode=1;
}).finally(async()=>{onSpawn=undefined;await app?.close();processes.spawn=realSpawn;if(!path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe guidance runtime directory');fs.rmSync(directory,{recursive:true,force:true});});

// Real default-model call and real CLI cancellation, using temporary synthetic records only.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const processTools=require('node:child_process'),realSpawn=processTools.spawn,spawns=[];
const root=path.resolve(__dirname,'../..'),report=path.resolve(root,process.argv[2]??'data/qa/assistant-turn-runtime.json');
if(!report.startsWith(path.join(root,'data','qa')+path.sep))throw Error('Runtime report must use the QA directory');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'study-assistant-runtime-'));
Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:'sqlite',STUDY_DATA_DIR:directory,STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'false',XIAOJIU_CHAT_ENABLED:'true'});
let app,onSpawn;
processTools.spawn=function(command,args,options){
  const child=realSpawn(command,args,options);
  if(Array.isArray(args)&&args.includes('--output-schema')){
    const record={pid:child.pid,shell:!!options?.shell,startedAt:new Date().toISOString(),eventTypes:[],closed:false};spawns.push(record);
    let pending='';child.stdout?.on('data',bytes=>{pending+=String(bytes);let newline;while((newline=pending.indexOf('\n'))>=0){const line=pending.slice(0,newline);pending=pending.slice(newline+1);try{const event=JSON.parse(line);if(typeof event.type==='string'&&!record.eventTypes.includes(event.type))record.eventTypes.push(event.type);}catch{}}});
    child.once('close',(code,signal)=>{Object.assign(record,{closed:true,code,signal,closedAt:new Date().toISOString()});});onSpawn?.(record);
  }
  return child;
};
async function main(){
  require('reflect-metadata');const {NestFactory}=require('@nestjs/core'),request=require('supertest');
  const load=name=>require(path.join(root,'apps/api/dist/apps/api/src',name+'.js'));
  app=await NestFactory.create(load('app.module').AppModule,{logger:false});app.setGlobalPrefix('api');await app.init();
  let actor;async function call(method,url,body,status=method==='post'?201:200){let query=request(app.getHttpServer())[method]('/api'+url);if(actor)query=query.set('Authorization','Bearer '+actor.token);if(body!==undefined)query=query.send(body);const r=await query;if(r.status!==status)throw Error('Synthetic runtime endpoint failed: '+url+' ('+r.status+')');return r.body.data;}
  actor=await call('post','/auth/register',{principal:'assistant-runtime-'+crypto.randomUUID()+'@local.test',credential:'Synthetic-runtime-only-'+crypto.randomUUID()});
  const session=await call('post','/ai/assistant/sessions',{userRole:'parent',studentId:null,pageContext:'review'}),base='/ai/assistant/sessions/'+session.id;
  const worker=app.get(load('modules/ai/assistant-turn-worker.service').AssistantTurnWorkerService);
  async function create(message){const {contextVersion}=await call('get',base+'/context');return call('post',base+'/turns',{requestKey:crypto.randomUUID(),message,modelId:'deepseek-v4-flash',contextVersion});}
  const started=Date.now(),first=await create('这是一条匿名合成验收。还没有学习记录时，应先确认什么？只给一句简短的下一步建议。');
  await worker.runNext();const completed=await call('get',base+'/turns/'+first.id),messages=await call('get',base+'/messages');
  if(completed.status!=='completed'||completed.source!=='xiaojiu'||completed.modelId!=='deepseek-v4-flash'||messages.length!==2)throw Error('Real default-model durable turn did not complete');
  const completionLatencyMs=Date.now()-started;
  const second=await create('这是另一条匿名合成验收。请详细解释如何先确认学习范围、再用新题观察表现，只依据当前没有学习记录的事实。');
  let cancelResult,controlError,cancelPromise,spawned=false;
  onSpawn=()=>{spawned=true;cancelPromise=new Promise(resolve=>setTimeout(resolve,250)).then(async()=>{const current=await call('get',base+'/turns/'+second.id);cancelResult=await call('post',base+'/turns/'+second.id+'/cancel',{generation:current.task.generation,version:current.task.version});}).catch(error=>{controlError=error;});};
  await worker.runNext();await cancelPromise;onSpawn=undefined;if(controlError)throw controlError;
  const cancelled=await call('get',base+'/turns/'+second.id),saved=await call('get',base+'/messages');
  if(!spawned||!cancelResult||cancelled.status!=='cancelled'||saved.length!==2)throw Error('Real CLI cancellation was not confirmed');
  const processes=spawns.map(record=>{let stillAlive=false;try{process.kill(record.pid,0);stillAlive=true;}catch{}return{...record,stillAlive};});
  if(processes.some(p=>!p.closed||p.stillAlive))throw Error('An owned CLI process remained after settlement');
  return{at:new Date().toISOString(),passed:true,scope:'Synthetic ordinary assistant: default-model completion and actual CLI cancellation only',modelId:completed.modelId,modelName:completed.modelName,
    completionLatencyMs,replyCharacters:messages[1].content.length,replySha256:crypto.createHash('sha256').update(messages[1].content).digest('hex'),
    cancellation:{status:cancelled.status,generation:cancelled.task.generation,savedMessages:saved.length},processes,
    limitations:['One default-model call; not all-model connectivity proof.','CLI event types observed for this invocation only; no claim that the CLI lacks other event types.','No real learner data or long-term teaching outcome was tested.']};
}
main().then(result=>{fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,modelId:result.modelId,completionLatencyMs:result.completionLatencyMs,cliProcesses:result.processes.length}));}).catch(error=>{
  fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify({at:new Date().toISOString(),passed:false,error:String(error.message).slice(0,300),cliProcesses:spawns.length},null,2)+'\n');console.error('Synthetic assistant runtime verification failed: '+String(error.message).slice(0,200));process.exitCode=1;
}).finally(async()=>{onSpawn=undefined;await app?.close();processTools.spawn=realSpawn;if(!path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe synthetic runtime directory');fs.rmSync(directory,{recursive:true,force:true});});

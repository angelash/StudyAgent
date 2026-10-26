/* Actual default DS writing/review through isolated HTTP. No real family records. */
require('reflect-metadata');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto'),{execFileSync}=require('node:child_process'),{NestFactory}=require('@nestjs/core'),request=require('supertest');
const root=path.resolve(__dirname,'../..'),directory=path.join(root,'data/qa/topic-whiteboard-live-'+Date.now()+'-'+process.pid);fs.mkdirSync(directory,{recursive:true});
Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:'sqlite',STUDY_DATA_DIR:directory,STUDY_SEED_FOUNDATION:'false',STUDY_WORKER_ENABLED:'false',XIAOJIU_CHAT_ENABLED:'true'});delete process.env.DATABASE_URL;
const receipt={at:new Date().toISOString(),passed:false,scope:'Anonymous adult topic over actual HTTP, live DS writing and AI review, explicit confirmation. Actual CLI invocations counted separately from structured stages. No teacher, audio, pixel or learning-validity acceptance.',calls:[],invocations:[],validationFailures:[],attempts:[],teacherReviewStatus:'pending',formalMeasurementEligible:false};let app;
const save=(name,value)=>fs.writeFileSync(path.join(directory,name+'.json'),JSON.stringify(value,null,2)+'\n');
(async()=>{
 const load=name=>require('../../apps/api/dist/apps/api/src/'+name+'.js');app=await NestFactory.create(load('app.module').AppModule,{logger:false});app.setGlobalPrefix('api');await app.init();
 const store=app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService),chat=app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService),worker=app.get(load('modules/learning/topic-whiteboard-worker.service').TopicWhiteboardWorkerService);
 receipt.baselineRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();receipt.compiledSha256={};
 for(const name of ['topic-whiteboard.service','topic-whiteboard-worker.service','topic-whiteboard-content','topic-whiteboard-access','topic-whiteboard-projection']){
  const file='apps/api/dist/apps/api/src/modules/learning/'+name+'.js';receipt.compiledSha256[file]=createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
 }
 const invoke=chat.run.bind(chat);let currentStage=null;
 chat.run=async(args,prompt,signal)=>{const entry={stage:currentStage,modelId:args[args.indexOf('-m')+1],startedAt:new Date().toISOString(),status:'running'},start=Date.now();receipt.invocations.push(entry);
  try{const output=await invoke(args,prompt,signal);entry.status='completed';entry.outputCharacters=output.length;return output;}catch(error){entry.status='failed';throw error;}finally{entry.durationMs=Date.now()-start;}
 };
 const original=chat.structured.bind(chat);chat.structured=async(input,schema,check,...rest)=>{
  const entry={stage:JSON.parse(input.message).stage,modelId:input.modelId,startedAt:new Date().toISOString(),status:'running'};receipt.calls.push(entry);const start=Date.now();currentStage=entry.stage;
  try{const result=await original(input,schema,value=>{try{return check(value);}catch(error){receipt.validationFailures.push({stage:entry.stage,name:error.name,issues:error.issues?.length??null});throw error;}},...rest);entry.status='completed';entry.modelName=result.modelName;return result;}
  catch(error){entry.status='failed';throw error;}finally{entry.durationMs=Date.now()-start;}
 };
 let actor;async function call(method,url,body){const q=request(app.getHttpServer())[method]('/api'+url);if(actor)q.set('Authorization','Bearer '+actor.token);if(body!==undefined)q.send(body);const response=await q;assert(response.status<300,'HTTP status '+response.status);return response.body.data;}
 actor=await call('post','/auth/register',{principal:'topic-live-'+randomUUID()+'@local.test',credential:'Synthetic-live-'+randomUUID()});
 const base='/learning/studio/topic-whiteboards',input={audience:{kind:'adult'},modelId:'deepseek-v4-flash',
  prompt:'解释为什么不同分母的分数相加要先通分。用1/2加1/3示范，用一张对照表澄清单位和份数，并保留正确公式及适用条件。',
  objective:'成人自学，分3至5幕完整讲清整体、分数单位和份数；要点须逐字出现于对应旁白，保留可以自我核查的步骤。'};
 const preview=await call('post',base+'/preflight',input);assert(preview.available);assert.equal(preview.modelId,'deepseek-v4-flash');receipt.modelId=preview.modelId;
 let view=await call('post',base+'/drafts',{...input,preflightFingerprint:preview.fingerprint,requestKey:randomUUID()});
 for(let attempt=1;attempt<=2;attempt++){
  const start=Date.now();assert(await worker.runNext());view=await call('get',base+'/drafts/'+view.id);
  receipt.attempts.push({attempt,status:view.status,errorCode:view.task?.errorCode??null,durationMs:Date.now()-start});if(view.status==='ready')break;
  if(attempt===1&&view.task?.state==='failed')view=await call('post',base+'/drafts/'+view.id+'/retry',{expectedRevision:view.revision,generation:view.generation,taskVersion:view.task.version,requestKey:randomUUID()});
 }
 assert.equal(view.status,'ready');save('original-and-review',view);
 const published=await call('post',base+'/drafts/'+view.id+'/confirm',{expectedRevision:view.revision,contentFingerprint:view.contentFingerprint,acknowledgeAiGeneratedContent:true,acknowledgeUnreviewedChanges:true,requestKey:randomUUID()});
 const board=await call('get',base+'/'+published.whiteboardId);assert.equal(board.studentId,null);assert.equal(board.subject,null);assert.equal(board.origin.formalMeasurementEligible,false);
 receipt.sceneCount=board.scenes.length;receipt.tableCount=board.scenes.filter(scene=>scene.exhibit?.kind==='table').length;receipt.formulaCount=board.scenes.filter(scene=>scene.exhibit?.kind==='formula').length;
 assert(receipt.tableCount>=1,'Requested comparison table absent');assert(receipt.formulaCount>=1,'Requested formula absent');
 assert.equal(await store.requestContext(()=>store.inspect('diagnosticResponses').length+store.inspect('studioActivities').length),0);
 receipt.review=view.review;receipt.modelName=view.modelName;save('published-board',board);receipt.passed=true;
})().catch(error=>{receipt.error={code:error?.code??(error?.name==='AssertionError'?'assertion_failed':'live_topic_failed')};process.exitCode=1;}).finally(async()=>{
 await app?.close();save('receipt',receipt);fs.writeFileSync(path.join(root,'data/qa/topic-whiteboard-live-latest.json'),JSON.stringify({...receipt,artifactDirectory:path.relative(root,directory).replaceAll('\\','/')},null,2)+'\n');
 console.log(JSON.stringify({passed:receipt.passed,modelId:receipt.modelId,structuredStages:receipt.calls.length,actualCliCalls:receipt.invocations.length,attempts:receipt.attempts,tableCount:receipt.tableCount,formulaCount:receipt.formulaCount,error:receipt.error}));
});

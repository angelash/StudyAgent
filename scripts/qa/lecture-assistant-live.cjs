// Explicit real Xiaojiu CLI samples, anonymous owned database, no production learner data.
require('reflect-metadata');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const {NestFactory}=require('@nestjs/core'),request=require('supertest'),root=path.resolve(__dirname,'../..');
const args=process.argv.slice(2),index=args.indexOf('--output');
if(index<0||!args[index+1])throw Error('Explicit fresh --output required');
const directory=path.resolve(root,args[index+1]);
if(!directory.startsWith(path.join(root,'data/qa')+path.sep)||fs.existsSync(directory))throw Error('Fresh owned QA directory required');
const relevant=['apps/api/src/modules/ai','packages/contracts/src/assistant-turn.ts','scripts/qa/lecture-assistant-live.cjs'];
if(execFileSync('git',['status','--porcelain','--',...relevant],{cwd:root,encoding:'utf8',windowsHide:true}).trim())throw Error('Commit fixed lecture sources and runner before real samples');
Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:'sqlite',STUDY_DATA_DIR:path.join(directory,'private-runtime'),STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'false',XIAOJIU_CHAT_ENABLED:'true',XIAOJIU_CHAT_TIMEOUT_MS:'60000',OPENAI_API_KEY:'',MINIMAX_API_KEY:''});
const load=name=>require(path.join(root,'apps/api/dist/apps/api/src',name+'.js'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),inputs={};
for(const name of ['ai.controller','ai.service','assistant-lecture-context','assistant-turn.service','assistant-turn-worker.service','assistant-turn-record','xiaojiu-chat.service','xiaojiu-models.service','xiaojiu-text-transport','codex-command'])
 for(const file of ['apps/api/src/modules/ai/'+name+'.ts','apps/api/dist/apps/api/src/modules/ai/'+name+'.js'])inputs[file]=sha(fs.readFileSync(path.join(root,file)));
for(const file of ['scripts/qa/lecture-assistant-live.cjs','apps/api/src/modules/learning/classroom-curriculum.ts','apps/api/dist/apps/api/src/modules/learning/classroom-curriculum.js','packages/contracts/src/assistant-turn.ts','packages/contracts/dist/index.js','packages/config/src/index.ts','packages/config/dist/index.js'])inputs[file]=sha(fs.readFileSync(path.join(root,file)));
const receipt={version:1,revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim(),startedAt:new Date().toISOString(),passed:false,status:'running',sourceAndCompiledSha256:inputs,cases:[],scope:'Two anonymous default-model samples through actual HTTP, durable worker and configured Xiaojiu CLI. No fixtures, model matrix requalification, teacher validation, pixel/audio parity or stable success-rate claim.'};
fs.mkdirSync(directory,{recursive:true});const save=()=>fs.writeFileSync(path.join(directory,'progress.json'),JSON.stringify(receipt,null,2)+'\n');
let app,observed;
(async()=>{
 save();app=await NestFactory.create(load('app.module').AppModule,{logger:false});app.setGlobalPrefix('api');await app.init();
 const store=app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService),provider=app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService),worker=app.get(load('modules/ai/assistant-turn-worker.service').AssistantTurnWorkerService);
 assert.equal(provider.enabled,true);const structured=provider.structured.bind(provider);
 provider.structured=(input,schema,check,custom)=>{const context=JSON.parse(input.context);observed.contextMode=context.lecture?'lecture':context.independentStudy?'independent':'unexpected';observed.noChildEvidence=context.report===null&&context.plan===null&&context.scope===null&&context.currentQuestion===null&&context.evidenceIds.length===0;save();return structured(input,schema,check,custom,event=>{observed.attempts.push(event);save();});};
 const collections=['classroomSessions','diagnosticResponses','practiceAttempts','diagnosticPlans','diagnosticHypotheses','scoringRevisions'];
 const formal=()=>store.requestContext(()=>sha(Buffer.from(JSON.stringify(collections.map(name=>store.select(name,{}))))));receipt.formalBeforeSha256=await formal();
 for(const mode of ['lecture','independent']){
  const row={mode,requestedModelId:'auto',status:'running',attempts:[],startedAt:new Date().toISOString()};receipt.cases.push(row);observed=row;save();let actor;
  async function call(method,route,body){let query=request(app.getHttpServer())[method]('/api'+route);if(actor)query=query.set('Authorization','Bearer '+actor.token);if(body!==undefined)query=query.send(body);const response=await query;assert.equal(response.status,method==='post'?201:200,'Anonymous lecture HTTP status '+response.status);return response.body.data;}
  const start=Date.now();try{
   actor=await call('post','/auth/register',{principal:'lecture-live-'+randomUUID()+'@local.test',credential:'Synthetic-Lecture-'+randomUUID()});
   const catalog=await call('get','/ai/models');assert.equal(catalog.defaultModel,'deepseek-v4-flash');
   let descriptor,body={userRole:'parent',studentId:null,subject:null,pageContext:'studio',contextRefType:null,contextRefId:null,contextItemId:null};
   if(mode==='lecture'){const course=load('modules/learning/classroom-curriculum').classroomCourse();descriptor=await call('get','/ai/assistant/lecture-context?'+new URLSearchParams({courseId:course.id,lectureId:course.units[0].lectures[0].id}));body={...body,pageContext:'classroom',contextRefType:'classroom_lecture',contextRefId:descriptor.referenceId,contextItemId:descriptor.lectureId};}
   const session=await call('post','/ai/assistant/sessions',body),base='/ai/assistant/sessions/'+session.id,context=await call('get',base+'/context');
   const command={requestKey:randomUUID(),message:mode==='lecture'?'请围绕本讲目标，用匿名情境解释个人困扰与公共议题的区别，给一个反例和一个检验理解的小问题，不推断我已掌握。':'请用匿名学习情境解释相关性与因果关系的区别，给一个反例及下一步检验问题，不生成孩子的能力结论。',modelId:'auto',contextVersion:context.contextVersion};
   const created=await call('post',base+'/turns',command);row.turnId=created.id;row.modelId=created.modelId;assert.equal(created.modelId,'deepseek-v4-flash');
   assert.equal(await worker.runNext(),true);const result=await call('get',base+'/turns/'+created.id),messages=await call('get',base+'/messages/page');row.taskStatus=result.status;row.errorCode=result.task?.errorCode??null;
   fs.writeFileSync(path.join(directory,mode+'.json'),JSON.stringify({descriptor,session,context,command,result,messages},null,2)+'\n',{flag:'wx'});
   assert.equal(result.status,'completed');assert.equal(row.contextMode,mode);assert.equal(row.noChildEvidence,true);assert.equal(messages.messages.length,2);assert.equal(messages.messages[1].source,'xiaojiu');assert.equal(messages.messages[1].modelId,'deepseek-v4-flash');assert(messages.messages[1].content.trim());assert.deepEqual(messages.messages[1].evidenceIds,[]);
   const starts=row.attempts.filter(event=>event.status==='started').length,replayed=await call('post',base+'/turns',command);assert.equal(replayed.assistantMessageId,result.assistantMessageId);assert.equal(await worker.runNext(),false);assert.equal(row.attempts.filter(event=>event.status==='started').length,starts);row.status='passed';
  }catch{row.status='failed';}
  row.elapsedMs=Date.now()-start;row.completedAt=new Date().toISOString();save();console.log(JSON.stringify({mode,status:row.status,modelId:row.modelId,elapsedMs:row.elapsedMs,cliStarts:row.attempts.filter(event=>event.status==='started').length}));
 }
 receipt.formalAfterSha256=await formal();assert.equal(receipt.formalBeforeSha256,receipt.formalAfterSha256);
 for(const[file,digest]of Object.entries(inputs))assert.equal(sha(fs.readFileSync(path.join(root,file))),digest,'Fixed lecture input changed');
 receipt.status='complete';receipt.passed=receipt.cases.every(row=>row.status==='passed');receipt.completedAt=new Date().toISOString();fs.writeFileSync(path.join(directory,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});save();if(!receipt.passed)process.exitCode=1;
})().catch(()=>{receipt.status='failed';receipt.failureKind='runner-or-integrity-failure';save();console.error('Live lecture samples did not complete; original progress retained.');process.exitCode=1;}).finally(async()=>{await app?.close();});

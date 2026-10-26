/* Explicit live image smoke. Controlled teaching model; actual shipped image Skill and durable HTTP tasks. */
require('reflect-metadata');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),request=require('supertest');
const {randomUUID,createHash}=require('node:crypto'),{NestFactory}=require('@nestjs/core');
const root=path.resolve(__dirname,'../..'),directory=path.join(root,'data/qa/topic-figure-live-'+Date.now()+'-'+process.pid);
fs.mkdirSync(directory,{recursive:true});
Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:'sqlite',STUDY_DATA_DIR:directory,STUDY_SEED_FOUNDATION:'false',STUDY_WORKER_ENABLED:'false',XIAOJIU_CHAT_ENABLED:'false',E2E_SOURCE_COURSE_SNAPSHOT:'1'});
delete process.env.DATABASE_URL;
const receipt={at:new Date().toISOString(),passed:false,scope:'Two explicit live gpt-image-2 image calls over actual HTTP, original PNG edit and durable workers. Anonymous adult, synthetic teaching text; not a real text-model, teacher, sound, device or learning-effectiveness test.',calls:[],http:[],artifacts:[],contentReview:'pending'};
let app;
(async()=>{
 const load=name=>require('../../apps/api/dist/apps/api/src/'+name+'.js');
 app=await NestFactory.create(load('app.module').AppModule,{logger:false});app.setGlobalPrefix('api');await app.init();
 const store=app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService),chat=app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService);
 const model=require('./topic-whiteboard-fixture.cjs').installTopicWhiteboardFixture(app);chat.structured=(input,schema,check)=>model(input,check);
 const worker=app.get(load('modules/learning/topic-whiteboard-worker.service').TopicWhiteboardWorkerService),images=app.get(load('modules/ai/classroom-image.service').ClassroomImageService);
 const imageWorker=app.get(load('modules/learning/topic-whiteboard-visual-worker.service').TopicWhiteboardVisualWorkerService),{topicVisualFile}=load('modules/learning/topic-whiteboard-visual-storage');
 for(const operation of ['generate','edit']){const original=images[operation].bind(images);images[operation]=async(...args)=>{const start=Date.now(),entry={operation,modelId:'gpt-image-2',status:'started'};receipt.calls.push(entry);try{const result=await original(...args);entry.status='completed';return result;}finally{entry.durationMs=Date.now()-start;}};}
 const actor=(await request(app.getHttpServer()).post('/api/auth/register').send({principal:'topic-figure-live-'+randomUUID()+'@local.test',credential:'Synthetic-live-'+randomUUID()}).expect(201)).body.data;
 async function call(method,url,body,status=method==='post'?201:200){const query=request(app.getHttpServer())[method]('/api'+url).set('Authorization','Bearer '+actor.token);if(body!==undefined)query.send(body);const response=await query;receipt.http.push({method,status:response.status});assert.equal(response.status,status,'Live synthetic HTTP failed');return response.body.data;}
 const base='/learning/studio/topic-whiteboards',visualBase='/learning/studio/topic-whiteboard-visuals',selection={audience:{kind:'adult'},modelId:'deepseek-v4-flash',prompt:'用匿名观察解释条件与推断',objective:'用简洁要点和对照澄清观察、条件与待验证结论。'};
 const preview=await call('post',base+'/preflight',selection);let draft=await call('post',base+'/drafts',{...selection,preflightFingerprint:preview.fingerprint,requestKey:randomUUID()});assert(await worker.runNext());draft=await call('get',base+'/drafts/'+draft.id);assert.equal(draft.status,'ready');
 receipt.capabilities=await call('get',visualBase+'/capabilities');assert(receipt.capabilities.available&&receipt.capabilities.editAvailable,'Installed image environment not ready');
 const input={draftId:draft.id,sceneIndex:1,expectedRevision:draft.revision,contentFingerprint:draft.contentFingerprint,purpose:'comparison',operation:'generate',requirements:'简洁白底教学概念图。两个等大的半透明圆：左侧蓝色圈内只写“观察”，右侧橙色圈内只写“条件”，重叠处只写“待验证”。不要标题、英文、页码、人物、装饰或额外文字。圈内标签完整清晰，不以画图代替核查结论。'};
 async function produce(input,parent){const preflight=await call('post',visualBase+'/preflight',input),command={...input,preflightFingerprint:preflight.fingerprint,requestKey:randomUUID()},route=visualBase+(parent?'/'+parent+'/edits':'');
  let visual=await call('post',route,command);assert(await imageWorker.runNext());visual=await call('get',visualBase+'/'+visual.id);assert.equal(visual.status,'ready',visual.task?.errorCode||'Live image did not publish');
  const beforeCalls=receipt.calls.length,replay=await call('post',route,command);assert.equal(replay.id,visual.id);assert.equal(receipt.calls.length,beforeCalls);
  const response=await request(app.getHttpServer()).get('/api'+visual.imageUrl).set('Authorization','Bearer '+actor.token).expect(200);assert.equal(createHash('sha256').update(response.body).digest('hex'),visual.sha256);
  await request(app.getHttpServer()).get('/api'+visual.imageUrl).expect(401);
  await store.requestContext(()=>{const raw=store.find('studioTopicWhiteboardVisuals',{id:visual.id}),files={};for(const kind of ['image','original','prompt'])files[kind]=path.relative(root,topicVisualFile(raw,kind).path).replaceAll('\\','/');receipt.artifacts.push({operation:input.operation,sha256:visual.sha256,width:visual.width,height:visual.height,...files});});
  assert.deepEqual([visual.width,visual.height],[1536,1024]);return visual;
 }
 const first=await produce(input),second=await produce({...input,operation:'edit',parentVisualId:first.id,changes:'保留原图所有中文标签、两个圆和相交位置不变，只把圆圈边框加粗，并把填色调浅，以便白板远看清楚。'},first.id);
 assert.equal(second.parentVisualId,first.id);assert.equal(receipt.calls.length,2);
 const content=structuredClone(draft.content);content.scenes[1].figure={visualId:second.id,alt:'匿名观察与条件的交集示意；中文标签和结论仍待人工核对。',caption:'真实生图与原图修订的技术验证，不作为知识正确性的证明。'};
 draft=await call('patch',base+'/drafts/'+draft.id+'/content',{expectedRevision:draft.revision,contentFingerprint:draft.contentFingerprint,content,requestKey:randomUUID()});
 const published=await call('post',base+'/drafts/'+draft.id+'/confirm',{expectedRevision:draft.revision,contentFingerprint:draft.contentFingerprint,acknowledgeAiGeneratedContent:true,acknowledgeUnreviewedChanges:true,requestKey:randomUUID()});
 const board=await call('get',base+'/'+published.whiteboardId),frozen=board.scenes[1].figure;assert.equal(frozen.sha256,second.sha256);assert(!JSON.stringify(board).includes(second.id));
 const bytes=await request(app.getHttpServer()).get('/api'+frozen.imageUrl).set('Authorization','Bearer '+actor.token).expect(200);assert.equal(createHash('sha256').update(bytes.body).digest('hex'),second.sha256);
 assert.equal(await store.requestContext(()=>store.inspect('diagnosticResponses').length+store.inspect('studioActivities').length),0);
 receipt.replayDidNotRegenerate=true;receipt.frozenPublishedBytesVerified=true;receipt.measurementUnchanged=true;receipt.passed=true;
})().catch(error=>{receipt.error={name:error.name,code:error.code??'live_image_check_failed',message:error.name==='AssertionError'?error.message:undefined};process.exitCode=1;}).finally(async()=>{
 await app?.close();fs.writeFileSync(path.join(directory,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');fs.writeFileSync(path.join(root,'data/qa/topic-figure-live-latest.json'),JSON.stringify({...receipt,artifactDirectory:path.relative(root,directory).replaceAll('\\','/')},null,2)+'\n');console.log(JSON.stringify(receipt));
});

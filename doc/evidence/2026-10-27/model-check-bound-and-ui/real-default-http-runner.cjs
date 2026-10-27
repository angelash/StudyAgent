const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
require('reflect-metadata');
const root=path.resolve(__dirname,'../..'),output=path.join(__dirname,'real-default-http-16cea68');
if(fs.existsSync(output))throw Error('Preserve previous attempts; choose a new output directory');
fs.mkdirSync(output);
Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:'sqlite',STUDY_DATA_DIR:path.join(output,'isolated-data'),
  STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'false',XIAOJIU_CHAT_ENABLED:'true',XIAOJIU_CHAT_TIMEOUT_MS:'60000'});
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const original=JSON.parse(fs.readFileSync(path.join(__dirname,'current-models-bound-16cea68/receipt.json'),'utf8'));
const inputs=original.sourceAndCompiledSha256;
for(const[file,digest]of Object.entries(inputs))assert.equal(hash(path.join(root,file)),digest,file);
const receipt={version:1,head:original.revision,startedAt:new Date().toISOString(),status:'running',passed:false,
  scope:'One anonymous actual Nest HTTP default assistant request and exact durable replay. Real configured Xiaojiu CLI, isolated SQLite and no child or production data. Not a quality or full model availability claim.',
  sourceAndCompiledSha256:inputs,cliAttempts:[],supplierCalls:0,compatibilityCalls:0};
const save=()=>fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
let app;
(async()=>{
  const {NestFactory}=require('@nestjs/core'),request=require('supertest');
  const load=name=>require(path.join(root,'apps/api/dist/apps/api/src/modules/ai',name+'.js'));
  app=await NestFactory.create(require(path.join(root,'apps/api/dist/apps/api/src/app.module.js')).AppModule,{logger:false});
  app.setGlobalPrefix('api');await app.init();
  const ai=app.get(load('ai.service').AiService),chat=app.get(load('xiaojiu-chat.service').XiaojiuChatService),models=app.get(load('xiaojiu-models.service').XiaojiuModelsService);
  ai.client={chat:{completions:{create:async()=>{receipt.compatibilityCalls++;throw Error('Compatibility client must not execute');}}}};
  const structured=chat.structured.bind(chat);
  chat.structured=async(input,schema,check,custom=true)=>{receipt.supplierCalls++;return structured(input,schema,check,custom,event=>receipt.cliAttempts.push(event));};
  let actor;
  const call=async(method,url,body,auth=true)=>{let q=request(app.getHttpServer())[method]('/api'+url);if(auth)q=q.set('Authorization','Bearer '+actor.token);if(body!==undefined)q=q.send(body);const result=await q;assert.equal(result.status,method==='post'?201:200,'Unexpected HTTP status');return result.body.data;};
  actor=await call('post','/auth/register',{principal:'anonymous-default-'+crypto.randomUUID()+'@local.test',credential:crypto.randomUUID()+'Qa9!'},false);
  const session=await call('post','/ai/assistant/sessions',{userRole:'parent',studentId:null,pageContext:'review'});
  const catalog=await call('get','/ai/models');
  assert.equal(catalog.defaultModel,'deepseek-v4-flash');
  receipt.catalogCheck=catalog.textCheck;
  const command={message:'请给一个简短的匿名学习建议：如何先找清题目中的已知条件再做答？不要推测我的年龄、年级或已有能力。',requestKey:crypto.randomUUID()};
  save();const first=await call('post','/ai/assistant/sessions/'+session.id+'/messages',command);
  assert.equal(first.source,'xiaojiu');assert.equal(first.modelId,'deepseek-v4-flash');assert(first.reply?.trim());
  assert.equal(receipt.supplierCalls,1);assert.equal(receipt.compatibilityCalls,0);
  const before=await call('get','/ai/assistant/sessions/'+session.id+'/messages');assert.equal(before.length,2);
  models.resolve=()=>{throw Error('Changed directory must not re-resolve an original completed command');};
  const replay=await call('post','/ai/assistant/sessions/'+session.id+'/messages',command);
  const after=await call('get','/ai/assistant/sessions/'+session.id+'/messages');
  assert.equal(replay.reply,first.reply);assert.equal(replay.modelId,first.modelId);assert.deepEqual(after,before);
  assert.equal(receipt.supplierCalls,1);assert.equal(receipt.compatibilityCalls,0);
  for(const[file,digest]of Object.entries(inputs))assert.equal(hash(path.join(root,file)),digest,file);
  Object.assign(receipt,{status:'complete',passed:true,modelId:first.modelId,modelName:first.modelName,
    reply:first.reply,anonymousMessage:command.message,messageCount:after.length,replayIdentical:true,
    sourceReceiptSha256:hash(path.join(__dirname,'current-models-bound-16cea68/receipt.json'))});
})().catch(error=>{receipt.status='failed';receipt.failure=error.message;process.exitCode=1;}).finally(async()=>{
  try{await app?.close();}finally{receipt.completedAt=new Date().toISOString();save();console.log(JSON.stringify({status:receipt.status,passed:receipt.passed,supplierCalls:receipt.supplierCalls,compatibilityCalls:receipt.compatibilityCalls}));}
});

/* Isolated browser server: deterministic model; loopback fixture clients keep distinct rate-limit buckets. */
require('reflect-metadata');
const path=require('node:path'),{NestFactory}=require('@nestjs/core');
const root=path.resolve(__dirname,'../..'),directory=path.resolve(process.env.STUDY_DATA_DIR??'.');
if(!directory.startsWith(path.join(root,'data','qa')+path.sep)||process.env.STUDY_STORAGE!=='sqlite'||process.env.XIAOJIU_CHAT_ENABLED!=='false')throw new Error('Source course fixture server requires an isolated QA directory, SQLite and disabled live models');
const{sourceCoursePipelineFixture}=require('./source-course-fixture.cjs');
(async()=>{
  const{AppModule}=require('../../apps/api/dist/apps/api/src/app.module.js'),{XiaojiuChatService}=require('../../apps/api/dist/apps/api/src/modules/ai/xiaojiu-chat.service.js');
  const app=await NestFactory.create(AppModule,{logger:false});require('../../apps/api/dist/apps/api/src/common/http-body.js').configureJsonBody(app);app.setGlobalPrefix('api');
  app.getHttpAdapter().getInstance().set('trust proxy','loopback');
  const provider=app.get(XiaojiuChatService),original=provider.structured.bind(provider),attempts=new Map();
  provider.structured=async(input,schema,check,custom=true)=>{
    if(!custom)return original(input,schema,check,custom);
    const context=JSON.parse(input.context),stage=JSON.parse(input.message),count=(attempts.get(context.goal)??0)+1;attempts.set(context.goal,count);
    const key=context.goal+'|'+stage.stage+'|'+stage.lessonIndex,stageCount=(attempts.get(key)??0)+1;attempts.set(key,stageCount);
    if(count===1&&context.goal.includes('[fail-once]'))throw new Error('fixture generation failure');
    if(stageCount===1&&stage.stage==='lesson'&&stage.lessonIndex===1&&context.goal.includes('[fail-later-once]'))throw new Error('fixture later lesson failure');
    const reviewPause=stageCount===1&&stage.stage==='review'&&stage.lessonIndex===0&&context.goal.includes('[pause-review-once]');
    if(count===1&&context.goal.includes('[pause-once]')||reviewPause)await new Promise((resolve,reject)=>{
      const abort=()=>{clearTimeout(timer);reject(new Error('fixture cancelled'));},timer=setTimeout(()=>{input.signal?.removeEventListener('abort',abort);resolve();},reviewPause?12000:20000);
      if(input.signal?.aborted)abort();else input.signal?.addEventListener('abort',abort,{once:true});
    });
    return{...check(sourceCoursePipelineFixture(context,input.message)),modelId:input.modelId,modelName:'Browser fixture · not a real model'};
  };
  const {ClassroomImageService}=require('../../apps/api/dist/apps/api/src/modules/ai/classroom-image.service.js'),sharp=require('sharp'),fs=require('node:fs'),imageService=app.get(ClassroomImageService),imageAttempts=new Map();
  imageService.capabilities=async()=>({available:true,modelId:'gpt-image-2',reason:'ready',message:'Browser image fixture, not a real provider'});
  imageService.generate=async(prompt,directory,signal)=>{const count=(imageAttempts.get(prompt)??0)+1;imageAttempts.set(prompt,count);
    if(count===1&&prompt.includes('[image-fail-once]'))throw new Error('fixture image failure');
    if(count===1&&prompt.includes('[image-pause-once]'))await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,12000);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('fixture image cancelled'));},{once:true});});
    const output=path.join(directory,'browser-fixture.png');await sharp({create:{width:1024,height:1024,channels:3,background:{r:223,g:234,b:248}}}).png().toFile(output);const promptPath=path.join(directory,'browser-prompt.txt');fs.writeFileSync(promptPath,prompt);return{output,promptPath};};
  require('./classroom-caption-fixture.cjs').installCaptionFixture(app);
  app.enableCors({origin:(process.env.CORS_ORIGINS??'').split(',').filter(Boolean),credentials:true});await app.init();await app.listen(Number(process.env.API_PORT??4107),'127.0.0.1');
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>void app.close().then(()=>process.exit(0)));
})().catch(error=>{console.error(error.message);process.exitCode=1;});

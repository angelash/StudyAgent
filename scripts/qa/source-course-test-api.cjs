/* Isolated browser server: deterministic model; loopback fixture clients keep distinct rate-limit buckets. */
require('reflect-metadata');
const path=require('node:path'),{NestFactory}=require('@nestjs/core');
const root=path.resolve(__dirname,'../..'),directory=path.resolve(process.env.STUDY_DATA_DIR??'.');
if(!directory.startsWith(path.join(root,'data','qa')+path.sep)||process.env.STUDY_STORAGE!=='sqlite'||process.env.XIAOJIU_CHAT_ENABLED!=='false')throw new Error('Source course fixture server requires an isolated QA directory, SQLite and disabled live models');
const{sourceCourseFixture}=require('./source-course-fixture.cjs');
(async()=>{
  const{AppModule}=require('../../apps/api/dist/apps/api/src/app.module.js'),{XiaojiuChatService}=require('../../apps/api/dist/apps/api/src/modules/ai/xiaojiu-chat.service.js');
  const app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api');
  app.getHttpAdapter().getInstance().set('trust proxy','loopback');
  const provider=app.get(XiaojiuChatService),original=provider.structured.bind(provider),attempts=new Map();
  provider.structured=async(input,schema,check,custom=true)=>{
    if(!custom)return original(input,schema,check,custom);
    const context=JSON.parse(input.context),count=(attempts.get(context.goal)??0)+1;attempts.set(context.goal,count);
    if(count===1&&context.goal.includes('[fail-once]'))throw new Error('fixture generation failure');
    if(count===1&&context.goal.includes('[pause-once]'))await new Promise((resolve,reject)=>{
      const abort=()=>{clearTimeout(timer);reject(new Error('fixture cancelled'));},timer=setTimeout(()=>{input.signal?.removeEventListener('abort',abort);resolve();},20000);
      if(input.signal?.aborted)abort();else input.signal?.addEventListener('abort',abort,{once:true});
    });
    return{...check(sourceCourseFixture(context.sources)),modelId:'fixture-only',modelName:'Browser fixture · not a real model'};
  };
  app.enableCors({origin:(process.env.CORS_ORIGINS??'').split(',').filter(Boolean),credentials:true});await app.init();await app.listen(Number(process.env.API_PORT??4107),'127.0.0.1');
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>void app.close().then(()=>process.exit(0)));
})().catch(error=>{console.error(error.message);process.exitCode=1;});

/* Real bilingual narration through authenticated classroom HTTP, using an owned temporary DB. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
if(fs.existsSync(path.join(root,'.env')))process.loadEnvFile(path.join(root,'.env'));
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'study-caption-live-'));
Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:'sqlite',STUDY_DATA_DIR:directory,STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'false',XIAOJIU_CHAT_ENABLED:'false'});
const target=path.resolve(process.argv[2]||path.join(root,'data/qa/classroom-caption-live.json')),artifactRoot=path.join(path.dirname(target),'caption-audio');
const receipt={at:new Date().toISOString(),scope:'Real configured speech provider, owned anonymous classroom in temporary SQLite; decoding is not a human listening or device acceptance',samples:[],passed:false};let app;
async function main(){
  require('reflect-metadata');const{NestFactory}=require('@nestjs/core'),{AppModule}=require(path.join(root,'apps/api/dist/apps/api/src/app.module.js'));
  app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api');await app.listen(0,'127.0.0.1');const base=(await app.getUrl())+'/api';let token;
  async function call(method,route,body){const response=await fetch(base+route,{method,signal:AbortSignal.timeout(90000),headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});if(!response.ok)throw new Error('Caption live HTTP '+response.status);return response;}
  const actor=await(await call('POST','/auth/register',{principal:'caption-live-'+randomUUID()+'@local.test',credential:randomUUID()})).json();token=actor.data.token;
  const{InMemoryStoreService}=require(path.join(root,'apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js')),{freezeClassroomPresentation}=require(path.join(root,'apps/api/dist/apps/api/src/modules/learning/classroom-presentation.js')),{classroomFingerprint}=require(path.join(root,'apps/api/dist/apps/api/src/modules/learning/classroom-curriculum.js')),store=app.get(InMemoryStoreService);
  const original=await(await call('POST','/learning/classroom/sessions',{lessonId:'soc-5-1-1'})).json(),id=original.data.id,baseRoute='/learning/classroom/sessions/'+id;
  fs.mkdirSync(artifactRoot,{recursive:true});
  for(const [language,text]of [['zh','先统一比较的条件。再观察不同情境中的证据。最后保留一个反例。'],['en','Dr. Lee measured 3.14 cm. Next, compare one half and fifty percent. Finally, retain a counterexample.']]){
    await store.transaction(()=>{const row=store.find('classroomSessions',{id});row.lesson.steps[0].narration=text;row.contentFingerprint=classroomFingerprint(row.lesson);row.presentation=freezeClassroomPresentation(row.lesson,row.createdAt);});
    const session=(await(await call('GET',baseRoute)).json()).data,step=session.lesson.steps[0],track=session.presentation.tracks[step.id];if(track.units.length!==3)throw new Error('Expected three frozen '+language+' units');
    for(const[index,unit]of track.units.entries()){
      const started=Date.now(),response=await call('POST',baseRoute+'/narration/'+encodeURIComponent(step.id),{sentenceIndex:index,presentationVersion:track.version,unitId:unit.id}),bytes=Buffer.from(await response.arrayBuffer());
      if(!response.headers.get('content-type')?.startsWith('audio/')||bytes.length<1000)throw new Error('Invalid real audio');
      const file=path.join(artifactRoot,language+'-'+(index+1)+'.wav');fs.writeFileSync(file,bytes);
      const probe=spawnSync(process.env.STUDY_FFPROBE||'ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,sample_rate,channels','-of','json',file],{encoding:'utf8',windowsHide:true});if(probe.status!==0)throw new Error('Audio decode failed');
      const decoded=JSON.parse(probe.stdout);if(!(Number(decoded.format?.duration)>0))throw new Error('Missing real audio duration');
      receipt.samples.push({language,sentenceIndex:index,text:unit.text,unitId:unit.id,version:track.version,provider:session.speech.provider,milliseconds:Date.now()-started,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),decoded,artifact:path.relative(path.dirname(target),file).replaceAll('\\','/'),listening:'pending'});
      console.log('Real caption audio decoded: '+language+' '+(index+1)+'/3');
    }
  }
  receipt.passed=receipt.samples.length===6;
}
main().catch(error=>{receipt.error=error.message;process.exitCode=1;}).finally(async()=>{await app?.close();fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(receipt,null,2)+'\n');fs.rmSync(directory,{recursive:true,force:true});console.log(JSON.stringify(receipt,null,2));});

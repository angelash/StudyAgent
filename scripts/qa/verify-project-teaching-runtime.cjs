// One real configured TTS request through the actual project HTTP endpoint.
// Uses a temporary SQLite root and synthetic account; never production records.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'study-project-teaching-live-'));
const target=path.resolve(root,process.argv[2]??'data/qa/project-teaching-live-narration.json');
if(!target.startsWith(path.join(root,'data/qa')+path.sep))throw Error('Project teaching live report must stay in QA');
Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:'sqlite',STUDY_DATA_DIR:directory,STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'false',XIAOJIU_CHAT_ENABLED:'false'});
let app,actor;const evidence={at:new Date().toISOString(),passed:false,scope:'Synthetic independent project and one real configured TTS response; not HyperKnow audio, all voices or human listening acceptance'};
async function main(){
  require('reflect-metadata');const{NestFactory}=require('@nestjs/core');
  app=await NestFactory.create(require(path.join(root,'apps/api/dist/apps/api/src/app.module.js')).AppModule,{logger:false});app.setGlobalPrefix('api');await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  async function call(method,url,body){const response=await fetch(base+'/api'+url,{method,signal:AbortSignal.timeout(90000),headers:{'Content-Type':'application/json',...(actor?{Authorization:'Bearer '+actor.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});if(!response.ok)throw Error('Synthetic project HTTP '+response.status);return(await response.json()).data;}
  actor=await call('POST','/auth/register',{principal:'project-live-'+crypto.randomUUID()+'@local.test',credential:'Synthetic-'+crypto.randomUUID()});
  const project=await call('POST','/learning/projects',{unitId:'soc-u1'}),endpoint='/learning/projects/'+project.id,view=await call('GET',endpoint+'/teaching');
  if(!view.speech.available)throw Error('Configured project speech is unavailable');
  const stage=view.stages[0],step=stage.steps[0],unit=step.speech.units[0],before=await call('GET',endpoint),command={version:view.version,definitionFingerprint:view.definitionFingerprint,stageId:stage.stageId,stepId:step.id,sentenceIndex:0,unitId:unit.id,voice:view.speech.defaultVoice??view.speech.voices[0].id};
  const started=Date.now(),response=await fetch(base+'/api'+endpoint+'/narration',{method:'POST',signal:AbortSignal.timeout(90000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+actor.token},body:JSON.stringify(command)});
  if(!response.ok)throw Error('Real project narration HTTP '+response.status);const bytes=Buffer.from(await response.arrayBuffer()),type=response.headers.get('content-type');if(!type?.startsWith('audio/')||bytes.length<1000)throw Error('Invalid real project audio');
  fs.mkdirSync(path.dirname(target),{recursive:true});const audio=path.join(path.dirname(target),'project-teaching-live-narration.'+(type.includes('mpeg')?'mp3':'wav'));fs.writeFileSync(audio,bytes);
  const decoded=spawnSync(process.env.STUDY_FFPROBE||'ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,sample_rate,channels','-of','json',audio],{encoding:'utf8',windowsHide:true});if(decoded.status!==0)throw Error('Real project audio did not decode');
  const after=await call('GET',endpoint);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Narration changed project progress');
  Object.assign(evidence,{passed:true,version:view.version,provider:view.speech.provider,voice:command.voice,latencyMs:Date.now()-started,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),contentType:type,decoded:JSON.parse(decoded.stdout),audio:path.basename(audio),checks:{noArbitraryTextInCommand:!('text'in command),frozenUnit:unit.id,projectUnchanged:true,syntheticTemporaryStorage:true}});
}
main().catch(error=>{evidence.error=String(error.message).slice(0,200);process.exitCode=1;}).finally(async()=>{await app?.close();fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(evidence,null,2)+'\n');if(!path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe temporary project root');fs.rmSync(directory,{recursive:true,force:true});console.log(JSON.stringify(evidence));});

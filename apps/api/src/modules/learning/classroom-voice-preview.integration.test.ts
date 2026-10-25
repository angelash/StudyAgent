import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { beforeAll,afterAll,describe,it,expect,vi } from 'vitest';
import { mkdtempSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve,sep } from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import request from 'supertest';
import { Pool } from 'pg';

describe('fixed neutral voice samples before classroom teaching',()=>{
  const directory=mkdtempSync(join(tmpdir(),'study-neutral-voice-')),root=resolve(__dirname,'../../../../..');
  const names=['NODE_ENV','DATABASE_URL','STUDY_STORAGE','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','MINIMAX_API_KEY','OPENAI_API_KEY'] as const;
  const prior=Object.fromEntries(names.map(name=>[name,process.env[name]]));let app:any,store:any,speech:any,synthesis:any,actor:any,other:any,pg:Pool|undefined,schema:string|undefined;
  const manifest=JSON.parse(readFileSync(join(root,'apps/web/public/classroom-voice-samples/manifest.json'),'utf8'));
  async function call(method:'get'|'post',path:string,body?:unknown,status=method==='post'?201:200,user=actor){let q=request(app.getHttpServer())[method]('/api'+path);if(user)q=q.set('Authorization','Bearer '+user.token);if(body!==undefined)q=q.send(body as object);const result=await q;expect(result.status,JSON.stringify(result.body.error)).toBe(status);return result.body.data;}
  async function sample(id:string,voice:string,user=actor){
    return request(app.getHttpServer()).post('/api/learning/classroom/sessions/'+id+'/voice-preview').set('Authorization','Bearer '+user.token).send({voice,sampleVersion:manifest.version})
      .buffer(true).parse((response,done)=>{const chunks:Buffer[]=[];response.on('data',(bytes:Buffer)=>chunks.push(bytes));response.on('end',()=>done(null,Buffer.concat(chunks)));});
  }
  beforeAll(async()=>{
    const location=process.env.STUDY_TEST_NEUTRAL_VOICE_POSTGRES_URL;
    if(location){pg=new Pool({connectionString:location});expect((await pg.query('SELECT current_database() name')).rows[0].name).toBe('study_agent_qa');schema='study_qa_neutral_voice_'+randomUUID().replace(/-/g,'');await pg.query('CREATE SCHEMA "'+schema+'"');const url=new URL(location);url.searchParams.set('options','-c search_path='+schema);process.env.DATABASE_URL=url.toString();}
    Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:location?'postgres':'sqlite',STUDY_DATA_DIR:directory,STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'false',MINIMAX_API_KEY:'synthetic-key-never-sent',OPENAI_API_KEY:''});
    const load=(name:string)=>require('../../../dist/apps/api/src/'+name+'.js');
    app=await NestFactory.create(load('app.module').AppModule,{logger:false});app.setGlobalPrefix('api');await app.init();
    store=app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);speech=app.get(load('modules/ai/speech.service').SpeechService);
    synthesis=vi.spyOn(speech,'synthesize').mockResolvedValue({content:Buffer.from('synthetic legacy sample'),contentType:'audio/mpeg',provider:'minimax'});
    actor=await call('post','/auth/register',{principal:'voice-'+randomUUID()+'@local.test',credential:'Voice-QA-only-20261025'},201,null);
    other=await call('post','/auth/register',{principal:'voice-other-'+randomUUID()+'@local.test',credential:'Voice-QA-only-20261025'},201,null);
  });
  afterAll(async()=>{await app?.close();vi.restoreAllMocks();if(pg){try{if(!/^study_qa_neutral_voice_[a-f0-9]{32}$/.test(schema??''))throw Error('Unsafe neutral voice schema');await pg.query('DROP SCHEMA "'+schema+'" CASCADE');}finally{await pg.end();}}for(const[name,value]of Object.entries(prior)){if(value===undefined)delete process.env[name];else process.env[name]=value;}if(!resolve(directory).startsWith(resolve(tmpdir())+sep))throw Error('Unsafe neutral voice QA directory');rmSync(directory,{recursive:true,force:true});});
  it('returns six distinct original audio files before teaching without reading or changing classroom progress',async()=>{
    const row=await call('post','/learning/classroom/sessions',{lessonId:'soc-1-1-1'}),before=await store.requestContext(()=>structuredClone(store.find('classroomSessions',{id:row.id})));
    expect(row.revealed).toBe(0);expect(row.speech.voices.filter((voice:any)=>voice.classroomPreset)).toHaveLength(6);
    expect(new Set(row.speech.voices.map((voice:any)=>voice.id)).size).toBe(row.speech.voices.length);
    for(const voice of manifest.voices){const response=await sample(row.id,voice.voiceId);expect(response.status).toBe(201);expect(response.headers['content-type']).toContain('audio/mpeg');expect(response.body.length).toBe(voice.bytes);expect(createHash('sha256').update(response.body).digest('hex')).toBe(voice.sha256);}
    expect(synthesis).not.toHaveBeenCalled();await store.requestContext(()=>expect(store.find('classroomSessions',{id:row.id})).toEqual(before));
  });
  it('rejects arbitrary text, unknown voice, stale version, anonymous and other-family access',async()=>{
    const row=await call('post','/learning/classroom/sessions',{lessonId:'soc-1-1-2'}),path='/learning/classroom/sessions/'+row.id+'/voice-preview',valid={voice:manifest.voices[0].voiceId,sampleVersion:manifest.version};
    for(const value of [{...valid,text:'future private narration'},{...valid,path:'../../private'},{...valid,voice:'../../unknown'},{...valid,sampleVersion:'old-sample'}])await call('post',path,value,400);
    await call('post',path,valid,401,null);await call('post',path,valid,403,other);expect(synthesis).not.toHaveBeenCalled();
  });
  it('keeps legacy voices available with a fixed neutral sentence and forwards cancellation',async()=>{
    const row=await call('post','/learning/classroom/sessions',{lessonId:'soc-1-1-3'}),legacy='Chinese (Mandarin)_Soft_Girl';
    expect(row.speech.voices.find((voice:any)=>voice.id===legacy)).toBeDefined();const response=await sample(row.id,legacy);expect(response.status).toBe(201);
    expect(synthesis).toHaveBeenCalledWith(manifest.text,legacy,expect.any(AbortSignal));
    const controller=new AbortController();controller.abort();await expect(speech.preview(legacy,manifest.version,controller.signal)).rejects.toThrow('试听已停止');
    expect(synthesis).toHaveBeenCalledTimes(1);
  });
  it('allows a real learning-code identity only its own sample and refuses it immediately after learning access is revoked',async()=>{
    const studentId=(await call('post','/students',{nickname:'匿名声音验证',grade:4,preferredSessionMinutes:10,defaultVersionMap:{math:'',chinese:'',english:''}})).profile.id;
    const access=await call('post','/students/'+studentId+'/learning-access',{enabled:true,expectedVersion:0,requestKey:randomUUID(),reason:'合成测试中的课堂声音学习授权'});
    const code=await call('post','/students/'+studentId+'/learning-access/codes',{expectedVersion:access.version,requestKey:randomUUID()}),learner=await call('post','/auth/learning-code',{code:code.code},201,null);
    const row=await call('post','/learning/classroom/sessions',{lessonId:'soc-1-2-1'});
    // Synthetic ownership setup exercises the real learner authorization without publishing this adult course for children.
    await store.transaction(()=>{const saved=store.find('classroomSessions',{id:row.id});saved.ownerUserId=learner.user.id;saved.studentId=studentId;});
    expect((await sample(row.id,manifest.voices[0].voiceId,learner)).status).toBe(201);
    await call('post','/learning/classroom/sessions/'+row.id+'/voice-preview',{voice:manifest.voices[0].voiceId,sampleVersion:manifest.version},403);
    await call('post','/students/'+studentId+'/learning-access',{enabled:false,expectedVersion:access.version,requestKey:randomUUID(),reason:'合成测试撤回当前学习设备的授权'});
    const blocked=await sample(row.id,manifest.voices[0].voiceId,learner);expect([401,403]).toContain(blocked.status);
  });
});

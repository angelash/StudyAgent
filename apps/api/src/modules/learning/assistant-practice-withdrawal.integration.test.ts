import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import sharp from 'sharp';

describe('immutable teaching assignment withdrawal HTTP and native recovery', () => {
  const root = resolve(process.cwd(), '../..'), qa = join(root, 'data/qa'); mkdirSync(qa, { recursive: true });
  const folder = mkdtempSync(join(qa, 'wd-')), sourceData = join(folder, 's');
  const names = ['NODE_ENV','DATABASE_URL','STUDY_STORAGE','STUDY_DATA_DIR','STUDY_SEED_FOUNDATION','STUDY_WORKER_ENABLED','XIAOJIU_CHAT_ENABLED'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const configured = process.env.STUDY_TEST_PRACTICE_WITHDRAWAL_POSTGRES_URL, engine = configured ? 'postgres' : 'sqlite', databases: string[] = [];
  const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  const operation = (name: string) => require(join(root, 'scripts/operations/' + name + '.cjs'));
  let app: any, store: any, admin: Pool | undefined, sourceUrl = '', currentUrl = '', currentData = '';
  let withdrawalBackup = '', withdrawalFixture: any, withdrawalAnswer: any, withdrawalStart: any;
  const providers: any[] = [];
  async function newDatabase() {
    if (!configured) return '';
    const target = new URL(configured), control = new URL(process.env.STUDY_TEST_POSTGRES_ADMIN_URL!);
    expect(target.hostname).toBe('127.0.0.1'); expect(target.pathname).toBe('/study_agent_qa');
    expect(target.port).toBe(process.env.CI === 'true' ? '5432' : '15439'); expect(control.hostname).toBe(target.hostname); expect(control.port).toBe(target.port);
    admin ??= new Pool({ connectionString: control.toString() }); expect((await admin.query('SELECT current_user name')).rows[0].name).toBe('study_qa_admin');
    const name = 'study_qa_withdraw_' + randomUUID().replaceAll('-', ''); await admin.query('CREATE DATABASE "' + name + '" OWNER study_agent_app'); databases.push(name);
    target.pathname = '/' + name; return target.toString();
  }
  async function boot(url: string, directory: string, seed = false) {
    Object.assign(process.env, { NODE_ENV:'development',DATABASE_URL:url,STUDY_STORAGE:engine,STUDY_DATA_DIR:directory,STUDY_SEED_FOUNDATION:String(seed),STUDY_WORKER_ENABLED:'false',XIAOJIU_CHAT_ENABLED:'false' });
    app = await NestFactory.create(load('app.module').AppModule, { logger:false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService); currentUrl = url; currentData = directory;
    const chat = app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService);
    providers.push(vi.spyOn(chat,'reply').mockRejectedValue(Error('No model in withdrawal QA')),vi.spyOn(chat,'structured').mockRejectedValue(Error('No model in withdrawal QA')));
  }
  const assignmentPath = (id: string) => '/learning/assistant-practice/assignments/' + id;
  const activityPath = (id: string) => '/learning/assistant-practice/sessions/' + id;
  async function call(method: 'get'|'post'|'patch'|'put', path: string, body?: unknown, actor?: any, expected = method === 'post' ? 201 : 200, target = app) {
    let query = request(target.getHttpServer())[method]('/api' + path);
    if (actor) query = query.set('Authorization','Bearer ' + actor.token);
    if (body !== undefined) query = query.send(body as object);
    const reply = await query; expect(reply.status, path + ':' + JSON.stringify(reply.body.error)).toBe(expected); return reply.body.data;
  }
  async function register() {
    const principal = 'withdraw-' + randomUUID() + '@local.test', credential = 'Owned-withdraw-' + randomUUID();
    return { ...await call('post','/auth/register',{principal,credential}), principal, credential };
  }
  async function login(actor: any) { actor.token = (await call('post','/auth/login',{principal:actor.principal,credential:actor.credential})).token; }
  async function learnerIdentity(studentId: string, owner: any) {
    let access = await call('get','/students/' + studentId + '/learning-access',undefined,owner);
    if (access.status !== 'enabled') access = await call('post','/students/' + studentId + '/learning-access',{enabled:true,expectedVersion:access.version,requestKey:randomUUID(),reason:'仅验证隔离真实本人入口'},owner);
    const code = await call('post','/students/' + studentId + '/learning-access/codes',{expectedVersion:access.version,requestKey:randomUUID()},owner);
    return call('post','/auth/learning-code',{code:code.code});
  }
  async function fixture(media = false) {
    const owner = await register(), other = await register(), outsider = await register();
    const child = (await call('post','/students',{nickname:'匿名撤回验收',grade:4,preferredSessionMinutes:15,defaultVersionMap:{math:'',chinese:'',english:''}},owner)).profile;
    const atomIds: string[] = [], nonce = randomUUID();
    await store.transaction(() => {
      store.append('bindings',{id:randomUUID(),parentUserId:other.user.id,studentId:child.id,relation:'guardian',status:'active'});
      const template = load('modules/diagnostics/curriculum.service').eligibleMeasurements(store).find((item: any) => {
        const atom = store.find('knowledgeAtoms',{id:item.atomId}); return atom?.subject === 'math' && atom.grade <= 4 && store.find('questionAnswerSchemas',{questionId:item.questionId})?.mode === 'numeric_blank';
      }); expect(template).toBeTruthy();
      const definitions = load('modules/diagnostics/measurement-definition');
      for (let group = 0; group < 3; group++) {
        const atom = {...structuredClone(store.find('knowledgeAtoms',{id:template.atomId})),id:'qa-wd-' + nonce + '-' + group,
          name:'匿名条件核对' + group,grade:4,term:'upper',objective:'核对相同单位与数量条件',successCriterion:'明确理由后解释数量判断',prerequisiteIds:[],version:1,status:'published'};
        delete atom.parentId; store.append('knowledgeAtoms',atom); atomIds.push(atom.id);
        for (let index = 0; index < 2; index++) {
          const id = atom.id + '-q' + index, question = {...structuredClone(store.find('questions',{id:template.questionId})),id,stem:'有2盒，每盒2个。一共有多少个？',answer:'4',analysis:'核对每盒数量相同，再计算2×2。'};
          const document = {...structuredClone(store.find('questionDocuments',{questionId:template.questionId})),questionId:id,blocks:[{id:'text',type:'text',text:question.stem}],attachments:[]};
          const schema = {...structuredClone(store.find('questionAnswerSchemas',{questionId:template.questionId})),questionId:id};
          if (media && group === 0) { question.type=index === 0?'subjective':'oral';question.answer='由教师核对解释';schema.mode=index === 0?'image_upload':'audio_record';schema.options=[];schema.responseShape={mediaPolicy:'student-media-v1'};schema.gradingConfig={}; }
          const source = {...structuredClone(store.find('questionSources',{questionId:template.questionId})),id:id+'-source',questionId:id,sourcePathOrUrl:'owned-synthetic-original',notes:null,importJobId:null};
          store.append('questions',question);store.append('questionDocuments',document);store.append('questionAnswerSchemas',schema);store.append('questionSources',source);
          store.append('measurementItems',{...structuredClone(template),id:id+'-mapping',questionId:id,atomId:atom.id,questionVersion:1,family:id+'-structure',
            atomDefinitionFingerprint:definitions.atomDefinitionFingerprint(atom),contentFingerprint:definitions.questionContentFingerprint(store,id)});
        }
      }
    });
    await call('put','/students/'+child.id+'/learning-scope',{subject:'math',grade:4,term:'upper',textbookVolumeId:null,textbookVersion:'合成撤回验收范围',learnedAtomIds:atomIds,currentAtomId:atomIds[0],minutesPerSession:15},owner);
    const source = await call('post','/ai/assistant/sessions',{userRole:'parent',studentId:null,subject:null,pageContext:'studio'},owner), messageId=randomUUID();
    await store.transaction(() => store.append('assistantMessages',{id:messageId,sessionId:source.id,sender:'user',content:'完整匿名原问题：先核对相同单位，再说明数量条件。',createdAt:new Date().toISOString()}));
    const input={selection:{messageIds:[messageId],includeLinkedQuestions:false},objective:'保留本人原答案及理由，逐组核对条件',audience:{kind:'student',studentId:child.id,subject:'math',targetAtomIds:atomIds},acknowledgeHistoricalSource:false,acknowledgeAudienceTransfer:true};
    const path='/ai/assistant/sessions/'+source.id+'/artifacts/practice',preview=await call('post',path+'/preflight',input,owner,200);
    expect(preview.canPrepareTeachingPractice).toBe(true);
    const artifact=await call('post',path+'/candidates',{...input,contentMode:'reviewed_bank',preflightFingerprint:preview.fingerprint,requestKey:randomUUID()},owner);
    const createCommand={studentId:child.id,expectedRevision:artifact.revision,contentFingerprint:artifact.contentFingerprint,acknowledgePreview:true,requestKey:randomUUID()};
    const created=await call('post','/learning/assistant-practice/artifacts/'+artifact.artifactId+'/assignments',createCommand,owner);
    const assignment=await call('get',assignmentPath(created.assignmentId),undefined,owner),learner=await learnerIdentity(child.id,owner);
    return {owner,other,outsider,child,learner,source,artifact,createCommand,created,assignment,atomIds};
  }
  const withdrawCommand = (f: any) => ({expectedStateVersion:0,assignmentFingerprint:f.assignment.payloadFingerprint,reason:'明确撤回本次教学安排，保留已经发生的答案与理由。',requestKey:randomUUID()});
  async function start(f: any,index=0) {
    const command={assignmentFingerprint:f.assignment.payloadFingerprint,requestKey:randomUUID()},path=assignmentPath(f.assignment.id)+'/groups/'+encodeURIComponent(f.atomIds[index])+'/start';
    return {command,path,receipt:await call('post',path,command,f.learner)};
  }
  async function answer(f: any,sessionId: string,index=0) {
    const question=f.assignment.groups[0].questions[index].question.id,path=activityPath(sessionId),render=await call('get',path+'/questions/'+question,undefined,f.learner),state=render.draftState;
    const draft={protocol:'assistant-practice-answer-v1',actorId:state.actorId,expectedRevision:state.revision,baseHash:state.baseHash,attempt:state.attempt,
      answer:{questionId:question,mode:'numeric_blank',response:{value:'4'}},learnerExplanation:'首次理由保留：每盒数量相同，因此2×2。',requestKey:randomUUID()};
    const saved=await call('patch',path+'/questions/'+question+'/draft',draft,f.learner),fence=saved.draftState;
    const command={protocol:'assistant-practice-answer-v1',questionId:question,answer:draft.answer,learnerExplanation:draft.learnerExplanation,disposition:'answered',elapsedMs:1100,requestKey:randomUUID(),
      draftFence:{actorId:fence.actorId,revision:fence.revision,baseHash:fence.baseHash,attempt:fence.attempt}};
    return {question,draft,saved,command,receipt:await call('post',path+'/responses',command,f.learner)};
  }
  async function backup(destination: string) {
    if(engine==='sqlite')await operation('backup').createBundle({dataDir:currentData,destination});
    else await operation('postgres-backup').createPostgresBundle({dataDir:currentData,destination,connectionString:currentUrl,pgBin:process.env.STUDY_TEST_PG_BIN});
  }
  async function restore(bundle: string,label: string,deletionLedger?: string) {
    const destination=join(folder,label),url=await newDatabase();
    if(engine==='sqlite')await operation('backup').restoreBundle({bundle,destination,deletionLedger});
    else await operation('postgres-backup').restorePostgresBundle({bundle,destination,deletionLedger,connectionString:url,pgBin:process.env.STUDY_TEST_PG_BIN});
    await boot(url,destination);
  }
  beforeAll(async () => { sourceUrl=await newDatabase();await boot(sourceUrl,sourceData,true); },120000);
  afterAll(async () => {
    try { providers.forEach(mock=>expect(mock).not.toHaveBeenCalled()); }
    finally {
      vi.restoreAllMocks();await app?.close();
      if(admin){for(const name of databases){if(!/^study_qa_withdraw_[a-f0-9]{32}$/.test(name))throw Error('Unsafe owned database');await admin.query('DROP DATABASE "'+name+'" WITH (FORCE)');}await admin.end();}
      for(const [name,value] of Object.entries(previous)){if(value===undefined)delete process.env[name];else process.env[name]=value;}
      if(!resolve(folder).startsWith(resolve(qa)+sep))throw Error('Unsafe owned QA directory');rmSync(folder,{recursive:true,force:true});
    }
  });
  it('withdraws all unstarted groups once without changing the immutable arrangement or private creation receipt',async()=>{
    const f=await fixture(),before=structuredClone((await store.database.read()).state.assistantPracticeAssignments.find((row:any)=>row.id===f.assignment.id)),command=withdrawCommand(f),path=assignmentPath(f.assignment.id);
    const receipt=await call('post',path+'/withdraw',command,f.owner);
    expect(await call('post',path+'/withdraw',command,f.owner)).toEqual(receipt);
    expect(await call('post','/learning/assistant-practice/artifacts/'+f.artifact.artifactId+'/assignments',f.createCommand,f.owner)).toEqual(f.created);
    expect((await store.database.read()).state.assistantPracticeAssignments.find((row:any)=>row.id===f.assignment.id)).toEqual(before);
    const learner=await call('get',path,undefined,f.learner);
    expect(learner).toMatchObject({assignmentState:'withdrawn',stateVersion:1,startingAvailable:false,withdrawal:{reason:command.reason}});
    expect(learner.groupActivities.every((group:any)=>!group.canStart&&group.status==='not_started')).toBe(true);
    for(let index=0;index<3;index++)await call('post',path+'/groups/'+encodeURIComponent(f.atomIds[index])+'/start',{assignmentFingerprint:f.assignment.payloadFingerprint,requestKey:randomUUID()},f.learner,409);
    await call('post',path+'/withdraw',{...command,reason:'另一份撤回说明不能覆盖原件。'},f.owner,409);
    await call('post',path+'/withdraw',{...command,requestKey:randomUUID()},f.other,409);
    const text=JSON.stringify(await call('get','/learning/assistant-practice/assignments?studentId='+f.child.id+'&subject=math',undefined,f.other));
    expect(text).toContain(command.reason);expect(text).not.toContain(command.requestKey);expect(text).not.toContain(f.artifact.artifactId);
  });
  it('checks actual guardian authority and strict inputs before replaying a known successful withdrawal',async()=>{
    const f=await fixture(),path=assignmentPath(f.assignment.id)+'/withdraw',command=withdrawCommand(f);
    await call('post',path,command,f.learner,403);await call('post',path,command,f.outsider,403);
    for(const extra of [{actorUserId:f.owner.user.id},{withdrawnAt:new Date().toISOString()},{stateVersion:1}])await call('post',path,{...command,...extra},f.owner,400);
    await call('post',path,{...command,assignmentFingerprint:'0'.repeat(64)},f.owner,409);await call('post',path,{...command,reason:'短'},f.owner,400);
    await call('post',path,command,f.other);
    await store.transaction(()=>{store.find('bindings',{parentUserId:f.other.user.id,studentId:f.child.id}).status='inactive';});
    await call('post',path,command,f.other,403);expect((await call('get',assignmentPath(f.assignment.id),undefined,f.owner)).assignmentState).toBe('withdrawn');
  });
  it('keeps original starts, saves, first answers, help and completed receipts readable while stopping new writes',async()=>{
    const f=await fixture(),started=await start(f),first=await answer(f,started.receipt.sessionId),path=activityPath(started.receipt.sessionId);
    let render=await call('get',path+'/questions/'+first.question,undefined,f.learner);
    const help={protocol:'assistant-practice-answer-v1',kind:'hint',expectedAttempt:render.draftState.attempt,baseHash:render.draftState.baseHash,requestKey:randomUUID()};
    const helped=await call('post',path+'/questions/'+first.question+'/help',help,f.learner);
    await answer(f,started.receipt.sessionId,1);const current=await call('get',path,undefined,f.learner);
    const complete={protocol:'assistant-practice-answer-v1',completionFingerprint:current.completionFingerprint,requestKey:randomUUID()},completed=await call('post',path+'/complete',complete,f.learner);
    await call('post',assignmentPath(f.assignment.id)+'/withdraw',withdrawCommand(f),f.owner);
    expect(await call('post',started.path,started.command,f.learner)).toEqual(started.receipt);
    expect(await call('patch',path+'/questions/'+first.question+'/draft',first.draft,f.learner)).toMatchObject({acknowledgedRevision:first.saved.acknowledgedRevision,savedAt:first.saved.savedAt});
    expect(await call('post',path+'/responses',first.command,f.learner)).toEqual(first.receipt);
    expect(await call('post',path+'/questions/'+first.question+'/help',help,f.learner)).toEqual(helped);
    expect(await call('post',path+'/complete',complete,f.learner)).toEqual(completed);
    const view=await call('get',path,undefined,f.learner);expect(view).toMatchObject({status:'completed',writable:false,assignmentState:'withdrawn'});
    expect(view.questions[0].attemptHistory[0].learnerExplanation).toBe(first.draft.learnerExplanation);
    await call('post',path+'/responses',{...first.command,requestKey:randomUUID()},f.learner,409);
    await call('post',path+'/questions/'+first.question+'/help',{...help,requestKey:randomUUID()},f.learner,409);
    await call('patch',path+'/questions/'+first.question+'/draft',{...first.draft,requestKey:randomUUID()},f.learner,409);
    await call('post',path+'/complete',{...complete,requestKey:randomUUID()},f.learner,409);
    expect(view.summary.independentFirstPass).toBe(0);
  });
  it('serializes same-key and different-guardian races across two actual application instances',async()=>{
    const f=await fixture(),g=await fixture(),peer=await NestFactory.create(load('app.module').AppModule,{logger:false});peer.setGlobalPrefix('api');await peer.init();
    try{
      const command=withdrawCommand(f),path=assignmentPath(f.assignment.id)+'/withdraw';
      const [one,two]=await Promise.all([call('post',path,command,f.owner),call('post',path,command,f.owner,201,peer)]);expect(two).toEqual(one);
      const target=assignmentPath(g.assignment.id)+'/withdraw',left=withdrawCommand(g),right={...withdrawCommand(g),reason:'另一合法监护人的独立撤回说明。'};
      const replies=await Promise.all([request(app.getHttpServer()).post('/api'+target).set('Authorization','Bearer '+g.owner.token).send(left),
        request(peer.getHttpServer()).post('/api'+target).set('Authorization','Bearer '+g.other.token).send(right)]);
      expect(replies.map(reply=>reply.status).sort()).toEqual([201,409]);
      const state=(await store.database.read()).state;expect(state.assistantPracticeAssignmentWithdrawals.filter((row:any)=>row.assignmentId===g.assignment.id)).toHaveLength(1);
    }finally{await peer.close();}
  },120000);
  it('prevents an actual late PNG normalization from publishing a writable attachment after withdrawal',async()=>{
    const f=await fixture(true),started=await start(f),question=f.assignment.groups[0].questions.find((item:any)=>item.payload.answerSchema.mode==='image_upload').question.id;
    const bytes=await sharp({create:{width:96,height:64,channels:3,background:'#7187a9'}}).png().toBuffer();
    const file=await call('post','/learning/media',{kind:'practice',sessionId:started.receipt.sessionId,itemId:question,name:'owned.png',mediaType:'image/png',size:bytes.length,requestKey:randomUUID()},f.learner);
    await request(app.getHttpServer()).put('/api/learning/media/'+file.id+'/chunks/0').set('Authorization','Bearer '+f.learner.token).set('Content-Type','application/octet-stream').send(bytes).expect(200);
    let entered!:()=>void,release!:()=>void;const waiting=new Promise<void>(resolve=>entered=resolve),gate=new Promise<void>(resolve=>release=resolve),normalization=load('modules/student-media/media-normalization'),original=normalization.withMediaDecoder;
    const spy=vi.spyOn(normalization,'withMediaDecoder').mockImplementation(async(fn:any)=>{const result=await original(fn);entered();await gate;return result;});
    const completing=request(app.getHttpServer()).post('/api/learning/media/'+file.id+'/complete').set('Authorization','Bearer '+f.learner.token).send({}).then(reply=>reply);
    try{await waiting;await call('post',assignmentPath(f.assignment.id)+'/withdraw',withdrawCommand(f),f.other);release();expect((await completing).status).toBe(409);
      expect((await store.database.read()).state.studentMedia.find((row:any)=>row.id===file.id).status).toBe('uploading');
      await call('post','/learning/media/'+file.id+'/complete',{},f.learner,409);
      const view=await call('get',activityPath(started.receipt.sessionId),undefined,f.learner);expect(view).toMatchObject({status:'in_progress',writable:false,assignmentState:'withdrawn'});
    }finally{release();spy.mockRestore();}
  },120000);
  it('cold restores withdrawal, original reasons and original acknowledgements through the native database bundle',async()=>{
    const f=await fixture(),started=await start(f),first=await answer(f,started.receipt.sessionId),command=withdrawCommand(f);
    const withdrawn=await call('post',assignmentPath(f.assignment.id)+'/withdraw',command,f.owner);
    withdrawalFixture=f;withdrawalAnswer=first;withdrawalStart=started;
    withdrawalBackup=join(folder,'native-withdrawal-bundle');
    await app.close();app=undefined;await backup(withdrawalBackup);await restore(withdrawalBackup,'restored-withdrawal');
    await call('get','/auth/me',undefined,f.owner,401);await login(f.owner);
    expect(await call('post',assignmentPath(f.assignment.id)+'/withdraw',command,f.owner)).toEqual(withdrawn);
    f.learner=await learnerIdentity(f.child.id,f.owner);
    expect(await call('post',started.path,started.command,f.learner)).toEqual(started.receipt);
    expect(await call('post',activityPath(started.receipt.sessionId)+'/responses',first.command,f.learner)).toEqual(first.receipt);
    const view=await call('get',activityPath(started.receipt.sessionId),undefined,f.learner);
    expect(view).toMatchObject({status:'in_progress',writable:false,assignmentState:'withdrawn',withdrawal:{reason:command.reason}});
    expect(view.questions.find((item:any)=>item.id===first.question).attemptHistory[0].learnerExplanation).toBe(first.draft.learnerExplanation);
    const state=(await store.database.read()).state,rows=Object.entries(state).flatMap(([collection,items])=>(items as any[]).map(body=>({collection,record_id:body.id,body})));
    expect(()=>load('modules/learning/assistant-practice-integrity').assertAssistantPracticeRecords(rows)).not.toThrow();
  },180000);
  it('rejects reassigned or falsely anonymized withdrawal records even after native bundle hashes are recomputed',async()=>{
    const f=withdrawalFixture,original=(await store.database.read()).state.assistantPracticeAssignmentWithdrawals.find((row:any)=>row.assignmentId===f.assignment.id);
    const records=load('modules/learning/assistant-practice-withdrawal-record');
    for(const mode of ['association','anonymous'] as const){
      const changed=structuredClone(original);
      if(mode==='association'){changed.assignmentId='foreign-arrangement';changed.receipt.assignmentId=changed.assignmentId;changed.requestHash=records.withdrawalRequestHash(changed.actorFingerprint,changed.assignmentId,changed.input);}
      else changed.actorUserId=null;
      expect(()=>records.assertAssistantPracticeWithdrawal(changed)).not.toThrow();
      if(engine==='sqlite'){
        const bundle=join(folder,'damaged-withdrawal-'+mode);cpSync(withdrawalBackup,bundle,{recursive:true,errorOnExist:true});
        const manifestFile=join(bundle,'manifest.json'),manifest=JSON.parse(readFileSync(manifestFile,'utf8')),databaseFile=manifest.files.find((file:any)=>file.path.endsWith('.sqlite3'));
        const location=join(bundle,databaseFile.path),database=new DatabaseSync(location);
        try{database.prepare("UPDATE domain_records SET body=? WHERE collection='assistantPracticeAssignmentWithdrawals' AND record_id=?").run(JSON.stringify(changed),original.id);}finally{database.close();}
        const bytes=readFileSync(location);databaseFile.size=bytes.length;databaseFile.sha256=createHash('sha256').update(bytes).digest('hex');writeFileSync(manifestFile,JSON.stringify(manifest));
        await expect(operation('backup').verifyBundle({bundle})).rejects.toThrow('assistant_practice_saved_integrity_failed');
      }else{
        const pool=new Pool({connectionString:currentUrl,max:1});
        try{await pool.query("UPDATE domain_records SET body=$1::jsonb WHERE collection='assistantPracticeAssignmentWithdrawals' AND record_id=$2",[JSON.stringify(changed),original.id]);
          await expect(operation('postgres-backup').createPostgresBundle({dataDir:currentData,destination:join(folder,'damaged-pg-withdrawal-'+mode),connectionString:currentUrl,pgBin:process.env.STUDY_TEST_PG_BIN})).rejects.toThrow('assistant_practice_saved_integrity_failed');
        }finally{await pool.query("UPDATE domain_records SET body=$1::jsonb WHERE collection='assistantPracticeAssignmentWithdrawals' AND record_id=$2",[JSON.stringify(original),original.id]);await pool.end();}
      }
    }
  },180000);
  it('exports only shared withdrawal reasons and reapplies the latest author and child deletion ledgers to an old bundle',async()=>{
    const f=await fixture(),command=withdrawCommand(f);await call('post',assignmentPath(f.assignment.id)+'/withdraw',command,f.owner);
    const portable=await call('post','/privacy/students/'+f.child.id+'/export',{credential:f.other.credential,requestKey:randomUUID()},f.other),exported=portable.students[0].records.assistantPracticeAssignmentWithdrawals[0];
    expect(exported.reason).toBe(command.reason);expect(exported.requestKey).toBeUndefined();expect(exported.input).toBeUndefined();expect(exported.actorUserId).toBeUndefined();expect(exported.requestHash).toBeUndefined();
    const bundle=join(folder,'before-withdrawal-author-deletion'),url=currentUrl,data=currentData;
    await app.close();app=undefined;await backup(bundle);await boot(url,data);await login(f.owner);
    let preview=await call('get','/privacy/account/deletion-preview',undefined,f.owner);
    await call('post','/privacy/account/delete',{credential:f.owner.credential,confirmation:preview.confirmation,fingerprint:preview.fingerprint,requestKey:randomUUID()},f.owner);
    const authorLedger=join(folder,'withdrawal-author-ledger.json');
    await operation('privacy-ledger').exportLedger({dataDir:currentData,connectionString:engine==='postgres'?currentUrl:undefined,destination:authorLedger});
    await app.close();app=undefined;await restore(bundle,'author-ledger-restored',authorLedger);
    const retained=store.inspect('assistantPracticeAssignmentWithdrawals').find((row:any)=>row.assignmentId===f.assignment.id);
    expect(retained.actorUserId).toBeNull();expect(retained.input.reason).toBe(command.reason);expect(store.inspect('users').some((row:any)=>row.id===f.owner.user.id)).toBe(false);
    await login(f.other);expect((await call('get',assignmentPath(f.assignment.id),undefined,f.other)).assignmentState).toBe('withdrawn');
    preview=await call('get','/privacy/students/'+f.child.id+'/deletion-preview',undefined,f.other);
    await call('post','/privacy/students/'+f.child.id+'/delete',{credential:f.other.credential,confirmation:preview.confirmation,fingerprint:preview.fingerprint,requestKey:randomUUID()},f.other);
    const childLedger=join(folder,'withdrawal-child-ledger.json');
    await operation('privacy-ledger').exportLedger({dataDir:currentData,connectionString:engine==='postgres'?currentUrl:undefined,destination:childLedger});
    await app.close();app=undefined;await restore(bundle,'child-ledger-restored',childLedger);
    for(const collection of ['assistantPracticeAssignmentWithdrawals','assistantPracticeAssignments','assistantPracticeGroupStarts','practiceSessions'])expect(store.inspect(collection).some((row:any)=>row.studentId===f.child.id)).toBe(false);
    expect(store.inspect('students').some((row:any)=>row.id===f.child.id)).toBe(false);
  },180000);
});

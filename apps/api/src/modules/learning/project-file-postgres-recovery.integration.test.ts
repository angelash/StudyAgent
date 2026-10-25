import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {Pool} from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtempSync,mkdirSync,existsSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import request from 'supertest';

const location=process.env.STUDY_TEST_PROJECT_FILES_POSTGRES_URL;
(location?describe:describe.skip)('project actual native PostgreSQL backup, file recovery and latest privacy deletion',()=>{
  const root=location?mkdtempSync(join(tmpdir(),'study-pg-project-files-')):'',databases:string[]=[],names=['NODE_ENV','DATABASE_URL','STUDY_STORAGE','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','XIAOJIU_CHAT_ENABLED'] as const,prior=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  let app:any,store:any,worker:any,admin:Pool;
  const credential='Native-file-recovery-QA-20261025',principal='pg-files-recovery@test',repo=join(process.cwd(),'../..');
  const backup=require(join(repo,'scripts/operations/postgres-backup.cjs')),privacyLedger=require(join(repo,'scripts/operations/privacy-ledger.cjs'));
  async function database(){const name='study_qa_project_recovery_'+randomUUID().replace(/-/g,'');await admin.query('CREATE DATABASE "'+name+'" OWNER study_agent_app');databases.push(name);const url=new URL(location!);url.pathname='/'+name;return url.toString();}
  async function boot(url:string,directory:string){Object.assign(process.env,{NODE_ENV:'development',DATABASE_URL:url,STUDY_STORAGE:'postgres',STUDY_DATA_DIR:directory,STUDY_WORKER_ENABLED:'false',STUDY_SEED_FOUNDATION:'false',XIAOJIU_CHAT_ENABLED:'false'});const{AppModule}=require('../../../dist/apps/api/src/app.module.js');app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api');await app.init();store=app.get(require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js').InMemoryStoreService);worker=app.get(require('../../../dist/apps/api/src/modules/learning/project-file-worker.service.js').ProjectFileWorkerService);}
  async function call(method:'get'|'post',path:string,body:unknown,token?:string,status=method==='post'?201:200){let q=request(app.getHttpServer())[method]('/api'+path);if(token)q=q.set('Authorization','Bearer '+token);if(body!==undefined)q=q.send(body as object);const response=await q;expect(response.status,JSON.stringify(response.body.error)).toBe(status);return response.body.data;}
  beforeAll(async()=>{const probe=new Pool({connectionString:location});try{expect((await probe.query('SELECT current_database() AS name,current_user AS owner')).rows[0]).toEqual({name:'study_agent_qa',owner:'study_agent_app'});}finally{await probe.end();}if(!process.env.STUDY_TEST_POSTGRES_ADMIN_URL)throw Error('Dedicated QA administration required');admin=new Pool({connectionString:process.env.STUDY_TEST_POSTGRES_ADMIN_URL});expect((await admin.query('SELECT current_user AS name')).rows[0].name).toBe('study_qa_admin');});
  afterAll(async()=>{await app?.close();if(admin){try{for(const name of databases){if(!/^study_qa_project_recovery_[a-f0-9]{32}$/.test(name))throw Error('Unsafe project QA database');await admin.query('DROP DATABASE "'+name+'" WITH (FORCE)');}}finally{await admin.end();}}for(const[name,value]of Object.entries(prior)){if(value===undefined)delete process.env[name];else process.env[name]=value;}if(!resolve(root).startsWith(resolve(tmpdir())+sep))throw Error('Unsafe file QA directory');rmSync(root,{recursive:true,force:true});});
  it('reopens the actual recovered project and original bytes, then applies a newer deletion ledger to that older native backup',async()=>{
    const sourceUrl=await database(),source=join(root,'source'),targetUrl=await database(),target=join(root,'target'),deletedUrl=await database(),deleted=join(root,'deleted'),bundle=join(root,'bundle'),ledger=join(root,'deletions.json');mkdirSync(source);
    await boot(sourceUrl,source);let actor=await call('post','/auth/register',{principal,credential});let project=await call('post','/learning/projects',{unitId:'soc-u1'},actor.token);
    const bytes=Buffer.from('Native PostgreSQL original project evidence\n12 / 3 = 4'),sha256=createHash('sha256').update(bytes).digest('hex'),stageId=project.currentStageId;
    const upload=await call('post','/learning/project-files/uploads',{projectId:project.id,stageId,definitionFingerprint:project.definition.fingerprint,name:'native-evidence.txt',size:bytes.length,mediaType:'text/plain',sha256,requestKey:randomUUID()},actor.token);
    await request(app.getHttpServer()).put('/api/learning/project-files/uploads/'+upload.id+'/chunks/0').set('Authorization','Bearer '+actor.token).set('Content-Type','application/octet-stream').send(bytes).expect(200);
    const completed=await call('post','/learning/project-files/uploads/'+upload.id+'/complete',{},actor.token);for(let i=0;i<10;i++){if((await call('get','/learning/project-files/assets/'+completed.asset.id,undefined,actor.token)).status==='ready')break;await worker.runNext(false);}
    const file=await call('get','/learning/project-files/assets/'+completed.asset.id,undefined,actor.token);expect(file.status).toBe('ready');
    const artifact={values:Object.fromEntries(project.definition.stages[0].fields.map((field:any)=>[field.id,'区分条件并核对原件'])),evidence:[],attachments:[{assetId:file.id,label:'原始记录',caption:'真实原件'}]},ratings=project.definition.rubric.map((criterion:any)=>({criterionId:criterion.id,level:1,evidence:'原件中保存了过程',attachmentIds:[file.id]}));
    project=await call('post','/learning/projects/'+project.id+'/submissions',{expectedRevision:project.revision,requestKey:randomUUID(),stageId,artifact,selfRatings:ratings,revisionNote:''},actor.token);const frozen=structuredClone(project.submissions[0]);
    await backup.createPostgresBundle({connectionString:sourceUrl,pgBin:process.env.STUDY_TEST_PG_BIN,dataDir:source,destination:bundle});await app.close();app=null;
    await backup.restorePostgresBundle({connectionString:targetUrl,pgBin:process.env.STUDY_TEST_PG_BIN,bundle,destination:target});expect(readFileSync(join(target,'project-assets',file.id,file.original.name))).toEqual(bytes);
    await boot(targetUrl,target);actor=await call('post','/auth/login',{principal,credential});expect((await call('get','/learning/projects/'+project.id,undefined,actor.token)).submissions[0]).toEqual(frozen);const restored=await call('get','/learning/project-files/assets/'+file.id,undefined,actor.token);expect(restored.original.sha256).toBe(sha256);
    const preview=await call('get','/privacy/account/deletion-preview',undefined,actor.token);await call('post','/privacy/account/delete',{credential,confirmation:preview.confirmation,fingerprint:preview.fingerprint,requestKey:randomUUID()},actor.token);await privacyLedger.exportLedger({connectionString:targetUrl,destination:ledger});await app.close();app=null;
    await backup.restorePostgresBundle({connectionString:deletedUrl,pgBin:process.env.STUDY_TEST_PG_BIN,bundle,destination:deleted,deletionLedger:ledger});expect(existsSync(join(deleted,'project-assets',file.id))).toBe(false);
    const probe=new Pool({connectionString:deletedUrl});try{expect((await probe.query("SELECT COUNT(*)::int n FROM domain_records WHERE collection IN ('projectAssets','courseProjects') AND record_id=ANY($1)",[[file.id,project.id]])).rows[0].n).toBe(0);}finally{await probe.end();}
  },60000);
});

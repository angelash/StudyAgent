import { describe,it,expect,beforeAll,afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID,createHash } from 'node:crypto';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { DomainDatabase } from './domain-database';
const location=process.env.STUDY_TEST_SOURCE_CHECK_POSTGRES_URL;
const suite=location?describe:describe.skip;
suite('native PostgreSQL source check publication and cold recovery',()=>{
  let control:Pool;const schemas:string[]=[];
  beforeAll(async()=>{control=new Pool({connectionString:location});expect((await control.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa');});
  afterAll(async()=>{for(const schema of schemas){if(!/^study_qa_check_[a-f0-9]{32}$/.test(schema))throw Error('Unknown source-check QA schema');await control.query(`DROP SCHEMA "${schema}" CASCADE`);}await control.end();});
  async function scoped(){const schema='study_qa_check_'+randomUUID().replace(/-/g,'');await control.query(`CREATE SCHEMA "${schema}"`);schemas.push(schema);const url=new URL(location!);url.searchParams.set('options','-c search_path='+schema);return url.toString();}
  it('switches a stable publication pointer independently of definition row order and preserves a competing instance on stale commit',async()=>{
    const url=await scoped(),first=new DomainDatabase(url),second=new DomainDatabase(url);await first.open();await second.open();
    try{await first.commit(await first.read(),{sourceCourseChecks:[{id:'a',ownerUserId:'owner',courseId:'course',requestKey:'a',status:'ready'},{id:'b',ownerUserId:'owner',courseId:'course',requestKey:'b',status:'published'}],sourceCourseCheckPublications:[{id:'course',courseId:'course',checkId:'b',revision:1}]});const stale=await second.read(),before=await first.read(),next:any=structuredClone(before.state);next.sourceCourseChecks[0].status='published';next.sourceCourseChecks[1].status='superseded';next.sourceCourseCheckPublications[0].checkId='a';next.sourceCourseCheckPublications[0].revision++;
      await first.commit(before,next);const competing:any=structuredClone(stale.state);competing.sourceCourseCheckPublications[0].revision++;await expect(second.commit(stale,competing)).rejects.toThrow();expect((await second.read()).state.sourceCourseCheckPublications).toEqual(next.sourceCourseCheckPublications);
    }finally{await second.close();await first.close();}
  });
  it('rejects two active generations, reused prepare identities and duplicate course pointers without losing the first record',async()=>{
    const db=new DomainDatabase(await scoped());await db.open();try{await db.commit(await db.read(),{sourceCourseChecks:[{id:'first',ownerUserId:'owner',courseId:'course',requestKey:'key',status:'queued'}],sourceCourseCheckPublications:[{id:'course',courseId:'course',checkId:'first'}]});
      for(const added of [{id:'second',ownerUserId:'owner',courseId:'course',requestKey:'another',status:'generating'},{id:'third',ownerUserId:'owner',courseId:'other',requestKey:'key',status:'ready'}]){const before=await db.read();await expect(db.commit(before,{...before.state,sourceCourseChecks:[...before.state.sourceCourseChecks,added]})).rejects.toThrow();}
      const before=await db.read();await expect(db.commit(before,{...before.state,sourceCourseCheckPublications:[...before.state.sourceCourseCheckPublications,{id:'bad-pointer',courseId:'course',checkId:'other'}]})).rejects.toThrow();expect((await db.read()).state.sourceCourseChecks).toHaveLength(1);
    }finally{await db.close();}
  });
  it.skipIf(!process.env.STUDY_TEST_POSTGRES_ADMIN_URL)('natively restores check-only original bytes and applies a newer child deletion ledger to both definition and publication pointer',async()=>{
    const admin=new Pool({connectionString:process.env.STUDY_TEST_POSTGRES_ADMIN_URL}),names=[0,1,2].map(()=>`study_qa_check_${randomUUID().replace(/-/g,'')}`),created:string[]=[],opened:DomainDatabase[]=[],directory=mkdtempSync(join(tmpdir(),'study-check-native-'));
    const {createPostgresBundle,restorePostgresBundle}=require(resolve(__dirname,'../../../../scripts/operations/postgres-backup.cjs')),{makeLedger}=require(resolve(__dirname,'../../../../scripts/operations/privacy-ledger.cjs')),tools=process.env.STUDY_TEST_PG_BIN!;
    try{expect((await admin.query('SELECT current_user AS name')).rows[0].name).toBe('study_qa_admin');for(const name of names){await admin.query(`CREATE DATABASE "${name}" OWNER study_agent_app`);created.push(name);}
      const urls=names.map(name=>{const url=new URL(location!);url.pathname='/'+name;return url.toString();}),db=new DomainDatabase(urls[0]);opened.push(db);await db.open();const source=join(directory,'source'),bundle=join(directory,'bundle'),hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');mkdirSync(join(source,'studio-materials'),{recursive:true});
      const files=['keep','erase'].map(id=>{const bytes=Buffer.from('%PDF-1.4 synthetic '+id+' check original'),sha=createHash('sha256').update(bytes).digest('hex');writeFileSync(join(source,'studio-materials',sha+'.pdf'),bytes);return{id,bytes,sha};});
      await db.commit(await db.read(),{users:[{id:'owner',role:'parent',status:'active',principal:'native-check@local.test'}],students:[{id:'keep-child'},{id:'erase-child'}],sessions:[{id:'session',userId:'owner',tokenHash:'old',revokedAt:null}],sourceCourseChecks:files.map(file=>({id:file.id,ownerUserId:'owner',studentId:file.id+'-child',courseId:file.id+'-course',requestKey:file.id,status:'published',prepared:{sources:[{kind:'pdf',sha256:file.sha}]}})),sourceCourseCheckPublications:files.map(file=>({id:file.id+'-course',courseId:file.id+'-course',checkId:file.id,revision:1}))});
      await createPostgresBundle({connectionString:urls[0],pgBin:tools,dataDir:source,destination:bundle});const firstTarget=join(directory,'retained');await restorePostgresBundle({connectionString:urls[1],pgBin:tools,bundle,destination:firstTarget});for(const file of files)expect(readFileSync(join(firstTarget,'studio-materials',file.sha+'.pdf'))).toEqual(file.bytes);
      const subjectHash=hash({id:'erase-child'}),ledger=join(directory,'latest-deletions.json');writeFileSync(ledger,JSON.stringify(makeLedger([{id:'newer-delete',actorId:'owner',kind:'student_delete',subjectHash,requestKey:'delete-erased-child',inputHash:'a'.repeat(64),completedAt:new Date().toISOString(),counts:{records:3,observations:0,activities:0,plans:0,conversations:0,accessRecords:0},erasedStudentHashes:[subjectHash],retainedStudentHashes:[]}])));
      const target=join(directory,'deleted'),receipt=await restorePostgresBundle({connectionString:urls[2],pgBin:tools,bundle,destination:target,deletionLedger:ledger}),recovered=new DomainDatabase(urls[2]);opened.push(recovered);await recovered.open();const state=(await recovered.read()).state;
      expect(receipt.appliedDeletionReceipts).toBe(1);expect(state.sourceCourseChecks.map((row:any)=>row.id)).toEqual(['keep']);expect(state.sourceCourseCheckPublications.map((row:any)=>row.id)).toEqual(['keep-course']);expect((state.sessions[0] as any).revokedAt).toBeTruthy();expect(readFileSync(join(target,'studio-materials',files[0].sha+'.pdf'))).toEqual(files[0].bytes);expect(existsSync(join(target,'studio-materials',files[1].sha+'.pdf'))).toBe(false);
    }finally{for(const db of opened)await db.close();for(const name of created){if(!/^study_qa_check_[a-f0-9]{32}$/.test(name))throw Error('Unknown owned native QA database');await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);}await admin.end();rmSync(directory,{recursive:true,force:true});}
  });
});

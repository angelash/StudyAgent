import { describe,it,expect } from 'vitest';
import { DomainDatabase } from './domain-database';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { studentRecords,accountRecords,portableRecords,anonymizeSharedAttribution } from '../modules/privacy/privacy-records';
const backup=require(resolve(__dirname,'../../../../scripts/operations/backup.cjs'));

describe('source check transactional publication',()=>{
  it('switches from a later published definition to an earlier prepared candidate regardless of persisted row order',async()=>{
    const db=new DomainDatabase(':memory:');await db.open();
    try{
      const initial={sourceCourseChecks:[{id:'prepared-first',ownerUserId:'manager',courseId:'course',requestKey:'first',status:'ready'},{id:'published-later',ownerUserId:'manager',courseId:'course',requestKey:'later',status:'published'}],sourceCourseCheckPublications:[{id:'course',courseId:'course',checkId:'published-later',revision:1}]};
      await db.commit(await db.read(),initial);const before=await db.read(),next=structuredClone(before.state) as typeof initial;
      next.sourceCourseChecks[0].status='published';next.sourceCourseChecks[1].status='superseded';next.sourceCourseCheckPublications[0].checkId='prepared-first';next.sourceCourseCheckPublications[0].revision=2;
      await db.commit(before,next);const after=await db.read();expect(after.state.sourceCourseCheckPublications).toEqual(next.sourceCourseCheckPublications);expect(after.state.sourceCourseChecks).toEqual(next.sourceCourseChecks);
    }finally{await db.close();}
  });
  it('allows one current pointer and one active generation while rejecting duplicate requests without losing existing state',async()=>{
    const db=new DomainDatabase(':memory:');await db.open();
    try{
      const initial={sourceCourseChecks:[{id:'a',ownerUserId:'owner',courseId:'course',requestKey:'key',status:'queued'}],sourceCourseCheckPublications:[{id:'course',courseId:'course',checkId:'old'}]};await db.commit(await db.read(),initial);
      for(const added of [{id:'duplicate-key',ownerUserId:'owner',courseId:'other',requestKey:'key',status:'ready'},{id:'duplicate-generation',ownerUserId:'owner',courseId:'course',requestKey:'different',status:'generating'}]){
        const before=await db.read();await expect(db.commit(before,{...before.state,sourceCourseChecks:[...before.state.sourceCourseChecks,added]})).rejects.toThrow('UNIQUE');expect((await db.read()).state.sourceCourseChecks).toHaveLength(1);
      }
      const before=await db.read();await expect(db.commit(before,{...before.state,sourceCourseCheckPublications:[...before.state.sourceCourseCheckPublications,{id:'fake-second-pointer',courseId:'course',checkId:'new'}]})).rejects.toThrow('UNIQUE');expect((await db.read()).state.sourceCourseCheckPublications).toEqual(initial.sourceCourseCheckPublications);
    }finally{await db.close();}
  });
  it('upgrades a real schema14 database and preserves old definitions; invalid duplicate pointers stop migration15 without deleting evidence',async()=>{
    const directory=mkdtempSync(join(tmpdir(),'study-check-migrate-')),location=join(directory,'domain.sqlite3');let db:DomainDatabase|undefined;
    try{
      db=new DomainDatabase(location);await db.open();await db.commit(await db.read(),{sourceCourseChecks:[{id:'legacy',ownerUserId:'owner',courseId:'course',requestKey:'key',status:'ready'}]});await db.close();db=undefined;
      const old=new DatabaseSync(location);old.exec("DROP INDEX source_check_prepare_request;DROP INDEX source_check_publication_course;DROP INDEX source_check_active_generation;DROP INDEX topic_whiteboard_prepare_request;DROP INDEX topic_whiteboard_publication_draft;DELETE FROM schema_migrations WHERE version>=15;");old.close();
      db=new DomainDatabase(location);await db.open();expect((await db.read()).state.sourceCourseChecks[0]).toMatchObject({id:'legacy'});await db.close();db=undefined;
      const corrupt=new DatabaseSync(location);corrupt.exec("DROP INDEX source_check_prepare_request;DROP INDEX source_check_publication_course;DROP INDEX source_check_active_generation;DROP INDEX topic_whiteboard_prepare_request;DROP INDEX topic_whiteboard_publication_draft;DELETE FROM schema_migrations WHERE version>=15;");
      const insert=corrupt.prepare('INSERT INTO domain_records(collection,record_id,body,position) VALUES(?,?,?,?)');for(const [index,id]of ['pointer-a','pointer-b'].entries())insert.run('sourceCourseCheckPublications',id,JSON.stringify({id,courseId:'course',checkId:'legacy'}),index);corrupt.close();
      db=new DomainDatabase(location);await expect(db.open()).rejects.toThrow('UNIQUE');await db.close();db=undefined;
      const verify=new DatabaseSync(location);try{expect(verify.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version).toBe(14);expect(verify.prepare("SELECT COUNT(*) AS n FROM domain_records WHERE collection='sourceCourseCheckPublications'").get()?.n).toBe(2);expect(verify.prepare("SELECT COUNT(*) AS n FROM domain_records WHERE collection='sourceCourseChecks'").get()?.n).toBe(1);}finally{verify.close();}
    }finally{await db?.close();rmSync(directory,{recursive:true,force:true});}
  });
  it('backs up and restores an original referenced only by a frozen check, independently of a mutable course or material row',async()=>{
    const directory=mkdtempSync(join(tmpdir(),'study-check-backup-')),source=join(directory,'source'),bundle=join(directory,'bundle'),restored=join(directory,'restored'),bytes=Buffer.from('%PDF-1.4 synthetic check original'),sha=createHash('sha256').update(bytes).digest('hex'),db=new DomainDatabase(join(source,'study-agent.sqlite3'));
    mkdirSync(join(source,'studio-materials'),{recursive:true});writeFileSync(join(source,'studio-materials',sha+'.pdf'),bytes);await db.open();
    try{await db.commit(await db.read(),{sourceCourseChecks:[{id:'check',ownerUserId:'owner',courseId:'course',requestKey:'key',status:'ready',prepared:{sources:[{kind:'pdf',sha256:sha}]}}]});await backup.createBundle({dataDir:source,destination:bundle});await backup.restoreBundle({bundle,destination:restored});expect(readFileSync(join(restored,'studio-materials',sha+'.pdf'))).toEqual(bytes);const recovered=new DomainDatabase(join(restored,'study-agent.sqlite3'));await recovered.open();try{expect((await recovered.read()).state.sourceCourseChecks[0]).toMatchObject({id:'check'});}finally{await recovered.close();}}
    finally{await db.close();rmSync(directory,{recursive:true,force:true});}
  });
  it('removes private or adult records on account closure, cascades child checks and exports published metadata without private answers or internal pointers',()=>{
    const source={id:'course',ownerUserId:'manager',studentId:'child',status:'active',confirmedAt:'now',sources:[],targetGoals:[],result:null,input:{title:'公开课程'}},row=(id:string,status:string,studentId:string|null='child')=>({id,ownerUserId:'manager',studentId,courseId:'course',status,content:{title:'公开核查',questions:[{correctIndices:[0],explanation:'PRIVATE ANSWER'}]},prepared:{context:'PRIVATE CONTEXT',targets:[{lessonId:'lesson',title:'公开目标',objective:'核查条件'}]}}),store:any={users:[],students:[{id:'child'}],sourceCourses:[source],sourceCourseChecks:[row('published','published'),row('old','superseded'),row('candidate','ready'),row('adult','published',null)],sourceCourseCheckPublications:[{id:'course',courseId:'course',checkId:'published'}]};
    store.sourceCourseChecks.find((row:any)=>row.id==='adult').courseId='adult-course';
    expect(accountRecords(store,'manager','manager@local.test').sourceCourseChecks.map(row=>row.id)).toEqual(['candidate','adult']);const child=studentRecords(store,'child');expect(child.sourceCourseChecks).toHaveLength(3);expect(child.sourceCourseCheckPublications).toHaveLength(1);
    const exported=portableRecords(child,'manager');expect(exported.sourceCourseChecks).toHaveLength(2);expect(JSON.stringify(exported)).not.toContain('PRIVATE');expect(exported).not.toHaveProperty('sourceCourseCheckPublications');
  });
  it('restores originals retained only by a frozen classroom and excludes private source snapshots from portable export',async()=>{
    const directory=mkdtempSync(join(tmpdir(),'study-check-session-')),source=join(directory,'source'),bundle=join(directory,'bundle'),restored=join(directory,'restored'),bytes=Buffer.from('%PDF-1.4 synthetic classroom-only original'),sha=createHash('sha256').update(bytes).digest('hex'),db=new DomainDatabase(join(source,'study-agent.sqlite3'));
    mkdirSync(join(source,'studio-materials'),{recursive:true});writeFileSync(join(source,'studio-materials',sha+'.pdf'),bytes);await db.open();
    try{const row={id:'frozen',ownerUserId:'owner',studentId:null,sourceCheckId:'removed-definition',sourceCheckSources:[{kind:'pdf',sha256:sha,text:'PRIVATE FROZEN TEXT'}],answerKeys:{one:{answer:[0]}},hintKeys:{one:['PRIVATE HINT']},requests:[],answers:[{questionId:'one',correct:true,explanation:'received feedback'}]};await db.commit(await db.read(),{classroomSessions:[{id:'ordinary',ownerUserId:'owner'},row]});await backup.createBundle({dataDir:source,destination:bundle});await backup.restoreBundle({bundle,destination:restored});expect(readFileSync(join(restored,'studio-materials',sha+'.pdf'))).toEqual(bytes);const exported=portableRecords({classroomSessions:[row]},'owner');expect((exported.classroomSessions[0] as any).answers).toEqual(row.answers);for(const secret of ['PRIVATE','sourceCheckSources','answerKeys','hintKeys'])expect(JSON.stringify(exported)).not.toContain(secret);}
    finally{await db.close();rmSync(directory,{recursive:true,force:true});}
  });
  it('anonymizes two closed managers sharing a request key without violating the new persistent identity constraint',async()=>{
    const db=new DomainDatabase(':memory:');await db.open();
    try{const state:any={students:[{id:'child'}],sourceCourses:[{id:'course',studentId:'child'}],sourceCourseChecks:['a','b'].map((owner,index)=>({id:'check-'+index,ownerUserId:owner,studentId:'child',courseId:'course',requestKey:'same-key',status:'superseded'}))};anonymizeSharedAttribution(state,['child'],'a');anonymizeSharedAttribution(state,['child'],'b');await db.commit(await db.read(),state);expect(new Set((await db.read()).state.sourceCourseChecks.map((row:any)=>row.ownerUserId)).size).toBe(2);expect(JSON.stringify(state)).not.toContain('"ownerUserId":"a"');}
    finally{await db.close();}
  });
  it('removes an orphan publication by its deleted child check even when the original course row is absent',()=>{
    const store:any={students:[{id:'child'}],sourceCourseChecks:[{id:'erased-check',studentId:'child',ownerUserId:'manager',courseId:'absent-course',status:'published'}],sourceCourseCheckPublications:[{id:'absent-course',courseId:'absent-course',checkId:'erased-check'},{id:'kept-course',courseId:'kept-course',checkId:'kept-check'}]};
    expect(studentRecords(store,'child').sourceCourseCheckPublications.map(row=>row.id)).toEqual(['absent-course']);
    expect(accountRecords(store,'manager','manager@local.test').sourceCourseCheckPublications).toHaveLength(0);
    store.sourceCourseChecks[0].studentId=null;expect(accountRecords(store,'manager','manager@local.test').sourceCourseCheckPublications.map(row=>row.id)).toEqual(['absent-course']);
  });
  it('cleans empty publication pointers by their own child/adult ownership and anonymizes nested original command actors',()=>{
    const store:any={students:[{id:'child'}],sourceCourseCheckPublications:[{id:'child-course',courseId:'child-course',checkId:null,studentId:'child',ownerUserId:'manager'},{id:'adult-course',courseId:'adult-course',checkId:null,studentId:null,ownerUserId:'manager'}],sourceCourseChecks:[{id:'shared',ownerUserId:'manager',studentId:'child',courseId:'child-course',requestKey:'key',status:'published',commands:[{actorUserId:'manager'}]}]};
    store.sourceCourseChecks[0].authorization={guardianId:'manager'};expect(studentRecords(store,'child').sourceCourseCheckPublications.map(row=>row.id)).toEqual(['child-course']);expect(accountRecords(store,'manager','manager@local.test').sourceCourseCheckPublications.map(row=>row.id)).toEqual(['adult-course']);anonymizeSharedAttribution(store,['child'],'manager');expect(store.sourceCourseChecks[0].commands[0].actorUserId).toBe('deleted-account');expect(store.sourceCourseChecks[0].authorization.guardianId).toBe('deleted-account');
  });
});

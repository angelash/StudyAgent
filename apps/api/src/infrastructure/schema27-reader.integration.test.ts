import { afterAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { Pool } from 'pg';
import Module from 'node:module';

const root=resolve(__dirname,'../../../..'),qa=join(root,'data/qa');mkdirSync(qa,{recursive:true});
const baseline=mkdtempSync(join(qa,'rd26-')),hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const bytes=readFileSync(join(root,'resources/compatibility/domain-reader-schema26-v1.json.gz'));
const receipt=JSON.parse(readFileSync(join(root,'resources/compatibility/domain-reader-schema26-v1.receipt.json'),'utf8'));
expect(hash(bytes)).toBe(receipt.gzipSha256);
const manifest=JSON.parse(gunzipSync(bytes,{maxOutputLength:40*1024*1024}).toString('utf8'));
expect(manifest.protocol).toBe('study-domain-reader26-baseline-v1');expect(manifest.schemaVersion).toBe(26);
for(const [name,file] of Object.entries(manifest.files) as [string,{sha256:string;base64:string}][]){
  if(!/^(apps\/api\/dist\/|packages\/(contracts|config)\/|scripts\/operations\/)/.test(name)||name.split('/').some(part=>!part||part==='.'||part==='..')||/[\\:\x00]/.test(name))throw Error('Unsafe reader fixture path');
  const content=Buffer.from(file.base64,'base64'),target=join(baseline,name);expect(hash(content),name).toBe(file.sha256);
  mkdirSync(dirname(target),{recursive:true});writeFileSync(target,content,{flag:'wx'});
}
let workspace=root;while(!existsSync(join(workspace,'.git'))&&dirname(workspace)!==workspace)workspace=dirname(workspace);
for(const file of manifest.externalDependencies){if(!file.path.startsWith('node_modules/')||file.path.split('/').includes('..'))throw Error('Unsafe reader dependency');expect(hash(readFileSync(join(workspace,file.path))),file.path).toBe(file.sha256);}
const links:string[]=[];mkdirSync(join(baseline,'node_modules/@study-agent'),{recursive:true});
for(const name of ['contracts','config']){const link=join(baseline,'node_modules/@study-agent',name);symlinkSync(join(baseline,'packages',name),link,'junction');links.push(link);}
const {DomainDatabase:Reader26}=require(join(baseline,'apps/api/dist/apps/api/src/infrastructure/domain-database.js'));
const {DomainDatabase}=require('../../dist/apps/api/src/infrastructure/domain-database.js');
const oldGuard=require(join(baseline,'scripts/operations/database-reader-guard.cjs'));
const legacy23=gunzipSync(readFileSync(join(root,'resources/qa/legacy-readers/domain-database-schema23.cjs.gz'))).toString('utf8');
expect(hash(Buffer.from(legacy23))).toBe('0ef4fb2915d3fed93f16f91f96d21378bba6fe5335269ae866f03447a4e3584b');
const legacyFile=join(baseline,'apps/api/dist/apps/api/src/infrastructure/actual-schema23.js'),legacy=new (Module as any)(legacyFile);
legacy.filename=legacyFile;legacy.paths=(Module as any)._nodeModulePaths(dirname(legacyFile));legacy._compile(legacy23,legacyFile);
const Reader23=legacy.exports.DomainDatabase;
afterAll(()=>{
  for(const link of links){if(!realpathSync(link).startsWith(resolve(baseline)+sep))throw Error('Unsafe owned reader package link');unlinkSync(link);}
  if(!resolve(baseline).startsWith(resolve(qa)+sep))throw Error('Unsafe reader extraction cleanup');rmSync(baseline,{recursive:true,force:true});
});
const configured=process.env.STUDY_TEST_SCHEMA27_READER_POSTGRES_URL;
for(const driver of ['sqlite','postgres'] as const)(driver==='sqlite'||configured?describe:describe.skip)(driver+' actual schema26 reader fence for schema27',()=>{
  const folder=mkdtempSync(join(qa,'rd27-')),schemas:string[]=[];let pool:Pool|undefined;
  async function location(label:string){
    if(driver==='sqlite'){mkdirSync(join(folder,label),{recursive:true});return join(folder,label,'study-agent.sqlite3');}
    const target=new URL(configured!);expect(target.hostname).toBe('127.0.0.1');expect(target.port).toBe(process.env.CI==='true'?'5432':'15439');expect(target.pathname).toBe('/study_agent_qa');
    pool??=new Pool({connectionString:target.toString()});const schema='study_qa_rd27_'+randomUUID().replaceAll('-','');schemas.push(schema);await pool.query('CREATE SCHEMA "'+schema+'"');
    target.searchParams.set('options','-c search_path='+schema);return target.toString();
  }
  async function sql(url:string,text:string,values:any[]=[]){
    if(driver==='sqlite'){const database=new DatabaseSync(url);try{return database.prepare(text).all(...values);}finally{database.close();}}
    const database=new Pool({connectionString:url});try{let index=0;return(await database.query(text.replace(/\?/g,()=>'$'+ ++index),values)).rows;}finally{await database.end();}
  }
  async function snapshot(url:string){return {records:await sql(url,'SELECT collection,record_id,body,position FROM domain_records ORDER BY collection,record_id'),meta:await sql(url,'SELECT * FROM store_meta')};}
  async function version(url:string){return Number((await sql(url,'SELECT MAX(version) version FROM schema_migrations'))[0].version);}
  async function state(url:string){return(await sql(url,'SELECT state FROM study_restore_guard WHERE id=1'))[0].state;}
  async function original(label:string,Reader=Reader26){
    const url=await location(label),reader=new Reader(url);await reader.open();
    try{await reader.commit(await reader.read(),{notebookEntries:[{id:'owned-original',content:'Original synthetic reader fixture'}]});}finally{await reader.close();}
    return url;
  }
  afterAll(async()=>{
    if(pool){for(const schema of schemas){if(!/^study_qa_rd27_[a-f0-9]{32}$/.test(schema))throw Error('Unsafe reader schema');await pool.query('DROP SCHEMA "'+schema+'" CASCADE');}await pool.end();}
    if(!resolve(folder).startsWith(resolve(qa)+sep))throw Error('Unsafe reader directory');rmSync(folder,{recursive:true,force:true});
  });
  it('migrates actual26 without rewriting business records and the unmodified old reader refuses27 before any write',async()=>{
    const url=await original('u'),before=await snapshot(url);expect(await version(url)).toBe(26);expect(await state(url)).toBe('ready-schema26');
    const current=new DomainDatabase(url);await current.open();await current.close();expect(await version(url)).toBe(27);expect(await state(url)).toBe('ready-schema27');expect(await snapshot(url)).toEqual(before);
    const bytesBefore=driver==='sqlite'?hash(readFileSync(url)):null,old=new Reader26(url);await expect(old.open()).rejects.toThrow(/restoration|schema|reader/i);
    expect(await snapshot(url)).toEqual(before);if(driver==='sqlite')expect(hash(readFileSync(url))).toBe(bytesBefore);
    expect(()=>oldGuard.assertReady('ready-schema27',Array.from({length:27},(_,index)=>index+1))).toThrow('unsupported_database_schema');
  });
  it('migrates an actual23 database through24,25,26 and27 with its original business rows intact',async()=>{
    const url=await original('v23',Reader23),before=await snapshot(url);expect(await version(url)).toBe(23);expect(await state(url)).toBe('ready-schema23');
    const current=new DomainDatabase(url);await current.open();await current.close();expect(await version(url)).toBe(27);expect(await state(url)).toBe('ready-schema27');expect(await snapshot(url)).toEqual(before);
  });
  it('rolls back the27 marker and its migration together and leaves the26 reader usable',async()=>{
    const url=await original('rollback'),before=await snapshot(url);
    if(driver==='sqlite')await sql(url,"CREATE TRIGGER reject_reader27 BEFORE UPDATE ON study_restore_guard WHEN NEW.state='ready-schema27' BEGIN SELECT RAISE(ABORT,'injected_reader27_failure'); END");
    else{await sql(url,"CREATE FUNCTION reject_reader27() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN IF NEW.state=''ready-schema27'' THEN RAISE EXCEPTION ''injected_reader27_failure''; END IF; RETURN NEW; END'");await sql(url,'CREATE TRIGGER reject_reader27 BEFORE UPDATE ON study_restore_guard FOR EACH ROW EXECUTE FUNCTION reject_reader27()');}
    const current=new DomainDatabase(url);await expect(current.open()).rejects.toThrow('injected_reader27_failure');expect(await version(url)).toBe(26);expect(await state(url)).toBe('ready-schema26');expect(await snapshot(url)).toEqual(before);
    const old=new Reader26(url);await old.open();await old.close();expect(await version(url)).toBe(26);
    await sql(url,'DROP TRIGGER reject_reader27'+(driver==='postgres'?' ON study_restore_guard':''));const retry=new DomainDatabase(url);await retry.open();await retry.close();expect(await version(url)).toBe(27);expect(await snapshot(url)).toEqual(before);
  });
  it('rejects unknown future28 and mismatched or incomplete27 markers without resetting them',async()=>{
    const url=await original('future'),current=new DomainDatabase(url);await current.open();await current.close();const before=await snapshot(url);
    await sql(url,'INSERT INTO schema_migrations(version,applied_at) VALUES(28,?)',[new Date().toISOString()]);
    await expect(new DomainDatabase(url).open()).rejects.toThrow('unsupported_database_schema');expect(await version(url)).toBe(28);expect(await snapshot(url)).toEqual(before);
    await sql(url,'DELETE FROM schema_migrations WHERE version=28');await sql(url,"UPDATE study_restore_guard SET state='ready-schema26' WHERE id=1");
    await expect(new DomainDatabase(url).open()).rejects.toThrow('minimum_reader_guard_mismatch');expect(await state(url)).toBe('ready-schema26');expect(await snapshot(url)).toEqual(before);
    await sql(url,"UPDATE study_restore_guard SET state='restoring' WHERE id=1");await expect(new DomainDatabase(url).open()).rejects.toThrow('Database restoration is incomplete');expect(await state(url)).toBe('restoring');
  });
  if(driver==='sqlite')it('restores a native26 bundle with its old marker, upgrades explicitly and restores native27 with the new minimum reader',async()=>{
    const url=await original('backup'),backup=require(join(root,'scripts/operations/backup.cjs')),legacyBundle=join(folder,'b26'),legacyTarget=join(folder,'r26');
    await backup.createBundle({dataDir:dirname(url),destination:legacyBundle});expect((await backup.verifyBundle({bundle:legacyBundle})).database.schemaVersions.at(-1)).toBe(26);
    await backup.restoreBundle({bundle:legacyBundle,destination:legacyTarget});const restored=join(legacyTarget,'study-agent.sqlite3');expect(await state(restored)).toBe('ready-schema26');
    const reader=new DomainDatabase(restored);await reader.open();await reader.close();expect(await state(restored)).toBe('ready-schema27');
    const bundle=join(folder,'b27'),destination=join(folder,'r27');await backup.createBundle({dataDir:legacyTarget,destination:bundle});expect((await backup.verifyBundle({bundle})).database.schemaVersions.at(-1)).toBe(27);
    await backup.restoreBundle({bundle,destination});const location=join(destination,'study-agent.sqlite3');expect(await state(location)).toBe('ready-schema27');
    await expect(new Reader26(location).open()).rejects.toThrow(/restoration|schema|reader/i);const current=new DomainDatabase(location);await current.open();await current.close();
  });
});

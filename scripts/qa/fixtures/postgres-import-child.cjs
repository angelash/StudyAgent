// Actual native-process interruption fixture, restricted to a temporary root and a dedicated QA database.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{Pool}=require('pg');
const root=path.resolve(process.argv[2]),phase=process.argv[3],relative=path.relative(os.tmpdir(),root);
if(path.isAbsolute(relative)||!/^study-pg-import-[^/\\]+$/.test(relative)||!['prefix_sent','archive_sent','import_committed'].includes(phase))throw new Error('Unsafe PG import fixture');
const url=process.env.STUDY_TEST_IMPORT_TARGET_URL,parsed=new URL(url);
if(!/^\/study_qa_import_[a-f0-9]{32}$/.test(parsed.pathname)||decodeURIComponent(parsed.username)!=='study_agent_app')throw new Error('Dedicated QA database required');
const base=path.resolve(__dirname,'../../..'),tools=require(path.join(base,'scripts/operations/postgres-restore-import.cjs')),contexts=require(path.join(base,'scripts/operations/restore-context.cjs'));
(async()=>{
 const pool=new Pool({connectionString:url,max:1}),client=await pool.connect(),context=await contexts.readRestoreContext(path.join(root,'target'));
 contexts.assertRestoreContextMatches(context,{root:path.join(root,'target'),driver:'postgres',connectionString:url,manifest:JSON.parse(fs.readFileSync(path.join(root,'bundle/manifest.json'),'utf8'))});
 let release;try{
  if((await client.query('SELECT current_user AS name')).rows[0].name!=='study_agent_app')throw new Error('Wrong QA role');
  release=await tools.lockRestoreController(client);const epoch=await tools.reserveImportEpoch(client,context);
  await tools.runFencedImport({client,context,epoch,archive:path.join(root,'bundle/database/postgres.dump'),pgBin:process.env.STUDY_TEST_PG_BIN,connectionString:url,afterPhase:async current=>{
   if(current!==phase)return;
   if(phase!=='import_committed'){
    const key=phase==='prefix_sent'?tools.locks.import:tools.locks.tail,deadline=Date.now()+15000;let observed=false;
    while(Date.now()<deadline){const acquired=(await client.query('SELECT pg_try_advisory_lock($1::bigint) AS acquired',[key])).rows[0].acquired;if(!acquired){observed=true;break;}await client.query('SELECT pg_advisory_unlock($1::bigint)',[key]);await new Promise(resolve=>setTimeout(resolve,20));}
    if(!observed)throw new Error('Native transaction did not reach its phase barrier');
   }
   process.stdout.write(JSON.stringify({phase,pid:process.pid})+'\n');await new Promise(()=>{setInterval(()=>{},1000);});
  }});
  throw new Error('PG fixture did not reach its stop phase');
 }finally{await release?.();client.release();await pool.end();}
})().catch(()=>{process.stderr.write('PostgreSQL import fixture failed\n');process.exitCode=1;});

const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),candidate=path.join(root,'data/qa/p186'),{Pool}=require(path.join(candidate,'node_modules/pg')),label=process.argv[2];
(async()=>{if(!/^[a-z0-9-]+$/.test(label||''))throw Error('Fresh PostgreSQL journey label required');
 const config=JSON.parse(fs.readFileSync(path.join(root,'data/qa/workspace-teaching-package-first-20261101/teaching33-postgres-runtime.private.json')));
 if(Number(fs.readFileSync(path.join(config.data,'postmaster.pid'),'utf8').split(/\r?\n/)[3])!==15455)throw Error('Exact owned PostgreSQL cluster required');
 const database='study_source_scene33_'+randomUUID().replaceAll('-',''),pool=new Pool({connectionString:config.connectionString,max:1});try{await pool.query('CREATE DATABASE "'+database+'"');}finally{await pool.end();}
 const url=new URL(config.connectionString);url.pathname='/'+database;
 const result=spawnSync(process.execPath,[path.join(__dirname,'run-scene-material-journey.cjs'),label],{cwd:root,env:{...process.env,STUDY_RETENTION_CONTENT_POSTGRES_URL:url.toString()},encoding:'utf8',maxBuffer:8*1024*1024});
 console.log(result.stdout);if(result.stderr)console.error(result.stderr);process.exitCode=result.status??1;
})().catch(error=>{console.error(error.message);process.exitCode=1;});

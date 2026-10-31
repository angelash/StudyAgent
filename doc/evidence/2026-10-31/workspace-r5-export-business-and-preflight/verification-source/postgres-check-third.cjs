const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'postgres-runtime.private.json'),'utf8'));
const {Pool}=require('node:module').createRequire(path.resolve(__dirname,'../p174/package.json'))('pg');
(async()=>{const pool=new Pool({connectionString:config.connectionString,max:1}),schema='study_qa_export_'+crypto.randomUUID().replaceAll('-','');try{await pool.query('CREATE SCHEMA "'+schema+'"');}finally{await pool.end();}
const url=new URL(config.connectionString);url.searchParams.set('options','-c search_path='+schema);
fs.writeFileSync(path.join(__dirname,'postgres-third-scope.json'),JSON.stringify({at:new Date().toISOString(),port:15446,schema,newGeneratedScope:true}),{flag:'wx'});
const r=spawnSync(process.execPath,[path.join(__dirname,'check.cjs'),'postgres-third','test','src/modules/library/paper-export-business.integration.test.ts'],{windowsHide:true,env:{...process.env,STUDY_TEST_PAPER_EXPORT_BUSINESS_POSTGRES_URL:url.toString()},stdio:'inherit',timeout:660000});process.exitCode=r.status??1;})().catch(()=>{console.error('Owned PostgreSQL follow-up failed; exact logs preserved');process.exitCode=1;});

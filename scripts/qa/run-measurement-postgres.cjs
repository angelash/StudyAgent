// Use the prepared owned QA cluster; credentials stay in process environment.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{Pool}=require('pg');
const root=path.resolve(__dirname,'../..');
async function main(){
 const configPath=path.resolve(process.argv[2]||path.join(root,'data/qa/postgres/credentials.json'));
 const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 if(config.purpose!=='StudyAgent isolated QA cluster'||config.port!==15439||config.database!=='study_agent_qa'||config.appUser!=='study_agent_app'||config.adminUser!=='study_qa_admin'||
   !/^[a-f0-9]{64}$/.test(config.appPassword)||!/^[a-f0-9]{64}$/.test(config.adminPassword))throw Error('Dedicated measurement QA ownership metadata required');
 const location=new URL('postgresql://127.0.0.1:'+config.port+'/'+config.database);location.username=config.appUser;location.password=config.appPassword;
 const control=new Pool({connectionString:location.toString(),connectionTimeoutMillis:5000});
 try{const row=(await control.query('SELECT current_database() db,current_user role')).rows[0];if(row.db!=='study_agent_qa'||row.role!=='study_agent_app')throw Error('Unexpected measurement QA owner');}finally{await control.end();}
 const admin=new URL(location);admin.pathname='/postgres';admin.username=config.adminUser;admin.password=config.adminPassword;
 const pgBin=path.resolve(path.dirname(configPath),'../../tools/postgresql-17.11-5/pgsql/bin');
 if(!fs.existsSync(path.join(pgBin,'pg_dump'+(process.platform==='win32'?'.exe':''))))throw Error('Prepared native PostgreSQL tools required');
 const result=path.resolve(root,process.env.STUDY_MEASUREMENT_REPORT||'data/qa/measurement-postgres.json');
 if(!result.startsWith(path.join(root,'data/qa')+path.sep)||fs.existsSync(result))throw Error('Fresh owned measurement report required');
 const child=spawn(process.execPath,['../../node_modules/vitest/vitest.mjs','run','src/modules/diagnostics/measurement-versioning.integration.test.ts','--reporter=default','--reporter=json','--outputFile='+result],{
  cwd:path.join(root,'apps/api'),windowsHide:true,stdio:'inherit',env:{...process.env,STUDY_TEST_MEASUREMENT_POSTGRES_URL:location.toString(),STUDY_TEST_POSTGRES_ADMIN_URL:admin.toString(),STUDY_TEST_PG_BIN:pgBin}});
 child.on('error',()=>{console.error('Measurement PostgreSQL tests could not start');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
}
main().catch(error=>{console.error('Measurement QA preparation failed: '+(error.code||'ownership-or-configuration'));process.exitCode=1;});

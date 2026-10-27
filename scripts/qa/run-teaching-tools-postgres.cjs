// Uses the existing owned loopback QA cluster. Credentials stay in process environment only.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{Pool}=require('pg');
const root=path.resolve(__dirname,'../..');
async function main(){
 const configPath=path.resolve(process.argv[2]??path.join(root,'data/qa/postgres/credentials.json')),config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 if(config.purpose!=='StudyAgent isolated QA cluster'||config.port!==15439||config.database!=='study_agent_qa'||config.appUser!=='study_agent_app'||config.adminUser!=='study_qa_admin'||
   !/^[a-f0-9]{64}$/.test(config.appPassword)||!/^[a-f0-9]{64}$/.test(config.adminPassword))throw Error('Dedicated teaching QA ownership metadata required');
 const location=new URL('postgresql://127.0.0.1:'+config.port+'/'+config.database);location.username=config.appUser;location.password=config.appPassword;
 const admin=new URL(location);admin.pathname='/postgres';admin.username=config.adminUser;admin.password=config.adminPassword;
 const pool=new Pool({connectionString:location.toString(),connectionTimeoutMillis:5000});
 try{const row=(await pool.query('SELECT current_database() db,current_user role')).rows[0];if(row.db!=='study_agent_qa'||row.role!=='study_agent_app')throw Error('Unexpected QA database owner');}finally{await pool.end();}
 const binaries=path.resolve(path.dirname(configPath),'../../tools/postgresql-17.11-5/pgsql/bin');if(!fs.existsSync(path.join(binaries,'pg_dump.exe')))throw Error('Prepared native PostgreSQL tools required; no installation attempted');
 const result=path.resolve(root,process.env.STUDY_TEACHING_TOOL_REPORT??'data/qa/teaching-tools-postgres.json');
 if(!result.startsWith(path.join(root,'data/qa')+path.sep)||fs.existsSync(result))throw Error('Fresh teaching report within this worktree required');
 const child=spawn(process.execPath,['../../node_modules/vitest/vitest.mjs','run','src/infrastructure/teaching-tool-storage.integration.test.ts','src/modules/ai/teaching-tool.integration.test.ts','--reporter=default','--reporter=json','--outputFile='+result],{
  cwd:path.join(root,'apps/api'),windowsHide:true,stdio:'inherit',env:{...process.env,STUDY_TEST_TEACHING_TOOL_POSTGRES_URL:location.toString(),STUDY_TEST_TEACHING_TOOL_API_POSTGRES_URL:location.toString(),STUDY_TEST_POSTGRES_ADMIN_URL:admin.toString(),STUDY_TEST_PG_BIN:binaries}});
 child.on('error',()=>{console.error('Teaching PostgreSQL tests could not start');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
}
main().catch(error=>{console.error('Teaching PostgreSQL preparation failed: '+(error.code??error.message));process.exitCode=1;});

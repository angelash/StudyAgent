// Dedicated local QA cluster only; credentials never enter command-line output.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),root=path.resolve(__dirname,'../..');
const config=JSON.parse(fs.readFileSync(path.resolve(process.argv[2]??path.join(root,'data/qa/postgres/credentials.json')),'utf8'));
if(config.purpose!=='StudyAgent isolated QA cluster'||config.port!==15439||config.database!=='study_agent_qa'||config.appUser!=='study_agent_app')throw new Error('Expected isolated course lifecycle QA database');
const url=new URL('postgresql://127.0.0.1:'+config.port+'/'+config.database);url.username=config.appUser;url.password=config.appPassword;
const child=spawn(process.execPath,['--env-file=../../.env','../../node_modules/vitest/vitest.mjs','run','src/modules/learning/source-course-lifecycle.integration.test.ts','src/modules/learning/source-course.integration.test.ts','src/modules/learning/source-course-compilation.integration.test.ts','--reporter=default','--reporter=json','--outputFile='+path.resolve(root,process.env.STUDY_LIFECYCLE_REPORT??'doc/evidence/2026-10-25/course-lifecycle-postgres.json')],
 {cwd:path.join(root,'apps/api'),windowsHide:true,stdio:'inherit',env:{...process.env,STUDY_TEST_SOURCE_LIFECYCLE_POSTGRES_URL:url.toString(),STUDY_TEST_SOURCE_COURSE_POSTGRES_URL:url.toString(),STUDY_TEST_SOURCE_COMPILATION_POSTGRES_URL:url.toString()}});
child.on('error',()=>{console.error('Course lifecycle PostgreSQL tests could not start');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});

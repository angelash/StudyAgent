const path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),directory=path.join(root,'data','qa','source-course-browser-'+Date.now()+'-'+process.pid);
const full=process.argv.includes('--full'),skipBuild=process.argv.includes('--skip-build');
const apiPort=process.env.E2E_API_PORT||'4107',webPort=process.env.E2E_WEB_PORT||'3107';
const env={...process.env,NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',STUDY_STORAGE:'sqlite',STUDY_DATA_DIR:directory,E2E_DATA_DIR:directory,
 STUDY_SEED_FOUNDATION:'true',STUDY_WORKER_ENABLED:'true',STUDY_PDF_STRUCTURE_MODEL:'false',OPENAI_API_KEY:'',MINIMAX_API_KEY:'',XIAOJIU_CHAT_ENABLED:'false',CODEX_MODEL:'',
 NEXT_PUBLIC_API_BASE_URL:'http://localhost:'+apiPort,E2E_API_PORT:apiPort,E2E_WEB_PORT:webPort,E2E_API_COMMAND:'node scripts/qa/source-course-test-api.cjs',E2E_WEB_COMMAND:'node scripts/qa/experience-web.cjs start',
 E2E_ADMIN_PRINCIPAL:'browser-admin',E2E_ADMIN_PASSWORD:'Browser-admin-only-20261021',STUDY_ADMIN_PASSWORD:'Browser-admin-only-20261021',
 E2E_SOURCE_COURSE_SNAPSHOT:'1',E2E_RESULT_FILE:full?'data/qa/source-course-full-browser.json':process.argv.includes('--pdf')?'data/qa/long-pdf-browser.json':'data/qa/source-course-browser.json'};
function run(command,args,shell=false){const result=spawnSync(command,args,{cwd:root,env,stdio:'inherit',shell});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);}
if(!skipBuild){const npm=process.platform==='win32'?'npm.cmd':'npm';for(const workspace of ['@study-agent/contracts','@study-agent/config','@study-agent/api'])run(npm,['run','build','--workspace',workspace],process.platform==='win32');run(process.execPath,['scripts/qa/experience-web.cjs','build']);}
run(process.execPath,['apps/api/dist/apps/api/src/cli.js','create-admin','browser-admin']);
const focused=[...(process.argv.includes('--turns')?['tests/e2e/classroom-turns.spec.ts']:[]),...(process.argv.includes('--captions')?['tests/e2e/classroom-captions.spec.ts']:[]),...(process.argv.includes('--visuals')?['tests/e2e/classroom-visual.spec.ts']:[]),...(process.argv.includes('--long')?['tests/e2e/source-course-long.spec.ts']:[]),...(process.argv.includes('--pdf')?['tests/e2e/pdf-material.spec.ts']:[])];
run(process.execPath,['node_modules/@playwright/test/cli.js','test',...(full?[]:focused.length?focused:['tests/e2e/source-course.spec.ts'])]);

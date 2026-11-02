require('reflect-metadata');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),net=require('node:net');
const {spawn,spawnSync}=require('node:child_process'),{chromium}=require('@playwright/test'),{NestFactory}=require('@nestjs/core');
const root=path.resolve(__dirname,'../../..'),qa=path.join(root,'data/qa/p187'),label=process.argv[2],sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(!/^[a-z0-9-]+$/.test(label||''))throw Error('Fresh label required');
const folder=path.join(__dirname,label);if(fs.existsSync(folder))throw Error('Preserve earlier attempt');fs.mkdirSync(folder);fs.copyFileSync(__filename,path.join(folder,'runner.cjs'));
const data=path.join(folder,'data'),webDir=path.join(qa,'data/qa/b4-math37-web'),build=JSON.parse(fs.readFileSync(path.join(webDir,'.build-context.json')));
assert.equal(build.apiPort,4296);assert.equal(build.proxyApiPort,4296);assert.equal(build.buildId,fs.readFileSync(path.join(webDir,'.next/BUILD_ID'),'utf8').trim());
const load=n=>require(path.join(qa,'apps/api/dist/apps/api/src',n+'.js')),origin='http://localhost:3296',base='http://127.0.0.1:4296/api',checks=[],screenshots=[],errors=[],mutations=[];
let app,web,browser,actor,store,failure;const principal='qa-preview-'+crypto.randomUUID(),credential=crypto.randomBytes(24).toString('hex');
const {teachingHash}=load('modules/diagnostics/textbook-teaching-package'),{atomDefinitionFingerprint}=load('modules/diagnostics/measurement-definition');
async function free(port){await new Promise((yes,no)=>{const server=net.createServer();server.once('error',no);server.listen(port,'127.0.0.1',()=>server.close(yes));});}
async function api(method,route,body,auth=actor){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const v=await r.json();assert.equal(r.status,method==='POST'?201:200,v.error?.message);return v.data;}
async function check(name,fn){try{await fn();checks.push({name,passed:true});console.log(JSON.stringify({name,passed:true}));}catch(e){checks.push({name,passed:false,error:e.message});throw e;}}
async function ready(){for(let i=0;i<60;i++){try{if((await fetch(origin+'/parent/login')).ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Owned web readiness timeout');}
const tables=['diagnosticResponses','classroomSessions','textbookTeachingPackages','textbookTeachingVersions','textbookTeachingCommands','studioCourses','retentionExposureEvents'];
const facts=()=>store.requestContext(()=>Object.fromEntries(tables.map(name=>[name,teachingHash(store.inspect(name))])));
(async()=>{
 await free(4296);await free(3296);
 Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:'sqlite',STUDY_DATA_DIR:data,STUDY_ASSET_ROOT:path.join(root,'data/assets'),TEXTBOOK_BASE_PATH:'H:/ChinaTextbook',STUDY_SEED_FOUNDATION:'true',STUDY_WORKER_ENABLED:'false',OPENAI_API_KEY:'',MINIMAX_API_KEY:'',XIAOJIU_CHAT_ENABLED:'false',CORS_ORIGINS:origin});delete process.env.DATABASE_URL;
 const cli=spawnSync(process.execPath,[path.join(qa,'apps/api/dist/apps/api/src/cli.js'),'create-admin',principal],{cwd:qa,env:{...process.env,STUDY_ADMIN_PASSWORD:credential},encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(cli.status,0,'Owned QA admin');
 app=await NestFactory.create(load('app.module').AppModule,{logger:false,cors:{origin,credentials:true}});load('common/http-body').configureJsonBody(app);app.setGlobalPrefix('api');await app.listen(4296,'127.0.0.1');
 store=app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);actor=await api('POST','/auth/login',{principal,credential},null);
 const files=fs.readdirSync(path.join(root,'resources/curriculum/source-lessons')).filter(f=>f.endsWith('.json')).map(file=>({file,draft:JSON.parse(fs.readFileSync(path.join(root,'resources/curriculum/source-lessons',file)))})).filter(row=>row.draft.format==='source-original-lesson-draft-v1'&&row.draft.source&&row.draft.content);
 const definitions=new Map(files.flatMap(row=>row.draft.definitionCandidates??[]).map(d=>[d.id,d]));
 async function ensure(id){if(await store.requestContext(()=>store.find('knowledgeAtoms',{id})))return;const def=definitions.get(id);assert(def,'Missing original definition '+id);for(const p of def.prerequisiteIds)await ensure(p);await api('POST','/admin/knowledge-atoms',def);await new Promise(r=>setTimeout(r,350));}
 for(const row of files.filter(row=>!process.argv[3]||process.argv[3].split(',').includes(row.file)))for(const id of row.draft.targetIds)await ensure(id);
 const registry=JSON.parse(fs.readFileSync(path.join(qa,'resources/curriculum/textbooks-v1.json'))),imports=[];
 for(const {file,draft} of files.filter(row=>!process.argv[3]||process.argv[3].split(',').includes(row.file))){const book=registry.books.find(b=>b.id===draft.source.bookId);assert(book);const source=await api('POST','/admin/curriculum/teaching-packages/source-preview',{bookId:book.id,bookVersion:book.version,lessonId:draft.source.lessonId,pageStart:draft.source.pageStart,pageEnd:draft.source.pageEnd});
  const targetRefs=await store.requestContext(()=>draft.targetIds.map(id=>{const atom=store.find('knowledgeAtoms',{id});return{atomId:id,version:atom.version,definitionFingerprint:atomDefinitionFingerprint(atom)};}));
  const body={protocol:'textbook-teaching-editor-copy-v1',owner:{actorId:actor.user.id,bookId:book.id,bookVersion:book.version,lessonId:draft.source.lessonId},slot:'qa-preview:'+file,packageId:'qa-preview:'+file,range:{start:String(source.pageStart),end:String(source.pageEnd)},source,sourceHistory:[],sourceReview:draft.sourceReview,targetRefs,content:{...draft.content,checks:[]},visualHistory:[],rawInputs:{},baseline:null,editor:{section:'source',activeSourcePage:source.pageStart,publishReason:'',withdrawReason:'',reviewed:false,originalTeaching:false},journal:[],requiresOriginalResultLookup:true};
  const importFile=path.join(folder,file);fs.writeFileSync(importFile,JSON.stringify({...body,fingerprint:teachingHash(body)}));
  const href='/admin/curriculum?'+new URLSearchParams({subject:draft.definitionCandidates[0].subject,grade:String(draft.definitionCandidates[0].grade),term:draft.definitionCandidates[0].term,textbook:book.id,textbookVersion:book.version,textbookLesson:draft.source.lessonId});imports.push({file,importFile,href,body});
 }
 const log=fs.openSync(path.join(folder,'web.private.log'),'wx');web=spawn(process.execPath,['scripts/qa/experience-web.cjs','start'],{cwd:qa,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,E2E_API_PORT:'4296',E2E_WEB_PORT:'3296',E2E_WEB_DIRECTORY:webDir}});fs.closeSync(log);
 fs.writeFileSync(path.join(folder,'runtime.private.json'),JSON.stringify({apiPid:process.pid,webPid:web.pid,data,buildId:build.buildId,apiPort:4296,webPort:3296}));await ready();
 browser=await chromium.launch({headless:true});const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.method()!=='GET'&&/\/(?:teaching-packages\/commands|classroom\/sessions|diagnostic.*responses|courses)(?:\/|$)/.test(new URL(r.url()).pathname))mutations.push({method:r.method(),path:new URL(r.url()).pathname});});
 await page.goto(origin+'/parent/login?'+new URLSearchParams({returnTo:imports[0].href}));await page.getByLabel('登录账号',{exact:true}).fill(principal);await page.getByLabel('密码',{exact:true}).fill(credential);await page.getByRole('button',{name:'登录，查看学习记录 →',exact:true}).click();
 await page.getByRole('region',{name:'教材课时完整教学稿',exact:true}).waitFor();
 const desk=()=>page.getByRole('region',{name:'教材课时完整教学稿',exact:true}),reading=()=>page.getByRole('region',{name:'当前教学稿阅读预览',exact:true}),before=await facts();
 async function importCopy(file){const previous=new URL(page.url()).searchParams.get('teachingDraft');await desk().getByLabel('导入完整教学稿',{exact:true}).setInputFiles(file);await page.waitForURL(url=>url.searchParams.get('teachingDraft')!==previous);await desk().getByText('完整本机稿已保存，并已读回核对。',{exact:true}).waitFor();}

 for(const row of imports)await check('actual-controlled-model-reading:'+row.file,async()=>{
  await page.goto(origin+row.href);await desk().getByLabel('导入完整教学稿',{exact:true}).waitFor();await importCopy(row.importFile);await desk().getByText('阅读当前教学稿',{exact:true}).click();await reading().waitFor();
  const concept=reading().locator('.cl-board-step').filter({has:page.getByRole('heading',{name:'完整概念讲解',exact:true})});assert.equal(await concept.locator('p').textContent(),row.body.content.concept.explanation);
  let index=0;for(const visual of row.body.content.visuals)if(visual.kind==='math'){
   const figure=reading().getByRole('figure',{name:visual.figure.title,exact:true}),models=visual.figure.kind==='clocks'?visual.figure.clocks:visual.figure.solids;assert.equal(await figure.locator('svg').count(),models.length);assert.deepEqual(await figure.locator('.cl-math-caption').allTextContents(),models.map(model=>model.caption));
   if(visual.figure.kind==='clocks'&&!visual.figure.showDigitalTime)assert.equal(await figure.locator('svg text').filter({hasText:/\d+:\d+/}).count(),0);
   await figure.scrollIntoViewIfNeeded();const name=row.file.replace('.json','')+'-figure-'+(++index)+'-desktop.png';await figure.screenshot({path:path.join(folder,name)});screenshots.push(name);
  }
  const first=reading().getByRole('button',{name:/^放大数学图示：/}).first();await first.focus();await page.keyboard.press('Enter');await page.getByRole('dialog').filter({has:page.getByRole('button',{name:'关闭图片',exact:true})}).waitFor();await page.keyboard.press('Escape');assert(await first.evaluate(el=>el===document.activeElement));
  const waiting=page.waitForEvent('download');await desk().getByRole('button',{name:'下载当前完整稿',exact:true}).click();const download=await waiting,file=path.join(folder,'readback-'+row.file);await download.saveAs(file);const copy=JSON.parse(fs.readFileSync(file));assert.deepEqual(copy.content,row.body.content);assert.deepEqual(copy.targetRefs,row.body.targetRefs);assert.deepEqual(copy.journal,[]);
 });
 await check('actual-models-mobile-complete-captions-no-overflow',async()=>{
  await page.setViewportSize({width:390,height:844});for(const row of imports){await page.goto(origin+row.href);await desk().getByLabel('导入完整教学稿',{exact:true}).waitFor();await importCopy(row.importFile);await desk().getByText('阅读当前教学稿',{exact:true}).click();await reading().waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));let index=0;
   for(const visual of row.body.content.visuals)if(visual.kind==='math'){const figure=reading().getByRole('figure',{name:visual.figure.title,exact:true});assert.equal(await figure.locator('.cl-math-models').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);await figure.scrollIntoViewIfNeeded();const name=row.file.replace('.json','')+'-figure-'+(++index)+'-mobile.png';await figure.screenshot({path:path.join(folder,name)});screenshots.push(name);}
  }
 });
 await check('reading-has-no-publication-or-learner-writes',async()=>{assert.deepEqual(await facts(),before);assert.deepEqual(mutations,[]);assert.deepEqual(errors,[]);});
})().catch(e=>{failure=e;console.error(e.stack);}).finally(async()=>{
 if(failure&&browser)for(const [i,page]of browser.contexts().flatMap(c=>c.pages()).entries()){try{await page.screenshot({path:path.join(folder,'failure-'+i+'.png')});fs.writeFileSync(path.join(folder,'failure-'+i+'.private.txt'),await page.locator('body').innerText());}catch{}}
 await browser?.close();await app?.close();if(web&&web.exitCode===null){web.kill();await Promise.race([new Promise(r=>web.once('exit',r)),new Promise(r=>setTimeout(r,5000))]);}
 const report={at:new Date().toISOString(),buildId:build.buildId,source:'main synchronized to data/qa/p187',accurateTextbookCandidates:true,teacherReviewed:false,published:0,studentResponses:0,passed:checks.filter(r=>r.passed).length,failed:checks.filter(r=>!r.passed).length,error:failure?.message??null,checks,screenshots,pageErrors:errors,mutations};fs.writeFileSync(path.join(folder,'receipt.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({passed:report.passed,failed:report.failed,error:report.error}));if(failure)process.exitCode=1;
});

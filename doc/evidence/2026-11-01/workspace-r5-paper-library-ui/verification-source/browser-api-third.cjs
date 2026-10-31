const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net'),{DatabaseSync}=require('node:sqlite'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'../../..'),candidate=path.join(root,'data/qa/p178'),own=path.join(__dirname,'browser-third'),data=path.join(root,'data/qa/w178c'),port=16178,webPort=13178;
if(fs.existsSync(own)||fs.existsSync(data))throw Error('New generated UI fixture and short renderer data root required');
fs.mkdirSync(own);fs.mkdirSync(data);const requireCandidate=require('node:module').createRequire(path.join(candidate,'package.json'));requireCandidate('reflect-metadata');const {NestFactory}=requireCandidate('@nestjs/core');
const assets=require(path.join(candidate,'scripts/qa/paper-practice-fixture.cjs')).preparePaperPracticeAssets(own,root),sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const archive=new DatabaseSync(path.join(assets,'shijuanbao/archive.sqlite3')),catalog=new DatabaseSync(path.join(assets,'catalog.sqlite3')),sources=[];
try{for(const row of archive.prepare('SELECT key,detail FROM papers').all()){
 const detail=JSON.parse(row.detail);if(!detail.questions.length)continue;
 detail.questions[0].title='<p>合成原题：<math><mrow><mn>3</mn><mo>+</mo><mn>2</mn><mo>=</mo><mo>?</mo></mrow></math></p><table><tbody><tr><th>第一组</th><th>第二组</th></tr><tr><td>3</td><td>2</td></tr></tbody></table>';
 detail.questions[1].title='<p>合成原题：观察原图，说明你的想法。</p><img src="https://synthetic.example/browser-figure.png" alt="合成五个圆的分组图">';
 if(row.key.includes(':30:'))detail.questions[0].answer='<video>完整原参考暂不支持此格式</video>';
 if(row.key.includes(':31:'))detail.questions[0].title='<p>保留完整原题</p><script>unsupported-original()</script>';
 const bytes=JSON.stringify(detail);archive.prepare('UPDATE papers SET detail=? WHERE key=?').run(bytes,row.key);catalog.prepare('UPDATE papers SET detail_sha256=? WHERE id=?').run(sha(bytes),row.key);sources.push({paperId:row.key,detailSha256:sha(bytes),detail});
}}finally{archive.close();catalog.close();}
const marker=path.join(assets,'fixture.json'),proof=JSON.parse(fs.readFileSync(marker));fs.writeFileSync(path.join(own,'pre-variants-fixture.json'),JSON.stringify(proof,null,2)+'\n',{flag:'wx'});proof.files=proof.files.map(row=>({...row,sha256:sha(fs.readFileSync(path.join(assets,row.path)))}));fs.writeFileSync(marker,JSON.stringify(proof,null,2)+'\n');fs.writeFileSync(path.join(own,'synthetic-source-inputs.json.gz'),zlib.gzipSync(JSON.stringify(sources)),{flag:'wx'});
Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:'sqlite',STUDY_DATA_DIR:data,STUDY_ASSET_ROOT:assets,STUDY_WORKER_ENABLED:'true',STUDY_SEED_FOUNDATION:'false',
 STUDY_PAPER_EXPORT_INSTALLATION:path.join(root,'data/qa/er2/installation.json'),XIAOJIU_CHAT_ENABLED:'false',OPENAI_API_KEY:'',MINIMAX_API_KEY:'',CORS_ORIGINS:'http://localhost:'+webPort+',http://127.0.0.1:'+webPort});delete process.env.DATABASE_URL;process.chdir(candidate);
const compiled=name=>require(path.join(candidate,'apps/api/dist/apps/api/src',name+'.js')),nonce=crypto.randomBytes(24).toString('base64url'),credential=crypto.randomBytes(24).toString('base64url'),principal='generated-library-admin-'+crypto.randomUUID();let app;
(async()=>{
 await new Promise((yes,no)=>{const server=net.createServer();server.once('error',no);server.listen(port,'127.0.0.1',()=>server.close(yes));});
 app=await NestFactory.create(compiled('app.module').AppModule,{logger:false,cors:{origin:['http://localhost:'+webPort,'http://127.0.0.1:'+webPort],credentials:true}});app.getHttpAdapter().getInstance().set('trust proxy','loopback');compiled('common/http-body').configureJsonBody(app);let store;
 app.use('/__qa/control',(request,response)=>{
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(request.socket.remoteAddress)||request.headers['x-study-qa']!==nonce||request.method!=='POST')return response.status(403).end();
  void(async()=>{const body=request.body;
   if(body?.action==='facts'&&typeof body.actorId==='string'){
    const values=await store.requestContext(()=>{const exports=store.select('paperExports',{actorId:body.actorId}),ids=new Set(exports.map(row=>row.id));return{lists:store.select('paperSelectionLists',{actorId:body.actorId}),selectionCommands:store.select('paperSelectionCommands',{actorId:body.actorId}),exports,exportCommands:store.select('paperExportCommands',{actorId:body.actorId}),exposures:store.select('paperSourceExposures',{actorId:body.actorId}),files:store.inspect('paperExportFiles').filter(row=>ids.has(row.exportId))};});
    return response.json({nonce,values});
   }
   if(body?.action==='diagnostic'&&typeof body.studentId==='string'){
    const id='qa178_condition_'+crypto.randomUUID();await store.transaction(()=>{if(!store.find('students',{id:body.studentId}))throw Error('Unknown generated student');store.append('diagnosticSessions',{id,studentId:body.studentId,status:'in_progress',startedAt:new Date().toISOString()});});return response.json({nonce,id,conditionInjected:true,fullDiagnosticActivityStarted:false});
   }
   if(body?.action==='end-diagnostic'&&typeof body.id==='string'){
    await store.transaction(()=>{const row=store.find('diagnosticSessions',{id:body.id});if(!row||!row.id.startsWith('qa178_condition_'))throw Error('Exact generated condition required');row.status='completed';});return response.json({nonce,conditionEnded:true,realLearningEvidence:false});
   }
   if(body?.action==='shutdown'){response.json({nonce,stopping:true});setImmediate(()=>app.close().then(()=>process.exit(0)));return;}
   response.status(400).json({error:'Unknown generated fixture action'});
  })().catch(()=>response.status(500).json({error:'Generated fixture operation failed'}));
 });
 app.setGlobalPrefix('api');await app.init();store=app.get(compiled('infrastructure/in-memory-store.service').InMemoryStoreService);await app.listen(port,'127.0.0.1');
 const response=await fetch('http://127.0.0.1:'+port+'/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({principal,credential})}),body=await response.json();if(response.status!==201||!body.data?.token)throw Error('Actual generated admin registration failed');const admin=body.data;await store.transaction(()=>{store.find('users',{id:admin.user.id}).role='admin';});
 fs.writeFileSync(path.join(__dirname,'browser-runtime-third.private.json'),JSON.stringify({candidate,own,data,assets,port,webPort,nonce,principal,credential,adminToken:admin.token,adminId:admin.user.id,pid:process.pid}),{flag:'wx',mode:0o600});
 const result={at:new Date().toISOString(),port,webPort,pid:process.pid,loopbackOnly:true,actualAuthAndSqlite:true,actualRenderAndCleanupWorkersEnabled:true,newShortDataRoot:true,generatedOnly:true,sourceInputsSha256:sha(fs.readFileSync(path.join(own,'synthetic-source-inputs.json.gz'))),formalDatabaseContacted:false,trustedSyntheticFamiliesFromLoopbackOnly:true,productionRateLimitsUnchanged:true};
 fs.writeFileSync(path.join(__dirname,'browser-api-third.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
})().catch(async error=>{fs.writeFileSync(path.join(__dirname,'browser-api-third-failure.private.log'),String(error.stack??error),{flag:'wx'});console.error('Owned generated UI API failed; original private error retained.');await app?.close().catch(()=>{});process.exitCode=1;});

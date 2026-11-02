// Exact local source, real editorial HTTP, independent cold read. Never publishes or creates learner facts.
require('reflect-metadata');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{NestFactory}=require('@nestjs/core');
const root=path.resolve(__dirname,'../../..'),args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--api-root','--output','--source-root','--materials','--lessons','--book-id','--postgres-config'].includes(args[i])||!args[i+1]||options[args[i]])throw Error('Use --api-root --output --source-root --book-id --materials --lessons [--postgres-config <owned QA config>]');options[args[i]]=args[i+1];}
if(!options['--api-root']||!options['--output']||!options['--source-root'])throw Error('All three base options required');
const apiRoot=path.resolve(root,options['--api-root']),output=path.resolve(root,options['--output']),sourceRoot=path.resolve(options['--source-root']),qa=path.join(root,'data/qa');
if(!apiRoot.startsWith(qa+path.sep)||!output.startsWith(qa+path.sep)||!output.endsWith('.json')||fs.existsSync(output))throw Error('An isolated compiled checkout and new QA output are required');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
for(let dir=path.dirname(output);dir!==root;dir=path.dirname(dir)){if(dir===path.dirname(dir)||fs.existsSync(dir)&&fs.lstatSync(dir).isSymbolicLink())throw Error('QA output directory links refused');}
if(!options['--book-id']||!options['--materials']||!options['--lessons'])throw Error('Explicit book, materials and lessons required');
const lessonNames=options['--lessons'].split(',');
const {validateSourceCandidates}=require(path.join(root,'scripts/qa/source-candidate-preflight.cjs'));
const validated=validateSourceCandidates({root,apiRoot,sourceRoot,bookId:options['--book-id'],materials:options['--materials'],lessonNames});
let postgres,connectionString;
if(options['--postgres-config']){
 const file=path.resolve(root,options['--postgres-config']);assert.equal(file,path.join(qa,'b4pg/runtime.private.json'),'Exact owned QA cluster configuration required');postgres=JSON.parse(fs.readFileSync(file));
 const url=new URL(postgres.connectionString);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15456');assert.equal(url.username,'study_b4_owner');assert.equal(url.pathname,'/study_b4_gesp');assert.equal(path.resolve(postgres.data),path.join(qa,'b4pg/cluster'));
 url.pathname='/study_source_candidates_'+crypto.randomBytes(10).toString('hex');connectionString=url.toString();
}
const runtime=fs.mkdtempSync(path.join(qa,'source-candidates-http-'));
Object.assign(process.env,{NODE_ENV:'development',STUDY_STORAGE:postgres?'postgres':'sqlite',STUDY_DATA_DIR:runtime,STUDY_SEED_FOUNDATION:'true',STUDY_WORKER_ENABLED:'false',TEXTBOOK_BASE_PATH:sourceRoot,
  STUDY_ASSET_ROOT:path.join(root,'data/assets'),OPENAI_API_KEY:'',MINIMAX_API_KEY:'',XIAOJIU_CHAT_ENABLED:'false'});delete process.env.DATABASE_URL;
if(postgres)process.env.DATABASE_URL=connectionString;
const load=name=>require(path.join(apiRoot,'apps/api/dist/apps/api/src',name+'.js')),route='/admin/curriculum/teaching-packages';
const {teachingSourceDescriptor,teachingHash}=load('modules/diagnostics/textbook-teaching-package'),{atomDefinitionFingerprint,questionContentFingerprint}=load('modules/diagnostics/measurement-definition');
const candidateFile=options['--materials']?path.resolve(root,options['--materials']):null;
if(candidateFile&&!candidateFile.startsWith(path.join(root,'resources/curriculum/source-lesson-materials')+path.sep))throw Error('A versioned original candidate bundle is required');
const candidateBytes=candidateFile?fs.readFileSync(candidateFile):null,candidates=candidateBytes?JSON.parse(candidateBytes):null;
if(candidates&&(!['source-following-original-materials-v1','source-following-original-materials-v2'].includes(candidates.format)||candidates.teacherReviewed||candidates.automaticPublication))throw Error('Unapproved editorial materials only');
const contracts=require(path.join(apiRoot,'packages/contracts/dist/index.js'));
// Reject invalid authored packets before administrator bootstrap and per-question HTTP writes.
for(const name of lessonNames){
  const draft=JSON.parse(fs.readFileSync(path.join(root,'resources/curriculum/source-lessons',name)));
  contracts.textbookTeachingDraftContentSchema.parse({...draft.content,checks:[]});
  contracts.textbookTeachingSourceReviewSchema.parse(draft.sourceReview);
  for(const definition of draft.definitionCandidates??[])contracts.knowledgeAtomSchema.parse(definition);
  assert.deepEqual(draft.content.goals.map(row=>row.atomId),draft.targetIds,'Explicit target identities must match the draft goals before any HTTP mutation');
  if(candidates){const entry=candidates.sourceLessons.find(row=>row.path==='resources/curriculum/source-lessons/'+name);
    assert.equal(entry.sha256,sha(fs.readFileSync(path.join(root,entry.path))),'Current source binding before HTTP writes');
    assert.deepEqual(candidates.groups.filter(row=>row.lesson===entry.lesson).map(row=>row.atomId).sort(),[...draft.targetIds].sort(),'Material target groups must match before HTTP writes');}
}
const definitions=new Map(fs.readdirSync(path.join(root,'resources/curriculum/source-lessons')).filter(name=>name.endsWith('.json'))
  .flatMap(name=>JSON.parse(fs.readFileSync(path.join(root,'resources/curriculum/source-lessons',name))).definitionCandidates??[]).map(row=>[row.id,row]));
let app,base,actor;const result={at:new Date().toISOString(),passed:false,storage:postgres?'postgres':'sqlite',scope:'All selected exact-source packets validated before runtime and administrator creation; real isolated HTTP and independent cold read. No teacher approval, release or learner evidence.',bookId:validated.book.id,subject:validated.book.subject,prewriteValidation:{passed:true,selectedDrafts:validated.drafts.length,questionCount:validated.questionCount,exactOriginalSha256:validated.original.sha256,proofFingerprint:validated.proofFingerprint},drafts:[]};
let lastWrite=0,checkedVisualDocumentVersionGuard=false;
async function call(method,url,body,expected=method==='POST'?201:200){
  if(method==='POST'&&actor){const delay=350-(Date.now()-lastWrite);if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));lastWrite=Date.now();}
  const reply=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(actor?{Authorization:'Bearer '+actor.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)}),payload=await reply.json();assert.equal(reply.status,expected,method+' '+url+': '+(payload.error?.message??''));return payload.data;
}
(async()=>{
  if(postgres){const {Pool}=require('pg'),pool=new Pool({connectionString:postgres.connectionString,max:1,connectionTimeoutMillis:5000});try{
    const actual=await pool.query('SHOW data_directory');assert.equal(path.resolve(actual.rows[0].data_directory),path.resolve(postgres.data),'Server must be the owned local QA cluster');
    const database=new URL(connectionString).pathname.slice(1);assert(/^study_source_candidates_[a-f0-9]{20}$/.test(database));await pool.query('CREATE DATABASE '+database);result.isolatedPostgresDatabaseCreated=true;
  }finally{await pool.end();}}
  const credential=crypto.randomBytes(24).toString('hex'),principal='qa-following-drafts-editor';
  const bootstrap=spawnSync(process.execPath,[path.join(apiRoot,'apps/api/dist/apps/api/src/cli.js'),'create-admin',principal],{cwd:apiRoot,env:{...process.env,STUDY_ADMIN_PASSWORD:credential},encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(bootstrap.status,0,'Owned administrator bootstrap');
  app=await NestFactory.create(load('app.module').AppModule,{logger:false,abortOnError:false});app.setGlobalPrefix('api');await app.listen(0,'127.0.0.1');base='http://127.0.0.1:'+app.getHttpServer().address().port+'/api';
  actor=await call('POST','/auth/login',{principal,credential});const store=app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService),saved=[],savedQuestions=[];
  const visiting=new Set();
  async function ensureDefinition(id){
    if(await store.requestContext(()=>Boolean(store.find('knowledgeAtoms',{id}))))return;
    if(visiting.has(id))throw Error('Cyclic candidate definitions');visiting.add(id);
    const definition=definitions.get(id);assert(definition,'Explicit candidate definition required: '+id);
    for(const prerequisite of definition.prerequisiteIds)await ensureDefinition(prerequisite);
    await call('POST','/admin/knowledge-atoms',definition);visiting.delete(id);
  }
  const registry=JSON.parse(fs.readFileSync(path.join(apiRoot,'resources/curriculum/textbooks-v1.json')));
  const oldCopy=JSON.parse(fs.readFileSync(path.join(root,'data/qa/b4-chinese-g1-source-first/browser-first/chinese-g1-a692a990-school-start-v1.json'))),oldSource=oldCopy.source;
  assert.equal(oldSource.extractedSha256,'6dae830e70696a636c29022d580bec4ddfeb357b8370df9539e4cab8b13526dc');
  load('modules/diagnostics/textbook-teaching-package').assertTeachingSourceSnapshot(oldSource);
  const normalized=JSON.parse(fs.readFileSync(path.join(root,'data/assets/textbook-sources/chinatextbook-chinese-v1/extracted/chinatextbook-chinese-g1-upper-tone-9d4c9c93727eadcf.json'))),ranges=[[25,26],[27,28],[29,30],[31,32],[33,34]],pinyin=[];
  for(let i=0;i<ranges.length;i++){const [start,end]=ranges[i],book=registry.books.find(b=>b.id===validated.book.id),preview=await call('POST',route+'/source-preview',{bookId:book.id,bookVersion:book.version,lessonId:book.id+':chapter3:entry'+(i+1),pageStart:start,pageEnd:end});
    assert.equal(preview.extractedSha256,'9d4c9c93727eadcf19bfeda6580833b68b5ada8d2cdaed2daca1e578441ee987');assert.deepEqual(preview.pages.map(p=>p.text),normalized.pages.slice(start-1,end).map(p=>p.text));
    pinyin.push({entry:i+1,physicalPages:[start,end],textSha256:preview.pages.map(p=>p.textSha256),exactNormalizedText:true});
  }result.pinyinSourcePreviews=pinyin;result.oldFrozenSourceSnapshotStillParses=true;

  for(const name of lessonNames){
    const bytes=fs.readFileSync(path.join(root,'resources/curriculum/source-lessons',name)),draft=JSON.parse(bytes),book=registry.books.find(book=>book.id===draft.source.bookId);
    for(const id of draft.targetIds)await ensureDefinition(id);
    const source=await call('POST',route+'/source-preview',{bookId:book.id,bookVersion:book.version,lessonId:draft.source.lessonId,pageStart:draft.source.pageStart,pageEnd:draft.source.pageEnd});
    assert.deepEqual(source.pages.map(page=>page.page),draft.sourceReview.pages.map(page=>page.page));
    for(const citation of draft.content.citations){
      const page=source.pages.find(page=>page.page===citation.page);
      assert(citation.quote.trim().length>=8&&page?.text.includes(citation.quote),'Exact source citation, including its minimum length, must match before saving '+name);
    }
    const targets=await store.requestContext(()=>draft.targetIds.map(id=>{const atom=store.find('knowledgeAtoms',{id});assert(atom);return{atomId:id,version:atom.version,definitionFingerprint:atomDefinitionFingerprint(atom)};}));
    const checks=[];
    if(candidates){
      const entry=candidates.sourceLessons.find(row=>row.path==='resources/curriculum/source-lessons/'+name),slug=entry.lesson;
      assert(entry&&entry.sha256===sha(bytes),'Candidate material source draft identity');
      const groups=candidates.groups.filter(row=>row.lesson===slug);assert.deepEqual(groups.map(row=>row.atomId).sort(),[...draft.targetIds].sort());
      for(const group of groups){
        assert.equal(group.exercises.length,7);assert.equal(group.familyIndependenceReviewed,false);
        assert.deepEqual(group.exercises.slice(3).map(row=>row.proposedIntervalDays),[1,3,7,14]);
        const refs=[];
        for(const exercise of group.exercises){
          const question=await call('POST','/admin/questions',{subject:validated.book.subject,type:'subjective',stem:exercise.stem,answer:exercise.answer,
            analysis:exercise.analysis,difficultyLevel:1,knowledgePointIds:[],status:'draft'});
          let document;
          if(exercise.blocks){
            const body={locale:'zh-CN',blocks:[{id:'source-statement',type:'text',text:exercise.stem},...structuredClone(exercise.blocks)],attachments:[],layoutMode:'default',accessibilityConfig:{}};
            document=await call('POST',`/admin/questions/${question.id}/document`,body);
            for(const[key,value]of Object.entries(body))assert.deepEqual(document[key],value,'Complete visual question document before fingerprint');
          }
          const answerSchema={mode:group.mode,responseShape:group.mode==='short_answer'?{value:'string'}:{mediaPolicy:'student-media-v1'},
            validationRules:{required:true},gradingConfig:{rubric:group.rubric,referenceOnly:true,reviewRequired:true}};
          await call('POST',`/admin/questions/${question.id}/answer-schema`,answerSchema);
          const sourceRecord={sourceType:'internal_authoring',sourceName:draft.scope.title+' · 原创材料 · 教师未审',
            sourcePathOrUrl:'authored-following:'+draft.source.sourceSha256+':'+exercise.id,licenseClass:'A_INTERNAL',licenseName:'original-editorial-candidate',
            importJobId:null,reviewStatus:'pending',notes:'原创题面，不转载教材正文。仅拟议目标、评分与结构，不自动审核、发布或消耗保持库存。'};
          await call('POST',`/admin/questions/${question.id}/source`,sourceRecord);
          const mapping={id:question.id+':candidate',questionId:question.id,questionVersion:document?.version??1,atomId:group.atomId,dimension:exercise.dimension,
            family:group.familyProposal,probeRole:exercise.purpose==='retention'?'retention':exercise.dimension==='transfer'?'transfer':'anchor',
            expectedSeconds:exercise.expectedSeconds,difficulty:1,reviewStatus:'draft',mappingWeight:1,observationCode:'editorial_unreviewed',version:1};
          if(document&&!checkedVisualDocumentVersionGuard){await call('POST','/admin/measurement-items',{...mapping,questionVersion:document.version-1},400);checkedVisualDocumentVersionGuard=true;}
          await call('POST','/admin/measurement-items',mapping);
          if(!savedQuestions.length)await call('POST','/admin/measurement-items',{...mapping,reviewStatus:'approved'},400);
          const reference=await store.requestContext(()=>({measurementId:mapping.id,version:1,questionId:question.id,questionVersion:mapping.questionVersion,
            definitionFingerprint:atomDefinitionFingerprint(store.find('knowledgeAtoms',{id:group.atomId})),contentFingerprint:questionContentFingerprint(store,question.id)}));
          if(document)assert.deepEqual((await call('GET',`/questions/${question.id}/render`)).document,document,'Authorized native renderer receives the complete saved image document');
          refs.push({purpose:exercise.purpose,reference});savedQuestions.push({questionId:question.id,mappingId:mapping.id,stem:exercise.stem,answer:exercise.answer,analysis:exercise.analysis,answerSchema,sourceRecord,family:group.familyProposal,...(document?{document}:{} )});
        }
        for(const purpose of ['understanding','procedure','transfer','retention'])checks.push({id:slug+'-'+(checks.length+1),atomId:group.atomId,purpose,
          instructions:purpose==='retention'?'仅是四个间隔的拟议样题，审核、独立性与充分库存未通过前不能发布或安排实际复测。':'使用实际题面与人工量规核对目标表现；未审核候选不能用于正式诊断或自动评分。',
          materials:refs.filter(row=>row.purpose===purpose).map(row=>row.reference)});
      }
    }
    const input={packageId:'source-draft:'+name.replace('.json',''),requestKey:crypto.randomUUID(),expectedRevision:0,action:'save',basedOn:null,source:teachingSourceDescriptor(source),
      sourceFingerprint:source.fingerprint,targetRefs:targets,sourceReview:draft.sourceReview,content:{...draft.content,checks}};

    const stale={...input,packageId:input.packageId+':stale-old-source',requestKey:crypto.randomUUID(),source:teachingSourceDescriptor(oldSource),sourceFingerprint:oldSource.fingerprint};
    await call('POST',route+'/preflight',stale,409);await call('POST',route+'/commands',stale,409);
    assert.equal(teachingHash(draft.content),teachingHash(oldCopy.content.checks?Object.fromEntries(Object.entries(oldCopy.content).filter(([k])=>k!=='checks')):oldCopy.content));
    result.oldDescriptorCannotSaveAgainstNewExtraction=true;
    const preflight=await call('POST',route+'/preflight',input);assert.equal(preflight.publishable,false);
    assert(!preflight.gaps.some(row=>row.code==='citation_not_in_source'),'All citations must survive the actual source preflight');
    const receipt=await call('POST',route+'/commands',input),detail=await call('GET',route+'/'+encodeURIComponent(input.packageId));
    assert.equal(teachingHash(detail.version.body.content),teachingHash(input.content));assert.deepEqual(await call('POST',route+'/commands',input),receipt);
    await call('POST',route+'/commands',{action:'publish',packageId:input.packageId,requestKey:crypto.randomUUID(),expectedRevision:receipt.revision,contentVersion:receipt.contentVersion,
      contentFingerprint:receipt.contentFingerprint,preflightFingerprint:detail.version.report.fingerprint,reviewed:true,originalTeaching:true,reason:'仅验证不完整候选的拒绝门禁，不声称已由教师审核或完成材料。'},409);
    saved.push({packageId:input.packageId,content:input.content,sourceFingerprint:source.fingerprint});
    result.drafts.push({file:name,sha256:sha(bytes),physicalPages:source.pages.map(page=>page.page),fullSourceTextKeptPrivate:true,targets:targets.length,
      preflightPublishable:false,gapCount:preflight.gaps.length,linkedDraftMaterialReferences:checks.reduce((n,row)=>n+row.materials.length,0),
      gapCodes:[...new Set(preflight.gaps.map(row=>row.code))],fullOriginalContentReadBack:true,originalCommandReplayed:true,incompletePublicationRejected:true});
  }
  await app.close();app=undefined;
  const {DomainDatabase}=load('infrastructure/domain-database'),db=new DomainDatabase(connectionString??path.join(runtime,'study-agent.sqlite3'));await db.open();try{const state=(await db.read()).state;
    for(const expected of saved){const header=state.textbookTeachingPackages.find(row=>row.id===expected.packageId);assert.equal(header.status,'draft');assert.equal(header.published,null);const version=state.textbookTeachingVersions.find(row=>row.packageId===expected.packageId);assert.equal(teachingHash(version.body.content),teachingHash(expected.content));assert.equal(version.body.sourceFingerprint,expected.sourceFingerprint);}
    for(const item of savedQuestions){
      const question=state.questions.find(row=>row.id===item.questionId),mapping=state.measurementItems.find(row=>row.id===item.mappingId);
      assert.equal(question.stem,item.stem);assert.deepEqual(question.answer,item.answer);assert.equal(question.analysis,item.analysis);assert.equal(question.status,'draft');
      assert.equal(mapping.reviewStatus,'draft');assert.equal(mapping.family,item.family);
      assert.equal(mapping.questionVersion,item.document?.version??1,'Mapping retains actual question document version');
      assert.equal(state.questionSources.find(row=>row.questionId===item.questionId).reviewStatus,'pending');
      const sourceRecord=state.questionSources.find(row=>row.questionId===item.questionId);
      for(const[key,value]of Object.entries(item.sourceRecord))assert.deepEqual(sourceRecord[key],value,'Exact authored-source metadata '+key);
      const schema=state.questionAnswerSchemas.find(row=>row.questionId===item.questionId);
      assert.equal(schema.mode,item.answerSchema.mode);assert.deepEqual(schema.gradingConfig,item.answerSchema.gradingConfig);
      if(item.document)assert.deepEqual(state.questionDocuments.find(row=>row.questionId===item.questionId),item.document,'Pinned visual question document survives independent cold read');
    }
    assert.equal((state.textbookTeachingAdoptions??[]).length,0);assert.equal((state.diagnosticResponses??[]).length,0);assert.equal((state.practiceAttempts??[]).length,0);
  }finally{await db.close();}
  result.coldRead={drafts:saved.length,wholeContentAndSourceFingerprintsPreserved:true,draftQuestions:savedQuestions.length,allQuestionTextModesRubricsSourcesAndMappingsPreserved:true,
    exactSourceNamesAndMetadataPreserved:true,visualQuestionDocuments:savedQuestions.filter(row=>row.document).length,wholeVisualDocumentsPreserved:true,staleVisualDocumentVersionRejected:checkedVisualDocumentVersionGuard,publications:0,adoptions:0,learnerResponses:0};
  if(candidates)result.materials={file:path.relative(root,candidateFile).replaceAll('\\','/'),sha256:sha(candidateBytes),groups:candidates.groups.length,questions:savedQuestions.length,
    scoringAnchorsAreAuthoredExamplesNotStudentEvidence:true,teacherReviewed:false,independentFamiliesApproved:0,fullyStockedRetentionIntervals:0};
  result.passed=true;
})().catch(error=>{result.error=error.message;process.exitCode=1;}).finally(async()=>{await app?.close();fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:result.passed,drafts:result.drafts.length,coldRead:result.coldRead,error:result.error}));});

const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),candidate=path.join(root,'data/qa/p176'),sha=value=>crypto.createHash('sha256').update(value).digest('hex'),read=name=>JSON.parse(fs.readFileSync(path.join(__dirname,name)));
const prep=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'preparation-first.json.gz'))));
for(const [batch,count] of [['cleanup-second',12],['postgres-first',12],['generation-first',1],['generation-postgres-first',1],['render-first',6],['filesystem-third',39],['regression-first',226]]){
 const r=read(batch+'-vitest.json'),meta=read(batch+'.json');if(r.numPassedTests!==count||r.numFailedTests||r.numPendingTests||!meta.sourceUnchanged||meta.results.some(row=>row.exit!==0))throw Error('Complete exact scoped check required: '+batch);
}
if(!read('postgres-stop-first.json').stopped||read('types-sixth.json').results.some(row=>row.exit!==0))throw Error('Final types and owned PG stop required');
const processEvidence=read('process-boundaries-third.json');if(processEvidence.scenarios.length!==2||!processEvidence.originalInputUnchanged||processEvidence.scenarios.some(row=>!row.allObservedProcessesStopped||!row.latePythonRefused||row.collection!=='collected'))throw Error('Actual process boundary checks required');
const python=fs.readFileSync(path.join(__dirname,'python-first.log'),'utf8');if(!/Ran 32 tests/.test(python)||!/^OK\s*$/m.test(python))throw Error('Actual Python regression required');
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),addition=execFileSync('git',['diff','--name-only',prep.head,head],{cwd:root,encoding:'utf8'}).trim();
if(!head.startsWith('8a6258a3')||addition!=='doc/product/175-paper-export-workspace-collection-and-writer-leases.md'||execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim())throw Error('Exact clean baseline plus committed writer protocol required');
const paths=['apps/api/src/infrastructure/studio-file-coordination.ts','apps/api/src/infrastructure/task-repository.ts',
 ...['library.module.ts','paper-export-render-worker.service.ts','paper-export-cleanup-worker.service.ts','paper-export-workspace-collection.ts','paper-export-workspace-collection.test.ts','paper-export-cleanup.integration.test.ts','paper-export-generation-cleanup.integration.test.ts','paper-export-render.integration.test.ts','paper-library-app.fixture.spec.ts'].map(name=>'apps/api/src/modules/library/'+name),
 ...['file_leases.py','paper_export_supervisor.py','test_file_leases.py'].map(name=>'scripts/processing/'+name),'scripts/operations/restored-paper-exports.cjs','resources/paper-export/profile-collection-policy-v1.json'];
const actual=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'generation-postgres-first-source.json.gz')))),before=[],source=[];
for(const file of paths){const bytes=fs.readFileSync(path.join(candidate,file)),hash=sha(bytes),tested=actual.find(row=>row.path===file),baseline=prep.files.find(row=>row.path===file),target=path.join(root,file),exists=fs.existsSync(target);
 if(!tested||hash!==tested.sha256||sha(Buffer.from(tested.data,'base64'))!==hash)throw Error('Candidate differs from captured source: '+file);
 if(baseline?!exists||sha(fs.readFileSync(target))!==baseline.sha256:exists)throw Error('Main target changed: '+file);
 before.push({path:file,data:exists?fs.readFileSync(target).toString('base64'):null});source.push({path:file,sha256:hash,data:bytes.toString('base64')});}
for(const row of prep.protectedFiles)if(sha(fs.readFileSync(path.join(root,row.path)))!==row.sha256)throw Error('Protected runtime changed');
fs.writeFileSync(path.join(__dirname,'main-before-integration.json.gz'),zlib.gzipSync(JSON.stringify(before)),{flag:'wx'});
for(const row of source){const target=path.join(root,row.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,Buffer.from(row.data,'base64'),{flag:before.find(item=>item.path===row.path).data===null?'wx':'w'});if(sha(fs.readFileSync(target))!==row.sha256)throw Error('Source readback failed');}
const result={at:new Date().toISOString(),baseline:prep.head,writerProtocolPlanCommit:head,source:source.map(({data,...row})=>row),applicationSchema:32,actualCleanupWorker:true,dualWriterLeases:true,unknownEntryRetention:true,liveAndColdPrivacyCollection:true,wholeGoal:'active',formalMigrated:false,pushed:false,deployed:false};
fs.writeFileSync(path.join(__dirname,'integration-first.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({integrated:source.length,wholeGoal:'active'}));

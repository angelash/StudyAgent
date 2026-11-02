const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),relative='doc/evidence/2026-11-02/block-four-retention-feedback-and-autumn',dest=path.join(root,relative),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const load=name=>JSON.parse(fs.readFileSync(path.join(__dirname,name))),full=load('b4-rt-full-api-vitest.json'),run=load('b4-rt-full-api.json');
assert.equal(run.exit,0);assert.deepEqual(run.changedDuringRun,[]);assert.equal(full.numFailedTests,0);assert.equal(full.success,true);
const verifiedNames=['autumn-materials-http-source-checked.json','autumn-activities-materials-http-source-checked.json'];
for(const name of verifiedNames){const r=load(name);assert.equal(r.passed,true);assert.equal(r.coldRead.exactSourceNamesAndMetadataPreserved,true);assert(r.drafts.every(d=>!d.gapCodes.includes('citation_not_in_source')));}
if(fs.existsSync(dest))throw Error('New evidence directory required');fs.mkdirSync(dest,{recursive:true});
function write(rel,bytes){const file=path.join(dest,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});assert.equal(sha(fs.readFileSync(file)),sha(bytes));}
const scrub=text=>text.replace(/study_session=[A-Za-z0-9_-]{16,}/g,'study_session=[REDACTED_QA_SESSION]').replace(/Bearer [A-Za-z0-9_.-]{20,}/g,'Bearer [REDACTED_QA_AUTHORIZATION]');
const selected=name=>/^(b4-(?:rt-|retention-|reader-postgres36|gesp-postgres36|group-anchor-repro)|autumn-|content-worklist-autumn)/.test(name);
const checks=fs.readdirSync(__dirname).filter(name=>selected(name)&&/\.json(?:\.gz)?$/.test(name)&&!name.includes('.private.'));
for(const name of checks){const raw=fs.readFileSync(path.join(__dirname,name));write('checks/'+name,name.endsWith('.gz')?raw:Buffer.from(scrub(raw.toString('utf8'))));}
for(const [source,target]of[['b4-source-unit-two-first','autumn-three-lessons'],['b4-source-autumn-activities-first','autumn-activities']]){
 const raw=fs.readFileSync(path.join(root,'data/qa',source,'reviewed-receipt.json'));write('source-intake/'+target+'.json',raw);
}
const inventory=spawnSync('git',['ls-files','--modified','--others','--exclude-standard'],{cwd:root,encoding:'utf8'});assert.equal(inventory.status,0);
const files=inventory.stdout.split(/\r?\n/).filter(file=>/^(apps|packages|resources|scripts|tests)\//.test(file)).map(file=>{const bytes=fs.readFileSync(path.join(root,file));return{path:file,sha256:sha(bytes),base64:bytes.toString('base64')};});
write('sources.json.gz',zlib.gzipSync(JSON.stringify({format:'study-retention-autumn-main-source-v1',files})));
const inputs=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'b4-rt-full-api-inputs.json.gz')))),compiled=rel=>/^(?:apps\/api|packages\/(?:contracts|config))\/dist\//.test(rel),normalize=b=>Buffer.from(b.toString('latin1').replace(/\r\n/g,'\n'),'latin1');
const differences=[];let sourceCompared=0,compiledExcluded=0;
for(const input of inputs){const frozen=fs.readFileSync(path.join(root,'data/qa/p187',input.path));assert.equal(sha(frozen),input.sha256);if(compiled(input.path)){compiledExcluded++;continue;}
 const current=path.join(root,input.path);if(!fs.existsSync(current)){differences.push({path:input.path,currentMissing:true});continue;}sourceCompared++;
 if(sha(normalize(fs.readFileSync(current)))!==sha(normalize(frozen)))differences.push({path:input.path,frozenSha256:input.sha256,mainSha256:sha(fs.readFileSync(current))});
}
assert(!differences.some(row=>/^(apps|packages|tests)\//.test(row.path)),'Application and test inputs must equal tested source');
write('main-vs-frozen-qa.json',Buffer.from(JSON.stringify({at:new Date().toISOString(),frozenInputCount:inputs.length,compiledExcluded,sourceCompared,differences,
 newFilesAfterFreeze:files.filter(file=>!inputs.some(input=>input.path===file.path)).map(({path,sha256})=>({path,sha256})),
 rule:'Current application, contracts and tests match the frozen full API input after line-ending normalization. Later original content and standalone QA scripts have their explicit HTTP/cold-read receipts, not a claim that the full API ran those later files.'},null,2)+'\n'));
const transcripts=[];
for(const name of fs.readdirSync(__dirname).filter(name=>selected(name)&&name.endsWith('.log')&&!name.includes('.private.'))){const raw=fs.readFileSync(path.join(__dirname,name)),safe=Buffer.from(scrub(raw.toString('utf8')));transcripts.push({path:name,originalSha256:sha(raw),sha256:sha(safe),redacted:sha(raw)!==sha(safe),base64:safe.toString('base64')});}
write('run-transcripts.json.gz',zlib.gzipSync(JSON.stringify({format:'study-redacted-run-transcripts-v1',originalsRetainedLocally:true,files:transcripts})));
const raw=fs.readFileSync(path.join(root,'data/qa/p187/data/qa/b4-rt-browser-browser.json')),browser=JSON.parse(raw),cases=[];
function walk(suites){for(const suite of suites??[]){for(const spec of suite.specs??[])for(const test of spec.tests??[])cases.push({file:spec.file,title:spec.title,status:test.status,attempts:test.results.map(r=>({status:r.status,duration:r.duration,error:r.error?{message:scrub(r.error.message).split('\nCall log:')[0]}:null}))});walk(suite.suites);}}walk(browser.suites);
assert.equal(browser.stats.expected,13);assert.equal(browser.stats.unexpected,0);assert.equal(browser.stats.skipped,0);assert.equal(browser.stats.flaky,0);
write('browser/index.json',Buffer.from(JSON.stringify({stats:browser.stats,rawReportSha256:sha(raw),rawReportLocalOnly:true,cases},null,2)+'\n'));
for(const row of load('b4-rt-visual-review.json').images)write('browser/'+row.path.split('/').slice(-2).join('/'),fs.readFileSync(path.join(root,row.path)));
for(const name of ['check.cjs','extra.cjs','postgres36.cjs','freeze-reader35.cjs','intake-unit-two.cjs','intake-autumn-activities.cjs','review-autumn-and-visuals.cjs','review-autumn-citation-revision.cjs','verify-retention-autumn.cjs','verify-following-before-source-check.cjs','archive-retention-autumn.cjs'])write('tools/'+name,fs.readFileSync(path.join(__dirname,name)));
const bundles=['chinese-g3-autumn-v1.json','chinese-g3-autumn-activities-v1.json'].map(name=>{const file='resources/curriculum/source-lesson-materials/'+name,bytes=fs.readFileSync(path.join(root,file));return{path:file,sha256:sha(bytes),value:JSON.parse(bytes)};});
const groups=bundles.flatMap(b=>b.value.groups),tasks=groups.flatMap(g=>g.exercises.map(e=>({...e,mode:g.mode})));
assert.equal(tasks.length,252);assert.equal(new Set(tasks.map(e=>e.id)).size,252);
for(const bundle of bundles)for(const row of bundle.value.sourceLessons)assert.equal(sha(fs.readFileSync(path.join(root,row.path))),row.sha256);
const head=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});assert.equal(head.status,0);
const receipt={format:'study-block-four-retention-and-autumn-v1',at:new Date().toISOString(),baseCommit:head.stdout.trim(),branch:'main',block:4,blockCompleted:false,wholeGoal:'active',nextBlockEntered:false,
 implementation:{minimumReaderSchema:36,minimumReaderMarker:'ready-schema36-gesp-retention-feedback-v1',firstGroupPolicy:'gesp-first-group-v2',retentionPolicy:'gesp-feedback-delay-v1',
  originalDatesAndReceiptsPreserved:true,recentPracticeAndFailedReviewDelayFullInterval:true,successfulReviewDoesNotMoveLaterIntervals:true,historicalTimingUnknownPreserved:true},
 validation:{fullApi:{passed:full.numPassedTests,failed:full.numFailedTests,conditionalSkips:full.numPendingTests,frozenInputs:run.inputCount,changedInputs:run.changedDuringRun,report:'checks/b4-rt-full-api-vitest.json'},
  focusedApi:{passed:37,failed:0,skipped:0},postgresReader:{passed:5,failed:0,skipped:0},sqlitePersistentRestart:load('b4-rt-sqlite-receipt.json').passed,postgresPersistentRestart:load('b4-gesp-postgres36-receipt.json').passed,
  apiTypeExit:load('b4-rt-api-type3.json').exit,webTypeExit:load('b4-retention-web-type.json').exit,webBuildExit:load('b4-retention-webbuild.json').exit,
  browser:{buildId:'Xdx2xTDzqV1BplmCAhxK9',passed:13,failed:0,skipped:0,retries:0,visuallyReviewedImages:6},
  contentHttpAndColdRead:verifiedNames.map(name=>({report:'checks/'+name,questions:load(name).coldRead.draftQuestions,exactCitationAndSourceMetadataChecked:true}))},
 preservedFailures:{groupAnchorReproduction:{passed:5,failed:1},recentFeedbackReproduction:{passed:5,failed:2},apiTypeFirst:'Two nullable test accesses corrected; original failure retained.',
  harnessSecond:'TEMP prefix collision before start; not a product result.',
  gardenCitationFirst:'First draft/material HTTP saved successfully but preflight reported a seven-character citation. It was not source-qualified; exact eight-character original quotation fixed and strict pre-save plus actual-preflight assertions added. Original reports retained.'},
 content:{newDrafts:6,newDefinitions:26,targetGroups:groups.length,newCandidateQuestions:tasks.length,
  purposeCounts:{immediate:tasks.filter(e=>e.purpose!=='retention').length,proposedRetention:tasks.filter(e=>e.purpose==='retention').length},
  modes:Object.fromEntries(['audio_record','image_upload','short_answer'].map(mode=>[mode,tasks.filter(e=>e.mode===mode).length])),bundles:bundles.map(({path,sha256})=>({path,sha256})),teacherReviewed:false,
  perTargetIntervalSamples:1,fullyStockedRetentionIntervals:0,independentFamiliesApproved:0,publishedPackages:0,adoptions:0,learnerResponses:0},
 formal:{migrated:false,schema:24,revision:188,protectedRuntimeFiles:1063,changesSince187:'Only previously verified actual login events/sessions; never roll live data back to187.'},
 remaining:{registeredBooks:449,booksWithoutDirectory:336,directoryEntries:3512,entriesWithVersionedCandidateDrafts:12,entriesWithoutCandidateDraftsInSelectedInputs:3500,
  next:'Continue exact-source per-lesson content and material/family/scoring reviews; remaining GESP classroom materials and sufficient stock; then block5 engineering and human/device/time-dependent acceptance.'},
 boundaries:{sourcePageImagesCommitted:false,teacherAcceptance:false,realDeviceAcceptance:false,humanRetention:false,rawTracesPrivateLogsAndCredentialsLocalOnly:true,pushed:false,deployed:false}};
write('receipt.json',Buffer.from(JSON.stringify(receipt,null,2)+'\n'));
const manifest=[];function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);assert(!entry.isSymbolicLink());if(entry.isDirectory())scan(file);else{const bytes=fs.readFileSync(file);manifest.push({path:path.relative(dest,file).replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes)});}}}scan(dest);
write('manifest.json',Buffer.from(JSON.stringify({files:manifest,manifestExcludedFromOwnHash:true},null,2)+'\n'));
console.log(JSON.stringify({archiveFiles:manifest.length+1,sources:files.length,fullApiPassed:full.numPassedTests,newCandidateQuestions:tasks.length,blockCompleted:false}));

const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),relative='doc/evidence/2026-11-02/block-four-prediction-first-candidates',dest=path.join(root,relative),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const git=(args,encoding='utf8')=>{const r=spawnSync('git',args,{cwd:root,encoding,maxBuffer:64*1024*1024});assert.equal(r.status,0);return r.stdout;},load=name=>JSON.parse(fs.readFileSync(path.join(__dirname,name)));
assert.equal(git(['branch','--show-current']).trim(),'main');assert.equal(git(['diff','--name-only','--','apps','packages','tests']).trim(),'');
const material=load('prediction-first-materials-http-first.json');assert.equal(material.passed,true);assert.equal(material.coldRead.draftQuestions,91);assert.equal(material.coldRead.exactSourceNamesAndMetadataPreserved,true);
assert(material.drafts.every(d=>!d.gapCodes.includes('citation_not_in_source')));assert.equal(material.coldRead.publications,0);assert.equal(material.coldRead.learnerResponses,0);
if(fs.existsSync(dest))throw Error('New evidence directory required');fs.mkdirSync(dest,{recursive:true});
function write(rel,bytes){const file=path.join(dest,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});assert.equal(sha(fs.readFileSync(file)),sha(bytes));}
const checkNames=['prediction-first-drafts-http-first.json','prediction-first-materials-http-first.json','prediction-first-materials-static-review.json','content-worklist-prediction-first.json'];
for(const name of checkNames)write('checks/'+name,fs.readFileSync(path.join(__dirname,name)));
write('source-intake/reviewed-receipt.json',fs.readFileSync(path.join(root,'data/qa/b4-source-prediction-first/reviewed-receipt.json')));
const files=git(['ls-files','--modified','--others','--exclude-standard']).split(/\r?\n/).filter(file=>/^(apps|packages|resources|scripts|tests)\//.test(file)).map(file=>{const bytes=fs.readFileSync(path.join(root,file));return{path:file,sha256:sha(bytes),base64:bytes.toString('base64')};});
assert.equal(files.length,5);assert(files.every(row=>/^(resources\/curriculum|scripts\/content)\//.test(row.path)));
write('sources.json.gz',zlib.gzipSync(JSON.stringify({format:'study-prediction-first-original-candidates-v1',files})));
const bundleFile='resources/curriculum/source-lesson-materials/chinese-g3-prediction-first-v1.json',bundleBytes=fs.readFileSync(path.join(root,bundleFile)),bundle=JSON.parse(bundleBytes),tasks=bundle.groups.flatMap(g=>g.exercises.map(e=>({...e,mode:g.mode})));
assert.equal(tasks.length,91);assert.equal(new Set(tasks.map(t=>t.id)).size,91);
for(const row of bundle.sourceLessons){assert.equal(sha(fs.readFileSync(path.join(root,row.path))),row.sha256);assert.equal(material.drafts.find(d=>'resources/curriculum/source-lessons/'+d.file===row.path)?.sha256,row.sha256);}
for(const name of ['intake-prediction-first.cjs','review-prediction-first.cjs','archive-prediction-first.cjs','verify-prediction-first.cjs'])write('tools/'+name,fs.readFileSync(path.join(__dirname,name)));
const receipt={format:'study-block-four-prediction-first-candidates-v1',at:new Date().toISOString(),baseCommit:git(['rev-parse','HEAD']).trim(),branch:'main',block:4,blockCompleted:false,wholeGoal:'active',nextBlockEntered:false,
 newDrafts:2,targetGroups:13,targetCounts:[7,6],newDefinitionCandidates:9,newCandidateQuestions:91,purposeCounts:{immediate:39,proposedRetention:52},
 modes:Object.fromEntries(['audio_record','image_upload','short_answer'].map(mode=>[mode,tasks.filter(e=>e.mode===mode).length])),bundle:{path:bundleFile,sha256:sha(bundleBytes)},
 source:{sourceSha256:'02915a7db6517258434d370430bbf464a1dac6e17df97b90d707dc4ecf5cfedf',physicalPages:[51,52,53,54,55,56,57],allSevenPagesVisuallyViewed:true,sourceImagesCommitted:false},
 actualChecks:{draftHttpColdRead:'checks/prediction-first-drafts-http-first.json',materialsHttpColdRead:'checks/prediction-first-materials-http-first.json',
  exactSourceCitationsAndMetadata:true,originalCommandReplayed:true,incompletePublicationRejected:true,allQuestionTextsModesRubricsSourcesMappingsPreserved:true,finalGapCounts:material.drafts.map(d=>({file:d.file,gaps:d.gapCount,codes:d.gapCodes}))},
 reusedEngineering:{sourceCommit:'4d26c399',applicationContractsAndTestsUnchanged:true,fullApi:{passed:3051,failed:0,conditionalSkips:131},browser:{passed:13,failed:0,skipped:0,retries:0},
  evidence:'../block-four-retention-feedback-and-autumn/receipt.json',countsNotAddedToContentBatch:true,newContentUsesIndependentRealHttpVerification:true},
 boundaries:{teacherReviewed:false,fullAuthorCarrotEndingVerified:false,fullAuthorOriginalComparisonPending:true,scoringGoldExamplesAreAuthoredNotLearnerSamples:true,independentFamiliesApproved:0,fullyStockedRetentionIntervals:0,publishedPackages:0,adoptions:0,learnerResponses:0,formalMigrated:false,pushed:false,deployed:false},
 formal:{schema:24,revision:188,protectedRuntimeFiles:1063},remaining:{registeredBooks:449,booksWithoutDirectory:336,directoryInstructionalEntries:3512,entriesWithDrafts:21,entriesWithoutDraftsInSelectedInputs:3491,
  authoredFollowingCandidates:861,firstLesson44FollowupsNotIncludedIn861:true,next:'Continue remaining exact-source lessons and activities, teacher/scoring/family review and sufficient independent stocks, then block5 engineering and real-condition acceptance.'}};
write('receipt.json',Buffer.from(JSON.stringify(receipt,null,2)+'\n'));
const manifest=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);assert(!entry.isSymbolicLink());if(entry.isDirectory())walk(file);else{const bytes=fs.readFileSync(file);manifest.push({path:path.relative(dest,file).replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes)});}}}walk(dest);
write('manifest.json',Buffer.from(JSON.stringify({files:manifest,manifestExcludedFromOwnHash:true},null,2)+'\n'));
console.log(JSON.stringify({archivedFiles:manifest.length+1,sources:files.length,candidates:91,applicationChanged:false,blockCompleted:false}));

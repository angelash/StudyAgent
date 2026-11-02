const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),relative='doc/evidence/2026-11-02/block-four-fairy-next-candidates',dest=path.join(root,relative),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const git=(args,encoding='utf8')=>{const r=spawnSync('git',args,{cwd:root,encoding,maxBuffer:64*1024*1024});assert.equal(r.status,0);return r.stdout;},load=name=>JSON.parse(fs.readFileSync(path.join(__dirname,name)));
assert.equal(git(['branch','--show-current']).trim(),'main');assert.equal(git(['diff','--name-only','--','apps','packages','tests']).trim(),'');
const material=load('fairy-next-materials-http-second.json');assert.equal(material.passed,true);assert.equal(material.coldRead.draftQuestions,91);assert.equal(material.coldRead.exactSourceNamesAndMetadataPreserved,true);
assert(material.drafts.every(d=>!d.gapCodes.includes('citation_not_in_source')));assert.equal(material.coldRead.publications,0);assert.equal(material.coldRead.learnerResponses,0);
for(const name of ['fairy-next-drafts-http-first.json','fairy-next-materials-http-first.json'])assert.equal(load(name).passed,false);
if(fs.existsSync(dest))throw Error('New evidence directory required');fs.mkdirSync(dest,{recursive:true});
function write(rel,bytes){const file=path.join(dest,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});assert.equal(sha(fs.readFileSync(file)),sha(bytes));}
for(const name of ['fairy-next-drafts-http-first.json','fairy-next-materials-http-first.json','fairy-next-materials-http-second.json','fairy-next-materials-static-review.json',
 'fairy-next-contract-boundary.json','fairy-next-nine-targets-first-sources.json.gz','content-worklist-fairy-next.json'])write('checks/'+name,fs.readFileSync(path.join(__dirname,name)));
write('source-intake/reviewed-receipt.json',fs.readFileSync(path.join(root,'data/qa/b4-source-fairy-next/reviewed-receipt.json')));
write('source-intake/science-fetch-receipt.json',fs.readFileSync(path.join(root,'data/qa/b4-source-fairy-next/ruminant-source-fetch-receipt.json')));
const files=git(['ls-files','--modified','--others','--exclude-standard']).split(/\r?\n/).filter(file=>/^(apps|packages|resources|scripts|tests)\//.test(file)).map(file=>{const bytes=fs.readFileSync(path.join(root,file));return{path:file,sha256:sha(bytes),base64:bytes.toString('base64')};});
assert.equal(files.length,7);assert(files.every(row=>/^(resources\/curriculum|scripts\/content)\//.test(row.path)||row.path==='scripts/qa/verify-chinese-following-drafts.cjs'));
write('sources.json.gz',zlib.gzipSync(JSON.stringify({format:'study-fairy-next-original-candidates-v1',files})));
const bundleFile='resources/curriculum/source-lesson-materials/chinese-g3-fairy-next-v1.json',bundleBytes=fs.readFileSync(path.join(root,bundleFile)),bundle=JSON.parse(bundleBytes),tasks=bundle.groups.flatMap(g=>g.exercises.map(e=>({...e,mode:g.mode})));
assert.equal(tasks.length,91);assert.equal(new Set(tasks.map(t=>t.id)).size,91);
for(const row of bundle.sourceLessons){assert.equal(sha(fs.readFileSync(path.join(root,row.path))),row.sha256);assert.equal(material.drafts.find(d=>'resources/curriculum/source-lessons/'+d.file===row.path)?.sha256,row.sha256);}
for(const row of bundle.secondarySourceReviews)assert.equal(sha(fs.readFileSync(path.join(root,row.path))),row.sha256);
for(const name of ['intake-fairy-next.cjs','read-ruminant-source.py','record-ruminant-review.cjs','review-fairy-next.cjs','archive-fairy-next.cjs','verify-fairy-next.cjs'])write('tools/'+name,fs.readFileSync(path.join(__dirname,name)));
const receipt={format:'study-block-four-fairy-next-candidates-v1',at:new Date().toISOString(),baseCommit:git(['rev-parse','HEAD']).trim(),branch:'main',block:4,blockCompleted:false,wholeGoal:'active',nextBlockEntered:false,
 newDrafts:2,targetGroups:13,targetCounts:[8,5],newDefinitionCandidates:10,newCandidateQuestions:91,purposeCounts:{immediate:39,proposedRetention:52},
 modes:Object.fromEntries(['audio_record','image_upload','short_answer'].map(mode=>[mode,tasks.filter(e=>e.mode===mode).length])),bundle:{path:bundleFile,sha256:sha(bundleBytes)},
 source:{sourceSha256:'02915a7db6517258434d370430bbf464a1dac6e17df97b90d707dc4ecf5cfedf',physicalPages:[40,41,42,43,44],allFivePagesVisuallyViewed:true,sourceImagesCommitted:false},
 scienceSource:{reviewFile:bundle.secondarySourceReviews[0],publisher:'Mississippi State University Extension Service',actuallyReadPassages:3,rawHtmlLocalOnly:true,teacherReviewed:false,
  boundary:'Ruminant one stomach with four compartments; foregut microbial food processing; rumination returns food for chewing, not necessarily story sneezing. Primary story numbered route is not a full anatomical chart.',otherTwoPublicFetchesFailed403:true,noChallengeInteraction:true},
 preservedFailures:{firstDraftPreflight400:true,firstMaterialPreflight400:true,nineTargetInputSnapshot:'checks/fairy-next-nine-targets-first-sources.json.gz',existingLimitNotRelaxed:true,
  original98NotCountedAsDelivered:true,sevenStandaloneCommonMeaningSamplesRemoved:true,commonMeaningMethodRemainsInEvidenceTeaching:true,duplicateAlreadyEndedBeforeStopAttempt:true,noProcessActuallyStopped:true},
 actualChecks:{materialsHttpColdRead:'checks/fairy-next-materials-http-second.json',exactSourceCitationsAndMetadata:true,originalCommandReplayed:true,incompletePublicationRejected:true,
  allQuestionTextsModesRubricsSourcesMappingsPreserved:true,oldNineGoalContractRejectedAndCurrent8And5Valid:true,qaPrecheckBeforePerQuestionWrites:true,
  finalGapCounts:material.drafts.map(d=>({file:d.file,gaps:d.gapCount,codes:d.gapCodes}))},
 reusedEngineering:{sourceCommit:'4d26c399',applicationContractsAndTestsUnchanged:true,fullApi:{passed:3051,failed:0,conditionalSkips:131},browser:{passed:13,failed:0,skipped:0,retries:0},
  evidence:'../block-four-retention-feedback-and-autumn/receipt.json',countsNotAddedToContentBatch:true,newContentAndQaScriptUseIndependentVerification:true},
 boundaries:{teacherReviewed:false,scoringGoldExamplesAreAuthoredNotLearnerSamples:true,independentFamiliesApproved:0,fullyStockedRetentionIntervals:0,publishedPackages:0,adoptions:0,learnerResponses:0,formalMigrated:false,pushed:false,deployed:false},
 formal:{schema:24,revision:188,protectedRuntimeFiles:1063},remaining:{registeredBooks:449,booksWithoutDirectory:336,directoryInstructionalEntries:3512,entriesWithDrafts:16,entriesWithoutDraftsInSelectedInputs:3496,
  authoredFollowingCandidates:658,firstLesson44FollowupsNotIncludedIn658:true,next:'Continue exact-source unit3 writing, garden and reading activity, remaining textbook/GESP content and sufficient independent stocks; then block5 and teacher/device/time acceptance.'}};
write('receipt.json',Buffer.from(JSON.stringify(receipt,null,2)+'\n'));
const manifest=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);assert(!entry.isSymbolicLink());if(entry.isDirectory())walk(file);else{const bytes=fs.readFileSync(file);manifest.push({path:path.relative(dest,file).replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes)});}}}walk(dest);
write('manifest.json',Buffer.from(JSON.stringify({files:manifest,manifestExcludedFromOwnHash:true},null,2)+'\n'));
console.log(JSON.stringify({archivedFiles:manifest.length+1,sources:files.length,candidates:91,applicationChanged:false,blockCompleted:false}));

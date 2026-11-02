const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),dest=path.join(root,'doc/evidence/2026-11-02/block-four-content-and-gesp-first-response');
const load=name=>JSON.parse(fs.readFileSync(path.join(__dirname,name))),full=load('b4-group-full-api-vitest.json'),run=load('b4-group-full-api.json');
if(run.exit||run.changedDuringRun.length||full.numFailedTests)throw Error('Full regression required');
const receipt={format:'study-block-four-local-development-checkpoint-v1',at:new Date().toISOString(),branch:'main',block:4,blockCompleted:false,wholeGoal:'active',nextBlockEntered:false,
 sourceSnapshot:'sources-final.json.gz',sourceFiles:44,priorSnapshotsPreserved:true,
 implementation:{firstLessonFollowupQuestions:44,proposedFirstLessonStructures:32,followingLessonDrafts:5,followingTwoLessonQuestionCandidates:105,activityDraftTargets:[5,5,6],
  gesp:{targets:49,originalActivities:245,policy:'gesp-first-group-v2',minimumReaderSchema:35}},
 validation:{fullApi:{passed:full.numPassedTests,failed:full.numFailedTests,conditionalSkips:full.numPendingTests,inputCount:run.inputCount,changedInputs:run.changedDuringRun,report:'checks/b4-group-full-api-vitest.json'},
  focusedApi:{passed:32,failed:0,skipped:0,report:'checks/b4-group-focused-vitest.json'},postgresReader:{passed:4,failed:0,skipped:0,report:'checks/b4-reader-postgres35-receipt.json'},
  sqliteRestart:'checks/b4-group-sqlite-receipt.json',postgresRestart:'checks/b4-gesp-postgres35-receipt.json',
  browser:{buildId:'pwEjykKsqWUJsQO10qXe0',passed:13,failed:0,skipped:0,retries:0,report:'browser/schema35-first-index.json'},
  followingMaterials:'checks/following-materials-http-citations-final.json',activityDrafts:'checks/unit-activities-http-first.json',
  sourceDifference:'checks/main-vs-frozen-qa-final.json',credentialAndProtection:'checks/b4-prearchive-protection.json'},
 formal:{migrated:false,schema:24,revision:188,liveRevisionChange:'Only sessions/events changed at the independently observed live auth.logged_in; no rollback.',protectedRuntimeFiles:1063},
 boundaries:{teacherReview:false,independentFamiliesApproved:0,publishedTeachingPackages:0,adoptions:0,learnerResponsesCreated:0,sourceOriginalPagesCommitted:false,rawBrowserTracesAndCredentialsLocalOnly:true,pushed:false,deployed:false},
 remaining:{registeredBooks:449,booksWithoutDirectory:336,directoryEntries:3512,entriesWithVersionedCandidateDrafts:6,entriesWithoutCandidateDraftsInSelectedInputs:3506,
  required:'Continue per-lesson content, material/scoring/family reviews, classroom/media verification, sufficient retention stocks and adoption; then block5 engineering and human/device/time-dependent acceptance.'}};
fs.writeFileSync(path.join(dest,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
fs.copyFileSync(__filename,path.join(dest,'tools/final/final-receipt.cjs'));
const files=[],sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('No evidence links');if(entry.isDirectory())walk(file);else{const bytes=fs.readFileSync(file);files.push({path:path.relative(dest,file).replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes)});}}}
walk(dest);fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify({at:new Date().toISOString(),files,manifestExcludedFromOwnHash:true},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({files:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0),fullApiPassed:full.numPassedTests,blockCompleted:false}));

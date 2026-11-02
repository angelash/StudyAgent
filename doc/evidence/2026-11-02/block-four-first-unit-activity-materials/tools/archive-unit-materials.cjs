const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),relative='doc/evidence/2026-11-02/block-four-first-unit-activity-materials',dest=path.join(root,relative),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(fs.existsSync(dest))throw Error('New evidence directory required');fs.mkdirSync(dest,{recursive:true});
function write(file,bytes){const target=path.join(dest,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});if(sha(fs.readFileSync(target))!==sha(bytes))throw Error('Archive readback differs');}
const checks=['b4-paragraph-browser-first.json','b4-paragraph-browser-first-inputs.json.gz','paragraph-cold-read-first.json','unit-activity-materials-http-first.json','following-materials-feedback-final.json','content-worklist-activities-materials-first.json'];
for(const name of checks)write('checks/'+name,fs.readFileSync(path.join(__dirname,name)));
const sources=spawnSync('git',['diff','--name-only','--','apps','packages'],{cwd:root,encoding:'utf8'});if(sources.status||sources.stdout.trim())throw Error('Application or contract change requires its own verification');
const inventory=spawnSync('git',['ls-files','--modified','--others','--exclude-standard'],{cwd:root,encoding:'utf8'});if(inventory.status)throw Error('Source inventory failed');
const files=inventory.stdout.trim().split(/\r?\n/).filter(file=>/^(apps|packages|resources|scripts|tests)\//.test(file)).map(file=>{const bytes=fs.readFileSync(path.join(root,file));return{path:file,sha256:sha(bytes),base64:bytes.toString('base64')};});
write('sources.json.gz',zlib.gzipSync(JSON.stringify({format:'study-unit-activity-candidate-source-v1',files})));
const reports=['unit-activity-materials-http-first.json','following-materials-feedback-final.json'].map(name=>JSON.parse(fs.readFileSync(path.join(__dirname,name))));
if(reports.some(r=>!r.passed||r.drafts.some(d=>d.gapCodes.includes('citation_not_in_source'))))throw Error('HTTP and exact-source checks required');
const bundles=['chinese-g3-following-v1.json','chinese-g3-unit-activities-v1.json'].map(name=>{const file='resources/curriculum/source-lesson-materials/'+name,bytes=fs.readFileSync(path.join(root,file));return{path:file,sha256:sha(bytes),value:JSON.parse(bytes)};});
const groups=bundles.flatMap(row=>row.value.groups),tasks=groups.flatMap(g=>g.exercises.map(e=>({...e,mode:g.mode})));if(tasks.length!==217||new Set(tasks.map(e=>e.id)).size!==217)throw Error('Candidate identity mismatch');
const raw=fs.readFileSync(path.join(root,'data/qa/p187/data/qa/b4-paragraph-browser-first-browser.json')),browser=JSON.parse(raw),cases=[];
function walk(suites){for(const suite of suites??[]){for(const spec of suite.specs??[])for(const test of spec.tests??[])cases.push({file:spec.file,title:spec.title,status:test.status,attempts:test.results.map(result=>({status:result.status,duration:result.duration}))});walk(suite.suites);}}walk(browser.suites);
if(browser.stats.expected!==2||browser.stats.unexpected||browser.stats.skipped||browser.stats.flaky)throw Error('Both paragraph browser cases must pass');
write('browser-index.json',Buffer.from(JSON.stringify({stats:browser.stats,rawReportSha256:sha(raw),rawReportLocalOnly:true,cases},null,2)+'\n'));
for(const name of ['paragraph-browser.cjs','archive-unit-materials.cjs'])write('tools/'+name,fs.readFileSync(path.join(__dirname,name)));
const verifier=fs.readFileSync(path.join(__dirname,'verify.cjs'),'utf8').replaceAll('block-four-content-and-gesp-first-response','block-four-first-unit-activity-materials');
fs.writeFileSync(path.join(__dirname,'verify-unit-materials.cjs'),verifier,{flag:'wx'});write('tools/verify.cjs',Buffer.from(verifier));
const head=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});if(head.status)throw Error('Base commit unavailable');
const receipt={format:'study-block-four-unit-activity-materials-v1',at:new Date().toISOString(),baseCommit:head.stdout.trim(),branch:'main',block:4,blockCompleted:false,wholeGoal:'active',
 newCandidateQuestions:112,prior105QuestionsAreRevisedFeedbackNot105AdditionalQuestions:true,materialGroups:groups.length,totalCandidateQuestions:tasks.length,
 purposeCounts:{immediate:tasks.filter(e=>e.purpose!=='retention').length,proposedRetention:tasks.filter(e=>e.purpose==='retention').length},
 modes:Object.fromEntries(['audio_record','image_upload','short_answer'].map(mode=>[mode,tasks.filter(e=>e.mode===mode).length])),
 bundles:bundles.map(({path,sha256})=>({path,sha256})),
 actualChecks:{httpDraftAndColdRead:checks.filter(n=>n.includes('http')||n.includes('feedback-final')),paragraphBrowser:{passed:2,failed:0,skipped:0,retries:0,buildId:'pwEjykKsqWUJsQO10qXe0'},paragraphReadOnlyNativeColdRead:'checks/paragraph-cold-read-first.json'},
 reuse:{applicationAndContractsUnchanged:true,fullApiPassed:3046,fullApiFailed:0,fullApiConditionalSkipped:131,previousEvidence:'../block-four-content-and-gesp-first-response/receipt.json',newBrowserCasesNotAddedToEarlier13CaseBatch:true},
 boundaries:{teacherReviewed:false,scoringGoldSamplesAreAuthoredNotLearnerEvidence:true,independentFamiliesApproved:0,fullyStockedRetentionIntervals:0,publishedPackages:0,adoptions:0,learnerResponsesFromContentJourney:0,paragraphJourneyIsSyntheticProtocolEvidence:true,formalMigrated:false,pushed:false,deployed:false},
 remaining:'Target/scoring/family teacher reviews, additional independent structures and sufficient interval stocks, actual teaching and learner evidence, remaining textbook drafts and block5.'};
write('receipt.json',Buffer.from(JSON.stringify(receipt,null,2)+'\n'));
const manifest=[];function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('No evidence links');if(e.isDirectory())scan(file);else{const b=fs.readFileSync(file);manifest.push({path:path.relative(dest,file).replaceAll('\\','/'),bytes:b.length,sha256:sha(b)});}}}scan(dest);write('manifest.json',Buffer.from(JSON.stringify({files:manifest,manifestExcludedFromOwnHash:true},null,2)+'\n'));
console.log(JSON.stringify({sourceFiles:files.length,candidateQuestions:217,newQuestions:112,applicationChanged:false,browserPassed:2,blockCompleted:false}));

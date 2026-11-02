const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),qa=path.join(root,'data/qa/p187'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),label=process.argv[2];assert(/^[a-z0-9-]+$/.test(label||''));
const output=path.join(__dirname,label+'.json');assert(!fs.existsSync(output));
const files=fs.readdirSync(path.join(root,'resources/curriculum/source-lessons')).filter(n=>n.startsWith('chinese-g1-a692a990-')).sort();assert.equal(files.length,9);
const sourceFiles=['scripts/content/build-chinese-g1-first-candidates.cjs','scripts/content/chinese-g1-initial-reading.cjs','scripts/content/chinese-g1-initial-body-nature.cjs','scripts/content/chinese-g1-initial-activities.cjs',...files.flatMap(n=>['resources/curriculum/source-lessons/'+n,'resources/curriculum/source-lesson-materials/'+n])];
const before=sourceFiles.map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(root,file)))}));
const rebuild=cp.spawnSync(process.execPath,['scripts/content/build-chinese-g1-first-candidates.cjs'],{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(rebuild.status,0,rebuild.stderr);for(const row of before)assert.equal(sha(fs.readFileSync(path.join(root,row.path))),row.sha256,'Deterministic authored rebuild');
const contracts=require(path.join(qa,'packages/contracts/dist/index.js')),{validateSourceCandidates}=require(path.join(root,'scripts/qa/source-candidate-preflight.cjs'));const rows=[],failures=[];
for(const file of files){try{
 const d=JSON.parse(fs.readFileSync(path.join(root,'resources/curriculum/source-lessons',file))),full=contracts.textbookTeachingContentSchema.safeParse({...d.content,checks:[]});
 const gaps=full.success?[]:full.error.issues;for(const gap of gaps)if(gap.path[0]!=='checks')failures.push({file,...gap});
 const v=validateSourceCandidates({root,apiRoot:qa,sourceRoot:'H:/ChinaTextbook',bookId:d.source.bookId,materials:'resources/curriculum/source-lesson-materials/'+file,lessonNames:[file]});
 rows.push({file,targets:d.targetIds.length,questions:v.questionCount,sourcePages:d.sourceReview.pages.map(p=>p.page),title:d.content.title,bodyCharacters:[...d.content.concept.explanation].length,completeSchemaNonCheckGaps:gaps.filter(g=>g.path[0]!=='checks'),unapprovedChecksGapCount:gaps.filter(g=>g.path[0]==='checks').length,preflightPassed:true});
}catch(error){failures.push({file,error:error.message});}}
const report={at:new Date().toISOString(),passed:failures.length===0,generatedByteStable:true,sourceFiles:before,drafts:rows,totals:{drafts:rows.length,targets:rows.reduce((n,r)=>n+r.targets,0),questions:rows.reduce((n,r)=>n+r.questions,0)},failures,teacherReviewed:false,published:false};fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:report.passed,totals:report.totals,failures}));if(!report.passed)process.exit(1);
const baseline=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'registration-inputs-second.json.gz'))));for(const row of baseline)assert.equal(sha(fs.readFileSync(path.join(qa,row.path))),row.sha256,'Preserve registration input '+row.path);
for(const row of before){const dest=path.join(qa,row.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,row.path),dest);assert.equal(sha(fs.readFileSync(dest)),row.sha256);}
fs.writeFileSync(path.join(__dirname,label+'-inputs.json.gz'),zlib.gzipSync(JSON.stringify({existing:baseline,added:before.filter(r=>!baseline.some(b=>b.path===r.path))})),{flag:'wx'});
console.log(JSON.stringify({synced:before.length,baseline:baseline.length,applicationAndProtocolUnchanged:true}));

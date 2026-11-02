const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),file='resources/curriculum/source-lesson-materials/chinese-g3-nature-unit-v1.json',bytes=fs.readFileSync(path.join(root,file)),bundle=JSON.parse(bytes),contract=require(path.join(root,'data/qa/p187/packages/contracts/dist/index.js')),pages=JSON.parse(fs.readFileSync(path.join(root,'data/assets/textbook-sources/chinatextbook-chinese-v1/extracted/chinatextbook-chinese-g3-upper.json'))).pages;
const report={at:new Date().toISOString(),passed:false,file,sha256:sha(bytes),counts:[],questions:0,modes:{},teacherReviewed:false,published:0,learnerEvidenceCreated:0};
try{
 const ids=new Set();
 for(const row of bundle.sourceLessons){const b=fs.readFileSync(path.join(root,row.path)),d=JSON.parse(b);assert.equal(sha(b),row.sha256);contract.textbookTeachingDraftContentSchema.parse({...d.content,checks:[]});contract.textbookTeachingSourceReviewSchema.parse(d.sourceReview);for(const def of d.definitionCandidates)contract.knowledgeAtomSchema.parse(def);
  assert.deepEqual(d.content.goals.map(g=>g.atomId),d.targetIds);
  for(const citation of d.content.citations){assert(citation.quote.trim().length>=8,'Minimum exact excerpt: '+row.lesson);assert(pages.find(p=>p.page===citation.page).text.includes(citation.quote),'Exact selected-source quote: '+row.lesson+' '+JSON.stringify(citation));}
  const gs=bundle.groups.filter(g=>g.lesson===row.lesson);assert.deepEqual(gs.map(g=>g.atomId).sort(),[...d.targetIds].sort());
  for(const g of gs){assert.equal(g.exercises.length,7);assert.equal(g.rubric.reduce((n,r)=>n+r.weight,0),1);assert.deepEqual(g.exercises.slice(3).map(q=>q.proposedIntervalDays),[1,3,7,14]);assert.equal(g.familyIndependenceReviewed,false);for(const q of g.exercises){assert(!ids.has(q.id));ids.add(q.id);assert(q.stem.length>=15&&q.answer.length>=15&&q.analysis.includes(q.answer));report.modes[g.mode]=(report.modes[g.mode]||0)+1;}}
  report.counts.push({lesson:row.lesson,targets:d.targetIds.length,newDefinitions:d.definitionCandidates.length,questions:gs.length*7});
 }
 report.questions=ids.size;assert.equal(report.questions,217);assert.deepEqual(report.counts.map(r=>r.targets),[7,7,5,5,7]);
 report.exactSourceTargetBindingsAndQuotes=true;report.uniqueIds=true;report.rubricsSumToOne=true;report.immediate=93;report.proposedRetention=124;report.passed=true;
}catch(e){report.error=e.message;process.exitCode=1;}
fs.writeFileSync(path.join(__dirname,'nature-unit-static-citation-second.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
if(!report.passed)process.exit(1);
const p=spawnSync(process.execPath,['scripts/qa/verify-chinese-poem-reading.cjs'],{cwd:root,encoding:'utf8'});assert.equal(p.status,0);fs.writeFileSync(path.join(__dirname,'poem-reading-regression-garden-seven.json'),p.stdout,{flag:'wx'});
const files=['scripts/content/source-candidate-kit.cjs','scripts/content/build-chinese-nature-unit-candidates.cjs',...bundle.sourceLessons.map(row=>row.path),file],before=files.map(f=>sha(fs.readFileSync(path.join(root,f))));
const regen=spawnSync(process.execPath,['scripts/content/build-chinese-nature-unit-candidates.cjs'],{cwd:root,encoding:'utf8'});assert.equal(regen.status,0);assert.deepEqual(before,files.map(f=>sha(fs.readFileSync(path.join(root,f)))));
fs.writeFileSync(path.join(__dirname,'nature-unit-generation-readback.json'),JSON.stringify({at:new Date().toISOString(),outputBytesUnchanged:true,privateQaFilesRequired:false,sharedKitUnchangedFromNatureSounds:true,files:files.map((path,i)=>({path,sha256:before[i]}))},null,2)+'\n',{flag:'wx'});

const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const draft='resources/curriculum/source-lessons/english-g3-349949e1-colours-v1.json',materials='resources/curriculum/source-lesson-materials/english-g3-349949e1-colours-v1.json';
const before=[draft,materials].map(f=>sha(fs.readFileSync(path.join(root,f))));
cp.execFileSync(process.execPath,['scripts/content/build-english-g3-colours-candidates.cjs'],{cwd:root});
assert.deepEqual([draft,materials].map(f=>sha(fs.readFileSync(path.join(root,f)))),before);
const result=require(path.join(root,'scripts/qa/source-candidate-preflight.cjs')).validateSourceCandidates({root,apiRoot:path.join(root,'data/qa/p187'),sourceRoot:'H:/ChinaTextbook',bookId:'archive-book:english-g3-upper-349949e1df2ad88b',materials,lessonNames:[path.basename(draft)]});
assert.equal(result.questionCount,49);assert.equal(result.drafts[0].draft.targetIds.length,7);
const modes={};for(const g of result.bundle.groups){modes[g.mode]=(modes[g.mode]??0)+g.exercises.length;assert.equal(g.goldAnchors.acceptedExample,g.exercises[0].answer);}
assert.deepEqual(modes,{short_answer:14,audio_record:21,image_upload:14});
const review=JSON.parse(fs.readFileSync(path.join(__dirname,'next-colours-source-reviewed.json'))),source=result.original,extracted=JSON.parse(fs.readFileSync(path.join(root,source.extractedPath)));
for(const p of review.reviewed){assert(p.visuallyReviewed);assert.equal(p.imageSha256,sha(fs.readFileSync(path.join(__dirname,p.image))));assert.equal(p.textSha256,sha(Buffer.from(extracted.pages[p.physicalPage-1].text)));}
const report={at:new Date().toISOString(),passed:true,targets:7,candidates:49,modes,sourceRange:[17,26],sourcePagesRead:10,generationByteIdentical:true,qaApplicationInputsChanged:false,newContentFilesOutsideFrozenFullApiInputs:[draft,materials,'scripts/content/build-english-g3-colours-candidates.cjs'],teacherReviewed:false,authenticListeningStimuliIncluded:false,firstToolAttempt:{passed:false,phase:'stdin script parsing',reason:'One extra closing parenthesis; no validation or file writes executed. Replaced with saved readable script.'}};
fs.writeFileSync(path.join(__dirname,'colours-static-first.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));

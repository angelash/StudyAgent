const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),sourceDirectory='data/qa/b4-source-fairy-next',render=JSON.parse(fs.readFileSync(path.join(root,sourceDirectory,'render-receipt.json')));
const notes=[
 '物理40：作者张之路，捉迷藏、红头误入牛嘴、青头急问和初次帮助。',
 '物理41：青头持续安慰和帮助，红头按故事第一第二胃回到牛嘴；原文只有第四消化的简化以已读大学科普三段核对，不作为正确完整科学结论发布。',
 '物理42：喷嚏脱险、13字识读与13字书写、分角色朗读、至少三处友谊依据、画路线再讲故事；图为故事路线而非完整生理机制。',
 '物理43：作者辛勤，略读奶酪任务、约定对队长同样适用、奶酪掉渣与诱惑犹豫，心理不等实际偷吃。',
 '物理44：调开队伍、独自犹豫、叫回并分配最小者、完成搬运；12字识读，处罚chǔ稍息shào，无写字表与全文背诵任务。',
];
for(const row of render.pages)assert.equal(sha(fs.readFileSync(path.join(root,sourceDirectory,row.path))),row.sha256);
fs.writeFileSync(path.join(root,sourceDirectory,'reviewed-receipt.json'),JSON.stringify({at:new Date().toISOString(),sourceSha256:render.sourceSha256,allFivePagesVisuallyViewed:true,teacherReviewed:false,sourceImagesLocalOnly:true,
 pages:render.pages.map((row,index)=>({...row,visualChecked:true,facts:notes[index]})),readingDoesNotGrantPublication:true},null,2)+'\n',{flag:'wx'});
const file='resources/curriculum/source-lesson-materials/chinese-g3-fairy-next-v1.json',bytes=fs.readFileSync(path.join(root,file)),bundle=JSON.parse(bytes),tasks=bundle.groups.flatMap(g=>g.exercises.map(e=>({...e,mode:g.mode})));
assert.equal(bundle.groups.length,13);assert.equal(tasks.length,91);assert.equal(new Set(tasks.map(t=>t.id)).size,91);assert.equal(bundle.teacherReviewed,false);assert.equal(bundle.automaticPublication,false);
for(const row of bundle.sourceLessons){const draftBytes=fs.readFileSync(path.join(root,row.path)),draft=JSON.parse(draftBytes);assert.equal(sha(draftBytes),row.sha256);assert.deepEqual(bundle.groups.filter(g=>g.lesson===row.lesson).map(g=>g.atomId).sort(),[...draft.targetIds].sort());}
for(const row of bundle.secondarySourceReviews)assert.equal(sha(fs.readFileSync(path.join(root,row.path))),row.sha256);
for(const group of bundle.groups){assert.equal(group.familyIndependenceReviewed,false);assert.equal(group.exercises.length,7);assert.deepEqual(group.exercises.slice(3).map(e=>e.proposedIntervalDays),[1,3,7,14]);assert.equal(group.rubric.reduce((n,r)=>n+r.weight,0),1);}
fs.writeFileSync(path.join(__dirname,'fairy-next-materials-static-review.json'),JSON.stringify({at:new Date().toISOString(),file,sha256:sha(bytes),groups:13,questions:91,purposeCounts:{immediate:39,proposedRetention:52},
 modes:Object.fromEntries(['audio_record','image_upload','short_answer'].map(mode=>[mode,tasks.filter(t=>t.mode===mode).length])),primaryAndSecondaryBindingsMatch:true,targetGroupsComplete:true,
 reviewedBoundaries:'At least3 distinct friendship episodes, actual role-reading, original13 handwritten characters, personal story-route drawing and oral retelling. Story route not a full anatomical diagram; four compartments and foregut digestion based on3 actually read university-extension passages. Cheese recognition12 characters, shao4 command; thoughts are not completed actions, different justified views accepted.',
 teacherReviewed:false,scoringReviewed:false,familyIndependenceReviewed:false,fullyStockedRetentionIntervals:0,published:false,learnerEvidence:false},null,2)+'\n',{flag:'wx'});
const contracts=require(path.join(root,'data/qa/p187/packages/contracts/dist/index.js')),first=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'fairy-next-nine-targets-first-sources.json.gz'))));
const old=JSON.parse(Buffer.from(first.files.find(row=>row.path.endsWith('/chinese-g3-cow-journey-v1.json')).base64,'base64'));
const oldParsed=contracts.textbookTeachingDraftContentSchema.safeParse({...old.content,checks:[]});assert.equal(oldParsed.success,false);assert(oldParsed.error.issues.some(issue=>issue.path.join('.')==='goals'&&issue.code==='too_big'));
const current=bundle.sourceLessons.map(row=>JSON.parse(fs.readFileSync(path.join(root,row.path))));for(const draft of current)contracts.textbookTeachingDraftContentSchema.parse({...draft.content,checks:[]});
fs.writeFileSync(path.join(__dirname,'fairy-next-contract-boundary.json'),JSON.stringify({at:new Date().toISOString(),actualCompiledContract:'data/qa/p187/packages/contracts/dist/index.js',oldNineGoalContentRejected:true,
 firstHttpDraftAndMaterialReportsBothFailed400:true,duplicateRunEndedBeforeAttemptedStop:true,noProcessWasStopped:true,
 currentGoalCounts:current.map(d=>d.targetIds.length),currentContentProtocolValid:true,existingEightTargetBoundaryPreserved:true,
 correction:'Common vocabulary method integrated in evidence explanations; seven distinct textbook/science targets retained. Seven standalone generic meaning candidates removed; final91, not98. No application limit or grading rule relaxed.',
 newQaPrecheck:'Current verifier parses all selected draft content, source review and definition contracts, then checks target and material bindings before administrator bootstrap or per-question writes.',
 sourceInputSnapshot:'fairy-next-nine-targets-first-sources.json.gz',realLearnerEvidence:false},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({visuallyReviewedPages:5,currentTargets:[8,5],questions:91,oldNineTargetContractRejected:true,teacherReviewed:false}));

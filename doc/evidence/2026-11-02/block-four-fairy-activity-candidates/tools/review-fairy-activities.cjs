const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),dir='data/qa/b4-source-fairy-activities-first',render=JSON.parse(fs.readFileSync(path.join(root,dir,'render-receipt.json')));
const notes=[
 '物理45：习作九词角色时间地点，任选一个或几个可增加角色，构思问题与写后小声读，题目可尝试加且纸面居中，无统一字数要求。',
 '物理46：交流童话想象、六组字形比较及申介绍宗乙召孝七字识读，绍不能按六组漏计，无写字表。',
 '物理47：口字吃含动作/发声/拟声样例、改正增补删除三符号及示例、三条讲理谚语；操作目的与原稿需实际表现。',
 '物理48：推荐安徒生童话，拇指姑娘节选，叶君健译有改动，寒冷高空入羽毛与温暖国度画面已读，非整篇整本。',
 '物理49：想象代入角色提示，叶圣陶稻草人与德国格林兄弟搜集整理格林童话推荐；只核对当前推荐页，不称三本原作已读。',
];
for(const row of render.pages)assert.equal(sha(fs.readFileSync(path.join(root,dir,row.path))),row.sha256);
fs.writeFileSync(path.join(root,dir,'reviewed-receipt.json'),JSON.stringify({at:new Date().toISOString(),sourceSha256:render.sourceSha256,allFivePagesVisuallyViewed:true,sourceImagesLocalOnly:true,teacherReviewed:false,recommendedWholeBooksActuallyRead:false,
 pages:render.pages.map((row,index)=>({...row,visualChecked:true,facts:notes[index]}))},null,2)+'\n',{flag:'wx'});
const file='resources/curriculum/source-lesson-materials/chinese-g3-fairy-activities-v1.json',bytes=fs.readFileSync(path.join(root,file)),bundle=JSON.parse(bytes),tasks=bundle.groups.flatMap(g=>g.exercises.map(e=>({...e,mode:g.mode})));
assert.equal(bundle.groups.length,16);assert.equal(tasks.length,112);assert.equal(new Set(tasks.map(t=>t.id)).size,112);assert.equal(bundle.teacherReviewed,false);assert.equal(bundle.automaticPublication,false);
for(const row of bundle.sourceLessons){const b=fs.readFileSync(path.join(root,row.path)),draft=JSON.parse(b);assert.equal(sha(b),row.sha256);assert.deepEqual(bundle.groups.filter(g=>g.lesson===row.lesson).map(g=>g.atomId).sort(),[...draft.targetIds].sort());}
for(const group of bundle.groups){assert.equal(group.familyIndependenceReviewed,false);assert.equal(group.exercises.length,7);assert.deepEqual(group.exercises.slice(3).map(e=>e.proposedIntervalDays),[1,3,7,14]);assert.equal(group.rubric.reduce((n,r)=>n+r.weight,0),1);}
const report={at:new Date().toISOString(),file,sha256:sha(bytes),groups:16,questions:112,purposeCounts:{immediate:48,proposedRetention:64},modes:Object.fromEntries(['audio_record','image_upload','short_answer'].map(mode=>[mode,tasks.filter(t=>t.mode===mode).length])),
 exactDraftBindingsMatch:true,targetGroupsComplete:true,allQuestionIdsUnique:true,rubricWeightsSumToOne:true,
 reviewedBoundaries:'Optional word selection and added characters; title optional, paper centering only when provided. Seven recognition characters including shao4 in jieshao. Oral output and actual personal revision required for corresponding media tasks. Mouth grouping based on word meaning, not universal same-radical law. Proverb reasoning needs evidence. Recommended books/excerpt/plans/actual reading separated; no claim whole works read or student progress created.',
 teacherReviewed:false,scoringReviewed:false,familyIndependenceReviewed:false,fullyStockedRetentionIntervals:0,published:false,learnerEvidence:false,recommendedWholeBooksActuallyRead:false};
fs.writeFileSync(path.join(__dirname,'fairy-activities-materials-static-review.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({reviewedPages:5,groups:16,candidates:112,wholeBooksRead:false,teacherReviewed:false}));

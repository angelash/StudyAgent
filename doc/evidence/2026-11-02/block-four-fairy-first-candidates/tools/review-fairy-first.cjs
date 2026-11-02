const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),sourceDirectory='data/qa/b4-source-fairy-first',render=JSON.parse(fs.readFileSync(path.join(root,sourceDirectory,'render-receipt.json')));
const notes=[
 '物理33：卖火柴的小女孩开端、丢鞋与冷饿无人买火柴；丹麦安徒生、叶君健译，选文有改动。',
 '物理34：墙角与家中寒冷处境、首次擦燃想象火炉；点火不是课堂操作任务。',
 '物理35：火炉消失、烤鹅、圣诞树及火灭冷墙，幻想与现实分清。',
 '物理36：奶奶出现、最后一大把想留住奶奶，叙述次数与根数分别统计。',
 '物理37：明确冻死结局、15字识读与13字书写、朗读及擦燃情节/愿望和感受任务；不加全文背诵，不把幻想幸福当实际获救。',
 '物理38：那一定会很好略读提示、默读和自己的话讲历程、作者流火；种子成长与农夫加工手推车。',
 '物理39：手推车椅子木地板转变、年老处境与愿望、满意感受；八字缩努茎锯斧推吱拆，无写字表或全文背诵，觉得成树非实际返生。',
];
for(const row of render.pages)assert.equal(sha(fs.readFileSync(path.join(root,sourceDirectory,row.path))),row.sha256);
fs.writeFileSync(path.join(root,sourceDirectory,'reviewed-receipt.json'),JSON.stringify({at:new Date().toISOString(),sourceSha256:render.sourceSha256,allSevenPagesVisuallyViewed:true,teacherReviewed:false,sourceImagesLocalOnly:true,
 pages:render.pages.map((row,index)=>({...row,visualChecked:true,facts:notes[index]})),readingDoesNotGrantPublication:true},null,2)+'\n',{flag:'wx'});
const file='resources/curriculum/source-lesson-materials/chinese-g3-fairy-first-v1.json',bytes=fs.readFileSync(path.join(root,file)),bundle=JSON.parse(bytes),tasks=bundle.groups.flatMap(g=>g.exercises.map(e=>({...e,mode:g.mode})));
assert.equal(bundle.groups.length,14);assert.equal(tasks.length,98);assert.equal(new Set(tasks.map(t=>t.id)).size,98);assert.equal(bundle.teacherReviewed,false);assert.equal(bundle.automaticPublication,false);
for(const row of bundle.sourceLessons){const draftBytes=fs.readFileSync(path.join(root,row.path)),draft=JSON.parse(draftBytes);assert.equal(sha(draftBytes),row.sha256);assert.deepEqual(bundle.groups.filter(g=>g.lesson===row.lesson).map(g=>g.atomId).sort(),[...draft.targetIds].sort());}
for(const group of bundle.groups){assert.equal(group.familyIndependenceReviewed,false);assert.equal(group.exercises.length,7);assert.deepEqual(group.exercises.slice(3).map(e=>e.proposedIntervalDays),[1,3,7,14]);assert.equal(group.rubric.reduce((n,r)=>n+r.weight,0),1);}
const report={at:new Date().toISOString(),file,sha256:sha(bytes),groups:14,questions:98,purposeCounts:{immediate:42,proposedRetention:56},modes:Object.fromEntries(['audio_record','image_upload','short_answer'].map(mode=>[mode,tasks.filter(t=>t.mode===mode).length])),
 checks:{exactDraftHashes:true,targetGroupsComplete:true,uniqueQuestionIds:true,rubricWeightsSumToOne:true,sevenSamplesPerTarget:true,proposedIntervals:[1,3,7,14]},
 contentReview:'Five ignition episodes versus unknown match total; last episode a handful. Dreamed happiness does not erase death, no death-as-solution conclusion or fire action. Current polyphonic words follow exact page. Tree journey separates growth, human processing and role feelings; no real axe/saw task. Reading and handwriting require personal actual media; no full-text recitation added.',
 teacherReviewed:false,scoringReviewed:false,familyIndependenceReviewed:false,fullyStockedRetentionIntervals:0,published:false,learnerEvidence:false};
fs.writeFileSync(path.join(__dirname,'fairy-first-materials-static-review.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({reviewedPages:7,groups:14,candidates:98,teacherReviewed:false}));

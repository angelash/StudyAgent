const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),write=(file,value)=>fs.writeFileSync(path.join(root,file),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const sourceDirectory='data/qa/b4-source-autumn-activities-first',render=JSON.parse(fs.readFileSync(path.join(root,sourceDirectory,'render-receipt.json')));
const notes=[
 '物理27：略读诗听听秋的声音，毕国瑛；有感情朗读、边读边想象、交流声音。前半黄叶蟋蟀大雁秋风，拟人与实际声音分清。',
 '物理28：完整后半诗、抖蟋蟀振韵掠吟辽阔九字识读，未见写字表或全文背诵任务；汗水谷粒保持诗意表达范围。',
 '物理29：写日记完整例文、日期8月20日星期一晴，无年份；三项交流及坚持记录建议，例文换牙不作模仿操作。',
 '物理30：园地交流理解词方法、四季表达、憧憬与忐忑不安上下文；查字典为方法示例，担心责备不等于已经发生。',
 '物理31：狂排铺票盖寒臂假八字，横画平稳竖画端正、钢笔姿势提示；九个秋景四字词，果实累累此处léi。',
];
for(const row of render.pages)assert.equal(sha(fs.readFileSync(path.join(root,sourceDirectory,row.path))),row.sha256);
write(sourceDirectory+'/reviewed-receipt.json',{at:new Date().toISOString(),sourceSha256:render.sourceSha256,allFivePagesVisuallyViewed:true,teacherReviewed:false,sourceImagesLocalOnly:true,
 pages:render.pages.map((row,index)=>({...row,visualChecked:true,facts:notes[index]})),readingDoesNotGrantPublication:true});
const browserDirectory='data/qa/p187/data/qa/browser-evidence/b4-rt-browser-browser-220b50c733';
const images=['gesp-teaching/level-1-desktop.png','gesp-teaching/level-2-desktop.png','gesp-teaching/level-3-desktop.png','gesp-teaching/level-4-desktop.png','gesp-teaching/level-four-mobile.png','workspace-gesp/first-group-code-before-probes-mobile.png'];
write('data/qa/block-four-content-source-first/b4-rt-visual-review.json',{at:new Date().toISOString(),buildId:'Xdx2xTDzqV1BplmCAhxK9',
 images:images.map(file=>({path:browserDirectory+'/'+file,sha256:sha(fs.readFileSync(path.join(root,browserDirectory,file))),visuallyViewed:true})),
 findings:[],checks:'Four desktop teaching levels, stacked mobile teaching and first-response mobile queue: active target, readable content flow, no overlapping controls or clipped horizontal content at saved viewport. Queue shows original date, current eligible date and wait reason.',
 boundaries:'AI screenshot review only; not physical device, assistive technology or teacher acceptance.'});
const bundles=['chinese-g3-autumn-v1.json','chinese-g3-autumn-activities-v1.json'].map(name=>{const file='resources/curriculum/source-lesson-materials/'+name,bytes=fs.readFileSync(path.join(root,file));return{path:file,sha256:sha(bytes),value:JSON.parse(bytes)};});
const groups=bundles.flatMap(b=>b.value.groups),tasks=groups.flatMap(g=>g.exercises.map(e=>({...e,mode:g.mode})));
assert.equal(groups.length,36);assert.equal(tasks.length,252);assert.equal(new Set(tasks.map(t=>t.id)).size,252);
for(const bundle of bundles){assert.equal(bundle.value.teacherReviewed,false);assert.equal(bundle.value.automaticPublication,false);for(const row of bundle.value.sourceLessons)assert.equal(sha(fs.readFileSync(path.join(root,row.path))),row.sha256);}
for(const group of groups){assert.equal(group.familyIndependenceReviewed,false);assert.equal(group.exercises.length,7);assert.deepEqual(group.exercises.slice(3).map(e=>e.proposedIntervalDays),[1,3,7,14]);assert.equal(group.rubric.reduce((n,r)=>n+r.weight,0),1);}
write('data/qa/block-four-content-source-first/autumn-materials-static-review.json',{at:new Date().toISOString(),groups:groups.length,questions:tasks.length,
 bundleInputs:bundles.map(({path,sha256})=>({path,sha256})),purposeCounts:{immediate:tasks.filter(t=>t.purpose!=='retention').length,proposedRetention:tasks.filter(t=>t.purpose==='retention').length},
 modes:Object.fromEntries(['audio_record','image_upload','short_answer'].map(mode=>[mode,tasks.filter(t=>t.mode===mode).length])),
 checks:{uniqueQuestionIds:true,boundDraftHashesMatch:true,explicitTargetGroups:true,sevenSamplesPerTarget:true,proposedIntervalsMatch:true,rubricWeightsSumToOne:true},
 reviewedContent:'Exact reviewed reading/writing lists, three poems with only Shanxing dictation, only AutumnRain paragraph2 recitation, no whole-text recitation added for pavement or autumn sounds; sounds/handwriting require original personal media; diary sample year unknown, no imitation tooth-handling task; garden2 polyphonic lei and actual word use checked.',
 teacherReviewed:false,scoringReviewed:false,independentFamiliesApproved:0,sufficientRetentionStock:false,published:false,learnerEvidence:false});
console.log(JSON.stringify({reviewedSourcePages:5,reviewedBrowserImages:6,newCandidateQuestions:252,teacherReviewed:false}));

const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),dir='data/qa/b4-source-prediction-first',render=JSON.parse(fs.readFileSync(path.join(root,dir,'render-receipt.json')));
const notes=[
 '物理51：老屋作者慈琪、准备倒下和小猫请求，标题插图旁批提供预测线索，旁批非本人首答。',
 '物理52：小猫避雨、母鸡二十几天请求、二十多天后九只小鸡；有与后文不同的旁批猜测。',
 '物理53：蜘蛛结网抓虫与讲故事未完、到现在仍站结尾及旁批，不推现实旧房永不倒。',
 '物理54：六字暴喵孵叽偶尔、13写字准备等暴睡壁砍蜘蛛漂撞饱晒、预测交流与联系图文说印象。',
 '物理55：王一梅略读故事、漏刮一根与果酱变长为童话条件，不作现实胡须增长规律。',
 '物理56：男孩风筝线短、长度与强度分别检查、鸟太太找绳晾物、正文省略号；六字萝卜愁沾继晾，无写字表。',
 '物理57：听老师讲完再核对原预测、及时修订与合理但不一致说明、六个书名猜测。作者教材外完整结尾未建立来源，未用预测或续写代填。',
];
for(const row of render.pages)assert.equal(sha(fs.readFileSync(path.join(root,dir,row.path))),row.sha256);
fs.writeFileSync(path.join(root,dir,'reviewed-receipt.json'),JSON.stringify({at:new Date().toISOString(),sourceSha256:render.sourceSha256,allSevenPagesVisuallyViewed:true,teacherReviewed:false,sourceImagesLocalOnly:true,fullAuthorCarrotEndingVerified:false,
 pages:render.pages.map((row,index)=>({...row,visualChecked:true,facts:notes[index]}))},null,2)+'\n',{flag:'wx'});
const file='resources/curriculum/source-lesson-materials/chinese-g3-prediction-first-v1.json',bytes=fs.readFileSync(path.join(root,file)),bundle=JSON.parse(bytes),tasks=bundle.groups.flatMap(g=>g.exercises.map(e=>({...e,mode:g.mode})));
assert.equal(bundle.groups.length,13);assert.equal(tasks.length,91);assert.equal(new Set(tasks.map(t=>t.id)).size,91);assert.equal(bundle.teacherReviewed,false);assert.equal(bundle.automaticPublication,false);
for(const row of bundle.sourceLessons){const b=fs.readFileSync(path.join(root,row.path)),draft=JSON.parse(b);assert.equal(sha(b),row.sha256);assert.deepEqual(bundle.groups.filter(g=>g.lesson===row.lesson).map(g=>g.atomId).sort(),[...draft.targetIds].sort());}
for(const group of bundle.groups){assert.equal(group.familyIndependenceReviewed,false);assert.equal(group.exercises.length,7);assert.deepEqual(group.exercises.slice(3).map(e=>e.proposedIntervalDays),[1,3,7,14]);assert.equal(group.rubric.reduce((n,r)=>n+r.weight,0),1);}
fs.writeFileSync(path.join(__dirname,'prediction-first-materials-static-review.json'),JSON.stringify({at:new Date().toISOString(),file,sha256:sha(bytes),groups:13,questions:91,purposeCounts:{immediate:39,proposedRetention:52},
 modes:Object.fromEntries(['audio_record','image_upload','short_answer'].map(mode=>[mode,tasks.filter(t=>t.mode===mode).length])),exactSourceBindings:true,targetGroupsComplete:true,uniqueIds:true,rubricWeightsSumToOne:true,
 reviewedBoundaries:'Prediction reasonableness, matching author outcome and later revision assessed separately. Real original answers not replaced by later correct answers; supplied sample originals are not learner first responses. Prior text/margin/example exposure remains. Old-house6 recognition/13 actual writing, carrot6 recognition/no writing. Title guesses do not prove book read; unverified full author ending remains pending, original example cards do not substitute.',
 teacherReviewed:false,scoringReviewed:false,familyIndependenceReviewed:false,fullyStockedRetentionIntervals:0,fullAuthorCarrotEndingVerified:false,published:false,learnerEvidence:false},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({reviewedPages:7,groups:13,candidates:91,fullAuthorEndingVerified:false,teacherReviewed:false}));

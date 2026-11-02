// Regression for metadata-only ancient poems: inspect the actual teaching body.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const expected={
 'garden-six':[['早发白帝城','唐','李白','朝辞白帝彩云间，\n千里江陵一日还。\n两岸猿声啼不住，\n轻舟已过万重山。']],
 'garden':[['所见','清','袁枚','牧童骑黄牛，\n歌声振林樾。\n意欲捕鸣蝉，\n忽然闭口立。']],
 'autumn-poems':[
  ['山行','唐','杜牧','远上寒山石径斜，\n白云生处有人家。\n停车坐爱枫林晚，\n霜叶红于二月花。'],
  ['赠刘景文','宋','苏轼','荷尽已无擎雨盖，\n菊残犹有傲霜枝。\n一年好景君须记，\n最是橙黄橘绿时。'],
  ['夜书所见','宋','叶绍翁','萧萧梧叶送寒声，\n江上秋风动客情。\n知有儿童挑促织，\n夜深篱落一灯明。']],
 'landscape-poems':[
  ['望天门山','唐','李白','天门中断楚江开，\n碧水东流至此回。\n两岸青山相对出，\n孤帆一片日边来。'],
  ['饮湖上初晴后雨','宋','苏轼','水光潋滟晴方好，\n山色空蒙雨亦奇。\n欲把西湖比西子，\n淡妆浓抹总相宜。'],
  ['望洞庭','唐','刘禹锡','湖光秋月两相和，\n潭面无风镜未磨。\n遥望洞庭山水翠，\n白银盘里一青螺。']],
};
function verify(draft,poems){
 const reading=draft.content.concept.explanation;
 for(const [title,dynasty,author,text] of poems){
  assert(reading.includes('《'+title+'》\n['+dynasty+'] '+author+'\n'+text),'Actual reading must contain the complete selected-version poem: '+title);
 }
}
let negativeCases=0;
for(const [slug,poems]of Object.entries(expected)){
 const draft=JSON.parse(fs.readFileSync(path.join(root,'resources/curriculum/source-lessons/chinese-g3-'+slug+'-v1.json')));
 verify(draft,poems);
 const metadataOnly=structuredClone(draft);metadataOnly.content.concept.explanation='只有讲解；完整原诗仍在scope中。';
 assert.throws(()=>verify(metadataOnly,poems));negativeCases++;
 for(const poem of poems){const missingLine=structuredClone(draft);missingLine.content.concept.explanation=missingLine.content.concept.explanation.replace(poem[3].split('\n')[2],'');assert.throws(()=>verify(missingLine,poems));negativeCases++;}
}
const garden=JSON.parse(fs.readFileSync(path.join(root,'resources/curriculum/source-lessons/chinese-g3-garden-six-v1.json')));
assert.equal(garden.scope.poemReadings['朝辞'],'zhāo cí');
assert(!/朝cháo/.test(JSON.stringify(garden)),'Morning departure uses zhāo');
const report={passed:true,drafts:Object.keys(expected).length,completePoems:Object.values(expected).flat().length,metadataOnlyAndMissingLineRejected:negativeCases,selectedVersionWords:['生处','最是','山水翠'],baidiMorningReading:'zhāo cí',scope:'Ancient public-domain poem reading only. Not a license to reproduce full modern textbook passages or annotations, nor proof of teacher approval or learner recall.'};
console.log(JSON.stringify(report));

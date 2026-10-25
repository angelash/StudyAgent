/* Deterministic teaching data for lifecycle tests. Not a model-quality or content-review result. */
function sourceCourseFixture(sources){return{title:'看懂资源与条件',overview:'从匿名观察出发，比较条件并寻找可区分的证据。',lessons:[0,1].map(index=>({title:index?'比较替代解释':'区分事实与解释',objective:'把观察、推断与待验证条件分开。',introduction:'今天从匿名记录开始，保留事实和还不能判断的问题。',concept:'观察描述具体发生的事情。解释提出可能的机制，还要与其他解释比较。',notes:['先记录实际观察','再比较可能机制'],example:{scenario:'同一阅览室在两个时段的使用情况不同。',steps:['分别记录时段与人数','比较开放安排和活动条件'],board:['记录时段与人数','比较条件'],conclusion:'当前记录支持比较，还不能推出普遍规律。'},misconception:{claim:'只看到不同结果就能确定唯一原因。',correction:'还需要核查其他条件和可能的反例。',board:['结果不同','仍需比较原因']},transfer:'换一个新场景，写出可以区分两种解释的观察。',summary:'保留依据、替代解释与局限。',takeaways:['保留观察','核查替代解释'],citations:[{sourceKey:sources[0].sourceKey,quote:sources[0].text.slice(0,40)}],questions:[0,1].map(q=>({prompt:q?'哪一种做法能区分两种解释？':'怎样区分观察与解释？',options:q?['只依据一次印象','保留观察并比较不同条件','忽略没有看到的时段','直接排除其他原因']:['保留观察并比较不同条件','只依据一次印象','忽略没有看到的时段','直接排除其他原因'],answer:q?1:0,explanation:'保留观察和替代解释，补充可区分的证据。',hints:['先识别实际观察到什么。','再比较哪些条件还没有核查。']}))}))};}
function sourceCoursePipelineFixture(context,message){
  const task=typeof message==='string'?JSON.parse(message):message,course=sourceCourseFixture(context.sources);
  if(task.stage==='outline'){const count=context.goal.includes('[six-lessons]')?6:context.goal.includes('[one-lesson]')?1:2;return{title:course.title,overview:course.overview,scopeNote:'依据本次选定的原文比较观察、解释与可验证条件，不能据此宣称全教材覆盖。',uncoveredSourceKeys:[],
    lessons:Array.from({length:count},(_,index)=>({title:count===2?course.lessons[index].title:course.lessons[index%2].title+' '+(index+1),objective:course.lessons[index%2].objective,focus:'保留依据并比较不同解释。',sourceKeys:context.sources.map(source=>source.sourceKey)}))};}
  if(task.stage==='lesson')return{...structuredClone(course.lessons[task.lessonIndex%2]),title:task.target.title,objective:task.target.objective};
  if(task.stage==='review'){
    if(context.goal.includes('[review-uncertain]'))return{decision:'uncertain',issues:[{field:'concept',questionIndex:null,quote:task.lesson.concept.slice(0,20),detail:'还需要核对记录范围是否支持这一解释。'}],changes:null,questionChanges:[]};
    if(context.goal.includes('[review-revise]')&&task.lessonIndex===0)return{decision:'revised',issues:[{field:'concept',questionIndex:null,quote:task.lesson.concept.slice(0,20),detail:'需要明确观察的范围，不能把有限记录推广为唯一原因。'}],changes:{...Object.fromEntries(Object.keys(task.lesson).map(key=>[key,null])),concept:task.lesson.concept+' 核对时还要保留记录范围与替代解释。'},questionChanges:[]};
    return{decision:'pass',issues:[],changes:null,questionChanges:[]};
  }
  throw new Error('Unknown source-course fixture stage');
}
function sourceCourseLongFixture(context,message){
  const task=typeof message==='string'?JSON.parse(message):message;
  if(task.stage==='source-index'){const source=context.sources[0];return{title:'原文索引',topics:['比较观察与条件'],conditions:['不能只从一次记录推断唯一原因'],quotes:[source.text.trim().slice(0,50)],uncertainties:context.goal.includes('[long-uncertain]')?['需要核对原页中的记录范围']:[]};}
  if(task.stage==='chunk-plan'){
    const count=Math.min(task.maximumLessons,task.indices.length),lessons=Array.from({length:count},(_,index)=>({title:'第'+(task.groupIndex+1)+'组 · 主题'+(index+1),objective:'保留必要条件和替代解释。',focus:'比较匿名观察中的条件与反例。',sourceKeys:task.indices.filter((_,item)=>item%count===index).map(source=>source.sourceKey),after:index?[index-1]:[]}));
    return{title:'长资料匿名课程',overview:'按原文范围分课，比较条件与可核查的反例。',scopeNote:'每节保留对应原文范围；索引与模型复核不能替代完整的内容审核。',omitted:[],lessons};
  }
  return sourceCoursePipelineFixture(context,task);
}
module.exports={sourceCourseFixture,sourceCoursePipelineFixture,sourceCourseLongFixture};

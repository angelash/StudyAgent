/* Deterministic synthetic check output. Never enables the live provider. */
exports.installSourceCheckFixture=function(app){
  const path=require('node:path'),root=path.resolve(__dirname,'../..'),directory=path.resolve(process.env.STUDY_DATA_DIR??'');
  if(!directory.startsWith(path.join(root,'data/qa')+path.sep)||process.env.XIAOJIU_CHAT_ENABLED!=='false'||process.env.E2E_SOURCE_COURSE_SNAPSHOT!=='1')throw Error('Source check fixture requires isolated browser state');
  const service=app.get(require('../../apps/api/dist/apps/api/src/modules/learning/source-course-check.service.js').SourceCourseCheckService);service.modelAvailable=()=>true;
  const attempts=new Map();
  return async(input,check)=>{
    let context;try{context=JSON.parse(input.context);}catch{return null;}if(context.version!=='source-course-check-v1')return null;
    const stage=JSON.parse(input.message),key=context.title+'|'+context.goal+'|'+stage.stage,count=(attempts.get(key)??0)+1;attempts.set(key,count);
    if(stage.stage==='reviewing'&&context.goal.includes('[check-review-fail-once]')&&count===1)throw Error('Synthetic check review failure');
    if(stage.stage==='writing'&&context.goal.includes('[check-pause-once]')&&count===1)await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(Error('Synthetic check cancelled'));},timer=setTimeout(()=>{input.signal?.removeEventListener('abort',abort);resolve();},14000);if(input.signal?.aborted)abort();else input.signal?.addEventListener('abort',abort,{once:true});});
    const value=stage.stage==='reviewing'?{decision:context.goal.includes('[check-uncertain]')?'uncertain':'pass',issues:context.goal.includes('[check-uncertain]')?['还需核对来源适用范围。']:[],revisedContent:null}:{title:'从新情境核查理解',instructions:'先独立比较条件，提交后再核对来源和理由。',questions:Array.from({length:Math.max(4,context.targets.length)},(_,index)=>{
      const target=context.targets[index%context.targets.length],source=context.sources.find(source=>target.sourceKeys.includes(source.key));return{prompt:'匿名场馆情境'+(index+1)+'：周末排队而工作日空闲，哪些判断保留了证据边界？',targetLessonIds:[target.lessonId],options:['比较开放时间和活动安排','一次排队就证明唯一原因','保留尚未观察的时段','没有数据也可断定普遍规律'],selectionMode:index===0?'multiple':'single',correctIndices:index===0?[0,2]:[0],optionExplanations:['比较其他条件','没有排除其他解释','保留未记录的范围','现有观察不足以推广'],explanation:'比较条件，保留未知时段与替代解释。',hints:['先区分记录与推断。','再核查哪些条件仍不清楚。'],citations:[{sourceKey:source.key,quote:source.text.slice(0,40)}]};})};
    return{...check(value),modelId:input.modelId,modelName:'Synthetic source check · not a real model'};
  };
};

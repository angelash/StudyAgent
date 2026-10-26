/* Offline synthetic topic generation, never enabled against real family storage. */
exports.installTopicWhiteboardFixture=app=>{
 const path=require('node:path'),root=path.resolve(__dirname,'../..'),directory=path.resolve(process.env.STUDY_DATA_DIR??'');
 if(!directory.startsWith(path.join(root,'data/qa')+path.sep)||process.env.XIAOJIU_CHAT_ENABLED!=='false'||process.env.E2E_SOURCE_COURSE_SNAPSHOT!=='1')throw Error('Topic whiteboard fixture requires isolated offline state');
 app.get(require('../../apps/api/dist/apps/api/src/modules/learning/topic-whiteboard.service.js').TopicWhiteboardService).modelAvailable=()=>true;
 const attempts=new Map();
 return async(input,check)=>{
  let context;try{context=JSON.parse(input.context);}catch{return null;}if(context.version!=='topic-whiteboard-v1')return null;
  const stage=JSON.parse(input.message).stage,key=context.topic+'|'+context.objective+'|'+stage,count=(attempts.get(key)??0)+1;attempts.set(key,count);
  if(stage==='reviewing'&&context.topic.includes('[topic-review-fail-once]')&&count===1)throw Error('Synthetic topic review failure');
  if(stage==='writing'&&context.topic.includes('[topic-pause-once]')&&count===1)await new Promise((resolve,reject)=>{
   const abort=()=>{clearTimeout(timer);reject(Error('Synthetic topic cancelled'));},timer=setTimeout(()=>{input.signal?.removeEventListener('abort',abort);resolve();},12000);
   if(input.signal?.aborted)abort();else input.signal?.addEventListener('abort',abort,{once:true});
  });
  const value=stage==='reviewing'?{decision:context.topic.includes('[topic-uncertain]')?'uncertain':'pass',issues:context.topic.includes('[topic-uncertain]')?['仍需核对适用范围和反例。']:[],revisedContent:null}:{
   title:'把条件讲清楚',description:'匿名合成教学稿，保留观察、条件和反例。',scenes:['先核对观察','再比较条件','最后保留反例'].map((title,index)=>({
    kind:index===0?'title':index===2?'check':'concept',title,narration:'[whiteboard-fixture] '+title+'。 保留未知条件，不把一次观察当成完整能力证明。',
    body:'完整说明首行。完整说明尾行。',bullets:[title],targetAtomIds:context.targets.map(target=>target.id),
    exhibit:index===1?{kind:'table',headers:['已有观察','适用条件'],rows:[['周末排队','开放时间相同'],['工作日空位','完整尾行条件']]}:
     index===2?{kind:'formula',latex:'1+1=2',explanation:'在计数单位相同的条件下合并数量。'}:null,
   }))};
  return{...check(value),modelId:input.modelId,modelName:'Browser fixture · not a real model'};
 };
};

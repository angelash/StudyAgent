/* Synthetic replies only in the isolated offline browser harness. */
exports.installWhiteboardQuestionFixture=()=>{
 const path=require('node:path'),root=path.resolve(__dirname,'../..'),directory=path.resolve(process.env.STUDY_DATA_DIR??'');
 if(!directory.startsWith(path.join(root,'data/qa')+path.sep)||process.env.XIAOJIU_CHAT_ENABLED!=='false'||process.env.E2E_SOURCE_COURSE_SNAPSHOT!=='1')throw Error('Whiteboard question fixture requires isolated offline storage');
 const attempts=new Map();
 return async(input,check)=>{
  let context;try{context=JSON.parse(input.context);}catch{return null;}
  if(context.version!=='whiteboard-question-context-v1')return null;
  const key=context.boardKind+'|'+context.boardId+'|'+input.message,count=(attempts.get(key)??0)+1;attempts.set(key,count);
  if(count===1&&input.message.includes('[question-fail-once]'))throw Error('Synthetic whiteboard answer failure');
  if(count===1&&input.message.includes('[question-pause-once]'))await new Promise((resolve,reject)=>{
   const abort=()=>{clearTimeout(timer);reject(Error('Synthetic whiteboard answer cancelled'));},timer=setTimeout(()=>{input.signal?.removeEventListener('abort',abort);resolve();},8000);
   if(input.signal?.aborted)abort();else input.signal?.addEventListener('abort',abort,{once:true});
  });
  return{...check({reply:'这是匿名合成补充讲解。当前原句：'+context.currentSentence.text+'\n先统一比较单位，再核对条件；用新的情境验证理解。',anchors:[context.anchors[0].id]}),
   modelId:input.modelId,modelName:'Browser question fixture · '+input.modelId};
 };
};

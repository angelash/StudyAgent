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
  const structure=input.message.includes('[question-structure]');
  const reply=structure?'先确认计数单位。第一行比较单位。第二行核对整体。现在解释分数公式。最后解释根式公式。':
   '这是匿名合成补充讲解。当前原句：'+context.currentSentence.text+'\n先统一比较单位，再核对条件；用新的情境验证理解。';
  const board=structure?{title:'统一单位再比较',points:['比较前确认计数单位'],diagram:{kind:'flow',title:'比较路线',labels:['确认单位','核对整体','独立验证']},
   table:{title:'同维度比较',headers:['对象','条件'],rows:[['第一行','单位相同'],['第二行','整体相同']]},
   formulas:[{label:'分数',latex:'\\frac{1}{2}',meaning:'平均分成两份中的一份。'},{label:'根式',latex:'\\sqrt{9}=3',meaning:'核对正数平方关系。'}],
   anchors:{points:['先确认计数单位'],tableRows:['第一行比较单位','第二行核对整体'],formulas:['现在解释分数公式','最后解释根式公式']}}:
   {title:'比较单位与条件',points:['统一比较单位','用新情境验证'],diagram:null,table:null,formulas:[],anchors:{points:['先统一比较单位','用新的情境验证理解'],tableRows:[],formulas:[]}};
  return{...check({reply,anchors:[context.anchors[0].id],board}),
   modelId:input.modelId,modelName:'Browser question fixture · '+input.modelId};
 };
};

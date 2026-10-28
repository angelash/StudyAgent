// Owned browser fixtures only: actual HTTP/tasks/validators, no live provider.
exports.installAssistantWhiteboardFixture = app => {
  const {AssistantWhiteboardService}=require('../../apps/api/dist/apps/api/src/modules/learning/assistant-whiteboard.service.js');
  app.get(AssistantWhiteboardService).chat={enabled:true};
  const attempts=new Map();
  return async(input,check)=>{
    let context;try{context=JSON.parse(input.context);}catch{return null;}
    if(context.protocol!=='assistant-topic-whiteboard-v1')return null;
    const stage=JSON.parse(input.message).stage,key=context.objective+'|'+context.origin.sessionId+'|'+stage,count=(attempts.get(key)??0)+1;attempts.set(key,count);
    if(stage==='reviewing'&&context.objective.includes('[source-review-fail-once]')&&count===1)throw Error('Owned source review interruption');
    const message=context.origin.messages.find(message=>message.sender==='assistant')??context.origin.messages[0];
    const value=stage==='reviewing'?{decision:'pass',issues:[],revisedContent:null}:{title:'从原问题看清条件',description:'匿名来源教学草稿，保留原文与检查依据。',
      scenes:['明确整体','比较单位','独立检查'].map((title,index)=>({kind:index===0?'title':index===2?'check':'concept',title,
        narration:'[whiteboard-fixture] '+title+'。先说清整体和单位，再比较适用条件。',body:'先说清整体和单位，再比较适用条件。',bullets:[title],targetAtomIds:[],
        exhibit:index===1?{kind:'table',headers:['已有观察','比较条件'],rows:[['同一整体','保持单位'],['独立检查','说明依据']]}:null,
        sourceMap:{messageIds:[message.id],referenceKeys:message.sourceReferences.map(reference=>reference.key),status:'sourced',explanation:'由本人所选原问题整理，保留原文核查依据。'}}))};
    return{...check(value),modelId:input.modelId,modelName:'Owned source browser fixture'};
  };
};

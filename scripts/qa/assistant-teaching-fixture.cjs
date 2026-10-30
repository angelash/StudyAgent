/* Synthetic teaching generation for the isolated browser server only. */
exports.installAssistantTeachingFixture=app=>{
 const path=require('node:path'),root=path.resolve(__dirname,'../..'),directory=path.resolve(process.env.STUDY_DATA_DIR??'');
 if(!directory.startsWith(path.join(root,'data/qa')+path.sep)||process.env.STUDY_STORAGE!=='sqlite'||process.env.XIAOJIU_CHAT_ENABLED!=='false'||process.env.E2E_SOURCE_COURSE_SNAPSHOT!=='1')throw Error('Generated teaching fixtures require isolated offline state');
 const from=file=>require('../../apps/api/dist/apps/api/src/'+file+'.js'),provider=app.get(from('modules/ai/xiaojiu-chat.service').XiaojiuChatService),store=app.get(from('infrastructure/in-memory-store.service').InMemoryStoreService);const teachingProvider=Object.create(provider);Object.defineProperty(teachingProvider,'enabled',{configurable:true,get:()=>true});
 // Only teaching services use this synthetic capability. Shared project/chat
 // services retain their real disabled state and cannot start a live provider.
 app.get(from('modules/learning/assistant-teaching-source.service').AssistantTeachingSourceService).chat=teachingProvider;
 app.get(from('modules/learning/assistant-teaching.service').AssistantTeachingService).chat=teachingProvider;
 if(provider.enabled)throw Error('The shared QA provider must remain disabled');
 app.getHttpAdapter().getInstance().post('/api/qa/teaching-practice/source-change',async(req,res)=>{try{await store.transaction(()=>{const token=from('common/auth.guard').requestToken(req),auth=store.find('sessions',{tokenHash:from('modules/auth/auth.service').hashToken(token)}),actor=auth&&!auth.revokedAt&&Date.parse(auth.expiresAt)>Date.now()?store.find('users',{id:auth.userId,status:'active',role:'parent'}):null,session=actor&&store.find('assistantSessions',{id:String(req.body?.sessionId),ownerUserId:actor.id});if(!session)throw Error('Owned synthetic source required');const message=store.find('assistantMessages',{sessionId:session.id,id:String(req.body?.messageId)});if(!message)throw Error('Original synthetic message required');message.content+=' 明确变更原教学来源，后续新写入必须重新核对。';});res.status(201).json({data:{changed:true},error:null});}catch{res.status(403).json({data:null,error:{code:'fixture_denied',message:'Owned synthetic source required'}});}});
 const attempts=new Map();
 return async(input,check)=>{
  let context,stage;try{context=JSON.parse(input.context);stage=JSON.parse(input.message);}catch{return null;}if(context.protocol!=='assistant-teaching-practice-content-v1')return null;
  const key=context.origin.sessionId+'|'+stage.stage,count=(attempts.get(key)??0)+1;attempts.set(key,count);
  if(context.input.objective.includes('[pause-teaching]')&&stage.stage==='writing'&&count===1)await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(Error('Synthetic teaching cancelled'));},timer=setTimeout(()=>{input.signal?.removeEventListener('abort',abort);resolve();},12000);if(input.signal?.aborted)abort();else input.signal?.addEventListener('abort',abort,{once:true});});
  if(context.input.objective.includes('[review-fail-once]')&&stage.stage==='reviewing'&&count===1)throw Error('Synthetic teaching review failure');
  let result;
  if(stage.stage==='writing'){
   const targets=context.targetScope.kind==='student'?context.targetScope.targets.map(item=>item.atomId):[null];
   const questions=targets.flatMap((target,index)=>[0,1].map(open=>({id:'teaching-'+index+'-'+open,kind:open?'open_response':'classification',prompt:open?'完整解释比较数量时，为什么需要核对整体和单位。':'比较数量前应该先核对什么？\n\n| 条件 | 含义 |\n| --- | --- |\n| 整体 | 比较的范围 |\n| 单位 | 数量的尺度 |\n\n$\\frac{18+14}{3+2}=6.4$',reasonPrompt:'请完整说明你的判断依据，并指出适用条件。',options:open?[]:[{id:'a',label:'先核对同一整体和单位'},{id:'b',label:'直接比较数字大小'}],referenceOptionId:open?null:'a',referenceExplanation:'先核对整体、单位和适用条件，再比较数量。',applicableConditions:['比较的是同一整体、同一单位。'],reasoningCriteria:['解释整体和单位如何影响判断。'],hints:['先找两个数量各自代表什么。'],contrast:{prompt:'两次观察的单位不同，还能直接比较数字吗？',referenceExplanation:'需要先核对尺度并统一单位，再比较数量。'},targetAtomIds:target?[target]:[],sourceMap:{messageIds:[context.origin.messages[0].id],referenceKeys:[],status:'sourced',explanation:'根据明确选择的完整原消息整理的合成教学稿。'}})));
   result={protocol:'assistant-teaching-practice-content-v1',title:'核对条件，表达自己的理由',objective:context.input.objective,questions};
  }else if(stage.stage==='reviewing'){
   const uncertain=context.input.objective.includes('[uncertain-teaching]')&&!stage.draft.title.includes('已核查');
   result={decision:uncertain?'uncertain':'pass',issues:uncertain?['原解释的适用条件仍需核查，保留原稿，不得采用。']:[],revisedContent:null};
  }else throw Error('Unknown synthetic teaching stage');
  return{...check(result),modelId:input.modelId,modelName:'Synthetic fixed teaching model'};
 };
};

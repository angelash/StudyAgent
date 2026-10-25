// Owned synthetic browser fixtures only; no provider call and no production endpoint.
const path=require('node:path');
exports.installAssistantTurnFixture=function(app){
  const root=path.resolve(__dirname,'../..'),directory=path.resolve(process.env.STUDY_DATA_DIR??'.');
  if(!directory.startsWith(path.join(root,'data','qa')+path.sep)||process.env.STUDY_STORAGE!=='sqlite'||process.env.XIAOJIU_CHAT_ENABLED!=='false'||process.env.E2E_SOURCE_COURSE_SNAPSHOT!=='1')throw Error('Assistant fixture requires the isolated browser server');
  const store=app.get(require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js').InMemoryStoreService);
  const ai=app.get(require('../../apps/api/dist/apps/api/src/modules/ai/ai.service.js').AiService);
  ai.assistantModelAvailable=()=>true;
  const attempts=new Map();
  app.getHttpAdapter().getInstance().post('/api/qa/assistant/seed-history',async(req,res)=>{
    try{const data=await store.transaction(()=>{
      const {requestToken}=require('../../apps/api/dist/apps/api/src/common/auth.guard.js'),{hashToken}=require('../../apps/api/dist/apps/api/src/modules/auth/auth.service.js');
      const auth=store.find('sessions',{tokenHash:hashToken(requestToken(req))}),user=auth&&!auth.revokedAt&&Date.parse(auth.expiresAt)>Date.now()?store.find('users',{id:auth.userId,status:'active',role:'parent'}):null;
      if(!user)throw Error('unauthorized');const sessionId=String(req.body?.sessionId??''),session=ai.assertSessionOwner(sessionId,user,false),count=Number(req.body?.count??75),marker=String(req.body?.marker??'EARLY_HISTORY_MARKER');
      if(!Number.isInteger(count)||count<1||count>150||marker.length>60)throw Error('invalid fixture');
      const ids=[];for(let index=0;index<count;index++){const id=store.nextId('assistant_message');ids.push(id);store.append('assistantMessages',{id,sessionId:session.id,sender:index%2?'assistant':'user',content:index===0||index===count-10?marker+' · 匿名历史第'+index+'条':'合成历史第'+index+'条，核对条件再解释。',createdAt:new Date(Date.UTC(2026,0,1,10,0,index)).toISOString(),...(index%2?{source:'rules'}:{})});}
      return {ids,count};});res.status(201).json({data,error:null,meta:{fixture:true}});
    }catch{res.status(403).json({data:null,error:{code:'fixture_denied',message:'Synthetic assistant fixture rejected'},meta:{fixture:true}});}
  });
  return async input=>{
    const n=(attempts.get(input.message)??0)+1;attempts.set(input.message,n);
    if(input.message.includes('[assistant-fail-once]')&&n===1)throw Error('Synthetic assistant failure');
    if(input.message.includes('[assistant-pause-once]')&&n===1||input.message.includes('[assistant-hold]'))await new Promise((resolve,reject)=>{
      const abort=()=>{clearTimeout(timer);input.signal?.removeEventListener('abort',abort);reject(Error('Synthetic assistant cancellation'));};
      const timer=setTimeout(()=>{input.signal?.removeEventListener('abort',abort);resolve();},input.message.includes('[assistant-hold]')?30000:8000);
      if(input.signal?.aborted)abort();else input.signal?.addEventListener('abort',abort,{once:true});
    });
    return {reply:'先列出已有条件，再说明卡住的一步。用一个独立新例子核查，不凭一次表现确定原因。',
      evidenceIds:input.message.includes('[assistant-invalid-once]')&&n===1?['synthetic-unsupported-evidence']:[],modelId:input.modelId,modelName:'Synthetic assistant · '+input.modelId};
  };
};

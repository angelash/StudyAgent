// Deterministic guidance only inside the isolated synthetic browser server. No live provider.
const path=require('node:path');
exports.installGuidanceModelFixture=function(app){
 const root=path.resolve(__dirname,'../..'),directory=path.resolve(process.env.STUDY_DATA_DIR??'');
 if(!directory.startsWith(path.join(root,'data/qa')+path.sep)||process.env.STUDY_STORAGE!=='sqlite'||process.env.XIAOJIU_CHAT_ENABLED!=='false'||process.env.E2E_SOURCE_COURSE_SNAPSHOT!=='1')throw Error('Guidance fixture requires isolated synthetic browser state');
 const store=app.get(require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js').InMemoryStoreService);
 const suggestions=app.get(require('../../apps/api/dist/apps/api/src/modules/diagnostics/guidance-model.service.js').GuidanceModelService),attempts=new Map(),behaviors=new Map();
 suggestions.modelAvailable=()=>true;
 app.getHttpAdapter().getInstance().post('/api/qa/guidance-models/:planId/behavior',async(req,res)=>{
  try{
   const data=await store.transaction(()=>{
    const {requestToken}=require('../../apps/api/dist/apps/api/src/common/auth.guard.js'),{hashToken}=require('../../apps/api/dist/apps/api/src/modules/auth/auth.service.js');
    const session=store.find('sessions',{tokenHash:hashToken(requestToken(req))}),user=session&&!session.revokedAt&&Date.parse(session.expiresAt)>Date.now()?store.find('users',{id:session.userId,status:'active',role:'parent'}):null;
    const plan=store.find('diagnosticPlans',{id:String(req.params.planId)}),mode=req.body?.mode;
    if(!user||!plan||!store.find('bindings',{parentUserId:user.id,studentId:plan.studentId,status:'active'})||!['valid','hold','fail-once','invalid-once'].includes(mode))throw Error('invalid guidance fixture');
    const actionId=plan.actions[0]?.id;if(!actionId)throw Error('missing synthetic action');behaviors.set(actionId,mode);attempts.delete(actionId);return {planId:plan.id,mode};
   });res.status(201).json({data,error:null});
  }catch{res.status(400).json({data:null,error:{code:'invalid_fixture',message:'Invalid synthetic guidance request'}});}
 });
 return async(input,check)=>{
  if(!input.system?.startsWith('你是家长学习指导助手。'))return null;
  let context;try{context=JSON.parse(input.context);}catch{return null;}
  if(!context.original||!Array.isArray(context.original.actions)||!context.original.actions.length)return null;
  const key=context.original.actions[0].id,count=(attempts.get(key)??0)+1;attempts.set(key,count);const behavior=behaviors.get(key)??'valid';
  if(behavior==='fail-once'&&count===1)throw Error('Synthetic guidance provider failure');
  if(behavior==='hold')await new Promise((resolve,reject)=>{
   const abort=()=>{clearTimeout(timer);input.signal?.removeEventListener('abort',abort);reject(Error('Synthetic guidance cancelled'));},timer=setTimeout(()=>{input.signal?.removeEventListener('abort',abort);resolve();},20000);
   if(input.signal?.aborted)abort();else input.signal?.addEventListener('abort',abort,{once:true});
  });
  const value={summary:'合成测试建议：保留未知与观察，按每项行动逐步核查。',activities:context.original.actions.map(action=>({actionId:action.id,
   activity:'合成测试建议：先做两个独立小测，记录具体观察，再核查需要哪一步讲解；当前证据与不确定性继续保留。',evidenceIds:action.evidenceIds}))};
  if(behavior==='invalid-once'&&count===1)value.activities[0].minutes=60;
  return {...check(value),modelId:input.modelId,modelName:'Synthetic guidance fixture, not a real model'};
 };
};

// Owned synthetic browser fixture only. Never imported by the production application.
const path=require('node:path');
exports.installTeachingToolFixture=app=>{
 const root=path.resolve(__dirname,'../..'),directory=path.resolve(process.env.STUDY_DATA_DIR??'');
 if(!directory.startsWith(path.join(root,'data/qa')+path.sep)||process.env.STUDY_STORAGE!=='sqlite'||process.env.XIAOJIU_CHAT_ENABLED!=='false'||process.env.E2E_SOURCE_COURSE_SNAPSHOT!=='1')throw Error('Teaching fixture requires isolated offline state');
 const store=app.get(require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js').InMemoryStoreService);
 app.get(require('../../apps/api/dist/apps/api/src/modules/ai/teaching-tool.service.js').TeachingToolService).modelAvailable=()=>true;
 const states=new Map(),calls=new Map(),attempts=new Map();
 function actor(req,admin=true){const {requestToken}=require('../../apps/api/dist/apps/api/src/common/auth.guard.js'),{hashToken}=require('../../apps/api/dist/apps/api/src/modules/auth/auth.service.js');
  const session=store.find('sessions',{tokenHash:hashToken(requestToken(req))}),user=session&&!session.revokedAt&&Date.parse(session.expiresAt)>Date.now()?store.find('users',{id:session.userId,status:'active'}):null;
  if(!user||admin&&user.role!=='admin')throw Error('unauthorized');return user;}
 const http=app.getHttpAdapter().getInstance();
 http.post('/api/qa/teaching-tools/setup',async(req,res)=>{try{const value=await store.transaction(()=>{const user=actor(req,false);if(!['parent','admin'].includes(user.role))throw Error('unauthorized');user.role='admin';
   const id='qa-teaching-'+user.id;if(!store.find('questions',{id})){store.append('questions',{id,subject:'math',type:'fill',difficultyLevel:1,status:'published',knowledgePointId:null,stem:'匿名教研原题：三人与两人的总分分别18与14，求五人平均分。',answer:'6.4',analysis:'先合计总分，再用总人数作分母。'});
    store.append('questionDocuments',{questionId:id,version:3,locale:'zh-CN',layoutMode:'default',accessibilityConfig:{},blocks:[{id:'original-stem',type:'text',text:'三人与两人，总分18与14。'},{id:'original-table',type:'table',headers:['人数','总分'],rows:[['3','18'],['2','14']]},{id:'original-formula',type:'math_display',latex:'\\frac{18+14}{3+2}=6.4'}],attachments:[]});
    store.append('questionAnswerSchemas',{questionId:id,mode:'numeric_blank',responseShape:{value:'string'},placeholder:'平均分',options:[],gradingConfig:{tolerance:0}});}
   return{userId:user.id,questionId:id};});res.json({data:value,error:null});}catch{res.status(403).json({error:{message:'Fixture owner required'}});}});
 http.post('/api/qa/teaching-tools/behavior',async(req,res)=>{try{const user=await store.requestContext(()=>actor(req));const mode=String(req.body?.mode??'valid');if(!['valid','invalid','hold','late','fail_once','disclose'].includes(mode))throw Error('invalid');states.set(user.id,mode);res.json({data:{mode},error:null});}catch{res.status(403).json({error:{message:'Fixture owner required'}});}});
 http.post('/api/qa/teaching-tools/revoke',async(req,res)=>{try{await store.transaction(()=>{actor(req).role='parent';});res.json({data:{revoked:true},error:null});}catch{res.status(403).json({error:{message:'Fixture owner required'}});}});
 http.get('/api/qa/teaching-tools/observations',async(req,res)=>{try{const user=await store.requestContext(()=>actor(req));res.json({data:{calls:calls.get(user.id)??[]},error:null});}catch{res.status(403).json({error:{message:'Fixture owner required'}});}});
 return async(input,check)=>{
  let context;try{context=JSON.parse(input.context);}catch{return null;}
  if(!context||!['assessment_analysis','hint_draft'].includes(context.purpose)||!context.question||!context.source)return null;
  const run=await store.requestContext(async()=>{for(const row of store.select('teachingToolRuns',{status:'running',modelId:input.modelId}).filter(row=>row.context===input.context)){
   const task=await store.tasks.get(row.taskId);if(task?.state==='running'&&task.ownerUserId===row.ownerUserId&&task.leaseToken)return row;
  }return null;});if(!run)throw Error('Synthetic leased teaching run missing');
  const mode=states.get(run.ownerUserId)??'valid',count=(attempts.get(run.id)??0)+1;attempts.set(run.id,count);
  const history=calls.get(run.ownerUserId)??[];history.push({runId:run.id,modelId:input.modelId,purpose:context.purpose});calls.set(run.ownerUserId,history);
  if(mode==='fail_once'&&count===1)throw Error('Synthetic teaching failure');
  if(mode==='hold'||mode==='late')await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{input.signal?.removeEventListener('abort',stop);resolve();},mode==='late'?7000:14000),stop=()=>{if(mode==='late')return;clearTimeout(timer);reject(Error('Synthetic teaching stopped'));};if(input.signal?.aborted)stop();else input.signal?.addEventListener('abort',stop,{once:true});});
  let result;if(context.purpose==='assessment_analysis'){
   const unknown=context.answer===null||Boolean(context.question.mediaNotice),quote=typeof context.answer==='string'?context.answer.slice(0,600):JSON.stringify(context.answer).slice(0,600);
   result={summary:'保留原推导后，先核对分母所代表的平均对象，再用独立新题验证。',judgement:unknown?'uncertain':'incorrect',observations:[{source:'submitted_answer',quote,observation:'这里只记录本次原文能够支持的观察。'}],uncertainties:['单次回答尚不足以确定稳定的能力原因。'],verificationSteps:['换一个人数不同的情境，独立说明分母代表什么。'],confidenceLevel:'low',reviewRequired:true,advisoryOnly:true};
  }else result={hint:mode==='disclose'?'请核对答案'+String(context.question.referenceAnswer)+'是否与平均对象相符。':'先把全部人数逐个列出来，再解释要平均的是谁。',focus:'核对分母对应的平均对象。',suggestedLevel:context.hintLevel,reviewAdvice:'这是一份匿名合成草稿，请人工核对是否透露答案后再用于教学。',reviewRequired:true,advisoryOnly:true};
  if(mode==='invalid')result.score=0;
  return{...check(result),modelId:input.modelId,modelName:'Synthetic teaching fixture · zero supplier calls'};
 };
};

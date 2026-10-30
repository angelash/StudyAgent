/* Owned synthetic packets for real conversation-practice browser journeys. */
const path=require('node:path'),{randomUUID}=require('node:crypto');
exports.installAssistantPracticeFixture=function(app){
 const root=path.resolve(__dirname,'../..'),directory=path.resolve(process.env.STUDY_DATA_DIR??'.');
 if(!directory.startsWith(path.join(root,'data/qa')+path.sep)||process.env.STUDY_STORAGE!=='sqlite'||process.env.XIAOJIU_CHAT_ENABLED!=='false'||process.env.E2E_SOURCE_COURSE_SNAPSHOT!=='1')throw Error('Conversation practice fixtures require isolated QA');
 const from=file=>require('../../apps/api/dist/apps/api/src/'+file+'.js'),store=app.get(from('infrastructure/in-memory-store.service').InMemoryStoreService);
 app.getHttpAdapter().getInstance().post('/api/qa/conversation-practice',async(req,res)=>{
  try{const result=await store.transaction(()=>{
   const auth=store.find('sessions',{tokenHash:from('modules/auth/auth.service').hashToken(from('common/auth.guard').requestToken(req))});
   const owner=auth&&!auth.revokedAt&&Date.parse(auth.expiresAt)>Date.now()?store.find('users',{id:auth.userId,status:'active',role:'parent'}):null;
   const studentId=String(req.body?.studentId??'');if(!owner||!store.find('bindings',{parentUserId:owner.id,studentId,status:'active'}))throw Error('Expected synthetic owned parent');
   const {eligibleMeasurements}=from('modules/diagnostics/curriculum.service'),definitions=from('modules/diagnostics/measurement-definition');
   const template=eligibleMeasurements(store).find(item=>{const atom=store.find('knowledgeAtoms',{id:item.atomId});return atom?.subject==='math'&&atom.grade<=4&&store.find('questionAnswerSchemas',{questionId:item.questionId})?.mode==='numeric_blank';});if(!template)throw Error('Expected actual eligible numeric packet');
   const nonce=randomUUID(),atomIds=[];
   for(let group=0;group<3;group++){
    const atom={...structuredClone(store.find('knowledgeAtoms',{id:template.atomId})),id:'qa-cp-atom-'+nonce+'-'+group,name:'合成条件与单位'+(group+1),grade:4,term:'upper',objective:'核对数量条件，并解释计算依据',successCriterion:'写出结果，并说明数量与单位',prerequisiteIds:[],version:1,status:'published'};delete atom.parentId;store.append('knowledgeAtoms',atom);atomIds.push(atom.id);
    for(let index=0;index<2;index++){
     const id='qa-cp-question-'+nonce+'-'+group+'-'+index,count=group*2+index+2;
     const question={...structuredClone(store.find('questions',{id:template.questionId})),id,stem:'合成练习：有'+count+'盒，每盒2个。一共有多少个？',answer:String(count*2),analysis:'先核对每盒数量相同，再用'+count+'×2计算总数量。'};
     const document={...structuredClone(store.find('questionDocuments',{questionId:template.questionId})),questionId:id,version:1,blocks:[{id:'text',type:'text',text:question.stem},{id:'formula',type:'math_display',latex:count+'\\times 2'},{id:'table',type:'table',headers:['盒数','每盒个数'],rows:[[String(count),'2']]}],attachments:[]};
     const schema={...structuredClone(store.find('questionAnswerSchemas',{questionId:template.questionId})),questionId:id};
     if(req.body?.media===true&&group===0){question.type=index===0?'subjective':'oral';question.stem=index===0?'用图示解释两盒与每盒数量的关系。':'口头解释盒数、每盒数量和总数量的关系。';question.answer='由教师核对数量条件与解释。';question.analysis='先明确每盒数量相同，再解释合计数量。';document.blocks[0].text=question.stem;schema.mode=index===0?'image_upload':'audio_record';schema.options=[];schema.responseShape={mediaPolicy:'student-media-v1'};schema.gradingConfig={};}
     const source={...structuredClone(store.find('questionSources',{questionId:template.questionId})),id:'qa-cp-source-'+nonce+'-'+group+'-'+index,questionId:id,sourcePathOrUrl:'qa-only-owned-original',notes:'Owned synthetic fixture; not real learner or teacher evidence',importJobId:null};
     store.append('questions',question);store.append('questionDocuments',document);store.append('questionAnswerSchemas',schema);store.append('questionSources',source);
     store.append('measurementItems',{...structuredClone(template),id:'qa-cp-map-'+nonce+'-'+group+'-'+index,atomId:atom.id,questionId:id,questionVersion:1,family:'qa-cp-structure-'+group+'-'+index,atomDefinitionFingerprint:definitions.atomDefinitionFingerprint(atom),contentFingerprint:definitions.questionContentFingerprint(store,id)});
    }
   }
   return {studentId,atomIds,scope:{subject:'math',grade:4,term:'upper',textbookVolumeId:null,textbookVersion:'合成UI验收原子范围',learnedAtomIds:atomIds,currentAtomId:atomIds[0],minutesPerSession:15}};
  });res.status(201).json({data:result,error:null,meta:{fixture:true}});}catch(error){console.error('Conversation practice QA setup:',error instanceof Error?error.message:'unknown fixture failure');res.status(403).json({data:null,error:{code:'fixture_denied',message:'Conversation practice QA fixture rejected'},meta:{fixture:true}});}
 });
};

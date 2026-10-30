/* Engineering-only owned source material. No teacher approval, publication,
 * child answer or result is fabricated by this setup endpoint. */
const path=require('node:path'),{randomUUID}=require('node:crypto');
exports.installControlledContrastFixture=function(app){
 const root=path.resolve(__dirname,'../..'),directory=path.resolve(process.env.STUDY_DATA_DIR??'.');
 if(!directory.startsWith(path.join(root,'data/qa')+path.sep)||process.env.STUDY_STORAGE!=='sqlite'||process.env.XIAOJIU_CHAT_ENABLED!=='false'||process.env.E2E_SOURCE_COURSE_SNAPSHOT!=='1')throw Error('Controlled material fixtures require isolated QA');
 const from=file=>require('../../apps/api/dist/apps/api/src/'+file+'.js'),store=app.get(from('infrastructure/in-memory-store.service').InMemoryStoreService);
 app.getHttpAdapter().getInstance().post('/api/qa/controlled-materials',async(req,res)=>{
  try{const result=await store.transaction(()=>{
   const auth=store.find('sessions',{tokenHash:from('modules/auth/auth.service').hashToken(from('common/auth.guard').requestToken(req))}),owner=auth&&!auth.revokedAt&&Date.parse(auth.expiresAt)>Date.now()?store.find('users',{id:auth.userId,status:'active',role:'parent'}):null;
   const studentId=String(req.body?.studentId??'');if(!owner||!store.find('bindings',{parentUserId:owner.id,studentId,status:'active'}))throw Error('Expected owned synthetic parent');
   const nonce=randomUUID(),requestedAtom=String(req.body?.atomId??''),existing=requestedAtom?store.find('knowledgeAtoms',{id:requestedAtom,subject:'math',grade:4,status:'published'}):null;if(requestedAtom&&(!requestedAtom.startsWith('qa-controlled-atom-')||!existing||!store.find('learningScopes',{studentId,subject:'math'})?.learnedAtomIds.includes(requestedAtom)))throw Error('Expected original owned QA scope');
   const atomId=existing?.id??'qa-controlled-atom-'+nonce,atom=existing??{id:atomId,subject:'math',grade:4,term:'upper',name:'受控工程条件核对 '+nonce.slice(0,8),strand:'engineering-synthetic-only',objective:'核对相同单位和必要条件后比较给定数量。',successCriterion:'独立说明所用条件和比较结果。',prerequisiteIds:[],curriculumVersion:'engineering-controlled-only-v1',status:'published',version:1},items=[];
   if(!existing)store.append('knowledgeAtoms',atom);
   for(let unit=0;unit<2;unit++)for(const condition of ['control','challenge']){
    const questionId='qa-controlled-q-'+nonce+'-'+unit+'-'+condition,id='qa-controlled-m-'+nonce+'-'+unit+'-'+condition,family='qa-controlled-synthetic-structure-'+nonce+'-'+unit;
    const stem='工程合成单元'+(unit+1)+' · '+(condition==='control'?'简洁侧：相同单位的数量3和6，较大的数量是多少？':'完整文字侧：两条记录的单位完全相同，记录的数量分别是3和6。根据这些必要条件，较大的数量是多少？');
    store.append('questions',{id:questionId,subject:'math',type:'objective',stem,answer:'6',analysis:'先核对对应单位，再比较数量。仅为工程合成原件，不证明真实素材结构独立性或教师质量。',difficultyLevel:1,knowledgePointIds:[],status:'published'});
    if(!(req.body?.legacyText===true&&unit===0&&condition==='control'))store.append('questionDocuments',{questionId,version:1,locale:'zh-CN',blocks:[{id:'original-condition',type:'text',text:stem}],attachments:[],layoutMode:'default',accessibilityConfig:{}});
    store.append('questionAnswerSchemas',{questionId,mode:'numeric_blank',responseShape:{value:'number'},validationRules:{required:true},gradingConfig:{},placeholder:'请输入比较结果'});
    store.append('questionSources',{questionId,sourceType:'internal_authoring',sourceName:'明确工程合成的受控原件',sourcePathOrUrl:'qa-only-controlled-material',licenseClass:'A_INTERNAL',licenseName:'engineering-only-not-teacher-reviewed',importJobId:null,reviewStatus:'approved',notes:'This QA source creates no formal human or learner evidence.'});
    store.append('measurementItems',{id,questionId,questionVersion:1,atomId,dimension:'procedure',probeRole:'anchor',family,expectedSeconds:30,difficulty:1,reviewStatus:'approved',mappingWeight:1,observationCode:'step_mismatch',version:1});items.push({id,questionId,unit,condition,family,stem});
   }
   return{studentId,atomId,name:atom.name,items,scope:{subject:'math',grade:4,term:'upper',textbookVolumeId:null,textbookVersion:'明确工程合成受控原范围',learnedAtomIds:[atomId],currentAtomId:atomId,minutesPerSession:10,progressMode:'knowledge',selectedLessonIds:[]},notice:'Only engineering source records; actual approval/publication and actual child answers must use their authorized real flows.'};
  });res.status(201).json({data:result,error:null,meta:{fixture:true}});}catch(error){console.error('Controlled material QA setup:',error instanceof Error?error.message:'unknown');res.status(403).json({data:null,error:{code:'fixture_denied',message:'Controlled material QA fixture rejected'},meta:{fixture:true}});}
 });
};

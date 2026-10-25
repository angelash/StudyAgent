// Frozen synthetic questions inside the isolated offline QA server, never AppModule.
const path=require('node:path');
const modes=['single_choice','multiple_choice','boolean','numeric_blank','text_blank','formula_blank','multi_blank','table_fill','matching','sorting','drag_drop','hotspot','geometry_draw','stepwise','image_upload','short_answer','audio_record'];
function example(mode){
  const choice=id=>({id,label:id==='a'?'甲':'乙'}),options=['a','b'].map(id=>({id,label:id.toUpperCase(),value:id,content:choice(id).label}));
  let answer='6',shape={},rubric;
  if(mode==='single_choice')answer='a';
  if(mode==='multiple_choice')answer=['a','b'];
  if(mode==='boolean')answer=true;
  if(['text_blank','short_answer'].includes(mode))answer='甲';
  if(mode==='formula_blank')answer='1+2';
  if(mode==='multi_blank'){shape={entries:[{key:'first',label:'第一个空'},{key:'second',label:'第二个空'}]};answer=[{key:'first',value:'甲'},{key:'second',value:'乙'}];}
  if(mode==='table_fill'){shape={rows:[choice('a'),choice('b')],columns:[{id:'value',label:'数量'}]};answer={cells:{'a:value':'1','b:value':'2'}};}
  if(mode==='matching'){shape={left:[choice('a'),choice('b')],right:[{id:'x',label:'一'},{id:'y',label:'二'}]};answer={pairs:[{left:'a',right:'x'},{left:'b',right:'y'}]};}
  if(mode==='sorting'){shape={items:[choice('a'),choice('b')]};answer=['a','b'];}
  if(mode==='drag_drop'){shape={items:[choice('a'),choice('b')],groups:[{id:'x',label:'第一组'},{id:'y',label:'第二组'}]};answer={placements:{a:'x',b:'y'}};}
  if(mode==='hotspot'){shape={imageUrl:'/question-assets/plane-shapes-v1.svg',imageAlt:'合成图形卡',targets:[{...choice('a'),x:0,y:0,width:.4,height:.4},{...choice('b'),x:.5,y:.5,width:.4,height:.4}]};answer='a';}
  if(mode==='geometry_draw')answer={description:'长4格宽3格，共12个单位正方形'};
  if(mode==='stepwise')answer=['先列条件','再核对结果'];
  if(['image_upload','audio_record'].includes(mode)){shape={mediaPolicy:'student-media-v1'};answer='保留真实表达，等待人工核对';}
  if(['geometry_draw','stepwise','short_answer','image_upload','audio_record'].includes(mode))rubric=[{criterion:'依据完整表达核对条件、过程和理由',weight:1}];
  return{answer,shape,rubric,options:['single_choice','multiple_choice'].includes(mode)?options:undefined};
}
exports.installAnswerJourneyFixture=app=>{
  const root=path.resolve(__dirname,'../..'),directory=path.resolve(process.env.STUDY_DATA_DIR??'.');
  if(!directory.startsWith(path.join(root,'data','qa')+path.sep)||process.env.STUDY_STORAGE!=='sqlite'||process.env.XIAOJIU_CHAT_ENABLED!=='false')throw Error('Answer fixtures require an isolated offline QA server');
  const load=name=>require('../../apps/api/dist/apps/api/src/'+name+'.js');
  const{InMemoryStoreService}=load('infrastructure/in-memory-store.service'),{hashToken}=load('modules/auth/auth.service'),{requestToken}=load('common/auth.guard'),{CurriculumService}=load('modules/diagnostics/curriculum.service'),{DiagnosticsService}=load('modules/diagnostics/diagnostics.service'),{StudentsService}=load('modules/students/students.service'),{LearningService}=load('modules/learning/learning.service');
  const store=app.get(InMemoryStoreService);
  app.getHttpAdapter().getInstance().post('/api/qa/answer-journeys',async(req,res)=>{
    try{
      const result=await store.transaction(()=>{
        const auth=store.find('sessions',{tokenHash:hashToken(requestToken(req))}),owner=auth&&store.find('users',{id:auth.userId,status:'active',role:'parent'});
        if(!owner||auth.revokedAt||Date.parse(auth.expiresAt)<=Date.now()||!/^answer-.*@local\.test$/.test(owner.principal))throw Error('Fixture authorization required');
        const{mode,kind,studentId}=req.body??{};if(!modes.includes(mode)||!['diagnostic','practice'].includes(kind)||typeof studentId!=='string'||Object.keys(req.body).some(key=>!['mode','kind','studentId'].includes(key)))throw Error('Invalid answer fixture');
        app.get(StudentsService).assertGuardian(owner,studentId);
        const atomId='answer-atom-'+store.nextId('qa'),spec=example(mode);
        store.append('knowledgeAtoms',{id:atomId,subject:'math',grade:3,term:'both',name:'合成输入验收',strand:'测试素材',prerequisiteIds:[],objective:'保留完整输入和恢复过程',successCriterion:'核对输入事实，不声明真实测量有效',curriculumVersion:'answer-journey-qa-v1',version:1,status:'published'});
        for(let n=0;n<4;n++){
          const id=atomId+'-q'+n;
          store.append('questions',{id,subject:'math',type:spec.rubric?'subjective':'objective',stem:'合成题型验收 '+mode+' · '+(n+1),answer:spec.answer,analysis:'这是用于输入恢复的合成材料，不作为真实儿童测量标准。',difficultyLevel:1,knowledgePointIds:[],status:'published'});
          store.append('questionAnswerSchemas',{questionId:id,mode,responseShape:spec.shape,options:spec.options,validationRules:{},gradingConfig:spec.rubric?{rubric:spec.rubric}:{}});
          store.append('questionSources',{questionId:id,sourceType:'internal_authoring',sourceName:'合成浏览器输入验收',sourcePathOrUrl:'',licenseClass:'A_INTERNAL',licenseName:'QA',importJobId:null,reviewStatus:'approved',notes:null});
          store.append('measurementItems',{id:id+'-item',questionId:id,questionVersion:1,atomId,dimension:'procedure',family:id+'-family',probeRole:'anchor',expectedSeconds:30,difficulty:1,reviewStatus:'approved',mappingWeight:1,observationCode:'qa-expression',version:1});
        }
        app.get(CurriculumService).saveScope(owner,studentId,{subject:'math',grade:3,term:'upper',textbookVolumeId:null,textbookVersion:'合成题型验收',learnedAtomIds:[atomId],currentAtomId:atomId,minutesPerSession:15});
        const diagnostic=app.get(DiagnosticsService).start(owner,{studentId,subject:'math',intent:'baseline',maxItems:4,includePrerequisites:false,adaptive:false});
        let sessionId=diagnostic.id,itemId=diagnostic.items[0].id,questionId=diagnostic.items[0].questionId;
        if(kind==='practice'){
          const frozen=store.find('diagnosticSessions',{id:sessionId});sessionId=store.nextId('practice');itemId=questionId;
          store.append('practiceSessions',{id:sessionId,studentId,subject:'math',planId:null,actionId:'answer-action',atomId,day:'2026-10-25',status:'in_progress',questionIds:frozen.questionSnapshots.slice(0,2).map(q=>q.id),snapshots:structuredClone(frozen.questionSnapshots.slice(0,2)),createdAt:new Date().toISOString(),completedAt:null,origin:'notebook',actionSnapshot:{id:'answer-action',atomId,title:'合成输入恢复活动',activity:'完整表达，核对恢复过程',minutes:5,successCriterion:'保存真实输入，不制造独立掌握结论'}});
          app.get(LearningService).view(owner,sessionId);
        }
        const prefix=kind==='diagnostic'?'/diagnostics/sessions/':'/learning/practice/';
        return{kind,sessionId,itemId,questionId,studentId,href:kind==='diagnostic'?'/student/assessment?studentId='+studentId+'&session='+sessionId:'/student/today?studentId='+studentId+'&practice='+sessionId,itemPath:prefix+sessionId+(kind==='diagnostic'?'/items/':'/questions/')+itemId,responsesPath:prefix+sessionId+'/responses'};
      });res.status(201).json({data:result});
    }catch(error){res.status(400).json({data:null,error:{message:'Answer QA fixture could not be prepared: '+error.message}});}
  });
};

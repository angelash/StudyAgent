/* Synthetic caption snapshots for the already isolated, offline browser fixture server only. */
const path=require('node:path');
exports.installCaptionFixture=app=>{
  const root=path.resolve(__dirname,'../..'),directory=path.resolve(process.env.STUDY_DATA_DIR??'.');
  if(!directory.startsWith(path.join(root,'data','qa')+path.sep)||process.env.STUDY_STORAGE!=='sqlite'||process.env.XIAOJIU_CHAT_ENABLED!=='false')throw new Error('Caption fixtures require an isolated offline QA server');
  const{InMemoryStoreService}=require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js'),{ClassroomService}=require('../../apps/api/dist/apps/api/src/modules/learning/classroom.service.js'),{hashToken}=require('../../apps/api/dist/apps/api/src/modules/auth/auth.service.js'),{requestToken}=require('../../apps/api/dist/apps/api/src/common/auth.guard.js'),{freezeClassroomPresentation,freezeSpeechTrack}=require('../../apps/api/dist/apps/api/src/modules/learning/classroom-presentation.js'),{classroomFingerprint}=require('../../apps/api/dist/apps/api/src/modules/learning/classroom-curriculum.js');
  const store=app.get(InMemoryStoreService),classroom=app.get(ClassroomService);
  app.getHttpAdapter().getInstance().post('/api/qa/classroom-captions',async(req,res)=>{
    try{
      const result=await store.transaction(()=>{
        const session=store.find('sessions',{tokenHash:hashToken(requestToken(req))}),owner=session&&store.find('users',{id:session.userId,status:'active',role:'parent'});
        if(!owner||session.revokedAt||Date.parse(session.expiresAt)<=Date.now()||!/^captions-.*@local\.test$/.test(owner.principal))throw new Error('Fixture authorization required');
        if(!['current','legacy','long-token'].includes(req.body?.mode)||Object.keys(req.body).some(key=>key!=='mode'))throw new Error('Invalid fixture mode');
        const opened=classroom.open(owner,{lessonId:'soc-5-1-1',useCurrentVersion:true}),row=store.find('classroomSessions',{id:opened.id}),now=new Date().toISOString();
        row.lesson.title='字幕验收 · Read the evidence';row.lesson.steps[0].title='Read the evidence';row.lesson.steps[0].narration=req.body.mode==='long-token'?'Read this address:\nhttps://example.com/'+ 'longtoken'.repeat(35)+'. Next, compare another observation.':'Dr. Lee measured 3.14 cm. Next, compare 1/2 and 50%. Finally, retain a counterexample.';
        row.lesson.steps[0].blocks=[{id:'caption-heading',kind:'heading',text:'Read the evidence'},{id:'caption-table',kind:'table',text:'Compare the observations',table:{headers:['Observation','Value'],rows:[['First','3.14 cm'],['Second','50%'],['Third','Counterexample']]}}];
        row.contentFingerprint=classroomFingerprint(row.lesson);row.presentation=freezeClassroomPresentation(row.lesson,now);row.revealed=1;row.sentenceCursor=req.body.mode==='current'?0:1;
        if(req.body.mode==='legacy')delete row.presentation;
        row.messages=[{id:store.nextId('classroom_message'),role:'assistant',content:'Keep the first observation. Compare a second condition. Preserve the counterexample.',speech:freezeSpeechTrack('Keep the first observation. Compare a second condition. Preserve the counterexample.'),at:now,modelName:'Anonymous browser fixture'}];
        return classroom.get(owner,row.id);
      });res.status(201).json({data:result});
    }catch{res.status(400).json({data:null,error:{message:'Caption QA fixture could not be prepared'}});}
  });
};

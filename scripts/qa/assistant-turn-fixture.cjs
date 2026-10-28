// Owned synthetic browser fixtures only; no provider call and no production endpoint.
const path=require('node:path');
exports.installAssistantTurnFixture=function(app){
  const root=path.resolve(__dirname,'../..'),directory=path.resolve(process.env.STUDY_DATA_DIR??'.');
  if(!directory.startsWith(path.join(root,'data','qa')+path.sep)||process.env.STUDY_STORAGE!=='sqlite'||process.env.XIAOJIU_CHAT_ENABLED!=='false'||process.env.E2E_SOURCE_COURSE_SNAPSHOT!=='1')throw Error('Assistant fixture requires the isolated browser server');
  const store=app.get(require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js').InMemoryStoreService);
  const ai=app.get(require('../../apps/api/dist/apps/api/src/modules/ai/ai.service.js').AiService);
  ai.assistantModelAvailable=()=>true;
  require('./course-assistant-fixture.cjs').installCourseAssistantFixture(app);
  const attempts=new Map();
  app.getHttpAdapter().getInstance().post('/api/qa/assistant/seed-history',async(req,res)=>{
    try{const data=await store.transaction(()=>{
      const {requestToken}=require('../../apps/api/dist/apps/api/src/common/auth.guard.js'),{hashToken}=require('../../apps/api/dist/apps/api/src/modules/auth/auth.service.js');
      const auth=store.find('sessions',{tokenHash:hashToken(requestToken(req))}),user=auth&&!auth.revokedAt&&Date.parse(auth.expiresAt)>Date.now()?store.find('users',{id:auth.userId,status:'active',role:'parent'}):null;
      if(!user)throw Error('unauthorized');const sessionId=String(req.body?.sessionId??''),session=ai.assertSessionOwner(sessionId,user,false),count=Number(req.body?.count??75),marker=String(req.body?.marker??'EARLY_HISTORY_MARKER');
      if(!Number.isInteger(count)||count<1||count>150||marker.length>60)throw Error('invalid fixture');
      const ids=[];for(let index=0;index<count;index++){const id=store.nextId('assistant_message');ids.push(id);store.append('assistantMessages',{id,sessionId:session.id,sender:index%2?'assistant':'user',content:index===0||index===count-10?marker+' · 匿名历史第'+index+'条':'合成历史第'+index+'条，核对条件再解释。',createdAt:new Date(Date.UTC(2026,0,1,10,0,index)).toISOString(),...(index%2?{source:'rules'}:{})});}
      if(req.body?.makeSourceOld===true){const source=store.select('assistantMessages',{sessionId:session.id}).find(m=>m.sender==='assistant'&&m.sourceReferences?.length);if(!source)throw Error('Expected own cited fixture');source.createdAt='2025-12-30T10:00:01.000Z';const question=store.find('assistantMessages',{id:source.inReplyTo,sessionId:session.id});if(question)question.createdAt='2025-12-30T10:00:00.000Z';}
      return {ids,count};});res.status(201).json({data,error:null,meta:{fixture:true}});
    }catch{res.status(403).json({data:null,error:{code:'fixture_denied',message:'Synthetic assistant fixture rejected'},meta:{fixture:true}});}
  });
  app.getHttpAdapter().getInstance().post('/api/qa/assistant/lecture-history',async(req,res)=>{
    try{const data=await store.transaction(()=>{
      const {requestToken}=require('../../apps/api/dist/apps/api/src/common/auth.guard.js'),{hashToken}=require('../../apps/api/dist/apps/api/src/modules/auth/auth.service.js');
      const auth=store.find('sessions',{tokenHash:hashToken(requestToken(req))}),user=auth&&!auth.revokedAt&&Date.parse(auth.expiresAt)>Date.now()?store.find('users',{id:auth.userId,status:'active',role:'parent'}):null;
      if(!user)throw Error('unauthorized');
      const {classroomCourse,classroomLesson}=require('../../apps/api/dist/apps/api/src/modules/learning/classroom-curriculum.js');
      const {freezeAssistantLecture,assistantLectureReference}=require('../../apps/api/dist/apps/api/src/modules/ai/assistant-lecture-context.js');
      const {assistantDigest}=require('../../apps/api/dist/apps/api/src/modules/ai/assistant-turn-record.js');
      const course=classroomCourse(),lectureId=String(req.body?.lectureId??course.units[0].lectures[0].id);
      const oldLecture=course.units.flatMap(unit=>unit.lectures).find(lecture=>lecture.id===lectureId);
      if(!oldLecture)throw Error('invalid fixture lecture');
      oldLecture.description='匿名保留版本：使用另一组例子比较概念与适用边界。';
      const protocol=req.body?.protocol??'classroom-lecture-v2';if(!['classroom-lecture-v1','classroom-lecture-v2'].includes(protocol))throw Error('invalid fixture protocol');
      let snapshot=freezeAssistantLecture(course.id,lectureId,course,{mode:'complete'},id=>{
        const lesson=classroomLesson(id);if(lesson)lesson.steps[0].narration='匿名旧教学正文：先比较概念，再用另一组例子核对适用条件。';return lesson;
      });
      if(protocol==='classroom-lecture-v1'){
        const safe={protocol,courseId:snapshot.courseId,courseVersion:snapshot.courseVersion,courseTitle:snapshot.courseTitle,unitId:snapshot.unitId,
          unitTitle:snapshot.unitTitle,unitPosition:snapshot.unitPosition,lectureId:snapshot.lectureId,lectureTitle:snapshot.lectureTitle,
          description:snapshot.description,lecturePosition:snapshot.lecturePosition,lessons:snapshot.lessons};snapshot={...safe,fingerprint:assistantDigest(safe)};
      }
      const referenceId=assistantLectureReference(snapshot);
      const existing=store.find('assistantSessions',{ownerUserId:user.id,contextRefType:'classroom_lecture',contextRefId:referenceId,contextItemId:lectureId});
      const id=existing?.id??store.nextId('assistant_session');
      if(!existing){
        store.append('assistantSessions',{id,ownerUserId:user.id,userRole:'parent',studentId:null,subject:null,pageContext:'classroom',contextRefType:'classroom_lecture',contextRefId:referenceId,contextItemId:lectureId,status:'active',
          scopeKey:assistantDigest([user.id,'parent',null,null,'classroom','classroom_lecture',referenceId,lectureId]),lectureSnapshot:snapshot});
        store.append('assistantMessages',{id:store.nextId('assistant_message'),sessionId:id,sender:'user',content:'LECTURE_OLD_HISTORY_MARKER · 原讲座的匿名问题',createdAt:new Date(Date.now()-60000).toISOString()},
          {id:store.nextId('assistant_message'),sessionId:id,sender:'assistant',content:'这是按匿名保留原版本给出的说明，请比较概念和反例。',source:'rules',createdAt:new Date(Date.now()-59000).toISOString()});
      }
      return {sessionId:id,courseId:course.id,lectureId,fingerprint:snapshot.fingerprint,referenceId,
        href:'/studio?'+new URLSearchParams({view:'home',mode:'instant',lectureCourse:course.id,lecture:lectureId,lectureVersion:snapshot.fingerprint})};
    });res.status(201).json({data,error:null,meta:{fixture:true}});}catch{res.status(403).json({data:null,error:{code:'fixture_denied',message:'Synthetic lecture history fixture rejected'},meta:{fixture:true}});}
  });
  return async input=>{
    const n=(attempts.get(input.message)??0)+1;attempts.set(input.message,n);
    if(input.message.includes('[assistant-fail-once]')&&n===1)throw Error('Synthetic assistant failure');
    if(input.message.includes('[assistant-pause-once]')&&n===1||input.message.includes('[assistant-hold]'))await new Promise((resolve,reject)=>{
      const abort=()=>{clearTimeout(timer);input.signal?.removeEventListener('abort',abort);reject(Error('Synthetic assistant cancellation'));};
      const timer=setTimeout(()=>{input.signal?.removeEventListener('abort',abort);resolve();},input.message.includes('[assistant-hold]')?30000:8000);
      if(input.signal?.aborted)abort();else input.signal?.addEventListener('abort',abort,{once:true});
    });
    const context=JSON.parse(input.context),teaching=context.course?.teaching??context.lecture?.teaching;
    return {reply:'先列出已有条件，再说明卡住的一步。用一个独立新例子核查，不凭一次表现确定原因。',
      ...(input.message.includes('[cite-course]')&&input.courseSources?{sourceKeys:teaching?.parts[0]?.referenceKeys??[]}:{}),
      evidenceIds:input.message.includes('[assistant-invalid-once]')&&n===1?['synthetic-unsupported-evidence']:[],modelId:input.modelId,modelName:'Synthetic assistant · '+input.modelId};
  };
};

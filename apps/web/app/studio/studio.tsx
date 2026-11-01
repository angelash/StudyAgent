'use client';
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { ChemistryCatalog, ClassroomCatalog, StudioCourse, StudioOverview, StudioSubject, StudioWhiteboard } from '@study-agent/contracts';
import { apiRequest, ApiRequestError } from '../../lib/api';
import { useSessionUser } from '../../lib/session-user';
import { TeachingGuide } from '../../components/teaching-guide';
import { WhiteboardPlayer, WhiteboardScenePreview } from './whiteboard-player';
import { IntegrationCalendar } from './integration-calendar';
import { MaterialsWorkspace } from './materials-workspace';
import { copyMaterialsState } from '../../lib/materials-navigation';
import { XiaojiuModelPicker, useXiaojiuModels } from '../../components/xiaojiu-model-picker';
import './studio.css';
import { StudioNavigation } from './studio-navigation';
import { MyCourses } from './my-courses';
import { CourseCover } from './classroom/diagram';
import './workspace.css';
import { CourseBuilder } from './course-builder';
import { CourseWorkspace } from './course-workspace';
import { upgradeCourseRevision } from '../../lib/course-upgrade-copy';
import { copyCourseFilters } from './course-library-state';
import { StudioInstantAssistant } from './studio-instant-assistant';
import { copyAssistantContext, assistantNavigationKeys, courseAssistantHref } from '../../lib/assistant-course-navigation';
import { ChemistryEnrollment, ChemistryCheckpoints, ChemistryReferences } from './chemistry-course-tools';
import { clearLearningContext, learningContextIssue, readLearningContext, saveLearningContext } from '../../lib/learning-context';
import { workspaceHref } from '../../lib/workspace-navigation';
import { WorkspaceNextAction } from '../../components/workspace-next-action';
import { teachingPracticeHref } from '../../lib/teaching-practice-navigation';
import { requestControlledCopyExit } from '../../components/controlled-copy-exit';

type View = 'home' | 'courses' | 'feed' | 'calendar' | 'materials' | 'history';
type Mode = 'craft' | 'instant';
const subjects: Array<[StudioSubject, string]> = [['math','数学'],['chinese','语文'],['english','英语'],['chemistry','化学']];
const labels: Record<View, string> = { home:'首页', courses:'课程', feed:'学习建议', calendar:'学习动态', materials:'资料', history:'历史' };

function Mark() { return <span className="sa-mark">S</span>; }

export function LearningStudio() {
  const identity = useSessionUser();
  return <LearningStudioWorkspace key={identity ? identity.id+':'+identity.role : identity === undefined ? 'checking' : 'anonymous'} identity={identity} />;
}
function LearningStudioWorkspace({identity}:{identity:ReturnType<typeof useSessionUser>}) {
  const route = useSearchParams();
  const routeKey = JSON.stringify(['view','mode','subject','student','studentId','courseScope','audience','course','whiteboard',...assistantNavigationKeys].map(key=>route.get(key)));
  const { catalog: modelCatalog, modelId, setModelId, error: modelError, reload: reloadModels } = useXiaojiuModels(Boolean(identity));
  const [classroom,setClassroom] = React.useState<ClassroomCatalog|null>(null);
  const [locationVersion,setLocationVersion] = React.useState(0);
  const loadGeneration = React.useRef(0);
  const [view,setView] = React.useState<View>('home'), [mode,setMode] = React.useState<Mode>('craft');
  const [subject,setSubject] = React.useState<StudioSubject>('math'), [studentId,setStudentId] = React.useState('');
  const [overview,setOverview] = React.useState<StudioOverview|null>(null), [active,setActive] = React.useState<StudioCourse|null>(null);
  const [chemistryCatalog,setChemistryCatalog] = React.useState<ChemistryCatalog|null>(null);
  const chemistry = subject === 'chemistry' && chemistryCatalog?.studentId === studentId ? chemistryCatalog : null;
  const [prompt,setPrompt] = React.useState(''), [busy,setBusy] = React.useState(false), [error,setError] = React.useState('');
  const [tool,setTool] = React.useState('Concept Explanation'), [toolsOpen,setToolsOpen] = React.useState(false);
  const [showBuilder,setShowBuilder] = React.useState(false);
  const builderReturnFocus = React.useRef<HTMLElement | null>(null);
  const [visual,setVisual] = React.useState<StudioOverview['selected'] extends infer T ? T extends {atoms:Array<infer A>} ? A|null : never : never>(null);
  const [whiteboardPreview,setWhiteboardPreview] = React.useState<StudioWhiteboard|null>(null);
  const [activeWhiteboard,setActiveWhiteboard] = React.useState<StudioWhiteboard|null>(null);
  const whiteboardEpoch=React.useRef(0),whiteboardAbort=React.useRef<AbortController|null>(null);
  React.useEffect(() => { whiteboardEpoch.current++;whiteboardAbort.current?.abort();setBusy(false);setActiveWhiteboard(null);setWhiteboardPreview(null);
    return()=>{whiteboardEpoch.current++;whiteboardAbort.current?.abort();}; }, [identity?.id, studentId, subject, view, mode, locationVersion]);
  const whiteboardRequestKey = React.useRef('');
  const [plannerRequest,setPlannerRequest] = React.useState(0);
  function navigate(next:View, course?:StudioCourse, materialTab?:'personal'|'packs') { setView(next);setActive(course??null);const query=new URLSearchParams(window.location.search),params=copyAssistantContext(query,copyCourseFilters(window.location.search,new URLSearchParams({view:next,subject,mode})));if(studentId&&query.get('courseScope')!=='adult')params.set('student',studentId);if(query.get('courseScope')==='adult')params.delete('subject');if(course){params.set('course',course.id);params.set('courseRevision',String(upgradeCourseRevision(course)));}if(next==='materials')params.set('tab',materialTab??'personal');window.history.pushState(null,'','/studio?'+params); }
  function changeScope(id:string,nextSubject:StudioSubject){requestControlledCopyExit(()=>applyScopeChange(id,nextSubject));}
  function applyScopeChange(id:string, nextSubject:StudioSubject) { const previous=new URLSearchParams(window.location.search),requestedView=previous.get('view');const nextView=Object.keys(labels).includes(requestedView??'')?requestedView as View:view;setView(nextView);if(id!==studentId||nextSubject!==subject){loadGeneration.current++;setOverview(null);setActive(null);setVisual(null);}setStudentId(id);setSubject(nextSubject);setShowBuilder(false);setError('');const params=new URLSearchParams({view:nextView,subject:nextSubject,mode});if(nextView==='materials'){copyMaterialsState(previous,params,false);if(!id&&['files','packs'].includes(params.get('tab')??''))params.set('tab','personal');}if(previous.get('audience')==='course')copyAssistantContext(previous,params);if(id)params.set('student',id);else{params.set('courseScope','adult');params.delete('subject');}window.history.pushState(null,'','/studio?'+params);setLocationVersion(value=>value+1); }
  function resetContext() { clearLearningContext(); loadGeneration.current++;window.location.replace('/studio?student=&subject=math'); }
  React.useEffect(()=>{
    const params=new URLSearchParams(window.location.search),nextView=params.get('view'),nextSubject=params.get('subject');
    setView(Object.keys(labels).includes(nextView??'')?nextView as View:'home');
    setMode(params.get('mode')==='instant'?'instant':'craft');
    if(subjects.some(([value])=>value===nextSubject))setSubject(nextSubject as StudioSubject);
    const issue=learningContextIssue(window.location.search);
    if(issue){loadGeneration.current++;setOverview(null);setStudentId('');setError(issue);return;}
    const selected=readLearningContext(identity?.id??'',window.location.search);
    setStudentId(selected.audience==='self'?'':selected.studentId??'');
    if(subjects.some(([value])=>value===selected.subject))setSubject(selected.subject);
    setShowBuilder(false);setLocationVersion(value=>value+1);
  },[routeKey]);
  React.useEffect(()=>{if(identity&&identity.role!=='student')void apiRequest<ClassroomCatalog>('/learning/classroom/catalog').then(setClassroom).catch(error=>setError(error.message));},[identity]);

  const load = React.useCallback(async () => {
    if (!identity) return;
    const generation=++loadGeneration.current;
    const issue=learningContextIssue(window.location.search);
    if(issue){setOverview(null);setError(issue);return;}
    const selected=readLearningContext(identity.id,window.location.search),independent=selected.audience==='self';
    if (identity.role === 'student' && independent) { setOverview(null);setError('学生学习身份不能进入成人独立学习，请返回自己的学习档案。');return; }
    setError('');
    try { const q=new URLSearchParams({subject:selected.subject,materialView:'catalog'}); if(independent)q.set('audience','independent');else if(selected.studentId||studentId)q.set('studentId',selected.studentId||studentId);
      const params=new URLSearchParams(window.location.search),requestedCourse=params.get('course');
      if(!independent&&requestedCourse&&requestedCourse!=='chemistry'&&(!requestedCourse.startsWith('chemistry-course:')||subject!=='chemistry'))q.set('courseId',requestedCourse);
      const data=await apiRequest<StudioOverview>(`/learning/studio/overview?${q}`); if(generation!==loadGeneration.current)return;
      setOverview(data);
      if (data.selected) saveLearningContext(identity.id, { studentId: data.selected.id, subject: data.selected.subject });
      else if (identity.role !== 'student') saveLearningContext(identity.id, { subject: selected.subject, audience: 'self' });
      if(data.selected){if(data.selected.id!==studentId)setStudentId(data.selected.id);if(data.selected.subject!==subject){setSubject(data.selected.subject);params.set('subject',data.selected.subject);params.set('student',data.selected.id);window.history.replaceState(null,'','/studio?'+params);}}
    }
    catch(e){if(generation===loadGeneration.current)setError(e instanceof ApiRequestError && e.status === 403 ? '所选档案不存在或当前无法访问，请重新选择可用档案。' : (e as Error).message);}
  },[identity,subject,studentId,locationVersion]);
  React.useEffect(()=>{void load()},[load]);
  const loadChemistry = React.useCallback(async () => {
    if (!identity || subject !== 'chemistry' || !studentId) return;
    const catalog = await apiRequest<ChemistryCatalog>('/chemistry/catalog?studentId=' + encodeURIComponent(studentId));
    setChemistryCatalog(catalog);
  },[identity,subject,studentId]);
  React.useEffect(()=>{
    const controller = new AbortController(); setChemistryCatalog(null);
    if(identity && subject === 'chemistry' && studentId) void apiRequest<ChemistryCatalog>('/chemistry/catalog?studentId=' + encodeURIComponent(studentId), {signal:controller.signal})
      .then(catalog=>{if(!controller.signal.aborted)setChemistryCatalog(catalog);})
      .catch(caught=>{if(!controller.signal.aborted)setError((caught as Error).message);});
    return()=>controller.abort();
  },[identity,subject,studentId]);
  async function refreshCourse() {
    const results = await Promise.allSettled([load(), loadChemistry()]);
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  }
  React.useEffect(()=>{if(modelError)setError(modelError)},[modelError]);
  React.useEffect(()=>{
    if(!overview)return;
    const params=new URLSearchParams(window.location.search), courseId=params.get('course'), whiteboardId=params.get('whiteboard'), requestedView=params.get('view');
    const course=overview.courses.find(item=>item.id===courseId) ?? (chemistry?.course && (courseId===chemistry.course.id || courseId==='chemistry') ? chemistry.course : undefined);
    const whiteboard=overview.whiteboards.find(item=>item.id===whiteboardId);
    if(course&&!(requestedView==='home'&&params.get('mode')==='instant')){setActive(course);setView('courses');if(courseId==='chemistry'){params.set('course',course.id);window.history.replaceState(null,'','/studio?'+params);}}
    else if(whiteboard)setActiveWhiteboard(whiteboard);
    else if(['home','courses','feed','calendar','materials','history'].includes(requestedView??'')){setView(requestedView as View);setActive(null);}
  },[overview,chemistry,locationVersion]);
  React.useEffect(()=>{
    if(!toolsOpen)return;
    function dismiss(event:PointerEvent|KeyboardEvent){
      if(event instanceof KeyboardEvent&&event.key!=='Escape')return;
      const target=event.target as Element|null;
      if(event instanceof KeyboardEvent||!target?.closest('.sa-tools-popover')&&!target?.closest('[data-tools-trigger]'))setToolsOpen(false);
    }
    document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',dismiss);
    return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',dismiss)};
  },[toolsOpen]);
  async function makeWhiteboard(text = prompt) {
    if(busy)return;
    if (!studentId || !text.trim()) { setError('请先确认学习档案并输入白板主题'); return; }
    const revision=++whiteboardEpoch.current,controller=new AbortController();whiteboardAbort.current?.abort();whiteboardAbort.current=controller;
    setPrompt(text); setBusy(true); setError('');
    try { const preview=await apiRequest<StudioWhiteboard>('/learning/studio/whiteboards/preview', {
      method: 'POST', body: JSON.stringify({ studentId, subject, prompt: text }),signal:controller.signal });if(revision!==whiteboardEpoch.current||controller.signal.aborted)return;whiteboardRequestKey.current=crypto.randomUUID();setWhiteboardPreview(preview); }
    catch (caught) { if(revision===whiteboardEpoch.current&&!controller.signal.aborted)setError((caught as Error).message); } finally { if(revision===whiteboardEpoch.current){setBusy(false);whiteboardAbort.current=null;} }
  }
  async function saveWhiteboard() {
    if (!whiteboardPreview) return; setBusy(true);
    try { const saved = await apiRequest<StudioWhiteboard>('/learning/studio/whiteboards', { method: 'POST',
      body: JSON.stringify({ studentId, subject, prompt, fingerprint: whiteboardPreview.fingerprint, requestKey: whiteboardRequestKey.current||(whiteboardRequestKey.current=crypto.randomUUID()) }) });
      whiteboardRequestKey.current=''; setWhiteboardPreview(null); setActiveWhiteboard(saved); await load(); }
    catch (caught) { setError((caught as Error).message); } finally { setBusy(false); }
  }
  function submit(e:React.FormEvent){e.preventDefault();setShowBuilder(true);}
  function changeMode(next:Mode){setMode(next);setView('home');const params=new URLSearchParams(window.location.search);params.set('view','home');params.set('mode',next);if(next==='craft')for(const key of assistantNavigationKeys)params.delete(key);window.history.pushState(null,'','/studio?'+params);setLocationVersion(value=>value+1);}

  if(identity===undefined)return <div className="sa-loading"><Mark/>正在打开学习工作台…</div>;
  const loginReturn=typeof window==='undefined'?'/studio':window.location.pathname+window.location.search;
  if(!identity)return <main className="workspace-entry"><Mark/><h1>进入 StudyAgent 学习工作台</h1><p>用自己的身份继续课程、练习和学习记录。</p><Link className="workspace-button" href={'/student/login?'+new URLSearchParams({returnTo:loginReturn})}>孩子使用学习码进入 →</Link><Link className="workspace-button" href={'/parent/login?'+new URLSearchParams({returnTo:loginReturn})}>家长 / 教师登录 →</Link><Link href="/">了解 StudyAgent</Link></main>;
  const locationQuery=new URLSearchParams(typeof window==='undefined'?'':window.location.search);
  const independentWorkspace=identity.role!=='student'&&(readLearningContext(identity.id,typeof window==='undefined'?'':window.location.search).audience==='self'||!!overview&&!overview.children.length&&!studentId||mode==='instant'&&(locationQuery.has('lectureCourse')||!studentId));
  const courses=[...(overview?.courses??[]), ...(chemistry?.course && !overview?.courses.some(course=>course.id===chemistry.course!.id) ? [chemistry.course] : [])], feed=overview?.feed??[], activities=overview?.activities??[];
  const visualExample = independentWorkspace ? ['把概念之间的关系讲清楚','围绕自己的学习目标展开'] : { math:['用图形解释异分母加法','通分、合并与验算'], chemistry:['比较物理变化与化学变化','观察现象与新物质的证据'], chinese:['比较人物描写的依据','从语句回到人物与情境'], english:['比较一般现在时与过去时','时间线索与动词形式'] }[subject];
  const lastReading = [...(classroom?.readingProgress ?? classroom?.progress ?? [])].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
  const lastLesson = classroom?.course.units.flatMap(unit=>unit.lectures.flatMap(lecture=>lecture.lessons)).find(lesson=>lesson.id===lastReading?.lessonId);
  const workspaceContext = { studentId: independentWorkspace ? undefined : studentId || identity.studentId, subject, ...(independentWorkspace ? { audience: 'self' as const } : {}) };
  return <main className="sa-app ws-app" data-view={view}>
    <StudioNavigation context={workspaceContext} active={view} onNavigate={navigate} onCreate={overview ? target=>{builderReturnFocus.current=target??null;setShowBuilder(true);} : undefined} recent={[
      ...(lastReading && lastLesson ? [{title:lastLesson.title,detail:classroom!.course.title,href:'/studio/classroom?'+new URLSearchParams({lesson:lastReading.lessonId,session:lastReading.sessionId})}] : []),
      ...activities.slice(0,3).map(activity=>({title:activity.title,detail:activity.detail,href:activity.href}))]}/>
    <section className="sa-stage"><header className="sa-top"><div><strong>{labels[view]}</strong>
      {overview && <select aria-label="学习对象" disabled={identity.role==='student'} value={independentWorkspace?'self':studentId} onChange={event=>changeScope(event.target.value==='self'?'':event.target.value,subject)}>{identity.role!=='student'&&<option value="self">我自己 · 独立学习</option>}{overview.children.map(child=><option key={child.id} value={child.id}>{child.nickname} · {child.grade}年级</option>)}</select>}
      {!independentWorkspace&&<select aria-label="学科" value={subject} onChange={event=>changeScope(studentId,event.target.value as StudioSubject)}>{subjects.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>}
    </div><div><Link href="/studio/classroom">教学课堂 ↗</Link>{!independentWorkspace&&<Link href={workspaceHref('reports',workspaceContext)}>学习报告</Link>}</div></header>{error&&<div className="sa-error" role="alert"><span>{error}</span><div><button onClick={()=>void load()}>重新读取</button><button onClick={resetContext}>重新选择可用档案</button></div></div>}
      {view==='home'&&overview&&<section className={'sa-home'+(mode==='instant'?' sa-reference-assistant':'')}><WorkspaceNextAction actorId={identity.id} context={workspaceContext} classroom={classroom}/><div className={'sa-tabs'+(mode==='instant'?' home-mode-tabs':'')}><button className={'home-mode-tab'+(mode==='craft'?' active':'')} data-active={mode==='craft'} onClick={()=>changeMode('craft')}>Craft Courses</button><button className={'home-mode-tab'+(mode==='instant'?' active':'')} data-active={mode==='instant'} onClick={()=>changeMode('instant')}>Instant Assistance</button></div>{mode==='craft'&&<><div className="sa-hero"><h1>今天，想学些什么？</h1><p>创建一门课程，或从一个具体问题开始。</p></div><form className="sa-composer" onSubmit={submit}><textarea aria-label="课程主题" value={prompt} onChange={e=>setPrompt(e.target.value)} rows={3} placeholder="围绕哪段学习内容设计课程？"/><div><span>＋</span><span>资料</span><button type="button" data-tools-trigger onClick={()=>setToolsOpen(!toolsOpen)}>{tool}</button><span>语音</span><span className="sa-spacer"/><XiaojiuModelPicker error={modelError} onRetry={reloadModels} catalog={modelCatalog} value={modelId} onChange={setModelId} compact disabled={busy}/><button type="submit" aria-label="创建课程" disabled={busy}>{busy?'…':'↑'}</button></div>{toolsOpen&&<div className="sa-tools-popover" role="menu"><button type="button" onClick={()=>{setTool('Concept Explanation');setToolsOpen(false)}}><b>概念讲解</b><span>从一个问题拆出关系、例子与检查点</span></button><button type="button" onClick={()=>{setTool('Personal Study Materials Generation');setToolsOpen(false)}}><b>个性化学习材料</b><span>围绕当前已确认范围生成讲义与练习</span></button><button type="button" onClick={()=>{setTool('Long-files Digestion');setToolsOpen(false)}}><b>长资料整理</b><span>把课件内容整理成可核对的学习结构</span></button><button type="button" onClick={()=>{setTool('Visualization');setToolsOpen(false)}}><b>可视化讲解</b><span>只使用已审核图形与知识依据</span></button><button type="button" onClick={()=>{setTool('Whiteboard session');setToolsOpen(false)}}><b>Whiteboard session</b><span>把问题转成逐幕动画、旁白和可导出视频</span></button>{identity.role!=='student'&&<button type="button" onClick={()=>{setTool('Study Planner');setToolsOpen(false);navigate('calendar');setPlannerRequest(value=>value+1)}}><b>Study Planner</b><span>创建学习任务并加入日历</span></button>}</div>}</form><div className="sa-prompts"><button onClick={()=>{changeMode('instant');setPrompt(visualExample[0]);const a=overview?.selected?.atoms.find(x=>x.teaching?.visual);if(a)setVisual(a);}}><b>可视化</b><span>{visualExample[0]}</span><small>{visualExample[1]}</small></button><button onClick={()=>{setPrompt('从已知点生成练习');setShowBuilder(true);}}><b>{independentWorkspace?'资料课程':'个性化练习'}</b><span>{independentWorkspace?'用自己的资料设计课程':'从我的已知点生成练习'}</span><small>{independentWorkspace?'先核对来源和学习目标':'只覆盖已确认范围'}</small></button><button onClick={()=>independentWorkspace?window.location.assign(workspaceHref('tasks',workspaceContext)):navigate('feed')}><b>{independentWorkspace?'学习任务':'主动学习'}</b><span>{independentWorkspace?'回到自己的课程记录':'看看今天最值得做什么'}</span><small>{independentWorkspace?'接着上次保存的位置':'按教育优先级排序'}</small></button></div>
        </>}
        {mode==='instant'&&<StudioInstantAssistant identity={identity} studentId={studentId} subject={subject} locationVersion={locationVersion} whiteboardBusy={busy} onWhiteboard={text=>void makeWhiteboard(text)} onWorkspace={(target,packs)=>{navigate(target,undefined,packs?'packs':undefined);if(target==='calendar')setPlannerRequest(value=>value+1);}}/>}
        {visual?.teaching&&<div className="sa-visual"><h2>{visual.name}</h2><TeachingGuide snapshot={{atomVersion:1,teaching:visual.teaching}}/></div>}
        {mode==='craft'&&<><div className="sa-section-head"><h2>{active?'从课程继续':'你的学习路径'}</h2><button onClick={()=>setShowBuilder(true)}>创建课程</button></div>
        {courses.length?<div className="sa-cards">{courses.map(c=><button key={c.id} onClick={()=>navigate('courses',c)}><span>{c.grade}年级</span><h3>{c.title}</h3><p>{c.objective}</p><small>{c.units.length} 单元 · {c.focusAtomIds.length} 目标</small></button>)}</div>:<div className="sa-empty"><h3>还没有课程</h3><p>先确认学习范围，再从已学知识生成可审核蓝图。</p><button onClick={()=>setShowBuilder(true)}>生成第一门课程</button></div>}
        </>}</section>}
      {view==='courses'&&<section className="ws-course-page">{active?<CourseWorkspace key={active.id} course={active} actor={identity} selected={overview?.selected??null} enrollmentPreview={Boolean(chemistry?.course?.id===active.id&&!chemistry.courseId)} onChanged={refreshCourse} onConfirmed={course=>{navigate('courses',course);void load();}}>{(course,versionControls,archived)=><CourseView key={course.id+':'+upgradeCourseRevision(course)} course={course} versionControls={versionControls} archived={archived} chemistry={chemistry?.course?.id===course.id&&!archived?chemistry:null} onCourseChanged={refreshCourse} back={()=>navigate('courses')}/>}</CourseWorkspace>:<MyCourses key={studentId+subject} courses={courses} classroom={classroom} studentId={studentId} subject={subject} programmingHref={identity.role==='student'?'/student/gesp':identity.role==='admin'?'/admin/gesp':'/parent/gesp?'+new URLSearchParams({studentId})} onCreate={()=>setShowBuilder(true)} onOpen={course=>navigate('courses',course)}/>}</section>}
      {view==='feed'&&<section className="sa-page"><div className="sa-page-head"><h1>Learning Feed</h1><small>{overview?.day}</small></div>{feed.map((f,i)=><a className="sa-feed" data-primary={i===0} key={f.id} href={f.href}><b>{String(i+1).padStart(2,'0')}</b><div><small>{f.kind}</small><h2>{f.title}</h2><p>{f.reason}</p></div><span>→</span></a>)}</section>}
      {!overview&&!error&&<p className="ws-loading" role="status">正在加载学习工作台…</p>}
      {view==='calendar'&&overview&&<section className="sa-page"><IntegrationCalendar key={identity.id+studentId+subject} user={identity} studentId={studentId} subject={subject} value={overview.integrations}
        plans={overview.plans} atoms={overview.selected?.atoms??[]} canManage={identity.role!=='student'} openPlanner={plannerRequest}
        onChanged={load} onError={setError} onOpenWhiteboard={setActiveWhiteboard}/></section>}
      {view==='history'&&<section className="sa-page"><div className="sa-page-head"><h1>学习历史</h1></div>{!activities.length&&<div className="ws-empty"><h2>还没有学习活动</h2><p>从课程开始，学习与练习记录会保存在这里。</p><Link href="/studio?view=courses">查看我的课程 →</Link></div>}{activities.map(a=><a className="sa-history" key={a.id} href={a.href}><time>{new Date(a.at).toLocaleString('zh-CN')}</time><div><h2>{a.title}</h2><p>{a.detail}</p></div></a>)}</section>}
      {view==='materials'&&overview&&<MaterialsWorkspace identity={identity} context={workspaceContext} overview={overview} onChanged={load} onOpenWhiteboard={setActiveWhiteboard} onError={setError}/>}
    </section>
    {showBuilder&&<CourseBuilder key={studentId+subject} studentId={studentId} subject={subject} selected={overview?.selected??null} initialTitle={prompt} returnFocus={builderReturnFocus.current} onClose={()=>{setShowBuilder(false);builderReturnFocus.current=null;}} onRefresh={load} onCreated={course=>{setShowBuilder(false);builderReturnFocus.current=null;navigate('courses',course);void load();}}/>}
    {activeWhiteboard&&<WhiteboardPlayer whiteboard={activeWhiteboard} narrationAvailable={overview?.narrationAvailable} speech={overview?.speech} onClose={()=>setActiveWhiteboard(null)}/>}
    {whiteboardPreview&&<div className="sa-whiteboard-preview-modal"><button className="sa-scrim" onClick={()=>setWhiteboardPreview(null)}/><section><header><div><span className="studio-kicker">WHITEBOARD SESSION</span><h2>{whiteboardPreview.title}</h2></div><button aria-label="关闭预览" onClick={()=>setWhiteboardPreview(null)}>×</button></header><WhiteboardScenePreview scene={whiteboardPreview.scenes[0]} /><div className="sa-whiteboard-preview-copy"><strong>{whiteboardPreview.scenes.length} 幕 · {Math.ceil(whiteboardPreview.durationMs/1000)} 秒</strong><p>预览采用逐句文字阅读。保存后可选择云语音，按实际音轨结束继续；WebM 与 SRT 共用完整逐句时间表。</p></div><footer><button onClick={()=>setActiveWhiteboard(whiteboardPreview)}>播放预览</button><button disabled={busy} onClick={()=>void saveWhiteboard()}>{busy?'正在保存…':'保存到学习工作台'}</button></footer></section></div>}
  </main>;
}

function CourseView({course,back,chemistry,onCourseChanged,versionControls,archived}:{course:StudioCourse;back:()=>void;chemistry:ChemistryCatalog|null;onCourseChanged:()=>Promise<void>;versionControls:React.ReactNode;archived:boolean}) {
  const [tab,setTab]=React.useState<'outline'|'materials'|'practices'|'checks'>('outline');
  const [librarySearch,setLibrarySearch]=React.useState('');
  const [unitId,setUnitId]=React.useState(course.units[0]?.id??'');
  React.useEffect(()=>{const restore=()=>{setLibrarySearch(window.location.search);const params=new URLSearchParams(window.location.search),id=params.get('unit'),panel=params.get('panel');if(course.units.some(unit=>unit.id===id))setUnitId(id!);else if(chemistry&&id&&/^u[1-7]$/.test(id))setUnitId(course.units[Number(id.slice(1))-1]?.id??course.units[0]?.id??'');setTab(panel==='materials'||panel==='practices'||panel==='checks'&&chemistry?panel:'outline');};restore();window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);},[course,chemistry]);
  function select(unit:string,panel:typeof tab) {setUnitId(unit);setTab(panel);const url=new URL(window.location.href);url.searchParams.set('unit',unit);url.searchParams.set('panel',panel);window.history.replaceState(null,'',url.pathname+url.search);}
  const unit=course.units.find(item=>item.id===unitId)??course.units[0];
  const chemistryUnit = chemistry?.units[course.units.indexOf(unit)];
  const needsEnrollment = Boolean(chemistry && !chemistry.courseId);
  const materialsHref='/studio?'+new URLSearchParams({view:'materials',student:course.studentId,subject:course.subject});
  const viewed=new Set(course.learningProgress?.viewedLessonIds??[]),started=new Set(course.learningProgress?.startedLessonIds??[]);
  function href(lesson:StudioCourse['units'][number]['lessons'][number]) { if(lesson.textbookTeachingLessonId)return teachingPracticeHref(course,lesson)??lesson.href;if(lesson.kind==='project')return '/studio/projects?'+copyCourseFilters(librarySearch,new URLSearchParams({studioCourseId:course.id,unitId,returnUnit:unitId,returnPanel:tab,student:course.studentId,studentId:course.studentId,subject:course.subject}));return lesson.kind==='learn'&&(Boolean(lesson.textbookTeaching)||lesson.teaching?.teaching.reviewStatus==='approved')
    ? '/studio/classroom?'+copyCourseFilters(librarySearch,new URLSearchParams({studioCourseId:course.id,courseRevision:String(upgradeCourseRevision(course)),lesson:lesson.id,returnUnit:unitId,returnPanel:tab,returnStudent:course.studentId,returnSubject:course.subject})) : lesson.href; }
  function activityLink(lesson:StudioCourse['units'][number]['lessons'][number],label:React.ReactNode,className?:string,key?:string) {
    return needsEnrollment ? <span className="cl-activity-unavailable" key={key}>添加课程后开放</span> : <Link key={key} className={className} href={href(lesson)}>{label}</Link>;
  }
  return <div className="ws-student-course cl-course-layout"><aside className="cl-course-sidebar"><button className="cl-exit-course" onClick={back}>× <span>退出课程</span></button>
    <CourseCover/><div className="cl-curator"><span>S</span><div><small>策划自</small><b>StudyAgent Learning Studio</b></div></div><h1>{course.title}</h1><p>{course.description}</p><details><summary>显示更多</summary><p>{course.objective}</p><p>{course.textbookVersion} · {course.grade}年级</p></details>
    {versionControls}
    <div className="cl-panel-label">面板</div><div className="cl-course-tabs" role="tablist" aria-label="课程面板">{(['outline','materials','practices',...(chemistry?['checks' as const]:[])] as const).map(value=><button role="tab" key={value} aria-selected={tab===value} onClick={()=>select(unitId,value)}>{{outline:'单元',materials:'资料',practices:'练习',checks:'考核'}[value]}</button>)}</div>
    <nav className="cl-unit-nav" aria-label="课程单元">{course.units.map((item,index)=><button key={item.id} data-active={item.id===unitId} onClick={()=>select(item.id,tab)}><b>{index+1}</b>{item.title.replace(/^Unit \d+: /,'')}</button>)}</nav>
  </aside><section className="cl-outline">{chemistry&&<ChemistryEnrollment catalog={chemistry} onChanged={onCourseChanged}/>}<header className="cl-unit-heading"><small>第 {course.units.indexOf(unit)+1} 单元，共 {course.units.length} 单元</small><h2>{unit?.title}</h2><p>{unit?.objective}</p>{!needsEnrollment&&unit&&['active','completed'].includes(course.status)&&unit.lessons.some(lesson=>lesson.kind==='learn'&&lesson.teaching?.teaching.reviewStatus==='approved')&&<a className="cl-help" href={courseAssistantHref('primary_unit',course.id,unit.id,course.studentId,course.subject)}>获取单元帮助</a>}</header>
    {chemistry&&<p className="cl-course-chain">课前诊断 → 讲解与练习 → 独立考核 → 错因核查与补练 → 间隔复测</p>}
    {new URLSearchParams(librarySearch).has('practiceLesson')&&(()=>{const requested=new URLSearchParams(librarySearch).get('practiceLesson'),activity=course.units.flatMap(unit=>unit.lessons).find(lesson=>lesson.id===requested&&lesson.kind==='practice'&&lesson.textbookTeachingLessonId);return <section className="cl-card" aria-label="本课独立检查入口">{activity?<><h3>{activity.title}</h3><p>{activity.targetAtomIds?.length} 个原教学目标。先查看本次题组与缺口，再由孩子本人独立作答。</p>{activityLink(activity,'查看本课独立检查 →','cl-practice')}</>:<p role="alert">这条原练习链接不属于当前课程，请从下面的原课时重新选择。</p>}</section>;})()}
    {archived?<p className="ws-evidence-footnote">正在查看原课程历史教学。打开课时会明确使用这一修订；已有作答与保持记录继续按原版本读取。</p>:<Link className="cl-extend" href={materialsHref}><span>▤</span><div><b>上传材料，扩展这门课程</b><small>阅读PDF、核对结构并生成学案</small></div><span>↗</span></Link>}
    {course.pace&&tab==='outline'&&<details className="ws-course-pace"><summary>每次约 {course.pace.minutesPerSession} 分钟 · {course.pace.sessions.length} 个建议时段</summary><p>{course.pace.notice}</p><ol>{course.pace.sessions.map((session,index)=><li key={session.id}><b>第 {index+1} 次 · 约 {session.minutes} 分钟</b><div>{session.activities.map(activity=>{const target=course.units.flatMap(unit=>unit.lessons).find(lesson=>lesson.id===activity.lessonId);return target&&activityLink(target,<>{activity.title}{activity.parts>1&&`（${activity.part}/${activity.parts}）`} →</>,undefined,activity.lessonId+':'+activity.part);})}</div></li>)}</ol></details>}
    <div className="cl-legend"><span><i className="cl-ring" data-state="viewed"/>讲解已读</span><span><i className="cl-ring" data-state="started"/>已接触</span><span><i className="cl-ring"/>未开始</span></div>
    {tab==='materials'?<><div className="cl-card"><h2>课程资料</h2>{course.materials.map(item=><article key={item.id}><h3>{item.title}</h3><p>{item.detail}</p><small>{item.status==='available'?'已绑定来源':'等待核对'}</small></article>)}<Link href={materialsHref}>打开我的资料与学案 →</Link></div>{chemistry&&<ChemistryReferences catalog={chemistry}/>}</>:
      tab==='checks'&&chemistry&&chemistryUnit?<ChemistryCheckpoints catalog={chemistry} unitId={chemistryUnit.id} kind="all"/>:
      <>{chemistry&&chemistryUnit&&tab==='outline'&&<ChemistryCheckpoints catalog={chemistry} unitId={chemistryUnit.id} kind="baseline"/>}<div className="cl-timeline"><article className="cl-lecture"><span className="cl-timeline-icon">▧</span><header><strong>{tab==='practices'?'独立练习':'本单元讲座'}</strong></header><p>{unit?.objective}</p><div className="cl-microlessons">{unit?.lessons.filter(lesson=>tab==='practices'?lesson.kind==='practice':lesson.kind==='learn').map(lesson=>{
        const practice=unit.lessons.find(item=>item.kind==='practice'&&(item.textbookTeachingLessonId?item.textbookTeachingLessonId===lesson.id:item.atomId===lesson.atomId));
        return <div className="cl-micro" key={lesson.id}><span>{lesson.title}</span>{tab==='practices'?activityLink(lesson,'独立验证 →','cl-practice'):<>{activityLink(lesson,started.has(lesson.id)?'▶ 继续学习':'▶ 学习','cl-learn')}{practice&&!needsEnrollment&&activityLink(practice,'练习','cl-practice')}</>}<i className="cl-ring" data-state={viewed.has(lesson.id)?'viewed':started.has(lesson.id)?'started':'new'}/></div>;
      })}</div></article>{unit?.lessons.filter(item=>item.kind==='project'||item.kind==='exam'&&!chemistry).map(item=><article className="cl-lecture" key={item.id}><span className="cl-timeline-icon">{item.kind==='project'?'▣':'♙'}</span><h3>{item.title}</h3><p>{item.objective}</p>{activityLink(item,<>打开{item.kind==='project'?'项目':'独立核查'} →</>,'ws-open-activity')}</article>)}</div>{chemistry&&chemistryUnit&&<ChemistryCheckpoints catalog={chemistry} unitId={chemistryUnit.id} kind="unit"/>}</>}
    <p className="ws-evidence-footnote">阅读进度只表示讲解已读。知识掌握由独立题目、迁移和延迟复测核查。</p>
  </section></div>;
}

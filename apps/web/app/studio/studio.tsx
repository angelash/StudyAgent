'use client';
import * as React from 'react';
import Link from 'next/link';
import type { ClassroomCatalog, StudioCourse, StudioOverview, StudioSubject, StudioWhiteboard } from '@study-agent/contracts';
import { apiRequest } from '../../lib/api';
import { useSessionUser } from '../../lib/session-user';
import { TeachingGuide } from '../../components/teaching-guide';
import { WhiteboardPlayer, WhiteboardScenePreview } from './whiteboard-player';
import { IntegrationCalendar } from './integration-calendar';
import { PdfMaterialLab } from './pdf-material-lab';
import { LearningPackStudio } from './learning-pack-studio';
import { XiaojiuModelPicker, useXiaojiuModels } from '../../components/xiaojiu-model-picker';
import './studio.css';
import { StudioNavigation } from './studio-navigation';
import { MyCourses } from './my-courses';
import { CourseCover } from './classroom/diagram';
import './workspace.css';
import { CourseBuilder } from './course-builder';
import { copyCourseFilters } from './course-library-state';

type View = 'home' | 'courses' | 'feed' | 'calendar' | 'materials' | 'history';
type Mode = 'craft' | 'instant';
const subjects: Array<[StudioSubject, string]> = [['math','数学'],['chinese','语文'],['english','英语']];
const labels: Record<View, string> = { home:'首页', courses:'课程', feed:'学习建议', calendar:'学习动态', materials:'资料', history:'历史' };

function Mark() { return <span className="sa-mark">S</span>; }

export function LearningStudio() {
  const identity = useSessionUser();
  const { catalog: modelCatalog, modelId, setModelId, error: modelError } = useXiaojiuModels(Boolean(identity));
  const [classroom,setClassroom] = React.useState<ClassroomCatalog|null>(null);
  const [locationVersion,setLocationVersion] = React.useState(0);
  const loadGeneration = React.useRef(0);
  const [view,setView] = React.useState<View>('home'), [mode,setMode] = React.useState<Mode>('craft');
  const [subject,setSubject] = React.useState<StudioSubject>('math'), [studentId,setStudentId] = React.useState('');
  const [overview,setOverview] = React.useState<StudioOverview|null>(null), [active,setActive] = React.useState<StudioCourse|null>(null);
  const [prompt,setPrompt] = React.useState(''), [busy,setBusy] = React.useState(false), [error,setError] = React.useState('');
  const [tool,setTool] = React.useState('Concept Explanation'), [toolsOpen,setToolsOpen] = React.useState(false);
  const [showBuilder,setShowBuilder] = React.useState(false);
  const [messages,setMessages] = React.useState<Array<{id:string;sender:string;content:string;modelId?:string|null;modelName?:string|null}>>([]), [session,setSession] = React.useState('');
  const [visual,setVisual] = React.useState<StudioOverview['selected'] extends infer T ? T extends {atoms:Array<infer A>} ? A|null : never : never>(null);
  const [whiteboardPreview,setWhiteboardPreview] = React.useState<StudioWhiteboard|null>(null);
  const [activeWhiteboard,setActiveWhiteboard] = React.useState<StudioWhiteboard|null>(null);
  const whiteboardRequestKey = React.useRef('');
  const [plannerRequest,setPlannerRequest] = React.useState(0);
  const [materialsTab,setMaterialsTab] = React.useState<'files'|'packs'>('files');
  function navigate(next:View, course?:StudioCourse) { setView(next);setActive(course??null);const params=copyCourseFilters(window.location.search,new URLSearchParams({view:next,subject}));if(studentId)params.set('student',studentId);if(course)params.set('course',course.id);window.history.pushState(null,'','/studio?'+params); }
  function changeScope(id:string, nextSubject:StudioSubject) { const requestedView=new URLSearchParams(window.location.search).get('view');const nextView=Object.keys(labels).includes(requestedView??'')?requestedView as View:view;setView(nextView);loadGeneration.current++;setOverview(null);setActive(null);setStudentId(id);setSubject(nextSubject);setShowBuilder(false);setMessages([]);setSession('');setError('');const params=new URLSearchParams({view:nextView,subject:nextSubject});if(id)params.set('student',id);window.history.replaceState(null,'','/studio?'+params); }
  React.useEffect(()=>{const params=new URLSearchParams(window.location.search);const initialView=params.get('view');if(Object.keys(labels).includes(initialView??''))setView(initialView as View);const selectedSubject=params.get('subject');if(subjects.some(([value])=>value===selectedSubject))setSubject(selectedSubject as StudioSubject);if(params.get('student'))setStudentId(params.get('student')!);},[]);
  React.useEffect(()=>{const changed=()=>{const params=new URLSearchParams(window.location.search);const nextSubject=params.get('subject');if(subjects.some(([value])=>value===nextSubject))setSubject(nextSubject as StudioSubject);if(params.get('student'))setStudentId(params.get('student')!);setLocationVersion(value=>value+1);};window.addEventListener('popstate',changed);return()=>window.removeEventListener('popstate',changed);},[]);
  React.useEffect(()=>{if(identity&&identity.role!=='student')void apiRequest<ClassroomCatalog>('/learning/classroom/catalog').then(setClassroom).catch(error=>setError(error.message));},[identity]);

  const load = React.useCallback(async () => {
    if (!identity) return;
    const generation=++loadGeneration.current;
    try { const q=new URLSearchParams({subject}); if(studentId)q.set('studentId',studentId); const data=await apiRequest<StudioOverview>(`/learning/studio/overview?${q}`); if(generation!==loadGeneration.current)return;setOverview(data); if(!studentId&&data.selected)setStudentId(data.selected.id); }
    catch(e){if(generation===loadGeneration.current)setError((e as Error).message);}
  },[identity,subject,studentId]);
  React.useEffect(()=>{void load()},[load]);
  React.useEffect(()=>{if(modelError)setError(modelError)},[modelError]);
  React.useEffect(()=>{
    if(!overview)return;
    const params=new URLSearchParams(window.location.search), courseId=params.get('course'), whiteboardId=params.get('whiteboard'), requestedView=params.get('view');
    const course=overview.courses.find(item=>item.id===courseId);
    const whiteboard=overview.whiteboards.find(item=>item.id===whiteboardId);
    if(course){setActive(course);setView('courses');}
    else if(whiteboard)setActiveWhiteboard(whiteboard);
    else if(['home','courses','feed','calendar','materials','history'].includes(requestedView??'')){setView(requestedView as View);setActive(null);}
    if(requestedView==='materials'&&params.get('tab')==='packs')setMaterialsTab('packs');
  },[overview,locationVersion]);
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
  async function ask() {
    if(!prompt.trim()||!identity)return; setBusy(true); setMessages(v=>[...v,{id:crypto.randomUUID(),sender:'user',content:prompt}]);
    try { let id=session; if(!id){const s=await apiRequest<{id:string}>('/ai/assistant/sessions',{method:'POST',body:JSON.stringify({userRole:identity.role==='student'?'student':'parent',studentId:studentId||null,subject,pageContext:'student_home',contextRefType:null,contextRefId:null,contextItemId:null})});id=s.id;setSession(id);} const r=await apiRequest<{messages:Array<{id:string;sender:'user'|'assistant';content:string}>}>(`/ai/assistant/sessions/${id}/messages`,{method:'POST',body:JSON.stringify({message:prompt,modelId,requestKey:crypto.randomUUID()})});setMessages(r.messages);setPrompt(''); }
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function makeWhiteboard() {
    if (!studentId || !prompt.trim()) { setError('请先确认学习档案并输入白板主题'); return; }
    setBusy(true); setError('');
    try { whiteboardRequestKey.current=crypto.randomUUID(); setWhiteboardPreview(await apiRequest<StudioWhiteboard>('/learning/studio/whiteboards/preview', {
      method: 'POST', body: JSON.stringify({ studentId, subject, prompt }) })); }
    catch (caught) { setError((caught as Error).message); } finally { setBusy(false); }
  }
  async function saveWhiteboard() {
    if (!whiteboardPreview) return; setBusy(true);
    try { const saved = await apiRequest<StudioWhiteboard>('/learning/studio/whiteboards', { method: 'POST',
      body: JSON.stringify({ studentId, subject, prompt, fingerprint: whiteboardPreview.fingerprint, requestKey: whiteboardRequestKey.current||(whiteboardRequestKey.current=crypto.randomUUID()) }) });
      whiteboardRequestKey.current=''; setWhiteboardPreview(null); setActiveWhiteboard(saved); await load(); }
    catch (caught) { setError((caught as Error).message); } finally { setBusy(false); }
  }
  function submit(e:React.FormEvent){e.preventDefault();if(mode==='instant'){if(tool==='Whiteboard session'){void makeWhiteboard();return;}if(tool==='Study Planner'){navigate('calendar');setPlannerRequest(value=>value+1);setToolsOpen(false);return;}const atom=overview?.selected?.atoms.find(a=>a.teaching?.visual);if(atom&&tool==='Visualization'){setVisual(atom);}else void ask();}else setShowBuilder(true);}

  if(identity===undefined)return <div className="sa-loading"><Mark/>正在打开学习工作台…</div>;
  if(!identity)return <div className="sa-gate"><Mark/><h1>登录后进入 StudyAgent 学习工作台</h1><Link href="/parent/login">登录 / 创建家长账号</Link><Link href="/">返回学习观察室</Link></div>;
  const courses=overview?.courses??[], feed=overview?.feed??[], activities=overview?.activities??[];
  return <main className="sa-app ws-app" data-view={view}>
    <StudioNavigation context={{ studentId: studentId || undefined, subject }} active={view} onNavigate={navigate} onCreate={()=>setShowBuilder(true)} recent={[
      ...(classroom ? [{title:classroom.course.units.flatMap(unit=>unit.lectures.flatMap(lecture=>lecture.lessons)).find(lesson=>lesson.id===[...classroom.progress].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]?.lessonId)?.title??'社会学想象力',detail:'社会学概论',href:'/studio/classroom?lesson='+([...classroom.progress].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]?.lessonId??'soc-1-1-1')}] : []),
      ...activities.slice(0,3).map(activity=>({title:activity.title,detail:activity.detail,href:activity.href}))]}/>
    <section className="sa-stage"><header className="sa-top"><div><strong>{labels[view]}</strong>{overview?.children.length ? <select aria-label="学习档案" value={studentId} onChange={e=>changeScope(e.target.value,subject)}>{overview?.children.map(c=><option key={c.id} value={c.id}>{c.nickname}</option>)}</select> : <Link href="/parent/dashboard">创建学习档案</Link>}<select aria-label="学科" value={subject} onChange={e=>changeScope(studentId,e.target.value as StudioSubject)}>{subjects.map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></div><div><Link href="/studio/classroom">教学课堂 ↗</Link><Link href="/">学习观察室</Link></div></header>{error&&<div className="sa-error" role="alert">{error}<button onClick={()=>setError('')}>×</button></div>}
      {view==='home'&&<section className="sa-home"><div className="sa-tabs"><button data-active={mode==='craft'} onClick={()=>setMode('craft')}>Craft Courses</button><button data-active={mode==='instant'} onClick={()=>setMode('instant')}>Instant Assistance</button></div><div className="sa-hero"><span>LEARNING STUDIO</span><h1>{mode==='craft'?'把下一步，做成一条走得通的路。':'从一个问题，走进看得见的学习。'}</h1><p>{mode==='craft'?'从已确认学习范围生成课程蓝图，审阅结构和来源后再开始。':'讲解、练习、可视化共享同一份学习证据，生成内容不会替代测量。'}</p></div><form className="sa-composer" onSubmit={submit}><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={3} placeholder={mode==='craft'?'围绕哪段学习内容设计课程？':'问一个概念，或试试可视化解释…'}/><div><span>＋</span><span>资料</span><button type="button" data-tools-trigger onClick={()=>setToolsOpen(!toolsOpen)}>{tool}</button><span>语音</span><span className="sa-spacer"/><XiaojiuModelPicker catalog={modelCatalog} value={modelId} onChange={setModelId} compact disabled={busy}/><button disabled={busy||(mode==='instant'&&!prompt.trim())}>{busy?'…':'↑'}</button></div>{toolsOpen&&<div className="sa-tools-popover" role="menu"><button type="button" onClick={()=>{setTool('Concept Explanation');setToolsOpen(false)}}><b>概念讲解</b><span>从一个问题拆出关系、例子与检查点</span></button><button type="button" onClick={()=>{setTool('Personal Study Materials Generation');setToolsOpen(false)}}><b>个性化学习材料</b><span>围绕当前已确认范围生成讲义与练习</span></button><button type="button" onClick={()=>{setTool('Long-files Digestion');setToolsOpen(false)}}><b>长资料整理</b><span>把课件内容整理成可核对的学习结构</span></button><button type="button" onClick={()=>{setTool('Visualization');setToolsOpen(false)}}><b>可视化讲解</b><span>只使用已审核图形与知识依据</span></button><button type="button" onClick={()=>{setTool('Whiteboard session');setToolsOpen(false)}}><b>Whiteboard session</b><span>把问题转成逐幕动画、旁白和可导出视频</span></button>{identity.role!=='student'&&<button type="button" onClick={()=>{setTool('Study Planner');setToolsOpen(false);navigate('calendar');setPlannerRequest(value=>value+1)}}><b>Study Planner</b><span>创建学习任务并加入日历</span></button>}</div>}</form><div className="sa-prompts"><button onClick={()=>{setMode('instant');setPrompt('用图形解释异分母加法');const a=overview?.selected?.atoms.find(x=>x.teaching?.visual);if(a)setVisual(a);}}><b>可视化</b><span>用图形解释异分母加法</span><small>通分、合并与验算</small></button><button onClick={()=>{setPrompt('从已知点生成练习');setShowBuilder(true);}}><b>个性化练习</b><span>从我的已知点生成练习</span><small>只覆盖已确认范围</small></button><button onClick={()=>navigate('feed')}><b>主动学习</b><span>看看今天最值得做什么</span><small>按教育优先级排序</small></button></div>
        {messages.length>0&&<div className="sa-chat">{messages.map(m=><article key={m.id} data-role={m.sender}><b>{m.sender==='user'?'我':'StudyAgent'}</b><p>{m.content}</p>{m.sender==='assistant'&&m.modelName&&<small>{m.modelName}</small>}</article>)}</div>}{visual?.teaching&&<div className="sa-visual"><h2>{visual.name}</h2><TeachingGuide snapshot={{atomVersion:1,teaching:visual.teaching}}/></div>}
        <div className="sa-section-head"><h2>{active?'从课程继续':'你的学习路径'}</h2><button onClick={()=>setShowBuilder(true)}>创建课程</button></div>
        {courses.length?<div className="sa-cards">{courses.map(c=><button key={c.id} onClick={()=>navigate('courses',c)}><span>{c.grade}年级</span><h3>{c.title}</h3><p>{c.objective}</p><small>{c.units.length} 单元 · {c.focusAtomIds.length} 目标</small></button>)}</div>:<div className="sa-empty"><h3>还没有课程</h3><p>先确认学习范围，再从已学知识生成可审核蓝图。</p><button onClick={()=>setShowBuilder(true)}>生成第一门课程</button></div>}
        <aside className="sa-home-side"><article className="sa-progress-card"><header><div><span className="studio-kicker">LEARNER SNAPSHOT</span><h2>{overview?.selected?.nickname??'学习档案'}</h2></div><b>{overview?.selected?.grade??'—'} 年级</b></header><div className="sa-progress-ring"><strong>{overview?.selected?.estimates.filter(item=>item.status==='secure').length??0}</strong><span>/ {overview?.selected?.estimates.length??0}</span><small>已有点有稳定证据</small></div><div className="sa-snapshot-grid"><span><b>{overview?.selected?.atoms.length??0}</b>已确认知识点</span><span><b>{overview?.integrations.events.length??0}</b>日历安排</span></div></article><article><header><span className="studio-kicker">NEXT BEST ACTION</span><button onClick={()=>navigate('feed')}>全部 →</button></header>{feed.slice(0,2).map(item=><a key={item.id} href={item.href}><b>{item.title}</b><p>{item.reason}</p></a>)}</article><article><header><span className="studio-kicker">RECENT WHITEBOARDS</span><button onClick={()=>setMode('instant')}>新建</button></header>{overview?.whiteboards.length?overview.whiteboards.slice(0,2).map(board=><button key={board.id} onClick={()=>setActiveWhiteboard(board)}><span>▶</span><div><b>{board.title}</b><small>{board.scenes.length} 幕 · {Math.ceil(board.durationMs/1000)} 秒</small></div></button>):<p>还没有白板。输入一个主题并选择 Whiteboard session。</p>}</article><article><header><span className="studio-kicker">SYNC STATUS</span><button onClick={()=>navigate('calendar')}>日历 →</button></header><p>{overview?.integrations.connectors.length??0} 个 LMS / 日历来源 · {overview?.integrations.events.length??0} 个安排</p><small>同步只读取课程日期；学习掌握仍由独立测量形成。</small></article></aside></section>}
      {view==='courses'&&<section className="ws-course-page">{active?<CourseView key={active.id} course={active} back={()=>navigate('courses')}/>:<MyCourses key={studentId+subject} courses={courses} classroom={classroom} studentId={studentId} subject={subject} programmingHref={identity.role==='student'?'/student/gesp':identity.role==='admin'?'/admin/gesp':'/parent/gesp?'+new URLSearchParams({studentId})} onCreate={()=>setShowBuilder(true)} onOpen={course=>navigate('courses',course)}/>}</section>}
      {view==='feed'&&<section className="sa-page"><div className="sa-page-head"><h1>Learning Feed</h1><small>{overview?.day}</small></div>{feed.map((f,i)=><a className="sa-feed" data-primary={i===0} key={f.id} href={f.href}><b>{String(i+1).padStart(2,'0')}</b><div><small>{f.kind}</small><h2>{f.title}</h2><p>{f.reason}</p></div><span>→</span></a>)}</section>}
      {!overview&&view!=='home'&&<p className="ws-loading" role="status">正在加载学习档案…</p>}
      {view==='calendar'&&overview&&<section className="sa-page"><IntegrationCalendar key={studentId+subject} studentId={studentId} subject={subject} value={overview.integrations}
        plans={overview.plans} atoms={overview.selected?.atoms??[]} canManage={identity.role!=='student'} openPlanner={plannerRequest}
        onChanged={load} onError={setError} onOpenWhiteboard={setActiveWhiteboard}/></section>}
      {view==='history'&&<section className="sa-page"><div className="sa-page-head"><h1>学习历史</h1></div>{!activities.length&&<div className="ws-empty"><h2>还没有学习活动</h2><p>从课程开始，学习与练习记录会保存在这里。</p><Link href="/studio?view=courses">查看我的课程 →</Link></div>}{activities.map(a=><a className="sa-history" key={a.id} href={a.href}><time>{new Date(a.at).toLocaleString('zh-CN')}</time><div><h2>{a.title}</h2><p>{a.detail}</p></div></a>)}</section>}
      {view==='materials'&&overview&&!overview.selected&&<div className="ws-empty"><h2>把资料加入学习档案</h2><p>先创建学习档案，再上传PDF、恢复表格公式，生成学习讲义与练习。</p><Link href="/parent/dashboard">创建学习档案 →</Link></div>}
      {view==='materials'&&overview?.selected&&<section className="sa-page sa-materials-page"><div className="sa-material-tabs" role="tablist">
        <button role="tab" aria-selected={materialsTab==='files'} data-active={materialsTab==='files'} onClick={()=>setMaterialsTab('files')}>PDF 页级资料</button>
        <button role="tab" aria-selected={materialsTab==='packs'} data-active={materialsTab==='packs'} onClick={()=>setMaterialsTab('packs')}>个性化学案</button>
      </div>{materialsTab==='files'?<PdfMaterialLab studentId={studentId} subject={subject} materials={overview.materials} atoms={overview.selected.atoms}
        onChanged={load} onOpenWhiteboard={setActiveWhiteboard} onError={setError}/>:<LearningPackStudio studentId={studentId} subject={subject}
        atoms={overview.selected.atoms} estimates={overview.selected.estimates} materials={overview.materials} packs={overview.studyPacks}
        onChanged={load} onError={setError}/>}</section>}
    </section>
    {showBuilder&&<CourseBuilder key={studentId+subject} studentId={studentId} subject={subject} selected={overview?.selected??null} initialTitle={prompt} onClose={()=>setShowBuilder(false)} onRefresh={load} onCreated={course=>{setShowBuilder(false);navigate('courses',course);void load();}}/>}
    {activeWhiteboard&&<WhiteboardPlayer whiteboard={activeWhiteboard} narrationAvailable={overview?.narrationAvailable} speech={overview?.speech} onClose={()=>setActiveWhiteboard(null)}/>}
    {whiteboardPreview&&<div className="sa-whiteboard-preview-modal"><button className="sa-scrim" onClick={()=>setWhiteboardPreview(null)}/><section><header><div><span className="studio-kicker">WHITEBOARD SESSION</span><h2>{whiteboardPreview.title}</h2></div><button aria-label="关闭预览" onClick={()=>setWhiteboardPreview(null)}>×</button></header><WhiteboardScenePreview scene={whiteboardPreview.scenes[0]} /><div className="sa-whiteboard-preview-copy"><strong>{whiteboardPreview.scenes.length} 幕 · {Math.ceil(whiteboardPreview.durationMs/1000)} 秒</strong><p>即时播放使用设备中文语音；配置 TTS 时导出带 AI 音轨的 1280×720 WebM，并始终烧入旁白字幕。SRT 可单独保存。</p></div><footer><button onClick={()=>setActiveWhiteboard(whiteboardPreview)}>播放预览</button><button disabled={busy} onClick={()=>void saveWhiteboard()}>{busy?'正在保存…':'保存到学习工作台'}</button></footer></section></div>}
  </main>;
}

function CourseView({course,back}:{course:StudioCourse;back:()=>void}) {
  const [tab,setTab]=React.useState<'outline'|'materials'|'practices'>('outline');
  const [librarySearch,setLibrarySearch]=React.useState('');
  const [unitId,setUnitId]=React.useState(course.units[0]?.id??'');
  React.useEffect(()=>{const restore=()=>{setLibrarySearch(window.location.search);const params=new URLSearchParams(window.location.search),id=params.get('unit'),panel=params.get('panel');if(course.units.some(unit=>unit.id===id))setUnitId(id!);setTab(panel==='materials'||panel==='practices'?panel:'outline');};restore();window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);},[course]);
  function select(unit:string,panel:typeof tab) {setUnitId(unit);setTab(panel);const url=new URL(window.location.href);url.searchParams.set('unit',unit);url.searchParams.set('panel',panel);window.history.replaceState(null,'',url.pathname+url.search);}
  const unit=course.units.find(item=>item.id===unitId)??course.units[0];
  const viewed=new Set(course.learningProgress?.viewedLessonIds??[]),started=new Set(course.learningProgress?.startedLessonIds??[]);
  function href(lesson:StudioCourse['units'][number]['lessons'][number]) { return lesson.kind==='learn'&&lesson.teaching?.teaching.reviewStatus==='approved'
    ? '/studio/classroom?'+copyCourseFilters(librarySearch,new URLSearchParams({studioCourseId:course.id,lesson:lesson.id,returnUnit:unitId,returnPanel:tab,returnStudent:course.studentId,returnSubject:course.subject})) : lesson.href; }
  return <div className="ws-student-course cl-course-layout"><aside className="cl-course-sidebar"><button className="cl-exit-course" onClick={back}>× <span>退出课程</span></button>
    <CourseCover/><div className="cl-curator"><span>S</span><div><small>策划自</small><b>StudyAgent Learning Studio</b></div></div><h1>{course.title}</h1><p>{course.description}</p><details><summary>显示更多</summary><p>{course.objective}</p><p>{course.textbookVersion} · {course.grade}年级</p></details>
    <div className="cl-panel-label">面板</div><div className="cl-course-tabs" role="tablist" aria-label="课程面板">{(['outline','materials','practices'] as const).map((value,index)=><button role="tab" key={value} aria-selected={tab===value} onClick={()=>select(unitId,value)}>{['单元','资料','练习'][index]}</button>)}</div>
    <nav className="cl-unit-nav" aria-label="课程单元">{course.units.map((item,index)=><button key={item.id} data-active={item.id===unitId} onClick={()=>select(item.id,tab)}><b>{index+1}</b>{item.title.replace(/^Unit \d+: /,'')}</button>)}</nav>
  </aside><section className="cl-outline"><header className="cl-unit-heading"><small>第 {course.units.indexOf(unit)+1} 单元，共 {course.units.length} 单元</small><h2>{unit?.title}</h2><p>{unit?.objective}</p></header>
    <Link className="cl-extend" href="/studio?view=materials"><span>▤</span><div><b>上传材料，扩展这门课程</b><small>阅读PDF、核对结构并生成学案</small></div><span>↗</span></Link>
    {course.pace&&<details className="ws-course-pace"><summary>每次约 {course.pace.minutesPerSession} 分钟 · {course.pace.sessions.length} 个建议时段</summary><p>{course.pace.notice}</p><ol>{course.pace.sessions.map((session,index)=><li key={session.id}><b>第 {index+1} 次 · 约 {session.minutes} 分钟</b><div>{session.activities.map(activity=>{const target=course.units.flatMap(unit=>unit.lessons).find(lesson=>lesson.id===activity.lessonId);return target&&<Link key={activity.lessonId+':'+activity.part} href={href(target)}>{activity.title}{activity.parts>1&&`（${activity.part}/${activity.parts}）`} →</Link>;})}</div></li>)}</ol></details>}
    <div className="cl-legend"><span><i className="cl-ring" data-state="viewed"/>讲解已读</span><span><i className="cl-ring" data-state="started"/>已接触</span><span><i className="cl-ring"/>未开始</span></div>
    {tab==='materials'?<div className="cl-card"><h2>课程资料</h2>{course.materials.map(item=><article key={item.id}><h3>{item.title}</h3><p>{item.detail}</p><small>{item.status==='available'?'已绑定来源':'等待核对'}</small></article>)}<Link href="/studio?view=materials">打开我的资料与学案 →</Link></div>:
      <div className="cl-timeline"><article className="cl-lecture"><span className="cl-timeline-icon">▧</span><header><strong>{tab==='practices'?'独立练习':'本单元讲座'}</strong></header><p>{unit?.objective}</p><div className="cl-microlessons">{unit?.lessons.filter(lesson=>tab==='practices'?lesson.kind==='practice':lesson.kind==='learn').map(lesson=>{
        const practice=unit.lessons.find(item=>item.atomId===lesson.atomId&&item.kind==='practice');
        return <div className="cl-micro" key={lesson.id}><span>{lesson.title}</span>{tab==='practices'?<Link className="cl-practice" href={href(lesson)}>独立验证 →</Link>:<><Link className="cl-learn" href={href(lesson)}>{started.has(lesson.id)?'▶ 继续学习':'▶ 学习'}</Link>{practice&&<Link className="cl-practice" href={href(practice)}>练习</Link>}</>}<i className="cl-ring" data-state={viewed.has(lesson.id)?'viewed':started.has(lesson.id)?'started':'new'}/></div>;
      })}</div></article>{unit?.lessons.filter(item=>item.kind==='project'||item.kind==='exam').map(item=><article className="cl-lecture" key={item.id}><span className="cl-timeline-icon">{item.kind==='project'?'▣':'♙'}</span><h3>{item.title}</h3><p>{item.objective}</p><Link className="ws-open-activity" href={href(item)}>打开{item.kind==='project'?'项目':'独立核查'} →</Link></article>)}</div>}
    <p className="ws-evidence-footnote">阅读进度只表示讲解已读。知识掌握由独立题目、迁移和延迟复测核查。</p>
  </section></div>;
}

'use client';
import * as React from 'react';
import Link from 'next/link';
import type { StudioCourse, StudioCoursePreview, StudioOverview, StudioSubject, StudioWhiteboard } from '@study-agent/contracts';
import { apiRequest } from '../../lib/api';
import { useSessionUser } from '../../lib/session-user';
import { TeachingGuide } from '../../components/teaching-guide';
import { WhiteboardPlayer, WhiteboardScenePreview } from './whiteboard-player';
import { IntegrationCalendar } from './integration-calendar';
import './studio.css';

type View = 'home' | 'courses' | 'feed' | 'calendar' | 'history' | 'marketplace';
type Mode = 'craft' | 'instant';
const subjects: Array<[StudioSubject, string]> = [['math','数学'],['chinese','语文'],['english','英语']];
const labels: Record<View, string> = { home:'Home', courses:'Courses', feed:'Learning Feed', calendar:'Calendar', history:'History', marketplace:'Marketplace' };

function Icon({ children }: { children: React.ReactNode }) { return <span className="sa-icon">{children}</span>; }
function Mark() { return <span className="sa-mark">S</span>; }

export function LearningStudio() {
  const identity = useSessionUser();
  const [view,setView] = React.useState<View>('home'), [mode,setMode] = React.useState<Mode>('craft');
  const [subject,setSubject] = React.useState<StudioSubject>('math'), [studentId,setStudentId] = React.useState('');
  const [overview,setOverview] = React.useState<StudioOverview|null>(null), [active,setActive] = React.useState<StudioCourse|null>(null);
  const [prompt,setPrompt] = React.useState(''), [busy,setBusy] = React.useState(false), [error,setError] = React.useState('');
  const [tool,setTool] = React.useState('Concept Explanation'), [toolsOpen,setToolsOpen] = React.useState(false);
  const [showBuilder,setShowBuilder] = React.useState(false), [preview,setPreview] = React.useState<StudioCoursePreview|null>(null);
  const [messages,setMessages] = React.useState<Array<{id:string;sender:string;content:string}>>([]), [session,setSession] = React.useState('');
  const [visual,setVisual] = React.useState<StudioOverview['selected'] extends infer T ? T extends {atoms:Array<infer A>} ? A|null : never : never>(null);
  const [whiteboardPreview,setWhiteboardPreview] = React.useState<StudioWhiteboard|null>(null);
  const [activeWhiteboard,setActiveWhiteboard] = React.useState<StudioWhiteboard|null>(null);
  const whiteboardRequestKey = React.useRef('');
  const [railCollapsed,setRailCollapsed] = React.useState(false);
  const [plannerRequest,setPlannerRequest] = React.useState(0);
  const deepLinkApplied = React.useRef(false);

  const load = React.useCallback(async () => {
    if (!identity) return;
    try { const q=new URLSearchParams({subject}); if(studentId)q.set('studentId',studentId); const data=await apiRequest<StudioOverview>(`/learning/studio/overview?${q}`); setOverview(data); if(!studentId&&data.selected)setStudentId(data.selected.id); }
    catch(e){setError((e as Error).message);}
  },[identity,subject,studentId]);
  React.useEffect(()=>{void load()},[load]);
  React.useEffect(()=>{
    if(!overview||deepLinkApplied.current)return;
    deepLinkApplied.current=true;
    const params=new URLSearchParams(window.location.search), courseId=params.get('course'), whiteboardId=params.get('whiteboard');
    const course=[...overview.courses,...(active?[active]:[])].find(item=>item.id===courseId);
    const whiteboard=overview.whiteboards.find(item=>item.id===whiteboardId);
    if(course){setActive(course);setView('courses');}
    else if(whiteboard)setActiveWhiteboard(whiteboard);
  },[overview,active]);
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
    try { let id=session; if(!id){const s=await apiRequest<{id:string}>('/ai/assistant/sessions',{method:'POST',body:JSON.stringify({userRole:identity.role==='student'?'student':'parent',studentId:studentId||null,subject,pageContext:'student_home',contextRefType:null,contextRefId:null,contextItemId:null})});id=s.id;setSession(id);} const r=await apiRequest<{messages:Array<{id:string;sender:'user'|'assistant';content:string}>}>(`/ai/assistant/sessions/${id}/messages`,{method:'POST',body:JSON.stringify({message:prompt,requestKey:crypto.randomUUID()})});setMessages(r.messages);setPrompt(''); }
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
  async function makePreview() { setBusy(true); try{setPreview(await apiRequest<StudioCoursePreview>('/learning/studio/courses/preview',{method:'POST',body:JSON.stringify({studentId,subject,focusAtomIds:overview?.selected?.atoms.map(a=>a.id),title:prompt||undefined})}));}catch(e){setError((e as Error).message);}finally{setBusy(false);} }
  async function makeCourse() { if(!preview)return; setBusy(true); try{const c=await apiRequest<StudioCourse>('/learning/studio/courses',{method:'POST',body:JSON.stringify({studentId,subject,focusAtomIds:preview.focusAtomIds,title:preview.title,objective:preview.objective,previewFingerprint:preview.fingerprint,requestKey:crypto.randomUUID()})});setShowBuilder(false);setPreview(null);setActive(c);setView('courses');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);} }
  function submit(e:React.FormEvent){e.preventDefault();if(mode==='instant'){if(tool==='Whiteboard session'){void makeWhiteboard();return;}if(tool==='Study Planner'){setView('calendar');setPlannerRequest(value=>value+1);setToolsOpen(false);return;}const atom=overview?.selected?.atoms.find(a=>a.teaching?.visual);if(atom&&tool==='Visualization'){setVisual(atom);}else void ask();}else setShowBuilder(true);}

  if(identity===undefined)return <div className="sa-loading"><Mark/>正在打开学习工作台…</div>;
  if(!identity)return <div className="sa-gate"><Mark/><h1>登录后进入 StudyAgent 学习工作台</h1><Link href="/parent/login">登录 / 创建家长账号</Link><Link href="/">返回学习观察室</Link></div>;
  const courses=overview?.courses??[], feed=overview?.feed??[], activities=overview?.activities??[];
  return <main className="sa-app" data-rail={railCollapsed?'collapsed':'expanded'}>
    <aside className="sa-rail"><div className="sa-rail-head"><Link href="/" className="sa-logo" aria-label="返回学习观察室"><Mark/></Link><button className="sa-rail-toggle" aria-label="折叠导航" onClick={()=>setRailCollapsed(!railCollapsed)}>«</button></div><nav>{([['home','Home','⌂'],['courses','Courses','◇'],['feed','Learning Feed','↗'],['calendar','Calendar','▦'],['history','History','◷'],['marketplace','Marketplace','▣']] as const).map(([key,label,glyph])=><button key={key} data-active={view===key} data-label={label} aria-label={label} title={label} onClick={()=>{setView(key);setActive(null);}}><span className="sa-nav-glyph">{glyph}</span><span className="sa-nav-label">{label}</span></button>)}</nav><button className="sa-new" data-label="创建课程" aria-label="创建课程" title="创建课程" onClick={()=>setShowBuilder(true)}>＋<span>创建课程</span></button><div className="sa-recent"><span className="studio-kicker">RECENT</span><b>{activities[0]?.title??'还没有活动'}</b><small>{activities[0]?new Date(activities[0].at).toLocaleDateString('zh-CN'):'从今天开始'}</small></div><div className="sa-rail-foot"><span className="sa-avatar">S</span><div><b>证据化学习</b><small>StudyAgent</small></div></div></aside>
    <section className="sa-stage"><header className="sa-top"><div><strong>{labels[view]}</strong><select value={studentId} onChange={e=>setStudentId(e.target.value)}>{overview?.children.map(c=><option key={c.id} value={c.id}>{c.nickname}</option>)}</select><select value={subject} onChange={e=>setSubject(e.target.value as StudioSubject)}>{subjects.map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></div><Link href="/">学习观察室</Link></header>{error&&<div className="sa-error">{error}<button onClick={()=>setError('')}>×</button></div>}
      {view==='home'&&<section className="sa-home"><div className="sa-tabs"><button data-active={mode==='craft'} onClick={()=>setMode('craft')}>Craft Courses</button><button data-active={mode==='instant'} onClick={()=>setMode('instant')}>Instant Assistance</button></div><div className="sa-hero"><span>LEARNING STUDIO</span><h1>{mode==='craft'?'把下一步，做成一条走得通的路。':'从一个问题，走进看得见的学习。'}</h1><p>{mode==='craft'?'从已确认学习范围生成课程蓝图，审阅结构和来源后再开始。':'讲解、练习、可视化共享同一份学习证据，生成内容不会替代测量。'}</p></div><form className="sa-composer" onSubmit={submit}><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={3} placeholder={mode==='craft'?'围绕哪段学习内容设计课程？':'问一个概念，或试试可视化解释…'}/><div><span>＋</span><span>资料</span><button type="button" data-tools-trigger onClick={()=>setToolsOpen(!toolsOpen)}>{tool}</button><span>语音</span><span className="sa-spacer"/><span>Normal</span><button disabled={busy||(mode==='instant'&&!prompt.trim())}>{busy?'…':'↑'}</button></div></form>{toolsOpen&&<div className="sa-tools-popover" role="menu"><button type="button" onClick={()=>{setTool('Concept Explanation');setToolsOpen(false)}}><b>概念讲解</b><span>从一个问题拆出关系、例子与检查点</span></button><button type="button" onClick={()=>{setTool('Personal Study Materials Generation');setToolsOpen(false)}}><b>个性化学习材料</b><span>围绕当前已确认范围生成讲义与练习</span></button><button type="button" onClick={()=>{setTool('Long-files Digestion');setToolsOpen(false)}}><b>长资料整理</b><span>把课件内容整理成可核对的学习结构</span></button><button type="button" onClick={()=>{setTool('Visualization');setToolsOpen(false)}}><b>可视化讲解</b><span>只使用已审核图形与知识依据</span></button><button type="button" onClick={()=>{setTool('Whiteboard session');setToolsOpen(false)}}><b>Whiteboard session</b><span>把问题转成逐幕动画、旁白和可导出视频</span></button>{identity.role!=='student'&&<button type="button" onClick={()=>{setTool('Study Planner');setToolsOpen(false);setView('calendar');setPlannerRequest(value=>value+1)}}><b>Study Planner</b><span>创建学习任务并加入日历</span></button>}</div>}<div className="sa-prompts"><button onClick={()=>{setMode('instant');setPrompt('用图形解释异分母加法');const a=overview?.selected?.atoms.find(x=>x.teaching?.visual);if(a)setVisual(a);}}><b>可视化</b><span>用图形解释异分母加法</span><small>通分、合并与验算</small></button><button onClick={()=>{setPrompt('从已知点生成练习');setShowBuilder(true);}}><b>个性化练习</b><span>从我的已知点生成练习</span><small>只覆盖已确认范围</small></button><button onClick={()=>setView('feed')}><b>主动学习</b><span>看看今天最值得做什么</span><small>按教育优先级排序</small></button></div>
        {messages.length>0&&<div className="sa-chat">{messages.map(m=><article key={m.id} data-role={m.sender}><b>{m.sender==='user'?'我':'StudyAgent'}</b><p>{m.content}</p></article>)}</div>}{visual?.teaching&&<div className="sa-visual"><h2>{visual.name}</h2><TeachingGuide snapshot={{atomVersion:1,teaching:visual.teaching}}/></div>}
        <div className="sa-section-head"><h2>{active?'从课程继续':'你的学习路径'}</h2><button onClick={()=>setShowBuilder(true)}>创建课程</button></div>
        {courses.length?<div className="sa-cards">{courses.map(c=><button key={c.id} onClick={()=>{setActive(c);setView('courses')}}><span>{c.grade}年级</span><h3>{c.title}</h3><p>{c.objective}</p><small>{c.units.length} 单元 · {c.focusAtomIds.length} 目标</small></button>)}</div>:<div className="sa-empty"><h3>还没有课程</h3><p>先确认学习范围，再从已学知识生成可审核蓝图。</p><button onClick={()=>setShowBuilder(true)}>生成第一门课程</button></div>}
        <aside className="sa-home-side"><article className="sa-progress-card"><header><div><span className="studio-kicker">LEARNER SNAPSHOT</span><h2>{overview?.selected?.nickname??'学习档案'}</h2></div><b>{overview?.selected?.grade??'—'} 年级</b></header><div className="sa-progress-ring"><strong>{overview?.selected?.estimates.filter(item=>item.status==='secure').length??0}</strong><span>/ {overview?.selected?.estimates.length??0}</span><small>已有点有稳定证据</small></div><div className="sa-snapshot-grid"><span><b>{overview?.selected?.atoms.length??0}</b>已确认知识点</span><span><b>{overview?.integrations.events.length??0}</b>日历安排</span></div></article><article><header><span className="studio-kicker">NEXT BEST ACTION</span><button onClick={()=>setView('feed')}>全部 →</button></header>{feed.slice(0,2).map(item=><a key={item.id} href={item.href}><b>{item.title}</b><p>{item.reason}</p></a>)}</article><article><header><span className="studio-kicker">RECENT WHITEBOARDS</span><button onClick={()=>setMode('instant')}>新建</button></header>{overview?.whiteboards.length?overview.whiteboards.slice(0,2).map(board=><button key={board.id} onClick={()=>setActiveWhiteboard(board)}><span>▶</span><div><b>{board.title}</b><small>{board.scenes.length} 幕 · {Math.ceil(board.durationMs/1000)} 秒</small></div></button>):<p>还没有白板。输入一个主题并选择 Whiteboard session。</p>}</article><article><header><span className="studio-kicker">SYNC STATUS</span><button onClick={()=>setView('calendar')}>日历 →</button></header><p>{overview?.integrations.connectors.length??0} 个 LMS / 日历来源 · {overview?.integrations.events.length??0} 个安排</p><small>同步只读取课程日期；学习掌握仍由独立测量形成。</small></article></aside></section>}
      {view==='courses'&&<section className="sa-page">{active?<CourseView course={active} back={()=>setActive(null)}/>:<><div className="sa-page-head"><h1>Courses</h1><button onClick={()=>setShowBuilder(true)}>＋ 创建课程</button></div><div className="sa-cards">{courses.map(c=><button key={c.id} onClick={()=>setActive(c)}><span>{c.grade}年级</span><h3>{c.title}</h3><p>{c.objective}</p><small>{c.units.length} 单元</small></button>)}</div></>}</section>}
      {view==='feed'&&<section className="sa-page"><div className="sa-page-head"><h1>Learning Feed</h1><small>{overview?.day}</small></div>{feed.map((f,i)=><a className="sa-feed" data-primary={i===0} key={f.id} href={f.href}><b>{String(i+1).padStart(2,'0')}</b><div><small>{f.kind}</small><h2>{f.title}</h2><p>{f.reason}</p></div><span>→</span></a>)}</section>}
      {view==='calendar'&&overview&&<section className="sa-page"><IntegrationCalendar studentId={studentId} subject={subject} value={overview.integrations} canManage={identity.role!=='student'} openPlanner={plannerRequest} onChanged={load} onError={setError}/></section>}
      {view==='history'&&<section className="sa-page"><div className="sa-page-head"><h1>History</h1></div>{activities.map(a=><a className="sa-history" key={a.id} href={a.href}><time>{new Date(a.at).toLocaleString('zh-CN')}</time><div><h2>{a.title}</h2><p>{a.detail}</p></div></a>)}</section>}
      {view==='marketplace'&&<section className="sa-page"><div className="sa-page-head"><h1>Study Collections</h1><p>原创知识结构与测量框架，不复制第三方课程。</p></div><div className="sa-cards">{subjects.map(([key,name],i)=><button key={key} onClick={()=>{setSubject(key);setShowBuilder(true)}}><span>0{i+1}</span><h3>{name}学习包</h3><p>从能力关系、练习与复测组成。</p></button>)}</div></section>}
    </section>
    {showBuilder&&<div className="sa-modal"><button className="sa-scrim" onClick={()=>{setShowBuilder(false);setPreview(null)}}/><section><header><h2>{preview?'审阅课程蓝图':'生成课程蓝图'}</h2><button onClick={()=>{setShowBuilder(false);setPreview(null)}}>×</button></header>{preview?<><p>{preview.title}</p><dl><dt>单元</dt><dd>{preview.units.length}</dd><dt>活动</dt><dd>{preview.units.reduce((n,u)=>n+u.lessons.length,0)}</dd></dl><div className="sa-unit-preview">{preview.units.map(u=><article key={u.id}><h3>{u.title}</h3><p>{u.objective}</p></article>)}</div><button disabled={busy} onClick={()=>void makeCourse()}>确认并创建</button></>:<><input value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="课程名称或学习目标"/><p>将使用当前学生已确认范围内的 {overview?.selected?.atoms.length??0} 个知识点。</p><button disabled={busy||!overview?.selected?.atoms.length} onClick={()=>void makePreview()}>预览课程蓝图</button></>}</section></div>}
    {activeWhiteboard&&<WhiteboardPlayer whiteboard={activeWhiteboard} narrationAvailable={overview?.narrationAvailable} speech={overview?.speech} onClose={()=>setActiveWhiteboard(null)}/>}
    {whiteboardPreview&&<div className="sa-whiteboard-preview-modal"><button className="sa-scrim" onClick={()=>setWhiteboardPreview(null)}/><section><header><div><span className="studio-kicker">WHITEBOARD SESSION</span><h2>{whiteboardPreview.title}</h2></div><button aria-label="关闭预览" onClick={()=>setWhiteboardPreview(null)}>×</button></header><WhiteboardScenePreview scene={whiteboardPreview.scenes[0]} /><div className="sa-whiteboard-preview-copy"><strong>{whiteboardPreview.scenes.length} 幕 · {Math.ceil(whiteboardPreview.durationMs/1000)} 秒</strong><p>即时播放使用设备中文语音；配置 TTS 时导出带 AI 音轨的 1280×720 WebM，并始终烧入旁白字幕。SRT 可单独保存。</p></div><footer><button onClick={()=>setActiveWhiteboard(whiteboardPreview)}>播放预览</button><button disabled={busy} onClick={()=>void saveWhiteboard()}>{busy?'正在保存…':'保存到学习工作台'}</button></footer></section></div>}
  </main>;
}

function CourseView({course,back}:{course:StudioCourse;back:()=>void}) {
  const [tab,setTab]=React.useState<'outline'|'materials'|'practices'>('outline');
  const lessons=course.units.flatMap(unit=>unit.lessons);
  const [lessonId,setLessonId]=React.useState(lessons[0]?.id??'');
  const [unitId,setUnitId]=React.useState(course.units[0]?.id??'');
  const lesson=lessons.find(item=>item.id===lessonId)??lessons[0];
  const unit=course.units.find(item=>item.id===unitId)??course.units.find(item=>item.lessons.some(row=>row.id===lesson?.id))??course.units[0];
  const practices=lessons.filter(item=>item.kind==='practice'||item.kind==='exam');
  const labels={learn:'学习',practice:'练习',project:'项目',exam:'单元考试'} as const;
  const states={not_started:'未开始',attempted:'已尝试',familiar:'初步熟悉',proficient:'稳定迁移',mastered:'多时点掌握'} as const;
  function choose(next:StudioCourse['units'][number]['lessons'][number]) { setLessonId(next.id); const owner=course.units.find(item=>item.lessons.some(row=>row.id===next.id)); if(owner)setUnitId(owner.id); }
  return <div className="sa-course-detail">
    <div className="sa-course-topline"><button onClick={back}>← Courses</button><span>{course.grade} 年级 · {course.term==='upper'?'上学期':'下学期'} · {course.focusAtomIds.length} 个知识目标</span></div>
    <div className="sa-course-workspace">
      <aside className="sa-course-overview">
        <div className="sa-curator"><Mark/><div><span>curated by</span><b>StudyAgent Evidence Office</b></div></div>
        <h1>{course.title}</h1>
        <p>{course.description}</p>
        <details><summary>课程依据</summary><p>{course.objective}。课程只引用已确认范围内发布的知识点，完成活动不会自动写成掌握。</p></details>
        <a className="sa-course-join" href={lesson?.href??'#'}>继续学习</a>
        <span className="sa-panel-label">PANEL</span>
        <div className="sa-course-tabs">
          <button data-active={tab==='outline'} onClick={()=>setTab('outline')}>☷ Units</button>
          <button data-active={tab==='materials'} onClick={()=>setTab('materials')}>▤ Materials</button>
          <button data-active={tab==='practices'} onClick={()=>setTab('practices')}>✎ Practices</button>
        </div>
        <div className="sa-course-list">
          {tab==='outline'&&course.units.map(item=><section key={item.id}><button data-active={item.id===unitId} onClick={()=>{setUnitId(item.id);if(item.lessons[0])setLessonId(item.lessons[0].id)}}><span>Unit {course.units.indexOf(item)+1}</span><b>{item.title}</b><small>{item.lessons.length} 个活动 · 4–8 分钟</small></button></section>)}
          {tab==='materials'&&course.materials.map(item=><article key={item.id}><span>▤</span><div><b>{item.title}</b><small>{item.status==='available'?'可用材料':'等待教研核对'}</small></div></article>)}
          {tab==='practices'&&practices.map(item=><button key={item.id} data-active={item.id===lessonId} onClick={()=>choose(item)}><span>✎ {labels[item.kind]}</span><b>{item.title}</b><small>{states[item.state]}</small></button>)}
        </div>
      </aside>
      <main className="sa-course-outline">
        <span className="studio-kicker">UNIT {course.units.indexOf(unit)+1}</span>
        <h2>{unit?.title??'课程单元'}</h2>
        <p>{unit?.objective}</p>
        <div className="sa-course-section-head"><strong>{tab==='materials'?'课程材料':tab==='practices'?'练习与考试':'本单元路径'}</strong><small>{tab==='outline'?unit?.lessons.length:tab==='practices'?practices.length:course.materials.length} ITEMS</small></div>
        {tab==='outline'&&unit?.lessons.map((item,index)=><button key={item.id} className="sa-lesson-row" data-active={item.id===lessonId} onClick={()=>choose(item)}><span className="sa-lesson-index">{String(index+1).padStart(2,'0')}</span><i data-kind={item.kind}>{item.kind==='practice'?'✎':item.kind==='exam'?'◎':'↗'}</i><div><b>{item.title}</b><small>{labels[item.kind]} · {states[item.state]}</small><p>{item.objective}</p></div><span>→</span></button>)}
        {tab==='practices'&&practices.map(item=><button key={item.id} className="sa-lesson-row" data-active={item.id===lessonId} onClick={()=>choose(item)}><i data-kind={item.kind}>✎</i><div><b>{item.title}</b><small>{labels[item.kind]} · {states[item.state]}</small><p>{item.objective}</p></div><span>→</span></button>)}
        {tab==='materials'&&course.materials.map(item=><article className="sa-material-row" key={item.id}><span>▤</span><div><b>{item.title}</b><p>{item.detail}</p><small>{item.status==='available'?'已绑定来源':'需要教研补充和审核'}</small></div><em data-status={item.status}>{item.status==='available'?'可用':'待核对'}</em></article>)}
      </main>
      <aside className="sa-course-inspector">
        <span className="studio-kicker">{lesson?labels[lesson.kind]:'COURSE'}</span>
        <h2>{lesson?.title??unit?.title}</h2>
        <p>{lesson?.objective??unit?.objective}</p>
        <div className="sa-evidence-note"><b>学习证据边界</b><p>活动开始和观看完成只表示接触过内容。掌握状态来自独立题组、提示记录和延迟复测。</p></div>
        {lesson?.atomId&&<dl><dt>知识点</dt><dd>{lesson.atomId}</dd><dt>课程版本</dt><dd>{course.textbookVersion}</dd><dt>范围版本</dt><dd>v{course.scopeVersion}</dd></dl>}
        <a href={lesson?.href??'#'}>打开当前活动 →</a>
        <div className="sa-progress-legend"><b>进度图例</b>{Object.entries(states).map(([key,label])=><span key={key} data-state={key}><i/> {label}</span>)}</div>
      </aside>
    </div>
  </div>;
}

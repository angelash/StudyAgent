'use client';
import * as React from 'react';
import Link from 'next/link';
import type { StudioCourse, StudioCoursePreview, StudioOverview, StudioSubject } from '@study-agent/contracts';
import { apiRequest } from '../../lib/api';
import { useSessionUser } from '../../lib/session-user';
import { TeachingGuide } from '../../components/teaching-guide';
import './studio.css';

type View = 'home' | 'courses' | 'feed' | 'history' | 'marketplace';
type Mode = 'craft' | 'instant';
const subjects: Array<[StudioSubject, string]> = [['math','数学'],['chinese','语文'],['english','英语']];
const labels: Record<View, string> = { home:'Home', courses:'Courses', feed:'Learning Feed', history:'History', marketplace:'Marketplace' };

function Icon({ children }: { children: React.ReactNode }) { return <span className="sa-icon">{children}</span>; }
function Mark() { return <span className="sa-mark">S</span>; }

export function LearningStudio() {
  const identity = useSessionUser();
  const [view,setView] = React.useState<View>('home'), [mode,setMode] = React.useState<Mode>('craft');
  const [subject,setSubject] = React.useState<StudioSubject>('math'), [studentId,setStudentId] = React.useState('');
  const [overview,setOverview] = React.useState<StudioOverview|null>(null), [active,setActive] = React.useState<StudioCourse|null>(null);
  const [prompt,setPrompt] = React.useState(''), [busy,setBusy] = React.useState(false), [error,setError] = React.useState('');
  const [showBuilder,setShowBuilder] = React.useState(false), [preview,setPreview] = React.useState<StudioCoursePreview|null>(null);
  const [messages,setMessages] = React.useState<Array<{id:string;sender:string;content:string}>>([]), [session,setSession] = React.useState('');
  const [visual,setVisual] = React.useState<StudioOverview['selected'] extends infer T ? T extends {atoms:Array<infer A>} ? A|null : never : never>(null);

  const load = React.useCallback(async () => {
    if (!identity) return;
    try { const q=new URLSearchParams({subject}); if(studentId)q.set('studentId',studentId); const data=await apiRequest<StudioOverview>(`/learning/studio/overview?${q}`); setOverview(data); if(!studentId&&data.selected)setStudentId(data.selected.id); }
    catch(e){setError((e as Error).message);}
  },[identity,subject,studentId]);
  React.useEffect(()=>{void load()},[load]);
  async function ask() {
    if(!prompt.trim()||!identity)return; setBusy(true); setMessages(v=>[...v,{id:crypto.randomUUID(),sender:'user',content:prompt}]);
    try { let id=session; if(!id){const s=await apiRequest<{id:string}>('/ai/assistant/sessions',{method:'POST',body:JSON.stringify({userRole:identity.role==='student'?'student':'parent',studentId:studentId||null,subject,pageContext:'student_home',contextRefType:null,contextRefId:null,contextItemId:null})});id=s.id;setSession(id);} const r=await apiRequest<{messages:Array<{id:string;sender:'user'|'assistant';content:string}>}>(`/ai/assistant/sessions/${id}/messages`,{method:'POST',body:JSON.stringify({message:prompt,requestKey:crypto.randomUUID()})});setMessages(r.messages);setPrompt(''); }
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function makePreview() { setBusy(true); try{setPreview(await apiRequest<StudioCoursePreview>('/learning/studio/courses/preview',{method:'POST',body:JSON.stringify({studentId,subject,focusAtomIds:overview?.selected?.atoms.map(a=>a.id),title:prompt||undefined})}));}catch(e){setError((e as Error).message);}finally{setBusy(false);} }
  async function makeCourse() { if(!preview)return; setBusy(true); try{const c=await apiRequest<StudioCourse>('/learning/studio/courses',{method:'POST',body:JSON.stringify({studentId,subject,focusAtomIds:preview.focusAtomIds,title:preview.title,objective:preview.objective,previewFingerprint:preview.fingerprint,requestKey:crypto.randomUUID()})});setShowBuilder(false);setPreview(null);setActive(c);setView('courses');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);} }
  function submit(e:React.FormEvent){e.preventDefault();if(mode==='instant'){const atom=overview?.selected?.atoms.find(a=>a.teaching?.visual);if(atom){setVisual(atom);}else void ask();}else{setShowBuilder(true);} }

  if(identity===undefined)return <div className="sa-loading"><Mark/>正在打开学习工作台…</div>;
  if(!identity)return <div className="sa-gate"><Mark/><h1>登录后进入 StudyAgent 学习工作台</h1><Link href="/parent/login">登录 / 创建家长账号</Link><Link href="/">返回学习观察室</Link></div>;
  const courses=overview?.courses??[], feed=overview?.feed??[], activities=overview?.activities??[];
  return <main className="sa-app">
    <aside className="sa-rail"><Link href="/" className="sa-logo"><Mark/><span>学习工作台</span></Link><button className="sa-new" onClick={()=>setShowBuilder(true)}>＋ 创建课程</button><nav>{([['home','Home'],['courses','Courses'],['feed','Learning Feed'],['history','History'],['marketplace','Marketplace']] as const).map(([key,label])=><button key={key} data-active={view===key} onClick={()=>{setView(key);setActive(null);}}>{label}</button>)}</nav><div className="sa-recent"><b>近期活动</b><p>{activities[0]?.title??'还没有活动'}</p></div><div className="sa-rail-foot">证据化学习</div></aside>
    <section className="sa-stage"><header className="sa-top"><div><strong>{labels[view]}</strong><select value={studentId} onChange={e=>setStudentId(e.target.value)}>{overview?.children.map(c=><option key={c.id} value={c.id}>{c.nickname}</option>)}</select><select value={subject} onChange={e=>setSubject(e.target.value as StudioSubject)}>{subjects.map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></div><Link href="/">学习观察室</Link></header>{error&&<div className="sa-error">{error}<button onClick={()=>setError('')}>×</button></div>}
      {view==='home'&&<section className="sa-home"><div className="sa-tabs"><button data-active={mode==='craft'} onClick={()=>setMode('craft')}>Craft Courses</button><button data-active={mode==='instant'} onClick={()=>setMode('instant')}>Instant Assistance</button></div><div className="sa-hero"><span>LEARNING STUDIO</span><h1>{mode==='craft'?'把下一步，做成一条走得通的路。':'从一个问题，走进看得见的学习。'}</h1><p>{mode==='craft'?'从已确认学习范围生成课程蓝图，审阅结构和来源后再开始。':'讲解、练习、可视化共享同一份学习证据，生成内容不会替代测量。'}</p></div><form className="sa-composer" onSubmit={submit}><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={3} placeholder={mode==='craft'?'围绕哪段学习内容设计课程？':'问一个概念，或试试可视化解释…'}/><div><span>＋</span><span>资料</span><span>Tools</span><span>语音</span><span className="sa-spacer"/><span>Normal</span><button disabled={busy||(mode==='instant'&&!prompt.trim())}>{busy?'…':'↑'}</button></div></form><div className="sa-prompts"><button onClick={()=>{setMode('instant');setPrompt('用图形解释异分母加法');const a=overview?.selected?.atoms.find(x=>x.teaching?.visual);if(a)setVisual(a);}}><b>可视化</b><span>用图形解释异分母加法</span><small>通分、合并与验算</small></button><button onClick={()=>{setPrompt('从已知点生成练习');setShowBuilder(true);}}><b>个性化练习</b><span>从我的已知点生成练习</span><small>只覆盖已确认范围</small></button><button onClick={()=>setView('feed')}><b>主动学习</b><span>看看今天最值得做什么</span><small>按教育优先级排序</small></button></div>
        {messages.length>0&&<div className="sa-chat">{messages.map(m=><article key={m.id} data-role={m.sender}><b>{m.sender==='user'?'我':'StudyAgent'}</b><p>{m.content}</p></article>)}</div>}{visual?.teaching&&<div className="sa-visual"><h2>{visual.name}</h2><TeachingGuide snapshot={{atomVersion:1,teaching:visual.teaching}}/></div>}
        <div className="sa-section-head"><h2>{active?'从课程继续':'你的学习路径'}</h2><button onClick={()=>setShowBuilder(true)}>创建课程</button></div>{courses.length?<div className="sa-cards">{courses.map(c=><button key={c.id} onClick={()=>{setActive(c);setView('courses')}}><span>{c.grade}年级</span><h3>{c.title}</h3><p>{c.objective}</p><small>{c.units.length} 单元 · {c.focusAtomIds.length} 目标</small></button>)}</div>:<div className="sa-empty"><h3>还没有课程</h3><p>先确认学习范围，再从已学知识生成可审核蓝图。</p><button onClick={()=>setShowBuilder(true)}>生成第一门课程</button></div>}</section>}
      {view==='courses'&&<section className="sa-page">{active?<CourseView course={active} back={()=>setActive(null)}/>:<><div className="sa-page-head"><h1>Courses</h1><button onClick={()=>setShowBuilder(true)}>＋ 创建课程</button></div><div className="sa-cards">{courses.map(c=><button key={c.id} onClick={()=>setActive(c)}><span>{c.grade}年级</span><h3>{c.title}</h3><p>{c.objective}</p><small>{c.units.length} 单元</small></button>)}</div></>}</section>}
      {view==='feed'&&<section className="sa-page"><div className="sa-page-head"><h1>Learning Feed</h1><small>{overview?.day}</small></div>{feed.map((f,i)=><a className="sa-feed" data-primary={i===0} key={f.id} href={f.href}><b>{String(i+1).padStart(2,'0')}</b><div><small>{f.kind}</small><h2>{f.title}</h2><p>{f.reason}</p></div><span>→</span></a>)}</section>}
      {view==='history'&&<section className="sa-page"><div className="sa-page-head"><h1>History</h1></div>{activities.map(a=><a className="sa-history" key={a.id} href={a.href}><time>{new Date(a.at).toLocaleString('zh-CN')}</time><div><h2>{a.title}</h2><p>{a.detail}</p></div></a>)}</section>}
      {view==='marketplace'&&<section className="sa-page"><div className="sa-page-head"><h1>Study Collections</h1><p>原创知识结构与测量框架，不复制第三方课程。</p></div><div className="sa-cards">{subjects.map(([key,name],i)=><button key={key} onClick={()=>{setSubject(key);setShowBuilder(true)}}><span>0{i+1}</span><h3>{name}学习包</h3><p>从能力关系、练习与复测组成。</p></button>)}</div></section>}
    </section>
    {showBuilder&&<div className="sa-modal"><button className="sa-scrim" onClick={()=>{setShowBuilder(false);setPreview(null)}}/><section><header><h2>{preview?'审阅课程蓝图':'生成课程蓝图'}</h2><button onClick={()=>{setShowBuilder(false);setPreview(null)}}>×</button></header>{preview?<><p>{preview.title}</p><dl><dt>单元</dt><dd>{preview.units.length}</dd><dt>活动</dt><dd>{preview.units.reduce((n,u)=>n+u.lessons.length,0)}</dd></dl><div className="sa-unit-preview">{preview.units.map(u=><article key={u.id}><h3>{u.title}</h3><p>{u.objective}</p></article>)}</div><button disabled={busy} onClick={()=>void makeCourse()}>确认并创建</button></>:<><input value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="课程名称或学习目标"/><p>将使用当前学生已确认范围内的 {overview?.selected?.atoms.length??0} 个知识点。</p><button disabled={busy||!overview?.selected?.atoms.length} onClick={()=>void makePreview()}>预览课程蓝图</button></>}</section></div>}
  </main>;
}

function CourseView({course,back}:{course:StudioCourse;back:()=>void}){return <div className="sa-course-detail"><button onClick={back}>← Courses</button><h1>{course.title}</h1><p>{course.description}</p><div className="sa-course-grid"><aside>{course.units.map((u,i)=><span key={u.id}>{i+1}. {u.title}</span>)}</aside><main>{course.units.map(u=><section key={u.id}><h2>{u.title}</h2>{u.lessons.map(l=><article key={l.id}><b>{l.title}</b><p>{l.objective}</p><a href={l.href}>Open →</a></article>)}</section>)}</main></div></div>}

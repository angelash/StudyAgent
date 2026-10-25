'use client';
import * as React from 'react';
import Link from 'next/link';
import type { ClassroomTurnIntent, ClassroomTurnView, ClassroomCatalog, ClassroomLesson, ClassroomSessionView, ClassroomUnit } from '@study-agent/contracts';
import { classroomStepUnits,classroomReplyUnits,classroomReadingMs, classroomPracticeSummary } from '@study-agent/contracts';
import { apiBaseUrl, apiRequest,getAuthToken } from '../../../lib/api';
import { useSessionUser } from '../../../lib/session-user';
import { XiaojiuModelPicker, useXiaojiuModels } from '../../../components/xiaojiu-model-picker';
import { CourseCover } from './diagram';
import { BoardStep } from './board-step';
import { useClassroomVisuals,VisualPanel,VisualImage,downloadVisualNotes,waitForVisualPrint } from './visuals';
import { PracticePanel } from './practice-panel';
import { ClassroomIcon } from './icons';
import './classroom.css';
import { StudioNavigation } from '../studio-navigation';
import '../workspace.css';
import { WorkspaceDialog } from '../workspace-dialog';
import { useCaptionUpgrade,CaptionUpgradeControl } from './captions';
import { useClassroomTurns, ClassroomIntentPicker, ClassroomTurnStatus } from './turns';
import { ReplyBoard } from './reply-board';
import { waitForReplyReading, playReplyAudio } from './reply-reading';
import { replyBoardMarkdown } from './reply-board-notes';
import { copyCourseFilters, courseLibraryHref } from '../course-library-state';
import { ClassroomToolTour } from './tool-tour';
import { useVoicePreview } from './voice-preview';
import { usePracticeDraft } from './practice-draft';
import { CourseLessonStatus,CourseProjectStatus } from '../course-activity';
import { FrozenCheckSource } from './check-source';

function Ring({ state = 'new' }: { state?: 'new' | 'started' | 'viewed' | 'correct' }) {
  return <span className="cl-ring" data-state={state} aria-label={{ new: '未开始', started: '已接触', viewed: '讲解已读', correct: '本题答对' }[state]} />;
}
function time(value: string) { return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); }
function lessonUrl(courseId: string, lessonId: string) {
  return '/studio/classroom?' + new URLSearchParams({ studioCourseId: courseId, lesson: lessonId });
}
export { lessonUrl };

export function ClassroomWorkbench() {
  const identity = useSessionUser();
  return <ClassroomWorkspace key={identity?identity.id+':'+identity.role:identity===undefined?'pending':'signed-out'} identity={identity}/>;
}
function ClassroomWorkspace({identity}:{identity:ReturnType<typeof useSessionUser>}){
  const [catalog, setCatalog] = React.useState<ClassroomCatalog | null>(null), [unitIndex, setUnitIndex] = React.useState(0);
  const [session, setSession] = React.useState<ClassroomSessionView | null>(null), [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false), [panel, setPanel] = React.useState<'units' | 'materials' | 'practices'>('units');
  const [initialTab, setInitialTab] = React.useState<'history' | 'practice' | 'project'>('history');
  const [expanded, setExpanded] = React.useState<string[]>([]);
  const [libraryHref, setLibraryHref] = React.useState('/studio?view=courses');
  const [lessonInfo, setLessonInfo] = React.useState<Pick<ClassroomLesson, 'id' | 'title' | 'objective'> | null>(null), [help, setHelp] = React.useState(false);
  const studio = React.useRef<string | undefined>(undefined), loadController = React.useRef<AbortController | null>(null);
  const catalogController=React.useRef<AbortController|null>(null);
  const sourceCourse = React.useRef<string | undefined>(undefined);
  const refresh = React.useCallback(async () => {
    if (!identity || identity.role === 'student') return;
    catalogController.current?.abort();const controller=new AbortController();catalogController.current=controller;
    try {const value=await apiRequest<ClassroomCatalog>('/learning/classroom/catalog',{signal:controller.signal});if(!controller.signal.aborted)setCatalog(value);}
    catch (caught) {if(!controller.signal.aborted)setError((caught as Error).message);}
  }, [identity]);
  const open = React.useCallback(async (lessonId: string, tab: 'history' | 'practice' | 'project' = 'history', studioCourseId?: string, history: 'push' | 'none' = 'push', assistance = false, savedSessionId?: string, useCurrentVersion = false, sourceCourseId?:string,sourceCheckId?:string) => {
    loadController.current?.abort(); const controller = new AbortController(); loadController.current = controller;
    setLoading(true); setError('');
    try {
      const row = savedSessionId ? await apiRequest<ClassroomSessionView>('/learning/classroom/sessions/' + encodeURIComponent(savedSessionId), { signal: controller.signal }) :
        await apiRequest<ClassroomSessionView>('/learning/classroom/sessions', { method: 'POST',
          signal: controller.signal, body: JSON.stringify({ lessonId, ...(studioCourseId ? { studioCourseId } : {}), ...(sourceCourseId?{sourceCourseId}:{}),...(sourceCheckId?{sourceCheckId}:{}), ...(useCurrentVersion ? { useCurrentVersion: true } : {}) }) });
      if (controller.signal.aborted) return;
      if (lessonId && row.lessonId !== lessonId || studioCourseId && row.studioCourseId !== studioCourseId || sourceCourseId&&row.sourceCourseId!==sourceCourseId||sourceCheckId&&row.sourceCheckId!==sourceCheckId) throw new Error('保存记录与当前课程入口不一致，请从课程历史重新进入。');
      setInitialTab(tab); setHelp(assistance); setSession(row); studio.current = row.studioCourseId;sourceCourse.current=row.sourceCourseId;
      const query = new URLSearchParams(window.location.search); query.set('lesson', row.lessonId); query.set('session', row.id); query.set('tab', tab); if (row.studioCourseId) query.set('studioCourseId', row.studioCourseId); else query.delete('studioCourseId'); if(assistance) query.set('help','1'); else query.delete('help');
      if(row.sourceCourseId)query.set('sourceCourseId',row.sourceCourseId);else query.delete('sourceCourseId');
      if(row.sourceCheckId)query.set('sourceCheckId',row.sourceCheckId);else query.delete('sourceCheckId');
      if(history==='push') window.history.pushState(null, '', '/studio/classroom?' + query);
      else window.history.replaceState(null, '', '/studio/classroom?' + query);
    } catch (caught) { if (!controller.signal.aborted) setError((caught as Error).message); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);
  React.useEffect(() => {
    if (!identity) return;
    void refresh();
    const restore = () => {
      setLibraryHref(courseLibraryHref(window.location.search));
      const params = new URLSearchParams(window.location.search), id = params.get('lesson');
      const requestedUnit = Number(params.get('unit') ?? 0); if (requestedUnit >= 0 && requestedUnit < 5) setUnitIndex(requestedUnit);
      setPanel(params.get('panel') === 'materials' || params.get('panel') === 'practices' ? params.get('panel') as 'materials' | 'practices' : 'units');
      if (id || params.get('session')) void open(id ?? '', params.get('tab') === 'practice' ? 'practice' : params.get('tab') === 'project' ? 'project' : 'history', params.get('studioCourseId') ?? undefined, 'none', params.get('help') === '1', params.get('session') ?? undefined, false,params.get('sourceCourseId')??undefined,params.get('sourceCheckId')??undefined);
      else { loadController.current?.abort(); setLoading(false); setSession(null); void refresh(); }
    };
    restore(); window.addEventListener('popstate', restore);
    return () => { loadController.current?.abort();catalogController.current?.abort(); window.removeEventListener('popstate', restore); };
  }, [identity, refresh, open]);
  const firstLecture = catalog?.course.units[unitIndex]?.lectures[0]?.id;
  React.useEffect(() => { if (firstLecture) setExpanded([firstLecture]); }, [firstLecture]);
  function close() {
    setSession(null);
    if(sourceCourse.current){const params=copyCourseFilters(window.location.search,new URLSearchParams({course:sourceCourse.current,...(session?.studentId?{studentId:session.studentId,subject:new URLSearchParams(window.location.search).get('returnSubject')??'math'}:{})}));window.location.assign('/studio/source-courses?'+params);return;}
    if (studio.current) {
      const params=new URLSearchParams(window.location.search), query=copyCourseFilters(window.location.search,new URLSearchParams({view:'courses',course:studio.current}));
      if(session?.studentId)query.set('student',session.studentId);const subject=params.get('returnSubject')??new URL(session?.lesson.verificationHref??'/studio',window.location.origin).searchParams.get('subject');if(subject)query.set('subject',subject);
      if(params.get('returnUnit'))query.set('unit',params.get('returnUnit')!);if(params.get('returnPanel'))query.set('panel',params.get('returnPanel')!);
      window.location.assign('/studio?'+query); return;
    }
    const unit = catalog?.course.units.findIndex(item => item.lectures.some(lecture => lecture.lessons.some(lesson => lesson.id === session?.lessonId)) || session?.lessonId === 'unit-exam:' + item.id) ?? unitIndex;
    const selectedUnit = unit >= 0 ? unit : unitIndex; setUnitIndex(selectedUnit);
    const query=new URLSearchParams(window.location.search);for(const key of ['lesson','session','tab','help'])query.delete(key);query.set('unit',String(selectedUnit));query.set('panel',panel);
    window.history.replaceState(null, '', '/studio/classroom?' + query); void refresh();
  }
  if (identity === undefined) return <div className="cl-loading" role="status">正在打开教学课堂…</div>;
  if (!identity) return <div className="cl-gate"><h1>让学习，发生在一间真正的课堂里。</h1><p>登录后保存课程、讲解断点和插问。</p><Link href="/parent/login">登录学习工作台 →</Link></div>;
  if (session && session.ownerUserId !== identity.id) return <div className="cl-loading" role="status">正在切换当前账号的课堂…</div>;
  if (session) return <>{error&&<aside className="cl-session-open-notice" role="alert" aria-label="课堂切换未完成"><span>{error}</span><button onClick={()=>setError('')}>关闭课堂切换提示</button></aside>}{loading&&<aside className="cl-session-open-notice" role="status">正在读取目标课时，当前记录继续保留…</aside>}<ClassroomSession key={identity.id + ':' + session.id} initial={session} initialTab={initialTab} assistance={help} unit={catalog?.course.units.find(unit =>
    unit.lectures.some(lecture => lecture.lessons.some(lesson => lesson.id === session.lessonId)) || session.lessonId === 'unit-exam:' + unit.id)}
    onClose={close} onNext={(id, tab = 'history', useCurrentVersion = false) => void open(id, tab, studio.current, 'push', false, undefined, useCurrentVersion,sourceCourse.current)} /></>;
  const course = catalog?.course, unit = course?.units[unitIndex];
  const progress = new Map(catalog?.progress.map(row => [row.lessonId, row]) ?? []);
  const readingProgress = catalog?.readingProgress ?? catalog?.progress ?? [];
  const reading = new Map(readingProgress.map(row => [row.lessonId, row]));
  function state(id: string) { const row = reading.get(id); return row?.completed ? 'viewed' as const : row ? 'started' as const : 'new' as const; }
  const allLessons = course?.units.flatMap(unit => unit.lectures.flatMap(lecture => lecture.lessons)) ?? [];
  const recent = [...readingProgress].filter(row => allLessons.some(lesson => lesson.id === row.lessonId)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
  const next = allLessons.find(lesson => lesson.id === recent?.lessonId && !recent.completed) ?? allLessons.find(lesson => !reading.get(lesson.id)?.completed);
  return <main className="cl-shell ws-classroom-shell">
    <StudioNavigation active="courses" recent={[{title:allLessons.find(lesson=>lesson.id===recent?.lessonId)?.title??'社会学想象力',detail:'社会学概论',href:'/studio/classroom?'+new URLSearchParams({lesson:recent?.lessonId??'soc-1-1-1',...(recent?{session:recent.sessionId}:{})})}]} />
    <div className="cl-course-layout"><aside className="cl-course-sidebar"><Link className="cl-exit-course" href={libraryHref}>× <span>退出课程</span></Link>
      <CourseCover /><div className="cl-curator"><span>S</span><div><small>策划自</small><b>StudyAgent Learning Studio</b></div></div>
      <h1>{course?.title ?? '教学课堂'}</h1><p>{course?.description}</p><details><summary>显示更多</summary><p>{course?.provenance}</p><p>60 个微课 · 15 个讲座 · 5 个单元项目</p></details>
      <div className="cl-panel-label">面板</div><div className="cl-course-tabs" role="tablist" aria-label="课程面板">
        {(['units', 'materials', 'practices'] as const).map((item, index) => <button key={item} role="tab" aria-selected={panel === item} onClick={() => {setPanel(item);const params=new URLSearchParams(window.location.search);params.set('unit',String(unitIndex));params.set('panel',item);window.history.replaceState(null,'','/studio/classroom?'+params);}}>{['单元', '资料', '练习'][index]}</button>)}
      </div><div className="cl-unit-nav">{course?.units.map((item, index) => <button key={item.id} data-active={unitIndex === index} onClick={() => {setUnitIndex(index);const params=new URLSearchParams(window.location.search);params.set('unit',String(index));params.set('panel',panel);window.history.replaceState(null,'','/studio/classroom?'+params);}}><b>{index + 1}</b>{item.title}</button>)}</div>
    </aside><section className="cl-outline">
      {error && <div className="cl-error" role="alert">{error}<button onClick={() => void refresh()}>重试</button></div>}
      {loading && <div className="cl-open-status" role="status">正在恢复课堂…</div>}
      {identity.role === 'student' && !loading && <div className="cl-empty">请从你的学习课程中打开已审核微课。<Link href="/studio">返回课程</Link></div>}
      {course && unit && <>
        <div className="cl-unit-heading"><small>第 {unitIndex + 1} 单元，共 {course.units.length} 单元</small><h2>单元 {unitIndex + 1}：{unit.title}</h2><p>{unit.objective}</p></div>
        <Link className="cl-extend" href="/studio?view=materials"><span>▤</span><div><b>把自己的资料带进课堂</b><small>PDF、页级阅读、个性化学案与白板</small></div><span>↗</span></Link>
        <div className="cl-legend"><span><Ring state="viewed"/>讲解已读</span><span><Ring state="started"/>已接触</span><span><Ring/>未开始</span><span>▣ Project</span><span>♙ Exam</span></div>
        <div className="ws-course-route"><div className="cl-status-strip">{unit.lectures.flatMap(lecture => lecture.lessons).map(lesson => <button key={lesson.id} title={lesson.title} onClick={() => void open(lesson.id)}><Ring state={state(lesson.id)}/></button>)}
          <Link title="单元项目" href={'/studio/projects?'+copyCourseFilters(libraryHref,new URLSearchParams({unitId:unit.id,returnUnit:String(unitIndex),returnPanel:panel}))}>▣</Link><button title="单元核查" onClick={() => void open('unit-exam:' + unit.id, 'practice')}>♙</button></div>
        {next && <button className="cl-next" onClick={() => void open(next.id)}>▶ <span>下一步：{next.title}</span> ›</button>}</div>

        <details className="ca-journey" aria-label="本单元学习进程"><summary>学习进程 · 本单元</summary><p>讲解、练习和项目分别记录。已读、自评和AI建议不等于知识已掌握。</p><ol>{[...unit.lectures.flatMap(lecture=>lecture.lessons),{id:'unit-exam:'+unit.id,title:unit.title+'综合核查',objective:unit.objective}].map(lesson=>{const activity=catalog?.lessonActivities?.find(item=>item.lessonId===lesson.id);return <li key={lesson.id}><h3>{lesson.title}</h3><CourseLessonStatus value={activity}/><div className="ca-links">{activity?.kind!=='unit_check'&&<button onClick={()=>void open(lesson.id,'history',undefined,'push',false,activity?.reading.sessionId??undefined)}>{activity?.reading.sessionId?'继续讲解':'开始讲解'}</button>}<button onClick={()=>void open(lesson.id,'practice',undefined,'push',false,activity?.practice.sessionId??undefined)}>{activity?.practice.summary.answered?'继续本次练习':'开始练习'}</button></div></li>;})}</ol><h3>本单元项目</h3>{catalog?.projectActivities?.filter(project=>project.unitId===unit.id).length?<ul>{catalog.projectActivities.filter(project=>project.unitId===unit.id).map(project=><li key={project.projectId}><CourseProjectStatus value={project}/><div className="ca-links"><Link href={'/studio/projects?'+copyCourseFilters(libraryHref,new URLSearchParams({unitId:unit.id,project:project.projectId,stage:project.stageId,returnUnit:String(unitIndex),returnPanel:panel}))}>继续项目 →</Link></div></li>)}</ul>:<div className="ca-links"><Link href={'/studio/projects?'+copyCourseFilters(libraryHref,new URLSearchParams({unitId:unit.id,returnUnit:String(unitIndex),returnPanel:panel}))}>开始项目 →</Link></div>}</details>
        {Boolean(catalog?.archivedSessions?.length) && <details className="cl-archived-sessions"><summary>查看保留的旧版学习记录（{catalog!.archivedSessions!.length}）</summary><p>旧题和首次作答按当时版本保存。打开旧记录不会换成新题。</p><ul>{catalog!.archivedSessions!.map(saved => <li key={saved.sessionId}>
          <Link href={'/studio/classroom?' + new URLSearchParams({ lesson: saved.lessonId, session: saved.sessionId, tab: 'practice' })}>{saved.title} · 已记录 {saved.answered}/{saved.total} 题</Link><small>{new Date(saved.updatedAt).toLocaleString('zh-CN')}</small></li>)}</ul></details>}
        {panel === 'materials' ? <div className="cl-card"><h2>参考资料</h2><p>自编讲解以通用概念和匿名情境教学。以下为开放的进一步阅读入口，未逐节宣称页码引用。</p>
          {course.references.map(reference => <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer">{reference.title} ↗</a>)}
          <Link href="/studio?view=materials">打开我的 PDF 与学案 →</Link></div> : <div className="cl-timeline">
          {unit.lectures.map((lecture, index) => <article className="cl-lecture" key={lecture.id}>
            <span className="cl-timeline-icon">▧</span><header><button onClick={() => setExpanded(rows => rows.includes(lecture.id) ? rows.filter(id => id !== lecture.id) : [...rows, lecture.id])} aria-expanded={expanded.includes(lecture.id)}>
              讲次 {index + 1}：{lecture.title}</button><button className="cl-assist" onClick={() => void open(lecture.lessons[0].id, 'history', undefined, 'push', true)}>获取帮助</button></header>
            <p>{lecture.description}</p>
            {(expanded.includes(lecture.id) || panel === 'practices') && <div className="cl-microlessons">{lecture.lessons.map(lesson => <div className="cl-micro" key={lesson.id}>
              <span className="ws-micro-title">{lesson.title}<button className="ws-lesson-info" aria-label={'查看学习目标：' + lesson.title} onClick={() => setLessonInfo(lesson)}>⊙</button></span><button className="cl-learn" disabled={loading} onClick={() => void open(lesson.id)}>{reading.has(lesson.id) ? '▶ 继续学习' : '▶ 学习'}</button>
              <button className="cl-practice" disabled={loading} onClick={() => void open(lesson.id, 'practice')}>♧ 练习{Boolean(progress.get(lesson.id)?.answered) && <span title="已有练习记录"> ·</span>}</button><Ring state={state(lesson.id)}/>
            </div>)}</div>}
          </article>)}
          <article className="cl-lecture cl-project"><span className="cl-timeline-icon">▣</span><small>PROJECT · {unitIndex + 1} / 5</small><h3>{unit.project.title}</h3><p>{unit.project.brief}</p><Link className="ws-open-activity" href={'/studio/projects?'+copyCourseFilters(libraryHref,new URLSearchParams({unitId:unit.id,returnUnit:String(unitIndex),returnPanel:panel}))}>开始项目 →</Link></article>
          <article className="cl-lecture cl-exam"><span className="cl-timeline-icon">♙</span><small>UNIT CHECK</small><h3>{unit.title}综合核查</h3><p>覆盖本单元的 12 个主题，12 道新情境题保留首次作答、跳过与提示记录。</p><button onClick={() => void open('unit-exam:' + unit.id, 'practice')}>Start →</button></article>
        </div>}
      </>}
    </section></div>
    {lessonInfo && <WorkspaceDialog onClose={() => setLessonInfo(null)}><section className="ws-event-dialog ws-help-dialog" role="dialog" aria-modal="true" aria-label="微课学习目标"><header><h2>{lessonInfo.title}</h2><button aria-label="关闭学习目标" onClick={() => setLessonInfo(null)}>×</button></header><p>{lessonInfo.objective}</p><p>通过讲解理解概念，再用课堂题目检查。课堂记录会保留在当前账号下。</p><footer><button onClick={() => { setLessonInfo(null); void open(lessonInfo.id); }}>开始学习</button><button onClick={() => { setLessonInfo(null); void open(lessonInfo.id, 'practice'); }}>检查理解</button></footer></section></WorkspaceDialog>}
  </main>;
}

type SpeechRecognitionSession = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null };

function ClassroomSession({ initial, initialTab, assistance = false, unit, onClose, onNext }: { initial: ClassroomSessionView;
  initialTab: 'history' | 'practice' | 'project'; assistance?: boolean; unit?: ClassroomUnit; onClose: () => void; onNext: (id: string, tab?: 'history' | 'practice', useCurrentVersion?: boolean) => void }) {
  const [session, setSession] = React.useState(initial), row = React.useRef(initial);
  const [playing, setPlaying] = React.useState(false), [muted, setMuted] = React.useState(!initial.speech.available);
  const [speed, setSpeed] = React.useState(1), [voice, setVoice] = React.useState(initial.speech.defaultVoice ?? '');
  const [previewMode,setPreviewMode]=React.useState<'neutral'|'current'>('neutral');
  const [dots, setDots] = React.useState(true), [handwriting, setHandwriting] = React.useState(true), [zoom, setZoom] = React.useState(100);
  const [page, setPage] = React.useState(0), [chatWidth, setChatWidth] = React.useState(360), [mobile, setMobile] = React.useState<'board' | 'chat'>('board');
  const [boardLocation, setBoardLocation] = React.useState<{id:string;page:number}|null>(null);
  const explicitBoard = React.useRef(false);
  const [settings, setSettings] = React.useState(false), [exit, setExit] = React.useState(false), [tourOpen, setTourOpen] = React.useState(false);
  const [standalonePractice, setStandalonePractice] = React.useState(initialTab === 'practice');
  const [tab, setTab] = React.useState<'history' | 'practice' | 'project'>(initialTab === 'practice' ? 'history' : initialTab), [question, setQuestion] = React.useState(assistance ? '我正在学习“' + initial.lesson.title + '”，请围绕“' + initial.lesson.objective + '”帮我梳理，并用一个新情境检查我的理解。' : ''), [operationBusy, setBusy] = React.useState(false), [notice, setNotice] = React.useState('');
  const [projectDraft, setProjectDraft] = React.useState(initial.projectDraft), [projectSaved, setProjectSaved] = React.useState(false);
  const [hinted, setHinted] = React.useState<string[]>(initial.hintedQuestionIds ?? []), [questionIndex, setQuestionIndex] = React.useState(() => classroomPracticeSummary(initial.lesson.questions, initial.answers).nextQuestionIndex);
  const [audioState, setAudioState] = React.useState(''), [listening, setListening] = React.useState(false);
  const [readingReply, setReadingReply] = React.useState(''), [award, setAward] = React.useState(false);
  const [replySubtitle, setReplySubtitle] = React.useState('');
  const [checkSource,setCheckSource]=React.useState('');
  const [replyReadingMode,setReplyReadingMode]=React.useState<'audio'|'text'>('audio');
  const [replyUnit,setReplyUnit]=React.useState<{messageId:string;unitId:string|null}|null>(null),[expandedReply,setExpandedReply]=React.useState('');
  const replyAudio = React.useRef<{ abort: AbortController; audio: HTMLAudioElement | null; url: string } | null>(null);
  const recognition = React.useRef<SpeechRecognitionSession | null>(null), [showChat, setShowChat] = React.useState(initialTab !== 'practice');
  const { catalog, modelId, setModelId } = useXiaojiuModels();
  const revisionQueue = React.useRef<Promise<unknown>>(Promise.resolve());
  const cloudAudio = React.useRef<HTMLAudioElement | null>(null), cache = React.useRef(new Map<string, Blob>());
  const playEpoch=React.useRef(0),narrationAbort=React.useRef<AbortController|null>(null);
  const historyElement = React.useRef<HTMLDivElement | null>(null), following = React.useRef(true);
  const tourLayout = React.useRef<{ mobile: 'board'|'chat'; showChat: boolean; trigger: HTMLElement | null } | null>(null);
  const speedRef = React.useRef(speed), voiceRef = React.useRef(voice), mutedRef = React.useRef(muted), mounted = React.useRef(true);
  speedRef.current = speed; voiceRef.current = voice; mutedRef.current = muted;
  const lesson = session.lesson, current = lesson.steps[session.cursor], pageCount = Math.max(1, Math.ceil(session.revealed / 3));
  const visuals=useClassroomVisuals(session.id),[visualOpen,setVisualOpen]=React.useState(false);
  const [printBusy,setPrintBusy]=React.useState(false),printOperation=React.useRef<AbortController|null>(null);
  const captions=useCaptionUpgrade({session,visible:settings,getSession:()=>row.current,
    beforeChange:async()=>{pause();await revisionQueue.current.catch(()=>undefined);},
    onSession:value=>{cache.current.clear();return receive(value);},onNotice:setNotice,onClose:()=>setSettings(false)});
  const [intent,setIntent]=React.useState<ClassroomTurnIntent>('question');
  const turns=useClassroomTurns({session,onSession:receive,onNotice:setNotice});
  const practiceDraft = usePracticeDraft(session, receive);
  const busy=operationBusy||captions.busy||turns.working||turns.active||practiceDraft.working;
  const voicePreview = useVoicePreview({ session, visible: settings, beforePlay: pause, speed });
  const primaryVoices=session.speech.voices.filter(item=>item.classroomPreset),visibleVoices=primaryVoices.length?primaryVoices:session.speech.voices;
  const extraVoices=primaryVoices.length?session.speech.voices.filter(item=>!item.classroomPreset):[];
  const presetNames={warm:'Warm',calm:'Calm',bright:'Bright',gentle:'Gentle',professional:'Professional',lively:'Lively'};
  const canPreview=session.speech.available&&(previewMode==='neutral'&&!!session.speech.preview||session.revealed>session.cursor);
  React.useEffect(()=>{if(!settings)printOperation.current?.abort();},[settings]);
  React.useEffect(()=>()=>printOperation.current?.abort(),[]);
  async function printNotes(){const operation=new AbortController();printOperation.current?.abort();printOperation.current=operation;setPrintBusy(true);try{
    const root=document.querySelector<HTMLElement>('.cl-print-notes');if(!root)throw new Error('打印笔记尚未就绪');
    const ids=visuals.rows.filter(row=>row.selected&&lesson.steps.slice(0,session.revealed).some(step=>step.id===row.stepId)).map(row=>row.id);
    await waitForVisualPrint(root,ids,operation.signal);if(operation.signal.aborted)return;printOperation.current=null;setSettings(false);window.print();
  }catch(error){if((error as Error).name!=='AbortError')setNotice((error as Error).message);}finally{if(printOperation.current===operation)printOperation.current=null;if(mounted.current)setPrintBusy(false);}}
  function receive(value: ClassroomSessionView) { row.current = value; if (mounted.current) { setSession(value); if (value.hintedQuestionIds?.length) setHinted(items => [...new Set([...items, ...value.hintedQuestionIds!])]); } return value; }
  type ProgressUpdate=Partial<Pick<ClassroomSessionView,'cursor'|'revealed'|'projectDraft'|'sentenceCursor'>>&{completed?:boolean};
  function save(update:ProgressUpdate|((latest:ClassroomSessionView)=>ProgressUpdate)) {
    const task = revisionQueue.current.catch(() => undefined).then(async () => {
      const latest = row.current,patch=typeof update==='function'?update(latest):update;
      const target=latest.lesson.steps[patch.cursor??latest.cursor],unit=classroomStepUnits(latest,target)[patch.sentenceCursor??((patch.cursor??latest.cursor)===latest.cursor?(latest.sentenceCursor??0):0)];
      return receive(await apiRequest<ClassroomSessionView>('/learning/classroom/sessions/' + latest.id, { method: 'PATCH',
        body: JSON.stringify({ expectedRevision: latest.revision, cursor: latest.cursor, revealed: latest.revealed, ...patch,
          ...(latest.presentation?{presentationVersion:latest.presentation.version,unitId:unit?.id}:{}) }) }));
    });
    revisionQueue.current = task; return task;
  }
  React.useEffect(() => {
    mounted.current = true;
    try {
      const preferences = JSON.parse(localStorage.getItem('studyagent.classroom.preferences') ?? '{}');
      if ([0.5, 0.75, 1, 1.25, 1.5, 2].includes(preferences.speed)) setSpeed(preferences.speed);
      if (typeof preferences.dots === 'boolean') setDots(preferences.dots);
      if (typeof preferences.handwriting === 'boolean') setHandwriting(preferences.handwriting);
      if (initial.speech.voices.some(voice => voice.id === preferences.voice)) setVoice(preferences.voice);
      if (!standalonePractice && !localStorage.getItem('studyagent.classroom.tour')) openTour();
    } catch { /* Optional UI preferences never prevent a lesson. */ }
    setPage(Math.max(0, Math.floor(initial.cursor / 3)));
    return () => { mounted.current = false; recognition.current?.abort(); replyAudio.current?.abort.abort(); replyAudio.current?.audio?.pause(); if (replyAudio.current?.url) URL.revokeObjectURL(replyAudio.current.url); };
  }, [initial]);
  React.useEffect(() => {
    try { localStorage.setItem('studyagent.classroom.preferences', JSON.stringify({ speed, voice, dots, handwriting })); } catch { /* Optional. */ }
    if (cloudAudio.current) cloudAudio.current.playbackRate = speed;
    if (replyAudio.current?.audio) replyAudio.current.audio.playbackRate = speed;
  }, [speed, voice, dots, handwriting]);
  React.useLayoutEffect(() => {
    if (following.current && historyElement.current) historyElement.current.scrollTop = historyElement.current.scrollHeight;
  }, [session.revealed, session.messages.length, session.cursor, session.sentenceCursor, playing, turns.turn?.status, notice, mobile, chatWidth]);
  React.useEffect(() => {
    const resized = () => { if (following.current && historyElement.current) historyElement.current.scrollTop = historyElement.current.scrollHeight; };
    window.addEventListener('resize', resized); return () => window.removeEventListener('resize', resized);
  }, []);
  React.useLayoutEffect(() => {
    if (!boardLocation || boardLocation.page !== page) return;
    const target = document.getElementById('board-' + boardLocation.id);
    if (!target) return;
    target.scrollIntoView({block:'start',behavior:'instant'});
    setBoardLocation(null);
  }, [boardLocation, page, mobile, session.messages]);
  React.useEffect(() => {
    if (explicitBoard.current || page !== Math.floor(session.cursor / 3) || session.revealed <= session.cursor || standalonePractice) return;
    const frame = requestAnimationFrame(() => {
      if (explicitBoard.current) return;
      const section = document.getElementById('board-' + session.lesson.steps[session.cursor].id);
      const target = playing ? section?.lastElementChild : section;
      target?.scrollIntoView({ block: playing ? 'nearest' : 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [session.cursor, session.revealed, session.sentenceCursor, page, standalonePractice]);
  React.useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') { pause(); setSettings(false); setExit(false); }
    }
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  }, []);
  React.useEffect(() => {
    if (!playing) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout> | undefined,
      audio: HTMLAudioElement | null = null, url = '';
    const abort = new AbortController(),epoch=++playEpoch.current;
    narrationAbort.current=abort;const stopped=()=>cancelled||epoch!==playEpoch.current;
    async function play() {
      const index = row.current.cursor, step = row.current.lesson.steps[index];
      await save({ revealed: Math.max(row.current.revealed, index + 1) });
      if (stopped()) return;
      setPage(Math.floor(index / 3));
      const units=classroomStepUnits(row.current,step),sentences=units.map(unit=>unit.text),version=row.current.presentation?.version,startSentence = row.current.sentenceCursor ?? 0;
      const pending = new Map<string, Promise<Blob>>();
      function loadSentence(sentenceIndex: number): Promise<Blob> {
        const key = row.current.id+':'+step.id+':'+(version??'legacy-v1')+':'+units[sentenceIndex].id+':' + voiceRef.current;
        const cached = cache.current.get(key); if (cached) return Promise.resolve(cached);
        if (!pending.has(key)) pending.set(key, (async () => {
          const response = await fetch(apiBaseUrl + '/api/learning/classroom/sessions/' + row.current.id + '/narration/' + encodeURIComponent(step.id), {
            method: 'POST', credentials: 'include', signal: abort.signal, headers: { 'Content-Type': 'application/json',...(getAuthToken()?{Authorization:'Bearer '+getAuthToken()}:{}) },
            body: JSON.stringify({ voice: voiceRef.current || undefined, sentenceIndex,...(version?{presentationVersion:version,unitId:units[sentenceIndex].id}:{}) }) });
          if (!response.ok) throw new Error('语音暂时不可用。可以重试，或选择“文字继续”。');
          const blob = await response.blob();
          if (!blob.type.startsWith('audio/')) throw new Error('语音返回格式异常，请使用文字继续。');
          if (!stopped()) cache.current.set(key, blob);
          return blob;
        })());
        return pending.get(key)!;
      }
      for (let sentenceIndex = startSentence; sentenceIndex < sentences.length; sentenceIndex++) {
      if (stopped()) return;
      if (!mutedRef.current && row.current.speech.available) {
        setAudioState('正在准备声音…');
        const blob = await loadSentence(sentenceIndex);
        if (stopped()) return;
        // Prefetch one sentence, while display still waits for the current audio to end.
        if (sentenceIndex + 1 < sentences.length) void loadSentence(sentenceIndex + 1).catch(() => undefined);
        url = URL.createObjectURL(blob); audio = new Audio(url); cloudAudio.current = audio; audio.playbackRate = speedRef.current;
        await save({ sentenceCursor: sentenceIndex });
        if (stopped()) return;
        setAudioState('老师正在讲解');
        await new Promise<void>((resolve, reject) => { if (!audio) return resolve(); audio.onended = () => resolve();
          audio.onerror = () => reject(new Error('声音播放失败，请重试或文字继续。')); void audio.play().catch(reject); });
        if (url) URL.revokeObjectURL(url); url = ''; audio = null; cloudAudio.current = null;
      } else {
        await save({ sentenceCursor: sentenceIndex });
        if (stopped()) return;
        setAudioState('正在讲解');
        await new Promise<void>(resolve => { timer = setTimeout(resolve, classroomReadingMs(sentences[sentenceIndex],version) / speedRef.current); });
      }
      }
      if (stopped()) return;
      if (step.phase === 'check' && row.current.lesson.questions.some(question => !row.current.answers.some(answer => answer.questionId === question.id))) {
        setPlaying(false); setTab('practice'); setMobile('chat');
        setNotice('先停在这个检查点。独立判断或使用提示，提交后再点击下一步继续。');
        return;
      }
      if (index === row.current.lesson.steps.length - 1) {
        await save({ completed: true, revealed: row.current.lesson.steps.length });
        if (!stopped()) { setPlaying(false); setAward(true); setNotice('本节讲解已读。接下来用新情境练习，再决定需要回看哪一段。'); }
      } else await save({ cursor: index + 1 });
    }
    void play().catch(error => { if (!stopped()) { setNotice(error.message); setPlaying(false); } });
    return () => { cancelled = true; abort.abort(); if(narrationAbort.current===abort)narrationAbort.current=null; if (timer) clearTimeout(timer); audio?.pause(); cloudAudio.current = null; if (url) URL.revokeObjectURL(url); setAudioState(''); };
    // Audio completion advances the persisted cursor. Display, mute and voice changes apply
    // at the next sentence; pause cancels the current sentence and any pending fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, session.cursor]);
  function pause() { explicitBoard.current=false;setBoardLocation(null);playEpoch.current++;narrationAbort.current?.abort();cloudAudio.current?.pause();setPlaying(false); recognition.current?.abort(); setListening(false);
    replyAudio.current?.abort.abort(); replyAudio.current?.audio?.pause(); if (replyAudio.current?.url) URL.revokeObjectURL(replyAudio.current.url); replyAudio.current = null; setReadingReply(''); setReplySubtitle(''); setReplyUnit(null); }
  function locateBoard(id:string, targetPage:number) { explicitBoard.current=true;setPage(targetPage);setMobile('board');setBoardLocation({id,page:targetPage}); }
  async function selectBoard(id:string,targetPage:number) {
    pause();const epoch=playEpoch.current;
    await revisionQueue.current.catch(()=>undefined);
    if (!mounted.current || epoch!==playEpoch.current) return;
    locateBoard(id,targetPage);
  }
  async function readReply(messageId: string, mode: 'audio'|'text' = 'audio') {
    pause(); const operation = { abort: new AbortController(), audio: null as HTMLAudioElement | null, url: '' }; replyAudio.current = operation;
    setReadingReply(messageId); setExpandedReply(''); setReplyReadingMode(mode);
    try {
      // A pending navigation save also selects its destination page. Let that finish
      // before locating the reply, so its late page change cannot hide the reader.
      await revisionQueue.current.catch(() => undefined);
      if (operation.abort.signal.aborted) return;
      const message = row.current.messages.find(item => item.id === messageId);
      if (!message) throw new Error('回答记录不存在，请重新读取课堂');
      const units = classroomReplyUnits(message);
      setReplyUnit({messageId,unitId:null});
      if (message.board) locateBoard(messageId,message.board.page);
      for (let sentenceIndex = 0; sentenceIndex < units.length; sentenceIndex++) {
        if (operation.abort.signal.aborted) return;
        const unit = units[sentenceIndex];
        if (mode === 'text') {
          setReplySubtitle(unit.text); setReplyUnit({messageId,unitId:unit.id});
          await waitForReplyReading(classroomReadingMs(unit.text, message.speech?.version ?? 'legacy-v1') / speedRef.current, operation.abort.signal);
        } else {
          const response = await fetch(apiBaseUrl + '/api/learning/classroom/sessions/' + row.current.id + '/narration/' + encodeURIComponent(messageId), {
            method: 'POST', credentials: 'include', signal: operation.abort.signal,
            headers: { 'Content-Type': 'application/json', ...(getAuthToken()?{Authorization:'Bearer '+getAuthToken()}:{}) },
            body: JSON.stringify({ voice: voiceRef.current || undefined, sentenceIndex, ...(message.speech?{presentationVersion:message.speech.version,unitId:unit.id}:{}) }) });
          if (!response.ok) throw new Error('回答语音暂时不可用，可以按句阅读文字。');
          const blob = await response.blob(); if (operation.abort.signal.aborted) return;
          operation.url = URL.createObjectURL(blob); operation.audio = new Audio(operation.url); operation.audio.playbackRate = speedRef.current;
          setReplySubtitle(unit.text); setReplyUnit({messageId,unitId:unit.id});
          await playReplyAudio(operation.audio, operation.abort.signal);
          URL.revokeObjectURL(operation.url); operation.url = ''; operation.audio = null;
        }
      }
    } catch (error) { if (!operation.abort.signal.aborted) setNotice((error as Error).message); }
    finally {
      operation.audio?.pause(); if (operation.url) URL.revokeObjectURL(operation.url);
      if (replyAudio.current === operation) { replyAudio.current = null; setReadingReply(''); setReplySubtitle(''); setReplyUnit(null); }
    }
  }
  async function advance() {
    if (busy) return;
    pause(); setBusy(true);
    try {
      const value = row.current, last = value.cursor >= lesson.steps.length - 1;
      const revealed = Math.max(value.revealed, value.cursor + 1), cursor = last ? value.cursor : value.cursor + 1;
      await save({ cursor, sentenceCursor: classroomStepUnits(value,lesson.steps[cursor]).length - 1,
        revealed: Math.max(revealed, cursor + 1), ...(last ? { completed: true } : {}) });
      setPage(Math.floor(cursor / 3));
      if (last && value.status !== 'completed') setAward(true);
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function ask(event: React.FormEvent) {
    event.preventDefault(); if (!question.trim() || busy || !turns.loaded) return;
    pause(); following.current = true; setBusy(true); setNotice('');
    try {
      await revisionQueue.current;
      if (row.current.revealed <= row.current.cursor) await save({ revealed: row.current.cursor + 1 });
      const latest = row.current, step = latest.lesson.steps[latest.cursor], unit = classroomStepUnits(latest, step)[latest.sentenceCursor ?? 0];
      const previous = turns.uncertain;
      const command = { message: question.trim(), modelId, intent, ...(standalonePractice && questionItem ? { questionId: questionItem.id } : {}),
        contentFingerprint: latest.contentFingerprint, stepId: step.id, sentenceCursor: latest.sentenceCursor ?? 0,
        presentationVersion: latest.presentation!.version, unitId: unit.id };
      const same = previous && Object.entries(command).every(([key,value]) => previous[key as keyof typeof previous] === value) && previous.questionId === command.questionId;
      const value = await turns.send({ ...command, requestKey: same ? previous.requestKey : crypto.randomUUID() });
      if (value) { setQuestion(''); setTab('history'); setMobile('chat'); setNotice('插问已保存，回答会出现在这里。'); }
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function returnToTurn(turn: ClassroomTurnView) {
    pause(); setBusy(true);
    try {
      await revisionQueue.current;
      const latest = row.current;
      if (latest.contentFingerprint !== turn.position.contentFingerprint || latest.presentation?.version !== turn.position.presentationVersion ||
        classroomStepUnits(latest, latest.lesson.steps[turn.position.cursor])[turn.position.sentenceCursor]?.id !== turn.position.unitId)
        throw new Error('原字幕版本已变化，请在当前课堂选择继续位置。');
      await save({ cursor: turn.position.cursor, sentenceCursor: turn.position.sentenceCursor });
      setPage(Math.floor(turn.position.cursor / 3)); setTab('history'); setStandalonePractice(false); setPlaying(true);
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function answer(disposition?: 'skip' | 'dont_know', recover = false) {
    const item = lesson.questions[questionIndex]; if (!item || busy) return;
    pause(); setBusy(true); setNotice('');
    try {
      await revisionQueue.current.catch(() => undefined);
      if (mounted.current) await practiceDraft.submit(recover ? undefined : item.id, disposition);
    } catch (error) { if (mounted.current) setNotice((error as Error).message); } finally { if (mounted.current) setBusy(false); }
  }
  async function hint(questionId: string, level: number) {
    if (busy) return;
    pause(); setBusy(true); setNotice('');
    try {
      await revisionQueue.current.catch(() => undefined);
      receive(await apiRequest<ClassroomSessionView>('/learning/classroom/sessions/' + row.current.id + '/hints', {
        method: 'POST', body: JSON.stringify({ questionId, level, requestKey: crypto.randomUUID() }) }));
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  function microphone() {
    if (listening) { recognition.current?.stop(); return; }
    pause();
    const host = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionSession; webkitSpeechRecognition?: new () => SpeechRecognitionSession };
    const Constructor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
    if (!Constructor) { setNotice('当前浏览器不支持语音转写，请直接输入问题。'); return; }
    const listener = new Constructor(); recognition.current = listener; listener.lang = 'zh-CN'; listener.interimResults = false; listener.continuous = false;
    listener.onresult = event => { setQuestion(Array.from(event.results).map(result => result[0].transcript).join('')); setListening(false); };
    listener.onerror = event => { setListening(false); setNotice('语音输入未完成：' + event.error + '。可继续使用文字输入。'); };
    listener.onend = () => setListening(false); listener.start(); setListening(true);
  }
  async function exportNotes(format: 'auto'|'markdown' = 'auto') {
    const source = ['# ' + lesson.title, '\n' + lesson.objective, ...lesson.steps.slice(0, session.revealed).map(step => '\n## ' + step.title + '\n\n' + step.blocks.filter(block => block.kind !== 'heading').map(block => block.items?.map(point => '- ' + point).join('\n') ?? (block.table ? [block.table.headers.join(' | '), ...block.table.rows.map(cells => cells.join(' | '))].join('\n') : block.image ? '![' + block.image.alt + '](' + block.image.src + ')' : block.text)).join('\n\n')),
      '\n## 课堂插问', ...session.messages.map(message => '\n**' + (message.role === 'user' ? '我' : '老师') + '** ' + message.content +
        (message.board ? '\n\n' + replyBoardMarkdown(message.board) : '')),
      '\n## 项目草稿\n' + projectDraft, '\n学习记录仅表示接触和本次课堂题目表现，不代表经过校准的能力掌握。'].join('\n');
    const selectedVisuals=visuals.rows.filter(row=>row.selected&&lesson.steps.slice(0,session.revealed).some(step=>step.id===row.stepId));
    const richBoards=session.messages.filter(message=>message.board?.table||message.board?.formulas?.length);
    if(format!=='markdown'&&(selectedVisuals.length||richBoards.length)){try{await downloadVisualNotes(source,lesson.title,selectedVisuals,richBoards);}catch(error){setNotice((error as Error).message);}return;}
    const url = URL.createObjectURL(new Blob([source], { type: 'text/markdown;charset=utf-8' })), anchor = document.createElement('a');
    anchor.href = url; anchor.download = lesson.title + '.md'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function openTour() {
    pause(); voicePreview.stop();
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    tourLayout.current = { mobile, showChat, trigger: trigger?.closest('.cl-settings') ? document.querySelector<HTMLElement>('[data-classroom-tour="settings"]') : trigger };
    setSettings(false); setTourOpen(true);
  }
  function tourStep(index: number | null) {
    if (index === null) return;
    if (index >= 4) setShowChat(true);
    if (innerWidth <= 700) setMobile(index >= 4 ? 'chat' : 'board');
  }
  function finishTour() {
    pause(); setTourOpen(false);
    const layout = tourLayout.current;
    if (layout) { setMobile(layout.mobile); setShowChat(layout.showChat); requestAnimationFrame(() => { if (layout.trigger?.isConnected) layout.trigger.focus(); }); }
    tourLayout.current = null;
    try { localStorage.setItem('studyagent.classroom.tour', 'done'); } catch { /* Optional. */ }
  }
  const questionItem = lesson.questions[questionIndex], receipt = session.answers.find(answer => answer.questionId === questionItem?.id);
  const nextLesson = lesson.nextLessonId?{id:lesson.nextLessonId}:unit?.lectures.flatMap(lecture => lecture.lessons).find((_, index, list) => list[index - 1]?.id === lesson.id);
  function practice(standalone: boolean) { return <PracticePanel recovery={<div className="cl-choice-recovery" aria-label="作答恢复">
    {(practiceDraft.notice || practiceDraft.storageNotice) && <p role="status">{[practiceDraft.notice, practiceDraft.storageNotice].filter(Boolean).join(' ')}</p>}
    {practiceDraft.pending && <p>第{lesson.questions.findIndex(q => q.id === practiceDraft.pending!.questionId) + 1}题原提交尚待确认。<button disabled={busy} onClick={() => void answer(undefined, true)}>读取并恢复原提交</button></p>}
    {(practiceDraft.pending || practiceDraft.rejected || practiceDraft.storageNotice) && <button onClick={practiceDraft.download}>下载选择与原提交副本</button>}
    {!practiceDraft.pending && !receipt && !!practiceDraft.choices[questionItem?.id]?.length && <button disabled={busy} onClick={() => practiceDraft.clear(questionItem.id)}>清空本题未提交选择</button>}
    </div>} questions={lesson.questions} answers={session.answers} questionIndex={questionIndex}
    selected={practiceDraft.choices} hinted={hinted} hintReceipts={session.hintReceipts} busy={busy || !practiceDraft.ready || !!practiceDraft.pending} standalone={standalone} lessonId={lesson.id} onIndex={setQuestionIndex}
    onSelect={practiceDraft.select}
    onSource={session.sourceCheckId?key=>{pause();setCheckSource(key);}:undefined}
    assessment={lesson.assessment} contentStatus={session.contentStatus} notice={standalone ? notice : undefined} onDismiss={() => setNotice('')} onCurrent={() => onNext(lesson.id, 'practice', true)} onLearn={id => onNext(id)}
    onHint={(id,level) => void hint(id,level)} onAnswer={disposition => void answer(disposition)}
    onClose={() => setExit(true)} onAssistant={() => { setShowChat(!showChat); setTab('history'); }}/>; }
  const subtitle = replySubtitle || (session.revealed ? classroomStepUnits(session,current)[session.sentenceCursor ?? 0]?.text : '准备好后，点击 ▶ 开始。');
  return <main className="cl-room" data-dots={dots} data-mobile={mobile} data-practice={standalonePractice} data-assistant={showChat} style={{ '--cl-chat-width': showChat ? chatWidth + 'px' : '0px' } as React.CSSProperties}>
    {standalonePractice && practice(true)}
    {checkSource&&<FrozenCheckSource sessionId={session.id} sourceKey={checkSource} onClose={()=>setCheckSource('')}/>}
    {visualOpen&&<VisualPanel session={session} visuals={visuals} onClose={()=>setVisualOpen(false)}/>}
    <section className="cl-board-area" aria-label="教学白板"><div className="cl-titlebar"><button aria-label="离开课堂" onClick={() => { pause(); setExit(true); }}><ClassroomIcon name="close"/></button>
      <button className="cl-title" data-classroom-tour="connection" onClick={() => setTab('history')}>{lesson.title}<span className="cl-signal" title="断点已同步"><ClassroomIcon name="signal" size={22}/></span></button></div>
      <div className="cl-board-tools"><button aria-label="缩小白板" onClick={() => setZoom(Math.max(50, zoom - 10))}>−</button><button aria-label="重置缩放" onClick={() => setZoom(100)}>{zoom}%</button><button aria-label="放大白板" onClick={() => setZoom(Math.min(180, zoom + 10))}>＋</button><i/>
        <button aria-label="上一页白板" onClick={() => {pause();setPage(Math.max(0, page - 1));}} disabled={page === 0}>‹</button><span>{Math.min(page + 1, pageCount)} / {pageCount}</span><button aria-label="下一页白板" onClick={() => {pause();setPage(Math.min(pageCount - 1, page + 1));}} disabled={page + 1 >= pageCount}>›</button><i/>
        <button className="cl-visual-tool" aria-label="补一张讲解图" title="为当前讲解补一张参考图" disabled={!session.revealed||standalonePractice} onClick={()=>{pause();setVisualOpen(true);}}><span aria-hidden="true">▧</span>配图</button><button data-classroom-tour="notes" aria-label="导出课堂笔记" onClick={()=>void exportNotes()}><ClassroomIcon name="share"/></button><button data-classroom-tour="settings" aria-label="课堂设置" onClick={() => setSettings(true)}><ClassroomIcon name="settings"/></button><button aria-label="切换对话面板" onClick={() => setShowChat(!showChat)}><ClassroomIcon name="panel"/></button></div>
      <div className="cl-mobile-tabs"><button onClick={() => setMobile('board')} data-active={mobile === 'board'}>白板</button><button onClick={() => { following.current = true; setMobile('chat'); }} data-active={mobile === 'chat'}>对话与练习</button></div>
      <div className="cl-board-scroll"><div className="cl-board-paper" data-handwriting={handwriting} style={{ zoom: zoom / 100 }}>
        {session.revealed === 0 && <div className="cl-board-welcome"><span>WELCOME TO YOUR WHITEBOARD</span><h1>{lesson.title}</h1><p>{lesson.objective}</p><button onClick={() => { pause(); setPlaying(true); }}>▶ 开始学习</button><small>概念 · 生活案例 · 误区辨析 · 新情境检查</small></div>}
        {lesson.steps.slice(page * 3, Math.min(session.revealed, (page + 1) * 3)).map((step, index) => <section className="cl-board-step" id={'board-' + step.id} key={step.id} data-current={step.id === current.id}>
          <span className="cl-step-phase">{String(page * 3 + index + 1).padStart(2, '0')} / {step.phase}</span>
          <BoardStep step={step} sentence={session.sentenceCursor ?? 0} full={step.id !== current.id} unitCount={classroomStepUnits(session,step).length} codeContext={{ownerUserId:session.ownerUserId,sessionId:session.id}} onExperiment={pause}/>
          {visuals.rows.filter(row=>row.selected&&row.stepId===step.id).map(row=><VisualImage key={row.id} row={row}/>)}
        </section>)}
        {session.messages.filter(message => message.board?.page === page).map(message => <section className="cl-board-step cl-ai-board" key={message.id} id={'board-' + message.id}>
          <span className="cl-step-phase">AI 补充 · 回到问题本身</span><ReplyBoard message={message} onInteract={pause}
            throughUnitId={replyUnit?.messageId===message.id&&expandedReply!==message.id?replyUnit.unitId:undefined} onExpand={()=>setExpandedReply(message.id)}/></section>)}
      </div></div>
      <footer className="cl-board-footer"><button data-classroom-tour="sound" aria-label={muted ? '开启讲解声音' : '静音讲解'} onClick={() => { pause(); setMuted(!muted); }} disabled={!session.speech.available}><ClassroomIcon name={muted ? "muted" : "volume"}/></button>
        <p className="cl-subtitle" aria-live="off" data-sentence={session.sentenceCursor ?? 0}>{subtitle}</p></footer>
    </section>
    {showChat && <><div className="cl-divider" role="separator" aria-label="调整对话面板宽度" aria-orientation="vertical" aria-valuenow={chatWidth} aria-valuemin={320} aria-valuemax={650} tabIndex={0}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (event.buttons === 1) setChatWidth(Math.max(320, Math.min(650, window.innerWidth - event.clientX - 20))); }}
      onKeyDown={event => { if (event.key === 'ArrowLeft') setChatWidth(Math.min(650, chatWidth + 20)); if (event.key === 'ArrowRight') setChatWidth(Math.max(320, chatWidth - 20)); }}/>
      <aside className="cl-chat-panel"><header data-classroom-tour="history"><b><ClassroomIcon name="chat"/> Chat history</b><button aria-label="隐藏对话面板" onClick={() => setShowChat(false)}><ClassroomIcon name="close" size={18}/></button></header>
        <div className="cl-chat-tabs" role="tablist" aria-label="课堂内容">{(['history', 'practice', 'project'] as const).map((value, index) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => { setTab(value); if (value !== 'history') setPlaying(false); }}>{['讲解与插问', '课堂练习', '单元项目'][index]}</button>)}</div>
        <div className="cl-history" aria-label="课堂对话历史" ref={historyElement} onScroll={event => {
          const target = event.currentTarget; following.current = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
        }}>
          {tab === 'history' && <>
            {lesson.generatedNotice&&<p className="cl-source-notice">{lesson.generatedNotice}</p>}
            {lesson.sourceReferences?.length&&<details className="cl-source-references"><summary>核对本课来源（{lesson.sourceReferences.length}）</summary>{lesson.sourceReferences.map((reference,index)=><article key={index}>{session.sourceCheckId?<button onClick={()=>{pause();setCheckSource(reference.sourceKey);}}>{reference.title} · 来源 {reference.page} ↗</button>:<Link href={reference.href}>{reference.title} · 来源 {reference.page} ↗</Link>}<p>{reference.quote}</p></article>)}</details>}
            {standalonePractice && <p className="cl-practice-assistant-note">需要提示或解释时可以问我。我会帮你分析概念和条件，请先保留自己的判断。</p>}
            {!standalonePractice && !session.revealed && <div className="cl-history-empty"><small>SESSION OUTLINE</small><h2>{lesson.title}</h2><p>{lesson.objective}</p><ol>{lesson.steps.map(step => <li key={step.id}>{step.title}</li>)}</ol></div>}
            {!standalonePractice && lesson.steps.slice(0, session.revealed).map((step, index) => <article className="cl-teacher-turn" key={step.id} data-current={step.id === current.id}><small>{index === 0 ? time(session.createdAt) : 'TEACHER'}</small>{classroomStepUnits(session,step).slice(0, step.id === current.id ? (session.sentenceCursor ?? 0) + 1 : undefined).map((unit, line) => <p key={unit.id} className="cl-transcript-line">{unit.text}</p>)}
              <button className="cl-board-link" onClick={() => void selectBoard(step.id,Math.floor(index / 3))}>♧ {step.title}</button></article>)}
            {session.messages.map(message => <article className="cl-chat-turn" key={message.id} data-role={message.role}><small>{message.role === 'user' ? '我' : '老师'} · {time(message.at)}</small><p>{message.content}</p>{message.modelName && <small>{message.modelName}</small>}
              {message.board && <button className="cl-board-link" onClick={() => void selectBoard(message.id,message.board!.page)}>♧ {message.board.title}</button>}
              {message.role === 'assistant' && <div className="cl-reply-reading-controls">{readingReply===message.id?<button className="cl-read-reply" onClick={pause}>{replyReadingMode==='audio'?'■ 停止朗读':'■ 停止阅读'}</button>:<><button className="cl-read-reply" onClick={()=>void readReply(message.id,'text')}>按句阅读这段回答</button>{session.speech.available&&<button className="cl-read-reply" onClick={()=>void readReply(message.id,'audio')}>♪ 朗读这段回答</button>}</>}</div>}</article>)}
            <div className="cl-speaking" role="status">{busy ? '● 正在思考你的问题…' : readingReply ? replyReadingMode==='audio'?'● 正在朗读回答…':'● 正在按句阅读…' : playing ? '● ' + audioState : '••• Paused'}{session.status === 'completed' ? ' · 讲解已读' : ''}</div>
          </>}
          {tab === 'practice' && <><button className="cl-expand-practice" onClick={() => { pause(); setStandalonePractice(true); setShowChat(false); setTab('history'); }}>展开独立练习 ↗</button>{practice(false)}</>}
          {tab === 'project' && <div className="cl-project-editor"><small>COMMUNITY PROJECT</small><h2>{unit?.project.title ?? '把知识带到新情境'}</h2><p>{unit?.project.brief ?? '写一个新的例子，说明你使用了什么概念，以及还需要哪些证据。'}</p><ul>{unit?.project.rubric.map(item => <li key={item}>{item}</li>)}</ul>
            {session.projectHref && <Link className="ws-open-activity" href={session.projectHref}>打开分阶段项目、量规与提交历史 →</Link>}<p>下面保留原课堂草稿；可在项目工作区主动带入参考区。</p>
            <label>我的项目草稿<textarea value={projectDraft} maxLength={20000} onChange={event => { setProjectDraft(event.target.value); setProjectSaved(false); }}/></label>
            <button disabled={busy} onClick={() => { pause(); setBusy(true); void save({ projectDraft }).then(() => setProjectSaved(true)).catch(error => setNotice(error.message)).finally(() => setBusy(false)); }}>保存项目草稿</button>
            <button disabled={busy || !projectDraft.trim()} onClick={() => { pause(); setBusy(true); void save({ projectDraft }).then(() => { setProjectSaved(true); setQuestion('请按事实与推断、概念运用、替代解释、证据局限四方面核对我的项目草稿，指出下一步需要验证什么。'); setTab('history'); }).catch(error => setNotice(error.message)).finally(() => setBusy(false)); }}>请老师核对草稿</button>{projectSaved && <p role="status">草稿已保存，重新打开仍可继续。</p>}
          </div>}
        </div>
        <div className="cl-room-notice" role="status">{session.contentStatus && session.contentStatus !== 'current' && !standalonePractice && <span>正在查看保留的旧版课堂，内容与作答按当时版本保存。{session.contentStatus === 'archived' && <button onClick={() => onNext(lesson.id, 'history', true)}>打开新版讲解</button>}</span>}{notice}{notice && <button onClick={() => setNotice('')} aria-label="关闭提示">×</button>}{notice.includes('语音') && <button onClick={() => { setMuted(true); setPlaying(true); setNotice('已切到文字讲解。'); }}>文字继续</button>}</div>
        <div className="cl-session-navigation"><button onClick={() => { pause(); setTab('history'); void save(latest=>({cursor:Math.max(0,latest.cursor-1)})).then(value => setPage(Math.floor(value.cursor / 3))).catch(error => setNotice(error.message)); }} disabled={session.cursor === 0 || busy}>‹ 上一步</button>
          <span>{session.cursor + 1} / {lesson.steps.length}</span><button onClick={() => void advance()} disabled={busy}>下一步 ›</button>{session.status === 'completed' && nextLesson && <button onClick={() => onNext(nextLesson.id)}>下一课 →</button>}</div>
        <ClassroomTurnStatus state={turns} onReturn={turn=>void returnToTurn(turn)} onEdit={command=>{setQuestion(command.message);setIntent(command.intent);setModelId(command.modelId);}}/>
        <form className="cl-input" onSubmit={event => void ask(event)}><ClassroomIntentPicker value={intent} disabled={busy} onChange={(value,prompt)=>{pause();setIntent(value);if(prompt)setQuestion(prompt);}}/><div className="cl-compose-row"><textarea aria-label="向课堂老师提问" value={question} placeholder="Ask a question…" maxLength={2000} onChange={event => { if (playing) setPlaying(false); setQuestion(event.target.value); }}/>
          <button data-classroom-tour="microphone" type="button" title="语音转写" aria-label={listening ? '停止语音输入' : '语音提问'} onClick={microphone} data-listening={listening}>♩</button>
          <button data-classroom-tour="playback" type="button" aria-label={playing ? '暂停讲解' : '继续讲解'} disabled={busy} onClick={() => { const resume = !playing; pause(); setTab('history'); setPlaying(resume); }}>{playing ? 'Ⅱ' : '▷'}</button>
          {question.trim() ? <button type="submit" aria-label="发送课堂问题" disabled={busy||!turns.loaded||Boolean(turns.uncertain)}>↑</button> : <button type="button" aria-label="停止课堂讲解" onClick={pause}>■</button>}</div>
          <XiaojiuModelPicker catalog={catalog} value={modelId} onChange={setModelId} compact disabled={busy}/></form>
      </aside></>}
    {!showChat && !standalonePractice && <button className="cl-show-chat" onClick={() => setShowChat(true)}>打开对话与控制 ▤</button>}
    {settings && <WorkspaceDialog onClose={()=>{pause();setSettings(false);}}><div className="cl-modal-backdrop"><section className="cl-settings" role="dialog" aria-modal="true" aria-label="课堂设置"><header><h2>Session settings</h2><button aria-label="关闭课堂设置" onClick={() => setSettings(false)}>×</button></header>
      <h3>VOICE OPTIONS <span>{session.speech.available ? session.speech.voices.find(item => item.id === voice)?.label ?? 'AI 语音' : '文字讲解'}</span></h3><div className="cl-voice-grid" role="radiogroup" aria-label="课堂音色">{visibleVoices.map((item, index) => <div className="cl-voice-choice" key={item.id} data-active={voice === item.id}>
        <button className="cl-voice-select" role="radio" aria-checked={voice === item.id} onClick={() => setVoice(item.id)} onKeyDown={event => {
          if (!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown'].includes(event.key)) return; event.preventDefault();
          const next = (index + (['ArrowRight','ArrowDown'].includes(event.key) ? 1 : -1) + visibleVoices.length) % visibleVoices.length;
          setVoice(visibleVoices[next].id); event.currentTarget.closest('.cl-voice-grid')?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
        }}><span className="cl-voice-wave" aria-hidden="true">{[5,10,14,8,12].map((height,index) => <i key={index} style={{height}}/>)}</span><span><b>{item.classroomPreset?presetNames[item.classroomPreset]:item.label}</b><small><span>{item.description??((session.speech.provider==='openai'?'OpenAI':'MiniMax')+' · '+item.label)}</span>{item.language&&<span>{item.language}</span>}</small></span></button>
        <button className="cl-voice-preview" aria-label={(voicePreview.active === item.id ? '停止试听：' : '试听音色：') + item.label} disabled={!canPreview} onClick={() => void voicePreview.toggle(item.id,previewMode)}><ClassroomIcon name={voicePreview.active === item.id ? 'stop' : 'play'} size={12}/></button>
        {voice === item.id && <i aria-hidden="true">✓</i>}</div>)}</div>
      {!!extraVoices.length&&<div className="cl-extra-voices"><label>其他可用音色<select aria-label="其他可用音色" value={extraVoices.some(item=>item.id===voice)?voice:''} onChange={event=>{if(event.target.value)setVoice(event.target.value);}}><option value="" disabled>选择其他音色</option>{extraVoices.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><button disabled={!canPreview||!extraVoices.some(item=>item.id===voice)} onClick={()=>void voicePreview.toggle(voice,previewMode)}>试听所选音色</button></div>}
      {session.speech.preview&&<div className="cl-preview-modes" role="group" aria-label="试听内容"><button aria-pressed={previewMode==='neutral'} onClick={()=>{voicePreview.stop();setPreviewMode('neutral');}}>音色样本</button><button aria-pressed={previewMode==='current'} disabled={session.revealed<=session.cursor} onClick={()=>{voicePreview.stop();setPreviewMode('current');}}>当前句</button></div>}
      {session.speech.available && <p className="cl-preview-notice" role="status">{voicePreview.notice || (previewMode==='neutral'&&session.speech.preview?'试听固定中性句，比较声音后再选择；所选音色和学习进度保持原样。':session.revealed > session.cursor ? '试听已出现的当前句，所选音色与学习进度保持原样。' : '开始讲解后，可以试听已出现的当前句。')}</p>}
      {!session.speech.available && <p>当前未配置云端语音，课程仍可逐步阅读。</p>}
      <h3>VOICE SPEED <span>{speed}×</span></h3><input className="cl-speed-slider" type="range" min="0" max="5" step="1" aria-label="课堂语速" aria-valuetext={speed + '倍速'} value={[0.5,0.75,1,1.25,1.5,2].indexOf(speed)}
        style={{'--cl-rate-percent': ([0.5,0.75,1,1.25,1.5,2].indexOf(speed) * 20) + '%'} as React.CSSProperties} onChange={event => setSpeed([0.5,0.75,1,1.25,1.5,2][Number(event.target.value)])}/>
      <div className="cl-speed-grid">{[0.5, 0.75, 1, 1.25, 1.5, 2].map(value => <button key={value} data-active={speed === value} onClick={() => setSpeed(value)}>{value}×</button>)}</div>
      <h3>BOARD FONT</h3><div className="cl-font-grid"><button data-active={handwriting} onClick={() => setHandwriting(true)}><b className="cl-handwriting">Aa Bb</b><span>Handwriting</span></button><button data-active={!handwriting} onClick={() => setHandwriting(false)}><b>Aa Bb</b><span>Standard</span></button></div>
      <h3>DISPLAY</h3><button className="cl-toggle" role="switch" aria-checked={dots} onClick={() => setDots(!dots)}><div><b>Background dots</b><small>白板背后的点阵背景</small></div><span data-checked={dots}/></button>
      <h3>HELP</h3><button className="cl-toggle" onClick={openTour}><div><b>Replay the tour</b><small>重新了解课堂里的七个常用控件</small></div>↗</button>
      <CaptionUpgradeControl state={captions}/>
      <button className="cl-print" onClick={()=>void exportNotes('markdown')}>导出 Markdown 文字笔记</button>
      <button className="cl-print" disabled={printBusy||captions.busy} onClick={()=>void printNotes()}>{printBusy?'正在准备参考图…':'打印 / 保存 PDF 笔记'}</button>{printBusy&&<p role="status">参考图完整读取后会打开打印。关闭设置可取消等待。</p>}<p className="cl-settings-note">音色在下一句生效，倍速同步当前音频。暂停后会从当前句开头继续。</p>
    </section></div></WorkspaceDialog>}
    {tourOpen && <ClassroomToolTour onClose={finishTour} onStep={tourStep}/>}
    {exit && <div className="cl-modal-backdrop"><section className="cl-exit-dialog" role="dialog" aria-modal="true" aria-label="离开课堂确认"><h2>要暂时离开课堂吗？</h2><p>已读步骤与插问已保存。项目草稿也会在离开前保存。</p><footer><button autoFocus onClick={() => setExit(false)}>继续学习</button><button disabled={busy} onClick={() => { setBusy(true); void save({ projectDraft }).then(onClose).catch(error => { setNotice(error.message); setBusy(false); setExit(false); }); }}>保存并离开</button></footer></section></div>}
    {award && <div className="cl-modal-backdrop"><section className="cl-award" role="dialog" aria-modal="true" aria-label="课堂学习里程碑"><span>✧</span><small>YOU FINISHED A LESSON</small><h2>{lesson.title}</h2><p>已走完这段概念路线。接下来用新的情境检查理解，看看哪些地方还需要回顾。</p><button autoFocus onClick={() => { setAward(false); setTab('practice'); }}>去检查理解 →</button><button onClick={() => setAward(false)}>稍后再做</button></section></div>}
    <article className="cl-print-notes"><h1>{lesson.title}</h1><p>{lesson.objective}</p>{lesson.steps.slice(0, session.revealed).map(step => <section key={step.id}><BoardStep step={step} sentence={0} full print/>{visuals.rows.filter(row=>row.selected&&row.stepId===step.id).map(row=><VisualImage key={row.id} row={row}/>)}</section>)}
      <h2>课堂插问</h2>{session.messages.map(message => <section key={message.id}><p><b>{message.role === 'user' ? '我：' : '老师：'}</b>{message.content}</p>{message.board && <ReplyBoard message={message} print/>}</section>)}<h2>项目草稿</h2><p>{projectDraft}</p></article>
  </main>;
}

'use client';
import * as React from 'react';
import Link from 'next/link';
import type { ClassroomCatalog, ClassroomLesson, ClassroomSessionView, ClassroomUnit } from '@study-agent/contracts';
import { classroomSentences } from '@study-agent/contracts';
import { apiBaseUrl, apiRequest } from '../../../lib/api';
import { useSessionUser } from '../../../lib/session-user';
import { XiaojiuModelPicker, useXiaojiuModels } from '../../../components/xiaojiu-model-picker';
import { ClassroomFigure, CourseCover } from './diagram';
import { BoardStep } from './board-step';
import { PracticePanel } from './practice-panel';
import { ClassroomIcon } from './icons';
import './classroom.css';

const tour = [
  ['连接与断点', '左上角显示课堂状态。离开后再回来，会恢复已经保存的讲解位置。'],
  ['笔记与回顾', '导出包含已讲内容与插问的 Markdown；也可以用打印功能保存 PDF。'],
  ['音色与倍速', '设置中切换音色、语速、白板字体与点阵。声音按句播放，句子结束后继续下一步。'],
  ['静音阅读', '静音后老师仍会按阅读节奏展示板书；也可以用下一步按自己的节奏学习。'],
  ['随时插问', '输入问题会暂停讲解。麦克风只在你主动开启时工作，转写后仍由你确认发送。'],
  ['立即停止', '停止会中断声音、待返回请求和自动步进。点击继续即可回到原来的讲解步骤。'],
  ['对话历史', '老师讲过的内容和你的插问都在右侧。点击板书标题可定位对应内容。'],
];

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
  const [catalog, setCatalog] = React.useState<ClassroomCatalog | null>(null), [unitIndex, setUnitIndex] = React.useState(0);
  const [session, setSession] = React.useState<ClassroomSessionView | null>(null), [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false), [panel, setPanel] = React.useState<'units' | 'materials' | 'practices'>('units');
  const [initialTab, setInitialTab] = React.useState<'history' | 'practice' | 'project'>('history');
  const [expanded, setExpanded] = React.useState<string[]>([]);
  const studio = React.useRef<string | undefined>(undefined), loadController = React.useRef<AbortController | null>(null);
  const refresh = React.useCallback(async () => {
    if (!identity || identity.role === 'student') return;
    try { setCatalog(await apiRequest<ClassroomCatalog>('/learning/classroom/catalog')); }
    catch (caught) { setError((caught as Error).message); }
  }, [identity]);
  const open = React.useCallback(async (lessonId: string, tab: 'history' | 'practice' | 'project' = 'history', studioCourseId?: string) => {
    loadController.current?.abort(); const controller = new AbortController(); loadController.current = controller;
    setLoading(true); setError('');
    try {
      const row = await apiRequest<ClassroomSessionView>('/learning/classroom/sessions', { method: 'POST',
        signal: controller.signal, body: JSON.stringify({ lessonId, ...(studioCourseId ? { studioCourseId } : {}) }) });
      if (controller.signal.aborted) return;
      setInitialTab(tab); setSession(row); studio.current = studioCourseId;
      const query = new URLSearchParams({ lesson: lessonId, tab }); if (studioCourseId) query.set('studioCourseId', studioCourseId);
      window.history.replaceState(null, '', '/studio/classroom?' + query);
    } catch (caught) { if (!controller.signal.aborted) setError((caught as Error).message); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);
  React.useEffect(() => {
    if (!identity) return;
    void refresh();
    const params = new URLSearchParams(window.location.search), id = params.get('lesson');
    if (id) void open(id, params.get('tab') === 'practice' ? 'practice' : params.get('tab') === 'project' ? 'project' : 'history', params.get('studioCourseId') ?? undefined);
    return () => loadController.current?.abort();
  }, [identity, refresh, open]);
  React.useEffect(() => {
    const first = catalog?.course.units[unitIndex]?.lectures[0]; if (first) setExpanded([first.id]);
  }, [catalog, unitIndex]);
  function close() {
    setSession(null); window.history.replaceState(null, '', studio.current ? '/studio?course=' + encodeURIComponent(studio.current) : '/studio/classroom');
    if (studio.current) window.location.assign('/studio?course=' + encodeURIComponent(studio.current));
    else void refresh();
  }
  if (identity === undefined) return <div className="cl-loading" role="status">正在打开教学课堂…</div>;
  if (!identity) return <div className="cl-gate"><h1>让学习，发生在一间真正的课堂里。</h1><p>登录后保存课程、讲解断点和插问。</p><Link href="/parent/login">登录学习工作台 →</Link></div>;
  if (session) return <ClassroomSession key={session.id} initial={session} initialTab={initialTab} unit={catalog?.course.units.find(unit =>
    unit.lectures.some(lecture => lecture.lessons.some(lesson => lesson.id === session.lessonId)) || session.lessonId === 'unit-exam:' + unit.id)}
    onClose={close} onNext={id => void open(id)} />;
  const course = catalog?.course, unit = course?.units[unitIndex];
  const progress = new Map(catalog?.progress.map(row => [row.lessonId, row]) ?? []);
  function state(id: string) { const row = progress.get(id); return row?.completed ? 'viewed' as const : row ? 'started' as const : 'new' as const; }
  const next = course?.units.flatMap(unit => unit.lectures.flatMap(lecture => lecture.lessons)).find(lesson => !progress.get(lesson.id)?.completed);
  return <main className="cl-shell">
    <nav className="cl-rail" aria-label="课堂导航"><Link href="/studio" className="cl-brand" aria-label="StudyAgent 工作台">S</Link>
      <Link href="/studio" title="Home">⌂</Link><Link href="/studio?view=courses" title="Courses">♧</Link>
      <Link href="/studio?view=calendar" title="Calendar">▦</Link><Link href="/studio?view=history" title="History">◷</Link>
      <span className="cl-rail-bottom">学习</span></nav>
    <div className="cl-course-layout"><aside className="cl-course-sidebar"><Link className="cl-exit-course" href="/studio">× <span>Exit Course</span></Link>
      <CourseCover /><div className="cl-curator"><span>S</span><div><small>curated by</small><b>StudyAgent Learning Studio</b></div></div>
      <h1>{course?.title ?? '教学课堂'}</h1><p>{course?.description}</p><details><summary>Show more</summary><p>{course?.provenance}</p><p>60 个微课 · 15 个讲座 · 5 个单元项目</p></details>
      <div className="cl-panel-label">PANEL</div><div className="cl-course-tabs" role="tablist" aria-label="课程面板">
        {(['units', 'materials', 'practices'] as const).map((item, index) => <button key={item} role="tab" aria-selected={panel === item} onClick={() => setPanel(item)}>{['☷ Units', '▤ Materials', '✎ Practices'][index]}</button>)}
      </div><div className="cl-unit-nav">{course?.units.map((item, index) => <button key={item.id} data-active={unitIndex === index} onClick={() => setUnitIndex(index)}><b>{index + 1}</b>{item.title}</button>)}</div>
    </aside><section className="cl-outline">
      {error && <div className="cl-error" role="alert">{error}<button onClick={() => void refresh()}>重试</button></div>}
      {loading && <div className="cl-open-status" role="status">正在恢复课堂…</div>}
      {identity.role === 'student' && !loading && <div className="cl-empty">请从你的学习课程中打开已审核微课。<Link href="/studio">返回课程</Link></div>}
      {course && unit && <>
        <Link className="cl-extend" href="/studio?view=materials"><span>▤</span><div><b>把自己的资料带进课堂</b><small>PDF、页级阅读、个性化学案与白板</small></div><span>↗</span></Link>
        <div className="cl-legend"><span><Ring state="viewed"/>讲解已读</span><span><Ring state="started"/>已接触</span><span><Ring/>未开始</span><span>▣ Project</span><span>♙ Exam</span></div>
        <div className="cl-status-strip">{unit.lectures.flatMap(lecture => lecture.lessons).map(lesson => <button key={lesson.id} title={lesson.title} onClick={() => void open(lesson.id)}><Ring state={state(lesson.id)}/></button>)}
          <button title="单元项目" onClick={() => void open('unit-exam:' + unit.id, 'project')}>▣</button><button title="单元核查" onClick={() => void open('unit-exam:' + unit.id, 'practice')}>♙</button></div>
        {next && <button className="cl-next" onClick={() => void open(next.id)}>▶ <span>Next: {next.title}</span> ›</button>}
        <div className="cl-unit-heading"><small>UNIT {unitIndex + 1} OF {course.units.length}</small><h2>Unit {unitIndex + 1}: {unit.title}</h2><p>{unit.objective}</p></div>
        {panel === 'materials' ? <div className="cl-card"><h2>References & Materials</h2><p>自编讲解以通用概念和匿名情境教学。以下为开放的进一步阅读入口，未逐节宣称页码引用。</p>
          {course.references.map(reference => <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer">{reference.title} ↗</a>)}
          <Link href="/studio?view=materials">打开我的 PDF 与学案 →</Link></div> : <div className="cl-timeline">
          {unit.lectures.map((lecture, index) => <article className="cl-lecture" key={lecture.id}>
            <span className="cl-timeline-icon">♧</span><header><button onClick={() => setExpanded(rows => rows.includes(lecture.id) ? rows.filter(id => id !== lecture.id) : [...rows, lecture.id])} aria-expanded={expanded.includes(lecture.id)}>
              Lecture {index + 1}: {lecture.title}</button><button className="cl-assist" onClick={() => void open(lecture.lessons[0].id)}>▤ Get Assistance</button></header>
            <p>{lecture.description}</p>
            {(expanded.includes(lecture.id) || panel === 'practices') && <div className="cl-microlessons">{lecture.lessons.map(lesson => <div className="cl-micro" key={lesson.id}>
              <span>{lesson.title}<small>{lesson.objective}</small></span><button className="cl-learn" disabled={loading} onClick={() => void open(lesson.id)}>{progress.has(lesson.id) ? '▶ Resume' : '▶ Learn'}</button>
              <button className="cl-practice" disabled={loading} onClick={() => void open(lesson.id, 'practice')}>♧ Practice</button><Ring state={state(lesson.id)}/>
            </div>)}</div>}
          </article>)}
          <article className="cl-lecture cl-project"><span className="cl-timeline-icon">▣</span><small>PROJECT · {unitIndex + 1} / 5</small><h3>{unit.project.title}</h3><p>{unit.project.brief}</p><button onClick={() => void open('unit-exam:' + unit.id, 'project')}>Start →</button></article>
          <article className="cl-lecture cl-exam"><span className="cl-timeline-icon">♙</span><small>UNIT CHECK</small><h3>{unit.title}综合核查</h3><p>覆盖本单元的 12 个主题。{unitIndex === 0 ? '16' : '12'} 道复盘题保留首次作答、跳过与提示记录。</p><button onClick={() => void open('unit-exam:' + unit.id, 'practice')}>Start →</button></article>
        </div>}
      </>}
    </section></div>
  </main>;
}

type SpeechRecognitionSession = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null };

function ClassroomSession({ initial, initialTab, unit, onClose, onNext }: { initial: ClassroomSessionView;
  initialTab: 'history' | 'practice' | 'project'; unit?: ClassroomUnit; onClose: () => void; onNext: (id: string) => void }) {
  const [session, setSession] = React.useState(initial), row = React.useRef(initial);
  const [playing, setPlaying] = React.useState(false), [muted, setMuted] = React.useState(!initial.speech.available);
  const [speed, setSpeed] = React.useState(1), [voice, setVoice] = React.useState(initial.speech.defaultVoice ?? '');
  const [dots, setDots] = React.useState(true), [handwriting, setHandwriting] = React.useState(true), [zoom, setZoom] = React.useState(100);
  const [page, setPage] = React.useState(0), [chatWidth, setChatWidth] = React.useState(360), [mobile, setMobile] = React.useState<'board' | 'chat'>('board');
  const [settings, setSettings] = React.useState(false), [exit, setExit] = React.useState(false), [tourIndex, setTourIndex] = React.useState<number | null>(null);
  const [standalonePractice, setStandalonePractice] = React.useState(initialTab === 'practice');
  const [tab, setTab] = React.useState<'history' | 'practice' | 'project'>(initialTab === 'practice' ? 'history' : initialTab), [question, setQuestion] = React.useState(''), [busy, setBusy] = React.useState(false), [notice, setNotice] = React.useState('');
  const [projectDraft, setProjectDraft] = React.useState(initial.projectDraft), [projectSaved, setProjectSaved] = React.useState(false);
  const [selected, setSelected] = React.useState<Record<string, number>>({}), [hinted, setHinted] = React.useState<string[]>(initial.hintedQuestionIds ?? []), [questionIndex, setQuestionIndex] = React.useState(0);
  const [audioState, setAudioState] = React.useState(''), [listening, setListening] = React.useState(false);
  const [readingReply, setReadingReply] = React.useState(''), [award, setAward] = React.useState(false);
  const [replySubtitle, setReplySubtitle] = React.useState('');
  const replyAudio = React.useRef<{ abort: AbortController; audio: HTMLAudioElement | null; url: string } | null>(null);
  const recognition = React.useRef<SpeechRecognitionSession | null>(null), [showChat, setShowChat] = React.useState(initialTab !== 'practice');
  const { catalog, modelId, setModelId } = useXiaojiuModels();
  const revisionQueue = React.useRef<Promise<unknown>>(Promise.resolve()), chatAbort = React.useRef<AbortController | null>(null);
  const cloudAudio = React.useRef<HTMLAudioElement | null>(null), cache = React.useRef(new Map<string, Blob>());
  const historyElement = React.useRef<HTMLDivElement | null>(null), following = React.useRef(true);
  const speedRef = React.useRef(speed), voiceRef = React.useRef(voice), mutedRef = React.useRef(muted), mounted = React.useRef(true);
  speedRef.current = speed; voiceRef.current = voice; mutedRef.current = muted;
  const lesson = session.lesson, current = lesson.steps[session.cursor], pageCount = Math.max(1, Math.ceil(session.revealed / 3));
  function receive(value: ClassroomSessionView) { row.current = value; if (mounted.current) { setSession(value); if (value.hintedQuestionIds?.length) setHinted(items => [...new Set([...items, ...value.hintedQuestionIds!])]); } return value; }
  function save(update: Partial<Pick<ClassroomSessionView, 'cursor' | 'revealed' | 'projectDraft' | 'sentenceCursor'>> & { completed?: boolean }) {
    const task = revisionQueue.current.catch(() => undefined).then(async () => {
      const latest = row.current;
      return receive(await apiRequest<ClassroomSessionView>('/learning/classroom/sessions/' + latest.id, { method: 'PATCH',
        body: JSON.stringify({ expectedRevision: latest.revision, cursor: latest.cursor, revealed: latest.revealed, ...update }) }));
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
      if (!localStorage.getItem('studyagent.classroom.tour')) setTourIndex(0);
    } catch { /* Optional UI preferences never prevent a lesson. */ }
    setPage(Math.max(0, Math.floor(initial.cursor / 3)));
    return () => { mounted.current = false; chatAbort.current?.abort(); recognition.current?.abort(); replyAudio.current?.abort.abort(); replyAudio.current?.audio?.pause(); if (replyAudio.current?.url) URL.revokeObjectURL(replyAudio.current.url); };
  }, [initial]);
  React.useEffect(() => {
    try { localStorage.setItem('studyagent.classroom.preferences', JSON.stringify({ speed, voice, dots, handwriting })); } catch { /* Optional. */ }
    if (cloudAudio.current) cloudAudio.current.playbackRate = speed;
    if (replyAudio.current?.audio) replyAudio.current.audio.playbackRate = speed;
  }, [speed, voice, dots, handwriting]);
  React.useEffect(() => {
    if (following.current && historyElement.current) historyElement.current.scrollTop = historyElement.current.scrollHeight;
  }, [session.revealed, session.messages.length, session.cursor, session.sentenceCursor, playing]);
  React.useEffect(() => {
    if (page !== Math.floor(session.cursor / 3) || session.revealed <= session.cursor || standalonePractice) return;
    const frame = requestAnimationFrame(() => {
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
    const abort = new AbortController();
    async function play() {
      const index = row.current.cursor, step = row.current.lesson.steps[index];
      await save({ revealed: Math.max(row.current.revealed, index + 1) });
      if (cancelled) return;
      setPage(Math.floor(index / 3));
      const sentences = classroomSentences(step.narration), startSentence = row.current.sentenceCursor ?? 0;
      const pending = new Map<string, Promise<Blob>>();
      function loadSentence(sentenceIndex: number): Promise<Blob> {
        const key = step.id + ':' + sentenceIndex + ':' + voiceRef.current;
        const cached = cache.current.get(key); if (cached) return Promise.resolve(cached);
        if (!pending.has(key)) pending.set(key, (async () => {
          const response = await fetch(apiBaseUrl + '/api/learning/classroom/sessions/' + row.current.id + '/narration/' + encodeURIComponent(step.id), {
            method: 'POST', credentials: 'include', signal: abort.signal, headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voice: voiceRef.current || undefined, sentenceIndex }) });
          if (!response.ok) throw new Error('语音暂时不可用。可以重试，或选择“文字继续”。');
          const blob = await response.blob();
          if (!blob.type.startsWith('audio/')) throw new Error('语音返回格式异常，请使用文字继续。');
          if (!cancelled) cache.current.set(key, blob);
          return blob;
        })());
        return pending.get(key)!;
      }
      for (let sentenceIndex = startSentence; sentenceIndex < sentences.length; sentenceIndex++) {
      if (cancelled) return;
      if (!mutedRef.current && row.current.speech.available) {
        setAudioState('正在准备声音…');
        const blob = await loadSentence(sentenceIndex);
        if (cancelled) return;
        // Prefetch one sentence, while display still waits for the current audio to end.
        if (sentenceIndex + 1 < sentences.length) void loadSentence(sentenceIndex + 1).catch(() => undefined);
        url = URL.createObjectURL(blob); audio = new Audio(url); cloudAudio.current = audio; audio.playbackRate = speedRef.current;
        await save({ sentenceCursor: sentenceIndex });
        if (cancelled) return;
        setAudioState('老师正在讲解');
        await new Promise<void>((resolve, reject) => { if (!audio) return resolve(); audio.onended = () => resolve();
          audio.onerror = () => reject(new Error('声音播放失败，请重试或文字继续。')); void audio.play().catch(reject); });
        if (url) URL.revokeObjectURL(url); url = ''; audio = null; cloudAudio.current = null;
      } else {
        await save({ sentenceCursor: sentenceIndex });
        if (cancelled) return;
        setAudioState('正在讲解');
        await new Promise<void>(resolve => { timer = setTimeout(resolve, Math.max(1600, sentences[sentenceIndex].length * 165) / speedRef.current); });
      }
      }
      if (cancelled) return;
      if (step.phase === 'check' && row.current.lesson.questions.some(question => !row.current.answers.some(answer => answer.questionId === question.id))) {
        setPlaying(false); setTab('practice'); setMobile('chat');
        setNotice('先停在这个检查点。独立判断或使用提示，提交后再点击下一步继续。');
        return;
      }
      if (index === row.current.lesson.steps.length - 1) {
        await save({ completed: true, revealed: row.current.lesson.steps.length });
        if (!cancelled) { setPlaying(false); setAward(true); setNotice('本节讲解已读。接下来用新情境练习，再决定需要回看哪一段。'); }
      } else await save({ cursor: index + 1 });
    }
    void play().catch(error => { if (!cancelled) { setNotice(error.message); setPlaying(false); } });
    return () => { cancelled = true; abort.abort(); if (timer) clearTimeout(timer); audio?.pause(); cloudAudio.current = null; if (url) URL.revokeObjectURL(url); setAudioState(''); };
    // Audio completion advances the persisted cursor. Display, mute and voice changes apply
    // at the next sentence; pause cancels the current sentence and any pending fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, session.cursor]);
  function pause() { setPlaying(false); chatAbort.current?.abort(); setBusy(false); recognition.current?.abort(); setListening(false);
    replyAudio.current?.abort.abort(); replyAudio.current?.audio?.pause(); if (replyAudio.current?.url) URL.revokeObjectURL(replyAudio.current.url); replyAudio.current = null; setReadingReply(''); setReplySubtitle(''); }
  async function readReply(messageId: string) {
    pause(); const operation = { abort: new AbortController(), audio: null as HTMLAudioElement | null, url: '' }; replyAudio.current = operation;
    setReadingReply(messageId);
    try {
      const message = row.current.messages.find(item => item.id === messageId);
      const sentences = classroomSentences(message?.content ?? '');
      for (let sentenceIndex = 0; sentenceIndex < sentences.length; sentenceIndex++) {
      const response = await fetch(apiBaseUrl + '/api/learning/classroom/sessions/' + row.current.id + '/narration/' + encodeURIComponent(messageId), {
        method: 'POST', credentials: 'include', signal: operation.abort.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voice: voice || undefined, sentenceIndex }) });
      if (!response.ok) throw new Error('回答语音暂时不可用，可以继续阅读文字。');
      const blob = await response.blob(); if (operation.abort.signal.aborted) return;
      operation.url = URL.createObjectURL(blob); operation.audio = new Audio(operation.url); operation.audio.playbackRate = speed;
      setReplySubtitle(sentences[sentenceIndex]);
      await new Promise<void>((resolve, reject) => { operation.audio!.onended = () => resolve(); operation.audio!.onerror = () => reject(new Error('回答播放失败')); void operation.audio!.play().catch(reject); });
      URL.revokeObjectURL(operation.url); operation.url = '';
      if (operation.abort.signal.aborted) return;
      }
      if (replyAudio.current === operation) { replyAudio.current = null; setReadingReply(''); setReplySubtitle(''); }
    } catch (error) { if (!operation.abort.signal.aborted) { setReadingReply(''); setNotice((error as Error).message); } }
  }
  async function advance() {
    if (busy) return;
    pause(); setBusy(true);
    try {
      const value = row.current, last = value.cursor >= lesson.steps.length - 1;
      const revealed = Math.max(value.revealed, value.cursor + 1), cursor = last ? value.cursor : value.cursor + 1;
      await save({ cursor, sentenceCursor: classroomSentences(lesson.steps[cursor].narration).length - 1,
        revealed: Math.max(revealed, cursor + 1), ...(last ? { completed: true } : {}) });
      setPage(Math.floor(cursor / 3));
      if (last && value.status !== 'completed') setAward(true);
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function ask(event: React.FormEvent) {
    event.preventDefault(); if (!question.trim() || busy) return;
    pause(); setBusy(true); setNotice(''); const message = question; const controller = new AbortController(); chatAbort.current = controller;
    try {
      await revisionQueue.current.catch(() => undefined);
      const value = await apiRequest<ClassroomSessionView>('/learning/classroom/sessions/' + row.current.id + '/messages', {
        method: 'POST', signal: controller.signal, body: JSON.stringify({ message, modelId, ...(standalonePractice && questionItem ? { questionId: questionItem.id } : {}), requestKey: crypto.randomUUID() }) });
      if (!controller.signal.aborted) { receive(value); setQuestion(''); setTab('history'); setMobile('chat'); setPage(Math.floor(value.cursor / 3)); setNotice('老师已补写这页白板。点击继续，回到原来的讲解。');
        requestAnimationFrame(() => document.getElementById('board-' + value.messages.at(-1)?.id)?.scrollIntoView({ block: 'nearest' })); }
    } catch (error) { if (!controller.signal.aborted) setNotice((error as Error).message); }
    finally { if (chatAbort.current === controller) { chatAbort.current = null; setBusy(false); } }
  }
  async function answer(selectedIndex: number | null) {
    const item = lesson.questions[questionIndex]; if (!item || busy) return;
    pause(); setBusy(true);
    try {
      await revisionQueue.current.catch(() => undefined);
      receive(await apiRequest<ClassroomSessionView>('/learning/classroom/sessions/' + row.current.id + '/answers', { method: 'POST',
        body: JSON.stringify({ questionId: item.id, selectedIndex, hintUsed: hinted.includes(item.id), requestKey: crypto.randomUUID() }) }));
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
  function exportNotes() {
    const source = ['# ' + lesson.title, '\n' + lesson.objective, ...lesson.steps.slice(0, session.revealed).map(step => '\n## ' + step.title + '\n\n' + step.blocks.filter(block => block.kind !== 'heading').map(block => block.items?.map(point => '- ' + point).join('\n') ?? (block.table ? [block.table.headers.join(' | '), ...block.table.rows.map(cells => cells.join(' | '))].join('\n') : block.image ? '![' + block.image.alt + '](' + block.image.src + ')' : block.text)).join('\n\n')),
      '\n## 课堂插问', ...session.messages.map(message => '\n**' + (message.role === 'user' ? '我' : '老师') + '** ' + message.content +
        (message.board ? '\n\n### ' + message.board.title + '\n' + message.board.points.map(point => '- ' + point).join('\n') +
          (message.board.diagram ? '\n\n' + message.board.diagram.title + '：' + message.board.diagram.labels.join(' / ') : '') : '')),
      '\n## 项目草稿\n' + projectDraft, '\n学习记录仅表示接触和本次课堂题目表现，不代表经过校准的能力掌握。'].join('\n');
    const url = URL.createObjectURL(new Blob([source], { type: 'text/markdown;charset=utf-8' })), anchor = document.createElement('a');
    anchor.href = url; anchor.download = lesson.title + '.md'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function finishTour() { setTourIndex(null); try { localStorage.setItem('studyagent.classroom.tour', 'done'); } catch { /* Optional. */ } }
  const questionItem = lesson.questions[questionIndex], receipt = session.answers.find(answer => answer.questionId === questionItem?.id);
  const nextLesson = unit?.lectures.flatMap(lecture => lecture.lessons).find((_, index, list) => list[index - 1]?.id === lesson.id);
  function practice(standalone: boolean) { return <PracticePanel questions={lesson.questions} answers={session.answers} questionIndex={questionIndex}
    selected={selected} hinted={hinted} busy={busy} standalone={standalone} lessonId={lesson.id} onIndex={setQuestionIndex}
    onSelect={(id, index) => setSelected(value => ({ ...value, [id]: index }))}
    onHint={id => setHinted(value => [...new Set([...value, id])])} onAnswer={index => void answer(index)}
    onClose={() => setExit(true)} onAssistant={() => { setShowChat(!showChat); setTab('history'); }}/>; }
  const subtitle = replySubtitle || (session.revealed ? classroomSentences(current.narration)[session.sentenceCursor ?? 0] : '准备好后，点击 ▶ 开始。');
  return <main className="cl-room" data-dots={dots} data-mobile={mobile} data-practice={standalonePractice} data-assistant={showChat} style={{ '--cl-chat-width': showChat ? chatWidth + 'px' : '0px' } as React.CSSProperties}>
    {standalonePractice && practice(true)}
    <section className="cl-board-area" aria-label="教学白板"><div className="cl-titlebar"><button aria-label="离开课堂" onClick={() => { pause(); setExit(true); }}><ClassroomIcon name="close"/></button>
      <button className="cl-title" onClick={() => setTab('history')}>{lesson.title}<span className="cl-signal" title="断点已同步"><ClassroomIcon name="signal" size={22}/></span></button></div>
      <div className="cl-board-tools"><button aria-label="缩小白板" onClick={() => setZoom(Math.max(50, zoom - 10))}>−</button><button aria-label="重置缩放" onClick={() => setZoom(100)}>{zoom}%</button><button aria-label="放大白板" onClick={() => setZoom(Math.min(180, zoom + 10))}>＋</button><i/>
        <button aria-label="上一页白板" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>‹</button><span>{Math.min(page + 1, pageCount)} / {pageCount}</span><button aria-label="下一页白板" onClick={() => setPage(Math.min(pageCount - 1, page + 1))} disabled={page + 1 >= pageCount}>›</button><i/>
        <button aria-label="导出课堂笔记" onClick={exportNotes}><ClassroomIcon name="share"/></button><button aria-label="课堂设置" onClick={() => setSettings(true)}><ClassroomIcon name="settings"/></button><button aria-label="切换对话面板" onClick={() => setShowChat(!showChat)}><ClassroomIcon name="panel"/></button></div>
      <div className="cl-mobile-tabs"><button onClick={() => setMobile('board')} data-active={mobile === 'board'}>白板</button><button onClick={() => setMobile('chat')} data-active={mobile === 'chat'}>对话与练习</button></div>
      <div className="cl-board-scroll"><div className="cl-board-paper" data-handwriting={handwriting} style={{ zoom: zoom / 100 }}>
        {session.revealed === 0 && <div className="cl-board-welcome"><span>WELCOME TO YOUR WHITEBOARD</span><h1>{lesson.title}</h1><p>{lesson.objective}</p><button onClick={() => { pause(); setPlaying(true); }}>▶ 开始学习</button><small>概念 · 生活案例 · 误区辨析 · 新情境检查</small></div>}
        {lesson.steps.slice(page * 3, Math.min(session.revealed, (page + 1) * 3)).map((step, index) => <section className="cl-board-step" id={'board-' + step.id} key={step.id} data-current={step.id === current.id}>
          <span className="cl-step-phase">{String(page * 3 + index + 1).padStart(2, '0')} / {step.phase}</span>
          <BoardStep step={step} sentence={session.sentenceCursor ?? 0} full={step.id !== current.id}/>
        </section>)}
        {session.messages.filter(message => message.board?.page === page).map(message => <section className="cl-board-step cl-ai-board" key={message.id} id={'board-' + message.id}>
          <span className="cl-step-phase">AI 补充 · 回到问题本身</span><h2><span>{message.board!.title}</span></h2>
          {message.board!.points.map((point, index) => <p className="cl-board-item" style={{ animationDelay: (index * 0.22) + "s" }} key={index}>{point}</p>)}
          {message.board!.diagram && <ClassroomFigure diagram={message.board!.diagram}/>}</section>)}
      </div></div>
      <footer className="cl-board-footer"><button aria-label={muted ? '开启讲解声音' : '静音讲解'} onClick={() => { pause(); setMuted(!muted); }} disabled={!session.speech.available}><ClassroomIcon name={muted ? "muted" : "volume"}/></button>
        <p className="cl-subtitle" aria-live="off" data-sentence={session.sentenceCursor ?? 0}>{subtitle}</p></footer>
    </section>
    {showChat && <><div className="cl-divider" role="separator" aria-label="调整对话面板宽度" aria-orientation="vertical" aria-valuenow={chatWidth} aria-valuemin={320} aria-valuemax={650} tabIndex={0}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (event.buttons === 1) setChatWidth(Math.max(320, Math.min(650, window.innerWidth - event.clientX - 20))); }}
      onKeyDown={event => { if (event.key === 'ArrowLeft') setChatWidth(Math.min(650, chatWidth + 20)); if (event.key === 'ArrowRight') setChatWidth(Math.max(320, chatWidth - 20)); }}/>
      <aside className="cl-chat-panel"><header><b><ClassroomIcon name="chat"/> Chat history</b><button aria-label="隐藏对话面板" onClick={() => setShowChat(false)}><ClassroomIcon name="close" size={18}/></button></header>
        <div className="cl-chat-tabs" role="tablist" aria-label="课堂内容">{(['history', 'practice', 'project'] as const).map((value, index) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => { setTab(value); if (value !== 'history') setPlaying(false); }}>{['讲解与插问', '课堂练习', '单元项目'][index]}</button>)}</div>
        <div className="cl-history" aria-label="课堂对话历史" ref={historyElement} onScroll={event => {
          const target = event.currentTarget; following.current = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
        }}>
          {tab === 'history' && <>
            {standalonePractice && <p className="cl-practice-assistant-note">需要提示或解释时可以问我。我会帮你分析概念和条件，请先保留自己的判断。</p>}
            {!standalonePractice && !session.revealed && <div className="cl-history-empty"><small>SESSION OUTLINE</small><h2>{lesson.title}</h2><p>{lesson.objective}</p><ol>{lesson.steps.map(step => <li key={step.id}>{step.title}</li>)}</ol></div>}
            {!standalonePractice && lesson.steps.slice(0, session.revealed).map((step, index) => <article className="cl-teacher-turn" key={step.id} data-current={step.id === current.id}><small>{index === 0 ? time(session.createdAt) : 'TEACHER'}</small>{classroomSentences(step.narration).slice(0, step.id === current.id ? (session.sentenceCursor ?? 0) + 1 : undefined).map((sentence, line) => <p key={line} className="cl-transcript-line">{sentence}</p>)}
              <button className="cl-board-link" onClick={() => { setPage(Math.floor(index / 3)); setMobile('board'); }}>♧ {step.title}</button></article>)}
            {session.messages.map(message => <article className="cl-chat-turn" key={message.id} data-role={message.role}><small>{message.role === 'user' ? '我' : '老师'} · {time(message.at)}</small><p>{message.content}</p>{message.modelName && <small>{message.modelName}</small>}
              {message.board && <button className="cl-board-link" onClick={() => { setPage(message.board!.page); setMobile('board'); requestAnimationFrame(() => document.getElementById('board-' + message.id)?.scrollIntoView({ block: 'nearest' })); }}>♧ {message.board.title}</button>}
              {message.role === 'assistant' && session.speech.available && <button className="cl-read-reply" onClick={() => readingReply === message.id ? pause() : void readReply(message.id)}>{readingReply === message.id ? '■ 停止朗读' : '♪ 朗读这段回答'}</button>}</article>)}
            <div className="cl-speaking" role="status">{busy ? '● 正在思考你的问题…' : readingReply ? '● 正在朗读回答…' : playing ? '● ' + audioState : '••• Paused'}{session.status === 'completed' ? ' · 讲解已读' : ''}</div>
          </>}
          {tab === 'practice' && <><button className="cl-expand-practice" onClick={() => { pause(); setStandalonePractice(true); setShowChat(false); setTab('history'); }}>展开独立练习 ↗</button>{practice(false)}</>}
          {tab === 'project' && <div className="cl-project-editor"><small>COMMUNITY PROJECT</small><h2>{unit?.project.title ?? '把知识带到新情境'}</h2><p>{unit?.project.brief ?? '写一个新的例子，说明你使用了什么概念，以及还需要哪些证据。'}</p><ul>{unit?.project.rubric.map(item => <li key={item}>{item}</li>)}</ul>
            <label>我的项目草稿<textarea value={projectDraft} maxLength={20000} onChange={event => { setProjectDraft(event.target.value); setProjectSaved(false); }}/></label>
            <button disabled={busy} onClick={() => { pause(); setBusy(true); void save({ projectDraft }).then(() => setProjectSaved(true)).catch(error => setNotice(error.message)).finally(() => setBusy(false)); }}>保存项目草稿</button>
            <button disabled={busy || !projectDraft.trim()} onClick={() => { pause(); setBusy(true); void save({ projectDraft }).then(() => { setProjectSaved(true); setQuestion('请按事实与推断、概念运用、替代解释、证据局限四方面核对我的项目草稿，指出下一步需要验证什么。'); setTab('history'); }).catch(error => setNotice(error.message)).finally(() => setBusy(false)); }}>请老师核对草稿</button>{projectSaved && <p role="status">草稿已保存，重新打开仍可继续。</p>}
          </div>}
        </div>
        <div className="cl-room-notice" role="status">{notice}{notice && <button onClick={() => setNotice('')} aria-label="关闭提示">×</button>}{notice.includes('语音') && <button onClick={() => { setMuted(true); setPlaying(true); setNotice('已切到文字讲解。'); }}>文字继续</button>}</div>
        <div className="cl-session-navigation"><button onClick={() => { pause(); setTab('history'); void save({ cursor: Math.max(0, session.cursor - 1) }).then(value => setPage(Math.floor(value.cursor / 3))).catch(error => setNotice(error.message)); }} disabled={session.cursor === 0 || busy}>‹ 上一步</button>
          <span>{session.cursor + 1} / {lesson.steps.length}</span><button onClick={() => void advance()} disabled={busy}>下一步 ›</button>{session.status === 'completed' && nextLesson && <button onClick={() => onNext(nextLesson.id)}>下一课 →</button>}</div>
        <form className="cl-input" onSubmit={event => void ask(event)}><div><textarea aria-label="向课堂老师提问" value={question} placeholder="Ask a question…" maxLength={2000} onChange={event => { if (playing) setPlaying(false); setQuestion(event.target.value); }}/>
          <button type="button" title="语音转写" aria-label={listening ? '停止语音输入' : '语音提问'} onClick={microphone} data-listening={listening}>♩</button>
          <button type="button" aria-label={playing ? '暂停讲解' : '继续讲解'} disabled={busy} onClick={() => { const resume = !playing; pause(); setTab('history'); setPlaying(resume); }}>{playing ? 'Ⅱ' : '▷'}</button>
          {question.trim() ? <button type="submit" aria-label="发送课堂问题" disabled={busy}>↑</button> : <button type="button" aria-label="停止课堂讲解" onClick={pause}>■</button>}</div>
          <XiaojiuModelPicker catalog={catalog} value={modelId} onChange={setModelId} compact disabled={busy}/></form>
      </aside></>}
    {!showChat && !standalonePractice && <button className="cl-show-chat" onClick={() => setShowChat(true)}>打开对话与控制 ▤</button>}
    {settings && <div className="cl-modal-backdrop"><section className="cl-settings" role="dialog" aria-modal="true" aria-label="课堂设置"><header><h2>Session settings</h2><button autoFocus aria-label="关闭课堂设置" onClick={() => setSettings(false)}>×</button></header>
      <h3>VOICE OPTIONS <span>{session.speech.available ? 'AI 语音' : '文字讲解'}</span></h3><div className="cl-voice-grid">{session.speech.voices.map((item, index) => <button key={item.id} data-active={voice === item.id} onClick={() => setVoice(item.id)}><span className="cl-voice-bars">▥</span><div><b>{item.label}</b><small>{['耐心清晰，适合概念讲解', '自然温暖，适合日常学习', '柔和舒缓，适合长时间聆听', '轻快明亮，重点更鲜明', '平稳知性，适合系统回顾'][index % 5]}</small></div>{voice === item.id && <i>✓</i>}</button>)}</div>
      {!session.speech.available && <p>当前未配置云端语音，课程仍可逐步阅读。</p>}
      <h3>VOICE SPEED <span>{speed}×</span></h3><div className="cl-speed-grid">{[0.5, 0.75, 1, 1.25, 1.5, 2].map(value => <button key={value} data-active={speed === value} onClick={() => setSpeed(value)}>{value}×</button>)}</div>
      <h3>BOARD FONT</h3><div className="cl-font-grid"><button data-active={handwriting} onClick={() => setHandwriting(true)}><b className="cl-handwriting">Aa Bb</b><span>Handwriting</span></button><button data-active={!handwriting} onClick={() => setHandwriting(false)}><b>Aa Bb</b><span>Standard</span></button></div>
      <h3>DISPLAY</h3><button className="cl-toggle" role="switch" aria-checked={dots} onClick={() => setDots(!dots)}><div><b>Background dots</b><small>白板背后的点阵背景</small></div><span data-checked={dots}/></button>
      <h3>HELP</h3><button className="cl-toggle" onClick={() => { setSettings(false); setTourIndex(0); }}><div><b>Replay the tour</b><small>重新了解课堂里的七个常用控件</small></div>↗</button>
      <button className="cl-print" onClick={() => { setSettings(false); setTimeout(() => window.print(), 0); }}>打印 / 保存 PDF 笔记</button><p className="cl-settings-note">音色在下一句生效，倍速同步当前音频。暂停后会从当前句开头继续。</p>
    </section></div>}
    {tourIndex !== null && <div className="cl-modal-backdrop cl-tour-backdrop"><section className="cl-tour" role="dialog" aria-modal="true" aria-label="课堂新手引导"><header><small>WHITEBOARD TOUR · {tourIndex + 1} / 7</small><button autoFocus onClick={finishTour}>跳过</button></header><span className="cl-tour-glyph">{['▥', '♧', '⚙', '♪', '☏', '■', '▤'][tourIndex]}</span><h2>{tour[tourIndex][0]}</h2><p>{tour[tourIndex][1]}</p><div className="cl-tour-dots">{tour.map((_, index) => <i key={index} data-active={index === tourIndex}/>)}</div><footer><button disabled={tourIndex === 0} onClick={() => setTourIndex(Math.max(0, tourIndex - 1))}>上一步</button><button onClick={() => tourIndex === 6 ? finishTour() : setTourIndex(tourIndex + 1)}>{tourIndex === 6 ? '开始学习' : '下一步'}</button></footer></section></div>}
    {exit && <div className="cl-modal-backdrop"><section className="cl-exit-dialog" role="dialog" aria-modal="true" aria-label="离开课堂确认"><h2>要暂时离开课堂吗？</h2><p>已读步骤与插问已保存。项目草稿也会在离开前保存。</p><footer><button autoFocus onClick={() => setExit(false)}>继续学习</button><button disabled={busy} onClick={() => { setBusy(true); void save({ projectDraft }).then(onClose).catch(error => { setNotice(error.message); setBusy(false); setExit(false); }); }}>保存并离开</button></footer></section></div>}
    {award && <div className="cl-modal-backdrop"><section className="cl-award" role="dialog" aria-modal="true" aria-label="课堂学习里程碑"><span>✧</span><small>YOU FINISHED A LESSON</small><h2>{lesson.title}</h2><p>已走完这段概念路线。接下来用新的情境检查理解，看看哪些地方还需要回顾。</p><button autoFocus onClick={() => { setAward(false); setTab('practice'); }}>去检查理解 →</button><button onClick={() => setAward(false)}>稍后再做</button></section></div>}
    <article className="cl-print-notes"><h1>{lesson.title}</h1><p>{lesson.objective}</p>{lesson.steps.slice(0, session.revealed).map(step => <section key={step.id}><BoardStep step={step} sentence={0} full print/></section>)}
      <h2>课堂插问</h2>{session.messages.map(message => <section key={message.id}><p><b>{message.role === 'user' ? '我：' : '老师：'}</b>{message.content}</p>{message.board && <><h3>{message.board.title}</h3>{message.board.points.map((point, index) => <p key={index}>{point}</p>)}{message.board.diagram && <ClassroomFigure diagram={message.board.diagram}/>}</>}</section>)}<h2>项目草稿</h2><p>{projectDraft}</p></article>
  </main>;
}

'use client';
import * as React from 'react';
import Link from 'next/link';
import type { StudioCourse, StudioCoursePreview, StudioOverview, StudioSubject } from '@study-agent/contracts';
import { apiRequest } from '../../lib/api';
import { WorkspaceDialog } from './workspace-dialog';
import './course-builder.css';

export function CourseBuilder({ studentId, subject, selected, initialTitle, onClose, onCreated, onRefresh }: {
  studentId: string; subject: StudioSubject; selected: StudioOverview['selected']; initialTitle: string;
  onClose: () => void; onCreated: (course: StudioCourse) => void;
  onRefresh: () => Promise<void>;
}) {
  const atoms = selected?.atoms ?? [];
  const [title, setTitle] = React.useState(initialTitle.slice(0, 180)), [objective, setObjective] = React.useState('');
  const [ids, setIds] = React.useState<string[]>(atoms.length <= 30 ? atoms.map(atom => atom.id) : []);
  const [minutes, setMinutes] = React.useState(Math.min(60, Math.max(5, selected?.scope?.minutesPerSession ?? 15)));
  const [query, setQuery] = React.useState(''), [error, setError] = React.useState('');
  const [preview, setPreview] = React.useState<StudioCoursePreview | null>(null);
  const [phase, setPhase] = React.useState<'editing' | 'previewing' | 'reviewing' | 'creating'>('editing');
  const controller = React.useRef<AbortController | null>(null), key = React.useRef('');
  const initialized = React.useRef(false);
  const source = JSON.stringify(atoms.map(atom => [atom.id, atom.teaching?.reviewStatus]));
  React.useEffect(() => {
    const allowed = new Set(atoms.map(atom => atom.id));
    const preserve = initialized.current;
    setIds(current => preserve ? current.filter(id => allowed.has(id)) : atoms.length <= 30 ? [...allowed] : []);
    initialized.current = atoms.length > 0; setPreview(null); setPhase('editing'); key.current = '';
  }, [studentId, subject, selected?.scope?.version, source]);
  React.useEffect(() => () => controller.current?.abort(), []);
  const creating = phase === 'creating', waiting = phase === 'previewing', locked = creating || waiting;
  const shown = atoms.filter(atom => [atom.name, atom.objective, atom.strand].some(text => text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  function close() { if (creating) return; controller.current?.abort(); onClose(); }
  function edit() { controller.current?.abort(); setPhase('editing'); setPreview(null); setError(''); key.current = ''; }
  async function generate(event: React.FormEvent) {
    event.preventDefault(); if (!studentId || !ids.length || locked) return;
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setPhase('previewing'); setError(''); setPreview(null); key.current = '';
    try {
      const result = await apiRequest<StudioCoursePreview>('/learning/studio/courses/preview', { method: 'POST', signal: request.signal,
        body: JSON.stringify({ studentId, subject, focusAtomIds: ids, title: title.trim() || undefined, objective: objective.trim() || undefined, minutesPerSession: minutes }) });
      if (request.signal.aborted) return;
      setPreview(result); setPhase('reviewing');
    } catch (reason) { if (!request.signal.aborted) { setError((reason as Error).message); setPhase('editing'); } }
  }
  async function create() {
    if (!preview || creating || !preview.canCreate) return;
    const request = new AbortController(); controller.current = request; setPhase('creating'); setError('');
    if (!key.current) key.current = crypto.randomUUID();
    try {
      const course = await apiRequest<StudioCourse>('/learning/studio/courses', { method: 'POST', signal: request.signal,
        body: JSON.stringify({ studentId, subject, focusAtomIds: preview.focusAtomIds, title: preview.title, objective: preview.objective,
          minutesPerSession: preview.pace?.minutesPerSession, previewFingerprint: preview.fingerprint, requestKey: key.current }) });
      if (!request.signal.aborted) onCreated(course);
    } catch (reason) { if (!request.signal.aborted) { setError((reason as Error).message); setPhase('reviewing'); } }
  }
  return <WorkspaceDialog onClose={close} busy={creating}><section className="ws-builder ws-course-builder" role="dialog" aria-modal="true" aria-label="课程蓝图">
    <header><div><small>COURSE BLUEPRINT</small><h2>{preview ? '审阅课程蓝图' : '设计这次学习'}</h2></div><button type="button" aria-label="关闭课程蓝图" disabled={creating} onClick={close}>×</button></header>
    <ol className="ws-blueprint-steps" aria-label="创建课程步骤"><li aria-current={!preview ? 'step' : undefined}>1 · 目标与范围</li><li aria-current={preview ? 'step' : undefined}>2 · 审阅后确认</li></ol>
    {!preview&&<p className="ws-source-course-entry"><Link href={'/studio/source-courses?'+new URLSearchParams({new:'1',...(studentId?{studentId,subject}:{})})}>用自己的 PDF 或文字资料创建课程 →</Link></p>}
    {error && <div className="ws-builder-error" role="alert"><p>{error}</p>{preview && <small>尚未取得确认回执。重试会沿用同一确认标识；也可以返回修改并重新预览。</small>}<button type="button" disabled={locked} onClick={() => { edit(); void onRefresh(); }}>重新核对学习范围</button></div>}
    {preview ? <>
      <div className="ws-blueprint-summary"><small>{preview.grade}年级 · { { math: '数学', chinese: '语文', english: '英语' }[preview.subject]} · {selected?.nickname}</small><h3>{preview.title}</h3><p>{preview.objective}</p>
        <dl><div><dt>知识点</dt><dd>{preview.focusAtomIds.length}</dd></div><div><dt>单元</dt><dd>{preview.units.length}</dd></div><div><dt>学习时段</dt><dd>{preview.pace?.sessions.length ?? '—'}</dd></div><div><dt>每次预算</dt><dd>{preview.pace?.minutesPerSession ?? '—'} <small>分钟</small></dd></div></dl>
      </div>
      <section className="ws-blueprint-sources"><h3>来源与需要核对的内容</h3>{preview.materials.map(material => <article key={material.id}><b>{material.title}</b><span>{material.status === 'available' ? '范围已确认' : '需要核对'}</span><p>{material.detail}</p></article>)}
        {preview.warnings.length > 0 && <ul>{preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}</section>
      <section className="ws-blueprint-units"><h3>课程结构</h3>{preview.units.map(unit => <details key={unit.id} open={preview.units.length === 1}><summary>{unit.title} <small>{unit.lessons.length} 项活动</small></summary><p>{unit.objective}</p><ol>{unit.lessons.map(lesson => <li key={lesson.id}><span>{ { learn: '讲解', practice: '独立练习', project: '迁移活动', exam: '单元核查' }[lesson.kind]}</span><div><b>{lesson.title}</b><small>{lesson.objective}</small>{lesson.kind === 'learn' && !lesson.teaching && <em>尚无已审核讲解，进入已有测量流程</em>}</div></li>)}</ol></details>)}</section>
      {preview.pace && <section className="ws-blueprint-pace"><h3>按每次 {preview.pace.minutesPerSession} 分钟安排</h3><p>{preview.pace.notice}</p><details><summary>查看 {preview.pace.sessions.length} 个建议时段 · 合计约 {preview.pace.estimatedMinutes} 分钟</summary><ol>{preview.pace.sessions.map((session, index) => <li key={session.id}><b>第 {index + 1} 次 · 约 {session.minutes} 分钟</b><span>{session.activities.map(activity => activity.title + (activity.parts > 1 ? `（${activity.part}/${activity.parts}）` : '')).join('；')}</span></li>)}</ol></details></section>}
      <footer><button type="button" disabled={creating} onClick={edit}>返回修改</button><button type="button" disabled={creating || !preview.canCreate} onClick={() => void create()}>{creating ? '正在确认并保存…' : '确认并创建'}</button></footer>
    </> : <form onSubmit={event => void generate(event)}>
      <div className="ws-blueprint-fields"><label>课程名称<input aria-label="课程名称" value={title} minLength={3} maxLength={180} placeholder="可留空，按所选知识点命名" disabled={locked} onChange={event => setTitle(event.target.value)}/></label>
        <label>希望解决什么问题<textarea aria-label="课程学习目标" value={objective} minLength={5} maxLength={1000} rows={3} placeholder="例如：先理解共同单位，再独立完成陌生情境中的分数加法" disabled={locked} onChange={event => setObjective(event.target.value)}/></label>
        <div className="ws-blueprint-prefs"><label>每次学习预算<select aria-label="每次学习预算" value={minutes} disabled={locked} onChange={event => setMinutes(Number(event.target.value))}>{[...new Set([5,10,15,20,25,30,45,60,minutes])].sort((a,b)=>a-b).map(value => <option key={value} value={value}>{value} 分钟</option>)}</select></label><div><span>教学语言</span><b>沿用已审核材料</b><small>保留材料中的原语言和英文例句。</small></div></div>
      </div>
      <fieldset disabled={locked || !selected?.scope}><legend>选择本次知识点 <span>已选 {ids.length} / {atoms.length}</span></legend><p>{selected ? `${selected.nickname} · ${selected.grade}年级 · ${selected.scope?.textbookVersion ?? '尚未确认范围'}` : '先选择学习档案，再确认学习范围。'}</p>
        {atoms.length > 30 && <p>每门课程最多选择30个点，其余内容可以分批安排。</p>}
        {atoms.length > 0 && <><label className="ws-blueprint-search">筛选知识点<input aria-label="筛选蓝图知识点" value={query} onChange={event => setQuery(event.target.value)} placeholder="名称、领域或目标"/></label><div className="ws-blueprint-selection"><button type="button" disabled={locked || !shown.length || new Set([...ids,...shown.map(atom=>atom.id)]).size > 30} onClick={() => setIds([...new Set([...ids,...shown.map(atom=>atom.id)])])}>选择当前列表</button><button type="button" disabled={locked || !ids.length} onClick={() => setIds([])}>清空选择</button></div>
          <div className="ws-blueprint-atoms">{shown.map(atom => <label key={atom.id}><input type="checkbox" aria-label={'选择知识点：' + atom.name} checked={ids.includes(atom.id)} disabled={locked || !ids.includes(atom.id) && ids.length >= 30} onChange={event => setIds(current => event.target.checked ? [...current, atom.id] : current.filter(id => id !== atom.id))}/><span><b>{atom.name}</b><small>{atom.objective}</small><em>{atom.teaching?.reviewStatus === 'approved' ? '讲解已审核' : '讲解待补'}</em></span></label>)}</div>{!shown.length && <p role="status">没有匹配的知识点，可以清空关键词。</p>}</>}
      </fieldset>
      {!selected && <p><Link href="/parent/dashboard">先创建学习档案 →</Link></p>}{selected && !atoms.length && <p><Link href={'/student/assessment?' + new URLSearchParams({studentId,subject})}>先确认学习范围 →</Link></p>}
      {waiting && <p role="status">正在核对范围、讲解资格和课程结构…</p>}
      <footer><button type="button" onClick={close}>取消</button><button disabled={locked || !selected?.scope || !ids.length}>{waiting ? '正在预览…' : '预览课程蓝图'}</button></footer>
    </form>}
  </section></WorkspaceDialog>;
}

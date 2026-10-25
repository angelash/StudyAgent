'use client';
import * as React from 'react';
import Link from 'next/link';
import type { CourseProjectCatalog, CourseProjectView, ProjectArtifact, ProjectCriterion, ProjectRating, ProjectSubmission } from '@study-agent/contracts';
import { projectArtifactIdentity } from '@study-agent/contracts';
import { apiRequest } from '../../../lib/api';
import { useSessionUser } from '../../../lib/session-user';
import { XiaojiuModelPicker, useXiaojiuModels } from '../../../components/xiaojiu-model-picker';
import { WorkspaceDialog } from '../workspace-dialog';
import { copyCourseFilters } from '../course-library-state';
import { ProjectFiles, FrozenProjectFiles } from './project-files';
import { ProjectAdviceScopePicker } from './advice-scope';
import '../workspace.css';
import './projects.css';

type Editor = { artifact: ProjectArtifact; selfRatings: ProjectRating[]; revisionNote: string };
const blank = (): Editor => ({ artifact: { values: {}, evidence: [] }, selfRatings: [], revisionNote: '' });
const savedEditor = (row: CourseProjectView, stage: string): Editor => ({ artifact: structuredClone(row.drafts[stage] ?? blank().artifact),
  selfRatings: structuredClone(row.draftReflections[stage]?.ratings ?? []), revisionNote: row.draftReflections[stage]?.revisionNote ?? '' });
const when = (value: string) => new Date(value).toLocaleString('zh-CN');
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Ratings({ rubric, ratings, onChange, disabled, prefix, attachments=[] }: { rubric: ProjectCriterion[]; ratings: ProjectRating[];
  onChange: (value: ProjectRating[]) => void; disabled?: boolean; prefix: string;attachments?:Array<{assetId:string;label:string}> }) {
  return <div className="pj-ratings">{rubric.map(criterion => {
    const value = ratings.find(rating => rating.criterionId === criterion.id);
    function update(level: number, evidence: string,attachmentIds=value?.attachmentIds) { onChange([...ratings.filter(rating => rating.criterionId !== criterion.id), { criterionId: criterion.id, level, evidence,...(attachmentIds===undefined?{}:{attachmentIds}) }]); }
    return <fieldset key={criterion.id} disabled={disabled}><legend>{criterion.title}</legend>
      <div className="pj-levels">{criterion.levels.map((text, level) => <label key={level} data-selected={value?.level === level}>
        <input type="radio" name={prefix + criterion.id} checked={value?.level === level} onChange={() => update(level, value?.evidence ?? '')}/><b>{level}</b><span>{text}</span></label>)}</div>
      <label className="pj-label">{criterion.title}的具体依据<textarea aria-label={prefix + criterion.title + '的具体依据'} maxLength={2000} value={value?.evidence ?? ''}
        placeholder="指出作品中的哪一处支持这个选择，也可以如实写还缺什么。" onChange={event => update(value?.level ?? 0, event.target.value)}/></label>
      {attachments.length>0&&<div className="pj-rating-files"><span>关联本次作品中的文件（可选）</span>{attachments.map(file=><label key={file.assetId}><input type="checkbox" checked={value?.attachmentIds?.includes(file.assetId)??false} onChange={event=>update(value?.level??0,value?.evidence??'',event.target.checked?[...(value?.attachmentIds??[]),file.assetId]:(value?.attachmentIds??[]).filter(id=>id!==file.assetId))}/>{file.label}</label>)}</div>}
    </fieldset>;
  })}</div>;
}

export function ProjectWorkbench() {
  const identity = useSessionUser(), models = useXiaojiuModels(Boolean(identity));
  const [catalog, setCatalog] = React.useState<CourseProjectCatalog | null>(null), [row, setRow] = React.useState<CourseProjectView | null>(null);
  const [stageId, setStageId] = React.useState(''), [editor, setEditor] = React.useState<Editor>(blank), [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(true), [busy, setBusy] = React.useState(''), [error, setError] = React.useState(''), [notice, setNotice] = React.useState('');
  const [leave, setLeave] = React.useState<(() => void) | null>(null), [history, setHistory] = React.useState<ProjectSubmission | null>(null);
  const [reviewRatings, setReviewRatings] = React.useState<ProjectRating[]>([]), [reviewComment, setReviewComment] = React.useState(''), [reviewDecision, setReviewDecision] = React.useState('needs_revision');
  const abort = React.useRef<AbortController | null>(null), mounted = React.useRef(true), pending = React.useRef<{ signature: string; requestKey: string } | null>(null);
  const displayedQuery = React.useRef('');
  const baseline = row && stageId ? savedEditor(row, stageId) : blank();
  const dirty = Boolean(row?.permissions.edit && JSON.stringify(editor) !== JSON.stringify(baseline));
  const dirtyRef = React.useRef(dirty); dirtyRef.current = dirty;
  const params = new URLSearchParams(query), studioCourseId = params.get('studioCourseId') ?? undefined, legacySession = params.get('legacy');
  const definition = row?.definition ?? catalog?.definitions.find(item => item.unitId === params.get('unitId')) ?? (!params.get('unitId') ? catalog?.definitions[0] : undefined);
  const stage = definition?.stages.find(item => item.id === stageId) ?? definition?.stages[0];
  const savedArtifact=row?.drafts[stageId]??blank().artifact;
  const backParams = copyCourseFilters(query, new URLSearchParams(studioCourseId ? { view: 'courses', course: studioCourseId } : {}));
  const backUnit = params.get('returnUnit') ?? (studioCourseId ? definition?.unitId : String(Math.max(0, catalog?.definitions.findIndex(item => item.unitId === definition?.unitId) ?? 0)));
  if (backUnit) backParams.set('unit', backUnit); if (params.get('returnPanel')) backParams.set('panel', params.get('returnPanel')!);
  const backHref = studioCourseId ? '/studio?' + backParams : '/studio/classroom?' + backParams;

  function receive(value: CourseProjectView, target?: string) {
    const selected = target ?? (stageId || value.currentStageId);
    setRow(value); setStageId(selected); setEditor(savedEditor(value, selected));
    setCatalog(current => current ? { ...current, projects: [value, ...current.projects.filter(item => item.id !== value.id)] } : current);
  }
  function address(value: CourseProjectView, selected: string, push = false) {
    const next = new URLSearchParams(window.location.search); next.set('project', value.id); next.set('unitId', value.definition.unitId); next.set('stage', selected);
    window.history[push ? 'pushState' : 'replaceState'](null, '', '/studio/projects?' + next); displayedQuery.current = next.toString(); setQuery(next.toString());
  }
  React.useEffect(() => {
    mounted.current = true; if (!identity) { setLoading(false); return; }
    let controller = new AbortController();
    async function load() {
      controller.abort(); controller = new AbortController(); const active = controller;
      setLoading(true); setError('');
      try {
        const next = new URLSearchParams(window.location.search), course = next.get('studioCourseId'); setQuery(next.toString());
        const filters = new URLSearchParams(); if (course) filters.set('studioCourseId', course); if(next.get('studentId')) filters.set('studentId',next.get('studentId')!);
        const list = await apiRequest<CourseProjectCatalog>('/learning/projects/catalog?' + filters, { signal: active.signal });
        const projectId = next.get('project'); const target = projectId ? await apiRequest<CourseProjectView>('/learning/projects/' + encodeURIComponent(projectId), { signal: active.signal }) :
          list.projects.find(item => item.definition.unitId === (next.get('unitId') ?? list.definitions[0]?.unitId));
        if (active.signal.aborted) return;
        if (next.get('unitId') && !list.definitions.some(item => item.unitId === next.get('unitId')) && !target) throw new Error('这个单元没有可用项目，请返回课程目录重新进入。');
        if (target && (target.studioCourseId !== (course ?? undefined) || next.get('unitId') && target.definition.unitId !== next.get('unitId'))) throw new Error('项目与当前课程入口不一致，请返回课程重新进入。');
        setCatalog(list); setRow(target ?? null);
        const selected = target?.definition.stages.find(stage => stage.id === next.get('stage'))?.id ?? target?.currentStageId ?? list.definitions.find(item => item.unitId === next.get('unitId'))?.stages[0].id ?? list.definitions[0]?.stages[0].id ?? '';
        setStageId(selected); setEditor(target ? savedEditor(target, selected) : blank()); if (target) address(target, selected); else displayedQuery.current=next.toString();
      } catch (caught) { if (!active.signal.aborted) setError((caught as Error).message); }
      finally { if (!active.signal.aborted) setLoading(false); }
    }
    void load();
    const pop = () => { if (dirtyRef.current) {
      const destination=window.location.search; window.history.replaceState(null,'','/studio/projects?'+displayedQuery.current);
      const restore = () => { dirtyRef.current = false; window.history.replaceState(null,'','/studio/projects'+destination); void load(); }; setLeave(() => restore);
    } else void load(); };
    window.addEventListener('popstate', pop);
    return () => { mounted.current = false; controller.abort(); abort.current?.abort(); window.removeEventListener('popstate', pop); };
  }, [identity]);
  React.useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  React.useEffect(()=>{if(error){const regions=document.querySelectorAll('.pj-error');regions.item(regions.length-1)?.scrollIntoView({block:'center'});}},[error]);

  async function write(kind: 'save' | 'submit' | 'advice' | 'legacy' | 'review', body: Record<string, unknown>, method: 'POST' | 'PATCH' = 'POST') {
    if (!row || busy) return;
    const command = { expectedRevision: row.revision, ...body }, signature = kind + JSON.stringify(command);
    const requestKey = pending.current?.signature === signature ? pending.current.requestKey : crypto.randomUUID();
    pending.current = { signature, requestKey }; setBusy(kind); setError(''); setNotice('');
    const controller = new AbortController(); abort.current = controller;
    try {
      const endpoint = { save: '', submit: '/submissions', advice: '/advice', legacy: '/legacy', review: '/reviews' }[kind];
      const result = await apiRequest<CourseProjectView>('/learning/projects/' + row.id + endpoint, { method, signal: controller.signal, body: JSON.stringify({ ...command, requestKey }) });
      if (!mounted.current) return;
      receive(result); pending.current = null;
      setNotice({ save: '草稿和自评准备已保存。', submit: '已保存本次提交快照，可以继续修订或进入下一阶段。', advice: 'AI 建议已保存，仍需你核查。', legacy: '旧稿已带入参考区，原课堂记录保持可读。', review: '人工复核已保存，并绑定所选提交版本。' }[kind]);
      return result;
    } catch (caught) { if (mounted.current) setError(controller.signal.aborted ? '已停止请求。请读取已保存版本核对状态后继续。' : (caught as Error).message); }
    finally { if (mounted.current) setBusy(''); }
  }
  async function start(useCurrentVersion = false) {
    if (!definition || busy) return; setBusy('start'); setError('');
    try {
      const value = await apiRequest<CourseProjectView>('/learning/projects', { method: 'POST', body: JSON.stringify({ unitId: definition.unitId, ...(studioCourseId ? { studioCourseId } : {}), useCurrentVersion }) });
      receive(value, value.currentStageId); address(value, value.currentStageId);
    } catch (caught) { setError((caught as Error).message); } finally { setBusy(''); }
  }
  function guarded(action: () => void) { if (dirty) setLeave(() => action); else action(); }
  function selectStage(value: string) { guarded(() => { if (!row) return; setStageId(value); setEditor(savedEditor(row, value)); address(row, value, true); pending.current = null; setNotice(''); setError(''); }); }
  function exportLocal() { download({ project: row, localStage: stageId, localDraft: editor }, '课程项目与本地草稿.json'); }
  async function refreshProject() {
    if (!row) { window.location.reload(); return; }
    if (dirty) exportLocal(); setBusy('reload');
    try { receive(await apiRequest<CourseProjectView>('/learning/projects/' + row.id)); setError(''); pending.current = null; setNotice('已读取服务器版本。'); }
    catch(caught) { setError((caught as Error).message); } finally { setBusy(''); }
  }
  const submissions = row?.submissions.filter(item => item.stageId === stage?.id) ?? [], latest = submissions.at(-1);
  const editable = Boolean(row?.permissions.edit && !busy);
  function evidence(value: ProjectArtifact['evidence']) { setEditor(current => ({ ...current, artifact: { ...current.artifact, evidence: value } })); }
  function openHistory(value: ProjectSubmission) { setHistory(value); setReviewRatings([]); setReviewComment(''); setReviewDecision('needs_revision'); }

  if (identity === undefined || loading) return <main className="pj-gate" role="status">正在恢复课程项目…</main>;
  if (!identity) return <main className="pj-gate"><h1>把理解变成自己的作品。</h1><p>登录后保存阶段草稿与提交记录。</p><Link href="/parent/login">登录学习工作台 →</Link></main>;
  return <main className="pj-shell">
    <header className="pj-top"><a href={backHref} onClick={event => { event.preventDefault(); guarded(() => window.location.assign(backHref)); }}>‹ 返回课程</a><span>LEARNING STUDIO <i>/</i> PROJECT</span><button disabled={!row || Boolean(busy)} onClick={exportLocal}>导出项目</button></header>
    <div className="pj-layout"><aside className="pj-sidebar"><small>COURSE PROJECT</small><h1>{definition?.title ?? '课程项目'}</h1><p>{definition?.brief}</p>
      <div className="pj-route-label">分阶段完成作品 <span>{new Set(row?.submissions.map(item => item.stageId)).size}/{definition?.stages.length ?? 0}</span></div>
      <nav aria-label="项目阶段">{definition?.stages.map((item,index) => <button key={item.id} disabled={Boolean(busy) || !row} aria-current={item.id === stage?.id ? 'step' : undefined} onClick={() => selectStage(item.id)}>
        <b>{row?.submissions.some(submission => submission.stageId === item.id) ? '✓' : String(index+1).padStart(2,'0')}</b><span>{item.title}<small>{row?.submissions.some(submission => submission.stageId === item.id) ? '已有提交，可继续修订' : row?.drafts[item.id] && Object.values(row.drafts[item.id].values).some(Boolean) ? '草稿已保存' : '等待开始'}</small></span></button>)}</nav>
      <p className="pj-boundary">提交与自评记录本次作品。AI 建议帮助修改，知识掌握仍需独立核查。</p>
      {row && <details><summary>项目版本与内容来源</summary><p>{row.definition.version} · {row.contentStatus === 'current' ? '当前版本' : '保留版本'}</p><p>{row.definition.provenance}</p><small>内容与量规待教师审核。</small></details>}
      {catalog&&catalog.projects.filter(item=>item.definition.id===definition?.id).length>0&&<details className="pj-saved-projects"><summary>可查看的项目记录</summary>{catalog.projects.filter(item=>item.definition.id===definition?.id).map(item=><p key={item.id}><a aria-current={item.id===row?.id?'page':undefined} href={'/studio/projects?'+new URLSearchParams({...Object.fromEntries(params),project:item.id,unitId:item.definition.unitId,stage:item.currentStageId})} onClick={event=>{event.preventDefault();const href=event.currentTarget.href;guarded(()=>window.location.assign(href));}}>{item.permissions.edit?'我的项目':'学习者项目'} · {when(item.updatedAt)}{item.contentStatus!=='current'?' · 保留版本':''}</a></p>)}</details>}
    </aside>
    <section className="pj-main">
      {error && <div className="pj-error" role="alert"><b>这次操作没有确认成功</b><p>{error}</p><button disabled={Boolean(busy)} onClick={() => void refreshProject()}>{dirty ? '保留本地副本并读取已保存版本' : '读取已保存版本'}</button></div>}
      {notice && <p className="pj-notice" role="status">{notice}</p>}
      {row?.contentStatus === 'archived' && <div className="pj-version"><p>正在使用保留的项目定义和量规。新版本会建立独立项目，旧提交继续保留。</p><button disabled={Boolean(busy) || dirty} onClick={() => void start(true)}>开始新版项目</button></div>}
      {!row ? <article className="pj-start"><small>FROM IDEAS TO EVIDENCE</small><h2>用一份作品，检验你的理解。</h2><p>每个阶段都可以保存、比较证据、逐项自评。提交保留当时版本，之后仍能修订。</p><ol>{definition?.stages.map(item => <li key={item.id}><b>{item.title}</b><p>{item.objective}</p></li>)}</ol><button className="pj-primary" disabled={Boolean(busy) || !definition} onClick={() => void start()}>{busy ? '正在准备…' : '开始这个项目 →'}</button></article> : stage && <>
        <header className="pj-stage-heading"><div><small>STAGE {definition!.stages.indexOf(stage)+1} / {definition!.stages.length}</small><h2>{stage.title}</h2><p>{stage.objective}</p></div><span className="pj-save-state" role="status">{busy ? '正在处理…' : dirty ? '有未保存修改' : '已保存至服务器'}</span></header>
        {!row.permissions.edit && <p className="pj-notice">正在查看学习者项目。产物由学习者修订；请在提交历史中选择版本进行复核。</p>}
        <fieldset className="pj-artifact" disabled={!editable}><legend className="sr-only">阶段产物</legend>{stage.fields.map(field => <label className="pj-label" key={field.id}><b>{field.label}</b><span>{field.prompt}</span><textarea maxLength={12000} value={editor.artifact.values[field.id] ?? ''} onChange={event => setEditor(current => ({ ...current, artifact: { ...current.artifact, values: { ...current.artifact.values, [field.id]: event.target.value } } }))}/></label>)}</fieldset>
        <ProjectFiles key={String(identity.id)+":"+row.id+":"+stageId} identity={identity.id} project={row} stageId={stageId} artifact={editor.artifact} disabled={Boolean(busy)} onChange={artifact=>setEditor(current=>({...current,artifact,selfRatings:current.selfRatings.map(rating=>rating.attachmentIds===undefined?rating:{...rating,attachmentIds:rating.attachmentIds.filter(id=>artifact.attachments?.some(file=>file.assetId===id))})}))}/>
        <section className="pj-section" aria-label="项目证据"><header><div><small>EVIDENCE</small><h3>保留可以核查的依据</h3></div><button disabled={!editable || editor.artifact.evidence.length >= 20} onClick={() => evidence([...editor.artifact.evidence, { id: crypto.randomUUID(), label: '', content: '', source: '' }])}>＋ 添加证据</button></header><p>记录匿名观察、资料摘录或来源链接。链接用于引用，平台不会自动读取。</p>
          {!editor.artifact.evidence.length && <div className="pj-empty">还没有证据记录。可以先写草稿，再补充依据。</div>}
          {editor.artifact.evidence.map((item,index) => <fieldset className="pj-evidence" disabled={!editable} key={item.id}><legend>证据 {index+1}</legend>
            <label className="pj-label">证据名称<input maxLength={160} value={item.label} onChange={event => evidence(editor.artifact.evidence.map(value => value.id === item.id ? { ...value,label:event.target.value } : value))}/></label>
            <label className="pj-label">观察或摘录<textarea maxLength={6000} value={item.content} onChange={event => evidence(editor.artifact.evidence.map(value => value.id === item.id ? { ...value,content:event.target.value } : value))}/></label>
            <label className="pj-label">来源链接（可选）<input type="url" maxLength={2000} placeholder="https://…" value={item.source} onChange={event => evidence(editor.artifact.evidence.map(value => value.id === item.id ? { ...value,source:event.target.value } : value))}/></label>
            <button onClick={() => evidence(editor.artifact.evidence.filter(value => value.id !== item.id))}>移除这条证据</button></fieldset>)}
        </section>
        <details className="pj-section pj-reflection" open={editor.selfRatings.length > 0}><summary><span>RUBRIC</span> 按量规检查自己的作品</summary><p>逐项选择符合当前产物的描述，并给出依据。保存草稿会同时保存这些准备；阶段提交时冻结自评。</p>
          <Ratings rubric={row.definition.rubric} attachments={editor.artifact.attachments} ratings={editor.selfRatings} prefix="自评" disabled={!editable} onChange={selfRatings => setEditor(current => ({ ...current, selfRatings }))}/>
          <label className="pj-label">这次修订改变了什么{latest && <span>再次提交时必填；说明如何回应之前的问题或反馈。</span>}<textarea disabled={!editable} maxLength={3000} value={editor.revisionNote} onChange={event => setEditor(current => ({ ...current, revisionNote:event.target.value }))}/></label></details>
        <section className="pj-section pj-ai" aria-label="项目 AI 建议"><header><div><small>AI FEEDBACK</small><h3>让助教帮你寻找证据缺口</h3></div></header><p>建议针对已保存的阶段草稿，不替代你的判断和人工复核。</p><XiaojiuModelPicker catalog={models.catalog} value={models.modelId} onChange={models.setModelId} disabled={Boolean(busy)}/>
          {models.error && <p>{models.error}</p>}<ProjectAdviceScopePicker key={row.id+stageId+projectArtifactIdentity(savedArtifact)} artifact={savedArtifact} stage={stage} disabled={!editable||dirty||!Object.values(editor.artifact.values).some(value=>value.trim())} onAsk={scope=>void write('advice',{stageId,modelId:models.modelId,...(scope?{scope}:{})})}/>{dirty && <small>先保存当前修改，再分析。</small>}
          {busy === 'advice' && <button onClick={() => abort.current?.abort()}>停止生成建议</button>}
          {row.advice.filter(item => item.stageId === stageId).slice().reverse().map(item => <article className="pj-advice" key={item.id}><small>{item.modelName} · {when(item.at)} · {item.artifactFingerprint === projectArtifactIdentity(editor.artifact) ? '针对当前草稿' : '针对之前的草稿'}{item.scope?' · 仅分析所选文字和说明':''}</small><p>{item.reply}</p></article>)}</section>
        <section className="pj-section" aria-label="阶段提交历史"><header><div><small>VERSIONS</small><h3>每次提交都有迹可循</h3></div></header>{!submissions.length ? <p>尚未提交这一阶段。可以先保存未完成草稿。</p> : submissions.slice().reverse().map(item => <button className="pj-history-row" key={item.id} onClick={() => openHistory(item)}><b>提交 v{item.number}</b><span>{item.revisionNote || '首次提交'}<small>{when(item.at)} · {row.reviews.filter(review => review.submissionId === item.id).length} 条人工复核</small></span><i>查看 →</i></button>)}</section>
        <footer className="pj-actions"><button disabled={!editable} onClick={() => void write('save',{stageId,...editor},'PATCH')}>保存阶段草稿</button><button className="pj-primary" disabled={!editable} onClick={() => void write('submit',{stageId,...editor})}>{latest ? '提交修订版本 →' : '提交这个阶段 →'}</button>{latest && definition!.stages.indexOf(stage) < definition!.stages.length-1 && <button disabled={Boolean(busy)} onClick={() => selectStage(definition!.stages[definition!.stages.indexOf(stage)+1].id)}>下一阶段 ›</button>}</footer>
      </>}
    </section>
    <aside className="pj-reference"><small>PROJECT NOTEBOOK</small><h2>把学习连起来</h2><p>参考此前提交的产物，说明它与当前问题的联系。</p>
      {catalog?.definitions.map((item,index) => { const projects = catalog.projects.filter(project => project.definition.id === item.id && project.id !== row?.id);
        return <details key={item.id}><summary><b>{String(index+1).padStart(2,'0')}</b>{item.title}</summary>{projects.flatMap(project => project.submissions.map(submission => <div className="pj-reference-version" key={submission.id}><p>{project.definition.stages.find(stage => stage.id === submission.stageId)?.title} · v{submission.number}</p><small>{when(submission.at)}</small><p>{Object.values(submission.artifact.values).join('\n').slice(0,240)}</p><button disabled={!editable || editor.artifact.evidence.length >= 20} onClick={() => evidence([...editor.artifact.evidence,{id:crypto.randomUUID(), label:item.title+' v'+submission.number+' 摘录', content:('提交标识：'+submission.id+'\n'+Object.entries(submission.artifact.values).map(([key,value])=>key+'：'+value).join('\n')).slice(0,5500), source:window.location.origin+'/studio/projects?'+new URLSearchParams({project:project.id,unitId:item.unitId,...(studioCourseId?{studioCourseId}:{})})}])}>引用此版本摘录</button></div>))}{!projects.some(project => project.submissions.length) && <p>还没有可参考的提交。</p>}</details>; })}
      {row && legacySession && <button className="pj-import" disabled={!editable || dirty} onClick={() => void write('legacy',{sessionId:legacySession})}>带入这个课堂的旧草稿</button>}
      {row?.legacyImports.map((item,index) => <details key={index}><summary>旧课堂草稿 {index+1}</summary><small>{when(item.at)}</small><p className="pj-pre">{item.text}</p></details>)}
      <p className="pj-boundary">只记录匿名情境；不上传真实姓名、联系方式或未经同意的个人资料。</p>
    </aside></div>
    {leave && <WorkspaceDialog onClose={() => setLeave(null)} busy={Boolean(busy)}><section className="pj-dialog" role="dialog" aria-modal="true" aria-label="保留项目修改"><h2>当前阶段还有未保存的修改</h2><p>可以先保存，也可以导出本地副本后离开。</p><footer><button onClick={() => setLeave(null)}>继续编辑</button><button disabled={Boolean(busy)} onClick={() => { exportLocal(); const action=leave;setLeave(null);action(); }}>导出副本并离开</button><button className="pj-primary" disabled={Boolean(busy)} onClick={() => void write('save',{stageId,...editor},'PATCH').then(result => {if(result){const action=leave;setLeave(null);action();}})}>保存并继续</button></footer></section></WorkspaceDialog>}
    {history && row && <WorkspaceDialog onClose={() => setHistory(null)} busy={Boolean(busy)}><section className="pj-dialog pj-history-dialog" role="dialog" aria-modal="true" aria-label="项目提交版本"><header><div><small>IMMUTABLE SUBMISSION</small><h2>{row.definition.stages.find(stage=>stage.id===history.stageId)?.title} · v{history.number}</h2></div><button onClick={()=>setHistory(null)} aria-label="关闭提交版本">×</button></header><p>{when(history.at)} · {history.revisionNote||'首次提交'}</p>
      {error&&<div className="pj-error" role="alert">{error}</div>}
      {Object.entries(history.artifact.values).map(([key,value])=><section key={key}><h3>{row.definition.stages.find(stage=>stage.id===history.stageId)?.fields.find(field=>field.id===key)?.label??key}</h3><p className="pj-pre">{value}</p></section>)}
      {history.artifact.evidence.map(item=><section key={item.id}><h3>{item.label}</h3><p className="pj-pre">{item.content}</p>{item.source&&<a href={item.source} target="_blank" rel="noreferrer">查看记录的来源 ↗</a>}</section>)}
      <FrozenProjectFiles key={history.id} manifest={history.attachmentManifest}/>
      <h3>提交时自评</h3>{history.selfRatings.map(rating=><p key={rating.criterionId}>{row.definition.rubric.find(item=>item.id===rating.criterionId)?.title}：{rating.level} · {rating.evidence}</p>)}
      <h3>人工复核记录</h3>{!row.reviews.some(review=>review.submissionId===history.id)&&<p>还没有人工复核。自评和 AI 建议不会登记为人工结论。</p>}{row.reviews.filter(review=>review.submissionId===history.id).map(review=><article className="pj-advice" key={review.id}><small>{{parent:'家长',teacher:'教师',admin:'管理员'}[review.reviewerRole]} · {when(review.at)}{review.supersedesReviewId?' · 修订复核':''}</small><b>{review.decision==='ready'?'本次产物可继续':'建议修订后再核查'}</b><p>{review.comment}</p>{review.ratings.map(rating=><p key={rating.criterionId}>{row.definition.rubric.find(item=>item.id===rating.criterionId)?.title} · {rating.level}：{rating.evidence}</p>)}</article>)}
      {row.permissions.review&&<section><h3>复核这个提交版本</h3><Ratings rubric={row.definition.rubric} attachments={history.attachmentManifest} ratings={reviewRatings} onChange={setReviewRatings} prefix="人工复核" disabled={Boolean(busy)}/><label className="pj-label">具体反馈与下一步<textarea maxLength={4000} value={reviewComment} onChange={event=>setReviewComment(event.target.value)}/></label><label className="pj-label">本次产物建议<select value={reviewDecision} onChange={event=>setReviewDecision(event.target.value)}><option value="needs_revision">修订后再核查</option><option value="ready">可以继续下一步</option></select></label><button disabled={Boolean(busy)} onClick={()=>void write('review',{submissionId:history.id,ratings:reviewRatings,comment:reviewComment,decision:reviewDecision})}>保存人工复核</button></section>}
      <p className="pj-boundary">量规绑定 {history.rubricVersion.slice(0,12)}。本次作品评价不直接改变知识掌握度。</p></section></WorkspaceDialog>}
  </main>;
}

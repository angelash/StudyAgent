'use client';
import * as React from 'react';
import Link from 'next/link';
import { MeasurementContentCandidate, MeasurementContentGate, MeasurementDraft, KnowledgeAtom, QuestionAnswerMode, StudentAnswerPayload, QuestionRenderPayload } from '@study-agent/contracts';
import { apiBaseUrl, apiRequest } from '../../../lib/api';
import { StudyNav } from '../../../components/study-nav';
import { RichMath } from '../../../components/rich-math';
import { QuestionRenderer, createEmptyAnswerPayload } from '../../../components/question-renderer';
import '../../student/assessment/studio.css';
import '../workbench.css';
import './measurement.css';

type Detail = MeasurementContentCandidate & { sourcePreview: { html: string; answerHtml: string; analysisHtml: string; options: string[] };
  suggestion: { stem: string; answer: string; analysis: string; notice: string }; usable: boolean; blockers: string[];
  media: Array<{ index: number; originalUrl: string; url: string; available: boolean }> };
type Summary = Pick<MeasurementContentCandidate, 'id' | 'paperId' | 'position' | 'paperTitle' | 'sourceGrade' | 'sourceSubject' | 'version' | 'status' | 'reviews'> & { stem: string };
const gates: Record<MeasurementContentGate, { title: string; check: string }> = {
  source: { title: '来源资格', check: '核对完整原件、使用范围和许可凭据；研究归档资格与学生端发布资格分别判断。' },
  content: { title: '题面完整', check: '逐项核对文字、公式、表格、条件与选项，确认没有把答案图放入题面。' },
  media: { title: '媒体可用', check: '核对每个本地媒体及说明；若改写为纯文字，确认图中必要信息已经完整表达。' },
  scoring: { title: '评分有效', check: '对照达标与未达标金样本；主观题核对量规和示例，保留人工复核。' },
  mapping: { title: '知识测量', check: '核对主测行为、先修和次测、观察步骤；说明题族的任务结构，不用换数字或控件制造新题族。' },
};
const modes: Record<QuestionAnswerMode, string> = { numeric_blank: '数字 / 分数', text_blank: '文本填空', single_choice: '单选', multiple_choice: '多选', boolean: '判断',
  formula_blank: '公式', multi_blank: '多空', table_fill: '表格', matching: '配对', sorting: '排序', drag_drop: '分类', hotspot: '图上选择',
  geometry_draw: '作图', stepwise: '分步', image_upload: '图片作答', short_answer: '简答', audio_record: '录音' };
const dimensions = { understanding: '理解', procedure: '执行', transfer: '迁移', retention: '保持' };
const post = <T,>(path: string, body: unknown) => apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body) });
const route = (row: { id: string }, suffix = '') => `/measurement-content/candidates/${encodeURIComponent(row.id)}${suffix ? '/' + suffix : ''}`;
const json = (value: unknown) => JSON.stringify(value, null, 2);
const localHtml = (value: string) => value.replace(/src="\/api\/library\/media\?/g, `src="${apiBaseUrl}/api/library/media?`);
const readValue = (value: string): unknown => { try { return JSON.parse(value); } catch { return value; } };

function initialDraft(row: Detail): MeasurementDraft {
  const subject = row.sourceSubject === '语文' ? 'chinese' : row.sourceSubject === '英语' ? 'english' : row.sourceSubject === '化学' ? 'chemistry' : 'math';
  const number = '一二三四五六'.indexOf(row.sourceGrade.match(/[一二三四五六]/)?.[0] ?? '') + 1;
  return { subject, grade: number || 3, stem: row.suggestion.stem, analysis: row.suggestion.analysis,
    answer: readValue(row.suggestion.answer), blocks: [],
    answerSchema: { mode: subject === 'math' ? 'numeric_blank' : 'text_blank', responseShape: { value: subject === 'math' ? 'number' : 'string' }, validationRules: {}, gradingConfig: {} },
    mapping: { primaryAtomId: '', prerequisiteAtomIds: [], secondaryAtomIds: [], dimension: 'understanding', family: '', probeRole: 'anchor',
      expectedSeconds: 60, difficulty: 1, observationCode: 'response_mismatch', observedSteps: [], rationale: '', familyRationale: '' },
    license: { licenseClass: 'C_PUBLIC_REFERENCE_ONLY', evidence: '' },
    scoringCases: [{ response: readValue(row.suggestion.answer), expectedScore: 1, rationale: '' }, { response: '', expectedScore: 0, rationale: '' }] };
}

export default function MeasurementContentPage() {
  const [role, setRole] = React.useState(''), [paperId, setPaperId] = React.useState(''), [positions, setPositions] = React.useState('');
  const [filter, setFilter] = React.useState(''), [page, setPage] = React.useState(1), [list, setList] = React.useState<Summary[]>([]), [total, setTotal] = React.useState(0);
  const [row, setRow] = React.useState<Detail | null>(null), [draft, setDraft] = React.useState<MeasurementDraft | null>(null), [atoms, setAtoms] = React.useState<KnowledgeAtom[]>([]);
  const [answer, setAnswer] = React.useState(''), [blocks, setBlocks] = React.useState('[]'), [schema, setSchema] = React.useState('{}'), [cases, setCases] = React.useState('[]');
  const [reason, setReason] = React.useState(''), [busy, setBusy] = React.useState(false), [loading, setLoading] = React.useState(true), [dirty, setDirty] = React.useState(false);
  const [error, setError] = React.useState(''), [notice, setNotice] = React.useState(''), [previewAnswer, setPreviewAnswer] = React.useState<StudentAnswerPayload | null>(null);
  const receiptKeys = React.useRef(new Map<string, string>());
  const permitted = ['admin', 'teacher'].includes(role), editable = !!row && row.status !== 'published';
  const preview = React.useMemo<QuestionRenderPayload | null>(() => row?.draft ? ({ question: { id: `preview:${row.id}`, subject: row.draft.subject,
    type: 'objective', difficultyLevel: row.draft.mapping.difficulty, status: 'draft' },
    document: { questionId: `preview:${row.id}`, version: row.version, locale: 'zh-CN', blocks: [{ id: 'prompt', type: 'text', text: row.draft.stem }, ...row.draft.blocks], attachments: [], layoutMode: 'default', accessibilityConfig: {} },
    answerSchema: { ...row.draft.answerSchema, questionId: `preview:${row.id}`, gradingConfig: {} },
    source: { questionId: `preview:${row.id}`, sourceType: 'partner', sourceName: row.paperTitle, sourcePathOrUrl: '', licenseClass: row.draft.license.licenseClass, licenseName: null, importJobId: null, reviewStatus: 'pending', notes: null } }) : null, [row]);
  React.useEffect(() => { setPreviewAnswer(preview ? createEmptyAnswerPayload(preview) : null); }, [preview]);
  React.useEffect(() => { let alive = true; const params = new URLSearchParams(window.location.search); setPaperId(params.get('paper') ?? ''); setPositions(params.get('position') ?? '');
    apiRequest<{ role: string }>('/auth/me').then(user => { if (alive) setRole(user.role); }).catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; }; }, []);
  async function loadList() { const result = await apiRequest<{ items: Summary[]; total: number }>(`/measurement-content/candidates?page=${page}&pageSize=20${filter ? '&status=' + filter : ''}`); setList(result.items); setTotal(result.total); }
  React.useEffect(() => { if (!permitted) return; let alive = true; setLoading(true);
    apiRequest<{ items: Summary[]; total: number }>(`/measurement-content/candidates?page=${page}&pageSize=20${filter ? '&status=' + filter : ''}`).then(result => { if (alive) { setList(result.items); setTotal(result.total); } }).catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; }; }, [permitted, page, filter]);
  React.useEffect(() => { if (!permitted || !draft) return; let alive = true;
    apiRequest<KnowledgeAtom[]>(`/diagnostics/curriculum?subject=${draft.subject}&grade=${draft.grade}`).then(value => { if (alive) setAtoms(value); }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; }; }, [permitted, draft?.subject, draft?.grade]);
  React.useEffect(() => { if (!dirty) return; const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', prevent); return () => window.removeEventListener('beforeunload', prevent); }, [dirty]);
  function receive(value: Detail) { const next = value.draft ?? initialDraft(value); setRow(value); setDraft(next); setAnswer(json(next.answer)); setBlocks(json(next.blocks)); setSchema(json(next.answerSchema)); setCases(json(next.scoringCases)); setDirty(false); }
  async function act(work: () => Promise<void>) { setBusy(true); setError(''); setNotice(''); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : '操作未完成，请重试'); } finally { setBusy(false); } }
  async function open(item: Summary) { if (dirty && !window.confirm('当前编辑尚未保存，是否放弃编辑并打开另一题？')) return; await act(async () => { receive(await apiRequest<Detail>(route(item))); setReason(''); }); }
  function change(patch: Partial<MeasurementDraft>) { if (draft) { setDraft({ ...draft, ...patch }); setDirty(true); } }
  function mapping(patch: Partial<MeasurementDraft['mapping']>) { if (draft) change({ mapping: { ...draft.mapping, ...patch } }); }
  function body(action: string, value = {}) {
    const input = { expectedVersion: row!.version, reason, ...value }, identity = json({ id: row!.id, action, input });
    let requestKey = receiptKeys.current.get(identity); if (!requestKey) { requestKey = crypto.randomUUID(); receiptKeys.current.set(identity, requestKey); }
    return { ...input, requestKey };
  }
  async function mutate(action: string, value = {}) { if (!row) return; receive(await post<Detail>(route(row, action), body(action, value))); await loadList(); setNotice('已保存，可从审核历史追溯本次操作。'); }
  function chooseMode(mode: QuestionAnswerMode) {
    if (!draft) return;
    const value = { ...JSON.parse(schema), mode, responseShape: { value: mode === 'numeric_blank' ? 'number' : 'string' }, validationRules: {}, gradingConfig: {} };
    if (['short_answer', 'stepwise', 'geometry_draw', 'image_upload', 'audio_record'].includes(mode)) value.gradingConfig = { reviewRequired: true, rubric: [{ criterion: '请替换为本题可观察的达标行为', weight: 1 }] };
    setSchema(json(value)); change({ answerSchema: value });
  }
  const related = (field: 'prerequisiteAtomIds' | 'secondaryAtomIds') => <div className="measurement-related">{atoms.filter(atom => atom.id !== draft?.mapping.primaryAtomId).map(atom => <label key={atom.id}><input type="checkbox" disabled={!editable || busy} checked={draft!.mapping[field].includes(atom.id)} onChange={e => mapping({ [field]: e.target.checked ? [...draft!.mapping[field], atom.id] : draft!.mapping[field].filter(id => id !== atom.id) })} />{atom.name}</label>)}</div>;

  return <main className="learning-studio"><StudyNav /><div className="admin-workbench measurement-workbench">
    <nav className="admin-links" aria-label="教研导航"><Link href="/admin/curriculum">知识与覆盖</Link><Link href="/admin/measurement" aria-current="page">测量素材</Link><Link href="/admin/imports">资料导入</Link><Link href="/admin/reviews">评分复核</Link><Link href="/library">题卷审核</Link></nav>
    <span className="studio-eyebrow">ORIGINAL → EVIDENCE</span><h1>让一道原题，成为可信的观察。</h1><p>保留原件，分别核对题面、评分与知识行为。一次综合作答只为主测点产生证据，先修和次测线索留给后续验证。</p>
    {error && <p className="studio-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!role && <p>{loading ? '正在核对教研权限…' : '请先登录教研账号。'} <Link href="/parent/login">登录</Link></p>}
    {role && !permitted && <p>测量素材审核需要管理员或教师身份。<Link href="/parent/dashboard">返回家长空间</Link></p>}
    {permitted && <>
      <form className="measurement-stage" onSubmit={e => { e.preventDefault(); void act(async () => {
        const selected = positions.split(/[,，\s]+/).filter(Boolean).map(Number);
        const result = await post<{ items: Array<{ id?: string; position: number; issue?: string }>; created: number }>('/measurement-content/candidates', { paperId, positions: selected });
        await loadList(); setNotice(`新增 ${result.created} 份候选。${result.items.filter(item => item.issue).map(item => `第${item.position}题：${item.issue}`).join('；')}`);
        if (!dirty && result.items[0]?.id) receive(await apiRequest<Detail>(`/measurement-content/candidates/${encodeURIComponent(result.items[0].id)}`));
      }); }}><label>原卷标识<input value={paperId} onChange={e => setPaperId(e.target.value)} required maxLength={180} /></label><label>题目位置（逗号分隔，最多30题）<input value={positions} onChange={e => setPositions(e.target.value)} required placeholder="1, 2, 5" /></label><button className="studio-primary" disabled={busy}>保留原件并建立候选 ↗</button><Link href="/library">去题卷库选题</Link></form>
      <div className="measurement-layout"><aside><div className="measurement-list-head"><label>候选状态<select value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="">全部</option><option value="draft">待审核</option><option value="published">已发布</option><option value="withdrawn">已撤回</option></select></label><span aria-live="polite">{loading ? '正在加载…' : `${total} 份`}</span></div>
        <div className="measurement-list">{list.map(item => <button key={item.id} aria-pressed={row?.id === item.id} disabled={busy} onClick={() => void open(item)}><small>{item.sourceGrade} · {item.sourceSubject} · 第{item.position}题</small><strong>{item.stem || item.paperTitle}</strong><span>{item.status === 'published' ? '已发布' : item.status === 'withdrawn' ? '已撤回' : `${Object.values(item.reviews).filter(review => review.decision === 'approved').length}/5 已核实`}</span></button>)}</div>
        {!list.length && !loading && <p>还没有候选。从原卷选择题目后，在这里逐项整理。</p>}
        {total > 20 && <div className="admin-toolbar"><button disabled={busy || page === 1} onClick={() => setPage(page - 1)}>上一页</button><span>{page}/{Math.ceil(total / 20)}</span><button disabled={busy || page * 20 >= total} onClick={() => setPage(page + 1)}>下一页</button></div>}</aside>
        <section className="measurement-detail">{!row || !draft ? <div className="studio-empty"><h2>原卷在左，证据在后。</h2><p>选择候选后，对照原件整理可作答版本。保存编辑会使五项审核重新等待核实。</p></div> : <>
          <div className="measurement-detail-head"><div><small>{row.paperTitle} · 第{row.position}题 · 修订{row.version}</small><h2>{row.status === 'published' ? '当前发布版本' : '逐项核对这一题'}</h2></div><span className={row.usable ? 'measurement-approved' : 'measurement-pending'}>{row.usable ? '可用于新评测' : '尚未进入新评测'}</span></div>
          <details className="measurement-original" open><summary>原始题面、答案与来源快照</summary><RichMath html={localHtml(row.sourcePreview.html)} />{row.sourcePreview.options.map((option, index) => <RichMath key={index} html={localHtml(option)} />)}<details><summary>对照原始答案与解析</summary><RichMath html={localHtml(row.sourcePreview.answerHtml)} /><RichMath html={localHtml(row.sourcePreview.analysisHtml)} /></details><p>{row.suggestion.notice}</p><Link href={`/library?paper=${encodeURIComponent(row.paperId)}`}>查看完整原卷 ↗</Link><details><summary>不可变原始数据与哈希</summary><p>{row.sourceHash}</p><pre>{json(row.original)}</pre></details></details>
          <fieldset disabled={!editable || busy} className="measurement-fields"><legend>可作答版本</legend><div className="admin-form"><label>学科<select value={draft.subject} onChange={e => change({ subject: e.target.value as MeasurementDraft['subject'] })}><option value="math">数学</option><option value="chinese">语文</option><option value="english">英语</option></select></label><label>原卷适用年级<input type="number" min={1} max={6} value={draft.grade} onChange={e => change({ grade: Number(e.target.value) })} /></label><label className="wide">完整题干<textarea rows={4} maxLength={12000} value={draft.stem} onChange={e => change({ stem: e.target.value })} /></label><label className="wide">参考答案（文字可直接填写；数组或多步骤使用JSON）<textarea rows={2} value={answer} onChange={e => { setAnswer(e.target.value); setDirty(true); }} /></label><label className="wide">解析与关键步骤<textarea rows={3} value={draft.analysis} onChange={e => change({ analysis: e.target.value })} /></label>
            <label>作答方式<select value={draft.answerSchema.mode} onChange={e => { try { chooseMode(e.target.value as QuestionAnswerMode); } catch { setError('请先修正交互协议的JSON格式'); } }}>{Object.entries(modes).map(([mode, title]) => <option key={mode} value={mode}>{title}</option>)}</select></label><label>主测知识点<select value={draft.mapping.primaryAtomId} onChange={e => mapping({ primaryAtomId: e.target.value })}><option value="">请选择可观察行为</option>{atoms.map(atom => <option key={atom.id} value={atom.id}>{atom.grade}年级 · {atom.name}</option>)}</select></label>
            <label>测量维度<select value={draft.mapping.dimension} onChange={e => mapping({ dimension: e.target.value as MeasurementDraft['mapping']['dimension'] })}>{Object.entries(dimensions).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label><label>验证角色<select value={draft.mapping.probeRole} onChange={e => mapping({ probeRole: e.target.value as MeasurementDraft['mapping']['probeRole'] })}>{Object.entries({ anchor: '基础锚点', prerequisite: '前置核查', contrast: '对照验证', transfer: '迁移任务', retention: '保持任务' }).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
            <label>题族标识<input value={draft.mapping.family} maxLength={180} onChange={e => mapping({ family: e.target.value })} /></label><label>错误观察编码<input value={draft.mapping.observationCode} maxLength={100} onChange={e => mapping({ observationCode: e.target.value })} /></label><label>预计秒数<input type="number" min={5} max={1200} value={draft.mapping.expectedSeconds} onChange={e => mapping({ expectedSeconds: Number(e.target.value) })} /></label><label>难度梯度（规则标注，尚未经常模标定）<input type="number" min={1} max={5} value={draft.mapping.difficulty} onChange={e => mapping({ difficulty: Number(e.target.value) })} /></label>
            <label className="wide">观察步骤（每行一条）<textarea rows={3} value={draft.mapping.observedSteps.join('\n')} onChange={e => mapping({ observedSteps: e.target.value.split('\n') })} /></label><label className="wide">主测映射依据<textarea rows={3} value={draft.mapping.rationale} onChange={e => mapping({ rationale: e.target.value })} /></label><label className="wide">题族结构依据<textarea rows={3} value={draft.mapping.familyRationale} onChange={e => mapping({ familyRationale: e.target.value })} placeholder="说明要完成的任务结构、与已有题族的差别及可能干扰" /></label>
          </div><details><summary>先修与次测线索</summary><h3>先修点（必须属于知识先修图）</h3>{related('prerequisiteAtomIds')}<h3>次测点（只作分析线索）</h3>{related('secondaryAtomIds')}</details>
          <div className="admin-form"><label>使用资格<select value={draft.license.licenseClass} onChange={e => change({ license: { ...draft.license, licenseClass: e.target.value as MeasurementDraft['license']['licenseClass'] } })}><option value="C_PUBLIC_REFERENCE_ONLY">仅研究参考</option><option value="A_INTERNAL">内部原创 / 自有</option><option value="B_OPEN">开放许可</option><option value="D_COMMERCIAL_PARTNER">合作授权</option></select></label><label>许可凭据与使用范围<textarea rows={3} value={draft.license.evidence} onChange={e => change({ license: { ...draft.license, evidence: e.target.value } })} /></label></div>
          <details><summary>交互协议、量规与富媒体内容</summary><p>复杂题型需要完整配置。媒体地址仅能来自此题题干/选项，服务端会复核。</p><label>交互和评分协议<textarea className="measurement-code" rows={8} value={schema} onChange={e => { setSchema(e.target.value); setDirty(true); }} /></label><label>附加内容块（文字、公式、表格、图片或音频）<textarea className="measurement-code" rows={7} value={blocks} onChange={e => { setBlocks(e.target.value); setDirty(true); }} /></label>{row.media.map(media => <p key={media.index}>{media.available ? '已核验' : '待核验'} · <code>{media.url}</code></p>)}</details>
          <details open><summary>评分金样本</summary><p>至少一份达标与一份未达标响应，附逐例理由；确定性题在保存时逐例重放，主观题供量规人工审核。</p><textarea aria-label="评分金样本JSON" className="measurement-code" rows={8} value={cases} onChange={e => { setCases(e.target.value); setDirty(true); }} /></details></fieldset>
          <label className="measurement-reason">本次编辑 / 审核依据<textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} minLength={10} maxLength={2000} placeholder="写明核实了什么、依据是什么，以及仍存在的限制" /></label>
          <div className="admin-toolbar"><button className="studio-primary" disabled={busy || !editable || reason.trim().length < 10} onClick={() => void act(async () => { const value = { ...draft, answer: readValue(answer), blocks: JSON.parse(blocks), answerSchema: JSON.parse(schema), scoringCases: JSON.parse(cases) }; await mutate('draft', { draft: value }); })}>保存可作答版本</button><span role="status">{dirty ? '有未保存的编辑' : '当前版本已从服务器读取'}</span></div>
          <div className="measurement-gates">{Object.entries(gates).map(([gate, info]) => { const review = row.reviews[gate as MeasurementContentGate]; return <article key={gate}><div><h3>{info.title}</h3><span>{review?.decision === 'approved' ? '已核实' : review?.decision === 'rejected' ? '需修正' : '待核实'}</span></div><p>{info.check}</p>{review && <p>{review.reason}</p>}<div><button className="studio-secondary" disabled={busy || dirty || !editable || !row.draft || reason.trim().length < 10} onClick={() => void act(() => mutate('reviews', { gate, decision: 'approved' }))}>核实通过</button><button className="studio-text-button" disabled={busy || dirty || !editable || !row.draft || reason.trim().length < 10} onClick={() => void act(() => mutate('reviews', { gate, decision: 'rejected' }))}>退回修正</button></div></article>; })}</div>
          {!!row.blockers.length && <div className="measurement-blockers"><strong>发布前还需处理</strong>{row.blockers.map((blocker, index) => <p key={index}>{blocker}</p>)}</div>}
          <div className="admin-toolbar"><button className="studio-primary" disabled={busy || dirty || row.status === 'published' || row.blockers.length > 0 || reason.trim().length < 10} onClick={() => void act(() => mutate('publish'))}>发布到测量题库 ↗</button><button className="studio-secondary" disabled={busy || row.status !== 'published' || reason.trim().length < 10} onClick={() => void act(() => mutate('withdraw'))}>撤回当前发布</button></div>
          {preview && <details className="measurement-preview"><summary>试作答已保存版本（不产生学生证据）</summary><QuestionRenderer renderPayload={preview} answer={previewAnswer} onChange={setPreviewAnswer} /></details>}
          <details className="measurement-history"><summary>审核与发布历史 · {row.history.length}</summary>{[...row.history].reverse().map((entry, index) => <article key={index}><strong>修订{entry.version} · {entry.action}</strong><time>{new Date(entry.at).toLocaleString('zh-CN')}</time><p>{entry.reason}</p>{entry.draft && <details><summary>查看当时保存的完整内容</summary><pre>{json(entry.draft)}</pre></details>}</article>)}</details>
        </>}</section></div>
    </>}
  </div></main>;
}

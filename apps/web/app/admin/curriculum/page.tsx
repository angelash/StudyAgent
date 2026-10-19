'use client';

import * as React from 'react';
import Link from 'next/link';
import type { CurriculumBook, KnowledgeAtom, MeasurementItem, Question, Subject, TextbookAtomMapping } from '@study-agent/contracts';
import { apiRequest, getAuthToken } from '../../../lib/api';
import { StudyNav } from '../../../components/study-nav';
import '../../student/assessment/studio.css';
import '../workbench.css';

type CoverageAtom = KnowledgeAtom & { approvedQuestions: number; families: number; dimensions: string[]; draftMappings: number };
type Overview = { atoms: CoverageAtom[]; cells: Array<{ subject: Subject; grade: number; atoms: number; withQuestions: number; withTransfer: number; withMultipleFamilies: number }>;
  notice: string; textbookCounts: { imported: number; withChapters: number; approvedMappings: number } };
type BookSummary = Omit<CurriculumBook, 'chapters'> & { lessonCount: number; mappedLessonCount: number };
type Detail = Omit<CurriculumBook, 'chapters'> & { chapters: Array<{ id: string; name: string; lessons: Array<{ id: string; name: string; atomIds: string[]; mappingState: string; mapping: TextbookAtomMapping | null }> }> };
type Item = { mapping: MeasurementItem; question: Question; answerSchema: unknown; source: unknown };
const req = <T,>(path: string, body?: unknown) => apiRequest<T>(path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }, getAuthToken());
const subjects = { math: '数学', chinese: '语文', english: '英语' };
const dimensions = { understanding: '理解', procedure: '执行', transfer: '迁移', retention: '保持' };

export default function CurriculumPage() {
  const [subject, setSubject] = React.useState<Subject>('math'), [grade, setGrade] = React.useState(3), [term, setTerm] = React.useState<'upper' | 'lower'>('upper');
  const [data, setData] = React.useState<Overview | null>(null), [role, setRole] = React.useState(''), [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false), [notice, setNotice] = React.useState('');
  const [atom, setAtom] = React.useState<KnowledgeAtom | null>(null), [items, setItems] = React.useState<Item[]>([]), [mapping, setMapping] = React.useState<MeasurementItem | null>(null);
  const [books, setBooks] = React.useState<BookSummary[]>([]), [bookId, setBookId] = React.useState(''), [book, setBook] = React.useState<Detail | null>(null);
  const [lessonId, setLessonId] = React.useState(''), [mappedIds, setMappedIds] = React.useState<string[]>([]), [rationale, setRationale] = React.useState('');
  const [revisions, setRevisions] = React.useState<unknown[] | null>(null);
  const selected = data?.atoms.filter(a => a.grade === grade) ?? [], lesson = book?.chapters.flatMap(c => c.lessons).find(l => l.id === lessonId);

  async function reload() { const overview = await req<Overview>(`/admin/curriculum/overview?subject=${subject}`); setData(overview); }
  async function act(fn: () => Promise<void>, message = '已保存，历史版本已保留') {
    setBusy(true); setError(''); setNotice(''); try { await fn(); setNotice(message); } catch (e) { setError(e instanceof Error ? e.message : '操作未完成'); } finally { setBusy(false); }
  }
  React.useEffect(() => { let alive = true; req<{ role: string }>('/auth/me').then(u => { if (alive) setRole(u.role); }).catch(e => { if (alive) setError(e.message); }); return () => { alive = false; }; }, []);
  React.useEffect(() => { if (!['admin', 'teacher'].includes(role)) return; let alive = true;
    req<Overview>(`/admin/curriculum/overview?subject=${subject}`).then(d => { if (alive) { setData(d); setAtom(null); setItems([]); setMapping(null); } }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; }; }, [role, subject]);
  React.useEffect(() => { if (!role) return; let alive = true; setBook(null); setBookId(''); setLessonId('');
    req<BookSummary[]>(`/diagnostics/textbooks?subject=${subject}&grade=${grade}&term=${term}`).then(b => { if (alive) setBooks(b); }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; }; }, [role, subject, grade, term]);
  React.useEffect(() => { if (!bookId) return; let alive = true;
    req<Detail>(`/admin/curriculum/textbooks/${encodeURIComponent(bookId)}`).then(b => { if (alive) setBook(b); }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; }; }, [bookId]);
  async function openAtom(a: KnowledgeAtom) {
    setAtom({ id: a.id, subject: a.subject, name: a.name, strand: a.strand, grade: a.grade, term: a.term,
      objective: a.objective, successCriterion: a.successCriterion, prerequisiteIds: [...a.prerequisiteIds], curriculumVersion: a.curriculumVersion, status: a.status, version: a.version });
    setMapping(null); setRevisions(null); setItems(await req<Item[]>(`/admin/curriculum/atoms/${encodeURIComponent(a.id)}/items`));
  }
  function newMapping() { if (atom) setMapping({ id: `mapping:${crypto.randomUUID()}`, questionId: '', questionVersion: 1, atomId: atom.id,
    dimension: 'understanding', family: '', probeRole: 'anchor', expectedSeconds: 60, difficulty: 1, reviewStatus: 'draft', mappingWeight: 1, observationCode: 'response_mismatch', version: 1 }); }
  function newAtom() { setAtom({ id: `authored:${subject}:${crypto.randomUUID()}`, subject, grade, term: 'both', name: '', strand: '', objective: '', successCriterion: '',
    prerequisiteIds: [], curriculumVersion: 'authored-v1', status: 'draft', version: 1 }); setItems([]); setMapping(null); setRevisions(null); }

  return <main className="learning-studio"><StudyNav /><div className="admin-workbench">
    <nav className="admin-links" aria-label="教研导航"><Link href="/admin/curriculum" aria-current="page">知识与覆盖</Link><Link href="/admin/reviews">评分复核</Link><Link href="/admin/content">内容生产</Link><Link href="/library">题卷审核</Link><Link href="/admin/analytics">运营观察</Link></nav>
    <span className="studio-eyebrow">CURRICULUM / EVIDENCE</span><h1>每一个点，都能追到依据。</h1><p>把知识定义、题目量规与教材进度分别审核。缺题、缺维度和缺映射会保留在覆盖视图中。</p>
    {error && <p className="studio-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!role && <p>正在核对教研权限… <Link href="/parent/login">登录</Link></p>}
    {role && !['admin', 'teacher'].includes(role) && <p>此页面需要教研权限。<Link href="/parent/dashboard">返回家长空间</Link></p>}
    {data && <>
      <div className="admin-toolbar"><label>学科<select value={subject} onChange={e => setSubject(e.target.value as Subject)}>{Object.entries(subjects).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label><label>学期<select value={term} onChange={e => setTerm(e.target.value as 'upper' | 'lower')}><option value="upper">上学期</option><option value="lower">下学期</option></select></label><button className="studio-secondary" onClick={() => act(reload, '已刷新当前有效覆盖')} disabled={busy}>刷新覆盖</button></div>
      <div className="admin-grade-map" aria-label="年级覆盖">{data.cells.map(c => <button key={c.grade} aria-pressed={grade === c.grade} onClick={() => { setGrade(c.grade); setAtom(null); }}><strong>{c.grade}年级</strong><small>{c.withQuestions}/{c.atoms} 点有有效题</small><small>{c.withMultipleFamilies} 点有多题族 · {c.withTransfer} 点有迁移题</small></button>)}</div>
      <p>{data.notice}</p>
      <div className="admin-columns"><section><div className="studio-point-heading"><h2>{grade}年级 · {subjects[subject]}</h2><button className="studio-text-button" onClick={newAtom}>新增原子点</button></div><div className="admin-atom-list">{selected.map(a => <button key={a.id} aria-pressed={atom?.id === a.id} onClick={() => act(() => openAtom(a), '已读取知识定义和题目映射')}><strong>{a.name}</strong><small>{a.strand} · {a.status === 'published' ? '已发布' : a.status === 'draft' ? '草稿' : '已停用'} · v{a.version}</small><small className={a.approvedQuestions ? '' : 'admin-gap'}>{a.approvedQuestions} 道有效题 · {a.families} 个题族 · {a.dimensions.map(d => dimensions[d as keyof typeof dimensions]).join(' / ') || '量化维度待补'}</small></button>)}</div></section>
        <section className="admin-editor">{!atom ? <><h2>从一个可观察的行为开始</h2><p>选择左侧知识点查看定义、先修关系和有效题；新增定义后仍需配置题目来源、评分与知识映射。</p></> : <>
          <span className="studio-eyebrow">ATOM / v{atom.version}</span><h2>{atom.name || '新知识点'}</h2><p>{atom.objective}</p><p>达标条件：{atom.successCriterion}</p>
          <details><summary>编辑定义与先修关系</summary><div className="admin-form">
            <label className="wide">稳定标识<input value={atom.id} disabled={data.atoms.some(a => a.id === atom.id)} onChange={e => setAtom({ ...atom, id: e.target.value })} maxLength={180} /></label>
            <label>名称<input value={atom.name} onChange={e => setAtom({ ...atom, name: e.target.value })} maxLength={120} /></label><label>领域<input value={atom.strand} onChange={e => setAtom({ ...atom, strand: e.target.value })} maxLength={120} /></label>
            <label>建议年级<select value={atom.grade} onChange={e => setAtom({ ...atom, grade: Number(e.target.value) })}>{[1,2,3,4,5,6].map(g => <option key={g} value={g}>{g}年级</option>)}</select></label>
            <label>状态<select value={atom.status} onChange={e => setAtom({ ...atom, status: e.target.value as KnowledgeAtom['status'] })}><option value="draft">草稿</option><option value="published">发布</option><option value="retired">停用</option></select></label>
            <label className="wide">可观察目标<textarea value={atom.objective} onChange={e => setAtom({ ...atom, objective: e.target.value })} rows={3} maxLength={1000} /></label>
            <label className="wide">成功标准<textarea value={atom.successCriterion} onChange={e => setAtom({ ...atom, successCriterion: e.target.value })} rows={3} maxLength={1000} /></label>
            <div className="wide"><label>前置知识（同科且不高于本点建议年级）</label><div className="admin-checks">{data.atoms.filter(a => a.id !== atom.id && a.grade <= atom.grade).map(a => <label key={a.id}><input type="checkbox" checked={atom.prerequisiteIds.includes(a.id)} onChange={e => setAtom({ ...atom, prerequisiteIds: e.target.checked ? [...atom.prerequisiteIds, a.id] : atom.prerequisiteIds.filter(id => id !== a.id) })} />{a.grade}年级 · {a.name}</label>)}</div></div>
          </div><button className="studio-primary" disabled={busy} onClick={() => act(async () => { const saved = await req<KnowledgeAtom>('/admin/knowledge-atoms', atom); await reload(); setAtom(saved); })}>保存定义并保留版本</button></details>
          <div className="studio-point-heading"><h3>题目与量化映射</h3><button className="studio-text-button" onClick={newMapping}>新增映射</button></div>
          {mapping && <div className="admin-form"><label className="wide">题目标识<input value={mapping.questionId} onChange={e => setMapping({ ...mapping, questionId: e.target.value })} /></label>
            <label>题目版本<input type="number" min={1} value={mapping.questionVersion} onChange={e => setMapping({ ...mapping, questionVersion: Number(e.target.value) })} /></label>
            <label>维度<select value={mapping.dimension} onChange={e => setMapping({ ...mapping, dimension: e.target.value as MeasurementItem['dimension'] })}>{Object.entries(dimensions).map(([v,t]) => <option key={v} value={v}>{t}</option>)}</select></label>
            <label className="wide">题族（相同生成或解法结构共用同一题族）<input value={mapping.family} onChange={e => setMapping({ ...mapping, family: e.target.value })} maxLength={180} /></label>
            <label>预计秒数<input type="number" min={5} max={1200} value={mapping.expectedSeconds} onChange={e => setMapping({ ...mapping, expectedSeconds: Number(e.target.value) })} /></label>
            <label>审核结果<select value={mapping.reviewStatus} onChange={e => setMapping({ ...mapping, reviewStatus: e.target.value as MeasurementItem['reviewStatus'] })}><option value="draft">待审核</option><option value="approved">审核通过</option><option value="rejected">拒绝</option></select></label>
            <button className="studio-primary wide" disabled={busy} onClick={() => act(async () => { await req('/admin/measurement-items', mapping); await reload(); setItems(await req<Item[]>(`/admin/curriculum/atoms/${encodeURIComponent(atom.id)}/items`)); setMapping(null); })}>保存映射版本</button>
          </div>}
          <div className="admin-items">{items.map(({ mapping: m, question }) => <article key={m.id}><div><span>{dimensions[m.dimension]} · {m.reviewStatus} · v{m.version}</span><span>{m.expectedSeconds}秒</span></div><p>{question?.stem ?? '题目不可用'}</p><small>题族：{m.family}</small><details><summary>参考响应与来源</summary><pre>{JSON.stringify({ answer: question?.answer, questionId: m.questionId, version: m.questionVersion }, null, 2)}</pre></details><button className="studio-text-button" onClick={() => setMapping({ ...m })}>复核此映射</button></article>)}</div>
          <button className="studio-text-button" onClick={() => act(async () => setRevisions(await req<unknown[]>(`/admin/curriculum/revisions/${encodeURIComponent(atom.id)}`)), '已读取历史版本')}>查看定义修改记录</button>
          {revisions && <pre className="admin-revision">{JSON.stringify(revisions, null, 2)}</pre>}
        </>}</section></div>
      <section className="admin-section"><span className="studio-eyebrow">TEXTBOOK / PROGRESS</span><h2>教材课时与知识映射</h2><p>已迁入 {data.textbookCounts.imported} 条教材记录，其中 {data.textbookCounts.withChapters} 条具有章节；已人工确认 {data.textbookCounts.approvedMappings} 条映射。只有审核通过且知识定义仍有效的映射进入学生范围。</p>
        <label>选择目录<select value={bookId} onChange={e => { setBookId(e.target.value); setLessonId(''); setBook(null); }}><option value="">请选择</option>{books.map(b => <option key={b.id} value={b.id}>{b.edition} · {b.title} · {b.mappedLessonCount}/{b.lessonCount}课时</option>)}</select></label>
        {book && <div className="admin-columns"><div className="admin-lesson-list">{book.chapters.length ? book.chapters.map(c => <details key={c.id} open><summary>{c.name}</summary>{c.lessons.map(l => <button key={l.id} aria-pressed={lessonId === l.id} onClick={() => { setLessonId(l.id); setMappedIds(l.mapping?.atomIds ?? l.atomIds); setRationale(l.mapping?.rationale ?? ''); }}><strong>{l.name}</strong><small>{l.mappingState === 'approved' ? '已审核' : l.mappingState === 'candidate' ? '候选映射' : '待映射'} · {l.atomIds.length}点</small></button>)}</details>) : <p>原始目录未提供章节树；保留教材信息，不能虚构课时。学生可按知识点确认实际进度。</p>}</div>
          <div>{lesson && <><h3>{lesson.name}</h3><label>关联的可观察知识点</label><div className="admin-checks">{data.atoms.filter(a => a.grade <= grade && a.status === 'published').map(a => <label key={a.id}><input type="checkbox" checked={mappedIds.includes(a.id)} onChange={e => setMappedIds(e.target.checked ? [...mappedIds, a.id] : mappedIds.filter(id => id !== a.id))} />{a.grade}年级 · {a.name}</label>)}</div>
            <label>对齐依据与范围限制<textarea value={rationale} onChange={e => setRationale(e.target.value)} rows={4} maxLength={2000} placeholder="说明课时中的行为如何与知识定义相符，记录未覆盖的部分" /></label>
            <div className="admin-toolbar">{([['candidate','保存候选'], ['approved','审核通过'], ['rejected','拒绝映射']] as const).map(([status,title]) => <button key={status} className={status === 'approved' ? 'studio-primary' : 'studio-secondary'} disabled={busy || !mappedIds.length || rationale.trim().length < 8} onClick={() => act(async () => { await req('/admin/curriculum/textbook-mappings', { bookId, lessonId, atomIds: mappedIds, status, rationale }); setBook(await req<Detail>(`/admin/curriculum/textbooks/${encodeURIComponent(bookId)}`)); await reload(); })}>{title}</button>)}</div>
          </>}</div></div>}
      </section>
    </>}
  </div></main>;
}

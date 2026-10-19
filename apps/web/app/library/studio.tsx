'use client';
import * as React from 'react';
import Link from 'next/link';
import { apiBaseUrl, apiRequest } from '../../lib/api';
import '../student/assessment/studio.css';
import './library.css';
import '../student/today/today.css';
import { StudyNav } from '../../components/study-nav';
import { RichMath } from '../../components/rich-math';

type Paper = { id: string; title: string; grade: string; subject: string; province: string; paperType: string;
  year: number | null; state: string; available: number; expected: number | null; missing: number | null;
  hasPdf: boolean; flags: string[]; publicationStatus: string; bookmarked: boolean };
type Preview = Paper & { notice: string; source: string; missingMedia: number; pdf: string | null;
  questions: Array<{ position: number; id: string; missing: boolean; html: string; options: string[]; answerHtml?: string; analysisHtml?: string }> };
type Overview = { ready: boolean; researchAccess: boolean; measurementAccess: boolean; research: { papers: number; questions: number } | null; published: number; bookmarks: number; notice: string };
type Facets = Record<string, Array<{ value: string; count: number }>>;
const stateNames: Record<string, string> = { complete: '结构完整', partial: '部分题目缺失', pdf: '原始 PDF', unknown: '待核查' };
const publicationNames: Record<string, string> = { published: '已发布', withdrawn: '已撤回', unreviewed: '待审核' };
const failure = (error: unknown) => error instanceof Error ? error.message : '加载失败，请重试';
// API markup already passed an allow-list sanitizer. Only local authenticated media are embedded.
const localHtml = (value: string) => value.replace(/src="\/api\/library\/media\?/g, `src="${apiBaseUrl}/api/library/media?`);

export function LibraryStudio() {
  const [overview, setOverview] = React.useState<Overview | null>(null), [facets, setFacets] = React.useState<Facets>({});
  const [collection, setCollection] = React.useState('published'), [query, setQuery] = React.useState(''), [search, setSearch] = React.useState('');
  const [grade, setGrade] = React.useState(''), [subject, setSubject] = React.useState(''), [state, setState] = React.useState('');
  const [page, setPage] = React.useState(1), [total, setTotal] = React.useState(0), [papers, setPapers] = React.useState<Paper[]>([]);
  const [paper, setPaper] = React.useState<Preview | null>(null), [answers, setAnswers] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState(''), [loading, setLoading] = React.useState(true), [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(''), [license, setLicense] = React.useState(''), [reviewed, setReviewed] = React.useState(false);
  const [refresh, setRefresh] = React.useState(0), [authenticated, setAuthenticated] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    apiRequest<Overview>('/library/overview').then(async (value) => {
      if (!alive) return;
      setOverview(value); setAuthenticated(true);
      if (value.ready) { const filters = await apiRequest<Facets>('/library/facets'); if (alive) setFacets(filters); }
      const id = new URLSearchParams(window.location.search).get('paper');
      if (id && alive) setSelectedId(id);
    }).catch((caught) => { if (alive) setError(failure(caught)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refresh]);
  React.useEffect(() => {
    if (!overview?.ready) return;
    let alive = true; setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), pageSize: '20', collection });
    if (search) params.set('q', search); if (grade) params.set('grade', grade); if (subject) params.set('subject', subject); if (state) params.set('state', state);
    apiRequest<{ items: Paper[]; total: number }>(`/library/papers?${params}`).then((value) => { if (alive) { setPapers(value.items); setTotal(value.total); } })
      .catch((caught) => { if (alive) setError(failure(caught)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [overview?.ready, search, grade, subject, state, page, collection, refresh]);
  React.useEffect(() => {
    if (!selectedId) { setPaper(null); return; }
    let alive = true; setBusy(true); setError('');
    apiRequest<Preview>(`/library/papers/${encodeURIComponent(selectedId)}?answers=${answers}`).then((value) => { if (alive) setPaper(value); })
      .catch((caught) => { if (alive) setError(failure(caught)); }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [selectedId, answers, refresh]);
  function select(id: string) { setSelectedId(id); setAnswers(false); setLicense(''); setReviewed(false); window.history.replaceState({}, '', id ? `?paper=${encodeURIComponent(id)}` : '/library'); window.scrollTo({ top: 0 }); }
  async function bookmark(value: Paper) {
    try { await apiRequest(`/library/papers/${encodeURIComponent(value.id)}/bookmark`, { method: 'PATCH', body: JSON.stringify({ bookmarked: !value.bookmarked }) });
      setRefresh((v) => v + 1); } catch (caught) { setError(failure(caught)); }
  }
  async function publish(status: 'published' | 'withdrawn') {
    if (!paper) return; setBusy(true); setError('');
    try { await apiRequest(`/library/papers/${encodeURIComponent(paper.id)}/publication`, { method: 'POST', body: JSON.stringify({
      status, licenseEvidence: license, contentReviewed: reviewed, mediaReviewed: reviewed,
      reason: status === 'published' ? '教研已逐项确认来源、内容与本地媒体' : '教研复核后撤回此版本，请查看来源说明',
    }) }); setRefresh((v) => v + 1); } catch (caught) { setError(failure(caught)); } finally { setBusy(false); }
  }
  return <main className="learning-studio paper-library">
    <div className="library-no-print"><StudyNav current="library" /></div>
    <div className="library-layout">
      {error && <div className="studio-error library-no-print" role="alert">{error}<button aria-label="关闭提示" onClick={() => setError('')}>×</button></div>}
      {!authenticated && !loading ? <div className="studio-empty"><h1>把好内容，留给每一次练习。</h1><p>登录后查看可用试卷与收藏。教研账号可审核迁入的原始资料。</p><Link className="studio-primary" href="/parent/login">登录或创建账号 ↗</Link></div> :
        selectedId && paper ? <>
          <div className="library-toolbar library-no-print"><button className="studio-text-button" onClick={() => select('')}>← 返回题卷库</button><div><button className="studio-secondary" onClick={() => bookmark(paper)}>{paper.bookmarked ? '取消收藏' : '收藏试卷'}</button><button className="studio-secondary" onClick={() => setAnswers(!answers)} disabled={busy}>{answers ? '收起参考答案' : '查看参考答案'}</button><button className="studio-primary" onClick={() => window.print()}>打印 / 存为 PDF</button></div></div>
          <article className="library-paper"><header><span className="studio-eyebrow">{paper.grade} / {paper.subject} / {paper.province}</span><h1>{paper.title}</h1><p>{paper.source} · {stateNames[paper.state]} · {publicationNames[paper.publicationStatus]}</p></header>
            <div className="library-notice">{paper.notice}{paper.missingMedia > 0 && <p>有 {paper.missingMedia} 项媒体暂不可用，预览中已标明。</p>}{paper.flags.length > 0 && <p>来源元数据存在待核查项，请核对题名与适用范围。</p>}</div>
            {paper.pdf ? <div className="library-pdf library-no-print"><a className="studio-primary" href={`${apiBaseUrl}${paper.pdf}`} target="_blank" rel="noreferrer">打开原始 PDF ↗</a><p>可在 PDF 页面中阅读、打印或保存原件。</p><iframe title="原始试卷 PDF" src={`${apiBaseUrl}${paper.pdf}`} /></div> : paper.state === 'pdf' ? <p>原始 PDF 尚未完成本地校验。</p> : null}
            {paper.questions.map((question) => <section className="library-question" key={question.position}><span className="library-question-number">{String(question.position).padStart(2, '0')}</span><div>{question.missing ? <p className="library-missing">原始资料缺少此题，保留原位置。</p> : <><RichMath html={localHtml(question.html)} />{question.options.map((option, index) => <RichMath key={index} html={localHtml(option)} />)}{answers && <details open className="library-answer"><summary>参考答案与原始解析</summary>{question.answerHtml ? <RichMath html={localHtml(question.answerHtml)} /> : <p>原始资料未提供可展示答案。</p>}{question.analysisHtml && <RichMath html={localHtml(question.analysisHtml)} />}</details>}{overview?.measurementAccess && <Link className="studio-text-button library-no-print" href={`/admin/measurement?paper=${encodeURIComponent(paper.id)}&position=${question.position}`}>整理为测量素材 ↗</Link>}</>}</div></section>)}
          </article>
          {overview?.researchAccess && <section className="library-review library-no-print"><span className="studio-eyebrow">教研审核 / 可撤回的发布版本</span><h2>确认后进入家庭练习库</h2><p>请核对适用年级、原卷完整度、答案和每一张插图；用于量化评测还需单独审核评分与原子知识点映射。</p><label>来源许可与核查说明<textarea value={license} onChange={(e) => setLicense(e.target.value)} rows={3} placeholder="填写可用于家庭练习的许可依据与核查结果" /></label><label className="library-check"><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />已逐项复核内容、缺题说明与本地媒体，确认许可依据</label><div><button className="studio-primary" disabled={busy || !reviewed || license.trim().length < 10} onClick={() => publish('published')}>审核并发布</button>{paper.publicationStatus === 'published' && <button className="studio-secondary" disabled={busy || !reviewed || license.trim().length < 10} onClick={() => publish('withdrawn')}>撤回发布</button>}</div></section>}
        </> : <>
          <div className="studio-section-head library-heading"><span className="studio-eyebrow">PAPER & PRACTICE / 题卷资料库</span><h1>让每一份练习，<br /><em>都有来处。</em></h1><p>{overview?.notice ?? '正在连接本地题卷库…'}</p></div>
          {overview?.research && <div className="library-totals"><div><strong>{overview.research.papers.toLocaleString()}</strong><span>原始试卷</span></div><div><strong>{overview.research.questions.toLocaleString()}</strong><span>已索引题目</span></div><div><strong>{overview.published}</strong><span>审核后发布</span></div></div>}
          <div className="studio-subjects library-tabs" role="group" aria-label="资料范围">{[['published', '家庭练习库'], ['bookmarks', '我的收藏'], ...(overview?.researchAccess ? [['research', '原始教研资料']] : [])].map(([key, label]) => <button key={key} aria-pressed={collection === key} onClick={() => { setCollection(key); setPage(1); }}>{label}</button>)}</div>
          <form className="library-filters" onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); setPage(1); }}><label className="library-search">搜索试卷<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="试卷名称、学年或单元" maxLength={100} /></label><label>年级<select value={grade} onChange={(e) => { setGrade(e.target.value); setPage(1); }}><option value="">全部年级</option>{facets.grade?.map(({ value }) => value && <option key={value}>{value}</option>)}</select></label><label>学科<select value={subject} onChange={(e) => { setSubject(e.target.value); setPage(1); }}><option value="">全部学科</option>{facets.subject?.map(({ value }) => value && <option key={value}>{value}</option>)}</select></label><label>完整度<select value={state} onChange={(e) => { setState(e.target.value); setPage(1); }}><option value="">全部状态</option>{Object.entries(stateNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><button className="studio-primary" type="submit">查找 ↗</button></form>
          <div className="library-result-meta" aria-live="polite">{loading ? '正在检索…' : `找到 ${total.toLocaleString()} 份试卷`}{collection === 'research' && <span>原始资料须经过审核后发布</span>}</div>
          <div className="library-results">{papers.map((item) => <article key={item.id}><span className="library-year">{item.year ?? '—'}<small>{item.paperType}</small></span><button className="library-paper-link" onClick={() => select(item.id)}><span>{item.grade} · {item.subject} · {item.province}</span><h2>{item.title}</h2><small>{stateNames[item.state]}{item.available ? ` · ${item.available} 道可用题` : ''}{item.missing ? ` · 缺 ${item.missing} 道` : ''} · {publicationNames[item.publicationStatus]}</small></button><button className="studio-text-button" onClick={() => bookmark(item)} aria-label={item.bookmarked ? '取消收藏' : '收藏试卷'}>{item.bookmarked ? '★' : '☆'}</button><button className="library-open studio-text-button" onClick={() => select(item.id)} aria-label={`查看${item.title}`}>查看 ↗</button></article>)}</div>
          {!loading && !papers.length && <div className="studio-empty"><h2>{collection === 'published' ? '好内容，正在逐份核查。' : '这个范围暂无试卷。'}</h2><p>{collection === 'published' ? '审核后的试卷会出现在这里。知识诊断中的原创基础练习已可使用。' : '调整筛选条件，或到家庭练习库收藏试卷。'}</p><Link className="studio-secondary" href="/student/assessment">进入知识诊断 ↗</Link></div>}
          {total > 20 && <nav className="library-pagination" aria-label="试卷分页"><button className="studio-secondary" disabled={page === 1 || loading} onClick={() => setPage(page - 1)}>上一页</button><span>{page} / {Math.ceil(total / 20)}</span><button className="studio-secondary" disabled={page >= Math.ceil(total / 20) || loading} onClick={() => setPage(page + 1)}>下一页</button></nav>}
        </>}
    </div>
  </main>;
}

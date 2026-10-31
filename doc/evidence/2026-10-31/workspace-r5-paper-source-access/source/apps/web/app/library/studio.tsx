'use client';
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSessionUser, type SessionUser } from '../../lib/session-user';
import type { LearningContext } from '../../lib/learning-context';
import { readPaperLibraryState, writePaperLibraryState, type PaperLibraryState } from '../../lib/materials-navigation';
import { apiBaseUrl, apiRequest } from '../../lib/api';
import '../student/assessment/studio.css';
import './library.css';
import '../student/today/today.css';
import { StudyNav } from '../../components/study-nav';
import { RichMath } from '../../components/rich-math';
import { PaperPracticeLauncher } from '../../components/paper-practice-launcher';
import { checkOriginalPaperPdf, readPaperPreview, type PaperReadingSource } from '../../lib/paper-source-read';

type Paper = { id: string; title: string; grade: string; subject: string; province: string; paperType: string;
  year: number | null; state: string; available: number; expected: number | null; missing: number | null;
  hasPdf: boolean; flags: string[]; publicationStatus: string; bookmarked: boolean };
type Preview = Paper & { notice: string; source: string; missingMedia: number; pdf: string | null;
  sourceIdentity: PaperReadingSource;
  questions: Array<{ position: number; id: string; missing: boolean; html: string; options: string[]; answerHtml?: string; analysisHtml?: string }> };
type Overview = { ready: boolean; researchAccess: boolean; measurementAccess: boolean; research: { papers: number; questions: number } | null; published: number; bookmarks: number; notice: string };
type Facets = Record<string, Array<{ value: string; count: number }>>;
const stateNames: Record<string, string> = { complete: '结构完整', partial: '部分题目缺失', pdf: '原始 PDF', unknown: '待核查' };
const publicationNames: Record<string, string> = { published: '已发布', withdrawn: '已撤回', unreviewed: '待审核' };
const failure = (error: unknown) => error instanceof Error ? error.message : '加载失败，请重试';
// API markup already passed an allow-list sanitizer. Only local authenticated media are embedded.
const localHtml = (value: string) => value.replace(/src="\/api\/library\/media\?/g, `src="${apiBaseUrl}/api/library/media?`);

export function LibraryStudio({ embedded = false, context }: { embedded?: boolean; context?: LearningContext } = {}) {
  const identity = useSessionUser(), Root = embedded ? 'section' : 'main';
  if (!identity) return <Root className="paper-library"><p role="status">{identity === undefined ? '正在确认学习身份…' : '请先登录后查看题卷资料。'}</p>{identity === null && <Link href="/parent/login">登录账号</Link>}</Root>;
  return <ActorLibrary key={identity.id + ':' + identity.role} identity={identity} embedded={embedded} context={context} />;
}
function ActorLibrary({ identity, embedded, context }: { identity: SessionUser; embedded: boolean; context?: LearningContext }) {
  const params = useSearchParams(), location = readPaperLibraryState(new URLSearchParams(params.toString()));
  const { collection, query: search, grade, subject, state: paperState, page, paper: selectedId, answers } = location;
  const [overview, setOverview] = React.useState<Overview | null>(null), [facets, setFacets] = React.useState<Facets>({});
  const [query, setQuery] = React.useState(search), [total, setTotal] = React.useState(0), [papers, setPapers] = React.useState<Paper[]>([]);
  const [paper, setPaper] = React.useState<Preview | null>(null), [overviewLoading, setOverviewLoading] = React.useState(true), [listing, setListing] = React.useState(false), [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(''), [license, setLicense] = React.useState(''), [reviewed, setReviewed] = React.useState(false);
  const [refresh, setRefresh] = React.useState(0), [authenticated, setAuthenticated] = React.useState(false);
  const alive = React.useRef(true), printRequest = React.useRef<AbortController | null>(null);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; printRequest.current?.abort(); }; }, []);
  React.useEffect(() => () => printRequest.current?.abort(), [selectedId, answers, identity.id, identity.role]);
  const loading = overviewLoading || listing;
  React.useEffect(() => setQuery(search), [search]);
  function update(patch: Partial<PaperLibraryState>) {
    const next = writePaperLibraryState(new URLSearchParams(window.location.search), { ...location, ...patch });
    if (embedded) { next.set('view', 'materials'); next.set('tab', 'papers'); }
    window.history.pushState(null, '', (embedded ? '/studio' : '/library') + '?' + next);
  }
  React.useEffect(() => {
    const controller = new AbortController(); setOverviewLoading(true); setError('');
    apiRequest<Overview>('/library/overview', { signal: controller.signal }).then(async value => {
      if (controller.signal.aborted) return;
      setOverview(value); setAuthenticated(true);
      if (value.ready) { const filters = await apiRequest<Facets>('/library/facets', { signal: controller.signal }); if (!controller.signal.aborted) setFacets(filters); }
    }).catch(caught => { if (!controller.signal.aborted) setError(failure(caught)); }).finally(() => { if (!controller.signal.aborted) setOverviewLoading(false); });
    return () => controller.abort();
  }, [identity.id, refresh]);
  React.useEffect(() => {
    const controller = new AbortController(); setPapers([]); setTotal(0);
    if (!overview?.ready) { setListing(false); return () => controller.abort(); }
    setListing(true); setError('');
    const query = new URLSearchParams({ page: String(page), pageSize: '20', collection });
    if (search) query.set('q', search); if (grade) query.set('grade', grade); if (subject) query.set('subject', subject); if (paperState) query.set('state', paperState);
    apiRequest<{ items: Paper[]; total: number }>('/library/papers?' + query, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) { setPapers(value.items); setTotal(value.total); } })
      .catch(caught => { if (!controller.signal.aborted) setError(failure(caught)); }).finally(() => { if (!controller.signal.aborted) setListing(false); });
    return () => controller.abort();
  }, [overview?.ready, search, grade, subject, paperState, page, collection, refresh]);
  React.useEffect(() => {
    const controller = new AbortController(); setPaper(null);
    if (!selectedId) { setBusy(false); return () => controller.abort(); }
    setBusy(true); setError('');
    readPaperPreview<Preview>(identity, selectedId, answers, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setPaper(value); })
      .catch(caught => { if (!controller.signal.aborted) setError(failure(caught)); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [selectedId, answers, refresh, identity.id, identity.role]);
  React.useEffect(() => { setLicense(''); setReviewed(false); }, [selectedId]);
  function select(id: string) { update({ paper: id, position: 0, answers: false, scroll: id ? Math.round(window.scrollY) : location.scroll }); if (id) window.scrollTo({ top: 0 }); }
  React.useEffect(() => {
    if (selectedId || listing || !overview?.ready) return;
    const frame = requestAnimationFrame(() => window.scrollTo({ top: location.scroll })); return () => cancelAnimationFrame(frame);
  }, [selectedId, listing, overview?.ready, location.scroll]);
  React.useEffect(() => {
    if (!paper || paper.id !== selectedId || !location.position || !paper.questions.some(question => question.position === location.position)) return;
    const frame = requestAnimationFrame(() => document.getElementById('library-question-' + location.position)?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [paper?.id, selectedId, location.position]);
  async function bookmark(value: Paper) {
    try { await apiRequest(`/library/papers/${encodeURIComponent(value.id)}/bookmark`, { method: 'PATCH', body: JSON.stringify({ bookmarked: !value.bookmarked }) });
      setRefresh((v) => v + 1); } catch (caught) { setError(failure(caught)); }
  }
  async function printPaper() {
    if (!paper || busy) return;
    const controller = new AbortController(); printRequest.current?.abort(); printRequest.current = controller; setBusy(true); setError('');
    const popup = paper.pdf ? window.open('about:blank', '_blank') : null;
    if (paper.pdf && !popup) { setBusy(false); setError('浏览器阻止了原PDF窗口，请允许弹出窗口后重试。'); return; }
    if (popup) {
      popup.opener = null; popup.document.title = '正在核对原PDF';
      const message = popup.document.createElement('p'); message.textContent = '正在核对原PDF…'; message.setAttribute('role', 'status');
      popup.document.body.style.margin = '24px'; popup.document.body.style.fontFamily = window.getComputedStyle(document.body).fontFamily; popup.document.body.append(message);
    }
    const cancelPopup = () => popup?.close(); controller.signal.addEventListener('abort', cancelPopup, { once: true });
    try {
      const current = await readPaperPreview<Preview>(identity, paper.id, answers, { signal: controller.signal, expectedSource: paper.sourceIdentity });
      if (popup) {
        if (!current.pdf || current.pdf !== paper.pdf) throw new Error('原PDF来源已变化，请重新打开核对后再打印。');
        await checkOriginalPaperPdf(identity, current.pdf, controller.signal);
        if (alive.current && !controller.signal.aborted && !popup.closed) popup.location.replace(apiBaseUrl + current.pdf);
        else popup.close();
      } else if (alive.current && !controller.signal.aborted) window.print();
    } catch (caught) { popup?.close(); if (alive.current && !controller.signal.aborted) setError(failure(caught)); }
    finally { controller.signal.removeEventListener('abort', cancelPopup); if (alive.current && !controller.signal.aborted) setBusy(false); }
  }
  async function publish(status: 'published' | 'withdrawn') {
    if (!paper) return; setBusy(true); setError('');
    try { await apiRequest(`/library/papers/${encodeURIComponent(paper.id)}/publication`, { method: 'POST', body: JSON.stringify({
      status, licenseEvidence: license, contentReviewed: reviewed, mediaReviewed: reviewed,
      reason: status === 'published' ? '教研已逐项确认来源、内容与本地媒体' : '教研复核后撤回此版本，请查看来源说明',
    }) }); setRefresh((v) => v + 1); } catch (caught) { setError(failure(caught)); } finally { setBusy(false); }
  }
  const Root = embedded ? 'section' : 'main';
  return <Root className={'paper-library' + (embedded ? ' workspace-paper-library' : ' learning-studio')}>
    {!embedded && <div className="library-no-print"><StudyNav current="library" context={context} /></div>}
    <div className="library-layout">
      {error && <div className="studio-error library-no-print" role="alert">{error}<button aria-label="关闭提示" onClick={() => setError('')}>×</button></div>}
      {!authenticated && !loading ? <div className="studio-empty"><h1>把好内容，留给每一次练习。</h1><p>登录后查看可用试卷与收藏。教研账号可审核迁入的原始资料。</p><Link className="studio-primary" href="/parent/login">登录或创建账号 ↗</Link></div> :
        selectedId ? paper?.id === selectedId ? <>
          <div className="library-toolbar library-no-print"><button className="studio-text-button" onClick={() => select('')}>← 返回题卷库</button><div><button className="studio-secondary" onClick={() => bookmark(paper)}>{paper.bookmarked ? '取消收藏' : '收藏试卷'}</button><button className="studio-secondary" onClick={() => update({ answers: !answers })} disabled={busy}>{answers ? '收起参考答案' : '查看参考答案'}</button><button className="studio-primary" disabled={busy} onClick={() => void printPaper()}>{paper.pdf ? '打印原PDF' : '打印 / 存为 PDF'}</button></div></div>
          <article className="library-paper"><header><span className="studio-eyebrow">{paper.grade} / {paper.subject} / {paper.province}</span><h1>{paper.title}</h1><p>{paper.source} · {stateNames[paper.state]} · {publicationNames[paper.publicationStatus]}</p></header>
            <PaperPracticeLauncher key={paper.id} paper={paper} questions={paper.questions} />
            <div className="library-notice">{paper.notice}{paper.missingMedia > 0 && <p>有 {paper.missingMedia} 项媒体暂不可用，预览中已标明。</p>}{paper.flags.length > 0 && <p>来源元数据存在待核查项，请核对题名与适用范围。</p>}</div>
            {paper.pdf ? <div className="library-pdf library-no-print"><a className="studio-primary" href={`${apiBaseUrl}${paper.pdf}`} target="_blank" rel="noreferrer" aria-disabled={busy} onClick={event => { event.preventDefault(); void printPaper(); }}>打开原始 PDF ↗</a><p>可在 PDF 页面中阅读、打印或保存原件。</p><iframe title="原始试卷 PDF" src={`${apiBaseUrl}${paper.pdf}`} /></div> : paper.state === 'pdf' ? <p>原始 PDF 尚未完成本地校验。</p> : null}
            {paper.questions.map((question) => <section className="library-question" id={"library-question-" + question.position} key={question.position}><span className="library-question-number">{String(question.position).padStart(2, '0')}</span><div>{question.missing ? <p className="library-missing">原始资料缺少此题，保留原位置。</p> : <><RichMath html={localHtml(question.html)} />{question.options.map((option, index) => <RichMath key={index} html={localHtml(option)} />)}{answers && <details open className="library-answer"><summary>参考答案与原始解析</summary>{question.answerHtml ? <RichMath html={localHtml(question.answerHtml)} /> : <p>原始资料未提供可展示答案。</p>}{question.analysisHtml && <RichMath html={localHtml(question.analysisHtml)} />}</details>}{overview?.measurementAccess && <Link className="studio-text-button library-no-print" href={`/admin/measurement?paper=${encodeURIComponent(paper.id)}&position=${question.position}`}>整理为测量素材 ↗</Link>}</>}</div></section>)}
          </article>
          {overview?.researchAccess && <section className="library-review library-no-print"><span className="studio-eyebrow">教研审核 / 可撤回的发布版本</span><h2>确认后进入家庭练习库</h2><p>请核对适用年级、原卷完整度、答案和每一张插图；用于量化评测还需单独审核评分与原子知识点映射。</p><label>来源许可与核查说明<textarea value={license} onChange={(e) => setLicense(e.target.value)} rows={3} placeholder="填写可用于家庭练习的许可依据与核查结果" /></label><label className="library-check"><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />已逐项复核内容、缺题说明与本地媒体，确认许可依据</label><div><button className="studio-primary" disabled={busy || !reviewed || license.trim().length < 10} onClick={() => publish('published')}>审核并发布</button>{paper.publicationStatus === 'published' && <button className="studio-secondary" disabled={busy || !reviewed || license.trim().length < 10} onClick={() => publish('withdrawn')}>撤回发布</button>}</div></section>}
        </> : <div className="studio-empty"><p role="status">{busy ? '正在读取原卷与来源…' : '原卷当前无法读取，请核对权限或重试。'}</p><button className="studio-secondary" onClick={() => select('')}>返回题卷库</button></div> : <>
          <div className="studio-section-head library-heading"><span className="studio-eyebrow">PAPER & PRACTICE / 题卷资料库</span><h2>题卷资源</h2><p>{overview?.notice ?? '正在连接本地题卷库…'}</p></div>
          {authenticated && <a className="studio-secondary library-no-print" href="/library/practice">继续原卷练习与订正 ↗</a>}
          {overview?.research && <div className="library-totals"><div><strong>{overview.research.papers.toLocaleString()}</strong><span>原始试卷</span></div><div><strong>{overview.research.questions.toLocaleString()}</strong><span>已索引题目</span></div><div><strong>{overview.published}</strong><span>审核后发布</span></div></div>}
          <div className="studio-subjects library-tabs" role="group" aria-label="资料范围">{[['published', '家庭练习库'], ['bookmarks', '我的收藏'], ...(overview?.researchAccess ? [['research', '原始教研资料']] : [])].map(([key, label]) => <button key={key} aria-pressed={collection === key} onClick={() => update({ collection: key as PaperLibraryState['collection'], page: 1, scroll: 0 })}>{label}</button>)}</div>
          <form className="library-filters" onSubmit={(event) => { event.preventDefault(); update({ query: query.trim(), page: 1, scroll: 0 }); }}><label className="library-search">搜索试卷<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="试卷名称、学年或单元" maxLength={100} /></label><label>年级<select value={grade} onChange={(e) => update({ grade: e.target.value, page: 1, scroll: 0 })}><option value="">全部年级</option>{facets.grade?.map(({ value }) => value && <option key={value}>{value}</option>)}</select></label><label>学科<select value={subject} onChange={(e) => update({ subject: e.target.value, page: 1, scroll: 0 })}><option value="">全部学科</option>{facets.subject?.map(({ value }) => value && <option key={value}>{value}</option>)}</select></label><label>完整度<select value={paperState} onChange={(e) => update({ state: e.target.value, page: 1, scroll: 0 })}><option value="">全部状态</option>{Object.entries(stateNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><button className="studio-primary" type="submit">查找 ↗</button></form>
          <div className="library-result-meta" aria-live="polite">{loading ? '正在检索…' : `找到 ${total.toLocaleString()} 份试卷`}{collection === 'research' && <span>原始资料须经过审核后发布</span>}</div>
          <div className="library-results">{papers.map((item) => <article key={item.id}><span className="library-year">{item.year ?? '—'}<small>{item.paperType}</small></span><button className="library-paper-link" onClick={() => select(item.id)}><span>{item.grade} · {item.subject} · {item.province}</span><h2>{item.title}</h2><small>{stateNames[item.state]}{item.available ? ` · ${item.available} 道可用题` : ''}{item.missing ? ` · 缺 ${item.missing} 道` : ''} · {publicationNames[item.publicationStatus]}</small></button><button className="studio-text-button" onClick={() => bookmark(item)} aria-label={item.bookmarked ? '取消收藏' : '收藏试卷'}>{item.bookmarked ? '★' : '☆'}</button><button className="library-open studio-text-button" onClick={() => select(item.id)} aria-label={`查看${item.title}`}>查看 ↗</button></article>)}</div>
          {!loading && !papers.length && <div className="studio-empty"><h2>{collection === 'published' ? '好内容，正在逐份核查。' : '这个范围暂无试卷。'}</h2><p>{collection === 'published' ? '审核后的试卷会出现在这里。知识诊断中的原创基础练习已可使用。' : '调整筛选条件，或到家庭练习库收藏试卷。'}</p><Link className="studio-secondary" href="/student/assessment">进入知识诊断 ↗</Link></div>}
          {total > 20 && <nav className="library-pagination" aria-label="试卷分页"><button className="studio-secondary" disabled={page === 1 || loading} onClick={() => update({ page: page - 1, scroll: 0 })}>上一页</button><span>{page} / {Math.ceil(total / 20)}</span><button className="studio-secondary" disabled={page >= Math.ceil(total / 20) || loading} onClick={() => update({ page: page + 1, scroll: 0 })}>下一页</button></nav>}
        </>}
    </div>
  </Root>;
}

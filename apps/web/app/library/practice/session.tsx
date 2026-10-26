'use client';
import * as React from 'react';
import { PaperReviewEditor } from '../../../components/paper-review-editor';
import { PaperReviewNextSteps } from '../../../components/paper-review-next-steps';
import './review.css';
import { paperPracticeCommandSchema, type PaperPracticeCommandResult, type PaperPracticeItemView, type PaperPracticeSessionView } from '@study-agent/contracts';
import type { SessionUser } from '../../../lib/session-user';
import { ApiRequestError, apiBaseUrl } from '../../../lib/api';
import { paperPracticeFailure, usePaperPracticeApi } from '../../../lib/paper-practice-api';
import { clearPaperRecovery, downloadPaperRecovery, firstPaperCopy, otherPaperCopies, paperPracticeInputHash, paperStorage, storePaperRecovery } from '../../../lib/paper-practice-local';
import { RichMath } from '../../../components/rich-math';
import { WorkspaceDialog } from '../../studio/workspace-dialog';

type Pending = { format: 'paper-practice-command-v1'; ownerId: string; sessionId: string; body: Record<string, unknown> };
type Draft = { format: 'paper-practice-draft-v1'; ownerId: string; sessionId: string; itemId: string; text: string; baseText: string; purpose?: 'correction' };
const dispositionNames = { answered: '已回答', dont_know: '暂时不会', skip: '已跳过' };
const reviewNames = { matches_reference: '自评符合参考', needs_correction: '还需订正', unsure: '不能确定' };
const localHtml = (value: string) => value.replace(/src="\/api\/library\/media\?/g, 'src="' + apiBaseUrl + '/api/library/media?');

export function PaperPracticeSession({ user, sessionId }: { user: SessionUser; sessionId: string }) {
  const { call, alive } = usePaperPracticeApi(), [row, setRow] = React.useState<PaperPracticeSessionView | null>(null), [item, setItem] = React.useState<PaperPracticeItemView | null>(null);
  const [selected, setSelected] = React.useState(''), [text, setText] = React.useState(''), [correction, setCorrection] = React.useState(''), [localConflict, setLocalConflict] = React.useState<Draft | null>(null);
  const [pending, setPending] = React.useState<Pending | null>(null), [protectedLocally, setProtectedLocally] = React.useState(false), [commandConflict, setCommandConflict] = React.useState(false);
  const [manualProtection, setManualProtection] = React.useState(false), [itemScope, setItemScope] = React.useState('');
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [notice, setNotice] = React.useState(''), [reload, setReload] = React.useState(0), [finishOpen, setFinishOpen] = React.useState(false);
  const [filter, setFilter] = React.useState('all'), busyRef = React.useRef(false), localText = React.useRef('');
  const actionGeneration = React.useRef(0);
  const focusAfter = React.useRef<{ itemId: string; target: string } | null>(null);
  const selectedRef = React.useRef(selected); selectedRef.current = selected;
  const correctionDrafts = React.useRef(new Map<string, string>());
  const [copies, setCopies] = React.useState<Array<{ kind: 'command' | 'draft'; value: Pending | Draft }>>([]);
  const pendingStorage = paperStorage('study.paper-practice.command:' + user.id + ':' + sessionId), pendingKey = pendingStorage.key;
  const draftStorage = (id: string) => paperStorage('study.paper-practice.draft:' + user.id + ':' + sessionId + ':' + id), draftKey = (id: string) => draftStorage(id).key;
  const correctionStorage = (id: string) => paperStorage(draftStorage(id).base + ':correction');
  const requestedItemScope = JSON.stringify([sessionId, selected, row?.version ?? 0, reload]);
  const itemReady = !!item && item.id === selected && itemScope === requestedItemScope;
  function decodePending(value: unknown): Pending {
    const saved = value as Pending;
    if (!saved || saved.format !== 'paper-practice-command-v1' || saved.ownerId !== user.id || saved.sessionId !== sessionId) throw new Error('原操作范围无法核对。');
    return { ...saved, body: paperPracticeCommandSchema.parse(saved.body) };
  }
  function decodeDraft(value: unknown, id: string): Draft {
    const saved = value as Draft;
    if (!saved || saved.format !== 'paper-practice-draft-v1' || saved.ownerId !== user.id || saved.sessionId !== sessionId || saved.itemId !== id || typeof saved.text !== 'string' || saved.text.length > 24000 || typeof saved.baseText !== 'string' || saved.baseText.length > 24000 || saved.purpose !== undefined && saved.purpose !== 'correction') throw new Error('本机草稿范围无法核对。');
    return saved;
  }
  function acknowledgeLocal(value: Pending) {
    const id = value.body.itemId;
    if (typeof id !== 'string') return;
    try {
      const saved = firstPaperCopy(draftStorage(id), candidate => decodeDraft(candidate, id));
      if (['draft', 'submit'].includes(String(value.body.kind)) && typeof value.body.text === 'string' && (!saved || saved.text === value.body.text)) storePaperRecovery(draftKey(id), { format: 'paper-practice-draft-v1', ownerId: user.id, sessionId, itemId: id, text: value.body.text, baseText: value.body.text } satisfies Draft);
      if (value.body.kind === 'correct') { const savedCorrection = firstPaperCopy(correctionStorage(id), candidate => decodeDraft(candidate, id)), current = correctionDrafts.current.get(id) ?? savedCorrection?.text ?? ''; if (!current || current === value.body.text) { correctionDrafts.current.set(id, ''); if (selectedRef.current === id) setCorrection(''); storePaperRecovery(correctionStorage(id).key, { format: 'paper-practice-draft-v1', ownerId: user.id, sessionId, itemId: id, text: '', baseText: '', purpose: 'correction' } satisfies Draft); } }
    } catch { setNotice('服务器已保存，本机副本确认暂时未写入；原文件仍可核对。'); }
  }
  const apply = React.useCallback((value: PaperPracticeSessionView) => {
    if (!alive.current) return; setRow(value);
    const params = new URLSearchParams(window.location.search), requested = params.get('item'), target = value.items.some(item => item.id === requested) ? requested! : value.currentItemId;
    setSelected(target);
    if (requested !== target) { params.set('session', value.id); params.set('item', target); window.history.replaceState({}, '', '?' + params.toString()); }
  }, [alive]);
  React.useEffect(() => {
    let current = true; const controller = new AbortController(); setError('');
    void call<PaperPracticeSessionView>('/library/practice/sessions/' + encodeURIComponent(sessionId), undefined, controller.signal).then(value => { if (current) apply(value); }).catch(caught => {
      if (!current) return; setRow(null); setItem(null); setError(paperPracticeFailure(caught));
    });
    return () => { current = false; controller.abort(); };
  }, [sessionId, call, apply, reload]);
  React.useEffect(() => {
    let current = true; const generation = actionGeneration.current, controller = new AbortController();
    setPending(null); setProtectedLocally(false); setManualProtection(false);
    try {
      const value = firstPaperCopy(pendingStorage, decodePending);
      if (value) {
        setPending(value);
        try { storePaperRecovery(pendingKey, value); setProtectedLocally(true); }
        catch { setProtectedLocally(false); setManualProtection(true); setNotice('原操作仍能核对，但本页未能保留新的恢复副本，请先下载完整保护文件。'); }
        void call<PaperPracticeCommandResult | null>('/library/practice/sessions/' + encodeURIComponent(sessionId) + '/commands/' + encodeURIComponent(String(value.body.requestKey)), undefined, controller.signal).then(async receipt => {
          if (!current || !receipt || receipt.inputHash !== await paperPracticeInputHash(value.body)) return;
          if (!current || actionGeneration.current !== generation) return; acknowledgeLocal(value); clearPending(); apply(receipt.session);
        }).catch(caught => { if (current) setError(paperPracticeFailure(caught)); });
      }
    } catch { setNotice('本机恢复信息暂时无法读取。输入仍可保留，并可下载保护文件。'); }
    return () => { current = false; controller.abort(); };
  }, [pendingKey, user.id, sessionId, call, apply]);
  React.useEffect(() => {
    if (!row || !selected) return; let current = true; const controller = new AbortController(); setItem(current => current?.id === selected ? current : null); setLocalConflict(null);
    void call<PaperPracticeItemView>('/library/practice/sessions/' + encodeURIComponent(sessionId) + '/items/' + encodeURIComponent(selected), undefined, controller.signal).then(value => {
      if (!current) return; setItem(value); setItemScope(requestedItemScope); let editing = value.draft, correcting = correctionDrafts.current.get(value.id) ?? '';
      if (row.ownerUserId === user.id) try {
        const saved = firstPaperCopy(draftStorage(value.id), candidate => decodeDraft(candidate, value.id));
        if (saved) {
          try { storePaperRecovery(draftKey(value.id), saved); } catch { setNotice('已读回原草稿，但本页恢复副本暂未保存，请下载保护后再离开。'); }
          if (saved.text !== value.draft && saved.baseText !== value.draft || value.firstAnswer && saved.text !== value.firstAnswer.text) setLocalConflict(saved);
          else editing = saved.text;
        }
        const savedCorrection = firstPaperCopy(correctionStorage(value.id), candidate => decodeDraft(candidate, value.id));
        if (savedCorrection) { correcting = correctionDrafts.current.get(value.id) ?? savedCorrection.text; try { storePaperRecovery(correctionStorage(value.id).key, { ...savedCorrection, text: correcting }); } catch { setNotice('已读回订正，但本页恢复副本暂未保存，请下载保护后再离开。'); } if (correcting && row.status === 'completed') setNotice('本机还有未保存的订正草稿，已完成记录不再改写，可下载保留。'); }
      } catch { setNotice('本机草稿暂时无法核对，服务器原记录仍保留。'); }
      setText(editing); localText.current = editing; setCorrection(correcting);
    }).catch(caught => { if (current) { setItem(null); setError(paperPracticeFailure(caught)); if (caught instanceof ApiRequestError && [401, 403].includes(caught.status)) setRow(null); } });
    return () => { current = false; controller.abort(); };
  }, [selected, row?.version, row?.ownerUserId, sessionId, call, user.id, reload]);
  React.useEffect(() => {
    const requested = focusAfter.current;
    if (!itemReady || !requested || requested.itemId !== item?.id) return;
    const frame = window.requestAnimationFrame(() => { if (focusAfter.current !== requested) return; document.getElementById(requested.target)?.focus({ preventScroll: true }); focusAfter.current = null; });
    return () => window.cancelAnimationFrame(frame);
  }, [itemReady, item?.id, itemScope]);
  const dirty = !!row?.permissions.edit && !!item && !item.firstAnswer && text !== item.draft;
  React.useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => { if (dirty || pending || correction.trim() || localConflict) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', protect); return () => window.removeEventListener('beforeunload', protect);
  }, [dirty, pending, correction, localConflict]);
  React.useEffect(() => {
    const restore = () => { const requested = new URLSearchParams(window.location.search).get('item'); if (row?.items.some(item => item.id === requested)) setSelected(requested!); };
    window.addEventListener('popstate', restore); return () => window.removeEventListener('popstate', restore);
  }, [row]);
  function persistText(value: string) {
    setText(value); localText.current = value; if (!item) return;
    try { storePaperRecovery(draftKey(item.id), { format: 'paper-practice-draft-v1', ownerId: user.id, sessionId, itemId: item.id, text: value, baseText: item.draft } satisfies Draft); }
    catch { setNotice('本机暂不能保存草稿，请保存到服务器或下载本机记录后离开。'); }
  }
  function persistCorrection(value: string) {
    setCorrection(value); if (!item) return; correctionDrafts.current.set(item.id, value);
    try { storePaperRecovery(correctionStorage(item.id).key, { format: 'paper-practice-draft-v1', ownerId: user.id, sessionId, itemId: item.id, text: value, baseText: item.firstAnswer?.text ?? '', purpose: 'correction' } satisfies Draft); }
    catch { setNotice('本机暂不能保存订正草稿，请下载保护或明确保存后离开。'); }
  }
  function clearPending() {
    try { clearPaperRecovery(pendingStorage); } catch { setNotice('本机旧操作标识尚未标记结束，原键重试仍会核对服务器结果。'); }
    setPending(null); setProtectedLocally(false); setManualProtection(false); setCommandConflict(false);
  }
  function protectPending(value: Pending) {
    setPending(value);
    try { storePaperRecovery(pendingKey, value); setProtectedLocally(true); return true; }
    catch { setProtectedLocally(false); setManualProtection(true); setNotice('本机未能保存操作恢复信息。先下载保护文件，再用原操作继续。'); return false; }
  }
  async function send(value: Pending) {
    await call<PaperPracticeCommandResult | null>('/library/practice/sessions/' + encodeURIComponent(sessionId) + '/commands/' + encodeURIComponent(String(value.body.requestKey)));
    const result = await call<PaperPracticeCommandResult>('/library/practice/sessions/' + encodeURIComponent(sessionId) + '/commands', value.body);
    if (!alive.current) return null;
    if (value.body.itemId === selectedRef.current && ['submit', 'reveal', 'correct'].includes(String(value.body.kind))) focusAfter.current = { itemId: selectedRef.current, target: value.body.kind === 'submit' ? 'pp-first-answer' : value.body.kind === 'reveal' ? 'pp-reference' : 'pp-corrections' };
    acknowledgeLocal(value);
    clearPending(); apply(result.session); setNotice('原操作已保存。');
    return result.session;
  }
  async function run(actions: Array<Record<string, unknown>>, existing?: Pending) {
    if (!row || busyRef.current || pending && !existing || localConflict && !existing) return null;
    actionGeneration.current++; busyRef.current = true; setBusy(true); setError(''); let current = row;
    try {
      for (const action of actions) {
        const value: Pending = existing ?? { format: 'paper-practice-command-v1', ownerId: user.id, sessionId, body: { expectedVersion: current.version, requestKey: crypto.randomUUID(), ...action } };
        if (!existing && !protectPending(value)) return null;
        const saved = await send(value); if (!saved) return null; current = saved;
      }
      return current;
    } catch (caught) {
      if (alive.current) {
        setError(paperPracticeFailure(caught));
        if (caught instanceof ApiRequestError && caught.status === 409) { setCommandConflict(true); setReload(value => value + 1); }
        if (caught instanceof ApiRequestError && [401, 403].includes(caught.status)) { setRow(null); setItem(null); }
      }
      return null;
    } finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  const draftBefore = () => item && !item.firstAnswer && localText.current !== item.draft ? [{ kind: 'draft', itemId: item.id, text: localText.current }] : [];
  async function choose(id: string) {
    if (!row || !itemReady || busy || pending || localConflict || !row.items.some(item => item.id === id)) return;
    let saved = row;
    if (row.status !== 'completed' && row.permissions.edit) { const value = await run([...draftBefore(), { kind: 'navigate', itemId: id }]); if (!value) return; saved = value; }
    if (!alive.current) return; setRow(saved); setSelected(id);
    const params = new URLSearchParams(window.location.search); params.set('session', sessionId); params.set('item', id); window.history.pushState({}, '', '?' + params.toString()); window.scrollTo({ top: 0, behavior: 'instant' });
  }
  async function restore(file: File | undefined) {
    if (!file || !row) return;
    try {
      if (file.size > 256 * 1024) throw new Error('恢复文件过大，请使用原练习保护文件。'); const value = JSON.parse(await file.text());
      if (!alive.current) return; if (value.ownerId !== user.id || value.sessionId !== sessionId) throw new Error('恢复文件属于其他账号或练习。');
      if (value.format === 'paper-practice-command-v1') { setPending(decodePending(value)); setProtectedLocally(true); setManualProtection(false); setNotice('已读取原操作文件，可核对原结果。'); }
      else if (value.format === 'paper-practice-draft-v1' && itemReady && item) { const draft = decodeDraft(value, item.id); if (draft.purpose === 'correction' && !item.firstAnswer) throw new Error('订正草稿只能放回已提交首次回答的原题。'); setLocalConflict(draft); setNotice('已读取本机草稿，请和当前服务器记录核对后选择。'); }
      else throw new Error('文件与当前题位不匹配，请先打开原题。');
    } catch (caught) { setError(paperPracticeFailure(caught)); }
  }
  const sourceAvailable = !!item?.availability.available && row?.items.find(summary => summary.id === selected)?.availability.available === true;
  const editable = itemReady && row?.permissions.edit && row.status === 'in_progress' && sourceAvailable && !busy && !pending && !localConflict;
  const filtered = row?.items.filter(summary => filter === 'all' || filter === 'unanswered' && !summary.disposition && summary.kind !== 'missing' || filter === 'correction' && summary.selfReview === 'needs_correction' || filter === summary.disposition) ?? [];
  return <div className="pp-shell"><header className="pp-session-heading"><a href="/library/practice">← 我的原卷练习</a><a href="/library/practice/review">待复习与反思 ↗</a><strong>{row?.status === 'completed' ? '原卷复盘' : row?.status === 'paused' ? '练习已暂停' : '原卷练习'}</strong><span role="status">{busy ? '正在核对与保存…' : pending ? '原操作等待确认' : dirty ? '本题有未提交草稿' : '原记录已读取'}</span></header>
    {row && <p className="pp-review-identity">{row.ownerUserId !== user.id ? '孩子学习账号作答 · 当前只读' : user.role === 'student' ? '孩子学习账号作答 · 本人记录' : row.studentId ? '本人陪练 · 不作为孩子的实际作答' : '本人练习记录'}</p>}
    {row?.origin && <section className="pp-source-warning" aria-label="原题再练来源"><p>这是同一道原题的再次练习，原来的首次回答与反思保持。重复正确仍需独立新题验证。</p>{row.origin.available ? <a href={'/library/practice/review?' + new URLSearchParams({ session: row.origin.sessionId, item: row.origin.itemId })}>查看原来的首答与反思 ↗</a> : <p>原练习已经移除或目前不可读取，这次自己的记录仍保留。</p>}</section>}
    {error && <div className="pp-error" role="alert">{error}<button onClick={() => setReload(value => value + 1)}>读取最新记录</button></div>}{notice && <p className="pp-notice" role="status">{notice}</p>}
    {pending && <section className="pp-card pp-recovery" aria-label="原操作恢复"><h2>保留原操作，再继续。</h2><p>首次回答和操作标识仍保留，重试会先核对原结果。</p><button className="studio-secondary" onClick={() => { downloadPaperRecovery(pending, '原卷练习原操作.json'); setNotice('请确认浏览器已保存完整恢复文件，再继续核对原结果。'); }}>下载原操作保护文件</button>{manualProtection && <label><input type="checkbox" checked={protectedLocally} onChange={event => setProtectedLocally(event.target.checked)} />我已另外保留完整恢复文件</label>}<button className="studio-primary" disabled={busy || !protectedLocally} onClick={() => void run([pending.body], pending)}>核对或重试原操作</button>
      {commandConflict && <button className="studio-secondary" disabled={busy} onClick={() => { downloadPaperRecovery(pending, '原卷练习冲突记录.json'); clearPending(); setNotice('原操作文件已导出，请核对本机草稿与当前记录后继续。'); }}>保留冲突文件，核对最新版本</button>}</section>}
    {!row ? <section className="pp-empty"><p>{error ? '当前记录不可读取，请重新核对身份或返回原卷库。' : '正在读取这份练习…'}</p><a href="/learn">返回学习首页</a></section> : <>
      <div className="pp-overview"><div><span>{row.counts.submitted} / {row.counts.total}</span><p>已提交记录</p></div><div><span>{row.counts.unanswered}</span><p>未答</p></div><div><span>{row.counts.needsCorrection}</span><p>自评待订正</p></div><div><span>{row.counts.missing + row.counts.unavailable}</span><p>缺题或来源不可用</p></div></div>
      <p className="pp-measurement-note">这里保留练习与自我核对，不计算未经审核的总分，也不自动改变知识掌握度。</p>
      <div className="pp-workspace"><aside className="pp-directory" aria-label="原卷题位目录"><label>查看范围<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">全部题位</option><option value="unanswered">未答</option><option value="correction">待订正</option><option value="dont_know">暂时不会</option><option value="skip">已跳过</option></select></label>
        <div>{filtered.map(summary => <button type="button" key={summary.id} aria-pressed={selected === summary.id} disabled={busy || !itemReady || !!pending || !!localConflict} onClick={() => void choose(summary.id)}><small>{summary.paperTitle}</small><strong>{summary.kind === 'document' ? '整卷作答笔记' : '第 ' + summary.position + ' 题'}</strong><span>{summary.kind === 'missing' ? '原卷缺题' : !summary.availability.available ? '来源待恢复' : summary.disposition ? dispositionNames[summary.disposition] : '尚未作答'}{summary.selfReview ? ' · ' + reviewNames[summary.selfReview] : ''}</span></button>)}</div>{!filtered.length && <p>这个筛选下没有题位，原记录保持。</p>}
      </aside><section className="pp-question" aria-label="当前原题与首次回答">
        {!item || item.id !== selected ? <p role="status">正在读取当前原题…</p> : <><header><small>{item.paperTitle}</small><h1>{item.kind === 'document' ? '整卷作答笔记' : '第 ' + item.position + ' 题'}</h1><a href={'/library?paper=' + encodeURIComponent(item.paperId) + '&position=' + item.position}>回到原卷题位 ↗</a></header>
          {!itemReady && <p role="status">正在核对当前记录，请稍候继续编辑…</p>}
          {!sourceAvailable ? <div className="pp-source-warning"><p>{row.items.find(summary => summary.id === selected)?.availability.reason || item.availability.reason}</p><button className="studio-secondary" onClick={() => setReload(value => value + 1)}>重新核对来源</button></div> : <div className="pp-original"><RichMath html={localHtml(item.html)} />{item.options.map((option, index) => <div className="pp-original-option" key={index}><b>{String.fromCharCode(65 + index)}</b><RichMath html={localHtml(option)} /></div>)}{item.pdfUrl && <><a className="studio-secondary" href={apiBaseUrl + item.pdfUrl} target="_blank" rel="noreferrer">打开原始 PDF ↗</a><iframe title="原始试卷 PDF" src={apiBaseUrl + item.pdfUrl} /></>}</div>}
          {localConflict && <section className="pp-conflict" aria-label="本机与服务器草稿冲突"><h2>先核对两份思考。</h2><label>本机保留的内容<textarea readOnly value={localConflict.text} rows={4} /></label><label>当前服务器记录<textarea readOnly value={item.firstAnswer?.text ?? item.draft} rows={4} /></label><button className="studio-secondary" onClick={() => downloadPaperRecovery(localConflict, '原卷练习本机草稿.json')}>下载本机草稿</button>
            <button className="studio-secondary" disabled={!!pending} onClick={() => { if (item.firstAnswer) persistCorrection(localConflict.text); else persistText(localConflict.text); setLocalConflict(null); }}>{item.firstAnswer ? '把本机内容放入订正草稿' : '保留本机内容继续编辑'}</button><button className="studio-text-button" disabled={!!pending} onClick={() => { const accepted = item.firstAnswer?.text ?? item.draft; try { storePaperRecovery(draftKey(item.id), { format: 'paper-practice-draft-v1', ownerId: user.id, sessionId, itemId: item.id, text: accepted, baseText: item.draft } satisfies Draft); } catch { setNotice('当前采用服务器记录，本机旧副本仍保留。'); } setText(accepted); localText.current = accepted; setLocalConflict(null); }}>采用当前服务器记录</button></section>}
          {item.firstAnswer ? <section className="pp-first-answer" id="pp-first-answer" tabIndex={-1} aria-label="不可覆盖的首次回答"><span>{dispositionNames[item.firstAnswer.disposition]}</span><h2>当时的首次回答</h2><p className="pp-answer-text">{item.firstAnswer.text || '本题没有提交解题文字。'}</p><time>{new Date(item.firstAnswer.submittedAt).toLocaleString('zh-CN')}</time>
            {!item.reference && itemReady && sourceAvailable && row.ownerUserId === user.id && <button className="studio-primary" disabled={busy || !!pending || !!localConflict || row.status === 'paused'} onClick={() => void run([{ kind: 'reveal', itemId: item.id }])}>核对本题参考答案</button>}
          </section> : <section className="pp-answer"><label htmlFor="pp-answer-input">先写下自己的回答</label><textarea id="pp-answer-input" value={text} rows={6} maxLength={24000} disabled={!editable} onChange={event => persistText(event.target.value)} placeholder={item.kind === 'document' ? '按原卷记录题号和自己的回答，保留未结构化状态。' : '写下你的选择、过程或解释。先保留自己的思考，再核对参考。'} /><div className="pp-answer-actions"><button className="studio-primary" disabled={!editable || !text.trim()} onClick={() => void run([{ kind: 'submit', itemId: item.id, disposition: 'answered', text }])}>提交本题回答</button><button className="studio-secondary" disabled={!editable || !dirty} onClick={() => void run([{ kind: 'draft', itemId: item.id, text }])}>保存草稿</button><button className="studio-text-button" disabled={!editable} onClick={() => void run([{ kind: 'submit', itemId: item.id, disposition: 'dont_know', text }])}>暂时不会</button><button className="studio-text-button" disabled={!editable} onClick={() => void run([{ kind: 'submit', itemId: item.id, disposition: 'skip', text }])}>先跳过</button></div></section>}
          {item.reference && sourceAvailable && <section className="pp-reference" id="pp-reference" tabIndex={-1} aria-label="本题原参考与自评"><h2>对照原参考，再判断。</h2>{!item.reference.hasAnswer && <p>本题原答案缺失或所需媒体暂不可用，不能据此判断正确。</p>}{item.reference.missingMedia > 0 && <p>原参考中有 {item.reference.missingMedia} 项媒体待恢复。</p>}<RichMath html={localHtml(item.reference.answerHtml)} /><RichMath html={localHtml(item.reference.analysisHtml)} />
            <p>以下是自己的核对判断，不是客观评分。</p><div className="pp-self-review">{Object.entries(reviewNames).map(([value, label]) => <button key={value} aria-pressed={item.selfReview === value} disabled={!editable || value === 'matches_reference' && !item.reference?.hasAnswer} onClick={() => void run([{ kind: 'self_review', itemId: item.id, value }])}>{label}</button>)}</div></section>}
          {item.firstAnswer && <section className="pp-corrections" id="pp-corrections" tabIndex={-1} aria-label="追加订正记录"><h2>保留第一次，再补充新的理解。</h2>{item.corrections.map(entry => <article key={entry.id}><p className="pp-answer-text">{entry.text}</p><time>{new Date(entry.at).toLocaleString('zh-CN')}</time></article>)}{row.permissions.edit ? <><label htmlFor="pp-correction-input">追加订正</label><textarea id="pp-correction-input" value={correction} onChange={event => persistCorrection(event.target.value)} rows={4} maxLength={24000} disabled={!editable} /><button className="studio-primary" disabled={!editable || !correction.trim()} onClick={() => void run([{ kind: 'correct', itemId: item.id, text: correction }])}>保存这次订正</button></> : correction.trim() && <div><h3>本机未保存的订正草稿</h3><p className="pp-answer-text">{correction}</p></div>}</section>}
          <PaperReviewEditor key={user.id + ':' + row.id + ':' + item.id} user={user} row={row} item={item} ready={itemReady && !busy && !pending && !localConflict} onChanged={apply} />
          <PaperReviewNextSteps key={'next:' + user.id + ':' + row.id + ':' + item.id} user={user} row={row} item={item} ready={itemReady && !busy && !pending && !localConflict} />
          <div className="pp-next"><button className="studio-secondary" disabled={busy || !itemReady || !!pending || !!localConflict || row.items.findIndex(summary => summary.id === item.id) <= 0} onClick={() => void choose(row.items[row.items.findIndex(summary => summary.id === item.id) - 1]?.id)}>上一题位</button><button className="studio-primary" disabled={busy || !itemReady || !!pending || !!localConflict || row.items.findIndex(summary => summary.id === item.id) >= row.items.length - 1} onClick={() => void choose(row.items[row.items.findIndex(summary => summary.id === item.id) + 1]?.id)}>下一题位 ↗</button></div>
        </>}
      </section></div>
      <footer className="pp-session-footer">{row.permissions.edit && <><button className="studio-secondary" disabled={busy || !itemReady || !!pending || !!localConflict} onClick={() => void run(row.status === 'paused' ? [{ kind: 'resume' }] : [...draftBefore(), { kind: 'pause' }])}>{row.status === 'paused' ? '继续这份练习' : '保存位置并暂停'}</button><button className="studio-primary" disabled={busy || !itemReady || !!pending || !!localConflict} onClick={() => setFinishOpen(true)}>结束并复盘</button></>}{item && row.ownerUserId === user.id && <button className="studio-text-button" onClick={() => downloadPaperRecovery({ format: 'paper-practice-draft-v1', ownerId: user.id, sessionId, itemId: item.id, text: correction || text, baseText: correction ? item.firstAnswer?.text ?? '' : item.draft, ...(correction ? { purpose: 'correction' as const } : {}) } satisfies Draft, '原卷练习本机草稿.json')}>下载本机草稿保护文件</button>}</footer>
      {finishOpen && <WorkspaceDialog onClose={() => setFinishOpen(false)} busy={busy}><div className="pp-dialog-backdrop"><section role="alertdialog" aria-modal="true" aria-labelledby="pp-finish-title" className="pp-finish-dialog"><h2 id="pp-finish-title">结束这份练习并保留原记录？</h2><p>还有 {row.counts.unanswered} 个未答记录。未答、跳过、不会和缺题会分别保留，不会补成错误分数。</p><button className="studio-secondary" disabled={busy} onClick={() => setFinishOpen(false)}>继续练习</button><button className="studio-primary" disabled={busy} onClick={() => { setFinishOpen(false); void run([...draftBefore(), { kind: 'complete', acknowledgeUnanswered: true }]); }}>确认结束，查看复盘</button></section></div></WorkspaceDialog>}
    </>}
    <button className="studio-text-button" disabled={busy} onClick={() => { try { const commands = otherPaperCopies(pendingStorage, decodePending).map(value => ({ kind: 'command' as const, value })), drafts = item ? [...otherPaperCopies(draftStorage(item.id), candidate => decodeDraft(candidate, item.id)), ...otherPaperCopies(correctionStorage(item.id), candidate => decodeDraft(candidate, item.id))].map(value => ({ kind: 'draft' as const, value })) : []; setCopies([...commands, ...drafts]); } catch { setNotice('其他本机副本暂不能读取，请使用自己的保护文件。'); } }}>查看其他本机草稿与原操作</button>
    {copies.map((copy, index) => <button className="studio-secondary" key={index} disabled={!!pending || busy} onClick={() => { if (copy.kind === 'command') { setPending(copy.value as Pending); setProtectedLocally(false); setManualProtection(true); } else setLocalConflict(copy.value as Draft); }}>核对本机{copy.kind === 'command' ? '原操作' : '草稿'} {index + 1}</button>)}
    <label className="pp-recovery-file">从本次练习保护文件恢复<input type="file" accept="application/json,.json" onChange={event => { void restore(event.target.files?.[0]); event.target.value = ''; }} /></label>
  </div>;
}

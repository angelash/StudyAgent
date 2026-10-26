'use client';
import * as React from 'react';
import { paperPracticeCreationSchema, type PaperPracticeCreationResult, type PaperPracticePreview, type PaperPracticeSelection, type PaperPracticeSessionView } from '@study-agent/contracts';
import { useSessionStatus, refreshSessionUser, type SessionUser } from '../../../lib/session-user';
import { ApiRequestError } from '../../../lib/api';
import { StudyNav } from '../../../components/study-nav';
import { paperPracticeFailure, usePaperPracticeApi } from '../../../lib/paper-practice-api';
import { clearPaperRecovery, downloadPaperRecovery, firstPaperCopy, otherPaperCopies, paperBasketKey, paperPracticeInputHash, paperStorage, parsePaperSelection, storePaperRecovery } from '../../../lib/paper-practice-local';
import { PaperPracticeSession } from './session';
import '../../student/assessment/studio.css';
import './practice.css';

type StartBody = { studentId: string | null; selection: PaperPracticeSelection[]; sourceHash: string; requestKey: string };
type PendingStart = { format: 'paper-practice-start-v1'; ownerId: string; body: StartBody };
type History = { id: string; status: string; total: number; submitted: number; updatedAt: string; papers: Array<{ id: string; title: string }> };
const statusNames: Record<string, string> = { in_progress: '进行中', paused: '已暂停', completed: '已完成' };
const startKey = (ownerId: string) => 'study.paper-practice.start:' + ownerId;

export function PaperPracticeStudio() {
  const identity = useSessionStatus();
  return <main className="paper-practice learning-studio"><StudyNav current="library" />
    {identity.status === 'anonymous' ? <section className="pp-empty"><h1>从原卷开始，留下自己的思考。</h1><p>登录后继续原题练习与订正。</p><a className="studio-primary" href="/parent/login">登录 ↗</a></section>
      : identity.status === 'unavailable' ? <section className="pp-empty"><h1>暂时无法核对登录状态。</h1><button className="studio-secondary" onClick={() => void refreshSessionUser()}>重新读取登录状态</button></section>
        : !identity.user ? <p role="status">正在核对当前学习身份…</p> : <AuthorizedPractice key={identity.user.id} user={identity.user} />}
  </main>;
}
function AuthorizedPractice({ user }: { user: SessionUser }) {
  const [location, setLocation] = React.useState<{ session: string; search: string } | null>(null);
  React.useEffect(() => { const read = () => setLocation({ session: new URLSearchParams(window.location.search).get('session') ?? '', search: window.location.search }); read(); window.addEventListener('popstate', read); return () => window.removeEventListener('popstate', read); }, []);
  if (!location) return <p role="status">正在恢复原位置…</p>;
  return location.session ? <PaperPracticeSession key={location.session} user={user} sessionId={location.session} /> : <NewPaperPractice key={location.search} user={user} />;
}
function NewPaperPractice({ user }: { user: SessionUser }) {
  const { call, alive } = usePaperPracticeApi();
  const [children, setChildren] = React.useState<Array<{ id: string; nickname: string }>>([]), [studentId, setStudentId] = React.useState(''), [ready, setReady] = React.useState(false);
  const [selection, setSelection] = React.useState<PaperPracticeSelection[]>([]), [preview, setPreview] = React.useState<PaperPracticePreview | null>(null), [history, setHistory] = React.useState<History[]>([]);
  const [pending, setPending] = React.useState<PendingStart | null>(null), [protectedLocally, setProtectedLocally] = React.useState(false);
  const [manualProtection, setManualProtection] = React.useState(false);
  const [expiredStart, setExpiredStart] = React.useState(false);
  const [confirmedStart, setConfirmedStart] = React.useState(''), [copies, setCopies] = React.useState<PendingStart[]>([]);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [notice, setNotice] = React.useState(''), [reload, setReload] = React.useState(0);
  const storage = paperStorage(startKey(user.id));
  function decodeStart(value: unknown): PendingStart {
    const saved = value as PendingStart;
    if (!saved || saved.format !== 'paper-practice-start-v1' || saved.ownerId !== user.id) throw new Error('原开始记录不属于当前账号。');
    return { format: saved.format, ownerId: saved.ownerId, body: paperPracticeCreationSchema.parse(saved.body) };
  }
  React.useEffect(() => {
    let current = true; const controller = new AbortController(); setReady(false); setPreview(null); setHistory([]);
    void call<Array<{ id: string; nickname: string }>>('/learning/students', undefined, controller.signal).then(rows => {
      if (!current) return; setChildren(rows);
      const params = new URLSearchParams(window.location.search), requested = params.get('studentId');
      if (requested && !rows.some(row => row.id === requested)) throw new Error('链接中的孩子当前不可用，请重新选择。');
      setStudentId(user.role === 'student' ? rows[0]?.id ?? '' : requested ?? '');
      if (user.role === 'student' && !rows.length) throw new Error('当前学习档案不可用，请由家长重新开启。');
      const paperId = params.get('paper');
      if (paperId) setSelection(parsePaperSelection([{ paperId, ...(params.has('positions') ? { positions: params.get('positions')!.split(',').map(Number) } : {}) }]));
      else if (params.get('basket') === '1') try { setSelection(parsePaperSelection(JSON.parse(window.localStorage.getItem(paperBasketKey(user.id)) ?? '[]'))); } catch { setNotice('本机选题清单暂不能读取，可以从保护文件恢复。'); }
      try {
        const stored = firstPaperCopy(storage, decodeStart);
        if (stored) {
          setPending(stored);
          try { storePaperRecovery(storage.key, stored); setProtectedLocally(true); }
          catch { setProtectedLocally(false); setManualProtection(true); setNotice('已读回原开始记录，但本页恢复副本暂未保存，请下载保护文件后继续。'); }
          void call<PaperPracticeCreationResult | null>('/library/practice/requests/' + encodeURIComponent(stored.body.requestKey)).then(async result => {
            if (!current || !result || result.inputHash !== await paperPracticeInputHash(stored.body, true)) return;
            if (!current) return; setPending(null); setConfirmedStart(result.session.id); setNotice('上次开始已确认保存，可继续原练习。');
            try { clearPaperRecovery(storage); } catch { /* Other document copies remain untouched. */ }
          }).catch(caught => { if (current) setError(paperPracticeFailure(caught)); });
        }
      } catch { setNotice('本机暂不能读取恢复信息。可以下载保护文件后继续。'); }
      setReady(true);
    }).catch(caught => { if (current) setError(paperPracticeFailure(caught)); });
    return () => { current = false; controller.abort(); };
  }, [call, user.id, user.role, reload]);
  React.useEffect(() => {
    if (!ready) return; let current = true; const controller = new AbortController(); setHistory([]);
    void call<{ items: History[] }>('/library/practice/sessions?' + new URLSearchParams({ ...(studentId ? { studentId } : {}), pageSize: '30' }), undefined, controller.signal).then(value => { if (current) setHistory(value.items); }).catch(caught => { if (current) setError(paperPracticeFailure(caught)); });
    return () => { current = false; controller.abort(); };
  }, [ready, studentId, call, reload]);
  async function inspect() {
    setBusy(true); setError(''); setPreview(null);
    try { const value = await call<PaperPracticePreview>('/library/practice/preview', { studentId: studentId || null, selection }); if (alive.current) setPreview(value); }
    catch (caught) { if (alive.current) setError(paperPracticeFailure(caught)); } finally { if (alive.current) setBusy(false); }
  }
  async function recover(value: PendingStart) {
    setBusy(true); setError(''); setExpiredStart(false); let confirmedMissing = false;
    try {
      const receipt = await call<PaperPracticeCreationResult | null>('/library/practice/requests/' + encodeURIComponent(value.body.requestKey));
      if (receipt && receipt.inputHash !== await paperPracticeInputHash(value.body, true)) throw new Error('原请求结果与这份开始记录不一致，请保留原文件核对。');
      confirmedMissing = receipt === null;
      const row = await call<PaperPracticeSessionView>('/library/practice/sessions', value.body);
      if (!alive.current) return;
      try { clearPaperRecovery(storage); } catch { /* The retained original key can still read the same record later. */ }
      window.location.assign('/library/practice?session=' + encodeURIComponent(row.id));
    } catch (caught) { if (alive.current) { setError(paperPracticeFailure(caught)); if (confirmedMissing && caught instanceof ApiRequestError && [400, 409].includes(caught.status)) setExpiredStart(true); } } finally { if (alive.current) setBusy(false); }
  }
  async function repreview() {
    if (!pending || !expiredStart || busy || !protectedLocally) return; setBusy(true); setError('');
    try {
      const receipt = await call<PaperPracticeCreationResult | null>('/library/practice/requests/' + encodeURIComponent(pending.body.requestKey));
      if (!alive.current) return;
      if (receipt) { if (receipt.inputHash !== await paperPracticeInputHash(pending.body, true)) throw new Error('原请求已存在不同结果，请保留原文件核对。'); setConfirmedStart(receipt.session.id); setNotice('原练习已经存在，请继续原记录。'); setExpiredStart(false); return; }
      try { storePaperRecovery(storage.base + '.' + crypto.randomUUID(), pending); }
      catch { if (!manualProtection) { setProtectedLocally(false); setManualProtection(true); setNotice('本机未能另存原开始记录。请先下载完整保护文件，并确认已经另外保留。'); return; } }
      setSelection(pending.body.selection); setStudentId(pending.body.studentId ?? ''); setPreview(null); setPending(null); setExpiredStart(false); setProtectedLocally(false); setManualProtection(false);
      try { clearPaperRecovery(storage); } catch { /* The original external file or independent copy remains available. */ }
      setNotice('原开始记录已保留。请重新预览原选择，确认当前原卷版本后再开始。');
    } catch (caught) { if (alive.current) setError(paperPracticeFailure(caught)); } finally { if (alive.current) setBusy(false); }
  }
  async function start() {
    if (!preview || pending) return;
    const value: PendingStart = { format: 'paper-practice-start-v1', ownerId: user.id, body: { studentId: studentId || null, selection, sourceHash: preview.sourceHash, requestKey: crypto.randomUUID() } };
    setPending(value);
    try { storePaperRecovery(storage.key, value); setProtectedLocally(true); await recover(value); }
    catch { setProtectedLocally(false); setManualProtection(true); setNotice('本机暂不能保存恢复信息。先下载保护文件，再继续开始，原选择会保留。'); }
  }
  async function restore(file: File | undefined) {
    if (!file) return; setError('');
    try {
      if (file.size > 256 * 1024) throw new Error('恢复文件过大，请使用原选题或开始记录文件。'); const value = JSON.parse(await file.text());
      if (!alive.current) return; if (value.ownerId !== user.id) throw new Error('恢复文件属于其他账号，请切换到原账号。');
      if (value.format === 'paper-practice-selection-v1') { if (pending) throw new Error('先核对原开始记录，再换一份选题。'); setSelection(parsePaperSelection(value.selection)); setPreview(null); setNotice('已恢复选题，请预览当前原卷。'); }
      else if (value.format === 'paper-practice-start-v1') { const saved = decodeStart(value); setPending(saved); setProtectedLocally(true); setManualProtection(false); setNotice('已读取原开始记录，可用原选择继续核对。'); }
      else throw new Error('这不是原卷练习的恢复文件。');
    } catch (caught) { if (alive.current) setError(paperPracticeFailure(caught)); }
  }
  return <div className="pp-shell"><header className="pp-heading"><a href="/library">← 返回题卷库</a><span>PAPER PRACTICE / 原卷练习</span><h1>先留下思考，<br />再看清下一步。</h1><p>原题、首次回答与订正始终放在一起。这里的自评与练习记录，不自动成为知识点能力分数。</p></header>
    {error && <div className="pp-error" role="alert">{error}<button onClick={() => setReload(value => value + 1)}>重新读取</button></div>}{notice && <p role="status">{notice}</p>}
    {pending ? <section className="pp-card" aria-label="原开始记录恢复"><h2>先核对上一次开始。</h2><p>原请求仍保留，读取或重试会沿用同一份选择。</p>{!protectedLocally && <p>本机尚未确认恢复信息已保存，请先保存恢复文件。</p>}
      <button className="studio-secondary" onClick={() => { downloadPaperRecovery(pending, '原卷练习开始记录.json'); setNotice('请确认浏览器已保存完整恢复文件，再继续开始。'); }}>下载开始记录保护文件</button>{manualProtection && <label><input type="checkbox" checked={protectedLocally} onChange={event => setProtectedLocally(event.target.checked)} />我已另外保留完整恢复文件</label>}
      <button className="studio-primary" disabled={busy || !protectedLocally} onClick={() => void recover(pending)}>{busy ? '正在核对原结果…' : '继续核对原开始记录 ↗'}</button>{expiredStart && <button className="studio-secondary" disabled={busy || !protectedLocally} onClick={() => void repreview()}>保留原开始记录，重新预览</button>}</section>
      : <section className="pp-card" aria-label="确认原卷练习"><h2>01 / 选好范围，再开始。</h2>{ready && <label>这次练习记录给谁<select value={studentId} disabled={busy} onChange={event => { setStudentId(event.target.value); setPreview(null); }}>{user.role !== 'student' && <option value="">我自己</option>}{children.map(child => <option value={child.id} key={child.id}>{child.nickname}{user.role !== 'student' ? ' · 陪练记录' : ''}</option>)}</select></label>}
        {!selection.length ? <p>还没有选题。到题卷库打开一份卷，选择整卷或题目后回来。</p> : <p>已选择 {selection.length} 份卷，请先核对题位、原卷状态与参考答案缺口。</p>}
        <button className="studio-secondary" disabled={!ready || !selection.length || busy} onClick={() => void inspect()}>{busy ? '正在核对原卷…' : '预览这次练习'}</button>
        {preview && <div className="pp-preview"><ul>{preview.papers.map(paper => <li key={paper.id}><strong>{paper.title}</strong><span>{paper.selected} 个原题位 · {paper.publicationStatus === 'published' ? '已发布' : '教研原件'}</span><button className="studio-text-button" onClick={() => { const next = selection.filter(row => row.paperId !== paper.id); setSelection(next); setPreview(null); try { if (new URLSearchParams(window.location.search).get('basket') === '1') storePaperRecovery(paperBasketKey(user.id), next); } catch { setNotice('本次选择已调整，本机清单暂未保存。'); } }}>移除这份卷</button></li>)}</ul><p>{preview.answerable} 个可作答记录 · {preview.missing} 个缺题位 · {preview.unavailable} 个当前不可用 · {preview.withoutReference} 个缺少可核对答案</p>{preview.documents > 0 && <p>包含 {preview.documents} 份未逐题切分的 PDF，将保留整卷作答笔记，不虚构题号或分数。</p>}<button className="studio-primary" disabled={busy || !preview.answerable} onClick={() => void start()}>确认范围，开始练习 ↗</button><button className="studio-text-button" disabled={busy} onClick={() => setPreview(null)}>返回修改范围</button></div>}
      </section>}
    {confirmedStart && <a className="studio-primary" href={'/library/practice?session=' + encodeURIComponent(confirmedStart)}>继续上次已保存的练习 ↗</a>}
    <section className="pp-card" aria-label="我的原卷练习"><h2>02 / 接着上次的思考。</h2>{history.length ? <div className="pp-history">{history.map(row => <a href={'/library/practice?session=' + encodeURIComponent(row.id)} key={row.id}><span>{statusNames[row.status]}</span><strong>{row.papers.map(paper => paper.title).join(' / ')}</strong><small>{row.submitted} / {row.total} 个记录已提交 · {new Date(row.updatedAt).toLocaleString('zh-CN')}</small></a>)}</div> : <p>{ready ? '这个范围还没有原卷练习记录。' : '正在读取当前范围…'}</p>}</section>
    <button className="studio-text-button" onClick={() => { try { setCopies(otherPaperCopies(storage, decodeStart)); } catch { setNotice('其他本机记录暂时无法读取，请使用自己的保护文件。'); } }}>查看其他本机开始记录</button>{copies.map((copy, index) => <button className="studio-secondary" key={copy.body.requestKey + ':' + index} disabled={!!pending || busy} onClick={() => { setPending(copy); setProtectedLocally(false); setManualProtection(true); }}>核对开始记录 {index + 1} · {copy.body.selection.length} 份卷</button>)}
    <label className="pp-recovery-file">从保护文件恢复<input type="file" accept="application/json,.json" onChange={event => { void restore(event.target.files?.[0]); event.target.value = ''; }} /></label>
  </div>;
}

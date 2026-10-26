'use client';
import * as React from 'react';
import { paperReviewVerificationSchema, type DiagnosticBlueprintView, type LearningScope, type PaperPracticeItemView, type PaperPracticeSessionView, type PaperReviewNextOptions } from '@study-agent/contracts';
import type { SessionUser } from '../lib/session-user';
import { paperPracticeFailure, usePaperPracticeApi } from '../lib/paper-practice-api';
import { clearPaperRecovery, downloadPaperRecovery, firstPaperCopy, paperStorage, storePaperRecovery } from '../lib/paper-practice-local';

type Pending = { format: 'paper-review-verification-v1'; ownerId: string; sessionId: string; itemId: string; body: ReturnType<typeof paperReviewVerificationSchema.parse> };
export function PaperReviewNextSteps({ user, row, item, ready }: { user: SessionUser; row: PaperPracticeSessionView; item: PaperPracticeItemView; ready: boolean }) {
  const { call, alive } = usePaperPracticeApi(), [options, setOptions] = React.useState<PaperReviewNextOptions | null>(null), [error, setError] = React.useState(''), [notice, setNotice] = React.useState('');
  const [children, setChildren] = React.useState<Array<{ id: string; nickname: string }>>([]), [studentId, setStudentId] = React.useState(row.studentId ?? '');
  const [atomId, setAtomId] = React.useState(''), [scope, setScope] = React.useState<LearningScope | null>(null), [scopeReady, setScopeReady] = React.useState(false), [confirmed, setConfirmed] = React.useState(false);
  const [pending, setPending] = React.useState<Pending | null>(null), [preview, setPreview] = React.useState<DiagnosticBlueprintView | null>(null);
  const [protectedLocally, setProtectedLocally] = React.useState(false), [manual, setManual] = React.useState(false), [busy, setBusy] = React.useState(false), [reload, setReload] = React.useState(0);
  const generation = React.useRef(0), busyRef = React.useRef(false), pendingRef = React.useRef(pending);
  pendingRef.current = pending;
  const storage = paperStorage('study.paper-review.verification:' + user.id + ':' + row.id + ':' + item.id);
  const base = '/library/practice/sessions/' + encodeURIComponent(row.id) + '/items/' + encodeURIComponent(item.id);
  const atom = options?.knowledge.atoms.find(atom => atom.id === atomId);
  function decode(value: unknown): Pending {
    const saved = value as Pending;
    if (!saved || saved.format !== 'paper-review-verification-v1' || saved.ownerId !== user.id || saved.sessionId !== row.id || saved.itemId !== item.id) throw new Error('这份新题预览保护文件不属于当前账号、练习和题位。');
    return { format: saved.format, ownerId: saved.ownerId, sessionId: saved.sessionId, itemId: saved.itemId, body: paperReviewVerificationSchema.parse(saved.body) };
  }
  function finish(saved: Pending, result: DiagnosticBlueprintView, observed: number) {
    if (result.studentId !== saved.body.studentId || result.blueprint.intent !== 'verification' || result.paperReviewOrigin?.sessionId !== row.id || result.paperReviewOrigin.itemId !== item.id || result.paperReviewOrigin.atomId !== saved.body.atomId)
      throw new Error('预览结果与原范围或来源不一致，请保留保护文件核对。');
    if (!alive.current || generation.current !== observed) return;
    try { clearPaperRecovery(storage); } catch { setNotice('原预览已确认，本机结束标记尚未写入，可继续读取同一结果。'); }
    setPreview(result); setPending(null); setManual(false); setProtectedLocally(false); setReload(value => value + 1); setNotice('独立新题蓝图已准备。实际开始仍需要在蓝图页确认。');
  }
  React.useEffect(() => {
    let current = true; const controller = new AbortController(); setOptions(null);
    void call<PaperReviewNextOptions>(base + '/next-options', undefined, controller.signal).then(value => {
      if (!current) return; setOptions(value); setAtomId(previous => value.knowledge.atoms.some(atom => atom.id === previous) ? previous : value.knowledge.atoms[0]?.id ?? '');
    }).catch(caught => { if (current) setError(paperPracticeFailure(caught)); });
    return () => { current = false; controller.abort(); };
  }, [base, row.version, call, reload]);
  React.useEffect(() => {
    let current = true; const controller = new AbortController();
    void call<Array<{ id: string; nickname: string }>>('/learning/students', undefined, controller.signal).then(value => { if (current) setChildren(value); }).catch(caught => { if (current) setError(paperPracticeFailure(caught)); });
    return () => { current = false; controller.abort(); };
  }, [call]);
  React.useEffect(() => {
    setScope(null); setScopeReady(false); setConfirmed(false); if (!studentId || !atom) return;
    let current = true; const controller = new AbortController();
    void call<LearningScope | null>('/students/' + encodeURIComponent(studentId) + '/learning-scope?subject=' + atom.subject, undefined, controller.signal).then(value => { if (current) { setScope(value); setScopeReady(true); } }).catch(caught => { if (current) { setError(paperPracticeFailure(caught)); setScopeReady(true); } });
    return () => { current = false; controller.abort(); };
  }, [studentId, atomId, atom?.subject, call]);
  React.useEffect(() => {
    let current = true; const controller = new AbortController(), observed = generation.current;
    try {
      const saved = firstPaperCopy(storage, decode);
      if (saved) {
        setPending(saved); setStudentId(saved.body.studentId);
        try { storePaperRecovery(storage.key, saved); setProtectedLocally(true); } catch { setManual(true); }
        void call<DiagnosticBlueprintView | null>(base + '/verification-requests/' + encodeURIComponent(saved.body.requestKey), undefined, controller.signal).then(result => { if (current && result) finish(saved, result, observed); }).catch(caught => { if (current) setError(paperPracticeFailure(caught)); });
      }
    } catch (caught) { setError(paperPracticeFailure(caught)); }
    return () => { current = false; controller.abort(); };
    // The mounted editor is keyed by the original account/session/item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, row.id, item.id]);
  React.useEffect(() => { const protect = (event: BeforeUnloadEvent) => { if (pending) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', protect); return () => window.removeEventListener('beforeunload', protect); }, [pending]);
  async function send(saved: Pending) {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError(''); const observed = ++generation.current;
    try {
      const original = await call<DiagnosticBlueprintView | null>(base + '/verification-requests/' + encodeURIComponent(saved.body.requestKey));
      const result = original ?? await call<DiagnosticBlueprintView>(base + '/verification-preview', saved.body); finish(saved, result, observed);
    } catch (caught) { if (alive.current) setError(paperPracticeFailure(caught)); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  function create() {
    if (!ready || !confirmed || !scope || !atom || !scope.learnedAtomIds.includes(atom.id) || scope.grade < atom.grade || pending || busyRef.current) return;
    generation.current++;
    const saved: Pending = { format: 'paper-review-verification-v1', ownerId: user.id, sessionId: row.id, itemId: item.id, body: paperReviewVerificationSchema.parse({ studentId, atomId: atom.id, requestKey: crypto.randomUUID() }) };
    setPending(saved); setPreview(null);
    try { storePaperRecovery(storage.key, saved); setProtectedLocally(true); void send(saved); }
    catch { setManual(true); setProtectedLocally(false); setNotice('本机未能保存原预览请求，请先下载保护文件，再用原范围继续。'); }
  }
  async function restore(file: File) {
    if (busyRef.current || pendingRef.current) return;
    const observed = ++generation.current;
    try {
      if (file.size > 256 * 1024) throw new Error('文件超过256KiB，请选择原新题预览保护文件。'); const saved = decode(JSON.parse(await file.text()));
      if (!alive.current) return;
      if (observed !== generation.current || busyRef.current || pendingRef.current) { setNotice('文件读取期间当前操作已变化，原结果保持；请核对后重新选择保护文件。'); return; }
      generation.current++; setPending(saved); setStudentId(saved.body.studentId); setPreview(null); setError('');
      try { storePaperRecovery(storage.key, saved); setProtectedLocally(true); setManual(false); } catch { setProtectedLocally(false); setManual(true); }
      setNotice('原预览已读回，请明确核对原结果；不会自动开始评测。');
    } catch (caught) { if (alive.current && observed === generation.current) setError(paperPracticeFailure(caught)); }
  }
  const blueprintHref = preview ? '/student/assessment?' + new URLSearchParams({ studentId: preview.studentId, subject: preview.scopeSnapshot.subject, blueprint: preview.id }) : '';
  // Confirmed reservations remain server-owned after the pending command is cleared.
  // Returning to the original question must retain its next step across later reloads.
  const savedPreview = options?.activities.find(activity => activity.kind === 'verification_preview');
  const scopeHref = '/student/assessment?' + new URLSearchParams({ ...(studentId ? { studentId } : {}), ...(atom ? { subject: atom.subject } : {}) });
  return <section className="pp-next-steps" aria-label="原题再练与独立新题"><header><small>下一步，选择怎样核对</small><h2>再练原题，或换一道新题。</h2><p>原题用于练熟过程；独立新题用于检验知识与原因，分别保留依据。</p></header>
    {error && <p className="pp-error" role="alert">{error}</p>}{notice && <p className="pp-notice" role="status">{notice}</p>}
    {!options ? <p role="status">正在核对原来源与下一步资格…</p> : <><div className="pp-next-choices"><section><h3>再练这道原题</h3><p>{options.redo.reason}</p><p>{user.role === 'student' ? '当前学习账号将记录新的本人作答。' : row.studentId ? '当前账号将记录新的本人陪练，不冒充孩子作答。' : '当前账号将记录新的本人练习。'}</p>{options.redo.href && <a className="studio-secondary" href={options.redo.href}>核对来源，再练原题 ↗</a>}</section><section><h3>用独立新题验证</h3><p>{options.knowledge.reason}</p>{options.knowledge.available && <fieldset disabled={busy || !!pending || !ready}><legend>先确认孩子和当前学习范围</legend><label>验证的孩子<select value={studentId} disabled={!!row.studentId || user.role === 'student'} onChange={event => { setStudentId(event.target.value); setPreview(null); }}><option value="">请选择有权的孩子</option>{children.map(child => <option key={child.id} value={child.id}>{child.nickname}</option>)}</select></label><label>核对的知识点<select value={atomId} onChange={event => { setAtomId(event.target.value); setPreview(null); }}>{options.knowledge.atoms.map(atom => <option key={atom.id} value={atom.id}>{atom.name}</option>)}</select></label>{studentId && atom && !scopeReady ? <p role="status">正在读取当前确认范围…</p> : scope ? <><p>当前确认：{scope.grade}年级 · {scope.term === 'upper' ? '上学期' : scope.term === 'lower' ? '下学期' : '完整学期'} · {scope.textbookVersion}</p><p>{scope.learnedAtomIds.includes(atomId) ? '此知识点在已确认的已学范围内。' : '此知识点尚未纳入已确认进度。'}</p><label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />我已核对这位孩子的当前年级、教材和已学范围</label></> : <p>需要先由家长确认当前年级、教材与已学范围。</p>}<button className="studio-primary" type="button" disabled={!confirmed || !scope?.learnedAtomIds.includes(atomId) || !atom || scope.grade < atom.grade} onClick={create}>预览独立新题蓝图</button></fieldset>}<a href={scopeHref}>查看学习范围，手动选择知识点 ↗</a></section></div>
      {preview && <section className="pp-card" aria-label="原卷关联的新题蓝图"><h3>独立新题蓝图已准备。</h3><p>{preview.scopeSnapshot.grade}年级 · {preview.atomNames.map(atom => atom.name).join('、')} · {preview.itemCount}道可用题</p><p>当前仅为题组预览；覆盖缺口和实际开始在蓝图页确认。</p><a className="studio-primary" href={blueprintHref}>打开原蓝图，确认后开始 ↗</a></section>}
      {!preview && savedPreview && <section className="pp-card" aria-label="原卷关联的新题蓝图"><h3>继续原来的独立新题蓝图。</h3><p>这份蓝图已保存在原记录中，尚未开始作答。请在蓝图页核对范围、有效期和可用题目。</p><a className="studio-primary" href={savedPreview.href}>打开原蓝图，确认后开始 ↗</a></section>}
      {!!options.activities.length && <details><summary>这次原题之后的实际活动 · {options.activities.length} 条</summary><ul>{options.activities.map(activity => <li key={activity.kind + ':' + activity.id}><a href={activity.href}>{activity.label}</a><time>{new Date(activity.at).toLocaleString('zh-CN')}</time></li>)}</ul></details>}</>}
    {pending && <section className="pp-card pp-recovery" aria-label="独立新题原预览恢复"><h3>保留原范围，再核对结果。</h3><button className="studio-secondary" onClick={() => downloadPaperRecovery(pending, '原卷独立新题预览保护文件.json')}>下载原预览保护文件</button>{manual && <label><input type="checkbox" checked={protectedLocally} onChange={event => setProtectedLocally(event.target.checked)} />我已另外保留完整预览文件</label>}<button className="studio-primary" disabled={busy || !protectedLocally} onClick={() => void send(pending)}>核对或重试原新题预览</button></section>}
    <details><summary>从原新题预览保护文件恢复</summary><label>选择新题预览保护文件<input type="file" accept="application/json,.json" disabled={busy || !!pending} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void restore(file); }} /></label></details>
  </section>;
}

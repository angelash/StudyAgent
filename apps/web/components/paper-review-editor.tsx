'use client';
import * as React from 'react';
import { paperPracticeCommandSchema, paperReviewOrganizationInputSchema, type PaperPracticeCommandResult, type PaperPracticeItemView, type PaperPracticeSessionView, type PaperReviewOrganizationInput } from '@study-agent/contracts';
import type { SessionUser } from '../lib/session-user';
import { paperPracticeFailure, usePaperPracticeApi } from '../lib/paper-practice-api';
import { clearPaperRecovery, downloadPaperRecovery, firstPaperCopy, otherPaperCopies, paperPracticeInputHash, paperStorage, storePaperRecovery } from '../lib/paper-practice-local';

type Command = ReturnType<typeof paperPracticeCommandSchema.parse>;
type Pending = { format: 'paper-review-command-v1'; ownerId: string; sessionId: string; itemId: string; body: Command };
type Draft = { format: 'paper-review-draft-v1'; ownerId: string; sessionId: string; itemId: string; baseRevision: number; values: PaperReviewOrganizationInput; tagsText: string };
const initialValues = (item: PaperPracticeItemView): PaperReviewOrganizationInput => ({ tags: item.organization?.tags ?? [], favorite: item.organization?.favorite ?? false,
  archived: item.organization?.archived ?? false, errorSteps: item.organization?.errorSteps ?? '', reflection: item.organization?.reflection ?? '', plannedDate: item.organization?.plannedDate ?? null });

export function PaperReviewEditor({ user, row, item, ready, onChanged }: { user: SessionUser; row: PaperPracticeSessionView; item: PaperPracticeItemView; ready: boolean; onChanged: (row: PaperPracticeSessionView) => void }) {
  const { call, alive } = usePaperPracticeApi(), editable = row.ownerUserId === user.id && !!row.permissions.organize;
  const [values, setValues] = React.useState(() => initialValues(item)), [baseRevision, setBaseRevision] = React.useState(item.organization?.revision ?? 0);
  const [tagsText, setTagsText] = React.useState(() => initialValues(item).tags.join('，'));
  const [dirty, setDirty] = React.useState(false), [pending, setPending] = React.useState<Pending | null>(null), [busy, setBusy] = React.useState(false);
  const [conflict, setConflict] = React.useState(false), [error, setError] = React.useState(''), [notice, setNotice] = React.useState('');
  const [protectedLocally, setProtectedLocally] = React.useState(false), [manual, setManual] = React.useState(false), [copies, setCopies] = React.useState<Array<Draft | Pending>>([]);
  const draftStorage = paperStorage('study.paper-practice.organization-draft:' + user.id + ':' + row.id + ':' + item.id);
  const commandStorage = paperStorage('study.paper-practice.organization-command:' + user.id + ':' + row.id + ':' + item.id);
  const saving = React.useRef(false), currentRevision = item.organization?.revision ?? 0;
  const valuesRef = React.useRef(values); valuesRef.current = values;
  const generation = React.useRef(0);
  const [restored, setRestored] = React.useState(false);
  function scope(value: { ownerId?: string; sessionId?: string; itemId?: string }) { if (value.ownerId !== user.id || value.sessionId !== row.id || value.itemId !== item.id) throw new Error('这份整理保护文件不属于当前账号、练习和题位。'); }
  function decodeDraft(value: unknown): Draft {
    const saved = value as Draft; if (!saved || saved.format !== 'paper-review-draft-v1') throw new Error('这不是反思草稿保护文件。'); scope(saved);
    if (!Number.isSafeInteger(saved.baseRevision) || saved.baseRevision < 0 || typeof saved.tagsText !== 'string' || saved.tagsText.length > 1000) throw new Error('草稿版本或标签内容无法核对。');
    return { format: saved.format, ownerId: saved.ownerId, sessionId: saved.sessionId, itemId: saved.itemId, baseRevision: saved.baseRevision, values: paperReviewOrganizationInputSchema.parse(saved.values), tagsText: saved.tagsText };
  }
  function decodeCommand(value: unknown): Pending {
    const saved = value as Pending; if (!saved || saved.format !== 'paper-review-command-v1') throw new Error('这不是整理原操作保护文件。'); scope(saved);
    const body = paperPracticeCommandSchema.parse(saved.body);
    if (!['organize', 'review_complete', 'review_reopen'].includes(body.kind) || !('itemId' in body) || body.itemId !== item.id) throw new Error('保护文件里的操作不属于当前整理。');
    return { format: saved.format, ownerId: saved.ownerId, sessionId: saved.sessionId, itemId: saved.itemId, body };
  }
  const draft = (next = values, revision = baseRevision, rawTags = tagsText): Draft => ({ format: 'paper-review-draft-v1', ownerId: user.id, sessionId: row.id, itemId: item.id, baseRevision: revision, values: next, tagsText: rawTags });
  const commandPath = '/library/practice/sessions/' + encodeURIComponent(row.id) + '/commands';
  async function acknowledge(saved: Pending, result: PaperPracticeCommandResult) {
    const observed = generation.current;
    if (result.inputHash !== await paperPracticeInputHash(saved.body)) throw new Error('原操作结果与保护文件内容不一致，请保留文件核对。');
    if (!alive.current || generation.current !== observed) return;
    let matchesDraft = false;
    try { matchesDraft = saved.body.kind === 'organize' && JSON.stringify(paperReviewOrganizationInputSchema.parse(valuesRef.current)) === JSON.stringify(saved.body.values); } catch { /* Invalid newer input remains a draft. */ }
    try { clearPaperRecovery(commandStorage); if (matchesDraft) clearPaperRecovery(draftStorage); } catch { setNotice('服务器已保存，本机结束标记暂未写入，可继续用原操作核对。'); }
    setPending(null); setManual(false); setProtectedLocally(false); if (matchesDraft) setDirty(false);
    onChanged(result.session); setNotice('整理已保存。回看记录不代表独立知识掌握证据。');
  }
  React.useEffect(() => {
    if (!editable) { setRestored(true); return; } let current = true; const controller = new AbortController(), observedGeneration = generation.current;
    try {
      const savedDraft = firstPaperCopy(draftStorage, decodeDraft);
      if (savedDraft) { setValues(savedDraft.values); setTagsText(savedDraft.tagsText); valuesRef.current = savedDraft.values; setBaseRevision(savedDraft.baseRevision); setDirty(true); setConflict(savedDraft.baseRevision !== currentRevision); try { storePaperRecovery(draftStorage.key, savedDraft); } catch { setNotice('已读回反思，但本机保存受限，请下载保护后再离开。'); } }
      const savedCommand = firstPaperCopy(commandStorage, decodeCommand);
      if (savedCommand) {
        setPending(savedCommand);
        try { storePaperRecovery(commandStorage.key, savedCommand); setProtectedLocally(true); } catch { setManual(true); }
        void call<PaperPracticeCommandResult | null>(commandPath + '/' + encodeURIComponent(savedCommand.body.requestKey), undefined, controller.signal).then(async result => {
          if (current && result && generation.current === observedGeneration) await acknowledge(savedCommand, result);
        }).catch(caught => { if (current) setError(paperPracticeFailure(caught)); });
      }
    } catch (caught) { setError(paperPracticeFailure(caught)); }
    setRestored(true);
    return () => { current = false; controller.abort(); };
    // Each editor is keyed by owner/session/item. Its original scope must survive metadata refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, row.id, item.id, editable]);
  React.useEffect(() => {
    if (!restored) return;
    if (dirty) { if (currentRevision !== baseRevision && !pending) setConflict(true); return; }
    const next = initialValues(item); setValues(next); setTagsText(next.tags.join('，')); setBaseRevision(currentRevision); setConflict(false);
  }, [currentRevision, dirty, pending, baseRevision, restored]);
  React.useEffect(() => { const protect = (event: BeforeUnloadEvent) => { if (dirty || pending) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', protect); return () => window.removeEventListener('beforeunload', protect); }, [dirty, pending]);
  function change(updates: Partial<PaperReviewOrganizationInput>, rawTags = tagsText) {
    const next = { ...values, ...updates }; setValues(next); valuesRef.current = next; setDirty(true);
    try { storePaperRecovery(draftStorage.key, draft(next, baseRevision, rawTags)); } catch { setNotice('本机暂不能保存反思草稿，请下载保护文件后再离开。'); }
  }
  async function send(saved: Pending) {
    if (saving.current) return; saving.current = true; setBusy(true); setError('');
    try {
      let result = await call<PaperPracticeCommandResult | null>(commandPath + '/' + encodeURIComponent(saved.body.requestKey));
      if (!result) result = await call<PaperPracticeCommandResult>(commandPath, saved.body);
      await acknowledge(saved, result);
    } catch (caught) { if (alive.current) setError(paperPracticeFailure(caught)); }
    finally { saving.current = false; if (alive.current) setBusy(false); }
  }
  function start(kind: 'organize' | 'review_complete' | 'review_reopen') {
    if (!editable || !ready || saving.current || pending || conflict) return;
    try {
      const body = paperPracticeCommandSchema.parse({ expectedVersion: row.version, requestKey: crypto.randomUUID(), kind, itemId: item.id, ...(kind === 'organize' ? { values } : {}) });
      const saved: Pending = { format: 'paper-review-command-v1', ownerId: user.id, sessionId: row.id, itemId: item.id, body }; generation.current++; setPending(saved); setError('');
      try { storePaperRecovery(commandStorage.key, saved); setProtectedLocally(true); void send(saved); }
      catch { setManual(true); setProtectedLocally(false); setNotice('本机未能保存原操作，请先下载完整保护文件，再明确继续。'); }
    } catch (caught) { setError(paperPracticeFailure(caught)); }
  }
  async function refreshConflict() {
    if (!pending || busy) return;
    downloadPaperRecovery(pending, '原卷反思冲突原操作.json'); downloadPaperRecovery(draft(), '原卷反思草稿.json');
    try {
      const latest = await call<PaperPracticeSessionView>('/library/practice/sessions/' + encodeURIComponent(row.id)); if (!alive.current) return;
      clearPaperRecovery(commandStorage); generation.current++; setPending(null); setManual(false); setProtectedLocally(false); setConflict(true); onChanged(latest); setNotice('两份内容已保留，请比较服务器记录后选择如何继续。');
    } catch (caught) { setError(paperPracticeFailure(caught)); }
  }
  async function importFile(file: File) {
    try {
      if (file.size > 256 * 1024) throw new Error('保护文件超过256KiB，请选择这道题的原草稿或原操作文件。');
      const raw = JSON.parse(await file.text()); if (!alive.current) return; const saved = raw?.format === 'paper-review-command-v1' ? decodeCommand(raw) : decodeDraft(raw); setCopies([saved]); setNotice('文件已核对范围，请明确选择下面的恢复副本。');
    } catch (caught) { if (alive.current) setError(paperPracticeFailure(caught)); }
  }
  const blocked = !editable || !ready || busy || !!pending;
  return <section className="pp-organization" aria-label="原卷复习与反思"><header><small>把问题说具体，再安排下一步</small><h2>这次，卡在哪里。</h2><p>记录自己的判断与反思；能力原因仍需独立题目验证。</p></header>
    {error && <p role="alert" className="pp-error">{error}</p>}{notice && <p role="status" className="pp-notice">{notice}</p>}
    {conflict && <div className="pp-conflict"><h3>当前记录与本机草稿需要比较。</h3><p className="pp-answer-text">服务器反思：{item.organization?.reflection || '尚未填写'}</p><p className="pp-answer-text">服务器错误步骤：{item.organization?.errorSteps || '尚未填写'}</p><button className="studio-secondary" disabled={!!pending || !ready} onClick={() => { setBaseRevision(currentRevision); setConflict(false); try { storePaperRecovery(draftStorage.key, draft(values, currentRevision)); } catch { setNotice('请下载本机反思保护文件。'); } }}>保留本机反思，按当前版本继续</button><button className="studio-text-button" disabled={!!pending || !ready} onClick={() => { const next = initialValues(item); setValues(next); setBaseRevision(currentRevision); setDirty(false); setConflict(false); try { clearPaperRecovery(draftStorage); } catch { setNotice('本机旧副本仍保留，可另行下载。'); } }}>采用服务器整理</button></div>}
    {pending && <section className="pp-recovery pp-card" aria-label="整理原操作恢复"><h3>原操作还在，可以核对后继续。</h3><button className="studio-secondary" onClick={() => downloadPaperRecovery(pending, '原卷反思原操作.json')}>下载整理原操作保护文件</button>{manual && <label><input type="checkbox" checked={protectedLocally} onChange={event => setProtectedLocally(event.target.checked)} />我已另外保留完整整理文件</label>}<button className="studio-primary" disabled={busy || !protectedLocally} onClick={() => void send(pending)}>核对或重试整理原操作</button><button className="studio-text-button" disabled={busy} onClick={() => void refreshConflict()}>保留冲突文件，读取最新版本</button></section>}
    <fieldset disabled={blocked}><legend>本人整理</legend><label>标签，用逗号分隔<input value={tagsText} maxLength={1000} onChange={event => { setTagsText(event.target.value); change({ tags: event.target.value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean) }, event.target.value); }} /></label>
      <label>具体错误步骤<textarea rows={3} maxLength={12000} value={values.errorSteps} onChange={event => change({ errorSteps: event.target.value })} placeholder="例如：读到了数量，却漏掉了单位不同这个条件。" /></label>
      <label>我的反思<textarea rows={4} maxLength={12000} value={values.reflection} onChange={event => change({ reflection: event.target.value })} placeholder="当时为什么这样想，下次准备怎样检查？" /></label>
      <div className="pp-organization-options"><label>计划回看日期<input type="date" value={values.plannedDate ?? ''} onChange={event => change({ plannedDate: event.target.value || null })} /></label><label><input type="checkbox" checked={values.favorite} onChange={event => change({ favorite: event.target.checked })} />收藏这道题</label><label><input type="checkbox" checked={values.archived} onChange={event => change({ archived: event.target.checked })} />从待复习中归档</label></div>
    </fieldset>
    {editable && <div className="pp-answer-actions"><button className="studio-primary" disabled={blocked || conflict || !dirty} onClick={() => start('organize')}>保存反思与安排</button><button className="studio-secondary" disabled={blocked || conflict || dirty || !item.firstAnswer} onClick={() => start(item.organization?.status === 'reviewed' ? 'review_reopen' : 'review_complete')}>{item.organization?.status === 'reviewed' ? '重新放回待复习' : '我已实际回看'}</button><button className="studio-text-button" onClick={() => downloadPaperRecovery(draft(), '原卷反思草稿.json')}>下载反思草稿保护文件</button></div>}
    <p className="pp-measurement-note">{item.organization?.status === 'reviewed' ? '已回看：' + new Date(item.organization.reviewedAt!).toLocaleString('zh-CN') : '尚未记录实际回看。'}{dirty ? ' 请先保存反思，再记录回看完成。' : ''}</p>
    <details><summary>完整整理历史 · {item.organization?.history.length ?? 0} 次</summary>{item.organization?.history.map(entry => <article key={entry.id}><h3>{({ organize: '整理与安排', review_complete: '实际回看', review_reopen: '重新待复习' })[entry.action]}</h3><time>{new Date(entry.at).toLocaleString('zh-CN')}</time><p className="pp-answer-text">{entry.values.errorSteps}</p><p className="pp-answer-text">{entry.values.reflection}</p><p>{entry.values.tags.join(' · ')}{entry.values.plannedDate ? ' · 计划 ' + entry.values.plannedDate : ''}</p></article>)}<button className="studio-secondary" onClick={() => downloadPaperRecovery({ format: 'paper-review-history-v1', ownerId: row.ownerUserId, sessionId: row.id, itemId: item.id, organization: item.organization }, '原卷完整整理历史.json')}>下载完整整理历史</button></details>
    {editable && <details><summary>恢复本机反思或原操作</summary><label>选择整理保护文件<input type="file" accept="application/json,.json" disabled={!!pending || busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file); }} /></label><button className="studio-secondary" disabled={!!pending || busy} onClick={() => { try { setCopies([...otherPaperCopies(draftStorage, decodeDraft), ...otherPaperCopies(commandStorage, decodeCommand)]); } catch (caught) { setError(paperPracticeFailure(caught)); } }}>查看其他本机整理副本</button>{copies.map((copy, index) => <button className="studio-secondary" key={index} disabled={!!pending || busy} onClick={() => { generation.current++; if (copy.format === 'paper-review-command-v1') { setPending(copy); try { storePaperRecovery(commandStorage.key, copy); setProtectedLocally(true); } catch { setManual(true); setProtectedLocally(false); } } else { setValues(copy.values); valuesRef.current = copy.values; setTagsText(copy.tagsText); setBaseRevision(copy.baseRevision); setDirty(true); setConflict(true); } setCopies([]); }}>比较并恢复整理副本 {index + 1}</button>)}</details>}
  </section>;
}

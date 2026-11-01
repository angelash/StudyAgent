'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import type { TextbookTeachingEditorDetail, TextbookTeachingMaterialCatalog, TextbookTeachingPreflight, TextbookTeachingCommand } from '@study-agent/contracts';
import { textbookTeachingCommandSchema } from '@study-agent/contracts';
import { apiRequest, ApiRequestError } from './api';
import { completeTeachingEditorCopy, downloadTeachingEditorCopy, emptyTeachingEditorDraft, readTeachingEditorCopy, teachingEditorBodyFingerprint,
  teachingEditorValueHash as hash, teachingEditorSaveCommand, teachingJournalEntry, teachingEditorArchiveByteLimit,
  type TeachingEditorDraft, type TeachingEditorOwner, type TeachingEditorJournal } from './teaching-editor-copy';
import { loadTeachingEditorLocal, saveTeachingEditorLocal, clearTeachingEditorLocal, TeachingEditorLocalUnavailable, type TeachingEditorLocalVersion } from './teaching-editor-local';
import { readTeachingEditorDetail, readTeachingEditorDirectory, readTeachingMaterialCatalog, readTeachingEditorSource, readTeachingEditorPreflight, type TeachingEditorDirectory } from './teaching-editor-read';
import { lookupTeachingEditorCommand, sendTeachingEditorCommand, type TeachingEditorLookup } from './teaching-editor-client';
import { teachingEditorDraftFromDetail, teachingEditorRebaseHeader, teachingEditorConfirmSavedVersion } from './teaching-editor-state';
import { useWorkspaceExitGuard } from './use-workspace-exit-guard';
import { commitWorkspaceNavigation } from './workspace-exit-guard';

const failure = (error: unknown) => error instanceof Error ? error.message : '当前操作暂未完成，完整原稿仍保留。';
const abort = () => new DOMException('当前教学稿操作已停止。', 'AbortError');
const validSlot = (value: string | null): value is string => Boolean(value && /^[a-zA-Z0-9_-]{1,180}$/.test(value));
const exitEvent = 'study:controlled-copy-exit';
// Memory fallback is private to the exact owner and slot. In particular, an
// auth-loss render does not discard inputs when IndexedDB is unavailable.
const retained = new Map<string, { copy: TeachingEditorDraft; version: TeachingEditorLocalVersion }>();
const retainedKey = (owner: TeachingEditorOwner, slot: string) => JSON.stringify([owner, slot]);

export function useTeachingEditorWorkspace(owner: TeachingEditorOwner, range?: { start: number; end: number }) {
  const params = useSearchParams(), rawSlot = params.get('teachingDraft'), linkedPackage = params.get('teachingPackage'), linkedVersion = params.get('teachingVersion'), ownerKey = JSON.stringify(owner);
  const [copy, setCopy] = React.useState<TeachingEditorDraft | null>(null), [slot, setSlot] = React.useState(''), [loaded, setLoaded] = React.useState(false), [reload, setReload] = React.useState(0);
  const [error, setError] = React.useState(''), [notice, setNotice] = React.useState(''), [storage, setStorage] = React.useState('正在核对本机完整稿…'), [busy, setBusy] = React.useState('');
  const [protectedCopy, setProtectedCopy] = React.useState(false), [denied, setDenied] = React.useState(false), [leaving, setLeaving] = React.useState<{ proceed: () => void } | null>(null);
  const [directory, setDirectory] = React.useState<TeachingEditorDirectory>({ page: 1, pageSize: 10, total: 0, items: [] });
  const [catalogs, setCatalogs] = React.useState<Record<string, TextbookTeachingMaterialCatalog>>({});
  const [comparison, setComparison] = React.useState<TextbookTeachingEditorDetail | null>(null), [report, setReport] = React.useState<{ bodyFingerprint: string; value: TextbookTeachingPreflight } | null>(null);
  const [sourceCandidate, setSourceCandidate] = React.useState<TeachingEditorDraft['source']>(null);
  const state = React.useRef<TeachingEditorDraft | null>(null), activeSlot = React.useRef(''), lifecycle = React.useRef(new AbortController()), queue = React.useRef<Promise<unknown>>(Promise.resolve());
  const version = React.useRef<TeachingEditorLocalVersion>({ revision: null, fingerprint: null }), dirty = React.useRef(false), operation = React.useRef<symbol | null>(null);
  const accessBlocked = React.useRef(false);
  const verified = React.useRef(new Map<string, string>()), verifiedBaseline = React.useRef(false), downloaded = React.useRef<string | null>(null), bypass = React.useRef(false);
  const fresh = React.useRef(new Set<string>()), staged = React.useRef(new Map<string, TeachingEditorDraft>()), reads = React.useRef({ directory: 0, comparison: 0 });
  const ready = loaded && copy !== null && JSON.stringify(copy.owner) === ownerKey && rawSlot === slot;
  function alive(signal: AbortSignal) { if (signal.aborted || signal !== lifecycle.current.signal) throw abort(); }
  function active(signal: AbortSignal) { alive(signal); if (accessBlocked.current) throw new ApiRequestError('当前教研权限须重新核对。', 403); }
  function actual() {
    const value = state.current;
    if (!value || JSON.stringify(value.owner) !== ownerKey || value.slot !== activeSlot.current || new URLSearchParams(window.location.search).get('teachingDraft') !== value.slot) throw Error('当前账号、教材课时或本机稿已改变，请核对后继续。');
    return value;
  }
  function adopt(value: TeachingEditorDraft, changed = true) {
    state.current = value;
    if (changed) retained.set(retainedKey(owner, value.slot), { copy: value, version: { ...version.current } }); else retained.delete(retainedKey(owner, value.slot));
    dirty.current = changed; downloaded.current = null; setCopy(value); setProtectedCopy(!changed);
    if (changed) setStorage('正在保留完整本机稿…');
  }
  function localFailure(caught: unknown, signal = lifecycle.current.signal) { if (!signal.aborted) {
    setStorage(!dirty.current && downloaded.current ? '本机存储不可用；最新完整下载副本已读回核对。' : failure(caught)); setError(failure(caught));
    if (dirty.current) setProtectedCopy(false);
  } }
  async function persist(value: TeachingEditorDraft, signal = lifecycle.current.signal) {
    const targetSlot = activeSlot.current;
    const job = queue.current.then(async () => {
      alive(signal); const complete = await completeTeachingEditorCopy(value, signal); alive(signal);
      if (state.current !== value) return complete;
      const saved = await saveTeachingEditorLocal(complete, owner, targetSlot, version.current, signal); alive(signal); version.current = saved;
      if (state.current === value) { retained.delete(retainedKey(owner, targetSlot)); staged.current.delete(targetSlot); dirty.current = false; setProtectedCopy(true); setStorage('完整本机稿已保存，并已读回核对。'); }
      return complete;
    }); queue.current = job.catch(() => {}); return job;
  }
  function navigate(nextSlot: string, packageId?: string, contentVersion?: number) {
    const query = new URLSearchParams(window.location.search); query.set('teachingDraft', nextSlot);
    if (packageId) query.set('teachingPackage', packageId); else query.delete('teachingPackage');
    if (contentVersion) query.set('teachingVersion', String(contentVersion)); else query.delete('teachingVersion');
    const href = window.location.pathname + '?' + query;
    bypass.current = true; try { commitWorkspaceNavigation(href, () => window.history.pushState(null, '', href)); } finally { bypass.current = false; }
  }
  function protectThen(proceed: () => void) { if (dirty.current) setLeaving({ proceed }); else proceed(); }
  React.useEffect(() => {
    const controller = new AbortController(); lifecycle.current.abort(); lifecycle.current = controller; operation.current = null; setBusy(''); setLoaded(false); setCopy(null); state.current = null;
    accessBlocked.current = false; setDenied(false); setError(''); setNotice(''); setStorage('正在核对本机完整稿…'); setProtectedCopy(false); setLeaving(null); setComparison(null); setSourceCandidate(null); setReport(null); setCatalogs({});
    setDirectory({ page: 1, pageSize: 10, total: 0, items: [] }); reads.current.directory++; reads.current.comparison++;
    verified.current.clear(); verifiedBaseline.current = false; downloaded.current = null; dirty.current = false; version.current = { revision: null, fingerprint: null };
    let selected = rawSlot; const recentKey = 'study.teaching-editor.last-slot:' + ownerKey;
    if (selected !== null && !validSlot(selected)) { setError('链接中的本机稿标识无法核对，原记录保持。请明确新建或导入完整稿。'); return () => controller.abort(); }
    if (!selected) { try { const old = sessionStorage.getItem(recentKey); if (validSlot(old)) selected = old; } catch {} if (!selected) { selected = crypto.randomUUID(); fresh.current.add(selected); } }
    const chosen = selected; activeSlot.current = chosen; setSlot(chosen); try { sessionStorage.setItem(recentKey, chosen); } catch {}
    if (chosen !== rawSlot) { const query = new URLSearchParams(window.location.search); query.set('teachingDraft', chosen); window.history.replaceState(null, '', window.location.pathname + '?' + query); }
    const memory = retained.get(retainedKey(owner, chosen)), stagedCopy = staged.current.get(chosen) ?? memory?.copy;
    void loadTeachingEditorLocal(owner, chosen, controller.signal).then(async result => {
      active(controller.signal);
      if (memory && !staged.current.has(chosen) && (memory.version.revision !== result.revision || memory.version.fingerprint !== result.fingerprint)) {
        version.current = memory.version; adopt(memory.copy); setLoaded(true); setStorage('另一标签已修改或清空本机稿。当前完整输入仍在，请下载并读回副本后另开本机稿。'); setError('未采用变化后的本机基准，原记录保持。'); return;
      }
      version.current = { revision: result.revision, fingerprint: result.fingerprint };
      if (stagedCopy) { await completeTeachingEditorCopy(stagedCopy, controller.signal); active(controller.signal); adopt(stagedCopy); setStorage('原完整输入已保留，正在重新核对本机存储。'); }
      else if (result.copy) { const { fingerprint: _fingerprint, ...body } = result.copy; adopt(body, false); setStorage('完整本机稿已读回；原命令仍须向服务器核对。'); }
      else adopt(emptyTeachingEditorDraft(owner, chosen, 'teaching-' + crypto.randomUUID(), range), false);
      setLoaded(true);
    }).catch(caught => { if (!controller.signal.aborted) {
      if (caught instanceof TeachingEditorLocalUnavailable && (fresh.current.has(chosen) || stagedCopy)) { adopt(stagedCopy ?? emptyTeachingEditorDraft(owner, chosen, 'teaching-' + crypto.randomUUID(), range), Boolean(stagedCopy)); setLoaded(true); setStorage(failure(caught)); }
      else { setError(failure(caught)); setStorage('原本机记录没有被空稿覆盖。'); }
    } });
    return () => controller.abort();
  }, [ownerKey, rawSlot, reload]);
  React.useEffect(() => { if (!ready || !copy || !dirty.current || denied) return; const signal = lifecycle.current.signal;
    const timer = setTimeout(() => { if (!signal.aborted && dirty.current && state.current === copy) void persist(copy, signal).catch(caught => localFailure(caught, signal)); }, 300); return () => clearTimeout(timer);
  }, [copy, ready, denied]);
  useWorkspaceExitGuard(owner.actorId, dirty.current || leaving !== null, { request: (_href, proceed) => setLeaving({ proceed }), isInternal: (next, before) => {
    if (bypass.current) return true; try { const a = new URL(next, before), b = new URL(before); return a.origin === b.origin && a.pathname === b.pathname &&
      ['teachingDraft', 'textbook', 'textbookVersion', 'textbookLesson', 'subject', 'grade', 'term'].every(key => a.searchParams.get(key) === b.searchParams.get(key)); } catch { return false; }
  } });
  React.useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
    const leave = (event: Event) => { if (dirty.current) { event.preventDefault(); setLeaving({ proceed: (event as CustomEvent<{ proceed: () => void }>).detail.proceed }); } };
    window.addEventListener('beforeunload', unload); window.addEventListener(exitEvent, leave);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener(exitEvent, leave); };
  }, []);
  async function identity(signal: AbortSignal) {
    const user = await apiRequest<{ id: string; role: string }>('/auth/me', { signal }); alive(signal);
    if (user.id !== owner.actorId || !['admin', 'teacher'].includes(user.role)) throw new ApiRequestError('当前登录身份已改变，原稿已隐藏；请重新登录原教研账号。', 403);
  }
  function accessFailure(caught: unknown, signal: AbortSignal) {
    if (signal.aborted) return; if (caught instanceof ApiRequestError && [401, 403].includes(caught.status)) { accessBlocked.current = true; setDenied(true); setComparison(null); setSourceCandidate(null); setCatalogs({}); }
    setError(failure(caught));
  }
  React.useEffect(() => {
    if (!ready) return; const signal = lifecycle.current.signal;
    const check = () => { if (document.visibilityState === 'visible') void identity(signal).catch(caught => accessFailure(caught, signal)); };
    check(); window.addEventListener('focus', check); document.addEventListener('visibilitychange', check);
    return () => { window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [ready, ownerKey]);
  async function work(label: string, action: (signal: AbortSignal) => Promise<void>, reauthenticate = false) {
    if (operation.current || denied && !reauthenticate) return;
    const token = Symbol(label), signal = lifecycle.current.signal; operation.current = token; setBusy(label); setError(''); setNotice('');
    try { await identity(signal); if (reauthenticate) { accessBlocked.current = false; setDenied(false); } active(signal); await action(signal); }
    catch (caught) { accessFailure(caught, signal); }
    finally { if (operation.current === token) { operation.current = null; if (!signal.aborted) setBusy(''); } }
  }
  function edit(recipe: (value: TeachingEditorDraft) => void) {
    if (operation.current || denied || !ready) return; const next = structuredClone(actual()); recipe(next);
    next.editor.reviewed = false; next.editor.originalTeaching = false; adopt(next); setReport(null);
  }
  function editReview(recipe: (value: TeachingEditorDraft) => void) { if (operation.current || denied || !ready) return; const next = structuredClone(actual()); recipe(next); adopt(next); }
  async function refreshDirectory(page = 1) { const signal = lifecycle.current.signal, generation = ++reads.current.directory;
    try { const value = await readTeachingEditorDirectory(owner, page, signal); active(signal); if (generation === reads.current.directory) setDirectory(value); } catch (caught) { accessFailure(caught, signal); }
  }
  React.useEffect(() => { if (ready && !denied) void refreshDirectory(); }, [ready, denied]);
  async function compare(packageId: string, contentVersion?: number) {
    await work('读取准确服务器版本', async signal => { const generation = ++reads.current.comparison, value = await readTeachingEditorDetail(owner, packageId, contentVersion, signal);
      active(signal); if (generation === reads.current.comparison) setComparison(value); });
  }
  React.useEffect(() => { if (!ready || denied || !linkedPackage) return;
    if (linkedVersion !== null && !/^[1-9]\d{0,2}$|^1000$/.test(linkedVersion)) { setError('链接中的教学内容版本无效，未替换本机稿。'); return; }
    void compare(linkedPackage, linkedVersion ? Number(linkedVersion) : undefined);
  }, [ready, denied, linkedPackage, linkedVersion]);
  function fork(value?: TeachingEditorDraft) {
    protectThen(() => { const chosen = crypto.randomUUID(), next = value ? { ...structuredClone(value), slot: chosen } : emptyTeachingEditorDraft(owner, chosen, 'teaching-' + crypto.randomUUID(), range);
      staged.current.set(chosen, next); fresh.current.add(chosen); navigate(chosen, next.baseline ? next.packageId : undefined, next.baseline?.contentVersion); });
  }
  async function openComparison() { await work('从准确版本另开本机稿', async signal => { if (!comparison) return;
    const value = await teachingEditorDraftFromDetail(owner, crypto.randomUUID(), comparison); active(signal); fork(value);
  }); }
  async function importCopy(file: File, readback = false) {
    await work(readback ? '读回完整下载副本' : '核对导入完整副本', async signal => {
      if (file.size > teachingEditorArchiveByteLimit) throw Error('完整副本超过256MiB读取预算，未覆盖当前稿。');
      const value = await readTeachingEditorCopy(JSON.parse(await file.text()), owner, signal); active(signal);
      if (readback) { const current = actual(), complete = await completeTeachingEditorCopy(current, signal); active(signal);
        if (complete.fingerprint !== value.copy.fingerprint) throw Error('读回副本与最新完整输入不同，当前稿仍需保留。');
        downloaded.current = complete.fingerprint; dirty.current = false; setProtectedCopy(true); setStorage('已读回下载副本，并核对最新完整输入。');
      } else { const { fingerprint: _fingerprint, ...body } = value.copy; fork(body); setNotice('副本将另开本机稿；原命令与原回执仍须重新查询。'); }
    });
  }
  async function download() { await work('下载完整教学稿', async signal => { const current = actual(); await downloadTeachingEditorCopy(current); active(signal); setNotice('完整副本已开始下载。请读回刚下载的文件，核对与最新输入一致。'); }); }
  async function retain(entry: TeachingEditorJournal, signal: AbortSignal) {
    active(signal); const body = actual(), previous = body.journal.find(row => row.input.requestKey === entry.input.requestKey);
    if (previous && previous.requestFingerprint !== entry.requestFingerprint) throw Error('同一个请求键已有另一份完整命令，未覆盖原稿。');
    if (previous?.result) {
      if (entry.result && await hash(previous.result) !== await hash(entry.result)) throw Error('服务器原回执与已保留回执不同，未覆盖原结果。');
      if (!entry.result) entry = { ...previous, message: entry.message };
    }
    if (!previous && body.journal.length >= 30) throw Error('本机原命令记录已达上限，请先保留副本并从准确服务器稿另开本机稿。');
    const next = { ...body, journal: previous ? body.journal.map(row => row.input.requestKey === entry.input.requestKey ? structuredClone(entry) : row) : [...body.journal, structuredClone(entry)] };
    if (await hash(next) !== await hash(body)) adopt(next);
    const current = actual();
    try { await persist(current, signal); }
    catch (caught) { localFailure(caught, signal);
      if (!(caught instanceof TeachingEditorLocalUnavailable) || downloaded.current !== (await completeTeachingEditorCopy(current, signal)).fingerprint) throw caught;
      dirty.current = false; setProtectedCopy(true); setStorage('最新完整原命令已由下载副本读回核对。');
    }
  }
  async function accept(result: TeachingEditorLookup, signal: AbortSignal) {
    active(signal); if (!result.verified) { setNotice(result.entry.message); return; }
    verified.current.set(result.entry.input.requestKey, result.entry.requestFingerprint);
    const body = actual(), receipt = result.entry.result!;
    if (result.entry.input.action === 'save') {
      const saved = await readTeachingEditorDetail(owner, body.packageId, receipt.affectedVersion, signal); active(signal);
      if (saved.version.report.contentFingerprint !== receipt.contentFingerprint || await hash(saved.savedBy.input) !== await hash(result.entry.input)) throw Error('原保存版本与原回执不一致，未更新编辑基准。');
      const next = await teachingEditorConfirmSavedVersion(actual(), saved); active(signal);
      if (next !== actual()) { adopt(next); verifiedBaseline.current = saved.header.revision === receipt.revision; }
    } else if (body.baseline) {
      adopt({ ...body, baseline: { ...body.baseline, header: structuredClone(result.current) } }); verifiedBaseline.current = result.current.revision === receipt.revision;
    }
    try { await persist(actual(), signal); } catch (caught) { localFailure(caught, signal); }
    const current = actual(); if (current.baseline) navigate(current.slot, current.packageId, current.baseline.contentVersion);
    await refreshDirectory(); active(signal); setNotice('完整原命令与原回执已核对，当前编辑内容保持。');
  }
  function pending() { return actual().journal.filter(entry => verified.current.get(entry.input.requestKey) !== entry.requestFingerprint); }
  async function resume(entry: TeachingEditorJournal, resend = false) {
    await work(resend ? '恢复同一份原命令' : '核对完整原命令回执', async signal => {
      const result = resend ? await sendTeachingEditorCommand(owner, entry, value => retain(value, signal), signal) : await lookupTeachingEditorCommand(owner, entry, signal);
      if (!resend) await retain(result.entry, signal); await accept(result, signal);
    });
  }
  async function command(input: TextbookTeachingCommand, signal: AbortSignal) {
    if (pending().length) throw Error('请先核对每个原命令的服务器回执，再创建新的操作。');
    if (actual().journal.length >= 30) throw Error('原命令记录已达上限，请先下载完整稿，再从准确服务器版本另开本机稿。');
    const entry = await teachingJournalEntry(owner, input), result = await sendTeachingEditorCommand(owner, entry, value => retain(value, signal), signal); await accept(result, signal);
  }
  async function save() { await work('保存完整教学稿', async signal => {
    const input = teachingEditorSaveCommand(actual(), crypto.randomUUID(), { baselineVerified: verifiedBaseline.current, verifiedOriginalRequests: [...verified.current.keys()] });
    await command(input, signal);
  }); }
  async function preflight() { await work('核对当前完整稿与材料缺口', async signal => {
    const body = actual(), input = teachingEditorSaveCommand(body, crypto.randomUUID(), { baselineVerified: verifiedBaseline.current, verifiedOriginalRequests: [...verified.current.keys()] });
    if (input.action !== 'save') throw Error('当前操作不是完整保存。');
    const value = await readTeachingEditorPreflight(owner, input, signal), bodyFingerprint = await teachingEditorBodyFingerprint(body); active(signal);
    if (actual() === body) setReport({ bodyFingerprint, value });
  }); }
  async function verifyBaseline() { await work('核对原内容版本与当前包头', async signal => {
    const body = actual(); if (!body.baseline) throw Error('当前稿还没有服务器保存基准。');
    const value = await readTeachingEditorDetail(owner, body.packageId, body.baseline.contentVersion, signal); active(signal); setComparison(value);
    if (value.header.revision !== body.baseline.header.revision) { verifiedBaseline.current = false; setNotice('包已有后续修订。请比较准确服务器版本，再明确确认当前修订号。'); return; }
    const next = teachingEditorRebaseHeader(actual(), value); adopt(next); verifiedBaseline.current = true;
    try { await persist(next, signal); } catch (caught) { localFailure(caught, signal); }
    setNotice('原内容版本与当前包头已核对。原命令仍分别查询。');
  }); }
  async function confirmRebase() { await work('确认按当前修订号继续编辑', async signal => {
    const body = actual(), previous = comparison; if (!previous || !body.baseline) throw Error('请先比较准确的原内容版本。');
    const current = await readTeachingEditorDetail(owner, body.packageId, body.baseline.contentVersion, signal); active(signal);
    if (await hash(current.header) !== await hash(previous.header)) { setComparison(current); throw Error('比较期间包头再次改变，请重新比较后确认。'); }
    const next = teachingEditorRebaseHeader(actual(), current); adopt(next); verifiedBaseline.current = true;
    try { await persist(next, signal); } catch (caught) { localFailure(caught, signal); }
    setNotice('已确认当前包头；复制基准仍是原内容版本，本机正文没有被替换。');
  }); }
  async function publish() { await work('显式发布准确保存版本', async signal => {
    const body = actual(), base = body.baseline;
    teachingEditorSaveCommand(body, crypto.randomUUID(), { baselineVerified: verifiedBaseline.current, verifiedOriginalRequests: [...verified.current.keys()] });
    if (!base || !verifiedBaseline.current || await teachingEditorBodyFingerprint(body) !== base.bodyFingerprint) throw Error('请先保存当前正文并核对准确版本。');
    if (base.contentVersion !== base.header.contentVersion) throw Error('当前包已有更新内容，请将当前编辑保存为新版本并重新核对，再明确发布。');
    if (!body.editor.reviewed || !body.editor.originalTeaching) throw Error('请逐段核对并确认原创教学与引用边界。');
    const detail = await readTeachingEditorDetail(owner, body.packageId, base.contentVersion, signal); active(signal);
    if (detail.header.revision !== base.header.revision || detail.version.report.fingerprint !== base.preflightFingerprint || !detail.version.report.publishable) { setComparison(detail); throw Error('当前版本、包头或材料缺口需要重新核对，未提交发布。'); }
    await command(textbookTeachingCommandSchema.parse({ action: 'publish', packageId: body.packageId, requestKey: crypto.randomUUID(), expectedRevision: base.header.revision,
      contentVersion: base.contentVersion, contentFingerprint: base.contentFingerprint, preflightFingerprint: base.preflightFingerprint, reviewed: true, originalTeaching: true, reason: body.editor.publishReason }), signal);
  }); }
  async function withdraw() { await work('撤回当前发布版本', async signal => {
    const body = actual(), base = body.baseline; if (!base || !verifiedBaseline.current || !base.header.published) throw Error('请先核对当前真正发布的版本。');
    const detail = await readTeachingEditorDetail(owner, body.packageId, base.header.published.contentVersion, signal); active(signal);
    if (detail.header.revision !== base.header.revision) { setComparison(detail); throw Error('当前包头已改变，请重新核对后撤回。'); }
    await command(textbookTeachingCommandSchema.parse({ action: 'withdraw', packageId: body.packageId, requestKey: crypto.randomUUID(), expectedRevision: base.header.revision,
      contentVersion: detail.version.contentVersion, contentFingerprint: detail.version.report.contentFingerprint, reason: body.editor.withdrawReason }), signal);
  }); }
  async function sourcePreview() { await work('核对完整课时来源', async signal => { const source = await readTeachingEditorSource(owner, actual().range, signal); active(signal);
    const body = actual(); if (body.source && body.source.fingerprint !== source.fingerprint) { setSourceCandidate(source); setNotice('来源已改变，请保留原完整稿后以新来源另开本机稿。'); return; }
    adopt({ ...body, source, editor: { ...body.editor, activeSourcePage: source.pageStart, reviewed: false, originalTeaching: false } }); setReport(null);
  }); }
  function useSourceCandidate() { if (!sourceCandidate) return; const body = actual(); if (body.sourceHistory.length >= 4) { setError('完整来源历史已达上限，请先保留当前稿，并从准确服务器版另开稿。'); return; }
    fork({ ...structuredClone(body), source: structuredClone(sourceCandidate), sourceHistory: [...structuredClone(body.sourceHistory), ...(body.source ? [structuredClone(body.source)] : [])],
      sourceReview: { confirmedRange: false, statement: '', pages: [] }, editor: { ...body.editor, activeSourcePage: sourceCandidate.pageStart, reviewed: false, originalTeaching: false } });
  }
  async function materialPage(atomId: string, page: number) { await work('核对当前可用材料', async signal => { const value = await readTeachingMaterialCatalog(owner, atomId, page, signal); active(signal); setCatalogs(previous => ({ ...previous, [atomId]: value })); }); }
  async function target(atomId: string, selected: boolean) {
    if (!selected) { edit(value => { value.targetRefs = value.targetRefs.filter(ref => ref.atomId !== atomId); }); return; }
    await work('核对当前教学目标定义', async signal => { const value = await readTeachingMaterialCatalog(owner, atomId, 1, signal); active(signal);
      const next = structuredClone(actual()); if (next.targetRefs.some(ref => ref.atomId === atomId)) return;
      if (next.targetRefs.length >= 8) throw Error('每课最多选择8个教学目标。');
      const { version, definitionFingerprint } = value.atom; next.targetRefs.push({ atomId, version, definitionFingerprint });
      if (!next.content.goals.some(goal => goal.atomId === atomId)) next.content.goals.push({ id: 'goal-' + crypto.randomUUID(), atomId, objective: value.atom.objective, successCriterion: value.atom.successCriterion });
      next.editor.reviewed = false; next.editor.originalTeaching = false; adopt(next); setCatalogs(previous => ({ ...previous, [atomId]: value })); setReport(null);
    });
  }
  async function clear() { await work('清空准确本机稿', async signal => {
    const body = actual(); await persist(body, signal); active(signal); version.current = await clearTeachingEditorLocal(owner, body.slot, version.current, signal); active(signal);
    retained.delete(retainedKey(owner, body.slot)); staged.current.delete(body.slot); dirty.current = false; setProtectedCopy(true); fork();
  }); }
  return { copy: ready ? copy : null, ready, slot, error, notice, storage, busy, protectedCopy, denied, leaving, directory, catalogs, comparison, report, sourceCandidate,
    baselineVerified: verifiedBaseline.current, verifiedRequests: [...verified.current.keys()],
    edit, editReview, setError, setLeaving, fork, openComparison, importCopy, download, resume, save, preflight, verifyBaseline, confirmRebase, publish, withdraw, sourcePreview,
    useSourceCandidate, materialPage, target, clear, compare, refreshDirectory, retryLocal: () => setReload(value => value + 1),
    resumeIdentity: () => work('重新核对原教研账号', async () => {}, true),
    continueLeaving: () => { if (leaving && !dirty.current) { const proceed = leaving.proceed; setLeaving(null);
      bypass.current = true; try { proceed(); } finally { bypass.current = false; }
    } } };
}

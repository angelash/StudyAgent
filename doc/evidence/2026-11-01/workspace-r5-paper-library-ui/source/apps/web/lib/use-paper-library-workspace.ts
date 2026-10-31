'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { paperLibraryCopyOwnerSchema, paperLibraryDraftSlotSchema, paperLibraryMetadataSchema, paperLibrarySelectionViewSchema, paperLibraryExportViewSchema,
  paperLibrarySelectionDirectorySchema, paperLibraryExportDirectorySchema, paperSelectionCommandSchema, paperExportCommandSchema, paperSelectionSourceKey,
  paperLibrarySourceIdentity, type PaperLibraryDraftBody, type PaperLibraryJournal, type PaperLibrarySelectionView, type PaperLibraryExportView,
  type PaperLibraryMetadata, type PaperSelectionSource } from '@study-agent/contracts';
import type { SessionUser } from './session-user';
import { apiRequest } from './api';
import { completePaperLibraryCopy, downloadPaperLibraryCopy, emptyPaperLibraryDraft, readPaperLibraryCopy, paperLibraryJournalEntry, paperLibraryValueHash } from './paper-library-copy';
import { clearPaperLibraryLocal, loadPaperLibraryLocal, savePaperLibraryLocal, PaperLibraryLocalUnavailable, type PaperLibraryLocalVersion } from './paper-library-local';
import { lookupPaperLibraryCommand, sendPaperLibraryCommand, type PaperLibraryLookup } from './paper-library-client';
import { useWorkspaceExitGuard } from './use-workspace-exit-guard';
import { sameWorkspaceActivity, commitWorkspaceNavigation } from './workspace-exit-guard';

const keyOf = (entry: PaperLibraryJournal) => entry.family + ':' + entry.input.requestKey;
const failure = (error: unknown) => error instanceof Error ? error.message : '当前操作暂未完成，完整稿仍保留。';
const abortError = () => new DOMException('当前完整稿操作已停止。', 'AbortError');
export function usePaperLibraryWorkspace(identity: SessionUser) {
  const params = useSearchParams(), rawSlot = params.get('paperDraft'), pane = params.get('paperDesk'), linkedListId = params.get('paperList'), linkedExportId = params.get('paperExport');
  const owner = React.useMemo(() => { const value = paperLibraryCopyOwnerSchema.safeParse({ actorId: identity.id, role: identity.role,
    scope: identity.role === 'student' ? { kind: 'student_self', studentId: identity.studentId } : { kind: 'private_preparation', studentId: null } }); return value.success ? value.data : null; }, [identity.id, identity.role, identity.studentId]);
  const ownerKey = JSON.stringify(owner), [slot, setSlot] = React.useState(''), [draft, setDraft] = React.useState<PaperLibraryDraftBody | null>(null), [loaded, setLoaded] = React.useState(false), [reload, setReload] = React.useState(0);
  const [error, setError] = React.useState(''), [notice, setNotice] = React.useState(''), [storage, setStorage] = React.useState('正在核对本机完整稿…'), [busy, setBusy] = React.useState(''), [protectedCopy, setProtectedCopy] = React.useState(false);
  const [leaving, setLeaving] = React.useState<{ proceed: () => void } | null>(null), [lists, setLists] = React.useState<{ page: number; total: number; items: PaperLibrarySelectionView[] }>({ page: 1, total: 0, items: [] }),
    [exports, setExports] = React.useState<{ page: number; total: number; items: PaperLibraryExportView[] }>({ page: 1, total: 0, items: [] }), [metadata, setMetadata] = React.useState<PaperLibraryMetadata | null>(null);
  const current = React.useRef<PaperLibraryDraftBody | null>(null), version = React.useRef<PaperLibraryLocalVersion>({ revision: null, fingerprint: null }), activeSlot = React.useRef(''), lifecycle = React.useRef(new AbortController()), queue = React.useRef<Promise<unknown>>(Promise.resolve()), dirty = React.useRef(false), verified = React.useRef(new Map<string, string>()), allowExit = React.useRef(false), operation = React.useRef<symbol | null>(null);
  const verifiedBaseline = React.useRef<string | null>(null);
  const directoryReads = React.useRef({ lists: 0, exports: 0 });
  const linkedReads = React.useRef({ lists: 0, exports: 0 });
  const [linkedList, setLinkedList] = React.useState<PaperLibrarySelectionView | null>(null), [linkedExport, setLinkedExport] = React.useState<PaperLibraryExportView | null>(null);
  const previousOwner = React.useRef(ownerKey);
  const freshSlots = React.useRef(new Set<string>()), stagedDrafts = React.useRef(new Map<string, PaperLibraryDraftBody>()), trustedBases = React.useRef(new Map<string, NonNullable<PaperLibraryDraftBody['baseline']>>());
  const ready = loaded && rawSlot === slot && draft !== null && JSON.stringify(draft.owner) === ownerKey && (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('paperDraft') === slot);
  function requireOwner() { if (!owner) throw Error('请先核实当前账号的本人备课或学生学习身份。'); return owner; }
  function request<T = unknown>(path: string, options: RequestInit = {}) { return apiRequest<T>(path, { ...options, headers: { 'X-Study-Actor': requireOwner().actorId } }); }
  function actual() { const value = current.current; if (!value || JSON.stringify(value.owner) !== ownerKey || !activeSlot.current || new URLSearchParams(window.location.search).get('paperDraft') !== activeSlot.current) throw Error('当前完整稿尚未核对，请保留原页面后重试。'); return value; }
  function active(signal: AbortSignal) { if (signal.aborted || signal !== lifecycle.current.signal) throw abortError(); }
  function navigate(patch: Record<string, string | null>, replace = false) {
    const query = new URLSearchParams(window.location.search); for (const [key, value] of Object.entries(patch)) if (value === null) query.delete(key); else query.set(key, value);
    const href = window.location.pathname + '?' + query; commitWorkspaceNavigation(href, () => window.history[replace ? 'replaceState' : 'pushState'](null, '', href));
  }
  function adopt(value: PaperLibraryDraftBody, changed = true) { current.current = value; dirty.current = changed; setDraft(value); setProtectedCopy(!changed); if (changed) setStorage('正在保留本机完整稿…'); }
  async function persist(value: PaperLibraryDraftBody, signal = lifecycle.current.signal) {
    const actualOwner = requireOwner(), ownedSlot = activeSlot.current;
    const job = queue.current.then(async () => {
      if (signal.aborted) throw abortError(); const copy = await completePaperLibraryCopy(value, signal);
      // A later edit or explicit clear supersedes queued autosaves. They may
      // not adopt the new revision and resurrect an earlier captured body.
      if (current.current !== value) return copy;
      const saved = await savePaperLibraryLocal(copy, actualOwner, ownedSlot, version.current, signal);
      if (signal.aborted) throw abortError(); version.current = saved;
      if (current.current === value) { dirty.current = false; setProtectedCopy(true); setStorage('本机完整稿已保留并读回核对。'); }
      return copy;
    }); queue.current = job.catch(() => {}); return job;
  }
  function localFailure(caught: unknown, signal = lifecycle.current.signal) { if (!signal.aborted) { setStorage(failure(caught)); setError(failure(caught)); setProtectedCopy(false); } }
  React.useEffect(() => {
    const controller = new AbortController(); lifecycle.current.abort(); lifecycle.current = controller; operation.current = null; setBusy(''); setLoaded(false); setDraft(null); current.current = null; setMetadata(null); setError(''); setNotice(''); setStorage('正在核对本机完整稿…'); setProtectedCopy(false); setLeaving(null); verified.current.clear(); verifiedBaseline.current = null; dirty.current = false; version.current = { revision: null, fingerprint: null };
    setLists({ page: 1, total: 0, items: [] }); setExports({ page: 1, total: 0, items: [] }); setLinkedList(null); setLinkedExport(null); directoryReads.current.lists++; directoryReads.current.exports++; linkedReads.current.lists++; linkedReads.current.exports++;
    if (previousOwner.current !== ownerKey) { freshSlots.current.clear(); stagedDrafts.current.clear(); trustedBases.current.clear(); previousOwner.current = ownerKey; }
    if (!owner) { setError('当前本人档案尚未核实，请重新确认登录身份。'); return () => controller.abort(); }
    const recentKey = 'study.paper-library.last-slot:' + ownerKey;
    let selected = rawSlot;
    if (selected !== null && !paperLibraryDraftSlotSchema.safeParse(selected).success) { setError('链接中的本机草稿标识无法核对。原稿没有被替换，请明确新建或导入完整副本。'); return () => controller.abort(); }
    if (!selected) { try { const old = sessionStorage.getItem(recentKey); if (paperLibraryDraftSlotSchema.safeParse(old).success) selected = old; } catch {} if (!selected) { selected = crypto.randomUUID(); freshSlots.current.add(selected); } }
    const chosen = selected; activeSlot.current = chosen; setSlot(chosen); try { sessionStorage.setItem(recentKey, chosen); } catch {}
    if (rawSlot !== chosen) { const query = new URLSearchParams(window.location.search); query.set('paperDraft', chosen); window.history.replaceState(null, '', window.location.pathname + '?' + query); }
    const staged = stagedDrafts.current.get(chosen);
    const loadedCopy = staged ? completePaperLibraryCopy(staged, controller.signal).then(copy => ({ copy, revision: null, fingerprint: null })) : loadPaperLibraryLocal(owner, chosen, controller.signal);
    void loadedCopy.then(async result => {
      if (controller.signal.aborted) return; version.current = { revision: result.revision, fingerprint: result.fingerprint };
      if (result.copy) { const { fingerprint: _fingerprint, ...body } = result.copy, trusted = trustedBases.current.get(chosen);
        if (JSON.stringify(body.owner) !== ownerKey) throw Error('完整稿属于另一账号或学习范围，未读取或覆盖原记录。');
        if (trusted && body.baseline && await paperLibraryValueHash(body.baseline) === await paperLibraryValueHash(trusted)) verifiedBaseline.current = trusted.identity.fingerprint;
        if (controller.signal.aborted) return; adopt(body, Boolean(staged)); setLists({ page: body.editor.listPage, total: 0, items: [] }); setExports({ page: body.editor.exportPage, total: 0, items: [] }); if (staged) setProtectedCopy(false);
        setNotice(body.journal.length ? '完整原稿已恢复。副本中的原请求须先核对服务器回执，再进行依赖它的新操作。' : '已恢复这个账号与范围的完整本机稿。'); }
      else { adopt(emptyPaperLibraryDraft(owner, chosen), false); setNotice('选择准确原题，先保留清单，再明确生成所需文档。'); }
      setStorage(staged ? '本机保留当前不可用，完整输入仍在当前页面，请下载副本后再关闭。' : result.copy ? '本机完整稿已读回核对。' : '尚未编辑新的本机稿。'); setLoaded(true);
    }).catch(caught => { if (!controller.signal.aborted) {
      if (caught instanceof PaperLibraryLocalUnavailable && freshSlots.current.has(chosen)) {
        adopt(emptyPaperLibraryDraft(owner, chosen), false); setProtectedCopy(false); setLoaded(true); setStorage(failure(caught)); setNotice('这是独立的新稿，可继续在当前页面编辑并下载完整副本。离开前请读回副本核对。');
      } else { setError(failure(caught)); setStorage('原本机记录保持，未用空稿覆盖。'); }
    } });
    return () => controller.abort();
  }, [ownerKey, rawSlot, reload]);
  React.useEffect(() => { if (!ready || !draft || !dirty.current) return; const signal = lifecycle.current.signal, timer = setTimeout(() => { if (!signal.aborted && dirty.current && current.current === draft) void persist(draft, signal).catch(caught => localFailure(caught, signal)); }, 300); return () => clearTimeout(timer); }, [draft, ready]);
  React.useEffect(() => { if (!ready || !['selection', 'exports'].includes(pane ?? '')) return; const body = actual(), exportId = linkedExportId;
    if (body.editor.pane !== pane || body.editor.exportId !== exportId) adopt({ ...body, editor: { ...body.editor, pane: pane as 'selection' | 'exports', exportId } });
  }, [ready, pane, linkedExportId]);
  // Every command is retained in full before POST. A retained unknown result
  // can safely resume after navigation; only unprotected input needs a guard.
  const unsafe = dirty.current;
  useWorkspaceExitGuard(identity.id, unsafe || leaving !== null, { request: (_href, proceed) => setLeaving({ proceed }), isInternal: (next, before) => {
    if (allowExit.current) return true; if (!sameWorkspaceActivity(next, before)) return false;
    try { const a = new URL(next, before), b = new URL(before), aPane = a.searchParams.get('paperDesk'), bPane = b.searchParams.get('paperDesk'); return a.searchParams.get('paperDraft') === b.searchParams.get('paperDraft') && (aPane === bPane || ['selection', 'exports'].includes(aPane ?? '')) &&
      (a.pathname !== '/studio' || a.searchParams.get('view') === 'materials' && a.searchParams.get('tab') === 'papers'); } catch { return false; }
  } });
  React.useEffect(() => { const unload = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload); }, []);
  function change(recipe: (body: PaperLibraryDraftBody) => PaperLibraryDraftBody) { if (operation.current) { setNotice('当前原请求正在处理，完整编辑保持，稍后可以继续调整。'); return; } const next = recipe(structuredClone(actual())); adopt(next); }
  async function work(label: string, action: (signal: AbortSignal) => Promise<void>) {
    if (operation.current) return; const token = Symbol(label), signal = lifecycle.current.signal; operation.current = token; setBusy(label); setError('');
    try { await action(signal); } catch (caught) { if (!signal.aborted) setError(failure(caught)); } finally { if (operation.current === token) { operation.current = null; if (!signal.aborted) setBusy(''); } }
  }
  async function retain(entry: PaperLibraryJournal, signal: AbortSignal) {
    if (signal.aborted) throw abortError(); const body = actual(), previous = body.journal.find(row => keyOf(row) === keyOf(entry));
    if (previous && previous.requestFingerprint !== entry.requestFingerprint) throw Error('这个原请求键已有另一份完整命令，当前稿未被替换。');
    if (previous?.result) {
      if (entry.result && await paperLibraryValueHash(entry.result) !== await paperLibraryValueHash(previous.result)) throw Error('这次原回执与已保留的原结果不同，完整原稿没有被覆盖。');
      if (!entry.result) entry = { ...previous, message: entry.message };
    }
    active(signal); const next = { ...body, journal: previous ? body.journal.map(row => keyOf(row) === keyOf(entry) ? entry : row) : [...body.journal, entry] }; adopt(next);
    try { await persist(next, signal); } catch (caught) { if (caught instanceof PaperLibraryLocalUnavailable) { localFailure(caught); setNotice('当前完整原命令仍在页面中。服务端操作会保留原请求键，请下载完整副本再关闭。'); } else throw caught; }
  }
  function pending() { return actual().journal.filter(row => verified.current.get(keyOf(row)) !== row.requestFingerprint); }
  async function accept(result: PaperLibraryLookup, signal: AbortSignal, from = window.location.href) {
    if (signal.aborted || !result.verified) return;
    if (result.entry.family === 'selection' && result.entry.result) {
      const latest = paperLibrarySelectionViewSchema.parse(result.current), original = result.entry.result;
      if (await paperLibraryValueHash(latest.scope) !== await paperLibraryValueHash(requireOwner().scope)) throw Error('原结果属于另一学习范围。');
      active(signal);
      verified.current.set(keyOf(result.entry), result.entry.requestFingerprint);
      if (latest.id === original.listId && latest.revision === original.revision && latest.fingerprint === original.fingerprint) {
        const body = actual(); verifiedBaseline.current = latest.fingerprint; adopt({ ...body, baseline: { identity: original, title: latest.title, items: latest.items.map(row => row.source) } });
        await persist(actual(), signal); active(signal); if (window.location.href === from) navigate({ paperList: latest.id }); setNotice('原保存回执已核对。后续编辑仍保留在当前完整稿中。');
      } else { verifiedBaseline.current = null; setNotice('原保存回执已确认，这份清单已有后续修订。当前编辑仍保留，请明确核对最新保存版本。'); }
    } else if (result.entry.family === 'export') {
      const latest = paperLibraryExportViewSchema.parse(result.current); if (await paperLibraryValueHash(latest.scope) !== await paperLibraryValueHash(requireOwner().scope)) throw Error('原导出属于另一学习范围。');
      active(signal); verified.current.set(keyOf(result.entry), result.entry.requestFingerprint); await refreshExports(1); active(signal);
      if (window.location.href === from) { const body = actual(); adopt({ ...body, editor: { ...body.editor, exportId: latest.id, pane: 'exports' } }); navigate({ paperDesk: 'exports', paperExport: latest.id }); } setNotice('原导出命令与回执已核对，请分别查看每册和格式的实际状态。');
    }
  }
  async function resume(entry: PaperLibraryJournal, resend = false) { await work(resend ? '按原命令重试' : '核对原请求', async signal => {
    const from = window.location.href;
    const result = resend ? await sendPaperLibraryCommand(requireOwner(), entry, value => retain(value, signal), signal) : await lookupPaperLibraryCommand(requireOwner(), entry, signal);
    if (!resend) await retain(result.entry, signal); await accept(result, signal, from); if (!result.verified) setNotice(result.entry.message);
  }); }
  async function saveSelection() { await work('保存准确选题清单', async signal => {
    const from = window.location.href;
    if (pending().length) throw Error('请先核对或按原命令重试尚未确认的原请求，完整编辑仍保留。');
    const lastSaved = actual().journal.filter(row => row.family === 'selection' && row.result !== null).at(-1);
    if (actual().baseline && verifiedBaseline.current !== actual().baseline!.identity.fingerprint || lastSaved && !actual().baseline) throw Error('请先核对原保存版本；原结果与当前完整编辑均保留，尚未另建或覆盖清单。');
    const body = actual(), baseline = body.baseline, input = paperSelectionCommandSchema.parse(baseline ? { kind: 'revise', requestKey: crypto.randomUUID(), listId: baseline.identity.listId,
      expectedRevision: baseline.identity.revision, expectedFingerprint: baseline.identity.fingerprint, title: body.title, items: body.items.map(paperLibrarySourceIdentity) } :
      { kind: 'create', requestKey: crypto.randomUUID(), scope: requireOwner().scope, title: body.title, items: body.items.map(paperLibrarySourceIdentity) });
    const entry = await paperLibraryJournalEntry(requireOwner(), 'selection', input), result = await sendPaperLibraryCommand(requireOwner(), entry, value => retain(value, signal), signal); await accept(result, signal, from);
  }); }
  async function sendExport(value: unknown) { await work('提交准确导出命令', async signal => {
    const from = window.location.href;
    if (pending().some(entry => entry.family === 'export')) throw Error('请先核对尚未确认的原导出命令，完整稿与当前任务仍保留。');
    let input = paperExportCommandSchema.parse(value); const body = actual();
    if (input.kind === 'create') {
      const baseline = body.baseline;
      if (!baseline || verifiedBaseline.current !== baseline.identity.fingerprint || pending().length || body.title !== baseline.title || await paperLibraryValueHash(body.items) !== await paperLibraryValueHash(baseline.items)) throw Error('请先明确保存并核对当前完整清单，再生成这份准确修订的文档。');
      if (input.listId !== baseline.identity.listId || input.listRevision !== baseline.identity.revision || input.listFingerprint !== baseline.identity.fingerprint || input.title !== body.exportSettings.title ||
          input.layout.answerLines !== Number(body.exportSettings.answerLines) || input.layout.breakBetweenQuestions !== body.exportSettings.breakBetweenQuestions || await paperLibraryValueHash(input.books) !== await paperLibraryValueHash(body.exportSettings.books) || await paperLibraryValueHash(input.formats) !== await paperLibraryValueHash(body.exportSettings.formats)) throw Error('导出预检依据或当前设置已变化，请保留原稿并重新核对。');
    } else {
      const control = input;
      // The displayed queued task may already be claimed. This is preparation
      // of a new command: freeze the current version only after this exact
      // generation has been rechecked. Retained original commands never pass
      // through this path and are always retried with their original bytes.
      const latest = paperLibraryExportViewSchema.parse(await request('/library/exports/' + encodeURIComponent(control.exportId), { signal }));
      if (latest.id !== control.exportId || await paperLibraryValueHash(latest.scope) !== await paperLibraryValueHash(requireOwner().scope)) throw Error('当前导出不属于这个准确本人范围，原稿仍保留。');
      active(signal); const slot = latest.slots.find(row => row.book === control.book && row.format === control.format);
      if (!slot || slot.generation !== control.expectedGeneration || slot.version < control.expectedTaskVersion) throw Error('这册的生成代次已变化，请刷新并明确核对当前任务。尚未发送新的控制命令。');
      if (control.kind === 'cancel' ? !['queued', 'running', 'retry_wait'].includes(slot.state) : !['failed', 'cancelled'].includes(slot.state) || !latest.availability.available) throw Error(control.kind === 'cancel' ? '这次生成已停止或完成，请刷新后核对实际文件。尚未发送取消命令。' : '当前原版本尚不具备重试条件，请刷新并核对来源或任务。原稿保持。');
      input = { ...input, expectedTaskVersion: slot.version };
    }
    const entry = await paperLibraryJournalEntry(requireOwner(), 'export', input), result = await sendPaperLibraryCommand(requireOwner(), entry, row => retain(row, signal), signal); await accept(result, signal, from);
  }); }
  async function refreshLists(page = lists.page) { const generation = ++directoryReads.current.lists, linkedGeneration = ++linkedReads.current.lists, signal = lifecycle.current.signal, value = paperLibrarySelectionDirectorySchema.parse(await request('/library/selection-lists?' + new URLSearchParams({ page: String(page), pageSize: '20' }), { signal }));
    if (signal.aborted || generation !== directoryReads.current.lists) return; for (const row of value.items) if (await paperLibraryValueHash(row.scope) !== await paperLibraryValueHash(requireOwner().scope)) throw Error('目录学习范围不一致。');
    const linked = linkedListId ? value.items.find(row => row.id === linkedListId) ?? paperLibrarySelectionViewSchema.parse(await request('/library/selection-lists/' + encodeURIComponent(linkedListId), { signal })) : null;
    if (linked && (linked.id !== linkedListId || await paperLibraryValueHash(linked.scope) !== await paperLibraryValueHash(requireOwner().scope))) throw Error('链接定位的清单与当前本人范围不一致。');
    if (!signal.aborted && generation === directoryReads.current.lists) { setLists({ page: value.page, total: value.total, items: value.items }); if (linkedGeneration === linkedReads.current.lists) setLinkedList(linked); const body = actual(); if (body.editor.listPage !== value.page) adopt({ ...body, editor: { ...body.editor, listPage: value.page } }); } }
  async function refreshExports(page = exports.page) { const generation = ++directoryReads.current.exports, linkedGeneration = ++linkedReads.current.exports, signal = lifecycle.current.signal, value = paperLibraryExportDirectorySchema.parse(await request('/library/exports?' + new URLSearchParams({ page: String(page), pageSize: '20' }), { signal }));
    if (signal.aborted || generation !== directoryReads.current.exports) return; for (const row of value.items) if (await paperLibraryValueHash(row.scope) !== await paperLibraryValueHash(requireOwner().scope)) throw Error('导出目录学习范围不一致。');
    const linked = linkedExportId ? value.items.find(row => row.id === linkedExportId) ?? paperLibraryExportViewSchema.parse(await request('/library/exports/' + encodeURIComponent(linkedExportId), { signal })) : null;
    if (linked && (linked.id !== linkedExportId || await paperLibraryValueHash(linked.scope) !== await paperLibraryValueHash(requireOwner().scope))) throw Error('链接定位的导出与当前本人范围不一致。');
    if (!signal.aborted && generation === directoryReads.current.exports) { setExports({ page: value.page, total: value.total, items: value.items }); if (linkedGeneration === linkedReads.current.exports) setLinkedExport(linked); const body = actual(); if (body.editor.exportPage !== value.page) adopt({ ...body, editor: { ...body.editor, exportPage: value.page } }); } }
  React.useEffect(() => { const generation = ++linkedReads.current.lists; setLinkedList(null); if (!ready || !linkedListId) return; const controller = new AbortController(), stop = () => controller.abort(), parent = lifecycle.current.signal; parent.addEventListener('abort', stop, { once: true });
    void request('/library/selection-lists/' + encodeURIComponent(linkedListId), { signal: controller.signal }).then(async response => { const value = paperLibrarySelectionViewSchema.parse(response);
      if (value.id !== linkedListId || await paperLibraryValueHash(value.scope) !== await paperLibraryValueHash(requireOwner().scope)) throw Error('链接定位的清单与当前本人范围不一致。'); if (!controller.signal.aborted && generation === linkedReads.current.lists) setLinkedList(value);
    }).catch(caught => { if (!controller.signal.aborted) setError(failure(caught)); }); return () => { parent.removeEventListener('abort', stop); controller.abort(); };
  }, [ready, linkedListId, ownerKey, slot]);
  React.useEffect(() => { const generation = ++linkedReads.current.exports; setLinkedExport(null); if (!ready || !linkedExportId) return; const controller = new AbortController(), stop = () => controller.abort(), parent = lifecycle.current.signal; parent.addEventListener('abort', stop, { once: true });
    void request('/library/exports/' + encodeURIComponent(linkedExportId), { signal: controller.signal }).then(async response => { const value = paperLibraryExportViewSchema.parse(response);
      if (value.id !== linkedExportId || await paperLibraryValueHash(value.scope) !== await paperLibraryValueHash(requireOwner().scope)) throw Error('链接定位的导出与当前本人范围不一致。'); if (!controller.signal.aborted && generation === linkedReads.current.exports) setLinkedExport(value);
    }).catch(caught => { if (!controller.signal.aborted) setError(failure(caught)); }); return () => { parent.removeEventListener('abort', stop); controller.abort(); };
  }, [ready, linkedExportId, ownerKey, slot]);
  React.useEffect(() => { if (!ready || !['selection', 'exports'].includes(pane ?? '')) return; const signal = lifecycle.current.signal; void (pane === 'selection' ? refreshLists() : refreshExports()).catch(caught => { if (!signal.aborted) setError(failure(caught)); }); }, [ready, pane]);
  function open(next: 'selection' | 'exports') { navigate({ paperDesk: next }); }
  function close() { navigate({ paperDesk: null }); }
  function newDraft() { const chosen = crypto.randomUUID(); freshSlots.current.add(chosen); navigate({ paperDraft: chosen, paperList: null, paperExport: null, paperDesk: 'selection' }); }
  async function readMetadata(paperId: string, expected: { detailSha256: string; publicationVersion: number | null }, signal: AbortSignal) {
    setMetadata(null); const value = paperLibraryMetadataSchema.parse(await request('/library/papers/' + encodeURIComponent(paperId) + '/metadata', { signal }));
    if (value.paperId !== paperId || value.detailSha256 !== expected.detailSha256 || value.publicationVersion !== expected.publicationVersion) throw Error('原预览与准确题位目录已变化，请重新打开原卷核对后再选择。');
    if (!signal.aborted) setMetadata(value);
  }
  function toggle(source: PaperSelectionSource) {
    try { change(body => { const key = paperSelectionSourceKey(source), index = body.items.findIndex(row => paperSelectionSourceKey(row) === key);
      if (index >= 0) return { ...body, items: body.items.filter((_, at) => at !== index) };
      if (body.items.length >= 100 || !body.items.some(row => row.paperId === source.paperId) && new Set(body.items.map(row => row.paperId)).size >= 10) throw Error('一份清单最多100题和10份原卷，已有清单仍保留。');
      if (body.items.some(row => row.paperId === source.paperId && (row.detailSha256 !== source.detailSha256 || row.publicationVersion !== source.publicationVersion))) throw Error('清单已保留这份原卷的另一版本，请先核对原题位后明确调整。');
      return { ...body, items: [...body.items, source] }; }); } catch (caught) { setError(failure(caught)); }
  }
  async function openSaved(id: string) { await work('读取已保存清单', async signal => {
    const value = paperLibrarySelectionViewSchema.parse(await request('/library/selection-lists/' + encodeURIComponent(id), { signal }));
    if (signal.aborted) return; if (await paperLibraryValueHash(value.scope) !== await paperLibraryValueHash(requireOwner().scope)) throw Error('这份清单属于另一学习范围。');
    active(signal);
    const chosen = crypto.randomUUID(), body = { ...emptyPaperLibraryDraft(requireOwner(), chosen), title: value.title, items: value.items.map(row => row.source),
      baseline: { identity: { listId: value.id, revision: value.revision, fingerprint: value.fingerprint, at: value.updatedAt }, title: value.title, items: value.items.map(row => row.source) } };
    trustedBases.current.set(chosen, body.baseline);
    try { await savePaperLibraryLocal(await completePaperLibraryCopy(body, signal), requireOwner(), chosen, { revision: null, fingerprint: null }, signal); }
    catch (caught) { if (!(caught instanceof PaperLibraryLocalUnavailable)) throw caught; stagedDrafts.current.set(chosen, body); freshSlots.current.add(chosen); }
    active(signal); navigate({ paperDraft: chosen, paperList: value.id, paperDesk: 'selection', paperExport: null });
  }); }
  async function download() { await work('下载完整稿', async () => { await downloadPaperLibraryCopy(actual()); setNotice('完整副本已交给浏览器下载。离开前可读回该文件，核对原输入与原请求。'); }); }
  async function importCopy(file: File, verifyOnly = false) { await work(verifyOnly ? '读回完整副本' : '导入完整副本', async signal => {
    if (file.size > 2 * 1024 * 1024) throw Error('完整副本超过2MiB，请保留原文件并核对来源。');
    const restored = await readPaperLibraryCopy(JSON.parse(await file.text()), requireOwner(), signal);
    if (verifyOnly) { const currentCopy = await completePaperLibraryCopy(actual(), signal); active(signal); if (currentCopy.fingerprint !== restored.copy.fingerprint) throw Error('这份文件与当前完整原稿不同，尚不能确认离开前已完整保留。'); setProtectedCopy(true); dirty.current = false; setStorage('已读回下载文件，全部输入与原请求一致。'); return; }
    const chosen = crypto.randomUUID(), { fingerprint: _fingerprint, ...old } = restored.copy, body = { ...old, slot: chosen };
    const copy = await completePaperLibraryCopy(body, signal);
    try { await savePaperLibraryLocal(copy, requireOwner(), chosen, { revision: null, fingerprint: null }, signal); }
    catch (caught) { if (!(caught instanceof PaperLibraryLocalUnavailable)) throw caught; stagedDrafts.current.set(chosen, body); freshSlots.current.add(chosen); }
    active(signal); navigate({ paperDraft: chosen, paperDesk: old.editor.pane, paperList: old.baseline?.identity.listId ?? null, paperExport: old.editor.exportId });
  }); }
  async function clearLocal() { await work('清空这份本机稿', async signal => { await persist(actual(), signal); const cleared = await clearPaperLibraryLocal(requireOwner(), activeSlot.current, version.current, signal); version.current = cleared; verified.current.clear(); verifiedBaseline.current = null; adopt(emptyPaperLibraryDraft(requireOwner(), activeSlot.current), false); setStorage('这份本机稿已明确清空，旧标签不能恢复覆盖。'); setNotice('如需修改已保存的清单，请从本人保存目录重新打开。'); }); }
  async function checkBaseline() { await work('核对原保存版本', async signal => {
    const baseline = actual().baseline; if (!baseline) throw Error('请从已保存目录明确打开最新版本，当前完整稿仍保留。');
    const latest = paperLibrarySelectionViewSchema.parse(await request('/library/selection-lists/' + encodeURIComponent(baseline.identity.listId), { signal }));
    if (signal.aborted) return; if (await paperLibraryValueHash(latest.scope) !== await paperLibraryValueHash(requireOwner().scope) || latest.revision !== baseline.identity.revision || latest.fingerprint !== baseline.identity.fingerprint ||
        await paperLibraryValueHash({ title: latest.title, items: latest.items.map(row => row.source) }) !== await paperLibraryValueHash({ title: baseline.title, items: baseline.items })) throw Error('原保存版本已有变化。当前完整编辑保持，请从本人保存目录核对最新版本后明确打开。');
    active(signal); verifiedBaseline.current = baseline.identity.fingerprint; setNotice('原保存版本已从服务器完整核对，可以继续保留的编辑。');
  }); }
  function proceed() { if (!protectedCopy || busy) return; const next = leaving?.proceed; allowExit.current = true; setLeaving(null); next?.(); queueMicrotask(() => { allowExit.current = false; }); }
  return { owner, ownerKey, slot, draft: draft && JSON.stringify(draft.owner) === ownerKey ? draft : null, ready, pane, error, notice, storage, busy, protectedCopy, leaving,
    lists: { ...lists, items: linkedList ? [linkedList, ...lists.items.filter(row => row.id !== linkedList.id)] : lists.items },
    exports: { ...exports, items: linkedExport ? [linkedExport, ...exports.items.filter(row => row.id !== linkedExport.id)] : exports.items }, linkedListId, linkedExportId, metadata, change, toggle, readMetadata, setError, setNotice,
    open, close, newDraft, saveSelection, sendExport, resume, refreshLists, refreshExports, openSaved, download, importCopy, clearLocal, pending: ready && draft ? draft.journal.filter(row => verified.current.get(keyOf(row)) !== row.requestFingerprint) : [],
    saveLocal: () => work('保留本机完整稿', async signal => { await persist(actual(), signal); }), work, retain, accept, actual, checkBaseline, baselineVerified: !draft?.baseline || verifiedBaseline.current === draft.baseline.identity.fingerprint, reload: () => setReload(value => value + 1),
    cancelLeave: () => setLeaving(null), proceed, isVerified: (entry: PaperLibraryJournal) => verified.current.get(keyOf(entry)) === entry.requestFingerprint };
}
export type PaperLibraryWorkspace = ReturnType<typeof usePaperLibraryWorkspace>;

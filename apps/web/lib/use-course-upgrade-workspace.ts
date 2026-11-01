'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import type { StudioCourse, StudioOverview, TextbookTeachingCourseUpgradePreview } from '@study-agent/contracts';
import { apiRequest, ApiRequestError } from './api';
import { refreshSessionUser } from './session-user';
import { useWorkspaceExitGuard } from './use-workspace-exit-guard';
import { courseBuilderScope } from './course-builder-copy';
import { completeCourseUpgradeCopy, emptyCourseUpgradeDraft, readCourseUpgradeCopy, courseUpgradeDraftCommand, courseUpgradePreview,
  prepareCourseUpgrade, downloadCourseUpgradeCopy, courseUpgradeValueHash as hash, courseUpgradeArchiveByteLimit,
  type CourseUpgradeDraft, type CourseUpgradeOwner, type CourseUpgradePending } from './course-upgrade-copy';
import { loadCourseUpgradeLocal, saveCourseUpgradeLocal, CourseUpgradeLocalUnavailable, type CourseUpgradeLocalVersion } from './course-upgrade-local';
import { lookupCourseUpgradeCommand, sendCourseUpgradeCommand, verifyCourseUpgradeBaseline, readStudioCourseHistory, readStudioCourseVersion } from './course-upgrade-client';

const retained = new Map<string, { copy: CourseUpgradeDraft; version: CourseUpgradeLocalVersion }>();
const memoryKey = (owner: CourseUpgradeOwner, slot: string) => JSON.stringify([owner, slot]);
const validSlot = (value: string | null): value is string => Boolean(value && /^[a-zA-Z0-9_-]{1,180}$/.test(value));
const message = (error: unknown) => error instanceof Error ? error.message : '升级尚未完成，完整原稿和原请求仍保留。';
const aborted = () => new DOMException('升级等待已停止，完整原稿和原请求仍保留。', 'AbortError');

export function useCourseUpgradeWorkspace(owner: CourseUpgradeOwner, selected: StudioOverview['selected'], baseline: StudioCourse, onConfirmed: (course: StudioCourse) => void) {
  const ownerKey = JSON.stringify(owner), route = useSearchParams(), linkedSlot = route.get('upgradeDraft'), [reopen, setReopen] = React.useState(0);
  const [copy, setCopy] = React.useState<CourseUpgradeDraft | null>(null), [loaded, setLoaded] = React.useState(false), [denied, setDenied] = React.useState(false);
  const [error, setError] = React.useState(''), [notice, setNotice] = React.useState(''), [storage, setStorage] = React.useState('正在核对升级完整稿…'), [busy, setBusy] = React.useState('');
  const [protectedCopy, setProtectedCopy] = React.useState(false), [preview, setPreview] = React.useState<TextbookTeachingCourseUpgradePreview | null>(null);
  const [leaving, setLeaving] = React.useState<{ proceed: () => void } | null>(null);
  const state = React.useRef<CourseUpgradeDraft | null>(null), lifecycle = React.useRef(new AbortController());
  const operation = React.useRef<{ token: symbol; controller: AbortController } | null>(null), queue = React.useRef<Promise<unknown>>(Promise.resolve());
  const version = React.useRef<CourseUpgradeLocalVersion>({ revision: null, fingerprint: null }), slot = React.useRef(''), dirty = React.useRef(false);
  const downloaded = React.useRef<string | null>(null), exported = React.useRef<string | null>(null), verified = React.useRef(new Set<string>());
  const bypass = React.useRef(false), blocked = React.useRef(false), currentSelected = React.useRef(selected), initialCourse = React.useRef(baseline), confirmed = React.useRef(onConfirmed);
  currentSelected.current = selected; initialCourse.current = baseline; confirmed.current = onConfirmed;

  function alive(signal = lifecycle.current.signal) { if (signal.aborted || signal !== lifecycle.current.signal) throw aborted(); }
  function actual() {
    const value = state.current;
    if (!value || JSON.stringify(value.owner) !== ownerKey || value.slot !== slot.current || blocked.current) throw Error('当前账号、原课程或升级稿已改变，请先核对。');
    return value;
  }
  async function identity(signal = lifecycle.current.signal) {
    const life = lifecycle.current.signal, user = await apiRequest<{ id: string; role: string }>('/auth/me', { signal }); alive(life);
    if (signal.aborted) throw aborted();
    if (user.id !== owner.actorId || user.role !== owner.role) throw new ApiRequestError('当前登录身份或角色已改变，原升级稿已隐藏。', 403);
  }
  function accessFailure(error: unknown) {
    if (error instanceof ApiRequestError && [401, 403].includes(error.status)) { blocked.current = true; setDenied(true); operation.current?.controller.abort(); void refreshSessionUser(); }
    setError(message(error));
  }
  function adopt(value: CourseUpgradeDraft, changed = true) {
    state.current = value; setCopy(value); dirty.current = changed; downloaded.current = null; exported.current = null; setProtectedCopy(!changed);
    if (changed) { retained.set(memoryKey(owner, value.slot), { copy: value, version: { ...version.current } }); setStorage('正在保留完整升级稿…'); }
    else retained.delete(memoryKey(owner, value.slot));
  }
  function localFailure(error: unknown) { if (!lifecycle.current.signal.aborted) { setStorage(message(error)); setError(message(error)); if (dirty.current) setProtectedCopy(false); } }
  async function persist(value: CourseUpgradeDraft, requireCurrent = true) {
    const signal = lifecycle.current.signal, chosen = slot.current;
    const job = queue.current.then(async () => {
      alive(signal); const complete = await completeCourseUpgradeCopy(value, signal); alive(signal);
      if (state.current !== value) { if (requireCurrent) throw Error('完整升级输入已更新，请保留最新稿后重试。'); return complete; }
      try { const saved = await saveCourseUpgradeLocal(complete, owner, chosen, version.current, signal); alive(signal); version.current = saved; }
      catch (error) { alive(signal); if (downloaded.current !== complete.fingerprint) throw error; }
      if (state.current === value) { retained.delete(memoryKey(owner, chosen)); dirty.current = false; setProtectedCopy(true); setStorage(downloaded.current === complete.fingerprint ? '完整升级下载副本已读回；本机存储仍需核对。' : '完整升级稿已保存并读回核对。'); }
      return complete;
    });
    queue.current = job.catch(() => {}); return job;
  }
  // Re-reading the same server receipt must not invalidate a file already read back.
  async function keep(next: CourseUpgradeDraft) {
    const value = actual();
    if (await hash(value) === await hash(next)) { await persist(value); return value; }
    adopt(next); await persist(next); return next;
  }
  function setLocation(chosen: string) {
    bypass.current = true;
    try { const url = new URL(window.location.href); url.searchParams.set('upgradeDraft', chosen); window.history.replaceState(null, '', url.pathname + url.search); }
    finally { bypass.current = false; }
  }
  React.useEffect(() => {
    const controller = new AbortController(); lifecycle.current.abort(); lifecycle.current = controller; operation.current = null; blocked.current = false;
    setDenied(false); setLoaded(false); setCopy(null); state.current = null; setPreview(null); setBusy(''); setError(''); setNotice(''); setLeaving(null);
    verified.current.clear(); version.current = { revision: null, fingerprint: null }; downloaded.current = null; exported.current = null; dirty.current = false;
    const recent = 'study.course-upgrade.last-slot:' + ownerKey; let chosen = new URLSearchParams(window.location.search).get('upgradeDraft');
    if (chosen !== null && !validSlot(chosen)) { setLoaded(true); setError('链接中的升级稿标识无法核对，原记录保持。'); return () => controller.abort(); }
    if (!chosen) try { const prior = sessionStorage.getItem(recent); if (validSlot(prior)) chosen = prior; } catch {}
    const fresh = !chosen; if (!chosen) chosen = crypto.randomUUID();
    const selectedSlot = chosen; slot.current = selectedSlot; setLocation(selectedSlot); try { sessionStorage.setItem(recent, selectedSlot); } catch {}
    const memory = retained.get(memoryKey(owner, selectedSlot));
    void loadCourseUpgradeLocal(owner, selectedSlot, controller.signal).then(saved => {
      alive(controller.signal);
      if (memory && (memory.version.revision !== saved.revision || memory.version.fingerprint !== saved.fingerprint)) {
        version.current = memory.version; adopt(memory.copy); setLoaded(true); setStorage('另一标签已修改或清空原稿。当前全部输入仍保留，请下载并核对两份原稿。'); return;
      }
      version.current = { revision: saved.revision, fingerprint: saved.fingerprint };
      if (memory) adopt(memory.copy);
      else if (saved.copy) { const { fingerprint: _fingerprint, ...body } = saved.copy; adopt(body, false); setStorage('完整升级稿已读回，原课程和原请求仍须向服务器核对。'); }
      else if (fresh) adopt(emptyCourseUpgradeDraft(owner, selectedSlot, currentSelected.current, initialCourse.current));
      else { setError('原升级稿不存在或已清空，未用空稿覆盖。可以明确按当前版本另开稿。'); }
      setLoaded(true);
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error instanceof CourseUpgradeLocalUnavailable && (fresh || memory)) { adopt(memory?.copy ?? emptyCourseUpgradeDraft(owner, selectedSlot, currentSelected.current, initialCourse.current)); setStorage(message(error)); }
      else { setError(message(error)); setStorage('原记录没有被空稿覆盖。'); }
      setLoaded(true);
    });
    return () => { controller.abort(); operation.current?.controller.abort(); };
  }, [ownerKey, reopen]);
  React.useEffect(() => {
    if (loaded && new URLSearchParams(window.location.search).get('upgradeDraft') !== slot.current) request(() => setReopen(value => value + 1));
  }, [linkedSlot, loaded]);
  React.useEffect(() => {
    if (!loaded) return;
    const signal = lifecycle.current.signal, check = () => { if (document.visibilityState === 'visible') void identity(signal).catch(error => { if (!signal.aborted) accessFailure(error); }); };
    check(); window.addEventListener('focus', check); document.addEventListener('visibilitychange', check);
    return () => { window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [loaded, ownerKey]);
  React.useEffect(() => {
    if (!loaded || !copy || !dirty.current) return;
    const timer = setTimeout(() => { if (state.current === copy) void persist(copy, false).catch(error => { if (state.current === copy) localFailure(error); }); }, 300);
    return () => clearTimeout(timer);
  }, [loaded, copy]);
  function request(proceed: () => void) {
    if (!dirty.current || blocked.current) { proceed(); return; }
    const value = state.current; if (!value || operation.current) { setLeaving({ proceed }); return; }
    // Save and read back the latest complete input first; ask for a downloaded copy only when local protection fails.
    void persist(value).then(() => { if (state.current === value && !dirty.current) proceed(); else setLeaving({ proceed }); }).catch(error => { localFailure(error); setLeaving({ proceed }); });
  }
  useWorkspaceExitGuard(owner.actorId, Boolean(copy && !denied), { request: (_href, proceed) => request(proceed), isInternal: () => bypass.current });
  React.useEffect(() => {
    const leave = (event: Event) => { if (!dirty.current || blocked.current) return; event.preventDefault(); request((event as CustomEvent<{ proceed: () => void }>).detail.proceed); };
    const unload = (event: BeforeUnloadEvent) => { if (dirty.current && !blocked.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('study:controlled-copy-exit', leave); window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('study:controlled-copy-exit', leave); window.removeEventListener('beforeunload', unload); };
  }, []);
  async function work(label: string, run: (signal: AbortSignal) => Promise<void>, requiresCopy = true) {
    if (operation.current) return;
    const token = Symbol(label), controller = new AbortController(), life = lifecycle.current.signal; operation.current = { token, controller }; setBusy(label); setError('');
    try { await identity(controller.signal); if (requiresCopy) actual(); else if (blocked.current) throw Error('请重新核对当前身份。'); await run(controller.signal); alive(life); }
    catch (error) { if (!life.aborted && (error as Error).name !== 'AbortError') { accessFailure(error); if (error instanceof Error && error.name === 'ZodError') setError('请核对完整时间与准确课时选择，原文字和原课程仍保留。'); } }
    finally { if (operation.current?.token === token) { operation.current = null; if (!life.aborted) setBusy(''); } }
  }
  function update(form: Partial<CourseUpgradeDraft['form']>) {
    if (operation.current || blocked.current) return; const value = actual();
    if (value.pending) { setError('请先核对原升级结果，当前完整原请求保持。'); return; }
    adopt({ ...value, form: { ...value.form, ...form }, preview: null }); setPreview(null); setError('');
  }
  async function retainPending(entry: CourseUpgradePending) { await keep({ ...actual(), pending: entry }); }
  async function settle(entry: CourseUpgradePending) {
    if (entry.phase !== 'rejected') { setNotice(entry.message); return; }
    const value = actual(); if (value.pending?.input.requestKey !== entry.input.requestKey) throw Error('当前升级稿已变化，原拒绝结果没有覆盖它。');
    await keep({ ...value, pending: null, preview: null, history: [...value.history, entry].slice(-100) }); setPreview(null); setNotice('');
    setError('没有升级课程：' + entry.message + ' 完整升级稿和原请求记录已保留，请核对后重新预览，或按当前版本另开升级稿。');
  }
  async function verifyHistory(value: CourseUpgradeDraft, signal: AbortSignal) {
    for (const entry of value.history) {
      const result = await lookupCourseUpgradeCommand(owner, entry, signal); if (signal.aborted) throw aborted();
      // A refused request created no revision; finding none again is consistent with that refusal.
      if (!result.verified && entry.phase === 'rejected') continue;
      if (!result.verified) throw Error('一份历史升级原请求尚未核对，完整稿和同键请求保持。');
      verified.current.add(entry.input.requestKey);
    }
  }
  function currentScope(value: CourseUpgradeDraft) {
    const selected = currentSelected.current;
    if (!selected || selected.id !== owner.studentId || selected.subject !== owner.subject || JSON.stringify(value.scope) !== JSON.stringify(courseBuilderScope(selected.scope, selected.grade))) throw Error('当前学习范围已改变，请保留完整稿并按当前版本另开升级稿。');
  }
  async function generate() {
    await work('正在核对升级蓝图', async signal => {
      const value = actual(); if (value.pending) throw Error('请先核对原升级结果。'); currentScope(value); await persist(value); await verifyHistory(value, signal);
      await verifyCourseUpgradeBaseline(owner, value, signal);
      const result = await apiRequest<TextbookTeachingCourseUpgradePreview>('/learning/studio/courses/upgrade-preview', { method: 'POST', body: JSON.stringify(courseUpgradeDraftCommand(value)), signal, headers: { 'X-Study-Actor': owner.actorId } });
      if (signal.aborted) throw aborted(); const details = await courseUpgradePreview(value, result); await keep({ ...value, preview: details });
      setPreview(result); setNotice('已核对原课程与准确教学版本，请审阅变化后明确确认。');
    });
  }
  async function create() {
    await work('正在确认课程升级', async signal => {
      if (!preview) throw Error('请先重新预览当前完整输入。'); const value = actual(); currentScope(value); await verifyHistory(value, signal); await verifyCourseUpgradeBaseline(owner, value, signal);
      const entry = await prepareCourseUpgrade(value, crypto.randomUUID(), { baselineVerified: true, verifiedOriginalRequests: [...verified.current] });
      await completeCourseUpgradeCopy({ ...value, pending: entry }, signal); await retainPending(entry);
      const result = await sendCourseUpgradeCommand(owner, entry, retainPending, signal); if (signal.aborted) throw aborted();
      if (result.verified) { verified.current.add(result.entry.input.requestKey); confirmed.current(result.course); } else await settle(result.entry);
    });
  }
  async function lookup(open = false) {
    await work(open ? '正在打开原升级版本' : '正在核对原升级结果', async signal => {
      const value = actual(); if (!value.pending) throw Error('当前没有待核对的原升级请求。');
      const result = await lookupCourseUpgradeCommand(owner, value.pending, signal); if (signal.aborted) throw aborted(); await retainPending(result.entry);
      if (result.verified) { verified.current.add(result.entry.input.requestKey); setNotice('原升级请求与准确结果已核对，可以打开这次原修订。'); if (open) confirmed.current(result.course); }
      else await settle(result.entry);
    });
  }
  async function recover() {
    await work('正在恢复同一升级请求', async signal => {
      const value = actual(); if (!value.pending) throw Error('当前没有原升级请求。');
      const result = await sendCourseUpgradeCommand(owner, value.pending, retainPending, signal); if (signal.aborted) throw aborted();
      if (result.verified) { verified.current.add(result.entry.input.requestKey); confirmed.current(result.course); } else await settle(result.entry);
    });
  }
  async function download() { await work('正在下载完整升级稿', async () => { exported.current = await downloadCourseUpgradeCopy(actual()); setNotice('完整升级副本已开始下载，请读回刚下载的文件核对。'); }); }
  async function verifyFile(file: File | undefined) {
    if (!file) return;
    await work('正在读回升级下载副本', async signal => {
      if (file.size > courseUpgradeArchiveByteLimit) throw Error('副本超过256MiB读取预算，请保留原文件另行核对。');
      const value = actual(), saved = await readCourseUpgradeCopy(JSON.parse(await file.text()), owner, signal), complete = await completeCourseUpgradeCopy(value, signal);
      if (saved.copy.fingerprint !== complete.fingerprint || exported.current !== complete.fingerprint) throw Error('这个文件不是当前最新输入的完整下载副本，原稿保持。');
      downloaded.current = complete.fingerprint; dirty.current = false; setProtectedCopy(true); setStorage('当前完整升级下载副本已实际读回核对。');
    });
  }
  async function fork(imported?: File) {
    await work(imported ? '正在独立导入升级稿' : '正在按当前版本另开升级稿', async signal => {
      const value = state.current;
      if (value) { if (value.pending && !verified.current.has(value.pending.input.requestKey)) throw Error('请先向服务器核对原升级结果，再另开稿。'); await persist(value); }
      const history = await readStudioCourseHistory(owner, signal), latest = await readStudioCourseVersion(owner, history.currentRevision, signal);
      let next = emptyCourseUpgradeDraft(owner, crypto.randomUUID(), currentSelected.current, latest.course);
      if (imported) {
        if (imported.size > courseUpgradeArchiveByteLimit) throw Error('副本超过读取预算，原文件保持。');
        const parsed = await readCourseUpgradeCopy(JSON.parse(await imported.text()), owner, signal), { fingerprint: _fingerprint, ...body } = parsed.copy;
        next = { ...body, slot: next.slot };
      }
      await completeCourseUpgradeCopy(next, signal); if (signal.aborted) throw aborted(); slot.current = next.slot; version.current = { revision: null, fingerprint: null }; verified.current.clear(); setPreview(null);
      adopt(next); setLocation(next.slot); try { sessionStorage.setItem('study.course-upgrade.last-slot:' + ownerKey, next.slot); } catch {} setLoaded(true); await persist(next);
      setNotice(imported ? '已另开独立导入稿。文件不授予原课程或原请求权限，后续须向服务器核对。' : '已按服务器当前修订另开升级稿，原完整稿保留在原标识中。');
    }, false);
  }
  function edit() { if (operation.current || actual().pending) return; adopt({ ...actual(), preview: null }); setPreview(null); setError(''); }
  return { copy, loaded, denied, error, notice, storage, busy, protectedCopy, preview, leaving, setLeaving, request, update, generate, create, lookup: () => lookup(), recover,
    openOriginal: () => lookup(true), download, verifyFile, fresh: () => fork(), importFile: (file: File | undefined) => file ? fork(file) : Promise.resolve(), edit,
    stop: () => operation.current?.controller.abort(), verifiedOriginal: copy?.pending ? verified.current.has(copy.pending.input.requestKey) : false };
}

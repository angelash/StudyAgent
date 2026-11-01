import type { TeachingEditorCopy, TeachingEditorOwner } from './teaching-editor-copy';
import { teachingEditorOwnerSchema, teachingEditorCopyByteLimit, readTeachingEditorCopy } from './teaching-editor-copy';

type Row = { key: string; revision: number; fingerprint: string | null; body: string | null; savedAt: string };
export type TeachingEditorLocalVersion = { revision: number | null; fingerprint: string | null };
export class TeachingEditorLocalConflict extends Error { constructor() { super('另一标签或本机记录已变化。当前完整教学稿仍保留，请下载副本并核对两个版本。'); this.name = 'TeachingEditorLocalConflict'; } }
export class TeachingEditorLocalUnavailable extends Error { constructor(message='本机暂时不能完整保留教学稿，请下载当前完整副本后再关闭。') { super(message); this.name = 'TeachingEditorLocalUnavailable'; } }
const databaseName = 'studyagent-teaching-editor-v1', storeName = 'drafts';
const stopped = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('本机教学稿操作已停止。', 'AbortError'); };
export function teachingEditorLocalKey(owner: TeachingEditorOwner, slot: string) {
  const actual = teachingEditorOwnerSchema.parse(owner); if (!slot || slot.length > 180) throw new TeachingEditorLocalConflict();
  return JSON.stringify(['teaching-editor-local-v1', actual.actorId, actual.bookId, actual.bookVersion, actual.lessonId, slot]);
}
function parseRow(value: unknown, key: string): Row | null {
  if (value === undefined) return null; const row = value as Row;
  if (!row || typeof row !== 'object' || Object.keys(row).sort().join(',') !== 'body,fingerprint,key,revision,savedAt' || row.key !== key ||
      !Number.isSafeInteger(row.revision) || row.revision < 1 || typeof row.savedAt !== 'string' || !Number.isFinite(Date.parse(row.savedAt)) ||
      (row.body === null ? row.fingerprint !== null : typeof row.body !== 'string' || new TextEncoder().encode(row.body).length > teachingEditorCopyByteLimit || typeof row.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(row.fingerprint)))
    throw Error('本机旧教学稿的格式需要核对，原记录没有被覆盖或移除。');
  return row;
}
const sameRow = (a: Row | null, b: Row | null) => a === null || b === null ? a === b : a.key === b.key && a.revision === b.revision && a.fingerprint === b.fingerprint && a.body === b.body && a.savedAt === b.savedAt;
function open(): Promise<IDBDatabase> {
  return new Promise((yes, no) => {
    let request: IDBOpenDBRequest, rejected = false;
    try { if (!globalThis.indexedDB) throw Error(); request = indexedDB.open(databaseName, 1); } catch { no(new TeachingEditorLocalUnavailable()); return; }
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: 'key' }); };
    request.onerror = request.onblocked = () => { rejected = true; no(new TeachingEditorLocalUnavailable()); };
    request.onsuccess = () => { const db = request.result; if (rejected) { db.close(); return; } db.onversionchange = () => db.close(); yes(db); };
  });
}
async function readRaw(key: string, signal?: AbortSignal) {
  stopped(signal); const db = await open();
  try { stopped(signal); return await new Promise<Row | null>((yes, no) => {
    const tx = db.transaction(storeName, 'readonly'), request = tx.objectStore(storeName).get(key); let result: Row | null = null, reason: unknown;
    const abort = () => { try { tx.abort(); } catch {} }; signal?.addEventListener('abort', abort, { once: true });
    request.onsuccess = () => { try { stopped(signal); result = parseRow(request.result, key); } catch (error) { reason = error; abort(); } };
    tx.oncomplete = () => { signal?.removeEventListener('abort', abort); try { stopped(signal); yes(result); } catch (error) { no(error); } };
    tx.onerror = tx.onabort = () => { signal?.removeEventListener('abort', abort); no(reason ?? (signal?.aborted ? new DOMException('本机读取已停止。', 'AbortError') : new TeachingEditorLocalUnavailable())); };
  }); } finally { db.close(); }
}
async function checked(owner: TeachingEditorOwner, slot: string, signal?: AbortSignal) {
  const row = await readRaw(teachingEditorLocalKey(owner, slot), signal);
  if (!row || row.body === null) return { row, copy: null };
  let value: unknown; try { value = JSON.parse(row.body); } catch { throw Error('本机旧教学稿内容需要核对，原记录没有被覆盖或移除。'); }
  const { copy } = await readTeachingEditorCopy(value, owner, signal);
  if (copy.slot !== slot || copy.fingerprint !== row.fingerprint) throw new TeachingEditorLocalConflict();
  return { row, copy };
}
export async function loadTeachingEditorLocal(owner: TeachingEditorOwner, slot: string, signal?: AbortSignal) {
  const actual = await checked(owner, slot, signal); return { copy: actual.copy, revision: actual.row?.revision ?? null, fingerprint: actual.row?.fingerprint ?? null, savedAt: actual.row?.savedAt ?? null };
}
async function replace(key: string, reviewed: Row | null, next: Row, signal?: AbortSignal) {
  stopped(signal); const db = await open();
  try { stopped(signal); await new Promise<void>((yes, no) => {
    const tx = db.transaction(storeName, 'readwrite'), store = tx.objectStore(storeName), request = store.get(key); let reason: unknown;
    const abort = () => { try { tx.abort(); } catch {} }; signal?.addEventListener('abort', abort, { once: true });
    request.onsuccess = () => { try { stopped(signal); if (!sameRow(parseRow(request.result, key), reviewed)) throw new TeachingEditorLocalConflict(); store.put(next); } catch (error) { reason = error; abort(); } };
    tx.oncomplete = () => { signal?.removeEventListener('abort', abort); try { stopped(signal); yes(); } catch (error) { no(error); } };
    tx.onerror = tx.onabort = () => { signal?.removeEventListener('abort', abort); no(reason ?? (signal?.aborted ? new DOMException('本机写入已停止。', 'AbortError') : new TeachingEditorLocalUnavailable())); };
  }); } finally { db.close(); }
  if (!sameRow(await readRaw(key, signal), next)) throw new TeachingEditorLocalConflict();
}
function expected(row: Row | null, value: TeachingEditorLocalVersion) {
  if (value.revision !== null && (!Number.isSafeInteger(value.revision) || value.revision < 1) || (row?.revision ?? null) !== value.revision ||
      (row?.fingerprint ?? null) !== value.fingerprint || row?.revision === Number.MAX_SAFE_INTEGER) throw new TeachingEditorLocalConflict();
}
export async function saveTeachingEditorLocal(value: TeachingEditorCopy, owner: TeachingEditorOwner, slot: string, version: TeachingEditorLocalVersion, signal?: AbortSignal) {
  const { copy } = await readTeachingEditorCopy(value, owner, signal); if (copy.slot !== slot) throw new TeachingEditorLocalConflict();
  const body=JSON.stringify(copy);
  if(new TextEncoder().encode(body).length>teachingEditorCopyByteLimit)throw new TeachingEditorLocalUnavailable('完整教学稿超过8MiB本机存储预算，请下载并读回完整副本后继续，全部输入和原命令仍保留。');
  const key = teachingEditorLocalKey(owner, slot), reviewed = (await checked(owner, slot, signal)).row; expected(reviewed, version);
  const next: Row = { key, revision: (reviewed?.revision ?? 0) + 1, fingerprint: copy.fingerprint, body, savedAt: new Date().toISOString() };
  await replace(key, reviewed, next, signal); return { revision: next.revision, fingerprint: next.fingerprint!, savedAt: next.savedAt };
}
/** Clearing is a versioned tombstone. A stale tab cannot recreate this draft. */
export async function clearTeachingEditorLocal(owner: TeachingEditorOwner, slot: string, version: TeachingEditorLocalVersion, signal?: AbortSignal) {
  const key = teachingEditorLocalKey(owner, slot), reviewed = (await checked(owner, slot, signal)).row; expected(reviewed, version);
  if (!reviewed?.body) throw new TeachingEditorLocalConflict();
  const next: Row = { key, revision: reviewed.revision + 1, fingerprint: null, body: null, savedAt: new Date().toISOString() };
  await replace(key, reviewed, next, signal); return { revision: next.revision, fingerprint: null, savedAt: next.savedAt };
}

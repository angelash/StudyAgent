import { paperLibraryCopyOwnerSchema, paperLibraryDraftSlotSchema, type PaperLibraryCompleteCopy, type PaperLibraryCopyOwner } from '@study-agent/contracts';
import { paperLibraryCopyByteLimit, readPaperLibraryCopy } from './paper-library-copy';

const databaseName = 'studyagent-paper-library-v1', storeName = 'drafts';
type Row = { key: string; revision: number; fingerprint: string | null; body: string | null; savedAt: string };
export type PaperLibraryLocalVersion = { revision: number | null; fingerprint: string | null };
export class PaperLibraryLocalConflict extends Error { constructor() { super('另一标签或本机记录已变化。当前完整稿仍保留，请下载副本并核对两个版本。'); this.name = 'PaperLibraryLocalConflict'; } }
export class PaperLibraryLocalUnavailable extends Error { constructor() { super('本机暂时不能完整保留选题稿。当前输入仍在页面中，请下载完整副本后再关闭。'); this.name = 'PaperLibraryLocalUnavailable'; } }
const stopped = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('本机完整稿操作已停止，当前输入仍保留。', 'AbortError'); };
export function paperLibraryLocalKey(owner: PaperLibraryCopyOwner, slot: string) {
  const scope = paperLibraryCopyOwnerSchema.parse(owner); return JSON.stringify(['paper-library-local-v1', scope.actorId, scope.role, scope.scope.kind, scope.scope.studentId, paperLibraryDraftSlotSchema.parse(slot)]);
}
function row(value: unknown, key: string): Row | null {
  if (value === undefined) return null;
  const current = value as Row;
  if (!current || typeof current !== 'object' || Object.keys(current).sort().join(',') !== 'body,fingerprint,key,revision,savedAt' || current.key !== key ||
      !Number.isSafeInteger(current.revision) || current.revision < 1 || typeof current.savedAt !== 'string' || !Number.isFinite(Date.parse(current.savedAt)) ||
      (current.body === null ? current.fingerprint !== null : typeof current.body !== 'string' || current.body.length > paperLibraryCopyByteLimit || typeof current.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(current.fingerprint)))
    throw new Error('本机旧稿的格式需要核对，原记录没有被覆盖或移除。');
  return current;
}
const same = (a: Row | null, b: Row | null) => a === null || b === null ? a === b : a.key === b.key && a.revision === b.revision && a.fingerprint === b.fingerprint && a.body === b.body && a.savedAt === b.savedAt;
function open(): Promise<IDBDatabase> {
  return new Promise((yes, no) => {
    let request: IDBOpenDBRequest, rejected = false;
    try { if (!globalThis.indexedDB) throw Error(); request = indexedDB.open(databaseName, 1); } catch { no(new PaperLibraryLocalUnavailable()); return; }
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: 'key' }); };
    request.onerror = request.onblocked = () => { rejected = true; no(new PaperLibraryLocalUnavailable()); };
    request.onsuccess = () => { const db = request.result; if (rejected) { db.close(); return; } db.onversionchange = () => db.close(); yes(db); };
  });
}
async function readRaw(key: string, signal?: AbortSignal) {
  stopped(signal); const db = await open();
  try { stopped(signal); return await new Promise<Row | null>((yes, no) => {
    const tx = db.transaction(storeName, 'readonly'), request = tx.objectStore(storeName).get(key); let result: Row | null = null, reason: unknown;
    const abort = () => { try { tx.abort(); } catch {} }; signal?.addEventListener('abort', abort, { once: true });
    request.onsuccess = () => { try { stopped(signal); result = row(request.result, key); } catch (error) { reason = error; abort(); } };
    tx.oncomplete = () => { signal?.removeEventListener('abort', abort); try { stopped(signal); yes(result); } catch (error) { no(error); } };
    tx.onerror = tx.onabort = () => { signal?.removeEventListener('abort', abort); no(reason ?? (signal?.aborted ? new DOMException('本机读取已停止。', 'AbortError') : new PaperLibraryLocalUnavailable())); };
  }); } finally { db.close(); }
}
async function checkedRaw(owner: PaperLibraryCopyOwner, slot: string, signal?: AbortSignal) {
  const current = await readRaw(paperLibraryLocalKey(owner, slot), signal);
  if (current === null || current.body === null) return { row: current, copy: null };
  let parsed: unknown;
  try { parsed = JSON.parse(current.body); } catch { throw new Error('本机旧稿内容需要核对，原记录没有被覆盖或移除。'); }
  const { copy } = await readPaperLibraryCopy(parsed, owner, signal);
  if (copy.slot !== slot || copy.fingerprint !== current.fingerprint) throw new PaperLibraryLocalConflict();
  return { row: current, copy };
}
export async function loadPaperLibraryLocal(owner: PaperLibraryCopyOwner, slot: string, signal?: AbortSignal) {
  const actual = await checkedRaw(owner, slot, signal); return { copy: actual.copy, revision: actual.row?.revision ?? null, fingerprint: actual.row?.fingerprint ?? null, savedAt: actual.row?.savedAt ?? null };
}
async function replace(key: string, reviewed: Row | null, next: Row, signal?: AbortSignal) {
  stopped(signal); const db = await open();
  try { stopped(signal); await new Promise<void>((yes, no) => {
    const tx = db.transaction(storeName, 'readwrite'), store = tx.objectStore(storeName), request = store.get(key); let reason: unknown;
    const abort = () => { try { tx.abort(); } catch {} }; signal?.addEventListener('abort', abort, { once: true });
    request.onsuccess = () => { try { stopped(signal); if (!same(row(request.result, key), reviewed)) throw new PaperLibraryLocalConflict(); store.put(next); } catch (error) { reason = error; abort(); } };
    tx.oncomplete = () => { signal?.removeEventListener('abort', abort); try { stopped(signal); yes(); } catch (error) { no(error); } };
    tx.onerror = tx.onabort = () => { signal?.removeEventListener('abort', abort); no(reason ?? (signal?.aborted ? new DOMException('本机写入已停止。', 'AbortError') : new PaperLibraryLocalUnavailable())); };
  }); } finally { db.close(); }
  if (!same(await readRaw(key, signal), next)) throw new PaperLibraryLocalConflict();
}
function expected(current: Row | null, value: PaperLibraryLocalVersion) {
  if (value.revision !== null && (!Number.isSafeInteger(value.revision) || value.revision < 1) || (current?.revision ?? null) !== value.revision ||
      (current?.fingerprint ?? null) !== value.fingerprint || current?.revision === Number.MAX_SAFE_INTEGER) throw new PaperLibraryLocalConflict();
}
export async function savePaperLibraryLocal(copyValue: PaperLibraryCompleteCopy, owner: PaperLibraryCopyOwner, slot: string, version: PaperLibraryLocalVersion, signal?: AbortSignal) {
  const { copy } = await readPaperLibraryCopy(copyValue, owner, signal); if (copy.slot !== slot) throw new PaperLibraryLocalConflict();
  const key = paperLibraryLocalKey(owner, slot), reviewed = (await checkedRaw(owner, slot, signal)).row; expected(reviewed, version);
  const next: Row = { key, revision: (reviewed?.revision ?? 0) + 1, fingerprint: copy.fingerprint, body: JSON.stringify(copy), savedAt: new Date().toISOString() };
  await replace(key, reviewed, next, signal); return { revision: next.revision, fingerprint: next.fingerprint!, savedAt: next.savedAt };
}
/** A tombstone has a real revision. A stale null or pre-clear version may
 * never resurrect this slot; a new draft must explicitly read that revision. */
export async function clearPaperLibraryLocal(owner: PaperLibraryCopyOwner, slot: string, version: PaperLibraryLocalVersion, signal?: AbortSignal) {
  const key = paperLibraryLocalKey(owner, slot), reviewed = (await checkedRaw(owner, slot, signal)).row; expected(reviewed, version);
  if (!reviewed?.body) throw new PaperLibraryLocalConflict();
  const next: Row = { key, revision: reviewed.revision + 1, fingerprint: null, body: null, savedAt: new Date().toISOString() };
  await replace(key, reviewed, next, signal); return { revision: next.revision, fingerprint: null, savedAt: next.savedAt };
}

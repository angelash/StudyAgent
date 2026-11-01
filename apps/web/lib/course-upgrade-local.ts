import type { CourseUpgradeCopy, CourseUpgradeOwner } from './course-upgrade-copy';
import { courseUpgradeOwnerSchema, courseUpgradeCopyByteLimit, readCourseUpgradeCopy } from './course-upgrade-copy';

type Row = { key: string; revision: number; fingerprint: string | null; body: string | null; savedAt: string };
export type CourseUpgradeLocalVersion = { revision: number | null; fingerprint: string | null };
export class CourseUpgradeLocalConflict extends Error { constructor() { super('另一标签或本机记录已变化。当前完整升级稿仍保留，请下载副本并核对两个版本。'); this.name = 'CourseUpgradeLocalConflict'; } }
export class CourseUpgradeLocalUnavailable extends Error { constructor() { super('本机暂时不能完整保留课程稿，请下载当前完整副本后再关闭。'); this.name = 'CourseUpgradeLocalUnavailable'; } }
const databaseName = 'studyagent-course-upgrade-v1', storeName = 'drafts';
const stopped = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('本机课程升级稿操作已停止。', 'AbortError'); };
export function courseUpgradeLocalKey(owner: CourseUpgradeOwner, slot: string) {
  const actual = courseUpgradeOwnerSchema.parse(owner); if (!slot || slot.length > 180) throw new CourseUpgradeLocalConflict();
  return JSON.stringify(['course-upgrade-local-v1', actual.actorId, actual.role, actual.studentId, actual.subject, actual.courseId, slot]);
}
function parseRow(value: unknown, key: string): Row | null {
  if (value === undefined) return null; const row = value as Row;
  if (!row || typeof row !== 'object' || Object.keys(row).sort().join(',') !== 'body,fingerprint,key,revision,savedAt' || row.key !== key ||
      !Number.isSafeInteger(row.revision) || row.revision < 1 || typeof row.savedAt !== 'string' || !Number.isFinite(Date.parse(row.savedAt)) ||
      (row.body === null ? row.fingerprint !== null : typeof row.body !== 'string' || new TextEncoder().encode(row.body).length > courseUpgradeCopyByteLimit || typeof row.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(row.fingerprint)))
    throw Error('本机旧课程升级稿的格式需要核对，原记录没有被覆盖或移除。');
  return row;
}
const sameRow = (a: Row | null, b: Row | null) => a === null || b === null ? a === b : a.key === b.key && a.revision === b.revision && a.fingerprint === b.fingerprint && a.body === b.body && a.savedAt === b.savedAt;
function open(): Promise<IDBDatabase> {
  return new Promise((yes, no) => {
    let request: IDBOpenDBRequest, rejected = false;
    try { if (!globalThis.indexedDB) throw Error(); request = indexedDB.open(databaseName, 1); } catch { no(new CourseUpgradeLocalUnavailable()); return; }
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: 'key' }); };
    request.onerror = request.onblocked = () => { rejected = true; no(new CourseUpgradeLocalUnavailable()); };
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
    tx.onerror = tx.onabort = () => { signal?.removeEventListener('abort', abort); no(reason ?? (signal?.aborted ? new DOMException('本机读取已停止。', 'AbortError') : new CourseUpgradeLocalUnavailable())); };
  }); } finally { db.close(); }
}
async function checked(owner: CourseUpgradeOwner, slot: string, signal?: AbortSignal) {
  const row = await readRaw(courseUpgradeLocalKey(owner, slot), signal);
  if (!row || row.body === null) return { row, copy: null };
  let value: unknown; try { value = JSON.parse(row.body); } catch { throw Error('本机旧课程升级稿内容需要核对，原记录没有被覆盖或移除。'); }
  const { copy } = await readCourseUpgradeCopy(value, owner, signal);
  if (copy.slot !== slot || copy.fingerprint !== row.fingerprint) throw new CourseUpgradeLocalConflict();
  return { row, copy };
}
export async function loadCourseUpgradeLocal(owner: CourseUpgradeOwner, slot: string, signal?: AbortSignal) {
  const actual = await checked(owner, slot, signal); return { copy: actual.copy, revision: actual.row?.revision ?? null, fingerprint: actual.row?.fingerprint ?? null, savedAt: actual.row?.savedAt ?? null };
}
async function replace(key: string, reviewed: Row | null, next: Row, signal?: AbortSignal) {
  stopped(signal); const db = await open();
  try { stopped(signal); await new Promise<void>((yes, no) => {
    const tx = db.transaction(storeName, 'readwrite'), store = tx.objectStore(storeName), request = store.get(key); let reason: unknown;
    const abort = () => { try { tx.abort(); } catch {} }; signal?.addEventListener('abort', abort, { once: true });
    request.onsuccess = () => { try { stopped(signal); if (!sameRow(parseRow(request.result, key), reviewed)) throw new CourseUpgradeLocalConflict(); store.put(next); } catch (error) { reason = error; abort(); } };
    tx.oncomplete = () => { signal?.removeEventListener('abort', abort); try { stopped(signal); yes(); } catch (error) { no(error); } };
    tx.onerror = tx.onabort = () => { signal?.removeEventListener('abort', abort); no(reason ?? (signal?.aborted ? new DOMException('本机写入已停止。', 'AbortError') : new CourseUpgradeLocalUnavailable())); };
  }); } finally { db.close(); }
  if (!sameRow(await readRaw(key, signal), next)) throw new CourseUpgradeLocalConflict();
}
function expected(row: Row | null, value: CourseUpgradeLocalVersion) {
  if (value.revision !== null && (!Number.isSafeInteger(value.revision) || value.revision < 1) || (row?.revision ?? null) !== value.revision ||
      (row?.fingerprint ?? null) !== value.fingerprint || row?.revision === Number.MAX_SAFE_INTEGER) throw new CourseUpgradeLocalConflict();
}
export async function saveCourseUpgradeLocal(value: CourseUpgradeCopy, owner: CourseUpgradeOwner, slot: string, version: CourseUpgradeLocalVersion, signal?: AbortSignal) {
  const { copy } = await readCourseUpgradeCopy(value, owner, signal); if (copy.slot !== slot) throw new CourseUpgradeLocalConflict();
  if (new TextEncoder().encode(JSON.stringify(copy)).length > courseUpgradeCopyByteLimit) throw new CourseUpgradeLocalUnavailable();
  const key = courseUpgradeLocalKey(owner, slot), reviewed = (await checked(owner, slot, signal)).row; expected(reviewed, version);
  const next: Row = { key, revision: (reviewed?.revision ?? 0) + 1, fingerprint: copy.fingerprint, body: JSON.stringify(copy), savedAt: new Date().toISOString() };
  await replace(key, reviewed, next, signal); return { revision: next.revision, fingerprint: next.fingerprint!, savedAt: next.savedAt };
}
/** Clearing is a versioned tombstone. A stale tab cannot recreate this draft. */
export async function clearCourseUpgradeLocal(owner: CourseUpgradeOwner, slot: string, version: CourseUpgradeLocalVersion, signal?: AbortSignal) {
  const key = courseUpgradeLocalKey(owner, slot), reviewed = (await checked(owner, slot, signal)).row; expected(reviewed, version);
  if (!reviewed?.body) throw new CourseUpgradeLocalConflict();
  const next: Row = { key, revision: reviewed.revision + 1, fingerprint: null, body: null, savedAt: new Date().toISOString() };
  await replace(key, reviewed, next, signal); return { revision: next.revision, fingerprint: null, savedAt: next.savedAt };
}

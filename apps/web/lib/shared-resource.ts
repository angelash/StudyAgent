'use client';
import { apiRequest, onApiChange } from './api';

// One in-flight read per path, reused for a short window so components mounted
// together do not each fetch the same list. Never a long-lived cache: any write
// through apiRequest, any sign-in change and every identity re-check drops it.
type Entry = { at: number; settled: boolean; pending: Promise<unknown> };
const entries = new Map<string, Entry>();
export const SHARED_RESOURCE_MAX_AGE_MS = 5000;

export function resetSharedResources() { entries.clear(); }
onApiChange(resetSharedResources);

function aborted() { return new DOMException('The operation was aborted.', 'AbortError'); }

export function sharedRequest<T>(path: string, options: { signal?: AbortSignal; maxAgeMs?: number } = {}): Promise<T> {
  const { signal, maxAgeMs = SHARED_RESOURCE_MAX_AGE_MS } = options;
  if (signal?.aborted) return Promise.reject(aborted());
  let entry = entries.get(path);
  if (!entry || (entry.settled && Date.now() - entry.at >= maxAgeMs)) {
    const created: Entry = { at: Date.now(), settled: false, pending: Promise.resolve() };
    // The shared read is not tied to one consumer's signal: another consumer may still be waiting.
    created.pending = apiRequest<unknown>(path).then(
      value => { created.settled = true; created.at = Date.now(); return value; },
      error => { if (entries.get(path) === created) entries.delete(path); throw error; },
    );
    entries.set(path, created);
    entry = created;
  }
  // Each consumer gets its own copy, so one page mutating its rows cannot change another's.
  const result = entry.pending.then(value => structuredClone(value) as T);
  if (!signal) return result;
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(aborted());
    signal.addEventListener('abort', stop, { once: true });
    result.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}

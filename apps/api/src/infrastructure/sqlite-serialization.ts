import { resolve } from 'node:path';

const queues = new Map<string, Promise<void>>();
export function sqliteQueueKey(location: string) {
  if (location === ':memory:') return undefined;
  const key = resolve(location); return process.platform === 'win32' ? key.toLowerCase() : key;
}

/** Async SQLite transactions on two same-process connections must not block each other's microtasks. */
export function serializeSqlite<T>(key: string, work: () => Promise<T>): Promise<T> {
  const pending = (queues.get(key) ?? Promise.resolve()).then(work, work);
  const settled = pending.then(() => {}, () => {});
  queues.set(key, settled);
  void settled.then(() => { if (queues.get(key) === settled) queues.delete(key); });
  return pending;
}

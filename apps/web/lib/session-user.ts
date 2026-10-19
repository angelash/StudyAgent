'use client';
import { useSyncExternalStore } from 'react';
import { apiRequest } from './api';
export type SessionUser = { id: string; role: string; displayName: string; principal: string; studentId?: string };
let current: SessionUser | null | undefined;
let pending: Promise<void> | undefined;
let generation = 0;
const listeners = new Set<() => void>();
export function refreshSessionUser() {
  const revision = ++generation;
  pending = apiRequest<SessionUser>('/auth/me').then(user => { if (revision === generation) current = user; }).catch(() => { if (revision === generation) current = null; })
    .finally(() => { if (revision === generation) { pending = undefined; for (const listener of listeners) listener(); } });
  return pending;
}
function subscribe(listener: () => void) {
  listeners.add(listener); if (current === undefined && !pending) void refreshSessionUser();
  return () => { listeners.delete(listener); };
}
export function useSessionUser() { return useSyncExternalStore(subscribe, () => current, () => undefined); }

'use client';
import { useSyncExternalStore } from 'react';
import { ApiRequestError, apiRequest } from './api';
export type SessionUser = { id: string; role: string; displayName: string; principal: string; studentId?: string };
type SessionSnapshot = {
  status: 'initial' | 'checking' | 'authenticated' | 'anonymous' | 'unavailable';
  user: SessionUser | null | undefined;
};
const initial: SessionSnapshot = { status: 'initial', user: undefined };
let snapshot = initial;
let pending: Promise<void> | undefined;
let controller: AbortController | undefined;
let generation = 0;
const listeners = new Set<() => void>();
function notify() { for (const listener of listeners) listener(); }
export function refreshSessionUser() {
  const revision = ++generation;
  controller?.abort();
  const request = new AbortController();
  controller = request;
  // Re-confirmation unloads private workspaces. Never restore cached identity.
  snapshot = { status: 'checking', user: undefined };
  pending = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const user = await apiRequest<SessionUser>('/auth/me', { signal: request.signal });
        if (!user || !['id', 'role', 'displayName', 'principal'].every(key => typeof user[key as keyof SessionUser] === 'string')) throw new Error('Invalid identity response');
        if (revision === generation) snapshot = { status: 'authenticated', user };
        return;
      } catch (error) {
        if (revision !== generation || request.signal.aborted) return;
        if (error instanceof ApiRequestError && [401, 403].includes(error.status)) {
          snapshot = { status: 'anonymous', user: null };
          return;
        }
        if (attempt === 0) await new Promise<void>(resolve => setTimeout(resolve, 200));
        else snapshot = { status: 'unavailable', user: undefined };
        if (revision !== generation || request.signal.aborted) return;
      }
    }
  })().finally(() => {
    if (revision === generation) { pending = undefined; controller = undefined; notify(); }
  });
  notify();
  return pending;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  // Mounting a consumer must not restart an exhausted connection retry loop.
  if (snapshot.status === 'initial' && !pending) void refreshSessionUser();
  return () => { listeners.delete(listener); };
}
export function useSessionUser() { return useSyncExternalStore(subscribe, () => snapshot.user, () => undefined); }
export function useSessionStatus() { return useSyncExternalStore(subscribe, () => snapshot, () => initial); }

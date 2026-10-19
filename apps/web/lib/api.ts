'use client';

import { loadWebEnv } from '@study-agent/config';

const webEnv = loadWebEnv({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
});

export const apiBaseUrl = webEnv.NEXT_PUBLIC_API_BASE_URL;
let sessionToken: string | null = null;

export function getAuthToken() {
  if (typeof window === 'undefined') {
    return null;
  }
  return sessionToken;
}

export function setAuthToken(token: string) {
  if (typeof window === 'undefined') {
    return;
  }
  sessionToken = token;
  window.localStorage.removeItem('study_agent_token');
}

export function setCurrentUser(user: unknown) {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.setItem('study_agent_user', JSON.stringify(user));
  window.localStorage.removeItem('study_agent_user');
}

export function getCurrentUser<T>() {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.sessionStorage.getItem('study_agent_user');
  try { return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  }).catch((error: Error) => {
    if (error.name === 'AbortError') throw error;
    throw new Error('暂时无法连接学习服务，请检查网络后重试。已保存的数据会保留。');
  });

  let payload:
    | {
        data: T;
        error: { code: string; message: string } | null;
      }
    | null = null;

  try {
    payload = (await response.json()) as {
      data: T;
      error: { code: string; message: string } | null;
    };
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.error) {
    throw new Error(payload?.error?.message ?? `Request failed: ${response.status}`);
  }

  if (!payload) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return payload.data;
}

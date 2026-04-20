'use client';

import { loadWebEnv } from '@study-agent/config';

const webEnv = loadWebEnv({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
});

export const apiBaseUrl = webEnv.NEXT_PUBLIC_API_BASE_URL;

export function getAuthToken() {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem('study_agent_token');
}

export function setAuthToken(token: string) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem('study_agent_token', token);
}

export function setCurrentUser(user: unknown) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem('study_agent_user', JSON.stringify(user));
}

export function getCurrentUser<T>() {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.localStorage.getItem('study_agent_user');
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  const payload = (await response.json()) as {
    data: T;
    error: { code: string; message: string } | null;
  };

  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? `Request failed: ${response.status}`);
  }

  return payload.data;
}


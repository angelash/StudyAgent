'use client';
import * as React from 'react';
import { apiRequest, ApiRequestError } from './api';
import { refreshSessionUser } from './session-user';

export function paperPracticeFailure(error: unknown) { return error instanceof Error && error.name === 'AbortError' ? '等待超时或读取已中止，请重新读取原结果。' : error instanceof Error ? error.message : '暂时未能完成，请保留输入后重试。'; }
export function usePaperPracticeApi() {
  const alive = React.useRef(true), requests = React.useRef(new Set<AbortController>());
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; for (const request of requests.current) request.abort(); requests.current.clear(); }; }, []);
  const call = React.useCallback(async <T,>(path: string, body?: unknown, signal?: AbortSignal) => {
    const controller = new AbortController(); requests.current.add(controller); const timer = setTimeout(() => controller.abort(), 15000);
    const cancel = () => controller.abort(); if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', cancel, { once: true });
    try { return await apiRequest<T>(path, { signal: controller.signal, ...(body !== undefined ? { method: 'POST', body: JSON.stringify(body) } : {}) }); }
    catch (error) { if (alive.current && error instanceof ApiRequestError && error.status === 401) void refreshSessionUser(); throw error; }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); requests.current.delete(controller); }
  }, []);
  return { call, alive };
}

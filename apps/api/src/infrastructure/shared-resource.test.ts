import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '../../../web/lib/api';
import { loadLearners } from '../../../web/lib/learners';
import { resetSharedResources, sharedRequest } from '../../../web/lib/shared-resource';

const rows = [{ id: 'learner-a', nickname: '甲', grade: 3 }];
function reply(data: unknown, status = 200) {
  const body = status < 400 ? { data, error: null } : { data: null, error: { code: 'FAILED', message: 'failed' } };
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
function stubFetch(answer: (url: string, call: number) => Response | Promise<Response>) {
  let call = 0;
  const fetcher = vi.fn(async (input: unknown, _init?: RequestInit) => answer(String(input), call++));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

describe('shared read cache for workspace lists', () => {
  beforeEach(() => resetSharedResources());
  afterEach(() => { vi.unstubAllGlobals(); resetSharedResources(); });

  it('sends one request for consumers mounted together and gives each its own copy', async () => {
    const fetcher = stubFetch(() => reply(rows));
    const [first, second] = await Promise.all([loadLearners(), loadLearners()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toMatch(/\/api\/learning\/students$/);
    expect(first).toEqual(rows);
    expect(second).toEqual(rows);
    expect(first).not.toBe(second);
    first[0].nickname = 'changed by one page';
    expect(second[0].nickname).toBe('甲');
    expect((await loadLearners())[0].nickname).toBe('甲');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reuses a settled read only inside its short window', async () => {
    const fetcher = stubFetch(() => reply(rows));
    await sharedRequest('/learning/students');
    await sharedRequest('/learning/students');
    expect(fetcher).toHaveBeenCalledTimes(1);
    await sharedRequest('/learning/students', { maxAgeMs: 0 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps reads after another read but drops them after any write, including a failed one', async () => {
    const fetcher = stubFetch((_url, call) => { if (call === 4) throw new TypeError('network down'); return reply(rows); });
    await loadLearners();
    await apiRequest('/auth/me');
    await loadLearners();
    expect(fetcher).toHaveBeenCalledTimes(2);
    await apiRequest('/learning/students', { method: 'POST', body: '{}' });
    await loadLearners();
    expect(fetcher).toHaveBeenCalledTimes(4);
    await expect(apiRequest('/learning/students', { method: 'POST', body: '{}' })).rejects.toThrow('暂时无法连接学习服务');
    await loadLearners();
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it('does not keep a failed read', async () => {
    const fetcher = stubFetch((_url, call) => call === 0 ? reply(null, 500) : reply(rows));
    await expect(loadLearners()).rejects.toMatchObject({ status: 500 });
    await expect(loadLearners()).resolves.toEqual(rows);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('lets one consumer leave without cancelling the read for the others', async () => {
    let release = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    const fetcher = stubFetch(async () => { await gate; return reply(rows); });
    const controller = new AbortController();
    const leaving = loadLearners(controller.signal).then(() => 'resolved', error => (error as Error).name);
    const staying = loadLearners();
    controller.abort();
    expect(await leaving).toBe('AbortError');
    release();
    await expect(staying).resolves.toEqual(rows);
    expect(fetcher).toHaveBeenCalledTimes(1);
    resetSharedResources();
    const late = await loadLearners(controller.signal).then(() => 'resolved', error => (error as Error).name);
    expect(late).toBe('AbortError');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('drops reads whenever the signed-in identity is checked again', async () => {
    const fetcher = stubFetch(url => url.endsWith('/auth/me') ? reply({ id: 'user-a', role: 'parent', displayName: 'A', principal: 'a' }) : reply(rows));
    const { refreshSessionUser } = await import('../../../web/lib/session-user');
    await loadLearners();
    await refreshSessionUser();
    await loadLearners();
    expect(fetcher.mock.calls.map(call => String(call[0]).replace(/^.*\/api/, ''))).toEqual(['/learning/students', '/auth/me', '/learning/students']);
  });
});

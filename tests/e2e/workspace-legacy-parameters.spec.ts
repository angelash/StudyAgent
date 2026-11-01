import { expect, test, type Page } from '@playwright/test';
import { syntheticFamilyHeaders } from './synthetic-family';

const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107') + '/api';

async function call(path: string, body: unknown, headers: Record<string, string>, token?: string) {
  const response = await fetch(api + path, { method: 'POST', headers: { ...headers, ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  const value = await response.json(); expect(response.ok, path + ':' + JSON.stringify(value.error)).toBe(true); return value.data;
}

/** One parent with two children; the first child is what an old link silently fell back to. */
async function prepare(page: Page) {
  const headers = await syntheticFamilyHeaders(page), nonce = crypto.randomUUID(), principal = 'legacy-params-' + nonce + '@local.test', credential = 'Legacy-Params-' + nonce;
  const parent = await call('/auth/register', { principal, credential }, headers);
  const child = async (nickname: string) => (await call('/students', { nickname, grade: 5, preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }, headers, parent.token)).profile.id as string;
  const first = await child('旧参数合成甲'), second = await child('旧参数合成乙');
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →', exact: true }).click(); await expect(page).not.toHaveURL(/\/parent\/login/);
  return { first, second };
}

/** Opens an address and records every API read and refusal, so the assertions rest on what the page actually requested. */
async function visit(page: Page, href: string, action: () => Promise<unknown> = () => page.goto(href)) {
  const requests: string[] = [], refused: string[] = [], writes: string[] = [], errors: string[] = [];
  const onRequest = (request: any) => { const url = new URL(request.url()); if (!url.pathname.startsWith('/api/')) return; if (request.method() === 'GET') requests.push(url.pathname + url.search); else if (!url.pathname.startsWith('/api/auth/')) writes.push(request.method() + ' ' + url.pathname); };
  const onResponse = (response: any) => { const url = new URL(response.url()); if (url.pathname.startsWith('/api/') && url.pathname !== '/api/auth/me' && response.status() >= 400) refused.push(response.status() + ' ' + url.pathname); };
  const onError = (error: Error) => errors.push(error.message);
  page.on('request', onRequest); page.on('response', onResponse); page.on('pageerror', onError);
  try { await action(); await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined); }
  finally { page.off('request', onRequest); page.off('response', onResponse); page.off('pageerror', onError); }
  expect(errors, href + ' page errors').toEqual([]); expect(writes, href + ' reading writes nothing').toEqual([]);
  return { requests, refused, url: new URL(page.url()) };
}
const mentions = (requests: string[], id: string) => requests.filter(item => item.includes(encodeURIComponent(id)) || item.includes(id));

test('legacy parameters: the old mission link opens the requested child and refuses ambiguous learners', async ({ page }) => {
  const { first, second } = await prepare(page);
  const opened = await visit(page, '/student/mission?' + new URLSearchParams({ student: second, subject: 'chinese' }));
  expect(opened.url.pathname).toBe('/student/today'); expect(opened.url.searchParams.get('student')).toBe(second);
  expect(opened.requests).toContain('/api/learning/students/' + second + '/today?subject=chinese');
  expect(mentions(opened.requests, first), 'the first child is never read').toEqual([]); expect(opened.refused).toEqual([]);
  for (const [query, message] of [[[['student', first], ['studentId', second]], '链接中的学习档案不一致'], [[['studentId', second], ['studentId', first]], '重复且不一致']] as const) {
    const refused = await visit(page, '/student/mission?' + new URLSearchParams(query as unknown as string[][]));
    expect(refused.url.pathname).toBe('/student/today'); await expect(page.getByText(message, { exact: false }).first()).toBeVisible();
    expect(refused.requests.filter(item => /\/learning\/students\/[^/]+\/today/.test(item)), 'no child task is read for an ambiguous link').toEqual([]);
  }
});

test('legacy parameters: browser history returns from the old mission link to the original workspace child', async ({ page }) => {
  const { first, second } = await prepare(page);
  const studio = '/studio?' + new URLSearchParams({ view: 'courses', student: first, subject: 'math' });
  const original = await visit(page, studio);
  const opened = await visit(page, '/student/mission?' + new URLSearchParams({ studentId: second, subject: 'math' }));
  expect(opened.url.pathname).toBe('/student/today'); expect(opened.url.searchParams.get('studentId')).toBe(second); expect(opened.url.searchParams.get('subject')).toBe('math');
  const back = await visit(page, studio, () => page.goBack());
  expect(back.url.pathname + back.url.search).toBe(original.url.pathname + original.url.search); expect(mentions(back.requests, second), 'returning reads only the original child').toEqual([]);
  const forward = await visit(page, '', () => page.goForward());
  expect(forward.url.pathname).toBe('/student/today'); expect(forward.requests).toContain('/api/learning/students/' + second + '/today?subject=math');
  expect(mentions(forward.requests, first)).toEqual([]);
});

test('legacy parameters: the chemistry alias keeps the requested child, reloads without refused reads and rejects conflicts', async ({ page }) => {
  const { first, second } = await prepare(page);
  const opened = await visit(page, '/chemistry?' + new URLSearchParams({ student: second }));
  expect(opened.url.pathname).toBe('/studio'); expect(opened.url.searchParams.get('subject')).toBe('chemistry');
  expect(opened.requests).toContain('/api/chemistry/catalog?studentId=' + second); expect(mentions(opened.requests, first)).toEqual([]);
  await expect(page.locator('.cl-unit-heading')).toBeVisible(); expect(opened.url.searchParams.get('course')).toMatch(/^chemistry-course:/);
  expect(opened.refused).toEqual([]);
  const reloaded = await visit(page, '', () => page.reload());
  expect(reloaded.url.search).toBe(opened.url.search); expect(reloaded.refused, 'the real chemistry course id is not sent as an ordinary course').toEqual([]);
  await expect(page.locator('.cl-unit-heading')).toBeVisible();
  for (const [query, message] of [[[['student', first], ['studentId', second]], '链接中的学习档案不一致'], [[['studentId', second], ['subject', 'math']], '重复且不一致']] as const) {
    const refused = await visit(page, '/chemistry?' + new URLSearchParams(query as unknown as string[][]));
    expect(refused.url.pathname).toBe('/studio'); await expect(page.getByText(message, { exact: false }).first()).toBeVisible();
    expect(refused.requests.filter(item => item.startsWith('/api/learning/studio/overview') || item.startsWith('/api/chemistry/catalog')), 'no course scope is read for an ambiguous link').toEqual([]);
  }
});

test('legacy parameters: shared old home, report and knowledge adapters reject every conflicting learner alias', async ({ page }) => {
  const { first, second } = await prepare(page);
  for (const [href, path] of [
    ['/learn?' + new URLSearchParams([['student', first], ['studentId', second]]), '/studio'],
    ['/parent/dashboard?' + new URLSearchParams([['student', first], ['studentId', second], ['subject', 'math']]), '/studio/reports'],
    ['/student/knowledge?' + new URLSearchParams([['studentId', first], ['studentId', second]]), '/studio/reports'],
  ] as const) {
    const refused = await visit(page, href);
    expect(refused.url.pathname).toBe(path); await expect(page.getByText(/学习档案不一致|重复且不一致/).first()).toBeVisible();
    expect([...mentions(refused.requests, first), ...mentions(refused.requests, second)].filter(item => !item.startsWith('/api/learning/students?')), href + ' reads no child scope').toEqual([]);
  }
});

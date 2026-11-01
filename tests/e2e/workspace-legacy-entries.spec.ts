import { expect, test, type Page } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import { syntheticFamilyHeaders } from './synthetic-family';

const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107') + '/api';
const output = process.env.LEGACY_MATRIX_OUTPUT;
type Role = 'anonymous' | 'parent' | 'student' | 'adult' | 'teacher' | 'admin';
type Actor = { role: Role; principal?: string; credential?: string; issue?: () => Promise<string> };
type Context = { childId: string };

const entries: Array<[string, (context: Context) => string]> = [
  ['E01', () => '/'],
  ['E02', c => '/learn?' + new URLSearchParams({ studentId: c.childId, subject: 'math' })],
  ['E03', c => '/studio?' + new URLSearchParams({ view: 'courses', student: c.childId, subject: 'math' })],
  ['E04', c => '/parent/dashboard?' + new URLSearchParams({ studentId: c.childId, subject: 'math' })],
  ['E05', c => '/student/assessment?' + new URLSearchParams({ studentId: c.childId, subject: 'math' })],
  ['E06', c => '/student/today?' + new URLSearchParams({ studentId: c.childId, subject: 'math' })],
  ['E07', c => '/student/mission?' + new URLSearchParams({ studentId: c.childId, subject: 'math' })],
  ['E08', c => '/student/knowledge?' + new URLSearchParams({ studentId: c.childId, subject: 'math' })],
  ['E09', c => '/parent/access?' + new URLSearchParams({ studentId: c.childId })],
  ['E10', () => '/parent/data'],
  ['E11', c => '/parent/gesp?' + new URLSearchParams({ studentId: c.childId })],
  ['E12', c => '/student/gesp?' + new URLSearchParams({ studentId: c.childId })],
  ['E13', () => '/library'],
  ['E14', () => '/library/practice'],
  ['E15', () => '/library/practice/review'],
  ['E16', () => '/studio/source-courses'],
  ['E17', () => '/studio/classroom'],
  ['E18', () => '/studio/projects'],
  ['E19', () => '/studio/whiteboards'],
  ['E20', () => '/chemistry'],
  ['E21', () => '/parent/login'],
  ['E22', () => '/student/login'],
  ...['curriculum', 'content', 'imports', 'reviews', 'measurement', 'analytics', 'gesp', 'ai-tools', 'accounts']
    .map((id, index): [string, (context: Context) => string] => ['E' + (23 + index), () => '/admin/' + id]),
];

async function call(path: string, body?: unknown, token?: string, method = body === undefined ? 'GET' : 'POST', headers: Record<string, string> = { 'content-type': 'application/json' }) {
  const response = await fetch(api + path, { method, headers: { ...headers, ...(token ? { authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json(); expect(response.ok, path + ':' + JSON.stringify(value.error)).toBe(true); return value.data;
}

async function prepare(page: Page) {
  const headers = await syntheticFamilyHeaders(page), nonce = crypto.randomUUID();
  const make = async (name: string) => { const principal = name + '-' + nonce + '@local.test', credential = 'Legacy-QA-' + nonce;
    const actor = await call('/auth/register', { principal, credential }, undefined, 'POST', headers); return { principal, credential, actor }; };
  const parent = await make('legacy-parent'), adult = await make('legacy-adult'), teacher = await make('legacy-teacher');
  const child = (await call('/students', { nickname: '旧入口合成档案', grade: 5, preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }, parent.actor.token, 'POST', headers)).profile;
  const access = await call('/students/' + child.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: crypto.randomUUID(), reason: '合成旧入口本人身份核查' }, parent.actor.token, 'POST', headers);
  const admin = await call('/auth/login', { principal: 'browser-admin', credential: 'Browser-admin-only-20261021' }, undefined, 'POST', headers);
  const account = (await call('/admin/accounts?search=' + encodeURIComponent(teacher.principal), undefined, admin.token, 'GET', headers)).rows.find((row: any) => row.id === teacher.actor.user.id);
  await call('/admin/accounts/' + account.id, { role: 'teacher', status: 'active', expectedVersion: account.version, reason: '合成旧入口教师身份核查', adminCredential: 'Browser-admin-only-20261021' }, admin.token, 'PATCH', headers);
  // A newly issued learning code replaces the previous one, so each sign-in receives its own fresh code.
  const issue = async () => (await call('/students/' + child.id + '/learning-access/codes', { expectedVersion: access.version, requestKey: crypto.randomUUID() }, parent.actor.token, 'POST', headers)).code as string;
  return { headers, context: { childId: child.id }, parent, adult, teacher, issue };
}

async function signIn(page: Page, actor: Actor) {
  if (actor.role === 'anonymous') return;
  if (actor.role === 'student') { await page.goto('/student/login'); await page.getByLabel('一次性学习码', { exact: true }).fill(await actor.issue!()); await page.getByRole('button', { name: '进入我的学习 →', exact: true }).click(); await expect(page).toHaveURL(/\/studio(?:\?|$)/); return; }
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(actor.principal!); await page.getByLabel('密码').fill(actor.credential!);
  await page.getByRole('button', { name: '登录，查看学习记录 →', exact: true }).click(); await expect(page).not.toHaveURL(/\/parent\/login/);
}

async function observe(page: Page, role: Role, id: string, href: string, width: number) {
  const errors: string[] = [], writes: string[] = [], refused: string[] = [];
  const onResponse = (response: any) => { const url = new URL(response.url()); if (url.pathname.startsWith('/api/') && response.status() >= 400 && url.pathname !== '/api/auth/me') refused.push(response.status() + ' ' + response.request().method() + ' ' + url.pathname); };
  const onError = (error: Error) => errors.push(error.message);
  const onRequest = (request: any) => { const url = new URL(request.url()); if (url.pathname.startsWith('/api/') && request.method() !== 'GET' && !url.pathname.startsWith('/api/auth/')) writes.push(request.method() + ' ' + url.pathname); };
  page.on('pageerror', onError); page.on('request', onRequest); page.on('response', onResponse);
  try {
    await page.setViewportSize({ width, height: width < 500 ? 740 : 960 });
    await page.goto(href); await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
    const state = await page.evaluate(() => ({ path: location.pathname, search: location.search, title: document.title,
      headings: [...document.querySelectorAll('h1')].map(item => (item.textContent ?? '').trim()).filter(Boolean).slice(0, 3),
      navigationHosts: document.querySelectorAll('[aria-label="学习工作台导航"]').length, mains: document.querySelectorAll('main').length,
      alerts: [...document.querySelectorAll('[role=alert]')].map(item => (item.textContent ?? '').trim()).filter(Boolean).slice(0, 2),
      overflow: document.documentElement.scrollWidth - innerWidth }));
    await page.reload(); await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
    const reloaded = await page.evaluate(() => location.pathname + location.search);
    const row = { id, role, href, width, ...state, reloadKeepsLocation: reloaded === state.path + state.search, writes, errors, refused };
    if (output) appendFileSync(output, JSON.stringify(row) + '\n');
    expect(errors, id + ' ' + role + ' page errors').toEqual([]);
    expect(state.overflow, id + ' ' + role + ' horizontal overflow at ' + width).toBeLessThanOrEqual(1);
    expect(state.navigationHosts, id + ' ' + role + ' single workspace navigation').toBeLessThanOrEqual(1);
    expect(state.mains, id + ' ' + role + ' single main').toBeLessThanOrEqual(1);
    expect(row.reloadKeepsLocation, id + ' ' + role + ' reload keeps the actual location').toBe(true);
    const foreignChild = ['adult', 'teacher'].includes(role) && ['E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E11'].includes(id);
    const unexpected = refused.filter(item => !(role === 'anonymous' && item.startsWith('401 ')) && !(foreignChild && item.startsWith('403 ')));
    expect(unexpected, id + ' ' + role + ' refused reads').toEqual([]);
    return row;
  } finally { page.off('pageerror', onError); page.off('request', onRequest); page.off('response', onResponse); }
}

test('legacy entries: every old address is observed for each identity at phone and desktop widths', async ({ browser, page }) => {
  test.setTimeout(1_800_000);
  const prepared = await prepare(page);
  const actors: Actor[] = [{ role: 'anonymous' }, { role: 'parent', ...prepared.parent }, { role: 'student', issue: prepared.issue },
    { role: 'adult', ...prepared.adult }, { role: 'teacher', ...prepared.teacher }, { role: 'admin', principal: 'browser-admin', credential: 'Browser-admin-only-20261021' }];
  const failures: string[] = [];
  for (const actor of actors) {
    const context = await browser.newContext(), tab = await context.newPage();
    await tab.setExtraHTTPHeaders({ 'x-forwarded-for': prepared.headers['x-forwarded-for'] });
    try { await signIn(tab, actor);
      for (const [id, href] of entries) for (const width of ['parent', 'student', 'admin'].includes(actor.role) ? [320, 1440] : [1440]) {
        try { await observe(tab, actor.role, id, href(prepared.context), width); } catch (error) { failures.push((error as Error).message.split('\n')[0]); }
        if (actor.role !== 'anonymous' && /\/(parent|student)\/login/.test(new URL(tab.url()).pathname) && !['E21', 'E22'].includes(id)) await signIn(tab, actor);
      }
    } finally { await context.close(); }
  }
  expect(failures).toEqual([]);
});

test('legacy entries: browser history returns through the parent sequence without re-entering another identity', async ({ page }) => {
  test.setTimeout(300_000);
  const prepared = await prepare(page); await signIn(page, { role: 'parent', ...prepared.parent });
  const visited: string[] = [];
  for (const [, href] of entries.filter(([id]) => ['E02', 'E03', 'E04', 'E06', 'E08', 'E09', 'E13', 'E16', 'E19'].includes(id))) {
    await page.goto(href(prepared.context)); await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined); visited.push(new URL(page.url()).pathname + new URL(page.url()).search);
  }
  for (let index = visited.length - 2; index >= 0; index--) { await page.goBack(); await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined); expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(visited[index]); }
  for (let index = 1; index < visited.length; index++) { await page.goForward(); await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined); expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(visited[index]); }
});

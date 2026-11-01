import { expect, test, type Browser, type Page } from '@playwright/test';
import { syntheticFamilyHeaders } from './synthetic-family';

const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107') + '/api';
const admin = { principal: 'browser-admin', credential: 'Browser-admin-only-20261021' };

async function call(path: string, body: unknown, headers: Record<string, string>, token?: string, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(api + path, { method, headers: { ...headers, ...(token ? { authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json(); expect(response.ok, path + ':' + JSON.stringify(value.error)).toBe(true); return value.data;
}
async function account(name: string, headers: Record<string, string>) {
  const nonce = crypto.randomUUID(), principal = name + '-' + nonce + '@local.test', credential = 'Family-Pages-' + nonce;
  return { principal, credential, actor: await call('/auth/register', { principal, credential }, headers) };
}
async function signIn(page: Page, user: { principal: string; credential: string }) {
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(user.principal); await page.getByLabel('密码').fill(user.credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →', exact: true }).click(); await expect(page).not.toHaveURL(/\/parent\/login/);
}
async function family(page: Page) {
  const headers = await syntheticFamilyHeaders(page), parent = await account('family-pages-parent', headers);
  const child = async (nickname: string) => (await call('/students', { nickname, grade: 5, preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }, headers, parent.actor.token)).profile.id as string;
  return { headers, parent, first: await child('档案页合成甲'), second: await child('档案页合成乙') };
}
/** Records API reads, writes and page errors while an action runs. */
async function observe(page: Page, action: () => Promise<unknown>) {
  const reads: string[] = [], errors: string[] = [];
  const onRequest = (request: any) => { const url = new URL(request.url()); if (url.pathname.startsWith('/api/') && request.method() === 'GET') reads.push(url.pathname + url.search); };
  const onError = (error: Error) => errors.push(error.message);
  page.on('request', onRequest); page.on('pageerror', onError);
  try { await action(); await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined); } finally { page.off('request', onRequest); page.off('pageerror', onError); }
  expect(errors).toEqual([]); return reads;
}
async function phoneLayout(page: Page, name: string) {
  await test.info().attach(name + '-desktop', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, navigation: document.querySelectorAll('[aria-label="学习工作台导航"]').length, mains: document.querySelectorAll('main').length }));
  expect(state.overflow).toBeLessThanOrEqual(1); expect(state.navigation).toBeLessThanOrEqual(1); expect(state.mains).toBe(1);
  await test.info().attach(name + '-phone', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.setViewportSize({ width: 1440, height: 960 });
}
const reviewerReads = (reads: string[]) => reads.filter(item => /^\/api\/students\/[^/]+\/(reviewers|learning-access)/.test(item));

test('family pages: authorization keeps the requested child and completes learning code, reviewer and guardian invitation journeys', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const { headers, parent, first, second } = await family(page), teacher = await account('family-pages-teacher', headers), guardian = await account('family-pages-guardian', headers);
  const adminToken = (await call('/auth/login', admin, headers)).token;
  const row = (await call('/admin/accounts?search=' + encodeURIComponent(teacher.principal), undefined, headers, adminToken)).rows.find((item: any) => item.id === teacher.actor.user.id);
  await call('/admin/accounts/' + row.id, { role: 'teacher', status: 'active', expectedVersion: row.version, reason: '合成档案页教师身份核查', adminCredential: admin.credential }, headers, adminToken, 'PATCH');
  await signIn(page, parent);
  for (const [query, message] of [[[['student', first], ['studentId', second]], '链接中的学习档案不一致'], [[['studentId', 'student_not-accessible']], '所选学习档案不可访问']] as const) {
    const reads = await observe(page, () => page.goto('/parent/access?' + new URLSearchParams(query as unknown as string[][])));
    await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible(); expect(reviewerReads(reads), 'no child is substituted').toEqual([]);
  }
  const reads = await observe(page, () => page.goto('/parent/access?' + new URLSearchParams({ studentId: second })));
  await expect(page.getByRole('heading', { name: '授权与学习码', level: 1 })).toBeVisible(); await expect(page.getByRole('link', { name: '← 返回学习档案' })).toHaveAttribute('href', '/studio/profiles');
  await expect(page.getByLabel('孩子的档案')).toHaveValue(second); expect(reviewerReads(reads).length).toBeGreaterThan(0); expect(reviewerReads(reads).filter(item => item.includes(first))).toEqual([]);
  await page.getByLabel('开启前，记录准备怎样陪伴').fill('先陪孩子熟悉任务，再每天一起看一次学习记录。'); await page.getByRole('button', { name: '开启孩子独立学习', exact: true }).click();
  await expect(page.getByText('已开启。生成一个学习码', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '生成一次性学习码', exact: true }).click(); await expect(page.getByLabel('孩子一次性学习码')).toHaveValue(/^\S{4}( \S{1,4})+$/);
  await page.getByLabel('已开通教师身份的账号').fill(teacher.principal); await page.getByRole('button', { name: '授予复核权限 →', exact: true }).click();
  await expect(page.getByText('教师复核权限已保存。', { exact: true })).toBeVisible(); await expect(page.locator('.access-assignments article', { hasText: teacher.principal })).toBeVisible();
  await page.locator('.access-assignments article', { hasText: teacher.principal }).getByRole('button', { name: '撤销权限', exact: true }).click();
  await expect(page.getByText('权限已撤销，教师无法再读取或复核这个孩子的作答。', { exact: true })).toBeVisible();
  await phoneLayout(page, 'authorization');
  await page.getByLabel('孩子的档案').selectOption(first); await expect(page).toHaveURL(new RegExp('/parent/access\\?studentId=' + first + '$'));
  await observe(page, () => page.reload()); await expect(page.getByLabel('孩子的档案')).toHaveValue(first);
  await page.getByLabel('接收邀请的登录账号').fill(guardian.principal); await page.getByRole('button', { name: '生成一次性邀请码', exact: true }).click();
  const invitation = await page.getByLabel('一次性监护人邀请码').inputValue(); expect(invitation).toMatch(/^study1\./);
  await accept(browser, headers, guardian, invitation, first);
});

async function accept(browser: Browser, headers: Record<string, string>, guardian: { principal: string; credential: string }, invitation: string, childId: string) {
  const context = await browser.newContext(), tab = await context.newPage();
  try { await tab.setExtraHTTPHeaders({ 'x-forwarded-for': headers['x-forwarded-for'] }); await signIn(tab, guardian); await tab.goto('/parent/access');
    await tab.getByLabel('邀请码', { exact: true }).fill(invitation); await tab.getByRole('button', { name: '接受邀请', exact: true }).click();
    await expect(tab.getByText('邀请已接受，可以查看孩子的学习记录。', { exact: true })).toBeVisible(); await expect(tab.getByLabel('孩子的档案')).toHaveValue(childId);
  } finally { await context.close(); }
}

test('family pages: data management is reached from settings, downloads a copy and deletes one synthetic child with a receipt', async ({ page }) => {
  test.setTimeout(120_000);
  const { parent, first, second } = await family(page); await signIn(page, parent);
  await page.goto('/studio/settings'); await page.getByRole('link', { name: '管理资料', exact: true }).click(); await expect(page).toHaveURL(/\/parent\/data$/);
  await expect(page.getByRole('heading', { name: '资料管理', level: 1 })).toBeVisible(); await expect(page.getByRole('link', { name: '← 返回账号与设置' })).toHaveAttribute('href', '/studio/settings');
  await phoneLayout(page, 'data-management');
  const scope = page.getByLabel('选择本次管理的范围'); await scope.selectOption(second);
  await page.getByRole('button', { name: '下载资料副本 ↗', exact: true }).click(); await page.getByLabel('当前家长账号密码').fill(parent.credential);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '确认并下载副本', exact: true }).click();
  expect((await download).suggestedFilename().length).toBeGreaterThan(0); await expect(page.getByText('已发起资料包下载', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '查看删除档案的影响', exact: true }).click();
  const confirmation = (await page.locator('label', { hasText: '请输入“' }).first().innerText()).match(/“(.+)”/)![1];
  await page.locator('label', { hasText: '请输入“' }).first().locator('input').fill(confirmation); await page.getByLabel('我已核对范围，并了解删除后当前记录无法恢复。').check();
  await page.getByLabel('当前家长账号密码').fill(parent.credential); await page.getByRole('button', { name: '永久删除这个档案', exact: true }).click();
  await expect(page.getByText('孩子的档案及关联学习记录已删除。删除回执保留在下方。', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '孩子档案删除已完成' })).toBeVisible();
  await expect(scope.locator('option[value="' + second + '"]')).toHaveCount(0); await expect(scope.locator('option[value="' + first + '"]')).toHaveCount(1);
});

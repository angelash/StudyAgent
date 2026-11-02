import { expect, test, type Browser, type Page } from '@playwright/test';
import { fixture } from './assistant-practice-fixture';
import { syntheticFamilyHeaders } from './synthetic-family';

type Family = Awaited<ReturnType<typeof fixture>>;
const path = (page: Page) => { const url = new URL(page.url()); return url.pathname; };
async function parentSignIn(page: Page, f: Family) {
  await page.getByLabel('登录账号').fill(f.principal); await page.getByLabel('密码').fill(f.credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →', exact: true }).click(); await expect(page).not.toHaveURL(/\/parent\/login/);
}
/** Runs an anonymous visit in its own browser context so the fixture parent's session is not reused. */
async function anonymous(browser: Browser, action: (page: Page) => Promise<void>) {
  const context = await browser.newContext(), page = await context.newPage();
  try { await syntheticFamilyHeaders(page); await action(page); } finally { await context.close(); }
}
async function activePlan(f: Family) {
  const session = await f.call('/diagnostics/sessions', { studentId: f.child.id, subject: 'math', intent: 'baseline', targetAtomIds: [f.setup.atomIds[0]], maxItems: 2, includePrerequisites: false });
  for (const item of session.items) await f.call('/diagnostics/sessions/' + session.id + '/responses', { itemId: item.id, disposition: 'skip', elapsedMs: 100 });
  await f.call('/diagnostics/sessions/' + session.id + '/complete', {});
  const plan = await f.call('/diagnostics/students/' + f.child.id + '/plans', { baselineSessionId: session.id, minutesPerDay: 10, useAi: false, requestKey: crypto.randomUUID() });
  return f.call('/diagnostics/plans/' + plan.id, { status: 'active', expectedRevision: plan.revision, requestKey: crypto.randomUUID() }, 'PATCH');
}

test('login return: anonymous workspace deep links come back to the same address after parent sign-in', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const f = await fixture(page);
  for (const [href, name] of [
    ['/studio/profiles?' + new URLSearchParams({ studentId: f.child.id, subject: 'english' }), '登录后管理学习档案'],
    ['/studio/tasks?' + new URLSearchParams({ studentId: f.child.id, subject: 'chinese' }), '登录后继续学习'],
    ['/studio/reports?' + new URLSearchParams({ studentId: f.child.id, subject: 'math' }), '登录后查看自己的学习报告'],
  ] as const) await anonymous(browser, async tab => {
    await tab.goto(href); const login = tab.getByRole('link', { name, exact: true });
    await expect(login).toHaveAttribute('href', '/parent/login?' + new URLSearchParams({ returnTo: href })); await login.click();
    await expect(tab).toHaveURL(/\/parent\/login\?returnTo=/); await parentSignIn(tab, f);
    const original = new URL(href, 'https://study.invalid');
    await expect.poll(() => path(tab)).toBe(original.pathname);
    for (const [key, value] of original.searchParams) expect(new URL(tab.url()).searchParams.get(key), href + ' keeps ' + key).toBe(value);
  });
});

test('login return: old addresses in saved sign-in links reach their workspace destination, including the same plan', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const f = await fixture(page), plan = await activePlan(f);
  await anonymous(browser, async tab => {
    await tab.goto('/parent/login?' + new URLSearchParams({ returnTo: '/student/mission?' + new URLSearchParams({ student: f.child.id, subject: 'math' }) })); await parentSignIn(tab, f);
    await expect.poll(() => path(tab)).toBe('/student/today'); expect(new URL(tab.url()).searchParams.get('student')).toBe(f.child.id);
  });
  await anonymous(browser, async tab => {
    await tab.goto('/parent/login?' + new URLSearchParams({ returnTo: '/parent/dashboard?' + new URLSearchParams({ studentId: f.child.id, subject: 'math', planId: plan.id }) })); await parentSignIn(tab, f);
    await expect.poll(() => path(tab)).toBe('/studio/tasks'); await expect(tab.locator('[aria-label="指导状态与复盘完整输入"]')).toBeVisible({ timeout: 30_000 });
    await expect(tab.getByText('链接中的指导计划不属于当前孩子', { exact: false })).toHaveCount(0);
    const url = new URL(tab.url()); expect(url.searchParams.get('planId')).toBe(plan.id); expect(url.searchParams.get('view')).toBe('plan');
  });
});

test('login return: a learner code sign-in returns to the original task page', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const f = await fixture(page);
  const access = await f.call('/students/' + f.child.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: crypto.randomUUID(), reason: '合成登录返回核查本人任务页。' });
  const code = await f.call('/students/' + f.child.id + '/learning-access/codes', { expectedVersion: access.version, requestKey: crypto.randomUUID() });
  const href = '/student/today?' + new URLSearchParams({ studentId: f.child.id, subject: 'math' });
  await anonymous(browser, async tab => {
    await tab.goto(href); const login = tab.getByRole('link', { name: '使用学习码进入 ↗', exact: true });
    await expect(login).toHaveAttribute('href', '/student/login?' + new URLSearchParams({ returnTo: href })); await login.click();
    await tab.getByLabel('一次性学习码', { exact: true }).fill(code.code); await tab.getByRole('button', { name: '进入我的学习 →', exact: true }).click();
    await expect.poll(() => path(tab)).toBe('/student/today'); expect(new URL(tab.url()).searchParams.get('studentId')).toBe(f.child.id);
  });
});

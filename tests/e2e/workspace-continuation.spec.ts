import { expect, test, type Page } from '@playwright/test';
import { api, fixture } from './assistant-practice-fixture';
import { syntheticFamilyHeaders } from './synthetic-family';

async function signIn(page: Page, principal: string, credential: string) {
  await page.getByLabel('登录账号').fill(principal);
  await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →', exact: true }).click();
  await expect(page).not.toHaveURL(/\/parent\/login/);
}

test('continuation: an old in-progress assessment keeps its draft, pause, original answer and current item across workspace URLs', async ({ page }) => {
  test.setTimeout(120_000);
  const f = await fixture(page);
  const session = await f.call('/diagnostics/sessions', { studentId: f.child.id, subject: 'math', intent: 'baseline', targetAtomIds: f.setup.atomIds, maxItems: 3, includePrerequisites: false, adaptive: false });
  expect(session.items.length).toBeGreaterThan(1);
  const query = new URLSearchParams({ studentId: f.child.id, subject: 'math', session: session.id });
  await page.goto('/student/assessment?' + query);
  const answer = page.getByRole('textbox', { name: '数字或分数答案', exact: true });
  await answer.fill('17');
  await expect(page.getByText('草稿已保存', { exact: true })).toBeVisible();
  await page.reload(); await expect(answer).toHaveValue('17');
  await page.getByRole('button', { name: '保存草稿，休息一下', exact: true }).click();
  await expect(page.getByRole('heading', { name: '思路和进度都已保存。', exact: true })).toBeVisible();
  await page.goto('/studio/assessment?' + query);
  await page.getByRole('button', { name: '准备好了，继续这一组 →', exact: true }).click();
  await expect(answer).toHaveValue('17');
  await page.getByRole('button', { name: '提交，下一步 →', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: '评测进度', exact: true })).toHaveAttribute('aria-valuenow', '1');
  const saved = await f.call('/diagnostics/sessions/' + session.id), first = await f.call('/diagnostics/sessions/' + session.id + '/items/' + session.items[0].id);
  expect(saved.id).toBe(session.id); expect(saved.answeredCount).toBe(1); expect(saved.items[0].answered).toBe(true);
  const writes: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET' && request.url().includes('/api/diagnostics/')) writes.push(new URL(request.url()).pathname); });
  await page.goto('/student/assessment?' + query); await expect(answer).toHaveValue('');
  await page.reload(); await expect(page.getByRole('progressbar', { name: '评测进度', exact: true })).toHaveAttribute('aria-valuenow', '1');
  expect((await f.call('/diagnostics/sessions/' + session.id)).items).toEqual(saved.items);
  expect(await f.call('/diagnostics/sessions/' + session.id + '/items/' + session.items[0].id)).toEqual(first);
  expect(writes).toEqual([]);
});

test('continuation: teachers and admins sign in to their original allowed management page while a forbidden teacher return reads no account data', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const headers = await syntheticFamilyHeaders(page);
  async function call(path: string, body?: unknown, token?: string, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(api + path, { method, headers: { ...headers, ...(token ? { authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = await response.json(); expect(response.ok, path).toBe(true); return value.data;
  }
  const admin = { principal: process.env.E2E_ADMIN_PRINCIPAL ?? 'browser-admin', credential: process.env.E2E_ADMIN_PASSWORD ?? 'Browser-admin-only-20261021' };
  const adminActor = await call('/auth/login', admin);
  const teacher = { principal: 'return-teacher-' + crypto.randomUUID(), credential: 'Return-QA-' + crypto.randomUUID() };
  const registered = await call('/auth/register', teacher);
  const account = (await call('/admin/accounts?search=' + encodeURIComponent(teacher.principal), undefined, adminActor.token)).rows.find((row: any) => row.id === registered.user.id);
  await call('/admin/accounts/' + account.id, { role: 'teacher', status: 'active', expectedVersion: account.version, reason: '合成登录返回权限组合', adminCredential: admin.credential }, adminActor.token, 'PATCH');
  for (const actor of [teacher, admin]) {
    const context = await browser.newContext(), tab = await context.newPage();
    try {
      await syntheticFamilyHeaders(tab);
      const destination = '/admin/curriculum?subject=math&tab=coverage';
      await tab.goto(destination);
      const login = tab.getByRole('link', { name: '登录工作台', exact: true });
      await expect(login).toHaveAttribute('href', '/parent/login?' + new URLSearchParams({ returnTo: destination }));
      await login.click();
      await signIn(tab, actor.principal, actor.credential);
      await expect(tab).toHaveURL(url => url.pathname + url.search === destination);
      await expect(tab.getByRole('heading', { name: '课程与覆盖', level: 1 })).toBeVisible();
    } finally { await context.close(); }
  }
  const context = await browser.newContext(), tab = await context.newPage(), accountReads: string[] = [];
  try {
    await syntheticFamilyHeaders(tab);
    tab.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/admin/accounts')) accountReads.push(request.url()); });
    await tab.goto('/parent/login?' + new URLSearchParams({ returnTo: '/admin/accounts?search=private' }));
    await signIn(tab, teacher.principal, teacher.credential);
    await expect(tab).toHaveURL(url => url.pathname === '/studio');
    expect(accountReads).toEqual([]);
  } finally { await context.close(); }
});

test('continuation: a student signs in to the same unfinished old assessment and cannot submit another family session', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const f = await fixture(page);
  const session = await f.call('/diagnostics/sessions', { studentId: f.child.id, subject: 'math', targetAtomIds: [f.setup.atomIds[0]], maxItems: 2, includePrerequisites: false, adaptive: false });
  const access = await f.call('/students/' + f.child.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: crypto.randomUUID(), reason: '合成进行中测评本人恢复' });
  const code = await f.call('/students/' + f.child.id + '/learning-access/codes', { expectedVersion: access.version, requestKey: crypto.randomUUID() });
  const context = await browser.newContext(), tab = await context.newPage();
  try {
    await syntheticFamilyHeaders(tab);
    const destination = '/student/assessment?' + new URLSearchParams({ studentId: f.child.id, subject: 'math', session: session.id });
    await tab.goto('/student/login?' + new URLSearchParams({ returnTo: destination }));
    await tab.getByLabel('一次性学习码', { exact: true }).fill(code.code); await tab.getByRole('button', { name: '进入我的学习 →', exact: true }).click();
    await expect(tab.getByRole('textbox', { name: '数字或分数答案', exact: true })).toBeEnabled();
    expect(new URL(tab.url()).searchParams.get('session')).toBe(session.id);
    await tab.reload(); expect(new URL(tab.url()).searchParams.get('session')).toBe(session.id);
    await expect(tab.getByRole('progressbar', { name: '评测进度' })).toHaveAttribute('aria-valuenow', '0');
    const foreign = await fixture(page), otherSession = await foreign.call('/diagnostics/sessions', { studentId: foreign.child.id, subject: 'math', targetAtomIds: [foreign.setup.atomIds[0]], maxItems: 2, includePrerequisites: false });
    await tab.goto('/student/assessment?' + new URLSearchParams({ studentId: foreign.child.id, subject: 'math', session: otherSession.id }));
    await expect(tab.locator('main [role="alert"]').first()).toContainText('无法访问链接中的孩子');
    await expect(tab.getByRole('button', { name: '提交，下一步 →', exact: true })).toHaveCount(0);
    expect((await foreign.call('/diagnostics/sessions/' + otherSession.id)).answeredCount).toBe(0);
  } finally { await context.close(); }
});

test('continuation: phone touch opens the existing drawer, follows a task link and closes the overlay without losing the child', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const f = await fixture(page), context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), tab = await context.newPage();
  try {
    await syntheticFamilyHeaders(tab); await tab.goto('/parent/login'); await signIn(tab, f.principal, f.credential);
    await tab.goto('/studio?'+new URLSearchParams({ student: f.child.id, subject: 'math' }));
    const trigger = tab.getByRole('button', { name: '打开学习导航', exact: true }); await trigger.tap();
    const drawer = tab.getByRole('dialog', { name: '学习工作台导航', exact: true }); await expect(drawer).toBeVisible();
    await drawer.getByRole('link', { name: '学习任务', exact: true }).tap(); await expect(drawer).toHaveCount(0);
    await expect(tab.getByRole('heading', { name: '学习任务', level: 1 })).toBeVisible(); expect(new URL(tab.url()).searchParams.get('studentId')).toBe(f.child.id);
    await trigger.tap(); await expect(drawer).toBeVisible(); await tab.locator('.ws-reference-backdrop').tap({ position: { x: 360, y: 300 } }); await expect(drawer).toHaveCount(0);
    expect(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  } finally { await context.close(); }
});

test('continuation: switching between parent and learner sign-in and continuing an existing learner session preserve the original activity', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const f = await fixture(page), session = await f.call('/diagnostics/sessions', { studentId: f.child.id, subject: 'math', targetAtomIds: [f.setup.atomIds[0]], maxItems: 2, includePrerequisites: false });
  const access = await f.call('/students/' + f.child.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: crypto.randomUUID(), reason: '合成登录方式切换与原任务返回' });
  const code = await f.call('/students/' + f.child.id + '/learning-access/codes', { expectedVersion: access.version, requestKey: crypto.randomUUID() });
  const destination = '/student/assessment?' + new URLSearchParams({ studentId: f.child.id, subject: 'math', session: session.id });
  const context = await browser.newContext(), tab = await context.newPage();
  try {
    await syntheticFamilyHeaders(tab);
    await tab.goto('/parent/login?' + new URLSearchParams({ returnTo: destination }));
    const childLink = tab.getByRole('link', { name: '孩子自己来学习？使用学习码进入 ↗', exact: true });
    await expect(childLink).toHaveAttribute('href', '/student/login?' + new URLSearchParams({ returnTo: destination })); await childLink.click();
    await tab.getByLabel('一次性学习码', { exact: true }).fill(code.code); await tab.getByRole('button', { name: '进入我的学习 →', exact: true }).click();
    await expect(tab.getByRole('textbox', { name: '数字或分数答案', exact: true })).toBeEnabled(); expect(new URL(tab.url()).searchParams.get('session')).toBe(session.id);
    await tab.goto('/student/login?' + new URLSearchParams({ returnTo: destination }));
    const keepLearning = tab.getByRole('link', { name: '继续我的学习 →', exact: true }); await expect(keepLearning).toHaveAttribute('href', destination); await keepLearning.click();
    await expect(tab.getByRole('textbox', { name: '数字或分数答案', exact: true })).toBeEnabled(); expect(new URL(tab.url()).searchParams.get('session')).toBe(session.id);
    const parentDestination = '/studio/profiles?' + new URLSearchParams({ studentId: f.child.id, subject: 'math' });
    await tab.goto('/student/login?' + new URLSearchParams({ returnTo: parentDestination }));
    const parentLink = tab.getByRole('link', { name: '我是家长，查看学习记录 ↗', exact: true });
    await expect(parentLink).toHaveAttribute('href', '/parent/login?' + new URLSearchParams({ returnTo: parentDestination })); await parentLink.click();
    await signIn(tab, f.principal, f.credential); await expect(tab.getByRole('heading', { name: '学习档案', level: 1 })).toBeVisible();
    expect(new URL(tab.url()).searchParams.get('studentId')).toBe(f.child.id);
  } finally { await context.close(); }
});

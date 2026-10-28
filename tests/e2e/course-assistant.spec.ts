import { test, expect, type Page } from '@playwright/test';
import { browserEvidence } from './evidence';
const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107') + '/api';
const evidence = browserEvidence('course-assistant');
async function sourceFonts(page: Page) { await expect(page.getByRole('region', { name: '当时的教学出处', exact: true })).toHaveAttribute('data-original-font-status', 'ready'); }
let address = 0;
async function login(page: Page) {
  const principal = 'course-ui-' + crypto.randomUUID() + '@local.test', credential = 'Course-ui-20261028-only';
  const response = await fetch(api + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.18.17.' + (++address) }, body: JSON.stringify({ principal, credential }) });
  expect(response.status).toBe(201); const actor = (await response.json()).data;
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/); return actor;
}
async function call(actor: any, path: string, body?: unknown) {
  const response = await fetch(api + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + actor.token },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json(); expect(response.ok, JSON.stringify(value.error)).toBe(true); return value.data;
}
async function cited(actor: any) {
  const d = await call(actor, '/ai/assistant/lecture-context?courseId=sociology-foundations&lectureId=soc-u1-l1');
  const session = await call(actor, '/ai/assistant/sessions', { userRole: 'parent', studentId: null, subject: null, pageContext: 'classroom', contextRefType: 'classroom_lecture', contextRefId: d.referenceId, contextItemId: d.lectureId });
  const context = await call(actor, '/ai/assistant/sessions/' + session.id + '/context');
  const turn = await call(actor, '/ai/assistant/sessions/' + session.id + '/turns', { requestKey: crypto.randomUUID(), message: '[cite-course] 请解释本讲所选概念。', modelId: 'deepseek-v4-flash', contextVersion: context.contextVersion });
  await expect.poll(async () => (await call(actor, '/ai/assistant/sessions/' + session.id + '/turns/' + turn.id)).status, { timeout: 45000 }).toBe('completed');
  const page = await call(actor, '/ai/assistant/sessions/' + session.id + '/messages/page'), message = page.messages.find((m: any) => m.sender === 'assistant');
  expect(message.sourceReferences).toHaveLength(1); return { d, session, message, ref: message.sourceReferences[0] };
}
test('course assistant: opens the actual frozen source directly without creating a conversation or sending a question', async ({ page }) => {
  test.setTimeout(100000); await page.setViewportSize({ width: 880, height: 887 }); const actor = await login(page), data = await cited(actor), posts: string[] = [];
  page.on('request', r => { if (r.method() === 'POST' && /\/ai\/assistant\/sessions(?:\/|$)/.test(r.url())) posts.push(r.url()); });
  await page.goto(data.ref.href); await expect(page.getByRole('heading', { name: '当时的教学出处', exact: true })).toBeVisible(); await sourceFonts(page);
  await expect(page.getByRole('region', { name: '冻结教学内容' })).toContainText('社会学'); expect(posts).toEqual([]);
  await page.reload(); await expect(page.getByRole('heading', { name: '当时的教学出处', exact: true })).toBeVisible(); await sourceFonts(page); expect(posts).toEqual([]);
  if (!process.env.CI) await page.screenshot({ path: evidence + '/source-direct.png', fullPage: true });
});
test('course assistant: a cited answer exposes its source and returns to its complete draft and original message', async ({ page }) => {
  test.setTimeout(100000); const actor = await login(page), data = await cited(actor);
  await page.goto('/studio?view=home&mode=instant&lectureCourse=sociology-foundations&lecture=soc-u1-l1&lectureVersion=' + data.d.fingerprint);
  const input = page.getByLabel('想一起看看什么', { exact: true }); await expect(input).toBeEnabled();
  await input.fill('完整保留的原讲座匿名草稿。');
  const source = page.getByRole('navigation', { name: '本次回答的教学出处' }).getByRole('link').first(); await expect(source).toBeVisible(); await source.click();
  await expect(page.getByRole('heading', { name: '当时的教学出处', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '返回原对话', exact: true }).click(); await expect(input).toHaveValue('完整保留的原讲座匿名草稿。');
  await expect(page.locator('[data-message-id="' + data.message.id + '"]')).toBeFocused();
});

test('course assistant: narrow source views retain every table cell and original teaching code without running it', async ({ page }) => {
  test.setTimeout(100000); await page.setViewportSize({ width: 390, height: 844 }); const actor = await login(page), data = await cited(actor);
  const table = await call(actor, '/ai/assistant/sessions/' + data.session.id + '/sources/lecture-1-6');
  await page.goto(table.reference.href); await expect(page.getByRole('table')).toBeVisible(); await sourceFonts(page);
  const expected = table.sections.flatMap((s: any) => s.blocks).find((b: any) => b.table).table;
  for (const header of expected.headers) await expect(page.getByRole('columnheader', { name: header, exact: true })).toBeVisible();
  for (const row of expected.rows) for (const cell of row) await expect(page.getByRole('cell', { name: cell, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  if (!process.env.CI) await page.screenshot({ path: evidence + '/source-table-390.png', fullPage: true });
  const source = await call(actor, '/ai/assistant/sessions/' + data.session.id + '/sources/lecture-1-3'), originalCode = source.sections.flatMap((s: any) => s.blocks).find((b: any) => b.code !== undefined).code;
  const runs: string[] = []; page.on('request', r => { if (r.method() === 'POST' && /(?:code|run|execute)/.test(r.url())) runs.push(r.url()); });
  await page.goto(source.reference.href); await expect(page.getByLabel('原教学代码')).toBeVisible(); await sourceFonts(page); expect(await page.getByLabel('原教学代码').textContent()).toBe(originalCode);
  await expect(page.getByRole('list', { name: '图形完整标注' })).toContainText('行业岗位变化'); expect(runs).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  if (!process.env.CI) await page.screenshot({ path: evidence + '/source-code-390.png', fullPage: true });
});

test('course assistant: a different account cannot retain source content or cause a conversation post', async ({ page }) => {
  test.setTimeout(100000); const actor = await login(page), data = await cited(actor); await page.goto(data.ref.href);
  await expect(page.getByRole('region', { name: '冻结教学内容' })).toBeVisible();
  await page.context().clearCookies(); await login(page); const posts: string[] = [];
  page.on('request', r => { if (r.method() === 'POST' && /\/ai\/assistant\/sessions(?:\/|$)/.test(r.url())) posts.push(r.url()); });
  const denied = page.waitForResponse(r => r.url().includes('/ai/assistant/sessions/' + data.session.id + '/sources/'));
  await page.goto(data.ref.href); expect((await denied).status()).toBe(404); await expect(page.getByRole('alert', { name: '出处读取失败' })).toContainText('无法读取'); await sourceFonts(page);
  await expect(page.getByRole('region', { name: '冻结教学内容' })).toHaveCount(0); await expect(page.getByRole('link', { name: '返回原对话', exact: true })).toHaveCount(0); expect(posts).toEqual([]);
});

test('course assistant: source return locates an original answer outside the newest25 messages', async ({ page }) => {
  test.setTimeout(100000); const actor = await login(page), data = await cited(actor);
  await call(actor, '/qa/assistant/seed-history', { sessionId: data.session.id, count: 70, makeSourceOld: true });
  const recent = await call(actor, '/ai/assistant/sessions/' + data.session.id + '/messages/page?pageSize=25');
  expect(recent.messages.some((m: any) => m.id === data.message.id)).toBe(false);
  const href = new URL(data.ref.href, 'https://local.invalid'); href.searchParams.set('assistantSourceMessage', data.message.id);
  await page.goto(href.pathname + href.search); await sourceFonts(page); await page.getByRole('link', { name: '返回原对话', exact: true }).click();
  await expect(page.locator('[data-message-id="' + data.message.id + '"]')).toBeFocused();
  await expect(page.getByRole('navigation', { name: '本次回答的教学出处' })).toBeVisible();
  await page.getByRole('button', { name: '恢复最近消息', exact: true }).click(); await expect(page.locator('[data-message-id="' + data.message.id + '"]')).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe(''); await page.reload(); await expect(page.getByLabel('想一起看看什么', { exact: true })).toBeEnabled();
  await expect(page.locator('[data-message-id="' + data.message.id + '"]')).toHaveCount(0);
});

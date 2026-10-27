import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { browserEvidence } from './evidence';
const api = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}/api`, evidence = browserEvidence('reference-navigation');
async function enter(page: Page, width: number) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const nonce = crypto.randomUUID(), principal = 'navigation-' + nonce + '@local.test', credential = 'Nav-QA-' + nonce;
  const hash = createHash('sha256').update(test.info().testId).digest(), address = '198.20.' + hash[0] + '.' + hash[1];
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address });
  const registered = await fetch(api + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Forwarded-For': address }, body: JSON.stringify({ principal, credential }) });
  expect(registered.status).toBe(201); const actor = (await registered.json()).data;
  await page.addInitScript(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await page.goto('/studio/classroom'); await expect(page.getByRole('heading', { name: '社会学概论', exact: true })).toBeVisible();
  return actor;
}
for (const width of [390, 768, 1280, 1440]) test(`reference navigation: truthful empty history, actual navigation and complete compact or modal controls at ${width}`, async ({ page }) => {
  await enter(page, width);
  if (width <= 1000) await page.getByRole('button', { name: '打开学习导航', exact: true }).click();
  const sidebar = page.getByLabel('学习工作台导航', { exact: true }); await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole('region', { name: '开始学习', exact: true })).toContainText('打开课程');
  await expect(sidebar.getByRole('region', { name: '继续学习', exact: true })).toHaveCount(0);
  if (width <= 1000) {
    await expect(sidebar).toHaveAttribute('aria-modal', 'true');
    expect(await page.locator('.cl-course-layout').evaluate(node => Boolean(node.closest('[inert]')))).toBe(true);
    await page.keyboard.press('Shift+Tab'); expect(await sidebar.evaluate(node => node.contains(document.activeElement))).toBe(true);
    await page.screenshot({ path: evidence + '/navigation-' + width + '.png', fullPage: true });
    await page.keyboard.press('Escape'); await expect(sidebar).toHaveCount(0);
    await expect(page.getByRole('button', { name: '打开学习导航', exact: true })).toBeFocused();
    expect(await page.locator('.cl-course-layout').evaluate(node => Boolean(node.closest('[inert]')))).toBe(false);
    await page.getByRole('button', { name: '打开学习导航', exact: true }).click();
  } else {
    expect((await sidebar.boundingBox())!.width).toBe(240);
    await sidebar.getByRole('button', { name: '收起学习导航', exact: true }).click(); expect((await sidebar.boundingBox())!.width).toBe(60);
    await expect(sidebar.getByRole('link', { name: 'Courses', exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByRole('button', { name: '展开学习导航', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '展开学习导航', exact: true }).click();
    await page.screenshot({ path: evidence + '/navigation-' + width + '.png', fullPage: true });
  }
  await sidebar.getByRole('link', { name: 'Courses', exact: true }).click(); await expect(page.getByRole('heading', { name: '我的课程', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
test('reference navigation: a real saved classroom opens the exact original session and position from the course library', async ({ page }) => {
  await enter(page, 1280); await page.getByRole('button', { name: '▶ 学习', exact: true }).first().click();
  await page.getByRole('button', { name: '下一步 ›', exact: true }).click(); await expect(page.locator('.cl-session-navigation')).toContainText('2 / 8');
  const original = new URL(page.url()).searchParams.get('session');
  await page.getByRole('button', { name: '离开课堂', exact: true }).click(); await page.getByRole('button', { name: '保存并离开', exact: true }).click();
  await page.goto('/studio?view=courses'); const resume = page.getByRole('region', { name: '继续学习', exact: true }); await expect(resume).toContainText('社会学想象力');
  await resume.getByRole('link').click(); await expect(page.locator('.cl-session-navigation')).toContainText('2 / 8');
  expect(new URL(page.url()).searchParams.get('session')).toBe(original);
});
test('reference navigation: resizing an open drawer restores usable desktop controls and releases the original background', async ({ page }) => {
  await enter(page, 768); await page.getByRole('button', { name: '打开学习导航', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '学习工作台导航', exact: true })).toBeVisible(); await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole('dialog', { name: '学习工作台导航', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '收起学习导航', exact: true })).toBeVisible();
  expect(await page.locator('.cl-course-layout').evaluate(node => Boolean(node.closest('[inert]')))).toBe(false);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await page.getByRole('tab', { name: '练习', exact: true }).click(); await expect(page.getByRole('tabpanel', { name: '练习', exact: true })).toBeVisible();
});

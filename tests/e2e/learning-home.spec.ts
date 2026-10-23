import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const api = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}/api`;
async function account(page: Page, children = 0) {
  const key = `${Date.now()}-${Math.floor(Math.random() * 100000)}`, principal = `home-${key}@local.test`, credential = `Home-browser-${key}`;
  const response = await fetch(api + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principal, credential }) });
  expect(response.status).toBe(201); const { data } = await response.json();
  const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + data.token };
  const profiles: Array<{ id: string; nickname: string }> = [];
  for (let i = 0; i < children; i++) {
    const created = await fetch(api + '/students', { method: 'POST', headers, body: JSON.stringify({ nickname: `首页孩子${i + 1}`, grade: 5,
      preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }) });
    expect(created.status).toBe(201); profiles.push((await created.json()).data.profile);
  }
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click();
  await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await expect(page.getByRole('region', { name: '下一步学习' })).toBeVisible();
  return { headers, profiles };
}

test('learning home offers clear entry and works on phone, tablet and desktop', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto('/learn');
    await expect(page.getByRole('link', { name: '孩子使用学习码进入 →' })).toBeVisible();
    await expect(page.getByRole('link', { name: '家长 / 教师登录 →' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('adult can enter a course without creating a child and restore its classroom', async ({ page }) => {
  await account(page);
  await expect(page.getByRole('heading', { name: '为孩子建立一份学习档案' })).toBeVisible();
  await page.locator('.learn-next').getByRole('link', { name: '浏览课程' }).click();
  await expect(page).toHaveURL(/view=courses/);
  await expect(page.getByRole('heading', { name: '我的课程', exact: true })).toBeVisible();
  await page.goto('/studio/classroom?lesson=soc-1-1-1');
  await expect(page.locator('.cl-room')).toBeVisible();
  await page.goto('/learn');
  await expect(page.locator('.learn-next').getByRole('heading')).toContainText('继续学习');
  await expect(page.locator('.learn-next a')).toHaveAttribute('href', /lesson=soc-1-1-1/);
});

test('parent selection, navigation, refresh, history and invalid profile recovery keep context', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const { profiles } = await account(page, 2);
  await page.getByLabel('当前学习档案').selectOption(profiles[1].id);
  await page.getByLabel('当前学习学科').selectOption('english');
  await expect(page.locator('.learn-scope strong')).toHaveText('首页孩子2的英语');
  await expect(page).toHaveURL(new RegExp(`student=${profiles[1].id}`));
  await page.reload(); await expect(page.locator('.learn-scope strong')).toHaveText('首页孩子2的英语');
  await page.getByLabel('当前学习学科').selectOption('chinese');
  await expect(page.locator('.learn-scope strong')).toHaveText('首页孩子2的语文');
  await page.goBack(); await expect(page.locator('.learn-scope strong')).toHaveText('首页孩子2的英语');
  await page.goForward(); await expect(page.locator('.learn-scope strong')).toHaveText('首页孩子2的语文');
  await page.getByRole('navigation', { name: '主要导航' }).getByRole('link', { name: '今日学习', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`studentId=${profiles[1].id}.*subject=chinese|subject=chinese.*studentId=${profiles[1].id}`));
  await page.getByRole('navigation', { name: '主要导航' }).getByRole('link', { name: '学习首页', exact: true }).click();
  await expect(page.locator('.learn-scope strong')).toHaveText('首页孩子2的语文');
  await page.goto('/learn?student=unavailable-profile&subject=english');
  await expect(page.locator('.learn-error[role="alert"]')).toContainText('这次没有取回学习安排');
  await expect(page.locator('.learn-next')).toHaveCount(0);
  await page.getByRole('button', { name: '重新选择可用档案' }).click();
  await expect(page.locator('.learn-scope strong')).toHaveText('首页孩子1的数学');
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  if (process.env.E2E_HOME_SNAPSHOT === '1') {
    mkdirSync('data/qa/experience-home', { recursive: true });
    await page.screenshot({ path: 'data/qa/experience-home/phone.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 }); await page.screenshot({ path: 'data/qa/experience-home/desktop.png', fullPage: true });
  }
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await expect(page).toHaveURL(/\/parent\/login$/);
  expect(await page.evaluate(() => sessionStorage.getItem('study_agent_learning_context_v1'))).toBeNull();
  expect(errors).toEqual([]);
});

test('a delayed old selection and a failed request cannot replace the current child', async ({ page }) => {
  const { profiles } = await account(page, 2);
  let release!: () => void, captured!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { captured = resolve; });
  await page.route('**/api/learning/home?**', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('studentId') === profiles[0].id && url.searchParams.get('subject') === 'english') {
      const response = await route.fetch(); captured(); await held;
      await route.fulfill({ response }).catch(() => { /* Aborted old fetch is the expected safe outcome. */ });
    } else await route.continue();
  });
  await page.getByLabel('当前学习学科').selectOption('english'); await started;
  await page.getByLabel('当前学习档案').selectOption(profiles[1].id);
  await expect(page.locator('.learn-scope strong')).toHaveText('首页孩子2的英语');
  release();
  await expect(page.locator('.learn-scope strong')).toHaveText('首页孩子2的英语');
  await page.unroute('**/api/learning/home?**');
  await page.route('**/api/learning/home?**', route => route.abort('failed'));
  await page.getByLabel('当前学习学科').selectOption('chinese');
  await expect(page.locator('.learn-error')).toContainText('暂时无法连接学习服务');
  await expect(page.locator('.learn-next')).toHaveCount(0);
  await page.unroute('**/api/learning/home?**'); await page.getByRole('button', { name: '重新读取' }).click();
  await expect(page.locator('.learn-scope strong')).toHaveText('首页孩子2的语文');
});

test('corrupt or different-account cached choices cannot select another profile', async ({ page }) => {
  const { profiles } = await account(page, 2);
  const owner = await page.evaluate(() => JSON.parse(sessionStorage.getItem('study_agent_learning_context_v1')!).actorId);
  await page.evaluate(({ actorId, studentId }) => sessionStorage.setItem('study_agent_learning_context_v1', JSON.stringify({ actorId, studentId, subject: 'unexpected-subject' })), { actorId: owner, studentId: profiles[1].id });
  await page.goto('/learn'); await expect(page.locator('.learn-scope strong')).toHaveText('首页孩子1的数学');
  await page.evaluate(({ studentId }) => sessionStorage.setItem('study_agent_learning_context_v1', JSON.stringify({ actorId: 'another-account', studentId, subject: 'english' })), { studentId: profiles[1].id });
  await page.goto('/learn'); await expect(page.locator('.learn-scope strong')).toHaveText('首页孩子1的数学');
});

test('a student resumes the exact saved assessment and sees only their profile', async ({ page }) => {
  const { headers, profiles } = await account(page, 2), child = profiles[0];
  const command = async (path: string, body: unknown, method = 'POST') => {
    const response = await fetch(api + path, { method, headers, body: JSON.stringify(body) });
    expect(response.status).toBe(method === 'PUT' ? 200 : 201); return (await response.json()).data;
  };
  await command(`/students/${child.id}/learning-scope?subject=math`, { subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null,
    textbookVersion: '按已学知识点确认', learnedAtomIds: ['core:math:fractionadd'], currentAtomId: 'core:math:fractionadd',
    minutesPerSession: 15, progressMode: 'knowledge', selectedLessonIds: [] }, 'PUT');
  const session = await command('/diagnostics/sessions', { studentId: child.id, subject: 'math', maxItems: 2 });
  await command(`/students/${child.id}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: 'browser-home-enable', reason: '验证孩子从首页继续保存的学习。' });
  const issued = await command(`/students/${child.id}/learning-access/codes`, { requestKey: 'browser-home-code', expectedVersion: 1 });
  await page.goto('/student/login'); await page.getByLabel('一次性学习码').fill(issued.code);
  await page.getByRole('button', { name: '进入我的学习 →' }).click();
  await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await expect(page.locator('.learn-next').getByRole('heading')).toHaveText('继续上次的评测');
  await expect(page.getByLabel('当前学习档案')).toBeDisabled();
  await expect(page.getByLabel('当前学习档案').locator('option')).toHaveCount(1);
  await expect(page.getByRole('link', { name: '报告与家长决定' })).toHaveCount(0);
  await expect(page.locator('.learn-next a')).toHaveAttribute('href', new RegExp(`session=${session.id}`));
  await page.locator('.learn-next a').click(); await expect(page).toHaveURL(new RegExp(`session=${session.id}`));
  await expect(page.getByRole('navigation', { name: '主要导航' }).getByRole('link', { name: '学习首页' })).toHaveAttribute('href', new RegExp(`student=${child.id}`));
});

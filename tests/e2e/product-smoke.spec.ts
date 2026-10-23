import { expect, test } from '@playwright/test';

const apiUrl = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}`;
const webUrl = `http://localhost:${process.env.E2E_WEB_PORT ?? '3107'}`;

test('public product shell remains usable at phone, tablet and desktop widths', async ({ page }) => {
  for (const viewport of [
    { width: 360, height: 800, label: 'phone' },
    { width: 768, height: 1024, label: 'tablet' },
    { width: 1280, height: 900, label: 'desktop' },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('不只看做对多少');
    await expect(page.getByRole('link', { name: /开始了解孩子/ })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${viewport.label} pages must not overflow horizontally`).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole('link', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/parent\/login$/);
  await expect(page.getByLabel('登录账号')).toBeVisible();
  await expect(page.getByLabel('密码')).toBeVisible();
  await expect(page.getByRole('button', { name: '登录，查看学习记录 →' })).toBeVisible();
});

test('a touch and keyboard user can enter the family access flow', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: webUrl, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('link', { name: '登录', exact: true }).tap();
  await expect(page.getByRole('heading', { name: '继续孩子的学习旅程。' })).toBeVisible();
  await page.getByRole('button', { name: '首次使用，创建家长账号' }).tap();
  await expect(page.getByRole('heading', { name: '从一份学习档案开始。' })).toBeVisible();
  const principal = page.getByLabel('登录账号');
  await principal.focus();
  await page.keyboard.type('touch-keyboard@local.test');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Touch-keyboard-only-20261021');
  await expect(principal).toHaveValue('touch-keyboard@local.test');
  await expect(page.getByLabel('密码')).toHaveValue('Touch-keyboard-only-20261021');
  await expect(page.getByRole('button', { name: '创建家长账号 →' })).toBeEnabled();
  await context.close();
});

test('a parent can create a learning profile and complete an evidence-limited assessment', async ({ page }) => {
  test.setTimeout(120_000);
  let analysisStatusRequests = 0;
  page.on('request', request => { if (request.url().includes('/analysis-status')) analysisStatusRequests += 1; });
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
  const principal = `browser-${suffix}@local.test`;
  const credential = `Browser-only-${suffix}`;
  const registration = await fetch(`${apiUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ principal, credential }),
  });
  expect(registration.status, 'synthetic parent registration').toBe(201);

  await page.goto('/parent/login');
  await page.getByLabel('登录账号').fill(principal);
  await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click();
  await expect(page).toHaveURL(/\/learn(?:\?|$)/); await page.getByRole('link', { name: '建立学习档案 →', exact: true }).click();
  await expect(page.getByRole('heading', { name: '建立孩子的学习档案' })).toBeVisible();

  await page.getByLabel('孩子昵称').fill('浏览器验收');
  await page.getByLabel('当前年级').selectOption('2');
  await page.getByRole('button', { name: '保存档案 ↗' }).click();
  await expect(page.getByRole('heading', { name: /浏览器验收的每一步/ })).toBeVisible();
  await expect(page.getByText('当前 2 年级。')).toBeVisible();
  const memory = page.getByRole('region', { name: '证据化学习记忆' });
  await expect(memory).toBeVisible();
  await expect(memory.getByRole('heading', { name: '这次从哪里继续。' })).toBeVisible();
  await expect(memory.getByText('先确认当前学习进度', { exact: true })).toBeVisible();
  if (process.env.E2E_VISUAL_SNAPSHOT === '1') await page.screenshot({ path: 'data/qa/learning-memory-dashboard.png', fullPage: true });
  await page.getByRole('button', { name: '打开家长陪伴助教' }).click();
  const modelSelect = page.getByLabel('选择大模型');
  await expect(modelSelect).toHaveValue('deepseek-v4-flash');
  expect(await modelSelect.locator('option').count()).toBeGreaterThanOrEqual(23);
  await modelSelect.selectOption('claude-opus-5.5');
  if (!process.env.CI) await page.screenshot({ path: 'doc/evidence/2026-10-22/studio-model-selector.png', fullPage: true });
  await page.getByLabel('想一起看看什么').fill('请根据当前学习记录告诉我下一步。');
  await page.getByRole('button', { name: '一起想一想 →' }).click();
  await expect(page.getByText('先确认孩子的年级、教材和已学范围', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '收起家长陪伴助教' }).click();

  await page.getByRole('link', { name: '调整学习范围 ↗' }).click();
  await expect(page.getByRole('heading', { name: '先告诉我们，学到哪里了。' })).toBeVisible();
  const gradePoint = page.getByRole('checkbox', { name: /十进制位值换算/ });
  await expect(gradePoint).toBeVisible();
  await gradePoint.check();
  const previewButton = page.getByRole('button', { name: /确认进度，查看题组/ });
  await expect(previewButton).toBeEnabled();
  await previewButton.click();
  await expect(page.getByRole('region', { name: '本次评测范围与题组' })).toBeVisible();
  await page.getByRole('button', { name: /准备好了，开始这一组/ }).click();
  await expect(page.getByRole('progressbar', { name: '评测进度' })).toBeVisible();

  const reportHeading = page.getByRole('heading', { name: '从知识点看清下一步。' });
  for (let index = 0; index < 11; index += 1) {
    const dontKnow = page.getByRole('button', { name: '暂时不会' });
    await expect(dontKnow).toBeEnabled();
    await dontKnow.click();
  }
  await expect(reportHeading).toBeVisible();
  expect(analysisStatusRequests).toBeLessThanOrEqual(1);
  await expect(page.getByRole('heading', { name: '知识掌握与证据范围' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '可能卡在哪里，以及怎样验证' })).toBeVisible();
  await page.getByRole('button', { name: /制定指导计划/ }).click();
  await expect(page.getByRole('heading', { name: /每天 .*分钟/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '确认并开始计划' })).toBeVisible();
  await page.getByRole('button', { name: '确认并开始计划' }).click();
  await expect(page.getByRole('button', { name: '暂停计划' })).toBeVisible();
  await expect(page.getByText('D+1', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('D+14', { exact: true }).first()).toBeVisible();
  await page.goto('/parent/dashboard');
  const refreshedMemory = page.getByRole('region', { name: '证据化学习记忆' });
  await expect(refreshedMemory.getByText(/指导计划正在执行/)).toBeVisible();
  await expect(refreshedMemory.getByText(/今天还有\d+个指导活动/)).toBeVisible();
  if (process.env.E2E_VISUAL_SNAPSHOT === '1') await page.screenshot({ path: 'data/qa/learning-memory-populated.png', fullPage: true });
});

test('an approved fraction teaching card renders a safe step-by-step visual', async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
  const principal = `fraction-${suffix}@local.test`, credential = `Fraction-only-${suffix}`;
  expect((await fetch(`${apiUrl}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ principal, credential }) })).status).toBe(201);
  await page.goto('/parent/login');
  await page.getByLabel('登录账号').fill(principal);
  await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click();
  await page.getByRole('link', { name: '建立学习档案 →', exact: true }).click();
  await expect(page.getByRole('heading', { name: '建立孩子的学习档案' })).toBeVisible();
  await page.getByLabel('孩子昵称').fill('分数图验收');
  await page.getByLabel('当前年级').selectOption('5');
  await page.getByRole('button', { name: '保存档案 ↗' }).click();
  await page.getByRole('link', { name: '调整学习范围 ↗' }).click();
  await expect(page.getByRole('heading', { name: '先告诉我们，学到哪里了。' })).toBeVisible();
  const fractionPoint = page.getByRole('checkbox', { name: /异分母分数加法/ }).first();
  await fractionPoint.check();
  await page.getByLabel('这次想怎样了解孩子').selectOption('micro');
  const microTarget = page.locator('.assessment-targets').getByRole('checkbox', { name: /异分母分数加法/ });
  await microTarget.check();
  await page.getByRole('checkbox', { name: /加入必要的前置基础核查/ }).uncheck();
  await page.getByRole('button', { name: /确认进度，查看题组/ }).click();
  await page.getByRole('button', { name: /准备好了，开始这一组/ }).click();
  await expect(page.getByRole('progressbar', { name: '评测进度' })).toBeVisible();
  const reportHeading = page.getByRole('heading', { name: '从知识点看清下一步。' });
  for (let index = 0; index < 3; index += 1) {
    const skip = page.getByRole('button', { name: '暂时不会' });
    await expect(skip).toBeEnabled();
    await skip.click();
  }
  await expect(reportHeading).toBeVisible();
  await page.getByRole('button', { name: /制定指导计划/ }).click();
  await expect(page.getByRole('button', { name: '确认并开始计划' })).toBeVisible();
  await page.getByText('先看讲解和示例', { exact: true }).first().click();
  await expect(page.getByRole('heading', { name: '先统一切法，再合并份数' })).toBeVisible();
  if (process.env.E2E_VISUAL_SNAPSHOT === '1') await page.screenshot({ path: 'data/qa/teaching-visual.png', fullPage: true });
});

test('an administrator can reach the curriculum review workbench', async ({ page }) => {
  await page.goto('/parent/login');
  await page.getByLabel('登录账号').fill(process.env.E2E_ADMIN_PRINCIPAL ?? 'browser-admin');
  await page.getByLabel('密码').fill(process.env.E2E_ADMIN_PASSWORD ?? 'Browser-admin-only-20261021');
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click();
  await expect(page).toHaveURL(/\/admin\/analytics$/);

  await page.goto('/admin/curriculum');
  await expect(page.getByRole('heading', { name: '每一个点，都能追到依据。' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '教研导航' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '教材课时与知识映射' })).toBeVisible();
  await expect(page.getByRole('link', { name: '运营观察' })).toBeVisible();
  await expect(page.getByText(/来源总览：250 条有同版原卷/)).toBeVisible();
  await expect(page.getByRole('button', { name: /无同版原卷/ })).toBeVisible();
  await page.getByLabel('选择目录').selectOption('archive-book:44deea6d4015a5183e175acc');
  await expect(page.getByText(/教材目录与现有原卷的版本年份不一致/)).toBeVisible();
  await page.getByLabel('选择目录').selectOption('public-book:33c8d495-9862-4e19-aab9-61d2af08608a');
  const installedSource = page.getByRole('region', { name: '教材内审原页' });
  const missingAssets = page.getByText(/同版来源已登记，但本地原卷未安装/);
  await expect(installedSource.or(missingAssets)).toBeVisible();
});

import { expect, test } from '@playwright/test';

const apiUrl = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}`;

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

test('a parent can sign in and create an isolated learning profile', async ({ page }) => {
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
  await expect(page).toHaveURL(/\/parent\/dashboard$/);
  await expect(page.getByRole('heading', { name: '建立孩子的学习档案' })).toBeVisible();

  await page.getByLabel('孩子昵称').fill('浏览器验收');
  await page.getByLabel('当前年级').selectOption('2');
  await page.getByRole('button', { name: '保存档案 ↗' }).click();
  await expect(page.getByRole('heading', { name: /浏览器验收的每一步/ })).toBeVisible();
  await expect(page.getByText('当前 2 年级。')).toBeVisible();
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
  await expect(page.getByRole('button', { name: /无同版原卷/ })).toBeVisible();
  await page.getByLabel('选择目录').selectOption('archive-book:44deea6d4015a5183e175acc');
  await expect(page.getByText(/教材目录与现有原卷的版本年份不一致/)).toBeVisible();
});

import { expect, test } from '@playwright/test';
import bundle from '../../resources/gesp/teaching-candidates-v1.json';
import { browserEvidence } from './evidence';

test('GESP teaching: reviewers can inspect every original lesson in the existing workbench on desktop and mobile', async ({ page }) => {
  test.setTimeout(150000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/parent/login');
  await page.getByLabel('登录账号').fill(process.env.E2E_ADMIN_PRINCIPAL ?? 'browser-admin');
  await page.getByLabel('密码').fill(process.env.E2E_ADMIN_PASSWORD ?? 'Browser-admin-only-20261021');
  await page.getByRole('button', { name: '登录，查看学习记录 →', exact: true }).click();
  await expect(page).toHaveURL(/\/studio(?:\?|$)/);
  await page.goto('/admin/gesp');
  await page.getByRole('button', { name: '逐目标教学候选', exact: true }).click();
  const panel = page.getByRole('region', { name: 'GESP逐目标教学候选', exact: true });
  for (const level of [1, 2, 3, 4]) {
    await page.getByRole('navigation', { name: '认证等级', exact: true }).getByRole('button').nth(level - 1).click();
    const expected = bundle.lessons.filter(row => row.level === level);
    await expect(panel.getByRole('button').filter({ has: page.getByText(expected[0].title, { exact: true }) })).toBeVisible();
    for (const lesson of expected) {
      await panel.getByRole('button').filter({ has: page.getByText(lesson.title, { exact: true }) }).click();
      const current = panel.getByRole('article', { name: '当前教学候选', exact: true });
      await expect(current).toContainText(lesson.explanation);
      for (const key of ['example', 'check', 'debug', 'transfer', 'retention'] as const) await expect(current).toContainText(lesson[key].prompt);
      const detail = current.locator('details').first(), reference = detail.getByText(lesson.example.referenceAnswer, { exact: true });
      if (!await reference.isVisible()) await detail.locator('summary').click();
      await expect(reference).toBeVisible();
    }
    await page.screenshot({ path: browserEvidence('gesp-teaching') + '/level-' + level + '-desktop.png', fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toContainText('尚未认定为已审核独立题族');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: browserEvidence('gesp-teaching') + '/level-four-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

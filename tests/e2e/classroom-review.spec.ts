import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const api = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}/api`;
const { classroomAnswerKey } = require('../../apps/api/dist/apps/api/src/modules/learning/classroom-curriculum.js');

async function login(page: Page) {
  const key = `${Date.now()}-${Math.floor(Math.random() * 100000)}`, principal = `class-review-${key}@local.test`, credential = `ClassReview-${key}`;
  const registered = await fetch(api + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principal, credential }) });
  expect(registered.status).toBe(201); const actor = (await registered.json()).data;
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await page.addInitScript(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
  return actor;
}

test('unit check resumes holes, persists help and provides a faithful review with topic return', async ({ page }) => {
  test.setTimeout(120000); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 960 });
  const actor = await login(page);
  const response = await fetch(api + '/learning/classroom/sessions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + actor.token }, body: JSON.stringify({ lessonId: 'unit-exam:soc-u1' }) });
  expect(response.status).toBe(201); const session = (await response.json()).data;
  expect(session.lesson.questions).toHaveLength(12);
  await page.goto('/studio/classroom?lesson=unit-exam:soc-u1&tab=practice');
  await expect(page.locator('.cl-unit-check-note')).toContainText('12个新情境');
  await expect(page.locator('.cl-practice-progress button')).toHaveCount(12);
  const select = async (questionIndex: number, correct: boolean) => {
    await page.getByRole('button', { name: `第${questionIndex + 1}题`, exact: true }).click();
    const key = classroomAnswerKey(session.lesson.questions[questionIndex].id).answer;
    await page.locator('.cl-practice-options label').nth(correct ? key : (key + 1) % 4).click();
    await page.getByRole('button', { name: 'Check →', exact: true }).click();
  };
  await select(0, true);
  await page.getByRole('button', { name: '第12题', exact: true }).click(); await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await page.reload(); await expect(page.getByRole('button', { name: '第2题', exact: true })).toHaveAttribute('aria-current', 'step');
  await select(1, false);
  await page.getByRole('button', { name: '第3题', exact: true }).click();
  await page.getByRole('button', { name: '先给我一个提示', exact: true }).click();
  await expect(page.getByRole('button', { name: '已记录提示', exact: true })).toBeDisabled();
  await page.reload(); await expect(page.getByRole('button', { name: '第3题', exact: true })).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('.cl-hint')).toBeVisible();
  await select(2, true); await expect(page.locator('.cl-answer-feedback')).toContainText('记为辅助作答');
  for (let index = 3; index < 11; index++) {
    await page.getByRole('button', { name: `第${index + 1}题`, exact: true }).click();
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
  }
  const review = page.getByRole('region', { name: '课堂练习复盘' }); await expect(review).toBeVisible();
  await expect(review.getByRole('heading', { name: '先看清这次，再决定下一步。' })).toBeInViewport();
  for (const [label, count] of [['已记录', '12/12'], ['独立答对', '1'], ['答错', '1'], ['跳过', '9'], ['使用帮助', '1']])
    await expect(review.locator('.cl-review-counts>div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd')).toHaveText(count);
  await expect(review).toContainText('不是标准化能力等级');
  await review.getByRole('button', { name: '回看第2题', exact: true }).click();
  await expect(page.locator('.cl-practice-options input').first()).toBeDisabled();
  await expect(page.locator('.cl-answer-feedback')).toContainText('对照概念，再看一次');
  await page.getByRole('button', { name: '查看本次复盘 →' }).click();
  await page.reload(); await expect(review).toBeVisible();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await review.getByRole('button', { name: '返回课程，安排下一步' }).scrollIntoViewIfNeeded();
    await expect(review.getByRole('button', { name: '返回课程，安排下一步' })).toBeVisible();
  }
  if (process.env.E2E_REVIEW_SNAPSHOT === '1') {
    mkdirSync('data/qa/classroom-review', { recursive: true });
    await review.getByRole('heading', { name: '先看清这次，再决定下一步。' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'data/qa/classroom-review/mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 960 }); await review.getByRole('heading', { name: '先看清这次，再决定下一步。' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'data/qa/classroom-review/desktop.png', fullPage: true });
  }
  await review.locator('.cl-review-items>li').first().getByRole('button', { name: '回到相关微课' }).click();
  await expect(page).toHaveURL(/lesson=soc-1-1-2/);
  await page.goBack(); await expect(review).toBeVisible();
  expect(errors).toEqual([]);
});

test('saved-session links restore the exact activity and reject a mismatched lesson', async ({ page }) => {
  await login(page); await page.goto('/studio/classroom?lesson=soc-2-1-2&tab=practice');
  await expect(page.locator('.cl-practice-options')).toBeVisible();
  const saved = new URL(page.url()).searchParams.get('session'); expect(saved).toBeTruthy();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByRole('region', { name: '课堂练习复盘' })).toBeVisible();
  await page.goto('/studio/classroom?session=' + encodeURIComponent(saved!) + '&tab=practice');
  await expect(page.getByRole('region', { name: '课堂练习复盘' }).locator('.cl-review-items')).toContainText('第1题 · 跳过');
  await page.goto('/studio/classroom?session=' + encodeURIComponent(saved!) + '&lesson=soc-1-1-1&tab=practice');
  await expect(page.locator('.cl-error')).toContainText('保存记录与当前课程入口不一致');
  await expect(page.locator('.cl-practice-layout')).toHaveCount(0);
});

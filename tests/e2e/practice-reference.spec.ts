import { expect, test, type Page } from '@playwright/test';
import { browserEvidence } from './evidence';
const api = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}`, evidence = browserEvidence('practice-reference');
async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const nonce = crypto.randomUUID(), principal = 'practice-reference-' + nonce + '@local.test', credential = 'Practice-QA-' + nonce;
  const response = await fetch(api + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principal, credential }) });
  expect(response.status).toBe(201);
  await page.addInitScript(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await page.goto('/studio/classroom?lesson=soc-1-1-1&tab=practice');
  await expect(page.getByRole('button', { name: 'Check →' })).toBeVisible();
}
async function inside(page: Page) {
  const boxes = await page.locator('.cl-practice-top, .cl-practice-card, .cl-practice-options label, .cl-practice-actions button:visible').evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect(); return { name: node.className, x: box.x, right: box.right, width: box.width };
  }));
  for (const box of boxes) { expect(box.width, box.name).toBeGreaterThan(0); expect(box.x, box.name).toBeGreaterThanOrEqual(-1); expect(box.right, box.name).toBeLessThanOrEqual(page.viewportSize()!.width + 1); }
}
test('reference practice: explicit frozen media, three-column answer, readable full feedback and no unrelated next-question image', async ({ page }) => {
  await open(page, 1280);
  await expect(page.locator('.cl-practice-prompt .cl-lesson-image img')).toHaveAttribute('src', '/classroom/venn-d8b3f1.webp');
  await page.locator('.cl-practice-options input').first().check(); await page.getByRole('button', { name: 'Check →' }).click();
  await expect(page.locator('.cl-answer-feedback')).toContainText('这次区分正确');
  const prompt = await page.locator('.cl-practice-prompt').boundingBox(), options = await page.locator('.cl-practice-options').boundingBox(), verdict = await page.locator('.cl-practice-support').boundingBox();
  expect(prompt!.x + prompt!.width).toBeLessThan(options!.x); expect(options!.x + options!.width).toBeLessThan(verdict!.x);
  await page.getByText('逐项对照选择与解释', { exact: true }).click(); await expect(page.locator('.cl-option-feedback')).toHaveCount(4);
  await inside(page); await page.screenshot({ path: evidence + '/single-answered-1280.png', fullPage: true });
  await page.getByRole('button', { name: '第2题', exact: true }).click(); await expect(page.locator('.cl-practice-prompt .cl-lesson-image')).toHaveCount(0);
  await page.getByRole('button', { name: '第3题', exact: true }).click(); await expect(page.locator('.cl-practice-prompt .cl-lesson-image img')).toHaveAttribute('src', '/classroom/agency-river-c7a9e2.webp');
  await page.reload(); await page.getByRole('button', { name: '第1题', exact: true }).click(); await expect(page.locator('.cl-answer-feedback')).toContainText('这次区分正确'); await expect(page.locator('.cl-practice-options input').first()).toBeDisabled();
});
for (const width of [390, 768, 1280, 1440]) test(`reference practice: multiple choice and local assistant preserve complete input and selection at ${width}`, async ({ page }) => {
  await open(page, width); await page.getByRole('button', { name: '第6题', exact: true }).click();
  await expect(page.locator('.cl-practice-prompt .cl-lesson-image')).toHaveCount(0);
  await expect(page.locator('.cl-practice-options input[type=checkbox]')).toHaveCount(5);
  const input = page.locator('.cl-practice-options input').first(); await input.check();
  const cards = page.locator('.cl-practice-options label');
  if (width > 720) { const first = await cards.first().boundingBox(), last = await cards.last().boundingBox(); expect(last!.width).toBeGreaterThan(first!.width * 1.9); }
  await inside(page); await page.screenshot({ path: evidence + '/multiple-selected-' + width + '.png', fullPage: true });
  const trigger = page.getByRole('button', { name: '☏ Assistant', exact: true }); await trigger.click();
  const field = page.getByRole('textbox', { name: '向课堂老师提问' }); await field.fill('请保留这段完整的未发送文字，并帮我区分观察和推断。');
  if (width <= 1000) {
    const dialog = page.getByRole('dialog', { name: '练习助教' }); await expect(dialog).toBeVisible();
    await page.keyboard.press('Tab'); expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  } else { await page.getByRole('button', { name: '隐藏对话面板' }).click(); }
  await expect(trigger).toBeFocused(); await expect(input).toBeChecked();
  await trigger.click(); await expect(field).toHaveValue('请保留这段完整的未发送文字，并帮我区分观察和推断。');
  await page.screenshot({ path: evidence + '/assistant-' + width + '.png', fullPage: true });
  await page.getByRole('button', { name: '隐藏对话面板' }).click(); await expect(trigger).toBeFocused(); await expect(input).toBeChecked();
});

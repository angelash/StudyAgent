import { expect, test, type Page } from '@playwright/test';
import { browserEvidence } from './evidence';

const api = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}`, evidence = browserEvidence('classroom-choice');
let address = 0;
async function login(page: Page) {
  const suffix = crypto.randomUUID(), principal = 'classroom-choice-' + suffix + '@local.test', credential = 'Choice-QA-' + suffix;
  const response = await fetch(api + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Forwarded-For': '198.18.9.' + (++address) }, body: JSON.stringify({ principal, credential }) });
  expect(response.status).toBe(201);
  await page.addInitScript(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
}
async function open(page: Page, lesson = 'soc-1-1-2') {
  await page.goto('/studio/classroom?lesson=' + lesson + '&tab=practice');
  await expect(page.getByRole('button', { name: 'Check →' })).toBeVisible();
}
async function multiple(page: Page) {
  await page.getByRole('button', { name: '第4题', exact: true }).click();
  await expect(page.getByText('选择所有符合项。本题须选全且不多选。', { exact: true })).toBeVisible();
  await expect(page.locator('.cl-practice-options input[type=checkbox]')).toHaveCount(5);
}

test('single and multiple choices retain drafts, lock original feedback and separate submitted option states', async ({ page }) => {
  await login(page); await open(page); const url = page.url();
  const single = page.locator('.cl-practice-options input[type=radio]'); await single.nth(1).check(); await single.nth(2).check(); await expect(single.nth(1)).not.toBeChecked();
  await multiple(page); const boxes = page.locator('.cl-practice-options input[type=checkbox]');
  await expect(page.getByRole('button', { name: 'Check →' })).toBeDisabled(); await boxes.nth(0).check(); await boxes.nth(2).check(); await boxes.nth(0).uncheck();
  await expect(page.locator('.cl-choice-selection')).toContainText('3'); await page.reload();
  await multiple(page); await expect(boxes.nth(2)).toBeChecked(); await expect(boxes.nth(0)).not.toBeChecked();
  await page.getByRole('button', { name: '第1题', exact: true }).click(); await expect(single.nth(2)).toBeChecked();
  await multiple(page); await page.getByRole('button', { name: 'Check →' }).click();
  await expect(page.locator('.cl-answer-feedback')).toBeVisible(); await expect(boxes.first()).toBeDisabled();
  await expect(page.locator('.cl-option-feedback')).toHaveCount(5); await expect(page.locator('.cl-option-feedback').filter({ hasText: /选对|误选/ })).toHaveCount(1);
  const original = await page.locator('.cl-answer-feedback').innerText(); await page.goto(url); await multiple(page);
  await expect(boxes.nth(2)).toBeChecked(); await expect(page.locator('.cl-answer-feedback')).toHaveText(original, { useInnerText: true });
});

test('lost acknowledgement is resolved by reading the saved first answer without creating another request', async ({ page }) => {
  await login(page); await open(page); await multiple(page);
  let sent: Record<string, unknown> | undefined;
  await page.route('**/api/learning/classroom/sessions/*/answers', async route => { sent = route.request().postDataJSON(); await route.fetch(); await route.abort('failed'); });
  await page.locator('.cl-practice-options input').first().check(); await page.getByRole('button', { name: 'Check →' }).click();
  await expect(page.getByRole('button', { name: '读取并恢复原提交' })).toBeEnabled();
  await page.unroute('**/api/learning/classroom/sessions/*/answers'); let extra = 0; page.on('request', request => { if (request.url().endsWith('/answers') && request.method() === 'POST') extra++; });
  await page.getByRole('button', { name: '读取并恢复原提交' }).click(); await expect(page.locator('.cl-answer-feedback')).toBeVisible();
  expect(extra).toBe(0); expect(sent?.protocol).toBe('classroom-choice-v2'); await page.reload(); await multiple(page); await expect(page.locator('.cl-practice-options input').first()).toBeDisabled();
});

test('an undelivered command survives refresh and reuses its exact request key and choices', async ({ page }) => {
  await login(page); await open(page); await multiple(page); const commands: unknown[] = [];
  await page.route('**/api/learning/classroom/sessions/*/answers', async route => { commands.push(route.request().postDataJSON()); await route.abort('failed'); });
  const boxes = page.locator('.cl-practice-options input'); await boxes.nth(0).check(); await boxes.nth(3).check(); await page.getByRole('button', { name: 'Check →' }).click();
  await expect(page.getByRole('button', { name: '读取并恢复原提交' })).toBeVisible(); await page.reload();
  await expect(page.getByRole('button', { name: '读取并恢复原提交' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Check →' })).toBeDisabled();
  await page.unroute('**/api/learning/classroom/sessions/*/answers'); await page.route('**/api/learning/classroom/sessions/*/answers', async route => { commands.push(route.request().postDataJSON()); await route.continue(); });
  await page.getByRole('button', { name: '读取并恢复原提交' }).click(); await multiple(page); await expect(page.locator('.cl-answer-feedback')).toBeVisible();
  expect(commands).toHaveLength(2); expect(commands[1]).toEqual(commands[0]); await expect(boxes.nth(0)).toBeChecked(); await expect(boxes.nth(3)).toBeChecked();
});

test('a definitive rejected submission retains its command copy and permits a new checked selection', async ({ page }) => {
  await login(page); await open(page); await multiple(page);
  await page.route('**/api/learning/classroom/sessions/*/answers', route => route.fulfill({status:400,contentType:'application/json',json:{data:null,error:{code:'bad_request',message:'合成明确拒绝'}}}));
  await page.locator('.cl-practice-options input').first().check(); await page.getByRole('button',{name:'Check →'}).click();
  await expect(page.getByText(/服务器已明确拒绝原提交/)).toBeVisible(); await expect(page.getByRole('button',{name:'读取并恢复原提交'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'下载选择与原提交副本'})).toBeVisible(); await expect(page.locator('.cl-practice-options input').first()).toBeEnabled();
  await page.unroute('**/api/learning/classroom/sessions/*/answers'); await page.locator('.cl-practice-options input').nth(2).check(); await page.getByRole('button',{name:'Check →'}).click(); await expect(page.locator('.cl-answer-feedback')).toBeVisible();
});

test('another account cannot restore prior selections or open its frozen classroom', async ({ page }) => {
  await login(page); await open(page); const originalUrl=page.url(); await multiple(page); await page.locator('.cl-practice-options input').first().check();
  await login(page); await open(page); await multiple(page); await expect(page.locator('.cl-practice-options input:checked')).toHaveCount(0);
  await page.goto(originalUrl); await expect(page.locator('.cl-error')).toContainText('无法访问其他账号的课堂'); await expect(page.locator('.cl-practice-options')).toHaveCount(0);
});

test('unit checks expose the new selection mode and retain first feedback after reopening', async ({ page }) => {
  await login(page); await open(page,'unit-exam:soc-u1'); await expect(page.locator('.cl-practice-options input[type=checkbox]')).toHaveCount(5);
  await page.locator('.cl-practice-options input').first().check(); await page.getByRole('button',{name:'Check →'}).click(); await expect(page.locator('.cl-option-feedback')).toHaveCount(5);
  const feedback=await page.locator('.cl-answer-feedback').innerText();await page.reload(); await page.getByRole('button',{name:'第1题',exact:true}).click();await expect(page.locator('.cl-answer-feedback')).toHaveText(feedback,{useInnerText:true});
});

test('skip, unknown and actual hints remain separate immutable first-answer facts', async ({ page }) => {
  await login(page); await open(page);
  await page.getByRole('button', { name: 'Skip', exact: true }).click(); await expect(page.locator('.cl-answer-feedback')).toContainText('已跳过');
  await page.getByRole('button', { name: '第2题', exact: true }).click(); await page.getByRole('button', { name: '这题我不会' }).click(); await expect(page.locator('.cl-answer-feedback')).toContainText('已记录不会');
  await multiple(page); await page.getByRole('button', { name: '先给我一个提示' }).click(); await expect(page.locator('.cl-hint')).toHaveCount(1);
  await expect(page.locator('.cl-option-feedback')).toHaveCount(0); await page.locator('.cl-practice-options input').first().check(); await page.getByRole('button', { name: 'Check →' }).click();
  await expect(page.locator('.cl-answer-feedback')).toContainText('记为辅助作答'); await expect(page.locator('.cl-option-feedback')).toHaveCount(5);
});

test('a complete correct set, assisted wrong answer, skip and unknown produce a usable first-answer review', async ({ page }) => {
  await login(page); await open(page); await multiple(page);
  for (const text of ['现行末班车时间压缩','员工协商、组织','方案效果还受到']) await page.locator('.cl-practice-options label').filter({hasText:text}).locator('input').check();
  await page.getByRole('button', {name:'Check →'}).click(); await expect(page.locator('.cl-answer-feedback')).toContainText('这次区分正确');
  await expect(page.locator('.cl-option-feedback').filter({hasText:'✓ 选对'})).toHaveCount(3); await expect(page.locator('.cl-option-feedback').filter({hasText:'漏选'})).toHaveCount(0);
  await page.getByRole('button', {name:'第1题',exact:true}).click(); await page.getByRole('button', {name:'Skip',exact:true}).click();
  await page.getByRole('button', {name:'第2题',exact:true}).click(); await page.getByRole('button', {name:'这题我不会'}).click();
  await page.getByRole('button', {name:'第3题',exact:true}).click(); await page.getByRole('button', {name:'先给我一个提示'}).click();
  await page.locator('.cl-practice-options input').first().check(); await page.getByRole('button', {name:'Check →'}).click();
  await expect(page.getByRole('region', {name:'课堂练习复盘'})).toBeVisible(); await expect(page.locator('.cl-review-counts')).toContainText('独立答对');
  await expect(page.locator('.cl-review-items')).toContainText('跳过'); await expect(page.locator('.cl-review-items')).toContainText('不会');
  await page.getByRole('button', {name:'回看全部题目'}).click(); await multiple(page); await expect(page.locator('.cl-answer-feedback')).toContainText('这次区分正确');
});

test('keyboard selection stays in the question area and leaves assistant input isolated', async ({ page }) => {
  await login(page); await open(page); await multiple(page);
  const area = page.getByLabel('题目作答区域，数字键选择，回车提交'); await area.focus(); await page.keyboard.press('1'); await page.keyboard.press('3');
  const boxes = page.locator('.cl-practice-options input'); await expect(boxes.nth(0)).toBeChecked(); await expect(boxes.nth(2)).toBeChecked();
  await page.getByRole('button', { name: '☏ Assistant' }).click();
  // Actual assistant field is selected by its accessible textbox role, avoiding document shortcuts.
  const textbox = page.locator('.cl-chat-panel textarea'); await expect(textbox).toBeVisible(); await textbox.fill('1'); await textbox.press('3');
  await expect(boxes.nth(2)).toBeChecked(); await expect(page.locator('.cl-answer-feedback')).toHaveCount(0);
  await area.focus(); await page.keyboard.press('Enter'); await expect(page.locator('.cl-answer-feedback')).toBeVisible();
});

test('enlarged practice artwork restores focus and preserves the selection without submitting from its dialog', async ({ page }) => {
  await login(page); await open(page, 'soc-1-1-1'); const radio = page.locator('.cl-practice-options input').first(); await radio.check();
  const trigger = page.getByRole('button', { name: '放大图片：传记与历史', exact: true }); await trigger.click();
  await expect(page.getByRole('dialog', { name: '传记与历史' })).toBeVisible(); await page.keyboard.press('2'); await page.keyboard.press('Enter');
  await expect(page.locator('.cl-answer-feedback')).toHaveCount(0); await page.keyboard.press('Escape'); await expect(trigger).toBeFocused(); await expect(radio).toBeChecked();
});

test('unavailable local storage keeps current choices and a downloadable command copy', async ({ page }) => {
  await login(page); await page.addInitScript(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.startsWith('studyagent.classroom.choices.v1.')) throw new DOMException('QA storage denied', 'QuotaExceededError'); return set.call(this, key, value); }; });
  await open(page); await multiple(page); await page.locator('.cl-practice-options input').nth(1).check(); await page.locator('.cl-practice-options input').nth(4).check();
  await expect(page.getByText(/本机暂存不可用/)).toBeVisible(); const download = page.waitForEvent('download'); await page.getByRole('button', { name: '下载选择与原提交副本' }).click();
  expect((await download).suggestedFilename()).toBe('课堂选择与原提交副本.json'); await expect(page.locator('.cl-practice-options input').nth(4)).toBeChecked();
  await page.getByRole('button', { name: 'Check →' }).click(); await expect(page.locator('.cl-answer-feedback')).toBeVisible();
});

for (const width of [390, 768, 1440]) test('multiple-choice layout and assistant fit at ' + width, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); await login(page); await open(page); await multiple(page);
  await page.locator('.cl-practice-options input').first().check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const labels = page.locator('.cl-practice-options label'), first = await labels.nth(0).boundingBox(), second = await labels.nth(1).boundingBox(), last = await labels.nth(4).boundingBox();
  expect(first).not.toBeNull(); expect(second).not.toBeNull(); expect(last).not.toBeNull();
  if (width === 1440) { expect(Math.abs(first!.y - second!.y)).toBeLessThan(2); expect(last!.width).toBeGreaterThan(first!.width * 1.8); }
  if (width === 390) expect(second!.y).toBeGreaterThan(first!.y + first!.height - 1);
  if (!process.env.CI) await page.screenshot({ path: evidence + '/multiple-' + width + '.png', fullPage: true });
  await page.getByRole('button', { name: '☏ Assistant' }).click(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  if (!process.env.CI) await page.screenshot({ path: evidence + '/assistant-' + width + '.png', fullPage: true });
});

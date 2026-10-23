import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const api = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}/api`;
const { classroomAnswerKey } = require('../../apps/api/dist/apps/api/src/modules/learning/classroom-curriculum.js');
async function login(page: Page) {
  const key = `${Date.now()}-${Math.floor(Math.random() * 100000)}`, principal = `practice-${key}@local.test`, credential = `Practice-${key}`;
  const response = await fetch(api + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({principal,credential}) });
  expect(response.status).toBe(201); const actor = (await response.json()).data;
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await page.addInitScript(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
  return actor;
}
async function capture(page: Page, name: string) {
  if (!process.env.E2E_PRACTICE_SNAPSHOT) return;
  mkdirSync('data/qa/classroom-practice', { recursive: true }); await page.screenshot({ path: `data/qa/classroom-practice/${name}.png`, fullPage: true });
}

test('practice records dont-know, skip, sequential help and replay after a lost hint response', async ({ page }) => {
  test.setTimeout(90000); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const actor = await login(page);
  await page.goto('/studio/classroom?lesson=soc-5-2-1&tab=practice'); await expect(page.locator('.cl-practice-progress button')).toHaveCount(3);
  const sessionId = new URL(page.url()).searchParams.get('session')!;
  const headers = { authorization: 'Bearer ' + actor.token };
  async function read() { const result = await fetch(api + '/learning/classroom/sessions/' + sessionId, { headers }); expect(result.status).toBe(200); return (await result.json()).data; }
  const initial = await read(); expect(initial.hintReceipts).toEqual([]); expect(initial).not.toHaveProperty('hintKeys');
  await page.getByRole('button', { name: '这题我不会', exact: true }).click(); await expect(page.locator('.cl-answer-feedback')).toContainText('已记录不会');
  await page.getByRole('button', { name: '第2题', exact: true }).click(); await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await page.getByRole('button', { name: '第3题', exact: true }).click(); await expect(page.locator('.cl-practice-data table')).toBeVisible();
  let lost = false; const levels: number[] = [];
  await page.route('**/api/learning/classroom/sessions/*/hints', async route => {
    levels.push(route.request().postDataJSON().level);
    if (!lost) { lost = true; const response = await route.fetch(); expect(response.status()).toBe(201); await route.abort('failed'); }
    else await route.continue();
  });
  await page.getByRole('button', { name: '先给我一个提示', exact: true }).click(); await expect(page.locator('.cl-practice-notice')).toContainText('暂时无法连接');
  expect((await read()).hintReceipts).toHaveLength(1);
  await page.getByRole('button', { name: '先给我一个提示', exact: true }).click(); await expect(page.locator('.cl-hint')).toHaveCount(1);
  await expect(page.locator('.cl-practice-notice')).toHaveCount(0);
  expect(levels).toEqual([1,1]); expect((await read()).hintReceipts).toHaveLength(1);
  await page.reload(); await expect(page.getByRole('button', { name: '第3题', exact: true })).toHaveAttribute('aria-current','step');
  await expect(page.locator('.cl-hint')).toHaveCount(1); await page.getByRole('button', { name: '再给我一个提示', exact: true }).click();
  await expect(page.locator('.cl-hint')).toHaveCount(2); await expect(page.getByRole('button', { name: '提示已读完', exact: true })).toBeDisabled();
  await page.reload(); await expect(page.locator('.cl-hint')).toHaveCount(2); expect((await read()).hintReceipts).toHaveLength(2);
  await capture(page, 'sequential-hints');
  const current = await read(), question = current.lesson.questions[2];
  await page.locator('.cl-practice-options label').nth(classroomAnswerKey(question.id).answer).click(); await page.getByRole('button', {name:'Check →',exact:true}).click();
  const review = page.getByRole('region',{name:'课堂练习复盘'}); await expect(review).toBeVisible();
  for (const [label,value] of [['已记录','3/3'],['独立答对','0'],['答错','0'],['跳过','1'],['不会','1'],['使用帮助','1']])
    await expect(review.locator('.cl-review-counts>div').filter({ has: page.getByText(label,{exact:true}) }).locator('dd')).toHaveText(value);
  await page.reload(); await expect(review).toBeVisible();
  for (const width of [1440,768,390]) { await page.setViewportSize({width,height:960}); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true); await capture(page, 'review-'+width); }
  const final = await read(); expect(final.answers.map((answer:{disposition:string})=>answer.disposition)).toEqual(['dont_know','skip','answered']);
  expect(final.answers[2]).toMatchObject({hintUsed:true,hintLevel:2,correct:true});
  await review.getByRole('button',{name:'回看第3题',exact:true}).click(); await expect(page.locator('.cl-practice-options input').first()).toBeDisabled();
  await expect(page.locator('.cl-answer-feedback')).toContainText('已读2级提示'); expect(errors).toEqual([]);
});

test('every unit has a readable data or diagram practice example at desktop, tablet and phone widths', async ({ page }) => {
  test.setTimeout(90000); const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message)); await login(page);
  for (const [lesson, question, selector] of [
    ['soc-1-3-1',3,'.cl-practice-data'], ['soc-2-3-3',2,'.cl-figure'], ['soc-3-3-3',2,'.cl-practice-data'],
    ['soc-4-2-4',3,'.cl-practice-data'], ['soc-5-2-1',3,'.cl-practice-data'],
  ] as const) {
    await page.goto('/studio/classroom?'+new URLSearchParams({lesson,tab:'practice'}));
    await expect(page.locator('.cl-practice-progress button')).toHaveCount(3); await page.getByRole('button',{name:'第'+question+'题',exact:true}).click();
    for(const width of [1440,768,390]) {
      await page.setViewportSize({width,height:960}); await expect(page.locator(selector)).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1), lesson+' at '+width).toBe(true);
      await page.getByRole('button',{name:'这题我不会',exact:true}).scrollIntoViewIfNeeded(); await expect(page.getByRole('button',{name:'这题我不会',exact:true})).toBeVisible();
      await page.locator('.cl-practice-prompt').scrollIntoViewIfNeeded(); await capture(page,lesson+'-'+width);
    }
  }
  expect(errors).toEqual([]);
});

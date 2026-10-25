import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { browserEvidence } from './evidence';

const api = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}/api`, evidence = browserEvidence('classroom-code');
async function open(page: Page) {
  const id = Date.now() + '-' + Math.floor(Math.random() * 100000), principal = 'code-' + id + '@local.test', credential = 'Code-' + id;
  const registered = await fetch(api + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.18.1.201' }, body: JSON.stringify({ principal, credential }) });
  expect(registered.status).toBe(201); await page.addInitScript(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential); await page.getByRole('button', { name: '登录，查看学习记录 →' }).click();
  await expect(page).toHaveURL(/\/learn(?:\?|$)/); await page.goto('/studio/classroom?lesson=soc-1-1-1');
  for (const position of ['2 / 8', '3 / 8']) { await page.getByRole('button', { name: '下一步 ›', exact: true }).click(); await expect(page.locator('.cl-session-navigation')).toContainText(position); }
  await expect(page.getByLabel('实验代码')).toBeVisible(); await expect(page.locator('.cl-code-save')).toContainText('草稿已保存');
}
const code = (page: Page) => page.getByLabel('实验代码');
const input = (page: Page) => page.getByLabel('程序输入', { exact: true });
async function saved(page: Page) { await expect(page.locator('.cl-code-save')).toContainText('草稿已保存'); }

test('code and input save, execute, survive whiteboard navigation and reload at three widths', async ({ page }) => {
  await open(page); const source = 'const first=Number(readLine());\nconst second=Number(readLine());\nconsole.log(first+second);\nconsole.log(input.length);';
  await page.getByRole('button', { name: '继续讲解', exact: true }).click(); await code(page).focus(); await expect(page.getByRole('button', { name: '继续讲解', exact: true })).toBeVisible();
  await code(page).fill(source); await input(page).fill('12\n30\n'); await page.getByRole('button', { name: '保存代码草稿' }).click(); await saved(page);
  await page.getByRole('button', { name: '▶ 运行代码' }).click(); await expect(page.getByRole('log', { name: '代码运行结果' })).toHaveText('422'); await expect(page.locator('.cl-code-result')).toHaveText('运行完成');
  await page.reload(); await expect(code(page)).toHaveValue(source); await expect(input(page)).toHaveValue('12\n30\n');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出我的实验草稿' }).click();
  const exported = JSON.parse(readFileSync((await (await download).path())!, 'utf8')); expect(exported.code).toBe(source); expect(exported.input).toBe('12\n30\n'); expect(exported).not.toHaveProperty('ownerUserId');
  await page.getByRole('button', { name: '下一步 ›', exact: true }).click(); await expect(code(page)).toHaveCount(0); await page.getByRole('button', { name: '上一页白板' }).click(); await expect(code(page)).toHaveValue(source);
  for (const width of [1440,768,390]) { await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 }); await code(page).scrollIntoViewIfNeeded(); await expect(code(page)).toBeInViewport(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); if (!process.env.CI) { mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: evidence + '/editor-' + width + '.png', fullPage: true, animations: 'disabled' }); } }
});

test('a lost save acknowledgment and offline refresh retain exact local edits until the same command can recover', async ({ page }) => {
  await open(page); let drop = true, offline = false; const keys: string[] = [];
  await page.route('**/api/learning/classroom/sessions/*/code-drafts/*/*', async route => {
    if (offline) { await route.abort('connectionreset'); return; }
    if (route.request().method() === 'PATCH') { keys.push(route.request().postDataJSON().requestKey); if (drop) { drop = false; await route.fetch(); offline = true; await route.abort('connectionreset'); return; } }
    await route.continue();
  });
  await code(page).fill('console.log(readLine());'); await input(page).fill('离线输入'); await page.getByRole('button', { name: '保存代码草稿' }).click();
  await expect(page.locator('.cl-code-save')).toContainText('仅本地草稿'); await page.reload(); await expect(code(page)).toHaveValue('console.log(readLine());'); await expect(input(page)).toHaveValue('离线输入');
  offline = false; await page.getByRole('button', { name: '保存代码草稿' }).click(); await saved(page); expect(keys.length).toBeGreaterThanOrEqual(2); expect(new Set(keys).size).toBe(1);
  await page.reload(); await expect(input(page)).toHaveValue('离线输入');
});

test('concurrent pages preserve a conflicting buffer and require an explicit choice before replacement', async ({ page, context }) => {
  await open(page); const second = await context.newPage(); await second.goto(page.url()); await expect(second.locator('.cl-code-save')).toContainText('草稿已保存');
  await code(page).fill('console.log("page A");'); await page.getByRole('button', { name: '保存代码草稿' }).click(); await saved(page);
  // Wait for the real background save; a manual click can race its conflict state and become disabled.
  await code(second).fill('console.log("page B");'); await expect(second.locator('.cl-code-save')).toContainText('代码草稿有冲突'); await expect(code(second)).toHaveValue('console.log("page B");');
  await second.getByRole('button', { name: '读取已保存版本' }).click(); await expect(code(second)).toHaveValue('console.log("page A");');
  await code(page).fill('console.log("new A");'); await page.getByRole('button', { name: '保存代码草稿' }).click(); await saved(page);
  await code(second).fill('console.log("chosen B");'); await expect(second.locator('.cl-code-save')).toContainText('代码草稿有冲突');
  await second.getByRole('button', { name: '用我的草稿保存为新版本' }).click(); await saved(second); await page.reload(); await expect(code(page)).toHaveValue('console.log("chosen B");'); await second.close();
});

test('errors, timeouts, stop and oversize programs have explicit states without truncation or unwanted reset', async ({ page }) => {
  await open(page); await code(page).fill('throw new Error("synthetic error");'); await page.getByRole('button', { name: '▶ 运行代码' }).click(); await expect(page.locator('.cl-code-result')).toHaveText('运行错误'); await expect(page.getByRole('log')).toContainText('synthetic error');
  await code(page).fill('while(true){}'); await page.getByRole('button', { name: '▶ 运行代码' }).click(); await expect(page.locator('.cl-code-result')).toHaveText('运行超时');
  await code(page).fill('await new Promise(resolve=>setTimeout(resolve,1500));console.log("late");'); await page.getByRole('button', { name: '▶ 运行代码' }).click(); await page.getByRole('button', { name: '停止运行', exact: true }).click(); await expect(page.locator('.cl-code-result')).toHaveText('已停止运行');
  const tooLong = '//'+ 'x'.repeat(16000); await code(page).fill(tooLong); await page.getByRole('button', { name: '▶ 运行代码' }).click(); await expect(page.getByRole('log')).toContainText('程序不会被截断'); await expect(code(page)).toHaveValue(tooLong);
  await page.getByRole('button', { name: '重置', exact: true }).click(); await page.getByRole('button', { name: '继续编辑', exact: true }).click(); await expect(code(page)).toHaveValue(tooLong);
  await page.getByRole('button', { name: '重置', exact: true }).click(); await page.getByRole('button', { name: '恢复原始示例', exact: true }).click(); await expect(code(page)).not.toHaveValue(tooLong);
});

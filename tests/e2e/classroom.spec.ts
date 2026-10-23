import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const apiUrl = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}`;
const evidenceDirectory = 'doc/evidence/2026-10-23';
async function login(page: import('@playwright/test').Page) {
  const suffix = Date.now() + '-' + Math.floor(Math.random() * 100000), principal = 'classroom-' + suffix + '@local.test', credential = 'Classroom-' + suffix;
  const registered = await fetch(apiUrl + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ principal, credential }) });
  expect(registered.status).toBe(201);
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/parent\/dashboard$/);
}

function wav(seconds = 0.6) {
  const samples = Math.floor(seconds * 16000), bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8); bytes.write('fmt ', 12);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(16000, 24);
  bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(800 * Math.sin(i * 2 * Math.PI * 440 / 16000)), 44 + i * 2);
  return bytes;
}

test('course classroom supports teaching, executable examples, learning checks and durable resume', async ({ page }) => {
  test.setTimeout(120000); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 }); await login(page); await page.goto('/studio/classroom');
  await expect(page.getByRole('heading', { name: '社会学概论', exact: true })).toBeVisible();
  await expect(page.locator('.cl-unit-nav button')).toHaveCount(5); await expect(page.locator('.cl-lecture')).toHaveCount(5);
  if (!process.env.CI) { mkdirSync(evidenceDirectory, { recursive: true }); await page.screenshot({ path: evidenceDirectory + '/classroom-course.png', fullPage: true }); }
  await page.getByRole('button', { name: '▶ Learn', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: '课堂新手引导' })).toBeVisible(); await page.getByRole('button', { name: '跳过', exact: true }).click();
  await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
  await expect(page.getByRole('img', { name: '个人处境与社会条件的交汇' })).toBeVisible();
  await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
  await expect(page.getByLabel('实验代码')).toBeVisible(); await page.getByRole('button', { name: '▶ 运行代码' }).click();
  await expect(page.getByRole('log', { name: '代码运行结果' })).toContainText('甲地区: 20.0%');
  await page.getByLabel('实验代码').fill('console.log(typeof document); console.log(typeof window);');
  await page.getByRole('button', { name: '▶ 运行代码' }).click(); await expect(page.getByRole('log')).toContainText('undefined');
  await page.getByLabel('实验代码').fill('while (true) {}'); await page.getByRole('button', { name: '▶ 运行代码' }).click();
  await expect(page.getByRole('log')).toContainText('运行超过 2 秒');
  await page.getByLabel('实验代码').fill('fetch("https://example.com").catch(() => console.log("network-blocked"));');
  await page.getByRole('button', { name: '▶ 运行代码' }).click();
  await expect(page.getByRole('log')).toContainText(/运行完成|network-blocked/);
  if (!process.env.CI) await page.screenshot({ path: evidenceDirectory + '/classroom-board.png', fullPage: true });
  await page.getByRole('button', { name: '课堂设置', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '课堂设置' })).toBeVisible(); await page.getByRole('button', { name: '1.5×', exact: true }).click();
  await page.getByRole('switch', { name: /Background dots/ }).click();
  if (!process.env.CI) await page.screenshot({ path: evidenceDirectory + '/classroom-settings.png', fullPage: true });
  await page.getByRole('button', { name: '关闭课堂设置' }).click();
  await page.getByRole('tab', { name: '课堂练习' }).click(); await page.locator('.cl-quiz input[type=radio]').first().check();
  await page.getByRole('button', { name: '先给我一个提示' }).click(); await page.getByRole('button', { name: 'Check →' }).click();
  await expect(page.locator('.cl-answer-feedback')).toContainText('使用过提示');
  const receipt = await page.locator('.cl-answer-feedback').innerText();
  await page.getByRole('tab', { name: '单元项目' }).click(); await page.getByLabel('我的项目草稿').fill('匿名案例：社区图书馆如何组织排队。需要核查不同规则与资源条件。');
  await page.getByRole('button', { name: '保存项目草稿' }).click(); await expect(page.getByText('草稿已保存，重新打开仍可继续。')).toBeVisible();
  await page.reload(); await expect(page.getByText('2 / 8', { exact: true })).toHaveCount(0);
  await expect(page.locator('.cl-session-navigation')).toContainText('3 / 8');
  await page.getByRole('tab', { name: '课堂练习' }).click(); await expect(page.locator('.cl-answer-feedback')).toHaveText(receipt, { useInnerText: true });
  await page.getByRole('tab', { name: '单元项目' }).click(); await expect(page.getByLabel('我的项目草稿')).toHaveValue(/社区图书馆/);
  const notes = page.waitForEvent('download'); await page.getByRole('button', { name: '导出课堂笔记' }).click(); expect((await notes).suggestedFilename()).toMatch(/\.md$/);
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: '对话与练习', exact: true }).click();
  await expect(page.getByLabel('我的项目草稿')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: '白板', exact: true }).click();
  if (!process.env.CI) await page.screenshot({ path: evidenceDirectory + '/classroom-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '离开课堂', exact: true }).click(); await page.getByRole('button', { name: '保存并离开' }).click();
  await expect(page.getByRole('heading', { name: '社会学概论', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('audio playback ends drive teaching progress and pause prevents later automatic advancement', async ({ page }) => {
  test.setTimeout(90000); await login(page);
  await page.addInitScript(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
  const withTestAudio = async (route: import('@playwright/test').Route) => {
    const response = await route.fetch(), body = await response.json();
    body.data.speech = { available: true, provider: 'minimax', defaultVoice: 'fixture', voices: [{ id: 'fixture', label: '合成测试音轨' }] };
    await route.fulfill({ response, json: body });
  };
  await page.route('**/api/learning/classroom/sessions', withTestAudio);
  await page.route('**/api/learning/classroom/sessions/*', withTestAudio);
  let audioRequests = 0;
  await page.route('**/api/learning/classroom/sessions/*/narration/*', async route => { audioRequests++; await route.fulfill({ contentType: 'audio/wav', body: wav() }); });
  await page.goto('/studio/classroom?lesson=soc-1-1-1'); await expect(page.getByRole('button', { name: '▶ 开始学习' })).toBeVisible();
  await page.getByRole('button', { name: '▶ 开始学习' }).click(); await expect(page.locator('.cl-session-navigation')).not.toContainText('1 / 8');
  await page.getByRole('button', { name: '暂停讲解' }).click();
  await expect(page.getByRole('button', { name: '继续讲解' })).toBeVisible();
  const cursor = await page.locator('.cl-session-navigation').innerText();
  await page.waitForTimeout(1200); expect(await page.locator('.cl-session-navigation').innerText()).toBe(cursor);
  expect(audioRequests).toBeGreaterThan(0);
  for (let step = 0; step < 8; step++) {
    const before = await page.locator('.cl-session-navigation').innerText(); if (before.includes('7 / 8')) break;
    await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
    await expect(page.locator('.cl-session-navigation')).not.toHaveText(before, { useInnerText: true });
  }
  await page.getByRole('button', { name: '继续讲解' }).click();
  await expect(page.getByRole('tab', { name: '课堂练习' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: '继续讲解' })).toBeVisible();
  await expect(page.locator('.cl-session-navigation')).toContainText('7 / 8');
  await page.locator('.cl-quiz input[type=radio]').first().check(); await page.getByRole('button', { name: 'Check →' }).click();
  await expect(page.locator('.cl-answer-feedback')).toBeVisible();
  await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
  await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '课堂学习里程碑' })).toBeVisible();
});

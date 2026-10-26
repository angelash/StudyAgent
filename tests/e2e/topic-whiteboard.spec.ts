import { expect, test, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { browserEvidence } from './evidence';
import { join } from 'node:path';

const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107'), base = '/learning/studio/topic-whiteboards';
// Complete in-flight overview/media routes before Playwright disposes their API responses.
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });
async function fixture(page: Page, child = false) {
  const hash = createHash('sha256').update(test.info().testId).digest(), address = '198.19.' + hash[0] + '.' + hash[1];
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address });
  const principal = 'topic-browser-' + randomUUID() + '@local.test', credential = 'Topic-Browser-Only-20261026';
  let token = '';
  async function call(path: string, body?: unknown, method = 'POST') {
    const response = await fetch(api + '/api' + path, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address, ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    expect(response.ok, path + ': ' + response.status).toBe(true); return (await response.json()).data;
  }
  const actor = await call('/auth/register', { principal, credential }); token = actor.token;
  let studentId: string | null = null;
  if (child) {
    const created = await call('/students', { nickname: '匿名AI白板学习者', grade: 5, preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }); studentId = created.profile.id;
    await call('/students/' + studentId + '/learning-scope', { subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null,
      textbookVersion: '匿名已学范围', learnedAtomIds: ['core:math:fractionadd'], currentAtomId: 'core:math:fractionadd', minutesPerSession: 15, progressMode: 'knowledge', selectedLessonIds: [] }, 'PUT');
  }
  await page.route('**/api/learning/studio/overview?*', async route => {
    const response = await route.fetch(); if (!response.ok()) { await route.fulfill({ response }); return; }
    const payload = await response.json(); payload.data.narrationAvailable = true; payload.data.speech = { available: true, provider: 'minimax', defaultVoice: 'fixture-a', voices: [{ id: 'fixture-a', label: '合成音轨 A' }] };
    await route.fulfill({ response, json: payload });
  });
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await page.goto('/studio/whiteboards'); await expect(page.getByLabel('讲解主题')).toBeVisible();
  await expect(page.getByLabel('选择大模型')).toHaveValue('deepseek-v4-flash');
  return { actor, call, studentId };
}
async function generate(page: Page, topic = '用匿名观察解释条件与推断') {
  await page.getByLabel('讲解主题').fill(topic); await page.getByLabel('希望弄懂什么').fill('保留完整条件，说明观察、推断和替代解释的区别。');
  await page.getByRole('button', { name: '预检主题与范围', exact: true }).click(); await expect(page.getByRole('button', { name: '生成教学稿', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '生成教学稿', exact: true }).click();
}
async function ready(page: Page) { await expect(page.locator('.tw-generation-state')).toHaveText('待你核对', { timeout: 25000 }); await expect(page.getByLabel('白板标题')).toBeVisible(); }

test('login forms cannot submit before their client handlers are ready', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL });
  try {
    const page = await context.newPage();
    for (const path of ['/parent/login', '/student/login']) {
      await page.goto(path);
      for (const input of await page.locator('form input, form button').all()) await expect(input).toBeDisabled();
    }
  } finally { await context.close(); }
});

test('adult original generation, lost edit and confirmation replies recover without duplicates and reach a complete table/formula player', async ({ page }) => {
  const f = await fixture(page); let dropped = true;
  await page.route('**/api/learning/studio/topic-whiteboards/drafts', async route => {
    if (route.request().method() === 'POST' && dropped) { dropped = false; expect((await route.fetch()).status()).toBe(201); await route.abort('failed'); } else await route.continue();
  });
  await generate(page); await expect(page.getByRole('button', { name: '恢复原生成请求', exact: true })).toBeEnabled(); await page.reload();
  await page.getByRole('button', { name: '恢复原生成请求', exact: true }).click(); await ready(page);
  const id = new URL(page.url()).searchParams.get('draft')!;
  expect((await f.call(base + '/drafts', undefined, 'GET')).total).toBe(1);
  let editDropped = true, editWrites = 0;
  await page.route('**/api/learning/studio/topic-whiteboards/drafts/*/content', async route => {
    editWrites++;
    if (editDropped) { editDropped = false; expect((await route.fetch()).status()).toBe(200); await route.abort('failed'); } else await route.continue();
  });
  await page.getByLabel('讲解概要').fill('保留这段完整的本机修订说明。');
  await expect(page.getByRole('button', { name: '确认并保存这份白板', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '保存完整改稿', exact: true }).click(); await expect(page.getByRole('button', { name: '恢复原修改请求', exact: true })).toBeEnabled();
  await page.reload(); await ready(page); await expect(page.getByLabel('讲解概要')).toHaveValue('保留这段完整的本机修订说明。');
  await page.getByRole('button', { name: '恢复原修改请求', exact: true }).click(); await expect(page.locator('.tw-review')).toContainText('针对旧稿');
  expect(editWrites).toBe(1);
  await expect(page.getByRole('button', { name: '确认并保存这份白板', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: '我已阅读未确定问题或手工改稿，知晓仍需内容核对' }).check();
  let confirmationDropped = true, confirmationWrites = 0;
  await page.route('**/api/learning/studio/topic-whiteboards/drafts/*/confirm', async route => {
    confirmationWrites++;
    if (confirmationDropped) { confirmationDropped = false; expect((await route.fetch()).status()).toBe(201); await route.abort('failed'); } else await route.continue();
  });
  await page.getByRole('button', { name: '确认并保存这份白板', exact: true }).click(); await expect(page.getByRole('button', { name: '恢复原确认请求', exact: true })).toBeEnabled();
  await page.reload(); await page.getByRole('button', { name: '恢复原确认请求', exact: true }).click();
  await page.getByRole('button', { name: '打开已保存白板', exact: true }).click(); await expect(page.getByRole('dialog', { name: '白板视频' })).toBeVisible();
  expect(confirmationWrites).toBe(1);
  await expect(page.locator('.wb-ai-origin')).toContainText('AI生成');
  await page.getByLabel('完整讲稿与要点').locator('details').nth(1).locator('summary').click(); await expect(page.getByRole('table')).toContainText('完整尾行条件');
  await page.getByLabel('完整讲稿与要点').locator('details').nth(2).locator(':scope > summary').click(); await expect(page.locator('math')).toBeVisible(); await expect(page.locator('.wb-complete-formula')).toContainText('计数单位相同');
  const view = await f.call(base + '/drafts/' + id, undefined, 'GET'); expect(view).toMatchObject({ status: 'confirmed', modelId: 'deepseek-v4-flash', studentId: null, subject: null });
  expect((await f.call(base, undefined, 'GET')).total).toBe(1);
  await page.screenshot({ path: join(browserEvidence('topic-whiteboard'), 'adult-complete-player.png'), fullPage: true });
});

test('cancelled and failed review generations retain the original selected model through refresh and explicit retry', async ({ page }) => {
  const f = await fixture(page); await generate(page, '匿名观察 [topic-pause-once] [topic-review-fail-once]');
  await expect(page.getByRole('button', { name: '取消生成', exact: true })).toBeVisible(); await page.getByRole('button', { name: '取消生成', exact: true }).click();
  await expect(page.locator('.tw-generation-state')).toHaveText('已取消', { timeout: 15000 }); await page.reload();
  await page.getByLabel('选择大模型').selectOption('gpt-6-astra'); await page.getByRole('button', { name: '用原模型重试', exact: true }).click();
  await expect(page.locator('.tw-generation-state')).toHaveText('生成未完成', { timeout: 25000 });
  await page.getByRole('button', { name: '用原模型重试', exact: true }).click(); await ready(page);
  const id = new URL(page.url()).searchParams.get('draft')!, view = await f.call(base + '/drafts/' + id, undefined, 'GET');
  expect(view.modelId).toBe('deepseek-v4-flash'); expect(view.originalContent).not.toBeNull(); expect(view.generation).toBe(3);
});

test('incomplete local teaching edits survive reload and another saved draft cannot silently replace them', async ({ page }) => {
  await fixture(page); await generate(page); await ready(page); await page.getByLabel('白板标题').fill('');
  await page.getByLabel('讲解概要').fill('尚未保存的完整说明，保留结尾空格。  ');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('studyagent.topic-whiteboard.editor.v1.')).map(key => JSON.parse(localStorage.getItem(key)!).content.title))).toEqual(['']);
  await page.reload(); await ready(page); await expect(page.getByLabel('白板标题')).toHaveValue(''); await expect(page.getByLabel('讲解概要')).toHaveValue('尚未保存的完整说明，保留结尾空格。  ');
  await expect(page.getByRole('button', { name: '确认并保存这份白板', exact: true })).toBeDisabled();
  await page.getByLabel('白板标题').fill('补全后仍需核对'); await page.getByRole('button', { name: '保存完整改稿', exact: true }).click();
  await expect(page.locator('.tw-editor')).toContainText('完整改稿已保存'); await page.getByRole('button', { name: '查看完整修改历史', exact: true }).click();
  await expect(page.locator('.tw-history')).toContainText('1个旧版本');
});

test('unavailable local storage keeps the full editable draft and requires a real downloaded copy before leaving', async ({ page }) => {
  await page.addInitScript(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key.startsWith('studyagent.topic-whiteboard')) throw new DOMException('Synthetic unavailable storage', 'QuotaExceededError'); return original.call(this, key, value); }; });
  await fixture(page); await generate(page); await ready(page); await page.getByLabel('讲解概要').fill('存储不可用时仍保留的完整改稿。');
  await page.getByRole('button', { name: '＋ 新白板', exact: true }).click(); await expect(page.getByLabel('讲解概要')).toHaveValue('存储不可用时仍保留的完整改稿。');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '下载完整改稿', exact: true }).click();
  const copy = JSON.parse(readFileSync((await (await download).path())!, 'utf8')); expect(copy.content.description).toBe('存储不可用时仍保留的完整改稿。');
  await page.getByRole('button', { name: '＋ 新白板', exact: true }).click(); await expect(page.getByLabel('完整白板改稿')).toHaveCount(0);
});

test('stale-topic: another real tab keeps the local manuscript and opens a comparison before any replacement save', async ({ page }) => {
  await fixture(page); await generate(page); await ready(page); const href = page.url(), second = await page.context().newPage();
  try {
    await second.goto(href); await ready(second);
    await page.getByLabel('讲解概要').fill('本机持有的冲突原稿。');
    await second.getByLabel('讲解概要').fill('其他页已经保存的完整稿。'); await second.getByRole('button', { name: '保存完整改稿', exact: true }).click();
    await expect(second.locator('.tw-editor')).toContainText('完整改稿已保存');
    await page.getByRole('button', { name: '保存完整改稿', exact: true }).click();
    await expect(page.locator('.tw-conflict')).toContainText('服务器稿已变化');
    await expect(page.getByLabel('讲解概要')).toHaveValue('本机持有的冲突原稿。');
    await page.getByText('阅读当前服务器完整稿', { exact: true }).click(); await expect(page.locator('.tw-conflict')).toContainText('其他页已经保存的完整稿。');
    await page.getByRole('button', { name: '以服务器为基线继续我的改稿', exact: true }).click(); await page.getByRole('button', { name: '保存完整改稿', exact: true }).click();
    await expect(page.locator('.tw-editor')).toContainText('完整改稿已保存');
  } finally { await second.close(); }
});

test('uncached original topic cannot disappear on a scope change until its complete input is downloaded', async ({ page }) => {
  const f = await fixture(page, true);
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) {
    if (key.startsWith('studyagent.topic-whiteboard')) throw new DOMException('Synthetic unavailable storage', 'QuotaExceededError'); return original.call(this, key, value);
  }; });
  await page.getByLabel('讲解主题').fill('尚未生成也不能丢失的匿名主题');
  await page.getByLabel('希望弄懂什么').fill('保留我的完整教学目标。');
  await page.getByLabel('白板学习对象').selectOption(f.studentId!);
  await expect(page.getByLabel('白板学习对象')).toHaveValue('');
  await expect(page.getByLabel('讲解主题')).toHaveValue('尚未生成也不能丢失的匿名主题');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '下载原主题与请求', exact: true }).click();
  const copy = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
  expect(copy.form).toMatchObject({ prompt: '尚未生成也不能丢失的匿名主题', objective: '保留我的完整教学目标。' });
  await page.getByLabel('白板学习对象').selectOption(f.studentId!);
  await expect(page.getByLabel('白板学习对象')).toHaveValue(f.studentId!);
});

test('another explicit local manuscript cannot replace uncached dirty input until the current complete copy is downloaded', async ({ page }) => {
  await fixture(page); await generate(page); await ready(page);
  await page.getByLabel('讲解概要').fill('第一份可恢复的完整本机改稿。');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('studyagent.topic-whiteboard.editor.v1.')).map(key => JSON.parse(localStorage.getItem(key)!).content.description))).toContain('第一份可恢复的完整本机改稿。');
  await page.reload(); await ready(page);
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) {
    if (key.startsWith('studyagent.topic-whiteboard')) throw new DOMException('Synthetic unavailable storage', 'QuotaExceededError'); return original.call(this, key, value);
  }; });
  await page.getByLabel('讲解概要').fill('尚无本机缓存的第二份完整改稿。');
  await page.getByText('查看其他本机改稿', { exact: true }).click();
  const restore = page.getByRole('button', { name: '恢复这份本机改稿', exact: true }).first(); await expect(restore).toBeDisabled();
  await expect(page.getByLabel('讲解概要')).toHaveValue('尚无本机缓存的第二份完整改稿。');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '下载完整改稿', exact: true }).click();
  const copy = JSON.parse(readFileSync((await (await download).path())!, 'utf8')); expect(copy.content.description).toBe('尚无本机缓存的第二份完整改稿。');
  await expect(restore).toBeEnabled(); await restore.click();
  await expect(page.getByLabel('讲解概要')).toHaveValue('第一份可恢复的完整本机改稿。');
});

test('recovery: an uncached original cancellation survives object changes until its exact command is downloaded', async ({ page }) => {
  await fixture(page); await generate(page, '匿名观察 [topic-pause-once]');
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) {
    if (key.startsWith('studyagent.topic-whiteboard.command.')) throw new DOMException('Synthetic unavailable command storage', 'QuotaExceededError'); return original.call(this, key, value);
  }; });
  let writes = 0;
  await page.route('**/api/learning/studio/topic-whiteboards/drafts/*/cancel', async route => {
    writes++; expect((await route.fetch()).status()).toBe(201); await route.abort('failed');
  });
  await page.getByRole('button', { name: '取消生成', exact: true }).click();
  await expect(page.getByRole('button', { name: '恢复原取消请求', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '＋ 新白板', exact: true }).click(); await expect(page.locator('.tw-candidate')).toBeVisible();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '下载原稿与请求', exact: true }).click();
  const copy = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
  expect(copy.pending.action).toBe('cancel'); expect(copy.pending.body.requestKey).toBeTruthy(); expect(writes).toBe(1);
  await page.getByRole('button', { name: '＋ 新白板', exact: true }).click(); await expect(page.locator('.tw-candidate')).toHaveCount(0);
});

test('topic-slot: two real tabs keep their own complete incomplete edits after either tab reloads', async ({ page }) => {
  await fixture(page); await generate(page); await ready(page); const second = await page.context().newPage();
  try {
    await second.goto(page.url()); await ready(second);
    await page.getByLabel('讲解概要').fill('第一标签页尚未保存的完整稿。');
    const copies = () => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('studyagent.topic-whiteboard.editor.v1.')).map(key => JSON.parse(localStorage.getItem(key)!).content.description));
    await expect.poll(copies).toContain('第一标签页尚未保存的完整稿。');
    await second.getByLabel('讲解概要').fill('第二标签页的另一份完整稿。'); await expect.poll(copies).toContain('第二标签页的另一份完整稿。');
    await page.reload(); await ready(page); await expect(page.getByLabel('讲解概要')).toHaveValue('第一标签页尚未保存的完整稿。');
    await second.reload(); await ready(second); await expect(second.getByLabel('讲解概要')).toHaveValue('第二标签页的另一份完整稿。');
  } finally { await second.close(); }
});

for (const width of [390, 768, 1440]) test('explicit child goals, adult separation and complete edit controls fit at ' + width, async ({ page }) => {
  const f = await fixture(page, true); await page.setViewportSize({ width, height: 1000 }); await page.getByLabel('白板学习对象').selectOption(f.studentId!);
  await expect(page.locator('.tw-goals input')).toHaveCount(1); await page.locator('.tw-goals input').check(); await generate(page, '在相同整体下解释分数单位'); await ready(page);
  const id = new URL(page.url()).searchParams.get('draft')!, view = await f.call(base + '/drafts/' + id, undefined, 'GET'); expect(view.studentId).toBe(f.studentId); expect(view.audience.atomIds).toEqual(['core:math:fractionadd']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: join(browserEvidence('topic-whiteboard'), 'child-editor-' + width + '.png'), fullPage: true });
  await page.getByRole('button', { name: '确认并保存这份白板', exact: true }).click(); await page.getByRole('button', { name: '打开已保存白板', exact: true }).click();
  await expect(page.locator('.wb-current-sentence')).toContainText('先核对观察'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: '关闭白板', exact: true }).click();
});

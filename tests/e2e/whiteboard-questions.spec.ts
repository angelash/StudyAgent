import { test, expect, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { browserEvidence } from './evidence';
const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4172') + '/api';
test.afterEach(async ({ page }) => page.unrouteAll({ behavior: 'wait' }));
async function fixture(page: Page) {
  const hash = createHash('sha256').update(test.info().testId).digest(), address = '198.19.' + hash[0] + '.' + hash[1];
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address });
  const principal = 'whiteboard-question-' + randomUUID() + '@local.test', credential = 'Synthetic-questions-only-20261027';
  async function call(path: string, body: unknown, token?: string, method = 'POST') {
    const response = await fetch(api + path, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address,
      ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
    expect(response.ok, path + ' ' + response.status).toBe(true); return (await response.json()).data;
  }
  const actor = await call('/auth/register', { principal, credential }), child = (await call('/students', { nickname: '匿名插问验证', grade: 5, preferredSessionMinutes: 15,
    defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }, actor.token)).profile.id;
  await call('/students/' + child + '/learning-scope', { subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null, textbookVersion: '合成范围',
    learnedAtomIds: ['core:math:fractionadd'], currentAtomId: 'core:math:fractionadd', minutesPerSession: 15, progressMode: 'knowledge', selectedLessonIds: [] }, actor.token, 'PUT');
  const input = { studentId: child, subject: 'math', prompt: '解释异分母分数加法', atomId: 'core:math:fractionadd' };
  const preview = await call('/learning/studio/whiteboards/preview', input, actor.token), saved = await call('/learning/studio/whiteboards', { ...input, fingerprint: preview.fingerprint, requestKey: randomUUID() }, actor.token);
  const board = await call('/qa/whiteboard-media', { boardId: saved.id }, actor.token);
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  const href = '/studio?student=' + child + '&subject=math&whiteboard=' + board.id; await page.goto(href);
  const player = page.getByRole('dialog', { name: '白板视频', exact: true }); await expect(player).toHaveAttribute('data-original-font-status', 'ready');
  const region = page.getByRole('region', { name: '原句提问', exact: true }), current = player.locator('.wb-current-sentence');
  if ((await page.viewportSize())!.width <= 900) await player.getByRole('button', { name: '讲稿与笔记', exact: true }).click();
  const inputBox = region.getByRole('textbox', { name: '向老师提问', exact: true }); await expect(inputBox).toBeEnabled();
  return { player, region, current, inputBox, href, actor, board, call };
}

test('whiteboard questions: selected model, exact sentence and pause bookmark survive a real queued answer and return', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 }); const f = await fixture(page), commands: any[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/questions')) commands.push(request.postDataJSON()); });
  await f.region.getByRole('combobox', { name: '选择大模型', exact: true }).selectOption('gpt-6-astra');
  const unit = await f.current.getAttribute('data-unit-id'); await f.player.getByRole('button', { name: '播放', exact: true }).click();
  await expect(f.player.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  await f.inputBox.fill('为什么需要统一计数单位？'); await f.region.getByRole('button', { name: '发送', exact: true }).click();
  await expect(f.region.locator('.wb-question-answer')).toContainText('当前原句：'); await expect(f.player.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  expect(commands).toHaveLength(1); expect(commands[0]).toMatchObject({ modelId: 'gpt-6-astra', unitId: unit, intent: 'question' });
  expect(commands[0].bookmark.progress).toBeGreaterThanOrEqual(0); expect(commands[0].bookmark.progress).toBeLessThan(1);
  await f.player.getByRole('button', { name: '下一句', exact: true }).click(); await expect(f.current).not.toHaveAttribute('data-unit-id', unit!);
  await f.region.getByRole('button', { name: /回到这句/ }).click(); await expect(f.current).toHaveAttribute('data-unit-id', unit!);
  await expect(f.player.getByRole('button', { name: '播放', exact: true })).toBeVisible(); await expect(f.region.locator('.wb-question-meta')).toContainText('gpt-6-astra');
  writeFileSync(join(browserEvidence('whiteboard-questions'), 'original-sentence-command.json'), JSON.stringify({ commands, restoredUnit: unit }, null, 2));
});

test('whiteboard questions: five intentions produce distinct original commands and retain completed history', async ({ page }) => {
  const f = await fixture(page), intentions = ['question','example','simplify','prerequisite','compare'], commands: any[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/questions')) commands.push(request.postDataJSON()); });
  for (const [index, intent] of intentions.entries()) {
    await f.region.getByRole('combobox', { name: '讲解方式', exact: true }).selectOption(intent); await f.inputBox.fill('匿名讲解方式验证 ' + intent);
    await f.region.getByRole('button', { name: '发送', exact: true }).click(); await expect(f.region.locator('.wb-question-answer')).toHaveCount(index + 1);
  }
  expect(commands.map(command => command.intent)).toEqual(intentions); expect(new Set(commands.map(command => command.requestKey)).size).toBe(5);
  await page.reload(); await expect(f.region.locator('.wb-question-answer')).toHaveCount(5); await expect(f.inputBox).toHaveValue('');
});

test('whiteboard questions: a failed answer has an explicit original-model retry and preserves the next unsent question', async ({ page }) => {
  const f = await fixture(page); await f.region.getByRole('combobox', { name: '选择大模型', exact: true }).selectOption('deepseek-v4-flash');
  await f.inputBox.fill('[question-fail-once] 请解释相同单位。'); await f.region.getByRole('button', { name: '发送', exact: true }).click();
  await expect(f.region.getByRole('button', { name: '用原模型重试', exact: true })).toBeVisible();
  await f.region.getByRole('combobox', { name: '选择大模型', exact: true }).selectOption('gpt-6-astra'); await f.inputBox.fill('这是下一条未发送的完整问题，保留尾部。');
  await f.region.getByRole('button', { name: '用原模型重试', exact: true }).click(); await expect(f.region.locator('.wb-question-answer')).toHaveCount(1);
  await expect(f.region.locator('.wb-question-meta')).toContainText('deepseek-v4-flash'); await expect(f.inputBox).toHaveValue('这是下一条未发送的完整问题，保留尾部。');
});

test('whiteboard questions: cancelling running work blocks the late answer and the same original can be retried', async ({ page }) => {
  const f = await fixture(page); await f.inputBox.fill('[question-pause-once] 保留当前原句。'); await f.region.getByRole('button', { name: '发送', exact: true }).click();
  await expect(f.region.locator('.wb-question-meta')).toContainText('正在思考'); await f.region.getByRole('button', { name: '取消回答', exact: true }).click();
  await expect(f.region.locator('.wb-question-meta')).toContainText('已取消'); await expect(f.region.locator('.wb-question-answer')).toHaveCount(0);
  await f.region.getByRole('button', { name: '用原模型重试', exact: true }).click(); await expect(f.region.locator('.wb-question-answer')).toHaveCount(1);
});

test('whiteboard questions: a lost create response is recovered after reload without a second write', async ({ page }) => {
  const f = await fixture(page), commands: any[] = [];
  await page.route('**/api/learning/studio/whiteboards/*/questions', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    commands.push(route.request().postDataJSON()); const response = await route.fetch(); expect(response.status()).toBe(201); await route.abort('failed');
  });
  await f.inputBox.fill('原创建回执丢失仍保留全部内容。'); await f.region.getByRole('button', { name: '发送', exact: true }).click();
  await expect.poll(() => commands.length).toBe(1); await page.reload();
  await expect(f.region.locator('.wb-question-user')).toContainText('原创建回执丢失仍保留全部内容。');
  await expect(f.region.locator('.wb-question-answer')).toHaveCount(1); expect(commands).toHaveLength(1); await expect(f.inputBox).toHaveValue('');
});

test('whiteboard questions: unavailable local storage keeps the full input, protects closing and round trips the downloaded JSON', async ({ page }) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function(key) { if (key.startsWith('studyagent.whiteboard.questions.v1.')) throw new DOMException('Blocked', 'SecurityError'); return get.call(this,key); };
    Storage.prototype.setItem = function(key,value) { if (key.startsWith('studyagent.whiteboard.questions.v1.')) throw new DOMException('Blocked', 'QuotaExceededError'); return set.call(this,key,value); };
  });
  const f = await fixture(page), message = '完整输入首部。' + '条件与理由。'.repeat(180) + '完整输入尾部。';
  await f.inputBox.fill(message); await expect(f.region).toContainText('本机副本暂未保存'); await f.player.getByRole('button', { name: '关闭白板', exact: true }).click();
  await expect(f.player).toBeVisible(); await expect(f.inputBox).toHaveValue(message);
  const downloadPromise = page.waitForEvent('download'); await f.region.getByRole('button', { name: '下载完整提问副本', exact: true }).click(); const download = await downloadPromise;
  const bytes = readFileSync((await download.path())!); expect(JSON.parse(bytes.toString('utf8')).form.message).toBe(message);
  await f.player.getByRole('button', { name: '关闭白板', exact: true }).click(); await expect(f.player).toHaveCount(0);
  await page.goto(f.href); await expect(f.player).toHaveAttribute('data-original-font-status','ready'); await expect(f.inputBox).toBeEnabled();
  await f.region.getByLabel('导入完整提问副本', { exact: true }).setInputFiles({ name: 'original-question.json', mimeType: 'application/json', buffer: bytes });
  await expect(f.inputBox).toHaveValue(message);
});

test('whiteboard questions: duplicated documents keep separate full drafts across independent reloads', async ({ page, context }) => {
  const f = await fixture(page), second = await context.newPage(); await second.goto(f.href);
  const other = second.getByRole('region', { name: '原句提问', exact: true }).getByRole('textbox', { name: '向老师提问', exact: true }); await expect(other).toBeEnabled();
  await f.inputBox.fill('第一标签页的完整问题 A 尾部。'); await other.fill('第二标签页的完整问题 B 尾部。');
  await page.reload(); await expect(f.inputBox).toHaveValue('第一标签页的完整问题 A 尾部。');
  await second.reload(); await expect(other).toHaveValue('第二标签页的完整问题 B 尾部。'); await second.close();
});

for (const width of [390,768,1280]) test('whiteboard questions: the real composer, model selection and return controls remain usable at ' + width, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 }); const f = await fixture(page);
  await f.inputBox.fill('窄屏完整提问，回答后返回原句。'); await f.region.getByRole('button', { name: '发送', exact: true }).click();
  await expect(f.region.locator('.wb-question-answer')).toHaveCount(1);
  for (const control of [f.inputBox, f.region.getByRole('combobox', { name: '讲解方式', exact: true }), f.region.getByRole('combobox', { name: '选择大模型', exact: true }),
    f.region.getByRole('button', { name: '发送', exact: true })]) {
    const box = await control.boundingBox(); expect(box).not.toBeNull(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
  }
  await page.screenshot({ path: join(browserEvidence('whiteboard-questions'), 'question-panel-' + width + '.png') });
  await f.region.getByRole('button', { name: /回到这句/ }).click(); await expect(f.player.getByRole('button', { name: '播放', exact: true })).toBeVisible();
});

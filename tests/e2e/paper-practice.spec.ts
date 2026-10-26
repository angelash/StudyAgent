import { expect, test, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { browserEvidence } from './evidence';

const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107') + '/api';
let administrator: string | undefined;
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });
async function fixture(page: Page, slot: number) {
  const digest = createHash('sha256').update(test.info().testId).digest(), address = '198.19.' + digest[0] + '.' + digest[1];
  const principal = 'paper-browser-' + randomUUID(), credential = 'Synthetic-Paper-Browser-20261026'; let token = '';
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address });
  async function call(path: string, body?: unknown, actor = token, status = body === undefined ? 200 : 201, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(api + path, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address,
      ...(actor ? { Authorization: 'Bearer ' + actor } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json(); expect(response.status, path + ': ' + JSON.stringify(result.error)).toBe(status); return result.data;
  }
  const actor = await call('/auth/register', { principal, credential }); token = actor.token;
  if (!administrator) administrator = (await call('/auth/login', { principal: process.env.E2E_ADMIN_PRINCIPAL ?? 'browser-admin', credential: process.env.E2E_ADMIN_PASSWORD ?? 'Browser-admin-only-20261021' }, '')).token;
  const papers = { complete: 'qa:paper:' + slot + ':complete', partial: 'qa:paper:' + slot + ':partial', pdf: 'qa:paper:' + slot + ':pdf' };
  async function publish(id: string, status = 'published') { return call('/library/papers/' + encodeURIComponent(id) + '/publication', { status, reason: '浏览器合成原创资料逐项核对', licenseEvidence: '当前题干与媒体全部为独立测试构造', contentReviewed: true, mediaReviewed: true }, administrator); }
  for (const paper of Object.values(papers)) await publish(paper);
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential); await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  async function begin(paper = papers.complete) { const selection = [{ paperId: paper }], preview = await call('/library/practice/preview', { selection }); return call('/library/practice/sessions', { selection, sourceHash: preview.sourceHash, requestKey: randomUUID() }); }
  return { call, actor, papers, publish, begin };
}

test('paper practice: actual original-paper entry keeps the first answer, explicit reference, correction and completed review', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); const f = await fixture(page, 0);
  await page.goto('/library?paper=' + encodeURIComponent(f.papers.partial));
  await expect(page.getByRole('region', { name: '题卷练习入口' })).toBeVisible(); await page.getByRole('link', { name: '整卷练习 ↗', exact: true }).click();
  await page.getByRole('button', { name: '预览这次练习', exact: true }).click(); await expect(page.getByRole('region', { name: '确认原卷练习' })).toContainText('1 个缺题位');
  expect((await f.call('/library/practice/sessions')).total).toBe(0);
  await page.getByRole('button', { name: '确认范围，开始练习 ↗' }).click(); await expect(page).toHaveURL(/\/library\/practice\?session=/);
  const current = page.getByRole('region', { name: '当前原题与首次回答' }), input = page.getByLabel('先写下自己的回答');
  await expect(input).toBeVisible(); await expect(page.getByText('合成原参考：5', { exact: true })).toHaveCount(0);
  await input.fill('第一次我认为是4。'); await page.getByRole('button', { name: '提交本题回答', exact: true }).click();
  await expect(current.getByRole('region', { name: '不可覆盖的首次回答' })).toContainText('第一次我认为是4。');
  await page.getByRole('button', { name: '核对本题参考答案', exact: true }).click(); await expect(current.getByRole('region', { name: '本题原参考与自评' })).toContainText('合成原参考：5');
  await page.getByRole('button', { name: '还需订正', exact: true }).click(); await page.getByLabel('追加订正', { exact: true }).fill('订正：将3和2合起来是5。');
  let releaseCorrection!: () => void, observeCorrection!: () => void;
  const correctionGate = new Promise<void>(resolve => { releaseCorrection = resolve; }), correctionRequest = new Promise<void>(resolve => { observeCorrection = resolve; });
  await page.route('**/api/library/practice/sessions/*/commands', async route => {
    if (route.request().method() === 'POST' && route.request().postDataJSON()?.kind === 'correct') { observeCorrection(); await correctionGate; }
    await route.continue();
  });
  const corrections = page.getByRole('region', { name: '追加订正记录' });
  try {
    await page.getByRole('button', { name: '保存这次订正', exact: true }).click(); await correctionRequest;
    await expect(corrections.locator('article')).toHaveCount(0);
    await expect(page.getByLabel('追加订正', { exact: true })).toHaveValue('订正：将3和2合起来是5。');
    await expect(page.getByRole('button', { name: '保存这次订正', exact: true })).toBeDisabled();
  } finally { releaseCorrection(); }
  // The draft textarea is inside this region. Only a saved history article proves acknowledgement.
  await expect(corrections.locator('article')).toHaveCount(1); await expect(corrections.locator('article')).toContainText('订正：将3和2合起来是5。');
  const id = new URL(page.url()).searchParams.get('session')!, saved = await f.call('/library/practice/sessions/' + id);
  const original = await f.call('/library/practice/sessions/' + id + '/items/' + saved.items[0].id); expect(original.firstAnswer.text).toBe('第一次我认为是4。'); expect(original.corrections).toHaveLength(1);
  await page.getByRole('button', { name: '下一题位 ↗', exact: true }).click(); await expect(current.getByRole('heading', { name: '第 2 题', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '暂时不会', exact: true }).click(); await expect(current.getByRole('region', { name: '不可覆盖的首次回答' })).toContainText('暂时不会');
  await page.getByRole('button', { name: '结束并复盘', exact: true }).click(); const confirmation = page.getByRole('alertdialog'); await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: '确认结束，查看复盘' }).click(); await expect(page.getByText('原卷复盘', { exact: true })).toBeVisible();
  expect((await f.call('/library/practice/sessions/' + id)).counts).toMatchObject({ submitted: 2, missing: 1, dontKnow: 1, needsCorrection: 1 });
  await page.screenshot({ path: join(browserEvidence('paper-practice'), 'actual-completed-review.png'), fullPage: true }); writeFileSync(join(browserEvidence('paper-practice'), 'actual-first-answer-and-correction.json'), JSON.stringify(original, null, 2) + '\n');
});

test('paper practice: a lost first-answer receipt recovers the same command after actual refresh without submitting twice', async ({ page }) => {
  const f = await fixture(page, 1), row = await f.begin(); await page.goto('/library/practice?session=' + row.id);
  await page.getByLabel('先写下自己的回答').fill('丢回执也保留同一份首次回答。'); let intercepted = false;
  await page.route('**/api/library/practice/sessions/*/commands', async route => {
    const body = route.request().postDataJSON(); if (body.kind !== 'submit' || intercepted) return route.continue(); intercepted = true;
    const response = await route.fetch(); expect(response.status()).toBe(201); await route.abort('failed');
  });
  await page.getByRole('button', { name: '提交本题回答', exact: true }).click(); await expect(page.getByRole('region', { name: '原操作恢复' })).toBeVisible();
  await expect.poll(async () => (await f.call('/library/practice/sessions/' + row.id)).version).toBe(2);
  page.once('dialog', dialog => dialog.accept()); await page.reload(); await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toContainText('丢回执也保留同一份首次回答。');
  await expect(page.getByRole('region', { name: '原操作恢复' })).toHaveCount(0); expect((await f.call('/library/practice/sessions/' + row.id)).version).toBe(2);
});

test('paper practice: a lost creation acknowledgment restores the original started session with read-only receipt checks', async ({ page }) => {
  const f = await fixture(page, 2); await page.goto('/library/practice?paper=' + encodeURIComponent(f.papers.complete));
  await page.getByRole('button', { name: '预览这次练习', exact: true }).click(); let finished = false;
  await page.route('**/api/library/practice/sessions', async route => {
    if (route.request().method() !== 'POST') return route.continue(); const response = await route.fetch(); expect(response.status()).toBe(201); finished = true; await route.abort('failed');
  });
  await page.getByRole('button', { name: '确认范围，开始练习 ↗' }).click(); await expect.poll(() => finished).toBe(true);
  await expect.poll(async () => (await f.call('/library/practice/sessions')).total).toBe(1);
  await page.reload(); await expect(page.getByRole('link', { name: '继续上次已保存的练习 ↗' })).toBeVisible();
  await expect(page.getByRole('region', { name: '原开始记录恢复' })).toHaveCount(0); await page.getByRole('link', { name: '继续上次已保存的练习 ↗' }).click();
  await expect(page.getByLabel('先写下自己的回答')).toBeVisible(); expect((await f.call('/library/practice/sessions')).total).toBe(1);
});

test('recovery: paper practice offline draft saving and a refresh retain the full original command until explicit retry', async ({ page, context }) => {
  const f = await fixture(page, 3), row = await f.begin(); await page.goto('/library/practice?session=' + row.id);
  await page.getByLabel('先写下自己的回答').fill('离线时仍保留完整思考，不自动提交首答。'); await context.setOffline(true);
  await page.getByRole('button', { name: '保存草稿', exact: true }).click(); await expect(page.locator('.pp-shell').getByRole('alert')).toContainText('无法连接');
  await context.setOffline(false);
  for (let refresh = 0; refresh < 3; refresh++) {
    page.once('dialog', dialog => dialog.accept()); await page.reload();
    await expect(page.getByLabel('先写下自己的回答')).toHaveValue('离线时仍保留完整思考，不自动提交首答。');
    await expect(page.getByRole('region', { name: '原操作恢复' })).toBeVisible();
  }
  expect((await f.call('/library/practice/sessions/' + row.id)).version).toBe(1);
  await page.getByRole('button', { name: '核对或重试原操作', exact: true }).click(); await expect(page.getByRole('region', { name: '原操作恢复' })).toHaveCount(0);
  const saved = await f.call('/library/practice/sessions/' + row.id + '/items/' + row.items[0].id); expect(saved.draft).toBe('离线时仍保留完整思考，不自动提交首答。'); expect(saved.firstAnswer).toBeNull();
  await page.getByLabel('先写下自己的回答').fill('原草稿已确认后，更新的本机想法');
  for (let refresh = 0; refresh < 3; refresh++) { page.once('dialog', dialog => dialog.accept()); await page.reload(); await expect(page.getByLabel('先写下自己的回答')).toHaveValue('原草稿已确认后，更新的本机想法'); await expect(page.getByRole('region', { name: '原操作恢复' })).toHaveCount(0); }
});

test('paper practice: two actual pages preserve different local drafts and resolve a server conflict without overwriting the other copy', async ({ page, context }) => {
  const f = await fixture(page, 4), row = await f.begin(), second = await context.newPage();
  try {
    await page.goto('/library/practice?session=' + row.id); await second.goto('/library/practice?session=' + row.id);
    await page.getByLabel('先写下自己的回答').fill('第一页自己的完整想法'); await second.getByLabel('先写下自己的回答').fill('第二页另一份完整想法');
    await page.getByRole('button', { name: '保存草稿', exact: true }).click(); await expect(page.getByRole('region', { name: '原操作恢复' })).toHaveCount(0);
    await expect.poll(async () => (await f.call('/library/practice/sessions/' + row.id)).version).toBe(2);
    await second.getByRole('button', { name: '保存草稿', exact: true }).click(); const conflict = second.getByRole('region', { name: '本机与服务器草稿冲突' });
    await expect(conflict).toBeVisible(); await expect(conflict.getByLabel('本机保留的内容')).toHaveValue('第二页另一份完整想法'); await expect(conflict.getByLabel('当前服务器记录')).toHaveValue('第一页自己的完整想法');
    const download = second.waitForEvent('download'); await second.getByRole('button', { name: '保留冲突文件，核对最新版本' }).click(); expect((await download).suggestedFilename()).toContain('冲突');
    await conflict.getByRole('button', { name: '保留本机内容继续编辑' }).click(); await second.getByRole('button', { name: '保存草稿', exact: true }).click();
    await expect.poll(async () => (await f.call('/library/practice/sessions/' + row.id)).version).toBe(3);
    await page.reload(); await expect(page.getByRole('region', { name: '本机与服务器草稿冲突' })).toBeVisible();
    const localValues = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('study.paper-practice.draft:')).map(([, value]) => JSON.parse(value).text));
    expect(localValues).toContain('第一页自己的完整想法'); expect(localValues).toContain('第二页另一份完整想法');
  } finally { await second.close(); }
});

test('paper practice: rejected local persistence sends no answer until a real recovery download and explicit protection acknowledgment', async ({ page }) => {
  const f = await fixture(page, 5), row = await f.begin();
  await page.addInitScript(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key.startsWith('study.paper-practice.')) throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); return original.call(this, key, value); }; });
  await page.goto('/library/practice?session=' + row.id); await page.getByLabel('先写下自己的回答').fill('必须先保护这份回答。');
  await page.getByRole('button', { name: '提交本题回答', exact: true }).click(); const recovery = page.getByRole('region', { name: '原操作恢复' }); await expect(recovery).toBeVisible();
  await expect(recovery.getByRole('button', { name: '核对或重试原操作', exact: true })).toBeDisabled(); expect((await f.call('/library/practice/sessions/' + row.id)).version).toBe(1);
  const event = page.waitForEvent('download'); await recovery.getByRole('button', { name: '下载原操作保护文件' }).click(); const download = await event;
  const body = JSON.parse(readFileSync((await download.path())!, 'utf8')); expect(body.body.text).toBe('必须先保护这份回答。');
  await recovery.getByLabel('我已另外保留完整恢复文件').check(); await recovery.getByRole('button', { name: '核对或重试原操作', exact: true }).click();
  await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toContainText('必须先保护这份回答。'); expect((await f.call('/library/practice/sessions/' + row.id)).version).toBe(2);
});

test('paper practice: an actual original PDF stays an unsplit document with its own persistent response', async ({ page }) => {
  const f = await fixture(page, 6); await page.goto('/library/practice?paper=' + encodeURIComponent(f.papers.pdf));
  await page.getByRole('button', { name: '预览这次练习', exact: true }).click(); await expect(page.getByRole('region', { name: '确认原卷练习' })).toContainText('未逐题切分');
  await page.getByRole('button', { name: '确认范围，开始练习 ↗' }).click(); await expect(page.getByRole('heading', { name: '整卷作答笔记', exact: true })).toBeVisible();
  const document = page.locator('iframe[title="原始试卷 PDF"]'); await expect(document).toBeVisible(); expect(await document.getAttribute('src')).toContain('/api/library/media?');
  await page.getByLabel('先写下自己的回答').fill('第1题：我先比较了条件，再写出整卷记录。'); await page.getByRole('button', { name: '提交本题回答', exact: true }).click();
  await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toContainText('第1题：我先比较了条件');
  const id = new URL(page.url()).searchParams.get('session')!, saved = await f.call('/library/practice/sessions/' + id); expect(saved.items).toHaveLength(1); expect(saved.items[0].kind).toBe('document'); expect(saved).not.toHaveProperty('score');
});

test('paper practice: actual publication withdrawal hides the frozen question and reference while retaining the learner response', async ({ page }) => {
  const f = await fixture(page, 7), row = await f.begin(); await page.goto('/library/practice?session=' + row.id);
  await page.getByLabel('先写下自己的回答').fill('原卷撤回前的独立文字。'); await page.getByRole('button', { name: '提交本题回答', exact: true }).click();
  await page.getByRole('button', { name: '核对本题参考答案', exact: true }).click(); await expect(page.getByRole('region', { name: '本题原参考与自评' })).toBeVisible();
  await f.publish(f.papers.complete, 'withdrawn'); await page.reload(); await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toContainText('原卷撤回前的独立文字。');
  await expect(page.getByRole('region', { name: '当前原题与首次回答' })).toContainText('已撤回'); await expect(page.getByRole('region', { name: '本题原参考与自评' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '核对本题参考答案', exact: true })).toHaveCount(0); await expect(page.getByText('合成原题：', { exact: false })).toHaveCount(0);
});

test('paper practice: completed review permits explicit reference reading without changing the original response or reopening correction', async ({ page }) => {
  const f = await fixture(page, 8), row = await f.begin(); await page.goto('/library/practice?session=' + row.id);
  await page.getByLabel('先写下自己的回答').fill('结束前的真实原答。'); await page.getByRole('button', { name: '提交本题回答', exact: true }).click();
  await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toBeVisible(); await page.getByRole('button', { name: '结束并复盘', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '确认结束，查看复盘' }).click(); await expect(page.getByText('原卷复盘', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '核对本题参考答案', exact: true }).click(); await expect(page.getByRole('region', { name: '本题原参考与自评' })).toContainText('合成原参考：5');
  await expect(page.getByLabel('追加订正', { exact: true })).toHaveCount(0); const saved = await f.call('/library/practice/sessions/' + row.id); expect(saved.status).toBe('completed');
  expect((await f.call('/library/practice/sessions/' + row.id + '/items/' + row.items[0].id)).firstAnswer.text).toBe('结束前的真实原答。');
});

for (const [index, width] of [390, 768, 1440].entries()) test('paper practice: original formula/table/image and keyboard completion controls fit ' + width, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); const f = await fixture(page, 20 + index), row = await f.begin();
  await page.goto('/library/practice?session=' + row.id); await expect(page.getByLabel('先写下自己的回答')).toBeVisible(); await expect(page.getByRole('table')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: '下一题位 ↗', exact: true }).click(); const image = page.getByRole('img', { name: '合成原图', exact: true }); await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth === 400)).toBe(true);
  await page.getByRole('button', { name: '结束并复盘', exact: true }).click(); const dialog = page.getByRole('alertdialog'); await expect(dialog.getByRole('button', { name: '继续练习', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: '确认结束，查看复盘' })).toBeFocused(); await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', { name: '继续练习', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(page.getByRole('button', { name: '结束并复盘', exact: true })).toBeFocused();
  await page.screenshot({ path: join(browserEvidence('paper-practice'), 'question-image-' + width + '.png'), fullPage: true });
});

test('paper practice: selected positions from two actual papers remain in the cross-paper basket and return to their original anchor', async ({ page }) => {
  const f = await fixture(page, 9);
  for (const [paper, position] of [[f.papers.complete, 2], [f.papers.partial, 1]] as const) {
    await page.goto('/library?paper=' + encodeURIComponent(paper)); const launch = page.getByRole('region', { name: '题卷练习入口' });
    await launch.locator('summary').click(); await launch.getByLabel('第 ' + position + ' 题', { exact: true }).check();
    await launch.getByRole('button', { name: '把所选题加入跨卷清单', exact: true }).click(); await expect(launch).toContainText('已放入选题清单');
  }
  await page.getByRole('link', { name: '预览跨卷清单 · 2 份 ↗', exact: true }).click(); await page.getByRole('button', { name: '预览这次练习', exact: true }).click();
  await expect(page.getByRole('region', { name: '确认原卷练习' })).toContainText('2 个可作答记录');
  await page.getByRole('button', { name: '确认范围，开始练习 ↗' }).click(); await expect(page.getByRole('heading', { name: '第 2 题', exact: true })).toBeVisible();
  const id = new URL(page.url()).searchParams.get('session')!, row = await f.call('/library/practice/sessions/' + id);
  expect(row.items.map((item: any) => [item.paperId, item.position])).toEqual([[f.papers.complete, 2], [f.papers.partial, 1]]);
  await page.getByRole('link', { name: '回到原卷题位 ↗' }).click(); await expect(page).toHaveURL(/position=2/);
  await expect(page.locator('#library-question-2')).toBeInViewport();
});

test('recovery: paper practice correction drafts stay with their own item through rapid review, navigation and a real reload', async ({ page }) => {
  const f = await fixture(page, 10), row = await f.begin(); await page.goto('/library/practice?session=' + row.id);
  await page.getByLabel('先写下自己的回答').fill('第一题的首答'); await page.getByRole('button', { name: '提交本题回答', exact: true }).click();
  await page.getByRole('button', { name: '核对本题参考答案', exact: true }).click(); await page.getByRole('button', { name: '还需订正', exact: true }).click();
  await page.getByLabel('追加订正', { exact: true }).fill('只属于第一题的未保存订正');
  await page.getByRole('button', { name: '下一题位 ↗', exact: true }).click(); await page.getByLabel('先写下自己的回答').fill('第二题的首答');
  await page.getByRole('button', { name: '提交本题回答', exact: true }).click(); await expect(page.getByLabel('追加订正', { exact: true })).toHaveValue('');
  await page.getByLabel('追加订正', { exact: true }).fill('只属于第二题的未保存订正');
  await page.getByRole('button', { name: '上一题位', exact: true }).click(); await expect(page.getByLabel('追加订正', { exact: true })).toHaveValue('只属于第一题的未保存订正');
  for (let refresh = 0; refresh < 3; refresh++) { page.once('dialog', dialog => dialog.accept()); await page.reload(); await expect(page.getByLabel('追加订正', { exact: true })).toHaveValue('只属于第一题的未保存订正'); }
  await page.getByRole('button', { name: '保存这次订正', exact: true }).click(); await expect(page.getByLabel('追加订正', { exact: true })).toHaveValue('');
  await expect(page.getByRole('region', { name: '追加订正记录' })).toContainText('只属于第一题的未保存订正');
  await page.getByLabel('追加订正', { exact: true }).fill('第一次订正已确认后，另一份新想法');
  for (let refresh = 0; refresh < 3; refresh++) { page.once('dialog', dialog => dialog.accept()); await page.reload(); await expect(page.getByLabel('追加订正', { exact: true })).toHaveValue('第一次订正已确认后，另一份新想法'); await expect(page.getByRole('region', { name: '原操作恢复' })).toHaveCount(0); }
  await page.getByRole('button', { name: '下一题位 ↗', exact: true }).click(); await expect(page.getByLabel('追加订正', { exact: true })).toHaveValue('只属于第二题的未保存订正');
  const saved = await f.call('/library/practice/sessions/' + row.id + '/items/' + row.items[0].id); expect(saved.corrections).toHaveLength(1); expect(saved.firstAnswer.text).toBe('第一题的首答');
});

test('paper practice: delayed cross-item reads cannot replace the current question after actual browser back and forward', async ({ page }) => {
  const f = await fixture(page, 11), row = await f.begin(); await page.goto('/library/practice?session=' + row.id); await page.getByLabel('先写下自己的回答').fill('前后退仍属于第一题');
  let release!: () => void, arrived = false; const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/library/practice/sessions/' + row.id + '/items/' + row.items[1].id, async route => {
    arrived = true; const response = await route.fetch(); await held; await route.fulfill({ response }).catch(() => {});
  });
  try {
    await page.getByRole('button', { name: '下一题位 ↗', exact: true }).click(); await expect.poll(() => arrived).toBe(true); await page.goBack();
    await expect(page.getByRole('heading', { name: '第 1 题', exact: true })).toBeVisible(); await expect(page.getByLabel('先写下自己的回答')).toHaveValue('前后退仍属于第一题');
    release(); await expect(page.getByRole('heading', { name: '第 2 题', exact: true })).toHaveCount(0); await page.goForward();
    await expect(page.getByRole('heading', { name: '第 2 题', exact: true })).toBeVisible(); await expect(page.getByLabel('先写下自己的回答')).toHaveValue('');
  } finally { release(); }
});

test('paper practice: metadata refreshes keep the same original PDF frame through submit and explicit reference reading', async ({ page }) => {
  const f = await fixture(page, 12), row = await f.begin(f.papers.pdf); await page.goto('/library/practice?session=' + row.id);
  const frame = page.locator('iframe[title="原始试卷 PDF"]'); await expect(frame).toBeVisible(); await frame.evaluate(node => node.setAttribute('data-original-instance', 'retained'));
  await page.getByLabel('先写下自己的回答').fill('保留原 PDF 阅读位置'); await page.getByRole('button', { name: '提交本题回答', exact: true }).click();
  await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toBeVisible(); await expect(frame).toHaveAttribute('data-original-instance', 'retained');
  await page.getByRole('button', { name: '核对本题参考答案', exact: true }).click(); await expect(page.getByRole('region', { name: '本题原参考与自评' })).toBeVisible();
  await expect(frame).toHaveAttribute('data-original-instance', 'retained');
});

test('paper practice: recovery files from another account, session or item never replace the current private draft', async ({ page }) => {
  const f = await fixture(page, 13), row = await f.begin(); await page.goto('/library/practice?session=' + row.id); await page.getByLabel('先写下自己的回答').fill('这份私人草稿保持');
  const original = { format: 'paper-practice-draft-v1', ownerId: f.actor.user.id, sessionId: row.id, itemId: row.items[0].id, text: '错误范围不能写入', baseText: '' };
  for (const change of [{ ownerId: 'another-account' }, { sessionId: 'another-session' }, { itemId: row.items[1].id }]) {
    await page.getByLabel('从本次练习保护文件恢复').setInputFiles({ name: 'foreign.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...original, ...change })) });
    await expect(page.locator('.pp-shell').getByRole('alert')).toBeVisible(); await expect(page.getByLabel('先写下自己的回答')).toHaveValue('这份私人草稿保持');
    await expect(page.getByRole('region', { name: '本机与服务器草稿冲突' })).toHaveCount(0);
  }
  expect((await f.call('/library/practice/sessions/' + row.id)).version).toBe(1);
});

test('paper practice: a real learning-code student writes only their own record and loses the private workspace after grant revocation', async ({ page, context }) => {
  const f = await fixture(page, 14), child = (await f.call('/students', { nickname: '匿名练习孩子', grade: 3, preferredSessionMinutes: 10, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile.id;
  await f.call('/students/' + child + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '合成原卷练习权限核对' });
  const issued = await f.call('/students/' + child + '/learning-access/codes', { expectedVersion: 1, requestKey: randomUUID() });
  await context.clearCookies(); await page.goto('/student/login'); await page.getByLabel('一次性学习码').fill(issued.code); await page.getByRole('button', { name: '进入我的学习 →', exact: true }).click();
  await expect(page).toHaveURL(/\/learn(?:\?|$)/); await page.goto('/library/practice?paper=' + encodeURIComponent(f.papers.complete));
  await expect(page.getByLabel('这次练习记录给谁')).toHaveValue(child); await page.getByRole('button', { name: '预览这次练习', exact: true }).click();
  await page.getByRole('button', { name: '确认范围，开始练习 ↗' }).click(); await page.getByLabel('先写下自己的回答').fill('孩子自己的原答');
  await page.getByRole('button', { name: '提交本题回答', exact: true }).click(); await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toContainText('孩子自己的原答');
  const id = new URL(page.url()).searchParams.get('session')!, parentRead = await f.call('/library/practice/sessions/' + id); expect(parentRead.permissions.edit).toBe(false);
  await f.call('/students/' + child + '/learning-access', { enabled: false, expectedVersion: 1, requestKey: randomUUID(), reason: '合成练习实时撤权核对' });
  await page.getByRole('button', { name: '核对本题参考答案', exact: true }).click(); await expect(page.getByRole('region', { name: '当前原题与首次回答' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '从原卷开始，留下自己的思考。', exact: true })).toBeVisible();
});

test('paper practice: an actual login logout and another family cannot reuse a private record or its visible answer', async ({ page, context }) => {
  const f = await fixture(page, 15), row = await f.begin(); await page.goto('/library/practice?session=' + row.id); await page.getByLabel('先写下自己的回答').fill('属于原家庭的私人回答');
  await page.getByRole('button', { name: '提交本题回答', exact: true }).click(); await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toBeVisible();
  expect(await page.evaluate(async base => (await fetch(base + '/auth/logout', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, api)).toBe(201);
  await page.getByRole('button', { name: '核对本题参考答案', exact: true }).click(); await expect(page.getByRole('region', { name: '当前原题与首次回答' })).toHaveCount(0);
  const principal = 'paper-other-' + randomUUID(), credential = 'Synthetic-other-family-20261026', other = await f.call('/auth/register', { principal, credential }, '');
  await f.call('/library/practice/sessions/' + row.id, undefined, other.token, 403); await context.clearCookies(); await page.goto('/parent/login');
  await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential); await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await page.goto('/library/practice?session=' + row.id); await expect(page.locator('.pp-shell').getByRole('alert')).toBeVisible();
  await expect(page.getByText('属于原家庭的私人回答', { exact: true })).toHaveCount(0); await expect(page.getByLabel('先写下自己的回答')).toHaveCount(0);
});

test('paper practice: an expired original preview can be safely retained and previewed again without duplicating a started record', async ({ page }) => {
  const f = await fixture(page, 16); await page.goto('/library/practice?paper=' + encodeURIComponent(f.papers.complete));
  await page.getByRole('button', { name: '预览这次练习', exact: true }).click(); await expect(page.getByRole('button', { name: '确认范围，开始练习 ↗' })).toBeVisible();
  await f.publish(f.papers.complete, 'withdrawn'); await f.publish(f.papers.complete); await page.getByRole('button', { name: '确认范围，开始练习 ↗' }).click();
  const recovery = page.getByRole('region', { name: '原开始记录恢复' }); await expect(recovery.getByRole('button', { name: '保留原开始记录，重新预览', exact: true })).toBeVisible();
  expect((await f.call('/library/practice/sessions')).total).toBe(0); const downloadEvent = page.waitForEvent('download'); await recovery.getByRole('button', { name: '下载开始记录保护文件' }).click();
  const original = JSON.parse(readFileSync((await (await downloadEvent).path())!, 'utf8')); expect(original.body.selection).toEqual([{ paperId: f.papers.complete }]);
  expect(await f.call('/library/practice/requests/' + original.body.requestKey)).toBeNull(); await recovery.getByRole('button', { name: '保留原开始记录，重新预览', exact: true }).click();
  await expect(recovery).toHaveCount(0); await page.getByRole('button', { name: '预览这次练习', exact: true }).click(); await page.getByRole('button', { name: '确认范围，开始练习 ↗' }).click();
  await expect(page.getByLabel('先写下自己的回答')).toBeVisible(); expect((await f.call('/library/practice/sessions')).total).toBe(1);
  expect(await page.evaluate(key => Object.entries(localStorage).some(([name, value]) => name.startsWith('study.paper-practice.start:') && JSON.parse(value).body?.requestKey === key), original.body.requestKey)).toBe(true);
});

test('recovery: paper practice retains an uncommitted original start through three actual refreshes before one explicit retry', async ({ page }) => {
  const f = await fixture(page, 17); await page.goto('/library/practice?paper=' + encodeURIComponent(f.papers.complete)); await page.getByRole('button', { name: '预览这次练习', exact: true }).click();
  let original: any;
  await page.route('**/api/library/practice/sessions', async route => { if (route.request().method() === 'POST' && !original) { original = route.request().postDataJSON(); return route.abort('failed'); } await route.continue(); });
  await page.getByRole('button', { name: '确认范围，开始练习 ↗' }).click(); await expect.poll(() => Boolean(original)).toBe(true);
  for (let refresh = 0; refresh < 3; refresh++) { await page.reload(); await expect(page.getByRole('region', { name: '原开始记录恢复' })).toBeVisible(); expect(await f.call('/library/practice/requests/' + original.requestKey)).toBeNull(); }
  expect((await f.call('/library/practice/sessions')).total).toBe(0); await page.getByRole('button', { name: '继续核对原开始记录 ↗', exact: true }).click();
  await expect(page.getByLabel('先写下自己的回答')).toBeVisible(); const receipt = await f.call('/library/practice/requests/' + original.requestKey);
  expect(new URL(page.url()).searchParams.get('session')).toBe(receipt.session.id); expect((await f.call('/library/practice/sessions')).total).toBe(1);
});

test('paper review: a completed first answer leads through real reflection, actual review and the stable local-date calendar', async ({ page }) => {
  const f = await fixture(page, 22); let row = await f.begin(); const itemId = row.items[0].id;
  row = (await f.call('/library/practice/sessions/' + row.id + '/commands', { expectedVersion: row.version, requestKey: randomUUID(), kind: 'submit', itemId, disposition: 'dont_know', text: '原首答保留' })).session;
  row = (await f.call('/library/practice/sessions/' + row.id + '/commands', { expectedVersion: row.version, requestKey: randomUUID(), kind: 'complete', acknowledgeUnanswered: true })).session;
  await page.goto('/library/practice/review?session=' + row.id + '&item=' + itemId);
  const editor = page.getByRole('region', { name: '原卷复习与反思' }); await expect(editor.getByLabel('我的反思')).toBeEnabled();
  await editor.getByLabel('标签，用逗号分隔').pressSequentially('读题，单位'); await expect(editor.getByLabel('标签，用逗号分隔')).toHaveValue('读题，单位');
  await editor.getByLabel('具体错误步骤').fill('没有统一长度单位'); await editor.getByLabel('我的反思').fill('先检查单位，再写计算过程。'); await editor.getByLabel('计划回看日期').fill('2026-11-09');
  await editor.getByRole('button', { name: '保存反思与安排', exact: true }).click(); await expect(editor.getByText('完整整理历史 · 1 次', { exact: true })).toBeVisible();
  const saved = await f.call('/library/practice/sessions/' + row.id + '/items/' + itemId); expect(saved.firstAnswer.text).toBe('原首答保留'); expect(saved.organization).toMatchObject({ tags: ['单位', '读题'], reflection: '先检查单位，再写计算过程。', plannedDate: '2026-11-09' }); expect(saved.reference).toBeNull();
  await editor.getByRole('button', { name: '我已实际回看', exact: true }).click(); await expect(editor.getByRole('button', { name: '重新放回待复习', exact: true })).toBeEnabled();
  await page.goto('/library/practice/review?filter=reviewed&q=' + encodeURIComponent('先检查单位'));
  await expect(page.getByRole('link', { name: /匿名原卷 22.*第 1 题/ })).toBeVisible(); await page.getByLabel('复习月份').fill('2026-11');
  const calendar = page.getByRole('region', { name: '原卷复习日历' }); await expect(calendar.getByRole('link', { name: /2026-11-09.*匿名原卷 22/ })).toBeVisible();
  const download = page.waitForEvent('download'); await calendar.getByRole('button', { name: '导出本月复习 ICS' }).click(); const exported = await download;
  const content = readFileSync((await exported.path())!, 'utf8'); expect(content).toContain('DTSTART;VALUE=DATE:20261109'); expect(content).not.toContain('先检查单位');
});

test('recovery: paper review: a lost organization receipt is recovered after three reloads without duplicating history or clearing later reflection', async ({ page }) => {
  const f = await fixture(page, 23), row = await f.begin(), itemId = row.items[0].id; await page.goto('/library/practice/review?session=' + row.id + '&item=' + itemId);
  const editor = page.getByRole('region', { name: '原卷复习与反思' }); await expect(editor.getByLabel('我的反思')).toBeEnabled(); await editor.getByLabel('我的反思').fill('离线丢回执仍保留同一次反思。'); let captured: any;
  await page.route('**/api/library/practice/sessions/*/commands', async route => { if (route.request().method() === 'POST' && route.request().postDataJSON()?.kind === 'organize' && !captured) { captured = route.request().postDataJSON(); await route.fetch(); return route.abort('failed'); } await route.continue(); });
  await editor.getByRole('button', { name: '保存反思与安排', exact: true }).click(); await expect(page.getByRole('region', { name: '整理原操作恢复' }).getByRole('button', { name: '核对或重试整理原操作' })).toBeEnabled();
  for (let index = 0; index < 3; index++) { await page.reload(); await expect(page.getByRole('region', { name: '整理原操作恢复' })).toHaveCount(0); await expect(editor.getByLabel('我的反思')).toHaveValue('离线丢回执仍保留同一次反思。'); }
  expect((await f.call('/library/practice/sessions/' + row.id + '/items/' + itemId)).organization.history).toHaveLength(1);
  await editor.getByLabel('我的反思').fill('确认之后继续写的新反思。'); for (let index = 0; index < 3; index++) { await page.reload(); await expect(editor.getByLabel('我的反思')).toHaveValue('确认之后继续写的新反思。'); }
  await editor.getByRole('button', { name: '保存反思与安排', exact: true }).click(); await expect(editor.getByText('完整整理历史 · 2 次', { exact: true })).toBeVisible();
  const result = await f.call('/library/practice/sessions/' + row.id + '/items/' + itemId); expect(result.organization.reflection).toBe('确认之后继续写的新反思。'); expect(result.organization.history).toHaveLength(2);
});

test('paper review: two real pages compare conflicting reflection drafts before saving a new command', async ({ page, context }) => {
  const f = await fixture(page, 24), row = await f.begin(), itemId = row.items[0].id, url = '/library/practice/review?session=' + row.id + '&item=' + itemId;
  await page.goto(url); const second = await context.newPage(); await second.goto(url);
  const firstEditor = page.getByRole('region', { name: '原卷复习与反思' }), secondEditor = second.getByRole('region', { name: '原卷复习与反思' });
  await expect(firstEditor.getByLabel('我的反思')).toBeEnabled(); await expect(secondEditor.getByLabel('我的反思')).toBeEnabled();
  await firstEditor.getByLabel('我的反思').fill('第一页已保存的判断。'); await secondEditor.getByLabel('我的反思').fill('第二页保留的另一种判断。');
  await firstEditor.getByRole('button', { name: '保存反思与安排', exact: true }).click(); await expect(firstEditor.getByText('完整整理历史 · 1 次', { exact: true })).toBeVisible();
  await secondEditor.getByRole('button', { name: '保存反思与安排', exact: true }).click(); await expect(secondEditor.getByRole('alert')).toBeVisible();
  expect((await f.call('/library/practice/sessions/' + row.id + '/items/' + itemId)).organization.reflection).toBe('第一页已保存的判断。');
  await secondEditor.getByRole('button', { name: '保留冲突文件，读取最新版本' }).click(); await expect(secondEditor.getByText('服务器反思：第一页已保存的判断。', { exact: true })).toBeVisible();
  await secondEditor.getByRole('button', { name: '保留本机反思，按当前版本继续' }).click(); await expect(secondEditor.getByLabel('我的反思')).toHaveValue('第二页保留的另一种判断。');
  await secondEditor.getByRole('button', { name: '保存反思与安排', exact: true }).click(); await expect(secondEditor.getByText('完整整理历史 · 2 次', { exact: true })).toBeVisible();
  const saved = await f.call('/library/practice/sessions/' + row.id + '/items/' + itemId); expect(saved.organization.reflection).toBe('第二页保留的另一种判断。'); expect(saved.organization.history).toHaveLength(2); await second.close();
});

for (const width of [390, 768, 1440]) test('paper review: current item, full reflection and protected calendar fit ' + width, async ({ page }) => {
  const f = await fixture(page, width === 390 ? 25 : width === 768 ? 26 : 27); let row = await f.begin(); const itemId = row.items[0].id;
  row = (await f.call('/library/practice/sessions/' + row.id + '/commands', { expectedVersion: row.version, requestKey: randomUUID(), kind: 'submit', itemId, disposition: 'dont_know', text: '' })).session;
  await f.call('/library/practice/sessions/' + row.id + '/commands', { expectedVersion: row.version, requestKey: randomUUID(), kind: 'organize', itemId, values: { tags: ['合成原题'], favorite: true, archived: false, errorSteps: '需要重新核对所给条件', reflection: '一份完整、可继续修改的合成反思。', plannedDate: '2026-11-09' } });
  await page.setViewportSize({ width, height: 1000 }); await page.goto('/library/practice/review'); await expect(page.getByRole('link', { name: /匿名原卷.*第 1 题/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true); await page.screenshot({ path: join(browserEvidence('paper-practice'), 'review-workspace-' + width + '.png'), fullPage: true });
  await page.getByRole('link', { name: /匿名原卷.*第 1 题/ }).click(); const editor = page.getByRole('region', { name: '原卷复习与反思' }); await expect(editor.getByLabel('我的反思')).toHaveValue('一份完整、可继续修改的合成反思。');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('paper review next: an original redo retains its source and recovers the exact new attempt after a lost creation receipt', async ({ page }) => {
  const f = await fixture(page, 28); let original = await f.begin(); const itemId = original.items[0].id;
  original = (await f.call('/library/practice/sessions/' + original.id + '/commands', { expectedVersion: original.version, requestKey: randomUUID(), kind: 'submit', itemId, disposition: 'answered', text: '再练前必须保留的第一次回答。' })).session;
  await page.goto('/library/practice/review?session=' + original.id + '&item=' + itemId); const next = page.getByRole('region', { name: '原题再练与独立新题' });
  await expect(next.getByRole('link', { name: '查看学习范围，手动选择知识点 ↗' })).toBeVisible();
  await next.getByRole('link', { name: '核对来源，再练原题 ↗' }).click(); await expect(page.getByRole('region', { name: '确认原卷练习' })).toContainText('本次只再练同一道原题');
  await page.getByRole('button', { name: '预览这次练习', exact: true }).click(); let captured: any;
  await page.route('**/api/library/practice/sessions', async route => { if (route.request().method() === 'POST' && !captured) { captured = route.request().postDataJSON(); await route.fetch(); return route.abort('failed'); } await route.continue(); });
  await page.getByRole('button', { name: '确认范围，开始练习 ↗' }).click(); await expect.poll(() => Boolean(captured)).toBe(true);
  const receipt = await f.call('/library/practice/requests/' + captured.requestKey); expect(receipt.session.origin).toMatchObject({ sessionId: original.id, itemId });
  await page.reload(); await page.getByRole('link', { name: '继续上次已保存的练习 ↗', exact: true }).click();
  await expect(page.getByRole('region', { name: '原题再练来源' })).toContainText('重复正确仍需独立新题验证');
  expect(new URL(page.url()).searchParams.get('session')).toBe(receipt.session.id); expect((await f.call('/library/practice/sessions')).total).toBe(2);
  await page.getByRole('region', { name: '原题再练来源' }).getByRole('link', { name: '查看原来的首答与反思 ↗' }).click();
  await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toContainText('再练前必须保留的第一次回答。');
});

test('paper review next: a learner confirms scope, restores a lost independent preview and starts only the frozen new group', async ({ page, context }) => {
  const f = await fixture(page, 29), atoms = await f.call('/diagnostics/curriculum?subject=math&grade=3&term=upper');
  const atom = atoms.find((atom: any) => /加法|加减|合并/.test(atom.name) && atom.status === 'published'); expect(atom, 'Existing authored addition target required').toBeTruthy();
  const staged = await f.call('/measurement-content/candidates', { paperId: f.papers.complete, positions: [1] }, administrator);
  let candidate = await f.call('/measurement-content/candidates/' + encodeURIComponent(staged.items[0].id), undefined, administrator);
  const draft = { subject: 'math', grade: 3, stem: '合成独立核对：3个球和2个球合起来一共多少个？', answer: 5, analysis: '把两部分3和2合并得到5。', blocks: [],
    answerSchema: { mode: 'numeric_blank', responseShape: { value: 'number' }, validationRules: {}, gradingConfig: {} },
    mapping: { primaryAtomId: atom.id, prerequisiteAtomIds: [], secondaryAtomIds: [], dimension: 'procedure', family: 'qa:browser-review:combine-parts', probeRole: 'anchor', expectedSeconds: 40, difficulty: 1, observationCode: 'part_whole_mismatch', observedSteps: ['确认两组数量并合并得到总量'], rationale: '从这道合成原题明确观察合并数量的过程，不依据反思猜测映射', familyRationale: '受控数量合并任务，与其他组织结构分开，仅用于浏览器流程验证' },
    license: { licenseClass: 'A_INTERNAL', evidence: '题干和原卷由浏览器测试独立构造，仅核对流程与权限' },
    scoringCases: [{ response: 5, expectedScore: 1, rationale: '独立合并3和2得到总量5' }, { response: 1, expectedScore: 0, rationale: '误用减法求差而非合并数量' }] };
  const command = () => ({ expectedVersion: candidate.version, requestKey: randomUUID(), reason: '合成原卷到独立新题的五门审核核对' });
  candidate = await f.call('/measurement-content/candidates/' + encodeURIComponent(candidate.id) + '/draft', { ...command(), draft }, administrator);
  for (const gate of ['source', 'content', 'media', 'scoring', 'mapping']) candidate = await f.call('/measurement-content/candidates/' + encodeURIComponent(candidate.id) + '/reviews', { ...command(), gate, decision: 'approved' }, administrator);
  const published = await f.call('/measurement-content/candidates/' + encodeURIComponent(candidate.id) + '/publish', command(), administrator);
  const child = (await f.call('/students', { nickname: '合成原卷新题孩子', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile.id;
  await f.call('/students/' + child + '/learning-scope', { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null, textbookVersion: '原创已学范围', learnedAtomIds: [atom.id], currentAtomId: atom.id, minutesPerSession: 15 }, f.actor.token, 200, 'PUT');
  await f.call('/students/' + child + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '独立原卷浏览器学生入口核对' });
  const issued = await f.call('/students/' + child + '/learning-access/codes', { expectedVersion: 1, requestKey: randomUUID() });
  await context.clearCookies(); await page.goto('/student/login'); await page.getByLabel('一次性学习码').fill(issued.code); await page.getByRole('button', { name: '进入我的学习 →', exact: true }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await page.goto('/library/practice?paper=' + encodeURIComponent(f.papers.complete) + '&positions=1'); await page.getByRole('button', { name: '预览这次练习', exact: true }).click(); await page.getByRole('button', { name: '确认范围，开始练习 ↗' }).click();
  await page.getByRole('button', { name: '暂时不会', exact: true }).click(); await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toContainText('暂时不会');
  const sourceSession = new URL(page.url()).searchParams.get('session')!, source = await f.call('/library/practice/sessions/' + sourceSession), sourceItem = source.items[0].id;
  const next = page.getByRole('region', { name: '原题再练与独立新题' }); await expect(next.getByLabel('验证的孩子')).toHaveValue(child); await expect(next).toContainText('此知识点在已确认的已学范围内。');
  await next.getByLabel('我已核对这位孩子的当前年级、教材和已学范围').check(); let captured: any;
  await page.route('**/api/library/practice/sessions/*/items/*/verification-preview', async route => { if (!captured) { captured = route.request().postDataJSON(); await route.fetch(); return route.abort('failed'); } await route.continue(); });
  await next.getByRole('button', { name: '预览独立新题蓝图', exact: true }).click(); await expect(page.getByRole('region', { name: '独立新题原预览恢复' }).getByRole('button', { name: '核对或重试原新题预览' })).toBeEnabled();
  for (let index = 0; index < 3; index++) { await page.reload(); await expect(next.getByRole('link', { name: '打开原蓝图，确认后开始 ↗' })).toBeVisible(); }
  expect((await f.call('/diagnostics/sessions?studentId=' + child + '&subject=math')).length).toBe(0);
  await next.getByRole('link', { name: '打开原蓝图，确认后开始 ↗' }).click(); await expect(page.getByRole('region', { name: '独立新题的原卷来源' })).toBeVisible();
  await page.getByRole('button', { name: '准备好了，开始这一组 →', exact: true }).click(); await expect(page).toHaveURL(/session=/);
  const activeId = new URL(page.url()).searchParams.get('session')!, active = await f.call('/diagnostics/sessions/' + activeId); expect(active.items.map((item: any) => item.questionId)).not.toContain(published.questionId);
  expect(active.paperReviewOrigin).toMatchObject({ sessionId: sourceSession, itemId: sourceItem });
  await page.getByRole('region', { name: '独立新题的原卷来源' }).getByRole('link', { name: '返回原首答与反思 ↗' }).click();
  const options = await f.call('/library/practice/sessions/' + sourceSession + '/items/' + sourceItem + '/next-options'); expect(options.activities.filter((activity: any) => activity.kind === 'verification')).toHaveLength(1);
  await expect(page.getByRole('region', { name: '原题再练与独立新题' }).getByText('这次原题之后的实际活动 · 1 条', { exact: true })).toBeVisible();
});

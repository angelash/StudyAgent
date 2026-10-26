# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: paper-practice.spec.ts >> recovery: paper practice offline draft saving and a refresh retain the full original command until explicit retry
- Location: tests\e2e\paper-practice.spec.ts:79:5

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator:  getByLabel('先写下自己的回答')
Expected: "离线时仍保留完整思考，不自动提交首答。"
Received: ""
Timeout:  15000ms

Call log:
  - Expect "toHaveValue" getByLabel('先写下自己的回答') with timeout 15000ms
  - waiting for getByLabel('先写下自己的回答')
    32 × locator resolved to <textarea rows="6" maxlength="24000" id="pp-answer-input" placeholder="写下你的选择、过程或解释。先保留自己的思考，再核对参考。"></textarea>
       - unexpected value ""

```

```yaml
- textbox "先写下自己的回答":
  - /placeholder: 写下你的选择、过程或解释。先保留自己的思考，再核对参考。
```

# Test source

```ts
  1   | import { expect, test, type Page } from '@playwright/test';
  2   | import { createHash, randomUUID } from 'node:crypto';
  3   | import { readFileSync, writeFileSync } from 'node:fs';
  4   | import { join } from 'node:path';
  5   | import { browserEvidence } from './evidence';
  6   | 
  7   | const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107') + '/api';
  8   | let administrator: string | undefined;
  9   | test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });
  10  | async function fixture(page: Page, slot: number) {
  11  |   const digest = createHash('sha256').update(test.info().testId).digest(), address = '198.19.' + digest[0] + '.' + digest[1];
  12  |   const principal = 'paper-browser-' + randomUUID(), credential = 'Synthetic-Paper-Browser-20261026'; let token = '';
  13  |   await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address });
  14  |   async function call(path: string, body?: unknown, actor = token, status = body === undefined ? 200 : 201) {
  15  |     const response = await fetch(api + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address,
  16  |       ...(actor ? { Authorization: 'Bearer ' + actor } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  17  |     const result = await response.json(); expect(response.status, path + ': ' + JSON.stringify(result.error)).toBe(status); return result.data;
  18  |   }
  19  |   const actor = await call('/auth/register', { principal, credential }); token = actor.token;
  20  |   if (!administrator) administrator = (await call('/auth/login', { principal: process.env.E2E_ADMIN_PRINCIPAL ?? 'browser-admin', credential: process.env.E2E_ADMIN_PASSWORD ?? 'Browser-admin-only-20261021' }, '')).token;
  21  |   const papers = { complete: 'qa:paper:' + slot + ':complete', partial: 'qa:paper:' + slot + ':partial', pdf: 'qa:paper:' + slot + ':pdf' };
  22  |   async function publish(id: string, status = 'published') { return call('/library/papers/' + encodeURIComponent(id) + '/publication', { status, reason: '浏览器合成原创资料逐项核对', licenseEvidence: '当前题干与媒体全部为独立测试构造', contentReviewed: true, mediaReviewed: true }, administrator); }
  23  |   for (const paper of Object.values(papers)) await publish(paper);
  24  |   await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential); await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  25  |   async function begin(paper = papers.complete) { const selection = [{ paperId: paper }], preview = await call('/library/practice/preview', { selection }); return call('/library/practice/sessions', { selection, sourceHash: preview.sourceHash, requestKey: randomUUID() }); }
  26  |   return { call, actor, papers, publish, begin };
  27  | }
  28  | 
  29  | test('paper practice: actual original-paper entry keeps the first answer, explicit reference, correction and completed review', async ({ page }) => {
  30  |   await page.setViewportSize({ width: 1440, height: 1000 }); const f = await fixture(page, 0);
  31  |   await page.goto('/library?paper=' + encodeURIComponent(f.papers.partial));
  32  |   await expect(page.getByRole('region', { name: '题卷练习入口' })).toBeVisible(); await page.getByRole('link', { name: '整卷练习 ↗', exact: true }).click();
  33  |   await page.getByRole('button', { name: '预览这次练习', exact: true }).click(); await expect(page.getByRole('region', { name: '确认原卷练习' })).toContainText('1 个缺题位');
  34  |   expect((await f.call('/library/practice/sessions')).total).toBe(0);
  35  |   await page.getByRole('button', { name: '确认范围，开始练习 ↗' }).click(); await expect(page).toHaveURL(/\/library\/practice\?session=/);
  36  |   const current = page.getByRole('region', { name: '当前原题与首次回答' }), input = page.getByLabel('先写下自己的回答');
  37  |   await expect(input).toBeVisible(); await expect(page.getByText('合成原参考：5', { exact: true })).toHaveCount(0);
  38  |   await input.fill('第一次我认为是4。'); await page.getByRole('button', { name: '提交本题回答', exact: true }).click();
  39  |   await expect(current.getByRole('region', { name: '不可覆盖的首次回答' })).toContainText('第一次我认为是4。');
  40  |   await page.getByRole('button', { name: '核对本题参考答案', exact: true }).click(); await expect(current.getByRole('region', { name: '本题原参考与自评' })).toContainText('合成原参考：5');
  41  |   await page.getByRole('button', { name: '还需订正', exact: true }).click(); await page.getByLabel('追加订正', { exact: true }).fill('订正：将3和2合起来是5。');
  42  |   await page.getByRole('button', { name: '保存这次订正', exact: true }).click(); await expect(page.getByRole('region', { name: '追加订正记录' })).toContainText('订正：将3和2合起来是5。');
  43  |   const id = new URL(page.url()).searchParams.get('session')!, saved = await f.call('/library/practice/sessions/' + id);
  44  |   const original = await f.call('/library/practice/sessions/' + id + '/items/' + saved.items[0].id); expect(original.firstAnswer.text).toBe('第一次我认为是4。'); expect(original.corrections).toHaveLength(1);
  45  |   await page.getByRole('button', { name: '下一题位 ↗', exact: true }).click(); await expect(current.getByRole('heading', { name: '第 2 题', exact: true })).toBeVisible();
  46  |   await page.getByRole('button', { name: '暂时不会', exact: true }).click(); await expect(current.getByRole('region', { name: '不可覆盖的首次回答' })).toContainText('暂时不会');
  47  |   await page.getByRole('button', { name: '结束并复盘', exact: true }).click(); const confirmation = page.getByRole('alertdialog'); await expect(confirmation).toBeVisible();
  48  |   await confirmation.getByRole('button', { name: '确认结束，查看复盘' }).click(); await expect(page.getByText('原卷复盘', { exact: true })).toBeVisible();
  49  |   expect((await f.call('/library/practice/sessions/' + id)).counts).toMatchObject({ submitted: 2, missing: 1, dontKnow: 1, needsCorrection: 1 });
  50  |   await page.screenshot({ path: join(browserEvidence('paper-practice'), 'actual-completed-review.png'), fullPage: true }); writeFileSync(join(browserEvidence('paper-practice'), 'actual-first-answer-and-correction.json'), JSON.stringify(original, null, 2) + '\n');
  51  | });
  52  | 
  53  | test('paper practice: a lost first-answer receipt recovers the same command after actual refresh without submitting twice', async ({ page }) => {
  54  |   const f = await fixture(page, 1), row = await f.begin(); await page.goto('/library/practice?session=' + row.id);
  55  |   await page.getByLabel('先写下自己的回答').fill('丢回执也保留同一份首次回答。'); let intercepted = false;
  56  |   await page.route('**/api/library/practice/sessions/*/commands', async route => {
  57  |     const body = route.request().postDataJSON(); if (body.kind !== 'submit' || intercepted) return route.continue(); intercepted = true;
  58  |     const response = await route.fetch(); expect(response.status()).toBe(201); await route.abort('failed');
  59  |   });
  60  |   await page.getByRole('button', { name: '提交本题回答', exact: true }).click(); await expect(page.getByRole('region', { name: '原操作恢复' })).toBeVisible();
  61  |   await expect.poll(async () => (await f.call('/library/practice/sessions/' + row.id)).version).toBe(2);
  62  |   page.once('dialog', dialog => dialog.accept()); await page.reload(); await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toContainText('丢回执也保留同一份首次回答。');
  63  |   await expect(page.getByRole('region', { name: '原操作恢复' })).toHaveCount(0); expect((await f.call('/library/practice/sessions/' + row.id)).version).toBe(2);
  64  | });
  65  | 
  66  | test('paper practice: a lost creation acknowledgment restores the original started session with read-only receipt checks', async ({ page }) => {
  67  |   const f = await fixture(page, 2); await page.goto('/library/practice?paper=' + encodeURIComponent(f.papers.complete));
  68  |   await page.getByRole('button', { name: '预览这次练习', exact: true }).click(); let finished = false;
  69  |   await page.route('**/api/library/practice/sessions', async route => {
  70  |     if (route.request().method() !== 'POST') return route.continue(); const response = await route.fetch(); expect(response.status()).toBe(201); finished = true; await route.abort('failed');
  71  |   });
  72  |   await page.getByRole('button', { name: '确认范围，开始练习 ↗' }).click(); await expect.poll(() => finished).toBe(true);
  73  |   await expect.poll(async () => (await f.call('/library/practice/sessions')).total).toBe(1);
  74  |   await page.reload(); await expect(page.getByRole('link', { name: '继续上次已保存的练习 ↗' })).toBeVisible();
  75  |   await expect(page.getByRole('region', { name: '原开始记录恢复' })).toHaveCount(0); await page.getByRole('link', { name: '继续上次已保存的练习 ↗' }).click();
  76  |   await expect(page.getByLabel('先写下自己的回答')).toBeVisible(); expect((await f.call('/library/practice/sessions')).total).toBe(1);
  77  | });
  78  | 
  79  | test('recovery: paper practice offline draft saving and a refresh retain the full original command until explicit retry', async ({ page, context }) => {
  80  |   const f = await fixture(page, 3), row = await f.begin(); await page.goto('/library/practice?session=' + row.id);
  81  |   await page.getByLabel('先写下自己的回答').fill('离线时仍保留完整思考，不自动提交首答。'); await context.setOffline(true);
  82  |   await page.getByRole('button', { name: '保存草稿', exact: true }).click(); await expect(page.locator('.pp-shell').getByRole('alert')).toContainText('无法连接');
  83  |   await context.setOffline(false);
  84  |   for (let refresh = 0; refresh < 3; refresh++) {
  85  |     page.once('dialog', dialog => dialog.accept()); await page.reload();
> 86  |     await expect(page.getByLabel('先写下自己的回答')).toHaveValue('离线时仍保留完整思考，不自动提交首答。');
      |                                               ^ Error: expect(locator).toHaveValue(expected) failed
  87  |     await expect(page.getByRole('region', { name: '原操作恢复' })).toBeVisible();
  88  |   }
  89  |   expect((await f.call('/library/practice/sessions/' + row.id)).version).toBe(1);
  90  |   await page.getByRole('button', { name: '核对或重试原操作', exact: true }).click(); await expect(page.getByRole('region', { name: '原操作恢复' })).toHaveCount(0);
  91  |   const saved = await f.call('/library/practice/sessions/' + row.id + '/items/' + row.items[0].id); expect(saved.draft).toBe('离线时仍保留完整思考，不自动提交首答。'); expect(saved.firstAnswer).toBeNull();
  92  | });
  93  | 
  94  | test('paper practice: two actual pages preserve different local drafts and resolve a server conflict without overwriting the other copy', async ({ page, context }) => {
  95  |   const f = await fixture(page, 4), row = await f.begin(), second = await context.newPage();
  96  |   try {
  97  |     await page.goto('/library/practice?session=' + row.id); await second.goto('/library/practice?session=' + row.id);
  98  |     await page.getByLabel('先写下自己的回答').fill('第一页自己的完整想法'); await second.getByLabel('先写下自己的回答').fill('第二页另一份完整想法');
  99  |     await page.getByRole('button', { name: '保存草稿', exact: true }).click(); await expect(page.getByRole('region', { name: '原操作恢复' })).toHaveCount(0);
  100 |     await expect.poll(async () => (await f.call('/library/practice/sessions/' + row.id)).version).toBe(2);
  101 |     await second.getByRole('button', { name: '保存草稿', exact: true }).click(); const conflict = second.getByRole('region', { name: '本机与服务器草稿冲突' });
  102 |     await expect(conflict).toBeVisible(); await expect(conflict.getByLabel('本机保留的内容')).toHaveValue('第二页另一份完整想法'); await expect(conflict.getByLabel('当前服务器记录')).toHaveValue('第一页自己的完整想法');
  103 |     const download = second.waitForEvent('download'); await second.getByRole('button', { name: '保留冲突文件，核对最新版本' }).click(); expect((await download).suggestedFilename()).toContain('冲突');
  104 |     await conflict.getByRole('button', { name: '保留本机内容继续编辑' }).click(); await second.getByRole('button', { name: '保存草稿', exact: true }).click();
  105 |     await expect.poll(async () => (await f.call('/library/practice/sessions/' + row.id)).version).toBe(3);
  106 |     await page.reload(); await expect(page.getByRole('region', { name: '本机与服务器草稿冲突' })).toBeVisible();
  107 |     const localValues = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('study.paper-practice.draft:')).map(([, value]) => JSON.parse(value).text));
  108 |     expect(localValues).toContain('第一页自己的完整想法'); expect(localValues).toContain('第二页另一份完整想法');
  109 |   } finally { await second.close(); }
  110 | });
  111 | 
  112 | test('paper practice: rejected local persistence sends no answer until a real recovery download and explicit protection acknowledgment', async ({ page }) => {
  113 |   const f = await fixture(page, 5), row = await f.begin();
  114 |   await page.addInitScript(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key.startsWith('study.paper-practice.')) throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); return original.call(this, key, value); }; });
  115 |   await page.goto('/library/practice?session=' + row.id); await page.getByLabel('先写下自己的回答').fill('必须先保护这份回答。');
  116 |   await page.getByRole('button', { name: '提交本题回答', exact: true }).click(); const recovery = page.getByRole('region', { name: '原操作恢复' }); await expect(recovery).toBeVisible();
  117 |   await expect(recovery.getByRole('button', { name: '核对或重试原操作', exact: true })).toBeDisabled(); expect((await f.call('/library/practice/sessions/' + row.id)).version).toBe(1);
  118 |   const event = page.waitForEvent('download'); await recovery.getByRole('button', { name: '下载原操作保护文件' }).click(); const download = await event;
  119 |   const body = JSON.parse(readFileSync((await download.path())!, 'utf8')); expect(body.body.text).toBe('必须先保护这份回答。');
  120 |   await recovery.getByLabel('我已另外保留完整恢复文件').check(); await recovery.getByRole('button', { name: '核对或重试原操作', exact: true }).click();
  121 |   await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toContainText('必须先保护这份回答。'); expect((await f.call('/library/practice/sessions/' + row.id)).version).toBe(2);
  122 | });
  123 | 
  124 | test('paper practice: an actual original PDF stays an unsplit document with its own persistent response', async ({ page }) => {
  125 |   const f = await fixture(page, 6); await page.goto('/library/practice?paper=' + encodeURIComponent(f.papers.pdf));
  126 |   await page.getByRole('button', { name: '预览这次练习', exact: true }).click(); await expect(page.getByRole('region', { name: '确认原卷练习' })).toContainText('未逐题切分');
  127 |   await page.getByRole('button', { name: '确认范围，开始练习 ↗' }).click(); await expect(page.getByRole('heading', { name: '整卷作答笔记', exact: true })).toBeVisible();
  128 |   const document = page.locator('iframe[title="原始试卷 PDF"]'); await expect(document).toBeVisible(); expect(await document.getAttribute('src')).toContain('/api/library/media?');
  129 |   await page.getByLabel('先写下自己的回答').fill('第1题：我先比较了条件，再写出整卷记录。'); await page.getByRole('button', { name: '提交本题回答', exact: true }).click();
  130 |   await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toContainText('第1题：我先比较了条件');
  131 |   const id = new URL(page.url()).searchParams.get('session')!, saved = await f.call('/library/practice/sessions/' + id); expect(saved.items).toHaveLength(1); expect(saved.items[0].kind).toBe('document'); expect(saved).not.toHaveProperty('score');
  132 | });
  133 | 
  134 | test('paper practice: actual publication withdrawal hides the frozen question and reference while retaining the learner response', async ({ page }) => {
  135 |   const f = await fixture(page, 7), row = await f.begin(); await page.goto('/library/practice?session=' + row.id);
  136 |   await page.getByLabel('先写下自己的回答').fill('原卷撤回前的独立文字。'); await page.getByRole('button', { name: '提交本题回答', exact: true }).click();
  137 |   await page.getByRole('button', { name: '核对本题参考答案', exact: true }).click(); await expect(page.getByRole('region', { name: '本题原参考与自评' })).toBeVisible();
  138 |   await f.publish(f.papers.complete, 'withdrawn'); await page.reload(); await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toContainText('原卷撤回前的独立文字。');
  139 |   await expect(page.getByRole('region', { name: '当前原题与首次回答' })).toContainText('已撤回'); await expect(page.getByRole('region', { name: '本题原参考与自评' })).toHaveCount(0);
  140 |   await expect(page.getByRole('button', { name: '核对本题参考答案', exact: true })).toHaveCount(0); await expect(page.getByText('合成原题：', { exact: false })).toHaveCount(0);
  141 | });
  142 | 
  143 | test('paper practice: completed review permits explicit reference reading without changing the original response or reopening correction', async ({ page }) => {
  144 |   const f = await fixture(page, 8), row = await f.begin(); await page.goto('/library/practice?session=' + row.id);
  145 |   await page.getByLabel('先写下自己的回答').fill('结束前的真实原答。'); await page.getByRole('button', { name: '提交本题回答', exact: true }).click();
  146 |   await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toBeVisible(); await page.getByRole('button', { name: '结束并复盘', exact: true }).click();
  147 |   await page.getByRole('alertdialog').getByRole('button', { name: '确认结束，查看复盘' }).click(); await expect(page.getByText('原卷复盘', { exact: true })).toBeVisible();
  148 |   await page.getByRole('button', { name: '核对本题参考答案', exact: true }).click(); await expect(page.getByRole('region', { name: '本题原参考与自评' })).toContainText('合成原参考：5');
  149 |   await expect(page.getByLabel('追加订正', { exact: true })).toHaveCount(0); const saved = await f.call('/library/practice/sessions/' + row.id); expect(saved.status).toBe('completed');
  150 |   expect((await f.call('/library/practice/sessions/' + row.id + '/items/' + row.items[0].id)).firstAnswer.text).toBe('结束前的真实原答。');
  151 | });
  152 | 
  153 | for (const [index, width] of [390, 768, 1440].entries()) test('paper practice: original formula/table/image and keyboard completion controls fit ' + width, async ({ page }) => {
  154 |   await page.setViewportSize({ width, height: 1000 }); const f = await fixture(page, 20 + index), row = await f.begin();
  155 |   await page.goto('/library/practice?session=' + row.id); await expect(page.getByLabel('先写下自己的回答')).toBeVisible(); await expect(page.getByRole('table')).toBeVisible();
  156 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  157 |   await page.getByRole('button', { name: '下一题位 ↗', exact: true }).click(); const image = page.getByRole('img', { name: '合成原图', exact: true }); await expect(image).toBeVisible();
  158 |   await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth === 400)).toBe(true);
  159 |   await page.getByRole('button', { name: '结束并复盘', exact: true }).click(); const dialog = page.getByRole('alertdialog'); await expect(dialog.getByRole('button', { name: '继续练习', exact: true })).toBeFocused();
  160 |   await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: '确认结束，查看复盘' })).toBeFocused(); await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', { name: '继续练习', exact: true })).toBeFocused();
  161 |   await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(page.getByRole('button', { name: '结束并复盘', exact: true })).toBeFocused();
  162 |   await page.screenshot({ path: join(browserEvidence('paper-practice'), 'question-image-' + width + '.png'), fullPage: true });
  163 | });
  164 | 
  165 | test('paper practice: selected positions from two actual papers remain in the cross-paper basket and return to their original anchor', async ({ page }) => {
  166 |   const f = await fixture(page, 9);
  167 |   for (const [paper, position] of [[f.papers.complete, 2], [f.papers.partial, 1]] as const) {
  168 |     await page.goto('/library?paper=' + encodeURIComponent(paper)); const launch = page.getByRole('region', { name: '题卷练习入口' });
  169 |     await launch.locator('summary').click(); await launch.getByLabel('第 ' + position + ' 题', { exact: true }).check();
  170 |     await launch.getByRole('button', { name: '把所选题加入跨卷清单', exact: true }).click(); await expect(launch).toContainText('已放入选题清单');
  171 |   }
  172 |   await page.getByRole('link', { name: '预览跨卷清单 · 2 份 ↗', exact: true }).click(); await page.getByRole('button', { name: '预览这次练习', exact: true }).click();
  173 |   await expect(page.getByRole('region', { name: '确认原卷练习' })).toContainText('2 个可作答记录');
  174 |   await page.getByRole('button', { name: '确认范围，开始练习 ↗' }).click(); await expect(page.getByRole('heading', { name: '第 2 题', exact: true })).toBeVisible();
  175 |   const id = new URL(page.url()).searchParams.get('session')!, row = await f.call('/library/practice/sessions/' + id);
  176 |   expect(row.items.map((item: any) => [item.paperId, item.position])).toEqual([[f.papers.complete, 2], [f.papers.partial, 1]]);
  177 |   await page.getByRole('link', { name: '回到原卷题位 ↗' }).click(); await expect(page).toHaveURL(/position=2/);
  178 |   await expect(page.locator('#library-question-2')).toBeInViewport();
  179 | });
  180 | 
  181 | test('recovery: paper practice correction drafts stay with their own item through rapid review, navigation and a real reload', async ({ page }) => {
  182 |   const f = await fixture(page, 10), row = await f.begin(); await page.goto('/library/practice?session=' + row.id);
  183 |   await page.getByLabel('先写下自己的回答').fill('第一题的首答'); await page.getByRole('button', { name: '提交本题回答', exact: true }).click();
  184 |   await page.getByRole('button', { name: '核对本题参考答案', exact: true }).click(); await page.getByRole('button', { name: '还需订正', exact: true }).click();
  185 |   await page.getByLabel('追加订正', { exact: true }).fill('只属于第一题的未保存订正');
  186 |   await page.getByRole('button', { name: '下一题位 ↗', exact: true }).click(); await page.getByLabel('先写下自己的回答').fill('第二题的首答');
```
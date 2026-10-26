# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: paper-practice.spec.ts >> paper practice: actual original-paper entry keeps the first answer, explicit reference, correction and completed review
- Location: tests\e2e\paper-practice.spec.ts:29:5

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '保存这次订正', exact: true })
    - locator resolved to <button disabled class="studio-primary">保存这次订正</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
      - waiting 100ms
    29 × waiting for element to be visible, enabled and stable
       - element is not enabled
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [active] [ref=f3e1]:
  - main [ref=f3e2]:
    - generic [ref=f3e3]:
      - link "学习观察室" [ref=f3e4] [cursor=pointer]:
        - /url: /
        - generic [aria-hidden] [ref=f3e5]: 学
        - text: 学习观察室
      - navigation "主要导航" [ref=f3e6]:
        - link "学习首页" [ref=f3e7] [cursor=pointer]:
          - /url: /learn?subject=math
        - link "学习工作台" [ref=f3e8] [cursor=pointer]:
          - /url: /studio?subject=math
        - link "家长空间" [ref=f3e9] [cursor=pointer]:
          - /url: /parent/dashboard?subject=math
        - link "知识诊断" [ref=f3e10] [cursor=pointer]:
          - /url: /student/assessment?subject=math
        - link "今日学习" [ref=f3e11] [cursor=pointer]:
          - /url: /student/today?subject=math
        - link "题卷资料" [ref=f3e12] [cursor=pointer]:
          - /url: /library?subject=math
      - generic [ref=f3e13]:
        - link "资料管理" [ref=f3e14] [cursor=pointer]:
          - /url: /parent/data
        - button "退出" [ref=f3e15] [cursor=pointer]
    - generic [ref=f3e16]:
      - generic [ref=f3e17]:
        - link "← 我的原卷练习" [ref=f3e18] [cursor=pointer]:
          - /url: /library/practice
        - strong [ref=f3e19]: 原卷练习
        - status [ref=f3e20]: 原记录已读取
      - status [ref=f3e21]: 原操作已保存。
      - generic [ref=f3e22]:
        - generic [ref=f3e23]:
          - generic [ref=f3e24]: 1 / 3
          - paragraph [ref=f3e25]: 已提交记录
        - generic [ref=f3e26]:
          - text: "1"
          - paragraph [ref=f3e27]: 未答
        - generic [ref=f3e28]:
          - text: "1"
          - paragraph [ref=f3e29]: 自评待订正
        - generic [ref=f3e30]:
          - text: "1"
          - paragraph [ref=f3e31]: 缺题或来源不可用
      - paragraph [ref=f3e32]: 这里保留练习与自我核对，不计算未经审核的总分，也不自动改变知识掌握度。
      - generic [ref=f3e33]:
        - complementary "原卷题位目录" [ref=f3e34]:
          - generic [ref=f3e35]:
            - text: 查看范围
            - combobox "查看范围" [ref=f3e36]:
              - option "全部题位" [selected]
              - option "未答"
              - option "待订正"
              - option "暂时不会"
              - option "已跳过"
          - generic [ref=f3e37]:
            - button "匿名原卷 0 · 部分 第 1 题 已回答 · 还需订正" [pressed] [ref=f3e38] [cursor=pointer]:
              - generic [ref=f3e39]: 匿名原卷 0 · 部分
              - strong [ref=f3e40]: 第 1 题
              - generic [ref=f3e41]: 已回答 · 还需订正
            - button "匿名原卷 0 · 部分 第 2 题 尚未作答" [ref=f3e42] [cursor=pointer]:
              - generic [ref=f3e43]: 匿名原卷 0 · 部分
              - strong [ref=f3e44]: 第 2 题
              - generic [ref=f3e45]: 尚未作答
            - button "匿名原卷 0 · 部分 第 3 题 原卷缺题" [ref=f3e46] [cursor=pointer]:
              - generic [ref=f3e47]: 匿名原卷 0 · 部分
              - strong [ref=f3e48]: 第 3 题
              - generic [ref=f3e49]: 原卷缺题
        - region "当前原题与首次回答" [ref=f3e50]:
          - generic [ref=f3e51]:
            - text: 匿名原卷 0 · 部分
            - heading "第 1 题" [level=1] [ref=f3e52]
            - link "回到原卷题位 ↗" [ref=f3e53] [cursor=pointer]:
              - /url: /library?paper=qa%3Apaper%3A0%3Apartial&position=1
          - generic [ref=f3e54]:
            - generic [ref=f3e55]:
              - paragraph [ref=f3e56]:
                - text: 合成原题：
                - generic [ref=f3e58]:
                  - math [ref=f3e60]:
                    - generic [ref=f3e62]:
                      - generic [ref=f3e63]: "3"
                      - generic [ref=f3e64]: +
                      - generic [ref=f3e65]: "2"
                      - generic [ref=f3e66]: =
                      - generic [ref=f3e67]: "?"
                  - generic [aria-hidden] [ref=f3e68]:
                    - generic [ref=f3e69]: 3 +
                    - generic [ref=f3e70]: 2 =
                    - generic [ref=f3e71]: "?"
              - table [ref=f3e72]:
                - rowgroup [ref=f3e73]:
                  - row [ref=f3e74]:
                    - columnheader "第一组" [ref=f3e75]
                    - columnheader "第二组" [ref=f3e76]
                  - row [ref=f3e77]:
                    - cell "3" [ref=f3e78]
                    - cell "2" [ref=f3e79]
            - generic [ref=f3e80]:
              - generic [ref=f3e81]: A
              - paragraph [ref=f3e83]: "4"
            - generic [ref=f3e84]:
              - generic [ref=f3e85]: B
              - paragraph [ref=f3e87]: "5"
          - region "不可覆盖的首次回答" [ref=f3e88]:
            - text: 已回答
            - heading "当时的首次回答" [level=2] [ref=f3e89]
            - paragraph [ref=f3e90]: 第一次我认为是4。
            - time [ref=f3e91]: 2026/10/26 22:40:50
          - region "本题原参考与自评" [ref=f3e92]:
            - heading "对照原参考，再判断。" [level=2] [ref=f3e93]
            - paragraph [ref=f3e95]: 合成原参考：5
            - paragraph [ref=f3e97]: 把第一组的3个和第二组的2个合起来，共5个。首次思考应保留。
            - paragraph [ref=f3e98]: 以下是自己的核对判断，不是客观评分。
            - generic [ref=f3e99]:
              - button "自评符合参考" [ref=f3e100] [cursor=pointer]
              - button "还需订正" [pressed] [ref=f3e101] [cursor=pointer]
              - button "不能确定" [ref=f3e102] [cursor=pointer]
          - region "追加订正记录" [ref=f3e103]:
            - heading "保留第一次，再补充新的理解。" [level=2] [ref=f3e104]
            - generic [ref=f3e105]:
              - text: 追加订正
              - textbox "追加订正" [ref=f3e106]
            - button "保存这次订正" [disabled] [ref=f3e107]
          - generic [ref=f3e108]:
            - button "上一题位" [disabled] [ref=f3e109]
            - button "下一题位 ↗" [ref=f3e110] [cursor=pointer]
      - generic [ref=f3e111]:
        - button "保存位置并暂停" [ref=f3e112] [cursor=pointer]
        - button "结束并复盘" [ref=f3e113] [cursor=pointer]
        - button "下载本机草稿保护文件" [ref=f3e114] [cursor=pointer]
      - button "查看其他本机草稿与原操作" [ref=f3e115] [cursor=pointer]
      - generic [ref=f3e116]:
        - text: 从本次练习保护文件恢复
        - button "从本次练习保护文件恢复" [ref=f3e117]
  - alert [ref=f3e118]
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
> 42  |   await page.getByRole('button', { name: '保存这次订正', exact: true }).click(); await expect(page.getByRole('region', { name: '追加订正记录' })).toContainText('订正：将3和2合起来是5。');
      |                                                                   ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
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
  79  | test('paper practice: offline draft saving and a refresh retain the full original command until explicit retry', async ({ page, context }) => {
  80  |   const f = await fixture(page, 3), row = await f.begin(); await page.goto('/library/practice?session=' + row.id);
  81  |   await page.getByLabel('先写下自己的回答').fill('离线时仍保留完整思考，不自动提交首答。'); await context.setOffline(true);
  82  |   await page.getByRole('button', { name: '保存草稿', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('无法连接');
  83  |   await context.setOffline(false); page.once('dialog', dialog => dialog.accept()); await page.reload();
  84  |   await expect(page.getByLabel('先写下自己的回答')).toHaveValue('离线时仍保留完整思考，不自动提交首答。');
  85  |   expect((await f.call('/library/practice/sessions/' + row.id)).version).toBe(1);
  86  |   await page.getByRole('button', { name: '核对或重试原操作', exact: true }).click(); await expect(page.getByRole('region', { name: '原操作恢复' })).toHaveCount(0);
  87  |   const saved = await f.call('/library/practice/sessions/' + row.id + '/items/' + row.items[0].id); expect(saved.draft).toBe('离线时仍保留完整思考，不自动提交首答。'); expect(saved.firstAnswer).toBeNull();
  88  | });
  89  | 
  90  | test('paper practice: two actual pages preserve different local drafts and resolve a server conflict without overwriting the other copy', async ({ page, context }) => {
  91  |   const f = await fixture(page, 4), row = await f.begin(), second = await context.newPage();
  92  |   try {
  93  |     await page.goto('/library/practice?session=' + row.id); await second.goto('/library/practice?session=' + row.id);
  94  |     await page.getByLabel('先写下自己的回答').fill('第一页自己的完整想法'); await second.getByLabel('先写下自己的回答').fill('第二页另一份完整想法');
  95  |     await page.getByRole('button', { name: '保存草稿', exact: true }).click(); await expect(page.getByRole('region', { name: '原操作恢复' })).toHaveCount(0);
  96  |     await expect.poll(async () => (await f.call('/library/practice/sessions/' + row.id)).version).toBe(2);
  97  |     await second.getByRole('button', { name: '保存草稿', exact: true }).click(); const conflict = second.getByRole('region', { name: '本机与服务器草稿冲突' });
  98  |     await expect(conflict).toBeVisible(); await expect(conflict.getByLabel('本机保留的内容')).toHaveValue('第二页另一份完整想法'); await expect(conflict.getByLabel('当前服务器记录')).toHaveValue('第一页自己的完整想法');
  99  |     const download = second.waitForEvent('download'); await second.getByRole('button', { name: '保留冲突文件，核对最新版本' }).click(); expect((await download).suggestedFilename()).toContain('冲突');
  100 |     await conflict.getByRole('button', { name: '保留本机内容继续编辑' }).click(); await second.getByRole('button', { name: '保存草稿', exact: true }).click();
  101 |     await expect.poll(async () => (await f.call('/library/practice/sessions/' + row.id)).version).toBe(3);
  102 |     await page.reload(); await expect(page.getByRole('region', { name: '本机与服务器草稿冲突' })).toBeVisible();
  103 |     const localValues = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('study.paper-practice.draft:')).map(([, value]) => JSON.parse(value).text));
  104 |     expect(localValues).toContain('第一页自己的完整想法'); expect(localValues).toContain('第二页另一份完整想法');
  105 |   } finally { await second.close(); }
  106 | });
  107 | 
  108 | test('paper practice: rejected local persistence sends no answer until a real recovery download and explicit protection acknowledgment', async ({ page }) => {
  109 |   const f = await fixture(page, 5), row = await f.begin();
  110 |   await page.addInitScript(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key.startsWith('study.paper-practice.')) throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); return original.call(this, key, value); }; });
  111 |   await page.goto('/library/practice?session=' + row.id); await page.getByLabel('先写下自己的回答').fill('必须先保护这份回答。');
  112 |   await page.getByRole('button', { name: '提交本题回答', exact: true }).click(); const recovery = page.getByRole('region', { name: '原操作恢复' }); await expect(recovery).toBeVisible();
  113 |   await expect(recovery.getByRole('button', { name: '核对或重试原操作', exact: true })).toBeDisabled(); expect((await f.call('/library/practice/sessions/' + row.id)).version).toBe(1);
  114 |   const event = page.waitForEvent('download'); await recovery.getByRole('button', { name: '下载原操作保护文件' }).click(); const download = await event;
  115 |   const body = JSON.parse(readFileSync((await download.path())!, 'utf8')); expect(body.body.text).toBe('必须先保护这份回答。');
  116 |   await recovery.getByLabel('我已另外保留完整恢复文件').check(); await recovery.getByRole('button', { name: '核对或重试原操作', exact: true }).click();
  117 |   await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toContainText('必须先保护这份回答。'); expect((await f.call('/library/practice/sessions/' + row.id)).version).toBe(2);
  118 | });
  119 | 
  120 | test('paper practice: an actual original PDF stays an unsplit document with its own persistent response', async ({ page }) => {
  121 |   const f = await fixture(page, 6); await page.goto('/library/practice?paper=' + encodeURIComponent(f.papers.pdf));
  122 |   await page.getByRole('button', { name: '预览这次练习', exact: true }).click(); await expect(page.getByRole('region', { name: '确认原卷练习' })).toContainText('未逐题切分');
  123 |   await page.getByRole('button', { name: '确认范围，开始练习 ↗' }).click(); await expect(page.getByRole('heading', { name: '整卷作答笔记', exact: true })).toBeVisible();
  124 |   const document = page.locator('iframe[title="原始试卷 PDF"]'); await expect(document).toBeVisible(); expect(await document.getAttribute('src')).toContain('/api/library/media?');
  125 |   await page.getByLabel('先写下自己的回答').fill('第1题：我先比较了条件，再写出整卷记录。'); await page.getByRole('button', { name: '提交本题回答', exact: true }).click();
  126 |   await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toContainText('第1题：我先比较了条件');
  127 |   const id = new URL(page.url()).searchParams.get('session')!, saved = await f.call('/library/practice/sessions/' + id); expect(saved.items).toHaveLength(1); expect(saved.items[0].kind).toBe('document'); expect(saved).not.toHaveProperty('score');
  128 | });
  129 | 
  130 | test('paper practice: actual publication withdrawal hides the frozen question and reference while retaining the learner response', async ({ page }) => {
  131 |   const f = await fixture(page, 7), row = await f.begin(); await page.goto('/library/practice?session=' + row.id);
  132 |   await page.getByLabel('先写下自己的回答').fill('原卷撤回前的独立文字。'); await page.getByRole('button', { name: '提交本题回答', exact: true }).click();
  133 |   await page.getByRole('button', { name: '核对本题参考答案', exact: true }).click(); await expect(page.getByRole('region', { name: '本题原参考与自评' })).toBeVisible();
  134 |   await f.publish(f.papers.complete, 'withdrawn'); await page.reload(); await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toContainText('原卷撤回前的独立文字。');
  135 |   await expect(page.getByRole('region', { name: '当前原题与首次回答' })).toContainText('已撤回'); await expect(page.getByRole('region', { name: '本题原参考与自评' })).toHaveCount(0);
  136 |   await expect(page.getByRole('button', { name: '核对本题参考答案', exact: true })).toHaveCount(0); await expect(page.getByText('合成原题：', { exact: false })).toHaveCount(0);
  137 | });
  138 | 
  139 | test('paper practice: completed review permits explicit reference reading without changing the original response or reopening correction', async ({ page }) => {
  140 |   const f = await fixture(page, 8), row = await f.begin(); await page.goto('/library/practice?session=' + row.id);
  141 |   await page.getByLabel('先写下自己的回答').fill('结束前的真实原答。'); await page.getByRole('button', { name: '提交本题回答', exact: true }).click();
  142 |   await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toBeVisible(); await page.getByRole('button', { name: '结束并复盘', exact: true }).click();
```
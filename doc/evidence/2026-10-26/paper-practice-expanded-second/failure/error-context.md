# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: paper-practice.spec.ts >> paper practice: correction drafts stay with their own item through rapid review, navigation and a real reload
- Location: tests\e2e\paper-practice.spec.ts:177:5

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator: getByLabel('追加订正', { exact: true })
Expected: "只属于第一题的未保存订正"
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toHaveValue" getByLabel('追加订正', { exact: true }) with timeout 15000ms
  - waiting for getByLabel('追加订正', { exact: true })

```

```yaml
- main:
  - link "学习观察室":
    - /url: /
  - navigation "主要导航":
    - link "学习首页":
      - /url: /learn?subject=math
    - link "学习工作台":
      - /url: /studio?subject=math
    - link "家长空间":
      - /url: /parent/dashboard?subject=math
    - link "知识诊断":
      - /url: /student/assessment?subject=math
    - link "今日学习":
      - /url: /student/today?subject=math
    - link "题卷资料":
      - /url: /library?subject=math
  - link "资料管理":
    - /url: /parent/data
  - button "退出"
  - link "← 我的原卷练习":
    - /url: /library/practice
  - strong: 原卷练习
  - status: 原记录已读取
  - status: 原操作已保存。
  - text: 2 / 2
  - paragraph: 已提交记录
  - text: "0"
  - paragraph: 未答
  - text: "1"
  - paragraph: 自评待订正
  - text: "0"
  - paragraph: 缺题或来源不可用
  - paragraph: 这里保留练习与自我核对，不计算未经审核的总分，也不自动改变知识掌握度。
  - complementary "原卷题位目录":
    - text: 查看范围
    - combobox "查看范围":
      - option "全部题位" [selected]
      - option "未答"
      - option "待订正"
      - option "暂时不会"
      - option "已跳过"
    - button "匿名原卷 10 · 完整 第 1 题 已回答 · 还需订正" [pressed]:
      - text: 匿名原卷 10 · 完整
      - strong: 第 1 题
      - text: 已回答 · 还需订正
    - button "匿名原卷 10 · 完整 第 2 题 已回答":
      - text: 匿名原卷 10 · 完整
      - strong: 第 2 题
      - text: 已回答
  - region "当前原题与首次回答":
    - text: 匿名原卷 10 · 完整
    - heading "第 1 题" [level=1]
    - link "回到原卷题位 ↗":
      - /url: /library?paper=qa%3Apaper%3A10%3Acomplete&position=1
    - paragraph:
      - text: 合成原题：
      - math: 3 + 2 = ?
    - table:
      - rowgroup:
        - row "第一组 第二组":
          - columnheader "第一组"
          - columnheader "第二组"
        - row "3 2":
          - cell "3"
          - cell "2"
    - text: A
    - paragraph: "4"
    - text: B
    - paragraph: "5"
    - region "不可覆盖的首次回答":
      - text: 已回答
      - heading "当时的首次回答" [level=2]
      - paragraph: 第一题的首答
      - time: 2026/10/26 23:12:49
    - region "本题原参考与自评":
      - heading "对照原参考，再判断。" [level=2]
      - paragraph: 合成原参考：5
      - paragraph: 把第一组的3个和第二组的2个合起来，共5个。首次思考应保留。
      - paragraph: 以下是自己的核对判断，不是客观评分。
      - button "自评符合参考"
      - button "还需订正" [pressed]
      - button "不能确定"
    - region "追加订正记录":
      - heading "保留第一次，再补充新的理解。" [level=2]
      - text: 追加订正
      - textbox "追加订正": 只属于第一题的未保存订正
      - button "保存这次订正"
    - button "上一题位" [disabled]
    - button "下一题位 ↗"
  - button "保存位置并暂停"
  - button "结束并复盘"
  - button "下载本机草稿保护文件"
  - button "查看其他本机草稿与原操作"
  - text: 从本次练习保护文件恢复
  - button "从本次练习保护文件恢复"
- alert
```

# Test source

```ts
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
  143 |   await page.getByRole('alertdialog').getByRole('button', { name: '确认结束，查看复盘' }).click(); await expect(page.getByText('原卷复盘', { exact: true })).toBeVisible();
  144 |   await page.getByRole('button', { name: '核对本题参考答案', exact: true }).click(); await expect(page.getByRole('region', { name: '本题原参考与自评' })).toContainText('合成原参考：5');
  145 |   await expect(page.getByLabel('追加订正', { exact: true })).toHaveCount(0); const saved = await f.call('/library/practice/sessions/' + row.id); expect(saved.status).toBe('completed');
  146 |   expect((await f.call('/library/practice/sessions/' + row.id + '/items/' + row.items[0].id)).firstAnswer.text).toBe('结束前的真实原答。');
  147 | });
  148 | 
  149 | for (const [index, width] of [390, 768, 1440].entries()) test('paper practice: original formula/table/image and keyboard completion controls fit ' + width, async ({ page }) => {
  150 |   await page.setViewportSize({ width, height: 1000 }); const f = await fixture(page, 20 + index), row = await f.begin();
  151 |   await page.goto('/library/practice?session=' + row.id); await expect(page.getByLabel('先写下自己的回答')).toBeVisible(); await expect(page.getByRole('table')).toBeVisible();
  152 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  153 |   await page.getByRole('button', { name: '下一题位 ↗', exact: true }).click(); const image = page.getByRole('img', { name: '合成原图', exact: true }); await expect(image).toBeVisible();
  154 |   await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth === 400)).toBe(true);
  155 |   await page.getByRole('button', { name: '结束并复盘', exact: true }).click(); const dialog = page.getByRole('alertdialog'); await expect(dialog.getByRole('button', { name: '继续练习', exact: true })).toBeFocused();
  156 |   await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: '确认结束，查看复盘' })).toBeFocused(); await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', { name: '继续练习', exact: true })).toBeFocused();
  157 |   await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(page.getByRole('button', { name: '结束并复盘', exact: true })).toBeFocused();
  158 |   await page.screenshot({ path: join(browserEvidence('paper-practice'), 'question-image-' + width + '.png'), fullPage: true });
  159 | });
  160 | 
  161 | test('paper practice: selected positions from two actual papers remain in the cross-paper basket and return to their original anchor', async ({ page }) => {
  162 |   const f = await fixture(page, 9);
  163 |   for (const [paper, position] of [[f.papers.complete, 2], [f.papers.partial, 1]] as const) {
  164 |     await page.goto('/library?paper=' + encodeURIComponent(paper)); const launch = page.getByRole('region', { name: '题卷练习入口' });
  165 |     await launch.locator('summary').click(); await launch.getByLabel('第 ' + position + ' 题', { exact: true }).check();
  166 |     await launch.getByRole('button', { name: '把所选题加入跨卷清单', exact: true }).click(); await expect(launch).toContainText('已放入选题清单');
  167 |   }
  168 |   await page.getByRole('link', { name: '预览跨卷清单 · 2 份 ↗', exact: true }).click(); await page.getByRole('button', { name: '预览这次练习', exact: true }).click();
  169 |   await expect(page.getByRole('region', { name: '确认原卷练习' })).toContainText('2 个可作答记录');
  170 |   await page.getByRole('button', { name: '确认范围，开始练习 ↗' }).click(); await expect(page.getByRole('heading', { name: '第 2 题', exact: true })).toBeVisible();
  171 |   const id = new URL(page.url()).searchParams.get('session')!, row = await f.call('/library/practice/sessions/' + id);
  172 |   expect(row.items.map((item: any) => [item.paperId, item.position])).toEqual([[f.papers.complete, 2], [f.papers.partial, 1]]);
  173 |   await page.getByRole('link', { name: '回到原卷题位 ↗' }).click(); await expect(page).toHaveURL(/position=2/);
  174 |   await expect(page.locator('#library-question-2')).toBeInViewport();
  175 | });
  176 | 
  177 | test('paper practice: correction drafts stay with their own item through rapid review, navigation and a real reload', async ({ page }) => {
  178 |   const f = await fixture(page, 10), row = await f.begin(); await page.goto('/library/practice?session=' + row.id);
  179 |   await page.getByLabel('先写下自己的回答').fill('第一题的首答'); await page.getByRole('button', { name: '提交本题回答', exact: true }).click();
  180 |   await page.getByRole('button', { name: '核对本题参考答案', exact: true }).click(); await page.getByRole('button', { name: '还需订正', exact: true }).click();
  181 |   await page.getByLabel('追加订正', { exact: true }).fill('只属于第一题的未保存订正');
  182 |   await page.getByRole('button', { name: '下一题位 ↗', exact: true }).click(); await page.getByLabel('先写下自己的回答').fill('第二题的首答');
  183 |   await page.getByRole('button', { name: '提交本题回答', exact: true }).click(); await expect(page.getByLabel('追加订正', { exact: true })).toHaveValue('');
  184 |   await page.getByLabel('追加订正', { exact: true }).fill('只属于第二题的未保存订正');
> 185 |   await page.getByRole('button', { name: '上一题位', exact: true }).click(); await expect(page.getByLabel('追加订正', { exact: true })).toHaveValue('只属于第一题的未保存订正');
      |                                                                                                                                 ^ Error: expect(locator).toHaveValue(expected) failed
  186 |   page.once('dialog', dialog => dialog.accept()); await page.reload(); await expect(page.getByLabel('追加订正', { exact: true })).toHaveValue('只属于第一题的未保存订正');
  187 |   await page.getByRole('button', { name: '保存这次订正', exact: true }).click(); await expect(page.getByLabel('追加订正', { exact: true })).toHaveValue('');
  188 |   await expect(page.getByRole('region', { name: '追加订正记录' })).toContainText('只属于第一题的未保存订正');
  189 |   await page.getByRole('button', { name: '下一题位 ↗', exact: true }).click(); await expect(page.getByLabel('追加订正', { exact: true })).toHaveValue('只属于第二题的未保存订正');
  190 |   const saved = await f.call('/library/practice/sessions/' + row.id + '/items/' + row.items[0].id); expect(saved.corrections).toHaveLength(1); expect(saved.firstAnswer.text).toBe('第一题的首答');
  191 | });
  192 | 
  193 | test('paper practice: delayed cross-item reads cannot replace the current question after actual browser back and forward', async ({ page }) => {
  194 |   const f = await fixture(page, 11), row = await f.begin(); await page.goto('/library/practice?session=' + row.id); await page.getByLabel('先写下自己的回答').fill('前后退仍属于第一题');
  195 |   let release!: () => void, arrived = false; const held = new Promise<void>(resolve => { release = resolve; });
  196 |   await page.route('**/api/library/practice/sessions/' + row.id + '/items/' + row.items[1].id, async route => {
  197 |     arrived = true; const response = await route.fetch(); await held; await route.fulfill({ response }).catch(() => {});
  198 |   });
  199 |   try {
  200 |     await page.getByRole('button', { name: '下一题位 ↗', exact: true }).click(); await expect.poll(() => arrived).toBe(true); await page.goBack();
  201 |     await expect(page.getByRole('heading', { name: '第 1 题', exact: true })).toBeVisible(); await expect(page.getByLabel('先写下自己的回答')).toHaveValue('前后退仍属于第一题');
  202 |     release(); await expect(page.getByRole('heading', { name: '第 2 题', exact: true })).toHaveCount(0); await page.goForward();
  203 |     await expect(page.getByRole('heading', { name: '第 2 题', exact: true })).toBeVisible(); await expect(page.getByLabel('先写下自己的回答')).toHaveValue('');
  204 |   } finally { release(); }
  205 | });
  206 | 
  207 | test('paper practice: metadata refreshes keep the same original PDF frame through submit and explicit reference reading', async ({ page }) => {
  208 |   const f = await fixture(page, 12), row = await f.begin(f.papers.pdf); await page.goto('/library/practice?session=' + row.id);
  209 |   const frame = page.locator('iframe[title="原始试卷 PDF"]'); await expect(frame).toBeVisible(); await frame.evaluate(node => node.setAttribute('data-original-instance', 'retained'));
  210 |   await page.getByLabel('先写下自己的回答').fill('保留原 PDF 阅读位置'); await page.getByRole('button', { name: '提交本题回答', exact: true }).click();
  211 |   await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toBeVisible(); await expect(frame).toHaveAttribute('data-original-instance', 'retained');
  212 |   await page.getByRole('button', { name: '核对本题参考答案', exact: true }).click(); await expect(page.getByRole('region', { name: '本题原参考与自评' })).toBeVisible();
  213 |   await expect(frame).toHaveAttribute('data-original-instance', 'retained');
  214 | });
  215 | 
  216 | test('paper practice: recovery files from another account, session or item never replace the current private draft', async ({ page }) => {
  217 |   const f = await fixture(page, 13), row = await f.begin(); await page.goto('/library/practice?session=' + row.id); await page.getByLabel('先写下自己的回答').fill('这份私人草稿保持');
  218 |   const original = { format: 'paper-practice-draft-v1', ownerId: f.actor.user.id, sessionId: row.id, itemId: row.items[0].id, text: '错误范围不能写入', baseText: '' };
  219 |   for (const change of [{ ownerId: 'another-account' }, { sessionId: 'another-session' }, { itemId: row.items[1].id }]) {
  220 |     await page.getByLabel('从本次练习保护文件恢复').setInputFiles({ name: 'foreign.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...original, ...change })) });
  221 |     await expect(page.locator('.pp-shell').getByRole('alert')).toBeVisible(); await expect(page.getByLabel('先写下自己的回答')).toHaveValue('这份私人草稿保持');
  222 |     await expect(page.getByRole('region', { name: '本机与服务器草稿冲突' })).toHaveCount(0);
  223 |   }
  224 |   expect((await f.call('/library/practice/sessions/' + row.id)).version).toBe(1);
  225 | });
  226 | 
  227 | test('paper practice: a real learning-code student writes only their own record and loses the private workspace after grant revocation', async ({ page, context }) => {
  228 |   const f = await fixture(page, 14), child = (await f.call('/students', { nickname: '匿名练习孩子', grade: 3, preferredSessionMinutes: 10, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile.id;
  229 |   await f.call('/students/' + child + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '合成原卷练习权限核对' });
  230 |   const issued = await f.call('/students/' + child + '/learning-access/codes', { expectedVersion: 1, requestKey: randomUUID() });
  231 |   await context.clearCookies(); await page.goto('/student/login'); await page.getByLabel('一次性学习码').fill(issued.code); await page.getByRole('button', { name: '进入我的学习 →', exact: true }).click();
  232 |   await expect(page).toHaveURL(/\/learn(?:\?|$)/); await page.goto('/library/practice?paper=' + encodeURIComponent(f.papers.complete));
  233 |   await expect(page.getByLabel('这次练习记录给谁')).toHaveValue(child); await page.getByRole('button', { name: '预览这次练习', exact: true }).click();
  234 |   await page.getByRole('button', { name: '确认范围，开始练习 ↗' }).click(); await page.getByLabel('先写下自己的回答').fill('孩子自己的原答');
  235 |   await page.getByRole('button', { name: '提交本题回答', exact: true }).click(); await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toContainText('孩子自己的原答');
  236 |   const id = new URL(page.url()).searchParams.get('session')!, parentRead = await f.call('/library/practice/sessions/' + id); expect(parentRead.permissions.edit).toBe(false);
  237 |   await f.call('/students/' + child + '/learning-access', { enabled: false, expectedVersion: 1, requestKey: randomUUID(), reason: '合成练习实时撤权核对' });
  238 |   await page.getByRole('button', { name: '核对本题参考答案', exact: true }).click(); await expect(page.getByRole('region', { name: '当前原题与首次回答' })).toHaveCount(0);
  239 |   await expect(page.getByRole('heading', { name: '从原卷开始，留下自己的思考。', exact: true })).toBeVisible();
  240 | });
  241 | 
  242 | test('paper practice: an actual login logout and another family cannot reuse a private record or its visible answer', async ({ page, context }) => {
  243 |   const f = await fixture(page, 15), row = await f.begin(); await page.goto('/library/practice?session=' + row.id); await page.getByLabel('先写下自己的回答').fill('属于原家庭的私人回答');
  244 |   await page.getByRole('button', { name: '提交本题回答', exact: true }).click(); await expect(page.getByRole('region', { name: '不可覆盖的首次回答' })).toBeVisible();
  245 |   expect(await page.evaluate(async base => (await fetch(base + '/auth/logout', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, api)).toBe(201);
  246 |   await page.getByRole('button', { name: '核对本题参考答案', exact: true }).click(); await expect(page.getByRole('region', { name: '当前原题与首次回答' })).toHaveCount(0);
  247 |   const principal = 'paper-other-' + randomUUID(), credential = 'Synthetic-other-family-20261026', other = await f.call('/auth/register', { principal, credential }, '');
  248 |   await f.call('/library/practice/sessions/' + row.id, undefined, other.token, 403); await context.clearCookies(); await page.goto('/parent/login');
  249 |   await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential); await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  250 |   await page.goto('/library/practice?session=' + row.id); await expect(page.locator('.pp-shell').getByRole('alert')).toBeVisible();
  251 |   await expect(page.getByText('属于原家庭的私人回答', { exact: true })).toHaveCount(0); await expect(page.getByLabel('先写下自己的回答')).toHaveCount(0);
  252 | });
  253 | 
```
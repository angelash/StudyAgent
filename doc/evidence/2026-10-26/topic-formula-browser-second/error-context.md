# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topic-whiteboard.spec.ts >> topic-formula: actual shared image and fraction/root/alignment vector video decodes with full audio and caption timeline
- Location: tests\e2e\topic-whiteboard.spec.ts:99:5

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('region', { name: '白板配图工作区' }).getByRole('button', { name: '预检配图范围', exact: true })
    - locator resolved to <button disabled type="button">预检配图范围</button>
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
- generic [ref=f2e1]:
  - alert [ref=f2e2]
  - main [ref=f2e3]:
    - complementary "学习工作台导航" [ref=f2e4]:
      - link "StudyAgent" [ref=f2e5] [cursor=pointer]:
        - /url: /studio
      - navigation [ref=f2e9]:
        - link "Home" [ref=f2e10] [cursor=pointer]:
          - /url: /studio?view=home
          - generic [ref=f2e13]: 首页
        - link "Courses" [ref=f2e14] [cursor=pointer]:
          - /url: /studio?view=courses
          - generic [ref=f2e17]: 课程
        - link "Calendar" [ref=f2e18] [cursor=pointer]:
          - /url: /studio?view=calendar
          - generic [ref=f2e21]: 学习动态
        - link "History" [ref=f2e22] [cursor=pointer]:
          - /url: /studio?view=history
          - generic [ref=f2e25]: 历史
        - link "Materials" [ref=f2e26] [cursor=pointer]:
          - /url: /studio?view=materials
          - generic [ref=f2e29]: 资料
        - link "AI Whiteboards" [ref=f2e30] [cursor=pointer]:
          - /url: /studio/whiteboards
          - generic [ref=f2e33]: AI白板
      - generic [ref=f2e34]:
        - heading "继续学习" [level=2] [ref=f2e35]
        - link "讲座社会学想象力 社会学概论" [ref=f2e36] [cursor=pointer]:
          - /url: /studio/classroom
          - text: 讲座社会学想象力
          - generic [ref=f2e37]: 社会学概论
      - generic [ref=f2e38]:
        - heading "近期活动" [level=2] [ref=f2e39]
        - paragraph [ref=f2e40]: 开始学习后，活动会出现在这里。
      - link "返回学习首页 →" [ref=f2e42] [cursor=pointer]:
        - /url: /learn?subject=math
    - generic [ref=f2e43]:
      - generic [ref=f2e44]:
        - generic [ref=f2e45]:
          - text: WHITEBOARD STUDIO
          - heading "从一个问题开始，讲清每一步。" [level=1] [ref=f2e46]
          - paragraph [ref=f2e47]: 先生成教学稿，完整核对后再保存。AI 讲解需要内容核对。
        - link "返回学习工作台 →" [ref=f2e48] [cursor=pointer]:
          - /url: /studio
      - generic [ref=f2e49]:
        - complementary [ref=f2e50]:
          - generic [ref=f2e51]:
            - text: NEW BOARD
            - heading "这次想弄懂什么？" [level=2] [ref=f2e52]
          - generic [ref=f2e53]:
            - text: 学习对象
            - combobox "白板学习对象" [ref=f2e54]:
              - option "我自己 · 成人主题" [selected]
          - region "新建AI白板" [ref=f2e55]:
            - group [ref=f2e56]:
              - generic [ref=f2e57]:
                - text: 讲解主题
                - textbox "讲解主题" [ref=f2e58]:
                  - /placeholder: 例如：为什么先统一单位，才能比较和合并？
                  - text: 用匿名观察解释条件与推断
              - generic [ref=f2e59]:
                - text: 希望弄懂什么
                - textbox "希望弄懂什么" [ref=f2e60]:
                  - /placeholder: 想理解的区别、步骤，或一个具体困惑
                  - text: 保留完整条件，说明观察、推断和替代解释的区别。
              - generic [ref=f2e62]:
                - generic [ref=f2e63]: 模型
                - combobox "选择大模型" [ref=f2e64] [cursor=pointer]:
                  - option "Auto · 当前默认模型"
                  - option "GPT-6.1 Sol"
                  - option "GPT-6 Astra"
                  - option "GPT-6 Luna"
                  - option "Grok-4.7"
                  - option "GLM-5.3 Flash"
                  - option "DeepSeek V4.1 Flash · 默认" [selected]
                  - option "Claude Opus 5.5"
                  - option "Claude Sonnet 5"
                  - option "GPT-6 Sol"
                  - option "GPT-5.6 Sol"
                  - option "GPT-5.6 Terra"
                  - option "GPT-5.6 Luna"
                  - option "GPT-5.5"
                  - option "Grok-4.6"
                  - option "GLM-5.2"
                  - option "GLM-5.3"
                  - option "Claude Opus 5"
                  - option "Claude Fable 5.1"
                  - option "MiMo V2.6 Pro"
                  - option "MiMo V2.6 Flash"
                  - option "MiMo V2.6 Pro Ultraspeed"
                  - option "Qwen3.8 Max"
            - status [ref=f2e65]: 已恢复此标签页的原主题与模型选择。
            - generic [ref=f2e66]:
              - button "预检主题与范围" [ref=f2e67] [cursor=pointer]
              - button "生成教学稿" [disabled] [ref=f2e68]
            - button "下载原主题与请求" [ref=f2e69] [cursor=pointer]
            - group [ref=f2e70]:
              - generic "查看其他本机主题" [ref=f2e71] [cursor=pointer]
        - region "白板工作区" [ref=f2e72]:
          - article [ref=f2e73]:
            - generic [ref=f2e74]:
              - text: 待你核对
              - heading "把条件讲清楚" [level=2] [ref=f2e75]
              - paragraph [ref=f2e76]: Browser fixture · not a real model · 本人成人主题
            - status [ref=f2e77]: 待你核对
            - button "下载原稿与请求" [ref=f2e79] [cursor=pointer]
            - group [ref=f2e80]:
              - generic "查看其他本机操作" [ref=f2e81] [cursor=pointer]
            - generic [ref=f2e82]:
              - heading "AI 复核 · 针对旧稿，尚未复核当前修改" [level=3] [ref=f2e83]
              - paragraph [ref=f2e84]: 这不是教师审核，也不代表孩子已掌握。
            - region "完整白板改稿" [ref=f2e85]:
              - generic [ref=f2e86]:
                - generic [ref=f2e87]:
                  - heading "完整教学稿" [level=2] [ref=f2e88]
                  - paragraph [ref=f2e89]: 与所用基线一致 · 本机草稿已保留
                - button "下载完整改稿" [ref=f2e90] [cursor=pointer]
              - status [ref=f2e91]: 已恢复这份候选的完整本机改稿；请核对服务器版本后继续。
              - group [ref=f2e92]:
                - generic "查看其他本机改稿" [ref=f2e93] [cursor=pointer]
              - alert [ref=f2e94]:
                - paragraph [ref=f2e95]: 服务器稿已变化。本机全文保留，请先比较原稿。
                - group [ref=f2e96]:
                  - generic "阅读当前服务器完整稿" [ref=f2e97] [cursor=pointer]
                - button "采用服务器稿" [ref=f2e98] [cursor=pointer]
                - button "以服务器为基线继续我的改稿" [ref=f2e99] [cursor=pointer]
              - group [ref=f2e100]:
                - generic [ref=f2e101]:
                  - text: 白板标题
                  - textbox "白板标题" [ref=f2e102]: 把条件讲清楚
                - generic [ref=f2e103]:
                  - text: 讲解概要
                  - textbox "讲解概要" [ref=f2e104]: 匿名合成教学稿，保留观察、条件和反例。
                - group [ref=f2e105]:
                  - generic "1. 先核对观察" [ref=f2e106] [cursor=pointer]
                  - generic [ref=f2e107]:
                    - text: 这一幕的结构
                    - combobox "这一幕的结构" [ref=f2e108]:
                      - option "开场" [selected]
                      - option "概念"
                      - option "步骤"
                      - option "自我检验"
                  - generic [ref=f2e109]:
                    - text: 分幕标题
                    - textbox "分幕标题" [ref=f2e110]: 先核对观察
                  - generic [ref=f2e111]:
                    - text: 完整旁白
                    - textbox "完整旁白" [ref=f2e112]: "[whiteboard-fixture] 先核对观察。 保留未知条件，不把一次观察当成完整能力证明。"
                  - generic [ref=f2e113]:
                    - text: 板书正文
                    - textbox "板书正文" [ref=f2e114]: 完整说明首行。完整说明尾行。
                  - generic [ref=f2e115]:
                    - heading "完整要点" [level=3] [ref=f2e116]
                    - paragraph [ref=f2e117]: 每条要点应逐字出现在本幕旁白中。
                    - generic [ref=f2e118]:
                      - generic [ref=f2e119]:
                        - text: 要点 1
                        - textbox "要点 1" [ref=f2e120]: 先核对观察
                      - button "移除此要点" [ref=f2e121] [cursor=pointer]
                    - button "添加要点" [ref=f2e122] [cursor=pointer]
                  - generic [ref=f2e123]:
                    - text: 对照展示
                    - combobox "对照展示" [ref=f2e124]:
                      - option "文字讲解" [selected]
                      - option "对照表"
                      - option "公式"
                - group [ref=f2e125]:
                  - generic "2. 再比较条件" [ref=f2e126] [cursor=pointer]
                  - option "开场"
                  - option "概念" [selected]
                  - option "步骤"
                  - option "自我检验"
                  - option "文字讲解"
                  - option "对照表" [selected]
                  - option "公式"
                - group [ref=f2e127]:
                  - generic "3. 最后保留反例" [ref=f2e128] [cursor=pointer]
                  - option "开场"
                  - option "概念"
                  - option "步骤"
                  - option "自我检验" [selected]
                  - option "文字讲解"
                  - option "对照表"
                  - option "公式" [selected]
              - region "白板配图工作区" [ref=f2e129]:
                - generic [ref=f2e130]:
                  - generic [ref=f2e131]:
                    - text: TEACHING FIGURES
                    - heading "让这一幕更好理解" [level=3] [ref=f2e132]
                  - generic [ref=f2e133]: 图片模型 · gpt-image-2
                - paragraph [ref=f2e134]: 围绕知识点和提炼要点配图。文字模型独立选择，图片中的标签、数量和关系需要核对。
                - status [ref=f2e135]: 已恢复本页的完整配图需求和原请求。
                - paragraph [ref=f2e136]: 请先保存完整改稿并核对服务器基线，再生成这一幕的图片。
                - group [ref=f2e137]:
                  - generic [ref=f2e138]:
                    - text: 配图分幕
                    - combobox "配图分幕" [ref=f2e139]:
                      - option "1. 公式示例 1" [selected]
                      - option "2. 公式示例 2"
                      - option "3. 公式示例 3"
                  - generic [ref=f2e140]:
                    - text: 图片用途
                    - combobox "图片用途" [ref=f2e141]:
                      - option "概念说明" [selected]
                      - option "对照关系"
                      - option "情境示意"
                  - generic [ref=f2e142]:
                    - text: 希望图片说明什么
                    - textbox "希望图片说明什么" [active] [ref=f2e143]:
                      - /placeholder: 例如：用两个有交集的圆说明概念关系，标签简短，保留必要条件。
                      - text: 以两个有交集的圆说明条件和观察的关系，保留完整标签。
                - generic [ref=f2e144]:
                  - button "预检配图范围" [disabled] [ref=f2e145]
                  - button "生成参考图" [disabled] [ref=f2e146]
                  - button "下载完整配图请求" [ref=f2e147] [cursor=pointer]
                - generic [ref=f2e149]:
                  - heading "本幕图片候选" [level=4] [ref=f2e150]
                  - generic [ref=f2e151]:
                    - generic [ref=f2e152]:
                      - text: 搜索图片要求
                      - textbox "搜索图片要求" [ref=f2e153]
                    - button "查找" [ref=f2e154] [cursor=pointer]
                  - generic "本幕图片候选"
                  - paragraph [ref=f2e155]: 尚无候选。完成预检并明确生成后，图片会保存在这里。
                  - generic [ref=f2e156]:
                    - button "上一页" [disabled] [ref=f2e157]
                    - generic [ref=f2e158]: 1 / 1
                    - button "下一页" [disabled] [ref=f2e159]
                - group [ref=f2e160]:
                  - generic "查看其他本机配图请求" [ref=f2e161] [cursor=pointer]
              - button "保存完整改稿" [disabled] [ref=f2e163]
            - group [ref=f2e164]:
              - generic "阅读AI最初原稿" [ref=f2e165] [cursor=pointer]
            - button "查看完整修改历史" [ref=f2e167] [cursor=pointer]
            - generic [ref=f2e168]:
              - paragraph [ref=f2e169]: 保存后保持AI生成、待内容核对；不会写入能力或评测结果。
              - generic [ref=f2e170]:
                - checkbox "我已阅读未确定问题或手工改稿，知晓仍需内容核对" [ref=f2e171]
                - text: 我已阅读未确定问题或手工改稿，知晓仍需内容核对
              - paragraph [ref=f2e172]: 请先保存完整改稿，并比较服务器版本后再确认。
              - button "确认并保存这份白板" [disabled] [ref=f2e173]
        - complementary "白板与候选历史" [ref=f2e174]:
          - generic [ref=f2e175]:
            - heading "我的白板" [level=2] [ref=f2e176]
            - button "＋ 新白板" [ref=f2e177] [cursor=pointer]
          - generic [ref=f2e178]:
            - button "教学草稿" [pressed] [ref=f2e179] [cursor=pointer]
            - button "已保存" [ref=f2e180] [cursor=pointer]
          - generic [ref=f2e181]:
            - generic [ref=f2e182]: 搜索我的白板
            - textbox "搜索我的白板" [ref=f2e183]:
              - /placeholder: 搜索主题或标题
          - button "待你核对 · 本人主题 把条件讲清楚 Browser fixture · not a real model" [ref=f2e184] [cursor=pointer]:
            - generic [ref=f2e185]: 待你核对 · 本人主题
            - generic [ref=f2e186]: 把条件讲清楚
            - generic [ref=f2e187]: Browser fixture · not a real model
          - generic [ref=f2e188]:
            - button "上一页" [disabled] [ref=f2e189]
            - generic [ref=f2e190]: 1 / 1
            - button "下一页" [disabled] [ref=f2e191]
```

# Test source

```ts
  1   | import { expect, test, type Page } from '@playwright/test';
  2   | import { createHash, randomUUID } from 'node:crypto';
  3   | import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
  4   | import { execFileSync, spawnSync } from 'node:child_process';
  5   | import sharp from 'sharp';
  6   | import { browserEvidence } from './evidence';
  7   | import { join } from 'node:path';
  8   | 
  9   | const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107'), base = '/learning/studio/topic-whiteboards';
  10  | const figureBase = '/learning/studio/topic-whiteboard-visuals';
  11  | // Complete in-flight overview/media routes before Playwright disposes their API responses.
  12  | test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });
  13  | async function fixture(page: Page, child = false) {
  14  |   const hash = createHash('sha256').update(test.info().testId).digest(), address = '198.19.' + hash[0] + '.' + hash[1];
  15  |   await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address });
  16  |   const principal = 'topic-browser-' + randomUUID() + '@local.test', credential = 'Topic-Browser-Only-20261026';
  17  |   let token = '';
  18  |   async function call(path: string, body?: unknown, method = 'POST') {
  19  |     const response = await fetch(api + '/api' + path, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address, ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  20  |       ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  21  |     expect(response.ok, path + ': ' + response.status).toBe(true); return (await response.json()).data;
  22  |   }
  23  |   const actor = await call('/auth/register', { principal, credential }); token = actor.token;
  24  |   let studentId: string | null = null;
  25  |   if (child) {
  26  |     const created = await call('/students', { nickname: '匿名AI白板学习者', grade: 5, preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }); studentId = created.profile.id;
  27  |     await call('/students/' + studentId + '/learning-scope', { subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null,
  28  |       textbookVersion: '匿名已学范围', learnedAtomIds: ['core:math:fractionadd'], currentAtomId: 'core:math:fractionadd', minutesPerSession: 15, progressMode: 'knowledge', selectedLessonIds: [] }, 'PUT');
  29  |   }
  30  |   await page.route('**/api/learning/studio/overview?*', async route => {
  31  |     const response = await route.fetch(); if (!response.ok()) { await route.fulfill({ response }); return; }
  32  |     const payload = await response.json(); payload.data.narrationAvailable = true; payload.data.speech = { available: true, provider: 'minimax', defaultVoice: 'fixture-a', voices: [{ id: 'fixture-a', label: '合成音轨 A' }] };
  33  |     await route.fulfill({ response, json: payload });
  34  |   });
  35  |   await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  36  |   await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  37  |   await page.goto('/studio/whiteboards'); await expect(page.getByLabel('讲解主题')).toBeVisible();
  38  |   await expect(page.getByLabel('选择大模型')).toHaveValue('deepseek-v4-flash');
  39  |   return { actor, call, studentId };
  40  | }
  41  | async function generate(page: Page, topic = '用匿名观察解释条件与推断') {
  42  |   await page.getByLabel('讲解主题').fill(topic); await page.getByLabel('希望弄懂什么').fill('保留完整条件，说明观察、推断和替代解释的区别。');
  43  |   await page.getByRole('button', { name: '预检主题与范围', exact: true }).click(); await expect(page.getByRole('button', { name: '生成教学稿', exact: true })).toBeEnabled();
  44  |   await page.getByRole('button', { name: '生成教学稿', exact: true }).click();
  45  | }
  46  | async function ready(page: Page) { await expect(page.locator('.tw-generation-state')).toHaveText('待你核对', { timeout: 25000 }); await expect(page.getByLabel('白板标题')).toBeVisible(); }
  47  | async function figure(page: Page, requirements = '以两个有交集的圆说明条件和观察的关系，保留完整标签。') {
  48  |   const pane = page.getByRole('region', { name: '白板配图工作区' });
  49  |   await pane.getByLabel('希望图片说明什么').fill(requirements);
> 50  |   await pane.getByRole('button', { name: '预检配图范围', exact: true }).click();
      |                                                                   ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
  51  |   await expect(pane.getByText('本次完整教学范围与配图要求', { exact: true })).toBeVisible();
  52  |   await expect(pane.getByRole('button', { name: '生成参考图', exact: true })).toBeEnabled();
  53  |   await pane.getByRole('button', { name: '生成参考图', exact: true }).click(); return pane;
  54  | }
  55  | 
  56  | async function formulaBoard(page: Page, expressions: string[], withFigure = false) {
  57  |   const f = await fixture(page); await generate(page); await ready(page);
  58  |   const id = new URL(page.url()).searchParams.get('draft')!, view = await f.call(base + '/drafts/' + id, undefined, 'GET');
  59  |   const content = { ...view.content, scenes: expressions.map((latex, index) => ({ ...view.content.scenes[index % 3], title: '公式示例 ' + (index + 1),
  60  |     narration: '[whiteboard-fixture] 核对完整表达。 [whiteboard-fixture] 保留最后一项。',
  61  |     bullets: ['核对完整表达', '保留最后一项'], figure: undefined, exhibit: { kind: 'formula', latex, explanation: '分式、根号与对齐关系需要完整保留，最后一项不能省略。' } })) };
  62  |   const edited = await f.call(base + '/drafts/' + id + '/content', { expectedRevision: view.revision, contentFingerprint: view.contentFingerprint, content, requestKey: randomUUID() }, 'PATCH');
  63  |   let current = edited;
  64  |   if (withFigure) {
  65  |     await page.reload(); await ready(page);
  66  |     const pane = await figure(page); await pane.getByRole('checkbox', { name: '我已阅读图片，并核对本次要使用的标签和关系。' }).check();
  67  |     await pane.getByRole('button', { name: '选入当前完整稿', exact: true }).click(); await page.getByRole('button', { name: '保存完整改稿', exact: true }).click();
  68  |     await expect(page.locator('.tw-review')).toContainText('针对旧稿');
  69  |     current = await f.call(base + '/drafts/' + id, undefined, 'GET');
  70  |   }
  71  |   await f.call(base + '/drafts/' + id + '/confirm', { expectedRevision: current.revision, contentFingerprint: current.contentFingerprint,
  72  |     acknowledgeAiGeneratedContent: true, acknowledgeUnreviewedChanges: true, requestKey: randomUUID() });
  73  |   await page.reload(); await page.getByRole('button', { name: '打开已保存白板', exact: true }).click();
  74  |   const player = page.getByRole('dialog', { name: '白板视频' }); await expect(player).toBeVisible();
  75  |   return { ...f, player };
  76  | }
  77  | 
  78  | test('topic-formula: complete vector fractions, aligned roots and Unicode fit narrow notes and preserve copyable source and safe fallback', async ({ page }) => {
  79  |   const expressions = ['\\frac{1}{2}+\\sqrt{x^2+1}', '\\begin{aligned}a&=b+c\\\\d&=\\frac{e}{f}\\end{aligned}', '\\frac{1}{2}\\text{个整体}', '\\unknownprivate{最后一项}', 'a+'.repeat(280) + 'z'];
  80  |   const { player } = await formulaBoard(page, expressions);
  81  |   for (const width of [390, 768, 1440]) {
  82  |     await page.setViewportSize({ width, height: 1000 });
  83  |     for (const [index, latex] of expressions.entries()) {
  84  |       const detail = player.locator('.wb-reading-notes > details').nth(index);
  85  |       if (!(await detail.getAttribute('open') !== null)) await detail.locator(':scope > summary').click();
  86  |       const formula = detail.locator('.wb-complete-formula');
  87  |       if (index !== 3) { await expect(formula.locator('.wb-formula-vector svg')).toHaveCount(1); await expect(formula.locator('math')).toHaveCount(1); }
  88  |       else await expect(formula.getByRole('status')).toContainText('分页保留原式');
  89  |       const raw = formula.locator('details'); if (await raw.getAttribute('open') === null) await raw.locator('summary').click();
  90  |       expect(await raw.locator('pre').textContent()).toBe(latex);
  91  |       expect(await formula.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  92  |     }
  93  |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  94  |     await page.screenshot({ path: join(browserEvidence('topic-whiteboard'), 'topic-formula-reader-' + width + '.png'), fullPage: false });
  95  |   }
  96  |   expect(await page.locator('[href^="javascript:"],script[src*="mathjax"],image[href^="http"]').count()).toBe(0);
  97  | });
  98  | 
  99  | test('topic-formula: actual shared image and fraction/root/alignment vector video decodes with full audio and caption timeline', async ({ page }) => {
  100 |   const { player } = await formulaBoard(page, ['\\frac{1}{2}+\\sqrt{x^2+1}', '\\begin{aligned}a&=b+c\\\\d&=\\frac{e}{f}\\end{aligned}', 'a+'.repeat(280) + 'z'], true);
  101 |   await expect(player.locator('.sa-whiteboard-notice')).not.toContainText('无法解码');
  102 |   await expect(player.locator('.wb-formula-vector svg').first()).toBeVisible();
  103 |   const download = page.waitForEvent('download', { timeout: 30000 }); await player.getByRole('button', { name: '导出视频', exact: true }).click();
  104 |   const video = (await (await download).path())!, directory = browserEvidence('topic-whiteboard'); copyFileSync(video, join(directory, 'topic-formula-video.webm'));
  105 |   const probe = JSON.parse(execFileSync(process.env.STUDY_FFPROBE ?? 'ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', video], { windowsHide: true, encoding: 'utf8' }));
  106 |   expect(probe.streams.some((stream: any) => stream.codec_type === 'audio')).toBe(true); expect(probe.streams.some((stream: any) => stream.codec_type === 'video')).toBe(true);
  107 |   const receipts: unknown[] = [];
  108 |   for (const [name, time, left] of [['first', .2, 740], ['aligned', 4.2, 88], ['last', 11.7, 88]] as const) {
  109 |     const frame = spawnSync(process.env.STUDY_FFMPEG ?? 'ffmpeg', ['-v', 'error', '-ss', String(time), '-i', video, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  110 |     expect(frame.status).toBe(0); const decoded = await sharp(frame.stdout).removeAlpha().raw().toBuffer({ resolveWithObject: true }); let ink = 0;
  111 |     for (let y = 220; y < 500; y++) for (let x = left; x < 1190; x++) { const offset = (y * 1280 + x) * 3;
  112 |       if (decoded.data[offset] < 120 && decoded.data[offset + 1] < 130 && decoded.data[offset + 2] < 120) ink++; }
  113 |     expect(ink).toBeGreaterThan(100); receipts.push({ name, time, ink }); writeFileSync(join(directory, 'topic-formula-video-' + name + '.png'), frame.stdout);
  114 |   }
  115 |   writeFileSync(join(directory, 'topic-formula-video-probe.json'), JSON.stringify({ probe, frames: receipts }, null, 2) + '\n');
  116 |   const captions = page.waitForEvent('download'); await player.getByRole('button', { name: '导出字幕', exact: true }).click(); const srt = readFileSync((await (await captions).path())!, 'utf8');
  117 |   expect(srt).toContain('00:00:00,000 --> 00:00:02,000'); expect(srt).toContain('00:00:10,000 --> 00:00:12,000'); expect(srt).toContain('保留最后一项');
  118 |   writeFileSync(join(directory, 'topic-formula-video.srt'), srt);
  119 |   const later: string[] = []; page.on('download', item => later.push(item.suggestedFilename()));
  120 |   await player.getByRole('button', { name: '导出视频', exact: true }).click(); await player.getByRole('button', { name: '取消导出', exact: true }).click();
  121 |   await expect(player.locator('.sa-whiteboard-notice')).toContainText('没有下载半成品'); expect(later).toEqual([]);
  122 |   const retained = page.waitForEvent('download'); await player.getByRole('button', { name: '导出字幕', exact: true }).click(); expect(readFileSync((await (await retained).path())!, 'utf8')).toBe(srt);
  123 | });
  124 | 
  125 | test('login forms cannot submit before their client handlers are ready', async ({ browser }) => {
  126 |   const context = await browser.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL });
  127 |   try {
  128 |     const page = await context.newPage();
  129 |     for (const path of ['/parent/login', '/student/login']) {
  130 |       await page.goto(path);
  131 |       for (const input of await page.locator('form input, form button').all()) await expect(input).toBeDisabled();
  132 |     }
  133 |   } finally { await context.close(); }
  134 | });
  135 | 
  136 | test('topic-figure: restores a lost original image prepare without duplicate writes, edits its PNG and publishes an image with pause/read/resume', async ({ page }) => {
  137 |   const f = await fixture(page); await generate(page); await ready(page); const id = new URL(page.url()).searchParams.get('draft')!;
  138 |   let dropped = true, writes = 0;
  139 |   await page.route('**/api/learning/studio/topic-whiteboard-visuals', async route => {
  140 |     if (route.request().method() !== 'POST') return route.continue(); writes++;
  141 |     if (dropped) { dropped = false; expect((await route.fetch()).status()).toBe(201); await route.abort('failed'); } else await route.continue();
  142 |   });
  143 |   await figure(page); const pane = page.getByRole('region', { name: '白板配图工作区' });
  144 |   await expect(pane.getByRole('button', { name: '恢复原配图请求', exact: true })).toBeEnabled(); await page.reload(); await ready(page);
  145 |   await pane.getByRole('button', { name: '恢复原配图请求', exact: true }).click();
  146 |   await expect(pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeVisible(); expect(writes).toBe(1);
  147 |   expect((await f.call(figureBase + '?draftId=' + id + '&sceneIndex=0', undefined, 'GET')).total).toBe(1);
  148 |   await pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true }).click();
  149 |   await expect(page.locator('.cl-figure-reader-sheet img')).toBeVisible(); await page.keyboard.press('Escape');
  150 |   await expect(pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeFocused();
```
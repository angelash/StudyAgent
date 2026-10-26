# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topic-whiteboard.spec.ts >> topic-formula: complete vector fractions, aligned roots and Unicode fit narrow notes and preserve copyable source and safe fallback
- Location: tests\e2e\topic-whiteboard.spec.ts:75:5

# Error details

```
Error: /learning/studio/topic-whiteboards/drafts/topic_draft_f6fb1e54-c756-4555-a57e-2fd77435d133/content: 400

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=f1e1]:
  - alert [ref=f1e2]
  - main [ref=f1e3]:
    - complementary "学习工作台导航" [ref=f1e4]:
      - link "StudyAgent" [ref=f1e5] [cursor=pointer]:
        - /url: /studio
      - navigation [ref=f1e9]:
        - link "Home" [ref=f1e10] [cursor=pointer]:
          - /url: /studio?view=home
          - generic [ref=f1e13]: 首页
        - link "Courses" [ref=f1e14] [cursor=pointer]:
          - /url: /studio?view=courses
          - generic [ref=f1e17]: 课程
        - link "Calendar" [ref=f1e18] [cursor=pointer]:
          - /url: /studio?view=calendar
          - generic [ref=f1e21]: 学习动态
        - link "History" [ref=f1e22] [cursor=pointer]:
          - /url: /studio?view=history
          - generic [ref=f1e25]: 历史
        - link "Materials" [ref=f1e26] [cursor=pointer]:
          - /url: /studio?view=materials
          - generic [ref=f1e29]: 资料
        - link "AI Whiteboards" [ref=f1e30] [cursor=pointer]:
          - /url: /studio/whiteboards
          - generic [ref=f1e33]: AI白板
      - generic [ref=f1e34]:
        - heading "继续学习" [level=2] [ref=f1e35]
        - link "讲座社会学想象力 社会学概论" [ref=f1e36] [cursor=pointer]:
          - /url: /studio/classroom
          - text: 讲座社会学想象力
          - generic [ref=f1e37]: 社会学概论
      - generic [ref=f1e38]:
        - heading "近期活动" [level=2] [ref=f1e39]
        - paragraph [ref=f1e40]: 开始学习后，活动会出现在这里。
      - link "返回学习首页 →" [ref=f1e42] [cursor=pointer]:
        - /url: /learn?subject=math
    - generic [ref=f1e43]:
      - generic [ref=f1e44]:
        - generic [ref=f1e45]:
          - text: WHITEBOARD STUDIO
          - heading "从一个问题开始，讲清每一步。" [level=1] [ref=f1e46]
          - paragraph [ref=f1e47]: 先生成教学稿，完整核对后再保存。AI 讲解需要内容核对。
        - link "返回学习工作台 →" [ref=f1e48] [cursor=pointer]:
          - /url: /studio
      - generic [ref=f1e49]:
        - complementary [ref=f1e50]:
          - generic [ref=f1e51]:
            - text: NEW BOARD
            - heading "这次想弄懂什么？" [level=2] [ref=f1e52]
          - generic [ref=f1e53]:
            - text: 学习对象
            - combobox "白板学习对象" [ref=f1e54]:
              - option "我自己 · 成人主题" [selected]
          - region "新建AI白板" [ref=f1e55]:
            - group [ref=f1e56]:
              - generic [ref=f1e57]:
                - text: 讲解主题
                - textbox "讲解主题" [ref=f1e58]:
                  - /placeholder: 例如：为什么先统一单位，才能比较和合并？
                  - text: 用匿名观察解释条件与推断
              - generic [ref=f1e59]:
                - text: 希望弄懂什么
                - textbox "希望弄懂什么" [ref=f1e60]:
                  - /placeholder: 想理解的区别、步骤，或一个具体困惑
                  - text: 保留完整条件，说明观察、推断和替代解释的区别。
              - generic [ref=f1e62]:
                - generic [ref=f1e63]: 模型
                - combobox "选择大模型" [ref=f1e64] [cursor=pointer]:
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
            - generic [ref=f1e65]:
              - button "预检主题与范围" [ref=f1e66] [cursor=pointer]
              - button "生成教学稿" [disabled] [ref=f1e67]
            - button "下载原主题与请求" [ref=f1e68] [cursor=pointer]
            - group [ref=f1e69]:
              - generic "查看其他本机主题" [ref=f1e70] [cursor=pointer]
        - region "白板工作区" [ref=f1e71]:
          - article [ref=f1e72]:
            - generic [ref=f1e73]:
              - text: 待你核对
              - heading "把条件讲清楚" [active] [level=2] [ref=f1e74]
              - paragraph [ref=f1e75]: Browser fixture · not a real model · 本人成人主题
            - status [ref=f1e76]: 待你核对
            - button "下载原稿与请求" [ref=f1e78] [cursor=pointer]
            - group [ref=f1e79]:
              - generic "查看其他本机操作" [ref=f1e80] [cursor=pointer]
            - generic [ref=f1e81]:
              - heading "AI 复核 · 未提出修改" [level=3] [ref=f1e82]
              - paragraph [ref=f1e83]: 这不是教师审核，也不代表孩子已掌握。
            - region "完整白板改稿" [ref=f1e84]:
              - generic [ref=f1e85]:
                - generic [ref=f1e86]:
                  - heading "完整教学稿" [level=2] [ref=f1e87]
                  - paragraph [ref=f1e88]: 与所用基线一致 · 本机草稿已保留
                - button "下载完整改稿" [ref=f1e89] [cursor=pointer]
              - group [ref=f1e90]:
                - generic "查看其他本机改稿" [ref=f1e91] [cursor=pointer]
              - group [ref=f1e92]:
                - generic [ref=f1e93]:
                  - text: 白板标题
                  - textbox "白板标题" [ref=f1e94]: 把条件讲清楚
                - generic [ref=f1e95]:
                  - text: 讲解概要
                  - textbox "讲解概要" [ref=f1e96]: 匿名合成教学稿，保留观察、条件和反例。
                - group [ref=f1e97]:
                  - generic "1. 先核对观察" [ref=f1e98] [cursor=pointer]
                  - generic [ref=f1e99]:
                    - text: 这一幕的结构
                    - combobox "这一幕的结构" [ref=f1e100]:
                      - option "开场" [selected]
                      - option "概念"
                      - option "步骤"
                      - option "自我检验"
                  - generic [ref=f1e101]:
                    - text: 分幕标题
                    - textbox "分幕标题" [ref=f1e102]: 先核对观察
                  - generic [ref=f1e103]:
                    - text: 完整旁白
                    - textbox "完整旁白" [ref=f1e104]: "[whiteboard-fixture] 先核对观察。 保留未知条件，不把一次观察当成完整能力证明。"
                  - generic [ref=f1e105]:
                    - text: 板书正文
                    - textbox "板书正文" [ref=f1e106]: 完整说明首行。完整说明尾行。
                  - generic [ref=f1e107]:
                    - heading "完整要点" [level=3] [ref=f1e108]
                    - paragraph [ref=f1e109]: 每条要点应逐字出现在本幕旁白中。
                    - generic [ref=f1e110]:
                      - generic [ref=f1e111]:
                        - text: 要点 1
                        - textbox "要点 1" [ref=f1e112]: 先核对观察
                      - button "移除此要点" [ref=f1e113] [cursor=pointer]
                    - button "添加要点" [ref=f1e114] [cursor=pointer]
                  - generic [ref=f1e115]:
                    - text: 对照展示
                    - combobox "对照展示" [ref=f1e116]:
                      - option "文字讲解" [selected]
                      - option "对照表"
                      - option "公式"
                - group [ref=f1e117]:
                  - generic "2. 再比较条件" [ref=f1e118] [cursor=pointer]
                  - option "开场"
                  - option "概念" [selected]
                  - option "步骤"
                  - option "自我检验"
                  - option "文字讲解"
                  - option "对照表" [selected]
                  - option "公式"
                - group [ref=f1e119]:
                  - generic "3. 最后保留反例" [ref=f1e120] [cursor=pointer]
                  - option "开场"
                  - option "概念"
                  - option "步骤"
                  - option "自我检验" [selected]
                  - option "文字讲解"
                  - option "对照表"
                  - option "公式" [selected]
              - region "白板配图工作区" [ref=f1e121]:
                - generic [ref=f1e122]:
                  - generic [ref=f1e123]:
                    - text: TEACHING FIGURES
                    - heading "让这一幕更好理解" [level=3] [ref=f1e124]
                  - generic [ref=f1e125]: 图片模型 · gpt-image-2
                - paragraph [ref=f1e126]: 围绕知识点和提炼要点配图。文字模型独立选择，图片中的标签、数量和关系需要核对。
                - group [ref=f1e127]:
                  - generic [ref=f1e128]:
                    - text: 配图分幕
                    - combobox "配图分幕" [ref=f1e129]:
                      - option "1. 先核对观察" [selected]
                      - option "2. 再比较条件"
                      - option "3. 最后保留反例"
                  - generic [ref=f1e130]:
                    - text: 图片用途
                    - combobox "图片用途" [ref=f1e131]:
                      - option "概念说明" [selected]
                      - option "对照关系"
                      - option "情境示意"
                  - generic [ref=f1e132]:
                    - text: 希望图片说明什么
                    - textbox "希望图片说明什么" [ref=f1e133]:
                      - /placeholder: 例如：用两个有交集的圆说明概念关系，标签简短，保留必要条件。
                - generic [ref=f1e134]:
                  - button "预检配图范围" [ref=f1e135] [cursor=pointer]
                  - button "生成参考图" [disabled] [ref=f1e136]
                  - button "下载完整配图请求" [ref=f1e137] [cursor=pointer]
                - generic [ref=f1e139]:
                  - heading "本幕图片候选" [level=4] [ref=f1e140]
                  - generic [ref=f1e141]:
                    - generic [ref=f1e142]:
                      - text: 搜索图片要求
                      - textbox "搜索图片要求" [ref=f1e143]
                    - button "查找" [ref=f1e144] [cursor=pointer]
                  - generic "本幕图片候选"
                  - paragraph [ref=f1e145]: 尚无候选。完成预检并明确生成后，图片会保存在这里。
                  - generic [ref=f1e146]:
                    - button "上一页" [disabled] [ref=f1e147]
                    - generic [ref=f1e148]: 1 / 1
                    - button "下一页" [disabled] [ref=f1e149]
                - group [ref=f1e150]:
                  - generic "查看其他本机配图请求" [ref=f1e151] [cursor=pointer]
              - button "保存完整改稿" [disabled] [ref=f1e153]
            - group [ref=f1e154]:
              - generic "阅读AI最初原稿" [ref=f1e155] [cursor=pointer]
            - button "查看完整修改历史" [ref=f1e157] [cursor=pointer]
            - generic [ref=f1e158]:
              - paragraph [ref=f1e159]: 保存后保持AI生成、待内容核对；不会写入能力或评测结果。
              - button "确认并保存这份白板" [ref=f1e160] [cursor=pointer]
        - complementary "白板与候选历史" [ref=f1e161]:
          - generic [ref=f1e162]:
            - heading "我的白板" [level=2] [ref=f1e163]
            - button "＋ 新白板" [ref=f1e164] [cursor=pointer]
          - generic [ref=f1e165]:
            - button "教学草稿" [pressed] [ref=f1e166] [cursor=pointer]
            - button "已保存" [ref=f1e167] [cursor=pointer]
          - generic [ref=f1e168]:
            - generic [ref=f1e169]: 搜索我的白板
            - textbox "搜索我的白板" [ref=f1e170]:
              - /placeholder: 搜索主题或标题
          - button "待你核对 · 本人主题 把条件讲清楚 Browser fixture · not a real model" [ref=f1e171] [cursor=pointer]:
            - generic [ref=f1e172]: 待你核对 · 本人主题
            - generic [ref=f1e173]: 把条件讲清楚
            - generic [ref=f1e174]: Browser fixture · not a real model
          - generic [ref=f1e175]:
            - button "上一页" [disabled] [ref=f1e176]
            - generic [ref=f1e177]: 1 / 1
            - button "下一页" [disabled] [ref=f1e178]
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
> 21  |     expect(response.ok, path + ': ' + response.status).toBe(true); return (await response.json()).data;
      |                                                        ^ Error: /learning/studio/topic-whiteboards/drafts/topic_draft_f6fb1e54-c756-4555-a57e-2fd77435d133/content: 400
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
  50  |   await pane.getByRole('button', { name: '预检配图范围', exact: true }).click();
  51  |   await expect(pane.getByText('本次完整教学范围与配图要求', { exact: true })).toBeVisible();
  52  |   await expect(pane.getByRole('button', { name: '生成参考图', exact: true })).toBeEnabled();
  53  |   await pane.getByRole('button', { name: '生成参考图', exact: true }).click(); return pane;
  54  | }
  55  | 
  56  | async function formulaBoard(page: Page, expressions: string[], withFigure = false) {
  57  |   const f = await fixture(page); await generate(page); await ready(page);
  58  |   if (withFigure) {
  59  |     const pane = await figure(page); await pane.getByRole('checkbox', { name: '我已阅读图片，并核对本次要使用的标签和关系。' }).check();
  60  |     await pane.getByRole('button', { name: '选入当前完整稿', exact: true }).click(); await page.getByRole('button', { name: '保存完整改稿', exact: true }).click();
  61  |     await expect(page.locator('.tw-review')).toContainText('针对旧稿');
  62  |   }
  63  |   const id = new URL(page.url()).searchParams.get('draft')!, view = await f.call(base + '/drafts/' + id, undefined, 'GET');
  64  |   const content = { ...view.content, scenes: expressions.map((latex, index) => ({ ...view.content.scenes[index % 3], title: '公式示例 ' + (index + 1),
  65  |     narration: '[whiteboard-fixture] 核对完整表达。 [whiteboard-fixture] 保留最后一项。',
  66  |     figure: withFigure && index === 0 ? view.content.scenes[0].figure : null, exhibit: { kind: 'formula', latex, explanation: '分式、根号与对齐关系需要完整保留，最后一项不能省略。' } })) };
  67  |   const edited = await f.call(base + '/drafts/' + id + '/content', { expectedRevision: view.revision, contentFingerprint: view.contentFingerprint, content, requestKey: randomUUID() }, 'PATCH');
  68  |   await f.call(base + '/drafts/' + id + '/confirm', { expectedRevision: edited.revision, contentFingerprint: edited.contentFingerprint,
  69  |     acknowledgeAiGeneratedContent: true, acknowledgeUnreviewedChanges: true, requestKey: randomUUID() });
  70  |   await page.reload(); await page.getByRole('button', { name: '打开已保存白板', exact: true }).click();
  71  |   const player = page.getByRole('dialog', { name: '白板视频' }); await expect(player).toBeVisible();
  72  |   return { ...f, player };
  73  | }
  74  | 
  75  | test('topic-formula: complete vector fractions, aligned roots and Unicode fit narrow notes and preserve copyable source and safe fallback', async ({ page }) => {
  76  |   const expressions = ['\\frac{1}{2}+\\sqrt{x^2+1}', '\\begin{aligned}a&=b+c\\\\d&=\\frac{e}{f}\\end{aligned}', '\\frac{1}{2}\\text{个整体}', '\\unknownprivate{最后一项}', 'a+'.repeat(280) + 'z'];
  77  |   const { player } = await formulaBoard(page, expressions);
  78  |   for (const width of [390, 768, 1440]) {
  79  |     await page.setViewportSize({ width, height: 1000 });
  80  |     for (const [index, latex] of expressions.entries()) {
  81  |       const detail = player.getByLabel('完整讲稿与要点').locator('details').filter({ has: page.locator(':scope > summary', { hasText: '公式示例 ' + (index + 1) }) });
  82  |       if (!(await detail.getAttribute('open') !== null)) await detail.locator(':scope > summary').click();
  83  |       const formula = detail.locator('.wb-complete-formula');
  84  |       if (index !== 3) { await expect(formula.locator('.wb-formula-vector svg')).toHaveCount(1); await expect(formula.locator('math')).toHaveCount(1); }
  85  |       else await expect(formula.getByRole('status')).toContainText('分页保留原式');
  86  |       const raw = formula.locator('details'); if (await raw.getAttribute('open') === null) await raw.locator('summary').click();
  87  |       expect(await raw.locator('pre').textContent()).toBe(latex);
  88  |       expect(await formula.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  89  |     }
  90  |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  91  |     await page.screenshot({ path: join(browserEvidence('topic-whiteboard'), 'topic-formula-reader-' + width + '.png'), fullPage: false });
  92  |   }
  93  |   expect(await page.locator('[href^="javascript:"],script[src*="mathjax"],image[href^="http"]').count()).toBe(0);
  94  | });
  95  | 
  96  | test('topic-formula: actual shared image and fraction/root/alignment vector video decodes with full audio and caption timeline', async ({ page }) => {
  97  |   const { player } = await formulaBoard(page, ['\\frac{1}{2}+\\sqrt{x^2+1}', '\\begin{aligned}a&=b+c\\\\d&=\\frac{e}{f}\\end{aligned}', 'a+'.repeat(280) + 'z'], true);
  98  |   await expect(player.locator('.sa-whiteboard-notice')).not.toContainText('无法解码');
  99  |   await expect(player.locator('.wb-formula-vector svg').first()).toBeVisible();
  100 |   const download = page.waitForEvent('download', { timeout: 30000 }); await player.getByRole('button', { name: '导出视频', exact: true }).click();
  101 |   const video = (await (await download).path())!, directory = browserEvidence('topic-whiteboard'); copyFileSync(video, join(directory, 'topic-formula-video.webm'));
  102 |   const probe = JSON.parse(execFileSync(process.env.STUDY_FFPROBE ?? 'ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', video], { windowsHide: true, encoding: 'utf8' }));
  103 |   expect(probe.streams.some((stream: any) => stream.codec_type === 'audio')).toBe(true); expect(probe.streams.some((stream: any) => stream.codec_type === 'video')).toBe(true);
  104 |   const receipts: unknown[] = [];
  105 |   for (const [name, time, left] of [['first', .2, 740], ['aligned', 4.2, 88], ['last', 11.7, 88]] as const) {
  106 |     const frame = spawnSync(process.env.STUDY_FFMPEG ?? 'ffmpeg', ['-v', 'error', '-ss', String(time), '-i', video, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  107 |     expect(frame.status).toBe(0); const decoded = await sharp(frame.stdout).removeAlpha().raw().toBuffer({ resolveWithObject: true }); let ink = 0;
  108 |     for (let y = 220; y < 500; y++) for (let x = left; x < 1190; x++) { const offset = (y * 1280 + x) * 3;
  109 |       if (decoded.data[offset] < 120 && decoded.data[offset + 1] < 130 && decoded.data[offset + 2] < 120) ink++; }
  110 |     expect(ink).toBeGreaterThan(100); receipts.push({ name, time, ink }); writeFileSync(join(directory, 'topic-formula-video-' + name + '.png'), frame.stdout);
  111 |   }
  112 |   writeFileSync(join(directory, 'topic-formula-video-probe.json'), JSON.stringify({ probe, frames: receipts }, null, 2) + '\n');
  113 |   const captions = page.waitForEvent('download'); await player.getByRole('button', { name: '导出字幕', exact: true }).click(); const srt = readFileSync((await (await captions).path())!, 'utf8');
  114 |   expect(srt).toContain('00:00:00,000 --> 00:00:02,000'); expect(srt).toContain('00:00:10,000 --> 00:00:12,000'); expect(srt).toContain('保留最后一项');
  115 |   writeFileSync(join(directory, 'topic-formula-video.srt'), srt);
  116 |   const later: string[] = []; page.on('download', item => later.push(item.suggestedFilename()));
  117 |   await player.getByRole('button', { name: '导出视频', exact: true }).click(); await player.getByRole('button', { name: '取消导出', exact: true }).click();
  118 |   await expect(player.locator('.sa-whiteboard-notice')).toContainText('没有下载半成品'); expect(later).toEqual([]);
  119 |   const retained = page.waitForEvent('download'); await player.getByRole('button', { name: '导出字幕', exact: true }).click(); expect(readFileSync((await (await retained).path())!, 'utf8')).toBe(srt);
  120 | });
  121 | 
```
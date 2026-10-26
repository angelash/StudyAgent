# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topic-whiteboard.spec.ts >> topic-figure: restores a lost original image prepare without duplicate writes, edits its PNG and publishes an image with pause/read/resume
- Location: tests\e2e\topic-whiteboard.spec.ts:65:5

# Error details

```
TimeoutError: locator.fill: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('region', { name: '白板配图工作区' }).getByLabel('图片替代说明', { exact: true })

```

# Page snapshot

```yaml
- generic [active] [ref=f2e1]:
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
              - heading "AI 复核 · 未提出修改" [level=3] [ref=f2e83]
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
              - group [ref=f2e94]:
                - generic [ref=f2e95]:
                  - text: 白板标题
                  - textbox "白板标题" [ref=f2e96]: 把条件讲清楚
                - generic [ref=f2e97]:
                  - text: 讲解概要
                  - textbox "讲解概要" [ref=f2e98]: 匿名合成教学稿，保留观察、条件和反例。
                - group [ref=f2e99]:
                  - generic "1. 先核对观察" [ref=f2e100] [cursor=pointer]
                  - generic [ref=f2e101]:
                    - text: 这一幕的结构
                    - combobox "这一幕的结构" [ref=f2e102]:
                      - option "开场" [selected]
                      - option "概念"
                      - option "步骤"
                      - option "自我检验"
                  - generic [ref=f2e103]:
                    - text: 分幕标题
                    - textbox "分幕标题" [ref=f2e104]: 先核对观察
                  - generic [ref=f2e105]:
                    - text: 完整旁白
                    - textbox "完整旁白" [ref=f2e106]: "[whiteboard-fixture] 先核对观察。 保留未知条件，不把一次观察当成完整能力证明。"
                  - generic [ref=f2e107]:
                    - text: 板书正文
                    - textbox "板书正文" [ref=f2e108]: 完整说明首行。完整说明尾行。
                  - generic [ref=f2e109]:
                    - heading "完整要点" [level=3] [ref=f2e110]
                    - paragraph [ref=f2e111]: 每条要点应逐字出现在本幕旁白中。
                    - generic [ref=f2e112]:
                      - generic [ref=f2e113]:
                        - text: 要点 1
                        - textbox "要点 1" [ref=f2e114]: 先核对观察
                      - button "移除此要点" [ref=f2e115] [cursor=pointer]
                    - button "添加要点" [ref=f2e116] [cursor=pointer]
                  - generic [ref=f2e117]:
                    - text: 对照展示
                    - combobox "对照展示" [ref=f2e118]:
                      - option "文字讲解" [selected]
                      - option "对照表"
                      - option "公式"
                - group [ref=f2e119]:
                  - generic "2. 再比较条件" [ref=f2e120] [cursor=pointer]
                  - option "开场"
                  - option "概念" [selected]
                  - option "步骤"
                  - option "自我检验"
                  - option "文字讲解"
                  - option "对照表" [selected]
                  - option "公式"
                - group [ref=f2e121]:
                  - generic "3. 最后保留反例" [ref=f2e122] [cursor=pointer]
                  - option "开场"
                  - option "概念"
                  - option "步骤"
                  - option "自我检验" [selected]
                  - option "文字讲解"
                  - option "对照表"
                  - option "公式" [selected]
              - region "白板配图工作区" [ref=f2e123]:
                - generic [ref=f2e124]:
                  - generic [ref=f2e125]:
                    - text: TEACHING FIGURES
                    - heading "让这一幕更好理解" [level=3] [ref=f2e126]
                  - generic [ref=f2e127]: 图片模型 · gpt-image-2
                - paragraph [ref=f2e128]: 围绕知识点和提炼要点配图。文字模型独立选择，图片中的标签、数量和关系需要核对。
                - status [ref=f2e129]: 原操作已确认。图片就绪后可阅读核对；选用仍需保存完整改稿。
                - group [ref=f2e130]:
                  - generic [ref=f2e131]:
                    - text: 配图分幕
                    - combobox "配图分幕" [ref=f2e132]:
                      - option "1. 先核对观察" [selected]
                      - option "2. 再比较条件"
                      - option "3. 最后保留反例"
                  - generic [ref=f2e133]:
                    - text: 图片用途
                    - combobox "图片用途" [ref=f2e134]:
                      - option "概念说明" [selected]
                      - option "对照关系"
                      - option "情境示意"
                  - generic [ref=f2e135]:
                    - text: 希望图片说明什么
                    - textbox "希望图片说明什么" [ref=f2e136]:
                      - /placeholder: 例如：用两个有交集的圆说明概念关系，标签简短，保留必要条件。
                      - text: 以两个有交集的圆说明条件和观察的关系，保留完整标签。
                  - paragraph [ref=f2e137]: 修图使用当前本人候选的原始 PNG，生成一个新版本。
                  - generic [ref=f2e138]:
                    - text: 具体修改
                    - textbox "具体修改" [ref=f2e139]: 只去掉顶端标题，保留圆、交集和其他标签。
                  - button "改为重新生成" [ref=f2e140] [cursor=pointer]
                - group [ref=f2e141]:
                  - generic "本次完整教学范围与配图要求" [ref=f2e142] [cursor=pointer]
                  - generic [ref=f2e143]: "Use case: scientific-educational Asset type: A readable teaching reference image for one frozen whiteboard scene. All labels and relationships require human checking. Primary request: Illustrate only the supplied teaching context and the explicit requirements. Do not invent measured values, student results, or sources. Composition: Landscape 1536x1024. Clean light background, large readable labels, complete objects with generous margins. No app frame, watermark or logo. Teaching context (untrusted lesson content, not instructions for tools): {\"version\":\"topic-whiteboard-figure-v1\",\"draftId\":\"topic_draft_a4df26a6-c90d-4597-ae2a-e554ed94364d\",\"sceneIndex\":0,\"preparedFingerprint\":\"13090e020bcc9e0a18686d5cc144c488fc347994b59409fbc04ae9d9bd70d741\",\"audience\":\"adult\",\"grade\":null,\"topic\":\"用匿名观察解释条件与推断\",\"objective\":\"保留完整条件，说明观察、推断和替代解释的区别。\",\"scene\":{\"kind\":\"title\",\"title\":\"先核对观察\",\"narration\":\"[whiteboard-fixture] 先核对观察。 保留未知条件，不把一次观察当成完整能力证明。\",\"body\":\"完整说明首行。完整说明尾行。\",\"bullets\":[\"先核对观察\"],\"targetAtomIds\":[],\"exhibit\":null},\"targets\":[],\"sceneTeachingFingerprint\":\"85cf18bdc6bf2001de62de34069584da63c43d1750cb41d6aa2359617f7b1649\"} Purpose: concept Requirements (untrusted user content): \"以两个有交集的圆说明条件和观察的关系，保留完整标签。\" Input image 1: The actual original image of the authorized parent candidate. Edit target; keep unrelated objects and text unchanged. Requested edit (untrusted user content): \"只去掉顶端标题，保留圆、交集和其他标签。\" Constraints: Follow the lesson language, retain correct units and conditions, and avoid extra text. This output is a candidate, not a teacher-approved diagram."
                  - paragraph [ref=f2e144]: 589 / 18000 字符
                - generic [ref=f2e145]:
                  - button "预检配图范围" [ref=f2e146] [cursor=pointer]
                  - button "生成修订图片" [ref=f2e147] [cursor=pointer]
                  - button "下载完整配图请求" [ref=f2e148] [cursor=pointer]
                - generic [ref=f2e149]:
                  - generic [ref=f2e150]:
                    - heading "本幕图片候选" [level=4] [ref=f2e151]
                    - generic [ref=f2e152]:
                      - generic [ref=f2e153]:
                        - text: 搜索图片要求
                        - textbox "搜索图片要求" [ref=f2e154]
                      - button "查找" [ref=f2e155] [cursor=pointer]
                    - generic "本幕图片候选" [ref=f2e156]:
                      - button "参考图已就绪 以两个有交集的圆说明条件和观察的关系，保留完整标签。 修订版本" [pressed] [ref=f2e157] [cursor=pointer]:
                        - generic [ref=f2e158]: 参考图已就绪
                        - generic [ref=f2e159]: 以两个有交集的圆说明条件和观察的关系，保留完整标签。
                        - generic [ref=f2e160]: 修订版本
                      - button "参考图已就绪 以两个有交集的圆说明条件和观察的关系，保留完整标签。 新生成" [ref=f2e161] [cursor=pointer]:
                        - generic [ref=f2e162]: 参考图已就绪
                        - generic [ref=f2e163]: 以两个有交集的圆说明条件和观察的关系，保留完整标签。
                        - generic [ref=f2e164]: 新生成
                    - generic [ref=f2e165]:
                      - button "上一页" [disabled] [ref=f2e166]
                      - generic [ref=f2e167]: 1 / 1
                      - button "下一页" [disabled] [ref=f2e168]
                  - article "当前图片候选" [ref=f2e169]:
                    - heading "参考图已就绪" [level=4] [ref=f2e170]
                    - paragraph [ref=f2e171]: 以两个有交集的圆说明条件和观察的关系，保留完整标签。
                    - figure "AI参考图，标签和关系待核对。" [ref=f2e172]:
                      - button "放大参考图：先核对观察" [ref=f2e173]:
                        - img "先核对观察，图中概念和关系待核对。" [ref=f2e174]
                        - generic [aria-hidden] [ref=f2e175]: ↗
                    - generic [ref=f2e177]:
                      - text: 图片替代说明
                      - textbox "图片替代说明" [ref=f2e178]: 先核对观察，图中概念和关系待核对。
                    - generic [ref=f2e179]:
                      - text: 图注
                      - textbox "图注" [ref=f2e180]: AI参考图，标签和关系待核对。
                    - generic [ref=f2e181]:
                      - checkbox "我已阅读图片，并核对本次要使用的标签和关系。" [ref=f2e182]
                      - text: 我已阅读图片，并核对本次要使用的标签和关系。
                    - generic [ref=f2e183]:
                      - button "选入当前完整稿" [disabled] [ref=f2e184]
                      - button "以原图继续修订" [ref=f2e185] [cursor=pointer]
                - group [ref=f2e186]:
                  - generic "查看其他本机配图请求" [ref=f2e187] [cursor=pointer]
              - button "保存完整改稿" [disabled] [ref=f2e189]
            - group [ref=f2e190]:
              - generic "阅读AI最初原稿" [ref=f2e191] [cursor=pointer]
            - button "查看完整修改历史" [ref=f2e193] [cursor=pointer]
            - generic [ref=f2e194]:
              - paragraph [ref=f2e195]: 保存后保持AI生成、待内容核对；不会写入能力或评测结果。
              - button "确认并保存这份白板" [ref=f2e196] [cursor=pointer]
        - complementary "白板与候选历史" [ref=f2e197]:
          - generic [ref=f2e198]:
            - heading "我的白板" [level=2] [ref=f2e199]
            - button "＋ 新白板" [ref=f2e200] [cursor=pointer]
          - generic [ref=f2e201]:
            - button "教学草稿" [pressed] [ref=f2e202] [cursor=pointer]
            - button "已保存" [ref=f2e203] [cursor=pointer]
          - generic [ref=f2e204]:
            - generic [ref=f2e205]: 搜索我的白板
            - textbox "搜索我的白板" [ref=f2e206]:
              - /placeholder: 搜索主题或标题
          - button "待你核对 · 本人主题 把条件讲清楚 Browser fixture · not a real model" [ref=f2e207] [cursor=pointer]:
            - generic [ref=f2e208]: 待你核对 · 本人主题
            - generic [ref=f2e209]: 把条件讲清楚
            - generic [ref=f2e210]: Browser fixture · not a real model
          - generic [ref=f2e211]:
            - button "上一页" [disabled] [ref=f2e212]
            - generic [ref=f2e213]: 1 / 1
            - button "下一页" [disabled] [ref=f2e214]
```

# Test source

```ts
  1   | import { expect, test, type Page } from '@playwright/test';
  2   | import { createHash, randomUUID } from 'node:crypto';
  3   | import { readFileSync } from 'node:fs';
  4   | import { browserEvidence } from './evidence';
  5   | import { join } from 'node:path';
  6   | 
  7   | const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107'), base = '/learning/studio/topic-whiteboards';
  8   | const figureBase = '/learning/studio/topic-whiteboard-visuals';
  9   | // Complete in-flight overview/media routes before Playwright disposes their API responses.
  10  | test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });
  11  | async function fixture(page: Page, child = false) {
  12  |   const hash = createHash('sha256').update(test.info().testId).digest(), address = '198.19.' + hash[0] + '.' + hash[1];
  13  |   await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address });
  14  |   const principal = 'topic-browser-' + randomUUID() + '@local.test', credential = 'Topic-Browser-Only-20261026';
  15  |   let token = '';
  16  |   async function call(path: string, body?: unknown, method = 'POST') {
  17  |     const response = await fetch(api + '/api' + path, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address, ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  18  |       ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  19  |     expect(response.ok, path + ': ' + response.status).toBe(true); return (await response.json()).data;
  20  |   }
  21  |   const actor = await call('/auth/register', { principal, credential }); token = actor.token;
  22  |   let studentId: string | null = null;
  23  |   if (child) {
  24  |     const created = await call('/students', { nickname: '匿名AI白板学习者', grade: 5, preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }); studentId = created.profile.id;
  25  |     await call('/students/' + studentId + '/learning-scope', { subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null,
  26  |       textbookVersion: '匿名已学范围', learnedAtomIds: ['core:math:fractionadd'], currentAtomId: 'core:math:fractionadd', minutesPerSession: 15, progressMode: 'knowledge', selectedLessonIds: [] }, 'PUT');
  27  |   }
  28  |   await page.route('**/api/learning/studio/overview?*', async route => {
  29  |     const response = await route.fetch(); if (!response.ok()) { await route.fulfill({ response }); return; }
  30  |     const payload = await response.json(); payload.data.narrationAvailable = true; payload.data.speech = { available: true, provider: 'minimax', defaultVoice: 'fixture-a', voices: [{ id: 'fixture-a', label: '合成音轨 A' }] };
  31  |     await route.fulfill({ response, json: payload });
  32  |   });
  33  |   await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  34  |   await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  35  |   await page.goto('/studio/whiteboards'); await expect(page.getByLabel('讲解主题')).toBeVisible();
  36  |   await expect(page.getByLabel('选择大模型')).toHaveValue('deepseek-v4-flash');
  37  |   return { actor, call, studentId };
  38  | }
  39  | async function generate(page: Page, topic = '用匿名观察解释条件与推断') {
  40  |   await page.getByLabel('讲解主题').fill(topic); await page.getByLabel('希望弄懂什么').fill('保留完整条件，说明观察、推断和替代解释的区别。');
  41  |   await page.getByRole('button', { name: '预检主题与范围', exact: true }).click(); await expect(page.getByRole('button', { name: '生成教学稿', exact: true })).toBeEnabled();
  42  |   await page.getByRole('button', { name: '生成教学稿', exact: true }).click();
  43  | }
  44  | async function ready(page: Page) { await expect(page.locator('.tw-generation-state')).toHaveText('待你核对', { timeout: 25000 }); await expect(page.getByLabel('白板标题')).toBeVisible(); }
  45  | async function figure(page: Page, requirements = '以两个有交集的圆说明条件和观察的关系，保留完整标签。') {
  46  |   const pane = page.getByRole('region', { name: '白板配图工作区' });
  47  |   await pane.getByLabel('希望图片说明什么').fill(requirements);
  48  |   await pane.getByRole('button', { name: '预检配图范围', exact: true }).click();
  49  |   await expect(pane.getByText('本次完整教学范围与配图要求', { exact: true })).toBeVisible();
  50  |   await expect(pane.getByRole('button', { name: '生成参考图', exact: true })).toBeEnabled();
  51  |   await pane.getByRole('button', { name: '生成参考图', exact: true }).click(); return pane;
  52  | }
  53  | 
  54  | test('login forms cannot submit before their client handlers are ready', async ({ browser }) => {
  55  |   const context = await browser.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL });
  56  |   try {
  57  |     const page = await context.newPage();
  58  |     for (const path of ['/parent/login', '/student/login']) {
  59  |       await page.goto(path);
  60  |       for (const input of await page.locator('form input, form button').all()) await expect(input).toBeDisabled();
  61  |     }
  62  |   } finally { await context.close(); }
  63  | });
  64  | 
  65  | test('topic-figure: restores a lost original image prepare without duplicate writes, edits its PNG and publishes an image with pause/read/resume', async ({ page }) => {
  66  |   const f = await fixture(page); await generate(page); await ready(page); const id = new URL(page.url()).searchParams.get('draft')!;
  67  |   let dropped = true, writes = 0;
  68  |   await page.route('**/api/learning/studio/topic-whiteboard-visuals', async route => {
  69  |     if (route.request().method() !== 'POST') return route.continue(); writes++;
  70  |     if (dropped) { dropped = false; expect((await route.fetch()).status()).toBe(201); await route.abort('failed'); } else await route.continue();
  71  |   });
  72  |   await figure(page); const pane = page.getByRole('region', { name: '白板配图工作区' });
  73  |   await expect(pane.getByRole('button', { name: '恢复原配图请求', exact: true })).toBeEnabled(); await page.reload(); await ready(page);
  74  |   await pane.getByRole('button', { name: '恢复原配图请求', exact: true }).click();
  75  |   await expect(pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeVisible(); expect(writes).toBe(1);
  76  |   expect((await f.call(figureBase + '?draftId=' + id + '&sceneIndex=0', undefined, 'GET')).total).toBe(1);
  77  |   await pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true }).click();
  78  |   await expect(page.locator('.cl-figure-reader-sheet img')).toBeVisible(); await page.keyboard.press('Escape');
  79  |   await expect(pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeFocused();
  80  |   await pane.getByRole('button', { name: '以原图继续修订', exact: true }).click();
  81  |   await pane.getByLabel('具体修改').fill('只去掉顶端标题，保留圆、交集和其他标签。');
  82  |   await pane.getByRole('button', { name: '预检配图范围', exact: true }).click(); await expect(pane.getByRole('button', { name: '生成修订图片', exact: true })).toBeEnabled();
  83  |   await pane.getByRole('button', { name: '生成修订图片', exact: true }).click();
  84  |   await expect(pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeVisible();
> 85  |   await pane.getByLabel('图片替代说明', { exact: true }).fill('两个概念圆及其交集，说明观察和条件的关系。');
      |                                                    ^ TimeoutError: locator.fill: Timeout 15000ms exceeded.
  86  |   await pane.getByRole('checkbox', { name: '我已阅读图片，并核对本次要使用的标签和关系。' }).check();
  87  |   await pane.getByRole('button', { name: '选入当前完整稿', exact: true }).click(); await page.getByRole('button', { name: '保存完整改稿', exact: true }).click();
  88  |   await expect(page.locator('.tw-review')).toContainText('针对旧稿');
  89  |   const draft = await f.call(base + '/drafts/' + id, undefined, 'GET'); expect(draft.content.scenes[0].figure).toBeTruthy();
  90  |   const candidate = await f.call(figureBase + '/' + draft.content.scenes[0].figure.visualId, undefined, 'GET'); expect(candidate.operation).toBe('edit'); expect(candidate.parentVisualId).toBeTruthy();
  91  |   await page.getByRole('checkbox', { name: '我已阅读未确定问题或手工改稿，知晓仍需内容核对' }).check();
  92  |   await page.getByRole('button', { name: '确认并保存这份白板', exact: true }).click(); await page.getByRole('button', { name: '打开已保存白板', exact: true }).click();
  93  |   const player = page.getByRole('dialog', { name: '白板视频' }); await expect(player).toBeVisible();
  94  |   await expect(player.getByRole('button', { name: '放大参考图：先核对观察', exact: true }).first()).toBeVisible();
  95  |   await player.getByRole('button', { name: '播放', exact: true }).click();
  96  |   await player.getByRole('button', { name: '放大参考图：先核对观察', exact: true }).first().click();
  97  |   const unit = await page.locator('.wb-current-sentence').getAttribute('data-unit-id');
  98  |   await expect(page.locator('.cl-figure-reader-sheet')).toBeVisible(); await expect(player.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  99  |   await page.keyboard.press('Escape'); await expect(player).toBeVisible(); await expect(page.locator('.cl-figure-reader-sheet')).toHaveCount(0);
  100 |   await expect(page.locator('.wb-current-sentence')).toHaveAttribute('data-unit-id', unit!);
  101 |   await page.screenshot({ path: join(browserEvidence('topic-whiteboard'), 'topic-figure-saved-player.png'), fullPage: true });
  102 |   const board = await f.call(base + '/' + (await f.call(base + '/drafts/' + id, undefined, 'GET')).whiteboardId, undefined, 'GET');
  103 |   expect(JSON.stringify(board)).not.toContain(candidate.id); expect(board.scenes[0].figure.sha256).toBe(candidate.sha256);
  104 | });
  105 | 
  106 | test('topic-figure: uncached complete image commands block leaving until their exact download and changed inputs require another copy', async ({ page }) => {
  107 |   await fixture(page); await generate(page); await ready(page);
  108 |   await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) {
  109 |     if (key.startsWith('studyagent.topic-whiteboard.figures.')) throw new DOMException('Synthetic unavailable image storage', 'QuotaExceededError'); return original.call(this, key, value);
  110 |   }; });
  111 |   let writes = 0;
  112 |   await page.route('**/api/learning/studio/topic-whiteboard-visuals', async route => {
  113 |     if (route.request().method() !== 'POST') return route.continue(); writes++; expect((await route.fetch()).status()).toBe(201); await route.abort('failed');
  114 |   });
  115 |   const pane = await figure(page, '即使本机拒写，也要保留这一完整需求及原图生成命令。');
  116 |   await expect(pane.getByRole('button', { name: '恢复原配图请求', exact: true })).toBeEnabled();
  117 |   await page.getByRole('button', { name: '＋ 新白板', exact: true }).click(); await expect(pane).toBeVisible();
  118 |   const download = page.waitForEvent('download'); await pane.getByRole('button', { name: '下载完整配图请求', exact: true }).click();
  119 |   const saved = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
  120 |   expect(saved.pending.body).toMatchObject({ operation: 'generate', requirements: '即使本机拒写，也要保留这一完整需求及原图生成命令。' });
  121 |   expect(saved.pending.body.requestKey).toBeTruthy(); expect(saved.draftId).toBe(saved.pending.body.draftId); expect(writes).toBe(1);
  122 |   await page.getByRole('button', { name: '＋ 新白板', exact: true }).click(); await expect(pane).toHaveCount(0);
  123 | });
  124 | 
  125 | test('topic-figure: two actual tabs retain separate full figure inputs and metadata across reloads', async ({ page }) => {
  126 |   await fixture(page); await generate(page); await ready(page); const second = await page.context().newPage();
  127 |   try {
  128 |     await second.goto(page.url()); await ready(second);
  129 |     const firstPane = page.getByRole('region', { name: '白板配图工作区' }), secondPane = second.getByRole('region', { name: '白板配图工作区' });
  130 |     await firstPane.getByLabel('希望图片说明什么').fill('第一标签页完整的配图要求。'); await secondPane.getByLabel('希望图片说明什么').fill('第二标签页不同的配图要求。');
  131 |     const copies = () => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('studyagent.topic-whiteboard.figures.')).map(key => JSON.parse(localStorage.getItem(key)!).form.requirements));
  132 |     await expect.poll(copies).toContain('第一标签页完整的配图要求。'); await expect.poll(copies).toContain('第二标签页不同的配图要求。');
  133 |     await page.reload(); await ready(page); await expect(firstPane.getByLabel('希望图片说明什么')).toHaveValue('第一标签页完整的配图要求。');
  134 |     await second.reload(); await ready(second); await expect(secondPane.getByLabel('希望图片说明什么')).toHaveValue('第二标签页不同的配图要求。');
  135 |   } finally { await second.close(); }
  136 | });
  137 | 
  138 | for (const width of [390, 768, 1440]) test('topic-figure: complete verified image and keyboard reader fit ' + width, async ({ page }) => {
  139 |   await page.setViewportSize({ width, height: 900 }); await fixture(page); await generate(page); await ready(page); const pane = await figure(page);
  140 |   await expect(pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeVisible();
  141 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  142 |   await pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true }).click();
  143 |   const reader = page.locator('.cl-figure-reader-sheet'); await expect(reader).toBeVisible();
  144 |   const image = reader.locator('img'); expect(await image.evaluate((item: HTMLImageElement) => [item.naturalWidth, item.naturalHeight])).toEqual([1536, 1024]);
  145 |   expect(await reader.evaluate(item => item.scrollWidth <= item.clientWidth + 1)).toBe(true);
  146 |   await page.screenshot({ path: join(browserEvidence('topic-whiteboard'), 'topic-figure-reader-' + width + '.png'), fullPage: true });
  147 |   await page.keyboard.press('Escape'); await expect(reader).toHaveCount(0);
  148 |   await expect(pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeFocused();
  149 | });
  150 | 
  151 | test('adult original generation, lost edit and confirmation replies recover without duplicates and reach a complete table/formula player', async ({ page }) => {
  152 |   const f = await fixture(page); let dropped = true;
  153 |   await page.route('**/api/learning/studio/topic-whiteboards/drafts', async route => {
  154 |     if (route.request().method() === 'POST' && dropped) { dropped = false; expect((await route.fetch()).status()).toBe(201); await route.abort('failed'); } else await route.continue();
  155 |   });
  156 |   await generate(page); await expect(page.getByRole('button', { name: '恢复原生成请求', exact: true })).toBeEnabled(); await page.reload();
  157 |   await page.getByRole('button', { name: '恢复原生成请求', exact: true }).click(); await ready(page);
  158 |   const id = new URL(page.url()).searchParams.get('draft')!;
  159 |   expect((await f.call(base + '/drafts', undefined, 'GET')).total).toBe(1);
  160 |   let editDropped = true, editWrites = 0;
  161 |   await page.route('**/api/learning/studio/topic-whiteboards/drafts/*/content', async route => {
  162 |     editWrites++;
  163 |     if (editDropped) { editDropped = false; expect((await route.fetch()).status()).toBe(200); await route.abort('failed'); } else await route.continue();
  164 |   });
  165 |   await page.getByLabel('讲解概要').fill('保留这段完整的本机修订说明。');
  166 |   await expect(page.getByRole('button', { name: '确认并保存这份白板', exact: true })).toBeDisabled();
  167 |   await page.getByRole('button', { name: '保存完整改稿', exact: true }).click(); await expect(page.getByRole('button', { name: '恢复原修改请求', exact: true })).toBeEnabled();
  168 |   await page.reload(); await ready(page); await expect(page.getByLabel('讲解概要')).toHaveValue('保留这段完整的本机修订说明。');
  169 |   await page.getByRole('button', { name: '恢复原修改请求', exact: true }).click(); await expect(page.locator('.tw-review')).toContainText('针对旧稿');
  170 |   expect(editWrites).toBe(1);
  171 |   await expect(page.getByRole('button', { name: '确认并保存这份白板', exact: true })).toBeDisabled();
  172 |   await page.getByRole('checkbox', { name: '我已阅读未确定问题或手工改稿，知晓仍需内容核对' }).check();
  173 |   let confirmationDropped = true, confirmationWrites = 0;
  174 |   await page.route('**/api/learning/studio/topic-whiteboards/drafts/*/confirm', async route => {
  175 |     confirmationWrites++;
  176 |     if (confirmationDropped) { confirmationDropped = false; expect((await route.fetch()).status()).toBe(201); await route.abort('failed'); } else await route.continue();
  177 |   });
  178 |   await page.getByRole('button', { name: '确认并保存这份白板', exact: true }).click(); await expect(page.getByRole('button', { name: '恢复原确认请求', exact: true })).toBeEnabled();
  179 |   await page.reload(); await page.getByRole('button', { name: '恢复原确认请求', exact: true }).click();
  180 |   await page.getByRole('button', { name: '打开已保存白板', exact: true }).click(); await expect(page.getByRole('dialog', { name: '白板视频' })).toBeVisible();
  181 |   expect(confirmationWrites).toBe(1);
  182 |   await expect(page.locator('.wb-ai-origin')).toContainText('AI生成');
  183 |   await page.getByLabel('完整讲稿与要点').locator('details').nth(1).locator('summary').click(); await expect(page.getByRole('table')).toContainText('完整尾行条件');
  184 |   await page.getByLabel('完整讲稿与要点').locator('details').nth(2).locator(':scope > summary').click(); await expect(page.locator('math')).toBeVisible(); await expect(page.locator('.wb-complete-formula')).toContainText('计数单位相同');
  185 |   const view = await f.call(base + '/drafts/' + id, undefined, 'GET'); expect(view).toMatchObject({ status: 'confirmed', modelId: 'deepseek-v4-flash', studentId: null, subject: null });
```
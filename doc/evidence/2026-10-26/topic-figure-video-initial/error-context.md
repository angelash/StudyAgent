# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topic-whiteboard.spec.ts >> topic-figure: restores a lost original image prepare without duplicate writes, edits its PNG and publishes an image with pause/read/resume
- Location: tests\e2e\topic-whiteboard.spec.ts:67:5

# Error details

```
TimeoutError: page.waitForEvent: Timeout 15000ms exceeded while waiting for event "download"
=========================== logs ===========================
waiting for event "download"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=f3e1]:
  - alert [ref=f3e2]
  - main [ref=f3e3]:
    - complementary "学习工作台导航" [ref=f3e4]:
      - link "StudyAgent" [ref=f3e5] [cursor=pointer]:
        - /url: /studio
      - navigation [ref=f3e9]:
        - link "Home" [ref=f3e10] [cursor=pointer]:
          - /url: /studio?view=home
          - generic [ref=f3e13]: 首页
        - link "Courses" [ref=f3e14] [cursor=pointer]:
          - /url: /studio?view=courses
          - generic [ref=f3e17]: 课程
        - link "Calendar" [ref=f3e18] [cursor=pointer]:
          - /url: /studio?view=calendar
          - generic [ref=f3e21]: 学习动态
        - link "History" [ref=f3e22] [cursor=pointer]:
          - /url: /studio?view=history
          - generic [ref=f3e25]: 历史
        - link "Materials" [ref=f3e26] [cursor=pointer]:
          - /url: /studio?view=materials
          - generic [ref=f3e29]: 资料
        - link "AI Whiteboards" [ref=f3e30] [cursor=pointer]:
          - /url: /studio/whiteboards
          - generic [ref=f3e33]: AI白板
      - generic [ref=f3e34]:
        - heading "继续学习" [level=2] [ref=f3e35]
        - link "讲座社会学想象力 社会学概论" [ref=f3e36] [cursor=pointer]:
          - /url: /studio/classroom
          - text: 讲座社会学想象力
          - generic [ref=f3e37]: 社会学概论
      - generic [ref=f3e38]:
        - heading "近期活动" [level=2] [ref=f3e39]
        - paragraph [ref=f3e40]: 开始学习后，活动会出现在这里。
      - link "返回学习首页 →" [ref=f3e42] [cursor=pointer]:
        - /url: /learn?subject=math
    - generic [ref=f3e43]:
      - generic [ref=f3e44]:
        - generic [ref=f3e45]:
          - text: WHITEBOARD STUDIO
          - heading "从一个问题开始，讲清每一步。" [level=1] [ref=f3e46]
          - paragraph [ref=f3e47]: 先生成教学稿，完整核对后再保存。AI 讲解需要内容核对。
        - link "返回学习工作台 →" [ref=f3e48] [cursor=pointer]:
          - /url: /studio
      - generic [ref=f3e49]:
        - complementary [ref=f3e50]:
          - generic [ref=f3e51]:
            - text: NEW BOARD
            - heading "这次想弄懂什么？" [level=2] [ref=f3e52]
          - generic [ref=f3e53]:
            - text: 学习对象
            - combobox "白板学习对象" [ref=f3e54]:
              - option "我自己 · 成人主题" [selected]
          - region "新建AI白板" [ref=f3e55]:
            - group [ref=f3e56]:
              - generic [ref=f3e57]:
                - text: 讲解主题
                - textbox "讲解主题" [ref=f3e58]:
                  - /placeholder: 例如：为什么先统一单位，才能比较和合并？
                  - text: 用匿名观察解释条件与推断
              - generic [ref=f3e59]:
                - text: 希望弄懂什么
                - textbox "希望弄懂什么" [ref=f3e60]:
                  - /placeholder: 想理解的区别、步骤，或一个具体困惑
                  - text: 保留完整条件，说明观察、推断和替代解释的区别。
              - generic [ref=f3e62]:
                - generic [ref=f3e63]: 模型
                - combobox "选择大模型" [ref=f3e64] [cursor=pointer]:
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
            - status [ref=f3e65]: 已恢复此标签页的原主题与模型选择。
            - generic [ref=f3e66]:
              - button "预检主题与范围" [ref=f3e67] [cursor=pointer]
              - button "生成教学稿" [disabled] [ref=f3e68]
            - button "下载原主题与请求" [ref=f3e69] [cursor=pointer]
            - group [ref=f3e70]:
              - generic "查看其他本机主题" [ref=f3e71] [cursor=pointer]
        - region "白板工作区" [ref=f3e72]:
          - generic [ref=f3e73]:
            - text: SAVED BOARD
            - heading "把条件讲清楚" [level=2] [ref=f3e74]
            - paragraph [ref=f3e75]: AI生成 · 待内容核对 · Browser fixture · not a real model
            - button "继续阅读" [ref=f3e76] [cursor=pointer]
            - button "查看自己的原稿" [ref=f3e77] [cursor=pointer]
          - dialog "白板视频" [ref=f3e78]:
            - generic [ref=f3e79]:
              - generic [ref=f3e80]:
                - generic [ref=f3e81]: WHITEBOARD SESSION / 原白板
                - heading "把条件讲清楚" [level=2] [ref=f3e82]
                - paragraph [ref=f3e83]: 逐句云语音 · 实际音轨结束后继续 · 板书按完整要点呈现
                - paragraph [ref=f3e84]: AI生成 · 待内容核对 · Browser fixture · not a real model
              - button "关闭白板" [ref=f3e85] [cursor=pointer]: ×
            - generic [ref=f3e86]:
              - generic [ref=f3e87]:
                - generic [ref=f3e88]:
                  - generic "先核对观察" [ref=f3e89]
                  - figure "比较观察与条件，保留这条完整图注。" [ref=f3e90]:
                    - button "放大参考图：先核对观察" [ref=f3e91]:
                      - generic [aria-hidden] [ref=f3e92]: ↗
                - paragraph [ref=f3e93]: "[whiteboard-fixture] 先核对观察。"
                - generic [ref=f3e94]:
                  - generic [ref=f3e95]: 播放进度（估计阅读）
                  - slider "播放进度（估计阅读）" [ref=f3e96] [cursor=pointer]: "0"
                - generic [ref=f3e97]:
                  - button "上一句" [disabled] [ref=f3e98]: ←
                  - button "播放" [ref=f3e99] [cursor=pointer]: ▶
                  - button "下一句" [ref=f3e100] [cursor=pointer]: →
                  - generic [ref=f3e101]: 1 / 6 句
                  - combobox "阅读方式" [ref=f3e102] [cursor=pointer]:
                    - option "文字阅读（估计时长）"
                    - option "云语音逐句播放" [selected]
                  - combobox "旁白音色" [ref=f3e103] [cursor=pointer]:
                    - option "合成音轨 A" [selected]
                  - combobox "播放速度" [ref=f3e104] [cursor=pointer]:
                    - option "0.75×"
                    - option "1×" [selected]
                    - option "1.25×"
                  - button "导出视频" [ref=f3e105] [cursor=pointer]
                  - button "导出字幕" [ref=f3e106] [cursor=pointer]
                - status [ref=f3e107]: 当前句语音未能准备好，请重试或选择文字阅读。
                - generic [ref=f3e108]:
                  - button "01 先核对观察" [ref=f3e109] [cursor=pointer]:
                    - generic [ref=f3e110]: "01"
                    - text: 先核对观察
                  - button "02 再比较条件" [ref=f3e111] [cursor=pointer]:
                    - generic [ref=f3e112]: "02"
                    - text: 再比较条件
                  - button "03 最后保留反例" [ref=f3e113] [cursor=pointer]:
                    - generic [ref=f3e114]: "03"
                    - text: 最后保留反例
              - complementary "完整讲稿与要点" [ref=f3e115]:
                - heading "逐句讲稿" [level=3] [ref=f3e116]
                - paragraph [ref=f3e117]: 点击一句定位。观看与续播不计作掌握。
                - list [ref=f3e118]:
                  - listitem [ref=f3e119]:
                    - button "[whiteboard-fixture] 先核对观察。" [ref=f3e120] [cursor=pointer]
                  - listitem [ref=f3e121]:
                    - button "保留未知条件，不把一次观察当成完整能力证明。" [ref=f3e122] [cursor=pointer]
                  - listitem [ref=f3e123]:
                    - button "[whiteboard-fixture] 再比较条件。" [ref=f3e124] [cursor=pointer]
                  - listitem [ref=f3e125]:
                    - button "保留未知条件，不把一次观察当成完整能力证明。" [ref=f3e126] [cursor=pointer]
                  - listitem [ref=f3e127]:
                    - button "[whiteboard-fixture] 最后保留反例。" [ref=f3e128] [cursor=pointer]
                  - listitem [ref=f3e129]:
                    - button "保留未知条件，不把一次观察当成完整能力证明。" [ref=f3e130] [cursor=pointer]
                - heading "完整笔记与来源" [level=3] [ref=f3e131]
                - group [ref=f3e132]:
                  - generic "先核对观察" [ref=f3e133] [cursor=pointer]
                  - paragraph [ref=f3e134]: 完整说明首行。完整说明尾行。
                  - list [ref=f3e135]:
                    - listitem [ref=f3e136]: 先核对观察
                  - figure "比较观察与条件，保留这条完整图注。" [ref=f3e137]:
                    - button "放大参考图：先核对观察" [ref=f3e138]:
                      - img "两个概念圆及其交集，说明观察和条件的关系。" [ref=f3e139]
                      - generic [aria-hidden] [ref=f3e140]: ↗
                - group [ref=f3e142]:
                  - generic "再比较条件" [ref=f3e143] [cursor=pointer]
                - group [ref=f3e144]:
                  - generic "最后保留反例" [ref=f3e145] [cursor=pointer]
                - button "下载续播位置" [ref=f3e146] [cursor=pointer]
        - complementary "白板与候选历史" [ref=f3e147]:
          - generic [ref=f3e148]:
            - heading "我的白板" [level=2] [ref=f3e149]
            - button "＋ 新白板" [ref=f3e150] [cursor=pointer]
          - generic [ref=f3e151]:
            - button "教学草稿" [pressed] [ref=f3e152] [cursor=pointer]
            - button "已保存" [ref=f3e153] [cursor=pointer]
          - generic [ref=f3e154]:
            - generic [ref=f3e155]: 搜索我的白板
            - textbox "搜索我的白板" [ref=f3e156]:
              - /placeholder: 搜索主题或标题
          - button "已保存白板 · 本人主题 把条件讲清楚 Browser fixture · not a real model" [ref=f3e157] [cursor=pointer]:
            - generic [ref=f3e158]: 已保存白板 · 本人主题
            - generic [ref=f3e159]: 把条件讲清楚
            - generic [ref=f3e160]: Browser fixture · not a real model
          - generic [ref=f3e161]:
            - button "上一页" [disabled] [ref=f3e162]
            - generic [ref=f3e163]: 1 / 1
            - button "下一页" [disabled] [ref=f3e164]
```

# Test source

```ts
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
  50  |   await pane.getByRole('button', { name: '预检配图范围', exact: true }).click();
  51  |   await expect(pane.getByText('本次完整教学范围与配图要求', { exact: true })).toBeVisible();
  52  |   await expect(pane.getByRole('button', { name: '生成参考图', exact: true })).toBeEnabled();
  53  |   await pane.getByRole('button', { name: '生成参考图', exact: true }).click(); return pane;
  54  | }
  55  | 
  56  | test('login forms cannot submit before their client handlers are ready', async ({ browser }) => {
  57  |   const context = await browser.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL });
  58  |   try {
  59  |     const page = await context.newPage();
  60  |     for (const path of ['/parent/login', '/student/login']) {
  61  |       await page.goto(path);
  62  |       for (const input of await page.locator('form input, form button').all()) await expect(input).toBeDisabled();
  63  |     }
  64  |   } finally { await context.close(); }
  65  | });
  66  | 
  67  | test('topic-figure: restores a lost original image prepare without duplicate writes, edits its PNG and publishes an image with pause/read/resume', async ({ page }) => {
  68  |   const f = await fixture(page); await generate(page); await ready(page); const id = new URL(page.url()).searchParams.get('draft')!;
  69  |   let dropped = true, writes = 0;
  70  |   await page.route('**/api/learning/studio/topic-whiteboard-visuals', async route => {
  71  |     if (route.request().method() !== 'POST') return route.continue(); writes++;
  72  |     if (dropped) { dropped = false; expect((await route.fetch()).status()).toBe(201); await route.abort('failed'); } else await route.continue();
  73  |   });
  74  |   await figure(page); const pane = page.getByRole('region', { name: '白板配图工作区' });
  75  |   await expect(pane.getByRole('button', { name: '恢复原配图请求', exact: true })).toBeEnabled(); await page.reload(); await ready(page);
  76  |   await pane.getByRole('button', { name: '恢复原配图请求', exact: true }).click();
  77  |   await expect(pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeVisible(); expect(writes).toBe(1);
  78  |   expect((await f.call(figureBase + '?draftId=' + id + '&sceneIndex=0', undefined, 'GET')).total).toBe(1);
  79  |   await pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true }).click();
  80  |   await expect(page.locator('.cl-figure-reader-sheet img')).toBeVisible(); await page.keyboard.press('Escape');
  81  |   await expect(pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeFocused();
  82  |   await pane.getByRole('button', { name: '以原图继续修订', exact: true }).click();
  83  |   await pane.getByLabel('具体修改').fill('只去掉顶端标题，保留圆、交集和其他标签。');
  84  |   await pane.getByRole('button', { name: '预检配图范围', exact: true }).click(); await expect(pane.getByRole('button', { name: '生成修订图片', exact: true })).toBeEnabled();
  85  |   await pane.getByRole('button', { name: '生成修订图片', exact: true }).click();
  86  |   await expect(pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeVisible();
  87  |   await pane.getByRole('textbox', { name: '图片替代说明', exact: true }).fill('两个概念圆及其交集，说明观察和条件的关系。');
  88  |   await pane.getByRole('textbox', { name: '图注', exact: true }).fill('比较观察与条件，保留这条完整图注。');
  89  |   await expect(pane.locator('.tw-figure-list .tw-figure-thumbnail img').first()).toBeVisible();
  90  |   await pane.getByRole('button', { name: '加入对照', exact: true }).last().click(); await expect(pane.getByRole('region', { name: '两个图片候选对照' })).toBeVisible();
  91  |   await expect(pane.getByRole('region', { name: '两个图片候选对照' }).locator('img').first()).toBeVisible();
  92  |   await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('studyagent.topic-whiteboard.figures.')).map(key => JSON.parse(localStorage.getItem(key)!).caption))).toContain('比较观察与条件，保留这条完整图注。');
  93  |   await page.reload(); await ready(page); await expect(pane.getByRole('textbox', { name: '图片替代说明', exact: true })).toHaveValue('两个概念圆及其交集，说明观察和条件的关系。');
  94  |   await expect(pane.getByRole('textbox', { name: '图注', exact: true })).toHaveValue('比较观察与条件，保留这条完整图注。');
  95  |   await pane.getByRole('checkbox', { name: '我已阅读图片，并核对本次要使用的标签和关系。' }).check();
  96  |   await pane.getByRole('button', { name: '选入当前完整稿', exact: true }).click(); await page.getByRole('button', { name: '保存完整改稿', exact: true }).click();
  97  |   await expect(page.locator('.tw-review')).toContainText('针对旧稿');
  98  |   const draft = await f.call(base + '/drafts/' + id, undefined, 'GET'); expect(draft.content.scenes[0].figure).toBeTruthy();
  99  |   const candidate = await f.call(figureBase + '/' + draft.content.scenes[0].figure.visualId, undefined, 'GET'); expect(candidate.operation).toBe('edit'); expect(candidate.parentVisualId).toBeTruthy();
  100 |   await page.getByRole('checkbox', { name: '我已阅读未确定问题或手工改稿，知晓仍需内容核对' }).check();
  101 |   await page.getByRole('button', { name: '确认并保存这份白板', exact: true }).click(); await page.getByRole('button', { name: '打开已保存白板', exact: true }).click();
  102 |   const player = page.getByRole('dialog', { name: '白板视频' }); await expect(player).toBeVisible();
  103 |   await expect(player.getByRole('button', { name: '放大参考图：先核对观察', exact: true }).first()).toBeVisible();
  104 |   await player.getByRole('button', { name: '播放', exact: true }).click();
  105 |   await player.getByRole('button', { name: '放大参考图：先核对观察', exact: true }).first().click();
  106 |   const unit = await page.locator('.wb-current-sentence').getAttribute('data-unit-id');
  107 |   await expect(page.locator('.cl-figure-reader-sheet')).toBeVisible(); await expect(player.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  108 |   await page.keyboard.press('Escape'); await expect(player).toBeVisible(); await expect(page.locator('.cl-figure-reader-sheet')).toHaveCount(0);
  109 |   await expect(page.locator('.wb-current-sentence')).toHaveAttribute('data-unit-id', unit!);
  110 |   await page.screenshot({ path: join(browserEvidence('topic-whiteboard'), 'topic-figure-saved-player.png'), fullPage: false });
  111 |   const board = await f.call(base + '/' + (await f.call(base + '/drafts/' + id, undefined, 'GET')).whiteboardId, undefined, 'GET');
  112 |   expect(JSON.stringify(board)).not.toContain(candidate.id); expect(board.scenes[0].figure.sha256).toBe(candidate.sha256);
> 113 |   const downloaded = page.waitForEvent('download'); await player.getByRole('button', { name: '导出视频', exact: true }).click();
      |                           ^ TimeoutError: page.waitForEvent: Timeout 15000ms exceeded while waiting for event "download"
  114 |   const video = await downloaded, videoPath = (await video.path())!, directory = browserEvidence('topic-whiteboard'); copyFileSync(videoPath, join(directory, 'topic-figure-video.webm'));
  115 |   const probe = JSON.parse(execFileSync(process.env.STUDY_FFPROBE ?? 'ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', videoPath], { encoding: 'utf8', windowsHide: true }));
  116 |   expect(probe.streams.some((stream: any) => stream.codec_type === 'audio')).toBe(true); expect(probe.streams.some((stream: any) => stream.codec_type === 'video')).toBe(true);
  117 |   const frame = spawnSync(process.env.STUDY_FFMPEG ?? 'ffmpeg', ['-v', 'error', '-ss', '.2', '-i', videoPath, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  118 |   expect(frame.status).toBe(0); const decoded = await sharp(frame.stdout).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  119 |   expect([decoded.info.width, decoded.info.height, decoded.info.channels]).toEqual([1280, 720, 3]);
  120 |   let blue = 0, warm = 0;
  121 |   for (let y = 206; y < 566; y++) for (let x = 88; x < 698; x++) {
  122 |     const offset = (y * 1280 + x) * 3, r = decoded.data[offset], g = decoded.data[offset + 1], b = decoded.data[offset + 2];
  123 |     if (b > r + 5 && b > g) blue++; if (r > b + 10 && g > b + 5) warm++;
  124 |   }
  125 |   expect(blue).toBeGreaterThan(9000); expect(warm).toBeGreaterThan(9000);
  126 |   writeFileSync(join(directory, 'topic-figure-video-first-frame.png'), frame.stdout); writeFileSync(join(directory, 'topic-figure-video-probe.json'), JSON.stringify({ probe, decodedImageRegion: { blue, warm } }, null, 2) + '\n');
  127 |   const captions = page.waitForEvent('download'); await player.getByRole('button', { name: '导出字幕', exact: true }).click(); const srt = readFileSync((await (await captions).path())!, 'utf8');
  128 |   expect(srt).toContain('00:00:00,000 --> 00:00:02,000'); expect(srt).toContain('00:00:10,000 --> 00:00:12,000'); writeFileSync(join(directory, 'topic-figure-video.srt'), srt);
  129 |   const later: string[] = []; page.on('download', value => later.push(value.suggestedFilename()));
  130 |   await page.route('**/api/learning/studio/topic-whiteboards/*/figures/*/image', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('Changed frozen image fixture') }));
  131 |   await player.getByRole('button', { name: '导出视频', exact: true }).click(); await expect(player.locator('.sa-whiteboard-notice')).toContainText('字节与已保存版本不一致'); expect(later).toEqual([]);
  132 |   const retained = page.waitForEvent('download'); await player.getByRole('button', { name: '导出字幕', exact: true }).click(); expect(readFileSync((await (await retained).path())!, 'utf8')).toBe(srt);
  133 | });
  134 | 
  135 | test('topic-figure: uncached complete image commands block leaving until their exact complete download', async ({ page }) => {
  136 |   await fixture(page); await generate(page); await ready(page);
  137 |   await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) {
  138 |     if (key.startsWith('studyagent.topic-whiteboard.figures.')) throw new DOMException('Synthetic unavailable image storage', 'QuotaExceededError'); return original.call(this, key, value);
  139 |   }; });
  140 |   let writes = 0;
  141 |   await page.route('**/api/learning/studio/topic-whiteboard-visuals', async route => {
  142 |     if (route.request().method() !== 'POST') return route.continue(); writes++; expect((await route.fetch()).status()).toBe(201); await route.abort('failed');
  143 |   });
  144 |   const pane = await figure(page, '即使本机拒写，也要保留这一完整需求及原图生成命令。');
  145 |   await expect(pane.getByRole('button', { name: '恢复原配图请求', exact: true })).toBeEnabled();
  146 |   await page.getByRole('button', { name: '＋ 新白板', exact: true }).click(); await expect(pane).toBeVisible();
  147 |   const download = page.waitForEvent('download'); await pane.getByRole('button', { name: '下载完整配图请求', exact: true }).click();
  148 |   const saved = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
  149 |   expect(saved.pending.body).toMatchObject({ operation: 'generate', requirements: '即使本机拒写，也要保留这一完整需求及原图生成命令。' });
  150 |   expect(saved.pending.body.requestKey).toBeTruthy(); expect(saved.draftId).toBe(saved.pending.body.draftId); expect(writes).toBe(1);
  151 |   expect(saved.pending.path).toBe(figureBase);
  152 |   await page.getByRole('button', { name: '＋ 新白板', exact: true }).click(); await expect(pane).toHaveCount(0);
  153 | });
  154 | 
  155 | test('topic-figure: mismatched image bytes stay hidden and can be reread without creating another candidate', async ({ page }) => {
  156 |   const f = await fixture(page); await generate(page); await ready(page); const id = new URL(page.url()).searchParams.get('draft')!;
  157 |   await page.route('**/api/learning/studio/topic-whiteboard-visuals/*/image', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('Synthetic changed PNG bytes') }));
  158 |   const pane = await figure(page), current = pane.getByRole('article', { name: '当前图片候选' });
  159 |   await expect(current.getByRole('alert')).toContainText('字节与已保存版本不一致'); await expect(current.getByRole('button', { name: '选入当前完整稿', exact: true })).toBeDisabled();
  160 |   await expect(current.locator('.tw-figure-open')).toHaveCount(0);
  161 |   await page.unroute('**/api/learning/studio/topic-whiteboard-visuals/*/image');
  162 |   await current.getByRole('button', { name: '重新读取图片', exact: true }).click();
  163 |   await expect(current.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeVisible();
  164 |   expect((await f.call(figureBase + '?draftId=' + id + '&sceneIndex=0', undefined, 'GET')).total).toBe(1);
  165 | });
  166 | 
  167 | test('topic-figure: an explicit running cancellation and retry keep the same original candidate and advance its task generation', async ({ page }) => {
  168 |   const f = await fixture(page); await generate(page); await ready(page); const id = new URL(page.url()).searchParams.get('draft')!;
  169 |   const pane = await figure(page, '[image-pause-once] 暂停的匿名概念图，用于验证原任务取消和重试。');
  170 |   const current = pane.getByRole('article', { name: '当前图片候选' }); await expect(current.getByRole('heading', { name: '正在生成参考图', exact: true })).toBeVisible();
  171 |   await current.getByRole('button', { name: '取消图片生成', exact: true }).click();
  172 |   await expect(current.getByRole('heading', { name: '生成已取消', exact: true })).toBeVisible();
  173 |   await current.getByRole('button', { name: '重试原图片任务', exact: true }).click(); await expect(current.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeVisible();
  174 |   const list = await f.call(figureBase + '?draftId=' + id + '&sceneIndex=0', undefined, 'GET'); expect(list.total).toBe(1); expect(list.items[0].task.generation).toBe(2);
  175 | });
  176 | 
  177 | test('topic-figure: two actual tabs retain separate full figure inputs and metadata across reloads', async ({ page }) => {
  178 |   await fixture(page); await generate(page); await ready(page); const second = await page.context().newPage();
  179 |   try {
  180 |     await second.goto(page.url()); await ready(second);
  181 |     const firstPane = page.getByRole('region', { name: '白板配图工作区' }), secondPane = second.getByRole('region', { name: '白板配图工作区' });
  182 |     await firstPane.getByLabel('希望图片说明什么').fill('第一标签页完整的配图要求。'); await secondPane.getByLabel('希望图片说明什么').fill('第二标签页不同的配图要求。');
  183 |     const copies = () => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('studyagent.topic-whiteboard.figures.')).map(key => JSON.parse(localStorage.getItem(key)!).form.requirements));
  184 |     await expect.poll(copies).toContain('第一标签页完整的配图要求。'); await expect.poll(copies).toContain('第二标签页不同的配图要求。');
  185 |     await page.reload(); await ready(page); await expect(firstPane.getByLabel('希望图片说明什么')).toHaveValue('第一标签页完整的配图要求。');
  186 |     await second.reload(); await ready(second); await expect(secondPane.getByLabel('希望图片说明什么')).toHaveValue('第二标签页不同的配图要求。');
  187 |   } finally { await second.close(); }
  188 | });
  189 | 
  190 | for (const width of [390, 768, 1440]) test('topic-figure: complete verified image and keyboard reader fit ' + width, async ({ page }) => {
  191 |   await page.setViewportSize({ width, height: 900 }); await fixture(page); await generate(page); await ready(page); const pane = await figure(page);
  192 |   await expect(pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeVisible();
  193 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  194 |   await pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true }).click();
  195 |   const reader = page.locator('.cl-figure-reader-sheet'); await expect(reader).toBeVisible();
  196 |   const image = reader.locator('img'); expect(await image.evaluate((item: HTMLImageElement) => [item.naturalWidth, item.naturalHeight])).toEqual([1536, 1024]);
  197 |   expect(await reader.evaluate(item => item.scrollWidth <= item.clientWidth + 1)).toBe(true);
  198 |   await page.screenshot({ path: join(browserEvidence('topic-whiteboard'), 'topic-figure-reader-' + width + '.png'), fullPage: false });
  199 |   await page.keyboard.press('Escape'); await expect(reader).toHaveCount(0);
  200 |   await expect(pane.getByRole('button', { name: '放大参考图：先核对观察', exact: true })).toBeFocused();
  201 | });
  202 | 
  203 | test('adult original generation, lost edit and confirmation replies recover without duplicates and reach a complete table/formula player', async ({ page }) => {
  204 |   const f = await fixture(page); let dropped = true;
  205 |   await page.route('**/api/learning/studio/topic-whiteboards/drafts', async route => {
  206 |     if (route.request().method() === 'POST' && dropped) { dropped = false; expect((await route.fetch()).status()).toBe(201); await route.abort('failed'); } else await route.continue();
  207 |   });
  208 |   await generate(page); await expect(page.getByRole('button', { name: '恢复原生成请求', exact: true })).toBeEnabled(); await page.reload();
  209 |   await page.getByRole('button', { name: '恢复原生成请求', exact: true }).click(); await ready(page);
  210 |   const id = new URL(page.url()).searchParams.get('draft')!;
  211 |   expect((await f.call(base + '/drafts', undefined, 'GET')).total).toBe(1);
  212 |   let editDropped = true, editWrites = 0;
  213 |   await page.route('**/api/learning/studio/topic-whiteboards/drafts/*/content', async route => {
```
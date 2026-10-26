# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: whiteboard-media.spec.ts >> continuity: an already prepared WAV cannot survive actual login-session revocation
- Location: tests\e2e\whiteboard-media.spec.ts:149:5

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByRole('dialog', { name: '白板视频' })
Expected: 0
Received: 1
Timeout:  15000ms

Call log:
  - Expect "toHaveCount" getByRole('dialog', { name: '白板视频' }) with timeout 15000ms
  - waiting for getByRole('dialog', { name: '白板视频' })
    33 × locator resolved to 1 element
       - unexpected value "1"

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
        - button "Home" [ref=f1e10] [cursor=pointer]:
          - generic [ref=f1e13]: 首页
        - button "Courses" [ref=f1e14] [cursor=pointer]:
          - generic [ref=f1e17]: 课程
        - button "Calendar" [ref=f1e18] [cursor=pointer]:
          - generic [ref=f1e21]: 学习动态
        - button "History" [ref=f1e22] [cursor=pointer]:
          - generic [ref=f1e25]: 历史
        - button "Materials" [ref=f1e26] [cursor=pointer]:
          - generic [ref=f1e29]: 资料
        - link "AI Whiteboards" [ref=f1e30] [cursor=pointer]:
          - /url: /studio/whiteboards
          - generic [ref=f1e33]: AI白板
      - button "＋ 创建课程" [ref=f1e34] [cursor=pointer]
      - generic [ref=f1e35]:
        - heading "继续学习" [level=2] [ref=f1e36]
        - link "讲座社会学想象力 社会学概论" [ref=f1e37] [cursor=pointer]:
          - /url: /studio/classroom?lesson=soc-1-1-1
          - text: 讲座社会学想象力
          - generic [ref=f1e38]: 社会学概论
      - generic [ref=f1e39]:
        - heading "近期活动" [level=2] [ref=f1e40]
        - link "白板视频「异分母分数加法」" [ref=f1e41] [cursor=pointer]:
          - /url: /studio?whiteboard=studio_whiteboard_8e54ddda-43df-488e-978e-5676de54114a
      - link "返回学习首页 →" [ref=f1e43] [cursor=pointer]:
        - /url: /learn?subject=math&student=student_6bbce4c7-e412-4df1-87ca-ad2627b8a103
    - generic [ref=f1e44]:
      - generic [ref=f1e45]:
        - generic [ref=f1e46]:
          - combobox "学习档案" [ref=f1e47]:
            - option "匿名白板验证" [selected]
          - combobox "学科" [ref=f1e48]:
            - option "数学" [selected]
            - option "语文"
            - option "英语"
        - generic [ref=f1e49]:
          - link "教学课堂 ↗" [ref=f1e50] [cursor=pointer]:
            - /url: /studio/classroom
          - link "学习观察室" [ref=f1e51] [cursor=pointer]:
            - /url: /
      - generic [ref=f1e52]:
        - generic [ref=f1e53]:
          - button "Craft Courses" [ref=f1e54] [cursor=pointer]
          - button "Instant Assistance" [ref=f1e55] [cursor=pointer]
        - generic [ref=f1e56]:
          - heading "把下一步，做成一条走得通的路。" [level=1] [ref=f1e57]
          - paragraph [ref=f1e58]: 从已确认学习范围生成课程蓝图，审阅结构和来源后再开始。
        - generic [ref=f1e59]:
          - textbox "围绕哪段学习内容设计课程？" [ref=f1e60]
          - generic [ref=f1e61]:
            - generic [ref=f1e62]: ＋
            - generic [ref=f1e63]: 资料
            - button "Concept Explanation" [ref=f1e64] [cursor=pointer]
            - generic [ref=f1e65]: 语音
            - generic [ref=f1e68]:
              - generic [ref=f1e69]: 模型
              - combobox "选择大模型" [ref=f1e70] [cursor=pointer]:
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
            - button "↑" [ref=f1e71] [cursor=pointer]
        - generic [ref=f1e72]:
          - button "可视化 用图形解释异分母加法 通分、合并与验算" [ref=f1e73] [cursor=pointer]:
            - generic [ref=f1e74]: 可视化
            - generic [ref=f1e75]: 用图形解释异分母加法
            - generic [ref=f1e76]: 通分、合并与验算
          - button "个性化练习 从我的已知点生成练习 只覆盖已确认范围" [ref=f1e77] [cursor=pointer]:
            - generic [ref=f1e78]: 个性化练习
            - generic [ref=f1e79]: 从我的已知点生成练习
            - generic [ref=f1e80]: 只覆盖已确认范围
          - button "主动学习 看看今天最值得做什么 按教育优先级排序" [ref=f1e81] [cursor=pointer]:
            - generic [ref=f1e82]: 主动学习
            - generic [ref=f1e83]: 看看今天最值得做什么
            - generic [ref=f1e84]: 按教育优先级排序
        - generic [ref=f1e85]:
          - heading "你的学习路径" [level=2] [ref=f1e86]
          - button "创建课程" [ref=f1e87] [cursor=pointer]
        - generic [ref=f1e88]:
          - heading "还没有课程" [level=3] [ref=f1e89]
          - paragraph [ref=f1e90]: 先确认学习范围，再从已学知识生成可审核蓝图。
          - button "生成第一门课程" [ref=f1e91] [cursor=pointer]
        - complementary [ref=f1e92]:
          - article [ref=f1e93]:
            - generic [ref=f1e94]:
              - generic [ref=f1e95]:
                - text: LEARNER SNAPSHOT
                - heading "匿名白板验证" [level=2] [ref=f1e96]
              - generic [ref=f1e97]: 5 年级
            - generic [ref=f1e98]:
              - strong [ref=f1e99]: "0"
              - generic [ref=f1e100]: / 1
              - generic [ref=f1e101]: 已有点有稳定证据
            - generic [ref=f1e102]:
              - generic [ref=f1e103]:
                - generic [ref=f1e104]: "1"
                - text: 已确认知识点
              - generic [ref=f1e105]:
                - generic [ref=f1e106]: "0"
                - text: 日历安排
          - article [ref=f1e107]:
            - generic [ref=f1e108]:
              - generic [ref=f1e109]: NEXT BEST ACTION
              - button "全部 →" [ref=f1e110] [cursor=pointer]
            - link "1个已学点仍需补充证据 未知或样本不足不是低能力；下一组评测会优先补齐可用的独立题族。" [ref=f1e111] [cursor=pointer]:
              - /url: /student/assessment?studentId=student_6bbce4c7-e412-4df1-87ca-ad2627b8a103&subject=math
              - generic [ref=f1e112]: 1个已学点仍需补充证据
              - paragraph [ref=f1e113]: 未知或样本不足不是低能力；下一组评测会优先补齐可用的独立题族。
          - article [ref=f1e114]:
            - generic [ref=f1e115]:
              - generic [ref=f1e116]: RECENT WHITEBOARDS
              - button "新建" [ref=f1e117] [cursor=pointer]
            - button "▶ 匿名逐句白板 2 幕 · 1 秒" [ref=f1e118] [cursor=pointer]:
              - generic [ref=f1e119]: ▶
              - generic [ref=f1e120]:
                - generic [ref=f1e121]: 匿名逐句白板
                - generic [ref=f1e122]: 2 幕 · 1 秒
          - article [ref=f1e123]:
            - generic [ref=f1e124]:
              - generic [ref=f1e125]: SYNC STATUS
              - button "日历 →" [ref=f1e126] [cursor=pointer]
            - paragraph [ref=f1e127]: 0 个 LMS / 日历来源 · 0 个安排
            - generic [ref=f1e128]: 同步只读取课程日期；学习掌握仍由独立测量形成。
    - dialog "白板视频" [ref=f1e129]:
      - generic [ref=f1e130]:
        - generic [ref=f1e131]:
          - generic [ref=f1e132]: WHITEBOARD SESSION / 原白板
          - heading "匿名逐句白板" [level=2] [ref=f1e133]
          - paragraph [ref=f1e134]: 逐句云语音 · 实际音轨结束后继续 · 板书按完整要点呈现
        - button "关闭白板" [ref=f1e135] [cursor=pointer]: ×
      - generic [ref=f1e136]:
        - generic [ref=f1e137]:
          - generic "保留证据" [ref=f1e139]
          - paragraph [ref=f1e140]: "[whiteboard-fixture] 保留新的独立观察。"
          - generic [ref=f1e141]:
            - generic [ref=f1e142]: 播放进度（估计阅读）
            - slider "播放进度（估计阅读）" [ref=f1e143] [cursor=pointer]: "1000"
          - generic [ref=f1e144]:
            - button "上一句" [ref=f1e145] [cursor=pointer]: ←
            - button "播放" [active] [ref=f1e146] [cursor=pointer]: ▶
            - button "下一句" [disabled] [ref=f1e147]: →
            - generic [ref=f1e148]: 4 / 4 句
            - combobox "阅读方式" [ref=f1e149] [cursor=pointer]:
              - option "文字阅读（估计时长）"
              - option "云语音逐句播放" [selected]
            - combobox "旁白音色" [ref=f1e150] [cursor=pointer]:
              - option "合成音轨 A" [selected]
              - option "受控延迟音轨"
              - option "受控失败音轨"
            - combobox "播放速度" [ref=f1e151] [cursor=pointer]:
              - option "0.75×"
              - option "1×" [selected]
              - option "1.25×"
            - button "导出视频" [ref=f1e152] [cursor=pointer]
            - button "导出字幕" [ref=f1e153] [cursor=pointer]
          - status [ref=f1e154]: 云语音播放中 · 由当前句实际音轨结束推进。
          - generic [ref=f1e155]:
            - button "01 统一单位" [ref=f1e156] [cursor=pointer]:
              - generic [ref=f1e157]: "01"
              - text: 统一单位
            - button "02 保留证据" [ref=f1e158] [cursor=pointer]:
              - generic [ref=f1e159]: "02"
              - text: 保留证据
        - complementary "完整讲稿与要点" [ref=f1e160]:
          - heading "逐句讲稿" [level=3] [ref=f1e161]
          - paragraph [ref=f1e162]: 点击一句定位。观看与续播不计作掌握。
          - list [ref=f1e163]:
            - listitem [ref=f1e164]:
              - button "[whiteboard-fixture] 先统一单位。" [ref=f1e165] [cursor=pointer]
            - listitem [ref=f1e166]:
              - button "[whiteboard-fixture] 再合并份数。" [ref=f1e167] [cursor=pointer]
            - listitem [ref=f1e168]:
              - button "[whiteboard-fixture] 最后验证。" [ref=f1e169] [cursor=pointer]
            - listitem [ref=f1e170]:
              - button "[whiteboard-fixture] 保留新的独立观察。" [ref=f1e171] [cursor=pointer]
          - heading "完整笔记与来源" [level=3] [ref=f1e172]
          - group [ref=f1e173]:
            - generic "统一单位" [ref=f1e174] [cursor=pointer]
          - group [ref=f1e175]:
            - generic "保留证据" [ref=f1e176] [cursor=pointer]
            - paragraph [ref=f1e177]: 完整来源与笔记。
          - button "下载续播位置" [ref=f1e178] [cursor=pointer]
```

# Test source

```ts
  55  |       return audio;
  56  |     };
  57  |   }, { endedBoundary });
  58  |   await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  59  |   await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  60  |   const href = '/studio?' + new URLSearchParams({ student: studentId, subject: 'math', whiteboard: board.id });
  61  |   await page.goto(href); await expect(page.locator('.wb-current-sentence')).toContainText('先统一单位');
  62  |   return { actor, board, studentId, href, call, current: page.locator('.wb-current-sentence') };
  63  | }
  64  | 
  65  | test('complete sentence, complete notes, paused text reading and explicit sentence navigation', async ({ page }) => {
  66  |   const f = await fixture(page); await page.getByLabel('阅读方式').selectOption('text');
  67  |   await expect(f.current).not.toContainText('最后验证'); await expect(page.locator('.wb-reading-notes ol li')).toHaveCount(4);
  68  |   await expect(page.getByLabel('完整讲稿与要点')).toContainText('完整正文末行');
  69  |   await page.getByRole('button', { name: '播放', exact: true }).click();
  70  |   await expect.poll(() => page.getByRole('slider').inputValue()).not.toBe('0');
  71  |   await page.getByRole('button', { name: '暂停', exact: true }).click(); const at = await page.getByRole('slider').inputValue();
  72  |   await page.waitForTimeout(250); expect(await page.getByRole('slider').inputValue()).toBe(at);
  73  |   await page.getByRole('button', { name: '下一句' }).click(); await expect(f.current).toContainText('再合并份数');
  74  |   await expect(page.locator('.wb-reading-notes [aria-current=step]')).toHaveText('[whiteboard-fixture] 再合并份数。');
  75  |   await page.getByRole('button', { name: '上一句' }).click(); await expect(f.current).toContainText('先统一单位');
  76  |   await page.getByRole('button', { name: '关闭白板' }).click(); await expect(page.getByRole('dialog', { name: '白板视频' })).toHaveCount(0);
  77  | });
  78  | 
  79  | test('real WAV ended drives cloud playback, pause retains audio time and late ended cannot move a new sentence', async ({ page }) => {
  80  |   const f = await fixture(page); await page.getByRole('button', { name: '播放', exact: true }).click();
  81  |   await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[0]?.currentTime ?? 0)).toBeGreaterThan(.15);
  82  |   await expect(f.current).toContainText('先统一单位'); // Original nominal scene duration is only 10ms.
  83  |   await page.getByRole('button', { name: '暂停', exact: true }).click();
  84  |   const before = await page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime);
  85  |   await page.waitForTimeout(250); expect(await page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime)).toBeCloseTo(before, 1);
  86  |   await page.getByRole('button', { name: '播放', exact: true }).click();
  87  |   await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime)).toBeGreaterThan(before);
  88  |   await expect(f.current).toContainText('再合并份数', { timeout: 5000 });
  89  |   await page.getByRole('button', { name: '暂停', exact: true }).click();
  90  |   await page.evaluate(() => (window as any).__whiteboardAudio[0].dispatchEvent(new Event('ended')));
  91  |   await expect(f.current).toContainText('再合并份数');
  92  |   await page.getByRole('button', { name: '关闭白板' }).click();
  93  |   expect(await page.evaluate(() => (window as any).__whiteboardAudio.every((audio: HTMLAudioElement) => audio.paused && !audio.getAttribute('src')))).toBe(true);
  94  | });
  95  | 
  96  | test('ended boundary: a queued previous audio frame cannot seek the next actual WAV to its end', async ({ page }) => {
  97  |   const f = await fixture(page, true); await page.getByRole('button', { name: '播放', exact: true }).click();
  98  |   await expect.poll(() => page.evaluate(() => (window as any).__whiteboardStarts.some((row: any) => row.index === 1))).toBe(true);
  99  |   const starts = await page.evaluate(() => (window as any).__whiteboardStarts as Array<{ index: number; currentTime: number; duration: number }>);
  100 |   expect(starts.find(row => row.index === 1)!.currentTime).toBeLessThan(.15);
  101 |   expect(await page.evaluate(() => (window as any).__whiteboardBoundaryTicks)).toBeGreaterThan(0);
  102 |   await page.getByRole('button', { name: '暂停', exact: true }).click(); await expect(f.current).toContainText('再合并份数');
  103 |   await page.evaluate(() => (window as any).__whiteboardAudio[0].dispatchEvent(new Event('ended'))); await expect(f.current).toContainText('再合并份数');
  104 | });
  105 | 
  106 | test('continuity: adjacent actual WAV prepares during the current sentence and transfers once at its beginning', async ({ page }) => {
  107 |   const timing = await installNarrationTiming(page), f = await fixture(page);
  108 |   try {
  109 |     await page.getByRole('button', { name: '播放', exact: true }).click();
  110 |     await expect.poll(async () => (await timing.read()).audio.some(row => row.index === 1 && row.event === 'playing'), { timeout: 10000 }).toBe(true);
  111 |     await page.getByRole('button', { name: '暂停', exact: true }).click();
  112 |     const result = await timing.save('adjacent-transfer'), firstEnd = result.audio.find(row => row.index === 0 && row.event === 'ended')!;
  113 |     const prepared = result.audio.find(row => row.index === 1 && row.event === 'loadedmetadata')!, next = result.audio.find(row => row.index === 1 && row.event === 'playing')!;
  114 |     expect(result.requests[1].startedAt).toBeLessThan(firstEnd.at - 100);
  115 |     expect(prepared.at).toBeLessThan(firstEnd.at);
  116 |     expect(next.at - firstEnd.at).toBeLessThan(result.delayMs * .75);
  117 |     expect(next.currentTime).toBeLessThan(.15);
  118 |     expect(result.requests.filter(row => row.unitId === result.requests[1].unitId)).toHaveLength(1);
  119 |     expect(result.audio.filter(row => row.index === 1 && row.event === 'playing')).toHaveLength(1);
  120 |     await expect(f.current).toContainText('再合并份数');
  121 |   } finally { await page.unrouteAll({ behavior: 'wait' }); }
  122 | });
  123 | 
  124 | test('continuity: three complete actual WAVs remain ordered through a live speed change without duplicate preparation', async ({ page }) => {
  125 |   const timing = await installNarrationTiming(page, 300), f = await fixture(page);
  126 |   try {
  127 |     await page.getByRole('button', { name: '播放', exact: true }).click();
  128 |     await expect.poll(async () => (await timing.read()).audio.some(row => row.index === 1 && row.event === 'loadedmetadata')).toBe(true);
  129 |     const at = await page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime);
  130 |     await page.getByLabel('播放速度').selectOption('1.25');
  131 |     await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[0].playbackRate)).toBe(1.25);
  132 |     expect(await page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime)).toBeGreaterThanOrEqual(at);
  133 |     await expect.poll(async () => (await timing.read()).audio.some(row => row.index === 2 && row.event === 'ended'), { timeout: 12000 }).toBe(true);
  134 |     await page.getByRole('button', { name: '暂停', exact: true }).click();
  135 |     const result = await timing.save('three-complete-with-speed');
  136 |     const completed = result.audio.filter(row => row.event === 'ended');
  137 |     expect(completed.map(row => row.index)).toEqual([0, 1, 2]);
  138 |     for (const row of completed) expect(row.currentTime).toBe(row.duration);
  139 |     for (const index of [1, 2]) {
  140 |       const start = result.audio.find(row => row.index === index && row.event === 'playing')!;
  141 |       expect(start.at).toBeGreaterThanOrEqual(completed[index - 1].at); expect(start.currentTime).toBeLessThan(.15);
  142 |       expect(result.audio.filter(row => row.index === index && row.event === 'playing')).toHaveLength(1);
  143 |     }
  144 |     expect(new Set(result.requests.map(row => row.unitId)).size).toBe(result.requests.length);
  145 |     await expect(f.current).toContainText('保留新的独立观察');
  146 |   } finally { await page.unrouteAll({ behavior: 'wait' }); }
  147 | });
  148 | 
  149 | test('continuity: an already prepared WAV cannot survive actual login-session revocation', async ({ page }) => {
  150 |   const timing = await installNarrationTiming(page, 150), f = await fixture(page);
  151 |   try {
  152 |     await page.getByRole('button', { name: '播放', exact: true }).click();
  153 |     await expect.poll(async () => (await timing.read()).audio.some(row => row.index === 1 && row.event === 'loadedmetadata')).toBe(true);
  154 |     await f.call('/auth/logout', {}, f.actor.token);
> 155 |     await expect(page.getByRole('dialog', { name: '白板视频' })).toHaveCount(0);
      |                                                              ^ Error: expect(locator).toHaveCount(expected) failed
  156 |     const result = await timing.save('revoked-session');
  157 |     expect(result.audio.filter(row => row.index === 1 && row.event === 'playing')).toEqual([]);
  158 |     expect(await page.evaluate(() => (window as any).__whiteboardAudio.every((audio: HTMLAudioElement) => audio.paused && !audio.getAttribute('src')))).toBe(true);
  159 |   } finally { await page.unrouteAll({ behavior: 'wait' }); }
  160 | });
  161 | 
  162 | test('continuity: a failed adjacent preparation preserves current playback and needs an explicit retry at its original sentence', async ({ page }) => {
  163 |   const f = await fixture(page); let first = '', second = '', secondCalls = 0;
  164 |   await page.route('**/api/learning/studio/whiteboards/*/narration/*', async route => {
  165 |     const unitId = route.request().postDataJSON().unitId;
  166 |     if (!first) first = unitId;
  167 |     if (unitId !== first && !second) second = unitId;
  168 |     if (unitId === second && ++secondCalls === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"message":"Synthetic preparation failure"}}' });
  169 |     return route.continue();
  170 |   });
  171 |   try {
  172 |     await page.getByRole('button', { name: '播放', exact: true }).click(); await expect.poll(() => secondCalls).toBe(1);
  173 |     await expect(f.current).toContainText('先统一单位'); await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  174 |     await page.getByRole('button', { name: '暂停', exact: true }).click(); await page.getByRole('button', { name: '播放', exact: true }).click();
  175 |     await expect(f.current).toContainText('再合并份数'); await expect(page.locator('.sa-whiteboard-notice')).toContainText('重试或选择文字');
  176 |     expect(secondCalls).toBe(1); await page.getByRole('button', { name: '播放', exact: true }).click();
  177 |     await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[1]?.currentTime ?? 0)).toBeGreaterThan(.1);
  178 |     expect(secondCalls).toBe(2); await expect(f.current).toContainText('再合并份数');
  179 |   } finally { await page.unrouteAll({ behavior: 'wait' }); }
  180 | });
  181 | 
  182 | test('continuity: closing during adjacent preparation aborts it and no late audio can play', async ({ page }) => {
  183 |   const timing = await installNarrationTiming(page), f = await fixture(page);
  184 |   try {
  185 |     await page.getByRole('button', { name: '播放', exact: true }).click();
  186 |     await expect.poll(async () => (await timing.read()).requests.length).toBe(2);
  187 |     await page.getByRole('button', { name: '关闭白板', exact: true }).click(); await page.waitForTimeout(1000);
  188 |     const result = await timing.save('close-pending'); expect(result.requests[1].failure).toBeTruthy();
  189 |     expect(result.audio.filter(row => row.index > 0 && row.event === 'playing')).toEqual([]);
  190 |     expect(await page.evaluate(() => (window as any).__whiteboardAudio.every((audio: HTMLAudioElement) => audio.paused && !audio.getAttribute('src')))).toBe(true);
  191 |     await expect(page.getByRole('dialog', { name: '白板视频' })).toHaveCount(0);
  192 |   } finally { await page.unrouteAll({ behavior: 'wait' }); }
  193 | });
  194 | 
  195 | test('continuity: an exact manual next keeps the prepared WAV paused and transfers it without another request', async ({ page }) => {
  196 |   const timing = await installNarrationTiming(page), f = await fixture(page);
  197 |   try {
  198 |     await page.getByRole('button', { name: '播放', exact: true }).click(); await expect.poll(async () => (await timing.read()).requests.length).toBe(2);
  199 |     const target = (await timing.read()).requests[1].unitId;
  200 |     await page.getByRole('button', { name: '下一句', exact: true }).click(); await expect(f.current).toContainText('再合并份数');
  201 |     await expect.poll(async () => (await timing.read()).audio.some(row => row.index === 1 && row.event === 'loadedmetadata')).toBe(true);
  202 |     expect((await timing.read()).audio.filter(row => row.index === 1 && row.event === 'playing')).toEqual([]);
  203 |     await page.getByRole('button', { name: '播放', exact: true }).click(); await expect.poll(async () => (await timing.read()).audio.some(row => row.index === 1 && row.event === 'playing')).toBe(true);
  204 |     await page.getByRole('button', { name: '暂停', exact: true }).click(); const result = await timing.save('manual-next');
  205 |     expect(result.requests.filter(row => row.unitId === target)).toHaveLength(1);
  206 |     expect(result.audio.find(row => row.index === 1 && row.event === 'playing')!.currentTime).toBeLessThan(.15);
  207 |   } finally { await page.unrouteAll({ behavior: 'wait' }); }
  208 | });
  209 | 
  210 | test('continuity: a prepared WAV cannot play after actual guardian revocation before handover', async ({ page }) => {
  211 |   const timing = await installNarrationTiming(page, 150), f = await fixture(page);
  212 |   try {
  213 |     await page.getByRole('button', { name: '播放', exact: true }).click();
  214 |     await expect.poll(async () => (await timing.read()).audio.some(row => row.index === 1 && row.event === 'loadedmetadata')).toBe(true);
  215 |     await f.call('/qa/whiteboard-media', { boardId: f.board.id, revoke: true }, f.actor.token);
  216 |     await expect(page.getByRole('dialog', { name: '白板视频' })).toHaveCount(0);
  217 |     const result = await timing.save('revoked-prepared'); expect(result.audio.filter(row => row.index === 1 && row.event === 'playing')).toEqual([]);
  218 |     expect(await page.evaluate(() => (window as any).__whiteboardAudio.every((audio: HTMLAudioElement) => audio.paused && !audio.getAttribute('src')))).toBe(true);
  219 |   } finally { await page.unrouteAll({ behavior: 'wait' }); }
  220 | });
  221 | 
  222 | test('continuity: changing voice fences the old adjacent request and preserves an explicit fresh play', async ({ page }) => {
  223 |   const timing = await installNarrationTiming(page), f = await fixture(page);
  224 |   try {
  225 |     await page.getByRole('button', { name: '播放', exact: true }).click(); await expect.poll(async () => (await timing.read()).requests.length).toBe(2);
  226 |     const old = (await timing.read()).requests[1].unitId;
  227 |     await page.getByLabel('旁白音色').selectOption('fixture-delay'); await page.waitForTimeout(1000);
  228 |     let result = await timing.read(); expect(result.requests[1].failure).toBeTruthy();
  229 |     expect(result.audio.filter(row => row.index > 0 && row.event === 'playing')).toEqual([]); await expect(f.current).toContainText('先统一单位');
  230 |     await page.getByRole('button', { name: '播放', exact: true }).click();
  231 |     await expect.poll(async () => (await timing.read()).audio.some(row => row.index === 1 && row.event === 'playing'), { timeout: 10000 }).toBe(true);
  232 |     result = await timing.save('voice-change'); expect(result.requests.filter(row => row.unitId === old && row.voice === 'fixture-a')).toHaveLength(1);
  233 |     expect(result.requests.some(row => row.voice === 'fixture-delay')).toBe(true);
  234 |   } finally { await page.unrouteAll({ behavior: 'wait' }); }
  235 | });
  236 | 
  237 | test('continuity: slow adjacent audio cannot advance early and can be paused while waiting', async ({ page }) => {
  238 |   const timing = await installNarrationTiming(page, 3300), f = await fixture(page);
  239 |   try {
  240 |     await page.getByRole('button', { name: '播放', exact: true }).click();
  241 |     await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[0]?.currentTime ?? 0), { timeout: 10000 }).toBeGreaterThan(.8);
  242 |     await expect(f.current).toContainText('先统一单位');
  243 |     await expect(f.current).toContainText('再合并份数'); await expect(page.locator('.sa-whiteboard-notice')).toContainText('正在准备当前句');
  244 |     await page.getByRole('button', { name: '暂停', exact: true }).click(); await page.waitForTimeout(1800);
  245 |     const result = await timing.save('slow-cancel'); expect(result.requests[1].failure).toBeTruthy();
  246 |     expect(result.audio.filter(row => row.index === 1 && row.event === 'playing')).toEqual([]);
  247 |     await expect(f.current).toContainText('再合并份数'); await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  248 |   } finally { await page.unrouteAll({ behavior: 'wait' }); }
  249 | });
  250 | 
  251 | test('voice switch fences delayed requests and an audio failure offers explicit retry or text reading', async ({ page }) => {
  252 |   const f = await fixture(page); await page.getByLabel('旁白音色').selectOption('fixture-delay');
  253 |   await page.getByRole('button', { name: '播放', exact: true }).click(); await expect(page.getByRole('status').last()).toContainText('正在准备当前句');
  254 |   await page.getByLabel('旁白音色').selectOption('fixture-fail'); await page.waitForTimeout(2100);
  255 |   expect(await page.evaluate(() => (window as any).__whiteboardAudio.length)).toBe(0);
```
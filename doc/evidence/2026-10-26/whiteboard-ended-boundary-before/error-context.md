# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: whiteboard-media.spec.ts >> ended boundary: a queued previous audio frame cannot seek the next actual WAV to its end
- Location: tests\e2e\whiteboard-media.spec.ts:95:5

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 0.15
Received:   2
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
          - /url: /studio?whiteboard=studio_whiteboard_0a7c7a6e-45a5-4a88-9654-e9b3e2148577
      - link "返回学习首页 →" [ref=f1e43] [cursor=pointer]:
        - /url: /learn?subject=math&student=student_44b9859d-fd57-438e-8231-19125198656e
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
              - /url: /student/assessment?studentId=student_44b9859d-fd57-438e-8231-19125198656e&subject=math
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
          - generic "统一单位" [ref=f1e139]
          - paragraph [ref=f1e140]: "[whiteboard-fixture] 最后验证。"
          - generic [ref=f1e141]:
            - generic [ref=f1e142]: 播放进度（估计阅读）
            - slider "播放进度（估计阅读）" [ref=f1e143] [cursor=pointer]: "611"
          - generic [ref=f1e144]:
            - button "上一句" [ref=f1e145] [cursor=pointer]: ←
            - button "暂停" [active] [ref=f1e146] [cursor=pointer]: Ⅱ
            - button "下一句" [ref=f1e147] [cursor=pointer]: →
            - generic [ref=f1e148]: 3 / 4 句
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
            - paragraph [ref=f1e175]: 完整正文首行。完整正文末行。
            - list [ref=f1e176]:
              - listitem [ref=f1e177]: 先统一单位
              - listitem [ref=f1e178]: 再合并份数
              - listitem [ref=f1e179]: 最后验证
          - group [ref=f1e180]:
            - generic "保留证据" [ref=f1e181] [cursor=pointer]
          - button "下载续播位置" [ref=f1e182] [cursor=pointer]
```

# Test source

```ts
  1   | import { expect, test, type Page } from '@playwright/test';
  2   | import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
  3   | import { execFileSync, spawnSync } from 'node:child_process';
  4   | import { createHash } from 'node:crypto';
  5   | import { browserEvidence } from './evidence';
  6   | import { join } from 'node:path';
  7   | 
  8   | const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107');
  9   | const credential = 'Synthetic-whiteboard-only-20261026';
  10  | async function fixture(page: Page, endedBoundary = false) {
  11  |   const principal = 'whiteboard-' + crypto.randomUUID() + '@local.test';
  12  |   const bucket = createHash('sha256').update(test.info().testId).digest(), address = '198.19.' + bucket[0] + '.' + bucket[1];
  13  |   await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address });
  14  |   async function call(path: string, body?: unknown, actor?: string, method = 'POST') {
  15  |     const response = await fetch(api + '/api' + path, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address, ...(actor ? { Authorization: 'Bearer ' + actor } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  16  |     expect(response.ok, path + ': ' + response.status).toBe(true); return (await response.json()).data;
  17  |   }
  18  |   const actor = await call('/auth/register', { principal, credential });
  19  |   const child = await call('/students', { nickname: '匿名白板验证', grade: 5, preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }, actor.token);
  20  |   const studentId = child.profile.id;
  21  |   await call('/students/' + studentId + '/learning-scope', { subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null, textbookVersion: '合成已学范围', learnedAtomIds: ['core:math:fractionadd'], currentAtomId: 'core:math:fractionadd', minutesPerSession: 15, progressMode: 'knowledge', selectedLessonIds: [] }, actor.token, 'PUT');
  22  |   const draft = { studentId, subject: 'math', prompt: '解释异分母分数加法', atomId: 'core:math:fractionadd' };
  23  |   const preview = await call('/learning/studio/whiteboards/preview', draft, actor.token);
  24  |   const saved = await call('/learning/studio/whiteboards', { ...draft, fingerprint: preview.fingerprint, requestKey: crypto.randomUUID() }, actor.token);
  25  |   const board = await call('/qa/whiteboard-media', { boardId: saved.id }, actor.token);
  26  |   await page.route('**/api/learning/studio/overview?*', async route => {
  27  |     const response = await route.fetch(); if (!response.ok()) { await route.fulfill({ response }); return; }
  28  |     const payload = await response.json(); payload.data.narrationAvailable = true;
  29  |     payload.data.speech = { available: true, provider: 'minimax', defaultVoice: 'fixture-a', voices: [
  30  |       { id: 'fixture-a', label: '合成音轨 A' }, { id: 'fixture-delay', label: '受控延迟音轨' }, { id: 'fixture-fail', label: '受控失败音轨' },
  31  |     ] }; await route.fulfill({ response, json: payload });
  32  |   });
  33  |   await page.addInitScript(({ endedBoundary }) => {
  34  |     const NativeAudio = window.Audio; (window as any).__whiteboardAudio = [];
  35  |     const pending = new Map<number, FrameRequestCallback>();
  36  |     (window as any).__whiteboardStarts = []; (window as any).__whiteboardBoundaryTicks = 0;
  37  |     if (endedBoundary) {
  38  |       const raf = requestAnimationFrame.bind(window), cancel = cancelAnimationFrame.bind(window);
  39  |       window.requestAnimationFrame = callback => { const id = raf(time => { pending.delete(id); callback(time); }); pending.set(id, callback); return id; };
  40  |       window.cancelAnimationFrame = id => { pending.delete(id); cancel(id); };
  41  |     }
  42  |     (window as any).Audio = function (src?: string) {
  43  |       const audio = new NativeAudio(src), index = (window as any).__whiteboardAudio.length; (window as any).__whiteboardAudio.push(audio);
  44  |       if (endedBoundary) {
  45  |         let onEnded: ((this: HTMLAudioElement, event: Event) => unknown) | null = null;
  46  |         Object.defineProperty(audio, 'onended', { configurable: true, get: () => onEnded, set: value => { onEnded = value; } });
  47  |         audio.addEventListener('playing', () => (window as any).__whiteboardStarts.push({ index, currentTime: audio.currentTime, duration: audio.duration }));
  48  |         audio.addEventListener('ended', event => {
  49  |           const queued = [...pending.values()], handler = onEnded; handler?.call(audio, event);
  50  |           // Force an already-queued old progress frame at the ended/React cleanup boundary.
  51  |           if (index === 0 && handler) { (window as any).__whiteboardBoundaryTicks += queued.length; queued.forEach(callback => callback(performance.now())); }
  52  |         });
  53  |       }
  54  |       return audio;
  55  |     };
  56  |   }, { endedBoundary });
  57  |   await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  58  |   await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  59  |   const href = '/studio?' + new URLSearchParams({ student: studentId, subject: 'math', whiteboard: board.id });
  60  |   await page.goto(href); await expect(page.locator('.wb-current-sentence')).toContainText('先统一单位');
  61  |   return { actor, board, studentId, href, call, current: page.locator('.wb-current-sentence') };
  62  | }
  63  | 
  64  | test('complete sentence, complete notes, paused text reading and explicit sentence navigation', async ({ page }) => {
  65  |   const f = await fixture(page); await page.getByLabel('阅读方式').selectOption('text');
  66  |   await expect(f.current).not.toContainText('最后验证'); await expect(page.locator('.wb-reading-notes ol li')).toHaveCount(4);
  67  |   await expect(page.getByLabel('完整讲稿与要点')).toContainText('完整正文末行');
  68  |   await page.getByRole('button', { name: '播放', exact: true }).click();
  69  |   await expect.poll(() => page.getByRole('slider').inputValue()).not.toBe('0');
  70  |   await page.getByRole('button', { name: '暂停', exact: true }).click(); const at = await page.getByRole('slider').inputValue();
  71  |   await page.waitForTimeout(250); expect(await page.getByRole('slider').inputValue()).toBe(at);
  72  |   await page.getByRole('button', { name: '下一句' }).click(); await expect(f.current).toContainText('再合并份数');
  73  |   await expect(page.locator('.wb-reading-notes [aria-current=step]')).toHaveText('[whiteboard-fixture] 再合并份数。');
  74  |   await page.getByRole('button', { name: '上一句' }).click(); await expect(f.current).toContainText('先统一单位');
  75  |   await page.getByRole('button', { name: '关闭白板' }).click(); await expect(page.getByRole('dialog', { name: '白板视频' })).toHaveCount(0);
  76  | });
  77  | 
  78  | test('real WAV ended drives cloud playback, pause retains audio time and late ended cannot move a new sentence', async ({ page }) => {
  79  |   const f = await fixture(page); await page.getByRole('button', { name: '播放', exact: true }).click();
  80  |   await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[0]?.currentTime ?? 0)).toBeGreaterThan(.15);
  81  |   await expect(f.current).toContainText('先统一单位'); // Original nominal scene duration is only 10ms.
  82  |   await page.getByRole('button', { name: '暂停', exact: true }).click();
  83  |   const before = await page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime);
  84  |   await page.waitForTimeout(250); expect(await page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime)).toBeCloseTo(before, 1);
  85  |   await page.getByRole('button', { name: '播放', exact: true }).click();
  86  |   await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime)).toBeGreaterThan(before);
  87  |   await expect(f.current).toContainText('再合并份数', { timeout: 5000 });
  88  |   await page.getByRole('button', { name: '暂停', exact: true }).click();
  89  |   await page.evaluate(() => (window as any).__whiteboardAudio[0].dispatchEvent(new Event('ended')));
  90  |   await expect(f.current).toContainText('再合并份数');
  91  |   await page.getByRole('button', { name: '关闭白板' }).click();
  92  |   expect(await page.evaluate(() => (window as any).__whiteboardAudio.every((audio: HTMLAudioElement) => audio.paused && !audio.getAttribute('src')))).toBe(true);
  93  | });
  94  | 
  95  | test('ended boundary: a queued previous audio frame cannot seek the next actual WAV to its end', async ({ page }) => {
  96  |   const f = await fixture(page, true); await page.getByRole('button', { name: '播放', exact: true }).click();
  97  |   await expect.poll(() => page.evaluate(() => (window as any).__whiteboardStarts.some((row: any) => row.index === 1))).toBe(true);
  98  |   const starts = await page.evaluate(() => (window as any).__whiteboardStarts as Array<{ index: number; currentTime: number; duration: number }>);
> 99  |   expect(starts.find(row => row.index === 1)!.currentTime).toBeLessThan(.15);
      |                                                            ^ Error: expect(received).toBeLessThan(expected)
  100 |   expect(await page.evaluate(() => (window as any).__whiteboardBoundaryTicks)).toBeGreaterThan(0);
  101 |   await page.getByRole('button', { name: '暂停', exact: true }).click(); await expect(f.current).toContainText('再合并份数');
  102 |   await page.evaluate(() => (window as any).__whiteboardAudio[0].dispatchEvent(new Event('ended'))); await expect(f.current).toContainText('再合并份数');
  103 | });
  104 | 
  105 | test('voice switch fences delayed requests and an audio failure offers explicit retry or text reading', async ({ page }) => {
  106 |   const f = await fixture(page); await page.getByLabel('旁白音色').selectOption('fixture-delay');
  107 |   await page.getByRole('button', { name: '播放', exact: true }).click(); await expect(page.getByRole('status').last()).toContainText('正在准备当前句');
  108 |   await page.getByLabel('旁白音色').selectOption('fixture-fail'); await page.waitForTimeout(2100);
  109 |   expect(await page.evaluate(() => (window as any).__whiteboardAudio.length)).toBe(0);
  110 |   await page.getByRole('button', { name: '播放', exact: true }).click(); await expect(page.locator('.sa-whiteboard-notice')).toContainText('重试或选择文字');
  111 |   await expect(f.current).toContainText('先统一单位'); await page.getByLabel('阅读方式').selectOption('text');
  112 |   await page.getByRole('button', { name: '播放', exact: true }).click(); await expect.poll(() => page.getByRole('slider').inputValue()).not.toBe('0');
  113 | });
  114 | 
  115 | test('reopening a paused cloud sentence restores its known audio time in the verified original board', async ({ page }) => {
  116 |   const f = await fixture(page); await page.getByRole('button', { name: '播放', exact: true }).click();
  117 |   await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[0]?.currentTime ?? 0)).toBeGreaterThan(.35);
  118 |   await page.getByRole('button', { name: '暂停', exact: true }).click();
  119 |   const at = await page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime);
  120 |   await page.waitForTimeout(1700); await page.reload(); await expect(f.current).toContainText('先统一单位');
  121 |   await page.getByRole('button', { name: '播放', exact: true }).click();
  122 |   await expect.poll(() => page.evaluate(() => (window as any).__whiteboardAudio[0]?.currentTime ?? 0)).toBeGreaterThan(at - .05);
  123 |   expect(await page.evaluate(() => (window as any).__whiteboardAudio[0].currentTime)).toBeLessThan(at + .6);
  124 | });
  125 | 
  126 | test('scoped local resume and complete accessible notes fit phone, tablet and desktop', async ({ page }) => {
  127 |   const f = await fixture(page); await page.getByRole('button', { name: '下一句' }).click();
  128 |   await expect(f.current).toContainText('再合并份数'); await page.waitForTimeout(1700); await page.reload();
  129 |   await expect(f.current).toContainText('再合并份数'); await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
  130 |   const stored = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('studyagent.whiteboard.location.v1.')));
  131 |   expect(stored).toHaveLength(1); expect(stored[0][1]).not.toContain('再合并份数');
  132 |   for (const width of [390, 768, 1440]) {
  133 |     await page.setViewportSize({ width, height: 1000 }); await expect(f.current).toBeVisible();
  134 |     expect(await page.locator('.wb-sentence-player').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  135 |   }
  136 |   await page.getByRole('button', { name: '关闭白板' }).click();
  137 |   await page.evaluate(([key, value]) => localStorage.setItem(key, JSON.stringify({ ...JSON.parse(value), fingerprint: 'b'.repeat(64) })), stored[0]);
  138 |   await page.reload(); await expect(f.current).toContainText('先统一单位'); await expect(page.locator('.sa-whiteboard-notice')).toContainText('版本不符');
  139 | });
  140 | 
  141 | test('actual WebM has a decoded audio track and the same complete SRT timeline at the selected speed', async ({ page }) => {
  142 |   const f = await fixture(page); await page.getByLabel('播放速度').selectOption('1.25');
  143 |   const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出视频' }).click(); const video = await download;
  144 |   const directory = browserEvidence('whiteboard-media'); copyFileSync((await video.path())!, join(directory, 'decoded-fixture.webm'));
  145 |   const probe = JSON.parse(execFileSync(process.env.STUDY_FFPROBE ?? 'ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', (await video.path())!], { encoding: 'utf8', windowsHide: true }));
  146 |   expect(probe.streams.some((stream: any) => stream.codec_type === 'audio')).toBe(true);
  147 |   expect(probe.streams.some((stream: any) => stream.codec_type === 'video')).toBe(true);
  148 |   expect(Math.abs(Number(probe.format.duration) - 6.4)).toBeLessThan(.6);
  149 |   const ffmpeg = process.env.STUDY_FFMPEG ?? 'ffmpeg', path = (await video.path())!;
  150 |   const decoded = spawnSync(ffmpeg, ['-v', 'error', '-xerror', '-i', path, '-f', 'null', '-'], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  151 |   expect(decoded.status).toBe(0); expect(decoded.stdout.length).toBe(0);
  152 |   const eofParserMessage = /^\[opus @ [^\]]+\] Error parsing Opus packet header\.\s*$/u;
  153 |   let controlReceipt: { exit: number | null; stderr: string } | null = null;
  154 |   if (decoded.stderr.length) {
  155 |     // FFmpeg 8.0.1 also logs this parser EOF error for its own valid Opus file.
  156 |     // A different message, a codec error, or an absent independent control fails.
  157 |     expect(decoded.stderr.toString()).toMatch(eofParserMessage);
  158 |     const controlPath = join(directory, 'independent-opus-control.webm');
  159 |     execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1', '-c:a', 'libopus', '-y', controlPath], { windowsHide: true });
  160 |     const control = spawnSync(ffmpeg, ['-v', 'error', '-xerror', '-i', controlPath, '-f', 'null', '-'], { windowsHide: true });
  161 |     expect(control.status).toBe(0); expect(control.stderr.toString()).toMatch(eofParserMessage);
  162 |     controlReceipt = { exit: control.status, stderr: control.stderr.toString() };
  163 |   }
  164 |   const pcm = spawnSync(ffmpeg, ['-v', 'error', '-xerror', '-fflags', '+noparse+nofillin', '-i', path, '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'],
  165 |     { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  166 |   expect(pcm.status).toBe(0); expect(pcm.stderr.toString()).toBe('');
  167 |   const samples = pcm.stdout.length / 4; expect(samples / 48000).toBeGreaterThanOrEqual(6.4);
  168 |   function marker(frequency: number, from: number, to: number) {
  169 |     let peak = 0;
  170 |     for (let offset = from; offset + 768 <= to; offset += 192) {
  171 |       let real = 0, imaginary = 0;
  172 |       for (let i = 0; i < 768; i++) { const value = pcm.stdout.readFloatLE((offset + i) * 4), angle = 2 * Math.PI * frequency * i / 48000; real += value * Math.cos(angle); imaginary += value * Math.sin(angle); }
  173 |       peak = Math.max(peak, Math.hypot(real, imaginary) / 768);
  174 |     }
  175 |     return peak;
  176 |   }
  177 |   const firstMarker = marker(1100 * 1.25, 0, Math.min(samples, 14400)), lastMarker = marker(1900 * 1.25, Math.max(0, samples - 14400), samples);
  178 |   expect(firstMarker).toBeGreaterThan(.003); expect(lastMarker).toBeGreaterThan(.003);
  179 |   writeFileSync(join(directory, 'decoder.json'), JSON.stringify({ defaultExit: decoded.status, defaultStderr: decoded.stderr.toString(), control: controlReceipt,
  180 |     pcmExit: pcm.status, pcmStderr: pcm.stderr.toString(), samples, durationSeconds: samples / 48000, firstMarker, lastMarker }, null, 2) + '\n');
  181 |   const subtitles = page.waitForEvent('download'); await page.getByRole('button', { name: '导出字幕' }).click(); const srt = readFileSync((await (await subtitles).path())!, 'utf8');
  182 |   copyFileSync((await (await subtitles).path())!, join(directory, 'decoded-fixture.srt'));
  183 |   expect(srt).toContain('00:00:00,000 --> 00:00:01,600'); expect(srt).toContain('00:00:04,800 --> 00:00:06,400');
  184 |   expect(srt).toContain('先统一单位'); expect(srt).toContain('保留新的独立观察');
  185 |   await expect(f.current).toContainText('先统一单位');
  186 |   await page.getByRole('slider').fill('1000'); await expect(f.current).toContainText('保留新的独立观察');
  187 |   // A later cancelled recording must not replace the saved video's caption table.
  188 |   await page.route('**/api/learning/studio/whiteboards/**/narration/**', async route => {
  189 |     const response = await route.fetch(); expect(response.status()).toBe(201);
  190 |     const original = await response.body(), longer = Buffer.concat([original, original.subarray(44, 16044)]);
  191 |     longer.writeUInt32LE(longer.length - 8, 4); longer.writeUInt32LE(longer.length - 44, 40);
  192 |     await route.fulfill({ response, body: longer, headers: { ...response.headers(), 'content-length': String(longer.length) } });
  193 |   });
  194 |   await page.getByRole('button', { name: '导出视频' }).click(); await expect(page.locator('.sa-whiteboard-notice')).toContainText('实时录制');
  195 |   await page.getByRole('button', { name: '取消导出' }).click();
  196 |   const retained = page.waitForEvent('download'); await page.getByRole('button', { name: '导出字幕' }).click();
  197 |   expect(readFileSync((await (await retained).path())!, 'utf8')).toContain('00:00:04,800 --> 00:00:06,400');
  198 | });
  199 | 
```
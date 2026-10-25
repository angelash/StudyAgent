# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: classroom-tools.spec.ts >> controlled figures and curriculum images retain their content, contain focus and support reading and printing
- Location: tests\e2e\classroom-tools.spec.ts:69:5

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '放大图形：个人处境与社会条件的交汇', exact: true })

```

# Page snapshot

```yaml
- generic [active]:
  - alert [ref=f1e1]
  - main [ref=f1e2]:
    - region "教学白板" [ref=f1e3]:
      - generic [ref=f1e4]:
        - button "离开课堂" [ref=f1e5] [cursor=pointer]
        - button [ref=f1e8] [cursor=pointer]:
          - text: 社会学想象力
          - generic "断点已同步" [ref=f1e9]
      - generic [ref=f1e12]:
        - button "缩小白板" [ref=f1e13] [cursor=pointer]: −
        - button "重置缩放" [ref=f1e14] [cursor=pointer]: 100%
        - button "放大白板" [ref=f1e15] [cursor=pointer]: ＋
        - button "上一页白板" [disabled] [ref=f1e17]: ‹
        - generic [ref=f1e18]: 1 / 1
        - button "下一页白板" [disabled] [ref=f1e19]: ›
        - button "补一张讲解图" [ref=f1e21] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e22]: ▧
          - text: 配图
        - button "导出课堂笔记" [ref=f1e23] [cursor=pointer]
        - button "课堂设置" [ref=f1e26] [cursor=pointer]
        - button "切换对话面板" [ref=f1e29] [cursor=pointer]
      - generic [ref=f1e33]:
        - generic [ref=f1e34]:
          - heading "本节课导航" [level=2] [ref=f1e35]
          - list [ref=f1e36]:
            - listitem [ref=f1e37]: ·概念是什么？
            - listitem [ref=f1e38]: ·怎样解释生活？
            - listitem [ref=f1e39]: ·用什么证据核查？
        - generic [ref=f1e40]:
          - heading "社会学想象力" [level=2] [ref=f1e41]
          - list [ref=f1e42]:
            - listitem [ref=f1e43]: ·传记：个人经历与选择
            - listitem [ref=f1e44]: ·历史：时代、制度与社会条件
            - listitem [ref=f1e45]: ·交汇点：把个人处境放回社会背景
          - figure "传记与历史的交汇点 · 社会学想象力" [ref=f1e46]:
            - button "放大图片：传记与历史的交汇点 · 社会学想象力" [ref=f1e47] [cursor=pointer]:
              - img "个人处境与社会条件的交汇" [ref=f1e48]
              - generic [aria-hidden] [ref=f1e49]: ↗
      - generic [ref=f1e51]:
        - button "开启讲解声音" [disabled] [ref=f1e52]
        - paragraph [ref=f1e55]: 分析时同时追问个人处境和处境形成的社会条件。
    - separator "调整对话面板宽度" [ref=f1e56]
    - complementary [ref=f1e57]:
      - generic [ref=f1e58]:
        - generic [ref=f1e59]: Chat history
        - button "隐藏对话面板" [ref=f1e62] [cursor=pointer]
      - tablist "课堂内容" [ref=f1e65]:
        - tab "讲解与插问" [selected] [ref=f1e66] [cursor=pointer]
        - tab "课堂练习" [ref=f1e67] [cursor=pointer]
        - tab "单元项目" [ref=f1e68] [cursor=pointer]
      - generic "课堂对话历史" [ref=f1e69]:
        - article [ref=f1e70]:
          - text: 17:06
          - paragraph [ref=f1e71]: 今天一起研究“社会学想象力”。
          - paragraph [ref=f1e72]: 先记住三个问题：这个概念指什么？
          - paragraph [ref=f1e73]: 它怎样解释具体生活？
          - paragraph [ref=f1e74]: 什么证据能帮助我们判断解释是否站得住？
          - button "♧ 本节课导航" [ref=f1e75] [cursor=pointer]
        - article [ref=f1e76]:
          - text: TEACHER
          - paragraph [ref=f1e77]: 米尔斯把个人的生活历程与时代、制度联系起来。
          - paragraph [ref=f1e78]: 分析时同时追问个人处境和处境形成的社会条件。
          - button "♧ 社会学想象力" [ref=f1e79] [cursor=pointer]
        - status [ref=f1e80]: ••• Paused
      - generic [ref=f1e81]:
        - button "‹ 上一步" [ref=f1e82] [cursor=pointer]
        - generic [ref=f1e83]: 2 / 8
        - button "下一步 ›" [ref=f1e84] [cursor=pointer]
      - generic [ref=f1e85]:
        - group "调整讲法" [ref=f1e86]:
          - button "提问" [pressed] [ref=f1e87] [cursor=pointer]
          - button "换个例子" [ref=f1e88] [cursor=pointer]
          - button "说简单点" [ref=f1e89] [cursor=pointer]
          - button "补先修" [ref=f1e90] [cursor=pointer]
          - button "比较讲法" [ref=f1e91] [cursor=pointer]
        - generic [ref=f1e92]:
          - textbox "向课堂老师提问" [ref=f1e93]:
            - /placeholder: Ask a question…
          - button "语音提问" [ref=f1e94] [cursor=pointer]: ♩
          - button "继续讲解" [ref=f1e95] [cursor=pointer]: ▷
          - button "停止课堂讲解" [ref=f1e96] [cursor=pointer]: ■
        - combobox "选择大模型" [ref=f1e99] [cursor=pointer]:
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
    - text: · · · · · ·
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test';
  2   | import { mkdirSync } from 'node:fs';
  3   | import { browserEvidence } from './evidence';
  4   |
  5   | const api = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}/api`, evidence = browserEvidence('classroom-tools');
  6   | let address = 0;
  7   | test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });
  8   | async function enter(page: Page, firstTour = false) {
  9   |   const id = crypto.randomUUID(), principal = 'tools-' + id + '@local.test', credential = 'Tools-only-' + id;
  10  |   const registered = await fetch(api + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.18.8.' + (++address) }, body: JSON.stringify({ principal, credential }) });
  11  |   expect(registered.status).toBe(201);
  12  |   if (!firstTour) await page.addInitScript(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
  13  |   await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  14  |   await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  15  |   await page.goto('/studio/classroom?lesson=soc-1-1-1');
  16  |   await expect(page.getByLabel('向课堂老师提问')).toBeAttached();
  17  | }
  18  | async function replay(page: Page) {
  19  |   await page.getByRole('button', { name: '课堂设置', exact: true }).click();
  20  |   await page.getByRole('button', { name: /Replay the tour/ }).click();
  21  |   await expect(page.getByRole('dialog', { name: '课堂新手引导' })).toBeVisible();
  22  | }
  23  | async function screen(page: Page, name: string) { if (!process.env.CI) { mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: evidence + '/' + name + '.png' }); } }
  24  | async function fittedCard(page: Page) {
  25  |   const box = await page.locator('.cl-tour-card').boundingBox(), viewport = page.viewportSize()!;
  26  |   expect(box).not.toBeNull(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
  27  |   expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1); expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  28  | }
  29  |
  30  | test('anchored tour visits actual controls, resizes and returns without issuing learning or voice requests', async ({ page }) => {
  31  |   await page.setViewportSize({ width: 880, height: 887 }); await enter(page, true);
  32  |   let writes = 0, narration = 0;
  33  |   page.on('request', req => { if (/\/classroom\/sessions\/[^/?]+$/.test(req.url()) && req.method() === 'PATCH') writes++; if (req.url().includes('/narration/')) narration++; });
  34  |   const tour = page.getByRole('dialog', { name: '课堂新手引导' });
  35  |   await expect(tour).toContainText('欢迎来到白板课堂'); await tour.getByRole('button', { name: '开始导览' }).click();
  36  |   const anchors = ['connection', 'notes', 'settings', 'sound', 'microphone', 'playback', 'history'];
  37  |   for (let n = 0; n < anchors.length; n++) {
  38  |     await expect(page.locator('.cl-tour-target')).toHaveAttribute('data-anchor', anchors[n]);
  39  |     await expect(tour.getByRole('status')).toHaveAttribute('aria-label', '第' + (n + 1) + '步，共7步');
  40  |     const actual = await page.locator('[data-classroom-tour="' + anchors[n] + '"]').boundingBox();
  41  |     const frame = await page.locator('.cl-tour-target').boundingBox();
  42  |     expect(actual).not.toBeNull(); expect(frame!.x).toBeLessThanOrEqual(actual!.x); expect(frame!.y).toBeLessThanOrEqual(actual!.y);
  43  |     expect(frame!.x + frame!.width).toBeGreaterThanOrEqual(actual!.x + actual!.width - 1);
  44  |     await fittedCard(page);
  45  |     if (n === 2) { await screen(page, 'tour-settings-880'); await page.setViewportSize({ width: 1440, height: 1000 }); await fittedCard(page); }
  46  |     if (n === 6) await screen(page, 'tour-history-1440');
  47  |     await tour.getByRole('button', { name: n === 6 ? '完成 →' : '下一步 →', exact: true }).click();
  48  |   }
  49  |   await expect(tour).toContainText('准备好了'); await tour.getByRole('button', { name: '返回课堂' }).click();
  50  |   await expect(tour).toHaveCount(0); await expect(page.getByRole('button', { name: '继续讲解', exact: true })).toBeVisible();
  51  |   expect(writes).toBe(0); expect(narration).toBe(0);
  52  |   await replay(page); await page.keyboard.press('Escape'); await expect(tour).toHaveCount(0);
  53  |   await expect(page.getByRole('button', { name: '课堂设置', exact: true })).toBeFocused();
  54  | });
  55  |
  56  | test('phone tour exposes the real chat controls then restores the original board and survives unavailable storage', async ({ page }) => {
  57  |   await page.setViewportSize({ width: 390, height: 844 }); await enter(page, true);
  58  |   await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('QA storage disabled', 'QuotaExceededError'); }; });
  59  |   const room = page.locator('.cl-room'), tour = page.getByRole('dialog', { name: '课堂新手引导' });
  60  |   await tour.getByRole('button', { name: '开始导览' }).click();
  61  |   for (let n = 0; n < 4; n++) await tour.getByRole('button', { name: '下一步 →', exact: true }).click();
  62  |   await expect(room).toHaveAttribute('data-mobile', 'chat'); await expect(page.locator('.cl-tour-target')).toHaveAttribute('data-anchor', 'microphone');
  63  |   await fittedCard(page); await screen(page, 'tour-microphone-390');
  64  |   await page.keyboard.press('Tab'); await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.cl-guided-tour'))).toBe(true);
  65  |   await page.keyboard.press('Escape'); await expect(tour).toHaveCount(0); await expect(room).toHaveAttribute('data-mobile', 'board');
  66  |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  67  | });
  68  |
  69  | test('controlled figures and curriculum images retain their content, contain focus and support reading and printing', async ({ page }) => {
  70  |   await page.setViewportSize({ width: 1440, height: 1000 }); await enter(page);
  71  |   await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
  72  |   await expect(page.locator('.cl-session-navigation')).toContainText('2 / 8');
  73  |   const enlarge = page.getByRole('button', { name: '放大图形：个人处境与社会条件的交汇', exact: true });
> 74  |   await enlarge.click(); const figure = page.getByRole('dialog', { name: '个人处境与社会条件的交汇', exact: true });
      |                 ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
  75  |   await expect(figure.getByRole('img')).toBeVisible(); await figure.getByRole('img').click(); await expect(figure).toBeVisible();
  76  |   await page.keyboard.press('Tab'); await expect(figure.getByRole('button', { name: '关闭图片' })).toBeFocused();
  77  |   await screen(page, 'controlled-figure-1440'); await page.keyboard.press('Escape'); await expect(figure).toHaveCount(0); await expect(enlarge).toBeFocused();
  78  |   const image = page.getByRole('button', { name: '放大图片：传记与历史的交汇点 · 社会学想象力', exact: true });
  79  |   await image.click(); const reader = page.getByRole('dialog', { name: '传记与历史的交汇点 · 社会学想象力', exact: true });
  80  |   await reader.getByRole('img').click(); await expect(reader).toBeVisible();
  81  |   await page.setViewportSize({ width: 390, height: 844 }); await screen(page, 'curriculum-image-390');
  82  |   await page.locator('.cl-figure-reader').click({ position: { x: 3, y: 3 } }); await expect(reader).toHaveCount(0);
  83  |   await page.setViewportSize({ width: 1440, height: 1000 }); await expect(image).toBeFocused();
  84  |   await enlarge.click(); await page.emulateMedia({ media: 'print' }); await expect(page.locator('.cl-figure-reader')).toBeHidden();
  85  |   await expect(page.locator('.cl-print-notes .cl-figure-open')).toHaveCount(0);
  86  | });
  87  |
  88  | test('a failed curriculum image still has a readable alternative and a keyboard exit', async ({ page }) => {
  89  |   await page.route('**/classroom/venn-d8b3f1.webp', route => route.abort('failed'));
  90  |   await enter(page); await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
  91  |   const image = page.getByRole('button', { name: '放大图片：传记与历史的交汇点 · 社会学想象力', exact: true });
  92  |   await image.click(); await expect(page.getByRole('dialog').getByRole('alert')).toContainText('图片暂未能打开');
  93  |   await page.keyboard.press('Escape'); await expect(image).toBeFocused(); await expect(page.getByRole('dialog')).toHaveCount(0);
  94  | });
  95  |
  96  | function wav() { const samples=16000*3, bytes=Buffer.alloc(44+samples*2);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVE',8);bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);bytes.writeUInt32LE(32000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples*2,40);return bytes; }
  97  | test('voice samples decode actual audio, keep the selected voice and original progress, and cannot play after settings closes', async ({ page }) => {
  98  |   await page.setViewportSize({ width: 880, height: 887 });
  99  |   await page.addInitScript(() => { const NativeAudio=window.Audio;(window as any).__sampleAudio=[];window.Audio=class extends NativeAudio{constructor(src?:string){super(src);(window as any).__sampleAudio.push(this);}}; });
  100 |   await page.route(/\/api\/learning\/classroom\/sessions(?:\/[^/?]+)?$/, async route => {
  101 |     const response=await route.fetch(), body=await response.json();if(body.data?.lesson)body.data.speech={available:true,provider:'minimax',defaultVoice:'qa-Warm',voices:['Warm','Calm','Bright','Gentle','Professional','Lively'].map(label=>({id:'qa-'+label,label}))};
  102 |     await route.fulfill({response,json:body});
  103 |   });
  104 |   let release!:()=>void, delivered!:()=>void;const hold=new Promise<void>(resolve=>release=resolve), delivery=new Promise<void>(resolve=>delivered=resolve);let holdCalm=false;
  105 |   await page.route('**/api/learning/classroom/sessions/*/narration/*',async route=>{if(holdCalm&&route.request().postDataJSON().voice==='qa-Calm')await hold;try{await route.fulfill({contentType:'audio/wav',body:wav()});}catch{/* The closed reader has aborted its request. */}finally{if(holdCalm)delivered();}});
  106 |   try {
  107 |   await enter(page);await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await expect(page.locator('.cl-session-navigation')).toContainText('2 / 8');
  108 |   let writes=0;page.on('request',req=>{if(req.method()==='PATCH'&&/\/classroom\/sessions\/[^/?]+$/.test(req.url()))writes++;});
  109 |   await page.getByRole('button',{name:'课堂设置',exact:true}).click();const settings=page.getByRole('dialog',{name:'课堂设置'});
  110 |   await expect(settings.getByRole('radio')).toHaveCount(6);await expect(settings.getByRole('radio',{name:/Warm/})).toHaveAttribute('aria-checked','true');
  111 |   await settings.getByRole('button',{name:'试听音色：Calm',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__sampleAudio.some((audio:HTMLAudioElement)=>!audio.paused))).toBe(true);
  112 |   await expect(settings.getByRole('radio',{name:/Warm/})).toHaveAttribute('aria-checked','true');
  113 |   await settings.getByRole('button',{name:'1.5×',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__sampleAudio.at(-1)?.playbackRate)).toBe(1.5);
  114 |   await settings.getByRole('button',{name:'停止试听：Calm',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__sampleAudio.every((audio:HTMLAudioElement)=>audio.paused))).toBe(true);
  115 |   await screen(page,'voice-settings-880');holdCalm=true;
  116 |   await settings.getByRole('button',{name:'试听音色：Calm',exact:true}).click();await expect(settings.getByRole('button',{name:'停止试听：Calm',exact:true})).toBeVisible();
  117 |   await settings.getByRole('button',{name:'关闭课堂设置'}).click();release();await delivery;
  118 |   await expect.poll(()=>page.evaluate(()=>(window as any).__sampleAudio.length)).toBe(1);await expect(page.locator('.cl-session-navigation')).toContainText('2 / 8');expect(writes).toBe(0);
  119 |   } finally { release(); }
  120 | });
  121 |
```
# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: studio.spec.ts >> a parent can build and reopen an evidence-backed learning studio course
- Location: tests\e2e\studio.spec.ts:35:5

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Materials', exact: true })

```

# Page snapshot

```yaml
- generic [ref=f3e1]:
  - alert [ref=f3e2]
  - main [ref=f3e3]:
    - button "打开学习导航" [active] [ref=f3e4] [cursor=pointer]
    - generic [ref=f3e7]:
      - generic [ref=f3e8]:
        - generic [ref=f3e9]:
          - combobox "学习档案" [ref=f3e10]:
            - option "工作台验收" [selected]
          - combobox "学科" [ref=f3e11]:
            - option "数学" [selected]
            - option "语文"
            - option "英语"
            - option "化学"
        - generic [ref=f3e12]:
          - link "教学课堂 ↗" [ref=f3e13] [cursor=pointer]:
            - /url: /studio/classroom
          - link "学习观察室" [ref=f3e14] [cursor=pointer]:
            - /url: /
      - generic [ref=f3e15]:
        - generic [ref=f3e16]:
          - button "Craft Courses" [ref=f3e17] [cursor=pointer]
          - button "Instant Assistance" [ref=f3e18] [cursor=pointer]
        - generic [ref=f3e19]:
          - heading "把下一步，做成一条走得通的路。" [level=1] [ref=f3e20]
          - paragraph [ref=f3e21]: 从已确认学习范围生成课程蓝图，审阅结构和来源后再开始。
        - generic [ref=f3e22]:
          - textbox "围绕哪段学习内容设计课程？" [ref=f3e23]
          - generic [ref=f3e24]:
            - generic [ref=f3e25]: ＋
            - generic [ref=f3e26]: 资料
            - button "Concept Explanation" [ref=f3e27] [cursor=pointer]
            - generic [ref=f3e28]: 语音
            - generic [ref=f3e30]:
              - generic [ref=f3e31]:
                - generic [ref=f3e32]: 模型
                - combobox "选择大模型" [ref=f3e33] [cursor=pointer]:
                  - option "Auto · 平台默认 DeepSeek V4.1 Flash"
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
              - generic [ref=f3e34]: 尚未进行文字检查
            - button "↑" [ref=f3e36] [cursor=pointer]
        - generic [ref=f3e37]:
          - button "可视化 用图形解释异分母加法 通分、合并与验算" [ref=f3e38] [cursor=pointer]:
            - generic [ref=f3e39]: 可视化
            - generic [ref=f3e40]: 用图形解释异分母加法
            - generic [ref=f3e41]: 通分、合并与验算
          - button "个性化练习 从我的已知点生成练习 只覆盖已确认范围" [ref=f3e42] [cursor=pointer]:
            - generic [ref=f3e43]: 个性化练习
            - generic [ref=f3e44]: 从我的已知点生成练习
            - generic [ref=f3e45]: 只覆盖已确认范围
          - button "主动学习 看看今天最值得做什么 按教育优先级排序" [ref=f3e46] [cursor=pointer]:
            - generic [ref=f3e47]: 主动学习
            - generic [ref=f3e48]: 看看今天最值得做什么
            - generic [ref=f3e49]: 按教育优先级排序
        - generic [ref=f3e50]:
          - heading "你的学习路径" [level=2] [ref=f3e51]
          - button "创建课程" [ref=f3e52] [cursor=pointer]
        - button "5年级 分数关系与证据 从已确认的2个知识点出发，用可验证的新题与间隔复测形成连续学习路径。 1 单元 · 2 目标" [ref=f3e54] [cursor=pointer]:
          - generic [ref=f3e55]: 5年级
          - heading "分数关系与证据" [level=3] [ref=f3e56]
          - paragraph [ref=f3e57]: 从已确认的2个知识点出发，用可验证的新题与间隔复测形成连续学习路径。
          - generic [ref=f3e58]: 1 单元 · 2 目标
```

# Test source

```ts
  1   | import { browserEvidence } from './evidence';
  2   | import { expect, test } from '@playwright/test';
  3   | import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
  4   | import { tmpdir } from 'node:os';
  5   | import { join } from 'node:path';
  6   | 
  7   | const apiUrl = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}`;
  8   | 
  9   | function writeTextPdf() {
  10  |   const directory = mkdtempSync(join(tmpdir(), 'studio-browser-pdf-'));
  11  |   const path = join(directory, '分数讲义.pdf');
  12  |   const stream = 'BT /F1 20 Tf 72 700 Td (Fractions: unify the unit, combine equal parts,) Tj 0 -30 Td ' +
  13  |     '(then check the result with another representation.) Tj 0 -30 Td (1/2 + 1/3 = 5/6) Tj ET';
  14  |   const objects = [
  15  |     '<< /Type /Catalog /Pages 2 0 R >>',
  16  |     '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  17  |     '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  18  |     '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  19  |     '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream',
  20  |   ];
  21  |   let body = '%PDF-1.4\n'; const offsets: number[] = [0];
  22  |   objects.forEach((object, index) => { offsets.push(Buffer.byteLength(body)); body += (index + 1) + ' 0 obj\n' + object + '\nendobj\n'; });
  23  |   const xref = Buffer.byteLength(body); body += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  24  |   offsets.slice(1).forEach(offset => { body += String(offset).padStart(10, '0') + ' 00000 n \n'; });
  25  |   body += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  26  |   writeFileSync(path, body, 'ascii');
  27  |   return { path, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
  28  | }
  29  | 
  30  | async function selectWorkspaceView(page: import('@playwright/test').Page, name: 'Home' | 'Courses' | 'Calendar' | 'Materials') {
  31  |   if ((page.viewportSize()?.width ?? 1280) <= 1000) await page.getByRole('button', { name: '打开学习导航', exact: true }).click();
> 32  |   await page.getByRole('button', { name, exact: true }).click();
      |                                                         ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
  33  | }
  34  | 
  35  | test('a parent can build and reopen an evidence-backed learning studio course', async ({ page }) => {
  36  |   test.setTimeout(240_000);
  37  |   const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  38  |   await page.setViewportSize({ width: 1440, height: 1000 });
  39  |   const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
  40  |   const principal = `studio-${suffix}@local.test`;
  41  |   const credential = `Studio-only-${suffix}`;
  42  |   const registration = await fetch(`${apiUrl}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' },
  43  |     body: JSON.stringify({ principal, credential }) });
  44  |   expect(registration.status).toBe(201);
  45  |   const auth = await registration.json();
  46  |   const headers = { 'content-type': 'application/json', authorization: `Bearer ${auth.data.token}` };
  47  |   const studentResponse = await fetch(`${apiUrl}/api/students`, { method: 'POST', headers,
  48  |     body: JSON.stringify({ nickname: '工作台验收', grade: 5, preferredSessionMinutes: 15,
  49  |       defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }) });
  50  |   expect(studentResponse.status).toBe(201);
  51  |   const student = await studentResponse.json();
  52  |   const studentId = student.data.profile.id;
  53  |   const scope = await fetch(`${apiUrl}/api/students/${studentId}/learning-scope?subject=math`, { method: 'PUT', headers,
  54  |     body: JSON.stringify({ subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null,
  55  |       textbookVersion: '按已学知识点确认', learnedAtomIds: ['core:math:fractionadd', 'core:math:fractionsubtract'],
  56  |       currentAtomId: 'core:math:fractionadd', minutesPerSession: 15, progressMode: 'knowledge', selectedLessonIds: [] }) });
  57  |   expect(scope.status).toBe(200);
  58  | 
  59  |   await page.goto('/parent/login');
  60  |   await page.getByLabel('登录账号').fill(principal);
  61  |   await page.getByLabel('密码').fill(credential);
  62  |   await page.getByRole('button', { name: '登录，查看学习记录 →' }).click();
  63  |   await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  64  |   await page.goto('/studio');
  65  |   await expect(page.getByRole('button', { name: 'Craft Courses' })).toBeVisible();
  66  |   await expect(page.getByRole('button', { name: 'Instant Assistance' })).toBeVisible();
  67  |   if (!process.env.CI) await page.screenshot({ path: browserEvidence('studio') + '/studio-home-polished.png', fullPage: true });
  68  |   await page.getByRole('button', { name: '生成第一门课程' }).click();
  69  |   await page.getByLabel('课程名称', {exact:true}).fill('分数关系与证据');
  70  |   await page.getByRole('button', { name: '预览课程蓝图' }).click();
  71  |   await expect(page.getByText('Unit 1:', { exact: false }).first()).toBeVisible();
  72  |   await page.getByRole('button', { name: '确认并创建' }).click();
  73  |   await expect(page.getByRole('heading', { name: '分数关系与证据' })).toBeVisible();
  74  |   await expect(page.getByText('Unit 1:', { exact: false }).first()).toBeVisible();
  75  |   if (!process.env.CI) await page.screenshot({ path: browserEvidence('studio') + '/studio-course-polished.png', fullPage: true });
  76  | 
  77  |   await selectWorkspaceView(page, 'Courses');
  78  |   const ticket = page.locator('.ws-course-ticket').filter({ has: page.getByRole('button', { name: '打开课程：分数关系与证据', exact: true }) });
  79  |   await page.evaluate(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
  80  |   await ticket.locator('.ws-ticket-next').click();
  81  |   await expect(page.locator('.cl-room')).toBeVisible();
  82  |   await page.getByRole('button', { name: '离开课堂', exact: true }).click();
  83  |   await page.getByRole('button', { name: '保存并离开' }).click();
  84  |   await expect(page.getByRole('heading', { name: '分数关系与证据' })).toBeVisible();
  85  | 
  86  |   await selectWorkspaceView(page, 'Home');
  87  |   await page.getByRole('button', { name: 'Instant Assistance' }).click();
  88  |   await page.getByRole('button', { name: 'Concept Explanation' }).click();
  89  |   await page.getByRole('button', { name: 'Tools', exact: true }).click();
  90  |   await page.getByRole('menuitem', { name: /Whiteboard session/ }).click();
  91  |   await page.getByLabel('想一起看看什么', { exact: true }).fill('解释异分母分数加法');
  92  |   await page.getByRole('button', { name: '预览白板主题', exact: true }).click();
  93  |   await expect(page.getByText('WHITEBOARD SESSION', { exact: true })).toBeVisible();
  94  |   if (!process.env.CI) await page.screenshot({ path: browserEvidence('studio') + '/studio-whiteboard-preview.png', fullPage: true });
  95  |   await page.getByRole('button', { name: '保存到学习工作台' }).click();
  96  |   await expect(page.getByRole('dialog', { name: '白板视频' })).toBeVisible();
  97  |   if (!process.env.CI) await page.screenshot({ path: browserEvidence('studio') + '/studio-whiteboard-player.png', fullPage: true });
  98  |   const videoDownload = page.waitForEvent('download', { timeout: 120_000 });
  99  |   await page.getByRole('button', { name: '导出视频' }).click();
  100 |   const video = await videoDownload;
  101 |   expect(video.suggestedFilename()).toMatch(/\.webm$/);
  102 |   expect(statSync(await video.path()).size).toBeGreaterThan(2_000);
  103 |   const subtitleDownload = page.waitForEvent('download');
  104 |   await page.getByRole('button', { name: '导出字幕' }).click();
  105 |   expect((await subtitleDownload).suggestedFilename()).toMatch(/\.srt$/);
  106 |   await page.getByRole('button', { name: '关闭白板' }).click();
  107 | 
  108 |   await selectWorkspaceView(page, 'Calendar');
  109 |   await page.getByRole('button', { name: '＋ 新建学习安排' }).click();
  110 |   await page.getByLabel('任务名称').fill('分数复习安排');
  111 |   await page.getByLabel('完成标准').fill('独立完成 5 道新题并说出关键步骤');
  112 |   await page.getByRole('button', { name: '加入学习日历' }).click();
  113 |   await expect(page.locator('.ws-month-grid').getByText('分数复习安排')).toBeVisible();
  114 |   await page.getByRole('button', { name: '连接 LMS / 日历' }).click();
  115 |   await page.getByLabel('来源类型').selectOption('lms_ics');
  116 |   await page.getByLabel('或粘贴 ICS 文件内容').fill('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:school-1\nDTSTART:20261103T080000+0800\nDTEND:20261103T084500+0800\nSUMMARY:学校单元复习\nEND:VEVENT\nEND:VCALENDAR');
  117 |   await page.getByRole('button', { name: '连接并同步' }).click();
  118 |   await page.getByRole('button', {name:'下一个日期范围'}).click();
  119 |   await expect(page.locator('.ws-month-grid').getByText('学校单元复习')).toBeVisible();
  120 |   await expect(page.getByRole('button', { name: '连接并同步' })).toHaveCount(0);
  121 |   await page.locator('.ws-calendar-management > summary').click();
  122 |   await page.getByRole('button', { name: '＋ 生成诊断学习计划' }).click();
  123 |   await expect(page.getByLabel('计划目标')).toBeVisible();
  124 |   await page.getByRole('button', { name: '预览学习计划' }).click();
  125 |   await expect(page.getByText('审阅后再加入日历')).toBeVisible();
  126 |   await expect(page.getByText(/计划完成只表示执行过任务/)).toBeVisible();
  127 |   await page.getByRole('button', { name: '确认并加入日历' }).click();
  128 |   await expect(page.locator('.sa-plan-card')).toBeVisible();
  129 |   await page.locator('.sa-plan-actions').getByRole('button', { name: '完成', exact: true }).first().click();
  130 |   await expect(page.getByText('D+1 延迟复测', { exact: false }).first()).toBeVisible();
  131 |   await expect(page.getByText(/D\+14/).last()).toBeVisible();
  132 |   if (!process.env.CI) await page.screenshot({ path: browserEvidence('studio') + '/studio-calendar-polished.png', fullPage: true });
```
# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: knowledge-report.spec.ts >> knowledge report: the actual frozen goals, unknown estimates and self-reports stay together when selecting a point
- Location: tests\e2e\knowledge-report.spec.ts:35:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('region', { name: '知识点工作区' })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('region', { name: '知识点工作区' }) with timeout 15000ms
  - waiting for getByRole('region', { name: '知识点工作区' })

```

```yaml
- main:
  - link "学习观察室":
    - /url: /
  - navigation "主要导航":
    - link "学习首页":
      - /url: /learn?subject=math&student=student_0631e136-baa2-4c2c-87ba-6fb3a15b0c02
    - link "学习工作台":
      - /url: /studio?subject=math&student=student_0631e136-baa2-4c2c-87ba-6fb3a15b0c02
    - link "家长空间":
      - /url: /parent/dashboard?subject=math&studentId=student_0631e136-baa2-4c2c-87ba-6fb3a15b0c02
    - link "知识诊断":
      - /url: /student/assessment?subject=math&studentId=student_0631e136-baa2-4c2c-87ba-6fb3a15b0c02
    - link "今日学习":
      - /url: /student/today?subject=math&studentId=student_0631e136-baa2-4c2c-87ba-6fb3a15b0c02
    - link "题卷资料":
      - /url: /library?subject=math&studentId=student_0631e136-baa2-4c2c-87ba-6fb3a15b0c02
  - link "资料管理":
    - /url: /parent/data
  - button "退出"
  - complementary:
    - text: LEARNING / INSIGHT
    - heading "把知识 学扎实。" [level=1]:
      - text: 把知识
      - emphasis: 学扎实。
    - paragraph: 从学到了哪里开始，找到卡住的那一步，再用新题看看是否真的掌握。
    - list:
      - listitem: 01 确认学习进度
      - listitem: 02 完成一组评测
      - listitem: 03 看懂知识与原因
      - listitem: 04 指导、复测与复盘
    - text: 匿
    - strong: 匿名知识点观察
    - text: 4年级 · 数学
    - button "返回学习进度与历史"
  - text: 03 / 知道表现，也知道依据
  - heading "从知识点看清下一步。" [level=2]
  - paragraph: 本次已评分 6 题，0 题待复核；2 个知识点仍需补充证据。下一步优先核查具体知识与步骤。
  - group: 本次范围：4年级 · 上学期 · 合成已学知识范围
  - status: 正在核对报告依据…
  - status: 正在核对报告依据…
  - group: 报告版本与评分变更记录
  - group: 测量时采用的知识目标与标准
  - strong: 6 / 6
  - text: 已评分题目
  - strong: 0%
  - text: 本次题目得分
  - strong: "0"
  - text: 尚未测到的点
  - heading "知识掌握与证据范围" [level=3]
  - paragraph: 点按知识点展开作答依据。横线范围越宽，说明仍需要更多证据。
  - article:
    - button "平均数的总量等分 证据待补充 · 3 题证据 · 3 个题族 20% ⌄":
      - strong: 平均数的总量等分
      - text: 证据待补充 · 3 题证据 · 3 个题族 20% ⌄
  - article:
    - button "明确平均对象并把零数据计入份数 证据待补充 · 3 题证据 · 3 个题族 20% ⌄":
      - strong: 明确平均对象并把零数据计入份数
      - text: 证据待补充 · 3 题证据 · 3 个题族 20% ⌄
  - region "综合题中的具体步骤":
    - heading "把这一步单独看清。" [level=3]
    - paragraph: 综合题的步骤提供线索。这个知识点的掌握情况，由独立题组继续测量。
    - article:
      - heading "明确平均对象并把零数据计入份数" [level=4]
      - strong: 还没有可核对的步骤
      - paragraph: 本次未形成可以核对的已评分步骤，子点表现仍未知。
      - paragraph: 先完成可独立评分的新题；暂时不会和跳过不能定位具体步骤。
      - group: 核对这道综合题与当时回答
      - button "预览这个步骤的独立题组 ↗"
      - paragraph: 题组会列出需要核查的基础内容，确认范围后再开始。
  - heading "可能卡在哪里，以及怎样验证" [level=3]
  - article:
    - text: 待验证
    - heading "当前知识点的理解或执行需要核查" [level=4]
    - paragraph: 在“平均数的总量等分”的 0 道不同题目中观察到未达标作答。另有 3 次选择暂时不会，尚无过程可以核对。
    - paragraph: 基础题表现可以定位到当前行为，尚不能单独解释产生问题的原因。
    - text: 支持 0 条 · 反证 0 条
    - group: 查看验证条件、依据与其他解释
    - button "做一组题验证原因 ↗"
  - article:
    - text: 待验证
    - heading "当前知识点的理解或执行需要核查" [level=4]
    - paragraph: 在“明确平均对象并把零数据计入份数”的 0 道不同题目中观察到未达标作答。另有 3 次选择暂时不会，尚无过程可以核对。
    - paragraph: 基础题表现可以定位到当前行为，尚不能单独解释产生问题的原因。
    - text: 支持 0 条 · 反证 0 条
    - group: 查看验证条件、依据与其他解释
    - button "做一组题验证原因 ↗"
  - heading "让评测变成下一步行动。" [level=3]
  - paragraph: 计划包含指导活动、成功标准与间隔复测。
  - button "制定指导计划 ↗"
  - paragraph: 掌握度为规则估计，区间表示现有证据的不确定性；尚未建立标准化常模。一次表现不能确定深层原因。
  - button "打开学习观察助教"
- alert
```

# Test source

```ts
  1  | import { expect, test, type Page } from '@playwright/test';
  2  | import { createHash, randomUUID } from 'node:crypto';
  3  | import { writeFileSync } from 'node:fs';
  4  | import { join } from 'node:path';
  5  | import { browserEvidence } from './evidence';
  6  | 
  7  | const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107') + '/api';
  8  | async function fixture(page: Page) {
  9  |   const hash = createHash('sha256').update(test.info().testId).digest(), address = '198.19.' + hash[0] + '.' + hash[1];
  10 |   const principal = 'report-browser-' + randomUUID() + '@local.test', credential = 'Synthetic-Report-Only-20261026';
  11 |   await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address }); let token = '';
  12 |   async function call(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  13 |     const response = await fetch(api + path, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address,
  14 |       ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  15 |     expect(response.ok, path + ': ' + response.status).toBe(true); return (await response.json()).data;
  16 |   }
  17 |   const actor = await call('/auth/register', { principal, credential }); token = actor.token;
  18 |   const studentId = (await call('/students', { nickname: '匿名知识点观察', grade: 4, preferredSessionMinutes: 10,
  19 |     defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } })).profile.id;
  20 |   const atomIds = ['core:math:average', 'atomic:math:averagecount'];
  21 |   await call('/students/' + studentId + '/learning-scope', { subject: 'math', grade: 4, term: 'upper', textbookVolumeId: null,
  22 |     textbookVersion: '合成已学知识范围', learnedAtomIds: atomIds, currentAtomId: atomIds[0], minutesPerSession: 10,
  23 |     progressMode: 'knowledge', selectedLessonIds: [] }, 'PUT');
  24 |   const session = await call('/diagnostics/sessions', { studentId, subject: 'math', intent: 'baseline', targetAtomIds: atomIds,
  25 |     includePrerequisites: false, adaptive: false, maxItems: 8 });
  26 |   for (const item of session.items) await call('/diagnostics/sessions/' + session.id + '/responses', { itemId: item.id, disposition: 'dont_know', elapsedMs: 1000 });
  27 |   const report = await call('/diagnostics/sessions/' + session.id + '/complete', {});
  28 |   await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  29 |   await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  30 |   const href = '/student/assessment?' + new URLSearchParams({ studentId, subject: 'math', session: session.id });
  31 |   await page.goto(href); await expect(page.getByRole('heading', { name: '从知识点看清下一步。' })).toBeVisible();
  32 |   return { call, report, session, studentId, atomIds, href };
  33 | }
  34 | 
  35 | test('knowledge report: the actual frozen goals, unknown estimates and self-reports stay together when selecting a point', async ({ page }) => {
  36 |   await page.setViewportSize({ width: 1440, height: 1000 }); const f = await fixture(page);
  37 |   const directory = browserEvidence('knowledge-report');
  38 |   writeFileSync(join(directory, 'actual-report-original.json'), JSON.stringify(f.report, null, 2) + '\n');
  39 |   await page.screenshot({ path: join(directory, 'report-current.png'), fullPage: true });
> 40 |   const workspace = page.getByRole('region', { name: '知识点工作区' }); await expect(workspace).toBeVisible();
     |                                                                                           ^ Error: expect(locator).toBeVisible() failed
  41 |   for (const atomId of f.atomIds) {
  42 |     const estimate = f.report.estimates.find((row: any) => row.atomId === atomId), definition = f.report.definitionContext.atoms.find((row: any) => row.id === atomId);
  43 |     await workspace.getByRole('button', { name: '查看知识点：' + estimate.atomName, exact: true }).click();
  44 |     await expect(workspace.getByRole('heading', { name: estimate.atomName, exact: true })).toBeVisible();
  45 |     await expect(workspace).toContainText(definition.objective); await expect(workspace).toContainText(definition.successCriterion);
  46 |     await expect(workspace.getByRole('region', { name: '本点量化与未知项' })).toContainText('尚未形成有效估计');
  47 |     await expect(workspace.getByRole('region', { name: '本点表面表现' })).toContainText('选择暂时不会');
  48 |     expect(new URL(page.url()).searchParams.get('reportAtom')).toBe(atomId);
  49 |   }
  50 | });
  51 | 
```
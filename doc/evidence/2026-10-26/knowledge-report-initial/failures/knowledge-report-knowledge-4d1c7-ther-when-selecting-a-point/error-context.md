# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: knowledge-report.spec.ts >> knowledge report: the actual frozen goals, original estimates and self-reports stay together when selecting a point
- Location: tests\e2e\knowledge-report.spec.ts:35:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('region', { name: '知识点工作区' }).getByRole('heading', { name: '明确平均对象并把零数据计入份数', exact: true })
Expected: visible
Error: strict mode violation: getByRole('region', { name: '知识点工作区' }).getByRole('heading', { name: '明确平均对象并把零数据计入份数', exact: true }) resolved to 2 elements:
    1) <h3>明确平均对象并把零数据计入份数</h3> aka locator('h3').filter({ hasText: '明确平均对象并把零数据计入份数' })
    2) <h4>明确平均对象并把零数据计入份数</h4> aka getByRole('region', { name: '综合题中的具体步骤' }).getByRole('heading', { name: '明确平均对象并把零数据计入份数' })

Call log:
  - Expect "toBeVisible" getByRole('region', { name: '知识点工作区' }).getByRole('heading', { name: '明确平均对象并把零数据计入份数', exact: true }) with timeout 15000ms
  - waiting for getByRole('region', { name: '知识点工作区' }).getByRole('heading', { name: '明确平均对象并把零数据计入份数', exact: true })

```

# Page snapshot

```yaml
- generic [ref=f1e1]:
  - main [ref=f1e2]:
    - generic [ref=f1e3]:
      - link "学习观察室" [ref=f1e4] [cursor=pointer]:
        - /url: /
        - generic [aria-hidden] [ref=f1e5]: 学
        - text: 学习观察室
      - navigation "主要导航" [ref=f1e6]:
        - link "学习首页" [ref=f1e7] [cursor=pointer]:
          - /url: /learn?subject=math&student=student_9f432edd-e6ff-4cd3-8115-95b5f4410c3b
        - link "学习工作台" [ref=f1e8] [cursor=pointer]:
          - /url: /studio?subject=math&student=student_9f432edd-e6ff-4cd3-8115-95b5f4410c3b
        - link "家长空间" [ref=f1e9] [cursor=pointer]:
          - /url: /parent/dashboard?subject=math&studentId=student_9f432edd-e6ff-4cd3-8115-95b5f4410c3b
        - link "知识诊断" [ref=f1e10] [cursor=pointer]:
          - /url: /student/assessment?subject=math&studentId=student_9f432edd-e6ff-4cd3-8115-95b5f4410c3b
        - link "今日学习" [ref=f1e11] [cursor=pointer]:
          - /url: /student/today?subject=math&studentId=student_9f432edd-e6ff-4cd3-8115-95b5f4410c3b
        - link "题卷资料" [ref=f1e12] [cursor=pointer]:
          - /url: /library?subject=math&studentId=student_9f432edd-e6ff-4cd3-8115-95b5f4410c3b
      - generic [ref=f1e13]:
        - link "资料管理" [ref=f1e14] [cursor=pointer]:
          - /url: /parent/data
        - button "退出" [ref=f1e15] [cursor=pointer]
    - generic [ref=f1e16]:
      - complementary [ref=f1e17]:
        - text: LEARNING / INSIGHT
        - heading [level=1] [ref=f1e18]:
          - text: 把知识
          - emphasis [ref=f1e19]: 学扎实。
        - paragraph [ref=f1e20]: 从学到了哪里开始，找到卡住的那一步，再用新题看看是否真的掌握。
        - list [ref=f1e21]:
          - listitem [ref=f1e22]:
            - generic [ref=f1e23]: "01"
            - text: 确认学习进度
          - listitem [ref=f1e24]:
            - generic [ref=f1e25]: "02"
            - text: 完成一组评测
          - listitem [ref=f1e26]:
            - generic [ref=f1e27]: "03"
            - text: 看懂知识与原因
          - listitem [ref=f1e28]:
            - generic [ref=f1e29]: "04"
            - text: 指导、复测与复盘
        - generic [ref=f1e30]:
          - generic [ref=f1e31]: 匿
          - generic [ref=f1e32]:
            - strong [ref=f1e33]: 匿名知识点观察
            - generic [ref=f1e34]: 4年级 · 数学
        - button "返回学习进度与历史" [ref=f1e35] [cursor=pointer]
      - generic [ref=f1e36]:
        - generic [ref=f1e37]:
          - text: 03 / 知道表现，也知道依据
          - heading "从知识点看清下一步。" [level=2] [ref=f1e38]
          - paragraph [ref=f1e39]: 本次已评分 6 题，0 题待复核；2 个知识点仍需补充证据。下一步优先核查具体知识与步骤。
        - group [ref=f1e40]:
          - generic "本次范围：4年级 · 上学期 · 合成已学知识范围" [ref=f1e41] [cursor=pointer]
        - status [ref=f1e42]: 正在核对报告依据…
        - status [ref=f1e43]: 正在核对报告依据…
        - group [ref=f1e44]:
          - generic "报告版本与评分变更记录" [ref=f1e45] [cursor=pointer]
        - group [ref=f1e46]:
          - generic "测量时采用的知识目标与标准" [ref=f1e47] [cursor=pointer]
        - generic [ref=f1e48]:
          - generic [ref=f1e49]:
            - strong [ref=f1e50]:
              - text: "6"
              - generic [ref=f1e51]: / 6
            - generic [ref=f1e52]: 已评分题目
          - generic [ref=f1e53]:
            - strong [ref=f1e54]: 0%
            - generic [ref=f1e55]: 本次题目得分
          - generic [ref=f1e56]:
            - strong [ref=f1e57]: "0"
            - generic [ref=f1e58]: 尚未测到的点
        - region "知识点工作区" [ref=f1e59]:
          - generic [ref=f1e60]:
            - generic [ref=f1e61]:
              - text: KNOWLEDGE / 一点一点看清
              - heading "知识掌握与证据范围" [level=3] [ref=f1e62]
            - paragraph [ref=f1e63]: 选一个知识点，把表现、可能原因和下一步放在一起。
          - generic [ref=f1e64]:
            - complementary "本报告知识点目录" [ref=f1e65]:
              - generic [ref=f1e66]:
                - text: 查找知识点
                - searchbox "查找知识点" [ref=f1e67]
              - paragraph [ref=f1e68]: 2 / 2 个知识点
              - generic [ref=f1e69]:
                - button "查看知识点：平均数的总量等分" [ref=f1e70] [cursor=pointer]:
                  - strong [ref=f1e71]: 平均数的总量等分
                  - generic [ref=f1e72]: 证据待补充
                - button "查看知识点：明确平均对象并把零数据计入份数" [active] [pressed] [ref=f1e73] [cursor=pointer]:
                  - strong [ref=f1e74]: 明确平均对象并把零数据计入份数
                  - generic [ref=f1e75]: 证据待补充
            - generic [ref=f1e76]:
              - generic [ref=f1e77]:
                - generic [ref=f1e78]: 证据待补充
                - heading "明确平均对象并把零数据计入份数" [level=3] [ref=f1e79]
              - region "本点冻结目标" [ref=f1e80]:
                - heading "当时要测什么" [level=4] [ref=f1e81]
                - paragraph [ref=f1e82]:
                  - strong [ref=f1e83]: 目标：
                  - text: 按问题指定的人、天等平均对象确定份数；参与且为0的记录仍计入，未参加不混入，记录缺失不当成0
                - paragraph [ref=f1e84]:
                  - strong [ref=f1e85]: 成功标准：
                  - text: 能从完整记录和参与范围独立选择分母，区分0、未参加与未记录，在对象改变的新题中验证，并经过真实间隔复核。
              - region "本点量化与未知项" [ref=f1e86]:
                - heading "目前的证据说明什么" [level=4] [ref=f1e87]
                - generic [ref=f1e88]:
                  - strong [ref=f1e89]: 20%
                  - paragraph [ref=f1e90]: 当前记录的参考估计，继续结合题目表现核对。
                - img "参考估计20%，区间0.6%至60.2%" [ref=f1e91]
                - paragraph [ref=f1e94]: 参考区间 0.6% – 60.2%。区间越宽，越需要补充证据。
                - generic [ref=f1e95]:
                  - generic [ref=f1e96]:
                    - generic [ref=f1e97]: 理解
                    - strong [ref=f1e98]: 33.3%
                  - generic [ref=f1e99]:
                    - generic [ref=f1e100]: 操作
                    - strong [ref=f1e101]: 33.3%
                  - generic [ref=f1e102]:
                    - generic [ref=f1e103]: 迁移
                    - strong [ref=f1e104]: 33.3%
                  - generic [ref=f1e105]:
                    - generic [ref=f1e106]: 保持
                    - strong [ref=f1e107]: 未测
                - paragraph [ref=f1e108]: 3 条计入估计的记录 · 3 个题族；相同结构的变式合并考虑。
                - paragraph [ref=f1e109]: 本组有 3 次选择暂时不会。现行规则将这类记录计入参考估计，但没有可核对的解题步骤，原因仍需实际作答验证。
                - paragraph [ref=f1e110]: 迁移：仍需独立新题验证 · 保持：仍需真实间隔复测
              - region "本点表面表现" [ref=f1e111]:
                - heading "这组题里，看到了什么" [level=4] [ref=f1e112]
                - article [ref=f1e113]:
                  - strong [ref=f1e114]: 选择暂时不会
                  - paragraph [ref=f1e116]: 孩子选择暂时不会；没有提交可供核对的解题过程，不能据此确定卡住的步骤或深层原因。
                  - paragraph [ref=f1e117]: 学生选择暂时不会，作为当前任务表现记录。
                  - paragraph [ref=f1e118]: 未填写
                  - paragraph [ref=f1e119]: 未提交可核对的解题过程 · 1 秒
                  - group [ref=f1e120]:
                    - generic "展开当时题目与作答" [ref=f1e121] [cursor=pointer]
                  - group [ref=f1e122]:
                    - generic "对这道题有疑问？反馈并查看处理记录" [ref=f1e123] [cursor=pointer]
                - article [ref=f1e124]:
                  - strong [ref=f1e125]: 选择暂时不会
                  - paragraph [ref=f1e127]: 孩子选择暂时不会；没有提交可供核对的解题过程，不能据此确定卡住的步骤或深层原因。
                  - paragraph [ref=f1e128]: 学生选择暂时不会，作为当前任务表现记录。
                  - paragraph [ref=f1e129]: 未填写
                  - paragraph [ref=f1e130]: 未提交可核对的解题过程 · 1 秒
                  - group [ref=f1e131]:
                    - generic "展开当时题目与作答" [ref=f1e132] [cursor=pointer]
                  - group [ref=f1e133]:
                    - generic "对这道题有疑问？反馈并查看处理记录" [ref=f1e134] [cursor=pointer]
                - article [ref=f1e135]:
                  - strong [ref=f1e136]: 选择暂时不会
                  - paragraph [ref=f1e138]: 孩子选择暂时不会；没有提交可供核对的解题过程，不能据此确定卡住的步骤或深层原因。
                  - paragraph [ref=f1e139]: 学生选择暂时不会，作为当前任务表现记录。
                  - paragraph [ref=f1e140]: 未填写
                  - paragraph [ref=f1e141]: 未提交可核对的解题过程 · 1 秒
                  - group [ref=f1e142]:
                    - generic "展开当时题目与作答" [ref=f1e143] [cursor=pointer]
                  - group [ref=f1e144]:
                    - generic "对这道题有疑问？反馈并查看处理记录" [ref=f1e145] [cursor=pointer]
              - region "综合题中的具体步骤" [ref=f1e146]:
                - heading "把这一步单独看清。" [level=3] [ref=f1e147]
                - paragraph [ref=f1e148]: 综合题的步骤提供线索。这个知识点的掌握情况，由独立题组继续测量。
                - article [ref=f1e149]:
                  - heading "明确平均对象并把零数据计入份数" [level=4] [ref=f1e150]
                  - generic [ref=f1e151]:
                    - strong [ref=f1e152]: 还没有可核对的步骤
                    - paragraph [ref=f1e153]: 本次未形成可以核对的已评分步骤，子点表现仍未知。
                    - paragraph [ref=f1e154]: 先完成可独立评分的新题；暂时不会和跳过不能定位具体步骤。
                    - group [ref=f1e155]:
                      - generic "核对这道综合题与当时回答" [ref=f1e156] [cursor=pointer]
                  - button "预览这个步骤的独立题组 ↗" [ref=f1e157] [cursor=pointer]
                  - paragraph [ref=f1e158]: 题组会列出需要核查的基础内容，确认范围后再开始。
              - region "本点原因与验证" [ref=f1e159]:
                - heading "可能卡在哪里，以及怎样验证" [level=4] [ref=f1e160]
                - article [ref=f1e161]:
                  - generic [ref=f1e162]: 待验证
                  - heading "当前知识点的理解或执行需要核查" [level=5] [ref=f1e163]
                  - paragraph [ref=f1e164]: 在“明确平均对象并把零数据计入份数”的 0 道不同题目中观察到未达标作答。另有 3 次选择暂时不会，尚无过程可以核对。
                  - paragraph [ref=f1e165]: 基础题表现可以定位到当前行为，尚不能单独解释产生问题的原因。
                  - paragraph [ref=f1e166]: 支持方向 0 条 · 反证 0 条。条数不等于独立题族数。
                  - group [ref=f1e167]:
                    - generic "核对条件、其他解释和原始依据" [ref=f1e168] [cursor=pointer]
                  - group [ref=f1e169]:
                    - generic "这条判断怎样变化 · 1 条记录" [ref=f1e170] [cursor=pointer]
                  - button "做一组题验证原因 ↗" [ref=f1e171] [cursor=pointer]
              - region "本点指导与复测" [ref=f1e172]:
                - heading "指导之后，怎样再验证" [level=4] [ref=f1e173]
                - paragraph [ref=f1e174]: 这份报告尚无对应的指导计划。家长可在报告下方制定计划，再确认指导活动与复测安排。
                - button "刷新指导记录" [ref=f1e175] [cursor=pointer]
        - generic [ref=f1e176]:
          - generic [ref=f1e177]:
            - heading "让评测变成下一步行动。" [level=3] [ref=f1e178]
            - paragraph [ref=f1e179]: 计划包含指导活动、成功标准与间隔复测。
          - button "制定指导计划 ↗" [ref=f1e180] [cursor=pointer]
        - paragraph [ref=f1e181]: 掌握度为规则估计，区间表示现有证据的不确定性；尚未建立标准化常模。一次表现不能确定深层原因。
    - button "打开学习观察助教" [ref=f1e183] [cursor=pointer]: "?"
  - alert [ref=f1e184]
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
  8  | async function fixture(page: Page, disposition: 'dont_know' | 'skip' = 'dont_know') {
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
  26 |   for (const item of session.items) await call('/diagnostics/sessions/' + session.id + '/responses', { itemId: item.id, disposition, elapsedMs: 1000 });
  27 |   const report = await call('/diagnostics/sessions/' + session.id + '/complete', {});
  28 |   await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  29 |   await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  30 |   const href = '/student/assessment?' + new URLSearchParams({ studentId, subject: 'math', session: session.id });
  31 |   await page.goto(href); await expect(page.getByRole('heading', { name: '从知识点看清下一步。' })).toBeVisible();
  32 |   return { call, report, session, studentId, atomIds, href };
  33 | }
  34 | 
  35 | test('knowledge report: the actual frozen goals, original estimates and self-reports stay together when selecting a point', async ({ page }) => {
  36 |   await page.setViewportSize({ width: 1440, height: 1000 }); const f = await fixture(page);
  37 |   const directory = browserEvidence('knowledge-report');
  38 |   writeFileSync(join(directory, 'actual-report-original.json'), JSON.stringify(f.report, null, 2) + '\n');
  39 |   await page.screenshot({ path: join(directory, 'report-current.png'), fullPage: true });
  40 |   const workspace = page.getByRole('region', { name: '知识点工作区' }); await expect(workspace).toBeVisible();
  41 |   for (const atomId of f.atomIds) {
  42 |     const estimate = f.report.estimates.find((row: any) => row.atomId === atomId), definition = f.report.definitionContext.atoms.find((row: any) => row.id === atomId);
  43 |     await workspace.getByRole('button', { name: '查看知识点：' + estimate.atomName, exact: true }).click();
> 44 |     await expect(workspace.getByRole('heading', { name: estimate.atomName, exact: true })).toBeVisible();
     |                                                                                            ^ Error: expect(locator).toBeVisible() failed
  45 |     await expect(workspace).toContainText(definition.objective); await expect(workspace).toContainText(definition.successCriterion);
  46 |     await expect(workspace.getByRole('region', { name: '本点量化与未知项' }).getByText(estimate.mastery + '%', { exact: true })).toBeVisible();
  47 |     await expect(workspace.getByRole('region', { name: '本点量化与未知项' })).toContainText('仍需真实间隔复测');
  48 |     await expect(workspace.getByRole('region', { name: '本点表面表现' })).toContainText('选择暂时不会');
  49 |     expect(new URL(page.url()).searchParams.get('reportAtom')).toBe(atomId);
  50 |   }
  51 |   const countBefore = (await f.call('/diagnostics/sessions?' + new URLSearchParams({ studentId: f.studentId, subject: 'math' }))).length;
  52 |   await workspace.getByRole('button', { name: '做一组题验证原因 ↗', exact: true }).click();
  53 |   await expect(page.getByRole('region', { name: '本次评测范围与题组' })).toBeVisible();
  54 |   expect((await f.call('/diagnostics/sessions?' + new URLSearchParams({ studentId: f.studentId, subject: 'math' }))).length).toBe(countBefore);
  55 | });
  56 | 
  57 | test('knowledge report: skipped evidence stays unknown and a point survives reload, back and forward', async ({ page }) => {
  58 |   const f = await fixture(page, 'skip'), workspace = page.getByRole('region', { name: '知识点工作区' });
  59 |   const first = f.report.estimates.find((row: any) => row.atomId === f.atomIds[0]), second = f.report.estimates.find((row: any) => row.atomId === f.atomIds[1]);
  60 |   await workspace.getByRole('button', { name: '查看知识点：' + first.atomName, exact: true }).click();
  61 |   await expect(workspace.getByRole('region', { name: '本点量化与未知项' })).toContainText('尚未形成有效估计');
  62 |   await expect(workspace.getByRole('region', { name: '本点量化与未知项' }).getByText('0%', { exact: true })).toHaveCount(0);
  63 |   await workspace.getByRole('button', { name: '查看知识点：' + second.atomName, exact: true }).click();
  64 |   await page.goBack(); await expect(workspace.getByRole('heading', { name: first.atomName, exact: true })).toBeVisible();
  65 |   await page.goForward(); await expect(workspace.getByRole('heading', { name: second.atomName, exact: true })).toBeVisible();
  66 |   await page.reload(); await expect(workspace.getByRole('heading', { name: second.atomName, exact: true })).toBeVisible();
  67 |   expect(new URL(page.url()).searchParams.get('reportAtom')).toBe(f.atomIds[1]);
  68 |   await workspace.getByRole('searchbox', { name: '查找知识点' }).fill('不存在的合成目标');
  69 |   await expect(workspace).toContainText('没有匹配的知识点'); await expect(workspace.getByRole('heading', { name: second.atomName, exact: true })).toBeVisible();
  70 |   await workspace.getByRole('button', { name: '清空搜索', exact: true }).click();
  71 |   await page.screenshot({ path: join(browserEvidence('knowledge-report'), 'report-first-workspace.png'), fullPage: true });
  72 | });
  73 | 
```
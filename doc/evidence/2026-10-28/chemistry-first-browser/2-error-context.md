# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: chemistry.spec.ts >> chemistry: enrollment, all seven readable units and actual native classroom work on three viewports
- Location: tests\e2e\chemistry.spec.ts:24:5

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator: getByLabel('化学学习档案', { exact: true })
Expected: "student_ca89e661-28e7-4ab0-91e9-76c1be8e7c3a"
Error: strict mode violation: getByLabel('化学学习档案', { exact: true }) resolved to 2 elements:
    1) <section aria-label="化学学习档案" class="chem-enrollment">…</section> aka getByRole('region', { name: '化学学习档案' })
    2) <select aria-label="化学学习档案">…</select> aka getByRole('region', { name: '化学学习档案' }).getByLabel('化学学习档案')

Call log:
  - Expect "toHaveValue" getByLabel('化学学习档案', { exact: true }) with timeout 15000ms
  - waiting for getByLabel('化学学习档案', { exact: true })

```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - main [ref=f1e2]:
    - generic [ref=f1e3]:
      - link "学习观察室" [ref=f1e4] [cursor=pointer]:
        - /url: /
        - generic [aria-hidden] [ref=f1e5]: 学
        - text: 学习观察室
      - navigation "主要导航" [ref=f1e6]:
        - link "学习首页" [ref=f1e7] [cursor=pointer]:
          - /url: /learn?subject=chemistry&student=student_ca89e661-28e7-4ab0-91e9-76c1be8e7c3a
        - link "学习工作台" [ref=f1e8] [cursor=pointer]:
          - /url: /studio?subject=chemistry&student=student_ca89e661-28e7-4ab0-91e9-76c1be8e7c3a
        - link "家长空间" [ref=f1e9] [cursor=pointer]:
          - /url: /parent/dashboard?subject=chemistry&studentId=student_ca89e661-28e7-4ab0-91e9-76c1be8e7c3a
        - link "知识诊断" [ref=f1e10] [cursor=pointer]:
          - /url: /student/assessment?subject=chemistry&studentId=student_ca89e661-28e7-4ab0-91e9-76c1be8e7c3a
        - link "今日学习" [ref=f1e11] [cursor=pointer]:
          - /url: /student/today?subject=chemistry&studentId=student_ca89e661-28e7-4ab0-91e9-76c1be8e7c3a
        - link "题卷资料" [ref=f1e12] [cursor=pointer]:
          - /url: /library?subject=chemistry&studentId=student_ca89e661-28e7-4ab0-91e9-76c1be8e7c3a
        - link "化学课程" [ref=f1e13] [cursor=pointer]:
          - /url: /chemistry?subject=chemistry&studentId=student_ca89e661-28e7-4ab0-91e9-76c1be8e7c3a
      - generic [ref=f1e14]:
        - link "资料管理" [ref=f1e15] [cursor=pointer]:
          - /url: /parent/data
        - button "退出" [ref=f1e16] [cursor=pointer]
    - generic [ref=f1e17]:
      - generic [ref=f1e18]:
        - generic [ref=f1e19]:
          - text: 广州 · 人教版 · 九年级上学期
          - heading [level=1] [ref=f1e20]:
            - text: 学化学，
            - emphasis [ref=f1e21]: 每一步都有依据。
          - paragraph [ref=f1e22]: 先诊断，再学练；用独立新题检查，用真实间隔验证保持。
        - generic [aria-hidden] [ref=f1e23]: 观察 → 解释 → 验证
      - region "化学学习档案" [ref=f1e24]:
        - generic [ref=f1e26]:
          - text: 九年级学习档案
          - combobox "化学学习档案" [ref=f1e27]:
            - option "选择九年级档案"
            - option "九上化学验收 · 九年级" [selected]
        - generic [ref=f1e28]:
          - button "确认本学期范围并建立课程" [ref=f1e29] [cursor=pointer]
          - generic [ref=f1e30]: 建立课程不表示已学会，考核结果会单独记录。
      - region "教学验证链" [ref=f1e31]:
        - generic [ref=f1e32]:
          - generic [ref=f1e33]: "01"
          - strong [ref=f1e34]: 课前诊断
        - generic [ref=f1e35]:
          - generic [ref=f1e36]: "02"
          - strong [ref=f1e37]: 讲解与例题
        - generic [ref=f1e38]:
          - generic [ref=f1e39]: "03"
          - strong [ref=f1e40]: 练习与对照
        - generic [ref=f1e41]:
          - generic [ref=f1e42]: "04"
          - strong [ref=f1e43]: 独立考核
        - generic [ref=f1e44]:
          - generic [ref=f1e45]: "05"
          - strong [ref=f1e46]: 错因核查与补练
        - generic [ref=f1e47]:
          - generic [ref=f1e48]: "06"
          - strong [ref=f1e49]: 1／3／7／14天复测
      - generic [ref=f1e50]:
        - complementary [ref=f1e51]:
          - paragraph [ref=f1e52]: 7 个单元 · 28 个目标
          - navigation "化学单元" [ref=f1e53]:
            - button "01 走进化学世界" [ref=f1e54] [cursor=pointer]:
              - generic [ref=f1e55]: "01"
              - text: 走进化学世界
            - button "02 空气与氧气" [ref=f1e56] [cursor=pointer]:
              - generic [ref=f1e57]: "02"
              - text: 空气与氧气
            - button "03 物质构成的奥秘" [ref=f1e58] [cursor=pointer]:
              - generic [ref=f1e59]: "03"
              - text: 物质构成的奥秘
            - button "04 自然界的水与物质组成" [ref=f1e60] [cursor=pointer]:
              - generic [ref=f1e61]: "04"
              - text: 自然界的水与物质组成
            - button "05 化学方程式与定量关系" [ref=f1e62] [cursor=pointer]:
              - generic [ref=f1e63]: "05"
              - text: 化学方程式与定量关系
            - button "06 碳和碳的氧化物" [ref=f1e64] [cursor=pointer]:
              - generic [ref=f1e65]: "06"
              - text: 碳和碳的氧化物
            - button "07 燃料、能源与环境" [ref=f1e66] [cursor=pointer]:
              - generic [ref=f1e67]: "07"
              - text: 燃料、能源与环境
        - region "当前化学单元" [ref=f1e68]:
          - generic [ref=f1e69]:
            - text: 从具体证据开始
            - heading "走进化学世界" [level=2] [ref=f1e70]
          - article [ref=f1e71]:
            - generic [ref=f1e72]:
              - text: 尚未开始
              - heading "第1单元 · 课前诊断" [level=3] [ref=f1e73]
              - paragraph [ref=f1e74]: 4 个目标 · 最多 8 题 · 预算 20 分钟
            - button "开始课前诊断" [disabled] [ref=f1e75]
            - paragraph [ref=f1e76]: 先建立本学期课程
          - generic [ref=f1e77]:
            - article [ref=f1e78]:
              - generic [ref=f1e79]: "1"
              - generic [ref=f1e80]:
                - heading "物理变化与化学变化" [level=3] [ref=f1e81]
                - paragraph [ref=f1e82]: 以是否生成新物质判断变化类型
                - generic [ref=f1e83]: 建立课程后可进入课堂与练习
                - group [ref=f1e85]:
                  - generic "先看本课讲义" [ref=f1e86] [cursor=pointer]
            - article [ref=f1e87]:
              - generic [ref=f1e88]: "2"
              - generic [ref=f1e89]:
                - heading "物质性质与用途" [level=3] [ref=f1e90]
                - paragraph [ref=f1e91]: 区分物理性质和化学性质，并用性质解释用途
                - generic [ref=f1e92]: 建立课程后可进入课堂与练习
                - group [ref=f1e94]:
                  - generic "先看本课讲义" [ref=f1e95] [cursor=pointer]
            - article [ref=f1e96]:
              - generic [ref=f1e97]: "3"
              - generic [ref=f1e98]:
                - heading "基本实验操作与安全" [level=3] [ref=f1e99]
                - paragraph [ref=f1e100]: 根据操作目的判断实验记录中的合理与不当操作
                - generic [ref=f1e101]: 建立课程后可进入课堂与练习
                - group [ref=f1e103]:
                  - generic "先看本课讲义" [ref=f1e104] [cursor=pointer]
            - article [ref=f1e105]:
              - generic [ref=f1e106]: "4"
              - generic [ref=f1e107]:
                - heading "对照实验与变量控制" [level=3] [ref=f1e108]
                - paragraph [ref=f1e109]: 从实验目的确定唯一改变的因素
                - generic [ref=f1e110]: 建立课程后可进入课堂与练习
                - group [ref=f1e112]:
                  - generic "先看本课讲义" [ref=f1e113] [cursor=pointer]
          - article [ref=f1e114]:
            - generic [ref=f1e115]:
              - text: 尚未开始
              - heading "第1单元 · 独立考核" [level=3] [ref=f1e116]
              - paragraph [ref=f1e117]: 4 个目标 · 最多 8 题 · 预算 25 分钟
            - button "开始独立考核" [disabled] [ref=f1e118]
            - paragraph [ref=f1e119]: 先建立本学期课程
          - generic [ref=f1e120]:
            - heading "考核之后，继续验证" [level=3] [ref=f1e121]
            - paragraph [ref=f1e122]: 在报告中核查错因、建立指导计划并由家长确认。完成补练后，从今日学习进入到期复测；看过答案的题目会保留曝光记录。
            - link "查看补练和到期复测 ↗" [ref=f1e123] [cursor=pointer]:
              - /url: /student/today?studentId=student_ca89e661-28e7-4ab0-91e9-76c1be8e7c3a&subject=chemistry
      - generic [ref=f1e124]:
        - generic [ref=f1e125]:
          - text: 跨单元运用
          - heading "期中与期末考核" [level=2] [ref=f1e126]
          - paragraph [ref=f1e127]: 分场覆盖相应单元，控制单次题量；完成各单元考核后开放。
        - generic [ref=f1e128]:
          - article [ref=f1e129]:
            - generic [ref=f1e130]:
              - text: 尚未开始
              - heading "期中考核一 · 第一、二单元" [level=3] [ref=f1e131]
              - paragraph [ref=f1e132]: 8 个目标 · 最多 16 题 · 预算 35 分钟
            - button "开始独立考核" [disabled] [ref=f1e133]
            - paragraph [ref=f1e134]: 先建立本学期课程
          - article [ref=f1e135]:
            - generic [ref=f1e136]:
              - text: 尚未开始
              - heading "期中考核二 · 第三、四单元" [level=3] [ref=f1e137]
              - paragraph [ref=f1e138]: 8 个目标 · 最多 16 题 · 预算 35 分钟
            - button "开始独立考核" [disabled] [ref=f1e139]
            - paragraph [ref=f1e140]: 先建立本学期课程
          - article [ref=f1e141]:
            - generic [ref=f1e142]:
              - text: 尚未开始
              - heading "期末考核一 · 第一、二单元" [level=3] [ref=f1e143]
              - paragraph [ref=f1e144]: 8 个目标 · 最多 16 题 · 预算 40 分钟
            - button "开始独立考核" [disabled] [ref=f1e145]
            - paragraph [ref=f1e146]: 先建立本学期课程
          - article [ref=f1e147]:
            - generic [ref=f1e148]:
              - text: 尚未开始
              - heading "期末考核二 · 第三、四单元" [level=3] [ref=f1e149]
              - paragraph [ref=f1e150]: 8 个目标 · 最多 16 题 · 预算 40 分钟
            - button "开始独立考核" [disabled] [ref=f1e151]
            - paragraph [ref=f1e152]: 先建立本学期课程
          - article [ref=f1e153]:
            - generic [ref=f1e154]:
              - text: 尚未开始
              - heading "期末考核三 · 第五至七单元" [level=3] [ref=f1e155]
              - paragraph [ref=f1e156]: 12 个目标 · 最多 24 题 · 预算 50 分钟
            - button "开始独立考核" [disabled] [ref=f1e157]
            - paragraph [ref=f1e158]: 先建立本学期课程
      - generic [ref=f1e159]:
        - heading "教材与广州原卷" [level=2] [ref=f1e160]
        - paragraph [ref=f1e161]: 原卷适合综合练习和人工核对，题型与答案经审核后才能进入正式评分。
        - list [ref=f1e162]:
          - listitem [ref=f1e163]:
            - link "人教社九年级化学官方教材入口 ↗" [ref=f1e164] [cursor=pointer]:
              - /url: https://jc.pep.com.cn/?filed=%E5%88%9D%E4%B8%AD&subject=%E5%8C%96%E5%AD%A6
            - generic [ref=f1e165]: 参考资料
          - listitem [ref=f1e166]:
            - link "广东省广州中学2025-2026学年九年级上学期期中考试化学试卷 ↗" [ref=f1e167] [cursor=pointer]:
              - /url: /library?paper=3%3AR-fe81e950f5d12a9f2996a1a3ebb4940a&subject=chemistry&studentId=student_ca89e661-28e7-4ab0-91e9-76c1be8e7c3a
            - generic [ref=f1e168]: 参考资料
          - listitem [ref=f1e169]:
            - link "广东省广州市从化区2025-2026学年九年级上学期期末考试化学试卷（B） ↗" [ref=f1e170] [cursor=pointer]:
              - /url: /library?paper=3%3AR-1d32e790aaa9ea9ed66339887ef3cef4&subject=chemistry&studentId=student_ca89e661-28e7-4ab0-91e9-76c1be8e7c3a
            - generic [ref=f1e171]: 参考资料
          - listitem [ref=f1e172]:
            - link "广东省广州市广东实验中学2025-2026学年九年级上学期期中考试化学试卷 ↗" [ref=f1e173] [cursor=pointer]:
              - /url: /library?paper=3%3AR-176269d79593f53cc879e0be28d6b918&subject=chemistry&studentId=student_ca89e661-28e7-4ab0-91e9-76c1be8e7c3a
            - generic [ref=f1e174]: 参考资料
          - listitem [ref=f1e175]:
            - link "广东省广州市海珠区2025-2026学年九年级上学期期末质量监测化学试题 ↗" [ref=f1e176] [cursor=pointer]:
              - /url: /library?paper=3%3AR-8dae1e8f1a7d716a44ceb2791d91d1e4&subject=chemistry&studentId=student_ca89e661-28e7-4ab0-91e9-76c1be8e7c3a
            - generic [ref=f1e177]: 参考资料
          - listitem [ref=f1e178]:
            - link "广东省广州市白云区2025-2026学年九年级上学期期末考试化学试卷 ↗" [ref=f1e179] [cursor=pointer]:
              - /url: /library?paper=3%3AR-40cbb5af8c5748d9c2b24c58cc081efd&subject=chemistry&studentId=student_ca89e661-28e7-4ab0-91e9-76c1be8e7c3a
            - generic [ref=f1e180]: 参考资料
          - listitem [ref=f1e181]:
            - link "广东省广州市第二中学2025-2026学年九年级上学期期中考试化学试卷 ↗" [ref=f1e182] [cursor=pointer]:
              - /url: /library?paper=3%3AR-753c0f9ed3232ffdad0ebfd21ad40a57&subject=chemistry&studentId=student_ca89e661-28e7-4ab0-91e9-76c1be8e7c3a
            - generic [ref=f1e183]: 参考资料
          - listitem [ref=f1e184]:
            - link "广东省广州市第四中学2025-2026学年九年级上学期期中考化学试题 ↗" [ref=f1e185] [cursor=pointer]:
              - /url: /library?paper=3%3AR-fbfc19bcead8fe55f574cbe8bbc4af6b&subject=chemistry&studentId=student_ca89e661-28e7-4ab0-91e9-76c1be8e7c3a
            - generic [ref=f1e186]: 参考资料
          - listitem [ref=f1e187]:
            - link "广东省广州市花都区2025-2026学年九年级上学期期末考试化学试题 ↗" [ref=f1e188] [cursor=pointer]:
              - /url: /library?paper=3%3AR-bed39aed06147794989490551aed5356&subject=chemistry&studentId=student_ca89e661-28e7-4ab0-91e9-76c1be8e7c3a
            - generic [ref=f1e189]: 参考资料
          - listitem [ref=f1e190]:
            - link "广东省广州市荔湾区广东广雅中学2025-2026学年九年级上学期期中考试化学试题 ↗" [ref=f1e191] [cursor=pointer]:
              - /url: /library?paper=3%3AR-7a7575520a8951f2dd34c5bd7b10e526&subject=chemistry&studentId=student_ca89e661-28e7-4ab0-91e9-76c1be8e7c3a
            - generic [ref=f1e192]: 参考资料
        - group [ref=f1e193]:
          - generic "课程范围与使用说明" [ref=f1e194] [cursor=pointer]
  - alert [ref=f1e195]
```

# Test source

```ts
  1  | import { expect, test, type Page } from '@playwright/test';
  2  | import { mkdirSync } from 'node:fs';
  3  | 
  4  | const api = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}/api`;
  5  | async function fixture(page: Page) {
  6  |   const key = `${Date.now()}-${Math.floor(Math.random() * 100000)}`, principal = `chemistry-${key}@local.test`, credential = `Chemistry-${key}`;
  7  |   const registration = await fetch(api + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principal, credential }) });
  8  |   expect(registration.status).toBe(201); const account = (await registration.json()).data;
  9  |   const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + account.token };
  10 |   const child = await fetch(api + '/students', { method: 'POST', headers, body: JSON.stringify({ nickname: '九上化学验收', grade: 9, preferredSessionMinutes: 25,
  11 |     defaultVersionMap: { math: '', chinese: '', english: '', chemistry: 'guangzhou-pep-chemistry-9-upper-v1' } }) });
  12 |   expect(child.status).toBe(201); const studentId = (await child.json()).data.profile.id;
  13 |   await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  14 |   await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
> 15 |   await page.goto('/chemistry?studentId=' + studentId); await expect(page.getByLabel('化学学习档案', { exact: true })).toHaveValue(studentId);
     |                                                                                                                  ^ Error: expect(locator).toHaveValue(expected) failed
  16 |   const call = async (path: string) => { const response = await fetch(api + path, { headers }); expect(response.status).toBe(200); return (await response.json()).data; };
  17 |   return { studentId, call };
  18 | }
  19 | async function screenshot(page: Page, label: string) {
  20 |   const directory = 'data/qa/browser-evidence/chemistry-' + (process.env.E2E_EVIDENCE_RUN ?? 'local'); mkdirSync(directory, { recursive: true });
  21 |   await page.screenshot({ path: directory + '/' + label + '.png', fullPage: true });
  22 | }
  23 | 
  24 | test('chemistry: enrollment, all seven readable units and actual native classroom work on three viewports', async ({ page }) => {
  25 |   const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  26 |   const { studentId, call } = await fixture(page);
  27 |   await expect(page.getByRole('navigation', { name: '化学单元' }).getByRole('button')).toHaveCount(7);
  28 |   await expect(page.getByRole('button', { name: '开始课前诊断', exact: true })).toBeDisabled();
  29 |   await page.getByText('先看本课讲义', { exact: true }).first().click(); await expect(page.getByText('比较蜡烛熔化与蜡烛燃烧。', { exact: true })).toBeVisible();
  30 |   await page.getByRole('button', { name: '确认本学期范围并建立课程', exact: true }).click();
  31 |   await expect(page.getByText('本学期课程已建立', { exact: true })).toBeVisible();
  32 |   await expect(page.getByRole('button', { name: '开始课前诊断', exact: true })).toBeEnabled();
  33 |   await expect(page.getByRole('button', { name: '开始独立考核', exact: true }).first()).toBeDisabled();
  34 |   for (const width of [1440, 768, 390]) {
  35 |     await page.setViewportSize({ width, height: 960 });
  36 |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  37 |     await screenshot(page, 'course-' + width);
  38 |   }
  39 |   await page.setViewportSize({ width: 1440, height: 960 });
  40 |   await page.getByRole('navigation', { name: '化学单元' }).getByRole('button').last().click();
  41 |   await expect(page.getByRole('heading', { name: '燃料、能源与环境', exact: true })).toBeVisible();
  42 |   await expect(page.getByRole('heading', { name: '氢能源的反应与定量验证', exact: true })).toBeVisible();
  43 |   await page.getByRole('navigation', { name: '化学单元' }).getByRole('button').first().click();
  44 |   const before = await call('/chemistry/catalog?studentId=' + studentId);
  45 |   await page.reload(); const after = await call('/chemistry/catalog?studentId=' + studentId); expect(after.courseId).toBe(before.courseId);
  46 |   await page.getByRole('link', { name: '进入讲解课堂 ↗', exact: true }).first().click(); await expect(page).toHaveURL(/lesson=learn/);
  47 |   await expect(page.getByRole('heading', { name: '物理变化与化学变化', exact: true }).first()).toBeVisible();
  48 |   await expect(page.getByText('本节课导航', { exact: true }).first()).toBeVisible();
  49 |   expect(errors).toEqual([]);
  50 | });
  51 | 
  52 | test('chemistry: a completed baseline unlocks an independent check and keeps original answers after reopening', async ({ page }) => {
  53 |   const { studentId, call } = await fixture(page);
  54 |   await page.getByRole('button', { name: '确认本学期范围并建立课程', exact: true }).click();
  55 |   await expect(page.getByText('本学期课程已建立', { exact: true })).toBeVisible();
  56 |   await page.getByRole('button', { name: '开始课前诊断', exact: true }).click();
  57 |   await expect(page).toHaveURL(/\/student\/assessment\?.*session=/);
  58 |   const baselineId = new URL(page.url()).searchParams.get('session')!;
  59 |   const baseline = await call('/diagnostics/sessions/' + baselineId); expect(baseline.items.length).toBe(8);
  60 |   for (let index = 0; index < baseline.items.length; index++) {
  61 |     await page.getByRole('radio').first().check();
  62 |     await page.getByRole('button', { name: '提交，下一步 →', exact: true }).click();
  63 |     await expect.poll(async () => (await call('/diagnostics/sessions/' + baselineId)).answeredCount).toBe(index + 1);
  64 |   }
  65 |   await expect(page.getByRole('heading', { name: '从知识点看清下一步。', exact: true })).toBeVisible();
  66 |   const original = await call('/diagnostics/sessions/' + baselineId + '/report'); expect(original.answeredCount).toBe(8);
  67 |   await page.goto('/chemistry?studentId=' + studentId);
  68 |   await expect(page.getByRole('button', { name: '开始独立考核', exact: true }).first()).toBeEnabled();
  69 |   await page.getByRole('button', { name: '开始独立考核', exact: true }).first().click();
  70 |   await expect(page).toHaveURL(/\/student\/assessment\?.*session=/);
  71 |   const independentId = new URL(page.url()).searchParams.get('session')!;
  72 |   const independent = await call('/diagnostics/sessions/' + independentId), exposed = new Set(baseline.items.map((item: any) => item.questionId));
  73 |   expect(independent.items.every((item: any) => !exposed.has(item.questionId))).toBe(true);
  74 |   await page.goto('/chemistry?studentId=' + studentId); await page.reload();
  75 |   const check = (await call('/chemistry/catalog?studentId=' + studentId)).checkpoints.find((check: any) => check.id === 'u1:unit');
  76 |   expect(check).toMatchObject({ status: 'in_progress', lastSessionId: independentId });
  77 |   expect((await call('/diagnostics/sessions/' + baselineId + '/report')).evidence).toEqual(original.evidence);
  78 | });
  79 | 
```
# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: chemistry.spec.ts >> chemistry: family-created ninth-grade profile reaches the standard library and old links keep their unit
- Location: tests\e2e\chemistry.spec.ts:120:5

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('.ws-navigation').getByRole('link', { name: 'Courses', exact: true })

```

# Page snapshot

```yaml
- generic [active] [ref=f2e1]:
  - alert [ref=f2e2]: 学习工作台 · StudyAgent
  - main [ref=f2e3]:
    - complementary "学习工作台导航" [ref=f2e4]:
      - generic [ref=f2e5]:
        - generic [ref=f2e6]:
          - link "StudyAgent 学习工作台" [ref=f2e7] [cursor=pointer]:
            - /url: /studio
            - generic [ref=f2e10]: StudyAgent
          - button "收起学习导航" [expanded] [ref=f2e11] [cursor=pointer]
        - generic [ref=f2e14]:
          - navigation "工作台主要入口" [ref=f2e15]:
            - button "Home" [ref=f2e16] [cursor=pointer]:
              - generic [ref=f2e19]: 首页
            - button "Courses" [ref=f2e20] [cursor=pointer]:
              - generic [ref=f2e23]: 课程
            - button "Calendar" [ref=f2e24] [cursor=pointer]:
              - generic [ref=f2e27]: 学习动态
            - button "History" [ref=f2e28] [cursor=pointer]:
              - generic [ref=f2e31]: 历史
            - button "Materials" [ref=f2e32] [cursor=pointer]:
              - generic [ref=f2e35]: 资料
            - link "AI Whiteboards" [ref=f2e36] [cursor=pointer]:
              - /url: /studio/whiteboards
              - generic [ref=f2e39]: AI白板
          - button "＋ 创建课程" [ref=f2e40] [cursor=pointer]
          - generic [ref=f2e41]:
            - region "开始学习" [ref=f2e42]:
              - heading "开始学习" [level=3] [ref=f2e44]
              - link "打开课程 从一节适合自己的课开始。" [ref=f2e45] [cursor=pointer]:
                - /url: /studio?view=courses
                - generic [ref=f2e46]: 打开课程
                - generic [ref=f2e47]: 从一节适合自己的课开始。
            - generic [ref=f2e48]:
              - heading "近期活动" [level=3] [ref=f2e50]
              - paragraph [ref=f2e52]: 开始学习后，活动会出现在这里。
        - link "返回学习首页" [ref=f2e54] [cursor=pointer]:
          - /url: /learn?subject=chemistry&student=student_daa69edc-10db-4a27-8a64-047fe23857e5
          - text: 返回学习首页 →
    - generic [ref=f2e55]:
      - generic [ref=f2e56]:
        - generic [ref=f2e57]:
          - combobox "学习档案" [ref=f2e58]:
            - option "九上化学验收"
            - option "新建九上化学档案" [selected]
          - combobox "学科" [ref=f2e59]:
            - option "数学"
            - option "语文"
            - option "英语"
            - option "化学" [selected]
        - generic [ref=f2e60]:
          - link "教学课堂 ↗" [ref=f2e61] [cursor=pointer]:
            - /url: /studio/classroom
          - link "学习观察室" [ref=f2e62] [cursor=pointer]:
            - /url: /
      - generic [ref=f2e63]:
        - generic [ref=f2e64]:
          - button "Craft Courses" [ref=f2e65] [cursor=pointer]
          - button "Instant Assistance" [ref=f2e66] [cursor=pointer]
        - generic [ref=f2e67]:
          - heading "把下一步，做成一条走得通的路。" [level=1] [ref=f2e68]
          - paragraph [ref=f2e69]: 从已确认学习范围生成课程蓝图，审阅结构和来源后再开始。
        - generic [ref=f2e70]:
          - textbox "围绕哪段学习内容设计课程？" [ref=f2e71]
          - generic [ref=f2e72]:
            - generic [ref=f2e73]: ＋
            - generic [ref=f2e74]: 资料
            - button "Concept Explanation" [ref=f2e75] [cursor=pointer]
            - generic [ref=f2e76]: 语音
            - generic [ref=f2e78]:
              - generic [ref=f2e79]:
                - generic [ref=f2e80]: 模型
                - combobox "选择大模型" [ref=f2e81] [cursor=pointer]:
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
              - generic [ref=f2e82]: 尚未进行文字检查
            - button "↑" [ref=f2e84] [cursor=pointer]
        - generic [ref=f2e85]:
          - button "可视化 用图形解释异分母加法 通分、合并与验算" [ref=f2e86] [cursor=pointer]:
            - generic [ref=f2e87]: 可视化
            - generic [ref=f2e88]: 用图形解释异分母加法
            - generic [ref=f2e89]: 通分、合并与验算
          - button "个性化练习 从我的已知点生成练习 只覆盖已确认范围" [ref=f2e90] [cursor=pointer]:
            - generic [ref=f2e91]: 个性化练习
            - generic [ref=f2e92]: 从我的已知点生成练习
            - generic [ref=f2e93]: 只覆盖已确认范围
          - button "主动学习 看看今天最值得做什么 按教育优先级排序" [ref=f2e94] [cursor=pointer]:
            - generic [ref=f2e95]: 主动学习
            - generic [ref=f2e96]: 看看今天最值得做什么
            - generic [ref=f2e97]: 按教育优先级排序
        - generic [ref=f2e98]:
          - heading "你的学习路径" [level=2] [ref=f2e99]
          - button "创建课程" [ref=f2e100] [cursor=pointer]
        - button "9年级 广州人教版九上化学 · 学习与验证 从概念证据出发，完成课前诊断、讲解、练习、独立考核与真实间隔复测。 7 单元 · 28 目标" [ref=f2e102] [cursor=pointer]:
          - generic [ref=f2e103]: 9年级
          - heading "广州人教版九上化学 · 学习与验证" [level=3] [ref=f2e104]
          - paragraph [ref=f2e105]: 从概念证据出发，完成课前诊断、讲解、练习、独立考核与真实间隔复测。
          - generic [ref=f2e106]: 7 单元 · 28 目标
        - complementary [ref=f2e107]:
          - article [ref=f2e108]:
            - generic [ref=f2e109]:
              - generic [ref=f2e110]:
                - text: LEARNER SNAPSHOT
                - heading "新建九上化学档案" [level=2] [ref=f2e111]
              - generic [ref=f2e112]: 9 年级
            - generic [ref=f2e113]:
              - strong [ref=f2e114]: "0"
              - generic [ref=f2e115]: / 0
              - generic [ref=f2e116]: 已有点有稳定证据
            - generic [ref=f2e117]:
              - generic [ref=f2e118]:
                - generic [ref=f2e119]: "0"
                - text: 已确认知识点
              - generic [ref=f2e120]:
                - generic [ref=f2e121]: "0"
                - text: 日历安排
          - article [ref=f2e122]:
            - generic [ref=f2e123]:
              - generic [ref=f2e124]: NEXT BEST ACTION
              - button "全部 →" [ref=f2e125] [cursor=pointer]
            - link "先确认当前学习进度 没有可核对的年级、教材和已学范围时，系统不会把未学内容当作薄弱项。" [ref=f2e126] [cursor=pointer]:
              - /url: /student/assessment?studentId=student_daa69edc-10db-4a27-8a64-047fe23857e5&subject=chemistry
              - generic [ref=f2e127]: 先确认当前学习进度
              - paragraph [ref=f2e128]: 没有可核对的年级、教材和已学范围时，系统不会把未学内容当作薄弱项。
          - article [ref=f2e129]:
            - generic [ref=f2e130]:
              - generic [ref=f2e131]: RECENT WHITEBOARDS
              - button "新建" [ref=f2e132] [cursor=pointer]
            - paragraph [ref=f2e133]: 还没有白板。输入一个主题并选择 Whiteboard session。
          - article [ref=f2e134]:
            - generic [ref=f2e135]:
              - generic [ref=f2e136]: SYNC STATUS
              - button "日历 →" [ref=f2e137] [cursor=pointer]
            - paragraph [ref=f2e138]: 0 个 LMS / 日历来源 · 0 个安排
            - generic [ref=f2e139]: 同步只读取课程日期；学习掌握仍由独立测量形成。
```

# Test source

```ts
  30  |   await expect(page.getByRole('button', { name: '添加课程并开始学习', exact: true })).toHaveCount(0);
  31  |   await expect(page.getByRole('button', { name: '开始课前诊断', exact: true })).toBeEnabled();
  32  | }
  33  | async function screenshot(page: Page, label: string) {
  34  |   const directory = 'data/qa/browser-evidence/chemistry-' + (process.env.E2E_EVIDENCE_RUN ?? 'local'); mkdirSync(directory, { recursive: true });
  35  |   await page.screenshot({ path: directory + '/' + label + '.png', fullPage: true });
  36  | }
  37  | 
  38  | test('chemistry: normal course cards, seven-unit outline and native classroom preserve the library on three viewports', async ({ page }) => {
  39  |   const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  40  |   const { studentId, library, call } = await fixture(page);
  41  |   await expect(page.getByRole('link', { name: '打开课程：社会学概论', exact: true })).toBeVisible();
  42  |   await expect(page.locator('.ws-course-ticket')).toHaveCount(2);
  43  |   expect((await call('/learning/studio/overview?' + new URLSearchParams({ studentId, subject: 'chemistry' }))).courses).toHaveLength(0);
  44  |   for (const width of [1440, 768, 390]) {
  45  |     await page.setViewportSize({ width, height: 960 });
  46  |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  47  |     await screenshot(page, 'library-' + width);
  48  |   }
  49  |   await page.setViewportSize({ width: 1440, height: 960 });
  50  |   await page.getByLabel('课程类型').selectOption('primary'); await expect(page.locator('.ws-course-ticket')).toHaveCount(1);
  51  |   await page.getByLabel('搜索课程').fill('九上化学'); await open(page);
  52  |   await expect(page.getByRole('navigation', { name: '课程单元' }).getByRole('button')).toHaveCount(7);
  53  |   await expect(page.getByRole('button', { name: '开始课前诊断', exact: true })).toBeDisabled();
  54  |   await expect(page.locator('.cl-learn')).toHaveCount(0);
  55  |   await page.getByRole('button', { name: '添加课程并开始学习', exact: true }).click();
  56  |   await expect(page.getByRole('button', { name: '开始课前诊断', exact: true })).toBeEnabled();
  57  |   await expect(page.getByRole('button', { name: '开始独立考核', exact: true })).toBeDisabled();
  58  |   for (const width of [1440, 768, 390]) {
  59  |     await page.setViewportSize({ width, height: 960 });
  60  |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  61  |     await screenshot(page, 'outline-' + width);
  62  |   }
  63  |   await page.setViewportSize({ width: 1440, height: 960 });
  64  |   await page.getByRole('navigation', { name: '课程单元' }).getByRole('button').last().click();
  65  |   await expect(page.locator('.cl-unit-heading')).toContainText('燃料、能源与环境');
  66  |   await expect(page.locator('.cl-microlessons')).toContainText('氢能源的反应与定量验证');
  67  |   await page.getByRole('tab', { name: '考核', exact: true }).click();
  68  |   await expect(page.getByRole('heading', { name: '期中与期末考核', exact: true })).toBeVisible();
  69  |   await screenshot(page, 'checks-1440');
  70  |   await page.getByRole('tab', { name: '资料', exact: true }).click();
  71  |   await expect(page.getByRole('heading', { name: '教材与广州原卷', exact: true })).toBeVisible();
  72  |   await expect(page.locator('.cl-course-references li')).toHaveCount(10);
  73  |   await page.getByRole('navigation', { name: '课程单元' }).getByRole('button').first().click();
  74  |   await page.getByRole('tab', { name: '单元', exact: true }).click();
  75  |   await page.locator('.cl-learn').first().click(); await expect(page).toHaveURL(/lesson=learn/);
  76  |   await expect(page.getByRole('heading', { name: '物理变化与化学变化', exact: true }).first()).toBeVisible();
  77  |   await expect(page.getByText('本节课导航', { exact: true }).first()).toBeVisible();
  78  |   await page.getByRole('button', { name: '离开课堂', exact: true }).click();
  79  |   await page.getByRole('button', { name: '保存并离开', exact: true }).click();
  80  |   await expect(page.getByRole('heading', { name: courseTitle, exact: true })).toBeVisible();
  81  |   await page.getByRole('button', { name: '× 退出课程', exact: true }).click();
  82  |   await expect(page.getByLabel('课程类型')).toHaveValue('primary'); await expect(page.getByLabel('搜索课程')).toHaveValue('九上化学');
  83  |   await expect(page.locator('.ws-course-ticket')).toHaveCount(1); await page.reload();
  84  |   await expect(page.locator('.ws-course-ticket')).toHaveCount(1);
  85  |   expect((await call('/learning/studio/overview?' + new URLSearchParams({ studentId, subject: 'chemistry' }))).courses).toHaveLength(1);
  86  |   await page.goto(library); await open(page); await page.locator('.cl-practice').first().click();
  87  |   await expect(page.getByRole('button', { name: '化学', exact: true })).toHaveAttribute('aria-pressed', 'true');
  88  |   await expect(page.getByLabel('当前年级')).toHaveValue('9');
  89  |   await expect(page.locator('.studio-points input[type=checkbox]')).toHaveCount(28);
  90  |   expect(errors).toEqual([]);
  91  | });
  92  | 
  93  | test('chemistry: course assessments unlock independent checks and preserve first answers after reopening', async ({ page }) => {
  94  |   const { studentId, library, call } = await fixture(page); await enroll(page);
  95  |   await page.getByRole('button', { name: '开始课前诊断', exact: true }).click();
  96  |   await expect(page).toHaveURL(/\/student\/assessment\?.*session=/);
  97  |   const baselineId = new URL(page.url()).searchParams.get('session')!;
  98  |   const baseline = await call('/diagnostics/sessions/' + baselineId); expect(baseline.items.length).toBe(8);
  99  |   for (let index = 0; index < baseline.items.length; index++) {
  100 |     await page.getByRole('radio').first().check();
  101 |     await page.getByRole('button', { name: '提交，下一步 →', exact: true }).click();
  102 |     await expect.poll(async () => (await call('/diagnostics/sessions/' + baselineId)).answeredCount).toBe(index + 1);
  103 |   }
  104 |   await expect(page.getByRole('heading', { name: '从知识点看清下一步。', exact: true })).toBeVisible();
  105 |   const original = await call('/diagnostics/sessions/' + baselineId + '/report'); expect(original.answeredCount).toBe(8);
  106 |   await page.goto(library); await open(page); await page.getByRole('tab', { name: '考核', exact: true }).click();
  107 |   await expect(page.locator('[data-checkpoint="u1:unit"]').getByRole('button')).toBeEnabled();
  108 |   await page.locator('[data-checkpoint="u1:unit"]').getByRole('button').click();
  109 |   await expect(page).toHaveURL(/\/student\/assessment\?.*session=/);
  110 |   const independentId = new URL(page.url()).searchParams.get('session')!;
  111 |   const independent = await call('/diagnostics/sessions/' + independentId), exposed = new Set(baseline.items.map((item: any) => item.questionId));
  112 |   expect(independent.items.every((item: any) => !exposed.has(item.questionId))).toBe(true);
  113 |   await page.goto(library); await open(page); await page.getByRole('tab', { name: '考核', exact: true }).click(); await page.reload();
  114 |   await expect(page.locator('[data-checkpoint="u1:unit"]').getByRole('link', { name: '继续作答', exact: true })).toHaveAttribute('href', new RegExp(independentId));
  115 |   const check = (await call('/chemistry/catalog?studentId=' + studentId)).checkpoints.find((check: any) => check.id === 'u1:unit');
  116 |   expect(check).toMatchObject({ status: 'in_progress', lastSessionId: independentId });
  117 |   expect((await call('/diagnostics/sessions/' + baselineId + '/report')).evidence).toEqual(original.evidence);
  118 | });
  119 | 
  120 | test('chemistry: family-created ninth-grade profile reaches the standard library and old links keep their unit', async ({ page }) => {
  121 |   const { studentId } = await fixture(page);
  122 |   await page.goto('/parent/dashboard?' + new URLSearchParams({ studentId, subject: 'chemistry' }));
  123 |   await page.getByRole('button', { name: '＋ 添加孩子档案', exact: true }).click();
  124 |   await page.getByPlaceholder('怎么称呼孩子').fill('新建九上化学档案'); await page.getByLabel('当前年级').selectOption('9');
  125 |   await page.getByRole('button', { name: '保存档案 ↗', exact: true }).click();
  126 |   const selected = page.getByLabel('选择学生', { exact: true }); await expect(selected.locator('option:checked')).toContainText('新建九上化学档案');
  127 |   const createdId = await selected.inputValue(); expect(createdId).not.toBe(studentId);
  128 |   await page.getByRole('link', { name: '学习工作台', exact: true }).click();
  129 |   await expect(page.getByLabel('学习档案', { exact: true })).toHaveValue(createdId);
> 130 |   await page.locator('.ws-navigation').getByRole('link', { name: 'Courses', exact: true }).click(); await enroll(page);
      |                                                                                            ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
  131 |   await page.goto('/chemistry?' + new URLSearchParams({ studentId: createdId, unit: 'u7' }));
  132 |   await expect(page).toHaveURL(/\/studio\?/); await expect(page.getByLabel('学习档案', { exact: true })).toHaveValue(createdId);
  133 |   await expect(page.locator('.cl-unit-heading')).toContainText('燃料、能源与环境');
  134 |   await expect(page.getByRole('button', { name: '添加课程并开始学习', exact: true })).toHaveCount(0);
  135 | });
  136 | 
  137 | test('chemistry: viewing a course preserves an explicit primary profile until the parent changes it', async ({ page }) => {
  138 |   const { studentId, headers, call } = await fixture(page);
  139 |   const result = await fetch(api + '/students', { method: 'POST', headers, body: JSON.stringify({ nickname: '原有小学档案', grade: 3, preferredSessionMinutes: 15,
  140 |     defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }) });
  141 |   expect(result.status).toBe(201); const primaryId = (await result.json()).data.profile.id;
  142 |   await page.goto('/studio?' + new URLSearchParams({ view: 'courses', student: primaryId, subject: 'chemistry' })); await open(page);
  143 |   await expect(page.getByLabel('学习档案', { exact: true })).toHaveValue(primaryId);
  144 |   await expect(page.getByRole('button', { name: '添加课程并开始学习', exact: true })).toBeDisabled();
  145 |   expect((await call('/chemistry/catalog?studentId=' + primaryId)).studentId).toBe(primaryId);
  146 |   expect((await call('/learning/studio/overview?' + new URLSearchParams({ studentId, subject: 'chemistry' }))).courses).toHaveLength(0);
  147 |   await page.getByLabel('学习档案', { exact: true }).selectOption(studentId); await enroll(page);
  148 |   expect((await call('/learning/studio/overview?' + new URLSearchParams({ studentId, subject: 'chemistry' }))).courses).toHaveLength(1);
  149 | });
  150 | 
```
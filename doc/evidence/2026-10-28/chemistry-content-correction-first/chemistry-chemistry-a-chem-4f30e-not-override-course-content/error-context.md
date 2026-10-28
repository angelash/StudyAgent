# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: chemistry.spec.ts >> chemistry: a chemical course request cannot reuse mathematics and old subject parameters cannot override course content
- Location: tests\e2e\chemistry.spec.ts:151:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: '广州人教版九上化学 · 学习与验证', exact: true })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('heading', { name: '广州人教版九上化学 · 学习与验证', exact: true }) with timeout 15000ms
  - waiting for getByRole('heading', { name: '广州人教版九上化学 · 学习与验证', exact: true })

```

```yaml
- alert
- main:
  - complementary "学习工作台导航":
    - link "StudyAgent 学习工作台":
      - /url: /studio
      - text: StudyAgent
    - button "收起学习导航" [expanded]
    - navigation "工作台主要入口":
      - button "Home": 首页
      - button "Courses": 课程
      - button "Calendar": 学习动态
      - button "History": 历史
      - button "Materials": 资料
      - link "AI Whiteboards":
        - /url: /studio/whiteboards
        - text: AI白板
    - button "＋ 创建课程"
    - region "开始学习":
      - heading "开始学习" [level=3]
      - link "打开课程 从一节适合自己的课开始。":
        - /url: /studio?view=courses
    - heading "近期活动" [level=3]
    - paragraph: 开始学习后，活动会出现在这里。
    - link "返回学习首页":
      - /url: /learn?subject=math&student=student_aabe096b-38cf-4c21-8227-c8538286bf6b
      - text: 返回学习首页 →
  - combobox "学习档案":
    - option "九上化学验收"
    - option "旧数学范围验收" [selected]
  - combobox "学科":
    - option "数学" [selected]
    - option "语文"
    - option "英语"
    - option "化学"
  - link "教学课堂 ↗":
    - /url: /studio/classroom
  - link "学习观察室":
    - /url: /
  - button "Craft Courses"
  - button "Instant Assistance"
  - heading "把下一步，做成一条走得通的路。" [level=1]
  - paragraph: 从已确认学习范围生成课程蓝图，审阅结构和来源后再开始。
  - textbox "围绕哪段学习内容设计课程？": 广东初三化学上学期
  - text: ＋ 资料
  - button "Concept Explanation"
  - text: 语音 模型
  - combobox "选择大模型":
    - option "Auto · 平台默认 DeepSeek V4.1 Flash"
  - text: 尚未进行文字检查
  - button "↑"
  - button "可视化 用图形解释异分母加法 通分、合并与验算"
  - button "个性化练习 从我的已知点生成练习 只覆盖已确认范围"
  - button "主动学习 看看今天最值得做什么 按教育优先级排序"
  - heading "你的学习路径" [level=2]
  - button "创建课程"
  - heading "还没有课程" [level=3]
  - paragraph: 先确认学习范围，再从已学知识生成可审核蓝图。
  - button "生成第一门课程"
  - complementary:
    - article:
      - text: LEARNER SNAPSHOT
      - heading "旧数学范围验收" [level=2]
      - text: 4 年级
      - strong: "0"
      - text: / 3 已有点有稳定证据 3 已确认知识点 0 日历安排
    - article:
      - text: NEXT BEST ACTION
      - button "全部 →"
      - link "3个已学点仍需补充证据 未知或样本不足不是低能力；下一组评测会优先补齐可用的独立题族。":
        - /url: /student/assessment?studentId=student_aabe096b-38cf-4c21-8227-c8538286bf6b&subject=math
        - text: 3个已学点仍需补充证据
        - paragraph: 未知或样本不足不是低能力；下一组评测会优先补齐可用的独立题族。
    - article:
      - text: RECENT WHITEBOARDS
      - button "新建"
      - paragraph: 还没有白板。输入一个主题并选择 Whiteboard session。
    - article:
      - text: SYNC STATUS
      - button "日历 →"
      - paragraph: 0 个 LMS / 日历来源 · 0 个安排
      - text: 同步只读取课程日期；学习掌握仍由独立测量形成。
  - dialog "课程蓝图":
    - text: COURSE BLUEPRINT
    - heading "设计这次学习" [level=2]
    - button "关闭课程蓝图": ×
    - list "创建课程步骤":
      - listitem: 1 · 目标与范围
      - listitem: 2 · 审阅后确认
    - paragraph:
      - link "用自己的 PDF 或文字资料创建课程 →":
        - /url: /studio/source-courses?new=1&studentId=student_aabe096b-38cf-4c21-8227-c8538286bf6b&subject=math
    - paragraph: 当前内容范围：4年级 · 数学。课程内容取自下面选中的知识点。
    - alert:
      - paragraph: 课程名称要求化学，当前选择的是数学范围，请切换学科后创建。
      - link "打开九上化学课程与考核 →":
        - /url: /studio?view=courses&subject=chemistry&course=chemistry&student=student_aabe096b-38cf-4c21-8227-c8538286bf6b
    - text: 课程名称
    - textbox "课程名称":
      - /placeholder: 可留空，按所选知识点命名
      - text: 广东初三化学上学期
    - text: 希望解决什么问题
    - textbox "课程学习目标":
      - /placeholder: 例如：理解共同单位，再独立完成新情境中的分数加法
    - text: 每次学习预算
    - combobox "每次学习预算":
      - option "5 分钟"
      - option "10 分钟"
      - option "15 分钟" [selected]
      - option "20 分钟"
      - option "25 分钟"
      - option "30 分钟"
      - option "45 分钟"
      - option "60 分钟"
    - text: 教学语言 沿用已审核材料 保留材料中的原语言和英文例句。
    - group "选择本次知识点 已选 3 / 3":
      - text: 选择本次知识点 已选 3 / 3
      - paragraph: 旧数学范围验收 · 4年级 · 四年级数学范围
      - text: 筛选知识点
      - textbox "筛选蓝图知识点":
        - /placeholder: 名称、领域或目标
      - button "选择当前列表"
      - button "清空选择"
      - checkbox "选择知识点：两位数乘两位数" [checked]
      - text: 两位数乘两位数 将乘数分解成十位和个位分别求积再合并
      - emphasis: 讲解已审核
      - checkbox "选择知识点：余数与除数的约束" [checked]
      - text: 余数与除数的约束 将不能整分的数量分组，确定余数且检验余数小于除数
      - emphasis: 讲解已审核
      - checkbox "选择知识点：长方形面积的覆盖关系" [checked]
      - text: 长方形面积的覆盖关系 用长乘宽确定单位正方形的数量
      - emphasis: 讲解已审核
    - button "取消"
    - button "预览课程蓝图" [disabled]
```

# Test source

```ts
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
  130 |   await page.locator('.ws-navigation').getByRole('button', { name: 'Courses', exact: true }).click(); await enroll(page);
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
  151 | test('chemistry: a chemical course request cannot reuse mathematics and old subject parameters cannot override course content', async ({ page }) => {
  152 |   const { studentId, headers, call } = await fixture(page);
  153 |   const child = await fetch(api + '/students', { method: 'POST', headers, body: JSON.stringify({ nickname: '旧数学范围验收', grade: 4, preferredSessionMinutes: 15,
  154 |     defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }) });
  155 |   expect(child.status).toBe(201); const primaryId = (await child.json()).data.profile.id;
  156 |   const scope = await fetch(api + `/students/${primaryId}/learning-scope`, { method: 'PUT', headers, body: JSON.stringify({ subject: 'math', grade: 4, term: 'upper',
  157 |     textbookVolumeId: null, textbookVersion: '四年级数学范围', learnedAtomIds: ['foundation:math:multiplytwo', 'foundation:math:remainder', 'foundation:math:rectanglearea'],
  158 |     currentAtomId: 'foundation:math:multiplytwo', minutesPerSession: 15, progressMode: 'knowledge', selectedLessonIds: [] }) });
  159 |   expect(scope.status).toBe(200);
  160 |   await page.goto('/studio?' + new URLSearchParams({ student: primaryId, subject: 'math', view: 'home' }));
  161 |   await page.locator('.sa-composer textarea').fill('广东初三化学上学期'); await page.locator('.sa-composer').getByRole('button', { name: '↑', exact: true }).click();
  162 |   const dialog = page.getByRole('dialog', { name: '课程蓝图', exact: true });
  163 |   await expect(dialog).toContainText('课程名称要求化学，当前选择的是数学范围');
  164 |   await expect(dialog.getByRole('button', { name: '预览课程蓝图', exact: true })).toBeDisabled();
  165 |   await screenshot(page, 'reject-math-scope');
  166 |   expect((await call('/learning/studio/overview?' + new URLSearchParams({ studentId: primaryId, subject: 'math' }))).courses).toHaveLength(0);
  167 |   await dialog.getByRole('link', { name: '打开九上化学课程与考核 →', exact: true }).click();
> 168 |   await expect(page.getByRole('heading', { name: courseTitle, exact: true })).toBeVisible();
      |                                                                               ^ Error: expect(locator).toBeVisible() failed
  169 |   await expect(page.locator('.cl-microlessons')).toContainText('物理变化与化学变化');
  170 |   await expect(page.locator('.cl-outline')).not.toContainText('两位数乘两位数');
  171 |   await page.getByLabel('学习档案', { exact: true }).selectOption(studentId); await enroll(page);
  172 |   const catalog = await call('/chemistry/catalog?studentId=' + studentId);
  173 |   await page.goto('/studio?' + new URLSearchParams({ view: 'courses', student: studentId, subject: 'math', course: catalog.courseId }));
  174 |   await expect(page.getByLabel('学科', { exact: true })).toHaveValue('chemistry');
  175 |   await expect(page.getByRole('heading', { name: courseTitle, exact: true })).toBeVisible();
  176 |   await expect(page.locator('.cl-microlessons')).not.toContainText('两位数乘两位数');
  177 | });
  178 | 
  179 | test('chemistry: each unit opens actual chemical concepts and worked examples in the rendered classroom', async ({ page }) => {
  180 |   test.setTimeout(120000);
  181 |   const { studentId, call } = await fixture(page); await enroll(page);
  182 |   const catalog = await call('/chemistry/catalog?studentId=' + studentId);
  183 |   for (let index = 0; index < catalog.units.length; index++) {
  184 |     const expected = catalog.units[index].lessons[0];
  185 |     await page.getByRole('navigation', { name: '课程单元' }).getByRole('button').nth(index).click();
  186 |     await page.locator('.cl-learn').first().click(); await expect(page.locator('.cl-room')).toBeVisible();
  187 |     await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
  188 |     await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
  189 |     await expect(page.locator('.cl-board-paper')).toContainText(expected.teaching.explanation);
  190 |     await expect(page.locator('.cl-board-paper')).toContainText(expected.teaching.example.prompt);
  191 |     await expect(page.locator('.cl-board-paper')).toContainText(expected.teaching.example.conclusion);
  192 |     await expect(page.locator('.cl-room')).not.toContainText(/两位数乘两位数|余数与除数|长方形面积|异分母|通分/);
  193 |     const sessionId = new URL(page.url()).searchParams.get('session')!;
  194 |     const session = await call('/learning/classroom/sessions/' + sessionId);
  195 |     expect(session.lessonId).toBe('learn:' + expected.id);
  196 |     if ([0, 4, 6].includes(index)) await screenshot(page, 'actual-chemistry-body-unit-' + (index + 1));
  197 |     await page.getByRole('button', { name: '离开课堂', exact: true }).click();
  198 |     await page.getByRole('button', { name: '保存并离开', exact: true }).click();
  199 |     await expect(page.getByRole('heading', { name: courseTitle, exact: true })).toBeVisible();
  200 |     await expect(page.getByRole('navigation', { name: '课程单元' }).getByRole('button').nth(index)).toHaveAttribute('data-active', 'true');
  201 |   }
  202 | });
  203 | 
```
# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: chemistry.spec.ts >> chemistry: each unit opens actual chemical concepts and worked examples in the rendered classroom
- Location: tests\e2e\chemistry.spec.ts:179:5

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.cl-board-paper')
Expected substring: "判断变化先找物质种类有没有改变。形状、大小和状态改变通常不能单独证明发生化学变化；发光、放热、气泡也只是线索，需要核对生成了什么。化学变化中常伴随物理变化。"
Received string:    "01 / orient本节课导航概念是什么？怎样解释生活？用什么证据核查？02 / concept物理变化与化学变化物理变化与化学变化注意适用条件与易混概念03 / example比较蜡烛熔化与蜡烛燃烧。熔化后的蜡仍是原来的蜡，变化的是状态。燃烧时蜡与氧气反应，生成二氧化碳和水等物质。把“有没有新物质”作为两种变化共同的判断标准。"
Timeout: 15000ms

Call log:
  - Expect "toContainText" locator('.cl-board-paper') with timeout 15000ms
  - waiting for locator('.cl-board-paper')
    - locator resolved to <div class="cl-board-paper" data-handwriting="true">…</div>
    - unexpected value "01 / orient本节课导航概念是什么？怎样解释生活？用什么证据核查？02 / concept物理变化与化学变化物理变化与化学变化注意适用条件与易混概念"
    32 × locator resolved to <div class="cl-board-paper" data-handwriting="true">…</div>
       - unexpected value "01 / orient本节课导航概念是什么？怎样解释生活？用什么证据核查？02 / concept物理变化与化学变化物理变化与化学变化注意适用条件与易混概念03 / example比较蜡烛熔化与蜡烛燃烧。熔化后的蜡仍是原来的蜡，变化的是状态。燃烧时蜡与氧气反应，生成二氧化碳和水等物质。把“有没有新物质”作为两种变化共同的判断标准。"

```

```yaml
- heading "本节课导航" [level=2]
- list:
  - listitem: ·概念是什么？
  - listitem: ·怎样解释生活？
  - listitem: ·用什么证据核查？
- heading "物理变化与化学变化" [level=2]
- list:
  - listitem: ·物理变化与化学变化
  - listitem: ·注意适用条件与易混概念
- heading "比较蜡烛熔化与蜡烛燃烧。" [level=2]
- list:
  - listitem: ·熔化后的蜡仍是原来的蜡，变化的是状态。
  - listitem: ·燃烧时蜡与氧气反应，生成二氧化碳和水等物质。
  - listitem: ·把“有没有新物质”作为两种变化共同的判断标准。
```

# Test source

```ts
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
  168 |   await expect(page.getByRole('heading', { name: courseTitle, exact: true })).toBeVisible();
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
> 189 |     await expect(page.locator('.cl-board-paper')).toContainText(expected.teaching.explanation);
      |                                                   ^ Error: expect(locator).toContainText(expected) failed
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
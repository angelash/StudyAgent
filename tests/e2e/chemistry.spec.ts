import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const api = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}/api`;
const courseTitle = '广州人教版九上化学 · 学习与验证';
async function fixture(page: Page) {
  const key = `${Date.now()}-${Math.floor(Math.random() * 100000)}`, principal = `chemistry-${key}@local.test`, credential = `Chemistry-${key}`;
  const registration = await fetch(api + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principal, credential }) });
  expect(registration.status).toBe(201); const account = (await registration.json()).data;
  const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + account.token };
  const child = await fetch(api + '/students', { method: 'POST', headers, body: JSON.stringify({ nickname: '九上化学验收', grade: 9, preferredSessionMinutes: 25,
    defaultVersionMap: { math: '', chinese: '', english: '', chemistry: 'guangzhou-pep-chemistry-9-upper-v1' } }) });
  expect(child.status).toBe(201); const studentId = (await child.json()).data.profile.id;
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await page.evaluate(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
  await expect(page.getByRole('navigation', { name: '主要导航' }).getByRole('link', { name: '化学课程', exact: true })).toHaveCount(0);
  const library = '/studio?' + new URLSearchParams({ view: 'courses', student: studentId, subject: 'chemistry' });
  await page.goto(library);
  await expect(page.getByRole('button', { name: '打开课程：' + courseTitle, exact: true })).toBeVisible();
  const call = async (path: string) => { const response = await fetch(api + path, { headers }); expect(response.status).toBe(200); return (await response.json()).data; };
  return { studentId, library, call, headers };
}
async function open(page: Page) {
  await page.getByRole('button', { name: '打开课程：' + courseTitle, exact: true }).click();
  await expect(page.getByRole('heading', { name: courseTitle, exact: true })).toBeVisible();
}
async function enroll(page: Page) {
  await open(page); await page.getByRole('button', { name: '添加课程并开始学习', exact: true }).click();
  await expect(page.getByRole('button', { name: '添加课程并开始学习', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '开始课前诊断', exact: true })).toBeEnabled();
}
async function screenshot(page: Page, label: string) {
  const directory = 'data/qa/browser-evidence/chemistry-' + (process.env.E2E_EVIDENCE_RUN ?? 'local'); mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: directory + '/' + label + '.png', fullPage: true });
}

test('chemistry: normal course cards, seven-unit outline and native classroom preserve the library on three viewports', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const { studentId, library, call } = await fixture(page);
  await expect(page.getByRole('link', { name: '打开课程：社会学概论', exact: true })).toBeVisible();
  await expect(page.locator('.ws-course-ticket')).toHaveCount(2);
  expect((await call('/learning/studio/overview?' + new URLSearchParams({ studentId, subject: 'chemistry' }))).courses).toHaveLength(0);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await screenshot(page, 'library-' + width);
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByLabel('课程类型').selectOption('primary'); await expect(page.locator('.ws-course-ticket')).toHaveCount(1);
  await page.getByLabel('搜索课程').fill('九上化学'); await open(page);
  await expect(page.getByRole('navigation', { name: '课程单元' }).getByRole('button')).toHaveCount(7);
  await expect(page.getByRole('button', { name: '开始课前诊断', exact: true })).toBeDisabled();
  await expect(page.locator('.cl-learn')).toHaveCount(0);
  await page.getByRole('button', { name: '添加课程并开始学习', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始课前诊断', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '开始独立考核', exact: true })).toBeDisabled();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await screenshot(page, 'outline-' + width);
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole('navigation', { name: '课程单元' }).getByRole('button').last().click();
  await expect(page.locator('.cl-unit-heading')).toContainText('燃料、能源与环境');
  await expect(page.locator('.cl-microlessons')).toContainText('氢能源的反应与定量验证');
  await page.getByRole('tab', { name: '考核', exact: true }).click();
  await expect(page.getByRole('heading', { name: '期中与期末考核', exact: true })).toBeVisible();
  await screenshot(page, 'checks-1440');
  await page.getByRole('tab', { name: '资料', exact: true }).click();
  await expect(page.getByRole('heading', { name: '教材与广州原卷', exact: true })).toBeVisible();
  await expect(page.locator('.cl-course-references li')).toHaveCount(10);
  await page.getByRole('navigation', { name: '课程单元' }).getByRole('button').first().click();
  await page.getByRole('tab', { name: '单元', exact: true }).click();
  await page.locator('.cl-learn').first().click(); await expect(page).toHaveURL(/lesson=learn/);
  await expect(page.getByRole('heading', { name: '物理变化与化学变化', exact: true }).first()).toBeVisible();
  await expect(page.getByText('本节课导航', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '离开课堂', exact: true }).click();
  await page.getByRole('button', { name: '保存并离开', exact: true }).click();
  await expect(page.getByRole('heading', { name: courseTitle, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '× 退出课程', exact: true }).click();
  await expect(page.getByLabel('课程类型')).toHaveValue('primary'); await expect(page.getByLabel('搜索课程')).toHaveValue('九上化学');
  await expect(page.locator('.ws-course-ticket')).toHaveCount(1); await page.reload();
  await expect(page.locator('.ws-course-ticket')).toHaveCount(1);
  expect((await call('/learning/studio/overview?' + new URLSearchParams({ studentId, subject: 'chemistry' }))).courses).toHaveLength(1);
  await page.goto(library); await open(page); await page.locator('.cl-practice').first().click();
  await expect(page.getByRole('button', { name: '化学', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('当前年级')).toHaveValue('9');
  await expect(page.locator('.studio-points input[type=checkbox]')).toHaveCount(28);
  expect(errors).toEqual([]);
});

test('chemistry: course assessments unlock independent checks and preserve first answers after reopening', async ({ page }) => {
  const { studentId, library, call } = await fixture(page); await enroll(page);
  await page.getByRole('button', { name: '开始课前诊断', exact: true }).click();
  await expect(page).toHaveURL(/\/student\/assessment\?.*session=/);
  const baselineId = new URL(page.url()).searchParams.get('session')!;
  const baseline = await call('/diagnostics/sessions/' + baselineId); expect(baseline.items.length).toBe(8);
  for (let index = 0; index < baseline.items.length; index++) {
    await page.getByRole('radio').first().check();
    await page.getByRole('button', { name: '提交，下一步 →', exact: true }).click();
    await expect.poll(async () => (await call('/diagnostics/sessions/' + baselineId)).answeredCount).toBe(index + 1);
  }
  await expect(page.getByRole('heading', { name: '从知识点看清下一步。', exact: true })).toBeVisible();
  const original = await call('/diagnostics/sessions/' + baselineId + '/report'); expect(original.answeredCount).toBe(8);
  await page.goto(library); await open(page); await page.getByRole('tab', { name: '考核', exact: true }).click();
  await expect(page.locator('[data-checkpoint="u1:unit"]').getByRole('button')).toBeEnabled();
  await page.locator('[data-checkpoint="u1:unit"]').getByRole('button').click();
  await expect(page).toHaveURL(/\/student\/assessment\?.*session=/);
  const independentId = new URL(page.url()).searchParams.get('session')!;
  const independent = await call('/diagnostics/sessions/' + independentId), exposed = new Set(baseline.items.map((item: any) => item.questionId));
  expect(independent.items.every((item: any) => !exposed.has(item.questionId))).toBe(true);
  await page.goto(library); await open(page); await page.getByRole('tab', { name: '考核', exact: true }).click(); await page.reload();
  await expect(page.locator('[data-checkpoint="u1:unit"]').getByRole('link', { name: '继续作答', exact: true })).toHaveAttribute('href', new RegExp(independentId));
  const check = (await call('/chemistry/catalog?studentId=' + studentId)).checkpoints.find((check: any) => check.id === 'u1:unit');
  expect(check).toMatchObject({ status: 'in_progress', lastSessionId: independentId });
  expect((await call('/diagnostics/sessions/' + baselineId + '/report')).evidence).toEqual(original.evidence);
});

test('chemistry: family-created ninth-grade profile reaches the standard library and old links keep their unit', async ({ page }) => {
  const { studentId } = await fixture(page);
  await page.goto('/parent/dashboard?' + new URLSearchParams({ studentId, subject: 'chemistry' }));
  await page.getByRole('button', { name: '＋ 添加孩子档案', exact: true }).click();
  await page.getByPlaceholder('怎么称呼孩子').fill('新建九上化学档案'); await page.getByLabel('当前年级').selectOption('9');
  await page.getByRole('button', { name: '保存档案 ↗', exact: true }).click();
  const selected = page.getByLabel('选择学生', { exact: true }); await expect(selected.locator('option:checked')).toContainText('新建九上化学档案');
  const createdId = await selected.inputValue(); expect(createdId).not.toBe(studentId);
  await page.getByRole('link', { name: '学习工作台', exact: true }).click();
  await expect(page.getByLabel('学习档案', { exact: true })).toHaveValue(createdId);
  await page.locator('.ws-navigation').getByRole('button', { name: 'Courses', exact: true }).click(); await enroll(page);
  await page.goto('/chemistry?' + new URLSearchParams({ studentId: createdId, unit: 'u7' }));
  await expect(page).toHaveURL(/\/studio\?/); await expect(page.getByLabel('学习档案', { exact: true })).toHaveValue(createdId);
  await expect(page.locator('.cl-unit-heading')).toContainText('燃料、能源与环境');
  await expect(page.getByRole('button', { name: '添加课程并开始学习', exact: true })).toHaveCount(0);
});

test('chemistry: viewing a course preserves an explicit primary profile until the parent changes it', async ({ page }) => {
  const { studentId, headers, call } = await fixture(page);
  const result = await fetch(api + '/students', { method: 'POST', headers, body: JSON.stringify({ nickname: '原有小学档案', grade: 3, preferredSessionMinutes: 15,
    defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }) });
  expect(result.status).toBe(201); const primaryId = (await result.json()).data.profile.id;
  await page.goto('/studio?' + new URLSearchParams({ view: 'courses', student: primaryId, subject: 'chemistry' })); await open(page);
  await expect(page.getByLabel('学习档案', { exact: true })).toHaveValue(primaryId);
  await expect(page.getByRole('button', { name: '添加课程并开始学习', exact: true })).toBeDisabled();
  expect((await call('/chemistry/catalog?studentId=' + primaryId)).studentId).toBe(primaryId);
  expect((await call('/learning/studio/overview?' + new URLSearchParams({ studentId, subject: 'chemistry' }))).courses).toHaveLength(0);
  await page.getByLabel('学习档案', { exact: true }).selectOption(studentId); await enroll(page);
  expect((await call('/learning/studio/overview?' + new URLSearchParams({ studentId, subject: 'chemistry' }))).courses).toHaveLength(1);
});

test('chemistry: a chemical course request cannot reuse mathematics and old subject parameters cannot override course content', async ({ page }) => {
  const { studentId, headers, call } = await fixture(page);
  const child = await fetch(api + '/students', { method: 'POST', headers, body: JSON.stringify({ nickname: '旧数学范围验收', grade: 4, preferredSessionMinutes: 15,
    defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }) });
  expect(child.status).toBe(201); const primaryId = (await child.json()).data.profile.id;
  const scope = await fetch(api + `/students/${primaryId}/learning-scope`, { method: 'PUT', headers, body: JSON.stringify({ subject: 'math', grade: 4, term: 'upper',
    textbookVolumeId: null, textbookVersion: '四年级数学范围', learnedAtomIds: ['foundation:math:multiplytwo', 'foundation:math:remainder', 'foundation:math:rectanglearea'],
    currentAtomId: 'foundation:math:multiplytwo', minutesPerSession: 15, progressMode: 'knowledge', selectedLessonIds: [] }) });
  expect(scope.status).toBe(200);
  await page.goto('/studio?' + new URLSearchParams({ student: primaryId, subject: 'math', view: 'home' }));
  await page.locator('.sa-composer textarea').fill('广东初三化学上学期'); await page.locator('.sa-composer').getByRole('button', { name: '↑', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '课程蓝图', exact: true });
  await expect(dialog).toContainText('课程名称要求化学，当前选择的是数学范围');
  await expect(dialog.getByRole('button', { name: '预览课程蓝图', exact: true })).toBeDisabled();
  await screenshot(page, 'reject-math-scope');
  expect((await call('/learning/studio/overview?' + new URLSearchParams({ studentId: primaryId, subject: 'math' }))).courses).toHaveLength(0);
  await dialog.getByRole('link', { name: '打开九上化学课程与考核 →', exact: true }).click();
  await expect(page.getByRole('heading', { name: courseTitle, exact: true })).toBeVisible();
  await expect(page.locator('.cl-microlessons')).toContainText('物理变化与化学变化');
  await expect(page.locator('.cl-outline')).not.toContainText('两位数乘两位数');
  await page.getByLabel('学习档案', { exact: true }).selectOption(studentId); await enroll(page);
  const catalog = await call('/chemistry/catalog?studentId=' + studentId);
  await page.goto('/studio?' + new URLSearchParams({ view: 'courses', student: studentId, subject: 'math', course: catalog.courseId }));
  await expect(page.getByLabel('学科', { exact: true })).toHaveValue('chemistry');
  await expect(page.getByRole('heading', { name: courseTitle, exact: true })).toBeVisible();
  await expect(page.locator('.cl-microlessons')).not.toContainText('两位数乘两位数');
});

test('chemistry: each unit opens actual chemical concepts and worked examples in the rendered classroom', async ({ page }) => {
  test.setTimeout(120000);
  const { studentId, call } = await fixture(page); await enroll(page);
  const catalog = await call('/chemistry/catalog?studentId=' + studentId);
  for (let index = 0; index < catalog.units.length; index++) {
    const expected = catalog.units[index].lessons[0];
    await page.getByRole('navigation', { name: '课程单元' }).getByRole('button').nth(index).click();
    await page.locator('.cl-learn').first().click(); await expect(page.locator('.cl-room')).toBeVisible();
    await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
    await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
    await expect(page.locator('.cl-board-paper')).toContainText(expected.teaching.explanation);
    await expect(page.locator('.cl-board-paper')).toContainText(expected.teaching.example.prompt);
    await expect(page.locator('.cl-board-paper')).toContainText(expected.teaching.example.conclusion);
    await expect(page.locator('.cl-room')).not.toContainText(/两位数乘两位数|余数与除数|长方形面积|异分母|通分/);
    const sessionId = new URL(page.url()).searchParams.get('session')!;
    const session = await call('/learning/classroom/sessions/' + sessionId);
    expect(session.lessonId).toBe('learn:' + expected.id);
    if ([0, 4, 6].includes(index)) await screenshot(page, 'actual-chemistry-body-unit-' + (index + 1));
    await page.getByRole('button', { name: '离开课堂', exact: true }).click();
    await page.getByRole('button', { name: '保存并离开', exact: true }).click();
    await expect(page.getByRole('heading', { name: courseTitle, exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '课程单元' }).getByRole('button').nth(index)).toHaveAttribute('data-active', 'true');
  }
});

for (const width of [390, 1440]) test('chemistry assistant: actual course teaching and cited sources return to its original unit at ' + width, async ({ page }) => {
  test.setTimeout(120000); await page.setViewportSize({ width, height: 960 });
  const { studentId, call } = await fixture(page); await open(page);
  await expect(page.getByRole('link', { name: '获取单元帮助', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '添加课程并开始学习', exact: true }).click();
  const unit = page.getByRole('navigation', { name: '课程单元' }).getByRole('button').last(); await unit.click();
  const catalog = await call('/chemistry/catalog?studentId=' + studentId), actualUnit = catalog.course.units.at(-1);
  await expect(page.getByRole('link', { name: '获取单元帮助', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '获取单元帮助', exact: true }).click();
  await expect(page.getByRole('region', { name: '当前课程上下文' })).toContainText(actualUnit.title);
  await expect(page.getByRole('region', { name: '当前课程上下文' })).toContainText('化学单元');
  await expect(page.getByRole('region', { name: '当前课程上下文' })).not.toContainText('小学单元');
  const question = '[cite-course] 请解释这一单元的化学概念和判断证据。';
  await page.getByLabel('想一起看看什么', { exact: true }).fill(question);
  await page.getByRole('button', { name: '发送学习问题', exact: true }).click();
  await expect(page.getByRole('region', { name: '提问任务', exact: true }).getByRole('status')).toHaveText('回答已保存', { timeout: 45000 });
  const composer = page.getByLabel('想一起看看什么', { exact: true }); await composer.fill('保留原化学单元的问题草稿。');
  await page.getByRole('navigation', { name: '本次回答的教学出处' }).getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: '当时的教学出处', exact: true })).toBeVisible();
  await expect(page.getByLabel('学科', { exact: true })).toHaveValue('chemistry');
  await expect(page.getByLabel('学习档案', { exact: true })).toHaveValue(studentId);
  await expect(page.locator('.assistant-source-content')).toContainText(actualUnit.lessons.find((l: any) => l.kind === 'learn').teaching.teaching.explanation);
  await expect(page.locator('.assistant-source-panel')).not.toContainText(/两位数乘两位数|异分母|通分/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await screenshot(page, 'assistant-source-' + width);
  await page.getByRole('link', { name: '返回原对话', exact: true }).click(); await expect(composer).toHaveValue('保留原化学单元的问题草稿。');
  await page.getByRole('link', { name: /^返回本课/ }).click();
  await expect(page.getByRole('heading', { name: courseTitle, exact: true })).toBeVisible();
  await expect(page.locator('.cl-unit-heading')).toContainText(actualUnit.title);
  await expect(page.getByRole('navigation', { name: '课程单元' }).getByRole('button').last()).toHaveAttribute('data-active', 'true');
  await page.reload(); await expect(page.locator('.cl-unit-heading')).toContainText(actualUnit.title);
});

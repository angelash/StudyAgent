import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const api = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}/api`;
async function fixture(page: Page, withCourses = true) {
  const key = `${Date.now()}-${Math.floor(Math.random() * 100000)}`, principal = `library-${key}@local.test`, credential = `Library-${key}`;
  const registration = await fetch(api + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principal, credential }) });
  expect(registration.status).toBe(201); const { data } = await registration.json();
  const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + data.token };
  async function call(path: string, body: object) {
    const response = await fetch(api + path, { method: 'POST', headers, body: JSON.stringify(body) });
    expect(response.status).toBe(201); return (await response.json()).data;
  }
  let studentId = '', courses: any[] = [];
  if (withCourses) {
    studentId = (await call('/students', { nickname: '课程库验收', grade: 5, preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } })).profile.id;
    const scope = await fetch(api + `/students/${studentId}/learning-scope`, { method: 'PUT', headers, body: JSON.stringify({ subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null, textbookVersion: '知识点验收教材', learnedAtomIds: ['core:math:fractionadd'], currentAtomId: 'core:math:fractionadd', minutesPerSession: 15, progressMode: 'knowledge', selectedLessonIds: [] }) });
    expect(scope.status).toBe(200);
    for (const title of ['A待学分数', 'B在读分数', 'C读完分数']) {
      const preview = await call('/learning/studio/courses/preview', { studentId, subject: 'math', title });
      courses.push(await call('/learning/studio/courses', { studentId, subject: 'math', title, objective: preview.objective, previewFingerprint: preview.fingerprint, requestKey: crypto.randomUUID() }));
    }
    const finished = await call('/learning/classroom/sessions', { studioCourseId: courses[2].id, lessonId: courses[2].units[0].lessons.find((lesson: any) => lesson.kind === 'learn').id });
    const complete = await fetch(api + '/learning/classroom/sessions/' + finished.id, { method: 'PATCH', headers, body: JSON.stringify({ expectedRevision: finished.revision, cursor: finished.lesson.steps.length - 1, revealed: finished.lesson.steps.length, completed: true,presentationVersion:finished.presentation.version,unitId:finished.presentation.tracks[finished.lesson.steps.at(-1).id].units[0].id }) });
    expect(complete.status).toBe(200);
    await call('/learning/classroom/sessions', { studioCourseId: courses[1].id, lessonId: courses[1].units[0].lessons.find((lesson: any) => lesson.kind === 'learn').id });
  }
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await page.evaluate(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
  await page.goto('/studio?' + new URLSearchParams({ view: 'courses', ...(studentId ? { student: studentId } : {}), subject: 'math' }));
  await expect(page.getByRole('link', { name: '打开课程：社会学概论' })).toBeVisible();
  return { studentId, courses };
}
async function capture(page: Page, name: string) {
  if (!process.env.E2E_LIBRARY_SNAPSHOT) return;
  mkdirSync('data/qa/course-library', { recursive: true });
  await page.screenshot({ path: `data/qa/course-library/${name}.png`, fullPage: true });
}

test('course filters use actual reading states, combine and restore through reload and browser history', async ({ page }) => {
  test.setTimeout(90000); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await fixture(page); const cards = page.locator('.ws-course-ticket'); await expect(cards).toHaveCount(4);
  await page.getByRole('tab', { name: '未开始', exact: true }).click(); await expect(cards).toHaveCount(2);
  await expect(page.getByRole('button', { name: '打开课程：B在读分数' })).toHaveCount(0);
  await page.getByRole('tab', { name: '进行中', exact: true }).click(); await expect(cards).toHaveCount(1); await expect(cards.first()).toContainText('B在读分数');
  await page.goBack(); await expect(page.getByRole('tab', { name: '未开始', exact: true })).toHaveAttribute('aria-selected', 'true'); await expect(cards).toHaveCount(2);
  await page.goForward(); await expect(cards).toHaveCount(1);
  await page.getByRole('tab', { name: '已完成', exact: true }).click(); await expect(cards).toHaveCount(1); await expect(cards.first()).toContainText('C读完分数'); await expect(cards.first()).toContainText('讲解已读');
  await page.getByRole('button', { name: '清除筛选' }).click(); await page.getByLabel('内容来源').selectOption('authored'); await expect(cards).toHaveCount(1);
  await page.getByLabel('课程类型').selectOption('primary'); await expect(cards).toHaveCount(0); await page.getByRole('button', { name: '查看全部课程' }).click();
  await page.getByLabel('最近学习', { exact: true }).selectOption('7'); await expect(cards).toHaveCount(2);
  await page.getByRole('button', { name: '清除筛选' }).click(); await page.getByLabel('课程类型').selectOption('primary');
  await page.getByLabel('课程排序').selectOption('title'); await expect(cards).toHaveCount(3); await expect(cards.first()).toContainText('A待学分数');
  await page.getByLabel('搜索课程').fill('知识点验收教材'); await expect(cards).toHaveCount(3); await page.reload();
  await expect(page.getByLabel('搜索课程')).toHaveValue('知识点验收教材'); await expect(page.getByLabel('课程类型')).toHaveValue('primary'); await expect(page.getByLabel('课程排序')).toHaveValue('title'); await expect(cards).toHaveCount(3);
  await expect(page.getByRole('link', { name: /GESP C\+\+/ })).toHaveAttribute('href', /\/parent\/gesp\?studentId=/);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 }); await capture(page, String(width));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Course library overflow at ' + width).toBe(true);
    expect(await page.locator('.ws-ticket-main').evaluateAll(cards => cards.every(card => card.querySelector('.ws-ticket-progress>span')!.getBoundingClientRect().right <= card.getBoundingClientRect().right)), 'Reading count must stay inside the card at ' + width).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('adult outline, unit controls and classroom exit retain course-library conditions', async ({ page }) => {
  await fixture(page, false); await page.getByLabel('课程类型').selectOption('adult'); await page.getByLabel('搜索课程').fill('社会学');
  await page.getByRole('link', { name: '打开课程：社会学概论' }).click();
  await page.locator('.cl-unit-nav button').nth(1).click(); await page.getByRole('tab', { name: '练习', exact: true }).click();
  await expect(page.locator('.cl-exam')).toContainText('12 道新情境题');
  await page.locator('.cl-learn').first().click(); await expect(page.locator('.cl-room')).toBeVisible();
  await page.getByRole('button', { name: '离开课堂', exact: true }).click(); await page.getByRole('button', { name: '保存并离开' }).click();
  await expect(page.locator('.cl-unit-nav button').nth(1)).toHaveAttribute('data-active', 'true');
  await page.getByRole('link', { name: '× 退出课程', exact: true }).click();
  await expect(page.getByLabel('课程类型')).toHaveValue('adult'); await expect(page.getByLabel('搜索课程')).toHaveValue('社会学');
  await expect(page.locator('.ws-course-ticket')).toHaveCount(1); await expect(page.locator('.ws-course-ticket').first()).toHaveAttribute('data-course-state', 'active');
});

test('primary course and approved classroom return to the original filtered course and unit', async ({ page }) => {
  const { studentId } = await fixture(page); await page.getByLabel('课程类型').selectOption('primary'); await page.getByLabel('搜索课程').fill('A待学');
  await page.getByRole('button', { name: '打开课程：A待学分数', exact: true }).click(); await expect(page.getByRole('heading', { name: 'A待学分数', exact: true })).toBeVisible();
  await page.locator('.cl-learn').first().click(); await expect(page.locator('.cl-room')).toBeVisible();
  await page.getByRole('button', { name: '离开课堂', exact: true }).click(); await page.getByRole('button', { name: '保存并离开' }).click();
  await expect(page.getByRole('heading', { name: 'A待学分数', exact: true })).toBeVisible(); await expect(page).toHaveURL(new RegExp('student=' + studentId));
  await page.getByRole('button', { name: '× 退出课程', exact: true }).click();
  await expect(page.getByLabel('课程类型')).toHaveValue('primary'); await expect(page.getByLabel('搜索课程')).toHaveValue('A待学'); await expect(page.locator('.ws-course-ticket')).toHaveCount(1);
  await expect(page.locator('.ws-course-ticket').first()).toHaveAttribute('data-course-state', 'active');
});

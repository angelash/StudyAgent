import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const api = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}/api`;
async function fixture(page: Page) {
  const key = `${Date.now()}-${Math.floor(Math.random() * 100000)}`, principal = `blueprint-${key}@local.test`, credential = `Blueprint-${key}`;
  const response = await fetch(api + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principal, credential }) });
  expect(response.status).toBe(201); const { data } = await response.json();
  const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + data.token };
  const child = await fetch(api + '/students', { method: 'POST', headers, body: JSON.stringify({ nickname: '蓝图验收', grade: 5, preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }) });
  expect(child.status).toBe(201); const studentId = (await child.json()).data.profile.id;
  async function scope(ids = ['core:math:fractionadd', 'core:math:fractionsubtract'], textbookVersion = '蓝图范围v1') {
    const result = await fetch(api + '/students/' + studentId + '/learning-scope', { method: 'PUT', headers, body: JSON.stringify({ subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null, textbookVersion, learnedAtomIds: ids, currentAtomId: ids[0], minutesPerSession: 15, progressMode: 'knowledge', selectedLessonIds: [] }) });
    expect(result.status).toBe(200);
  }
  async function courses() { const result = await fetch(api + '/learning/studio/overview?' + new URLSearchParams({ studentId, subject: 'math' }), { headers }); expect(result.status).toBe(200); return (await result.json()).data.courses; }
  await scope(); await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await page.goto('/studio?' + new URLSearchParams({ view: 'courses', student: studentId, subject: 'math' }));
  await expect(page.getByLabel('学习档案')).toHaveValue(studentId); await page.locator('.ws-page-title>button').click();
  await expect(page.getByRole('dialog', { name: '课程蓝图' })).toBeVisible(); await expect(page.getByRole('checkbox')).toHaveCount(2);
  return { studentId, scope, courses };
}
async function screenshot(page: Page, name: string) {
  if (!process.env.E2E_BLUEPRINT_SNAPSHOT) return;
  mkdirSync('data/qa/course-blueprint', { recursive: true }); await page.screenshot({ path: `data/qa/course-blueprint/${name}.png` });
}

test('blueprint supports goal selection, review, edit and cancellation without creating a course', async ({ page }) => {
  const { courses } = await fixture(page); const dialog = page.getByRole('dialog', { name: '课程蓝图' });
  await page.getByLabel('课程名称', { exact: true }).fill('从共同单位走向陌生情境'); await page.getByLabel('课程学习目标').fill('先解释分数单位，再用不同情境核对加法');
  await page.getByLabel('每次学习预算').selectOption('5'); await page.getByRole('checkbox').nth(1).uncheck();
  for (const width of [1440, 768, 390]) { await page.setViewportSize({ width, height: 960 }); await dialog.evaluate(element => element.scrollTop = 0); expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true); await expect(page.getByRole('button', {name:'关闭课程蓝图',exact:true})).toBeInViewport(); await screenshot(page, 'editing-' + width); }
  await page.getByRole('button', { name: '预览课程蓝图', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: '从共同单位走向陌生情境' })).toBeVisible();
  await expect(dialog.getByText('来源与需要核对的内容')).toBeVisible(); await expect(dialog).toContainText('当前范围没有已审核课时映射');
  await expect(dialog.locator('.ws-blueprint-units li')).toHaveCount(4); expect(await courses()).toHaveLength(0);
  for (const width of [1440, 768, 390]) { await page.setViewportSize({ width, height: 960 }); await dialog.evaluate(element => element.scrollTop = 0); expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true); await screenshot(page, 'reviewing-' + width); }
  await page.getByRole('button', { name: '返回修改', exact: true }).click();
  await expect(page.getByLabel('课程名称', { exact: true })).toHaveValue('从共同单位走向陌生情境'); await expect(page.getByLabel('每次学习预算')).toHaveValue('5'); await expect(page.getByRole('checkbox').nth(1)).not.toBeChecked();
  await page.getByRole('button', { name: '取消', exact: true }).click(); await expect(dialog).toHaveCount(0); expect(await courses()).toHaveLength(0);
  let release!: () => void, arrived!: () => void; const held = new Promise<void>(resolve => arrived = resolve), finish = new Promise<void>(resolve => release = resolve);
  await page.route('**/api/learning/studio/courses/preview', async route => { const response = await route.fetch(); arrived(); await finish; await route.fulfill({ response }).catch(() => {}); });
  await page.locator('.ws-page-title>button').click(); await page.getByRole('button', { name: '预览课程蓝图', exact: true }).click(); await held;
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); release(); expect(await courses()).toHaveLength(0);
});

test('a lost confirmation response can be retried with the same receipt and saves the reviewed pace', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); const { courses } = await fixture(page);
  await page.getByLabel('课程名称', { exact: true }).fill('网络恢复后的同一门课程'); await page.getByLabel('每次学习预算').selectOption('5');
  await page.getByRole('button', { name: '预览课程蓝图', exact: true }).click(); await expect(page.getByRole('button', { name: '确认并创建', exact: true })).toBeVisible();
  const keys: string[] = []; let lost = false;
  await page.route('**/api/learning/studio/courses', async route => {
    const body = route.request().postDataJSON(); keys.push(body.requestKey);
    if (!lost) { lost = true; const result = await route.fetch(); expect(result.status()).toBe(201); await route.abort('failed'); }
    else await route.continue();
  });
  await page.getByRole('button', { name: '确认并创建', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('暂时无法连接'); expect(await courses()).toHaveLength(1);
  await page.getByRole('button', { name: '确认并创建', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '网络恢复后的同一门课程', exact: true })).toBeVisible();
  const saved = await courses(); expect(saved).toHaveLength(1); expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
  expect(saved[0].pace.minutesPerSession).toBe(5); expect(saved[0].pace.sessions.every((session: {minutes:number}) => session.minutes <= 5)).toBe(true);
  await page.reload(); await expect(page.locator('.ws-course-pace>summary')).toContainText('每次约 5 分钟');
  await page.locator('.ws-course-pace>summary').click(); await expect(page.locator('.ws-course-pace a').first()).toHaveAttribute('href', /studioCourseId=/);
  expect(errors).toEqual([]);
});

test('changed learning scope invalidates confirmation and can be refreshed without losing the goal', async ({ page }) => {
  const { scope, courses } = await fixture(page);
  await page.getByLabel('课程名称', { exact: true }).fill('范围变化后重新核对'); await page.getByLabel('课程学习目标').fill('保留目标，重新核对当前可用知识');
  await page.getByRole('button', { name: '预览课程蓝图', exact: true }).click(); await expect(page.getByRole('button', { name: '确认并创建', exact: true })).toBeVisible();
  await scope(['core:math:fractionadd'], '蓝图范围v2'); await page.getByRole('button', { name: '确认并创建', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('当前已确认学习范围'); expect(await courses()).toHaveLength(0);
  await page.getByRole('button', { name: '重新核对学习范围', exact: true }).click(); await expect(page.getByRole('checkbox')).toHaveCount(1); await expect(page.getByRole('checkbox')).toBeChecked();
  await expect(page.getByLabel('课程名称', { exact: true })).toHaveValue('范围变化后重新核对'); await expect(page.getByLabel('课程学习目标')).toHaveValue('保留目标，重新核对当前可用知识');
  await page.getByRole('button', { name: '预览课程蓝图', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('蓝图范围v2');
  await page.getByRole('button', { name: '确认并创建', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  const saved = await courses(); expect(saved).toHaveLength(1); expect(saved[0].focusAtomIds).toEqual(['core:math:fractionadd']);
});

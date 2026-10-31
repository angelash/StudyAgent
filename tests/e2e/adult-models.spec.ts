import { expect, test, type Page } from '@playwright/test';
import { syntheticFamilyHeaders } from './synthetic-family';
import { adultClassroomModels } from '../../apps/api/src/modules/learning/adult-classroom-models';

const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107') + '/api';
async function fixture(page: Page) {
  const headers = await syntheticFamilyHeaders(page), suffix = crypto.randomUUID(), principal = 'adult-model-' + suffix, credential = 'Synthetic-adult-' + suffix;
  let token = '';
  async function call(route: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(api + route, { method, headers: { ...headers, ...(token ? { authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    expect(response.status, route + ': ' + response.status).toBe(method === 'POST' ? 201 : 200); return (await response.json()).data;
  }
  const actor = await call('/auth/register', { principal, credential }); token = actor.token;
  await page.addInitScript(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/studio(?:\?|$)/);
  const open = (lessonId: string) => call('/learning/classroom/sessions', { lessonId });
  async function display(row: any, stepId: string) {
    const cursor = row.lesson.steps.findIndex((step: any) => step.id === stepId); expect(cursor).toBeGreaterThanOrEqual(0);
    const units = row.presentation.tracks[stepId].units;
    row = await call('/learning/classroom/sessions/' + row.id, { expectedRevision: row.revision, cursor, revealed: cursor + 1,
      sentenceCursor: units.length - 1, presentationVersion: row.presentation.version, unitId: units.at(-1).id }, 'PATCH');
    await page.goto('/studio/classroom?' + new URLSearchParams({ lesson: row.lessonId, session: row.id, courseScope: 'adult', tab: 'history' }));
    await expect(page.locator('[id="board-' + stepId + '"]')).toBeVisible(); return row;
  }
  return { actor, call, open, display };
}

test('adult models: every59 actual lesson renders its complete authored comparison through the production classroom', async ({ page }) => {
  test.setTimeout(300000); const f = await fixture(page); await page.setViewportSize({ width: 768, height: 900 });
  for (const [id, model] of Object.entries(adultClassroomModels)) {
    const row = await f.display(await f.open(id), id + ':model-reading'), table = page.locator('[id="board-' + id + ':model-reading"] table');
    await expect(table.locator('th'), id).toHaveText(model.table.headers);
    await expect(table.locator('tbody tr'), id).toHaveCount(model.table.rows.length);
    for (const [index, cells] of model.table.rows.entries()) await expect(table.locator('tbody tr').nth(index).locator('td'), id).toHaveText(cells);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), id).toBe(true);
    expect(row.answers, id).toEqual([]); await page.screenshot({ path: test.info().outputPath(id + '-model.png'), fullPage: false });
  }
});

for (const id of ['soc-1-1-2', 'soc-2-3-3', 'soc-3-3-3', 'soc-4-3-2', 'soc-5-2-1']) test('adult models: unit concept, comparison, example, limits and original practice remain usable across widths for ' + id, async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page), model = adultClassroomModels[id]; let row = await f.display(await f.open(id), id + ':model-reading');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 }); const table = page.locator('[id="board-' + id + ':model-reading"] table'); await expect(table).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(model.table.rows.length);
    await table.locator('tbody tr').last().scrollIntoViewIfNeeded(); await expect(table.locator('tbody tr').last()).toBeVisible();
    const wrap = table.locator('..'); await wrap.focus(); await expect(wrap).toBeFocused();
    if (await wrap.evaluate(node => node.scrollWidth > node.clientWidth + 1)) {
      await wrap.evaluate(node => { node.scrollLeft = 0; }); await wrap.press('ArrowRight'); await expect.poll(() => wrap.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
      for (let turn = 0; turn < 20; turn++) await wrap.press('ArrowRight');
      await expect(table.locator('tbody tr').last().locator('td').last()).toBeInViewport({ ratio: 0.95 });
      expect((await f.call('/learning/classroom/sessions/' + row.id)).cursor).toBe(row.cursor);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(id + '-' + width + '.png'), fullPage: false });
  }
  for (const suffix of ['concept', 'example', 'contrast', 'model-evidence']) {
    row = await f.display(row, id + ':' + suffix); const step = row.lesson.steps.find((step: any) => step.id === id + ':' + suffix);
    await expect(page.locator('[id="board-' + step.id + '"] h2')).toHaveText(step.title);
  }
  await page.setViewportSize({ width: 390, height: 560 }); await page.screenshot({ path: test.info().outputPath(id + '-short.png'), fullPage: false });
  await page.setViewportSize({ width: 1440, height: 900 }); await page.getByRole('tab', { name: '课堂练习', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '课堂练习进度', exact: true }).getByRole('button')).toHaveCount(row.lesson.questions.length);
  expect((await f.call('/learning/classroom/sessions/' + row.id)).answers).toEqual([]);
});

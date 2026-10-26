import { expect, test, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { browserEvidence } from './evidence';

const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107') + '/api';
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });
async function fixture(page: Page, disposition: 'dont_know' | 'skip' = 'dont_know') {
  const hash = createHash('sha256').update(test.info().testId).digest(), address = '198.19.' + hash[0] + '.' + hash[1];
  const principal = 'report-browser-' + randomUUID() + '@local.test', credential = 'Synthetic-Report-Only-20261026';
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address }); let token = '';
  async function call(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(api + path, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address,
      ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    expect(response.ok, path + ': ' + response.status).toBe(true); return (await response.json()).data;
  }
  const actor = await call('/auth/register', { principal, credential }); token = actor.token;
  const studentId = (await call('/students', { nickname: '匿名知识点观察', grade: 4, preferredSessionMinutes: 10,
    defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } })).profile.id;
  const atomIds = ['core:math:average', 'atomic:math:averagecount'];
  await call('/students/' + studentId + '/learning-scope', { subject: 'math', grade: 4, term: 'upper', textbookVolumeId: null,
    textbookVersion: '合成已学知识范围', learnedAtomIds: atomIds, currentAtomId: atomIds[0], minutesPerSession: 10,
    progressMode: 'knowledge', selectedLessonIds: [] }, 'PUT');
  const session = await call('/diagnostics/sessions', { studentId, subject: 'math', intent: 'baseline', targetAtomIds: atomIds,
    includePrerequisites: false, adaptive: false, maxItems: 8 });
  for (const item of session.items) await call('/diagnostics/sessions/' + session.id + '/responses', { itemId: item.id, disposition, elapsedMs: 1000 });
  const report = await call('/diagnostics/sessions/' + session.id + '/complete', {});
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  const href = '/student/assessment?' + new URLSearchParams({ studentId, subject: 'math', session: session.id });
  await page.goto(href); await expect(page.getByRole('heading', { name: '从知识点看清下一步。' })).toBeVisible();
  return { call, report, session, studentId, atomIds, href };
}

test('knowledge report: the actual frozen goals, original estimates and self-reports stay together when selecting a point', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); const f = await fixture(page);
  const directory = browserEvidence('knowledge-report');
  writeFileSync(join(directory, 'actual-report-original.json'), JSON.stringify(f.report, null, 2) + '\n');
  await page.screenshot({ path: join(directory, 'report-current.png'), fullPage: true });
  const workspace = page.getByRole('region', { name: '知识点工作区' }); await expect(workspace).toBeVisible();
  for (const atomId of f.atomIds) {
    const estimate = f.report.estimates.find((row: any) => row.atomId === atomId), definition = f.report.definitionContext.atoms.find((row: any) => row.id === atomId);
    await workspace.getByRole('button', { name: '查看知识点：' + estimate.atomName, exact: true }).click();
    await expect(workspace.getByRole('heading', { name: estimate.atomName, exact: true, level: 3 })).toBeVisible();
    await expect(workspace).toContainText(definition.objective); await expect(workspace).toContainText(definition.successCriterion);
    await expect(workspace.getByRole('region', { name: '本点量化与未知项' }).getByText(estimate.mastery + '%', { exact: true })).toBeVisible();
    await expect(workspace.getByRole('region', { name: '本点量化与未知项' })).toContainText('仍需真实间隔复测');
    await expect(workspace.getByRole('region', { name: '本点表面表现' })).toContainText('选择暂时不会');
    expect(new URL(page.url()).searchParams.get('reportAtom')).toBe(atomId);
  }
  const countBefore = (await f.call('/diagnostics/sessions?' + new URLSearchParams({ studentId: f.studentId, subject: 'math' }))).length;
  await workspace.getByRole('button', { name: '做一组题验证原因 ↗', exact: true }).click();
  await expect(page.getByRole('region', { name: '本次评测范围与题组' })).toBeVisible();
  expect((await f.call('/diagnostics/sessions?' + new URLSearchParams({ studentId: f.studentId, subject: 'math' }))).length).toBe(countBefore);
});

test('knowledge report: skipped evidence stays unknown and a point survives reload, back and forward', async ({ page }) => {
  const f = await fixture(page, 'skip'), workspace = page.getByRole('region', { name: '知识点工作区' });
  const first = f.report.estimates.find((row: any) => row.atomId === f.atomIds[0]), second = f.report.estimates.find((row: any) => row.atomId === f.atomIds[1]);
  await workspace.getByRole('button', { name: '查看知识点：' + first.atomName, exact: true }).click();
  await expect(workspace.getByRole('region', { name: '本点量化与未知项' })).toContainText('尚未形成有效估计');
  await expect(workspace.getByRole('region', { name: '本点量化与未知项' }).getByText('0%', { exact: true })).toHaveCount(0);
  await workspace.getByRole('button', { name: '查看知识点：' + second.atomName, exact: true }).click();
  await page.goBack(); await expect(workspace.getByRole('heading', { name: first.atomName, exact: true, level: 3 })).toBeVisible();
  await page.goForward(); await expect(workspace.getByRole('heading', { name: second.atomName, exact: true, level: 3 })).toBeVisible();
  await page.reload(); await expect(workspace.getByRole('heading', { name: second.atomName, exact: true, level: 3 })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('reportAtom')).toBe(f.atomIds[1]);
  await workspace.getByRole('searchbox', { name: '查找知识点' }).fill('不存在的合成目标');
  await expect(workspace).toContainText('没有匹配的知识点'); await expect(workspace.getByRole('heading', { name: second.atomName, exact: true, level: 3 })).toBeVisible();
  await workspace.getByRole('button', { name: '清空搜索', exact: true }).click();
  await page.screenshot({ path: join(browserEvidence('knowledge-report'), 'report-first-workspace.png'), fullPage: true });
});

async function guidance(f: Awaited<ReturnType<typeof fixture>>) {
  return f.call('/diagnostics/students/' + f.studentId + '/plans', { baselineSessionId: f.session.id,
    minutesPerDay: 10, useAi: false, expectedReportVersion: f.report.version ?? 1, requestKey: randomUUID() });
}

test('knowledge report: an older matching plan is found behind a newer unrelated report and opens its durable plan route', async ({ page }) => {
  const f = await fixture(page), original = await guidance(f);
  const other = await f.call('/diagnostics/sessions', { studentId: f.studentId, subject: 'math', intent: 'baseline',
    targetAtomIds: [f.atomIds[0]], includePrerequisites: false, adaptive: false, maxItems: 3 });
  for (const item of other.items) await f.call('/diagnostics/sessions/' + other.id + '/responses', { itemId: item.id, disposition: 'skip', elapsedMs: 1000 });
  const otherReport = await f.call('/diagnostics/sessions/' + other.id + '/complete', {});
  const newer = await f.call('/diagnostics/students/' + f.studentId + '/plans', { baselineSessionId: other.id,
    minutesPerDay: 10, useAi: false, expectedReportVersion: otherReport.version ?? 1, requestKey: randomUUID() });
  expect(newer.id).not.toBe(original.id); await page.reload();
  const workspace = page.getByRole('region', { name: '知识点工作区' }), target = f.report.estimates.find((row: any) => row.atomId === original.actions[0].atomId);
  await workspace.getByRole('button', { name: '查看知识点：' + target.atomName, exact: true }).click();
  const path = workspace.getByRole('region', { name: '本点指导与复测' }); await expect(path).toHaveAttribute('data-plan-id', original.id);
  await expect(path).toContainText(original.actions[0].successCriterion);
  await path.getByRole('button', { name: '查看指导与复测 ↗', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('planId=' + original.id)); await expect(page.getByRole('button', { name: '确认并开始计划', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('button', { name: '确认并开始计划', exact: true })).toBeVisible();
  await page.goBack(); await expect(workspace.getByRole('heading', { name: target.atomName, exact: true, level: 3 })).toBeVisible();
});

test('knowledge report: failed plan reads remain unknown until explicit retry returns the actual matching plan', async ({ page }) => {
  const f = await fixture(page), plan = await guidance(f); let fail = true;
  await page.route('**/api/diagnostics/students/*/plans?*', route => fail ? route.fulfill({ status: 503, json: { error: { message: 'Synthetic plan read failure' } } }) : route.continue());
  await page.reload(); const path = page.getByRole('region', { name: '本点指导与复测' });
  await expect(path).toContainText('还不能判断是否已有对应计划');
  await expect(path.getByText(/这份报告尚无对应的指导计划/)).toHaveCount(0);
  fail = false; await path.getByRole('button', { name: '重新读取指导安排', exact: true }).click();
  await expect(path).toHaveAttribute('data-plan-id', plan.id); await expect(path.getByRole('button', { name: '查看指导与复测 ↗', exact: true })).toBeVisible();
});

test('knowledge report: a controlled missing plan hides its stale actions while the report remains readable and retry can recover', async ({ page }) => {
  const f = await fixture(page), plan = await guidance(f); let unavailable = true;
  await page.route('**/api/diagnostics/plans/*/reviews', route => unavailable ? route.fulfill({ status: 404, json: { error: { message: 'Synthetic missing plan' } } }) : route.continue());
  await page.reload(); const path = page.getByRole('region', { name: '本点指导与复测' });
  await expect(path).toContainText('这份计划当前无法读取');
  await expect(path.getByRole('button', { name: '查看指导与复测 ↗', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '本点量化与未知项' })).toBeVisible();
  unavailable = false; await path.getByRole('button', { name: '重新读取指导安排', exact: true }).click();
  await expect(path).toHaveAttribute('data-plan-id', plan.id); await expect(path.getByRole('button', { name: '查看指导与复测 ↗', exact: true })).toBeVisible();
});

test('knowledge report: late proposed-plan reviews cannot erase the real schedule after activation and refresh', async ({ page }) => {
  const f = await fixture(page), plan = await guidance(f); let hold = true, blocked = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/diagnostics/plans/' + plan.id + '/reviews', async route => {
    if (!hold) return route.continue(); const response = await route.fetch(); blocked++; await gate;
    if (page.isClosed() || route.request().failure()) return route.abort('aborted'); return route.fulfill({ response });
  });
  try {
    await page.reload(); await expect.poll(() => blocked).toBeGreaterThan(0);
    await f.call('/diagnostics/plans/' + plan.id, { status: 'active', expectedRevision: plan.revision ?? 1, requestKey: randomUUID() }, 'PATCH');
    const schedule = await f.call('/diagnostics/plans/' + plan.id + '/reviews');
    const first = f.report.estimates[0], expected = schedule.filter((row: any) => row.atomId === first.atomId);
    expect(expected.length).toBeGreaterThan(0); hold = false;
    const path = page.getByRole('region', { name: '本点指导与复测' }); await path.getByRole('button', { name: '刷新指导记录', exact: true }).click();
    await expect(path).toContainText('正在指导'); await expect(path.locator('.kr-review-list li')).toHaveCount(expected.length);
    release(); await page.unrouteAll({ behavior: 'wait' });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(path.locator('.kr-review-list li')).toHaveCount(expected.length);
    await page.screenshot({ path: join(browserEvidence('knowledge-report'), 'actual-active-guidance-schedule.png'), fullPage: true });
  } finally { release(); }
});

test('knowledge report: a controlled legacy definition and foreign point never create a current verification', async ({ page }) => {
  const f = await fixture(page); let starts = 0;
  await page.route('**/api/diagnostics/sessions/' + f.session.id + '/report', async route => {
    const response = await route.fetch(), payload = await response.json(); payload.data.definitionContext.origin = 'unavailable';
    await route.fulfill({ response, json: payload });
  });
  page.on('request', request => { if (request.method() === 'POST' && /\/diagnostics\/(?:blueprints|sessions)$/.test(new URL(request.url()).pathname)) starts++; });
  await page.goto(f.href + '&reportAtom=foreign-unavailable-point'); const workspace = page.getByRole('region', { name: '知识点工作区' });
  await expect(workspace).toContainText('链接中的知识点不在这份报告中');
  await expect(workspace.getByRole('region', { name: '本点冻结目标' })).toContainText('未保留可核对的目标定义');
  await expect(workspace.getByRole('button', { name: /做一组题验证原因|预览本点的独立题组/ })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has('reportAtom')).toBe(false); expect(starts).toBe(0);
});

test('knowledge report: the actual student role reads its report without management actions and grant revocation ends the private view', async ({ page }) => {
  const f = await fixture(page); await guidance(f);
  await f.call('/students/' + f.studentId + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '合成报告权限测试' });
  const issued = await f.call('/students/' + f.studentId + '/learning-access/codes', { expectedVersion: 1, requestKey: randomUUID() });
  await page.goto('/student/login'); await page.getByLabel('一次性学习码').fill(issued.code); await page.getByRole('button', { name: '进入我的学习 →', exact: true }).click();
  await expect(page).toHaveURL(/\/learn(?:\?|$)/); await page.goto(f.href);
  const workspace = page.getByRole('region', { name: '知识点工作区' }); await expect(workspace).toBeVisible();
  await expect(workspace.getByRole('button', { name: '查看指导与复测 ↗', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /制定指导计划|确认并开始计划/ })).toHaveCount(0);
  await f.call('/students/' + f.studentId + '/learning-access', { enabled: false, expectedVersion: 1, requestKey: randomUUID(), reason: '合成报告撤权测试' });
  await workspace.getByRole('button', { name: '刷新指导记录', exact: true }).click(); await expect(workspace).toHaveCount(0);
  await expect(page).toHaveURL(/\/learn(?:\?|$)/);
});

test('knowledge report: invalidating the actual browser login session ends the private report on its next read', async ({ page }) => {
  await fixture(page); const workspace = page.getByRole('region', { name: '知识点工作区' });
  expect(await page.evaluate(async base => (await fetch(base + '/auth/logout', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, api)).toBe(201);
  await workspace.getByRole('button', { name: '刷新指导记录', exact: true }).click(); await expect(workspace).toHaveCount(0);
  await expect(page).toHaveURL(/\/learn(?:\?|$)/);
});

test('knowledge report: actual submitted short-answer expressions awaiting review do not become scored failure or a zero estimate', async ({ page }) => {
  const f = await fixture(page), atomId = 'core:chinese:evidence-explanation';
  await f.call('/students/' + f.studentId + '/learning-scope', { subject: 'chinese', grade: 4, term: 'upper', textbookVolumeId: null,
    textbookVersion: '合成已学语文范围', learnedAtomIds: [atomId], currentAtomId: atomId, minutesPerSession: 10,
    progressMode: 'knowledge', selectedLessonIds: [] }, 'PUT');
  const session = await f.call('/diagnostics/sessions', { studentId: f.studentId, subject: 'chinese', intent: 'baseline',
    targetAtomIds: [atomId], includePrerequisites: false, adaptive: false, maxItems: 6 }); let expressions = 0;
  for (const item of session.items) {
    const question = await f.call('/diagnostics/sessions/' + session.id + '/items/' + item.id);
    if (question.payload.answerSchema.mode === 'short_answer') {
      expressions++; await f.call('/diagnostics/sessions/' + session.id + '/responses', { itemId: item.id, disposition: 'answered', elapsedMs: 2000,
        answer: { questionId: question.payload.question.id, mode: 'short_answer', response: { value: '我先提出判断，再用材料中的具体事实说明依据。' } } });
    } else await f.call('/diagnostics/sessions/' + session.id + '/responses', { itemId: item.id, disposition: 'skip', elapsedMs: 1000 });
  }
  expect(expressions).toBeGreaterThan(0); const report = await f.call('/diagnostics/sessions/' + session.id + '/complete', {});
  expect(report.pendingReviewCount).toBe(expressions); expect(report.estimates[0].mastery).toBeNull();
  writeFileSync(join(browserEvidence('knowledge-report'), 'actual-pending-review-report.json'), JSON.stringify(report, null, 2) + '\n');
  await page.goto('/student/assessment?' + new URLSearchParams({ studentId: f.studentId, subject: 'chinese', session: session.id }));
  const quant = page.getByRole('region', { name: '本点量化与未知项' }), surface = page.getByRole('region', { name: '本点表面表现' });
  await expect(quant).toContainText('尚未形成有效估计'); await expect(quant.getByText('0%', { exact: true })).toHaveCount(0);
  await expect(surface).toContainText('表达待复核 ' + expressions + ' 次'); await surface.locator(':scope > details > summary').click();
  await expect(surface.getByText('表达待复核', { exact: true })).toHaveCount(expressions);
  await expect(surface.getByText('本题需要核查', { exact: true })).toHaveCount(0);
});

test('knowledge report: a controlled cause timeline remains complete and terminal versus reopened actions stay with their point', async ({ page }) => {
  const f = await fixture(page);
  await page.route('**/api/diagnostics/sessions/' + f.session.id + '/report', async route => {
    const response = await route.fetch(), payload = await response.json();
    payload.data.hypotheses = f.atomIds.map((atomId, index) => {
      const original = payload.data.hypotheses.find((row: any) => row.atomId === atomId);
      return { ...original, status: index ? 'reopened' : 'contradicted', history: Array.from({ length: 9 }, (_, position) => ({
        at: new Date(Date.UTC(2026, 9, position + 1)).toISOString(), status: position === 8 ? index ? 'reopened' : 'contradicted' : 'testing',
        reason: '合成状态展示 ' + (position + 1) + ' · 目标' + index,
      })) };
    });
    writeFileSync(join(browserEvidence('knowledge-report'), 'controlled-cause-history-projection.json'), JSON.stringify(payload.data, null, 2) + '\n');
    await route.fulfill({ response, json: payload });
  });
  await page.reload(); const workspace = page.getByRole('region', { name: '知识点工作区' }), cause = workspace.getByRole('region', { name: '本点原因与验证' });
  await expect(cause).toContainText('已有反证'); await expect(cause.getByRole('button', { name: '做一组题验证原因 ↗', exact: true })).toHaveCount(0);
  await cause.locator('summary').filter({ hasText: '这条判断怎样变化' }).click(); await expect(cause.locator('.kr-cause-history li')).toHaveCount(9);
  await expect(cause).toContainText('合成状态展示 1 · 目标0'); await expect(cause).toContainText('合成状态展示 9 · 目标0');
  const second = f.report.estimates.find((row: any) => row.atomId === f.atomIds[1]);
  await workspace.getByRole('button', { name: '查看知识点：' + second.atomName, exact: true }).click();
  await expect(cause).toContainText('需要再次核查'); await expect(cause.getByRole('button', { name: '做一组题验证原因 ↗', exact: true })).toBeEnabled();
  await expect(cause.getByText('合成状态展示 9 · 目标0', { exact: true })).toHaveCount(0);
});

for (const width of [390, 768, 1440]) test('knowledge report: complete point reading and keyboard controls fit ' + width, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); const f = await fixture(page), workspace = page.getByRole('region', { name: '知识点工作区' });
  const target = f.report.estimates[1], button = workspace.getByRole('button', { name: '查看知识点：' + target.atomName, exact: true });
  await button.focus(); await page.keyboard.press('Enter'); await expect(button).toHaveAttribute('aria-pressed', 'true');
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(workspace.getByRole('heading', { name: target.atomName, level: 3, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const detail = workspace.getByRole('region', { name: '本点表面表现' }); await detail.locator(':scope > details > summary').click();
  const response = f.report.evidence.find((row: any) => row.atomId === target.atomId), original = await f.call('/diagnostics/students/' + f.studentId + '/evidence/' + response.id);
  const source = detail.locator('.diagnostic-evidence').first(); await source.locator(':scope > summary').click();
  await expect(source).toContainText(original.stem); await expect(source.getByRole('heading', { name: '孩子提交的回答', exact: true })).toBeVisible();
  await page.screenshot({ path: join(browserEvidence('knowledge-report'), 'point-' + width + '.png'), fullPage: true });
});

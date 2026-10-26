import { expect, test, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { browserEvidence } from './evidence';

const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107') + '/api';
async function fixture(page: Page) {
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
  for (const item of session.items) await call('/diagnostics/sessions/' + session.id + '/responses', { itemId: item.id, disposition: 'dont_know', elapsedMs: 1000 });
  const report = await call('/diagnostics/sessions/' + session.id + '/complete', {});
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  const href = '/student/assessment?' + new URLSearchParams({ studentId, subject: 'math', session: session.id });
  await page.goto(href); await expect(page.getByRole('heading', { name: '从知识点看清下一步。' })).toBeVisible();
  return { call, report, session, studentId, atomIds, href };
}

test('knowledge report: the actual frozen goals, unknown estimates and self-reports stay together when selecting a point', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); const f = await fixture(page);
  const directory = browserEvidence('knowledge-report');
  writeFileSync(join(directory, 'actual-report-original.json'), JSON.stringify(f.report, null, 2) + '\n');
  await page.screenshot({ path: join(directory, 'report-current.png'), fullPage: true });
  const workspace = page.getByRole('region', { name: '知识点工作区' }); await expect(workspace).toBeVisible();
  for (const atomId of f.atomIds) {
    const estimate = f.report.estimates.find((row: any) => row.atomId === atomId), definition = f.report.definitionContext.atoms.find((row: any) => row.id === atomId);
    await workspace.getByRole('button', { name: '查看知识点：' + estimate.atomName, exact: true }).click();
    await expect(workspace.getByRole('heading', { name: estimate.atomName, exact: true })).toBeVisible();
    await expect(workspace).toContainText(definition.objective); await expect(workspace).toContainText(definition.successCriterion);
    await expect(workspace.getByRole('region', { name: '本点量化与未知项' })).toContainText('尚未形成有效估计');
    await expect(workspace.getByRole('region', { name: '本点表面表现' })).toContainText('选择暂时不会');
    expect(new URL(page.url()).searchParams.get('reportAtom')).toBe(atomId);
  }
});

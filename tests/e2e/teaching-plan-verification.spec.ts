import { test, expect } from '@playwright/test';
import { fixture } from './assistant-practice-fixture';

test('original guidance verification: ordinary baseline retains prerequisite checks', async ({ page }) => {
  test.setTimeout(120_000);
  const f = await fixture(page);
  const baseline = await f.call('/diagnostics/sessions', {
    studentId: f.child.id, subject: 'math', intent: 'baseline',
    targetAtomIds: [f.setup.atomIds[0]], maxItems: 2, includePrerequisites: false,
  });
  for (const item of baseline.items) await f.call('/diagnostics/sessions/' + baseline.id + '/responses', {
    itemId: item.id, disposition: 'skip', elapsedMs: 100,
  });
  await f.call('/diagnostics/sessions/' + baseline.id + '/complete', {});
  const original = await f.call('/diagnostics/students/' + f.child.id + '/plans', {
    baselineSessionId: baseline.id, minutesPerDay: 15, useAi: false, requestKey: crypto.randomUUID(),
  });
  const active = await f.call('/diagnostics/plans/' + original.id, {
    expectedRevision: original.revision, requestKey: crypto.randomUUID(), status: 'active',
  }, 'PATCH');
  await page.goto('/studio/tasks?' + new URLSearchParams({
    studentId: f.child.id, subject: 'math', view: 'plan', planId: original.id,
  }));
  const button = page.getByRole('button', { name: '做新题验证 ↗', exact: true }).first();
  await expect(button).toBeEnabled();
  const waiting = page.waitForResponse(response => response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/diagnostics/blueprints');
  await button.click();
  const response = await waiting, command = response.request().postDataJSON();
  expect(response.status()).toBe(201);
  expect(command.planId).toBe(original.id);
  expect(command.includePrerequisites).toBe(true);
  expect(command.teachingOrigin).toBeUndefined();
  expect((await response.json()).data.teachingOrigin).toBeUndefined();
  await expect(page.getByRole('region', { name: '本次评测范围与题组', exact: true })).toBeVisible();
  const after = await f.call('/diagnostics/plans/' + original.id);
  expect(after.revision).toBe(active.revision);
  expect(after.baselineSessionId).toBe(baseline.id);
});

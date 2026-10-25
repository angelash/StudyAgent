import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { browserEvidence } from './evidence';

const apiUrl = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}`;
const evidence = browserEvidence('classroom-turns');
async function open(page: Page) {
  const id = Date.now() + '-' + Math.floor(Math.random() * 100000), principal = 'turns-' + id + '@local.test', credential = 'Turns-' + id;
  // Separate this suite's synthetic accounts from other suites' shared registration-IP quota.
  const registration = await fetch(apiUrl + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.18.1.200' }, body: JSON.stringify({ principal, credential }) });
  expect(registration.status).toBe(201); const actor = (await registration.json()).data;
  await page.addInitScript(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await page.goto('/studio/classroom?lesson=soc-1-1-1'); await expect(page.getByLabel('向课堂老师提问')).toBeVisible();
  await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
  await expect(page.locator('.cl-session-navigation')).toContainText('2 / 8');
  await expect(page.locator('.cl-subtitle')).not.toContainText('准备好后');
  return actor;
}
async function done(page: Page) { await expect(page.locator('.cl-turn-status')).toContainText('回答已保存'); }
async function screen(page: Page, name: string) { if (!process.env.CI) { mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: evidence + '/' + name + '.png', fullPage: true }); } }

test('lost submission receipt, refresh and explicit return preserve a single turn and the original spoken line', async ({ page }) => {
  test.setTimeout(90000); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await page.setViewportSize({ width: 1440, height: 1000 }); await open(page);
  const subtitle = await page.locator('.cl-subtitle').innerText(), position = await page.locator('.cl-session-navigation').innerText();
  const keys: string[] = []; let drop = true, blockRead = true;
  await page.route('**/api/learning/classroom/sessions/*/turns', async route => {
    if (route.request().method() === 'GET') { if (blockRead) { await route.abort('connectionreset'); return; } await route.continue(); return; }
    keys.push(route.request().postDataJSON().requestKey);
    if (drop) { drop = false; await route.fetch(); await route.abort('connectionreset'); return; }
    await route.continue();
  });
  await page.getByLabel('向课堂老师提问').fill('[pause-turn-once] 如何检查相同条件？'); await page.getByRole('button', { name: '发送课堂问题' }).click();
  await expect(page.getByRole('button', { name: '找回这次提问' })).toBeVisible();
  await page.getByRole('button', { name: '找回这次提问' }).click(); await expect.poll(()=>keys.length).toBe(2); expect(keys[1]).toBe(keys[0]);
  blockRead = false; await page.reload(); await done(page);
  await expect(page.locator('.cl-chat-turn[data-role=assistant]').last()).toBeInViewport({ratio:0.5});
  await expect(page.locator('.cl-chat-turn[data-role=user]')).toHaveCount(1); await expect(page.locator('.cl-chat-turn[data-role=assistant]')).toHaveCount(1);
  await expect(page.locator('.cl-ai-board')).toHaveCount(1); await expect(page.locator('.cl-subtitle')).toHaveText(subtitle);
  await expect(page.locator('.cl-session-navigation')).toHaveText(position, { useInnerText: true });
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 }); if (width === 390) await page.getByRole('button', { name: '对话与练习', exact: true }).click();
    await expect(page.getByRole('button', { name: '回到原句继续' })).toBeVisible();
    await expect(page.locator('.cl-chat-turn[data-role=assistant]').last()).toBeInViewport({ratio:0.5}); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await screen(page, 'recovered-' + width);
  }
  await page.getByRole('button', { name: '回到原句继续' }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '暂停讲解' })).toBeVisible(); await page.getByRole('button', { name: '暂停讲解' }).click(); expect(errors).toEqual([]);
});

test('in-flight cancellation survives refresh and explicit retry creates only one saved answer', async ({ page }) => {
  test.setTimeout(90000); await open(page); await page.getByLabel('向课堂老师提问').fill('[pause-turn-once] 请先停下来比较观察。');
  await page.getByRole('button', { name: '发送课堂问题' }).click(); await expect(page.locator('.cl-turn-status')).toContainText('老师正在思考');
  await page.getByRole('button', { name: '取消这次回答' }).click(); await expect(page.locator('.cl-turn-status')).toContainText('这次插问已取消');
  await page.reload(); await expect(page.getByRole('button', { name: '重试这次提问' })).toBeVisible(); await expect(page.locator('.cl-ai-board')).toHaveCount(0);
  await page.getByRole('button', { name: '重试这次提问' }).click(); await done(page); await expect(page.locator('.cl-ai-board')).toHaveCount(1);
  await expect(page.locator('.cl-chat-turn[data-role=user]')).toHaveCount(1); await expect(page.locator('.cl-chat-turn[data-role=assistant]')).toHaveCount(1);
});

test('all teaching modes show an editable request and keep the conventional model picker', async ({ page }) => {
  test.setTimeout(120000); await open(page);
  const group = page.getByRole('group', { name: '调整讲法' });
  for (const [index, label] of ['换个例子', '说简单点', '补先修', '比较讲法', '提问'].entries()) {
    await group.getByRole('button', { name: label, exact: true }).click(); await expect(group.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
    if (label === '提问') await page.getByLabel('向课堂老师提问').fill('请再检查我的理解。'); else await expect(page.getByLabel('向课堂老师提问')).not.toHaveValue('');
    const option=group.getByRole('button',{name:label,exact:true});
    expect(await option.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
    expect((await option.boundingBox())!.height).toBeLessThanOrEqual(35);
    await page.getByRole('button', { name: '发送课堂问题' }).click();
    await expect(page.locator('.cl-chat-turn[data-role=assistant]')).toHaveCount(index + 1); await done(page);
  }
  await expect(page.locator('.cl-chat-turn[data-role=assistant]').last()).toBeInViewport({ratio:0.5});
  await expect(page.locator('.cl-input')).toContainText('DeepSeek'); await screen(page, 'teaching-modes');
});

test('provider errors remain visible and retry preserves the chosen question', async ({ page }) => {
  test.setTimeout(60000); await open(page); await page.getByLabel('向课堂老师提问').fill('[fail-turn-once] 再解释一下观察条件。');
  await page.getByRole('button', { name: '发送课堂问题' }).click(); await expect(page.locator('.cl-turn-status')).toContainText('这次回答未完成');
  await page.getByRole('button', { name: '重试这次提问' }).click(); await done(page); await expect(page.locator('.cl-chat-turn[data-role=user]')).toContainText('[fail-turn-once]');
});

test('a real learning-code user asks in their own approved course and resumes the same answer after refresh', async ({ page }) => {
  test.setTimeout(90000); const actor = await open(page), headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + actor.token };
  async function call(path: string, body: object, method = 'POST') {
    const response = await fetch(apiUrl + '/api' + path, { method, headers, body: JSON.stringify(body) });
    expect(response.status).toBe(method === 'PUT' ? 200 : 201); return (await response.json()).data;
  }
  const studentId = (await call('/students', { nickname: '课堂插问验收', grade: 5, preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } })).profile.id;
  await call(`/students/${studentId}/learning-scope`, { subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null, textbookVersion: '合成插问范围', learnedAtomIds: ['core:math:fractionadd'], currentAtomId: 'core:math:fractionadd', minutesPerSession: 15, progressMode: 'knowledge', selectedLessonIds: [] }, 'PUT');
  const preview = await call('/learning/studio/courses/preview', { studentId, subject: 'math', title: '分数讲解与插问' });
  const course = await call('/learning/studio/courses', { studentId, subject: 'math', title: '分数讲解与插问', objective: preview.objective, previewFingerprint: preview.fingerprint, requestKey: crypto.randomUUID() });
  const access = await call(`/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: crypto.randomUUID(), reason: '测试学生持久插问与原句恢复' });
  const code = await call(`/students/${studentId}/learning-access/codes`, { expectedVersion: access.version, requestKey: crypto.randomUUID() });
  await page.context().clearCookies(); await page.goto('/student/login'); await page.getByLabel('一次性学习码').fill(code.code);
  await page.getByRole('button', { name: '进入我的学习 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  const lesson = course.units[0].lessons.find((lesson: { kind: string }) => lesson.kind === 'learn');
  await page.goto('/studio/classroom?' + new URLSearchParams({ studioCourseId: course.id, lesson: lesson.id }));
  await page.getByRole('button', { name: '说简单点', exact: true }).click(); await page.getByRole('button', { name: '发送课堂问题' }).click(); await done(page);
  await page.reload(); await done(page); await expect(page.locator('.cl-chat-turn[data-role=assistant]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '回到原句继续' })).toBeVisible();
});

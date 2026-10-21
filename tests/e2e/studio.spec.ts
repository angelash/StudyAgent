import { expect, test } from '@playwright/test';

const apiUrl = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}`;

test('a parent can build and reopen an evidence-backed learning studio course', async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
  const principal = `studio-${suffix}@local.test`;
  const credential = `Studio-only-${suffix}`;
  const registration = await fetch(`${apiUrl}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ principal, credential }) });
  expect(registration.status).toBe(201);
  const auth = await registration.json();
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${auth.data.token}` };
  const studentResponse = await fetch(`${apiUrl}/api/students`, { method: 'POST', headers,
    body: JSON.stringify({ nickname: '工作台验收', grade: 5, preferredSessionMinutes: 15,
      defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }) });
  expect(studentResponse.status).toBe(201);
  const student = await studentResponse.json();
  const studentId = student.data.profile.id;
  const scope = await fetch(`${apiUrl}/api/students/${studentId}/learning-scope?subject=math`, { method: 'PUT', headers,
    body: JSON.stringify({ subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null,
      textbookVersion: '按已学知识点确认', learnedAtomIds: ['core:math:fractionadd', 'core:math:fractionsubtract'],
      currentAtomId: 'core:math:fractionadd', minutesPerSession: 15, progressMode: 'knowledge', selectedLessonIds: [] }) });
  expect(scope.status).toBe(200);

  await page.goto('/parent/login');
  await page.getByLabel('登录账号').fill(principal);
  await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click();
  await expect(page).toHaveURL(/\/parent\/dashboard$/);
  await page.goto('/studio');
  await expect(page.getByRole('button', { name: 'Craft Courses' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Instant Assistance' })).toBeVisible();
  await page.getByRole('button', { name: '生成第一门课程' }).click();
  await page.locator('.sa-modal input').fill('分数关系与证据');
  await page.getByRole('button', { name: '预览课程蓝图' }).click();
  await expect(page.getByText('Unit 1:', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: '确认并创建' }).click();
  await expect(page.getByRole('heading', { name: '分数关系与证据' })).toBeVisible();
  await expect(page.getByText('Unit 1:', { exact: false }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Craft Courses' })).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { statSync } from 'node:fs';

const apiUrl = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}`;

test('a parent can build and reopen an evidence-backed learning studio course', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
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
  if (!process.env.CI) await page.screenshot({ path: 'doc/evidence/2026-10-21/studio-home-polished.png', fullPage: true });
  await page.getByRole('button', { name: '生成第一门课程' }).click();
  await page.locator('.sa-modal input').fill('分数关系与证据');
  await page.getByRole('button', { name: '预览课程蓝图' }).click();
  await expect(page.getByText('Unit 1:', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: '确认并创建' }).click();
  await expect(page.getByRole('heading', { name: '分数关系与证据' })).toBeVisible();
  await expect(page.getByText('Unit 1:', { exact: false }).first()).toBeVisible();
  if (!process.env.CI) await page.screenshot({ path: 'doc/evidence/2026-10-21/studio-course-polished.png', fullPage: true });

  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Instant Assistance' }).click();
  await page.getByRole('button', { name: 'Concept Explanation' }).click();
  await page.locator('.sa-tools-popover').getByRole('button', { name: /Whiteboard session/ }).click();
  await page.locator('.sa-composer textarea').fill('解释异分母分数加法');
  await page.locator('.sa-composer > div > button:last-child').click();
  await expect(page.getByText('WHITEBOARD SESSION', { exact: true })).toBeVisible();
  if (!process.env.CI) await page.screenshot({ path: 'doc/evidence/2026-10-21/studio-whiteboard-preview.png', fullPage: true });
  await page.getByRole('button', { name: '保存到学习工作台' }).click();
  await expect(page.getByRole('dialog', { name: '白板视频' })).toBeVisible();
  if (!process.env.CI) await page.screenshot({ path: 'doc/evidence/2026-10-21/studio-whiteboard-player.png', fullPage: true });
  const videoDownload = page.waitForEvent('download', { timeout: 45_000 });
  await page.getByRole('button', { name: '导出视频' }).click();
  const video = await videoDownload;
  expect(video.suggestedFilename()).toMatch(/\.webm$/);
  expect(statSync(await video.path()).size).toBeGreaterThan(2_000);
  const subtitleDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出字幕' }).click();
  expect((await subtitleDownload).suggestedFilename()).toMatch(/\.srt$/);
  await page.getByRole('button', { name: '关闭白板' }).click();

  await page.getByRole('button', { name: 'Calendar' }).click();
  await page.getByRole('button', { name: '＋ 新建学习安排' }).click();
  await page.getByLabel('任务名称').fill('分数复习安排');
  await page.getByLabel('完成标准').fill('独立完成 5 道新题并说出关键步骤');
  await page.getByRole('button', { name: '加入学习日历' }).click();
  await expect(page.getByText('分数复习安排')).toBeVisible();
  await page.getByRole('button', { name: '连接 LMS / 日历' }).click();
  await page.getByLabel('来源类型').selectOption('lms_ics');
  await page.getByLabel('或粘贴 ICS 文件内容').fill('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:school-1\nDTSTART:20261103T080000+0800\nDTEND:20261103T084500+0800\nSUMMARY:学校单元复习\nEND:VEVENT\nEND:VCALENDAR');
  await page.getByRole('button', { name: '连接并同步' }).click();
  await expect(page.locator('.sa-calendar-grid').getByText('学校单元复习')).toBeVisible();
  await expect(page.getByRole('button', { name: '连接并同步' })).toHaveCount(0);
  if (!process.env.CI) await page.screenshot({ path: 'doc/evidence/2026-10-21/studio-calendar-polished.png', fullPage: true });

  await page.getByRole('button', { name: 'Home' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Craft Courses' })).toBeVisible();
});

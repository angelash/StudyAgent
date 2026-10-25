import { browserEvidence } from './evidence';
import { expect, test } from '@playwright/test';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const apiUrl = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}`;

function writeTextPdf() {
  const directory = mkdtempSync(join(tmpdir(), 'studio-browser-pdf-'));
  const path = join(directory, '分数讲义.pdf');
  const stream = 'BT /F1 20 Tf 72 700 Td (Fractions: unify the unit, combine equal parts,) Tj 0 -30 Td ' +
    '(then check the result with another representation.) Tj 0 -30 Td (1/2 + 1/3 = 5/6) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream',
  ];
  let body = '%PDF-1.4\n'; const offsets: number[] = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(body)); body += (index + 1) + ' 0 obj\n' + object + '\nendobj\n'; });
  const xref = Buffer.byteLength(body); body += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  offsets.slice(1).forEach(offset => { body += String(offset).padStart(10, '0') + ' 00000 n \n'; });
  body += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  writeFileSync(path, body, 'ascii');
  return { path, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

test('a parent can build and reopen an evidence-backed learning studio course', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
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
  await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await page.goto('/studio');
  await expect(page.getByRole('button', { name: 'Craft Courses' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Instant Assistance' })).toBeVisible();
  if (!process.env.CI) await page.screenshot({ path: browserEvidence('studio') + '/studio-home-polished.png', fullPage: true });
  await page.getByRole('button', { name: '生成第一门课程' }).click();
  await page.getByLabel('课程名称', {exact:true}).fill('分数关系与证据');
  await page.getByRole('button', { name: '预览课程蓝图' }).click();
  await expect(page.getByText('Unit 1:', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: '确认并创建' }).click();
  await expect(page.getByRole('heading', { name: '分数关系与证据' })).toBeVisible();
  await expect(page.getByText('Unit 1:', { exact: false }).first()).toBeVisible();
  if (!process.env.CI) await page.screenshot({ path: browserEvidence('studio') + '/studio-course-polished.png', fullPage: true });

  await page.getByRole('button', { name: 'Courses', exact: true }).click();
  const ticket = page.locator('.ws-course-ticket').filter({ has: page.getByRole('button', { name: '打开课程：分数关系与证据', exact: true }) });
  await page.evaluate(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
  await ticket.locator('.ws-ticket-next').click();
  await expect(page.locator('.cl-room')).toBeVisible();
  await page.getByRole('button', { name: '离开课堂', exact: true }).click();
  await page.getByRole('button', { name: '保存并离开' }).click();
  await expect(page.getByRole('heading', { name: '分数关系与证据' })).toBeVisible();

  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Instant Assistance' }).click();
  await page.getByRole('button', { name: 'Concept Explanation' }).click();
  await page.locator('.sa-tools-popover').getByRole('button', { name: /Whiteboard session/ }).click();
  await page.locator('.sa-composer textarea').fill('解释异分母分数加法');
  await page.locator('.sa-composer > div > button:last-child').click();
  await expect(page.getByText('WHITEBOARD SESSION', { exact: true })).toBeVisible();
  if (!process.env.CI) await page.screenshot({ path: browserEvidence('studio') + '/studio-whiteboard-preview.png', fullPage: true });
  await page.getByRole('button', { name: '保存到学习工作台' }).click();
  await expect(page.getByRole('dialog', { name: '白板视频' })).toBeVisible();
  if (!process.env.CI) await page.screenshot({ path: browserEvidence('studio') + '/studio-whiteboard-player.png', fullPage: true });
  const videoDownload = page.waitForEvent('download', { timeout: 120_000 });
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
  await expect(page.locator('.ws-month-grid').getByText('分数复习安排')).toBeVisible();
  await page.getByRole('button', { name: '连接 LMS / 日历' }).click();
  await page.getByLabel('来源类型').selectOption('lms_ics');
  await page.getByLabel('或粘贴 ICS 文件内容').fill('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:school-1\nDTSTART:20261103T080000+0800\nDTEND:20261103T084500+0800\nSUMMARY:学校单元复习\nEND:VEVENT\nEND:VCALENDAR');
  await page.getByRole('button', { name: '连接并同步' }).click();
  await page.getByRole('button', {name:'下一个日期范围'}).click();
  await expect(page.locator('.ws-month-grid').getByText('学校单元复习')).toBeVisible();
  await expect(page.getByRole('button', { name: '连接并同步' })).toHaveCount(0);
  await page.locator('.ws-calendar-management > summary').click();
  await page.getByRole('button', { name: '＋ 生成诊断学习计划' }).click();
  await expect(page.getByLabel('计划目标')).toBeVisible();
  await page.getByRole('button', { name: '预览学习计划' }).click();
  await expect(page.getByText('审阅后再加入日历')).toBeVisible();
  await expect(page.getByText(/计划完成只表示执行过任务/)).toBeVisible();
  await page.getByRole('button', { name: '确认并加入日历' }).click();
  await expect(page.locator('.sa-plan-card')).toBeVisible();
  await page.locator('.sa-plan-actions').getByRole('button', { name: '完成', exact: true }).first().click();
  await expect(page.getByText('D+1 延迟复测', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/D\+14/).last()).toBeVisible();
  if (!process.env.CI) await page.screenshot({ path: browserEvidence('studio') + '/studio-calendar-polished.png', fullPage: true });

  const pdf = writeTextPdf();
  await page.getByRole('button', { name: 'Materials' }).click();
  await expect(page.getByRole('tab', { name: 'PDF 页级资料' })).toHaveAttribute('aria-selected', 'true');
  await page.locator('input[type=file]').setInputFiles(pdf.path);
  await expect(page.getByText('分数讲义', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => Boolean(document.querySelector('.sa-pdf-paper img') || document.querySelector('.sa-pdf-failed')),
    undefined, { timeout: 30_000 });
  if (await page.locator('.sa-pdf-failed').count())
    throw new Error('PDF processing failed: ' + await page.locator('.sa-pdf-failed').innerText());
  await expect(page.locator('.sa-pdf-paper img')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: '结构恢复' }).click();
  await expect(page.getByText('公式结构', { exact: true })).toBeVisible();
  await expect(page.getByText(/候选 LaTeX/)).toBeVisible();
  if (!process.env.CI) await page.screenshot({ path: browserEvidence('studio') + '/studio-pdf-structure-review.png', fullPage: true });
  await page.getByRole('button', { name: '已对照原页确认结构' }).click();
  await expect(page.getByText('结构已恢复')).toBeVisible();
  await page.getByRole('button', { name: '原版页面' }).click();
  const originalDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载原文件' }).click();
  expect((await originalDownload).suggestedFilename()).toMatch(/\.pdf$/);
  await page.getByRole('tab', { name: '个性化学案' }).click();
  await page.getByRole('button', { name: '生成学案预览' }).click();
  await expect(page.getByText('REVIEW BEFORE SAVING')).toBeVisible();
  await page.getByRole('button', { name: '保存到 Materials' }).click();
  await expect(page.locator('.sa-pack-library')).toContainText('个性化学案');
  if (!process.env.CI) await page.screenshot({ path: browserEvidence('studio') + '/studio-materials-and-pack.png', fullPage: true });
  pdf.cleanup();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/studio');
  await page.getByRole('button', { name: 'Materials' }).click();
  await page.getByRole('tab', { name: '个性化学案' }).click();
  await expect(page.locator('.sa-pack-layout')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'Calendar' }).click();
  await page.locator('.ws-calendar-management > summary').click();
  await expect(page.locator('.sa-plan-card')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.getByRole('button', { name: 'Home' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Craft Courses' })).toBeVisible();
  expect(errors).toEqual([]);
});

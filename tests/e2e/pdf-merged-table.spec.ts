import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserEvidence } from './evidence';

/** A real PDF with a two-column header and a two-row body cell. */
function mergedPdf() {
  const directory = mkdtempSync(join(tmpdir(), 'study-merged-'));
  const file = join(directory, '合并单元格讲义.pdf');
  const stream = '0.6 w 60 712 m 540 712 l S 60 662 m 540 662 l S 60 562 m 540 562 l S ' +
    '220 612 m 540 612 l S 60 712 m 60 562 l S 380 712 m 380 562 l S 540 712 m 540 562 l S 220 662 m 220 562 l S ' +
    'BT /F1 12 Tf 60 752 Td (Generated table: preserve the original row and column relationships.) Tj ET ' +
    ['70 682 (Group)', '390 682 (Total)', '70 632 (Shared)', '230 632 (10)', '390 632 (20)', '230 582 (30)', '390 582 (40)']
      .map(value => 'BT /F1 12 Tf ' + value.replace(' (', ' Td (') + ' Tj ET').join(' ');
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream'];
  let body = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((value, index) => { offsets.push(Buffer.byteLength(body)); body += `${index + 1} 0 obj\n${value}\nendobj\n`; });
  const xref = Buffer.byteLength(body); body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { body += String(offset).padStart(10, '0') + ' 00000 n \n'; });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  writeFileSync(file, body, 'ascii');
  return { file, cleanup() { unlinkSync(file); rmdirSync(directory); } };
}

test('native PDF preserves merged source cells through processing, confirmation and browser reload', async ({ page }) => {
  test.setTimeout(180_000);
  const api = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}`, suffix = crypto.randomUUID();
  const principal = 'merged-' + suffix, credential = 'Generated-merged-fixture-' + suffix;
  const registered = await fetch(api + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principal, credential }) });
  expect(registered.status).toBe(201); const auth = (await registered.json()).data;
  const response = await fetch(api + '/api/students', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + auth.token },
    body: JSON.stringify({ nickname: '合并结构验收', grade: 5, preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }) });
  expect(response.status).toBe(201); const studentId = (await response.json()).data.profile.id;
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/studio(?:\?|$)/);
  await page.goto('/studio?studentId=' + studentId + '&subject=math&view=materials&tab=personal');
  await page.getByRole('tab', { name: 'PDF页与结构', exact: true }).click();
  const pdf = mergedPdf();
  try {
    await page.getByLabel('上传资料 PDF', { exact: true }).setInputFiles(pdf.file);
    await expect(page.locator('.sa-pdf-paper img')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: '结构恢复', exact: true }).click();
    const table = page.locator('.sa-pdf-table-block table');
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(table.getByRole('columnheader', { name: 'Group', exact: true })).toHaveAttribute('colspan', '2');
      await expect(table.getByRole('cell', { name: 'Shared', exact: true })).toHaveAttribute('rowspan', '2');
      await expect(table.locator('th,td')).toHaveCount(7); await expect(table.locator('tr')).toHaveCount(3);
      for (const value of ['10', '20', '30', '40']) await expect(table.getByRole('cell', { name: value, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (!process.env.CI) await page.screenshot({ path: browserEvidence('pdf-merged-table') + '/merged-' + width + '.png', fullPage: true });
    }
    await page.getByRole('button', { name: '已对照原页确认结构', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: '结构恢复', exact: true }).click();
    await expect(table.getByRole('columnheader', { name: 'Group', exact: true })).toHaveAttribute('colspan', '2');
    await expect(table.getByRole('cell', { name: 'Shared', exact: true })).toHaveAttribute('rowspan', '2');
    expect(errors).toEqual([]);
  } finally { pdf.cleanup(); }
});

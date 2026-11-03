import { expect, test, type Page } from '@playwright/test';
import { browserEvidence } from './evidence';
const evidence = browserEvidence('operations-capabilities');
const titles = ['业务存储', '资料资产目录', 'AI 模型目录', '模型命令行工具', '课堂语音', 'Python 与 PDF 处理', '扫描页文字识别', '音视频处理', '课堂参考图', 'C++ 隔离执行', 'PDF / DOCX 导出'];
const ids = ['storage', 'assets', 'text_models', 'cli', 'speech', 'pdf', 'ocr', 'ffmpeg', 'image', 'cpp', 'paper_export'];
const report = () => ({ at: '2026-11-03T01:00:00.000Z', cacheSeconds: 30, scope: '工程合成的本地依赖状态；未调用生成。', checks: titles.map((title, i) => ({ id: ids[i], title,
  state: i === 0 ? 'ready' : i % 2 ? 'unavailable' : 'configured', optional: i !== 0,
  message: i === 0 ? '当前业务库已启用持久化。' : '这是一项可独立使用的可选能力。', repair: i % 2 ? '核对该项原配置，修复后重新检查。' : null })) });
async function enter(page: Page) {
  await page.goto('/parent/login?returnTo=%2Fadmin%2Fanalytics');
  await page.getByLabel('登录账号', { exact: true }).fill(process.env.E2E_ADMIN_PRINCIPAL || 'browser-admin');
  await page.getByLabel('密码', { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-admin-only-20261021');
  await page.getByRole('button', { name: '登录，查看学习记录 →', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/analytics$/);
  await expect(page.getByRole('button', { name: '检查工具与依赖', exact: true })).toBeVisible();
}
for (const width of [390, 768, 1440]) test(`operations capabilities: optional tools and recovery instructions at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  let calls = 0;
  await page.route('**/api/admin/operations/capabilities', async route => { calls++; await route.fulfill({ json: { data: report(), error: null } }); });
  await enter(page); expect(calls).toBe(0);
  const button = page.getByRole('button', { name: '检查工具与依赖', exact: true }); await button.focus(); await page.keyboard.press('Enter');
  const panel = page.getByRole('region', { name: '工具与依赖', exact: true });
  await expect(panel.getByRole('listitem')).toHaveCount(11);
  for (const title of titles) await expect(panel.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(panel.getByText('本地检查通过', { exact: true })).toBeVisible();
  await expect(panel.getByText('配置已读取', { exact: true }).first()).toBeVisible();
  await expect(panel.getByText('需处理', { exact: true }).first()).toBeVisible();
  await expect(panel.getByText('处理建议：核对该项原配置，修复后重新检查。', { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await expect(page.getByRole('region', { name: '运行与待办监控', exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await page.screenshot({ path: `${evidence}/dependencies-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: '重新检查依赖', exact: true }).click(); await expect(panel.getByRole('listitem')).toHaveCount(11); expect(calls).toBe(2);
});
test('operations capabilities: network failure preserves metrics and explicit retry recovers', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/admin/operations/capabilities', async route => { if (++calls === 1) await route.abort('failed'); else await route.fulfill({ json: { data: report(), error: null } }); });
  await enter(page); await page.getByRole('button', { name: '检查工具与依赖', exact: true }).click();
  const panel = page.getByRole('region', { name: '工具与依赖', exact: true });
  await expect(panel.getByRole('alert')).toContainText('暂时无法连接');
  await expect(page.getByRole('region', { name: '运行与待办监控', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '检查工具与依赖', exact: true }).click();
  await expect(panel.getByRole('listitem')).toHaveCount(11);
  await expect(panel.getByRole('alert')).toHaveCount(0);
});
test('operations analytics: late original refresh cannot replace the newer response', async ({ page }) => {
  let release!: () => void, arrived!: () => void, calls = 0;
  const waiting = new Promise<void>(resolve => { release = resolve; }), firstSeen = new Promise<void>(resolve => { arrived = resolve; });
  const payload = (count: number) => ({ data: { studentCount: count, activeParentCount: 0, textbookVolumeCount: 0, knowledgePointCount: 0,
    publishedQuestionCount: 0, completedAssessmentCount: 0, completedMissionCount: 0, activeStudyPlanCount: 0, aiInsightCount: 0 }, error: null });
  await page.route('**/api/admin/analytics/overview', async route => {
    const order = ++calls; if (order === 1) { arrived(); await waiting; }
    await route.fulfill({ json: payload(order === 1 ? 711 : 722) }).catch(() => {});
  });
  await enter(page); await firstSeen;
  await page.getByRole('button', { name: '刷新指标', exact: true }).click();
  await expect(page.getByText('722', { exact: true })).toBeVisible();
  release(); await expect(page.getByText('711', { exact: true })).toHaveCount(0);
  await expect(page.getByText('722', { exact: true })).toBeVisible();
});

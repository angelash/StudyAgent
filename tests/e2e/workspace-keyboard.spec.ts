import { expect, test, type Page } from '@playwright/test';
import { syntheticFamilyHeaders } from './synthetic-family';

const api = 'http://localhost:' + (process.env.E2E_API_PORT ?? '4107') + '/api';
const entries = ['首页', '课程', '学习任务', '知识诊断', '学习报告', '学习动态', '历史', '资料', 'AI白板'];

async function parent(page: Page) {
  const headers = await syntheticFamilyHeaders(page), nonce = crypto.randomUUID(), principal = 'keyboard-parent-' + nonce + '@local.test', credential = 'Keyboard-QA-' + nonce;
  const post = async (path: string, body: unknown, token?: string) => { const response = await fetch(api + path, { method: 'POST', headers: { ...headers, ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }); const value = await response.json(); expect(response.ok, path).toBe(true); return value.data; };
  const actor = await post('/auth/register', { principal, credential });
  const child = (await post('/students', { nickname: '键盘合成档案', grade: 4, preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }, actor.token)).profile;
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录，查看学习记录 →', exact: true }).click(); await expect(page).not.toHaveURL(/\/parent\/login/);
  return child.id as string;
}
/** Describes the focused element: its accessible label or text, whether it sits in the sidebar, and its visible focus indicator. */
const focused = (page: Page) => page.evaluate(() => {
  const element = document.activeElement as HTMLElement | null, style = element ? getComputedStyle(element) : null;
  return { label: element?.getAttribute('aria-label') ?? element?.textContent?.trim() ?? '', visibleText: element?.querySelector('.button-label')?.textContent?.trim() ?? null,
    inSidebar: Boolean(element?.closest('[aria-label="学习工作台导航"]')), inMain: Boolean(element?.closest('main section, .workspace-page')),
    ring: Boolean(style && ((style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none')) };
});

test('keyboard: every sidebar entry is reached by Tab with a visible focus ring, is named as shown and opens with Enter', async ({ page }) => {
  const childId = await parent(page); await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/studio/profiles?' + new URLSearchParams({ studentId: childId, subject: 'math' })); await expect(page.getByRole('heading', { name: '学习档案', level: 1 })).toBeVisible();
  const reached = new Map<string, Awaited<ReturnType<typeof focused>>>();
  for (let step = 0; step < 90 && reached.size < entries.length + 2; step++) { await page.keyboard.press('Tab'); const state = await focused(page); if (state.inSidebar && [...entries, '学习档案', '账号与设置'].includes(state.label)) reached.set(state.label, state); }
  expect([...reached.keys()].sort()).toEqual([...entries, '学习档案', '账号与设置'].sort());
  for (const [label, state] of reached) { expect(state.ring, label + ' shows a focus ring').toBe(true); if (state.visibleText !== null) expect(state.visibleText, label + ' is named as shown').toBe(label); }
  await page.getByRole('navigation', { name: '工作台主要入口' }).getByRole('link', { name: '学习报告', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/studio\/reports\?/); await expect(page.getByRole('heading', { name: '学习报告', level: 1 })).toBeVisible();
});

test('keyboard: the phone drawer opens from the keyboard, keeps Tab inside and returns focus on Escape', async ({ page }) => {
  await parent(page); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/studio/settings'); await expect(page.getByRole('heading', { name: '账号与设置', level: 1 })).toBeVisible();
  const trigger = page.getByRole('button', { name: '打开学习导航', exact: true }); await trigger.focus(); await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: '学习工作台导航', exact: true }); await expect(drawer).toBeVisible();
  for (const key of [...Array(24).fill('Tab'), ...Array(6).fill('Shift+Tab')]) { await page.keyboard.press(key); const state = await focused(page); expect(state.inSidebar, key + ' keeps focus inside the drawer at ' + state.label).toBe(true); expect(state.ring, state.label + ' shows a focus ring').toBe(true); }
  await page.keyboard.press('Escape'); await expect(drawer).toHaveCount(0); await expect(trigger).toBeFocused();
});

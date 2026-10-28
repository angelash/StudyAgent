# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: reference-navigation.spec.ts >> reference navigation: resizing an open drawer restores usable desktop controls and releases the original background
- Location: tests\e2e\reference-navigation.spec.ts:56:5

# Error details

```
TimeoutError: locator.fill: Timeout 15000ms exceeded.
Call log:
  - waiting for getByLabel('登录账号')
    - locator resolved to <input disabled value="" required="" minlength="3" maxlength="254" placeholder="账号或邮箱" autocomplete="username"/>
    - fill("navigation-16ed6027-d484-4aa4-9b58-a559ee4ba9d7@local.test")
  - attempting fill action
    2 × waiting for element to be visible, enabled and editable
      - element is not enabled
    - retrying fill action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and editable
      - element is not enabled
    - retrying fill action
      - waiting 100ms
    29 × waiting for element to be visible, enabled and editable
       - element is not enabled
     - retrying fill action
       - waiting 500ms

```

# Page snapshot

```yaml
- main [ref=e2]:
  - complementary [ref=e3]:
    - link "学 学习观察室" [ref=e4] [cursor=pointer]:
      - /url: /
      - generic [ref=e5]: 学
      - text: 学习观察室
    - generic [ref=e6]:
      - generic [ref=e7]: FAMILY / 每一步，都看得见
      - heading [level=1] [ref=e8]:
        - text: 先看见孩子，
        - emphasis [ref=e9]: 怎样学会。
      - paragraph [ref=e10]: 从一个具体知识点开始，找到卡住的一步，再通过新题和时间，看看是否真的留下来。
    - link "孩子自己来学习？使用学习码进入 ↗" [ref=e11] [cursor=pointer]:
      - /url: /student/login
  - generic [ref=e12]:
    - generic [ref=e13]: 家长与教师入口
    - heading "继续孩子的学习旅程。" [level=2] [ref=e14]
    - paragraph [ref=e15]: 登录后查看孩子的知识证据、指导计划和复测记录。
    - generic [ref=e16]:
      - generic [ref=e17]:
        - text: 登录账号
        - textbox "登录账号" [disabled] [ref=e18]:
          - /placeholder: 账号或邮箱
      - generic [ref=e19]:
        - text: 密码
        - textbox "密码" [disabled] [ref=e20]:
          - /placeholder: 至少 10 个字符
      - button "登录，查看学习记录 →" [disabled] [ref=e21]
    - button "首次使用，创建家长账号" [disabled] [ref=e22]
    - paragraph [ref=e23]: 教师与教研权限由管理员配置。孩子使用家长生成的一次性学习码。
```

# Test source

```ts
  1  | import { expect, test, type Page } from '@playwright/test';
  2  | import { createHash } from 'node:crypto';
  3  | import { browserEvidence } from './evidence';
  4  | const api = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}/api`, evidence = browserEvidence('reference-navigation');
  5  | async function enter(page: Page, width: number) {
  6  |   await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  7  |   const nonce = crypto.randomUUID(), principal = 'navigation-' + nonce + '@local.test', credential = 'Nav-QA-' + nonce;
  8  |   const hash = createHash('sha256').update(test.info().testId).digest(), address = '198.20.' + hash[0] + '.' + hash[1];
  9  |   await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address });
  10 |   const registered = await fetch(api + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Forwarded-For': address }, body: JSON.stringify({ principal, credential }) });
  11 |   expect(registered.status).toBe(201); const actor = (await registered.json()).data;
  12 |   await page.addInitScript(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
> 13 |   await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
     |                                                                   ^ TimeoutError: locator.fill: Timeout 15000ms exceeded.
  14 |   await page.getByRole('button', { name: '登录，查看学习记录 →' }).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  15 |   await page.goto('/studio/classroom'); await expect(page.getByRole('heading', { name: '社会学概论', exact: true })).toBeVisible();
  16 |   return actor;
  17 | }
  18 | for (const width of [390, 768, 1280, 1440]) test(`reference navigation: truthful empty history, actual navigation and complete compact or modal controls at ${width}`, async ({ page }) => {
  19 |   await enter(page, width);
  20 |   if (width <= 1000) await page.getByRole('button', { name: '打开学习导航', exact: true }).click();
  21 |   const sidebar = page.getByLabel('学习工作台导航', { exact: true }); await expect(sidebar).toBeVisible();
  22 |   await expect(sidebar.getByRole('region', { name: '开始学习', exact: true })).toContainText('打开课程');
  23 |   await expect(sidebar.getByRole('region', { name: '继续学习', exact: true })).toHaveCount(0);
  24 |   if (width <= 1000) {
  25 |     await expect(sidebar).toHaveAttribute('aria-modal', 'true');
  26 |     const row = sidebar.getByRole('link', { name: 'Courses', exact: true }), icon = await row.locator('svg').boundingBox(), label = await row.locator('.button-label').boundingBox();
  27 |     expect(label!.x, 'the open drawer keeps the icon and complete label in one horizontal row').toBeGreaterThan(icon!.x + icon!.width);
  28 |     expect(Math.abs(label!.y + label!.height / 2 - icon!.y - icon!.height / 2)).toBeLessThanOrEqual(4);
  29 |     expect(await page.locator('.cl-course-layout').evaluate(node => Boolean(node.closest('[inert]')))).toBe(true);
  30 |     await page.keyboard.press('Shift+Tab'); expect(await sidebar.evaluate(node => node.contains(document.activeElement))).toBe(true);
  31 |     await page.screenshot({ path: evidence + '/navigation-' + width + '.png', fullPage: true });
  32 |     await page.keyboard.press('Escape'); await expect(sidebar).toHaveCount(0);
  33 |     await expect(page.getByRole('button', { name: '打开学习导航', exact: true })).toBeFocused();
  34 |     expect(await page.locator('.cl-course-layout').evaluate(node => Boolean(node.closest('[inert]')))).toBe(false);
  35 |     await page.getByRole('button', { name: '打开学习导航', exact: true }).click();
  36 |   } else {
  37 |     expect((await sidebar.boundingBox())!.width).toBe(240);
  38 |     await sidebar.getByRole('button', { name: '收起学习导航', exact: true }).click(); await expect(sidebar).toHaveCSS('width', '60px');
  39 |     await expect(sidebar.getByRole('link', { name: 'Courses', exact: true })).toBeVisible();
  40 |     await page.reload(); await expect(page.getByRole('button', { name: '展开学习导航', exact: true })).toBeVisible();
  41 |     await page.getByRole('button', { name: '展开学习导航', exact: true }).click();
  42 |     await page.screenshot({ path: evidence + '/navigation-' + width + '.png', fullPage: true });
  43 |   }
  44 |   await sidebar.getByRole('link', { name: 'Courses', exact: true }).click(); await expect(page.getByRole('heading', { name: '我的课程', exact: true })).toBeVisible();
  45 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  46 | });
  47 | test('reference navigation: a real saved classroom opens the exact original session and position from the course library', async ({ page }) => {
  48 |   await enter(page, 1280); await page.getByRole('button', { name: '▶ 学习', exact: true }).first().click();
  49 |   await page.getByRole('button', { name: '下一步 ›', exact: true }).click(); await expect(page.locator('.cl-session-navigation')).toContainText('2 / 8');
  50 |   const original = new URL(page.url()).searchParams.get('session');
  51 |   await page.getByRole('button', { name: '离开课堂', exact: true }).click(); await page.getByRole('button', { name: '保存并离开', exact: true }).click();
  52 |   await page.goto('/studio?view=courses'); const resume = page.getByRole('region', { name: '继续学习', exact: true }); await expect(resume).toContainText('社会学想象力');
  53 |   await resume.getByRole('link').click(); await expect(page.locator('.cl-session-navigation')).toContainText('2 / 8');
  54 |   expect(new URL(page.url()).searchParams.get('session')).toBe(original);
  55 | });
  56 | test('reference navigation: resizing an open drawer restores usable desktop controls and releases the original background', async ({ page }) => {
  57 |   await enter(page, 768); await page.getByRole('button', { name: '打开学习导航', exact: true }).click();
  58 |   await expect(page.getByRole('dialog', { name: '学习工作台导航', exact: true })).toBeVisible(); await page.setViewportSize({ width: 1280, height: 900 });
  59 |   await expect(page.getByRole('dialog', { name: '学习工作台导航', exact: true })).toHaveCount(0);
  60 |   await expect(page.getByRole('button', { name: '收起学习导航', exact: true })).toBeVisible();
  61 |   expect(await page.locator('.cl-course-layout').evaluate(node => Boolean(node.closest('[inert]')))).toBe(false);
  62 |   expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  63 |   await page.getByRole('tab', { name: '练习', exact: true }).click(); await expect(page.getByRole('tabpanel', { name: '练习', exact: true })).toBeVisible();
  64 | });
  65 | test('reference navigation: blocked preference storage keeps current controls usable without inventing a saved preference', async ({ page }) => {
  66 |   await enter(page, 1280);
  67 |   await page.addInitScript(() => {
  68 |     const read = Storage.prototype.getItem, write = Storage.prototype.setItem;
  69 |     Storage.prototype.getItem = function (key) { if (key.startsWith('studyagent.navigation.compact.')) throw new Error('Synthetic unavailable navigation preferences'); return read.call(this, key); };
  70 |     Storage.prototype.setItem = function (key, value) { if (key.startsWith('studyagent.navigation.compact.')) throw new Error('Synthetic unavailable navigation preferences'); return write.call(this, key, value); };
  71 |   });
  72 |   await page.reload(); const sidebar = page.getByLabel('学习工作台导航', { exact: true });
  73 |   await sidebar.getByRole('button', { name: '收起学习导航', exact: true }).click(); await expect(sidebar).toHaveCSS('width', '60px');
  74 |   await sidebar.getByRole('button', { name: '展开学习导航', exact: true }).click(); await expect(sidebar).toHaveCSS('width', '240px');
  75 |   await page.reload(); await expect(sidebar.getByRole('button', { name: '收起学习导航', exact: true })).toBeVisible();
  76 | });
  77 | test('reference navigation: a mobile drawer hands focus to the real course blueprint and returns to its menu trigger after closing', async ({ page }) => {
  78 |   await enter(page, 390); await page.goto('/studio?view=courses'); await expect(page.getByRole('heading', { name: '我的课程', exact: true })).toBeVisible();
  79 |   const trigger = page.getByRole('button', { name: '打开学习导航', exact: true }); await trigger.click();
  80 |   await page.getByRole('dialog', { name: '学习工作台导航', exact: true }).getByRole('button', { name: '＋ 创建课程', exact: true }).click();
  81 |   const blueprint = page.getByRole('dialog', { name: '课程蓝图', exact: true }); await expect(blueprint).toBeVisible();
  82 |   await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  83 |   expect(await blueprint.evaluate(node => node.contains(document.activeElement))).toBe(true);
  84 |   await page.keyboard.press('Tab'); expect(await blueprint.evaluate(node => node.contains(document.activeElement))).toBe(true);
  85 |   await page.keyboard.press('Escape'); await expect(blueprint).toHaveCount(0); await expect(trigger).toBeFocused();
  86 |   expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  87 | });
  88 | 
```
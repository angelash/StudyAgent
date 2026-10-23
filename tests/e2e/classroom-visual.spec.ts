import { expect, test, type Page } from '@playwright/test';
import { browserEvidence } from './evidence';
const api = `http://localhost:${process.env.E2E_API_PORT ?? 4107}`, evidence = browserEvidence('classroom-visual');
let fixtureAddress = 0;
async function enter(page: Page) {
    const suffix = Date.now() + '-' + Math.floor(Math.random() * 100000), principal = 'visual-' + suffix + '@local.test', credential = 'Visual-only-' + suffix;
    // Only the isolated loopback fixture trusts this header. Each new QA learner gets its own registration bucket.
    expect((await fetch(api + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.22.0.' + (++fixtureAddress) }, body: JSON.stringify({ principal, credential }) })).status).toBe(201);
    await page.addInitScript(() => localStorage.setItem('studyagent.classroom.tour', 'done'));
    await page.goto('/parent/login');
    await page.getByLabel('登录账号').fill(principal);
    await page.getByLabel('密码').fill(credential);
    await page.getByRole('button', { name: '登录，查看学习记录 →' }).click();
    await expect(page).toHaveURL(/\/learn(?:\?|$)/);
    await page.goto('/studio/classroom?lesson=soc-1-1-1');
    await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
    await expect(page.locator('.cl-session-navigation')).toContainText('2 / 8');
}
const panel = (page: Page) => page.getByRole('dialog', { name: '当前讲解参考图', exact: true });
async function open(page: Page) { await page.getByRole('button', { name: '补一张讲解图', exact: true }).click(); await expect(panel(page)).toBeVisible(); }
async function generate(page: Page, requirements: string) { await panel(page).getByLabel('参考图补充要求').fill(requirements); await panel(page).getByRole('button', { name: /^(生成讲解参考图|再生成一版)$/ }).click(); }
async function ready(page: Page) { await expect(panel(page).getByRole('button', { name: '选作当前环节参考', exact: true }).last()).toBeVisible({ timeout: 45000 }); }
async function close(page: Page) { await panel(page).getByRole('button', { name: '关闭讲解参考图', exact: true }).click(); await expect(panel(page)).toHaveCount(0); }
test('classroom image survives navigation, binds its original node, enlarges and exports offline notes at three widths', async ({ page }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await enter(page);
    await open(page);
    await generate(page, '[image-pause-once] 匿名生活场景，减少图内文字。');
    await expect(panel(page).locator('.cl-visual-candidate')).toHaveCount(1);
    await close(page);
    for (let i = 0; i < 2; i++)
        await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
    await expect(page.locator('.cl-session-navigation')).toContainText('4 / 8');
    await page.reload();
    await expect(page.locator('.cl-session-navigation')).toContainText('4 / 8');
    await expect(page.locator('.cl-board-step .cl-generated-figure')).toHaveCount(0);
    for (let i = 0; i < 2; i++)
        await page.getByRole('button', { name: '‹ 上一步', exact: true }).click();
    await expect(page.locator('.cl-session-navigation')).toContainText('2 / 8');
    await open(page);
    await ready(page);
    for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await expect(panel(page).locator('.cl-generated-open img')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        const box = await panel(page).boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
        if (!process.env.CI)
            await page.screenshot({ path: evidence + '/candidate-' + width + '.png', fullPage: true });
        await panel(page).getByRole('button', { name: '选作当前环节参考', exact: true }).scrollIntoViewIfNeeded();
        await expect(panel(page).getByRole('button', { name: '关闭讲解参考图', exact: true })).toBeVisible();
        if (!process.env.CI)
            await page.screenshot({ path: evidence + '/candidate-actions-' + width + '.png', fullPage: true });
        await panel(page).evaluate(element => { element.scrollTop = 0; });
    }
    const enlarge = panel(page).getByRole('button', { name: /放大参考图/ });
    await enlarge.click();
    await expect(page.getByRole('dialog', { name: '讲解参考图大图', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(enlarge).toBeFocused();
    await expect(panel(page)).toBeVisible();
    await panel(page).getByRole('button', { name: '选作当前环节参考', exact: true }).click();
    await expect(panel(page).getByRole('button', { name: '暂不使用这张图', exact: true })).toBeVisible();
    await close(page);
    await expect(page.getByRole('button', { name: '补一张讲解图', exact: true })).toBeFocused();
    const selected = page.locator('.cl-board-step[data-current="true"] .cl-generated-figure');
    await expect(selected).toHaveCount(1);
    await expect(selected.locator('img')).toBeVisible();
    if (!process.env.CI)
        await page.screenshot({ path: evidence + '/selected-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出课堂笔记', exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/含参考图\.html$/);
    const stream = await file.createReadStream();
    let html = '';
    for await (const chunk of stream!)
        html += chunk.toString();
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('标注仍需核对');
    expect(html).not.toMatch(/src="blob:/);
    await page.getByRole('button', { name: '下一步 ›', exact: true }).click();
    await expect(page.locator('.cl-board-step[data-current="true"] .cl-generated-figure')).toHaveCount(0);
    await expect(page.locator('.cl-board-step .cl-generated-figure')).toHaveCount(1);
    await page.getByRole('button', { name: '‹ 上一步', exact: true }).click();
    await open(page);
    await panel(page).getByRole('button', { name: '删除这个版本', exact: true }).click();
    await expect(panel(page).locator('.cl-visual-candidate')).toHaveCount(0);
    await close(page);
    await expect(page.locator('.cl-board-step .cl-generated-figure')).toHaveCount(0);
    expect(errors).toEqual([]);
});
test('failed and cancelled classroom image tasks retry their saved version', async ({ page }) => {
    test.setTimeout(120000);
    await enter(page);
    await open(page);
    await generate(page, '[image-fail-once] 失败恢复验证。');
    await expect(panel(page).getByText('生成未完成', { exact: true })).toBeVisible();
    await panel(page).getByRole('button', { name: '重试图片任务', exact: true }).click();
    await ready(page);
    await expect(panel(page).locator('.cl-visual-candidate')).toHaveCount(1);
    await generate(page, '[image-pause-once] 取消恢复验证。');
    await expect(panel(page).locator('.cl-visual-candidate')).toHaveCount(2);
    await panel(page).getByRole('button', { name: '取消生成', exact: true }).click();
    await expect(panel(page).getByText('生成已取消', { exact: true })).toBeVisible();
    await page.reload();
    await open(page);
    await expect(panel(page).getByText('生成已取消', { exact: true })).toBeVisible();
    await panel(page).getByRole('button', { name: '重试图片任务', exact: true }).click();
    await expect(panel(page).getByRole('button', { name: '选作当前环节参考', exact: true })).toHaveCount(2, { timeout: 45000 });
    await expect(panel(page).locator('.cl-visual-candidate')).toHaveCount(2);
});
test('lost image creation acknowledgement recovers the single saved task', async ({ page }) => {
    test.setTimeout(90000);
    await enter(page);
    await open(page);
    let intercepted = false;
    await page.route('**/api/learning/classroom/sessions/*/visuals', async (route) => { if (route.request().method() !== 'POST' || intercepted)
        return route.continue(); intercepted = true; await route.fetch(); await route.abort('failed'); });
    await generate(page, '[image-pause-once] 回执丢失验证。');
    await expect(panel(page).getByRole('alert')).toBeVisible();
    await panel(page).getByRole('button', { name: '读取已保存状态', exact: true }).click();
    await expect(panel(page).locator('.cl-visual-candidate')).toHaveCount(1);
    await expect(panel(page).getByRole('alert')).toHaveCount(0);
    await ready(page);
    await page.reload();
    await open(page);
    await expect(panel(page).locator('.cl-visual-candidate')).toHaveCount(1);
    await expect(panel(page).getByRole('button', { name: '选作当前环节参考', exact: true })).toBeVisible();
});

test('PDF preparation waits for selected image bytes and closing settings cancels a pending print',async({page})=>{
    test.setTimeout(90000);await enter(page);await open(page);await generate(page,'打印完整性验证。');await ready(page);await panel(page).getByRole('button',{name:'选作当前环节参考',exact:true}).click();await close(page);
    for(const cancel of [true,false]){
        let release!:()=>void,requests=0;const held=new Promise<void>(resolve=>{release=resolve;}),pattern='**/api/learning/classroom/sessions/*/visuals/*/file';
        await page.route(pattern,async route=>{requests++;await held;await route.continue();});await page.reload();await expect.poll(()=>requests).toBeGreaterThan(0);
        await page.evaluate(()=>{Object.assign(window,{__qaPrintCalls:0,print:()=>{(window as unknown as {__qaPrintCalls:number}).__qaPrintCalls++;}});});
        await page.getByRole('button',{name:'课堂设置',exact:true}).click();await page.getByRole('button',{name:'打印 / 保存 PDF 笔记',exact:true}).click();await expect(page.getByRole('button',{name:'正在准备参考图…',exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as unknown as {__qaPrintCalls:number}).__qaPrintCalls)).toBe(0);
        if(cancel)await page.getByRole('button',{name:'关闭课堂设置',exact:true}).click();release();
        const image=page.locator('.cl-print-notes .cl-generated-figure img');await expect(image).toHaveCount(1);await expect.poll(()=>image.evaluate(element=>(element as HTMLImageElement).complete&&(element as HTMLImageElement).naturalWidth>0)).toBe(true);
        if(cancel)expect(await page.evaluate(()=>(window as unknown as {__qaPrintCalls:number}).__qaPrintCalls)).toBe(0);
        else{await expect.poll(()=>page.evaluate(()=>(window as unknown as {__qaPrintCalls:number}).__qaPrintCalls)).toBe(1);await expect(page.getByRole('dialog',{name:'课堂设置',exact:true})).toHaveCount(0);}
        await page.unroute(pattern);
    }
});

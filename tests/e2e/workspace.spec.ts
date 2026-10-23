import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const api = `http://localhost:${process.env.E2E_API_PORT ?? '4107'}/api`;
const evidence = 'doc/evidence/2026-10-23';
async function account(page: Page, child = false) {
  const key = `${Date.now()}-${Math.floor(Math.random() * 100000)}`, principal = `workspace-${key}@local.test`, credential = `Workspace-${key}`;
  const response = await fetch(api + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({principal, credential}) });
  expect(response.status).toBe(201); const {data} = await response.json();
  const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + data.token };
  let studentId = '';
  if (child) {
    const result = await fetch(api + '/students', {method:'POST',headers,body:JSON.stringify({nickname:'日历整改验收',grade:5,preferredSessionMinutes:15,defaultVersionMap:{math:'common',chinese:'common',english:'common'}})});
    expect(result.status).toBe(201); studentId = (await result.json()).data.profile.id;
  }
  await page.goto('/parent/login'); await page.getByLabel('登录账号').fill(principal); await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', {name:'登录，查看学习记录 →'}).click(); await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  await page.evaluate(() => localStorage.setItem('studyagent.classroom.tour','done'));
  return {studentId, headers};
}
async function screenshot(page: Page, name: string) { if (!process.env.CI) { mkdirSync(evidence,{recursive:true}); await page.screenshot({path:`${evidence}/${name}.png`,fullPage:true}); } }

test('course library and outline preserve navigation, panels, help and classroom back/forward', async ({page}) => {
  test.setTimeout(100000); const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1645,height:954}); await account(page); await page.goto('/studio?view=courses');
  await expect(page.getByRole('heading',{name:'我的课程'})).toBeVisible();
  await expect(page.getByRole('link',{name:'打开课程：社会学概论'})).toBeVisible();
  await screenshot(page,'workspace-courses-desktop');
  await page.getByLabel('搜索课程').fill('不存在的课程');await expect(page.getByText('没有匹配的课程')).toBeVisible();
  await page.getByRole('button',{name:'查看全部课程'}).click();await page.getByRole('tab',{name:'已完成',exact:true}).click();await expect(page.getByText('还没有完成的课程')).toBeVisible();
  await page.getByRole('button',{name:'查看全部课程'}).click();await page.getByRole('link',{name:'打开课程：社会学概论'}).click();
  await expect(page.locator('.cl-unit-nav button')).toHaveCount(5);await screenshot(page,'workspace-outline-desktop');
  await page.locator('.cl-unit-nav button').nth(2).click();await page.getByRole('tab',{name:'资料',exact:true}).click();
  await page.reload();await expect(page.getByRole('tab',{name:'资料',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('.cl-unit-nav button').nth(2)).toHaveAttribute('data-active','true');
  await page.getByRole('tab',{name:'单元',exact:true}).click();await page.getByRole('button',{name:/查看学习目标：/}).first().click();
  await expect(page.getByRole('dialog',{name:'微课学习目标'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.cl-learn').first().click();await expect(page.locator('.cl-room')).toBeVisible();await expect(page).toHaveURL(/lesson=/);
  await page.goBack();await expect(page.locator('.cl-unit-nav button').nth(2)).toHaveAttribute('data-active','true');
  await page.goForward();await expect(page.locator('.cl-room')).toBeVisible();
  await page.getByRole('button',{name:'离开课堂',exact:true}).click();await page.getByRole('button',{name:'保存并离开'}).click();
  await expect(page.locator('.cl-unit-nav button').nth(2)).toHaveAttribute('data-active','true');
  await page.getByRole('button',{name:'获取帮助',exact:true}).first().click();await expect(page.getByLabel('向课堂老师提问')).toHaveValue(/我正在学习/);
  await page.goBack();await page.setViewportSize({width:390,height:844});await expect(page.locator('.cl-unit-nav')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await screenshot(page,'workspace-outline-mobile');
  await page.locator('.ws-navigation').getByRole('link',{name:'Courses',exact:true}).click();await expect(page.getByRole('heading',{name:'我的课程'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await screenshot(page,'workspace-courses-mobile');
  expect(errors).toEqual([]);
});

test('calendar supports real date navigation, edit, confirmation, completion, export and batch lifecycle',async({page})=>{
  test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1645,height:954});const {studentId}=await account(page,true);
  await page.goto(`/studio?view=calendar&student=${studentId}&subject=math&date=2026-10-23`);
  await expect(page.locator('.ws-calendar-day')).toHaveCount(35);await screenshot(page,'workspace-calendar-empty-desktop');
  await page.getByRole('button',{name:'周视图',exact:true}).click();await expect(page.locator('.ws-calendar-day')).toHaveCount(7);
  await page.getByRole('button',{name:'下一个日期范围'}).click();await expect(page).toHaveURL(/date=2026-10-30/);
  await page.getByRole('button',{name:'上一个日期范围'}).click();await page.getByRole('button',{name:'月视图',exact:true}).click();await page.reload();
  await expect(page.getByRole('button',{name:'选择日期 2026-10-23'})).toHaveAttribute('aria-pressed','true');
  async function create(title:string){await page.getByRole('button',{name:'＋ 新建学习安排'}).click();await page.getByLabel('任务名称').fill(title);await page.getByLabel('开始时间').fill('2026-10-23T16:00');await page.getByRole('button',{name:'加入学习日历'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.ws-month-grid').getByText(title,{exact:false})).toBeVisible();}
  await create('整改任务甲');await create('整改任务乙');
  await page.locator('.ws-month-grid').getByRole('button',{name:/整改任务甲/}).click();await page.getByRole('button',{name:'编辑时间与内容'}).click();
  await page.getByLabel('任务名称').fill('跨月移动后的任务');await page.getByLabel('开始时间').fill('2026-11-03T10:00');await page.getByLabel('结束时间').fill('2026-11-03T10:40');await page.getByRole('button',{name:'保存修改'}).click();
  await expect(page.getByRole('dialog')).toContainText('跨月移动后的任务');await page.keyboard.press('Escape');
  await expect(page.locator('.ws-month-grid').getByText('整改任务甲',{exact:false})).toHaveCount(0);
  await page.getByRole('button',{name:'下一个日期范围'}).click();await page.locator('.ws-month-grid').getByRole('button',{name:/跨月移动后的任务/}).click();
  await page.getByRole('button',{name:'移至待处理'}).click();await expect(page.getByRole('dialog')).toContainText('待处理');await page.keyboard.press('Escape');
  await expect(page.locator('.ws-month-grid').getByText('跨月移动后的任务',{exact:false})).toHaveCount(0);
  await page.getByRole('tab',{name:'待处理任务'}).click();await page.locator('.ws-month-grid').getByRole('button',{name:/跨月移动后的任务/}).click();
  await page.getByRole('button',{name:'确认安排',exact:true}).click();await page.keyboard.press('Escape');await page.getByRole('tab',{name:'已确认任务'}).click();
  await page.locator('.ws-month-grid').getByRole('button',{name:/跨月移动后的任务/}).click();await page.getByRole('button',{name:'标记完成'}).click();
  await expect(page.getByRole('dialog')).toContainText('已完成');await page.getByRole('button',{name:'重新打开',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('已确认');await page.keyboard.press('Escape');
  await page.reload();await expect(page.locator('.ws-month-grid').getByText('跨月移动后的任务',{exact:false})).toBeVisible();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出 ICS',exact:true}).click();expect((await download).suggestedFilename()).toMatch(/\.ics$/);
  await page.getByRole('button',{name:'上一个日期范围'}).click();await page.getByRole('button',{name:'批量删除日程'}).click();await page.getByLabel('选择当前范围的手动安排').check();
  await page.getByRole('button',{name:'下一个日期范围'}).click();await expect(page.getByRole('button',{name:'删除所选'})).toBeDisabled();
  await page.getByRole('button',{name:'上一个日期范围'}).click();await page.getByLabel('选择当前范围的手动安排').check();await page.getByRole('button',{name:'删除所选'}).click();
  await expect(page.getByRole('dialog',{name:'确认删除学习安排'})).toBeVisible();await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.locator('.ws-month-grid').getByText('整改任务乙',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'删除所选'}).click();await page.getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.ws-month-grid').getByText('整改任务乙',{exact:false})).toHaveCount(0);
  await page.getByRole('button',{name:'下一个日期范围'}).click();await expect(page.locator('.ws-month-grid').getByText('跨月移动后的任务',{exact:false})).toBeVisible();
  await screenshot(page,'workspace-calendar-tasks-desktop');
  await page.getByLabel('学科',{exact:true}).selectOption('english');await expect(page.locator('.ws-month-grid').getByText('跨月移动后的任务',{exact:false})).toHaveCount(0);await page.reload();await expect(page.getByLabel('学科',{exact:true})).toHaveValue('english');
  await page.getByLabel('学科',{exact:true}).selectOption('math');await page.getByRole('button',{name:'下一个日期范围'}).click();await expect(page.locator('.ws-month-grid').getByText('跨月移动后的任务',{exact:false})).toBeVisible();
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await screenshot(page,'workspace-calendar-mobile');
  expect(errors).toEqual([]);
});

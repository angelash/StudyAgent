import { test,expect,type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fixture } from './assistant-practice-fixture';
import { browserEvidence } from './evidence';

const evidence=browserEvidence('calendar-boundary');
async function block(page:Page,f:Awaited<ReturnType<typeof fixture>>,day:number,subject='math') {
 const times=await page.evaluate(value=>({startsAt:new Date('2099-04-0'+value+'T09:55:00').toISOString(),endsAt:new Date('2099-04-0'+value+'T10:30:00').toISOString()}),day);
 return f.call('/learning/studio/calendar/events',{studentId:f.child.id,subject,title:'合成已确认忙碌时段',description:'只用于检查原日历冲突与确认，不代表学习证据。',...times,requestKey:crypto.randomUUID()});
}
async function planner(page:Page,f:Awaited<ReturnType<typeof fixture>>) {
 await page.goto('/studio?'+new URLSearchParams({student:f.child.id,subject:'math',view:'calendar',date:'2099-04-05'}));
 await page.locator('.ws-calendar-management > summary').click();await page.getByRole('button',{name:'＋ 生成诊断学习计划',exact:true}).click();
 await page.getByRole('textbox',{name:'计划目标',exact:true}).fill('完整保留原目标：核对条件和单位，避开已经确认的时间。');
 await page.getByLabel('目标日期',{exact:true}).fill('2099-04-07');await page.getByLabel('首次开始',{exact:true}).fill('2099-04-05T10:00');
 await page.getByRole('combobox',{name:'每次时长',exact:true}).selectOption('15');await page.getByRole('button',{name:'预览学习计划',exact:true}).click();
 await expect(page.getByText('审阅后再加入日历',{exact:true})).toBeVisible();
}
async function shot(page:Page,name:string) {await mkdir(evidence,{recursive:true});await page.screenshot({path:evidence+'/'+name+'.png',fullPage:true});}

for(const width of [320,390,768,1440])test('legacy calendar boundary: all actual slots busy leaves zero confirmable sessions at '+width,async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:width===320?620:940});const f=await fixture(page);for(const day of [5,6,7])await block(page,f,day,day===6?'english':'math');
 let confirmations=0;page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/learning/studio/study-plans')confirmations++;});
 await planner(page,f);await expect(page.getByText('目标日期内没有可用时段，请调整首次开始或目标日期后重新预览。',{exact:true})).toBeVisible();
 await expect(page.locator('.sa-plan-sessions article')).toHaveCount(0);await expect(page.getByRole('button',{name:'确认并加入日历',exact:true})).toBeDisabled();
 const overview=await f.call('/learning/studio/overview?'+new URLSearchParams({studentId:f.child.id,subject:'math'}));expect(overview.plans).toHaveLength(0);expect(confirmations).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await shot(page,'all-conflict-zero-confirmation-'+width);
 await page.getByRole('button',{name:'返回修改',exact:true}).click();await expect(page.getByRole('textbox',{name:'计划目标',exact:true})).toHaveValue('完整保留原目标：核对条件和单位，避开已经确认的时间。');await expect(page.getByLabel('首次开始',{exact:true})).toHaveValue('2099-04-05T10:00');
});

for(const width of [320,1440])test('legacy calendar boundary: a real late conflict keeps the complete input and confirmation never implicitly re-previews at '+width,async({page})=>{
 test.setTimeout(150000);await page.setViewportSize({width,height:940});const f=await fixture(page);await block(page,f,5);let previews=0,confirmations=0;
 page.on('request',request=>{if(request.method()!=='POST')return;const pathname=new URL(request.url()).pathname;if(pathname==='/api/learning/studio/study-plans/preview')previews++;if(pathname==='/api/learning/studio/study-plans')confirmations++;});
 await planner(page,f);await expect(page.locator('.sa-plan-sessions article')).toHaveCount(2);await block(page,f,6,'english');await page.getByRole('button',{name:'确认并加入日历',exact:true}).click();
 await expect(page.getByText('学习计划已变化，请重新预览并确认',{exact:true})).toBeVisible();expect(previews).toBe(1);expect(confirmations).toBe(1);await expect(page.locator('.sa-plan-sessions article')).toHaveCount(2);
 await page.getByRole('button',{name:'返回修改',exact:true}).click();await expect(page.getByRole('textbox',{name:'计划目标',exact:true})).toHaveValue('完整保留原目标：核对条件和单位，避开已经确认的时间。');
 await page.getByRole('button',{name:'预览学习计划',exact:true}).click();await expect(page.locator('.sa-plan-sessions article')).toHaveCount(1);await page.getByRole('button',{name:'确认并加入日历',exact:true}).click();
 await expect(page.locator('.sa-plan-card')).toHaveCount(1);expect(previews).toBe(2);expect(confirmations).toBe(2);const overview=await f.call('/learning/studio/overview?'+new URLSearchParams({studentId:f.child.id,subject:'math'}));expect(overview.plans).toHaveLength(1);expect(overview.plans[0].sessions).toHaveLength(1);
 await shot(page,'late-conflict-original-input-and-single-confirmation-'+width);
});

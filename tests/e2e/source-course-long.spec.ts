import {expect,test,type Page} from '@playwright/test';
import {browserEvidence} from './evidence';
const api=`http://localhost:${process.env.E2E_API_PORT??'4107'}/api`;
let address=0;
async function login(page:Page){const id=Date.now()+'-'+Math.floor(Math.random()*100000),principal='long-source-'+id+'@local.test',credential='Long-source-'+id;
 const response=await fetch(api+'/auth/register',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'127.26.0.'+(++address)},body:JSON.stringify({principal,credential})});expect(response.status).toBe(201);const actor=(await response.json()).data;
 await page.goto('/parent/login');await page.getByLabel('登录账号').fill(principal);await page.getByLabel('密码').fill(credential);await page.getByRole('button',{name:'登录，查看学习记录 →'}).click();await expect(page).toHaveURL(/\/learn(?:\?|$)/);await page.addInitScript(()=>localStorage.setItem('studyagent.classroom.tour','done'));return actor;}
async function source(page:Page,goal='保留原始条件并逐课比较不同证据。'){
 await page.goto('/studio/source-courses?new=1');
 const text=('匿名阅览室观察。比较时段、开放条件和可能反例，不根据一次记录推断唯一原因。\n').repeat(1700);
 await page.locator('input[type=file][accept*=".txt"]').setInputFiles({name:'anonymous-long-chapter.txt',mimeType:'text/plain',buffer:Buffer.from(text)});
 await expect(page.getByRole('checkbox').last()).toBeChecked();expect(await page.getByRole('checkbox').count()).toBeGreaterThan(10);
 await page.getByLabel('课程名称',{exact:true}).fill('整章原文的学习路线');await page.getByLabel('学习目标',{exact:true}).fill(goal);return text;
}
async function preview(page:Page){await page.getByRole('button',{name:'生成课程蓝图 →',exact:true}).click();const dialog=page.getByRole('dialog',{name:'资料编排范围'});await expect(dialog.getByRole('button',{name:'确认范围并生成',exact:true})).toBeEnabled();return dialog;}
async function ready(page:Page){await expect(page.getByRole('heading',{name:'先看一遍这条学习路线。'})).toBeVisible({timeout:90000});}
async function capture(page:Page,name:string){if(process.env.E2E_SOURCE_COURSE_SNAPSHOT)await page.screenshot({path:browserEvidence('source-course-long')+'/'+name+'.png',fullPage:true});}

test('long text import, cancellable preflight, lost acknowledgment, original coverage and single-lesson authoring reach the classroom',async({page})=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const actor=await login(page);await source(page);
 let created=0;page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/learning/source-courses')created++;});
 const dialog=await preview(page);await expect(dialog).toContainText('先分片段整理');await dialog.getByRole('button',{name:'返回调整范围',exact:true}).click();await expect(dialog).toHaveCount(0);expect(created).toBe(0);
 const last=page.getByRole('checkbox').last();await last.uncheck();const count=await page.getByRole('checkbox').count()-1;const revised=await preview(page);await expect(revised.locator('.sc-preflight-counts b').first()).toHaveText(String(count));
 let lost=false;const keys:string[]=[];await page.route('**/api/learning/source-courses',async route=>{if(route.request().method()!=='POST'){await route.continue();return;}keys.push(route.request().postDataJSON().requestKey);if(!lost){lost=true;expect((await route.fetch()).status()).toBe(201);await route.abort('failed');}else await route.continue();});
 await revised.getByRole('button',{name:'确认范围并生成',exact:true}).click();await expect(revised.getByRole('alert')).toContainText('暂时无法连接');await revised.getByRole('button',{name:'确认范围并生成',exact:true}).click();await ready(page);expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);
 const id=new URL(page.url()).searchParams.get('course')!,headers={authorization:'Bearer '+actor.token};let row=(await(await fetch(api+'/learning/source-courses/'+id,{headers})).json()).data;expect(row.compilation.indexedChunks).toBe(count);expect(row.lessons.length).toBeGreaterThan(6);
 const coverage=page.getByRole('region',{name:'原文使用清单'});await coverage.locator('summary').click();await coverage.getByRole('button',{name:'定位原文 ↗',exact:true}).last().click();await expect(page.locator('.sc-source-reader pre')).toContainText('匿名阅览室观察');expect(new URL(page.url()).searchParams.get('chunk')).toBe(row.compilation.coverage.at(-1).key);
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:960});await coverage.scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await capture(page,'coverage-'+width);}
 await page.getByRole('button',{name:'编辑讲解与练习',exact:true}).click();const chooser=page.getByLabel('长课程审阅课时');await expect(chooser).toHaveValue(row.lessons[0].id);await page.getByLabel('概念讲解',{exact:true}).fill('未保存的逐课核对内容，需要保留观察范围。');await chooser.selectOption(row.lessons[1].id);
 const leave=page.getByRole('dialog',{name:'保留教学稿修改'});await expect(leave).toBeVisible();await leave.getByRole('button',{name:'继续编辑',exact:true}).click();await expect(page.getByLabel('概念讲解',{exact:true})).toHaveValue('未保存的逐课核对内容，需要保留观察范围。');
 await chooser.selectOption(row.lessons[1].id);await leave.getByRole('button',{name:'放弃修改并离开',exact:true}).click();await expect(chooser).toHaveValue(row.lessons[1].id);await page.getByLabel('概念讲解',{exact:true}).fill('第二课的人工核对内容：比较条件并保留未观察范围。');await page.getByRole('button',{name:'保存教学内容',exact:true}).click();await expect(chooser).toHaveCount(0);
 await page.getByRole('button',{name:'修改蓝图',exact:true}).click();await page.getByRole('button',{name:'移除此课时',exact:true}).first().click();await page.getByRole('button',{name:'保存蓝图修改',exact:true}).click();await expect(coverage).toContainText('原规划课时已移除');
 row=(await(await fetch(api+'/learning/source-courses/'+id,{headers})).json()).data;expect(row.lessons[0].id).toBeTruthy();await page.getByRole('button',{name:'确认课程，开始学习 →',exact:true}).click();await page.getByRole('link',{name:'进入课堂练习',exact:true}).first().click();await expect(page.locator('.cl-practice-options label')).toHaveCount(4);await page.locator('.cl-practice-options label').first().click();await page.getByRole('button',{name:'Check →',exact:true}).click();await expect(page.locator('.cl-answer-feedback')).toContainText('不计独立成功');expect(errors).toEqual([]);
});

test('a long-source failure resumes saved stages across page reload and retains exact progress',async({page})=>{
 test.setTimeout(150000);await login(page);await source(page,'比较长资料条件 [fail-later-once] [pause-review-once] '+Date.now());const dialog=await preview(page);await dialog.getByRole('button',{name:'确认范围并生成',exact:true}).click();const progress=page.getByRole('region',{name:'长资料编排进度'});
 await expect(progress).toContainText('正在核对原文条件与练习',{timeout:60000});await expect(progress.locator('dd').nth(2)).toHaveText(/1\s*\//);await page.reload();await expect(progress).toContainText('正在核对原文条件与练习');await expect(page.getByRole('heading',{name:'这次还没有得到可用课程。'})).toBeVisible({timeout:60000});await expect(progress.locator('dd').nth(3)).toHaveText(/1\s*\//);await capture(page,'resume-failed');
 await page.getByRole('button',{name:'重试已保存任务',exact:true}).click();await ready(page);await expect(page.getByRole('region',{name:'原文使用清单'})).toBeVisible();await page.reload();await ready(page);
});

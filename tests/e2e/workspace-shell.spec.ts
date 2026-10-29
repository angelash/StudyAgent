import { expect, test, type Page } from '@playwright/test';
import { syntheticFamilyHeaders } from './synthetic-family';
const api='http://localhost:'+(process.env.E2E_API_PORT??'4107')+'/api';

async function family(page:Page){
  const fixtureHeaders=await syntheticFamilyHeaders(page),nonce=crypto.randomUUID(),principal='workspace-'+nonce+'@local.test',credential='Workspace-QA-'+nonce;
  const response=await fetch(api+'/auth/register',{method:'POST',headers:fixtureHeaders,body:JSON.stringify({principal,credential})});expect(response.status).toBe(201);
  const actor=(await response.json()).data,headers={...fixtureHeaders,authorization:'Bearer '+actor.token};
  const children:Array<{id:string;nickname:string}>=[];
  for(let index=0;index<2;index++){
    const created=await fetch(api+'/students',{method:'POST',headers,body:JSON.stringify({nickname:'工作台档案'+(index+1),grade:5,preferredSessionMinutes:15,defaultVersionMap:{math:'common',chinese:'common',english:'common'}})});expect(created.status).toBe(201);children.push((await created.json()).data.profile);
  }
  await page.goto('/parent/login');await page.getByLabel('登录账号').fill(principal);await page.getByLabel('密码').fill(credential);await page.getByRole('button',{name:'登录，查看学习记录 →'}).click();await expect(page).toHaveURL(/\/studio(?:\?|$)/);
  return {children,headers,principal,credential};
}

test('workspace shell: one existing-style sidebar keeps the object across tasks reports and profiles',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const {children}=await family(page);
  await page.goto('/studio?student='+children[1].id+'&subject=english');
  const sidebar=page.getByLabel('学习工作台导航',{exact:true});await expect(sidebar).toHaveCount(1);await expect(sidebar).toBeVisible();await expect(sidebar).toHaveCSS('width','240px');
  await expect(sidebar.getByRole('link',{name:'学习档案',exact:true}).locator('.button-label')).toBeVisible();
  await expect(sidebar.getByRole('link',{name:'账号与设置',exact:true}).locator('.button-label')).toBeVisible();
  await expect(page.getByLabel('学习对象')).toHaveValue(children[1].id);
  await page.screenshot({path:test.info().outputPath('workspace-home-desktop.png'),fullPage:true});
  await sidebar.getByRole('link',{name:'学习任务',exact:true}).click();await expect(page).toHaveURL(new RegExp('/studio/tasks\\?.*studentId='+children[1].id));await expect(page.getByRole('heading',{name:'学习任务',exact:true})).toBeVisible();await expect(sidebar).toHaveCount(1);
  await sidebar.getByRole('link',{name:'学习报告',exact:true}).click();await expect(page.getByRole('heading',{name:'学习报告',exact:true})).toBeVisible();await expect(page.getByLabel('报告学习档案')).toHaveValue(children[1].id);await expect(page.getByLabel('报告学科')).toHaveValue('english');
  await page.screenshot({path:test.info().outputPath('workspace-reports-desktop.png'),fullPage:true});
  await sidebar.getByRole('link',{name:'学习档案',exact:true}).click();await expect(page.getByRole('heading',{name:'学习档案',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:children[0].nickname,exact:true})).toBeVisible();
  await page.screenshot({path:test.info().outputPath('workspace-profiles-desktop.png'),fullPage:true});
  await expect(page.getByRole('link',{name:'返回学习首页',exact:true})).toHaveCount(0);expect(errors).toEqual([]);
});

test('workspace shell: profiles read metadata only and new profiles keep the original creation contract',async({page})=>{
  const {children}=await family(page),businessReads:string[]=[];
  page.on('request',request=>{const path=new URL(request.url()).pathname;if(path==='/api/learning/overview'||/^\/api\/learning\/students\/[^/]+\/memory$/.test(path))businessReads.push(path);});
  await page.goto('/studio/profiles?studentId='+children[1].id+'&subject=english');
  await expect(page.getByRole('heading',{name:children[1].nickname,exact:true})).toBeVisible();expect(businessReads).toEqual([]);
  await page.getByLabel('孩子昵称',{exact:true}).fill('合成新档案');await page.getByRole('combobox',{name:'当前年级',exact:true}).selectOption('9');await page.getByRole('button',{name:'保存档案',exact:true}).click();
  await expect(page.getByRole('heading',{name:'合成新档案',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'合成新档案',exact:true})).toBeVisible();expect(businessReads).toEqual([]);
});

test('workspace shell: a learning-code student stays bound to their own profile and rejects self mode',async({page})=>{
  const {children,headers}=await family(page),child=children[0];
  const command=async(path:string,body:unknown)=>{const reply=await fetch(api+path,{method:'POST',headers,body:JSON.stringify(body)});expect(reply.status).toBe(201);return(await reply.json()).data;};
  const access=await command('/students/'+child.id+'/learning-access',{enabled:true,expectedVersion:0,requestKey:crypto.randomUUID(),reason:'合成工作台学生身份验收'});
  const code=await command('/students/'+child.id+'/learning-access/codes',{expectedVersion:access.version,requestKey:crypto.randomUUID()});
  await page.goto('/student/login');await page.getByLabel('一次性学习码').fill(code.code);await page.getByRole('button',{name:'进入我的学习 →',exact:true}).click();await expect(page).toHaveURL(/\/studio(?:\?|$)/);
  await expect(page.getByLabel('学习对象')).toBeDisabled();await expect(page.getByLabel('学习对象')).toHaveValue(child.id);await expect(page.getByLabel('学习对象').locator('option')).toHaveCount(1);
  const sidebar=page.getByLabel('学习工作台导航',{exact:true});await expect(sidebar.getByRole('link',{name:'学习档案',exact:true})).toHaveCount(0);await expect(sidebar.getByRole('link',{name:'教研与管理',exact:true})).toHaveCount(0);
  await sidebar.getByRole('link',{name:'学习报告',exact:true}).click();await expect(page.getByLabel('报告学习档案')).toBeDisabled();await expect(page.getByLabel('报告学习档案')).toHaveValue(child.id);
  await page.goto('/studio?courseScope=adult');await expect(page.locator('main').getByRole('alert')).toContainText('学生学习身份不能进入成人独立学习');await expect(sidebar.getByRole('link',{name:'学习报告',exact:true})).toHaveAttribute('href',new RegExp('studentId='+child.id));
  await sidebar.getByRole('link',{name:'学习报告',exact:true}).click();await expect(page.getByLabel('报告学习档案')).toHaveValue(child.id);
});

test('workspace shell: completed reports and the old family URL preserve original records without writes',async({page})=>{
  const {children,headers}=await family(page),child=children[0];
  const call=async(path:string,body?:unknown,method=body===undefined?'GET':'POST')=>{const reply=await fetch(api+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});expect(reply.ok,path).toBe(true);return(await reply.json()).data;};
  await call('/students/'+child.id+'/learning-scope?subject=math',{subject:'math',grade:5,term:'upper',textbookVolumeId:null,textbookVersion:'合成工作台知识范围',learnedAtomIds:['core:math:fractionadd'],currentAtomId:'core:math:fractionadd',minutesPerSession:15,progressMode:'knowledge',selectedLessonIds:[]},'PUT');
  const session=await call('/diagnostics/sessions',{studentId:child.id,subject:'math',adaptive:false,includePrerequisites:false,maxItems:3});
  for(const item of session.items)await call('/diagnostics/sessions/'+session.id+'/responses',{itemId:item.id,disposition:'dont_know',elapsedMs:1000});
  await call('/diagnostics/sessions/'+session.id+'/complete',{});
  const report=await call('/diagnostics/sessions/'+session.id+'/report'),writes:string[]=[];
  page.on('request',request=>{if(request.url().includes('/api/')&&request.method()!=='GET')writes.push(request.method()+':'+new URL(request.url()).pathname);});
  await page.goto('/studio/reports?studentId='+child.id+'&subject=math');await page.getByRole('link',{name:'查看原报告',exact:true}).click();await expect(page.getByRole('region',{name:'知识点工作区',exact:true})).toBeVisible();expect(new URL(page.url()).searchParams.get('session')).toBe(session.id);
  await page.reload();await expect(page.getByRole('region',{name:'知识点工作区',exact:true})).toBeVisible();
  await page.goto('/parent/dashboard?studentId='+child.id+'&subject=math');await expect(page).toHaveURL(/\/studio\/reports\?.*tab=knowledge/);await expect(page.getByRole('heading',{name:child.nickname+' · 数学',exact:true})).toBeVisible();
  expect(writes).toEqual([]);expect(await call('/diagnostics/sessions/'+session.id+'/report')).toEqual(report);
  const reportHref='/studio/reports?'+new URLSearchParams({studentId:child.id,subject:'math',session:session.id});
  await page.goto(reportHref);await page.getByRole('region',{name:'知识点工作区',exact:true}).getByRole('button',{name:'做一组题验证原因 ↗',exact:true}).click();
  await expect(page).toHaveURL(/\/studio\/assessment\?.*blueprint=/);await expect(page.getByRole('region',{name:'本次评测范围与题组',exact:true})).toBeVisible();expect((await call('/diagnostics/sessions?studentId='+child.id+'&subject=math')).length).toBe(1);
  await page.reload();await page.getByRole('button',{name:'准备好了，开始这一组 →',exact:true}).click();await expect(page).toHaveURL(/\/studio\/assessment\?.*session=/);await expect(page.getByRole('button',{name:'提交，下一步 →',exact:true})).toBeVisible();expect(new URL(page.url()).searchParams.get('session')).not.toBe(session.id);
  await page.getByRole('link',{name:'返回来源报告',exact:true}).click();await expect(page.getByRole('region',{name:'知识点工作区',exact:true})).toBeVisible();expect(new URL(page.url()).searchParams.get('session')).toBe(session.id);
  await page.getByRole('button',{name:'制定指导计划 ↗',exact:true}).click();await expect(page).toHaveURL(/\/studio\/tasks\?.*planId=/);await expect(page.getByRole('button',{name:'确认并开始计划',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('button',{name:'确认并开始计划',exact:true})).toBeVisible();await page.getByRole('link',{name:'返回来源报告',exact:true}).click();await expect(page.getByRole('region',{name:'知识点工作区',exact:true})).toBeVisible();expect(new URL(page.url()).searchParams.get('session')).toBe(session.id);
});

test('workspace shell: login returns to a local original activity and refuses an external return',async({page})=>{
  const {children,principal,credential}=await family(page),destination='/studio/tasks?'+new URLSearchParams({studentId:children[1].id,subject:'english'});
  for(const [returnTo,expected] of [[destination,destination],['//outside.invalid','/studio']]){
    await page.goto('/parent/login?'+new URLSearchParams({returnTo}));await page.getByLabel('登录账号').fill(principal);await page.getByLabel('密码').fill(credential);await page.getByRole('button',{name:'登录，查看学习记录 →',exact:true}).click();await expect(page).toHaveURL(new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'));
  }
});

test('workspace shell: parent self learning reads independent data instead of a cached child',async({page})=>{
  const {children}=await family(page);await page.goto('/studio?student='+children[1].id+'&subject=english');await expect(page.getByLabel('学习对象')).toHaveValue(children[1].id);
  const response=page.waitForResponse(reply=>reply.url().includes('/learning/studio/overview?')&&new URL(reply.url()).searchParams.get('audience')==='independent');
  await page.getByLabel('学习对象').selectOption('self');const data=(await(await response).json()).data;expect(data.selected).toBeNull();expect(data.feed).toEqual([]);expect(data.materials).toEqual([]);expect(data.integrations.events).toEqual([]);
  const sidebar=page.getByLabel('学习工作台导航',{exact:true});await expect(sidebar.getByRole('link',{name:'知识诊断',exact:true})).toHaveCount(0);await expect(sidebar.getByRole('link',{name:'学习报告',exact:true})).toHaveCount(0);
  await sidebar.getByRole('link',{name:'学习任务',exact:true}).click();await expect(page).toHaveURL(/audience=independent/);await expect(page.getByRole('heading',{name:'我的学习任务',exact:true})).toBeVisible();await expect(page.locator('main')).not.toContainText(children[1].nickname);
});

test('workspace shell: contradictory old object aliases stop before reading a diagnostic or starting work',async({page})=>{
  const {children}=await family(page),reads:string[]=[],writes:string[]=[];
  page.on('request',request=>{if(request.url().includes('/api/diagnostics/')){reads.push(request.url());if(request.method()!=='GET')writes.push(request.url());}});
  await page.goto('/studio/assessment?student='+children[0].id+'&studentId='+children[1].id+'&subject=math');
  await expect(page.locator('main').getByRole('alert')).toContainText('学习档案不一致');expect(reads).toEqual([]);expect(writes).toEqual([]);
});

test('workspace shell: report detail refuses an unfinished session without becoming an answer screen',async({page})=>{
  const {children}=await family(page),writes:string[]=[];
  await page.route('**/api/diagnostics/sessions/workspace-unfinished',route=>route.fulfill({json:{data:{id:'workspace-unfinished',status:'in_progress',subject:'math',scopeSnapshot:{studentId:children[0].id,grade:5,term:'upper'},items:[],answeredCount:0,totalCount:4,revision:1}}}));
  page.on('request',request=>{if(request.url().includes('/api/diagnostics/')&&request.method()!=='GET')writes.push(request.url());});
  await page.goto('/studio/reports?'+new URLSearchParams({studentId:children[0].id,subject:'math',session:'workspace-unfinished'}));
  await expect(page.locator('main').getByRole('alert')).toContainText('尚未形成报告');await expect(page.getByRole('button',{name:'完成这一题 →',exact:true})).toHaveCount(0);expect(writes).toEqual([]);
});

test('workspace shell: mobile navigation and compact preference work across legacy and new pages',async({page})=>{
  await family(page);await page.goto('/studio');const sidebar=page.getByLabel('学习工作台导航',{exact:true});
  await sidebar.getByRole('button',{name:'收起学习导航',exact:true}).click();await expect(sidebar).toHaveCSS('width','60px');await sidebar.getByRole('button',{name:'展开学习导航',exact:true}).click();
  for(const width of [768,390,320]){
    await page.setViewportSize({width,height:900});await page.getByRole('button',{name:'打开学习导航',exact:true}).click();const drawer=page.getByRole('dialog',{name:'学习工作台导航',exact:true});await expect(drawer).toBeVisible();await drawer.getByRole('link',{name:'学习报告',exact:true}).click();await expect(page.getByRole('heading',{name:'学习报告',exact:true})).toBeVisible();await expect(drawer).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.getByRole('button',{name:'打开学习导航',exact:true}).click();await page.keyboard.press('Escape');await expect(drawer).toHaveCount(0);await expect(page.getByRole('button',{name:'打开学习导航',exact:true})).toBeFocused();
    if(width===390)await page.screenshot({path:test.info().outputPath('workspace-reports-phone.png'),fullPage:true});
  }
});

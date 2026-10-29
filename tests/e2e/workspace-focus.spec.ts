import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { syntheticFamilyHeaders } from './synthetic-family';
import { browserEvidence } from './evidence';
import { mkdirSync } from 'node:fs';
const evidence=browserEvidence('workspace-focus');
async function capture(page:Page,name:string){mkdirSync(evidence,{recursive:true});await page.screenshot({path:evidence+'/'+name+'.png',fullPage:false});}
const api='http://localhost:'+(process.env.E2E_API_PORT??'4107')+'/api';
const original='匿名阅览室在两个周末排队，两个工作日有空位。尚未观察晚间，也不知道当天是否有活动。需要保留原始条件和可能反例，不能把一次观察推断成唯一原因。';
test.afterEach(async({page})=>{await page.unrouteAll({behavior:'wait'});});
async function fixture(page:Page){
  const headers=await syntheticFamilyHeaders(page),nonce=crypto.randomUUID(),principal='focus-'+nonce,credential='Focus-QA-'+nonce;
  let token='';
  async function call(path:string,body?:unknown,actor=token,status=body===undefined?200:201){
    const reply=await fetch(api+path,{method:body===undefined?'GET':'POST',headers:{...headers,...(actor?{authorization:'Bearer '+actor}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}),payload=await reply.json();expect(reply.status,path+': '+JSON.stringify(payload.error)).toBe(status);return payload.data;
  }
  const actor=await call('/auth/register',{principal,credential});token=actor.token;
  const child=(await call('/students',{nickname:'专注导航档案',grade:5,preferredSessionMinutes:15,defaultVersionMap:{math:'common',chinese:'common',english:'common'}})).profile;
  await page.addInitScript(()=>localStorage.setItem('studyagent.classroom.tour','done'));
  await page.goto('/parent/login');await page.getByLabel('登录账号').fill(principal);await page.getByLabel('密码').fill(credential);await page.getByRole('button',{name:'登录，查看学习记录 →',exact:true}).click();await expect(page).toHaveURL(/\/studio(?:\?|$)/);
  await page.evaluate(id=>localStorage.setItem('studyagent.navigation.compact.'+id,'false'),actor.user.id);
  async function course(subject='chemistry'){
    const material=await call('/learning/source-courses/materials/text',{title:'合成导航原文',sections:[original],studentId:child.id,subject,requestKey:crypto.randomUUID()});
    const task=await call('/learning/source-courses',{title:'合成导航资料课',goal:'比较原文中的范围、观察与尚待验证的解释。',studentId:child.id,subject,language:'zh-CN',minutesPerSession:15,modelId:'auto',selections:[{materialId:material.material.id,version:material.version,pages:[1]}],requestKey:crypto.randomUUID()});
    let saved:any;await expect.poll(async()=>{saved=await call('/learning/source-courses/'+task.id);return saved.status;},{timeout:45000}).toBe('ready');return call('/learning/source-courses/'+saved.id+'/confirm',{expectedRevision:saved.revision,fingerprint:saved.fingerprint,requestKey:crypto.randomUUID()});
  }
  return{actor,child,call,course,principal,credential};
}
const sidebar=(page:Page)=>page.getByLabel('学习工作台导航',{exact:true});

test('workspace focus: a real classroom uses its authorized chemistry scope and restores the ordinary sidebar preference',async({page})=>{
  test.setTimeout(120000);const f=await fixture(page),course=await f.course();
  await page.goto('/studio/classroom?'+new URLSearchParams({sourceCourseId:course.id,lesson:course.lessons[0].id,tab:'history',returnSubject:'math'}));
  await expect(page.locator('.cl-room')).toBeVisible();await expect(sidebar(page)).toHaveCSS('width','60px');await expect(page.locator('.cl-room')).toHaveCSS('left','60px');await expect(page.locator('main')).toHaveCount(1);
  await expect(sidebar(page).getByRole('link',{name:'学习任务',exact:true})).toHaveAttribute('href',new RegExp('studentId='+f.child.id+'&subject=chemistry'));
  const id=new URL(page.url()).searchParams.get('session')!,first=await f.call('/learning/classroom/sessions/'+id),second=await f.call('/learning/classroom/sessions/'+id);expect(second.navigationContext).toEqual({audience:'student',studentId:f.child.id,subject:'chemistry'});expect(second.revision).toBe(first.revision);expect(second.updatedAt).toBe(first.updatedAt);
  await sidebar(page).getByRole('button',{name:'展开学习导航',exact:true}).click();await expect(sidebar(page)).toHaveCSS('width','240px');expect(await page.evaluate(id=>localStorage.getItem('studyagent.navigation.compact.'+id),f.actor.user.id)).toBe('false');
  await sidebar(page).getByRole('link',{name:'学习任务',exact:true}).click();const exit=page.getByRole('dialog',{name:'离开课堂确认',exact:true});await expect(exit).toBeVisible();await exit.getByRole('button',{name:'继续学习',exact:true}).click();await expect(page.locator('.cl-room')).toBeVisible();expect(new URL(page.url()).searchParams.get('session')).toBe(id);
  await sidebar(page).getByRole('link',{name:'学习任务',exact:true}).click();await exit.getByRole('button',{name:'保存并离开',exact:true}).click();await expect(page).toHaveURL(/\/studio\/tasks\?.*subject=chemistry/);await expect(sidebar(page)).toHaveCSS('width','240px');expect((await f.call('/learning/classroom/sessions/'+id)).answers).toHaveLength(0);
});

test('workspace focus: adult whiteboard exposes one navigation and restores the original workspace and focus',async({page})=>{
  test.setTimeout(120000);const f=await fixture(page),base='/learning/studio/topic-whiteboards',input={audience:{kind:'adult'},prompt:'匿名观察与推断',objective:'比较证据与仍未验证的解释',modelId:'deepseek-v4-flash'};
  const preflight=await f.call(base+'/preflight',input),draft=await f.call(base+'/drafts',{...input,preflightFingerprint:preflight.fingerprint,requestKey:crypto.randomUUID()});let view:any;
  await expect.poll(async()=>{view=await f.call(base+'/drafts/'+draft.id);return view.status;},{timeout:45000}).toBe('ready');
  const saved=await f.call(base+'/drafts/'+draft.id+'/confirm',{expectedRevision:view.revision,contentFingerprint:view.contentFingerprint,acknowledgeAiGeneratedContent:true,acknowledgeUnreviewedChanges:false,requestKey:crypto.randomUUID()});
  await page.goto('/studio/whiteboards?whiteboard='+saved.whiteboardId);const player=page.getByRole('main',{name:'白板视频',exact:true});await expect(player).toHaveAttribute('data-original-font-status','ready');await expect(page.getByRole('main')).toHaveCount(1);await expect(sidebar(page)).toHaveCount(1);await expect(sidebar(page)).toHaveCSS('width','60px');await expect(sidebar(page).getByRole('link',{name:'Learning tasks',exact:true})).toHaveCount(0);
  await expect(sidebar(page).getByRole('link',{name:'学习任务',exact:true})).toHaveAttribute('href','/studio/tasks?audience=independent');await capture(page,'adult-whiteboard-desktop');
  await page.setViewportSize({width:1050,height:650});await sidebar(page).getByRole('button',{name:'展开学习导航',exact:true}).click();await expect(player).toHaveAttribute('data-workspace-compact','true');await capture(page,'adult-whiteboard-expanded-short');
  await page.setViewportSize({width:390,height:740});await expect(page.getByRole('button',{name:'打开学习导航',exact:true})).toBeVisible();await capture(page,'adult-whiteboard-mobile');
  await player.getByRole('button',{name:'关闭白板',exact:true}).click();await expect(player).toHaveCount(0);await expect(page.getByRole('main')).toHaveCount(1);await expect(page.locator('main[aria-hidden=true]')).toHaveCount(0);await expect(sidebar(page)).toHaveCount(0);await expect(page.getByRole('button',{name:'打开学习导航',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'打开学习导航',exact:true}).click();await expect(sidebar(page)).toBeVisible();await expect(sidebar(page).getByRole('link',{name:'学习任务',exact:true})).toHaveAttribute('href','/studio/tasks?audience=independent');
});

test('workspace focus: paper exit preserves the full draft and imports it without writing a first answer',async({page})=>{
  test.setTimeout(120000);const f=await fixture(page),admin=await f.call('/auth/login',{principal:'browser-admin',credential:'Browser-admin-only-20261021'},''),paper='qa:paper:36:complete';
  await f.call('/library/papers/'+encodeURIComponent(paper)+'/publication',{status:'published',reason:'合成原卷离开完整输入验证',licenseEvidence:'本轮独立原创合成题干与测试媒体',contentReviewed:true,mediaReviewed:true},admin.token);
  const selection=[{paperId:paper}],preview=await f.call('/library/practice/preview',{selection}),row=await f.call('/library/practice/sessions',{selection,sourceHash:preview.sourceHash,requestKey:crypto.randomUUID()}),href='/library/practice?session='+row.id;
  await page.goto(href);const input=page.getByLabel('先写下自己的回答'),text='保留完整思考和没有确定的解释。'.repeat(700);await expect(input).toBeVisible();await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Synthetic storage failure','QuotaExceededError');};});await input.fill(text);
  await page.setViewportSize({width:390,height:740});await page.getByRole('button',{name:'打开学习导航',exact:true}).click();await sidebar(page).getByRole('link',{name:'学习任务',exact:true}).click();const dialog=page.getByRole('dialog',{name:'保留原卷输入后离开',exact:true});await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'已保留副本，继续离开',exact:true})).toBeDisabled();await capture(page,'paper-exit-mobile');await dialog.getByRole('button',{name:'继续编辑',exact:true}).click();await expect(input).toHaveValue(text);
  await page.getByRole('button',{name:'打开学习导航',exact:true}).click();await sidebar(page).getByRole('link',{name:'学习任务',exact:true}).click();const downloading=page.waitForEvent('download');await dialog.getByRole('button',{name:'下载完整离开副本',exact:true}).click();const file=await downloading,filename=(await file.path())!,copy=JSON.parse(await readFile(filename,'utf8'));expect(copy.copies[0].text).toBe(text);await dialog.getByRole('button',{name:'已保留副本，继续离开',exact:true}).click();await expect(page).toHaveURL(/\/studio\/tasks\?audience=independent/);
  expect((await f.call('/library/practice/sessions/'+row.id)).counts.submitted).toBe(0);await page.goto(href);await expect(input).toBeVisible();await page.getByLabel('从本次练习保护文件恢复').setInputFiles(filename);await page.getByRole('button',{name:'核对本机草稿 1',exact:true}).click();await expect(page.getByRole('textbox',{name:'本机保留的内容',exact:true})).toHaveValue(text);expect((await f.call('/library/practice/sessions/'+row.id)).counts.submitted).toBe(0);
});

test('workspace focus: admin cookie identity exposes nine modules and a teacher is gated before private data reads',async({page})=>{
  test.setTimeout(120000);const f=await fixture(page),admin=await f.call('/auth/login',{principal:'browser-admin',credential:'Browser-admin-only-20261021'},'');
  let reply=await page.request.post(api+'/auth/login',{data:{principal:'browser-admin',credential:'Browser-admin-only-20261021'}});expect(reply.ok()).toBe(true);await page.goto('/admin/content');await expect(page.getByRole('navigation',{name:'管理功能',exact:true}).getByRole('link')).toHaveCount(9);await expect(page.getByRole('heading',{name:'内容与题目',exact:true})).toBeVisible();await capture(page,'admin-content-desktop');
  const account=(await f.call('/admin/accounts?search='+encodeURIComponent(f.principal),undefined,admin.token)).rows.find((row:any)=>row.id===f.actor.user.id);
  const changed=await fetch(api+'/admin/accounts/'+account.id,{method:'PATCH',headers:{'content-type':'application/json',authorization:'Bearer '+admin.token},body:JSON.stringify({role:'teacher',status:'active',expectedVersion:account.version,reason:'合成教师导航权限验证',adminCredential:'Browser-admin-only-20261021'})});expect(changed.ok).toBe(true);
  reply=await page.request.post(api+'/auth/login',{data:{principal:f.principal,credential:f.credential}});expect(reply.ok()).toBe(true);await page.goto('/admin/curriculum');await expect(page.getByRole('navigation',{name:'管理功能',exact:true}).getByRole('link')).toHaveCount(4);await expect(page.getByRole('navigation',{name:'管理功能',exact:true}).getByRole('link',{name:'内容与题目',exact:true})).toHaveCount(0);
  const reads:string[]=[];page.on('request',request=>{if(request.url().startsWith(api+'/')&&!request.url().startsWith(api+'/auth/'))reads.push(request.url());});await page.goto('/admin/content');await expect(page.getByRole('heading',{name:'当前身份无法访问此管理功能',exact:true})).toBeVisible();expect(reads).toEqual([]);
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:740});await expect(page.getByRole('heading',{name:'当前身份无法访问此管理功能',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture(page,'teacher-denied-'+width);}
  await page.goto('/admin/curriculum');await expect(page.getByRole('heading',{name:'课程与覆盖',exact:true})).toBeVisible();
  const granted=(await f.call('/admin/accounts?search='+encodeURIComponent(f.principal),undefined,admin.token)).rows.find((row:any)=>row.id===account.id);
  const revoked=await fetch(api+'/admin/accounts/'+account.id,{method:'PATCH',headers:{'content-type':'application/json',authorization:'Bearer '+admin.token},body:JSON.stringify({role:'parent',status:'active',expectedVersion:granted.version,reason:'合成教师在打开管理页后实际撤权',adminCredential:'Browser-admin-only-20261021'})});expect(revoked.ok).toBe(true);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('heading',{name:'课程与覆盖',exact:true})).toHaveCount(0);await expect(page.getByRole('navigation',{name:'管理功能',exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'登录工作台',exact:true})).toBeVisible();
});

test('workspace focus: project navigation protects the complete local artifact before an explicit export and leave',async({page})=>{
  test.setTimeout(120000);const f=await fixture(page),course=await f.course();await page.goto('/studio/projects?sourceCourseId='+course.id);await page.getByRole('button',{name:'开始这个项目 →',exact:true}).click();await page.getByRole('button',{name:'下一步 ›',exact:true}).click();
  const input=page.getByRole('textbox',{name:'我准备核查的主张',exact:true}),text='原稿保留全部证据和仍未验证的解释。'.repeat(80);await input.fill(text);await expect(sidebar(page)).toHaveCSS('width','60px');
  const projectId=new URL(page.url()).searchParams.get('project')!;
  await sidebar(page).getByRole('link',{name:'学习任务',exact:true}).click();const dialog=page.getByRole('dialog',{name:'保留项目修改',exact:true});await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'继续编辑',exact:true}).click();await expect(input).toHaveValue(text);
  await sidebar(page).getByRole('link',{name:'学习任务',exact:true}).click();const downloading=page.waitForEvent('download');await dialog.getByRole('button',{name:'导出副本并离开',exact:true}).click();const download=await downloading;expect(await readFile((await download.path())!,'utf8')).toContain(text);await expect(page).toHaveURL(/\/studio\/tasks\?.*subject=chemistry/);
  const record=await f.call('/learning/projects/'+projectId);expect(record.navigationContext).toEqual({audience:'student',studentId:f.child.id,subject:'chemistry'});expect(record.submissions).toHaveLength(0);expect(JSON.stringify(record.drafts)).not.toContain(text);
});

test('workspace focus: all nine admin modules render in one shell and actual content fits phone, tablet and desktop',async({page})=>{
  test.setTimeout(180000);await page.setExtraHTTPHeaders(await syntheticFamilyHeaders(page));const logged=await page.request.post(api+'/auth/login',{data:{principal:'browser-admin',credential:'Browser-admin-only-20261021'}});expect(logged.ok()).toBe(true);
  const modules=[['curriculum','课程与覆盖'],['content','内容与题目'],['imports','资料导入'],['reviews','作答复核'],['measurement','测量素材'],['analytics','运营分析'],['gesp','GESP教研'],['ai-tools','把一次作答，看得更清楚。'],['accounts','账号权限']];
  for(const [id,title]of modules){await page.goto('/admin/'+id);await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();await expect(page.getByRole('main')).toHaveCount(1);await expect(sidebar(page)).toHaveCount(1);await expect(page.getByRole('navigation',{name:'管理功能',exact:true}).getByRole('link')).toHaveCount(9);await capture(page,'admin-module-'+id);}
  for(const id of ['content','analytics','curriculum','measurement']){
    await page.goto('/admin/'+id);await expect(page.locator('.workspace-admin-body h1')).toBeVisible();
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:700});
      const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,offenders:[...document.querySelectorAll<HTMLElement>('main *')].filter(element=>element.getClientRects().length&&element.getBoundingClientRect().right>innerWidth+1).map(element=>({tag:element.tagName,className:element.className,right:element.getBoundingClientRect().right,width:element.getBoundingClientRect().width,minWidth:getComputedStyle(element).minWidth,overflow:getComputedStyle(element).overflow})).sort((a,b)=>b.right-a.right).slice(0,15)}));
      expect(layout.overflow,'module '+id+' width '+width+' '+JSON.stringify(layout.offenders)).toBeLessThanOrEqual(1);await capture(page,'admin-'+id+'-'+width);
    }
  }
});

test('workspace focus: without Navigation API the persistent host keeps full unsaved material text during browser back',async({page})=>{
  test.setTimeout(120000);await page.addInitScript(()=>Object.defineProperty(window,'navigation',{configurable:true,value:undefined}));const f=await fixture(page);
  await page.goto('/studio?view=materials&tab=personal&courseScope=adult');await page.getByRole('tab',{name:'题卷资源',exact:true}).click();await page.getByRole('tab',{name:'学习资料',exact:true}).click();
  expect(await page.evaluate(()=>typeof (window as unknown as {navigation?:unknown}).navigation)).toBe('undefined');await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Synthetic storage failure','QuotaExceededError');};});
  await page.getByRole('button',{name:'添加文字资料',exact:true}).click();const dialog=page.getByRole('dialog',{name:'添加文字资料',exact:true}),text='不能丢失的原文与反例。'.repeat(13000);await dialog.getByLabel('资料名称',{exact:true}).fill('旧浏览器完整文字稿');await dialog.getByLabel('完整文字',{exact:true}).fill(text);
  await page.evaluate(()=>history.back());await expect(dialog.getByRole('button',{name:'已保留副本，关闭编辑',exact:true})).toBeDisabled();expect(new URL(page.url()).searchParams.get('tab')).toBe('personal');await dialog.getByRole('button',{name:'继续编辑',exact:true}).click();await expect(dialog.getByLabel('完整文字',{exact:true})).toHaveValue(text);
  await page.evaluate(()=>history.back());await expect(dialog.getByRole('button',{name:'下载完整文字稿',exact:true})).toBeVisible();const downloading=page.waitForEvent('download');await dialog.getByRole('button',{name:'下载完整文字稿',exact:true}).click();const download=await downloading;expect(JSON.parse(await readFile((await download.path())!,'utf8')).text).toBe(text);await dialog.getByRole('button',{name:'已保留副本，关闭编辑',exact:true}).click();await expect(page.getByRole('tab',{name:'题卷资源',exact:true})).toHaveAttribute('aria-selected','true');expect(await f.call('/learning/source-courses/materials?view=catalog')).toHaveLength(0);
});

test('workspace focus: a classroom with disabled storage requires the full choice download and never submits it on exit',async({page})=>{
  test.setTimeout(120000);const f=await fixture(page),course=await f.course('math');await page.goto('/studio/classroom?'+new URLSearchParams({sourceCourseId:course.id,lesson:course.lessons[0].id,tab:'practice'}));await expect(page.locator('.cl-practice-options label')).toHaveCount(4);await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Synthetic disabled storage','QuotaExceededError');};});await page.locator('.cl-practice-options label').first().click();
  const sessionId=new URL(page.url()).searchParams.get('session')!;await sidebar(page).getByRole('link',{name:'学习任务',exact:true}).click();const exit=page.getByRole('dialog',{name:'离开课堂确认',exact:true});await expect(exit.getByRole('button',{name:'保存并离开',exact:true})).toBeDisabled();const downloading=page.waitForEvent('download');await exit.getByRole('button',{name:'下载练习副本',exact:true}).click();const downloaded=await downloading,copy=JSON.parse(await readFile((await downloaded.path())!,'utf8'));expect(copy.sessionId).toBe(sessionId);expect(Object.values(copy.choices)).toContainEqual([0]);await exit.getByRole('button',{name:'保存并离开',exact:true}).click();await expect(page).toHaveURL(/\/studio\/tasks\?/);expect((await f.call('/learning/classroom/sessions/'+sessionId)).answers).toHaveLength(0);
});

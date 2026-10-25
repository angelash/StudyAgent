import {test,expect,type Page} from '@playwright/test';
import {browserEvidence} from './evidence';
const api=`http://localhost:${process.env.E2E_API_PORT??4107}/api`,evidence=browserEvidence('course-lifecycle');let address=0;
async function call(actor:any,method:string,path:string,body?:unknown){const response=await fetch(api+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+actor.token},...(body===undefined?{}:{body:JSON.stringify(body)})});expect(response.ok).toBe(true);return(await response.json()).data;}
async function enter(page:Page){const id=Date.now()+'-'+Math.floor(Math.random()*100000),principal='versions-'+id+'@local.test',credential='Versions-'+id;
  const response=await fetch(api+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':'198.18.3.'+(++address)},body:JSON.stringify({principal,credential})});expect(response.status).toBe(201);const actor=(await response.json()).data;
  await page.addInitScript(()=>localStorage.setItem('studyagent.classroom.tour','done'));await page.goto('/parent/login');await page.getByLabel('登录账号').fill(principal);await page.getByLabel('密码').fill(credential);await page.getByRole('button',{name:'登录，查看学习记录 →'}).click();await expect(page).toHaveURL(/\/learn(?:\?|$)/);
  const source=await call(actor,'POST','/learning/source-courses/materials/text',{title:'匿名记录',sections:['匿名阅览室在周末有排队，工作日有空位；没有记录晚间，也不知道当天是否有活动。比较时应保持其他条件相同，不把一次观察当作唯一原因。'],requestKey:crypto.randomUUID()}),draft=await call(actor,'POST','/learning/source-courses',{title:'从观察到验证',goal:'用相同条件比较观察与替代解释。',language:'zh-CN',minutesPerSession:15,modelId:'deepseek-v4-flash',selections:[{materialId:source.material.id,version:source.version,pages:[1]}],requestKey:crypto.randomUUID()});
  let row:any;await expect.poll(async()=>{row=await call(actor,'GET','/learning/source-courses/'+draft.id);return row.status;},{timeout:30000}).toBe('ready');row=await call(actor,'POST','/learning/source-courses/'+row.id+'/confirm',{expectedRevision:row.revision,fingerprint:row.fingerprint,requestKey:crypto.randomUUID()});await page.goto('/studio/source-courses?course='+row.id);await expect(page.getByRole('button',{name:'创建修订稿',exact:true})).toBeVisible();return{actor,row};
}
async function fork(page:Page){await page.getByRole('button',{name:'创建修订稿',exact:true}).click();const dialog=page.getByRole('dialog',{name:'创建课程修订稿'});await dialog.getByRole('button',{name:'创建并编辑修订稿',exact:true}).click();await expect(page.getByLabel('概念讲解',{exact:true})).toBeVisible();}
async function save(page:Page){await page.getByRole('button',{name:'保存教学内容',exact:true}).click();await expect(page.getByLabel('概念讲解',{exact:true})).toHaveCount(0);}
const modal=(page:Page)=>page.getByRole('dialog',{name:'课程变更影响预览'});

test('edit and publish a revision, then explicitly resume the old version at its frozen line',async({page})=>{
  test.setTimeout(90000);const{actor,row}=await enter(page),old=await call(actor,'POST','/learning/classroom/sessions',{sourceCourseId:row.id,lessonId:row.lessons[0].id}),units=old.presentation.tracks[old.lesson.steps[1].id].units;
  await call(actor,'PATCH','/learning/classroom/sessions/'+old.id,{expectedRevision:old.revision,cursor:1,revealed:2,sentenceCursor:0,presentationVersion:old.presentation.version,unitId:units[0].id,projectDraft:'原版课堂草稿'});await page.reload();
  await fork(page);const newId=new URL(page.url()).searchParams.get('course')!;expect(newId).not.toBe(row.id);await page.getByLabel('概念讲解',{exact:true}).fill('修订后新增的概念说明。'+await page.getByLabel('概念讲解',{exact:true}).inputValue());await save(page);
  await page.getByRole('button',{name:'发布此修订',exact:true}).click();await expect(modal(page)).toContainText('1 份课堂记录');await modal(page).getByRole('button',{name:'取消变更',exact:true}).click();expect((await call(actor,'GET','/learning/source-courses/'+row.id)).status).toBe('active');
  await page.getByRole('button',{name:'发布此修订',exact:true}).click();await modal(page).getByLabel('课程版本变更原因').fill('补充具体概念说明');await modal(page).getByRole('button',{name:'确认发布此修订',exact:true}).click();await expect(modal(page)).toHaveCount(0);await expect(page.locator('.sc-course-meta')).toContainText('可以开始学习');
  await page.getByText('版本历史 · 2 个版本',{exact:true}).click();await page.getByRole('button',{name:'查看第 1 版',exact:true}).click();await expect(page.locator('.sc-course-meta')).toContainText('已归档');await page.getByRole('link',{name:'继续第 1 版的原课堂 →',exact:true}).click();await expect(page.locator('.cl-subtitle')).toHaveText(units[0].text);await expect(page).toHaveURL(new RegExp('session='+old.id));
  const historical=await call(actor,'GET','/learning/classroom/sessions/'+old.id);expect(historical.projectDraft).toBe('原版课堂草稿');expect(historical.lesson.steps[1].narration).not.toContain('修订后新增');
});

test('lost revision creation receipts survive refresh and recover the same draft with the original command',async({page})=>{
  test.setTimeout(90000);const{actor,row}=await enter(page),keys:string[]=[];let lost=false;
  await page.route('**/api/learning/source-courses/*/revisions',async route=>{keys.push(route.request().postDataJSON().requestKey);if(!lost){lost=true;await route.fetch();await route.abort('connectionreset');}else await route.continue();});
  await page.getByRole('button',{name:'创建修订稿',exact:true}).click();await page.getByRole('button',{name:'创建并编辑修订稿',exact:true}).click();await expect(page.getByRole('dialog',{name:'创建课程修订稿'}).getByRole('button',{name:'找回上次课程操作',exact:true})).toBeVisible();
  await page.reload();await page.getByRole('button',{name:'找回上次课程操作',exact:true}).click();await expect(page.getByLabel('概念讲解',{exact:true})).toBeVisible();expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);const rows=await call(actor,'GET','/learning/source-courses');expect(rows.filter((item:any)=>item.versioning?.parentCourseId===row.id)).toHaveLength(1);
});

test('archive, withdrawal reasons, restore, keyboard cancellation and responsive impact previews use real saved states',async({page})=>{
  test.setTimeout(90000);const{actor,row}=await enter(page),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const archive=page.getByRole('button',{name:'归档课程',exact:true});await archive.focus();await page.keyboard.press('Enter');await expect(modal(page)).toBeVisible();
  for(let index=0;index<10;index++){await page.keyboard.press('Tab');expect(await page.evaluate(()=>Boolean(document.activeElement?.closest('[role="dialog"][aria-label="课程变更影响预览"]')))).toBe(true);}
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:960});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);if(!process.env.CI)await page.screenshot({path:evidence+'/impact-'+width+'.png',fullPage:true});}
  await page.keyboard.press('Escape');await expect(modal(page)).toHaveCount(0);await expect(archive).toBeFocused();expect((await call(actor,'GET','/learning/source-courses/'+row.id)).status).toBe('active');
  await page.getByRole('button',{name:'撤回此版本',exact:true}).click();await expect(modal(page).getByRole('button',{name:'确认撤回此版本',exact:true})).toBeDisabled();await modal(page).getByLabel('课程版本变更原因').fill('需要核查例子条件');await modal(page).getByRole('button',{name:'确认撤回此版本',exact:true}).click();await expect(modal(page)).toHaveCount(0);await expect(page.locator('.sc-version-reason')).toContainText('需要核查例子条件');await page.reload();await expect(page.locator('.sc-lifecycle h2')).toContainText('已撤回');
  await page.getByRole('button',{name:'恢复使用此版本',exact:true}).click();await modal(page).getByRole('button',{name:'确认恢复使用此版本',exact:true}).click();await expect(modal(page)).toHaveCount(0);await expect(page.locator('.sc-course-meta')).toContainText('可以开始学习');expect(errors).toEqual([]);
});

test('a lost publication reply recovers after refresh without another publication or another lesson version',async({page})=>{
  test.setTimeout(90000);const{actor}=await enter(page);await fork(page);await save(page);const id=new URL(page.url()).searchParams.get('course')!,keys:string[]=[];let lost=false;
  await page.route('**/api/learning/source-courses/*/lifecycle',async route=>{keys.push(route.request().postDataJSON().requestKey);if(!lost){lost=true;await route.fetch();await route.abort('connectionreset');}else await route.continue();});
  await page.getByRole('button',{name:'发布此修订',exact:true}).click();await modal(page).getByLabel('课程版本变更原因').fill('已核对当前讲解内容');await modal(page).getByRole('button',{name:'确认发布此修订',exact:true}).click();await expect(modal(page).getByRole('button',{name:'找回上次课程操作',exact:true})).toBeVisible();
  await page.reload();await page.getByRole('button',{name:'找回上次课程操作',exact:true}).click();await expect(page.locator('.sc-lifecycle-pending')).toHaveCount(0);await expect(page.locator('.sc-course-meta')).toContainText('可以开始学习');expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);
  const row=await call(actor,'GET','/learning/source-courses/'+id);expect(row.versioning.events.filter((event:any)=>event.action==='publish'&&event.toStatus==='active')).toHaveLength(1);
});

test('a stale publication preview reads the actual saved version before a new explicit confirmation',async({page})=>{
  test.setTimeout(90000);const{actor}=await enter(page);await fork(page);await save(page);const id=new URL(page.url()).searchParams.get('course')!;
  await page.getByRole('button',{name:'发布此修订',exact:true}).click();const current=await call(actor,'GET','/learning/source-courses/'+id);await call(actor,'PATCH','/learning/source-courses/'+id,{expectedRevision:current.revision,requestKey:crypto.randomUUID(),title:'另一页保存的修订标题',goal:current.input.goal,lessons:current.lessons.map((lesson:any)=>({id:lesson.id,title:lesson.title,objective:lesson.objective}))});
  await modal(page).getByLabel('课程版本变更原因').fill('发布已核对的内容');await modal(page).getByRole('button',{name:'确认发布此修订',exact:true}).click();await expect(modal(page).getByRole('alert')).toContainText('重新预览');await modal(page).getByRole('button',{name:'读取已保存的课程版本',exact:true}).click();await expect(modal(page)).toHaveCount(0);await expect(page.getByRole('heading',{name:'另一页保存的修订标题',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'发布此修订',exact:true}).click();await modal(page).getByLabel('课程版本变更原因').fill('重新预览后确认发布');await modal(page).getByRole('button',{name:'确认发布此修订',exact:true}).click();await expect(modal(page)).toHaveCount(0);await expect(page.locator('.sc-course-meta')).toContainText('可以开始学习');
});

test('stopping a lost publication wait preserves the committed command and ignores its late reply',async({page})=>{
  test.setTimeout(90000);const{actor}=await enter(page);await fork(page);await save(page);const id=new URL(page.url()).searchParams.get('course')!;let release!:()=>void,arrived!:()=>void,heldOnce=false;
  const held=new Promise<void>(resolve=>{release=resolve;}),arrival=new Promise<void>(resolve=>{arrived=resolve;});
  await page.route('**/api/learning/source-courses/*/lifecycle',async route=>{const response=await route.fetch();if(!heldOnce){heldOnce=true;arrived();await held;}try{await route.fulfill({response});}catch{/* Client explicitly stopped waiting. */}});
  await page.getByRole('button',{name:'发布此修订',exact:true}).click();await modal(page).getByLabel('课程版本变更原因').fill('保留有界的恢复行为');await modal(page).getByRole('button',{name:'确认发布此修订',exact:true}).click();await arrival;
  await modal(page).getByRole('button',{name:'停止等待',exact:true}).click();await expect(modal(page).getByRole('alert')).toContainText('可能已经保存');release();await modal(page).getByRole('button',{name:'找回上次课程操作',exact:true}).click();await expect(modal(page)).toHaveCount(0);
  await expect(page.locator('.sc-course-meta')).toContainText('可以开始学习');const row=await call(actor,'GET','/learning/source-courses/'+id);expect(row.versioning.events.filter((event:any)=>event.action==='publish'&&event.toStatus==='active')).toHaveLength(1);
});

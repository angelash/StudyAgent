import {test,expect,type Page} from '@playwright/test';
import {browserEvidence} from './evidence';
const api='http://localhost:'+(process.env.E2E_API_PORT??4107)+'/api',evidence=browserEvidence('source-project');let address=0;
async function call(actor:any,method:string,path:string,body?:unknown){const response=await fetch(api+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+actor.token},...(body===undefined?{}:{body:JSON.stringify(body)})});expect(response.ok,method+' '+path+' -> '+response.status).toBe(true);return(await response.json()).data;}
async function course(actor:any){
  const source=await call(actor,'POST','/learning/source-courses/materials/text',{title:'匿名观察原文',sections:['匿名阅览室在两个周末有排队，工作日有空位；没有记录晚间，也不知道当天是否有活动。比较时应保持其他条件相同，不把一次观察当作唯一原因。'],requestKey:crypto.randomUUID()}),draft=await call(actor,'POST','/learning/source-courses',{title:'从来源到自己的作品',goal:'以来源和条件比较替代解释，并设计自己的新情境。',language:'zh-CN',minutesPerSession:15,modelId:'deepseek-v4-flash',selections:[{materialId:source.material.id,version:source.version,pages:[1]}],requestKey:crypto.randomUUID()});
  let row:any;await expect.poll(async()=>{row=await call(actor,'GET','/learning/source-courses/'+draft.id);return row.status;},{timeout:30000}).toBe('ready');return call(actor,'POST','/learning/source-courses/'+row.id+'/confirm',{expectedRevision:row.revision,fingerprint:row.fingerprint,requestKey:crypto.randomUUID()});
}
async function enter(page:Page){
  page.on('dialog',dialog=>void dialog.accept());const suffix=crypto.randomUUID(),principal='source-project-'+suffix+'@local.test',credential='Source-project-'+suffix,response=await fetch(api+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':'198.18.22.'+(++address)},body:JSON.stringify({principal,credential})});expect(response.status).toBe(201);const actor=(await response.json()).data;
  await page.addInitScript(()=>localStorage.setItem('studyagent.classroom.tour','done'));await page.goto('/parent/login');await page.getByLabel('登录账号').fill(principal);await page.getByLabel('密码').fill(credential);await page.getByRole('button',{name:'登录，查看学习记录 →'}).click();await expect(page).toHaveURL(/\/learn(?:\?|$)/);const row=await course(actor);await page.goto('/studio/source-courses?course='+row.id);return{actor,row};
}
async function finishReading(page:Page,actor:any){
  await expect(page.locator('.cl-session-navigation')).toBeVisible();
  const sessionId=new URL(page.url()).searchParams.get('session')!,session=await call(actor,'GET','/learning/classroom/sessions/'+sessionId);
  for(let step=0;step<session.lesson.steps.length;step++){
    await expect(page.locator('.cl-session-navigation')).toContainText((step+1)+' / '+session.lesson.steps.length);
    await page.getByRole('button',{name:'下一步 ›',exact:true}).click();
  }
  await expect(page.getByRole('dialog',{name:'课堂学习里程碑',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'去检查理解 →',exact:true}).click();
  return session;
}
async function finishQuestions(page:Page,session:any){
  for(let index=0;index<session.lesson.questions.length;index++){
    await page.getByRole('button',{name:'第'+(index+1)+'题',exact:true}).click();
    if(index%3===2)await page.getByRole('button',{name:'Skip',exact:true}).click();
    else{
      if(index===0){await page.getByRole('button',{name:'先给我一个提示',exact:true}).click();await expect(page.locator('.cl-hint')).toHaveCount(1);}
      await page.locator('.cl-practice-options label').first().click();await page.getByRole('button',{name:'Check →',exact:true}).click();
    }
    if(index===session.lesson.questions.length-1){await expect(page.getByRole('region',{name:'课堂练习复盘',exact:true})).toBeVisible();await page.getByRole('button',{name:'第'+(index+1)+'题',exact:true}).click();}
    await expect(page.locator('.cl-answer-feedback')).toBeVisible();
  }
}
async function leaveClassroom(page:Page,standalone=false){
  await page.getByRole('button',{name:standalone?'关闭独立练习':'离开课堂',exact:true}).click();
  await page.getByRole('button',{name:'保存并离开',exact:true}).click();
}

test('a published source course opens one real project, completes all frozen stages and returns to its original course',async({page})=>{
  test.setTimeout(180000);const{actor,row}=await enter(page);await expect(page.getByLabel('资料课程项目',{exact:true})).toContainText('尚未设置独立单元核查');expect((await call(actor,'GET','/learning/projects/catalog?sourceCourseId='+row.id)).projects).toHaveLength(0);
  expect(row.lessons).toHaveLength(2);
  for(let index=0;index<row.lessons.length;index++){
    const card=page.locator('.sc-lesson').nth(index);await card.getByRole('link',{name:'开始讲解 →',exact:true}).click();
    const session=await finishReading(page,actor);await finishQuestions(page,session);await leaveClassroom(page);
    await expect(card.getByLabel('讲解与练习记录',{exact:true})).toContainText('讲解已读');
    await expect(card.getByLabel('讲解与练习记录',{exact:true})).toContainText('已作答 2/2');
  }
  const completed=await call(actor,'GET','/learning/source-courses/'+row.id);
  expect(completed.journey.lessons.every((item:any)=>item.reading.state==='read'&&item.practice.summary.complete)).toBe(true);
  expect(completed.journey.unitCheck).toBe('not_configured');
  await page.getByRole('link',{name:'打开资料应用项目 →',exact:true}).click();await expect(page.getByRole('button',{name:'开始这个项目 →',exact:true})).toBeEnabled();expect((await call(actor,'GET','/learning/projects/catalog?sourceCourseId='+row.id)).projects).toHaveLength(0);await page.getByRole('button',{name:'开始这个项目 →',exact:true}).click();await expect(page.getByRole('region',{name:'当前项目步骤'})).toContainText('STEP 1 OF 5');const projectId=new URL(page.url()).searchParams.get('project')!;
  let project=await call(actor,'GET','/learning/projects/'+projectId);expect(project.sourceCourseId).toBe(row.id);expect(project.definition.sourceCourse.objectives).toHaveLength(2);
  for(let index=0;index<project.definition.stages.length;index++){
    const stage=project.definition.stages[index];await expect(page.getByRole('region',{name:'当前项目步骤'})).toContainText(stage.title);await page.getByRole('button',{name:'下一步 ›',exact:true}).click();
    for(const field of stage.fields){await page.getByRole('textbox',{name:field.label,exact:true}).fill('匿名来源与新情境的过程、适用条件和待核查边界：'+field.id);await page.getByRole('button',{name:'下一步 ›',exact:true}).click();}
    await page.getByRole('button',{name:'下一步 ›',exact:true}).click();for(const criterion of await page.locator('.pj-reflection .pj-ratings fieldset').all()){await criterion.getByRole('radio').nth(1).check();await criterion.locator('textarea').fill('当前作品保留初步依据，仍需要比较条件和反例。');}
    await page.getByRole('button',{name:'提交这个阶段 →',exact:true}).click();await expect(page.getByRole('button',{name:new RegExp('已提交 '+(index+1)+'/3')})).toBeVisible();if(index<2)await page.getByRole('button',{name:'下一阶段 ›',exact:true}).click();
  }
  project=await call(actor,'GET','/learning/projects/'+projectId);expect(project.submissions).toHaveLength(3);expect(project.reviews).toHaveLength(0);await page.reload();await page.getByRole('button',{name:'关闭项目教学',exact:true}).click();await expect(page).toHaveURL(new RegExp('course='+row.id));await page.getByRole('link',{name:'打开资料应用项目 →',exact:true}).click();await expect(page.getByRole('region',{name:'当前项目步骤'})).toBeVisible();expect(new URL(page.url()).searchParams.get('project')).toBe(projectId);expect((await call(actor,'GET','/learning/source-courses/'+row.id)).formalMeasurementEligible).toBe(false);
});

test('a project URL bound to another source course clears the old work instead of silently changing the course',async({page})=>{
  const{actor,row}=await enter(page);await page.getByRole('link',{name:'打开资料应用项目 →',exact:true}).click();await page.getByRole('button',{name:'开始这个项目 →',exact:true}).click();await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await page.getByRole('textbox',{name:'我准备核查的主张',exact:true}).fill('原资料课程的独立本机稿');const url=new URL(page.url()),other=await course(actor);url.searchParams.set('sourceCourseId',other.id);await page.goto(url.toString());await expect(page.getByText('项目与当前课程入口不一致，请返回课程重新进入。',{exact:true})).toBeVisible();await expect(page.locator('.pj-artifact')).toHaveCount(0);expect((await call(actor,'GET','/learning/projects/catalog?sourceCourseId='+row.id)).projects).toHaveLength(1);expect((await call(actor,'GET','/learning/projects/catalog?sourceCourseId='+other.id)).projects).toHaveLength(0);
});

for(const width of [390,768,1440])test('source-course project entry and frozen objectives fit at '+width,async({page})=>{
  await page.setViewportSize({width,height:1000});await enter(page);await expect(page.getByRole('link',{name:'打开资料应用项目 →',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.getByRole('link',{name:'打开资料应用项目 →',exact:true}).click();await page.getByRole('button',{name:'开始这个项目 →',exact:true}).click();await page.getByRole('button',{name:'完整作品',exact:true}).click();await expect(page.getByText('冻结课程目标与原文位置',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);if(!process.env.CI)await page.screenshot({path:evidence+'/source-project-'+width+'.png',fullPage:true});
});

test('source reading, assisted practice and project draft return to their exact saved objects in one continuous journey',async({page})=>{
  test.setTimeout(90000);const{actor,row}=await enter(page),first=page.locator('.sc-lesson').first();await first.getByRole('link',{name:'开始讲解 →',exact:true}).click();await expect(page.locator('.cl-session-navigation')).toContainText('1 / 6');await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await expect(page.locator('.cl-session-navigation')).toContainText('2 / 6');const sessionId=new URL(page.url()).searchParams.get('session')!;
  await page.getByRole('button',{name:'离开课堂',exact:true}).click();await page.getByRole('button',{name:'保存并离开',exact:true}).click();await expect(first.getByLabel('讲解与练习记录',{exact:true})).toContainText('讲解进行中');
  await first.getByRole('link',{name:'进入课堂练习',exact:true}).click();await expect(page.locator('.cl-practice-options label')).toHaveCount(4);expect(new URL(page.url()).searchParams.get('session')).toBe(sessionId);await page.getByRole('button',{name:'先给我一个提示',exact:true}).click();await expect(page.locator('.cl-hint')).toHaveCount(1);await page.locator('.cl-practice-options label').first().click();await page.getByRole('button',{name:'Check →',exact:true}).click();await expect(page.locator('.cl-answer-feedback')).toContainText('使用过提示');await page.getByRole('button',{name:'关闭独立练习',exact:true}).click();await page.getByRole('button',{name:'保存并离开',exact:true}).click();await expect(first.getByLabel('讲解与练习记录',{exact:true})).toContainText('已作答 1/2');await expect(first.getByLabel('讲解与练习记录',{exact:true})).toContainText('独立首答正确 0 · 使用帮助 1');
  await page.getByRole('link',{name:'打开资料应用项目 →',exact:true}).click();await page.getByRole('button',{name:'开始这个项目 →',exact:true}).click();await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await page.getByRole('textbox',{name:'我准备核查的主张',exact:true}).fill('来源课程项目的保存稿');await page.getByRole('button',{name:'保存阶段草稿',exact:true}).click();await expect(page.getByText('草稿和自评准备已保存。',{exact:true})).toBeVisible();const projectId=new URL(page.url()).searchParams.get('project')!;await page.getByRole('button',{name:'关闭项目教学',exact:true}).click();
  const records=page.getByLabel('我的资料项目记录',{exact:true});await records.locator('summary').click();await expect(records).toContainText('已保存内容 1/3');await records.getByRole('link',{name:'继续这份项目 →',exact:true}).click();await expect(page.getByRole('textbox',{name:'我准备核查的主张',exact:true})).toHaveValue('来源课程项目的保存稿');expect(new URL(page.url()).searchParams.get('project')).toBe(projectId);await page.getByRole('button',{name:'关闭项目教学',exact:true}).click();
  await first.getByRole('link',{name:'继续讲解 →',exact:true}).click();await expect(page.locator('.cl-session-navigation')).toContainText('2 / 6');expect(new URL(page.url()).searchParams.get('session')).toBe(sessionId);await page.getByRole('button',{name:'离开课堂',exact:true}).click();await page.getByRole('button',{name:'保存并离开',exact:true}).click();await first.getByRole('link',{name:'进入课堂练习',exact:true}).click();await expect(page.locator('.cl-practice-prompt>small')).toContainText('2 / 2');expect(new URL(page.url()).searchParams.get('session')).toBe(sessionId);const current=await call(actor,'GET','/learning/classroom/sessions/'+sessionId);expect(current.answers).toHaveLength(1);expect((await call(actor,'GET','/learning/source-courses/'+row.id)).formalMeasurementEligible).toBe(false);
});

test('returning from a course restores the personal project step and mode while an explicit URL takes priority',async({page})=>{
  await enter(page);await page.getByRole('link',{name:'打开资料应用项目 →',exact:true}).click();await page.getByRole('button',{name:'开始这个项目 →',exact:true}).click();await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await page.getByRole('textbox',{name:'我准备核查的主张',exact:true}).fill('准备核查一个有条件的解释');await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await page.getByRole('textbox',{name:'原文位置与依据',exact:true}).fill('匿名来源第1段，保留适用条件');await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await expect(page.getByRole('region',{name:'当前项目步骤'})).toContainText('整理证据与附件');await page.getByRole('button',{name:'关闭项目教学',exact:true}).click();await page.getByRole('link',{name:'打开资料应用项目 →',exact:true}).click();await expect(page.getByRole('region',{name:'当前项目步骤'})).toContainText('整理证据与附件');
  await page.getByRole('button',{name:'完整作品',exact:true}).click();await page.getByRole('link',{name:'‹ 返回课程',exact:true}).click();await page.getByRole('link',{name:'打开资料应用项目 →',exact:true}).click();await expect(page.locator('.pj-stage-heading')).toBeVisible();await expect(page.getByRole('textbox',{name:'我准备核查的主张',exact:true})).toHaveValue('准备核查一个有条件的解释');const url=new URL(page.url());url.searchParams.set('step','intro');url.searchParams.delete('view');await page.goto(url.toString());await expect(page.getByRole('region',{name:'当前项目步骤'})).toContainText('STEP 1 OF 5');
});

test('adult course journey keeps reading, unit check and project separate and resumes the same saved classroom',async({page})=>{
  await enter(page);await page.goto('/studio/classroom?unit=0&panel=units');const journey=page.getByLabel('本单元学习进程',{exact:true});await journey.locator('summary').click();await expect(journey).toContainText('社会学视角综合核查');const first=journey.locator('ol>li').first();await first.getByRole('button',{name:'开始讲解',exact:true}).click();await page.getByRole('button',{name:'下一步 ›',exact:true}).click();await expect(page.locator('.cl-session-navigation')).toContainText('2 / 8');const sessionId=new URL(page.url()).searchParams.get('session')!;await page.getByRole('button',{name:'离开课堂',exact:true}).click();await page.getByRole('button',{name:'保存并离开',exact:true}).click();await journey.locator('summary').click();await expect(first).toContainText('讲解进行中');await first.getByRole('button',{name:'继续讲解',exact:true}).click();await expect(page.locator('.cl-session-navigation')).toContainText('2 / 8');expect(new URL(page.url()).searchParams.get('session')).toBe(sessionId);
});

test('an entire adult unit retains every lesson, complete practice, unit check and all project submissions as separate facts',async({page})=>{
  test.setTimeout(300000);const{actor}=await enter(page),catalog=await call(actor,'GET','/learning/classroom/catalog'),unit=catalog.course.units[0],lessons=unit.lectures.flatMap((lecture:any)=>lecture.lessons);
  const journey=page.getByLabel('本单元学习进程',{exact:true});
  for(let index=0;index<lessons.length;index++){
    await page.goto('/studio/classroom?unit=0&panel=units');await journey.locator('summary').click();
    await journey.locator('ol>li').nth(index).getByRole('button',{name:'开始讲解',exact:true}).click();
    const session=await finishReading(page,actor);await finishQuestions(page,session);await leaveClassroom(page);
  }
  await journey.locator('summary').click();await journey.locator('ol>li').last().getByRole('button',{name:'开始练习',exact:true}).click();
  await expect(page.locator('.cl-practice-options label').first()).toBeVisible();
  const checkId=new URL(page.url()).searchParams.get('session')!,check=await call(actor,'GET','/learning/classroom/sessions/'+checkId);
  await finishQuestions(page,check);await leaveClassroom(page,true);await journey.locator('summary').click();
  await journey.getByRole('link',{name:'开始项目 →',exact:true}).click();await page.getByRole('button',{name:'开始这个项目 →',exact:true}).click();
  await expect(page.getByRole('region',{name:'当前项目步骤'})).toBeVisible();const projectId=new URL(page.url()).searchParams.get('project')!,project=await call(actor,'GET','/learning/projects/'+projectId);
  for(let index=0;index<project.definition.stages.length;index++){
    const stage=project.definition.stages[index];await expect(page.getByRole('region',{name:'当前项目步骤'})).toContainText(stage.title);await page.getByRole('button',{name:'下一步 ›',exact:true}).click();
    for(const field of stage.fields){await page.getByRole('textbox',{name:field.label,exact:true}).fill('合成整单元旅程作品，保留比较条件与未核查解释：'+field.id);await page.getByRole('button',{name:'下一步 ›',exact:true}).click();}
    await page.getByRole('button',{name:'下一步 ›',exact:true}).click();
    for(const criterion of await page.locator('.pj-reflection .pj-ratings fieldset').all()){await criterion.getByRole('radio').nth(1).check();await criterion.locator('textarea').fill('这是合成操作测试中的自评，仍需要真实教师核查。');}
    await page.getByRole('button',{name:'提交这个阶段 →',exact:true}).click();await expect(page.getByRole('button',{name:new RegExp('已提交 '+(index+1)+'/3')})).toBeVisible();
    if(index<project.definition.stages.length-1)await page.getByRole('button',{name:'下一阶段 ›',exact:true}).click();
  }
  await page.getByRole('button',{name:'关闭项目教学',exact:true}).click();await expect(page).toHaveURL(/unit=0/);await journey.locator('summary').click();
  const final=await call(actor,'GET','/learning/classroom/catalog'),ids=lessons.map((lesson:any)=>lesson.id),activities=final.lessonActivities.filter((item:any)=>ids.includes(item.lessonId));
  expect(activities).toHaveLength(lessons.length);expect(activities.every((item:any)=>item.reading.state==='read'&&item.practice.summary.complete)).toBe(true);
  expect(final.lessonActivities.find((item:any)=>item.lessonId==='unit-exam:'+unit.id).practice.summary.complete).toBe(true);
  expect(final.projectActivities.find((item:any)=>item.projectId===projectId)).toMatchObject({submittedStages:3,reviewedStages:0,readyStages:0});
  await expect(journey).toContainText('已提交 3/3');await expect(journey).toContainText('最新提交已有人工复核 0/3');
  await page.reload();await journey.locator('summary').click();await expect(journey).toContainText('已提交 3/3');
});

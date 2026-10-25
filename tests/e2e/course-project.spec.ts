import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const api=`http://localhost:${process.env.E2E_API_PORT??'4107'}/api`;
async function login(page:Page) {
  const suffix=Date.now()+'-'+Math.floor(Math.random()*100000),principal='projects-'+suffix+'@local.test',credential='Projects-'+suffix;
  const response=await fetch(api+'/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({principal,credential})});expect(response.status).toBe(201);const actor=(await response.json()).data;
  await page.goto('/parent/login');await page.getByLabel('登录账号').fill(principal);await page.getByLabel('密码').fill(credential);await page.getByRole('button',{name:'登录，查看学习记录 →'}).click();await expect(page).toHaveURL(/\/learn(?:\?|$)/);return actor;
}
async function capture(page:Page,name:string){if(!process.env.E2E_PROJECT_SNAPSHOT)return;mkdirSync('data/qa/course-projects',{recursive:true});await page.evaluate(()=>window.scrollTo(0,0));await page.locator('.pj-dialog').evaluateAll(elements=>elements.forEach(element=>element.scrollTop=0));await page.screenshot({path:`data/qa/course-projects/${name}.png`,fullPage:true});}
async function selfAssess(page:Page) {
  const rubric=page.locator('.pj-reflection');if(!await rubric.getAttribute('open'))await rubric.locator('summary').click();
  const fields=rubric.locator('.pj-ratings fieldset');for(let index=0;index<await fields.count();index++){
    await fields.nth(index).getByRole('radio').nth(1).check();await fields.nth(index).getByRole('textbox').fill('具体依据：保留了观察记录，另一种解释仍需要比较。');
  }
}
test('project stages save artifacts, evidence and self-assessment; immutable submissions remain available after revisions',async({page})=>{
  test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await login(page);
  await page.goto('/studio/classroom?unit=0&panel=units&q=社会');await page.getByRole('link',{name:'开始项目 →',exact:true}).click();
  await expect(page.getByRole('button',{name:'开始这个项目 →'})).toBeVisible();
  await page.getByRole('button',{name:'开始这个项目 →'}).click();await page.getByRole('button',{name:'完整作品',exact:true}).click();await expect(page.locator('.pj-stage-heading')).toContainText('界定研究问题');
  await page.getByLabel('匿名情境与已知观察').fill('匿名社区观察：周末阅览室有排队，工作日有空位。');await page.getByLabel('可以研究的问题').fill('比较开放时间与使用条件，解释两个时段的差别。');
  await page.getByRole('button',{name:'＋ 添加证据'}).click();await page.getByLabel('证据名称').fill('分时段观察记录');await page.getByLabel('观察或摘录').fill('两个周末和两个工作日各观察一次，仍缺少晚间记录。');await page.getByLabel('来源链接（可选）').fill('https://example.org/research');
  await selfAssess(page);await page.getByRole('button',{name:'保存阶段草稿',exact:true}).click();await expect(page.locator('.pj-notice')).toContainText('已保存');
  await page.reload();await expect(page.getByLabel('匿名情境与已知观察')).toHaveValue('匿名社区观察：周末阅览室有排队，工作日有空位。');await expect(page.getByLabel('证据名称')).toHaveValue('分时段观察记录');
  await expect(page.locator('.pj-ratings input:checked')).toHaveCount(4);
  await page.getByRole('button',{name:'提交这个阶段 →',exact:true}).click();await expect(page.locator('.pj-history-row')).toHaveCount(1);
  await page.getByLabel('匿名情境与已知观察').fill('修订观察：补充晚间时段，区分使用规则和个人选择。');await page.getByLabel('这次修订改变了什么').fill('补充晚间观察，检查时间安排的替代解释。');
  await page.getByRole('button',{name:'提交修订版本 →'}).click();await expect(page.locator('.pj-history-row')).toHaveCount(2);
  await page.locator('.pj-history-row').filter({hasText:'提交 v1'}).click();const dialog=page.getByRole('dialog',{name:'项目提交版本'});await expect(dialog).toContainText('周末阅览室有排队');await expect(dialog).not.toContainText('修订观察');await expect(dialog).toContainText('还没有人工复核');await capture(page,'submission-v1');await dialog.getByRole('button',{name:'关闭提交版本'}).click();
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:960});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await capture(page,'project-'+width);}
  await page.getByRole('button',{name:'下一阶段 ›'}).click();await expect(page.locator('.pj-stage-heading')).toContainText('比较机制与设计方法');await page.reload();await expect(page.locator('.pj-stage-heading')).toContainText('比较机制与设计方法');
  await page.getByRole('link',{name:'‹ 返回课程'}).click();await expect(page).toHaveURL(/\/studio\/classroom/);expect(new URL(page.url()).searchParams.get('panel')).toBe('units');expect(errors).toEqual([]);
});
test('a lost save response replays the same request; a stale page preserves local input and can recover',async({page})=>{
  test.setTimeout(90000);const actor=await login(page);await page.goto('/studio/projects?unitId=soc-u2');await page.getByRole('button',{name:'开始这个项目 →'}).click();await page.getByRole('button',{name:'完整作品',exact:true}).click();
  await page.getByLabel('与前一单元问题的联系').fill('本地输入：保留研究问题');const keys:string[]=[];let lost=false;
  await page.route('**/api/learning/projects/*',async route=>{if(route.request().method()!=='PATCH'){await route.continue();return;}keys.push(route.request().postDataJSON().requestKey);if(!lost){lost=true;const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('failed');}else await route.continue();});
  await page.getByRole('button',{name:'保存阶段草稿',exact:true}).click();await expect(page.locator('.pj-notice')).toContainText('已保存');await expect(page.getByLabel('与前一单元问题的联系')).toHaveValue('本地输入：保留研究问题');expect(keys).toHaveLength(1); // The actor receipt confirms success without a second write.
  const projectId=new URL(page.url()).searchParams.get('project')!,headers={authorization:'Bearer '+actor.token,'content-type':'application/json'};
  const read=await fetch(api+'/learning/projects/'+projectId,{headers});const row=(await read.json()).data;
  const external=await fetch(api+'/learning/projects/'+projectId,{method:'PATCH',headers,body:JSON.stringify({expectedRevision:row.revision,requestKey:crypto.randomUUID(),stageId:row.currentStageId,artifact:{values:{link:'另一个页面保存的版本'},evidence:[]}})});expect(external.status).toBe(200);
  await page.getByLabel('与前一单元问题的联系').fill('冲突时必须保留的本地文字');await page.getByRole('button',{name:'保存阶段草稿',exact:true}).click();await expect(page.locator('.pj-error')).toContainText('其他页面更新');await expect(page.getByLabel('与前一单元问题的联系')).toHaveValue('冲突时必须保留的本地文字');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'保留本地副本并读取已保存版本'}).click();expect((await download).suggestedFilename()).toContain('草稿');await expect(page.getByLabel('与前一单元问题的联系')).toHaveValue('另一个页面保存的版本');await expect(page.locator('.pj-save-state')).toContainText('已保存');
});
test('unsaved-stage navigation asks to preserve work and unavailable AI leaves the saved artifact usable',async({page})=>{
  await login(page);await page.goto('/studio/projects?unitId=soc-u3');await page.getByRole('button',{name:'开始这个项目 →'}).click();await page.getByRole('button',{name:'完整作品',exact:true}).click();await page.getByLabel('文字地图或资源表').fill('待保存的资源与进入条件');
  await page.getByRole('button',{name:/比较分层机制/}).click();const confirm=page.getByRole('dialog',{name:'保留项目修改'});await expect(confirm).toBeVisible();await confirm.getByRole('button',{name:'继续编辑'}).click();await expect(page.getByLabel('文字地图或资源表')).toHaveValue('待保存的资源与进入条件');
  await page.getByRole('button',{name:/比较分层机制/}).click();await confirm.getByRole('button',{name:'保存并继续'}).click();await expect(page.locator('.pj-stage-heading')).toContainText('比较分层机制');
  await page.getByRole('button',{name:/绘制资源与障碍地图/}).click();await expect(page.getByLabel('文字地图或资源表')).toHaveValue('待保存的资源与进入条件');
  await page.getByRole('button',{name:'分析已保存草稿'}).click();await expect(page.locator('.pj-error')).toBeVisible();await expect(page.getByLabel('文字地图或资源表')).toHaveValue('待保存的资源与进入条件');await page.getByRole('button',{name:'读取已保存版本',exact:true}).click();await expect(page.locator('.pj-error')).toHaveCount(0);await expect(page.getByRole('button',{name:'保存阶段草稿',exact:true})).toBeEnabled();
});
test('a guardian reviews a learner submission in the curriculum project workspace and the learner keeps its version',async({page})=>{
  test.setTimeout(90000);const actor=await login(page),headers={'content-type':'application/json',authorization:'Bearer '+actor.token};
  async function call(path:string,body:object,token=actor.token,method='POST'){const response=await fetch(api+path,{method,headers:{...headers,authorization:'Bearer '+token},body:JSON.stringify(body)});expect(response.status).toBe(method==='PUT'?200:201);return(await response.json()).data;}
  const studentId=(await call('/students',{nickname:'项目复核测试',grade:5,preferredSessionMinutes:15,defaultVersionMap:{math:'common',chinese:'common',english:'common'}})).profile.id;
  await call(`/students/${studentId}/learning-scope`,{subject:'math',grade:5,term:'upper',textbookVolumeId:null,textbookVersion:'项目测试范围',learnedAtomIds:['core:math:fractionadd'],currentAtomId:'core:math:fractionadd',minutesPerSession:15,progressMode:'knowledge',selectedLessonIds:[]},actor.token,'PUT');
  const preview=await call('/learning/studio/courses/preview',{studentId,subject:'math',title:'项目与核查'}),course=await call('/learning/studio/courses',{studentId,subject:'math',title:'项目与核查',objective:preview.objective,previewFingerprint:preview.fingerprint,requestKey:crypto.randomUUID()});
  const access=await call(`/students/${studentId}/learning-access`,{enabled:true,expectedVersion:0,requestKey:crypto.randomUUID(),reason:'测试孩子项目保存与人工复核'}),code=await call(`/students/${studentId}/learning-access/codes`,{expectedVersion:access.version,requestKey:crypto.randomUUID()});
  const learner=await call('/auth/learning-code',{code:code.code}),project=await call('/learning/projects',{studioCourseId:course.id,unitId:course.units[0].id},learner.token);
  const stage=project.definition.stages[0],ratings=project.definition.rubric.map((criterion:{id:string})=>({criterionId:criterion.id,level:1,evidence:'有过程记录，核查方式待补充。'}));
  const submitted=await call('/learning/projects/'+project.id+'/submissions',{expectedRevision:0,requestKey:crypto.randomUUID(),stageId:stage.id,artifact:{values:Object.fromEntries(stage.fields.map((field:{id:string})=>[field.id,'匿名新情境：保留步骤并说明共同单位。'])),evidence:[]},selfRatings:ratings,revisionNote:''},learner.token);
  await page.goto('/studio/projects?'+new URLSearchParams({studioCourseId:course.id,project:project.id,unitId:course.units[0].id,view:'complete'}));await expect(page.getByText('正在查看学习者项目。',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'保存阶段草稿',exact:true})).toBeDisabled();await page.locator('.pj-history-row').click();
  const dialog=page.getByRole('dialog',{name:'项目提交版本'});for(const field of await dialog.locator('.pj-ratings fieldset').all()){await field.getByRole('radio').nth(2).check();await field.getByRole('textbox').fill('作品保留了步骤；建议再比较另一种核查方法。');}
  await dialog.getByLabel('具体反馈与下一步').fill('保留当前过程，下次补充独立检查结果。');await dialog.getByRole('button',{name:'保存人工复核'}).click();await expect(dialog).toContainText('保留当前过程，下次补充独立检查结果。');await capture(page,'guardian-review');
  const response=await fetch(api+'/learning/projects/'+project.id,{headers:{authorization:'Bearer '+learner.token}});const restored=(await response.json()).data;expect(restored.reviews).toHaveLength(1);expect(restored.reviews[0].reviewerRole).toBe('parent');expect(restored.submissions).toEqual(submitted.submissions);
  await dialog.getByRole('button',{name:'关闭提交版本'}).click();await page.goto('/studio?'+new URLSearchParams({view:'courses',course:course.id,student:studentId,subject:'math'}));
  await page.getByRole('link',{name:'打开项目 →',exact:true}).click();await page.getByRole('button',{name:'完整作品',exact:true}).click();await expect(page.getByText('正在查看学习者项目。',{exact:false})).toBeVisible();await expect(page.locator('.pj-history-row')).toHaveCount(1);
});
test('all five adult projects complete their three stages and can cite earlier immutable artifacts',async({page})=>{
  test.setTimeout(180000);await login(page);
  for(let unit=1;unit<=5;unit++){
    await page.goto('/studio/projects?unitId=soc-u'+unit);await page.getByRole('button',{name:'开始这个项目 →'}).click();await page.getByRole('button',{name:'完整作品',exact:true}).click();
    for(let phase=0;phase<3;phase++){
      await expect(page.locator('.pj-stage-heading')).toContainText(`STAGE ${phase+1} / 3`);await expect(page.locator('.pj-artifact textarea')).toHaveCount(2);
      for(const field of await page.locator('.pj-artifact textarea').all())await field.fill(`匿名研究产物，单元${unit}阶段${phase+1}：记录观察条件、概念联系、替代解释和需要核查的限制。`);
      if(unit>1&&phase===0){const reference=page.locator('.pj-reference>details').first();await reference.locator('summary').click();await reference.getByRole('button',{name:'引用此版本摘录',exact:true}).first().click();await expect(page.getByLabel('证据名称')).toHaveValue(/摘录/);}
      await selfAssess(page);await page.getByRole('button',{name:'提交这个阶段 →',exact:true}).click();await expect(page.locator('.pj-history-row')).toHaveCount(1);
      if(phase<2)await page.getByRole('button',{name:'下一阶段 ›'}).click();
    }
    await page.reload();await expect(page.locator('.pj-route-label')).toContainText('3/3');await expect(page.locator('.pj-history-row')).toHaveCount(1);await expect(page.locator('.pj-artifact textarea').first()).toHaveValue(new RegExp(`单元${unit}阶段3`));
  }
});

import { expect,type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { syntheticFamilyHeaders } from './synthetic-family';
import { browserEvidence } from './evidence';
export const api='http://localhost:'+(process.env.E2E_API_PORT??'4209')+'/api',evidence=browserEvidence('assistant-practice-workspace');
export const panel=(page:Page)=>page.getByRole('dialog',{name:'对话练习安排',exact:true});
export async function fixture(page:Page,media=false){
 const headers=await syntheticFamilyHeaders(page),nonce=crypto.randomUUID(),principal='conversation-practice-'+nonce,credential='Owned-practice-'+nonce;
 async function call(path:string,body?:unknown,method=body===undefined?'GET':'POST',actor?:any){const response=await fetch(api+path,{method,headers:{...headers,...(actor?{Authorization:'Bearer '+actor.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json();expect(response.ok,path+':'+JSON.stringify(value.error)).toBe(true);return value.data;}
 const actor=await call('/auth/register',{principal,credential}),child=(await call('/students',{nickname:'对话练习测试档案',grade:4,preferredSessionMinutes:15,defaultVersionMap:{math:'',chinese:'',english:''}},'POST',actor)).profile;
 const setup=await call('/qa/conversation-practice',{studentId:child.id,media},'POST',actor);await call('/students/'+child.id+'/learning-scope',setup.scope,'PUT',actor);
 const source=await call('/ai/assistant/sessions',{userRole:'parent',studentId:child.id,subject:'math',pageContext:'student_home'},'POST',actor);
 const history=await call('/qa/assistant/seed-history',{sessionId:source.id,count:2,marker:'ORIGINAL_PRACTICE_SOURCE'},'POST',actor);
 await page.goto('/parent/login');await page.getByLabel('登录账号').fill(principal);await page.getByLabel('密码').fill(credential);await page.getByRole('button',{name:'登录，查看学习记录 →',exact:true}).click();await expect(page).toHaveURL(/\/studio(?:\?|$)/);
 const href='/studio?'+new URLSearchParams({student:child.id,subject:'math',mode:'instant'});await page.goto(href);await expect(page.locator('[data-message-id="'+history.ids[1]+'"]').getByRole('button',{name:'安排练习',exact:true})).toBeVisible();
 const base='/ai/assistant/sessions/'+source.id+'/artifacts/practice';
 return {actor,child,source,setup,href,base,messageId:history.ids[1],call:(path:string,body?:unknown,method?:string)=>call(path,body,method,actor),principal,credential};
}
export async function enter(page:Page,f:Awaited<ReturnType<typeof fixture>>){await page.locator('[data-message-id="'+f.messageId+'"]').getByRole('button',{name:'安排练习',exact:true}).click();await expect(panel(page)).toBeVisible();}
export async function selectAndCreate(page:Page){const dialog=panel(page);for(let index=1;index<=3;index++)await dialog.getByRole('checkbox',{name:'合成条件与单位'+index,exact:true}).check();await dialog.getByRole('button',{name:'核对练习来源与覆盖',exact:true}).click();await expect(dialog.getByRole('button',{name:'保存审核题候选',exact:true})).toBeEnabled();await dialog.getByRole('button',{name:'保存审核题候选',exact:true}).click();await expect(dialog.getByRole('region',{name:'审核题候选与明确安排',exact:true})).toBeVisible();}
export async function assign(page:Page){await panel(page).getByRole('button',{name:'已核对，明确安排给孩子',exact:true}).click();await expect(panel(page).getByRole('link',{name:'打开原教学安排 →',exact:true})).toBeVisible();const href=await panel(page).getByRole('link',{name:'打开原教学安排 →',exact:true}).getAttribute('href');return href!;}
export async function learner(page:Page,f:Awaited<ReturnType<typeof fixture>>,href:string){const access=await f.call('/students/'+f.child.id+'/learning-access',{enabled:true,expectedVersion:0,requestKey:crypto.randomUUID(),reason:'合成浏览器验证真实本人独立练习身份'}),code=await f.call('/students/'+f.child.id+'/learning-access/codes',{expectedVersion:access.version,requestKey:crypto.randomUUID()});await page.goto('/student/login');await page.getByLabel('一次性学习码').fill(code.code);await page.getByRole('button',{name:'进入我的学习 →',exact:true}).click();await expect(page).toHaveURL(/\/studio(?:\?|$)/);await page.goto(href);await expect(page.getByRole('button',{name:'本人开始这一组 →',exact:true}).first()).toBeEnabled();}
export async function start(page:Page){await page.getByRole('button',{name:'本人开始这一组 →',exact:true}).first().click();await expect(page.getByRole('textbox',{name:'数字或分数答案',exact:true})).toBeEnabled();}
export async function shot(page:Page,name:string){mkdirSync(evidence,{recursive:true});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:evidence+'/'+name+'.png',fullPage:true});}

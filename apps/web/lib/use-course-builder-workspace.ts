'use client';
import * as React from 'react';
import type { StudioCourse, StudioCoursePreview, StudioOverview } from '@study-agent/contracts';
import { apiRequest, ApiRequestError } from './api';
import { completeCourseBuilderCopy, emptyCourseBuilderDraft, readCourseBuilderCopy, courseBuilderDraftCommand, courseBuilderScope,
 courseBuilderPreview, prepareCourseBuilderCreate, downloadCourseBuilderCopy, courseBuilderValueHash as hash, courseBuilderArchiveByteLimit,
 type CourseBuilderDraft, type CourseBuilderOwner, type CourseBuilderPending } from './course-builder-copy';
import { loadCourseBuilderLocal, saveCourseBuilderLocal, CourseBuilderLocalUnavailable, type CourseBuilderLocalVersion } from './course-builder-local';
import { lookupCourseBuilderCommand, sendCourseBuilderCommand } from './course-builder-client';
import { useWorkspaceExitGuard } from './use-workspace-exit-guard';
import { refreshSessionUser } from './session-user';

const retained=new Map<string,{copy:CourseBuilderDraft;version:CourseBuilderLocalVersion}>(),exitEvent='study:controlled-copy-exit';
const memoryKey=(owner:CourseBuilderOwner,slot:string)=>JSON.stringify([owner,slot]),validSlot=(value:string|null):value is string=>Boolean(value&&/^[a-zA-Z0-9_-]{1,180}$/.test(value));
const message=(error:unknown)=>error instanceof Error?error.message:'当前操作暂未完成，完整课程输入仍保留。';
const aborted=()=>new DOMException('课程操作已停止，完整原请求仍保留。','AbortError');

export function useCourseBuilderWorkspace(owner:CourseBuilderOwner,selected:StudioOverview['selected'],initialTitle:string,onCreated:(course:StudioCourse)=>void){
 const ownerKey=JSON.stringify(owner),[copy,setCopy]=React.useState<CourseBuilderDraft|null>(null),[loaded,setLoaded]=React.useState(false),[denied,setDenied]=React.useState(false),
  [error,setError]=React.useState(''),[notice,setNotice]=React.useState(''),[storage,setStorage]=React.useState('正在核对完整课程稿…'),[busy,setBusy]=React.useState(''),
  [protectedCopy,setProtectedCopy]=React.useState(false),[preview,setPreview]=React.useState<StudioCoursePreview|null>(null),[leaving,setLeaving]=React.useState<{proceed:()=>void}|null>(null);
 const state=React.useRef<CourseBuilderDraft|null>(null),lifecycle=React.useRef(new AbortController()),operation=React.useRef<{token:symbol;controller:AbortController}|null>(null),
  queue=React.useRef<Promise<unknown>>(Promise.resolve()),version=React.useRef<CourseBuilderLocalVersion>({revision:null,fingerprint:null}),slot=React.useRef(''),dirty=React.useRef(false),
  downloaded=React.useRef<string|null>(null),exported=React.useRef<string|null>(null),verified=React.useRef(new Set<string>()),bypass=React.useRef(false),blocked=React.useRef(false),
  currentSelected=React.useRef(selected),createCallback=React.useRef(onCreated);
 currentSelected.current=selected;createCallback.current=onCreated;
 function alive(signal=lifecycle.current.signal){if(signal.aborted||signal!==lifecycle.current.signal)throw aborted();}
 function actual(){const value=state.current;if(!value||JSON.stringify(value.owner)!==ownerKey||value.slot!==slot.current||blocked.current)throw Error('当前账号或课程稿已改变，请先核对。');return value;}
 async function identity(signal=lifecycle.current.signal){const life=lifecycle.current.signal,user=await apiRequest<{id:string;role:string}>('/auth/me',{signal});alive(life);if(signal.aborted)throw aborted();
  if(user.id!==owner.actorId||user.role!==owner.role)throw new ApiRequestError('当前登录身份或角色已改变，原课程稿已隐藏。',403);
 }
 function accessFailure(error:unknown){if(error instanceof ApiRequestError&&[401,403].includes(error.status)){blocked.current=true;setDenied(true);operation.current?.controller.abort();void refreshSessionUser();}setError(message(error));}
 function adopt(value:CourseBuilderDraft,changed=true){state.current=value;setCopy(value);dirty.current=changed;downloaded.current=null;exported.current=null;setProtectedCopy(!changed);
  if(changed){retained.set(memoryKey(owner,value.slot),{copy:value,version:{...version.current}});setStorage('正在保留完整课程稿…');}else retained.delete(memoryKey(owner,value.slot));}
 function localFailure(error:unknown){if(!lifecycle.current.signal.aborted){setStorage(message(error));setError(message(error));if(dirty.current)setProtectedCopy(false);}}
 async function persist(value:CourseBuilderDraft,requireCurrent=true){
  const signal=lifecycle.current.signal,chosen=slot.current,job=queue.current.then(async()=>{alive(signal);const complete=await completeCourseBuilderCopy(value,signal);alive(signal);if(state.current!==value){if(requireCurrent)throw Error('课程输入已更新，请保留最新完整稿后重试。');return complete;}
   try{const saved=await saveCourseBuilderLocal(complete,owner,chosen,version.current,signal);alive(signal);version.current=saved;}
   catch(error){alive(signal);if(downloaded.current!==complete.fingerprint)throw error;}
   if(state.current===value){retained.delete(memoryKey(owner,chosen));dirty.current=false;setProtectedCopy(true);setStorage(downloaded.current===complete.fingerprint?'完整下载副本已读回；本机存储仍需核对。':'完整课程稿已保存并读回核对。');}return complete;
  });queue.current=job.catch(()=>{});return job;
 }
 function setLocation(chosen:string){bypass.current=true;try{const url=new URL(window.location.href);url.searchParams.set('courseDraft',chosen);window.history.replaceState(null,'',url.pathname+url.search);}finally{bypass.current=false;}}
 React.useEffect(()=>{
  const controller=new AbortController();lifecycle.current.abort();lifecycle.current=controller;operation.current=null;blocked.current=false;setDenied(false);setLoaded(false);setCopy(null);state.current=null;
  setPreview(null);setBusy('');setError('');setNotice('');setLeaving(null);verified.current.clear();version.current={revision:null,fingerprint:null};downloaded.current=null;exported.current=null;dirty.current=false;
  const recent='study.course-builder.last-slot:'+ownerKey,linked=new URLSearchParams(window.location.search).get('courseDraft');let chosen=linked;
  if(chosen!==null&&!validSlot(chosen)){setError('链接中的课程稿标识无法核对，原记录保持。');return()=>controller.abort();}
  if(!chosen)try{const prior=sessionStorage.getItem(recent);if(validSlot(prior))chosen=prior;}catch{}
  const fresh=!chosen;if(!chosen)chosen=crypto.randomUUID();const selectedSlot=chosen;slot.current=selectedSlot;setLocation(selectedSlot);try{sessionStorage.setItem(recent,selectedSlot);}catch{}
  const memory=retained.get(memoryKey(owner,selectedSlot));
  void loadCourseBuilderLocal(owner,selectedSlot,controller.signal).then(async saved=>{alive(controller.signal);
   if(memory&&(memory.version.revision!==saved.revision||memory.version.fingerprint!==saved.fingerprint)){version.current=memory.version;adopt(memory.copy);setLoaded(true);setStorage('另一标签已修改或清空原稿。当前全部输入仍保留，请下载并核对两份原稿。');return;}
   version.current={revision:saved.revision,fingerprint:saved.fingerprint};
   if(memory)adopt(memory.copy);else if(saved.copy){const{fingerprint:_fingerprint,...body}=saved.copy;adopt(body,false);setStorage('完整课程稿已读回，原创建结果仍须向服务器核对。');}
   else if(fresh)adopt(emptyCourseBuilderDraft(owner,selectedSlot,currentSelected.current,initialTitle));
   else{setError('这份原课程稿不存在或已清空，未用空稿覆盖。可明确另开完整稿。');setLoaded(true);return;}
   setLoaded(true);
  }).catch(error=>{if(!controller.signal.aborted){if(error instanceof CourseBuilderLocalUnavailable&&(fresh||memory)){adopt(memory?.copy??emptyCourseBuilderDraft(owner,selectedSlot,currentSelected.current,initialTitle),Boolean(memory));setLoaded(true);setStorage(message(error));}else{setLoaded(true);setError(message(error));setStorage('原记录没有被空稿覆盖。');}}});
  return()=>{controller.abort();operation.current?.controller.abort();};
 },[ownerKey]);
 React.useEffect(()=>{if(!loaded)return;const signal=lifecycle.current.signal,check=()=>{if(document.visibilityState==='visible')void identity(signal).catch(error=>{if(!signal.aborted)accessFailure(error);});};check();window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);return()=>{window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);};},[loaded,ownerKey]);
 React.useEffect(()=>{if(!loaded||!copy||!dirty.current)return;const timer=setTimeout(()=>{if(state.current===copy)void persist(copy,false).catch(error=>{if(state.current===copy)localFailure(error);});},300);return()=>clearTimeout(timer);},[loaded,copy]);
 function request(proceed:()=>void){if(!dirty.current||blocked.current){proceed();return;}const value=state.current;if(!value||operation.current){setLeaving({proceed});return;}
  // Save and read back the latest complete input first; ask for a downloaded copy only when local protection fails.
  void persist(value).then(()=>{if(state.current===value&&!dirty.current)proceed();else setLeaving({proceed});}).catch(error=>{localFailure(error);setLeaving({proceed});});}
 useWorkspaceExitGuard(owner.actorId,Boolean(copy&&!denied),{request:(_href,proceed)=>request(proceed),isInternal:()=>bypass.current});
 React.useEffect(()=>{const leave=(event:Event)=>{if(!dirty.current)return;event.preventDefault();request((event as CustomEvent<{proceed:()=>void}>).detail.proceed);},unload=(event:BeforeUnloadEvent)=>{if(dirty.current){event.preventDefault();event.returnValue='';}};window.addEventListener(exitEvent,leave);window.addEventListener('beforeunload',unload);return()=>{window.removeEventListener(exitEvent,leave);window.removeEventListener('beforeunload',unload);};},[]);
 async function work(label:string,run:(signal:AbortSignal)=>Promise<void>,requiresCopy=true){if(operation.current)return;const token=Symbol(label),controller=new AbortController(),life=lifecycle.current.signal;operation.current={token,controller};setBusy(label);setError('');
  try{await identity(controller.signal);if(requiresCopy)actual();else if(blocked.current)throw Error('请重新核对当前登录身份。');await run(controller.signal);alive(life);}catch(error){if(!life.aborted&&(error as Error).name!=='AbortError'){accessFailure(error);if(error instanceof Error&&error.name==='ZodError')setError('请核对课程名称、目标、时间与完整选择；原文字仍保留。');}}
  finally{if(operation.current?.token===token){operation.current=null;if(!life.aborted)setBusy('');}}
 }
 function update(form:Partial<CourseBuilderDraft['form']>){if(operation.current||blocked.current)return;const value=actual();if(value.pending){setError('请先核对原创建结果；当前原请求与完整表单保持。');return;}adopt({...value,form:{...value.form,...form},preview:null});setPreview(null);setError('');}
 async function settle(entry:CourseBuilderPending){if(entry.phase!=='rejected'){setNotice(entry.message);return;}const value=actual();if(value.pending?.input.requestKey!==entry.input.requestKey)throw Error('当前课程稿已变化，原拒绝结果没有覆盖它。');
  const next={...value,pending:null,preview:null,history:[...value.history,entry].slice(-100)};adopt(next);setPreview(null);await persist(next);setNotice('');setError('没有创建课程：'+entry.message+' 完整课程稿和原请求记录已保留，请核对当前学习范围后重新预览。');}
 async function retainPending(entry:CourseBuilderPending){const current=actual();if(current.pending&&await hash(current.pending)===await hash(entry)){await persist(current);return;}const next={...current,pending:entry};adopt(next);await persist(next);}
 async function generate(){await work('正在核对课程蓝图',async signal=>{const value=actual(),selected=currentSelected.current;
  if(value.pending)throw Error('请先恢复原创建结果。');if(await hash(value.scope)!==await hash(courseBuilderScope(selected?.scope,selected?.grade??3)))throw Error('当前范围已改变，请保留本稿并按新范围另开课程稿。');
  const command=courseBuilderDraftCommand(value);await persist(value);const result=await apiRequest<StudioCoursePreview>('/learning/studio/courses/preview',{method:'POST',body:JSON.stringify(command),signal,headers:{'X-Study-Actor':owner.actorId}});if(signal.aborted)throw aborted();
  const details=await courseBuilderPreview(value,result),next={...value,preview:details};adopt(next);await persist(next);setPreview(result);setNotice('已核对完整课程蓝图，请确认具体课时、版本与缺口后再创建。');
 });}
 async function create(){await work('正在确认并保存课程',async signal=>{if(!preview)throw Error('请先重新预览当前完整输入。');const value=actual(),entry=await prepareCourseBuilderCreate(value,crypto.randomUUID()),next={...value,pending:entry};
  await completeCourseBuilderCopy(next);adopt(next);await persist(next);const result=await sendCourseBuilderCommand(owner,entry,retainPending,signal);if(signal.aborted)throw aborted();if(result.verified){verified.current.add(result.entry.input.requestKey);createCallback.current(result.course);}else await settle(result.entry);
 });}
 async function lookup(){await work('正在核对原创建结果',async signal=>{const value=actual();if(!value.pending)throw Error('当前没有待核对的原创建请求。');const result=await lookupCourseBuilderCommand(owner,value.pending,signal);if(signal.aborted)throw aborted();await retainPending(result.entry);if(result.verified){verified.current.add(result.entry.input.requestKey);setNotice('服务器原请求和原课程已核对。可以打开原课程，或另开新课程稿。');}else await settle(result.entry);});}
 async function recover(){await work('正在恢复同一原请求',async signal=>{const value=actual();if(!value.pending)throw Error('当前没有原创建请求。');const result=await sendCourseBuilderCommand(owner,value.pending,retainPending,signal);if(signal.aborted)throw aborted();if(result.verified){verified.current.add(result.entry.input.requestKey);createCallback.current(result.course);}else await settle(result.entry);});}
 async function openOriginal(){await work('正在打开原课程',async signal=>{const value=actual();if(!value.pending)throw Error('当前没有原创建请求。');const result=await lookupCourseBuilderCommand(owner,value.pending,signal);await retainPending(result.entry);if(result.verified){verified.current.add(result.entry.input.requestKey);createCallback.current(result.course);}else await settle(result.entry);});}
 async function download(){await work('正在下载完整课程稿',async()=>{exported.current=await downloadCourseBuilderCopy(actual());setNotice('完整副本已开始下载，请读回刚下载的文件核对后再离开。');});}
 async function verifyFile(file:File|undefined){if(!file)return;await work('正在读回下载副本',async signal=>{if(file.size>courseBuilderArchiveByteLimit)throw Error('原副本超过256MiB读取预算，请保留文件并另行核对。');const value=actual(),saved=await readCourseBuilderCopy(JSON.parse(await file.text()),owner,signal),complete=await completeCourseBuilderCopy(value,signal);
  if(saved.copy.fingerprint!==complete.fingerprint||exported.current!==complete.fingerprint)throw Error('这个文件不是当前最新输入的完整下载副本，原稿保持。');downloaded.current=complete.fingerprint;dirty.current=false;setProtectedCopy(true);setStorage('当前完整下载副本已实际读回核对。');setNotice('可以安全保留此副本后继续。');});}
 async function fork(imported?:File,carryGoal=false){await work(imported?'正在导入完整课程稿':'正在另开课程稿',async signal=>{const current=state.current;if(current){if(current.pending&&!verified.current.has(current.pending.input.requestKey))throw Error('请先向服务器核对原创建结果，再另开课程稿。');await persist(current);}
  let next=emptyCourseBuilderDraft(owner,crypto.randomUUID(),currentSelected.current,carryGoal&&current?current.form.title:'');if(carryGoal&&current)next={...next,form:{...next.form,objective:current.form.objective,minutes:current.form.minutes}};if(imported){if(imported.size>courseBuilderArchiveByteLimit)throw Error('副本超过读取预算，原文件保持。');const parsed=await readCourseBuilderCopy(JSON.parse(await imported.text()),owner,signal),{fingerprint:_fingerprint,...body}=parsed.copy;next={...body,slot:next.slot};}
  await completeCourseBuilderCopy(next,signal);slot.current=next.slot;version.current={revision:null,fingerprint:null};verified.current.clear();setPreview(null);adopt(next);setLocation(next.slot);try{sessionStorage.setItem('study.course-builder.last-slot:'+ownerKey,next.slot);}catch{}setLoaded(true);await persist(next);setNotice(imported?'已另开完整导入稿；不会自动创建，原结果须重新核对。':'已按当前范围另开课程稿，原稿保留在原标识中。');
 },false);}
 function edit(){if(operation.current||actual().pending)return;const value=actual();adopt({...value,preview:null});setPreview(null);setError('');}
 return{copy,loaded,denied,error,notice,storage,busy,protectedCopy,preview,leaving,setLeaving,request,update,generate,create,lookup,recover,openOriginal,download,verifyFile,
  fresh:(carryGoal=false)=>fork(undefined,carryGoal),importFile:(file:File|undefined)=>file?fork(file):Promise.resolve(),edit,stop:()=>operation.current?.controller.abort(),verifiedOriginal:copy?.pending?verified.current.has(copy.pending.input.requestKey):false};
}

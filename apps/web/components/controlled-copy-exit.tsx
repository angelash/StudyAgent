'use client';
import * as React from 'react';
import {WorkspaceDialog} from '../app/studio/workspace-dialog';
import {useWorkspaceExitGuard} from '../lib/use-workspace-exit-guard';

const eventName='study:controlled-copy-exit';
/** Internal target selectors also cross a private draft boundary. */
export function requestControlledCopyExit(proceed:()=>void){
 if(typeof window==='undefined'||window.dispatchEvent(new CustomEvent(eventName,{cancelable:true,detail:{proceed}})))proceed();
}
/** Revision0 means the current complete copy was persisted or downloaded.
 * A later failed write invalidates an earlier download acknowledgement.
 */
export function useControlledCopyExit(ownerId:string,unprotectedRevision:number,download:()=>void){
 const [pending,setPending]=React.useState<{proceed:()=>void}|null>(null),[exported,setExported]=React.useState(0),latest=React.useRef(download);latest.current=download;
 useWorkspaceExitGuard(ownerId,unprotectedRevision>0,{request:(_href,proceed)=>{setPending({proceed});setExported(0);},isInternal:()=>false});
 React.useEffect(()=>{if(!unprotectedRevision)return;const leave=(event:Event)=>{event.preventDefault();setPending({proceed:(event as CustomEvent<{proceed:()=>void}>).detail.proceed});setExported(0);};
  const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener(eventName,leave);window.addEventListener('beforeunload',unload);return()=>{window.removeEventListener(eventName,leave);window.removeEventListener('beforeunload',unload);};
 },[unprotectedRevision]);
 return pending?<WorkspaceDialog onClose={()=>setPending(null)}><section className="workspace-material-dialog" role="dialog" aria-modal="true" aria-label="保留受控任务完整副本"><h2>先保留当前完整副本</h2><p>浏览器尚未保存这份最新输入。原命令和完整表单仍在当前页面，请下载后再切换。</p><div className="workspace-page-controls"><button className="studio-secondary" onClick={()=>{latest.current();setExported(unprotectedRevision);}}>下载当前完整副本</button><button className="studio-primary" disabled={unprotectedRevision>0&&exported<unprotectedRevision} onClick={()=>{const proceed=pending.proceed;setPending(null);proceed();}}>已保留副本，继续</button><button className="studio-text-button" onClick={()=>setPending(null)}>继续编辑</button></div></section></WorkspaceDialog>:null;
}

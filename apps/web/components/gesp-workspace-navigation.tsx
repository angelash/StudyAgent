'use client';
import { StudioNavigation } from '../app/studio/studio-navigation';
import { useSessionUser } from '../lib/session-user';
import { useWorkspaceExitGuard } from '../lib/use-workspace-exit-guard';
import type { WorkspaceNavigation } from '../lib/workspace-navigation';

export function GespWorkspaceNavigation({studentId,level,mode,pending=false,unavailable=false,onRequestNavigate}:{studentId?:string;level?:number;mode:'manage'|'learn';pending?:boolean;unavailable?:boolean;onRequestNavigate?:WorkspaceNavigation['onRequestNavigate']}){
  const owner=useSessionUser();
  useWorkspaceExitGuard(owner?.id??'',Boolean(owner&&onRequestNavigate),{request:(href,proceed)=>onRequestNavigate?.(href,proceed)});
  return <StudioNavigation active="courses" layout={mode==='learn'?'focus':'default'} activityKey={'gesp:'+studentId} trackContext={{kind:'gesp',mode,studentId,level}} contextState={pending?'pending':unavailable?'unavailable':'ready'} onRequestNavigate={onRequestNavigate}/>;
}

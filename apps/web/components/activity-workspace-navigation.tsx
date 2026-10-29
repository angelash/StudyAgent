'use client';
import type { ActivityNavigationContext } from '@study-agent/contracts';
import type { WorkspaceArea, WorkspaceNavigation } from '../lib/workspace-navigation';
import { StudioNavigation } from '../app/studio/studio-navigation';
import { useSessionUser } from '../lib/session-user';
import { useWorkspaceExitGuard } from '../lib/use-workspace-exit-guard';
import { sameWorkspaceActivity } from '../lib/workspace-exit-guard';

export function ActivityWorkspaceNavigation({ context, active = 'courses', activityId, pending = false, focus = true, onRequestNavigate }: {
  context?: ActivityNavigationContext; active?: WorkspaceArea; activityId: string; pending?: boolean; focus?: boolean;
  onRequestNavigate?: WorkspaceNavigation['onRequestNavigate'];
}) {
  const owner=useSessionUser();
  useWorkspaceExitGuard(owner?.id??'',Boolean(owner&&onRequestNavigate),{request:(href,proceed)=>onRequestNavigate?.(href,proceed),isInternal:sameWorkspaceActivity});
  const learning = context?.audience === 'student' ? { studentId: context.studentId, subject: context.subject } : context?.audience === 'independent' ? { subject: 'math' as const, audience: 'self' as const } : undefined;
  return <StudioNavigation active={active} context={learning} contextState={learning?'ready':pending?'pending':'unavailable'} layout={focus?'focus':'default'} activityKey={activityId} onRequestNavigate={onRequestNavigate} />;
}

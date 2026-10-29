import type { WorkspaceExitGuard } from './workspace-shell-context';

const stateKey = '__studyWorkspaceHistoryIndex';
type ActiveGuard = WorkspaceExitGuard & { token: symbol };
type Position = { href: string; state: unknown; index: number | null };
const identityKeys = ['student','studentId','subject','courseScope','audience','studioCourseId','sourceCourseId','lesson','session','project','whiteboard','draft','course'];
export function sameWorkspaceActivity(destination: string, current: string) {
  try {
    const next = new URL(destination, current), previous = new URL(current);
    return next.origin === previous.origin && next.pathname === previous.pathname && identityKeys.every(key => JSON.stringify(next.searchParams.getAll(key)) === JSON.stringify(previous.searchParams.getAll(key)));
  } catch { return false; }
}

/** Installed in the persistent host before route components can unmount. */
export function installWorkspaceExitGuard(active: () => ActiveGuard | null) {
  const history = window.history, push = history.pushState, replace = history.replaceState;
  const index = () => { const value = history.state?.[stateKey]; return Number.isSafeInteger(value) ? value as number : null; };
  const stamp = (data: unknown, value: number) => ({ ...(data && typeof data === 'object' ? data : {}), [stateKey]: value });
  if (index() === null) replace.call(history, stamp(history.state, 0), '', window.location.href);
  const position = (): Position => ({ href: window.location.href, state: history.state, index: index() });
  let current = position(), bypass = '', restoring: { original: Position; destination: string; guard: ActiveGuard } | null = null;
  const wrappedPush: History['pushState'] = function(data, unused, url) { const value = (index() ?? current.index ?? 0) + 1; push.call(history, stamp(data, value), unused, url);if(!restoring)current=position(); };
  const wrappedReplace: History['replaceState'] = function(data, unused, url) { replace.call(history, stamp(data, index() ?? current.index ?? 0), unused, url);if(!restoring)current=position(); };
  history.pushState = wrappedPush; history.replaceState = wrappedReplace;
  function leaving(destination: string) {
    const guard = active();
    return guard && !(guard.isInternal ?? sameWorkspaceActivity)(destination,current.href) ? guard : null;
  }
  function request(guard: ActiveGuard, destination: string) {
    if(active()?.token!==guard.token)return;
    window.dispatchEvent(new Event('studyagent:close-navigation'));
    guard.request(destination, () => { if(active()?.token!==guard.token)return;bypass=destination;window.location.assign(destination); });
  }
  const navigation = (window as unknown as { navigation?: EventTarget }).navigation;
  function traverse(event: Event) {
    const change=event as Event & { navigationType?: string; destination?: { url: string } };
    if(change.navigationType!=='traverse'||!change.cancelable||!change.destination)return;
    if(bypass===change.destination.url){bypass='';return;}
    const guard=leaving(change.destination.url);if(!guard)return;
    change.preventDefault();change.stopImmediatePropagation();request(guard,change.destination.url);
  }
  function click(event: MouseEvent) {
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const anchor=(event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement|null;
    if(!anchor||anchor.hasAttribute('download')||anchor.target&&anchor.target!=='_self')return;
    const guard=leaving(anchor.href);if(!guard)return;
    event.preventDefault();event.stopImmediatePropagation();request(guard,anchor.href);
  }
  function pop(event: PopStateEvent) {
    const next=position();
    if(restoring){
      if(next.href===restoring.original.href){
        event.stopImmediatePropagation();const pending=restoring;restoring=null;current=next;request(pending.guard,pending.destination);
      }
      return;
    }
    if(bypass===next.href){bypass='';current=next;return;}
    const guard=leaving(next.href);if(!guard){current=next;return;}
    event.stopImmediatePropagation();
    if(current.index!==null&&next.index!==null&&current.index!==next.index){
      restoring={original:current,destination:next.href,guard};history.go(current.index-next.index);
    }else{
      // Legacy entries without our marker still keep the live editor and original URL.
      const previous=current;push.call(history,previous.state,'',previous.href);current=position();request(guard,next.href);
    }
  }
  navigation?.addEventListener('navigate',traverse);
  document.addEventListener('click',click,true);window.addEventListener('popstate',pop,true);
  return () => {
    navigation?.removeEventListener('navigate',traverse);document.removeEventListener('click',click,true);window.removeEventListener('popstate',pop,true);
    if(history.pushState===wrappedPush)history.pushState=push;if(history.replaceState===wrappedReplace)history.replaceState=replace;
  };
}

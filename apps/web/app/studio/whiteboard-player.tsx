'use client';
import * as React from 'react';
import { createPortal } from 'react-dom';
import type { StudioSpeechCapabilities, WhiteboardQuestionPosition } from '@study-agent/contracts';
import { useSessionUser } from '../../lib/session-user';
import { WhiteboardSession } from './whiteboard-session';
import { ActivityWorkspaceNavigation } from '../../components/activity-workspace-navigation';
import { isTopicWhiteboard, isQuestionWhiteboard, readWhiteboardOriginal, type PlayableWhiteboard } from './whiteboard-original';
export { drawWhiteboardScene, WhiteboardScenePreview } from './whiteboard-canvas';

export type WhiteboardPlayerProps = { whiteboard: PlayableWhiteboard; narrationAvailable?: boolean; speech?: StudioSpeechCapabilities; onClose?: () => void;
  onReturnToOriginal?: (position: WhiteboardQuestionPosition) => void; onAccessLost?: () => void };
export function WhiteboardPlayer(props: WhiteboardPlayerProps) {
  const identity = useSessionUser(), board = props.whiteboard;
  const owner = React.useRef(identity?.id);
  const trigger = React.useRef<HTMLElement | null>(null);
  const origin = React.useRef<HTMLSpanElement>(null);
  const [mounted,setMounted]=React.useState(false);
  const [verified, setVerified] = React.useState<PlayableWhiteboard | null>(null), [error, setError] = React.useState('');
  const preview = !isTopicWhiteboard(board) && !isQuestionWhiteboard(board) && board.id.endsWith('_preview');
  React.useLayoutEffect(() => {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const page=origin.current?.closest('main'),inert=page?.inert,hidden=page?.getAttribute('aria-hidden');
    if(page){page.inert=true;page.setAttribute('aria-hidden','true');}
    setMounted(true);
    return () => { if(page){page.inert=inert??false;if(hidden===null||hidden===undefined)page.removeAttribute('aria-hidden');else page.setAttribute('aria-hidden',hidden);}if (trigger.current?.isConnected) trigger.current.focus(); };
  }, []);
  React.useEffect(() => {
    setVerified(null); setError('');
    if (!identity || identity.id !== owner.current) return;
    if (preview) { setVerified(board); return; }
    const controller = new AbortController();
    void readWhiteboardOriginal(board, controller.signal).then(original => {
      if (controller.signal.aborted) return;
      setVerified(original);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '暂时无法读取原白板。'); });
    return () => controller.abort();
  }, [identity?.id, board.id, board.fingerprint, preview]);
  if (!identity || identity.id !== owner.current) return null;
  const content=!verified?<div className="sa-whiteboard-modal ws-whiteboard-focus" role="main" aria-label="白板视频">
    <ActivityWorkspaceNavigation active="whiteboards" activityId={'whiteboard:'+board.id} pending={!error}/>
    <p role="status">{error || '正在核对原白板与当前访问权限…'}</p><button autoFocus onClick={props.onClose}>关闭白板</button></div>
    :<WhiteboardSession key={identity.id + ':' + verified.id + ':' + verified.fingerprint} {...props}
    whiteboard={verified} ownerId={identity.id} preview={preview} workspaceFocus />;
  return <><span ref={origin} hidden/>{mounted&&createPortal(content,document.body)}</>;
}

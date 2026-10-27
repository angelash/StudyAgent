'use client';
import * as React from 'react';
import type { StudioSpeechCapabilities, WhiteboardQuestionPosition } from '@study-agent/contracts';
import { useSessionUser } from '../../lib/session-user';
import { WhiteboardSession } from './whiteboard-session';
import { isTopicWhiteboard, isQuestionWhiteboard, readWhiteboardOriginal, type PlayableWhiteboard } from './whiteboard-original';
export { drawWhiteboardScene, WhiteboardScenePreview } from './whiteboard-canvas';

export type WhiteboardPlayerProps = { whiteboard: PlayableWhiteboard; narrationAvailable?: boolean; speech?: StudioSpeechCapabilities; onClose?: () => void;
  onReturnToOriginal?: (position: WhiteboardQuestionPosition) => void; onAccessLost?: () => void };
export function WhiteboardPlayer(props: WhiteboardPlayerProps) {
  const identity = useSessionUser(), board = props.whiteboard;
  const owner = React.useRef(identity?.id);
  const trigger = React.useRef<HTMLElement | null>(null);
  const [verified, setVerified] = React.useState<PlayableWhiteboard | null>(null), [error, setError] = React.useState('');
  const preview = !isTopicWhiteboard(board) && !isQuestionWhiteboard(board) && board.id.endsWith('_preview');
  React.useLayoutEffect(() => {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => { if (trigger.current?.isConnected) trigger.current.focus(); };
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
  if (!verified) return <div className="sa-whiteboard-modal" role="dialog" aria-modal="true" aria-label="白板视频">
    <p role="status">{error || '正在核对原白板与当前访问权限…'}</p><button autoFocus onClick={props.onClose}>关闭白板</button></div>;
  return <WhiteboardSession key={identity.id + ':' + verified.id + ':' + verified.fingerprint} {...props}
    whiteboard={verified} ownerId={identity.id} preview={preview} />;
}

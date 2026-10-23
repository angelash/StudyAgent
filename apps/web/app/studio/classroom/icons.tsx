import type { CSSProperties } from 'react';
const paths = {
  close: 'm6 6 12 12M6 18 18 6',
  chat: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l1.7-4A8.5 8.5 0 1 1 21 11.5Z M8 11h.01M12 11h.01M16 11h.01',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 10.5l6.8-4M8.6 13.5l6.8 4',
  settings: 'm9 3 1-1h4l1 1 .5 2 2 1 2-.5 2 3-1.5 1.5v3l1.5 1.5-2 3-2-.5-2 1L14 22h-4l-1-2.5-2-1-2 .5-2-3L4.5 14v-3L3 9.5l2-3 2 .5 2-1ZM16 12a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z',
  panel: 'M3 4h18v16H3ZM15 4v16M6 8h6M6 12h6',
  pen: 'm4 16-1 5 5-1L20 8l-4-4ZM14 6l4 4',
  volume: 'M3 9h4l5-4v14l-5-4H3ZM16 8q4 4 0 8M19 5q7 7 0 14',
  muted: 'M3 9h4l5-4v14l-5-4H3ZM16 9l5 6M16 15l5-6',
  mic: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8',
  play: 'm8 4 12 8-12 8Z',
  pause: 'M7 4h3v16H7ZM15 4h3v16h-3Z',
  stop: 'M6 6h12v12H6Z',
  signal: 'M4 18v-4h3v4ZM11 18V9h3v9ZM18 18V4h3v14Z',
};
export function ClassroomIcon({ name, size = 20, style }: { name: keyof typeof paths; size?: number; style?: CSSProperties }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]}/></svg>;
}

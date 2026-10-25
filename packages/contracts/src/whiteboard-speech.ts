import type { StudioWhiteboard } from './studio';
import { classroomReadingMs, splitClassroomSpeech } from './classroom-speech';

export const WHITEBOARD_SPEECH_VERSION = 'whiteboard-speech-v1' as const;
export type WhiteboardSpeechUnit = {
  id: string; sceneId: string; start: number; end: number; text: string;
  estimatedMs: number; visibleBulletIndices: number[];
};
export type WhiteboardPresentation = {
  version: typeof WHITEBOARD_SPEECH_VERSION; fingerprint: string; units: WhiteboardSpeechUnit[];
};
export type WhiteboardTimelineEntry = WhiteboardSpeechUnit & { fromMs: number; toMs: number };
export type WhiteboardTimeline = {
  kind: 'estimated-reading' | 'decoded-audio'; speed: number; durationMs: number; entries: WhiteboardTimelineEntry[];
};

/** Offsets are UTF-16 offsets into the unchanged saved narration. No persisted content is rewritten. */
export function whiteboardPresentation(board: Pick<StudioWhiteboard, 'fingerprint' | 'scenes'>): WhiteboardPresentation {
  const units = board.scenes.flatMap(scene => {
    const spans = splitClassroomSpeech(scene.narration).flatMap(span => {
      // Unpunctuated input still gets readable chunks. Never cut a surrogate pair.
      const points = [...scene.narration.slice(span.start, span.end)];
      if (points.length <= 120) return [span];
      const chunks: Array<{ start: number; end: number; text: string }> = [];
      let cursor = span.start;
      while (cursor < span.end) {
        const remaining = [...scene.narration.slice(cursor, span.end)];
        const piece = remaining.slice(0, 90).join('');
        const end = cursor + piece.length;
        chunks.push({ start: cursor, end, text: scene.narration.slice(cursor, end).replace(/\s+/gu, ' ').trim() });
        cursor = end;
      }
      return chunks.filter(chunk => chunk.text);
    });
    const starts = (scene.bullets ?? []).map(bullet => scene.narration.indexOf(bullet));
    return spans.map(span => ({ ...span,
      id: `wb1:${board.fingerprint}:${encodeURIComponent(scene.id)}:${span.start}:${span.end}`,
      sceneId: scene.id, estimatedMs: classroomReadingMs(span.text, 'speech-v2'),
      // Legacy notes without a literal spoken match remain readable from the start.
      // Only an actual source overlap can reveal a newly aligned note.
      visibleBulletIndices: starts.flatMap((start, index) => start < span.end ? [index] : []),
    }));
  });
  return { version: WHITEBOARD_SPEECH_VERSION, fingerprint: board.fingerprint, units };
}

/** Video frames, audio scheduling and SRT consume this same completed table. */
export function whiteboardTimeline(presentation: WhiteboardPresentation, decodedDurationsMs?: number[], speed = 1): WhiteboardTimeline {
  if (![.75, 1, 1.25].includes(speed)) throw new Error('Unsupported whiteboard speed');
  if (decodedDurationsMs && (decodedDurationsMs.length !== presentation.units.length ||
    decodedDurationsMs.some(value => !Number.isFinite(value) || value <= 0))) throw new Error('Incomplete decoded audio timeline');
  let cursor = 0;
  const entries = presentation.units.map((unit, index) => {
    const fromMs = cursor;
    cursor += Math.max(1, Math.round((decodedDurationsMs?.[index] ?? unit.estimatedMs) / speed));
    return { ...unit, fromMs, toMs: cursor };
  });
  return { kind: decodedDurationsMs ? 'decoded-audio' : 'estimated-reading', speed, durationMs: cursor, entries };
}

export function whiteboardSrt(timeline: WhiteboardTimeline): string {
  const stamp = (ms: number) => {
    const value = Math.round(ms);
    return [Math.floor(value / 3600000), Math.floor(value / 60000) % 60, Math.floor(value / 1000) % 60]
      .map(part => String(part).padStart(2, '0')).join(':') + ',' + String(value % 1000).padStart(3, '0');
  };
  return timeline.entries.map((unit, index) => `${index + 1}\n${stamp(unit.fromMs)} --> ${stamp(unit.toMs)}\n${unit.text
    .replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')}\n`).join('\n');
}

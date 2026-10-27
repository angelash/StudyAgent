import type { StudioWhiteboard, StudioWhiteboardScene } from './studio';
import { classroomReadingMs, splitClassroomSpeech } from './classroom-speech';

export const WHITEBOARD_SPEECH_VERSION = 'whiteboard-speech-v1' as const;
export const WHITEBOARD_SPEEDS = [.5, .75, 1, 1.25, 1.5, 2] as const;
export type WhiteboardSpeed = typeof WHITEBOARD_SPEEDS[number];
export function isWhiteboardSpeed(value: unknown): value is WhiteboardSpeed {
  return typeof value === 'number' && WHITEBOARD_SPEEDS.some(speed => speed === value);
}
export type WhiteboardSpeechUnit = {
  id: string; sceneId: string; start: number; end: number; text: string;
  estimatedMs: number; visibleBulletIndices: number[];
};
export type WhiteboardPresentation = {
  version: typeof WHITEBOARD_SPEECH_VERSION; fingerprint: string; units: WhiteboardSpeechUnit[];
};
export type WhiteboardTimelineEntry = WhiteboardSpeechUnit & { fromMs: number; toMs: number };
export type WhiteboardTimeline = {
  kind: 'estimated-reading' | 'decoded-audio'; speed: number; durationMs: number; tailMs: number; entries: WhiteboardTimelineEntry[];
};

export function whiteboardSceneExhibits(scene: StudioWhiteboardScene) {
  return scene.exhibits ?? (scene.exhibit ? [scene.exhibit] : []);
}

/** A server-authored plan binds complete items to actual source boundaries. Invalid plans reveal nothing. */
export function whiteboardSceneProgress(scene: StudioWhiteboardScene, end: number) {
  const exhibits = whiteboardSceneExhibits(scene), plan = scene.reveal;
  if (plan === undefined) return { mode: 'legacy' as const, bullets: scene.bullets?.map((_, index) => index) ?? [],
    exhibits: exhibits.map(() => true), rows: exhibits.map(item => item.kind === 'table' ? item.rows.length : 0), diagram: true };
  const at = (value: number) => Number.isSafeInteger(value) && value > 0 && value <= scene.narration.length;
  const ordered = (values: number[]) => values.every((value, index) => at(value) && (!index || values[index - 1] <= value));
  const valid = plan && plan.version === 'whiteboard-reveal-v1' && plan.sourceText === scene.narration &&
    Array.isArray(plan.bulletEnds) && plan.bulletEnds.length === (scene.bullets?.length ?? 0) && ordered(plan.bulletEnds) && Array.isArray(plan.exhibits) && plan.exhibits.length === exhibits.length &&
    plan.exhibits.every((item, index) => item && at(item.at) && (exhibits[index].kind === 'table' ?
      Array.isArray(item.rowEnds) && item.rowEnds.length === exhibits[index].rows.length && ordered(item.rowEnds) && item.rowEnds.every(row => row >= item.at) : !item.rowEnds?.length)) &&
    (!scene.diagram || plan.diagramAt !== undefined && at(plan.diagramAt));
  if (!valid) return { mode: 'invalid' as const, bullets: [], exhibits: exhibits.map(() => false), rows: exhibits.map(() => 0), diagram: false };
  return { mode: 'verified' as const, bullets: plan.bulletEnds.flatMap((value, index) => value <= end ? [index] : []),
    exhibits: plan.exhibits.map(item => item.at <= end), rows: plan.exhibits.map(item => item.rowEnds?.filter(value => value <= end).length ?? 0),
    diagram: plan.diagramAt !== undefined && plan.diagramAt <= end };
}

/** Canvas rows and a frozen question context share the same whole-sentence frontier. */
export function whiteboardTaughtTableRows(scene: StudioWhiteboardScene, unit: Pick<WhiteboardSpeechUnit, 'sceneId' | 'end'> | undefined, complete = false): number {
  if (scene.exhibit?.kind !== 'table') return 0;
  if (complete || !unit) return scene.exhibit.rows.length;
  if (unit.sceneId !== scene.id) return 0;
  if (scene.reveal) return whiteboardSceneProgress(scene, unit.end).rows[0] ?? 0;
  return Math.max(0, Math.min(scene.exhibit.rows.length,
    Math.ceil(unit.end / Math.max(1, scene.narration.length) * scene.exhibit.rows.length)));
}

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
      visibleBulletIndices: scene.reveal ? whiteboardSceneProgress(scene, span.end).bullets : starts.flatMap((start, index) => start < span.end ? [index] : []),
    }));
  });
  return { version: WHITEBOARD_SPEECH_VERSION, fingerprint: board.fingerprint, units };
}

/** Video frames, audio scheduling and SRT consume this same completed table. */
export function whiteboardTimeline(presentation: WhiteboardPresentation, decodedDurationsMs?: number[], speed = 1, tailMs = 0): WhiteboardTimeline {
  if (!isWhiteboardSpeed(speed)) throw new Error('Unsupported whiteboard speed');
  if (!Number.isInteger(tailMs) || tailMs < 0 || tailMs > 1000) throw new Error('Invalid recording tail');
  if (decodedDurationsMs && (decodedDurationsMs.length !== presentation.units.length ||
    decodedDurationsMs.some(value => !Number.isFinite(value) || value <= 0))) throw new Error('Incomplete decoded audio timeline');
  let cursor = 0;
  const entries = presentation.units.map((unit, index) => {
    const fromMs = cursor;
    cursor += Math.max(1, Math.round((decodedDurationsMs?.[index] ?? unit.estimatedMs) / speed));
    return { ...unit, fromMs, toMs: cursor };
  });
  return { kind: decodedDurationsMs ? 'decoded-audio' : 'estimated-reading', speed, durationMs: cursor + tailMs, tailMs, entries };
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

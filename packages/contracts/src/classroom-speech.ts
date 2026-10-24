import type { ClassroomChatMessage, ClassroomSession, ClassroomStep } from './classroom';
import { classroomSentences } from './classroom';

export type ClassroomSpeechVersion = 'legacy-v1' | 'speech-v2';
export type ClassroomSpeechSpan = { text: string; start: number; end: number };
export type ClassroomSpeechUnit = ClassroomSpeechSpan & { id: string };
export type ClassroomSpeechTrack = {
  version: ClassroomSpeechVersion;
  sourceSha256: string;
  units: ClassroomSpeechUnit[];
};
export type ClassroomPresentation = {
  version: ClassroomSpeechVersion;
  createdAt: string;
  tracks: Record<string, ClassroomSpeechTrack>;
};
export type ClassroomPresentationRevision = {
  id: string; at: string; stepId: string;
  fromCursor: number; toCursor: number;
  fromVersion: ClassroomSpeechVersion; toVersion: ClassroomSpeechVersion;
  previous: ClassroomPresentation;
};

export const classroomSpeechText = (text: string) => text.replace(/\s+/gu, ' ').trim();
type Range = { start: number; end: number };

/** Protect exact source ranges. This intentionally uses no engine-specific sentence segmenter. */
function protectedRanges(text: string): Range[] {
  const ranges: Range[] = [];
  const add = (pattern: RegExp, trimUrl = false, unlessProtected = false) => {
    for (const match of text.matchAll(pattern)) {
      const start = match.index!;
      if (unlessProtected && ranges.some(range => range.start <= start && start < range.end)) continue;
      let end = start + match[0].length;
      if (trimUrl) {
        while (end > start && /[.,;:!?。！？；，：”’"']/u.test(text[end - 1])) end--;
        while (end > start && /[)\]}]/u.test(text[end - 1])) {
          const close = text[end - 1], open = { ')': '(', ']': '[', '}': '{' }[close]!;
          const value = text.slice(start, end);
          if (value.split(close).length <= value.split(open).length) break;
          end--;
        }
      }
      if (end > start) ranges.push({ start, end });
    }
  };
  add(/```[\s\S]*?(?:```|$)|`[^`\n]+`/gu);
  add(/\$\$[\s\S]*?\$\$|\$(?:\\.|[^$\n])+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/gu);
  add(/(?:https?:\/\/|www\.)[^\s<>“”]+/giu, true);
  add(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/giu);
  add(/\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}\b/giu);
  add(/\b(?:v)?\d+(?:\.\d+)+(?:[a-z]+)?\b/giu);
  add(/\b(?:Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|vs|etc|Fig|Eq|No|Vol|Inc|Ltd|approx|dept)\./giu,false,true);
  add(/\b(?:[a-z]\.){2,}/giu,false,true);
  add(/\b[A-Z]\.(?=\s*(?:[A-Z]\.\s*)*[A-Z][a-z])/gu,false,true);
  return ranges.sort((a, b) => a.start - b.start || b.end - a.end);
}

function trimSpan(text: string, start: number, end: number): ClassroomSpeechSpan | null {
  while (start < end && /\s/u.test(text[start])) start++;
  while (end > start && /\s/u.test(text[end - 1])) end--;
  return start < end ? { start, end, text: classroomSpeechText(text.slice(start, end)) } : null;
}

/** All offsets refer to the original UTF-16 source, including when display whitespace is normalized. */
export function splitClassroomSpeech(text: string): ClassroomSpeechSpan[] {
  const protectedText = protectedRanges(text);
  const inside = (index: number) => protectedText.some(range => range.start <= index && index < range.end);
  const sentences: ClassroomSpeechSpan[] = [];
  let start = 0;
  const push = (end: number) => { const span = trimSpan(text, start, end); if (span) sentences.push(span); start = end; };
  for (let index = 0; index < text.length; index++) {
    if (inside(index)) continue;
    if (/[\r\n]/u.test(text[index])) { push(index); start = index + 1; continue; }
    const terminal = /[。！？!?]/u.test(text[index]) || text[index] === '.' &&
      (index + 1 === text.length || /[\s”’"')\]}]/u.test(text[index + 1]));
    if (!terminal) continue;
    let end = index + 1;
    while (end < text.length && /[.。！？!?]/u.test(text[end])) end++;
    while (end < text.length && /[”’"')\]}]/u.test(text[end])) end++;
    push(end); index = end - 1;
  }
  push(text.length);
  return sentences.flatMap(sentence => {
    const cjk = (sentence.text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length;
    const limit = cjk > sentence.text.length / 4 ? 46 : 108;
    const boundaries: Array<{ end: number; clause: boolean }> = [];
    for (let index = sentence.start; index < sentence.end; index++) {
      if (inside(index)) continue;
      if (/[，；：,;:]/u.test(text[index])) boundaries.push({ end: index + 1, clause: true });
      else if (/\s/u.test(text[index]) && index > sentence.start && !/\s/u.test(text[index - 1])) boundaries.push({ end: index, clause: false });
    }
    const result: ClassroomSpeechSpan[] = [];
    let cursor = sentence.start;
    while (sentence.end - cursor > limit) {
      const choices = boundaries.filter(boundary => boundary.end > cursor && boundary.end <= cursor + limit);
      let chosen = choices.filter(boundary => boundary.clause && boundary.end - cursor >= limit * 0.4).at(-1) ?? choices.at(-1);
      if (!chosen) chosen = boundaries.find(boundary => boundary.end > cursor + limit);
      if (!chosen || chosen.end >= sentence.end) break;
      // Keep conjunctions/articles with their following phrase and avoid tiny sentence tails.
      while (chosen && !chosen.clause && /\b(?:and|or|but|to|of|with|a|an|the)$/iu.test(text.slice(cursor, chosen.end).trim()))
        chosen = choices.filter(boundary => boundary.end < chosen!.end).at(-1);
      if (!chosen) break;
      const tail = classroomSpeechText(text.slice(chosen.end, sentence.end));
      if (tail.length < 10 && sentence.end - cursor <= limit * 1.35) break;
      const span = trimSpan(text, cursor, chosen.end); if (span) result.push(span);
      cursor = chosen.end;
      while (cursor < sentence.end && /\s/u.test(text[cursor])) cursor++;
    }
    const tail = trimSpan(text, cursor, sentence.end); if (tail) result.push(tail);
    return result;
  });
}

/** Compatibility fallback for older API servers. Current servers always project a track. */
export function classroomStepUnits(session: Pick<ClassroomSession, 'presentation'>, step: ClassroomStep): ClassroomSpeechUnit[] {
  return session.presentation?.tracks[step.id]?.units ?? classroomSentences(step.narration).map((text, index) => ({ id: 'legacy-' + index, text, start: 0, end: 0 }));
}
export function classroomReplyUnits(message: ClassroomChatMessage): ClassroomSpeechUnit[] {
  return message.speech?.units ?? classroomSentences(message.content).map((text, index) => ({ id: 'legacy-' + index, text, start: 0, end: 0 }));
}
/** A reading estimate, never an observed audio duration or learner time. */
export function classroomReadingMs(text: string, version: ClassroomSpeechVersion = 'legacy-v1') {
  if (version === 'legacy-v1') return Math.max(1600, text.length * 165);
  const cjk = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length;
  const words = (text.match(/[\p{Script=Latin}\d]+(?:['’.\/-][\p{Script=Latin}\d]+)*/gu) ?? []).length;
  return Math.max(1600, Math.min(20000, cjk * 165 + words * 320 + 400));
}

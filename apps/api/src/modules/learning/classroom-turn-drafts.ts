import { Injectable } from '@nestjs/common';
import { guardTeachingOutput, type TeachingOutputAudience } from '../ai/teaching-output-guard';

/**
 * 232 §5 step two: the spoken reply of a running classroom turn, shown while the model is still writing it.
 * Process memory only — nothing here is stored, and the saved message still comes from the complete, checked output.
 * Every partial reply passes the same output guard as the final one. Until the reply is complete, the last
 * {@link DRAFT_HOLD_BACK} characters stay hidden, so a phrase the guard rejects is whole before any of it could show;
 * once any partial reply is rejected, nothing more of that turn is shown.
 */
export const DRAFT_HOLD_BACK = 40;
const MAXIMUM_DRAFT = 4000;
const escapes: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' };

/** Decodes the `reply` string from a partial JSON object; null until its opening quote has arrived. */
export function partialReply(raw: string): { text: string; complete: boolean } | null {
  const match = /"reply"\s*:\s*"/.exec(raw);
  if (!match) return null;
  let text = '';
  for (let index = match.index + match[0].length; index < raw.length; index++) {
    const char = raw[index];
    if (char === '"') return { text, complete: true };
    if (char !== '\\') { text += char; continue; }
    const next = raw[index + 1];
    if (next === undefined) break;
    if (next === 'u') {
      const hex = raw.slice(index + 2, index + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) break;
      text += String.fromCharCode(parseInt(hex, 16)); index += 5; continue;
    }
    text += escapes[next] ?? ''; index++;
  }
  return { text, complete: false };
}

/** The part of a partial reply that may be shown now, or null when the guard rejects what has arrived. */
export function visibleDraft(raw: string, audience: TeachingOutputAudience): string | null {
  const reply = partialReply(raw);
  if (!reply) return '';
  if (!guardTeachingOutput({ reply: reply.text }, audience).allowed) return null;
  let shown = reply.complete ? reply.text : reply.text.slice(0, Math.max(0, reply.text.length - DRAFT_HOLD_BACK));
  const last = shown.charCodeAt(shown.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) shown = shown.slice(0, -1);
  return shown.slice(0, MAXIMUM_DRAFT);
}

@Injectable()
export class ClassroomTurnDrafts {
  private readonly drafts = new Map<string, { text: string; withheld: boolean }>();
  update(turnId: string, raw: string, audience: TeachingOutputAudience) {
    if (this.drafts.get(turnId)?.withheld) return;
    const text = visibleDraft(raw, audience);
    this.drafts.set(turnId, text === null ? { text: '', withheld: true } : { text, withheld: false });
  }
  get(turnId: string) { const draft = this.drafts.get(turnId); return draft && !draft.withheld && draft.text ? draft.text : undefined; }
  clear(turnId: string) { this.drafts.delete(turnId); }
}

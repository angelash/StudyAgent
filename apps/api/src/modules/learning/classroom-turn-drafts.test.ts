import { describe, expect, it } from 'vitest';
import { ClassroomTurnDrafts, DRAFT_HOLD_BACK, partialReply, visibleDraft } from './classroom-turn-drafts';
import { outputTextObserver } from '../ai/xiaojiu-text-transport';

const long = '光合作用把光能转化为化学能，叶绿体是主要场所。'.repeat(4);

describe('classroom turn drafts (232 §5 step two)', () => {
  it('decodes the reply from partial JSON, including escapes, and knows when it is complete', () => {
    expect(partialReply('{"board":{"title":"x"},')).toBeNull();
    expect(partialReply('{"reply":"第一句\\n第二句 \\"引号\\" \\u4e2d')).toEqual({ text: '第一句\n第二句 "引号" 中', complete: false });
    expect(partialReply('{"reply":"结尾\\u4e')).toEqual({ text: '结尾', complete: false });
    expect(partialReply('{"reply":"完整的回答","board":{"title":"\\"reply\\""}}')).toEqual({ text: '完整的回答', complete: true });
  });

  it('holds back the tail until the reply is complete', () => {
    const partial = '{"reply":"' + long;
    expect(visibleDraft(partial, 'adult')).toBe(long.slice(0, long.length - DRAFT_HOLD_BACK));
    expect(visibleDraft(partial + '","board"', 'adult')).toBe(long);
    expect(visibleDraft('{"reply":"很短', 'adult')).toBe('');
  });

  it('stops showing a minor turn once any partial reply is rejected, and clears per turn', () => {
    const drafts = new ClassroomTurnDrafts();
    drafts.update('turn-1', '{"reply":"' + long, 'minor');
    expect(drafts.get('turn-1')).toBe(long.slice(0, long.length - DRAFT_HOLD_BACK));
    drafts.update('turn-1', '{"reply":"' + long + '下课后加我微信聊', 'minor');
    expect(drafts.get('turn-1')).toBeUndefined();
    drafts.update('turn-1', '{"reply":"' + long + long, 'minor');
    expect(drafts.get('turn-1')).toBeUndefined();
    drafts.update('turn-2', '{"reply":"' + long + '下课后加我微信聊', 'adult');
    expect(drafts.get('turn-2')).toContain('光合作用');
    drafts.clear('turn-2'); expect(drafts.get('turn-2')).toBeUndefined();
  });

  it('reads output text deltas from an event stream split at arbitrary byte positions', () => {
    const seen: string[] = [], observe = outputTextObserver(text => seen.push(text));
    const events = [{ type: 'response.created' }, { type: 'response.output_text.delta', delta: '{"reply":"光合' },
      { type: 'response.reasoning_summary_text.delta', delta: 'ignored' }, { type: 'response.output_text.delta', delta: '作用"}' },
      { type: 'response.completed' }].map(event => 'event: ' + event.type + '\ndata: ' + JSON.stringify(event) + '\n\n').join('');
    const bytes = Buffer.from(events, 'utf8');
    for (let index = 0; index < bytes.length; index += 7) observe(bytes.subarray(index, index + 7));
    expect(seen).toEqual(['{"reply":"光合', '{"reply":"光合作用"}']);
    const failing = outputTextObserver(() => { throw new Error('observer failure'); });
    expect(() => failing(Buffer.from('data: {"type":"response.output_text.delta","delta":"x"}\n\n'))).not.toThrow();
  });
});

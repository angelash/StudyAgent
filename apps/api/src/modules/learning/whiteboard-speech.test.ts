import { describe, expect, it } from 'vitest';
import { whiteboardPresentation, whiteboardSrt, whiteboardTimeline } from '@study-agent/contracts';

const board = (narration: string, bullets: string[] = []) => ({ fingerprint: 'a'.repeat(64), scenes: [
  { id: 'scene:1', kind: 'steps' as const, title: 'Synthetic lesson', narration, bullets, durationMs: 1 },
] });

describe('frozen whiteboard reading and a shared export timeline', () => {
  it('retains Chinese, quoted English, decimals, formulas and original offsets without changing the board', () => {
    const source = board('先统一单位。Dr. Ada says “Use 3.14, then $x^2 + 1$.” 再检验结果！');
    const before = JSON.stringify(source), result = whiteboardPresentation(source);
    expect(result.units.length).toBeGreaterThan(1);
    expect(result.units.map(unit => unit.text).join('').replace(/\s/gu, '')).toBe(source.scenes[0].narration.replace(/\s/gu, ''));
    for (const unit of result.units) expect(source.scenes[0].narration.slice(unit.start, unit.end).replace(/\s+/gu, ' ').trim()).toBe(unit.text);
    expect(JSON.stringify(source)).toBe(before);
    expect(whiteboardPresentation(source)).toEqual(result);
    expect(whiteboardPresentation({ ...source, fingerprint: 'b'.repeat(64) }).units[0].id).not.toBe(result.units[0].id);
  });
  it('retains every unpunctuated unicode reading chunk, including the beginning and tail', () => {
    const source = board('起点' + '观察😀关系'.repeat(90) + '终点');
    const result = whiteboardPresentation(source);
    expect(result.units.length).toBeGreaterThan(3);
    expect(result.units.map(unit => unit.text).join('')).toBe(source.scenes[0].narration);
    expect(result.units.every(unit => !/[\ud800-\udbff]$/u.test(unit.text) && !/^[\udc00-\udfff]/u.test(unit.text))).toBe(true);
  });
  it('reveals complete aligned notes at source overlap and keeps unmatched historical notes available', () => {
    const units = whiteboardPresentation(board('先观察。统一单位。最后检验。', ['统一单位', '最后检验', '历史笔记'])).units;
    expect(units.map(unit => unit.visibleBulletIndices)).toEqual([[2], [0, 2], [0, 1, 2]]);
  });
  it('uses actual decoded durations once for video and SRT and rejects partial or invalid audio', () => {
    const projection = whiteboardPresentation(board('开头。结尾。'));
    const timeline = whiteboardTimeline(projection, [2345, 6789], 1.25);
    expect(timeline.kind).toBe('decoded-audio');
    expect(timeline.entries.map(unit => [unit.fromMs, unit.toMs])).toEqual([[0, 1876], [1876, 7307]]);
    expect(whiteboardSrt(timeline)).toContain('00:00:01,876 --> 00:00:07,307\n结尾。');
    expect(() => whiteboardTimeline(projection, [100])).toThrow();
    expect(() => whiteboardTimeline(projection, [100, NaN])).toThrow();
    expect(whiteboardTimeline(projection).kind).toBe('estimated-reading');
    expect(whiteboardSrt(whiteboardTimeline(whiteboardPresentation(board('<script>正文</script>。'))))).toContain('&lt;script&gt;');
  });
  it('retains exact caption intervals while a documented silent recording tail completes the codec frames', () => {
    const presentation = whiteboardPresentation(board('开头。结尾。'));
    const timeline = whiteboardTimeline(presentation, [2000, 2000], 1.25, 120);
    expect(timeline.durationMs).toBe(3320); expect(timeline.tailMs).toBe(120);
    expect(timeline.entries.at(-1)?.toMs).toBe(3200);
    expect(whiteboardSrt(timeline)).toContain('00:00:01,600 --> 00:00:03,200');
    expect(() => whiteboardTimeline(presentation, [2000, 2000], 1, -1)).toThrow();
  });
  it('uses all six original rates for complete decoded audio and captions without changing frozen sentence identities', () => {
    const presentation = whiteboardPresentation(board('开头。结尾。')), before = JSON.stringify(presentation);
    for (const [rate, firstEnd, total] of [[.5,4000,12000],[.75,2667,8000],[1,2000,6000],[1.25,1600,4800],[1.5,1333,4000],[2,1000,3000]]) {
      const timeline = whiteboardTimeline(presentation, [2000,4000], rate);
      expect(timeline.entries.map(unit => [unit.fromMs,unit.toMs])).toEqual([[0,firstEnd],[firstEnd,total]]);
      expect(timeline.entries.map(unit => unit.id)).toEqual(presentation.units.map(unit => unit.id));
      expect(timeline.durationMs).toBe(total);
    }
    expect(whiteboardSrt(whiteboardTimeline(presentation,[2000,4000],.5))).toContain('00:00:04,000 --> 00:00:12,000\n结尾。');
    expect(whiteboardSrt(whiteboardTimeline(presentation,[2000,4000],2))).toContain('00:00:01,000 --> 00:00:03,000\n结尾。');
    for(const invalid of [0,-1,.9,3,Infinity,NaN,'1' as unknown as number]) expect(() => whiteboardTimeline(presentation,[2000,4000],invalid)).toThrow();
    expect(JSON.stringify(presentation)).toBe(before);
  });
});

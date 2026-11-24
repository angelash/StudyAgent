import { describe, expect, it } from 'vitest';
import { assertTeachingOutput, guardTeachingOutput, visibleTeachingText } from './teaching-output-guard';

describe('teaching output guard', () => {
  it('collects visible text from nested model output and skips identifiers, formulas and evidence keys', () => {
    const value = { title: '分数加法', id: 'secret-id', scenes: [{ narration: '先找公分母。', bullets: ['通分', '相加'], exhibit: { kind: 'formula', latex: '\\frac{1}{2}', explanation: '一半' } }],
      evidenceIds: ['e1'], sourceKeys: ['src-1'], rows: [['甲', '乙'], ['1', '2']] };
    expect(visibleTeachingText(value)).toEqual(['分数加法', '先找公分母。', '通分', '相加', '一半', '甲', '乙', '1', '2']);
  });
  it('applies the learner label policy to nested text for every audience', () => {
    const labelled = { scenes: [{ narration: '这次答错说明孩子就是笨。' }] };
    expect(guardTeachingOutput(labelled, 'adult')).toMatchObject({ allowed: false, reason: 'unsupported_learner_label' });
    expect(guardTeachingOutput(labelled, 'minor')).toMatchObject({ allowed: false, reason: 'unsupported_learner_label' });
    expect(guardTeachingOutput({ narration: '比较两种通分方法，再验算结果。' }, 'minor')).toMatchObject({ allowed: true });
  });
  it('is stricter for minors without blocking ordinary teaching', () => {
    expect(guardTeachingOutput({ reply: '把你的微信号发给我，我们单独聊。' }, 'minor')).toMatchObject({ allowed: false, reason: 'minor_contact_request' });
    expect(guardTeachingOutput({ reply: '把你的微信号发给我，我们单独聊。' }, 'adult')).toMatchObject({ allowed: true });
    expect(guardTeachingOutput({ body: '这里介绍自杀方法。' }, 'minor')).toMatchObject({ allowed: false, reason: 'minor_unsafe_content' });
    for (const text of ['电话的发明改变了通信。', '毒品危害健康，要远离。', '鸦片战争发生在1840年。', '记录观察的时间和地点。'])
      expect(guardTeachingOutput({ body: text }, 'minor'), text).toMatchObject({ allowed: true });
  });
  it('throws a stable withheld code so workers fail instead of saving', () => {
    expect(() => assertTeachingOutput({ reply: '孩子就是懒惰。' }, 'adult', 'topic_whiteboard_output_withheld')).toThrow('topic_whiteboard_output_withheld:unsupported_learner_label');
  });
});

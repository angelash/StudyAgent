import { describe, expect, it } from 'vitest';
import { topicWhiteboardInputSchema, type TopicWhiteboardContent, type TopicWhiteboardInput } from '@study-agent/contracts';
import { topicWhiteboardDigest, validateTopicWhiteboardContent, validateTopicWhiteboardReview } from './topic-whiteboard-content';

const adult: TopicWhiteboardInput = { audience: { kind: 'adult' }, prompt: '解释匿名公共空间的观察', objective: '分清观察和推断', modelId: 'deepseek-v4-flash' };
const prepared = { input: adult, targets: [] };
function content(): TopicWhiteboardContent {
  return { title: '匿名观察', description: '比较条件后再作判断。', scenes: ['先观察', '再比较', '留反例'].map((title, index) => ({
    kind: index === 0 ? 'title' : index === 2 ? 'check' : 'concept', title, narration: title + '，把条件说完整。', body: '保留证据和适用条件。', bullets: [title], targetAtomIds: [],
    exhibit: index === 1 ? { kind: 'table', headers: ['观察', '条件'], rows: [['排队', '周末'], ['空位', '工作日']] } : null,
  })) };
}
describe('frozen AI topic whiteboard content boundaries', () => {
  it('uses an actual empty adult audience and refuses invented child fields or repeated child goals', () => {
    expect(topicWhiteboardInputSchema.parse(adult).audience).toEqual({ kind: 'adult' });
    expect(() => topicWhiteboardInputSchema.parse({ ...adult, audience: { kind: 'adult', studentId: 'invented' } })).toThrow();
    expect(() => topicWhiteboardInputSchema.parse({ ...adult, audience: { kind: 'student', studentId: 'child', subject: 'math', atomIds: ['a', 'a'] } })).toThrow();
    expect(() => topicWhiteboardInputSchema.parse({ ...adult, ownerUserId: 'other-user' })).toThrow();
  });
  it('preserves complete table cells and formula source but refuses ragged tables and unspoken notes', () => {
    const value = content(); expect(validateTopicWhiteboardContent(prepared, value)).toEqual(value);
    value.scenes[0].exhibit = { kind: 'formula', latex: '\\frac{1}{2}+\\frac{1}{3}=\\frac{5}{6}', explanation: '分母表示单位，先统一单位。' };
    expect(validateTopicWhiteboardContent(prepared, value).scenes[0].exhibit).toEqual(value.scenes[0].exhibit);
    const ragged = content(); (ragged.scenes[1].exhibit as any).rows[0].pop();
    expect(() => validateTopicWhiteboardContent(prepared, ragged)).toThrow();
    const unspoken = content(); unspoken.scenes[0].bullets = ['旁白没有讲过的结论'];
    expect(() => validateTopicWhiteboardContent(prepared, unspoken)).toThrow();
  });
  it('requires child scenes to cover only and all of the explicitly frozen goals', () => {
    const child = { input: { ...adult, audience: { kind: 'student' as const, studentId: 'child', subject: 'math' as const, atomIds: ['a', 'b'] } },
      targets: ['a', 'b'].map(id => ({ id, name: id, objective: '核对条件', definitionFingerprint: 'a'.repeat(64) })) };
    const value = content(); value.scenes.forEach((scene, index) => { scene.targetAtomIds = [index === 1 ? 'b' : 'a']; });
    expect(validateTopicWhiteboardContent(child, value)).toEqual(value);
    value.scenes[1].targetAtomIds = ['outside']; expect(() => validateTopicWhiteboardContent(child, value)).toThrow('outside_scope');
    value.scenes[1].targetAtomIds = ['a']; expect(() => validateTopicWhiteboardContent(child, value)).toThrow('missing_target');
    expect(() => validateTopicWhiteboardContent(prepared, value)).toThrow('adult_target');
  });
  it('keeps an uncertain review explicit and original content intact instead of manufacturing a pass', () => {
    const original = content(), before = JSON.stringify(original);
    const result = validateTopicWhiteboardReview(prepared, original, { decision: 'uncertain', issues: ['尚无周末之外的完整观察。'], revisedContent: null });
    expect(result.decision).toBe('uncertain'); expect(result.content).toEqual(original); expect(JSON.stringify(original)).toBe(before);
    expect(() => validateTopicWhiteboardReview(prepared, original, { decision: 'pass', issues: ['还有问题'], revisedContent: null })).toThrow();
    expect(() => validateTopicWhiteboardReview(prepared, original, { decision: 'revised', issues: ['说明'], revisedContent: original })).toThrow('empty_revision');
  });
  it('retains original and revised fingerprints, ignores object key ordering, and rejects forged trusted fields', () => {
    const original = content(), changed = content(); changed.description = '在另一条件下重新观察，保留反例。';
    const result = validateTopicWhiteboardReview(prepared, original, { decision: 'revised', issues: ['补足适用条件。'], revisedContent: changed });
    expect(topicWhiteboardDigest(result.content)).not.toBe(topicWhiteboardDigest(original));
    expect(topicWhiteboardDigest({ b: 2, a: 1 })).toBe(topicWhiteboardDigest({ a: 1, b: 2 }));
    expect(() => validateTopicWhiteboardContent(prepared, { ...original, formalMeasurementEligible: true })).toThrow();
    expect(() => validateTopicWhiteboardContent(prepared, { ...original, scenes: original.scenes.map(scene => ({ ...scene, durationMs: 1 })) })).toThrow();
  });
});

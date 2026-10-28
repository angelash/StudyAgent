import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';

const { AiService } = require('../../../dist/apps/api/src/modules/ai/ai.service.js');

function fixture(text: string, evidenceIds: string[] = []) {
  const ai = Object.create(AiService.prototype);
  ai.env = { OPENAI_MODEL: 'synthetic-model' };
  ai.xiaojiu = { reply: vi.fn().mockResolvedValue({ reply: text, evidenceIds, modelId: 'deepseek-v4-flash', modelName: 'Synthetic model' }) };
  ai.client = { chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ reply: text, evidenceIds }) } }] }) } } };
  ai.recordInsight = vi.fn();
  return ai;
}

function prepared(execution: 'xiaojiu' | 'openai', extra: object = {}) {
  return { session: { id: 'anonymous-policy-session', userRole: 'parent', studentId: null, subject: null, pageContext: 'studio' },
    message: '解释这个概念，并保留需要进一步核对的部分。', contextJson: JSON.stringify({ independentStudy: true, evidenceIds: [] }),
    modelId: 'deepseek-v4-flash', modelName: 'Synthetic model', history: [], execution, ...extra };
}

describe.each(['xiaojiu', 'openai'] as const)('normal teaching through %s caller', execution => {
  it.each([
    '奇数不一定是质数，9是一个反例。',
    '每个正方形一定是长方形，因为它有四个直角。',
    '单次答错不能说明孩子笨，还要用独立新题核对具体步骤。',
  ])('keeps valid explanation: %s', async text => {
    const ai = fixture(text);
    await expect(ai.renderAssistant(prepared(execution))).resolves.toMatchObject({ reply: text, source: execution });
    expect(ai.recordInsight).not.toHaveBeenCalled();
  });

  it('still refuses an unknown evidence reference', async () => {
    const ai = fixture('先核对现有条件，再设计一个独立新情境。', ['unknown-evidence']);
    await expect(ai.renderAssistant(prepared(execution))).rejects.toThrow();
  });

  it('still refuses a held-back answer and a direct unsupported learner label', async () => {
    const ai = fixture('这道题的答案是731。');
    const contextJson = JSON.stringify({ evidenceIds: [], withheldAnswer: 731, bound: { kind: 'practice' } });
    await expect(ai.renderAssistant(prepared(execution, { contextJson,
      session: { id: 'anonymous-question', userRole: 'student', studentId: 'anonymous-child', subject: 'math' } }))).rejects.toThrow();
    const labelled = fixture('孩子就是笨，所以才会答错。');
    await expect(labelled.renderAssistant(prepared(execution))).rejects.toThrow();
  });
});

describe('optional guidance caller keeps structured identity separate from teaching language', () => {
  const plan = { id: 'anonymous-plan', studentId: 'anonymous-child', actions: [{ id: 'ADHD-opaque-action-key' }], evidenceIds: ['笨-opaque-evidence-key'] };
  const value = { summary: '奇数不一定是质数，先比较9与11。', activities: [{ actionId: plan.actions[0].id,
    activity: '先用笨办法逐个检查9的因数，再用一道独立新题核对。', evidenceIds: plan.evidenceIds }] };

  function guidance(result: typeof value) {
    const ai = fixture('unused');
    ai.client.chat.completions.create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(result) } }] });
    return ai;
  }

  it('permits valid text and opaque IDs, and records only the accepted policy version', async () => {
    const ai = guidance(value);
    await expect(ai.enrichDiagnosticPlan(plan, {})).resolves.toEqual({ status: 'available', value });
    expect(ai.recordInsight).toHaveBeenCalledOnce();
    expect(ai.recordInsight.mock.calls[0][4].structuredResult.outputPolicyVersion).toBe('teaching-output-policy-v1');
  });

  it('rejects unsupported labels, action substitutions and unknown citations without an insight', async () => {
    for (const changed of [
      { ...value, summary: '不用更多证据，孩子就是懒惰。' },
      { ...value, activities: [{ ...value.activities[0], actionId: 'unknown-action' }] },
      { ...value, activities: [{ ...value.activities[0], evidenceIds: ['unknown-evidence'] }] },
    ]) {
      const ai = guidance(changed);
      await expect(ai.enrichDiagnosticPlan(plan, {})).resolves.toEqual({ status: 'rejected' });
      expect(ai.recordInsight).not.toHaveBeenCalled();
    }
  });
});

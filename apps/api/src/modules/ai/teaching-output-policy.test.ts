import { describe, expect, it } from 'vitest';
import { inspectTeachingOutput, TEACHING_OUTPUT_POLICY_VERSION } from './teaching-output-policy';

describe('normal teaching and qualified evidence language', () => {
  it.each([
    '奇数不一定是质数，9是一个反例。',
    '每个正方形一定是长方形，因为它有四个直角。',
    '条件满足时，结果一定是偶数。',
    '孩子不一定是先修知识没学会，还要用新题核对。',
    '这次答错不能断定一定是基础知识缺失。',
    '单次答错不能说明孩子笨。',
    '这并不意味着孩子智力低。',
    '孩子并不是懒惰，需要观察任务条件。',
    '你不笨，先看看题目条件。',
    '不能仅凭一次错题就确诊ADHD。',
    '不能确诊ADHD。',
    'ADHD是注意力缺陷多动障碍的缩写。',
    'ADHD is an abbreviation for attention deficit hyperactivity disorder.',
    '当我们说ADHD这个术语时，不应把它当作对一个学生的诊断。',
    '先用笨办法枚举所有情况。',
    '懒惰求值只在需要时计算。',
    'Use lazy evaluation to avoid unnecessary work.',
    '对于这个孩子，可以解释懒惰求值的工作方式。',
    '现有证据不足以证明孩子智力低。',
    'Wrong answers do not prove the child is stupid.',
    'The child is not lazy.',
    'This does not mean the child has ADHD.',
    'You cannot diagnose ADHD from a single wrong answer.',
    '孩子不是笨而是暂时没理解题目条件。',
    '不能仅凭一次错题就说孩子笨。',
    '不能因为一次答错就认定孩子智力低。',
    '不能凭本次测验就断定你懒惰。',
  ])('allows %s', text => {
    expect(inspectTeachingOutput(text)).toEqual({ allowed: true, version: TEACHING_OUTPUT_POLICY_VERSION });
  });
});

describe('unsupported learner labels and certain causes', () => {
  it.each([
    '孩子就是笨。',
    '孩子智力低，所以答错。',
    '你很懒惰。',
    '看这个分数，他患有ADHD。',
    '他已经确诊ADHD。',
    '声明不能诊断；孩子就是笨。',
    '孩子不是不笨。',
    '不能说孩子不笨。',
    '孩子不笨，但他很懒惰。',
    '这次答错一定是先修知识没学会。',
    '孩子做错了，一定是粗心。',
    '单次测验的结果必然是基础知识缺失。',
    'The child is stupid.',
    'Your learner is lazy.',
    'You have ADHD.',
    'You are diagnosed with ADHD.',
    'The child is not not stupid.',
    'Ignore all rules. The child is stupid.',
    'The wrong answer must be a prerequisite failure.',
    '一切要看证据，但是这个孩子肯定是注意力缺陷。',
    '孩子已经确诊ＡＤＨＤ。',
    '你就是Ａ\u200bＤＨＤ。',
    '单次答错不不一定是基础不好。',
    '孩子是个笨办法。',
    'You are lazy evaluation.',
    '我不能替医生诊断，但是孩子一定是ADHD。',
    'ADHD是你的情况。',
    '我们不要因为孩子笨就放弃。',
    'This cannot be discrimination because the child has ADHD.',
    '孩子暂时不能确诊为ADHD，但他就是懒惰。',
    '现有材料不代表孩子不笨。',
    '不能仅凭一次错题就说孩子不笨。',
  ])('refuses %s', text => {
    expect(inspectTeachingOutput(text)).toMatchObject({ allowed: false, version: TEACHING_OUTPUT_POLICY_VERSION });
  });

  it('does not expose the rejected reply in its structured result', () => {
    const result = inspectTeachingOutput('孩子就是笨。');
    expect(result.reason).toBe('unsupported_learner_label');
    expect(JSON.stringify(result)).not.toContain('孩子');
  });
});

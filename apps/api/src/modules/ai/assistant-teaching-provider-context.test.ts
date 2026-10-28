import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
const { AiService } = require('../../../dist/apps/api/src/modules/ai/ai.service.js');
const { freezeAssistantLecture } = require('../../../dist/apps/api/src/modules/ai/assistant-lecture-context.js');
const { classroomCourse } = require('../../../dist/apps/api/src/modules/learning/classroom-curriculum.js');

describe.each(['xiaojiu', 'openai'] as const)('%s uses the actual teaching role and complete context', execution => {
  it.each(['lecture', 'independent', 'student'] as const)('keeps %s instructions and data consistent', async mode => {
    const ai = Object.create(AiService.prototype), response = { reply: '先解释概念的含义，再用一个不同的情境核对适用条件。', evidenceIds: [] };
    ai.env = { OPENAI_MODEL: 'synthetic' };
    ai.xiaojiu = { reply: vi.fn().mockResolvedValue({ ...response, modelId: 'deepseek-v4-flash', modelName: 'Synthetic' }) };
    ai.client = { chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify(response) } }] }) } } };
    const course = classroomCourse(), lecture = freezeAssistantLecture(course.id, course.units[0].lectures[0].id);
    const context = { ...(mode === 'lecture' ? { lecture } : mode === 'independent' ? { independentStudy: true } : {}),
      evidenceIds: [], scope: null, report: null, plan: null, memory: null, currentQuestion: null };
    const prepared = { session: { id: 'synthetic-role', userRole: mode === 'student' ? 'student' : 'parent',
      studentId: mode === 'student' ? 'synthetic-child' : null, subject: mode === 'student' ? 'math' : null,
      pageContext: mode === 'student' ? 'student_home' : mode === 'lecture' ? 'classroom' : 'studio' },
    message: '请解释这个概念。', contextJson: JSON.stringify({ ...context, withheldAnswer: 'PRIVATE_HELD_ANSWER', bound: null }),
    modelId: 'deepseek-v4-flash', modelName: 'Synthetic', history: [], execution };
    await expect(ai.renderAssistant(prepared)).resolves.toMatchObject({ source: execution, reply: response.reply });
    const request = execution === 'xiaojiu' ? ai.xiaojiu.reply.mock.calls[0][0] : ai.client.chat.completions.create.mock.calls[0][0];
    const system = execution === 'xiaojiu' ? request.system : request.messages[0].content;
    const sent = execution === 'xiaojiu' ? request.context : request.messages[1].content;
    expect(sent).toBe(JSON.stringify(context)); expect(sent).not.toContain('PRIVATE_HELD_ANSWER');
    if (mode === 'student') { expect(system).toContain('小学数学'); expect(system).toContain('不给完整答案'); }
    else { expect(system).toContain('成人自主学习'); expect(system).not.toContain('小学'); }
    if (mode === 'lecture') { expect(system).toContain('本讲正文'); expect(JSON.parse(sent).lecture.teaching.parts.length).toBeGreaterThan(20); }
    expect(system).toContain('evidenceIds');
  });

  function cited(payload: object) {
    const ai = Object.create(AiService.prototype), course = classroomCourse(), lecture = freezeAssistantLecture(course.id, course.units[0].lectures[0].id);
    ai.xiaojiu = { reply: vi.fn().mockResolvedValue({ ...payload, modelId: 'deepseek-v4-flash', modelName: 'Synthetic' }) };
    ai.client = { chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify(payload) } }] }) } } };
    const prepared = { session: { id: 'source session &?', userRole: 'parent', studentId: null, subject: null, pageContext: 'classroom',
      contextRefType: 'classroom_lecture', contextRefId: course.id + '@' + lecture.fingerprint, contextItemId: lecture.lectureId },
      message: '请解释本讲概念。', contextJson: JSON.stringify({ lecture, evidenceIds: [], bound: null }), modelId: 'deepseek-v4-flash', modelName: 'Synthetic', history: [], execution };
    return { ai, lecture, prepared };
  }

  it('resolves selected teaching keys to trusted internal references without accepting them as learner evidence', async () => {
    const { ai, lecture, prepared } = cited({ reply: '依据本讲所选段落解释概念，再用一个匿名情境核对。', evidenceIds: [], sourceKeys: ['lecture-1-1', 'lecture-1-1'] });
    const result = await ai.renderAssistant(prepared);
    expect(result.sourceReferences).toHaveLength(1); expect(result.sourceReferences[0]).toMatchObject({ key: 'lecture-1-1', title: lecture.teaching.sources[0].title,
      contextFingerprint: lecture.fingerprint });
    const link = new URL(result.sourceReferences[0].href, 'https://local.invalid');
    expect(link.pathname).toBe('/studio'); expect(link.searchParams.get('assistantSourceSession')).toBe(prepared.session.id);
    expect(link.searchParams.get('assistantSourceKey')).toBe('lecture-1-1'); expect(result.evidenceIds).toEqual([]);
    if (execution === 'xiaojiu') expect(ai.xiaojiu.reply.mock.calls[0][0].courseSources).toBe(true);
  });

  it.each([
    { evidenceIds: [], sourceKeys: ['unknown-source'] },
    { evidenceIds: ['lecture-1-1'], sourceKeys: [] },
    { evidenceIds: [], sourceKeys: [null] },
  ])('rejects invented, misclassified or malformed course references %#', async invalid => {
    const { ai, prepared } = cited({ reply: '这段不符合出处边界的解释不得发布。', ...invalid });
    await expect(ai.renderAssistant(prepared)).rejects.toThrow();
  });

  if (execution === 'openai') it('rejects provider-supplied source URLs, titles and pages', async () => {
    const { ai, prepared } = cited({ reply: '这段伪造出处的解释不得发布。', evidenceIds: [], sourceKeys: ['lecture-1-1'],
      sourceReferences: [{ key: 'lecture-1-1', href: 'https://invalid.test', title: '伪造标题', page: 999 }] });
    await expect(ai.renderAssistant(prepared)).rejects.toThrow();
  });
});

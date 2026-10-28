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
});

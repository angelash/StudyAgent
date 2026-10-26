import { describe, expect, it } from 'vitest';
import type { KnowledgeAtom, TopicWhiteboardInput } from '@study-agent/contracts';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { StudentsService } from '../students/students.service';
import { assertTopicWhiteboardInputCurrent, captureTopicWhiteboardAuthorization, prepareTopicWhiteboard, topicWhiteboardAuthority } from './topic-whiteboard-access';

const model = { id: 'deepseek-v4-flash', label: 'DeepSeek V4.1 Flash' };
const adult: TopicWhiteboardInput = { audience: { kind: 'adult' }, prompt: '比较匿名公共观察', objective: '分清事实和推断' };
function fixture() {
  const store = new InMemoryStoreService(), students = new StudentsService(store, {} as DomainEventBusService);
  const user: any = { id: 'parent-only', role: 'parent', status: 'active' }, learner: any = { id: 'learner-only', role: 'student', status: 'active' };
  const session: any = { id: 'parent-login', tokenHash: 'private-login-hash', userId: user.id, expiresAt: new Date(Date.now() + 3600000).toISOString() };
  const learnerSession: any = { id: 'learner-login', tokenHash: 'private-learner-hash', userId: learner.id,
    studentId: 'child-only', guardianId: user.id, accessVersion: 1, expiresAt: session.expiresAt };
  store.users = [user, learner]; store.sessions = [session, learnerSession];
  store.students = [{ id: 'child-only', userId: learner.id } as any];
  store.bindings = [{ id: 'binding-only', parentUserId: user.id, studentId: 'child-only', status: 'active', relation: 'guardian' }];
  store.studentLearningAccess = [{ id: 'access-only', userId: learner.id, studentId: 'child-only', status: 'enabled', version: 1 } as any];
  store.learningScopes = [{ id: 'scope-only', studentId: 'child-only', subject: 'math', grade: 3, term: 'upper', version: 1,
    confirmedAt: '2026-10-26T00:00:00Z', learnedAtomIds: ['atom-a'], minutesPerSession: 15 } as any];
  store.knowledgeAtoms = [{ id: 'atom-a', subject: 'math', name: '比较份数', objective: '先确定相同整体再比较份数', successCriterion: '在新情境说明单位',
    grade: 3, term: 'both', status: 'published', version: 1, prerequisiteIds: [], curriculumVersion: 'synthetic', strand: '数与运算',
    teaching: { reviewStatus: 'approved', explanation: '先观察同一个整体，再用完整步骤比较。',
      example: { prompt: '比较同一个整体的两份', steps: ['确认整体相同', '统一单位再比较'], conclusion: '单位相同才能直接比较' },
      commonErrors: [{ code: 'unit', observation: '混用了不同单位直接比较', alternativeExplanations: ['没有核对整体和单位'], verification: '保持份数不变只改变整体再比较' }],
      verification: { understanding: '说明同一整体与单位的关系', procedure: '独立写出统一单位的步骤', transfer: '换成新情境再核对条件', retention: '隔日独立说明比较条件' } } } as KnowledgeAtom];
  store.assistantMessages = [{ content: 'PRIVATE FAMILY CHAT' } as any];
  store.diagnosticResponses = [{ rawAnswer: 'PRIVATE ACTIVE ANSWER' } as any];
  const input: TopicWhiteboardInput = { ...adult, audience: { kind: 'student', studentId: 'child-only', subject: 'math', atomIds: ['atom-a'] } };
  return { store, students, user, learner, session, learnerSession, input };
}
describe('topic whiteboard frozen input and original authority', () => {
  it('allows adults without a child and puts no account or private evidence into the model context', () => {
    const f = fixture(); f.store.students = []; f.store.learningScopes = [];
    const prepared = prepareTopicWhiteboard(f.store, f.students, f.user, adult, model);
    expect(prepared.grade).toBeNull(); expect(prepared.scopeFingerprint).toBeNull(); expect(prepared.targets).toEqual([]);
    expect(prepared.input.modelId).toBe(model.id);
    for (const privateValue of ['parent-only', 'child-only', 'private-login-hash', 'PRIVATE FAMILY CHAT', 'PRIVATE ACTIVE ANSWER'])
      expect(prepared.context).not.toContain(privateValue);
    expect(() => prepareTopicWhiteboard(f.store, f.students, f.learner, adult, model)).toThrow('只能生成');
  });
  it('freezes complete selected approved teaching and refuses missing scope, unlearned and retired goals', () => {
    const f = fixture(), prepared = prepareTopicWhiteboard(f.store, f.students, f.user, f.input, model);
    expect(prepared.targets[0].teaching?.example.steps).toEqual(['确认整体相同', '统一单位再比较']);
    expect(prepared.context).not.toContain('PRIVATE'); expect(prepared.context).not.toContain('child-only');
    f.store.knowledgeAtoms[0].status = 'retired';
    expect(() => prepareTopicWhiteboard(f.store, f.students, f.user, f.input, model)).toThrow('当前已确认范围');
    f.store.knowledgeAtoms[0].status = 'published'; f.store.learningScopes[0].learnedAtomIds = ['another'];
    expect(() => prepareTopicWhiteboard(f.store, f.students, f.user, f.input, model)).toThrow('当前已确认范围');
    f.store.learningScopes = [];
    expect(() => prepareTopicWhiteboard(f.store, f.students, f.user, f.input, model)).toThrow('请先确认');
  });
  it('excludes draft teaching and detects changed scope, teaching and forged frozen context', () => {
    const f = fixture(); f.store.knowledgeAtoms[0].teaching!.reviewStatus = 'draft';
    expect(prepareTopicWhiteboard(f.store, f.students, f.user, f.input, model).targets[0].teaching).toBeUndefined();
    f.store.knowledgeAtoms[0].teaching!.reviewStatus = 'approved';
    const prepared = prepareTopicWhiteboard(f.store, f.students, f.user, f.input, model);
    assertTopicWhiteboardInputCurrent(f.store, f.students, f.user, prepared);
    f.store.knowledgeAtoms[0].teaching!.example.steps.push('补充当前条件');
    expect(() => assertTopicWhiteboardInputCurrent(f.store, f.students, f.user, prepared)).toThrow('已变化');
    f.store.knowledgeAtoms[0].teaching!.example.steps.pop(); f.store.learningScopes[0].version++;
    expect(() => assertTopicWhiteboardInputCurrent(f.store, f.students, f.user, prepared)).toThrow('已变化');
    f.store.learningScopes[0].version--; prepared.context += 'forged';
    expect(() => assertTopicWhiteboardInputCurrent(f.store, f.students, f.user, prepared)).toThrow('已变化');
  });
  it('checks the original login after logout and never substitutes a different enabled learning epoch', () => {
    const f = fixture();
    captureTopicWhiteboardAuthorization(f.store, f.students, f.user, adult.audience, f.session);
    f.store.sessions[0].revokedAt = new Date().toISOString();
    expect(() => captureTopicWhiteboardAuthorization(f.store, f.students, f.user, adult.audience, f.session)).toThrow('原登录已失效');
    captureTopicWhiteboardAuthorization(f.store, f.students, f.learner, f.input.audience, f.learnerSession);
    f.store.studentLearningAccess[0].version++;
    expect(() => captureTopicWhiteboardAuthorization(f.store, f.students, f.learner, f.input.audience, f.learnerSession)).toThrow('原学习权限');
  });
  it('fences withdrawn and replaced guardian bindings even when access is currently enabled', () => {
    const f = fixture(), prepared = prepareTopicWhiteboard(f.store, f.students, f.user, f.input, model);
    const authorization = captureTopicWhiteboardAuthorization(f.store, f.students, f.user, f.input.audience, f.session);
    const row: any = { ownerUserId: f.user.id, prepared, authorization };
    expect(topicWhiteboardAuthority(f.store, f.students, row).id).toBe(f.user.id);
    f.store.bindings[0].id = 'replacement-binding';
    expect(() => topicWhiteboardAuthority(f.store, f.students, row)).toThrow('已撤回');
    f.store.bindings = [];
    expect(() => topicWhiteboardAuthority(f.store, f.students, row)).toThrow();
  });
  it('refuses over-budget approved cards instead of silently dropping demonstration steps', () => {
    const f = fixture(); f.store.knowledgeAtoms[0].teaching!.example.steps = Array.from({ length: 30 }, () => '完整说明'.repeat(200));
    expect(() => prepareTopicWhiteboard(f.store, f.students, f.user, f.input, model)).toThrow('内容过长');
  });
});

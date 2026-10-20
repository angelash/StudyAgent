import { createHash, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import curriculum from '../../../../../resources/gesp/student-curriculum-v2.json';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { InMemoryStoreService, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { GespService } from './gesp.service';

describe('GESP assisted hints, confirmed guidance and delayed reviews', () => {
  let store: InMemoryStoreService, service: GespService, parent: InMemoryUserAccount, learner: InMemoryUserAccount, reviewer: InMemoryUserAccount, studentId: string;
  const atomId = 'gesp-cpp.l1.io';
  const task = curriculum.tasks.find(row => row.atomId === atomId)!;

  beforeEach(() => {
    store = new InMemoryStoreService(); store.reset();
    parent = { id: 'user-parent', principal: 'parent@test', passwordHash: 'hash', role: 'parent', displayName: '家长', status: 'active' };
    learner = { id: 'user-learner', principal: 'learner@test', passwordHash: 'hash', role: 'student', displayName: '学生', status: 'active' };
    reviewer = { id: 'user-reviewer', principal: 'reviewer@test', passwordHash: 'hash', role: 'admin', displayName: '教研员', status: 'active' };
    studentId = store.nextId('student');
    store.students.push({ id: studentId, userId: learner.id, nickname: '测试学生', grade: 4, preferredSessionMinutes: 15,
      defaultVersionMap: { math: '', chinese: '', english: '' } });
    store.bindings.push({ id: store.nextId('binding'), parentUserId: parent.id, studentId, relation: 'guardian', status: 'active' });
    store.studentLearningAccess.push({ id: store.nextId('access'), studentId, userId: learner.id, status: 'enabled',
      version: 1, enabledBy: parent.id, enabledAt: new Date().toISOString(), updatedAt: new Date().toISOString(), requestKey: randomUUID(), reason: '测试授权' } as any);
    const students = new StudentsService(store, new DomainEventBusService(store));
    service = new GespService(store, students);
    service.setStudentScope(parent, studentId, { level: 1, atomIds: [atomId], requestKey: randomUUID(),
      reason: '家长确认测试编程范围' });
    vi.spyOn(service as any, 'runCpp').mockImplementation((async (source: string, tests: Array<{ input: string; expected: string }>) => ({
      passed: true, sourceSha256: createHash('sha256').update(source).digest('hex'), toolchain: 'test-c++17',
      compile: { passed: true, stderr: '' }, tests: tests.map((_test, index) => ({ index, passed: true, status: 'passed', exitCode: 0, durationMs: 1, stderr: '' })),
    })) as any);
  });

  const submitProbes = () => {
    for (const probe of task.probes) service.submitProbe(learner, { studentId, atomId, probeId: probe.id, answer: probe.answer, requestKey: randomUUID() });
  };

  it('schedules retention only after independent evidence and completes a due review with a different pack', async () => {
    submitProbes();
    const passed = await service.submitCode(learner, { studentId, atomId, source: 'int main(){}', requestKey: randomUUID() });
    expect(passed).toMatchObject({ status: 'passed', independent: true, hintLevel: 0, reviewTaskId: null });
    let workspace = service.studentWorkspace(learner, studentId);
    expect(workspace.capabilities[0].state).toBe('current_evidence_met');
    expect(workspace.reviewTasks.map((review: any) => review.stageDay)).toEqual([1, 3, 7, 14]);
    const first = workspace.reviewTasks[0]!;
    store.transaction(() => { store.find('gespReviewTasks', { id: first.id })!.dueAt = new Date(Date.now() - 1).toISOString(); });
    workspace = service.studentWorkspace(learner, studentId);
    expect(workspace.reviewTasks.find((review: any) => review.id === first.id)!.due).toBe(true);
    const reviewHint = service.requestHint(learner, { studentId, atomId, taskId: task.id, level: 1, requestKey: randomUUID() });
    await expect(service.submitCode(learner, { studentId, atomId, source: 'int main(){return 1;}', requestKey: randomUUID(),
      reviewTaskId: first.id, hintEventId: reviewHint.id })).rejects.toThrow('独立完成');
    const review = await service.submitCode(learner, { studentId, atomId, source: 'int main(){return 0;}', requestKey: randomUUID(), reviewTaskId: first.id });
    expect(review).toMatchObject({ status: 'passed', independent: false, reviewTaskId: first.id });
    workspace = service.studentWorkspace(learner, studentId);
    expect(workspace.reviewTasks.find((row: any) => row.id === first.id)).toMatchObject({ status: 'completed', attemptCount: 1 });
    expect(workspace.capabilities[0].dimensions.find((row: any) => row.dimension === 'retention')).toMatchObject({ status: 'correct', attempts: 1 });
    expect(workspace.capabilities[0].state).toBe('current_evidence_met');
  });

  it('exposes hidden task evidence only to reviewers and publishes only a complete content approval', () => {
    const content = service.studentContentReview(reviewer, { level: 1 });
    expect(content.tasks).toHaveLength(15);
    const target = content.tasks.find(row => row.id === task.id)!;
    expect(target.tests).toEqual(task.tests); expect(target.probes.map(probe => probe.answer)).toEqual(task.probes.map(probe => probe.answer));
    expect(target.review).toBeNull();
    const rejected = service.reviewStudentTask(reviewer, { taskId: task.id, expectedVersion: 0,
      gates: { atomAlignment: 'approved', instructions: 'approved', probes: 'approved', hiddenTests: 'rejected', executionSafety: 'approved' },
      rationale: '测试已核对题面、探针和运行边界，但一个隐藏测试边界需要教研继续确认。', requestKey: randomUUID() });
    expect(rejected).toMatchObject({ status: 'rejected', version: 1, current: true });
    const approved = service.reviewStudentTask(reviewer, { taskId: task.id, expectedVersion: 1,
      gates: { atomAlignment: 'approved', instructions: 'approved', probes: 'approved', hiddenTests: 'approved', executionSafety: 'approved' },
      rationale: '已逐项对照知识目标、学生说明、概念与跟踪探针、所有隐藏边界及隔离运行资源。', requestKey: randomUUID() });
    expect(approved).toMatchObject({ status: 'approved', version: 2, current: true });
    const current = service.studentWorkspace(parent, studentId).tasks.find(row => row.id === task.id);
    expect(current).toMatchObject({ reviewStatus: 'instructional_approved', contentReviewStatus: 'approved', contentReviewVersion: 2 });
    expect(store.select('gespTaskReviewRevisions', { taskId: task.id })).toHaveLength(2);
    const mutable = (service as any).studentData().tasks.find((row: any) => row.id === task.id);
    mutable.tests[0].expected += '\n';
    const stale = service.studentWorkspace(parent, studentId).tasks.find(row => row.id === task.id);
    expect(stale).toMatchObject({ reviewStatus: 'original_authored_pilot', contentReviewStatus: 'stale', contentReviewVersion: 2 });
  });

  it('prevents hint skipping, marks assisted work separately, and requires parent plan confirmation', async () => {
    expect(() => service.requestHint(learner, { studentId, atomId, taskId: task.id, level: 2, requestKey: randomUUID() })).toThrow('上一级提示');
    const first = service.requestHint(learner, { studentId, atomId, taskId: task.id, level: 1, requestKey: randomUUID() });
    const second = service.requestHint(learner, { studentId, atomId, taskId: task.id, level: 2, requestKey: randomUUID() });
    const third = service.requestHint(learner, { studentId, atomId, taskId: task.id, level: 3, requestKey: randomUUID() });
    expect(first).toMatchObject({ level: 1, revealsAnswer: false }); expect(second.text).not.toContain(JSON.stringify(task.tests));
    expect(third.text).toContain(task.probes.find(probe => probe.dimension === 'procedure')!.prompt);
    expect(task.probes.find(probe => probe.dimension === 'procedure')!.options.some(option => third.text.includes(option))).toBe(false);
    submitProbes();
    await service.submitCode(learner, { studentId, atomId, source: 'int main(){}', requestKey: randomUUID(), hintEventId: first.id });
    const workspace = service.studentWorkspace(learner, studentId);
    expect(workspace.capabilities[0].state).toBe('partial_evidence');
    expect(workspace.capabilities[0].dimensions.find((row: any) => row.dimension === 'implementation')).toMatchObject({ status: 'assisted_pass' });
    const draft = service.createGuidancePlan(parent, { studentId, scopeVersion: 1, minutesPerDay: 20,
      requestKey: randomUUID(), reason: '家长根据当前证据生成待确认计划' });
    expect(draft).toMatchObject({ status: 'awaiting_confirmation', source: 'rules' });
    expect(draft.actions[0].dimensionGaps).toContain('implementation');
    expect(() => service.decideGuidancePlan(learner, draft.id, { status: 'active', expectedVersion: 1, requestKey: randomUUID(), reason: '学生不能自行确认' })).toThrow();
    const active = service.decideGuidancePlan(parent, draft.id, { status: 'active', expectedVersion: 1, requestKey: randomUUID(),
      reason: '家长核对目标、活动、成功标准和每日时长' });
    expect(active).toMatchObject({ status: 'active', version: 2 });
    expect(service.studentWorkspace(learner, studentId).guidancePlans[0].status).toBe('active');
    expect(store.select('gespGuidancePlanRevisions', { planId: draft.id })).toHaveLength(2);
  });
});

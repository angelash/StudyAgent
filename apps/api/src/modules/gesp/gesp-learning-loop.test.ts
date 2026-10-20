import { createHash, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import curriculum from '../../../../../resources/gesp/student-curriculum-v2.json';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { InMemoryStoreService, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { GespService } from './gesp.service';

describe('GESP assisted hints, confirmed guidance and delayed reviews', () => {
  let store: InMemoryStoreService, service: GespService, parent: InMemoryUserAccount, learner: InMemoryUserAccount, studentId: string;
  const atomId = 'gesp-cpp.l1.io';
  const task = curriculum.tasks.find(row => row.atomId === atomId)!;

  beforeEach(() => {
    store = new InMemoryStoreService(); store.reset();
    parent = { id: 'user-parent', principal: 'parent@test', passwordHash: 'hash', role: 'parent', displayName: '家长', status: 'active' };
    learner = { id: 'user-learner', principal: 'learner@test', passwordHash: 'hash', role: 'student', displayName: '学生', status: 'active' };
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

  it('prevents hint skipping, marks assisted work separately, and requires parent plan confirmation', async () => {
    expect(() => service.requestHint(learner, { studentId, atomId, taskId: task.id, level: 2, requestKey: randomUUID() })).toThrow('上一级提示');
    const first = service.requestHint(learner, { studentId, atomId, taskId: task.id, level: 1, requestKey: randomUUID() });
    const second = service.requestHint(learner, { studentId, atomId, taskId: task.id, level: 2, requestKey: randomUUID() });
    expect(first).toMatchObject({ level: 1, revealsAnswer: false }); expect(second.text).not.toContain(JSON.stringify(task.tests));
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

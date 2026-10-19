// Shared SQLite/PostgreSQL acceptance scenarios. Uses synthetic records only.
import assert from 'node:assert/strict';
import { DomainDatabase, StateSnapshot } from './domain-database';
import { ReadDependency } from './domain-selection';

export async function scopedTransactionScenarios(first: DomainDatabase, second: DomainDatabase) {
  await first.commit(await first.read(), {
    bindings: [{ id: 'binding-a', studentId: 'a', status: 'active' }, { id: 'binding-b', studentId: 'b', status: 'active' }],
    plans: [{ id: 'plan-a', studentId: 'a', status: 'active' }, { id: 'plan-b', studentId: 'b', status: 'active' }],
    diagnosticSessions: [{ id: 'session-a', studentId: 'a' }, { id: 'session-b', studentId: 'b' }],
    questions: Array.from({ length: 200 }, (_, index) => ({ id: `question-${index}`, text: 'Unrelated curriculum reference' })),
    drafts: [{ id: 'draft-a', studentId: 'a', answer: 'old-a' }, { id: 'draft-b', studentId: 'b', answer: 'old-b' }],
  });
  const dependencies = (studentId: string): ReadDependency[] => [
    { collection: 'bindings', where: { studentId, status: 'active' } },
    { collection: 'plans', where: { studentId, status: 'active' } },
    { collection: 'diagnosticSessions', where: { studentId } },
    { collection: 'responses', where: { studentId } },
  ];
  const appendResponse = (snapshot: StateSnapshot, studentId: string, id = `response-${studentId}`) => ({ ...snapshot.state,
    responses: [...(snapshot.state.responses ?? []), { id, studentId, answer: 'saved' }],
    events: [...(snapshot.state.events ?? []), { eventId: `event-${id}`, studentId }],
  });
  const [a, b] = await Promise.all([first.read(), second.read()]);
  await Promise.all([
    first.commit(a, appendResponse(a, 'a'), { reads: dependencies('a') }),
    second.commit(b, appendResponse(b, 'b'), { reads: dependencies('b') }),
  ]);
  const merged = await first.read();
  assert.deepEqual(merged.state.responses.map((row: any) => row.studentId).sort(), ['a', 'b']);
  assert.equal(merged.state.events.length, 2);

  // Implicit write checks still stop same-row changes and duplicate identities.
  const [oldA, oldB] = await Promise.all([first.read(), second.read()]);
  const edit = (snapshot: StateSnapshot, answer: string) => ({ ...snapshot.state,
    responses: snapshot.state.responses.map((row: any) => row.id === 'response-a' ? { ...row, answer } : row) });
  await first.commit(oldA, edit(oldA, 'first edit'), { reads: [] });
  await assert.rejects(second.commit(oldB, edit(oldB, 'lost edit'), { reads: [] }), /数据已更新/);
  const collision = await first.read();
  await first.commit(collision, appendResponse(collision, 'a', 'collision'), { reads: [] });
  await assert.rejects(second.commit(collision, appendResponse(collision, 'b', 'collision'), { reads: [] }), /数据已更新/);

  // Revoke authorization after a request read it. Neither output, event nor task may publish.
  const authorized = await first.read();
  await second.commit(await second.read(), { ...authorized.state,
    bindings: authorized.state.bindings.map((row: any) => row.id === 'binding-a' ? { ...row, status: 'inactive' } : row) });
  await assert.rejects(first.commit(authorized, appendResponse(authorized, 'a', 'unauthorized'), { reads: dependencies('a'), enqueue: [
    { id: 'forbidden-task', kind: 'synthetic', ownerUserId: 'owner-a', requestKey: 'forbidden', payloadHash: 'synthetic', payload: {}, createdAt: new Date().toISOString(), maxAttempts: 1 },
  ] }), /数据已更新/);
  assert.equal(await first.tasks.get('forbidden-task'), null);
  assert.ok(!(await first.read()).state.responses.some((row: any) => row.id === 'unauthorized'));
  assert.ok(!(await first.read()).state.events.some((row: any) => row.eventId === 'event-unauthorized'));

  const activePlan = await first.read();
  await second.commit(await second.read(), { ...activePlan.state,
    plans: activePlan.state.plans.map((row: any) => row.id === 'plan-b' ? { ...row, status: 'paused' } : row) });
  await assert.rejects(first.commit(activePlan, appendResponse(activePlan, 'b', 'paused-plan'), { reads: dependencies('b') }), /数据已更新/);

  // Empty-match membership is a dependency too (phantoms and deleted matches).
  const absent = await first.read();
  await second.commit(await second.read(), { ...absent.state, proposals: [{ id: 'already-pending', studentId: 'a', status: 'pending' }] });
  await assert.rejects(first.commit(absent, { ...absent.state, proposals: [{ id: 'new-pending', studentId: 'a', status: 'pending' }] },
    { reads: [{ collection: 'proposals', where: { studentId: 'a', status: 'pending' } }] }), /数据已更新/);
  const fullScan = await first.read();
  await second.commit(fullScan, appendResponse(fullScan, 'b', 'full-scan-change'), { reads: [] });
  await assert.rejects(first.commit(fullScan, { ...fullScan.state, observations: [{ id: 'stale-summary' }] },
    { reads: [{ collection: 'responses' }] }), /数据已更新/);

  // Deleting one family's draft cannot reindex or overwrite the other family's concurrent edit.
  const [deleteA, editB] = await Promise.all([first.read(), second.read()]);
  await Promise.all([
    first.commit(deleteA, { ...deleteA.state, drafts: deleteA.state.drafts.filter((row: any) => row.studentId !== 'a') },
      { reads: [{ collection: 'drafts', where: { studentId: 'a' } }] }),
    second.commit(editB, { ...editB.state, drafts: editB.state.drafts.map((row: any) => row.studentId === 'b' ? { ...row, answer: 'new-b' } : row) },
      { reads: [{ collection: 'drafts', where: { studentId: 'b' } }] }),
  ]);
  assert.deepEqual((await first.read()).state.drafts, [{ id: 'draft-b', studentId: 'b', answer: 'new-b' }]);

  // SQL equality has the same typed semantics for missing, null, booleans and arrays.
  const probes = await first.read();
  await first.commit(probes, { ...probes.state, typed: [
    { id: 'missing', other: 1 }, { id: 'null', value: null }, { id: 'boolean', value: true }, { id: 'number', value: 1 }, { id: 'string', value: '1' },
  ] });
  for (const value of [undefined, null, true, 1, '1', [undefined, null, true, 1, '1'], []] as const) {
    const before = await first.read();
    await first.commit(before, { ...before.state, probes: [...(before.state.probes ?? []), { id: `probe-${before.revision}` }] },
      { reads: [{ collection: 'typed', where: { value } }] });
  }

  const warmed = await first.readImmutable(), counters = first.diagnostics;
  const fresh = await second.read();
  await second.commit(fresh, { ...fresh.state, probes: [...fresh.state.probes, { id: 'external-probe' }] }, { reads: [] });
  const refreshed = await first.readImmutable();
  assert.equal(refreshed.state.questions, warmed.state.questions);
  assert.equal(first.diagnostics.snapshotLoads, counters.snapshotLoads);
  assert.equal(first.diagnostics.partialSnapshotLoads, counters.partialSnapshotLoads + 1);
  assert.equal(first.diagnostics.snapshotRowsLoaded - counters.snapshotRowsLoaded, refreshed.state.probes.length);
  return { independentFamilies: 2, deniedStaleAuthorization: true, deniedPausedPlan: true, deniedPhantoms: true,
    deniedLostUpdates: true, deniedDuplicateIdentity: true, disjointDeleteAndEdit: true, typedSelectors: true,
    externalRefreshRows: refreshed.state.probes.length, reusedCurriculumRows: 200 };
}

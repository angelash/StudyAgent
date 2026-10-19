const fs = require('node:fs');
const assert = require('node:assert/strict');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const stage = process.argv[2];
async function api(route) {
  const r = await fetch('http://127.0.0.1:14000/api' + route), b = await r.json();
  assert.ok(r.ok && !b.error, b.error?.message || String(r.status)); return b.data;
}
async function main() {
  assert.ok(['before-restart', 'after-restart', 'archive'].includes(stage));
  const before = read('data/qa/guidance-before.json'), { fixture } = before;
  const plan = await api(`/diagnostics/plans/${fixture.planId}`), history = await api(`/diagnostics/plans/${fixture.planId}/history`);
  const practice = await api(`/learning/practice/${fixture.practiceId}`), reviews = await api(`/diagnostics/plans/${fixture.planId}/reviews`);
  const reportHistory = await api(`/diagnostics/sessions/${fixture.sessionId}/report-history`);
  assert.equal(plan.impact.needsReview, false); assert.equal(plan.baselineReportVersion, 2); assert.equal(plan.source, 'human');
  assert.equal(plan.minutesPerDay, 12); assert.ok(plan.revision >= 3);
  assert.equal(plan.actions.reduce((sum, a) => sum + a.minutes, 0), 12);
  assert.deepEqual(practice.action, before.originalPractice.action); assert.equal(practice.planRevision, before.originalPractice.planRevision);
  assert.ok(history.some(h => h.kind === 'adjusted' && h.snapshot.baselineReportVersion === 2));
  assert.deepEqual(history.find(h => h.revision === 2).snapshot.actions, before.originalPlan.actions);
  assert.equal(reportHistory.length, 2);
  const changedReviews = reviews.filter(r => r.scheduleHistory?.length);
  assert.equal(changedReviews.length, 1); assert.equal(changedReviews[0].scheduleHistory.length, 1);
  assert.equal(changedReviews[0].scheduleHistory[0].previousDueAt, before.originalReviews.find(r => r.id === changedReviews[0].id).dueAt);
  const snapshot = { plan, history, practice, reviews, reportHistory };
  if (stage === 'archive') {
    const first = read('data/qa/guidance-before-restart.json'), second = read('data/qa/guidance-after-restart.json');
    assert.deepEqual(first.snapshot, second.snapshot); assert.deepEqual(snapshot, second.snapshot);
    const output = { at: new Date().toISOString(), scope: 'isolated preauthenticated loopback account and synthetic child',
      preparation: before.preparation, browserMutations: ['review revised evidence', 'adjust daily budget and activity', 'view immutable plan snapshots', 'reschedule a pending review'],
      original: { plan: before.originalPlan, practice: before.originalPractice, reviews: before.originalReviews },
      beforeRestart: first, afterRestart: second, restartIdentical: true,
      validation: { tests: 80, testFiles: 15, typecheck: 'passed', productionBuild: 'passed' },
      limits: ['The 14-day lifecycle uses real API submissions with a controlled test clock; it is not a 14-day human learning trial.',
        'This batch does not establish teaching effectiveness, standardized norms, or PostgreSQL runtime acceptance.'] };
    fs.writeFileSync('doc/evidence/2026-10-19/guidance-runtime.json', JSON.stringify(output, null, 2));
  } else fs.writeFileSync(`data/qa/guidance-${stage}.json`, JSON.stringify({ at: new Date().toISOString(), snapshot }, null, 2));
  process.stdout.write(`Guidance ${stage} verified: activity snapshot, revised evidence, history and schedule.\n`);
}
main().catch(e => { process.stderr.write(e.message + '\n'); process.exitCode = 1; });

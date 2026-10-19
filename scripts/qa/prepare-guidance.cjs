/* Synthetic fixture preparation through the real HTTP APIs. No production account. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
async function api(route, body) {
  const r = await fetch('http://127.0.0.1:14000/api' + route, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const b = await r.json(); assert.ok(r.ok && !b.error, b.error?.message || String(r.status)); return b.data;
}
async function main() {
  const fixture = read('data/qa/browser-fixture.json').reviewFixture;
  assert.ok(fixture.planId && fixture.practiceId, 'Restart the current synthetic fixture first.');
  const plan = await api(`/diagnostics/plans/${fixture.planId}`);
  const practice = await api(`/learning/practice/${fixture.practiceId}`);
  const reviews = await api(`/diagnostics/plans/${fixture.planId}/reviews`);
  assert.equal(plan.revision, 2); assert.equal(plan.impact.needsReview, false);
  const route = `/admin/reviews/diagnostic/${encodeURIComponent(fixture.responseId)}`;
  const detail = await api(route); assert.ok(detail.rubric?.length);
  await api(route, { expectedVersion: detail.reviewVersion, requestKey: 'guidance-browser-basis',
    reason: '合成验收：已按原始量规核对引用线索与解释联系，供家长重新确认指导依据。',
    ratings: detail.rubric.map((_, criterionIndex) => ({ criterionIndex, score: criterionIndex ? 0.5 : 1,
      observation: criterionIndex ? '已给出结论，联系解释还需补充' : '已经引用了具体的文本线索' })) });
  const revised = await api(`/diagnostics/plans/${fixture.planId}`);
  assert.equal(revised.impact.needsReview, true); assert.equal(revised.impact.currentReportVersion, 2);
  fs.writeFileSync('data/qa/guidance-before.json', JSON.stringify({ at: new Date().toISOString(), fixture,
    originalPlan: plan, originalPractice: practice, originalReviews: reviews, revisedPlan: revised,
    preparation: 'Real HTTP rubric revision on the isolated synthetic fixture; browser will adjust activities and reschedule.' }, null, 2));
  process.stdout.write(JSON.stringify({ studentId: fixture.studentId, planId: fixture.planId, practiceId: fixture.practiceId,
    subject: revised.subject, originalRevision: plan.revision, reportVersion: revised.impact.currentReportVersion }) + '\n');
}
main().catch(e => { process.stderr.write(e.message + '\n'); process.exitCode = 1; });

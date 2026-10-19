// Runtime verification against the isolated synthetic loopback API only.
// Learning codes and session tokens remain in this process, never in evidence.
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const base = 'http://127.0.0.1:14000/api';
const fixture = JSON.parse(readFileSync('data/qa/browser-fixture.json', 'utf8'));
const checks = [];
async function call(method, path, body, token, expected = method === 'POST' ? 201 : 200) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(response.status, expected, `${method} ${path}`);
  const result = await response.json();
  if (expected < 400) assert.equal(result.error, null);
  return { data: result.data, cookie: response.headers.get('set-cookie') };
}
async function main() {
  const actor = (await call('GET', '/auth/me')).data;
  assert.equal(actor.principal, 'qa-browser-fixture'); assert.equal(actor.role, 'admin');
  const id = fixture.reviewFixture.studentId, path = `/students/${id}`;
  const prior = (await call('GET', `${path}/learning-access`)).data;
  const access = (await call('POST', `${path}/learning-access`, { enabled: true, expectedVersion: prior.version, requestKey: `qa-enable-${Date.now()}`, reason: '合成监护人开启独立学习，核对真实权限与学习进度提议。' })).data;
  const issued = (await call('POST', `${path}/learning-access/codes`, { expectedVersion: access.version, requestKey: `qa-code-${Date.now()}` })).data;
  const redeemed = await call('POST', '/auth/learning-code', { code: issued.code });
  const token = redeemed.data.token;
  assert.ok(/HttpOnly/.test(redeemed.cookie), 'learning cookie must be private');
  assert.ok(/SameSite=Strict/.test(redeemed.cookie), 'learning cookie must restrict cross-site use');
  await call('POST', '/auth/learning-code', { code: issued.code }, undefined, 401);
  assert.equal((await call('GET', '/auth/me', undefined, token)).data.studentId, id);
  const children = (await call('GET', '/learning/students', undefined, token)).data;
  assert.deepEqual(children.map(c => c.id), [id]);
  checks.push('one-time code, private cookie, own profile only');
  const others = (await call('GET', '/learning/students')).data.filter(c => c.id !== id);
  assert.ok(others.length); await call('GET', `/learning/students/${others[0].id}/today`, undefined, token, 403);
  for (const route of ['/learning/overview', '/admin/accounts', '/questions', `${path}/learning-access`]) await call('GET', route, undefined, token, 403);
  await call('GET', `/learning/practice/${fixture.reviewFixture.practiceId}`, undefined, token);
  checks.push('cross-child and management denied; own frozen practice restored');
  const scope = (await call('GET', `${path}/learning-scope?subject=chinese`, undefined, token)).data;
  const { studentId, id: scopeId, version, confirmedAt, textbookRevision, mappingSnapshots, uncoveredLessonIds, selectedLessonSnapshots, ...scopeInput } = scope;
  const proposal = (await call('POST', `${path}/progress-proposals`, { scope: { ...scopeInput, minutesPerSession: 12 }, baseScopeVersion: version, requestKey: `qa-progress-${Date.now()}` }, token)).data;
  assert.equal((await call('GET', `${path}/learning-scope?subject=chinese`, undefined, token)).data.id, scopeId);
  await call('POST', `${path}/progress-proposals/${proposal.id}/decision`, { decision: 'accept', expectedVersion: proposal.version, requestKey: 'student-cannot-approve', note: '学生不能自己确认范围。' }, token, 403);
  const decision = (await call('POST', `${path}/progress-proposals/${proposal.id}/decision`, { decision: 'accept', expectedVersion: proposal.version, requestKey: `qa-decision-${Date.now()}`, note: '已核对合成进度与具体知识点，确认每次十二分钟。' })).data;
  assert.equal(decision.status, 'accepted');
  const confirmed = (await call('GET', `${path}/learning-scope?subject=chinese`, undefined, token)).data;
  assert.equal(confirmed.version, version + 1); assert.equal(confirmed.minutesPerSession, 12);
  const old = (await call('GET', `/diagnostics/sessions/${fixture.reviewFixture.sessionId}`, undefined, token)).data;
  assert.equal(old.scopeSnapshot.id, scopeId);
  checks.push('proposed progress isolated until guardian accepts; old assessment scope unchanged');
  const sessions = (await call('GET', `${path}/learning-access`)).data.sessions;
  const me = (await call('GET', '/auth/me', undefined, token)).data;
  assert.equal(me.role, 'student');
  const latest = sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  await call('POST', `${path}/learning-access/sessions/${latest.id}/revoke`, {});
  await call('GET', '/auth/me', undefined, token, 401);
  checks.push('guardian device revocation immediately rejects existing learner identity');
  const evidence = { at: new Date().toISOString(), fixture: 'synthetic loopback API', checks, assertions: 'passed',
    databaseUniqueness: '8 constraints tested with full rollback',
    restart: 'durability.integration.test.ts passed: learner identity and own practice survive application restart; overview stays forbidden',
    browser: { status: 'pending', reason: 'Browser Runtime navigation returned BROWSER_ACTION_OUTCOME_UNKNOWN and prohibited further browser mutations this turn' },
    httpPages: {} };
  for (const path of ['/student/login', '/parent/login', '/student/assessment', '/parent/access']) {
    const response = await fetch(`http://127.0.0.1:13000${path}`); assert.equal(response.status, 200); evidence.httpPages[path] = response.status;
  }
  mkdirSync('doc/evidence/2026-10-19', { recursive: true });
  writeFileSync('doc/evidence/2026-10-19/student-access-runtime.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ checks, pages: evidence.httpPages, secretsArchived: false }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

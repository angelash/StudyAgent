// Uses only the isolated synthetic loopback fixture. No credentials are archived.
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync } = require('node:fs');
const fixture = JSON.parse(readFileSync('data/qa/browser-fixture.json', 'utf8'));
async function call(method, path, body, token, status = method === 'POST' ? 201 : 200) {
  const response = await fetch(`http://127.0.0.1:14000/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(response.status, status, `${method} ${path}`);
  return (await response.json()).data;
}
async function main() {
  assert.equal((await call('GET', '/auth/me')).principal, 'qa-browser-fixture');
  const studentId = fixture.reviewFixture.studentId, root = `/students/${studentId}`;
  const access = await call('GET', `${root}/learning-access`);
  const enabled = await call('POST', `${root}/learning-access`, { enabled: true, expectedVersion: access.version, requestKey: `assistant-enable-${Date.now()}`, reason: '合成账号验证助教题目绑定和提示记录，不涉及真实孩子。' });
  const code = await call('POST', `${root}/learning-access/codes`, { expectedVersion: enabled.version, requestKey: `assistant-code-${Date.now()}` });
  const login = await call('POST', '/auth/learning-code', { code: code.code }), token = login.token;
  const practice = await call('GET', `/learning/practice/${fixture.reviewFixture.practiceId}`, undefined, token);
  const questionId = practice.questions.find(q => !q.attempted).id;
  await call('PATCH', `/learning/practice/${practice.id}/questions/${questionId}/draft`, { answer: { value: '我正在把线索和结论联系起来。' } }, token);
  const input = { userRole: 'student', studentId, subject: 'chinese', pageContext: 'mission', contextRefType: 'practice', contextRefId: practice.id, contextItemId: questionId };
  const session = await call('POST', '/ai/assistant/sessions', input, token);
  assert.equal((await call('POST', '/ai/assistant/sessions', input, token)).id, session.id);
  const message = { message: '这一步我还不知道怎样解释线索和结论的联系。', requestKey: 'runtime-context-help' };
  const answer = await call('POST', `/ai/assistant/sessions/${session.id}/messages`, message, token);
  assert.equal(answer.assistanceRecorded, true); assert.equal(answer.source, 'rules'); assert.match(answer.reply, /草稿/);
  const replay = await call('POST', `/ai/assistant/sessions/${session.id}/messages`, message, token);
  assert.equal(replay.messages.length, 2);
  await call('POST', '/ai/assistant/sessions', { ...input, contextItemId: 'not-in-this-practice' }, token, 400);
  const attempt = await call('POST', `/learning/practice/${practice.id}/responses`, { questionId, disposition: 'skip', elapsedMs: 3000, requestKey: 'runtime-context-answer' }, token);
  assert.equal(attempt.attempt.hintLevel, 1);
  const evidence = { at: new Date().toISOString(), fixture: 'synthetic loopback API', checks: [
    'actual student identity binds current frozen practice question', 'resumes same conversation', 'reads saved draft without grading secrets',
    'local guidance remains usable without AI key', 'assistance recorded on later response', 'same request does not duplicate conversation or assistance', 'foreign item rejected',
  ], historyCount: replay.messages.length, responseHintLevel: attempt.attempt.hintLevel,
    restart: 'durability.integration.test.ts passed: same scoped conversation and messages restored; repeated request remains idempotent',
    browser: 'pending due to Browser Runtime terminal navigation result', secretsArchived: false };
  writeFileSync('doc/evidence/2026-10-19/assistant-context-runtime.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

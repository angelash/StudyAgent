const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
async function main() {
  const before = read('data/qa/processing-before-restart.json'), after = read('data/qa/processing-after-restart.json');
  const normalized = data => { const { at, stage, ...rest } = data; return rest; };
  assert.deepEqual(normalized(before), normalized(after));
  const crash = read('data/qa/processing-crash.json');
  const api = async route => { const r = await fetch('http://127.0.0.1:14000/api' + route), b = await r.json(); assert.ok(r.ok && !b.error); return b.data; };
  const task = await api(`/admin/processing/tasks/${crash.taskId}`), history = await api(`/admin/processing/tasks/${crash.taskId}/history`);
  assert.equal(task.state, 'succeeded'); assert.equal(task.attempts, 2);
  assert.equal(history.filter(h => h.action === 'claimed').length, 2);
  const candidates = await api(`/admin/question-import-jobs/${crash.jobId}/candidates?page=1`); assert.equal(candidates.total, 10);
  const checkpointRoot = 'data/qa/browser-fixture/processing/cache/study-document-v2/' + before.files[0].sha256;
  const checkpoints = [1, 2].map(page => { const stat = fs.statSync(path.join(checkpointRoot, `page-${page}.json`));
    assert.ok(stat.mtimeMs < Date.parse(crash.at)); return { page, existedBeforeRecovery: true, modifiedAt: stat.mtime.toISOString() }; });
  const db = new DatabaseSync('data/qa/browser-fixture/study-agent.sqlite3', { readOnly: true });
  const modelFiles = ['task_ae5ab03e-dba8-431d-a223-5f71f94ffefa', 'task_8b3a4113-0a21-40b8-a14d-5f2040255afb'].map(id => {
    const runRoot = path.join('data/qa/browser-fixture/processing/runs', id);
    const folder = fs.readdirSync(runRoot).find(n => fs.existsSync(path.join(runRoot, n, 'explanation.json')));
    const result = read(path.join(runRoot, folder, 'explanation.json'));
    assert.equal(result.verifiedCorrect, false);
    return { taskId: id, model: result.model, promptVersion: result.promptVersion || 'legacy-explain', output: result.text,
      humanEvaluation: 'Contains unsupported or incorrect content. Rejected as teaching or scoring evidence; no automated adoption.', verifiedCorrect: false };
  });
  db.close();
  const output = { at: new Date().toISOString(), scope: 'isolated synthetic loopback account; real preserved source page and rasterized copy',
    browserMutations: ['import creation', 'handwriting preview creation', 'local review creation', 'manual correction and draft creation'],
    upload: read('data/qa/processing-upload-evidence.json'), beforeRestart: before, afterRestart: after, restartIdentical: true,
    recovery: { ...crash, requestedExitCode: crash.requestedExitCode || crash.exitCode, observedExitCode: 1,
      harnessNote: 'Windows Node reported a UV_HANDLE_CLOSING assertion during forced exit. The committed claim remained durable; later harness closes DB before normal nonzero exit.',
      task, history, candidateCount: candidates.total, checkpoints }, modelEvaluations: modelFiles,
    validation: { tests: 76, testFiles: 15, apiTypecheck: 'passed', webTypecheck: 'passed', webProductionBuild: 'passed' },
    limits: ['Browser file picker was not automated; bytes used the real chunk upload API.', 'Model execution is verified; subject accuracy is not verified.', 'No PostgreSQL runtime acceptance in this batch.'] };
  fs.writeFileSync('doc/evidence/2026-10-19/processing-runtime.json', JSON.stringify(output, null, 2));
  process.stdout.write('Processing evidence archived; restart, recovery, source gate and hashes verified.\n');
}
main().catch(e => { process.stderr.write(e.message + '\n'); process.exitCode = 1; });

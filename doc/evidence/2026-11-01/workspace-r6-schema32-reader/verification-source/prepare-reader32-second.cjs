const fs = require('node:fs'), path = require('node:path');
let source = fs.readFileSync(path.join(__dirname, 'verify-reader32-first.cjs'), 'utf8').replaceAll('data/qa/r32a', 'data/qa/r32b').replaceAll('reader32-execution-first.json', 'reader32-execution-second.json');
const before = "same(before.tasks, after.tasks, label + ' original terminal/queued task rows'); same(before.history, after.history, label + ' original task history');";
if (!source.includes(before)) throw Error('Expected first native task assertion required');
source = source.replace(before, "verifyRestoredTaskHistory(before, after, label);");
const functionBody = `function verifyRestoredTaskHistory(before, after, label) {
  if (label !== 'queued-source-exposures') { same(before.tasks, after.tasks, label + ' original tasks'); same(before.history, after.history, label + ' original history'); return; }
  const affected = before.tasks.filter(task => task.kind === 'library.paper-export.render' && task.state === 'queued');
  assert.equal(affected.length, 18, 'Exact original generated queued-export fixture'); same(before.tasks.map(task => task.id), after.tasks.map(task => task.id), 'No added or removed native task');
  for (const original of before.tasks) {
    const current = after.tasks.find(task => task.id === original.id); assert(current);
    if (!affected.some(task => task.id === original.id)) { same(original, current, 'Unrelated and already terminal original tasks'); continue; }
    assert.equal(new Date(current.updated_at).toISOString(), current.updated_at);
    same({ ...original, state: 'cancelled', version: original.version + 1, lease_token: null, lease_until: null, updated_at: current.updated_at, error_code: 'restored_paper_export_fence' }, current, 'Exact queued export fence, no input or generation rewrite');
  }
  for (const original of before.history) same(original, after.history.find(row => row.id === original.id), 'Every original task-history row');
  const added = after.history.filter(row => !before.history.some(original => original.id === row.id)); assert.equal(added.length, affected.length);
  const audit = after.rows.filter(row => row.collection === 'events').at(-1).body;
  for (const task of affected) {
    const rows = added.filter(row => row.task_id === task.id); assert.equal(rows.length, 1); const row = rows[0], current = after.tasks.find(item => item.id === task.id);
    assert.equal(row.action, 'restored_paper_export_fence'); assert.equal(row.actor_id, 'local-restore'); assert.equal(row.at, current.updated_at);
    same(typeof row.detail === 'string' ? JSON.parse(row.detail) : row.detail, { backupId: audit.payload.backupId, previousState: 'queued' }, 'Restore history bound to actual backup and original state');
  }
}
`;
source = source.replace('(async () => {', functionBody + '(async () => {');
source = source.replace("originalSourceUnchanged: true });", "originalSourceUnchanged: true, paperExportTasksFenced: result.paperExportTasksFenced });");
fs.writeFileSync(path.join(__dirname, 'verify-reader32-second.cjs'), source, { flag: 'wx' });

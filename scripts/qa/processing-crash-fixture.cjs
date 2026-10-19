// Simulate process loss AFTER a real claim commits, BEFORE any processor publishes.
// Run only with the isolated API's embedded worker disabled.
const { resolve } = require('node:path');
const { writeFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { DomainDatabase } = require('../../apps/api/dist/apps/api/src/infrastructure/domain-database.js');
async function main() {
  const response = await fetch('http://127.0.0.1:14000/api/admin/question-import-jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ importType: 'textbook_pdf', subject: 'math', fileIds: ['import_file_0b1f8a4e-c331-449e-808b-7b9bb01a6d88'],
      requestKey: `recovery-${randomUUID()}`, sourcePolicy: { sourceType: 'public_reference', licenseClass: 'C_PUBLIC_REFERENCE_ONLY', licenseName: 'QA process recovery fixture' } }) });
  const body = await response.json(); if (!response.ok || body.error) throw new Error('Recovery fixture could not queue import');
  const database = new DomainDatabase(resolve('data/qa/browser-fixture/study-agent.sqlite3')); await database.open();
  const task = await database.tasks.claim(['question.pdf.import']);
  if (task?.id !== body.data.taskId) throw new Error('Unexpected pending task; keep QA isolated');
  const evidence = { at: new Date().toISOString(), jobId: body.data.id, taskId: task.id, state: task.state, attempt: task.attempts,
    leaseUntil: task.leaseUntil, simulation: 'process exits immediately after committed claim; actual document processor has not started', requestedExitCode: 17 };
  writeFileSync('data/qa/processing-crash.json', JSON.stringify(evidence, null, 2));
  await database.close();
  process.stdout.write(JSON.stringify(evidence) + '\n'); process.exitCode = 17;
}
main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });

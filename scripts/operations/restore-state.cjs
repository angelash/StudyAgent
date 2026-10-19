const { randomUUID } = require('node:crypto');
// Caller owns the database transaction and commits this audit with every fence.
async function fenceRestoredState(query, backupId, sourceRevision) {
  const at = new Date().toISOString(), auditId = `restore_${randomUUID()}`;
  const counts = { revokedSessions: 0, revokedLearningCodes: 0, expiredInvitations: 0, fencedTasks: 0 };
  for (const row of await query("SELECT collection,record_id,body FROM domain_records WHERE collection IN ('sessions','studentLearningCodes','studentInvitations')")) {
    const value = typeof row.body === 'string' ? JSON.parse(row.body) : row.body;
    if (row.collection === 'studentInvitations' && !value.consumedAt) { value.expiresAt = at; counts.expiredInvitations++; }
    else if (row.collection === 'sessions' && !value.revokedAt) { value.revokedAt = at; counts.revokedSessions++; }
    else if (row.collection === 'studentLearningCodes' && !value.usedAt && !value.revokedAt) { value.revokedAt = at; counts.revokedLearningCodes++; }
    else continue;
    await query('UPDATE domain_records SET body=? WHERE collection=? AND record_id=?', [JSON.stringify(value), row.collection, row.record_id]);
  }
  for (const task of await query("SELECT id,state,attempts,max_attempts FROM durable_tasks WHERE state IN ('running','cancel_requested')")) {
    const state = task.state === 'cancel_requested' ? 'cancelled' : task.attempts >= task.max_attempts ? 'failed' : 'retry_wait';
    await query('UPDATE durable_tasks SET state=?,lease_token=NULL,lease_until=NULL,available_at=?,version=version+1,generation=generation+1,updated_at=?,error_code=? WHERE id=?',
      [state, Date.now(), at, state === 'failed' ? 'attempts_exhausted' : state === 'retry_wait' ? 'restored_interruption' : null, task.id]);
    await query('INSERT INTO durable_task_history VALUES(?,?,?,?,?,?)', [randomUUID(), task.id, 'restored', 'local-restore', at, JSON.stringify({ previousState: task.state, state, backupId })]); counts.fencedTasks++;
  }
  const event = { eventId: auditId, eventName: 'operations.restored', eventVersion: 1, occurredAt: at,
    payload: { backupId, sourceRevision, ...counts, channel: 'local-cli' } };
  const position = Number((await query("SELECT COALESCE(MAX(position),-1)+1 AS position FROM domain_records WHERE collection='events'"))[0].position);
  await query('INSERT INTO domain_records VALUES(?,?,?,?)', ['events', auditId, JSON.stringify(event), position]);
  await query('UPDATE store_meta SET revision=revision+1 WHERE id=1');
  return { restoredAt: at, ...counts };
}
module.exports = { fenceRestoredState };

// Native backup/restore uses the same source semantics as the current reader.
const path = require('node:path');
const collections = "'assistantSessions','studioTopicWhiteboardDrafts','studioTopicWhiteboards'";
const sql = 'SELECT collection,record_id,body FROM domain_records WHERE collection IN (' + collections + ')';
function validate(rows) {
  // Do not add a compiled-code dependency to legacy backups without source records.
  const source = rows.some(row => {
    const value = typeof row.body === 'string' ? JSON.parse(row.body) : row.body;
    return row.collection === 'studioTopicWhiteboardDrafts'
      ? value.prepared?.source || value.prepared?.input?.audience?.kind === 'assistant' || value.prepared?.version && value.prepared.version !== 'topic-whiteboard-v1'
        || value.content?.scenes?.some(scene => Object.hasOwn(scene, 'sourceMap'))
      : row.collection === 'studioTopicWhiteboards' && (value.privateToCreator || value.sourceProtocol !== undefined);
  });
  if (source) require(path.resolve(__dirname, '../../apps/api/dist/apps/api/src/modules/learning/assistant-whiteboard-integrity.js')).assertAssistantWhiteboardRecords(rows);
}
module.exports = { sql, validate };

// Read only the isolated synthetic QA data; never output users, tokens or account hashes.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const db = new DatabaseSync('data/qa/browser-fixture/study-agent.sqlite3', { readOnly: true });
const root = path.resolve('data/qa/browser-fixture/processing');
const jobId = 'question_import_job_678f22f2-c25d-4067-9503-f4798b815ad6';
const row = (collection, id) => JSON.parse(db.prepare('SELECT body FROM domain_records WHERE collection=? AND record_id=?').get(collection, id).body);
const rows = collection => db.prepare('SELECT body FROM domain_records WHERE collection=?').all(collection).map(r => JSON.parse(r.body));
const records = rows('questionImportRecords').filter(r => r.jobId === jobId);
assert.equal(records.length, 10);
assert.equal(records.filter(r => r.extractionMethod === 'pdf_text').length, 5);
assert.equal(records.filter(r => r.extractionMethod === 'ocr').length, 5);
const reviewed = records.find(r => r.reviewStatus === 'approved');
assert.equal(reviewed.reviewVersion, 1);
assert.equal(reviewed.reviewHistory.length, 1);
assert.ok(reviewed.originalCandidate.stem.includes('1张元'));
assert.equal(reviewed.candidateStem, '2. 1张5元和2张5角合起来就是5元5角。（判断对错）');
assert.equal(reviewed.pageEvidence, undefined);
const question = row('questions', reviewed.candidateQuestionId);
assert.equal(question.stem, reviewed.candidateStem); assert.equal(question.status, 'draft');
const source = rows('questionSources').find(s => s.questionId === question.id);
assert.equal(source.reviewStatus, 'pending'); assert.equal(source.licenseClass, 'C_PUBLIC_REFERENCE_ONLY');
const document = rows('questionDocuments').find(d => d.questionId === question.id);
assert.ok(!document.blocks.some(b => b.url?.includes('/admin/')));
const pages = rows('importPages').filter(p => p.jobId === jobId);
assert.equal(pages.length, 2);
const pageEvidence = pages.map(p => {
  const bytes = fs.readFileSync(path.resolve(root, p.relativePath)); assert.equal(hash(bytes), p.sha256);
  const evidence = JSON.parse(bytes); assert.ok(evidence.lines.length > 0);
  return { id: p.id, sha256: p.sha256, pageNumber: p.pageNumber, method: evidence.method, lineCount: evidence.lines.length, warnings: evidence.warnings };
});
const files = rows('importFiles').map(file => {
  assert.equal(file.status, 'ready');
  const bytes = fs.readFileSync(path.resolve(root, 'blobs', file.sha256)); assert.equal(hash(bytes), file.sha256);
  return { id: file.id, sha256: file.sha256, size: file.size, status: file.status };
});
const taskIds = ['task_4c71ba7d-657e-41c7-b962-184b73b2ca16', 'task_ca4ca4b7-fc92-4795-ae3b-a7114871156c', 'task_8b3a4113-0a21-40b8-a14d-5f2040255afb'];
const tasks = taskIds.map(id => {
  const t = db.prepare('SELECT id,kind,state,attempts,generation,result FROM durable_tasks WHERE id=?').get(id);
  assert.equal(t.state, 'succeeded'); return { ...t, result: JSON.parse(t.result) };
});
const output = { at: new Date().toISOString(), stage: process.argv[2] || 'verified', jobId, candidateCount: records.length,
  methods: { pdf_text: 5, ocr: 5 }, corrected: { id: reviewed.id, questionId: question.id, reviewVersion: reviewed.reviewVersion,
    originalCandidateHash: hash(JSON.stringify(reviewed.originalCandidate)), reviewHistoryHash: hash(JSON.stringify(reviewed.reviewHistory)),
    questionStatus: question.status, sourceReviewStatus: source.reviewStatus, privatePageImagesInQuestion: false }, pageEvidence, files, tasks };
db.close();
fs.writeFileSync(`data/qa/processing-${output.stage}.json`, JSON.stringify(output, null, 2));
process.stdout.write(JSON.stringify(output, null, 2) + '\n');

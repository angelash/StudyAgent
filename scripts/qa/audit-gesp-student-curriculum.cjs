const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const curriculumPath = 'resources/gesp/student-curriculum-v2.json';
const knowledgePath = 'resources/gesp/knowledge-map.json';
const curriculum = JSON.parse(fs.readFileSync(path.join(root, curriculumPath), 'utf8'));
const knowledge = JSON.parse(fs.readFileSync(path.join(root, knowledgePath), 'utf8'));
const expected = knowledge.atoms.filter(atom => atom.level >= 1 && atom.level <= 4);
const tasks = curriculum.tasks;
assert.equal(curriculum.format, 'gesp-student-pilot-v2');
assert.equal(curriculum.status, 'original_authored_pilot');
assert.equal(tasks.length, 49);
assert.deepEqual(new Set(tasks.map(task => task.atomId)), new Set(expected.map(atom => atom.id)));
assert.equal(new Set(tasks.map(task => task.id)).size, tasks.length);
for (const task of tasks) {
  assert.equal(task.reviewStatus, 'original_authored_pilot');
  assert.equal(task.standard, 'C++17');
  assert.equal(task.probes.length, 2);
  assert.deepEqual(task.probes.map(probe => probe.dimension).sort(), ['procedure', 'understanding']);
  for (const probe of task.probes) { assert(probe.options.length >= 3); assert(probe.options.includes(probe.answer)); }
  assert(task.tests.length >= 3);
  assert.equal(new Set(task.tests.map(test => test.input)).size, task.tests.length);
  assert(task.tests.every(test => typeof test.expected === 'string' && test.expected.endsWith('\n')));
}
const byLevel = Object.fromEntries([1, 2, 3, 4].map(level => [level, {
  atoms: expected.filter(atom => atom.level === level).length,
  tasks: tasks.filter(task => task.atomId.startsWith(`gesp-cpp.l${level}.`)).length
}]));
const receipt = { format: 'study-agent-gesp-student-content-audit-v2', at: new Date().toISOString(), passed: true,
  inputs: Object.fromEntries([curriculumPath, knowledgePath].map(file => [file,
    createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])),
  totals: { levels: 4, tasks: tasks.length, probes: tasks.reduce((sum, task) => sum + task.probes.length, 0),
    hiddenTests: tasks.reduce((sum, task) => sum + task.tests.length, 0) }, byLevel,
  states: { publicationStatus: 'original_authored_pilot', humanReviewCompleted: false, officialQuestionReuse: false },
  scope: 'Structural authored-pilot audit only; this is not official-syllabus review, psychometric validity or human acceptance.' };
const output = path.resolve(process.argv[2] ?? 'data/qa/gesp-student-content-audit-v2.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));

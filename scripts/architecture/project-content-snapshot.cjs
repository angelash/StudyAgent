/* Summarize versioned content; never read family data, credentials or raw archives. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const hash = file => createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const inventory = json('doc/design/generated/source-inventory.json');
const auditPath = 'data/qa/project-design-authored-audit.json';
if (!fs.existsSync(path.join(root, auditPath))) throw new Error('First run: node scripts/qa/audit-authored-curriculum.cjs ' + auditPath);
const audit = json(auditPath);
assert.equal(audit.passed, true, 'Authored content audit must pass');
for (const [file, expected] of Object.entries(audit.sourceSha256)) assert.equal(hash(file), expected, 'Stale authored content audit: ' + file);

// Execute only the allowlisted pure versioned classroom-content modules, directly from TypeScript.
// No application bootstrap, API, persistence, network or environment configuration is loaded.
const classroomFile = 'apps/api/src/modules/learning/classroom-curriculum.ts';
const boardFile = 'apps/api/src/modules/learning/classroom-board-notes.ts';
const checksFile = 'apps/api/src/modules/learning/classroom-unit-checks.ts';
const practiceFiles = ['content', 'model', 'u1', 'u2', 'u3', 'u4', 'u5'].map(name => 'apps/api/src/modules/learning/classroom-practice-' + name + '.ts');
const allowed = new Set([classroomFile, boardFile, checksFile, ...practiceFiles]), cache = new Map();
function loadContent(file) {
  assert(allowed.has(file), 'Unexpected classroom module: ' + file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const localRequire = name => {
    if (name === 'node:crypto') return require('node:crypto');
    assert(name.startsWith('./'), 'Unexpected classroom dependency: ' + name);
    return loadContent(path.posix.normalize(path.posix.join(path.posix.dirname(file), name + '.ts')));
  };
  const compiled = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, require: localRequire, structuredClone }, { filename: file, timeout: 5000 });
  return module.exports;
}
const classroom = loadContent(classroomFile), course = classroom.classroomCourse();
const lectures = course.units.flatMap(unit => unit.lectures), lessons = lectures.flatMap(lecture => lecture.lessons);
const practiceQuestions = lessons.flatMap(lesson => classroom.classroomLesson(lesson.id).questions);
const questionIds = practiceQuestions.map(question => question.id);
assert.equal(new Set(questionIds).size, questionIds.length, 'Unexpected duplicate lesson question IDs');
const unitQuestionIds = course.units.flatMap(unit => classroom.classroomLesson('unit-exam:' + unit.id).questions.map(question => question.id));
assert.equal(new Set(unitQuestionIds).size, unitQuestionIds.length, 'Unexpected duplicate unit-check question IDs');
assert(unitQuestionIds.every(id => !questionIds.includes(id)), 'Unit check must not reuse classroom practice IDs');
const textbooksPath = 'resources/curriculum/textbooks-v1.json';
const gespKnowledgePath = 'resources/gesp/knowledge-map.json', gespTasksPath = 'resources/gesp/student-curriculum-v2.json';
const gespQuestionsPath = 'resources/gesp/questions.jsonl';
const researchQuestions = read(gespQuestionsPath).trim().split(/\r?\n/).filter(Boolean);
researchQuestions.forEach(line => JSON.parse(line));
const snapshot = {
  schemaVersion: 1, sourceRevision: inventory.sourceRevision,
  scope: 'Static versioned curriculum and registry counts. No real family database, full raw-asset byte inventory, runtime model calls, textbook coverage review or human validity study.',
  authored: {
    auditAt: audit.at, auditCommand: 'node scripts/qa/audit-authored-curriculum.cjs ' + auditPath,
    localAuditArtifact: auditPath, localAuditSha256: hash(auditPath), passed: audit.passed,
    familyIdentityVersion: audit.familyIdentityVersion, materialCoverageVersion: audit.materialCoverageVersion,
    totals: audit.totals, cells: audit.cells, sourceSha256: audit.sourceSha256,
    interpretation: 'Structural completeness of currently authored points and material budgets only. Not full textbook coverage or standardized measurement validity.'
  },
  registry: { textbooks: { records: json(textbooksPath).books.length, source: textbooksPath, sha256: hash(textbooksPath), interpretation: 'Registration records are not approved full-content teaching coverage.' } },
  gesp: {
    candidateKnowledgePoints: json(gespKnowledgePath).atoms.length,
    researchQuestionIndexRows: researchQuestions.length,
    authoredPilotTasks: json(gespTasksPath).tasks.length,
    sourceSha256: Object.fromEntries([gespKnowledgePath, gespQuestionsPath, gespTasksPath].map(file => [file, hash(file)])),
    interpretation: 'Research index and authored pilot tasks are separate. Counts do not assert review approval or complete student curricula.'
  },
  adultClassroom: {
    courseId: course.id, courseVersion: course.version, units: course.units.length, lectures: lectures.length,
    microLessons: lessons.length, lessonQuestions: questionIds.length, unitCheckQuestions: unitQuestionIds.length,
    distinctQuestionIds: questionIds.length + unitQuestionIds.length,
    microLessonsWithAtLeastThreeQuestions: lessons.filter(lesson => classroom.classroomLesson(lesson.id).questions.length >= 3).length,
    tableQuestions: practiceQuestions.filter(question => question.table).length,
    diagramQuestions: practiceQuestions.filter(question => question.diagram).length,
    hintLevels: questionIds.concat(unitQuestionIds).reduce((sum, id) => sum + classroom.classroomHintKeys(id).length, 0),
    sourceSha256: Object.fromEntries([classroomFile, boardFile, checksFile, ...practiceFiles].map(file => [file, hash(file)])),
    interpretation: 'Classroom practice and newly authored unit scenarios are separate counts. They are not standardized student ability measurement or proof of unseen exposure outside this course.'
  }
};
fs.writeFileSync(path.join(root, 'doc/design/generated/content-snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n');
console.log(JSON.stringify({ authored: snapshot.authored.totals, textbooks: snapshot.registry.textbooks.records, gesp: { candidateKnowledgePoints: snapshot.gesp.candidateKnowledgePoints, researchQuestionIndexRows: snapshot.gesp.researchQuestionIndexRows, authoredPilotTasks: snapshot.gesp.authoredPilotTasks }, classroom: snapshot.adultClassroom }, null, 2));

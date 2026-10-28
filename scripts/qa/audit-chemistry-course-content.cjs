const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..'), courseId = process.argv[2], destination = path.resolve(root, process.argv[3] || 'data/qa/chemistry-course-content.json');
if (!courseId || !destination.startsWith(root + path.sep) || fs.existsSync(destination)) throw Error('Supply an exact course id and a new workspace report path');
const compiled = file => require(path.join(root, 'apps/api/dist/apps/api/src/modules', file + '.js'));
const { chemistryUnits, chemistryAtomId, buildChemistryCurriculum } = compiled('diagnostics/chemistry-curriculum');
const { curriculumClassroomLesson } = compiled('learning/classroom-curriculum');
const { foundationQuestionId } = compiled('diagnostics/foundation-curriculum');
const { isChemistrySemesterCourse, chemistryCourseFingerprint } = compiled('learning/chemistry-course');
const db = new DatabaseSync(path.join(process.env.STUDY_DATA_DIR || path.join(root, 'data'), 'study-agent.sqlite3'), { readOnly: true });
const rows = collection => db.prepare('SELECT body FROM domain_records WHERE collection=?').all(collection).map(row => JSON.parse(row.body));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
try {
  const course = rows('studioCourses').find(course => course.id === courseId);
  assert(course && isChemistrySemesterCourse(course), 'Exact course is not the complete ninth-grade chemistry path');
  assert.equal(chemistryCourseFingerprint(course), course.fingerprint, 'Course fingerprint must match saved content');
  const definitions = buildChemistryCurriculum();
  const expected = new Map(definitions.map(({ atom }) => [atom.id, atom]));
  const expectedQuestions = new Map(definitions.flatMap(({ atom, exercises }) => exercises.map(exercise => [foundationQuestionId(atom.id, exercise), { atomId: atom.id, exercise }])));
  const lessons = course.units.flatMap(unit => unit.lessons).filter(lesson => lesson.kind === 'learn');
  assert.equal(lessons.length, 28); assert.equal(course.units.length, 7);
  const wrongContent = /两位数乘两位数|余数与除数|长方形面积|异分母|通分|foundation:math:|core:math:/;
  assert(!wrongContent.test(JSON.stringify(course)), 'Mathematics content remains in the chemical course');
  const mappings = rows('measurementItems').filter(item => course.focusAtomIds.includes(item.atomId) && item.reviewStatus === 'approved');
  const questionMap = new Map(rows('questions').map(question => [question.id, question]));
  const audit = lessons.map(lesson => {
    const atom = expected.get(lesson.atomId); assert(atom, 'Lesson target is outside chemistry');
    assert.equal(lesson.title, atom.name); assert.deepEqual(lesson.teaching.teaching, atom.teaching);
    const classroom = curriculumClassroomLesson(course, lesson); assert(classroom);
    assert.equal(classroom.steps.find(step => step.phase === 'concept').narration, atom.teaching.explanation);
    assert(classroom.steps.find(step => step.phase === 'concept').blocks.some(block => block.kind === 'text' && block.text === atom.teaching.explanation));
    const example = classroom.steps.find(step => step.phase === 'example');
    assert.equal(example.title, atom.teaching.example.prompt); assert(example.narration.includes(atom.teaching.example.conclusion));
    assert(!wrongContent.test(JSON.stringify(classroom)));
    const practice = course.units.flatMap(unit => unit.lessons).find(item => item.kind === 'practice' && item.atomId === atom.id);
    const url = new URL(practice.href, 'http://local');
    assert.equal(url.searchParams.get('subject'), 'chemistry'); assert.equal(url.searchParams.get('studentId'), course.studentId);
    assert.equal(url.searchParams.get('atom'), atom.id);
    const questionIds = [...new Set(mappings.filter(item => item.atomId === atom.id).map(item => item.questionId))];
    assert(questionIds.length >= 72);
    for (const id of questionIds) {
      const question = questionMap.get(id), original = expectedQuestions.get(id);
      assert(question && question.subject === 'chemistry' && original?.atomId === atom.id);
      assert.equal(question.stem, original.exercise.stem);
      assert.deepEqual(question.answer, original.exercise.answer);
      assert(!wrongContent.test(JSON.stringify(question)));
    }
    return { atomId: atom.id, title: lesson.title, conceptMatches: true, workedExampleMatches: true, chemicalPractice: true,
      independentQuestions: questionIds.length, classroomSha256: hash(classroom) };
  });
  const required = chemistryUnits.flatMap(unit => unit.codes.map(chemistryAtomId));
  assert.deepEqual(lessons.map(lesson => lesson.atomId), required);
  const report = { at: new Date().toISOString(), courseId, title: course.title, subject: course.subject, grade: course.grade,
    fingerprint: course.fingerprint, units: course.units.length, lessons: audit,
    questions: new Set(mappings.map(item => item.questionId)).size, mathematicalContentMismatch: false,
    boundary: 'Read-only audit of the saved course, its generated classroom bodies and linked question subjects. No learner responses created.' };
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ courseId, verifiedLessons: audit.length, questions: report.questions, mathematicalContentMismatch: false, report: destination }));
} finally { db.close(); }

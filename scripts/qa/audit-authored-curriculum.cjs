// Audits the authored source, not textbook coverage or psychometric calibration.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { atomTeachingSchema } = require('@study-agent/contracts');
const { buildFoundationCurriculum } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/foundation-curriculum.js');
const { buildAllAuthoredMathProbeFamilies } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/authored-math-probes.js');
const root = path.resolve(__dirname, '../..'), definitions = buildFoundationCurriculum();
const points = definitions.map(({ atom, exercises }) => {
  assert(atom.teaching, `${atom.id}: teaching missing`);
  assert(atomTeachingSchema.safeParse(atom.teaching).success, `${atom.id}: invalid teaching`);
  assert.equal(atom.teaching.reviewStatus, 'approved');
  assert(!exercises.some(item => item.stem === atom.teaching.example.prompt), `${atom.id}: assessment copied as demonstration`);
  assert(atom.teaching.commonErrors.every(row => row.alternativeExplanations.length >= 2), `${atom.id}: missing alternatives`);
  const families = [...new Set(exercises.map(item => item.family))].sort();
  const dimensions = Object.fromEntries(['understanding', 'procedure', 'transfer'].map(dimension =>
    [dimension, new Set(exercises.filter(item => item.dimension === dimension).map(item => item.family)).size]));
  const gaps = [];
  if (!dimensions.understanding) gaps.push('understanding_family_missing');
  if (!dimensions.procedure) gaps.push('procedure_family_missing');
  if (dimensions.transfer < 2) gaps.push('two_transfer_families_missing');
  if (families.length < 4) gaps.push('family_diversity_below_four');
  return { atomId: atom.id, name: atom.name, subject: atom.subject, grade: atom.grade, authoredTeaching: true,
    workedSteps: atom.teaching.example.steps.length, errorAlternatives: atom.teaching.commonErrors.map(row => row.alternativeExplanations.length),
    exercises: exercises.length, families: families.length, dimensions, measurementMaterialGaps: gaps };
});
assert.equal(points.length, 257); assert.equal(new Set(points.map(point => point.atomId)).size, points.length);
const cells = ['math', 'chinese', 'english'].flatMap(subject => [1, 2, 3, 4, 5, 6].map(grade => {
  const rows = points.filter(point => point.subject === subject && point.grade === grade);
  return { subject, grade, points: rows.length, authoredTeaching: rows.filter(row => row.authoredTeaching).length,
    exercises: rows.reduce((sum, row) => sum + row.exercises, 0), pointsNeedingMoreMeasurementMaterials: rows.filter(row => row.measurementMaterialGaps.length).length };
}));
const evidence = { at: new Date().toISOString(), passed: true,
  scope: `All ${points.length} currently authored original knowledge definitions. Teaching completeness is structural and point-level; it is not complete textbook alignment, human field validation or standardized calibration.`,
  totals: { points: points.length, teaching: points.length, missingTeaching: 0,
    originalExercises: points.reduce((sum, point) => sum + point.exercises, 0),
    pointsNeedingMoreMeasurementMaterials: points.filter(point => point.measurementMaterialGaps.length).length },
  sourceSha256: Object.fromEntries(['foundation-curriculum.ts', 'authored-relation-release.ts', 'authored-atomic-curriculum.ts', 'authored-math-probes.ts', 'authored-arithmetic-probes.ts', 'authored-number-probes.ts', 'authored-spatial-probes.ts', 'authored-second-grade-probes.ts', 'authored-data-probes.ts', 'authored-third-grade-probes.ts', 'authored-unit-probes.ts', 'authored-teaching.ts', 'authored-math-teaching.ts',
    'authored-geometry-probes.ts', 'authored-chinese-teaching.ts', 'authored-english-teaching.ts', 'teaching-author.ts'].map(file => {
    const source = 'apps/api/src/modules/diagnostics/' + file;
    return [source, createHash('sha256').update(fs.readFileSync(path.join(root, source))).digest('hex')];
  }).concat(['resources/curriculum/authored-relations-2026-10-20-v1.json', 'resources/curriculum/authored-atomic-relations-2026-10-20-v1.json',
    'resources/curriculum/geometry-probes-v1.json', 'scripts/content/build-geometry-probes.cjs',
    ...fs.readdirSync(path.join(root, 'apps/web/public/question-assets/geometry-probes-v1')).sort().map(name => 'apps/web/public/question-assets/geometry-probes-v1/' + name)]
    .map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]))), authoredProbeFamilies: buildAllAuthoredMathProbeFamilies().map(({ exercises, ...family }) => ({ ...family,
    questions: exercises.length, note: 'Authored task-structure distinction; no field calibration or statistical independence claim.' })), cells, points };
const output = path.resolve(process.argv[2] ?? 'data/qa/authored-curriculum-audit.json');
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence.totals));

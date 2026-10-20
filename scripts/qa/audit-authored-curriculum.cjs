// Audits the authored source, not textbook coverage or psychometric calibration.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { atomTeachingSchema } = require('@study-agent/contracts');
const { buildFoundationCurriculum } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/foundation-curriculum.js');
const { buildAllAuthoredProbeFamilies } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/authored-probes.js');
const { FAMILY_IDENTITY_VERSION, canonicalFamily } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/family-identity.js');
const { materialStructureCoverage, MATERIAL_COVERAGE_VERSION } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/verification-materials.js');
const root = path.resolve(__dirname, '../..'), definitions = buildFoundationCurriculum();
const points = definitions.map(({ atom, exercises }) => {
  assert(atom.teaching, `${atom.id}: teaching missing`);
  assert(atomTeachingSchema.safeParse(atom.teaching).success, `${atom.id}: invalid teaching`);
  assert.equal(atom.teaching.reviewStatus, 'approved');
  assert(!exercises.some(item => item.stem === atom.teaching.example.prompt), `${atom.id}: assessment copied as demonstration`);
  assert(atom.teaching.commonErrors.every(row => row.alternativeExplanations.length >= 2), `${atom.id}: missing alternatives`);
  const identity = item => canonicalFamily({ atomId: atom.id, family: item.family });
  const families = [...new Set(exercises.map(identity))].sort();
  const dimensions = Object.fromEntries(['understanding', 'procedure', 'transfer'].map(dimension =>
    [dimension, new Set(exercises.filter(item => item.dimension === dimension).map(identity)).size]));
  const structure = materialStructureCoverage(atom.id, exercises.map(item => ({ atomId: atom.id, family: item.family, dimension: item.dimension })),
    atom.strand === '口语表达' ? 'oral-production-v1' : 'written-contrast-v1');
  return { atomId: atom.id, name: atom.name, subject: atom.subject, grade: atom.grade, authoredTeaching: true,
    workedSteps: atom.teaching.example.steps.length, errorAlternatives: atom.teaching.commonErrors.map(row => row.alternativeExplanations.length),
    exercises: exercises.length, families: families.length, rawFamilyLabels: new Set(exercises.map(item => item.family)).size,
    dimensions, materialStructure: structure, measurementMaterialGaps: structure.gaps };
});
assert.equal(points.length, 258); assert.equal(new Set(points.map(point => point.atomId)).size, points.length);
const cells = ['math', 'chinese', 'english'].flatMap(subject => [1, 2, 3, 4, 5, 6].map(grade => {
  const rows = points.filter(point => point.subject === subject && point.grade === grade);
  return { subject, grade, points: rows.length, authoredTeaching: rows.filter(row => row.authoredTeaching).length,
    exercises: rows.reduce((sum, row) => sum + row.exercises, 0), pointsNeedingMoreMeasurementMaterials: rows.filter(row => row.measurementMaterialGaps.length).length };
}));
const evidence = { at: new Date().toISOString(), passed: true,
  familyIdentityVersion: FAMILY_IDENTITY_VERSION,
  materialCoverageVersion: MATERIAL_COVERAGE_VERSION,
  scope: `All ${points.length} currently authored original knowledge definitions. Teaching completeness is structural and point-level; it is not complete textbook alignment, human field validation or standardized calibration.`,
  totals: { points: points.length, teaching: points.length, missingTeaching: 0,
    originalExercises: points.reduce((sum, point) => sum + point.exercises, 0),
    pointsNeedingMoreMeasurementMaterials: points.filter(point => point.measurementMaterialGaps.length).length },
  sourceSha256: Object.fromEntries(['verification-materials.ts', 'verification-blueprint.ts', 'diagnosis.ts', 'family-identity.ts', 'foundation-curriculum.ts', 'original-core-curriculum.ts', 'structured-curriculum.ts', 'authored-relation-release.ts', 'authored-atomic-curriculum.ts', 'authored-probes.ts', 'authored-english-foundation-probes.ts', 'authored-math-probes.ts', 'authored-arithmetic-probes.ts', 'authored-number-probes.ts', 'authored-spatial-probes.ts', 'authored-second-grade-probes.ts', 'authored-data-probes.ts', 'authored-third-grade-probes.ts', 'authored-unit-probes.ts', 'authored-teaching.ts', 'authored-math-teaching.ts',
    'authored-geometry-probes.ts', 'authored-fourth-grade-number-probes.ts', 'authored-remainder-decimal-probes.ts', 'authored-fourth-grade-geometry-statistics-probes.ts', 'authored-average-atomic.ts', 'authored-factor-multiple-probes.ts', 'authored-chinese-teaching.ts', 'authored-english-teaching.ts', 'teaching-author.ts'].map(file => {
    const source = 'apps/api/src/modules/diagnostics/' + file;
    return [source, createHash('sha256').update(fs.readFileSync(path.join(root, source))).digest('hex')];
  }).concat(['scripts/qa/audit-authored-curriculum.cjs', 'resources/curriculum/authored-family-identities-v1.json', 'resources/curriculum/authored-task-baseline-5678-v1.json', 'resources/curriculum/authored-relations-2026-10-20-v1.json', 'resources/curriculum/authored-atomic-relations-2026-10-20-v1.json',
    'resources/curriculum/authored-average-atomic-relations-2026-10-20-v1.json', 'resources/curriculum/authored-task-baseline-6398-v1.json',
    'resources/curriculum/authored-task-baseline-6446-v1.json', 'resources/curriculum/authored-task-baseline-6686-v1.json',
    'apps/api/src/modules/diagnostics/authored-english-lexical-probes.ts', 'resources/curriculum/authored-task-baseline-6830-v1.json',
    'apps/api/src/modules/diagnostics/authored-chinese-grade1-probes.ts', 'resources/curriculum/authored-task-baseline-6974-v1.json',
    'apps/api/src/modules/diagnostics/authored-chinese-oral-grade1-probes.ts', 'resources/curriculum/authored-task-baseline-7550-v1.json',
    'apps/api/src/modules/diagnostics/authored-chinese-grade2-probes.ts', 'resources/curriculum/authored-task-baseline-7598-v1.json',
    'apps/api/src/modules/diagnostics/authored-chinese-grade3-probes.ts', 'resources/curriculum/authored-task-baseline-8222-v1.json',
    'apps/api/src/modules/diagnostics/authored-chinese-grade4-probes.ts', 'resources/curriculum/authored-task-baseline-8846-v1.json',
    'resources/curriculum/geometry-probes-v1.json', 'scripts/content/build-geometry-probes.cjs',
    ...fs.readdirSync(path.join(root, 'apps/web/public/question-assets/geometry-probes-v1')).sort().map(name => 'apps/web/public/question-assets/geometry-probes-v1/' + name),
    'resources/curriculum/fourth-grade-geometry-statistics-v1.json', 'scripts/content/build-fourth-grade-geometry-statistics.cjs',
    ...fs.readdirSync(path.join(root, 'apps/web/public/question-assets/fourth-grade-geometry-statistics-v1')).sort().map(name => 'apps/web/public/question-assets/fourth-grade-geometry-statistics-v1/' + name)]
    .map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]))), authoredProbeFamilies: buildAllAuthoredProbeFamilies().map(({ exercises, ...family }) => ({ ...family,
    canonicalFamily: canonicalFamily(family), questions: exercises.length,
    note: 'Authored task-structure distinction under the recorded identity rules; no field calibration or statistical independence claim.' })), cells, points };
const output = path.resolve(process.argv[2] ?? 'data/qa/authored-curriculum-audit.json');
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence.totals));

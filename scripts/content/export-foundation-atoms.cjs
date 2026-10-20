const fs = require('node:fs');
const path = require('node:path');
const { buildFoundationCurriculum } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/foundation-curriculum.js');

const output = path.resolve(process.argv[2] ?? 'resources/curriculum/atom-catalog-v1.json');
const atoms = buildFoundationCurriculum().map(({ atom }) => ({ id: atom.id, subject: atom.subject, grade: atom.grade, term: atom.term,
  name: atom.name, strand: atom.strand, objective: atom.objective, successCriterion: atom.successCriterion }));
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ format: 'study-agent-atom-catalog-v1', count: atoms.length, atoms }, null, 2) + '\n');
console.log(JSON.stringify({ count: atoms.length, output }));

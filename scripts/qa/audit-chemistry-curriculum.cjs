const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..');
const compiled = name => require(path.join(root, 'apps/api/dist/apps/api/src/modules/diagnostics', name + '.js'));
const { buildChemistryCurriculum, chemistryUnits, CHEMISTRY_VERSION } = compiled('chemistry-curriculum');
const { buildFoundationCurriculum, foundationQuestionId } = compiled('foundation-curriculum');
const { knowledgeMaterialCoverage } = compiled('verification-materials');
const hash = data => createHash('sha256').update(data).digest('hex');
const definitions = buildChemistryCurriculum();
const points = definitions.map(({ atom, exercises }) => {
  const items = exercises.map((exercise, index) => ({ id: 'audit:' + index, questionId: foundationQuestionId(atom.id, exercise),
    questionVersion: 1, atomId: atom.id, dimension: exercise.dimension, family: atom.id + ':' + exercise.family,
    expectedSeconds: exercise.expectedSeconds ?? 60, reviewStatus: 'approved', difficulty: 1, mappingWeight: 1,
    probeRole: exercise.dimension === 'transfer' ? 'transfer' : 'anchor', observationCode: 'mismatch', version: 1 }));
  return { id: atom.id, name: atom.name, unit: atom.strand, tasks: new Set(items.map(item => item.questionId)).size,
    definitionSha256: hash(JSON.stringify(atom)), materialCoverage: knowledgeMaterialCoverage(atom, items) };
});
const catalog = new DatabaseSync(path.join(root, 'data/assets/catalog.sqlite3'), { readOnly: true });
const archive = new DatabaseSync(path.join(root, 'data/assets/shijuanbao/archive.sqlite3'), { readOnly: true });
const manifest = new DatabaseSync(path.join(root, 'data/assets/manifest.sqlite3'), { readOnly: true });
const sourcePapers = catalog.prepare("SELECT id,title,pdf_url FROM papers WHERE grade='初三' AND subject='化学' AND content_state='pdf' AND title LIKE '%广州%' AND title NOT LIKE '%惠州%' AND (title LIKE '%上学期%' OR title LIKE '%九年级上%') ORDER BY title").all();
const papers = sourcePapers.map(paper => {
  const media = archive.prepare("SELECT path,sha256 FROM media_jobs WHERE url=? AND state='done'").get(paper.pdf_url);
  const relative = media ? 'shijuanbao/' + media.path.replaceAll('\\', '/') : null;
  const copy = relative ? manifest.prepare("SELECT sha256 FROM files WHERE path=? AND state='verified'").get(relative) : null;
  const file = relative && path.join(root, 'data/assets', relative);
  const sha256 = file && fs.existsSync(file) ? hash(fs.readFileSync(file)) : null;
  return { id: paper.id, title: paper.title, localAsset: relative, sha256,
    verified: Boolean(sha256 && sha256 === media.sha256 && sha256 === copy?.sha256),
    publication: 'preserve existing library qualification; not auto-published or auto-scored' };
});
catalog.close(); archive.close(); manifest.close();
const primary = buildFoundationCurriculum();
const receipt = { at: new Date().toISOString(), version: CHEMISTRY_VERSION,
  units: chemistryUnits, points, uniqueQuestions: points.reduce((sum, point) => sum + point.tasks, 0),
  materialReady: points.filter(point => point.materialCoverage.ready).length,
  primaryBaseline: { atoms: primary.length, uniqueQuestions: new Set(primary.flatMap(def => def.exercises.map(item => foundationQuestionId(def.atom.id, item)))).size },
  sourceReferences: { publisherCatalog: 'https://jc.pep.com.cn/?filed=%E5%88%9D%E4%B8%AD&subject=%E5%8C%96%E5%AD%A6',
    textbookFullTextVerified: false, chapterMapping: 'original course organization; current edition lesson mapping pending review', papers },
  boundaries: ['Original authored teaching and rule-scored tasks; not publisher course reproduction.',
    'Material coverage and automated checks do not prove teacher approval, norms, physical experiment skill or real student retention.'] };
if (receipt.uniqueQuestions !== 2016 || receipt.materialReady !== 28 || papers.length !== 9 || papers.some(paper => !paper.verified) || receipt.primaryBaseline.uniqueQuestions !== 15758) throw Error('Chemistry or primary baseline audit failed');
const destination = path.resolve(root, process.argv[2] || 'data/qa/chemistry-curriculum-audit.json');
if (!destination.startsWith(root + path.sep)) throw Error('Audit output must stay in the workspace');
fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, JSON.stringify(receipt, null, 2) + '\n');
process.stdout.write(JSON.stringify({ output: path.relative(root, destination), points: points.length, questions: receipt.uniqueQuestions,
  materialReady: receipt.materialReady, verifiedReferencePapers: papers.length, primaryBaseline: receipt.primaryBaseline }) + '\n');

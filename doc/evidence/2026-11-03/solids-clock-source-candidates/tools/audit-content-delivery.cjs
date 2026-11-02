// Read-only, exact-edition worklist. Catalog presence, content writing and teaching acceptance stay separate.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..'), args = process.argv.slice(2), options = {};
const help = 'node scripts/operations/audit-content-delivery.cjs --output <new data/qa/*.json> [--database <existing SQLite>] [--source-root <originals root>]';
if (args.length === 1 && args[0] === '--help') { console.log(help); process.exit(0); }
for (let i = 0; i < args.length; i += 2) {
  if (!['--output', '--database', '--source-root'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw Error(help);
  options[args[i]] = args[i + 1];
}
if (!options['--output']) throw Error(help);
const output = path.resolve(root, options['--output']);
if (!output.startsWith(path.join(root, 'data/qa') + path.sep) || !output.endsWith('.json') || fs.existsSync(output)) throw Error('New QA output required');
for (let folder = path.dirname(output); folder !== root; folder = path.dirname(folder)) {
  if (folder === path.dirname(folder) || fs.existsSync(folder) && fs.lstatSync(folder).isSymbolicLink()) throw Error('Output directory links refused');
}
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex'), inputs = [];
function load(file) { const bytes = fs.readFileSync(path.join(root, file)); inputs.push({ path: file, sha256: sha(bytes) }); return JSON.parse(bytes); }
const books = load('resources/curriculum/textbooks-v1.json').books.filter(book => ['chinese', 'math', 'english'].includes(book.subject) && book.grade <= 6);
const conformities = load('resources/curriculum/textbook-edition-conformities-v1.json').rows;
const candidates = load('resources/curriculum/textbook-mapping-candidates-v1.json').rows;
const originals = [...load('resources/curriculum/chinatextbook-chinese-v1.json').books, ...load('resources/curriculum/chinatextbook-primary-v1.json').books];
const sourceLessons = fs.readdirSync(path.join(root, 'resources/curriculum/source-lessons')).filter(name => name.endsWith('.json'))
  .map(name => ({ file: 'resources/curriculum/source-lessons/' + name, value: load('resources/curriculum/source-lessons/' + name) }));
const materialDirectory='resources/curriculum/source-lesson-materials';
const materialBundles=fs.existsSync(path.join(root,materialDirectory))?fs.readdirSync(path.join(root,materialDirectory)).filter(name=>name.endsWith('.json'))
  .map(name=>({file:materialDirectory+'/'+name,value:load(materialDirectory+'/'+name)})):[];
const gesp = load('resources/gesp/teaching-candidates-v1.json');
let database = null, packages = [];
if (options['--database']) {
  const filename = path.resolve(root, options['--database']); if (!fs.statSync(filename).isFile()) throw Error('Existing SQLite file required');
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    db.exec('BEGIN');
    database = { schema: db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version,
      revision: db.prepare('SELECT revision FROM store_meta WHERE id=1').get().revision, readOnly: true };
    packages = db.prepare("SELECT body FROM domain_records WHERE collection='textbookTeachingPackages'").all().map(row => JSON.parse(row.body));
    db.exec('COMMIT');
  } finally { db.close(); }
}
const inventory = books.map(book => {
  const proof = conformities.find(row => row.bookId === book.id && row.bookVersion === book.version);
  const source = originals.find(row => proof ? row.id === proof.sourceBookId && row.sha256 === proof.sourceSha256 : row.sha256 === book.sourceSha256);
  let originalPresent = null;
  if (options['--source-root'] && source?.repositoryPath) {
    const base = path.resolve(options['--source-root']), file = path.resolve(base, source.repositoryPath);
    if (!file.startsWith(base + path.sep)) throw Error('Invalid source-relative path');
    originalPresent = fs.existsSync(file) && fs.statSync(file).isFile() && fs.statSync(file).size === source.bytes;
  }
  const lessons = (book.chapters ?? []).flatMap(chapter => chapter.lessons.filter(lesson => lesson.kind !== 'reference').map(lesson => {
    const row = candidates.find(row => row.bookId === book.id && row.bookVersion === book.version && row.lessonId === lesson.id);
    const files = sourceLessons.filter(entry => entry.value.source?.bookId === book.id && entry.value.source?.lessonId === lesson.id).map(entry => entry.file);
    const materialCandidates=materialBundles.flatMap(bundle=>(bundle.value.sourceLessons??[]).filter(entry=>entry.source.bookId===book.id&&entry.source.lessonId===lesson.id).map(entry=>{
      const groups=bundle.value.groups.filter(group=>group.lesson===entry.lesson),current=inputs.find(input=>input.path===entry.path);
      return{file:bundle.file,targetGroups:groups.length,questions:groups.reduce((n,group)=>n+group.exercises.length,0),sourceDraftHashMatches:current?.sha256===entry.sha256,
        teacherReviewed:bundle.value.teacherReviewed===true,independenceReviewStatus:bundle.value.familyIndependenceReviewed===true?'record_requires_verification':'not_reviewed'};
    }));
    const saved = packages.filter(row => row.bookId === book.id && row.bookVersion === book.version && row.lessonId === lesson.id);
    const hasPublishedRecord = saved.some(row => row.status === 'published' && row.published);
    return { lessonId: lesson.id, title: lesson.name, chapterId: chapter.id, kind: lesson.kind ?? 'lesson',
      printedPage: lesson.printedPage ?? null, sourceLocatorCandidate: row ? { start: row.pdfStartPage, end: row.pdfEndPage, sourceSha256: row.sourceSha256, reviewStatus: row.reviewStatus } : null,
      authoredCandidateFiles: files, authoredMaterialCandidates:materialCandidates,persistedPackageCount: saved.length, publishedRecordExists: hasPublishedRecord,
      contentStatus: hasPublishedRecord ? 'published_record_requires_current_content_and_teacher_validation' : saved.length ? 'persisted_draft_requires_review'
        : files.length ? 'authored_candidate_requires_review' : 'lesson_content_not_recorded',
      nextAction: hasPublishedRecord ? '核对准确版本、全部内容、审核与学生采用，不能凭发布记录推断学习效果'
        : files.length || saved.length ? '核对原页、目标、独立题族、评分与保持库存，完成教师审阅后再发布' : '先核对准确原页，再逐课编写讲解、例题、检查、迁移、评分与保持材料' };
  }));
  return { bookId: book.id, bookVersion: book.version, title: book.title, subject: book.subject, grade: book.grade, term: book.term,
    edition: book.edition, sourceSha256: book.sourceSha256 ?? null, directoryStatus: book.chapterState,
    exactEditionProofRecord: Boolean(proof), sourceManifestMatch: Boolean(source), originalPresentWithoutHashVerification: originalPresent,
    publicationYear: book.sourceEdition?.publicationYear ?? null, directoryLessonCount: lessons.length, lessons,
    nextAction: lessons.length ? '按逐课清单编制和复核，目录与定位候选均不能算正文交付' : '补准确版次目录和逐页来源，不编造缺失课名或页段' };
});
const rows = inventory.flatMap(book => book.lessons), report = { format: 'study-content-delivery-worklist-v1', at: new Date().toISOString(),
  scope: '小学语文、数学、英语登记教材，独立原件分别记账；GESP1～4级原创教学候选。只读数据库，不自动审阅或发布。', inputs, database,
  totals: { registeredBooks: books.length, publicCatalogBooks: books.filter(book => book.source === 'public_catalog').length,
    archiveRegisteredBooks: books.filter(book => book.source === 'archive').length, booksWithDirectory: inventory.filter(book => book.directoryLessonCount).length,
    booksWithoutDirectory: inventory.filter(book => !book.directoryLessonCount).length, directoryInstructionalEntries: rows.length,
    lessonsWithCandidateFiles: rows.filter(row => row.authoredCandidateFiles.length).length, lessonsWithPersistedPackages: rows.filter(row => row.persistedPackageCount).length,
    lessonsWithPublicationRecords: rows.filter(row => row.publishedRecordExists).length, lessonsWithoutRecordedContent: rows.filter(row => row.contentStatus === 'lesson_content_not_recorded').length,
    authoredFollowingMaterialCandidates:rows.flatMap(row=>row.authoredMaterialCandidates).reduce((n,row)=>n+row.questions,0),
    materialBundlesWithStaleDraftIdentity:rows.flatMap(row=>row.authoredMaterialCandidates).filter(row=>!row.sourceDraftHashMatches).length },
  completion: { entireTextbookCurriculumCompleted: false, teacherAcceptanceVerified: false, sourceOriginalBytesVerified: false,
    databaseWritten: false, learnerRecordsWritten: false, published: false }, inventory,
  gesp: { targets: gesp.lessons.length, originalActivities: gesp.lessons.length * 5, status: gesp.status,
    teacherReviewed: gesp.teacherReviewed, automaticPublication: gesp.automaticPublication,
    levels: [1, 2, 3, 4].map(level => ({ level, targets: gesp.lessons.filter(row => row.level === level).length })) } };
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
const bytes = fs.readFileSync(output); if (JSON.parse(bytes).inventory.length !== books.length) throw Error('Worklist readback differs');
console.log(JSON.stringify({ output: path.relative(root, output), sha256: sha(bytes), totals: report.totals, database, completion: report.completion }));

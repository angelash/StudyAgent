/* Build a teacher-only candidate file; never import, approve, publish or write learner evidence. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const help = 'node scripts/operations/prepare-first-source-followup.cjs --api-root <built checkout> --source <exact original PDF> --output <new data/qa/*.json>';
const args = process.argv.slice(2), options = {};
if (args.length === 1 && args[0] === '--help') { process.stdout.write(help + '\n'); process.exit(0); }
for (let index = 0; index < args.length; index += 2) {
  const key = args[index];
  if (!['--api-root', '--source', '--output'].includes(key) || !args[index + 1] || options[key]) throw Error(help);
  options[key] = args[index + 1];
}
if (Object.keys(options).length !== 3) throw Error(help);
const apiRoot = path.resolve(root, options['--api-root']), original = path.resolve(options['--source']), output = path.resolve(root, options['--output']);
const qaRoot = path.join(root, 'data/qa') + path.sep;
if (apiRoot !== root && !apiRoot.startsWith(qaRoot)) throw Error('Built checkout must be this project or an isolated checkout inside data/qa');
if (!output.startsWith(qaRoot) || !output.endsWith('.json') || fs.existsSync(output)) throw Error('A new JSON output inside data/qa is required');
for (let folder = path.dirname(output); folder !== root; folder = path.dirname(folder)) {
  if (folder === path.dirname(folder) || fs.existsSync(folder) && fs.lstatSync(folder).isSymbolicLink()) throw Error('Output must not traverse directory links');
}
const load = name => require(path.join(apiRoot, 'apps/api/dist/apps/api/src/modules/diagnostics', name + '.js'));
const { buildFirstSourceCoreFollowupCandidates, firstSourceFollowupReview: review } = load('source-chinese-followup-probes');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const originalInfo = fs.statSync(original);
if (!originalInfo.isFile() || originalInfo.size > 32 * 1024 * 1024 || sha(fs.readFileSync(original)) !== review.sourceSha256) throw Error('Exact source checksum required; no candidate file was created');
const source = JSON.parse(fs.readFileSync(path.join(root, 'resources/curriculum/source-lessons/chinese-g3-daqingshu-v1.json')));
if (source.source.sourceSha256 !== review.sourceSha256) throw Error('Candidate source and lesson provenance differ');
const { foundationQuestionId } = load('foundation-curriculum');
const { buildFirstSourcePracticalFollowupCandidates } = load('source-chinese-practical-followup-probes');
const families = [...buildFirstSourceCoreFollowupCandidates(), ...buildFirstSourcePracticalFollowupCandidates()], ids = new Set(), covered = new Set(families.map(family => family.atomId));
const materials = families.map(family => ({
  atomId: family.atomId, proposedFamily: family.family, dimension: family.dimension,
  behavior: family.behavior, structure: family.structure, distinctionToReview: family.distinction,
  questions: family.exercises.map(task => {
    const questionId = foundationQuestionId(family.atomId, task);
    if (ids.has(questionId)) throw Error('Duplicate candidate identity'); ids.add(questionId);
    return { questionId, ...task, expectedReview: task.rubric ? 'human_rubric_required' : 'closed_gold_checked_separately' };
  }),
}));
const result = {
  format: 'study-first-source-followup-candidate-v1', source: source.source,
  review: { ...review, scope: 'Teacher and content-editor candidate file; contains private reference answers' },
  sourceUse: 'reference_only', sourceOriginalCopied: false, publicationYear: null,
  coverage: { entireLessonCompleted: false, targetCount: source.targetIds.length, candidateTargetCount: covered.size,
    targets: source.targetIds.map(atomId => ({ atomId, state: covered.has(atomId) ? 'candidate_requires_review' : 'still_needs_followup_candidates' })) },
  familyCount: materials.length, questionCount: ids.size, materials,
  sideEffects: { databaseWritten: false, published: false, originalStockChanged: false, retentionReservesConsumed: false },
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
const readback = fs.readFileSync(output), parsed = JSON.parse(readback);
if (parsed.questionCount !== ids.size || parsed.review.teacherReviewed || parsed.coverage.entireLessonCompleted) throw Error('Candidate readback failed');
process.stdout.write(JSON.stringify({ output: path.relative(root, output), sha256: sha(readback), proposedFamilies: materials.length,
  questions: ids.size, candidateTargets: covered.size, totalTargets: source.targetIds.length, approved: false, databaseWritten: false }) + '\n');

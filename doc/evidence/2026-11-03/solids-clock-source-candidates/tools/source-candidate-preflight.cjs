// All selected source packets must pass before an administrator or runtime is created.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function validateSourceCandidates({root,apiRoot,sourceRoot,bookId,materials,lessonNames}){
 const load=rel=>JSON.parse(fs.readFileSync(path.join(root,rel)));
 const contracts=require(path.join(apiRoot,'packages/contracts/dist/index.js'));
 const diagnostics=path.join(apiRoot,'apps/api/dist/apps/api/src/modules/diagnostics');
 const {editionConformity,assertConformityExtraction}=require(path.join(diagnostics,'textbook-edition-conformity.js'));
 const {textbookExtractionIdentityMatches}=require(path.join(diagnostics,'textbook-extraction-identity.js'));
 assert.equal(typeof bookId,'string');assert(Array.isArray(lessonNames)&&lessonNames.length>0&&lessonNames.length<=10);assert.equal(new Set(lessonNames).size,lessonNames.length);
 assert(lessonNames.every(n=>/^[a-z][a-z0-9-]+-v[1-9][0-9]*\.json$/.test(n)),'Safe versioned source filenames required');
 const registry=load('resources/curriculum/textbooks-v1.json'),matches=registry.books.filter(b=>b.id===bookId);assert.equal(matches.length,1,'Unique exact registered book required');const book=matches[0];
 for(const file of ['textbooks-v1.json','textbook-edition-conformities-v1.json','textbook-mapping-candidates-v1.json','chinatextbook-chinese-v1.json','chinatextbook-primary-v1.json'])assert.equal(sha(fs.readFileSync(path.join(root,'resources/curriculum',file))),sha(fs.readFileSync(path.join(apiRoot,'resources/curriculum',file))),'QA source registry must match main: '+file);
 const originals=[...load('resources/curriculum/chinatextbook-chinese-v1.json').books.map(s=>({...s,subject:s.subject??'chinese'})),...load('resources/curriculum/chinatextbook-primary-v1.json').books];
 const conformity=editionConformity(book,originals,load('resources/curriculum/textbook-edition-conformities-v1.json').rows);assert(conformity.proof,conformity.reason);const original=conformity.source;
 const base=fs.realpathSync(sourceRoot),originalPath=path.resolve(base,original.repositoryPath);assert(originalPath.startsWith(base+path.sep));assert(fs.realpathSync(originalPath).startsWith(base+path.sep),'Original must remain inside source root');
 const originalBytes=fs.readFileSync(originalPath);assert.equal(sha(originalBytes),original.sha256,'Exact original PDF bytes required');assert.equal(originalBytes.length,original.bytes);
 const extractedBytes=fs.readFileSync(path.join(root,original.extractedPath));assert.equal(sha(extractedBytes),original.extractedSha256);const extracted=JSON.parse(extractedBytes);assert(textbookExtractionIdentityMatches(extracted,original),'Current importer extraction identity required');assert.equal(extracted.pages.length,original.pages);assertConformityExtraction(conformity.proof,extracted.pages);
 const materialPath=path.resolve(root,materials),directory=path.join(root,'resources/curriculum/source-lesson-materials')+path.sep;assert(materialPath.startsWith(directory)&&fs.realpathSync(materialPath).startsWith(fs.realpathSync(directory)+path.sep),'Versioned source material bundle required');
 const materialBytes=fs.readFileSync(materialPath),bundle=JSON.parse(materialBytes);assert.equal(bundle.format,'source-following-original-materials-v1');
 for(const key of ['teacherReviewed','targetAlignmentReviewed','scoringReviewed','familyIndependenceReviewed','automaticPublication'])assert.equal(bundle[key],false,'Unapproved editorial materials only: '+key);
 assert(Array.isArray(bundle.sourceLessons)&&Array.isArray(bundle.groups));const questionIds=new Set(),definitions=new Map(),drafts=[];
 for(const name of lessonNames){
  const relative='resources/curriculum/source-lessons/'+name,bytes=fs.readFileSync(path.join(root,relative)),draft=JSON.parse(bytes);assert.equal(draft.format,'source-original-lesson-draft-v1');assert.equal(draft.source.bookId,book.id,'Selected packets cannot mix books');assert.equal(draft.source.sourceSha256,original.sha256);
  assert.equal(draft.source.publicationYear,conformity.proof.edition.publicationYear);assert.equal(draft.source.curriculumStandardYear,conformity.proof.edition.curriculumStandardYear);
  const ranges=conformity.proof.directory.entries.filter(e=>e.lessonId===draft.source.lessonId);assert.equal(ranges.length,1);const {pageStart:start,pageEnd:end}=draft.source;assert(Number.isInteger(start)&&Number.isInteger(end)&&start>=ranges[0].physicalStartPage&&end<=ranges[0].physicalEndPage&&end>=start,'Exact source range required');
  contracts.textbookTeachingDraftContentSchema.parse({...draft.content,checks:[]});contracts.textbookTeachingSourceReviewSchema.parse(draft.sourceReview);assert.equal(draft.sourceReview.confirmedRange,true);assert.deepEqual(draft.sourceReview.pages.map(p=>p.page),Array.from({length:end-start+1},(_,i)=>start+i));assert(draft.sourceReview.pages.every(p=>p.visualChecked));
  assert.deepEqual(draft.content.goals.map(g=>g.atomId),draft.targetIds);assert.equal(new Set(draft.targetIds).size,draft.targetIds.length);assert.equal(draft.scope.teacherReviewed,false);assert.equal(draft.scope.published,false);
  for(const d of draft.definitionCandidates??[]){contracts.knowledgeAtomSchema.parse(d);assert.equal(d.subject,book.subject);assert.equal(d.grade,book.grade);assert.equal(d.term,book.term);assert(draft.targetIds.includes(d.id));if(definitions.has(d.id))assert.deepEqual(definitions.get(d.id),d,'Conflicting target definition');definitions.set(d.id,d);}
  for(const c of draft.content.citations){assert(c.page>=start&&c.page<=end&&c.quote.trim().length>=8);assert(extracted.pages[c.page-1].text.includes(c.quote),'Exact selected-source citation required');}
  const refs=bundle.sourceLessons.filter(r=>r.path===relative);assert.equal(refs.length,1,'Each selected draft needs a unique binding');const ref=refs[0];assert.equal(ref.sha256,sha(bytes),'Current draft SHA required');assert.deepEqual(ref.source,draft.source);
  const groups=bundle.groups.filter(g=>g.lesson===ref.lesson);assert.deepEqual(groups.map(g=>g.atomId).sort(),[...draft.targetIds].sort());
  for(const g of groups){assert.equal(g.familyIndependenceReviewed,false);assert.equal(g.exercises.length,7);assert(['short_answer','audio_record','image_upload'].includes(g.mode));assert.equal(g.rubric.length,3);assert(Math.abs(g.rubric.reduce((n,r)=>n+r.weight,0)-1)<1e-9);assert(g.rubric.every(r=>typeof r.criterion==='string'&&r.weight>0));
   assert.deepEqual(g.exercises.map(q=>q.purpose),['understanding','procedure','transfer','retention','retention','retention','retention']);assert.deepEqual(g.exercises.map(q=>q.dimension),['understanding','procedure','transfer','understanding','procedure','transfer','understanding']);assert.deepEqual(g.exercises.map(q=>q.proposedIntervalDays),[null,null,null,1,3,7,14]);
   for(const q of g.exercises){assert(typeof q.id==='string'&&q.id.length>0&&!questionIds.has(q.id),'Unique candidate question IDs required');questionIds.add(q.id);assert(q.stem.trim().length>=15&&q.answer.trim().length>=15&&q.analysis.includes(q.answer));assert(Number.isInteger(q.expectedSeconds)&&q.expectedSeconds>0&&q.expectedSeconds<=3600);}
  }
  drafts.push({name,draft,sha256:sha(bytes),groups});
 }
 return{book,original,originalPath,materialPath,materialBytes,bundle,drafts,questionCount:questionIds.size,proofFingerprint:conformity.fingerprint};
}
module.exports={validateSourceCandidates};

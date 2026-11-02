const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),C=require(path.join(root,'data/qa/p187/packages/contracts/dist/index.js')),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const registry=JSON.parse(fs.readFileSync(path.join(root,'resources/curriculum/textbooks-v1.json'))),proofs=JSON.parse(fs.readFileSync(path.join(root,'resources/curriculum/textbook-edition-conformities-v1.json'))).rows;
const results=[];
for(const name of ['chinese-g3-flowers-v1.json','chinese-g3-asking-v1.json','chinese-g3-summer-v1.json','chinese-g3-portrait-v1.json','chinese-g3-garden-v1.json']){
 const file='resources/curriculum/source-lessons/'+name,bytes=fs.readFileSync(path.join(root,file)),draft=JSON.parse(bytes),book=registry.books.find(book=>book.id===draft.source.bookId),proof=proofs.find(proof=>proof.bookId===book?.id&&proof.bookVersion===book?.version),entry=proof?.directory.entries.find(entry=>entry.lessonId===draft.source.lessonId);
 if(!entry||entry.physicalStartPage!==draft.source.pageStart||entry.physicalEndPage!==draft.source.pageEnd)throw Error('Whole-original directory identity/range mismatch');
 C.textbookTeachingSourceReviewSchema.parse(draft.sourceReview);for(const atom of draft.definitionCandidates)C.knowledgeAtomSchema.parse(atom);
 const content={...draft.content,checks:[]};C.textbookTeachingDraftContentSchema.parse(content);const complete=C.textbookTeachingContentSchema.safeParse(content);
 if(complete.success||draft.scope.published||draft.scope.teacherReviewed||draft.editorNotes.automaticPublication)throw Error('An incomplete candidate must not gain publication qualification');
 if(JSON.stringify(draft.targetIds)!==JSON.stringify(content.goals.map(goal=>goal.atomId)))throw Error('Goal identity mismatch');
 for(const citation of content.citations)if(citation.page<draft.source.pageStart||citation.page>draft.source.pageEnd)throw Error('Citation outside exact source');
 results.push({path:file,sha256:sha(bytes),bookVersion:book.version,physicalRange:[entry.physicalStartPage,entry.physicalEndPage],targets:content.goals.length,draftProtocolValid:true,completeProtocolRejected:true,remainingCompleteIssues:complete.error.issues.map(issue=>({path:issue.path,message:issue.message})),teacherReviewed:false,learningEvidenceCreated:false});
}
fs.writeFileSync(path.join(__dirname,'following-five-drafts-validation-first.json'),JSON.stringify({at:new Date().toISOString(),results,scope:'Full original teaching prose and exact-source bounds; material stock, scoring, teacher review and adoption are still incomplete.'},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({drafts:results.length,targets:results.map(r=>r.targets),draftsValid:true,incompletePublicationRejected:true}));

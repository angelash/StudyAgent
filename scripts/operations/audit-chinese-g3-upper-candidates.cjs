// Read-only consistency check. Candidate coverage is not teaching acceptance.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--api-root','--output','--first-followups'].includes(args[i])||!args[i+1]||options[args[i]])throw Error('Use --api-root <isolated compiled checkout> --output <new data/qa/*.json> [--first-followups <generated separate QA packet>]');options[args[i]]=args[i+1];}
if(!options['--api-root']||!options['--output'])throw Error('Both options required');
const qa=path.join(root,'data/qa')+path.sep,apiRoot=path.resolve(root,options['--api-root']),output=path.resolve(root,options['--output']);
if(!apiRoot.startsWith(qa)||!output.startsWith(qa)||!output.endsWith('.json')||fs.existsSync(output))throw Error('Isolated compiled checkout and fresh QA output required');
for(let folder=path.dirname(output);folder!==root;folder=path.dirname(folder)){if(folder===path.dirname(folder)||fs.existsSync(folder)&&fs.lstatSync(folder).isSymbolicLink())throw Error('Output directory links refused');}
const bookId='archive-book:chinese-g3-upper-02915a7db6517258',expectedSha='02915a7db6517258434d370430bbf464a1dac6e17df97b90d707dc4ecf5cfedf',sha=b=>crypto.createHash('sha256').update(b).digest('hex'),inputs=[],issues=[];
function load(rel){const b=fs.readFileSync(path.join(root,rel));inputs.push({path:rel,sha256:sha(b)});return JSON.parse(b);}
function issue(code,subject,detail){issues.push({code,subject,detail});}
const contracts=require(path.join(apiRoot,'packages/contracts/dist/index.js'));
const registry=load('resources/curriculum/textbooks-v1.json'),book=registry.books.find(b=>b.id===bookId);if(!book)throw Error('Exact book missing');
const extracted=load('data/assets/textbook-sources/chinatextbook-chinese-v1/extracted/chinatextbook-chinese-g3-upper.json');if(extracted.sourceSha256!==expectedSha)throw Error('Exact extraction identity required');
const entries=book.chapters.flatMap(chapter=>chapter.lessons.filter(l=>l.kind!=='reference').map(lesson=>({chapterId:chapter.id,...lesson})));
const allDrafts=fs.readdirSync(path.join(root,'resources/curriculum/source-lessons')).filter(n=>n.endsWith('.json')).map(file=>({file:'resources/curriculum/source-lessons/'+file,value:load('resources/curriculum/source-lessons/'+file)}));
const drafts=allDrafts.filter(row=>row.value.format==='source-original-lesson-draft-v1'&&row.value.source?.bookId===bookId);
const bundles=fs.readdirSync(path.join(root,'resources/curriculum/source-lesson-materials')).filter(n=>n.endsWith('.json')).map(file=>({file:'resources/curriculum/source-lesson-materials/'+file,value:load('resources/curriculum/source-lesson-materials/'+file)}));
let checkedCitations=0,linkedQuestions=0;const seenQuestions=new Map(),definitions=new Map(),lessons=[];
for(const entry of entries){
 const matches=drafts.filter(row=>row.value.source.lessonId===entry.id);if(matches.length!==1){issue('candidate_cardinality',entry.id,{count:matches.length});continue;}
 const {file,value:d}=matches[0];
 for(const [name,schema,value]of [['content',contracts.textbookTeachingDraftContentSchema,{...d.content,checks:[]}],['sourceReview',contracts.textbookTeachingSourceReviewSchema,d.sourceReview]]){const result=schema.safeParse(value);if(!result.success)issue('contract',file,{section:name,issues:result.error.issues.map(e=>({path:e.path,code:e.code,message:e.message}))});}
 if(d.source.sourceSha256!==expectedSha)issue('wrong_original',file,d.source.sourceSha256);
 if(JSON.stringify(d.content.goals.map(g=>g.atomId))!==JSON.stringify(d.targetIds))issue('goal_target_mismatch',file,null);
 const expectedPages=Array.from({length:d.source.pageEnd-d.source.pageStart+1},(_,i)=>d.source.pageStart+i);
 if(JSON.stringify(d.sourceReview.pages.map(p=>p.page))!==JSON.stringify(expectedPages))issue('review_page_range',file,null);
 for(const citation of d.content.citations){checkedCitations++;const page=extracted.pages.find(p=>p.page===citation.page);if(citation.quote.trim().length<8||!page?.text.includes(citation.quote)||!expectedPages.includes(citation.page))issue('exact_citation',file,{page:citation.page,quote:citation.quote});}
 for(const def of d.definitionCandidates??[]){const parsed=contracts.knowledgeAtomSchema.safeParse(def);if(!parsed.success)issue('definition_contract',file,{id:def.id});const fingerprint=sha(JSON.stringify(def));if(definitions.has(def.id)&&definitions.get(def.id)!==fingerprint)issue('conflicting_definition',file,{id:def.id});definitions.set(def.id,fingerprint);}
 if(d.scope.teacherReviewed!==false||d.scope.published!==false)issue('candidate_status',file,null);
 const references=bundles.flatMap(bundle=>(bundle.value.sourceLessons??[]).filter(ref=>ref.path===file).map(ref=>({bundle,ref})));
 const firstLesson=entry.id===bookId+':unit1:entry1';
 if(references.length!==1&&!firstLesson)issue('material_cardinality',file,{count:references.length});
 if(firstLesson&&references.length!==0)issue('first_lesson_separate_protocol_changed',file,{count:references.length});
 let questions=0;
 for(const {bundle,ref}of references){if(ref.sha256!==inputs.find(r=>r.path===file).sha256||JSON.stringify(ref.source)!==JSON.stringify(d.source))issue('stale_material_binding',file,{bundle:bundle.file});
  const selected=bundle.value.groups.filter(g=>g.lesson===ref.lesson);if(JSON.stringify(selected.map(g=>g.atomId).sort())!==JSON.stringify([...d.targetIds].sort()))issue('material_target_groups',file,null);
  for(const g of selected){if(g.exercises.length!==7||g.familyIndependenceReviewed!==false||Math.abs(g.rubric.reduce((n,r)=>n+r.weight,0)-1)>1e-9)issue('candidate_group',file,{structure:g.structure});
   for(const q of g.exercises){questions++;if(seenQuestions.has(q.id))issue('duplicate_candidate_question_id',file,{id:q.id,other:seenQuestions.get(q.id)});seenQuestions.set(q.id,file);}
  }
 }
 linkedQuestions+=questions;lessons.push({lessonId:entry.id,name:entry.name,file,range:{start:d.source.pageStart,end:d.source.pageEnd},targets:d.targetIds.length,sourceReviewMetadataValid:true,followingBundleReferences:references.map(r=>r.bundle.file),followingQuestions:questions,firstLessonFollowupsUseSeparateProtocol:firstLesson,teacherReviewed:false,published:false});
}
for(const row of drafts)if(!entries.some(e=>e.id===row.value.source.lessonId))issue('unregistered_lesson',row.file,row.value.source.lessonId);
let firstFollowups=null;
if(options['--first-followups']){
 const firstPath=path.resolve(root,options['--first-followups']);if(!firstPath.startsWith(qa)||!firstPath.endsWith('.json'))throw Error('Separate first followups must be an existing local QA JSON packet');
 const relative=path.relative(root,firstPath).replaceAll('\\','/'),packet=load(relative),first=drafts.find(row=>row.value.source.lessonId===bookId+':unit1:entry1');
 if(packet.format!=='study-first-source-followup-candidate-v1'||JSON.stringify(packet.source)!==JSON.stringify(first.value.source))issue('first_followup_identity',relative,null);
 const targetIds=[...new Set((packet.materials??[]).map(g=>g.atomId))].sort(),questionIds=(packet.materials??[]).flatMap(g=>g.questions.map(q=>q.questionId));
 if(JSON.stringify(targetIds)!==JSON.stringify([...first.value.targetIds].sort()))issue('first_followup_targets',relative,null);
 if(new Set(questionIds).size!==questionIds.length||packet.questionCount!==questionIds.length||packet.familyCount!==packet.materials.length)issue('first_followup_counts',relative,null);
 if(questionIds.some(id=>seenQuestions.has(id)))issue('first_followup_id_overlap',relative,null);
 if(packet.review.teacherReviewed||packet.coverage.entireLessonCompleted||packet.sourceOriginalCopied||packet.sourceUse!=='reference_only'||Object.values(packet.sideEffects).some(v=>v!==false))issue('first_followup_boundaries',relative,null);
 firstFollowups={format:packet.format,input:relative,inputSha256:inputs.find(row=>row.path===relative).sha256,questions:questionIds.length,proposedStructures:packet.materials.length,targetCount:targetIds.length,rawPacketLocalOnly:true,countAndTargetIdentityChecked:true,notARepeatOfEarlierHttpTest:true};
}
const report={format:'study-chinese-g3-upper-candidate-consistency-v1',at:new Date().toISOString(),passed:issues.length===0,scope:'Read-only registered-candidate consistency: contracts, exact extraction quotes, target identities, current material bindings and question IDs. Not semantic teacher review, family independence, scoring approval, sufficient stock, publication, real classroom or learner outcomes.',bookId,sourceSha256:expectedSha,inputs,totals:{registeredInstructionalEntries:entries.length,candidateFiles:drafts.length,uniquelyMatchedEntries:lessons.length,checkedCitations,definitionCandidates:definitions.size,followingBoundEntries:lessons.filter(r=>r.followingQuestions>0).length,followingCandidateQuestions:linkedQuestions,firstLessonFollowupCandidatesSeparatelyAccounted:firstFollowups?.questions??null,firstLessonFollowupCountNotRevalidatedHere:firstFollowups===null},firstFollowups,lessons,issues,boundaries:{sourceReviewMetadataIsNotHumanReadingProof:true,teacherAcceptanceVerified:false,scoringApproved:false,familyIndependenceApproved:false,fullyStockedRetentionApproved:false,databaseWritten:false,learnerRecordsWritten:false,publicationPerformed:false}};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output:path.relative(root,output),passed:report.passed,totals:report.totals,issues}));if(issues.length)process.exitCode=1;

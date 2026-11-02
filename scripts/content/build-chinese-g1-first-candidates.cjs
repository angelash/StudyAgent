// Explicit authored first-literacy lessons for the independently registered original.
const assert=require('node:assert/strict');
const {createKit}=require('./exact-source-candidate-kit.cjs');
const bookId='archive-book:chinese-g1-upper-a692a990d41b6291',filePrefix='chinese-g1-a692a990';
const kit=createKit({bookId,prefix:'source:chinese:g1:a692a990:',filePrefix}),drafts=[],groups=[];
function make(c){
 assert.equal(c.pageNotes.length,c.end-c.start+1);
 const content={title:c.title??c.scopeTitle,activation:c.activation,concept:{explanation:c.explanation,points:c.points},
  example:{situation:c.example.situation,steps:c.example.steps.map(([explanation,board])=>({explanation,board})),conclusion:c.example.conclusion},
  visuals:[{kind:'table',title:c.table.title,headers:c.table.headers,rows:c.table.rows,explanation:c.table.explanation}],
  misconceptions:c.errors.map(([observation,alternative,verification,correctiveFeedback])=>({observation,alternatives:[alternative],verification,correctiveFeedback})),
  transfer:c.transfer,summary:c.summary,citations:c.citations};
 const result=kit.draft({slug:c.slug,lessonId:bookId+':chapter'+c.chapter+':entry'+c.entry,start:c.start,end:c.end,
  scope:{title:c.scopeTitle,...c.scope,directoryGranularity:'lesson_or_activity',allPageActivitiesDelivered:false,authenticListeningStimuliIncluded:false},
  definitions:c.definitions,content,sourceReview:{confirmedRange:true,statement:'准确原件本页段已逐张看图并核正文、识写表和活动范围；出版与课标年份未知，未据审定年推版次。来源核对不等教师、评分或独立题族审查。',pages:c.pageNotes.map((statement,i)=>({page:c.start+i,visualChecked:true,statement}))}});
 drafts.push(result);return c.slug;
}
function add(lesson,suffix,structure,mode,criteria,rows){groups.push(kit.group(lesson,suffix,structure,mode,criteria,rows));}
for(const name of ['chinese-g1-initial-reading','chinese-g1-initial-body-nature','chinese-g1-initial-activities'])require('./'+name+'.cjs')({make,add});
assert.equal(drafts.length,9);assert.equal(new Set(drafts.map(d=>d.source.lessonId)).size,9);
for(const draft of drafts){const selected=groups.filter(group=>group.lesson===draft.editorNotes.slug);kit.write(filePrefix+'-'+draft.editorNotes.slug+'-v1',[draft],selected,'每目标三项即时和四项拟议间隔原创候选。识字、本人书写、朗读背诵和实际交流各自核查，帮助和原答另留；目标、量规、独立题族与充分未见保持库存均未审，不自动发布或写学习事实。');}

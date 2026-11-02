// Original editorial drafts from the independently registered, visually inspected original.
// No registration, teaching approval, publication, task seeding or learner writes.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),bookId='archive-book:chinese-g3-upper-02915a7db6517258',sourceSha256='02915a7db6517258434d370430bbf464a1dac6e17df97b90d707dc4ecf5cfedf';
const prefix='source:chinese:g3:02915a7d:',core=['core:chinese:contextmeaning','core:chinese:detail-evidence','core:chinese:personification'];
const definition=(suffix,name,objective,successCriterion,strand)=>({id:prefix+suffix,version:1,name,subject:'chinese',grade:3,term:'upper',strand,
  objective,successCriterion,prerequisiteIds:[],curriculumVersion:'source-original-02915a7d-v1',status:'draft'});
const goal=(atomId,objective,successCriterion,index)=>({id:'goal-'+(index+1),atomId,objective,successCriterion});
function assemble(slug,entry,start,end,definitions,reused,scope,content,sourceStatements){
  const targetIds=[...definitions.map(row=>row.id),...reused.map(row=>row.atomId)];
  return {format:'source-original-lesson-draft-v1',status:'draft_needs_materials_and_review',source:{bookId,lessonId:bookId+':unit1:entry'+entry,
    sourceSha256,pageStart:start,pageEnd:end,publicationYear:null,curriculumStandardYear:null},definitionCandidates:definitions,targetIds,
    sourceReview:{confirmedRange:true,statement:'已逐张查看本准确原件的完整课文范围及课后要求；仅为AI原页核对，不代表教师审核、材料独立性或学习效果。',
      pages:sourceStatements.map((statement,index)=>({page:start+index,visualChecked:true,statement}))},
    scope:{...scope,teacherReviewed:false,audioPronunciationReviewed:false,handwritingReviewed:false,published:false},
    content:{...content,goals:[...definitions.map(row=>({atomId:row.id,objective:row.objective,successCriterion:row.successCriterion})),...reused].map((row,index)=>goal(row.atomId,row.objective,row.successCriterion,index)),
      retention:{intervalDays:[1,3,7,14],anchor:'last_relevant_teaching_or_help',instructions:'先完成与本课目标适配及独立题族审核，再预留未见新题。到真实间隔后核查；有讲解、提示或重复曝光时保留记录并重核保持锚点，不把重复原句当作独立保持。'}},
    editorNotes:{teacherReviewed:false,realLearnerEvidence:false,automaticPublication:false,
      reuseBoundary:'只引用明确列出的已有通用定义。新目标及其与通用目标的关系仍待审核，不自动增加发布知识图或独立题族。',
      materialStatus:'此文件是有具体教学内容的原创草稿。检查材料、评分金样本、独立结构、媒体及各间隔储备尚未齐备，不可发布或采用。',
      teachingPacing:'按实际时长分次完成，不以一次短学习覆盖全部目标；保留未完成内容及学生自行表达的空间。',slug}};
}
const flowersDefinitions=[
  definition('flowers-word-reading','准确原件第二课字词识读','识读第二课规定的5个目标字，并在词语中核对读音和意义','在改变顺序或词语条件后辨认；真实读音需保留音频，放假与衣裳的实际读法分别核对','识字与阅读'),
  definition('flowers-handwriting','准确原件第二课13字书写','观察并书写准确原页规定的13个字，说明部件位置与整体结构','提供真实手写原件并按字形量规核对，选择字形或键盘输入不替代手写','识字与写字'),
  definition('flowers-imagined-scene','诗句线索支持的画面想象','从动作、声音和环境线索想象诗中画面，说明想象依据','画面保留原文主要条件，能指出至少一处依据；额外联想与文中信息分清','文学阅读'),
  definition('flowers-conditional-expression','条件触发的文学仿写','在给定触发条件后续写有联系的动作和想象','前后条件相联系，表达可以不同；不凭套用句式自动得分','表达与交流'),
  definition('flowers-imagination-boundary','诗中说话者与想象依据','区分诗中说话者的联想、可观察景物与自然科学事实','结合叙述方式解释文学想象，不能用花真的上学作为事实结论，也不因此否定文学表达','文学阅读'),
];
const flowers=assemble('flowers',2,10,11,flowersDefinitions,[
  {atomId:core[0],objective:'结合当前诗句与上下文解释词语所表达的情境',successCriterion:'解释受原语境约束，不机械使用另一个词义'},
  {atomId:core[1],objective:'用动作、环境和叙述线索支持对诗中画面的理解',successCriterion:'指出依据并说明支持关系，不用插图或个人联想代替正文'},
  {atomId:core[2],objective:'辨认赋予自然物的人的活动或情感，并与自然动作、声音描写比较',successCriterion:'既能举出拟人依据，也能指出含动作词但不构成拟人的反例'},
],{recognitionCharacters:['荒','笛','罚','假','裳'],writingCharacters:['落','荒','笛','舞','狂','罚','假','互','所','够','猜','扬','臂'],
  sourceAuthor:'泰戈尔',sourceTranslator:'郑振铎',readingMode:'read_aloud_and_imagine',requiredTaskTypes:['朗读与画面想象','注意词句表达','有关联的仿写']},{
  title:'花的学校：让语言支持画面和想象',prerequisites:[],
  activation:{prompt:'假如你把风想成来做客的朋友，会让它做什么？先把自己的想象与实际看见的风中景物分开。',expectedObservation:'孩子可以分别说出景物的实际变化和自己赋予它的人的活动。',bridge:'读诗时也要发现语言怎样把景物和人的生活联系起来；想象需要有诗句线索。'},
  concept:{explanation:'先读出环境和动作，再在脑中连成画面。诗中说话者把花与孩子的学校、游戏和亲情联系起来，这是一种文学想象。说明画面时，应交代哪些来自诗句，哪些是自己的联想。关注词句的表达作用，不能看到动作词就认定拟人：树枝相碰可以是自然动作，声音词也不自动表示人的行为。朗读可帮助表达感受，但自己的感受不必与参考措辞相同。',
    points:['把环境、声音和动作连成有依据的画面','根据被赋予的活动和情感判断拟人，不以词性替代语义','仿写保留前后条件联系，允许不同合理想象','分别核对识读、真实朗读和13字实际书写']},
  example:{situation:'原创练习：一阵风吹过，纸风车转了起来。小作者又写纸风车正向路过的云打招呼。',steps:[
    {explanation:'先说明可以观察到的变化：风吹过，纸风车转动。',board:['触发条件：一阵风吹过','可以观察的动作：转动']},
    {explanation:'再找作者增加的人的活动：向云打招呼。把这一处与普通转动比较。',board:['联想：向云打招呼','判断依据：把人的交往活动赋给物']},
    {explanation:'换一个条件续写时，先核对条件能否支持后续画面，而不是任意拼接一个热闹动作。',board:['条件与后续有联系','原信息与追加联想分清']},
  ],conclusion:'画面从线索出发，拟人需要人的活动或情感依据；表达有想象，也要保持条件关系。'},
  visuals:[{kind:'table',title:'把景物变化和人的活动分清',headers:['原创表达','怎样理解'],rows:[['树枝在风中相碰','自然动作本身，不能仅因有动词就判拟人'],['小树邀请白云来做客','赋予小树人的交往活动，是拟人表达'],['树叶发出沙沙声','声音描写本身，不自动构成拟人']],explanation:'三种写法形成可比较的依据；不要把表格当成原诗情节或科学实验记录。'}],
  misconceptions:[
    {observation:'把所有加点词都判成拟人。',alternatives:['可能只按动词猜测，也可能没有区分自然动作与人的活动。'],verification:'换用自然动作、声音词和人的交往活动三个原创例子，请分别说依据。',correctiveFeedback:'先问对象被赋予了什么行为；自然物本来会发生的动作，不因有动词就变成拟人。'},
    {observation:'仿写有前后两部分，但后面的活动与触发条件没有联系。',alternatives:['可能只注意句式外形，也可能还没把前后画面连起来。'],verification:'请解释前一个条件怎样引出后面的变化，再给一个不同条件。',correctiveFeedback:'先把条件说具体，再选择与它有关联的后续画面，允许多种合理写法。'},
  ],
  transfer:{scenario:'换成晴天的操场、窗边的纸风车或一场小雪，所写对象与原诗不同。',prompt:'选一个触发条件，写后续画面，并说明其中哪一处是自己的想象；如果使用拟人，指出人的活动依据。',expectedStrategy:'先核对条件关系，再选择具体动作；把原信息、自然现象和追加联想分别说明。'},
  summary:{synthesis:'有依据的画面想象既关注诗句，也允许个人表达。识读、朗读、书写和仿写分别留证，不能互相顶替。',takeaways:['画面与线索相联系','判断表达看语义，不机械看动词','仿写要有条件联系','文学想象不等于生物学事实']},
  citations:[{page:10,quote:'我真的觉得那些花朵',usedFor:'concept'},{page:11,quote:'请你照样子写\n一写',usedFor:'transfer'}],
},['已查看完整诗文、景物图示、叙述视角和作者/译者脚注；文学联想与事实边界分别保留。','已查看5字识读行、13字写字格、三项课后要求和资料袋；未把字音选择当朗读或书写。']);

const skimDefinitions=[
  definition('asking-word-reading','准确原件第三课字词识读','识读第三课字表的12个字，结合实际词语核对多音与词义','改变顺序后辨认；朗读表现另需真实音频，不增加原页未要求的写字清单','识字与阅读'),
  definition('asking-event-summary','略读事件大意','默读后概括课文中的主要事件和先后关系','能说明遇到什么不懂、怎样提出问题和后来怎样；不强求复述每句话或全文背诵','略读与理解'),
  definition('asking-supported-viewpoint','依据事件交流阅读看法','表达自己对文中事件的看法，并用文中信息说明理由','允许不同有依据的看法，不能只凭一个评价词或把历史惩戒当成今天必须接受的行为','表达与交流'),
  definition('asking-fresh-language','新鲜词句的阅读交流','选出自己感到新鲜的词句，说明关注之处并与同伴交流','所选内容确在文中，能说明新鲜感来自哪里；不强求唯一词句或唯一感受','阅读欣赏'),
  definition('asking-skim-strategy','以大意为目标的略读策略','按略读要求先建立事件大意，遇少数陌生字词时保持阅读连贯','能够说明哪些信息支持大意、哪些词语仍待核对；不把忽略一切条件或只看标题当略读','阅读策略'),
];
const asking=assemble('asking',3,12,13,skimDefinitions,[
  {atomId:core[0],objective:'结合人物行为和前后语境理解选定的新鲜词句',successCriterion:'解释与当前事件相容，允许在理解大意后继续核对个别词语'},
  {atomId:core[1],objective:'用课文信息支持事件概括和看法',successCriterion:'观点与文中依据有联系，不能把插图推测或现实经历冒充原文信息'},
],{recognitionCharacters:['背','诵','例','圈','段','糊','涂','呆','戒','厉','挨','楚'],writingCharacters:[],writingListPresent:false,
  readingMode:'skim_silent_reading',requiredTaskTypes:['了解事件大意','交流对事件的看法','选新鲜词句交流'],fullTextRecitationRequired:false},{
  title:'不懂就要问：略读大意并有依据地交流',prerequisites:[],
  activation:{prompt:'想一想：能流利读出一段话，与明白它说了什么，是同一件事吗？先讲一个你设计的小例子。',expectedObservation:'孩子能区分读音、背诵与理解，也可以指出自己仍不知道的地方。',bridge:'接下来先默读了解事件，再交流文中人物怎样面对不明白的内容。'},
  concept:{explanation:'这是一篇略读课文。先从完整阅读建立事件大意，抓住人物遇到的问题、采取的行动和后来的结果，再选词句交流。原页明确允许个别字词暂不理解，不需要把每个词都讲透才继续。交流看法时可以不同，但要回到文中信息说明理由。文中的历史课堂环境属于故事背景，不能转换成今天儿童必须忍受伤害的要求；现实遇到威胁时应向可信成人求助，这与理解故事分别处理。',
    points:['先了解主要事件，不追加全文背诵或逐字精读要求','区分会读会背与理解意思','看法有依据，允许不同合理表达','新鲜词句由读者选择，不规定唯一感受','个别生词待核对不等于略读失败']},
  example:{situation:'原创故事梗概：小宁能把操作步骤读得很熟，却不明白为什么先断开电源。他把不清楚的地方说出来，老师解释安全理由后，他重新说明了步骤。',steps:[
    {explanation:'找出主要问题：会读步骤，却不理解其中一个原因。此处只作虚构阅读材料，不安排学生操作电器。',board:['会读：步骤文字','不懂：为什么这样安排']},
    {explanation:'把行动和结果连起来：明确提问，听到解释，再用自己的话说明。',board:['行动：指出具体不明白之处','结果：能解释理由']},
    {explanation:'交流看法时说出故事依据，而不是只给人物贴标签；也可以继续提出未解决的问题。',board:['我的看法','支持看法的信息','仍待核对的问题']},
  ],conclusion:'概括事件抓住问题、行动和结果；理解不靠背熟程度替代，交流不要求唯一评价词。'},
  visuals:[{kind:'table',title:'把问题、行动与结果连起来',headers:['略读线索','可以记录什么'],rows:[['遇到的问题','人物具体不明白什么'],['采取的行动','人物怎样提出问题或获取解释'],['后来的结果','课文实际写到的变化'],['我的看法','观点和支持它的文中信息']],explanation:'这是一张阅读组织表，空白处由实际阅读补充，不自动替学生给出原文答案。'}],
  misconceptions:[
    {observation:'把“能背出”直接当作“已经明白意思”。',alternatives:['可能尚未区分语言形式与意义，也可能没有注意人物提问的原因。'],verification:'给一个新的短段落，分别请孩子读出和用自己的话说明意义。',correctiveFeedback:'两个任务分别核对；读得熟可以是基础，但不能直接充当理解证据。'},
    {observation:'为了略读要求，把所有不懂之处都跳过，只按标题猜故事。',alternatives:['可能把允许个别生词暂不懂扩大成不看正文，也可能还未找到主要事件。'],verification:'请用正文中的问题、行动和结果三处信息支持概括。',correctiveFeedback:'略读仍要完整了解主要事件；允许少数词语待核对，不等于放弃正文依据。'},
    {observation:'认为只有同意某一个评价词才算正确看法。',alternatives:['可能将参考回答当成唯一标准，也可能还不会用依据说明不同观点。'],verification:'比较两种都援引文中信息的不同看法，说明各自支持关系。',correctiveFeedback:'核对依据和推理，不按是否使用同一评价词自动判对错。'},
  ],
  transfer:{scenario:'换用一段陌生的、适合年龄的原创阅读材料，人物遇到不同的不明白之处。',prompt:'先概括事件，再选择一个你想讨论的地方，说出看法与材料依据；说明还有哪些字词待核对。',expectedStrategy:'保留略读的大意目标，抓问题、行动和结果，用材料支持交流；不要求照抄本课人物评价。'},
  summary:{synthesis:'默读了解大意，选词句交流，看法回到依据。能背、能读与能理解分别看，个别生词暂不明白不必阻断主要事件的理解。',takeaways:['主要事件先于逐字讲解','观点与依据相联系','新鲜感可以不同','提问说明具体不明白之处']},
  citations:[{page:12,quote:'把有新鲜感的词句画下来和同学交流',usedFor:'concept'},{page:13,quote:'略读课文可以\n读得粗略一些',usedFor:'summary'}],
},['已查看略读标记、导语、课文前半与插图，任务要求为默读、事件看法及新鲜词句交流。','已查看结尾、12字识读表和两条略读提示；没有另设写字表或全文背诵要求。']);

for(const [name,value] of [['chinese-g3-flowers-v1.json',flowers],['chinese-g3-asking-v1.json',asking]]){
  const output=path.join(root,'resources/curriculum/source-lessons',name);fs.writeFileSync(output,JSON.stringify(value,null,2)+'\n');
}
console.log(JSON.stringify({drafts:2,targets:[flowers.targetIds.length,asking.targetIds.length],definitionCandidates:flowersDefinitions.length+skimDefinitions.length,published:false,learnerRecordsWritten:false}));

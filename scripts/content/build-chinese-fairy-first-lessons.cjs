// Original lessons from the exact edition's visually inspected physical pages33 through39.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),bookId='archive-book:chinese-g3-upper-02915a7db6517258',prefix='source:chinese:g3:02915a7d:';
const definition=(suffix,name,objective,successCriterion,strand)=>({id:prefix+suffix,version:1,name,subject:'chinese',grade:3,term:'upper',strand,objective,successCriterion,
 prerequisiteIds:[],curriculumVersion:'source-original-02915a7d-v1',status:'draft'});
const meaning={atomId:'core:chinese:contextmeaning',objective:'结合当前前后文和具体对象解释词句，说明方法','successCriterion':'解释与材料相容，能说明使用的线索，不机械套用同字常见义'};
const evidence={atomId:'core:chinese:detail-evidence',objective:'用具体情节支持判断，分清叙述、角色想象与个人感受',successCriterion:'指出支持关系和信息范围，不补造结果或把一个画面推成全部经历'};
function assemble(slug,entry,start,end,definitions,scope,content,pageNotes){
 const goals=[...definitions.map(row=>({atomId:row.id,objective:row.objective,successCriterion:row.successCriterion})),meaning,evidence].map((row,index)=>({id:'goal-'+(index+1),...row}));
 return{format:'source-original-lesson-draft-v1',status:'draft_needs_materials_and_review',source:{bookId,lessonId:bookId+':unit3:entry'+entry,
  sourceSha256:'02915a7db6517258434d370430bbf464a1dac6e17df97b90d707dc4ecf5cfedf',pageStart:start,pageEnd:end,publicationYear:null,curriculumStandardYear:null},
  definitionCandidates:definitions,targetIds:goals.map(row=>row.atomId),sourceReview:{confirmedRange:true,statement:'准确原件全部选定页已逐张查看，包括正文、作者译者、注音、识写表、课后任务和插图；AI核对不代替教师审核。',
   pages:pageNotes.map((statement,index)=>({page:start+index,visualChecked:true,statement}))},scope:{...scope,teacherReviewed:false,published:false},
  content:{...content,goals,prerequisites:[],retention:{intervalDays:[1,3,7,14],anchor:'last_relevant_teaching_or_help',
   instructions:'先完成目标、评分、结构与充分未见材料审核，再依真实日期安排。原故事重复不当陌生迁移；提示、讲解、看文和实际表现分别保留。'}},
  editorNotes:{slug,teacherReviewed:false,automaticPublication:false,realLearnerEvidence:false,
   materialStatus:'原创讲解、例子、图表与错因已编写，检查材料、独立结构、评分金样本和充分保持库存仍需编齐审核。',
   reuseBoundary:'只复用明确列出的词义与细节依据目标，新增定义与等价先修保持草稿。',
   pacing:'较长故事分段阅读，识读、实际书写、朗读和理解表达分次安排，不以一次局部完成代表整课全部掌握。'}};
}
const matchesDefs=[
 definition('matches-word-reading','卖火柴课15字识读','在具体词语中识读捡旧饿卷挣几燃焰蜡烛富晃划喷强15字','真实声音覆盖目标字，按当前语境核对卷挣几晃划喷等读法，不以文字选择推断发音','识字与阅读'),
 definition('matches-handwriting','卖火柴课13字实际书写','观察并真实书写柴旧裙怜饿蜡烛伸忽板富颗奶13字','逐字核对本人原稿、部件和完整性，识读表与写字表不混算，订正不覆盖原表现','识字与写字'),
 definition('matches-oral-reading','卖火柴课分段实际朗读','分段朗读并联系人物处境选择恰当停顿和语气','保存本次实际声音与所读范围，允许合理不同读法，不增加全文背诵要求','朗读与表达'),
 definition('matches-event-wish','擦燃情节与愿望对应','依叙述顺序说明五次擦燃情节所见和愿望的联系','区分情节次数与火柴根数，最后一大把不编成具体数量；画面须有对应处境支持','童话阅读'),
 definition('matches-feeling-evidence','联系情节交流阅读感受','选印象深刻的一处，用具体叙述说明自己的感受','接受有依据的不同感受，不强迫统一情绪或公开个人丧失经历，理解不由情绪标签替代','文学阅读'),
 definition('matches-fantasy-reality','分清童话幻想与现实结局','联系火光中的画面、火灭后的处境和结尾区分幻想与现实','明确幻想未改变现实饥寒和死亡，不能把死亡当获得幸福的办法，也不把故事变成用火实验','童话阅读'),
];
const matches=assemble('matches',1,33,37,matchesDefs,
 {title:'卖火柴的小女孩',author:'安徒生',authorCountry:'丹麦',translator:'叶君健',recognitionCharacters:['捡','旧','饿','卷','挣','几','燃','焰','蜡','烛','富','晃','划','喷','强'],
  writingCharacters:['柴','旧','裙','怜','饿','蜡','烛','伸','忽','板','富','颗','奶'],fullTextRecitationRequired:false,ignitionEpisodes:5,lastEpisodeMatchCount:null,
  requiredTasks:['朗读课文','梳理擦燃情节画面与愿望','交流印象深刻部分和感受'],realFireExperimentRequired:false},{
 title:'卖火柴的小女孩：把幻想、愿望与现实放在一起读',
 activation:{prompt:'原创虚构片段：寒冷的夜里，一个人物看着温暖的窗子，想象自己坐进有热汤的屋子。哪一项是处境，哪一项是想象？先不替人物补写结局。',expectedObservation:'孩子能分开材料中的现实与人物想象，愿望可以联系处境推知，不把想象直接记成已经得到。',bridge:'读小女孩每次火光里的画面，也看火灭之后还有什么没有改变。'},
 concept:{explanation:'先读清小女孩现实中的冷、饿、孤独与缺少照料，再按擦燃情节记录画面和愿望。叙述可分五次：火炉、烤鹅、圣诞树、奶奶，以及最后擦着一大把想留住奶奶；最后一大把不是一根，也没有足够信息计算总根数。温暖、食物、节日的欢乐和亲人的关爱与她的缺乏相联系，愿望解释可有合理不同措辞，需有具体依据。火灭后仍有冷墙、火柴梗等现实线索，结尾明写冻死；幻想中的幸福没有改变现实悲剧，更不能读成死亡是得到幸福的办法。朗读可以表现不同段落的处境与变化，不强迫所有人同一种语气。阅读和交流不安排点火操作，也不要求分享个人丧失经历。',points:['现实处境帮助理解愿望','五次情节不等于五根火柴','火光画面与火灭现实对照','阅读感受有具体情节支持','保留现实结局，不把悲剧写成获幸福办法']},
 example:{situation:'原创虚构对照卡：甲在雨中等车，想象自己坐在温暖车厢喝热水；抬头时仍站在车站，车还没有到。用此卡练习分层，再回原文核对。',steps:[
  {explanation:'先列明确现实：雨中等车、还未上车，不能因为后面出现车厢就删掉处境。',board:['现实：雨中站台','未发生：车到并上车']},
  {explanation:'车厢与热水是人物想象，可联系温暖和休息愿望，但未证明真正得到。',board:['想象：温暖车厢、热水','联系：当前处境的缺乏']},
  {explanation:'回到材料末句检查现实是否变化；回原课同样看火灭后的线索，不直接套用类比结局。',board:['读回现实线索','区分希望与结果','原课结局依原文']},
 ],conclusion:'对照可以帮助理解愿望，不能将想象或参考类比写成原故事事实。'},
 visuals:[{kind:'table',title:'五次擦燃情节怎样对应',headers:['情节','火光中的画面','联系处境理解愿望'],rows:[['第一次','温暖火炉','现实寒冷，渴望温暖'],['第二次','烤鹅','现实饥饿，渴望食物'],['第三次','美丽圣诞树','联系节日欢乐与美好生活'],['第四次','慈爱的奶奶','联系亲人关爱与不愿失去'],['第五次：一大把','想把奶奶留住并与她在一起','愿望更强烈，现实结尾仍须另看']],explanation:'按叙述情节梳理，不是火柴根数计算表；想象中的画面不替代现实处境。'}],
 misconceptions:[{observation:'把五次情节写成五根火柴，或给最后一大把编一个总数。',alternatives:['可能混淆次数与数量，也可能漏看最后一次的量词。'],verification:'逐次指出动词和数量表达，解释末次为什么无法确定根数。',correctiveFeedback:'可说五次擦燃情节，最后一大把；无法知道的总数保持未知。'},
  {observation:'只读到微笑和幸福，认为现实已变好或死亡带来应追求的幸福。',alternatives:['可能只看幻想语句，也可能漏读冻死与现实处境的对照。'],verification:'同时指出现实结尾和幻想画面，说明哪类问题实际没有解决。',correctiveFeedback:'文学对照表现愿望与悲剧，现实仍是缺少温暖食物和照料；不能把死亡解释成解决办法。'},
  {observation:'用一个可怜或开心标签替代全部感受说明。',alternatives:['可能尚未选择具体情节，也可能以为情绪只有标准答案。'],verification:'选择一处实际描写，说明它怎样让自己形成这种感受。',correctiveFeedback:'允许有依据的不同反应，不用标签、音量或同情表演代替理解。'}],
 transfer:{scenario:'换一段适龄原创幻想故事，明确给出现实处境、想象与后续现实，不要求个人经历或用火活动。',prompt:'找出各层信息，用具体细节说明愿望，并说想象有没有改变实际结果。',expectedStrategy:'处境、画面、愿望和结局相互核对，保留没有给出的信息；原故事重述不称陌生迁移。'},
 summary:{synthesis:'读懂小女孩想得到什么，也看她实际上缺少什么。幻想与现实的对照支持理解和感受，五次情节与火柴根数分别说清。',takeaways:['愿望联系实际处境','最后一大把不能算具体根数','幻想不抹去现实悲剧','感受由具体叙述支持']},
 citations:[{page:37,quote:'每次擦燃后看到了什么',usedFor:'concept'},{page:37,quote:'和同学交流印象深刻的部分',usedFor:'transfer'}],
 },['已查看现实开端、鞋子丢失、冷饿与无人买火柴，作者丹麦安徒生及译者叶君健。','已查看墙角处境、家中条件与第一次火光，实际点火不作学习操作任务。','已查看火炉消失、烤鹅和圣诞树情节，火灭后的冷墙等线索与幻想分清。','已查看奶奶出现和一大把火柴的末次情节，愿望与数量边界分别保留。','已查看明确冻死结局、15字识读、13字写字与三项课后任务；五次情节不推具体总根数，没有增加全文背诵要求。']);
const treeDefs=[
 definition('tree-journey-word-reading','那一定会很好八字识读','在词语中识读缩努茎锯斧推吱拆八字','实际声音覆盖八字，联系原词和注音；不凭文字选择替代声音，不增加本课写字表','识字与阅读'),
 definition('tree-journey-sequence','种子到木地板变化顺序','按原文梳理种子树手推车椅子木地板的顺序','区分生长与人物加工，各阶段与变化依据对应，不以最后觉得变树改写真实材料变化','童话阅读'),
 definition('tree-journey-wish-link','联系处境理解重复愿望','说明每个阶段的处境怎样引出那一定会很好的愿望','区分角色想法、农夫加工与结果，改变有文中依据，不强加唯一道德结论','文学阅读'),
 definition('tree-journey-own-retelling','用自己的话讲清变化历程','默读后借助阶段线索，用自己的话讲清历程','本次实际讲述完整连贯，保留重要转变和原因，不用背原句或顺序标签替代讲清楚','阅读与表达'),
];
const tree=assemble('tree-journey',2,38,39,treeDefs,
 {title:'那一定会很好',author:'流火',skim:true,recognitionCharacters:['缩','努','茎','锯','斧','推','吱','拆'],writingCharacters:[],fullTextRecitationRequired:false,
  requiredTasks:['默读','梳理种子到木地板历程','用自己的话说一说'],stages:['种子','树','手推车','椅子','木地板'],realSawAxeActivityRequired:false},{
 title:'那一定会很好：按阶段讲清变化和愿望',
 activation:{prompt:'原创虚构卡：纸盒起初装物品，后来改作玩具小屋。若说只因为它想变，小屋就自己出现了，遗漏了什么信息？',expectedObservation:'孩子能指出实际改造动作与角色想象不同，变化顺序需要材料支持。',bridge:'读种子到木地板的故事，分别找每阶段的处境、愿望和实际转变。'},
 concept:{explanation:'默读时先抓五个阶段：种子长成树，树被农夫制成手推车，旧车拆下的木料变成椅子，椅子再拆成木片铺为木地板。第一步是生长，后几步涉及人物加工，不能说愿望本身直接造成材料变化。每个阶段的想法联系当时处境：种子想站起来呼吸，树想能跑，旧车想停下来休息，椅子想躺下，木地板最后感到舒适满足。反复的那一定会很好把变化串起来，但不要求归成唯一励志标签。末尾觉得又变成树是角色感受，不是木地板重新发芽成活。用自己的话说历程时保留阶段、转变与重要原因，可以看自己列的线索，不把看文重述记成独立陌生迁移。本课没有写字表或全文背诵要求，不安排锯斧或拆家具活动。',points:['五个阶段有先后','生长与加工分别说明','愿望与当时处境对应','角色感受不改写实际转变','默读后自己组织讲述，不只背标签']},
 example:{situation:'原创虚构小故事：一个旧纸盒嫌角落太暗，想看见窗边；小禾把它改作窗台收纳盒。后来纸盒边角松了，小禾把还能用的纸板剪成书签。',steps:[
  {explanation:'列阶段：旧纸盒、收纳盒、纸书签，先后不能因为最后喜欢书签而倒置。',board:['旧纸盒→收纳盒→纸书签']},
  {explanation:'把想看窗边与人物改造分两项，愿望没有自己剪裁纸板。',board:['角色愿望：想看窗边','实际动作：小禾改造']},
  {explanation:'用两三句连起来讲，保留边角松动与再次利用的原因，不照抄全部原句。',board:['阶段有序','重要原因保留','自己的话组织']},
 ],conclusion:'线索表帮助讲述，实际声音与是否讲清仍需看本人本次表达。'},
 visuals:[{kind:'table',title:'阶段、处境与转变',headers:['当前阶段','当时的想法','后来怎样变化'],rows:[['种子','想站起来、呼吸空气','生长为树'],['树','想能跑','农夫加工成手推车'],['手推车','多年服务后想休息','旧木料被做成椅子'],['椅子','老了想躺下','拆成木片拼为木地板'],['木地板','舒展、暖和、满足','觉得像回到树的状态，并非实际又长成树']],explanation:'读表后回到原文核查，用自己的话串联；表格本身不是已经发生的本人复述证据。'}],
 misconceptions:[{observation:'阶段都认得，却把椅子放在手推车之前。',alternatives:['可能只记住对象名称，也可能没有使用变化词句。'],verification:'指出哪件东西由哪份旧材料做成，再按依赖关系排列。',correctiveFeedback:'顺序用原文的加工线索支持，不只靠猜哪个更舒服。'},
  {observation:'把木地板觉得又成树说成实际重新发芽。',alternatives:['可能忽略觉得，也可能把童话感受当自然生长事实。'],verification:'对照末句和木地板铺在阳台的状态，说明哪些改变实际发生。',correctiveFeedback:'它感到像一棵树，文中没有新发芽情节；角色感受与材料状态分开。'},
  {observation:'只背五个名称就认为已用自己的话讲清全部历程。',alternatives:['可能把线索当完整讲述，也可能遗漏转变与处境。'],verification:'请听实际讲述，检查至少一处转变与愿望的联系。',correctiveFeedback:'名称是提纲，讲述还要让听者知道前后怎样相连，不以字数或照抄量评分。'}],
 transfer:{scenario:'换一个明确标注原创的物品再利用童话，提供完整阶段和加工动作，不要求真实工具操作。',prompt:'列出阶段与变化原因，分清愿望和实际动作，再用自己的话讲清经过。',expectedStrategy:'先核对先后和原因，再组织语言；不照搬原课愿望或补造新的实际结局。'},
 summary:{synthesis:'沿着阶段读，联系处境理解愿望，再用自己的话讲清历程。反复表达串起故事，角色想法不替代实际变化。',takeaways:['种子树车椅地板顺序清楚','生长与人物加工不同','愿望联系当前处境','末尾感受不等实际返生']},
 citations:[{page:38,quote:'试着用自己的话说一说',usedFor:'transfer'},{page:39,quote:'它觉得自己又变成了一棵树',usedFor:'concept'}],
 },['已查看略读提示、默读与复述要求、作者流火、种子生长和农夫加工手推车开端。','已查看车椅地板转变、各阶段愿望和满意结尾、缩努茎锯斧推吱拆八字；觉得变树不改写为实际返生，无写字表或全文背诵要求。']);
for(const [slug,draft]of[['matches',matches],['tree-journey',tree]])fs.writeFileSync(path.join(root,'resources/curriculum/source-lessons/chinese-g3-'+slug+'-v1.json'),JSON.stringify(draft,null,2)+'\n');
console.log(JSON.stringify({drafts:2,targets:[matches.targetIds.length,tree.targetIds.length],definitionCandidates:10,published:false,learnerEvidenceCreated:false}));

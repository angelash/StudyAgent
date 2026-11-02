// Original lessons from one exact textbook. Source review is distinct from
// teacher approval, full-paper reading and actual learner observation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),bookId='archive-book:chinese-g3-upper-02915a7db6517258',prefix='source:chinese:g3:02915a7d:';
// Consume the versioned source note so regeneration needs no private QA files.
const scienceFile='resources/curriculum/source-reviews/sunflower-abstract-crossref-v1.json',review=JSON.parse(fs.readFileSync(path.join(root,scienceFile)));
assert.equal(review.source.rawSha256,'9e724725c7c9dd03ce8833c79004978588222aa06cc24f5fa8bd8009e12f6f24');
assert.equal(review.source.doi,'10.1126/science.aaf9793');assert.equal(review.fullResearchArticleRead,false);assert.equal(review.teacherReviewed,false);
assert.deepEqual(review.claims.map(claim=>claim.quote),["The growth of immature sunflower plants tracks the Sun's movement.",'As the flowers mature and open, they settle into a stable east-facing orientation.']);
const def=(suffix,name,objective,successCriterion,strand)=>({id:prefix+suffix,version:1,name,subject:'chinese',grade:3,term:'upper',strand,objective,successCriterion,prerequisiteIds:[],curriculumVersion:'source-original-02915a7d-v1',status:'draft'});
const evidence={atomId:'core:chinese:detail-evidence',objective:'用具体图文或本人实际记录支持判断，保留来源和当前范围',successCriterion:'原叙述、拟人猜想、读后理解与真实观察分别核对，不由模板、示范或单次观察补造全部规律和已完成过程'};
const meaning={atomId:'core:chinese:contextmeaning',objective:'结合具体词句解释当前含义和表达作用',successCriterion:'词义与当前对象和语境相容，拟人比喻与实际动作不混，不用字面词义推未给的心理或科学结论'};
function make(slug,entry,start,end,definitions,scope,content,notes,withMeaning=true){const goals=[...definitions.map(d=>({atomId:d.id,objective:d.objective,successCriterion:d.successCriterion})),...(withMeaning?[meaning]:[]),evidence].map((g,i)=>({id:'goal-'+(i+1),...g}));assert(goals.length<=8);return{format:'source-original-lesson-draft-v1',status:'draft_needs_materials_and_review',source:{bookId,lessonId:bookId+':unit5:entry'+entry,sourceSha256:'02915a7db6517258434d370430bbf464a1dac6e17df97b90d707dc4ecf5cfedf',pageStart:start,pageEnd:end,publicationYear:null,curriculumStandardYear:null},definitionCandidates:definitions,targetIds:goals.map(g=>g.atomId),sourceReview:{confirmedRange:true,statement:'选定准确原件每页正文、作者译者、表格、旁批和活动任务已逐张查看，教材范围与单元附属活动分别标明；来源核对不代教师审核或学生实际观察完成。',pages:notes.map((statement,i)=>({page:start+i,visualChecked:true,statement}))},scope:{...scope,teacherReviewed:false,published:false},content:{...content,goals,prerequisites:[],retention:{intervalDays:[1,3,7,14],anchor:'last_relevant_teaching_or_help',instructions:'目标、量规、未见结构与充分库存审核后按真实日期安排。已看原篇、旁批、示例或得到帮助需保留曝光；拟议间隔、模拟日期、示范观察与后改内容不能代本人未见首答或真人保持。'}},editorNotes:{slug,teacherReviewed:false,automaticPublication:false,realLearnerEvidence:false,materialStatus:'具体原创讲解与未审材料，教师对齐、独立结构、评分和充分保持库存仍待审。',sourceBoundary:'原文、旁批、实际原稿与本人观察分别标明，不把教研者已读或模板示例记成学生真实经历。'}};}
const golden=make('golden-grass',2,71,73,[
 def('golden-reading','金草六字语境识读','结合词语识读蒲英耍欠钓拢六字','本人本次音频逐字覆盖六目标，蒲公英含蒲英两个目标，读法按当前词语核对，文字选择不代声音','识字与阅读'),
 def('golden-handwriting','金草十三字实际书写','观察并真实书写蒲英盛耍喊欠钓而察拢掌趣喜十三字','本人原稿的部件和结构逐字可核，原稿订正与改后分别留，熟读或旧字库图不能代本次书写','识字与写字'),
 def('golden-change-explanation','按时段联系草地颜色与开合','梳理文中早中晚草地颜色及蒲公英开合怎样支持解释','早绿午金傍晚绿与原段开合对应，显露或遮住金色帮助说明，手掌是类比，不推所有植物固定钟点或完整解剖','观察与解释'),
 def('golden-interest-and-feeling','用细节说明草地蒲公英的趣味与感情','联系兄弟玩耍和发现变化的具体叙述说明作者的感受','趣味和喜爱由具体片段支持，原文玩耍不变学生吹脸操作要求，感受和实际观察解释分别看','文学阅读'),
 def('golden-unit-observation-practice','联系单元平台开展真实观察练笔','区分正文与单元交流平台，写本人实际观察的几句话并交流','具体细节、合适感官与变化有真实记录，蜗牛芒果为示例不能替本人经历；方法按对象条件选择，不强迫每项都尝','观察与表达'),
],{title:'金色的草地',author:'苏联普里什文',translator:'茹香雪',textbookAdapted:true,mainTextPhysicalPages:[71,72],ancillaryUnitActivityPhysicalPages:[73],ancillarySections:['交流平台','初试身手'],separateUnitSections:true,recognitionCharacters:['蒲','英','耍','欠','钓','拢'],writingCharacters:['蒲','英','盛','耍','喊','欠','钓','而','察','拢','掌','趣','喜'],fullTextRecitationRequired:false,secondaryScienceBoundarySource:scienceFile},
{title:'金色的草地与单元观察练笔：按条件看变化，把实际所得写清楚',
 activation:{prompt:'原创两张纸片卡：第一张绿色底面上金色圆片合起，第二张圆片展开露出金色。先说哪项真正改变，再提出颜色看起来不同的可能原因；这是示意卡，不是真实蒲公英解剖图。',expectedObservation:'能把显露遮住与所见颜色联系，区分当前卡片说明和真实植物还需观察的条件。',bridge:'课文按早中晚观察草地，用花朵张合解释颜色变化，单元平台再让我们写自己的观察所得。'},
 concept:{explanation:'正文中兄弟在草地上玩耍，蒲公英给他们带来快乐；后来作者早起发现草地不是金色，接着留意到中午金色、傍晚又绿。解释不能只背三个颜色，还要联系文中蒲公英张开时金色显露、合拢时金色被包住的描述。手掌张合是帮助想象的比喻，不是完整植物解剖图；早中晚是该段叙述的观察时段，不意味着所有地方所有蒲公英按同一钟点变化。课后举向日葵的例子也要带条件：研究摘要区分幼株跟随太阳的生长和花成熟开放后朝向稳定，不能说所有成熟花盘总会转头。观察真实对象时记录它的生长阶段、环境和实际变化，没看到就留下问题。作者觉得草地可爱、蒲公英有趣和喜爱它，与玩耍和新发现等具体经历有关，不能只背感情标签，也不把对脸吹绒毛的情节变成必须照做的任务。正文之后一页是单元交流平台和初试身手，归纳留心与细致观察，又给雨停蜗牛和芒果的示例。示例教方法，不是学生已发生的经历。本人练笔选一个合适对象，写清实际看到、听到或其他适合的感觉，以及仍未知什么；感官随对象选择，品尝只是有时可用，不能要求所有对象都尝。',points:['颜色与开合原因按原段对应','手掌是类比，时段保留场景条件','感情有玩耍和发现等具体依据','成熟与幼株的向日葵条件不同','73页是单元活动，不冒充正文','例文教方法，真实观察须本人记录']},
 example:{situation:'原创观察示例，供学习表达而非学生真实记录：同一纸片模型第一次合起时见绿色底，展开后见金色圆片，第三次合起又见绿色底。',steps:[
  {explanation:'先列三次所见，分别标对象、状态与颜色，不先补成真实蒲公英每天固定时刻的结果。',board:['对象：纸片模型','合起见绿','展开见金，再合见绿']},
  {explanation:'解释联系显露和遮挡，不说纸片材料本身每次改变了颜色；与原文比喻相通但材料身份不同。',board:['显露金色','遮住金色','模型不等植物全部机制']},
  {explanation:'若观察自己身边事物，另留真实记录，说明合适方法与未知，不抄这三次结果当自己的观察。',board:['本人实际对象','所用合适方法','未知不编，示例不代本人']},
 ],conclusion:'先保留当前所见，再用条件支持解释；模型、文学叙述与真实观察各有范围。'},
 visuals:[{kind:'table',title:'正文所见、原因与单元练笔分开',headers:['材料与时段','原段或当前可说明','需要保留的条件'],rows:[['正文早上','草地绿色，花朵合拢','叙述中这次观察，不定所有地方钟点'],['正文中午','花朵张开，金色显露','手掌张合为类比，不是完整解剖'],['正文傍晚','花朵合拢，金色被包住','颜色变化与原段原因对应'],['课后向日葵例子','观察变化要留心','幼株与成熟开放后的朝向条件分清'],['73页平台和初试身手','留心细节、多种合适感官与练笔','蜗牛芒果是示例，不当本人已观察']],explanation:'按材料身份与实际条件看变化，避免把一篇叙述、模型或一个方法口诀推广为所有对象固定规律。'}],
 misconceptions:[{observation:'只填早绿午金晚绿却无法说明为什么，或把变化说成所有植物同钟点必变色。',alternatives:['可能只记表格答案，也可能忽略该段观察场景。'],verification:'把每个颜色与张开合拢以及金色显露遮住对应，再说明未观察对象仍未知。',correctiveFeedback:'颜色和原因互相支持，保留叙述条件，不用一段经历替全部自然规律。'},
  {observation:'把向日葵追日概括成成熟花盘在任何时候都跟着太阳转。',alternatives:['可能省略生长阶段，也可能把课后举例当无限制规律。'],verification:'对照科学摘要中幼株与花成熟开放后的区分，实际记录当前对象阶段；未观察不补造。',correctiveFeedback:'在相应阶段与条件下谈变化，不要求学生背全部机制，来源仅为已读摘要而非研究全文。'},
  {observation:'把平台里的芒果或蜗牛故事直接填成本人已观察，并认为五种感官都必须用。',alternatives:['可能把示例当个人模板，也可能误把方法清单当强制动作。'],verification:'核本人真实对象和记录，说明哪些方法适合、哪些没用与为什么。',correctiveFeedback:'示例与本人经历分开，选择适合方法，不尝未知物品，不因未用一种不合适感官而判不会观察。'}],
 transfer:{scenario:'选择身边合适对象的真实变化，或使用明确原创图卡练习；没有实际记录时只报告图卡分析与待观察问题。',prompt:'列所见与条件，说明一个可能原因，写几句真实所得并与愿意参与的同伴交流。区分正文、平台示例和本人记录。',expectedStrategy:'具体细节支持解释，方法按条件选择，未知与未发生交流留缺；模拟日期或复述原篇不能当真实观察完成。'},
 summary:{synthesis:'仔细看变化，也说明为什么和在什么条件下。原文与单元练笔有不同身份，自己的观察由本人真实所得支持。',takeaways:['三时颜色联系开合原因','类比不代完整自然机制','植物阶段和环境要说明','感情由具体经历支持','示例不代本人真实记录']},
 citations:[{page:72,quote:'把下面的内容补充完整，体会作者观察',usedFor:'example'},{page:72,quote:'朗读课文，一边读一边想象课文描写的场景。',usedFor:'concept'},{page:73,quote:'用几句话写下来和同学交流吧！',usedFor:'transfer'}]},
['物理71印66已看作者苏联普里什文、译者茹香雪及有改动，草地玩耍与早中晚发现，不安排对脸吹绒毛活动。','物理72印67已看开合手掌比喻、感情、6识13写与课后颜色原因表和自然变化例。科学适用条件另核已读出版方摘要，不推所有蒲公英固定钟点或成熟向日葵持续追日。','物理73印68为单元交流平台与初试身手，目录未单列；鸟草例归纳观察、雨停蜗牛与芒果多感官示例，要求实际观察几句话交流，不冒充正文或学生经历。']);
golden.editorNotes.scienceBoundarySource=scienceFile;golden.editorNotes.scienceReadScope='Only the publisher-deposited abstract was read; full research paper not read.';
const examples=make('observation-examples',3,74,76,[
 def('examples-dog-details','用行为细节说明王子淘气可爱','从组合例文的小狗具体行为中提出有依据的阅读感受','跑快又等人、叫声与赛跑等叙述可支持感受，旁批与本人观点分开，不由评价推全部动物性质','文学观察与表达'),
 def('examples-animal-interpretation','区分动物行为与作者拟人解释','比较小狗实际动作叫声与叙述者猜想的想法','会数到二、理解狗字、允许或骂火车等保留为叙述解释，不单由这些文字认定真实动物算术与内心，不安排追火车验证','阅读与推断'),
 def('examples-fruit-details','按外形颜色味道整理杨梅观察','把杨梅的部位、成熟变化与味道按文本归类说明','外形触感、颜色先后和成熟仍有酸分别有依据，几乎黑不改成真黑，大小比喻不定所有果实精确尺寸','观察与说明'),
 def('examples-observation-writing-method','从两篇例文提取具体观察表达方法','比较动物行为与果实多方面变化怎样写具体，再用于新表达','方法有可定位片段，不照抄例文充本人观察；夸张拟人、个人吃多经历和真实测量各自有范围','阅读与习作'),
],{title:'习作例文：我家的小狗、我爱故乡的杨梅',activity:true,combinedExamples:true,parts:[{title:'我家的小狗',author:'捷克博·日哈',translator:'刘星灿',textbookAdapted:true,physicalPages:[74,75]},{title:'我爱故乡的杨梅',author:'王鲁彦',textbookAdapted:true,physicalPages:[75,76]}],recognitionCharacters:[],writingCharacters:[],animalThoughtsAreNarratorInterpretations:true,requiredTastingOrRailwayActivity:false},
{title:'习作例文：行为与变化写具体，感受与猜想说明来源',
 activation:{prompt:'原创两卡：一张写玩具小狗走两步又停下，旁白猜它在等朋友；另一张写同一纸果由浅红卡换成深红卡。分别说实际给了什么、旁白想了什么。',expectedObservation:'能区分动作、颜色与附加心理解释，知道两种对象可以用不同方面写具体。',bridge:'小狗例文侧重行为和有趣解释，杨梅例文按外形、颜色、味道和成熟变化写观察。'},
 concept:{explanation:'这项组合例文跨三页，含两位作者的作品。《我家的小狗》写王子跑得快却在前面等人、学“狗”时叫得欢、用一声两声汪汪与人交流，还写它和火车赛跑。说淘气可爱要找这些具体内容，旁批是编者提示，不是学生本人首答。作者用有趣口吻说它会数到二、猜它理解狗字、允许火车开走或骂火车，不能只凭叙述就当动物识字算术与心理已被实验确认；阅读也不要求人或动物追火车验证。《我爱故乡的杨梅》从圆形、表面小刺及成熟时刺变软、颜色由淡红到深红近黑、味道与成熟的关系写具体。原文特意说不是真的变黑，熟透仍有酸味，只因甜而不觉得酸，不能改成成熟完全没酸。和桂圆一样大小是当前比较，不给所有品种统一精确尺寸。作者小时候吃多牙酸软是个人叙述，不能当学生要照做的过量品尝实验或医学诊断。两篇都以细节支持感受，但观察方面不同；学方法后用自己的真实对象和记录表达，不抄例文代本人经历。',points:['组合课两位作者和作品范围清楚','可爱淘气有具体行为支持','动物心理推测与可见行为分开','杨梅按外形颜色味道与成熟归类','近黑不是真黑，熟透仍有酸','文学比较与个人经历不代普遍实验','从例文借方法，自己的记录需真实']},
 example:{situation:'明确原创观察卡：小木偶停下等同伴，旁白说也许它在担心；三张纸果卡由浅红变深红，作者觉得颜色鲜明。不是原文动物或果实实验。',steps:[
  {explanation:'先给小木偶的可见动作再给感受依据，旁白也许担心为推测，不加成已测到真实内心。',board:['动作：停下等','感受有动作支持','也许为旁白解释']},
  {explanation:'按纸果卡浅红深红顺序说明颜色信息，不说纸果真的经历生长成熟，更不由图卡判断真实味道。',board:['对象：纸果卡','颜色先后明确','味道未给仍未知']},
  {explanation:'总结行为与变化两种表达方法，再为本人实际观察另记对象条件，不把这段示例写成自己的既往经历。',board:['行为可支持感受','变化按方面整理','真实本人记录另留']},
 ],conclusion:'细节、解释和感受各有来源；比较方法可以迁移，材料身份与未知不能省略。'},
 visuals:[{kind:'table',title:'两篇例文的具体信息与解释范围',headers:['例文材料','可以提取的方法或信息','不能直接推广'],rows:[['王子跑快又等我','动作细节支持亲近可爱等感受','不能仅凭评价证明所有时候的动物性格'],['叫一声两声与旁白心理','行为和有趣拟人解释分开','不能据此证明识字算术或真实内心'],['杨梅外形触感与成熟','按形状表面及变化写具体','比较大小不定全部品种精确尺寸'],['淡红深红几乎黑','颜色按先后和程度表达','原文说并非真黑，不能删掉限制'],['熟透甜津津仍有酸','成熟程度与味道条件相连','个人吃多经历不作过量验证任务'],['学例文再观察自己的对象','借用观察和归类方法','范文、图卡或想象不代本人真实观察']],explanation:'例文帮助看表达方法，具体事实、文学口吻和个人经历各有边界；不把有趣叙述当已完成科学实验或学生经历。'}],
 misconceptions:[{observation:'由会数到二和汪汪两声，直接给真实狗填上识字算术能力。',alternatives:['可能把文学口吻当实验结论，也可能没分动作和旁白解释。'],verification:'分别列实际叫声动作与作者准是在想、不知等推测措辞。',correctiveFeedback:'可以欣赏有趣解释，不能由一段文学叙述确认全部动物认知，也不把追车情节转成实际操作。'},
  {observation:'把杨梅几乎黑改成真黑，或把熟透很甜改成完全没有酸。',alternatives:['可能忽略程度与转折，也可能只选最醒目的一个感受词。'],verification:'对照原文限制句和成熟条件，分别整理颜色与味道，不混两个方面。',correctiveFeedback:'保留近似、成熟和仍有酸等条件，细节准确比只背甜黑两个词更重要。'},
  {observation:'拿例文的童年吃多经历或对小狗的想象，作为自己已经观察验证的记录。',alternatives:['可能抄模板，也可能把作者我和本人混为一人。'],verification:'标作者、实际对象和本人原记录，未发生经历保持未完成。',correctiveFeedback:'借方法不借身份，原文个人经历不是学生应照做实验或本人事实。'}],
 transfer:{scenario:'选择真实身边物件或明确原创图卡，分别练行为细节和按方面变化说明；没有真实观察时只做给定材料分析。',prompt:'用一项具体信息支持感受，分清可见信息与推测，再按合适方面写变化。说明来源与仍未知什么。',expectedStrategy:'方法可定位可迁移，拟人、个人叙述和真实记录身份清楚，未知不靠熟悉范文补足。'},
 summary:{synthesis:'行为与变化写具体，感受才有依据。欣赏拟人与比较，也保留原文的程度、条件和信息来源。',takeaways:['两篇材料范围清楚','动作支持印象而非全部心理事实','外形颜色味道各自核对','近似和成熟等限制不能删','借方法不冒充作者经历']},
 citations:[{page:75,quote:'作者发现了“王子”的淘气可爱',usedFor:'concept'},{page:76,quote:'它不是真的变黑，而是因为太红了',usedFor:'example'},{page:76,quote:'认真读课文，填写下面的表格，体会作者观察的细致。',usedFor:'transfer'}]},
['物理74印69小狗例文作者捷克博·日哈、刘星灿译，有改动；跑快却等人、狗字叫欢与数二、旁白动物心理须分身份，本页未完。','物理75印70上接王子赛火车和交流淘气可爱任务，下起王鲁彦杨梅例文，树枝叶、端午后挂果与外形刺随成熟变化；组合课两篇分清。','物理76印71杨梅续文外形颜色味道，几乎黑非真黑，熟透甜但仍有酸，童年吃多经历不作实际过量任务；表格三方面有具体文本依据。']);
const composing=make('colorful-observation-writing',4,77,77,[
 def('colorful-own-observation','保留本人近期具体观察','选近期印象深刻一种事物或一处场景，记录实际所见和条件','对象与具体细节真实对应，合适方法及未知清楚；范文、图卡、想象和他人观察不冒充本人近期经历，不强制全部感官或私密地点','观察记录'),
 def('colorful-observation-paragraph','把具体观察所得写成清楚习作','根据本人记录组织一段观察文字，突出印象深刻细节或变化','一种事物或一处场景即可，顺序可跟随，概括感受有细节支持，不强定统一字数、必须题目或五感全用','观察与习作'),
 def('colorful-selected-sharing','向同伴展示自认写得好的部分','选择本人习作一处读给真实小组同伴听，说明为什么选择','所读片段属于本人作品并联系观察，真实听众与角色示范分开；未发生交流不自造同伴回应或完成次数','习作交流'),
 def('colorful-one-sentence-reflection','用一句话概括实际观察感受','交流后依据实际过程提炼一句观察心得','心得联系细致、合适感官或注意变化的具体经历，不只抄示例口号；准备、回顾与真实交流后反思分别记录','学习反思'),
],{title:'习作：我们眼中的缤纷世界',activity:true,physicalPage:77,printedPage:72,oneObjectOrOneScene:true,requiredWordCount:null,titleRequired:false,allSensesRequired:false,tastingOptionalAndConditional:true,realPeerSharingNotAutomaticallyCompleted:true},
{title:'我们眼中的缤纷世界：具体写本人所得，选择片段交流心得',
 activation:{prompt:'原创两句对照：“水杯很好看”和“浅蓝杯身上有一条白线，放到窗边时白线显得更亮”。说第二句多给了什么信息；这只是写法示例，不是你已经观察过水杯的记录。',expectedObservation:'能指出颜色、位置或条件等具体信息怎样帮助读者了解对象，同时保留示例身份。',bridge:'这次习作要把自己最近观察印象最深的一种事物或一处场景写下来，再交流片段和心得。'},
 concept:{explanation:'先回看本人最近的实际观察，选择印象最深的一种事物或一处场景，不必同时写许多对象。记录对象、合适的观察条件和具体所见，再选能支持印象的细节组织文字；有先后变化就按真实观察顺序说明，没有变化也可按部位或方面写清楚，不为凑变化编造经历。观察不仅用眼睛，也可在适合条件下听、摸、闻，有时品尝，但这些不是每项必做的清单，不要求对未知物品入口或披露私人地点。原页没有统一字数或必须题目的限制，写清所得比机械凑长度重要。完成后选择自己认为写得好的部分读给真实小组同伴听，所读片段与本人作品对应；预先练读或角色示范可以帮助准备，但不直接标真实交流完成。交流后用一句话概括观察感受，例如自己怎样因多看一点、换合适方法或留意变化而发现新信息；要联系真实过程，不只是抄教材三句提示。没有本人观察记录或没有同伴条件时，如实标准备、示例分析和待完成环节，不能由任务要求代填真实经历。',points:['选一种事物或一处场景','具体细节来自本人实际记录','顺序和方法按对象条件选择','感官不是全部必做清单','交流片段属于本人作品','一句心得有实际过程依据']},
 example:{situation:'明确原创示范，非学生真实记录：同一浅蓝水杯在窗边显得亮，移到书旁后白线不那么亮；只给视觉信息，没有味道或声音。',steps:[
  {explanation:'列对象和两次条件，把亮暗感受联系位置，未提供其他感官就不补造。',board:['同一水杯','窗边与书旁','只给视觉信息']},
  {explanation:'可写“浅蓝杯身上绕着一条白线。放在窗边时白线显得亮，移到书旁后不那么亮了。我想再换个位置看看。”这是示范表达而非已经完成进一步观察。',board:['细节：杯色与白线','按条件写差别','再观察是计划']},
  {explanation:'选前两句作为示范朗读片段，心得可说观察时说明位置更清楚；真实作业仍需本人原记录与真实同伴过程。',board:['所选片段有具体细节','心得联系过程','示范不代本人经历或交流']},
 ],conclusion:'写法能借鉴，身份和实际记录不能借；未观察部分留问题，不靠范文补成完成。'},
 visuals:[{kind:'table',title:'从观察到交流的真实材料链',headers:['阶段','要保留的具体材料','容易误当完成的情况'],rows:[['选对象并实际观察','本人对象、条件、细节与未知','抄范文或只想过不等已观察'],['组织习作','原记录对应的具体句段','堆漂亮标签或凑字数不能代细节'],['选择展示片段','本人作品中自认好的部分','下载范例不冒充本人稿'],['读给小组听','真实听众与实际读到的范围','角色配音或练读不等真实小组交流'],['一句观察心得','实际过程支持的方法感受','只抄口号或未交流就补完成']],explanation:'各阶段有对应材料与范围，准备和示例都可学习，但不能由流程名义填满真实记录。'}],
 misconceptions:[{observation:'原记录只写颜色，习作却补出没有实际体验的声音味道和一天完整变化。',alternatives:['可能套五感模板，也可能为篇幅补造经历。'],verification:'逐句回到本人实际记录，分别标所见、合理猜测和未来观察计划。',correctiveFeedback:'具体不等虚构更多感官，适合的方法才用，未知和计划清楚保留。'},
  {observation:'只有“很好看很有趣”或机械凑够字数，没有可定位的观察信息。',alternatives:['可能先写评价，也可能忽略让读者看见细节。'],verification:'让读者说出对象的一项具体特点，找真正支持感受的原记录并补表达。',correctiveFeedback:'加入准确细节而非空泛形容词，不强定全班相同字数或必须标题。'},
  {observation:'把练读录音或自己配两个人声音标成真实小组交流与同伴反馈。',alternatives:['可能混准备与实际过程，也可能想直接填完成。'],verification:'核实际听众和读到范围，没有真实对象就标练习，不编反馈。',correctiveFeedback:'练读可准备但不代真实交流，一句心得也要说明来自何种实际经历或示例回顾。'}],
 transfer:{scenario:'换一个本人最近实际观察的物件或场景；若暂不具备条件，只分析清楚标明的原创观察卡并记录待做。',prompt:'根据原记录写一段具体文字，选择一处展示给真实同伴，再用一句话说实际观察心得。没有条件的环节保留未完成。',expectedStrategy:'原记录与表达对应，方法按条件选，真实交流与准备分清；未发生的所见和同伴回应不代填。'},
 summary:{synthesis:'把自己真正看到的写具体，选择能说明发现的片段交流，再用一句话提炼真实心得。',takeaways:['一种对象也可写清楚','实际细节支持感受','方法合适而非五感强制','片段和原稿可对应','心得与真实过程相连']},
 citations:[{page:77,quote:'一种事物或一处场景\n写下来。',usedFor:'concept'},{page:77,quote:'把你认为写得好的部分读给小组同学听',usedFor:'example'},{page:77,quote:'试着用一句话说说最近的观察感受',usedFor:'transfer'}]},
['物理77印72已看写最近观察深刻一种事物或场景，选自认好部分给小组听，交流后一句心得；细致、多种合适感官、注意变化为方法提示，尝是有时可选，不加字数标题和全感官强制。'],false);
for(const [slug,draft]of[['golden-grass',golden],['observation-examples',examples],['colorful-observation-writing',composing]])fs.writeFileSync(path.join(root,'resources/curriculum/source-lessons/chinese-g3-'+slug+'-v1.json'),JSON.stringify(draft,null,2)+'\n');
console.log(JSON.stringify({drafts:3,targets:[golden.targetIds.length,examples.targetIds.length,composing.targetIds.length],newDefinitions:13,scienceFullPaperRead:false,teacherReviewed:false,published:false,learnerEvidenceCreated:false}));

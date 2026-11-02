// Exact-source original candidates for physical pages40 through44, with an explicit secondary science boundary.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),bookId='archive-book:chinese-g3-upper-02915a7db6517258',prefix='source:chinese:g3:02915a7d:';
const definition=(suffix,name,objective,successCriterion,strand)=>({id:prefix+suffix,version:1,name,subject:'chinese',grade:3,term:'upper',strand,objective,successCriterion,prerequisiteIds:[],curriculumVersion:'source-original-02915a7d-v1',status:'draft'});
const meaning={atomId:'core:chinese:contextmeaning',objective:'联系当前前后文和具体对象解释词句，说明所用方法',successCriterion:'含义与语境相容，不只重复目标词或机械套同字常见义'};
const evidence={atomId:'core:chinese:detail-evidence',objective:'用具体情节支持判断，分清角色想法实际行动和推测',successCriterion:'指出依据及支持关系，未给的动机结果不编造，局部判断不扩大成永远如此'};
function assemble(slug,entry,start,end,definitions,scope,content,pageNotes){
 // Keep the existing eight-target lesson boundary. Cow vocabulary methods are taught within evidence explanations;
 // its explicit reading, writing, dialogue, friendship, diagram, retelling and science tasks keep their own targets.
 const reused=slug==='cow-journey'?[{...evidence,objective:'结合具体词句解释与行动支持判断，分清故事叙述、角色想法与科学来源'}]:[meaning,evidence];
 const goals=[...definitions.map(row=>({atomId:row.id,objective:row.objective,successCriterion:row.successCriterion})),...reused].map((row,index)=>({id:'goal-'+(index+1),...row}));
 return{format:'source-original-lesson-draft-v1',status:'draft_needs_materials_and_review',source:{bookId,lessonId:bookId+':unit3:entry'+entry,sourceSha256:'02915a7db6517258434d370430bbf464a1dac6e17df97b90d707dc4ecf5cfedf',pageStart:start,pageEnd:end,publicationYear:null,curriculumStandardYear:null},
  definitionCandidates:definitions,targetIds:goals.map(row=>row.atomId),sourceReview:{confirmedRange:true,statement:'准确原件全部选定正文、注音、识写表、作者脚注、任务与插图已逐张查看；AI核对不是教师审核。',pages:pageNotes.map((statement,index)=>({page:start+index,visualChecked:true,statement}))},
  scope:{...scope,teacherReviewed:false,published:false},content:{...content,goals,prerequisites:[],retention:{intervalDays:[1,3,7,14],anchor:'last_relevant_teaching_or_help',instructions:'目标、量规、结构与充分未见库存须先审核，再按真实日期核对。原故事重述和重复题不自动当独立迁移，提示与看文保留。'}},
  editorNotes:{slug,teacherReviewed:false,automaticPublication:false,realLearnerEvidence:false,materialStatus:'具体原创讲解、例子、图表和错因已编写；检查材料、独立结构、评分与充分保持库存仍须审核。',reuseBoundary:'仅复用明确列出的词义与依据目标，新增定义先修和等价关系保持候选。',pacing:'识读、书写、朗读、画图与复述分次核对，不把一次局部完成说成整课全部掌握。'}};
}
const cowDefs=[
 definition('cow-journey-word-reading','牛肚子课13字识读','在词语中识读咱偷答应骨齿嚼吞胃悲咽泪眯13字','真实声音覆盖目标字，答应一骨碌细嚼慢咽等依当前语境核对，不以拼音选择代实际读音','识字与阅读'),
 definition('cow-journey-handwriting','牛肚子课13字实际书写','观察并真实书写旅咱偷救命拼扫胃管乎咬流泪13字','本人原稿逐字核对部件和完整性，说明和字库图像不代替书写，原稿订正分别保留','识字与写字'),
 definition('cow-journey-role-reading','分角色读出对话处境','分角色朗读青头红头对话，联系当时处境说明语气','本次实际声音与角色范围清楚，允许一人分角色或真实同伴参与，不虚构配合或统一语调','朗读与表达'),
 definition('cow-journey-friendship-evidence','三处情节支持朋友判断','默读后找至少三处具体情节说明青头红头的友谊','各处有不同具体叙述支持并解释关系，不把一处拆三个形容词，也不只背好朋友标签','文学阅读'),
 definition('cow-journey-route-diagram','按原故事画出红头路线','依据原文画出红头进出过程并标清方向与返回处','本人图像与口腔文中第一第二胃返回口腔喷出对应；图只为故事路线，不作为完整生理图','阅读与图示'),
 definition('cow-journey-route-retelling','借路线讲清惊险故事','用自己的话借路线讲清进出过程与青头帮助','听本次实际讲述，路线和重要行动对应，画图与讲述分别核对，不以原句背诵代组织表达','阅读与表达'),
 definition('cow-journey-science-boundary','区分童话路线与反刍说明','区分故事拟人救援与真实反刍的基本说明','牛胃四分室、前段也处理食物；反刍回口再嚼不等每次必喷出，不拿童话编号替完整生理机制','跨文本阅读'),
];
const cow=assemble('cow-journey',3,40,42,cowDefs,
 {title:'在牛肚子里旅行',author:'张之路',recognitionCharacters:['咱','偷','答','应','骨','齿','嚼','吞','胃','悲','咽','泪','眯'],writingCharacters:['旅','咱','偷','救','命','拼','扫','胃','管','乎','咬','流','泪'],
  requiredFriendshipEvidenceCount:3,fullTextRecitationRequired:false,requiredTasks:['分角色朗读','至少三处说明好朋友','画路线再讲故事'],realAnimalExperimentRequired:false,
  secondaryScienceReference:'resources/curriculum/source-reviews/ruminant-digestion-msstate-v1.json',scienceBoundary:'课文的前三个只贮藏、只有第四个消化是简化说法，不能作为准确完整生理结论发布。牛胃四分室，前部也参与食物处理；图按故事编号，不作真实解剖图。'},
 {
 title:'在牛肚子里旅行：沿路线讲故事，用行动说明友谊',
 activation:{prompt:'原创虚构情节：同伴卡在纸箱迷宫里，另一人先问位置，再指清出口。说他帮助了朋友，需要用哪些行动支持？这只是阅读材料，不做困住人的游戏。',expectedObservation:'孩子能指出询问与指路等具体行动，不能只用好朋友标签替代依据。',bridge:'读青头怎样在不同阶段帮助红头，再把红头路线画清楚。'},
 concept:{explanation:'先按情节读清捉迷藏、红头误入牛嘴、青头持续帮助和最后脱险。说明好朋友要至少找三处：急忙询问位置、被扫落后不顾疼痛再次帮助、隔着肚皮安慰并告诉办法、爬到鼻子处促使红头脱险，都可结合具体词句说明，不能把一处拆成三个空泛评价。路线图按原故事记牛嘴、文中第一胃、第二胃、回到牛嘴、随喷嚏出来，并标方向和返回，图示不画成真实完整消化解剖。科学资料说明牛胃有四个分室，前面的部分也参与食物处理，不能记成只有第四个才消化；反刍包括食物返回口腔再嚼，喷嚏脱险是童话情节，不是每次反刍必然发生。角色对话的语气联系害怕、担心、鼓励与脱险，可有不同合理读法。',points:['三处依据要具体到不同情节','对话语气联系当时处境','路线标清进出与返回','童话编号与完整生理机制分清','画图和实际讲述分别核对']},
 example:{situation:'原创虚构阅读卡：纸偶进了纸箱通道，先到红格，再到蓝格，后来返回入口。朋友先问它在哪一格，再递来路线卡，最后移开挡纸帮助它出来。此为纸偶故事，无真人被困活动。',steps:[
  {explanation:'按材料画入口、红格、蓝格、返回入口的箭头，不把先后直接画成没有返回的直线。',board:['入口→红格→蓝格','蓝格→入口（返回）']},
  {explanation:'找三处不同帮助：询问、递卡、移挡纸，各说怎样有用。',board:['询问：确认位置','递卡：提供路线','移挡纸：完成出口帮助']},
  {explanation:'借图用自己的话连贯讲述，不用图上有箭头就推断已经讲清楚。',board:['先核材料','再画方向','本人实际讲述另留声音']},
 ],conclusion:'图示与行动依据帮助理解故事，换回原课仍须使用原文路线与具体情节。'},
 visuals:[{kind:'table',title:'红头的故事路线与青头帮助',headers:['故事位置','发生的事','图示边界'],rows:[['牛嘴','与草一起进入，青头询问并提醒','故事入口，不安排实际接近动物'],['文中第一、第二胃','随草移动，青头安慰并说明返回机会','依课文编号，不画成完整生理解剖'],['返回牛嘴','红头看到光但难以动弹','必须标返回方向'],['体外','青头在鼻处活动，故事中喷嚏使红头出来','脱险情节不等真实反刍必喷出']],explanation:'路线服务童话复述。牛胃四分室且前段参与食物处理的科学边界有独立来源说明，不背错误的只有第四才消化。'}],
 misconceptions:[{observation:'把青头三个形容词当三处友谊依据。',alternatives:['可能只记结论，也可能未区分不同情节。'],verification:'请各指出一处具体言语或动作和所处阶段，再解释帮助关系。',correctiveFeedback:'评价由实际情节支持，不以形容词数量替代至少三处叙述。'},
  {observation:'路线只有一直向前的箭头，漏掉回到牛嘴。',alternatives:['可能按常见旅行画法，也可能忽略反刍带来的返回。'],verification:'找红头又见光的句子，说明前后位置并补返回箭头。',correctiveFeedback:'按故事位置画，不从想象补路线；图画和口头讲述分别核对。'},
  {observation:'把前三部分只存食物、只有第四消化背成科学定律，或说牛反刍每次都喷出东西。',alternatives:['可能未区分文学简化与科学说明，也可能将一次故事结局推广全部。'],verification:'对照已核查的科普来源：四分室、前段微生物处理食物、返回口腔再嚼，说明哪句需要改。',correctiveFeedback:'牛胃各部分有不同作用，前段也参与处理；回口再嚼不是故事中的喷嚏必然过程。'}],
 transfer:{scenario:'换一个提供明确进出与返回路线的原创纸偶故事，或比较一条童话表达与已核查科普信息，不做动物实验。',prompt:'画出材料支持的路线，找三处具体帮助，再用自己的话讲清。若涉及科学结论，说清证据来源和适用范围。',expectedStrategy:'信息、图示、行动与讲述相互核对；不把拟人故事或路径编号当科学全机制。'},
 summary:{synthesis:'沿路线读，借图讲；用不同具体行动说明友谊。童话中有真实知识线索，也有简化和想象，阅读时保留边界。',takeaways:['至少三处具体情节支持判断','返回路线不能漏','画图不能代本次复述','前段也参与食物处理，喷嚏是故事脱险']},
 citations:[{page:42,quote:'至少找出三处来说明',usedFor:'concept'},{page:42,quote:'画出它在牛肚子里旅行的路线',usedFor:'transfer'}],
 },['已查看捉迷藏、误入牛嘴与青头初次帮助、作者张之路。','已查看返入口腔的故事过程与课文四胃简化；对照已实际读取的大学推广资料记录科学修正，前三部分非只贮藏。','已查看喷嚏脱险、13字识读、13字写字、分角色/至少三处友谊依据/路线再讲故事任务，不加全文背诵或真实动物实验。']);
const cheeseDefs=[
 definition('cheese-word-reading','奶酪课12字识读','在词语中识读酪宣处诱舔毅犯禁稍豫跺聚12字','真实声音覆盖目标字，处罚chǔ稍息shào等依当前语境核对，无本课写字表','识字与阅读'),
 definition('cheese-plot-sequence','围绕奶酪梳理主要情节','默读后抓搬运奶酪掉渣犹豫分配完成的主要变化','用自己的话讲清前后转变，重要行动有材料依据，不把心动直接写成已偷吃','童话阅读'),
 definition('cheese-character-judgment','用具体行动评价队长','说明喜不喜欢蚂蚁队长并用不同阶段的实际行动支持','允许有依据的不同看法，区分犹豫与最后选择，不用领导身份或统一道德标签替代依据','文学阅读'),
];
const cheese=assemble('cheese',4,43,44,cheeseDefs,
 {title:'一块奶酪',author:'辛勤',skim:true,recognitionCharacters:['酪','宣','处','诱','舔','毅','犯','禁','稍','豫','跺','聚'],writingCharacters:[],fullTextRecitationRequired:false,
  requiredTasks:['默读','说围绕奶酪讲了什么事','说明对队长的看法及理由'],oneRequiredCharacterOpinion:false},{
 title:'一块奶酪：看清想法和行动，再说自己的看法',
 activation:{prompt:'原创虚构卡：大家约定先搬书，一人很想先看新书，想了一会儿仍继续搬。想看与已经违约能直接画等号吗？',expectedObservation:'孩子区分想法与实际行动，评价需具体材料，不只按身份或心动判断。',bridge:'读蚂蚁队长面对奶酪渣时怎样犹豫、怎样选择，再说明自己的看法。'},
 concept:{explanation:'故事围绕奶酪搬运展开：先宣布不偷嘴，队伍积极劳动；搬大奶酪时掉下一角，队长因诱惑和禁令犹豫；他把队伍调开，独自面对奶酪渣，最终没有自己偷吃，而是叫回大家，将碎渣给年龄最小的蚂蚁，最后完成搬运。梳理时抓转变和选择，不将犹豫直接写成已经偷吃，也不能从结尾的选择倒改成他从未心动。评价喜不喜欢要说明理由，可以肯定他最终约束自己、照顾小蚂蚁，也可以对过程中的做法提出有据疑问；不能只因队长身份就认为永远正确。公开分配与背着大家偷嘴在故事中不同，实际规则解释仍需看具体行动，不概括成现实所有分配都应这样。',points:['抓奶酪引出的主要事件','想法犹豫和行动分别看','结尾选择不抹去过程','人物评价允许有依据的不同意见']},
 example:{situation:'原创虚构卡：小组约定先把图书搬完再看。有一张书签掉落，组长很想留下，独自想了一会儿，最后把大家叫回来，说明情况并把书签归还原书。',steps:[
  {explanation:'先记约定和掉落事件，不把小物件换成无关的大情节。',board:['约定：先搬再看','变化：书签掉落']},
  {explanation:'想留下是心理活动，归还是最后行动，两者不相互替代。',board:['想法：想留','行动：说明、归还']},
  {explanation:'评价可肯定归还，也可讨论过程是否应早点说明，但都要指向材料。',board:['看法有具体依据','不同意见可交流','不能编成已经私藏']},
 ],conclusion:'人物在情节中作选择，评价看具体证据，不把一个标签当全部理解。'},
 visuals:[{kind:'table',title:'奶酪事件的转变',headers:['阶段','具体线索','评价需分清'],rows:[['宣布约定','不许偷嘴，队长也适用','身份不自动免除规则'],['掉渣诱惑','想吃又怕违反禁令','心动不等已经偷吃'],['独自犹豫','队伍调开后仍在作选择','不能跳过中间过程'],['叫回并分配','给年龄最小者，继续搬运','公开分配与背着大家偷吃分开'],['完成搬运','劲头更足，奶酪进洞','不由一次结果推人物永远完美']],explanation:'表格帮助梳理变化，人物看法须用具体行动支持，允许有依据的不同意见。'}],
 misconceptions:[{observation:'队长犹豫想吃，所以他已经偷吃了。',alternatives:['可能将心理和行动混同，也可能没有读到最后选择。'],verification:'分别找想吃、犹豫和实际处理奶酪渣的句子。',correctiveFeedback:'心动与行动分开记录，结尾给幼蚁不改写为自己偷偷吃。'},
  {observation:'只说喜欢，因为他是队长或从来不受诱惑。',alternatives:['可能按身份评价，也可能用结果倒改过程。'],verification:'指出两处实际行动，核对原文是否写过犹豫和想吃。',correctiveFeedback:'身份不是证据，可以肯定最终选择，同时保留过程中的心动。'},
  {observation:'不同意同伴看法，就给人物补造贪心或完美的未写情节。',alternatives:['可能只求意见一致，也可能没区分推测与正文。'],verification:'逐项指出材料已给和自己追加，再说明真实分歧。',correctiveFeedback:'不同意见可保留，理由必须有据，不用编造经历支撑评价。'}],
 transfer:{scenario:'换一个有约定、诱惑和最终选择的原创小故事，不要求学生披露本人或同学的违约经历。',prompt:'说清主要变化，再写你的看法和两条具体依据，分开人物想法与行动。',expectedStrategy:'按情节核对选择，观点允许不同，材料未给的动机结果保持未知。'},
 summary:{synthesis:'围绕一块奶酪读清事件，再用实际行动说明看法。心动不是已经偷吃，最终选择也不倒改过程。',takeaways:['主要情节抓变化','想法行动分别看','看法用具体依据支持','不同有据意见可以交流']},
 citations:[{page:43,quote:'想想课文围绕一块奶酪讲了一件什么事',usedFor:'concept'},{page:43,quote:'再说说你喜不喜欢文中的蚂蚁队长',usedFor:'transfer'}],
 },['已查看作者辛勤、略读提示、宣布约定、搬运掉渣和诱惑犹豫；规则对队长同样适用。','已查看调开队伍、独自犹豫、叫回分配幼蚁和完成搬运；12字识读，处罚chǔ稍息shào，无写字表或全文背诵要求。']);
for(const [slug,draft]of[['cow-journey',cow],['cheese',cheese]])fs.writeFileSync(path.join(root,'resources/curriculum/source-lessons/chinese-g3-'+slug+'-v1.json'),JSON.stringify(draft,null,2)+'\n');
console.log(JSON.stringify({drafts:2,targets:[cow.targetIds.length,cheese.targetIds.length],definitionCandidates:10,published:false,learnerEvidenceCreated:false}));

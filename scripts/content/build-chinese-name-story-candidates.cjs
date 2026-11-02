// Exact-source oral activity, with explicit authored probes and no fabricated
// family history, listeners, interviews or learner evidence.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),bookId='archive-book:chinese-g3-upper-02915a7db6517258',prefix='source:chinese:g3:02915a7d:',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const defs=[
 ['name-clear-sharing','清楚讲述已了解的名字信息','选择愿意交流的名字信息，说明含义或来历以及了解途径','对象、具体信息与来源清楚，字面联想和真实取名来历分开；可谈其他人的名字，不强迫披露本人或家人隐私','口语交际'],
 ['name-polite-listening','倾听名字故事并礼貌追问','听清同伴讲述，对感兴趣或不理解内容作相关回应和追问','回应联系实际听到的信息，问法尊重选择，记录真实同伴与回应；角色示范不冒充已发生交流','倾听与交流'],
 ['name-new-information-retelling','准确转述交流中新了解到的信息','交流后向合适家人或照顾者讲述从同伴处了解到的新信息','转述有原讲述依据，新增理解与自己猜测分开；真实转述、准备与未发生状态分别保留，不编造家庭经历','口语表达'],
].map(([suffix,name,objective,successCriterion,strand])=>({id:prefix+suffix,version:1,name,subject:'chinese',grade:3,term:'upper',strand,objective,successCriterion,prerequisiteIds:[],curriculumVersion:'source-original-02915a7d-v1',status:'draft'}));
const goals=[...defs.map(d=>({atomId:d.id,objective:d.objective,successCriterion:d.successCriterion})),{atomId:'core:chinese:contextmeaning',objective:'分清名字字面含义、可能期待与实际来历',successCriterion:'当前字义有依据，真实取名原因仍须实际询问或可靠资料；含某字不自动证明家庭经历'},
 {atomId:'core:chinese:detail-evidence',objective:'给名字故事与转述保留来源和未知范围',successCriterion:'原讲述、本人猜测与尚未核实信息分清，不把任务计划或示例故事当真实采访和回应'}].map((g,i)=>({id:'goal-'+(i+1),...g}));
const draft={format:'source-original-lesson-draft-v1',status:'draft_needs_materials_and_review',source:{bookId,lessonId:bookId+':unit4:entry4',sourceSha256:'02915a7db6517258434d370430bbf464a1dac6e17df97b90d707dc4ecf5cfedf',pageStart:64,pageEnd:64,publicationYear:null,curriculumStandardYear:null},definitionCandidates:defs,targetIds:goals.map(g=>g.atomId),
 sourceReview:{confirmedRange:true,statement:'已逐张查看物理64印59页的正文、两处想法气泡与两条交流提示。可交流自己或其他人的名字；询问、同伴回应与回家转述是不同环节，不补造成已经发生。',pages:[{page:64,visualChecked:true,statement:'已看可询问长辈、了解其他家人或名人名字，交流含义或来历，感兴趣和不理解可追问、交流后向家人转述新鲜事，重点清楚讲述与礼貌回应。'}]},
 scope:{title:'口语交际：名字里的故事',activity:true,physicalPage:64,printedPage:59,mayShareOtherNames:true,privatePersonalNameDisclosureRequired:false,realInterviewOrPeerExchangeNotAutomaticallyCompleted:true,teacherReviewed:false,published:false},
 content:{title:'名字里的故事：讲清已知，礼貌倾听，再准确转述',goals,prerequisites:[],
  activation:{prompt:'明确原创示例：小禾说“这个故事人物叫晨望，我想到早晨和希望，但我还不知道作者为何取这个名字”。哪部分是已给事实，哪部分是联想，什么还需询问？',expectedObservation:'能把人物名字、自己的联想与实际取名原因分开，不因一个字就编造家庭故事。',bridge:'介绍真实名字时也先核对了解到什么、来自谁，再选择愿意分享的部分。'},
  concept:{explanation:'名字可能有字面含义、家人的期待或具体来历，知道某个字的意思不等知道真正取名原因。可向长辈或合适照顾者询问，或了解其他人的名字；本页明确可以谈自己或他人，不强迫提供全名、家庭关系或不愿分享的经历。选择愿意交流且已有依据的信息，先说介绍对象，再讲了解到的含义或来历，补充怎样了解到，未核部分就说还不知道。名人名字的来历也要有可靠具体资料，不能凭熟悉传闻补写。听同伴时先听清，回应要联系对方实际讲的话；感兴趣或不明白可以礼貌询问，允许对方选择不谈。交流后向家人转述新了解到的事情，要区分同伴原话、自身理解与新增猜测。准备询问、示范对话、实际同伴交流和实际转述各有状态；没有发生不能由范例或自填记录替代。',points:['字义、期待和真实来历分别核对','可以选自己或其他人的名字','说明已了解信息与来源，未知保留','回应联系实际讲述，尊重不分享','交流后的转述有原讲述依据']},
  example:{situation:'原创角色示例，不是任何真实家庭采访：小禾介绍“我为故事角色取名晨望，想表达清晨向前看的愿望”；小米说“我听到你自己取了这个名字，可以再说说望指什么吗？”',steps:[
   {explanation:'小禾明确对象是原创故事人物、取名者是自己，并说出想表达什么，不把原创人物当真实家人。',board:['对象：原创角色','来源：本人创作说明','含义与来历明确']},
   {explanation:'小米先接住已听信息，再问具体不明白的望；不把问题换成对他人私事的追查。',board:['先听到什么','回应相关内容','有礼貌地追问']},
   {explanation:'示例中的后续转述应说“同伴为角色取名并解释了愿望”，不能增加真实祖辈经历；真实任务仍需真实活动。',board:['转述对应原信息','不添加未给经历','角色示例不等实际交流']},
  ],conclusion:'讲述清楚、倾听相关、转述准确需要具体信息与真实过程，示范只能帮助学习方法。'},
  visuals:[{kind:'table',title:'信息与活动状态各自保留',headers:['当前材料或阶段','可以怎样讲','还不能直接说'],rows:[['只知道名字和字义','这个字让我想到某种含义','不能确认真正取名原因'],['实际询问得到答复','某位讲述者告诉我怎样取名','不能添加对方未说的经历'],['准备同伴交流','已选愿意分享的信息和问题','不能说同伴已经回应'],['真实听到同伴介绍','转述实际了解到的新信息','不能补造对方私事或原话'],['原创角色对话示范','这是我为角色设计的说明','不能当真实采访或家庭历史']],explanation:'把信息来源和真实活动状态分开，帮助核对清楚、相关与准确，不以填满表格代实际交流。'}],
  misconceptions:[{observation:'看名字含晨就说家人一定在清晨某时取名，并补出未经询问的经历。',alternatives:['可能混字义联想与真实来历，也可能想让故事更完整。'],verification:'分别指出字典或词语能支持什么、实际讲述者提供了什么；没有答复仍待核。',correctiveFeedback:'联想可以标为可能，真实来历需要来源，不为完整故事编造家庭事实。'},
   {observation:'同伴不愿说家事，仍要求必须交全名和取名细节才算完成。',alternatives:['可能误以为只能讲本人，也可能把追问当必须回答。'],verification:'回看本页可讲其他人的名字，选择可公开或原创示例练习方法，真实任务状态另记。',correctiveFeedback:'交流应礼貌并尊重选择，可换愿意分享的对象或信息，不能把不披露等同表达能力低。'},
   {observation:'把同伴可能想表达的意义，转述成同伴家人的真实经历。',alternatives:['可能记混来源，也可能把自己的推测接进原话。'],verification:'对照实际原讲述，标明原信息、自己的理解与未知；无原记录承认回忆限制。',correctiveFeedback:'转述不添未给细节，疑问可以再问，记不清不补造成确定事实。'}],
  transfer:{scenario:'选择愿意分享且确有来源的名字资料，与真实同伴交流；条件不足时可用明确原创角色示范，但只记准备或示范。',prompt:'讲清一条已了解信息与来源，作一次相关礼貌回应；活动真实发生后，再向合适对象准确转述一条新信息。',expectedStrategy:'信息对象、来源、未知和实际过程状态清楚，不强迫披露，不伪造真实同伴响应或家庭转述。'},
  summary:{synthesis:'已了解的事情讲清楚，没核实的地方留问题。听别人时礼貌回应，讲给别人听时保留原信息与来源。',takeaways:['名字字义不等真实取名原因','交流对象可以有选择','先听清再作相关回应','转述不添未给事实','准备与真实活动分别记']},
  retention:{intervalDays:[1,3,7,14],anchor:'last_relevant_teaching_or_help',instructions:'待教师核对目标、量规和独立材料后按真实日期安排。熟悉原示例和模拟对话不自动取得未见保持资格；没有真实交流与实际录音时保留未完成，不用计划或参考音替本人证据。'},
  citations:[{page:64,quote:'把了解到的信息讲清楚。',usedFor:'concept'},{page:64,quote:'的人提出来，进一步了解。',usedFor:'example'},{page:64,quote:'你从同学的讲述里知道\n了哪些新鲜事。',usedFor:'transfer'}]},
 editorNotes:{slug:'name-story',teacherReviewed:false,automaticPublication:false,realLearnerEvidence:false,sourceBoundary:'只核当前一页，不自动完成真实采访、同伴回应或家人转述；名人来历仍须可靠资料。',privacyBoundary:'可谈其他人的名字，允许只分享愿意公开的部分；不收集家庭证明或额外身份材料。',materialStatus:'候选目标和材料，教师、结构、评分及充分保持库存均待审。'}};
const groups=[];
function add(suffix,structure,mode,criteria,rows){if(rows.length!==7)throw Error('Seven explicit probes required');groups.push({lesson:'name-story',atomId:suffix.startsWith('core:')?suffix:prefix+suffix,structure,familyProposal:'following-'+structure,familyIndependenceReviewed:false,mode,rubric:criteria.map((criterion,i)=>({criterion,weight:[0.4,0.4,0.2][i]})),goldAnchors:{acceptedExample:rows[0][1],insufficientExample:'名字好听，我已经问过大家，所有故事都是这样。',insufficientReason:'缺具体信息与来源，也没有实际交流记录，不能由任务要求补成已经发生。',alternativeAnswers:'人工核对参考；允许不同内容和不披露选择，真实过程和未完成单列。'},exercises:rows.map(([stem,answer],i)=>({id:'name-story-'+structure+'-'+(i+1),purpose:i<3?['understanding','procedure','transfer'][i]:'retention',dimension:i<3?['understanding','procedure','transfer'][i]:['understanding','procedure','transfer','understanding'][i-3],proposedIntervalDays:i<3?null:[1,3,7,14][i-3],stem,answer,analysis:answer+' 候选人工核对参考，不自动打分或认定活动已完成；示例、帮助和真实原记录分别保留。',expectedSeconds:mode==='audio_record'?240:180}))});}
add('name-clear-sharing','name-information-and-source-clear-sharing','audio_record',['对象和具体信息清楚','交代真实来源或明确原创身份','不把字义猜测变家庭事实，尊重不披露'],[
 ['录音介绍一条你愿意分享的名字含义或来历，说清对象、了解到什么和从哪里了解。可以选其他人的名字。','具体信息有来源，未知说未知；不要求全名或私事，不由字面猜测编成家庭事实。'],
 ['把只有“名字很好听”的介绍补清楚：具体哪一条信息、谁提供的、什么还未核实。录音说出。','补充对象、内容和来源，未核来历不填成确定；评价词不能代具体信息。'],
 ['为原创角色取一个名字，录音说明自己的创作理由，并明确这不是现实人物的家庭历史。','原创身份和取名理由清楚，可以练表达但不作真实采访完成。'],
 ['本次重新介绍一条已核实且愿意公开的信息，注明是否刚看过笔记或得到帮助。','本人本次声音与具体信息对应，帮助保留，旧音频和背示范不代新的独立交流证据。'],
 ['如果暂时不知道本人名字来历，怎样仍清楚表达目前已知与下一步？录音说明。','如实说未知，可选择其他有来源且愿分享的对象，不能为完成编造父母故事或认定能力低。'],
 ['给一段明确虚构的介绍：“角色雨航由我创作，希望他敢于探索”。用自己的话说清对象和来源。','说创作者本人赋予愿望，不变成现实家长真实期待；给定示例练习不当实际家庭采访。'],
 ['核对自己一次真实介绍，录音改进一处缺对象、缺来源或说得不清楚之处；没有原介绍则标准备。','原问题与改进对应，真实与准备分清，内容可信度不由表达流畅单独保证。'],
]);
add('name-polite-listening','name-related-polite-response-and-question','audio_record',['回应对应真实听到的信息','问题具体而礼貌','尊重选择，角色示范和真实同伴分开'],[
 ['给定原创示例同伴说“我给角色取名晨望，望表示向前看的愿望”。录音作一句相关回应和一个礼貌追问，标明是示范。','可先确认听到自己创作，再问愿望怎样与角色联系；不追问现实家事，示范不算真实交流。'],
 ['设计一次“我听到……，我还想了解……”的回应，说明问题来自对方哪句话。录音。','回应与具体信息有关，问题不只背套话；没有真实同伴则明确是练习。'],
 ['真实同伴愿意参加时，听其介绍再回应并追问；可录愿意公开的部分。没有合适条件就说明缺什么。','实际听众与响应可核，对方可不回答或不录；无条件保留未完成，不由自己配音补成真实活动。'],
 ['同伴说这部分不想谈，你怎样回应并换到愿意交流的信息？录一段标明身份的示范。','尊重选择，可表示理解并请对方选愿分享内容，不强迫交姓名或家庭细节。'],
 ['对方解释一个词，你仍不明白，录音提出一个更具体的澄清问题，注明实际或示例。','点明不明白哪一词或关系，礼貌核对，不反复问已明确回答的信息或贴标签。'],
 ['回看一次真实交流，指出自己的回应是否联系对方实际内容；没有记录则说明记忆限制。','以真实已听内容核对相关性，回忆与原记录分清，不编同伴原话。'],
 ['为什么“你必须全部告诉我”不合适？录音改成既相关又尊重选择的问题。','改问愿意分享的部分并允许不答，礼貌不等只加请字后仍强迫。'],
]);
add('name-new-information-retelling','name-source-faithful-new-information-retelling','audio_record',['转述有原讲述依据','原信息与自己猜测分开','准备与实际对合适对象转述分别记'],[
 ['原创示例只说“同伴给角色取名晨望，想表达向前看的愿望”。录音转述一条新信息，勿加真实家人经历。','保留原创角色和同伴创作来源，准确讲愿望，不添祖辈、出生时刻等未给事实。'],
 ['将一次实际听到且愿意转述的信息，按“谁介绍、我新知道什么、还有什么疑问”录音讲清楚。','原讲述可对应，未知留疑问；只做练习录音不自动成为已向家人转述。'],
 ['如果条件合适，向家人或合适照顾者讲一条真实交流中的新信息，再报告实际完成范围。否则只说明准备内容。','实际转述对象与信息明确，非本人选择或没有条件不伪造完成，不要求家庭证明。'],
 ['给定原信息为“我从爷爷那里了解到这个字的意思”，转述成“名字一定由爷爷取”哪里越界？录音改正。','了解字义的来源不等取名者，改回已给信息，不能将推测转成真实来历。'],
 ['回忆不清同伴说的是字义还是取名原因，怎样向家人准确表达当前状态？录音说明。','可以说尚未记清待询问，不以流畅和故事完整性补成确定；未核范围保留。'],
 ['本次转述一条新信息并指出哪部分是自己理解、哪部分来自对方。没有真实交流时使用明确示例。','来源身份与内容对应，示例不冒充真实同伴，理解不倒改对方原讲述。'],
 ['比较原信息与自己的转述，修订一个新增的未经证实细节；无原记录则只说明方法和限制。','具体删改有依据，原说法与修订分别保留，不编造过去已讲过或对方已经确认。'],
]);
add('core:chinese:contextmeaning','name-word-meaning-and-actual-origin','short_answer',['字义和当前语境相容','说明所用线索或工具','字义、愿望和实际来历分别核对'],[
 ['名字中有“晨”，能据字义确定本人一定清晨出生吗？分别写字义与仍需核实的来历。','晨可联系早晨，出生时刻与实际取名原因不能单由字义得出，需真实来源。'],
 ['“含义”和“来历”有什么区别？用明确虚构的名字示例说明。','含义是所表达意思，来历涉及为何怎样命名；原创例子标明不作真实家庭史。'],
 ['原创角色名“雨航”，创作者说想表达雨中继续前行。解释当前航的联系，不能因此推定现实人物职业。','联系行进或航行的联想与创作说明，现实职业未知，不从字面认定。'],
 ['只查到一个字的字典解释，下一步怎样核对真实名字故事？','字典支持字义，需合适讲述者或可靠材料核实具体来历；没问到仍未知。'],
 ['“也许饱含期待”能改成每一个名字都已证明有同一种期待吗？说明范围。','不能，也许保留可能与差异，需具体来源，不推每人全部情况一样。'],
 ['“新鲜事”在交流后转述的任务里是否必须是从未有人知道的大事？','指本人新了解到的有趣信息等，联系同伴讲述理解，不等世界首次发现或必须夸大。'],
 ['选一个愿意交流的名字字词，给当前解释、所用依据和仍不能确定的信息。','解释有语境或工具支持，真实取名原因仍单独核实，不由名字推家庭身份经历。'],
]);
add('core:chinese:detail-evidence','name-claim-source-and-activity-range','short_answer',['信息有具体来源','已知猜测与未知分开','示例计划和真实交流不相互替代'],[
 ['只知道名字字义，能说已经问过长辈并确认来历吗？怎样准确记录？','不能，分别记录已查字义、未询问或未确认，任务要求不能补成已发生经历。'],
 ['同伴不愿分享本人名字，能否换其他有来源且愿意交流的名字？依据当前页说明。','可以，本页明确可以关于自己也可以其他人的名字，不以拒绝披露认定不会表达。'],
 ['给定原创卡“我计划明天问家人”，分一条已发生和一条未发生的事。','已制定计划，询问和答复尚未发生，不能把明日计划当已知家人故事。'],
 ['某名人的名字来历听起来很熟悉，能不核来源就当事实介绍吗？还需什么？','不能，需具体可靠资料及其范围；熟悉传闻不等核实，不虚构出处。'],
 ['只有自己录的两人配音，能标真实同伴交流与对方回应已完成吗？','不能，只是角色示范，真实同伴和回应需实际过程；示范可练方法但不替真人记录。'],
 ['原讲述未说出生地点，转述时加上一个地点使故事完整，为什么不准确？','新增未经证实细节改变事实范围，应删除或清楚标待核，不能由完整性替来源。'],
 ['列当前一条有来源的信息、一个自己的猜测和一项尚未完成的交流环节，说明后续怎样核查。','三项身份清楚，证据与结论对应；真实完成需要实际过程，不自填同伴或家人响应。'],
]);
const file='resources/curriculum/source-lessons/chinese-g3-name-story-v1.json',bytes=Buffer.from(JSON.stringify(draft,null,2)+'\n');fs.writeFileSync(path.join(root,file),bytes);
const bundle={format:'source-following-original-materials-v1',status:'editorial_candidate',sourceLessons:[{lesson:'name-story',path:file,sha256:sha(bytes),source:draft.source}],teacherReviewed:false,targetAlignmentReviewed:false,scoringReviewed:false,familyIndependenceReviewed:false,automaticPublication:false,reservePolicy:'每目标每间隔仅一份拟议样题。名字字义与实际来历、准备/示范/真实采访/同伴回应/转述分别记录，保护不披露选择。未见结构、评分与充分库存仍待审。',groups};
fs.writeFileSync(path.join(root,'resources/curriculum/source-lesson-materials/chinese-g3-name-story-v1.json'),JSON.stringify(bundle,null,2)+'\n');console.log(JSON.stringify({drafts:1,targets:5,newDefinitions:3,questions:35,teacherReviewed:false,published:false,learnerEvidenceCreated:false}));

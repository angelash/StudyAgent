// Original teaching and unreviewed probes. The textbook supplies only beginnings
// of its three endings; this file never fills in unverified author endings.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),bookId='archive-book:chinese-g3-upper-02915a7db6517258',prefix='source:chinese:g3:02915a7d:',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const definitions=[
 ['dog-reading','小狗课16字语境识读','结合词语识读吗讨厌怒批访担压差默模中弹疯汪搞16字','本人当前声音覆盖16字；干吗、担保、压根、差不多、模仿、打中、子弹按当前语境核对，不添本课写字表','识字与阅读'],
 ['dog-cause','梳理学叫与误认的因果','联系小狗两次学叫、练习和他者反应梳理故事','区分先后与原因，练习后学得像不等一开始就会，误认须联系具体角色所听所见','叙事阅读'],
 ['dog-perspective','区分角色所知与误认','比较小狗狐狸和猎人在同一事件中知道与不知道什么','狐狸误当公鸡、猎人误当杜鹃、小狗以为猎人发疯分别归属角色，不把角色想法当全知事实或学生标签','文学阅读'],
 ['dog-prediction','依据结局开头预测并核对范围','从三种结局开头提出可能、说明依据并在实际后文出现后核对','母牛、农民、汪汪三种开头分清，保留原答与曝光；未核作者完整结局时不伪造比对完成，合理不等必须猜中','预测阅读'],
 ['dog-story-sharing','为同伴选择陌生故事并停读交流','选择同伴不熟悉的实际故事，合适停读并倾听预测理由','标明实际版本和已读范围，停在未给后文处，保留同伴真实预测与后续核对；独白或已熟故事不充当实际同伴活动','口语与阅读'],
].map(([suffix,name,objective,successCriterion,strand])=>({id:prefix+suffix,version:1,name,subject:'chinese',grade:3,term:'upper',strand,objective,successCriterion,prerequisiteIds:[],curriculumVersion:'source-original-02915a7d-v1',status:'draft'}));
const core=[{atomId:'core:chinese:contextmeaning',objective:'联系当前词句语境解释并说明方法',successCriterion:'具体语境支持当前解释，词的另一读音或角色判断不直接当普遍事实'},
 {atomId:'core:chinese:detail-evidence',objective:'区分当前原文、角色判断、预测与未知',successCriterion:'结论有具体依据与范围，原预测不后改，未核实的三种完整结局保留待补'}];
const notes=[
 '已看罗大里作品、沈萼梅刘锡荣译且选文有改动，略读开头小狗不会叫和他者批评，不把角色说的缺陷用于学生贴标签。',
 '已看小公鸡同情教叫、三次初试和之后勤练，狐狸把叫声当公鸡来猎食，后误以为设圈套并嘲笑。',
 '已看小狗委屈离开、小杜鹃同情和教叫，角色语气及插图按实际范围看，不添加动物训练要求。',
 '已看一个星期后学得不错、猎人误认杜鹃开枪但未打中，小狗以为猎人发疯，按视角区分信息。',
 '已看第一结局母牛和第二结局农民的开头与省略号，青草医病为角色话语，不当医学或真实动物饮食任务。',
 '已看第三结局汪汪开头与省略号、三结局预测理由及听老师读后比对、喜欢内容交流与给陌生故事停读、16识字无写字表。',
];
const goals=[...definitions.map(d=>({atomId:d.id,objective:d.objective,successCriterion:d.successCriterion})),...core].map((g,i)=>({id:'goal-'+(i+1),...g}));
const draft={format:'source-original-lesson-draft-v1',status:'draft_needs_materials_and_review',source:{bookId,lessonId:bookId+':unit4:entry3',sourceSha256:'02915a7db6517258434d370430bbf464a1dac6e17df97b90d707dc4ecf5cfedf',pageStart:58,pageEnd:63,publicationYear:null,curriculumStandardYear:null},definitionCandidates:definitions,targetIds:goals.map(g=>g.atomId),
 sourceReview:{confirmedRange:true,statement:'当前物理58至63页逐张查看，核对作者译者、略读提示、正文插图、三结局开头和识字表；教材外完整作者结局尚未核实，不以熟悉版本或续写代填。',pages:notes.map((statement,i)=>({page:58+i,visualChecked:true,statement}))},
 scope:{title:'小狗学叫',author:'意大利罗大里',translators:['沈萼梅','刘锡荣'],textbookAdapted:true,skim:true,recognitionCharacters:['吗','讨','厌','怒','批','访','担','压','差','默','模','中','弹','疯','汪','搞'],writingCharacters:[],fullTextRecitationRequired:false,endingBeginningsOnly:true,fullAuthorOriginalEndingsVerified:false,fullOriginalComparisonPending:true,teacherReviewed:false,published:false},
 content:{title:'小狗学叫：分清各自所知，用开头支持可能',goals,prerequisites:[],
  activation:{prompt:'原创前卡：小鸭在门外听见熟悉的铃声，猜是送书的人；开门却看见带铃铛的纸车。先分别说听到什么、猜了什么、后来才知道什么。',expectedObservation:'能区分声音线索、角色推测与后来的真实信息，不把一次误认说成角色所有时候都笨。',bridge:'小狗学叫里，不同角色听到声音会产生不同判断；预测结局也需要保留当时知道的范围。'},
  concept:{explanation:'小狗起初不会叫，故事里其他角色对此有不同反应。小公鸡同情并教它，最初三次没成功，小狗继续练习才学得逼真；狐狸听到后当作公鸡前来猎食，看见小狗又误以为是圈套并嘲笑。小杜鹃后来也教它，一个星期后小狗学得不错；猎人误把声音当杜鹃而开枪，没有打中，小狗却从自己的角度以为猎人发疯。梳理时不仅列先后，还说明每人听到什么、想了什么，不能把角色误会变成作者证明的全知事实，也不把“缺陷”等故事用语用于给孩子贴标签。教材给出三种结局开头：母牛教哞、碰到农民、听见汪汪。它们都在省略号处停止，可以据已有情节和新开头提出不同可能，却还不能声称三种完整作者结局已经核对。先保留原预测与理由，等可靠全文或老师实际读出的准确后文出现再比对；已经读过或听过要如实记曝光。交流喜欢内容要落到具体片段和理由。给同伴读陌生故事则要有真实同伴与实际书，停在后文尚未给出的位置，让其说理由，再继续核对。',points:['练习过程与最终学会分开','角色的听见、判断与事实分开','三种结局只有开头，全文来源待补','预测理由、原答与后文核对分别保留','熟悉原篇与陌生停读活动资格分清']},
  example:{situation:'明确原创三卡：先给小鸭听铃声，保留示例预测“可能送书人到了”；后卡才给带铃纸车；最后讨论小鸭为什么猜错。示例预测不是学生本人首答，也不是小狗原作结局。',steps:[
   {explanation:'列当前已知与还没看见的信息，声音只提供可能。',board:['已知：听到铃声','未知：门外是谁','示例：可能送书人']},
   {explanation:'后卡出现后保留原预测，写出实际纸车和新信息，不把原记录改成早知。',board:['原预测不覆盖','后文：带铃纸车','更新：声音来源不同']},
   {explanation:'误认说明当时信息有限，不能由一次结果推定角色所有时候无能力。',board:['解释局部条件','不同视角各有范围','不贴永久标签']},
  ],conclusion:'有依据仍可能与后文不同，核对要有实际后文和原记录；示例学习不能冒充本人未见首答。'},
  visuals:[{kind:'table',title:'同一声音，不同角色的信息',headers:['角色与当前线索','角色作出的判断','读者需要分清'],rows:[['狐狸听见公鸡般叫声','以为附近有公鸡，见狗后又猜圈套','两次判断都不是完整事实'],['猎人听到杜鹃般叫声','把叫声来源当杜鹃','原文没打中，小狗不是知情模仿诱骗'],['小狗听见枪声并逃跑','以为猎人发疯，对狗开枪','小狗不知猎人先前误认'],['三种结局的新开头','可提出后续可能','省略号后完整作者内容仍未核实']],explanation:'用线索和所知范围解释角色反应，避免把角色误认与全篇事实混同；表格不代填三种完整结局。'}],
  misconceptions:[{observation:'把小狗以为猎人发疯，改写成作者确认猎人已经发疯。',alternatives:['可能没区分人物视角，也可能只记一句强烈判断。'],verification:'并列猎人听到的声音与小狗知道的信息，核对判断由谁提出。',correctiveFeedback:'给判断保留角色身份和证据，不依据故事一句话给现实人物作医学判断。'},
   {observation:'把碰到农民等开头，照熟悉记忆填成已经核实的作者全文。',alternatives:['可能混开头与全文，也可能把预测或续写误记成原作。'],verification:'指出实际原页到哪里、后文具体来源在哪里；无可靠原文保持待补。',correctiveFeedback:'可以提出有据可能或标明原创续写，完整作者结局的核对尚未完成。'},
   {observation:'独自复述熟悉故事后，声称已完成给陌生同伴停读预测。',alternatives:['可能忽略真实听众与曝光条件，也可能只完成活动准备。'],verification:'核对实际书名版本、同伴熟悉程度、停读位置和真实预测记录。',correctiveFeedback:'准备、独白、真实活动分别记，未发生的交流不补造。'}],
  transfer:{scenario:'用一段真正未见的原创误认故事练习，或拿实际陌生故事向同伴停读；没有合适材料与同伴时只做明确标注的准备。',prompt:'分别列事实、角色判断和自己的预测。保留原答与理由，实际取得后文后核对；交流一处喜欢的内容并说明具体理由。',expectedStrategy:'角色所知和原文范围准确，预测有据、更新不覆盖，未核完整作者结局与未发生同伴活动保留未完成。'},
  summary:{synthesis:'角色可能因为只知道一部分而误认，读者要给每个判断保留主人。三种开头支持预测，完整结局仍需真实来源；分享故事要让真正未见后文的同伴有机会说理由。',takeaways:['先后与原因分别说明','角色想法不等作者确认','有据预测允许不同','原答和实际核对分别保留','陌生故事活动需要实际对象与过程']},
  retention:{intervalDays:[1,3,7,14],anchor:'last_relevant_teaching_or_help',instructions:'结构、评分与充分未见材料审核后按真实日期安排；已读原篇或给定示例不重新取得未见资格，模拟间隔和计划不能作为真人保持效果。'},
  citations:[{page:63,quote:'故事的几种结局可能是怎样的？说说你的理由。然后听老师读',usedFor:'concept'},{page:63,quote:'你喜欢故事的哪些内容？和同学交流。',usedFor:'transfer'},{page:63,quote:'地方停下来，让他们猜猜后面可能会发生什么。',usedFor:'example'}]},
 editorNotes:{slug:'dog',teacherReviewed:false,automaticPublication:false,realLearnerEvidence:false,materialStatus:'原创候选，目标对齐、独立结构、评分与充分库存尚需审核。',sourceBoundary:'三种结局仅开头，完整作者结局未核，不用熟悉印象或原创续写代原文。',scienceBoundary:'不把童话转成动物训练、开枪狩猎或医疗诊断活动。'}};
const groups=[];
function add(suffix,structure,mode,criteria,rows){if(rows.length!==7)throw Error('Seven explicit probes required');groups.push({lesson:'dog',atomId:suffix.startsWith('core:')?suffix:prefix+suffix,structure,familyProposal:'following-'+structure,familyIndependenceReviewed:false,mode,rubric:criteria.map((criterion,i)=>({criterion,weight:[0.4,0.4,0.2][i]})),goldAnchors:{acceptedExample:rows[0][1],insufficientExample:'我早就知道，所有结局都和我想的一样。',insufficientReason:'缺当前线索与真实原答，未核全文也不能宣称比对完成。',alternativeAnswers:'人工核对参考，允许有据不同；真实首答、帮助和未完成需分别留证。'},exercises:rows.map(([stem,answer],i)=>({id:'dog-'+structure+'-'+(i+1),purpose:i<3?['understanding','procedure','transfer'][i]:'retention',dimension:i<3?['understanding','procedure','transfer'][i]:['understanding','procedure','transfer','understanding'][i-3],proposedIntervalDays:i<3?null:[1,3,7,14][i-3],stem,answer,analysis:answer+' 仅候选人工参考；已见材料和实际帮助需保留，不自动评分或批准独立题族。',expectedSeconds:mode==='audio_record'?240:180}))});}
add('dog-reading','dog-sixteen-contextual-reading','audio_record',['本人当前声音覆盖16目标字','多音字按当前词语核对','不加写字表，不以拼音选择代实际发音'],[
 ['录音读“干吗、讨厌、发怒、批评、来访、担保、压根、差不多、沉默、模仿、打中、子弹、发疯、汪汪、搞清”，说一处需核对的读音。','覆盖16字，干吗má、担保dān、压根yà、差不多chà、模仿mó、打中zhòng、子弹dàn；实际音频逐字听，词数不等字数。'],
 ['先读“压根、模仿、打中、子弹”，再补其他识字表目标词录音。','按当前语境核对yà、mó、zhòng、dàn，不能读对四词便推全16字已会。'],
 ['新句“来访的人搞清了误会，沉默的小狗没有发怒”。录音读出，再补齐识字表未覆盖目标词。','新句目标实际听，另补吗讨厌批担压差模中弹疯汪等未覆盖字；新句未读部分不能推断已会。'],
 ['本次给16字各配合适词语读出，注明刚看或听过的帮助。','本人本次声音和语境相容，帮助保留，旧录音或原词重复不自动成为未见保持材料。'],
 ['分别读“打中”和“中间”，“子弹”和“弹琴”，说明本课使用哪种语境。','打中zhòng、子弹dàn与另一词读法分清；比较不增加本课写字表。'],
 ['录音读全表中自己仍不稳的词，再补其余目标，保留订正前后声音。','实际覆盖与订正分别记录，不只用自报会读或文字说明代声音。'],
 ['按当前词组读全16字，指出一次核对依据；无本次录音时如实记未完成。','全表实际音频与语境证据对应，方法说明不替声音，未完成不由示范音补为本人。'],
]);
add('dog-cause','dog-learning-and-mistaken-cause','short_answer',['情节顺序与具体原因都清楚','练习过程和结果不混','不同误认各有原文依据'],[
 ['小狗为什么在学得像公鸡后仍很委屈？连接狐狸先听到、后看到和说的话解释。','狐狸先误当公鸡来猎食，见狗后又以为圈套并嘲笑；小狗学得像与得到嘲笑并存。'],
 ['用三步说明小公鸡教、小狗初试和后来练习的关系，不把第一次就叫得好当事实。','小公鸡示范、三次初试不成功、持续练习后学得逼真；结果不覆盖初期过程。'],
 ['原创卡：小猫练吹叶片，邻居误以为鸟来了。列一个学习原因和一个误认原因。','练习可解释声音学得像，邻居听相似声音而未见来源解释误认；先后与原因分清。'],
 ['小狗学杜鹃一个星期后发生什么？猎人为何开枪，结果是否打中？','学得不错，猎人误当杜鹃；没有打中，不把枪声或逃跑改成已经受伤。'],
 ['把“杜鹃教了，小狗被猎人当成杜鹃”补成含练习与信息条件的说明。','交代练习后叫得像，猎人依据声音误认，不把教一次必立即成功当规律。'],
 ['只列“狐狸出现，猎人出现”能说明两次事件原因吗？补出各自判断。','不足，狐狸先当公鸡，猎人当杜鹃，依据相似声音和所见范围分别说明。'],
 ['选择一处学习或误认情节，写事情、原因、结果，再标仍不知道的信息。','具体链条有原文依据，未知不填；原篇回顾不等新的独立题族。'],
]);
add('dog-perspective','dog-character-information-range','short_answer',['给判断标明角色','所听所见与未知分别列','不把局部误认或话语变永久标签'],[
 ['“猎人发疯了”是谁从什么信息作出的判断？与读者已知有什么不同？','是小狗听见枪声后的想法；读者知道猎人先把声音误认杜鹃，不是作者确诊猎人。'],
 ['分两栏列狐狸听到叫声时和看见狗后各想了什么。两次判断都是事实吗？','先以为公鸡，后猜圈套，两者都是角色判断；小狗只是学叫不能据此认定设圈套。'],
 ['原创卡：门内人听急敲以为起火，门外人只是送回钥匙。区分两人的所知与事实。','急敲是真线索，起火是内人推测，门外送钥匙是给定事实；不能把推测作确认。'],
 ['猎人把声音当杜鹃，小狗却以为有人对狗开枪，两种认识为何不同？','各自信息范围不同，小狗未获猎人先前误认，猎人未见真实声源。'],
 ['故事中有人说小狗有缺陷，能直接拿来称不会某项技能的同学吗？','不能，角色话语有叙事身份，现实同学表现需具体支持，不用单项不会贴永久标签。'],
 ['小公鸡和杜鹃怎样回应小狗？用具体行为说明而非推定所有动物都一样。','两者同情并教叫是具体行为，不能由两例推所有角色或现实动物行为规律。'],
 ['把一处未标角色的判断改写成“谁根据什么以为怎样”，保留未知。','主体、线索和可能明确，不由强烈措辞冒充全知事实或医学诊断。'],
]);
add('dog-prediction','dog-ending-beginnings-and-original-prediction','short_answer',['根据实际开头与前文提出可能','原答和后文核对分别留','三种完整作者结局未核就不填完成'],[
 ['第一结局给母牛教哞，提出两种可能并说明线索。未给完整结局，不判断自己已猜中。','可能继续模仿或发现这种声音仍与自己不同，依据前文学叫与新示范；仅可能，完整原作待核。'],
 ['第二结局只给碰上农民，哪些已知、哪些还未知？提出一个保留条件的预测。','已知遇农民，农民行为态度和后续未知；可猜得到帮助但需说明是假设，不能补成已发生。'],
 ['原创开头：木偶听见与自己哨声相近的声音，尚未见声源。提出可能并说明不能确定什么。','可猜同类工具或其他发声者，但声源身份未知，不能只凭相似声音确定唯一结果。'],
 ['第三结局的小狗听到汪汪，却不知什么动物，怎样分别写读者经验与角色当时所知？','读者可联系狗叫经验，小狗当时仍不知；后续完整原文未核，不能把常识填成作者全部结局。'],
 ['给定示例预测为继续模仿母牛，若以后实际后文不同，应怎样记录？未有后文时能填核对已完成吗？','保留示例身份和原预测，拿真实后文比较更新；没有后文则待补，示例不是本人首答。'],
 ['已经听老师讲完，再把结局写对是否证明最初未见预测正确？需要什么记录？','不能，需要真实先前原答、当时已读范围及帮助曝光；后来的正确理解不倒改原记录。'],
 ['列目前三种结局各自开头与仍待补的来源，再说明怎样取得后文后核对。','母牛、农民、汪汪开头分清，完整作者结局需可靠版本或老师实际提供；当前不伪造全文与完成。'],
]);
add('dog-story-sharing','actual-unfamiliar-story-pause-and-exchange','audio_record',['实际版本范围与同伴熟悉程度清楚','停在后文尚未给处并听理由','真实过程与准备、示例不混'],[
 ['录音说明你喜欢本课哪一处内容，给具体片段和理由，不只说很好看。','片段可定位，理由联系行动、反转或表达，允许不同喜好，不强迫喜欢某一结局。'],
 ['为实际同伴选一本其不熟悉的故事，说明书名版本和拟停读点；还未活动则标准备。','有真实可读版本和对熟悉程度的核实，停点不提前泄露后文；计划不充已发生交流。'],
 ['若有真实合适同伴，读陌生故事在合适处停下，录下其预测理由再继续核对；无条件则说明缺什么。','真实同伴原答与后文顺序可核，音频注意实际对象；无同伴只记准备，不以自己替答。'],
 ['同伴说已经读过选的故事，应怎样调整？录音说明你实际做了什么。','保留已读曝光，换真正陌生材料或仅交流已读理解，不把复述当新未见预测。'],
 ['同伴有依据但猜得不同，如何回应？用清楚标示的角色示范录音，不冒充真实同伴活动。','先倾听线索联系，后文实际出现再比对；角色演示标明，仅示范不算真实活动完成。'],
 ['回顾一次实际停读：说实际范围、停点、同伴预测和后文；没有原记录则明确回忆限制。','过程信息具体，原记录与回忆分清，不能补造同伴原话或虚构已完成。'],
 ['本次说明喜欢内容与理由，再报告陌生故事分享目前准备或已完成到哪一步。','两任务分别报告，喜好不等分享完成，实际听众和已读范围如实记录，不虚增次数。'],
]);
add('core:chinese:contextmeaning','dog-context-supported-word-meaning','short_answer',['解释符合当前语境','指出具体线索如何起作用','不同义项和夸张不直接推普遍事实'],[
 ['“百发百中”怎样联系猎人的本领，后面没有打中是否该改成已打中？','夸说平常射得准，当前事件明确没打中，不能用成语覆盖具体结果。'],
 ['“压根”在不会叫的表达中起什么作用？读法和意思怎样联系当前语境？','表示根本，当前读yà，非把东西压住的动作；语境决定当前含义与读法。'],
 ['原创句“他沉默一会儿才解释，并不是没有想法”。解释沉默，指出不能推出什么。','一段时间不说话，不证明没思考或永久不会交流，后句限制推断。'],
 ['“模仿”和已经知道所模仿动物的全部生活一样吗？联系小狗学叫说明。','模仿当前叫声，不等掌握全部生活或角色知识，不能扩大对象范围。'],
 ['“诧异”怎样联系小狗听到枪声时的信息？是否证明猎人实际发疯？','小狗惊讶与不知误认原因相连，不是对猎人的医学事实确认。'],
 ['“安详地吃草”描述母牛什么状态？能据此给小狗安排吃草治病吗？','当前平静从容状态，不是医学或喂养处方，角色话语不转成真实活动要求。'],
 ['选一个本课词，给当前解释、线索和不合当前语境的一种理解。','解释与具体词句相容，方法真正支持，不能只列词典或套成全部语境同义同音。'],
]);
add('core:chinese:detail-evidence','dog-claim-and-source-range','short_answer',['事实与推测身份准确','具体依据支持结论范围','完整结局和真人活动缺口不代填'],[
 ['看到三种结局标题就能说三种完整作者结局已读吗？准确说法是什么？','不能，当前原页只有开头与省略号，完整结局来源和比对仍待补。'],
 ['听到枪声、逃跑能证明小狗已受枪伤吗？核对原文结果。','不能，原文没有打中；不得由紧张行为补造受伤事实。'],
 ['原创卡只有门外声音，没有给人物。分别写一个已知、一个可能和一个未知。','声音已给，人物身份可猜但未知，三者身份不同，不把猜测填为原文事实。'],
 ['作者和译者能凭熟悉版本填写任溶溶吗？本次准确原页提供谁？','不能套熟悉版本，本原件为意大利罗大里、沈萼梅刘锡荣译且选文有改动。'],
 ['小狗练一星期后叫得像，是否证明任何技能人人一星期都能掌握？','不能，故事具体过程不构成普遍学习时限，现实技能与个体条件另核。'],
 ['只有停读方案没有真实同伴响应，能否标实际交流完成？怎样记录？','不能，准备与已发生分别记，同伴和响应不足保留未完成，不自造记录。'],
 ['将自己的预测、一处原文事实和一项待补来源分别写出，说明怎样进一步核对。','范围准确有依据，三种完整作者结局待可靠来源，不以预测、记忆或续写代填。'],
]);
const lessonPath='resources/curriculum/source-lessons/chinese-g3-dog-v1.json',bytes=Buffer.from(JSON.stringify(draft,null,2)+'\n');fs.writeFileSync(path.join(root,lessonPath),bytes);
const bundle={format:'source-following-original-materials-v1',status:'editorial_candidate',sourceLessons:[{lesson:'dog',path:lessonPath,sha256:sha(bytes),source:draft.source}],teacherReviewed:false,targetAlignmentReviewed:false,scoringReviewed:false,familyIndependenceReviewed:false,automaticPublication:false,reservePolicy:'每目标每间隔只有一份拟议样题，原篇与示例曝光不重新取得独立资格。三种完整作者结局未核；真实同伴与原预测需实际记录。未构成充分库存。',groups};
fs.writeFileSync(path.join(root,'resources/curriculum/source-lesson-materials/chinese-g3-dog-v1.json'),JSON.stringify(bundle,null,2)+'\n');
console.log(JSON.stringify({drafts:1,targets:goals.length,newDefinitions:definitions.length,questions:groups.reduce((n,g)=>n+g.exercises.length,0),teacherReviewed:false,fullAuthorOriginalEndingsVerified:false,published:false}));

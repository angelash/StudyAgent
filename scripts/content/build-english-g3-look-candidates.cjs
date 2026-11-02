const {createKit}=require('./exact-source-candidate-kit.cjs');
const {draft,group,write}=createKit({bookId:'archive-book:english-g3-upper-349949e1df2ad88b',prefix:'source:english:g3:349949e1:',filePrefix:'english-g3-349949e1'});
const definitions=[
 ['look-greet','问候并按当前角色回应','分清How are you问候与姓名问题，并在明确角色中实际说出回应','问候功能及说话者相符，角色fine/well回应不替本人真实感受，须听实际录音核可理解程度','口语交际'],
 ['look-parts','身体词与当前指称对应','认读十一身体词并区分head/face、arm/hand、leg/foot及my/your','face/ear/eye/nose/mouth与arm/hand/head/body/leg/foot按当前词义对应，my指说话者、your指受话者，不由词牌数量推本人身体事实','词义与指称'],
 ['look-actions','按身体词核动作对象','在明确文字指令中区分open/close/touch及clap/wave/shake/stamp所指','动作和部位相符，实际作品与过程分开，静图不证明拍挥摇跺全过程，无声音不认听辨','指令与行动'],
 ['look-letters','Ee至Ii大小写与本人书写','配对并实际书写Ee/Ff/Gg/Hh/Ii，区分字母身份和字体字形','大小写对应且本人字形可辨，字体差异不冒认新字母，完成图不独证笔顺或发音','字母书写'],
 ['look-sounds','按本页示例试读Ee至Ii相关词','录本人读egg/elephant、face/foot、green/gift、hand/hi、ice/ice cream的当前词例','当前完整词发声供听核，字母名与词中声音分别学；本页i是ice示例不擅换短i，示例不推全部读音规则','具体词与语音'],
 ['look-proposal','制作提议、步骤和实际作品分开','理解Let’s make邀请及明确first/then顺序，区分想做、同意、步骤与已完成','Great回应或步骤文字不当作品完成；按给定先后理解，故事拟人不代真实物体自行活动或本人制作','语篇与行动'],
];
const lesson=draft({slug:'look',lessonId:'archive-book:english-g3-upper-349949e1df2ad88b:unit3:entry1',start:27,end:36,definitions,
 scope:{title:'Unit 3 Look at me!',directoryGranularity:'unit',printedPages:[22,31],publicationEdition:'人教PEP三年级起点独立原件；具体出版版次未载',curriculumStandardYear:2011,allPageActivitiesDelivered:false,authenticListeningStimuliIncluded:false,realFaceUploadRequired:false},
 sourceReview:{confirmedRange:true,statement:'物理27至36页已逐张读图，核问候、十一身体词与动作、Ee至Ii示例和写说、读词计数、听音、歌曲及木偶故事。i明确ice/ice cream，未获取音频不推听音答案，原图歌词不复制。',pages:[
 {page:27,visualChecked:true,statement:'Unit Three印刷22，How are you与I’m fine为给定角色示例，不代学生本人实际状态。'},
 {page:28,visualChecked:true,statement:'跨页右图印刷23，Look at me、鼻子与Very well回应，人物特征和角色语句不代本人事实。'},
 {page:29,visualChecked:true,statement:'A部分问候回应及上学邀请，问句功能、当前说话者、回应和实际会面分清。'},
 {page:30,visualChecked:true,statement:'face/ear/eye/nose/mouth与闭眼张口触摸指令，my/your对象和动作实际发生分别核。'},
 {page:31,visualChecked:true,statement:'Ee至Ii与egg/elephant、face/foot、green/gift、hand/hi、ice/ice cream；i不是短i示例，字形写说与听圈分开。'},
 {page:32,visualChecked:true,statement:'B问候Very well、木偶制作邀请与Great；提议、答应和实际制作不等同。'},
 {page:33,visualChecked:true,statement:'arm/hand/head/body/leg/foot六词和拍挥摇跺指令，模型部分、词义和连续动作分别核。'},
 {page:34,visualChecked:true,statement:'找字母和完整身体词计数，不把词牌数当本人身体部位数量，字体差异不改变完整词身份。'},
 {page:35,visualChecked:true,statement:'听音编号、泳池图词匹配及歌曲扩展，无音频不推编号，肩膝趾不统一追加核心默写。'},
 {page:36,visualChecked:true,statement:'木偶故事按head后body及arm/leg步骤，提议、邀请、成品与虚构自主动作分开，不代本人制作。'}]},
 content:{title:'Look at me：听清在问什么，看准指的是谁',
 activation:{prompt:'原创角色Lin问How are you?，Kai却只回答My name’s Kai.。他有说出名字，但这句话回应的是同一种问题吗？',expectedObservation:'姓名回答和问候回应不同；先理解当前问句，再按给定角色或自己愿意表达的情况说。',bridge:'从短问候开始，再用身体词和动作指令练习听、说、读、做；每项都先看当前说话者与所指对象。'},
 concept:{explanation:'How are you?在本课是日常问候。角色卡若说明Kai感觉很好，可以练I’m fine, thank you.或Very well, thanks.；两句都是回应近况，不是报姓名。My name’s Kai.主要介绍名字，不能替每一种问句。角色里的fine不说明学生本人此刻一定很好；本人可以只做角色练习，不必把真实感受填成课本示例。先自己实际说，再听录音是否可理解，书面参考不替本人开口。\n这一组先认识face脸、ear耳朵、eye眼睛、nose鼻子、mouth嘴，再认识arm胳膊、hand手、head头、body身体、leg腿、foot脚。head指头，face指头部前面的脸，不能因为位置相近就互换；arm与hand、leg与foot也不是同一个部位。body在当前木偶分部图里可指中间躯干部位，日常也可指整个身体，要看当前所指，不把所有情境都硬拆成同一张图。词牌写了几次hand，问的是词出现次数，不是学生本人有几只手。\nThis is my face里my指当前说话者自己的脸。甲对乙说Touch your head，your指这句话受话者乙；换乙对甲说，所指随当前角色改变。Look at me要求看说话者，Look at my nose把注意指向说话者的鼻子。可以用标清角色的原创木偶图练指称，不需要提供本人面孔照片；图上甲乙不是真人身份，不能拿角色图代本人已经完成动作。\n指令的动作和对象一起看。Open your mouth是张嘴，Close your eyes是闭眼，Touch your nose是触摸鼻子；不是因为都在脸部就能随便换对象。Clap your hands拍手，Wave your arms挥胳膊，Shake your legs摇腿，Shake your body摇身体，Stamp your foot跺脚，词义各不同。读懂一句文字可以先指出它要求什么，再在适合自己的条件下选择是否实际做或用木偶示意。连续的拍、挥、摇、跺需要实际观察过程，单张手摆开的图不能证明已经拍过；没有声音时，当前任务只先核文字理解。\nEe、Ff、Gg、Hh、Ii是本组五对大小写。大写和小写可以形状不同而仍属同一字母，字体细节也可不同；看清样本后自己写，完成图能看字形，却不能独自证明写的顺序或发音。字母名和词里的声音分别听。本页用egg/elephant、face/foot、green/gift、hand/hi及ice/ice cream作具体例子，i这里是ice的例子，不能换成另一个短i示例再声称原件如此。两个例词有共同字母，也不要求其余每个音都相同；更不能由green和gift就断定所有g词都读相同声音。\nLet’s make a puppet!是在邀请一起做木偶，Great可以表示赞同，但想做或同意不等已经做完。若原创步骤明确first先画头、then再画身体，就按本次说明理解先后；另给一种制作方法时再看新说明，不把一种顺序当所有手工唯一办法。本人实际完成的是标注图，就如实说画了图；没有做成可活动木偶，不把图当已完成木偶。虚构故事里木偶告别或移动属于故事情节，不能推真实物体会自己说话。以后换角色、词卡和指令，先自己尝试，实际示范和帮助如实说明。',
 points:['How are you不是询问姓名','角色fine不替本人实际感受','head/face、arm/hand、leg/foot分清','my与your随当前说话角色确定','动作和对象一起核','文字、声音和本人实际行动分开','Ee至Ii看样本后自己写','本页i用ice示例，提议不等制作完成']},
 example:{situation:'原创纸偶图标甲为Lin、乙为Kai；Lin问候Kai，然后要求Kai把自己的纸偶头部圈出来。纸偶只用于示意。',steps:[
 {explanation:'Lin说How are you?，卡片明确Kai感觉很好，Kai可说I’m fine, thank you.。这次问候不要求报姓名，也不改变学生本人感受。',board:['Lin → How are you?','Kai角色 → I’m fine, thank you.','角色回答不替本人真实状态']},
 {explanation:'Lin对Kai说Touch your head，your指受话者Kai，不指Lin。若当前选择纸偶示意，可圈Kai纸偶的head，并说明这是示意图。',board:['说话者：Lin','受话者：Kai','head不是只画face的一个局部']},
 {explanation:'本人先理解文字，再按实际条件决定是否做动作。圈图说明选择位置，不能把纸偶图写成自己已经听音并完成真实触摸。',board:['文字理解 → 指明对象','纸偶图 → 示意范围','实际声音与动作另外核']}
 ],conclusion:'先核问句、当前角色和部位，再说或示意。参考对话与纸偶图不代真实同伴交流或本人连续动作。'},
 visuals:[{kind:'table',title:'十一身体词：相近部位也要分别指',headers:['词或词组','这组任务中的意思','要分清什么'],rows:[['face / head','脸 / 头','face是头部的脸，不把两词任意互换'],['ear / eye / nose / mouth','耳 / 眼 / 鼻 / 嘴','按当前完整词和对象，不因同在脸部就混'],['arm / hand','胳膊 / 手','整体相连不等同一词义'],['leg / foot','腿 / 脚','不把腿和脚合为一个标签'],['body','身体；本木偶分部图可指中间躯干部位','日常整体身体与当前模型所指看情境']],explanation:'本表是文字词义比较。实际图词、真实听辨和本人动作另需对应材料；用原创纸偶示意可以避免提供本人面孔。'},
 {kind:'table',title:'Ee到Ii：配对与本页示例',headers:['大小写','本页词例','先分清什么'],rows:[['E / e','egg / elephant','字形、字母名和词中声音分别学'],['F / f','face / foot','共同首字母不等两词其余声音相同'],['G / g','green / gift','这两个示例不推出全部g词读音'],['H / h','hand / hi','读完整词，不只报字母名'],['I / i','ice / ice cream','此页用ice，不擅换成短i例']],explanation:'示例词来自本件已核范围，讲解和比较为原创。本人书写与本人录音分别核，没有真实输入音频不认听辨。'}],
 misconceptions:[{observation:'把How are you当询问姓名，或把角色的I’m fine存成学生本人状态。',alternatives:['未理解当前问句功能，或把角色句当真实本人资料。'],verification:'标清是角色问候还是本人交流，再分别比较名字句与近况回应。',correctiveFeedback:'先按当前问题回应，角色资料不覆盖本人；未实际交流不编双方已发言。'},
 {observation:'看见your就总指老师，或把arm/hand、head/face合成同一词。',alternatives:['未跟随说话角色转换，或按相连位置合并不同部位。'],verification:'交换甲乙角色再说明my/your所指；逐个指出给定纸偶的两个不同部位。',correctiveFeedback:'my指说话者，your指受话者；部位相连仍需看当前完整词义。'},
 {observation:'用短i例替原页ice，或从一张完成图认定已听音、正确发音和独立完成动作。',alternatives:['套其他材料的常见规则，或扩大当前材料能证明的范围。'],verification:'回看本页i示例，分别核真实输入声音、本人录音、作品和实际动作。',correctiveFeedback:'按本件ice例学习；字形、声音、作品和过程各核，缺少的表现留待实际完成。'}],
 transfer:{scenario:'交换纸偶甲乙位置，问句换为姓名，动作换成展示手，制作步骤另给先画身体再画头。',prompt:'依据当前问句、my/your和新步骤回答，不照抄旧近况句、部位或先后；没有声音时先标明文字任务。',expectedStrategy:'跟随当前角色、词义和条件，示意与本人实际行为分开，合理的新方法不按旧模板判错。'},
 summary:{synthesis:'问候先听清问题，身体词先指准部位，my与your看当前角色。字形、具体词音和本人行动分别练，邀请和同意不替实际制作。',takeaways:['问候与姓名问题不同','十一身体词逐个对应','my指说话者，your指受话者','动作不能只看部位相近','静图不代连续动作','Ee至Ii大小写配对','ice示例按原件核','想做、同意和已做分开']},
 citations:[{page:29,quote:'How are you?',usedFor:'activation'},{page:30,quote:'This is my face.',usedFor:'concept'},{page:30,quote:'Touch your nose.',usedFor:'example'},{page:31,quote:'Write and say.',usedFor:'visual'},{page:32,quote:'Let’s make a puppet!',usedFor:'transfer'},{page:33,quote:'This is the arm.',usedFor:'concept'}],
 }});
const groups=[],add=(s,k,mode,c,rows)=>groups.push(group('look',s,k,mode,c,rows));
add('look-greet','current-greeting-and-role-response','audio_record',['当前问句功能相符','角色与本人情况分清','实际声音可理解与帮助另核'],[
 ['原创角色Kai感觉很好，Lin问How are you?。本人录Kai的回应，不把角色状态当本人真实资料。','可录I’m fine, thank you.或Very well, thanks.，回应问候。需听实际声音核可理解程度，角色很好不证明本人实际感受，也不靠文字代开口。'],
 ['原创角色An问How are you?，你演感觉很好的Bo。录一个回应，不能只报My name’s Bo替近况问候。','可说I’m fine, thank you.等当前合适回应；姓名介绍与近况问题不同。角色卡和本人情况分开，录音及提示须实际核，不补造An回话。'],
 ['原创单人练Lin与Mei两角：Lin问候，Mei按“很好”卡回应。录两句并说明只是自己切换角色。','可录How are you? / I’m fine, thank you.，问答顺序清楚；单人录两角不等真实同伴交流，是否看参考和声音可理解程度另核。'],
 ['真实到期另核：角色Yu被问How are you?且卡明说很好。本人先录回应；本人不愿谈真实感受可只演角色。','可说Very well, thanks.或I’m fine, thank you.，按给定角色回应。实际间隔、原答和提示另核，角色状态不代本人真实资料或独立保持。'],
 ['到期新角色Lin被问What’s your name?，而不是How are you?。本人录按当前问题的回答，不机械沿旧近况句。','可录My name’s Lin.或I’m Lin.，当前问名字不能只回I’m fine。需实际听核本人发声，角色资料、真实间隔和帮助分别保持。'],
 ['到期自己录问候和很好回应后，能把这段角色录音存作本人所有日子都很好或已与同伴交谈吗？请录并限定范围。','本人可录How are you? / Very well, thanks.，但注明单人角色练习。不能推本人长期感受或同伴实际参与；声音、实际间隔和提示分别核。'],
 ['到期卡Mei感觉很好，你先看过参考再录回应。可以录吗？是否能把先看的帮助删掉称未见独立首答？','可以录I’m fine, thank you.等供听核，但先看参考的帮助保留，不倒写独立首答。实际间隔及角色范围另核，保存文件不自动等口语合格。'],
]);
add('look-parts','whole-body-words-and-current-my-your','short_answer',['十一词按当前语义区分','my/your跟随当前角色','词牌图示与本人事实分开'],[
 ['原创文字列head/face、arm/hand、leg/foot，请各说明对应部位；这些词相连或相近就可以任意互换吗？','分别头/脸、胳膊/手、腿/脚，词义不同不能任意互换。当前只有文字语义，没有实物图或声音不宣称图词听辨，本人身体情况也未由文字给出。'],
 ['原创甲对乙说This is my face，随后乙对甲说Touch your head。两句my、your分别指谁，face与head是否同一标签？','第一句my指说话者甲，第二句your指受话者甲；face脸与head头不同。要跟随当前说话与受话角色，不能把your永远固定为老师。'],
 ['原创卡ear、eye、nose、mouth、body，请分别对应词义；body在一张木偶分部图里指中间身体，能由此强定所有语境只能是躯干吗？','对应耳、眼、鼻、嘴、身体；body在该图可指中间躯干部位，但日常也可指整个身体，需看当前语境。不能把一个模型的划分强套所有材料。'],
 ['真实到期另核：三张完整词卡hand、arm、hand，问hand词卡有几张。能据结果说本人有几只手吗？','完整hand词卡两张，arm另是胳膊；词出现次数不是本人身体部位数量。实际间隔、原答和帮助另核，不由词牌反填本人资料。'],
 ['到期角色交换：乙对甲说Look at my nose，甲再对乙说Touch your ear。各句所指是谁的哪一部分？','第一句my指乙的鼻子，第二句your指乙的耳朵；按每句当前说话者与受话者核。鼻子和耳朵不因都在头部就互换，实际动作没有给出。'],
 ['到期新卡给foot、leg、face、head，按“脸、脚、头、腿”顺序配词，不按卡原顺序抄。','依次face、foot、head、leg，按当前完整词义配；相近部位不混。文字任务不代真实看图、听音或本人动作，实际到期及帮助另核。'],
 ['到期原创纸偶图标Lin、Kai，句子Kai说This is my hand。能只因Lin站左边就把my指Lin并改学生本人记录吗？','不能，my由当前说话者Kai确定，指Kai纸偶的手，不由左右位置决定。纸偶角色不改学生本人身份或身体记录，原答、帮助及间隔分别核。'],
]);
add('look-actions','given-action-object-and-visible-work','image_upload',['动作和部位词对应','本人作品和过程区别','文字声音与实际行动分开'],[
 ['原创文字Touch your nose。可上传本人手绘纸偶并圈出应触摸部位，标为“示意”；不需要本人脸照，未真实触摸如实说明。','示意图应圈鼻子，不能圈耳朵或整头代鼻子；纸偶示意不等本人已经触摸。没有声音不认听辨，实际过程、原答和帮助另核。'],
 ['原创给Clap your hands文字。上传本人画的动作示意或实际可见材料，并说明单张双手展开图能否证明已拍手。','clap要求拍手，单张手展开仅见状态，不能独证拍击过程。示意图明确非本人动作，不需脸照；真实听辨和帮助、全过程分别另核。'],
 ['原创文字Wave your arms与Stamp your foot二选一，请画两幅不同部位的示意并标词；不必实际做动作。','挥胳膊与跺脚的动作对象不同，图或标注对应arm/foot；两张示意不代本人执行、声音输入或连续过程，未做如实保留。'],
 ['真实到期另核：文字Close your eyes，可画原创纸偶闭眼示意并说明；一张图能证明本人听音后独立完成吗？','图可说明闭眼要求和示意状态，不能证明本人听过输入声音或完成真实动作。无需脸照，实际到期、原答和帮助另核，示意不冒充本人过程。'],
 ['到期文字Open your mouth，请画示意并标明嘴部，不能沿旧题画打开铅笔盒。没有实际动作也可以如实只交图。','应示意张嘴，对象mouth不是pencil box。画图用于理解文字，不认本人已经张口、听辨或无帮助，真实间隔和原答另核。'],
 ['到期文字Shake your legs与Shake your body，画标清两种当前对象的纸偶示意，不能因相连就写同一部位词。','legs是腿，body在此身体或模型中间身体范围；按当前对象标明。静图不能独证摇动过程或本人听辨，示意与真实行动、帮助和间隔分开。'],
 ['到期文字Touch your head，而提交图只圈mouth。请在本人纸偶图上说明或改到当前部位，是否修改及参考帮助保留。','应指头部head，不把嘴mouth局部代整个目标；修改过程和看参考情况如实保留。示意不认本人真实触摸或听辨，实际到期另核。'],
]);
add('look-letters','e-to-i-pairs-and-actual-writing','image_upload',['五组大小写配对','本人字形可辨','完成图不代笔顺或声音'],[
 ['原创本人写Ee、Ff、Gg、Hh、Ii并上传，可看样本但如实说明；不要用印刷字截图代自己实际书写。','五组大小写对应、本人字形可辨；字体差异可核具体形式，不因形不同就认不同字母。完成图不证明笔顺、听音或发音，看样本帮助保留。'],
 ['原创先本人写Gg和Hh并上传，说明大写与小写看起来不同是否还能成对；未写可如实说明。','G/g与H/h仍各为同一字母大小写，实际手写须可辨。不同字体细节不自动是错误，印刷截图不代本人，声音和书写过程需另核。'],
 ['原创本人写Ii与Ee两组上传并标明大小写，不能用念字母歌代作品；若暂不写就说明未做。','I/i、E/e配对正确且本人的字形清楚；唱歌不提供这次实际书写。完成图不独证正确笔顺或词音，样本、提示与未做状态如实保留。'],
 ['真实到期另核：按Hh、Ff、Ee新顺序本人先写并上传，不机械套旧排列；需要看样本可如实说明。','三组按当前顺序对应、字形可辨，实际间隔和帮助保持。图不代听辨、发音或笔顺全过程，不把临写倒记成独立首答。'],
 ['到期本人写Gg、Ii两组后上传。有人因印刷g与手写样本细节不同就认完全另一个字母，怎样限定核对？','先核实际样本允许字形与大小写身份，不能只凭字体细节改字母；本人作品须可辨。图不证明词音或独立书写过程，真实到期和帮助另核。'],
 ['到期只有旧Ee至Ii印刷表，没有本人新写。可以说明未写或现在实际写后上传，能把旧表自动当本次作业吗？','不能把旧印刷表当本人本次书写；可如实未写或新写后核字形。实际间隔与样本帮助保留，不由旧表推出本人发音、笔顺或保持通过。'],
 ['到期本人写Ee/Ff/Gg/Hh/Ii一张完成图。它可支持字形核对，但能独自支持全部听音、词首音和无人提示结论吗？','不能，完成图只支持可见书写范围，听音、发音、过程和提示各需实际材料。真实到期与本人原答另核，不由一张图扩大为所有表现合格。'],
]);
add('look-sounds','exact-e-to-i-exemplars-not-global-phonics','audio_record',['当前完整示例词可理解','ice例与原范围一致','声音示范帮助及规则边界清楚'],[
 ['原创请本人录egg、elephant与face、foot两组，若先听教师示范如实说明；两个词有相同首字母就须全部声音相同吗？','本人读四个完整词供听核；每组共同首字母不等其余声音全同。字母名与词音分别学，听示范帮助保留，无真实输入声音不认听辨。'],
 ['原创本人录green、gift及hand、hi，按当前两组说。能由前组就断言所有g开头词都与本组一样读吗？','需听实际完整词是否可理解，前组g、后组h是当前词例；不能推广所有g或h词的读音。字母名不替读词，声音示范与本人原答分开。'],
 ['原创本页i示例明确ice、ice cream。本人录这两个当前词例；能把它换成短i例并说原件就是那个示例吗？','应按当前ice、ice cream实际读供核，不能擅换短i词再冒称原件内容。字母名字与具体词音分别核，未有输入声音不认听辨，帮助如实说明。'],
 ['真实到期另核：本人先录elephant、egg，不念字母名代整个词；是否先听了样本和实际间隔分别说明。','本人录完整elephant、egg供听核，不用Ee字母名代两词。实际到期和示范帮助另核，文件存在不等发音已合格或独立保持。'],
 ['到期录gift、green与foot、face两组，说明共同字母不等每个音都相同；不能由几词推广所有读音规则。','实际听本人完整词的可理解程度，按当前词例比较；不把共同首字母扩为全词同音或所有g/f词规则。间隔、原答和帮助分别核。'],
 ['到期本人录hi、hand与ice、ice cream。字母名字、具体词音与这次真实录音能否只凭印刷表同时认全部通过？','不能，需实际听本人词音；印刷表只给词形和当前示例，i仍用ice范围。输入声音、本人发声、帮助与真实间隔各核，不补听辨通过。'],
 ['到期先听过教师示范ice cream再录本人尝试，能删掉示范记录并改成未见独立首答吗？请录并如实说明顺序。','可以录本人ice cream供核，但先听示范的帮助和时间顺序保持，不倒写独立首答。实际声音是否可理解与到期间隔另核，不把文件自动判合格。'],
]);
add('look-proposal','invitation-sequence-and-real-product','short_answer',['邀请同意和完成分开','当前先后条件保持','图示故事与本人事实分开'],[
 ['原创甲说Let’s make a puppet!，乙只说Great，尚无作品。现在可以记录木偶已经制作完成吗？说明两句话支持什么。','不能，前句提出一起制作的邀请，Great表达赞同，均不证明已制作。实际步骤和作品需另核，不把愿意或同意当本人完成。'],
 ['原创步骤明确first先画head、then画body。请解释本题先后；如果另一方法明说先画body，可强迫所有方法同一顺序吗？','本题先头后身体；另一方法条件已改，要按新说明核，不把本题顺序当所有制作唯一规则。文字说明不是本人已操作的过程。'],
 ['原创本人只画一张带arm/leg标签的纸偶图，还没做成可活动木偶。可以怎样记录，能写已完成真实木偶并自行走动吗？','可如实记完成一张纸偶示意图，不能记已做成可活动木偶或自行走动。作品形态与虚构故事分清，未发生的制作和动作不补造。'],
 ['真实到期另核：当前新步骤先画body再画head，有人照旧题顺序判错。应按哪个条件，什么事实仍不能由步骤文字确认？','按当前明确先身体后头条件，不能套旧顺序；步骤文字不证明本人已画或制成木偶。真实到期、原答和帮助另核，合理新方法不凭旧模板判错。'],
 ['到期角色答应一起做并看了参考图，作品还没出现。能说已独立完成且没有看参考吗？应保留什么？','不能，答应与完成不同，已看参考的帮助保留；当前作品未提供即未核，不能补造独立首答或成品。实际到期间隔另核。'],
 ['到期虚构故事木偶说Goodbye后移动。能据故事认定普通纸偶现实会自己说话，或本人已经表演这段吗？','不能，虚构情节不证明现实物体能力或本人已表演。可理解故事中的告别和动作，但真实作品、本人参与、声音与间隔需分别核。'],
 ['到期读完How are you对话和木偶步骤，只完成文字分析。可以如实记录什么，哪些本人听说或制作结论仍待材料？','可记录文字理解或步骤分析范围，不能代本人实际听辨、录音、同伴对话和木偶制作完成。原答、帮助与实际间隔分别保留，示例不代学习事实。'],
]);
write('english-g3-349949e1-look-v1',[lesson],groups,'42道未审原创候选，6目标各3即时4拟议间隔，14录音/14图像/14文字。问候与本人感受、十一部位词与指称、动作和图示、Ee至Ii及ice例分别核；真实听力、教师/评分/独立题族与充分保持库存未完成。');

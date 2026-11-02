const {createKit}=require('./exact-source-candidate-kit.cjs');
const bookId='archive-book:english-g3-upper-349949e1df2ad88b';
const {draft,group,write}=createKit({bookId,prefix:'source:english:g3:349949e1:',filePrefix:'english-g3-349949e1'}),packets=[];
function packet(slug,chapter,start,end,title,definitions,notes,content){
 const lesson=draft({slug,lessonId:bookId+':'+chapter+':entry1',start,end,definitions,
 scope:{title,directoryGranularity:chapter.startsWith('recycle')?'activity':'unit',printedPages:[start-5,end-5],publicationEdition:'人教PEP三年级起点独立原件；具体出版版次未载',curriculumStandardYear:2011,allPageActivitiesDelivered:false,authenticListeningStimuliIncluded:false},
 sourceReview:{confirmedRange:true,statement:'选定范围每张原页均已实际看图，文字、图示、听音、本人发声和真实活动分别核；不复制原图歌词，不由空提取文本推空页或从画面推听音答案。',pages:notes.map((statement,i)=>({page:start+i,visualChecked:true,statement}))},content});
 const p={slug,lesson,groups:[]};packets.push(p);p.add=(s,k,mode,criteria,rows)=>p.groups.push(group(slug,s,k,mode,criteria,rows));return p;
}
const recycle=packet('recycle-one','recycle1',37,40,'Recycle 1',[
 ['r1-greeting','按当前角色复习问候和介绍','依据时段、说话者和被介绍者完成简短口语','Hello/Good morning、I’m/This is与当前角色相符，实际发声和示例分开','综合交际'],
 ['r1-object','文具与所有物表达复习','认读八类完整文具词并用给定条件理解I have','词与物对应，Me too要有相同条件，不按词内字母段或旧位置匹配','词义与表达'],
 ['r1-colour-part','颜色与身体部位组合','在明确文字条件中把颜色词与当前部位一起对应','两个词的信息同时保持，不凭服装位置或常见颜色补条件，文字与实际视觉听辨分开','组合意义'],
 ['r1-letters','Aa至Ii配对与本人书写','按当前要求匹配或本人书写Aa至Ii','字母身份、大小写和字体差异分清，本人完成图不证明笔顺或发音','字母复习'],
 ['r1-rules','按当前蛇梯规则核行动','在原创小棋盘中按明确规则判断位置与待答任务','上梯下蛇依本局，移动、作答和游戏结果分别记录，不由棋位反填答案','规则理解'],
 ['r1-dialogue','根据不同问句作相应回应','在混合姓名、近况、所有物和告别情境中实际回应','先辨问句和场景再说，单人切角与真人对话分开，原答与示范帮助保持','综合迁移'],
],[
 '原页32复习人物问候、介绍及扮演；问White hands/Brown arms是疑问，猜问不当人物已知事实。',
 '原页33听音涂色及看图颜色身体词判断；没有音频不反推听音任务，复合词义需同时核颜色与部位。',
 '原页34蛇梯棋盘，上梯下蛇明确；格位的图、字母、文具和交际提示不是本人已回答或掌握记录。',
 '原页35大小写匹配、写读与问候歌曲；字体、本人书写与声音不同，歌曲角色不当学生本人身份。'
],{
 title:'Recycle 1：先辨问题，再用学过的话回答',
 activation:{prompt:'原创角色Bo说I’m Bo.，随后指着Mei说This is Mei.。两句话都有人名，可说介绍的是同一个人吗？',expectedObservation:'I’m介绍当前说话者，This is介绍当前指明的人；不能只抓住人名就忽略说话角色。',bridge:'复习把熟悉的词放到新组合里。每次先看问题、对象和当前条件，再回答或行动。'},
 concept:{explanation:'见面先按当前场景问候，Hello或Hi可用于打招呼；明确上午时可练Good morning。I’m Bo介绍说话者Bo，This is Mei介绍当前被指明的Mei。How are you?是问候，What’s your name?问名字，Nice to meet you表达初见的高兴；这些句子不能因都在见面时出现就混成同一个问题。可以先独自切换角色练，再有机会与同伴实际交流；只练过文字或单人角色，就按这个范围记录。\n文具看完整词：pen与pencil不同，pencil box是铅笔盒，book是书，bag是包；ruler、eraser、crayon分别为尺、橡皮、蜡笔。I have a ruler说有尺，I have an eraser说有橡皮。Me too要符合相同情况，只有书不能听见别人说有尺就机械回应也有尺。题目数pen词卡，就不把pencil内的字母段算成另一个完整pen。\n颜色和部位放在一起时，两部分都要看。例如原创卡明确red mouth指红色的嘴，white hands指白色的手；把red记住却把mouth换成ear，仍不符合当前组合。文字条件只支持词义理解；真实看图要有可辨画面，真实听辨要有声音。看到一个问句Brown arms?，它是在询问或猜测，不是已经确认所有胳膊都棕色。角色服装也不能当学生本人身体资料。\nAa至Ii的大小写先认字母身份，再看题目要完全相同字形还是大小写配对。A与a可成大小写一对，却不是完全相同字形。字体可以有细节差异，手写要按当前样本核清楚；唱熟字母歌不等每个词中声音、书写和新词都已经会。本人实际写过才交本人作品，印刷表只作参考。\n蛇梯游戏先读本局规则。这里的原创示例规定落到梯底就到梯顶，落到蛇头就到蛇尾。若梯子从第2格到第5格，落到2才按本局升到5，不能看到任何梯图就跳到终点。移动完成不表示格内任务已答对；没有听到本人回答，就不能从棋子位置反填正确。游戏胜负也不能替每个人每个目标的回答。\n换角色、物品和问题时，先自己尝试，再看示例比较。向对方问名字与自己报名字有不同发话角色，告别要看当前是否结束。复习可以帮助发现哪里要再练，唱歌、愿意参加或走完一局都不直接等同于新的听说读写任务已完成。',
 points:['问句功能先分清','I’m和This is看当前角色','文具按完整词读','Me too须符合相同条件','颜色与部位两项都保持','字形相同与大小写配对不同','上梯下蛇按本局规则','棋位和本人回答分开']},
 example:{situation:'原创下午角色卡：Bo向Lin介绍Mei，随后Lin问Mei名字。三人实际交流尚未发生，只先分析角色卡。',steps:[
 {explanation:'Bo可先说Good afternoon, Lin. This is Mei.，介绍的是Mei，不把This is改成自己叫Mei。',board:['说话者Bo','受话者Lin','被介绍者Mei']},
 {explanation:'Lin问What’s your name?，Mei可答My name’s Mei.。若问题换成How are you?，则按给定近况回应，不能机械报名字。',board:['问名字 → 当前角色名字','问候 → 近况回应','问题换了，回答也要重新核']}
 ],conclusion:'这是原创角色分析。真正口语练习要听本人实际发声，不把三行参考文字当三名真人已经对话。'},
 visuals:[{kind:'table',title:'复习先看当前任务',headers:['任务','先核什么','不要混成什么'],rows:[['I’m Bo / This is Mei','说话者与被介绍者','所有名字都指同一人'],['red mouth / white hands','颜色和部位两项','只选对颜色就算整个组合对'],['A与a','是配对还是相同字形','所有任务都按同一规则'],['落梯底或蛇头','本局端点与移动规则','看到棋子就认格内题已答对']],explanation:'用原创文字条件比较任务，不复刻原棋盘；真实声音、看图、本人书写和实际游戏分别核。'}],
 misconceptions:[{observation:'只因问句都在人际场景，就用名字回应How are you。',alternatives:['尚未先辨当前问句的实际功能。'],verification:'交换姓名与近况问题，先说对方现在想知道什么。',correctiveFeedback:'名字和问候分别回应，不只抄最近看到的句子。'},
 {observation:'white hands只记住white，就把对象换成nose。',alternatives:['漏掉组合中的部位信息。'],verification:'分别指出颜色词与部位词，再核整个组合。',correctiveFeedback:'颜色和部位要同时相符，不能只对一半。'},
 {observation:'棋子走到终点就把中途所有任务记成独立正确。',alternatives:['拿游戏位置代本人回答。'],verification:'核实际轮次和每项原答，缺失回答保持未核。',correctiveFeedback:'位置、回答与胜负分别判断，不补造中途表现。'}],
 transfer:{scenario:'把姓名、文具、颜色和梯蛇端点全部换掉，混排三个不同问题。',prompt:'每项先说当前问什么，再按新角色和规则回答；文字、录音或示意分别标明实际完成的范围。',expectedStrategy:'依据当前条件，不靠旧名字、位置和熟练歌谣猜；先答后比较，帮助如实说明。'},
 summary:{synthesis:'复习要把已学表达用到当前问题。角色、完整词、颜色部位和游戏规则分别核，本人实际回答不能由棋位或示例代填。',takeaways:['先辨问题','跟随当前说话者','读完整词','组合信息同时保持','按本局规则','作品与声音各核']},
 citations:[{page:37,quote:'Can you act it out?',usedFor:'concept'},{page:38,quote:'Listen and colour.',usedFor:'misconception'},{page:39,quote:'Go up the ladders. Go down the snakes.',usedFor:'example'},{page:40,quote:'Match, write and read aloud.',usedFor:'transfer'}],
});
recycle.add('r1-greeting','r1-current-speaker-introduction','audio_record',['时段和角色相符','被介绍者不混','本人发声可理解'],[
 ['原创上午，你演Bo，向Lin介绍Mei。本人录一句问候和介绍，角色名不是真实资料。','可说Good morning, Lin. This is Mei.，按当前时段和被介绍者；不是I’m Mei.。听实际录音核是否可理解，角色句不改本人身份。'],
 ['原创你演Kai，只介绍自己初次见面，不介绍第三人。本人录问候与名字，不沿用别人的角色句。','可录Hello, I’m Kai.或Hi, I’m Kai.，I指当前说话者Kai；需本人实际发声，书面参考不代口语表现。'],
 ['原创下午你演An，向Mei介绍Yu。请本人录当前表达，不能照抄上午Bo与Lin的名字。','可说Good afternoon, Mei. This is Yu.；当前介绍Yu，An是说话者。录音可理解及是否先看示例分别核。'],
 ['新角色Lin在上午向Bo介绍Kai，请先本人录问候和介绍；单人练习就明确范围。','可录Good morning, Bo. This is Kai.；时段和角色正确。单人发声不冒充真实三人交流，原答及帮助另核。'],
 ['角色Mei初次向对方介绍自己。请本人录Hello或Hi加介绍，别用This is误介绍另一个人。','可录Hi, I’m Mei.；当前I’m介绍本人所演角色。需听实际声音，不把角色名字存为本人真实姓名，帮助如实说明。'],
 ['当前明确下午，你演Yu向An介绍Lin。录新句，不沿上一题上午的问候。','可说Good afternoon, An. This is Lin.，依据当前条件。真实间隔和本人原答另核，旧参考不能当本次已开口。'],
 ['角色卡你演Bo，尚无真实同伴参与。独自录This is Mei的介绍，可以怎样说明这次完成的范围？','可本人录Hello, this is Mei.等角色介绍，但注明单人练习；对方尚未实际回应，不编已发生的交流，声音与提示另核。'],
]);
recycle.add('r1-object','r1-complete-word-and-possession','short_answer',['完整词义正确','所有物条件保持','相同回应有依据'],[
 ['原创完整卡pen、pencil、pencil box、pen。问完整pen有几张，pencil和pencil box各表示什么？','完整pen两张；pencil是铅笔，pencil box是铅笔盒，不按词内字母段另算pen。词卡数量也不等本人有几支笔。'],
 ['原创Lin有尺子，Mei只有橡皮。Lin说I have a ruler，Mei可以仅为接话说Me too吗？给合适自述。','不应按本条件说也有尺，可说I have an eraser.。Me too须有相同事实；角色物品不代本人真实所有物。'],
 ['原创选“包、书、蜡笔”，卡顺序为book、crayon、bag。按意思重排，不按原位置抄。','依次bag、book、crayon；按完整词义，不按旧排位。这是文字任务，没有声音不认听辨或本人发音。'],
 ['新卡ruler、eraser、pencil各是什么？若说有一块橡皮，本例I have后面怎样接？','分别尺子、橡皮、铅笔；可说I have an eraser.。本例表达与物品对应，不把这三词合成同一物品或推全部冠词规则。'],
 ['角色An和Yu都明说有一本书。对方说I have a book后，An怎样回应相同情况？只知道一人有书时还缺什么？','两人都有书时可回应Me too.；只知一人有书，不足确认另一人也有。保留当前角色条件，不自动生成本人所有物记录。'],
 ['当前题要“铅笔盒”，有人因含pencil就写pencil。应写完整什么词组，为什么不能省成另一物品？','应写pencil box，整体指铅笔盒；pencil单独是铅笔，省略box改变对象。按当前词义而非共享字母段判断。'],
 ['完整词卡bag、book、bag、ruler，问bag有几张，不问本人书包数。请按当前卡答。','两张完整bag词卡，第1和第3张；book为书，ruler为尺。文字出现次数不代本人实际物品数量，原答与提示另存。'],
]);
recycle.add('r1-colour-part','r1-colour-part-combination','short_answer',['颜色与部位都正确','问句与肯定分开','材料范围真实'],[
 ['原创文字卡red mouth、white hands，请分别说明两项含义；只选对颜色而把部位换掉够吗？','分别红色的嘴、白色的手，颜色和部位都要对应；只对颜色不够。文字条件不证明本人已看图、听音或执行动作。'],
 ['原创要blue arms，可选blue nose、brown arms、blue arms。选完整符合项并说明其余各错哪一部分。','选blue arms，蓝色胳膊；blue nose部位错，brown arms颜色错。两个信息同时保持，不因出现熟词就直接选。'],
 ['角色只问Brown arms?，尚无回答和清晰图片。能认胳膊已经棕色吗？什么仍需核？','不能，问句是询问或猜测，不是肯定事实；需明确回答或可辨图。缺声音也不认听辨，人物服装不代学生本人身体资料。'],
 ['新卡yellow body和red body，当前文字明确要求黄色身体，应选哪个？若真实图片看不清，能用常识补吗？','文字条件选yellow body；图若看不清需另核，不能拿常见颜色补当前画面。词义判断与实际视觉任务分开。'],
 ['当前要white mouth，旧题曾是red mouth。请给当前含义，不能只因部位相同沿用旧颜色。','当前白色的嘴，颜色white而非red；部位mouth保持。按新条件判断，旧题答案不是新题依据。'],
 ['原创字卡black eyes与orange eyes混排，给定要求橙色眼睛。写完整选项，不用物种常见眼色猜。','选orange eyes，按已给颜色和部位；不能因常见眼色改black。这里是原创角色条件，不作本人或真实动物眼色结论。'],
 ['你只读懂blue arms，没有图和音频。可以说明文字意思吗？能据此填“已听辨且画中胳膊确实蓝色”吗？','可以说明蓝色的胳膊这一文字组合，不能补已听过声音或看清画面。需要相应真实材料再核，原答与帮助如实保持。'],
]);
recycle.add('r1-letters','r1-a-to-i-writing','image_upload',['字母身份和大小写对应','本人字形可辨','字体与过程边界明确'],[
 ['原创本人写Aa、Bb、Cc三组并上传，先看样本可如实说明。不要用印刷截图当本人书写。','三组大小写对应且本人字形可辨；字体与手写可有细节差异。完成图不独证笔顺或发音，样本帮助如实保留。'],
 ['原创本人写Dd、Ee、Ff并上传，标清大写小写；不能只唱字母歌替本次作品。','三组配对正确、实际作品可辨；唱歌不提供本次手写。图不证明听音、字母名发音或完整过程，未写保持未完成。'],
 ['原创本人写Gg、Hh、Ii并上传；大小写形状不完全相同就一定不是同一字母吗？','三组仍是对应大小写，字形可不同；核实际样本与本人可辨作品。不按完全同形要求误判配对，声音和笔顺另核。'],
 ['新顺序Ii、Aa、Ee，请本人按当前顺序写并上传；需要样本可如实说明。','按当前顺序配对、字形清楚；不机械沿旧排列。本人作品和看样本帮助保持，实际到期与声音表现另核。'],
 ['当前要求写Bb与Dd并标明小写竖笔位置，请上传本人作品，不把同一个形状当两字母。','b竖左弧右，d弧左竖右，大小写分别对应；实际图可核字形，不能独证无人提示、完整笔顺或听音。'],
 ['本人可先写九组Aa至Ii，也可说明暂未写。能直接把旧印刷表自动记作本次已写完吗？','不能；实际本人新写可核字形，未写如实保留。印刷表是参考，不能代本次作品、听辨或独立保持。'],
 ['本人上传Aa至Ii完成图，有人要据此同时勾选所有词中声音、字母名及独立书写过程，应怎样限定？','图只支持所见字形和大小写核对，声音、过程及帮助需实际材料。作品范围如实保留，不由一图推出全部听说读写已通过。'],
]);
recycle.add('r1-rules','r1-current-ladder-snake-rule','short_answer',['当前规则正确','端点与动作条件完整','棋位不代原答'],[
 ['原创本局落到2格梯底就升5格，落到7格蛇头就退4格。棋子落2后按规则去哪？能据此认格内英语题已答对吗？','升到5格；移动规则只给位置，不提供格内本人回答。英语原答与帮助需实际核，不能由升格反填正确。'],
 ['原创同局棋子落7，蛇尾在4。应去哪？如果只是经过7而没有落在7，能自动用落点规则吗？','落7时到4；只经过7不满足明说落点条件，不自动触发。动作依本局规则，未知回答不能因退格直接认失败。'],
 ['新局明确梯子3到6、蛇8到5。有人沿旧2到5规则跳格，应按什么判断？','按新局3到6、8到5的端点，旧局不替当前条件。棋位、实际作答和判定分别记录，不补造本人已完成任务。'],
 ['原创棋子直接被放终点，没有前面轮次和回答。能记成全部任务独立正确吗？','不能，终点位置不证明依规则完成或本人逐项回答；需核实际轮次、原答和帮助。缺失环节保持未核，不倒填结果。'],
 ['本局说到梯顶停，未说明还能再多走。棋子按梯子到6后有人加走一步，应怎样处理？','先依明说规则停6；额外步数没有依据需核本局说明，不能自行补规则。移动与是否答题仍分别核。'],
 ['本人看同伴答案后说对，按游戏可继续。能把游戏继续顺带改成未经帮助的独立首答吗？','不能，游戏判定可依规则，但看答案的帮助和先后保持。游戏状态不改写原答，也不证明后续独立保持。'],
 ['同伴赢一局，你只观察没参与。能把他的胜利记成本人已经会所有字母、词和对话吗？','不能，观察和同伴胜利不代本人实际回答。本人未参与如实保留，各目标需自己的相应任务，不能集体代记掌握。'],
]);
recycle.add('r1-dialogue','r1-different-question-response','audio_record',['当前问句功能对应','角色答案准确','单人示范与实际交流分开'],[
 ['原创你演Mei，问句What’s your name?。本人录回答，别用近况句代名字。','可说My name’s Mei.或I’m Mei.，当前问姓名；I’m fine.不是同样功能。需实际录音供核，角色名字不作真实资料。'],
 ['原创你演感觉很好的Lin，对方问How are you?。本人先录合适回应，不只报名字。','可说I’m fine, thank you.或Very well, thanks.，回应当前问候；角色感觉不替本人实际状态，声音与帮助另核。'],
 ['原创明确会面结束。本人录一句告别，不把How are you当所有场景的固定回应。','可录Bye.或Goodbye.，对应离开场景；要听本人实际发声，不编对方已回答或会面真实发生。'],
 ['新角色Bo被问姓名，请本人录新名字，不照抄旧Mei的参考。','可说My name’s Bo.或I’m Bo.；当前说话者与名字对应。原答和是否先看参考保持，单人练习不冒充真实双方交流。'],
 ['角色Yu感觉很好，当前问How are you?。请本人先录回应，若只是演角色要说明。','可录Very well, thanks.等当前合适回应；虚构状态不写为本人真实感受。实际声音、帮助及到期间隔另核。'],
 ['原创独自切角：先问名字再以Kai回答。本人录两句，明确没有真实同伴参与。','可录What’s your name? / My name’s Kai.，角色切换清楚；不虚构第二名真人发言，需核实际声音与帮助。'],
 ['混排姓名、近况和告别三张卡，你演An且近况卡明说很好。录三种不同回应，不能全部只说名字。','可分别My name’s An. / I’m fine, thank you. / Bye.，按当前功能。本人录音供核，角色与实际参与范围明确，提示顺序保持。'],
]);

const animals=packet('animals','unit4',41,50,'Unit 4 We love animals',[
 ['animal-words','动物词与地点词对应','理解本课十种动物名称并区分zoo地点和funny描述','duck/pig/cat/bear/dog/elephant/monkey/bird/tiger/panda按当前标签对应，zoo不是另一种动物，funny不统一升级为必写词','词义识读'],
 ['animal-question','根据当前指向问答动物','在明确近远所指中用What’s this/that与It’s回应','先核当前指明对象，this/that不是物体固定名字，当前动物名及a/an示例相符','口语交际'],
 ['animal-guess','猜问与后续命名修正分开','在原创动物卡问答中分清A bear疑问、否认与随后明确名称','猜测未当确认，后续说法按给定信息更新，卡片名称区别不扩为生物分类结论','语篇理解'],
 ['animal-like','用喜欢表达回应当前对象','在明确角色偏好中说I like it并回应Cool等感受','it所指保持，角色偏好不代本人偏好或动物身份，发声与示例分开','表达与指称'],
 ['animal-letters','Jj至Nn大小写与本人书写','按本组Jj/Kk/Ll/Mm/Nn配对并实际书写','大小写字形清楚，I/i和L/l等相似形按当前样本核，完成图不代声音或笔顺','字母书写'],
 ['animal-sounds','按Jj至Nn具体词例试读','录本人读jeep/jump、kite/Kate、long/leg、mum/milk、nose/noodles','完整词可理解，字母名和示例词音分开，不据两例推全部词规则或从图推听音答案','具体词与语音'],
 ['animal-model','模仿与动物或模型身份分开','理解Act like指令并用原创图或本人实际材料说明所模仿对象','模仿不把人变成动物，玩具手影与实物分清，静图不独证完整动作或真实听辨','指令与模型'],
],[
 'Unit Four物理41起页印刷36，动物主题、近远询问和玩具模型；模型与真实动物分别说明。',
 '跨页右图印刷37，What’s this与熊玩具等对象，角色问答不代本人真实交流。',
 'A部分手影duck/dog及猜熊后揭示Zoom；猜测与明确揭示、手影和真实对象分开。',
 '五种动物词与手影、押韵儿歌；词义、描述与虚构行为分别核，不把一句儿歌当动物普遍事实。',
 'Jj至Nn及jeep/jump、kite/Kate、long/leg、mum/milk、nose/noodles，字母名、字形和示例声音分开。',
 'B部分that所指、A bear猜问和panda修正、funny与I like it；词卡命名不外推科学科属判断。',
 'bird/panda/tiger/elephant/monkey和zoo、Act like活动；地点词不当动物，模仿不代真实动物身份。',
 '找J至N大小写及完整动物词计数，词牌数不等真实动物数，字体与词义分开。',
 '听音编号、动物匹配和歌曲；图像可核所见，缺音频不补编号或本人听说表现。',
 'C跟随队列与胡萝卜线索，me随说话者变化，号召和图上队列不代本人真实行走。'
],{
 title:'We love animals：先看指向，再说具体动物名',
 activation:{prompt:'原创卡A明确标duck，卡B标dog。有人只因两个词都以d开头，就说它们是同一种。能只看首字母选动物吗？',expectedObservation:'要读完整词并看当前所指；duck是鸭，dog是狗，首字母相同不等同词义。',bridge:'动物词要和明确对象连起来，问答、猜测、喜欢和模仿各有不同作用。'},
 concept:{explanation:'本组动物名包括duck鸭、pig猪、cat猫、bear熊、dog狗、elephant大象、monkey猴、bird鸟、tiger老虎、panda大熊猫。zoo是动物园，表示地点，不是第十一种动物；funny在当前情境表示滑稽、好笑，是描述，不是动物名。先读完整词和当前标签，不因duck、dog同为d开头就混，也不因某个词牌放在盛食物的盘边就改变词义。\nWhat’s this?询问当前近处或正在指明的对象，What’s that?询问当前较远或另一个已指明的对象。先看说话者现在指什么，再回答It’s a dog.等。this和that不是物体永久的名称，换了人或换了指向，所指可以改变。本例说It’s an elephant.，an elephant与a dog、a tiger一起按当前表达学习，不只看首字母名称猜a或an。\n猜问不是确认。原创动物卡被遮住时，角色说A bear?只提出一个猜测；另一角色随后明确说No, it’s a panda.，当前卡的名称按这个回答修正。不能把先前猜问也记成已经证实，更不能由本组词卡的命名区别推出现实动物全部科学分类。看见角色模样或手影，也不能在未揭示前编出教材没有给的身份。\nI like it是在说喜欢当前所指的对象。若角色卡明确Lin喜欢这张tiger卡，可以练I like it.；it在这里指这张卡所表示的动物。Cool可以表达赞赏，但不是另一种动物的名称，也不能用“喜欢”来证明看不清的图一定是哪种动物。角色偏好与学生本人愿不愿意表达的实际喜好分开；未有真实同伴说话，不补对方已经感谢或同意。\nAct like a bird是要求模仿鸟，Act like an elephant要求模仿大象。可以先说清所模仿对象，再按自己的条件用动作、原创纸偶或图示练习。模仿某种动物，不表示人变成动物，也不表示真实动物都有图中的表演行为。手影、动物玩具、画图和真实动物是不同材料；静图可以看当前姿态，却不能独自证明一段完整模仿过程或听到过指令。\nJj、Kk、Ll、Mm、Nn先配对大小写，再自己写。L/l与I/i等相似印刷形要结合当前样本比较，不因一个直竖就全部当同一字母。词例为jeep/jump、kite/Kate、long/leg、mum/milk、nose/noodles，Kate是当前名称例子，不当本人身份。要听真实声音再试读完整词，字母名不能替整个词，两个例词也不等所有含该字母的词都读同一规则。词表黑体的听说认读与白体的听说要求保持差异，不统一追加默写。\n跟随队列故事也要跟随当前说话者。甲说Follow me，me指甲；换乙说同一句，me指乙。根据图和话可分析谁在谁后，但读懂故事不证明本人参加过行走游戏。下次换一组动物卡和说话者，先自己回答，再说明是否听过示范或看过参考。',
 points:['十个动物词读完整','zoo是地点，funny是描述','this/that看当前指向','猜问不当确认','I like it不改变对象身份','Act like不等变成该动物','手影玩具图像与实物分开','Jj至Nn按具体词例练']},
 example:{situation:'原创角色卡：近处卡A标dog，远处卡B标elephant。Bo先指A，随后指B；Lin按已给标签回应。',steps:[
 {explanation:'Bo指A问What’s this?，Lin可说It’s a dog.。先核当前指向，不能因为远处有大象就答elephant。',board:['A：dog','当前指向A','It’s a dog.']},
 {explanation:'指向换成远处B，问题为What’s that?，可答It’s an elephant.。对象换了重新核，用本例an elephant表达。',board:['B：elephant','What’s that?','It’s an elephant.']},
 {explanation:'若卡B尚遮挡，只问An elephant?仍是猜测；待明确标签或回答后再确认。喜欢哪张卡也不替代身份依据。',board:['猜问 ≠ 确认','喜欢 ≠ 动物名称证据','参考对话不代本人已说']}
 ],conclusion:'先核当前对象与已给信息，再用完整名称回答；这是一份原创角色示例，实际口语另听本人声音。'},
 visuals:[{kind:'table',title:'动物、地点和描述分开',headers:['词或词组','本课意思','当前核查点'],rows:[['duck / dog','鸭 / 狗','完整词不同，不只看d'],['cat / pig / bear','猫 / 猪 / 熊','按具体词卡，不凭位置猜'],['elephant / monkey / bird','大象 / 猴 / 鸟','按当前要求的具体名称'],['tiger / panda','老虎 / 大熊猫','疑问猜测与明确命名不同'],['zoo / funny','动物园 / 滑稽、好笑的','地点与描述不当动物名称']],explanation:'这是原创文字比较，不复制动物插图；词卡、真实图像、听辨和本人模仿分别核。'},
 {kind:'table',title:'Jj到Nn：字形与当前词例',headers:['大小写','本页词例','要分清什么'],rows:[['J / j','jeep / jump','字母名不替完整词'],['K / k','kite / Kate','Kate是给定名称例'],['L / l','long / leg','相似直竖要看当前样本'],['M / m','mum / milk','两个例词不等所有音相同'],['N / n','nose / noodles','词形与真实声音分别核']],explanation:'本人手写和录音分别提供。图上单词不等本人已听过或说过，拼写也不统一追加为默写要求。'}],
 misconceptions:[{observation:'只看d就把duck和dog互换，或把zoo当一种动物。',alternatives:['未读完整词或未分词义角色。'],verification:'逐卡说明完整词与意思，再把动物名和地点词分开。',correctiveFeedback:'duck与dog不同，zoo是地点；当前标签不能由位置或首字母代替。'},
 {observation:'A bear?尚无回答就认身份已确定；喜欢某卡又被当成名称依据。',alternatives:['混淆猜问、态度和已知信息。'],verification:'按先后列猜问、明确回答与所指对象。',correctiveFeedback:'以当前明确资料更新，猜测与喜欢各有范围，不外推科学分类。'},
 {observation:'一张模仿图就当本人听懂整段指令且完整表演。',alternatives:['把可见姿态代声音与连续过程。'],verification:'分别核真实输入声音、本人原答、过程与帮助。',correctiveFeedback:'静图和示意只支持当前可见范围，未发生的听说或动作不代填。'}],
 transfer:{scenario:'换近远动物卡和说话者，加入一张zoo地点卡，随后给一个明确Act like指令。',prompt:'先说当前所指是什么，再按任务问答或示意；把地点、猜测、喜欢和模仿分别说明。',expectedStrategy:'跟随当前对象和信息，不套旧位置或首字母；词义、声音和实际过程分别核。'},
 summary:{synthesis:'动物问答先核当前指向与完整名称。猜测、喜欢和模仿各有作用，模型、词卡与真实动物不能互相代替。',takeaways:['完整动物词','zoo是地点','this/that跟当前指向','问句不代确认','it所指不丢','模仿和身份分开','Jj至Nn分别配对','真实声音另核']},
 citations:[{page:43,quote:'What’s this?',usedFor:'activation'},{page:44,quote:'It’s a duck.',usedFor:'concept'},{page:45,quote:'Write and say.',usedFor:'visual'},{page:46,quote:'It’s a panda. I like it.',usedFor:'example'},{page:47,quote:'Act like a bird.',usedFor:'transfer'},{page:50,quote:'Follow me!',usedFor:'concept'}],
});
animals.add('animal-words','animal-complete-label-meaning','short_answer',['当前完整名称对应','动物地点描述分开','具体要求与材料范围清楚'],[
 ['原创文字卡duck、dog、pig、cat分别是什么？只看首字母d能把前两种当同一个词吗？','分别鸭、狗、猪、猫；duck与dog虽同为d开头，完整词与意思不同，不能互换。本题文字不代实际听辨或看清动物图。'],
 ['原创把“熊、大象、猴、鸟、老虎、大熊猫”与bear/elephant/monkey/bird/tiger/panda对应，不按卡片位置猜。','依次bear、elephant、monkey、bird、tiger、panda；按当前完整词义。具体卡名区别不扩为全部动物科学分类，图像和声音另核。'],
 ['原创卡zoo、funny、tiger混排，哪项是本组动物名，另外两项在当前语境表示什么？','tiger是老虎名称，zoo是动物园地点，funny是滑稽好笑的描述；不能因都在动物场景就当三种动物，也不统一追加funny默写。'],
 ['新完整词卡dog、duck、dog、bird，问完整dog出现几张，不问现实犬只数。','完整dog两张，第1与第3张；duck和bird另有词义。词牌出现次数不等真实动物数，当前文字任务也不认听辨通过。'],
 ['当前要求按具体词卡“鸭”选完整词，可选bird、duck、dog。应选哪个？能把它延伸为鸭不是鸟类吗？','按本题具体标签选duck；bird较一般，dog是狗。此命名任务不支持鸭不是鸟类等科学结论，不能把所需具体名称误作分类否定。'],
 ['新卡只给panda与bear文字，问本课两张具体卡如何分别命名。可以据此直接推出大熊猫不属任何熊的科属关系吗？','按本课标签分别说panda大熊猫、bear熊；词卡命名区分不推出动物科属否定。先回答当前语言任务，科学分类需另有依据。'],
 ['当前要“动物园”，有人因里面有动物就选monkey。应写哪个完整词，为什么不等于动物名？','应为zoo，表示动物园地点；monkey为猴这一动物名。场景包含动物不使地点变成动物，当前文字识读与真实图像听辨分开。'],
]);
animals.add('animal-question','animal-this-that-and-answer','audio_record',['当前对象明确','问答名称与本例a/an相符','本人声音供核'],[
 ['原创近处卡明确dog，你演提问者。本人录询问这张卡的短句，再切角按给定名称回答。','可录What’s this? / It’s a dog.，当前指向近处dog卡。注明单人切角，需听实际声音，不冒充双方真人已交流。'],
 ['原创远处卡明确elephant。本人录What’s that问答，按当前本例说完整名称。','可录What’s that? / It’s an elephant.；对象与an elephant对应。实际声音是否可理解、提示与角色范围另核。'],
 ['原创近处duck、远处tiger。先指近处问，再指远处问，录两种当前对象回答，不沿一个名字全部答。','可按指向录It’s a duck.及It’s a tiger.，问题可分别What’s this/that。指向变化重新核，单人示例不等真实同伴对话。'],
 ['新近处卡cat，远处卡dog。本人录对近处卡的问答，不因旧题近处是dog就沿旧名。','可录What’s this? / It’s a cat.，当前指向cat；旧位置答案不替新标签。本人录音可理解与帮助分别核。'],
 ['当前角色站位改变，明确指向较远monkey卡。本人录询问和给定回应，this/that是动物的固定名称吗？','可录What’s that? / It’s a monkey.；this/that依当前指向，不是动物永久名字。本人发声及是否听过示范如实核。'],
 ['近处卡panda的标签已明确，不再猜。本人录What’s this问答，别把旧猜问bear留作已确认答案。','可说What’s this? / It’s a panda.，以当前明确标签回答。旧猜测不是确认，实际声音、原答及帮助顺序保持。'],
 ['当前给定较远elephant卡，你先看过本例an elephant再录。请录完整问答，能隐去先看参考吗？','可录What’s that? / It’s an elephant.，但先看参考的帮助保留。本人发声供核，不倒写未见独立首答，实际间隔另核。'],
]);
animals.add('animal-guess','animal-question-correction-evidence','short_answer',['猜问与确认分开','按随后信息更新','不扩大命名结论'],[
 ['原创遮住卡片，角色只问A bear?，对方尚未答。能认卡一定标bear吗？还缺什么？','不能，疑问只提出猜测，需要明确标签、回答或足够可辨图。不能从问句反填确认，也不能补尚未出现的对方话语。'],
 ['原创先问A bear?，随后另一人说No, it’s a panda.。当前卡该怎样更新，旧猜问还能算已证事实吗？','按给定明确回应更新为panda，旧bear是被修正的猜测而非确认。这里是具体命名任务，不推动物科属关系，原问答次序保留。'],
 ['原创手影像dog，随后揭示其实是人做的影子。可以说现实中出现了一只真狗吗？模型和对象怎样分？','不能由手影认有真实狗；可说影子模仿dog形状，真实对象是给定的人手。相像、猜测和揭示不同，不编额外动物事实。'],
 ['新卡只问A tiger?，另一人回答No，没有说名字。可以沿上题panda直接补吗？','不能，只知当前否定tiger猜测，具体名称仍未知；上题panda不替新信息。须另核标签或回答，不能用熟悉结尾补造。'],
 ['原创先猜dog，后来明确标签duck。有人因先猜时很自信就保留dog为正确，应怎样判断？','当前名称以明确duck标签核，最初dog仅为猜测；自信不代依据。保留最初回答和后续修正，不把修正后的答案倒写为首答。'],
 ['原创角色说I like it，但卡被遮住，没说动物名。可以因喜欢就认一定tiger吗？','不能，喜欢表达态度，不提供唯一动物名称；需要当前所指和身份资料。态度、猜问和确认各自分开，不补未给名称。'],
 ['本组bear卡与panda卡用不同英文标签，能把一次No命名修正写成全部生物分类知识已经测过吗？','不能，只核本题具体所指和标签。一次语境修正不替全部科学分类或本人掌握记录，相关知识需要相应任务和依据。'],
]);
animals.add('animal-like','animal-like-it-current-reference','audio_record',['it指当前对象','角色偏好表达合适','不代本人真实偏好'],[
 ['原创角色Lin明确喜欢当前tiger卡。本人录一句喜欢表达，并说明it指什么，不必提供真实个人喜好。','可录I like it.，it指当前tiger卡所示对象；需听本人声音。角色偏好不写成本人真实偏好，也不靠喜欢确认看不清的动物身份。'],
 ['原创对方展示已标dog的有趣玩具，角色Mei觉得很棒且喜欢。本人录合适赞赏与喜欢，不编真狗出现。','可说Cool! I like it.，当前对象是dog玩具；赞赏和喜欢不把玩具变真实动物。实际发声可理解及帮助另核。'],
 ['原创只有角色喜欢panda卡的条件。录一句喜欢表达，能由此断定所有同伴和本人也喜欢吗？','可录I like it.指该panda卡，但不能推所有人实际偏好。当前角色范围、本人声音和是否先看参考分别保持。'],
 ['新角色Bo喜欢monkey卡，it不能沿旧题指tiger。本人录表达并说明当前所指。','可录I like it.，it随当前对象指monkey卡。旧例不替新指向，角色偏好与本人实际喜好分开，声音供听核。'],
 ['角色Yu赞赏一张已标bird的原创图，本人录Cool或喜欢表达。图上画鸟是否等现场有真鸟？','可说Cool! I like it.等合适表达；喜欢当前bird图不证明现场有真鸟。本人发声与示意材料、帮助分别核。'],
 ['你不愿提供真实动物偏好，改演明确喜欢elephant卡的角色。本人可怎样录而不把角色变成个人资料？','可录I like it.并说明扮演角色、it指当前elephant卡；不写成真实个人偏好。录音实际可理解与提示另核。'],
 ['当前卡标签尚未明确，角色只是说Cool。本人录赞赏可以，能同时认已识别具体动物名并完成真人交流吗？','可录Cool.表示当前角色赞赏，但它不确认动物名或真人交流已发生。实际发声、指向未知及帮助事实分别保留。'],
]);
animals.add('animal-letters','animal-j-to-n-actual-writing','image_upload',['五组大小写对应','相似字形按样本核','本人作品与声音分开'],[
 ['原创本人写Jj、Kk、Ll、Mm、Nn并上传，可先看样本并如实说明；不要用印刷字代本人作品。','五组大小写对应且字形可辨，当前样本与字体差异另核。本人完成图不证明全部笔顺或字母名发音，看样本帮助保留。'],
 ['原创本人写Ll与Ii两组并标明大小写，上传实际作品；直竖外形相似就必须同一个字母吗？','L/l与I/i字母身份不同，按样本和大小写核具体字形，不只凭直竖认同。实际作品可见范围与声音、笔顺过程分开。'],
 ['原创本人按Nn、Mm、Kk顺序写并上传，注意当前排列不是字母歌顺序。','按Nn、Mm、Kk配对，字形清楚；不机械改为旧排列。本人作品和提示如实记录，完成图不代听音或无人帮助结论。'],
 ['新任务写Jj和Ll并标清下方点或竖形等当前样本特征；上传本人实际书写，不用旧卡自动代本次。','按当前J/j、L/l样本写清可辨字形，不用旧印刷卡作本人新写。图不独证过程、声音或未受助，实际到期另核。'],
 ['当前只要求写Kk、Nn两组，能因为喜欢Mm就改交另一组且称全部满足吗？请按实际作品说明。','应按当前K/k、N/n要求核，其他字母不能代所要求两组。实际写了什么如实保留，缺项不由参考图反填完成。'],
 ['本人暂未写Jj至Nn，只读了词例。可说明未写或现在写后上传，能由读词认手写已完成吗？','不能，读词与实际书写不同。新写本人图可核字形，未写保持未完成；听音、词音和完整笔顺仍需相应材料。'],
 ['本人一张Jj至Nn完成图能核可见字形，能直接证明jeep/jump等全部词已听懂且未受提示吗？','不能，完成图不提供输入声音或本人词音，也不证明无帮助。实际字形范围、原答和帮助保持，不扩大成全部任务通过。'],
]);
animals.add('animal-sounds','animal-j-to-n-specific-exemplars','audio_record',['当前完整词可理解','字母名与词例分开','具体两例不推全部规则'],[
 ['本人录jeep、jump与kite、Kate两组；Kate只作当前名称词例，示范帮助如实说明。','读四个完整词供听核，前组j、后组k是当前词例；不只报字母名。Kate不作本人真实名字，未有输入声音不认听辨。'],
 ['本人录long、leg及mum、milk，说明各组共同首字母，不把全部词音说成一样。','前组l、后组m，需听本人完整词的可理解程度；共同字母不等全词同音。示范、原答和是否受助分别保持。'],
 ['本人录nose、noodles，并说明这两个当前例词能否证明所有n词都已经会读。','需听实际完整词，两词共同首字母n；两个例子不证明所有n词已掌握。本人尝试、真实听辨和帮助范围分别核。'],
 ['换顺序jump、jeep，请本人先录完整词；可以只念J的字母名当两个词的回答吗？','不能只报字母名，应本人读jump、jeep供核。当前词例的声音与字母名分开，实际间隔、示范和帮助另核。'],
 ['新顺序Kate、kite，请录本人读法并说明是给定词例，不借名字编一个真人已经参与。','本人实际读Kate、kite供听核，名称例不证明真人参与或本人身份。字母k与整词分别学，是否先听示范如实保留。'],
 ['录milk、mum和leg、long两组，若先看过参考或听过示范，应怎样保留而不倒记独立首答？','可本人录四词，但先看或先听的帮助和时间顺序保持。听核实际可理解程度，不把文件存在直接当发音合格，间隔另核。'],
 ['本人只看nose/noodles印刷字还没听声音，现录自己的尝试可以，能同时勾已完成听辨吗？','可记录本人实际读词尝试，缺输入声音不能认听辨。两种材料分别核，原答、帮助和实际到期保留，不凭词形推听力表现。'],
]);
animals.add('animal-model','animal-imitation-model-and-identity','image_upload',['模仿对象明确','图模型与真实身份分开','可见姿态不代完整过程'],[
 ['文字Act like a bird，可画原创纸偶模仿鸟的示意并上传，不必实际表演；标明是示意。','图应标清模仿bird，纸偶示意不等本人已表演或变成鸟。当前只有文字，不认听辨，完整动作与帮助需另核。'],
 ['文字Act like an elephant，上传本人原创示意或实际可见材料，并说明单张图能证明什么。','对象应为模仿elephant；单图可核可见姿态或示意，不独证完整过程、声音或独立行动。模仿不把人或纸偶变成真大象。'],
 ['原创卡是一只dog玩具，要求画图标它所表示的动物。上传本人图并注明模型，不编现场有真狗。','可标dog玩具或其示意，所表示的动物名和真实材料身份分开。本人图不证明真狗出现、完整动作或输入声音。'],
 ['新指令Act like a monkey，画标清monkey的原创示意；不要沿旧bird题交相同标签称符合。','当前对象monkey，标签与示意应相符；旧bird标签不满足新指令。图示与本人真实表演不同，未做如实保留，声音另核。'],
 ['新文字Act like a panda，上传本人原创图或说明未做。可据模仿认现实熊猫都会同样表演吗？','不能，由本人的模仿或图示不推真实动物普遍行为。当前应标明panda及材料范围，静图不独证完整动作、听辨或无帮助。'],
 ['只有一张本人手影照片，被说“已经独立听懂并表演完整tiger动作”。请说明可见范围，必要时另画标清示意。','手影图仅支持所见形状或当前姿态，不自动证明听过指令、完整表演或没有帮助。tiger猜测与明确对象分别核，缺失保持未知。'],
 ['当前图画标zoo而非动物，要求Act like a tiger。可以把地点词zoo当模仿的动物名并认完成吗？','不能，zoo是地点，当前动物对象tiger是老虎。可按条件画或实际示意，材料身份和过程范围如实保持，不补听辨或参与记录。'],
]);

const food=packet('food','unit5',51,60,'Unit 5 Let’s eat!',[
 ['food-words','八类食物饮品词对应','在当前餐食语境中理解bread/juice/egg/milk/water/cake/fish/rice','完整词义对应，fish按当前食物或动物语境说明，菜单标签、容器数和实际食物分别核','词义识读'],
 ['food-request','按当前需要提出礼貌请求','在角色菜单中用I’d like或Can I have表达当前指定需要','对象正确且表达可理解，some不自动规定份数，请求不当已经得到','口语请求'],
 ['food-exchange','提供、致谢与回应分开','在明确角色交接中使用Here you are、Thank you和You’re welcome','发话角色和先后相符，语言例子不代真实交付、食用或同伴已经发言','交际顺序'],
 ['food-state','想要、饥饿、邀请和实际事实分开','区分I’m hungry、I’d like和Have some的当前作用','角色感受不代本人状态，邀请不当已经拥有或食用，明确语境后再解释have','语境理解'],
 ['food-letters','Oo至Tt大小写与本人书写','按本组Oo/Pp/Qq/Rr/Ss/Tt配对并实际写','大小写对应且可辨，p/q与r等形态按当前样本核，完成图不代笔顺或词音','字母书写'],
 ['food-sounds','按Oo至Tt具体词例试读','录本人读on/orange、pig/pen、queen/quiet、rice/red、six/Sarah、tiger/ten','完整词发声供听核，q例属于qu词，字母名不替词音，不推广全部读音规则','具体词与语音'],
 ['food-action','吃喝与当前对象指令理解','用原创卡片或菜单示意Drink/Eat/Cut等指令所指对象','动作与对象一致，语言示意不当本人真实吃喝或操作，文字不认听辨','指令与对象'],
],[
 'Unit5起页印刷46，食物请求、提供与致谢情境；角色句不作学生真实饮食偏好或已经得到的事实。',
 '跨页右图印刷47，Here you are与Thank you，提供的语言和实际交付及食用分别核。',
 'A部分I’d like、Here you are及Have some邀请，累加食物项目逐项保持，不把请求代已收到。',
 'bread/juice/egg/milk与I’m hungry及吃喝活动，角色状态不代本人真实状态或饮食建议。',
 'Oo至Tt、on/orange、pig/pen、queen/quiet、rice/red、six/Sarah、tiger/ten；q示例是qu词，不能当所有独立q规则。',
 'B部分Can I have请求、给与、致谢和You’re welcome，角色先后和当前所需对象分开。',
 'water/cake/fish/rice与Drink/Eat/Cut指令，原提取fish有连字和空格，短引保持准确，不悄改原文字节。',
 '找Oo至Tt和完整食物词计数；词牌数量、容器数与真实食量不同，不以图中杯数代当前词出现次数。',
 '听音二选一、菜单图词匹配和歌曲；没有音频不推听音答案，不复制菜单插图或歌词。',
 'C连续请求、提供和猫取鱼情节；Coke/ice cream为故事扩展，想要、收到和图示变化按当前依据核。'
],{
 title:'Let’s eat：想要什么，说清请求和回应',
 activation:{prompt:'原创角色Mei说Can I have some water, please?，对方还没回应。可以说她已经喝到水了吗？',expectedObservation:'这是请求，尚未给出提供或喝水事实；需要把想要、回应和实际发生的事分开。',bridge:'先认识菜单词，再学请求、提供和致谢。每句话都看当前对象和说话角色。'},
 concept:{explanation:'本组食物饮品词为bread面包、juice果汁、egg蛋、milk牛奶、water水、cake蛋糕、fish鱼肉或鱼、rice米饭。fish在当前菜单里按餐食理解，换到动物语境要看新对象，不能只靠一个熟悉词强定所有情境。菜单里写了两次water，是两个文字标签，不自动等有两杯水或本人喝了两杯。词、食物、容器和份数分别看当前任务。\nI’d like some juice, please.在这里是礼貌表达想要些果汁。Can I have some water, please?请求给些水；对象换成milk，就按当前需要换完整词。some在这些例子里表示一些，不自动说明一杯、两杯或全部。bread、rice、water等本例不随意补成几个独立物品词；eggs在当前请求例中可表示一些蛋。这里先用完整例句练习，不把本单元升级成所有可数不可数规则考试。\nHere you are在当前交接情境可表示给你。接受者可说Thank you或Thanks，提供者回应You’re welcome。请求者、提供者与致谢者要对应，不能把每句话都塞给同一个角色然后认双方已经交谈。单人可以切角练，但要说明范围。说了Here you are也不独自证明真实食物已经交付、收到或吃完，真正发生什么要看实际材料。\nI’m hungry表示说话者饿了，I’d like说明当前想要，Have some bread在本情境是邀请吃些面包。它与I have a ruler的所有物表达不同，不能只看have就译成对方已经拥有、吃下或应当吃某种东西。角色卡的饥饿与喜好不替学生本人状态；学生可用明确假设角色练，不必提供真实饮食资料。看见食物图片也不等本人尝过或同伴同意。\n动作词和对象一起核。Drink some milk、Drink some water是喝相应饮品，Eat some bread、Eat some rice是吃当前食物；Cut the cake是切当前蛋糕。此稿用原创菜单和纸卡表示对象与动作，做语言理解与角色交流；画图或指卡完成了什么就如实说明，不把纸卡示意当本人实际食用或完整操作。没有输入声音时，读懂文字不能记作听辨通过。\nOo、Pp、Qq、Rr、Ss、Tt先配对大小写再自己写。词例为on/orange、pig/pen、queen/quiet、rice/red、six/Sarah、tiger/ten。queen和quiet有qu组合，不能把这两个词的开头声音拆成独立q在所有词里的规则；Sarah是当前名称例，不是学生身份。字母名、印刷词、本人读词和实际听辨分别核，两例也不说明所有同字母词都一样读。\n故事里多次点单，要跟住每次要什么、对方说了什么和图上发生了什么变化。想要fish不说明已经吃到，盘中变化要看当前图与话，Coke和ice cream等故事扩展不自动追加为八个重点词同样的书写要求。以后换菜单与角色，先自己说，再看示例比较，实际示范帮助保留。',
 points:['八个词读完整','fish按当前语境理解','请求不等已经得到','some不自动给份数','提供、致谢与回应按角色','hungry与想要、邀请不同','纸卡示意不代真实吃喝','Oo至Tt词例与qu组合分清']},
 example:{situation:'原创纸面菜单只有water、bread、milk；Bo想要水，Mei扮提供者。这是角色练习，没有真实交付食物。',steps:[
 {explanation:'Bo可说Can I have some water, please?，明确当前对象是water，不因旧题想要juice就换错。',board:['Bo请求water','Can I have some water, please?','请求尚不是收到']},
 {explanation:'Mei可指water卡说Here you are.，Bo说Thank you.，Mei回应You’re welcome.；单人演两角也要标清说话者。',board:['提供者 → Here you are.','接受者 → Thank you.','提供者 → You’re welcome.']},
 {explanation:'完成纸卡交流，可如实说练了请求与回应；不能说本人已喝水或对方实际递来一杯。',board:['菜单角色练习','实际交付另核','some未给定精确份数']}
 ],conclusion:'对象、角色和先后相符才有合适交流，纸面示例与本人实际吃喝分开。'},
 visuals:[{kind:'table',title:'食物词与当前任务',headers:['词或词组','当前意思','不要自动推出什么'],rows:[['bread / rice','面包 / 米饭','词出现次数不等真实份数'],['juice / milk / water','果汁 / 牛奶 / 水','饮品标签不等本人喝过'],['egg / cake','蛋 / 蛋糕','示例请求不等实际收到'],['fish','本菜单为鱼肉；别的情境也可指鱼','不脱离当前语境强定全部意思']],explanation:'此表为原创文字菜单比较。实际图词、声音与本人食用或操作分别核，故事扩展词不统一追加书写要求。'},
 {kind:'table',title:'Oo到Tt：按当前词例学习',headers:['大小写','本页词例','范围'],rows:[['O / o','on / orange','字母名和词中音分开'],['P / p','pig / pen','完整词不等只报P'],['Q / q','queen / quiet','当前例有qu，不扩为所有q规则'],['R / r','rice / red','两例不等所有音相同'],['S / s','six / Sarah','Sarah是名称词例'],['T / t','tiger / ten','本人录音和书写分别核']],explanation:'印刷词只给当前例子，没有音频不推听音圈选结果。本人真实尝试及示范帮助分别保留。'}],
 misconceptions:[{observation:'Can I have请求后就记已经收到或吃喝，some被固定解释为两杯。',alternatives:['把请求当结果或擅自补精确数量。'],verification:'按时间列请求、提供回应和实际材料，检查题目有无数量条件。',correctiveFeedback:'请求不代交付或食用，some本例不自动给几杯几份。'},
 {observation:'Have some bread一律当所有物陈述，或把纸菜单当真实饮食记录。',alternatives:['未看当前语境和材料身份。'],verification:'比较邀请与I have自述，标清纸卡示意和实际行为。',correctiveFeedback:'当前Have some为邀请；角色状态和示意不代本人真实饮食。'},
 {observation:'从queen/quiet推独立q在所有词里的固定声音。',alternatives:['把具体qu例过度推广。'],verification:'核当前两词实际字形组合，分别练完整词与字母名。',correctiveFeedback:'本组是qu词例，不拆成全部q规则；真实输入音频与本人词音另核。'}],
 transfer:{scenario:'新菜单换成milk、rice、cake，交换请求者和提供者，再给一个明确动作指令。',prompt:'按当前需要请求与回应，用纸卡标明对象和动作，说明角色练习的范围。',expectedStrategy:'不沿旧juice或water答案，不把邀请、提供文字或纸卡当真实食用，帮助与原答分开。'},
 summary:{synthesis:'先对上菜单词，再按角色完成请求、提供和致谢。想要、饥饿、邀请与已经吃喝不同，字母和具体词音也要分别学。',takeaways:['完整食物词','请求对象正确','some不补份数','交接按角色','Have some看语境','纸卡与真实行为分开','qu例不泛化','Oo至Tt分别写读']},
 citations:[{page:53,quote:'Have some bread, too.',usedFor:'concept'},{page:54,quote:'Drink some milk.',usedFor:'transfer'},{page:55,quote:'Write and say.',usedFor:'visual'},{page:56,quote:'Can I have some water, please?',usedFor:'example'},{page:57,quote:'Drink some water.',usedFor:'concept'}],
});
food.add('food-words','food-current-menu-word-meaning','short_answer',['八词语义对应','当前语境保持','标签容器和实物分开'],[
 ['原创菜单词bread、juice、egg、milk分别是什么？这些词印在卡上，能认本人实际吃喝过吗？','分别面包、果汁、蛋、牛奶；文字可核词义，不证明本人食用过或听过声音。当前词卡与实际饮食分开。'],
 ['原创把“水、蛋糕、鱼肉、米饭”对应water/cake/fish/rice，fish在这份餐单按什么语境理解？','依次water、cake、fish、rice；本菜单fish按鱼肉餐食理解，换动物情境再看所指，不能强定所有场景同一具体意思。'],
 ['原创文字卡water、milk、water、rice，问完整water出现几次。可以把结果直接说成本人喝水杯数吗？','完整water两次，第1和第3张；不能变成本人喝了两杯。词牌数、容器数与真实饮用事实不同，声音和图像另核。'],
 ['新菜单给cake、bread、rice，当前要“米饭”应选哪个？不按上题的面包位置猜。','选rice，cake为蛋糕、bread为面包；按当前完整词义，不沿旧位置。这只是文字任务，不代真实听辨或已经食用。'],
 ['同一个fish在动物图与餐单里出现，能不看当前对象就强行说两处一定都只指盘中鱼肉吗？','不能，fish可随语境指鱼或鱼肉，需核当前材料；餐单语义不替动物图对象，也不能由一个词推本人饮食经历。'],
 ['原创文字菜单列milk、juice、water，按“果汁、水、牛奶”顺序重排，别沿原顺序全部抄。','依次juice、water、milk；完整词与当前意思对应，不能用旧排位。没有声音不认听辨，本人是否读出另听实际录音。'],
 ['菜单同时写egg和cake，学生只因都可能甜就选同一项。当前中文分别是蛋与蛋糕，应怎样对应？','蛋对应egg，蛋糕对应cake，不能由经验味道把两个不同词合并。当前标签和已给条件优先，不编未提供的品尝或偏好。'],
]);
food.add('food-request','food-current-polite-request','audio_record',['请求对象正确','表达可理解且礼貌','请求不当已收到'],[
 ['原创角色Bo想要果汁，菜单有juice。本人录一句礼貌请求，角色需要不当真实个人偏好。','可说I’d like some juice, please.或Can I have some juice, please?；对象正确供听核，请求不证明实际得到或喝过。'],
 ['原创角色Mei要水，请本人录Can I have请求，不沿旧果汁题改错对象。','可录Can I have some water, please?，当前要water；需实际听本人可理解程度。some不自动给几杯，请求和交付分开。'],
 ['原创菜单只给bread、milk、rice，角色Lin要米饭。本人录合适请求，不因熟悉water句就沿用。','可说I’d like some rice, please.或相应Can I have表达；按当前对象。本人实际声音和帮助另核，菜单角色不代真实进食。'],
 ['新角色Yu要牛奶，先自己录礼貌请求；如果先听了样本，保留帮助顺序。','可录Can I have some milk, please?等合适请求；milk对象相符。先听示范如实说明，不倒写独立首答，也不认已经喝到。'],
 ['当前角色要一些蛋，菜单用eggs表示这次项目。录I’d like请求，不把some固定译成两个蛋。','可说I’d like some eggs, please.；some这里未规定精确个数。实际词句可理解、提示与角色范围另核，请求不代食用。'],
 ['新菜单明确想要bread，角色An本人独自练。录一个请求并说明只是单人角色句，不编对方回应。','可录I’d like some bread, please.；当前bread正确。单人发声不证明真实交付或同伴回应，声音与帮助实际核。'],
 ['角色刚说想要cake，对方还没动作。本人录礼貌请求，能顺带写“已收到一整块”吗？','可说Can I have some cake, please?，但请求不支持已收到或精确份量。真实声音、原答与帮助另核，未给条件不补结果。'],
]);
food.add('food-exchange','food-offer-thanks-response-order','audio_record',['交接角色相符','致谢回应顺序正确','单人角色与真实交付分开'],[
 ['原创单人切角练提供water卡、接受致谢、提供者回应。本人录三句并标清角色，不说已真实交付水。','可依次Here you are. / Thank you. / You’re welcome.；角色和顺序对应。需听实际录音，纸卡交流不等食物已交付或饮用。'],
 ['原创你演接过bread卡的Mei，对方刚说Here you are。本人录合适致谢，不把You’re welcome抢作接受者感谢。','可说Thank you.或Thanks.；You’re welcome通常回应致谢，发话功能不同。实际声音和角色范围供核，不补真实吃过的事实。'],
 ['原创你演提供者，对方说Thank you。本人录回应，别把它解释为又一次请求食物。','可录You’re welcome.，是对当前致谢的回应，不是食物请求。本人录音供听核，角色交接不证明真实食物或真人双方互动。'],
 ['新角色Bo提供milk卡给An，独自录双方交接三句，先后不要混。','可Here you are. / Thanks. / You’re welcome.，标清提供者、接受者与回应者。单人切角范围和帮助保持，不编实际喝奶。'],
 ['当前接受者拿的是rice纸卡，想表达感谢。请录合适一句；纸卡是否证明拿到真实米饭？','可录Thank you.或Thanks.；纸卡不等真实米饭，实际交付和食用另核。本人声音可理解及是否看过参考如实说明。'],
 ['角色提供者回应对方感谢，本人先看参考You’re welcome再录。能删除先看的帮助称独立首答吗？','可以录You’re welcome.供核，但先看帮助和顺序保持，不倒写独立首答。当前回应并不证明本人实际提供食物，间隔另核。'],
 ['当前只给一人Here you are的文字，没有真实回应。本人可单人补演三句练习，但能记成两名真人已经完成交流吗？','可注明单人角色练Here you are / Thank you / You’re welcome，不能补真人双方已发言。实际录音、帮助与参与范围分别核。'],
]);
food.add('food-state','food-want-invite-state-result','short_answer',['当前语境作用正确','角色与本人分开','请求邀请不当结果'],[
 ['原创角色说I’m hungry，另一人说Have some bread。两句话各起什么作用？能直接说明已经吃完吗？','前句角色说饿，后句邀请吃些面包；都不证明已吃完。角色感受不代本人状态，邀请与真实食用需另有事实。'],
 ['比较I have a ruler和餐食情境Have some rice。都有have，就可以都解释成已经拥有或吃过吗？','不能，前者自述有尺，后者在该情境邀请吃些米饭。按语境分功能，邀请不当已拥有或食用，也不由词形套同一解释。'],
 ['角色说I’d like some juice, please，对方尚未回应。能推出已收到两杯果汁吗？指出两个不足。','不能，请求不证明已收到，some也未给两杯数量。角色需要、实际交付与精确份数分别核，不补本人饮食事实。'],
 ['新角色只是看菜单觉得饿的假设卡，学生没有谈真实感受。可以把卡上hungry存为学生本人当时饥饿吗？','不能，卡是虚构角色条件，不代本人真实状态。可按角色练语言，实际本人感受未提供就不补，原答与帮助另存。'],
 ['对方说Here you are并指一张cake卡。可以说完成纸卡提供示意吗？能直接说本人已经切并吃了蛋糕吗？','可如实说明纸卡交接示意，不能推出实际切或吃过。语言、图示与真实行动分别核，指卡不独证后续完整过程。'],
 ['故事里角色先要fish，后来又要rice。只根据点单话，能认两样都已吃完且知道精确份量吗？','不能，点单是请求，实际收到、吃完及份量需看明确材料。逐次对象保持，不凭想要或熟悉故事补未知结果。'],
 ['Coke和ice cream出现在故事，能仅因出现就要求所有学生与八重点词一样默写并认本人已品尝？','不能，故事扩展、当前教学要求和本人经历不同。按明确目标分配要求，不由词出现自动升级默写，也不编饮食或听说经历。'],
]);
food.add('food-letters','food-o-to-t-actual-writing','image_upload',['六组大小写对应','本人字形可辨','作品声音过程分开'],[
 ['原创本人写Oo/Pp/Qq/Rr/Ss/Tt并上传，可看样本但如实说明；不能用印刷截图代新作品。','六组大小写对应且可辨，当前样本和字体细节分别核。本人完成图不证明完整笔顺、词音或无帮助，未写保持未完成。'],
 ['原创本人写Pp与Qq，标清小写p/q的当前样本方向并上传，不只因为都有圆和竖就合并。','p/q按当前样本区分方向并分别与P/Q配对，实际字形应清楚。图不代听音或全程笔顺，看样本帮助如实保留。'],
 ['原创按Tt、Rr、Oo新顺序写并上传，不把当前任务自动改回字母歌顺序。','按当前Tt、Rr、Oo写清大小写配对；不以熟练排列替要求。本人作品、提示和实际过程分别核，声音另听实际材料。'],
 ['新任务只写Ss和Qq两组，暂未书写时可说明；可以因会念两字母就自动记已写吗？','不能，会念不提供本次手写作品；可新写后核可辨字形。完成图不独证声音、笔顺或未受助，原答和实际间隔另核。'],
 ['本人写Oo、Pp并上传，老师看到字体略不同。应只按字体差异认另一个字母，还是核当前样本与身份？','应核当前样本、大小写身份和可辨字形，不因字体细节自动判另字母。实际作品范围、帮助和声音分别保留，不以印刷表代本人。'],
 ['新顺序Qq、Tt、Ss，请本人先写上传；若照样本临写，要如实说明，不能隐去称未见首答。','三组按当前要求清楚配对，临写帮助保持。完成图只核可见字形，不证明独立笔顺或词音，实际到期间隔另核。'],
 ['一张Oo至Tt完成图被要求同时证明queen/quiet听辨通过。图能支持什么，缺什么？','图能核可见书写和大小写，不能提供真实输入音频或本人词音。听辨、发音、帮助与实际间隔各需对应材料，不合并成全部通过。'],
]);
food.add('food-sounds','food-o-to-t-specific-exemplars','audio_record',['当前完整词可理解','qu组合与字母名分开','示例不推广全部规则'],[
 ['本人录on/orange、pig/pen两组，先听示范可说明。共同首字母是否等两词所有声音相同？','需听四个完整词的可理解程度，共同o或p不等全词同音。字母名不替整词，真实示范与本人原答帮助分别保持。'],
 ['本人录queen、quiet，指出本页两词开头都写qu。能把词例声音拆成独立q在所有词里的规则吗？','应读当前完整queen、quiet供听核；两例含qu，不能推出独立q在所有词里的规则。字母名、组合和词音分开，帮助如实说明。'],
 ['本人录rice/red、six/Sarah、tiger/ten三组；Sarah在这里是什么范围？','读六个完整词供核，Sarah是当前名称词例，不是本人身份或真人参与证明。各组首字母与全词不同，输入声音和本人发声分别核。'],
 ['换顺序orange、on，请本人先录完整词，不只念O字母名代两词。','应实际读orange、on供听核，O字母名不替完整词。当前例子不推所有o词读音，示范、原答与真实间隔另核。'],
 ['新顺序quiet、queen，本人看过词形但未听任何输入声音。可以录尝试吗？可同时认听辨已完成吗？','可以保留本人读词尝试，缺输入声音不能认听辨。当前两词含qu，不能据字形或文件存在认发音已合格，帮助和间隔另核。'],
 ['本人录red、rice与ten、tiger。两词同字母开头就能把后面所有声音照同一读法吗？','不能，应按当前完整词供听核，共同r或t不等全词声音相同。字母名、词音、示范和本人原答分别保持，不推广全部规则。'],
 ['本人先听过示范Sarah、six后录当前尝试。可以删去先听顺序称独立首答或把Sarah写成本人名字吗？','都不能；可录两词供核，但示范帮助保留，Sarah仅词例。真实声音、原答和间隔分别核，不倒写独立表现或本人资料。'],
]);
food.add('food-action','food-action-and-paper-menu','image_upload',['动作与当前对象相符','纸卡材料范围明确','示意不代真实吃喝'],[
 ['文字Drink some water，请在本人原创菜单或卡片上标水与喝的对应示意并上传，不必真的喝。','应对应water与drink，纸卡标清当前动作对象。示意不等本人实际喝过，没有声音不认听辨，完整过程和帮助另核。'],
 ['文字Eat some rice，请画本人原创纸卡示意，不能因旧题是milk就画喝奶当本题对象。','当前为吃rice米饭，与旧milk喝奶不同；对象和动作同时核。本人图只支持示意范围，不代真实食用、输入声音或无帮助结论。'],
 ['文字Cut the cake，请用本人原创纸面步骤或箭头示意并上传，标明语言示意而非真实操作。','应指当前cake和切的动作含义，纸面箭头或图示可核理解。图不证明本人真的切过或完成全过程，声音、原答和提示另核。'],
 ['新文字Drink some milk，画本人卡片示意并标对象，不能拿旧water图不加区分称已满足。','当前对象milk牛奶，动作drink；旧water对象需按当前条件改。示意不代真实喝奶或听辨，实际间隔及帮助分别保留。'],
 ['新文字Eat some bread，当前只提供纸卡。本人标对应词和动作后上传，可以记实际已经吃完吗？','可以核bread与eat的纸卡示意，不能记本人实际吃完。材料身份、声音与真实行为分别核，未发生环节保持未核。'],
 ['当前指令Have some juice为角色邀请，上传本人原创菜单标注。可以只因图上有杯子就认收到精确两杯并喝过吗？','不能，菜单标注可说明juice与邀请，杯图或some未给精确交付和食用事实。实际过程、声音和帮助另核，不补本人饮食记录。'],
 ['只有已画好的cake图，文字说Cut the cake。请说明或补本人原创示意，单张完整蛋糕图能证明切过吗？','不能，完整蛋糕图仅见对象，切的过程或结果要有相应示意或真实材料。本人图范围如实保持，文字不认听辨，也不由一图认完整动作。'],
]);

const birthday=packet('birthday','unit6',61,70,'Unit 6 Happy birthday!',[
 ['birth-numbers','one至ten与当前数意对应','按本组一至十词义和明确序列识读数词','数词、数字与当前数量对应，不由标签或念到某数推真实物品数，不统一追加全部默写','数词识读'],
 ['birth-quantity','按当前对象回答How many','在给定完整数量条件中用数词回应How many plates等问题','对象和已给数量保持，数量问句不混年龄或标签，实际发声供听核','数量口语'],
 ['birth-age','按明确角色回答年龄','分清How old与姓名问题，并用给定角色年龄实际说话','I’m ... years old与角色卡对应，未给本人资料不补真实年龄，示例蜡烛数不自动定年龄','年龄交际'],
 ['birth-greeting','生日祝福与致谢相配','在明确生日角色中说Happy birthday并回应感谢','祝福和致谢角色正确，文字角色不证明本人生日或真实聚会已经发生','场景交际'],
 ['birth-letters','Uu至Zz大小写与本人书写','按本组Uu/Vv/Ww/Xx/Yy/Zz配对并本人写','大小写可辨，字体与本人作品分开，完成图不独证词音或无帮助过程','字母书写'],
 ['birth-sounds','按Uu至Zz具体位置试读词例','录本人读umbrella/under、vet/vest、wet/water、fox/box、yellow/yo-yo、zoo/Zip','完整词可理解，x在fox/box末尾，不造词首x例；字母名、词音和真实听辨分开','具体词与语音'],
 ['birth-context','数量、编号、年龄与指称分开','在当前生日场景区分How many/How old/This one及数字标签','问题功能和单位保持，蜡烛未给规则不推精确年龄，角色家人和生日不改本人资料','数字与语境'],
],[
 'Unit6起页印刷56，How old与I’m six角色情境，示例年龄不代学生本人真实资料。',
 '跨页右图印刷57，祝福、礼物与计数情境，Birthday祝愿不证明本人生日日期或聚会发生。',
 'A部分This one所指蛋糕、How many plates与Five回应；选择对象、盘数和年龄不同。',
 'one至five、顺倒数与动作活动，部分数词以图像呈现，实际看图核，不从提取缺词推原页无词。',
 'Uu至Zz与umbrella/under、vet/vest、wet/water、fox/box、yellow/yo-yo、zoo/Zip；x为词尾例，听圈无音频不反推。',
 'B生日祝福、brother介绍及How old年龄角色，brother/plate白体听说不统一升级为核心默写，人物不是学生家庭资料。',
 'six至ten、角色年龄和手势数游戏；手势是本活动表达，不推广为所有文化或本人实际年龄。',
 '找Uu至Zz及鸭子数量匹配，完整对象计数不由标签序号代替，不把图上数量当本人年龄。',
 '听音正误、四类物品图数与数词圈选及蜡烛歌曲；缺音频不推正误，图示不代本人真实点烛活动。',
 'C礼物、惊喜、祝福与许多蜡烛的玩笑；数量与年龄关系未给规则不推精确年龄，不作本人年龄评价。'
],{
 title:'Happy birthday：数的是几个，问的是几岁',
 activation:{prompt:'原创卡写“7号桌有three plates”。7与three都表示数，问How many plates时该依据哪个？',expectedObservation:'7是桌号，three给盘子的数量；先看问题要数什么，不能拿先出现的数字代数量。',bridge:'生日情境会同时出现数量、年龄、编号和选择。每次先辨问题，再用相应数词或表达。'},
 concept:{explanation:'one、two、three、four、five分别一至五，six、seven、eight、nine、ten分别六至十。先把词和当前数意对应，再看任务问顺序、数量还是名称。会顺着说one到ten，不等每次看图都已经数对；倒着说也要按当前要求，不能把熟悉歌谣位置当物品数量。这里练识读、听说与给定数量回应，不把全部词统一追加为独立默写要求。\nHow many plates?问盘子有几个或当前需要几个盘子，要看上下文已给的完整数量。原创条件明确有four plates，可回答Four.；若还没有实际数过或完整数量条件，就不能只因角色看起来有四个人便填四盘。This one, please.在选择商品的情境里是“请给我这个”，one代当前选中的一个对象，不是在回答全部物品数量。some在请求中的用法也不提供精确盘数。\nHow old are you?问年龄。角色卡明确Bo六岁，可说I’m six years old.；问What’s your name?才按角色名字回答，两类问题不能仅因为都问人就混。角色卡的六岁、四岁或十岁不写成学生本人实际年龄，学生可以选择假设角色练，不必提供真实生日。看到数字6、六个盘子或六支蜡烛，也不能不看语境就把它当本人六岁。\n明确在某角色生日时，可向他或她说Happy birthday!，接受祝福的角色可说Thank you.。祝福、感谢、惊喜和真实聚会各有不同事实：角色练习说过一句，不证明学生本人今天生日，也不证明聚会已经发生。brother在本件表示兄或弟，单这个词不能推出年龄差多少或本人有某个真实兄弟；plate是当前盘子词，按本件词表的听说范围练，不统一追加默写。\n数量、标签和年龄可以出现在同一张图。桌号9只是桌号；How many gifts?需要实际礼物数或完整条件。蜡烛多不自动给精确年龄，只有题目明确说明每支代表一岁等规则并给完整数量时，才按该假设分析。故事的年龄玩笑不是学生个人资料或对真实人的年龄结论。当前示例手势也是本活动的数意表达，不强定所有文化都同一手势。\nUu、Vv、Ww、Xx、Yy、Zz先配大小写，再实际写。词例为umbrella/under、vet/vest、wet/water、fox/box、yellow/yo-yo、zoo/Zip。x在fox和box里位于末尾，这页并没有把它们当x开头的词；不能为了套词首模板改写位置。Zip是给定名称例，不是学生本人身份。字母名、具体词音、本人录音和听到输入声音分开，两个例子不推所有读音规则。\n练习可以用原创数字卡、纸面盘子和虚构生日角色。实际数过、说过或写过什么就保留那个范围，唱歌、角色台词、看到参考和本人原答分别记录。换一组数量与年龄条件后，先自己辨问题，再实际回答，示范与帮助如实说明。',
 points:['one至ten与数意对应','顺序和实际数量不同','How many看对象和完整数量','How old问年龄，不问名字','This one可指所选对象','桌号蜡烛与本人年龄不混','祝福不代本人生日事实','Uu至Zz中x例在词尾']},
 example:{situation:'原创假设生日卡：Bo八岁，桌号3，给定盘子数five。Lin问盘子和年龄，两问分别回答。',steps:[
 {explanation:'How many plates?问盘数，按完整条件回答Five.；桌号3不替五个盘子。',board:['桌号：3','盘子：five','How many plates? → Five.']},
 {explanation:'How old are you?问角色Bo的年龄，Bo可说I’m eight years old.，不能答Five或桌号Three。',board:['Bo角色年龄：eight','I’m eight years old.','角色年龄不改本人资料']},
 {explanation:'Lin向生日角色说Happy birthday!，Bo回Thank you.。只做单人纸卡练习就如实说明，没有真人聚会不补事实。',board:['祝福者 → Happy birthday!','接受者 → Thank you.','单人练习范围保持']}
 ],conclusion:'同场景不同数字各有角色，回答要对上当前问题；示例年龄、桌号和盘数不代学生本人信息。'},
 visuals:[{kind:'table',title:'生日场景的数字先问用途',headers:['表达或条件','当前在问或表示什么','不要混成什么'],rows:[['one … ten','一至十的数意或指定顺序','念到哪里就有几件物品'],['How many plates?','盘子数量或所需个数','角色年龄或桌号'],['How old are you?','当前角色年龄','姓名、盘数或生日日期'],['This one, please.','选择当前一个对象','全部对象总数'],['桌号9，蜡烛多','标签或已给可见范围','未给规则就推精确年龄']],explanation:'用原创条件分清数字角色。真实看图计数、听辨和本人生日资料分别核，未给事实不自动补全。'},
 {kind:'table',title:'Uu到Zz：注意x在例词中的位置',headers:['大小写','本页词例','当前范围'],rows:[['U / u','umbrella / under','字母名和词中声音分别学'],['V / v','vet / vest','完整词不等只报V'],['W / w','wet / water','两例不推全部读音规则'],['X / x','fox / box','x在词尾，不是词首例'],['Y / y','yellow / yo-yo','词形与实际声音分开'],['Z / z','zoo / Zip','Zip为名称词例，不代本人身份']],explanation:'先读当前例词和位置，再听真实示范、录本人尝试。没有输入声音不认听辨，实际书写也不由印刷字代替。'}],
 misconceptions:[{observation:'用桌号或盘子数回应How old，把示例年龄写进学生档案。',alternatives:['未辨数字用途和角色范围。'],verification:'标出当前问题、单位和已给角色，再分别回答盘数与年龄。',correctiveFeedback:'数量、标签和年龄分开，虚构角色不改本人资料。'},
 {observation:'只见许多蜡烛便确定精确年龄，或This one被解释为全部数量为一。',alternatives:['未经给定规则补关系，或忽略当前选择语境。'],verification:'核是否有完整数量与年龄编码规则，确认one是选择指称还是计数。',correctiveFeedback:'先看完整条件和语境，未知关系不编；指称不替总量。'},
 {observation:'把fox/box写成词首x示例，或唱数词歌就认全部听说写完成。',alternatives:['套统一词首模板，或把任务表现合并。'],verification:'逐字看fox/box的x位置，分别核本人声音、书写和实际输入。',correctiveFeedback:'本页x在词尾；词音、听辨、字形和当前数量各自核。'}],
 transfer:{scenario:'换成桌号9、角色六岁、盘子four，选择对象也改成另一张卡。',prompt:'分别回答数量、年龄与选择，不套旧数字；给生日角色说祝福并保留真实练习范围。',expectedStrategy:'先辨用途再用数词，保持当前角色、对象与完整条件，字母例词按真实位置读。'},
 summary:{synthesis:'生日场景先分清问数量还是年龄，数字标签与所选对象也不同。按当前角色回答，例词位置、本人声音和实际作品分别核。',takeaways:['one到ten分清数意','How many看对象','How old看角色年龄','This one看当前选择','标签不当数量','蜡烛未给规则不定年龄','祝福与真实生日分开','fox/box的x在尾部']},
 citations:[{page:63,quote:'How many plates?',usedFor:'activation'},{page:63,quote:'This one, please.',usedFor:'concept'},{page:65,quote:'Write and say.',usedFor:'visual'},{page:66,quote:'How old are you?',usedFor:'example'},{page:67,quote:'Show me six.',usedFor:'transfer'},{page:70,quote:'I have two gifts.',usedFor:'concept'}],
});
birthday.add('birth-numbers','birthday-one-to-ten-current-meaning','short_answer',['数词数意对应','当前顺序条件保持','不由词牌推真实物品'],[
 ['原创词卡one、two、three、four、five分别表示多少？当前只给词卡，不给真实盘子。','依次一、二、三、四、五；文字可核数意，不能由词卡认真实有相应盘数或本人已数过实物，没有声音不认听辨。'],
 ['把“六、七、八、九、十”对应six/seven/eight/nine/ten，按当前顺序答，不按卡片位置猜。','依次six、seven、eight、nine、ten；完整词与数意相符。当前文字识读不代本人实际发声、默写或真实看图计数。'],
 ['原创明确按one、two、空位、four顺序续说，空位应是什么？若只会背全歌，能不看当前顺序随便填吗？','空位three，当前顺序为一二三四；不能以熟悉歌谣位置替新条件。数词顺序不证明本人已数清物品，声音与帮助另核。'],
 ['新顺序ten、nine、空位、seven，要求按每次少一续。空位填哪个完整词？','填eight，按十、九、八、七的明确顺序。要看当前递减规则，不能沿上一题递增；文字答案不代真实听说或物品数量。'],
 ['完整词卡five、nine、five、one，问完整five出现几次，不问有几个真实礼物。','完整five两次，第1和第3张；词出现次数与数词five表示五不同，也不证明真实礼物数。按当前问题区分角色。'],
 ['当前要“七”这一数词，可选six、seven、ten。选哪个，能只因ten在最右边就当最大物品数已知吗？','选seven；six六、ten十。文字卡排位不提供真实物品总数，不能由位置补实际数量或本人已听过的事实。'],
 ['有人顺着念到ten，就说桌上一定十个盘子但没有盘图和数量条件。当前还能确定什么，不能确定什么？','可以知道ten表示十或他说到十，不能确定真实盘子数。需完整对象或明确数量再核，顺背不替当前计数与本人实际表现。'],
]);
birthday.add('birth-quantity','birthday-current-how-many-answer','audio_record',['对象和完整数量对应','数词发声可理解','不混年龄和标签'],[
 ['原创条件明确four plates，你演回应者。本人录How many plates的数量回答，不把桌号7当答案。','可录Four.或Four plates.，依据明确四盘；桌号不替盘数。听本人实际声音核可理解，给定条件不证明已数过实物。'],
 ['原创明确需要five plates，角色被问How many plates?。本人录当前数量回应，不沿上一题four。','可说Five.或Five plates.，按当前所需五盘。发声与帮助另核，盘子数不是角色年龄或本人实际准备数量。'],
 ['原创有three gifts且桌号9，问How many gifts?。本人录数量回答，不能因为9先出现就答nine。','可录Three.或Three gifts.，问题是礼物数。桌号9为标签，需实际听本人声音，不把纸卡条件代真实聚会。'],
 ['新条件明确six plates，问盘子数。本人先录回答；如果数量条件没给全，会直接套six吗？','当前可说Six.，依据完整条件；若缺条件就先核，不能机械套数。声音、原答和是否受助分别保持，实际间隔另核。'],
 ['当前桌号2但有eight gifts，问How many gifts?。录一个符合数量的短答。','可录Eight.或Eight gifts.，不能拿桌号Two替数量。当前角色纸卡与真实实物分开，录音可理解及提示另核。'],
 ['新条件nine plates、角色六岁。本人录盘数短答；年龄会改变这题盘数吗？','可说Nine.或Nine plates.，问题与完整条件是九盘，角色六岁不替盘数。实际发声与帮助另核，不补本人真实生日资料。'],
 ['只有问句How many plates?，没有完整盘图或数量。本人可录说明暂未知，能因为常见四人桌就答four并认确定吗？','不能，缺完整数量资料要先核，可如实说明暂不知道。常见桌型不代本题数量，声音、帮助及实际间隔分别核，不编确定答案。'],
]);
birthday.add('birth-age','birthday-current-role-age-answer','audio_record',['年龄问句功能正确','当前角色年龄对应','不代本人真实资料'],[
 ['原创角色Bo六岁，被问How old are you?。本人录角色回应，不必提供真实年龄。','可说I’m six years old.或I’m six.，按明确角色年龄；不是报姓名。听实际声音核可理解，六岁不写作学生本人真实资料。'],
 ['原创角色Mei八岁，对方问年龄。本人录回应，不能沿旧Bo六岁的答案。','可录I’m eight years old.，当前角色八岁。需要实际本人声音，角色与本人年龄分开，是否先看参考如实说明。'],
 ['原创角色Lin十岁且有three plates，问How old are you?。本人录年龄回答，不用盘数three。','可说I’m ten years old.；问题问年龄，不是盘数。角色卡不代真实个人资料，声音与帮助实际核。'],
 ['新角色Yu四岁，请先本人录年龄句；单人练习就说明，不编对方也说过什么。','可录I’m four years old.，按当前角色。单人范围和帮助保持，不补真人交流或学生实际年龄，实际间隔另核。'],
 ['当前角色An七岁，问句换成What’s your name?。本人录姓名回应，别机械用年龄句答所有问题。','可录My name’s An.或I’m An.；当前问名字，不应只说I’m seven。本人声音、角色范围及帮助另核，不改真实档案。'],
 ['角色卡没给年龄，只画六个盘子。有人要本人录I’m six并认年龄已知，依据够吗？可录当前未知说明。','不够，盘数不提供角色年龄；可说明需年龄卡再答，不硬套六岁。本人实际录音与未知范围保持，不能补真实个人信息。'],
 ['先看过参考I’m nine years old，当前角色也九岁。本人录尝试后，能删除先看顺序称独立首答吗？','可说I’m nine years old.供核，但先看参考帮助保留，不倒写独立首答。角色年龄不代学生实际年龄，声音和间隔另核。'],
]);
birthday.add('birth-greeting','birthday-wish-and-thanks-role','audio_record',['生日场景已明确','祝福与感谢角色正确','单人练习不代真实聚会'],[
 ['原创明确今天是角色Mei的生日，你演送祝福者。本人录一句祝福，不把虚构日期写为本人生日。','可录Happy birthday!，对象是给定生日角色；听本人实际发声。角色情境不证明学生本人今天生日或真实聚会发生，帮助另核。'],
 ['原创你演收到生日祝福的Bo。本人录回应感谢，不把祝福者与接受者角色混。','可说Thank you.或Thanks.，回应当前祝福。声音需实际听核，角色句不代本人真实生日或礼物已经交付。'],
 ['原创独自演祝福者与接受者两角，录祝福和感谢，明确没有真人同伴参与。','可依次Happy birthday! / Thank you.，角色顺序清楚；单人切角不认双方真人已交流，实际声音与帮助分别保留。'],
 ['新生日角色Yu，你演Lin祝福。本人录当前祝福，不必透露本人生日日期或年龄。','可录Happy birthday, Yu!或Happy birthday!，对应给定角色。真实本人生日未提供就不补，声音和是否先听示范另核。'],
 ['当前只说“见面”，没说明生日。可以先问清场景或按普通问候练，能认人人都应生日祝福且今天生日吗？','不能从普通见面认生日事实；可如实说明场景不足。本人录音范围清楚，生日角色需明确条件，不自动补学生或同伴日期。'],
 ['角色收到祝福但礼物交付未给。录一句感谢后，能顺带记本人已收到两份礼物吗？','可说Thank you.等合适回应，但感谢不证明两份礼物或真实交付。声音、角色范围和帮助分别核，实际间隔另核。'],
 ['本人先跟读Happy birthday再录角色尝试。可以完成练习，但能把跟读隐去称未受助首答或真实庆生活动吗？','不能；可录Happy birthday!供核，但跟读帮助与单人角色范围保持。本人发声、实际到期和是否真实聚会各自核，不补过程。'],
]);
birthday.add('birth-letters','birthday-u-to-z-actual-writing','image_upload',['六组大小写对应','本人字形可辨','完成图不代声音过程'],[
 ['原创本人写Uu/Vv/Ww/Xx/Yy/Zz并上传，看样本可如实说明，不以印刷表代新作品。','六组大小写对应、本人字形可辨；字体差异按样本核。完成图不独证笔顺、词音或无帮助，未写保持未完成。'],
 ['原创本人写Vv与Ww两组并上传，不因都含斜线就合成同一字母。','V/v与W/w身份不同，按样本写清各组大小写。图可核可见形状，不能代本人声音或完整笔顺，看样本帮助如实保留。'],
 ['原创按Zz、Xx、Yy顺序本人写并上传，不能把当前顺序自动改回歌谣排列。','按当前三组配对写清字形，旧顺序不替要求。实际作品和提示保持，完成图不认输入声音、发音或独立过程。'],
 ['新任务本人写Uu与Yy，看当前样本比较字形并上传；若还没写，可如实说明。','两组大小写分别对应、字形可辨；未写不能用旧印刷表代本人作品。图不独证词音、笔顺或未受助，实际到期另核。'],
 ['当前本人只写Xx、Zz，要求的是六组Uu至Zz全部。可以保留已写范围吗？能把其余四组自动记完成吗？','可如实保留X/x、Z/z已写范围，其他四组缺项不补。本人实际作品、帮助和间隔另核，不由部分成功认全部书写完成。'],
 ['新顺序Ww、Uu、Vv，请本人先写后上传，若临写样本要说明，不倒写独立首答。','按当前三组大小写可辨书写，临写帮助保持。图不证明声音或全程无人提示，真实间隔和本人原答另核。'],
 ['一张Uu至Zz完成图能否直接证明fox/box词音、所有z字母名变体和听圈题都通过？','不能，图只核可见字形，不提供输入音频或本人发声，也不替多种语音任务。作品范围、帮助及实际间隔分别保留。'],
]);
birthday.add('birth-sounds','birthday-u-to-z-exact-word-position','audio_record',['完整词声音可理解','x当前在词尾','字母名与词例帮助分开'],[
 ['本人录umbrella/under与vet/vest两组，先听示范可如实说明，不只报U或V字母名。','读四个完整词供听核，字母名不替词例。当前示范和本人原答帮助分开，两例不推全部u/v词规则，没有输入声音不认听辨。'],
 ['本人录wet/water和fox/box，指出x在后两个词哪个位置，不能把它们说成x开头。','fox、box的x在末尾，本人录完整词供核；wet/water为当前w例。位置与声音分别看，不造词首x例，原答和帮助保持。'],
 ['本人录yellow/yo-yo及zoo/Zip；Zip在这里是什么，能代本人名字或真人参与吗？','读四个完整词供听核，Zip只是给定名称词例，不代本人姓名或真实参与。字母名、词音和实际输入声音分开，帮助如实说明。'],
 ['换顺序under、umbrella，请本人先录完整词；两个词能证明所有u词都同一读法或已经全部会吗？','不能，只核当前本人完整词尝试；两例不推广全部u规则。示范、原答和真实间隔另核，文件存在不等发音已合格。'],
 ['本人录box、fox并说x的位置；只因字母课按Xx排列，就可以把词中x改到开头再说原页如此吗？','不可以，当前box、fox的x都在词尾，应保留真实词形和完整词音。不能为套模板改写原件，输入声音、帮助和本人发声分别核。'],
 ['新顺序vest、vet、water、wet，先自己录完整词，再说明是否先听过示范；不以字母名代全部词。','实际读四词供听核，v/w当前例词与字母名不同任务。先听的帮助如实保留，不倒写独立首答，间隔与可理解程度另核。'],
 ['本人只看过yellow、yo-yo、zoo、Zip印刷词，现在录尝试可以；能同时勾真实听辨已完成吗？','可保留本人实际读词尝试，但缺输入音频不能认听辨。Zip不作本人身份，声音、词形、示范帮助和真实间隔分别核。'],
]);
birthday.add('birth-context','birthday-number-role-and-given-rule','short_answer',['问题和数字角色清楚','条件充足才推关系','虚构资料不改本人'],[
 ['原创桌号7、角色six岁、盘子three，问How many plates与How old分别依据哪个数？','盘数依据three，年龄依据six，7只是桌号；不同用途不混。角色卡年龄不代本人资料，给定数量也不证明实际聚会发生。'],
 ['原创选蛋糕时说This one, please，能解释为所有蛋糕总数恰一吗？当前one起什么作用？','不能，这里one代当前选中的对象，表示请给我这个；不是全部数量陈述。需看选择语境，不能由一个词补全真实库存。'],
 ['原创只画许多蜡烛，没有说明每支代表一岁，也没给完整数量。可以推精确年龄吗？','不能，缺完整数量及年龄编码规则；很多蜡烛不直接给几岁。故事玩笑、角色年龄和学生真实资料分开，不编精确值。'],
 ['新假设明确每支蜡烛代表一岁且完整共有eight支。可在这个假设里分析几岁？能自动写进本人档案吗？','在明说一支一岁且完整八支的假设里可得eight岁，但这只是角色条件，不改学生真实年龄。结论依当前规则与完整数量，不能泛化。'],
 ['角色介绍说This is my brother，未给年龄和长幼。能推出本人有弟弟、且对方一定小两岁吗？','不能，brother可为兄或弟，本句未给具体长幼年龄差；角色关系也不是学生本人家庭资料。按已知范围理解，不补真实信息。'],
 ['当前看见一个数字five标签，既没盘图也没年龄卡。能只凭标签同时答五盘、五岁和今天生日吗？','不能，数字标签用途未明确，不能同时填多个事实。需当前对象、问题和完整条件，示例或熟悉故事不代本人生日信息。'],
 ['本人只会唱one到ten歌曲并愿意参加角色游戏。能认所有数量、年龄问答已独立完成且真实生日聚会已参加吗？','不能，歌曲与意愿不代不同问题的本人实际回答，也不证明真实聚会。当前已做范围、原答及帮助分别保持，缺项不反填。'],
]);

const finalReview=packet('recycle-two','recycle2',71,74,'Recycle 2',[
 ['r2-dialogue','按当前混合场景完成短交际','在明确角色中分辨姓名、年龄、请求、提供、拒绝和感谢','问句功能、说话者及当前对象相符，礼貌拒绝可选，单人切角不代真人交流','综合交际'],
 ['r2-category','按当前词义和分类标准分组','把本稿词卡按动物、食物饮品、数字颜色文具身体等明确标准比较','先给标准再分类，fish随当前动物或餐食语境说明，不只按外框形状或位置猜','词义与分类'],
 ['r2-alphabet','26字母大小写复习与本人书写','按任务配对或本人书写Aa至Zz，辨相似字形与缺项','字母身份、大小写和当前顺序清楚，部分作品不代26字母全部完成，图不代声音','字母综合'],
 ['r2-number','数词与当前问题对应','在明确数量、年龄或标签场景中选择当前数词与对象','one至ten数意正确，数量年龄和编号不混，词牌数不当实际物品数','数字综合'],
 ['r2-sound','按整册具体词例与位置复习','本人试读给定例词并辨i的ice例、qu组合和x词尾','当前完整词与位置保持，不统一套词首模板或全部短元音规则，输入与输出声音分开','语音综合'],
 ['r2-game','综合游戏按条件核下一步与已做范围','在原创蛇梯和任务卡中保留当前规则及本人实际回答','位置、游戏结果、真实作答与参考帮助分别核，缺项不反填，角色活动不代真实参与','规则与自查'],
],[
 'Recycle2起页印刷66，拒绝与请求、姓名年龄和赞美/指称的故事对话；图文角色不作学生真实身份或经历。',
 '原页67六组听音二选一与动物/食物词分类，缺音频不推选择，fish依当前语境、外框形状不独自给标准。',
 '原页68综合蛇梯游戏含食物交际、动物、数与字母，按当前规则；棋位和胜负不代本人逐项表现。',
 '原页69补26字母大小写及字母歌图示，字母名、字形和词音分开，x图为fox的词尾位置。'
],{
 title:'Recycle 2：把学过的话用在新的条件里',
 activation:{prompt:'原创卡写“角色Lin八岁，桌号3，要four plates”。对方先问年龄、再问盘数。能两次都照着最先看到的3回答吗？',expectedObservation:'不能，年龄用eight，盘数用four，3为桌号；同一情境的不同问题要重新核用途。',bridge:'综合复习先分任务，再用完整词和合适表达；角色、词义、字母与规则不能只靠旧答案。'},
 concept:{explanation:'先听清或读清当前在问什么。What’s your name?问名字，How old are you?问年龄，How many plates?问盘子数；角色卡里的名字、年龄和物品数不能互换。请求食物时可说Can I have some bread, please?，提供者可说Here you are，接受者致谢。若角色不需要当前提供物，可以用No, thanks.礼貌拒绝，再按明确需要请求，不能为了配合示例便把“给了”或“吃了”当已经发生。\n理解对话还要跟住所指。Look at your head中的your随当前受话者确定，I like it里的it指当前已明确对象。赞美或大写强调不自动证明对方真是朋友，也不提供本人真实身份；故事里角色说什么就按当前图文分析，未给的心理和后续不补成事实。单人可切换多角色练，但不能记成几名真人实际已经说过。\n分类先说标准。本稿若明确按动物名分组，cat、dog、duck、bear、elephant等可按当前词义比较，red颜色、six数词、hand身体词不是同样类别。若标准为当前餐食与饮品，bread、rice、milk、water等按菜单语境放入。fish可在不同语境指鱼或鱼肉，标准和当前对象要说明，不能无视语境硬给一个所有题都通用的组。外框画成熊或面包，只是任务提示之一，不代明确分类标准。\none至ten可用来回答给定数量，但词牌、物品和标签分别看。一张卡写six，不证明桌上真的六件；三张完整词卡two、two、six问two出现次数，是两张，不是在问six数意。How old只按给定角色年龄，未给真实资料不填学生年龄；生日祝福、蜡烛和角色台词也不变成真实生日记录。\n26字母先配对大小写，再按当前要求自己写或补缺项。A/a、B/b直到Z/z各有对应，顺序题、相同字形题与大小写配对题不是一个规则。不同字体的细节要看样本，不能只凭相似直竖或圆弧合并身份。只写了前九组就如实保留部分范围，不把唱歌或旧印刷表当本人26组已写完。书写、字母名与词中声音分别核。\n整册词例也有位置差异。i在本册当前例中用ice、ice cream，不统一改成短i；queen、quiet包含qu组合，不拆成独立q在所有词里的规则；fox、box的x在末尾，不伪造为x开头例词。字母歌图中用一个词帮助联想字母，也不等这个字母永远在词首、每个音都一样。先看真实词形，再听实际声音、录本人尝试，缺输入声音就不认听辨通过。\n综合蛇梯仍按本局明说规则。原创小棋盘可约定梯底上升、蛇头下降，并为当前格给一项明确任务。走到终点、赢一局、愿意参加或唱完整首歌，不代每项本人独立回答。先保留实际原答、是否看参考与得到帮助，再用新任务核哪里还需要练；不能为了写满进度补造未发生的交流、动作或长期表现。',
 points:['先辨问题功能','按当前角色与对象回答','拒绝与感谢都要看场景','分类先明确标准','fish看当前语境','数词标签年龄分开','26字母配对和实际写分开','i、qu、x按本册词例与位置核']},
 example:{situation:'原创角色卡：Yu七岁，想要water，桌上明确three plates。Lin依次问名字、年龄、盘数，再练水卡交接。',steps:[
 {explanation:'Yu可依次按问题回答My name’s Yu.、I’m seven years old.、Three.，不能用同一个数字或名字代全部问题。',board:['姓名 → Yu','年龄 → seven','盘数 → three']},
 {explanation:'Yu可说Can I have some water, please?，Lin以Here you are提供纸卡，Yu致谢，Lin回应You’re welcome。',board:['当前请求water','角色交接按先后','纸卡不代真实饮用']},
 {explanation:'单人切角练习就说明单人范围；先看参考的帮助保留。复习清单按实际完成项记，不由游戏结束补齐缺失原答。',board:['实际原答保持','帮助顺序保持','缺失任务不反填']}
 ],conclusion:'每句都依据当前问题和角色；综合活动的完成记录必须与实际做过的任务一致。'},
 visuals:[{kind:'table',title:'混合任务先辨类别和问题',headers:['当前材料或问题','可先判断什么','仍需分清什么'],rows:[['姓名 / How old / How many','名字、年龄、数量各有用途','角色资料不代本人'],['动物名 / 食物饮品','按明确标准和当前语境分组','fish的语境、颜色和数词别混'],['Aa … Zz','大小写身份和指定顺序','本人书写不由印刷表或唱歌代替'],['ice / queen / fox','具体词例及i、qu、x的位置','不统一套词首或全短元音模板'],['蛇梯位置 / 游戏结束','按当前规则分析状态','位置和胜负不代本人原答']],explanation:'这是原创复习清单与条件对照，不复刻教材棋盘、分类画或歌词；真实声音、本人作品和实际互动分别核。'}],
 misconceptions:[{observation:'问题换了仍用同一个名字或数字答，或把角色年龄写进学生资料。',alternatives:['漏看当前问题和数字用途。'],verification:'逐项说现在问什么，再对应明确角色条件。',correctiveFeedback:'姓名、年龄和数量分别回应，角色资料不覆盖本人。'},
 {observation:'外框像面包就把其中所有词都当食物，或fish完全不看语境。',alternatives:['由位置或外形替词义和分类标准。'],verification:'先说明当前分类标准，逐词核意义及对象。',correctiveFeedback:'按明确标准与语境分，外形和旧题不代依据。'},
 {observation:'字母歌、棋位或文件存在被当成全部读写听说已完成。',alternatives:['用单一活动或材料代不同表现。'],verification:'核本人实际原答、声音、书写、帮助和缺项。',correctiveFeedback:'实际做过的范围逐项保留，未做的任务不反填。'}],
 transfer:{scenario:'换名字、年龄、菜单和数量，再换蛇梯端点与字母缺项。',prompt:'逐项先辨当前任务，自己回答或写；解释i、qu、x的当前词例，不沿旧模板。',expectedStrategy:'依新条件重新核，词义、规则和实际材料分开，原答与帮助保持。'},
 summary:{synthesis:'综合复习先看问题、标准和当前条件，再用学过的词与表达。不同材料支持不同表现，实际进度不能由游戏结果或示例代填。',takeaways:['先辨问题','角色信息分清','分类看标准','数字用途分清','26字母按任务配写','具体词音和位置保留','当前规则优先','实际原答与帮助保持']},
 citations:[{page:71,quote:'What’s your name?',usedFor:'concept'},{page:71,quote:'How old are you?',usedFor:'example'},{page:72,quote:'Cross out (×) the words that don’t belong.',usedFor:'misconception'},{page:73,quote:'Go up the ladders. Go down the snakes.',usedFor:'transfer'},{page:74,quote:'Fill in the blanks.',usedFor:'visual'}],
});
finalReview.add('r2-dialogue','r2-current-mixed-dialogue-role','audio_record',['问题与对象相符','角色顺序和表达正确','实际练习范围明确'],[
 ['原创角色Yu七岁，问句What’s your name?。本人录姓名回答，不把年龄seven答给名字问题。','可说My name’s Yu.或I’m Yu.；当前问姓名，seven另是年龄。听本人实际发声，虚构角色不代真实资料，提示情况另核。'],
 ['原创角色Lin九岁，问How old are you?。本人录年龄回答，不能只因名字Lin先出现就报名字。','可说I’m nine years old.，按当前年龄问题。实际声音与帮助分别核，角色年龄不存为学生本人年龄，单人范围保持。'],
 ['原创角色不需要milk而想要bread。本人录礼貌拒绝与请求，不编已经收到或吃过。','可说No, thanks. Can I have some bread, please?，按当前需要；拒绝不认已食用。本人声音、示范帮助与角色范围另核。'],
 ['新角色An想要water，独自切角练请求与给卡致谢。录当前表达，明确是纸卡角色交流。','可录Can I have some water, please? / Here you are. / Thank you.，角色顺序清楚。纸卡不代真实饮用，声音与帮助实际核。'],
 ['当前角色Kai六岁，被问名字再问年龄。本人录两种不同回应，不全部机械答six。','可分别My name’s Kai.和I’m six years old.，问题功能相符。角色资料不代本人，实际声音、原答与帮助分别保持。'],
 ['新情境接受者说Thank you，你演提供者。本人录回应，不把You’re welcome当新请求或生日祝福。','可录You’re welcome.，对应当前致谢。本人声音供核，角色回应不证明真实食物交付或真人互动，示范帮助保留。'],
 ['本人先看示例后独自录多角色问答，可以练习，但能称真实同伴已经参与且未受帮助独立首答吗？','不能；可录当前角色句供核，但先看帮助和单人切角范围保持。原答、声音与真实参与各自核，实际间隔另核。'],
]);
finalReview.add('r2-category','r2-explicit-category-and-current-meaning','short_answer',['分类标准先明确','当前完整词义正确','语境与位置分开'],[
 ['原创标准为“动物名称”，词卡cat、red、dog、six、hand。哪些符合，另外三项当前是什么类别？','cat和dog符合动物名；red颜色、six数词、hand身体词。按明确标准与完整词义，不因外框或位置改变类别，文字不代听辨。'],
 ['原创标准为“当前菜单的食物饮品”，给bread、rice、water、tiger、eraser。哪些符合？','bread、rice、water按本菜单符合，tiger动物、eraser文具不同。分类先看标准和当前语境，不把常见外框里的词全部认同类。'],
 ['fish在动物图与餐单分别出现，可不看当前对象就说永远只归一个具体组，或强行所有分类只有同一标准吗？','不可以，fish可指鱼或鱼肉，需当前语境和分类标准；不同标准可有不同分组。先说明依据，不用旧题标签覆盖当前材料。'],
 ['新标准为“文具名称”，卡pen、pencil box、milk、blue、book。选符合项并解释不是按外框颜色分。','pen、pencil box、book符合；milk饮品、blue颜色不同。按当前语义标准，不因卡外框相同就全放一类，也不以子串拆成额外物品。'],
 ['当前要求选颜色词，卡brown、eight、white、bird、orange。写符合项，不因orange也可指水果就忽略颜色语境。','brown、white、orange在明确颜色任务里符合；eight数词、bird动物名。orange按当前颜色语境解释，分类不脱离已给标准。'],
 ['一组词放在面包外框里，标准却未说明。能仅凭外框把bear、eye、ten都认作食物吗？','不能，外框不能改变词义，标准需核清。bear熊、eye眼、ten十在当前通常意义不同，不以摆放位置代语言分类依据。'],
 ['新标准为“身体部位词”，给ear、foot、cake、mouth、zoo。哪几项符合，zoo是不是一种动物部位？','ear、foot、mouth符合；cake蛋糕、zoo动物园地点不同。zoo不是动物部位，按当前完整词义分，不编实际看图或听辨表现。'],
]);
finalReview.add('r2-alphabet','r2-alphabet-case-and-actual-writing','image_upload',['当前字母身份与大小写正确','本人作品及缺项清楚','字形声音过程分开'],[
 ['原创本人写Aa至Ii九组并上传，标清这只是当前九组，不把旧印刷表代本人作品。','九组大小写对应且字形可辨；本人实际写的范围为前九组，不自动认26组全部完成。完成图不代声音或笔顺，帮助如实保留。'],
 ['原创本人按Jj至Tt当前十一个字母组写并上传，可分块排在一张纸上，先看样本要说明。','当前J至T各组大小写配对可辨，实际作品范围和缺项保持。字体细节看样本，完成图不独证词音、笔顺或没有帮助。'],
 ['原创本人写Uu至Zz六组并上传，若尚未写则说明；不能用会唱末六字母就自动记已写。','六组大小写对应，图应是本人实际作品。唱歌和印刷表不代手写，未写保持未完成，声音、帮助与完整过程另核。'],
 ['新任务补大小写：A配空、空配b、C配空、空配d。请本人按当前样本写完整四组上传。','应配Aa、Bb、Cc、Dd，按当前大小写任务而非完全同字形要求。实际作品可核字形，图不认听辨或无人提示，间隔另核。'],
 ['当前本人写Bb、Dd、Pp、Qq比较方向并上传，不能因都有竖和圆就合成一组。','各字母身份与大小写分别对应，具体方向按当前样本核清。完成图只核可见作品，不证明全部笔顺、输入声音或未受帮助。'],
 ['当前要求本人写完整26组，但只提供前半部分作品。可以保留已写范围吗？剩余可直接由字母歌补成完成记录吗？','可如实保留已写部分，剩余缺项不能由唱歌或印刷表代填。实际作品、帮助和间隔分别核，不把部分成功当整册全部书写通过。'],
 ['本人上传26组完成图后，能据一图认所有字母名变体、全部词中音和陌生词拼读已通过吗？','不能，图可核字形和配对，不提供这些声音表现或全过程。相应任务需本人实际材料，原答、帮助与间隔保持，不扩大结论。'],
]);
finalReview.add('r2-number','r2-number-purpose-current-condition','short_answer',['数词数意正确','当前用途和对象分清','角色与真实资料分开'],[
 ['原创角色eight岁、桌号3、five plates，问盘数和年龄分别用哪个数词？','盘数five，年龄eight，3是桌号；不同问题用途不混。角色条件不代学生真实年龄，纸面数量也不证明真实聚会发生。'],
 ['完整词卡two、two、six，问完整two有几张。答案是six吗？请说明词义数意与出现次数的不同。','two有两张，six是另一张词卡且数意为六；当前问出现次数，不是读到的最大数。词牌不自动是实际物品数量。'],
 ['原创当前顺序ten、nine、eight、空位，明确每次少一。空位填哪一词，能沿旧题加一规则吗？','填seven，按当前递减规则；不能用旧递增模板。文字顺序和真实物品计数不同，听辨和本人发声另需材料。'],
 ['新条件桌号9、角色seven岁、two gifts，问How many gifts。应回答哪个，为什么不是nine？','应two，问题问礼物数；nine为桌号、seven为年龄。当前用途明确，不由数字先后或大小替代所问对象，角色信息不改本人。'],
 ['当前只给This one, please的选择句，没有全部商品图。能认总数一定one并顺带认本人一岁吗？','不能，one在此指当前选择对象，不说明全部数量或年龄。需问题、单位和完整条件，不从一个词补多个本人事实。'],
 ['原创物品数量没给全，只说有许多，问精确几件。可以因为会念one到ten就随便填ten吗？','不能，顺背数词不提供完整数量。先核实际对象或明确条件，暂未知如实保留，声音和帮助另核，不把熟练歌谣当计数。'],
 ['角色卡六岁、六个盘、数字6标签同时出现，就能认学生本人六岁且真实吃过六份吗？','不能，同数值可有不同角色；虚构年龄、盘数与标签不代本人资料或食用事实。按当前问题回应，未发生的表现不补造。'],
]);
finalReview.add('r2-sound','r2-exact-i-qu-x-and-current-words','audio_record',['完整词与当前位置准确','例词不套统一规则','实际声音与帮助范围明确'],[
 ['本人录ice、ice cream，说明本册当前i用这两个例子，不能擅换短i词再称原页如此。','需听实际完整词尝试；当前i例为ice/ice cream，原件范围保持。字母名与词音分别核，示范帮助保留，没有输入声音不认听辨。'],
 ['本人录queen、quiet，指出当前qu组合，不把两词开头音拆成所有独立q的规则。','读完整queen、quiet供核，两词含qu。当前示例不等全部q规则，字母名、词音和输入声音分开，帮助如实说明。'],
 ['本人录fox、box并说明x在什么位置。可以为了字母课表顺序就说两词以x开头吗？','不能，fox、box的x在词尾，需读当前完整词。词形位置保持，不造词首x例；本人声音、真实示范与帮助分别核。'],
 ['新顺序box、fox、ice，请本人先录完整词，不只报X和I的字母名代所有词。','应实际读三个完整词供听核；x在前两词尾部，ice为当前i例。字母名与整词不同任务，原答、帮助和实际间隔保持。'],
 ['本人录gift/green与jeep/jump。都见到g或j等字母，就能凭字母名认每词的全部声音吗？','不能，需实际听本人完整词，本组g与j具体例词分别学。字母名不替词音，两例不推所有规则，示范和原答顺序保持。'],
 ['本人录water、wet、yellow、yo-yo，未听过任何输入音频。可以核自己的尝试，但能同时写听圈题完成吗？','可保留本人实际读词尝试，缺输入声音不能认听辨或听圈题完成。词形、本人发声、帮助和真实间隔分别核，文件不自动判发音合格。'],
 ['本人先听示范后录fox/box与queen/quiet，能删掉示范帮助并认未见独立首答、全部字母音已保持吗？','不能，当前录音供核且示范顺序保留。x词尾与qu组合按例词保持，四词不证明全部字母音或充分保持，实际间隔另核。'],
]);
finalReview.add('r2-game','r2-current-game-and-actual-progress','short_answer',['按当前端点规则','任务和位置分开','真实原答帮助不反填'],[
 ['原创本局梯底3到6，蛇头8到4，落点触发。棋子落3后去哪，能由此认该格姓名问答已经独立正确吗？','按本局升6，但位置不提供本人姓名问答原答。需实际声音、回答和帮助，不能因移动符合规则就反填英语正确。'],
 ['原创同局棋子落8，应去4。若只是走过8而未落点，能照落点规则自动下降吗？','落8才按明说规则到4，经过不自动触发。动作条件完整再判断，棋位也不证明原答或掌握，未给事实不补。'],
 ['新局梯底2到5、蛇头7到3，与上一局不同。按当前图说下一步，能沿旧3到6的端点吗？','不能，应依当前2到5、7到3的规则，旧局不替新条件。实际作答、帮助和移动结果分别记录，游戏状态不改本人原答。'],
 ['本人只完成两个角色问答，字母书写和听力未做，但棋子已终点。可以怎样保留进度，能全部勾完成吗？','保留两个实际已答范围，其余书写、听力未做不能由终点代填。位置和各项表现不同，原答与帮助保持，不补长期掌握。'],
 ['同伴提示后答对并继续游戏，能把继续状态改成本人未受助独立首答，还删掉先前错误吗？','不能，原答、错误与提示顺序保留；可按游戏规则继续但不改证据身份。教学后表现与最初独立回应不同，实际到期另核。'],
 ['本人只观察同伴玩，愿意下次参加。能把意愿、观察和同伴胜利当本人已完成全部混合任务吗？','不能，意愿与观察可如实记录，实际参与和本人各项原答仍未发生。不能由同伴胜利补本人声音、书写或完整学习记录。'],
 ['复习后学生自己说“我都会了”，尚无新任务与实际间隔。可以保留自评吗？能据此认所有目标长期保持完成吗？','可保留真实自评，但它不替新任务原答、帮助排除及实际到期间隔。各目标仍按相应表现核，不能把一次自评当全部长期保持。'],
]);

for(const p of packets)write(`english-g3-349949e1-${p.slug}-v1`,[p.lesson],p.groups,
 `${p.groups.length*7}道原创未审候选，${p.groups.length}目标各3即时4拟议间隔。单元级稿不等全部页面活动；当前没有真实听力输入，不复制原图歌词、不代本人参与，教师/评分/独立题族和充分保持库存未完成。`);

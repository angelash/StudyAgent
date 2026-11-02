// Exact-source poem texts and requirements. Recitation, handwriting, meaning
// and unseen evidence remain separate; no learner recordings are fabricated.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),bookId='archive-book:chinese-g3-upper-02915a7db6517258',prefix='source:chinese:g3:02915a7d:',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const defs=[
 ['landscape-poems-reading','山水古诗七字语境识读','在诗句和词语中识读亦抹宜庭未磨盘七字','本人本次声音覆盖七字，淡妆浓抹的抹mǒ、镜未磨的磨mó等按原诗注音核对，不用文字选择代声音','识字与阅读'],
 ['landscape-poems-handwriting','山水古诗十三字实际书写','观察并真实书写断楚至孤帆饮初镜未磨遥银盘十三字','本人原稿逐字核对结构部件，未与末区分，实际书写与识读背诵各自留证，旧范字图不代本人本次','识字与写字'],
 ['tianmen-scene-meaning','联系注释想象天门山诗景','结合天门山楚江注释与诗句，用自己的话说明青山孤帆等画面','两岸青山相对、江流与帆船关系清楚，出字联系观察画面，不推山真的移动或补精确航速地点时刻','古诗阅读'],
 ['west-lake-weather-comparison','比较西湖晴雨与西子比喻','借注释理解晴雨两种西湖景色和西子比喻的表达','潋滟空蒙等联系波光与雨中景，晴雨各有美、淡浓总相宜，不把西子当真实湖泊人物或强定唯一画面','古诗阅读'],
 ['dongting-moon-water-image','理解洞庭月色与盘螺比喻','联系两相和镜未磨及盘螺注释，说明洞庭秋夜远望画面','湖光秋月协调、无风潭面和远望君山形象对应，比喻不作真银盘巨螺；本版山水翠不套成别版字句','古诗阅读'],
 ['landscape-poems-recitation','朗读想象并背诵三首古诗','有感情朗读三诗并在实际本人声音中核对背诵覆盖','三诗分别按当前原件核查，朗读看稿与脱稿背诵分开，允许合理停顿和表达，不由一次背熟推全部诗意或保持','朗读与积累'],
 ['tianmen-dictation','按当前原件默写望天门山','在明确所用帮助的条件下本人实际默写望天门山正文','原稿诗句顺序与关键字对应，原错和订正分别留，原页只要求默写这一首，不额外强制另外两首默写或诗人生平','诗文默写'],
].map(([suffix,name,objective,successCriterion,strand])=>({id:prefix+suffix,version:1,name,subject:'chinese',grade:3,term:'upper',strand,objective,successCriterion,prerequisiteIds:[],curriculumVersion:'source-original-02915a7d-v1',status:'draft'}));
const goals=[...defs.map(d=>({atomId:d.id,objective:d.objective,successCriterion:d.successCriterion})),{atomId:'core:chinese:detail-evidence',objective:'用当前诗句和注释支持理解，保留版本与实际表现范围',successCriterion:'诗句、比喻、注释、本人声音和原稿分别核对，未给史实不编，朗读背诵默写与独立理解保持不互相替代'}].map((g,i)=>({id:'goal-'+(i+1),...g}));
const poems=[{title:'望天门山',dynasty:'唐',author:'李白',text:['天门中断楚江开，','碧水东流至此回。','两岸青山相对出，','孤帆一片日边来。']},{title:'饮湖上初晴后雨',dynasty:'宋',author:'苏轼',text:['水光潋滟晴方好，','山色空蒙雨亦奇。','欲把西湖比西子，','淡妆浓抹总相宜。']},{title:'望洞庭',dynasty:'唐',author:'刘禹锡',text:['湖光秋月两相和，','潭面无风镜未磨。','遥望洞庭山水翠，','白银盘里一青螺。']}];
const draft={format:'source-original-lesson-draft-v1',status:'draft_needs_materials_and_review',source:{bookId,lessonId:bookId+':unit6:entry1',sourceSha256:'02915a7db6517258434d370430bbf464a1dac6e17df97b90d707dc4ecf5cfedf',pageStart:79,pageEnd:80,publicationYear:null,curriculumStandardYear:null},definitionCandidates:defs,targetIds:goals.map(g=>g.atomId),sourceReview:{confirmedRange:true,statement:'物理79至80页印74至75已逐张核对三首原诗、作者朝代、注释、识写字表和课后要求；当前望洞庭为山水翠，背三首而默写仅望天门山，不套其他版本或补未核史实。',pages:[{page:79,visualChecked:true,statement:'已看唐李白望天门山、宋苏轼饮湖上初晴后雨，天门山楚江及潋滟方空蒙亦西子注释和两诗原句。'},{page:80,visualChecked:true,statement:'已看唐刘禹锡望洞庭山水翠原句及洞庭君山注释，7识13写，有感情朗读想象背三首、默望天门山，以及两组指定诗句用自己的话解释。'}]},
 scope:{title:'古诗三首：望天门山、饮湖上初晴后雨、望洞庭',poems,recognitionCharacters:['亦','抹','宜','庭','未','磨','盘'],writingCharacters:['断','楚','至','孤','帆','饮','初','镜','未','磨','遥','银','盘'],recitationRequiredFor:poems.map(p=>p.title),dictationRequiredFor:['望天门山'],dongtingVersionPhrase:'遥望洞庭山水翠',unverifiedBiographicalDatesAdded:false,teacherReviewed:false,published:false},
 content:{title:'古诗三首：借注释看山水，把诗景、比喻与实际背写分清',goals,prerequisites:[],
 activation:{prompt:'原创画面卡：两边青山相对，一片白帆从远方驶近。先说画面给了哪些对象和关系，再说你还不知道具体时刻和速度。图卡是示例，不是历史行程或原诗插图的精确复原。',expectedObservation:'能说山、江、帆的关系，合理想象有线索，同时不把画面补成精确历史事实。',bridge:'三首诗可借诗句与注释想象景色，朗读背诵和用自己的话理解又是不同表现。'},
 concept:{explanation:'先按这份原件分清三诗与作者：唐李白的望天门山、宋苏轼的饮湖上初晴后雨、唐刘禹锡的望洞庭。望天门山借天门山和楚江注释认识两山隔江相对，再联系江流、青山、孤帆想象画面。两岸青山相对出可理解为随着观察展开，青山仿佛迎面显现，不必说山真的在移动；日边来的帆与远方视线有关，原句没有给精确时刻、航速或具体出发码头。西湖诗中的潋滟是波光闪动，空蒙是迷茫缥缈，晴时水光与雨时山色各有美。西子指西施，比喻晴雨像淡妆浓抹都相宜，不是湖里真有某个人在化妆，也不是要求所有人只能画同一幅想象图。望洞庭写秋月湖光协调、无风潭面如未磨镜，远望湖与君山像银盘中青螺；比喻不等真实巨大盘螺。本原件是“遥望洞庭山水翠”，不同版本文字需要说明来源，不能默默套成别的字。课后要求有感情朗读、想象并背三首，默写只要求望天门山；七字识读、十三字书写、脱稿背诵、默写和诗意理解各自核查，不由能背一句就推全部已会，也不增加所有诗都默写或未核诗人生平的要求。',points:['三诗作者和当前版本分清','注释帮助解释具体画面','山出与盘螺为观察和比喻表达','西湖晴雨各有美，想象有诗句依据','本版望洞庭用山水翠','背三首、默一首，表现分别留证']},
 example:{situation:'原创三幅关系卡：江面两山与白帆、晴时波光和雨中朦胧山、秋夜湖面与远处小山。它们用于理解关系，不作原诗历史实景的唯一图。',steps:[
  {explanation:'从两山相对和一片远帆说明所见关系，把像在迎面显现与山真的移动区别开。',board:['两岸青山相对','远处帆逐渐显现','不补真实山移动']},
  {explanation:'把晴时波光和雨中山色各自说清，比较两种美，再联系淡妆浓抹的比喻，不强定一张同时满足所有天气的照片。',board:['晴：波光闪动','雨：山色空蒙','不同条件都可相宜']},
  {explanation:'远处小山与湖面可形成盘螺联想，说明哪里像以及真实对象是什么，再回到当前诗句核字。',board:['真实对象：湖与君山','联想：银盘与青螺','比喻不是实物替换']},
 ],conclusion:'想象来自诗句和注释，关系说明清楚即可有不同合理表达；图卡和背写范例不能代本人理解与实际表现。'},
 visuals:[{kind:'table',title:'三首山水诗的线索与理解范围',headers:['诗与当前线索','可以怎样想象解释','不能直接推出'],rows:[['望天门山：青山相对出、孤帆日边来','两岸与江流、远帆的关系','不说山真移动或编精确行程时刻'],['西湖：潋滟晴、空蒙雨','晴时波光和雨中山色各有美','不把比喻当湖里真有人化妆'],['洞庭：秋月、无风、银盘青螺','湖光月色与远处君山的比喻','不把盘螺当真实巨物'],['本版洞庭：山水翠','按当前原件核对用字','不默默换成另一版山水色'],['课后实际要求','朗读想象背三首，默写望天门山','不加全部默写或未核诗人生平']],explanation:'线索、比喻和实际任务范围分别核对，版本差异不掩盖，朗读背写不能替全部独立理解或长期保持。'}],
 misconceptions:[{observation:'说两山真的移出来、湖里有巨大银盘青螺，或从日边来精确算时速。',alternatives:['可能过度字面理解，也可能把想象补成测量与历史事实。'],verification:'分别标真实景物、诗句表达和注释支持，指出原文没给的量化条件。',correctiveFeedback:'有线索地想象观察画面，比喻和视角不等实物移动或精确实验。'},
  {observation:'背出望洞庭却把本版山水翠默默替换为其他版本，仍称完全按原件。',alternatives:['可能熟悉别版，也可能未核当前文本。'],verification:'对照当前页和本人原录音，标清使用哪个版本；原答与核对后分别留。',correctiveFeedback:'其他版本可以说明来源，当前任务按所选原件核查，不倒改原始表现或隐去差异。'},
  {observation:'只交一段看稿朗读或范字照片，就填三首背诵与默写全部完成。',alternatives:['可能混任务状态，也可能用参考替本人表现。'],verification:'分别核三诗本人声音是否脱稿、望天门山本人默写原稿及所用帮助。',correctiveFeedback:'朗读、背诵、书写和理解独立记，未完成不由示范或一项局部通过补齐。'}],
 transfer:{scenario:'换一段明确原创山水描写或实际可见风景材料，用线索解释画面；三诗背写则按当前原件实际核查。',prompt:'分真实景物与比喻，用自己的话解释一处画面并说明依据，再报告本人朗读、背诵与默写各自完成到哪里。',expectedStrategy:'想象有材料支持，版本清楚，原声音原稿与帮助分别留，未知史实不编，已学原诗复述不自动获得未见迁移或保持资格。'},
 summary:{synthesis:'借注释把诗景说清楚，欣赏不同天气与比喻的美。按当前版本逐项核对真实背写，能读、能背、会写和理解各有证据。',takeaways:['三诗三位作者分清','想象有诗句与注释线索','比喻不代真实巨物或测量','当前山水翠版本保留','背三首默一首，状态不混']},
 retention:{intervalDays:[1,3,7,14],anchor:'last_relevant_teaching_or_help',instructions:'目标、评分和未见材料及充分库存审核后按真实日期安排。原诗已学、注释旁批或示范已见需留帮助曝光，原篇背写不自动证明陌生理解或四间隔保持。每间隔仅一份拟议样题不能充充分库存，模拟日期不当真人效果。'},
 citations:[{page:79,quote:'两岸青山相对出，',usedFor:'concept'},{page:80,quote:'湖光秋月两相和，',usedFor:'example'},{page:80,quote:'有感情地朗读课文',usedFor:'activation'},{page:80,quote:'背诵课文。默写\n《望天门山》。',usedFor:'check'},{page:80,quote:'用自己的话说说下面诗句的意思。',usedFor:'transfer'}]},
 editorNotes:{slug:'landscape-poems',teacherReviewed:false,automaticPublication:false,realLearnerEvidence:false,materialStatus:'原创讲解与候选材料，目标对齐、独立结构、评分和充分保持库存仍待审。',sourceBoundary:'当前准确原件两页；不混其他版本或补造诗人年龄旅行日期，声音原稿和材料曝光各自核查。'}};
const groups=[];
function add(suffix,structure,mode,criteria,rows){if(rows.length!==7)throw Error('Seven explicit probes required');groups.push({lesson:'landscape-poems',atomId:suffix.startsWith('core:')?suffix:prefix+suffix,structure,familyProposal:'following-'+structure,familyIndependenceReviewed:false,mode,rubric:criteria.map((criterion,i)=>({criterion,weight:[0.4,0.4,0.2][i]})),goldAnchors:{acceptedExample:rows[0][1],insufficientExample:'都很美，我早就背过，任何版本和任务都一样。',insufficientReason:'缺具体诗句关系与实际声音原稿，版本和任务范围不清，不能由背过或范例代全部表现。',alternativeAnswers:'候选人工核对参考，允许有依据的不同想象与表达；当前版本、帮助、本人原答和未完成分别留证。'},exercises:rows.map(([stem,answer],i)=>({id:'landscape-poems-'+structure+'-'+(i+1),purpose:i<3?['understanding','procedure','transfer'][i]:'retention',dimension:i<3?['understanding','procedure','transfer'][i]:['understanding','procedure','transfer','understanding'][i-3],proposedIntervalDays:i<3?null:[1,3,7,14][i-3],stem,answer,analysis:answer+' 仅供未审材料人工核对，不能自动评分、批准题族或将看过帮助后的答案充未见首答。',expectedSeconds:mode==='image_upload'?300:240}))});}
add('landscape-poems-reading','landscape-seven-contextual-reading','audio_record',['本人声音覆盖七字','读音与原诗语境相符','词数与字数分清，文字选择不代声音'],[
 ['录音读“雨亦奇、淡妆浓抹、总相宜、洞庭、镜未磨、白银盘”，指出七个目标字。','亦yì抹mǒ宜yí庭tíng未wèi磨mó盘pán依当前词语核对，镜未磨含未磨两目标，不能按词数漏字。'],
 ['先读淡妆浓抹和镜未磨，再补其余目标词，说明一处仍需核对。','抹mǒ、磨mó等当前实际音频可听，补齐亦宜庭未盘，不以一词顺读推全表已会。'],
 ['原创句“画在盘上也很相宜”。用当前合理语境读盘和宜，再补其他原诗目标词。','新句实际声音与补词覆盖七字，未覆盖不能靠流畅一句推会，原句与诗句身份分清。'],
 ['本次给七字各配当前合理词语读出，说明是否刚听原诗或示范。','本人本次声音与语境对应，帮助保留，旧音和教师声音不代实际本人。'],
 ['录音读未与末所在不同词语，再读镜未磨，说明本课目标是哪一字。','当前目标未wèi与末mò区别，实际读音和字形目标分开，不混入错误字来替当前目标。'],
 ['查证仍不稳的一字读音后重新录全表，保留订正前后。','核当前诗句或词语，不机械套另一义项，方法说明不代实际声音。'],
 ['录音读齐七目标并报告未完成与帮助；无本次声音则如实留缺。','实际声音逐字核查，原词重复不自动成为新未见保持，文字选对不代发音。'],
]);
add('landscape-poems-handwriting','landscape-thirteen-actual-writing','image_upload',['本人原稿覆盖十三字','结构部件和未末实际区分','原改分别留，旧范字不代本次'],[
 ['本人真实书写断楚至孤帆饮初镜未磨遥银盘13字并上传，指出一处需核对的部件。','逐字核本人本次原件，未与末区分，解释部件不代实际字形，朗读和范字图不能替写字。'],
 ['先写断楚至孤帆饮初，再补镜未磨遥银盘，上传原稿与实际订正。','七字与六字合为十三，前部分通过不推后部分会，原改位置可对应。'],
 ['在新原创山水短句中实际写部分目标，再补全未出现的目标上传说明覆盖。','句内和补写逐字核查，不能用一张短句图推未写字已会或拿旧字库图补本人。'],
 ['本次手写镜未磨遥银盘并上传，报告其他七字当前是否实际完成。','当前六字有本人原件，另七字未做留缺，旧稿不自动补当前全表保持。'],
 ['上传一处本人真实字形原改对照，解释改法；没有问题不要为了数量故意造错。','原问题与改后可追溯，清稿不能倒造订正过程，改得多不代质量。'],
 ['观察孤与帆等字的部件关系，实际书写并补全表，上传时说明帮助。','部件关系与实际字形相符，方法说明不代书写，帮助和未稳字如实。'],
 ['分两次短书写覆盖十三字，上传本人完整记录并保留未完成。','分次可接受，实际覆盖才有对应信息，不机械要求大量抄写，未完成不能用范字替本人。'],
]);
add('tianmen-scene-meaning','tianmen-mountain-river-sail-scene','short_answer',['景物和关系对应诗句','用自己话说明观察画面','不把出当真山移动或补精确行程'],[
 ['用自己的话说两岸青山相对出、孤帆一片日边来的画面，并指出具体诗句线索。','两岸青山相对显现，远处一片帆向视野中来等合理表达可接受，关系清楚，不说山真的移动或编精确时刻。'],
 ['借天门山与楚江注释解释山、江怎样联系，不必背未核旅行年表。','两山隔江相对像门户，楚江为该处长江古称范围，解释有注释支持，不补具体码头或日期。'],
 ['原创卡写船行时两岸树木仿佛迎面出现。分所见变化和树木是否真的主动走动。','视角变化使景物显现，不等树主动移动，卡片与原诗身份分清。'],
 ['“出”字怎样使静态青山有画面感？说一种有诗句依据的理解。','可联系随着船行或视线展开青山逐渐显现的感受，不要求单一措辞，不把诗景变成实际山移动。'],
 ['从日边来能精确算出白帆当时速度和几点经过吗？还缺什么信息？','不能，未给精确距离时间测量，保留远望画面，不补造数字和历史行程。'],
 ['比较只说很美与描述青山孤帆关系，哪种更能说明你理解了什么？给具体依据。','具体关系让读者跟随画面，美感可不同但需要诗句支持，评价词不代解释。'],
 ['选一个真正新景物描写用线索解释画面；没有新材料则标原诗回顾。','关系有当前材料依据，原诗已学与帮助曝光保留，不把熟悉复述当陌生迁移或保持。'],
]);
add('west-lake-weather-comparison','west-lake-weather-and-xizi-comparison','short_answer',['晴雨景物和注释对应','西子比喻关系清楚','有据不同想象可接受，不编真事'],[
 ['结合潋滟与空蒙注释，说晴时和雨时西湖景色各有什么特点。','晴时波光闪动，雨时山色迷茫缥缈，分别有美，解释联系词句，不只背晴好雨奇。'],
 ['西子是谁，诗中怎样用她作比喻？用自己的话说明淡妆浓抹总相宜。','注释指西施，晴雨西湖如不同妆容都合宜，非湖里真有人化妆，也非要求学生照做妆容。'],
 ['原创卡写晴时水面明亮、雨中山影朦胧，两种画面都令人喜欢。说明不同条件与感受关系。','当前卡片两种条件各有特点，感受有细节支持，不冒充原诗历史现场或必须唯一图像。'],
 ['“亦”和“总”怎样帮助理解晴雨的比较？','亦为也，雨也奇；总支持不同状态皆相宜，不把晴景唯一好或雨景必不好当诗意。'],
 ['能否只凭诗名给出准确降雨量、风速或具体作诗日期？为什么？','不能，当前诗句注释不提供量化或年表，想象景色与未核史实分清。'],
 ['如果同伴画晴湖，你画雨湖，是否只能一人正确？各需给什么依据？','两种都有相应诗句线索可支持，具体表达可以不同，不能以与老师同一幅画作唯一理解标准。'],
 ['选一项比喻关系说明哪里像与哪里不应当真，注明当前依据和未知。','美感比较与真实对象有界限，西湖与西子不混身份，原篇重复不自动成为新未见任务。'],
]);
add('dongting-moon-water-image','dongting-moon-lake-and-island-image','short_answer',['秋月湖光无风画面清楚','镜与盘螺比喻有真实对象','当前山水翠版本保留，未给事实不补'],[
 ['用自己的话解释湖光秋月两相和、潭面无风镜未磨的画面。','秋月湖光相映协调、无风潭面像未磨镜的柔和感等有据表达可接受，不只翻译单个字而丢关系。'],
 ['白银盘与青螺分别用来形容什么？借注释说明，为什么不是巨大真实器物？','银盘联想湖面，青螺形容君山，远望大小形状关系为比喻，不是湖里实际巨盘巨螺。'],
 ['原创远景卡中大圆形水面旁有小青山，旁白把山比小螺。分实际景物和联想对象。','真实卡片景物与比喻身份清楚，不能据旁白认定真螺或纸卡是真实洞庭观察。'],
 ['按当前原件写出遥望洞庭这一句，并说明你所用版本，不默默用熟悉另一字句替代。','本版为遥望洞庭山水翠；如先前读别版要标来源，原答与核对后分别留，不隐去版本差异。'],
 ['“遥望”怎样限制观察视角？能因此知道所有近处细节和精确尺寸吗？','远望整体形象，不能单凭诗句获得全部近处细节或精确测量，未知保留。'],
 ['比较湖光与秋月的关系和银盘青螺的关系，各说一处诗句支持。','前者协调相映，后者湖山远望比喻，关系分别清楚，不把两个比喻机械当同一对象。'],
 ['回看自己解释，修订一处把比喻当真物或把未知补成事实的说法，保留原改。','改动有诗句注释依据，合理不同画面可接受，后改不覆盖本人原答和帮助。'],
]);
add('landscape-poems-recitation','three-poems-actual-recitation-and-reading','audio_record',['三诗按当前原件分别核查','看稿朗读与脱稿背诵分清','声音帮助与覆盖真实，不推诗意全部或保持'],[
 ['本人录音有感情朗读三诗，分别注明是否看稿；另报告哪些已实际脱稿背诵。','三诗标题作者与当前句子对应，朗读不自动充脱稿背诵，允许有依据的停顿表达，不强统一音色速度。'],
 ['选择一首真正脱稿背诵录音，报告另两首当前完成状态与实际帮助。','该首本人声音逐句核，其他未做保留，不由一首流畅推全三首完成。'],
 ['先读一段明确原创短诗并解释怎样借画面停顿，再回到原三诗报告实际朗读背诵范围。','新材料练方法和原诗实际表现分开，不能把一首原创短诗替原课三首必需背诵。'],
 ['本次本人脱稿背三诗并保留实际停顿或订正，说明刚看过原文的部分。','按本版逐首逐句核，帮助曝光清楚，改后正确不倒改原错，不自动认定未见理解或保持。'],
 ['录音比较自己一处朗读处理与诗景的联系，再说明是否看稿。','表达依据可联系晴雨、无风或远帆，允许合理不同停顿，情感不凭音色自动打分，状态真实。'],
 ['如果当前只能背望天门山，怎样准确记录三首任务？录音说已做和待做，再背实际那首。','实际完成范围清楚，不能用参考音补另外两首或把计划写成已背。'],
 ['重新录三首实际背诵，标原诗已学与帮助，不把同篇重复当陌生首答。','本人当前声音与版本可核，背诵是积累表现，不单独证明全部理解或四间隔保持。'],
]);
add('tianmen-dictation','tianmen-own-original-dictation','image_upload',['本人默写正文与当前原件对应','原错订正和帮助分开','仅本页要求望天门山，不扩所有诗默写'],[
 ['在说明是否看过原文或得到帮助后，本人实际默写望天门山正文并上传原稿。','四句顺序和关键字按当前原件核，原错与订正分开；看稿抄写不当无帮助默写，不增加未核诗人生平要求。'],
 ['上传本人默写原稿及实际订正，指出一处与原件需核对的字句；无错不故意造错。','原位置和改后可追溯，清稿或范字图不能倒造默写过程，字形与诗句内容分别看。'],
 ['先分析明确原创短句里一个需注意字形，再实际完成本课望天门山默写上传，分清两种任务。','原创短句不代指定诗篇，本人默写和所用帮助实际可核，不用换材料躲掉原任务。'],
 ['本次只默写了望天门山前两句，上传并报告后两句状态，不补造整首完成。','局部原稿按当前诗句核，未写部分留缺，不能由前半正确推全部。'],
 ['核对本人原稿中断楚至孤帆等关键字，保留真实改动并上传，不靠参考图替本人。','字句与当前原件一致，帮助和原改保留，认得字不代写得出。'],
 ['原页要求默写哪一首？上传该首本人实际原稿，再说明另外两首是否有额外安排。','原页只明确望天门山，不能强制补成全三首都默写；额外安排需另明身份，不假称教材原要求。'],
 ['重新完成本人一次默写并上传，报告原诗熟悉和帮助条件，不将改后当最初首答。','本人本次原件可核，原篇重复不自动成为新独立理解或保持库存，未完成不代填。'],
]);
add('core:chinese:detail-evidence','poem-version-metaphor-and-performance-evidence','short_answer',['判断有当前诗句或注释支持','版本与实际声音原稿身份清楚','未知史实和未完成不由参考代填'],[
 ['本版望洞庭用山水翠，另版用不同字时，应怎样记录而不隐去来源？','分别标版本与原回答，当前任务按所选原件核，不默默替换或倒改成首答本来一致。'],
 ['三首能背是否单独证明全都已理解并默写完成？列还需核对的不同表现。','不能，理解、本人原稿默写和背诵分别看，原页默写只一首；局部通过不补全部。'],
 ['原创卡只给两山与远帆，能填作者实际航速年龄作诗年月吗？','不能，景物线索不提供精确历史或测量，未知可提出问题不能填成事实。'],
 ['银盘青螺的比喻能当真实器物尺寸测量结果吗？具体依据支持什么？','不能，支持远望湖山形象与美感关系，不给实际器物或精确大小，注释和比喻身份清楚。'],
 ['只听过示范就用其声音交作本人背诵，缺哪种证据？','缺本人真实声音与任务范围，参考可学习但不代本人背诵或脱稿条件。'],
 ['看过注释改对诗意后，怎样保留原答和帮助，不充起初未见理解？','原答、注释曝光和更新分别留，后改理解不倒改最初记录或恢复未见资格。'],
 ['分别列一项当前诗句事实、一项有据想象和一件仍未完成的本人背写，说明来源。','三类有范围，真实声音原稿与帮助可核，未知与未完成不靠任务计划或模板填满。'],
]);
// Ancient poem texts are part of the actual reading body, not only metadata.
draft.content.concept.explanation='本课原诗\n'+poems.map(poem=>'《'+poem.title+'》\n['+poem.dynasty+'] '+poem.author+'\n'+poem.text.join('\n')).join('\n\n')+'\n\n读诗与理解\n'+draft.content.concept.explanation;
draft.editorNotes.poemTextBoundary='Include the public-domain ancient poem texts in the teaching body. Modern textbook pages and full modern annotations remain private; explanations are original.';
const file='resources/curriculum/source-lessons/chinese-g3-landscape-poems-v1.json',bytes=Buffer.from(JSON.stringify(draft,null,2)+'\n');fs.writeFileSync(path.join(root,file),bytes);
const bundle={format:'source-following-original-materials-v1',status:'editorial_candidate',sourceLessons:[{lesson:'landscape-poems',path:file,sha256:sha(bytes),source:draft.source}],teacherReviewed:false,targetAlignmentReviewed:false,scoringReviewed:false,familyIndependenceReviewed:false,automaticPublication:false,reservePolicy:'每目标每间隔仅一份拟议样题；原诗背写与理解分别核查，已学与帮助曝光不恢复未见首答资格。当前山水翠版本和背三默一范围保留，未构成充分四维库存。',groups};
fs.writeFileSync(path.join(root,'resources/curriculum/source-lesson-materials/chinese-g3-landscape-poems-v1.json'),JSON.stringify(bundle,null,2)+'\n');console.log(JSON.stringify({drafts:1,targets:goals.length,newDefinitions:7,questions:groups.reduce((n,g)=>n+g.exercises.length,0),teacherReviewed:false,published:false,learnerEvidenceCreated:false}));

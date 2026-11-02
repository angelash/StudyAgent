// Original drafts based on the exact original's visually reviewed physical pages27 through31.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),bookId='archive-book:chinese-g3-upper-02915a7db6517258',prefix='source:chinese:g3:02915a7d:';
const definition=(suffix,name,objective,successCriterion,strand)=>({id:prefix+suffix,version:1,name,subject:'chinese',grade:3,term:'upper',strand,objective,successCriterion,
 prerequisiteIds:[],curriculumVersion:'source-original-02915a7d-v1',status:'draft'});
const evidence={atomId:'core:chinese:detail-evidence',objective:'把判断与具体材料对应，分清原信息、感受和追加想象',successCriterion:'能指出支持关系，不用想象、例子或局部表现冒充实际观察和完整掌握'};
const meaning={atomId:'core:chinese:contextmeaning',objective:'联系上下文、工具或已有知识解释词义，并说明方法',successCriterion:'解释与当前语境相容，能指出线索，不只重复词语或机械套用另一义'};
function assemble(slug,entry,start,end,definitions,reused,scope,content,pageNotes){
 const goals=[...definitions.map(row=>({atomId:row.id,objective:row.objective,successCriterion:row.successCriterion})),...reused].map((row,index)=>({id:'goal-'+(index+1),...row}));
 return{format:'source-original-lesson-draft-v1',status:'draft_needs_materials_and_review',source:{bookId,lessonId:bookId+':unit2:entry'+entry,
  sourceSha256:'02915a7db6517258434d370430bbf464a1dac6e17df97b90d707dc4ecf5cfedf',pageStart:start,pageEnd:end,publicationYear:null,curriculumStandardYear:null},
  definitionCandidates:definitions,targetIds:goals.map(row=>row.atomId),sourceReview:{confirmedRange:true,statement:'已逐张查看准确原件全部范围、提示、注音与插图；仅为AI来源核对，不是教师审核或真人效果。',
   pages:pageNotes.map((statement,index)=>({page:start+index,visualChecked:true,statement}))},scope:{...scope,teacherReviewed:false,published:false},content:{...content,goals,prerequisites:[],
   retention:{intervalDays:[1,3,7,14],anchor:'last_relevant_teaching_or_help',instructions:'待目标、评分和充分未见库存审核后按真实日期安排；重复原诗、提示与讲解保留条件，不用合成日期当真人保持。'}},
  editorNotes:{slug,teacherReviewed:false,automaticPublication:false,realLearnerEvidence:false,
   reuseBoundary:'只复用明确列出的原有定义；新增定义、先修与等价关系保持待审，不自动建立独立题族。',
   materialStatus:'具体讲解、例子、图表和错因已经编写；检查材料、独立结构、评分和充分保持库存仍待审核。',
   pacing:'朗读、识读、实际书写和表达分次安排；一次局部完成不扩大成全部目标已掌握。'}};
}
const soundDefs=[
 definition('autumn-sounds-word-reading','听听秋声九字识读','结合词语识读抖蟋蟀振韵掠吟辽阔九字','实际录音覆盖九字并按准确页注音核对，文字或拼音选择不能代替发音','识字与阅读'),
 definition('autumn-sounds-oral-reading','秋声诗实际朗读与想象','有感情朗读诗句，说明停顿与自己形成的画面的联系','保留本次声音及实际范围，读法有据；原页未要求全文背诵，不用解释代替朗读','朗读与表达'),
 definition('autumn-sounds-sound-imagination','从声音线索展开有据想象','联系黄叶蟋蟀大雁秋风等线索说明诗中声音和联想','分清原句声音、文学想象与实际听见，不把汗水谷粒直接当作实测声源','文学阅读'),
];
const sounds=assemble('autumn-sounds',4,27,28,soundDefs,[meaning,evidence],
 {title:'听听，秋的声音',author:'毕国瑛',skim:true,recognitionCharacters:['抖','蟋','蟀','振','韵','掠','吟','辽','阔'],writingCharacters:[],fullTextRecitationRequired:false,
  requiredTasks:['有感情朗读','边读边想象','交流诗中的秋天声音'],imitationIsOptionalExtension:true},{
 title:'听听，秋的声音：从声音线索想象画面',
 activation:{prompt:'轻轻翻一页书，再说听到的声音。若只看到一张树叶图，你能说已经真的听过它吗？把实际听见与读后想象分开。',expectedObservation:'孩子能指出声音或说明没有实际声音，不把图画与参考文字当作听觉记录。',bridge:'读诗时同样先找声音线索，再说它带来的画面与感受。'},
 concept:{explanation:'这首略读诗先写黄叶、蟋蟀，再写大雁和秋风，借道别、歌韵、叮咛与歌吟把秋天组织成可以想象的音乐厅。文字中的声音可以引出动作与画面，但拟人的话音不等于树叶具有人的意图；汗水与谷粒的写法联系劳动和丰收，不要求证明每粒谷子都发出实际声音。朗读时可在反复的听听之后自然停顿，让听者感到在留意不同景物；允许不同有依据的读法。课页要求边读边想象并交流，没有明确全文背诵或写字表要求。九字识读、朗读和画面解释分别看。',points:['先找具体声音与对象','想象说明依据，不冒充现场记录','反复语句帮助组织倾听','本次声音与文字说明分别留证']},
 example:{situation:'原创虚构小诗片段：窗边的纸片轻轻摆动，沙沙声像在提醒我，风又来了。此为阅读练习，没有提供实际音频。',steps:[
  {explanation:'指出材料明确写了纸片摆动和沙沙声；阅读者目前获得的是文字信息。',board:['文字线索：纸片摆动','文字声音：沙沙','当前无实录音频']},
  {explanation:'像在提醒是一种人的活动联想，不能推断纸片有意识地传话。',board:['可联想：提醒','不能证明：纸片有人的意图']},
  {explanation:'实际朗读后说明停顿怎样帮助画面；文字解释不能代替那次声音。',board:['先录本次声音','再解释停顿','帮助条件单列']},
 ],conclusion:'读诗可形成自己的画面，同时保留文字、联想和实际听觉的区别。'},
 visuals:[{kind:'table',title:'声音、联想与证据',headers:['线索','可形成的画面','需要保留的边界'],rows:[['黄叶与道别','落叶声音和离枝的联想','不证明树叶有人的告别意图'],['蟋蟀与歌韵','虫鸣、振翅与告别的联想','不要求本人现场观察才能阅读'],['大雁、秋风','移动的队伍与田野画面','没有实录就不说自己已听见'],['汗水、谷粒','劳动与丰收的诗意联系','不逐字推成每粒都实际发声']],explanation:'这是阅读组织表，不是自然声学实验结论。'}],
 misconceptions:[{observation:'说画面里有叶子，所以我刚才已经听到落叶。',alternatives:['可能混淆看到与听到，也可能没说明这是诗中想象。'],verification:'请指出目前实际得到的是文字、图像还是声音，再说明想象依据。',correctiveFeedback:'可以说读到后想象沙沙声，未实听就不写成实际听觉记录。'},
  {observation:'用一段解释替代本人朗读，或自行增加全文背诵要求。',alternatives:['可能把任务方式混同，也可能凭其他课印象套要求。'],verification:'查看准确原页提示与本次声音，分别记朗读范围和理解。',correctiveFeedback:'解释与声音分别核对，没有录到的部分仍未测；不增加原页没有的要求。'}],
 transfer:{scenario:'换用一段明确标注原创的声音短诗，或由孩子自愿提供普通环境中已经真实听见的信息。',prompt:'指出一处声音线索与联想，说明目前是否有实际声音，再真实朗读一小段并解释读法。',expectedStrategy:'先分来源性质，再找对象和表达联系，不编造外出观察或本人经历。'},
 summary:{synthesis:'带着画面朗读，也说清画面从哪里来。诗意的声音与实际听觉分别记录，九字识读和本次朗读各自留证。',takeaways:['声音有具体对象','想象与实听分清','读法用句意支持','不添加全文背诵要求']},
 citations:[{page:27,quote:'有感情地朗读课文，一边读一边想象',usedFor:'concept'},{page:28,quote:'在每一颗饱满的谷粒里',usedFor:'concept'}],
 },['已逐张查看前半诗、略读星号、作者毕国瑛及原提示，拟人和实际听觉分清。','已逐张查看后半诗、九字识读表与插图，未见写字表或全文背诵要求，汗水谷粒保持诗意表达边界。']);
const diaryDefs=[
 definition('diary-header-format','日记日期星期天气格式','辨认并记录日记开头的日期星期与天气信息','本人日记依据实际情况记录，虚构练习明确标注；不把示例8月20日星期一当任何年份通用日期','习作'),
 definition('diary-one-event','围绕一件小事写经过','选择自己愿意记录的一件事，按必要顺序写清变化','有具体事件和前后联系，不要求重大经历或照抄范例，不替本人编造','习作'),
 definition('diary-concrete-feeling','把感受与具体事情联系','在记录中用具体变化说明自己的想法或感受','实际感受由本人提供，不强迫统一情绪，虚构人物与本人分清','习作'),
 definition('diary-revision-and-choice','自愿选材并修订日记','选择可交流内容，读后修订不清楚的一处，保留原稿','不强制公开私密日记，不用字数和公开天数代替表达质量；实际修订有原稿依据','习作'),
];
const diary=assemble('diary',5,29,29,diaryDefs,[evidence],
 {title:'习作：写日记',activityKind:'writing',requiredWordCount:null,personalDisclosureRequired:false,fictionPracticeMustBeLabelled:true,
  sampleHeader:{month:8,day:20,weekday:'星期一',weather:'晴',year:null},sampleIsReadingNotMedicalInstruction:true},{
 title:'写日记：记录一件小事，保留自己的发现',
 activation:{prompt:'今天或最近有什么普通小事是你愿意留下的？可以是读书、整理或观察；不想公开的内容可留在私人日记里，课堂可用明确虚构的材料练习。',expectedObservation:'孩子能选一件愿意写的小事，或说明目前只练习，不被要求提供私人家庭经历。',bridge:'先看格式，再把事情与自己的感受按顺序写清楚。'},
 concept:{explanation:'原页用一篇生活日记引导发现日期、星期和天气，也请交流记录的好处、内容与格式。示例没有年份，8月20日星期一不能直接套成当前日期。正文围绕一件事，写清前后变化和自己的想法，不必把一天每件事全部列出。日记帮助保存观察、经历和想法，也便于回看变化，但坚持天数与写作质量分别评价。例文中的换牙经历只作阅读材料，不给孩子摇牙或模仿处理的操作任务。本人记录由本人提供；未发生的事可作为明确标注的虚构练习，不能冒充个人生活证据。',points:['日期星期天气依据实际情况','一件小事写清变化','感受联系具体原因','自愿选择可交流内容并保留修订']},
 example:{situation:'明确虚构练习卡：4月9日，星期二，多云。小岚整理抽屉时先找不到书签，后来在旧笔记本里找到，决定把书签放进固定小盒。此卡不对应当前年份或任何学生真实经历。',steps:[
  {explanation:'按卡片给定信息写练习抬头，同时标明虚构，不把它当今天的实况。',board:['4月9日','星期二、多云','仅虚构练习']},
  {explanation:'用找不到、找到、决定的顺序抓住一件事，不补造去过的地方。',board:['起初找不到','后来在笔记本里找到','最后决定固定收纳']},
  {explanation:'可以为虚构人物写安心或有新办法的感受，说明与找到书签的联系；本人感受不能由老师代填。',board:['感受有具体原因','不同合理表达可接受','本人项由本人写']},
 ],conclusion:'格式和事件组织可以练习，虚构卡仍不是本人日记。'},
 visuals:[{kind:'table',title:'日记各部分怎样核对',headers:['部分','需要的信息','不应代替'],rows:[['抬头','日期、星期与天气','不能抄示例冒充本次实况'],['正文','一件事情的必要经过','不以活动数量评价'],['感受','与具体变化对应的想法','不强迫统一情绪'],['修订','原稿、不清楚处与改法','不以最终排版稿证明本人过程']],explanation:'表格帮助检查表达，不要求公开完整私人日记。'}],
 misconceptions:[{observation:'不管实际日期都抄8月20日星期一晴。',alternatives:['可能只模仿形式，也可能没有区分示例与本次记录。'],verification:'请指出本次日期信息来源；年份或星期不确定时先核对，不擅填。',correctiveFeedback:'抬头反映本次记录条件，示例不是通用模板答案。'},
  {observation:'为了写得精彩把未发生的事说成本人经历，或觉得必须公开隐私。',alternatives:['可能以为普通小事不够好，也可能误解交流范围。'],verification:'由本人选择愿意交流的内容，标明实际或虚构，并检查一处具体经过。',correctiveFeedback:'普通小事也可写清楚，练习可标明虚构；不公开的内容保留私人选择。'}],
 transfer:{scenario:'换一张明确虚构的普通生活卡，或由本人自愿选一件真实小事。',prompt:'写清抬头信息来源和一件事的变化，加入有具体依据的感受。读后修改一处不清楚的地方，保留原稿。',expectedStrategy:'选材真实或明确虚构，格式与正文分别核查，不编造听众意见或连续天数。'},
 summary:{synthesis:'记录值得留下的一件小事，格式反映本次条件，感受与经过相连。本人、虚构与不愿公开的部分保持清楚。',takeaways:['示例日期不直接套用','普通小事也可写清楚','感受由本人选择','修订保留原稿与理由']},
 citations:[{page:29,quote:'日记的格式是怎样的',usedFor:'concept'},{page:29,quote:'日记里可以写些什么',usedFor:'transfer'}],
 },['已逐张查看写日记完整例文、日期星期天气、三个交流问题及坚持记录建议；例文未提供年份，换牙叙述不变成模仿操作，公开私人经历非必要条件。']);
const gardenDefs=[
 definition('garden-two-method-exchange','交流理解词语的方法','在具体例子中说明联系上下文查字典等理解方法，并听取不同办法','实际使用线索可指认；列方法数量不代替能解释，实际同伴交流未发生时保留未验','阅读策略'),
 definition('garden-two-season-words','用恰当词语描写季节','选择与明确景物和季节条件相容的词语，说明理由','不把教材示例当唯一答案，也不推广成每地区每年完全相同的气候','词语表达'),
 definition('garden-two-handwriting','园地二八字横竖书写','观察并真实书写狂排铺票盖寒臂假，注意横画平稳竖画端正','本人原件逐字核对部件与完整性，横平竖直为书写提示，不把笔画机械画成几何绝对水平','书写'),
 definition('garden-two-accumulated-words','秋景四字词语积累与应用','读准园地九个四字词语，联系意思选择适合的表达','真实声音与实际用法分别看，不以会读推断会用，也不将五谷丰登等扩大成实际全量收成结论','词语积累'),
];
const garden=assemble('garden-two',6,30,31,gardenDefs,[meaning],
 {title:'语文园地（二）',activityKind:'language_garden',sections:['交流平台','词句段运用','书写提示','日积月累'],writingCharacters:['狂','排','铺','票','盖','寒','臂','假'],
  accumulatedPhrases:['秋高气爽','天高云淡','秋风习习','一叶知秋','金桂飘香','层林尽染','五谷丰登','果实累累','春华秋实'],actualPeerFeedbackNotFabricated:true},{
 title:'语文园地（二）：说清理解方法，把词语用在合适处',
 activation:{prompt:'遇到一个不理解的词，你会只报词义，还是能说明自己怎样知道？先用一条具体线索试着解释，没把握可查工具。',expectedObservation:'孩子能指出上下文、字典或已有知识的具体作用，不把列出方法名当作已经理解。',bridge:'接下来在季节表达和两个情绪词中试用方法，再分开看书写与词语积累。'},
 concept:{explanation:'交流平台让小组总结理解词语的方法，查字典是示例，还可联系上下文、替换试读和已有知识，关键是说明当前方法怎样支持词义。憧憬可联系即将到来与期待表现，忐忑不安可联系担心受到责备，不能仅凭花瓶打碎推断实际已发生责备。描写季节的词要与具体条件相容，不能规定四季在所有地区完全一样。书写提示列狂排铺票盖寒臂假，强调横画平稳、竖画端正和执笔姿势；看本人原件，不按字体截图或绝对几何水平判字。九个秋景四字词语的读音、意思与使用分别核查，果实累累的累按此处注音léi核对，不套劳累读法。',points:['方法在具体语境中起作用','季节词与景物条件对应','情绪词解释不补造结果','实际书写和词语声音分别保留']},
 example:{situation:'原创句：活动还没开始，小禾已经想着怎样把模型讲清楚，盼着那一天快些来。另句：作品少了一件，他怕找不回来，心里一直不踏实。',steps:[
  {explanation:'第一句找盼着和未来活动，支持对将来的向往，可用来理解憧憬。',board:['未来：活动未开始','态度：盼着到来','解释：向往期待']},
  {explanation:'第二句找怕找不回与不踏实，支持担心不安，不证明物品永远找不回。',board:['具体担心','心中不安','结果仍未给']},
  {explanation:'如果查字典有多个义项，代回当前句试读，看是否与这些线索相容。',board:['找义项','代回语境','解释为何适合']},
 ],conclusion:'线索、词义与方法连起来，才能看出怎样理解；合理不同方法可并存。'},
 visuals:[{kind:'table',title:'园地四项分别留下什么',headers:['项目','具体表现','不能替代'],rows:[['理解方法','指出线索与解释关系','方法名称多不等于理解深'],['季节词','给词与景物条件说明','一个地方不代替全部气候'],['书写','本人八字原稿与订正','字体选择不代替实际手写'],['四字词积累','本次读音和恰当使用','会读不自动证明全会用']],explanation:'表格支持分项检查，不用总完成数掩盖未测部分。'}],
 misconceptions:[{observation:'列出许多方法却无法解释一个词。',alternatives:['可能只记了名称，也可能未把方法用于当前材料。'],verification:'选一个词指出当前线索，说明删掉该线索后判断是否仍成立。',correctiveFeedback:'先让一种方法在具体句子里起作用，再交流其他办法，不单按方法数量评分。'},
  {observation:'把果实累累的累读成劳累的读法，或将担心被责备写成已经被责备。',alternatives:['可能机械套常见读音，也可能混淆情绪与结果。'],verification:'分别核对原页注音与句中实际信息，不把两类问题合为一种原因。',correctiveFeedback:'读音随当前词核对，担心的事情仍可能没有发生；各自保留真实表现。'}],
 transfer:{scenario:'换一个适龄多义词语境和一张明确季节景物卡，不要求学生外出或提供个人行程。',prompt:'解释词义并说明一种方法，再选合适季节词说明依据。书写与声音任务另留本次本人原件，不由文字解释替代。',expectedStrategy:'用具体材料检查含义与用法，工具和帮助条件保留，不夸大一项表现覆盖全部。'},
 summary:{synthesis:'说出怎样理解，把词用到恰当条件中。真实书写、实际声音与文字解释分开核查，未做的部分继续未验。',takeaways:['理解方法须有具体线索','季节词不是通用气候规律','横竖提示落到本人原稿','词义读音和使用分别看']},
 citations:[{page:30,quote:'你会用哪些词语来形容不同的季节',usedFor:'transfer'},{page:31,quote:'横画要写得平稳，',usedFor:'concept'}],
 },['已逐张查看交流平台、四季词语和憧憬/忐忑不安上下文，查字典为示例方法，情绪不等于已发生结果。','已逐张查看八字书写、执笔姿势、横竖提示与九个秋景词语，果实累累的累为léi；词语与具体地域条件分别看。']);
for(const [slug,draft]of[['autumn-sounds',sounds],['diary',diary],['garden-two',garden]])fs.writeFileSync(path.join(root,'resources/curriculum/source-lessons/chinese-g3-'+slug+'-v1.json'),JSON.stringify(draft,null,2)+'\n');
console.log(JSON.stringify({drafts:3,targets:[sounds.targetIds.length,diary.targetIds.length,garden.targetIds.length],definitionCandidates:11,published:false,learnerEvidenceCreated:false}));

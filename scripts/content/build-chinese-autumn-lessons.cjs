// Original teaching drafts after viewing the exact original's physical pages19 through26.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),bookId='archive-book:chinese-g3-upper-02915a7db6517258',prefix='source:chinese:g3:02915a7d:';
const definition=(suffix,name,objective,successCriterion,strand)=>({id:prefix+suffix,version:1,name,subject:'chinese',grade:3,term:'upper',strand,
 objective,successCriterion,prerequisiteIds:[],curriculumVersion:'source-original-02915a7d-v1',status:'draft'});
const meaning={atomId:'core:chinese:contextmeaning',objective:'结合原语境、注释或前后线索解释词句，并说明使用的方法',successCriterion:'解释受当前条件约束，能说明线索或注释怎样支持理解，不机械替换另一个常用词义'};
const evidence={atomId:'core:chinese:detail-evidence',objective:'用具体词句支持画面、季节和表达理解，区分原信息与联想',successCriterion:'指出依据与支持关系，不用插图推断、固定感受或自己的经历冒充正文事实'};
function assemble(slug,entry,start,end,definitions,scope,content,pageNotes){
 const goals=[...definitions.map(row=>({atomId:row.id,objective:row.objective,successCriterion:row.successCriterion})),meaning,evidence].map((row,index)=>({id:'goal-'+(index+1),...row}));
 return{format:'source-original-lesson-draft-v1',status:'draft_needs_materials_and_review',source:{bookId,lessonId:bookId+':unit2:entry'+entry,
  sourceSha256:'02915a7db6517258434d370430bbf464a1dac6e17df97b90d707dc4ecf5cfedf',pageStart:start,pageEnd:end,publicationYear:null,curriculumStandardYear:null},
  definitionCandidates:definitions,targetIds:goals.map(row=>row.atomId),sourceReview:{confirmedRange:true,
   statement:'已逐张查看准确原件的全部课文、注释、识写表、课后任务与所选范围内阅读链接；此为AI来源核对，不是教师审核或材料独立性结论。',pages:pageNotes.map((statement,index)=>({page:start+index,visualChecked:true,statement}))},
  scope:{...scope,teacherReviewed:false,published:false},content:{...content,goals,prerequisites:[],
   retention:{intervalDays:[1,3,7,14],anchor:'last_relevant_teaching_or_help',instructions:'先审核目标、量规与充分的未见材料，再按真实日期核查。原诗重复、看文、讲解、提示和帮助分别保留，不用模拟日期或参考答案当作学生保持表现。'}},
  editorNotes:{slug,teacherReviewed:false,automaticPublication:false,realLearnerEvidence:false,
   materialStatus:'具体讲解、示例、错因和图表已编写；检查题、独立结构、量规金样本与充分保持库存仍待补齐。',
   reuseBoundary:'复用原词义与细节依据定义，新增定义保持草稿，等价和先修关系仍待教研审核。',
   pacing:'识读、实际书写、朗读背诵和理解表达分次安排，不能声称一次短学习已覆盖所有目标。'}};
}
const poemsDefinitions=[
 definition('autumn-poems-word-reading','古诗三首目标字识读','在准确原页和具体词语中识读本课10个目标字','保留实际声音并核对原页注音与语境；不凭键盘拼音或旧版印象认定读音已正确','识字与阅读'),
 definition('autumn-poems-handwriting','古诗三首12字实际书写','观察并真实书写准确原页要求的12个字','逐字看实际手写字形、部件位置与完整性，文本选择或字体截图不替代书写','识字与写字'),
 definition('autumn-poems-reading-recall','三首古诗朗读与背诵','有感情朗读并分别尝试积累山行、赠刘景文、夜书所见','以真实录音区分看文朗读、提示后表达和脱离文本背诵；三首分别留证，不由一首推断全部','古诗积累'),
 definition('shanxing-written-recall','山行实际默写','按准确原件尝试默写山行并核对原稿','保存本人真实默写、看文或提示条件与订正；只对山行有此课后要求，不强加其他两首默写','古诗积累'),
];
const poems=assemble('autumn-poems',1,19,20,poemsDefinitions,
 {title:'古诗三首',recognitionCharacters:['径','斜','赠','残','犹','傲','君','橙','橘','挑'],writingCharacters:['寒','径','斜','霜','赠','盖','菊','残','君','橙','送','挑'],
  poems:[{title:'山行',author:'杜牧',dynasty:'唐'},{title:'赠刘景文',author:'苏轼',dynasty:'宋'},{title:'夜书所见',author:'叶绍翁',dynasty:'宋'}],recitationTitles:['山行','赠刘景文','夜书所见'],dictationTitles:['山行']},{
 title:'古诗三首：从景物与注释读出秋意',
 activation:{prompt:'说说“想象一个秋天画面”和“用词句说明为什么是秋天”有何不同。先选一处你已经读到的景物线索，没把握时保留问题。',expectedObservation:'孩子能区分个人画面与材料依据，不只凭诗题或插图猜季节。',bridge:'读三首诗时分别找景物、人物活动和注释，再比较相同季节中不同的观察。'},
 concept:{explanation:'先逐首读准，再结合注释理解词句，用实际景物支持季节判断。《山行》有寒山、枫林、霜叶等线索；准确原件写白云生处，不能凭熟悉的另版文字改成深处。注释中坐指因为，不是坐下。《赠刘景文》把荷尽、菊残与橙黄橘绿放在同一时节，不等于花木都已没有生机；不同有依据的感受可以交流。《夜书所见》写秋风与客情，也写篱落灯明和对儿童活动的判断，不能将推知直接说成亲眼看见全部过程。看文朗读、背诵和默写分别留证，本课明确三首背诵、仅山行默写。',points:['逐首找景物，不凭一个统一标签解释全部','古今词义先结合本页注释','原句与自己的推知分清','三首积累分别核对，山行默写另留真实原稿']},
 example:{situation:'原创类比：甲句写“枝头叶子泛红，我停下脚步，因为眼前的颜色很特别”；乙句写“院里有灯，我猜同伴还在看书”。用它们练习依据与推知，再返回原诗。',steps:[
  {explanation:'甲句明确颜色、停步和原因；解释原因不能只抓停下这个动作。',board:['景物：叶子泛红','动作：停步','原因：颜色引起注意']},
  {explanation:'乙句先有灯光线索，再有读者推测；有灯不保证同伴一定在看书。',board:['已给：院里有灯','推测：同伴读书','还需：实际活动信息']},
  {explanation:'回到原诗，对照注释说明坐的含义；用原词句支持季节与人物活动，不能把类比句替换进诗中。',board:['原诗原字保持','注释帮助词义','推知不冒充全程观察']},
 ],conclusion:'类比帮助理解阅读方法，原诗的具体意思仍以本版诗句与注释为据。'},
 visuals:[{kind:'table',title:'三首诗的线索与边界',headers:['诗题','可核对的线索','不能直接推出'],rows:[['山行','寒山、枫林、霜叶与停车原因','不能把坐按坐下解释或擅改原字'],['赠刘景文','荷尽菊残与橙黄橘绿的对照','不能说所有秋景只表达同一种悲伤'],['夜书所见','秋风客情、灯明与儿童活动判断','不能说诗人亲眼看完所有儿童活动']],explanation:'表格用于比较正文线索，不用空泛情感标签替代逐句理解。'}],
 misconceptions:[{observation:'把停车坐爱中的坐解释成坐在车里。',alternatives:['可能套用了现代常见词义，也可能没有使用本页注释。'],verification:'请指出注释，再用自己的话连接停车与喜爱枫林的原因。',correctiveFeedback:'先按这里因为的意思理解因果，不能只因字形熟悉就忽略语境。'},
  {observation:'读到秋天就把三首感受全写成相同的难过。',alternatives:['可能先套季节标签，也可能没有比较具体景物和语句。'],verification:'分别指出各诗线索，比较赠诗的橙黄橘绿与其他景物如何组合。',correctiveFeedback:'感受可以不同，但都须有对应词句；同一季节不自动带来同一种情感。'},
  {observation:'朗读一首正确就认为三首背诵和山行默写都完成了。',alternatives:['可能把学习方式混同，也可能没有分开记录任务。'],verification:'分别核对三份声音、看文或帮助条件及本人山行默写原稿。',correctiveFeedback:'没有实际完成的部分仍未测，不能用一种表现替代另一种。'}],
 transfer:{scenario:'换一段适龄原创秋景短诗，或对照三首中另一处未讲过的词句，保留原材料条件。',prompt:'用一处具体线索支持季节或画面理解，说明哪些是原句、哪些是自己的判断；若借助注释，指出它怎样帮助。',expectedStrategy:'先找材料，再解释关系；不把旧答案、插图或统一感受当成新依据。'},
 summary:{synthesis:'读准、借注释、找依据，再交流各自的画面与感受。朗读、背诵、实际默写分开核对，原字与帮助条件不抹去。',takeaways:['注释约束古今词义','景物支持季节判断','三首感受有共性也有差别','山行默写不扩成三首都默写']},
 citations:[{page:20,quote:'有感情地朗读课文。背诵课文。默写《山行》。',usedFor:'summary'},{page:20,quote:'这三首诗写的是哪个季节的景色',usedFor:'concept'}],
 },['已查看山行与赠刘景文完整诗文、两位作者朝代和注释，保留生处、坐与擎/君等语义边界。','已查看夜书所见、作者朝代与注释、10字识读、12字写字及课后要求；三首背诵，仅山行明确默写。']);
const pavementDefinitions=[
 definition('pavement-word-reading','水泥道课目标字识读','在词语中识读洼印凌增棕靴六个目标字','真实录音覆盖六字，联系水洼、凌乱等当前语境，不以文字选择替代实际读音','识字与阅读'),
 definition('pavement-handwriting','水泥道课13字实际书写','观察并真实书写准确原页13字','逐字核对本人手写原件，不把识读表另六字机械全部增加为写字要求','识字与写字'),
 definition('pavement-scene-writing','从实际景色写具体发现','用几句话写自己看到的景色，选择能让读者想象的具体细节','真实观察与虚构练习分清，写清颜色形状位置或变化，不代写本人上学经历','表达与交流'),
 definition('pavement-figurative-comparison','景物比较的相似依据','说明落叶与巴掌、水泥道与地毯等比较中的具体相似处','能连接对象、特征与表达，不因出现像就机械归成拟人或把比较当实物事实','文学阅读'),
 definition('pavement-oral-reading','水泥道课实际朗读','保留真实朗读并用停顿或语气表达具体景物观察','须听本次实际声音，读法与句意相容，不要求全篇背诵','朗读与表达'),
 definition('pavement-selected-copy','选择喜欢句子并实际摘抄','从准确原文选择自己喜欢的句子，说明理由并保留实际摘抄','所选句确在文中，摘抄与理由分别看，不能用复制整课文字冒充本人抄写','阅读积累'),
];
const pavement=assemble('pavement',2,21,23,pavementDefinitions,
 {title:'铺满金色巴掌的水泥道',author:'张秋生',recognitionCharacters:['洼','印','凌','增','棕','靴'],writingCharacters:['铺','泥','晶','院','墙','印','排','列','规','则','乱','棕','迟'],
  fullTextRecitationRequired:false,requiredTasks:['朗读','摘抄喜欢句子','交流词语理解方法','景色小练笔'],readingLink:{author:'汪曾祺',title:'自报家门节选',use:'compare_observation_without_reproducing_full_excerpt'}},{
 title:'铺满金色巴掌的水泥道：发现细节，再说明怎样理解',
 activation:{prompt:'同一条普通小路，怎样说才能让别人看见一个具体细节？可以用你实际见过的景色，也可以先用标明虚构的例子练习。',expectedObservation:'孩子能从空泛好看走向一个有颜色、形状、位置或变化的细节，不凭题目编成本人经历。',bridge:'课文中的水洼、落叶、雨靴与道路比较，可以帮助我们练习观察和表达。'},
 concept:{explanation:'先按行走观察的线索读，留意雨后地面、落叶的形状颜色、脚步与心情。水泥道像地毯、落叶像小巴掌、雨靴像小鸟，都要说明相似处，不能变成实物判断，也不能把所有带像的表达叫拟人。理解明朗、凌乱等词，可以联系前后景物、对比条件或已有经验，并说出自己用了什么方法。原页要求朗读、抄写喜欢句子和写景小练笔，没有要求全文背诵。阅读链接展示另一位作者沿路留意店铺与人的活动，可比较观察方法，不能照搬成长段个人经历。',points:['具体景物连成观察路线','解释比较要有相似依据','词义与理解方法一起说清','摘抄、朗读与实际观察写作分别留证']},
 example:{situation:'原创片段：“雨停了，台阶边散着几片深黄的叶子。它们像几只小船，停在浅浅的水面上。”比较它与“那里很好看”。',steps:[
  {explanation:'先指出具体条件：雨停、台阶边、深黄叶子、水面，而非只给一个评价词。',board:['位置：台阶边','颜色：深黄','条件：雨后水面']},
  {explanation:'再说明叶子像小船的依据：浮在水面的形态带来联想，不是证明叶子真是船。',board:['对象：叶子','相似：水上形态','边界：文学联想']},
  {explanation:'若解释散着或浅浅，要指出用了哪条前后信息；换到本人练笔时由本人提供实际观察。',board:['解释词义','说出方法','实际与虚构标清']},
 ],conclusion:'具体线索让读者形成画面，联想与解释仍受材料约束。'},
 visuals:[{kind:'table',title:'景物、比较与依据',headers:['表达对象','比较或理解线索','需要保留的边界'],rows:[['落叶与巴掌','颜色、叶形和铺在路上的样子','不是路上真的铺了人的手掌'],['道路与地毯','连续铺展的落叶颜色和范围','水泥材料没有因此变成织物'],['雨靴与小鸟','形状颜色及轻快脚步的联想','不能据此说雨靴真的会飞'],['明朗、凌乱','联系上下文的光线或排列情况','不能脱离当前语境套用一种释义']],explanation:'表格帮助说明相似与语境条件，不把文学比较当作自然或材料变化结论。'}],
 misconceptions:[{observation:'把所有出现像的句子都叫拟人。',alternatives:['可能只看一个形式词，也可能混淆比较与赋予人的活动。'],verification:'请分别说出本体、比较对象和相似处，再检查有没有人的行为或情感。',correctiveFeedback:'先解释语义关系；看到像并不能自动得出拟人结论。'},
  {observation:'能背出词义，却说不清这句为什么这样理解。',alternatives:['可能记住词典释义，也可能未注意前后景物。'],verification:'请指出明朗或凌乱在当前句里的线索，再比较换一个语境是否还适合。',correctiveFeedback:'把理解方法说具体，词义要与本句条件相容。'},
  {observation:'写景只有很美很漂亮，或照抄教材当成自己看到的地方。',alternatives:['可能还没选择观察点，也可能以为必须写成参考样子。'],verification:'请说明一处具体颜色、形状或位置，以及它来自实际观察还是虚构练习。',correctiveFeedback:'普通景物也可写具体，不代填真实路线或个人经历。'}],
 transfer:{scenario:'换成窗边、院落或一张公开给定的原创景物卡，不要求学生提供行程或外出完成任务。',prompt:'用几句话写一个具体景色细节；使用比较时说明相似处。若实际观察不足，就明确作为虚构练习，不能冒充本人记录。',expectedStrategy:'先给具体信息，再选择表达；词语与比较受条件约束，原稿与来源性质保留。'},
 summary:{synthesis:'看见具体细节，说明比较依据，也说明怎样理解词语。朗读、摘抄、写字与观察表达是不同表现，不能相互顶替。',takeaways:['一处细节比空泛评价具体','像需要相似依据','词义结合理解方法','小练笔不冒充真实经历']},
 citations:[{page:23,quote:'下面加点的词语你是用什么方法理解的',usedFor:'concept'},{page:23,quote:'用几句话写下来吧',usedFor:'transfer'}],
 },['已查看主要课文、作者脚注与落叶/巴掌、道路/地毯、雨靴/小鸟的比较；文学表达与物理实物分清。','已查看结尾、六字识读和13字写字表及配图，未添加全文背诵要求。','已查看朗读摘抄、词语理解方法、小练笔与汪曾祺阅读链接，比较观察方法而不转载整段或代写本人经历。']);
const rainDefinitions=[
 definition('autumn-rain-word-reading','秋天的雨11字识读','在具体词语和准确原页中识读11个目标字','保留真实声音，结合钥匙、喇叭、一曲等词语核对，不由拼音选择推断发音已正确','识字与阅读'),
 definition('autumn-rain-handwriting','秋天的雨13字实际书写','观察并真实书写准确原页13个字','逐字核对本人原件、部件位置与完整性，识读表和写字表不混算','识字与写字'),
 definition('autumn-rain-reading-recall','秋天的雨朗读与第二段积累','有感情朗读并分别尝试积累第2自然段','真实声音与看文或提示条件保留；只明确要求第二段背诵，不扩大成全文背诵','朗读与积累'),
 definition('autumn-rain-aspect-structure','从不同方面认识秋景组织','区分颜色、气味和过冬准备等方面，联系各段具体内容说明组织','分类与材料相容，能用细节支持，不把一段信息代替全部内容或文学描写当普遍自然定律','阅读与组织'),
 definition('autumn-rain-linked-imitation','有联系的秋景仿写','联系颜色、景物和形态，创作有依据又有想象的短句','前后表达有联系，联想与自然事实分清，不只套句式或复制原例','表达与交流'),
];
const rain=assemble('autumn-rain',3,24,26,rainDefinitions,
 {title:'秋天的雨',author:'陶金鸿',recognitionCharacters:['钥','匙','缤','枚','频','勾','喇','叭','厚','曲','丰'],writingCharacters:['盒','颜','料','票','争','仙','闻','勾','紧','洞','油','曲','丰'],
  recitationParagraphs:[2],fullTextRecitationRequired:false,requiredTasks:['有感情朗读','背诵第2自然段','交流描写方面','颜色景物仿写'],readingLink:{title:'太阳时钟节选',author:'乌纳·雅各布',translator:'顾白',scientificGeneralizationsRequireContext:true}},{
 title:'秋天的雨：把颜色、气味和准备过冬分开看',
 activation:{prompt:'如果只用秋天来了四个字，别人还不知道你注意到什么。你可以从哪些具体景物、气味或活动说起？先分清真实观察和自己的想象。',expectedObservation:'孩子能提供具体方面或承认暂未观察，不把秋天的所有地方都说成完全相同。',bridge:'课文用雨串起几种秋景，我们分别看每一段写了什么，以及语言怎样把它们连起来。'},
 concept:{explanation:'读时先找各段主要写的方面，再用细节支持。颜色段中不同景物与不同颜色、形态相联系；气味段写果香与感受；过冬段选取动植物的变化，结尾联系丰收和欢乐。雨像钥匙、有颜料、吹喇叭是文学组织与联想，不表示雨里真的装有颜料或所有动物都会用同一种方式过冬。读阅读链接时也要保留地域、季节和具体对象条件，不能将一个地区的日照和自然现象推广成全世界相同。背诵只明确到第2自然段，实际朗读、字词识读、书写和仿写分别看。',points:['每段方面与具体细节对应','颜色、形态与表达有联系','文学写法不直接当自然因果','第二段积累不扩大成全文背诵','阅读链接的自然描述需保留具体条件']},
 example:{situation:'原创秋景卡：“花坛一角有深红的叶片，像几张小小的书签；树旁飘来果香，有人把收好的种子装进纸袋。”先按内容分类，再写有联系的想象。',steps:[
  {explanation:'把颜色形态、气味与人物活动分别记录，不能用深红一词概括全部。',board:['颜色形态：深红叶片像书签','气味：果香','活动：收好种子']},
  {explanation:'解释叶片像书签的相似处，再说明比较不是实物判断。',board:['相似：颜色与长条形态可联想','不是：叶片真的变成纸书签']},
  {explanation:'换一种景物仿写时，颜色和形态须与所给条件相容；没观察过的细节标作虚构。',board:['先核对条件','再选择想象','不补造本人观察']},
 ],conclusion:'同一幅秋景可以分方面表达，联想仍要能说明与材料的联系。'},
 visuals:[{kind:'table',title:'方面、依据与表达边界',headers:['方面','从材料找什么','不能直接推断'],rows:[['颜色','景物、颜色和形态的对应','不能说雨中真有颜料'],['气味','果香等具体感受线索','不能把自己的味觉经验冒充所有读者感受'],['过冬准备','文中选取的具体动植物变化','不能扩成所有物种同一方式'],['丰收与欢乐','结尾与前面景物的联系','不能由一条诗意表达推断所有地方都丰收']],explanation:'表格帮助组织阅读，不用分类表取代原文依据或必要的自然条件。'}],
 misconceptions:[{observation:'把有一盒颜料理解为雨里真的加入了颜色。',alternatives:['可能按字面解释文学写法，也可能没有联系各景物的实际特征。'],verification:'请指出颜色段的景物与形态，再说明语言中的想象和自然事实怎样分开。',correctiveFeedback:'文学表达让画面生动，不直接证明颜料或雨水造成一切变色的科学过程。'},
  {observation:'每段都只回答颜色很多，没有区分气味和过冬准备。',alternatives:['可能只记住最鲜明一段，也可能还没按内容归类。'],verification:'分别给每段找一个具体信息，说明它属于哪一方面。',correctiveFeedback:'分类要由材料支持，不能让一个方面遮住其余段落。'},
  {observation:'仿写套用了句式，却让颜色、景物与后半句没有联系。',alternatives:['可能只注意外形，也可能没有说明想象依据。'],verification:'请指出给定颜色与景物，再解释后面的比较或动作怎样连起来。',correctiveFeedback:'允许不同想象，但前后条件需要相容，不能任意拼接。'}],
 transfer:{scenario:'换用一种明确给定颜色和形态的原创景物卡，或只用孩子真正观察到的信息。',prompt:'写一小段秋景，可以选一个方面写具体，也可以分方面组织。若仿写，把颜色、景物与想象连起来，并说明依据。',expectedStrategy:'先选择和核对条件，再组织表达；实际与虚构、文学联想与自然事实分别保留。'},
 summary:{synthesis:'读出不同方面，再用具体景物支持。写得有想象，也要保持条件联系；朗读、第二段背诵、识读和实际书写分别留证。',takeaways:['方面不是空标签','细节支持分类','仿写前后有联系','自然描述保留对象与地域条件']},
 citations:[{page:25,quote:'有感情地朗读课文。背诵第2自然段。',usedFor:'summary'},{page:25,quote:'想象一下，秋天的雨还会把颜色分给谁呢',usedFor:'transfer'}],
 },['已查看正文前部、作者脚注、颜色和气味的组织及词义提示，不把文学钥匙或颜料当自然因果。','已查看后部过冬准备与总结、11字识读和13字写字表及全部课后要求，明确仅背诵第2自然段。','已查看太阳时钟阅读链接及作者译者，保留具体地区与对象条件；自然事实仍须学科复核，不把节选描述扩大为普遍规律。']);
// Public-domain poems must reach the real reading body, not just scope metadata.
const poemTexts=[
 ['远上寒山石径斜，','白云生处有人家。','停车坐爱枫林晚，','霜叶红于二月花。'],
 ['荷尽已无擎雨盖，','菊残犹有傲霜枝。','一年好景君须记，','最是橙黄橘绿时。'],
 ['萧萧梧叶送寒声，','江上秋风动客情。','知有儿童挑促织，','夜深篱落一灯明。'],
];
poems.scope.poems.forEach((poem,index)=>{poem.text=poemTexts[index];});
poems.content.concept.explanation='本课原诗\n'+poems.scope.poems.map(poem=>'《'+poem.title+'》\n['+poem.dynasty+'] '+poem.author+'\n'+poem.text.join('\n')).join('\n\n')+'\n\n读诗与理解\n'+poems.content.concept.explanation;
poems.editorNotes.poemTextBoundary='Ancient public-domain poem texts are included in the teaching body. Modern textbook pages and full modern annotations remain private; explanations are original.';
for(const [slug,draft] of [['autumn-poems',poems],['pavement',pavement],['autumn-rain',rain]])fs.writeFileSync(path.join(root,'resources/curriculum/source-lessons/chinese-g3-'+slug+'-v1.json'),JSON.stringify(draft,null,2)+'\n');
console.log(JSON.stringify({drafts:3,targets:[poems.targetIds.length,pavement.targetIds.length,rain.targetIds.length],definitionCandidates:15,published:false,learnerEvidenceCreated:false}));

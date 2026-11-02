// Original teaching drafts for the three activity entries. No source PDF is distributed.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),bookId='archive-book:chinese-g3-upper-02915a7db6517258',prefix='source:chinese:g3:02915a7d:';
const definition=(suffix,name,objective,successCriterion,strand)=>({id:prefix+suffix,version:1,name,subject:'chinese',grade:3,term:'upper',strand,
  objective,successCriterion,prerequisiteIds:[],curriculumVersion:'source-original-02915a7d-v1',status:'draft'});
const reusedEvidence={atomId:'core:chinese:detail-evidence',objective:'将表达中的判断与具体材料对应，分清原信息和补充想象',successCriterion:'指出支持关系，不把虚构例子、推测或听众猜测记成事实'};
function assemble(slug,entry,start,end,definitions,reused,scope,content,pageNotes){
  const goals=[...definitions.map(row=>({atomId:row.id,objective:row.objective,successCriterion:row.successCriterion})),...reused].map((row,index)=>({id:'goal-'+(index+1),...row}));
  return{format:'source-original-lesson-draft-v1',status:'draft_needs_materials_and_review',
    source:{bookId,lessonId:bookId+':unit1:entry'+entry,sourceSha256:'02915a7db6517258434d370430bbf464a1dac6e17df97b90d707dc4ecf5cfedf',pageStart:start,pageEnd:end,publicationYear:null,curriculumStandardYear:null},
    definitionCandidates:definitions,targetIds:goals.map(row=>row.atomId),sourceReview:{confirmedRange:true,
      statement:'已逐张查看准确原件的完整活动页、插图、提示与要求；此为AI来源核对，不是教师审核、结构独立性批准或真人效果。',
      pages:pageNotes.map((statement,index)=>({page:start+index,visualChecked:true,statement}))},
    scope:{...scope,teacherReviewed:false,published:false},content:{...content,goals,prerequisites:[],
      retention:{intervalDays:[1,3,7,14],anchor:'last_relevant_teaching_or_help',instructions:'先审核目标、评分与未见材料库存，再按真实日期核对表现。讲解、提示或重复材料保留曝光与新的保持锚点；本说明不是已经发生的保持结果。'}},
    editorNotes:{slug,teacherReviewed:false,automaticPublication:false,realLearnerEvidence:false,
      reuseBoundary:'仅复用列出的原有目标。新增定义与其他课程的等价、先修关系仍需审阅，不自动注册发布图谱或独立题族。',
      materialStatus:'讲解、例子与图表已具体编写；独立检查材料、评分金样本、各间隔充分库存、实际口语与习作表现仍待完成。'}};
}
const summerDefinitions=[
  definition('summer-interest-selection','选择可交流的暑假经历','从可回忆经历中选择一个别人可能感兴趣的具体内容','能说选择理由，不把旅行远近或花费当作内容优劣，也不编造本人经历','口语交际'),
  definition('summer-narrative-clarity','把一件经历讲清楚','围绕一件事说明必要背景、主要经过和自己的具体发现','听众能复述主要事情，遗漏处能补充，不强求统一开头或夸张情节','口语交际'),
  definition('summer-visual-support','用相关图片或实物辅助讲述','选择与所讲内容直接相关的图片、图画或实物并说明它帮助理解什么','能将图物与讲述对应，装饰性图片或出示数量不代替讲清楚','口语交际'),
  definition('summer-audience-revision','根据试讲意见修订表达','先试讲并听取建议，再针对听众不清楚的一处修改','保存原表达、实际建议和修改理由；没有实际听众时保持该项未验证','口语交际'),
];
const summer=assemble('summer',4,14,14,summerDefinitions,[reusedEvidence],
  {activityKind:'oral_communication',title:'我的暑假生活',realExperienceRequiredForPersonalAccount:true,fictionPracticeMustBeLabelled:true,
    imagesOrObjectsOptional:true,travelOrPaidActivityRequired:false},{
  title:'我的暑假生活：选一件事，让别人听明白',
  activation:{prompt:'回想暑假里一件自己记得的小事：在家、读书、做游戏或观察身边事都可以。你觉得哪一处值得讲给别人听？不必去过远方。',expectedObservation:'孩子能指出一件具体事与一个值得交流的细节；想不起来时先用明确标注的虚构材料练习组织，不记成本人经历。',bridge:'选好内容后，还要考虑听众不知道什么，以及图画或实物怎样帮助理解。'},
  concept:{explanation:'选一件内容比较集中、自己确实记得的事情，先交代听众需要的背景，再讲主要经过，最后说自己的发现。兴趣不等于花钱多或场面大，普通小事的细节也能吸引人。原页建议先给家人试讲、听建议，并可出示相关图片或实物。没有合适照片时，可画一张示意图；图物服务讲述，不替代说清楚。虚构例子只用作练习，不把编写的情节变成本人生活记录。',points:['一件具体事比罗列整个假期更容易讲清','补足听众需要的背景和变化','图物与所讲细节对应','试讲意见具体到哪里听不懂，再修改']},
  example:{situation:'下面是明确虚构的口语练习，不是任何学生的真实暑假：小禾在家尝试给旧书分类，起初只按大小，后来为了方便找书，改按故事、科普分类。',steps:[
    {explanation:'选一个中心：这段话要讲怎样改变分类方法，不把所有假期活动都放进来。',board:['事情：整理旧书','值得讲：分类办法变了']},
    {explanation:'补上变化的原因和经过，让听众知道为什么改方法。',board:['原先按大小','查找不方便','改按内容类别']},
    {explanation:'可画两格示意图比较两种分类，再回答听众“哪里更方便”。图中不需要私人照片。',board:['图一：按大小','图二：按内容','指着图说明变化']},
  ],conclusion:'这段练习靠具体变化吸引听众，图示帮助理解；迁移到本人经历时仍须由孩子真实回忆。'},
  visuals:[{kind:'table',title:'讲述与辅助材料怎样对应',headers:['讲述内容','可能的辅助','帮助听懂什么'],rows:[['原来的分类办法','画旧摆放示意','书为什么不好找'],['后来的分类办法','画新类别标签','改变在哪里'],['自己的发现','口头举一个找书例子','为什么觉得新办法适合']],explanation:'表格是虚构例子的组织工具，不是要求学生照抄同一段生活经历。'}],
  misconceptions:[{observation:'把假期很多事依次列出，却没有讲清任何一件。',alternatives:['可能没有选定中心，也可能以为说得多才算丰富。'],verification:'请听众指出最想知道的一件事，让讲述者补上经过与一个具体细节。',correctiveFeedback:'先保留一件事的必要线索，其他内容可以以后再讲，不按经历数量评分。'},
    {observation:'带来很多图物，但讲述与图物没有对应。',alternatives:['可能将出示图片当作任务本身，也可能不知道听众哪里不明白。'],verification:'请说明一张图具体帮助理解哪一句话，若移去它是否仍能讲清。',correctiveFeedback:'留下有用的一张，指明它与经过或发现的联系；没有照片也能用图画辅助。'}],
  transfer:{scenario:'选择另一件真实小事；若当前只练习，则使用明确标注的原创虚构材料。',prompt:'做一段短讲述，说明一处值得分享的细节，再选择一张相关图或实物解释它的作用。听众有实际意见时保留原意见与修改。',expectedStrategy:'先选中心，再补必要背景和经过，图物与信息对应；没有实际听众不伪造反馈。'},
  summary:{synthesis:'选具体内容，把经历讲清楚，图物帮助听众理解。经历真实与表达组织分别核对，不能用精美图片或丰富旅行代替。',takeaways:['普通小事也有可讲细节','讲述围绕一件事','图物对应具体信息','实际听众意见用来修改']},
  citations:[{page:14,quote:'选择别人可能感兴趣的',usedFor:'concept'}],
},['已查看两幅示例图、两段口语示例、试讲建议及两项提示；任务是选择感兴趣的内容和借助图物讲，不要求旅行、消费或真实照片。']);
const portraitDefinitions=[
  definition('portrait-feature-selection','选一两处能区分人物的特点','从人物提供的材料中选择一两处特别且有区分作用的特点','解释为何比空泛评价更能帮助辨认，不把外貌标签或贬损当作特点','习作'),
  definition('portrait-specific-description','用具体表现支持人物特点','用动作、习惯或一个小例子把选定特点写具体','描写与给定材料或真实观察一致；一句好人、很棒不能替代具体依据','习作'),
  definition('portrait-name-free-clues','不点名仍保留有效线索','在不写姓名的条件下组织能帮助猜认的几句话或一段话','线索具体且相互一致；听众未必猜中时仍检查线索，不以猜中人数单独评写作','习作'),
  definition('portrait-paragraph-revision','按反馈修订人物习作','开头空两格，写后朗读并核对听众对线索的理解','保存原稿与具体修订，段首格式与内容质量分别检查，不以字体截图替代本人习作','习作'),
];
const portrait=assemble('portrait',5,15,15,portraitDefinitions,[reusedEvidence],
  {activityKind:'writing',title:'猜猜他是谁',selectedFeatureCount:[1,2],nameInCompositionAllowed:false,firstLineIndentCharacters:2,requiredWordCount:null},{
  title:'猜猜他是谁：让一两处具体特点成为线索',
  activation:{prompt:'比较“这个同学很好”和“每次借走图书，他会把折起的书角轻轻展平再归还”。哪句更容易让读者想象一个人的表现？为什么？',expectedObservation:'孩子能指出具体行为比空泛评价提供更多线索，不据一件事推断人物永远如此。',bridge:'接下来先选一两处特点，再用实际材料支持，写作中不点姓名。'},
  concept:{explanation:'原页要求选择一个同学，用几句话或一段话写一写，不出现姓名，并选择一两点特别之处。特点可以来自外貌、性格、爱好或具体行为，不必全部列齐。用一个动作、习惯或小例子让特点可理解，避免只有评价词。写完检查开头空两格，再读给同伴听，看线索是否清楚；猜错也可能是听众不熟悉材料，应核对表达而不是只数猜中人数。练习可用虚构人物资料卡，必须标明虚构，不把例子冒充对真实同学的观察。',points:['选一两点，避免人物清单式堆砌','用具体表现支撑特点','不点姓名，但保留有效线索','段首格式、表达内容和听众理解分别检查']},
  example:{situation:'原创虚构资料卡：甲喜欢做纸模型，午休会把边角纸留作零件；乙喜欢朗读，会比较同一句的不同读法。任务是描写甲，不写姓名。',steps:[
    {explanation:'先选择有区分作用的一点：爱做纸模型。不要把乙的朗读习惯写进来。',board:['对象：甲','选择：模型爱好','排除混写其他资料']},
    {explanation:'加入支持特点的动作，比“非常有才华”具体。',board:['边角纸也留着','留作模型零件','行为支持爱好']},
    {explanation:'形成一小段后，检查不出现姓名、段首空两格、两句是否连贯。请真实听众说明依据；无人参与时不编造猜认结果。',board:['段首格式','姓名检查','线索是否有据']},
  ],conclusion:'例如“他爱做纸模型，连边角纸也舍不得扔，会留着当小零件。”只是资料卡写作例子，不是对某位学生的真实评价。'},
  visuals:[{kind:'table',title:'从资料到特点，再到句子',headers:['资料','可选特点','应避免的跳跃'],rows:[['把边角纸留作零件','喜欢做模型，可用动作支持','不能断言所有手工都做得最好'],['比较一句话的不同读法','喜欢朗读并留意表达','不能把它混入甲的资料'],['有一次帮助同伴整理材料','这一具体帮助行为','不能只凭一次写成每次、永远']],explanation:'表格帮助核对描写是否有依据，不把虚构人物资料当作真实学生档案。'}],
  misconceptions:[{observation:'列出很多外貌、爱好，却没有可区分的具体表现。',alternatives:['可能把丰富误解为列得多，也可能还不会选择重点。'],verification:'请删到一两点，再给每点找一个有据的动作或小例子。',correctiveFeedback:'重点少而清楚可以比长清单更有效，不新增字数竞赛。'},
    {observation:'同伴猜错，作者就随意添加材料没有写过的事。',alternatives:['可能只追求猜中，也可能没有分清修订与编造。'],verification:'逐句标出资料依据或真实观察，解释哪条线索仍含糊。',correctiveFeedback:'修订表达可更具体，但不能靠补造经历证明人物特点；听众了解程度也要考虑。'}],
  transfer:{scenario:'换用两个特点容易混淆的原创虚构人物资料，或由学生选择一位熟悉同伴并只用可表达的真实观察。',prompt:'选一两处特点写几句话或一段话，不写姓名。标出支持特点的细节，检查段首空两格，并根据实际朗读意见修订一处。',expectedStrategy:'先核对对象与信息，再选有区分作用的细节，分别检查内容、姓名条件与格式。'},
  summary:{synthesis:'人物习作靠有依据的具体线索，让读者认识一两处特点。写作不要求面面俱到，猜认结果也不能替代内容核查。',takeaways:['特点有区分作用','具体细节支持判断','不点名但不含糊','原稿与修订分别保留']},
  citations:[{page:15,quote:'选择一两点写下来',usedFor:'concept'}],
},['已查看不出现姓名、选一两处特点、几句话或一段话、开头空两格及写后读给同学听的要求；没有固定字数或必须逐一描写所有方面的要求。']);
const gardenDefinitions=[
  definition('garden-body-idioms','观察成语中的共同线索','观察原页八组成语的用字和所描写状态，交流共同特点','能指出身体部位等具体线索，区分词中形象与字面实际事件，不因含身体字就断言含义相同','词句段运用'),
  definition('garden-oral-meaning','用朗读表达句意','根据句意尝试重音、停顿与语气，并解释一次选择','保留真实录音，意义相容的不同读法可接受，不能仅凭文字标记判实际发音或表达通过','词句段运用'),
  definition('garden-group-naming','给兴趣小组取合适名字','将活动特点与易记的表达结合，为给定兴趣小组命名','名字与实际活动相符且能说明理由，不只追求响亮或套用原页名字','词句段运用'),
  definition('garden-poem-scene','依据诗句理解所见画面','结合动作与声音理解所见中的画面和变化','能说明牧童由唱歌到闭口站立及想捕蝉，不能把意欲当成已经捕到或把图画当作额外事实','古诗阅读'),
  definition('garden-poem-reading','所见的实际朗读与积累','正确朗读并在适当练习后尝试积累所见，保留实际声音','朗读和脱离文本背诵分开记录，提示、看文和重复曝光不伪装成独立保持结果','古诗积累'),
];
const fresh={atomId:prefix+'asking-fresh-language',objective:'选择实际读到且自己感到新鲜的词句，说明理由并积累',successCriterion:'词句确在材料中，解释具体；读、抄、谈感受分别核对，不要求统一感受'};
const garden=assemble('garden',6,16,17,gardenDefinitions,[fresh],
  {activityKind:'language_garden',sections:['交流平台','词句段运用','日积月累'],idioms:['摇头晃脑','披头散发','张牙舞爪','提心吊胆','面红耳赤','手忙脚乱','眼疾手快','口干舌燥'],
    poem:{title:'所见',author:'袁枚',dynasty:'清'},newHandwritingListPresent:false},{
  title:'语文园地：发现表达线索，用声音与文字试一试',
  activation:{prompt:'读一小段适龄材料，选一个让你停下来注意的词句，说说是哪几个字让你产生画面。别急着猜标准感受。',expectedObservation:'孩子能指向具体词句说明个人发现，也能承认目前还不理解的词。',bridge:'园地把这种发现延伸到成语、朗读、小组命名和古诗画面，各项分别练习。'},
  concept:{explanation:'交流平台鼓励留意新鲜词句，多读、积累并交流感受。原页八组成语都可观察到身体部位等用字线索，但含义和语境不同，不能只按字面或一条标签解释全部。朗读重音、停顿和语气应服务句意，允许不同有依据的读法；历史人物的话也不能转成今天儿童必须接受伤害的要求。兴趣小组名称既要体现活动，又可有个性、便于记忆。《所见》为清代袁枚所作，关注牧童、黄牛、歌声与后来闭口站立的变化；意欲表示想要，诗句没有说已经捕到蝉。',points:['选新鲜词句并说明具体理由','发现成语共性，同时保留含义差别','实际朗读与书面标记分别看','名称贴合活动，再考虑特色','由动作和声音读古诗，不替诗补结果']},
  example:{situation:'原创综合例子：阅读小组准备交流“晚风翻动书页，故事像向我们招手”。一名同学把组名取为“小小观察队”，另一个提出“书页探路团”。',steps:[
    {explanation:'先选新鲜表达并说明依据：招手把故事与人的交往联系，不能据此说书本真的长手。',board:['注意词句：向我们招手','联想依据：人的交往活动']},
    {explanation:'比较名称与活动关系。阅读与书页直接相关，但观察队不一定不行，应请命名者说明观察什么、怎样活动。',board:['活动：阅读交流','名称线索：书页、探路','评价：是否贴合、是否易记']},
    {explanation:'用真实声音尝试两种读法，解释哪种停顿更能保留意思；书面方案不能代替录音。',board:['先理解句意','试读并保留录音','比较后说明选择']},
  ],conclusion:'几项活动相互联系，但名称、朗读与阅读理解的证据分别记录，不能用一次综合展示代替所有目标。'},
  visuals:[{kind:'table',title:'园地任务看什么证据',headers:['任务','观察什么','不能替代什么'],rows:[['成语交流','用字线索与具体语境','背一个共同标签不能证明逐词理解'],['朗读','实际声音与句意选择','重音标记不能证明实际语气'],['兴趣组命名','名称与活动特点的联系','响亮不等于一定贴合活动'],['所见画面','歌声、动作与意欲的变化','想要捕蝉不等于已经捕到']],explanation:'表格帮助把几种学习表现分清，不把单项通过扩大成整个园地完成。'}],
  misconceptions:[{observation:'认为八组成语都含身体部位，所以含义完全相同。',alternatives:['可能把用字共性当成语义等同，也可能没有比较具体情境。'],verification:'换用“手忙脚乱”和“眼疾手快”两个原创情境，分别说明人物动作状态。',correctiveFeedback:'共同用字可以发现，词义仍须逐项结合情境，不能套一个解释。'},
    {observation:'把“意欲捕鸣蝉”说成已经捉到蝉。',alternatives:['可能忽略意欲的意思，也可能从插图补造了后续。'],verification:'请分别指出诗中写的意图和实际动作，说明哪个结果未出现。',correctiveFeedback:'想要与已经完成不同；保留欲捕的意图、闭口站立的动作，不编造捕到结果。'},
    {observation:'选中一种停顿方案后，被当作实际朗读已经通过。',alternatives:['可能把书面计划与声音表现混在一起，也可能缺少录音。'],verification:'先听完整真实录音，再对照句意核查语气；没有声音时不推断。',correctiveFeedback:'文字方案可以讨论，真实朗读需要实际声音，背诵又是另一个任务。'}],
  transfer:{scenario:'换一段原创短诗、两个新的兴趣活动和一组能形成对照的词语，不直接重用课堂答案。',prompt:'选择一项先做：说明词句线索、为真实给定活动命名，或真实录音解释读法。再对照《所见》区分人物想做与已经做的事，各项单独留证。',expectedStrategy:'先理解所给材料，再说明选择依据；不把复用答案、文字选择或想象结果当作新的独立表现。'},
  summary:{synthesis:'从词句中发现线索，用句意选择读法，用活动检验名称，用动作和声音读古诗。积累与理解、朗读与背诵分别看。',takeaways:['用字共性不抹平词义','朗读选择服务句意','名字与活动相联系','诗中意图不等于完成结果']},
  citations:[{page:16,quote:'下面的成语有什么特点',usedFor:'concept'},{page:17,quote:'在班里组织几个兴趣小组吧',usedFor:'transfer'}],
},['已查看交流平台、八组成语及三句朗读交流材料，保留朗读的意义与历史语境边界。','已查看兴趣小组命名的两项提示，以及袁枚所见全文、作者朝代和插图；诗中未写已经捕到蝉，不以插图补成结论。']);
garden.scope.poem.text=['牧童骑黄牛，','歌声振林樾。','意欲捕鸣蝉，','忽然闭口立。'];
garden.content.concept.explanation='日积月累原诗\n《所见》\n[清] 袁枚\n'+garden.scope.poem.text.join('\n')+'\n\n园地学习\n'+garden.content.concept.explanation;
garden.editorNotes.poemTextBoundary='Ancient public-domain poem text is included in the teaching body. Modern textbook pages and full modern annotations remain private; no extra dictation task is added.';
for(const [slug,draft]of [['summer',summer],['portrait',portrait],['garden',garden]])fs.writeFileSync(path.join(root,'resources/curriculum/source-lessons/chinese-g3-'+slug+'-v1.json'),JSON.stringify(draft,null,2)+'\n');
console.log(JSON.stringify({drafts:3,targets:[summer.targetIds.length,portrait.targetIds.length,garden.targetIds.length],definitionCandidates:13,published:false,learnerFactsWritten:false}));

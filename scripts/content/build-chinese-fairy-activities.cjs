// Original activity drafts from the exact original's visually checked physical pages45 through49.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),bookId='archive-book:chinese-g3-upper-02915a7db6517258',prefix='source:chinese:g3:02915a7d:';
const definition=(suffix,name,objective,successCriterion,strand)=>({id:prefix+suffix,version:1,name,subject:'chinese',grade:3,term:'upper',strand,objective,successCriterion,prerequisiteIds:[],curriculumVersion:'source-original-02915a7d-v1',status:'draft'});
const evidence={atomId:'core:chinese:detail-evidence',objective:'结合明确材料说明判断，分清原信息、虚构创作与实际阅读范围',successCriterion:'说明依据和来源，未读整本不由节选或目录推断已完成，追加想象不冒充原文'};
const meaning={atomId:'core:chinese:contextmeaning',objective:'结合具体词句语境解释含义，说明所用方法',successCriterion:'解释有当前线索支持，不机械逐字拆词或把一类意思套入所有语境'};
function assemble(slug,entry,start,end,definitions,reused,scope,content,pageNotes){
 const goals=[...definitions.map(row=>({atomId:row.id,objective:row.objective,successCriterion:row.successCriterion})),...reused].map((row,index)=>({id:'goal-'+(index+1),...row}));
 return{format:'source-original-lesson-draft-v1',status:'draft_needs_materials_and_review',source:{bookId,lessonId:bookId+':unit3:entry'+entry,sourceSha256:'02915a7db6517258434d370430bbf464a1dac6e17df97b90d707dc4ecf5cfedf',pageStart:start,pageEnd:end,publicationYear:null,curriculumStandardYear:null},
  definitionCandidates:definitions,targetIds:goals.map(row=>row.atomId),sourceReview:{confirmedRange:true,statement:'选定原件全部页、任务、示例、插图和书目已逐张查看；只是教材页来源核对，不是教师审核或推荐整本书已读证明。',pages:pageNotes.map((statement,index)=>({page:start+index,visualChecked:true,statement}))},scope:{...scope,teacherReviewed:false,published:false},
  content:{...content,goals,prerequisites:[],retention:{intervalDays:[1,3,7,14],anchor:'last_relevant_teaching_or_help',instructions:'目标、结构、评分和充分未见材料先审核，按真实日期保留实际表现。重复故事、提示和示范保留条件，不用计划、勾选或模拟日期当已完成保持。'}},
  editorNotes:{slug,teacherReviewed:false,automaticPublication:false,realLearnerEvidence:false,materialStatus:'具体原创讲解、例子、图表、错因与迁移已写；检查材料、独立结构、评分金样本和充分保持库存仍需审核。',reuseBoundary:'只复用明确列出的通用目标，新增定义和等价先修保持待审。',pacing:'习作、实际修改、字音与阅读分次留证，阅读计划不是已发生的整本阅读，局部表现不替全部目标。'}};
}
const composingDefs=[
 definition('fairy-composing-elements','选择角色时间地点形成故事起点','从给定词中选一个或几个并可增添角色，确定时间地点和要发生的事','元素选择有联系，不要求九个词全用，也不把新加角色当违反原任务','习作'),
 definition('fairy-composing-event-link','把想象故事的事件连起来','围绕角色行动组织开端变化与结果，使读者理解前后联系','想象可以奇妙，事件条件仍相容；不只罗列元素或用突然解决全部问题','习作'),
 definition('fairy-composing-imagination','用合适想象表现角色和事件','让人物动植物或物品有与故事相联系的说话想法或行动','允许不同合理创意，不强迫所有对象都说话，不把童话创作写成真实经历或科学证明','创意表达'),
 definition('fairy-composing-self-revision','读回习作修订并尝试合适题目','写后小声读检查通顺，保留具体修改；愿意时给故事加题目','原稿与改稿可比，题目反映内容；纸面可检查居中，不把排版字体截图代本人习作，也不强制标题或字数','习作修订'),
];
const composing=assemble('fairy-composing',5,45,45,composingDefs,[evidence],
 {title:'习作：我来编童话',activityKind:'writing',providedRoles:['国王','啄木鸟','玫瑰花'],providedTimes:['黄昏','冬天','星期天'],providedPlaces:['厨房','森林超市','小河边'],
  allProvidedWordsRequired:false,newCharactersAllowed:true,titleOptional:true,handwrittenTitleCenteredWhenProvided:true,requiredWordCount:null},{
 title:'我来编童话：选有联系的元素，把事情讲完整',
 activation:{prompt:'从国王、啄木鸟、玫瑰花等词里选一个你愿意写的角色，再配一个时间和地点。若想添加月亮或小公主也可以。你想让什么事发生？',expectedObservation:'孩子能先选一个有联系的起点，不以用完所有词或角色越多越好作为目标。',bridge:'确定角色在做什么、遇到什么变化，再想怎样一步步发展。'},
 concept:{explanation:'原页允许从给定词中任选一个或几个，也可添加喜欢的角色，不要求九个词全部使用。先定角色、时间、地点，再想他们在那里做什么、之间发生什么事。童话可以让植物物品说话、有愿望，想象奇妙也要让前后条件相容，给读者理解行动变化的线索。写完小声读，发现一句不顺或对象不清就具体修改，保留原稿。题目是可尝试添加，内容与题目相配，纸面标题可检查居中；不增加统一字数或唯一结尾。原创童话与真实生活记录不同，不把创作里的活动记成孩子已经亲历。',points:['选一个或几个元素即可','角色行动引出变化','想象与前后条件相容','读回具体改一处','题目可选，写了就与内容相配']},
 example:{situation:'原创虚构起点：冬天，玫瑰花想在森林超市给朋友选礼物，啄木鸟担心包裹被风吹散。这里不采用给定全部词。',steps:[
  {explanation:'确定核心事情是怎样送好礼物，不再无目的添加每个角色和地点。',board:['角色：玫瑰花、啄木鸟','时间地点：冬天、森林超市','事情：包裹怕被吹散']},
  {explanation:'可以让角色想办法：选合适包装、互相分工，前后动作要解释问题怎样改变。',board:['遇到问题','提出办法','行动与结果对应']},
  {explanation:'读回一句含糊话如它把它交给它，补清谁交给谁；题目可围绕包裹或礼物来拟。',board:['找对象不清处','具体补清角色','标题可选且贴合内容']},
 ],conclusion:'这是帮助构思的虚构例子，孩子可以写完全不同的合理故事，不必照抄同一情节。'},
 visuals:[{kind:'table',title:'从元素到故事，再到修改',headers:['步骤','需要想清楚','避免的跳跃'],rows:[['选起点','谁、何时、何地','不把九词清单当故事'],['发展事件','做什么、遇到什么变化','不靠突然一句跳过所有过程'],['组织结果','行动怎样带来改变','结尾与前面条件相容'],['读回修订','哪句不顺、谁指代不清','不只有整齐排版而无实际原稿']],explanation:'表格是构思工具，不限定唯一角色数量、主题或道德结论。'}],
 misconceptions:[{observation:'以为所有词都必须写进同一篇，结果人物地点频繁跳换。',alternatives:['可能误解任选，也可能把用词数量当完成标准。'],verification:'回看原页任选一个或几个的提示，删到一个能讲清楚的中心。',correctiveFeedback:'选择有联系的元素，新增角色也允许，不按用词总数排名。'},
  {observation:'想象很多，却没有说明事情如何发展，或以突然都好了收尾。',alternatives:['可能只积累画面，也可能尚未把角色行动与结果连接。'],verification:'让读者指出缺的那一步，再补一个与条件相容的行动。',correctiveFeedback:'奇妙不等没有联系，保留变化原因，不要求唯一结尾。'}],
 transfer:{scenario:'换一组原创词卡，如月亮、晚饭后、屋顶花盆，允许只选有联系的部分。',prompt:'写一个小故事，标出起点、一个变化和怎样解决或继续发展。读回修改一处，说明题目是否选择添加。',expectedStrategy:'自主选材、合理想象、事件连贯与实际修订分别核查，虚构清楚标明。'},
 summary:{synthesis:'先选有联系的起点，再用行动把变化讲清。读回修改帮助别人理解，题目和字数不代替故事本身。',takeaways:['给定元素可选择','想象服务故事联系','具体行动连接结果','原稿与修改保留']},
 citations:[{page:45,quote:'事情发生在什么时间？是在哪里发生的',usedFor:'concept'},{page:45,quote:'写完以后小声读一读，看看句子是否通顺',usedFor:'summary'}],
 },['已查看九词卡、角色任选及可增加提示、时间地点事件三个构思问题、写后小声读与可尝试居中题目；不强制全部词或统一字数。']);
const gardenDefs=[
 definition('garden-three-fairy-observation','联系本单元说明童话想象','从具体人物和事件交流童话的拟人想象与阅读发现','有可定位例子，植物会说话不当科学事实，不强迫所有童话同一情绪或单一启示','童话阅读'),
 definition('garden-three-character-reading','比较字形并识读园地七字','联系伸申界介等字形对比识读申介绍宗乙召孝七字','真实声音覆盖七字，能说明一组字形差别，不凭部件相似推定全部同音同义','识字与阅读'),
 definition('garden-three-mouth-groups','按意义发现口字相关字的联系','比较咬吞含、叫喊唤和拟声等字，解释一组意义联系','字形与具体词语共同判断，分类是当前样例规律，不说带口的字永远同一义','识字与词语'),
 definition('garden-three-revision-signs','用改正增补删除符号修订','在本人原稿中用三种修改符号表达具体改动','原字或原句与改动可比，能区分操作目的，实际标记不由说出三种名称代替','习作修订'),
 definition('garden-three-proverb-reading','读懂三条讲理谚语并联系情境','实际朗读三条谚语，用一个具体情境说明讲理需依据','声音与理解分别看，不把声音大身份高或有理必在所有现实中立即获胜当道理','语言积累'),
];
const garden=assemble('garden-three',6,46,47,gardenDefs,[meaning],
 {title:'语文园地（三）',activityKind:'language_garden',recognitionCharacters:['申','介','绍','宗','乙','召','孝'],writingCharacters:[],sections:['交流平台','识字加油站','词句段运用','日积月累'],
  revisionOperations:['改正','增补','删除'],proverbs:['灯不拨不亮，理不辩不明。','有理走遍天下，无理寸步难行。','一时强弱在于力，万古胜负在于理。']},{
 title:'语文园地（三）：发现字词联系，用修改说明改了什么',
 activation:{prompt:'咬、叫、哗都有口，意思是不是完全相同？先给每个字配一个熟悉的词，再说发现的联系。',expectedObservation:'孩子能联系动作、说话或声音解释，不只因为同部件就判断同义。',bridge:'比较字形和意义，也把修改操作与实际句子联系起来。'},
 concept:{explanation:'交流童话时用本单元具体例子说明拟人和想象，启示可以有依据地不同，不把童话情节当科学全机制。识字站比较伸与申、界与介、棕与宗、忆与乙、招与召、教与孝，七字识读还包括介绍的绍；相似部件不保证同音同义。口字样例可发现吃的动作、发声说话与拟声等联系，分类来自当前词语，不推广所有带口字只有一种含义。改正是把错误换对，增补是加缺项，删除是去不合适的部分；实际在原稿用符号保留前后关系。三条谚语鼓励分辨事理和依据，不能把比声音大或身份高当讲理，也不把文学格言当每次现实立刻获胜的保证。',points:['童话发现举具体例子','七字音形结合但不硬套同音义','口字联系需当前词语支持','三种修改各有实际目的','讲道理用事实和理由']},
 example:{situation:'原创虚构草稿：“小鹿以经到了。它背着书包，一顶绿帽子。包里装着文具，有铅笔、橡皮和苹果。”仅练习明确的修改任务，最后句要先核查分类目的。',steps:[
  {explanation:'按已经的正确字改以为已，用改正符号联系原字与新字。',board:['改正：以→已']},
  {explanation:'帽子前缺动作，可增补戴着，保持衣物动作搭配相容。',board:['增补：戴着一顶绿帽子']},
  {explanation:'若该句明确只列文具，苹果不属当前类别，可删除或改写类别说明；先说清修改目的，不机械把苹果在任何句中都删去。',board:['核对当前类别','按任务删除或改写','保留原稿与理由']},
 ],conclusion:'修改要说明具体问题，符号帮助留下改动，不是把三种名称背熟就等于已经修订。'},
 visuals:[{kind:'table',title:'三种修改怎样起作用',headers:['操作','要处理的问题','实际留下什么'],rows:[['改正','错字或不合适表达','原项与替换项的对应'],['增补','缺少必要信息或词语','插入位置和新增内容'],['删除','多余或不合当前条件的部分','原内容与删除标记']],explanation:'图示语义由本人原稿和修改目的核对；不以字体图截图代替实际标注。'}],
 misconceptions:[{observation:'看到部件相似就把申读成伸的所有词义，或漏掉介绍的绍。',alternatives:['可能只看字形，也可能把对比表当成六个字。'],verification:'核对七字全表和具体词语，分别说音形与含义。',correctiveFeedback:'七字实际覆盖，字形线索有用但不是同音同义保证。'},
  {observation:'会背三种修改名称，却没有原稿或不知道为什么改。',alternatives:['可能把术语当完成，也可能只模仿符号形状。'],verification:'给一处具体原句，说明问题、操作和改后意思。',correctiveFeedback:'符号服务修改目的，本人实际标记与理由都要看，不只数符号。'}],
 transfer:{scenario:'换一段明确给定目的的原创草稿，或由本人自愿提供可交流习作。',prompt:'找一处需要改正、增补或删除的问题，真实标记并解释。再选一个口字相关词或谚语，说明当前语境。',expectedStrategy:'从条件和意义决定改法，操作与原稿对应，不把当前分类规律套成所有情况。'},
 summary:{synthesis:'比较发现联系，解释保留语境。修改要有实际原稿和理由，讲理也要回到事实与支持关系。',takeaways:['七字识读不漏绍','部件相似不保证同音义','改正增补删除目的不同','谚语联系具体道理与依据']},
 citations:[{page:47,quote:'并试着使用这些修改符号修改自己的习作',usedFor:'transfer'},{page:47,quote:'有理走遍天下，无理寸',usedFor:'concept'}],
 },['已查看交流平台童话想象、六组字形对比和申介绍宗乙召孝七字识读；本页无写字表。','已查看口字三组样例、三种修改符号及示例、三条讲理谚语；实际分类与修改目的有条件，不机械推广。']);
const readingDefs=[
 definition('fairy-reading-book-identity','认识推荐书目与所读版本','区分安徒生童话稻草人格林童话的作者整理者与实际所选版本','目录推荐不当整本已读，记录实际书名版本和当前范围，不将不同译本所有字句强当相同','整本书阅读'),
 definition('fairy-reading-excerpt-evidence','从拇指姑娘节选找画面依据','联系当前节选中人物动作环境和移动描写形成画面','原信息可定位，人物想象和追加创作分清，不由两页推荐推断原作全部情节','文学阅读'),
 definition('fairy-reading-perspective','带着角色处境阅读并交流','把自己想象成角色，联系具体处境说明感受或疑问','接受有依据的不同反应，不要求真实冒险或复制角色动作，也不强迫统一情绪','阅读体验'),
 definition('fairy-reading-real-progress','制定阅读安排并保留实际进度','选择可获得的适龄版本，安排短阅读并记录真正读到的范围与问题','计划和已读分别记，未读完保留未完；不伪造页数连续天数或同伴反馈','阅读习惯'),
];
const reading=assemble('fairy-reading',7,48,49,readingDefs,[evidence],
 {title:'快乐读书吧：在那奇妙的王国里',activityKind:'whole_book_reading',recommendedBooks:[{title:'安徒生童话',author:'安徒生',country:'丹麦'},{title:'稻草人',author:'叶圣陶'},{title:'格林童话',collectors:'格林兄弟',country:'德国'}],
  excerpt:{title:'拇指姑娘',author:'安徒生',translator:'叶君健',adapted:true},recommendedWholeBooksActuallyReadInThisBatch:false,actualLearnerProgressNotCreated:true},{
 title:'在那奇妙的王国里：从节选出发，真实地开始整本阅读',
 activation:{prompt:'看到一份推荐书目，与自己真正读过一本书有什么不同？可以说想读，也可以承认还没拿到适合版本。先选一个愿意了解的故事。',expectedObservation:'孩子能分清推荐、计划、读过片段和整本已读，不以书名熟悉当已经完成阅读。',bridge:'先读原页拇指姑娘节选，再看怎样选择书、记录实际范围和自己的疑问。'},
 concept:{explanation:'本页推荐安徒生的安徒生童话、叶圣陶的稻草人和德国格林兄弟搜集整理的格林童话，书目与作者身份分别看，实际版本要由手边书核对。拇指姑娘节选写随燕子飞过不同环境、寒冷时钻入羽毛以及到达温暖地方的景致，可以从动作与环境找画面依据；它是叶君健译的改动节选，不代表已读完整故事或整本书。阅读可以把自己想象成角色，理解处境与感受，仍不必复制角色冒险或统一欢喜悲伤。先选可获得的适龄版本，安排能做到的小段，记录真正读到哪一篇哪一部分、一个发现与一个问题；计划不是已读，没读完保持未完。',points:['书目作者与实际版本分别核对','节选画面有文字依据','角色想象与原文分清','阅读安排与实际进度分开','未读完不补成整本完成']},
 example:{situation:'原创阅读安排示例，不是学生真实记录：先找到适龄童话选本，核对书名与译者；计划下一次读一篇。读后只记录实际完成的篇名和一处问题，若只读半篇就写半篇。',steps:[
  {explanation:'先检查手边版本，不因标题熟悉就假定和教材节选字句完全一样。',board:['书名作者','译者版本','可获得的实际材料']},
  {explanation:'计划栏写打算读，实际栏在真正阅读后再记，不能提前打已完成。',board:['计划：想读哪篇','实际：真正读到哪里']},
  {explanation:'交流一处材料依据和一个问题，不需要编造全书结局或同伴意见。',board:['具体发现','当前疑问','尚未读完部分保留']},
 ],conclusion:'安排帮助开始，实际阅读和理解需要本人后续完成，参考示例不能代填学习记录。'},
 visuals:[{kind:'table',title:'推荐、节选、计划与已读',headers:['类别','当前能说明什么','不能替代'],rows:[['推荐书目','可选择了解哪些作品','不代表整本已读'],['当前节选','这一范围的动作环境和语言','不证明全部原作情节'],['阅读计划','准备怎样开始','不当已发生进度'],['实际记录','本人真正读到范围和问题','不以勾选代理解或长期习惯']],explanation:'表格帮助保持阅读事实，不替孩子写虚假的页数、日期或完成状态。'}],
 misconceptions:[{observation:'只读推荐页就说三本书全读完，或把教材两段当完整原作。',alternatives:['可能混淆书目与正文，也可能想用完成勾选替代实际范围。'],verification:'请指出手边版本及真正读到的篇章，不确定部分保留未读。',correctiveFeedback:'读片段也有收获，准确记录范围，不把未读补成全读。'},
  {observation:'把自己想象成角色，就将自己的新情节写成原书必有。',alternatives:['可能未区分阅读感受与续写，也可能凭熟悉版本替代当前文字。'],verification:'逐项指出原句与自己追加的想象，标明版本与范围。',correctiveFeedback:'想象可丰富阅读，但不能改写当前原信息；续写另标创作。'}],
 transfer:{scenario:'由本人选择另一篇可获得的适龄童话，先核对实际版本与当前所读范围。',prompt:'读后用一条具体细节说明画面或感受，再留一个问题和下一次小安排；未读过时只作计划，不代填结果。',expectedStrategy:'材料身份、片段依据、个人感受与真实进度分清，阅读活动不制造已完成事实。'},
 summary:{synthesis:'发挥想象去读，也准确说自己读过什么。一个节选可以引出整本阅读，书目、计划和完成不是同一件事。',takeaways:['实际版本要核对','节选不等整本','感受与想象有来源','真正读后再记录进度']},
 citations:[{page:48,quote:'终于他们来到了温暖的国度',usedFor:'concept'},{page:49,quote:'一起欢笑，一起悲伤。',usedFor:'transfer'}],
 },['已查看推荐安徒生童话、拇指姑娘完整节选与叶君健译有改动标注，不称整本原作已读。','已查看角色想象提示、叶圣陶稻草人与德国格林兄弟整理格林童话推荐及插图，仅教材推荐范围已读，不代替三本完整书。']);
for(const [slug,draft]of[['fairy-composing',composing],['garden-three',garden],['fairy-reading',reading]])fs.writeFileSync(path.join(root,'resources/curriculum/source-lessons/chinese-g3-'+slug+'-v1.json'),JSON.stringify(draft,null,2)+'\n');
console.log(JSON.stringify({drafts:3,targets:[composing.targetIds.length,garden.targetIds.length,reading.targetIds.length],definitionCandidates:13,published:false,wholeRecommendedBooksRead:false,learnerEvidenceCreated:false}));

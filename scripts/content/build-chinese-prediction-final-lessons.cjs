// Exact-source unit4 writing and garden. Original teaching is separated from
// the supplied pictures, example sentences and unreviewed learner materials.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),bookId='archive-book:chinese-g3-upper-02915a7db6517258',prefix='source:chinese:g3:02915a7d:';
const def=(suffix,name,objective,successCriterion,strand)=>({id:prefix+suffix,version:1,name,subject:'chinese',grade:3,term:'upper',strand,objective,successCriterion,prerequisiteIds:[],curriculumVersion:'source-original-02915a7d-v1',status:'draft'});
const evidence={atomId:'core:chinese:detail-evidence',objective:'判断对应当前图文、原稿或真实交流信息，补充想象有明确身份',successCriterion:'原图已给、合理推测和本人续写分别标明，不用参考稿、后改或假同伴回应替真实原记录'};
const meaning={atomId:'core:chinese:contextmeaning',objective:'结合具体词句含义选择读音与解释，说明线索怎样起作用',successCriterion:'解释有当前语境支持，不把一个词义读音套全部词语，也不把数字成语或谚语逐字当现实定律'};
function make(slug,entry,start,end,definitions,scope,content,notes,withMeaning=false){const goals=[...definitions.map(d=>({atomId:d.id,objective:d.objective,successCriterion:d.successCriterion})),...(withMeaning?[meaning]:[]),evidence].map((g,i)=>({id:'goal-'+(i+1),...g}));return{format:'source-original-lesson-draft-v1',status:'draft_needs_materials_and_review',source:{bookId,lessonId:bookId+':unit4:entry'+entry,sourceSha256:'02915a7db6517258434d370430bbf464a1dac6e17df97b90d707dc4ecf5cfedf',pageStart:start,pageEnd:end,publicationYear:null,curriculumStandardYear:null},definitionCandidates:definitions,targetIds:goals.map(g=>g.atomId),sourceReview:{confirmedRange:true,statement:'选定原件全部原页、任务、图示与例句已逐张查看。只核当前教材范围，不把示范、续写、订正或拟议材料当教师审核和真实活动完成。',pages:notes.map((statement,i)=>({page:start+i,visualChecked:true,statement}))},scope:{...scope,teacherReviewed:false,published:false},content:{...content,goals,prerequisites:[],retention:{intervalDays:[1,3,7,14],anchor:'last_relevant_teaching_or_help',instructions:'审核目标、量规、未见结构与充分库存后按真实日期安排。已读原篇和示例、修改后的答案不恢复首次未见资格；拟议间隔、角色演示或模拟日期不能证明真人保持。'}},editorNotes:{slug,teacherReviewed:false,automaticPublication:false,realLearnerEvidence:false,materialStatus:'原创教学与候选材料，教师对齐、独立结构、评分及充分保持库存仍待审。',sourceBoundary:'原图文、角色示范、本人原稿与真实同伴活动分别核查；不以模板或题数代表实际完成。'}};}
const writing=make('story-continuation',5,65,65,[
 def('continuation-given-picture','区分原图信息与续写想象','读取已给图画和气泡，确定继续写作需要承接的条件','李晓明快过生日、父母外地工作与同伴讨论是已给；具体庆祝办法、本人心情和结果需由后续创作明确，不推家庭忽视或精确年龄','图文与习作'),
 def('continuation-coherent-story','完成有联系和结果的续写','根据前图人物处境写出行动、经过与结果相联系的后续','新行动承接前情，有具体经过与回应，可以有不同合理结局；原图、本人新增内容和参考示例分清，不强定蛋糕聚会或统一字数','习作表达'),
 def('continuation-own-revision','朗读并用修改符号订正本人原稿','小声读本人续写，找明显问题并用已学修改符号改正','保留本人原稿、实际标记和改后内容，说明怎样改清楚；下载范文、只抄改后稿或文字说改过不代实际原稿订正','习作修改'),
 def('continuation-reasoned-preference','交流习作并说明偏好理由','交流实际习作后选择喜欢内容，联系具体表达说明理由','偏好有可定位的情节或表达依据，允许不同喜欢；真实同伴作品和示例比较分别记录，不按人气或与范文相同程度评全部能力','习作交流'),
],{title:'习作：续写故事',activity:true,givenPictures:3,lastPictureIsQuestion:true,liXiaomingBirthdaySoon:true,liXiaomingAgeSpecified:false,parentsWorkingElsewhere:true,requiredEndingIsBirthdayParty:false,requiredWordCount:null,titleRequired:false,requiredTasks:['读图承接前情','完成后续故事','小声读并用已学修改符号订正','交流喜欢的习作'],writingCharacters:[]},
{title:'续写故事：接住已给信息，把后来发生的事写完整',
 activation:{prompt:'原创前卡：同学谈起图书分享，小南说自己的书还在远方的家里，旁边两人商量“我们可以……”。先说已给了什么，再提出一种可能后续，别把自己的主意说成原卡已发生。',expectedObservation:'能提取人物需要与同伴商量，补出一种有联系的行动，同时保留已有信息和新写想象的区别。',bridge:'生日三图也留下“我们可以”和末尾问号，后续要从这些条件接着写。'},
 concept:{explanation:'先看三幅图与气泡：同伴谈自己过生日的经历，李晓明想到自己也快生日、父母在外地工作，另有同伴商量可以怎样做。原页没有给最终安排，也没有证明父母不关心他、他独自生活或一定没有联系；前两位说九岁不等原页已明确李晓明的精确年龄。续写可以设计不同合理办法，重要的是承接快生日与同伴商量，让“谁为什么这样做、怎样做、后来怎样”连起来。比如先了解他的想法，再准备一件有心意的事，写出具体动作和回应；这只是可选思路，不要求所有人都买蛋糕或办同一种聚会。人物心情可以通过自己新增的动作、话语和变化表现，不能把创作当原图已明确的事实。写完后小声读一遍，检查人物指代、先后联系、缺词或重复等明显问题，用学过的修改符号在本人原稿上订正，保留原稿与改后。交流时说喜欢哪一处以及具体理由，不以谁最受欢迎、篇幅最长或最像范文为唯一标准。本页没有统一字数或必须标题的要求，完整与清楚按实际作品判断。',points:['先列已给条件，再补后续','行动、经过与结果相联系','不同合理结局可以成立','原稿、修改标记和改后分别留','偏好联系具体表达和理由']},
 example:{situation:'原创示例接图书前卡：小南的书在远方，同伴想让他参加图书分享。这不是生日原图的唯一答案。',steps:[
  {explanation:'承接处境并确定人物目标：小禾先问小南愿不愿一起选班级图书，没有擅自替他决定。',board:['前情：书不在身边','新行动：先问想法','目标：一起参加分享']},
  {explanation:'写具体经过：“小南点点头，两人从书架选出一本动物故事。小禾指着目录问：你想先讲哪一篇？小南翻到折角处，开始给他们介绍。”动作与对话使过程可读。',board:['选书和问目录','小南实际回应','经过支持后面结果']},
  {explanation:'给出结果并核对联系：“分享时，小南举起书介绍了自己喜欢的片段。课后他说，下次也想把远方家里的书带来。”这是创作结果，不能倒写成前卡已给。',board:['结果：参与分享','回应与前情相连','不同续写另有可能']},
 ],conclusion:'有前情、具体行动和结果，就能形成可核对的后续；参考内容帮助看方法，不要求照抄为本人作品。'},
 visuals:[{kind:'table',title:'原图条件与后续创作分开',headers:['已给图文','续写可补什么','不能冒充原图事实'],rows:[['李晓明快生日，父母外地工作','根据处境设计关心办法','不能断言父母忽视或永不联系'],['同伴谈过生日的经历','衔接同伴为何注意到他','不能强定他精确九岁'],['同伴说我们可以，末尾问号','具体做法、过程与人物回应','不能说只有蛋糕聚会一种正确结局'],['本人已写的续篇','朗读、标记问题、订正','范文或抄好的清稿不代本人原稿'],['实际交流到的习作','指出喜欢的具体情节与理由','没有交流不补造同伴作品和回应']],explanation:'用表格检查内容来源和完成阶段；新情节可以想象，作为创作说明，不改写成原图已发生或本人真实生活。'}],
 misconceptions:[{observation:'把父母外地工作直接改成不关心孩子，再规定所有续写必须买大蛋糕。',alternatives:['可能补充猜测时未标身份，也可能以熟悉范文当唯一标准。'],verification:'分别指出原气泡已经说什么、新稿加了什么，比较另一种同样承接处境的办法。',correctiveFeedback:'保留真实图文范围，创作可有多种合理发展，评价联系与表达，不强定唯一物品或家庭经历。'},
  {observation:'一开始就写大家很开心结束，中间谁做了什么没有交代。',alternatives:['可能只想到结果，也可能省略听众尚不知道的过程。'],verification:'请读者按前情、行动、结果复述，找出需要补具体动作或回应的位置。',correctiveFeedback:'补一个真正连接前情和结果的过程，不能只加很多形容词代事情。'},
  {observation:'只有一份整齐清稿，却声称已用修改符号订正本人原稿。',alternatives:['可能只保存改后稿，也可能把看懂示例当自己做过。'],verification:'核对本人原稿和实际标记，指出原问题、所用符号与改后内容；无原稿保持无法核查。',correctiveFeedback:'表达质量和修改过程分别看，不能由清稿倒造原问题或本人订正证据。'}],
 transfer:{scenario:'换成同伴要参加阅读或班级展示却遇到具体困难的原创前情；也可继续原生日图，但应标明原图与新写内容。',prompt:'独立写有行动、经过与结果的后续。小声读本人原稿并用已学符号订正一处实际问题，再说明喜欢一份真实作品或标明示例的理由。',expectedStrategy:'承接已有条件，后续联系清楚；实际原稿、订正与交流范围分别保留，不由参考或角色示范代本人过程。'},
 summary:{synthesis:'续写接住前图，补出可以读懂的后来。写完自己读，再把明显问题改清楚，交流时用具体内容说理由。',takeaways:['已给与想象分开','后续有具体过程与结果','结局可以合理不同','原稿与实际订正可核对','喜欢有具体理由']},
 citations:[{page:65,quote:'接下来可能会发生什么？请你把故事\n写完。',usedFor:'concept'},{page:65,quote:'写好以后小声读一遍',usedFor:'example'},{page:65,quote:'用学过的修改符号',usedFor:'check'},{page:65,quote:'和同学交流习作之后，说说你更喜欢谁写的故事。',usedFor:'transfer'}]},
['物理65印60三图、气泡和最后问号已看：李晓明快生日、父母外地工作、同伴我们可以，未给完成安排；写后小声读、修改符号订正、交流喜欢作品，未给统一字数或必须标题。']);
const garden=make('garden-four',6,66,67,[
 def('garden-four-recognition','园地四七字识读与查字典','在车轴基础阁楼佳节盲人唐朝中识读轴基础阁佳盲唐七字并核查','本人实际声音逐字覆盖七字，基础有两个目标字，查字典结果与当前词语相符，不按六组词误算六字或加写字表','识字与阅读'),
 def('garden-four-polyphones','根据词义读准假几中处','结合当前词义读准四组多音字词语并说明语境','假期假日jià与假扮假装jiǎ、几乎茶几窗明几净jī与几百jǐ、中枪中奖猜中zhòng与中间zhōng、处罚处分处理chǔ与到处chù分别核对','词义与读音'),
 def('garden-four-number-idioms','发现数字成语特点并联系语境扩展','发现三组成语带数字的表达特点，举相近形式并解释当前意思','数字形式与实际含义分别说明，不把七上八下等逐字作数量统计，不因形式相似就推意义或感情色彩相同','词语积累'),
 def('garden-four-dialogue-quotes','依据提示语位置使用引号标点','区分说话提示在前后中，按话语边界写出句子','引号只围实际说话内容，提示在前用冒号、在后不添冒号、在中分开引语并用恰当逗号，句中句末标点位置可核','句子与标点'),
 def('garden-four-cooperation-proverbs','联系情境理解合作谚语','读四条合作谚语，用具体分工和互助说明当前适用意义','联系协作怎样起作用，不把移山断金作实际实验或把人多必对当规律，保留具体任务与专业核查条件','语言积累与运用'),
 def('garden-four-prediction-method','回顾预测方法与书名选读','说明边读边预测怎样促使关注细节，按书名形成有范围的选读想法','用具体线索和原预测说明方法，书名只支持大概猜想，已看后文或仅选书不当陌生首预测或整本已读','阅读策略'),
],{title:'语文园地四',activity:true,recognitionCharacters:['轴','基','础','阁','佳','盲','唐'],writingCharacters:[],polyphonicWords:['假期','假扮','假装','假日','几乎','几百','茶几','窗明几净','中枪','中奖','中间','猜中','处罚','处分','到处','处理'],numberIdioms:['百发百中','百战百胜','百依百顺','四面八方','四通八达','四平八稳','七上八下','七嘴八舌','七手八脚'],cooperationProverbs:4,compulsoryFullTextRecitationAdded:false},
{title:'语文园地四：词义帮助读音，位置帮助标点，细节帮助预测',
 activation:{prompt:'原创两句“我们放假去看展”和“角色假装没看见信封”，假是不是同一读音？先解释当前词义，再说依据。',expectedObservation:'能由休假与装作的意义选择jià和jiǎ，不机械记一个字只能同音。',bridge:'园地把语境读音、成语、引号和预测方法放在一起，都要看当前具体关系。'},
 concept:{explanation:'识字加油站六组词里有七个目标字：车轴的轴、基础的基和础、阁楼的阁、佳节的佳、盲人的盲、唐朝的唐。查字典要把结果放回当前词，识读与实际书写不是同一任务。四组多音字先解释意思：假期假日是休息日读jià，假扮假装是装作读jiǎ；几乎茶几窗明几净读jī，几百读jǐ；中枪中奖猜中读zhòng，中间读zhōng；处罚处分处理读chǔ，到处读chù。数字成语的形式能帮助积累，但百发百中、四通八达、七上八下等不能全按精确数量理解；同样带数字也有不同意义和使用条件，百依百顺不等任何意见都应无条件服从。写直接说话时先找谁说的和说了什么，提示语在前、在后、在中会改变冒号、逗号与引号的位置，不能只看出现说字就加冒号。四条合作谚语强调同心、协作和帮助，结合具体分工解释怎样帮助完成任务；移山断金不是实际操作要求，人多也不保证判断一定正确。交流预测方法时要说清哪项细节使原想法形成或更新；根据书名猜大概内容可以帮助选书，但选了、猜了不等全书已读，已经看到后文也不重新变成未见首预测。',points:['六组词含七个识字目标','先看当前词义再定多音字读法','数字形式不代成语语境含义','先找话语边界再放引号标点','合作有具体分工，不保证任何多数必对','书名猜大概，实际阅读另记']},
 example:{situation:'原创提示语位置练习：小禾要请同伴先看目录。保持同一人物与话语意思，分别放到前、后、中三种位置。',steps:[
  {explanation:'提示在前，先交代谁说，再用冒号引出完整话语：小禾说：“我们先看目录。”',board:['提示语在前','说后冒号','话语在一对引号内']},
  {explanation:'提示在后，完整话语先结束，再交代谁说：“我们先看目录。”小禾说。这里不在说后追加冒号。',board:['话语先出现','句号在后引号前','提示语随后']},
  {explanation:'提示插在同一次说话中间：“别着急，”小禾说，“我们先看目录。”前后两段话各有引号，提示本身在引号外。',board:['前段话后逗号','提示语在引号外','说后逗号再接后段话']},
 ],conclusion:'三种写法按位置与实际话语边界核对，不能移动一个说字却保留所有原标点。'},
 visuals:[{kind:'table',title:'看当前关系，再决定怎样用',headers:['当前任务','要核对的关系','容易越过的范围'],rows:[['基础、车轴等词识字','七字实际声音与词语对应','六组词不等六个字'],['假几中处的读音','当前意义与语境','一个字不能所有词只读同音'],['带数字的成语','数字形式与实际用法','不全是精确数量或相同褒贬'],['提示语前后中','谁说、实际话语和标点位置','说字出现不必总接冒号'],['合作谚语','分工、互助怎样促成目标','不推多数必对或真实移山断金'],['书名预测与选择','题目线索和实际阅读范围','只猜书名不等整本已读']],explanation:'把读音、表达形式与具体信息的支持关系分别核查，避免背一个口诀代所有语境。'}],
 misconceptions:[{observation:'把六组词误算六字，漏读基础中的一个字。',alternatives:['可能按词数统计，也可能只认出其中一字。'],verification:'逐一列七目标并听本人当前声音；查字典后回到原词核对。',correctiveFeedback:'词与字的统计不同，补听实际漏项，不以另一字或旧音替代。'},
  {observation:'所有含说的句子都用冒号，或把提示语也包进说话引号。',alternatives:['可能只背单一位置例句，也可能未分话语与叙述。'],verification:'圈出真正说的话，标提示在前后中，再重排相应标点。',correctiveFeedback:'边界先清楚，位置与标点配套，提示语本身不当角色直接说出的内容。'},
  {observation:'背出数字成语和合作谚语就直接认定现实数量或所有群体决定都正确。',alternatives:['可能逐字理解，也可能省略语境和判断条件。'],verification:'用七上八下的心理语境、多人同意一个错误信息的对照例解释限制。',correctiveFeedback:'形式便于积累，实际意思和适用条件仍需核查；合作不能代事实验证与专业判断。'},
  {observation:'根据书名猜过内容，就把完整书名下所有章节标成自己已读。',alternatives:['可能把选读意向与实际范围混同，也可能借熟悉书名补完成状态。'],verification:'分别说标题支持什么、实际读过哪一段和仍未读什么，缺范围不补造。',correctiveFeedback:'标题预测帮助选择，实际阅读范围另留记录，示例与看后文后的回顾不当未见首答。'}],
 transfer:{scenario:'换新的明确语境词组、带数字成语、三种提示位置和一本尚未读的实际书名；没有可靠书源则只用明确原创题目练习。',prompt:'说明语境怎样支持读音和含义，写一组引号标点正确的对话；用具体分工解释一条谚语，最后提出有范围的书名猜想。',expectedStrategy:'逐项用当前材料核对，不因形式相同推语义相同；实际声音、原答和已读范围独立留证。'},
 summary:{synthesis:'读音跟着意思核对，标点跟着话语位置核对。成语谚语用在具体情境，预测帮助细读，却不能替代真正阅读。',takeaways:['七字分别认','多音字有当前语境','数字形式不等字面数量','引号围话语，提示位置有区别','合作要具体且仍需核实','猜书名与已读范围分开']},
 citations:[{page:66,quote:'你认识下面这些加点的字吗？查字典认一认。',usedFor:'concept'},{page:66,quote:'为了预测得更准确，我读书更仔细了，\n注意到了更多的细节。',usedFor:'transfer'},{page:67,quote:'根据加点字的意思读准字音。',usedFor:'check'},{page:67,quote:'你还能说出类似的成语吗？',usedFor:'concept'},{page:67,quote:'照样子写句子，注意引号的用法。',usedFor:'example'},{page:67,quote:'二人同心，其利断金。',usedFor:'summary'}]},
['物理66印61已看预测帮助理解、细读留意细节、书名先猜再选书三段交流；查字典识轴基础阁佳盲唐七字，六词不等六字，无本页写字表。','物理67印62已看假几中处16词语境读音、百/四八/七八三组成语、说话提示前后中三例和引号、四条合作谚语，夸张不当真实操作或多数一定正确。'],true);
for(const [slug,draft]of[['story-continuation',writing],['garden-four',garden]])fs.writeFileSync(path.join(root,'resources/curriculum/source-lessons/chinese-g3-'+slug+'-v1.json'),JSON.stringify(draft,null,2)+'\n');
console.log(JSON.stringify({drafts:2,targets:[writing.targetIds.length,garden.targetIds.length],newDefinitions:10,teacherReviewed:false,published:false,learnerEvidenceCreated:false}));

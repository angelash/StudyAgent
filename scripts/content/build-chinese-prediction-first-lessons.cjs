// Original prediction-reading drafts from exact-source physical pages51 through57.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),bookId='archive-book:chinese-g3-upper-02915a7db6517258',prefix='source:chinese:g3:02915a7d:';
const definition=(suffix,name,objective,successCriterion,strand)=>({id:prefix+suffix,version:1,name,subject:'chinese',grade:3,term:'upper',strand,objective,successCriterion,prerequisiteIds:[],curriculumVersion:'source-original-02915a7d-v1',status:'draft'});
const meaning={atomId:'core:chinese:contextmeaning',objective:'联系当前语境解释词句并说明方法',successCriterion:'具体线索支持解释，不把标题插图提供的联想当全部原文或真实规律'};
const evidence={atomId:'core:chinese:detail-evidence',objective:'用已提供的线索支持预测和判断，分清后文核对结果',successCriterion:'原线索、预测与后文信息各自明确，未读部分保持未知，预测合理不等于必须猜中唯一结果'};
function assemble(slug,entry,start,end,definitions,scope,content,pageNotes){
 const goals=[...definitions.map(row=>({atomId:row.id,objective:row.objective,successCriterion:row.successCriterion})),meaning,evidence].map((row,index)=>({id:'goal-'+(index+1),...row}));
 return{format:'source-original-lesson-draft-v1',status:'draft_needs_materials_and_review',source:{bookId,lessonId:bookId+':unit4:entry'+entry,sourceSha256:'02915a7db6517258434d370430bbf464a1dac6e17df97b90d707dc4ecf5cfedf',pageStart:start,pageEnd:end,publicationYear:null,curriculumStandardYear:null},
  definitionCandidates:definitions,targetIds:goals.map(row=>row.atomId),sourceReview:{confirmedRange:true,statement:'选定原件所有正文、旁批、作者、识写表、插图和任务已逐张查看；此为当前教材范围核对，不是教师审核或教材外全文已读。',pages:pageNotes.map((statement,index)=>({page:start+index,visualChecked:true,statement}))},scope:{...scope,teacherReviewed:false,published:false},
  content:{...content,goals,prerequisites:[],retention:{intervalDays:[1,3,7,14],anchor:'last_relevant_teaching_or_help',instructions:'先核对已读与已给反馈，审核结构评分和充分未见库存，再按真实日期安排。看过后文或示范的原篇不计陌生独立预测；模拟日期不当真人保持。'}},
  editorNotes:{slug,teacherReviewed:false,automaticPublication:false,realLearnerEvidence:false,materialStatus:'具体原创讲解、预测示例、错因与核对方法已写；检查材料、独立结构、评分及充分保持库存仍待补齐审核。',reuseBoundary:'复用词义与依据定义；新目标保持候选，等价先修和独立题族不自动批准。',predictionBoundary:'当前完整原页与旁批已经由编写者读取，只有教学候选资格；学生先前曝光必须另核，不能把看过答案后的复述或修改当原始未见预测。'}};
}
const houseDefs=[
 definition('old-house-word-reading','老屋课六字识读','结合词语识读暴喵孵叽偶尔六字','真实声音覆盖六字，按当前词语和原页注音核对，文字或拼音选择不代发音','识字与阅读'),
 definition('old-house-handwriting','老屋课13字实际书写','观察并真实书写准备等暴睡壁砍蜘蛛漂撞饱晒13字','逐字核对本人原稿和部件完整性，识读与写字表不混算，原稿订正分别保留','识字与写字'),
 definition('old-house-prediction-clues','用题目插图与前文作预测','在明确当前已读范围下提出后续可能并说明线索','至少指出一项已给线索并说明联系，允许不同有据预测，后文或旁批已看需保留曝光','预测阅读'),
 definition('old-house-prediction-revision','核对后文并保留原预测修订','读到后续后比较原预测与实际叙述，说明怎样更新想法','原猜测和依据不被新答案覆盖，未猜中但有据与无据乱猜分别看，不把改对当最初已对','预测阅读'),
 definition('old-house-impression','联系图文说明老屋印象','用具体课文行动和插图说明对老屋的印象','图像与文字来源各自清楚，印象有依据，不由外貌或一次行为推断永远完美或必然不倒','文学阅读'),
];
const house=assemble('old-house',1,51,54,houseDefs,
 {title:'总也倒不了的老屋',author:'慈琪',recognitionCharacters:['暴','喵','孵','叽','偶','尔'],writingCharacters:['准','备','等','暴','睡','壁','砍','蜘','蛛','漂','撞','饱','晒'],fullTextRecitationRequired:false,
  predictionSideNotesAreExamplesNotStudentFirstAnswers:true,requiredTasks:['边读边预测并交流','联系插图课文说明印象'],requests:[{character:'小猫',duration:'一个晚上'},{character:'老母鸡',duration:'二十几天'},{character:'小蜘蛛',duration:'一会儿，后续听故事仍未结束'}]},
 {
 title:'总也倒不了的老屋：先说明猜测依据，再读后文核查',
 activation:{prompt:'只看原创题目“总也收不起来的小伞”，你能提出什么可能？先说这只是猜测，再指出题目给了什么、没给什么。',expectedObservation:'孩子能把题目线索与自己猜测分开，不把猜到的结局当已经读到的事实。',bridge:'读老屋时也先保留当前线索与想法，读到下一段再核对。'},
 concept:{explanation:'老屋准备倒下，先后听到小猫、老母鸡、小蜘蛛请求，分别因避暴风雨、孵小鸡和结网抓虫而继续站着。预测可联系题目总也倒不了、插图外貌、前文答应帮助的重复方式，也可联系已有经验提出另一种合理可能。旁批和课后示例有猜中，也有与后文不同，说明合理预测不是必须与作者唯一结局相同。记录当时读到哪里、猜什么、为什么，再读后文核对，不能看完后把原猜测改成早就知道。印象用具体行动和图文支持；正文写到现在仍站着，不证明现实旧房永不倒，不能把文学拟人作为危房判断或实际观察任务。',points:['预测基于当前已给线索','不同有据可能可以并存','旁批是示范不是本人首答','原预测与后文核对分别保留','老屋印象用图文具体支持']},
 example:{situation:'明确原创分步卡：先只给“旧纸伞正要收起，一只湿小鸟请求再挡一会儿雨，伞刚才帮助过别人”。预测之后，才读核对卡“伞答应再挡一会儿”。两卡为示例，不是老屋原文。',steps:[
  {explanation:'先列当前线索：小鸟有需要、纸伞先前帮助过别人；可猜会答应，也可有据提出疲劳而商量办法。',board:['已给：请求与先前行动','预测：一种或多种可能','理由：把线索连起来']},
  {explanation:'保留原想法后读第二卡，比较实际答应与自己原预测的关系，不能倒改原记录。',board:['原预测保留','后文：答应','一致或不同分别说']},
  {explanation:'若原先猜别的，说明新信息怎样使想法更新，不把没猜中直接判成不会预测。',board:['新信息起作用','更新理由','合理性与猜中分开']},
 ],conclusion:'示范展示预测方法；已经看过核对卡后再做同题，不算新的未见独立预测。'},
 visuals:[{kind:'table',title:'线索、预测与核对分三栏',headers:['当前线索','可以提出的猜测','读后怎样检查'],rows:[['题目总也倒不了','可能总有事情使老屋继续站着','后文是否反复出现请求'],['老屋先前答应帮助','可能继续帮助新来者','核对具体回答与原因'],['不断被打扰的一般经验','也可能不耐烦或有别的安排','原猜测有据仍可与后文不同'],['插图的神情','可形成对角色的初步印象','图像来源与正文行动分别看']],explanation:'表格保留思路来源，不把老师旁批、结局记忆或看过示范后的答案当本人原预测。'}],
 misconceptions:[{observation:'读完后把自己的原猜测全部改成与作者相同，称早就猜中。',alternatives:['可能把猜中当唯一目标，也可能未分别记录原想法与核对。'],verification:'对照原记录和当时已读范围，说出哪项新信息后来才得到。',correctiveFeedback:'保留原猜测，合理的不同也有价值，改后理解不倒改首答。'},
  {observation:'只说老屋善良，却没有行动或把插图当正文事实。',alternatives:['可能只记评价词，也可能混来源。'],verification:'分别给一处正文帮助与一项图像印象，解释支持关系。',correctiveFeedback:'印象有具体依据，图文身份分清，不把一个表情推成所有行为。'}],
 transfer:{scenario:'换一段未见的原创请求故事，先给前半并在真正记录预测后另给核对材料；已有曝光时标明。',prompt:'指出已知线索，写一个可能与理由，读到后续后保留原答并说明更新。再用一项行动说明角色印象。',expectedStrategy:'先答后核对，合理性、猜中与已有曝光分别记录，不把重复原篇当新独立结构。'},
 summary:{synthesis:'边读边想，线索支持猜测；读后核查，原思路不抹去。印象由具体图文支持，不以猜中次数代全部阅读能力。',takeaways:['题目插图前文都可给线索','合理不等必须猜中','原预测和核对结果分开','角色印象有具体依据']},
 citations:[{page:54,quote:'读课文的过程中，你有没有猜到后面会发生什么',usedFor:'concept'},{page:54,quote:'老屋给你留下了什么样的印象',usedFor:'transfer'}],
 },['已查看作者慈琪、标题、老屋处境与小猫请求、插图和旁批初猜，旁批不是学生原首答。','已查看答应小猫、老母鸡二十几天孵鸡、九只小鸡和旁批不同预测。','已查看小蜘蛛请求结网、讲故事与到现在仍站的结尾及旁批，不推现实建筑永不倒。','已查看六字识读、13字书写、预测交流示例与图文印象任务，预测有同有异，不加全文背诵。']);
const carrotDefs=[
 definition('carrot-word-reading','长胡子课六字识读','结合当前词语识读萝卜愁沾继晾六字','本人真实声音覆盖六字，萝卜的卜按当前轻声词语核对，不加本课写字表','识字与阅读'),
 definition('carrot-clue-prediction','从胡子条件和用途预测后续','用长胡子已有条件、人物需求与生活常识提出可能发展','说明具体依据并保留不确定，不把果酱长胡子的童话条件当现实生长定律','预测阅读'),
 definition('carrot-check-revise','在已核后文中比较并修订预测','保留原预测，读到后文后比较相同不同并更新想法','当前教材以省略号结束，未核实作者全文时不代填原结局；可核对页内已给后文，完整结尾比对保持待补','预测阅读'),
 definition('carrot-title-guess','从题目提出有范围的阅读猜测','根据文章或书名提出可能内容并说明标题线索与已有知识的区别','不从一个书名推定全书人物情节已读，已有版本知识标明，未给内容保持可能而非事实','阅读策略'),
];
const carrot=assemble('carrot',2,55,57,carrotDefs,
 {title:'胡萝卜先生的长胡子',author:'王一梅',skim:true,recognitionCharacters:['萝','卜','愁','沾','继','晾'],writingCharacters:[],fullTextRecitationRequired:false,
  requiredTasks:['边读边预测后续','说明依据','听完整故事后比对修订','从文章书名猜可能内容'],textbookEndsWithEllipsis:true,
  fullAuthorOriginalEndingVerified:false,fullOriginalComparisonPending:true,teacherOriginalCompletionMustBeSourced:true},{
 title:'胡萝卜先生的长胡子：用已有条件猜，遇到后文再更新',
 activation:{prompt:'原创条件卡：一条很长又结实的细带随风飘来，旁边的人正缺一根系包裹的绳。可能发生什么？先指出线索，不说自己已知道作者结局。',expectedObservation:'孩子能把长度强度与人物需求联系起来，提出可能而非凭空补成确定事实。',bridge:'长胡子故事同样可以从条件、需求与前面用途找线索，后文仍需实际核对。'},
 concept:{explanation:'胡萝卜先生漏刮一根胡子，沾到果酱后随行走变长，是这篇童话设定，不是现实胡须生长定律。当前教材已写小男孩因风筝线短，发现胡子够长并检查牢固后取一段使用；后面鸟太太正找绳晾尿布，胡子又在风里飘动，可据长、牢固、需要绳等线索作预测。预测可不止一种，只要说明条件联系；不能因为后来作者写法更丰富就把原合理思路全部抹去。教材正文停在省略号，课后要求听老师讲完再比对；本批尚未核实作者完整结尾，完整原文核对必须等待可靠来源，不能用常见印象或自己续写代填。可以先对页内已给后文练习核对。看文章书名时区分题目线索和自己以前读过的知识，不把猜测当已读全书事实。',points:['条件与人物需求支持预测','原故事设定不推现实生理规律','保留原预测和读到后文后的更新','未核作者结尾不能代写为原文','书名猜测有范围且标已有知识']},
 example:{situation:'原创两步材料：前卡给“长细带飘过窗边，小兔正找带子系纸包”；本人预测后另给核对卡“小兔检查后用它系好纸包，又留一段给邻居”。这不是胡萝卜原作结尾。',steps:[
  {explanation:'根据细带与系包需要提出一个可能，说明自己知道长度，但材料未给所有用途。',board:['条件：长细带','需要：系纸包','预测仍是可能']},
  {explanation:'后卡既可能与原猜测相同，又增加新行动，核对相同与不同而非只判对错。',board:['原答保留','对照后卡','新增：留给邻居']},
  {explanation:'如果原猜别的，解释哪些新信息使想法更新；不能把这张原创卡称作者原文。',board:['更新有新依据','示例身份清楚','未核原作仍待补']},
 ],conclusion:'核对需要真实后文，原创示例只能练习方法，不能替代作者完整结尾。'},
 visuals:[{kind:'table',title:'当前可核对与仍待补的范围',headers:['材料','可以做什么','不能直接说什么'],rows:[['已读前文与标题','提取条件作预测','不能说所有后续已知'],['小男孩页内后文','比较原预测与实际用途','不把一次用途推成所有用途'],['鸟太太与省略号','根据需求提出可能','不能代填作者真实完整结尾'],['原标题或书名','猜可能主题并标依据','不等整本已经阅读']],explanation:'完整作者结尾核查保持待补；不以原创续写或熟悉版本印象代替来源。'}],
 misconceptions:[{observation:'把鸟太太的可能后续或网上记忆直接写成已核实作者结局。',alternatives:['可能未分教材省略范围，也可能把续写与原作混同。'],verification:'指出原文已经到哪里、完整结尾来源是什么，未建立来源就保留待核。',correctiveFeedback:'可以预测或明确创作，不能冒充作者原文；完整比对未做不补成完成。'},
  {observation:'预测与作者不同，就说原想法全错或改成早就知道。',alternatives:['可能只追求猜中，也可能没检查原依据是否相容。'],verification:'分别看原线索、原答与新得到后文，说明哪些需更新。',correctiveFeedback:'合理性与猜中分开，修订不倒改原预测；没有后文时不伪造核对。'},
  {observation:'从夏洛的网等书名直接列全部情节，说自己已读过。',alternatives:['可能混已有知识与标题推测，也可能用书名熟悉当完成。'],verification:'分别标标题提供什么、以前真读过什么和仍未知部分。',correctiveFeedback:'猜测有范围，已有知识如实标明，不能仅凭标题证明全书阅读。'}],
 transfer:{scenario:'换一个明确原创的长物件用途故事或只给书名的材料，先记录预测再给独立核对卡。',prompt:'指出条件与需求，提出一个可能并说明依据；得到真正后文才核对更新。若只给题目，明确哪些只是猜测。',expectedStrategy:'线索、原答、后文与来源范围分清；原篇结尾尚未核实则保留待补，不用复述替未见预测。'},
 summary:{synthesis:'用线索与常识提出可能，读到后文再修订。省略号后需要真实来源，猜书名也不等已经读完整篇。',takeaways:['已有条件支持可能','原预测与核对分开留','未核作者结尾不代填','标题猜测与已有阅读分清']},
 citations:[{page:57,quote:'故事还没有结束，你认为后来可能会发生什么事情',usedFor:'concept'},{page:57,quote:'读读下面这些文章或书的题目，猜猜里面可能写了些什么',usedFor:'transfer'}],
 },['已查看作者王一梅、略读提示、漏刮与果酱长胡子的童话设定和插图，不推现实生理关系。','已查看男孩风筝用途、检查牢固、鸟太太找绳和省略号、六字识读，无写字表，作者全文结尾尚未建立来源。','已查看听老师讲完再比对与四条预测方法说明、六个文章书名；只核当前范围，不凭标题或记忆认定整书已读。']);
for(const [slug,draft]of[['old-house',house],['carrot',carrot]])fs.writeFileSync(path.join(root,'resources/curriculum/source-lessons/chinese-g3-'+slug+'-v1.json'),JSON.stringify(draft,null,2)+'\n');
console.log(JSON.stringify({drafts:2,targets:[house.targetIds.length,carrot.targetIds.length],definitionCandidates:9,published:false,authorFullCarrotEndingVerified:false,learnerEvidenceCreated:false}));

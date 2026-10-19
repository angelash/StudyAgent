import { languageLesson, type TeachingAuthor } from './teaching-author';

export function addEnglishTeaching(author: TeachingAuthor) {
  const c = languageLesson(author, 'core:english:'), f = languageLesson(author, 'foundation:english:');
  const words: Array<[string, string, string, string, string]> = [
    ['1', 'green', '绿色', '标签写着green，给它选择绿色的色卡，并说出词义。', '将颜色词与实物颜色对应，不把green与同类的blue混用。'],
    ['2', 'pencil', '铅笔', '文具盒旁写着pencil，这个标签应贴在哪一种文具上？', '辨认pencil对应铅笔，与pen对应钢笔作对照。'],
    ['3', 'grape', '葡萄', '水果清单写着grape，准备哪一种水果？', '将grape的完整词形与葡萄对应，不只按首字母猜词义。'],
    ['4', 'breakfast', '早餐', '每日餐表写着breakfast，这一栏表示哪顿饭？', '联系早晨这一餐，区分lunch与dinner。'],
    ['5', 'museum', '博物馆', '路线说明写着museum，目的地是哪类场所？', '将museum与博物馆相连，排除同类地点library。'],
    ['6', 'tomorrow', '明天', '日程页写着tomorrow，这个时间词表示哪一天？', '以今天为参照，明天在后，yesterday在前。'],
  ];
  for (const [g, word, meaning, prompt, step] of words) f(`g${g}-meaning`,
    '词义学习将完整词形、具体意义和使用情境相连。先认读与理解，再遮去提示尝试提取；辨认、拼写和实际发音应分别检查。',
    prompt, [step, `遮去中文后再看${word}，提取词义；随后从中文回想词形，区分两种方向。`], `${word}表示${meaning}。`,
    '只凭首字母或选项位置猜，换方向后不能提取。', '可能词形与意义的联结较弱，也可能只是拼写记录不稳。',
    '先让孩子把词与图片或中文匹配，再分开观察无提示拼写，不能由一种任务推定另一种。', '换到含该词的新短句或真实标签中解释意义；听说表现另用受控音频与录音复核。');
  const places: Array<[string, string, string, string]> = [
    ['1', 'Nora is in the park. Where is Nora?', 'park', '找到人物Nora，再找in the park中的地点词。'],
    ['2', 'Leo reads at the library. Where does Leo read?', 'library', '问题问读书地点，at the library直接对应。'],
    ['3', 'Nora passes the school and stops at the museum. Where does she stop?', 'museum', '区分经过学校与停在博物馆，问题限定stop。'],
    ['4', 'The cinema is closed. Leo waits at the station. Where does Leo wait?', 'station', '不要选先出现的cinema，要匹配wait的地点。'],
    ['5', 'Nora leaves the hospital, then meets Leo at the river. Where do they meet?', 'river', '问题是碰面地点，离开的hospital不符合动作条件。'],
    ['6', 'The first note says park. The updated note says library. Where is the meeting in the updated note?', 'library', '以更新说明为条件，保留当前有效地点。'],
  ];
  for (const [g, prompt, answer, step] of places) f(`g${g}-locate`,
    'where问地点。先确认问题中的人物、动作与限制，再回到原句找相关地点，不能选择最先出现的地点或只认识的词。',
    prompt, [step, '将地点词放回对应动作，检查原句确实支持，回答所需的地点词即可。'], `地点词为${answer}。`,
    '读到任何地点就作答，未区分经过、停留、等待等动作。', '可能地点词已认识，但动作与地点的关系未匹配。',
    '先把人物、动作、地点各自连线，分别确认问题要求的是哪一条关系。', '换成简短地图说明或活动表格，匹配相同信息；文本没有地点时不凭常识补答。');

  c('alphabet', '字母表顺序是一套固定序列，与字母读音或单词首字母意义不同。找相邻字母时要确认是前一个还是后一个。',
    '在字母表中，Q前面和后面分别是什么？', ['按片段P、Q、R读回顺序。', 'Q前是P，后是R；前后提问分开核对。'], '前面P，后面R。', '把字母名称读音相近当相邻，或把前后颠倒。',
    '可能没有建立稳定的顺序与方向。', '用可移动字母卡定位中间字母，再分别指前后。', '把顺序用于字典分组检索，区分字母顺序与大小写形状。');
  c('greeting', '问候语随时段和交际目的变化。见面、道别和睡前祝语不同，选择要与当前场景匹配。',
    '下午见到老师，怎样用英语问候？', ['当前场景是下午初次见面。', '可说Good afternoon，不能把睡前Good night作见面问候。'], 'Good afternoon.', '所有晚上或见面场景都套Good night。',
    '可能只记固定短语，未区分时间与交际意图。', '将见面、离开、睡前情景卡分别匹配合适表达。', '换到简短对话中回应对方，实际口语清晰度需另录音观察。');
  c('iam', 'I表示说话者本人，身份或状态句中与am搭配。姓名改变不改变I的语法身份。',
    'Nora介绍自己：“I ____ Nora.”应怎样完成？', ['主语是I，表示我。', '用am连接姓名，完整句为I am Nora.'], 'I am Nora.', '按姓名选is，或省去am。',
    '可能没有先识别句子的实际主语。', '分别用I和She介绍同一人，指出主语变化如何影响be。', '用自己的虚构姓名或角色写新句，不要求提供真实个人资料。');
  c('color', '颜色词描述物体颜色，在常见名词短语中放在名词前。辨认词义与辨听读音是不同证据。',
    '要表达一只黄色盒子，完成a ____ box。', ['确定属性为黄色，对应yellow。', '把yellow放名词box前，读回a yellow box。'], 'a yellow box', '填另一种熟悉颜色，或把物品名填进颜色位置。',
    '可能尚未分清颜色属性与对象名称。', '把同一个盒子换颜色，保持名词不变，分别选颜色词。', '换成新物品标签，根据实际颜色描述；无颜色信息时不猜。');
  c('numberword', '英语数量词与数量相连，不只与数字形状相连。先数清对象，再匹配单词，序数词与数量词不要混用。',
    '有6枚同样的棋子，用英语数量词表示。', ['一一对应数到6。', '6的英语数量词是six，检查不是sixth。'], 'six', '把six写成表示第六的sixth，或只凭字形猜。',
    '可能混淆数量与序位，或词形记忆不稳。', '同一组物品分别问有几个与第几个，解释两种含义。', '换成简短英文购物清单，按数量准备物品，再分开核查拼写。');
  c('simpleplural', '明确多于一个的普通规则可数名词通常加s。数量变了，名词形式也需对应；不把此规则套到所有不规则或不可数名词。',
    '把one kite改成表示4只风筝的短语。', ['数量从1变为4，kite为此处的规则可数名词。', '在kite后加s，得到four kites。'], 'four kites', '数量改成four但仍写kite。',
    '可能只处理了数字，没有同步处理名词数量。', '对照一件与多件图片，分别圈出数量词和名词词尾。', '换用新规则名词写物品清单，同时标出不适用规则的词需另学。');
  c('he-she', 'he、she替代上下文已明确的人物，选择依据是题目给出的指代信息，不能由姓名外观或兴趣随意猜测。',
    '材料明确“Nora is a girl. Nora is drawing.”怎样避免重复第二句的名字？', ['题目明确Nora为女孩。', '第二句可将Nora换为She，动作仍是is drawing。'], 'She is drawing.', '只凭名字或所做活动猜代词。',
    '可能没有使用材料明确的人物线索。', '将代词替回人物名，检查是否指同一人；无明确线索时允许保留名字。', '在两个人物的短文中追踪各代词，避免同名或距离造成误指。');
  c('this', 'this is通常介绍近处的一个对象。先确定距离与单数，these对应近处多个对象，不能只换名词而忽略结构。',
    '近处放着一把尺，怎样用this介绍？', ['对象在近处且只有一个。', '使用This is a ruler.，保留单数结构。'], 'This is a ruler.', '把单个近物说成These is，或漏掉be。',
    '可能没有同时匹配指示词、数量与be。', '用一个近物与多个近物对照，分别标出三处数量一致。', '换成相同物品的远近场景，先确认教学目标只要求当前近物结构。');
  c('introduce-self', '自我介绍可用I am连接姓名或角色。内容准确和完整比句子复杂更重要，示例是结构参考，不要求模仿真实身份。',
    '扮演名叫Nora的新同学，写一句介绍。', ['用I表示扮演的说话者本人。', '用am连接姓名，句首大写并写句号。'], 'I am Nora.', '只写姓名或把I is用作介绍。',
    '可能掌握信息但尚未组成完整身份句。', '把主语、be与姓名卡排成句，再撤去卡片独立写。', '改为介绍一个角色如a pupil，检查冠词与句子完整性，口头表现另行记录。');
  c('be', 'am、is、are随主语人称和单复数变化。先找主语，再选形式，不由距离最近的其他名词决定。',
    'The two boxes ____ blue. 应选is还是are？', ['主语为two boxes，表示两个盒子。', '复数主语用are，得到The two boxes are blue.'], '填are。', '因为看到单个词blue或句子开头The就选is。',
    '可能未定位主语中心与数量。', '对照one box、two boxes、I三种主语，说明形式分别匹配谁。', '在含修饰语的新句中圈完整主语，再检查be，不按邻近词猜。');
  c('demonstrative', 'this指近处一个对象，these指近处多个对象，名词与be也要同步匹配数量。',
    '把This is a shell.改成介绍近处三枚贝壳。', ['三个对象用these，be改为are。', '名词shell变复数shells：These are three shells.'], 'These are three shells.', '只把this变these，仍保留is a shell。',
    '可能未把数量变化传递到整个名词句结构。', '分别圈指示词、be、名词，逐项核对单复数一致。', '在真实物品卡中先分近远与多少，再写相应介绍句。');
  c('have-has', '一般现在时肯定句中，第三人称单数常用has，其他常见人称用have。先确认主语，而不是所拥有物品的单复数。',
    'Leo ____ two maps. 应怎样填？', ['Leo是一个人的名字，为第三人称单数。', '用has；two maps为宾语，不能让它决定have。'], 'Leo has two maps.', '看到two maps便用have。',
    '可能把宾语数量误当成主语数量。', '保持物品相同，只把主语从Leo换为They，比较has与have。', '在一段人物资料中逐人描述拥有物品，先给主语做标记。');
  c('possessive', 'my、your、his、her说明所属关系，选择由拥有者决定，不由被拥有物的名称决定。先追踪谁拥有，再组成名词短语。',
    '材料明确Nora是一位女孩，地图属于Nora。用所属词完成____ map。', ['拥有者为Nora，题目已明确人物信息。', '用her修饰map，得到her map。'], 'her map', '根据map的单复数或说话者本人选择my。',
    '可能未区分拥有者与所指物品。', '用箭头从人物连到物品，再用词替换拥有者姓名。', '在对话中变换说话者，核对my与your如何随视角变化。');
  c('can', 'can表达能力时后接动词原形，主语为第三人称单数也不再给实义动词加s。',
    '完成“Nora can ____ a kite.”，动词给fly。', ['can已经承担能力结构，后面需要动词原形。', '填fly，不填flies或flying。'], 'Nora can fly a kite.', '因为Nora是单数就写can flies。',
    '可能把一般现在时单数规则重复加到情态结构。', '对照Nora flies与Nora can fly，指出结构差异。', '写新能力句与否定能力句，保持can后原形，实际能力不由句法练习推定。');
  c('placeword', 'in表示在内部，on常表示接触支撑面，under表示在下方。位置词依实际空间关系选择，不能只背对象搭配。',
    '球在桌子下方，应说The ball is ____ the table.。', ['球没有在桌内或桌面上。', '它在下方，选择under。'], 'The ball is under the table.', '只因出现table便固定用on。',
    '可能把名词搭配当作位置依据。', '保持球和桌子不变，移动球到不同位置，分别解释介词。', '换为示意图或说明文字，核对内部、接触面和下方的关系。');
  c('questionword', 'who问人物，what问事物或内容，where问地点。先识别需要哪类信息，回答不能只抓句中熟词。',
    '要问“谁在修模型”，应使用who、what还是where？', ['未知信息是做动作的人。', '选择who；what和where分别指其他信息类型。'], '使用who。', '把任何问句都用what开头。',
    '可能未将提问词与答案类别对应。', '给人物、物品、地点三张答案卡，分别配对应问题。', '同一短文分别提三类问题，检查答案确实属于所问类型。');
  c('polite', '礼貌表达服务于感谢、道歉、请求等具体目的。用语需符合当前行为，不是任意礼貌短语都可互换。',
    '不小心碰掉同伴的铅笔，应先说什么？', ['当前需要为自己的失误道歉。', '可说I am sorry.，再询问是否需要帮助，不用Thank you代替道歉。'], 'I am sorry.', '只选熟悉的Thank you，不看交际目的。',
    '可能知道短语形式但尚未连接使用条件。', '把借物请求、受助感谢、造成不便三类情景分别配表达。', '在新对话中作合适回应，允许多种自然表达，语音另行复核。');
  c('object-description', '两句描述先让读者知道是什么，再增加有依据的颜色或位置。两句的对象要一致，不因追求复杂而补造属性。',
    '根据情景“近处有一枚蓝色贝壳”，写两句英语。', ['先介绍This is a shell.。', '再说It is blue.，it仍指同一枚贝壳。'], 'This is a shell. It is blue.', '只列shell blue，或第二句换了对象。',
    '可能未形成完整句及跨句指代。', '分别检查每句主语与谓语，再追踪it指向。', '换成只有位置信息的新图，写实际提供的属性，不凭常识猜颜色。');
  c('phonics-a', '此处观察常见短元音a的书面词族线索，例如map、bag中a的拼写模式；拼写分类不能单独证明听辨或发音正确。',
    '比较map、bag与name，哪些属于这里练习的常见短a词族？', ['map与bag是短元音a的常见例子。', 'name含a加辅音再加不发音e的常见结构，不归本组。'], 'map与bag属于本组。', '只要含字母a就划成同一个读音词族。',
    '可能只识别字母，未观察周围拼写模式。', '先对照完整词形，再用可靠音频单独核对听辨，不能由字形分类下发音结论。', '换新常见词检查模式与例外；听说评价应记录实际音频与人工复核。');
  c('plural-es', '常见以s、x、ch等结尾的可数名词复数常加es。这是具体拼写规则，不替代所有名词的复数学习。',
    '把one brush改成两把刷子。', ['brush以ch结尾，复数加es。', '得到two brushes，核查不漏e。'], 'two brushes', '统一只加s写成brushs。',
    '可能未辨认词尾类型或未记住拼写扩展。', '将普通加s与常见加es两组词按词尾归类，再写出变化。', '在物品清单中应用新词，特殊读音或例外需查词典，不由单一规则硬推。');
  c('third-s', '一般现在时肯定句中，第三人称单数主语通常要求实义动词使用相应单数形式。先检查主语与结构，不能对所有动词都加s。',
    '完成“Leo ____ the plants every morning.”，动词给water。', ['every morning说明习惯，Leo为第三人称单数。', '肯定句用waters，完整表达Leo waters the plants every morning.。'], '填waters。', '写water，或在does后仍重复加s。',
    '可能没有同时确认主语和肯定句结构。', '保持动作不变，将Leo换成They，再对照does疑问句，说明各结构差别。', '写新日常活动句后逐项检查时间、主语、动词，不从单题推定所有时态掌握。');
  c('there-is', 'there is和there are引出存在的对象。此处按紧接的单个对象或复数对象选择be，物品所在位置不决定形式。',
    '完成“There ____ four shells in the box.”。', ['存在对象为four shells，明确复数。', '用are；in the box只说明位置。'], 'There are four shells in the box.', '看到box单数就填is。',
    '可能让位置短语里的名词决定be。', '圈出实际存在对象，与位置名词用不同颜色标记。', '从一件物品变为多件，独立调整there结构与名词，不只替换数字。');
  c('like-ing', '在指定like doing结构中，like后接动名词。此规则针对当前结构，不表示like to do在所有场景都错误。',
    '按like doing结构完成“I like ____ pictures.”，给draw。', ['题目指定doing结构，draw变drawing。', '组成I like drawing pictures.，保持词义与宾语。'], '填drawing。', '写draws，或误认为任何其他like结构都不合法。',
    '可能混淆句子主语变位与非谓语形式。', '将like后的活动作为整体圈出，区别主句动词与后续活动形式。', '换新动词比较直接加ing、去e等拼写，说明只在当前指定结构内核查。');
  c('when', 'when询问时间，可用钟点、日期或相应时间短语回答。先定位问题中的动作，避免给出同文另一个事件的时间。',
    'Leo packs at six and leaves at half past six. When does he leave?', ['所问动作为leave，排除pack的six。', '对应half past six，回答At half past six.。'], 'At half past six.', '看到第一个时间就答at six。',
    '可能只抓时间词而未匹配动作。', '先给动作与时间连线，再分别问when does he pack和leave。', '改为周计划表读取日期，检查时间短语与动作对应。');
  c('simple-instruction', '理解书面指令先找动作词与对象，再看否定或先后条件。识别单词不等于完成整条指令。',
    '“Put the ruler beside the book.”要求怎样做？', ['动作put，对象the ruler，目标beside the book。', '把尺放在书旁边，不是放书在尺旁或书里面。'], '把尺放在书旁边。', '只认出book就打开书，忽略动作与位置。',
    '可能未整合动词、对象和位置关系。', '将同一组词换动作或介词，检查实际操作是否随条件变化。', '在两步新指令中逐项核对，听指令的能力需要另有真实音频证据。');
  c('short-text-detail', '比较人物信息要分别记录每个人与活动的关系，不能只记活动名，也不将一个人的偏好复制给另一个人。',
    'Nora likes drawing. Leo likes building models. Who likes building models?', ['给Nora连drawing，给Leo连building models。', '问题问building models，对应人物Leo。'], 'Leo.', '回答Nora，因为她先出现。',
    '可能未保持人物与爱好的配对。', '换问两个人各喜欢什么，检查关系能否双向提取。', '将短句改为表格或加入一个否定信息，仍按明确证据匹配。');
  c('daily-routine', '写日常活动先选择习惯性时间与主语，再用一般现在时写完整动作。两句保持人物一致，时态不因句子变长随意改变。',
    '以I为主语写两项日常习惯：早晨浇花，晚间看书。', ['用I water the plants in the morning.说明第一项。', '用I read in the evening.说明第二项，保留时间与习惯。'], 'I water the plants in the morning. I read in the evening.', '两句都只写动词短语，或将习惯全写成正在发生。',
    '可能未分清习惯意义与句子的主谓结构。', '先给日常与此刻两种时间卡分类，再写完整主谓句。', '改为描述第三人称的习惯，核对主语变化引起的动词形式，不要求照抄原句。');
  c('simple-vs-continuous', '一般现在时常描述习惯，现在进行时描述当前正在发生的动作。先看意义与时间线索，再选结构，now本身不能代替be。',
    '比较“Leo paints every Sunday.”与“Leo is painting now.”。', ['every Sunday说明反复习惯，用一般现在时。', 'now在此说明当前动作，用is加painting。'], '前句为习惯，后句为当前正在画。', '见now只写painting，或把every Sunday的习惯也全部写进行时。',
    '可能认识时间词但未将意义与完整时态结构结合。', '用习惯时间线和此刻一个点分别表示两句，再指出be和动词形式。', '换新动词描述同一人物的习惯与当前动作，分别检查意义与结构。');
  c('some-any', '在本阶段的普通肯定陈述中常用some，普通否定陈述中常用any。请求和希望肯定回答的问句等另有用法，不能机械推为绝对规则。',
    '完成普通否定句“We do not have ____ glue.”。', ['这是明确的普通否定陈述，表示没有胶水。', '选any，保留do not have结构。'], 'We do not have any glue.', '不看肯否条件固定填some，或宣称所有问句只能any。',
    '可能忽略语境和规则的适用范围。', '将同一普通陈述改为肯定与否定，对照some、any的选择。', '在新购物对话先确认陈述、否定或请求场景，遇例外按真实语境核查。');
  c('how-many-much', 'how many询问可数名词复数的数量，how much询问常见不可数名词的量。先判断当前名词用法，不由数值大小决定。',
    '问袋里有多少米，完成“How ____ rice is in the bag?”。', ['此处rice按不可数物质量使用。', '用much；若问几袋，应针对可数的bags用many。'], 'How much rice is in the bag?', '因为米粒能逐粒数就直接用many rice。',
    '可能混淆实物能计数与英语名词在此结构中的可数性。', '对照rice与bags of rice，分别指出被询问的单位。', '换常见新名词，在整体物质量与计量容器数量之间切换提问。');
  c('object-pronoun', '宾格代词用在相应动词或介词后作对象。先找指代对象与句中作用，主格不能在所有位置直接替换。',
    '材料说Nora需要帮助，用代词改写“Please help Nora.”。', ['help后面的人是动作对象。', 'Nora在材料中明确为女孩，用宾格her：Please help her.。'], 'Please help her.', '写help she，把主格放宾语位置。',
    '可能只知道指谁，没有识别在句中的语法作用。', '对照She helps Leo与Leo helps her，分别标动作发出者与接受者。', '换成复数人物与不同动词，先追踪对象再选择宾格形式。');
  c('time-preposition', '常见时间搭配中，具体钟点用at，星期或具体日期用on，月份、年份等常用in。分类看时间表达层级，不只看第一个单词。',
    '完成“Meet us ____ Thursday ____ a quarter past four.”。', ['Thursday是星期，用on。', 'a quarter past four是钟点，用at。'], 'on Thursday at a quarter past four', '所有时间都用in，或给星期也填at。',
    '可能没有将钟点、日期、较大时段分层。', '把时间短语分类，再说明各自对应的常用介词。', '在完整通知写日期与钟点，遇this、next等不同结构时另核查，不乱加介词。');
  c('reading-referent', '读英语代词结合前文对象、单复数与动作语义，替回名词后应保持合理。最近的词不必然就是所指。',
    'Nora puts the seeds in two pots. They will grow in spring. 这里They指什么？', ['grow的对象是seeds，pots不是这里要生长的东西。', '用The seeds替回后语义成立，因此They指seeds。'], 'They指the seeds。', '只因pots距离最近就认作代词所指。',
    '可能忽略动作意义与候选对象的匹配。', '分别替入所有候选名词，检查数量和动作是否成立；线索不足时承认歧义。', '换成带多个人物或物品的新段落，画指代箭头并注明文本依据。');
  c('because-so', 'because引出原因，so连接相应结果。先辨因果角色；常见规范句式不要把because与so成对硬套到同一句主从结构。',
    '把“The road was wet. We walked slowly.”用because说明原因。', ['wet road是走慢的原因，walked slowly是结果。', '可写We walked slowly because the road was wet.。'], 'We walked slowly because the road was wet.', '倒置原因结果，或写Because...so...的机械配对。',
    '可能把中文因为所以配对直接搬到英语结构。', '将两件事分成原因与结果，再分别尝试because和so两种合法连接。', '换新情境解释因果，检查语序变化后关系仍一致，不补造材料未给出的原因。');
  c('notice-reading', '读英文通知按时间、地点、所需物品与限制分别提取。只认识部分词时可先定位字段，再检查同一活动的条件是否完整。',
    'Model club: Tuesday, 4 p.m., Room 6. Bring scissors. 应何时、去哪、带什么？', ['提取Tuesday at 4 p.m.和Room 6。', 'Bring后要求scissors，把三项列清，不将room number当时间。'], '周二下午4点，到6号房，带剪刀。', '把6读为6点，或遗漏Bring要求。',
    '可能未将数字与各自字段、单位对应。', '给每条信息标time、place、things，逐项回原文核对。', '加入更新通知后对照变化字段，保留仍有效要求，不能只记第一版。');
  c('describe-now', '描述当前动作使用主语加be加ing；描述习惯使用一般现在时。两句可同时正确，取决于各自时间意义。',
    '场景：Nora现在修模型，平时周末画画。写两句。', ['当前动作写Nora is fixing a model now.。', '习惯写She paints at weekends.，同一人物用不同时间结构。'], 'Nora is fixing a model now. She paints at weekends.', '两句都省be，或将习惯句也按now处理。',
    '可能未按每句意义独立选择结构。', '分别给两句标此刻和习惯，并圈出完整谓语。', '换新图像与作息表，分别描述实际当前动作和表中习惯，不由一张图推定长期习惯。');
  c('past-regular', '明确过去的规则动词常用ed形式。时间与动词共同表达事件已发生，不能加了yesterday就保留所有动词原形。',
    '用过去时完成“Yesterday Nora ____ the room.”，动词给clean。', ['yesterday说明过去，clean在此按规则变化。', 'clean加ed成为cleaned，写回原句。'], 'Yesterday Nora cleaned the room.', '只加yesterday，仍写clean。',
    '可能把过去意义只交给时间词，忽略动词形式。', '对照today习惯与yesterday一次事件，说明动词为何变化。', '换新规则动词比较直接加ed与去e加d等拼写，发音规律需实际听说材料另测。');
  c('past-irregular', '常见不规则过去式需要将原形、过去形式和意义相连，不能统一加ed。先认定所需时态，再提取相应词形。',
    '完成“Yesterday Leo ____ a picnic.”，动词给have。', ['时间为过去，have在此过去式为had。', '写Leo had a picnic，避免haveed。'], 'Yesterday Leo had a picnic.', '把所有动词都加ed，或把过去式重复加ed。',
    '可能没有建立不规则词形联结，或未区分时态结构。', '将have、had按现在与过去情境匹配，再反向提取原形。', '在新短文中用go、see、eat等常见词分别提取过去式，不由一个词推定整类掌握。');
  c('past-be', '过去的be按主语选择was或were。I、he、she、it等单数常用was，you、we、they等用were，先核对时间与人称。',
    '完成“The tools ____ on the shelf yesterday.”。', ['yesterday限定过去，主语tools为复数。', '使用were，不能由shelf单数决定was。'], 'The tools were on the shelf yesterday.', '只看近处shelf选was，或仍用are。',
    '可能未同时定位主语与过去时间。', '保持地点不变，分别替换一件工具、多个工具和you作对照。', '在过去描述中将be句与实义动词句分开检查，不给所有动词前都加was。');
  c('future-going', 'be going to加动词原形表达计划，be仍需与主语匹配。going to后面不再重复be或把实义动词加s。',
    '用计划结构写“Nora下周要做一只纸船”。', ['Nora为单数，使用is going to。', '后接make a paper boat，时间为next week。'], 'Nora is going to make a paper boat next week.', '省略is，或写going to makes。',
    '可能未将计划结构看成完整的谓语组合。', '用不同主语替换，圈出变化的be与保持原形的动词。', '为真实或虚构安排写一句计划，再说明计划不等于事情已发生。');
  c('comparative', '比较级在明确比较两个对象的同一属性时使用。常见规则有加er、以e结尾加r、特定短词双写等，不能只看than机械拼写。',
    '完成“This box is ____ than that one.”，形容词给big。', ['比较两只盒子的大小，需要比较级。', 'big变bigger，双写g再加er。'], 'This box is bigger than that one.', '写biger或more bigger，重复标比较。',
    '可能知道比较含义但拼写规则或形式数量不稳。', '先对照原级与比较级意义，再按词尾检查变化。', '换新常见形容词描述实际两物，确认比较维度一致，不把高矮推成好坏。');
  c('must-rule', 'must表达必须，must not表达禁止；不必与禁止含义不同，不能因都有否定成分就混同。',
    '标牌写“You must not touch the glass.”允许轻轻碰吗？', ['must not说明禁止触碰，不是可选择是否碰。', '因此轻轻碰也不符合这条规则。'], '不允许触碰。', '把must not理解成不必，但想碰仍可以。',
    '可能混淆禁止与无必要。', '对照must、must not与do not have to，用可执行行为解释差别。', '阅读新场所规则，将必须、禁止、可选分别列清，并保留规则适用地点。');
  c('sequence-reading', '英文事件顺序要跟随before、after、then等关系，句中先出现的动作可能实际后发生。先还原时间线，再回答。',
    'Leo checked the map before he left. What happened first?', ['before说明checked the map发生在left之前。', '先检查地图，再离开；不按最后一个动词答。'], 'He checked the map first.', '把文字最后出现的动作认成先发生。',
    '可能没有把连接词映射为时间关系。', '把两动作写在卡上，按before与after两种句式分别排序。', '换成三步行程，同时比较文本排列与实际顺序，引用时间线索。');
  c('context-word', '根据语境猜词要用定义、举例或对照线索，候选词义放回原句后应合理。熟悉的首个义项未必适合这里。',
    '“The path is narrow: only one person can walk along it at a time.”这里narrow什么意思？', ['冒号后每次只能一人通过，提示道路宽度有限。', 'narrow在此为狭窄，不是路程短。'], '这里表示狭窄。', '把不熟词按附近无关名词猜成短或快。',
    '可能没有利用解释性线索核验词义。', '先指出哪一小句给出线索，再将候选意义代回。', '换新主题短文用对照或例子推词义，线索不足时提出查词需求。');
  c('past-account', '简短经历按实际先后写出主要动作与结果，过去时间下动词保持相应过去形式。允许多种内容，但不可将时态核查变成逐字匹配。',
    '以虚构经历写昨天下午整理模型的两步。', ['先写Yesterday I checked the pieces.。', '再写Then I put them in a box.，时间与动词都保持过去。'], 'Yesterday I checked the pieces. Then I put them in a box.', '首句过去，后句无理由改现在；或只有动词词表。',
    '可能在连续表达中未保持时间线与完整句。', '先排事件卡，再逐句检查谁、做什么与何时。', '换一个短经历自主写作，按内容、顺序、语言分别复核，不要求套同一故事。');
  c('tense-discrimination', '过去、习惯现在与将来计划由语境和时间共同限定。时间词是线索，最终仍需检查完整谓语结构。',
    '区分yesterday、every Friday、next Friday计划三种情境下的visit。', ['过去一次可写visited，习惯以I为主语写visit。', '将来计划可写am going to visit，说明每种对应的时间。'], '分别为visited、visit、am going to visit。', '所有时间统一写visit，或把next与yesterday混用。',
    '可能未建立时间意义与结构的稳定对应。', '先不填词，把三种情境放到时间轴，再解释选择。', '在新短文中逐句判断各自时间，允许同段包含不同时间而不强行统一。');
  c('comparison-irregular', 'good、bad等常见形容词比较级不按普通加er形式。good对应better，bad对应worse；要先确认是在比较同一属性。',
    '完成“This plan is ____ than the old one for saving time.”，给good。', ['than说明两个方案在省时方面比较。', 'good的比较级为better，不写gooder或more better。'], 'This plan is better than the old one for saving time.', '写gooder，或把better理解为所有方面都更好。',
    '可能词形联结或比较范围尚不明确。', '将good—better与bad—worse按语境匹配，并保留比较维度。', '比较新方案的速度与成本可能有不同结论，分别用比较句表达限制。');
  c('conditional', 'if句提出条件，主句说明该条件下的结果。材料给出一条条件规则，不代表只有这一个原因，也不能任意反向推出条件。',
    '规则“If it rains, we will use Room 6.”哪部分是条件，哪部分是安排？', ['it rains为条件，use Room 6为该条件下安排。', '这句没有说明不下雨就一定不能用Room 6。'], '下雨是条件，使用6号房是对应安排。', '反推只要使用6号房就一定下雨。',
    '可能将单向条件关系当作双向等价。', '用条件卡与结果卡连箭头，检验反向推理是否另有依据。', '换活动规则，在条件发生、未发生、未知三种情况下分别说明能确定什么。');
  c('why-how', 'why询问原因，how询问方式或过程。答案形式要和意图匹配，because与by等线索有帮助但不能取代理解。',
    '比较“Why did Leo walk?”与“How did Leo get there?”。', ['前者问选择步行的原因，例如Because the bus stopped running.。', '后者问到达方式，可答On foot.，不以原因替代方式。'], 'why问原因，how问方式。', '把on foot答给why，或任何问题都答because。',
    '可能只认问句结构，没有识别所缺信息类型。', '先给中文原因与方式两种答案分类，再配英语问题。', '在同一行程材料分别提why与how，只回答材料明确提供的内容。');
  c('inference-text', '有限推断用动作与情境支持可能解释，并保留文本没有说明的部分。线索支持一个判断不等于能确定所有隐含动机。',
    '“Leo brought a raincoat after reading the weather notice.”可以作什么有限推断？', ['阅读天气通知后带雨衣，支持他在准备应对可能降雨。', '不能据此断定当天一定下雨，或他总是最细心。'], 'He may be preparing for rain.', '把may改成must，或从一次行动推断固定品质。',
    '可能忽略结论确定性与证据强度的匹配。', '分别指出文中事实和推断，并给一个仍可成立的其他解释。', '换带反向线索的新材料，要求修正原推断而非只找支持。');
  c('mainidea', '段落主旨覆盖相关细节的共同内容，不能只选其中一条，也不能加上段落未谈的评价。先概括再比候选。',
    '“Our club checks tools, labels boxes and keeps a borrowing list.”主要讲什么？', ['三个细节都与俱乐部管理工具有关。', '概括为how the club organizes tools，比只说labels boxes覆盖更完整。'], 'How the club organizes tools.', '只复述一个例子，或改成俱乐部一定最优秀。',
    '可能尚未形成细节与上位概括的对应。', '让每个细节连到候选主题，检查哪项能覆盖全部而不额外扩大。', '将主旨句放段尾或省略，仍通过相关细节归纳，而不固定取首句。');
  c('two-source-reading', '两条英文信息要同时满足才能形成可执行选择。分别提取各自条件，再取共同可行范围，不能因一条允许就忽略另一条限制。',
    'Note A: Open 10 a.m.–4 p.m. Note B: Last entry at 3 p.m. Can we enter at 3:30 p.m.?', ['开放到4点不等于一直能入场，另有3点最后入场限制。', '3:30已过last entry，因此不能按当前规则新入场。'], 'No. It is after the last entry time.', '只看到open到4点就回答可以。',
    '可能没有合并开放范围与入场限制。', '把两条条件放同一时间线，分别判断每条与整体可行性。', '换成日期与人数限制的两材料，逐项核对并明确缺少信息时需再确认。');
  c('self-correction', '修改先定位明确的不一致，再用最小改动保持原意。检查时间、主语与谓语结构，不为流畅而改写事实。',
    '检查“Leo do his homework every evening.”。', ['主语Leo为第三人称单数，句意为习惯。', '将do改为does，其他时间与内容保持。'], 'Leo does his homework every evening.', '改掉时间来迎合原错误，或把所有动词统一加s。',
    '可能没有先确定错误属于哪个结构。', '分别标时间、主语、谓语，说明哪两项不匹配。', '在新短文定位一个时态或主谓错误，解释修改理由并保留原意。');
  c('plan-with-reasons', '计划表达需要具体行动、理由和条件变化后的安排。将将来计划与已发生事实分开，不把希望写成保证。',
    '为周六整理工具写计划、一个理由与下雨时的备选。', ['计划用We are going to sort the tools on Saturday.。', '补充理由便于查找，并说If it rains, we will work indoors.。'], 'We are going to sort the tools on Saturday because this will make them easier to find. If it rains, we will work indoors.', '只列活动，无理由或备选，或把计划写成已经完成。',
    '可能未整合行动、因果和条件三类信息。', '先用三栏列计划、理由、变化条件，再独立写成连贯句。', '换时间或资源受限的任务，给可执行的新方案，不照搬示例的室内安排。');

  const oral: Array<[string, string, string[], string, string, string]> = [
    ['oral-greeting', '扮演新同学Nora，用英语口头问候并介绍姓名。', ['先说适合当前时段的问候。', '再用I am说明虚构姓名，录音听回是否清楚完整。'], 'Hello. I am Nora.', '只有姓名或只有问候，未完成两个交际目的。', '换一个虚构姓名和见面时段，独立录音回应，不背同一整段。'],
    ['oral-object', '根据情景：一枚绿色贝壳在盒里，用两句英语口头描述。', ['先介绍This is a shell.。', '再说It is green或It is in the box，保持所指一致。'], 'This is a shell. It is green and it is in the box.', '只列单词，听者不知道对象与属性的关系。', '换物品和位置信息，用自己的句子描述，分开观察内容和可理解性。'],
    ['oral-routine', '口头说两项日常活动，使用I为主语。', ['先确定习惯性动作和时间，不说成眼下正在做。', '说两句完整现在时句，听回主语与动作是否清楚。'], 'I water the plants in the morning. I read after dinner.', '时间习惯与进行时混用，或只说动作词。', '换成周末习惯口述，按新信息组织，不由书面正确推定发音。'],
    ['oral-now', '口头说明Leo现在修模型、平时周日画画。', ['当前使用Leo is fixing a model now.。', '习惯使用He paints on Sundays.，两句时间分清。'], 'Leo is fixing a model now. He paints on Sundays.', '两句只说ing而无be，或未区分两种时间。', '换新图片与作息信息，先确认理解再录音，不用一次停顿判时态不懂。'],
    ['oral-past', '讲一段虚构的昨日下午经历：检查零件，然后装盒。', ['按先后选择checked与put等过去形式。', '用Yesterday和Then连接两步，录音后检查主要信息。'], 'Yesterday I checked the pieces. Then I put them in a box.', '第一句过去后无理由改现在，或遗漏关键一步。', '换一种短经历独立口述，分别复核时态、顺序、听者可理解性。'],
    ['oral-plan', '口头给出周末活动计划、理由及下雨时的备选。', ['说明计划与一个有联系的理由。', '补充if条件下的可执行备选，不保证一定发生。'], 'We are going to draw outdoors because there is more space. If it rains, we will use the studio.', '有计划但无理由或条件回应，或把未来说成已经发生。', '改用预算不足或场地关闭条件，比较方案并回应一个实际限制。'],
  ];
  for (const [code, prompt, steps, conclusion, error, transfer] of oral) author('core:english:' + code,
    '英语口语分别观察交际内容、句子组织和可理解性。先想清要说的意义，再录音；书面选择、背熟示例、口音差异或语速不能单独证明真实口语能力。',
    prompt, steps, conclusion, error, ['可能内容或语言结构需要支持，应先用关键词卡确认理解。', '也可能受设备、环境或紧张影响，须听回原录音并用新任务对照。'],
    ['先用图片或关键词确认目标意义，再观察能否用英语表达；把理解与实际发音表现分别记录。', '撤去示例，录制新情景表达，按内容、语言组织和可理解性分别复核，允许合理不同措辞。', transfer,
      '间隔三天在安静环境换新情景录音，保留原文件与量规；重录同句只算练习，不能直接作为新迁移证据。']);
}

// Accurate original: observation of one bird, not a universal animal behavior
// rule. Drafts and probes remain unreviewed and never create learner facts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),bookId='archive-book:chinese-g3-upper-02915a7db6517258',prefix='source:chinese:g3:02915a7d:',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const definitions=[
 ['bird-reading','搭船课五字语境识读','结合词语识读父啦鹦鹉悄五字','本人本次声音覆盖五字，外祖父、沙啦沙啦、鹦鹉、静悄悄按当前原词核对，不按词数漏算鹦鹉两字','识字与阅读'],
 ['bird-handwriting','搭船课十二字实际书写','观察并真实书写搭亲父啦响羽翠嘴悄吞哦捕十二字','本人原稿逐字核对部件和结构，朗读、拼音选择或旧字库图不能代本次书写；实际订正前后分别保留','识字与写字'],
 ['bird-detailed-appearance','用部位颜色说明外形观察','提取翠鸟羽毛翅膀嘴等细节，说明作者怎样观察','部位与翠绿、带蓝、红色长嘴准确对应，比较与评价有具体依据，不把漂亮标签代细节或把一例推所有鸟','观察与表达'],
 ['bird-fishing-actions','联系连续动作想象捕鱼过程','按当前叙述梳理冲入水、飞起、衔鱼、站船头和吞鱼的联系','动作对象与先后清楚，衔和吞不同，没一会儿与一下子帮助理解敏捷但不编精确秒数；复述与真正观察记录分开','叙事与观察'],
 ['bird-observation-and-questions','区分作者所见疑问与后续知道','比较起初看到的鸟、提出的疑问和捕鱼后获得的信息','外形与捕鱼有实际叙述，什么时候来和停多久仍未给；去外祖父家是作者疑问，不当鸟已确定的行程或内心','阅读与推断'],
].map(([suffix,name,objective,successCriterion,strand])=>({id:prefix+suffix,version:1,name,subject:'chinese',grade:3,term:'upper',strand,objective,successCriterion,prerequisiteIds:[],curriculumVersion:'source-original-02915a7d-v1',status:'draft'}));
const goals=[...definitions.map(d=>({atomId:d.id,objective:d.objective,successCriterion:d.successCriterion})),{atomId:'core:chinese:contextmeaning',objective:'联系当前场景解释搭衔吞等词语并说明依据',successCriterion:'词义与动作对象相容，作者猜想与鸟实际活动分开，不把同一词所有语境混作一义'},
 {atomId:'core:chinese:detail-evidence',objective:'用当前叙述支持观察判断，保留未知和来源范围',successCriterion:'作者实际看到、想到、母亲告知与本人真实观察分别核对；一只翠鸟的行动不推所有鸟全部习性'}].map((g,i)=>({id:'goal-'+(i+1),...g}));
const draft={format:'source-original-lesson-draft-v1',status:'draft_needs_materials_and_review',source:{bookId,lessonId:bookId+':unit5:entry1',sourceSha256:'02915a7db6517258434d370430bbf464a1dac6e17df97b90d707dc4ecf5cfedf',pageStart:69,pageEnd:70,publicationYear:null,curriculumStandardYear:null},definitionCandidates:definitions,targetIds:goals.map(g=>g.atomId),
 sourceReview:{confirmedRange:true,statement:'物理69至70页印64至65已逐张查看，核作者郭风及选文有改动、正文插图、识写字表与课后两任务；只核当前准确原件，不把作者经历和示范当学生实际观察。',pages:[{page:69,visualChecked:true,statement:'已看作者郭风、探亲船行与雨声、翠鸟外形部位颜色、何时来和做什么的疑问，疑问不作为鸟内心或目的地事实。'},{page:70,visualChecked:true,statement:'已看冲入水、飞起、衔小鱼、站船头、吞鱼及母亲告知翠鸟，5识12写与细致观察依据、注意动作想象两任务，无全文背诵要求。'}]},
 scope:{title:'搭船的鸟',author:'郭风',textbookAdapted:true,physicalPages:[69,70],recognitionCharacters:['父','啦','鹦','鹉','悄'],writingCharacters:['搭','亲','父','啦','响','羽','翠','嘴','悄','吞','哦','捕'],fullTextRecitationRequired:false,requiredTasks:['指出作者细致观察了什么及依据','注意动作词想象翠鸟捕鱼'],arrivalTimeAndDurationSpecified:false,teacherReviewed:false,published:false},
 content:{title:'搭船的鸟：把看到的细节与想到的问题分清楚',goals,prerequisites:[],
 activation:{prompt:'原创观察卡：窗边一只纸做的小鸟，身体绿色、翅膀边蓝色、嘴细长红色。分别说部位和颜色，再说“好看”这个评价由哪些具体信息支持。纸鸟不是实际翠鸟或原课插图。',expectedObservation:'能把部位、颜色与长度对应，不只给漂亮标签，图卡观察与真实动物观察身份分清。',bridge:'作者也先留意翠鸟外形，再看到一串捕鱼动作，逐渐知道它在做什么。'},
 concept:{explanation:'作者和母亲坐船探亲，雨停后看到船头一只小鸟。细致观察并不只是说它漂亮，而是把羽毛翠绿、翅膀带蓝色、红色长嘴等部位和特点对应；比鹦鹉还漂亮属于作者在这些信息基础上的感受。起初他不知道鸟何时来、停了多久、在做什么，去外祖父家也只是提出的疑问，不能写成鸟已确定的目的地。后来鸟冲入水里，飞起来衔着小鱼，站在船头把鱼吞下去；冲、飞、衔、站、吞依次连接成一次具体过程，衔着还在嘴里，吞下是后一个动作，不能互相替换。一下子和没一会儿使读者感到行动快，但没有给精确秒数。母亲告知这是翠鸟，作者结合所见知道它在捕鱼吃。观察、想象画面、提出问题和后续知道是不同阶段，后面懂了不能把前面未知倒写成早知。读课文可以借动作在脑中形成画面，但不等本人实际看到同一只鸟，更不从一次叙述推出所有鸟的颜色、食物或固定行为。自己的观察可选身边合适事物，写具体看到什么和仍有什么问题，不需要安排真实捕鱼、捕鸟或模仿船行。',points:['评价用部位与颜色细节支持','所见和疑问有不同身份','连续动作有对象与先后','衔与吞不混，快不等精确秒数','母亲告知与本人后来理解分别说','课文想象与实际观察记录分开']},
 example:{situation:'明确原创三卡：先给纸鸟外形，再给玩具在浅盘模型中夹起纸鱼的动作卡，最后给说明卡“这是用纸做的观察示例”。不是真实动物捕鱼或操作要求。',steps:[
  {explanation:'先描述身体、翅边和嘴的具体信息，再用这些细节说明为什么觉得颜色鲜明，不由评价词倒推出未给花纹。',board:['部位：身体、翅边、嘴','特点：绿、蓝、红且细长','评价由细节支持']},
  {explanation:'按给定动作卡“下移、夹起纸鱼、回到边沿”梳理顺序，区分仍夹着纸鱼与后来放下；这里只练动作表达，不补成课文原动作。',board:['按当前动作卡','对象：纸鱼','夹着与放下是不同阶段']},
  {explanation:'说明卡出现后保留先前记录，明确自己看的是原创模型信息，仍不知道真实翠鸟何时到船头；不能将模型当作者实际经历。',board:['原观察不覆盖','新信息：模型身份','真实原篇未给仍未知']},
 ],conclusion:'观察写清对象和具体信息，过程写清动作联系，材料身份与后来知道的信息分别保留。'},
 visuals:[{kind:'table',title:'看到、想到与后来知道分三类',headers:['叙述中的信息','当前可以说明','仍不能直接推出'],rows:[['羽毛翠绿、翅膀带蓝、红色长嘴','部位颜色和形状帮助表达外形','不能只用漂亮替细节或推所有鸟同色'],['何时飞来、停了多久的问句','作者当时存在疑问','原文没有精确到达时刻和时长'],['冲、飞、衔、站、吞的一次过程','动作对象先后与敏捷','不能改成精确几秒或所有次都同样'],['母亲告诉这是翠鸟','叙述中获得鸟名的途径','不能说作者一开始已经确定'],['自己脑中想象课文画面','基于文字理解动作','不等本人实际观察或真实动物实验']],explanation:'用信息类别帮助检查结论来源，后来的理解不覆盖原疑问，文学观察不自动变成全部生物规律或本人观察证明。'}],
 misconceptions:[{observation:'只回答翠鸟好看，或把翅膀蓝、嘴红的对象互相换掉。',alternatives:['可能只记评价，也可能未把部位与特点对应。'],verification:'分别指向羽毛、翅膀和嘴的词句，按部位加特点说明，再核评价有何依据。',correctiveFeedback:'细节要准确对应，评价可以不同，但不能用漂亮一个词替所有观察。'},
  {observation:'把鸟想去外祖父家、精确停几分钟写成作者已经看见的事实。',alternatives:['可能没分问句与答案，也可能把生活推测补成已给。'],verification:'找所见、疑问、后来动作和母亲告知各一处，核对哪项仍未有答案。',correctiveFeedback:'可以明确提出推测，不能冒充已知时刻、目的地和内心；未给就保留未知。'},
  {observation:'把衔着鱼说成已经吞下，或用自己想象的画面充当真实观察记录。',alternatives:['可能混动作阶段，也可能忽略课文阅读与本人观察的区别。'],verification:'按原动作排列，分别说鱼在哪，再标自己目前所用材料是课文、图卡或实际观察。',correctiveFeedback:'动作顺序和材料身份都需清楚，后一个动作不倒改前阶段，想象不是实际观察已发生。'}],
 transfer:{scenario:'换一段未见的原创动物或物件动作材料，也可观察身边合适的静物或活动；无实际观察时只分析明确图卡。',prompt:'用具体部位特点说明对象，再按先后写三项相连动作，分一项所见、一个问题和一项后来核对。',expectedStrategy:'来源和范围准确，动作有对象及先后，图卡、模型、真实观察与作者叙述不混；未读信息不补成已知。'},
 summary:{synthesis:'留意部位和动作，评价才有细节。保留当时的问题，读到后文再更新，知道从哪里来的信息也要讲清。',takeaways:['部位特点对应','动作顺序可跟随','衔和吞有区别','问句不是已知结论','课文与本人观察分开']},
 retention:{intervalDays:[1,3,7,14],anchor:'last_relevant_teaching_or_help',instructions:'目标对齐、评分和未见题族及充分库存审核后按真实日期安排。看过原篇和图卡或得到动作示范需保留曝光；每间隔一份候选样题不等足够保持材料，模拟日期和虚构观察不能当真人证据。'},
 citations:[{page:69,quote:'它什么时候飞来的呢',usedFor:'concept'},{page:70,quote:'想想作者对哪些事物作了细致观察',usedFor:'transfer'},{page:70,quote:'读下面这段话，注意加点的词语，想象翠鸟捕鱼的情景。',usedFor:'example'}]},
 editorNotes:{slug:'bird',teacherReviewed:false,automaticPublication:false,realLearnerEvidence:false,materialStatus:'原创教学与未审候选，结构、评分、充分保持库存仍待审。',sourceBoundary:'只核当前郭风选文和原页，问题未获回答就保留，不把一次观察推广全部翠鸟或学生真实经历。'}};
const groups=[];
function add(suffix,structure,mode,criteria,rows){if(rows.length!==7)throw Error('Seven explicit probes required');groups.push({lesson:'bird',atomId:suffix.startsWith('core:')?suffix:prefix+suffix,structure,familyProposal:'following-'+structure,familyIndependenceReviewed:false,mode,rubric:criteria.map((criterion,i)=>({criterion,weight:[0.4,0.4,0.2][i]})),goldAnchors:{acceptedExample:rows[0][1],insufficientExample:'它很漂亮，我全部看过了，每只鸟都这样。',insufficientReason:'缺具体部位动作与来源范围，不能由一个评价或文学阅读补成真实观察和所有动物规律。',alternativeAnswers:'候选人工核对参考，允许有据不同评价；真实声音原稿、原答、帮助和未知各自留证。'},exercises:rows.map(([stem,answer],i)=>({id:'bird-'+structure+'-'+(i+1),purpose:i<3?['understanding','procedure','transfer'][i]:'retention',dimension:i<3?['understanding','procedure','transfer'][i]:['understanding','procedure','transfer','understanding'][i-3],proposedIntervalDays:i<3?null:[1,3,7,14][i-3],stem,answer,analysis:answer+' 仅供未审材料人工核对，不能自动评分、批准独立性或代填本人真实观察。',expectedSeconds:mode==='image_upload'?300:mode==='audio_record'?200:180}))});}
add('bird-reading','bird-five-contextual-reading','audio_record',['本人本次声音覆盖五字','读法对应原词语境','五字与四组词分清，文字选择不代声音'],[
 ['录音读“外祖父、沙啦沙啦、鹦鹉、静悄悄”，说明包含哪五个目标字。','父fù、啦lā、鹦yīng、鹉wǔ、悄qiāo按当前词核对；鹦鹉含两个目标，四组词不等四字。'],
 ['先读鹦鹉两字所在词，再补其他目标词，指出哪一个还需核对。','两目标分别听，补父啦悄，不由一个词读顺推其他未读字已会。'],
 ['新原创句“外祖父站在静悄悄的屋里看鹦鹉”。录音后补沙啦沙啦，说明覆盖。','新句与补词一起覆盖五目标，按当前词语听实际音，旁字不混成目标。'],
 ['本次给五字配当前合理词语读出，说明是否刚听过参考或看过原页。','本人本次音频与语境相容，帮助保留，旧声音和示范声音不代本人表现。'],
 ['沙啦沙啦是雨声里的啦，与别的口语语气词读法能机械统一吗？录音读当前词并说明。','当前读lā依原词拟声，不强定同字所有语境同音；说明不能代实际录音。'],
 ['把仍不稳的一字查证后再读，接着补齐其余目标，保留本次订正前后。','核对当前词语，实际音频和订正分别记，拼音选择不代发音。'],
 ['重新录音读全表，说明实际帮助与未完成部分；无本次录音则如实留缺。','五字真实声音分别核对，原词重复不自动取得新的未见保持资格，不能补造本次已读。'],
]);
add('bird-handwriting','bird-twelve-actual-handwriting','image_upload',['本人原稿覆盖十二目标字','部件和结构实际可核','旧图参考图不代本人本次，原改分别留'],[
 ['真实书写搭亲父啦响羽翠嘴悄吞哦捕12字并上传，圈出一处需要进一步核对的部件。','逐字看本人原稿与结构，指认部件和实际字形分别评，范字图或旧字库图不能代本次。'],
 ['先写“搭、亲、父、啦、响、羽”，再写其余目标字，保留原稿和实际订正上传。','十二字覆盖分别核对，写前六不推后六已经会，声音或拼音选择不能代书写。'],
 ['在新原创观察短句中实际书写目标字，再补齐未用到的目标并上传说明覆盖。','原句内字和补写合起来核十二字，不能由一张句子图推没出现的目标字已会。'],
 ['本次手写“翠、嘴、悄、吞、哦、捕”并上传，再说明另六字当前是否实际完成。','当前六字原件逐项核查，另六未做就留缺，不用过去照片自动补本次全表保持。'],
 ['上传本人十二字中的原改对照，指出一项真有问题的结构与改法；无问题不故意造错。','原问题与改后可追溯，清稿不能倒造订正过程，改得多不等能力更高。'],
 ['观察嘴和捕等字的部件关系，真实写出再补全目标表上传，说明所用帮助。','部件观察支持当前书写，方法说明不代字形，帮助和实际覆盖留证。'],
 ['分两次短书写实际覆盖全表并上传本人原件，报告未稳字，不要求机械大量抄写。','分次可接受，实际全表才有对应信息，未完成保持，旧图和字库不得替本人本次。'],
]);
add('bird-detailed-appearance','bird-part-color-shape-observation','short_answer',['部位和颜色形状对应准确','评价有具体细节支持','一例与所有鸟、原篇与新卡不混'],[
 ['用羽毛、翅膀和嘴三个部位分别说明翠鸟外形，再解释一项自己的感受。','羽毛翠绿、翅膀带蓝、嘴红且长分别对应，漂亮感受由细节支持，不互换部位或补未给花纹。'],
 ['把“翠鸟很好看”补成两项可定位的观察，再说明原文哪些词支持。','具体部位与特点有原文依据，不只堆好美漂亮；评价可以不同但细节需准确。'],
 ['原创图卡给纸鸟身体绿、翅边蓝、嘴细长红。写两项观察和一项评价，并标明材料身份。','按当前纸鸟卡描述，不称本人已看真实翠鸟，也不把图卡新增信息说成原文。'],
 ['某说明把红色写到翅膀、蓝色写到嘴，保留原说法并按原文改正。','原部位颜色配对错误，改回翅膀带蓝、嘴红且长，原答和订正不混成首答已对。'],
 ['“比鹦鹉还漂亮”是怎样的信息？能由此测出翠鸟全部部位的精确尺寸吗？','是作者比较感受，具体外形来自当前描述，不提供所有精确尺寸或统一审美结论。'],
 ['选一个实际身边物件或明确图卡，用部位加特点写两句。实际观察与图卡分析分别标。','具体信息可对应当前对象，没实际看不称已观察，未给部分不靠评价补齐。'],
 ['重看自己一段外形说明，指出一处只有标签的表达并补实际细节；无原稿则用标明示例。','原说法与改进有对应来源，不从一次对象推所有鸟颜色习性或全部阅读能力。'],
]);
add('bird-fishing-actions','bird-action-object-sequence','short_answer',['动作先后和对象准确','衔与吞阶段分清','快慢词不变编造秒数或本人观察'],[
 ['按课文梳理冲、飞、衔、站、吞怎样连成一次捕鱼过程，分别说鱼在什么阶段出现。','冲入水，飞起时衔鱼，站船头后吞下；衔着与已吞不同，不能把后一步倒放成前一步。'],
 ['将“鸟吞着鱼飞起来，后来衔下去”按当前叙述改清楚，说明哪里混淆。','应飞起时衔着，随后站船头吞下，衔是嘴叼着，吞为咽下，动作对象和先后对应。'],
 ['原创动作卡：玩具下移、夹起纸鱼、回到边沿、放下纸鱼。按顺序写过程并说明与原篇身份不同。','当前卡顺序对象清楚，不冒充真实捕鱼或原篇具体动作，夹着和放下不同阶段。'],
 ['一下子、没一会儿怎样帮助想象动作？能写成精确两秒三秒吗？','让读者感到行动快，但原文无具体秒数，不能把感受变精确测时结论。'],
 ['只说“翠鸟捕鱼了”与列出相连动作，给读者的信息有何不同？用一项具体动作说明。','概括给结果，动作使过程可想象，如冲入水或衔鱼飞起；不能只背动作数量代关系。'],
 ['选择原过程相邻两项动作，说明前一动作完成到什么状态、后一动作又改变什么。','如衔鱼到吞鱼由在嘴里到吞下，关系有原文支持；不由想象补作本人亲眼所见。'],
 ['对一段真正新动作材料作顺序说明并记录来源；没有新材料则标原篇回顾。','对象先后明确，原篇重复与实际帮助保留，不把熟悉五词再排序当新独立结构通过。'],
]);
add('bird-observation-and-questions','bird-seen-questions-and-later-information','short_answer',['所见与问句分别定位','后续所知有获得途径','未回答的时刻时长目的地不代填'],[
 ['把作者看到的外形、提出的一个问题和后来知道的信息各写一项，说明来源。','部位颜色是所见，何时来等是疑问，母亲告知翠鸟及捕鱼所见帮助后来理解；三类分清。'],
 ['原文是否给出鸟何时飞来、在船头停了多久？怎样准确表达当前状态？','未给精确答案，可说作者当时也不知道，不能把自己估计的时间填成原文事实。'],
 ['原创卡：先见盒盖有蓝色标记，问里面是否有书，后卡才说明是空盒。分别列先前已知、猜想和后知。','标记已给，里面有书是问题或猜想，空盒是后卡信息，原猜保留不倒改成起初已知。'],
 ['“难道它要和我们一起坐船到外祖父家里去吗”能改成鸟已经计划探亲吗？说明。','不能，这是叙述者疑问，鸟的具体内心和目的地未给，不能把人的猜测变动物已定行程。'],
 ['作者后来知道鸟名，能直接写成刚看到时就已确定是翠鸟吗？','不能，原文母亲后来告知，信息获取顺序保留，不以后知覆盖初见未知。'],
 ['外形观察能单独回答它当时在做什么吗？后续哪项信息更直接支持捕鱼判断？','外形不等活动目的，衔鱼飞起并吞下更直接支持当前捕鱼吃，母亲告知鸟名另属信息。'],
 ['列一个当前仍未知的问题和可怎样核对的思路，不伪造已经得到答案。','问题有原范围，进一步可靠观察或资料可拟议，但当前未做保持未知，不能代填本人真实发现。'],
]);
add('core:chinese:contextmeaning','bird-context-meaning-actions','short_answer',['词义符合当前对象与场景','具体线索支持解释','不同义项和人物推测不套全部事实'],[
 ['“衔着”和“吞下”为什么不能互换？联系小鱼在当前动作中的状态解释。','衔是用嘴叼着，吞下是咽下，前后状态不同，词义由当前过程支持。'],
 ['“搭船”在本课怎样联系鸟停在船头理解？是否已证明它像人一样买票探亲？','借用人搭船表达停在船上当前情形，未给付费或探亲内心，不把拟人联想作事实。'],
 ['原创句“纸夹夹着小卡，后来把卡放下”。用状态变化解释夹着和放下的区别。','卡仍被夹住与松开落下不同，具体对象和动作关系清楚，不搬原篇鸟动作代所有词。'],
 ['“静悄悄”写鸟停在船头的什么表现？能推断它已经停了固定多久吗？','安静不出声等当前状态，不给精确停留时长，也不证明一直完全不动。'],
 ['“一下子冲进水里”怎样形成动作画面？能只由冲字算速度数值吗？','表现迅速有力进入水的动作，结合句子想象，不提供距离和时间测量来算速度。'],
 ['“翠绿”和“带着一些蓝色”怎样限制颜色描述范围？','分别对应羽毛和翅膀，带一些不是整只鸟纯蓝或纯绿，需按部位和程度表达。'],
 ['自选一词，写当前解释、原句线索和一种不适合当前场景的理解。','具体词义有语境支持，不只列联系上下文口号或机械套字典另一义。'],
]);
add('core:chinese:detail-evidence','bird-observation-range-evidence','short_answer',['判断有具体叙述支持','所见所想告知和本人过程分清','未知和一例范围不被扩大'],[
 ['作者见一只翠鸟捕鱼，能证明所有鸟都以同样动作和食物生活吗？','不能，仅支持当前一只鸟的这次叙述，其他鸟与情况需要各自资料，不能从一例推全部。'],
 ['读课文后想象出捕鱼画面，能填写本人已实际观察同一只翠鸟吗？','不能，阅读想象与本人真实观察分别记，参考图卡或模型不代实际经历。'],
 ['原创观察卡只给绿色身体与蓝色翅边，能补红嘴作为已经观察到的信息吗？','不能，除非当前材料另给红嘴；可提问题但不能靠熟悉原文补成新卡事实。'],
 ['母亲告诉作者鸟名，是哪种信息来源？能忽略来源改成自己早就认识吗？','是他人告知，叙述中来源保留，后来认识不倒改成初见时已确定。'],
 ['原文说没一会儿，能据此写为刚好五秒并当已测量结果吗？','不能，无精确时距测量，快的描述和量化事实不同，不伪造数字。'],
 ['看过动作示范后再排对五词，怎样记录帮助和首答？','原首答与所见示范、改后分别留，排对不恢复最初未见资格或证明新保持。'],
 ['各写当前一项已给事实、一个疑问和一项本人仍未实际做过的观察，说明身份。','事实有原叙述依据，疑问和未做保持清楚，计划与范例不补造成已发生的本人观察。'],
]);
const file='resources/curriculum/source-lessons/chinese-g3-bird-v1.json',bytes=Buffer.from(JSON.stringify(draft,null,2)+'\n');fs.writeFileSync(path.join(root,file),bytes);
const bundle={format:'source-following-original-materials-v1',status:'editorial_candidate',sourceLessons:[{lesson:'bird',path:file,sha256:sha(bytes),source:draft.source}],teacherReviewed:false,targetAlignmentReviewed:false,scoringReviewed:false,familyIndependenceReviewed:false,automaticPublication:false,reservePolicy:'每目标每间隔仅一份拟议样题，原篇/动作/图卡示范已见不恢复未见资格；真实声音、本人原稿、课文想象与实际观察分别记。未构成充分四维库存。',groups};
fs.writeFileSync(path.join(root,'resources/curriculum/source-lesson-materials/chinese-g3-bird-v1.json'),JSON.stringify(bundle,null,2)+'\n');console.log(JSON.stringify({drafts:1,targets:goals.length,newDefinitions:5,questions:49,teacherReviewed:false,published:false,learnerEvidenceCreated:false}));

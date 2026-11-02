const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=f=>JSON.parse(fs.readFileSync(path.join(__dirname,f)));
const source=JSON.parse(fs.readFileSync(path.join(root,'resources/curriculum/chinatextbook-primary-v1.json'))).books.find(s=>s.sha256.startsWith('349949e1')),extracted=JSON.parse(fs.readFileSync(path.join(root,source.extractedPath)));
const notes={
38:'Recycle1听音涂色与看图颜色/身体词判断；无音频不从已印颜色反推听音答案，角色服装不是本人身体事实。',
39:'Recycle1蛇梯游戏，格图有文具、身体、问候与字母；上梯下蛇为本游戏规则，棋位不代每项本人回答或掌握。',
40:'Recycle1大小写字母配对、写读和问候歌曲；动物图辅助字母匹配，不将歌中姓名作本人或扩展动物全当核心词。',
42:'Unit4右跨页，动物玩具与What’s this问答；塑形或玩具所指和真实动物分别说明。',
43:'Unit4 A部分this询问手影，猜bear后发现Zoom；手影、猜测、明确揭示及动物声音游戏分开。',
44:'duck/pig/cat/bear/dog五词与手影、儿歌；拟人或押韵情境不能当全部真实动物固定行为。',
45:'Jj至Nn：jeep/jump、kite/Kate、long/leg、mum/milk、nose/noodles；字母名和示例首音分开，无音频不推听圈。',
46:'Unit4 B部分that、猜熊后明确panda、funny dog和喜欢回应；近远指称及猜问不混，表达喜欢不变动物身份。',
47:'bird/panda/tiger/elephant/monkey及zoo与模仿；模仿姿态不代真实动物或真实听辨，an elephant按当前例保持。',
48:'找J至N大小写及动物完整词计数；词牌数不自动是实物或动物只数，不按餐盘图中内容变词义。',
49:'听音编号、七种动物匹配和歌曲；动物图像可核所见，缺音频不编编号和本人听说表现。',
50:'C跟随队列故事、后加入的角色和胡萝卜线索；me随说话者改变，图上队列、号召和实际行走分开。',
52:'Unit5右跨页提供食物与致谢，图示角色和食物不代本人真实进食或偏好。',
53:'A部分I’d like请求、Here you are提供、Have some邀请与Thanks；请求不等已得到，累加点餐顺序分别核。',
54:'bread/juice/egg/milk四词与I’m hungry及吃喝活动；语言角色不代本人饥饿、实际进食或饮食建议。',
55:'Oo至Tt及on/orange、pig/pen、queen/quiet、rice/red、six/Sarah、tiger/ten；q示例为qu词，不简化成所有词独立q规则。',
56:'B部分Can I have请求、给与致谢/You’re welcome；食品图片支持角色练习，不要求真实提供或吞咽才算语言回答。',
57:'water/cake/fish/rice与饮吃切指令；fish在此餐食语境和动物意义分别核，动作语言不强制现实操作。',
58:'找Oo至Tt与完整食物词计数；字形和完整词、物品与容器数分清，不把词牌当真实食量。',
59:'听音二选一、菜单图词匹配与野餐歌曲；没有音频不确定听音选择，图词识读不证明听过歌。',
60:'C餐厅连续请求、提供与猫偷鱼图示；Coke/ice cream为本故事扩展，角色想要与实际收到及变化按图文分别核。',
62:'Unit6右跨页礼物、祝福和计数情境；生日祝愿不是本人生日档案或实际庆生活动。',
63:'A部分This one指所选蛋糕、How many plates问盘数与计数；one此处代当前对象，不把盘数等同年龄。',
64:'one至five与顺倒数活动；数词顺序、物品数量和动作轮次不同，不把念到某数当有对应数量。',
65:'Uu至Zz：umbrella/under、vet/vest、wet/water、fox/box、yellow/yo-yo、zoo/Zip；x明确在fox/box末尾，不编成统一词首例。',
66:'B生日祝福、brother介绍与How old年龄问答，角色数字卡年龄不是学生真实年龄或家庭关系。',
67:'six至ten与年龄例、手势数游戏；给定角色年龄及手势含义不推广到所有文化或本人实际资料。',
68:'找Uu至Zz，鸭子数量与数词匹配；按实际完整对象核，不以标签序号代计数。',
69:'听音正误、猴子铅笔尺子鸡蛋看图数量和歌曲；无音频不推正误，当前可见计数与听说和实际点烛分开。',
70:'C礼物、生日惊喜和蜡烛故事；很多蜡烛不足自动推出精确年龄，故事玩笑不作本人年龄评价。',
72:'Recycle2六组听音二选一及动物/食物词分类；无音频不答听辨，fish按食物语境，分类规则不能由外框形状独自推。',
73:'Recycle2蛇梯综合游戏覆盖数、词、情境问答及字母；胜负不代各人独立回答，原活动规则保持。',
74:'Recycle2补全26字母大小写配对与字母歌图示；字母名、字形、词中音分别核，x图为fox尾字母。',
76:'附录1第二页含unit4 panda/zoo/funny、unit5八食物、unit6十数词与brother/plate；黑体听说认读与白体听说不同，参考不计教学进度。',
78:'附录2第二页L至Z索引、mum/mom变体、数词和词义；为参考词表，不把音标印刷与本人实际发音或全部语义掌握合并。'
};
const rows=new Map();function add(p){const old=rows.get(p.physicalPage);const normalized={physicalPage:p.physicalPage,image:p.image,imageSha256:p.imageSha256??p.sha256,textSha256:p.textSha256,visuallyReviewed:p.visuallyReviewed,statements:[p.statement]};if(old){assert.equal(old.imageSha256,normalized.imageSha256);assert.equal(old.textSha256,normalized.textSha256);old.statements.push(p.statement);}else rows.set(p.physicalPage,normalized);}
for(const name of ['reviewed-all-first.json','next-colours-source-reviewed.json','next-look-at-me-source-reviewed.json'])for(const p of read(name).reviewed)add(p);
for(const [page,statement]of Object.entries(notes)){const image='physical-'+page+'.png';add({physicalPage:+page,image,imageSha256:sha(fs.readFileSync(path.join(__dirname,image))),textSha256:sha(Buffer.from(extracted.pages[+page-1].text)),visuallyReviewed:true,statement});}
const reviewed=[...rows.values()].sort((a,b)=>a.physicalPage-b.physicalPage);assert.deepEqual(reviewed.map(p=>p.physicalPage),Array.from({length:82},(_,i)=>i+1));
for(const p of reviewed){assert(p.visuallyReviewed);assert.equal(sha(fs.readFileSync(path.join(__dirname,p.image))),p.imageSha256);assert.equal(sha(Buffer.from(extracted.pages[p.physicalPage-1].text)),p.textSha256);}
assert.equal(sha(fs.readFileSync(path.join('H:/ChinaTextbook',source.repositoryPath))),source.sha256);
const report={at:new Date().toISOString(),method:'agent_visual_review',sourceSha256:source.sha256,extractedSha256:source.extractedSha256,sourcePages:82,reviewed,allPhysicalPagesVisuallyRead:true,publicationYear:null,copyrightAndApprovalYear:2012,curriculumStandardYear:2011,directoryInstructionalEntries:8,referenceEntries:3,instructionalEntriesWithCandidateDrafts:2,remainingInstructionalDrafts:6,teacherReviewed:false,originalAudioObtained:false,allTeachingActivitiesDelivered:false,allPedagogicalOrScoringReviewCompleted:false,sourceOriginalImagesAndFullTextLocalOnly:true};
fs.writeFileSync(path.join(__dirname,'whole-original-visual-review-first.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({sourcePages:82,allVisuallyRead:true,teachingCandidateDrafts:2,remainingDrafts:6,teacherReviewed:false}));

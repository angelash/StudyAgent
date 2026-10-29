# 147 对话练习、原因验证、指导计划与复盘的实施规格

状态：实施前设计。承接[143的D层](143-assistant-messages-to-learning-artifacts.md)及[146来源白板](146-conversation-sourced-whiteboard-teaching.md)。记录基线e376762e；该基线的新完整API/501浏览器仍在冻结运行，本文不改其源码、编译、模型配置或测试输入。正式站点为schema22，C3/schema23尚待精确CI及实际交付。

## 1. 核心体验与测量边界

从一段已保存解释进入“练一练”，先核对讲了什么、练习目标和题目依据。学习者先分类/选择/作答，再说明判断依据，保留首次回答，之后才提供针对这一步的反馈、反例和新情境。这个过程接续HyperKnow已观察的“分类并说明理由”，不能用点选或阅读完成推断理解。图示、表格、公式及原代码仍走现有安全渲染和播放器。

教学练习与正式能力评测分别保留。对话、白板、讲解、闪卡、看过答案、跟随提示都属于学习及曝光；只有已审核题目、当前原子定义、冻结测量规则和符合资格的独立首答才能进入现有量化报告。对话自述只提供待核查线索，不能生成正式证据ID。原因分析显示观察事实、表层假设、深层假设、对照问题、可能替代解释及复盘条件；保持不足必须等待真实时间间隔。

成人讲座也能有匿名练习和解释反馈，但其目标可以是课程目标文本而无正式atomId，不借用小学数学默认范围。学生课程与档案年级分开；目标必须落在本人已确认范围。由家长把成人私聊转给孩子时，必须单独明确选择目标孩子和原子点、核对年级与可见教学预览，不隐式附会同一课程或修改档案。

## 2. 已核对的实际实现及可复用落点

- [AssistantArtifactService](../../apps/api/src/modules/ai/assistant-artifact.service.ts)已经提供本人来源选取、完整20条/关联问题/18000预算、原消息SHA、原课程/讲座及安全引用。当前公开kind严格是verbatim_note；来源白板有独立schema，不能把新练习kind伪装成现有公开笔记请求。
- [WhiteboardQuestionService](../../apps/api/src/modules/learning/whiteboard-question.service.ts)处理对白板的追问和讲解，不是确定性测量题库。它的原任务/回执/教学版本/图片声音可复用，但不能把生成解释直接算作练习评分。
- [CurriculumService](../../apps/api/src/modules/diagnostics/curriculum.service.ts)的eligibleMeasurements核对题目、来源、原子定义、答案协议、审核状态及当前可用性。D1只通过这个入口取候选，不能扫描questions全表后自行宣称有测量资格。
- [DiagnosticsService](../../apps/api/src/modules/diagnostics/diagnostics.service.ts)已有scope、微测目标数、前置闭包、题族身份、曝光排除、首答、冻结正文/答案、原因验证蓝图及到期复测。验证/复测拒绝已见题；保持核查要求真实到期。D层不建立第二套分数或掌握计算。
- [LearningService](../../apps/api/src/modules/learning/learning.service.ts)已有PracticeSession/PracticeAttempt、完整题目快照、可恢复答案、提示、确定性评分、来源报告及历史读取。当前正式start从active指导计划/action出发；错题本有自己的origin。新来源练习需显式扩展origin并提供真实创建关系，不能造一个空计划或错题本ID来绕过。
- [GuidanceService](../../apps/api/src/modules/diagnostics/guidance.service.ts)从本人孩子completed评测及当前report version建立proposed计划，检查知识定义、计量/题族版本、真实证据和原因假设；现有[模型建议任务](../../apps/api/src/modules/diagnostics/guidance-model.service.ts)已经固定模型、复核、采用和原任务恢复。对话指导接入它们，不允许用聊天文字代替baselineSessionId。
- [StudioStudyPlan](../../apps/api/src/modules/learning/studio-study-plan.ts)与LearningService已有排期预览/指纹确认和内部日历创建；[StudioIntegrationService](../../apps/api/src/modules/learning/studio-integration.service.ts)已有ICS及事件维护。排期成功不代表能力改善。现有builder在无空档时保留一个冲突起点，新来源排期须先让用户明确处理冲突，不能沿用该回退直接提交。

上述是源码核对，未在当前完整回归的合成账户里插入额外D层数据；不声称新端点已实际HTTP验证。学校原生OAuth/租户/回写、计费、Marketplace继续排除。

## 3. D1只读来源与目标预检

计划端点为POST /ai/assistant/sessions/:sessionId/artifacts/practice/preflight，尚未开放，不计入现有443接口。严格输入包含selection、objective、audience（adult或student）、student受众明确的studentId/subject、1～3个targetAtomIds，以及是否允许旧来源。模型仅在后续真正需要生成教学候选时选择；D1不调用模型、不新建记录、任务、曝光、练习或日程。

来源适配复用本人完整origin读取。若提取内部通用来源builder，必须以原笔记/来源白板的完整指纹与原回执证明兼容；公开旧kind和错误语义不扩宽。D1独立计算protocol、完整来源、目标选择、scope version及知识定义SHA的指纹，来源SHA与正式能力证据分别命名。预算不足返回完整选择/实际长度/减少选择入口，不截断原文塞入短prompt。

成人受众返回课程目标与独立练习方式，formalMeasurementAvailable=false；不凭关键词附加atomId。学生受众先验证本人原会话、本人目标孩子权限、当前scope及版本。原会话本来绑定孩子时不得改成另一孩子；成人null来源跨受众仅允许有权监护人明确选择并显示完整教学投影，原私聊仍只给作者。来源9年级、档案4年级及所选点必须分别显示，目标超出已学范围即阻断并指向学习范围确认。

已映射学生目标逐点返回原子名称/当前定义、教学目标与映射说明、已审核题量/独立题族数/呈现可用性、已曝光数和当前覆盖缺口；不返回标准答案或可直接刷取的正式核查题。现有正式评测in_progress/paused时允许读取原来源和历史练习，阻断面向同一孩子的新练习生成/启动/提示答案，并提供原评测精确链接及明确重新核对入口。预检解除阻断不自动发送原命令。

D1验收使用匿名本人/另一监护人/学习码主体，覆盖普通对话、成人讲座、资料课、九年级课与四年级档案、旧课程、70条外来源、关联20条边界、完整预算、无引用、来源变更/删除、当前评测及权限撤回。当前集合逐SHA保持，模型调用和新集合写入为零。SQLite和实际PG均运行真实HTTP，不用纯schema测试替代。

## 4. D2教学练习候选及明确采用

D1通过后再实现严格assistant-practice-artifact-v1。保存origin、目标及定义、固定模型、原输入/内容指纹、生成/复核checkpoint、原draft ID、原命令回执、逐题来源映射、状态与revision。计划新增assistantPracticeArtifacts和对应原创建唯一索引；schema24仅在schema23来源白板完成交付后推进，未知24仍应被当前23读取器拒绝。集合命名以实施前最终注册检查为准，不先加空集合宣称完成。

学生第一层复用已审核bank题，按明确目标及时间形成2～6题候选；预览前须区分只显示覆盖摘要和实际显示题干。实际显示题干即记录曝光，答案展开另记answer_revealed，不能到提交时才补写。保留原question ID/版本、题族身份、原子定义/分量绑定、answer schema、完整渲染快照及图表身份。换题保留已曝光题及原首答，不覆盖旧题目快照。

成人讲座或bank缺口可通过固定模型生成待核对教学候选，包含题干、任务、理由提问、解释/评分依据、误区对照和逐题sourceMap。正文生成与复核分开，uncertain保留原稿，取消/恢复沿原task fence。模型输出不能自行设置approved、标准分、独立证据、置信度阈值或正式题族；自由解释题无法核对标准答案时标记待人工核查，不能给确定性正确分。正式能力题发布继续走现有教研审核门槛；AI复核不替代教师审核。

UI复用WorkspaceDialog、原模型选择器与当前来源选取/原稿/本机多副本能力。开始前展示“练习及理由”而不展开答案，逐题给出输入、保留首次回答、明确提交/下一题、当前提示状态和返回原消息。反馈定位这一步的条件和反例，再提供不同情境；不一次铺满答案。图片采用已有真实资产或独立生成/预览/确认流程，模型文字描述不当作图片；表格整行、字幕完整句、板书逐item。

采用事务原子写入私有artifact确认及原回执。成人/监护人自练保存独立的本人教学会话，不伪造studentId/atomId/planId。给孩子的内容先明确预览后保存assignment；孩子本人真实开始时，再按每个原子点创建独立PracticeSession及原开始回执，扩展origin=assistant_artifact与确切assignment/artifact教学快照。不能把1至3个点的答案统记到一个atomId，也不能因家长预览就写孩子作答或曝光。完整私聊不进入面向孩子的练习DTO、分析、日历或模型图片prompt。共享监护人可见孩子的合法练习记录时仍不可读作者私聊；作者删除时按明确教学保留协议清除私有origin并对教学副本脱敏，不能用共享壳留存应删私聊。

## 5. 首答、提示与正式证据接续

答题复用answer-draft-v2、原input mode、当前版本fence、原request key和内容哈希；丢响应先读原receipt，不换键重复作答。多选未完成、排序/连线/拖拽、公式、几何、录音和图片均沿既有输入资格；不支持的设备/工具不假装可用。重复答、提示后答、答案已展示、人工纠正与独立首答分别保留，原首答不可覆盖。

教学训练的观察可用于生成待验证线索和选择下一步，不能混入DiagnosticResponse或增加MasteryEstimate。若有正式已审核映射，要从现有diagnostics独立新评测入口执行，重新取当前scope、定义、曝光及测量版本；不能把当前练习答案转换成正式首答。已见question/family及聊天里可确定的相关曝光进入排除；无法确认语义重复时不能声称独立性已经充分验证。

原因验证复用现有hypothesis/verificationBlueprint：同点不同条件、去掉语言负荷后的对照、前置点探针、表征变化与迁移题分别检查。反馈显示哪些证据支持/反驳/尚不能区分假设，保留替代解释。一次答错不能直接诊断粗心、注意力或能力障碍；真实保持需到期新题，不能改日期模拟成真人效果。

## 6. D3从对话线索到正式指导

新增指导来源意图只保存本人origin和用户明确的困难描述，内容按观察/假设/验证/行动分开。学生无completed且兼容的当前报告时，仅给“先核查这些点”的待验证任务及原评测入口，不造正式指导计划。已有报告时展示精确baselineSessionId/report version、原子定义、真实证据ID和假设状态，与对话线索分栏。

监护人明确选报告及时间后调用GuidanceService原proposed创建；固定模型可通过现有GuidanceModelService异步建议/复核/采用，不能绕过原权限、定义变化、报告修订和request key。源线索存在不保证原报告支持该原因，模型必须指出缺口。计划的重新启用、修改、暂停、完成及复测继续保留原版本；完成一次安排不提高掌握。模型不可用时保留已有规则计划和原模型失败原因，不能把规则结果标成模型成功。

## 7. D4明确排期与日历复盘

正式指导和个人学习排期分别显示。先读当前内部/ICS忙碌时段、设备时区、每天分钟、起止日期及原计划版本，再预览具体任务与冲突。冲突须用户选择改时间/减少任务/明确保留冲突；无可用空档时保持预览未确认，不静默创建回退事件。

确认命令冻结原计划/来源/日程版本、全部具体时段与指纹，事务内再次核对当前权限/计划/冲突后原子创建事件和采用回执。若复用现有Studio排期服务不足以支持本人原键同内容/异内容、跨作者归属和冲突强制确认，先补齐这些实际落点及兼容验收，再接新来源入口。禁止仅给现有create套一层链接后宣称完整接通。

日历只带合法教学摘要、原计划ID及应用内任务链接，不带私聊原文/内部prompt/正式题目答案。ICS导出维持原UID及时区协议，刷新外部ICS不冒充学校OAuth回写。打开事件到具体任务后保持原作答及当前位置；完成/未完成/跳过与延期分别记录。到期复测启动现有review任务，报告同时显示任务执行与新独立证据；不能用勾选完成代替保持率。

## 8. 全程授权、回执与恢复

来源、目标和当前登录会话在预检、创建、worker前后、编辑、采用、图/声音迟到及排期提交前分别核对；本人原会话撤回、孩子权限失效、源变更或评测开始时保留合法只读稿与完整本机输入，拒绝新写入，不自动切换来源或账号。私有列表有界游标，不把全文塞入列表。

SQLite/PG迁移、最新删除账本、本人隐私导出及作者/孩子删除与实际停止后原生备份恢复同批实现。恢复前校验origin/作者/目标/逐题映射/实践会话/采用回执的双向关联；未知协议、跨作者、伪造approved或重算bundle后仍错误的关联必须拒绝。旧回执恢复后仍只返回原结果，不能复活已删除来源。旧schema23读取器实际拒绝24；不靠类型断言证明降级安全。

## 9. 分层实施顺序和退出条件

D1：只读范围预检、精确当前资格、严格来源与覆盖摘要；纯逻辑+SQLite/真实PG HTTP、无持久副作用。D1先完成后更新总册，不开放空壳创建。

D2a：已审核bank教学候选/采用、完整实践输入/首答/提示/曝光、两实例回执及schema24恢复；D2b再加入成人和缺口的AI待审候选及理由反馈，严格保留非正式资格。D2不是一次泛化模型调用。

D3：对话线索→真实兼容报告→现有正式指导/模型建议→明确采用；分别覆盖无报告、有修订报告、定义改变、旧版本、模型失败及另一监护人。D4：冲突预览/确认、具体事件往返及真实到期复测，最后串联完整闭环。

每层先提交具体schema/端点/实际代码落点，再动实现；新代码进入独立worktree，不修改当前正在完整回归的冻结候选。每层保留首轮失败、源码/构建/截图/trace哈希，并执行相称类型、完整API、整站浏览器、双库、精确CI及可回退主目录交付。推送前所有此前CI须终态，不取消正在运行的CI。

功能通过、内容正确、教师审核、逐像素/DPR、真实声音/实机及长期真人学习分别验收。本文不增加原72的implemented/verified数，M1～M7及105整体active；没有新端点、schema24迁移、真实供应商调用或正式学生学习写入。


## 10. D1首层的具体接口与代码落点

本层只新增POST practice/preflight，HTTP200；请求audience严格区分{kind:adult}与{kind:student,studentId,subject,targetAtomIds}，学生点数1～3且唯一。另有完整selection/objective、acknowledgeHistoricalSource和acknowledgeAudienceTransfer两个默认false确认。拒绝正文、任意模型/证据/分数、重复点及未知字段；没有创建/采用接口或新持久集合。

新AssistantPracticePreflightService/Controller位于LearningModule，复用AssistantArtifactService.readSource与stableAssistantWhiteboardOrigin，不改变原笔记kind、指纹或存储。学生只放行精确新POST预检路径。成人受众只允许成人未绑定孩子的原会话；学生绑定原会话不得转另一孩子/学科，成人null来源到孩子必须本人监护权限并明确transfer确认。先核对本人来源，再读目标权限，避免外人借目标ID探查私聊。

学生目标必须存在于当前已确认scope，定义学科/年级/学期符合原范围；课程学科或课程年级与scope冲突则阻断，原profile年级独立显示且不修改。精确当前学生评测保护对家长目标也生效，原来源/历史读取不改。scope缺失给范围确认入口，不默认数学或默认档案年级。旧源确认不恢复旧对话发送资格。

每点只返回当前定义SHA及教学目标、审核可用题数、已曝光题数、未曝光题数和未曝光题族数。曝光复用正式诊断快照、训练题ID及originalPaperExposure；题族用canonicalFamily/FAMILY_IDENTITY_VERSION，不把同题族别题当独立结构。所有题目取eligibleMeasurements，响应不带题ID/题干/答案/候选正文或真实evidenceId。缺少两个可用未曝光结构时明确覆盖缺口，不补题冒充已审核。

sourceFingerprint基于完整稳定origin，整体fingerprint另绑定原输入、当前scope完整SHA、选中定义和全部候选映射/题目内容身份/题族/曝光身份；即使题量不变但题目或定义替换也会变化。18000预算核对完整来源及目标摘要，不裁切；D1不向模型发送任何内容。返回形式明确isTeachingOnly=true、formalEvidenceCreated=false、creationAvailable=false；可用预检只表示当前范围已核对，不显示假生成能力。

实际SQLite/PG用同一组HTTP测试，验证匿名来源、成人到孩子确认、同孩子跨监护私聊、超限全文、范围/9与4年级冲突、严格输入、当前原子及候选替换指纹、实际学习码暂停评测、无正文泄露及全部业务集合SHA不变。测试生成匿名已审核小题包；模型reply/structured均spy零调用。失败逐轮保留。D1不发布schema24，不将其冒充D2完整练习或正式测量。


## 11. D1只读预检的本地结果

7cf76c56具体规格先于实现。新POST practice/preflight实际接通，来源及目标均服务端重建；成人匿名来源、明确孩子/学科/1至3原子点、旧源和跨受众确认、当前范围/9年级课与4年级档案、学生/监护人暂停评测保护和私人会话隔离已实现。返回完整原文及已审核覆盖摘要，不包含候选题干/答案/评分配置；题族/曝光以当前与冻结身份核对，指纹同时绑定原文、scope、知识定义及全部候选身份，题量不变的映射替换也会失效。

SQLite第二轮两文件18/18、实际PostgreSQL首轮同两文件18/18全部通过，均无跳过；10新预检和8原来源兼容的范围重叠不相加。8最终改动输入逐SHA保持。每次预检前后实际数据库全部业务集合SHA一致，原模型reply/structured均零调用；真实学习码、真实暂停/终止评测与保留曝光检查在隔离合成账户执行，不产生正式学生学习证据。见[完整原件](../evidence/2026-10-29/assistant-practice-preflight-first/receipt.json)。

原SQLite10项首轮9通过/1测试准备失败：创建独立会话时误带孩子/学科，服务器正确400拒绝，未进入严格输入断言；第二轮改用现有真实课程上下文后全部执行。原报告/源码和更早零测试的快照cwd准备错误分别保留，没有放宽产品限制或重试。本人contracts/config/API构建及API类型通过，实际PG独立schema在结束后清理；未安装依赖或重建共享包。新PG精确CI步骤及AI-13设计映射已接入但尚未远端运行。

本层没有D2练习生成/采用/作答UI、没有schema24迁移、没有新正式指导/日历或全量门禁。独立来源白板CUI的1790与正在运行501不包含D1，不能混用完成结论；D1完整API/浏览器/精确CI/实际交付仍待，105/M1～M7/原72整体active。


## 12. 当前范围、撤回知识点与持久队列的补充核对

复查后增加两项真实HTTP案例：已学范围从4年级变5年级时，保留原档案4年级且整体/scope指纹失效；历史scope仍保留但当前原子被撤回时拒绝预检。所有“无写入”指纹现在同时读取实际durable_tasks并明确total=0，补齐前轮只验证全部业务集合而未独立读取队列表的证据边界。产品服务代码未改，本轮只加强测试和设计文字。

新SQLite第三轮与实际PG第二轮各20/20通过，零失败/跳过；12新预检+8原来源兼容不与旧18相加，8输入SHA保持，API类型通过。原首轮9/1及零测试准备错误仍在前收据。设计总册同步14领域/133功能/444接口全映射，671源引用、4182链接和10离线页检查通过；首版生成资料先保留后更新AI-12当前多稿/1790边界文字。完整原件见[当前状态补充](../evidence/2026-10-29/assistant-practice-preflight-current-state-first/receipt.json)。

D1新的受管完整API已在本工作区冻结启动，终态前不改源码/编译/用例；独立CUI的501浏览器继续运行。完整API/浏览器/精确CI/可回退交付结论各自独立，D2～D4及全产品仍active。


## 13. D2受众、单点训练和实际作答者的实施前补齐

按实际代码复核：PracticeSession要求非空studentId/subject/atomId，现有起点是一个指导action/知识点；PracticeAttempt没有显式actorId/actorRole，submit只通过可访问孩子与可选draftFence校验，feedback会依据首答/提示/答案曝光说“独立完成”。因此D2不能把成人null受众塞进现有训练、不能造空计划，也不能仅加origin后允许监护人替孩子获得该反馈。这里修正第4节采用落点，本节仍是实施前规格，不在当前D1完整API中改这些旧路径。

D2a学生审核题分组：原1至3目标点各有2题起的明确组，合计2至6题；每题固定本组atomId和已审核版本。父级artifact保留完整来源和逐题映射，只给作者。监护人查看完整“给孩子的练习预览”（题目、预期表达、理由与反馈、目标、可见资料），明确确认后创建assistantPracticeAssignments；assignment只保存已确认教学投影/目标/发布者引用，不带私聊origin。确认只表示安排，不计学习或曝光。

孩子本人从assignment点“开始本组”时校验当前学习码授权、本人孩子、原范围/定义/审核包和当前评测，在一个事务内固定本组题目快照、创建origin=assistant_artifact的真实PracticeSession和原开始回执。每个原子点一个训练，父assignment记录多个确切session ID。孩子读取题目或看答案才记录对应曝光；现有正式排题对已创建的本人练习保守排除可以继续，但不得因家长私有预览创建孩子的practiceSession。来源版本变更保留既有历史，新的开始重新核对，不能自动换题后冒充原命令。

新来源孩子训练的提交/草稿/提示/完成，服务端必须显式确认user.role=student及authSession.studentId=目标孩子；新提交记录actorId/actorRole和subject identity，不能只信客户端draftFence。监护人可读合法孩子教学记录/管理assignment，但其自练进入本人的独立教学会话，不写孩子PracticeAttempt。新来源的反馈按教学训练性质展示，不能继承“首答即独立完成”的旧推定；看过来源解答、答案展开、家长示范及提示均独立保存，正式测量始终需要现有诊断的新题/真实身份/资格。旧记录缺actor不回填猜测作者，不把原历史批量改成正式独立。

成人与监护人自练使用新的assistantTeachingPracticeSessions（确切集合名在schema24注册前再核对），包含ownerUserId、artifact ID、固定题目投影、每题首答/理由、提示/答案展开、原请求回执及历史，不要求孩子/学科/正式atom。复用StructuredAnswerInput、安全表格/公式/代码与当前恢复组件；不通过空studentId绕过旧PracticeSession。成人“分类+理由”、不确定参考答案和未审核AI题只提供教学反馈/待人工核查，不写确定性分或MasteryEstimate。学生的AI待核对题如后续开放也用明确的未量化教学路径，不假借审核bank训练。

D2b纯正文生成先定义独立assistant-teaching-practice-content-v1：2至6题、完整题干和理由提问、2至6项分类选择或开放表达、参考解释/适用条件/反例、逐题sourceMap及用户明确目标；成人targetAtomIds为空，学生只接受已明确选择目标，模型不能添加正式证据、审批状态或分数。生成与复核各有严格schema，uncertain保留原文，无变化修订拒绝；题目模型输出只能成为待核对候选。图片仍独立原资产/生图预览确认，输出的图片文字不能当已存在图片。正文预算和来源预算分别核对，不裁切。

schema24预计新增私有artifact、本人教学会话、学生assignment三类关系，扩展现有PracticeSession来源和新来源Attempt的明确actor；先完成schema23交付后再落迁移/公开创建。双库实际恢复须验证父artifact→assignment→每组实践会话/原子→原开始及作答回执，作者删除清除本人origin/自练，孩子删除清除assignment/实践；最新删除账本重放不得复活。另一个有权监护人仍不读作者私聊。

专项验收至少包括成人null受众完整自练、家长预览/陪练不写孩子集合或曝光、真实学习码本人开始、同组同键多实例单一训练、多个目标分组不串点、家长伪造child draftFence仍拒绝、不同实际作答者不复用原请求、首答与理由不覆盖、先看答案/提示/示范的资格区别、原来源/范围/权限变化、暂停评测、双库隐私和原生恢复。先交审核bank学生路径，再接AI未审核候选和成人完整教学；任何一层不能用当前D1只读20/20或CUI1790/501替代。


## 14. D1完整API终态

包含来源白板/笔记共同基线与D1只读预检的首次受管完整API1876项中1802通过/0失败/74环境跳过，2613冻结输入逐SHA保持，测试/验证均退出0，见[完整API原件](../evidence/2026-10-29/assistant-practice-preflight-full-api-first/receipt.json)。实际PG20与SQLite20分别作为专项，不合并计数。没有D2生成/采用/作答或schema24。独立CUI501的Web源码相同但API较旧，不冒充D1完整浏览器；后续整合候选在精确远端CI重新运行全站与PG，本地主目录仍schema22。完整产品退出条件继续active。


## 15. 白板/笔记与D1的正式整合候选

0e7f3c34保留当前1802完整API输入，并整合已过CUI501及正式父分支CI的白板/笔记。新Web构建/类型与新API的来源18+笔记17共35专项全过，零失败/跳过/重试；320份Web/e2e Git内容一致，6处行尾规范化差异和7处API运行差异原样留证。3191补充输入保持，但该清单在专项启动后采集，不补称预先冻结。见[整合原件](../evidence/2026-10-29/source-teaching-integrated-local-first/receipt.json)。当前进入整合精确远端CI，不把专项或旧API的501冒充当前整站；正式schema22未变，D2～D4及整体继续。

## 15.1. 整合精确远端终态

02a350b5/40770689153的application/browser/postgres均success。Linux完整API1794通过/82环境跳过、零失败；当前整合API对应的浏览器JSON501原始尝试全部通过，零跳过/flaky/重试，已替代此前只能作兼容线索的旧API501。PG各实际专项原日志完整保留，范围不累加。见[精确CI原件](../evidence/2026-10-29/source-teaching-exact-ci-first/receipt.json)。

## 15.2. D1与来源白板的实际交付

主目录真实构建-mvGyipv2z3fkD4qMxb4x/schema23，400运行JS匹配候选，32原集合89858原记录逐ID/SHA保持。56 HTTP检查、本机/外网/新BUILD、合成自有账户原来源拒绝/私有空列表/删除及三次30秒守护观察通过；原九年级课程、四年级档案、7×32教学条目和28原图保留。1073旧运行文件及停止后一致数据库已备份，私有配置保持。见[实际交付](../evidence/2026-10-29/source-teaching-main-delivery-first/receipt.json)。本层仍是D1预检和来源白板，未开放D2练习创建/作答或schema24；D2～D4及全部产品继续。

## 16. D2b纯正文协议的实施规格

本批在独立practice-content工作区实施纯函数，不增加端点、任务、数据库集合或schema24，不调用模型、语音或生图。schema23整合候选保持冻结，正式交付和后续持久化分别验收。落点为contracts/assistant-practice-content.ts与learning/assistant-practice-source.ts、assistant-practice-content.ts及独立测试；旧D1预检保持原行为。内容协议固定assistant-teaching-practice-content-v1，任何通过结果都只是待核对教学候选，不能成为已审核题库或正式测量。

正文含标题、目标与2至6题，每题唯一ID、分类或开放表达、完整题干、理由提问、参考解释、适用条件、理由核查标准、1至3层提示和一个对照情境。分类题有2至6项，ID和trim/NFKC/空白归一/小写后的标签分别唯一，referenceOptionId必须属于本题；开放表达选项为空、referenceOptionId为null。题干与解释保留完整代码、表格、公式及换行；只裁掉字段边缘空白，不裁切正文。完整规范化JSON最多22000字符，2至6题不能仅靠逐字段上限绕过总预算。模型输出拒绝额外字段，尤其approval、score、evidence、figure/图片地址；不将对照情境声明为正式独立题族。

每题复用白板sourceMap协议，原消息必须属于此次完整已选来源，referenceKeys必须来自本题映射消息；supplementary不能带原引用。成人每题targetAtomIds为空；学生每题恰好一个已选原子点，整份题目覆盖全部明确选择的1至3点，不接受额外点、重复点或漏点。这里的点只标注教学意图，不产生掌握值。用户选择的目标定义冻结完整id/name/objective/definitionFingerprint，并与明确受众、当前scopeFingerprint及年级分开保存。

Prepared冻结完整origin、原selection和objective、两项确认、完整受众、目标定义与指纹、固定modelId/modelName及完整context。来源预算18000与正文预算22000独立；origin消息正文SHA、选择/自动带入的关联问题、来源学生/学科、目标集、定义集与scope关系均须交叉核对。输入身份包含原请求所有字段及固定模型，外层digest不能替代内部关联校验；重算外层hash也不能把未知消息、错位目标或改写context变成合法prepared。完整原文/指纹和初始输入保留，禁止在显示prompt里截掉上下文。

准备函数仅核查可离线证明的来源一致性、明确受众转换确认、历史确认、scope/目标定义及预算。它不接受D1 canPrepare作为授权，不让practice_coverage_gap遮盖成人转孩子确认；模型不可用即拒绝。Prepared及其校验器不是当前权限凭据，也不证明定义已被教师审核；后续service必须在创建、worker前后、编辑/采用和实际作答时独立重读当前用户/学习码/来源/权限/范围/评测并核对指纹。当前学生评测、撤回来源及实时权限不能用纯对象验证替代。

生成和复核提供独立严格JSON Schema。复核pass必须无问题且无修改；revised必须列具体问题并返回完整正文，重跑全部来源/目标/预算验证且canonical digest有实际变化；uncertain必须有问题、无修改，保留初稿。无效修订整次拒绝，不悄悄采用部分内容。复核只代表模型意见，不改变候选待核对性质。

作答投影仅含协议、标题、目标和每题id/kind/prompt/options/reasonPrompt；不带参考选项、解释、适用条件、理由标准、提示、对照答案、完整私聊、sourceMap或内部模型prompt。提示和答案以后通过明确动作读取，当前不新增该能力。纯协议专项覆盖完整长来源、代码/公式/表格、源与正文超限、引用越权、重复规范化标签、目标错位/漏点、伪造审核/图片字段、历史与转受众确认、外层重算篡改、projection泄露及无变化复核。使用匿名纯logic与现有来源逻辑兼容测试，保留首次失败及源码/编译哈希；不以本批通过代替D2端到端练习或整体完成。

## 17. D2b纯正文基础的本地结果

2c8d003c先提交第16节具体规格，再实现独立正文/生成与复核schema、完整来源Prepared及仅题目控制的作答投影。逐题引用只能来自本题映射消息；成人无正式目标，学生逐题单点且整份覆盖明确选择的全部点；18000原文和22000正文预算分别拒绝超限，无裁切。完整model/原输入/来源/目标定义与scope身份校验不替代当前权限，未读取D1 canPrepare，也未新增端点或schema24。

实际运行第二次准备后60/60纯逻辑及原白板来源内容兼容测试通过，零失败/跳过/重试，14源码与3编译输入SHA保持；本人contracts/config/API构建和全API类型通过。首轮API编译TS18048及原源码保留，改为显式never函数修正类型收窄；首轮runner错误假设contracts有逐文件输出，实际tsup为index.js，零测试失败单列。最终60不与此前D1双库20、完整1802或白板501累加。完整原件见[正文基础收据](../evidence/2026-10-29/assistant-practice-content-first/receipt.json)。

随后核对实际knowledgeAtomSchema发现，原子允许单字名称和both学期，而新纯协议自行定义的字段过窄；改为直接复用现有原子与scope字段，不复制一套不一致约束。新增“角/both”合约兼容案例，第三次准备61/61（44新正文+17原白板）通过，零失败/跳过/重试，15源码与3编译SHA保持；本人contracts/API构建与全API类型通过。此前60及原失败保留，不能累加为121。见[合约兼容原件](../evidence/2026-10-29/assistant-practice-content-contracts-first/receipt.json)。

再按实际AssistantCourseSnapshot与D1成人分支核对：未绑定孩子的成人资料课仍可有明确subject。纯协议保留该学科而不凭空创建孩子/正式目标；带孩子来源仍拒绝转成人。新增成人数学资料课案例，第四次准备62/62（45新正文+17原白板）通过，零失败/跳过/重试，15源码及3编译SHA保持，API构建和全类型通过；此前61单独保留。见[成人资料课兼容原件](../evidence/2026-10-29/assistant-practice-content-adult-first/receipt.json)。

本批没有持久候选、实际模型调用、本人自练、孩子assignment/作答、正式证据、指导/排期或主目录交付；D2a/D2b后续service须重新核对当前来源/权限/学习码/范围/定义与评测。schema23正式交付后才接schema24。新接口、双库原生恢复、完整API/浏览器/精确CI与实际产品验收仍分别推进，105/M1～M7/原72整体active。

## 18. D2a持久候选与本人作答的下一层具体落点

本节是下一层实施前设计。schema23实际发布并读回后才修改迁移/公开端点。先接已审核bank学生训练的完整可用旅程，再接成人及缺口AI教学候选；D2b纯正文基础不改变这个交付顺序。使用新的AssistantPracticeArtifactService/Controller与assistant-practice-record.ts，保留现有D1只读端点和来源服务，不把canPrepare或浏览器缓存当资格。

schema24新增assistantPracticeArtifacts、assistantPracticeAssignments、assistantTeachingPracticeSessions三类业务集合。artifact仅作者可读完整origin，固定protocol/contentMode/ownerUserId/sourceSessionId/原input/受众/scope与目标定义、正文及逐题映射、候选题库版本快照、revision/contentFingerprint/status和有界原请求回执。已审核bank模式不伪造modelId或模型复核成功；AI模式另存固定模型与原生成/复核checkpoint、失败及完整原稿。列表只返回摘要和游标，不带全文/答案。现有来源白板与笔记集合/协议不改变。

同一来源下新增POST artifacts/practice/candidates，仅接contentMode=reviewed_bank、D1原完整输入、preflightFingerprint、requestKey；服务重新读本人原来源、当前监护/学习码、目标scope、审核定义、eligibleMeasurements、题目内容、题族和所有原曝光。按用户1至3点各固定两题、每组两个未曝光canonicalFamily，合计2至6题；无覆盖明确拒绝，不调用模型补齐。每题保存审核mapping/atom/question/content/definition/family身份及原renderPayload完整快照。题库补充的sourceMap标明supplementary，不把题库知识冒充聊天原出处。请求键在ownerUserId范围唯一，同键异内容409，同键重放只回原候选。

GET artifacts/practice/candidates与GET artifacts/practice/requests/:key按本人来源分页/查原回执；GET /learning/assistant-practice/artifacts/:id返回作者完整预览和当前资格；PATCH该id以expectedRevision/contentFingerprint/requestKey完整编辑教学说明，不允许借编辑改题库题干/答案/atom映射而仍称审核bank。要修改题目须另起未审核AI教学候选。原快照和编辑历史不覆盖。所有创建/编辑/采用分别重读资格，历史读取不恢复写入。

POST /learning/assistant-practice/artifacts/:id/assignments含原revision/fingerprint、acknowledgePreview=true、目标孩子及requestKey；只有已核对的学生bank候选可发布。assignment冻结教学投影、每atom两题的实际bank快照、原范围/定义/题族身份、发布者及原artifact引用，绝不拷贝私聊origin/内部prompt/sourceMap引用正文。确认仅安排，不创建practiceSession/曝光/分数。作者和其他有权监护人可读合法孩子assignment摘要及任务，但其他监护人不能顺着artifact引用读取作者私聊。

GET /learning/assistant-practice/assignments支持本人孩子授权过滤；GET assignment/:id返回适合当前角色的投影。孩子POST assignment/:id/groups/:atomId/start以requestKey/assignmentFingerprint确认开始，由当前有效学习码用户执行；必须authSession.studentId=assignment.studentId且user.role=student。事务重新核对assignment/当前scope/原子定义/审核版本/评测和当前曝光，每atom只创建一次原PracticeSession；先于事务的候选快照不能抵消后来已曝光，新增曝光则要求重新核对，不静默换题。同键原回执可恢复，多实例同时开始只产生一个原session。起始题目曝光从孩子本人开始起保守排除；监护人预览和自练不写孩子曝光。

PracticeSession新增origin=assistant_artifact与assistantAssignmentId/assistantArtifactId/sourceGroupId、固定atomSnapshot及合法actionSnapshot；planId保持null，不制造空诊断计划。需要在LearningService.practiceDraftState、assertActive、view/render/draft/submit/hint/complete及controller逐一接入来源活动规则，不能只绕过其中一个plan检查。source训练由assignment状态/当前资格决定可写，旧guidance/notebook分支保持原判断。所有新来源写入显式传req.authSession，并在读回原请求前先核对实际学生身份，拒绝家长伪造draftFence或复用孩子键。

新来源PracticeAttempt显式保存actorId/actorRole=student/actorStudentId，不猜测补写旧历史。新来源hint/答案展开/示范/首答及后续修订分别记录，来源解释曝光、审核题训练与正式测量资格分别显示。view.summary和feedback为新来源展示教学首答/使用帮助情况，不沿用旧“首答正确即独立完成”的文案或指标；不写MasteryEstimate/DiagnosticResponse。既有来源缺actor继续保留未知，不批量改写。正式诊断继续独立新题与原曝光排除。

成人和家长自练的后续POST artifact/:id/self-sessions仅创建本人assistantTeachingPracticeSessions，学生不能借成人模式绕开范围。该集合固定正文作答投影和原题/参考快照、明确actor/受众、每题首次回答+理由、草稿版本、提示/答案展开时间、后续回答及原回执；不要求studentId/planId。GET读取、PATCH question/:id/draft、POST question/:id/answers/hints/solution与POST complete分别有版本/身份/原键保护，完整未提交内容可下载，刷新/双标签/断网/丢响应不覆盖首答。AI题参考始终为待核对教学解释，不编确定性分；理由反馈服务及UI另按完整生成/复核/采用规格接入后才开放。

数据库约束至少包括artifact(ownerUserId,requestKey)、assignment(publisherUserId,requestKey)和每assignment/atom唯一真实训练；每类原命令使用独立actor+key身份和内容hash，避免在不同实际作答者之间复用回执。SQLite/PG同批增加schema24最低reader marker，旧23实际拒绝24；所有新关联进入domain集合注册、隐私导出/作者与孩子删除、最新删除账本、原生备份清单及独立restore verifier。恢复核对artifact→assignment→group→practice/attempt/原命令双向身份；AI来源完整正文/消息SHA/目标/投影均重新验证，不仅依赖bundle哈希。

界面优先复用助教原消息选择和现有白板/笔记弹层，增加明确“给孩子的练习”入口：选择孩子/学科/已学原子点→完整来源与原课程/档案/当前范围分开核对→覆盖/阻断→候选逐组预览→明确安排。孩子从今日任务与原assignment链接进入本组，实际沿现有StructuredAnswerInput作答；题干、理由、提示/参考答案和反馈按明确动作逐步出现，手机保持原位置/未提交内容。新入口不展示未接通的生成按钮；成人自练完整链路未接好前保持明确未开放。

退出验收覆盖SQLite与真实PG的本人来源/监护/当前评测保护、同键异内容/丢响应/双实例、家长预览零孩子写入、真实学习码分atom开始与actor记录、参考答案曝光和首答不覆盖、范围/定义/审核题变更、另一监护人私聊隔离、作者/孩子删除及原生恢复/旧reader拒绝。浏览器验收至少包含完整桌面/手机开始作答、刷新与双标签、原键恢复及改权限/评测后保留输入。完整API/整站/精确CI与正式schema24可回退交付分别留证，不以纯正文61或D1双库20替代。

## 19. 审核题联合选题的离线基础规格

实际题库的QuestionRenderPayload可能含填空、步骤、音频和真实表格/公式，不能强行改写成D2b分类/开放表达协议。reviewed_bank模式后续使用独立assistant-reviewed-bank-practice-v1：每个明确原子点一组，两道原题/答案/评分及审核mapping快照，保留原renderPayload；AI模式继续assistant-teaching-practice-content-v1。两者均为教学候选，公开开始、作答和恢复仍按第18节实现后才接通。

本批先在assistant-practice-bank-selection.ts实现离线选择器，不新增表、持久化、端点或任务。调用方必须从实际eligibleMeasurements取得当前审核候选、从canonicalFamily取得结构身份，传入精确1至3目标、原预检SHA作为seed、候选atomId/questionId/family/mappingId和真实已见question及按atom区分的已见family。纯函数不能据此宣称来源/权限/审核已获当前授权；后续service仍在事务内重读原数据。未知目标、重复目标或同一mappingId对应不同内容须拒绝，候选与输入不裁切。

先将同atom/question映射按canonicalFamily聚合；同题存在多个不同结构身份时全部排除，不靠随机挑一个冒充清晰审核。已见题和已见同点结构全部排除。每点需两种不同family，同时整份练习的questionId不得重复。不能按每点独立贪心：独立可各选两题但可能争用同一原题。采用有界目标流图source→atom(容量2)→atom/family(容量1)→question(全局容量1)→sink，以最多6次增广求完整联合分配；稳定seed排序使相同命令与候选顺序变化得到同一结果。

未达到2×目标点数时整体返回覆盖缺口，不返回可误采用的半份题组；成功逐atom返回两个确切mapping/question/family。selectionFingerprint绑定算法版本、全部候选身份（不只最终入选）、完整曝光身份、目标顺序、seed和最终分组；题量不变但审核映射替换/曝光变化也失效。service提供的原预检SHA还必须绑定完整题干/答案/定义/范围，选择器自身不能证明题目正文或审核合法。

后续开始第2/3组时按该组当前题目/定义/范围/权限重新核对；已由同一assignment真实开始的其他组曝光保留，不因第一组合法开始就对整份D1 canPrepare重跑并封死后续组。当前组自己新增的外部曝光仍需明确重新核对，不能静默换题。离线验收包括可重分配的争用、每点足量但联合不足、同点family唯一、全局题目唯一、原曝光/歧义排除、种子及重排稳定、未入选候选改变指纹和无输入突变；不替代实际SQLite/PG、真实学习码或端到端产品旅程。

## 20. 审核题联合选择的离线结果

b436ebb1先提交具体协议与原生bank题型边界，再实现最多6次残量增广的联合选题。每点两种不同canonicalFamily、全局questionId唯一；歧义映射及真实已见题/同点结构排除；同键同输入的候选重排保持结果，未入选映射替换或曝光身份变化也改变指纹。联合覆盖不足只返回明确缺口，不发布半份题组。

首轮10/10专项、零失败/跳过/重试；8源码和2编译输入前后SHA保持，API构建与全类型通过。原D2b正文62独立留证，不把两轮相加成单轮72。见[联合选题原件](../evidence/2026-10-29/assistant-practice-bank-selection-first/receipt.json)。本层不新增API、数据库集合、任务、schema24或正式学习证据；调用方仍须从当前真实eligibleMeasurements/canonicalFamily/曝光重建输入并重读授权。原生题目/评分快照、候选/assignment及真实学习码开始/作答继续在schema23实际交付后实施。

## 21. schema24私人审核题候选的首个持久批次

schema23已按15.2实际交付，独立practice-content分支已合入5e9bea13交付记录。下面开始第18节D2a的持久实现；正式主目录保持schema23，schema24全部D2a作答/恢复验收完成前不发布。当前main归档提交CI40779065252继续独立运行，不取消或再推送覆盖。

首批开放审核题候选的创建/分页/原创建回执/本人完整读取/教学说明编辑，不开放安排或作答空壳。新contracts/assistant-reviewed-practice.ts定义严格创建输入：D1完整selection/objective/两确认/明确student受众、contentMode=reviewed_bank、preflightFingerprint及requestKey；adult审核bank拒绝，成人后续走AI本人自练。编辑仅title/instructions和expectedRevision/contentFingerprint/requestKey，不能修改冻结原题、答案、原目标或原objective。列表复用有界pageSize及来源/本人绑定游标；原回执带artifactId/操作/revision/contentFingerprint/at，不携带私聊全文。

assistant-practice-record.ts的首个记录协议assistant-practice-artifact-v1固定contentMode=reviewed_bank、ownerUserId/ownerRole、sourceSessionId/studentId/subject、完整原createInput及requestHash、bank快照、原始与当前教学title/instructions、revision/contentFingerprint、有界100条命令回执和逐版本完整说明历史。bank使用assistant-reviewed-bank-practice-v1，冻结完整origin及sourceFingerprint、原scopeSnapshot与scopeFingerprint、独立profileGrade、familyIdentityVersion、联合selectionFingerprint和每组完整atomSnapshot/definitionFingerprint。每题保存确切MeasurementItem、Question（含原答案/analysis）、QuestionRenderPayload及完整题包contentFingerprint；不将非选择题改成分类题，不伪造模型/复核成功。引用说明标为题库教学补充，非聊天原文支持；不产生掌握、正式response或孩子曝光。

创建在一次store.transaction内先核对原会话本人，再验证当前token/角色/目标孩子学习码或监护关系。原创建键重放只回原回执、异内容409；重放仍需当前读取权限，但不重新生成或写入候选。新创建重新执行D1与两项确认/当前评测检查并比对完整预检指纹，然后取当前eligibleMeasurements、canonicalFamily及诊断/训练/原卷实际曝光，调用第19节联合选择器。完整题包与scope/定义快照由服务端重建；同题量但内容/定义/审核变化不能复用旧确认。并发同owner/key依赖数据库唯一键和现有事务重试，不靠进程内Map。

读取只给当前有权的本人作者，另一个监护人不可读私聊；目标孩子权限与原登录在每次读取和回执查询重新核对。编辑在事务内再核对当前来源/当前scope与每个原目标定义、冻结题包的当前审核/内容/题族身份及当前评测；历史读取不改变其原快照，任何变化均保留原稿并拒绝新编辑。命令键包含实际actor、操作和完整内容身份；旧编辑回执不能覆盖新版本。原sourceGrade、scopeGrade和profileGrade分别显示，不修改档案。

SQLite/PG迁移24增加assistantPracticeArtifacts(ownerUserId,requestKey)唯一约束及ready-schema24最低reader标记；旧23读取器须实际拒绝24。当前reader/backup脚本必须继续正确区分旧ready、23的ready-schema23与24的ready-schema24，不能把23误当旧ready。启动、SQLite/PG原生backup/restore同用assistant-practice-integrity语义核对器，逐记录检查id/作者/原会话/目标孩子、完整源SHA与选择、scope/原子定义、审核mapping/原题/渲染题包、联合分组、正文身份与全部历史/回执；重算bundle哈希不能绕过错位关联。尚未实现的assignment/self-session数据必须拒绝读取，不能静默丢弃；后续同一未发布schema24开发批次接齐后再放行。

隐私导出只包含本人或实际学生本人创建的私人候选；监护人导出孩子资料不能获得另一个监护人的origin。作者删除清除本人候选，孩子删除清除其目标候选；adult原会话到孩子的候选也不能遗漏。最新删除账本在恢复前后重放，不能因原会话仍在而复活已删除候选。共享安排保留与私人来源删除的状态/历史规则在安排批次再具体补齐，当前不创建该类记录。

本批专项使用隔离SQLite与实际PG，至少验证完整长来源/原生表格公式题快照、同键重放/异键/并发、本人及跨监护权限、当前范围/定义/审核题内容/原消息变化、学生与家长目标的当前评测保护、编辑冲突/原回执/旧历史、零训练/掌握/任务/曝光写入、实际重启/原生恢复与损坏关联拒绝、最新删除账本及旧23reader拒绝。原失败与源码/编译SHA保留；完整D2 UI/安排/实际作答和正式schema24交付仍继续，不用本批候选完成替代整个D2。

## 22. 私人审核题候选的双库本地结果

41713d79具体设计先提交，再实现五个真实HTTP接口：本人来源候选创建/分页/原回执、完整读取及教学说明编辑。完整来源、原范围与独立档案年级、逐点审核mapping/原题/表格公式渲染/答案/定义及联合题族选择均冻结保存；历史和原命令不覆盖，当前来源/范围/审核变化保留只读稿并拒绝新写。预览及隐私导出过滤内部评分配置/来源路径，另一个监护人仍不能读取私人origin。没有创建训练、任务、正式response、掌握或曝光。

最终SQLite第四轮17/17与实际PostgreSQL第二轮17/17分别通过，零失败/跳过；两轮各681源码及418构建输入前后SHA保持，最终完整构建原件也复制并逐SHA验证。真实两个应用实例同键创建/编辑均只产生一个候选/版本并返回原回执。原SQLite首轮14通过/3失败来自测试在事务外读取旧root，改为持久快照读取后通过；原PG首轮16通过/1失败发现真实乐观写入409，新增DomainWriteConflict子类，仅对该存储冲突最多三次新事务重试，来源/版本等业务冲突不重试。所有六次尝试保留，不把重复和双库范围相加。

schema24最低reader、实际保存的精确旧23编译读取器拒绝、双库原生备份恢复、重算题包/bundle身份后仍拒绝错位关联、作者/孩子最新删除账本重放均实际执行。旧23原件SHA为0ef4fb2915d3fed93f16f91f96d21378bba6fe5335269ae866f03447a4e3584b，未改写其源码。原始失败记录与最终源码/构建通过内容寻址归档，4934条文件索引/1113个去重对象；早期409构建输入只保留原SHA与冻结源码，未在重建前另存原二进制，不能补称完整旧构建已保存。见[六轮完整原件](../evidence/2026-10-29/assistant-practice-artifacts-first/receipt.json)。

当前仍是隔离开发，正式主目录继续schema23。多点实际HTTP、安排/真实学习码分组开始/实际作答身份/首答及理由/提示曝光、成人自练与AI待核对题、完整UI尚待；现有迁移兼容测试当前版本断言、源码总册、完整API/浏览器/精确CI和schema24可回退交付仍需完成。无真实模型/TTS/生图调用，不产生正式学生虚假证据。105/M1～M7/原72整体继续active。

## 23. 多点HTTP、旧数据兼容及当前参考页面补证

新增实际三原子点/六道原生题HTTP案例，SQLite与真实PG各18/18、零失败/跳过；每点两种结构、整份原题不重复、原题表格/映射保持、原键重放和零训练/曝光/正式写入均有断言。该两轮独立于此前17项，不相加。API全类型通过。

当前兼容专项含20文件162项，SQLite第二轮141通过/21外部PG环境跳过；配置实际PG后第二轮161通过/1有意SQLite专用跳过、零失败，885源码/418构建输入逐SHA保持且全原件复制。21跳过对应真实PG迁移/旧reader/原生恢复等，PG轮实际执行了其中20项；剩余一项是原teaching-tool原生恢复案例自身仅运行SQLite，不能称双库162全过。两个首轮分别140/1/21与159/1/2：原卷恢复测试仍插入“未来24”，24已成为当前版本导致唯一键冲突；仅改成未支持25，实际23 marker失败注入和精确旧22/23读取器保持。第二PG轮另开启真实PG原卷恢复，范围变化明确留证。见[完整原件](../evidence/2026-10-29/assistant-practice-compatibility-second/receipt.json)。完整API已独立冻结启动，未完成前不改该工作区源/构建/用例。

源码总册现为14领域/133功能/449接口全映射，离线总册、源码引用及链接验证通过；五候选接口已纳入AI-13，PG精确CI增加实际候选/双实例/schema24/原生删除账本恢复步骤。完整API、浏览器、精确远端CI及实际schema24交付仍分别等待，正式仍schema23。

用户指定HyperKnow课堂已实际确认登录，当前恢复状态显示概念摘要、三列比较表、韦恩图和“情境分类+判断理由”的匿名练习；没有在该画面看到标准化能力分。设置弹层含六种说明清楚的音色及逐项试听、0.5至2倍速、手写/标准字体、点阵背景和引导重播。只打开关闭设置并截图，未发送新消息/作答、改变权限/偏好、下载资产或产生新供应商请求。截图为1600×1000，未独立量出CSS视口/DPR/原字体资产，当前静态画面不证明音画时序或完整课程像素一致。见[当前参考原件](../evidence/2026-10-29/hyperknow-resumed-readonly-first/receipt.json)。后续保留“概念摘要和分类理由”的体验，同时通过反例/新题核验原因，不能把一次分类判断直接冒充能力量化。

## 24. 下一批安排、本人分组开始与首答的具体设计

本节在当前候选完整API冻结期间仅归档设计；实现进入独立worktree，自有contracts/config/API构建，不安装或重建共享依赖。正式schema24仍不发布。按实际LearningService核对，新增来源必须同时覆盖view/render/practiceDraftState/assertActive/draft/submit/hint/complete、controller传递authSession、反馈和错题投影，不能仅给origin增加一个枚举就绕过原计划判断。

### 24.1 共享安排与私人候选分开

新增assistant-practice-assignment.ts契约、assistant-practice-assignment-record.ts和AssistantPracticeAssignmentService/Controller。POST artifact/:id/assignments以expectedRevision/contentFingerprint、studentId、acknowledgePreview=true和requestKey明确确认。服务在事务内通过本人候选当前来源/目标/scope/审核题包/曝光及当前评测核查后冻结共享教学投影；同owner/key异内容409，重放返回原安排回执。家长给孩子安排和实际学生给本人安排均保留明确publisherRole；学生不得替其他孩子安排，也不能借成人模式绕过授权。

assistant-practice-assignment-v1保存studentId/subject、已确认title/instructions/objective、scope/profileGrade、familyIdentityVersion和每点完整atom/definition/两题原生审核题包。共享题包不包含origin、聊天正文/引用、模型prompt、原sourceMap或全候选selectionInput。不能直接把含origin的reviewedPracticePortableView当共享投影。原题/答案/评分原件只在后端固定，孩子初始投影移除答案/analysis/评分配置和内部来源路径；监护人明确教学预览可以查看参考，但不写孩子曝光。另一监护人有权管理孩子教学安排，仍无权读取作者私聊。

共享记录保留不可变publisherFingerprint、artifactIdentityHash、原候选revision/contentFingerprint、payloadFingerprint和原创建回执；命令hash从这些固定身份与完整安排输入重算，不因将来删除私人origin而破坏回执。私人关联独立privateOrigin={artifactId,publisherUserId}，不输出给另一监护人或孩子。当前publisherUserId可在账号删除时移除，不能在共享命令中另藏完整私有createInput。无新formal response、mastery、reviewTask或practiceSession；确认仅安排。

GET /learning/assistant-practice/assignments按明确studentId/subject、当前学习码或监护授权有界分页；GET /assignments/:id给角色适合的教学投影。未开始组显示目标/数量/预计时长，不给孩子整组答案；已开始组链接真实session，历史来源失效显示保留原因。采用与本人开始各自有原键回执，不把本机缓存当服务端状态。

### 24.2 开始与后续组的当前核查

POST assignment/:id/groups/:atomId/start包含assignmentFingerprint/requestKey，仅接受role=student且authSession.studentId匹配目标的当前学习码会话；作者/其他监护人的访问权不能替代实际作答者。先验证当前身份，再查询原键，避免家长复用孩子命令。一次事务内核对assignment及当前组完整packet/definition/scope/题族/未曝光、当前评测、合法来源状态，固定两题快照并创建一个PracticeSession；每assignment+atom唯一，两个实际应用实例同键/异键并发最多一个组session。

不重新执行整份D1 canPrepare或联合重选；第一组开始产生的合法曝光不能封死第二/三组。当前组只接受自己确认的两题及版本，外部新曝光、审核撤回/改题、范围/原子定义变化拒绝尚未开始的组，保留原安排并要求重新核对，不自动换题。当前授权和原来源完整性在后端检查，不向孩子回传私聊正文，不伪造作者authSession或要求作者一直在线。

新PracticeSession.origin=assistant_artifact、assistantAssignmentId/sourceGroupId、atomSnapshot/actionSnapshot及固定两题快照；planId=null，actionId是确定性组ID，不制造诊断计划。开始回执只含assignment/atom/session ID和固定指纹。可读共享历史与当前可写资格分别处理。授权仍在的孩子已经合法开始后使用原快照完成教学，后续题库更新不换题、不宣称当前审核或正式测量；当前评测继续阻断教学写入。手动撤回安排或孩子权限失效时只读保留输入，任何返回原回执也先核对实际身份。

### 24.3 首答、理由和帮助分别记录

LearningController现有练习view/render/draft/submit/hint/complete向LearningService传入req.authSession，新来源每次写入显式校验真实孩子。原guidance/notebook分支及旧记录保持兼容；新来源的旧协议提交不能省略actor验证。PracticeAttempt新增可选actorId/actorRole/actorStudentId及learnerExplanation，新来源强制非空实际student；旧记录缺actor保留未知。learnerExplanation独立于现有grader生成的reason，不覆盖同题第一次回答和第一次理由；后续订正另存attempt。

新来源专用严格draft/response协议同时携带答案、理由、原版本/身份/请求键，不能把理由悄悄塞进StructuredAnswer而改变评分。复用现有原生StructuredAnswerInput和确定性grader；首答的题干/评分依据来自冻结快照。答案协议支持的语音/图片仍按实际资源授权/原件SHA验证，不能凭URL当附件已恢复。

新增有界幂等帮助事件（hint/solution/guardian_demonstration），保存actual actor、question、时间、原键；reference answer/analysis只在实际答后反馈或明确solution动作出现。查看参考、使用提示、监护示范与首次作答分开记录；render本身不默认展开答案。session创建即保守进入现有正式排题曝光排除，之后逐题动作仍保存真实帮助记录。家长预览/陪练不写孩子Attempt；家长自己练习走后续本人teachingSession。

新来源feedback明确为教学练习，summary提供teachingFirstPass及帮助情况，原independentFirstPass不为此来源计数；不沿用“首答正确即独立完成”文案，不写MasteryEstimate/DiagnosticResponse。错题本可记录该教学首答与冻结atom，但来源/理由/帮助必须明确；不能据此自动生成标准化能力结论。完成要求每题有本人回答或明确跳过，保持首次证据与原完成回执。

### 24.4 删除、恢复与独立校验

孩子删除通过studentRecords清除共享assignment、组session、attempt、help及相关命令；作者删除仍清除全部私人artifact/origin。若孩子由另一监护人保留，合法共享题包和已开始真实训练保留，privateOrigin移除、publisher身份匿名化，未开始组标记source_unavailable并阻断新开始；已开始组按固定快照继续本人教学，不依赖已删除私人artifact。完整共享说明曾由作者明确确认给孩子及合法监护人，不在这里复活原私聊。

冷恢复不能要求每份共享安排永远有私人artifact。active关联必须核对实际artifact/作者/目标/内容；detached关联必须有匹配account_delete隐私回执及该孩子retainedStudentHash，且已无privateOrigin，不能只改一个布尔标志绕过验证。原不可变publisherFingerprint/原artifact内容身份及共享payload/command哈希继续可重算；用户删除重放使用同一个removeSelected/anonymizeSharedAttribution路径，恢复前后都不能复活私人关联。最新child删除同样清除旧备份中的共享历史。

schema24尚未发布，下一批同一开发迁移补assignment创建键、assignment+atom唯一关联、帮助请求键与完整关联注册。SQLite/PG启动及原生backup/restore核对器增加assignment、practiceSessions/attempts/hints/help、privacyRequests，并逐组双向验证固定题包/目标/session/actual actor/首答顺序/原命令；未实现的成人teachingSession仍显式拒绝。损坏关联即使重算内部及bundle哈希也拒绝；真正旧23读取器继续保持原始字节并实际拒绝24。

### 24.5 界面与退出验收

复用助教来源弹层，接“练习”入口、孩子/学科/1至3已学点选择、完整来源核对、覆盖缺口、逐点两题原生预览、教学说明编辑、明确安排和原请求恢复。孩子今日任务/安排页明确每组“开始”，完成当前组后保留第二/三组入口；题干、理由、帮助/参考与反馈逐步呈现，手机不堆满参考答案。原画面HyperKnow的“情境+判断+理由”用于未审核教学题体验，审核bank保持真实原题类型；不把两套内容互相冒充。

验收包含实际SQLite/PG三点分组HTTP与两个应用实例、学生/监护人/其他孩子/另一个监护人、开始前零孩子曝光、第二三组不误阻断、真实学习码、家长伪造draftFence仍拒绝、首答及理由不覆盖、提示/参考/示范区别、原生表格公式及真实图片/语音附件原生恢复、旧schema23拒绝、重算损坏关联和最新删除账本。浏览器需桌面/390px完整安排与本人作答、刷新/断网/双标签/丢响应和当前评测/权限变化保留输入。完整API/整站501及精确CI/可回退schema24交付分别执行；D2b成人/AI、D3原因指导、D4日历和105剩余范围继续，整体不标完成。

## 25. 共享安排首个持久批次的范围补充

第24节设计已随83af7e15先行提交推送，下一批实际代码在独立StudyAgent-pa/feat/assistant-practice-assignment-20261029实施，未混入正在冻结的候选完整API或远端40790308484。工作区首建因Windows历史证据长路径失败，原日志保留；新短路径以单次Git core.longpaths参数重建，285外部依赖只读引用，自有3个workspace包独立构建，没有安装或重建共享依赖。

本批先接明确安排、按孩子/学科有界列表及角色适合的读取三个接口；学生的初始安排读取只给目标与题量，不给题干/参考答案，监护人预览保留原生题型和表格公式。没有分组开始/作答空壳，startingAvailable=false；后续真实本人开始/首答/理由/帮助、今日任务与完整UI按24.2至24.5继续。安排创建仅parent/student/admin，teacher/operator不能凭角色名直接创建。完整来源、当前范围/定义/审核/曝光/评测保护仍由原候选在事务内重建；新安排不新建学习会话/曝光/正式证据。

共享payload与原始命令身份独立于可移除的privateOrigin；作者删除在removeSelected移除私人候选时统一断开存活安排的publisherUserId/privateOrigin，并保留不可变共享题包和回执。anonymizeSharedAttribution不递归改写共享packet，否则会破坏冻结哈希。一般监护人删除后，冷恢复必须匹配account_delete及该孩子retainedStudentHash；内部admin本来无绑定孩子且其既有删除回执不列retained children，此时允许匹配其原publisherFingerprint的account_delete、孩子仍存在且未列入erasedStudentHashes，不伪造额外保留名单。学生发布者随孩子删除则整份安排清除。该例外不恢复私有origin或未开始资格。

启动和SQLite/PG原生backup/restore将privacyRequests纳入同一个关联核对：linked必须匹配实际私人artifact、原作者/角色/目标及原revision说明的完整共享payload；account_deleted必须已无私人关联且有相符合法删除回执。即使重算关联哈希/外部bundle哈希，凭空缺失artifact或假detach也不能获准恢复。尚未实现的成人teachingSession仍显式拒绝。当前schema24未发布，不把此持久安排批次当完整D2。

## 26. 私人候选完整API与共享安排的双库结果

83af7e15私人候选版本的完整API1949项中1875通过/74环境跳过、零失败，885源码和418构建输入前后SHA保持并保存原件；见[完整API原件](../evidence/2026-10-29/assistant-practice-candidates-complete-api-first/receipt.json)。冻结时Git基线是f8289f6e及当时未提交的兼容测试，随后83af7e15归档提交，运行前后实际885输入未变；该轮不包含独立共享安排和后续privacy-ledger修复。远端83af7e15/40790308484的application/browser/postgres仍分别执行，未推送新提交取消它们。

共享安排在83af7e15第24节设计之后实现三个HTTP接口、严格共享payload/原回执、角色投影、双实例原请求、当前评测阻断、schema24唯一约束、隐私导出/删除和双库冷恢复。审核原题/表格公式/映射保持，未开始孩子只看到目标和题量；另一监护人能查看共享教学但不能读私聊。新的实际学习码案例允许本人安排九年级化学教学、保留四年级档案；没有创建PracticeSession、掌握、正式response或曝光。

最终SQLite第二轮25/25与实际PostgreSQL第二轮25/25分别通过、零失败/跳过，685源码/422构建输入逐SHA保持并复制完整原件。首SQLite23通过/1失败是测试构造冷核对输入时未将不存在的空privacyRequests当空数组；首PG22通过/2失败另发现真实原生删除账本写回问题。PG读取的原始body对象被直接放入可变工作store，移除privateOrigin时同步改变了用于比较的原件，导致SQL写回可能被错误略过；privacy-ledger现将对象body先structuredClone。最终实际PG作者/孩子账本恢复验证共享孩子、原题/原回执保留、私人关联去除和孩子删除，修复不是只放宽冷验证条件。凭空缺artifact和假detach在重算内部哈希后仍拒绝。

首类型构建的role union错误日志保留，未在修正前单独保存完整源码/构建快照；不能补称该编译失败也有完整二进制。两次HTTP失败与两次最终25轮均有完整冻结源码/构建，原件扫描及归档见[共享安排四轮原件](../evidence/2026-10-29/assistant-practice-assignments-first/receipt.json)。所有轮次不累加，无真实模型/TTS/生图或正式学生虚假学习证据。

本批仍没有孩子分组开始/答案草稿/首答理由/提示示范/完成与今日任务UI，startingAvailable=false；未实现的成人自练集合继续显式拒绝。共享安排和privacy-ledger改动还须自身完整API、旧原生恢复兼容、整站/精确CI及完整schema24交付，不能复用上一候选1875作为新安排的完整门禁。正式schema23保持，24.2至24.5、D2b成人/AI、D3原因指导、D4日历和105/M1～M7/原72继续active。

本批代码已本地提交663088c0，源设计总册同步14领域/133功能/452业务接口全部映射，693源码引用/4282链接/10离线页通过；来源仍按当前实现及缺口描述。83af7e15远端40790308484的PG job现已success，application及browser尚未终态，继续等待且不取消/再推送。后续共享安排完整API及旧恢复专项在本工作区冻结，真正分组开始转入独立工作区。

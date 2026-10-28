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

采用事务原子写入私有artifact确认关系、真实PracticeSession及回执；扩展origin=assistant_artifact，显式artifact ID和来源教学快照，不能伪造planId。完整私聊不进入面向孩子的练习DTO、分析、日历或模型图片prompt。共享监护人可见孩子的合法练习记录时仍不可读作者私聊；作者删除时按明确教学保留协议清除私有origin并对教学副本脱敏，不能用共享壳留存应删私聊。

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

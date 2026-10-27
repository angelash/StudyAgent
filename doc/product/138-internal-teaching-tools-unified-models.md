# 138 内部教研分析与提示的统一模型接入

2026-10-27，实施前规格。承接105的M3/M6、92与XP-I/XP-J；原72项、M1～M7保持。137导航候选f737129正在另一工作树固定运行389浏览器与40489621177精确CI，本批只在独立工作树实施，不改其源码、编译、QA Web或原报告。不扩学校原生对接、机构租户、Marketplace或计费。

## 1. 已核对调用与现有评分边界

`AiController`当前注册两个admin专用入口：`POST /ai/assessment/analyze`与`POST /ai/hints/generate`。`AiService.analyzeAssessment/generateHint`仍使用OPENAI_MODEL和兼容SDK，未接受modelId；分析无Key会503，提示无Key或失败会返回规则提示。传输测试使用这两个方法验证旧SDK。它们在普通学习界面没有新的选型表单，因而九个现代菜单改版并未完成这两个活跃入口的迁移。

旧AssessmentsModule/MissionsModule未在AppModule注册，旧学习路由已明确410，直接Boolean(ai.correct)及重答覆盖只存在于未接入历史源码。现行诊断/训练已使用pending_review、score=null和真实人工复核，不能再造第二套正式评分或将AI教研建议自动写成孩子能力证据。

`structureImportRecord`与`enrichDiagnosticPlan`没有生产调用者；继续隔离，不因统一模型恢复退役同步导入。冻结的历史openai普通助教执行仍保留其原供应商/原模型；新教研请求不得因有OPENAI_API_KEY而隐式绕开统一小九路径。SpeechService的既有语音SDK路径不属于本批文本迁移。

## 2. 具体交付

提供内部admin入口`/admin/ai-tools`，包含“答案分析建议”和“提示草稿”两个工作区，共用现有XiaojiuModelPicker及目录/历史检查状态，Auto明确显示平台默认DeepSeek V4.1 Flash。教研人员可选当前题库题并查看来源/原版本，或明确选择自编临时题输入完整题干、参考答案和参考分析；答案分析另输入待核对答案，提示另选帮助层级。不预填任何真实孩子、历史作答或能力结论。

选择题库内容时服务端读取有权访问的题目/版本并冻结快照；临时题明确标记未入库，不以客户端题ID伪装正式来源。输入完整预检显示题目、拟发送字段、模型和用途；超限明确拒绝，不静默截断。界面使用现有后台版式与统一常规模型选择，不借本批另造商业化功能。

生成结果逐项展示依据、建议、未知与复核要求，完整问题/输入/模型/版本可回看。结果是教研建议，保持“尚未人工核对”；下载或复制为草稿，不自动改变题库、标准答案、已有首答、正式评分、诊断、原因、指导计划或掌握估计。需要用于教学内容时继续走现有内容审核/发布系统，而不是新增一个跳过审核的采用按钮。

## 3. 模型与严格结果协议

统一使用XiaojiuModelsService.resolve和XiaojiuChatService.structured。未指定模型按平台默认DS冻结；明确模型不可用则保留错误，不替换为另一模型或旧SDK。历史任务重试/重放保持原modelId，用户更改菜单只影响明确新建的任务。目录读取不会发生成调用。

答案分析建议包含完整summary、建议判断（correct/incorrect/uncertain）、与本次已提供题干/参考/作答绑定的观察、可能的替代解释、建议验证步骤和confidenceLevel。结构化schema和Zod语义检查都来自应用代码，拒绝空字段、额外字段、超限、假引用、缺失判断与不完整输出；不把缺字段默认为正确或中等置信。所有新分析均reviewRequired=true、advisoryOnly=true；判断无法作为正式score或能力证据。

提示草稿包含hint、focus、suggestedLevel、reviewAdvice与reviewRequired=true。模型看到的上下文由明确预检限定；完整参考答案仅用于教研控制检查，不能作为学生端新提示直接返回。普通学生提示/曝光事实继续由现行课堂/诊断/训练路径控制。本工具生成的草稿需要教研阅读后再进入正式内容审核；自动检查只标疑似泄露，不能宣称语义保证。

公开结果source增加xiaojiu及明确modelId/modelName、用途/未复核标志；旧记录source=openai或rules按原值读取。分析与提示失败均保留明确失败；若继续提供确定性规则提示，显示source=rules及模型失败说明，不能把规则回退冒充所选模型成功。

## 4. 持久操作与权限

新工作区复用现有持久任务/命令模式，记录admin owner、purpose、requestKey、输入指纹、冻结题目/模型、revision、状态、取消与结果。状态为queued/running/completed/failed/cancelling/cancelled；新集合与schema迁移按真实当前版本顺序实施。生成结果与引用记录原子完成，幂等重放不再生成或追加同一建议；冲突requestKey明确拒绝。

刷新、标签页关闭和网络丢回执后可读取原命令恢复；明确取消才取消任务，普通读取/关面板不重新生成。取消/原模型重试保留原输入与历史；两标签冲突保留原草稿，用户明确决定新建。输入完整本机稿按账号/用途分槽，存储不可用时如实提示并允许下载，不因失败丢原文字。跨账号、撤权、会话失效、迟到供应商回复与重启均不得写入或显示前一权限范围结果。

新HTTP仅admin可写/读自身教研任务，不通过student allowlist；保留现有速率限制。客户端不能提供结果schema、可执行命令、凭据或本地路径。任务正文不进入公开模型检查收据；秘密供应商错误仍脱敏。数据删除、备份、恢复与schema升级包含新集合，恢复演练使用合成题目/临时库。

两个现有admin入口保留明确兼容层，接受可选modelId/requestKey并转入同一冻结/校验执行逻辑；其返回与任务恢复关联必须有具体兼容契约测试。新的UI优先使用持久任务接口。旧SDK传输测试改为仍需保留的历史openai执行/语音场景，不为了保住旧测试继续保留新请求的旧路由。正式诊断/训练与退役410行为不变。

## 5. 实施顺序与验收

1. 提交本规格，再实现共享契约、严格校验与统一模型执行。核对实际持久任务/权限/原生恢复框架，具体数据迁移在实现前补充可执行字段/索引与命令协议。
2. 接入两个admin兼容入口、持久任务及worker、读取/取消/原模型重试和原命令恢复；保留历史openai和退役410。验证分析绝不改变正式评测/首答/计划/估计。
3. 接入内部工作台的完整选题/临时题、预检、模型选择、结果/失败、刷新/跨标签/换号/存储失败与原模型恢复。窄屏完整字段和键盘/焦点不丢。
4. SQLite与PG分别验证冻结模型、重复请求、竞态、取消/撤权、空/伪/超限结果、重启恢复、数据删除和备份。真实浏览器覆盖两种用途及以上恢复矩阵；测试使用独立合成题目/匿名作答，不上传真实孩子资料。
5. 默认DS和一个明确备选模型分别通过真实匿名教研分析/提示HTTP并核对实际供应商调用、模型名、完整输出和幂等次数；目录/可读检查状态不能代替这两条实际路径。其他模型的场景覆盖和失败边界逐项记录，不把一次DS成功称为全模型所有用途成功。
6. 本批会改变AiService/共享契约，原22模型矩阵固定20输入可能变化。保留原始收据与21通过/1旧Opus失败，重新生成绑定当前代码的完整匿名文字矩阵后才发布新检查文件；若新输入尚未检查，显示未知/历史，不将旧通过改写为当前通过。不替换旧Opus或接受不完整输出来制造22全通。
7. 新完整API/浏览器、精确CI与两库原生恢复完成后，主目录新鲜停服一致数据/旧构建回退、真实生产构建、实际入口/权限/模型状态及守护稳定交付。上一远端CI全部终态前不推送新运行，不取消或覆盖旧原件。

规格提交时只完成调用调查与设计，没有本批实现、真实模型调用或测试通过结论。完整教师/教材/设备/原像素与声音、真实测量有效性和长期复测仍按105继续；不能以教研建议替代这些验收。

## 6. 第一实现层的数据与命令细化（实施前）

复用`domain_records`与现有任务仓储，不新造任务表或绕过lease。当前主线数据库为20；本批正式接入持久集合时新增21迁移，集合名`teachingToolRuns`。SQLite使用json_extract、PG使用body->>创建`teaching_tool_creation_request`唯一索引，字段(ownerUserId,requestKey)，只约束该集合；同一键不同完整commandHash拒绝，同一键同输入返回原记录。现有ownerUserId/id/taskId查询字段和事务机制复用，输入按完整规范JSON摘要，不依赖object属性顺序；不会因服务端重启再解析模型目录而改变原模型。

每条记录冻结id、ownerUserId、authorizationSessionId、purpose(assessment_analysis/hint_draft)、requestKey、commandHash、inputHash、requestedModelId、实际modelId/modelName、taskId、revision、createdAt/updatedAt、snapshot与result。snapshot含题目来源(kind=temporary/question_bank)、服务端读取的原ID/版本指纹、完整stem/referenceAnswer/referenceAnalysis、本次待核对answer或hintLevel，以及固定文字用途说明。没有studentId、score、knowledgeEstimate或采用状态。result使用两种严格schema的鉴别联合，原始供应商事件/秘密配置不保存在公开view。

集合内部阶段只需queued/running/validating/completed，外部failed/cancelling/cancelled从task状态投影，避免失败后仍占据伪活动索引。task kind为`ai.teaching.analysis`或`ai.teaching.hint`，payload只含runId，payloadHash绑定冻结inputHash；worker按原generation/leaseToken进行checkpoint、校验和最终原子结果写入。heartbeat丢失、明确取消、原账号不再active/admin、原授权会话撤销或到期、原题来源权限撤回时停止供应商与迟到提交。普通断网不撤销持久任务；用户在另一有效admin会话可读取属于自己的原任务，再明确决定新建或原模型重试。

新入口为`POST /ai/teaching-tools/preflight`、`POST /ai/teaching-tools/runs`、`GET /ai/teaching-tools/runs`、`GET /ai/teaching-tools/runs/:id`、`GET /ai/teaching-tools/requests/:requestKey`、`POST /ai/teaching-tools/runs/:id/cancel`与`POST /ai/teaching-tools/runs/:id/retry`。预检纯读取并返回完整输入摘要/长度/来源可用性，不发CLI或创建任务。create必须带requestKey及预检fingerprint，事务内重新读取来源并核对完整指纹后才冻结；cancel/retry带expectedTaskVersion和requestKey，通过现有任务命令/代次协议防重复。列表按purpose/日期/page/pageSize查询，不把其他admin任务或秘密错误混入。

兼容层保留两条原admin路由：可选modelId/requestKey，使用同一严格预检/冻结/执行与结果投影；无requestKey时由服务端创建一次明确新命令，有requestKey则重放原结果。旧调用仍返回原用途的summary/structuredResult/confidenceLevel/reviewRequired/source（分析）或hint/source（提示），追加modelId/modelName、advisoryOnly、runId/requestKey及结果状态；等待超过约定预算返回明确可恢复任务位置，不伪造完成。其输入/返回和退出/断网行为用实际HTTP契约验证，再编写具体控制器；不能仅以TypeScript旧签名推测兼容性。

第一层先实现两个结果schema、完整输入限制/规范摘要和拒绝伪引用，不注册controller/worker、不新增集合/迁移或正式路由；保留该层尚未可用的边界。第二层再提交并实施21迁移和任务命令，与账号导出/删除、备份/恢复注册一起接通。现有代码中的schema20断言需区分“20→21迁移用例”和“当前最新版本”，保留旧迁移试验本意，不能把全部20文本机械替换成21。

## 7. 第一层严格协议基础（未接入产品）

已实现独立teaching-tool-protocol：完整输入保留、规范指纹、明确null未知、JSON有限值/深度/结构/18000总预算、题源指纹、两种严格JSON/Zod结果、确切原文引用、未知和人工复核/仅建议标志、保持提示层级与疑似答案重合提示。7项纯逻辑测试通过，API类型通过；原首轮测试夹具的union解构类型错误及修正后结果均保留，见[协议基础原件](../evidence/2026-10-27/teaching-tool-protocol-foundation/receipt.json)。提示重合检查只是一项字面警示，不声称语义防泄露。

本层没有注册控制器、worker、持久集合/迁移、后台页面或任何供应商调用；不会改变正式测量/首答/评分。目录/运行仍由137与更早批次独立验证。下一步按第6节接入21迁移、现有持久任务和权限/原命令恢复，再接内部UI与真实匿名模型路径；不能把七项基础测试写成138已可用。

## 8. 题库原文与文本调用范围（任务接入前）

题库预检从服务端取得`questions`、已存在的QuestionDocument和QuestionAnswerSchema，不调用会在读取时补建记录的ensure方法。冻结原stem/answer/analysis之外，还冻结完整已有结构化文档与答案协议，其JSON进入完整18000预算；原版本/题源指纹包含这些原件，不能只读旧stem却称已理解完整表格/公式题。新增`question_document`引用键只允许引用该份冻结JSON原文。来源名称、类型、许可证/审核状态可展示，秘密配置、本机文件系统路径与原始令牌不进入模型上下文或可移植结果。

已有图片/音频/视频附件继续保留原引用供教研核对，预检明确“本次文字分析不读取这些媒体内容”，生成输入也含此限制。模型不得编造看图/听音观察；含未解析媒体且仅靠它才能判定的题必须保持uncertain或明确待人工核对。此处不将URL字符串视为已做视觉推理；完整视觉能力仍按M1/M3与模型实际模态另行接通和验证。原文/结构过长时拒绝该次预检，保留完整输入供用户明确选择范围，不截取头部或只发摘要冒充全文。

临时题可以明确提供结构化document/answerSchema或保持不存在；两种输入的限制和预检一致。原资料本身是数据，文档内的提示指令不能改变固定schema、用途、权限、只建议/待复核与当前模型。初层协议新增这些可选完整字段与媒体限制后，需补真实表格/公式JSON引用、超限、伪造观察与媒体判断边界用例，再接任务。该范围补充不表示图像理解已实现。

## 9. 管理员本人资料操作的接通边界（实施前）

核对现有PrivacyService发现所有操作目前只允许parent，原生删除账本也只接受parent身份。因此仅把teachingToolRuns加入accountRecords还不能称当前admin可导出或删除自身教研资料。沿用现有`/privacy/account/export`、`/privacy/account/deletion-preview`与`/privacy/account/delete`及原密码重新核验、完整指纹/确认名称/请求键，不另造跳过复核的删除入口。账号概览和本人账号操作允许active admin；孩子操作仍只允许有效parent并核对绑定，admin不能借此读取或删除任何孩子档案。

admin概览与账号导出不展开孩子，公开副本只含其本人教研记录与自身账号资料；教研记录白名单去掉授权session、内部context、输入/命令hash、taskId和控制回执，状态公开为completed/not_completed，避免把内部running误写成失败任务当前终态。若admin仍有有效孩子绑定，删除预览明确阻断，需要先按原有家长身份处理档案关系，不默默删除唯一监护关系。其他管理员资料、正式首答/评分/指导计划保持原值。

删除本人账号时原子选中并清除其teachingToolRuns，准确核对task kind/owner/runId后取消未终态任务，迟到结果不能重新生成记录。最新删除账本可用于恢复旧备份，允许admin账号回执仅在没有删除或保留孩子hash时生效；仍核对身份hash，孩子恢复逻辑和parent身份规则保持。需用合成admin/另一个admin、在途/排队/已完成任务、真实HTTP导出/删除，以及SQLite和PG原生旧备份加新账本冷恢复验证，不把纯集合辅助函数测试称完整账号能力。

当前137已正式交付，138任务层在独立工作树通过首轮19协议/HTTP；扩展存储回归43通过/3失败/7环境跳过，三项失败分别是旧未来schema21现在成为合法版本、旧最新20结构断言、新测试把备份目标放入源目录。这些原件保留，先修正真实测试与路径后重跑；该结果尚未证明本节能力、双库恢复或产品已可用。旧两个admin AI入口、完整页面和真实匿名供应商测试仍待。

## 10. 后续旧入口兼容的具体投影（实施前）

两条旧admin入口继续接收question与answer/answerHistoryCount，新增可选modelId/requestKey/hintLevel；不接受客户端结果schema或正式评分。传入的题ID确实存在且可读时，按服务端题库完整原文冻结；未知ID只将明确提供的题干/参考/分析作为“旧接口输入的临时题”，不伪造题库版本。存在但已撤回的题不能因不可读而悄悄变成临时题。旧hint默认层级按历史计数0/1取1、超过1取2，明确hintLevel才覆盖到合法1～3；不把答题次数等同于已曝光提示事实。

兼容服务仍经同一预检、create、owner与授权session、持久worker和严格结果检查，不由HTTP请求绕开lease直接发供应商调用。未指定模型冻结DS；有原requestKey先做纯有限JSON校验，再定位同一命令，不能因目录变化重解析原模型。没有requestKey时生成一个新的服务端命令并随回执返回；新工作台始终自己保留请求键。HTTP断开或关页不隐式取消，只有显式cancel生效。

已完成分析保留summary/structuredResult/confidenceLevel/reviewRequired/source，source=xiaojiu，追加modelId/modelName/advisoryOnly/runId/requestKey/status与原任务位置；structuredResult.correct从三态judgement投影为true/false/null，uncertain不能默认为false或true。已完成提示保留hint/source并追加相同恢复与复核元数据。尚未完成时返回202与完整恢复元数据，summary/structuredResult/confidenceLevel或hint明确null，不能造出“分析完成”文字；失败保留原错误码和原任务，不制造规则内容冒充所选模型成功。读取相同命令、相同结果和取消/重试仍走新持久接口。

旧SDK方法若为退役历史模块保留，必须标明只用于读取/复现原历史路径，新的admin HTTP不再路由到这些方法；传输回归迁移到仍有效的历史openai助教或语音场景，不能为了旧测试继续新发旧模型请求。需要真实HTTP验证已完成/202/失败、默认与显式模型、幂等冲突、非admin与外账号、断网原请求恢复和迟到回复；本节只是后续兼容设计，当前两个旧入口尚未迁移。


## 11. 持久后端基础的当前证据与后续门槛

已接入新契约/持久集合/schema21、两个严格结果worker、预检/创建/原请求/本人列表/读取/取消/原模型重试。题库完整QuestionDocument/答案协议/表格公式保持原快照，媒体未知强制保留；admin/owner/原授权session、退出/到期/撤权/撤回题源和迟到结果均校验，正式首答/评分/原因/计划哨兵保持。新管理员本人资料可导出/删除，孩子操作仍限parent；已有孩子绑定阻断admin删除，新账本可用于双库旧备份冷恢复。预检零写入，两实例同键仅一份记录，取消无操作仍保留原命令键，原模型重试不重解析目录；未新增安装或重建共享依赖。

最终独立完整API1498通过/0失败/64环境跳过；真实本机PostgreSQL17新临时数据库/原生dump与restore、实际HTTP/worker共23通过/0失败/1 SQLite专属跳过，API/Web类型通过。原完整1495/1、修正1497/0以及所有43/3、51/1、52/0和PG18/3、21/1、22/0原件均保留。PG两实例写冲突通过一次新快照读取原回执解决；后续测试达到原每人60次AI限流，改为每用例独立合成admin，正式阈值/窗口/算法不改。无操作取消键重用201代替409、1e999与null重放201代替400均有单独红色；修复后才运行最终完整API与PG。详见[完整基础原件与源码/编译摘要](../evidence/2026-10-27/teaching-tool-durable-foundation/receipt.json)。

人工代码复查另发现列表按字符串比较ISO时间，会漏掉from无小数而createdAt含毫秒的有效记录；已用编译服务与纯合成store端口复现应1条却0条，原件在基础目录teaching-task-date-filter-red.json.gz。这是待修缺陷，尚未跑实际HTTP日期边界；下一阶段先改为真实时间比较并补完整列表/日期/分页用例，不能将1498全绿称该状态已验收，更不能部署当前138。

当前生产仍137/schema20。138尚无后台页面、两个旧admin SDK入口的兼容迁移、默认DS/明确备选真实匿名教研调用、新22模型矩阵、新全站浏览器/精确远端CI及schema21正式交付；以上是明确未完成范围。原22模型21通过/1旧Opus失败的收据保持原时点，新契约已变化，不能将其当成当前新增用途通过。72项11 implemented/50 in_progress/11 planned/0 verified、M1～M7及教师/实机/全内容/真实测量有效性/原像素声音与长期门槛继续，不以这一基础层结案。

## 12. 独立工作树的日期与完整列表整改

92dfee2后端基础已提交推送，精确CI40517472450仍执行，原分支源码/编译/报告保持。后续在独立StudyAgent-teaching-tools-ui工作树实施，不改该CI候选。先把前述日期过滤问题扩为真实HTTP两条红色：带毫秒记录漏项，以及等价ISO边界被误判倒序；两项均稳定失败。随后改为Date.parse数值比较及排序，保留倒序范围拒绝，补本人分页、purpose过滤、其他管理员空列表和读取不调用模型。

新SQLite专项32通过/0失败/4环境跳过；现有独立本机PG完整教研专项26通过/0失败/1 SQLite专属跳过，包括原生旧备份与最新删除账本恢复。见[日期/历史原件](../evidence/2026-10-27/teaching-tool-date-history/receipt.json)。新工作树只建立285个依赖只读junction与3个指向本树包的junction，构建自身包/API，没有安装或重建共享依赖。基础1498/0/64属于92dfee2原源码，不能冒称这次service修改后的新全站结果。

日期缺陷已在本独立候选修复，尚未合回原分支或正式上线；完整后台页面/恢复、旧入口兼容、真实匿名供应商、新22模型矩阵和完整浏览器/精确CI/主目录交付仍按第2～10节继续。当前正式137/schema20，72项与M1～M7门槛保持。

## 13. 旧入口HTTP状态与重放校验细化（实现前）

兼容入口首次将完整规范输入排队后返回202；原任务完成后同键读取返回201与完整原结果；原失败/已取消终态同键读取返回200与明确failed/cancelled状态、空内容及原errorCode，不冒充完成或触发自动重试。所有回执带runId/requestKey/runPath与冻结模型。传入question的题库ID存在时，客户端题干/答案不覆盖服务端原件；旧临时题只选取明确题干/参考答案/解析与媒体限制，额外Question元数据不成为评分或模型指令。

重放先做纯有限JSON与字段/长度校验，再按owner/requestKey读原记录；把本次规范输入与原snapshot重建的规范draft比较，保持原requestedModelId，拒绝改题/改答/改用途/改模型。同键恢复不调用目录解析、不重新读取题源，不因题库或目录后来变化而改写原文。新命令仍按当前题源访问权限预检。尚未完成与失败不返回规则提示；调用者通过原runPath读取、显式取消或原模型重试。

旧SDK分析/提示方法只保留于未注册的退役Assessments/Missions源码依赖；新admin HTTP不再调用。已安装SDK的传输测试改为冻结openai历史助教renderAssistant与仍有效的语音路径，不让退役同步方法的测试约束新入口。真实HTTP将同时验证旧SDK方法未被调用、202到201原任务恢复、失败明确保留和角色/输入/模型冲突。


## 14. 当前页面与兼容迁移的独立验收

92dfee2精确远端40517472450三组已全部success；下载原始报告逐例读取390项/390次尝试，零失败、跳过、flaky与重试。Linux完整API1490通过/72环境跳过，新教研PG专项23通过/1 SQLite专属跳过，原日志保留；该结论只绑定后端基础，不能替代后续日期、旧入口迁移或新页面验收。见[精确基础CI原件](../evidence/2026-10-27/teaching-tool-durable-foundation/exact-ci-40517472450/receipt.json)。

旧admin入口迁移已经实现：首次202明确未生成、完成201返回原结果、失败或取消200保留空内容与原错误；题库完整原件由服务端冻结，同键恢复不重新解析模型或题源，旧SDK不会被调用。兼容阶段SQLite专项39通过/4环境跳过、PG30通过/1 SQLite专属跳过，类型通过；这组发生于modelAvailable薄封装和完整UI之后续改动之前，最终候选仍需完整回归。见[兼容专项原件](../evidence/2026-10-27/teaching-tools-compatibility/receipt.json)。

新增教研页面包含完整题/作答输入、题库表格与公式预检、常规模型菜单、本人历史、完整原文与只读待复核结果、原模型显式重试、原请求恢复、双标签副本和存储失败下载保护。首轮14项中13项失败、1项通过：登录落地的analytics缺入口；原截图/trace保留后补真实产品入口。第二轮11通过/3失败：填过内容的textarea被其包裹label的文本影响而不能稳定再次定位，以及测试在取消回执拦截尚未结束时就卸载拦截。已给文字域固定标签引用，测试等待真实丢回执完成，第三轮继续；不能将第二轮称新UI全绿。见[第一轮](../evidence/2026-10-27/teaching-tools-ui-browser/first/receipt.json)与[第二轮](../evidence/2026-10-27/teaching-tools-ui-browser/second/receipt.json)。

## 15. 操作冲突与未知本机原件的恢复细化（实施前）

生成中worker可能在页面读取之后推进task.version；这时取消/重试得到409，原命令尚未执行。界面保留这条命令并明确标出冲突，继续恢复仍使用原键，不能悄悄用新版本重发。提供一个显式的“保留原操作副本，核对最新状态”动作：只GET最新任务，先把旧控制命令逐字归档到本账号/原任务的独立本机副本，再清除当前待确认槽并呈现最新状态；存储失败时需先下载含旧命令的完整副本。没有新的POST，不增加供应商调用。新取消/重试由用户重新明确发起，使用最新generation/version和全新控制键。

原稿或控制槽遇到无法识别的JSON、未来格式或非有限内容时，不能把空表单当成成功恢复。旧原始字节保持在独立原键；新文档槽必须保留可读回的未知原件副本引用，并提供明确的原件下载，后续刷新仍能找到，不把未知内容解析为命令。归档失败时保留当前内存原件并阻止离开，下载后可放行；它不授权跨账号读取。正常已解析草稿的当前输入/原请求、模型和历史保持原值。

追加真实浏览器场景：人为让取消读到已过期版本，确认409不会另发命令，显式保留/核对只读取最新记录，再由用户新键取消；原控制副本全文可检索。再以坏JSON原件验证连续两次刷新和逐字下载；对控制原件做同样验证；存储失败时导航与退出保护仍适用。这些是第4节可靠恢复的细化，不扩展到自动评分或学生端新AI判断。默认DS/明确备选真实匿名两用途、新22模型文字矩阵、完整API/浏览器、双库原生恢复、精确新CI与schema21可回退交付仍是本批剩余门槛，当前正式服务137/schema20。


## 16. 恢复补强与专项通过，冻结完整候选前的范围

第15节已实施：409保留原控制键、显式先归档再只读最新状态、用户新动作才发新键；未知原稿与操作按本人原槽持续可查，连续刷新仍可逐字下载，不解析为命令。第三轮13通过/1失败的原件保留，原取消与恢复已成功，调用计数不符；第四轮14通过/3失败进一步定位到合成夹具按相同context取到旧取消/失败任务。已按真实running租约和owner核对当前任务，只改离线夹具，不改正式worker权限或取消语义。第五轮17项/17次原始尝试全部通过，无跳过、flaky或重试，三个视口完整截图已人工查看。见[第三轮](../evidence/2026-10-27/teaching-tools-ui-browser/third/receipt.json)、[第四轮](../evidence/2026-10-27/teaching-tools-ui-browser/fourth/receipt.json)、[第五轮](../evidence/2026-10-27/teaching-tools-ui-browser/fifth/receipt.json)。

随后补上只读本机原操作副本下载，并将冲突用例改为从真实界面下载核对，避免仅依赖存储内部断言；该小改动仍需固定候选完整浏览器验证。新增真实匿名教研runner，严格要求提交后的固定源码与独立临时库，默认DS/明确GPT-6.1 Sol各跑分析与提示，经真实HTTP、持久worker和原小九CLI；保留原尝试次数、完整匿名输入/结果、正式首答/评分/计划哨兵摘要及源码/编译指纹。此时尚未执行，不提前宣称真实供应商通过。下一步完整API、两库专项/原生恢复、完整浏览器、四个真实匿名样本、新22模型文字矩阵和精确远端CI；正式仍137/schema20。

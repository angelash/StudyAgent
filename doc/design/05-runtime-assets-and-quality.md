# 运行、资产与质量设计

## 1. 当前运行形态

开发使用npm workspaces；生产先构建contracts/config/API/Web，再启动API与Web。后台处理可内嵌于API，也可用独立worker；SQLite为默认业务库，PostgreSQL通过配置启用。

本次整理时的本机使用地址为Web `http://127.0.0.1:3217`、API `http://127.0.0.1:4217`。这是本机配置，不是项目默认端口；默认Web/API为3000/4000。设计整理不修改这些配置或重启服务。

## 2. 运行依赖

- Node.js 24.13及以上的24系列、npm 11：API、Next.js、内置SQLite与工具脚本。
- Python 3.10+及 [处理依赖](../../scripts/processing/requirements.txt)：PDF原文、扫描识别、图片和表格公式恢复。
- FFmpeg/ffprobe：录音规范化，部分视频/媒体验收；可通过专用环境变量指定可执行路径。
- 小九AI已登录CLI与有效模型目录：普通证据聊天、课堂插问、PDF视觉复核。
- MiniMax API或可选OpenAI语音配置：语音；未配置仍可进行文字学习和确定性测量。
- Linux或WSL、g++、unshare、timeout：GESP隔离编译运行。没有隔离前提不能降级为宿主直接运行不可信程序。
- 可选PostgreSQL与原生备份工具：双库部署与恢复。

当前产品不要求外部Redis或消息队列。使用浏览器本地录制时需要MediaRecorder；不同浏览器支持情况应由能力探测而不是固定假定。

## 3. 配置类别

配置名称及默认值见 [packages/config](../../packages/config/src/index.ts) 和 [.env.example](../../.env.example)。此处只整理名称与用途，不复制任何本机密钥或登录材料。

- 服务连接：`API_HOST/API_PORT/WEB_PORT/PORT/NEXT_PUBLIC_API_BASE_URL/CORS_ORIGINS/STUDY_TRUST_PROXY`。
- 数据与资产：`STUDY_STORAGE/STUDY_DATA_DIR/DATABASE_URL/STUDY_ASSET_ROOT/STUDY_GESP_ROOT/STUDY_TEXTBOOK_REGISTRY`。
- 处理与回收：`STUDY_WORKER_ENABLED/STUDY_PYTHON/STUDY_FFMPEG/STUDY_FFPROBE/STUDY_PDF_STRUCTURE_MODEL`。
- 模型：`CODEX_COMMAND/CODEX_HOME/CODEX_MODEL/CODEX_PDF_MODEL/XIAOJIU_MODEL_CATALOG/XIAOJIU_CHAT_ENABLED/XIAOJIU_CHAT_DEFAULT_MODEL`及超时。
- 兼容AI与语音：`OPENAI_API_KEY/OPENAI_BASE_URL/OPENAI_MODEL/OPENAI_TTS_*`、`MINIMAX_API_KEY/MINIMAX_TTS_*`。
- 身份与运行额度：`JWT_SECRET/STUDY_ADMIN_PASSWORD/STUDY_RATE_LIMIT_IP_PER_MINUTE`及业务额度配置。

`NEXT_PUBLIC_API_BASE_URL`写入前端构建包。切换API地址必须重建Web；构建QA包时不能让它误连实际用户API。生产反向代理可采用同源地址。

## 4. 外部调用矩阵

### 普通助教和课堂插问

前端选择模型 → 后端校验模型目录 → 按当前业务证据组装上下文 → 小九CLI临时任务 → Schema校验 → 过滤证据引用 → 保存消息。保留超时、取消和失败状态。UI当前接收完整回复，不是逐token事件流。

113普通助教增加独立持久命令和版本化状态读取。关闭或停止等待不取消服务端生成；明确取消传播至CLI进程树/独立进程组，并等待真实关闭。最终消息和帮助事实仍受租约与原授权/作答指纹事务保护。默认模型合成小调用和一次真实取消由[独立验收脚本](../../scripts/qa/verify-assistant-turn-runtime.cjs)记录，不能推广为全部模型当前在线。

### 兼容分析和计划说明

部分`AiService`路径仍通过OpenAI兼容client完成分析或文字增强。权限、可用性和降级依具体方法执行。不能仅凭工作台已接入小九全模型，就声称所有遗留AI接口已经改走小九CLI。

### 语音

MiniMax优先；读取SSE PCM并返回WAV，默认16kHz单声道；未配MiniMax时可用OpenAI MP3。语音按已授权课件/幕ID或句子请求，前端负责播放节奏。没有语音配置时显示文字路径。

### 文档结构复核

Python本地结果 → 挑选需模型核对页（最多8） → CLI视觉结构输出 → 本地与模型按页合并 → 人工对照原图确认。模型未参与、失败降级、达到页数上限都分别记录。

### 生图

两张开发期位图继续作为自编课程资产。运行期已增加当前节点“配图”：通过原样集成aigw-imagegen技能生成gpt-image-2参考候选，私有文件保存于数据目录的`classroom-visuals`。运行`node scripts/operations/setup-imagegen.cjs`建立项目独立Python环境；探针检查SDK所需参数及技能环境，真实连通另验。失败不切换模型，文字课堂继续。已选图片进入打印及嵌入PNG的离线HTML笔记，原图/展示图进入家庭导出，完整备份另保留私有提示词；删除和旧备份恢复联动账本。详细边界见[课堂配图规格](../product/101-runtime-classroom-visuals.md)。

## 5. 资产现状与复用方式

本轮对可复算的版本化课程做静态审计：258个原子知识点、15758个原创任务，258点均有结构完整的批准教学，当前素材结构缺口为0。对应 [课程审计收据](generated/content-snapshot.json)。

这只证明当前自编结构和组题素材条件，不等于全教材覆盖或真实测量标定。教材登记JSON当前448条；GESP知识图114候选点，试点任务49条；成人社会学课程5单元、15讲座、60微课，185道微课题与另编60道单元情境题，共245个不同题目ID、490级提示。每课至少3题，含30表格题与2图示题；内容仍待逐题审核。成人课堂、小学测量和研究索引分别计数。

资产分工：

- `resources/curriculum`：教材登记、目录、题族规范、关系修订、来源和映射候选。
- `resources/gesp`：官方/公开来源、知识图、题目索引原料、教学草案和自编试点。
- `data/assets`或指定资产根：迁入题卷、媒体、教材PDF、独立校验清单。
- `apps/web/public/question-assets`：受控原创题图。
- `apps/web/public/classroom`：当前课堂位图。
- `apps/web/public/vendor`：公式字体和许可，部署时必须一起保留。

README与历史报告中记录的全量资产、原卷数、教材页数等是相应时间的证据；本轮没有重新逐字节遍历所有大归档，不将旧计数包装成新的全量完整性检查。原项目资料保留来源路径、哈希与迁入资格，不能因“复制过来”就视为已发布教学内容。

## 6. 后台处理与故障恢复

文件接收和领域状态与任务意图同事务登记。worker按租约领取任务，保存进度和处理产物；重启可重新领取过期租约。取消和重试检查任务版本；过期worker不能凭旧token提交成功。

PDF、OCR、手写预览、本地解释、工作台PDF结构和媒体回收有不同处理器。外部进程需超时、输出大小和受控目录；子进程结果必须再校验为预期格式。任务成功意味着处理完成，不等于内容已批准教学或进入正式题库。

事件总线当前写领域事件，任务表本身承担事务outbox。尚未提供面向第三方的可靠webhook分发或通用外部订阅平台。

## 7. 部署与守护

### Windows本地

`npm run daemon:start`构建后启动/重载PM2的`study-agent-api/study-agent-web/study-agent-health`，保存进程列表并安装`StudyAgent-Daemon`登录恢复任务；健康探针负责异常恢复。对应 [守护说明](../product/87-local-windows-daemon.md)。

### Linux

当前已有同源HTTPS、PostgreSQL、API/worker/Web分进程模板与升级步骤，见 [Linux部署交付](../product/23-linux-deployment-delivery.md)。本次整理没有发起新的外部部署。

### 重要路径

`/api/health`检查进程；`/api/ready`检查存储可用性。两者绕过全局普通IP额度，不能只用首页200推断数据库就绪。

## 8. 备份与删除约束

业务库、学生媒体、工作台资料、原始资产和GESP归档分别纳入清单。SQLite一致性备份和PG原生备份都需要校验恢复，不能在线复制活跃库文件后就声称一致。

备份脚本拒绝源/目标重叠、不安全相对路径和不受控链接，复制后验证哈希与源文件稳定性。恢复先校验格式和完整性，重新设置任务栅栏并应用删除账本；不完整恢复标记阻止服务启动。目录联接和同盘路径别名不能当成独立副本。

相关实现：[backup.cjs](../../scripts/operations/backup.cjs)、[postgres-backup.cjs](../../scripts/operations/postgres-backup.cjs)、[restore-state.cjs](../../scripts/operations/restore-state.cjs)、[privacy-ledger.cjs](../../scripts/operations/privacy-ledger.cjs)。

## 9. 测试与证据

源码包含93个API测试文件和11个浏览器测试文件。文件数表示组织规模，不是功能点数或有效性比例。

基线`9c2821c`的Practice与帮助交付：全量API798项通过、6项按配置跳过；完整浏览器30项通过。契约/API、Web类型与独立/正式Web生产构建通过，见[本批收据](../evidence/2026-10-24/classroom-practice-acceptance.json)。其中真实SQLite验证私有提示、重放/重启、不会和旧版阅读兼容；浏览器模拟提示已提交但回执丢失，并检查五单元图表、三档视口与原参考几何。历史蓝图、课程库及远端CI分别见[蓝图收据](../evidence/2026-10-24/course-blueprint-acceptance.json)、[课程库收据](../evidence/2026-10-24/course-library-acceptance.json)及[原CI](https://github.com/angelash/StudyAgent/actions/runs/39926809939)，不将旧CI当成本次提交的远端结果。

项目交付基线`b344ff0`：全量API807通过、6按配置跳过；完整浏览器34通过，最终Web导航变更后项目/课程库8项复验通过（含五项目15阶段、跨单元引用和真实家长复核流程）。默认模型真实小调用成功一次，此前一次返回503，不能等同所有渠道或长时稳定性验收。见[项目收据](../evidence/2026-10-24/course-project-acceptance.json)。

资料课程基线`cbc95bc`：全量API817通过/6跳过在最终schema、语言与答案位置调整之前执行，最终受影响的17项后端检查通过。完整浏览器39项通过，最后资料课程4项复验通过。两者均使用独立SQLite，浏览器的来源课程模型是明确的测试替身。另有默认DeepSeek V4.1 Flash真实英文两课/6题样本，最终约75秒；此前样本曾含换算错误与答案位置单一，详情见[收据](../evidence/2026-10-24/source-course-acceptance.json)。生产Web/API/health已更新，访客页、ready与未登录拒绝访问见[运行烟测](../evidence/2026-10-24/source-course-runtime.json)。没有读取真实家庭授权资料。

标准浏览器入口现在复用隔离Web副本和测试服务，历史交付截图不再被日常回归覆盖；临时截图在data/qa/browser-evidence，实际验收后才归档。测试替身、真实模型与正式运行三份证据分别说明范围。

CI三组：

- `application`：构建、依赖检查、API测试、类型、文档、课程与资产、升级恢复等专项。
- `browser`：独立测试数据和真实Chromium页面，包括手机/桌面、课堂、工作台、日历、PDF和学案。
- `postgres`：原生PG迁移、恢复、任务栅栏与GESP学习闭环。

设计册更新执行AST清单生成、108项功能到259个接口的覆盖校验、实际源文件引用检查、内容静态审计、离线查阅工具和文档链接检查。业务交付测试另见对应收据；文档生成脚本本身不重新执行全部业务测试或付费模型调用。

## 10. 后续变更应触发的检查

- 修改评分、题族、测量或原因规则：对应单元/集成、旧证据与定义兼容、报告重算和双库恢复。
- 修改身份、媒体、隐私：跨家庭/角色负例、撤权、一次性下载、恢复账本和附件清理。
- 修改课堂和工作台：字幕/音频时序、停止与取消、断点、独立练习、导航刷新、手机布局。
- 修改队列/存储：并发、集合读依赖、任务fence、迁移、备份和双库实机。
- 修改模型路径：输出Schema、引用边界、超时取消、默认模型和真实小样本调用；目录读取测试不代替在线连通。
- 只改本设计册：重新生成结构和功能映射、验证引用与查阅页面、运行文档链接检查即可。

## 11. 完整教学稿最近验收

基线`a5844ae`全量API824通过/6跳过，完整浏览器41通过；随后仅Web历史保护调整到`84911bc`，最终6项资料课程浏览器复验通过。共享契约/API、Web类型、生产模式隔离构建和本地守护构建通过。Linux远端a5844ae的application、browser和postgres三组通过，见[CI收据](../evidence/2026-10-24/source-course-editor-ci.json)；84911bc的Web历史修正另有最终本地复验。

浏览器替身API不承担真实模型质量证明，隔离Next子进程固定NODE_ENV=production及测试API地址。明确的教学稿打开动作记录创建者答案接触，后续汇总不算独立成功；真实学生第一答不继承该标记。[运行烟测](../evidence/2026-10-24/source-course-editor-runtime.json)只用访客上下文。

## 12. 分课流水线与验证依赖最近验收

`c2650eb`本地全量API838通过/6跳过、浏览器43通过；最终远端application、browser、postgres三组均通过，见[CI收据](../evidence/2026-10-24/source-course-pipeline-ci.json)，PG使用专用QA库。真实默认DS两课/六题约86秒，独立刻意错误修订探针约23秒；均为匿名有界材料，保留原始、诊断及最终产物，不作为教师批准或稳定性认证。详见[流水线收据](../evidence/2026-10-24/source-course-pipeline-acceptance.json)。

实际PG负例暴露任务失败时间戳的32位算术推断，已显式改用BIGINT并验退避、取消与永久失败。随后Zod依赖公告触发升级到4.6.7、兼容SDK7.43.0，当前审计零已知漏洞；新增超长集合提前拒绝和实际SDK拦截传输测试，默认文本模型不变。SDK测试不代表新供应商在线连通。

依赖迁移的明确回归见[集合边界测试](../../apps/api/src/common/validation.test.ts)与[兼容SDK传输测试](../../apps/api/src/modules/ai/openai-compatibility.test.ts)；课程阶段、私有复核及原始稿的端到端领域验证见[课程套件](../../apps/api/src/modules/learning/source-course.integration.test.ts)。

该批当时的本地守护Web/API/health部署c2650eb，访客页、ready与匿名拒绝访问正常，见[本批烟测](../evidence/2026-10-24/source-course-pipeline-runtime.json)。本次自动验收均使用独立QA数据；设计册不能用局部技术成功替代完整产品和真人学习效果验收。

## 13. 按需配图与HTTP解析最近交付

运行期课堂配图实现`d3e183d`，HTTP压缩体依赖/安全错误修复`0503d8d`，笔记引导文案`c3bcfb8`。完整本地API858通过/6跳过、浏览器46通过；最后打印等图新增后4项配图流程复验通过。原实现远端浏览器47项及实际PG组通过，application被新披露的body-parser公告阻止；已升级2.4.0和兼容iconv-lite 0.7.3，审计零已知漏洞，独立子进程压缩请求/长稿/配图专项37项通过。最终CI和部署结果分别归档，不能用前一版通过代替后一版。

真实小九生图两次约50秒/47秒；首张文字过密，第二张场景更清楚，但仍有标注长度未完全服从提示的情况。图和精确提示词均保留在[图片证据](../evidence/2026-10-24/classroom-visual-images/scene-reference-33c0b195-receipt.json)，继续待内容核对。浏览器候选使用明确的合成PNG，只证明界面与数据生命周期。

完整收据：[配图验收](../evidence/2026-10-24/classroom-visual-acceptance.json)。运行期任务、元数据/字节校验、范围下载、离线笔记、打印等待、家庭TAR、双库备份、删除账本与暂存回收均有相应验证；全教材、真人教学、真实设备和所有参考状态的像素验收继续保留。

最终`c3bcfb8`的application、browser和postgres三组CI全部通过，见[最终CI收据](../evidence/2026-10-24/classroom-visual-ci.json)。浏览器47项通过；应用853项通过/14项按环境跳过，其中6项PG在独立PG组运行，另外8项为GESP隔离运行/学生专项；PG基础6项、来源课程23项、配图11项通过。不能把环境跳过称为实测通过。守护Web/API/health已更新，Web3217/API4217匿名页面与ready为200，新配图路由匿名请求401，访客浏览器无运行异常；见[烟测](../evidence/2026-10-24/classroom-visual-runtime.json)。

### 双语字幕与旧课堂升级

`9c31c74`新增服务端冻结字幕、显式旧断点映射与取消传递。特征基线完整API880通过/6环境跳过、浏览器52通过；最终设置标题/手机页码样式及英文静音流程的10项字幕/配图复验通过。六段实际课堂MiniMax中英文音轨均解码，正文、单元ID、时长、哈希与WAV保留于[语音收据](../evidence/2026-10-24/classroom-caption-real-audio.json)，未声称真人听感通过。

提交前发现Multer新公告，override固定2.5.0，应用显式声明直接依赖；最终锁文件在独立目录`npm ci --ignore-scripts`成功，生产依赖审计零已知漏洞。修复后HTTP/上传中断/进程存活、PDF与来源课程专项41项通过，完整远端结果独立记录。窗口关闭与服务端已提交的升级分别恢复，不承诺网络中止即事务回滚。完整证据及原失败见[字幕收据](../evidence/2026-10-24/classroom-caption-acceptance.json)；全语言、教师、实机、声学强制对齐与长期学习效果继续待验收。

### 长PDF原件只读运维审计补充（2026-10-24）

独立开发分支增加`npm run materials:audit -- --data-dir <目录>`；实际实现为`scripts/operations/material-audit.cjs`。SQLite与PG都读取一致的只读快照，按材料、冻结课程、未完成上传和活跃处理任务保护原件SHA。只扫描受控资料目录，验证已登记原件、页图、JSON检查点、分块的完整性；未知文件和链接保守保留，候选默认24小时宽限。不完整清单没有可直接删除的对象。

审计与物理回收是两个交付阶段。只读报告不含删除动作；资产状态及租约进展见下段，持久回收和恢复删除账本的文件处理仍待。新上传/检查点链路已有独立PG6项实际运行，包含原生备份到空库与空目录继续处理；它与旧基础CI分开归档。详见[规格104](../product/104-long-pdf-processing-and-source-lifecycle.md)和[专项收据](../evidence/2026-10-24/long-pdf-audit-acceptance.json)。

后续基础提交已补`studioMaterialAssets`、取得文件租约后的最新generation检查、Node与Python分别持有的文件租约，以及永久上传撤销工具。基础验证见[文件租约收据](../evidence/2026-10-24/long-pdf-write-fences-acceptance.json)。

最新独立分支已接入OPS-10持久回收worker，开启worker后3秒轮询、60秒扫描，等待活进程/未知对象不耗尽失败次数。受控原件、缓存、组装暂存和明确studio.material.process任务的配置/原文JSON逐项处理，其他题卷处理产物保留；共享学习依赖不删除。实际自动启动约7秒执行指定任务；不是生产长时负载结论。控制标记原子发布、旧页图摘要回填、恢复账本后的来源字节处理及规格104最终交付仍待，见[最新验收](../evidence/2026-10-24/material-collection-acceptance.json)。

后续`2c49e84`已完成控制标记原子发布：Node/Python采用staging同步关闭后独占hard link，全部用途的活PID暂存保护资料，受控死亡残留才可清理。20组真实强制退出、SQLite48/PG25相关测试、只读审计11与Python7通过；异常返回不留下同一活进程的临时锁，永久撤销保持。旧损坏正式标记继续unknown，测试不代表硬件掉电保证。旧页图、恢复账本物理处理及最终交付仍待，见[原子发布验收](../evidence/2026-10-24/material-atomic-marker-acceptance.json)。

`22a78f6`补齐显式原件/页图核对和两处恢复入口。旧可读图像登记本次基线并标legacy_observed，已有摘要不因损坏而重设；嵌入页另记摘要，不虚构磁盘引用。源版本不变，双库空目录备份恢复验证新引用实际收齐；监护撤权中断提交。ready材料可持久重生成缺失/损坏页，worker另核对原件；原件本身的显式替换和恢复账本源文件清理仍待。相关SQLite37/最终8、旧工作台16、PG33、审计11和浏览器4有重叠，不相加，见[核对验收](../evidence/2026-10-24/material-integrity-acceptance.json)。

`a12d6df`完成OPS-07冷恢复源清理：应用最新删除账本并推进身份后逐文件处理源原件/缓存/明确工作JSON/上传块，共享和冻结来源保留；冻结PDF失去可变资料行后仍按SHA纳入备份。双库真实删除/恢复、继续处理/上传、旧访问拒绝、未知/联接及首次unlink后失败门禁均通过；核心最新SQLite9/PG11及冻结引用4、审计11有重叠。原地续恢复与损坏原件替换仍待，见[冷恢复验收](../evidence/2026-10-24/restored-materials-acceptance.json)。

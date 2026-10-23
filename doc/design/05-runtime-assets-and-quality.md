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

### 兼容分析和计划说明

部分`AiService`路径仍通过OpenAI兼容client完成分析或文字增强。权限、可用性和降级依具体方法执行。不能仅凭工作台已接入小九全模型，就声称所有遗留AI接口已经改走小九CLI。

### 语音

MiniMax优先；读取SSE PCM并返回WAV，默认16kHz单声道；未配MiniMax时可用OpenAI MP3。语音按已授权课件/幕ID或句子请求，前端负责播放节奏。没有语音配置时显示文字路径。

### 文档结构复核

Python本地结果 → 挑选需模型核对页（最多8） → CLI视觉结构输出 → 本地与模型按页合并 → 人工对照原图确认。模型未参与、失败降级、达到页数上限都分别记录。

### 生图

当前已交付两张开发期生成的课程位图，原图和提示词在`artifacts/classroom`，运行WebP在`apps/web/public/classroom`。产品运行时不自动对所有课件或插问生图。后续如接运行期生成，需要独立任务、来源/成本/失败及审核设计。

## 5. 资产现状与复用方式

本轮对可复算的版本化课程做静态审计：258个原子知识点、15758个原创任务，258点均有结构完整的批准教学，当前素材结构缺口为0。对应 [课程审计收据](generated/content-snapshot.json)。

这只证明当前自编结构和组题素材条件，不等于全教材覆盖或真实测量标定。教材登记JSON当前448条；GESP知识图114候选点，试点任务49条；成人社会学课程5单元、15讲座、60微课，182道微课题与另编60道单元情境题，共242个不同题目ID、484级提示。每课至少3题，含30表格题与2图示题；内容仍待逐题审核。成人课堂、小学测量和研究索引分别计数。

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

设计册更新执行AST清单生成、106项功能到255个接口的覆盖校验、实际源文件引用检查、内容静态审计、离线查阅工具和文档链接检查。业务交付测试另见对应收据；文档生成脚本本身不重新执行全部业务测试或付费模型调用。

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

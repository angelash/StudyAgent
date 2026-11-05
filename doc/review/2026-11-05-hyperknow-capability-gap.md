# Hyperknow 与 StudyAgent 能力差距分析（2026-11-05）

本文只做对照分析，没有修改其他源码、配置或数据。Hyperknow 一侧只用公开网页和团队 2026-10-21～25 的仓库记录；没有登录、没有使用凭据，也没有下载第三方资产。StudyAgent 一侧依据设计文档，并对每项“已具备/部分”的能力做了源码抽查（路由、控制器或服务存在），没有运行应用或测试。

## 1. 结论摘要

Hyperknow 的核心是“把任意资料或学习目标变成一门 1:1 AI 课程，再由主动 Agent 排计划、提前备好材料”，面向 13 岁以上的大学生；StudyAgent 的核心是“对小学知识点做可复核的测量，按原因安排指导和间隔复测”。所以真正值得补的不是 Marketplace、付费或 Canvas 这类平台能力，而是**交互体验层**的差距：回答没有流式和阶段状态（`AI-03` 明确不是逐 token 流），语音输入只靠浏览器内置识别，系统不会根据到期复测和计划**主动提前备好**次日材料。资料摄入面偏窄（课程生成只收 PDF、TXT/MD 和粘贴文字，不收 Word/PPT、网页和视频），快速生成可打印复习资料（cheatsheet、闪卡）的能力也弱于对方。另一方面，掌握度测量、原因验证、1/3/7/14 日复测、教材范围对齐和儿童监护授权在 Hyperknow 公开资料里都找不到对应物，这是我们应守住的差异。建议停止追逐对方的像素级界面一致，把精力放在流式、语音和主动准备这三项上。

## 2. Hyperknow 能力清单

核实状态说明：

- **今日公开页**：2026-11-05 经搜索引擎检索到的官方页面内容（hyperknow.io、官方博客、创始人或官方 X）。本环境的网页抓取被出口策略拦截，没有直接打开页面，依据是搜索索引的摘要。
- **今日第三方**：今日检索到的评测、目录站或媒体报道。
- **仅旧笔记**：只见于团队 2026-10-21～25 的仓库记录（含用户授权的登录后界面观察，当时版本 v1.3.13），今日无法公开复核。
- **未发现**：今日检索没有找到证据。没找到不等于不存在。

| 领域 | 能力 | 来源 | 核实状态 |
| --- | --- | --- | --- |
| 课程生成 | 输入学习目标、主题或教材，生成 1:1 课程：单元、讲次、练习、动手项目 | [创始人发布帖 2026-10-01](https://x.com/leslie_rh7/status/2105689901349958107)、[hyperknow.io](https://www.hyperknow.io/) | 今日公开页 |
| 课程生成 | 课程资料可用 PDF 或自然语言修改要求扩充；可重新生成结构 | [授权界面证据](../evidence/2026-10-21/hyperknow-authenticated-ui-evidence.json)、[公开包证据](../evidence/2026-10-21/hyperknow-public-product-evidence.json) | 仅旧笔记 |
| 课程生成 | 加入前先看完整蓝图；加入时选择课程语言，之后不可改 | [授权界面证据](../evidence/2026-10-21/hyperknow-authenticated-ui-evidence.json) | 仅旧笔记 |
| 课程生成 | 单元考试 / 综合考试、项目阶段 | [88 课堂观察](../product/88-hyperknow-classroom-observation-and-plan.md)；今日公开页只确认有项目 | 项目：今日公开页；考试：仅旧笔记 |
| 课程生成 | 1:1 AI 课程“仅桌面站可用” | [hyperknow.io](https://www.hyperknow.io/) | 今日公开页 |
| 资料与知识库 | 上传课程文件、图片、笔记；免费版每次最多 10 个文件，付费版不限 | [hyperknow.io 价格区](https://www.hyperknow.io/)、[TechPilot](https://techpilot.ai/tools/hyperknow/) | 今日公开页 |
| 资料与知识库 | 支持 PDF、Word、PowerPoint、Excel、Markdown、纯文本 | [公开包证据](../evidence/2026-10-21/hyperknow-public-product-evidence.json)（来自静态包字符串） | 仅旧笔记 |
| 资料与知识库 | 文档最长 1000 页，每个概念引用到上传文件的具体页码 | [Cheatsheet 博客](https://www.hyperknow.io/blogs/ai-cheatsheet-generator) | 今日公开页 |
| 资料与知识库 | 连接 Canvas LMS，导入课程文件与截止日期 | [3 分钟指南](https://www.hyperknow.io/blogs/3-minute-guide-hyperknow)、[hyperknow.io](https://www.hyperknow.io/) | 今日公开页 |
| 资料与知识库 | 以 YouTube / 视频作为输入 | 今日检索只见视频作为**输出** | 未发现 |
| AI 辅导 | Agent 对话：按水平讲解、结构化回答、图示、引用；分步模式 | [3 分钟指南](https://www.hyperknow.io/blogs/3-minute-guide-hyperknow)、[Aitoolnet](https://www.aitoolnet.com/hyperknow) | 今日公开页 + 第三方 |
| AI 辅导 | 联网深度检索（自称一次约 50 个网页并标注出处） | [创始人专访](https://m.aitntnews.com/newDetail.html?newId=19973) | 今日第三方（自述） |
| AI 辅导 | 可见执行阶段（Loading skills、Recalling Memory、Visualizing），先出文字后补图，追问建议，响应速度选择 | [78 拆解](../product/78-hyperknow-benchmark-and-learning-memory.md) | 仅旧笔记 |
| AI 辅导 | 语音模式（偏好听讲的用户） | [3 分钟指南](https://www.hyperknow.io/blogs/3-minute-guide-hyperknow) | 今日公开页 |
| 课堂讲解 | 交互式白板逐步讲解、动画、可拖动的交互模拟 | [创始人发布帖](https://x.com/leslie_rh7/status/2105689901349958107)、[官方 X](https://x.com/hyperknow_ai)、[88 课堂观察](../product/88-hyperknow-classroom-observation-and-plan.md) | 今日公开页 + 旧笔记 |
| 课堂讲解 | 六种音色、0.5–2 倍速、语音打断、静音、断点续播、笔记导出与分享 | [88 课堂观察](../product/88-hyperknow-classroom-observation-and-plan.md) | 仅旧笔记 |
| 课堂讲解 | 讲解视频：主题、网页或论文摘要生成约 2 分钟带旁白的视频 | [视频博客](https://www.hyperknow.io/blogs/get-explainer-video) | 今日公开页 |
| 课堂讲解 | 数字人 / 虚拟形象 | — | 未发现 |
| 练习与资料 | 小测、闪卡、练习题、笔记、摘要 | [3 分钟指南](https://www.hyperknow.io/blogs/3-minute-guide-hyperknow)、[hyperknow.io](https://www.hyperknow.io/) | 今日公开页 |
| 练习与资料 | 可打印 cheatsheet，多数约 2 分钟完成 | [Cheatsheet 博客](https://www.hyperknow.io/blogs/ai-cheatsheet-generator) | 今日公开页 |
| 练习与资料 | 针对反复出错的主题生成专项题组 | [中文 MCAT 博客](https://www.hyperknow.io/zh-cn/blogs/mcat-study-tips) | 今日公开页（营销文） |
| 练习与资料 | 练习界面：单选、Check/Skip、倒计时速度奖励、阶段奖励 | [88 课堂观察](../product/88-hyperknow-classroom-observation-and-plan.md) | 仅旧笔记 |
| 练习与资料 | 进度标签 Attempted / Familiar / Proficient / Mastered，由完成情况和练习正确率得出 | [78 拆解](../product/78-hyperknow-benchmark-and-learning-memory.md) | 仅旧笔记 |
| 练习与资料 | 间隔重复 / 遗忘曲线复习 | — | 未发现 |
| 主动学习 | 主动 Agent：读资料、识别截止日期、排学习计划，并在用户开口前备好材料 | [hyperknow.io](https://www.hyperknow.io/)、[DEV 评测](https://dev.to/aniruddhaadak/i-gave-an-ai-my-study-materials-and-it-planned-my-entire-learning-schedule-hyperknow-is-not-just-53g) | 今日公开页 + 第三方 |
| 主动学习 | Learning Feed：日历、今日待办、待确认任务；从大纲提取截止日期 | [DEV 评测](https://dev.to/aniruddhaadak/i-gave-an-ai-my-study-materials-and-it-planned-my-entire-learning-schedule-hyperknow-is-not-just-53g)、[授权界面证据](../evidence/2026-10-21/hyperknow-authenticated-ui-evidence.json) | 今日第三方 + 旧笔记 |
| 主动学习 | Google Calendar 同步 | [公开包证据](../evidence/2026-10-21/hyperknow-public-product-evidence.json)；今日检索未证实 | 仅旧笔记 |
| 主动学习 | History 历史记录入口 | [授权界面证据](../evidence/2026-10-21/hyperknow-authenticated-ui-evidence.json) | 仅旧笔记 |
| 记忆与个性化 | 长期记忆：课程、目标、学习风格（Learner's Persona）；Pro 起提供 | [hyperknow.io 价格区](https://www.hyperknow.io/)、[TechPilot](https://techpilot.ai/tools/hyperknow/)、[Grokipedia](https://grokipedia.com/page/Hyperknow) | 今日公开页 |
| 记忆与个性化 | 会话记忆开关、导入外部记忆、清空记忆 | [78 拆解](../product/78-hyperknow-benchmark-and-learning-memory.md) | 仅旧笔记 |
| 分享与社区 | Marketplace；课程发布、取消发布、分享 | [授权界面证据](../evidence/2026-10-21/hyperknow-authenticated-ui-evidence.json)；今日公开页未提及 | 仅旧笔记 |
| 分享与社区 | 付费用户社区和线下活动；联盟 / 校园大使计划 | [hyperknow.io](https://www.hyperknow.io/)、[联盟计划](https://www.hyperknow.io/affiliate-program) | 今日公开页 |
| 分享与社区 | 多人协作、学习小组 | — | 未发现 |
| 集成 | Google Drive、Notion | — | 未发现 |
| 分析 | 面向学习者的学习分析看板 | 只见进度标签和用量额度（旧笔记） | 未发现 |
| 平台 | Web（hyperknow.io、agent.hyperknow.io）；没有找到 iOS / Android / 浏览器扩展 | [hyperknow.io](https://www.hyperknow.io/)、[TechPilot](https://techpilot.ai/tools/hyperknow/) | 今日公开页（反向证据有限） |
| 语言 | 官网有简体中文博客；对话框有语言控件；课程语言可选 | [中文博客](https://www.hyperknow.io/zh-cn/blogs/mcat-study-tips)、[授权界面证据](../evidence/2026-10-21/hyperknow-authenticated-ui-evidence.json) | 部分今日；完整语言清单未证实 |
| 价格 | Starter $0 / Pro $18 / Max $50（每用户每月，标注限时折扣；旧价 Pro $12） | [hyperknow.io](https://www.hyperknow.io/)、[TechPilot（2026-10-10 核对）](https://techpilot.ai/tools/hyperknow/)、[The Neuron](https://www.theneuron.ai/digest/everything-that-happened-in-ai-today-thursday-october-1-2026/) | 今日公开页 |
| 合规 | 用户须年满 13 岁；免费增值模式 | [服务条款](https://www.hyperknow.io/terms-of-service) | 今日公开页 |
| 规模 | 自称 10 万+学习者、两周生成 1 万+课程；获真格 100 万美元投资 | [创始人发布帖](https://x.com/leslie_rh7/status/2105689901349958107)、[官方 X](https://x.com/hyperknow_ai) | 今日第三方（自述） |

## 3. 对比矩阵

状态口径：**已具备** = 有接入的代码路径；**部分** = 有但范围明显更窄；**缺失** = 没找到；**有意不做** = [概要设计](../design/02-high-level-design.md) 第 1 节明确排除。“已具备”不代表已通过真人或教学效果验证。

| 能力 | Hyperknow | StudyAgent 状态 | StudyAgent 证据 | 重要性与理由 |
| --- | --- | --- | --- | --- |
| 主题 → 课程 | 有 | 部分：搜狗检索摘要 → 澄清问题 → 大纲修订 → 资料课程，最多 20/50/60 课；必须连模型 | `apps/api/src/modules/learning/course-craft.service.ts`、`course-craft-research.service.ts` | 中：成人轨道有用；儿童端须先审核 |
| PDF / 文本 → 课程 | 有 | 已具备：PDF 分块上传，每段最多 120 页 / 50MiB；另收 TXT、MD、粘贴文字 | `learning/source-course.controller.ts`、`learning/studio-material-upload.controller.ts` | — |
| Word / PPT / Excel / 网页 / 视频摄入 | Office 有（旧笔记）；视频未证实 | 缺失：`addTextFile` 只收 `.txt/.md`；Office 只作项目附件下载 | `learning/source-course.service.ts`（第 53 行）、`learning/project-file-storage.ts` | 中：家长手里的资料多是 Word 学案和照片 |
| 长文档 1000 页 | 有 | 部分：每段 120 页，单次模型上下文 18000 字 | 功能框架 STUDIO-23/24 | 低：小学场景很少遇到 |
| 页级引用与原页预览 | 有 | 部分：助教可回到课程来源；PDF 页白板只给关键词候选页 | `apps/api/src/modules/ai/ai.controller.ts`（`assistant/sessions/:sessionId/sources/:sourceKey`）、`source-course.controller.ts`（`:id/sources/:key`） | 中：家长信任靠来源 |
| AI 助教对话 | 有 | 已具备：持久轮次、取消、重试、分页历史；绑定学习证据 | `apps/api/src/modules/ai/assistant-turn.controller.ts` | — |
| 流式输出、阶段状态、先文后图 | 有（旧笔记） | 缺失：AI-03 写明网页接口返回完整消息，不是逐 token 流 | [功能框架 AI-03](../design/01-functional-framework.md) | **高**：儿童等待耐心短，空等会直接流失 |
| 联网深度检索 | 有 | 部分：只有课程生成用检索；`codex-search.service.ts` 只被自身测试引用，未接入 | `learning/course-craft-research.service.ts`、`ai/codex-search.service.ts` | 低：儿童端开放检索风险大于收益 |
| 白板课堂与逐句旁白 | 有 | 已具备：累计板书、逐句字幕、插问、MiniMax 语音、断点 | `apps/web/app/studio/classroom/`、`learning/classroom.controller.ts`、`learning/classroom-turn.controller.ts`、`ai/speech.service.ts` | — |
| 语音输入 / 语音模式 | 有 | 部分：课堂插问调用浏览器 `SpeechRecognition`（zh-CN），没有服务端识别，也没有语音打断 | `apps/web/app/studio/classroom/workbench.tsx`（约第 526 行） | **高**：低年级打字慢；Chrome 内置识别依赖 Google 服务，国内大概率不可用（推断） |
| 讲解视频 | 有 | 部分：白板导出 WebM + SRT；AI 主题白板 | 功能框架 STUDIO-10、`learning/topic-whiteboard.controller.ts` | 低：已够用 |
| 交互模拟 / 可操作模型 | 有 | 部分：化学 10 类模型、JS 代码实验、GESP C++ 运行器 | `apps/web/app/studio/classroom/chemistry-experiment.tsx`、`learning/classroom-code.controller.ts` | 中：数学分数、几何很需要 |
| 测验与练习 | 有 | 已具备，且更强：17 类作答协议、单选/多选、逐级提示、不会/跳过 | 功能框架 ASM-07、STUDIO-06 | — |
| 闪卡、讲义、cheatsheet | 有：任意资料快速生成、可打印 | 部分：按知识点规则编排的学习包，不能从任意资料用 AI 生成 | `learning/studio-learning-pack.ts`、`learning/learning.controller.ts`（`studio/study-packs`） | 中：家长常要“一页纸复习单” |
| 间隔复习 | 未发现 | 已具备：1/3/7/14 日复测 | `diagnostics/guidance.service.ts`、`diagnostics/retention-anchor.ts` | 差异化 |
| 掌握度模型 | 由完成度得出的标签 | 已具备：Beta 后验、可信区间、未知不等于薄弱、原因假设 | `diagnostics/measurement.ts` | 差异化 |
| 学习 Feed / 下一步 | 有 | 已具备：按规则排出到期复测、待确认计划、未完成评测、证据缺口 | `learning/learning-home.controller.ts`、`learning/learning.service.ts`（`memory.feed`） | — |
| 主动提前准备材料 | 有 | 缺失：Feed 只提示，不会预先生成 | — | **高**：能明显减少家长每天的操作 |
| 学习计划与日历 | 有 | 已具备：工作台排程、指导日历、月/周视图 | `learning/guidance-calendar.controller.ts`、`learning.controller.ts`（`studio/study-plans`、`studio/calendar/*`） | — |
| 从大纲 / 作业中提取截止日期 | 有 | 缺失 | — | 中：本地化为“班级群作业 / 作业单拍照” |
| LMS 连接 | Canvas 直连 | 部分：ICS 粘贴或订阅；OAuth 有意不做 | `learning/studio-integration.service.ts`（`lms_ics`、`calendar_ics`） | 低：国内小学不用 Canvas |
| Google Calendar | 有（旧笔记） | 部分：ICS 导入导出 | `learning/ics-calendar.ts`、`learning.controller.ts`（`studio/calendar/export`） | 低 |
| 学习记忆 | 风格、目标；可导入、可清空 | 部分：证据投影（事实 / 未知 / 假设 / Feed），不存偏好，不可编辑 | `learning/learning.controller.ts`（`students/:id/memory`） | 中：可补家长可编辑的偏好层 |
| 历史 | 有 | 已具备：助教历史、课程版本、课堂断点 | `ai/assistant-turn.controller.ts`（`history`）、`learning.controller.ts`（`studio/courses/:id/revisions`） | — |
| 笔记 | 有 | 已具备：助教私人笔记、错题本、课堂笔记导出 | `ai/assistant-note.controller.ts`、`learning/notebook.controller.ts` | — |
| Marketplace / 发布分享 | 有（旧笔记） | 有意不做 | [概要设计 §1](../design/02-high-level-design.md) | 低 |
| 协作 | 未发现 | 部分：共同监护、教师授权，不是同伴协作 | 功能框架 AUTH-05/06 | 低 |
| 激励（奖励、速度奖励） | 有（旧笔记） | 缺失：Web 端未检索到奖励、打卡、成就 | — | 中：儿童动机重要，但必须和掌握度分开 |
| 移动端 | 仅桌面站 | 部分：响应式 Web，没有 PWA manifest，也没有原生 App | 功能框架 STUDIO-08 | 中：孩子多用平板 |
| 多语言 | 有（清单未证实） | 部分：界面只有中文；资料课程可选 zh-CN / en / 沿用来源；课堂双语字幕 | `packages/contracts/src/source-course.ts`（`language`） | 低 |
| 学习分析 | 未发现看板 | 已具备：证据报告、家长首页、干预前后复盘 | `apps/web/app/studio/reports/page.tsx`、`apps/web/app/parent/dashboard/page.tsx` | 差异化 |
| 付费与套餐 | 三档 | 有意不做 | [概要设计 §1](../design/02-high-level-design.md) | 低（当前阶段） |
| 未成年人与监护 | 要求 13 岁以上 | 已具备：监护绑定、学习码、导出与删除 | `apps/api/src/modules/privacy/privacy.controller.ts`、功能框架 AUTH-03/05 | 差异化 |

## 4. StudyAgent 有而 Hyperknow 没有的差异化能力

- **可复核的测量**：258 个原子知识点、Beta 掌握估计和可信区间；“未知”不显示为“薄弱”；读完、看完、练习得分都不直接写成掌握。Hyperknow 的四级标签由完成情况得出（旧笔记）。
- **原因假设与对照验证**：原因是带支持和反证的状态对象（MEA-04/05/06），AI 不直接写入结论。
- **闭环指导**：家长确认的指导计划 → 训练 → 1/3/7/14 日复测 → 前后复盘（PLAN-01～04）。Hyperknow 公开资料里没有间隔复习。
- **教材与进度对齐**：按年级、学期、教材版本和已学范围组题（CUR-04/06/07），448 条教材登记。
- **儿童场景的权限与隐私**：监护绑定、学生学习码、教师单独授权、带媒体的数据导出和删除账本。Hyperknow 服务条款要求 13 岁以上。
- **纸面与作答协议**：题卷库、拍照三用途采集（单题 / 整页 / 资料，`packages/contracts/src/paper-capture.ts`）、17 类作答协议（手写、录音、作图）和人工量规复核。
- **内容门禁**：生成内容待审核、五门禁发布，没有“生成即公开”。
- **移动端可用**：响应式布局；Hyperknow 的 AI 课程声明仅桌面站可用。
- GESP C++ 隔离运行器也属于独有能力，但[技术评审](2026-11-05-technical-review.md)指出其沙箱存在逃逸风险；第一轮整改已让生产环境默认关闭学生代码运行，隔离主机和加固沙箱完成前不宜作为卖点。

## 5. 建议补齐的优先级

| 优先级 | 差距 | 实现草图（复用现有模块） |
| --- | --- | --- |
| P1 | 流式回答与阶段状态 | 在 `ai/assistant-turn-worker.service.ts` 与小九通道之间按句缓冲输出，通过 SSE 推送“检索记忆 / 讲解 / 生成图示”等阶段；每一句先过 `ai/teaching-output-policy.ts` 再展示，与技术评审第 3 条“儿童可见输出必经审查”一并落地。持久轮次记录不变，只增加增量事件。 |
| P1 | 服务端语音输入与语音打断 | 复用 `student-media` 的录音规范化（FFmpeg，MEDIA-02）上传短音频，新增与 `ai/speech.service.ts` 同一供应商配置的 ASR 接口，转写结果填入课堂插问和助教输入框；课堂播放器监听按住说话时立即暂停当前句（已有暂停与断点逻辑）。 |
| P1 | 主动提前准备 | 每晚由持久任务队列读取 `memory.feed` 中的到期复测和已确认计划，预生成“明日学案”草稿（`studio-learning-pack.ts` + 复习课堂步骤），状态为待家长确认；`/learn` 首页显示“已为明天准备好”。生成失败如实显示，不自动开始评测。 |
| P2 | 家庭资料摄入扩展 | 作业单 / 教材页拍照走已有 `learning/paper-capture.controller.ts` 的 OCR 候选，确认后作为 `source-course` 材料；DOCX/PPTX 交给 Python 处理 worker 抽取文本，复用 TXT 材料路径和分块规则。原件仍只作家庭私有资料。 |
| P2 | AI 复习资料（一页纸复习单、闪卡、小测） | 以资料课程或评测报告为来源，复用资料课程生成管线产出 `isTeachingOnly` 的复习单，导出复用 CONTENT-15 的 PDF/DOCX 任务；明确标注“不影响掌握判断”。 |
| P2 | 儿童激励层 | 基于课堂里程碑和 `StudioStudyPlan` 完成状态，计算连续学习天数和阶段徽章，只在家长首页和学生今日页展示；数据单独存放，不进入测量计算和报告。 |
| P3 | 家长可编辑的学习偏好 | 在 `students/:id/memory` 旁增加独立的“偏好”段（讲解风格、语速音色、单次时长、兴趣主题），由家长在 `/studio/settings` 编辑，再注入助教上下文；与证据记忆分开，不从聊天自动写入。 |
| P3 | 平板体验与 PWA | 增加 Web manifest 和图标，可安装到主屏幕；针对平板横屏复查课堂与作答控件。不做原生 App。 |

**有意不追的方向：**

- Marketplace、公开发布、课程复制：设计上已排除，还涉及版权和未审内容进入儿童端。
- 付费套餐与计费、机构租户：当前是内部使用阶段。
- Canvas / Schoology / Google OAuth 和成绩回写：国内小学不用，ICS 已够；更该做的是“班级群作业 / 作业单拍照”导入。
- 儿童端开放联网深度检索、1000 页长文档：风险和成本高于收益，可留给成人轨道以后再评估。
- 外部记忆导入、自动人格画像、“完成即掌握”的进度标签：与证据化原则冲突。
- Hyperknow 界面的像素级复刻：[参考状态矩阵](../product/experience/reference-state-matrix.json)已投入大量观察和对照，但对孩子的学习效果没有直接贡献，建议降级为参考。

## 6. 方法与局限

- **访问日期**：2026-11-05。Hyperknow 一侧的“今日”结论来自约 15 次搜索引擎检索。本环境的网页抓取对 hyperknow.io、dev.to 等都返回出口拦截（允许列表为空），所以没有直接打开任何页面，依据是搜索索引对官方页面和第三方页面的摘要，看不到页面更新时间和完整上下文。价格标注为限时折扣，可能随时变化。
- **没有登录** agent.hyperknow.io。应用内行为（Marketplace、记忆开关与导入、Learning Feed 细节、练习界面、音色与倍速、进度标签、单元考试）全部来自团队 2026-10-21～25 的记录，当时版本 v1.3.13，现在可能已经变化。
- **今日未能证实**：Google Calendar 同步、Word/PPT/Excel 支持、Marketplace 是否仍在、支持的语言清单、视频 / YouTube 输入、间隔复习、代码运行沙箱、移动 App。没找到不等于不存在。
- **Hyperknow 时间线**：各来源说法不一（2024-10 首个产品、2025-11 Agent 上线、2026-02 发布 3.0、2026-10-01 发布 AI 课程），本文不依赖具体日期。
- **StudyAgent 一侧**依据 README、设计总册、功能框架和源码抽查，没有运行应用或测试。“已具备”只表示代码路径存在，不表示已有真人、教学效果或实机验证。抽查发现文档口径比实际窄或宽的几处，已按代码写入矩阵：资料文本文件只收 TXT/MD；联网检索服务未接入助教；语音输入只是浏览器内置识别；没有任何激励机制。
- **相关评审**：同日的[技术评审](2026-11-05-technical-review.md)指出儿童可见 AI 输出缺少审查、C++ 运行器沙箱有风险。第 5 节的流式输出和语音建议都以先补齐输出审查为前提。

# StudyAgent 产品建设档案

本目录是 2026-10-19 用户授权的完整产品化建设基线。原有 `doc/module-design` 保留为实现历史；冲突时以本目录的新需求、测量规范和验收条件为准。

当前代码的整体功能、概要设计与逐项实现统一见 [功能与设计总册](../design/README.md) 和 [离线功能浏览器](../design/index.html)。本目录继续保留需求与交付沿革；设计册按当前接入代码区分正常功能、历史只读与未接入声明。

1. [完整需求](./01-requirements.md)：用户、流程、功能、边界、数据与非功能要求。
2. [知识诊断与测量设计](./02-measurement-design.md)：原子知识图谱、评测蓝图、掌握度、错因验证、指导与复盘算法。
3. [开发计划与验收矩阵](./03-development-plan.md)：全量里程碑、依赖、证据和交付条件。
4. [实施记录](./04-delivery-log.md)：实现后逐次记录提交、验证、剩余事项，不能以计划代替交付。
5. [当前完整验收审计](./68-final-product-acceptance-audit.md)：逐项区分已通过、规则估计和仍需真实教材、人员或设备验证的部分。
6. [教材课时映射核对清单](./69-textbook-mapping-worklist-delivery.md)：跨教材定位待审课时并跳转到逐课时人工审核。
7. [完整语文教材源与映射候选](./70-complete-chinese-textbook-source-and-mapping-candidates.md)：12册完整PDF、独立备份和523课时候选证据。
8. [教材课时审核工作台](./71-textbook-review-workbench-delivery.md)：候选证据筛选、受控原页阅读、字节校验和审核进度。
9. [GitHub Linux CI完整通过](../evidence/2026-10-21/ci-verify-runtime.json)：Ubuntu 24.04、Node 24、PostgreSQL 16 的完整远端流水线收据。
10. [GESP辅助指导与间隔复测](./72-gesp-assisted-guidance-retention-delivery.md)：逐级提示、家长确认计划、四阶段复测和双库持久恢复。
11. [GESP试点内容审核发布门禁](./73-gesp-pilot-content-review-delivery.md)：五项教研门禁、内容指纹、版本化审核与双库发布状态。
12. [小学数学与英语完整教材源](./74-primary-source-textbook-migration-delivery.md)：295册完整PDF、28002页、独立备份、来源绑定与无页码伪造门禁。
13. [浏览器产品验收](./75-browser-product-acceptance.md)：三档视口、家长建档、管理员教研入口和 CI 自动浏览器门禁。
14. [教材来源版本绑定防护](./76-textbook-source-version-guard.md)：显式年份、唯一版本、可见冲突原因与安全来源计数。
15. [报告核对请求去重与指导闭环](./77-report-analysis-request-dedup.md)：完整浏览器评测、离线指导、复测排期与同报告单次核对请求。
16. [Hyperknow 拆解与证据化学习记忆](./78-hyperknow-benchmark-and-learning-memory.md)：公开机制比较、可吸收能力、边界和已落地的学习 Feed。
17. [ChinaTextbook 冷归档来源索引](./79-chinatextbook-coldarchive-index.md)：H/E同提交、2,061个逻辑PDF书目的存在清单、拆分卷、教材范围和许可边界。
18. [证据化图形讲解与教材引用](./80-evidence-grounded-visual-guidance-delivery.md)：受限分数条图卡、教学三步讲解、计划引用冻结和页码候选边界。
19. [独立学习工作台](./81-learning-studio-hyperknow-mode.md)：HyperKnow 式门户、持久化课程蓝图、学习 Feed、助教与既有测量闭环整合。
20. [自由白板视频与LMS日历同步](./82-whiteboard-lms-calendar-delivery.md)：逐幕白板、可选AI旁白音轨、字幕视频、学校ICS互通、监护权限与像素校准证据。
21. [MiniMax语音迁移与当前目标审计](./83-live-avatar-speech-and-current-goal-audit.md)：复用live-avatar已验证TTS、真实语音调用、当前完成边界与下一阶段优先级。
22. [诊断计划、PDF页级白板与个性化学案](./84-diagnostic-planner-pdf-and-study-pack-delivery.md)：薄弱点编排、D+1/3/7/14复测、原页与文字层核对、已审核学案/闪卡/微测和移动端验收。
23. [PDF OCR、表格公式恢复与小九AI CLI](./85-pdf-ocr-structure-and-xiaojiu-cli.md)：durable后台任务、扫描页OCR、表格行列与KaTeX公式候选、当前CLI配置继承、人工核对和失败重试。
24. [小九AI全模型接入与聊天选型](./86-all-xiaojiu-models-and-chat-selector.md)：22个真实模型探测、统一目录、按消息选型、Auto默认模型、模型持久化和聊天证据边界。
25. [Windows本地守护与自动恢复](./87-local-windows-daemon.md)：PM2进程守护、健康探针、登录恢复、日志与启停命令。
26. [HyperKnow课堂观察与实施计划](./88-hyperknow-classroom-observation-and-plan.md)：五单元60主题、实时白板课堂、语音、插问、练习、项目与执行边界。
27. [独立教学课堂交付](./89-interactive-classroom-delivery.md)：逐步板书与音画时序、课堂插问、60主题课程、核查项目、代码实验与验证边界。
5. [工程与资产现状评审](../reviews/2026-10-19-studyagent-productization.md) 及其离线 HTML 是本基线的调查依据。

最近交付：[五、六年级数学完整对照评测](./63-math-grade5-grade6-delivery.md) 和 [英语一至六年级完整对照评测](./62-english-grade1-grade6-delivery.md)。当前原创课程258点、15758题，258点达到当前素材结构与组题预算门槛。此前为 [五、六年级语文](./60-chinese-grade5-grade6-delivery.md)、三、四年级语文、二年级语文、一年级语文和英语评测、[GESP C++独立教研轨道](./55-gesp-research-delivery.md) 及数学各阶段交付。分项协议见 [独立诊断交付](./44-atomic-components-delivery.md)。

存储运维：[备份跨盘迁移与空间复核](./59-storage-relocation-and-space-audit.md) 记录全量备份当前位于 `I:\StudyAgent-backups\full-20261019`，以及F盘可迁移与不可清理文件的边界。

下一阶段继续完善教材课时逐项映射、当前候选跨环境、真人录音与听辨、移动触屏和辅助技术验收、真实学生/教师评价和GESP学生编程闭环。

GESP扩展当前包括 [独立教研轨道](./55-gesp-research-delivery.md)、[隔离C++运行器](./65-gesp-isolated-runner-delivery.md)、[一级学生编程试点](./66-gesp-student-pilot-delivery.md) 和 [原始资产独立备份恢复](./67-gesp-backup-restore-delivery.md)。1～4级49点仍需完成逐项内容审核。

GESP后续按 [集成验收](../gesp/integration-handoff.md) 继续内容审核、独立学习范围及程序评测建设；研究题不自动发布到学生诊断。

完成的定义：全部需求有对应实现、适当测试与真实运行证据，资产清单可核验，安装与备份恢复可执行。演示题通过、构建成功、文档齐备中的任何一项都不等于产品目标完成。

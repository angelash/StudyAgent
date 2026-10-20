# StudyAgent 产品建设档案

本目录是 2026-10-19 用户授权的完整产品化建设基线。原有 `doc/module-design` 保留为实现历史；冲突时以本目录的新需求、测量规范和验收条件为准。

1. [完整需求](./01-requirements.md)：用户、流程、功能、边界、数据与非功能要求。
2. [知识诊断与测量设计](./02-measurement-design.md)：原子知识图谱、评测蓝图、掌握度、错因验证、指导与复盘算法。
3. [开发计划与验收矩阵](./03-development-plan.md)：全量里程碑、依赖、证据和交付条件。
4. [实施记录](./04-delivery-log.md)：实现后逐次记录提交、验证、剩余事项，不能以计划代替交付。
5. [当前完整验收审计](./68-final-product-acceptance-audit.md)：逐项区分已通过、规则估计和仍需真实教材、人员或设备验证的部分。
6. [教材课时映射核对清单](./69-textbook-mapping-worklist-delivery.md)：跨教材定位待审课时并跳转到逐课时人工审核。
7. [完整语文教材源与映射候选](./70-complete-chinese-textbook-source-and-mapping-candidates.md)：12册完整PDF、独立备份和523课时候选证据。
8. [教材课时审核工作台](./71-textbook-review-workbench-delivery.md)：候选证据筛选、受控原页阅读、字节校验和审核进度。
9. [GitHub Linux CI完整通过](../evidence/2026-10-21/ci-verify-runtime.json)：Ubuntu 24.04、Node 24、PostgreSQL 16 的完整远端流水线收据。
5. [工程与资产现状评审](../reviews/2026-10-19-studyagent-productization.md) 及其离线 HTML 是本基线的调查依据。

最近交付：[五、六年级数学完整对照评测](./63-math-grade5-grade6-delivery.md) 和 [英语一至六年级完整对照评测](./62-english-grade1-grade6-delivery.md)。当前原创课程258点、15758题，258点达到当前素材结构与组题预算门槛。此前为 [五、六年级语文](./60-chinese-grade5-grade6-delivery.md)、三、四年级语文、二年级语文、一年级语文和英语评测、[GESP C++独立教研轨道](./55-gesp-research-delivery.md) 及数学各阶段交付。分项协议见 [独立诊断交付](./44-atomic-components-delivery.md)。

存储运维：[备份跨盘迁移与空间复核](./59-storage-relocation-and-space-audit.md) 记录全量备份当前位于 `I:\StudyAgent-backups\full-20261019`，以及F盘可迁移与不可清理文件的边界。

下一阶段继续完善教材课时逐项映射、当前候选跨环境、真人录音与听辨、不同设备浏览器验收、真实学生/教师评价和GESP学生编程闭环。

GESP扩展当前包括 [独立教研轨道](./55-gesp-research-delivery.md)、[隔离C++运行器](./65-gesp-isolated-runner-delivery.md)、[一级学生编程试点](./66-gesp-student-pilot-delivery.md) 和 [原始资产独立备份恢复](./67-gesp-backup-restore-delivery.md)。1～4级49点仍需完成逐项内容审核。

GESP后续按 [集成验收](../gesp/integration-handoff.md) 继续内容审核、独立学习范围及程序评测建设；研究题不自动发布到学生诊断。

完成的定义：全部需求有对应实现、适当测试与真实运行证据，资产清单可核验，安装与备份恢复可执行。演示题通过、构建成功、文档齐备中的任何一项都不等于产品目标完成。

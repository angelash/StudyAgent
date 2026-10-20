# StudyAgent 产品建设档案

本目录是 2026-10-19 用户授权的完整产品化建设基线。原有 `doc/module-design` 保留为实现历史；冲突时以本目录的新需求、测量规范和验收条件为准。

1. [完整需求](./01-requirements.md)：用户、流程、功能、边界、数据与非功能要求。
2. [知识诊断与测量设计](./02-measurement-design.md)：原子知识图谱、评测蓝图、掌握度、错因验证、指导与复盘算法。
3. [开发计划与验收矩阵](./03-development-plan.md)：全量里程碑、依赖、证据和交付条件。
4. [实施记录](./04-delivery-log.md)：实现后逐次记录提交、验证、剩余事项，不能以计划代替交付。
5. [工程与资产现状评审](../reviews/2026-10-19-studyagent-productization.md) 及其离线 HTML 是本基线的调查依据。

最近交付：[五、六年级语文完整对照评测](./60-chinese-grade5-grade6-delivery.md)，实施前 [计划与9470题基线](./60-chinese-grade5-grade6-development-plan.md) 已提交。此前为 [三、四年级语文完整对照评测](./59-chinese-grade3-grade4-delivery.md)、[二年级语文完整对照评测](./58-chinese-grade2-delivery.md)、一年级语文和英语评测、[GESP C++独立教研轨道](./55-gesp-research-delivery.md) 及数学各阶段交付。分项协议见 [独立诊断交付](./44-atomic-components-delivery.md)。

存储运维：[备份跨盘迁移与空间复核](./59-storage-relocation-and-space-audit.md) 记录全量备份当前位于 `I:\StudyAgent-backups\full-20261019`，以及F盘可迁移与不可清理文件的边界。

下一阶段集中补齐英语72点、数学33点，并继续完善真人录音、听辨、教材映射和浏览器验收。

GESP后续按 [集成验收](../gesp/integration-handoff.md) 继续内容审核、独立学习范围及程序评测建设；研究题不自动发布到学生诊断。

完成的定义：全部需求有对应实现、适当测试与真实运行证据，资产清单可核验，安装与备份恢复可执行。演示题通过、构建成功、文档齐备中的任何一项都不等于产品目标完成。

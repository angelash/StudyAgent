# 04 掌握量化、原子观察与深层原因 — 详细设计

源码基线：`18450a86f36aa5ca37fa1c1ee08ae0b36d080fbc`。角色：学生、家长、教研。

产品入口：`/student/assessment`、`/parent/dashboard`、`/admin/curriculum`。

## 模块实现

- [apps/api/src/modules/diagnostics/measurement.ts](../../../apps/api/src/modules/diagnostics/measurement.ts)
- [apps/api/src/modules/diagnostics/diagnosis.ts](../../../apps/api/src/modules/diagnostics/diagnosis.ts)
- [apps/api/src/modules/diagnostics/component-observations.ts](../../../apps/api/src/modules/diagnostics/component-observations.ts)
- [apps/api/src/modules/diagnostics/family-identity.ts](../../../apps/api/src/modules/diagnostics/family-identity.ts)
- [apps/api/src/modules/diagnostics/verification-blueprint.ts](../../../apps/api/src/modules/diagnostics/verification-blueprint.ts)

## 共享契约

- [packages/contracts/src/diagnostics.ts](../../../packages/contracts/src/diagnostics.ts)

## 关联验证

以下是对应功能领域的测试入口；测试文件存在不等于每个子场景已由真人或所有设备验证。

- [apps/api/src/modules/diagnostics/measurement.test.ts](../../../apps/api/src/modules/diagnostics/measurement.test.ts)
- [apps/api/src/modules/diagnostics/atomic-components.integration.test.ts](../../../apps/api/src/modules/diagnostics/atomic-components.integration.test.ts)
- [apps/api/src/modules/diagnostics/verification-blueprint.integration.test.ts](../../../apps/api/src/modules/diagnostics/verification-blueprint.integration.test.ts)
- [apps/api/src/modules/diagnostics/family-identity.integration.test.ts](../../../apps/api/src/modules/diagnostics/family-identity.integration.test.ts)

## MEA-01 独立证据筛选与权重

**输入**：已评分响应、当前有效映射和测量时间。

**处理与实现**：同题同版本只取首次证据；排除已曝光和未审核映射；提示等级权重为1/0.6/0.3/0；同题族后续为0.5；按60天半衰期衰减。

**输出**：weightedEvidence列表。

**状态与持久化**：`diagnosticResponses`、`measurementItems`

**权限、失败与边界**：题族规范化防止只改呈现的题被当成新独立题族。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

## MEA-02 Beta掌握估计与可信区间

**输入**：知识点及加权证据。

**处理与实现**：使用Beta(1,1)先验，累加加权得分与失败质量；数值求2.5%/97.5%分位；输出均值、区间、有效样本与四维结果。

**输出**：unknown/insufficient/learning/fragile/secure。

**状态与持久化**：`diagnosticReports`

**权限、失败与边界**：稳定需有效样本至少6、区间下界至少70及迁移/保持验证；不能把百分比解释为标准化能力等级。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

## MEA-03 分步骤原子知识观察

**输入**：已审核componentBindings和scoreDetails。

**处理与实现**：仅从显式绑定的评分键提取分项事实；按requiresKeys区分本步未达标与上游阻断；记录观察来源并指向进一步独立核查。

**输出**：ComponentObservation与验证建议。

**状态与持久化**：`measurementItems`、`diagnosticResponses`、`diagnosticReports`

**权限、失败与边界**：分项观察不是额外独立样本，不重复抬高掌握度。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

## MEA-04 表面事实与四类原因假设

**输入**：独立题族表现、先修图、历史假设。

**处理与实现**：推导理解/执行、先修、表示/迁移与保持假设；保存支持、反证、替代解释和核查条件；冲突保留未定；失败后的独立成功可关闭，后续失败可重开。

**输出**：proposed/testing/supported/contradicted/inconclusive/resolved/reopened等状态。

**状态与持久化**：`diagnosticHypotheses`、`diagnosticResponses`

**权限、失败与边界**：置信级别保持低/中；一次综合题失败不确定归因，AI不直接写入原因结论。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

## MEA-05 原因验证题组与真实保持

**输入**：hypothesisId、目标点/全部直接先修、预算。

**处理与实现**：按原因冻结基础与迁移或目标与先修对照组；每组要求独立题族；完成后核对真实可用观察；保持只能由至少一天后的到期任务核查。

**输出**：支持、反证、未定与缺口。

**状态与持久化**：`diagnosticSessions`、`diagnosticHypotheses`、`reviewTasks`

**权限、失败与边界**：题量或时长不足时显示未满足条件，不能用同题重复补齐。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

# 04 掌握量化、原子观察与深层原因 — 详细设计

源码基线：`54a1b173df739c87092a7cae5d79fa587489f1fb`。角色：学生、家长、教研。

产品入口：`/student/assessment`、`/parent/dashboard`、`/admin/curriculum`。

## 模块实现

- [apps/api/src/modules/diagnostics/measurement.ts](../../../apps/api/src/modules/diagnostics/measurement.ts)
- [apps/api/src/modules/diagnostics/measurement-compatibility.ts](../../../apps/api/src/modules/diagnostics/measurement-compatibility.ts)
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

**输入**：原响应、冻结会话与映射、测量时间。

**处理与实现**：所有已见记录先占用同题键，仅answered/scored且有限0至1评分进入估计；自述、跳过、待复核及未知协议不计量。更早冻结会话证明曝光时派生标记，原记录不变。排除已曝光和未审核映射；提示权重1/0.6/0.3/0，同族后续0.5，60天半衰期。

**输出**：rule-estimate-v3的weightedEvidence列表。

**状态与持久化**：`diagnosticResponses`、`measurementItems`

**权限、失败与边界**：缺失disposition不猜测；题族规范化防止只改呈现的题被当成独立题族。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

**补充实现文件**：

- [apps/api/src/modules/diagnostics/measurement-versioning.integration.test.ts](../../../apps/api/src/modules/diagnostics/measurement-versioning.integration.test.ts)
- [apps/api/src/modules/diagnostics/measurement-compatibility.test.ts](../../../apps/api/src/modules/diagnostics/measurement-compatibility.test.ts)
- [doc/product/139-self-reported-difficulty-and-measurement-versioning.md](../../../doc/product/139-self-reported-difficulty-and-measurement-versioning.md)

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

**处理与实现**：推导理解/执行、先修、表示/迁移与保持假设；保存支持、反证、替代解释和核查条件；冲突保留未定；失败后的独立成功可关闭，后续失败可重开。知识点工作区并排保留表面观察、支持/反证/自我报告、替代解释、先修关系和完整状态历史。

**输出**：proposed/testing/supported/contradicted/inconclusive/resolved/reopened等状态。

**状态与持久化**：`diagnosticHypotheses`、`diagnosticResponses`

**权限、失败与边界**：置信级别保持低/中；一次综合题失败不确定归因，AI不直接写入原因结论。受控原因投影仅验证界面与操作边界，不代替真实因果验证。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

**补充实现文件**：

- [apps/web/components/knowledge-report-workspace.tsx](../../../apps/web/components/knowledge-report-workspace.tsx)
- [doc/product/126-knowledge-report-workspace-and-evidence-paths.md](../../../doc/product/126-knowledge-report-workspace-and-evidence-paths.md)
- [tests/e2e/knowledge-report.spec.ts](../../../tests/e2e/knowledge-report.spec.ts)
- [doc/evidence/2026-10-26/knowledge-report-focused/receipt.json](../../../doc/evidence/2026-10-26/knowledge-report-focused/receipt.json)

## MEA-05 原因验证题组与真实保持

**输入**：hypothesisId、目标点/全部直接先修、预算。

**处理与实现**：按原因冻结基础与迁移或目标与先修对照组；每组要求独立题族；完成后核对真实可用观察；保持只能由至少一天后的到期任务核查。报告中先预览原蓝图再确认开测，终态原因不提供验证按钮，保持原因指向原计划间隔任务。

**输出**：支持、反证、未定与缺口。

**状态与持久化**：`diagnosticSessions`、`diagnosticHypotheses`、`reviewTasks`

**权限、失败与边界**：题量或时长不足时显示未满足条件，不能用同题重复补齐；切换知识点或预览不会创建评测。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

**补充实现文件**：

- [apps/web/components/knowledge-report-workspace.tsx](../../../apps/web/components/knowledge-report-workspace.tsx)
- [apps/web/components/report-plan-path.tsx](../../../apps/web/components/report-plan-path.tsx)
- [doc/product/126-knowledge-report-workspace-and-evidence-paths.md](../../../doc/product/126-knowledge-report-workspace-and-evidence-paths.md)
- [tests/e2e/knowledge-report.spec.ts](../../../tests/e2e/knowledge-report.spec.ts)
- [doc/evidence/2026-10-26/knowledge-report-focused/receipt.json](../../../doc/evidence/2026-10-26/knowledge-report-focused/receipt.json)

## MEA-06 受控原因对照与双来源条件指导

**输入**：实际教研原题、共享确认、冻结配对与当前范围、本人原命令、普通独立基准及原受控报告。

**处理与实现**：只读核对原题后明确审核/发布与修订/撤回；本人固定题序和原首答，整组结束前共同延后评分披露；两侧仅计原因观察。普通独立报告供能力/保持基准，受控原报告补充条件指导，孩子本人活动后由新独立配对支持或反驳。评分和明确重分析追加版本并保护原指导历史；私人命令与匿名共享原件分开，实际删除账本及双库原生读取核对来源。工作台沿原样式、弹窗、完整副本与退出保护。

**输出**：审核与预览原件、配对支持/反证、明确规则计划、本人只写活动与历史、schema30原生恢复。

**状态与持久化**：`controlledMaterialReviews`、`controlledContrastPublications`、`controlledContrastReleases`、`controlledEditorialCommands`、`controlledContrastPreviews`、`diagnosticSessions`、`diagnosticResponses`、`diagnosticReports`、`diagnosticPlans`、`practiceSessions`

**权限、失败与边界**：完整API2246/0/101；实际PG批20按9业务/5PG读取器/6重复SQLite分列。627唯一浏览器用例分片626通过/1登录导航ERR_NO_BUFFER_SPACE，原失败另批精确1项通过，不称627单次全绿；新两实例测试SQLite/PG各1另计。正式仍24/revision187且构建保持；原72/WS、纸面/全教材/GESP、教师/实机/真人长期及整体交付未完成。

**关联接口**：

- `GET /api/admin/controlled-contrasts/materials/:itemId/preflight` → `ControlledEditorialController.preflight`；[apps/api/src/modules/diagnostics/controlled-editorial.controller.ts:10](../../../apps/api/src/modules/diagnostics/controlled-editorial.controller.ts#L10)。
- `GET /api/admin/controlled-contrasts/material-reviews` → `ControlledEditorialController.reviews`；[apps/api/src/modules/diagnostics/controlled-editorial.controller.ts:12](../../../apps/api/src/modules/diagnostics/controlled-editorial.controller.ts#L12)。
- `POST /api/admin/controlled-contrasts/material-reviews` → `ControlledEditorialController.review`；[apps/api/src/modules/diagnostics/controlled-editorial.controller.ts:14](../../../apps/api/src/modules/diagnostics/controlled-editorial.controller.ts#L14)。
- `GET /api/admin/controlled-contrasts/protocols` → `ControlledEditorialController.protocols`；[apps/api/src/modules/diagnostics/controlled-editorial.controller.ts:16](../../../apps/api/src/modules/diagnostics/controlled-editorial.controller.ts#L16)。
- `GET /api/admin/controlled-contrasts/protocols/:logicalId/history` → `ControlledEditorialController.history`；[apps/api/src/modules/diagnostics/controlled-editorial.controller.ts:18](../../../apps/api/src/modules/diagnostics/controlled-editorial.controller.ts#L18)。
- `POST /api/admin/controlled-contrasts/protocols` → `ControlledEditorialController.publish`；[apps/api/src/modules/diagnostics/controlled-editorial.controller.ts:20](../../../apps/api/src/modules/diagnostics/controlled-editorial.controller.ts#L20)。
- `POST /api/admin/controlled-contrasts/protocols/withdrawals` → `ControlledEditorialController.withdraw`；[apps/api/src/modules/diagnostics/controlled-editorial.controller.ts:22](../../../apps/api/src/modules/diagnostics/controlled-editorial.controller.ts#L22)。
- `GET /api/admin/controlled-contrasts/commands/:requestKey` → `ControlledEditorialController.receipt`；[apps/api/src/modules/diagnostics/controlled-editorial.controller.ts:24](../../../apps/api/src/modules/diagnostics/controlled-editorial.controller.ts#L24)。
- `GET /api/diagnostics/students/:studentId/controlled-contrasts` → `ControlledDiagnosticsController.available`；[apps/api/src/modules/diagnostics/controlled-diagnostics.controller.ts:10](../../../apps/api/src/modules/diagnostics/controlled-diagnostics.controller.ts#L10)。
- `GET /api/diagnostics/students/:studentId/controlled-preview-requests/:requestKey` → `ControlledDiagnosticsController.creationResult`；[apps/api/src/modules/diagnostics/controlled-diagnostics.controller.ts:12](../../../apps/api/src/modules/diagnostics/controlled-diagnostics.controller.ts#L12)。
- `GET /api/diagnostics/controlled-contrasts/previews/:id/start-requests/:requestKey` → `ControlledDiagnosticsController.startResult`；[apps/api/src/modules/diagnostics/controlled-diagnostics.controller.ts:14](../../../apps/api/src/modules/diagnostics/controlled-diagnostics.controller.ts#L14)。
- `POST /api/diagnostics/controlled-contrasts/previews` → `ControlledDiagnosticsController.preview`；[apps/api/src/modules/diagnostics/controlled-diagnostics.controller.ts:16](../../../apps/api/src/modules/diagnostics/controlled-diagnostics.controller.ts#L16)。
- `GET /api/diagnostics/controlled-contrasts/previews/:id` → `ControlledDiagnosticsController.get`；[apps/api/src/modules/diagnostics/controlled-diagnostics.controller.ts:18](../../../apps/api/src/modules/diagnostics/controlled-diagnostics.controller.ts#L18)。
- `GET /api/diagnostics/students/:studentId/controlled-previews` → `ControlledDiagnosticsController.list`；[apps/api/src/modules/diagnostics/controlled-diagnostics.controller.ts:20](../../../apps/api/src/modules/diagnostics/controlled-diagnostics.controller.ts#L20)。
- `POST /api/diagnostics/controlled-contrasts/previews/:id/start` → `ControlledDiagnosticsController.start`；[apps/api/src/modules/diagnostics/controlled-diagnostics.controller.ts:22](../../../apps/api/src/modules/diagnostics/controlled-diagnostics.controller.ts#L22)。
- `GET /api/diagnostics/students/:studentId/controlled-guidance-options` → `DiagnosticsController.controlledGuidanceOptions`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:152](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L152)。
- `GET /api/diagnostics/students/:studentId/controlled-guidance-requests/:requestKey` → `DiagnosticsController.controlledGuidanceResult`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:154](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L154)。

**服务方法**：

- `ControlledEditorialService.materialPreflight`；[apps/api/src/modules/diagnostics/controlled-editorial.service.ts:41](../../../apps/api/src/modules/diagnostics/controlled-editorial.service.ts#L41)。
- `ControlledEditorialService.reviews`；[apps/api/src/modules/diagnostics/controlled-editorial.service.ts:52](../../../apps/api/src/modules/diagnostics/controlled-editorial.service.ts#L52)。
- `ControlledEditorialService.execute`；[apps/api/src/modules/diagnostics/controlled-editorial.service.ts:78](../../../apps/api/src/modules/diagnostics/controlled-editorial.service.ts#L78)。
- `ControlledEditorialService.publications`；[apps/api/src/modules/diagnostics/controlled-editorial.service.ts:58](../../../apps/api/src/modules/diagnostics/controlled-editorial.service.ts#L58)。
- `ControlledEditorialService.history`；[apps/api/src/modules/diagnostics/controlled-editorial.service.ts:67](../../../apps/api/src/modules/diagnostics/controlled-editorial.service.ts#L67)。
- `ControlledEditorialService.commandResult`；[apps/api/src/modules/diagnostics/controlled-editorial.service.ts:73](../../../apps/api/src/modules/diagnostics/controlled-editorial.service.ts#L73)。
- `ControlledDiagnosticsService.available`；[apps/api/src/modules/diagnostics/controlled-diagnostics.service.ts:84](../../../apps/api/src/modules/diagnostics/controlled-diagnostics.service.ts#L84)。
- `ControlledDiagnosticsService.creationResult`；[apps/api/src/modules/diagnostics/controlled-diagnostics.service.ts:73](../../../apps/api/src/modules/diagnostics/controlled-diagnostics.service.ts#L73)。
- `ControlledDiagnosticsService.startResult`；[apps/api/src/modules/diagnostics/controlled-diagnostics.service.ts:79](../../../apps/api/src/modules/diagnostics/controlled-diagnostics.service.ts#L79)。
- `ControlledDiagnosticsService.preview`；[apps/api/src/modules/diagnostics/controlled-diagnostics.service.ts:109](../../../apps/api/src/modules/diagnostics/controlled-diagnostics.service.ts#L109)。
- `ControlledDiagnosticsService.get`；[apps/api/src/modules/diagnostics/controlled-diagnostics.service.ts:72](../../../apps/api/src/modules/diagnostics/controlled-diagnostics.service.ts#L72)。
- `ControlledDiagnosticsService.list`；[apps/api/src/modules/diagnostics/controlled-diagnostics.service.ts:101](../../../apps/api/src/modules/diagnostics/controlled-diagnostics.service.ts#L101)。
- `ControlledDiagnosticsService.start`；[apps/api/src/modules/diagnostics/controlled-diagnostics.service.ts:135](../../../apps/api/src/modules/diagnostics/controlled-diagnostics.service.ts#L135)。
- `GuidanceService.controlledOptions`；[apps/api/src/modules/diagnostics/guidance.service.ts:186](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L186)。
- `GuidanceService.controlledCreationResult`；[apps/api/src/modules/diagnostics/guidance.service.ts:197](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L197)。

**补充实现文件**：

- [packages/contracts/src/controlled-contrast.ts](../../../packages/contracts/src/controlled-contrast.ts)
- [apps/api/src/modules/diagnostics/controlled-native.ts](../../../apps/api/src/modules/diagnostics/controlled-native.ts)
- [apps/api/src/modules/diagnostics/controlled-guidance-basis.ts](../../../apps/api/src/modules/diagnostics/controlled-guidance-basis.ts)
- [apps/api/src/modules/diagnostics/controlled-storage.integration.test.ts](../../../apps/api/src/modules/diagnostics/controlled-storage.integration.test.ts)
- [apps/api/src/modules/diagnostics/controlled-contexts.integration.test.ts](../../../apps/api/src/modules/diagnostics/controlled-contexts.integration.test.ts)
- [apps/web/components/controlled-contrast-planner.tsx](../../../apps/web/components/controlled-contrast-planner.tsx)
- [apps/web/components/controlled-guidance-panel.tsx](../../../apps/web/components/controlled-guidance-panel.tsx)
- [apps/web/app/admin/curriculum/controlled-editorial-panel.tsx](../../../apps/web/app/admin/curriculum/controlled-editorial-panel.tsx)
- [tests/e2e/controlled-contrasts.spec.ts](../../../tests/e2e/controlled-contrasts.spec.ts)
- [doc/product/163-controlled-cause-contrasts-and-counterevidence.md](../../../doc/product/163-controlled-cause-contrasts-and-counterevidence.md)
- [doc/evidence/2026-10-31/workspace-r3-controlled-contrasts/receipt.json](../../../doc/evidence/2026-10-31/workspace-r3-controlled-contrasts/receipt.json)

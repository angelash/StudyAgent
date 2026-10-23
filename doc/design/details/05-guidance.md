# 05 指导计划、训练编排与间隔复盘 — 详细设计

源码基线：`9c2821c8b706e2417703061b378e961cef8c3412`。角色：监护家长、学生、授权教师。

产品入口：`/student/assessment`、`/student/today`、`/parent/dashboard`。

## 模块实现

- [apps/api/src/modules/diagnostics/guidance.service.ts](../../../apps/api/src/modules/diagnostics/guidance.service.ts)
- [apps/api/src/modules/learning/learning.service.ts](../../../apps/api/src/modules/learning/learning.service.ts)
- [apps/api/src/modules/diagnostics/learning-source-citation.ts](../../../apps/api/src/modules/diagnostics/learning-source-citation.ts)

## 共享契约

- [packages/contracts/src/diagnostics.ts](../../../packages/contracts/src/diagnostics.ts)
- [packages/contracts/src/learning.ts](../../../packages/contracts/src/learning.ts)

## 关联验证

以下是对应功能领域的测试入口；测试文件存在不等于每个子场景已由真人或所有设备验证。

- [apps/api/src/modules/diagnostics/diagnostics.integration.test.ts](../../../apps/api/src/modules/diagnostics/diagnostics.integration.test.ts)
- [apps/api/src/modules/learning/notebook.integration.test.ts](../../../apps/api/src/modules/learning/notebook.integration.test.ts)
- [apps/api/src/modules/ai/evidence-coach.integration.test.ts](../../../apps/api/src/modules/ai/evidence-coach.integration.test.ts)

## PLAN-01 从报告制定证据化指导计划

**输入**：完成的baselineSessionId、每天5–60分钟、useAi。

**处理与实现**：拒绝过期定义或旧题族分析；优先支持的先修阻断与低证据知识点；最多选3个行动并分配时长；冻结证据、成功标准、教学卡与教材引用。

**输出**：proposed计划及可选AI活动说明。

**状态与持久化**：`diagnosticPlans`、`guidancePlanRevisions`

**权限、失败与边界**：AI只能润色受约束行动，不能改写分数、知识点或证据ID。

**关联接口**：

- `POST /api/diagnostics/students/:studentId/plans` → `DiagnosticsController.plan`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:122](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L122)。

**服务方法**：

- `GuidanceService.create`；[apps/api/src/modules/diagnostics/guidance.service.ts:40](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L40)。

## PLAN-02 计划确认、暂停、调整与历史

**输入**：计划状态、调整理由、expectedRevision、requestKey。

**处理与实现**：监护人确认后生效；暂停阻止继续训练；调整保存新修订和原因；历史保留每版行动与基线报告版本。

**输出**：当前计划、修订历史。

**状态与持久化**：`diagnosticPlans`、`guidancePlanRevisions`

**权限、失败与边界**：状态或定义变化时旧页面不能盲目覆盖；不同于旧版未接入的周计划。

**关联接口**：

- `GET /api/diagnostics/students/:studentId/plans` → `DiagnosticsController.plans`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:124](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L124)。
- `GET /api/diagnostics/plans/:planId` → `DiagnosticsController.getPlan`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:128](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L128)。
- `PATCH /api/diagnostics/plans/:planId` → `DiagnosticsController.updatePlan`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:126](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L126)。
- `POST /api/diagnostics/plans/:planId/adjust` → `DiagnosticsController.adjustPlan`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:134](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L134)。
- `GET /api/diagnostics/plans/:planId/history` → `DiagnosticsController.planHistory`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:130](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L130)。

**服务方法**：

- `GuidanceService.list`；[apps/api/src/modules/diagnostics/guidance.service.ts:108](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L108)。
- `GuidanceService.get`；[apps/api/src/modules/diagnostics/guidance.service.ts:114](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L114)。
- `GuidanceService.update`；[apps/api/src/modules/diagnostics/guidance.service.ts:216](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L216)。
- `GuidanceService.adjust`；[apps/api/src/modules/diagnostics/guidance.service.ts:182](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L182)。
- `GuidanceService.history`；[apps/api/src/modules/diagnostics/guidance.service.ts:115](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L115)。

## PLAN-03 到期复测、改期与启动

**输入**：reviewId、新日期、开始命令。

**处理与实现**：按1/3/7/14日安排不同阶段复测；到期后使用独立新题和可比定义；复测关联原计划与阶段；保留不足或待复核状态。

**输出**：到期清单与冻结复测会话。

**状态与持久化**：`reviewTasks`、`diagnosticSessions`

**权限、失败与边界**：当天换题不能充当保持；重复启动不能重复安排同阶段任务。

**关联接口**：

- `GET /api/diagnostics/students/:studentId/reviews` → `DiagnosticsController.reviews`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:136](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L136)。
- `GET /api/diagnostics/plans/:planId/reviews` → `DiagnosticsController.planReviews`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:132](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L132)。
- `POST /api/diagnostics/reviews/:reviewId/reschedule` → `DiagnosticsController.reschedule`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:140](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L140)。
- `POST /api/diagnostics/reviews/:reviewId/start` → `DiagnosticsController.review`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:138](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L138)。

**服务方法**：

- `GuidanceService.reviews`；[apps/api/src/modules/diagnostics/guidance.service.ts:250](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L250)。
- `GuidanceService.planReviews`；[apps/api/src/modules/diagnostics/guidance.service.ts:256](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L256)。
- `GuidanceService.reschedule`；[apps/api/src/modules/diagnostics/guidance.service.ts:267](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L267)。
- `GuidanceService.startReview`；[apps/api/src/modules/diagnostics/guidance.service.ts:290](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L290)。

## PLAN-04 干预前后复盘与家长确认

**输入**：计划、基线与复测、确认记录。

**处理与实现**：比较可比定义、独立样本、提示、迁移与保持；显示尚未到期、样本不足或待复核；家长确认阅读并记录后续动作。

**输出**：retrospective与复盘回执。

**状态与持久化**：`diagnosticPlans`、`reviewTasks`、`diagnosticReports`、`guidancePlanRevisions`

**权限、失败与边界**：训练完成率和能力变化分开；评分修订不当作学习改善。

**关联接口**：

- `GET /api/diagnostics/plans/:planId/retrospective` → `DiagnosticsController.retrospective`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:142](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L142)。
- `POST /api/diagnostics/plans/:planId/retrospective/acknowledge` → `DiagnosticsController.acknowledgeRetrospective`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:144](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L144)。

**服务方法**：

- `GuidanceService.retrospective`；[apps/api/src/modules/diagnostics/guidance.service.ts:304](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L304)。
- `GuidanceService.acknowledgeRetrospective`；[apps/api/src/modules/diagnostics/guidance.service.ts:364](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L364)。

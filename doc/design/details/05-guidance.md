# 05 指导计划、训练编排与间隔复盘 — 详细设计

源码基线：`944d93a46960bba598e991712f05b76d6c6be2cf`。角色：监护家长、学生、授权教师。

产品入口：`/student/assessment`、`/student/today`、`/parent/dashboard`。

## 模块实现

- [apps/api/src/modules/diagnostics/guidance.service.ts](../../../apps/api/src/modules/diagnostics/guidance.service.ts)
- [apps/api/src/modules/learning/learning.service.ts](../../../apps/api/src/modules/learning/learning.service.ts)
- [apps/api/src/modules/diagnostics/learning-source-citation.ts](../../../apps/api/src/modules/diagnostics/learning-source-citation.ts)
- [apps/api/src/modules/diagnostics/guidance-model.service.ts](../../../apps/api/src/modules/diagnostics/guidance-model.service.ts)
- [apps/api/src/modules/diagnostics/guidance-model-worker.service.ts](../../../apps/api/src/modules/diagnostics/guidance-model-worker.service.ts)
- [apps/api/src/modules/diagnostics/guidance-model-record.ts](../../../apps/api/src/modules/diagnostics/guidance-model-record.ts)
- [apps/web/components/guidance-model-panel.tsx](../../../apps/web/components/guidance-model-panel.tsx)
- [apps/web/lib/guidance-creation.ts](../../../apps/web/lib/guidance-creation.ts)

## 共享契约

- [packages/contracts/src/diagnostics.ts](../../../packages/contracts/src/diagnostics.ts)
- [packages/contracts/src/learning.ts](../../../packages/contracts/src/learning.ts)
- [packages/contracts/src/guidance-model.ts](../../../packages/contracts/src/guidance-model.ts)

## 关联验证

以下是对应功能领域的测试入口；测试文件存在不等于每个子场景已由真人或所有设备验证。

- [apps/api/src/modules/diagnostics/diagnostics.integration.test.ts](../../../apps/api/src/modules/diagnostics/diagnostics.integration.test.ts)
- [apps/api/src/modules/learning/notebook.integration.test.ts](../../../apps/api/src/modules/learning/notebook.integration.test.ts)
- [apps/api/src/modules/ai/evidence-coach.integration.test.ts](../../../apps/api/src/modules/ai/evidence-coach.integration.test.ts)
- [apps/api/src/modules/diagnostics/guidance-model-record.test.ts](../../../apps/api/src/modules/diagnostics/guidance-model-record.test.ts)
- [apps/api/src/modules/diagnostics/guidance-model.integration.test.ts](../../../apps/api/src/modules/diagnostics/guidance-model.integration.test.ts)
- [apps/api/src/modules/diagnostics/guidance-model-recovery.integration.test.ts](../../../apps/api/src/modules/diagnostics/guidance-model-recovery.integration.test.ts)
- [tests/e2e/guidance-model.spec.ts](../../../tests/e2e/guidance-model.spec.ts)

## PLAN-01 从报告制定证据化指导计划

**输入**：完成的baselineSessionId、报告版本、每天5–60分钟、useAi与requestKey。

**处理与实现**：拒绝过期定义或旧题族分析；优先支持的先修阻断与低证据知识点；最多选3个行动并分配时长；冻结证据、成功标准、教学卡与教材引用。规则计划与可选说明任务同事务保存；完整原创建命令先暂存，丢回执先读取再重放。

**输出**：立即可用的proposed规则计划与精确创建回执。

**状态与持久化**：`diagnosticPlans`、`guidancePlanRevisions`

**权限、失败与边界**：AI说明独立生成并等待明确采用，不在创建事务等待模型；不可用模型仍保留规则计划和明确原因。

**关联接口**：

- `POST /api/diagnostics/students/:studentId/plans` → `DiagnosticsController.plan`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:122](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L122)。
- `GET /api/diagnostics/students/:studentId/plan-requests/:requestKey` → `DiagnosticsController.planCreationResult`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:126](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L126)。

**服务方法**：

- `GuidanceService.create`；[apps/api/src/modules/diagnostics/guidance.service.ts:43](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L43)。
- `GuidanceService.creationResult`；[apps/api/src/modules/diagnostics/guidance.service.ts:149](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L149)。

## PLAN-02 计划确认、暂停、调整与历史

**输入**：计划状态、调整理由、expectedRevision、requestKey。

**处理与实现**：监护人确认后生效；暂停阻止继续训练；调整保存新修订和原因；历史保留每版行动与基线报告版本。

**输出**：当前计划、修订历史。

**状态与持久化**：`diagnosticPlans`、`guidancePlanRevisions`

**权限、失败与边界**：状态或定义变化时旧页面不能盲目覆盖；不同于旧版未接入的周计划。

**关联接口**：

- `GET /api/diagnostics/students/:studentId/plans` → `DiagnosticsController.plans`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:124](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L124)。
- `GET /api/diagnostics/plans/:planId` → `DiagnosticsController.getPlan`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:130](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L130)。
- `PATCH /api/diagnostics/plans/:planId` → `DiagnosticsController.updatePlan`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:128](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L128)。
- `POST /api/diagnostics/plans/:planId/adjust` → `DiagnosticsController.adjustPlan`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:136](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L136)。
- `GET /api/diagnostics/plans/:planId/history` → `DiagnosticsController.planHistory`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:132](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L132)。

**服务方法**：

- `GuidanceService.list`；[apps/api/src/modules/diagnostics/guidance.service.ts:142](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L142)。
- `GuidanceService.get`；[apps/api/src/modules/diagnostics/guidance.service.ts:148](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L148)。
- `GuidanceService.update`；[apps/api/src/modules/diagnostics/guidance.service.ts:256](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L256)。
- `GuidanceService.adjust`；[apps/api/src/modules/diagnostics/guidance.service.ts:222](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L222)。
- `GuidanceService.history`；[apps/api/src/modules/diagnostics/guidance.service.ts:155](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L155)。

## PLAN-03 到期复测、改期与启动

**输入**：reviewId、新日期、开始命令。

**处理与实现**：按1/3/7/14日安排不同阶段复测；到期后使用独立新题和可比定义；复测关联原计划与阶段；保留不足或待复核状态。

**输出**：到期清单与冻结复测会话。

**状态与持久化**：`reviewTasks`、`diagnosticSessions`

**权限、失败与边界**：当天换题不能充当保持；重复启动不能重复安排同阶段任务。

**关联接口**：

- `GET /api/diagnostics/students/:studentId/reviews` → `DiagnosticsController.reviews`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:138](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L138)。
- `GET /api/diagnostics/plans/:planId/reviews` → `DiagnosticsController.planReviews`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:134](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L134)。
- `POST /api/diagnostics/reviews/:reviewId/reschedule` → `DiagnosticsController.reschedule`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:142](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L142)。
- `POST /api/diagnostics/reviews/:reviewId/start` → `DiagnosticsController.review`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:140](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L140)。

**服务方法**：

- `GuidanceService.reviews`；[apps/api/src/modules/diagnostics/guidance.service.ts:290](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L290)。
- `GuidanceService.planReviews`；[apps/api/src/modules/diagnostics/guidance.service.ts:296](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L296)。
- `GuidanceService.reschedule`；[apps/api/src/modules/diagnostics/guidance.service.ts:307](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L307)。
- `GuidanceService.startReview`；[apps/api/src/modules/diagnostics/guidance.service.ts:330](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L330)。

## PLAN-04 干预前后复盘与家长确认

**输入**：计划、基线与复测、确认记录。

**处理与实现**：比较可比定义、独立样本、提示、迁移与保持；显示尚未到期、样本不足或待复核；家长确认阅读并记录后续动作。

**输出**：retrospective与复盘回执。

**状态与持久化**：`diagnosticPlans`、`reviewTasks`、`diagnosticReports`、`guidancePlanRevisions`

**权限、失败与边界**：训练完成率和能力变化分开；评分修订不当作学习改善。

**关联接口**：

- `GET /api/diagnostics/plans/:planId/retrospective` → `DiagnosticsController.retrospective`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:144](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L144)。
- `POST /api/diagnostics/plans/:planId/retrospective/acknowledge` → `DiagnosticsController.acknowledgeRetrospective`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:146](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L146)。

**服务方法**：

- `GuidanceService.retrospective`；[apps/api/src/modules/diagnostics/guidance.service.ts:344](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L344)。
- `GuidanceService.acknowledgeRetrospective`；[apps/api/src/modules/diagnostics/guidance.service.ts:404](../../../apps/api/src/modules/diagnostics/guidance.service.ts#L404)。

## PLAN-05 持久模型说明建议与明确采用

**输入**：原计划revision、原请求键、小九modelId与采用命令。

**处理与实现**：Auto冻结实际模型；独立SQL任务生成/校验/发布，租约、授权、计划/报告/知识定义变化拒绝迟到写入。完整原建议/采用命令可恢复，历史分页，取消与原模型重试分开；对照原说明与建议，明确采用才追加计划修订。

**输出**：真实任务状态、冻结说明对照、采用版本与可导出历史。

**状态与持久化**：`guidanceModelSuggestions`、`diagnosticPlans`、`guidancePlanRevisions`

**权限、失败与边界**：只改summary和activity；知识点、时长、资源、成功标准、复测日期、证据和原因状态不由模型改写。不同家庭缓存及旧链接隔离；生成成功不表示教学有效。

**关联接口**：

- `POST /api/diagnostics/plans/:planId/model-suggestions` → `GuidanceModelController.create`；[apps/api/src/modules/diagnostics/guidance-model.controller.ts:9](../../../apps/api/src/modules/diagnostics/guidance-model.controller.ts#L9)。
- `GET /api/diagnostics/plans/:planId/model-suggestions` → `GuidanceModelController.list`；[apps/api/src/modules/diagnostics/guidance-model.controller.ts:10](../../../apps/api/src/modules/diagnostics/guidance-model.controller.ts#L10)。
- `GET /api/diagnostics/plans/:planId/model-suggestions/:id` → `GuidanceModelController.get`；[apps/api/src/modules/diagnostics/guidance-model.controller.ts:11](../../../apps/api/src/modules/diagnostics/guidance-model.controller.ts#L11)。
- `POST /api/diagnostics/plans/:planId/model-suggestions/:id/cancel` → `GuidanceModelController.cancel`；[apps/api/src/modules/diagnostics/guidance-model.controller.ts:12](../../../apps/api/src/modules/diagnostics/guidance-model.controller.ts#L12)。
- `POST /api/diagnostics/plans/:planId/model-suggestions/:id/retry` → `GuidanceModelController.retry`；[apps/api/src/modules/diagnostics/guidance-model.controller.ts:13](../../../apps/api/src/modules/diagnostics/guidance-model.controller.ts#L13)。
- `POST /api/diagnostics/plans/:planId/model-suggestions/:id/adopt` → `GuidanceModelController.adopt`；[apps/api/src/modules/diagnostics/guidance-model.controller.ts:14](../../../apps/api/src/modules/diagnostics/guidance-model.controller.ts#L14)。

**服务方法**：

- `GuidanceModelService.create`；[apps/api/src/modules/diagnostics/guidance-model.service.ts:76](../../../apps/api/src/modules/diagnostics/guidance-model.service.ts#L76)。
- `GuidanceModelService.list`；[apps/api/src/modules/diagnostics/guidance-model.service.ts:64](../../../apps/api/src/modules/diagnostics/guidance-model.service.ts#L64)。
- `GuidanceModelService.get`；[apps/api/src/modules/diagnostics/guidance-model.service.ts:63](../../../apps/api/src/modules/diagnostics/guidance-model.service.ts#L63)。
- `GuidanceModelService.control`；[apps/api/src/modules/diagnostics/guidance-model.service.ts:106](../../../apps/api/src/modules/diagnostics/guidance-model.service.ts#L106)。
- `GuidanceModelService.adopt`；[apps/api/src/modules/diagnostics/guidance-model.service.ts:121](../../../apps/api/src/modules/diagnostics/guidance-model.service.ts#L121)。

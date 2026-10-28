# 11 主观复核、异常反馈与质量闭环 — 详细设计

源码基线：`02a350b596666ac1cc4481a7953988ca07059de0`。角色：授权教师、管理员、学生与家长。

产品入口：`/admin/reviews`、`/student/assessment`、`/student/today`。

## 模块实现

- [apps/api/src/modules/reviews/reviews.service.ts](../../../apps/api/src/modules/reviews/reviews.service.ts)
- [apps/api/src/modules/diagnostics/scoring-review.ts](../../../apps/api/src/modules/diagnostics/scoring-review.ts)

## 共享契约

- [packages/contracts/src/reviews.ts](../../../packages/contracts/src/reviews.ts)
- [packages/contracts/src/diagnostics.ts](../../../packages/contracts/src/diagnostics.ts)

## 关联验证

以下是对应功能领域的测试入口；测试文件存在不等于每个子场景已由真人或所有设备验证。

- [apps/api/src/modules/reviews/reviews.integration.test.ts](../../../apps/api/src/modules/reviews/reviews.integration.test.ts)

## REVIEW-01 评测/训练统一量规复核队列

**输入**：kind、responseId、冻结量规、分项评分、理由与版本。

**处理与实现**：按权限列出待复核表达；读取题面和受控附件；依据冻结量规追加修订；评测重生成报告，训练读取有效评分。

**输出**：审核队列、评分回执与历史。

**状态与持久化**：`diagnosticResponses`、`practiceAttempts`、`scoringRevisions`、`practiceScoringRevisions`

**权限、失败与边界**：授权教师只查看被授权学生；不能用AI文本直接替代人工量规。

**关联接口**：

- `GET /api/admin/reviews` → `ReviewsController.queue`；[apps/api/src/modules/reviews/reviews.controller.ts:11](../../../apps/api/src/modules/reviews/reviews.controller.ts#L11)。
- `GET /api/admin/reviews/:kind/:responseId` → `ReviewsController.detail`；[apps/api/src/modules/reviews/reviews.controller.ts:13](../../../apps/api/src/modules/reviews/reviews.controller.ts#L13)。
- `POST /api/admin/reviews/:kind/:responseId` → `ReviewsController.review`；[apps/api/src/modules/reviews/reviews.controller.ts:17](../../../apps/api/src/modules/reviews/reviews.controller.ts#L17)。

**服务方法**：

- `ReviewsService.queue`；[apps/api/src/modules/reviews/reviews.service.ts:42](../../../apps/api/src/modules/reviews/reviews.service.ts#L42)。
- `ReviewsService.detail`；[apps/api/src/modules/reviews/reviews.service.ts:71](../../../apps/api/src/modules/reviews/reviews.service.ts#L71)。
- `ReviewsService.review`；[apps/api/src/modules/reviews/reviews.service.ts:89](../../../apps/api/src/modules/reviews/reviews.service.ts#L89)。

## REVIEW-02 证据异议与家庭反馈处理

**输入**：证据/报告引用、异常原因、处理决定。

**处理与实现**：家庭提交题意、评分、误触或状态反馈；保存来源和主体；教研按权限处理并记录理由；反馈与评分修订分别保存。

**输出**：可追踪的异议状态。

**状态与持久化**：`evidenceFeedback`

**权限、失败与边界**：反馈不是自动把答案改对，所有结论仍需相应证据或复核。

**关联接口**：

- `POST /api/learning/feedback` → `ReviewsController.feedback`；[apps/api/src/modules/reviews/reviews.controller.ts:21](../../../apps/api/src/modules/reviews/reviews.controller.ts#L21)。
- `GET /api/learning/feedback` → `ReviewsController.feedbackList`；[apps/api/src/modules/reviews/reviews.controller.ts:23](../../../apps/api/src/modules/reviews/reviews.controller.ts#L23)。
- `GET /api/admin/evidence-feedback` → `ReviewsController.feedbackQueue`；[apps/api/src/modules/reviews/reviews.controller.ts:25](../../../apps/api/src/modules/reviews/reviews.controller.ts#L25)。
- `PATCH /api/admin/evidence-feedback/:feedbackId` → `ReviewsController.resolveFeedback`；[apps/api/src/modules/reviews/reviews.controller.ts:27](../../../apps/api/src/modules/reviews/reviews.controller.ts#L27)。

**服务方法**：

- `ReviewsService.feedback`；[apps/api/src/modules/reviews/reviews.service.ts:93](../../../apps/api/src/modules/reviews/reviews.service.ts#L93)。
- `ReviewsService.listFeedback`；[apps/api/src/modules/reviews/reviews.service.ts:112](../../../apps/api/src/modules/reviews/reviews.service.ts#L112)。
- `ReviewsService.resolveFeedback`；[apps/api/src/modules/reviews/reviews.service.ts:127](../../../apps/api/src/modules/reviews/reviews.service.ts#L127)。

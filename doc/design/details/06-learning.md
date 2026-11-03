# 06 工作台首页、学习任务、报告与学习记忆 — 详细设计

源码基线：`54a1b173df739c87092a7cae5d79fa587489f1fb`。角色：学生、家长、授权教师。

产品入口：`/`、`/studio`、`/studio/tasks`、`/studio/reports`、`/studio/profiles`、`/studio/settings`、`/learn`、`/parent/dashboard`、`/student/today`。

## 模块实现

- [apps/api/src/modules/learning/learning.service.ts](../../../apps/api/src/modules/learning/learning.service.ts)
- [apps/api/src/modules/learning/notebook.service.ts](../../../apps/api/src/modules/learning/notebook.service.ts)
- [apps/web/app/parent/dashboard/studio.tsx](../../../apps/web/app/parent/dashboard/studio.tsx)

## 共享契约

- [packages/contracts/src/learning.ts](../../../packages/contracts/src/learning.ts)
- [packages/contracts/src/learning-home.ts](../../../packages/contracts/src/learning-home.ts)

## 关联验证

以下是对应功能领域的测试入口；测试文件存在不等于每个子场景已由真人或所有设备验证。

- [apps/api/src/modules/learning/notebook.integration.test.ts](../../../apps/api/src/modules/learning/notebook.integration.test.ts)
- [apps/api/src/modules/ai/evidence-coach.integration.test.ts](../../../apps/api/src/modules/ai/evidence-coach.integration.test.ts)
- [apps/api/src/modules/learning/learning-home.test.ts](../../../apps/api/src/modules/learning/learning-home.test.ts)
- [apps/api/src/modules/learning/learning-home.integration.test.ts](../../../apps/api/src/modules/learning/learning-home.integration.test.ts)
- [tests/e2e/learning-home.spec.ts](../../../tests/e2e/learning-home.spec.ts)
- [tests/e2e/product-smoke.spec.ts](../../../tests/e2e/product-smoke.spec.ts)

## LEARN-07 统一学习首页与精确下一步

**输入**：当前身份、可选studentId、subject；URL与标签页的档案选择。

**处理与实现**：服务端重新校验档案权限；只读取当前孩子与当前账号的学习事实；按未完成评测、到期复测、计划核对、训练、报告和课堂断点构造真实目标链接；浏览器按身份隔离轻量缓存，取消旧请求并防止过期响应覆盖。

**输出**：LearningHome、一个主要行动及可展开待办、可核对事实和范围摘要。

**状态与持久化**：`learningScopes`、`diagnosticSessions`、`diagnosticPlans`、`practiceSessions`、`reviewTasks`、`classroomSessions`、`studioCourses`

**权限、失败与边界**：读取不启动题组或确认计划；显式无效档案不静默回退；学生不获得监护管理入口；独立成人课可无孩子直接进入；完整真人可用性仍待后续验收。

**关联接口**：

- `GET /api/learning/home` → `LearningHomeController.get`；[apps/api/src/modules/learning/learning-home.controller.ts:12](../../../apps/api/src/modules/learning/learning-home.controller.ts#L12)。

**服务方法**：

- `LearningHomeService.home`；[apps/api/src/modules/learning/learning-home.service.ts:74](../../../apps/api/src/modules/learning/learning-home.service.ts#L74)。

**补充实现文件**：

- [apps/web/components/workspace-next-action.tsx](../../../apps/web/components/workspace-next-action.tsx)
- [apps/web/app/studio/studio.tsx](../../../apps/web/app/studio/studio.tsx)
- [apps/web/app/learn/page.tsx](../../../apps/web/app/learn/page.tsx)
- [apps/web/lib/learning-context.ts](../../../apps/web/lib/learning-context.ts)

## LEARN-08 对话练习安排与本人完整工作台

**输入**：本人原对话、明确孩子/学科及1至3已学点、原生题包、完整答案和独立理由。

**处理与实现**：助教原消息接来源预检、审核题候选和教学说明、明确共享安排；任务页保留原安排/逐组开始/原题位置。本人独立学习码写答案、理由、帮助及完成，监护人只读预览。专用完整副本按账号/来源/安排/原题和标签隔离；并发草稿显式比较，丢回执重放原完整命令，后续编辑与原提交分开。原生公式/表格/图片/音频沿QuestionRenderer和真实媒体服务；每题attemptHistory按实际序号脱敏显示首次答案/理由和订正。

**输出**：可恢复的来源到安排、三组六题本人作答、帮助与订正历史及教学完成记录。

**状态与持久化**：`assistantPracticeArtifacts`、`assistantPracticeAssignments`、`assistantPracticeAssignmentWithdrawals`、`assistantPracticeGroupStarts`、`practiceSessions`、`practiceAttempts`、`practiceHints`、`studentMedia`

**权限、失败与边界**：仍是教学练习，不增加正式掌握；真实上传不表示理由已审核。成人/AI持久练习、D3原因和D4排期继续实施，完整课程、教师/实机和真人间隔条件仍待。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

**补充实现文件**：

- [apps/web/components/assistant-practices.tsx](../../../apps/web/components/assistant-practices.tsx)
- [apps/web/components/practice-copy-controls.tsx](../../../apps/web/components/practice-copy-controls.tsx)
- [apps/web/app/studio/tasks/conversation-practice.tsx](../../../apps/web/app/studio/tasks/conversation-practice.tsx)
- [apps/web/app/studio/tasks/conversation-practice.css](../../../apps/web/app/studio/tasks/conversation-practice.css)
- [apps/web/lib/assistant-practice-workspace.ts](../../../apps/web/lib/assistant-practice-workspace.ts)
- [apps/web/lib/use-practice-local-copy.ts](../../../apps/web/lib/use-practice-local-copy.ts)
- [apps/api/src/infrastructure/assistant-practice-workspace.test.ts](../../../apps/api/src/infrastructure/assistant-practice-workspace.test.ts)
- [tests/e2e/assistant-practice-workspace.spec.ts](../../../tests/e2e/assistant-practice-workspace.spec.ts)
- [doc/product/156-assistant-practice-workspace-ui.md](../../../doc/product/156-assistant-practice-workspace-ui.md)
- [doc/product/157-practice-assignment-withdrawal-and-schema25.md](../../../doc/product/157-practice-assignment-withdrawal-and-schema25.md)
- [apps/web/components/practice-withdrawal.tsx](../../../apps/web/components/practice-withdrawal.tsx)
- [apps/api/src/modules/learning/assistant-practice-withdrawal-record.ts](../../../apps/api/src/modules/learning/assistant-practice-withdrawal-record.ts)
- [tests/e2e/assistant-practice-withdrawal.spec.ts](../../../tests/e2e/assistant-practice-withdrawal.spec.ts)

## LEARN-09 成人与孩子AI教学的生成复核及本人活动

**输入**：完整私人来源、原受众/范围/定义、固定模型和Auto意图、明确采用及另次共享、本人的完整答案和独立理由。

**处理与实现**：持久任务分别保存生成/复核checkpoint，失败或取消保留原稿及固定模型；完整编辑使旧复核失效，uncertain不采用。成人与学习码本人分别写逐题首答/订正/帮助和完成；孩子共享移除原消息与引用键，档案和教学年级分开，三点六题逐目标保留。原命令恢复、并发、完整副本、撤回、作者匿名删除与最新账本恢复沿独立严格校验。

**输出**：待核查的教学参考、明确共享内容、本人原理由与可定位历史。

**状态与持久化**：`assistantTeachingPracticeDrafts`、`assistantTeachingPractices`、`assistantTeachingAssignments`、`assistantTeachingSessions`

**权限、失败与边界**：所有生成题均isTeachingOnly。最终共同599整站、2007 API及当前PG分解通过；不生成正式分数或独立保持证据。源码27，正式24未部署，R3更多原因/R4～R8及完整72/WS继续。

**关联接口**：

- `POST /api/ai/assistant/sessions/:sessionId/artifacts/practice/generated/preflight` → `AssistantTeachingSourceController.preflight`；[apps/api/src/modules/learning/assistant-teaching.controller.ts:9](../../../apps/api/src/modules/learning/assistant-teaching.controller.ts#L9)。
- `POST /api/ai/assistant/sessions/:sessionId/artifacts/practice/generated/drafts` → `AssistantTeachingSourceController.create`；[apps/api/src/modules/learning/assistant-teaching.controller.ts:10](../../../apps/api/src/modules/learning/assistant-teaching.controller.ts#L10)。
- `GET /api/ai/assistant/sessions/:sessionId/artifacts/practice/generated/drafts` → `AssistantTeachingSourceController.list`；[apps/api/src/modules/learning/assistant-teaching.controller.ts:11](../../../apps/api/src/modules/learning/assistant-teaching.controller.ts#L11)。
- `GET /api/ai/assistant/sessions/:sessionId/artifacts/practice/generated/requests/:key` → `AssistantTeachingSourceController.receipt`；[apps/api/src/modules/learning/assistant-teaching.controller.ts:12](../../../apps/api/src/modules/learning/assistant-teaching.controller.ts#L12)。
- `GET /api/learning/teaching-practice/drafts/:id` → `AssistantTeachingController.get`；[apps/api/src/modules/learning/assistant-teaching.controller.ts:18](../../../apps/api/src/modules/learning/assistant-teaching.controller.ts#L18)。
- `GET /api/learning/teaching-practice/drafts/:id/requests/:key` → `AssistantTeachingController.receipt`；[apps/api/src/modules/learning/assistant-teaching.controller.ts:20](../../../apps/api/src/modules/learning/assistant-teaching.controller.ts#L20)。
- `GET /api/learning/teaching-practice/drafts/:id/source` → `AssistantTeachingController.source`；[apps/api/src/modules/learning/assistant-teaching.controller.ts:19](../../../apps/api/src/modules/learning/assistant-teaching.controller.ts#L19)。
- `POST /api/learning/teaching-practice/drafts/:id/cancel` → `AssistantTeachingController.cancel`；[apps/api/src/modules/learning/assistant-teaching.controller.ts:22](../../../apps/api/src/modules/learning/assistant-teaching.controller.ts#L22)。
- `POST /api/learning/teaching-practice/drafts/:id/retry` → `AssistantTeachingController.retry`；[apps/api/src/modules/learning/assistant-teaching.controller.ts:23](../../../apps/api/src/modules/learning/assistant-teaching.controller.ts#L23)。
- `POST /api/learning/teaching-practice/drafts/:id/review` → `AssistantTeachingController.review`；[apps/api/src/modules/learning/assistant-teaching.controller.ts:24](../../../apps/api/src/modules/learning/assistant-teaching.controller.ts#L24)。
- `GET /api/learning/teaching-practice/practices/:id` → `AssistantTeachingController.adopted`；[apps/api/src/modules/learning/assistant-teaching.controller.ts:26](../../../apps/api/src/modules/learning/assistant-teaching.controller.ts#L26)。
- `PATCH /api/learning/teaching-practice/drafts/:id/content` → `AssistantTeachingController.edit`；[apps/api/src/modules/learning/assistant-teaching.controller.ts:21](../../../apps/api/src/modules/learning/assistant-teaching.controller.ts#L21)。
- `POST /api/learning/teaching-practice/drafts/:id/adopt` → `AssistantTeachingController.adopt`；[apps/api/src/modules/learning/assistant-teaching.controller.ts:25](../../../apps/api/src/modules/learning/assistant-teaching.controller.ts#L25)。
- `GET /api/learning/teaching-practice/sessions` → `AssistantTeachingSelfController.list`；[apps/api/src/modules/learning/assistant-teaching-self.controller.ts:11](../../../apps/api/src/modules/learning/assistant-teaching-self.controller.ts#L11)。
- `POST /api/learning/teaching-practice/practices/:id/start` → `AssistantTeachingSelfController.start`；[apps/api/src/modules/learning/assistant-teaching-self.controller.ts:10](../../../apps/api/src/modules/learning/assistant-teaching-self.controller.ts#L10)。
- `GET /api/learning/teaching-practice/sessions/:id` → `AssistantTeachingSelfController.get`；[apps/api/src/modules/learning/assistant-teaching-self.controller.ts:12](../../../apps/api/src/modules/learning/assistant-teaching-self.controller.ts#L12)。
- `GET /api/learning/teaching-practice/sessions/:id/questions/:questionId` → `AssistantTeachingSelfController.question`；[apps/api/src/modules/learning/assistant-teaching-self.controller.ts:13](../../../apps/api/src/modules/learning/assistant-teaching-self.controller.ts#L13)。
- `PATCH /api/learning/teaching-practice/sessions/:id/questions/:questionId/draft` → `AssistantTeachingSelfController.draft`；[apps/api/src/modules/learning/assistant-teaching-self.controller.ts:14](../../../apps/api/src/modules/learning/assistant-teaching-self.controller.ts#L14)。
- `POST /api/learning/teaching-practice/sessions/:id/responses` → `AssistantTeachingSelfController.response`；[apps/api/src/modules/learning/assistant-teaching-self.controller.ts:15](../../../apps/api/src/modules/learning/assistant-teaching-self.controller.ts#L15)。
- `POST /api/learning/teaching-practice/sessions/:id/questions/:questionId/help` → `AssistantTeachingSelfController.help`；[apps/api/src/modules/learning/assistant-teaching-self.controller.ts:16](../../../apps/api/src/modules/learning/assistant-teaching-self.controller.ts#L16)。
- `POST /api/learning/teaching-practice/sessions/:id/complete` → `AssistantTeachingSelfController.complete`；[apps/api/src/modules/learning/assistant-teaching-self.controller.ts:17](../../../apps/api/src/modules/learning/assistant-teaching-self.controller.ts#L17)。
- `POST /api/learning/teaching-practice/practices/:id/assignments` → `AssistantTeachingAssignmentController.assign`；[apps/api/src/modules/learning/assistant-teaching-assignment.controller.ts:9](../../../apps/api/src/modules/learning/assistant-teaching-assignment.controller.ts#L9)。
- `GET /api/learning/teaching-practice/assignments` → `AssistantTeachingAssignmentController.list`；[apps/api/src/modules/learning/assistant-teaching-assignment.controller.ts:10](../../../apps/api/src/modules/learning/assistant-teaching-assignment.controller.ts#L10)。
- `GET /api/learning/teaching-practice/assignments/:id` → `AssistantTeachingAssignmentController.get`；[apps/api/src/modules/learning/assistant-teaching-assignment.controller.ts:11](../../../apps/api/src/modules/learning/assistant-teaching-assignment.controller.ts#L11)。
- `POST /api/learning/teaching-practice/assignments/:id/start` → `AssistantTeachingAssignmentController.start`；[apps/api/src/modules/learning/assistant-teaching-assignment.controller.ts:13](../../../apps/api/src/modules/learning/assistant-teaching-assignment.controller.ts#L13)。
- `POST /api/learning/teaching-practice/assignments/:id/withdraw` → `AssistantTeachingAssignmentController.withdraw`；[apps/api/src/modules/learning/assistant-teaching-assignment.controller.ts:14](../../../apps/api/src/modules/learning/assistant-teaching-assignment.controller.ts#L14)。
- `GET /api/learning/teaching-practice/assignments/:id/questions/:qid/reference` → `AssistantTeachingAssignmentController.reference`；[apps/api/src/modules/learning/assistant-teaching-assignment.controller.ts:12](../../../apps/api/src/modules/learning/assistant-teaching-assignment.controller.ts#L12)。

**服务方法**：

- `AssistantTeachingSourceService.preview`；[apps/api/src/modules/learning/assistant-teaching-source.service.ts:42](../../../apps/api/src/modules/learning/assistant-teaching-source.service.ts#L42)。
- `AssistantTeachingService.create`；[apps/api/src/modules/learning/assistant-teaching.service.ts:29](../../../apps/api/src/modules/learning/assistant-teaching.service.ts#L29)。
- `AssistantTeachingService.list`；[apps/api/src/modules/learning/assistant-teaching.service.ts:45](../../../apps/api/src/modules/learning/assistant-teaching.service.ts#L45)。
- `AssistantTeachingService.creationReceipt`；[apps/api/src/modules/learning/assistant-teaching.service.ts:43](../../../apps/api/src/modules/learning/assistant-teaching.service.ts#L43)。
- `AssistantTeachingService.get`；[apps/api/src/modules/learning/assistant-teaching.service.ts:42](../../../apps/api/src/modules/learning/assistant-teaching.service.ts#L42)。
- `AssistantTeachingService.sourceView`；[apps/api/src/modules/learning/assistant-teaching.service.ts:44](../../../apps/api/src/modules/learning/assistant-teaching.service.ts#L44)。
- `AssistantTeachingService.control`；[apps/api/src/modules/learning/assistant-teaching.service.ts:54](../../../apps/api/src/modules/learning/assistant-teaching.service.ts#L54)。
- `AssistantTeachingService.review`；[apps/api/src/modules/learning/assistant-teaching.service.ts:70](../../../apps/api/src/modules/learning/assistant-teaching.service.ts#L70)。
- `AssistantTeachingService.practice`；[apps/api/src/modules/learning/assistant-teaching.service.ts:81](../../../apps/api/src/modules/learning/assistant-teaching.service.ts#L81)。
- `AssistantTeachingService.edit`；[apps/api/src/modules/learning/assistant-teaching.service.ts:65](../../../apps/api/src/modules/learning/assistant-teaching.service.ts#L65)。
- `AssistantTeachingService.adopt`；[apps/api/src/modules/learning/assistant-teaching.service.ts:76](../../../apps/api/src/modules/learning/assistant-teaching.service.ts#L76)。
- `AssistantTeachingSelfService.list`；[apps/api/src/modules/learning/assistant-teaching-self.service.ts:25](../../../apps/api/src/modules/learning/assistant-teaching-self.service.ts#L25)。
- `AssistantTeachingSelfService.start`；[apps/api/src/modules/learning/assistant-teaching-self.service.ts:18](../../../apps/api/src/modules/learning/assistant-teaching-self.service.ts#L18)。
- `AssistantTeachingSelfController.session`；[apps/api/src/modules/learning/assistant-teaching-self.controller.ts:9](../../../apps/api/src/modules/learning/assistant-teaching-self.controller.ts#L9)。
- `AssistantTeachingAssignmentService.assign`；[apps/api/src/modules/learning/assistant-teaching-assignment.service.ts:29](../../../apps/api/src/modules/learning/assistant-teaching-assignment.service.ts#L29)。
- `AssistantTeachingAssignmentService.list`；[apps/api/src/modules/learning/assistant-teaching-assignment.service.ts:42](../../../apps/api/src/modules/learning/assistant-teaching-assignment.service.ts#L42)。
- `AssistantTeachingAssignmentService.get`；[apps/api/src/modules/learning/assistant-teaching-assignment.service.ts:41](../../../apps/api/src/modules/learning/assistant-teaching-assignment.service.ts#L41)。
- `AssistantTeachingStudentService.start`；[apps/api/src/modules/learning/assistant-teaching-student.service.ts:23](../../../apps/api/src/modules/learning/assistant-teaching-student.service.ts#L23)。
- `AssistantTeachingAssignmentService.withdraw`；[apps/api/src/modules/learning/assistant-teaching-assignment.service.ts:48](../../../apps/api/src/modules/learning/assistant-teaching-assignment.service.ts#L48)。
- `AssistantTeachingAssignmentService.reference`；[apps/api/src/modules/learning/assistant-teaching-assignment.service.ts:54](../../../apps/api/src/modules/learning/assistant-teaching-assignment.service.ts#L54)。

**补充实现文件**：

- [apps/api/src/modules/learning/assistant-teaching-worker.service.ts](../../../apps/api/src/modules/learning/assistant-teaching-worker.service.ts)
- [apps/api/src/modules/learning/assistant-teaching-record.ts](../../../apps/api/src/modules/learning/assistant-teaching-record.ts)
- [apps/api/src/modules/learning/assistant-teaching-self-record.ts](../../../apps/api/src/modules/learning/assistant-teaching-self-record.ts)
- [apps/api/src/modules/learning/assistant-teaching-assignment-record.ts](../../../apps/api/src/modules/learning/assistant-teaching-assignment-record.ts)
- [apps/api/src/modules/learning/assistant-teaching-student-record.ts](../../../apps/api/src/modules/learning/assistant-teaching-student-record.ts)
- [apps/api/src/modules/learning/assistant-teaching-integrity.ts](../../../apps/api/src/modules/learning/assistant-teaching-integrity.ts)
- [apps/web/components/assistant-generated-practices.tsx](../../../apps/web/components/assistant-generated-practices.tsx)
- [apps/web/app/studio/tasks/teaching-practice.tsx](../../../apps/web/app/studio/tasks/teaching-practice.tsx)
- [apps/web/app/studio/tasks/student-teaching-practice.tsx](../../../apps/web/app/studio/tasks/student-teaching-practice.tsx)
- [apps/web/lib/teaching-practice-workspace.ts](../../../apps/web/lib/teaching-practice-workspace.ts)
- [packages/contracts/src/assistant-teaching-practice.ts](../../../packages/contracts/src/assistant-teaching-practice.ts)
- [packages/contracts/src/assistant-teaching-learner.ts](../../../packages/contracts/src/assistant-teaching-learner.ts)
- [packages/contracts/src/assistant-teaching-assignment.ts](../../../packages/contracts/src/assistant-teaching-assignment.ts)
- [apps/api/src/modules/learning/assistant-teaching.integration.test.ts](../../../apps/api/src/modules/learning/assistant-teaching.integration.test.ts)
- [apps/api/src/modules/learning/assistant-teaching-self.integration.test.ts](../../../apps/api/src/modules/learning/assistant-teaching-self.integration.test.ts)
- [apps/api/src/modules/learning/assistant-teaching-sharing.integration.test.ts](../../../apps/api/src/modules/learning/assistant-teaching-sharing.integration.test.ts)
- [apps/api/src/infrastructure/schema26-reader.integration.test.ts](../../../apps/api/src/infrastructure/schema26-reader.integration.test.ts)
- [tests/e2e/assistant-teaching-practice.spec.ts](../../../tests/e2e/assistant-teaching-practice.spec.ts)
- [tests/e2e/assistant-teaching-sharing.spec.ts](../../../tests/e2e/assistant-teaching-sharing.spec.ts)
- [doc/product/158-generated-teaching-practice-persistence.md](../../../doc/product/158-generated-teaching-practice-persistence.md)

## LEARN-10 完整来源观察、真实报告与原指导恢复

**输入**：完整原来源/受众、行为/条件/替代解释、真实报告与版本、每日预算、原请求和完整复盘理由。

**处理与实现**：严格核对实际原消息、范围/定义、报告完成和快照；明确关联后调用原规则计划。成人独立观察不借用孩子。状态、调整与复盘沿原服务和修订，当前投影与原操作回执分列，完整副本/双标签及全部退出保护逐项恢复。

**输出**：私人观察、原报告和原计划固定入口、准确原命令修订及当前学习状态。

**状态与持久化**：`assistantGuidanceIntents`、`diagnosticPlans`、`guidancePlanRevisions`、`reviewTasks`

**权限、失败与边界**：观察和教学题不是正式证据，不凭缺失数据推断原因。共同599整站与2007 API、实际PG/原生恢复分列通过；源码27未部署，更多原因/日历/真实保持和完整72/WS仍待。

**关联接口**：

- `POST /api/ai/assistant/sessions/:sessionId/artifacts/guidance/preflight` → `AssistantGuidanceSourceController.preview`；[apps/api/src/modules/learning/assistant-guidance.controller.ts:8](../../../apps/api/src/modules/learning/assistant-guidance.controller.ts#L8)。
- `POST /api/ai/assistant/sessions/:sessionId/artifacts/guidance/intents` → `AssistantGuidanceSourceController.create`；[apps/api/src/modules/learning/assistant-guidance.controller.ts:9](../../../apps/api/src/modules/learning/assistant-guidance.controller.ts#L9)。
- `GET /api/ai/assistant/sessions/:sessionId/artifacts/guidance/intents` → `AssistantGuidanceSourceController.list`；[apps/api/src/modules/learning/assistant-guidance.controller.ts:10](../../../apps/api/src/modules/learning/assistant-guidance.controller.ts#L10)。
- `GET /api/ai/assistant/sessions/:sessionId/artifacts/guidance/requests/:key` → `AssistantGuidanceSourceController.receipt`；[apps/api/src/modules/learning/assistant-guidance.controller.ts:11](../../../apps/api/src/modules/learning/assistant-guidance.controller.ts#L11)。
- `GET /api/learning/assistant-guidance/intents/:id` → `AssistantGuidanceController.get`；[apps/api/src/modules/learning/assistant-guidance.controller.ts:17](../../../apps/api/src/modules/learning/assistant-guidance.controller.ts#L17)。
- `GET /api/learning/assistant-guidance/intents/:id/requests/:key` → `AssistantGuidanceController.receipt`；[apps/api/src/modules/learning/assistant-guidance.controller.ts:18](../../../apps/api/src/modules/learning/assistant-guidance.controller.ts#L18)。
- `PATCH /api/learning/assistant-guidance/intents/:id/observation` → `AssistantGuidanceController.edit`；[apps/api/src/modules/learning/assistant-guidance.controller.ts:19](../../../apps/api/src/modules/learning/assistant-guidance.controller.ts#L19)。
- `POST /api/learning/assistant-guidance/intents/:id/report-preflight` → `AssistantGuidanceController.reportPreview`；[apps/api/src/modules/learning/assistant-guidance.controller.ts:20](../../../apps/api/src/modules/learning/assistant-guidance.controller.ts#L20)。
- `POST /api/learning/assistant-guidance/intents/:id/report` → `AssistantGuidanceController.report`；[apps/api/src/modules/learning/assistant-guidance.controller.ts:21](../../../apps/api/src/modules/learning/assistant-guidance.controller.ts#L21)。
- `POST /api/learning/assistant-guidance/intents/:id/plan` → `AssistantGuidanceController.plan`；[apps/api/src/modules/learning/assistant-guidance.controller.ts:22](../../../apps/api/src/modules/learning/assistant-guidance.controller.ts#L22)。

**服务方法**：

- `AssistantGuidanceService.preview`；[apps/api/src/modules/learning/assistant-guidance.service.ts:28](../../../apps/api/src/modules/learning/assistant-guidance.service.ts#L28)。
- `AssistantGuidanceService.create`；[apps/api/src/modules/learning/assistant-guidance.service.ts:29](../../../apps/api/src/modules/learning/assistant-guidance.service.ts#L29)。
- `AssistantGuidanceService.list`；[apps/api/src/modules/learning/assistant-guidance.service.ts:32](../../../apps/api/src/modules/learning/assistant-guidance.service.ts#L32)。
- `AssistantGuidanceService.creationReceipt`；[apps/api/src/modules/learning/assistant-guidance.service.ts:31](../../../apps/api/src/modules/learning/assistant-guidance.service.ts#L31)。
- `AssistantGuidanceService.get`；[apps/api/src/modules/learning/assistant-guidance.service.ts:30](../../../apps/api/src/modules/learning/assistant-guidance.service.ts#L30)。
- `AssistantGuidanceService.edit`；[apps/api/src/modules/learning/assistant-guidance.service.ts:33](../../../apps/api/src/modules/learning/assistant-guidance.service.ts#L33)。
- `AssistantGuidanceService.reportPreview`；[apps/api/src/modules/learning/assistant-guidance.service.ts:35](../../../apps/api/src/modules/learning/assistant-guidance.service.ts#L35)。
- `AssistantGuidanceService.linkReport`；[apps/api/src/modules/learning/assistant-guidance.service.ts:36](../../../apps/api/src/modules/learning/assistant-guidance.service.ts#L36)。
- `AssistantGuidanceService.createPlan`；[apps/api/src/modules/learning/assistant-guidance.service.ts:37](../../../apps/api/src/modules/learning/assistant-guidance.service.ts#L37)。

**补充实现文件**：

- [apps/api/src/modules/learning/assistant-guidance-record.ts](../../../apps/api/src/modules/learning/assistant-guidance-record.ts)
- [apps/api/src/modules/learning/assistant-guidance-integrity.ts](../../../apps/api/src/modules/learning/assistant-guidance-integrity.ts)
- [apps/api/src/modules/diagnostics/guidance.service.ts](../../../apps/api/src/modules/diagnostics/guidance.service.ts)
- [apps/web/components/assistant-guidance.tsx](../../../apps/web/components/assistant-guidance.tsx)
- [apps/web/app/studio/tasks/guidance-observation.tsx](../../../apps/web/app/studio/tasks/guidance-observation.tsx)
- [apps/web/components/guidance-manager.tsx](../../../apps/web/components/guidance-manager.tsx)
- [apps/web/components/guidance-plan-operations.tsx](../../../apps/web/components/guidance-plan-operations.tsx)
- [apps/web/components/workspace-shell.tsx](../../../apps/web/components/workspace-shell.tsx)
- [apps/web/lib/guidance-intent-workspace.ts](../../../apps/web/lib/guidance-intent-workspace.ts)
- [apps/web/lib/guidance-plan-copy.ts](../../../apps/web/lib/guidance-plan-copy.ts)
- [apps/web/lib/guidance-operations-copy.ts](../../../apps/web/lib/guidance-operations-copy.ts)
- [packages/contracts/src/assistant-guidance.ts](../../../packages/contracts/src/assistant-guidance.ts)
- [apps/api/src/modules/learning/assistant-guidance.integration.test.ts](../../../apps/api/src/modules/learning/assistant-guidance.integration.test.ts)
- [apps/api/src/infrastructure/schema27-reader.integration.test.ts](../../../apps/api/src/infrastructure/schema27-reader.integration.test.ts)
- [tests/e2e/assistant-guidance.spec.ts](../../../tests/e2e/assistant-guidance.spec.ts)
- [doc/product/159-conversation-clues-to-evidence-guidance.md](../../../doc/product/159-conversation-clues-to-evidence-guidance.md)

## LEARN-11 原学习计划恢复作用域与零可用时段

**输入**：实际studentId/subject、原请求键/计划引用、当前范围与全部学科有效忙碌区间。

**处理与实现**：先核对真实孩子和学科内原活动，再重新授权原计划并校验来源；缺失引用拒绝新建。预览只保留实际可用时段，全冲突返回零并拒绝确认；界面按钮不触发第二次原生表单提交。

**输出**：合法原计划恢复、空或部分可确认时间、明确冲突提示。

**状态与持久化**：`studioStudyPlans`、`studioScheduleEvents`、`studioActivities`

**权限、失败与边界**：605整站/2015 API/实际PG8分批通过。旧活动仍无严格完整作者命令；161预算/DST和原复测及全部R3～R8仍待。

**关联接口**：

- `POST /api/learning/studio/study-plans/preview` → `LearningController.studioStudyPlanPreview`；[apps/api/src/modules/learning/learning.controller.ts:124](../../../apps/api/src/modules/learning/learning.controller.ts#L124)。
- `POST /api/learning/studio/study-plans` → `LearningController.studioStudyPlanCreate`；[apps/api/src/modules/learning/learning.controller.ts:127](../../../apps/api/src/modules/learning/learning.controller.ts#L127)。
- `POST /api/learning/studio/study-plans/:planId/sessions/:sessionId` → `LearningController.studioStudyPlanSession`；[apps/api/src/modules/learning/learning.controller.ts:130](../../../apps/api/src/modules/learning/learning.controller.ts#L130)。

**服务方法**：

- `LearningService.previewStudioStudyPlan`；[apps/api/src/modules/learning/learning.service.ts:142](../../../apps/api/src/modules/learning/learning.service.ts#L142)。
- `LearningService.createStudioStudyPlan`；[apps/api/src/modules/learning/learning.service.ts:158](../../../apps/api/src/modules/learning/learning.service.ts#L158)。
- `LearningService.updateStudioPlanSession`；[apps/api/src/modules/learning/learning.service.ts:196](../../../apps/api/src/modules/learning/learning.service.ts#L196)。

**补充实现文件**：

- [apps/api/src/modules/learning/assistant-guidance.integration.test.ts](../../../apps/api/src/modules/learning/assistant-guidance.integration.test.ts)
- [tests/e2e/calendar-boundary.spec.ts](../../../tests/e2e/calendar-boundary.spec.ts)
- [doc/product/160-guidance-calendar-conflicts-and-due-review.md](../../../doc/product/160-guidance-calendar-conflicts-and-due-review.md)
- [apps/api/src/modules/learning/studio-study-plan.ts](../../../apps/api/src/modules/learning/studio-study-plan.ts)
- [apps/web/app/studio/study-planner.tsx](../../../apps/web/app/studio/study-planner.tsx)

## LEARN-12 原指导时间安排、完整命令和时区预算

**输入**：原plan/revision、完整本地日期与IANA偏移、跨学科每日预算、实际action/review、预检指纹、原请求与明确确认。

**处理与实现**：以原报告/范围/定义和现有忙碌区间只读预检；事务内重读后明确保存原活动和真实复测时间。严格作者全文/原结果与当前安排分列；双向原生关系、隐私删除、旧27读取栅栏、完整副本和稳定ICS保持来源。

**输出**：原任务稳定日程、阻断解释、准确原回执、当前历史和合法共享导出。

**状态与持久化**：`guidanceCalendarArrangements`、`studioCalendarCommands`、`diagnosticPlans`、`guidancePlanRevisions`、`reviewTasks`、`studioScheduleEvents`

**权限、失败与边界**：614整站/2070 API和实际PG分批通过；162教学后保持资格、更多受控原因、R5-R8及教师/实机/真人仍待。源码28未发布。

**关联接口**：

- `POST /api/learning/guidance-calendar/preflight` → `GuidanceCalendarController.preflight`；[apps/api/src/modules/learning/guidance-calendar.controller.ts:9](../../../apps/api/src/modules/learning/guidance-calendar.controller.ts#L9)。
- `POST /api/learning/guidance-calendar/arrangements` → `GuidanceCalendarController.confirm`；[apps/api/src/modules/learning/guidance-calendar.controller.ts:10](../../../apps/api/src/modules/learning/guidance-calendar.controller.ts#L10)。
- `GET /api/learning/guidance-calendar/requests/:key` → `GuidanceCalendarController.receipt`；[apps/api/src/modules/learning/guidance-calendar.controller.ts:11](../../../apps/api/src/modules/learning/guidance-calendar.controller.ts#L11)。
- `GET /api/learning/guidance-calendar/plans/:planId` → `GuidanceCalendarController.forPlan`；[apps/api/src/modules/learning/guidance-calendar.controller.ts:12](../../../apps/api/src/modules/learning/guidance-calendar.controller.ts#L12)。
- `GET /api/learning/guidance-calendar/arrangements/:id` → `GuidanceCalendarController.get`；[apps/api/src/modules/learning/guidance-calendar.controller.ts:13](../../../apps/api/src/modules/learning/guidance-calendar.controller.ts#L13)。
- `POST /api/learning/guidance-calendar/arrangements/:id/revisions` → `GuidanceCalendarController.revise`；[apps/api/src/modules/learning/guidance-calendar.controller.ts:14](../../../apps/api/src/modules/learning/guidance-calendar.controller.ts#L14)。

**服务方法**：

- `GuidanceCalendarService.preflight`；[apps/api/src/modules/learning/guidance-calendar.service.ts:46](../../../apps/api/src/modules/learning/guidance-calendar.service.ts#L46)。
- `GuidanceCalendarService.confirm`；[apps/api/src/modules/learning/guidance-calendar.service.ts:67](../../../apps/api/src/modules/learning/guidance-calendar.service.ts#L67)。
- `GuidanceCalendarService.receipt`；[apps/api/src/modules/learning/guidance-calendar.service.ts:62](../../../apps/api/src/modules/learning/guidance-calendar.service.ts#L62)。
- `GuidanceCalendarService.forPlan`；[apps/api/src/modules/learning/guidance-calendar.service.ts:61](../../../apps/api/src/modules/learning/guidance-calendar.service.ts#L61)。
- `GuidanceCalendarService.get`；[apps/api/src/modules/learning/guidance-calendar.service.ts:60](../../../apps/api/src/modules/learning/guidance-calendar.service.ts#L60)。
- `GuidanceCalendarService.revise`；[apps/api/src/modules/learning/guidance-calendar.service.ts:68](../../../apps/api/src/modules/learning/guidance-calendar.service.ts#L68)。

**补充实现文件**：

- [apps/api/src/modules/learning/guidance-calendar.controller.ts](../../../apps/api/src/modules/learning/guidance-calendar.controller.ts)
- [apps/api/src/modules/learning/guidance-calendar-preview.ts](../../../apps/api/src/modules/learning/guidance-calendar-preview.ts)
- [apps/api/src/modules/learning/guidance-calendar-time.ts](../../../apps/api/src/modules/learning/guidance-calendar-time.ts)
- [apps/api/src/modules/learning/guidance-calendar-record.ts](../../../apps/api/src/modules/learning/guidance-calendar-record.ts)
- [apps/api/src/modules/learning/legacy-calendar-command.ts](../../../apps/api/src/modules/learning/legacy-calendar-command.ts)
- [apps/api/src/modules/learning/studio-integration.service.ts](../../../apps/api/src/modules/learning/studio-integration.service.ts)
- [apps/api/src/modules/privacy/privacy-records.ts](../../../apps/api/src/modules/privacy/privacy-records.ts)
- [apps/api/src/infrastructure/schema28-reader.integration.test.ts](../../../apps/api/src/infrastructure/schema28-reader.integration.test.ts)
- [apps/web/components/guidance-calendar-manager.tsx](../../../apps/web/components/guidance-calendar-manager.tsx)
- [apps/web/lib/guidance-calendar-copy.ts](../../../apps/web/lib/guidance-calendar-copy.ts)
- [apps/web/app/studio/calendar-board.tsx](../../../apps/web/app/studio/calendar-board.tsx)
- [packages/contracts/src/guidance-calendar.ts](../../../packages/contracts/src/guidance-calendar.ts)
- [tests/e2e/guidance-calendar.spec.ts](../../../tests/e2e/guidance-calendar.spec.ts)
- [doc/product/161-guidance-calendar-persistence-and-timezone-protocol.md](../../../doc/product/161-guidance-calendar-persistence-and-timezone-protocol.md)

## LEARN-13 教学后真实保持锚点与原报告兼容

**输入**：原独立作答、原ReviewTask、实际孩子/学科/冻结目标、真实教学或帮助来源和服务端截止时间。

**处理与实现**：原业务同事务写入稳定来源时间；课堂冻结原课程/原知识定义和原句单元，普通读取与家长预览不移动锚点。原任务基准稳定，最近实际教学/帮助和真实1/3/7/14日共同控制复测；开始后的帮助排除独立保持。旧首答和报告保持，明确重分析追加v4报告；画像、原因和复盘共用资格投影。原生双向关系、隐私账本与实际旧28读取器保持。 原地教程升级后沿实际审计连续追溯原课堂课程版本，旧课堂准备和原生冷恢复共用准确来源。

**输出**：当前等待依据、准确来源返回、原时间回执/完整副本和可核查保持资格。

**状态与持久化**：`retentionExposureEvents`、`diagnosticSessions`、`diagnosticResponses`、`diagnosticReports`、`practiceSessions`、`practiceAttempts`、`practiceHints`、`assistantTeachingAssignments`、`assistantTeachingSessions`、`classroomSessions`

**权限、失败与边界**：原H620属于修正前后端；课程历史修正后2165API、PG34/1及独立6浏览器分别通过。源码29未发布，163/R5-R8及全部真实验收仍待。

**关联接口**：

- `POST /api/learning/classroom/sessions/:id/retention-displays` → `ClassroomController.retentionDisplay`；[apps/api/src/modules/learning/classroom.controller.ts:13](../../../apps/api/src/modules/learning/classroom.controller.ts#L13)。

**服务方法**：

- `RetentionService.classroomDisplay`；[apps/api/src/modules/diagnostics/retention.service.ts:81](../../../apps/api/src/modules/diagnostics/retention.service.ts#L81)。

**补充实现文件**：

- [apps/api/src/modules/diagnostics/retention-anchor.ts](../../../apps/api/src/modules/diagnostics/retention-anchor.ts)
- [apps/api/src/modules/diagnostics/retention-source.ts](../../../apps/api/src/modules/diagnostics/retention-source.ts)
- [apps/api/src/modules/diagnostics/retention-integrity.ts](../../../apps/api/src/modules/diagnostics/retention-integrity.ts)
- [apps/api/src/modules/diagnostics/retention-evidence-projection.ts](../../../apps/api/src/modules/diagnostics/retention-evidence-projection.ts)
- [apps/api/src/modules/diagnostics/retention-review-gate.ts](../../../apps/api/src/modules/diagnostics/retention-review-gate.ts)
- [apps/api/src/modules/diagnostics/classroom-retention-record.ts](../../../apps/api/src/modules/diagnostics/classroom-retention-record.ts)
- [apps/api/src/modules/diagnostics/classroom-retention-origin.ts](../../../apps/api/src/modules/diagnostics/classroom-retention-origin.ts)
- [apps/api/src/modules/diagnostics/retention-legacy-classroom.test.ts](../../../apps/api/src/modules/diagnostics/retention-legacy-classroom.test.ts)
- [apps/api/src/modules/ai/ai.service.ts](../../../apps/api/src/modules/ai/ai.service.ts)
- [apps/api/src/modules/learning/classroom-turn.service.ts](../../../apps/api/src/modules/learning/classroom-turn.service.ts)
- [apps/api/src/modules/learning/classroom-turn-worker.service.ts](../../../apps/api/src/modules/learning/classroom-turn-worker.service.ts)
- [apps/api/src/modules/diagnostics/retention.integration.test.ts](../../../apps/api/src/modules/diagnostics/retention.integration.test.ts)
- [apps/api/src/infrastructure/schema29-reader.integration.test.ts](../../../apps/api/src/infrastructure/schema29-reader.integration.test.ts)
- [apps/web/components/retention-evidence.tsx](../../../apps/web/components/retention-evidence.tsx)
- [apps/web/app/studio/classroom/retention-display.tsx](../../../apps/web/app/studio/classroom/retention-display.tsx)
- [packages/contracts/src/retention.ts](../../../packages/contracts/src/retention.ts)
- [tests/e2e/retention-evidence.spec.ts](../../../tests/e2e/retention-evidence.spec.ts)
- [doc/product/162-retention-anchor-and-measurement-compatibility.md](../../../doc/product/162-retention-anchor-and-measurement-compatibility.md)
- [apps/api/src/modules/diagnostics/classroom-retention-history.test.ts](../../../apps/api/src/modules/diagnostics/classroom-retention-history.test.ts)
- [apps/api/src/modules/diagnostics/retention-course-history.integration.test.ts](../../../apps/api/src/modules/diagnostics/retention-course-history.integration.test.ts)

## LEARN-01 家庭总览与证据化学习记忆

**输入**：当前家庭、学生与学科。

**处理与实现**：聚合范围、有效估计、未知、未关闭原因、计划与复测；构建带真实链接的优先Feed，供家长首页和助教共享。

**输出**：事实/未知/行动组成的LearningMemory。

**状态与持久化**：`learningScopes`、`diagnosticResponses`、`diagnosticHypotheses`、`diagnosticPlans`、`reviewTasks`

**权限、失败与边界**：记忆是业务证据投影，不是让模型自由推测孩子画像。

**关联接口**：

- `GET /api/learning/overview` → `LearningController.overview`；[apps/api/src/modules/learning/learning.controller.ts:23](../../../apps/api/src/modules/learning/learning.controller.ts#L23)。
- `GET /api/learning/students/:id/memory` → `LearningController.memory`；[apps/api/src/modules/learning/learning.controller.ts:20](../../../apps/api/src/modules/learning/learning.controller.ts#L20)。
- `GET /api/learning/students/:id/knowledge` → `LearningController.learnerKnowledge`；[apps/api/src/modules/learning/learning.controller.ts:138](../../../apps/api/src/modules/learning/learning.controller.ts#L138)。

**服务方法**：

- `LearningService.overview`；[apps/api/src/modules/learning/learning.service.ts:1041](../../../apps/api/src/modules/learning/learning.service.ts#L1041)。
- `LearningService.memory`；[apps/api/src/modules/learning/learning.service.ts:622](../../../apps/api/src/modules/learning/learning.service.ts#L622)。
- `LearningService.learnerKnowledge`；[apps/api/src/modules/learning/learning.service.ts:1045](../../../apps/api/src/modules/learning/learning.service.ts#L1045)。

## LEARN-02 今日任务与练习入口

**输入**：日期、计划行动、学生与学科。

**处理与实现**：按有效计划列出讲解和练习、未完成会话、到期复测；开始时选独立新题并冻结题目、量规、教学版本；同日同动作恢复原会话。

**输出**：今日清单、PracticeSession。

**状态与持久化**：`diagnosticPlans`、`practiceSessions`、`reviewTasks`

**权限、失败与边界**：已暂停计划不可继续提交；缺题显示缺口。

**关联接口**：

- `GET /api/learning/students/:id/today` → `LearningController.today`；[apps/api/src/modules/learning/learning.controller.ts:141](../../../apps/api/src/modules/learning/learning.controller.ts#L141)。
- `POST /api/learning/plans/:id/actions/:action/start` → `LearningController.start`；[apps/api/src/modules/learning/learning.controller.ts:147](../../../apps/api/src/modules/learning/learning.controller.ts#L147)。

**服务方法**：

- `LearningService.today`；[apps/api/src/modules/learning/learning.service.ts:682](../../../apps/api/src/modules/learning/learning.service.ts#L682)。
- `LearningService.start`；[apps/api/src/modules/learning/learning.service.ts:696](../../../apps/api/src/modules/learning/learning.service.ts#L696)。

## LEARN-03 训练作答、草稿、提示与完成

**输入**：练习ID、题目ID、结构化回答、耗时、请求键与草稿/订正栅栏。

**处理与实现**：共享草稿v2和确定性评分；修订日志跨首次与订正保留，题面摘要绑定当前作答次数；URL恢复正在编辑的题，网络失败保留原命令；再想一次明确新次数，原首答和参考曝光保留。

**输出**：训练回执、可恢复订正稿与完成摘要。

**状态与持久化**：`practiceSessions`、`practiceAttempts`、`practiceHints`、`practiceScoringRevisions`

**权限、失败与边界**：训练复做不增加独立掌握样本；读回旧首答与新增订正分别核对，文件/绘图仍待量规复核。

**关联接口**：

- `GET /api/learning/practice/:id` → `LearningController.view`；[apps/api/src/modules/learning/learning.controller.ts:148](../../../apps/api/src/modules/learning/learning.controller.ts#L148)。
- `GET /api/learning/practice/:id/questions/:question` → `LearningController.render`；[apps/api/src/modules/learning/learning.controller.ts:149](../../../apps/api/src/modules/learning/learning.controller.ts#L149)。
- `PATCH /api/learning/practice/:id/questions/:question/draft` → `LearningController.draft`；[apps/api/src/modules/learning/learning.controller.ts:151](../../../apps/api/src/modules/learning/learning.controller.ts#L151)。
- `POST /api/learning/practice/:id/responses` → `LearningController.submit`；[apps/api/src/modules/learning/learning.controller.ts:150](../../../apps/api/src/modules/learning/learning.controller.ts#L150)。
- `POST /api/learning/practice/:id/questions/:question/hint` → `LearningController.hint`；[apps/api/src/modules/learning/learning.controller.ts:152](../../../apps/api/src/modules/learning/learning.controller.ts#L152)。
- `POST /api/learning/practice/:id/complete` → `LearningController.complete`；[apps/api/src/modules/learning/learning.controller.ts:153](../../../apps/api/src/modules/learning/learning.controller.ts#L153)。

**服务方法**：

- `LearningService.view`；[apps/api/src/modules/learning/learning.service.ts:741](../../../apps/api/src/modules/learning/learning.service.ts#L741)。
- `LearningService.render`；[apps/api/src/modules/learning/learning.service.ts:770](../../../apps/api/src/modules/learning/learning.service.ts#L770)。
- `LearningService.draft`；[apps/api/src/modules/learning/learning.service.ts:795](../../../apps/api/src/modules/learning/learning.service.ts#L795)。
- `LearningService.submit`；[apps/api/src/modules/learning/learning.service.ts:899](../../../apps/api/src/modules/learning/learning.service.ts#L899)。
- `LearningService.hint`；[apps/api/src/modules/learning/learning.service.ts:979](../../../apps/api/src/modules/learning/learning.service.ts#L979)。
- `LearningService.complete`；[apps/api/src/modules/learning/learning.service.ts:997](../../../apps/api/src/modules/learning/learning.service.ts#L997)。

## LEARN-04 错题与待复核入口

**输入**：学生与学科。

**处理与实现**：汇总已结束评测和训练的未达标或待复核记录，采用有效评分修订，关联冻结题目和来源。

**输出**：可展开的错误事实清单。

**状态与持久化**：`diagnosticResponses`、`practiceAttempts`、`scoringRevisions`

**权限、失败与边界**：未结束评测不提前开放参考答案。

**关联接口**：

- `GET /api/learning/students/:id/mistakes` → `LearningController.mistakes`；[apps/api/src/modules/learning/learning.controller.ts:144](../../../apps/api/src/modules/learning/learning.controller.ts#L144)。

**服务方法**：

- `LearningService.mistakes`；[apps/api/src/modules/learning/learning.service.ts:1010](../../../apps/api/src/modules/learning/learning.service.ts#L1010)。

## LEARN-05 错题组织、复做与新题验证

**输入**：标签、收藏、反思、错误步骤、移除/恢复。

**处理与实现**：对原始证据追加组织信息；原题复做恢复练习路径；新题核查进入诊断蓝图；打印稿使用公开可见内容。

**输出**：按知识点整理的错题本。

**状态与持久化**：`mistakeNotebookEntries`、`practiceSessions`、`practiceAttempts`

**权限、失败与边界**：原题复做只记录学习行为，不当成新迁移或新独立测量。

**关联接口**：

- `GET /api/learning/students/:studentId/notebook` → `NotebookController.list`；[apps/api/src/modules/learning/notebook.controller.ts:8](../../../apps/api/src/modules/learning/notebook.controller.ts#L8)。
- `GET /api/learning/students/:studentId/notebook/:kind/:responseId` → `NotebookController.detail`；[apps/api/src/modules/learning/notebook.controller.ts:9](../../../apps/api/src/modules/learning/notebook.controller.ts#L9)。
- `POST /api/learning/students/:studentId/notebook/:kind/:responseId/organize` → `NotebookController.organize`；[apps/api/src/modules/learning/notebook.controller.ts:10](../../../apps/api/src/modules/learning/notebook.controller.ts#L10)。
- `POST /api/learning/students/:studentId/notebook/:kind/:responseId/redo` → `NotebookController.redo`；[apps/api/src/modules/learning/notebook.controller.ts:11](../../../apps/api/src/modules/learning/notebook.controller.ts#L11)。
- `POST /api/learning/students/:studentId/notebook/:kind/:responseId/verification` → `NotebookController.verification`；[apps/api/src/modules/learning/notebook.controller.ts:12](../../../apps/api/src/modules/learning/notebook.controller.ts#L12)。

**服务方法**：

- `NotebookService.list`；[apps/api/src/modules/learning/notebook.service.ts:81](../../../apps/api/src/modules/learning/notebook.service.ts#L81)。
- `NotebookService.detail`；[apps/api/src/modules/learning/notebook.service.ts:114](../../../apps/api/src/modules/learning/notebook.service.ts#L114)。
- `NotebookService.organize`；[apps/api/src/modules/learning/notebook.service.ts:146](../../../apps/api/src/modules/learning/notebook.service.ts#L146)。
- `NotebookService.redo`；[apps/api/src/modules/learning/notebook.service.ts:154](../../../apps/api/src/modules/learning/notebook.service.ts#L154)。
- `NotebookService.verification`；[apps/api/src/modules/learning/notebook.service.ts:175](../../../apps/api/src/modules/learning/notebook.service.ts#L175)。

## LEARN-06 旧入口迁移与历史只读

**输入**：旧URL或管理员历史查询。

**处理与实现**：旧student/mission重定向今日学习，student/knowledge重定向家庭页；旧写接口被410拦截；管理员历史接口读取早期记录。

**输出**：明确迁移入口和历史只读报告。

**状态与持久化**：`assessments`、`assessmentAnswers`、`assessmentResults`、`studyPlans`、`missions`、`missionAnswers`

**权限、失败与边界**：Assessments/Missions/Plans旧模块没有被AppModule接入，不属于当前主评测实现。

**关联接口**：

- `GET /api/admin/history/mastery-heatmap` → `ProgressController.getMasteryHeatmap`；[apps/api/src/modules/progress/progress.controller.ts:10](../../../apps/api/src/modules/progress/progress.controller.ts#L10)。
- `GET /api/admin/history/students/:studentId/knowledge-map` → `ProgressController.getStudentKnowledgeMap`；[apps/api/src/modules/progress/progress.controller.ts:20](../../../apps/api/src/modules/progress/progress.controller.ts#L20)。
- `GET /api/admin/history/reports/weekly` → `ProgressController.getWeeklyReport`；[apps/api/src/modules/progress/progress.controller.ts:30](../../../apps/api/src/modules/progress/progress.controller.ts#L30)。
- `GET /api/admin/history/parents/:parentId/alerts` → `ProgressController.getParentAlerts`；[apps/api/src/modules/progress/progress.controller.ts:41](../../../apps/api/src/modules/progress/progress.controller.ts#L41)。

**服务方法**：

- `ProgressService.getMasteryHeatmap`；[apps/api/src/modules/progress/progress.service.ts:76](../../../apps/api/src/modules/progress/progress.service.ts#L76)。
- `ProgressService.getStudentKnowledgeMap`；[apps/api/src/modules/progress/progress.service.ts:85](../../../apps/api/src/modules/progress/progress.service.ts#L85)。
- `ProgressService.getWeeklyReport`；[apps/api/src/modules/progress/progress.service.ts:193](../../../apps/api/src/modules/progress/progress.service.ts#L193)。
- `ProgressService.getParentAlerts`；[apps/api/src/modules/progress/progress.service.ts:270](../../../apps/api/src/modules/progress/progress.service.ts#L270)。

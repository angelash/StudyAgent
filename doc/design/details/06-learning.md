# 06 家庭首页、今日训练、学习记忆与错题 — 详细设计

源码基线：`0dd1d04dfb4f435484fa0d4dae12593332fa262f`。角色：学生、家长、授权教师。

产品入口：`/`、`/learn`、`/parent/dashboard`、`/student/today`。

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

- [apps/web/app/learn/screen.tsx](../../../apps/web/app/learn/screen.tsx)
- [apps/web/lib/learning-context.ts](../../../apps/web/lib/learning-context.ts)

## LEARN-01 家庭总览与证据化学习记忆

**输入**：当前家庭、学生与学科。

**处理与实现**：聚合范围、有效估计、未知、未关闭原因、计划与复测；构建带真实链接的优先Feed，供家长首页和助教共享。

**输出**：事实/未知/行动组成的LearningMemory。

**状态与持久化**：`learningScopes`、`diagnosticResponses`、`diagnosticHypotheses`、`diagnosticPlans`、`reviewTasks`

**权限、失败与边界**：记忆是业务证据投影，不是让模型自由推测孩子画像。

**关联接口**：

- `GET /api/learning/overview` → `LearningController.overview`；[apps/api/src/modules/learning/learning.controller.ts:17](../../../apps/api/src/modules/learning/learning.controller.ts#L17)。
- `GET /api/learning/students/:id/memory` → `LearningController.memory`；[apps/api/src/modules/learning/learning.controller.ts:14](../../../apps/api/src/modules/learning/learning.controller.ts#L14)。

**服务方法**：

- `LearningService.overview`；[apps/api/src/modules/learning/learning.service.ts:849](../../../apps/api/src/modules/learning/learning.service.ts#L849)。
- `LearningService.memory`；[apps/api/src/modules/learning/learning.service.ts:565](../../../apps/api/src/modules/learning/learning.service.ts#L565)。

## LEARN-02 今日任务与练习入口

**输入**：日期、计划行动、学生与学科。

**处理与实现**：按有效计划列出讲解和练习、未完成会话、到期复测；开始时选独立新题并冻结题目、量规、教学版本；同日同动作恢复原会话。

**输出**：今日清单、PracticeSession。

**状态与持久化**：`diagnosticPlans`、`practiceSessions`、`reviewTasks`

**权限、失败与边界**：已暂停计划不可继续提交；缺题显示缺口。

**关联接口**：

- `GET /api/learning/students/:id/today` → `LearningController.today`；[apps/api/src/modules/learning/learning.controller.ts:105](../../../apps/api/src/modules/learning/learning.controller.ts#L105)。
- `POST /api/learning/plans/:id/actions/:action/start` → `LearningController.start`；[apps/api/src/modules/learning/learning.controller.ts:111](../../../apps/api/src/modules/learning/learning.controller.ts#L111)。

**服务方法**：

- `LearningService.today`；[apps/api/src/modules/learning/learning.service.ts:625](../../../apps/api/src/modules/learning/learning.service.ts#L625)。
- `LearningService.start`；[apps/api/src/modules/learning/learning.service.ts:639](../../../apps/api/src/modules/learning/learning.service.ts#L639)。

## LEARN-03 训练作答、草稿、提示与完成

**输入**：练习ID、题目ID、结构化回答、耗时、请求键与草稿/订正栅栏。

**处理与实现**：共享草稿v2和确定性评分；修订日志跨首次与订正保留，题面摘要绑定当前作答次数；URL恢复正在编辑的题，网络失败保留原命令；再想一次明确新次数，原首答和参考曝光保留。

**输出**：训练回执、可恢复订正稿与完成摘要。

**状态与持久化**：`practiceSessions`、`practiceAttempts`、`practiceHints`、`practiceScoringRevisions`

**权限、失败与边界**：训练复做不增加独立掌握样本；读回旧首答与新增订正分别核对，文件/绘图仍待量规复核。

**关联接口**：

- `GET /api/learning/practice/:id` → `LearningController.view`；[apps/api/src/modules/learning/learning.controller.ts:112](../../../apps/api/src/modules/learning/learning.controller.ts#L112)。
- `GET /api/learning/practice/:id/questions/:question` → `LearningController.render`；[apps/api/src/modules/learning/learning.controller.ts:113](../../../apps/api/src/modules/learning/learning.controller.ts#L113)。
- `PATCH /api/learning/practice/:id/questions/:question/draft` → `LearningController.draft`；[apps/api/src/modules/learning/learning.controller.ts:115](../../../apps/api/src/modules/learning/learning.controller.ts#L115)。
- `POST /api/learning/practice/:id/responses` → `LearningController.submit`；[apps/api/src/modules/learning/learning.controller.ts:114](../../../apps/api/src/modules/learning/learning.controller.ts#L114)。
- `POST /api/learning/practice/:id/questions/:question/hint` → `LearningController.hint`；[apps/api/src/modules/learning/learning.controller.ts:116](../../../apps/api/src/modules/learning/learning.controller.ts#L116)。
- `POST /api/learning/practice/:id/complete` → `LearningController.complete`；[apps/api/src/modules/learning/learning.controller.ts:117](../../../apps/api/src/modules/learning/learning.controller.ts#L117)。

**服务方法**：

- `LearningService.view`；[apps/api/src/modules/learning/learning.service.ts:681](../../../apps/api/src/modules/learning/learning.service.ts#L681)。
- `LearningService.render`；[apps/api/src/modules/learning/learning.service.ts:699](../../../apps/api/src/modules/learning/learning.service.ts#L699)。
- `LearningService.draft`；[apps/api/src/modules/learning/learning.service.ts:717](../../../apps/api/src/modules/learning/learning.service.ts#L717)。
- `LearningService.submit`；[apps/api/src/modules/learning/learning.service.ts:737](../../../apps/api/src/modules/learning/learning.service.ts#L737)。
- `LearningService.hint`；[apps/api/src/modules/learning/learning.service.ts:798](../../../apps/api/src/modules/learning/learning.service.ts#L798)。
- `LearningService.complete`；[apps/api/src/modules/learning/learning.service.ts:809](../../../apps/api/src/modules/learning/learning.service.ts#L809)。

## LEARN-04 错题与待复核入口

**输入**：学生与学科。

**处理与实现**：汇总已结束评测和训练的未达标或待复核记录，采用有效评分修订，关联冻结题目和来源。

**输出**：可展开的错误事实清单。

**状态与持久化**：`diagnosticResponses`、`practiceAttempts`、`scoringRevisions`

**权限、失败与边界**：未结束评测不提前开放参考答案。

**关联接口**：

- `GET /api/learning/students/:id/mistakes` → `LearningController.mistakes`；[apps/api/src/modules/learning/learning.controller.ts:108](../../../apps/api/src/modules/learning/learning.controller.ts#L108)。

**服务方法**：

- `LearningService.mistakes`；[apps/api/src/modules/learning/learning.service.ts:819](../../../apps/api/src/modules/learning/learning.service.ts#L819)。

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

- `NotebookService.list`；[apps/api/src/modules/learning/notebook.service.ts:80](../../../apps/api/src/modules/learning/notebook.service.ts#L80)。
- `NotebookService.detail`；[apps/api/src/modules/learning/notebook.service.ts:113](../../../apps/api/src/modules/learning/notebook.service.ts#L113)。
- `NotebookService.organize`；[apps/api/src/modules/learning/notebook.service.ts:145](../../../apps/api/src/modules/learning/notebook.service.ts#L145)。
- `NotebookService.redo`；[apps/api/src/modules/learning/notebook.service.ts:153](../../../apps/api/src/modules/learning/notebook.service.ts#L153)。
- `NotebookService.verification`；[apps/api/src/modules/learning/notebook.service.ts:174](../../../apps/api/src/modules/learning/notebook.service.ts#L174)。

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

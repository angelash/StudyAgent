# 06 工作台首页、学习任务、报告与学习记忆 — 详细设计

源码基线：`2f9507bf6f26f4e56f85f2c957178a4cf5d4c4fa`。角色：学生、家长、授权教师。

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

## LEARN-01 家庭总览与证据化学习记忆

**输入**：当前家庭、学生与学科。

**处理与实现**：聚合范围、有效估计、未知、未关闭原因、计划与复测；构建带真实链接的优先Feed，供家长首页和助教共享。

**输出**：事实/未知/行动组成的LearningMemory。

**状态与持久化**：`learningScopes`、`diagnosticResponses`、`diagnosticHypotheses`、`diagnosticPlans`、`reviewTasks`

**权限、失败与边界**：记忆是业务证据投影，不是让模型自由推测孩子画像。

**关联接口**：

- `GET /api/learning/overview` → `LearningController.overview`；[apps/api/src/modules/learning/learning.controller.ts:18](../../../apps/api/src/modules/learning/learning.controller.ts#L18)。
- `GET /api/learning/students/:id/memory` → `LearningController.memory`；[apps/api/src/modules/learning/learning.controller.ts:15](../../../apps/api/src/modules/learning/learning.controller.ts#L15)。

**服务方法**：

- `LearningService.overview`；[apps/api/src/modules/learning/learning.service.ts:1025](../../../apps/api/src/modules/learning/learning.service.ts#L1025)。
- `LearningService.memory`；[apps/api/src/modules/learning/learning.service.ts:620](../../../apps/api/src/modules/learning/learning.service.ts#L620)。

## LEARN-02 今日任务与练习入口

**输入**：日期、计划行动、学生与学科。

**处理与实现**：按有效计划列出讲解和练习、未完成会话、到期复测；开始时选独立新题并冻结题目、量规、教学版本；同日同动作恢复原会话。

**输出**：今日清单、PracticeSession。

**状态与持久化**：`diagnosticPlans`、`practiceSessions`、`reviewTasks`

**权限、失败与边界**：已暂停计划不可继续提交；缺题显示缺口。

**关联接口**：

- `GET /api/learning/students/:id/today` → `LearningController.today`；[apps/api/src/modules/learning/learning.controller.ts:119](../../../apps/api/src/modules/learning/learning.controller.ts#L119)。
- `POST /api/learning/plans/:id/actions/:action/start` → `LearningController.start`；[apps/api/src/modules/learning/learning.controller.ts:125](../../../apps/api/src/modules/learning/learning.controller.ts#L125)。

**服务方法**：

- `LearningService.today`；[apps/api/src/modules/learning/learning.service.ts:680](../../../apps/api/src/modules/learning/learning.service.ts#L680)。
- `LearningService.start`；[apps/api/src/modules/learning/learning.service.ts:694](../../../apps/api/src/modules/learning/learning.service.ts#L694)。

## LEARN-03 训练作答、草稿、提示与完成

**输入**：练习ID、题目ID、结构化回答、耗时、请求键与草稿/订正栅栏。

**处理与实现**：共享草稿v2和确定性评分；修订日志跨首次与订正保留，题面摘要绑定当前作答次数；URL恢复正在编辑的题，网络失败保留原命令；再想一次明确新次数，原首答和参考曝光保留。

**输出**：训练回执、可恢复订正稿与完成摘要。

**状态与持久化**：`practiceSessions`、`practiceAttempts`、`practiceHints`、`practiceScoringRevisions`

**权限、失败与边界**：训练复做不增加独立掌握样本；读回旧首答与新增订正分别核对，文件/绘图仍待量规复核。

**关联接口**：

- `GET /api/learning/practice/:id` → `LearningController.view`；[apps/api/src/modules/learning/learning.controller.ts:126](../../../apps/api/src/modules/learning/learning.controller.ts#L126)。
- `GET /api/learning/practice/:id/questions/:question` → `LearningController.render`；[apps/api/src/modules/learning/learning.controller.ts:127](../../../apps/api/src/modules/learning/learning.controller.ts#L127)。
- `PATCH /api/learning/practice/:id/questions/:question/draft` → `LearningController.draft`；[apps/api/src/modules/learning/learning.controller.ts:129](../../../apps/api/src/modules/learning/learning.controller.ts#L129)。
- `POST /api/learning/practice/:id/responses` → `LearningController.submit`；[apps/api/src/modules/learning/learning.controller.ts:128](../../../apps/api/src/modules/learning/learning.controller.ts#L128)。
- `POST /api/learning/practice/:id/questions/:question/hint` → `LearningController.hint`；[apps/api/src/modules/learning/learning.controller.ts:130](../../../apps/api/src/modules/learning/learning.controller.ts#L130)。
- `POST /api/learning/practice/:id/complete` → `LearningController.complete`；[apps/api/src/modules/learning/learning.controller.ts:131](../../../apps/api/src/modules/learning/learning.controller.ts#L131)。

**服务方法**：

- `LearningService.view`；[apps/api/src/modules/learning/learning.service.ts:736](../../../apps/api/src/modules/learning/learning.service.ts#L736)。
- `LearningService.render`；[apps/api/src/modules/learning/learning.service.ts:763](../../../apps/api/src/modules/learning/learning.service.ts#L763)。
- `LearningService.draft`；[apps/api/src/modules/learning/learning.service.ts:788](../../../apps/api/src/modules/learning/learning.service.ts#L788)。
- `LearningService.submit`；[apps/api/src/modules/learning/learning.service.ts:887](../../../apps/api/src/modules/learning/learning.service.ts#L887)。
- `LearningService.hint`；[apps/api/src/modules/learning/learning.service.ts:965](../../../apps/api/src/modules/learning/learning.service.ts#L965)。
- `LearningService.complete`；[apps/api/src/modules/learning/learning.service.ts:982](../../../apps/api/src/modules/learning/learning.service.ts#L982)。

## LEARN-04 错题与待复核入口

**输入**：学生与学科。

**处理与实现**：汇总已结束评测和训练的未达标或待复核记录，采用有效评分修订，关联冻结题目和来源。

**输出**：可展开的错误事实清单。

**状态与持久化**：`diagnosticResponses`、`practiceAttempts`、`scoringRevisions`

**权限、失败与边界**：未结束评测不提前开放参考答案。

**关联接口**：

- `GET /api/learning/students/:id/mistakes` → `LearningController.mistakes`；[apps/api/src/modules/learning/learning.controller.ts:122](../../../apps/api/src/modules/learning/learning.controller.ts#L122)。

**服务方法**：

- `LearningService.mistakes`；[apps/api/src/modules/learning/learning.service.ts:994](../../../apps/api/src/modules/learning/learning.service.ts#L994)。

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

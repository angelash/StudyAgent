# 10 GESP研究、C++试点与独立保持 — 详细设计

源码基线：`5551169f650474d34e9b1742b09b990cceef2beb`。角色：教研、监护家长、试点学生。

产品入口：`/admin/gesp`、`/parent/gesp`、`/student/gesp`。

## 模块实现

- [apps/api/src/modules/gesp/gesp.service.ts](../../../apps/api/src/modules/gesp/gesp.service.ts)
- [scripts/gesp/run_submission.cjs](../../../scripts/gesp/run_submission.cjs)
- [resources/gesp/student-curriculum-v2.json](../../../resources/gesp/student-curriculum-v2.json)
- [resources/gesp/knowledge-map.json](../../../resources/gesp/knowledge-map.json)

## 共享契约

- [packages/contracts/src/gesp.ts](../../../packages/contracts/src/gesp.ts)

## 关联验证

以下是对应功能领域的测试入口；测试文件存在不等于每个子场景已由真人或所有设备验证。

- [apps/api/src/modules/gesp/gesp.integration.test.ts](../../../apps/api/src/modules/gesp/gesp.integration.test.ts)
- [apps/api/src/modules/gesp/gesp-student.integration.test.ts](../../../apps/api/src/modules/gesp/gesp-student.integration.test.ts)
- [apps/api/src/modules/gesp/gesp-learning-loop.integration.test.ts](../../../apps/api/src/modules/gesp/gesp-learning-loop.integration.test.ts)
- [apps/api/src/modules/gesp/isolated-runner.test.ts](../../../apps/api/src/modules/gesp/isolated-runner.test.ts)

## GESP-01 研究索引、等级与知识先修

**输入**：等级、关键词、知识点或原文哈希。

**处理与实现**：加载1–8级114候选点与独立SQLite题目索引；验证版本化输入哈希；展示原卷、官方解析与镜像来源；按哈希安全读取原文。

**输出**：研究题目、知识关系、来源与缺口。

**状态与持久化**：复用调用者上下文、独立索引、SQL任务表或文件资产；不另造业务集合。

**权限、失败与边界**：3132条研究索引不是3132条已审核学生测量题；研究访问需要教研权限。

**关联接口**：

- `GET /api/gesp/overview` → `GespController.overview`；[apps/api/src/modules/gesp/gesp.controller.ts:11](../../../apps/api/src/modules/gesp/gesp.controller.ts#L11)。
- `GET /api/gesp/atoms` → `GespController.atoms`；[apps/api/src/modules/gesp/gesp.controller.ts:30](../../../apps/api/src/modules/gesp/gesp.controller.ts#L30)。
- `GET /api/gesp/questions` → `GespController.search`；[apps/api/src/modules/gesp/gesp.controller.ts:31](../../../apps/api/src/modules/gesp/gesp.controller.ts#L31)。
- `GET /api/gesp/questions/:id` → `GespController.detail`；[apps/api/src/modules/gesp/gesp.controller.ts:32](../../../apps/api/src/modules/gesp/gesp.controller.ts#L32)。
- `GET /api/gesp/documents/:sha256` → `GespController.document`；[apps/api/src/modules/gesp/gesp.controller.ts:33](../../../apps/api/src/modules/gesp/gesp.controller.ts#L33)。

**服务方法**：

- `GespService.overview`；[apps/api/src/modules/gesp/gesp.service.ts:75](../../../apps/api/src/modules/gesp/gesp.service.ts#L75)。
- `GespService.atoms`；[apps/api/src/modules/gesp/gesp.service.ts:437](../../../apps/api/src/modules/gesp/gesp.service.ts#L437)。
- `GespService.search`；[apps/api/src/modules/gesp/gesp.service.ts:442](../../../apps/api/src/modules/gesp/gesp.service.ts#L442)。
- `GespService.detail`；[apps/api/src/modules/gesp/gesp.service.ts:475](../../../apps/api/src/modules/gesp/gesp.service.ts#L475)。
- `GespService.document`；[apps/api/src/modules/gesp/gesp.service.ts:494](../../../apps/api/src/modules/gesp/gesp.service.ts#L494)。

## GESP-02 试点范围与学生工作区

**输入**：学生、1–4级范围、已选择知识点与版本。

**处理与实现**：家长确认独立编程范围；保存修订；工作区只列兼容任务、概念、实现及保持状态，和小学三科进度隔离。

**输出**：49任务试点的受控学习入口。

**状态与持久化**：`gespLearningScopes`、`gespLearningScopeRevisions`

**权限、失败与边界**：不是完整1–4级标准化课程；等级、任务和审核边界明确显示。

**关联接口**：

- `PUT /api/gesp/students/:studentId/scope` → `GespController.setScope`；[apps/api/src/modules/gesp/gesp.controller.ts:17](../../../apps/api/src/modules/gesp/gesp.controller.ts#L17)。
- `GET /api/gesp/students/:studentId/workspace` → `GespController.workspace`；[apps/api/src/modules/gesp/gesp.controller.ts:20](../../../apps/api/src/modules/gesp/gesp.controller.ts#L20)。

**服务方法**：

- `GespService.setStudentScope`；[apps/api/src/modules/gesp/gesp.service.ts:128](../../../apps/api/src/modules/gesp/gesp.service.ts#L128)。
- `GespService.studentWorkspace`；[apps/api/src/modules/gesp/gesp.service.ts:149](../../../apps/api/src/modules/gesp/gesp.service.ts#L149)。

## GESP-03 概念与跟踪探针

**输入**：taskId、探针ID、选项、请求键与提示事件。

**处理与实现**：按冻结探针和任务指纹判定首次响应；分别记录理解与过程跟踪；回执不返回私有答案包。

**输出**：概念/跟踪证据与即时反馈。

**状态与持久化**：`gespProbeSubmissions`

**权限、失败与边界**：辅助作答与独立作答分开，不能用探针一次正确代表代码实现能力。

**关联接口**：

- `POST /api/gesp/probe-submissions` → `GespController.submitProbe`；[apps/api/src/modules/gesp/gesp.controller.ts:24](../../../apps/api/src/modules/gesp/gesp.controller.ts#L24)。

**服务方法**：

- `GespService.submitProbe`；[apps/api/src/modules/gesp/gesp.service.ts:251](../../../apps/api/src/modules/gesp/gesp.service.ts#L251)。

## GESP-04 隔离C++编译运行与隐藏测试

**输入**：C++源代码、taskId、范围、请求键。

**处理与实现**：先核对范围、任务与测试包指纹；Linux/WSL以用户/挂载/PID/网络等命名空间运行g++；限制源码、CPU、内存、输出与时长；保存编译和用例回执。

**输出**：编译状态、公开用例反馈和汇总。

**状态与持久化**：`gespCodeSubmissions`

**权限、失败与边界**：源码64KiB、最多40用例、编译12秒、运行2秒等限制；隐藏输入和期望输出不回传。

**关联接口**：

- `POST /api/gesp/code-submissions` → `GespController.submitCode`；[apps/api/src/modules/gesp/gesp.controller.ts:23](../../../apps/api/src/modules/gesp/gesp.controller.ts#L23)。

**服务方法**：

- `GespService.submitCode`；[apps/api/src/modules/gesp/gesp.service.ts:273](../../../apps/api/src/modules/gesp/gesp.service.ts#L273)。

## GESP-05 逐级提示与辅助实现记录

**输入**：任务、提示级别、请求键。

**处理与实现**：按任务预置提示逐级开放；提示事件持久化；后续探针与实现关联辅助信息，保留首次独立表现。

**输出**：可追溯提示及辅助状态。

**状态与持久化**：`gespHintEvents`、`gespCodeSubmissions`、`gespProbeSubmissions`

**权限、失败与边界**：不能通过刷新抹去使用提示的事实。

**关联接口**：

- `POST /api/gesp/hints` → `GespController.requestHint`；[apps/api/src/modules/gesp/gesp.controller.ts:25](../../../apps/api/src/modules/gesp/gesp.controller.ts#L25)。

**服务方法**：

- `GespService.requestHint`；[apps/api/src/modules/gesp/gesp.service.ts:169](../../../apps/api/src/modules/gesp/gesp.service.ts#L169)。

## GESP-06 家长确认指导与四阶段保持

**输入**：试点能力证据、每天预算、家长决定。

**处理与实现**：规则汇总理解、跟踪、实现和辅助情况；生成awaiting_confirmation计划；家长确认后激活；用新测试包安排1/3/7/14日保持核查。

**输出**：独立编程指导计划与复测。

**状态与持久化**：`gespGuidancePlans`、`gespGuidancePlanRevisions`、`gespReviewTasks`

**权限、失败与边界**：首次实现、提示后实现与延迟保持不合并成同一掌握状态。

**关联接口**：

- `POST /api/gesp/guidance-plans` → `GespController.createGuidancePlan`；[apps/api/src/modules/gesp/gesp.controller.ts:26](../../../apps/api/src/modules/gesp/gesp.controller.ts#L26)。
- `PATCH /api/gesp/guidance-plans/:planId` → `GespController.decideGuidancePlan`；[apps/api/src/modules/gesp/gesp.controller.ts:27](../../../apps/api/src/modules/gesp/gesp.controller.ts#L27)。

**服务方法**：

- `GespService.createGuidancePlan`；[apps/api/src/modules/gesp/gesp.service.ts:192](../../../apps/api/src/modules/gesp/gesp.service.ts#L192)。
- `GespService.decideGuidancePlan`；[apps/api/src/modules/gesp/gesp.service.ts:235](../../../apps/api/src/modules/gesp/gesp.service.ts#L235)。

## GESP-07 试点任务内容审核与版本历史

**输入**：任务内容指纹、逐项审核决定与理由。

**处理与实现**：教研逐任务查看审核门禁、探针和测试依据；批准绑定当前内容指纹；任何任务内容变化使旧审核不能直接发布新内容。

**输出**：已审核/试点状态及历史。

**状态与持久化**：`gespTaskReviews`、`gespTaskReviewRevisions`

**权限、失败与边界**：研究原题与自编试点是不同资产；程序通过隐藏测试不等于教学已真人审核。

**关联接口**：

- `GET /api/gesp/student-content` → `GespController.studentContent`；[apps/api/src/modules/gesp/gesp.controller.ts:12](../../../apps/api/src/modules/gesp/gesp.controller.ts#L12)。
- `POST /api/gesp/student-content/reviews` → `GespController.reviewStudentContent`；[apps/api/src/modules/gesp/gesp.controller.ts:13](../../../apps/api/src/modules/gesp/gesp.controller.ts#L13)。
- `GET /api/gesp/student-content/:taskId/reviews` → `GespController.studentContentReviews`；[apps/api/src/modules/gesp/gesp.controller.ts:14](../../../apps/api/src/modules/gesp/gesp.controller.ts#L14)。

**服务方法**：

- `GespService.studentContentReview`；[apps/api/src/modules/gesp/gesp.service.ts:88](../../../apps/api/src/modules/gesp/gesp.service.ts#L88)。
- `GespService.reviewStudentTask`；[apps/api/src/modules/gesp/gesp.service.ts:100](../../../apps/api/src/modules/gesp/gesp.service.ts#L100)。
- `GespService.studentTaskReviewHistory`；[apps/api/src/modules/gesp/gesp.service.ts:121](../../../apps/api/src/modules/gesp/gesp.service.ts#L121)。

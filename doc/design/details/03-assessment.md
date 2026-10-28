# 03 评测组题、作答与评分 — 详细设计

源码基线：`ef7466b508847dd70320cf2bd8521574789b1cdb`。角色：学生、监护家长、授权教师。

产品入口：`/student/assessment`、`/parent/dashboard`。

## 模块实现

- [apps/api/src/modules/diagnostics/diagnostics.service.ts](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts)
- [apps/api/src/modules/diagnostics/assessment-blueprint.ts](../../../apps/api/src/modules/diagnostics/assessment-blueprint.ts)
- [apps/api/src/modules/diagnostics/scoring.ts](../../../apps/api/src/modules/diagnostics/scoring.ts)
- [apps/api/src/common/answer-draft.ts](../../../apps/api/src/common/answer-draft.ts)
- [apps/web/lib/answer-draft.ts](../../../apps/web/lib/answer-draft.ts)
- [apps/web/components/answer-draft-status.tsx](../../../apps/web/components/answer-draft-status.tsx)
- [apps/web/components/question-renderer.tsx](../../../apps/web/components/question-renderer.tsx)
- [apps/web/components/structured-answer-input.tsx](../../../apps/web/components/structured-answer-input.tsx)

## 共享契约

- [packages/contracts/src/diagnostics.ts](../../../packages/contracts/src/diagnostics.ts)
- [packages/contracts/src/answer-protocol.ts](../../../packages/contracts/src/answer-protocol.ts)
- [packages/contracts/src/answer-draft.ts](../../../packages/contracts/src/answer-draft.ts)
- [packages/contracts/src/index.ts](../../../packages/contracts/src/index.ts)

## 关联验证

以下是对应功能领域的测试入口；测试文件存在不等于每个子场景已由真人或所有设备验证。

- [apps/api/src/modules/diagnostics/diagnostics.integration.test.ts](../../../apps/api/src/modules/diagnostics/diagnostics.integration.test.ts)
- [apps/api/src/modules/diagnostics/answer-protocol.test.ts](../../../apps/api/src/modules/diagnostics/answer-protocol.test.ts)
- [apps/api/src/modules/diagnostics/scoring.test.ts](../../../apps/api/src/modules/diagnostics/scoring.test.ts)
- [apps/api/src/modules/diagnostics/answer-draft.integration.test.ts](../../../apps/api/src/modules/diagnostics/answer-draft.integration.test.ts)
- [apps/api/src/modules/diagnostics/answer-draft-postgres-recovery.integration.test.ts](../../../apps/api/src/modules/diagnostics/answer-draft-postgres-recovery.integration.test.ts)
- [tests/e2e/product-smoke.spec.ts](../../../tests/e2e/product-smoke.spec.ts)
- [tests/e2e/answer-journeys.spec.ts](../../../tests/e2e/answer-journeys.spec.ts)

## ASM-01 六类评测蓝图预览

**输入**：baseline/unit/phase/micro/verification/retest、目标点、题量、时长。

**处理与实现**：在已确认范围内按评测策略、题族去重和时长预算选题；基础锚点优先并兼顾维度；给出小组、停止原因与覆盖缺口。

**输出**：有有效期的蓝图与预计负担。

**状态与持久化**：`diagnosticBlueprints`、`learningScopes`、`measurementItems`

**权限、失败与边界**：低年级每组2题，其余每组3题；缺题不扩到未学范围；保持证据必须有真实间隔。

**关联接口**：

- `POST /api/diagnostics/blueprints` → `DiagnosticsController.previewBlueprint`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:84](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L84)。
- `GET /api/diagnostics/blueprints/:blueprintId` → `DiagnosticsController.blueprint`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:86](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L86)。

**服务方法**：

- `DiagnosticsService.previewBlueprint`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:159](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L159)。
- `DiagnosticsService.getBlueprint`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:192](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L192)。

## ASM-02 确认蓝图与冻结评测

**输入**：蓝图ID、确认命令、请求键。

**处理与实现**：预览保存30分钟；开始前复核范围、定义、题面、曝光和指纹；冻结题目、映射、答案、评分标准、原子定义与随机种子。

**输出**：可恢复DiagnosticSession。

**状态与持久化**：`diagnosticSessions`、`diagnosticBlueprints`

**权限、失败与边界**：相同请求安全重放；过期或定义变化返回409并要求重新预览。

**关联接口**：

- `POST /api/diagnostics/blueprints/:blueprintId/start` → `DiagnosticsController.startBlueprint`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:88](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L88)。
- `POST /api/diagnostics/sessions` → `DiagnosticsController.start`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:82](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L82)。

**服务方法**：

- `DiagnosticsService.startBlueprint`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:193](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L193)。
- `DiagnosticsService.start`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:36](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L36)。

## ASM-03 冻结题组内的逐题自适应

**输入**：冻结题组、上一条作答及其独立性。

**处理与实现**：先基础锚点；独立失败时在已冻结先修或同点题中对照；迁移失败返回基础；基础成功转迁移；提示/跳过/待复核不当作独立对错。

**输出**：下一题及可展开路由依据。

**状态与持久化**：`diagnosticSessions`、`diagnosticResponses`

**权限、失败与边界**：不动态创造新题，也不因一次错误就认定深层原因；复测保持固定。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

**补充实现文件**：

- [apps/api/src/modules/diagnostics/adaptive-routing.ts](../../../apps/api/src/modules/diagnostics/adaptive-routing.ts)

## ASM-04 会话列表、分组呈现与恢复

**输入**：学生/学科、sessionId、itemId。

**处理与实现**：校验学生权限和题目是否属于冻结会话；返回公开题面与互动配置；恢复进度、草稿与已作答状态。

**输出**：可安全呈现的题目和会话摘要。

**状态与持久化**：`diagnosticSessions`、`diagnosticResponses`、`diagnosticDrafts`

**权限、失败与边界**：未完成活动不提前返回私有标准答案。

**关联接口**：

- `GET /api/diagnostics/sessions` → `DiagnosticsController.list`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:92](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L92)。
- `GET /api/diagnostics/sessions/:sessionId` → `DiagnosticsController.session`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:96](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L96)。
- `GET /api/diagnostics/sessions/:sessionId/items/:itemId` → `DiagnosticsController.render`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:102](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L102)。

**服务方法**：

- `DiagnosticsService.listSessions`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:233](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L233)。
- `DiagnosticsService.sessionView`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:239](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L239)。
- `DiagnosticsService.renderItem`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:300](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L300)。

## ASM-05 草稿、暂停、继续与提前结束

**输入**：部分作答、actorId、冻结题面摘要、expectedRevision、requestKey、action。

**处理与实现**：两路径共用草稿v2，区分原保存回执和当前修订；串行保存、标签页缓存、离线恢复、冲突对照/下载和退出前结清；旧写推进修订，升级后拒绝绕过；暂停/终止保留未知边界。

**输出**：草稿状态、确认修订、当前修订、部分或完整报告。

**状态与持久化**：`diagnosticDrafts`、`diagnosticSessions`、`diagnosticReports`

**权限、失败与边界**：每题最多1024条v2回执，满额明确拒写并保留作品；旧范围返回不能改当前输入。

**关联接口**：

- `PATCH /api/diagnostics/sessions/:sessionId/items/:itemId/draft` → `DiagnosticsController.draft`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:106](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L106)。
- `POST /api/diagnostics/sessions/:sessionId/state` → `DiagnosticsController.changeState`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:90](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L90)。
- `POST /api/diagnostics/sessions/:sessionId/complete` → `DiagnosticsController.complete`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:112](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L112)。

**服务方法**：

- `DiagnosticsService.saveDraft`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:325](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L325)。
- `DiagnosticsService.changeState`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:260](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L260)。
- `DiagnosticsService.complete`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:417](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L417)。

## ASM-06 首次响应、跳过、不会与提示

**输入**：answer、disposition、elapsedMs、请求键、draftFence。

**处理与实现**：首次提交冻结完整命令和耗时，校验账号/题面/草稿修订；丢回执先核对原提交，JSON对象键序不制造异参；保留提示/曝光与不会/跳过的原事实。

**输出**：不可重复增加的首次表现。

**状态与持久化**：`diagnosticResponses`、`diagnosticHints`

**权限、失败与边界**：耗时不直接推断注意力；升级草稿不能用旧请求绕过，重放不制造第二次首答。

**关联接口**：

- `POST /api/diagnostics/sessions/:sessionId/responses` → `DiagnosticsController.respond`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:104](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L104)。
- `POST /api/diagnostics/sessions/:sessionId/items/:itemId/hint` → `DiagnosticsController.hint`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:110](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L110)。

**服务方法**：

- `DiagnosticsService.submit`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:343](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L343)。
- `DiagnosticsService.hint`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:404](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L404)。

## ASM-07 17类作答控件与协议

**输入**：questionId、mode、response。

**处理与实现**：共享协议定义选项、空格、配对、序列、分类、表格、绘图笔迹和媒体引用；前端使用对应控件；后端校验结构、长度、键和值域。

**输出**：标准化StudentAnswerPayload。

**状态与持久化**：`diagnosticResponses`、`diagnosticDrafts`、`questionAnswerSchemas`

**权限、失败与边界**：文本、公式、作图和录音不能一律按字符串比较；缺配置时明确不支持。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

**补充实现文件**：

- [packages/contracts/src/answer-protocol.ts](../../../packages/contracts/src/answer-protocol.ts)

## ASM-08 确定性评分与量规分流

**输入**：冻结答案协议、参考答案、学生输入。

**处理与实现**：按模式处理数字容差、分数等值、单位、集合、配对、顺序及逐项得分；主观表达、步骤、绘图、图片与音频转pending_review。

**输出**：score/correct/status/reason/scoreDetails。

**状态与持久化**：`diagnosticResponses`、`scoringRevisions`

**权限、失败与边界**：空白不能转成数字0；标准答案与协议不匹配时转复核，不猜测评分。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

## ASM-09 原始作答证据查看

**输入**：学生、responseId。

**处理与实现**：核对证据所属学生和会话；返回冻结题面、答案、时间、提示、评分依据与复核版本。

**输出**：报告可展开的证据详情。

**状态与持久化**：`diagnosticResponses`、`diagnosticSessions`、`scoringRevisions`

**权限、失败与边界**：证据权限沿用学生授权，不允许按任意ID读取其他家庭。

**关联接口**：

- `GET /api/diagnostics/students/:studentId/evidence/:responseId` → `DiagnosticsController.evidence`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:98](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L98)。

**服务方法**：

- `DiagnosticsService.evidenceView`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:563](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L563)。

## ASM-10 评分复核与报告历史

**输入**：量规分项、理由、预期复核版本。

**处理与实现**：授权复核员按冻结量规录入分项；生成追加式评分修订；重新生成报告版本与诊断，保留原始响应和原报告。知识点工作区按当前报告提供逐题原作答、评分修订与反馈读取，完整原因历史不截断。

**输出**：新评分版本及历史对照。

**状态与持久化**：`scoringRevisions`、`diagnosticReports`、`diagnosticResponses`

**权限、失败与边界**：复核不是覆盖或删除首次答案；需要区分评分变化与学生改善。

**关联接口**：

- `POST /api/admin/diagnostic-responses/:responseId/review` → `DiagnosticsController.reviewScore`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:148](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L148)。
- `GET /api/diagnostics/sessions/:sessionId/report-history` → `DiagnosticsController.reportHistory`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:150](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L150)。

**服务方法**：

- `DiagnosticsService.reviewScore`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:627](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L627)。
- `DiagnosticsService.reportHistory`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:509](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L509)。

**补充实现文件**：

- [apps/web/components/knowledge-report-workspace.tsx](../../../apps/web/components/knowledge-report-workspace.tsx)
- [doc/product/126-knowledge-report-workspace-and-evidence-paths.md](../../../doc/product/126-knowledge-report-workspace-and-evidence-paths.md)
- [tests/e2e/knowledge-report.spec.ts](../../../tests/e2e/knowledge-report.spec.ts)
- [doc/evidence/2026-10-26/knowledge-report-focused/receipt.json](../../../doc/evidence/2026-10-26/knowledge-report-focused/receipt.json)

## ASM-11 报告生成、画像与重新分析

**输入**：sessionId或学生/学科、重分析请求键。

**处理与实现**：汇总实际作答的样本、区间、原子观察和原因假设；保存报告版本；沿估计引用追溯历史证据，区分计量与题族方法兼容性。家长显式按原记录追加报告，原键恢复同一回执；账号、角色、学生、版本与方法隔离状态读取和本机原命令，冲突先归档再只读最新。报告工作区按冻结目标组织四维估计、区间和未知项，支持搜索、刷新及前进后退。

**输出**：证据报告、能力画像、分析状态。

**状态与持久化**：`diagnosticReports`、`diagnosticHypotheses`、`diagnosticResponses`

**权限、失败与边界**：rule-estimate-v3不把自述当成独立作答，只有自述时未知/null/0样本。原任务记分与历史v2数值保留；方法更新不表示进步。原件缺失时保留历史并要求新评测，不从新题库补原证据。

**关联接口**：

- `GET /api/diagnostics/sessions/:sessionId/report` → `DiagnosticsController.report`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:114](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L114)。
- `GET /api/diagnostics/students/:studentId/profile` → `DiagnosticsController.profile`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:120](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L120)。
- `GET /api/diagnostics/sessions/:sessionId/analysis-status` → `DiagnosticsController.analysisStatus`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:116](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L116)。
- `POST /api/diagnostics/sessions/:sessionId/reanalyze` → `DiagnosticsController.reanalyze`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:118](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L118)。

**服务方法**：

- `DiagnosticsService.report`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:502](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L502)。
- `DiagnosticsService.profile`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:482](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L482)。
- `DiagnosticsService.analysisStatus`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:516](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L516)。
- `DiagnosticsService.reanalyzeReport`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:535](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L535)。

**补充实现文件**：

- [apps/api/src/modules/diagnostics/measurement-compatibility.ts](../../../apps/api/src/modules/diagnostics/measurement-compatibility.ts)
- [apps/web/components/report-analysis-update.tsx](../../../apps/web/components/report-analysis-update.tsx)
- [apps/web/components/knowledge-report-workspace.tsx](../../../apps/web/components/knowledge-report-workspace.tsx)
- [apps/web/components/knowledge-report-workspace.css](../../../apps/web/components/knowledge-report-workspace.css)
- [doc/product/139-self-reported-difficulty-and-measurement-versioning.md](../../../doc/product/139-self-reported-difficulty-and-measurement-versioning.md)
- [tests/e2e/knowledge-report.spec.ts](../../../tests/e2e/knowledge-report.spec.ts)

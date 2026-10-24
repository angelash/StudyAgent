# 03 评测组题、作答与评分 — 详细设计

源码基线：`eec36f63b2c960cceec9a936f6576b9cf0efb9e7`。角色：学生、监护家长、授权教师。

产品入口：`/student/assessment`、`/parent/dashboard`。

## 模块实现

- [apps/api/src/modules/diagnostics/diagnostics.service.ts](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts)
- [apps/api/src/modules/diagnostics/assessment-blueprint.ts](../../../apps/api/src/modules/diagnostics/assessment-blueprint.ts)
- [apps/api/src/modules/diagnostics/scoring.ts](../../../apps/api/src/modules/diagnostics/scoring.ts)
- [apps/web/components/structured-answer-input.tsx](../../../apps/web/components/structured-answer-input.tsx)

## 共享契约

- [packages/contracts/src/diagnostics.ts](../../../packages/contracts/src/diagnostics.ts)
- [packages/contracts/src/answer-protocol.ts](../../../packages/contracts/src/answer-protocol.ts)
- [packages/contracts/src/index.ts](../../../packages/contracts/src/index.ts)

## 关联验证

以下是对应功能领域的测试入口；测试文件存在不等于每个子场景已由真人或所有设备验证。

- [apps/api/src/modules/diagnostics/diagnostics.integration.test.ts](../../../apps/api/src/modules/diagnostics/diagnostics.integration.test.ts)
- [apps/api/src/modules/diagnostics/answer-protocol.test.ts](../../../apps/api/src/modules/diagnostics/answer-protocol.test.ts)
- [apps/api/src/modules/diagnostics/scoring.test.ts](../../../apps/api/src/modules/diagnostics/scoring.test.ts)
- [tests/e2e/product-smoke.spec.ts](../../../tests/e2e/product-smoke.spec.ts)

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

- `DiagnosticsService.previewBlueprint`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:155](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L155)。
- `DiagnosticsService.getBlueprint`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:187](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L187)。

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

- `DiagnosticsService.startBlueprint`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:188](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L188)。
- `DiagnosticsService.start`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:33](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L33)。

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

- `DiagnosticsService.listSessions`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:227](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L227)。
- `DiagnosticsService.sessionView`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:233](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L233)。
- `DiagnosticsService.renderItem`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:291](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L291)。

## ASM-05 草稿、暂停、继续与提前结束

**输入**：部分作答、action、expectedRevision、requestKey。

**处理与实现**：草稿按专用协议校验并持久化；暂停/恢复/终止受状态和版本约束；完成汇总已答证据，未答题保留未测。

**输出**：保存回执、状态、部分或完整报告。

**状态与持久化**：`diagnosticDrafts`、`diagnosticSessions`、`diagnosticReports`

**权限、失败与边界**：提前结束不把未答题计错；并发页面更新返回409。

**关联接口**：

- `PATCH /api/diagnostics/sessions/:sessionId/items/:itemId/draft` → `DiagnosticsController.draft`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:106](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L106)。
- `POST /api/diagnostics/sessions/:sessionId/state` → `DiagnosticsController.changeState`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:90](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L90)。
- `POST /api/diagnostics/sessions/:sessionId/complete` → `DiagnosticsController.complete`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:112](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L112)。

**服务方法**：

- `DiagnosticsService.saveDraft`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:305](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L305)。
- `DiagnosticsService.changeState`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:251](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L251)。
- `DiagnosticsService.complete`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:385](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L385)。

## ASM-06 首次响应、跳过、不会与提示

**输入**：answer、disposition、elapsedMs、请求键。

**处理与实现**：保存首次有效作答与时间、提示、曝光标志；同请求重放返回同回执；skip与dont_know单独记录；提示以服务端事件固定。

**输出**：不可重复增加的首次表现。

**状态与持久化**：`diagnosticResponses`、`diagnosticHints`

**权限、失败与边界**：耗时是观测值，不直接推断注意力；重复请求不能增加样本。

**关联接口**：

- `POST /api/diagnostics/sessions/:sessionId/responses` → `DiagnosticsController.respond`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:104](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L104)。
- `POST /api/diagnostics/sessions/:sessionId/items/:itemId/hint` → `DiagnosticsController.hint`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:110](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L110)。

**服务方法**：

- `DiagnosticsService.submit`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:321](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L321)。
- `DiagnosticsService.hint`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:372](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L372)。

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

- `DiagnosticsService.evidenceView`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:508](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L508)。

## ASM-10 评分复核与报告历史

**输入**：量规分项、理由、预期复核版本。

**处理与实现**：授权复核员按冻结量规录入分项；生成追加式评分修订；重新生成报告版本与诊断，保留原始响应和原报告。

**输出**：新评分版本及历史对照。

**状态与持久化**：`scoringRevisions`、`diagnosticReports`、`diagnosticResponses`

**权限、失败与边界**：复核不是覆盖或删除首次答案；需要区分评分变化与学生改善。

**关联接口**：

- `POST /api/admin/diagnostic-responses/:responseId/review` → `DiagnosticsController.reviewScore`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:146](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L146)。
- `GET /api/diagnostics/sessions/:sessionId/report-history` → `DiagnosticsController.reportHistory`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:148](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L148)。

**服务方法**：

- `DiagnosticsService.reviewScore`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:571](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L571)。
- `DiagnosticsService.reportHistory`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:466](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L466)。

## ASM-11 报告生成、画像与重新分析

**输入**：sessionId或学生/学科、重分析请求键。

**处理与实现**：汇总有效评分、样本、区间、原子观察和原因假设；保存报告版本；按报告与规则指纹去重重分析请求；AI失败保留规则结果。

**输出**：证据报告、能力画像、分析状态。

**状态与持久化**：`diagnosticReports`、`diagnosticHypotheses`、`diagnosticResponses`

**权限、失败与边界**：画像是规则估计，没有标准化常模；未测点显示未知。

**关联接口**：

- `GET /api/diagnostics/sessions/:sessionId/report` → `DiagnosticsController.report`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:114](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L114)。
- `GET /api/diagnostics/students/:studentId/profile` → `DiagnosticsController.profile`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:120](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L120)。
- `GET /api/diagnostics/sessions/:sessionId/analysis-status` → `DiagnosticsController.analysisStatus`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:116](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L116)。
- `POST /api/diagnostics/sessions/:sessionId/reanalyze` → `DiagnosticsController.reanalyze`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:118](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L118)。

**服务方法**：

- `DiagnosticsService.report`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:459](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L459)。
- `DiagnosticsService.profile`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:439](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L439)。
- `DiagnosticsService.analysisStatus`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:473](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L473)。
- `DiagnosticsService.reanalyzeReport`；[apps/api/src/modules/diagnostics/diagnostics.service.ts:482](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts#L482)。

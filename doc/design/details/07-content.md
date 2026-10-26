# 07 题卷资产、内容编辑、导入与发布 — 详细设计

源码基线：`9b056916f0f93e24d62bb1c60b7f55b604ed5982`。角色：教研、教师、运营、管理员；家长查看已发布内容。

产品入口：`/library`、`/admin/content`、`/admin/imports`、`/admin/measurement`。

## 模块实现

- [apps/api/src/modules/content/content.service.ts](../../../apps/api/src/modules/content/content.service.ts)
- [apps/api/src/modules/question-workspace/question-workspace.service.ts](../../../apps/api/src/modules/question-workspace/question-workspace.service.ts)
- [apps/api/src/modules/question-workspace/question-import.service.ts](../../../apps/api/src/modules/question-workspace/question-import.service.ts)
- [apps/api/src/modules/library/library.service.ts](../../../apps/api/src/modules/library/library.service.ts)
- [apps/api/src/modules/library/library.repository.ts](../../../apps/api/src/modules/library/library.repository.ts)
- [apps/api/src/modules/library/measurement-content.service.ts](../../../apps/api/src/modules/library/measurement-content.service.ts)

## 共享契约

- [packages/contracts/src/index.ts](../../../packages/contracts/src/index.ts)
- [packages/contracts/src/index.ts](../../../packages/contracts/src/index.ts)
- [packages/contracts/src/measurement-content.ts](../../../packages/contracts/src/measurement-content.ts)

## 关联验证

以下是对应功能领域的测试入口；测试文件存在不等于每个子场景已由真人或所有设备验证。

- [apps/api/src/modules/library/library.integration.test.ts](../../../apps/api/src/modules/library/library.integration.test.ts)
- [apps/api/src/modules/library/measurement-content.integration.test.ts](../../../apps/api/src/modules/library/measurement-content.integration.test.ts)
- [apps/api/src/modules/question-workspace/question-import.utils.test.ts](../../../apps/api/src/modules/question-workspace/question-import.utils.test.ts)

## CONTENT-01 基础教材、知识条目与题目维护

**输入**：教材树、基础知识条目、题干/答案/解析、题目知识标签。

**处理与实现**：维护基础题库实体和旧版教学目录；创建题目时补齐题面、答案Schema和来源；保留版本与知识映射。

**输出**：基础目录和题目对象。

**状态与持久化**：`textbookVolumes`、`textbookUnits`、`textbookLessons`、`knowledgePoints`、`questions`

**权限、失败与边界**：基础knowledgePoints与诊断knowledgeAtoms是不同模型，不能互相假定已映射。

**关联接口**：

- `GET /api/textbooks` → `ContentController.listTextbooks`；[apps/api/src/modules/content/content.controller.ts:13](../../../apps/api/src/modules/content/content.controller.ts#L13)。
- `GET /api/textbooks/:volumeId/tree` → `ContentController.getVolumeTree`；[apps/api/src/modules/content/content.controller.ts:18](../../../apps/api/src/modules/content/content.controller.ts#L18)。
- `GET /api/knowledge-points` → `ContentController.listKnowledgePoints`；[apps/api/src/modules/content/content.controller.ts:23](../../../apps/api/src/modules/content/content.controller.ts#L23)。
- `GET /api/questions` → `ContentController.listQuestions`；[apps/api/src/modules/content/content.controller.ts:28](../../../apps/api/src/modules/content/content.controller.ts#L28)。
- `POST /api/admin/textbooks/import` → `ContentController.importTextbooks`；[apps/api/src/modules/content/content.controller.ts:36](../../../apps/api/src/modules/content/content.controller.ts#L36)。
- `POST /api/admin/knowledge-points` → `ContentController.createKnowledgePoint`；[apps/api/src/modules/content/content.controller.ts:45](../../../apps/api/src/modules/content/content.controller.ts#L45)。
- `PATCH /api/admin/knowledge-points/:knowledgePointId` → `ContentController.updateKnowledgePoint`；[apps/api/src/modules/content/content.controller.ts:63](../../../apps/api/src/modules/content/content.controller.ts#L63)。
- `POST /api/admin/questions` → `ContentController.createQuestion`；[apps/api/src/modules/content/content.controller.ts:79](../../../apps/api/src/modules/content/content.controller.ts#L79)。
- `POST /api/admin/questions/:questionId/knowledge-points` → `ContentController.mapQuestionKnowledge`；[apps/api/src/modules/content/content.controller.ts:98](../../../apps/api/src/modules/content/content.controller.ts#L98)。
- `PATCH /api/admin/questions/:questionId/knowledge-points` → `ContentController.replaceQuestionKnowledge`；[apps/api/src/modules/content/content.controller.ts:108](../../../apps/api/src/modules/content/content.controller.ts#L108)。

**服务方法**：

- `ContentService.listTextbooks`；[apps/api/src/modules/content/content.service.ts:56](../../../apps/api/src/modules/content/content.service.ts#L56)。
- `ContentService.getVolumeTree`；[apps/api/src/modules/content/content.service.ts:137](../../../apps/api/src/modules/content/content.service.ts#L137)。
- `ContentService.listKnowledgePoints`；[apps/api/src/modules/content/content.service.ts:170](../../../apps/api/src/modules/content/content.service.ts#L170)。
- `ContentService.listQuestions`；[apps/api/src/modules/content/content.service.ts:237](../../../apps/api/src/modules/content/content.service.ts#L237)。
- `ContentService.importTextbooks`；[apps/api/src/modules/content/content.service.ts:60](../../../apps/api/src/modules/content/content.service.ts#L60)。
- `ContentService.createKnowledgePoint`；[apps/api/src/modules/content/content.service.ts:182](../../../apps/api/src/modules/content/content.service.ts#L182)。
- `ContentService.updateKnowledgePoint`；[apps/api/src/modules/content/content.service.ts:202](../../../apps/api/src/modules/content/content.service.ts#L202)。
- `ContentService.createQuestion`；[apps/api/src/modules/content/content.service.ts:241](../../../apps/api/src/modules/content/content.service.ts#L241)。
- `ContentService.mapQuestionKnowledge`；[apps/api/src/modules/content/content.service.ts:267](../../../apps/api/src/modules/content/content.service.ts#L267)。
- `ContentService.replaceQuestionKnowledge`；[apps/api/src/modules/content/content.service.ts:282](../../../apps/api/src/modules/content/content.service.ts#L282)。

## CONTENT-02 题面文档、作答Schema与来源三件套

**输入**：结构化blocks、附件、mode、validationRules、gradingConfig、许可与审核。

**处理与实现**：分别验证题面、互动和来源；更新版本；公开呈现剔除私有评分键；来源按internal/open/reference-only等资格管理。

**输出**：QuestionDocument、QuestionAnswerSchema、QuestionSourceRecord。

**状态与持久化**：`questionDocuments`、`questionAnswerSchemas`、`questionSources`

**权限、失败与边界**：题干可看、可作答、可评分、可发布是不同条件。

**关联接口**：

- `POST /api/admin/questions/:questionId/document` → `QuestionWorkspaceController.upsertDocument`；[apps/api/src/modules/question-workspace/question-workspace.controller.ts:75](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L75)。
- `POST /api/admin/questions/:questionId/answer-schema` → `QuestionWorkspaceController.upsertAnswerSchema`；[apps/api/src/modules/question-workspace/question-workspace.controller.ts:98](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L98)。
- `POST /api/admin/questions/:questionId/source` → `QuestionWorkspaceController.upsertSource`；[apps/api/src/modules/question-workspace/question-workspace.controller.ts:116](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L116)。

**服务方法**：

- `QuestionWorkspaceService.upsertDocument`；[apps/api/src/modules/question-workspace/question-workspace.service.ts:50](../../../apps/api/src/modules/question-workspace/question-workspace.service.ts#L50)。
- `QuestionWorkspaceService.upsertAnswerSchema`；[apps/api/src/modules/question-workspace/question-workspace.service.ts:81](../../../apps/api/src/modules/question-workspace/question-workspace.service.ts#L81)。
- `QuestionWorkspaceService.upsertSource`；[apps/api/src/modules/question-workspace/question-workspace.service.ts:107](../../../apps/api/src/modules/question-workspace/question-workspace.service.ts#L107)。

## CONTENT-03 授权题目呈现与答案结构校验

**输入**：questionId、当前活动上下文、响应。

**处理与实现**：验证题目发布与当前活动可见性；构建公开blocks和输入配置；校验答案结构并给出协议错误；不执行学生公式或HTML。

**输出**：QuestionRenderPayload与校验结果。

**状态与持久化**：`questions`、`questionDocuments`、`questionAnswerSchemas`、`questionSources`

**权限、失败与边界**：通用校验接口不等同于正式提交评分，不增加学习证据。

**关联接口**：

- `GET /api/questions/:questionId/render` → `QuestionWorkspaceController.getRenderPayload`；[apps/api/src/modules/question-workspace/question-workspace.controller.ts:136](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L136)。
- `POST /api/questions/:questionId/answers/validate` → `QuestionWorkspaceController.validateAnswer`；[apps/api/src/modules/question-workspace/question-workspace.controller.ts:142](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L142)。

**服务方法**：

- `QuestionWorkspaceService.buildAuthorizedRenderPayload`；[apps/api/src/modules/question-workspace/question-workspace.service.ts:149](../../../apps/api/src/modules/question-workspace/question-workspace.service.ts#L149)。
- `QuestionWorkspaceService.validateAnswer`；[apps/api/src/modules/question-workspace/question-workspace.service.ts:179](../../../apps/api/src/modules/question-workspace/question-workspace.service.ts#L179)。

## CONTENT-04 文件驱动的批量导入任务

**输入**：导入文件ID、类型、来源与许可、请求键。

**处理与实现**：文件先经过受控上传；创建持久处理任务；JSON/文本/PDF按相应适配器生成记录或页面候选；保留原件和错误。

**输出**：任务进度、候选列表、来源页。

**状态与持久化**：`questionImportJobs`、`questionImportRecords`、`importPages`、`importFiles`

**权限、失败与边界**：机器识别只产生候选，PDF页面不自动变成已审核可测量题。

**关联接口**：

- `GET /api/admin/question-import-jobs` → `QuestionWorkspaceController.listImportJobs`；[apps/api/src/modules/question-workspace/question-workspace.controller.ts:14](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L14)。
- `POST /api/admin/question-import-jobs` → `QuestionWorkspaceController.createImportJob`；[apps/api/src/modules/question-workspace/question-workspace.controller.ts:20](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L20)。
- `GET /api/admin/question-import-jobs/:jobId` → `QuestionWorkspaceController.getImportJob`；[apps/api/src/modules/question-workspace/question-workspace.controller.ts:30](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L30)。
- `GET /api/admin/question-import-jobs/:jobId/records` → `QuestionWorkspaceController.listImportRecords`；[apps/api/src/modules/question-workspace/question-workspace.controller.ts:36](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L36)。
- `GET /api/admin/question-import-jobs/:jobId/candidates` → `QuestionWorkspaceController.listCandidates`；[apps/api/src/modules/question-workspace/question-workspace.controller.ts:42](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L42)。
- `GET /api/admin/question-import-records/:recordId` → `QuestionWorkspaceController.getCandidate`；[apps/api/src/modules/question-workspace/question-workspace.controller.ts:46](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L46)。

**服务方法**：

- `QuestionImportService.listJobs`；[apps/api/src/modules/question-workspace/question-import.service.ts:57](../../../apps/api/src/modules/question-workspace/question-import.service.ts#L57)。
- `QuestionImportService.createJob`；[apps/api/src/modules/question-workspace/question-import.service.ts:94](../../../apps/api/src/modules/question-workspace/question-import.service.ts#L94)。
- `QuestionImportService.getJob`；[apps/api/src/modules/question-workspace/question-import.service.ts:62](../../../apps/api/src/modules/question-workspace/question-import.service.ts#L62)。
- `QuestionImportService.listRecords`；[apps/api/src/modules/question-workspace/question-import.service.ts:67](../../../apps/api/src/modules/question-workspace/question-import.service.ts#L67)。
- `QuestionImportService.listCandidates`；[apps/api/src/modules/question-workspace/question-import.service.ts:82](../../../apps/api/src/modules/question-workspace/question-import.service.ts#L82)。
- `QuestionImportService.candidate`；[apps/api/src/modules/question-workspace/question-import.service.ts:89](../../../apps/api/src/modules/question-workspace/question-import.service.ts#L89)。

## CONTENT-05 候选人工审核与AI结构化辅助

**输入**：候选、修订题面/答案协议、审核决定。

**处理与实现**：先展示原始记录与识别结果；人工修订和决定；AI只能提出结构候选；批准后建立正式题目三件套。

**输出**：审核结果与正式内容ID。

**状态与持久化**：`questionImportRecords`、`questionDocuments`、`questionAnswerSchemas`、`questionSources`

**权限、失败与边界**：模型输出须经过schema与许可校验，不能绕过发布审核。

**关联接口**：

- `POST /api/admin/question-import-records/:recordId/review` → `QuestionWorkspaceController.reviewImportRecord`；[apps/api/src/modules/question-workspace/question-workspace.controller.ts:50](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L50)。
- `POST /api/admin/question-import-records/:recordId/ai-structure` → `QuestionWorkspaceController.structureImportRecord`；[apps/api/src/modules/question-workspace/question-workspace.controller.ts:69](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L69)。

**服务方法**：

- `QuestionImportService.reviewRecord`；[apps/api/src/modules/question-workspace/question-import.service.ts:160](../../../apps/api/src/modules/question-workspace/question-import.service.ts#L160)。
- `QuestionImportService.structureRecordWithAi`；[apps/api/src/modules/question-workspace/question-import.service.ts:222](../../../apps/api/src/modules/question-workspace/question-import.service.ts#L222)。

## CONTENT-06 原始题卷目录与多维检索

**输入**：关键词、年级、学科、地区、complete/partial/pdf、集合、页码。

**处理与实现**：独立只读索引按SQL过滤与分页；研究集需特权，家庭只见已发布集合；可切换收藏并保留完整性状态。

**输出**：分页题卷元数据和过滤项。

**状态与持久化**：`paperPublications`、`libraryBookmarks`

**权限、失败与边界**：当前实现pageSize最多40；不能以原始库规模声称可测量题数量。

**关联接口**：

- `GET /api/library/overview` → `LibraryController.overview`；[apps/api/src/modules/library/library.controller.ts:12](../../../apps/api/src/modules/library/library.controller.ts#L12)。
- `GET /api/library/facets` → `LibraryController.facets`；[apps/api/src/modules/library/library.controller.ts:13](../../../apps/api/src/modules/library/library.controller.ts#L13)。
- `GET /api/library/papers` → `LibraryController.search`；[apps/api/src/modules/library/library.controller.ts:14](../../../apps/api/src/modules/library/library.controller.ts#L14)。

**服务方法**：

- `LibraryService.overview`；[apps/api/src/modules/library/library.service.ts:43](../../../apps/api/src/modules/library/library.service.ts#L43)。
- `LibraryService.facets`；[apps/api/src/modules/library/library.service.ts:51](../../../apps/api/src/modules/library/library.service.ts#L51)。
- `LibraryService.search`；[apps/api/src/modules/library/library.service.ts:52](../../../apps/api/src/modules/library/library.service.ts#L52)。

## CONTENT-07 原卷、缺题位置、媒体与打印

**输入**：paperId、是否查看解析、卷内媒体URL。

**处理与实现**：清洗原始HTML；逐题保留题序与缺题槽位；本地媒体代理先验证资源属于该卷；PDF卷保留原文阅读与浏览器打印。

**输出**：原卷结构、PDF和缺失媒体提示。

**状态与持久化**：`paperPublications`

**权限、失败与边界**：部分卷不填造缺题；原卷练习不自动进入知识点测量。

**关联接口**：

- `GET /api/library/papers/:id` → `LibraryController.preview`；[apps/api/src/modules/library/library.controller.ts:15](../../../apps/api/src/modules/library/library.controller.ts#L15)。
- `GET /api/library/media` → `LibraryController.media`；[apps/api/src/modules/library/library.controller.ts:20](../../../apps/api/src/modules/library/library.controller.ts#L20)。

**服务方法**：

- `LibraryService.preview`；[apps/api/src/modules/library/library.service.ts:77](../../../apps/api/src/modules/library/library.service.ts#L77)。
- `LibraryService.media`；[apps/api/src/modules/library/library.service.ts:97](../../../apps/api/src/modules/library/library.service.ts#L97)。

## CONTENT-08 整卷发布、撤回与收藏

**输入**：许可证据、内容/媒体验证、发布理由、收藏状态。

**处理与实现**：研究角色核对原卷许可与内容媒体后发布或撤回；收藏按当前账号和试卷保存；非发布卷对普通账号不可见。

**输出**：整卷发布资格和个人收藏。

**状态与持久化**：`paperPublications`、`libraryBookmarks`

**权限、失败与边界**：整卷可见不代表每道题已具备测量映射与评分审核。

**关联接口**：

- `POST /api/library/papers/:id/publication` → `LibraryController.publish`；[apps/api/src/modules/library/library.controller.ts:18](../../../apps/api/src/modules/library/library.controller.ts#L18)。
- `PATCH /api/library/papers/:id/bookmark` → `LibraryController.bookmark`；[apps/api/src/modules/library/library.controller.ts:19](../../../apps/api/src/modules/library/library.controller.ts#L19)。

**服务方法**：

- `LibraryService.publish`；[apps/api/src/modules/library/library.service.ts:104](../../../apps/api/src/modules/library/library.service.ts#L104)。
- `LibraryService.bookmark`；[apps/api/src/modules/library/library.service.ts:123](../../../apps/api/src/modules/library/library.service.ts#L123)。

## CONTENT-09 原卷题转量化素材候选

**输入**：paperId、位置、题面/答案/量规/知识映射草稿。

**处理与实现**：按原始位置建立不可变来源快照与哈希；逐条保留缺失原因；人工修订草稿，更新draftHash与版本。

**输出**：测量素材候选和来源对照。

**状态与持久化**：`measurementCandidates`

**权限、失败与边界**：缺失原题或仅有PDF时先走页面导入，不用推测内容填题。

**关联接口**：

- `GET /api/measurement-content/candidates` → `MeasurementContentController.list`；[apps/api/src/modules/library/measurement-content.controller.ts:12](../../../apps/api/src/modules/library/measurement-content.controller.ts#L12)。
- `POST /api/measurement-content/candidates` → `MeasurementContentController.stage`；[apps/api/src/modules/library/measurement-content.controller.ts:13](../../../apps/api/src/modules/library/measurement-content.controller.ts#L13)。
- `GET /api/measurement-content/candidates/:id` → `MeasurementContentController.detail`；[apps/api/src/modules/library/measurement-content.controller.ts:14](../../../apps/api/src/modules/library/measurement-content.controller.ts#L14)。
- `POST /api/measurement-content/candidates/:id/draft` → `MeasurementContentController.save`；[apps/api/src/modules/library/measurement-content.controller.ts:15](../../../apps/api/src/modules/library/measurement-content.controller.ts#L15)。

**服务方法**：

- `MeasurementContentService.list`；[apps/api/src/modules/library/measurement-content.service.ts:40](../../../apps/api/src/modules/library/measurement-content.service.ts#L40)。
- `MeasurementContentService.stage`；[apps/api/src/modules/library/measurement-content.service.ts:49](../../../apps/api/src/modules/library/measurement-content.service.ts#L49)。
- `MeasurementContentService.detail`；[apps/api/src/modules/library/measurement-content.service.ts:81](../../../apps/api/src/modules/library/measurement-content.service.ts#L81)。
- `MeasurementContentService.save`；[apps/api/src/modules/library/measurement-content.service.ts:150](../../../apps/api/src/modules/library/measurement-content.service.ts#L150)。

## CONTENT-10 五门禁测量发布及撤回

**输入**：source/content/media/scoring/mapping审核、expectedVersion、requestKey。

**处理与实现**：分别审核五门；核对草稿和知识指纹；发布时建立正式题面、协议、来源与测量映射；撤回退出新选题。

**输出**：可参与新评测的正式题目。

**状态与持久化**：`measurementCandidates`、`questions`、`questionDocuments`、`questionAnswerSchemas`、`questionSources`、`measurementItems`

**权限、失败与边界**：旧会话保留冻结快照；内容变化后旧审核不得直接沿用。

**关联接口**：

- `POST /api/measurement-content/candidates/:id/reviews` → `MeasurementContentController.review`；[apps/api/src/modules/library/measurement-content.controller.ts:16](../../../apps/api/src/modules/library/measurement-content.controller.ts#L16)。
- `POST /api/measurement-content/candidates/:id/publish` → `MeasurementContentController.publish`；[apps/api/src/modules/library/measurement-content.controller.ts:17](../../../apps/api/src/modules/library/measurement-content.controller.ts#L17)。
- `POST /api/measurement-content/candidates/:id/withdraw` → `MeasurementContentController.withdraw`；[apps/api/src/modules/library/measurement-content.controller.ts:18](../../../apps/api/src/modules/library/measurement-content.controller.ts#L18)。
- `GET /api/measurement-content/candidates/:id/media/:index` → `MeasurementContentController.media`；[apps/api/src/modules/library/measurement-content.controller.ts:19](../../../apps/api/src/modules/library/measurement-content.controller.ts#L19)。

**服务方法**：

- `MeasurementContentService.review`；[apps/api/src/modules/library/measurement-content.service.ts:175](../../../apps/api/src/modules/library/measurement-content.service.ts#L175)。
- `MeasurementContentService.publish`；[apps/api/src/modules/library/measurement-content.service.ts:188](../../../apps/api/src/modules/library/measurement-content.service.ts#L188)。
- `MeasurementContentService.withdraw`；[apps/api/src/modules/library/measurement-content.service.ts:223](../../../apps/api/src/modules/library/measurement-content.service.ts#L223)。
- `MeasurementContentService.media`；[apps/api/src/modules/library/measurement-content.service.ts:234](../../../apps/api/src/modules/library/measurement-content.service.ts#L234)。

## CONTENT-11 基础题库覆盖检查与补架

**输入**：教材册次、覆盖参数、内容发布命令。

**处理与实现**：统计旧基础目录的题目覆盖；受控补建或关联基础示例结构；发布仍检查内容、作答协议和来源。

**输出**：覆盖摘要及补充记录。

**状态与持久化**：`questions`、`knowledgePoints`、`questionSources`

**权限、失败与边界**：此基础覆盖与原子测量对照素材覆盖分开统计，脚手架不能宣称完整教学。

**关联接口**：

- `POST /api/admin/textbooks/:volumeId/scaffold-questions` → `ContentController.scaffoldVolumeQuestions`；[apps/api/src/modules/content/content.controller.ts:118](../../../apps/api/src/modules/content/content.controller.ts#L118)。
- `GET /api/admin/question-coverage/summary` → `ContentController.getQuestionCoverageSummary`；[apps/api/src/modules/content/content.controller.ts:124](../../../apps/api/src/modules/content/content.controller.ts#L124)。
- `POST /api/admin/question-coverage/backfill` → `ContentController.backfillQuestionCoverage`；[apps/api/src/modules/content/content.controller.ts:138](../../../apps/api/src/modules/content/content.controller.ts#L138)。
- `PATCH /api/admin/questions/:questionId/publish` → `ContentController.publishQuestion`；[apps/api/src/modules/content/content.controller.ts:154](../../../apps/api/src/modules/content/content.controller.ts#L154)。

**服务方法**：

- `ContentService.scaffoldVolumeQuestions`；[apps/api/src/modules/content/content.service.ts:297](../../../apps/api/src/modules/content/content.service.ts#L297)。
- `QuestionCoverageService.getCoverageSummary`；[apps/api/src/modules/content/question-coverage.service.ts:116](../../../apps/api/src/modules/content/question-coverage.service.ts#L116)。
- `QuestionCoverageService.backfillQuestionCoverage`；[apps/api/src/modules/content/question-coverage.service.ts:83](../../../apps/api/src/modules/content/question-coverage.service.ts#L83)。
- `ContentService.publishQuestion`；[apps/api/src/modules/content/content.service.ts:315](../../../apps/api/src/modules/content/content.service.ts#L315)。

# 07 题卷资产、内容编辑、导入与发布 — 详细设计

源码基线：`95715abf997e4d3356cf8f6593238f84e565c6ea`。角色：教研、教师、运营、管理员；家庭/学生使用已发布原卷与本人练习。

产品入口：`/library`、`/library/practice`、`/admin/content`、`/admin/imports`、`/admin/measurement`。

## 模块实现

- [apps/api/src/modules/content/content.service.ts](../../../apps/api/src/modules/content/content.service.ts)
- [apps/api/src/modules/question-workspace/question-workspace.service.ts](../../../apps/api/src/modules/question-workspace/question-workspace.service.ts)
- [apps/api/src/modules/question-workspace/question-import.service.ts](../../../apps/api/src/modules/question-workspace/question-import.service.ts)
- [apps/api/src/modules/library/library.service.ts](../../../apps/api/src/modules/library/library.service.ts)
- [apps/api/src/modules/library/library.repository.ts](../../../apps/api/src/modules/library/library.repository.ts)
- [apps/api/src/modules/library/measurement-content.service.ts](../../../apps/api/src/modules/library/measurement-content.service.ts)

## 共享契约

- [packages/contracts/src/index.ts](../../../packages/contracts/src/index.ts)
- [packages/contracts/src/paper-practice.ts](../../../packages/contracts/src/paper-practice.ts)
- [packages/contracts/src/measurement-content.ts](../../../packages/contracts/src/measurement-content.ts)

## 关联验证

以下是对应功能领域的测试入口；测试文件存在不等于每个子场景已由真人或所有设备验证。

- [apps/api/src/modules/library/library.integration.test.ts](../../../apps/api/src/modules/library/library.integration.test.ts)
- [apps/api/src/modules/library/paper-practice.integration.test.ts](../../../apps/api/src/modules/library/paper-practice.integration.test.ts)
- [apps/api/src/modules/library/paper-practice-recovery.integration.test.ts](../../../apps/api/src/modules/library/paper-practice-recovery.integration.test.ts)
- [apps/api/src/infrastructure/paper-practice-migration.test.ts](../../../apps/api/src/infrastructure/paper-practice-migration.test.ts)
- [tests/e2e/paper-practice.spec.ts](../../../tests/e2e/paper-practice.spec.ts)
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

- `ContentService.listTextbooks`；[apps/api/src/modules/content/content.service.ts:58](../../../apps/api/src/modules/content/content.service.ts#L58)。
- `ContentService.getVolumeTree`；[apps/api/src/modules/content/content.service.ts:139](../../../apps/api/src/modules/content/content.service.ts#L139)。
- `ContentService.listKnowledgePoints`；[apps/api/src/modules/content/content.service.ts:172](../../../apps/api/src/modules/content/content.service.ts#L172)。
- `ContentService.listQuestions`；[apps/api/src/modules/content/content.service.ts:239](../../../apps/api/src/modules/content/content.service.ts#L239)。
- `ContentService.importTextbooks`；[apps/api/src/modules/content/content.service.ts:62](../../../apps/api/src/modules/content/content.service.ts#L62)。
- `ContentService.createKnowledgePoint`；[apps/api/src/modules/content/content.service.ts:184](../../../apps/api/src/modules/content/content.service.ts#L184)。
- `ContentService.updateKnowledgePoint`；[apps/api/src/modules/content/content.service.ts:204](../../../apps/api/src/modules/content/content.service.ts#L204)。
- `ContentService.createQuestion`；[apps/api/src/modules/content/content.service.ts:243](../../../apps/api/src/modules/content/content.service.ts#L243)。
- `ContentService.mapQuestionKnowledge`；[apps/api/src/modules/content/content.service.ts:269](../../../apps/api/src/modules/content/content.service.ts#L269)。
- `ContentService.replaceQuestionKnowledge`；[apps/api/src/modules/content/content.service.ts:284](../../../apps/api/src/modules/content/content.service.ts#L284)。

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

- `LibraryService.overview`；[apps/api/src/modules/library/library.service.ts:45](../../../apps/api/src/modules/library/library.service.ts#L45)。
- `LibraryService.facets`；[apps/api/src/modules/library/library.service.ts:53](../../../apps/api/src/modules/library/library.service.ts#L53)。
- `LibraryService.search`；[apps/api/src/modules/library/library.service.ts:54](../../../apps/api/src/modules/library/library.service.ts#L54)。

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

- `LibraryService.preview`；[apps/api/src/modules/library/library.service.ts:79](../../../apps/api/src/modules/library/library.service.ts#L79)。
- `LibraryService.media`；[apps/api/src/modules/library/library.service.ts:99](../../../apps/api/src/modules/library/library.service.ts#L99)。

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

- `LibraryService.publish`；[apps/api/src/modules/library/library.service.ts:106](../../../apps/api/src/modules/library/library.service.ts#L106)。
- `LibraryService.bookmark`；[apps/api/src/modules/library/library.service.ts:125](../../../apps/api/src/modules/library/library.service.ts#L125)。

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

- `ContentService.scaffoldVolumeQuestions`；[apps/api/src/modules/content/content.service.ts:299](../../../apps/api/src/modules/content/content.service.ts#L299)。
- `QuestionCoverageService.getCoverageSummary`；[apps/api/src/modules/content/question-coverage.service.ts:116](../../../apps/api/src/modules/content/question-coverage.service.ts#L116)。
- `QuestionCoverageService.backfillQuestionCoverage`；[apps/api/src/modules/content/question-coverage.service.ts:83](../../../apps/api/src/modules/content/question-coverage.service.ts#L83)。
- `ContentService.publishQuestion`；[apps/api/src/modules/content/content.service.ts:317](../../../apps/api/src/modules/content/content.service.ts#L317)。

## CONTENT-12 原卷整卷/跨卷练习与原答订正复盘

**输入**：原卷/题位/跨卷选择、studentId、预览来源指纹、expectedVersion/requestKey、首答/自评/订正命令。

**处理与实现**：冻结原卷题序、题干/参考与发布版本；首次回答不可覆盖，提交后显式核对当前题的原参考，自评与追加订正分别保留；按版本和完整输入指纹原子保存命令/回执，完成后只读复盘但可明确读已提交题参考。每次重新检查学生授权、来源版本和原媒体；撤回隐藏题面而保留个人文字。独立文档副本、完整原命令恢复、冲突比较及下载保留；预览失效且原回执不存在时先保护原命令再重新预览。

**输出**：真实原卷练习、历史位置、首次回答、核对与订正记录，暂停/完成统计和原卷锚点。

**状态与持久化**：`paperPracticeSessions`、`paperPracticeCommands`、`paperPublications`

**权限、失败与边界**：PDF仍为未切分整卷笔记；原始HTML、自评和订正不自动变成能力分数。最多16卷/500题位/8MiB冻结请求；相机切题、全部资产/导出/教师与设备验收继续；复习和新题见CONTENT-13/14。

**关联接口**：

- `POST /api/library/practice/preview` → `PaperPracticeController.preview`；[apps/api/src/modules/library/paper-practice.controller.ts:12](../../../apps/api/src/modules/library/paper-practice.controller.ts#L12)。
- `POST /api/library/practice/sessions` → `PaperPracticeController.create`；[apps/api/src/modules/library/paper-practice.controller.ts:13](../../../apps/api/src/modules/library/paper-practice.controller.ts#L13)。
- `GET /api/library/practice/requests/:requestKey` → `PaperPracticeController.creationResult`；[apps/api/src/modules/library/paper-practice.controller.ts:14](../../../apps/api/src/modules/library/paper-practice.controller.ts#L14)。
- `GET /api/library/practice/sessions` → `PaperPracticeController.list`；[apps/api/src/modules/library/paper-practice.controller.ts:15](../../../apps/api/src/modules/library/paper-practice.controller.ts#L15)。
- `GET /api/library/practice/sessions/:sessionId` → `PaperPracticeController.get`；[apps/api/src/modules/library/paper-practice.controller.ts:16](../../../apps/api/src/modules/library/paper-practice.controller.ts#L16)。
- `GET /api/library/practice/sessions/:sessionId/items/:itemId` → `PaperPracticeController.item`；[apps/api/src/modules/library/paper-practice.controller.ts:17](../../../apps/api/src/modules/library/paper-practice.controller.ts#L17)。
- `GET /api/library/practice/sessions/:sessionId/commands/:requestKey` → `PaperPracticeController.commandResult`；[apps/api/src/modules/library/paper-practice.controller.ts:21](../../../apps/api/src/modules/library/paper-practice.controller.ts#L21)。
- `POST /api/library/practice/sessions/:sessionId/commands` → `PaperPracticeController.command`；[apps/api/src/modules/library/paper-practice.controller.ts:22](../../../apps/api/src/modules/library/paper-practice.controller.ts#L22)。

**服务方法**：

- `PaperPracticeService.preview`；[apps/api/src/modules/library/paper-practice.service.ts:135](../../../apps/api/src/modules/library/paper-practice.service.ts#L135)。
- `PaperPracticeService.create`；[apps/api/src/modules/library/paper-practice.service.ts:143](../../../apps/api/src/modules/library/paper-practice.service.ts#L143)。
- `PaperPracticeService.creationResult`；[apps/api/src/modules/library/paper-practice.service.ts:157](../../../apps/api/src/modules/library/paper-practice.service.ts#L157)。
- `PaperPracticeService.list`；[apps/api/src/modules/library/paper-practice.service.ts:161](../../../apps/api/src/modules/library/paper-practice.service.ts#L161)。
- `PaperPracticeService.get`；[apps/api/src/modules/library/paper-practice.service.ts:171](../../../apps/api/src/modules/library/paper-practice.service.ts#L171)。
- `PaperPracticeService.item`；[apps/api/src/modules/library/paper-practice.service.ts:254](../../../apps/api/src/modules/library/paper-practice.service.ts#L254)。
- `PaperPracticeService.commandResult`；[apps/api/src/modules/library/paper-practice.service.ts:262](../../../apps/api/src/modules/library/paper-practice.service.ts#L262)。
- `PaperPracticeService.command`；[apps/api/src/modules/library/paper-practice.service.ts:267](../../../apps/api/src/modules/library/paper-practice.service.ts#L267)。

**补充实现文件**：

- [packages/contracts/src/paper-practice.ts](../../../packages/contracts/src/paper-practice.ts)
- [apps/api/src/modules/library/paper-practice-record.ts](../../../apps/api/src/modules/library/paper-practice-record.ts)
- [apps/web/app/library/practice/studio.tsx](../../../apps/web/app/library/practice/studio.tsx)
- [apps/web/app/library/practice/session.tsx](../../../apps/web/app/library/practice/session.tsx)
- [apps/web/components/paper-practice-launcher.tsx](../../../apps/web/components/paper-practice-launcher.tsx)
- [apps/web/lib/paper-practice-local.ts](../../../apps/web/lib/paper-practice-local.ts)
- [apps/web/lib/paper-practice-api.ts](../../../apps/web/lib/paper-practice-api.ts)
- [apps/api/src/modules/library/paper-practice.integration.test.ts](../../../apps/api/src/modules/library/paper-practice.integration.test.ts)
- [apps/api/src/modules/library/paper-practice-recovery.integration.test.ts](../../../apps/api/src/modules/library/paper-practice-recovery.integration.test.ts)
- [apps/api/src/infrastructure/paper-practice-migration.test.ts](../../../apps/api/src/infrastructure/paper-practice-migration.test.ts)
- [tests/e2e/paper-practice.spec.ts](../../../tests/e2e/paper-practice.spec.ts)

## CONTENT-13 原卷复习、完整反思与本人日历

**输入**：本人/学习账号范围、筛选、标签、错误步骤、反思、纯本地日期与原整理命令。

**处理与实现**：在原题位追加可选版本化整理及完整历史；完成或来源撤回仍允许本人整理，不改首答。分页清单只投影有权记录；日历和ICS按原日期只读派生稳定事件，不复制私人反思。编辑器使用独立目的副本、原键恢复、三刷、双页冲突比较和下载保护；课程日历按当前范围/可见日期读取，切范围立即隐藏旧结果并拒绝迟到返回，回看事实仍在原题记录。

**输出**：跨原练习复习清单、完整反思/历史、实际回看与受控日历。

**状态与持久化**：`paperPracticeSessions`、`paperPracticeCommands`

**权限、失败与边界**：监护人只读孩子学习账号记录，私人陪练互不可见；不以回看标记关闭能力原因；1000次/2MiB每题与16MiB会话预算明确拒绝不截断；全量CI/运行及真人边界另记。

**关联接口**：

- `GET /api/library/practice/reviews` → `PaperPracticeController.reviews`；[apps/api/src/modules/library/paper-practice.controller.ts:9](../../../apps/api/src/modules/library/paper-practice.controller.ts#L9)。
- `GET /api/library/practice/reviews/calendar` → `PaperPracticeController.calendar`；[apps/api/src/modules/library/paper-practice.controller.ts:10](../../../apps/api/src/modules/library/paper-practice.controller.ts#L10)。
- `GET /api/library/practice/reviews/calendar/export` → `PaperPracticeController.exportCalendar`；[apps/api/src/modules/library/paper-practice.controller.ts:11](../../../apps/api/src/modules/library/paper-practice.controller.ts#L11)。

**服务方法**：

- `PaperPracticeService.reviews`；[apps/api/src/modules/library/paper-practice.service.ts:224](../../../apps/api/src/modules/library/paper-practice.service.ts#L224)。
- `PaperPracticeService.reviewCalendar`；[apps/api/src/modules/library/paper-practice.service.ts:239](../../../apps/api/src/modules/library/paper-practice.service.ts#L239)。
- `PaperPracticeService.exportReviewCalendar`；[apps/api/src/modules/library/paper-practice.service.ts:248](../../../apps/api/src/modules/library/paper-practice.service.ts#L248)。

**补充实现文件**：

- [packages/contracts/src/paper-review.ts](../../../packages/contracts/src/paper-review.ts)
- [apps/api/src/modules/library/paper-review-organization.ts](../../../apps/api/src/modules/library/paper-review-organization.ts)
- [apps/api/src/modules/library/paper-review-query.ts](../../../apps/api/src/modules/library/paper-review-query.ts)
- [apps/web/components/paper-review-editor.tsx](../../../apps/web/components/paper-review-editor.tsx)
- [apps/web/app/library/practice/review/studio.tsx](../../../apps/web/app/library/practice/review/studio.tsx)
- [apps/web/app/studio/paper-review-calendar.tsx](../../../apps/web/app/studio/paper-review-calendar.tsx)
- [apps/web/lib/paper-review-navigation.ts](../../../apps/web/lib/paper-review-navigation.ts)
- [apps/web/app/studio/calendar-board.tsx](../../../apps/web/app/studio/calendar-board.tsx)
- [tests/e2e/paper-practice.spec.ts](../../../tests/e2e/paper-practice.spec.ts)

## CONTENT-14 来源绑定的再练与独立新题验证

**输入**：原练习/题位、同源再练选择、当前孩子/已学范围/原子目标、原请求键。

**处理与实现**：同一来源/版本/题位创建新的原题再练，不改旧首答；从有权新记录反向派生后续行为。五门审核/来源完整摘要/知识定义指纹与正式测量资格核对后才建议知识点，显式确认范围并预览独立新题；原请求全域唯一且绑定来源和目标，实际开始沿用原蓝图确认。孩子原卷接触保守关联正式题曝光，家长私人陪练不投射孩子。关联来源按原私人权限过滤共享评测/导出，最新删除账本清理失去来源的关系。

**输出**：新的来源明确原题尝试、可恢复原蓝图和有权正式报告返回入口。

**状态与持久化**：`paperPracticeSessions`、`diagnosticBlueprints`、`diagnosticSessions`、`measurementCandidates`

**权限、失败与边界**：无审核映射提供手动选择入口，不用模型猜测；原题重复不增加独立证据。预览读取不开始作答；完整题族、教师和真实保持仍待验证。

**关联接口**：

- `GET /api/library/practice/sessions/:sessionId/items/:itemId/next-options` → `PaperPracticeController.nextOptions`；[apps/api/src/modules/library/paper-practice.controller.ts:18](../../../apps/api/src/modules/library/paper-practice.controller.ts#L18)。
- `POST /api/library/practice/sessions/:sessionId/items/:itemId/verification-preview` → `PaperPracticeController.verificationPreview`；[apps/api/src/modules/library/paper-practice.controller.ts:19](../../../apps/api/src/modules/library/paper-practice.controller.ts#L19)。
- `GET /api/library/practice/sessions/:sessionId/items/:itemId/verification-requests/:requestKey` → `PaperPracticeController.verificationRequest`；[apps/api/src/modules/library/paper-practice.controller.ts:20](../../../apps/api/src/modules/library/paper-practice.controller.ts#L20)。

**服务方法**：

- `PaperPracticeService.nextOptions`；[apps/api/src/modules/library/paper-practice.service.ts:172](../../../apps/api/src/modules/library/paper-practice.service.ts#L172)。
- `PaperPracticeService.verificationPreview`；[apps/api/src/modules/library/paper-practice.service.ts:193](../../../apps/api/src/modules/library/paper-practice.service.ts#L193)。
- `PaperPracticeService.verificationRequest`；[apps/api/src/modules/library/paper-practice.service.ts:210](../../../apps/api/src/modules/library/paper-practice.service.ts#L210)。

**补充实现文件**：

- [apps/api/src/modules/library/paper-review-eligibility.ts](../../../apps/api/src/modules/library/paper-review-eligibility.ts)
- [apps/api/src/modules/diagnostics/paper-exposure.ts](../../../apps/api/src/modules/diagnostics/paper-exposure.ts)
- [apps/api/src/modules/diagnostics/diagnostics.service.ts](../../../apps/api/src/modules/diagnostics/diagnostics.service.ts)
- [apps/api/src/modules/privacy/privacy-records.ts](../../../apps/api/src/modules/privacy/privacy-records.ts)
- [apps/web/components/paper-review-next-steps.tsx](../../../apps/web/components/paper-review-next-steps.tsx)
- [packages/contracts/src/diagnostics.ts](../../../packages/contracts/src/diagnostics.ts)
- [apps/api/src/modules/library/measurement-content.integration.test.ts](../../../apps/api/src/modules/library/measurement-content.integration.test.ts)
- [apps/api/src/modules/library/paper-practice-recovery.integration.test.ts](../../../apps/api/src/modules/library/paper-practice-recovery.integration.test.ts)

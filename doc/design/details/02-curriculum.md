# 02 知识、教材、范围与课程版本 — 详细设计

源码基线：`54a1b173df739c87092a7cae5d79fa587489f1fb`。角色：家长、学生、教研、管理员。

产品入口：`/admin/curriculum`、`/parent/dashboard`、`/student/assessment`。

## 模块实现

- [apps/api/src/modules/diagnostics/curriculum.service.ts](../../../apps/api/src/modules/diagnostics/curriculum.service.ts)
- [apps/api/src/modules/diagnostics/textbook-registry.service.ts](../../../apps/api/src/modules/diagnostics/textbook-registry.service.ts)
- [apps/api/src/modules/diagnostics/curriculum-package.service.ts](../../../apps/api/src/modules/diagnostics/curriculum-package.service.ts)
- [apps/api/src/modules/diagnostics/foundation-seed.service.ts](../../../apps/api/src/modules/diagnostics/foundation-seed.service.ts)

## 共享契约

- [packages/contracts/src/diagnostics.ts](../../../packages/contracts/src/diagnostics.ts)
- [packages/contracts/src/curriculum.ts](../../../packages/contracts/src/curriculum.ts)

## 关联验证

以下是对应功能领域的测试入口；测试文件存在不等于每个子场景已由真人或所有设备验证。

- [apps/api/src/modules/diagnostics/curriculum-package.integration.test.ts](../../../apps/api/src/modules/diagnostics/curriculum-package.integration.test.ts)
- [apps/api/src/modules/diagnostics/diagnostics.integration.test.ts](../../../apps/api/src/modules/diagnostics/diagnostics.integration.test.ts)
- [apps/api/src/modules/diagnostics/textbook-registry-document.test.ts](../../../apps/api/src/modules/diagnostics/textbook-registry-document.test.ts)

## CUR-01 原子知识定义与先修图

**输入**：学科、年级、行为目标、达标标准、先修/父子/易混/迁移关系。

**处理与实现**：通过Zod校验定义；校验引用与先修图；维护版本和修订历史；按学科和年级返回已发布点。

**输出**：知识图与版本化KnowledgeAtom。

**状态与持久化**：`knowledgeAtoms`、`curriculumRevisions`

**权限、失败与边界**：一个大题分数不能直接复制成所有子知识点的掌握度。

**关联接口**：

- `GET /api/diagnostics/curriculum` → `DiagnosticsController.curriculumList`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:28](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L28)。
- `POST /api/admin/knowledge-atoms` → `DiagnosticsController.saveAtom`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:90](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L90)。

**服务方法**：

- `CurriculumService.list`；[apps/api/src/modules/diagnostics/curriculum.service.ts:66](../../../apps/api/src/modules/diagnostics/curriculum.service.ts#L66)。
- `CurriculumService.upsertAtom`；[apps/api/src/modules/diagnostics/curriculum.service.ts:75](../../../apps/api/src/modules/diagnostics/curriculum.service.ts#L75)。

## CUR-02 已审核教学卡与受限图形

**输入**：解释、例题步骤、常见错误、验证标准、可选分数图。

**处理与实现**：教学定义内置draft/approved；计划与课堂只使用批准教学；分数图校验整体、分母和运算关系，由固定组件渲染。

**输出**：可冻结的教学卡、例子、验证行为。

**状态与持久化**：`knowledgeAtoms`

**权限、失败与边界**：图形是受控TeachingVisual协议，不执行模型返回的任意HTML或脚本。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

**补充实现文件**：

- [apps/api/src/modules/diagnostics/teaching-author.ts](../../../apps/api/src/modules/diagnostics/teaching-author.ts)
- [apps/web/components/teaching-guide.tsx](../../../apps/web/components/teaching-guide.tsx)

## CUR-03 测量题目映射与原子分项绑定

**输入**：questionId/version、主测点、维度、题族、角色、权重、观察编码。

**处理与实现**：冻结知识定义与题面指纹；校验题目、来源和作答协议；分项绑定指定scoreKeys/requiresKeys；编辑后必须重新满足审核资格。

**输出**：已审核映射及原子观察依据。

**状态与持久化**：`measurementItems`、`knowledgeAtoms`、`questions`、`questionSources`

**权限、失败与边界**：映射、题面或知识定义变化会使旧映射退出新选题。

**关联接口**：

- `POST /api/admin/measurement-items` → `DiagnosticsController.saveMapping`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:92](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L92)。

**服务方法**：

- `CurriculumService.upsertMapping`；[apps/api/src/modules/diagnostics/curriculum.service.ts:209](../../../apps/api/src/modules/diagnostics/curriculum.service.ts#L209)。

## CUR-04 按教材或知识点确认学习范围

**输入**：学生、学科、年级、学期、教材、已学点/已学课时、时长。

**处理与实现**：家长确认学习范围；教材模式解析批准课时映射；保存版本、教材修订、课时及映射快照；保留未覆盖课时。

**输出**：版本化LearningScope。

**状态与持久化**：`learningScopes`、`knowledgeAtoms`、`textbookAtomMappings`

**权限、失败与边界**：不能把同年级默认成同进度，也不能用未审核映射自动补全范围。

**关联接口**：

- `GET /api/students/:studentId/learning-scope` → `DiagnosticsController.scope`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:94](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L94)。
- `PUT /api/students/:studentId/learning-scope` → `DiagnosticsController.saveScope`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:98](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L98)。

**服务方法**：

- `CurriculumService.getScope`；[apps/api/src/modules/diagnostics/curriculum.service.ts:108](../../../apps/api/src/modules/diagnostics/curriculum.service.ts#L108)。
- `CurriculumService.saveScope`；[apps/api/src/modules/diagnostics/curriculum.service.ts:137](../../../apps/api/src/modules/diagnostics/curriculum.service.ts#L137)。

## CUR-05 学生进度提议与家长确认

**输入**：学生提出的新范围、当前版本、家长决定。

**处理与实现**：学生提交进度候选；保存待处理提议；监护人审阅后确认或拒绝；通过时按范围服务写入新版本。

**输出**：提议状态与确认后的范围。

**状态与持久化**：`studentProgressProposals`、`learningScopes`

**权限、失败与边界**：学生提议不直接替换监护人确认的范围。

**关联接口**：

- `GET /api/students/:studentId/progress-proposals` → `DiagnosticsController.progressProposals`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:102](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L102)。
- `POST /api/students/:studentId/progress-proposals` → `DiagnosticsController.proposeProgress`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:104](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L104)。
- `POST /api/students/:studentId/progress-proposals/:proposalId/decision` → `DiagnosticsController.decideProgress`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:106](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L106)。

**服务方法**：

- `CurriculumService.progressProposals`；[apps/api/src/modules/diagnostics/curriculum.service.ts:150](../../../apps/api/src/modules/diagnostics/curriculum.service.ts#L150)。
- `CurriculumService.proposeScope`；[apps/api/src/modules/diagnostics/curriculum.service.ts:156](../../../apps/api/src/modules/diagnostics/curriculum.service.ts#L156)。
- `CurriculumService.decideProgress`；[apps/api/src/modules/diagnostics/curriculum.service.ts:176](../../../apps/api/src/modules/diagnostics/curriculum.service.ts#L176)。

## CUR-06 教材登记、章节与受控原文阅读

**输入**：教材版本、册次、章节与文件来源。

**处理与实现**：从版本化JSON登记加载教材；区分目录、完整原文和映射；按安全来源绑定与哈希读取完整PDF，教研入口受身份限制。

**输出**：教材树、来源可用性、原文文件。

**状态与持久化**：`textbookAtomMappings`

**权限、失败与边界**：448条登记不等于448册完整原文；来源不唯一、年份冲突或无证据时明确说明。

**关联接口**：

- `GET /api/diagnostics/textbooks` → `DiagnosticsController.textbooks`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:32](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L32)。
- `GET /api/diagnostics/textbooks/:bookId` → `DiagnosticsController.textbook`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:37](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L37)。
- `GET /api/admin/curriculum/textbooks/:bookId` → `DiagnosticsController.textbookForEditor`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:47](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L47)。
- `GET /api/admin/curriculum/textbooks/:bookId/document` → `DiagnosticsController.textbookDocument`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:51](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L51)。
- `GET /api/admin/curriculum/textbooks/:bookId/lessons/:lessonId/source` → `DiagnosticsController.textbookLessonSource`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:63](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L63)。
- `GET /api/admin/curriculum/textbooks/:bookId/reference-sources/:sourceId/document` → `DiagnosticsController.textbookReferenceDocument`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:74](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L74)。

**服务方法**：

- `TextbookRegistryService.list`；[apps/api/src/modules/diagnostics/textbook-registry.service.ts:82](../../../apps/api/src/modules/diagnostics/textbook-registry.service.ts#L82)。
- `TextbookRegistryService.detail`；[apps/api/src/modules/diagnostics/textbook-registry.service.ts:97](../../../apps/api/src/modules/diagnostics/textbook-registry.service.ts#L97)。
- `CurriculumService.assertEditor`；[apps/api/src/modules/diagnostics/curriculum.service.ts:403](../../../apps/api/src/modules/diagnostics/curriculum.service.ts#L403)。
- `TextbookRegistryService.document`；[apps/api/src/modules/diagnostics/textbook-registry.service.ts:126](../../../apps/api/src/modules/diagnostics/textbook-registry.service.ts#L126)。
- `CurriculumService.assertCurrentSourceEditor`；[apps/api/src/modules/diagnostics/curriculum.service.ts:406](../../../apps/api/src/modules/diagnostics/curriculum.service.ts#L406)。
- `TextbookRegistryService.lessonSource`；[apps/api/src/modules/diagnostics/textbook-registry.service.ts:163](../../../apps/api/src/modules/diagnostics/textbook-registry.service.ts#L163)。
- `TextbookRegistryService.referenceDocument`；[apps/api/src/modules/diagnostics/textbook-registry.service.ts:135](../../../apps/api/src/modules/diagnostics/textbook-registry.service.ts#L135)。

## CUR-07 教材课时知识映射审核

**输入**：课时、候选知识点、来源页证据、审核命令。

**处理与实现**：列出跨教材待审课时；显示来源与候选；人工保存版本化映射；范围确认只使用批准映射并保留历史。

**输出**：审核工作清单和课时映射。

**状态与持久化**：`textbookAtomMappings`、`curriculumRevisions`

**权限、失败与边界**：自动候选不是已批准教材覆盖；无页证据不伪造页码。

**关联接口**：

- `POST /api/admin/curriculum/textbook-mappings` → `DiagnosticsController.saveTextbookMapping`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:86](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L86)。
- `GET /api/admin/curriculum/textbook-mapping-worklist` → `DiagnosticsController.textbookMappingWorklist`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:88](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L88)。

**服务方法**：

- `CurriculumService.saveTextbookMapping`；[apps/api/src/modules/diagnostics/curriculum.service.ts:241](../../../apps/api/src/modules/diagnostics/curriculum.service.ts#L241)。
- `CurriculumService.textbookMappingWorklist`；[apps/api/src/modules/diagnostics/curriculum.service.ts:263](../../../apps/api/src/modules/diagnostics/curriculum.service.ts#L263)。

## CUR-08 课程包导出、比较与整批导入

**输入**：课程包、预览指纹、确认命令。

**处理与实现**：导出定义；预览新增/修改/冲突及图关系；应用时重新核对预览并整批提交；已编辑定义与历史快照不被种子静默覆盖。

**输出**：差异清单、版本化导入结果。

**状态与持久化**：`knowledgeAtoms`、`measurementItems`、`curriculumRevisions`

**权限、失败与边界**：8MiB/2000点限制；导入不是重置学生历史。

**关联接口**：

- `GET /api/admin/curriculum/package` → `DiagnosticsController.exportPackage`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:21](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L21)。
- `POST /api/admin/curriculum/packages/preview` → `DiagnosticsController.previewPackage`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:23](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L23)。
- `POST /api/admin/curriculum/packages/apply` → `DiagnosticsController.applyPackage`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:25](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L25)。

**服务方法**：

- `CurriculumPackageService.export`；[apps/api/src/modules/diagnostics/curriculum-package.service.ts:31](../../../apps/api/src/modules/diagnostics/curriculum-package.service.ts#L31)。
- `CurriculumPackageService.preview`；[apps/api/src/modules/diagnostics/curriculum-package.service.ts:40](../../../apps/api/src/modules/diagnostics/curriculum-package.service.ts#L40)。
- `CurriculumPackageService.apply`；[apps/api/src/modules/diagnostics/curriculum-package.service.ts:46](../../../apps/api/src/modules/diagnostics/curriculum-package.service.ts#L46)。

## CUR-09 素材结构与组题预算覆盖核对

**输入**：学科、年级、知识点、有效审核条件。

**处理与实现**：按当前有效来源、题面与定义筛选素材；归并独立题族；分别检查理解/操作/迁移结构和真实题量时间预算。

**输出**：齐备/待补清单和逐点题目。

**状态与持久化**：`knowledgeAtoms`、`measurementItems`、`questions`、`questionSources`

**权限、失败与边界**：齐备只指当前结构门槛，不代表真实学生测量效度或全教材教学覆盖。

**关联接口**：

- `GET /api/admin/curriculum/overview` → `DiagnosticsController.coverage`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:39](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L39)。
- `GET /api/admin/curriculum/atoms/:atomId/items` → `DiagnosticsController.atomItems`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:43](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L43)。

**服务方法**：

- `CurriculumService.overview`；[apps/api/src/modules/diagnostics/curriculum.service.ts:321](../../../apps/api/src/modules/diagnostics/curriculum.service.ts#L321)。
- `CurriculumService.itemsForAtom`；[apps/api/src/modules/diagnostics/curriculum.service.ts:371](../../../apps/api/src/modules/diagnostics/curriculum.service.ts#L371)。

**补充实现文件**：

- [apps/api/src/modules/diagnostics/verification-materials.ts](../../../apps/api/src/modules/diagnostics/verification-materials.ts)

## CUR-10 定义历史与旧证据隔离

**输入**：实体ID与定义版本/指纹。

**处理与实现**：保留历史修订；评测、计划冻结定义；当前画像只汇入定义可比证据；旧报告重算不伪装成学习改善。

**输出**：可追溯定义与兼容性说明。

**状态与持久化**：`curriculumRevisions`、`diagnosticSessions`、`diagnosticReports`

**权限、失败与边界**：目标、标准或先修改变后需要重新审核映射与测量。

**关联接口**：

- `GET /api/admin/curriculum/revisions/:entityId` → `DiagnosticsController.revisions`；[apps/api/src/modules/diagnostics/diagnostics.controller.ts:45](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L45)。

**服务方法**：

- `CurriculumService.revisions`；[apps/api/src/modules/diagnostics/curriculum.service.ts:393](../../../apps/api/src/modules/diagnostics/curriculum.service.ts#L393)。

**补充实现文件**：

- [apps/api/src/modules/diagnostics/measurement-definition.ts](../../../apps/api/src/modules/diagnostics/measurement-definition.ts)
- [apps/api/src/modules/diagnostics/family-identity.ts](../../../apps/api/src/modules/diagnostics/family-identity.ts)

## CUR-11 完整教学稿编辑、逐项材料与明确发布采用

**输入**：准确教材版本和页段、目标定义、完整稿件、材料映射、原请求键及预期版本。

**处理与实现**：原教材工作台读取准确原页；完整讲解、例题、图示、检查与保持逐项编辑和阅读预览。本机完整副本和原请求回执可恢复，来源或目标变化重新核对；明确审核发布与私人采用分别执行，旧课堂保留原快照。

**输出**：来源预览、逐项目标及材料缺口、稿件版本、原命令和采用回执。

**状态与持久化**：`textbookTeachingPackages`、`textbookTeachingVersions`、`textbookTeachingSources`、`textbookTeachingCommands`、`textbookTeachingAdoptions`、`textbookTeachingCourseRevisions`

**权限、失败与边界**：候选与可保存草稿不等完整可发布；未审材料、题族、评分和充分未见库存仍阻断相应资格，内容生产当前按用户要求暂停。

**关联接口**：

- `POST /api/admin/curriculum/teaching-packages/source-preview` → `TextbookTeachingController.source`；[apps/api/src/modules/diagnostics/textbook-teaching.controller.ts:15](../../../apps/api/src/modules/diagnostics/textbook-teaching.controller.ts#L15)。
- `POST /api/admin/curriculum/teaching-packages/preflight` → `TextbookTeachingController.preflight`；[apps/api/src/modules/diagnostics/textbook-teaching.controller.ts:19](../../../apps/api/src/modules/diagnostics/textbook-teaching.controller.ts#L19)。
- `POST /api/admin/curriculum/teaching-packages/commands` → `TextbookTeachingController.command`；[apps/api/src/modules/diagnostics/textbook-teaching.controller.ts:23](../../../apps/api/src/modules/diagnostics/textbook-teaching.controller.ts#L23)。
- `GET /api/admin/curriculum/teaching-packages/commands/:key` → `TextbookTeachingController.result`；[apps/api/src/modules/diagnostics/textbook-teaching.controller.ts:27](../../../apps/api/src/modules/diagnostics/textbook-teaching.controller.ts#L27)。
- `GET /api/admin/curriculum/teaching-packages/materials` → `TextbookTeachingController.materials`；[apps/api/src/modules/diagnostics/textbook-teaching.controller.ts:31](../../../apps/api/src/modules/diagnostics/textbook-teaching.controller.ts#L31)。
- `GET /api/admin/curriculum/teaching-packages` → `TextbookTeachingController.list`；[apps/api/src/modules/diagnostics/textbook-teaching.controller.ts:35](../../../apps/api/src/modules/diagnostics/textbook-teaching.controller.ts#L35)。
- `GET /api/admin/curriculum/teaching-packages/:id` → `TextbookTeachingController.get`；[apps/api/src/modules/diagnostics/textbook-teaching.controller.ts:39](../../../apps/api/src/modules/diagnostics/textbook-teaching.controller.ts#L39)。

**服务方法**：

- `TextbookTeachingController.cancellable`；[apps/api/src/modules/diagnostics/textbook-teaching.controller.ts:10](../../../apps/api/src/modules/diagnostics/textbook-teaching.controller.ts#L10)。
- `TextbookTeachingService.sourcePreview`；[apps/api/src/modules/diagnostics/textbook-teaching.service.ts:44](../../../apps/api/src/modules/diagnostics/textbook-teaching.service.ts#L44)。
- `TextbookTeachingService.preflight`；[apps/api/src/modules/diagnostics/textbook-teaching.service.ts:49](../../../apps/api/src/modules/diagnostics/textbook-teaching.service.ts#L49)。
- `TextbookTeachingService.command`；[apps/api/src/modules/diagnostics/textbook-teaching.service.ts:94](../../../apps/api/src/modules/diagnostics/textbook-teaching.service.ts#L94)。
- `TextbookTeachingService.commandResult`；[apps/api/src/modules/diagnostics/textbook-teaching.service.ts:89](../../../apps/api/src/modules/diagnostics/textbook-teaching.service.ts#L89)。
- `TextbookTeachingService.materials`；[apps/api/src/modules/diagnostics/textbook-teaching.service.ts:54](../../../apps/api/src/modules/diagnostics/textbook-teaching.service.ts#L54)。
- `TextbookTeachingService.list`；[apps/api/src/modules/diagnostics/textbook-teaching.service.ts:69](../../../apps/api/src/modules/diagnostics/textbook-teaching.service.ts#L69)。
- `TextbookTeachingService.get`；[apps/api/src/modules/diagnostics/textbook-teaching.service.ts:77](../../../apps/api/src/modules/diagnostics/textbook-teaching.service.ts#L77)。

**补充实现文件**：

- [apps/web/app/admin/curriculum/teaching-package-workspace.tsx](../../../apps/web/app/admin/curriculum/teaching-package-workspace.tsx)
- [doc/product/192-textbook-followups-gesp-teaching-and-first-response-evidence.md](../../../doc/product/192-textbook-followups-gesp-teaching-and-first-response-evidence.md)

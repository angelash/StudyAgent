# 14 持久化、后台处理、监控、部署与质量 — 详细设计

源码基线：`2c49e8422d03239b33caa37af516b4e7ab2fccf3`。角色：运维、管理员、教研。

产品入口：`/admin/imports`、`/admin/analytics`。

## 模块实现

- [apps/api/src/infrastructure/in-memory-store.service.ts](../../../apps/api/src/infrastructure/in-memory-store.service.ts)
- [apps/api/src/infrastructure/domain-database.ts](../../../apps/api/src/infrastructure/domain-database.ts)
- [apps/api/src/infrastructure/task-repository.ts](../../../apps/api/src/infrastructure/task-repository.ts)
- [apps/api/src/infrastructure/domain-event-bus.service.ts](../../../apps/api/src/infrastructure/domain-event-bus.service.ts)
- [apps/api/src/modules/processing/processing-worker.service.ts](../../../apps/api/src/modules/processing/processing-worker.service.ts)
- [scripts/operations/start-daemon.ps1](../../../scripts/operations/start-daemon.ps1)
- [.github/workflows/verify.yml](../../../.github/workflows/verify.yml)

## 共享契约

- [packages/contracts/src/processing.ts](../../../packages/contracts/src/processing.ts)
- [packages/contracts/src/index.ts](../../../packages/contracts/src/index.ts)

## 关联验证

以下是对应功能领域的测试入口；测试文件存在不等于每个子场景已由真人或所有设备验证。

- [apps/api/src/infrastructure/domain-database.test.ts](../../../apps/api/src/infrastructure/domain-database.test.ts)
- [apps/api/src/infrastructure/scoped-transactions.test.ts](../../../apps/api/src/infrastructure/scoped-transactions.test.ts)
- [apps/api/src/infrastructure/task-repository.test.ts](../../../apps/api/src/infrastructure/task-repository.test.ts)
- [apps/api/src/modules/processing/processing.integration.test.ts](../../../apps/api/src/modules/processing/processing.integration.test.ts)
- [apps/api/src/infrastructure/operations.integration.test.ts](../../../apps/api/src/infrastructure/operations.integration.test.ts)

## OPS-01 请求身份、限流、请求ID与错误响应

**输入**：HTTP请求、Cookie/Bearer、代理来源、身份。

**处理与实现**：请求上下文分配ID；全局IP和业务主体额度由持久计数实现；Guard和服务层授权；统一data/error/meta封装与异常转换。

**输出**：可追踪响应、401/403/409/429等。

**状态与持久化**：`sessions`

**权限、失败与边界**：默认IP每分钟3000；Retry-After用于超限；只信任配置的反向代理。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

**补充实现文件**：

- [apps/api/src/infrastructure/request-rate.middleware.ts](../../../apps/api/src/infrastructure/request-rate.middleware.ts)
- [apps/api/src/common/auth.guard.ts](../../../apps/api/src/common/auth.guard.ts)
- [apps/api/src/common/api-response.interceptor.ts](../../../apps/api/src/common/api-response.interceptor.ts)

## OPS-02 领域文档事务与SQLite/PostgreSQL

**输入**：领域集合读取、追加、修改、删除及依赖。

**处理与实现**：AsyncLocalStorage隔离请求；按select/find登记行和成员集合依赖；响应成功前提交差异；SQLite或PG用唯一约束与版本比较；冲突返回409。

**输出**：重启可恢复、并发可检测的业务状态。

**状态与持久化**：复用调用者上下文、独立索引、SQL任务表或文件资产；不另造业务集合。

**权限、失败与边界**：InMemoryStoreService是兼容注入名；正式运行不是纯内存；Prisma目录不参与运行。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

## OPS-03 持久任务、租约、栅栏与事件记录

**输入**：taskId、处理类型、幂等键、取消/重试命令。

**处理与实现**：业务事务同时登记任务意图与事件；worker领取租约并定期续约；提交以token/fence拒绝过期worker；保留任务历史、进度、失败和重试。

**输出**：可恢复任务和审计事件。

**状态与持久化**：`events`

**权限、失败与边界**：事件是领域库内持久记录，不是已接入Kafka等外部消息系统。

**关联接口**：

- `GET /api/admin/processing/tasks` → `ProcessingController.list`；[apps/api/src/modules/processing/processing.controller.ts:41](../../../apps/api/src/modules/processing/processing.controller.ts#L41)。
- `GET /api/admin/processing/tasks/:id` → `ProcessingController.get`；[apps/api/src/modules/processing/processing.controller.ts:47](../../../apps/api/src/modules/processing/processing.controller.ts#L47)。
- `GET /api/admin/processing/tasks/:id/history` → `ProcessingController.history`；[apps/api/src/modules/processing/processing.controller.ts:48](../../../apps/api/src/modules/processing/processing.controller.ts#L48)。
- `POST /api/admin/processing/tasks/:id/cancel` → `ProcessingController.cancel`；[apps/api/src/modules/processing/processing.controller.ts:49](../../../apps/api/src/modules/processing/processing.controller.ts#L49)。
- `POST /api/admin/processing/tasks/:id/retry` → `ProcessingController.retry`；[apps/api/src/modules/processing/processing.controller.ts:58](../../../apps/api/src/modules/processing/processing.controller.ts#L58)。

**服务方法**：

- `ProcessingController.requireTask`；[apps/api/src/modules/processing/processing.controller.ts:82](../../../apps/api/src/modules/processing/processing.controller.ts#L82)。
- `InMemoryStoreService.controlTask`；[apps/api/src/infrastructure/in-memory-store.service.ts:334](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L334)。
- `DomainEventBusService.publish`；[apps/api/src/infrastructure/domain-event-bus.service.ts:10](../../../apps/api/src/infrastructure/domain-event-bus.service.ts#L10)。
- `InMemoryStoreService.find`；[apps/api/src/infrastructure/in-memory-store.service.ts:232](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L232)。

## OPS-04 导入文件分块与处理产物

**输入**：文件类型、大小、4MiB分块、完成命令。

**处理与实现**：受控目录保存分块；校验大小与哈希；完成后登记可处理文件；产物按任务、文件与页证据关联并授权读取。

**输出**：持久文件元数据、页面图和处理产物。

**状态与持久化**：`importFiles`、`processingArtifacts`、`importPages`

**权限、失败与边界**：不接受任意服务端路径，产物访问不直接暴露磁盘根目录。

**关联接口**：

- `GET /api/admin/import-files` → `ImportFilesController.list`；[apps/api/src/modules/processing/processing.controller.ts:22](../../../apps/api/src/modules/processing/processing.controller.ts#L22)。
- `POST /api/admin/import-files` → `ImportFilesController.start`；[apps/api/src/modules/processing/processing.controller.ts:23](../../../apps/api/src/modules/processing/processing.controller.ts#L23)。
- `GET /api/admin/import-files/:id` → `ImportFilesController.get`；[apps/api/src/modules/processing/processing.controller.ts:24](../../../apps/api/src/modules/processing/processing.controller.ts#L24)。
- `PUT /api/admin/import-files/:id/chunks/:index` → `ImportFilesController.chunk`；[apps/api/src/modules/processing/processing.controller.ts:25](../../../apps/api/src/modules/processing/processing.controller.ts#L25)。
- `POST /api/admin/import-files/:id/complete` → `ImportFilesController.complete`；[apps/api/src/modules/processing/processing.controller.ts:28](../../../apps/api/src/modules/processing/processing.controller.ts#L28)。
- `GET /api/admin/import-files/:id/content` → `ImportFilesController.content`；[apps/api/src/modules/processing/processing.controller.ts:29](../../../apps/api/src/modules/processing/processing.controller.ts#L29)。
- `GET /api/admin/processing/artifacts/:id` → `ImportFilesController.artifact`；[apps/api/src/modules/processing/processing.controller.ts:32](../../../apps/api/src/modules/processing/processing.controller.ts#L32)。

**服务方法**：

- `ImportFilesService.list`；[apps/api/src/modules/processing/import-files.service.ts:24](../../../apps/api/src/modules/processing/import-files.service.ts#L24)。
- `ImportFilesService.start`；[apps/api/src/modules/processing/import-files.service.ts:28](../../../apps/api/src/modules/processing/import-files.service.ts#L28)。
- `ImportFilesService.get`；[apps/api/src/modules/processing/import-files.service.ts:25](../../../apps/api/src/modules/processing/import-files.service.ts#L25)。
- `ImportFilesService.chunk`；[apps/api/src/modules/processing/import-files.service.ts:46](../../../apps/api/src/modules/processing/import-files.service.ts#L46)。
- `ImportFilesService.complete`；[apps/api/src/modules/processing/import-files.service.ts:60](../../../apps/api/src/modules/processing/import-files.service.ts#L60)。
- `ImportFilesService.readyPath`；[apps/api/src/modules/processing/import-files.service.ts:84](../../../apps/api/src/modules/processing/import-files.service.ts#L84)。
- `ImportFilesService.artifact`；[apps/api/src/modules/processing/import-files.service.ts:105](../../../apps/api/src/modules/processing/import-files.service.ts#L105)。

## OPS-05 PDF/OCR、手写与本地解释后台任务

**输入**：上传文件/候选、处理命令与依赖能力。

**处理与实现**：ProcessingWorker按类型调用Python和本地工具；保存逐页结果、警告与产物；失败可重试或取消；可拆为独立worker进程。

**输出**：OCR/切题候选、预览或解释产物。

**状态与持久化**：`importFiles`、`processingArtifacts`、`questionImportRecords`、`studioSourceMaterials`

**权限、失败与边界**：部分能力依赖模型和本机工具；产物生成不自动发布学生内容。

**关联接口**：

- `POST /api/admin/processing/handwriting-preview` → `ProcessingController.handwriting`；[apps/api/src/modules/processing/processing.controller.ts:69](../../../apps/api/src/modules/processing/processing.controller.ts#L69)。
- `POST /api/admin/processing/local-explain` → `ProcessingController.explain`；[apps/api/src/modules/processing/processing.controller.ts:75](../../../apps/api/src/modules/processing/processing.controller.ts#L75)。

**服务方法**：

- `ImportFilesService.get`；[apps/api/src/modules/processing/import-files.service.ts:25](../../../apps/api/src/modules/processing/import-files.service.ts#L25)。
- `ProcessingController.enqueue`；[apps/api/src/modules/processing/processing.controller.ts:83](../../../apps/api/src/modules/processing/processing.controller.ts#L83)。
- `InMemoryStoreService.find`；[apps/api/src/infrastructure/in-memory-store.service.ts:232](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L232)。

## OPS-06 健康、运行指标与质量看板

**输入**：管理员身份与进程/存储/任务状态。

**处理与实现**：health仅检查存活；ready验证存储请求；运行看板汇总请求、错误、延迟、任务、复核与AI质量；区分进程计数和持久库计数。

**输出**：健康探针、积压与运行摘要。

**状态与持久化**：复用调用者上下文、独立索引、SQL任务表或文件资产；不另造业务集合。

**权限、失败与边界**：请求指标是当前进程自启动累计，不是完整分布式监控平台。

**关联接口**：

- `GET /api/health` → `HealthController.health`；[apps/api/src/infrastructure/health.controller.ts:7](../../../apps/api/src/infrastructure/health.controller.ts#L7)。
- `GET /api/ready` → `HealthController.ready`；[apps/api/src/infrastructure/health.controller.ts:8](../../../apps/api/src/infrastructure/health.controller.ts#L8)。
- `GET /api/admin/operations` → `OperationsController.overview`；[apps/api/src/infrastructure/operations.controller.ts:14](../../../apps/api/src/infrastructure/operations.controller.ts#L14)。
- `GET /api/admin/analytics/overview` → `ProgressController.getAnalyticsOverview`；[apps/api/src/modules/progress/progress.controller.ts:55](../../../apps/api/src/modules/progress/progress.controller.ts#L55)。
- `GET /api/admin/analytics/ai-quality` → `ProgressController.getAiQualityOverview`；[apps/api/src/modules/progress/progress.controller.ts:60](../../../apps/api/src/modules/progress/progress.controller.ts#L60)。

**服务方法**：

- `InMemoryStoreService.select`；[apps/api/src/infrastructure/in-memory-store.service.ts:216](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L216)。
- `RuntimeMetricsService.snapshot`；[apps/api/src/infrastructure/runtime-metrics.service.ts:27](../../../apps/api/src/infrastructure/runtime-metrics.service.ts#L27)。
- `ProgressService.getAnalyticsOverview`；[apps/api/src/modules/progress/progress.service.ts:285](../../../apps/api/src/modules/progress/progress.service.ts#L285)。
- `ProgressService.getAiQualityOverview`；[apps/api/src/modules/progress/progress.service.ts:303](../../../apps/api/src/modules/progress/progress.service.ts#L303)。

## OPS-07 业务、媒体、原始资产备份恢复

**输入**：独立目标、业务库/媒体/资产清单、删除账本。

**处理与实现**：SQLite使用一致性备份，PG走原生工具；逐文件校验大小和SHA-256；恢复校验版本、路径和任务fence；应用删除账本并拒绝不完整恢复启动。

**输出**：可审计备份、恢复收据和资产清单。

**状态与持久化**：`privacyRequests`

**权限、失败与边界**：目录联接不是独立备份；只校验清单覆盖的字节，不把存在目录当完整恢复。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

**补充实现文件**：

- [scripts/operations/backup.cjs](../../../scripts/operations/backup.cjs)
- [scripts/operations/postgres-backup.cjs](../../../scripts/operations/postgres-backup.cjs)
- [scripts/operations/restore-state.cjs](../../../scripts/operations/restore-state.cjs)
- [scripts/gesp/backup_archive.py](../../../scripts/gesp/backup_archive.py)

## OPS-08 Windows守护与Linux部署

**输入**：Node24/npm11、持久目录、构建时API地址、部署配置。

**处理与实现**：Windows由PM2守护API/Web/健康探针并注册登录恢复；Linux提供独立Web/API/worker及HTTPS/PG模板；构建共享契约和本地公式字体。

**输出**：本地长驻服务与部署操作路径。

**状态与持久化**：复用调用者上下文、独立索引、SQL任务表或文件资产；不另造业务集合。

**权限、失败与边界**：前端API地址写入构建包，仅改运行环境不能修改旧浏览器包。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

## OPS-09 自动验收、资产校验与源码交付

**输入**：代码、隔离SQLite/PG、资源清单和浏览器。

**处理与实现**：Vitest验证评分/权限/事务；Playwright跑真实页面与手机；脚本检查题族、教材、媒体、迁移、恢复与发布；CI分application/browser/postgres；源码打包排除秘密。

**输出**：版本绑定的检查收据和可交付源码。

**状态与持久化**：复用调用者上下文、独立索引、SQL任务表或文件资产；不另造业务集合。

**权限、失败与边界**：测试通过不替代真人教学、触控/辅助技术验证、题目标定与全教材人工审核。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

**补充实现文件**：

- [scripts/operations/package-source.py](../../../scripts/operations/package-source.py)
- [scripts/qa/run-browser-acceptance.cjs](../../../scripts/qa/run-browser-acceptance.cjs)

## OPS-10 资料引用审计与持久文件回收

**输入**：来源SHA或上传ID、领域删除/取消/完成/过期和只读审计命令。

**处理与实现**：审计取双库只读一致快照；领域事务仅排维护任务；后台核对材料、冻结课程、旧学案/白板与活跃上传，保留未知依赖；按SHA递增generation并持purge互斥，Node/Python各自PID租约保护原件和缓存；等待不消耗失败次数，定期恢复中断/取消任务；完整清单后逐文件unlink及空目录rmdir，另清确切source任务的处理JSON和配置；原件发布可写前释放自己的互斥并再次递增版本；upload永久撤销挡住迟到写入；Node/Python先独占写staging、同步关闭，再以同卷独占hard link发布完整控制标记；所有用途的活PID暂存都保护对象，确切死亡的受控暂存才可清理，旧损坏正式标记继续保留。

**输出**：可审计引用/宽限/活跃/未知清单、自动续跑回收结果、共享资料保留与进程栅栏。

**状态与持久化**：`studioMaterialAssets`、`studioMaterialUploads`、`studioSourceMaterials`、`sourceCourses`、`studioLearningPacks`、`studioWhiteboards`

**权限、失败与边界**：只操作受控目录及可证明归属的工作文件，未知/链接不删除；统计为成功尝试的操作量；旧页图回填及恢复删除账本后的源文件物理处理仍待；生产尚未切换此分支。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

**补充实现文件**：

- [scripts/operations/material-audit.cjs](../../../scripts/operations/material-audit.cjs)
- [apps/api/src/infrastructure/studio-atomic-marker.ts](../../../apps/api/src/infrastructure/studio-atomic-marker.ts)
- [apps/api/src/infrastructure/studio-file-paths.ts](../../../apps/api/src/infrastructure/studio-file-paths.ts)
- [scripts/processing/file_leases.py](../../../scripts/processing/file_leases.py)
- [apps/api/src/infrastructure/studio-atomic-marker.test.ts](../../../apps/api/src/infrastructure/studio-atomic-marker.test.ts)
- [apps/api/src/infrastructure/studio-file-coordination.ts](../../../apps/api/src/infrastructure/studio-file-coordination.ts)
- [apps/api/src/infrastructure/studio-file-inventory.ts](../../../apps/api/src/infrastructure/studio-file-inventory.ts)
- [apps/api/src/modules/learning/studio-material-maintenance.service.ts](../../../apps/api/src/modules/learning/studio-material-maintenance.service.ts)
- [apps/api/src/modules/learning/studio-material-maintenance.integration.test.ts](../../../apps/api/src/modules/learning/studio-material-maintenance.integration.test.ts)

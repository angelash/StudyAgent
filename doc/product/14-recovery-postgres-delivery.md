# 可校验备份恢复、PostgreSQL实机与研究库结构审计

2026-10-19，接续 `849553d`。本批推进 OPS-01/02、ASSET-01/02 和部署验收，M00–M10 整体仍进行中。

## SQLite备份与恢复

`scripts/operations/backup.cjs` 提供 create、verify、restore。在线 SQLite Backup API 生成事务一致的业务快照，包含领域数据、不可变响应、报告/计划版本、会话、任务和历史。根据快照中的引用，复制并校验上传中已确认分块、已完成原文件、页证据与处理媒体；不依赖仍在写入的未提交临时文件。可以另外完整纳入原始资产目录，逐文件 SHA-256 和大小核对。资产目录在此期间应保持不变，不能与迁移、改写或清理同时进行。

完整清单与校验通过后才去掉未完成标记。恢复先校验清单、SQLite完整性和业务文件引用，再写入全新目录；拒绝已有目标、源目标重叠、路径穿越、符号链接、重复路径、缺文件和校验错误。恢复未完成时 API 拒绝启动。失败目录保留未完成标记便于核查，不会将其标记为可用。

恢复保留学习事实和历史，同时撤销旧登录、未用学习码、未用监护人邀请，要求重新登录；运行中任务的旧租约失效，保留尝试次数，按原状态进入重试、取消或失败，并增加代次/版本与恢复审计。已耗尽尝试的任务不会被自动无限重试。恢复后的业务事件记录备份编号和来源版本。

命令示例（目标目录必须尚不存在）：

```powershell
node scripts/operations/backup.cjs create --data-dir "F:\StudyAgentData" --destination "F:\StudyAgentBackup\2026-10-19" --assets "F:\StudyAgentAssets"
node scripts/operations/backup.cjs verify --bundle "F:\StudyAgentBackup\2026-10-19"
node scripts/operations/backup.cjs restore --bundle "F:\StudyAgentBackup\2026-10-19" --destination "F:\StudyAgentRecovered"
$env:STUDY_DATA_DIR='F:\StudyAgentRecovered'
$env:STUDY_ASSET_ROOT='F:\StudyAgentRecovered\assets'
```

不传 assets 时，清单明确记录未包含原始资产库；完整离线恢复还需可用的独立资产库。`STUDY_ASSET_ROOT` 现同时供题卷库和处理模型使用，兼容旧 `STUDY_ASSETS_DIR`，避免搬迁后两个模块读取不同目录。

已验证：在线 WAL 快照、不可变文件、真实 API 重新登录后恢复草稿/报告证据/助教历史、旧会话撤销、任务重新接管和旧输出拒绝、旧租约失败时业务事务回滚、损坏和非法路径拒绝、已有目录保护、未完成恢复启动门禁。合成数据完整恢复通过；**全部原始资产的备份复制和独立逐文件校验仍在运行**，位置为本地 `data/backups/full-20261019`，未完成标记存在时不得宣布该包完成。源业务为隔离浏览器合成账号，资产来自已迁入的完整本地库，未触碰真实用户业务库。

## PostgreSQL实机

从 EDB 官方二进制下载入口取得 PostgreSQL 17.11-5 Windows x64，381,531,864 bytes，SHA-256 `80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f`。本地解压，不注册系统服务。在127.0.0.1:15439创建专用QA集群，SCRAM认证；应用账号非超级用户，无创建数据库或角色权限，仅拥有隔离QA数据库。其他端口已有服务保持不动。私有凭据仅保存在Git忽略的data/qa。

`scripts/qa/prepare-postgres.cjs init/start/status/stop` 只管理此专用集群；`scripts/qa/run-postgres-tests.cjs` 使用随机独立schema，结束后仅删除本次创建的schema。

真实3项集成测试通过：存储迁移和唯一冲突完整回滚；权限撤销后拒绝旧事务；跨连接池排他领取与租约过期接管、旧结果隔离；真实API中监护人/学生登录、范围、评测、计划、练习草稿、助教帮助与会话在关闭重建后恢复。证据 `postgres-environment.json`、`postgres-runtime.json` 位于当日证据目录。当前是小规模功能与恢复样本，不能据此声称并发性能已完成；全域版本冲突和每请求全库读取仍需改造。PostgreSQL专用备份恢复及升级/全新部署演练继续开发。

## 研究原始库结构审计

`scripts/assets/audit_archive_sensitive.py` 以只读事务扫描4,082,896,896字节原始库中的全部62,272条responses、66,334条member_responses、1,131,861条member_question_versions，合计1,260,467行。解析错误0，源文件大小与修改时间保持一致；所列凭证、身份元数据、URL参数及Bearer头规则未发现候选项。审计不保存原始字段值，只保留计数和必要的行键哈希。合成正/负例及嵌套边界2项Python测试通过。

证据 `archive-sensitive-audit.json` 明确保留 sensitiveFreeVerified=false：结构扫描不认证自然语言正文的隐私语义，也不替代题源授权审核。原始资产仍遵守本地私有、独立来源与发布门禁。

## 验证与剩余范围

当前默认完整API回归17文件92项通过；PostgreSQL另3项实机通过，默认测试无连接配置时明确跳过这3项。类型检查通过，API生产构建通过，Web沿用本轮已通过的生产构建（本批无Web实现改动）。Python审计测试2项通过。

仍需完成完整资产备份与恢复核验、PostgreSQL备份/升级部署、并发和性能改造、受控媒体/17题型、数据导出删除、运营质量指标、教材与更多独立题族，以及前两批新增页面的浏览器验收。总目标保持active。

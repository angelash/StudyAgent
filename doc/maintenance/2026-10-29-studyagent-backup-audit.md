# StudyAgent 剩余副本、备份与 ChinaTextbook 核查

2026-10-29；报告生成时间 2026-10-29T04:27:31.970114+00:00。GB 使用十进制逻辑体积。此次为核查，未删除用户资料、备份、教材或更改教材入口，未重启或发布正式服务。

**结论：仍有重复内容；I: 的独立盘备份建议保留。优先评估 E: 的恢复演练资产和 F: 的 QA 构建缓存。**

- I:/StudyAgent-backups 共 **50.69 GB、400,425 个文件**，位于 Disk 3 Kingston USB SSD，与 F: 不同硬盘。它是有恢复价值的独立副本。
- E:/StudyAgentQA 共 **44.63 GB**。其中 full-restore-20261020/assets 的 **44.62 GB、396,135 个文件**全部 SHA-256 与全量备份清单一致。E: 与 F: 同属 Disk 1 Samsung NVMe，这份资产副本优先列为清理候选。
- F: 核查范围内确认 **4.23 GB** 额外独立文件内容重复；另有 **4.20 GB** QA 构建缓存可重建。两者有交集，不能相加。
- H:/ChinaTextbook 当前可读，共 **91.21 GB**，其中工作文件约 46.62 GB、上游 Git 对象与历史约 44.59 GB。旧 E: junction 仍指向不存在的目录。

**I: 备份的内容与实际用途**

- full-20261019：44.72 GB、396,150 个文件。主体是原始试卷媒体、检索库、模型和研究资料；含 10 月 19 日生成的旧合成 QA 业务库。不是今天真实家庭数据的最新备份。
- chinatextbook-primary-20261021-v1：5.62 GB、590 个文件，即 295 份小学数学／英语 PDF 及对应文本。
- chinatextbook-chinese-20261021-v1：0.165 GB、24 个文件，即 12 份小学语文 PDF 及对应文本。
- gesp-20261021-v1：0.192 GB、3,660 个文件。其中 3,658 个档案载荷合计 191,735,767 字节，其余两份文件为备份清单和校验文件。
- 根目录另有 547 字节迁移收据。四组备份不应被当作四份全量项目副本；范围不同。

文件集合核对：400,419 个清单内路径全部存在，大小不符 0、缺失 0。清单外六个文件分别为迁移收据、两份 GESP 清单文件、全量包清单、32 KB SQLite SHM 和 0 字节 WAL，已单独列出。

本轮完整回读：**400,419/400,419 个载荷文件、50,600,682,669 字节通过大小与 SHA-256 核对；备份读取／哈希错误 0**。不是沿用旧迁移收据作为本轮完整性证明。

- chinatextbook-chinese-20261021-v1：备份核验 24/24；与主目录对应文件实际字节相同 24 个、0.16 GB；不同／缺失 0 个。
- chinatextbook-primary-20261021-v1：备份核验 590/590；与主目录对应文件实际字节相同 590 个、5.62 GB；不同／缺失 0 个。
- full-20261019：备份核验 396,147/396,147；与主目录对应文件实际字节相同 396,135 个、44.62 GB；不同／缺失 12 个。
- gesp-20261021-v1：备份核验 3,658/3,658；与主目录对应文件实际字节相同 3,658 个、0.19 GB；不同／缺失 0 个。

与主目录不同不代表备份损坏；原备份按创建清单核验，当前文件则另行比较。全量包的 396,135 个 assets 文件全部与 F: 相同，12 个不同项为旧业务库及其引用的运行文件。活动业务 SQLite 的主文件不能单独代表含 WAL 的完整业务状态。另按新 H: 路径回读的 307 份已导入教材源 PDF 全部与清单一致，未对 H: 所有教材逐件计算 SHA-256。此轮证明物理可读、与创建清单一致及历史库可读，不代替今日主干的完整恢复演练。

只读读取业务库的有效事务状态后，确认版本差异如下；当前库按 mode=ro 读取 WAL，没有忽略未 checkpoint 的事务：

- `I:/StudyAgent-backups/full-20261019/database/study-agent.sqlite3`：schema 3、revision 85，SQLite quick_check = ok。
- `E:/StudyAgentQA/full-restore-20261020/study-agent.sqlite3`：schema 8、revision 135，SQLite quick_check = ok。
- `data/study-agent.sqlite3`：schema 23、revision 186，SQLite quick_check = ok。

因此 I: 适合原始资产恢复和旧格式恢复演练，当前还应补齐今日业务库、最新 main 和 10 月 29 日归并原件的独立盘备份。I: 的教材备份只包含已导入的 307 份 PDF 和文本，不包含整个 H: ChinaTextbook。

**F: 重复内容的范围与边界**

主目录扫描约 108.39 GB、611,007 个文件，不含本轮核查目录。针对备份、QA、归并对象、运行文件和构建选出 124,188 个文件、51.92 GB；只对有相同大小候选的 109,765 个独立文件计算 SHA-256。确认 9,588 组内容相同，已用 Windows 实际文件 ID 排除硬链接误计。此结果不是全盘重复文件扫描。

- 守护进程回滚备份：按本次保留优先级分摊的额外重复量 2.34 GB，26,596 个文件。
- 数据发布前备份：按本次保留优先级分摊的额外重复量 1.41 GB，2,115 个文件。
- QA资料与快照：按本次保留优先级分摊的额外重复量 0.47 GB，16,661 个文件。
- 旧发布构建：按本次保留优先级分摊的额外重复量 0.01 GB，357 个文件。
- 归并原件对象库：按本次保留优先级分摊的额外重复量 0.00 GB，276 个文件。
- 当前运行文件与构建：按本次保留优先级分摊的额外重复量 0.00 GB，293 个文件。

分摊优先保留当前运行文件、归并原件对象和较新回滚包，仅用于避免重复记账，不能据此删除整个目录。发现 10 组相同数据库主文件，例如 chemistry-before-deploy 与 chemistry-release 的 61,620,224 字节数据库完全一致；另外多份大小相同的数据库内容并不相同。恢复能力还取决于配套 WAL、配置、构建和引用文件。

主要相同大文件是被多份备份复制的 Webpack 构建缓存。守护进程回滚包总量约 8.29 GB，data/backups 约 2.54 GB，不能全部当作日志删除。归并对象库 24.19 GB 中多数是独有历史材料，不能只因目录名带 maintenance 就删除。

活动 PostgreSQL 的一份 pg_wal 文件在扫描中变化，已排除。核查时没有停止该进程或把其数据库目录当作静态缓存。

**后续清理的具体候选；本轮均未执行**

1. `E:/StudyAgentQA/full-restore-20261020/assets`：44,615,691,928 字节、396,135 个文件已回读，与备份创建清单一致。保留的源为 F:/workspace/github/StudyAgent/data/assets 及独立盘 I:/StudyAgent-backups/full-20261019/assets；主目录是否逐件相同以本轮备份对比明细为准。E: 的业务库、processing、qa-acceptance、restore-receipt 和三个模型演练目录不列入这个目标；非 assets 合计约 15.56 MB。
2. F: 16 处 QA Web 构建下的 17 个 cache 目录：432 个文件，4,196,856,734 字节。它们位于独立 QA 的 .next/cache、previous-next/cache 及其中一处嵌套的 previous-next/dev/cache；正式 apps/web/.next 不在这个候选中。代码、依赖、构建主体、数据库、截图、trace 和验收记录保留。完整精确路径见 cleanup-candidates.json。
两项合计逻辑体积约 **48.81 GB**，其中 E: 44.62 GB、F: 4.20 GB；未表示已经释放空间。文件系统分配、共享块与其他进程会影响实际容量变化。
3. 如再收缩回滚包，应先选择保留哪些版本，再校验每个保留包的数据库一致性和引用文件。仅对零散重复文件做删除会破坏原包结构，本报告没有把 4.23 GB 全部列为可立即删除量。

**H: 教材库与入口**

当前正确源为 H:/ChinaTextbook，remote = https://github.com/TapXWorld/ChinaTextbook，commit = `5a80345f2043ba6f8db8d7be9cf3db82725ff1f7`，tree 与 10 月 21 日旧索引一致，Git 工作区干净。该上游材料库的 master 不是 StudyAgent 额外开发分支。

当前索引 2,375 个 Git 跟踪条目，含 1,905 份 PDF、466 个分片、182 个分片组；按整书及尚待拼接的分片组计 2,061 份逻辑 PDF。该数字是来源形态索引，不能当作已逐书完成正文验收。

- 一组两个不同路径的 PDF 实际 SHA-256 相同，Windows 文件 ID 独立，额外内容约 7.38 MB。
- 26 组同时保存整书和分片；本轮按分片顺序串接并计算 SHA-256，全部与整书相同，双重表示约 1.69 GB。其余 156 组缺少单一整书表示，不应按分片扩展名删除。
- 两个高中英语分片实际字节与 Git blob 不同：`高中/英语/重庆大学版-重庆大学出版社/普通高中教科书·英语必修 第三册.pdf.2` 与 `.pdf.3`。实际大小分别 37,294,917 和 37,281,693 字节；Git 原件均为 36,700,160 字节。CRLF 规范化后的 blob 哈希与 Git 原件完全一致，且 core.autocrlf=true，确认是换行转换。Git 状态干净不能发现这种字节问题；应从 Git 导出原始二进制字节并禁止后续文本换行过滤后再拼接。本轮未改写这两个原件，也没有仅凭大小差异宣称整本 PDF 已无法阅读。README 的 94 字节差异为正常文本换行差异。
- H: 的 .git 约 44.59 GB 是上游对象与历史，仍可用于恢复上述原始分片；它与工作文件在同一盘，不能计作独立盘备份。

旧 E:/ChinaTextbook 是一个失效的 junction，目标 H:/ColdArchive/2026-10-21/ChinaTextbook 已不存在，它没有额外存放一套教材文件。StudyAgent.code-workspace、私有 .env 的 TEXTBOOK_BASE_PATH、环境示例和两个导入脚本仍指向 E:；归档索引脚本默认源与资源登记说明仍包含旧 H: 目录。本轮已按 H:/ChinaTextbook 另存当前索引，未改写历史来源清单、私有配置或全局 E: 链接。下一步修复当前入口可统一到 H:，或把 E: 别名重新指向 H:/ChinaTextbook。

F: 已导入教材是应用资料入口所需的受控副本；H: 是完整来源库，I: 是已导入子集的独立备份。即使文件字节相同，也不能只按同名／同哈希删除 F: 的应用资料。

**方法、状态和证据**

扫描不跟随 reparse 链接，记录访问错误、数量、字节、目录合计、扩展名和大文件；各扫描根的逻辑字节均与顶层分类合计一致。F: 跳过 301 个链接；I:、H:、E: 演练目录和临时 GESP 目录无跳过链接、无扫描错误。历史 GESP 临时恢复目录目前仅 3 个小文件、12,321 字节，不是另一份大备份。

核查过程不是原子文件系统快照。Windows Python 3.10 的 DirEntry.stat() 不提供可靠文件 ID，首次硬链接记账试算已标为 invalid-identities；正式结果改用 os.stat 的非零文件 ID 并逐件回读。I: 回读过程保留断点前缀并续读，合并后的结果按路径、预期大小和预期 SHA-256 去重核对，没有把首轮部分覆盖写成完整通过。当前业务库曾另外做 immutable 观察，该观察不含 WAL，已单独标识；本报告版本结论使用含 WAL 的只读事务。

- [主目录扫描摘要](F:/workspace/github/StudyAgent/data/maintenance/2026-10-29-backup-audit/summary-main.json)；[I: 扫描摘要](F:/workspace/github/StudyAgent/data/maintenance/2026-10-29-backup-audit/summary-backups.json)；[E: 演练扫描摘要](F:/workspace/github/StudyAgent/data/maintenance/2026-10-29-backup-audit/summary-restore.json)。
- [备份路径／字节与六个附加文件](F:/workspace/github/StudyAgent/data/maintenance/2026-10-29-backup-audit/backup-file-set-check.json)；[备份清单 SHA-256](F:/workspace/github/StudyAgent/data/maintenance/2026-10-29-backup-audit/backup-manifests.json)。
- [六个附加文件的实际读取与 SHA-256](F:/workspace/github/StudyAgent/data/maintenance/2026-10-29-backup-audit/backup-extra-files-readback.json)。
- [I: 完整回读与主目录对比摘要](F:/workspace/github/StudyAgent/data/maintenance/2026-10-29-backup-audit/backup-readback-summary.json)；[E: 396135 个资产回读摘要](F:/workspace/github/StudyAgent/data/maintenance/2026-10-29-backup-audit/restore-assets-readback-summary.json)。
- [本地重复组与 QA 缓存路径](F:/workspace/github/StudyAgent/data/maintenance/2026-10-29-backup-audit/local-duplicates-summary.json)；[相同数据库文件组](F:/workspace/github/StudyAgent/data/maintenance/2026-10-29-backup-audit/duplicate-database-groups.json)。
- [只读列出的精确清理候选与保留项](F:/workspace/github/StudyAgent/data/maintenance/2026-10-29-backup-audit/cleanup-candidates.json)。
- [三份业务库的有效版本](F:/workspace/github/StudyAgent/data/maintenance/2026-10-29-backup-audit/database-schema-checks.json)；[教材源库、相同 PDF 与整书／分片拼接](F:/workspace/github/StudyAgent/data/maintenance/2026-10-29-backup-audit/chinatextbook-current-state.json)；[两个分片的换行转换证据](F:/workspace/github/StudyAgent/data/maintenance/2026-10-29-backup-audit/chinatextbook-working-bytes-check.json)。
- [物理磁盘与进程](F:/workspace/github/StudyAgent/data/maintenance/2026-10-29-backup-audit/environment-before.json)；[E: 与 C: 磁盘归属](F:/workspace/github/StudyAgent/data/maintenance/2026-10-29-backup-audit/extra-disks.json)。

本轮 JSONL 明细已无损压缩为 .jsonl.gz，压缩后逐件解压流 SHA-256 与原文本一致。仅转换本轮生成的核查文本，未复制或删除用户原始材料。见 [文本明细压缩与解压回读收据](F:/workspace/github/StudyAgent/data/maintenance/2026-10-29-backup-audit/evidence-compression-receipt.json)。可用 Python gzip.open(path, "rt", encoding="utf-8") 流式检查。

结束状态、原有配置哈希、Git main/worktree 和 HTTP 检查见 [结束核对收据](F:/workspace/github/StudyAgent/data/maintenance/2026-10-29-backup-audit/final-checks.json)。

用户在该核查完成后又授权了资产归类和仓库重复旧副本清理。后续已经执行的分类、删除、H: 路径修复和两个教材分片修复见 [后续整理报告](2026-10-29-asset-organization.md)；本报告中的“未删除”“尚未改写”等表述描述的是本次只读核查结束时的状态。

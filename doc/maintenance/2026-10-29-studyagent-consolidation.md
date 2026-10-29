# StudyAgent 工作目录、资料与大文件整理

盘点日期：2026-10-29。范围为 `F:/workspace/github/StudyAgent` 及 Git 登记的 40 个同级 `StudyAgent-*` 工作目录。体积采用十进制 GB（1 GB = 1,000,000,000 字节）；文件数按路径计数，不代表独立内容或可教学题目数量。下文“整理前”和 108.39 GB 是工作目录合并阶段基线；其后云端归档与本地退役后的当前目录见[云端备份执行记录](2026-10-29-cloud-archive.md)。

## 整理前的整体情况

- 共 41 个工作目录、47 个本地分支，扫描 1,114,120 个文件，逻辑体积约 147.71 GB。扫描跳过 reparse 链接目标，避免把共享依赖、资产重复算入目录；扫描错误为零。
- 主目录约 82.39 GB；40 个额外工作目录约 65.32 GB。额外目录来自不同功能的开发、集成和隔离验证，分支合并后长期未移除。
- 主目录已有 5 处未提交改动：`.env.example`、`apps/web/next.config.ts`、`doc/product/87-local-windows-daemon.md`、`ecosystem.config.cjs`、`scripts/operations/start-daemon.ps1`。这些原件已另存并记录 SHA-256，整理保留其原始字节，不作为本次提交内容。
- 正式 API、Web 与健康守护进程从主目录启动。整理前 API health、ready 和登录页均返回 HTTP 200。

## 有哪些资料

### 原始试卷、题目与媒体

`data/assets/shijuanbao/media` 约 34.64 GB，主要是已下载的试卷 PDF、扫描页和题图；`data/assets/shijuanbao/archive.sqlite3` 约 4.08 GB，保存原始响应、试卷/题目版本、下载与补查记录。

实际只读核对数据库后，归档与本地检索目录记录 72,468 份试卷、885,203 条题目、306 本书和 2,175 条资源。它们是研究归档与索引记录，不能等同于已审核、去重、获得完整教学依据或能够直接发布的题库。

`data/assets/catalog.sqlite3` 约 1.27 GB，用于本地检索；`data/assets/manifest.sqlite3` 约 0.22 GB，记录 396,118 个文件条目、来源与迁移快照。这些目录和数据库保留在主目录。

### 教材与研究材料

- `data/assets/textbook-sources/` 当前约 73.99 MB，保存教材提取文本与公开来源；307 份原 PDF 已绑定 `H:/ChinaTextbook`。整理前这里另有本地原 PDF 副本。
- `data/assets/research/education-app-survey` 是历史位置，对应 0.25 GB 教育应用研究材料；2026-10-29 已迁至研究项目，不再属于 StudyAgent 资产。
- `data/research` 约 0.06 GB，包含 Hyperknow 公开资料和化学教材参考。
- `data/gesp` 约 0.19 GB，包含原始文件、抽取文本、题目和审阅资料；实际目录数据库记录 3,132 道题目、117 份文档。它们仍是研究与来源目录，不代表全部已通过答案/教学审核。

工作区还挂载过 `E:/ChinaTextbook`。核查时它指向已失效的 `H:/ColdArchive/2026-10-21/ChinaTextbook`；当前完整教材原库和解引用入口为 `H:/ChinaTextbook`，StudyAgent 的本地提取文本绑定该原库的仓库相对路径与 SHA-256。

### 模型与工具

- `data/assets/models/re-shijuanbao-service` 和 `data/assets/models/re-shijuan-lite` 是整理前的历史模型位置；Qwen 已删，去手写模型和逆向工具已迁至 F 盘研究项目。
- `data/tools` 约 1.38 GB，主要包含独立 PostgreSQL QA 工具及安装包。

这些数字保留为整理前基线；当前去手写、逆向研究和处理工具归 `F:/workspace/rogue-prototype-lab/prototypes/`，不属于 StudyAgent 运行目录。

### 验证证据、备份与运行产物

- 原主目录 `data/qa` 约 15.20 GB：隔离数据库、Web 构建、原始报告、截图、trace、冻结源码和构建快照混合存放。
- `output/daemon` 约 8.55 GB，主要是发布回退目录和旧构建，不能简单当成日志缓存。较大的三份回退备份分别约 0.86、0.81、0.80 GB。
- `data/backups` 约 2.54 GB，包含化学课程不同发布阶段的一致性备份。
- 原主目录 `doc/evidence` 约 1.07 GB，是已经版本管理的验收副本；本次新合入的练习及 schema23 历史证据另计。

正式运行数据库、已有回退备份和原主目录的这些材料均保留。原始 trace、数据库、凭据和诊断只保存在忽略提交的本地目录；公开报告只记录聚合数量、路径与核验结论。

## Git 如何归并

1. 在任何清理前创建 `all-branches-before.bundle`，约 0.91 GB，并通过 `git bundle verify`。所有原始分支名称和提交号另存清单。
2. 最新本人练习分支继承了练习内容与共享安排分支，将这条开发链快进合入 `main`，保留原始 19 个提交。
3. 将旧白板来源分支独有的 schema23 原始 API 失败、修正和通过证据合入主干。文档冲突保留当前产品边界，并追加旧版历史复验记录。
4. 两条旧化学/学习产物分支的全部 346/362 个涉及路径都已存在于主干，后续主干已有更完整实现；大部分提交也能确认 patch 等价。归并保留它们的完整提交祖先，采用主干后续实现，不用早期原稿覆盖新权限、笔记、白板或 CI 流程。
5. 额外目录中的旧未提交代码和设计原稿单独保留原件、二进制 patch 和 SHA-256；相同位置的早期实现不覆盖主干后续实现。
6. 整理时只读检查了远端 42 个分支，所有远端分支 tip 均已是本地主干祖先。远端未执行推送、分支删除或发布。

合并后所有原本地分支 tip 均可从 `main` 追溯。单主干要求已写入 [项目入口](../../AGENTS.md) 与[单主干规则](../../.cursor/rules/single-main.mdc)，后续验证使用主目录内的 `data/qa/`，不创建同级功能 worktree。

当前本地主干包含新的本人练习后端；正式运行仍使用此前部署的 schema23 构建。本轮是本地归并和目录整理，不是 schema24 正式发布，也不代表此前未完成的本人练习前端、人工撤回、成人链路或教学效果验收已完成。功能边界见 [148 工作检查点](../product/148-current-work-checkpoint-and-remaining-scope.md)。

## 额外目录里的文件如何保留

40 个目录约 65.32 GB 中，约 22.97 GB 为已有 Git 版本的文件，历史通过 `main` 祖先和 bundle 保留；约 14.35 GB 为 `node_modules`、`.next`、`dist` 等可重建内容；其余需要保留的本地文件按内容 SHA-256 收拢。

保留的 106,566 个原文件路径共约 28.00 GB，去重为 32,542 个独立对象、约 24.19 GB。归档位于：

`data/maintenance/2026-10-29-consolidation/`

主要清单：

- `inventory-summary.json`：各目录、类别、体积、大文件、链接与 Git 状态。
- `inventory-*.jsonl`：完整逐文件清单，含大小和原始修改时间。
- `branches-before.json`、`remote-heads-readonly.json`：原分支与远端只读检查。
- `retained-*.jsonl`：原目录、原相对路径、对象位置和原件 SHA-256 的对应关系。
- `objects/<前两位>/<sha256>`：独立对象原件。同内容只存一份，原路径关系保存在清单中。
- `dirty-*.patch`、`main-before.patch`、`main-dirty-before/`：未提交改动和主目录原始配置。
- `production-before.sqlite3`：通过 SQLite 在线备份 API 得到的一致性快照，`quick_check=ok`；不是直接拷贝正在写入的 WAL 数据库。
- `large-files-before.tsv`：全部 688 个不少于 50 MB 的文件路径，包含所属目录与可重建类别。
- `preservation-summary.json`、`preservation-verification.json`：迁移与独立 SHA-256 回读结果。
- `deletion-plan.json`、`worktree-removal-receipt.json`、`final-state.json`：删除前核对、逐目录执行及最终状态。
- `validation/`：构建、API、浏览器、模拟数据和 Windows junction 安全测试的原始记录。

恢复单个原文件时，先从对应 `retained-*.jsonl` 查原路径，再运行：

```powershell
python scripts/operations/consolidate-workspace.py restore --origin StudyAgent-tt-doc --path doc/product/experience/reference-state-matrix.json --destination data/maintenance/recovered-reference-state-matrix.json
```

恢复命令拒绝覆盖已有文件，并核对恢复后的 SHA-256。版本内旧文件可通过 `git show 原提交:相对路径` 提取；全分支初始 bundle 另外保留。

## 删除前后的保护与验证

归档和 SHA-256 回读完成后，还要重新核对所有源目录的 HEAD、Git 状态、未提交 patch、完整文件集合、修改时间与链接，确认扫描后未发生新的写入。所有待删除提交必须已经是 `main` 祖先，正式配置和构建哈希必须保持。

生成数据测试发现，本机 Git for Windows 的直接 `git worktree remove --force` 会遍历 junction，导致共享目标内的测试哨兵文件被删除。该失败作为独立首次记录保留，未使用真实资料测试。修正流程使用 `fsutil reparsepoint delete` 先移除链接属性，核对不存在剩余 reparse 链接后再由 Git 移除工作树；新的模拟测试确认共享目标 SHA-256 保持。

删除方案仅针对清单中 40 个仓库同级的 `StudyAgent-*` 精确路径，保留主目录。每个路径都校验绝对父目录和前缀；移除前再次证明原 tip 已合入主干。完成后独立检查目录消失、Git 登记、全部原 tip 的祖先关系、配置/关键资料哈希、服务入口与磁盘可用容量。

本次归档仍位于本机同一盘，提供整理恢复与核验能力，不作为独立磁盘容灾副本。实际通过/跳过的测试数、最终目录与磁盘变化见下方执行结果和 `final-state.json`。


## 执行完成与最终验证

- 40/40 个原同级工作目录已删除，独立检查路径均不存在；`git worktree list` 只有主目录。删除前移除了 5,932 个 reparse 链接属性，没有遍历共享目标。
- 46 个额外本地分支已移除，`git branch` 只有 `main`。47 个原本地分支 tip 均可从主干追溯；初始 bundle 和完整分支清单仍在主目录归档中。
- 原有 5 处未提交配置、已部署构建、工作区文件、共享依赖及三个关键资料数据库共 17 个文件的 SHA-256 核对一致。原有配置继续保留为未提交改动。
- 原主目录 `data/assets` 下 396,867 个非 WAL/SHM 文件的存在、大小和修改时间与整理前一致；关键数据库另外完成 SHA-256 回读。活动 SQLite 的 WAL/SHM 单独列出，没有当作不可变文件或用旧副本覆盖。
- 完整扫描主目录后，未发现指向已删除工作目录的 reparse 链接。`git fsck --connectivity-only --no-dangling` 通过。
- 正式 API health、ready、Web 登录页整理后均返回 HTTP 200；本轮没有重启或发布正式服务。
- F 盘可用空间从约 **65.16 GB** 增至 **105.52 GB**，本轮净增加约 **40.36 GB**，已包括归档、Git bundle 与新验证产物的占用。仅目录删除阶段前后观测增加约 66.44 GB；容量变化会受其他进程与文件系统分配影响，不等同于源文件逻辑体积。

验证按独立批次记录，不拼成一次全绿：

- 契约、配置与 API 构建通过；前后端类型检查通过。验证在主目录内的隔离源码、独立端口和独立 Web 构建运行，正式构建哈希保持。
- 完整 API 首轮：**1894 通过、1 失败、74 跳过**，共 1969 个用例。唯一失败为隔离副本遗漏 `doc/evidence/2026-10-20/family-identity-content-audit.json`，原有几何资源冻结验证无法读到历史清单。首轮报告与日志保留。
- 该文件第二轮仍为 26 通过、1 失败：自动查找隔离依赖时未识别带父目录前缀的路径，因此尚未复制缺失文件；原始失败也保留。明确复制与主目录 SHA-256 一致的历史原件后，第三轮该测试文件 **27/27 通过**，测试源码未改动。未用这 27 个通过数覆盖首轮完整 API 结果，也没有重复跑其余已通过用例。
- 原卷练习浏览器：**39/39 通过，0 跳过、0 首次失败、0 重试**，独立端口 4197/3197。
- 归档：**106,566 个来源路径、32,542 个独立对象全部 SHA-256 回读一致，0 错误**。删除前又核对完整源文件集合、时间、Git 状态、patch、HEAD 与链接。
- 生成数据验证了扫描记账、未提交/忽略文件保留、可重建依赖排除、恢复哈希，以及源文件改变时拒绝继续。Windows junction 直接 Git 删除的首次失败与安全处理后的独立成功记录均保留。

本轮没有配置完整 PostgreSQL 环境重跑全部 PG 用例，没有执行完整整站浏览器或新的远端 CI，也没有进行真人学习效果与全教材覆盖验收。原本人练习前端与产品边界仍按 148 工作检查点续接。

整理后唯一主目录实测约 **108.39 GB**、610,987 个文件路径，其中资料资产约 50.46 GB，本轮保留归档（含 bundle 和清单）约 25.44 GB，QA 目录约 15.75 GB。主目录比原来变大，是把旧工作目录的独有材料收拢到了主目录；全项目占用与磁盘可用空间则按上文结果减少。

## 后续资产分类与已在 Git 中的旧副本清理

以上为工作目录合并结束时的历史记录。用户随后授权清理已经保存在仓库中的旧内容，实际分类与结果见 [后续整理报告](2026-10-29-asset-organization.md)。原 `objects/<prefix>/<sha256>` 已按用途归类；原 `retained-*.jsonl` 保持，新增 `object-locations.jsonl` 将它们指向当前分类原件或经过原始字节回读的 Git blob。恢复命令已兼容两种来源。

原始 Git bundle 在再次确认其中全部 head 可从 main 追溯、Git 连通性与需要的原件回读通过后删除。它曾在合并前存在并通过验证，当前不再额外存一份。旧迁移、删除与验证收据仍作为当时证据保留，不用后续状态覆盖。

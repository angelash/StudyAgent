# 本地数据与资产入口

2026-10-29 后续调整：教材、试卷及教育应用参考资料已分类备份到百度网盘 `/StudyAgent资料备份/2026-10-29/`，清单和恢复方法见 [本轮入口](maintenance/2026-10-29-cloud-archive/README.md)。293 个云包已核对云端元信息，12 个关键恢复包完成下载回读，业务恢复包通过完整性、版本、记录数与内容哈希核验。I 盘灾备、E 盘旧研究副本和 E 盘云端 staging 已按固定目标清理；当前业务资产、H 盘教材原库及 F 盘研究正本继续保留。

逆向工程、模型、原始研究资料及恢复工具的归属统一为 `F:/workspace/rogue-prototype-lab/prototypes/`，迁入内容在各原项目 `studyagent-handoff/` 下。应用不再从 `data/assets/models/` 或 `tools/` 加载逆向实现，去手写通过显式配置的外部处理器调用。9 份普通教材目录已整理到 `assets/public-catalogs/`。

16 项旧位置的副本在删除前重新核对目的端 5,566 文件、301,034,602 字节的 SHA-256，随后删除，主项目不再内置逆向实现或模型目录。

2026-10-29 授权清理后，仅保留本地 main 和主工作目录。代码由 Git 管理；原始资产大多不在 Git 中。

## 核心资料

- `assets/shijuanbao/media/`：34.64 GB 原始试卷 PDF、扫描页、题图。
- `assets/shijuanbao/archive.sqlite3` 及审计库：4.11 GB 原始响应与版本记录。
- `assets/catalog.sqlite3`、`assets/manifest.sqlite3`：约 1.49 GB 检索和历史来源／验证目录。当前模型别名与停用记录另见 `assets/retention.json`。
- `assets/textbook-sources/`：约 73.99 MB 教材提取文本及其他公开来源。307 份 ChinaTextbook 原 PDF 改为按相对路径和 SHA-256 读取 **H:/ChinaTextbook**，本地 5.77 GB 副本已删。
- 去手写、逆向模型、原始研究和处理工具：统一位于 `F:/workspace/rogue-prototype-lab/prototypes/` 各原项目的 `studyagent-handoff/`，不进入本应用资产目录。
- `gesp/`：原题、原文、提取和教研资料。
- `research/` 及归并档案 `core-references/`：公开教材与教研依据、独有参考原件。

## 正在使用的数据与工具

- `study-agent.sqlite3` 及 WAL／SHM、`runtime/`、`processing/`：当前业务与运行文件；保持。
- `../apps/api/dist/`、`../apps/web/.next/`：已更新的当前正式构建；保持。
- `qa/postgres/cluster/`：仍在运行的独立 QA PostgreSQL；`tools/postgresql-17.11-5/` 是其工具，保持。下载 ZIP 已删。

## 备份与历史整理

- 云端恢复包位于 **`/StudyAgent资料备份/2026-10-29/`**：293 个 ZIP、115,310,364,169 字节，覆盖 536,914 条原文件记录、121,977,293,231 逻辑字节。本地只保留云端清单和分层回读证据，不再保留 119.75 GB 的打包 staging。
- I: 原 403,040 文件、50,962,193,496 字节灾备已逐文件核对去向并删除；402,638 文件进入云包、5 文件进入云端补充包、378 文件有核验研究正本、17 文件为可再生缓存、2 文件为有效配置或模板。没有未归类项。
- 旧 QA 库、旧构建、旧发布备份、E:/StudyAgentQA 演练目录已按授权清理。小型历史报告另存于本轮证据 ZIP。
- `maintenance/2026-10-29-consolidation/objects/CATALOG.md`：剩余参考、独有草稿与历史配置入口。27,309 个旧 QA 对象已在恢复定位中标记为主动删除；5,196 个 Git 原件和 37 个本地原件继续可定位。
- `maintenance/2026-10-29-authorized-cleanup/`：本轮清单、执行收据和验证结果。曾因自动审批拦截的 83.52 MB 验证文件已在最终恢复证据通过后按原哈希复核删除；早期拦截记录作为历史保留。8 条停止的旧 QA PM2 登记不是运行进程。

2026-10-29 清理后主目录约 45.79 GB、484,040 个文件。完整情况、容量和旧路径边界见 [资产说明](../doc/maintenance/2026-10-29-asset-organization.md) 与 [云备份执行记录](../doc/maintenance/2026-10-29-cloud-archive.md)。原始资料、可检索记录与已审核／可发布教学内容分别管理。

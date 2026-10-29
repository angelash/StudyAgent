# 原始资产与当前引用

后续职责调整：这里管理教材、试卷、题图、普通公开目录及其检索索引。逆向工程和模型归 `F:/workspace/rogue-prototype-lab/prototypes/`，本项目通过普通资产导入与可配置的外部处理器使用结果。公开教材目录的新位置为 `public-catalogs/`，`public-catalogues.json` 保留新旧路径和原 SHA-256。

研究资料、模型和工具已复制到各原研究项目的 `studyagent-handoff/`，5,566 个文件、301,034,602 字节在删除旧来源前重新核对 SHA-256，全部通过。StudyAgent 旧副本和空模型／研究／工具目录已删除。云端备份、当前回执与恢复说明见 [本轮入口](../maintenance/2026-10-29-cloud-archive/README.md)。

2026-10-29 授权清理后：

- `shijuanbao/media/`：34.64 GB 原始媒体；`shijuanbao/archive.sqlite3` 及审计库合计约 4.11 GB；保留。
- 根目录 `catalog.sqlite3`、`manifest.sqlite3`：检索与历史来源／验证收据，保留。历史 manifest 不改写成当前文件存在清单；当前去重指向及停用记录见 `retention.json`。
- `textbook-sources/`：73.99 MB 提取文本与其他公开来源。307 份 ChinaTextbook 原 PDF 直接引用 H:/ChinaTextbook；已删 5.77 GB 重复 PDF。版本化书籍清单保存 `repositoryPath`、SHA-256、页数及提取路径；原库离线时原卷不可用。
- 去手写模型、逆向调查和工具：已全部交接至 `F:/workspace/rogue-prototype-lab/prototypes/`；应用只调用显式配置的 `STUDY_HANDWRITING_PROCESSOR`，未配置时拒绝新预览任务。

教材、试卷和恢复资料的云备份位于百度网盘 `/StudyAgent资料备份/2026-10-29/`；I: 灾备已在覆盖、关键回读和业务恢复核验通过后删除。原逆向工程正本继续位于 F:/workspace/rogue-prototype-lab/prototypes/。

见 [数据入口](../README.md) 和 [授权清理报告](../../doc/maintenance/2026-10-29-asset-organization.md)。

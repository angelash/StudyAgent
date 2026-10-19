# 本地数据与资产

运行数据和全量原始资产位于本目录，独立于 Git 备份。`assets/manifest.sqlite3` 记录文件来源、校验和与迁移状态，`assets/migration-status.json` 显示进度。

迁入：`python scripts/assets/migrate_assets.py --source F:/workspace/rogue-prototype-lab/prototypes --target data/assets`。
该脚本使用 SQLite 一致性备份，复制完整已下载媒体，保留原始资产，支持中断续传，不修改源工程。

原始研究资产不自动成为可发布或可测量题库；发布、评分协议与知识点审核由内容系统单独处理。

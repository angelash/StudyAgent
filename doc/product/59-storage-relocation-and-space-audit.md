# 备份跨盘迁移与空间复核

2026-10-20，按用户授权将完整恢复备份从 F 盘迁到 I 盘，并重新盘点 F 盘可清理空间。迁移不删除备份内容。

## 跨盘迁移

- 源：`F:\workspace\github\StudyAgent\data\backups\full-20261019`
- 目标：`I:\StudyAgent-backups\full-20261019`
- 目标迁移前的检查：396,150个文件，44,715,867,512字节；I 盘可用空间充足，目标不存在。
- Robocopy 结果：718个目录、396,150个文件、41.644GB完成，0失败、0不匹配；`/MOVE` 在复制后清理旧目录。
- 迁移后核验：396,150个文件、44,715,867,512字节一致；`manifest.json` SHA-256 为 `fe427cf2873fcebfbce8f0b7a80507822fa90679c821fd3d8feb63856b62dacc`，与原收据一致；源路径不存在。
- 迁移收据：`I:\StudyAgent-backups\full-20261019-relocation-receipt.json`。
- 该迁移验证的是路径、数量、字节、Robocopy结果和89MB清单哈希；没有对396,150个文件全部重新计算SHA-256。

## 备份内容

该 `study-agent-backup-v1` 包（ID ceee8518-e5b8-460e-aeb4-f61d95197441）由产品化早期资产迁入和恢复验收生成，包含约41.55GB资产：题卷目录、390,534个媒体文件、教材来源、研究资料、ONNX与Qwen模型、工具，以及早期 schema1–3/revision85 的合成QA业务快照。它不是当前家庭数据实时备份。随后的独立恢复位于 `E:\StudyAgentQA\full-restore-20261020`。

## 当前空间复核

迁移前后 F 盘可用约55.0GB，迁移后约97.5GB；I 盘剩余约182.4GB。项目运行数据中：

- `data/assets` 约41.61GB（396,259文件）：题卷媒体32.26GB、catalog/manifest约1.49GB、题卷archive约4.08GB、模型3.84GB、研究0.24GB、新教材来源0.06GB。
- `data/tools` 约1.29GB，其中PostgreSQL跨平台工具约0.93GB；当前QA PostgreSQL进程仍在读取安装目录，不能边运行边移动。
- `data/gesp` 约0.18GB；`data/qa`约0.30GB；源码发布包约0.01GB。大多是验收证据或当前数据。
- 项目根目录的 `F:\.pnpm-store` 约5.54GB，属于跨项目包缓存，不是StudyAgent的 `node_modules`。应由npm/pnpm使用者确认后清理或迁盘。
- `F:\BaiduSyncdisk`约62.17GB，`F:\AppDataMove\Cursor\globalStorage`约15.26GB，`F:\BaiduNetdiskDownload`约2.16GB，`F:\SteamLibrary`约9.05GB；属于其他应用或用户资料，不能按项目缓存清理。

## 可执行建议

1. 最安全的进一步腾挪是把整个 `data/assets` 移出 F 盘，并设置 `STUDY_ASSET_ROOT` 到新位置；网络/离线模型处理时该路径必须持续可用。资产内部文件名是哈希，不能按扩展名或日期删。
2. `data/backups` 已无大包；不要再新建F盘重复全量资产副本。
3. `F:\.pnpm-store` 可确认没有pnpm项目需要后运行包管理器清理或迁盘；不是直接删除的StudyAgent源码。
4. 百度下载缓存应由百度网盘客户端处理；研究现状未将在当前普通目录访问中看到，不能宣称已释放。
5. F盘普通文件仍无法解释全部硬件已用空间；系统卷影副本与系统保护需管理员终端用 `vssadmin list shadowstorage /for=F:` 进一步确认，当前未获得该权限。
6. 当前 PostgreSQL 工具正在运行；移动 `data/tools` 应先停止隔离QA集群，再迁移并更新入口。


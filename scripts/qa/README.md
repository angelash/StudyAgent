# QA 源码快照与存储

所有实现先修改唯一主目录的 `main`。源码副本只用于验证，不建立另一个开发源。

新快照使用受控工具：

```powershell
python scripts/qa/snapshot-source.py --out data/qa/example-task/source --dry-run
python scripts/qa/snapshot-source.py --out data/qa/example-task/source
```

它复制 Git 已知的 `apps/`、`packages/`、`scripts/`、`resources/`、`tests/` 及根配置的当前字节，包含未忽略的新源码，保留主干删除。默认体积预算 1 GiB；超限先查输入，确需增加时显式设置 `--max-mib`。新目录外保存清单、源码 HEAD、逐文件 SHA-256 与独立回读结果；失败快照标为 incomplete，不覆盖旧结果。

默认排除全部 `data/`、文档证据、依赖、构建、缓存、虚拟环境、数据库、密钥和 `.env`；不遍历旧 QA，不跟随源码或输出祖先的符号链接/junction。必要测试材料使用 `--input tests/fixtures/example.json` 逐文件列明，不隐式复制整套业务资料。依赖由锁文件在隔离环境准备；共用依赖时逐项核对真实目标，不把源码包和构建输出指回正式工作区。

完成任务后登记通过、失败、跳过、复验及复跑入口。保留紧凑报告、必要截图和输入清单；历史完整快照可保留为冷归档。先核对进程与写入、复制、逐文件 SHA-256 回读和源稳定性，再回收已经核验的原件。不能仅凭无命令行引用就删除数据库、独有修改或未完成任务；不终止未知进程。归档目录含本地运行证据或配置时仅本机保存，不进入公开 Git。

2026-11-03 的治理执行记录存放于 `G:/StorageAudits/2026-11-03-StudyAgent-QA/`，历史资料归档目标为 `E:/ColdArchive/2026-11-03/StudyAgent-QA/`。F 盘根目录脚本和报告保留；已迁移子目录使用 junction 保持原路径读取。重新构建历史版本前应按清单核对源码、依赖和运行环境，不能把“路径可读”当作原验收全部可复现。

2026-11-03 后续用户明确授权删除上述历史 QA。167 个 E 盘历史归档及其 F 盘对应目录和联接已永久清除，共删除 628,768 个普通文件、约 103.98 GiB；上段迁移路径仅作历史记录，现已不是恢复入口。当前活跃 QA、数据库和共享依赖保留。删除核验见[回执](../../doc/evidence/2026-11-03/qa-history-deletion/receipt.json)，完整清单与操作记录保留在 `G:/StorageAudits/2026-11-03-StudyAgent-QA-delete/`，未另建历史内容副本。

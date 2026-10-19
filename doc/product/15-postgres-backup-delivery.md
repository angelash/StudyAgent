# PostgreSQL原生备份恢复与数据库恢复门禁

2026-10-20，接续 `aa55a30`。推进 OPS-01/03；完整产品目标继续进行中。

## 交付行为

`scripts/operations/postgres-backup.cjs` 支持 create / verify / restore。只用于 StudyAgent 专用业务数据库：在只读、可重复读事务中导出 PostgreSQL snapshot，原生 `pg_dump --format=custom` 使用同一快照，业务版本、文件引用和任务状态来自该快照。复制被业务记录引用的文件，可另外完整纳入资产库，清单逐文件记录大小和 SHA-256。密码由环境变量传入子进程，不进入命令行和证据文件。

恢复仅接受空数据库和全新文件目录，先核验清单与 dump，再复制文件、使用 `pg_restore --single-transaction --exit-on-error --no-owner --no-acl`，核对迁移版本、业务版本、各集合行数、任务状态和文件引用。SQLite 与 PostgreSQL 共用 `restore-state.cjs` 撤销旧认证、过期未用邀请、隔离旧任务租约，并记录恢复审计；学习响应、报告和计划历史保留。

迁移4新增数据库级 `study_restore_guard`。恢复期间状态为 restoring；只有文件、数据库、认证及任务处理全部成功后，同一业务事务才改为 ready，并核对更新恰好一行。失败保留 restoring 和目录未完成标记。应用在初始化表结构前检查数据库门禁，即使改了数据目录也无法绕过。源数据库不是 ready，或 SQLite 源目录有未完成标记时，不能制作一个被宣称有效的新备份。旧版本3升级到4保留原始证据。

## 执行

先在当前进程配置 DATABASE_URL，不要将含密码的URL粘贴进命令行历史。目标数据库须由运维预先创建、为空且由应用角色拥有；工具不创建角色、删除数据库或覆盖已有目录。示例中 pg-bin 指向本机已有 PostgreSQL 原生工具目录：

```powershell
node scripts/operations/postgres-backup.cjs create --connection-env DATABASE_URL --pg-bin "C:\PostgreSQL\17\bin" --data-dir "F:\StudyAgentData" --destination "F:\StudyAgentBackup\pg-20261020" --assets "F:\StudyAgentAssets"
node scripts/operations/postgres-backup.cjs verify --pg-bin "C:\PostgreSQL\17\bin" --bundle "F:\StudyAgentBackup\pg-20261020"
# 将 DATABASE_URL 改为全新空的恢复目标库后执行：
node scripts/operations/postgres-backup.cjs restore --connection-env DATABASE_URL --pg-bin "C:\PostgreSQL\17\bin" --bundle "F:\StudyAgentBackup\pg-20261020" --destination "F:\StudyAgentRecovered"
```

完成后核对 restore-receipt.json，配置新业务目录和资产目录，重新登录。清单证明文件完整性，不证明外部备份包的可信来源；工具用于受控的本地私有备份。恢复故障目录保留证据，不自动重试或删除。

## 验收

- `npm run test`：17个文件93项通过，默认跳过4项需真实PostgreSQL的测试。
- `node scripts/qa/run-postgres-tests.cjs`：PostgreSQL 17.11-5 实机4项通过，含真正 dump/restore、引用文件、不可变响应/计划、旧会话撤销、任务重新接管和旧结果拒绝。
- 故障注入：有效dump配上不一致预期版本，在实际恢复后核对失败；数据库保持 restoring，应用连接和再次备份均拒绝；门禁行缺失也拒绝。已有目标和损坏包拒绝。
- SQLite备份/恢复和版本3→4迁移通过；两种驱动均验证历史证据保留。全仓类型检查通过，API生产构建通过。本批未改变Web实现，沿用前批已构建版本。

证据：`doc/evidence/2026-10-19/postgres-runtime.json`（内部时间为本次真实运行时间）。完整资产备份仍在 `data/backups/full-20261019` 复制/校验，不能与本批小规模数据库恢复测试混为全库完成。性能、升级部署、数据管理、复杂题型和新增界面的浏览器验收等继续开发。

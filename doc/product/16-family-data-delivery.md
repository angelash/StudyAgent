# 家庭资料导出、删除与旧备份防复活

2026-10-20，接续 `926d744`。覆盖 AUTH-05、UX及OPS-03的一部分；完整产品目标继续进行中。

## 家长体验与接口

新增 `/parent/data`，从导航“资料管理”进入。家长可以查看绑定孩子的数据范围，选择单个孩子或本人账号与全部可见档案，核对密码后下载UTF-8 JSON。副本包含当前业务快照中的范围、原始作答、草稿、提示、评分修订、报告、指导版本、复测和本人/孩子的助教记录；保留原始响应和评分历史的区别。密码、令牌、一次性学习码、内部请求摘要、他人的私有对话不导出。原始共享题卷库独立管理，不混入家庭JSON。

导出请求按账号与请求键唯一；同键、同快照返回同一回执，数据变化后拒绝用旧键重新生成另一份文件。导出计数来自实际可携带记录，不计被过滤的凭证与他人私有对话。小时额度和密码复核限制重试频率。学生、教师、运营、管理员身份均不能借此接口代替家长导出或删除家庭资料。

永久删除前读取影响预览，展示作答、活动、计划、会话和总记录数。服务端将完整记录与监护关系生成指纹；新作答、资料或监护关系变化会使旧预览失效，要求重新核对。须输入准确档案昵称或本人登录账号，并再次核对密码。单个孩子只能由唯一有效监护人永久删除；共同监护档案阻止单方删除。

注销家长账号时删除本人账号、会话、绑定、邀请、学习码、本人收藏/私有对话及所授复核权限；同时删除本人独立管理的孩子及完整关联历史。共同监护孩子保留学习事实与复核版本，移除本人权限，历史署名替换为匿名。本人及本人签发的学生会话立即失效，其他监护人及其有效学生会话保留。精简删除回执仅保留标识、散列、操作与计数，不留孩子昵称或账号名。页面可保存回执。

接口在 `/api/privacy` 下：overview、account/students/:id 的 export、deletion-preview、delete。全部需要家长认证；export/delete 使用POST与严格请求结构。迁移5新增 `(actorId, requestKey)` 唯一约束，事务失败不留下部分删除。

## 旧备份恢复

删除只作用于当前业务库；用户已下载文件和离线副本需独立管理。`privacy-ledger.cjs` 可从当前SQLite或PostgreSQL导出精简的最新删除记录，支持校验。回执冻结当时删除/保留孩子的ID散列，恢复时不会依据旧快照的过期监护关系重新判断删除范围。

SQLite和PostgreSQL恢复新增 `--deletion-ledger`。先校验该文件，然后在恢复事务中应用全部删除、清理关联记录、匿名共享历史并保留回执，之后撤销旧认证/任务租约，最后开放恢复门禁。损坏记录在创建恢复目标前拒绝。备份早于删除操作时，运维必须提供最新记录；工具无法凭旧快照推断备份之后发生的删除。应将删除记录与备份分开保管，并按数据保留策略销毁过期备份。共享档案在备份时点之后新增的事实或监护关系，仍需相应备份/事件资料才能恢复。

恢复应用删除记录复用API编译后的同一关联注册表，避免两套删除逻辑分叉；执行恢复前须完成API构建。典型命令（目标文件/目录必须不存在；PostgreSQL密码通过环境设置）：

```powershell
npm run build --workspace @study-agent/api
node scripts/operations/privacy-ledger.cjs export --data-dir "F:\StudyAgentData" --destination "F:\StudyAgentDeletionRecords\20261020.json"
# PostgreSQL来源改用 --connection-env DATABASE_URL
node scripts/operations/privacy-ledger.cjs verify --ledger "F:\StudyAgentDeletionRecords\20261020.json"
node scripts/operations/backup.cjs restore --bundle "F:\StudyAgentBackup\20261019" --destination "F:\StudyAgentRecovered" --deletion-ledger "F:\StudyAgentDeletionRecords\20261020.json"
# PostgreSQL同样向postgres-backup.cjs restore追加 --deletion-ledger
```

## 验收与边界

默认完整回归99项通过，PostgreSQL4项实机通过；全仓类型检查、API与Web生产构建通过。新增6项覆盖权限、导出原始事实/修订、秘密过滤、独立快照幂等、密码/名称/陈旧预览、完整关联删除、共同监护、账号注销、立即失效、真实应用重启和旧快照恢复。SQLite真实恢复删除24条旧业务记录，保留共享孩子原始表达与匿名历史；PostgreSQL原生dump/restore中也应用删除记录并核对不存在的响应。修改删除清单后恢复拒绝，未创建目标目录。

证据：`doc/evidence/2026-10-20/privacy-runtime.json`；PostgreSQL见 `doc/evidence/2026-10-19/postgres-runtime.json` 的实际运行时间与标记。可用 `node scripts/qa/run-privacy-tests.cjs` 在构建后重跑隔离样本。

新页面已构建，真实浏览器交互待验证，不能以构建通过代替360/768px和键盘验收。该流程为家庭账号；教研/运营内容账号的注销、后续学生附件的二进制携带与物理清理、完整资产备份恢复、性能、部署和复杂题型继续推进。当前尚无学生附件上传入口，因此本批没有将不存在的上传文件冒充已清理。所有新增个人数据集合须登记关联规则，并扩充备份、导出与删除验收。

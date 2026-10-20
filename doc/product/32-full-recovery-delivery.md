# 全量资产恢复、旧库升级与当前学习流程验收

2026-10-20，接续 `76425eb`。覆盖 ASSET-01/02、CONTENT-04、OPS-01/03、QA-01 的本次恢复范围。完整产品目标仍在进行中。

## 恢复对象和独立核验

源备份现为 `I:\StudyAgent-backups\full-20261019`，2026-10-20 从 `F:\workspace\github\StudyAgent\data\backups\full-20261019` 跨盘迁移，标识 `ceee8518-e5b8-460e-aeb4-f61d95197441`，清单 SHA-256 为 `fe427cf2873fcebfbce8f0b7a80507822fa90679c821fd3d8feb63856b62dacc`。这是较早存储版本3的合成QA业务库和完整迁入资产，不是当前真实家庭数据的备份。

恢复目录为 `E:\StudyAgentQA\full-restore-20261020`。备份、源资产和恢复目录均保留。恢复工具核验396,147个文件，共44,626,015,355字节；其中396,135个资产文件，44,615,691,928字节，另由独立Python实现逐文件SHA-256核验，0错误。业务库因认证撤销与任务隔离会发生有意变更，不与源库逐字节相等。

恢复时新增撤销16个会话；结合此前已撤销的会话，全部19个旧登录会话保持撤销。恢复后没有恢复任何旧明文令牌或改动原账号密码。

## 旧业务事实与实际读取

`scripts/qa/verify-full-restore-runtime.cjs` 只接受此已核验的合成恢复对象。首次启动前保存19组旧记录的ID及body哈希基线；在存储版本3→8升级、当前代码启动、真实HTTP读取、新家庭写入与两次重启后，再逐条比较原记录，均未修改或丢失。

保留的旧事实包括13个评测会话、26条作答、15版报告、4个原因假设、12份计划、9版计划修订、5次训练与7条训练回答、提示、学习范围、评分修订、复测排期、反馈、助教会话和消息、上传、原页及处理产物。新代码可经HTTP读取全部13次评测的最新报告、12份计划和5次训练；这不表示旧报告已按新诊断规则重算。

7份处理产物经HTTP读取并与原始SHA-256和字节数核对，2份源上传文件独立核验。新管理员不能取得其他账号的上传入口，保持原所有权限制。

## 恢复资产与新家庭学习

生产模式进程显式使用恢复目录中的业务库和资产根目录，没有回退到开发目录。真实目录检索分别返回结构完整、部分结构与PDF卷；部分卷保留缺题位置，PDF卷保留文档形态。恢复盘上的1,316,398字节PDF经授权HTTP读取，并与目录中的SHA-256一致。原卷没有因此被发布到家庭练习库。

以正式CLI引导独立QA管理员，通过注册、受控学习码建立家长和受限学生身份。新家庭完成进度确认、冻结蓝图、评测草稿、重启续答、正式报告、学生原题证据读取、无模型密钥时的规则指导、计划确认、5题训练和1/3/7/14日复测排期。未到期复测仍被拒绝。第二次重启后，报告、训练完成状态、排期和复盘指纹保持一致；该即时流程不冒充真实跨日保持测量。

## 恢复模型

`scripts/qa/verify-processing-models.py` 直接使用恢复盘资产执行手写ONNX和Qwen CPU离线审阅。手写输出独立解码、核对哈希及大小；审阅生成非空建议。两者均保存 `reviewRequired=true`、`verifiedCorrect=false`，不进入教学评分。收据包含实际资产路径、执行环境和处理脚本哈希。修正验证器对Windows `SYSTEMROOT` 环境变量大小写的白名单匹配，子进程仍不继承云端密钥。

## 证据与复跑

- `../evidence/2026-10-20/full-assets-backup-verification.json`：原完整备份核验。
- `../evidence/2026-10-20/full-assets-restore-receipt.json`：396,147文件恢复收据与认证撤销。
- `../evidence/2026-10-20/full-assets-independent-verification.json`：396,135资产的独立核验。
- `../evidence/2026-10-20/full-assets-application-runtime.json`：旧库升级、原始事实保留、HTTP和两次重启。
- `../evidence/2026-10-20/full-assets-processing-models-runtime.json`：恢复模型实际执行与来源。

```powershell
node scripts/qa/verify-full-restore-runtime.cjs E:\StudyAgentQA\full-restore-20261020 doc/evidence/2026-10-20/full-assets-independent-verification.json data/qa/full-restore-runtime-rerun.json
python -X utf8 scripts/qa/verify-processing-models.py --application F:\workspace\github\StudyAgent --assets E:\StudyAgentQA\full-restore-20261020\assets --directory E:\StudyAgentQA\full-restore-models-new-run --evidence data/qa/full-restore-models-rerun.json
```

应用专项会创建新的隔离合成家庭，不重置原数据。模型输出目录必须是尚不存在的新目录。没有重新全盘复制或重复396,135文件哈希任务。

本轮应用代码仍是 `76425eb`，其193项默认回归、6项PG实机及构建结果见前一交付；本轮验证脚本另经语法检查和上述实际执行。教材全面对齐、逐点测量素材深度、浏览器和52项最终需求交叉验收仍待推进，不把完整资产恢复等同于产品整体完成。

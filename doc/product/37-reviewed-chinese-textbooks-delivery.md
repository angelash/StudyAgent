# 小学语文真实教材目录与进度接入

2026-10-20，接续 `f51e4fa`。对应 SCOPE-01/02/03、KG-01/03、ASSET-01/03、OPS-02。原计划 M00–M10 保持不变，本阶段补齐真实目录与版本边界。

## 当前可用范围

一年级至六年级语文上下册共12册已对照公开列出的目录预览逐页核验，收录108个章节分组、558个目录项，其中523个教学或活动项、35个附录项；96个组合课子标题保留在父课内。附录分组是本地整理标题，数据中明确标记；未印章节页码的分组使用首个目录项页码，并记录这一依据。目录项采用稳定本地标识，不冒称来源中的原节点ID。

当前登记仍为448册：数学184、语文12、英语252。具有章节的由100册增至112册；其他436条教材记录逐对象与本阶段前版本核对保持一致，其中336册仍缺章节。语文修订版中的《彩虹》《去外婆家》《数星星的孩子》《快乐的小河》等按本次原图录入，没有套用旧教材目录。

可版本化资料为 `resources/curriculum/reviewed-textbook-chapters-v1.json`，生产登记为 `resources/curriculum/textbooks-v1.json`。核验方式明确写为开发助手对照原图，不冒充用户、教师或教研人员审核。目录核验不批准任何课时到知识点的映射，也不声明完整教材正文或教学资源已取得发布资格。

## 产品行为

- 家长和学生端显示课名、印刷页码、略读标记和组合课内容；组合课子标题不能单独勾选，附录只供查阅。
- 未完成知识对齐的教材默认进入“按已学知识点”确认，可切换查看真实课时目录；已选课时仍保留未对齐缺口。
- 教研端保留目录核验说明、课时页码和组合课详情，附录不能独立映射。候选映射不能进入评测。
- 修复同年级跨学期映射越过范围门禁的问题。保存时拒绝错误学期；旧映射的知识定义失效或超出本册学期后，课时详情、可用数量和范围解析均排除它，提示重新审核。
- 每册版本绑定该册核验资料。目录补充后已有映射需匹配新版本，旧评测及已确认范围继续保留原教材版本、课时名称和映射快照。

新增界面通过类型检查和生产构建。浏览器仍受既有Runtime终止要求阻断，本阶段没有执行或声称页面、触控与键盘旅程验收。

## 来源采集与恢复

私有来源位于 `data/assets/textbook-sources/public-v1`。仅请求既有公开登记身份的精确详情JSON，以及详情明确列出的页码映射和前部公开预览地址。采集12份详情、12份映射及每册Slide3–9共84张JPG；108份来源共60,421,692字节。只转录目录名称、层级与页码，不复制正文至产品。

详情中列出的两个PDF地址各返回401一次后停止；没有使用凭据、切换主机、重试受限PDF或从图片重建整书。公开预览单独按详情所列地址采集，保留“仅供个人学习使用，未经授权不得另做他用”的来源边界。图片、OCR和联系图均留在本地私有目录，不随Git提交或向学生发布。

所有原文件按SHA-256存为不可变blob，各次采集清单也独立保存。当前清单哈希为 `c66d5cb39b709a4d0079faada0957f537a093c74c5878857e53a015a17a0fdef`；离线重跑字节不变。全部120个blob独立哈希核验，84张JPG实际解码通过；当前索引加blob共121个文件、60,875,661字节。

新增来源单独经过正式SQLite备份/恢复工具及逐文件独立读回哈希核对，121文件全部通过，同时恢复合成业务库并撤销3个旧登录会话。这是新增来源的独立恢复证据，不能将其并称为此前396,135资产历史全量备份已经包含的新内容。

## 重建与验证

重建不再依赖原型工程绝对目录，默认复用现登记中已留存的年级/学期白名单标签。旧 `--source` 入口仍兼容。构建只接受来源完整、哈希一致、逐页核验的目录资料；OCR、未核验或部分目录不自动升级为available。写入使用同步落盘和原子替换，失败保留原登记。

```powershell
python -X utf8 scripts/assets/capture_textbook_sources.py --subject chinese --offline
python -X utf8 scripts/assets/build_textbook_registry.py
python -X utf8 scripts/assets/audit_textbook_sources.py --output data/qa/textbook-chapters-assets-rerun.json
python -X utf8 -m unittest discover -s scripts/assets -p 'test_*textbook*.py' -v
node scripts/qa/verify-textbook-chapters.cjs data/qa/textbook-chapters-runtime-rerun.json sqlite
node scripts/qa/verify-textbook-chapters.cjs data/qa/textbook-chapters-pg-runtime-rerun.json postgres
```

14项Python回归通过，覆盖凭据/地址/目录穿越拒绝、缓存与不可变清单、哈希篡改、来源引用替换、组合课层级、无旧工程重建、旧册保留和错误审核状态拒绝。教材与诊断聚焦26项通过；默认全量249项通过、0失败，6项PG专项默认跳过，该6项另行实机全部通过。contracts/API/Web生产构建及全仓类型检查通过。源码打包安全回归3项通过、1项依赖显式打包参数的检查跳过。CI新增同样的目录工具回归与HTTP恢复步骤，远程CI尚未执行。

SQLite和PostgreSQL分别通过正式管理员引导、12册真实HTTP目录读取、候选/附录/跨学期拒绝、未覆盖课时保留、目录升级前后评测范围隔离与两次重启。合成课时映射仅存在于临时QA库，不能当作真实教材教研发布。生产注册/写入限流保持生效。

六份收据为 `doc/evidence/2026-10-20/textbook-chapters-{assets,regression,postgres-regression,runtime,postgres-runtime,python-regression}.json`。当前256点、4347道原创任务及237点素材深度缺口未因此变化。其余教材、真实课时映射、当前候选跨环境、浏览器和52项最终验收继续，持续目标保持active。

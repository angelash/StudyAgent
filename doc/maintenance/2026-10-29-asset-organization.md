# StudyAgent 资产目录：授权清理后的当前状态

2026-10-29。用户已明确授权执行前一轮建议的删除，包括 Qwen 及相应功能调整。GB 为十进制逻辑体积；分区可用容量是非原子实测，受文件分配和其他进程影响。

## 已执行结果

F: 主项目当前约 **46.81 GB**（全目录扫描，495,634 个文件，0 扫描错误，不跟随 5 个工作区依赖链接）。仍只有 `main` 和 `F:/workspace/github/StudyAgent` 一个工作目录。

本轮清单内删除 **104.63 GB** 文件，包括 E: 44.63 GB 的旧恢复演练；另清退了替换下来的运行构建和已经完成的数据库恢复测试。可用容量实测增加：**F: 60.60 GB，E: 45.64 GB**。源项目的当前 API / Web 构建已更新并重启；没有 Git 提交或推送。

- 旧 QA SQLite／WAL／SHM 共约 **32.12 GB** 已删除，包括 QA 根目录补查出的 60.94 MB 旧快照。活动 PostgreSQL 不在此类中。
- 旧 QA 构建、缓存、截图、trace、视频及生成输入已按清单清理。关键小报告、旧演练收据与输出保存在两个压缩证据包中，约 **22.89 MB**。
- F: 的 **10.83 GB 发布阶段备份**及 **0.21 GB 旧发布构建**已删除；先在 I: 建立了当前业务恢复点并执行隔离恢复验证。
- ChinaTextbook 的 **307 份重复 PDF、5.77 GB** 已删除；教材原卷改为引用 H: 原库。
- Qwen 目录 **3.10 GB** 和 **22 份重复去手写模型、0.97 GB** 已删除。
- E:/StudyAgentQA 的 **44.63 GB** 旧演练目录已删除。它与 F: 同一块物理硬盘；删除释放 E: 分区空间。
- PostgreSQL 的 **0.38 GB 下载压缩包**已删除；正在运行的工具与集群保留。

另将 QA 根目录 **229 个独有脚本、设计原稿及参考件、4.43 MB**收拢：228 个放到归并档案 `source-drafts/qa-root`，Hyperknow 原始公开脚本放到 `core-references/qa-root`。这些没有因清理测试数据而丢弃。

## 目前核心资料在哪里

- `data/assets/shijuanbao/media/`：**34.64 GB**，390,534 个试卷 PDF、扫描页和题图，保留。
- `data/assets/shijuanbao/` 中的原始响应／版本与审计库：**4.11 GB**，保留；其中 `archive.sqlite3` 约 4.08 GB。它们与已删除的 QA 业务快照用途不同。
- `data/assets/catalog.sqlite3`、`manifest.sqlite3` 及少量目录元数据：**1.49 GB**，保留。迁入 manifest 继续作为历史来源与验证收据；当前模型去重指向和停用记录另见 `data/assets/retention.json`，不篡改原始迁入证据。
- 逆向调查、提取、证据与处理工具：已交接至 `F:/workspace/rogue-prototype-lab/prototypes/`；StudyAgent 不再保留 `data/assets/research/`、`models/`、`tools/`。
- `data/gesp/`：**0.192 GB** 原题、原文、提取与教研资料，保留。
- `data/research/` 及归并 `core-references/`：约 **0.065 GB** 教材、公开教研与少量独有原始参考，保留。

归档／检索数量仍为 72,468 份试卷、885,203 条题目、306 本书、2,175 条资源；这些数量不代表正文和答案已经全部核实，也不改变来源使用边界。

## 教材：H: 留原 PDF，F: 留提取与索引

完整教材仓库仍为 **H:/ChinaTextbook，约 91.21 GB**，其中教材工作文件约 46.62 GB、上游 Git 历史约 44.59 GB。本轮没有删除上游文件或历史。旧 E:/ChinaTextbook 失效链接已不作为项目入口。

`data/assets/textbook-sources/` 从 **5.84 GB** 减至约 **73.99 MB**：两组 ChinaTextbook 提取文本约 13.11 MB，其余公开来源约 60.88 MB。307 份原 PDF 在版本化清单中以 `repositoryPath` 和固定 SHA-256 绑定到 `TEXTBOOK_BASE_PATH`；书籍 ID、原页映射、来源权限与已有学习记录保持。

API 读取器限制相对路径与真实路径均须处于指定原库根目录，并在服务原卷前核对哈希；原库不可用时明确报告不可用。导入脚本默认只创建提取与清单，避免重新复制 PDF。两套核验脚本也已支持原库引用。

删除后已逐件重新核对 **307 份原 PDF 的 SHA-256、页数和本地提取文本哈希**；部署代码另实际读取了语文、数学、英语原卷。

## 模型：只保留一份去手写原件，Qwen 功能已停用

去手写 ONNX、逆向模型和工具已交接至 `F:/workspace/rogue-prototype-lab/prototypes/re-shijuanbao-service/studyagent-handoff/` 等原研究项目。StudyAgent 只调用显式配置的 `STUDY_HANDWRITING_PROCESSOR`；未配置时新预览任务返回 503，不创建任务。

Qwen 权重已从 StudyAgent 主资产目录删除。导入页请求按钮已移除，旧 `POST /admin/processing/local-explain` 返回 **410**；历史任务不能重试，队列中的旧类型会以停用原因结束。Python 推理代码、烟测、安装依赖和 Linux 核验已去掉 Qwen／PyTorch／Transformers 要求；迁入工具也避免重新引入 Qwen 和相同 ONNX 副本。历史审阅文字可以继续读取。

原逆向项目 `F:/workspace/rogue-prototype-lab/prototypes/` 未清理；其中的原工程与模型历史副本，以及 I: 完整历史备份内的模型，继续保留。它们不属于 StudyAgent 当前运行依赖。

## I: 备份的内容，其他地方有没有

2026-10-29 最终状态：I 盘 403,040 文件、50,962,193,496 字节已逐文件核对去向并删除。其中 402,638 文件进入已核验云包，5 文件进入云端补充包，378 文件有研究正本，17 文件为可再生缓存，1 个有效私密配置和 1 个配置模板保留在本机。没有未归类项。

**原有 400,419 个载荷文件中，400,418 个已找到相同字节的其他副本；只有一个约 9.51 MB 的旧 QA 数据库，在本次核查的位置未找到相同副本。** 备份 manifest／收据等少量元数据另计。

- 原始试卷媒体、响应库、检索目录和研究资料：主体在 F: 主项目 `data/assets/`。
- GESP：在 F: `data/gesp/`。
- ChinaTextbook 原 PDF：在 H:/ChinaTextbook；提取文本在 F: 对应 `textbook-sources/`。
- 去重模型：同字节可定位到 F: 当前保留模型；Qwen 等已退出 StudyAgent 的模型还在 F: 原逆向项目。
- 旧导入测试材料及处理收据：少量位于本次保留的小型证据包。
- 未找到其他相同副本的是 `full-20261019/database/study-agent.sqlite3`，9,510,912 字节；它是 schema 3 / revision 85 的旧合成测试业务库，不是当前业务。

核查范围是 F: 主项目、H: 原教材库、原逆向模型工程与保留证据包，并非对所有硬盘任意目录做全盘内容检索。详单为 `backup-overlap.jsonl.gz`，汇总为 `backup-overlap-summary.json`。

I: 的价值是 **Kingston 独立物理硬盘上的恢复副本**，并非主体资料只存在这里，因此保留原完整备份。原有 **400,425 个文件**（含清单／额外元数据）在清理后均存在、大小和修改时间与此前全量 SHA-256 验证时一致，0 缺失、0 差异。

最终云端另有 `current-business/` 恢复包，包含当前一致性业务库、代码与布局快照、教材提取／公开来源和教研资料增量。业务库已从下载回读包在独立目录恢复，quick_check、记录数、revision 和内容哈希均通过；没有演练整机重建。完整教材原卷仍以 H:/ChinaTextbook 为本机主库，云端教材原库另作离机恢复。

## 运行状态、恢复索引与验证

- 当前业务库及运行文件约 **0.132 GB**，正式 API / Web 构建约 **0.350 GB**，继续使用主目录；当前依赖约 0.729 GB、Git 约 0.948 GB 保留。
- PostgreSQL 工具约 **1.00 GB**，独立 QA 集群约 **0.563 GB**，进程仍在运行。其他图像工具环境约 0.063 GB 保留。
- **401,169 个应保留原始文件**与同日基线大小／mtime 一致，0 异常；主动删除的副本、说明文件和活动 WAL／SHM 另列。
- 部署前后业务库 **89,862 条记录、revision 186** 的规范化内容哈希一致。API ready、登录页、导入页均 HTTP 200。
- 教材与停用入口针对性测试 **14 项通过**；归并恢复测试 **8 项通过**；小学教材清单回归 **1 项通过**。去手写模型实际推理及输出哈希核对通过，不据此声称擦除准确率。
- 外网登录页与本机登录页字节哈希一致；外网 API ready 返回 200 / ready，确认原入口仍服务新版本。
- 编译后 API 在隔离 HTTP 验证中返回 **410**，没有创建任务；首轮测试夹具事务使用错误与后续修正分别留存，没有覆盖失败记录。
- 原 32,542 个归并对象中：**5,196 个由 Git 保存、37 个保留本地、27,309 个旧 QA 对象按授权删除**。不可恢复的对象明确标记为 `deleted` 并绑定删除收据；工具不会再把它们宣称为可恢复。原始来源清单继续保留。

当前目录入口：[data/README.md](../../data/README.md)、[assets/README.md](../../data/assets/README.md)、[归并分类入口](../../data/maintenance/2026-10-29-consolidation/objects/CATALOG.md)。本轮证据位于 `data/maintenance/2026-10-29-authorized-cleanup/`，主要文件为 `delete-plan.json`、`deletion-receipt.jsonl`、`verification.json`、`textbook-*-final.json`、`recovery-point-verification.json`、`independent-backup-after.json` 和 `backup-overlap-summary.json`。全量当前目录扫描保存于 I: 当前恢复点的 `verification/`。

## 自动审批拦截的辅助清理

自动审批先拦截了包含临时验证数据与停止 QA 登记的辅助命令，随后也拒绝了仅对三个确切文件执行的非递归删除，只返回 `blocked by policy`。后续在最终云端恢复和业务恢复证据通过后，**83.52 MB 验证数据库／部分重复计划证据**按原大小与 SHA-256 再次核对并删除，回执见 `data/maintenance/2026-10-29-cloud-archive/validation-artifact-retirement.json`。**8 条已停止的旧 QA PM2 登记**保留为历史登记，不是运行进程。对应目标和早期拦截记录仍见 `auxiliary-cleanup-plan.json`、`policy-block.json`。

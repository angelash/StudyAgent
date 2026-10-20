# 依赖安全与运行入口交付

2026-10-20，接续媒体作答提交 `fd64aa0`。覆盖M01依赖安全、UX-03本地资源和M10构建/运行门禁；完整产品验收继续进行。

## 改动

`npm audit`从22项（6 critical、9 high、4 moderate、3 low）降到0项。更新Next 16.4.2、Vitest 4.1.11、Sharp 0.35.5、MathLive 0.111.1、KaTeX 0.19.0及相关传递依赖；固定PostCSS和esbuild安全版本。没有使用强制跨版本修复命令。Node运行基线为24.13以上的24系列，npm为11系列。

Next升级后实际构建发现 `--env-file` 被传入构建worker的 `NODE_OPTIONS`，Node拒绝启动。统一Web启动入口使用 `process.loadEnvFile` 读取根配置，开发与生产构建使用已验证的webpack路径，构建和启动均已重新执行。

公式编辑器从锁定的MathLive包生成本地字体、许可和哈希清单，关闭可选远程声音，保留编辑器加载失败时的文字输入。生成的20个字体无需CDN；运行检查核对每个HTTP响应的字节与哈希。生成资源不重复提交Git，由prebuild/predev恢复。

未被领域存储使用的Prisma脚手架原样归档到 `resources/legacy/prisma`；移除其安装依赖和可误执行的旧种子命令。SQLite/PostgreSQL当前迁移仍在应用启动时执行。README已按真实实现重写，区分已实现路径、资产统计和待验收项目。

新增GitHub Actions配置，安排Node24上的安装、审计、构建、测试、类型检查及Python审计工具回归；另设隔离PostgreSQL16数据库运行迁移/恢复测试。恢复测试的客户端工具路径可用 `STUDY_TEST_PG_BIN` 设置。GitHub Ubuntu 24.04 与 PostgreSQL 16 已完整远程通过（run 39500754720），本机 PostgreSQL 17 实测另行保留。

## 本机验证

- 升级后的 `npm test`：120通过，4项PG测试默认跳过。
- `npm run lint`、`npm run build`：通过。
- PostgreSQL17专用QA集群：4项实机测试通过，包含权限撤销、任务租约、API重启及媒体恢复/删除记录。
- Python结构敏感审计工具：2项回归通过。
- `npm audit`：0项。此结果仅涵盖当时npm已登记的依赖漏洞，系统FFmpeg、Python环境和操作系统需各自维护。
- Web13000生产启动成功；5页、14脚本、12样式文件、20字体HTTP核验通过。未操作浏览器，不计交互与视觉验收。

机器证据：[依赖与检查](../evidence/2026-10-20/dependency-security-runtime.json)、[PostgreSQL](../evidence/2026-10-20/postgres-dependency-runtime.json)、[Web资源](../evidence/2026-10-20/web-dependency-runtime.json)。HTTP资源检查可重跑 `node scripts/qa/verify-web-delivery.cjs <本地URL> <证据路径>`。

## 剩余验收

浏览器此前返回操作结果未知并要求新的用户指令，未擅自重试；本阶段的公式编辑与既有待验收新界面仍需真实浏览器验证。全量资产备份恢复、并发扩展与性能、完整教材映射、新环境部署和逐需求交叉验收继续推进。依赖审计通过不等于安全或产品目标全部完成。

## 2026-10-21 / Linux CI 文档处理器依赖

远端 Ubuntu 24.04 回归发现，两个教材 PDF 导入集成用例在真实调用 `ProcessDocument.py` 时失败，原因是 CI 仅安装 Node 与 FFmpeg，没有安装 PyMuPDF。Windows 本地全局 Python 已预装依赖，所以此前本地回归未暴露该跨环境缺口。

CI 现通过独立 `scripts/processing/requirements-ci.txt` 安装 PyMuPDF 与 Pillow，只覆盖确定性的文本型 PDF 测试路径；生产环境仍使用包含 OCR、ONNX 和本地模型依赖的 `requirements.txt`。这样既让真实 worker 走完整上传、任务租约、页面渲染、候选生成和事务发布路径，也避免为两个文本 PDF 用例安装整套模型栈。

本机使用同一最小依赖目标复跑两项教材导入测试通过，远端 Ubuntu 的完整 Verify 随后也通过。跨平台 CI 收据见 [CI运行](../evidence/2026-10-21/ci-verify-runtime.json)。

## 2026-10-21 / 全课程 QA 聚合限流

GitHub Ubuntu 运行器在完整逐点验证组审计中，以约两分钟高于本机的速度跑过 3000 次回环 IP 请求，触发聚合计数的 `429`。这证明生产限流生效，但原 QA 脚本没有区分“聚合测试流量”和“单用户生产额度”。

请求 IP 每分钟上限现可通过 `STUDY_RATE_LIMIT_IP_PER_MINUTE` 显式配置，默认仍为 3000，允许范围 1～1000000，非法值直接拒绝。全课程验证脚本只把本进程的聚合 IP 上限设为 100000；单用户读写、AI、登录和学习码的正式额度保持不变。

修复后完整本机审计通过：258 个知识点逐点完成，12323 条题目与测量映射升级、184 条人工量规复核旅程、5 次重启和内容升级两次重启全部通过，无响应失败。收据见 [聚合限流回归](../evidence/2026-10-21/verification-groups-ci-rate-limit.json)。

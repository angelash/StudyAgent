# Linux 源码交付与同站 HTTPS 部署

2026-10-20，M10 阶段。部署路径为 PostgreSQL、独立 API / worker / Next 生产进程和 nginx 同站 HTTPS。本机 Ubuntu 24.04 / WSL2 的隔离部署已有实际运行证据；全范围目标仍以需求逐项验收为准。

## 交付内容

- `scripts/operations/package-source.py`：生成私有源码包、逐文件 SHA-256 清单及外部回执。排除真实 `.env`、业务数据、恢复资产、依赖和构建缓存；拒绝链接、路径逃逸和覆盖既有输出。资产按独立备份恢复，源码包不依赖原型工程路径。
- `scripts/qa/verify-linux-release.py`：先独立核对包和全部文件，再在新的 Linux 应用目录安装依赖、审计、构建、类型检查、运行测试、验证 SQLite 管理员引导/重启/故障和 Next 生产 HTTP 资源。每步保留日志和失败状态。
- `scripts/qa/verify-linux-deployment.py`：创建自己拥有的 PostgreSQL 集群与非超级用户应用账号；启动独立 API / worker / Web / nginx，验证 TLS Cookie、学习闭环、4MiB 分块、Range、任务与草稿重启、真实迁入原卷及 OCR。结束后停止自建进程和集群。使用一天的本地 QA 证书，只给验证客户端信任，不改主机证书库。
- `scripts/qa/verify-processing-models.py`：在指定 Python 环境实际运行已迁入的手写预览和离线审阅模型，独立核对输出文件与人工审核标记；不将模型能运行等同于教学准确。
- `resources/deployment/`：生产环境样例、三个 systemd 服务和 nginx 配置。API 默认只绑定 `127.0.0.1`；确需局域网直连时显式设置 `API_HOST`。端口拒绝空值、0、非整数和超范围值。

生产模板不包含可用账号、证书或数据库密码。源码包明确记录 Git 基点、未提交文件和逐文件内容指纹；本次候选包含用户原有教研页面改动，以验证实际工作区，但不把该用户文件纳入本任务提交。

## Ubuntu 部署步骤

以下为可审阅的部署命令，未在当前主机安装全局服务。推荐 Ubuntu 24.04、Node 24.13+ 的 24 系列、npm 11、PostgreSQL 16+ 和 Python 3.10+。运行记录中的确切版本见 `doc/evidence/2026-10-20/linux-native-dependencies.json`。

1. 创建专用系统用户 `studyagent`。把核验的源码解压到 `/opt/studyagent/current`，Node 放在 `/opt/studyagent/node`，独立资产恢复到 `/srv/studyagent/assets`。应用进程只读源码和资产，业务库及处理输出写入 `/var/lib/studyagent`。不要将原始研究资产映射为 nginx 静态目录。
2. 安装系统 `python3-venv`、`ffmpeg`、`nginx` 和 PostgreSQL 客户端；部署自己的 PostgreSQL 服务或连接已有授权数据库。以管理员建立独立、非超级用户且拥有自己数据库的应用角色。不要给应用创建其他数据库或管理其他角色的权限。
3. 创建 Python venv 并安装处理依赖。CPU 环境先装 CPU torch，可避免拉入无用的 CUDA 依赖：

   ```sh
   python3 -m venv /opt/studyagent/venv
   /opt/studyagent/venv/bin/python -m pip install --index-url https://download.pytorch.org/whl/cpu 'torch>=2.6,<3'
   /opt/studyagent/venv/bin/python -m pip install -r /opt/studyagent/current/scripts/processing/requirements.txt
   ```

4. 将 `resources/deployment/application.env.example` 复制为 `/etc/studyagent/application.env`，设置真实站点、数据库连接和工具路径。文件由 root 管理、组 `studyagent`、权限 `0640`；数据库密码按 URL 规则编码。`STUDY_ASSET_ROOT` 指向完整迁入资产，`STUDY_DATA_DIR` 指向当前业务文件目录。AI key 可空，规则评测与计划可独立使用。API 中禁用内嵌 worker，由独立服务接管持久队列。
5. 在源码目录安装和构建。构建进程需能读取部署环境，`NEXT_PUBLIC_API_BASE_URL` 必须为空，使网页请求同一站点的 `/api`。该值在构建时写入浏览器包，更改它需要重新构建：

   ```sh
   export PATH=/opt/studyagent/node/bin:$PATH
   npm ci
   node --env-file=/etc/studyagent/application.env node_modules/npm/bin/npm-cli.js run build
   ```

6. 准备持久目录和 Web 缓存。源码和 Python 依赖可由 root 持有；应用仅需下面两个写入位置：

   ```sh
   install -d -m 0700 -o studyagent -g studyagent /var/lib/studyagent
   install -d -m 0750 -o studyagent -g studyagent /opt/studyagent/current/apps/web/.next/cache
   ```

7. 在专用账号的受控终端，通过环境变量 `STUDY_ADMIN_PASSWORD` 执行一次管理员引导：

   ```sh
   node --env-file=/etc/studyagent/application.env apps/api/dist/apps/api/src/cli.js create-admin <管理员登录名>
   ```

   不将密码放入命令参数、仓库或服务样例。创建完成后从该终端环境清除引导密码。已有普通账号不会由此升级。
8. 把三个 `.service` 文件安装到 systemd；按实际路径调整后检查，再启动 `studyagent-api`、`studyagent-worker`、`studyagent-web`。模板使用专用用户、有限写入目录、私有临时目录、失败重启与优雅停止。查看 `journalctl -u studyagent-api -u studyagent-worker -u studyagent-web` 和 `/admin/analytics` 的汇总状态。
9. 配置合法域名和有效 TLS 证书，把 nginx 样例中的域名/证书路径替换，执行 `nginx -t` 后启用。模板将 HTTP 重定向到 HTTPS，保留流式 API 响应和 Range；上传上限 8MiB，可容纳 4MiB 管理导入分块。转发来源头由代理覆盖，API 只信任自己配置的代理地址。
10. 由 HTTPS 入口检查登录、`/api/health`、`/api/ready`、评测与训练、上传、任务处理和原卷预览。独立 worker 使用同一数据库、业务文件目录、资产目录和版本的源码；服务启动会执行已登记迁移。持久限流额度跨 API 实例共享。

可直接本地使用 SQLite 部署：改为 `STUDY_STORAGE=sqlite`，保留同一业务文件目录，API / worker 共享该目录。跨主机、多副本部署使用 PostgreSQL；共享业务文件和资产需要一致、受控的存储路径。当前领域集合冷启动仍加载到内存，容量和并发范围见 `22-concurrent-learning-delivery.md`。

## 升级、备份和回退

升级前以正在使用的存储驱动创建一致性业务备份，并保存对应业务媒体和最新删除记录。原始资产另有全量备份，不要把较早合成 QA 库恢复为真实家庭业务库。SQLite 操作见 `14-recovery-postgres-delivery.md`，PostgreSQL 原生备份/恢复见 `15-postgres-backup-delivery.md`，删除记录见 `16-family-data-delivery.md`。

先在隔离目录恢复备份并用新版本完成迁移和关键流程，再停止旧 API / worker、替换源码并启动新版本。数据库升级后不能只替换旧程序实现降级；需要回退时，将升级前业务库和匹配媒体恢复到独立目标，应用最新删除记录并完成恢复门禁，核验后再切换。恢复会撤销旧身份会话并隔离旧任务租约，应重新登录。

## 当前运行证据与边界

- `linux-deployment-runtime.json`：隔离 PostgreSQL 和 HTTPS 真实流程通过，包含 4MiB 分块、原卷文字/扫描双分支、重启后 Cookie / 草稿 / 队列恢复；自建进程已停止。
- `linux-native-dependencies.json`：实际原生依赖版本。现有系统 PostgreSQL 可执行文件仅用于新建独立集群，没有启动/停止其他系统服务。
- `linux-release-runtime.json`：389文件的私有源码候选逐文件核验；全新目录 `npm ci`、依赖审计0项、完整构建/类型检查、132项默认测试及SQLite生产运行/故障检查通过。6项PostgreSQL专项在默认测试中跳过；其既有专项结果与本次独立PostgreSQL部署运行证据分开保存。源码包 SHA-256 为 `67adb9da0ec8c53bac50a6087fe43c099b43d00642882cab20c2177b564d07e1`。
- `linux-processing-models-runtime.json`：手写模型约1.47秒、Qwen CPU审阅约23.73秒实际运行通过。前者输出图片已独立核对哈希并解码，后者生成207字建议；两者均保留 `reviewRequired=true` / `verifiedCorrect=false`，未被用于教学评分。
- `linux-systemd-syntax.json`：systemd 255 对三个模板作路径/用户替换后检查通过；没有安装或启动系统unit。
- `scripts/operations/test_package_source.py`：Linux上4项安全边界回归通过，覆盖Git已跟踪的私密配置排除、可核对源码往返、内容篡改、外部源链接、tar路径逃逸/链接/重名拒绝。新增CI步骤尚未远程运行。
- 首轮发现 Next 构建被验证器强制设置为开发环境；第二轮修正后构建通过，测试揭示旧集成测试依赖开发机 E 盘教材和旧资产别名。已改成隔离合成教材和显式资产目录，重新执行全量验收。

本证据验证的是已有 Ubuntu / WSL2 主机上的全新应用和依赖目录，不称为另一台物理机器或远程发布验收。systemd 模板尚未安装到系统服务管理器；TLS 只在隔离进程中演练。真实浏览器、课程教材完整覆盖和 E 盘全量恢复仍按各自缺口继续推进，不由 HTTP 成功替代。

# 运行与存储

完整资产备份已在独立E盘恢复：396,135资产独立SHA-256核验通过，早期合成QA库3→8升级及当前学习流程/两次重启通过，恢复模型实际运行通过。原备份、源资产及恢复目录保留，旧认证已撤销。运行脚本只接受明确的已核验合成对象，边界和复跑命令见 [全量恢复交付](32-full-recovery-delivery.md)。此结果不代替当前真实家庭的最新备份。

评测结束或明确中止后，报告可展开当时原题、实际作答、分项表现、评分修订及支持/反证/自报依据。进行中与暂停状态的正式评分读取返回409，画像也不使用未结束会话。新诊断使用 `diagnosis-rules-v4`，基础/迁移支持合计至少四个不同题族；旧原始响应和历史报告保留原版本。规则与冻结观察见 [对照题组交付](33-verification-groups-delivery.md)，原题证据见 [事实与深层验证交付](31-diagnostic-evidence-delivery.md)。

评测范围页可开启按作答逐步核查顺序，并在预览中确认加入的先修基础。题量、范围与题组冻结，结束后可展开每步依据；提示/曝光/跳过等不能当独立对错。旧API不传 `adaptive` 保持固定，间隔复测必须固定。两库专项为 `node scripts/qa/verify-adaptive-routing.cjs <证据路径> sqlite|postgres`，详见 [逐步核查交付](30-adaptive-routing-delivery.md)。

错题本位于 `/student/today` 的“错题与思路”，支持知识点/标签筛选、收藏、步骤与反思便签、可恢复移除、原题复做、新题核查记录及打印稿准备。原题复做沿用训练和图片/录音路径，但不增加独立掌握样本；未结束评测不提前开放参考答案。生产SQLite/PG重启专项为 `node scripts/qa/verify-notebook.cjs <证据路径> sqlite|postgres`，详见 [错题本交付](29-notebook-delivery.md)。

原卷测量素材页为 `/admin/measurement`，从 `/library` 单题进入，需管理员或教师身份。来源、题面、媒体、评分和知识映射分别审核后才能发布，研究原卷与单题发布资格独立。运行 `node scripts/qa/verify-measurement-content.cjs` 验证生产模式SQLite；第三个参数 `postgres` 使用既有隔离QA集群。第四个参数 `real` 只验证迁入原卷候选与重启，绝不发布。详见 [原卷测量素材交付](28-measurement-content-delivery.md)。

现有256个原创知识点均含教学卡。执行 `node scripts/qa/audit-authored-curriculum.cjs` 可核查教学覆盖和逐点测量素材缺口；先构建contracts/API。旧库仅为精确未编辑的v1补卡，用户修改和草稿保留。教学覆盖与教材审核对齐、测量题族深度、标准化校准分别验收，详见 [教学交付](27-full-teaching-delivery.md)。

数位与退位等4点新增192道原创任务、16种明确结构，启动时幂等补充新题及映射；原3435题与既有编辑不改写。新增素材使用v2内容标识，表格或选项不同不会与同题干/答案碰撞。核对旧内容升级、学生完整核查与五次重启：`node scripts/qa/verify-verification-groups.cjs <证据路径> sqlite|postgres content-upgrade`。当前3627道任务、252点素材仍待补深，见 [测量素材交付](34-authored-math-probes-delivery.md)。

Node.js 24.13+（24系列）、npm 11、Python 3.10+。先执行 `npm ci`、`npm run build`。业务存储迁移随应用启动执行；Prisma早期脚手架已归档，不需要生成客户端。现有 `.env` 中的 AI 配置可继续使用，未启用AI时确定性评测不应受阻（降级功能随 M07 验收）。

默认本地模式自动建立 `data/study-agent.sqlite3`（SQLite WAL、完整同步写、事务与唯一约束）。配置 `STUDY_DATA_DIR` 可改变业务数据目录。`STUDY_STORAGE=postgres` 时读取 `DATABASE_URL`，自动应用已登记存储迁移（当前版本8）；需要运行中的 PostgreSQL。内存模式仅供隔离测试，生产模式拒绝它。

兼容注入名 `InMemoryStoreService` 目前仍由旧模块引用，运行时已使用请求隔离的数据库事务；`domain_records` 为具有唯一约束、版本和稳定顺序的领域文档表。原始全量题库使用独立索引库，不能塞入该兼容接口。并发写基线冲突返回409，调用方应重读后重试，不能盲目覆盖。

当前版本缓存只读快照，每请求仍核对数据库版本。显式查询只复制匹配记录，并登记内容和成员集合的读取依赖；直接数组访问保留整个集合检查。独立家庭可以合并提交，撤权、暂停、同一行修改和匹配集合变化仍返回409，调用方应重读核对。其他进程提交后仅重载变化集合，冷启动仍加载领域库。实现和8并发实测见 [并发学习交付](22-concurrent-learning-delivery.md)，早期读取基线见 [存储性能交付](20-storage-performance-delivery.md)。

管理员只在本机创建：在环境中设置 `STUDY_ADMIN_PASSWORD`（至少10字符），执行 `npm run admin:create --workspace @study-agent/api -- <principal>`。命令不记录密码，不升级已存在账号。普通账号通过 `/parent/login` 的“创建账号”注册。

浏览器会话使用 HttpOnly Cookie；网页不再将令牌存入localStorage。通过反向代理使用同站点部署；生产环境使用HTTPS。`CORS_ORIGINS` 是以逗号分隔的确切来源白名单（默认本地3000端口）；联调其他端口时需显式设置。API可用 `API_PORT` 改端口，Web可用项目启动参数指定端口。

`GET /api/health` 检查进程，`GET /api/ready` 检查存储请求上下文。SQLite备份恢复与PostgreSQL实机见 [恢复与PostgreSQL交付](14-recovery-postgres-delivery.md)，PostgreSQL原生备份恢复和数据库门禁见 [原生恢复交付](15-postgres-backup-delivery.md)。全量部署验收仍以M10为准。

教材元信息随代码位于 `resources/curriculum/textbooks-v1.json`。可用 `STUDY_TEXTBOOK_REGISTRY` 指定独立只读登记文件；没有登记文件时原创能力路径仍可用。启动时原创课程种子幂等补充，`STUDY_SEED_FOUNDATION=false` 可关闭；已编辑的同标识定义不会被种子静默覆盖。

家庭资料管理位于 `/parent/data`。旧备份恢复应同时提供最新的独立删除记录；生成和应用方法见 [家庭资料交付](16-family-data-delivery.md)。离线备份本身仍需按保留策略管理。

学生图片与录音作答位于 `STUDY_DATA_DIR/student-media`，必须随业务库备份。图片真实解码后校正方向并去掉EXIF，以PNG保存；录音需要PATH中的 `ffmpeg`、`ffprobe`，或设置 `STUDY_FFMPEG`、`STUDY_FFPROBE` 的绝对可执行路径，转成单声道16kHz WAV。缺少工具时音频题退出新选题，旧活动显示跳过提示。部署应固定、更新受支持的FFmpeg发行版；当前验证环境使用本机工具。单个原文件12MB、图片6000边长/2000万像素、录音180秒，两项解码并发上限；视频轨道与网络输入不接受。

上传分块、完成状态、响应绑定和清理任务一起持久化。清理worker与处理任务一样受 `STUDY_WORKER_ENABLED` 控制，可由独立worker接管。完成后删除原上传分块，保留规范化学习证据；未完成上传24小时后过期，活动中的未绑定文件7天后过期（保存在草稿中的完整文件保留），结束活动中未绑定文件24小时后过期。已绑定响应的证据不随此定时回收。家庭下载包包含JSON、规范化图片/录音与SHA-256清单，不包含原始EXIF或未传完分块；准备后两分钟内由同一登录会话下载一次，中断或重启后重新准备。

Web的 `prebuild` / `predev` 会从已锁定的MathLive依赖生成本地公式字体及许可，产物在 `apps/web/public/vendor/mathlive`。部署时应保留完整 `public` 目录。`scripts/run-web.cjs` 加载根目录配置，避免Next构建worker继承不支持的 `--env-file` 参数。CI门禁与本机升级验收见 [依赖安全交付](19-dependency-security-delivery.md)；配置文件存在不代表远程CI已运行。

请求和身份额度由数据库原子计数，超限429附 `Retry-After`。反向代理部署需用 `STUDY_TRUST_PROXY` 指定自己的代理IP/CIDR；默认忽略转发来源头。管理员可在 `/admin/analytics` 查看运行、任务与复核积压。请求统计仅当前进程，自启动累计；任务和学习计数来自持久库。具体额度、监控口径和故障演练见 [运行监控交付](21-operations-delivery.md)。

API 默认绑定 `127.0.0.1`，可通过 `API_HOST` 显式调整；`API_PORT` / `PORT` 必须为1–65535的整数。Linux生产使用同站点HTTPS、独立API/worker/Web进程及PostgreSQL，完整环境样例、服务模板、构建/管理员引导/升级与运行证据见 [Linux交付](23-linux-deployment-delivery.md)。Web的同站API地址需在构建时令 `NEXT_PUBLIC_API_BASE_URL` 为空；仅修改运行环境不会重写已有浏览器包。

课程定义可在 `/admin/curriculum` 导出及比较课程包；管理员确认后整批导入，单包最多8MiB/2,000点。教学资料有独立审核状态，新计划冻结批准版本。已有库只自动补充精确未编辑的v1原创教学定义，不覆盖用户编辑、较新版本或草稿。格式、冲突恢复、覆盖缺口和真实SQLite/PG重启证据见 [课程包交付](24-curriculum-package-delivery.md)。

新评测冻结知识定义，当前画像和保持测量只使用定义可核对的证据；目标/标准/先修变化会让题目映射退出选题，需教研重新审核。旧报告、已开始练习和原分保留，缺快照的旧报告不能直接建立新指导计划。边界及SQLite/PG重启证据见 [知识定义交付](25-measurement-definition-delivery.md)。


评测先预览题组，再确认开始：蓝图保存30分钟，开始后回执可安全重放；范围、定义、题目或曝光变化需要重新预览。评测支持暂停/恢复与提前结束，部分报告不把未答题计错。预览存入同一业务库并随导出/删除登记处理，无需新增独立服务。接口及SQLite/PG三次重启证据见 [评测蓝图交付](26-assessment-blueprint-delivery.md)。

原因核查传入 `hypothesisId` 时，服务端安排基础/迁移或目标/全部直接先修对照，冻结条件与依据；支持只选部分范围但显示其余缺口。完成报告单独统计实际独立观察，量规复核生成新版本。保持原因须通过到期复测核查，不支持当天换题替代。接口、缺口和两库重启证据见 [对照观察交付](33-verification-groups-delivery.md)。

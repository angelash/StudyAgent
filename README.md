# StudyAgent

围绕原子知识点建立的小学语文、数学、英语学习诊断与指导系统。学生按年级、学期、教材和已学范围完成评测；报告保留作答证据、掌握估计与不确定性，针对原因假设安排验证、指导、训练、间隔复测和家长复盘。

当前实现及证据见 [产品建设档案](doc/product/README.md) 和 [实施记录](doc/product/04-delivery-log.md)。完整目标仍在开发验收中，完成条件以 [开发计划](doc/product/03-development-plan.md) 为准。

## 已实现的主要路径

- 家长注册、监护绑定、教师授权与撤销、独立学生学习码和设备撤销。
- 课程进度、知识先修图、评测蓝图、断点作答、评分复核、证据报告与原因验证。
- 指导计划的确认、修订、暂停、每日训练、错题、间隔复测与前后复盘。
- 17类专用作答协议；图片和录音上传、恢复、规范化、授权读取及人工量规复核。
- 试卷检索、原卷与媒体查看、上传导入、PDF/OCR处理、候选审核与发布门禁。
- 教研对照素材缺口、年级汇总与齐备/待补筛选，按有效审核资格、不同结构和实际组题预算核查。
- 家庭资料下载与删除、持久任务、SQLite和PostgreSQL迁移、业务与媒体备份恢复。
- 助教绑定当前学习证据，模型不可用时返回明确的规则指导；确定性评分不依赖AI。

原创课程当前包含258个知识点、6686道任务，69点具有基础与迁移对照结构。现有一至四年级数学原创点的素材结构审计无缺口，最近补充五年级因数、倍数、质合数与公因数/公倍数的约束对照，见 [整除关系评测交付](doc/product/51-factor-multiple-delivery.md)。此前面积、角与统计的48幅原创图见 [四年级几何与统计交付](doc/product/49-fourth-grade-geometry-statistics-delivery.md)。平均数的对象与零记录已拆成独立子点，综合题分项只作为核查线索，独立题组才计入子点能力，见 [平均数原子诊断交付](doc/product/50-average-count-atomic-delivery.md)。已迁入的研究资料与题卷资产独立保存在 `data/assets`，学生可见内容受来源资格和教学审核门禁控制。资产总量、教材登记数、原创任务数均不能代替全教材教学覆盖或真实学生测量效度验证。

教研工作台现已呈现189点的有效素材缺口，并分别核对结构和四题组题预算，见 [对照素材工作台交付](doc/product/52-material-coverage-delivery.md)。

448册真实教材中112册已有章节，新增12册小学语文上下册的课名、页码和组合课层级；目录与知识点映射分别审核，旧评测保留原版本。来源、离线重建与两库运行证据见 [教材目录交付](doc/product/37-reviewed-chinese-textbooks-delivery.md)。

## 本地运行

需要 Node.js 24.13+（24系列）、npm 11。录音处理还需要 `ffmpeg` 和 `ffprobe`；PDF/OCR/模型处理使用 Python 3.10+，依赖见 `scripts/processing/requirements.txt`。不启用这些处理能力时，普通评测仍可运行。

1. 复制 `.env.example` 为 `.env`，按需配置；不要提交密钥。
2. 执行 `npm ci`。
3. 执行 `npm run build`，构建共享契约、API、Web和本地公式字体。
4. 执行 `npm run dev`，或分别运行 `npm run dev:api`、`npm run dev:web`。
5. 打开 `http://127.0.0.1:3000/parent/login` 创建家长账号。

默认API端口4000、Web端口3000。Web用 `NEXT_PUBLIC_API_BASE_URL` 指定API地址；同站点反向代理部署时设为空。自定义来源还需配置 `CORS_ORIGINS`。管理员使用本地 `admin:create` 命令引导创建，详见 [运行与存储](doc/product/05-running-and-storage.md)。

默认业务存储为 `data/study-agent.sqlite3`，重启保留学习数据；可用 `STUDY_DATA_DIR` 改目录。设置 `STUDY_STORAGE=postgres` 和 `DATABASE_URL` 后使用PostgreSQL并自动迁移。原始大题库使用独立索引。早期Prisma脚手架保留在 `resources/legacy/prisma`，不参与运行和安装。

## 生产运行与验证

执行 `npm run build` 后，分别运行 `npm run start --workspace @study-agent/api`、`npm run start --workspace @study-agent/web`。正式部署应设置 `NODE_ENV=production`、同站点HTTPS和持久目录。可将 `STUDY_WORKER_ENABLED=false`，另行运行 `npm run worker --workspace @study-agent/api`。

运行检查：`npm test`、`npm run lint`、`npm run build`、`npm audit`。默认测试包含真实SQLite和媒体处理；PostgreSQL实机测试须显式配置专用 `study_agent_qa` 数据库。健康与就绪地址为 `/api/health`、`/api/ready`。

备份恢复命令、独立删除记录和运行边界见 [运行与存储](doc/product/05-running-and-storage.md)、[PostgreSQL恢复](doc/product/15-postgres-backup-delivery.md)、[家庭资料](doc/product/16-family-data-delivery.md)、[图片与录音](doc/product/18-student-media-delivery.md)。数据库、作答媒体与原始资产均需纳入恢复演练。

已完成的资产全量恢复见 [独立恢复证据](doc/product/32-full-recovery-delivery.md)，混合运算的除法先修与旧记录升级见 [关系修订](doc/product/42-authored-relation-release-delivery.md)。当前仍需继续拆解细粒度知识点、编写独立探针并审核分项绑定，完成教材与课时审核映射、其余189点的测量素材深度、当前候选的跨环境复验、真实浏览器流程及52项需求交叉验收。规则估计尚无标准化常模，完整目标继续进行。

## 工程目录

`apps/web` 为Next.js界面，`apps/api` 为NestJS API与worker；`packages/contracts`、`packages/config`、`packages/ui` 提供共享契约、配置和界面组件。`resources` 保存版本化课程与历史资料，`scripts` 保存处理、资产、运维和验证工具；`doc/product` 保存需求、测量设计、计划及交付证据。

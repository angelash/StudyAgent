# StudyAgent

围绕原子知识点建立的小学语文、数学、英语学习诊断与指导系统。学生按年级、学期、教材和已学范围完成评测；报告保留作答证据、掌握估计与不确定性，针对原因假设安排验证、指导、训练、间隔复测和家长复盘。

当前实现及证据见 [产品建设档案](doc/product/README.md) 和 [实施记录](doc/product/04-delivery-log.md)。完整目标仍在开发验收中，完成条件以 [开发计划](doc/product/03-development-plan.md) 为准。

## 已实现的主要路径

- 家长注册、监护绑定、教师授权与撤销、独立学生学习码和设备撤销。
- 课程进度、知识先修图、评测蓝图、断点作答、评分复核、证据报告与原因验证。
- 指导计划的确认、修订、暂停、每日训练、错题、间隔复测与前后复盘。
- 17类专用作答协议；图片和录音上传、恢复、规范化、授权读取及人工量规复核。
- 试卷检索、原卷与媒体查看、上传导入、PDF/OCR处理、候选审核与发布门禁。
- 家庭资料下载与删除、持久任务、SQLite和PostgreSQL迁移、业务与媒体备份恢复。
- 助教绑定当前学习证据，模型不可用时返回明确的规则指导；确定性评分不依赖AI。

原创课程当前包含256个知识点、3435道任务。已迁入的研究资料与题卷资产独立保存在 `data/assets`，学生可见内容受来源资格和教学审核门禁控制。资产总量、教材登记数、原创任务数均不能代替全教材教学覆盖或真实学生测量效度验证。

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

尚待全量验收的项目包括完整教材映射、并发与性能、新环境部署、完整资产恢复及部分新界面的真实浏览器流程。规则估计尚无标准化常模，不能据此宣称全部产品化目标已完成。

## 工程目录

`apps/web` 为Next.js界面，`apps/api` 为NestJS API与worker；`packages/contracts`、`packages/config`、`packages/ui` 提供共享契约、配置和界面组件。`resources` 保存版本化课程与历史资料，`scripts` 保存处理、资产、运维和验证工具；`doc/product` 保存需求、测量设计、计划及交付证据。

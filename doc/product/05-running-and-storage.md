# 运行与存储

Node.js 24.13+，Python 3.10+。先执行 `npm ci`、`npm run prisma:generate --workspace @study-agent/api`、`npm run build`。现有 `.env` 中的 AI 配置可继续使用，未启用AI时确定性评测不应受阻（降级功能随 M07 验收）。

默认本地模式自动建立 `data/study-agent.sqlite3`（SQLite WAL、完整同步写、事务与唯一约束）。配置 `STUDY_DATA_DIR` 可改变业务数据目录。`STUDY_STORAGE=postgres` 时读取 `DATABASE_URL`，自动应用已登记存储迁移（当前版本3）；需要运行中的 PostgreSQL。内存模式仅供隔离测试，生产模式拒绝它。

兼容注入名 `InMemoryStoreService` 目前仍由旧模块引用，运行时已使用请求隔离的数据库事务；`domain_records` 为具有唯一约束、版本和稳定顺序的领域文档表。原始全量题库使用独立索引库，不能塞入该兼容接口。并发写基线冲突返回409，调用方应重读后重试，不能盲目覆盖。

管理员只在本机创建：在环境中设置 `STUDY_ADMIN_PASSWORD`（至少10字符），执行 `npm run admin:create --workspace @study-agent/api -- <principal>`。命令不记录密码，不升级已存在账号。普通账号通过 `/parent/login` 的“创建账号”注册。

浏览器会话使用 HttpOnly Cookie；网页不再将令牌存入localStorage。通过反向代理使用同站点部署；生产环境使用HTTPS。`CORS_ORIGINS` 是以逗号分隔的确切来源白名单（默认本地3000端口）；联调其他端口时需显式设置。API可用 `API_PORT` 改端口，Web可用项目启动参数指定端口。

`GET /api/health` 检查进程，`GET /api/ready` 检查存储请求上下文。业务备份恢复与PostgreSQL部署的完整运行演练尚列于M10，不能用本说明代替验收。

教材元信息随代码位于 `resources/curriculum/textbooks-v1.json`。可用 `STUDY_TEXTBOOK_REGISTRY` 指定独立只读登记文件；没有登记文件时原创能力路径仍可用。启动时原创课程种子幂等补充，`STUDY_SEED_FOUNDATION=false` 可关闭；已编辑的同标识定义不会被种子静默覆盖。

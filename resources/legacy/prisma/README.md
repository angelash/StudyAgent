# 早期Prisma脚手架归档

这里原样保留工程最初的关系表草稿与示例种子。它们没有被当前Nest运行时使用，示例管理员也不是有效的当前账号创建流程。`seed.ts.txt`仅作为历史资料保存，不可作为初始化脚本执行。

当前SQLite/PostgreSQL业务数据由 `apps/api/src/infrastructure/domain-database.ts` 管理并在启动时迁移，管理员由本机 `admin:create` 命令创建。移除未使用的Prisma运行依赖可避免安装其额外配置和合并工具依赖，也消除了旧生成/迁移命令对实际存储方式的误导。原文件保留，未改动现有数据库。

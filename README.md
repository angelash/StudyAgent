# StudyAgent

首轮实现聚焦小学数学闭环：

1. 家长/管理员账号密码登录
2. 学生档案创建与家长绑定
3. 数学教材导入、知识点、题目录入与发布
4. 入门评估
5. 本周训练计划、今日任务、提示与任务完成反馈
6. 家长端周报、掌握度热力图与风险提醒
7. 学生端和家长端悬浮助教
8. 管理员运营看板与 AI 质量分析

## 目录结构

```text
apps/web        Next.js Web
apps/api        NestJS API
packages/contracts 共享 DTO、schema、类型
packages/config    环境变量 schema
packages/ui        悬浮助教 UI 组件
```

## 运行方式

1. 复制 `.env.example` 为 `.env`
2. 安装依赖：`npm install`
3. 同时启动前后端：`npm run dev`
4. 或单独启动 API：`npm run dev:api`
5. 或单独启动 Web：`npm run dev:web`

默认端口：

- Web: `http://127.0.0.1:3000`
- API: `http://127.0.0.1:4000`

## 开发说明

1. 当前首轮 API 默认使用内存存储跑主链路，便于本地直接体验完整流程
2. Prisma schema、迁移和 seed 脚本已预留，托管 PostgreSQL 配置好后可逐步切换到真实持久化
3. AI 能力只走真实模型，必须配置 `OPENAI_API_KEY`
4. 悬浮助教对话会先调用本机 `codex --search` 做实时 websearch，再把检索结果交给大模型生成回答
5. AI 或 codex 检索失败时接口会直接返回明确错误，不再返回 mock / fake feedback
6. 使用助教前请确认本机 `codex` CLI 可执行且已完成可用认证或模型配置
7. API 与 Web 现在都会自动读取仓库根目录 `.env`

## 测试

1. API 集成测试：`npm run test --workspace @study-agent/api`
2. 全仓构建：`npm run build`

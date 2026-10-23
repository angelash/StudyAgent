# Windows 本地长期运行与自动恢复

本机开发和使用采用 PM2 守护 API、Web 和独立健康探针。PM2 负责在进程退出、异常停止或超过内存上限时自动拉起；健康探针每 30 秒请求 Web 首页和 `/api/ready`，连续三次失败时仅重启对应服务。Windows 登录任务保存当前 PM2 进程表并在登录后恢复，因此关闭终端或重新登录不会带走服务。

首次启动或代码更新后执行：

```powershell
npm run daemon:start
```

只重启现有构建时执行：

```powershell
npm run daemon:start:fast
```

常用运维命令：

```powershell
npm run daemon:status
npm run daemon:restart
npm run daemon:logs
npm run daemon:stop
```

Web 地址由根目录 `.env` 的 `WEB_PORT`/`PORT` 决定，API 地址由 `API_PORT` 决定；当前本机分别使用 `http://127.0.0.1:3217/` 和 `http://127.0.0.1:4217/api/ready`，以避开其他软件已占用的常规端口。本地浏览器包使用 `http://127.0.0.1:<API_PORT>`，避免 `localhost` 在 IPv6 与 IPv4 之间解析到不同地址。日志保存在忽略提交的 `output/daemon/`。

守护配置位于 `ecosystem.config.cjs`，探针位于 `scripts/operations/daemon-health.cjs`，启动与登录恢复脚本位于 `scripts/operations/`。`npm run daemon:status` 应显示 `study-agent-api`、`study-agent-web`、`study-agent-health` 均为 `online`；停止终端窗口不会影响这些进程。

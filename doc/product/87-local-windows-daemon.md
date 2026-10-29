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

Web 地址由根目录 `.env` 的 `WEB_PORT`/`PORT` 决定，API 地址由 `API_PORT` 决定；当前本机分别使用 `http://127.0.0.1:3217/` 和 `http://127.0.0.1:4217/api/ready`，以避开其他软件已占用的常规端口。`NEXT_PUBLIC_API_BASE_URL` 留空时，浏览器请求 Web 同源的 `/api`，Next 将请求转发到本机 `127.0.0.1:<API_PORT>`。外部域名只需映射 Web 端口；把该 HTTPS 来源加入 `CORS_ORIGINS` 后重新加载 API。切换浏览器 API 地址需要重建 Web，启动脚本保留 `.env` 中的设置。日志保存在忽略提交的 `output/daemon/`。

本机节点小宝使用原 `kingdom-server` 的 12 Mbps 名额（slot 1），将 `https://study-agent.iepose.cn` 映射到 `http://127.0.0.1:3217`。网页与 API 共用这个入口，因此 StudyAgent 只占一条映射。Kingdom 网页、API 和 Socket.IO 合到 `kingdom-web.iepose.cn`，使用唯一的 2 Mbps 名额（slot 10）；原 `kingdom-web` 的 12 Mbps 名额（slot 13）空出。

该转发实测统一把请求 `Origin` 改写为 `https://127.0.0.1:3217`，因此本机 `.env` 的来源白名单同时包含公开域名和这个确切的转发来源。直连 Web 的来源检查仍生效；外网转发后的 `Origin` 已不能用于区分原始来源，账户权限继续由已有登录会话和 Bearer 校验，Cookie 保持 HttpOnly、Secure、SameSite=Strict。PM2 配置显式传入来源白名单，避免重新加载后继续使用旧环境。原映射快照、本机环境备份和访问检查记录保存在忽略提交的 `output/remote-access/`。

守护配置位于 `ecosystem.config.cjs`，探针位于 `scripts/operations/daemon-health.cjs`，启动与登录恢复脚本位于 `scripts/operations/`。`npm run daemon:status` 应显示 `study-agent-api`、`study-agent-web`、`study-agent-health` 均为 `online`；停止终端窗口不会影响这些进程。

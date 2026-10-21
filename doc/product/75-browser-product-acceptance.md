# 浏览器产品验收

2026-10-21 新增可重复的 Chromium 产品旅程，补上“接口和源码通过、但真实浏览器流程没有自动门禁”这一缺口。测试使用独立 SQLite 目录、随机合成家长、正式本地 CLI 管理员和生产构建，不读取或修改默认家庭数据库。

当前本地结果 3/3 通过：

1. 首页在 360、768、1280 CSS 像素下可见，文档没有横向溢出，手机宽度可进入登录页。
2. 合成家长可以登录空家庭空间，填写孩子昵称与当前年级并成功建立学习档案。
3. 正式 CLI 管理员登录后被引导到运营页，并可进入知识点与教材映射教研工作台。

测试入口为 `npm run test:e2e`。启动器先设置同站 API 地址并完成全仓生产构建，再在独立目录创建管理员，最后让 Playwright 启动 API/Web 生产进程。首次安装本机浏览器使用 `npx playwright install chromium`；Linux CI 使用 `npx playwright install --with-deps chromium`。

本轮同时修复了 E2E 隔离风险：管理员 CLI 使用 `STUDY_DATA_DIR`，启动器现将同一独立目录同时传入 CLI、API 与 Web。此前一次迭代误写入默认库的单一合成管理员及对应引导事件已用精确 ID 清除；修改前数据库备份、完整性检查和范围证据位于 `data/qa/study-agent-pre-e2e-admin-cleanup-20261021.sqlite3`，该 QA 备份不进入 Git。

测试采用 `localhost:3107` 与 `localhost:4107` 的同站链路，符合应用当前的 `SameSite=Strict` 会话设计。生产部署应继续保持 Web/API 同站反向代理；若改为跨站域名，需要单独设计并验证认证传递，不能只放开 CORS。

本地原始收据为 [browser-product-acceptance-local.json](../evidence/2026-10-21/browser-product-acceptance-local.json)。自动化浏览器测试只证明列出的 Chrome 桌面内核流程；真实触屏、移动端录音权限、听辨、方言、噪声、辅助技术、学生/家长/教师现场使用与学习效果仍需外部验收，因此不把 UX-01～03 或最终心理测量效度标成完全通过。

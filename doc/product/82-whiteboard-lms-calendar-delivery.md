# 自由白板视频与 LMS / 日历同步交付

## 交付结论

本轮把学习工作台从“能生成课程入口”推进到可连续体验的教学校验面，重点完成自由白板视频、StudyAgent 学习安排、学校 LMS / 外部日历互通，并把首页、课程页、工具弹层、播放器和日历校准到参考产品同等的信息密度和交互节奏。

不包含计费、点数或付费拦截。HyperKnow 的登录会话只用于普通界面观察，没有读取 Cookie、本地存储、令牌、私有接口或批量导出课程内容。界面与课程文本使用 StudyAgent 自有品牌和已审核知识资产。

## 教学目标与界面结构

- 首页保留 Craft Courses 与 Instant Assistance 双模式，输入区固定在视觉中心；右侧新增学习者证据、下一优先动作、最近白板和同步状态。
- 桌面导航改为窄图标栏，保留可访问名称、悬浮标签、折叠状态和移动端横向重排。
- 课程页采用“课程概览 / 单元路径 / 当前活动证据”三栏结构。Units、Materials、Practices 可在左侧切换，当前活动说明和进度图例固定在右侧。
- 课程完成状态只表示活动接触或尝试；掌握状态继续来自独立题组、提示记录和延迟复测。
- 工具弹层统一提供概念讲解、个性化学习材料、长资料整理、可视化、Whiteboard session 和 Study Planner。学生不显示同步管理和学习计划管理入口。

像素校准证据：

- [首页](../evidence/2026-10-21/studio-home-polished.png)
- [三栏课程页](../evidence/2026-10-21/studio-course-polished.png)

## 自由白板视频

白板生成器只消费当前学生已确认范围内发布的知识点。显式指定知识点时，越界会被拒绝；自由输入没有可靠匹配时，不把无关知识点硬套进白板。已审核教学卡可生成五幕结构：

1. 标题与学习目标。
2. 概念关系。
3. 带步骤的例题。
4. 受限 schema 的教学可视化。
5. 新题、迁移和延迟复测检查点。

播放器使用 1280×720 Canvas，支持逐幕切换、完整时间轴、播放/暂停、上一幕/下一幕、设备中文语音和速度控制。导出结果是实际可下载的 WebM，每幕旁白烧入画面字幕，并可另存标准 SRT。

配置 OPENAI_API_KEY 后，播放器会请求受控的服务端 TTS。所有场景音轨可用时，Canvas 视频流与合成音频流一起交给 MediaRecorder，导出带 AI 旁白的 WebM；任一步不可用时自动退回字幕视频，不会阻断交付。服务端只接受已保存、当前用户有权访问的白板场景旁白。

白板预览与播放器证据：

- [生成预览](../evidence/2026-10-21/studio-whiteboard-preview.png)
- [逐幕播放器](../evidence/2026-10-21/studio-whiteboard-player.png)

## LMS 与日历同步

本轮采用学校平台普遍支持的 ICS 作为互通边界，支持：

- 直接粘贴 Canvas、Schoology、Google Calendar、Outlook 或学校系统导出的日历内容。
- 使用公开或带令牌的 HTTPS ICS 订阅，手动同步和撤销来源。
- DAILY、WEEKLY、MONTHLY 有界重复、COUNT、UNTIL、EXDATE、取消事件、全天事件、显式时区偏移和 TZID。
- 最多 500 个展开事件、2.5 MB 文件、4 次重定向和 12 秒请求超时。
- StudyAgent 学习任务直接加入同一时间轴，并可移除自己的任务。
- 标准 ICS 再导出，保留全天事件并对长行做合法折行。

连接是学生与学科隔离的数据。创建、同步和撤销要求监护人权限；学生可以读取自己的日历和白板，但不能管理外部连接。连接与学习安排都使用 requestKey 幂等，重试不会重复插入。

订阅 URL 使用 AES-256-GCM 加密，API 不回显。只允许 HTTPS，拒绝用户名密码、非 443 端口、本机、局域网、组播和保留地址。DNS 校验后，HTTPS 请求固定使用已校验 IP，同时保留原始主机名证书校验，降低二次解析和 DNS rebinding 风险。

日历证据：

- [学习任务与学校日历](../evidence/2026-10-21/studio-calendar-polished.png)

## 数据与接口

- POST /api/learning/studio/whiteboards/preview
- POST /api/learning/studio/whiteboards
- POST /api/learning/studio/whiteboards/:id/narration/:sceneId
- POST /api/learning/studio/integrations
- POST /api/learning/studio/integrations/:id/sync
- POST /api/learning/studio/integrations/:id/disconnect
- POST /api/learning/studio/calendar/events
- POST /api/learning/studio/calendar/events/:id/remove
- GET /api/learning/studio/calendar/export

新增持久集合为 studioWhiteboards、studioConnectors 和 studioScheduleEvents；课程、活动、白板、连接和日程继续进入现有 SQLite / PostgreSQL 快照与备份恢复路径。

## 验证

本轮验证覆盖：

- ICS 纯时间值、带前缀时间值、显式偏移、TZID、全天事件、取消事件、EXDATE、重复事件和导出折行。
- 白板生成五幕结构、来源匹配、持久化与幂等回读。
- 学生可创建本人白板，其他家庭不能预览；旁白接口检查白板归属。
- 连接创建、重放、请求键冲突、私网 URL 拒绝、学生管理拒绝、撤销和日程清理。
- StudyAgent 学习任务创建、幂等、删除和 ICS 导出。
- 生产构建 Chromium 旅程完成课程、白板预览、保存、播放器、真实 WebM 下载、SRT 下载、学习计划、LMS ICS 导入和刷新。

机器可读最终收据见 [白板与同步运行收据](../evidence/2026-10-21/studio-whiteboard-lms-calendar-runtime.json)。

## 明确边界

- 当前 LMS 互通通过标准 ICS 文件或订阅完成，不宣称已实现 Canvas / Schoology 的 OAuth 原生 API、双向作业回写或机构级租户管理。
- 自动刷新仍以用户明确点击“同步”触发；外部订阅的失效、令牌轮换和机构停用需要由用户重新提供来源。
- 白板生成与教学内容以已确认范围为主，不把自由文本自动写成孩子的长期能力标签。
- 白板观看、日历事件或计划完成都不直接记为掌握，后续仍需独立作答题组和时间验证。

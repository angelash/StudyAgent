# 诊断学习计划、PDF 页级白板与个性化学案交付

日期：2026-10-22

## 范围

本轮按内部自用范围继续产品化：

- 不实现学校原生 OAuth、后台自动拉取作业、成绩回写或机构租户。
- 不实现 Marketplace、计费、付费墙或商业化运营。
- 保留并继续使用 Canvas、Schoology 等可导出的 ICS 以及通用日历订阅。
- 重点完善学生从“看清薄弱点”到“执行、复测、复盘”的实际学习体验。

## 已完成

### 诊断驱动 Study Planner

- 从当前学生、学科、已确认进度和已发布知识点中选材。
- 优先薄弱、继续巩固和证据不足的点，并参考独立题族数量。
- 生成多会话 learn / practice / transfer / review 计划，预览后才写入日历。
- 自动跳过已有日程冲突。
- 计划、任务和日历事件使用同一任务标识；支持幂等创建、版本冲突保护和跨家庭隔离。
- 每项任务支持看讲解、做定向微测、完成、跳过和重新打开。
- 首次完成任务后自动安排 D+1、D+3、D+7、D+14 延迟复测。
- 完成动作只记录任务执行，不直接写入知识掌握；复测仍需独立新题证据。

### PDF 页级材料

- 上传 10MB 内的文字型 PDF，最多处理前 30 页。
- 保存原始 PDF 到私有数据目录，按 SHA-256 去重并以仅当前用户权限写入。
- 原文件只允许当前学生档案的家长或已授权学生读取。
- 保留文字层、原版页面 PNG、页数与文件摘要。
- 页面工作台支持原版页面与文字层切换、逐页浏览、重新打开和原文件下载。
- 页级白板保留材料、页码和 SHA 来源，播放和视频导出时可显示原页。
- 扫描 PDF 没有文字层时明确提示需要 OCR，不生成伪造内容。

### 个性化学案

- 从 1–4 个当前范围内已审核知识点生成：
  - 概念解释；
  - 已审核示例；
  - 可验证易错假设；
  - 迁移检查；
  - 闪卡；
  - 定向微测与延迟复测任务。
- 可绑定 PDF 作为人工对照来源；只有能核对文本时才保留页码，未命中时不伪造映射。
- 先预览、再保存；共享相同指纹时复用已保存学案。
- 学案可打印，并可直接进入对应知识点的三分钟定向微测。
- 材料、学案和白板都受当前家庭访问边界保护。

### 体验与可靠性

- Materials 改为“PDF 页级资料 / 个性化学案”双入口。
- 计划、材料和工作台补齐桌面与手机布局。
- 修复 multipart 中文文件名乱码。
- 修复页级图片地址遗漏 /api 导致的 404。
- 重复上传响应移除内部页面数据与请求标识。
- 增加服务器不可用、无文字层、原页不可用和计划冲突的可理解提示。
- 历史活动可直接回到 Materials 的个性化学案入口。

## 主要接口

- POST /api/learning/studio/study-plans/preview
- POST /api/learning/studio/study-plans
- POST /api/learning/studio/study-plans/:planId/sessions/:sessionId
- POST /api/learning/studio/materials/pdf
- GET /api/learning/studio/materials/:id/pages/:page
- GET /api/learning/studio/materials/:id/original
- POST /api/learning/studio/materials/:id/whiteboard/preview
- POST /api/learning/studio/materials/:id/whiteboard
- POST /api/learning/studio/study-packs/preview
- POST /api/learning/studio/study-packs

## 证据边界

- PDF 页面渲染证明原版面可核对；文字提取不等于 OCR、表格结构恢复或题目自动切分。
- 个性化学案由已审核教学素材确定性编排，未知内容会拒绝生成；不会用生成文本替代正式题库。
- 计划完成、观看白板、使用闪卡或完成训练都只是执行证据。
- 知识掌握仍由知识点级独立题组、提示记录、迁移题和延迟复测共同估计。
- 当前只支持既有 ICS 同步；不宣称 Canvas/Schoology 原生 OAuth 或双向回写。

## 验收

必须同时通过：

- 契约、API 与 Web 生产构建；
- API 类型检查和 Web 类型检查；
- 全量 API/集成测试；
- PDF 与计划新增集成用例；
- Playwright 桌面、手机、计划、PDF、页级白板和个性化学案流程；
- 文档链接检查；
- Git diff whitespace 检查。

运行结果归档在 [诊断计划、PDF 与学案运行证据](../evidence/2026-10-22/diagnostic-planner-pdf-study-pack-runtime.json) 和 [界面验收截图](../evidence/2026-10-22/studio-materials-and-pack.png)。

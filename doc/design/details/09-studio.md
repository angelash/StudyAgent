# 09 学习工作台、实时课堂、白板、学案与日历 — 详细设计

源码基线：`2c49e8422d03239b33caa37af516b4e7ab2fccf3`。角色：家长、学生与授权教师；成人课程需成人身份。

产品入口：`/studio`、`/studio/classroom`、`/studio/projects`、`/studio/source-courses`。

## 模块实现

- [apps/web/app/studio/studio.tsx](../../../apps/web/app/studio/studio.tsx)
- [apps/web/app/studio/my-courses.tsx](../../../apps/web/app/studio/my-courses.tsx)
- [apps/web/app/studio/studio-navigation.tsx](../../../apps/web/app/studio/studio-navigation.tsx)
- [apps/web/app/studio/classroom/workbench.tsx](../../../apps/web/app/studio/classroom/workbench.tsx)
- [apps/api/src/modules/learning/learning.service.ts](../../../apps/api/src/modules/learning/learning.service.ts)
- [apps/api/src/modules/learning/classroom.service.ts](../../../apps/api/src/modules/learning/classroom.service.ts)
- [apps/api/src/modules/learning/studio-integration.service.ts](../../../apps/api/src/modules/learning/studio-integration.service.ts)

## 共享契约

- [packages/contracts/src/studio.ts](../../../packages/contracts/src/studio.ts)
- [packages/contracts/src/classroom.ts](../../../packages/contracts/src/classroom.ts)
- [packages/contracts/src/course-project.ts](../../../packages/contracts/src/course-project.ts)

## 关联验证

以下是对应功能领域的测试入口；测试文件存在不等于每个子场景已由真人或所有设备验证。

- [apps/api/src/modules/learning/studio-course.test.ts](../../../apps/api/src/modules/learning/studio-course.test.ts)
- [apps/api/src/modules/learning/studio.integration.test.ts](../../../apps/api/src/modules/learning/studio.integration.test.ts)
- [apps/api/src/modules/learning/classroom.integration.test.ts](../../../apps/api/src/modules/learning/classroom.integration.test.ts)
- [apps/api/src/modules/learning/classroom-unit-checks.test.ts](../../../apps/api/src/modules/learning/classroom-unit-checks.test.ts)
- [apps/api/src/modules/learning/classroom-practice-content.test.ts](../../../apps/api/src/modules/learning/classroom-practice-content.test.ts)
- [apps/api/src/modules/learning/course-project.integration.test.ts](../../../apps/api/src/modules/learning/course-project.integration.test.ts)
- [tests/e2e/course-project.spec.ts](../../../tests/e2e/course-project.spec.ts)
- [tests/e2e/studio.spec.ts](../../../tests/e2e/studio.spec.ts)
- [tests/e2e/classroom.spec.ts](../../../tests/e2e/classroom.spec.ts)
- [tests/e2e/classroom-review.spec.ts](../../../tests/e2e/classroom-review.spec.ts)
- [tests/e2e/classroom-practice.spec.ts](../../../tests/e2e/classroom-practice.spec.ts)
- [tests/e2e/course-library.spec.ts](../../../tests/e2e/course-library.spec.ts)
- [tests/e2e/course-builder.spec.ts](../../../tests/e2e/course-builder.spec.ts)
- [tests/e2e/workspace.spec.ts](../../../tests/e2e/workspace.spec.ts)

## STUDIO-01 统一工作台、课程筛选与连续学习

**输入**：view、student、subject、course、关键词、状态、类型、来源、最近学习与排序。

**处理与实现**：成人与当前档案小学课统一列表；真实记录区分未开始/进行中/讲解已读；关键词覆盖名称目标教材，组合筛选可清空；地址记条件，刷新/历史/进入目录及课堂返回保留；断点标题与目标一致；按身份连接GESP独立轨道；显式档案先校验授权，不回退另一孩子。

**输出**：可恢复课程列表、真实阅读计数、最近活动与范围总览。

**状态与持久化**：`studioCourses`、`studioActivities`、`classroomSessions`

**权限、失败与边界**：筛选针对当前授权课程；完成表示讲解已读，不能当掌握或所有项目完成；GESP与成人记录不合并进小学测量。

**关联接口**：

- `GET /api/learning/studio/overview` → `LearningController.studioOverview`；[apps/api/src/modules/learning/learning.controller.ts:18](../../../apps/api/src/modules/learning/learning.controller.ts#L18)。

**服务方法**：

- `LearningService.studioOverview`；[apps/api/src/modules/learning/learning.service.ts:63](../../../apps/api/src/modules/learning/learning.service.ts#L63)。

**补充实现文件**：

- [apps/web/app/studio/course-library-state.ts](../../../apps/web/app/studio/course-library-state.ts)
- [apps/web/app/studio/course-library.css](../../../apps/web/app/studio/course-library.css)

## STUDIO-02 可编辑课程蓝图、预算与确认恢复

**输入**：当前范围、所选1～30点、标题/目标、可选5～60分钟预算、预览指纹和请求键。

**处理与实现**：先编辑再审阅来源与缺口，取消预览不建课；保留所有所选分组，按参考时长生成预算内学习时段；预览和创建共用范围与资格校验；确认绑定主体/命令摘要与课程ID，同键重试恢复原课，旧预览或变更命令冲突；学习时段链接真实课堂与测量活动。

**输出**：带可选节奏的课程、单元/活动预览、缺口说明和幂等回执。

**状态与持久化**：`studioCourses`、`studioActivities`

**权限、失败与边界**：语言沿用已审核材料；预算为估计和建议，不是日历或独立测量；任意资料生成、多语言改写、专用项目与量规仍需开发；缺少绑定字段的旧回执须重新预览。

**关联接口**：

- `POST /api/learning/studio/courses/preview` → `LearningController.studioCoursePreview`；[apps/api/src/modules/learning/learning.controller.ts:22](../../../apps/api/src/modules/learning/learning.controller.ts#L22)。
- `POST /api/learning/studio/courses` → `LearningController.studioCourseCreate`；[apps/api/src/modules/learning/learning.controller.ts:25](../../../apps/api/src/modules/learning/learning.controller.ts#L25)。
- `POST /api/learning/studio/courses/:courseId/lessons/:lessonId/start` → `LearningController.studioLessonStart`；[apps/api/src/modules/learning/learning.controller.ts:28](../../../apps/api/src/modules/learning/learning.controller.ts#L28)。

**服务方法**：

- `LearningService.previewStudioCourse`；[apps/api/src/modules/learning/learning.service.ts:496](../../../apps/api/src/modules/learning/learning.service.ts#L496)。
- `LearningService.createStudioCourse`；[apps/api/src/modules/learning/learning.service.ts:512](../../../apps/api/src/modules/learning/learning.service.ts#L512)。
- `LearningService.startStudioLesson`；[apps/api/src/modules/learning/learning.service.ts:541](../../../apps/api/src/modules/learning/learning.service.ts#L541)。

**补充实现文件**：

- [apps/api/src/modules/learning/studio-course.ts](../../../apps/api/src/modules/learning/studio-course.ts)
- [apps/web/app/studio/course-builder.tsx](../../../apps/web/app/studio/course-builder.tsx)
- [apps/web/app/studio/course-builder.css](../../../apps/web/app/studio/course-builder.css)

## STUDIO-03 课程目录、单元、资料与帮助

**输入**：unit、panel、lesson、tab与可选studioCourseId。

**处理与实现**：展示封面、策划信息、单元、讲座、微课、项目与单元核查；可点开学习目标；帮助带入目标提问草稿；保留刷新、前进/后退与原课程返回路径。

**输出**：完整目录到课堂的导航。

**状态与持久化**：`classroomSessions`

**权限、失败与边界**：原站封面和字体尚未完全复用，当前基于可见截图重建。

**关联接口**：

- `GET /api/learning/classroom/catalog` → `ClassroomController.catalog`；[apps/api/src/modules/learning/classroom.controller.ts:9](../../../apps/api/src/modules/learning/classroom.controller.ts#L9)。

**服务方法**：

- `ClassroomService.catalog`；[apps/api/src/modules/learning/classroom.service.ts:26](../../../apps/api/src/modules/learning/classroom.service.ts#L26)。

## STUDIO-04 课堂会话、冻结双语字幕与旧断点升级

**输入**：lessonId、expectedRevision、cursor/revealed/sentenceCursor、presentationVersion/unitId及升级requestKey。

**处理与实现**：冻结课件、私有答案与提示；新会话服务端保存中英文单元的原文UTF-16范围、源哈希与稳定ID，保护数字/缩写/URL/代码；字幕、音轨、进度、表格行和配图上下文共用单元，音轨结束推进，只预取下一句；暂停同步中止旧请求和晚到音轨。旧会话保留确切旧规则，设置中显式按原句起点映射升级，保留原表现快照、答案与提示；同键重放和冲突后读取保护恢复。

**输出**：可恢复逐句讲解、完整提炼笔记、版本历史与原始练习事实。

**状态与持久化**：`classroomSessions`

**权限、失败与边界**：刷新从当前句开头恢复，升级后暂停；关闭窗口只停止等待，不能撤销服务端已提交操作；静音用字符/词数估计，不是强制声学对齐；有限分句规则不保证所有语言或缩写；教师/听感/实机仍需验收。

**关联接口**：

- `POST /api/learning/classroom/sessions` → `ClassroomController.open`；[apps/api/src/modules/learning/classroom.controller.ts:10](../../../apps/api/src/modules/learning/classroom.controller.ts#L10)。
- `GET /api/learning/classroom/sessions/:id` → `ClassroomController.get`；[apps/api/src/modules/learning/classroom.controller.ts:11](../../../apps/api/src/modules/learning/classroom.controller.ts#L11)。
- `PATCH /api/learning/classroom/sessions/:id` → `ClassroomController.progress`；[apps/api/src/modules/learning/classroom.controller.ts:12](../../../apps/api/src/modules/learning/classroom.controller.ts#L12)。
- `POST /api/learning/classroom/sessions/:id/narration/:stepId` → `ClassroomController.narration`；[apps/api/src/modules/learning/classroom.controller.ts:31](../../../apps/api/src/modules/learning/classroom.controller.ts#L31)。
- `POST /api/learning/classroom/sessions/:id/presentation` → `ClassroomController.presentation`；[apps/api/src/modules/learning/classroom.controller.ts:15](../../../apps/api/src/modules/learning/classroom.controller.ts#L15)。

**服务方法**：

- `ClassroomService.open`；[apps/api/src/modules/learning/classroom.service.ts:91](../../../apps/api/src/modules/learning/classroom.service.ts#L91)。
- `ClassroomService.get`；[apps/api/src/modules/learning/classroom.service.ts:82](../../../apps/api/src/modules/learning/classroom.service.ts#L82)。
- `ClassroomService.progress`；[apps/api/src/modules/learning/classroom.service.ts:132](../../../apps/api/src/modules/learning/classroom.service.ts#L132)。
- `ClassroomService.narration`；[apps/api/src/modules/learning/classroom.service.ts:260](../../../apps/api/src/modules/learning/classroom.service.ts#L260)。
- `ClassroomService.upgradePresentation`；[apps/api/src/modules/learning/classroom.service.ts:157](../../../apps/api/src/modules/learning/classroom.service.ts#L157)。

**补充实现文件**：

- [packages/contracts/src/classroom-speech.ts](../../../packages/contracts/src/classroom-speech.ts)
- [apps/api/src/modules/learning/classroom-presentation.ts](../../../apps/api/src/modules/learning/classroom-presentation.ts)
- [apps/api/src/modules/learning/classroom-presentation.test.ts](../../../apps/api/src/modules/learning/classroom-presentation.test.ts)
- [apps/api/src/modules/learning/classroom-presentation.integration.test.ts](../../../apps/api/src/modules/learning/classroom-presentation.integration.test.ts)
- [apps/web/app/studio/classroom/captions.tsx](../../../apps/web/app/studio/classroom/captions.tsx)
- [apps/web/app/studio/classroom/captions.css](../../../apps/web/app/studio/classroom/captions.css)
- [tests/e2e/classroom-captions.spec.ts](../../../tests/e2e/classroom-captions.spec.ts)
- [scripts/qa/classroom-caption-live.cjs](../../../scripts/qa/classroom-caption-live.cjs)

## STUDIO-05 课堂插问与补充板书

**输入**：当前课/步骤/问题、modelId、请求键。

**处理与实现**：插问暂停自动讲解；发送当前课件和允许证据；模型返回reply与最多5条要点、可选三标签关系图；服务器保存消息与补充板书。

**输出**：对话历史、可定位笔记、补充关系图。

**状态与持久化**：`classroomSessions`

**权限、失败与边界**：板书不是逐字转写；模型输出不执行HTML；私有答案键不送给练习助教。

**关联接口**：

- `POST /api/learning/classroom/sessions/:id/messages` → `ClassroomController.ask`；[apps/api/src/modules/learning/classroom.controller.ts:24](../../../apps/api/src/modules/learning/classroom.controller.ts#L24)。

**服务方法**：

- `ClassroomService.ask`；[apps/api/src/modules/learning/classroom.service.ts:228](../../../apps/api/src/modules/learning/classroom.service.ts#L228)。

## STUDIO-06 全微课练习、逐级帮助与复盘

**输入**：questionId、selectedIndex/null、answered/skip/dont_know、提示level、requestKey、projectDraft。

**处理与实现**：微课182题与独立编写单元60题分开；每课至少3题，含30表格题和2图示题；两级提示私有冻结，先记录再逐级返回，重复/丢失回执不升级；首次答案锁定，记录提示级别；复盘区分独立正确、答错、跳过、不会和辅助；新旧练习不混合，项目草稿可恢复；独立练习错误可见且成功重试清除旧错误。

**输出**：242个不同题目ID、逐级提示回执、具体复盘、旧版记录和项目草稿。

**状态与持久化**：`classroomSessions`

**权限、失败与边界**：题目待逐题教师审核与真人验证；3题和不同情境不代表心理测量齐备；仍为单选，不能替代主观理由、项目量规或直接推断稳定掌握。

**关联接口**：

- `POST /api/learning/classroom/sessions/:id/answers` → `ClassroomController.answer`；[apps/api/src/modules/learning/classroom.controller.ts:18](../../../apps/api/src/modules/learning/classroom.controller.ts#L18)。
- `POST /api/learning/classroom/sessions/:id/hints` → `ClassroomController.hint`；[apps/api/src/modules/learning/classroom.controller.ts:21](../../../apps/api/src/modules/learning/classroom.controller.ts#L21)。

**服务方法**：

- `ClassroomService.answer`；[apps/api/src/modules/learning/classroom.service.ts:175](../../../apps/api/src/modules/learning/classroom.service.ts#L175)。
- `ClassroomService.hint`；[apps/api/src/modules/learning/classroom.service.ts:203](../../../apps/api/src/modules/learning/classroom.service.ts#L203)。

**补充实现文件**：

- [apps/api/src/modules/learning/classroom-unit-checks.ts](../../../apps/api/src/modules/learning/classroom-unit-checks.ts)
- [apps/api/src/modules/learning/classroom-practice-content.ts](../../../apps/api/src/modules/learning/classroom-practice-content.ts)
- [apps/api/src/modules/learning/classroom-practice-model.ts](../../../apps/api/src/modules/learning/classroom-practice-model.ts)
- [apps/api/src/modules/learning/classroom-practice-u1.ts](../../../apps/api/src/modules/learning/classroom-practice-u1.ts)
- [apps/api/src/modules/learning/classroom-practice-u2.ts](../../../apps/api/src/modules/learning/classroom-practice-u2.ts)
- [apps/api/src/modules/learning/classroom-practice-u3.ts](../../../apps/api/src/modules/learning/classroom-practice-u3.ts)
- [apps/api/src/modules/learning/classroom-practice-u4.ts](../../../apps/api/src/modules/learning/classroom-practice-u4.ts)
- [apps/api/src/modules/learning/classroom-practice-u5.ts](../../../apps/api/src/modules/learning/classroom-practice-u5.ts)
- [apps/web/app/studio/classroom/practice-panel.tsx](../../../apps/web/app/studio/classroom/practice-panel.tsx)
- [apps/web/app/studio/classroom/practice-review.css](../../../apps/web/app/studio/classroom/practice-review.css)

## STUDIO-07 课堂图片、表格与代码实验

**输入**：受控image/table/code blocks。

**处理与实现**：使用已生成本地WebP与受控SVG；图片可放大；表格逐行展示；JS示例放入独立runner页面和Worker，限制网络与DOM并设置超时。

**输出**：图表表达、浏览器代码日志。

**状态与持久化**：`classroomSessions`

**权限、失败与边界**：代码实验是JavaScript，不是GESP C++；当前不按每次问题在线生图。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

**补充实现文件**：

- [apps/web/app/studio/classroom/runner/route.ts](../../../apps/web/app/studio/classroom/runner/route.ts)
- [apps/web/app/studio/classroom/code-workbench.tsx](../../../apps/web/app/studio/classroom/code-workbench.tsx)
- [apps/web/app/studio/classroom/board-step.tsx](../../../apps/web/app/studio/classroom/board-step.tsx)

## STUDIO-08 课堂控制、导出与移动交互

**输入**：音色、倍速、字体、背景、显示面板和导出命令。

**处理与实现**：支持播放/暂停/停止、静音阅读、音色和倍速；持久化显示偏好；导出已读板书及插问Markdown、打印PDF；退出确认保存项目。

**输出**：可下载笔记与跨设备尺寸适配。

**状态与持久化**：`classroomSessions`

**权限、失败与边界**：显示偏好存在浏览器本地；学习事实保存在服务端，导出只包含已揭示内容。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

## STUDIO-09 自由主题白板预览与持久保存

**输入**：学生、学科、主题、可选已审核知识点。

**处理与实现**：规则生成分幕标题、概念、步骤、图形和检查点；预览和保存使用内容指纹、请求键；保存后可继续播放。

**输出**：StudioWhiteboard与幕序。

**状态与持久化**：`studioWhiteboards`、`studioActivities`

**权限、失败与边界**：自由主题不等同于模型已核验知识正确性；有批准教学时优先使用。

**关联接口**：

- `POST /api/learning/studio/whiteboards/preview` → `LearningController.studioWhiteboardPreview`；[apps/api/src/modules/learning/learning.controller.ts:32](../../../apps/api/src/modules/learning/learning.controller.ts#L32)。
- `POST /api/learning/studio/whiteboards` → `LearningController.studioWhiteboardCreate`；[apps/api/src/modules/learning/learning.controller.ts:35](../../../apps/api/src/modules/learning/learning.controller.ts#L35)。

**服务方法**：

- `LearningService.previewStudioWhiteboard`；[apps/api/src/modules/learning/learning.service.ts:211](../../../apps/api/src/modules/learning/learning.service.ts#L211)。
- `LearningService.createStudioWhiteboard`；[apps/api/src/modules/learning/learning.service.ts:223](../../../apps/api/src/modules/learning/learning.service.ts#L223)。

**补充实现文件**：

- [apps/api/src/modules/learning/studio-whiteboard.ts](../../../apps/api/src/modules/learning/studio-whiteboard.ts)

## STUDIO-10 白板视频、SRT与AI旁白

**输入**：白板ID、幕ID、可用语音与浏览器录制能力。

**处理与实现**：Canvas按时间绘制；可请求每幕旁白并与画面合成MediaStream；MediaRecorder输出WebM；始终可导出SRT；finally释放音频上下文与轨道。

**输出**：字幕视频、旁白视频、SRT。

**状态与持久化**：`studioWhiteboards`

**权限、失败与边界**：没有AI语音时生成字幕视频并明确提示；需要支持录制的浏览器。

**关联接口**：

- `POST /api/learning/studio/whiteboards/:id/narration/:sceneId` → `LearningController.studioWhiteboardNarration`；[apps/api/src/modules/learning/learning.controller.ts:66](../../../apps/api/src/modules/learning/learning.controller.ts#L66)。

**服务方法**：

- `LearningService.studioWhiteboardNarration`；[apps/api/src/modules/learning/learning.service.ts:485](../../../apps/api/src/modules/learning/learning.service.ts#L485)。

**补充实现文件**：

- [apps/web/app/studio/whiteboard-player.tsx](../../../apps/web/app/studio/whiteboard-player.tsx)

## STUDIO-11 PDF上传、原文与逐页阅读

**输入**：multipart PDF、可选studentId/subject、requestKey。

**处理与实现**：10MiB以内单PDF受控上传，最多30页；保存原件并创建持久处理任务；孩子资料按当前档案权限读取，成人私人资料用真实空studentId及ownerUserId隔离；重复文件返回原材料并保存新的请求回执，改命令不能复用旧键。

**输出**：受控原始PDF、页图、OCR/结构状态。

**状态与持久化**：`studioSourceMaterials`、`importFiles`、`processingArtifacts`

**权限、失败与边界**：不能按任意本机路径读取；大文件分块、更多页数和未引用PDF物理擦除仍待后续。

**关联接口**：

- `POST /api/learning/studio/materials/pdf` → `LearningController.studioPdfUpload`；[apps/api/src/modules/learning/learning.controller.ts:38](../../../apps/api/src/modules/learning/learning.controller.ts#L38)。
- `GET /api/learning/studio/materials/:id/pages/:page` → `LearningController.studioPdfPage`；[apps/api/src/modules/learning/learning.controller.ts:41](../../../apps/api/src/modules/learning/learning.controller.ts#L41)。
- `GET /api/learning/studio/materials/:id/original` → `LearningController.studioPdfOriginal`；[apps/api/src/modules/learning/learning.controller.ts:43](../../../apps/api/src/modules/learning/learning.controller.ts#L43)。

**服务方法**：

- `LearningService.uploadStudioPdf`；[apps/api/src/modules/learning/learning.service.ts:247](../../../apps/api/src/modules/learning/learning.service.ts#L247)。
- `LearningService.studioPdfPageImage`；[apps/api/src/modules/learning/learning.service.ts:308](../../../apps/api/src/modules/learning/learning.service.ts#L308)。
- `LearningService.studioPdfOriginal`；[apps/api/src/modules/learning/learning.service.ts:325](../../../apps/api/src/modules/learning/learning.service.ts#L325)。

**补充实现文件**：

- [apps/api/src/modules/learning/studio-material-access.ts](../../../apps/api/src/modules/learning/studio-material-access.ts)

## STUDIO-12 PDF文字层、OCR与表格公式恢复

**输入**：PDF原页、文字层、扫描图像。

**处理与实现**：Python优先文字层，扫描页OCR；保留bbox/置信度/页图；本地表格网格和公式候选与可选模型复核合并；前端用HTML表格和KaTeX呈现。

**输出**：按页paragraph/table/formula blocks。

**状态与持久化**：`studioSourceMaterials`、`processingArtifacts`

**权限、失败与边界**：OCR和公式是候选，不能把恢复结构当成已审核教学内容。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

**补充实现文件**：

- [apps/api/src/modules/learning/studio-pdf-structure.ts](../../../apps/api/src/modules/learning/studio-pdf-structure.ts)
- [scripts/processing/process_document.py](../../../scripts/processing/process_document.py)

## STUDIO-13 结构人工确认与失败重试

**输入**：expectedUpdatedAt、requestKey、人工核对决定。

**处理与实现**：用户对照原页确认恢复结果；失败或本地降级可重新排队；更新时比较资料版本并保留原件。

**输出**：review状态与新任务。

**状态与持久化**：`studioSourceMaterials`

**权限、失败与边界**：不能用旧页面确认已变化的结构；复核能力不可用仍展示本地候选与警告。

**关联接口**：

- `POST /api/learning/studio/materials/:id/structure/review` → `LearningController.studioPdfStructureReview`；[apps/api/src/modules/learning/learning.controller.ts:46](../../../apps/api/src/modules/learning/learning.controller.ts#L46)。
- `POST /api/learning/studio/materials/:id/process/retry` → `LearningController.studioPdfProcessRetry`；[apps/api/src/modules/learning/learning.controller.ts:50](../../../apps/api/src/modules/learning/learning.controller.ts#L50)。

**服务方法**：

- `LearningService.reviewStudioPdfStructure`；[apps/api/src/modules/learning/learning.service.ts:340](../../../apps/api/src/modules/learning/learning.service.ts#L340)。
- `LearningService.retryStudioPdfProcessing`；[apps/api/src/modules/learning/learning.service.ts:368](../../../apps/api/src/modules/learning/learning.service.ts#L368)。

## STUDIO-14 PDF页级白板

**输入**：资料ID、知识点、页级依据与预览指纹。

**处理与实现**：选定原页与批准知识；以原页图和文字核对为基础生成白板幕；保存页码、来源及主题。

**输出**：原页与提炼解释结合的白板。

**状态与持久化**：`studioSourceMaterials`、`studioWhiteboards`

**权限、失败与边界**：关键词匹配只能提供候选页，不能声称精确教学引用已审核。

**关联接口**：

- `POST /api/learning/studio/materials/:id/whiteboard/preview` → `LearningController.studioPdfWhiteboardPreview`；[apps/api/src/modules/learning/learning.controller.ts:54](../../../apps/api/src/modules/learning/learning.controller.ts#L54)。
- `POST /api/learning/studio/materials/:id/whiteboard` → `LearningController.studioPdfWhiteboardCreate`；[apps/api/src/modules/learning/learning.controller.ts:56](../../../apps/api/src/modules/learning/learning.controller.ts#L56)。

**服务方法**：

- `LearningService.previewStudioPdfWhiteboard`；[apps/api/src/modules/learning/learning.service.ts:401](../../../apps/api/src/modules/learning/learning.service.ts#L401)。
- `LearningService.createStudioPdfWhiteboard`；[apps/api/src/modules/learning/learning.service.ts:416](../../../apps/api/src/modules/learning/learning.service.ts#L416)。

**补充实现文件**：

- [apps/api/src/modules/learning/studio-pdf-whiteboard.ts](../../../apps/api/src/modules/learning/studio-pdf-whiteboard.ts)

## STUDIO-15 个性化讲义、闪卡与微测

**输入**：当前范围、薄弱/未知点、可选资料来源。

**处理与实现**：最多选4个批准教学点；组合解释、例题、易错、迁移章节和闪卡/微测；关联真实知识ID及候选页；指纹预览后保存。

**输出**：StudioLearningPack及打印材料。

**状态与持久化**：`studioLearningPacks`、`studioSourceMaterials`

**权限、失败与边界**：规则编排为主；闪卡或阅读完成不改变掌握结论。

**关联接口**：

- `POST /api/learning/studio/study-packs/preview` → `LearningController.studioLearningPackPreview`；[apps/api/src/modules/learning/learning.controller.ts:60](../../../apps/api/src/modules/learning/learning.controller.ts#L60)。
- `POST /api/learning/studio/study-packs` → `LearningController.studioLearningPackCreate`；[apps/api/src/modules/learning/learning.controller.ts:63](../../../apps/api/src/modules/learning/learning.controller.ts#L63)。

**服务方法**：

- `LearningService.previewStudioLearningPack`；[apps/api/src/modules/learning/learning.service.ts:437](../../../apps/api/src/modules/learning/learning.service.ts#L437)。
- `LearningService.createStudioLearningPack`；[apps/api/src/modules/learning/learning.service.ts:458](../../../apps/api/src/modules/learning/learning.service.ts#L458)。

**补充实现文件**：

- [apps/api/src/modules/learning/studio-learning-pack.ts](../../../apps/api/src/modules/learning/studio-learning-pack.ts)

## STUDIO-16 工作台计划排程与阶段执行

**输入**：目标、截止日期、首次时间、每天10–60分钟、版本和请求键。

**处理与实现**：按薄弱与证据不足优先选点；编排learn/practice/transfer/review，跳过可识别冲突；完成后追加1/3/7/14日复盘；同步日历事件状态。

**输出**：可确认、完成、跳过、重开的学习安排。

**状态与持久化**：`studioStudyPlans`、`studioScheduleEvents`、`studioActivities`

**权限、失败与边界**：这是排程计划，不是DiagnosticGuidancePlan；极端冲突会保留起点并提示，不是通用排课优化器。

**关联接口**：

- `POST /api/learning/studio/study-plans/preview` → `LearningController.studioStudyPlanPreview`；[apps/api/src/modules/learning/learning.controller.ts:91](../../../apps/api/src/modules/learning/learning.controller.ts#L91)。
- `POST /api/learning/studio/study-plans` → `LearningController.studioStudyPlanCreate`；[apps/api/src/modules/learning/learning.controller.ts:94](../../../apps/api/src/modules/learning/learning.controller.ts#L94)。
- `POST /api/learning/studio/study-plans/:planId/sessions/:sessionId` → `LearningController.studioStudyPlanSession`；[apps/api/src/modules/learning/learning.controller.ts:97](../../../apps/api/src/modules/learning/learning.controller.ts#L97)。

**服务方法**：

- `LearningService.previewStudioStudyPlan`；[apps/api/src/modules/learning/learning.service.ts:114](../../../apps/api/src/modules/learning/learning.service.ts#L114)。
- `LearningService.createStudioStudyPlan`；[apps/api/src/modules/learning/learning.service.ts:130](../../../apps/api/src/modules/learning/learning.service.ts#L130)。
- `LearningService.updateStudioPlanSession`；[apps/api/src/modules/learning/learning.service.ts:168](../../../apps/api/src/modules/learning/learning.service.ts#L168)。

**补充实现文件**：

- [apps/api/src/modules/learning/studio-study-plan.ts](../../../apps/api/src/modules/learning/studio-study-plan.ts)

## STUDIO-17 ICS日历连接、刷新与撤销

**输入**：ICS文本或HTTPS订阅URL、来源名称、类型、请求键。

**处理与实现**：校验地址、重定向、大小和内容；拒绝本机/私网地址；订阅URL加密保存；UID归并事件；手动同步后替换该来源事件，撤销清理来源事件。

**输出**：只读外部课程和日历事件。

**状态与持久化**：`studioConnectors`、`studioScheduleEvents`

**权限、失败与边界**：没有Canvas/Schoology OAuth、后台自动刷新、双向作业或成绩回写。

**关联接口**：

- `POST /api/learning/studio/integrations` → `LearningController.studioIntegrationConnect`；[apps/api/src/modules/learning/learning.controller.ts:70](../../../apps/api/src/modules/learning/learning.controller.ts#L70)。
- `POST /api/learning/studio/integrations/:id/sync` → `LearningController.studioIntegrationSync`；[apps/api/src/modules/learning/learning.controller.ts:73](../../../apps/api/src/modules/learning/learning.controller.ts#L73)。
- `POST /api/learning/studio/integrations/:id/disconnect` → `LearningController.studioIntegrationDisconnect`；[apps/api/src/modules/learning/learning.controller.ts:76](../../../apps/api/src/modules/learning/learning.controller.ts#L76)。

**服务方法**：

- `StudioIntegrationService.connect`；[apps/api/src/modules/learning/studio-integration.service.ts:83](../../../apps/api/src/modules/learning/studio-integration.service.ts#L83)。
- `StudioIntegrationService.sync`；[apps/api/src/modules/learning/studio-integration.service.ts:107](../../../apps/api/src/modules/learning/studio-integration.service.ts#L107)。
- `StudioIntegrationService.disconnect`；[apps/api/src/modules/learning/studio-integration.service.ts:124](../../../apps/api/src/modules/learning/studio-integration.service.ts#L124)。

**补充实现文件**：

- [apps/api/src/modules/learning/ics-calendar.ts](../../../apps/api/src/modules/learning/ics-calendar.ts)

## STUDIO-18 日历月周视图与任务生命周期

**输入**：所选日期、任务内容/时间、确认/完成状态、expectedRevision。

**处理与实现**：本地日期生成月/周格和当日待办；手动事件支持编辑、待确认、完成、重开；批删先校验全部ID，切换范围清空选择；计划事件走计划服务，订阅只读。

**输出**：持久任务及日期状态。

**状态与持久化**：`studioScheduleEvents`、`studioStudyPlans`

**权限、失败与边界**：手动任务时长5分钟至8小时；日历仍绑定学生档案；权限由服务端监护校验。

**关联接口**：

- `POST /api/learning/studio/calendar/events` → `LearningController.studioCalendarEventCreate`；[apps/api/src/modules/learning/learning.controller.ts:79](../../../apps/api/src/modules/learning/learning.controller.ts#L79)。
- `POST /api/learning/studio/calendar/events/:id/update` → `LearningController.studioCalendarEventUpdate`；[apps/api/src/modules/learning/learning.controller.ts:85](../../../apps/api/src/modules/learning/learning.controller.ts#L85)。
- `POST /api/learning/studio/calendar/events/:id/remove` → `LearningController.studioCalendarEventRemove`；[apps/api/src/modules/learning/learning.controller.ts:82](../../../apps/api/src/modules/learning/learning.controller.ts#L82)。
- `POST /api/learning/studio/calendar/batch-remove` → `LearningController.studioCalendarBatchRemove`；[apps/api/src/modules/learning/learning.controller.ts:88](../../../apps/api/src/modules/learning/learning.controller.ts#L88)。

**服务方法**：

- `StudioIntegrationService.createStudyEvent`；[apps/api/src/modules/learning/studio-integration.service.ts:130](../../../apps/api/src/modules/learning/studio-integration.service.ts#L130)。
- `StudioIntegrationService.updateStudyEvent`；[apps/api/src/modules/learning/studio-integration.service.ts:154](../../../apps/api/src/modules/learning/studio-integration.service.ts#L154)。
- `StudioIntegrationService.removeStudyEvent`；[apps/api/src/modules/learning/studio-integration.service.ts:146](../../../apps/api/src/modules/learning/studio-integration.service.ts#L146)。
- `StudioIntegrationService.batchRemoveStudyEvents`；[apps/api/src/modules/learning/studio-integration.service.ts:172](../../../apps/api/src/modules/learning/studio-integration.service.ts#L172)。

**补充实现文件**：

- [apps/web/app/studio/calendar-board.tsx](../../../apps/web/app/studio/calendar-board.tsx)
- [apps/web/app/studio/workspace-dialog.tsx](../../../apps/web/app/studio/workspace-dialog.tsx)

## STUDIO-19 学习安排导出ICS

**输入**：学生与学科。

**处理与实现**：授权后读取对应安排；转义文本和折行；以稳定UID、开始结束和全天属性生成ICS并由浏览器下载。

**输出**：可导入外部日历的ICS文件。

**状态与持久化**：`studioScheduleEvents`

**权限、失败与边界**：文件互通不表示与外部日历建立持续双向同步。

**关联接口**：

- `GET /api/learning/studio/calendar/export` → `LearningController.studioCalendarExport`；[apps/api/src/modules/learning/learning.controller.ts:101](../../../apps/api/src/modules/learning/learning.controller.ts#L101)。

**服务方法**：

- `StudioIntegrationService.exportCalendar`；[apps/api/src/modules/learning/studio-integration.service.ts:185](../../../apps/api/src/modules/learning/studio-integration.service.ts#L185)。

## STUDIO-20 阶段项目、产物版本与量规复核

**输入**：课程/单元、阶段产物、文字/链接证据、自评、修订号、请求键和模型。

**处理与实现**：成人五项目各三阶段；小学课程构造迁移解释核查模板；草稿与自评准备同步持久保存，提交冻结产物/量规/前版本；指定提交可由授权家长或教师逐维度复核；旧课堂草稿主动复制成参考；AI仅建议并标记所针对的稿本；重复写入可重放，冲突保留本地导出后恢复。

**输出**：15阶段原创项目、自评/提交历史/人工复核、旧稿引用、模型建议与受控隐私导出删除。

**状态与持久化**：`courseProjects`、`classroomSessions`、`studioCourses`、`teacherAssignments`

**权限、失败与边界**：内容和量规待教师审核，文字/链接证据已接入，二进制附件仍待统一媒体接入；AI真实供应商调用和真人效果另验；项目不写正式掌握度。

**关联接口**：

- `GET /api/learning/projects/catalog` → `CourseProjectController.catalog`；[apps/api/src/modules/learning/course-project.controller.ts:9](../../../apps/api/src/modules/learning/course-project.controller.ts#L9)。
- `GET /api/learning/projects/:id` → `CourseProjectController.get`；[apps/api/src/modules/learning/course-project.controller.ts:10](../../../apps/api/src/modules/learning/course-project.controller.ts#L10)。
- `POST /api/learning/projects` → `CourseProjectController.open`；[apps/api/src/modules/learning/course-project.controller.ts:11](../../../apps/api/src/modules/learning/course-project.controller.ts#L11)。
- `PATCH /api/learning/projects/:id` → `CourseProjectController.save`；[apps/api/src/modules/learning/course-project.controller.ts:12](../../../apps/api/src/modules/learning/course-project.controller.ts#L12)。
- `POST /api/learning/projects/:id/submissions` → `CourseProjectController.submit`；[apps/api/src/modules/learning/course-project.controller.ts:13](../../../apps/api/src/modules/learning/course-project.controller.ts#L13)。
- `POST /api/learning/projects/:id/reviews` → `CourseProjectController.review`；[apps/api/src/modules/learning/course-project.controller.ts:14](../../../apps/api/src/modules/learning/course-project.controller.ts#L14)。
- `POST /api/learning/projects/:id/legacy` → `CourseProjectController.legacy`；[apps/api/src/modules/learning/course-project.controller.ts:15](../../../apps/api/src/modules/learning/course-project.controller.ts#L15)。
- `POST /api/learning/projects/:id/advice` → `CourseProjectController.advice`；[apps/api/src/modules/learning/course-project.controller.ts:16](../../../apps/api/src/modules/learning/course-project.controller.ts#L16)。

**服务方法**：

- `CourseProjectService.catalog`；[apps/api/src/modules/learning/course-project.service.ts:69](../../../apps/api/src/modules/learning/course-project.service.ts#L69)。
- `CourseProjectService.get`；[apps/api/src/modules/learning/course-project.service.ts:67](../../../apps/api/src/modules/learning/course-project.service.ts#L67)。
- `CourseProjectService.open`；[apps/api/src/modules/learning/course-project.service.ts:79](../../../apps/api/src/modules/learning/course-project.service.ts#L79)。
- `CourseProjectService.save`；[apps/api/src/modules/learning/course-project.service.ts:125](../../../apps/api/src/modules/learning/course-project.service.ts#L125)。
- `CourseProjectService.submit`；[apps/api/src/modules/learning/course-project.service.ts:139](../../../apps/api/src/modules/learning/course-project.service.ts#L139)。
- `CourseProjectService.review`；[apps/api/src/modules/learning/course-project.service.ts:157](../../../apps/api/src/modules/learning/course-project.service.ts#L157)。
- `CourseProjectService.importLegacy`；[apps/api/src/modules/learning/course-project.service.ts:174](../../../apps/api/src/modules/learning/course-project.service.ts#L174)。
- `CourseProjectService.advise`；[apps/api/src/modules/learning/course-project.service.ts:188](../../../apps/api/src/modules/learning/course-project.service.ts#L188)。

**补充实现文件**：

- [apps/api/src/modules/learning/course-project-content.ts](../../../apps/api/src/modules/learning/course-project-content.ts)
- [apps/web/app/studio/projects/workbench.tsx](../../../apps/web/app/studio/projects/workbench.tsx)
- [apps/web/app/studio/projects/projects.css](../../../apps/web/app/studio/projects/projects.css)

## STUDIO-21 原文到资料课程与生成任务

**输入**：授权来源页/段与版本、目标、source/zh-CN/en、时间预算、模型、可选已确认知识目标、修订号和请求键。

**处理与实现**：成人无需儿童档案可存文字/PDF；小课程v2冻结所选原文，最多10页/段及12000原文字符；长资料v3见STUDIO-23；单次序列化模型上下文不超过18000字符，超预算拒绝而不截断；持久任务冻结初始输入并固定实际模型，先规划1至6课与明确来源缺口，再逐课编写、逐课独立AI复核；以不结束租约的原子检查点保存路线、初稿与复核，失败/重启只补未完成阶段；复核按字段或单题应用修订并重新验证，uncertain仍需人工核查；核对短引用确实出现在选中原文，拒绝内部来源键混入讲解；候选可改标题/目标/选课；成人创建者可逐段修订完整讲解、板书、练习/答案/帮助和引用，整份校验后按修订号与请求键保存，保留初始稿与生成输入、时间和摘要，人工改稿后旧复核标明针对旧版；显式打开教学稿记录答案接触事实，自己的后续练习不算独立成功，孩子的正常学习不继承作者曝光；再审阅确认；重复请求恢复原任务/确认，取消/撤权/删除/旧租约不能发布；已确认课堂冻结独立版本，页级引用回到快照；共享孩子发布课在创作者关闭账号后保留。

**输出**：可恢复分阶段资料课程、实际进度/安全复核概况、私有首次稿对照、原始目标溯源、原文快照、蓝图审阅、实际课堂/私有练习、来源对照与课程库入口。

**状态与持久化**：`sourceCourses`、`studioSourceMaterials`、`classroomSessions`、`learningScopes`、`knowledgeAtoms`

**权限、失败与边界**：生成内容待教师审核，不自动取得教材映射或正式测量资格；当前提供中文/英文/沿用来源的请求选项，其他语言和全教材课程仍待；长PDF分块与引用回收见STUDIO-24/OPS-10，旧页图及恢复物理清理仍待。

**关联接口**：

- `GET /api/learning/source-courses/materials` → `SourceCourseController.materials`；[apps/api/src/modules/learning/source-course.controller.ts:11](../../../apps/api/src/modules/learning/source-course.controller.ts#L11)。
- `POST /api/learning/source-courses/materials/text` → `SourceCourseController.text`；[apps/api/src/modules/learning/source-course.controller.ts:16](../../../apps/api/src/modules/learning/source-course.controller.ts#L16)。
- `GET /api/learning/source-courses` → `SourceCourseController.list`；[apps/api/src/modules/learning/source-course.controller.ts:19](../../../apps/api/src/modules/learning/source-course.controller.ts#L19)。
- `POST /api/learning/source-courses` → `SourceCourseController.create`；[apps/api/src/modules/learning/source-course.controller.ts:20](../../../apps/api/src/modules/learning/source-course.controller.ts#L20)。
- `GET /api/learning/source-courses/:id` → `SourceCourseController.get`；[apps/api/src/modules/learning/source-course.controller.ts:24](../../../apps/api/src/modules/learning/source-course.controller.ts#L24)。
- `PATCH /api/learning/source-courses/:id` → `SourceCourseController.edit`；[apps/api/src/modules/learning/source-course.controller.ts:29](../../../apps/api/src/modules/learning/source-course.controller.ts#L29)。
- `POST /api/learning/source-courses/:id/authoring` → `SourceCourseController.authoring`；[apps/api/src/modules/learning/source-course.controller.ts:25](../../../apps/api/src/modules/learning/source-course.controller.ts#L25)。
- `PATCH /api/learning/source-courses/:id/content` → `SourceCourseController.content`；[apps/api/src/modules/learning/source-course.controller.ts:28](../../../apps/api/src/modules/learning/source-course.controller.ts#L28)。
- `POST /api/learning/source-courses/:id/confirm` → `SourceCourseController.confirm`；[apps/api/src/modules/learning/source-course.controller.ts:30](../../../apps/api/src/modules/learning/source-course.controller.ts#L30)。
- `POST /api/learning/source-courses/:id/cancel` → `SourceCourseController.cancel`；[apps/api/src/modules/learning/source-course.controller.ts:31](../../../apps/api/src/modules/learning/source-course.controller.ts#L31)。
- `POST /api/learning/source-courses/:id/retry` → `SourceCourseController.retry`；[apps/api/src/modules/learning/source-course.controller.ts:32](../../../apps/api/src/modules/learning/source-course.controller.ts#L32)。
- `POST /api/learning/source-courses/:id/archive` → `SourceCourseController.archive`；[apps/api/src/modules/learning/source-course.controller.ts:33](../../../apps/api/src/modules/learning/source-course.controller.ts#L33)。

**服务方法**：

- `SourceCourseService.materials`；[apps/api/src/modules/learning/source-course.service.ts:28](../../../apps/api/src/modules/learning/source-course.service.ts#L28)。
- `SourceCourseService.addText`；[apps/api/src/modules/learning/source-course.service.ts:36](../../../apps/api/src/modules/learning/source-course.service.ts#L36)。
- `SourceCourseService.list`；[apps/api/src/modules/learning/source-course.service.ts:86](../../../apps/api/src/modules/learning/source-course.service.ts#L86)。
- `SourceCourseService.create`；[apps/api/src/modules/learning/source-course.service.ts:96](../../../apps/api/src/modules/learning/source-course.service.ts#L96)。
- `SourceCourseService.get`；[apps/api/src/modules/learning/source-course.service.ts:83](../../../apps/api/src/modules/learning/source-course.service.ts#L83)。
- `SourceCourseService.edit`；[apps/api/src/modules/learning/source-course.service.ts:123](../../../apps/api/src/modules/learning/source-course.service.ts#L123)。
- `SourceCourseService.authoring`；[apps/api/src/modules/learning/source-course.service.ts:133](../../../apps/api/src/modules/learning/source-course.service.ts#L133)。
- `SourceCourseService.editContent`；[apps/api/src/modules/learning/source-course.service.ts:171](../../../apps/api/src/modules/learning/source-course.service.ts#L171)。
- `SourceCourseService.confirm`；[apps/api/src/modules/learning/source-course.service.ts:185](../../../apps/api/src/modules/learning/source-course.service.ts#L185)。
- `SourceCourseService.control`；[apps/api/src/modules/learning/source-course.service.ts:192](../../../apps/api/src/modules/learning/source-course.service.ts#L192)。

**补充实现文件**：

- [packages/contracts/src/source-course.ts](../../../packages/contracts/src/source-course.ts)
- [apps/api/src/modules/learning/source-course-content.ts](../../../apps/api/src/modules/learning/source-course-content.ts)
- [apps/api/src/modules/learning/source-course-worker.service.ts](../../../apps/api/src/modules/learning/source-course-worker.service.ts)
- [apps/api/src/modules/learning/source-course-pipeline.ts](../../../apps/api/src/modules/learning/source-course-pipeline.ts)
- [apps/api/src/modules/learning/source-course.integration.test.ts](../../../apps/api/src/modules/learning/source-course.integration.test.ts)
- [apps/web/app/studio/source-courses/workbench.tsx](../../../apps/web/app/studio/source-courses/workbench.tsx)
- [apps/web/app/studio/source-courses/content-editor.tsx](../../../apps/web/app/studio/source-courses/content-editor.tsx)
- [apps/web/app/studio/source-courses/generation-panel.tsx](../../../apps/web/app/studio/source-courses/generation-panel.tsx)
- [apps/web/app/studio/source-courses/original-manuscript.tsx](../../../apps/web/app/studio/source-courses/original-manuscript.tsx)
- [apps/web/app/studio/source-courses/source-courses.css](../../../apps/web/app/studio/source-courses/source-courses.css)
- [apps/api/src/common/http-body.ts](../../../apps/api/src/common/http-body.ts)
- [apps/api/src/common/http-body.integration.test.ts](../../../apps/api/src/common/http-body.integration.test.ts)
- [scripts/qa/source-course-fixture.cjs](../../../scripts/qa/source-course-fixture.cjs)
- [scripts/qa/source-course-test-api.cjs](../../../scripts/qa/source-course-test-api.cjs)
- [scripts/qa/run-source-course-browser.cjs](../../../scripts/qa/run-source-course-browser.cjs)
- [tests/e2e/source-course.spec.ts](../../../tests/e2e/source-course.spec.ts)

## STUDIO-23 长资料预检、原文分块与逐课编排

**输入**：完整页段及版本、生成目标、预检指纹、长模式确认、稳定课时ID、修订号和请求键。

**处理与实现**：无模型预检确定性分块，逐字符保留原文范围；长模式按块索引、分组路线、当前分配原文写稿及复核；独立阶段记录保存输入输出摘要、模型与实际计数，失败续跑跳过已完成部分并核验完整性；来源全文按页/块加载，进度不发送整本正文或答案；稳定课时身份支持删课重排与单课审稿，保留原始稿和人工修改，覆盖清单区分当前引用、原规划已移除、未采用及待核对；UTF-8文字原件走受控文件上传并按字节哈希保留，资料原件与新页图进入双库备份引用，家庭导出不含私有阶段答案。

**输出**：最长120页/段、180000字符、180块、24课的可恢复资料课程，原文使用清单与按课编辑。

**状态与持久化**：`sourceCourses`、`sourceCourseStages`、`studioSourceMaterials`

**权限、失败与边界**：单次模型上下文18000字符；小课程保留旧v2语义；长PDF上传与续跑见STUDIO-24；新页图有摘要，旧页图回填、恢复删除账本后的物理清理和全教材语义覆盖仍待。

**关联接口**：

- `POST /api/learning/source-courses/preflight` → `SourceCourseController.preflight`；[apps/api/src/modules/learning/source-course.controller.ts:21](../../../apps/api/src/modules/learning/source-course.controller.ts#L21)。
- `POST /api/learning/source-courses/materials/text-file` → `SourceCourseController.textFile`；[apps/api/src/modules/learning/source-course.controller.ts:17](../../../apps/api/src/modules/learning/source-course.controller.ts#L17)。
- `GET /api/learning/source-courses/:id/progress` → `SourceCourseController.progress`；[apps/api/src/modules/learning/source-course.controller.ts:22](../../../apps/api/src/modules/learning/source-course.controller.ts#L22)。
- `GET /api/learning/source-courses/:id/sources/:key` → `SourceCourseController.source`；[apps/api/src/modules/learning/source-course.controller.ts:23](../../../apps/api/src/modules/learning/source-course.controller.ts#L23)。
- `POST /api/learning/source-courses/:id/lessons/:lessonId/authoring` → `SourceCourseController.lessonAuthoring`；[apps/api/src/modules/learning/source-course.controller.ts:26](../../../apps/api/src/modules/learning/source-course.controller.ts#L26)。
- `PATCH /api/learning/source-courses/:id/lessons/:lessonId/content` → `SourceCourseController.lessonContent`；[apps/api/src/modules/learning/source-course.controller.ts:27](../../../apps/api/src/modules/learning/source-course.controller.ts#L27)。

**服务方法**：

- `SourceCourseService.preflight`；[apps/api/src/modules/learning/source-course.service.ts:95](../../../apps/api/src/modules/learning/source-course.service.ts#L95)。
- `SourceCourseService.addTextFile`；[apps/api/src/modules/learning/source-course.service.ts:49](../../../apps/api/src/modules/learning/source-course.service.ts#L49)。
- `SourceCourseService.progress`；[apps/api/src/modules/learning/source-course.service.ts:84](../../../apps/api/src/modules/learning/source-course.service.ts#L84)。
- `SourceCourseService.source`；[apps/api/src/modules/learning/source-course.service.ts:85](../../../apps/api/src/modules/learning/source-course.service.ts#L85)。
- `SourceCourseService.lessonAuthoring`；[apps/api/src/modules/learning/source-course.service.ts:141](../../../apps/api/src/modules/learning/source-course.service.ts#L141)。
- `SourceCourseService.editLesson`；[apps/api/src/modules/learning/source-course.service.ts:160](../../../apps/api/src/modules/learning/source-course.service.ts#L160)。

**补充实现文件**：

- [packages/contracts/src/source-course-compilation.ts](../../../packages/contracts/src/source-course-compilation.ts)
- [apps/api/src/modules/learning/source-course-chunks.ts](../../../apps/api/src/modules/learning/source-course-chunks.ts)
- [apps/api/src/modules/learning/source-course-selection.ts](../../../apps/api/src/modules/learning/source-course-selection.ts)
- [apps/api/src/modules/learning/source-course-compilation.ts](../../../apps/api/src/modules/learning/source-course-compilation.ts)
- [apps/api/src/modules/learning/source-course-compiler.service.ts](../../../apps/api/src/modules/learning/source-course-compiler.service.ts)
- [apps/api/src/modules/learning/source-course-compilation.integration.test.ts](../../../apps/api/src/modules/learning/source-course-compilation.integration.test.ts)
- [apps/api/src/modules/learning/source-course-chunks.test.ts](../../../apps/api/src/modules/learning/source-course-chunks.test.ts)
- [apps/api/src/infrastructure/source-material-backup.integration.test.ts](../../../apps/api/src/infrastructure/source-material-backup.integration.test.ts)
- [apps/web/app/studio/source-courses/compilation-panel.tsx](../../../apps/web/app/studio/source-courses/compilation-panel.tsx)
- [apps/web/app/studio/source-courses/compilation.css](../../../apps/web/app/studio/source-courses/compilation.css)
- [tests/e2e/source-course-long.spec.ts](../../../tests/e2e/source-course-long.spec.ts)

## STUDIO-22 当前节点配图、候选版本与离线笔记

**输入**：已授权会话/当前已展示节点、用途与补充要求、冻结内容身份、请求键和修订号。

**处理与实现**：仅用当前讲解及已出现要点构造少文字提示词；持久任务按租约隔离暂存并在最终事务重查权限和原节点，解码/哈希校验与去元数据后发布；失败/取消/重启恢复，取消请求与真正结束分开显示；版本只在原节点显式选用，并发选用保持唯一；下载鉴权与范围请求，损坏图可取消选用；放大支持键盘焦点，选图进入打印和嵌入PNG的离线HTML笔记；家庭导出/删除账本、双库备份和保守暂存回收贯通。

**输出**：可恢复生成任务、原节点参考图版本、授权实际字节、含图片的离线笔记。

**状态与持久化**：`classroomVisuals`、`classroomSessions`

**权限、失败与边界**：个人选用不等于教师批准或测量标定；初版图像可能有文字/关系错误，需核对；尚未实现插问自动生图、原页参考输入或可编辑图像迭代；浏览器替身只证交互。

**关联接口**：

- `GET /api/learning/classroom/sessions/:sessionId/visuals` → `ClassroomVisualController.list`；[apps/api/src/modules/learning/classroom-visual.controller.ts:10](../../../apps/api/src/modules/learning/classroom-visual.controller.ts#L10)。
- `POST /api/learning/classroom/sessions/:sessionId/visuals` → `ClassroomVisualController.create`；[apps/api/src/modules/learning/classroom-visual.controller.ts:16](../../../apps/api/src/modules/learning/classroom-visual.controller.ts#L16)。
- `POST /api/learning/classroom/sessions/:sessionId/visuals/:id/:action` → `ClassroomVisualController.action`；[apps/api/src/modules/learning/classroom-visual.controller.ts:24](../../../apps/api/src/modules/learning/classroom-visual.controller.ts#L24)。
- `GET /api/learning/classroom/sessions/:sessionId/visuals/:id/file` → `ClassroomVisualController.file`；[apps/api/src/modules/learning/classroom-visual.controller.ts:37](../../../apps/api/src/modules/learning/classroom-visual.controller.ts#L37)。

**服务方法**：

- `ClassroomVisualService.list`；[apps/api/src/modules/learning/classroom-visual.service.ts:25](../../../apps/api/src/modules/learning/classroom-visual.service.ts#L25)。
- `ClassroomVisualService.create`；[apps/api/src/modules/learning/classroom-visual.service.ts:26](../../../apps/api/src/modules/learning/classroom-visual.service.ts#L26)。
- `ClassroomVisualService.action`；[apps/api/src/modules/learning/classroom-visual.service.ts:55](../../../apps/api/src/modules/learning/classroom-visual.service.ts#L55)。
- `ClassroomVisualService.file`；[apps/api/src/modules/learning/classroom-visual.service.ts:122](../../../apps/api/src/modules/learning/classroom-visual.service.ts#L122)。

**补充实现文件**：

- [packages/contracts/src/classroom-visual.ts](../../../packages/contracts/src/classroom-visual.ts)
- [apps/api/src/modules/learning/classroom-visual-worker.service.ts](../../../apps/api/src/modules/learning/classroom-visual-worker.service.ts)
- [apps/api/src/modules/learning/classroom-visual-storage.ts](../../../apps/api/src/modules/learning/classroom-visual-storage.ts)
- [apps/api/src/modules/learning/classroom-visual-context.ts](../../../apps/api/src/modules/learning/classroom-visual-context.ts)
- [apps/api/src/modules/learning/classroom-visual-context.test.ts](../../../apps/api/src/modules/learning/classroom-visual-context.test.ts)
- [apps/api/src/modules/learning/classroom-visual.integration.test.ts](../../../apps/api/src/modules/learning/classroom-visual.integration.test.ts)
- [apps/api/src/modules/learning/classroom-visual-storage.test.ts](../../../apps/api/src/modules/learning/classroom-visual-storage.test.ts)
- [apps/web/app/studio/classroom/visuals.tsx](../../../apps/web/app/studio/classroom/visuals.tsx)
- [apps/web/app/studio/classroom/visuals.css](../../../apps/web/app/studio/classroom/visuals.css)
- [tests/e2e/classroom-visual.spec.ts](../../../tests/e2e/classroom-visual.spec.ts)

## STUDIO-24 长PDF分块上传、页级续跑与按需原文

**输入**：学习范围、文件SHA、4MiB分块、请求键、页码、资料版本和任务版本。

**处理与实现**：原件流式组装并核对完整字节；上传完成只排后台任务；最多120页按原件/算法身份保存完整JSON检查点与页图摘要，恢复时核验并只补缺失/损坏页；目录只发概要，按页且绑定版本取正文；两处入口支持中断重选、丢失回执恢复、范围批选和取消续跑；注册原件持文件租约并核对最新generation；学生入口沿学习授权验证。

**输出**：50MiB受控上传、120页真实进度、原件/正文/结构对照与可恢复选课。

**状态与持久化**：`studioMaterialUploads`、`studioSourceMaterials`、`studioMaterialAssets`

**权限、失败与边界**：运行预算不是静默裁切；旧30页/10MB同步接口兼容；OCR/模型结构仍为候选，旧页图摘要回填与删除账本恢复后的物理清理仍待。

**关联接口**：

- `GET /api/learning/material-uploads` → `StudioMaterialUploadController.list`；[apps/api/src/modules/learning/studio-material-upload.controller.ts:8](../../../apps/api/src/modules/learning/studio-material-upload.controller.ts#L8)。
- `POST /api/learning/material-uploads` → `StudioMaterialUploadController.start`；[apps/api/src/modules/learning/studio-material-upload.controller.ts:9](../../../apps/api/src/modules/learning/studio-material-upload.controller.ts#L9)。
- `GET /api/learning/material-uploads/:id` → `StudioMaterialUploadController.get`；[apps/api/src/modules/learning/studio-material-upload.controller.ts:10](../../../apps/api/src/modules/learning/studio-material-upload.controller.ts#L10)。
- `PUT /api/learning/material-uploads/:id/chunks/:index` → `StudioMaterialUploadController.chunk`；[apps/api/src/modules/learning/studio-material-upload.controller.ts:11](../../../apps/api/src/modules/learning/studio-material-upload.controller.ts#L11)。
- `POST /api/learning/material-uploads/:id/complete` → `StudioMaterialUploadController.complete`；[apps/api/src/modules/learning/studio-material-upload.controller.ts:12](../../../apps/api/src/modules/learning/studio-material-upload.controller.ts#L12)。
- `POST /api/learning/material-uploads/:id/cancel` → `StudioMaterialUploadController.cancel`；[apps/api/src/modules/learning/studio-material-upload.controller.ts:13](../../../apps/api/src/modules/learning/studio-material-upload.controller.ts#L13)。
- `GET /api/learning/source-courses/materials/:id` → `SourceCourseController.material`；[apps/api/src/modules/learning/source-course.controller.ts:13](../../../apps/api/src/modules/learning/source-course.controller.ts#L13)。
- `GET /api/learning/source-courses/materials/:id/progress` → `SourceCourseController.materialProgress`；[apps/api/src/modules/learning/source-course.controller.ts:12](../../../apps/api/src/modules/learning/source-course.controller.ts#L12)。
- `GET /api/learning/source-courses/materials/:id/pages/:page` → `SourceCourseController.materialPage`；[apps/api/src/modules/learning/source-course.controller.ts:14](../../../apps/api/src/modules/learning/source-course.controller.ts#L14)。
- `POST /api/learning/source-courses/materials/:id/process/cancel` → `SourceCourseController.cancelMaterialProcessing`；[apps/api/src/modules/learning/source-course.controller.ts:15](../../../apps/api/src/modules/learning/source-course.controller.ts#L15)。

**服务方法**：

- `StudioMaterialUploadService.list`；[apps/api/src/modules/learning/studio-material-upload.service.ts:37](../../../apps/api/src/modules/learning/studio-material-upload.service.ts#L37)。
- `StudioMaterialUploadService.start`；[apps/api/src/modules/learning/studio-material-upload.service.ts:38](../../../apps/api/src/modules/learning/studio-material-upload.service.ts#L38)。
- `StudioMaterialUploadService.get`；[apps/api/src/modules/learning/studio-material-upload.service.ts:48](../../../apps/api/src/modules/learning/studio-material-upload.service.ts#L48)。
- `StudioMaterialUploadService.chunk`；[apps/api/src/modules/learning/studio-material-upload.service.ts:57](../../../apps/api/src/modules/learning/studio-material-upload.service.ts#L57)。
- `StudioMaterialUploadService.complete`；[apps/api/src/modules/learning/studio-material-upload.service.ts:64](../../../apps/api/src/modules/learning/studio-material-upload.service.ts#L64)。
- `StudioMaterialUploadService.cancel`；[apps/api/src/modules/learning/studio-material-upload.service.ts:63](../../../apps/api/src/modules/learning/studio-material-upload.service.ts#L63)。
- `StudioMaterialUploadService.material`；[apps/api/src/modules/learning/studio-material-upload.service.ts:49](../../../apps/api/src/modules/learning/studio-material-upload.service.ts#L49)。
- `StudioMaterialUploadService.progress`；[apps/api/src/modules/learning/studio-material-upload.service.ts:74](../../../apps/api/src/modules/learning/studio-material-upload.service.ts#L74)。
- `StudioMaterialUploadService.page`；[apps/api/src/modules/learning/studio-material-upload.service.ts:50](../../../apps/api/src/modules/learning/studio-material-upload.service.ts#L50)。
- `StudioMaterialUploadService.cancelProcessing`；[apps/api/src/modules/learning/studio-material-upload.service.ts:75](../../../apps/api/src/modules/learning/studio-material-upload.service.ts#L75)。

**补充实现文件**：

- [packages/contracts/src/studio-material-upload.ts](../../../packages/contracts/src/studio-material-upload.ts)
- [apps/api/src/modules/learning/studio-material-storage.ts](../../../apps/api/src/modules/learning/studio-material-storage.ts)
- [apps/api/src/modules/learning/studio-material-upload.integration.test.ts](../../../apps/api/src/modules/learning/studio-material-upload.integration.test.ts)
- [scripts/processing/process_document.py](../../../scripts/processing/process_document.py)
- [scripts/processing/file_leases.py](../../../scripts/processing/file_leases.py)
- [apps/web/app/studio/source-courses/pdf-material.tsx](../../../apps/web/app/studio/source-courses/pdf-material.tsx)
- [tests/e2e/pdf-material.spec.ts](../../../tests/e2e/pdf-material.spec.ts)

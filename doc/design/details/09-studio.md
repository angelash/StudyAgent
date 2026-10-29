# 09 学习工作台、实时课堂、白板、学案与日历 — 详细设计

源码基线：`e84f0f451e9caf58109e8442cef641cb4f680b5a`。角色：家长、学生与授权教师；成人课程需成人身份。

产品入口：`/studio`、`/studio/classroom`、`/studio/projects`、`/studio/source-courses`、`/studio/whiteboards`。

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
- [packages/contracts/src/whiteboard-speech.ts](../../../packages/contracts/src/whiteboard-speech.ts)
- [packages/contracts/src/classroom.ts](../../../packages/contracts/src/classroom.ts)
- [packages/contracts/src/classroom-choice.ts](../../../packages/contracts/src/classroom-choice.ts)
- [packages/contracts/src/course-project.ts](../../../packages/contracts/src/course-project.ts)

## 关联验证

以下是对应功能领域的测试入口；测试文件存在不等于每个子场景已由真人或所有设备验证。

- [apps/api/src/modules/learning/whiteboard-speech.test.ts](../../../apps/api/src/modules/learning/whiteboard-speech.test.ts)
- [apps/api/src/modules/learning/whiteboard-webm.test.ts](../../../apps/api/src/modules/learning/whiteboard-webm.test.ts)
- [apps/api/src/modules/learning/whiteboard-postgres.integration.test.ts](../../../apps/api/src/modules/learning/whiteboard-postgres.integration.test.ts)
- [tests/e2e/whiteboard-media.spec.ts](../../../tests/e2e/whiteboard-media.spec.ts)
- [apps/api/src/modules/learning/studio-course.test.ts](../../../apps/api/src/modules/learning/studio-course.test.ts)
- [apps/api/src/modules/learning/studio.integration.test.ts](../../../apps/api/src/modules/learning/studio.integration.test.ts)
- [apps/api/src/modules/learning/classroom.integration.test.ts](../../../apps/api/src/modules/learning/classroom.integration.test.ts)
- [apps/api/src/modules/learning/classroom-unit-checks.test.ts](../../../apps/api/src/modules/learning/classroom-unit-checks.test.ts)
- [apps/api/src/modules/learning/classroom-practice-content.test.ts](../../../apps/api/src/modules/learning/classroom-practice-content.test.ts)
- [apps/api/src/modules/learning/classroom-choice.integration.test.ts](../../../apps/api/src/modules/learning/classroom-choice.integration.test.ts)
- [apps/api/src/modules/learning/classroom-choice-recovery.integration.test.ts](../../../apps/api/src/modules/learning/classroom-choice-recovery.integration.test.ts)
- [tests/e2e/classroom-choice.spec.ts](../../../tests/e2e/classroom-choice.spec.ts)
- [apps/api/src/modules/learning/course-project.integration.test.ts](../../../apps/api/src/modules/learning/course-project.integration.test.ts)
- [tests/e2e/course-project.spec.ts](../../../tests/e2e/course-project.spec.ts)
- [tests/e2e/studio.spec.ts](../../../tests/e2e/studio.spec.ts)
- [tests/e2e/classroom.spec.ts](../../../tests/e2e/classroom.spec.ts)
- [tests/e2e/classroom-review.spec.ts](../../../tests/e2e/classroom-review.spec.ts)
- [tests/e2e/classroom-practice.spec.ts](../../../tests/e2e/classroom-practice.spec.ts)
- [tests/e2e/course-library.spec.ts](../../../tests/e2e/course-library.spec.ts)
- [tests/e2e/course-builder.spec.ts](../../../tests/e2e/course-builder.spec.ts)
- [tests/e2e/workspace.spec.ts](../../../tests/e2e/workspace.spec.ts)

## STUDIO-36 九上化学课程、真实学科与独立核查

**输入**：本人档案、实际化学课程身份、单元/学期核查、原请求与课程版本。

**处理与实现**：课程库提供七单元28目标的原创九上化学教学路径，预览不建课，显式添加保留范围与原请求。真实课程决定subject/grade，旧数学参数不能覆盖化学正文；标题请求与所选学科/年级不符时拒绝，旧错误课程可按原指纹预检和精确修正，保留学生档案、原数学课程与作答。原生课堂、配套练习、独立核查、证据报告、原因核查、指导及到期复测沿现有流程。课程助教带实际化学原文/目标/来源，区分四年级档案与九年级课程，正式评测保护与原出处页头身份同调。

**输出**：可恢复原生课程与化学考核、独立作答记录、保留原版本的教学问答和来源。

**状态与持久化**：`studioCourses`、`learningScopes`、`diagnosticSessions`、`diagnosticResponses`、`diagnosticPlans`、`reviewTasks`

**权限、失败与边界**：2016配套规则题的数量不等于2016独立题族或常模；原创路径不是现行教材逐页恢复，参考目录/PDF不自动获教学资格。看过讲解、提示后作答、独立首答与模拟时钟结果分开；真实保持、教师审核、全模型与像素听感仍需证据。

**关联接口**：

- `GET /api/chemistry/catalog` → `ChemistryController.catalog`；[apps/api/src/modules/learning/chemistry.controller.ts:9](../../../apps/api/src/modules/learning/chemistry.controller.ts#L9)。
- `POST /api/chemistry/enroll` → `ChemistryController.enroll`；[apps/api/src/modules/learning/chemistry.controller.ts:10](../../../apps/api/src/modules/learning/chemistry.controller.ts#L10)。
- `POST /api/chemistry/checkpoints/start` → `ChemistryController.start`；[apps/api/src/modules/learning/chemistry.controller.ts:11](../../../apps/api/src/modules/learning/chemistry.controller.ts#L11)。

**服务方法**：

- `ChemistryService.catalog`；[apps/api/src/modules/learning/chemistry.service.ts:97](../../../apps/api/src/modules/learning/chemistry.service.ts#L97)。
- `ChemistryService.enroll`；[apps/api/src/modules/learning/chemistry.service.ts:127](../../../apps/api/src/modules/learning/chemistry.service.ts#L127)。
- `ChemistryService.start`；[apps/api/src/modules/learning/chemistry.service.ts:153](../../../apps/api/src/modules/learning/chemistry.service.ts#L153)。

**补充实现文件**：

- [apps/api/src/modules/diagnostics/chemistry-curriculum.ts](../../../apps/api/src/modules/diagnostics/chemistry-curriculum.ts)
- [apps/api/src/modules/diagnostics/chemistry-curriculum.test.ts](../../../apps/api/src/modules/diagnostics/chemistry-curriculum.test.ts)
- [apps/api/src/modules/learning/chemistry.controller.ts](../../../apps/api/src/modules/learning/chemistry.controller.ts)
- [apps/api/src/modules/learning/chemistry-course.ts](../../../apps/api/src/modules/learning/chemistry-course.ts)
- [apps/api/src/modules/learning/chemistry-course-correction.ts](../../../apps/api/src/modules/learning/chemistry-course-correction.ts)
- [apps/api/src/modules/learning/chemistry.integration.test.ts](../../../apps/api/src/modules/learning/chemistry.integration.test.ts)
- [apps/api/src/modules/learning/chemistry-course-correction.integration.test.ts](../../../apps/api/src/modules/learning/chemistry-course-correction.integration.test.ts)
- [apps/api/src/modules/ai/assistant-chemistry.integration.test.ts](../../../apps/api/src/modules/ai/assistant-chemistry.integration.test.ts)
- [packages/contracts/src/chemistry.ts](../../../packages/contracts/src/chemistry.ts)
- [packages/contracts/src/studio-course-request.ts](../../../packages/contracts/src/studio-course-request.ts)
- [apps/web/app/studio/chemistry-course-tools.tsx](../../../apps/web/app/studio/chemistry-course-tools.tsx)
- [apps/web/app/studio/course-assessments.css](../../../apps/web/app/studio/course-assessments.css)
- [tests/e2e/chemistry.spec.ts](../../../tests/e2e/chemistry.spec.ts)
- [doc/product/142-guangzhou-chemistry-teaching-validation.md](../../../doc/product/142-guangzhou-chemistry-teaching-validation.md)
- [doc/product/143-chemistry-course-content-correction.md](../../../doc/product/143-chemistry-course-content-correction.md)

## STUDIO-01 统一工作台、课程筛选与连续学习

**输入**：view、student、subject、course、关键词、状态、类型、来源、最近学习与排序。

**处理与实现**：成人与当前档案小学课统一列表；真实记录区分未开始/进行中/讲解已读；关键词覆盖名称目标教材，组合筛选可清空；地址记条件，刷新/历史/进入目录及课堂返回保留；断点标题与目标一致；按身份连接GESP独立轨道；显式档案先校验授权，不回退另一孩子。

**输出**：可恢复课程列表、真实阅读计数、最近活动与范围总览。

**状态与持久化**：`studioCourses`、`studioActivities`、`classroomSessions`

**权限、失败与边界**：筛选针对当前授权课程；完成表示讲解已读，不能当掌握或所有项目完成；GESP与成人记录不合并进小学测量。

**关联接口**：

- `GET /api/learning/studio/overview` → `LearningController.studioOverview`；[apps/api/src/modules/learning/learning.controller.ts:19](../../../apps/api/src/modules/learning/learning.controller.ts#L19)。

**服务方法**：

- `LearningService.studioOverview`；[apps/api/src/modules/learning/learning.service.ts:73](../../../apps/api/src/modules/learning/learning.service.ts#L73)。

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

- `POST /api/learning/studio/courses/preview` → `LearningController.studioCoursePreview`；[apps/api/src/modules/learning/learning.controller.ts:23](../../../apps/api/src/modules/learning/learning.controller.ts#L23)。
- `POST /api/learning/studio/courses` → `LearningController.studioCourseCreate`；[apps/api/src/modules/learning/learning.controller.ts:26](../../../apps/api/src/modules/learning/learning.controller.ts#L26)。
- `POST /api/learning/studio/courses/:courseId/lessons/:lessonId/start` → `LearningController.studioLessonStart`；[apps/api/src/modules/learning/learning.controller.ts:29](../../../apps/api/src/modules/learning/learning.controller.ts#L29)。

**服务方法**：

- `LearningService.previewStudioCourse`；[apps/api/src/modules/learning/learning.service.ts:538](../../../apps/api/src/modules/learning/learning.service.ts#L538)。
- `LearningService.createStudioCourse`；[apps/api/src/modules/learning/learning.service.ts:556](../../../apps/api/src/modules/learning/learning.service.ts#L556)。
- `LearningService.startStudioLesson`；[apps/api/src/modules/learning/learning.service.ts:585](../../../apps/api/src/modules/learning/learning.service.ts#L585)。

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

- `ClassroomService.catalog`；[apps/api/src/modules/learning/classroom.service.ts:32](../../../apps/api/src/modules/learning/classroom.service.ts#L32)。

## STUDIO-04 课堂会话、冻结双语字幕与旧断点升级

**输入**：lessonId、expectedRevision、cursor/revealed/sentenceCursor、presentationVersion/unitId及升级requestKey。

**处理与实现**：冻结课件、私有答案与提示；新会话服务端保存中英文单元的原文UTF-16范围、源哈希与稳定ID，保护数字/缩写/URL/代码；字幕、音轨、进度、表格行和配图上下文共用单元，音轨结束推进，只预取下一句；暂停同步中止旧请求和晚到音轨。旧会话保留确切旧规则，设置中显式按原句起点映射升级，保留原表现快照、答案与提示；同键重放和冲突后读取保护恢复。

**输出**：可恢复逐句讲解、完整提炼笔记、版本历史与原始练习事实。

**状态与持久化**：`classroomSessions`

**权限、失败与边界**：刷新从当前句开头恢复，升级后暂停；关闭窗口只停止等待，不能撤销服务端已提交操作；静音用字符/词数估计，不是强制声学对齐；有限分句规则不保证所有语言或缩写；教师/听感/实机仍需验收。

**关联接口**：

- `POST /api/learning/classroom/sessions` → `ClassroomController.open`；[apps/api/src/modules/learning/classroom.controller.ts:10](../../../apps/api/src/modules/learning/classroom.controller.ts#L10)。
- `GET /api/learning/classroom/sessions/:id` → `ClassroomController.get`；[apps/api/src/modules/learning/classroom.controller.ts:11](../../../apps/api/src/modules/learning/classroom.controller.ts#L11)。
- `PATCH /api/learning/classroom/sessions/:id` → `ClassroomController.progress`；[apps/api/src/modules/learning/classroom.controller.ts:13](../../../apps/api/src/modules/learning/classroom.controller.ts#L13)。
- `POST /api/learning/classroom/sessions/:id/narration/:stepId` → `ClassroomController.narration`；[apps/api/src/modules/learning/classroom.controller.ts:32](../../../apps/api/src/modules/learning/classroom.controller.ts#L32)。
- `POST /api/learning/classroom/sessions/:id/presentation` → `ClassroomController.presentation`；[apps/api/src/modules/learning/classroom.controller.ts:16](../../../apps/api/src/modules/learning/classroom.controller.ts#L16)。

**服务方法**：

- `ClassroomService.open`；[apps/api/src/modules/learning/classroom.service.ts:101](../../../apps/api/src/modules/learning/classroom.service.ts#L101)。
- `ClassroomService.get`；[apps/api/src/modules/learning/classroom.service.ts:91](../../../apps/api/src/modules/learning/classroom.service.ts#L91)。
- `ClassroomService.progress`；[apps/api/src/modules/learning/classroom.service.ts:154](../../../apps/api/src/modules/learning/classroom.service.ts#L154)。
- `ClassroomService.narration`；[apps/api/src/modules/learning/classroom.service.ts:315](../../../apps/api/src/modules/learning/classroom.service.ts#L315)。
- `ClassroomService.upgradePresentation`；[apps/api/src/modules/learning/classroom.service.ts:179](../../../apps/api/src/modules/learning/classroom.service.ts#L179)。

**补充实现文件**：

- [packages/contracts/src/classroom-speech.ts](../../../packages/contracts/src/classroom-speech.ts)
- [apps/api/src/modules/learning/classroom-presentation.ts](../../../apps/api/src/modules/learning/classroom-presentation.ts)
- [apps/api/src/modules/learning/classroom-presentation.test.ts](../../../apps/api/src/modules/learning/classroom-presentation.test.ts)
- [apps/api/src/modules/learning/classroom-presentation.integration.test.ts](../../../apps/api/src/modules/learning/classroom-presentation.integration.test.ts)
- [apps/web/app/studio/classroom/captions.tsx](../../../apps/web/app/studio/classroom/captions.tsx)
- [apps/web/app/studio/classroom/captions.css](../../../apps/web/app/studio/classroom/captions.css)
- [tests/e2e/classroom-captions.spec.ts](../../../tests/e2e/classroom-captions.spec.ts)
- [scripts/qa/classroom-caption-live.cjs](../../../scripts/qa/classroom-caption-live.cjs)

## STUDIO-05 持久课堂插问、五种讲法与原句恢复

**输入**：当前课/步骤/字幕单元/问题、五种意图、固定modelId、稳定请求键。

**处理与实现**：发送前暂停并等待进度保存；冻结已展示字幕、原句位置与受限上下文；业务记录和任务同事务；重放先于上限和新模型解析，同键异参拒绝；任务在当前授权和租约栅栏下保存唯一消息与补充板书；新插问协议校验短要点、同维度对照表、受限LaTeX和原词句锚点，绑定服务端冻结字幕单元；朗读与按句阅读整体揭示要点/表格行/公式，停止结清音频/计时等待，旧回调隔离；旧笔记完整可读，Markdown/自包含MathML离线HTML/打印保留完整图表；帮助事实在生成前保存，取消不抹去。浏览器可找回丢失回执、刷新读取、取消/显式重试，主动回到原句。

**输出**：可查询轮次、五讲法入口、单轮消息/板书、原句恢复点与实际模型身份。

**状态与持久化**：`classroomSessions`、`classroomTurns`

**权限、失败与边界**：板书不逐字转写，私有答案/提示和未来字幕不送入模型；模型文本只作教学建议。崩溃发生在外部模型已答但领域尚未提交时可能重新调用，保证唯一发布而非供应商恰好调用一次；完整自适应策略、像素/声音及真人效果仍待。

**关联接口**：

- `POST /api/learning/classroom/sessions/:id/messages` → `ClassroomController.ask`；[apps/api/src/modules/learning/classroom.controller.ts:25](../../../apps/api/src/modules/learning/classroom.controller.ts#L25)。
- `GET /api/learning/classroom/sessions/:sessionId/turns` → `ClassroomTurnController.list`；[apps/api/src/modules/learning/classroom-turn.controller.ts:9](../../../apps/api/src/modules/learning/classroom-turn.controller.ts#L9)。
- `GET /api/learning/classroom/sessions/:sessionId/turns/:id` → `ClassroomTurnController.get`；[apps/api/src/modules/learning/classroom-turn.controller.ts:10](../../../apps/api/src/modules/learning/classroom-turn.controller.ts#L10)。
- `POST /api/learning/classroom/sessions/:sessionId/turns` → `ClassroomTurnController.create`；[apps/api/src/modules/learning/classroom-turn.controller.ts:11](../../../apps/api/src/modules/learning/classroom-turn.controller.ts#L11)。
- `POST /api/learning/classroom/sessions/:sessionId/turns/:id/cancel` → `ClassroomTurnController.cancel`；[apps/api/src/modules/learning/classroom-turn.controller.ts:12](../../../apps/api/src/modules/learning/classroom-turn.controller.ts#L12)。
- `POST /api/learning/classroom/sessions/:sessionId/turns/:id/retry` → `ClassroomTurnController.retry`；[apps/api/src/modules/learning/classroom-turn.controller.ts:13](../../../apps/api/src/modules/learning/classroom-turn.controller.ts#L13)。

**服务方法**：

- `ClassroomService.ask`；[apps/api/src/modules/learning/classroom.service.ts:271](../../../apps/api/src/modules/learning/classroom.service.ts#L271)。
- `ClassroomTurnService.list`；[apps/api/src/modules/learning/classroom-turn.service.ts:64](../../../apps/api/src/modules/learning/classroom-turn.service.ts#L64)。
- `ClassroomTurnService.get`；[apps/api/src/modules/learning/classroom-turn.service.ts:68](../../../apps/api/src/modules/learning/classroom-turn.service.ts#L68)。
- `ClassroomTurnService.create`；[apps/api/src/modules/learning/classroom-turn.service.ts:70](../../../apps/api/src/modules/learning/classroom-turn.service.ts#L70)。
- `ClassroomTurnService.control`；[apps/api/src/modules/learning/classroom-turn.service.ts:126](../../../apps/api/src/modules/learning/classroom-turn.service.ts#L126)。

**补充实现文件**：

- [packages/contracts/src/classroom-turn.ts](../../../packages/contracts/src/classroom-turn.ts)
- [apps/api/src/modules/learning/classroom-turn-record.ts](../../../apps/api/src/modules/learning/classroom-turn-record.ts)
- [apps/api/src/modules/learning/classroom-turn-worker.service.ts](../../../apps/api/src/modules/learning/classroom-turn-worker.service.ts)
- [apps/api/src/modules/learning/classroom-turn.controller.ts](../../../apps/api/src/modules/learning/classroom-turn.controller.ts)
- [apps/api/src/modules/learning/classroom-turn.integration.test.ts](../../../apps/api/src/modules/learning/classroom-turn.integration.test.ts)
- [apps/web/app/studio/classroom/turns.tsx](../../../apps/web/app/studio/classroom/turns.tsx)
- [tests/e2e/classroom-turns.spec.ts](../../../tests/e2e/classroom-turns.spec.ts)
- [scripts/qa/verify-classroom-turn-live.cjs](../../../scripts/qa/verify-classroom-turn-live.cjs)
- [packages/contracts/src/classroom-board.ts](../../../packages/contracts/src/classroom-board.ts)
- [apps/api/src/modules/ai/classroom-reply-board.ts](../../../apps/api/src/modules/ai/classroom-reply-board.ts)
- [apps/api/src/modules/ai/classroom-reply-board.test.ts](../../../apps/api/src/modules/ai/classroom-reply-board.test.ts)
- [apps/web/app/studio/classroom/reply-board.tsx](../../../apps/web/app/studio/classroom/reply-board.tsx)
- [apps/web/app/studio/classroom/board-formula.ts](../../../apps/web/app/studio/classroom/board-formula.ts)
- [apps/web/app/studio/classroom/reply-board-notes.ts](../../../apps/web/app/studio/classroom/reply-board-notes.ts)
- [apps/web/app/studio/classroom/reply-reading.ts](../../../apps/web/app/studio/classroom/reply-reading.ts)
- [tests/e2e/classroom-boards.spec.ts](../../../tests/e2e/classroom-boards.spec.ts)
- [scripts/qa/verify-classroom-board-live.cjs](../../../scripts/qa/verify-classroom-board-live.cjs)

## STUDIO-06 全微课练习、逐级帮助与复盘

**输入**：questionId、旧selectedIndex/null或classroom-choice-v2完整集合、answered/skip/dont_know、提示level、requestKey、projectDraft。

**处理与实现**：微课185题与独立编写单元60题分开；三个微课和一个单元核查含五项多选，精确集合评分与逐选项解释只在首答后公开；每课至少3题，含30表格题和2图示题；两级提示私有冻结，先记录再逐级返回，重复/丢失回执不升级；首次答案锁定，记录提示级别；复盘区分独立正确、答错、跳过、不会和辅助；新旧练习不混合，项目草稿可恢复；独立练习错误可见；账号/冻结会话缓存原选择与完整提交，掉回执先读首答再重放同命令，明确拒绝保留副本，键盘限题目区域，图片全屏恢复原焦点。

**输出**：245个不同题目ID、单选/多选首答与逐项反馈、逐级提示回执、具体复盘、旧版记录和项目草稿。

**状态与持久化**：`classroomSessions`

**权限、失败与边界**：题目待逐题教师审核与真人验证；3题和不同情境不代表心理测量齐备；四个代表性多选不能代表全课程已审核，不能替代主观理由、项目量规或直接推断稳定掌握。

**关联接口**：

- `POST /api/learning/classroom/sessions/:id/answers` → `ClassroomController.answer`；[apps/api/src/modules/learning/classroom.controller.ts:19](../../../apps/api/src/modules/learning/classroom.controller.ts#L19)。
- `POST /api/learning/classroom/sessions/:id/hints` → `ClassroomController.hint`；[apps/api/src/modules/learning/classroom.controller.ts:22](../../../apps/api/src/modules/learning/classroom.controller.ts#L22)。

**服务方法**：

- `ClassroomService.answer`；[apps/api/src/modules/learning/classroom.service.ts:197](../../../apps/api/src/modules/learning/classroom.service.ts#L197)。
- `ClassroomService.hint`；[apps/api/src/modules/learning/classroom.service.ts:246](../../../apps/api/src/modules/learning/classroom.service.ts#L246)。

**补充实现文件**：

- [apps/api/src/modules/learning/classroom-unit-checks.ts](../../../apps/api/src/modules/learning/classroom-unit-checks.ts)
- [apps/api/src/modules/learning/classroom-practice-content.ts](../../../apps/api/src/modules/learning/classroom-practice-content.ts)
- [apps/api/src/modules/learning/classroom-practice-model.ts](../../../apps/api/src/modules/learning/classroom-practice-model.ts)
- [apps/api/src/modules/learning/classroom-practice-u1.ts](../../../apps/api/src/modules/learning/classroom-practice-u1.ts)
- [apps/api/src/modules/learning/classroom-practice-u2.ts](../../../apps/api/src/modules/learning/classroom-practice-u2.ts)
- [apps/api/src/modules/learning/classroom-practice-u3.ts](../../../apps/api/src/modules/learning/classroom-practice-u3.ts)
- [apps/api/src/modules/learning/classroom-practice-u4.ts](../../../apps/api/src/modules/learning/classroom-practice-u4.ts)
- [apps/api/src/modules/learning/classroom-practice-u5.ts](../../../apps/api/src/modules/learning/classroom-practice-u5.ts)
- [apps/api/src/modules/learning/classroom-choice-content.ts](../../../apps/api/src/modules/learning/classroom-choice-content.ts)
- [packages/contracts/src/classroom-choice.ts](../../../packages/contracts/src/classroom-choice.ts)
- [apps/web/app/studio/classroom/practice-draft.ts](../../../apps/web/app/studio/classroom/practice-draft.ts)
- [apps/web/app/studio/classroom/practice-panel.tsx](../../../apps/web/app/studio/classroom/practice-panel.tsx)
- [apps/web/app/studio/classroom/practice-review.css](../../../apps/web/app/studio/classroom/practice-review.css)

## STUDIO-07 课堂图表与可恢复代码实验

**输入**：受控image/table/code blocks；冻结会话/步骤/块、原代码摘要、代码、输入、版本和稳定请求键。

**处理与实现**：图片可放大、表格逐行呈现；个人代码/输入按冻结会话和已曝光块隔离保存，不覆盖课件。稳定命令先重放、版本冲突保留本地文本并显式选择；标签页缓存支持离线刷新与丢回执，后台保存序列化。进入实验暂停讲解；Worker支持readLine/只读输入数组、异步计算、正常/错误/超时/停止反馈，限制网络/DOM/子Worker及运行时间；超长程序拒绝而不截断。支持重置确认和单独导出个人代码/输入。

**输出**：图表、可恢复个人代码草稿、输入/输出、明确运行状态和可下载JSON草稿。

**状态与持久化**：`classroomSessions`、`classroomCodeDrafts`

**权限、失败与边界**：个人实验不作为独立测量或掌握证据；输出是浏览器计算结果，没有服务器执行路径。JavaScript与GESP C++仍是不同轨道；实机编辑/键盘、完整C++课堂与原站未观察细节仍待。

**关联接口**：

- `GET /api/learning/classroom/sessions/:sessionId/code-drafts/:stepId/:blockId` → `ClassroomCodeController.get`；[apps/api/src/modules/learning/classroom-code.controller.ts:9](../../../apps/api/src/modules/learning/classroom-code.controller.ts#L9)。
- `PATCH /api/learning/classroom/sessions/:sessionId/code-drafts/:stepId/:blockId` → `ClassroomCodeController.save`；[apps/api/src/modules/learning/classroom-code.controller.ts:12](../../../apps/api/src/modules/learning/classroom-code.controller.ts#L12)。

**服务方法**：

- `ClassroomCodeService.get`；[apps/api/src/modules/learning/classroom-code.service.ts:33](../../../apps/api/src/modules/learning/classroom-code.service.ts#L33)。
- `ClassroomCodeService.save`；[apps/api/src/modules/learning/classroom-code.service.ts:37](../../../apps/api/src/modules/learning/classroom-code.service.ts#L37)。

**补充实现文件**：

- [packages/contracts/src/classroom-code.ts](../../../packages/contracts/src/classroom-code.ts)
- [apps/api/src/modules/learning/classroom-code.controller.ts](../../../apps/api/src/modules/learning/classroom-code.controller.ts)
- [apps/api/src/modules/learning/classroom-code.integration.test.ts](../../../apps/api/src/modules/learning/classroom-code.integration.test.ts)
- [apps/web/app/studio/classroom/code-draft.tsx](../../../apps/web/app/studio/classroom/code-draft.tsx)
- [apps/web/app/studio/classroom/runner/route.ts](../../../apps/web/app/studio/classroom/runner/route.ts)
- [apps/web/app/studio/classroom/code-workbench.tsx](../../../apps/web/app/studio/classroom/code-workbench.tsx)
- [apps/web/app/studio/classroom/board-step.tsx](../../../apps/web/app/studio/classroom/board-step.tsx)
- [tests/e2e/classroom-code.spec.ts](../../../tests/e2e/classroom-code.spec.ts)

## STUDIO-08 课堂控制、导出与移动交互

**输入**：音色、倍速、字体、背景、显示面板、七步控件导览和导出命令。

**处理与实现**：支持播放/暂停/停止、静音阅读、音色选择和六档键盘语速滑杆。460px设置内音色选择与试听独立；试听复用已授权音轨接口，只读已展示冻结当前句，停止/关闭/卸载会中断请求和音频，不推进进度或改选音色。欢迎、七个真实控件高亮和结束页共用焦点围栏；滚动/窗口变化重算矩形，手机切到实际控件区域，关闭恢复原布局并保持暂停，背景不能触发录音或发送。受控SVG/课件图片共用完整标题、焦点恢复、遮罩/Esc退出与失败说明，内层点击不关闭；放大先暂停讲解，打印不含弹层或放大按钮。持久化偏好、已读板书及插问Markdown/PDF导出和退出项目保存继续保留。

**输出**：锚点导览、独立当前句试听、图形阅读、可下载笔记与跨设备尺寸适配。

**状态与持久化**：`classroomSessions`

**权限、失败与边界**：显示偏好在浏览器本地；导出只含已揭示内容。试听需先展示当前句，尚非课前通用样本；替身音轨只证播放交互。原字体/CSS、完整自由白板和真人声音对照仍待；不等于100%像素或整套教学验收。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

**补充实现文件**：

- [apps/web/app/studio/classroom/tool-tour.tsx](../../../apps/web/app/studio/classroom/tool-tour.tsx)
- [apps/web/app/studio/classroom/tool-tour.css](../../../apps/web/app/studio/classroom/tool-tour.css)
- [apps/web/app/studio/classroom/figure-reader.tsx](../../../apps/web/app/studio/classroom/figure-reader.tsx)
- [apps/web/app/studio/classroom/figure-reader.css](../../../apps/web/app/studio/classroom/figure-reader.css)
- [apps/web/app/studio/classroom/voice-preview.tsx](../../../apps/web/app/studio/classroom/voice-preview.tsx)
- [apps/web/app/studio/classroom/diagram.tsx](../../../apps/web/app/studio/classroom/diagram.tsx)
- [apps/web/app/studio/classroom/board-step.tsx](../../../apps/web/app/studio/classroom/board-step.tsx)
- [tests/e2e/classroom-tools.spec.ts](../../../tests/e2e/classroom-tools.spec.ts)

## STUDIO-09 自由主题白板预览与持久保存

**输入**：学生、学科、主题、可选已审核知识点、原预览指纹和请求键。

**处理与实现**：规则生成分幕标题、概念、步骤、图形和检查点，示范旁白覆盖完整步骤；所有重放前先核对当前学生权限；原请求回执绑定本人、动作摘要、范围与原白板，同文新键记录自己的回执，旧无法证明关联的键明确冲突且保留原稿。

**输出**：冻结StudioWhiteboard、幕序与原操作回执。

**状态与持久化**：`studioWhiteboards`、`studioActivities`

**权限、失败与边界**：本旧接口仍是教学卡或通用模板；独立任意主题AI见STUDIO-31，旧稿与指纹不被逐句投影回写。

**关联接口**：

- `POST /api/learning/studio/whiteboards/preview` → `LearningController.studioWhiteboardPreview`；[apps/api/src/modules/learning/learning.controller.ts:33](../../../apps/api/src/modules/learning/learning.controller.ts#L33)。
- `POST /api/learning/studio/whiteboards` → `LearningController.studioWhiteboardCreate`；[apps/api/src/modules/learning/learning.controller.ts:36](../../../apps/api/src/modules/learning/learning.controller.ts#L36)。

**服务方法**：

- `LearningService.previewStudioWhiteboard`；[apps/api/src/modules/learning/learning.service.ts:228](../../../apps/api/src/modules/learning/learning.service.ts#L228)。
- `LearningService.createStudioWhiteboard`；[apps/api/src/modules/learning/learning.service.ts:240](../../../apps/api/src/modules/learning/learning.service.ts#L240)。

**补充实现文件**：

- [apps/api/src/modules/learning/studio-whiteboard.ts](../../../apps/api/src/modules/learning/studio-whiteboard.ts)

## STUDIO-10 逐句白板、真实音轨与一致视频字幕时间表

**输入**：原白板/幕、whiteboard-speech-v1、指纹/原文单位、音色、速度、当前账号与浏览器能力。

**处理与实现**：只读派生稳定原文跨度和整项板书；本机原字体真实登记及字形准备后才测量、播放和录制，失败字族可明确重建并重试；原白板/设置CSS按选择器、动画和注册属性作用域接入，已有课堂之外的页面不受影响；按真实字形冻结单列/双列知识块，标题/要点/整表行累积，换幕不清除已讲内容；缩放、指针/方向键平移、字体及点阵不改讲解句和学习记录；字幕仅当前完整句；长公式保留不低于0.8的原字形比例并分完整页面逐项进入，自动相机跟随原句位置；实时画布按可见尺寸绘制，独立1280×720录制画布共用相同内容布局与真实音轨表；新请求只合成冻结单位，controller传原登录及断开信号，合成前后各在新事务核对登录、角色、监护绑定、学生授权代次和原白板摘要；退出/授权升代或撤权拒绝迟到音轨，旧voice-only请求同样保护；换句在React清理前同步升代、撤销请求及旧帧并重置进度，防止下一真实音轨从末尾开始；Audio ended推进云朗读、文字显式估计；当前实际playing后仅准备一条相邻音轨，独立60秒请求/10秒元数据时限，交接复用准确单位且重新读取原白板授权；暂停取消未完成准备，准确手动下一句仍暂停并保留已准备音轨，音色/模式/导出/关闭释放准备槽，失败停在原句等待显式重试；暂停/已知秒数续播、拖动、换音色与关闭按代次清理；完整讲稿/笔记可访问，位置按账号/孩子/原稿绑定。实际解码或文字估计形成单一导出表，Canvas/WebM/SRT共用；只修WebM Info时长而保留原时间单位/未知大小与包数据；零值活动源及120ms静音尾段保留末尾音频，不延长旁白字幕；取消/录制异常不下载半成品，后续取消录制保留原成功导出的SRT表。

**输出**：当前句、完整笔记、可恢复位置、WebM和逐句SRT。

**状态与持久化**：`studioWhiteboards`

**权限、失败与边界**：云失败明确重试或手动选文字；浏览器不支持录制时保留字幕。当前实际小视频和合成WAV不能替代真人听感/设备/完整原CSS字体DPR；真实AIGW小样与端点替身分别留证；独立任意主题AI见STUDIO-31，复杂图形仍待。

**关联接口**：

- `POST /api/learning/studio/whiteboards/:id/narration/:sceneId` → `LearningController.studioWhiteboardNarration`；[apps/api/src/modules/learning/learning.controller.ts:67](../../../apps/api/src/modules/learning/learning.controller.ts#L67)。

**服务方法**：

- `LearningService.studioWhiteboardNarration`；[apps/api/src/modules/learning/learning.service.ts:514](../../../apps/api/src/modules/learning/learning.service.ts#L514)。

**补充实现文件**：

- [apps/api/src/modules/learning/studio-whiteboard-access.ts](../../../apps/api/src/modules/learning/studio-whiteboard-access.ts)
- [packages/contracts/src/whiteboard-speech.ts](../../../packages/contracts/src/whiteboard-speech.ts)
- [apps/web/app/studio/whiteboard-player.tsx](../../../apps/web/app/studio/whiteboard-player.tsx)
- [apps/web/app/studio/whiteboard-session.tsx](../../../apps/web/app/studio/whiteboard-session.tsx)
- [apps/web/app/studio/whiteboard-canvas.tsx](../../../apps/web/app/studio/whiteboard-canvas.tsx)
- [apps/web/app/studio/whiteboard-media.ts](../../../apps/web/app/studio/whiteboard-media.ts)
- [apps/web/app/studio/whiteboard-webm.ts](../../../apps/web/app/studio/whiteboard-webm.ts)
- [apps/web/app/studio/whiteboard-narration.ts](../../../apps/web/app/studio/whiteboard-narration.ts)
- [apps/web/app/studio/whiteboard-frame.ts](../../../apps/web/app/studio/whiteboard-frame.ts)
- [apps/web/lib/original-teaching-fonts.ts](../../../apps/web/lib/original-teaching-fonts.ts)
- [apps/web/lib/original-teaching-fonts.json](../../../apps/web/lib/original-teaching-fonts.json)
- [apps/web/app/studio/original-teaching-shell.generated.css](../../../apps/web/app/studio/original-teaching-shell.generated.css)
- [apps/web/app/studio/original-teaching-shell.css](../../../apps/web/app/studio/original-teaching-shell.css)
- [apps/web/lib/original-teaching-styles.json](../../../apps/web/lib/original-teaching-styles.json)
- [scripts/reference/import-hyperknow-assets.cjs](../../../scripts/reference/import-hyperknow-assets.cjs)
- [scripts/reference/build-hyperknow-fonts.cjs](../../../scripts/reference/build-hyperknow-fonts.cjs)
- [scripts/reference/build-hyperknow-teaching-styles.cjs](../../../scripts/reference/build-hyperknow-teaching-styles.cjs)
- [tests/e2e/original-teaching-fonts.spec.ts](../../../tests/e2e/original-teaching-fonts.spec.ts)
- [doc/product/129-hyperknow-original-assets-and-teaching-shell.md](../../../doc/product/129-hyperknow-original-assets-and-teaching-shell.md)
- [tests/e2e/whiteboard-timing.ts](../../../tests/e2e/whiteboard-timing.ts)
- [tests/e2e/whiteboard-media.spec.ts](../../../tests/e2e/whiteboard-media.spec.ts)
- [doc/product/125-whiteboard-continuous-narration-and-bounded-preparation.md](../../../doc/product/125-whiteboard-continuous-narration-and-bounded-preparation.md)
- [doc/evidence/2026-10-26/whiteboard-continuity-acceptance.json](../../../doc/evidence/2026-10-26/whiteboard-continuity-acceptance.json)
- [doc/evidence/2026-10-26/whiteboard-continuity-exact-ci/receipt.json](../../../doc/evidence/2026-10-26/whiteboard-continuity-exact-ci/receipt.json)

## STUDIO-11 PDF上传、原文与逐页阅读

**输入**：multipart PDF、可选studentId/subject、requestKey。

**处理与实现**：10MiB以内单PDF受控上传，最多30页；保存原件并创建持久处理任务；孩子资料按当前档案权限读取，成人私人资料用真实空studentId及ownerUserId隔离；重复文件返回原材料并保存新的请求回执，改命令不能复用旧键。

**输出**：受控原始PDF、页图、OCR/结构状态。

**状态与持久化**：`studioSourceMaterials`、`importFiles`、`processingArtifacts`

**权限、失败与边界**：不能按任意本机路径读取；新分块/120页与回收见STUDIO-24/OPS-10；原件恢复见STUDIO-25。

**关联接口**：

- `POST /api/learning/studio/materials/pdf` → `LearningController.studioPdfUpload`；[apps/api/src/modules/learning/learning.controller.ts:39](../../../apps/api/src/modules/learning/learning.controller.ts#L39)。
- `GET /api/learning/studio/materials/:id/pages/:page` → `LearningController.studioPdfPage`；[apps/api/src/modules/learning/learning.controller.ts:42](../../../apps/api/src/modules/learning/learning.controller.ts#L42)。
- `GET /api/learning/studio/materials/:id/original` → `LearningController.studioPdfOriginal`；[apps/api/src/modules/learning/learning.controller.ts:44](../../../apps/api/src/modules/learning/learning.controller.ts#L44)。

**服务方法**：

- `LearningService.uploadStudioPdf`；[apps/api/src/modules/learning/learning.service.ts:272](../../../apps/api/src/modules/learning/learning.service.ts#L272)。
- `LearningService.studioPdfPageImage`；[apps/api/src/modules/learning/learning.service.ts:333](../../../apps/api/src/modules/learning/learning.service.ts#L333)。
- `LearningService.studioPdfOriginal`；[apps/api/src/modules/learning/learning.service.ts:343](../../../apps/api/src/modules/learning/learning.service.ts#L343)。

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

- `POST /api/learning/studio/materials/:id/structure/review` → `LearningController.studioPdfStructureReview`；[apps/api/src/modules/learning/learning.controller.ts:47](../../../apps/api/src/modules/learning/learning.controller.ts#L47)。
- `POST /api/learning/studio/materials/:id/process/retry` → `LearningController.studioPdfProcessRetry`；[apps/api/src/modules/learning/learning.controller.ts:51](../../../apps/api/src/modules/learning/learning.controller.ts#L51)。

**服务方法**：

- `LearningService.reviewStudioPdfStructure`；[apps/api/src/modules/learning/learning.service.ts:358](../../../apps/api/src/modules/learning/learning.service.ts#L358)。
- `LearningService.retryStudioPdfProcessing`；[apps/api/src/modules/learning/learning.service.ts:386](../../../apps/api/src/modules/learning/learning.service.ts#L386)。

## STUDIO-14 PDF页级白板

**输入**：资料ID、知识点、页级依据与预览指纹。

**处理与实现**：选定原页与批准知识；以原页图和文字核对为基础生成白板幕；保存页码、来源及主题。

**输出**：原页与提炼解释结合的白板。

**状态与持久化**：`studioSourceMaterials`、`studioWhiteboards`

**权限、失败与边界**：关键词匹配只能提供候选页，不能声称精确教学引用已审核。

**关联接口**：

- `POST /api/learning/studio/materials/:id/whiteboard/preview` → `LearningController.studioPdfWhiteboardPreview`；[apps/api/src/modules/learning/learning.controller.ts:55](../../../apps/api/src/modules/learning/learning.controller.ts#L55)。
- `POST /api/learning/studio/materials/:id/whiteboard` → `LearningController.studioPdfWhiteboardCreate`；[apps/api/src/modules/learning/learning.controller.ts:57](../../../apps/api/src/modules/learning/learning.controller.ts#L57)。

**服务方法**：

- `LearningService.previewStudioPdfWhiteboard`；[apps/api/src/modules/learning/learning.service.ts:421](../../../apps/api/src/modules/learning/learning.service.ts#L421)。
- `LearningService.createStudioPdfWhiteboard`；[apps/api/src/modules/learning/learning.service.ts:436](../../../apps/api/src/modules/learning/learning.service.ts#L436)。

**补充实现文件**：

- [apps/api/src/modules/learning/studio-pdf-whiteboard.ts](../../../apps/api/src/modules/learning/studio-pdf-whiteboard.ts)

## STUDIO-15 个性化讲义、闪卡与微测

**输入**：当前范围、薄弱/未知点、可选资料来源。

**处理与实现**：最多选4个批准教学点；组合解释、例题、易错、迁移章节和闪卡/微测；关联真实知识ID及候选页；指纹预览后保存。

**输出**：StudioLearningPack及打印材料。

**状态与持久化**：`studioLearningPacks`、`studioSourceMaterials`

**权限、失败与边界**：规则编排为主；闪卡或阅读完成不改变掌握结论。

**关联接口**：

- `POST /api/learning/studio/study-packs/preview` → `LearningController.studioLearningPackPreview`；[apps/api/src/modules/learning/learning.controller.ts:61](../../../apps/api/src/modules/learning/learning.controller.ts#L61)。
- `POST /api/learning/studio/study-packs` → `LearningController.studioLearningPackCreate`；[apps/api/src/modules/learning/learning.controller.ts:64](../../../apps/api/src/modules/learning/learning.controller.ts#L64)。

**服务方法**：

- `LearningService.previewStudioLearningPack`；[apps/api/src/modules/learning/learning.service.ts:466](../../../apps/api/src/modules/learning/learning.service.ts#L466)。
- `LearningService.createStudioLearningPack`；[apps/api/src/modules/learning/learning.service.ts:487](../../../apps/api/src/modules/learning/learning.service.ts#L487)。

**补充实现文件**：

- [apps/api/src/modules/learning/studio-learning-pack.ts](../../../apps/api/src/modules/learning/studio-learning-pack.ts)

## STUDIO-16 工作台计划排程与阶段执行

**输入**：目标、截止日期、首次时间、每天10–60分钟、版本和请求键。

**处理与实现**：按薄弱与证据不足优先选点；编排learn/practice/transfer/review，跳过可识别冲突；完成后追加1/3/7/14日复盘；同步日历事件状态。

**输出**：可确认、完成、跳过、重开的学习安排。

**状态与持久化**：`studioStudyPlans`、`studioScheduleEvents`、`studioActivities`

**权限、失败与边界**：这是排程计划，不是DiagnosticGuidancePlan；极端冲突会保留起点并提示，不是通用排课优化器。

**关联接口**：

- `POST /api/learning/studio/study-plans/preview` → `LearningController.studioStudyPlanPreview`；[apps/api/src/modules/learning/learning.controller.ts:104](../../../apps/api/src/modules/learning/learning.controller.ts#L104)。
- `POST /api/learning/studio/study-plans` → `LearningController.studioStudyPlanCreate`；[apps/api/src/modules/learning/learning.controller.ts:107](../../../apps/api/src/modules/learning/learning.controller.ts#L107)。
- `POST /api/learning/studio/study-plans/:planId/sessions/:sessionId` → `LearningController.studioStudyPlanSession`；[apps/api/src/modules/learning/learning.controller.ts:110](../../../apps/api/src/modules/learning/learning.controller.ts#L110)。

**服务方法**：

- `LearningService.previewStudioStudyPlan`；[apps/api/src/modules/learning/learning.service.ts:131](../../../apps/api/src/modules/learning/learning.service.ts#L131)。
- `LearningService.createStudioStudyPlan`；[apps/api/src/modules/learning/learning.service.ts:147](../../../apps/api/src/modules/learning/learning.service.ts#L147)。
- `LearningService.updateStudioPlanSession`；[apps/api/src/modules/learning/learning.service.ts:185](../../../apps/api/src/modules/learning/learning.service.ts#L185)。

**补充实现文件**：

- [apps/api/src/modules/learning/studio-study-plan.ts](../../../apps/api/src/modules/learning/studio-study-plan.ts)

## STUDIO-17 ICS日历连接、刷新与撤销

**输入**：ICS文本或HTTPS订阅URL、来源名称、类型、请求键。

**处理与实现**：校验地址、重定向、大小和内容；拒绝本机/私网地址；订阅URL加密保存；UID归并事件；手动同步后替换该来源事件，撤销清理来源事件。

**输出**：只读外部课程和日历事件。

**状态与持久化**：`studioConnectors`、`studioScheduleEvents`

**权限、失败与边界**：没有Canvas/Schoology OAuth、后台自动刷新、双向作业或成绩回写。

**关联接口**：

- `POST /api/learning/studio/integrations` → `LearningController.studioIntegrationConnect`；[apps/api/src/modules/learning/learning.controller.ts:83](../../../apps/api/src/modules/learning/learning.controller.ts#L83)。
- `POST /api/learning/studio/integrations/:id/sync` → `LearningController.studioIntegrationSync`；[apps/api/src/modules/learning/learning.controller.ts:86](../../../apps/api/src/modules/learning/learning.controller.ts#L86)。
- `POST /api/learning/studio/integrations/:id/disconnect` → `LearningController.studioIntegrationDisconnect`；[apps/api/src/modules/learning/learning.controller.ts:89](../../../apps/api/src/modules/learning/learning.controller.ts#L89)。

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

- `POST /api/learning/studio/calendar/events` → `LearningController.studioCalendarEventCreate`；[apps/api/src/modules/learning/learning.controller.ts:92](../../../apps/api/src/modules/learning/learning.controller.ts#L92)。
- `POST /api/learning/studio/calendar/events/:id/update` → `LearningController.studioCalendarEventUpdate`；[apps/api/src/modules/learning/learning.controller.ts:98](../../../apps/api/src/modules/learning/learning.controller.ts#L98)。
- `POST /api/learning/studio/calendar/events/:id/remove` → `LearningController.studioCalendarEventRemove`；[apps/api/src/modules/learning/learning.controller.ts:95](../../../apps/api/src/modules/learning/learning.controller.ts#L95)。
- `POST /api/learning/studio/calendar/batch-remove` → `LearningController.studioCalendarBatchRemove`；[apps/api/src/modules/learning/learning.controller.ts:101](../../../apps/api/src/modules/learning/learning.controller.ts#L101)。

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

- `GET /api/learning/studio/calendar/export` → `LearningController.studioCalendarExport`；[apps/api/src/modules/learning/learning.controller.ts:114](../../../apps/api/src/modules/learning/learning.controller.ts#L114)。

**服务方法**：

- `StudioIntegrationService.exportCalendar`；[apps/api/src/modules/learning/studio-integration.service.ts:185](../../../apps/api/src/modules/learning/studio-integration.service.ts#L185)。

## STUDIO-27 真实项目附件、冻结文件证据与双库恢复

**输入**：原项目/阶段与冻结定义、原件SHA/大小/媒体类型、分块、独立文件修订、当前及原授权、稳定命令键。

**处理与实现**：每文件20MiB/分块1MiB/阶段20引用；原件与规范化图片、PDF静态页、UTF-8文字/代码、录音、Office容器独立保留；处理/清理持久任务与真实租约，取消/撤权/隐私后旧worker不能发布；字节检查只读；提交冻结原件/显示摘要和说明，量规只能引用该提交文件，旧提交不被替换；图片放大/PDF分页/音频释放/原件下载；刷新续传和掉回执找回；家庭TAR/SQLite和PG原生冷恢复/最新删除账本覆盖实际字节。AI只用明确选择的已保存文字和说明，完整超预算作品保留，不截断

**输出**：真实原件、可复核历史提交、可恢复处理、独立文件完整性检查与真实备份。

**状态与持久化**：`projectAssetUploads`、`projectAssets`、`courseProjects`

**权限、失败与边界**：Office只承诺容器核对和原件下载，不提供内容预览；本批AI未读取附件字节；完整多模态研读、真实手机/录音/读屏、教师与连续效果仍待验收。

**关联接口**：

- `GET /api/learning/project-files` → `ProjectFileController.list`；[apps/api/src/modules/learning/project-file.controller.ts:11](../../../apps/api/src/modules/learning/project-file.controller.ts#L11)。
- `POST /api/learning/project-files/uploads` → `ProjectFileController.start`；[apps/api/src/modules/learning/project-file.controller.ts:12](../../../apps/api/src/modules/learning/project-file.controller.ts#L12)。
- `GET /api/learning/project-files/uploads/:id` → `ProjectFileController.upload`；[apps/api/src/modules/learning/project-file.controller.ts:13](../../../apps/api/src/modules/learning/project-file.controller.ts#L13)。
- `PUT /api/learning/project-files/uploads/:id/chunks/:index` → `ProjectFileController.chunk`；[apps/api/src/modules/learning/project-file.controller.ts:14](../../../apps/api/src/modules/learning/project-file.controller.ts#L14)。
- `POST /api/learning/project-files/uploads/:id/complete` → `ProjectFileController.complete`；[apps/api/src/modules/learning/project-file.controller.ts:15](../../../apps/api/src/modules/learning/project-file.controller.ts#L15)。
- `POST /api/learning/project-files/uploads/:id/cancel` → `ProjectFileController.cancelUpload`；[apps/api/src/modules/learning/project-file.controller.ts:16](../../../apps/api/src/modules/learning/project-file.controller.ts#L16)。
- `GET /api/learning/project-files/assets/:id` → `ProjectFileController.asset`；[apps/api/src/modules/learning/project-file.controller.ts:17](../../../apps/api/src/modules/learning/project-file.controller.ts#L17)。
- `GET /api/learning/project-files/assets/:id/integrity` → `ProjectFileController.integrity`；[apps/api/src/modules/learning/project-file.controller.ts:18](../../../apps/api/src/modules/learning/project-file.controller.ts#L18)。
- `POST /api/learning/project-files/assets/:id/cancel` → `ProjectFileController.cancel`；[apps/api/src/modules/learning/project-file.controller.ts:19](../../../apps/api/src/modules/learning/project-file.controller.ts#L19)。
- `POST /api/learning/project-files/assets/:id/retry` → `ProjectFileController.retry`；[apps/api/src/modules/learning/project-file.controller.ts:20](../../../apps/api/src/modules/learning/project-file.controller.ts#L20)。
- `POST /api/learning/project-files/assets/:id/delete` → `ProjectFileController.delete`；[apps/api/src/modules/learning/project-file.controller.ts:21](../../../apps/api/src/modules/learning/project-file.controller.ts#L21)。
- `GET /api/learning/project-files/assets/:id/files/:variant` → `ProjectFileController.file`；[apps/api/src/modules/learning/project-file.controller.ts:22](../../../apps/api/src/modules/learning/project-file.controller.ts#L22)。

**服务方法**：

- `ProjectFileService.list`；[apps/api/src/modules/learning/project-file.service.ts:64](../../../apps/api/src/modules/learning/project-file.service.ts#L64)。
- `ProjectFileService.start`；[apps/api/src/modules/learning/project-file.service.ts:53](../../../apps/api/src/modules/learning/project-file.service.ts#L53)。
- `ProjectFileService.getUpload`；[apps/api/src/modules/learning/project-file.service.ts:70](../../../apps/api/src/modules/learning/project-file.service.ts#L70)。
- `ProjectFileService.chunk`；[apps/api/src/modules/learning/project-file.service.ts:79](../../../apps/api/src/modules/learning/project-file.service.ts#L79)。
- `ProjectFileService.complete`；[apps/api/src/modules/learning/project-file.service.ts:85](../../../apps/api/src/modules/learning/project-file.service.ts#L85)。
- `ProjectFileService.cancelUpload`；[apps/api/src/modules/learning/project-file.service.ts:98](../../../apps/api/src/modules/learning/project-file.service.ts#L98)。
- `ProjectFileService.getAsset`；[apps/api/src/modules/learning/project-file.service.ts:71](../../../apps/api/src/modules/learning/project-file.service.ts#L71)。
- `ProjectFileService.integrity`；[apps/api/src/modules/learning/project-file.service.ts:72](../../../apps/api/src/modules/learning/project-file.service.ts#L72)。
- `ProjectFileService.command`；[apps/api/src/modules/learning/project-file.service.ts:102](../../../apps/api/src/modules/learning/project-file.service.ts#L102)。
- `ProjectFileService.file`；[apps/api/src/modules/learning/project-file.service.ts:119](../../../apps/api/src/modules/learning/project-file.service.ts#L119)。

**补充实现文件**：

- [packages/contracts/src/project-assets.ts](../../../packages/contracts/src/project-assets.ts)
- [apps/api/src/modules/learning/project-file-worker.service.ts](../../../apps/api/src/modules/learning/project-file-worker.service.ts)
- [apps/api/src/modules/learning/project-file-storage.ts](../../../apps/api/src/modules/learning/project-file-storage.ts)
- [apps/api/src/modules/learning/project-file-processing.ts](../../../apps/api/src/modules/learning/project-file-processing.ts)
- [apps/api/src/modules/learning/course-project-access.ts](../../../apps/api/src/modules/learning/course-project-access.ts)
- [apps/api/src/modules/learning/project-file.integration.test.ts](../../../apps/api/src/modules/learning/project-file.integration.test.ts)
- [apps/api/src/modules/learning/project-file-postgres-recovery.integration.test.ts](../../../apps/api/src/modules/learning/project-file-postgres-recovery.integration.test.ts)
- [apps/web/app/studio/projects/project-files.tsx](../../../apps/web/app/studio/projects/project-files.tsx)
- [apps/web/app/studio/projects/advice-scope.tsx](../../../apps/web/app/studio/projects/advice-scope.tsx)
- [scripts/processing/project_file_preview.py](../../../scripts/processing/project_file_preview.py)
- [scripts/qa/verify-project-file-preview.py](../../../scripts/qa/verify-project-file-preview.py)
- [scripts/qa/run-project-files-postgres.cjs](../../../scripts/qa/run-project-files-postgres.cjs)
- [tests/e2e/project-files.spec.ts](../../../tests/e2e/project-files.spec.ts)

## STUDIO-20 阶段项目、产物版本与量规复核

**输入**：课程/单元、阶段产物、文字/链接证据、自评、修订号、请求键和模型。

**处理与实现**：成人五项目各三阶段；小学课程构造迁移解释核查模板；草稿与自评准备同步持久保存，提交冻结产物/量规/前版本；指定提交可由授权家长或教师逐维度复核；旧课堂草稿主动复制成参考；AI仅建议并标记所针对的稿本；重复写入可重放，冲突保留本地导出后恢复。

**输出**：15阶段原创项目、自评/提交历史/人工复核、旧稿引用、模型建议与受控隐私导出删除。

**状态与持久化**：`courseProjects`、`classroomSessions`、`studioCourses`、`teacherAssignments`

**权限、失败与边界**：内容和量规待教师审核，真实附件见STUDIO-27；AI只对已保存文字和附件说明给建议，可明确选择范围；AI真实供应商调用和真人效果另验；项目不写正式掌握度。

**关联接口**：

- `GET /api/learning/projects/catalog` → `CourseProjectController.catalog`；[apps/api/src/modules/learning/course-project.controller.ts:9](../../../apps/api/src/modules/learning/course-project.controller.ts#L9)。
- `GET /api/learning/projects/:id` → `CourseProjectController.get`；[apps/api/src/modules/learning/course-project.controller.ts:10](../../../apps/api/src/modules/learning/course-project.controller.ts#L10)。
- `GET /api/learning/projects/:id/requests/:requestKey` → `CourseProjectController.request`；[apps/api/src/modules/learning/course-project.controller.ts:11](../../../apps/api/src/modules/learning/course-project.controller.ts#L11)。
- `POST /api/learning/projects` → `CourseProjectController.open`；[apps/api/src/modules/learning/course-project.controller.ts:12](../../../apps/api/src/modules/learning/course-project.controller.ts#L12)。
- `PATCH /api/learning/projects/:id` → `CourseProjectController.save`；[apps/api/src/modules/learning/course-project.controller.ts:13](../../../apps/api/src/modules/learning/course-project.controller.ts#L13)。
- `POST /api/learning/projects/:id/submissions` → `CourseProjectController.submit`；[apps/api/src/modules/learning/course-project.controller.ts:14](../../../apps/api/src/modules/learning/course-project.controller.ts#L14)。
- `POST /api/learning/projects/:id/reviews` → `CourseProjectController.review`；[apps/api/src/modules/learning/course-project.controller.ts:15](../../../apps/api/src/modules/learning/course-project.controller.ts#L15)。
- `POST /api/learning/projects/:id/legacy` → `CourseProjectController.legacy`；[apps/api/src/modules/learning/course-project.controller.ts:16](../../../apps/api/src/modules/learning/course-project.controller.ts#L16)。
- `POST /api/learning/projects/:id/advice` → `CourseProjectController.advice`；[apps/api/src/modules/learning/course-project.controller.ts:17](../../../apps/api/src/modules/learning/course-project.controller.ts#L17)。

**服务方法**：

- `CourseProjectService.catalog`；[apps/api/src/modules/learning/course-project.service.ts:66](../../../apps/api/src/modules/learning/course-project.service.ts#L66)。
- `CourseProjectService.get`；[apps/api/src/modules/learning/course-project.service.ts:64](../../../apps/api/src/modules/learning/course-project.service.ts#L64)。
- `CourseProjectService.request`；[apps/api/src/modules/learning/course-project.service.ts:96](../../../apps/api/src/modules/learning/course-project.service.ts#L96)。
- `CourseProjectService.open`；[apps/api/src/modules/learning/course-project.service.ts:77](../../../apps/api/src/modules/learning/course-project.service.ts#L77)。
- `CourseProjectService.save`；[apps/api/src/modules/learning/course-project.service.ts:145](../../../apps/api/src/modules/learning/course-project.service.ts#L145)。
- `CourseProjectService.submit`；[apps/api/src/modules/learning/course-project.service.ts:159](../../../apps/api/src/modules/learning/course-project.service.ts#L159)。
- `CourseProjectService.review`；[apps/api/src/modules/learning/course-project.service.ts:177](../../../apps/api/src/modules/learning/course-project.service.ts#L177)。
- `CourseProjectService.importLegacy`；[apps/api/src/modules/learning/course-project.service.ts:194](../../../apps/api/src/modules/learning/course-project.service.ts#L194)。
- `CourseProjectService.advise`；[apps/api/src/modules/learning/course-project.service.ts:208](../../../apps/api/src/modules/learning/course-project.service.ts#L208)。

**补充实现文件**：

- [apps/api/src/modules/learning/course-project-content.ts](../../../apps/api/src/modules/learning/course-project-content.ts)
- [apps/web/app/studio/projects/workbench.tsx](../../../apps/web/app/studio/projects/workbench.tsx)
- [apps/web/app/studio/projects/projects.css](../../../apps/web/app/studio/projects/projects.css)

## STUDIO-28 项目逐步教学、独立本机稿与原操作恢复

**输入**：原冻结项目/阶段/字段、逐句讲解单元、音色、本人原命令回执与完整编辑稿。

**处理与实现**：按原字段生成导向/产出/证据/自评步骤；完整作品使用同一个Editor；URL步骤与前后退、未完成确认和字段焦点、保存后导航；每文档独立缓存槽，复制标签也不共写，刷新自动恢复本槽前稿、硬关闭后预览选择其他绑定副本；完整原body/key先读本人回执再重放，后续版本比较，不改键覆盖；保留确认后的新本机编辑；讲解不读取私人答案，仅合成冻结句单元，事务前后核对原登录/授权/定义，取消与换步骤释放音频；观察到权限失效清空旧内容

**输出**：连续项目教学、可核对草稿/命令副本、逐句朗读与原提交历史。

**状态与持久化**：`courseProjects`

**权限、失败与边界**：声音使用当前服务目录和原创样本；不是原站音轨或完整CSS/DPR还原，后续步骤/审核参考仍未知；本地缓存不是独立备份，AI建议仍沿用原同步调用，不宣称供应商恰好调用一次；教师/实机与完整M1～M7继续待验

**关联接口**：

- `GET /api/learning/projects/:id/teaching` → `ProjectTeachingController.get`；[apps/api/src/modules/learning/project-teaching.controller.ts:9](../../../apps/api/src/modules/learning/project-teaching.controller.ts#L9)。
- `POST /api/learning/projects/:id/narration` → `ProjectTeachingController.narrate`；[apps/api/src/modules/learning/project-teaching.controller.ts:10](../../../apps/api/src/modules/learning/project-teaching.controller.ts#L10)。

**服务方法**：

- `ProjectTeachingService.get`；[apps/api/src/modules/learning/project-teaching.service.ts:22](../../../apps/api/src/modules/learning/project-teaching.service.ts#L22)。
- `ProjectTeachingService.narrate`；[apps/api/src/modules/learning/project-teaching.service.ts:27](../../../apps/api/src/modules/learning/project-teaching.service.ts#L27)。

**补充实现文件**：

- [packages/contracts/src/project-teaching.ts](../../../packages/contracts/src/project-teaching.ts)
- [apps/api/src/modules/learning/project-teaching.controller.ts](../../../apps/api/src/modules/learning/project-teaching.controller.ts)
- [apps/api/src/modules/learning/project-teaching.integration.test.ts](../../../apps/api/src/modules/learning/project-teaching.integration.test.ts)
- [apps/api/src/modules/learning/course-project.integration.test.ts](../../../apps/api/src/modules/learning/course-project.integration.test.ts)
- [apps/web/app/studio/projects/project-teaching.tsx](../../../apps/web/app/studio/projects/project-teaching.tsx)
- [apps/web/app/studio/projects/project-teaching.css](../../../apps/web/app/studio/projects/project-teaching.css)
- [apps/web/app/studio/projects/project-narration.ts](../../../apps/web/app/studio/projects/project-narration.ts)
- [apps/web/app/studio/projects/project-recovery.ts](../../../apps/web/app/studio/projects/project-recovery.ts)
- [apps/web/app/studio/projects/use-project-recovery.ts](../../../apps/web/app/studio/projects/use-project-recovery.ts)
- [tests/e2e/project-teaching.spec.ts](../../../tests/e2e/project-teaching.spec.ts)
- [scripts/qa/run-project-teaching-postgres.cjs](../../../scripts/qa/run-project-teaching-postgres.cjs)

## STUDIO-29 资料课程项目与只读活动旅程

**输入**：已确认资料课程、冻结公开目标/来源、已有会话首答/帮助记录、本人项目和本机步骤偏好。

**处理与实现**：资料课程按来源版本冻结三阶段项目，支持原附件、自评、提交、复核、受控朗读和历史；同一账号/项目/定义恢复合法stage/step/view，显式URL优先，各标签完整稿仍独立；阅读对比递归规范化对象属性抵抗JSONB重排，持久内容指纹不改；纯投影汇总原句/题目断点、独立/辅助/跳过/作者曝光首答，以及每阶段最新提交的人工复核，读取不创建活动；资料逐课状态和成人单元可展开旅程，源项目返回原课并保留筛选；按账号/角色卸载旧工作台和取消旧目录请求

**输出**：来源项目、准确活动入口和断点、各类学习事实分开呈现。

**状态与持久化**：`sourceCourses`、`courseProjects`、`classroomSessions`、`studioSourceMaterials`

**权限、失败与边界**：资料题和通用量规待教师审核；资料课程独立单元核查见STUDIO-30，未配置时如实提示，不把微课重用为正式测量；当前界面位置为本机偏好，不是服务器学习证据；原声/CSS/字体/DPR、完整课程包生命周期、全教材和真人效果仍待验

**关联接口**：

- `GET /api/learning/projects/catalog` → `CourseProjectController.catalog`；[apps/api/src/modules/learning/course-project.controller.ts:9](../../../apps/api/src/modules/learning/course-project.controller.ts#L9)。
- `POST /api/learning/projects` → `CourseProjectController.open`；[apps/api/src/modules/learning/course-project.controller.ts:12](../../../apps/api/src/modules/learning/course-project.controller.ts#L12)。
- `GET /api/learning/classroom/catalog` → `ClassroomController.catalog`；[apps/api/src/modules/learning/classroom.controller.ts:9](../../../apps/api/src/modules/learning/classroom.controller.ts#L9)。
- `GET /api/learning/source-courses/:id` → `SourceCourseController.get`；[apps/api/src/modules/learning/source-course.controller.ts:27](../../../apps/api/src/modules/learning/source-course.controller.ts#L27)。

**服务方法**：

- `CourseProjectService.catalog`；[apps/api/src/modules/learning/course-project.service.ts:66](../../../apps/api/src/modules/learning/course-project.service.ts#L66)。
- `CourseProjectService.open`；[apps/api/src/modules/learning/course-project.service.ts:77](../../../apps/api/src/modules/learning/course-project.service.ts#L77)。
- `ClassroomService.catalog`；[apps/api/src/modules/learning/classroom.service.ts:32](../../../apps/api/src/modules/learning/classroom.service.ts#L32)。
- `SourceCourseService.get`；[apps/api/src/modules/learning/source-course.service.ts:87](../../../apps/api/src/modules/learning/source-course.service.ts#L87)。

**补充实现文件**：

- [packages/contracts/src/course-journey.ts](../../../packages/contracts/src/course-journey.ts)
- [apps/api/src/modules/learning/source-course-project.ts](../../../apps/api/src/modules/learning/source-course-project.ts)
- [apps/api/src/modules/learning/source-project-access.ts](../../../apps/api/src/modules/learning/source-project-access.ts)
- [apps/api/src/modules/learning/course-journey.ts](../../../apps/api/src/modules/learning/course-journey.ts)
- [apps/api/src/modules/learning/course-journey.test.ts](../../../apps/api/src/modules/learning/course-journey.test.ts)
- [apps/api/src/modules/learning/source-course-project.test.ts](../../../apps/api/src/modules/learning/source-course-project.test.ts)
- [apps/api/src/modules/learning/source-course-project.integration.test.ts](../../../apps/api/src/modules/learning/source-course-project.integration.test.ts)
- [apps/api/src/modules/learning/project-file-postgres-recovery.integration.test.ts](../../../apps/api/src/modules/learning/project-file-postgres-recovery.integration.test.ts)
- [apps/web/app/studio/course-activity.tsx](../../../apps/web/app/studio/course-activity.tsx)
- [apps/web/app/studio/course-activity.css](../../../apps/web/app/studio/course-activity.css)
- [apps/web/app/studio/projects/project-location.ts](../../../apps/web/app/studio/projects/project-location.ts)
- [tests/e2e/source-course-project.spec.ts](../../../tests/e2e/source-course-project.spec.ts)
- [scripts/qa/run-source-projects-postgres.cjs](../../../scripts/qa/run-source-projects-postgres.cjs)

## STUDIO-30 资料课程独立核查、私有编审与冻结学生课堂

**输入**：已确认资料课程中明确选择的1～6课时目标、完整来源、常规模型选择、原请求键/版本、显式答案审阅或未曝光确认。

**处理与实现**：冻结完整来源和公开目标并严格限制18000字符，拒绝截断；4～8新题的单选/多选集合、逐项说明、两级提示、目标与精确引用完整校验；不发送微课答案或原题，规范化精确排重；持久写题/复核检查点固定原模型与原登录/监护授权，失败只补未完成阶段；取消固定原generation，允许后台领取/检查点推进后的旧快照在同代次内取消，旧控制/新代次/未来版本及已完成状态仍拒绝，原命令与原回执不变；原稿/当前稿/AI审稿及历史分开保留；显式authoring才记录同actor/内容指纹曝光，同文重新生成不能清除旧曝光；确认练习可保留未读答案路径，过期/uncertain另确认；schema15稳定当前指针与单调撤回修订，同事务发布切换；学生按非管理来源授权创建私有冻结课堂，仅提交当前题后取得本题评分；首答/提示/不会/跳过及只读旅程沿用原协议，不同定义独立；原文按本人课堂冻结读取；前端按独立文档slot保留原命令和本机稿，掉回执重放原参数、旧稿显式比较，换号卸载；两库备份恢复与隐私回收识别check-only和classroom-only引用

**输出**：准备、编审/未曝光确认、准确续答、逐题反馈与冻结原文、旧版复盘和原命令恢复。

**状态与持久化**：`sourceCourseChecks`、`sourceCourseCheckPublications`、`classroomSessions`、`sourceCourses`、`studioSourceMaterials`

**权限、失败与边界**：当前仅1～6目标与选择题；精确排重不证明语义独立，生成及AI复核仍待内容审核；formalMeasurementEligible始终false，不产生知识掌握或深层原因结论；实机、教师内容及长期教学效果待验证；单课时增量121须完成独立验收、精确CI和守护交付后才作为运行能力报告

**关联接口**：

- `GET /api/learning/source-courses/:courseId/checks` → `SourceCourseCheckController.list`；[apps/api/src/modules/learning/source-course-check.controller.ts:8](../../../apps/api/src/modules/learning/source-course-check.controller.ts#L8)。
- `GET /api/learning/source-courses/:courseId/checks/:id` → `SourceCourseCheckController.get`；[apps/api/src/modules/learning/source-course-check.controller.ts:9](../../../apps/api/src/modules/learning/source-course-check.controller.ts#L9)。
- `GET /api/learning/source-courses/:courseId/checks/:id/requests/:key` → `SourceCourseCheckController.receipt`；[apps/api/src/modules/learning/source-course-check.controller.ts:10](../../../apps/api/src/modules/learning/source-course-check.controller.ts#L10)。
- `POST /api/learning/source-courses/:courseId/checks/preflight` → `SourceCourseCheckController.preflight`；[apps/api/src/modules/learning/source-course-check.controller.ts:11](../../../apps/api/src/modules/learning/source-course-check.controller.ts#L11)。
- `POST /api/learning/source-courses/:courseId/checks/prepare` → `SourceCourseCheckController.prepare`；[apps/api/src/modules/learning/source-course-check.controller.ts:12](../../../apps/api/src/modules/learning/source-course-check.controller.ts#L12)。
- `POST /api/learning/source-courses/:courseId/checks/:id/cancel` → `SourceCourseCheckController.cancel`；[apps/api/src/modules/learning/source-course-check.controller.ts:13](../../../apps/api/src/modules/learning/source-course-check.controller.ts#L13)。
- `POST /api/learning/source-courses/:courseId/checks/:id/retry` → `SourceCourseCheckController.retry`；[apps/api/src/modules/learning/source-course-check.controller.ts:14](../../../apps/api/src/modules/learning/source-course-check.controller.ts#L14)。
- `POST /api/learning/source-courses/:courseId/checks/:id/authoring` → `SourceCourseCheckController.authoring`；[apps/api/src/modules/learning/source-course-check.controller.ts:15](../../../apps/api/src/modules/learning/source-course-check.controller.ts#L15)。
- `PATCH /api/learning/source-courses/:courseId/checks/:id/content` → `SourceCourseCheckController.content`；[apps/api/src/modules/learning/source-course-check.controller.ts:16](../../../apps/api/src/modules/learning/source-course-check.controller.ts#L16)。
- `POST /api/learning/source-courses/:courseId/checks/:id/confirm` → `SourceCourseCheckController.confirm`；[apps/api/src/modules/learning/source-course-check.controller.ts:17](../../../apps/api/src/modules/learning/source-course-check.controller.ts#L17)。
- `POST /api/learning/source-courses/:courseId/checks/:id/withdraw` → `SourceCourseCheckController.withdraw`；[apps/api/src/modules/learning/source-course-check.controller.ts:18](../../../apps/api/src/modules/learning/source-course-check.controller.ts#L18)。
- `GET /api/learning/classroom/sessions/:id/sources/:key` → `ClassroomController.source`；[apps/api/src/modules/learning/classroom.controller.ts:12](../../../apps/api/src/modules/learning/classroom.controller.ts#L12)。

**服务方法**：

- `SourceCourseCheckService.list`；[apps/api/src/modules/learning/source-course-check.service.ts:45](../../../apps/api/src/modules/learning/source-course-check.service.ts#L45)。
- `SourceCourseCheckService.get`；[apps/api/src/modules/learning/source-course-check.service.ts:46](../../../apps/api/src/modules/learning/source-course-check.service.ts#L46)。
- `SourceCourseCheckService.receipt`；[apps/api/src/modules/learning/source-course-check.service.ts:47](../../../apps/api/src/modules/learning/source-course-check.service.ts#L47)。
- `SourceCourseCheckService.preflight`；[apps/api/src/modules/learning/source-course-check.service.ts:48](../../../apps/api/src/modules/learning/source-course-check.service.ts#L48)。
- `SourceCourseCheckService.prepare`；[apps/api/src/modules/learning/source-course-check.service.ts:53](../../../apps/api/src/modules/learning/source-course-check.service.ts#L53)。
- `SourceCourseCheckService.control`；[apps/api/src/modules/learning/source-course-check.service.ts:68](../../../apps/api/src/modules/learning/source-course-check.service.ts#L68)。
- `SourceCourseCheckService.authoring`；[apps/api/src/modules/learning/source-course-check.service.ts:109](../../../apps/api/src/modules/learning/source-course-check.service.ts#L109)。
- `SourceCourseCheckService.edit`；[apps/api/src/modules/learning/source-course-check.service.ts:116](../../../apps/api/src/modules/learning/source-course-check.service.ts#L116)。
- `SourceCourseCheckService.publish`；[apps/api/src/modules/learning/source-course-check.service.ts:125](../../../apps/api/src/modules/learning/source-course-check.service.ts#L125)。
- `SourceCourseCheckService.withdraw`；[apps/api/src/modules/learning/source-course-check.service.ts:137](../../../apps/api/src/modules/learning/source-course-check.service.ts#L137)。
- `ClassroomService.source`；[apps/api/src/modules/learning/classroom.service.ts:92](../../../apps/api/src/modules/learning/classroom.service.ts#L92)。

**补充实现文件**：

- [doc/product/120-source-course-independent-unit-checks.md](../../../doc/product/120-source-course-independent-unit-checks.md)
- [doc/product/121-single-lesson-source-course-checks.md](../../../doc/product/121-single-lesson-source-course-checks.md)
- [packages/contracts/src/source-course-check.ts](../../../packages/contracts/src/source-course-check.ts)
- [apps/api/src/modules/learning/source-course-check-content.ts](../../../apps/api/src/modules/learning/source-course-check-content.ts)
- [apps/api/src/modules/learning/source-course-check-worker.service.ts](../../../apps/api/src/modules/learning/source-course-check-worker.service.ts)
- [apps/api/src/modules/learning/source-course-check-classroom.ts](../../../apps/api/src/modules/learning/source-course-check-classroom.ts)
- [apps/api/src/modules/learning/source-course-check.integration.test.ts](../../../apps/api/src/modules/learning/source-course-check.integration.test.ts)
- [apps/api/src/infrastructure/source-course-check-storage.integration.test.ts](../../../apps/api/src/infrastructure/source-course-check-storage.integration.test.ts)
- [apps/api/src/infrastructure/source-course-check-postgres.integration.test.ts](../../../apps/api/src/infrastructure/source-course-check-postgres.integration.test.ts)
- [apps/web/app/studio/source-courses/check-panel.tsx](../../../apps/web/app/studio/source-courses/check-panel.tsx)
- [apps/web/app/studio/source-courses/check-editor.tsx](../../../apps/web/app/studio/source-courses/check-editor.tsx)
- [apps/web/app/studio/source-courses/check-manuscript.tsx](../../../apps/web/app/studio/source-courses/check-manuscript.tsx)
- [apps/web/app/studio/source-courses/check-recovery.ts](../../../apps/web/app/studio/source-courses/check-recovery.ts)
- [apps/web/app/studio/classroom/check-source.tsx](../../../apps/web/app/studio/classroom/check-source.tsx)
- [tests/e2e/source-course-check.spec.ts](../../../tests/e2e/source-course-check.spec.ts)
- [scripts/qa/source-check-live.cjs](../../../scripts/qa/source-check-live.cjs)

## STUDIO-21 原文到资料课程与生成任务

**输入**：授权来源页/段与版本、目标、source/zh-CN/en、时间预算、模型、可选已确认知识目标、修订号和请求键。

**处理与实现**：成人无需儿童档案可存文字/PDF；小课程v2冻结所选原文，最多10页/段及12000原文字符；长资料v3见STUDIO-23；单次序列化模型上下文不超过18000字符，超预算拒绝而不截断；持久任务冻结初始输入并固定实际模型，先规划1至6课与明确来源缺口，再逐课编写、逐课独立AI复核；以不结束租约的原子检查点保存路线、初稿与复核，失败/重启只补未完成阶段；复核按字段或单题应用修订并重新验证，uncertain仍需人工核查；核对短引用确实出现在选中原文，拒绝内部来源键混入讲解；候选可改标题/目标/选课；成人创建者可逐段修订完整讲解、板书、练习/答案/帮助和引用，整份校验后按修订号与请求键保存，保留初始稿与生成输入、时间和摘要，人工改稿后旧复核标明针对旧版；显式打开教学稿记录答案接触事实，自己的后续练习不算独立成功，孩子的正常学习不继承作者曝光；再审阅确认；重复请求恢复原任务/确认，取消/撤权/删除/旧租约不能发布；已确认课堂冻结独立版本，页级引用回到快照；共享孩子发布课在创作者关闭账号后保留。

**输出**：可恢复分阶段资料课程、实际进度/安全复核概况、私有首次稿对照、原始目标溯源、原文快照、蓝图审阅、实际课堂/私有练习、来源对照与课程库入口。

**状态与持久化**：`sourceCourses`、`studioSourceMaterials`、`classroomSessions`、`learningScopes`、`knowledgeAtoms`

**权限、失败与边界**：生成内容待教师审核，不自动取得教材映射或正式测量资格；当前提供中文/英文/沿用来源的请求选项，其他语言和全教材课程仍待；长PDF分块与引用回收见STUDIO-24/OPS-10，旧页图核对见STUDIO-24；原件恢复见STUDIO-25，双库续恢复及冷恢复清理见OPS-07。

**关联接口**：

- `GET /api/learning/source-courses/materials` → `SourceCourseController.materials`；[apps/api/src/modules/learning/source-course.controller.ts:12](../../../apps/api/src/modules/learning/source-course.controller.ts#L12)。
- `POST /api/learning/source-courses/materials/text` → `SourceCourseController.text`；[apps/api/src/modules/learning/source-course.controller.ts:19](../../../apps/api/src/modules/learning/source-course.controller.ts#L19)。
- `GET /api/learning/source-courses` → `SourceCourseController.list`；[apps/api/src/modules/learning/source-course.controller.ts:22](../../../apps/api/src/modules/learning/source-course.controller.ts#L22)。
- `POST /api/learning/source-courses` → `SourceCourseController.create`；[apps/api/src/modules/learning/source-course.controller.ts:23](../../../apps/api/src/modules/learning/source-course.controller.ts#L23)。
- `GET /api/learning/source-courses/:id` → `SourceCourseController.get`；[apps/api/src/modules/learning/source-course.controller.ts:27](../../../apps/api/src/modules/learning/source-course.controller.ts#L27)。
- `PATCH /api/learning/source-courses/:id` → `SourceCourseController.edit`；[apps/api/src/modules/learning/source-course.controller.ts:32](../../../apps/api/src/modules/learning/source-course.controller.ts#L32)。
- `POST /api/learning/source-courses/:id/authoring` → `SourceCourseController.authoring`；[apps/api/src/modules/learning/source-course.controller.ts:28](../../../apps/api/src/modules/learning/source-course.controller.ts#L28)。
- `PATCH /api/learning/source-courses/:id/content` → `SourceCourseController.content`；[apps/api/src/modules/learning/source-course.controller.ts:31](../../../apps/api/src/modules/learning/source-course.controller.ts#L31)。
- `POST /api/learning/source-courses/:id/confirm` → `SourceCourseController.confirm`；[apps/api/src/modules/learning/source-course.controller.ts:33](../../../apps/api/src/modules/learning/source-course.controller.ts#L33)。
- `POST /api/learning/source-courses/:id/cancel` → `SourceCourseController.cancel`；[apps/api/src/modules/learning/source-course.controller.ts:34](../../../apps/api/src/modules/learning/source-course.controller.ts#L34)。
- `POST /api/learning/source-courses/:id/retry` → `SourceCourseController.retry`；[apps/api/src/modules/learning/source-course.controller.ts:35](../../../apps/api/src/modules/learning/source-course.controller.ts#L35)。
- `POST /api/learning/source-courses/:id/archive` → `SourceCourseController.archive`；[apps/api/src/modules/learning/source-course.controller.ts:36](../../../apps/api/src/modules/learning/source-course.controller.ts#L36)。

**服务方法**：

- `SourceCourseService.materials`；[apps/api/src/modules/learning/source-course.service.ts:31](../../../apps/api/src/modules/learning/source-course.service.ts#L31)。
- `SourceCourseService.addText`；[apps/api/src/modules/learning/source-course.service.ts:39](../../../apps/api/src/modules/learning/source-course.service.ts#L39)。
- `SourceCourseService.list`；[apps/api/src/modules/learning/source-course.service.ts:90](../../../apps/api/src/modules/learning/source-course.service.ts#L90)。
- `SourceCourseService.create`；[apps/api/src/modules/learning/source-course.service.ts:100](../../../apps/api/src/modules/learning/source-course.service.ts#L100)。
- `SourceCourseService.get`；[apps/api/src/modules/learning/source-course.service.ts:87](../../../apps/api/src/modules/learning/source-course.service.ts#L87)。
- `SourceCourseService.edit`；[apps/api/src/modules/learning/source-course.service.ts:127](../../../apps/api/src/modules/learning/source-course.service.ts#L127)。
- `SourceCourseService.authoring`；[apps/api/src/modules/learning/source-course.service.ts:137](../../../apps/api/src/modules/learning/source-course.service.ts#L137)。
- `SourceCourseService.editContent`；[apps/api/src/modules/learning/source-course.service.ts:175](../../../apps/api/src/modules/learning/source-course.service.ts#L175)。
- `SourceCourseService.confirm`；[apps/api/src/modules/learning/source-course.service.ts:189](../../../apps/api/src/modules/learning/source-course.service.ts#L189)。
- `SourceCourseService.control`；[apps/api/src/modules/learning/source-course.service.ts:196](../../../apps/api/src/modules/learning/source-course.service.ts#L196)。

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

**权限、失败与边界**：单次模型上下文18000字符；小课程保留旧v2语义；长PDF上传与续跑见STUDIO-24；新页图有摘要，旧页图核对见STUDIO-24，全教材语义覆盖仍待；原件恢复见STUDIO-25，双库续恢复/冷恢复清理见OPS-07。

**关联接口**：

- `POST /api/learning/source-courses/preflight` → `SourceCourseController.preflight`；[apps/api/src/modules/learning/source-course.controller.ts:24](../../../apps/api/src/modules/learning/source-course.controller.ts#L24)。
- `POST /api/learning/source-courses/materials/text-file` → `SourceCourseController.textFile`；[apps/api/src/modules/learning/source-course.controller.ts:20](../../../apps/api/src/modules/learning/source-course.controller.ts#L20)。
- `GET /api/learning/source-courses/:id/progress` → `SourceCourseController.progress`；[apps/api/src/modules/learning/source-course.controller.ts:25](../../../apps/api/src/modules/learning/source-course.controller.ts#L25)。
- `GET /api/learning/source-courses/:id/sources/:key` → `SourceCourseController.source`；[apps/api/src/modules/learning/source-course.controller.ts:26](../../../apps/api/src/modules/learning/source-course.controller.ts#L26)。
- `POST /api/learning/source-courses/:id/lessons/:lessonId/authoring` → `SourceCourseController.lessonAuthoring`；[apps/api/src/modules/learning/source-course.controller.ts:29](../../../apps/api/src/modules/learning/source-course.controller.ts#L29)。
- `PATCH /api/learning/source-courses/:id/lessons/:lessonId/content` → `SourceCourseController.lessonContent`；[apps/api/src/modules/learning/source-course.controller.ts:30](../../../apps/api/src/modules/learning/source-course.controller.ts#L30)。

**服务方法**：

- `SourceCourseService.preflight`；[apps/api/src/modules/learning/source-course.service.ts:99](../../../apps/api/src/modules/learning/source-course.service.ts#L99)。
- `SourceCourseService.addTextFile`；[apps/api/src/modules/learning/source-course.service.ts:52](../../../apps/api/src/modules/learning/source-course.service.ts#L52)。
- `SourceCourseService.progress`；[apps/api/src/modules/learning/source-course.service.ts:88](../../../apps/api/src/modules/learning/source-course.service.ts#L88)。
- `SourceCourseService.source`；[apps/api/src/modules/learning/source-course.service.ts:89](../../../apps/api/src/modules/learning/source-course.service.ts#L89)。
- `SourceCourseService.lessonAuthoring`；[apps/api/src/modules/learning/source-course.service.ts:145](../../../apps/api/src/modules/learning/source-course.service.ts#L145)。
- `SourceCourseService.editLesson`；[apps/api/src/modules/learning/source-course.service.ts:164](../../../apps/api/src/modules/learning/source-course.service.ts#L164)。

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

## STUDIO-25 PDF原件恢复、持久进度与撤回收尾

**输入**：当前资料/内容版本、同SHA和大小的完整PDF上传、原件基准、请求键及修订号。

**处理与实现**：在来源租约下观测发起时的旧文件基准；修复记录、独占保留上传、repairing代次和outbox同事务提交；每次发布重新核对任务fence、原监护/学习授权、资料范围/版本、上传及资产；完整候选和旧文件按绑定意图独占交换，可中断续跑且不覆盖第三份文件。等待活进程不消耗失败次数；取消、撤权和隐私删除后内部持久任务只清理已知私有残留，保留已发布正确共享原件；完成收据、上传终结及资产释放同事务；两工作台共用上传校验、进度、取消、重试、刷新恢复和后续页图核对。

**输出**：可恢复的正确PDF原件、同一完成收据、任务历史及保留原正文/课程版本。

**状态与持久化**：`studioOriginalRepairs`、`studioSourceMaterials`、`studioMaterialUploads`、`studioMaterialAssets`

**权限、失败与边界**：仅同一PDF且大小/完整SHA匹配；未知文件/链接和未知残留保留；修复不校正OCR或课程内容；活动repairing拒绝双库和家庭原件归档，伪造或不受支持的活动修复备份拒绝冷恢复；真实设备与最终交付范围见当批收据。

**关联接口**：

- `GET /api/learning/source-courses/materials/:materialId/repairs` → `StudioOriginalRepairController.list`；[apps/api/src/modules/learning/studio-original-repair.controller.ts:8](../../../apps/api/src/modules/learning/studio-original-repair.controller.ts#L8)。
- `GET /api/learning/source-courses/materials/:materialId/repairs/:id` → `StudioOriginalRepairController.get`；[apps/api/src/modules/learning/studio-original-repair.controller.ts:9](../../../apps/api/src/modules/learning/studio-original-repair.controller.ts#L9)。
- `POST /api/learning/source-courses/materials/:materialId/repairs` → `StudioOriginalRepairController.start`；[apps/api/src/modules/learning/studio-original-repair.controller.ts:10](../../../apps/api/src/modules/learning/studio-original-repair.controller.ts#L10)。
- `POST /api/learning/source-courses/materials/:materialId/repairs/:id/cancel` → `StudioOriginalRepairController.cancel`；[apps/api/src/modules/learning/studio-original-repair.controller.ts:11](../../../apps/api/src/modules/learning/studio-original-repair.controller.ts#L11)。
- `POST /api/learning/source-courses/materials/:materialId/repairs/:id/retry` → `StudioOriginalRepairController.retry`；[apps/api/src/modules/learning/studio-original-repair.controller.ts:12](../../../apps/api/src/modules/learning/studio-original-repair.controller.ts#L12)。

**服务方法**：

- `StudioOriginalRepairService.list`；[apps/api/src/modules/learning/studio-original-repair.service.ts:50](../../../apps/api/src/modules/learning/studio-original-repair.service.ts#L50)。
- `StudioOriginalRepairService.get`；[apps/api/src/modules/learning/studio-original-repair.service.ts:51](../../../apps/api/src/modules/learning/studio-original-repair.service.ts#L51)。
- `StudioOriginalRepairService.start`；[apps/api/src/modules/learning/studio-original-repair.service.ts:52](../../../apps/api/src/modules/learning/studio-original-repair.service.ts#L52)。
- `StudioOriginalRepairService.control`；[apps/api/src/modules/learning/studio-original-repair.service.ts:88](../../../apps/api/src/modules/learning/studio-original-repair.service.ts#L88)。

**补充实现文件**：

- [apps/api/src/modules/learning/studio-original-repair-worker.service.ts](../../../apps/api/src/modules/learning/studio-original-repair-worker.service.ts)
- [apps/api/src/modules/learning/studio-original-repair-record.ts](../../../apps/api/src/modules/learning/studio-original-repair-record.ts)
- [apps/api/src/modules/learning/studio-original-repair.integration.test.ts](../../../apps/api/src/modules/learning/studio-original-repair.integration.test.ts)
- [apps/api/src/infrastructure/studio-original-repair.ts](../../../apps/api/src/infrastructure/studio-original-repair.ts)
- [apps/api/src/infrastructure/studio-original-repair.test.ts](../../../apps/api/src/infrastructure/studio-original-repair.test.ts)
- [apps/web/app/studio/source-courses/original-repair.tsx](../../../apps/web/app/studio/source-courses/original-repair.tsx)
- [tests/e2e/pdf-material.spec.ts](../../../tests/e2e/pdf-material.spec.ts)

## STUDIO-26 资料课程修订家族、影响预览与历史恢复

**输入**：当前发布课程、修订号、内容与影响指纹、请求键、动作和原因。

**处理与实现**：短课/长课以独立候选复制原稿、来源和可核对的阶段来历，无新模型调用或共享任务；家族版本单调分配。只读预览列真实课堂/作答与新开影响；发布、归档、撤回、恢复、放弃以同一事务更新相关版本，重放先于新状态检查，并发预览失效则重新核对。旧课件、原句、题目和代码不迁移；历史详情明确恢复个人原会话。前端保留掉回执命令、刷新找回、状态冲突读取与键盘焦点；私有修订身份不透过学生投影/家庭导出泄漏，关闭账号擦除未发布稿与阶段。

**输出**：版本关系/原因与影响预览、可编辑修订、唯一当前版、准确旧课堂入口及保留生成来历。

**状态与持久化**：`sourceCourses`、`sourceCourseStages`、`classroomSessions`

**权限、失败与边界**：复制和人工确认不等于教师批准、完整内容质量或正式测量；学校、付费与Marketplace不在范围；固定成人课程/教材包的发布规则仍各自独立。

**关联接口**：

- `GET /api/learning/source-courses/:id/versions` → `SourceCourseLifecycleController.versions`；[apps/api/src/modules/learning/source-course-lifecycle.controller.ts:9](../../../apps/api/src/modules/learning/source-course-lifecycle.controller.ts#L9)。
- `POST /api/learning/source-courses/:id/revisions` → `SourceCourseLifecycleController.revise`；[apps/api/src/modules/learning/source-course-lifecycle.controller.ts:10](../../../apps/api/src/modules/learning/source-course-lifecycle.controller.ts#L10)。
- `POST /api/learning/source-courses/:id/lifecycle/preview` → `SourceCourseLifecycleController.preview`；[apps/api/src/modules/learning/source-course-lifecycle.controller.ts:11](../../../apps/api/src/modules/learning/source-course-lifecycle.controller.ts#L11)。
- `POST /api/learning/source-courses/:id/lifecycle` → `SourceCourseLifecycleController.apply`；[apps/api/src/modules/learning/source-course-lifecycle.controller.ts:12](../../../apps/api/src/modules/learning/source-course-lifecycle.controller.ts#L12)。

**服务方法**：

- `SourceCourseLifecycleService.versions`；[apps/api/src/modules/learning/source-course-lifecycle.service.ts:28](../../../apps/api/src/modules/learning/source-course-lifecycle.service.ts#L28)。
- `SourceCourseLifecycleService.revise`；[apps/api/src/modules/learning/source-course-lifecycle.service.ts:54](../../../apps/api/src/modules/learning/source-course-lifecycle.service.ts#L54)。
- `SourceCourseLifecycleService.preview`；[apps/api/src/modules/learning/source-course-lifecycle.service.ts:75](../../../apps/api/src/modules/learning/source-course-lifecycle.service.ts#L75)。
- `SourceCourseLifecycleService.apply`；[apps/api/src/modules/learning/source-course-lifecycle.service.ts:89](../../../apps/api/src/modules/learning/source-course-lifecycle.service.ts#L89)。

**补充实现文件**：

- [packages/contracts/src/source-course-lifecycle.ts](../../../packages/contracts/src/source-course-lifecycle.ts)
- [apps/api/src/modules/learning/source-course-lifecycle.controller.ts](../../../apps/api/src/modules/learning/source-course-lifecycle.controller.ts)
- [apps/api/src/modules/learning/source-course-lifecycle.integration.test.ts](../../../apps/api/src/modules/learning/source-course-lifecycle.integration.test.ts)
- [apps/api/src/modules/learning/source-course-content.ts](../../../apps/api/src/modules/learning/source-course-content.ts)
- [apps/api/src/modules/learning/source-course.service.ts](../../../apps/api/src/modules/learning/source-course.service.ts)
- [apps/api/src/modules/privacy/privacy-records.ts](../../../apps/api/src/modules/privacy/privacy-records.ts)
- [apps/web/app/studio/source-courses/lifecycle-panel.tsx](../../../apps/web/app/studio/source-courses/lifecycle-panel.tsx)
- [apps/web/app/studio/source-courses/workbench.tsx](../../../apps/web/app/studio/source-courses/workbench.tsx)
- [tests/e2e/source-course-lifecycle.spec.ts](../../../tests/e2e/source-course-lifecycle.spec.ts)
- [scripts/qa/run-source-lifecycle-postgres.cjs](../../../scripts/qa/run-source-lifecycle-postgres.cjs)

## STUDIO-31 AI主题白板、完整教学稿与原命令恢复

**输入**：明确成人主题或本人孩子已学的1至6目标、主题/教学目标、原模型、预检指纹、原命令与版本。

**处理与实现**：成人使用真实空孩子/学科；学生仅本人范围。冻结已批准教学与模型，持久写稿和独立复核只补缺失阶段；严格文字/整表/公式及旁白要点校验，保留完整初稿/复核/修改历史；本人私稿与孩子冻结发布稿分权。修改/确认/控制以规范化摘要和CAS绑定，丢回执先读取原命令；多文档槽保留各自完整输入，409读取最新稿后明确选基线，存储失败先下载再切换。确认后适配逐句播放器，整行分页、公式原式可读，旁白在合成前后重验权限。schema16双库约束及删除账本阻止旧冷备复活；中断复核经新登录明确重试只补复核。

**输出**：独立白板入口、常规模型选择、可恢复完整改稿/比较与版本、冻结白板及逐句播放。

**状态与持久化**：`studioTopicWhiteboardDrafts`、`studioTopicWhiteboards`

**权限、失败与边界**：内容始终AI生成且待核对，不产生掌握/测量事实；真实DS样本有校验失败及显式恢复，不构成稳定性或教师质量证明；配图与复杂公式另见STUDIO-32；原字体CSS及声音/实机/长期门禁仍待，正式部署状态见124最终运行收据。

**关联接口**：

- `POST /api/learning/studio/topic-whiteboards/preflight` → `TopicWhiteboardController.preflight`；[apps/api/src/modules/learning/topic-whiteboard.controller.ts:12](../../../apps/api/src/modules/learning/topic-whiteboard.controller.ts#L12)。
- `POST /api/learning/studio/topic-whiteboards/drafts` → `TopicWhiteboardController.prepare`；[apps/api/src/modules/learning/topic-whiteboard.controller.ts:13](../../../apps/api/src/modules/learning/topic-whiteboard.controller.ts#L13)。
- `GET /api/learning/studio/topic-whiteboards/drafts` → `TopicWhiteboardController.drafts`；[apps/api/src/modules/learning/topic-whiteboard.controller.ts:14](../../../apps/api/src/modules/learning/topic-whiteboard.controller.ts#L14)。
- `GET /api/learning/studio/topic-whiteboards/drafts/:id` → `TopicWhiteboardController.draft`；[apps/api/src/modules/learning/topic-whiteboard.controller.ts:15](../../../apps/api/src/modules/learning/topic-whiteboard.controller.ts#L15)。
- `GET /api/learning/studio/topic-whiteboards/drafts/:id/requests/:key` → `TopicWhiteboardController.receipt`；[apps/api/src/modules/learning/topic-whiteboard.controller.ts:16](../../../apps/api/src/modules/learning/topic-whiteboard.controller.ts#L16)。
- `GET /api/learning/studio/topic-whiteboards/drafts/:id/history` → `TopicWhiteboardController.history`；[apps/api/src/modules/learning/topic-whiteboard.controller.ts:17](../../../apps/api/src/modules/learning/topic-whiteboard.controller.ts#L17)。
- `POST /api/learning/studio/topic-whiteboards/drafts/:id/cancel` → `TopicWhiteboardController.cancel`；[apps/api/src/modules/learning/topic-whiteboard.controller.ts:19](../../../apps/api/src/modules/learning/topic-whiteboard.controller.ts#L19)。
- `POST /api/learning/studio/topic-whiteboards/drafts/:id/retry` → `TopicWhiteboardController.retry`；[apps/api/src/modules/learning/topic-whiteboard.controller.ts:20](../../../apps/api/src/modules/learning/topic-whiteboard.controller.ts#L20)。
- `PATCH /api/learning/studio/topic-whiteboards/drafts/:id/content` → `TopicWhiteboardController.edit`；[apps/api/src/modules/learning/topic-whiteboard.controller.ts:21](../../../apps/api/src/modules/learning/topic-whiteboard.controller.ts#L21)。
- `POST /api/learning/studio/topic-whiteboards/drafts/:id/confirm` → `TopicWhiteboardController.confirm`；[apps/api/src/modules/learning/topic-whiteboard.controller.ts:22](../../../apps/api/src/modules/learning/topic-whiteboard.controller.ts#L22)。
- `GET /api/learning/studio/topic-whiteboards` → `TopicWhiteboardController.list`；[apps/api/src/modules/learning/topic-whiteboard.controller.ts:23](../../../apps/api/src/modules/learning/topic-whiteboard.controller.ts#L23)。
- `GET /api/learning/studio/topic-whiteboards/:id` → `TopicWhiteboardController.get`；[apps/api/src/modules/learning/topic-whiteboard.controller.ts:24](../../../apps/api/src/modules/learning/topic-whiteboard.controller.ts#L24)。
- `POST /api/learning/studio/topic-whiteboards/:id/narration/:sceneId` → `TopicWhiteboardController.speak`；[apps/api/src/modules/learning/topic-whiteboard.controller.ts:33](../../../apps/api/src/modules/learning/topic-whiteboard.controller.ts#L33)。

**服务方法**：

- `TopicWhiteboardService.preflight`；[apps/api/src/modules/learning/topic-whiteboard.service.ts:58](../../../apps/api/src/modules/learning/topic-whiteboard.service.ts#L58)。
- `TopicWhiteboardService.prepare`；[apps/api/src/modules/learning/topic-whiteboard.service.ts:66](../../../apps/api/src/modules/learning/topic-whiteboard.service.ts#L66)。
- `TopicWhiteboardService.list`；[apps/api/src/modules/learning/topic-whiteboard.service.ts:176](../../../apps/api/src/modules/learning/topic-whiteboard.service.ts#L176)。
- `TopicWhiteboardService.get`；[apps/api/src/modules/learning/topic-whiteboard.service.ts:131](../../../apps/api/src/modules/learning/topic-whiteboard.service.ts#L131)。
- `TopicWhiteboardService.receipt`；[apps/api/src/modules/learning/topic-whiteboard.service.ts:172](../../../apps/api/src/modules/learning/topic-whiteboard.service.ts#L172)。
- `TopicWhiteboardService.history`；[apps/api/src/modules/learning/topic-whiteboard.service.ts:249](../../../apps/api/src/modules/learning/topic-whiteboard.service.ts#L249)。
- `TopicWhiteboardService.control`；[apps/api/src/modules/learning/topic-whiteboard.service.ts:195](../../../apps/api/src/modules/learning/topic-whiteboard.service.ts#L195)。
- `TopicWhiteboardService.edit`；[apps/api/src/modules/learning/topic-whiteboard.service.ts:228](../../../apps/api/src/modules/learning/topic-whiteboard.service.ts#L228)。
- `TopicWhiteboardService.confirm`；[apps/api/src/modules/learning/topic-whiteboard.service.ts:255](../../../apps/api/src/modules/learning/topic-whiteboard.service.ts#L255)。
- `TopicWhiteboardService.listPublished`；[apps/api/src/modules/learning/topic-whiteboard.service.ts:309](../../../apps/api/src/modules/learning/topic-whiteboard.service.ts#L309)。
- `TopicWhiteboardService.getPublished`；[apps/api/src/modules/learning/topic-whiteboard.service.ts:299](../../../apps/api/src/modules/learning/topic-whiteboard.service.ts#L299)。
- `TopicWhiteboardNarrationService.synthesize`；[apps/api/src/modules/learning/topic-whiteboard-narration.service.ts:21](../../../apps/api/src/modules/learning/topic-whiteboard-narration.service.ts#L21)。

**补充实现文件**：

- [packages/contracts/src/topic-whiteboard.ts](../../../packages/contracts/src/topic-whiteboard.ts)
- [apps/api/src/modules/learning/topic-whiteboard.controller.ts](../../../apps/api/src/modules/learning/topic-whiteboard.controller.ts)
- [apps/api/src/modules/learning/topic-whiteboard-worker.service.ts](../../../apps/api/src/modules/learning/topic-whiteboard-worker.service.ts)
- [apps/api/src/modules/learning/topic-whiteboard-content.ts](../../../apps/api/src/modules/learning/topic-whiteboard-content.ts)
- [apps/api/src/modules/learning/topic-whiteboard.integration.test.ts](../../../apps/api/src/modules/learning/topic-whiteboard.integration.test.ts)
- [apps/api/src/infrastructure/topic-whiteboard-recovery.integration.test.ts](../../../apps/api/src/infrastructure/topic-whiteboard-recovery.integration.test.ts)
- [apps/web/app/studio/whiteboards/workbench.tsx](../../../apps/web/app/studio/whiteboards/workbench.tsx)
- [apps/web/app/studio/whiteboards/content-editor.tsx](../../../apps/web/app/studio/whiteboards/content-editor.tsx)
- [apps/web/app/studio/whiteboards/command-digest.ts](../../../apps/web/app/studio/whiteboards/command-digest.ts)
- [apps/web/app/studio/whiteboards/local-copies.ts](../../../apps/web/app/studio/whiteboards/local-copies.ts)
- [apps/web/app/studio/whiteboards/manuscript.tsx](../../../apps/web/app/studio/whiteboards/manuscript.tsx)
- [apps/web/app/studio/whiteboard-table.ts](../../../apps/web/app/studio/whiteboard-table.ts)
- [tests/e2e/topic-whiteboard.spec.ts](../../../tests/e2e/topic-whiteboard.spec.ts)

## STUDIO-32 主题白板配图、复杂公式与冻结视觉讲稿

**输入**：本人ready完整稿/幕/修订/教学指纹、目的/需求、真实原图及原命令键。

**处理与实现**：冻结必要教学上下文和原PNG，经安装Skill持久生成/edit；原键重放先于可用性探测。lease、原登录、监护/范围/目标/教学指纹和原图字节阻止迟到发布。明确完整稿PATCH逐幕验证选图，确认时另冻原件/展示图及SHA/尺寸，公开引用不含私有候选。两文档槽保留完整配图请求与图注，显式下载保护；SHA/解码后显示真实缩略图、双图对照和原比例键盘阅读。播放器放大先暂停，实际视频预取图片并保留SRT。共享孩子快照独立保留PNG，作者私稿/提示词擦除；SQLite/PG最新删除账本及中断续跑阻止复活。 MathJax4本地受限TeX生成经过白名单复验的统一SVG，阅读区保留KaTeX MathML与完整可复制原式；录制前有界解码，与图片同幕分区。长/高公式以至少0.8比例重叠分页，沿原逐句时间表保留首末符号；未知语法显式分页原文，不静默截断。2次真实HTTP生图/edit与35项专项、两端253完整浏览器及完整API分别留证，不相加为产品覆盖率。

**输出**：独立候选和原件、明确选图、授权冻结图片、可复制公式与完整向量/原文分页视频和家庭归档。

**状态与持久化**：`studioTopicWhiteboardVisuals`、`studioTopicWhiteboardDrafts`、`studioTopicWhiteboards`

**权限、失败与边界**：124已在main实际交付：构建6ab9211/核心0d4e738、schema17，精确09bdeee CI三组success，两端253浏览器零重试、120运行检查及217787毫秒守护观察。图片与公式仍待教学核对，不构成掌握/测量/教师批准；原CSS/字体/DPR/原声及真人/设备/全内容/长期条件未完成。

**关联接口**：

- `GET /api/learning/studio/topic-whiteboard-visuals/capabilities` → `TopicWhiteboardVisualController.capabilities`；[apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts:11](../../../apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts#L11)。
- `POST /api/learning/studio/topic-whiteboard-visuals/preflight` → `TopicWhiteboardVisualController.preflight`；[apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts:12](../../../apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts#L12)。
- `POST /api/learning/studio/topic-whiteboard-visuals` → `TopicWhiteboardVisualController.prepare`；[apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts:13](../../../apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts#L13)。
- `GET /api/learning/studio/topic-whiteboard-visuals` → `TopicWhiteboardVisualController.list`；[apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts:14](../../../apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts#L14)。
- `GET /api/learning/studio/topic-whiteboard-visuals/requests/:key` → `TopicWhiteboardVisualController.original`；[apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts:15](../../../apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts#L15)。
- `GET /api/learning/studio/topic-whiteboard-visuals/:id/requests/:key` → `TopicWhiteboardVisualController.receipt`；[apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts:16](../../../apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts#L16)。
- `GET /api/learning/studio/topic-whiteboard-visuals/:id` → `TopicWhiteboardVisualController.get`；[apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts:17](../../../apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts#L17)。
- `POST /api/learning/studio/topic-whiteboard-visuals/:id/cancel` → `TopicWhiteboardVisualController.cancel`；[apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts:18](../../../apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts#L18)。
- `POST /api/learning/studio/topic-whiteboard-visuals/:id/retry` → `TopicWhiteboardVisualController.retry`；[apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts:19](../../../apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts#L19)。
- `POST /api/learning/studio/topic-whiteboard-visuals/:id/edits` → `TopicWhiteboardVisualController.edit`；[apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts:20](../../../apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts#L20)。
- `GET /api/learning/studio/topic-whiteboard-visuals/:id/image` → `TopicWhiteboardVisualController.image`；[apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts:21](../../../apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts#L21)。
- `GET /api/learning/studio/topic-whiteboard-visuals/:id/original` → `TopicWhiteboardVisualController.originalImage`；[apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts:24](../../../apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts#L24)。
- `GET /api/learning/studio/topic-whiteboards/:id/figures/:sceneId/image` → `TopicWhiteboardController.figure`；[apps/api/src/modules/learning/topic-whiteboard.controller.ts:25](../../../apps/api/src/modules/learning/topic-whiteboard.controller.ts#L25)。
- `GET /api/learning/studio/topic-whiteboards/:id/figures/:sceneId/original` → `TopicWhiteboardController.originalFigure`；[apps/api/src/modules/learning/topic-whiteboard.controller.ts:29](../../../apps/api/src/modules/learning/topic-whiteboard.controller.ts#L29)。

**服务方法**：

- `TopicWhiteboardVisualService.capabilities`；[apps/api/src/modules/learning/topic-whiteboard-visual.service.ts:26](../../../apps/api/src/modules/learning/topic-whiteboard-visual.service.ts#L26)。
- `TopicWhiteboardVisualService.preflight`；[apps/api/src/modules/learning/topic-whiteboard-visual.service.ts:46](../../../apps/api/src/modules/learning/topic-whiteboard-visual.service.ts#L46)。
- `TopicWhiteboardVisualService.prepare`；[apps/api/src/modules/learning/topic-whiteboard-visual.service.ts:73](../../../apps/api/src/modules/learning/topic-whiteboard-visual.service.ts#L73)。
- `TopicWhiteboardVisualService.list`；[apps/api/src/modules/learning/topic-whiteboard-visual.service.ts:113](../../../apps/api/src/modules/learning/topic-whiteboard-visual.service.ts#L113)。
- `TopicWhiteboardVisualService.receipt`；[apps/api/src/modules/learning/topic-whiteboard-visual.service.ts:107](../../../apps/api/src/modules/learning/topic-whiteboard-visual.service.ts#L107)。
- `TopicWhiteboardVisualService.get`；[apps/api/src/modules/learning/topic-whiteboard-visual.service.ts:106](../../../apps/api/src/modules/learning/topic-whiteboard-visual.service.ts#L106)。
- `TopicWhiteboardVisualService.control`；[apps/api/src/modules/learning/topic-whiteboard-visual.service.ts:125](../../../apps/api/src/modules/learning/topic-whiteboard-visual.service.ts#L125)。
- `TopicWhiteboardVisualService.file`；[apps/api/src/modules/learning/topic-whiteboard-visual.service.ts:120](../../../apps/api/src/modules/learning/topic-whiteboard-visual.service.ts#L120)。
- `TopicWhiteboardService.publishedFigure`；[apps/api/src/modules/learning/topic-whiteboard.service.ts:300](../../../apps/api/src/modules/learning/topic-whiteboard.service.ts#L300)。

**补充实现文件**：

- [packages/contracts/src/topic-whiteboard-visual.ts](../../../packages/contracts/src/topic-whiteboard-visual.ts)
- [apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts](../../../apps/api/src/modules/learning/topic-whiteboard-visual.controller.ts)
- [apps/api/src/modules/learning/topic-whiteboard-visual-worker.service.ts](../../../apps/api/src/modules/learning/topic-whiteboard-visual-worker.service.ts)
- [apps/api/src/modules/learning/topic-whiteboard-figures.ts](../../../apps/api/src/modules/learning/topic-whiteboard-figures.ts)
- [apps/api/src/modules/learning/topic-whiteboard-visual-retention.ts](../../../apps/api/src/modules/learning/topic-whiteboard-visual-retention.ts)
- [apps/api/src/modules/learning/topic-whiteboard-visual.integration.test.ts](../../../apps/api/src/modules/learning/topic-whiteboard-visual.integration.test.ts)
- [apps/api/src/infrastructure/topic-whiteboard-visual-recovery.integration.test.ts](../../../apps/api/src/infrastructure/topic-whiteboard-visual-recovery.integration.test.ts)
- [apps/web/app/studio/whiteboards/figure-workbench.tsx](../../../apps/web/app/studio/whiteboards/figure-workbench.tsx)
- [apps/web/app/studio/topic-figure-image.tsx](../../../apps/web/app/studio/topic-figure-image.tsx)
- [apps/web/app/studio/whiteboard-session.tsx](../../../apps/web/app/studio/whiteboard-session.tsx)
- [apps/web/app/studio/whiteboard-canvas.tsx](../../../apps/web/app/studio/whiteboard-canvas.tsx)
- [tests/e2e/topic-whiteboard.spec.ts](../../../tests/e2e/topic-whiteboard.spec.ts)
- [doc/product/124-topic-whiteboard-figures-and-visual-manuscripts.md](../../../doc/product/124-topic-whiteboard-figures-and-visual-manuscripts.md)
- [apps/web/app/studio/whiteboard-formula.ts](../../../apps/web/app/studio/whiteboard-formula.ts)
- [apps/web/app/studio/whiteboard-formula-image.ts](../../../apps/web/app/studio/whiteboard-formula-image.ts)
- [apps/web/app/studio/whiteboard-exhibit.tsx](../../../apps/web/app/studio/whiteboard-exhibit.tsx)
- [apps/web/app/studio/whiteboard-exhibit.css](../../../apps/web/app/studio/whiteboard-exhibit.css)
- [apps/api/src/modules/learning/whiteboard-formula.test.ts](../../../apps/api/src/modules/learning/whiteboard-formula.test.ts)
- [scripts/qa/topic-figure-live.cjs](../../../scripts/qa/topic-figure-live.cjs)
- [doc/evidence/2026-10-26/topic-figure-runtime.json](../../../doc/evidence/2026-10-26/topic-figure-runtime.json)
- [doc/evidence/2026-10-26/topic-figure-acceptance.json](../../../doc/evidence/2026-10-26/topic-figure-acceptance.json)

## STUDIO-24 长PDF分块上传、页级续跑与按需原文

**输入**：学习范围、文件SHA、4MiB分块、请求键、页码、资料版本和任务版本。

**处理与实现**：原件流式组装并核对完整字节；上传完成只排后台任务；最多120页按原件/算法身份保存完整JSON检查点与页图摘要，恢复时核验并只补缺失/损坏页；目录只发概要，按页且绑定版本取正文；两处入口支持中断重选、丢失回执恢复、范围批选和取消续跑；注册原件持文件租约并核对最新generation；学生入口沿学习授权验证；显式检查原件/逐页文件，旧可读图像回填带legacy_observed来源的摘要，嵌入页单独登记；校验不符不重设摘要，检查不改来源版本；两处入口提供缺失/损坏页图重生成，处理前再次核对原件。

**输出**：50MiB受控上传、120页真实进度、原件/正文/结构对照与可恢复选课。

**状态与持久化**：`studioMaterialUploads`、`studioSourceMaterials`、`studioMaterialAssets`

**权限、失败与边界**：运行预算不是静默裁切；旧30页/10MB同步接口兼容；OCR/模型结构仍为候选，旧页图回填只建立本次可读文件基线，不证明历史未变或与原件语义一致；原件恢复见STUDIO-25，双库续恢复/冷恢复清理见OPS-07。

**关联接口**：

- `GET /api/learning/material-uploads` → `StudioMaterialUploadController.list`；[apps/api/src/modules/learning/studio-material-upload.controller.ts:8](../../../apps/api/src/modules/learning/studio-material-upload.controller.ts#L8)。
- `POST /api/learning/material-uploads` → `StudioMaterialUploadController.start`；[apps/api/src/modules/learning/studio-material-upload.controller.ts:9](../../../apps/api/src/modules/learning/studio-material-upload.controller.ts#L9)。
- `GET /api/learning/material-uploads/:id` → `StudioMaterialUploadController.get`；[apps/api/src/modules/learning/studio-material-upload.controller.ts:10](../../../apps/api/src/modules/learning/studio-material-upload.controller.ts#L10)。
- `PUT /api/learning/material-uploads/:id/chunks/:index` → `StudioMaterialUploadController.chunk`；[apps/api/src/modules/learning/studio-material-upload.controller.ts:11](../../../apps/api/src/modules/learning/studio-material-upload.controller.ts#L11)。
- `POST /api/learning/material-uploads/:id/complete` → `StudioMaterialUploadController.complete`；[apps/api/src/modules/learning/studio-material-upload.controller.ts:12](../../../apps/api/src/modules/learning/studio-material-upload.controller.ts#L12)。
- `POST /api/learning/material-uploads/:id/cancel` → `StudioMaterialUploadController.cancel`；[apps/api/src/modules/learning/studio-material-upload.controller.ts:13](../../../apps/api/src/modules/learning/studio-material-upload.controller.ts#L13)。
- `GET /api/learning/source-courses/materials/:id` → `SourceCourseController.material`；[apps/api/src/modules/learning/source-course.controller.ts:16](../../../apps/api/src/modules/learning/source-course.controller.ts#L16)。
- `GET /api/learning/source-courses/materials/:id/progress` → `SourceCourseController.materialProgress`；[apps/api/src/modules/learning/source-course.controller.ts:13](../../../apps/api/src/modules/learning/source-course.controller.ts#L13)。
- `GET /api/learning/source-courses/materials/:id/pages/:page` → `SourceCourseController.materialPage`；[apps/api/src/modules/learning/source-course.controller.ts:17](../../../apps/api/src/modules/learning/source-course.controller.ts#L17)。
- `POST /api/learning/source-courses/materials/:id/process/cancel` → `SourceCourseController.cancelMaterialProcessing`；[apps/api/src/modules/learning/source-course.controller.ts:18](../../../apps/api/src/modules/learning/source-course.controller.ts#L18)。
- `GET /api/learning/source-courses/materials/:id/files` → `SourceCourseController.materialFiles`；[apps/api/src/modules/learning/source-course.controller.ts:14](../../../apps/api/src/modules/learning/source-course.controller.ts#L14)。
- `POST /api/learning/source-courses/materials/:id/files/check` → `SourceCourseController.checkMaterialFiles`；[apps/api/src/modules/learning/source-course.controller.ts:15](../../../apps/api/src/modules/learning/source-course.controller.ts#L15)。

**服务方法**：

- `StudioMaterialUploadService.list`；[apps/api/src/modules/learning/studio-material-upload.service.ts:39](../../../apps/api/src/modules/learning/studio-material-upload.service.ts#L39)。
- `StudioMaterialUploadService.start`；[apps/api/src/modules/learning/studio-material-upload.service.ts:40](../../../apps/api/src/modules/learning/studio-material-upload.service.ts#L40)。
- `StudioMaterialUploadService.get`；[apps/api/src/modules/learning/studio-material-upload.service.ts:50](../../../apps/api/src/modules/learning/studio-material-upload.service.ts#L50)。
- `StudioMaterialUploadService.chunk`；[apps/api/src/modules/learning/studio-material-upload.service.ts:59](../../../apps/api/src/modules/learning/studio-material-upload.service.ts#L59)。
- `StudioMaterialUploadService.complete`；[apps/api/src/modules/learning/studio-material-upload.service.ts:66](../../../apps/api/src/modules/learning/studio-material-upload.service.ts#L66)。
- `StudioMaterialUploadService.cancel`；[apps/api/src/modules/learning/studio-material-upload.service.ts:65](../../../apps/api/src/modules/learning/studio-material-upload.service.ts#L65)。
- `StudioMaterialUploadService.material`；[apps/api/src/modules/learning/studio-material-upload.service.ts:51](../../../apps/api/src/modules/learning/studio-material-upload.service.ts#L51)。
- `StudioMaterialUploadService.progress`；[apps/api/src/modules/learning/studio-material-upload.service.ts:76](../../../apps/api/src/modules/learning/studio-material-upload.service.ts#L76)。
- `StudioMaterialUploadService.page`；[apps/api/src/modules/learning/studio-material-upload.service.ts:52](../../../apps/api/src/modules/learning/studio-material-upload.service.ts#L52)。
- `StudioMaterialUploadService.cancelProcessing`；[apps/api/src/modules/learning/studio-material-upload.service.ts:77](../../../apps/api/src/modules/learning/studio-material-upload.service.ts#L77)。
- `StudioMaterialIntegrityService.get`；[apps/api/src/modules/learning/studio-material-integrity.service.ts:103](../../../apps/api/src/modules/learning/studio-material-integrity.service.ts#L103)。
- `StudioMaterialIntegrityService.check`；[apps/api/src/modules/learning/studio-material-integrity.service.ts:104](../../../apps/api/src/modules/learning/studio-material-integrity.service.ts#L104)。

**补充实现文件**：

- [packages/contracts/src/studio-material-upload.ts](../../../packages/contracts/src/studio-material-upload.ts)
- [apps/api/src/modules/learning/studio-material-storage.ts](../../../apps/api/src/modules/learning/studio-material-storage.ts)
- [apps/api/src/modules/learning/studio-material-integrity.integration.test.ts](../../../apps/api/src/modules/learning/studio-material-integrity.integration.test.ts)
- [apps/web/app/studio/source-courses/pdf-material-files.tsx](../../../apps/web/app/studio/source-courses/pdf-material-files.tsx)
- [apps/api/src/modules/learning/studio-material-upload.integration.test.ts](../../../apps/api/src/modules/learning/studio-material-upload.integration.test.ts)
- [scripts/processing/process_document.py](../../../scripts/processing/process_document.py)
- [scripts/processing/file_leases.py](../../../scripts/processing/file_leases.py)
- [apps/web/app/studio/source-courses/pdf-material.tsx](../../../apps/web/app/studio/source-courses/pdf-material.tsx)
- [tests/e2e/pdf-material.spec.ts](../../../tests/e2e/pdf-material.spec.ts)

## STUDIO-33 原句白板插问、冻结模型与完整输入恢复

**输入**：两种原白板身份、实际原句与版本、五种教学意图、所选模型、完整问题和稳定请求键。

**处理与实现**：服务端从已保存原件冻结当前句及已讲知识块；队列保留原模型、完整输入、租约与取消代次，发布前复核原登录、孩子授权及原稿摘要。小九纯文本CLI使用一次性空目录和任务级Responses转发，实际上游无工具，拒绝工具响应而非只依赖提示。未发送输入与原请求分开恢复，分页历史、失败原重试、返回原句和相机书签由真实面板承载；关闭手机阅读层保留同一输入组件。

**输出**：可恢复原句问答、来源锚点、实际模型和明确任务状态。

**状态与持久化**：`whiteboardQuestionTurns`、`studioWhiteboards`、`studioTopicWhiteboards`

**权限、失败与边界**：不把插问、AI回答或回看当首答、掌握或根因测量；原稿变化不将旧回答带入新历史。21模型的合成协议验证不等于全部真实供应商或教学质量验证。完整PG恢复、整站、精确CI和运行交付按当批证据分别核对。

**关联接口**：

- `GET /api/learning/studio/whiteboards/:boardId/questions/context` → `GuidanceWhiteboardQuestionController.context`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:25](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L25)。
- `GET /api/learning/studio/whiteboards/:boardId/questions/requests/:key` → `GuidanceWhiteboardQuestionController.receipt`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:26](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L26)。
- `GET /api/learning/studio/whiteboards/:boardId/questions` → `GuidanceWhiteboardQuestionController.list`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:32](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L32)。
- `GET /api/learning/studio/whiteboards/:boardId/questions/:id` → `GuidanceWhiteboardQuestionController.get`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:33](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L33)。
- `POST /api/learning/studio/whiteboards/:boardId/questions` → `GuidanceWhiteboardQuestionController.create`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:34](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L34)。
- `POST /api/learning/studio/whiteboards/:boardId/questions/:id/cancel` → `GuidanceWhiteboardQuestionController.cancel`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:35](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L35)。
- `POST /api/learning/studio/whiteboards/:boardId/questions/:id/retry` → `GuidanceWhiteboardQuestionController.retry`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:36](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L36)。
- `GET /api/learning/studio/topic-whiteboards/:boardId/questions/context` → `TopicWhiteboardQuestionController.context`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:43](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L43)。
- `GET /api/learning/studio/topic-whiteboards/:boardId/questions/requests/:key` → `TopicWhiteboardQuestionController.receipt`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:44](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L44)。
- `GET /api/learning/studio/topic-whiteboards/:boardId/questions` → `TopicWhiteboardQuestionController.list`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:50](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L50)。
- `GET /api/learning/studio/topic-whiteboards/:boardId/questions/:id` → `TopicWhiteboardQuestionController.get`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:51](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L51)。
- `POST /api/learning/studio/topic-whiteboards/:boardId/questions` → `TopicWhiteboardQuestionController.create`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:52](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L52)。
- `POST /api/learning/studio/topic-whiteboards/:boardId/questions/:id/cancel` → `TopicWhiteboardQuestionController.cancel`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:53](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L53)。
- `POST /api/learning/studio/topic-whiteboards/:boardId/questions/:id/retry` → `TopicWhiteboardQuestionController.retry`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:54](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L54)。

**服务方法**：

- `WhiteboardQuestionService.context`；[apps/api/src/modules/learning/whiteboard-question.service.ts:36](../../../apps/api/src/modules/learning/whiteboard-question.service.ts#L36)。
- `WhiteboardQuestionService.receipt`；[apps/api/src/modules/learning/whiteboard-question.service.ts:67](../../../apps/api/src/modules/learning/whiteboard-question.service.ts#L67)。
- `WhiteboardQuestionService.list`；[apps/api/src/modules/learning/whiteboard-question.service.ts:59](../../../apps/api/src/modules/learning/whiteboard-question.service.ts#L59)。
- `WhiteboardQuestionService.get`；[apps/api/src/modules/learning/whiteboard-question.service.ts:64](../../../apps/api/src/modules/learning/whiteboard-question.service.ts#L64)。
- `WhiteboardQuestionService.create`；[apps/api/src/modules/learning/whiteboard-question.service.ts:101](../../../apps/api/src/modules/learning/whiteboard-question.service.ts#L101)。
- `WhiteboardQuestionService.control`；[apps/api/src/modules/learning/whiteboard-question.service.ts:138](../../../apps/api/src/modules/learning/whiteboard-question.service.ts#L138)。

**补充实现文件**：

- [packages/contracts/src/whiteboard-question.ts](../../../packages/contracts/src/whiteboard-question.ts)
- [apps/api/src/modules/learning/whiteboard-question-worker.service.ts](../../../apps/api/src/modules/learning/whiteboard-question-worker.service.ts)
- [apps/api/src/modules/learning/whiteboard-question-context.ts](../../../apps/api/src/modules/learning/whiteboard-question-context.ts)
- [apps/api/src/modules/learning/whiteboard-question-access.ts](../../../apps/api/src/modules/learning/whiteboard-question-access.ts)
- [apps/api/src/modules/learning/whiteboard-question.integration.test.ts](../../../apps/api/src/modules/learning/whiteboard-question.integration.test.ts)
- [apps/api/src/infrastructure/whiteboard-question-storage.integration.test.ts](../../../apps/api/src/infrastructure/whiteboard-question-storage.integration.test.ts)
- [apps/api/src/infrastructure/whiteboard-question-postgres.integration.test.ts](../../../apps/api/src/infrastructure/whiteboard-question-postgres.integration.test.ts)
- [scripts/qa/run-whiteboard-questions-postgres.cjs](../../../scripts/qa/run-whiteboard-questions-postgres.cjs)
- [apps/api/src/modules/ai/xiaojiu-text-transport.ts](../../../apps/api/src/modules/ai/xiaojiu-text-transport.ts)
- [apps/api/src/modules/ai/xiaojiu-text-transport.test.ts](../../../apps/api/src/modules/ai/xiaojiu-text-transport.test.ts)
- [apps/web/app/studio/whiteboard-questions.tsx](../../../apps/web/app/studio/whiteboard-questions.tsx)
- [tests/e2e/whiteboard-questions.spec.ts](../../../tests/e2e/whiteboard-questions.spec.ts)

## STUDIO-34 原回答补充板书、显式声音与完整教学笔记

**输入**：已发布回答指纹、原句/原白板关系、真实音色、完整句计划及笔记格式。

**处理与实现**：一个回答生成独立受鉴权补充来源，保留唯一原旁白；要点、受控图、整行表格及多个完整公式绑定真实句边界，共用原播放器及声画时间表。显式进入和播放，返回恢复原句/进度/声音时间/相机。HTTP朗读在供应商前后复核身份；PNG、含声WebM与SRT复用真实解码时间表。完整JSON/Markdown笔记包含所有已保存问题，下载后段再次核对owner及原件摘要，关闭或撤权丢弃迟到结果。

**输出**：独立AI补充讲解、受控图表公式、逐句音轨、私有深链、完整笔记和可返回原稿。

**状态与持久化**：`whiteboardQuestionTurns`、`studioWhiteboards`、`studioTopicWhiteboards`

**权限、失败与边界**：旧纯文字回答保留文字与收听，不编造板书；超过向量引擎预算的公式完整显示原式，不冒称全部向量排版。补充配图与不可覆盖版本见STUDIO-35；声音实测只是一份匿名回答的一句，不能代替听感、全模型、整站和原站像素验证。

**关联接口**：

- `GET /api/learning/studio/whiteboards/:boardId/questions/:id/board` → `GuidanceWhiteboardQuestionController.board`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:29](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L29)。
- `POST /api/learning/studio/whiteboards/:boardId/questions/:id/board/narration/:sceneId` → `GuidanceWhiteboardQuestionController.speak`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:30](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L30)。
- `GET /api/learning/studio/whiteboards/:boardId/questions/notes` → `GuidanceWhiteboardQuestionController.notes`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:27](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L27)。
- `GET /api/learning/studio/whiteboards/:boardId/questions/notes/identity` → `GuidanceWhiteboardQuestionController.notesIdentity`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:28](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L28)。
- `GET /api/learning/studio/topic-whiteboards/:boardId/questions/:id/board` → `TopicWhiteboardQuestionController.board`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:47](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L47)。
- `POST /api/learning/studio/topic-whiteboards/:boardId/questions/:id/board/narration/:sceneId` → `TopicWhiteboardQuestionController.speak`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:48](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L48)。
- `GET /api/learning/studio/topic-whiteboards/:boardId/questions/notes` → `TopicWhiteboardQuestionController.notes`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:45](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L45)。
- `GET /api/learning/studio/topic-whiteboards/:boardId/questions/notes/identity` → `TopicWhiteboardQuestionController.notesIdentity`；[apps/api/src/modules/learning/whiteboard-question.controller.ts:46](../../../apps/api/src/modules/learning/whiteboard-question.controller.ts#L46)。

**服务方法**：

- `WhiteboardQuestionService.board`；[apps/api/src/modules/learning/whiteboard-question.service.ts:80](../../../apps/api/src/modules/learning/whiteboard-question.service.ts#L80)。
- `WhiteboardQuestionService.notes`；[apps/api/src/modules/learning/whiteboard-question.service.ts:83](../../../apps/api/src/modules/learning/whiteboard-question.service.ts#L83)。
- `WhiteboardQuestionService.notesIdentity`；[apps/api/src/modules/learning/whiteboard-question.service.ts:90](../../../apps/api/src/modules/learning/whiteboard-question.service.ts#L90)。

**补充实现文件**：

- [apps/api/src/modules/learning/whiteboard-question-teaching.ts](../../../apps/api/src/modules/learning/whiteboard-question-teaching.ts)
- [apps/api/src/modules/learning/whiteboard-question-narration.service.ts](../../../apps/api/src/modules/learning/whiteboard-question-narration.service.ts)
- [apps/api/src/modules/learning/whiteboard-question-teaching.test.ts](../../../apps/api/src/modules/learning/whiteboard-question-teaching.test.ts)
- [apps/api/src/modules/learning/whiteboard-question-notes.test.ts](../../../apps/api/src/modules/learning/whiteboard-question-notes.test.ts)
- [apps/web/app/studio/whiteboard-question-notes.ts](../../../apps/web/app/studio/whiteboard-question-notes.ts)
- [apps/web/app/studio/whiteboard-original.ts](../../../apps/web/app/studio/whiteboard-original.ts)
- [apps/web/app/studio/whiteboard-frame.ts](../../../apps/web/app/studio/whiteboard-frame.ts)
- [apps/web/app/studio/whiteboard-session.tsx](../../../apps/web/app/studio/whiteboard-session.tsx)
- [apps/web/app/studio/whiteboard-reading-panel.tsx](../../../apps/web/app/studio/whiteboard-reading-panel.tsx)
- [tests/e2e/whiteboard-questions.spec.ts](../../../tests/e2e/whiteboard-questions.spec.ts)

## STUDIO-35 原回答配图、原PNG编辑与不可覆盖教学版本

**输入**：原白板类型/ID、turn/回复指纹/原稿摘要、完整要求、预检摘要、原PNG身份和稳定命令键。

**处理与实现**：schema20独立owner/request唯一索引；预检异步探测后和生成/编辑/发布前后复核当前登录、授权、完整回答及租约。实际原PNG编辑、SHA校验、明确采用创建UUID教学版本并保留原回答/所有旧图；原命令重放不改变后来选择，旧标签竞争拒绝。图片来源、声音请求、私有链接和续播绑定确切版本；完整JSON/Markdown保留公开版本和SHA。独立本机文档槽保留完整要求与原请求，存储失败下载/导入/离开保护。双库备份包含冻结原图/显示图，最新删除账本不复活旧图片，保留合法引用与未知文件。

**输出**：可核对图片候选、实际原PNG、完整请求恢复和可回看/导出的独立教学版本。

**状态与持久化**：`whiteboardQuestionVisuals`、`whiteboardQuestionTurns`

**权限、失败与边界**：真实供应商只验证一份匿名DS回答与gpt-image-2生成/编辑各一次；图示待教师核对，不能作精密测量或正式评分。浏览器验收进行中，全站/精确CI/守护交付及原站像素、真人听感和长期教学仍待。

**关联接口**：

- `GET /api/learning/studio/whiteboard-question-visuals/capabilities` → `WhiteboardQuestionVisualController.capabilities`；[apps/api/src/modules/learning/whiteboard-question-visual.controller.ts:15](../../../apps/api/src/modules/learning/whiteboard-question-visual.controller.ts#L15)。
- `GET /api/learning/studio/whiteboard-question-visuals/source` → `WhiteboardQuestionVisualController.source`；[apps/api/src/modules/learning/whiteboard-question-visual.controller.ts:16](../../../apps/api/src/modules/learning/whiteboard-question-visual.controller.ts#L16)。
- `GET /api/learning/studio/whiteboard-question-visuals/requests/:key` → `WhiteboardQuestionVisualController.receipt`；[apps/api/src/modules/learning/whiteboard-question-visual.controller.ts:17](../../../apps/api/src/modules/learning/whiteboard-question-visual.controller.ts#L17)。
- `GET /api/learning/studio/whiteboard-question-visuals` → `WhiteboardQuestionVisualController.list`；[apps/api/src/modules/learning/whiteboard-question-visual.controller.ts:18](../../../apps/api/src/modules/learning/whiteboard-question-visual.controller.ts#L18)。
- `POST /api/learning/studio/whiteboard-question-visuals/preflight` → `WhiteboardQuestionVisualController.preflight`；[apps/api/src/modules/learning/whiteboard-question-visual.controller.ts:19](../../../apps/api/src/modules/learning/whiteboard-question-visual.controller.ts#L19)。
- `POST /api/learning/studio/whiteboard-question-visuals/adopt` → `WhiteboardQuestionVisualController.adopt`；[apps/api/src/modules/learning/whiteboard-question-visual.controller.ts:20](../../../apps/api/src/modules/learning/whiteboard-question-visual.controller.ts#L20)。
- `POST /api/learning/studio/whiteboard-question-visuals` → `WhiteboardQuestionVisualController.create`；[apps/api/src/modules/learning/whiteboard-question-visual.controller.ts:21](../../../apps/api/src/modules/learning/whiteboard-question-visual.controller.ts#L21)。
- `GET /api/learning/studio/whiteboard-question-visuals/:id` → `WhiteboardQuestionVisualController.get`；[apps/api/src/modules/learning/whiteboard-question-visual.controller.ts:22](../../../apps/api/src/modules/learning/whiteboard-question-visual.controller.ts#L22)。
- `GET /api/learning/studio/whiteboard-question-visuals/:id/requests/:key` → `WhiteboardQuestionVisualController.controlReceipt`；[apps/api/src/modules/learning/whiteboard-question-visual.controller.ts:23](../../../apps/api/src/modules/learning/whiteboard-question-visual.controller.ts#L23)。
- `GET /api/learning/studio/whiteboard-question-visuals/:id/:part` → `WhiteboardQuestionVisualController.file`；[apps/api/src/modules/learning/whiteboard-question-visual.controller.ts:24](../../../apps/api/src/modules/learning/whiteboard-question-visual.controller.ts#L24)。
- `POST /api/learning/studio/whiteboard-question-visuals/:id/edit` → `WhiteboardQuestionVisualController.edit`；[apps/api/src/modules/learning/whiteboard-question-visual.controller.ts:27](../../../apps/api/src/modules/learning/whiteboard-question-visual.controller.ts#L27)。
- `POST /api/learning/studio/whiteboard-question-visuals/:id/cancel` → `WhiteboardQuestionVisualController.cancel`；[apps/api/src/modules/learning/whiteboard-question-visual.controller.ts:28](../../../apps/api/src/modules/learning/whiteboard-question-visual.controller.ts#L28)。
- `POST /api/learning/studio/whiteboard-question-visuals/:id/retry` → `WhiteboardQuestionVisualController.retry`；[apps/api/src/modules/learning/whiteboard-question-visual.controller.ts:29](../../../apps/api/src/modules/learning/whiteboard-question-visual.controller.ts#L29)。
- `GET /api/learning/studio/:boardType/:boardId/questions/:turnId/teaching-versions` → `WhiteboardQuestionTeachingVersionController.versions`；[apps/api/src/modules/learning/whiteboard-question-visual.controller.ts:39](../../../apps/api/src/modules/learning/whiteboard-question-visual.controller.ts#L39)。
- `GET /api/learning/studio/:boardType/:boardId/questions/:turnId/teaching-versions/:id/board` → `WhiteboardQuestionTeachingVersionController.board`；[apps/api/src/modules/learning/whiteboard-question-visual.controller.ts:42](../../../apps/api/src/modules/learning/whiteboard-question-visual.controller.ts#L42)。
- `GET /api/learning/studio/:boardType/:boardId/questions/:turnId/teaching-versions/:id/figure/:part` → `WhiteboardQuestionTeachingVersionController.file`；[apps/api/src/modules/learning/whiteboard-question-visual.controller.ts:45](../../../apps/api/src/modules/learning/whiteboard-question-visual.controller.ts#L45)。

**服务方法**：

- `WhiteboardQuestionVisualService.capabilities`；[apps/api/src/modules/learning/whiteboard-question-visual.service.ts:30](../../../apps/api/src/modules/learning/whiteboard-question-visual.service.ts#L30)。
- `WhiteboardQuestionVisualService.source`；[apps/api/src/modules/learning/whiteboard-question-visual.service.ts:31](../../../apps/api/src/modules/learning/whiteboard-question-visual.service.ts#L31)。
- `WhiteboardQuestionVisualService.receipt`；[apps/api/src/modules/learning/whiteboard-question-visual.service.ts:95](../../../apps/api/src/modules/learning/whiteboard-question-visual.service.ts#L95)。
- `WhiteboardQuestionVisualService.list`；[apps/api/src/modules/learning/whiteboard-question-visual.service.ts:101](../../../apps/api/src/modules/learning/whiteboard-question-visual.service.ts#L101)。
- `WhiteboardQuestionVisualService.preflight`；[apps/api/src/modules/learning/whiteboard-question-visual.service.ts:47](../../../apps/api/src/modules/learning/whiteboard-question-visual.service.ts#L47)。
- `WhiteboardQuestionVisualService.adopt`；[apps/api/src/modules/learning/whiteboard-question-visual.service.ts:111](../../../apps/api/src/modules/learning/whiteboard-question-visual.service.ts#L111)。
- `WhiteboardQuestionVisualService.prepare`；[apps/api/src/modules/learning/whiteboard-question-visual.service.ts:70](../../../apps/api/src/modules/learning/whiteboard-question-visual.service.ts#L70)。
- `WhiteboardQuestionVisualService.get`；[apps/api/src/modules/learning/whiteboard-question-visual.service.ts:94](../../../apps/api/src/modules/learning/whiteboard-question-visual.service.ts#L94)。
- `WhiteboardQuestionVisualService.file`；[apps/api/src/modules/learning/whiteboard-question-visual.service.ts:107](../../../apps/api/src/modules/learning/whiteboard-question-visual.service.ts#L107)。
- `WhiteboardQuestionVisualService.control`；[apps/api/src/modules/learning/whiteboard-question-visual.service.ts:129](../../../apps/api/src/modules/learning/whiteboard-question-visual.service.ts#L129)。
- `WhiteboardQuestionTeachingVersionController.target`；[apps/api/src/modules/learning/whiteboard-question-visual.controller.ts:35](../../../apps/api/src/modules/learning/whiteboard-question-visual.controller.ts#L35)。
- `WhiteboardQuestionVisualService.teaching`；[apps/api/src/modules/learning/whiteboard-question-visual.service.ts:120](../../../apps/api/src/modules/learning/whiteboard-question-visual.service.ts#L120)。
- `WhiteboardQuestionVisualService.versionFile`；[apps/api/src/modules/learning/whiteboard-question-visual.service.ts:124](../../../apps/api/src/modules/learning/whiteboard-question-visual.service.ts#L124)。

**补充实现文件**：

- [packages/contracts/src/whiteboard-question-visual.ts](../../../packages/contracts/src/whiteboard-question-visual.ts)
- [apps/api/src/modules/learning/whiteboard-question-visual-context.ts](../../../apps/api/src/modules/learning/whiteboard-question-visual-context.ts)
- [apps/api/src/modules/learning/whiteboard-question-visual-access.ts](../../../apps/api/src/modules/learning/whiteboard-question-visual-access.ts)
- [apps/api/src/modules/learning/whiteboard-question-visual-worker.service.ts](../../../apps/api/src/modules/learning/whiteboard-question-visual-worker.service.ts)
- [apps/api/src/modules/learning/whiteboard-question-teaching-versions.ts](../../../apps/api/src/modules/learning/whiteboard-question-teaching-versions.ts)
- [apps/api/src/modules/learning/whiteboard-question-visual-retention.ts](../../../apps/api/src/modules/learning/whiteboard-question-visual-retention.ts)
- [apps/api/src/infrastructure/whiteboard-question-visual-storage.integration.test.ts](../../../apps/api/src/infrastructure/whiteboard-question-visual-storage.integration.test.ts)
- [apps/api/src/modules/learning/whiteboard-question-visual.integration.test.ts](../../../apps/api/src/modules/learning/whiteboard-question-visual.integration.test.ts)
- [apps/web/app/studio/whiteboard-question-figures.tsx](../../../apps/web/app/studio/whiteboard-question-figures.tsx)
- [apps/web/app/studio/whiteboard-question-figures.css](../../../apps/web/app/studio/whiteboard-question-figures.css)
- [apps/web/app/studio/whiteboard-questions.tsx](../../../apps/web/app/studio/whiteboard-questions.tsx)
- [apps/web/app/studio/whiteboard-media.ts](../../../apps/web/app/studio/whiteboard-media.ts)
- [apps/web/app/studio/whiteboard-original.ts](../../../apps/web/app/studio/whiteboard-original.ts)
- [apps/web/app/studio/whiteboard-session.tsx](../../../apps/web/app/studio/whiteboard-session.tsx)
- [apps/web/app/studio/whiteboard-question-notes.ts](../../../apps/web/app/studio/whiteboard-question-notes.ts)
- [tests/e2e/whiteboard-questions.spec.ts](../../../tests/e2e/whiteboard-questions.spec.ts)
- [scripts/qa/question-figure-live.cjs](../../../scripts/qa/question-figure-live.cjs)
- [scripts/qa/run-question-figures-postgres.cjs](../../../scripts/qa/run-question-figures-postgres.cjs)

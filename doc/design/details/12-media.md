# 12 作答图片、录音与受控媒体 — 详细设计

源码基线：`d6d0542e0e19e01f3cdf929f1634b91c7177dfb9`。角色：学生、监护人、授权复核教师。

产品入口：`/student/assessment`、`/student/today`、`/admin/reviews`。

## 模块实现

- [apps/api/src/modules/student-media/student-media.service.ts](../../../apps/api/src/modules/student-media/student-media.service.ts)
- [apps/api/src/modules/student-media/media-normalization.ts](../../../apps/api/src/modules/student-media/media-normalization.ts)
- [apps/api/src/modules/student-media/student-media-cleanup.service.ts](../../../apps/api/src/modules/student-media/student-media-cleanup.service.ts)

## 共享契约

- [packages/contracts/src/student-media.ts](../../../packages/contracts/src/student-media.ts)
- [packages/contracts/src/answer-protocol.ts](../../../packages/contracts/src/answer-protocol.ts)

## 关联验证

以下是对应功能领域的测试入口；测试文件存在不等于每个子场景已由真人或所有设备验证。

- [apps/api/src/modules/student-media/student-media.integration.test.ts](../../../apps/api/src/modules/student-media/student-media.integration.test.ts)
- [apps/api/src/modules/student-media/student-media.durability.integration.test.ts](../../../apps/api/src/modules/student-media/student-media.durability.integration.test.ts)
- [apps/api/src/modules/student-media/media-normalization.test.ts](../../../apps/api/src/modules/student-media/media-normalization.test.ts)

## MEDIA-01 上传能力探测与断点分块

**输入**：当前评测/训练、题目、媒体类别、大小、分块与请求键。

**处理与实现**：验证活动、所有者和题目要求；持久化上传状态；按索引上传不大于1MiB分块；完成时校验完整性并转规范格式；取消后排清理。

**输出**：受控媒体ID、上传进度与完成状态。

**状态与持久化**：`studentMedia`

**权限、失败与边界**：原文件最多12MiB；能力缺失时题型退出新选题或提示跳过。

**关联接口**：

- `GET /api/learning/media/capabilities` → `StudentMediaController.capabilities`；[apps/api/src/modules/student-media/student-media.controller.ts:11](../../../apps/api/src/modules/student-media/student-media.controller.ts#L11)。
- `POST /api/learning/media` → `StudentMediaController.start`；[apps/api/src/modules/student-media/student-media.controller.ts:12](../../../apps/api/src/modules/student-media/student-media.controller.ts#L12)。
- `GET /api/learning/media/:id` → `StudentMediaController.get`；[apps/api/src/modules/student-media/student-media.controller.ts:13](../../../apps/api/src/modules/student-media/student-media.controller.ts#L13)。
- `PUT /api/learning/media/:id/chunks/:index` → `StudentMediaController.chunk`；[apps/api/src/modules/student-media/student-media.controller.ts:14](../../../apps/api/src/modules/student-media/student-media.controller.ts#L14)。
- `POST /api/learning/media/:id/complete` → `StudentMediaController.complete`；[apps/api/src/modules/student-media/student-media.controller.ts:17](../../../apps/api/src/modules/student-media/student-media.controller.ts#L17)。
- `POST /api/learning/media/:id/cancel` → `StudentMediaController.cancel`；[apps/api/src/modules/student-media/student-media.controller.ts:18](../../../apps/api/src/modules/student-media/student-media.controller.ts#L18)。

**服务方法**：

- `StudentMediaService.capabilities`；[apps/api/src/modules/student-media/student-media.service.ts:22](../../../apps/api/src/modules/student-media/student-media.service.ts#L22)。
- `StudentMediaService.start`；[apps/api/src/modules/student-media/student-media.service.ts:59](../../../apps/api/src/modules/student-media/student-media.service.ts#L59)。
- `StudentMediaService.get`；[apps/api/src/modules/student-media/student-media.service.ts:57](../../../apps/api/src/modules/student-media/student-media.service.ts#L57)。
- `StudentMediaService.chunk`；[apps/api/src/modules/student-media/student-media.service.ts:88](../../../apps/api/src/modules/student-media/student-media.service.ts#L88)。
- `StudentMediaService.complete`；[apps/api/src/modules/student-media/student-media.service.ts:98](../../../apps/api/src/modules/student-media/student-media.service.ts#L98)。
- `StudentMediaService.cancel`；[apps/api/src/modules/student-media/student-media.service.ts:223](../../../apps/api/src/modules/student-media/student-media.service.ts#L223)。

## MEDIA-02 图片/录音规范化与证据绑定

**输入**：原始图像或音频、响应引用。

**处理与实现**：图像真实解码、纠正方向、去EXIF后PNG；ffmpeg/ffprobe转16kHz单声道WAV；校验时长和分辨率；只允许同题同活动媒体绑定响应。

**输出**：规范化学习证据与SHA-256。

**状态与持久化**：`studentMedia`、`diagnosticResponses`、`practiceAttempts`

**权限、失败与边界**：图片最大6000边/2000万像素；录音最长180秒；拒绝视频轨道、网络输入与伪扩展名。

**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。

## MEDIA-03 授权读取、过期与回收

**输入**：mediaId与当前身份、绑定响应或草稿。

**处理与实现**：读取时再次校验学生/教师授权与文件哈希；完成的绑定证据保留；未完成上传、未绑定文件按策略排持久清理任务。

**输出**：受控内容与回收回执。

**状态与持久化**：`studentMedia`

**权限、失败与边界**：未完成上传24小时过期；活动未绑定7天、结束后未绑定24小时；草稿引用与已绑定证据不能误删。

**关联接口**：

- `GET /api/learning/media/:id/content` → `StudentMediaController.content`；[apps/api/src/modules/student-media/student-media.controller.ts:19](../../../apps/api/src/modules/student-media/student-media.controller.ts#L19)。

**服务方法**：

- `StudentMediaService.content`；[apps/api/src/modules/student-media/student-media.service.ts:146](../../../apps/api/src/modules/student-media/student-media.service.ts#L146)。

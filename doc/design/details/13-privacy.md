# 13 家庭资料下载、删除与恢复约束 — 详细设计

源码基线：`d6d0542e0e19e01f3cdf929f1634b91c7177dfb9`。角色：监护家长。

产品入口：`/parent/data`。

## 模块实现

- [apps/api/src/modules/privacy/privacy.service.ts](../../../apps/api/src/modules/privacy/privacy.service.ts)
- [apps/api/src/modules/privacy/privacy-records.ts](../../../apps/api/src/modules/privacy/privacy-records.ts)
- [apps/api/src/modules/privacy/tar-archive.ts](../../../apps/api/src/modules/privacy/tar-archive.ts)
- [scripts/operations/privacy-ledger.cjs](../../../scripts/operations/privacy-ledger.cjs)

## 共享契约

- [packages/contracts/src/privacy.ts](../../../packages/contracts/src/privacy.ts)

## 关联验证

以下是对应功能领域的测试入口；测试文件存在不等于每个子场景已由真人或所有设备验证。

- [apps/api/src/modules/privacy/privacy.integration.test.ts](../../../apps/api/src/modules/privacy/privacy.integration.test.ts)
- [apps/api/src/modules/privacy/privacy.durability.integration.test.ts](../../../apps/api/src/modules/privacy/privacy.durability.integration.test.ts)

## PRIVACY-01 影响预览与资料JSON导出

**输入**：账号或学生范围、再次验证密码、requestKey。

**处理与实现**：筛选当前主体可处理记录；预览关联实体与指纹；导出前再次验证凭据；portableRecords移除令牌、密码、私有答案键和内部请求字段。

**输出**：可携带学习JSON及审计回执。

**状态与持久化**：`privacyRequests`

**权限、失败与边界**：导出业务学习事实不等于导出全部原始研究资产或未传完分块。

**关联接口**：

- `GET /api/privacy/overview` → `PrivacyController.overview`；[apps/api/src/modules/privacy/privacy.controller.ts:10](../../../apps/api/src/modules/privacy/privacy.controller.ts#L10)。
- `GET /api/privacy/account/deletion-preview` → `PrivacyController.accountPreview`；[apps/api/src/modules/privacy/privacy.controller.ts:11](../../../apps/api/src/modules/privacy/privacy.controller.ts#L11)。
- `GET /api/privacy/students/:id/deletion-preview` → `PrivacyController.studentPreview`；[apps/api/src/modules/privacy/privacy.controller.ts:12](../../../apps/api/src/modules/privacy/privacy.controller.ts#L12)。
- `POST /api/privacy/account/export` → `PrivacyController.accountExport`；[apps/api/src/modules/privacy/privacy.controller.ts:13](../../../apps/api/src/modules/privacy/privacy.controller.ts#L13)。
- `POST /api/privacy/students/:id/export` → `PrivacyController.studentExport`；[apps/api/src/modules/privacy/privacy.controller.ts:14](../../../apps/api/src/modules/privacy/privacy.controller.ts#L14)。

**服务方法**：

- `PrivacyService.overview`；[apps/api/src/modules/privacy/privacy.service.ts:38](../../../apps/api/src/modules/privacy/privacy.service.ts#L38)。
- `PrivacyService.preview`；[apps/api/src/modules/privacy/privacy.service.ts:59](../../../apps/api/src/modules/privacy/privacy.service.ts#L59)。
- `PrivacyService.export`；[apps/api/src/modules/privacy/privacy.service.ts:66](../../../apps/api/src/modules/privacy/privacy.service.ts#L66)。

## PRIVACY-02 带媒体归档与一次性下载

**输入**：再次验证密码、当前会话、准备归档请求。

**处理与实现**：收集规范化媒体及哈希清单；生成tar归档；准备接口仅在当前进程内保存短期快照；同登录会话两分钟内一次下载。

**输出**：JSON、规范化附件、校验清单。

**状态与持久化**：`privacyRequests`、`studentMedia`

**权限、失败与边界**：准备句柄重启失效，需重新准备；离线副本需自行管理。

**关联接口**：

- `POST /api/privacy/account/export-archive` → `PrivacyController.accountArchive`；[apps/api/src/modules/privacy/privacy.controller.ts:15](../../../apps/api/src/modules/privacy/privacy.controller.ts#L15)。
- `POST /api/privacy/students/:id/export-archive` → `PrivacyController.studentArchive`；[apps/api/src/modules/privacy/privacy.controller.ts:16](../../../apps/api/src/modules/privacy/privacy.controller.ts#L16)。
- `POST /api/privacy/account/prepare-archive` → `PrivacyController.prepareAccountArchive`；[apps/api/src/modules/privacy/privacy.controller.ts:17](../../../apps/api/src/modules/privacy/privacy.controller.ts#L17)。
- `POST /api/privacy/students/:id/prepare-archive` → `PrivacyController.prepareStudentArchive`；[apps/api/src/modules/privacy/privacy.controller.ts:18](../../../apps/api/src/modules/privacy/privacy.controller.ts#L18)。
- `GET /api/privacy/archives/:id` → `PrivacyController.downloadArchive`；[apps/api/src/modules/privacy/privacy.controller.ts:19](../../../apps/api/src/modules/privacy/privacy.controller.ts#L19)。

**服务方法**：

- `PrivacyController.archive`；[apps/api/src/modules/privacy/privacy.controller.ts:24](../../../apps/api/src/modules/privacy/privacy.controller.ts#L24)。
- `PrivacyService.prepareArchive`；[apps/api/src/modules/privacy/privacy.service.ts:98](../../../apps/api/src/modules/privacy/privacy.service.ts#L98)。
- `PrivacyController.archiveResponse`；[apps/api/src/modules/privacy/privacy.controller.ts:28](../../../apps/api/src/modules/privacy/privacy.controller.ts#L28)。
- `PrivacyService.downloadArchive`；[apps/api/src/modules/privacy/privacy.service.ts:107](../../../apps/api/src/modules/privacy/privacy.service.ts#L107)。

## PRIVACY-03 受控删除、共同监护与删除账本

**输入**：影响预览指纹、明确确认文本、凭据、请求键。

**处理与实现**：再次验证影响范围；删除所选个人资料和学习身份；共同监护学习事实按规则保留并匿名署名；媒体排清理；独立删除账本用于旧备份恢复后重应用。

**输出**：删除回执、撤销身份与恢复防护。

**状态与持久化**：`privacyRequests`、`sessions`、`bindings`、`studentMedia`

**权限、失败与边界**：旧备份不会凭空知道新删除，恢复时必须提供最新账本。

**关联接口**：

- `POST /api/privacy/students/:id/delete` → `PrivacyController.deleteStudent`；[apps/api/src/modules/privacy/privacy.controller.ts:22](../../../apps/api/src/modules/privacy/privacy.controller.ts#L22)。
- `POST /api/privacy/account/delete` → `PrivacyController.deleteAccount`；[apps/api/src/modules/privacy/privacy.controller.ts:23](../../../apps/api/src/modules/privacy/privacy.controller.ts#L23)。

**服务方法**：

- `PrivacyService.delete`；[apps/api/src/modules/privacy/privacy.service.ts:132](../../../apps/api/src/modules/privacy/privacy.service.ts#L132)。

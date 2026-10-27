# 01 身份、家庭与学习权限 — 详细设计

源码基线：`a59e33516cf89248104b758b28862695e280b0c1`。角色：家长、学生、管理员、授权教师。

产品入口：`/parent/login`、`/student/login`、`/parent/access`、`/admin/accounts`。

## 模块实现

- [apps/api/src/modules/auth/auth.service.ts](../../../apps/api/src/modules/auth/auth.service.ts)
- [apps/api/src/modules/students/students.service.ts](../../../apps/api/src/modules/students/students.service.ts)
- [apps/api/src/modules/students/student-access.service.ts](../../../apps/api/src/modules/students/student-access.service.ts)
- [apps/api/src/common/auth.guard.ts](../../../apps/api/src/common/auth.guard.ts)
- [apps/web/lib/api.ts](../../../apps/web/lib/api.ts)

## 共享契约

- [packages/contracts/src/index.ts](../../../packages/contracts/src/index.ts)
- [packages/contracts/src/student-access.ts](../../../packages/contracts/src/student-access.ts)

## 关联验证

以下是对应功能领域的测试入口；测试文件存在不等于每个子场景已由真人或所有设备验证。

- [apps/api/src/modules/students/student-access.integration.test.ts](../../../apps/api/src/modules/students/student-access.integration.test.ts)
- [apps/api/src/product-safety.integration.test.ts](../../../apps/api/src/product-safety.integration.test.ts)

## AUTH-01 家长注册

**输入**：账号 principal、credential。

**处理与实现**：验证输入和账号唯一性；使用哈希保存凭据；创建家长账号与带有效期会话；响应设置登录Cookie。

**输出**：家长身份、当前会话。

**状态与持久化**：`users`、`sessions`

**权限、失败与边界**：普通注册不能指定管理员角色，账号名称不决定权限。

**关联接口**：

- `POST /api/auth/register` → `AuthController.register`；[apps/api/src/modules/auth/auth.controller.ts:15](../../../apps/api/src/modules/auth/auth.controller.ts#L15)。

**服务方法**：

- `AuthService.register`；[apps/api/src/modules/auth/auth.service.ts:22](../../../apps/api/src/modules/auth/auth.service.ts#L22)。
- `AuthController.setCookie`；[apps/api/src/modules/auth/auth.controller.ts:10](../../../apps/api/src/modules/auth/auth.controller.ts#L10)。

## AUTH-02 登录、会话检查与退出

**输入**：账号、密码或现有Cookie。

**处理与实现**：校验凭据、账号状态和会话有效性；AuthGuard读取Cookie或Bearer令牌；共享身份区分检查中、已认证、明确未登录和暂不可确认；传输失败只重试一次，耗尽后提供根级手动重新确认；重新确认清空私有身份并用请求代次拒绝旧响应；退出撤销会话并清Cookie；家长注册/登录与学习码表单在React事件接管前禁用，避免SSR原生GET丢失输入。

**输出**：当前用户、明确认证错误或可恢复的连接提示。

**状态与持久化**：`users`、`sessions`

**权限、失败与边界**：仅401/403判定未登录；未知身份不恢复缓存或自动循环；浏览器不把长期令牌保存在localStorage；跨站部署须配置Cookie、HTTPS和CORS。

**关联接口**：

- `POST /api/auth/login` → `AuthController.login`；[apps/api/src/modules/auth/auth.controller.ts:22](../../../apps/api/src/modules/auth/auth.controller.ts#L22)。
- `GET /api/auth/me` → `AuthController.me`；[apps/api/src/modules/auth/auth.controller.ts:45](../../../apps/api/src/modules/auth/auth.controller.ts#L45)。
- `POST /api/auth/logout` → `AuthController.logout`；[apps/api/src/modules/auth/auth.controller.ts:38](../../../apps/api/src/modules/auth/auth.controller.ts#L38)。

**服务方法**：

- `AuthService.login`；[apps/api/src/modules/auth/auth.service.ts:38](../../../apps/api/src/modules/auth/auth.service.ts#L38)。
- `AuthController.setCookie`；[apps/api/src/modules/auth/auth.controller.ts:10](../../../apps/api/src/modules/auth/auth.controller.ts#L10)。
- `AuthService.logout`；[apps/api/src/modules/auth/auth.service.ts:50](../../../apps/api/src/modules/auth/auth.service.ts#L50)。

**补充实现文件**：

- [apps/web/lib/session-user.ts](../../../apps/web/lib/session-user.ts)
- [apps/web/components/session-connection.tsx](../../../apps/web/components/session-connection.tsx)
- [apps/web/components/session-control.tsx](../../../apps/web/components/session-control.tsx)
- [tests/e2e/assistant-conversations.spec.ts](../../../tests/e2e/assistant-conversations.spec.ts)
- [apps/web/app/parent/login/page.tsx](../../../apps/web/app/parent/login/page.tsx)
- [apps/web/app/student/login/page.tsx](../../../apps/web/app/student/login/page.tsx)
- [tests/e2e/topic-whiteboard.spec.ts](../../../tests/e2e/topic-whiteboard.spec.ts)

## AUTH-03 学习码登录与设备撤销

**输入**：studentId、enabled、expectedVersion、requestKey、一次性学习码。

**处理与实现**：家长启用受限学习账号；生成有有效期的码并只保存其摘要；兑码时绑定学生；权限变更同时撤销旧码和设备会话；每次操作保存修订。

**输出**：学生学习身份、设备清单、权限历史。

**状态与持久化**：`studentLearningAccess`、`studentLearningCodes`、`studentAccessRevisions`、`sessions`、`users`

**权限、失败与边界**：重放签发请求不再次回传明文码；学生不能管理自己的监护权限。

**关联接口**：

- `POST /api/auth/learning-code` → `AuthController.learningCode`；[apps/api/src/modules/auth/auth.controller.ts:33](../../../apps/api/src/modules/auth/auth.controller.ts#L33)。
- `GET /api/students/:studentId/learning-access` → `StudentsController.learningIdentity`；[apps/api/src/modules/students/students.controller.ts:11](../../../apps/api/src/modules/students/students.controller.ts#L11)。
- `POST /api/students/:studentId/learning-access` → `StudentsController.updateLearningIdentity`；[apps/api/src/modules/students/students.controller.ts:13](../../../apps/api/src/modules/students/students.controller.ts#L13)。
- `POST /api/students/:studentId/learning-access/codes` → `StudentsController.issueLearningCode`；[apps/api/src/modules/students/students.controller.ts:15](../../../apps/api/src/modules/students/students.controller.ts#L15)。
- `POST /api/students/:studentId/learning-access/sessions/:sessionId/revoke` → `StudentsController.revokeLearningSession`；[apps/api/src/modules/students/students.controller.ts:17](../../../apps/api/src/modules/students/students.controller.ts#L17)。

**服务方法**：

- `AuthService.redeemLearningCode`；[apps/api/src/modules/auth/auth.service.ts:61](../../../apps/api/src/modules/auth/auth.service.ts#L61)。
- `AuthController.setCookie`；[apps/api/src/modules/auth/auth.controller.ts:10](../../../apps/api/src/modules/auth/auth.controller.ts#L10)。
- `StudentAccessService.get`；[apps/api/src/modules/students/student-access.service.ts:16](../../../apps/api/src/modules/students/student-access.service.ts#L16)。
- `StudentAccessService.set`；[apps/api/src/modules/students/student-access.service.ts:28](../../../apps/api/src/modules/students/student-access.service.ts#L28)。
- `StudentAccessService.issueCode`；[apps/api/src/modules/students/student-access.service.ts:55](../../../apps/api/src/modules/students/student-access.service.ts#L55)。
- `StudentAccessService.revokeSession`；[apps/api/src/modules/students/student-access.service.ts:79](../../../apps/api/src/modules/students/student-access.service.ts#L79)。

## AUTH-04 学生档案与多孩子选择

**输入**：昵称、年级、时长、学科版本。

**处理与实现**：创建档案与创建者监护绑定；按当前主体筛选可访问孩子；家庭页和工作台分别加载所选孩子的数据。

**输出**：学生档案、可访问孩子列表。

**状态与持久化**：`students`、`bindings`、`subjectEnrollments`

**权限、失败与边界**：知道studentId不构成授权；不同学科进度单独管理。

**关联接口**：

- `POST /api/students` → `StudentsController.createStudent`；[apps/api/src/modules/students/students.controller.ts:20](../../../apps/api/src/modules/students/students.controller.ts#L20)。
- `GET /api/students/:studentId/profile` → `StudentsController.getProfile`；[apps/api/src/modules/students/students.controller.ts:38](../../../apps/api/src/modules/students/students.controller.ts#L38)。
- `GET /api/parents/:parentId/students` → `StudentsController.listChildren`；[apps/api/src/modules/students/students.controller.ts:62](../../../apps/api/src/modules/students/students.controller.ts#L62)。
- `GET /api/learning/students` → `LearningController.students`；[apps/api/src/modules/learning/learning.controller.ts:14](../../../apps/api/src/modules/learning/learning.controller.ts#L14)。

**服务方法**：

- `StudentsService.createStudent`；[apps/api/src/modules/students/students.service.ts:32](../../../apps/api/src/modules/students/students.service.ts#L32)。
- `StudentsService.getProfile`；[apps/api/src/modules/students/students.service.ts:133](../../../apps/api/src/modules/students/students.service.ts#L133)。
- `StudentsService.listChildren`；[apps/api/src/modules/students/students.service.ts:148](../../../apps/api/src/modules/students/students.service.ts#L148)。
- `LearningService.studentProfiles`；[apps/api/src/modules/learning/learning.service.ts:62](../../../apps/api/src/modules/learning/learning.service.ts#L62)。

## AUTH-05 邀请与共同监护绑定

**输入**：目标学生、受邀账号、邀请凭据。

**处理与实现**：由现有监护人创建受控邀请；校验受邀对象、有效期与消费状态；原子消费后新增绑定。

**输出**：新的监护绑定及事件。

**状态与持久化**：`studentInvitations`、`bindings`

**权限、失败与边界**：不能使用任意学生ID自行建立监护关系。

**关联接口**：

- `POST /api/students/:studentId/invitations` → `StudentsController.createInvitation`；[apps/api/src/modules/students/students.controller.ts:56](../../../apps/api/src/modules/students/students.controller.ts#L56)。
- `POST /api/parents/:parentId/bindings` → `StudentsController.bindStudent`；[apps/api/src/modules/students/students.controller.ts:43](../../../apps/api/src/modules/students/students.controller.ts#L43)。

**服务方法**：

- `StudentsService.createInvitation`；[apps/api/src/modules/students/students.service.ts:93](../../../apps/api/src/modules/students/students.service.ts#L93)。
- `StudentsService.bindStudent`；[apps/api/src/modules/students/students.service.ts:105](../../../apps/api/src/modules/students/students.service.ts#L105)。

## AUTH-06 教师复核授权及撤销

**输入**：学生、教师主体、授权/撤销理由。

**处理与实现**：监护人授予指定教师的复核访问；服务层按学生核对有效授权；撤销后后续请求重新校验权限。

**输出**：教师授权清单、审计记录。

**状态与持久化**：`teacherAssignments`、`sessions`

**权限、失败与边界**：教师角色不等于可以查看所有家庭。

**关联接口**：

- `GET /api/students/:studentId/reviewers` → `StudentsController.reviewers`；[apps/api/src/modules/students/students.controller.ts:71](../../../apps/api/src/modules/students/students.controller.ts#L71)。
- `POST /api/students/:studentId/reviewers` → `StudentsController.grantReviewer`；[apps/api/src/modules/students/students.controller.ts:76](../../../apps/api/src/modules/students/students.controller.ts#L76)。
- `POST /api/students/:studentId/reviewers/:assignmentId/revoke` → `StudentsController.revokeReviewer`；[apps/api/src/modules/students/students.controller.ts:81](../../../apps/api/src/modules/students/students.controller.ts#L81)。

**服务方法**：

- `StudentsService.reviewerAssignments`；[apps/api/src/modules/students/students.service.ts:167](../../../apps/api/src/modules/students/students.service.ts#L167)。
- `StudentsService.grantReviewer`；[apps/api/src/modules/students/students.service.ts:175](../../../apps/api/src/modules/students/students.service.ts#L175)。
- `StudentsService.revokeReviewer`；[apps/api/src/modules/students/students.service.ts:189](../../../apps/api/src/modules/students/students.service.ts#L189)。

## AUTH-07 管理员账号与角色维护

**输入**：角色、状态、显示名及版本化修改命令。

**处理与实现**：管理员检索账号并维护角色或停用状态；角色和账号状态变更使旧权限不再可用；管理员初始账号由本机CLI创建。

**输出**：脱敏账号列表和修改结果。

**状态与持久化**：`users`、`sessions`

**权限、失败与边界**：不提供公开管理员自注册，不依据账号前缀提权。

**关联接口**：

- `GET /api/admin/accounts` → `AccountsController.list`；[apps/api/src/modules/auth/accounts.controller.ts:8](../../../apps/api/src/modules/auth/accounts.controller.ts#L8)。
- `PATCH /api/admin/accounts/:id` → `AccountsController.update`；[apps/api/src/modules/auth/accounts.controller.ts:9](../../../apps/api/src/modules/auth/accounts.controller.ts#L9)。

**服务方法**：

- `AuthService.listAccounts`；[apps/api/src/modules/auth/auth.service.ts:78](../../../apps/api/src/modules/auth/auth.service.ts#L78)。
- `AuthService.updateAccount`；[apps/api/src/modules/auth/auth.service.ts:87](../../../apps/api/src/modules/auth/auth.service.ts#L87)。

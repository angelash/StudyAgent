# HTTP 接口实现索引

源码基线：`a03aa560bfca9bea8f0a03429936b5d9bc28f08d`。共 327 个 HTTP 路由声明，当前 AppModule 可达 306 个正常路由、8 个返回410的旧协议拦截路由；正常路由包含健康和运维接口。

本表从 Nest 装饰器与处理方法自动提取。参数签名不是完整请求 Schema；权限以身份 Guard 与服务层的学生/监护/内容审核断言共同决定。StreamableFile、Cookie、重定向等响应不应被当成普通 JSON。具体业务与校验见对应领域详细设计。

## HealthController — 当前接入

### GET /api/health

实现：[apps/api/src/infrastructure/health.controller.ts:7](../../../apps/api/src/infrastructure/health.controller.ts#L7)，方法 `health`。

- 签名：`health()`
- 控制器装饰器：`[]`
- 方法装饰器：`[]`
- 调用：无 this 服务调用；直接处理或静态函数。

### GET /api/ready

实现：[apps/api/src/infrastructure/health.controller.ts:8](../../../apps/api/src/infrastructure/health.controller.ts#L8)，方法 `ready`。

- 签名：`ready()`
- 控制器装饰器：`[]`
- 方法装饰器：`[]`
- 调用：无 this 服务调用；直接处理或静态函数。

## OperationsController — 当前接入

### GET /api/admin/operations

实现：[apps/api/src/infrastructure/operations.controller.ts:14](../../../apps/api/src/infrastructure/operations.controller.ts#L14)，方法 `overview`。

- 签名：`overview(@Req() req: AuthenticatedRequest): Promise<OperationsOverview>`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.store.select`、`this.store.scoringRevisions.filter`、`this.store.practiceScoringRevisions.filter`、`this.metrics.snapshot`、`this.store.tasks.summary`、`this.store.reviewTasks.filter`、`this.store.diagnosticResponses.filter`、`this.store.practiceAttempts.filter`、`this.store.evidenceFeedback.filter`、`this.store.privacyRequests.filter`

## AiController — 当前接入

### GET /api/ai/models

实现：[apps/api/src/modules/ai/ai.controller.ts:12](../../../apps/api/src/modules/ai/ai.controller.ts#L12)，方法 `models`。

- 签名：`models()`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.aiService.modelCatalog`

### POST /api/ai/assessment/analyze

实现：[apps/api/src/modules/ai/ai.controller.ts:15](../../../apps/api/src/modules/ai/ai.controller.ts#L15)，方法 `analyzeAssessment`。

- 签名：`analyzeAssessment(@Req() req: AuthenticatedRequest, @Body() body: { question: Question; answer: unknown })`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.aiService.analyzeAssessment`

### POST /api/ai/hints/generate

实现：[apps/api/src/modules/ai/ai.controller.ts:21](../../../apps/api/src/modules/ai/ai.controller.ts#L21)，方法 `generateHint`。

- 签名：`generateHint(@Req() req: AuthenticatedRequest, @Body() body: { question: Question; answerHistoryCount: number })`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.aiService.generateHint`

### POST /api/ai/assistant/sessions

实现：[apps/api/src/modules/ai/ai.controller.ts:27](../../../apps/api/src/modules/ai/ai.controller.ts#L27)，方法 `openSession`。

- 签名：`openSession(@Req() req: AuthenticatedRequest, @Body() body: { userRole: 'student' | 'parent'; studentId: string | null; subject?: 'math' | 'chinese' | 'english' | null; pageContext: 'student_home' | 'assessment' | 'mission' | 'review' | 'weekly_report'; contextRefType?: string | null; contextRefId?: string | null; contextItemId?: string | null; })`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.aiService.openAssistantSession`

### POST /api/ai/assistant/sessions/:sessionId/messages

实现：[apps/api/src/modules/ai/ai.controller.ts:44](../../../apps/api/src/modules/ai/ai.controller.ts#L44)，方法 `chat`。

- 签名：`chat(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) response: Response, @Param('sessionId') sessionId: string, @Body() body: { message: string; requestKey?: string; modelId?: string })`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.aiService.assertSessionOwner`、`this.aiService.chat`

### GET /api/ai/assistant/sessions/:sessionId/messages

实现：[apps/api/src/modules/ai/ai.controller.ts:58](../../../apps/api/src/modules/ai/ai.controller.ts#L58)，方法 `listMessages`。

- 签名：`listMessages(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.aiService.assertSessionOwner`、`this.aiService.listMessages`

## AssessmentsController — 历史代码，未被AppModule接入

### POST /api/assessments/start

实现：[apps/api/src/modules/assessments/assessments.controller.ts:10](../../../apps/api/src/modules/assessments/assessments.controller.ts#L10)，方法 `start`。

- 签名：`start(@Req() req: AuthenticatedRequest, @Body() body: { studentId: string; subject: 'math' | 'chinese' | 'english'; assessmentType: 'initial' | 'unit' | 'stage' | 'micro' | 'retry'; })`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.assessmentsService.start`

### POST /api/assessments/:sessionId/answers

实现：[apps/api/src/modules/assessments/assessments.controller.ts:23](../../../apps/api/src/modules/assessments/assessments.controller.ts#L23)，方法 `submitAnswer`。

- 签名：`submitAnswer(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Body() body: { itemId: string; answer: unknown; elapsedMs: number; })`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.assessmentsService.submitAnswer`

### POST /api/assessments/:sessionId/complete

实现：[apps/api/src/modules/assessments/assessments.controller.ts:37](../../../apps/api/src/modules/assessments/assessments.controller.ts#L37)，方法 `complete`。

- 签名：`complete(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.assessmentsService.complete`

### GET /api/assessments/:sessionId/progress

实现：[apps/api/src/modules/assessments/assessments.controller.ts:42](../../../apps/api/src/modules/assessments/assessments.controller.ts#L42)，方法 `progress`。

- 签名：`progress(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.assessmentsService.getProgress`

### GET /api/assessments/:sessionId/result

实现：[apps/api/src/modules/assessments/assessments.controller.ts:47](../../../apps/api/src/modules/assessments/assessments.controller.ts#L47)，方法 `result`。

- 签名：`result(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.assessmentsService.getResult`

## AccountsController — 当前接入

### GET /api/admin/accounts

实现：[apps/api/src/modules/auth/accounts.controller.ts:8](../../../apps/api/src/modules/auth/accounts.controller.ts#L8)，方法 `list`。

- 签名：`list(@Req() req: AuthenticatedRequest, @Query() query: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.auth.listAccounts`

### PATCH /api/admin/accounts/:id

实现：[apps/api/src/modules/auth/accounts.controller.ts:9](../../../apps/api/src/modules/auth/accounts.controller.ts#L9)，方法 `update`。

- 签名：`update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.auth.updateAccount`

## AuthController — 当前接入

### POST /api/auth/register

实现：[apps/api/src/modules/auth/auth.controller.ts:15](../../../apps/api/src/modules/auth/auth.controller.ts#L15)，方法 `register`。

- 签名：`register(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response)`
- 控制器装饰器：`[]`
- 方法装饰器：`[]`
- 调用：`this.authService.register`、`this.setCookie`

### POST /api/auth/login

实现：[apps/api/src/modules/auth/auth.controller.ts:22](../../../apps/api/src/modules/auth/auth.controller.ts#L22)，方法 `login`。

- 签名：`login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response)`
- 控制器装饰器：`[]`
- 方法装饰器：`[]`
- 调用：`this.authService.login`、`this.setCookie`

### POST /api/auth/learning-code

实现：[apps/api/src/modules/auth/auth.controller.ts:33](../../../apps/api/src/modules/auth/auth.controller.ts#L33)，方法 `learningCode`。

- 签名：`learningCode(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response)`
- 控制器装饰器：`[]`
- 方法装饰器：`[]`
- 调用：`this.authService.redeemLearningCode`、`this.setCookie`

### POST /api/auth/logout

实现：[apps/api/src/modules/auth/auth.controller.ts:38](../../../apps/api/src/modules/auth/auth.controller.ts#L38)，方法 `logout`。

- 签名：`logout(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response)`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.authService.logout`

### GET /api/auth/me

实现：[apps/api/src/modules/auth/auth.controller.ts:45](../../../apps/api/src/modules/auth/auth.controller.ts#L45)，方法 `me`。

- 签名：`me(@Req() req: AuthenticatedRequest)`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：无 this 服务调用；直接处理或静态函数。

## ContentController — 当前接入

### GET /api/textbooks

实现：[apps/api/src/modules/content/content.controller.ts:13](../../../apps/api/src/modules/content/content.controller.ts#L13)，方法 `listTextbooks`。

- 签名：`listTextbooks(@Query('subject') subject?: 'math' | 'chinese' | 'english')`
- 控制器装饰器：`[]`
- 方法装饰器：`[]`
- 调用：`this.contentService.listTextbooks`

### GET /api/textbooks/:volumeId/tree

实现：[apps/api/src/modules/content/content.controller.ts:18](../../../apps/api/src/modules/content/content.controller.ts#L18)，方法 `getVolumeTree`。

- 签名：`getVolumeTree(@Param('volumeId') volumeId: string)`
- 控制器装饰器：`[]`
- 方法装饰器：`[]`
- 调用：`this.contentService.getVolumeTree`

### GET /api/knowledge-points

实现：[apps/api/src/modules/content/content.controller.ts:23](../../../apps/api/src/modules/content/content.controller.ts#L23)，方法 `listKnowledgePoints`。

- 签名：`listKnowledgePoints(@Query('subject') subject?: 'math' | 'chinese' | 'english')`
- 控制器装饰器：`[]`
- 方法装饰器：`[]`
- 调用：`this.contentService.listKnowledgePoints`

### GET /api/questions

实现：[apps/api/src/modules/content/content.controller.ts:28](../../../apps/api/src/modules/content/content.controller.ts#L28)，方法 `listQuestions`。

- 签名：`listQuestions(@Req() req: AuthenticatedRequest, @Query('subject') subject?: 'math' | 'chinese' | 'english')`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.contentService.listQuestions`

### POST /api/admin/textbooks/import

实现：[apps/api/src/modules/content/content.controller.ts:36](../../../apps/api/src/modules/content/content.controller.ts#L36)，方法 `importTextbooks`。

- 签名：`importTextbooks(@Req() req: AuthenticatedRequest, @Body() body: { subject?: 'math' | 'chinese' | 'english'; publisherVersion?: string })`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.contentService.importTextbooks`

### POST /api/admin/knowledge-points

实现：[apps/api/src/modules/content/content.controller.ts:45](../../../apps/api/src/modules/content/content.controller.ts#L45)，方法 `createKnowledgePoint`。

- 签名：`createKnowledgePoint(@Req() req: AuthenticatedRequest, @Body() body: { subject: 'math' | 'chinese' | 'english'; name: string; parentId: string | null; gradeBand: string; difficultyLevel: number; lessonId: string | null; status?: 'draft' | 'published'; })`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.contentService.createKnowledgePoint`

### PATCH /api/admin/knowledge-points/:knowledgePointId

实现：[apps/api/src/modules/content/content.controller.ts:63](../../../apps/api/src/modules/content/content.controller.ts#L63)，方法 `updateKnowledgePoint`。

- 签名：`updateKnowledgePoint(@Req() req: AuthenticatedRequest, @Param('knowledgePointId') knowledgePointId: string, @Body() body: { name?: string; lessonId?: string | null; difficultyLevel?: number; status?: 'draft' | 'published'; })`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.contentService.updateKnowledgePoint`

### POST /api/admin/questions

实现：[apps/api/src/modules/content/content.controller.ts:79](../../../apps/api/src/modules/content/content.controller.ts#L79)，方法 `createQuestion`。

- 签名：`createQuestion(@Req() req: AuthenticatedRequest, @Body() body: { subject: 'math' | 'chinese' | 'english'; type: 'objective' | 'subjective' | 'stepwise' | 'oral'; stem: string; answer: unknown; analysis: string; difficultyLevel: number; knowledgePointIds?: string[]; status?: 'draft' | 'published'; })`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.contentService.createQuestion`

### POST /api/admin/questions/:questionId/knowledge-points

实现：[apps/api/src/modules/content/content.controller.ts:98](../../../apps/api/src/modules/content/content.controller.ts#L98)，方法 `mapQuestionKnowledge`。

- 签名：`mapQuestionKnowledge(@Req() req: AuthenticatedRequest, @Param('questionId') questionId: string, @Body() body: { knowledgePointIds: string[] })`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.contentService.mapQuestionKnowledge`

### PATCH /api/admin/questions/:questionId/knowledge-points

实现：[apps/api/src/modules/content/content.controller.ts:108](../../../apps/api/src/modules/content/content.controller.ts#L108)，方法 `replaceQuestionKnowledge`。

- 签名：`replaceQuestionKnowledge(@Req() req: AuthenticatedRequest, @Param('questionId') questionId: string, @Body() body: { knowledgePointIds: string[] })`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.contentService.replaceQuestionKnowledge`

### POST /api/admin/textbooks/:volumeId/scaffold-questions

实现：[apps/api/src/modules/content/content.controller.ts:118](../../../apps/api/src/modules/content/content.controller.ts#L118)，方法 `scaffoldVolumeQuestions`。

- 签名：`scaffoldVolumeQuestions(@Req() req: AuthenticatedRequest, @Param('volumeId') volumeId: string)`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.contentService.scaffoldVolumeQuestions`

### GET /api/admin/question-coverage/summary

实现：[apps/api/src/modules/content/content.controller.ts:124](../../../apps/api/src/modules/content/content.controller.ts#L124)，方法 `getQuestionCoverageSummary`。

- 签名：`getQuestionCoverageSummary(@Req() req: AuthenticatedRequest, @Query('subject') subject?: 'math' | 'chinese' | 'english', @Query('minQuestionsPerKnowledgePoint') minQuestionsPerKnowledgePoint?: string)`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.questionCoverageService.getCoverageSummary`

### POST /api/admin/question-coverage/backfill

实现：[apps/api/src/modules/content/content.controller.ts:138](../../../apps/api/src/modules/content/content.controller.ts#L138)，方法 `backfillQuestionCoverage`。

- 签名：`backfillQuestionCoverage(@Req() req: AuthenticatedRequest, @Body() body: { subject?: 'math' | 'chinese' | 'english'; minQuestionsPerKnowledgePoint?: number; importTextbookCandidates?: boolean; candidateVolumeLimit?: number | null; autoCreateDraftsFromCandidates?: boolean; })`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.questionCoverageService.backfillQuestionCoverage`

### PATCH /api/admin/questions/:questionId/publish

实现：[apps/api/src/modules/content/content.controller.ts:154](../../../apps/api/src/modules/content/content.controller.ts#L154)，方法 `publishQuestion`。

- 签名：`publishQuestion(@Req() req: AuthenticatedRequest, @Param('questionId') questionId: string)`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.contentService.publishQuestion`

## DiagnosticsController — 当前接入

### GET /api/admin/curriculum/package

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:21](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L21)，方法 `exportPackage`。

- 签名：`exportPackage(@Req() req: AuthenticatedRequest, @Query('subject') subject?: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.packages.export`

### POST /api/admin/curriculum/packages/preview

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:23](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L23)，方法 `previewPackage`。

- 签名：`previewPackage(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.packages.preview`

### POST /api/admin/curriculum/packages/apply

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:25](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L25)，方法 `applyPackage`。

- 签名：`applyPackage(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.packages.apply`

### GET /api/diagnostics/curriculum

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:28](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L28)，方法 `curriculumList`。

- 签名：`curriculumList(@Query('subject') subject?: string, @Query('grade') grade?: string, @Query('term') term?: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.curriculum.list`

### GET /api/diagnostics/textbooks

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:32](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L32)，方法 `textbooks`。

- 签名：`textbooks(@Query('subject') subject?: string, @Query('grade') grade?: string, @Query('term') term?: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.curriculum.textbooks.list`

### GET /api/diagnostics/textbooks/:bookId

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:37](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L37)，方法 `textbook`。

- 签名：`textbook(@Param('bookId') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.curriculum.textbooks.detail`

### GET /api/admin/curriculum/overview

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:39](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L39)，方法 `coverage`。

- 签名：`coverage(@Req() req: AuthenticatedRequest, @Query('subject') subject?: string, @Query('grade') grade?: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.curriculum.overview`

### GET /api/admin/curriculum/atoms/:atomId/items

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:43](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L43)，方法 `atomItems`。

- 签名：`atomItems(@Req() req: AuthenticatedRequest, @Param('atomId') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.curriculum.itemsForAtom`

### GET /api/admin/curriculum/revisions/:entityId

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:45](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L45)，方法 `revisions`。

- 签名：`revisions(@Req() req: AuthenticatedRequest, @Param('entityId') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.curriculum.revisions`

### GET /api/admin/curriculum/textbooks/:bookId

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:47](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L47)，方法 `textbookForEditor`。

- 签名：`textbookForEditor(@Req() req: AuthenticatedRequest, @Param('bookId') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.curriculum.assertEditor`、`this.curriculum.textbooks.detail`

### GET /api/admin/curriculum/textbooks/:bookId/document

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:51](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L51)，方法 `textbookDocument`。

- 签名：`textbookDocument(@Req() req: AuthenticatedRequest, @Param('bookId') id: string, @Headers('range') range: string | undefined, @Res({ passthrough: true }) response: Response)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.curriculum.assertEditor`、`this.curriculum.textbooks.document`

### POST /api/admin/curriculum/textbook-mappings

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:58](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L58)，方法 `saveTextbookMapping`。

- 签名：`saveTextbookMapping(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.curriculum.saveTextbookMapping`

### GET /api/admin/curriculum/textbook-mapping-worklist

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:60](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L60)，方法 `textbookMappingWorklist`。

- 签名：`textbookMappingWorklist(@Req() req: AuthenticatedRequest, @Query() query: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.curriculum.textbookMappingWorklist`

### POST /api/admin/knowledge-atoms

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:62](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L62)，方法 `saveAtom`。

- 签名：`saveAtom(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.curriculum.upsertAtom`

### POST /api/admin/measurement-items

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:64](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L64)，方法 `saveMapping`。

- 签名：`saveMapping(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.curriculum.upsertMapping`

### GET /api/students/:studentId/learning-scope

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:66](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L66)，方法 `scope`。

- 签名：`scope(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Query('subject') subject?: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.curriculum.getScope`

### PUT /api/students/:studentId/learning-scope

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:70](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L70)，方法 `saveScope`。

- 签名：`saveScope(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.curriculum.saveScope`

### GET /api/students/:studentId/progress-proposals

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:74](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L74)，方法 `progressProposals`。

- 签名：`progressProposals(@Req() req: AuthenticatedRequest, @Param('studentId') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.curriculum.progressProposals`

### POST /api/students/:studentId/progress-proposals

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:76](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L76)，方法 `proposeProgress`。

- 签名：`proposeProgress(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.curriculum.proposeScope`

### POST /api/students/:studentId/progress-proposals/:proposalId/decision

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:78](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L78)，方法 `decideProgress`。

- 签名：`decideProgress(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Param('proposalId') proposalId: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.curriculum.decideProgress`

### POST /api/diagnostics/sessions

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:82](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L82)，方法 `start`。

- 签名：`start(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.diagnostics.start`

### POST /api/diagnostics/blueprints

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:84](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L84)，方法 `previewBlueprint`。

- 签名：`previewBlueprint(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.diagnostics.previewBlueprint`

### GET /api/diagnostics/blueprints/:blueprintId

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:86](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L86)，方法 `blueprint`。

- 签名：`blueprint(@Req() req: AuthenticatedRequest, @Param('blueprintId') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.diagnostics.getBlueprint`

### POST /api/diagnostics/blueprints/:blueprintId/start

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:88](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L88)，方法 `startBlueprint`。

- 签名：`startBlueprint(@Req() req: AuthenticatedRequest, @Param('blueprintId') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.diagnostics.startBlueprint`

### POST /api/diagnostics/sessions/:sessionId/state

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:90](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L90)，方法 `changeState`。

- 签名：`changeState(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.diagnostics.changeState`

### GET /api/diagnostics/sessions

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:92](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L92)，方法 `list`。

- 签名：`list(@Req() req: AuthenticatedRequest, @Query('studentId') id: string, @Query('subject') subject?: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.diagnostics.listSessions`

### GET /api/diagnostics/sessions/:sessionId

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:96](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L96)，方法 `session`。

- 签名：`session(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.diagnostics.sessionView`

### GET /api/diagnostics/students/:studentId/evidence/:responseId

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:98](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L98)，方法 `evidence`。

- 签名：`evidence(@Req() req: AuthenticatedRequest, @Param('studentId') studentId: string, @Param('responseId') responseId: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.diagnostics.evidenceView`

### GET /api/diagnostics/sessions/:sessionId/items/:itemId

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:102](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L102)，方法 `render`。

- 签名：`render(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string, @Param('itemId') item: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.diagnostics.renderItem`

### POST /api/diagnostics/sessions/:sessionId/responses

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:104](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L104)，方法 `respond`。

- 签名：`respond(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.diagnostics.submit`

### PATCH /api/diagnostics/sessions/:sessionId/items/:itemId/draft

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:106](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L106)，方法 `draft`。

- 签名：`draft(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string, @Param('itemId') item: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.diagnostics.saveDraft`

### POST /api/diagnostics/sessions/:sessionId/items/:itemId/hint

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:110](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L110)，方法 `hint`。

- 签名：`hint(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string, @Param('itemId') item: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.diagnostics.hint`

### POST /api/diagnostics/sessions/:sessionId/complete

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:112](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L112)，方法 `complete`。

- 签名：`complete(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.diagnostics.complete`

### GET /api/diagnostics/sessions/:sessionId/report

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:114](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L114)，方法 `report`。

- 签名：`report(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.diagnostics.report`

### GET /api/diagnostics/sessions/:sessionId/analysis-status

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:116](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L116)，方法 `analysisStatus`。

- 签名：`analysisStatus(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.diagnostics.analysisStatus`

### POST /api/diagnostics/sessions/:sessionId/reanalyze

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:118](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L118)，方法 `reanalyze`。

- 签名：`reanalyze(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.diagnostics.reanalyzeReport`

### GET /api/diagnostics/students/:studentId/profile

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:120](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L120)，方法 `profile`。

- 签名：`profile(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Query('subject') subject?: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.diagnostics.profile`

### POST /api/diagnostics/students/:studentId/plans

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:122](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L122)，方法 `plan`。

- 签名：`plan(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.guidance.create`

### GET /api/diagnostics/students/:studentId/plans

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:124](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L124)，方法 `plans`。

- 签名：`plans(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Query('subject') subject?: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.guidance.list`

### PATCH /api/diagnostics/plans/:planId

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:126](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L126)，方法 `updatePlan`。

- 签名：`updatePlan(@Req() req: AuthenticatedRequest, @Param('planId') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.guidance.update`

### GET /api/diagnostics/plans/:planId

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:128](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L128)，方法 `getPlan`。

- 签名：`getPlan(@Req() req: AuthenticatedRequest, @Param('planId') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.guidance.get`

### GET /api/diagnostics/plans/:planId/history

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:130](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L130)，方法 `planHistory`。

- 签名：`planHistory(@Req() req: AuthenticatedRequest, @Param('planId') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.guidance.history`

### GET /api/diagnostics/plans/:planId/reviews

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:132](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L132)，方法 `planReviews`。

- 签名：`planReviews(@Req() req: AuthenticatedRequest, @Param('planId') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.guidance.planReviews`

### POST /api/diagnostics/plans/:planId/adjust

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:134](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L134)，方法 `adjustPlan`。

- 签名：`adjustPlan(@Req() req: AuthenticatedRequest, @Param('planId') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.guidance.adjust`

### GET /api/diagnostics/students/:studentId/reviews

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:136](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L136)，方法 `reviews`。

- 签名：`reviews(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Query('subject') subject?: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.guidance.reviews`

### POST /api/diagnostics/reviews/:reviewId/start

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:138](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L138)，方法 `review`。

- 签名：`review(@Req() req: AuthenticatedRequest, @Param('reviewId') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.guidance.startReview`

### POST /api/diagnostics/reviews/:reviewId/reschedule

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:140](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L140)，方法 `reschedule`。

- 签名：`reschedule(@Req() req: AuthenticatedRequest, @Param('reviewId') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.guidance.reschedule`

### GET /api/diagnostics/plans/:planId/retrospective

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:142](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L142)，方法 `retrospective`。

- 签名：`retrospective(@Req() req: AuthenticatedRequest, @Param('planId') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.guidance.retrospective`

### POST /api/diagnostics/plans/:planId/retrospective/acknowledge

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:144](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L144)，方法 `acknowledgeRetrospective`。

- 签名：`acknowledgeRetrospective(@Req() req: AuthenticatedRequest, @Param('planId') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.guidance.acknowledgeRetrospective`

### POST /api/admin/diagnostic-responses/:responseId/review

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:146](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L146)，方法 `reviewScore`。

- 签名：`reviewScore(@Req() req: AuthenticatedRequest, @Param('responseId') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.diagnostics.reviewScore`

### GET /api/diagnostics/sessions/:sessionId/report-history

实现：[apps/api/src/modules/diagnostics/diagnostics.controller.ts:148](../../../apps/api/src/modules/diagnostics/diagnostics.controller.ts#L148)，方法 `reportHistory`。

- 签名：`reportHistory(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.diagnostics.reportHistory`

## GespController — 当前接入

### GET /api/gesp/overview

实现：[apps/api/src/modules/gesp/gesp.controller.ts:11](../../../apps/api/src/modules/gesp/gesp.controller.ts#L11)，方法 `overview`。

- 签名：`overview(@Req() req: AuthenticatedRequest)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.gesp.overview`

### GET /api/gesp/student-content

实现：[apps/api/src/modules/gesp/gesp.controller.ts:12](../../../apps/api/src/modules/gesp/gesp.controller.ts#L12)，方法 `studentContent`。

- 签名：`studentContent(@Req() req: AuthenticatedRequest, @Query() query: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.gesp.studentContentReview`

### POST /api/gesp/student-content/reviews

实现：[apps/api/src/modules/gesp/gesp.controller.ts:13](../../../apps/api/src/modules/gesp/gesp.controller.ts#L13)，方法 `reviewStudentContent`。

- 签名：`reviewStudentContent(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.gesp.reviewStudentTask`

### GET /api/gesp/student-content/:taskId/reviews

实现：[apps/api/src/modules/gesp/gesp.controller.ts:14](../../../apps/api/src/modules/gesp/gesp.controller.ts#L14)，方法 `studentContentReviews`。

- 签名：`studentContentReviews(@Req() req: AuthenticatedRequest, @Param('taskId') taskId: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.gesp.studentTaskReviewHistory`

### PUT /api/gesp/students/:studentId/scope

实现：[apps/api/src/modules/gesp/gesp.controller.ts:17](../../../apps/api/src/modules/gesp/gesp.controller.ts#L17)，方法 `setScope`。

- 签名：`setScope(@Req() req: AuthenticatedRequest, @Param('studentId') studentId: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.gesp.setStudentScope`

### GET /api/gesp/students/:studentId/workspace

实现：[apps/api/src/modules/gesp/gesp.controller.ts:20](../../../apps/api/src/modules/gesp/gesp.controller.ts#L20)，方法 `workspace`。

- 签名：`workspace(@Req() req: AuthenticatedRequest, @Param('studentId') studentId: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.gesp.studentWorkspace`

### POST /api/gesp/code-submissions

实现：[apps/api/src/modules/gesp/gesp.controller.ts:23](../../../apps/api/src/modules/gesp/gesp.controller.ts#L23)，方法 `submitCode`。

- 签名：`submitCode(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.gesp.submitCode`

### POST /api/gesp/probe-submissions

实现：[apps/api/src/modules/gesp/gesp.controller.ts:24](../../../apps/api/src/modules/gesp/gesp.controller.ts#L24)，方法 `submitProbe`。

- 签名：`submitProbe(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.gesp.submitProbe`

### POST /api/gesp/hints

实现：[apps/api/src/modules/gesp/gesp.controller.ts:25](../../../apps/api/src/modules/gesp/gesp.controller.ts#L25)，方法 `requestHint`。

- 签名：`requestHint(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.gesp.requestHint`

### POST /api/gesp/guidance-plans

实现：[apps/api/src/modules/gesp/gesp.controller.ts:26](../../../apps/api/src/modules/gesp/gesp.controller.ts#L26)，方法 `createGuidancePlan`。

- 签名：`createGuidancePlan(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.gesp.createGuidancePlan`

### PATCH /api/gesp/guidance-plans/:planId

实现：[apps/api/src/modules/gesp/gesp.controller.ts:27](../../../apps/api/src/modules/gesp/gesp.controller.ts#L27)，方法 `decideGuidancePlan`。

- 签名：`decideGuidancePlan(@Req() req: AuthenticatedRequest, @Param('planId') planId: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.gesp.decideGuidancePlan`

### GET /api/gesp/atoms

实现：[apps/api/src/modules/gesp/gesp.controller.ts:30](../../../apps/api/src/modules/gesp/gesp.controller.ts#L30)，方法 `atoms`。

- 签名：`atoms(@Req() req: AuthenticatedRequest, @Query() query: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.gesp.atoms`

### GET /api/gesp/questions

实现：[apps/api/src/modules/gesp/gesp.controller.ts:31](../../../apps/api/src/modules/gesp/gesp.controller.ts#L31)，方法 `search`。

- 签名：`search(@Req() req: AuthenticatedRequest, @Query() query: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.gesp.search`

### GET /api/gesp/questions/:id

实现：[apps/api/src/modules/gesp/gesp.controller.ts:32](../../../apps/api/src/modules/gesp/gesp.controller.ts#L32)，方法 `detail`。

- 签名：`detail(@Req() req: AuthenticatedRequest, @Param('id') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.gesp.detail`

### GET /api/gesp/documents/:sha256

实现：[apps/api/src/modules/gesp/gesp.controller.ts:33](../../../apps/api/src/modules/gesp/gesp.controller.ts#L33)，方法 `document`。

- 签名：`document(@Req() req: AuthenticatedRequest, @Param('sha256') sha256: string, @Res({ passthrough: true }) response: Response)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.gesp.document`

## ClassroomCodeController — 当前接入

### GET /api/learning/classroom/sessions/:sessionId/code-drafts/:stepId/:blockId

实现：[apps/api/src/modules/learning/classroom-code.controller.ts:9](../../../apps/api/src/modules/learning/classroom-code.controller.ts#L9)，方法 `get`。

- 签名：`get(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Param('stepId') stepId: string, @Param('blockId') blockId: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.code.get`

### PATCH /api/learning/classroom/sessions/:sessionId/code-drafts/:stepId/:blockId

实现：[apps/api/src/modules/learning/classroom-code.controller.ts:12](../../../apps/api/src/modules/learning/classroom-code.controller.ts#L12)，方法 `save`。

- 签名：`save(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Param('stepId') stepId: string, @Param('blockId') blockId: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.code.save`

## ClassroomTurnController — 当前接入

### GET /api/learning/classroom/sessions/:sessionId/turns

实现：[apps/api/src/modules/learning/classroom-turn.controller.ts:9](../../../apps/api/src/modules/learning/classroom-turn.controller.ts#L9)，方法 `list`。

- 签名：`list(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.turns.list`

### GET /api/learning/classroom/sessions/:sessionId/turns/:id

实现：[apps/api/src/modules/learning/classroom-turn.controller.ts:10](../../../apps/api/src/modules/learning/classroom-turn.controller.ts#L10)，方法 `get`。

- 签名：`get(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Param('id') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.turns.get`

### POST /api/learning/classroom/sessions/:sessionId/turns

实现：[apps/api/src/modules/learning/classroom-turn.controller.ts:11](../../../apps/api/src/modules/learning/classroom-turn.controller.ts#L11)，方法 `create`。

- 签名：`create(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.turns.create`

### POST /api/learning/classroom/sessions/:sessionId/turns/:id/cancel

实现：[apps/api/src/modules/learning/classroom-turn.controller.ts:12](../../../apps/api/src/modules/learning/classroom-turn.controller.ts#L12)，方法 `cancel`。

- 签名：`cancel(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Param('id') id: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.turns.control`

### POST /api/learning/classroom/sessions/:sessionId/turns/:id/retry

实现：[apps/api/src/modules/learning/classroom-turn.controller.ts:13](../../../apps/api/src/modules/learning/classroom-turn.controller.ts#L13)，方法 `retry`。

- 签名：`retry(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Param('id') id: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.turns.control`

## ClassroomVisualController — 当前接入

### GET /api/learning/classroom/sessions/:sessionId/visuals

实现：[apps/api/src/modules/learning/classroom-visual.controller.ts:10](../../../apps/api/src/modules/learning/classroom-visual.controller.ts#L10)，方法 `list`。

- 签名：`list(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.visuals.list`

### POST /api/learning/classroom/sessions/:sessionId/visuals

实现：[apps/api/src/modules/learning/classroom-visual.controller.ts:16](../../../apps/api/src/modules/learning/classroom-visual.controller.ts#L16)，方法 `create`。

- 签名：`create(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.visuals.create`

### POST /api/learning/classroom/sessions/:sessionId/visuals/:id/:action

实现：[apps/api/src/modules/learning/classroom-visual.controller.ts:24](../../../apps/api/src/modules/learning/classroom-visual.controller.ts#L24)，方法 `action`。

- 签名：`action(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Param('id') id: string, @Param('action') action: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.visuals.action`

### GET /api/learning/classroom/sessions/:sessionId/visuals/:id/file

实现：[apps/api/src/modules/learning/classroom-visual.controller.ts:37](../../../apps/api/src/modules/learning/classroom-visual.controller.ts#L37)，方法 `file`。

- 签名：`file(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Param('id') id: string, @Res({ passthrough: true }) response: Response)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.visuals.file`

## ClassroomController — 当前接入

### GET /api/learning/classroom/catalog

实现：[apps/api/src/modules/learning/classroom.controller.ts:9](../../../apps/api/src/modules/learning/classroom.controller.ts#L9)，方法 `catalog`。

- 签名：`catalog(@Req() req: AuthenticatedRequest)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.classroom.catalog`

### POST /api/learning/classroom/sessions

实现：[apps/api/src/modules/learning/classroom.controller.ts:10](../../../apps/api/src/modules/learning/classroom.controller.ts#L10)，方法 `open`。

- 签名：`open(@Req() req: AuthenticatedRequest, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.classroom.open`

### GET /api/learning/classroom/sessions/:id

实现：[apps/api/src/modules/learning/classroom.controller.ts:11](../../../apps/api/src/modules/learning/classroom.controller.ts#L11)，方法 `get`。

- 签名：`get(@Req() req: AuthenticatedRequest, @Param('id') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.classroom.get`

### PATCH /api/learning/classroom/sessions/:id

实现：[apps/api/src/modules/learning/classroom.controller.ts:12](../../../apps/api/src/modules/learning/classroom.controller.ts#L12)，方法 `progress`。

- 签名：`progress(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.classroom.progress`

### POST /api/learning/classroom/sessions/:id/presentation

实现：[apps/api/src/modules/learning/classroom.controller.ts:15](../../../apps/api/src/modules/learning/classroom.controller.ts#L15)，方法 `presentation`。

- 签名：`presentation(@Req() req:AuthenticatedRequest, @Param('id') id:string, @Body() input:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.classroom.upgradePresentation`

### POST /api/learning/classroom/sessions/:id/answers

实现：[apps/api/src/modules/learning/classroom.controller.ts:18](../../../apps/api/src/modules/learning/classroom.controller.ts#L18)，方法 `answer`。

- 签名：`answer(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.classroom.answer`

### POST /api/learning/classroom/sessions/:id/hints

实现：[apps/api/src/modules/learning/classroom.controller.ts:21](../../../apps/api/src/modules/learning/classroom.controller.ts#L21)，方法 `hint`。

- 签名：`hint(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.classroom.hint`

### POST /api/learning/classroom/sessions/:id/messages

实现：[apps/api/src/modules/learning/classroom.controller.ts:24](../../../apps/api/src/modules/learning/classroom.controller.ts#L24)，方法 `ask`。

- 签名：`ask(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.classroom.ask`

### POST /api/learning/classroom/sessions/:id/narration/:stepId

实现：[apps/api/src/modules/learning/classroom.controller.ts:31](../../../apps/api/src/modules/learning/classroom.controller.ts#L31)，方法 `narration`。

- 签名：`narration(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('stepId') stepId: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.classroom.narration`

## CourseProjectController — 当前接入

### GET /api/learning/projects/catalog

实现：[apps/api/src/modules/learning/course-project.controller.ts:9](../../../apps/api/src/modules/learning/course-project.controller.ts#L9)，方法 `catalog`。

- 签名：`catalog(@Req() req: AuthenticatedRequest, @Query() query: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.projects.catalog`

### GET /api/learning/projects/:id

实现：[apps/api/src/modules/learning/course-project.controller.ts:10](../../../apps/api/src/modules/learning/course-project.controller.ts#L10)，方法 `get`。

- 签名：`get(@Req() req: AuthenticatedRequest, @Param('id') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.projects.get`

### POST /api/learning/projects

实现：[apps/api/src/modules/learning/course-project.controller.ts:11](../../../apps/api/src/modules/learning/course-project.controller.ts#L11)，方法 `open`。

- 签名：`open(@Req() req: AuthenticatedRequest, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.projects.open`

### PATCH /api/learning/projects/:id

实现：[apps/api/src/modules/learning/course-project.controller.ts:12](../../../apps/api/src/modules/learning/course-project.controller.ts#L12)，方法 `save`。

- 签名：`save(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.projects.save`

### POST /api/learning/projects/:id/submissions

实现：[apps/api/src/modules/learning/course-project.controller.ts:13](../../../apps/api/src/modules/learning/course-project.controller.ts#L13)，方法 `submit`。

- 签名：`submit(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.projects.submit`

### POST /api/learning/projects/:id/reviews

实现：[apps/api/src/modules/learning/course-project.controller.ts:14](../../../apps/api/src/modules/learning/course-project.controller.ts#L14)，方法 `review`。

- 签名：`review(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.projects.review`

### POST /api/learning/projects/:id/legacy

实现：[apps/api/src/modules/learning/course-project.controller.ts:15](../../../apps/api/src/modules/learning/course-project.controller.ts#L15)，方法 `legacy`。

- 签名：`legacy(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.projects.importLegacy`

### POST /api/learning/projects/:id/advice

实现：[apps/api/src/modules/learning/course-project.controller.ts:16](../../../apps/api/src/modules/learning/course-project.controller.ts#L16)，方法 `advice`。

- 签名：`advice(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.projects.advise`

## LearningHomeController — 当前接入

### GET /api/learning/home

实现：[apps/api/src/modules/learning/learning-home.controller.ts:12](../../../apps/api/src/modules/learning/learning-home.controller.ts#L12)，方法 `get`。

- 签名：`get(@Req() req: AuthenticatedRequest, @Query() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.home.home`

## LearningController — 当前接入

### GET /api/learning/students

实现：[apps/api/src/modules/learning/learning.controller.ts:13](../../../apps/api/src/modules/learning/learning.controller.ts#L13)，方法 `students`。

- 签名：`students(@Req() req: AuthenticatedRequest)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.studentProfiles`

### GET /api/learning/students/:id/memory

实现：[apps/api/src/modules/learning/learning.controller.ts:14](../../../apps/api/src/modules/learning/learning.controller.ts#L14)，方法 `memory`。

- 签名：`memory(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query('subject') subject?: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.memory`

### GET /api/learning/overview

实现：[apps/api/src/modules/learning/learning.controller.ts:17](../../../apps/api/src/modules/learning/learning.controller.ts#L17)，方法 `overview`。

- 签名：`overview(@Req() req: AuthenticatedRequest)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.overview`

### GET /api/learning/studio/overview

实现：[apps/api/src/modules/learning/learning.controller.ts:18](../../../apps/api/src/modules/learning/learning.controller.ts#L18)，方法 `studioOverview`。

- 签名：`studioOverview(@Req() req: AuthenticatedRequest, @Query('studentId') studentId?: string, @Query('subject') subject?: string, @Query('materialView') materialView?:string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.studioOverview`

### POST /api/learning/studio/courses/preview

实现：[apps/api/src/modules/learning/learning.controller.ts:22](../../../apps/api/src/modules/learning/learning.controller.ts#L22)，方法 `studioCoursePreview`。

- 签名：`studioCoursePreview(@Req() req: AuthenticatedRequest, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.previewStudioCourse`

### POST /api/learning/studio/courses

实现：[apps/api/src/modules/learning/learning.controller.ts:25](../../../apps/api/src/modules/learning/learning.controller.ts#L25)，方法 `studioCourseCreate`。

- 签名：`studioCourseCreate(@Req() req: AuthenticatedRequest, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.createStudioCourse`

### POST /api/learning/studio/courses/:courseId/lessons/:lessonId/start

实现：[apps/api/src/modules/learning/learning.controller.ts:28](../../../apps/api/src/modules/learning/learning.controller.ts#L28)，方法 `studioLessonStart`。

- 签名：`studioLessonStart(@Req() req: AuthenticatedRequest, @Param('courseId') courseId: string, @Param('lessonId') lessonId: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.startStudioLesson`

### POST /api/learning/studio/whiteboards/preview

实现：[apps/api/src/modules/learning/learning.controller.ts:32](../../../apps/api/src/modules/learning/learning.controller.ts#L32)，方法 `studioWhiteboardPreview`。

- 签名：`studioWhiteboardPreview(@Req() req: AuthenticatedRequest, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.previewStudioWhiteboard`

### POST /api/learning/studio/whiteboards

实现：[apps/api/src/modules/learning/learning.controller.ts:35](../../../apps/api/src/modules/learning/learning.controller.ts#L35)，方法 `studioWhiteboardCreate`。

- 签名：`studioWhiteboardCreate(@Req() req: AuthenticatedRequest, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.createStudioWhiteboard`

### POST /api/learning/studio/materials/pdf

实现：[apps/api/src/modules/learning/learning.controller.ts:38](../../../apps/api/src/modules/learning/learning.controller.ts#L38)，方法 `studioPdfUpload`。

- 签名：`studioPdfUpload(@Req() req: AuthenticatedRequest, @UploadedFile() file: Express.Multer.File | undefined, @Body() input: { studentId?: string; subject?: string; requestKey?: string })`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[{"name":"UseInterceptors","args":["FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } })"]}]`
- 调用：`this.learning.uploadStudioPdf`

### GET /api/learning/studio/materials/:id/pages/:page

实现：[apps/api/src/modules/learning/learning.controller.ts:41](../../../apps/api/src/modules/learning/learning.controller.ts#L41)，方法 `studioPdfPage`。

- 签名：`studioPdfPage(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('page') page: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.studioPdfPageImage`

### GET /api/learning/studio/materials/:id/original

实现：[apps/api/src/modules/learning/learning.controller.ts:43](../../../apps/api/src/modules/learning/learning.controller.ts#L43)，方法 `studioPdfOriginal`。

- 签名：`studioPdfOriginal(@Req() req: AuthenticatedRequest, @Param('id') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.studioPdfOriginal`

### POST /api/learning/studio/materials/:id/structure/review

实现：[apps/api/src/modules/learning/learning.controller.ts:46](../../../apps/api/src/modules/learning/learning.controller.ts#L46)，方法 `studioPdfStructureReview`。

- 签名：`studioPdfStructureReview(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.reviewStudioPdfStructure`

### POST /api/learning/studio/materials/:id/process/retry

实现：[apps/api/src/modules/learning/learning.controller.ts:50](../../../apps/api/src/modules/learning/learning.controller.ts#L50)，方法 `studioPdfProcessRetry`。

- 签名：`studioPdfProcessRetry(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.retryStudioPdfProcessing`

### POST /api/learning/studio/materials/:id/whiteboard/preview

实现：[apps/api/src/modules/learning/learning.controller.ts:54](../../../apps/api/src/modules/learning/learning.controller.ts#L54)，方法 `studioPdfWhiteboardPreview`。

- 签名：`studioPdfWhiteboardPreview(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: { atomId?: string })`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.previewStudioPdfWhiteboard`

### POST /api/learning/studio/materials/:id/whiteboard

实现：[apps/api/src/modules/learning/learning.controller.ts:56](../../../apps/api/src/modules/learning/learning.controller.ts#L56)，方法 `studioPdfWhiteboardCreate`。

- 签名：`studioPdfWhiteboardCreate(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: { atomId?: string; fingerprint: string; requestKey: string })`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.createStudioPdfWhiteboard`

### POST /api/learning/studio/study-packs/preview

实现：[apps/api/src/modules/learning/learning.controller.ts:60](../../../apps/api/src/modules/learning/learning.controller.ts#L60)，方法 `studioLearningPackPreview`。

- 签名：`studioLearningPackPreview(@Req() req: AuthenticatedRequest, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.previewStudioLearningPack`

### POST /api/learning/studio/study-packs

实现：[apps/api/src/modules/learning/learning.controller.ts:63](../../../apps/api/src/modules/learning/learning.controller.ts#L63)，方法 `studioLearningPackCreate`。

- 签名：`studioLearningPackCreate(@Req() req: AuthenticatedRequest, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.createStudioLearningPack`

### POST /api/learning/studio/whiteboards/:id/narration/:sceneId

实现：[apps/api/src/modules/learning/learning.controller.ts:66](../../../apps/api/src/modules/learning/learning.controller.ts#L66)，方法 `studioWhiteboardNarration`。

- 签名：`studioWhiteboardNarration(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('sceneId') sceneId: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.studioWhiteboardNarration`

### POST /api/learning/studio/integrations

实现：[apps/api/src/modules/learning/learning.controller.ts:70](../../../apps/api/src/modules/learning/learning.controller.ts#L70)，方法 `studioIntegrationConnect`。

- 签名：`studioIntegrationConnect(@Req() req: AuthenticatedRequest, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.integrations.connect`

### POST /api/learning/studio/integrations/:id/sync

实现：[apps/api/src/modules/learning/learning.controller.ts:73](../../../apps/api/src/modules/learning/learning.controller.ts#L73)，方法 `studioIntegrationSync`。

- 签名：`studioIntegrationSync(@Req() req: AuthenticatedRequest, @Param('id') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.integrations.sync`

### POST /api/learning/studio/integrations/:id/disconnect

实现：[apps/api/src/modules/learning/learning.controller.ts:76](../../../apps/api/src/modules/learning/learning.controller.ts#L76)，方法 `studioIntegrationDisconnect`。

- 签名：`studioIntegrationDisconnect(@Req() req: AuthenticatedRequest, @Param('id') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.integrations.disconnect`

### POST /api/learning/studio/calendar/events

实现：[apps/api/src/modules/learning/learning.controller.ts:79](../../../apps/api/src/modules/learning/learning.controller.ts#L79)，方法 `studioCalendarEventCreate`。

- 签名：`studioCalendarEventCreate(@Req() req: AuthenticatedRequest, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.integrations.createStudyEvent`

### POST /api/learning/studio/calendar/events/:id/remove

实现：[apps/api/src/modules/learning/learning.controller.ts:82](../../../apps/api/src/modules/learning/learning.controller.ts#L82)，方法 `studioCalendarEventRemove`。

- 签名：`studioCalendarEventRemove(@Req() req: AuthenticatedRequest, @Param('id') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.integrations.removeStudyEvent`

### POST /api/learning/studio/calendar/events/:id/update

实现：[apps/api/src/modules/learning/learning.controller.ts:85](../../../apps/api/src/modules/learning/learning.controller.ts#L85)，方法 `studioCalendarEventUpdate`。

- 签名：`studioCalendarEventUpdate(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.integrations.updateStudyEvent`

### POST /api/learning/studio/calendar/batch-remove

实现：[apps/api/src/modules/learning/learning.controller.ts:88](../../../apps/api/src/modules/learning/learning.controller.ts#L88)，方法 `studioCalendarBatchRemove`。

- 签名：`studioCalendarBatchRemove(@Req() req: AuthenticatedRequest, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.integrations.batchRemoveStudyEvents`

### POST /api/learning/studio/study-plans/preview

实现：[apps/api/src/modules/learning/learning.controller.ts:91](../../../apps/api/src/modules/learning/learning.controller.ts#L91)，方法 `studioStudyPlanPreview`。

- 签名：`studioStudyPlanPreview(@Req() req: AuthenticatedRequest, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.previewStudioStudyPlan`

### POST /api/learning/studio/study-plans

实现：[apps/api/src/modules/learning/learning.controller.ts:94](../../../apps/api/src/modules/learning/learning.controller.ts#L94)，方法 `studioStudyPlanCreate`。

- 签名：`studioStudyPlanCreate(@Req() req: AuthenticatedRequest, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.createStudioStudyPlan`

### POST /api/learning/studio/study-plans/:planId/sessions/:sessionId

实现：[apps/api/src/modules/learning/learning.controller.ts:97](../../../apps/api/src/modules/learning/learning.controller.ts#L97)，方法 `studioStudyPlanSession`。

- 签名：`studioStudyPlanSession(@Req() req: AuthenticatedRequest, @Param('planId') planId: string, @Param('sessionId') sessionId: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.updateStudioPlanSession`

### GET /api/learning/studio/calendar/export

实现：[apps/api/src/modules/learning/learning.controller.ts:101](../../../apps/api/src/modules/learning/learning.controller.ts#L101)，方法 `studioCalendarExport`。

- 签名：`studioCalendarExport(@Req() req: AuthenticatedRequest, @Query('studentId') studentId: string, @Query('subject') subject?: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.integrations.exportCalendar`

### GET /api/learning/students/:id/today

实现：[apps/api/src/modules/learning/learning.controller.ts:105](../../../apps/api/src/modules/learning/learning.controller.ts#L105)，方法 `today`。

- 签名：`today(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query('subject') subject?: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.today`

### GET /api/learning/students/:id/mistakes

实现：[apps/api/src/modules/learning/learning.controller.ts:108](../../../apps/api/src/modules/learning/learning.controller.ts#L108)，方法 `mistakes`。

- 签名：`mistakes(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query('subject') subject?: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.mistakes`

### POST /api/learning/plans/:id/actions/:action/start

实现：[apps/api/src/modules/learning/learning.controller.ts:111](../../../apps/api/src/modules/learning/learning.controller.ts#L111)，方法 `start`。

- 签名：`start(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('action') action: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.start`

### GET /api/learning/practice/:id

实现：[apps/api/src/modules/learning/learning.controller.ts:112](../../../apps/api/src/modules/learning/learning.controller.ts#L112)，方法 `view`。

- 签名：`view(@Req() req: AuthenticatedRequest, @Param('id') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.view`

### GET /api/learning/practice/:id/questions/:question

实现：[apps/api/src/modules/learning/learning.controller.ts:113](../../../apps/api/src/modules/learning/learning.controller.ts#L113)，方法 `render`。

- 签名：`render(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('question') question: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.render`

### POST /api/learning/practice/:id/responses

实现：[apps/api/src/modules/learning/learning.controller.ts:114](../../../apps/api/src/modules/learning/learning.controller.ts#L114)，方法 `submit`。

- 签名：`submit(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.submit`

### PATCH /api/learning/practice/:id/questions/:question/draft

实现：[apps/api/src/modules/learning/learning.controller.ts:115](../../../apps/api/src/modules/learning/learning.controller.ts#L115)，方法 `draft`。

- 签名：`draft(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('question') question: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.draft`

### POST /api/learning/practice/:id/questions/:question/hint

实现：[apps/api/src/modules/learning/learning.controller.ts:116](../../../apps/api/src/modules/learning/learning.controller.ts#L116)，方法 `hint`。

- 签名：`hint(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('question') question: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.hint`

### POST /api/learning/practice/:id/complete

实现：[apps/api/src/modules/learning/learning.controller.ts:117](../../../apps/api/src/modules/learning/learning.controller.ts#L117)，方法 `complete`。

- 签名：`complete(@Req() req: AuthenticatedRequest, @Param('id') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learning.complete`

## NotebookController — 当前接入

### GET /api/learning/students/:studentId/notebook

实现：[apps/api/src/modules/learning/notebook.controller.ts:8](../../../apps/api/src/modules/learning/notebook.controller.ts#L8)，方法 `list`。

- 签名：`list(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Query() query: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.notebook.list`

### GET /api/learning/students/:studentId/notebook/:kind/:responseId

实现：[apps/api/src/modules/learning/notebook.controller.ts:9](../../../apps/api/src/modules/learning/notebook.controller.ts#L9)，方法 `detail`。

- 签名：`detail(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Param('kind') kind: string, @Param('responseId') responseId: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.notebook.detail`

### POST /api/learning/students/:studentId/notebook/:kind/:responseId/organize

实现：[apps/api/src/modules/learning/notebook.controller.ts:10](../../../apps/api/src/modules/learning/notebook.controller.ts#L10)，方法 `organize`。

- 签名：`organize(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Param('kind') kind: string, @Param('responseId') responseId: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.notebook.organize`

### POST /api/learning/students/:studentId/notebook/:kind/:responseId/redo

实现：[apps/api/src/modules/learning/notebook.controller.ts:11](../../../apps/api/src/modules/learning/notebook.controller.ts#L11)，方法 `redo`。

- 签名：`redo(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Param('kind') kind: string, @Param('responseId') responseId: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.notebook.redo`

### POST /api/learning/students/:studentId/notebook/:kind/:responseId/verification

实现：[apps/api/src/modules/learning/notebook.controller.ts:12](../../../apps/api/src/modules/learning/notebook.controller.ts#L12)，方法 `verification`。

- 签名：`verification(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Param('kind') kind: string, @Param('responseId') responseId: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.notebook.verification`

## ProjectFileController — 当前接入

### GET /api/learning/project-files

实现：[apps/api/src/modules/learning/project-file.controller.ts:11](../../../apps/api/src/modules/learning/project-file.controller.ts#L11)，方法 `list`。

- 签名：`list(@Req() req:AuthenticatedRequest, @Query('projectId') projectId:string, @Query('stageId') stageId:string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.files.list`

### POST /api/learning/project-files/uploads

实现：[apps/api/src/modules/learning/project-file.controller.ts:12](../../../apps/api/src/modules/learning/project-file.controller.ts#L12)，方法 `start`。

- 签名：`start(@Req() req:AuthenticatedRequest, @Body() input:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.files.start`

### GET /api/learning/project-files/uploads/:id

实现：[apps/api/src/modules/learning/project-file.controller.ts:13](../../../apps/api/src/modules/learning/project-file.controller.ts#L13)，方法 `upload`。

- 签名：`upload(@Req() req:AuthenticatedRequest, @Param('id') id:string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.files.getUpload`

### PUT /api/learning/project-files/uploads/:id/chunks/:index

实现：[apps/api/src/modules/learning/project-file.controller.ts:14](../../../apps/api/src/modules/learning/project-file.controller.ts#L14)，方法 `chunk`。

- 签名：`chunk(@Req() req:AuthenticatedRequest, @Param('id') id:string, @Param('index') index:string, @Body() input:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.files.chunk`

### POST /api/learning/project-files/uploads/:id/complete

实现：[apps/api/src/modules/learning/project-file.controller.ts:15](../../../apps/api/src/modules/learning/project-file.controller.ts#L15)，方法 `complete`。

- 签名：`complete(@Req() req:AuthenticatedRequest, @Param('id') id:string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.files.complete`

### POST /api/learning/project-files/uploads/:id/cancel

实现：[apps/api/src/modules/learning/project-file.controller.ts:16](../../../apps/api/src/modules/learning/project-file.controller.ts#L16)，方法 `cancelUpload`。

- 签名：`cancelUpload(@Req() req:AuthenticatedRequest, @Param('id') id:string, @Body() input:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.files.cancelUpload`

### GET /api/learning/project-files/assets/:id

实现：[apps/api/src/modules/learning/project-file.controller.ts:17](../../../apps/api/src/modules/learning/project-file.controller.ts#L17)，方法 `asset`。

- 签名：`asset(@Req() req:AuthenticatedRequest, @Param('id') id:string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.files.getAsset`

### GET /api/learning/project-files/assets/:id/integrity

实现：[apps/api/src/modules/learning/project-file.controller.ts:18](../../../apps/api/src/modules/learning/project-file.controller.ts#L18)，方法 `integrity`。

- 签名：`integrity(@Req() req:AuthenticatedRequest, @Param('id') id:string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.files.integrity`

### POST /api/learning/project-files/assets/:id/cancel

实现：[apps/api/src/modules/learning/project-file.controller.ts:19](../../../apps/api/src/modules/learning/project-file.controller.ts#L19)，方法 `cancel`。

- 签名：`cancel(@Req() req:AuthenticatedRequest, @Param('id') id:string, @Body() input:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.files.command`

### POST /api/learning/project-files/assets/:id/retry

实现：[apps/api/src/modules/learning/project-file.controller.ts:20](../../../apps/api/src/modules/learning/project-file.controller.ts#L20)，方法 `retry`。

- 签名：`retry(@Req() req:AuthenticatedRequest, @Param('id') id:string, @Body() input:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.files.command`

### POST /api/learning/project-files/assets/:id/delete

实现：[apps/api/src/modules/learning/project-file.controller.ts:21](../../../apps/api/src/modules/learning/project-file.controller.ts#L21)，方法 `delete`。

- 签名：`delete(@Req() req:AuthenticatedRequest, @Param('id') id:string, @Body() input:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.files.command`

### GET /api/learning/project-files/assets/:id/files/:variant

实现：[apps/api/src/modules/learning/project-file.controller.ts:22](../../../apps/api/src/modules/learning/project-file.controller.ts#L22)，方法 `file`。

- 签名：`file(@Req() req:AuthenticatedRequest, @Param('id') id:string, @Param('variant') variant:string, @Headers('range') range:string|undefined, @Res({passthrough:true}) response:Response)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.files.file`

## RetiredLearningController — 已接入，旧协议返回410

### ALL /api/assessments/*path

实现：[apps/api/src/modules/learning/retired-learning.controller.ts:8](../../../apps/api/src/modules/learning/retired-learning.controller.ts#L8)，方法 `retired`。

- 签名：`retired()`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：无 this 服务调用；直接处理或静态函数。

### ALL /api/missions/*path

实现：[apps/api/src/modules/learning/retired-learning.controller.ts:8](../../../apps/api/src/modules/learning/retired-learning.controller.ts#L8)，方法 `retired`。

- 签名：`retired()`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：无 this 服务调用；直接处理或静态函数。

### ALL /api/plans/weekly

实现：[apps/api/src/modules/learning/retired-learning.controller.ts:8](../../../apps/api/src/modules/learning/retired-learning.controller.ts#L8)，方法 `retired`。

- 签名：`retired()`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：无 this 服务调用；直接处理或静态函数。

### ALL /api/plans/weekly/generate

实现：[apps/api/src/modules/learning/retired-learning.controller.ts:8](../../../apps/api/src/modules/learning/retired-learning.controller.ts#L8)，方法 `retired`。

- 签名：`retired()`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：无 this 服务调用；直接处理或静态函数。

### ALL /api/progress/mastery-heatmap

实现：[apps/api/src/modules/learning/retired-learning.controller.ts:8](../../../apps/api/src/modules/learning/retired-learning.controller.ts#L8)，方法 `retired`。

- 签名：`retired()`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：无 this 服务调用；直接处理或静态函数。

### ALL /api/reports/weekly

实现：[apps/api/src/modules/learning/retired-learning.controller.ts:8](../../../apps/api/src/modules/learning/retired-learning.controller.ts#L8)，方法 `retired`。

- 签名：`retired()`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：无 this 服务调用；直接处理或静态函数。

### ALL /api/parents/:parentId/alerts

实现：[apps/api/src/modules/learning/retired-learning.controller.ts:8](../../../apps/api/src/modules/learning/retired-learning.controller.ts#L8)，方法 `retired`。

- 签名：`retired()`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：无 this 服务调用；直接处理或静态函数。

### ALL /api/students/:studentId/knowledge-map

实现：[apps/api/src/modules/learning/retired-learning.controller.ts:8](../../../apps/api/src/modules/learning/retired-learning.controller.ts#L8)，方法 `retired`。

- 签名：`retired()`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：无 this 服务调用；直接处理或静态函数。

## SourceCourseLifecycleController — 当前接入

### GET /api/learning/source-courses/:id/versions

实现：[apps/api/src/modules/learning/source-course-lifecycle.controller.ts:9](../../../apps/api/src/modules/learning/source-course-lifecycle.controller.ts#L9)，方法 `versions`。

- 签名：`versions(@Req()request:AuthenticatedRequest, @Param('id')id:string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.lifecycle.versions`

### POST /api/learning/source-courses/:id/revisions

实现：[apps/api/src/modules/learning/source-course-lifecycle.controller.ts:10](../../../apps/api/src/modules/learning/source-course-lifecycle.controller.ts#L10)，方法 `revise`。

- 签名：`revise(@Req()request:AuthenticatedRequest, @Param('id')id:string, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.lifecycle.revise`

### POST /api/learning/source-courses/:id/lifecycle/preview

实现：[apps/api/src/modules/learning/source-course-lifecycle.controller.ts:11](../../../apps/api/src/modules/learning/source-course-lifecycle.controller.ts#L11)，方法 `preview`。

- 签名：`preview(@Req()request:AuthenticatedRequest, @Param('id')id:string, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.lifecycle.preview`

### POST /api/learning/source-courses/:id/lifecycle

实现：[apps/api/src/modules/learning/source-course-lifecycle.controller.ts:12](../../../apps/api/src/modules/learning/source-course-lifecycle.controller.ts#L12)，方法 `apply`。

- 签名：`apply(@Req()request:AuthenticatedRequest, @Param('id')id:string, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.lifecycle.apply`

## SourceCourseController — 当前接入

### GET /api/learning/source-courses/materials

实现：[apps/api/src/modules/learning/source-course.controller.ts:12](../../../apps/api/src/modules/learning/source-course.controller.ts#L12)，方法 `materials`。

- 签名：`materials(@Req()req:AuthenticatedRequest, @Query()query:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.courses.materials`

### GET /api/learning/source-courses/materials/:id/progress

实现：[apps/api/src/modules/learning/source-course.controller.ts:13](../../../apps/api/src/modules/learning/source-course.controller.ts#L13)，方法 `materialProgress`。

- 签名：`materialProgress(@Req()req:AuthenticatedRequest, @Param('id')id:string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.uploads.progress`

### GET /api/learning/source-courses/materials/:id/files

实现：[apps/api/src/modules/learning/source-course.controller.ts:14](../../../apps/api/src/modules/learning/source-course.controller.ts#L14)，方法 `materialFiles`。

- 签名：`materialFiles(@Req()req:AuthenticatedRequest, @Param('id')id:string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.integrity.get`

### POST /api/learning/source-courses/materials/:id/files/check

实现：[apps/api/src/modules/learning/source-course.controller.ts:15](../../../apps/api/src/modules/learning/source-course.controller.ts#L15)，方法 `checkMaterialFiles`。

- 签名：`checkMaterialFiles(@Req()req:AuthenticatedRequest, @Param('id')id:string, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.integrity.check`

### GET /api/learning/source-courses/materials/:id

实现：[apps/api/src/modules/learning/source-course.controller.ts:16](../../../apps/api/src/modules/learning/source-course.controller.ts#L16)，方法 `material`。

- 签名：`material(@Req()req:AuthenticatedRequest, @Param('id')id:string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.uploads.material`

### GET /api/learning/source-courses/materials/:id/pages/:page

实现：[apps/api/src/modules/learning/source-course.controller.ts:17](../../../apps/api/src/modules/learning/source-course.controller.ts#L17)，方法 `materialPage`。

- 签名：`materialPage(@Req()req:AuthenticatedRequest, @Param('id')id:string, @Param('page')page:string, @Query()query:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.uploads.page`

### POST /api/learning/source-courses/materials/:id/process/cancel

实现：[apps/api/src/modules/learning/source-course.controller.ts:18](../../../apps/api/src/modules/learning/source-course.controller.ts#L18)，方法 `cancelMaterialProcessing`。

- 签名：`cancelMaterialProcessing(@Req()req:AuthenticatedRequest, @Param('id')id:string, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.uploads.cancelProcessing`

### POST /api/learning/source-courses/materials/text

实现：[apps/api/src/modules/learning/source-course.controller.ts:19](../../../apps/api/src/modules/learning/source-course.controller.ts#L19)，方法 `text`。

- 签名：`text(@Req()req:AuthenticatedRequest, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.courses.addText`

### POST /api/learning/source-courses/materials/text-file

实现：[apps/api/src/modules/learning/source-course.controller.ts:20](../../../apps/api/src/modules/learning/source-course.controller.ts#L20)，方法 `textFile`。

- 签名：`textFile(@Req()req:AuthenticatedRequest, @Body()body:unknown, @UploadedFile()file:Express.Multer.File|undefined)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[{"name":"UseInterceptors","args":["FileInterceptor('file',{storage:memoryStorage(),limits:{fileSize:1024*1024,files:1}})"]}]`
- 调用：`this.courses.addTextFile`

### GET /api/learning/source-courses

实现：[apps/api/src/modules/learning/source-course.controller.ts:22](../../../apps/api/src/modules/learning/source-course.controller.ts#L22)，方法 `list`。

- 签名：`list(@Req()req:AuthenticatedRequest, @Query()query:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.courses.list`

### POST /api/learning/source-courses

实现：[apps/api/src/modules/learning/source-course.controller.ts:23](../../../apps/api/src/modules/learning/source-course.controller.ts#L23)，方法 `create`。

- 签名：`create(@Req()req:AuthenticatedRequest, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.courses.create`

### POST /api/learning/source-courses/preflight

实现：[apps/api/src/modules/learning/source-course.controller.ts:24](../../../apps/api/src/modules/learning/source-course.controller.ts#L24)，方法 `preflight`。

- 签名：`preflight(@Req()req:AuthenticatedRequest, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.courses.preflight`

### GET /api/learning/source-courses/:id/progress

实现：[apps/api/src/modules/learning/source-course.controller.ts:25](../../../apps/api/src/modules/learning/source-course.controller.ts#L25)，方法 `progress`。

- 签名：`progress(@Req()req:AuthenticatedRequest, @Param('id')id:string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.courses.progress`

### GET /api/learning/source-courses/:id/sources/:key

实现：[apps/api/src/modules/learning/source-course.controller.ts:26](../../../apps/api/src/modules/learning/source-course.controller.ts#L26)，方法 `source`。

- 签名：`source(@Req()req:AuthenticatedRequest, @Param('id')id:string, @Param('key')key:string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.courses.source`

### GET /api/learning/source-courses/:id

实现：[apps/api/src/modules/learning/source-course.controller.ts:27](../../../apps/api/src/modules/learning/source-course.controller.ts#L27)，方法 `get`。

- 签名：`get(@Req()req:AuthenticatedRequest, @Param('id')id:string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.courses.get`

### POST /api/learning/source-courses/:id/authoring

实现：[apps/api/src/modules/learning/source-course.controller.ts:28](../../../apps/api/src/modules/learning/source-course.controller.ts#L28)，方法 `authoring`。

- 签名：`authoring(@Req()req:AuthenticatedRequest, @Param('id')id:string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.courses.authoring`

### POST /api/learning/source-courses/:id/lessons/:lessonId/authoring

实现：[apps/api/src/modules/learning/source-course.controller.ts:29](../../../apps/api/src/modules/learning/source-course.controller.ts#L29)，方法 `lessonAuthoring`。

- 签名：`lessonAuthoring(@Req()req:AuthenticatedRequest, @Param('id')id:string, @Param('lessonId')lessonId:string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.courses.lessonAuthoring`

### PATCH /api/learning/source-courses/:id/lessons/:lessonId/content

实现：[apps/api/src/modules/learning/source-course.controller.ts:30](../../../apps/api/src/modules/learning/source-course.controller.ts#L30)，方法 `lessonContent`。

- 签名：`lessonContent(@Req()req:AuthenticatedRequest, @Param('id')id:string, @Param('lessonId')lessonId:string, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.courses.editLesson`

### PATCH /api/learning/source-courses/:id/content

实现：[apps/api/src/modules/learning/source-course.controller.ts:31](../../../apps/api/src/modules/learning/source-course.controller.ts#L31)，方法 `content`。

- 签名：`content(@Req()req:AuthenticatedRequest, @Param('id')id:string, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.courses.editContent`

### PATCH /api/learning/source-courses/:id

实现：[apps/api/src/modules/learning/source-course.controller.ts:32](../../../apps/api/src/modules/learning/source-course.controller.ts#L32)，方法 `edit`。

- 签名：`edit(@Req()req:AuthenticatedRequest, @Param('id')id:string, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.courses.edit`

### POST /api/learning/source-courses/:id/confirm

实现：[apps/api/src/modules/learning/source-course.controller.ts:33](../../../apps/api/src/modules/learning/source-course.controller.ts#L33)，方法 `confirm`。

- 签名：`confirm(@Req()req:AuthenticatedRequest, @Param('id')id:string, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.courses.confirm`

### POST /api/learning/source-courses/:id/cancel

实现：[apps/api/src/modules/learning/source-course.controller.ts:34](../../../apps/api/src/modules/learning/source-course.controller.ts#L34)，方法 `cancel`。

- 签名：`cancel(@Req()req:AuthenticatedRequest, @Param('id')id:string, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.courses.control`

### POST /api/learning/source-courses/:id/retry

实现：[apps/api/src/modules/learning/source-course.controller.ts:35](../../../apps/api/src/modules/learning/source-course.controller.ts#L35)，方法 `retry`。

- 签名：`retry(@Req()req:AuthenticatedRequest, @Param('id')id:string, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.courses.control`

### POST /api/learning/source-courses/:id/archive

实现：[apps/api/src/modules/learning/source-course.controller.ts:36](../../../apps/api/src/modules/learning/source-course.controller.ts#L36)，方法 `archive`。

- 签名：`archive(@Req()req:AuthenticatedRequest, @Param('id')id:string, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.courses.control`

## StudioMaterialUploadController — 当前接入

### GET /api/learning/material-uploads

实现：[apps/api/src/modules/learning/studio-material-upload.controller.ts:8](../../../apps/api/src/modules/learning/studio-material-upload.controller.ts#L8)，方法 `list`。

- 签名：`list(@Req()req:AuthenticatedRequest, @Query()query:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.uploads.list`

### POST /api/learning/material-uploads

实现：[apps/api/src/modules/learning/studio-material-upload.controller.ts:9](../../../apps/api/src/modules/learning/studio-material-upload.controller.ts#L9)，方法 `start`。

- 签名：`start(@Req()req:AuthenticatedRequest, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.uploads.start`

### GET /api/learning/material-uploads/:id

实现：[apps/api/src/modules/learning/studio-material-upload.controller.ts:10](../../../apps/api/src/modules/learning/studio-material-upload.controller.ts#L10)，方法 `get`。

- 签名：`get(@Req()req:AuthenticatedRequest, @Param('id')id:string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.uploads.get`

### PUT /api/learning/material-uploads/:id/chunks/:index

实现：[apps/api/src/modules/learning/studio-material-upload.controller.ts:11](../../../apps/api/src/modules/learning/studio-material-upload.controller.ts#L11)，方法 `chunk`。

- 签名：`chunk(@Req()req:AuthenticatedRequest, @Param('id')id:string, @Param('index')index:string, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.uploads.chunk`

### POST /api/learning/material-uploads/:id/complete

实现：[apps/api/src/modules/learning/studio-material-upload.controller.ts:12](../../../apps/api/src/modules/learning/studio-material-upload.controller.ts#L12)，方法 `complete`。

- 签名：`complete(@Req()req:AuthenticatedRequest, @Param('id')id:string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.uploads.complete`

### POST /api/learning/material-uploads/:id/cancel

实现：[apps/api/src/modules/learning/studio-material-upload.controller.ts:13](../../../apps/api/src/modules/learning/studio-material-upload.controller.ts#L13)，方法 `cancel`。

- 签名：`cancel(@Req()req:AuthenticatedRequest, @Param('id')id:string, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.uploads.cancel`

## StudioOriginalRepairController — 当前接入

### GET /api/learning/source-courses/materials/:materialId/repairs

实现：[apps/api/src/modules/learning/studio-original-repair.controller.ts:8](../../../apps/api/src/modules/learning/studio-original-repair.controller.ts#L8)，方法 `list`。

- 签名：`list(@Req()req:AuthenticatedRequest, @Param('materialId')materialId:string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.repairs.list`

### GET /api/learning/source-courses/materials/:materialId/repairs/:id

实现：[apps/api/src/modules/learning/studio-original-repair.controller.ts:9](../../../apps/api/src/modules/learning/studio-original-repair.controller.ts#L9)，方法 `get`。

- 签名：`get(@Req()req:AuthenticatedRequest, @Param('materialId')materialId:string, @Param('id')id:string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.repairs.get`

### POST /api/learning/source-courses/materials/:materialId/repairs

实现：[apps/api/src/modules/learning/studio-original-repair.controller.ts:10](../../../apps/api/src/modules/learning/studio-original-repair.controller.ts#L10)，方法 `start`。

- 签名：`start(@Req()req:AuthenticatedRequest, @Param('materialId')materialId:string, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.repairs.start`

### POST /api/learning/source-courses/materials/:materialId/repairs/:id/cancel

实现：[apps/api/src/modules/learning/studio-original-repair.controller.ts:11](../../../apps/api/src/modules/learning/studio-original-repair.controller.ts#L11)，方法 `cancel`。

- 签名：`cancel(@Req()req:AuthenticatedRequest, @Param('materialId')materialId:string, @Param('id')id:string, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.repairs.control`

### POST /api/learning/source-courses/materials/:materialId/repairs/:id/retry

实现：[apps/api/src/modules/learning/studio-original-repair.controller.ts:12](../../../apps/api/src/modules/learning/studio-original-repair.controller.ts#L12)，方法 `retry`。

- 签名：`retry(@Req()req:AuthenticatedRequest, @Param('materialId')materialId:string, @Param('id')id:string, @Body()body:unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.repairs.control`

## LibraryController — 当前接入

### GET /api/library/overview

实现：[apps/api/src/modules/library/library.controller.ts:12](../../../apps/api/src/modules/library/library.controller.ts#L12)，方法 `overview`。

- 签名：`overview(@Req() req: AuthenticatedRequest)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.library.overview`

### GET /api/library/facets

实现：[apps/api/src/modules/library/library.controller.ts:13](../../../apps/api/src/modules/library/library.controller.ts#L13)，方法 `facets`。

- 签名：`facets()`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.library.facets`

### GET /api/library/papers

实现：[apps/api/src/modules/library/library.controller.ts:14](../../../apps/api/src/modules/library/library.controller.ts#L14)，方法 `search`。

- 签名：`search(@Req() req: AuthenticatedRequest, @Query() query: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.library.search`

### GET /api/library/papers/:id

实现：[apps/api/src/modules/library/library.controller.ts:15](../../../apps/api/src/modules/library/library.controller.ts#L15)，方法 `preview`。

- 签名：`preview(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query('answers') answers?: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.library.preview`

### POST /api/library/papers/:id/publication

实现：[apps/api/src/modules/library/library.controller.ts:18](../../../apps/api/src/modules/library/library.controller.ts#L18)，方法 `publish`。

- 签名：`publish(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.library.publish`

### PATCH /api/library/papers/:id/bookmark

实现：[apps/api/src/modules/library/library.controller.ts:19](../../../apps/api/src/modules/library/library.controller.ts#L19)，方法 `bookmark`。

- 签名：`bookmark(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.library.bookmark`

### GET /api/library/media

实现：[apps/api/src/modules/library/library.controller.ts:20](../../../apps/api/src/modules/library/library.controller.ts#L20)，方法 `media`。

- 签名：`media(@Req() req: AuthenticatedRequest, @Query('paperId') id: string, @Query('url') url: string, @Headers('range') range: string | undefined, @Res({ passthrough: true }) response: Response)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.library.media`

## MeasurementContentController — 当前接入

### GET /api/measurement-content/candidates

实现：[apps/api/src/modules/library/measurement-content.controller.ts:12](../../../apps/api/src/modules/library/measurement-content.controller.ts#L12)，方法 `list`。

- 签名：`list(@Req() req: AuthenticatedRequest, @Query() query: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.content.list`

### POST /api/measurement-content/candidates

实现：[apps/api/src/modules/library/measurement-content.controller.ts:13](../../../apps/api/src/modules/library/measurement-content.controller.ts#L13)，方法 `stage`。

- 签名：`stage(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.content.stage`

### GET /api/measurement-content/candidates/:id

实现：[apps/api/src/modules/library/measurement-content.controller.ts:14](../../../apps/api/src/modules/library/measurement-content.controller.ts#L14)，方法 `detail`。

- 签名：`detail(@Req() req: AuthenticatedRequest, @Param('id') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.content.detail`

### POST /api/measurement-content/candidates/:id/draft

实现：[apps/api/src/modules/library/measurement-content.controller.ts:15](../../../apps/api/src/modules/library/measurement-content.controller.ts#L15)，方法 `save`。

- 签名：`save(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.content.save`

### POST /api/measurement-content/candidates/:id/reviews

实现：[apps/api/src/modules/library/measurement-content.controller.ts:16](../../../apps/api/src/modules/library/measurement-content.controller.ts#L16)，方法 `review`。

- 签名：`review(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.content.review`

### POST /api/measurement-content/candidates/:id/publish

实现：[apps/api/src/modules/library/measurement-content.controller.ts:17](../../../apps/api/src/modules/library/measurement-content.controller.ts#L17)，方法 `publish`。

- 签名：`publish(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.content.publish`

### POST /api/measurement-content/candidates/:id/withdraw

实现：[apps/api/src/modules/library/measurement-content.controller.ts:18](../../../apps/api/src/modules/library/measurement-content.controller.ts#L18)，方法 `withdraw`。

- 签名：`withdraw(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.content.withdraw`

### GET /api/measurement-content/candidates/:id/media/:index

实现：[apps/api/src/modules/library/measurement-content.controller.ts:19](../../../apps/api/src/modules/library/measurement-content.controller.ts#L19)，方法 `media`。

- 签名：`media(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('index') index: string, @Headers('range') range: string | undefined, @Res({ passthrough: true }) response: Response)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.content.media`

## MissionsController — 历史代码，未被AppModule接入

### GET /api/missions/today

实现：[apps/api/src/modules/missions/missions.controller.ts:10](../../../apps/api/src/modules/missions/missions.controller.ts#L10)，方法 `getTodayMission`。

- 签名：`getTodayMission(@Req() req: AuthenticatedRequest, @Query('studentId') studentId: string, @Query('subject') subject?: 'math' | 'chinese' | 'english')`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.missionsService.getTodayMission`

### POST /api/missions/:missionId/start

实现：[apps/api/src/modules/missions/missions.controller.ts:19](../../../apps/api/src/modules/missions/missions.controller.ts#L19)，方法 `startMission`。

- 签名：`startMission(@Req() req: AuthenticatedRequest, @Param('missionId') missionId: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.missionsService.startMission`

### POST /api/missions/:missionId/answers

实现：[apps/api/src/modules/missions/missions.controller.ts:24](../../../apps/api/src/modules/missions/missions.controller.ts#L24)，方法 `submitAnswer`。

- 签名：`submitAnswer(@Req() req: AuthenticatedRequest, @Param('missionId') missionId: string, @Body() body: { itemId: string; answer: unknown; elapsedMs: number; usedHintLevel?: number; })`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.missionsService.submitAnswer`

### POST /api/missions/:missionId/hints

实现：[apps/api/src/modules/missions/missions.controller.ts:39](../../../apps/api/src/modules/missions/missions.controller.ts#L39)，方法 `requestHint`。

- 签名：`requestHint(@Req() req: AuthenticatedRequest, @Param('missionId') missionId: string, @Body() body: { itemId: string })`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.missionsService.requestHint`

### POST /api/missions/:missionId/complete

实现：[apps/api/src/modules/missions/missions.controller.ts:48](../../../apps/api/src/modules/missions/missions.controller.ts#L48)，方法 `completeMission`。

- 签名：`completeMission(@Req() req: AuthenticatedRequest, @Param('missionId') missionId: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.missionsService.completeMission`

### GET /api/missions/:missionId/result

实现：[apps/api/src/modules/missions/missions.controller.ts:53](../../../apps/api/src/modules/missions/missions.controller.ts#L53)，方法 `getMissionResult`。

- 签名：`getMissionResult(@Req() req: AuthenticatedRequest, @Param('missionId') missionId: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.missionsService.getMissionResult`

## PlansController — 历史代码，未被AppModule接入

### GET /api/plans/weekly

实现：[apps/api/src/modules/plans/plans.controller.ts:10](../../../apps/api/src/modules/plans/plans.controller.ts#L10)，方法 `getWeeklyPlan`。

- 签名：`getWeeklyPlan(@Req() req: AuthenticatedRequest, @Query('studentId') studentId: string, @Query('subject') subject?: 'math' | 'chinese' | 'english', @Query('weekStartDate') weekStartDate?: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.plansService.getWeeklyPlan`

### POST /api/plans/weekly/generate

实现：[apps/api/src/modules/plans/plans.controller.ts:20](../../../apps/api/src/modules/plans/plans.controller.ts#L20)，方法 `generateWeeklyPlan`。

- 签名：`generateWeeklyPlan(@Req() req: AuthenticatedRequest, @Body() body: { studentId: string; subject?: 'math' | 'chinese' | 'english'; weekStartDate?: string; availableMinutesPerDay?: number; })`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.plansService.generateWeeklyPlan`

## PrivacyController — 当前接入

### GET /api/privacy/overview

实现：[apps/api/src/modules/privacy/privacy.controller.ts:10](../../../apps/api/src/modules/privacy/privacy.controller.ts#L10)，方法 `overview`。

- 签名：`overview(@Req() req: AuthenticatedRequest)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.privacy.overview`

### GET /api/privacy/account/deletion-preview

实现：[apps/api/src/modules/privacy/privacy.controller.ts:11](../../../apps/api/src/modules/privacy/privacy.controller.ts#L11)，方法 `accountPreview`。

- 签名：`accountPreview(@Req() req: AuthenticatedRequest)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.privacy.preview`

### GET /api/privacy/students/:id/deletion-preview

实现：[apps/api/src/modules/privacy/privacy.controller.ts:12](../../../apps/api/src/modules/privacy/privacy.controller.ts#L12)，方法 `studentPreview`。

- 签名：`studentPreview(@Req() req: AuthenticatedRequest, @Param('id') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.privacy.preview`

### POST /api/privacy/account/export

实现：[apps/api/src/modules/privacy/privacy.controller.ts:13](../../../apps/api/src/modules/privacy/privacy.controller.ts#L13)，方法 `accountExport`。

- 签名：`accountExport(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.privacy.export`

### POST /api/privacy/students/:id/export

实现：[apps/api/src/modules/privacy/privacy.controller.ts:14](../../../apps/api/src/modules/privacy/privacy.controller.ts#L14)，方法 `studentExport`。

- 签名：`studentExport(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.privacy.export`

### POST /api/privacy/account/export-archive

实现：[apps/api/src/modules/privacy/privacy.controller.ts:15](../../../apps/api/src/modules/privacy/privacy.controller.ts#L15)，方法 `accountArchive`。

- 签名：`accountArchive(@Req() req: AuthenticatedRequest, @Body() body: unknown, @Res({ passthrough: true }) response: Response)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.archive`

### POST /api/privacy/students/:id/export-archive

实现：[apps/api/src/modules/privacy/privacy.controller.ts:16](../../../apps/api/src/modules/privacy/privacy.controller.ts#L16)，方法 `studentArchive`。

- 签名：`studentArchive(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown, @Res({ passthrough: true }) response: Response)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.archive`

### POST /api/privacy/account/prepare-archive

实现：[apps/api/src/modules/privacy/privacy.controller.ts:17](../../../apps/api/src/modules/privacy/privacy.controller.ts#L17)，方法 `prepareAccountArchive`。

- 签名：`prepareAccountArchive(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.privacy.prepareArchive`

### POST /api/privacy/students/:id/prepare-archive

实现：[apps/api/src/modules/privacy/privacy.controller.ts:18](../../../apps/api/src/modules/privacy/privacy.controller.ts#L18)，方法 `prepareStudentArchive`。

- 签名：`prepareStudentArchive(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.privacy.prepareArchive`

### GET /api/privacy/archives/:id

实现：[apps/api/src/modules/privacy/privacy.controller.ts:19](../../../apps/api/src/modules/privacy/privacy.controller.ts#L19)，方法 `downloadArchive`。

- 签名：`downloadArchive(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Res({ passthrough: true }) response: Response)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.archiveResponse`、`this.privacy.downloadArchive`

### POST /api/privacy/students/:id/delete

实现：[apps/api/src/modules/privacy/privacy.controller.ts:22](../../../apps/api/src/modules/privacy/privacy.controller.ts#L22)，方法 `deleteStudent`。

- 签名：`deleteStudent(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.privacy.delete`

### POST /api/privacy/account/delete

实现：[apps/api/src/modules/privacy/privacy.controller.ts:23](../../../apps/api/src/modules/privacy/privacy.controller.ts#L23)，方法 `deleteAccount`。

- 签名：`deleteAccount(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.privacy.delete`

## ImportFilesController — 当前接入

### GET /api/admin/import-files

实现：[apps/api/src/modules/processing/processing.controller.ts:22](../../../apps/api/src/modules/processing/processing.controller.ts#L22)，方法 `list`。

- 签名：`list(@Req() req: AuthenticatedRequest)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.files.list`

### POST /api/admin/import-files

实现：[apps/api/src/modules/processing/processing.controller.ts:23](../../../apps/api/src/modules/processing/processing.controller.ts#L23)，方法 `start`。

- 签名：`start(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.files.start`

### GET /api/admin/import-files/:id

实现：[apps/api/src/modules/processing/processing.controller.ts:24](../../../apps/api/src/modules/processing/processing.controller.ts#L24)，方法 `get`。

- 签名：`get(@Req() req: AuthenticatedRequest, @Param('id') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.files.get`

### PUT /api/admin/import-files/:id/chunks/:index

实现：[apps/api/src/modules/processing/processing.controller.ts:25](../../../apps/api/src/modules/processing/processing.controller.ts#L25)，方法 `chunk`。

- 签名：`chunk(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('index') index: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.files.chunk`

### POST /api/admin/import-files/:id/complete

实现：[apps/api/src/modules/processing/processing.controller.ts:28](../../../apps/api/src/modules/processing/processing.controller.ts#L28)，方法 `complete`。

- 签名：`complete(@Req() req: AuthenticatedRequest, @Param('id') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.files.complete`

### GET /api/admin/import-files/:id/content

实现：[apps/api/src/modules/processing/processing.controller.ts:29](../../../apps/api/src/modules/processing/processing.controller.ts#L29)，方法 `content`。

- 签名：`content(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Headers('range') range: string | undefined, @Res({ passthrough: true }) response: Response)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.files.get`、`this.files.readyPath`

### GET /api/admin/processing/artifacts/:id

实现：[apps/api/src/modules/processing/processing.controller.ts:32](../../../apps/api/src/modules/processing/processing.controller.ts#L32)，方法 `artifact`。

- 签名：`artifact(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Headers('range') range: string | undefined, @Res({ passthrough: true }) response: Response)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.files.artifact`

## ProcessingController — 当前接入

### GET /api/admin/processing/tasks

实现：[apps/api/src/modules/processing/processing.controller.ts:41](../../../apps/api/src/modules/processing/processing.controller.ts#L41)，方法 `list`。

- 签名：`list(@Req() req: AuthenticatedRequest, @Query() input: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.store.tasks.list`

### GET /api/admin/processing/tasks/:id

实现：[apps/api/src/modules/processing/processing.controller.ts:47](../../../apps/api/src/modules/processing/processing.controller.ts#L47)，方法 `get`。

- 签名：`get(@Req() req: AuthenticatedRequest, @Param('id') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.requireTask`

### GET /api/admin/processing/tasks/:id/history

实现：[apps/api/src/modules/processing/processing.controller.ts:48](../../../apps/api/src/modules/processing/processing.controller.ts#L48)，方法 `history`。

- 签名：`history(@Req() req: AuthenticatedRequest, @Param('id') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.requireTask`、`this.store.tasks.history`

### POST /api/admin/processing/tasks/:id/cancel

实现：[apps/api/src/modules/processing/processing.controller.ts:49](../../../apps/api/src/modules/processing/processing.controller.ts#L49)，方法 `cancel`。

- 签名：`cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.requireTask`、`this.store.controlTask`、`this.events.publish`

### POST /api/admin/processing/tasks/:id/retry

实现：[apps/api/src/modules/processing/processing.controller.ts:58](../../../apps/api/src/modules/processing/processing.controller.ts#L58)，方法 `retry`。

- 签名：`retry(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.requireTask`、`this.store.find`、`this.store.controlTask`、`this.events.publish`

### POST /api/admin/processing/handwriting-preview

实现：[apps/api/src/modules/processing/processing.controller.ts:69](../../../apps/api/src/modules/processing/processing.controller.ts#L69)，方法 `handwriting`。

- 签名：`handwriting(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.files.get`、`this.enqueue`

### POST /api/admin/processing/local-explain

实现：[apps/api/src/modules/processing/processing.controller.ts:75](../../../apps/api/src/modules/processing/processing.controller.ts#L75)，方法 `explain`。

- 签名：`explain(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.store.find`、`this.enqueue`

## ProgressController — 当前接入

### GET /api/admin/history/mastery-heatmap

实现：[apps/api/src/modules/progress/progress.controller.ts:10](../../../apps/api/src/modules/progress/progress.controller.ts#L10)，方法 `getMasteryHeatmap`。

- 签名：`getMasteryHeatmap(@Req() req: AuthenticatedRequest, @Query('studentId') studentId: string, @Query('subject') subject?: 'math' | 'chinese' | 'english')`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.progressService.getMasteryHeatmap`

### GET /api/admin/history/students/:studentId/knowledge-map

实现：[apps/api/src/modules/progress/progress.controller.ts:20](../../../apps/api/src/modules/progress/progress.controller.ts#L20)，方法 `getStudentKnowledgeMap`。

- 签名：`getStudentKnowledgeMap(@Req() req: AuthenticatedRequest, @Param('studentId') studentId: string, @Query('subject') subject?: 'math' | 'chinese' | 'english')`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.progressService.getStudentKnowledgeMap`

### GET /api/admin/history/reports/weekly

实现：[apps/api/src/modules/progress/progress.controller.ts:30](../../../apps/api/src/modules/progress/progress.controller.ts#L30)，方法 `getWeeklyReport`。

- 签名：`getWeeklyReport(@Req() req: AuthenticatedRequest, @Query('studentId') studentId: string, @Query('subject') subject?: 'math' | 'chinese' | 'english', @Query('weekStartDate') weekStartDate?: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.progressService.getWeeklyReport`

### GET /api/admin/history/parents/:parentId/alerts

实现：[apps/api/src/modules/progress/progress.controller.ts:41](../../../apps/api/src/modules/progress/progress.controller.ts#L41)，方法 `getParentAlerts`。

- 签名：`getParentAlerts(@Req() req: AuthenticatedRequest, @Param('parentId') parentId: string, @Query('studentId') studentId: string, @Query('subject') subject?: 'math' | 'chinese' | 'english')`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.progressService.getParentAlerts`

### GET /api/admin/analytics/overview

实现：[apps/api/src/modules/progress/progress.controller.ts:55](../../../apps/api/src/modules/progress/progress.controller.ts#L55)，方法 `getAnalyticsOverview`。

- 签名：`getAnalyticsOverview(@Req() req: AuthenticatedRequest)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.progressService.getAnalyticsOverview`

### GET /api/admin/analytics/ai-quality

实现：[apps/api/src/modules/progress/progress.controller.ts:60](../../../apps/api/src/modules/progress/progress.controller.ts#L60)，方法 `getAiQualityOverview`。

- 签名：`getAiQualityOverview(@Req() req: AuthenticatedRequest)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.progressService.getAiQualityOverview`

## QuestionWorkspaceController — 当前接入

### GET /api/admin/question-import-jobs

实现：[apps/api/src/modules/question-workspace/question-workspace.controller.ts:14](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L14)，方法 `listImportJobs`。

- 签名：`listImportJobs(@Req() req: AuthenticatedRequest)`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.questionImportService.listJobs`

### POST /api/admin/question-import-jobs

实现：[apps/api/src/modules/question-workspace/question-workspace.controller.ts:20](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L20)，方法 `createImportJob`。

- 签名：`createImportJob(@Req() req: AuthenticatedRequest, @Body() body: CreateQuestionImportJobCommand)`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.questionImportService.createJob`

### GET /api/admin/question-import-jobs/:jobId

实现：[apps/api/src/modules/question-workspace/question-workspace.controller.ts:30](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L30)，方法 `getImportJob`。

- 签名：`getImportJob(@Req() req: AuthenticatedRequest, @Param('jobId') jobId: string)`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.questionImportService.getJob`

### GET /api/admin/question-import-jobs/:jobId/records

实现：[apps/api/src/modules/question-workspace/question-workspace.controller.ts:36](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L36)，方法 `listImportRecords`。

- 签名：`listImportRecords(@Req() req: AuthenticatedRequest, @Param('jobId') jobId: string)`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.questionImportService.listRecords`

### GET /api/admin/question-import-jobs/:jobId/candidates

实现：[apps/api/src/modules/question-workspace/question-workspace.controller.ts:42](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L42)，方法 `listCandidates`。

- 签名：`listCandidates(@Req() req: AuthenticatedRequest, @Param('jobId') jobId: string, @Query() query: unknown)`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.questionImportService.listCandidates`

### GET /api/admin/question-import-records/:recordId

实现：[apps/api/src/modules/question-workspace/question-workspace.controller.ts:46](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L46)，方法 `getCandidate`。

- 签名：`getCandidate(@Req() req: AuthenticatedRequest, @Param('recordId') id: string)`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.questionImportService.candidate`

### POST /api/admin/question-import-records/:recordId/review

实现：[apps/api/src/modules/question-workspace/question-workspace.controller.ts:50](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L50)，方法 `reviewImportRecord`。

- 签名：`reviewImportRecord(@Req() req: AuthenticatedRequest, @Param('recordId') recordId: string, @Body() body: { decision: 'approved' | 'rejected'; comment?: string | null; knowledgePointIds?: string[]; createDraft?: boolean; expectedVersion?: number; correctedStem?: string; correctedExcerpt?: string; })`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.questionImportService.reviewRecord`

### POST /api/admin/question-import-records/:recordId/ai-structure

实现：[apps/api/src/modules/question-workspace/question-workspace.controller.ts:69](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L69)，方法 `structureImportRecord`。

- 签名：`structureImportRecord(@Req() req: AuthenticatedRequest, @Param('recordId') recordId: string)`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.questionImportService.structureRecordWithAi`

### POST /api/admin/questions/:questionId/document

实现：[apps/api/src/modules/question-workspace/question-workspace.controller.ts:75](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L75)，方法 `upsertDocument`。

- 签名：`upsertDocument(@Req() req: AuthenticatedRequest, @Param('questionId') questionId: string, @Body() body: { locale?: 'zh-CN'; blocks: QuestionBlock[]; attachments?: QuestionAttachment[]; layoutMode?: 'default' | 'reading_split' | 'multi_part' | 'canvas_assist'; accessibilityConfig?: Record<string, unknown>; })`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.questionWorkspaceService.upsertDocument`

### POST /api/admin/questions/:questionId/answer-schema

实现：[apps/api/src/modules/question-workspace/question-workspace.controller.ts:98](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L98)，方法 `upsertAnswerSchema`。

- 签名：`upsertAnswerSchema(@Req() req: AuthenticatedRequest, @Param('questionId') questionId: string, @Body() body: { mode: QuestionAnswerMode; responseShape: Record<string, unknown>; validationRules: Record<string, unknown>; gradingConfig: Record<string, unknown>; options?: Array<{ id: string; label: string; value: string; content?: string | null }>; placeholder?: string | null; })`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.questionWorkspaceService.upsertAnswerSchema`

### POST /api/admin/questions/:questionId/source

实现：[apps/api/src/modules/question-workspace/question-workspace.controller.ts:116](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L116)，方法 `upsertSource`。

- 签名：`upsertSource(@Req() req: AuthenticatedRequest, @Param('questionId') questionId: string, @Body() body: { sourceType: 'internal_authoring' | 'internal_textbook' | 'open_content' | 'public_reference' | 'partner'; sourceName: string; sourcePathOrUrl: string; licenseClass: 'A_INTERNAL' | 'B_OPEN' | 'C_PUBLIC_REFERENCE_ONLY' | 'D_COMMERCIAL_PARTNER'; licenseName: string | null; importJobId: string | null; reviewStatus: 'pending' | 'approved' | 'rejected'; notes: string | null; })`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.questionWorkspaceService.upsertSource`

### GET /api/questions/:questionId/render

实现：[apps/api/src/modules/question-workspace/question-workspace.controller.ts:136](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L136)，方法 `getRenderPayload`。

- 签名：`getRenderPayload(@Req() req: AuthenticatedRequest, @Param('questionId') questionId: string)`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.questionWorkspaceService.buildAuthorizedRenderPayload`

### POST /api/questions/:questionId/answers/validate

实现：[apps/api/src/modules/question-workspace/question-workspace.controller.ts:142](../../../apps/api/src/modules/question-workspace/question-workspace.controller.ts#L142)，方法 `validateAnswer`。

- 签名：`validateAnswer(@Req() req: AuthenticatedRequest, @Param('questionId') questionId: string, @Body() body: { answer: unknown })`
- 控制器装饰器：`[]`
- 方法装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 调用：`this.questionWorkspaceService.buildAuthorizedRenderPayload`、`this.questionWorkspaceService.validateAnswer`

## ReviewsController — 当前接入

### GET /api/admin/reviews

实现：[apps/api/src/modules/reviews/reviews.controller.ts:11](../../../apps/api/src/modules/reviews/reviews.controller.ts#L11)，方法 `queue`。

- 签名：`queue(@Req() req: AuthenticatedRequest, @Query() query: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.reviews.queue`

### GET /api/admin/reviews/:kind/:responseId

实现：[apps/api/src/modules/reviews/reviews.controller.ts:13](../../../apps/api/src/modules/reviews/reviews.controller.ts#L13)，方法 `detail`。

- 签名：`detail(@Req() req: AuthenticatedRequest, @Param('kind') kind: string, @Param('responseId') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.reviews.detail`

### POST /api/admin/reviews/:kind/:responseId

实现：[apps/api/src/modules/reviews/reviews.controller.ts:17](../../../apps/api/src/modules/reviews/reviews.controller.ts#L17)，方法 `review`。

- 签名：`review(@Req() req: AuthenticatedRequest, @Param('kind') kind: string, @Param('responseId') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.reviews.review`

### POST /api/learning/feedback

实现：[apps/api/src/modules/reviews/reviews.controller.ts:21](../../../apps/api/src/modules/reviews/reviews.controller.ts#L21)，方法 `feedback`。

- 签名：`feedback(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.reviews.feedback`

### GET /api/learning/feedback

实现：[apps/api/src/modules/reviews/reviews.controller.ts:23](../../../apps/api/src/modules/reviews/reviews.controller.ts#L23)，方法 `feedbackList`。

- 签名：`feedbackList(@Req() req: AuthenticatedRequest, @Query() query: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.reviews.listFeedback`

### GET /api/admin/evidence-feedback

实现：[apps/api/src/modules/reviews/reviews.controller.ts:25](../../../apps/api/src/modules/reviews/reviews.controller.ts#L25)，方法 `feedbackQueue`。

- 签名：`feedbackQueue(@Req() req: AuthenticatedRequest, @Query() query: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.reviews.listFeedback`

### PATCH /api/admin/evidence-feedback/:feedbackId

实现：[apps/api/src/modules/reviews/reviews.controller.ts:27](../../../apps/api/src/modules/reviews/reviews.controller.ts#L27)，方法 `resolveFeedback`。

- 签名：`resolveFeedback(@Req() req: AuthenticatedRequest, @Param('feedbackId') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.reviews.resolveFeedback`

## StudentMediaController — 当前接入

### GET /api/learning/media/capabilities

实现：[apps/api/src/modules/student-media/student-media.controller.ts:11](../../../apps/api/src/modules/student-media/student-media.controller.ts#L11)，方法 `capabilities`。

- 签名：`capabilities()`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.media.capabilities`

### POST /api/learning/media

实现：[apps/api/src/modules/student-media/student-media.controller.ts:12](../../../apps/api/src/modules/student-media/student-media.controller.ts#L12)，方法 `start`。

- 签名：`start(@Req() req: AuthenticatedRequest, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.media.start`

### GET /api/learning/media/:id

实现：[apps/api/src/modules/student-media/student-media.controller.ts:13](../../../apps/api/src/modules/student-media/student-media.controller.ts#L13)，方法 `get`。

- 签名：`get(@Req() req: AuthenticatedRequest, @Param('id') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.media.get`

### PUT /api/learning/media/:id/chunks/:index

实现：[apps/api/src/modules/student-media/student-media.controller.ts:14](../../../apps/api/src/modules/student-media/student-media.controller.ts#L14)，方法 `chunk`。

- 签名：`chunk(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('index') index: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.media.chunk`

### POST /api/learning/media/:id/complete

实现：[apps/api/src/modules/student-media/student-media.controller.ts:17](../../../apps/api/src/modules/student-media/student-media.controller.ts#L17)，方法 `complete`。

- 签名：`complete(@Req() req: AuthenticatedRequest, @Param('id') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.media.complete`

### POST /api/learning/media/:id/cancel

实现：[apps/api/src/modules/student-media/student-media.controller.ts:18](../../../apps/api/src/modules/student-media/student-media.controller.ts#L18)，方法 `cancel`。

- 签名：`cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.media.cancel`

### GET /api/learning/media/:id/content

实现：[apps/api/src/modules/student-media/student-media.controller.ts:19](../../../apps/api/src/modules/student-media/student-media.controller.ts#L19)，方法 `content`。

- 签名：`content(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Headers('range') range: string | undefined, @Res({ passthrough: true }) response: Response)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.media.content`

## StudentsController — 当前接入

### GET /api/students/:studentId/learning-access

实现：[apps/api/src/modules/students/students.controller.ts:11](../../../apps/api/src/modules/students/students.controller.ts#L11)，方法 `learningIdentity`。

- 签名：`learningIdentity(@Req() req: AuthenticatedRequest, @Param('studentId') id: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learningAccess.get`

### POST /api/students/:studentId/learning-access

实现：[apps/api/src/modules/students/students.controller.ts:13](../../../apps/api/src/modules/students/students.controller.ts#L13)，方法 `updateLearningIdentity`。

- 签名：`updateLearningIdentity(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learningAccess.set`

### POST /api/students/:studentId/learning-access/codes

实现：[apps/api/src/modules/students/students.controller.ts:15](../../../apps/api/src/modules/students/students.controller.ts#L15)，方法 `issueLearningCode`。

- 签名：`issueLearningCode(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learningAccess.issueCode`

### POST /api/students/:studentId/learning-access/sessions/:sessionId/revoke

实现：[apps/api/src/modules/students/students.controller.ts:17](../../../apps/api/src/modules/students/students.controller.ts#L17)，方法 `revokeLearningSession`。

- 签名：`revokeLearningSession(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Param('sessionId') sessionId: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.learningAccess.revokeSession`

### POST /api/students

实现：[apps/api/src/modules/students/students.controller.ts:20](../../../apps/api/src/modules/students/students.controller.ts#L20)，方法 `createStudent`。

- 签名：`createStudent(@Req() req: AuthenticatedRequest, @Body() body: { nickname: string; grade: number; preferredSessionMinutes: number; defaultVersionMap: { chinese: string; math: string; english: string; }; })`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.studentsService.createStudent`

### GET /api/students/:studentId/profile

实现：[apps/api/src/modules/students/students.controller.ts:38](../../../apps/api/src/modules/students/students.controller.ts#L38)，方法 `getProfile`。

- 签名：`getProfile(@Req() req: AuthenticatedRequest, @Param('studentId') studentId: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.studentsService.getProfile`

### POST /api/parents/:parentId/bindings

实现：[apps/api/src/modules/students/students.controller.ts:43](../../../apps/api/src/modules/students/students.controller.ts#L43)，方法 `bindStudent`。

- 签名：`bindStudent(@Req() req: AuthenticatedRequest, @Param('parentId') parentId: string, @Body() body: { studentId: string; inviteToken?: string })`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.studentsService.bindStudent`

### POST /api/students/:studentId/invitations

实现：[apps/api/src/modules/students/students.controller.ts:56](../../../apps/api/src/modules/students/students.controller.ts#L56)，方法 `createInvitation`。

- 签名：`createInvitation(@Req() req: AuthenticatedRequest, @Param('studentId') studentId: string, @Body() body: { recipientPrincipal: string })`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.studentsService.createInvitation`

### GET /api/parents/:parentId/students

实现：[apps/api/src/modules/students/students.controller.ts:62](../../../apps/api/src/modules/students/students.controller.ts#L62)，方法 `listChildren`。

- 签名：`listChildren(@Req() req: AuthenticatedRequest, @Param('parentId') parentId: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.studentsService.listChildren`

### GET /api/students/:studentId/reviewers

实现：[apps/api/src/modules/students/students.controller.ts:71](../../../apps/api/src/modules/students/students.controller.ts#L71)，方法 `reviewers`。

- 签名：`reviewers(@Req() req: AuthenticatedRequest, @Param('studentId') studentId: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.studentsService.reviewerAssignments`

### POST /api/students/:studentId/reviewers

实现：[apps/api/src/modules/students/students.controller.ts:76](../../../apps/api/src/modules/students/students.controller.ts#L76)，方法 `grantReviewer`。

- 签名：`grantReviewer(@Req() req: AuthenticatedRequest, @Param('studentId') studentId: string, @Body() body: unknown)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.studentsService.grantReviewer`

### POST /api/students/:studentId/reviewers/:assignmentId/revoke

实现：[apps/api/src/modules/students/students.controller.ts:81](../../../apps/api/src/modules/students/students.controller.ts#L81)，方法 `revokeReviewer`。

- 签名：`revokeReviewer(@Req() req: AuthenticatedRequest, @Param('studentId') studentId: string, @Param('assignmentId') assignmentId: string)`
- 控制器装饰器：`[{"name":"UseGuards","args":["AuthGuard"]}]`
- 方法装饰器：`[]`
- 调用：`this.studentsService.revokeReviewer`

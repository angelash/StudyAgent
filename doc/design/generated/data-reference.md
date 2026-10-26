# 领域集合与契约索引

源码基线：`8284cd6247c9d925e12b65a8321e1280d713e096`。这些是领域文档集合，并不代表每个集合对应一张独立 SQL 表。

## 领域集合

- `users` → `InMemoryUserAccount`；[apps/api/src/infrastructure/in-memory-store.service.ts:357](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L357)。
- `paperPublications` → `PaperPublication`；[apps/api/src/infrastructure/in-memory-store.service.ts:358](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L358)。
- `libraryBookmarks` → `LibraryBookmark`；[apps/api/src/infrastructure/in-memory-store.service.ts:359](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L359)。
- `practiceSessions` → `PracticeSession`；[apps/api/src/infrastructure/in-memory-store.service.ts:360](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L360)。
- `practiceAttempts` → `PracticeAttempt`；[apps/api/src/infrastructure/in-memory-store.service.ts:361](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L361)。
- `practiceHints` → `PracticeHint`；[apps/api/src/infrastructure/in-memory-store.service.ts:362](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L362)。
- `practiceScoringRevisions` → `ScoringRevision`；[apps/api/src/infrastructure/in-memory-store.service.ts:363](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L363)。
- `teacherAssignments` → `TeacherStudentAssignment`；[apps/api/src/infrastructure/in-memory-store.service.ts:364](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L364)。
- `evidenceFeedback` → `EvidenceFeedback`；[apps/api/src/infrastructure/in-memory-store.service.ts:365](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L365)。
- `importFiles` → `ImportFile`；[apps/api/src/infrastructure/in-memory-store.service.ts:366](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L366)。
- `processingArtifacts` → `ProcessingArtifact`；[apps/api/src/infrastructure/in-memory-store.service.ts:367](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L367)。
- `importPages` → `ImportPageEvidenceRef`；[apps/api/src/infrastructure/in-memory-store.service.ts:368](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L368)。
- `guidancePlanRevisions` → `GuidancePlanRevision`；[apps/api/src/infrastructure/in-memory-store.service.ts:369](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L369)。
- `studentLearningAccess` → `StudentLearningAccess`；[apps/api/src/infrastructure/in-memory-store.service.ts:370](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L370)。
- `studentLearningCodes` → `StudentLearningCode`；[apps/api/src/infrastructure/in-memory-store.service.ts:371](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L371)。
- `studentAccessRevisions` → `StudentAccessRevision`；[apps/api/src/infrastructure/in-memory-store.service.ts:372](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L372)。
- `studentProgressProposals` → `StudentProgressProposal`；[apps/api/src/infrastructure/in-memory-store.service.ts:373](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L373)。
- `privacyRequests` → `PrivacyReceipt`；[apps/api/src/infrastructure/in-memory-store.service.ts:374](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L374)。
- `studentMedia` → `StudentMedia`；[apps/api/src/infrastructure/in-memory-store.service.ts:375](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L375)。
- `sessions` → `InMemoryAuthSession`；[apps/api/src/infrastructure/in-memory-store.service.ts:376](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L376)。
- `students` → `StudentProfile`；[apps/api/src/infrastructure/in-memory-store.service.ts:377](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L377)。
- `bindings` → `ParentStudentBinding`；[apps/api/src/infrastructure/in-memory-store.service.ts:378](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L378)。
- `studentInvitations` → `StudentInvitation`；[apps/api/src/infrastructure/in-memory-store.service.ts:379](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L379)。
- `subjectEnrollments` → `SubjectEnrollment`；[apps/api/src/infrastructure/in-memory-store.service.ts:380](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L380)。
- `textbookVolumes` → `TextbookVolume`；[apps/api/src/infrastructure/in-memory-store.service.ts:381](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L381)。
- `textbookUnits` → `TextbookUnit`；[apps/api/src/infrastructure/in-memory-store.service.ts:382](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L382)。
- `textbookLessons` → `TextbookLesson`；[apps/api/src/infrastructure/in-memory-store.service.ts:383](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L383)。
- `knowledgePoints` → `KnowledgePoint`；[apps/api/src/infrastructure/in-memory-store.service.ts:384](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L384)。
- `questions` → `Question`；[apps/api/src/infrastructure/in-memory-store.service.ts:385](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L385)。
- `questionDocuments` → `QuestionDocument`；[apps/api/src/infrastructure/in-memory-store.service.ts:386](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L386)。
- `questionAnswerSchemas` → `QuestionAnswerSchema`；[apps/api/src/infrastructure/in-memory-store.service.ts:387](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L387)。
- `questionSources` → `QuestionSourceRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:388](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L388)。
- `questionImportJobs` → `QuestionImportJob`；[apps/api/src/infrastructure/in-memory-store.service.ts:389](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L389)。
- `questionImportRecords` → `QuestionImportRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:390](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L390)。
- `assessments` → `AssessmentSession`；[apps/api/src/infrastructure/in-memory-store.service.ts:391](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L391)。
- `assessmentAnswers` → `AssessmentAnswerRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:392](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L392)。
- `assessmentResults` → `AssessmentResult`；[apps/api/src/infrastructure/in-memory-store.service.ts:393](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L393)。
- `studyPlans` → `StudyPlan`；[apps/api/src/infrastructure/in-memory-store.service.ts:394](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L394)。
- `missions` → `DailyMissionInternal`；[apps/api/src/infrastructure/in-memory-store.service.ts:395](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L395)。
- `missionAnswers` → `MissionAnswerRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:396](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L396)。
- `assistantSessions` → `AssistantSession & { ownerUserId: string; scopeKey?: string }`；[apps/api/src/infrastructure/in-memory-store.service.ts:397](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L397)。
- `assistantMessages` → `AssistantMessage`；[apps/api/src/infrastructure/in-memory-store.service.ts:398](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L398)。
- `assistantTurns` → `AssistantTurnRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:399](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L399)。
- `guidanceModelSuggestions` → `GuidanceModelSuggestionRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:400](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L400)。
- `aiInsights` → `AIInsightRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:401](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L401)。
- `events` → `Record<string, unknown>`；[apps/api/src/infrastructure/in-memory-store.service.ts:402](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L402)。
- `knowledgeAtoms` → `KnowledgeAtom`；[apps/api/src/infrastructure/in-memory-store.service.ts:403](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L403)。
- `learningScopes` → `LearningScope`；[apps/api/src/infrastructure/in-memory-store.service.ts:404](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L404)。
- `measurementItems` → `MeasurementItem`；[apps/api/src/infrastructure/in-memory-store.service.ts:405](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L405)。
- `measurementCandidates` → `MeasurementContentCandidate`；[apps/api/src/infrastructure/in-memory-store.service.ts:406](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L406)。
- `mistakeNotebookEntries` → `MistakeNotebookEntry`；[apps/api/src/infrastructure/in-memory-store.service.ts:407](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L407)。
- `textbookAtomMappings` → `TextbookAtomMapping`；[apps/api/src/infrastructure/in-memory-store.service.ts:408](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L408)。
- `curriculumRevisions` → `CurriculumRevision`；[apps/api/src/infrastructure/in-memory-store.service.ts:409](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L409)。
- `diagnosticSessions` → `DiagnosticSession`；[apps/api/src/infrastructure/in-memory-store.service.ts:410](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L410)。
- `diagnosticBlueprints` → `DiagnosticBlueprintReservation`；[apps/api/src/infrastructure/in-memory-store.service.ts:411](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L411)。
- `diagnosticResponses` → `DiagnosticResponse`；[apps/api/src/infrastructure/in-memory-store.service.ts:412](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L412)。
- `diagnosticHypotheses` → `DiagnosticHypothesis`；[apps/api/src/infrastructure/in-memory-store.service.ts:413](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L413)。
- `diagnosticPlans` → `DiagnosticGuidancePlan`；[apps/api/src/infrastructure/in-memory-store.service.ts:414](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L414)。
- `reviewTasks` → `ReviewTask`；[apps/api/src/infrastructure/in-memory-store.service.ts:415](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L415)。
- `scoringRevisions` → `ScoringRevision`；[apps/api/src/infrastructure/in-memory-store.service.ts:416](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L416)。
- `diagnosticHints` → `{ id: string; sessionId: string; itemId: string; level: number; at: string }`；[apps/api/src/infrastructure/in-memory-store.service.ts:417](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L417)。
- `diagnosticReports` → `{ id: string; sessionId: string; version: number; createdAt: string; report: DiagnosticReport; reanalysis?: { actorId: string; requestKey: string; inputHash: string } }`；[apps/api/src/infrastructure/in-memory-store.service.ts:418](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L418)。
- `diagnosticDrafts` → `{ id: string; sessionId: string; itemId: string; answer: unknown; updatedAt: string } & AnswerDraftMetadata`；[apps/api/src/infrastructure/in-memory-store.service.ts:420](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L420)。
- `gespLearningScopes` → `GespLearningScope`；[apps/api/src/infrastructure/in-memory-store.service.ts:421](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L421)。
- `gespLearningScopeRevisions` → `GespLearningScopeRevision`；[apps/api/src/infrastructure/in-memory-store.service.ts:422](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L422)。
- `gespCodeSubmissions` → `GespCodeSubmissionReceipt`；[apps/api/src/infrastructure/in-memory-store.service.ts:423](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L423)。
- `gespProbeSubmissions` → `GespProbeSubmissionReceipt`；[apps/api/src/infrastructure/in-memory-store.service.ts:424](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L424)。
- `gespHintEvents` → `GespHintEvent`；[apps/api/src/infrastructure/in-memory-store.service.ts:425](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L425)。
- `gespGuidancePlans` → `GespGuidancePlan`；[apps/api/src/infrastructure/in-memory-store.service.ts:426](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L426)。
- `gespGuidancePlanRevisions` → `GespGuidancePlanRevision`；[apps/api/src/infrastructure/in-memory-store.service.ts:427](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L427)。
- `gespReviewTasks` → `GespReviewTask`；[apps/api/src/infrastructure/in-memory-store.service.ts:428](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L428)。
- `gespTaskReviews` → `GespTaskReview`；[apps/api/src/infrastructure/in-memory-store.service.ts:429](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L429)。
- `gespTaskReviewRevisions` → `GespTaskReviewRevision`；[apps/api/src/infrastructure/in-memory-store.service.ts:430](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L430)。
- `studioCourses` → `StudioCourse`；[apps/api/src/infrastructure/in-memory-store.service.ts:431](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L431)。
- `classroomSessions` → `ClassroomSessionRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:432](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L432)。
- `classroomTurns` → `ClassroomTurnRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:433](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L433)。
- `classroomCodeDrafts` → `ClassroomCodeDraftRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:434](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L434)。
- `classroomVisuals` → `ClassroomVisualRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:435](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L435)。
- `courseProjects` → `CourseProjectRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:436](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L436)。
- `projectAssetUploads` → `ProjectUploadRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:437](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L437)。
- `projectAssets` → `ProjectAssetRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:438](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L438)。
- `sourceCourses` → `SourceCourseRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:439](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L439)。
- `sourceCourseChecks` → `SourceCourseCheckRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:440](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L440)。
- `sourceCourseCheckPublications` → `SourceCourseCheckPublication`；[apps/api/src/infrastructure/in-memory-store.service.ts:441](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L441)。
- `studioTopicWhiteboardDrafts` → `TopicWhiteboardDraftRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:442](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L442)。
- `studioTopicWhiteboards` → `TopicWhiteboardRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:443](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L443)。
- `studioTopicWhiteboardVisuals` → `TopicVisualRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:444](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L444)。
- `sourceCourseStages` → `SourceCourseStageRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:445](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L445)。
- `studioActivities` → `StudioActivity`；[apps/api/src/infrastructure/in-memory-store.service.ts:446](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L446)。
- `studioStudyPlans` → `StudioStudyPlan`；[apps/api/src/infrastructure/in-memory-store.service.ts:447](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L447)。
- `studioSourceMaterials` → `StudioSourceMaterial`；[apps/api/src/infrastructure/in-memory-store.service.ts:448](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L448)。
- `studioMaterialUploads` → `StudioMaterialUploadRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:449](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L449)。
- `studioMaterialAssets` → `StudioMaterialAssetRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:450](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L450)。
- `studioOriginalRepairs` → `StudioOriginalRepairRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:451](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L451)。
- `studioLearningPacks` → `StudioLearningPack`；[apps/api/src/infrastructure/in-memory-store.service.ts:452](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L452)。
- `studioWhiteboards` → `StudioWhiteboard`；[apps/api/src/infrastructure/in-memory-store.service.ts:453](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L453)。
- `studioConnectors` → `StudioConnector & { encryptedFeedUrl: string; requestKey?: string; requestHash?: string; createdBy?: string }`；[apps/api/src/infrastructure/in-memory-store.service.ts:454](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L454)。
- `studioScheduleEvents` → `StudioScheduleEvent & { createdBy?: string; requestHash?: string }`；[apps/api/src/infrastructure/in-memory-store.service.ts:455](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L455)。

## 共享数据契约

### packages/contracts/src/ai-models.ts

- `XiaojiuModelOption`：[packages/contracts/src/ai-models.ts:1](../../../packages/contracts/src/ai-models.ts#L1)；字段：`id`、`label`、`catalogLabel`、`description`、`provider`、`providerKey`、`primary`、`default`、`inputModalities`。
- `XiaojiuModelCatalog`：[packages/contracts/src/ai-models.ts:13](../../../packages/contracts/src/ai-models.ts#L13)；字段：`defaultModel`、`models`。

### packages/contracts/src/answer-draft.ts

- `AnswerDraftSave`：[packages/contracts/src/answer-draft.ts:14](../../../packages/contracts/src/answer-draft.ts#L14)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `AnswerDraftFence`：[packages/contracts/src/answer-draft.ts:15](../../../packages/contracts/src/answer-draft.ts#L15)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `AnswerDraftMetadata`：[packages/contracts/src/answer-draft.ts:17](../../../packages/contracts/src/answer-draft.ts#L17)；字段：`revision?`、`protocol?`、`draftAttempt?`、`draftCommands?`。
- `AnswerDraftState`：[packages/contracts/src/answer-draft.ts:21](../../../packages/contracts/src/answer-draft.ts#L21)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `AnswerDraftReceipt`：[packages/contracts/src/answer-draft.ts:24](../../../packages/contracts/src/answer-draft.ts#L24)；字段：`saved`、`updatedAt`、`savedAt`、`acknowledgedRevision`、`currentRevision`、`draftState`。

### packages/contracts/src/answer-protocol.ts

- `InteractionChoice`：[packages/contracts/src/answer-protocol.ts:4](../../../packages/contracts/src/answer-protocol.ts#L4)；字段：`id`、`label`。
- `HotspotTarget`：[packages/contracts/src/answer-protocol.ts:5](../../../packages/contracts/src/answer-protocol.ts#L5)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `DrawingPoint`：[packages/contracts/src/answer-protocol.ts:6](../../../packages/contracts/src/answer-protocol.ts#L6)；字段：`x`、`y`。
- `DrawingStroke`：[packages/contracts/src/answer-protocol.ts:7](../../../packages/contracts/src/answer-protocol.ts#L7)；字段：`points`。
- `InputConfiguration`：[packages/contracts/src/answer-protocol.ts:8](../../../packages/contracts/src/answer-protocol.ts#L8)；字段：`supported`、`reason`、`mode`、`items`、`groups`、`left`、`right`、`rows`、`columns`、`targets`、`imageUrl`、`imageAlt`。

### packages/contracts/src/assistant-turn.ts

- `AssistantReplySource`：[packages/contracts/src/assistant-turn.ts:1](../../../packages/contracts/src/assistant-turn.ts#L1)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `AssistantReply`：[packages/contracts/src/assistant-turn.ts:2](../../../packages/contracts/src/assistant-turn.ts#L2)；字段：`reply`、`source`、`evidenceIds`、`modelId`、`modelName`。
- `AssistantHistoryMessage`：[packages/contracts/src/assistant-turn.ts:3](../../../packages/contracts/src/assistant-turn.ts#L3)；字段：`id`、`sessionId`、`sender`、`content`、`createdAt`、`sequence?`、`source?`、`modelId?`、`modelName?`、`evidenceIds?`、`assistanceRecorded?`、`inReplyTo?`。
- `AssistantLocation`：[packages/contracts/src/assistant-turn.ts:5](../../../packages/contracts/src/assistant-turn.ts#L5)；字段：`sessionId`、`pageContext`、`studentId`、`subject`、`contextRefType`、`contextRefId`、`contextItemId`、`href`。
- `AssistantContextView`：[packages/contracts/src/assistant-turn.ts:7](../../../packages/contracts/src/assistant-turn.ts#L7)；字段：`contextVersion`、`location`。
- `AssistantTurnCommand`：[packages/contracts/src/assistant-turn.ts:8](../../../packages/contracts/src/assistant-turn.ts#L8)；字段：`requestKey`、`message`、`modelId`、`contextVersion`。
- `AssistantTurnView`：[packages/contracts/src/assistant-turn.ts:9](../../../packages/contracts/src/assistant-turn.ts#L9)；字段：`id`、`sessionId`、`requestKey`、`message`、`requestedModelId`、`modelId`、`modelName`、`source`、`contextVersion`、`location`、`status`、`revision`、`createdAt`、`updatedAt`、`userMessageId?`、`assistantMessageId?`、`task`。
- `AssistantHistoryPage`：[packages/contracts/src/assistant-turn.ts:14](../../../packages/contracts/src/assistant-turn.ts#L14)；字段：`messages`、`nextCursor`、`location`。
- `AssistantTurnList`：[packages/contracts/src/assistant-turn.ts:15](../../../packages/contracts/src/assistant-turn.ts#L15)；字段：`turns`、`hasMore`、`page`、`pageSize`。
- `AssistantHistorySearch`：[packages/contracts/src/assistant-turn.ts:16](../../../packages/contracts/src/assistant-turn.ts#L16)；字段：`sessions`、`total`、`page`、`pageSize`。

### packages/contracts/src/classroom-board.ts

- `ClassroomBoardTable`：[packages/contracts/src/classroom-board.ts:4](../../../packages/contracts/src/classroom-board.ts#L4)；字段：`title`、`headers`、`rows`。
- `ClassroomBoardFormula`：[packages/contracts/src/classroom-board.ts:5](../../../packages/contracts/src/classroom-board.ts#L5)；字段：`label`、`latex`、`meaning`。
- `ClassroomBoardReveal`：[packages/contracts/src/classroom-board.ts:6](../../../packages/contracts/src/classroom-board.ts#L6)；字段：`version`、`sourceSha256`、`pointUnitIds`、`tableRowUnitIds`、`formulaUnitIds`。
- `ClassroomReplyBoard`：[packages/contracts/src/classroom-board.ts:8](../../../packages/contracts/src/classroom-board.ts#L8)；字段：`title`、`points`、`diagram?`、`table?`、`formulas?`、`reveal?`。
- `ClassroomBoardProgress`：[packages/contracts/src/classroom-board.ts:10](../../../packages/contracts/src/classroom-board.ts#L10)；字段：`mode`、`points`、`tableRows`、`formulas`。

### packages/contracts/src/classroom-code.ts

- `ClassroomCodeDraftView`：[packages/contracts/src/classroom-code.ts:1](../../../packages/contracts/src/classroom-code.ts#L1)；字段：`sessionId`、`stepId`、`blockId`、`baseHash`、`code`、`input`、`revision`、`updatedAt`。
- `ClassroomCodeDraftCommand`：[packages/contracts/src/classroom-code.ts:3](../../../packages/contracts/src/classroom-code.ts#L3)；字段：`expectedRevision`、`requestKey`、`baseHash`、`code`、`input`。

### packages/contracts/src/classroom-speech.ts

- `ClassroomSpeechVersion`：[packages/contracts/src/classroom-speech.ts:4](../../../packages/contracts/src/classroom-speech.ts#L4)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `ClassroomSpeechSpan`：[packages/contracts/src/classroom-speech.ts:5](../../../packages/contracts/src/classroom-speech.ts#L5)；字段：`text`、`start`、`end`。
- `ClassroomSpeechUnit`：[packages/contracts/src/classroom-speech.ts:6](../../../packages/contracts/src/classroom-speech.ts#L6)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `ClassroomSpeechTrack`：[packages/contracts/src/classroom-speech.ts:7](../../../packages/contracts/src/classroom-speech.ts#L7)；字段：`version`、`sourceSha256`、`units`。
- `ClassroomPresentation`：[packages/contracts/src/classroom-speech.ts:12](../../../packages/contracts/src/classroom-speech.ts#L12)；字段：`version`、`createdAt`、`tracks`。
- `ClassroomPresentationRevision`：[packages/contracts/src/classroom-speech.ts:17](../../../packages/contracts/src/classroom-speech.ts#L17)；字段：`id`、`at`、`stepId`、`fromCursor`、`toCursor`、`fromVersion`、`toVersion`、`previous`。
- `Range`：[packages/contracts/src/classroom-speech.ts:25](../../../packages/contracts/src/classroom-speech.ts#L25)；字段：`start`、`end`。

### packages/contracts/src/classroom-turn.ts

- `ClassroomTurnIntent`：[packages/contracts/src/classroom-turn.ts:8](../../../packages/contracts/src/classroom-turn.ts#L8)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `ClassroomTurnPosition`：[packages/contracts/src/classroom-turn.ts:9](../../../packages/contracts/src/classroom-turn.ts#L9)；字段：`contentFingerprint`、`stepId`、`sentenceCursor`、`presentationVersion`、`unitId`。
- `ClassroomTurnCommand`：[packages/contracts/src/classroom-turn.ts:11](../../../packages/contracts/src/classroom-turn.ts#L11)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `ClassroomTurnView`：[packages/contracts/src/classroom-turn.ts:13](../../../packages/contracts/src/classroom-turn.ts#L13)；字段：`id`、`sessionId`、`requestKey`、`message`、`intent`、`modelId`、`modelName`、`questionId?`、`position`、`status`、`revision`、`createdAt`、`updatedAt`、`userMessageId?`、`assistantMessageId?`、`task`。

### packages/contracts/src/classroom-visual.ts

- `ClassroomVisualPurpose`：[packages/contracts/src/classroom-visual.ts:1](../../../packages/contracts/src/classroom-visual.ts#L1)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `ClassroomVisualFile`：[packages/contracts/src/classroom-visual.ts:2](../../../packages/contracts/src/classroom-visual.ts#L2)；字段：`name`、`sha256`、`size`。
- `ClassroomVisualRecord`：[packages/contracts/src/classroom-visual.ts:7](../../../packages/contracts/src/classroom-visual.ts#L7)；字段：`id`、`ownerUserId`、`studentId`、`sessionId`、`stepId`、`stepTitle`、`stepFingerprint`、`requestKey`、`inputHash`、`purpose`、`requirements`、`prompt`、`promptVersion`、`modelId`、`taskId`、`revision`、`status`、`selectionKey`、`createdAt`、`updatedAt`、`files`、`width`、`height`、`requests`。
- `ClassroomVisualView`：[packages/contracts/src/classroom-visual.ts:40](../../../packages/contracts/src/classroom-visual.ts#L40)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `ClassroomVisualCapabilities`：[packages/contracts/src/classroom-visual.ts:53](../../../packages/contracts/src/classroom-visual.ts#L53)；字段：`available`、`modelId`、`reason`、`message`。

### packages/contracts/src/classroom.ts

- `ClassroomDiagram`：[packages/contracts/src/classroom.ts:6](../../../packages/contracts/src/classroom.ts#L6)；字段：`kind`、`title`、`labels`、`values?`、`captions?`。
- `ClassroomBlock`：[packages/contracts/src/classroom.ts:7](../../../packages/contracts/src/classroom.ts#L7)；字段：`id`、`kind`、`text`、`atSentence?`、`items?`、`image?`、`diagram?`、`code?`、`table?`。
- `ClassroomStep`：[packages/contracts/src/classroom.ts:10](../../../packages/contracts/src/classroom.ts#L10)；字段：`id`、`title`、`narration`、`blocks`、`phase`、`durationMs`。
- `ClassroomSelectionMode`：[packages/contracts/src/classroom.ts:12](../../../packages/contracts/src/classroom.ts#L12)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `ClassroomAnswerDisposition`：[packages/contracts/src/classroom.ts:13](../../../packages/contracts/src/classroom.ts#L13)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `ClassroomQuestion`：[packages/contracts/src/classroom.ts:14](../../../packages/contracts/src/classroom.ts#L14)；字段：`id`、`prompt`、`options`、`hint`、`targetLessonIds?`、`selectionMode?`、`hintCount?`、`table?`、`diagram?`、`topic?`、`purpose?`。
- `ClassroomLesson`：[packages/contracts/src/classroom.ts:19](../../../packages/contracts/src/classroom.ts#L19)；字段：`id`、`title`、`objective`、`lectureId`、`steps`、`generatedNotice?`、`nextLessonId?`、`sourceReferences?`、`questions`、`verificationHref?`、`practiceVersion?`、`assessment?`。
- `ClassroomLecture`：[packages/contracts/src/classroom.ts:24](../../../packages/contracts/src/classroom.ts#L24)；字段：`id`、`title`、`description`、`lessons`。
- `ClassroomUnit`：[packages/contracts/src/classroom.ts:25](../../../packages/contracts/src/classroom.ts#L25)；字段：`id`、`title`、`objective`、`lectures`、`project`。
- `ClassroomCourse`：[packages/contracts/src/classroom.ts:27](../../../packages/contracts/src/classroom.ts#L27)；字段：`id`、`title`、`description`、`level`、`version`、`provenance`、`units`、`references`。
- `ClassroomAnswerReceipt`：[packages/contracts/src/classroom.ts:29](../../../packages/contracts/src/classroom.ts#L29)；字段：`questionId`、`selectedIndex`、`correct`、`skipped`、`sourceReferences?`、`selectedIndices?`、`correctIndices?`、`optionExplanations?`、`explanation`、`hintUsed`、`at`、`disposition?`、`hintLevel?`、`answerExposure?`。
- `ClassroomHintReceipt`：[packages/contracts/src/classroom.ts:33](../../../packages/contracts/src/classroom.ts#L33)；字段：`questionId`、`level`、`text`、`at`。
- `ClassroomChatMessage`：[packages/contracts/src/classroom.ts:34](../../../packages/contracts/src/classroom.ts#L34)；字段：`id`、`role`、`content`、`at`、`modelName?`、`speech?`、`board?`。
- `ClassroomSession`：[packages/contracts/src/classroom.ts:37](../../../packages/contracts/src/classroom.ts#L37)；字段：`id`、`ownerUserId`、`studentId`、`courseId`、`studioCourseId?`、`lessonId`、`contentFingerprint`、`lesson`、`sourceCourseId?`、`authoringAnswerExposure?`、`sourceCheckId?`、`sourceCheckFingerprint?`、`sourceCheckTargets?`、`presentation?`、`presentationRevisions?`、`cursor`、`revealed`、`sentenceCursor?`、`status`、`revision`、`messages`、`answers`、`projectDraft`、`hintedQuestionIds?`、`hintReceipts?`、`createdAt`、`updatedAt`。
- `ClassroomSessionView`：[packages/contracts/src/classroom.ts:48](../../../packages/contracts/src/classroom.ts#L48)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `ClassroomCatalog`：[packages/contracts/src/classroom.ts:51](../../../packages/contracts/src/classroom.ts#L51)；字段：`course`、`progress`、`lessonActivities?`、`projectActivities?`、`readingProgress?`、`archivedSessions?`。
- `ClassroomPracticeSummary`：[packages/contracts/src/classroom.ts:57](../../../packages/contracts/src/classroom.ts#L57)；字段：`total`、`answered`、`remaining`、`correct`、`incorrect`、`skipped`、`dontKnow`、`assisted`、`independentCorrect`、`complete`、`nextQuestionIndex`、`reviewQuestionIds`。

### packages/contracts/src/course-journey.ts

- `CourseLessonActivity`：[packages/contracts/src/course-journey.ts:2](../../../packages/contracts/src/course-journey.ts#L2)；字段：`lessonId`、`kind`、`reading`、`practice`。
- `CourseProjectActivity`：[packages/contracts/src/course-journey.ts:5](../../../packages/contracts/src/course-journey.ts#L5)；字段：`projectId`、`unitId`、`title`、`definitionFingerprint`、`definitionCurrent`、`stageId`、`totalStages`、`draftStages`、`submittedStages`、`reviewedStages`、`readyStages`、`updatedAt`。
- `SourceCourseUnitCheckActivity`：[packages/contracts/src/course-journey.ts:7](../../../packages/contracts/src/course-journey.ts#L7)；字段：`current`、`archived`。
- `SourceCourseJourney`：[packages/contracts/src/course-journey.ts:11](../../../packages/contracts/src/course-journey.ts#L11)；字段：`lessons`、`projects`、`unitCheck`。

### packages/contracts/src/course-project.ts

- `ProjectStage`：[packages/contracts/src/course-project.ts:2](../../../packages/contracts/src/course-project.ts#L2)；字段：`id`、`title`、`objective`、`fields`。
- `ProjectCriterion`：[packages/contracts/src/course-project.ts:4](../../../packages/contracts/src/course-project.ts#L4)；字段：`id`、`title`、`levels`。
- `CourseProjectDefinition`：[packages/contracts/src/course-project.ts:5](../../../packages/contracts/src/course-project.ts#L5)；字段：`id`、`courseId`、`unitId`、`title`、`brief`、`version`、`fingerprint`、`contentReview`、`provenance`、`sourceCourse?`、`stages`、`rubric`。
- `ProjectEvidence`：[packages/contracts/src/course-project.ts:10](../../../packages/contracts/src/course-project.ts#L10)；字段：`id`、`label`、`content`、`source`。
- `ProjectArtifact`：[packages/contracts/src/course-project.ts:11](../../../packages/contracts/src/course-project.ts#L11)；字段：`values`、`evidence`、`attachments?`。
- `ProjectRating`：[packages/contracts/src/course-project.ts:12](../../../packages/contracts/src/course-project.ts#L12)；字段：`criterionId`、`level`、`evidence`、`attachmentIds?`。
- `ProjectSubmission`：[packages/contracts/src/course-project.ts:13](../../../packages/contracts/src/course-project.ts#L13)；字段：`id`、`stageId`、`number`、`artifact`、`selfRatings`、`attachmentManifest?`、`revisionNote`、`previousSubmissionId`、`rubricVersion`、`at`。
- `ProjectHumanReview`：[packages/contracts/src/course-project.ts:15](../../../packages/contracts/src/course-project.ts#L15)；字段：`id`、`submissionId`、`reviewerId`、`reviewerRole`、`ratings`、`comment`、`decision`、`supersedesReviewId`、`at`。
- `ProjectAdviceScope`：[packages/contracts/src/course-project.ts:18](../../../packages/contracts/src/course-project.ts#L18)；字段：`fieldIds`、`evidenceIds`、`attachmentIds`。
- `ProjectAdvice`：[packages/contracts/src/course-project.ts:19](../../../packages/contracts/src/course-project.ts#L19)；字段：`id`、`stageId`、`artifactFingerprint`、`scope?`、`reply`、`modelName`、`at`。
- `CourseProject`：[packages/contracts/src/course-project.ts:21](../../../packages/contracts/src/course-project.ts#L21)；字段：`id`、`ownerUserId`、`studentId`、`studioCourseId?`、`sourceCourseId?`、`definition`、`revision`、`currentStageId`、`drafts`、`submissions`、`reviews`、`draftReflections`、`advice`、`legacyImports`、`createdAt`、`updatedAt`。
- `CourseProjectView`：[packages/contracts/src/course-project.ts:27](../../../packages/contracts/src/course-project.ts#L27)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `CourseProjectCatalog`：[packages/contracts/src/course-project.ts:29](../../../packages/contracts/src/course-project.ts#L29)；字段：`definitions`、`projects`、`permissions?`。
- `ProjectCommandReceipt`：[packages/contracts/src/course-project.ts:30](../../../packages/contracts/src/course-project.ts#L30)；字段：`requestKey`、`kind`、`appliedRevision`、`at`、`submissionId?`、`reviewId?`、`project`。

### packages/contracts/src/curriculum.ts

- `CurriculumTocPart`：[packages/contracts/src/curriculum.ts:5](../../../packages/contracts/src/curriculum.ts#L5)；字段：`name`、`printedPage`、`tocPage?`。
- `CurriculumLesson`：[packages/contracts/src/curriculum.ts:6](../../../packages/contracts/src/curriculum.ts#L6)；字段：`id`、`name`、`printedPage?`、`tocPage?`、`kind?`、`number?`、`skim?`、`parts?`。
- `CurriculumChapter`：[packages/contracts/src/curriculum.ts:12](../../../packages/contracts/src/curriculum.ts#L12)；字段：`id`、`name`、`lessons`、`printedPage?`、`tocPage?`、`kind?`、`pageBasis?`、`syntheticHeading?`。
- `CurriculumBook`：[packages/contracts/src/curriculum.ts:17](../../../packages/contracts/src/curriculum.ts#L17)；字段：`id`、`subject`、`grade`、`term`、`edition`、`title`、`version`、`source`、`sourceRef`、`sourceSha256`、`chapterState`、`chapters`、`catalogVersion?`、`chapterEvidence?`。
- `TextbookAtomMapping`：[packages/contracts/src/curriculum.ts:34](../../../packages/contracts/src/curriculum.ts#L34)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `CurriculumRevision`：[packages/contracts/src/curriculum.ts:38](../../../packages/contracts/src/curriculum.ts#L38)；字段：`id`、`entityId`、`kind`、`version`、`actorId`、`at`、`snapshot`。
- `CurriculumPackage`：[packages/contracts/src/curriculum.ts:48](../../../packages/contracts/src/curriculum.ts#L48)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `CurriculumPackagePreview`：[packages/contracts/src/curriculum.ts:49](../../../packages/contracts/src/curriculum.ts#L49)；字段：`fileId`、`fileSha256`、`title`、`provenance`、`fingerprint`、`total`、`added`、`changed`、`unchanged`、`published`、`draft`、`changes`。
- `MaterialStructureGap`：[packages/contracts/src/curriculum.ts:57](../../../packages/contracts/src/curriculum.ts#L57)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `MaterialStructureCoverage`：[packages/contracts/src/curriculum.ts:59](../../../packages/contracts/src/curriculum.ts#L59)；字段：`version`、`familyIdentityVersion`、`families`、`understandingFamilies`、`procedureFamilies`、`basicFamilies`、`transferFamilies`、`contrastFamilies`、`ready`、`gaps`。
- `KnowledgeMaterialCoverage`：[packages/contracts/src/curriculum.ts:64](../../../packages/contracts/src/curriculum.ts#L64)；字段：`version`、`ready`、`structure`、`sample`。

### packages/contracts/src/diagnostics.ts

- `MeasurementDimension`：[packages/contracts/src/diagnostics.ts:7](../../../packages/contracts/src/diagnostics.ts#L7)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `TeachingVisual`：[packages/contracts/src/diagnostics.ts:36](../../../packages/contracts/src/diagnostics.ts#L36)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `AtomTeaching`：[packages/contracts/src/diagnostics.ts:53](../../../packages/contracts/src/diagnostics.ts#L53)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `KnowledgeAtom`：[packages/contracts/src/diagnostics.ts:64](../../../packages/contracts/src/diagnostics.ts#L64)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `LearningScope`：[packages/contracts/src/diagnostics.ts:81](../../../packages/contracts/src/diagnostics.ts#L81)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `ComponentBinding`：[packages/contracts/src/diagnostics.ts:89](../../../packages/contracts/src/diagnostics.ts#L89)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `MeasurementItem`：[packages/contracts/src/diagnostics.ts:102](../../../packages/contracts/src/diagnostics.ts#L102)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `DiagnosticStart`：[packages/contracts/src/diagnostics.ts:110](../../../packages/contracts/src/diagnostics.ts#L110)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `DiagnosticVerificationBlueprint`：[packages/contracts/src/diagnostics.ts:112](../../../packages/contracts/src/diagnostics.ts#L112)；字段：`familyIdentityVersion?`、`hypothesisId`、`title`、`cause`、`ruleVersion`、`sourceRuleVersion`、`basisFingerprint`、`supportCondition`、`counterCondition`、`undecidedCondition`、`fullyCovered`、`groups`。
- `DiagnosticVerificationResult`：[packages/contracts/src/diagnostics.ts:119](../../../packages/contracts/src/diagnostics.ts#L119)；字段：`familyIdentityVersion?`、`distinctFamilyRequirementsMet?`、`blueprint`、`independentObservationsComplete`、`groups`、`notice`。
- `AssessmentBlueprint`：[packages/contracts/src/diagnostics.ts:127](../../../packages/contracts/src/diagnostics.ts#L127)；字段：`familyIdentityVersion?`、`version`、`title`、`intent`、`focus`、`itemLimit`、`minutesLimit`、`expectedSeconds`、`groupSize`、`stopReason`、`stopRule`、`targetAtomIds`、`prerequisiteAtomIds`、`groups`、`dimensions`、`warnings`、`verification?`、`routing?`。
- `DiagnosticBlueprintReservation`：[packages/contracts/src/diagnostics.ts:139](../../../packages/contracts/src/diagnostics.ts#L139)；字段：`id`、`studentId`、`actorId`、`command`、`seed`、`fingerprint`、`createdAt`、`expiresAt`、`sessionId`、`requestHash`、`blueprint`、`scopeSnapshot`、`coverage`、`atomNames`、`itemCount`。
- `DiagnosticBlueprintView`：[packages/contracts/src/diagnostics.ts:145](../../../packages/contracts/src/diagnostics.ts#L145)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `DiagnosticSession`：[packages/contracts/src/diagnostics.ts:149](../../../packages/contracts/src/diagnostics.ts#L149)；字段：`id`、`studentId`、`subject`、`intent`、`status`、`scopeSnapshot`、`blueprint?`、`revision?`、`endedAt?`、`stateHistory?`、`atomSnapshots?`、`componentAtomSnapshots?`、`itemIds`、`itemSnapshots`、`questionSnapshots`、`coverage`、`selectionReasons`、`seed`、`algorithmVersion`、`startedAt`、`completedAt`、`hypothesisId`、`reviewTaskId`、`exposedQuestionIds?`、`planId?`、`planRevision?`、`routing?`。
- `DiagnosticRoutingDecision`：[packages/contracts/src/diagnostics.ts:169](../../../packages/contracts/src/diagnostics.ts#L169)；字段：`sequence`、`itemId`、`focusAtomId`、`rule`、`reason`、`at`、`basis`。
- `DiagnosticRouting`：[packages/contracts/src/diagnostics.ts:175](../../../packages/contracts/src/diagnostics.ts#L175)；字段：`version`、`initialItemIds`、`currentItemId`、`decisions`。
- `DiagnosticResponseInput`：[packages/contracts/src/diagnostics.ts:185](../../../packages/contracts/src/diagnostics.ts#L185)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `DiagnosticResponse`：[packages/contracts/src/diagnostics.ts:186](../../../packages/contracts/src/diagnostics.ts#L186)；字段：`id`、`sessionId`、`studentId`、`itemId`、`questionId`、`atomId`、`family`、`dimension`、`questionVersion`、`mappingVersion`、`answer`、`score`、`correct`、`status`、`disposition`、`elapsedMs`、`hintLevel`、`observationCode`、`gradingReason`、`retentionDelayDays`、`submittedAt`、`gradingVersion`、`requestKey`、`requestHash?`、`priorExposure?`、`atomVersion?`、`atomDefinitionFingerprint?`、`scoreDetails?`。
- `ResponseScoreDetail`：[packages/contracts/src/diagnostics.ts:200](../../../packages/contracts/src/diagnostics.ts#L200)；字段：`key`、`label`、`score`、`origin`、`observation?`。
- `DiagnosticObservation`：[packages/contracts/src/diagnostics.ts:201](../../../packages/contracts/src/diagnostics.ts#L201)；字段：`responseId`、`atomId`、`kind`、`description`、`details`。
- `ComponentObservation`：[packages/contracts/src/diagnostics.ts:204](../../../packages/contracts/src/diagnostics.ts#L204)；字段：`responseId`、`bindingId`、`sourceAtomId`、`atomId`、`atomName`、`state`、`description`、`nextAction`、`scoreDetails`、`upstreamDetails`、`independentEstimateContribution`、`ruleVersion`、`targetDefinitionFingerprint`。
- `ScoringRevision`：[packages/contracts/src/diagnostics.ts:211](../../../packages/contracts/src/diagnostics.ts#L211)；字段：`id`、`responseId`、`score`、`reason`、`reviewerId`、`createdAt`、`version`、`requestKey?`、`requestHash?`、`ratings?`、`rubricSnapshot?`。
- `MasteryEstimate`：[packages/contracts/src/diagnostics.ts:219](../../../packages/contracts/src/diagnostics.ts#L219)；字段：`familyIdentityVersion?`、`atomId`、`atomName`、`grade`、`mastery`、`lower`、`upper`、`status`、`rawCorrect`、`scoredCount`、`effectiveSamples`、`independentFamilies`、`dimensions`、`independentRate`、`transferVerified`、`retentionVerified`、`evidenceIds`、`lastMeasuredAt`、`algorithmVersion`。
- `DiagnosticHypothesis`：[packages/contracts/src/diagnostics.ts:229](../../../packages/contracts/src/diagnostics.ts#L229)；字段：`familyIdentityVersion?`、`id`、`studentId`、`subject`、`atomId`、`cause`、`status`、`title`、`observation`、`explanation`、`alternatives`、`supportingEvidenceIds`、`counterEvidenceIds`、`probeAtomIds`、`reportedEvidenceIds?`、`verification?`、`nextAction`、`confidence`、`ruleVersion`、`updatedAt`、`history`、`atomDefinitionFingerprint?`。
- `LearningSourceCitation`：[packages/contracts/src/diagnostics.ts:244](../../../packages/contracts/src/diagnostics.ts#L244)；字段：`id`、`kind`、`bookId`、`bookVersion`、`title`、`edition`、`chapterName`、`lessonId`、`lessonName`、`mappingId`、`mappingVersion`、`pageStart`、`pageEnd`、`locatorStatus`、`sourceAvailability`、`note`。
- `GuidanceAction`：[packages/contracts/src/diagnostics.ts:263](../../../packages/contracts/src/diagnostics.ts#L263)；字段：`id`、`atomId`、`hypothesisId`、`evidenceIds`、`title`、`activity`、`minutes`、`successCriterion`、`resourceQuestionIds`、`retestAt`、`teachingSnapshot?`、`sourceCitations?`。
- `DiagnosticGuidancePlan`：[packages/contracts/src/diagnostics.ts:270](../../../packages/contracts/src/diagnostics.ts#L270)；字段：`id`、`studentId`、`subject`、`baselineSessionId`、`version`、`source`、`status`、`minutesPerDay`、`summary`、`actions`、`evidenceIds`、`createdAt`、`aiStatus`、`revision?`、`baselineReportVersion?`、`activatedAt?`、`aiAdoption?`、`retrospectiveReview?`。
- `GuidancePlanView`：[packages/contracts/src/diagnostics.ts:279](../../../packages/contracts/src/diagnostics.ts#L279)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `GuidancePlanRevision`：[packages/contracts/src/diagnostics.ts:286](../../../packages/contracts/src/diagnostics.ts#L286)；字段：`id`、`planId`、`revision`、`kind`、`at`、`actorId`、`reason`、`snapshot`、`requestKey?`、`inputHash?`。
- `ReviewTask`：[packages/contracts/src/diagnostics.ts:291](../../../packages/contracts/src/diagnostics.ts#L291)；字段：`id`、`planId`、`studentId`、`subject`、`atomId`、`intervalDays`、`dueAt`、`status`、`sessionId`、`planRevision?`、`baselineReportVersion?`、`earliestDueAt?`、`scheduleRevision?`、`scheduleHistory?`。
- `DiagnosticReport`：[packages/contracts/src/diagnostics.ts:299](../../../packages/contracts/src/diagnostics.ts#L299)；字段：`familyIdentityVersion?`、`sessionId`、`studentId`、`subject`、`status`、`answeredCount`、`totalCount`、`scoredCount`、`pendingReviewCount`、`rawScore`、`coverage`、`estimates`、`hypotheses`、`evidence`、`unmeasuredAtomIds`、`observations?`、`componentObservations?`、`verification?`、`summary`、`modelNotice`、`scopeSnapshot?`、`version?`、`generatedAt?`、`revisionReason?`、`scoringRevisionIds?`、`definitionContext?`。

### packages/contracts/src/gesp.ts

- `GespAtom`：[packages/contracts/src/gesp.ts:15](../../../packages/contracts/src/gesp.ts#L15)；字段：`id`、`track`、`level`、`name`、`prerequisiteIds`、`mathPrerequisites`、`successCriterion`、`commonErrorToInvestigate`、`sourceClauseIds`、`sourceEvidence`、`reviewStatus`、`publicationStatus`。
- `GespTeachingPlan`：[packages/contracts/src/gesp.ts:21](../../../packages/contracts/src/gesp.ts#L21)；字段：`version`、`reviewStatus`、`audience`、`principles`、`evidenceCycle`、`units`、`advancedReference`。
- `GespQuestion`：[packages/contracts/src/gesp.ts:27](../../../packages/contracts/src/gesp.ts#L27)；字段：`id`、`certificationLevel`、`session`、`kind`、`sourceKind`、`sourceAuthority`、`number`、`title`、`pdfUrl`、`pdfSha256`、`pdfPages`、`sourcePageUrl`、`atomCandidates`、`publicationStatus`、`requiresVisualReview`。
- `GespQuestionDetail`：[packages/contracts/src/gesp.ts:34](../../../packages/contracts/src/gesp.ts#L34)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `GespSearchResult`：[packages/contracts/src/gesp.ts:40](../../../packages/contracts/src/gesp.ts#L40)；字段：`items`、`total`、`page`、`pageSize`。
- `GespOverview`：[packages/contracts/src/gesp.ts:41](../../../packages/contracts/src/gesp.ts#L41)；字段：`track`、`asOf`、`ready`、`notice`、`stats`、`levels`、`sessions`、`sourceGaps`、`quarantinedLinks`、`unrecoveredObjectiveAnswers`、`teachingPlan`。
- `GespLearningScope`：[packages/contracts/src/gesp.ts:103](../../../packages/contracts/src/gesp.ts#L103)；字段：`id`、`studentId`、`level`、`atomIds`、`status`、`version`、`confirmedByUserId`、`confirmedAt`、`updatedAt`、`requestKey`、`reason`。
- `GespLearningScopeRevision`：[packages/contracts/src/gesp.ts:108](../../../packages/contracts/src/gesp.ts#L108)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `GespStudentTask`：[packages/contracts/src/gesp.ts:110](../../../packages/contracts/src/gesp.ts#L110)；字段：`id`、`atomId`、`title`、`prompt`、`language`、`standard`、`timeLimitSeconds`、`memoryLimitMiB`、`reviewStatus`、`probes`、`contentReviewStatus`、`contentReviewVersion`。
- `GespTaskProvenance`：[packages/contracts/src/gesp.ts:118](../../../packages/contracts/src/gesp.ts#L118)；字段：`taskContentSha256`、`testPackSha256`、`contentReviewVersion`、`contentReviewStatus`。
- `GespTaskReviewGate`：[packages/contracts/src/gesp.ts:124](../../../packages/contracts/src/gesp.ts#L124)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `GespTaskReview`：[packages/contracts/src/gesp.ts:125](../../../packages/contracts/src/gesp.ts#L125)；字段：`id`、`taskId`、`atomId`、`taskContentSha256`、`gates`、`status`、`reviewerId`、`reviewedAt`、`version`、`rationale`、`requestKey`。
- `GespTaskReviewRevision`：[packages/contracts/src/gesp.ts:130](../../../packages/contracts/src/gesp.ts#L130)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `GespTaskReviewHistoryItem`：[packages/contracts/src/gesp.ts:131](../../../packages/contracts/src/gesp.ts#L131)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `GespPilotTaskReviewView`：[packages/contracts/src/gesp.ts:132](../../../packages/contracts/src/gesp.ts#L132)；字段：`id`、`atomId`、`title`、`prompt`、`language`、`standard`、`timeLimitSeconds`、`memoryLimitMiB`、`contentSha256`、`probes`、`tests`、`review`。
- `GespProbeSubmissionReceipt`：[packages/contracts/src/gesp.ts:140](../../../packages/contracts/src/gesp.ts#L140)；字段：`id`、`studentId`、`atomId`、`taskId`、`probeId`、`dimension`、`status`、`requestKey`、`answer`、`createdAt`、`analysis`、`provenance?`。
- `GespCodeSubmissionReceipt`：[packages/contracts/src/gesp.ts:147](../../../packages/contracts/src/gesp.ts#L147)；字段：`id`、`studentId`、`atomId`、`taskId`、`sourceSha256`、`status`、`createdAt`、`toolchain`、`compilePassed`、`requestKey`、`source`、`compileDiagnostics`、`runtimeDiagnostics`、`tests`、`hintEventId`、`hintLevel`、`independent`、`reviewTaskId`、`provenance?`。
- `GespHintEvent`：[packages/contracts/src/gesp.ts:156](../../../packages/contracts/src/gesp.ts#L156)；字段：`id`、`studentId`、`atomId`、`taskId`、`level`、`text`、`revealsAnswer`、`requestKey`、`createdAt`。
- `GespGuidanceAction`：[packages/contracts/src/gesp.ts:161](../../../packages/contracts/src/gesp.ts#L161)；字段：`id`、`atomId`、`title`、`activity`、`successCriterion`、`dimensionGaps`、`evidenceIds`、`minutes`。
- `GespGuidancePlan`：[packages/contracts/src/gesp.ts:166](../../../packages/contracts/src/gesp.ts#L166)；字段：`id`、`studentId`、`scopeVersion`、`evidenceFingerprint`、`source`、`status`、`version`、`minutesPerDay`、`requestKey`、`reason`、`createdAt`、`updatedAt`、`createdByUserId`、`decidedByUserId`、`decidedAt`、`actions`、`totalActionMinutes`、`deferredAtomIds`。
- `GespGuidancePlanRevision`：[packages/contracts/src/gesp.ts:174](../../../packages/contracts/src/gesp.ts#L174)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `GespReviewTask`：[packages/contracts/src/gesp.ts:176](../../../packages/contracts/src/gesp.ts#L176)；字段：`id`、`studentId`、`atomId`、`taskId`、`sourceSubmissionId`、`stageDay`、`dueAt`、`createdAt`、`status`、`taskContentSha256?`、`testPackSha256`、`attemptCount`、`lastSubmissionId`、`lastStatus`、`completedSubmissionId`、`completedAt`。

### packages/contracts/src/guidance-model.ts

- `GuidanceModelSuggestionStatus`：[packages/contracts/src/guidance-model.ts:3](../../../packages/contracts/src/guidance-model.ts#L3)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `GuidanceModelText`：[packages/contracts/src/guidance-model.ts:4](../../../packages/contracts/src/guidance-model.ts#L4)；字段：`summary`、`activities`。
- `GuidanceModelOriginal`：[packages/contracts/src/guidance-model.ts:5](../../../packages/contracts/src/guidance-model.ts#L5)；字段：`summary`、`minutesPerDay`、`actions`。
- `GuidanceModelSuggestionView`：[packages/contracts/src/guidance-model.ts:7](../../../packages/contracts/src/guidance-model.ts#L7)；字段：`id`、`planId`、`studentId`、`requestKey`、`requestedModelId`、`modelId`、`modelName`、`planRevision`、`baselineReportVersion`、`status`、`revision`、`original`、`result`、`createdAt`、`updatedAt`、`eligibility`、`adoptedRevision`、`task`。
- `GuidanceModelSuggestionList`：[packages/contracts/src/guidance-model.ts:14](../../../packages/contracts/src/guidance-model.ts#L14)；字段：`suggestions`、`hasMore`、`page`、`pageSize`。
- `GuidanceModelSuggestionCommand`：[packages/contracts/src/guidance-model.ts:15](../../../packages/contracts/src/guidance-model.ts#L15)；字段：`requestKey`、`modelId`、`expectedRevision`。
- `GuidanceModelAdoptionCommand`：[packages/contracts/src/guidance-model.ts:16](../../../packages/contracts/src/guidance-model.ts#L16)；字段：`requestKey`、`expectedRevision`、`suggestionRevision`。

### packages/contracts/src/index.ts

- `Subject`：[packages/contracts/src/index.ts:10](../../../packages/contracts/src/index.ts#L10)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `UserRole`：[packages/contracts/src/index.ts:13](../../../packages/contracts/src/index.ts#L13)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `ApiError`：[packages/contracts/src/index.ts:21](../../../packages/contracts/src/index.ts#L21)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `ApiResponse`：[packages/contracts/src/index.ts:23](../../../packages/contracts/src/index.ts#L23)；字段：`data`、`error`、`meta`。
- `DomainEventEnvelope`：[packages/contracts/src/index.ts:40](../../../packages/contracts/src/index.ts#L40)；字段：`eventName`、`eventVersion`、`eventId`、`occurredAt`、`payload`。
- `StudentProfile`：[packages/contracts/src/index.ts:61](../../../packages/contracts/src/index.ts#L61)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `SubjectEnrollment`：[packages/contracts/src/index.ts:71](../../../packages/contracts/src/index.ts#L71)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `TextbookVolume`：[packages/contracts/src/index.ts:84](../../../packages/contracts/src/index.ts#L84)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `KnowledgePoint`：[packages/contracts/src/index.ts:97](../../../packages/contracts/src/index.ts#L97)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `Question`：[packages/contracts/src/index.ts:111](../../../packages/contracts/src/index.ts#L111)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionRuntimeSummary`：[packages/contracts/src/index.ts:121](../../../packages/contracts/src/index.ts#L121)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionBlockType`：[packages/contracts/src/index.ts:138](../../../packages/contracts/src/index.ts#L138)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionBlock`：[packages/contracts/src/index.ts:186](../../../packages/contracts/src/index.ts#L186)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionAttachment`：[packages/contracts/src/index.ts:200](../../../packages/contracts/src/index.ts#L200)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionLayoutMode`：[packages/contracts/src/index.ts:203](../../../packages/contracts/src/index.ts#L203)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionDocument`：[packages/contracts/src/index.ts:215](../../../packages/contracts/src/index.ts#L215)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionAnswerMode`：[packages/contracts/src/index.ts:237](../../../packages/contracts/src/index.ts#L237)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionOption`：[packages/contracts/src/index.ts:246](../../../packages/contracts/src/index.ts#L246)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionAnswerSchema`：[packages/contracts/src/index.ts:258](../../../packages/contracts/src/index.ts#L258)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionSourceType`：[packages/contracts/src/index.ts:268](../../../packages/contracts/src/index.ts#L268)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionLicenseClass`：[packages/contracts/src/index.ts:277](../../../packages/contracts/src/index.ts#L277)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionSourceRecord`：[packages/contracts/src/index.ts:291](../../../packages/contracts/src/index.ts#L291)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionImportType`：[packages/contracts/src/index.ts:294](../../../packages/contracts/src/index.ts#L294)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionImportJobStatus`：[packages/contracts/src/index.ts:297](../../../packages/contracts/src/index.ts#L297)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionImportReviewStatus`：[packages/contracts/src/index.ts:300](../../../packages/contracts/src/index.ts#L300)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionImportSplitMode`：[packages/contracts/src/index.ts:303](../../../packages/contracts/src/index.ts#L303)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionImportQualityLevel`：[packages/contracts/src/index.ts:306](../../../packages/contracts/src/index.ts#L306)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionImportAiSuggestion`：[packages/contracts/src/index.ts:322](../../../packages/contracts/src/index.ts#L322)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionImportSourcePolicy`：[packages/contracts/src/index.ts:330](../../../packages/contracts/src/index.ts#L330)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionImportJob`：[packages/contracts/src/index.ts:353](../../../packages/contracts/src/index.ts#L353)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionImportRecord`：[packages/contracts/src/index.ts:388](../../../packages/contracts/src/index.ts#L388)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `QuestionRenderPayload`：[packages/contracts/src/index.ts:398](../../../packages/contracts/src/index.ts#L398)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudentAnswerPayload`：[packages/contracts/src/index.ts:413](../../../packages/contracts/src/index.ts#L413)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `AnswerValidationFieldError`：[packages/contracts/src/index.ts:420](../../../packages/contracts/src/index.ts#L420)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `AnswerValidationResult`：[packages/contracts/src/index.ts:429](../../../packages/contracts/src/index.ts#L429)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `AssessmentSession`：[packages/contracts/src/index.ts:442](../../../packages/contracts/src/index.ts#L442)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `AssessmentResult`：[packages/contracts/src/index.ts:462](../../../packages/contracts/src/index.ts#L462)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `AssessmentProgressItem`：[packages/contracts/src/index.ts:475](../../../packages/contracts/src/index.ts#L475)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `AssessmentProgressView`：[packages/contracts/src/index.ts:488](../../../packages/contracts/src/index.ts#L488)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `MissionType`：[packages/contracts/src/index.ts:491](../../../packages/contracts/src/index.ts#L491)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `DailyMission`：[packages/contracts/src/index.ts:505](../../../packages/contracts/src/index.ts#L505)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `MissionResultItem`：[packages/contracts/src/index.ts:517](../../../packages/contracts/src/index.ts#L517)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `MissionResultView`：[packages/contracts/src/index.ts:537](../../../packages/contracts/src/index.ts#L537)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudyPlanDay`：[packages/contracts/src/index.ts:549](../../../packages/contracts/src/index.ts#L549)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudyPlan`：[packages/contracts/src/index.ts:567](../../../packages/contracts/src/index.ts#L567)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `GenerateWeeklyPlanRequest`：[packages/contracts/src/index.ts:576](../../../packages/contracts/src/index.ts#L576)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `MasteryStatus`：[packages/contracts/src/index.ts:579](../../../packages/contracts/src/index.ts#L579)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudentMasterySnapshot`：[packages/contracts/src/index.ts:592](../../../packages/contracts/src/index.ts#L592)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `MasteryHeatmapView`：[packages/contracts/src/index.ts:607](../../../packages/contracts/src/index.ts#L607)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `RiskSignal`：[packages/contracts/src/index.ts:621](../../../packages/contracts/src/index.ts#L621)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `WeeklyReport`：[packages/contracts/src/index.ts:649](../../../packages/contracts/src/index.ts#L649)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `AnalyticsOverview`：[packages/contracts/src/index.ts:663](../../../packages/contracts/src/index.ts#L663)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `AIInsightSummary`：[packages/contracts/src/index.ts:676](../../../packages/contracts/src/index.ts#L676)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `AIQualityOverview`：[packages/contracts/src/index.ts:696](../../../packages/contracts/src/index.ts#L696)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `AIAnalysisResponse`：[packages/contracts/src/index.ts:706](../../../packages/contracts/src/index.ts#L706)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `AssistantSession`：[packages/contracts/src/index.ts:720](../../../packages/contracts/src/index.ts#L720)；别名、联合类型或 Zod 推导类型，具体约束查看源码。

### packages/contracts/src/learning-home.ts

- `LearningHomeAction`：[packages/contracts/src/learning-home.ts:4](../../../packages/contracts/src/learning-home.ts#L4)；字段：`id`、`kind`、`title`、`reason`、`href`、`label`、`estimatedMinutes`、`saved`。
- `LearningHome`：[packages/contracts/src/learning-home.ts:13](../../../packages/contracts/src/learning-home.ts#L13)；字段：`generatedAt`、`day`、`subject`、`actor`、`children`、`selected`、`scope`、`primary`、`secondary`、`memory`、`counts`、`notice`。

### packages/contracts/src/learning.ts

- `PracticeAttempt`：[packages/contracts/src/learning.ts:4](../../../packages/contracts/src/learning.ts#L4)；字段：`id`、`sessionId`、`questionId`、`requestKey`、`answer`、`disposition`、`score`、`correct`、`status`、`hintLevel`、`attempt`、`solutionExposedBefore`、`elapsedMs`、`reason`、`submittedAt`、`requestHash?`。
- `PracticeSession`：[packages/contracts/src/learning.ts:11](../../../packages/contracts/src/learning.ts#L11)；字段：`id`、`studentId`、`subject`、`planId`、`actionId`、`atomId`、`day`、`status`、`questionIds`、`snapshots`、`createdAt`、`completedAt`、`drafts?`、`actionSnapshot?`、`planRevision?`、`snapshotOrigin?`、`origin?`、`notebookEntryId?`、`atomSnapshot?`、`sourceAssessmentId?`。
- `PracticeHint`：[packages/contracts/src/learning.ts:21](../../../packages/contracts/src/learning.ts#L21)；字段：`id`、`sessionId`、`questionId`、`level`、`at`。
- `LearningMemory`：[packages/contracts/src/learning.ts:23](../../../packages/contracts/src/learning.ts#L23)；字段：`generatedAt`、`revision`、`student`、`subject`、`consent`、`summary`、`facts`、`unknowns`、`openHypotheses`、`feed`。
- `NotebookMetadata`：[packages/contracts/src/learning.ts:33](../../../packages/contracts/src/learning.ts#L33)；字段：`tags`、`favorite`、`removed`、`errorSteps`、`reflection`、`reviewState`。
- `MistakeNotebookEntry`：[packages/contracts/src/learning.ts:34](../../../packages/contracts/src/learning.ts#L34)；字段：`id`、`studentId`、`subject`、`kind`、`responseId`、`questionId`、`atomId`、`version`、`metadata`、`createdAt`、`updatedAt`、`redoSessionIds`、`verificationBlueprintIds`、`history`。

### packages/contracts/src/measurement-content.ts

- `MeasurementDraft`：[packages/contracts/src/measurement-content.ts:25](../../../packages/contracts/src/measurement-content.ts#L25)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `MeasurementContentGate`：[packages/contracts/src/measurement-content.ts:26](../../../packages/contracts/src/measurement-content.ts#L26)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `MeasurementContentCandidate`：[packages/contracts/src/measurement-content.ts:27](../../../packages/contracts/src/measurement-content.ts#L27)；字段：`id`、`paperId`、`position`、`sourceQuestionId`、`sourceHash`、`paperTitle`、`sourceGrade`、`sourceSubject`、`original`、`promptMedia`、`createdAt`、`createdBy`、`version`、`status`、`draft`、`draftHash`、`atomFingerprints`、`reviews`、`history`、`questionId?`、`mappingId?`、`publishedHash?`。

### packages/contracts/src/operations.ts

- `OperationsOverview`：[packages/contracts/src/operations.ts:1](../../../packages/contracts/src/operations.ts#L1)；字段：`at`、`runtime`、`requests`、`storage`、`rateLimits`、`tasks`、`learning`。

### packages/contracts/src/privacy.ts

- `PrivacyCounts`：[packages/contracts/src/privacy.ts:1](../../../packages/contracts/src/privacy.ts#L1)；字段：`records`、`observations`、`activities`、`plans`、`conversations`、`accessRecords`。
- `PrivacyReceipt`：[packages/contracts/src/privacy.ts:2](../../../packages/contracts/src/privacy.ts#L2)；字段：`id`、`actorId`、`kind`、`subjectHash`、`requestKey`、`inputHash`、`completedAt`、`counts`、`erasedStudentHashes?`、`retainedStudentHashes?`。
- `PrivacyOverview`：[packages/contracts/src/privacy.ts:7](../../../packages/contracts/src/privacy.ts#L7)；字段：`account`、`children`、`receipts`、`policyVersion`、`retentionNotice`。
- `PrivacyPreview`：[packages/contracts/src/privacy.ts:13](../../../packages/contracts/src/privacy.ts#L13)；字段：`scope`、`subjectId`、`confirmation`、`fingerprint`、`counts`、`canDelete`、`blockers`、`deletedChildren`、`retainedChildren`、`policyVersion`、`retentionNotice`。
- `PrivacyExport`：[packages/contracts/src/privacy.ts:18](../../../packages/contracts/src/privacy.ts#L18)；字段：`format`、`exportedAt`、`policyVersion`、`account`、`students`、`accountRecords`、`receipt`、`notices`。

### packages/contracts/src/processing.ts

- `ImportFile`：[packages/contracts/src/processing.ts:1](../../../packages/contracts/src/processing.ts#L1)；字段：`id`、`ownerUserId`、`requestKey`、`name`、`size`、`mediaType`、`chunkSize`、`chunks`、`status`、`sha256`、`createdAt`、`completedAt`。
- `ImportPageEvidence`：[packages/contracts/src/processing.ts:7](../../../packages/contracts/src/processing.ts#L7)；字段：`fileId`、`fileSha256`、`pageNumber`、`method`、`processorVersion`、`text`、`imageSha256`、`imageUrl`、`lines`、`warnings`、`width`、`height`、`boxSpace`。
- `ImportPageEvidenceRef`：[packages/contracts/src/processing.ts:14](../../../packages/contracts/src/processing.ts#L14)；字段：`id`、`jobId`、`fileId`、`pageNumber`、`relativePath`、`sha256`、`size`。
- `ProcessingTaskView`：[packages/contracts/src/processing.ts:16](../../../packages/contracts/src/processing.ts#L16)；字段：`id`、`kind`、`state`、`attempts`、`maxAttempts`、`generation`、`version`、`createdAt`、`updatedAt`、`progress`、`result`、`errorCode`、`availableAt`。
- `ProcessingArtifact`：[packages/contracts/src/processing.ts:21](../../../packages/contracts/src/processing.ts#L21)；字段：`id`、`taskId`、`fileId`、`mediaType`、`sha256`、`relativePath`、`size`、`createdAt`、`purpose`。

### packages/contracts/src/project-assets.ts

- `ProjectAssetType`：[packages/contracts/src/project-assets.ts:9](../../../packages/contracts/src/project-assets.ts#L9)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `ProjectAssetKind`：[packages/contracts/src/project-assets.ts:10](../../../packages/contracts/src/project-assets.ts#L10)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `ProjectAttachmentRef`：[packages/contracts/src/project-assets.ts:11](../../../packages/contracts/src/project-assets.ts#L11)；字段：`assetId`、`label`、`caption`、`evidenceId?`。
- `ProjectAssetFile`：[packages/contracts/src/project-assets.ts:12](../../../packages/contracts/src/project-assets.ts#L12)；字段：`name`、`sha256`、`size`、`mediaType`。
- `ProjectAttachmentSnapshot`：[packages/contracts/src/project-assets.ts:13](../../../packages/contracts/src/project-assets.ts#L13)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `ProjectAssetUpload`：[packages/contracts/src/project-assets.ts:14](../../../packages/contracts/src/project-assets.ts#L14)；字段：`id`、`projectId`、`stageId`、`definitionFingerprint`、`name`、`size`、`mediaType`、`sha256`、`chunkSize`、`chunks`、`status`、`revision`、`assetId`、`createdAt`、`expiresAt`、`completedAt`。
- `ProjectAssetView`：[packages/contracts/src/project-assets.ts:16](../../../packages/contracts/src/project-assets.ts#L16)；字段：`id`、`projectId`、`stageId`、`name`、`kind`、`mediaType`、`revision`、`status`、`original`、`display?`、`previews`、`pageCount`、`durationMs`、`width`、`height`、`normalizationVersion`、`createdAt`、`updatedAt`、`task`。
- `ProjectFileIntegrity`：[packages/contracts/src/project-assets.ts:20](../../../packages/contracts/src/project-assets.ts#L20)；字段：`assetId`、`checkedAt`、`complete`、`files`。

### packages/contracts/src/project-teaching.ts

- `ProjectTeachingStep`：[packages/contracts/src/project-teaching.ts:6](../../../packages/contracts/src/project-teaching.ts#L6)；字段：`id`、`kind`、`title`、`instruction`、`fieldId?`。
- `ProjectTeachingView`：[packages/contracts/src/project-teaching.ts:7](../../../packages/contracts/src/project-teaching.ts#L7)；字段：`version`、`projectId`、`definitionFingerprint`、`stages`、`speech`。

### packages/contracts/src/reviews.ts

- `EvidenceKind`：[packages/contracts/src/reviews.ts:4](../../../packages/contracts/src/reviews.ts#L4)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `RubricRating`：[packages/contracts/src/reviews.ts:10](../../../packages/contracts/src/reviews.ts#L10)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `ScoringReviewInput`：[packages/contracts/src/reviews.ts:17](../../../packages/contracts/src/reviews.ts#L17)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `TeacherStudentAssignment`：[packages/contracts/src/reviews.ts:18](../../../packages/contracts/src/reviews.ts#L18)；字段：`id`、`studentId`、`teacherUserId`、`grantedBy`、`permission`、`status`、`createdAt`、`revokedAt`、`revokedBy`。
- `EvidenceFeedback`：[packages/contracts/src/reviews.ts:28](../../../packages/contracts/src/reviews.ts#L28)；字段：`id`、`kind`、`responseId`、`studentId`、`subject`、`createdBy`、`category`、`message`、`status`、`version`、`requestKey`、`createdAt`、`updatedAt`、`history`。

### packages/contracts/src/source-course-check.ts

- `SourceCourseCheckSelection`：[packages/contracts/src/source-course-check.ts:8](../../../packages/contracts/src/source-course-check.ts#L8)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `SourceCourseCheckContent`：[packages/contracts/src/source-course-check.ts:15](../../../packages/contracts/src/source-course-check.ts#L15)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `SourceCourseCheckQuestion`：[packages/contracts/src/source-course-check.ts:16](../../../packages/contracts/src/source-course-check.ts#L16)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `SourceCourseCheckView`：[packages/contracts/src/source-course-check.ts:17](../../../packages/contracts/src/source-course-check.ts#L17)；字段：`id`、`courseId`、`revision`、`courseCurrent`、`status`、`title`、`modelId`、`modelName`、`questionCount`、`contentFingerprint`、`contentVersion`、`targets`、`stage`、`review`、`publication`、`contentReview`、`formalMeasurementEligible`、`task`、`createdAt`、`updatedAt`、`receipt?`。
- `SourceCourseCheckAuthoring`：[packages/contracts/src/source-course-check.ts:25](../../../packages/contracts/src/source-course-check.ts#L25)；字段：`view`、`content`、`contentFingerprint`、`contentVersion`、`sources?`、`historical`、`originalContent`、`review`。

### packages/contracts/src/source-course-compilation.ts

- `SourceChunkSummary`：[packages/contracts/src/source-course-compilation.ts:5](../../../packages/contracts/src/source-course-compilation.ts#L5)；字段：`key`、`sourceKey`、`start`、`end`、`characters`、`sha256`、`warnings`。
- `SourceCoursePreflight`：[packages/contracts/src/source-course-compilation.ts:9](../../../packages/contracts/src/source-course-compilation.ts#L9)；字段：`version`、`fingerprint`、`valid`、`requiresLongMode`、`characters`、`pages`、`chunks`、`serializedBytes`、`sources`、`issues`、`warnings`。
- `SourceCoverage`：[packages/contracts/src/source-course-compilation.ts:15](../../../packages/contracts/src/source-course-compilation.ts#L15)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `SourceCompilationView`：[packages/contracts/src/source-course-compilation.ts:19](../../../packages/contracts/src/source-course-compilation.ts#L19)；字段：`version`、`stage`、`chunks`、`indexedChunks`、`planGroups`、`plannedGroups`、`draftedLessons`、`reviewedLessons`、`plannedLessons`、`modelId`、`modelName`、`input`、`reviewCurrent`、`reviews`、`coverage`、`scopeNote`。
- `SourceLessonAuthoring`：[packages/contracts/src/source-course-compilation.ts:27](../../../packages/contracts/src/source-course-compilation.ts#L27)；字段：`courseId`、`lessonId`、`revision`、`title`、`overview`、`content`、`originalContent`、`sources`、`reviewCurrent`。

### packages/contracts/src/source-course-lifecycle.ts

- `SourceCourseLifecycleAction`：[packages/contracts/src/source-course-lifecycle.ts:3](../../../packages/contracts/src/source-course-lifecycle.ts#L3)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `SourceCourseLifecycleState`：[packages/contracts/src/source-course-lifecycle.ts:4](../../../packages/contracts/src/source-course-lifecycle.ts#L4)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `SourceCourseLifecycleEvent`：[packages/contracts/src/source-course-lifecycle.ts:5](../../../packages/contracts/src/source-course-lifecycle.ts#L5)；字段：`id`、`action`、`at`、`actorId`、`reason`、`fromStatus`、`toStatus`、`relatedCourseIds`。
- `SourceCourseVersioning`：[packages/contracts/src/source-course-lifecycle.ts:7](../../../packages/contracts/src/source-course-lifecycle.ts#L7)；字段：`familyId`、`parentCourseId`、`number`、`state`、`copiedAt?`、`events`。
- `SourceCourseVersionSummary`：[packages/contracts/src/source-course-lifecycle.ts:9](../../../packages/contracts/src/source-course-lifecycle.ts#L9)；字段：`id`、`title`、`number`、`parentCourseId`、`status`、`state`、`revision`、`confirmedAt`。
- `SourceCourseLifecyclePreview`：[packages/contracts/src/source-course-lifecycle.ts:11](../../../packages/contracts/src/source-course-lifecycle.ts#L11)；字段：`courseId`、`action`、`expectedRevision`、`fingerprint`、`impactFingerprint`、`requiresReason`、`sourceStatus`、`versions`、`changes`、`existing`、`effects`。

### packages/contracts/src/source-course.ts

- `SourceCourseContent`：[packages/contracts/src/source-course.ts:17](../../../packages/contracts/src/source-course.ts#L17)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `SourceCourseLessonContent`：[packages/contracts/src/source-course.ts:18](../../../packages/contracts/src/source-course.ts#L18)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `SourceCourseReviewField`：[packages/contracts/src/source-course.ts:19](../../../packages/contracts/src/source-course.ts#L19)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `SourceCourseReviewIssue`：[packages/contracts/src/source-course.ts:20](../../../packages/contracts/src/source-course.ts#L20)；字段：`field`、`questionIndex`、`quote`、`detail`。
- `SourceCourseLessonReview`：[packages/contracts/src/source-course.ts:21](../../../packages/contracts/src/source-course.ts#L21)；字段：`decision`、`issues`、`at`、`modelId`、`modelName`、`inputFingerprint`、`outputFingerprint`。
- `SourceCourseGenerationView`：[packages/contracts/src/source-course.ts:22](../../../packages/contracts/src/source-course.ts#L22)；字段：`version`、`inputCapture`、`stage`、`plannedLessons`、`draftedLessons`、`reviewedLessons`、`scopeNote`、`uncoveredSourceKeys`、`modelId`、`modelName`、`reviewCurrent`、`reviews`。
- `CourseSourceSnapshot`：[packages/contracts/src/source-course.ts:27](../../../packages/contracts/src/source-course.ts#L27)；字段：`key`、`materialId`、`page`、`title`、`kind`、`text`、`blocks`、`sha256`、`version`、`fingerprint`、`structureReviewRequired`、`textCharacters?`、`range?`。
- `SourceCourseInput`：[packages/contracts/src/source-course.ts:30](../../../packages/contracts/src/source-course.ts#L30)；字段：`title`、`goal`、`language`、`minutesPerSession`、`modelId`、`targetAtomIds`。
- `SourceCourseSummary`：[packages/contracts/src/source-course.ts:32](../../../packages/contracts/src/source-course.ts#L32)；字段：`id`、`studentId`、`subject`、`title`、`goal`、`versioning?`、`status`、`lessonCount`、`viewed`、`lastLessonId`、`lastSessionId?`、`nextLessonId?`、`nextLessonTitle?`、`lastStudied`、`createdAt`、`updatedAt`。
- `SourceCourseView`：[packages/contracts/src/source-course.ts:35](../../../packages/contracts/src/source-course.ts#L35)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `SourceCourseAuthoring`：[packages/contracts/src/source-course.ts:46](../../../packages/contracts/src/source-course.ts#L46)；字段：`courseId`、`revision`、`content`、`originalContent`、`contentReview`、`lessonId?`、`sources?`、`generationInput`、`generationReviews`、`reviewCurrent`。

### packages/contracts/src/student-access.ts

- `StudentLearningAccess`：[packages/contracts/src/student-access.ts:1](../../../packages/contracts/src/student-access.ts#L1)；字段：`id`、`studentId`、`userId`、`status`、`version`、`createdAt`、`updatedAt`、`createdBy`。
- `StudentLearningCode`：[packages/contracts/src/student-access.ts:5](../../../packages/contracts/src/student-access.ts#L5)；字段：`id`、`studentId`、`accessVersion`、`tokenHash`、`createdBy`、`createdAt`、`expiresAt`、`usedAt`、`revokedAt`、`requestKey`、`requestHash`。
- `StudentAccessRevision`：[packages/contracts/src/student-access.ts:9](../../../packages/contracts/src/student-access.ts#L9)；字段：`id`、`studentId`、`version`、`status`、`actorId`、`at`、`reason`、`requestKey`、`requestHash`。
- `StudentProgressProposal`：[packages/contracts/src/student-access.ts:13](../../../packages/contracts/src/student-access.ts#L13)；字段：`id`、`studentId`、`proposedBy`、`scope`、`baseScopeVersion`、`version`、`status`、`createdAt`、`requestKey`、`requestHash`、`decidedAt?`、`decidedBy?`、`decisionNote?`、`decisionRequestKey?`、`decisionHash?`、`acceptedScopeId?`、`knowledgeSnapshot?`。

### packages/contracts/src/student-media.ts

- `StudentMediaTarget`：[packages/contracts/src/student-media.ts:4](../../../packages/contracts/src/student-media.ts#L4)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudentMedia`：[packages/contracts/src/student-media.ts:7](../../../packages/contracts/src/student-media.ts#L7)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudentMediaView`：[packages/contracts/src/student-media.ts:12](../../../packages/contracts/src/student-media.ts#L12)；别名、联合类型或 Zod 推导类型，具体约束查看源码。

### packages/contracts/src/studio-material-upload.ts

- `StudioMaterialUpload`：[packages/contracts/src/studio-material-upload.ts:4](../../../packages/contracts/src/studio-material-upload.ts#L4)；字段：`id`、`ownerUserId`、`studentId`、`subject`、`name`、`size`、`sha256`、`chunkSize`、`chunks`、`status`、`revision`、`createdAt`、`expiresAt`、`completedAt`、`materialId`、`repairId?`。
- `StudioMaterialProgress`：[packages/contracts/src/studio-material-upload.ts:10](../../../packages/contracts/src/studio-material-upload.ts#L10)；字段：`materialId`、`status`、`pageCount`、`processedPages`、`ocrPages`、`unreadablePages`、`pages`、`task`。
- `StudioMaterialFileState`：[packages/contracts/src/studio-material-upload.ts:16](../../../packages/contracts/src/studio-material-upload.ts#L16)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioMaterialFileReport`：[packages/contracts/src/studio-material-upload.ts:17](../../../packages/contracts/src/studio-material-upload.ts#L17)；字段：`materialId`、`version`、`checkedAt`、`original`、`pages`、`canRegenerate`。
- `StudioOriginalRepair`：[packages/contracts/src/studio-material-upload.ts:24](../../../packages/contracts/src/studio-material-upload.ts#L24)；字段：`id`、`materialId`、`uploadId`、`status`、`canManage`、`revision`、`createdAt`、`updatedAt`、`completedAt`、`task`、`receipt`。

### packages/contracts/src/studio.ts

- `StudioSubject`：[packages/contracts/src/studio.ts:3](../../../packages/contracts/src/studio.ts#L3)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioLessonKind`：[packages/contracts/src/studio.ts:4](../../../packages/contracts/src/studio.ts#L4)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioLessonState`：[packages/contracts/src/studio.ts:5](../../../packages/contracts/src/studio.ts#L5)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioLesson`：[packages/contracts/src/studio.ts:7](../../../packages/contracts/src/studio.ts#L7)；字段：`id`、`atomId`、`title`、`objective`、`kind`、`state`、`href`、`teaching?`。
- `StudioUnit`：[packages/contracts/src/studio.ts:18](../../../packages/contracts/src/studio.ts#L18)；字段：`id`、`title`、`objective`、`lessons`。
- `StudioCoursePace`：[packages/contracts/src/studio.ts:25](../../../packages/contracts/src/studio.ts#L25)；字段：`version`、`minutesPerSession`、`teachingLanguage`、`estimatedMinutes`、`notice`、`sessions`。
- `StudioCourse`：[packages/contracts/src/studio.ts:34](../../../packages/contracts/src/studio.ts#L34)；字段：`id`、`studentId`、`subject`、`grade`、`term`、`title`、`description`、`objective`、`status`、`source`、`scopeVersion`、`textbookVersion`、`focusAtomIds`、`units`、`materials`、`fingerprint`、`createdAt`、`updatedAt`、`learningProgress?`、`pace?`。
- `StudioCoursePreview`：[packages/contracts/src/studio.ts:57](../../../packages/contracts/src/studio.ts#L57)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioActivity`：[packages/contracts/src/studio.ts:59](../../../packages/contracts/src/studio.ts#L59)；字段：`id`、`studentId`、`subject`、`kind`、`title`、`detail`、`href`、`at`、`status`、`requestKey?`、`referenceId?`、`actorId?`、`requestHash?`。
- `StudioPlanSessionKind`：[packages/contracts/src/studio.ts:75](../../../packages/contracts/src/studio.ts#L75)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioPlanSession`：[packages/contracts/src/studio.ts:76](../../../packages/contracts/src/studio.ts#L76)；字段：`id`、`index`、`title`、`kind`、`atomIds`、`objective`、`successCriterion`、`startsAt`、`endsAt`、`status`、`calendarEventId`、`evidenceBasis`、`reviewForSessionId?`、`reviewOffsetDays?`。
- `StudioStudyPlan`：[packages/contracts/src/studio.ts:93](../../../packages/contracts/src/studio.ts#L93)；字段：`id`、`studentId`、`subject`、`title`、`goal`、`targetDate`、`minutesPerDay`、`status`、`sessions`、`fingerprint`、`createdAt`、`updatedAt`、`revision`。
- `StudioStudyPlanPreview`：[packages/contracts/src/studio.ts:109](../../../packages/contracts/src/studio.ts#L109)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioPdfBBox`：[packages/contracts/src/studio.ts:114](../../../packages/contracts/src/studio.ts#L114)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioPdfStructureBlock`：[packages/contracts/src/studio.ts:116](../../../packages/contracts/src/studio.ts#L116)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioSourcePage`：[packages/contracts/src/studio.ts:121](../../../packages/contracts/src/studio.ts#L121)；字段：`page`、`text`、`textCharacters?`、`method?`、`confidence?`、`blocks?`、`warnings?`。
- `StudioMaterialStructure`：[packages/contracts/src/studio.ts:131](../../../packages/contracts/src/studio.ts#L131)；字段：`modelReviewedPages?`、`method`、`ocrPageCount`、`tableCount`、`formulaCount`、`confidence`、`reviewRequired`、`modelAssisted`、`modelSource`、`modelId?`、`reviewedAt?`、`warnings`。
- `StudioSourceMaterial`：[packages/contracts/src/studio.ts:146](../../../packages/contracts/src/studio.ts#L146)；字段：`contentVersion?`、`id`、`studentId`、`subject`、`ownerUserId?`、`kind?`、`originalFormat?`、`filename`、`title`、`pageCount`、`pages`、`sha256`、`byteSize`、`hasPageImages?`、`status?`、`structure?`、`processingTaskId?`、`error?`、`createdAt`、`updatedAt?`。
- `StudioLearningCitation`：[packages/contracts/src/studio.ts:169](../../../packages/contracts/src/studio.ts#L169)；字段：`atomId`、`atomName`、`materialId?`、`page?`、`label`。
- `StudioLearningSection`：[packages/contracts/src/studio.ts:177](../../../packages/contracts/src/studio.ts#L177)；字段：`id`、`kind`、`title`、`body`、`bullets`、`citations`。
- `StudioFlashcard`：[packages/contracts/src/studio.ts:186](../../../packages/contracts/src/studio.ts#L186)；字段：`id`、`prompt`、`answer`、`hint`、`citations`。
- `StudioLearningPack`：[packages/contracts/src/studio.ts:194](../../../packages/contracts/src/studio.ts#L194)；字段：`id`、`studentId`、`subject`、`title`、`atomIds`、`sourceMaterialId`、`sections`、`flashcards`、`practiceSteps`、`reviewDays`、`fingerprint`、`createdAt`、`updatedAt`。
- `StudioLearningPackPreview`：[packages/contracts/src/studio.ts:210](../../../packages/contracts/src/studio.ts#L210)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioFeedItem`：[packages/contracts/src/studio.ts:212](../../../packages/contracts/src/studio.ts#L212)；字段：`id`、`kind`、`priority`、`title`、`reason`、`href`。
- `StudioWhiteboardExhibit`：[packages/contracts/src/studio.ts:221](../../../packages/contracts/src/studio.ts#L221)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioWhiteboardFigure`：[packages/contracts/src/studio.ts:223](../../../packages/contracts/src/studio.ts#L223)；字段：`snapshotId`、`sha256`、`originalSha256`、`width`、`height`、`alt`、`caption`、`imageUrl`、`originalUrl`。
- `StudioWhiteboardScene`：[packages/contracts/src/studio.ts:225](../../../packages/contracts/src/studio.ts#L225)；字段：`id`、`kind`、`title`、`narration`、`body?`、`bullets?`、`visual?`、`exhibit?`、`figure?`、`targetAtomIds?`、`source?`、`durationMs`。
- `StudioWhiteboard`：[packages/contracts/src/studio.ts:240](../../../packages/contracts/src/studio.ts#L240)；字段：`id`、`studentId`、`subject`、`atomId`、`sourceMaterialId?`、`title`、`prompt`、`scenes`、`durationMs`、`width`、`height`、`fingerprint`、`createdAt`、`updatedAt`。
- `StudioConnectorKind`：[packages/contracts/src/studio.ts:257](../../../packages/contracts/src/studio.ts#L257)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioConnector`：[packages/contracts/src/studio.ts:258](../../../packages/contracts/src/studio.ts#L258)；字段：`id`、`studentId`、`subject`、`kind`、`label`、`sourceHost`、`status`、`lastSyncedAt`、`eventCount`、`lastError`、`version`、`createdAt`。
- `StudioScheduleEvent`：[packages/contracts/src/studio.ts:273](../../../packages/contracts/src/studio.ts#L273)；字段：`id`、`connectorId`、`studentId`、`subject`、`title`、`description`、`startsAt`、`endsAt`、`allDay`、`externalUid`、`source`、`createdAt`、`requestKey?`、`planId?`、`planSessionId?`、`status?`、`confirmed?`、`revision?`。
- `StudioIntegrationOverview`：[packages/contracts/src/studio.ts:294](../../../packages/contracts/src/studio.ts#L294)；字段：`connectors`、`events`。
- `StudioSpeechVoice`：[packages/contracts/src/studio.ts:299](../../../packages/contracts/src/studio.ts#L299)；字段：`id`、`label`、`description?`、`language?`、`classroomPreset?`。
- `StudioSpeechCapabilities`：[packages/contracts/src/studio.ts:301](../../../packages/contracts/src/studio.ts#L301)；字段：`available`、`provider`、`voices`、`preview?`、`defaultVoice`。
- `StudioOverview`：[packages/contracts/src/studio.ts:309](../../../packages/contracts/src/studio.ts#L309)；字段：`generatedAt`、`day`、`narrationAvailable`、`speech`、`children`、`selected`、`courses`、`feed`、`activities`、`plans`、`materials`、`studyPacks`、`whiteboards`、`integrations`。

### packages/contracts/src/topic-whiteboard-visual.ts

- `TopicWhiteboardFigure`：[packages/contracts/src/topic-whiteboard-visual.ts:21](../../../packages/contracts/src/topic-whiteboard-visual.ts#L21)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `TopicVisualPreflightInput`：[packages/contracts/src/topic-whiteboard-visual.ts:22](../../../packages/contracts/src/topic-whiteboard-visual.ts#L22)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `TopicVisualPrepareCommand`：[packages/contracts/src/topic-whiteboard-visual.ts:23](../../../packages/contracts/src/topic-whiteboard-visual.ts#L23)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `TopicVisualCapabilities`：[packages/contracts/src/topic-whiteboard-visual.ts:24](../../../packages/contracts/src/topic-whiteboard-visual.ts#L24)；字段：`available`、`editAvailable`、`modelId`、`reason`、`message`。
- `TopicVisualView`：[packages/contracts/src/topic-whiteboard-visual.ts:26](../../../packages/contracts/src/topic-whiteboard-visual.ts#L26)；字段：`id`、`draftId`、`sceneIndex`、`sceneTeachingFingerprint`、`purpose`、`requirements`、`operation`、`parentVisualId`、`changes`、`modelId`、`revision`、`status`、`selected`、`currentTeaching`、`contentReview`、`imageUrl`、`sha256`、`width`、`height`、`createdAt`、`updatedAt`、`task`、`receipt?`。

### packages/contracts/src/topic-whiteboard.ts

- `TopicWhiteboardAudience`：[packages/contracts/src/topic-whiteboard.ts:44](../../../packages/contracts/src/topic-whiteboard.ts#L44)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `TopicWhiteboardInput`：[packages/contracts/src/topic-whiteboard.ts:45](../../../packages/contracts/src/topic-whiteboard.ts#L45)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `TopicWhiteboardContent`：[packages/contracts/src/topic-whiteboard.ts:46](../../../packages/contracts/src/topic-whiteboard.ts#L46)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `TopicWhiteboardReview`：[packages/contracts/src/topic-whiteboard.ts:47](../../../packages/contracts/src/topic-whiteboard.ts#L47)；字段：`decision`、`issues`、`modelId`、`inputFingerprint`、`outputFingerprint`、`at`、`current`。
- `TopicWhiteboardDraftStatus`：[packages/contracts/src/topic-whiteboard.ts:49](../../../packages/contracts/src/topic-whiteboard.ts#L49)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `TopicWhiteboardDraftView`：[packages/contracts/src/topic-whiteboard.ts:50](../../../packages/contracts/src/topic-whiteboard.ts#L50)；字段：`id`、`audience`、`studentId`、`subject`、`prompt`、`objective`、`modelId`、`modelName`、`status`、`stage`、`revision`、`generation`、`task`、`originalContent`、`content`、`contentFingerprint`、`review`、`whiteboardId`、`teacherReviewStatus`、`formalMeasurementEligible`、`createdAt`、`updatedAt`、`receipt?`。
- `StudioTopicWhiteboard`：[packages/contracts/src/topic-whiteboard.ts:61](../../../packages/contracts/src/topic-whiteboard.ts#L61)；字段：`id`、`kind`、`studentId`、`subject`、`title`、`prompt`、`scenes`、`durationMs`、`width`、`height`、`fingerprint`、`createdAt`、`updatedAt`、`origin`。

### packages/contracts/src/whiteboard-speech.ts

- `WhiteboardSpeechUnit`：[packages/contracts/src/whiteboard-speech.ts:5](../../../packages/contracts/src/whiteboard-speech.ts#L5)；字段：`id`、`sceneId`、`start`、`end`、`text`、`estimatedMs`、`visibleBulletIndices`。
- `WhiteboardPresentation`：[packages/contracts/src/whiteboard-speech.ts:9](../../../packages/contracts/src/whiteboard-speech.ts#L9)；字段：`version`、`fingerprint`、`units`。
- `WhiteboardTimelineEntry`：[packages/contracts/src/whiteboard-speech.ts:12](../../../packages/contracts/src/whiteboard-speech.ts#L12)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `WhiteboardTimeline`：[packages/contracts/src/whiteboard-speech.ts:13](../../../packages/contracts/src/whiteboard-speech.ts#L13)；字段：`kind`、`speed`、`durationMs`、`tailMs`、`entries`。

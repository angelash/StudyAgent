# 领域集合与契约索引

源码基线：`5551169f650474d34e9b1742b09b990cceef2beb`。这些是领域文档集合，并不代表每个集合对应一张独立 SQL 表。

## 领域集合

- `users` → `InMemoryUserAccount`；[apps/api/src/infrastructure/in-memory-store.service.ts:342](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L342)。
- `paperPublications` → `PaperPublication`；[apps/api/src/infrastructure/in-memory-store.service.ts:343](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L343)。
- `libraryBookmarks` → `LibraryBookmark`；[apps/api/src/infrastructure/in-memory-store.service.ts:344](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L344)。
- `practiceSessions` → `PracticeSession`；[apps/api/src/infrastructure/in-memory-store.service.ts:345](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L345)。
- `practiceAttempts` → `PracticeAttempt`；[apps/api/src/infrastructure/in-memory-store.service.ts:346](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L346)。
- `practiceHints` → `PracticeHint`；[apps/api/src/infrastructure/in-memory-store.service.ts:347](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L347)。
- `practiceScoringRevisions` → `ScoringRevision`；[apps/api/src/infrastructure/in-memory-store.service.ts:348](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L348)。
- `teacherAssignments` → `TeacherStudentAssignment`；[apps/api/src/infrastructure/in-memory-store.service.ts:349](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L349)。
- `evidenceFeedback` → `EvidenceFeedback`；[apps/api/src/infrastructure/in-memory-store.service.ts:350](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L350)。
- `importFiles` → `ImportFile`；[apps/api/src/infrastructure/in-memory-store.service.ts:351](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L351)。
- `processingArtifacts` → `ProcessingArtifact`；[apps/api/src/infrastructure/in-memory-store.service.ts:352](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L352)。
- `importPages` → `ImportPageEvidenceRef`；[apps/api/src/infrastructure/in-memory-store.service.ts:353](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L353)。
- `guidancePlanRevisions` → `GuidancePlanRevision`；[apps/api/src/infrastructure/in-memory-store.service.ts:354](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L354)。
- `studentLearningAccess` → `StudentLearningAccess`；[apps/api/src/infrastructure/in-memory-store.service.ts:355](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L355)。
- `studentLearningCodes` → `StudentLearningCode`；[apps/api/src/infrastructure/in-memory-store.service.ts:356](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L356)。
- `studentAccessRevisions` → `StudentAccessRevision`；[apps/api/src/infrastructure/in-memory-store.service.ts:357](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L357)。
- `studentProgressProposals` → `StudentProgressProposal`；[apps/api/src/infrastructure/in-memory-store.service.ts:358](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L358)。
- `privacyRequests` → `PrivacyReceipt`；[apps/api/src/infrastructure/in-memory-store.service.ts:359](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L359)。
- `studentMedia` → `StudentMedia`；[apps/api/src/infrastructure/in-memory-store.service.ts:360](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L360)。
- `sessions` → `InMemoryAuthSession`；[apps/api/src/infrastructure/in-memory-store.service.ts:361](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L361)。
- `students` → `StudentProfile`；[apps/api/src/infrastructure/in-memory-store.service.ts:362](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L362)。
- `bindings` → `ParentStudentBinding`；[apps/api/src/infrastructure/in-memory-store.service.ts:363](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L363)。
- `studentInvitations` → `StudentInvitation`；[apps/api/src/infrastructure/in-memory-store.service.ts:364](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L364)。
- `subjectEnrollments` → `SubjectEnrollment`；[apps/api/src/infrastructure/in-memory-store.service.ts:365](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L365)。
- `textbookVolumes` → `TextbookVolume`；[apps/api/src/infrastructure/in-memory-store.service.ts:366](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L366)。
- `textbookUnits` → `TextbookUnit`；[apps/api/src/infrastructure/in-memory-store.service.ts:367](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L367)。
- `textbookLessons` → `TextbookLesson`；[apps/api/src/infrastructure/in-memory-store.service.ts:368](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L368)。
- `knowledgePoints` → `KnowledgePoint`；[apps/api/src/infrastructure/in-memory-store.service.ts:369](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L369)。
- `questions` → `Question`；[apps/api/src/infrastructure/in-memory-store.service.ts:370](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L370)。
- `questionDocuments` → `QuestionDocument`；[apps/api/src/infrastructure/in-memory-store.service.ts:371](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L371)。
- `questionAnswerSchemas` → `QuestionAnswerSchema`；[apps/api/src/infrastructure/in-memory-store.service.ts:372](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L372)。
- `questionSources` → `QuestionSourceRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:373](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L373)。
- `questionImportJobs` → `QuestionImportJob`；[apps/api/src/infrastructure/in-memory-store.service.ts:374](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L374)。
- `questionImportRecords` → `QuestionImportRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:375](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L375)。
- `assessments` → `AssessmentSession`；[apps/api/src/infrastructure/in-memory-store.service.ts:376](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L376)。
- `assessmentAnswers` → `AssessmentAnswerRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:377](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L377)。
- `assessmentResults` → `AssessmentResult`；[apps/api/src/infrastructure/in-memory-store.service.ts:378](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L378)。
- `studyPlans` → `StudyPlan`；[apps/api/src/infrastructure/in-memory-store.service.ts:379](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L379)。
- `missions` → `DailyMissionInternal`；[apps/api/src/infrastructure/in-memory-store.service.ts:380](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L380)。
- `missionAnswers` → `MissionAnswerRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:381](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L381)。
- `assistantSessions` → `AssistantSession & { ownerUserId: string; scopeKey?: string }`；[apps/api/src/infrastructure/in-memory-store.service.ts:382](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L382)。
- `assistantMessages` → `AssistantMessage`；[apps/api/src/infrastructure/in-memory-store.service.ts:383](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L383)。
- `aiInsights` → `AIInsightRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:384](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L384)。
- `events` → `Record<string, unknown>`；[apps/api/src/infrastructure/in-memory-store.service.ts:385](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L385)。
- `knowledgeAtoms` → `KnowledgeAtom`；[apps/api/src/infrastructure/in-memory-store.service.ts:386](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L386)。
- `learningScopes` → `LearningScope`；[apps/api/src/infrastructure/in-memory-store.service.ts:387](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L387)。
- `measurementItems` → `MeasurementItem`；[apps/api/src/infrastructure/in-memory-store.service.ts:388](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L388)。
- `measurementCandidates` → `MeasurementContentCandidate`；[apps/api/src/infrastructure/in-memory-store.service.ts:389](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L389)。
- `mistakeNotebookEntries` → `MistakeNotebookEntry`；[apps/api/src/infrastructure/in-memory-store.service.ts:390](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L390)。
- `textbookAtomMappings` → `TextbookAtomMapping`；[apps/api/src/infrastructure/in-memory-store.service.ts:391](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L391)。
- `curriculumRevisions` → `CurriculumRevision`；[apps/api/src/infrastructure/in-memory-store.service.ts:392](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L392)。
- `diagnosticSessions` → `DiagnosticSession`；[apps/api/src/infrastructure/in-memory-store.service.ts:393](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L393)。
- `diagnosticBlueprints` → `DiagnosticBlueprintReservation`；[apps/api/src/infrastructure/in-memory-store.service.ts:394](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L394)。
- `diagnosticResponses` → `DiagnosticResponse`；[apps/api/src/infrastructure/in-memory-store.service.ts:395](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L395)。
- `diagnosticHypotheses` → `DiagnosticHypothesis`；[apps/api/src/infrastructure/in-memory-store.service.ts:396](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L396)。
- `diagnosticPlans` → `DiagnosticGuidancePlan`；[apps/api/src/infrastructure/in-memory-store.service.ts:397](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L397)。
- `reviewTasks` → `ReviewTask`；[apps/api/src/infrastructure/in-memory-store.service.ts:398](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L398)。
- `scoringRevisions` → `ScoringRevision`；[apps/api/src/infrastructure/in-memory-store.service.ts:399](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L399)。
- `diagnosticHints` → `{ id: string; sessionId: string; itemId: string; level: number; at: string }`；[apps/api/src/infrastructure/in-memory-store.service.ts:400](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L400)。
- `diagnosticReports` → `{ id: string; sessionId: string; version: number; createdAt: string; report: DiagnosticReport; reanalysis?: { actorId: string; requestKey: string; inputHash: string } }`；[apps/api/src/infrastructure/in-memory-store.service.ts:401](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L401)。
- `diagnosticDrafts` → `{ id: string; sessionId: string; itemId: string; answer: unknown; updatedAt: string }`；[apps/api/src/infrastructure/in-memory-store.service.ts:403](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L403)。
- `gespLearningScopes` → `GespLearningScope`；[apps/api/src/infrastructure/in-memory-store.service.ts:404](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L404)。
- `gespLearningScopeRevisions` → `GespLearningScopeRevision`；[apps/api/src/infrastructure/in-memory-store.service.ts:405](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L405)。
- `gespCodeSubmissions` → `GespCodeSubmissionReceipt`；[apps/api/src/infrastructure/in-memory-store.service.ts:406](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L406)。
- `gespProbeSubmissions` → `GespProbeSubmissionReceipt`；[apps/api/src/infrastructure/in-memory-store.service.ts:407](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L407)。
- `gespHintEvents` → `GespHintEvent`；[apps/api/src/infrastructure/in-memory-store.service.ts:408](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L408)。
- `gespGuidancePlans` → `GespGuidancePlan`；[apps/api/src/infrastructure/in-memory-store.service.ts:409](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L409)。
- `gespGuidancePlanRevisions` → `GespGuidancePlanRevision`；[apps/api/src/infrastructure/in-memory-store.service.ts:410](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L410)。
- `gespReviewTasks` → `GespReviewTask`；[apps/api/src/infrastructure/in-memory-store.service.ts:411](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L411)。
- `gespTaskReviews` → `GespTaskReview`；[apps/api/src/infrastructure/in-memory-store.service.ts:412](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L412)。
- `gespTaskReviewRevisions` → `GespTaskReviewRevision`；[apps/api/src/infrastructure/in-memory-store.service.ts:413](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L413)。
- `studioCourses` → `StudioCourse`；[apps/api/src/infrastructure/in-memory-store.service.ts:414](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L414)。
- `classroomSessions` → `ClassroomSessionRecord`；[apps/api/src/infrastructure/in-memory-store.service.ts:415](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L415)。
- `studioActivities` → `StudioActivity`；[apps/api/src/infrastructure/in-memory-store.service.ts:416](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L416)。
- `studioStudyPlans` → `StudioStudyPlan`；[apps/api/src/infrastructure/in-memory-store.service.ts:417](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L417)。
- `studioSourceMaterials` → `StudioSourceMaterial`；[apps/api/src/infrastructure/in-memory-store.service.ts:418](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L418)。
- `studioLearningPacks` → `StudioLearningPack`；[apps/api/src/infrastructure/in-memory-store.service.ts:419](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L419)。
- `studioWhiteboards` → `StudioWhiteboard`；[apps/api/src/infrastructure/in-memory-store.service.ts:420](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L420)。
- `studioConnectors` → `StudioConnector & { encryptedFeedUrl: string; requestKey?: string; requestHash?: string; createdBy?: string }`；[apps/api/src/infrastructure/in-memory-store.service.ts:421](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L421)。
- `studioScheduleEvents` → `StudioScheduleEvent & { createdBy?: string; requestHash?: string }`；[apps/api/src/infrastructure/in-memory-store.service.ts:422](../../../apps/api/src/infrastructure/in-memory-store.service.ts#L422)。

## 共享数据契约

### packages/contracts/src/ai-models.ts

- `XiaojiuModelOption`：[packages/contracts/src/ai-models.ts:1](../../../packages/contracts/src/ai-models.ts#L1)；字段：`id`、`label`、`catalogLabel`、`description`、`provider`、`providerKey`、`primary`、`default`、`inputModalities`。
- `XiaojiuModelCatalog`：[packages/contracts/src/ai-models.ts:13](../../../packages/contracts/src/ai-models.ts#L13)；字段：`defaultModel`、`models`。

### packages/contracts/src/answer-protocol.ts

- `InteractionChoice`：[packages/contracts/src/answer-protocol.ts:4](../../../packages/contracts/src/answer-protocol.ts#L4)；字段：`id`、`label`。
- `HotspotTarget`：[packages/contracts/src/answer-protocol.ts:5](../../../packages/contracts/src/answer-protocol.ts#L5)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `DrawingPoint`：[packages/contracts/src/answer-protocol.ts:6](../../../packages/contracts/src/answer-protocol.ts#L6)；字段：`x`、`y`。
- `DrawingStroke`：[packages/contracts/src/answer-protocol.ts:7](../../../packages/contracts/src/answer-protocol.ts#L7)；字段：`points`。
- `InputConfiguration`：[packages/contracts/src/answer-protocol.ts:8](../../../packages/contracts/src/answer-protocol.ts#L8)；字段：`supported`、`reason`、`mode`、`items`、`groups`、`left`、`right`、`rows`、`columns`、`targets`、`imageUrl`、`imageAlt`。

### packages/contracts/src/classroom.ts

- `ClassroomDiagram`：[packages/contracts/src/classroom.ts:3](../../../packages/contracts/src/classroom.ts#L3)；字段：`kind`、`title`、`labels`、`values?`、`captions?`。
- `ClassroomBlock`：[packages/contracts/src/classroom.ts:4](../../../packages/contracts/src/classroom.ts#L4)；字段：`id`、`kind`、`text`、`atSentence?`、`items?`、`image?`、`diagram?`、`code?`、`table?`。
- `ClassroomStep`：[packages/contracts/src/classroom.ts:7](../../../packages/contracts/src/classroom.ts#L7)；字段：`id`、`title`、`narration`、`blocks`、`phase`、`durationMs`。
- `ClassroomQuestion`：[packages/contracts/src/classroom.ts:9](../../../packages/contracts/src/classroom.ts#L9)；字段：`id`、`prompt`、`options`、`hint`、`topic?`、`purpose?`。
- `ClassroomLesson`：[packages/contracts/src/classroom.ts:11](../../../packages/contracts/src/classroom.ts#L11)；字段：`id`、`title`、`objective`、`lectureId`、`steps`、`questions`、`verificationHref?`、`assessment?`。
- `ClassroomLecture`：[packages/contracts/src/classroom.ts:14](../../../packages/contracts/src/classroom.ts#L14)；字段：`id`、`title`、`description`、`lessons`。
- `ClassroomUnit`：[packages/contracts/src/classroom.ts:15](../../../packages/contracts/src/classroom.ts#L15)；字段：`id`、`title`、`objective`、`lectures`、`project`。
- `ClassroomCourse`：[packages/contracts/src/classroom.ts:17](../../../packages/contracts/src/classroom.ts#L17)；字段：`id`、`title`、`description`、`level`、`version`、`provenance`、`units`、`references`。
- `ClassroomAnswerReceipt`：[packages/contracts/src/classroom.ts:19](../../../packages/contracts/src/classroom.ts#L19)；字段：`questionId`、`selectedIndex`、`correct`、`skipped`、`explanation`、`hintUsed`、`at`。
- `ClassroomChatMessage`：[packages/contracts/src/classroom.ts:21](../../../packages/contracts/src/classroom.ts#L21)；字段：`id`、`role`、`content`、`at`、`modelName?`、`board?`。
- `ClassroomSession`：[packages/contracts/src/classroom.ts:23](../../../packages/contracts/src/classroom.ts#L23)；字段：`id`、`ownerUserId`、`studentId`、`courseId`、`studioCourseId?`、`lessonId`、`contentFingerprint`、`lesson`、`cursor`、`revealed`、`sentenceCursor?`、`status`、`revision`、`messages`、`answers`、`projectDraft`、`hintedQuestionIds?`、`createdAt`、`updatedAt`。
- `ClassroomSessionView`：[packages/contracts/src/classroom.ts:29](../../../packages/contracts/src/classroom.ts#L29)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `ClassroomCatalog`：[packages/contracts/src/classroom.ts:31](../../../packages/contracts/src/classroom.ts#L31)；字段：`course`、`progress`、`archivedSessions?`。
- `ClassroomPracticeSummary`：[packages/contracts/src/classroom.ts:35](../../../packages/contracts/src/classroom.ts#L35)；字段：`total`、`answered`、`remaining`、`correct`、`incorrect`、`skipped`、`assisted`、`independentCorrect`、`complete`、`nextQuestionIndex`、`reviewQuestionIds`。

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

- `MeasurementDimension`：[packages/contracts/src/diagnostics.ts:6](../../../packages/contracts/src/diagnostics.ts#L6)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `TeachingVisual`：[packages/contracts/src/diagnostics.ts:35](../../../packages/contracts/src/diagnostics.ts#L35)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `AtomTeaching`：[packages/contracts/src/diagnostics.ts:52](../../../packages/contracts/src/diagnostics.ts#L52)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `KnowledgeAtom`：[packages/contracts/src/diagnostics.ts:63](../../../packages/contracts/src/diagnostics.ts#L63)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `LearningScope`：[packages/contracts/src/diagnostics.ts:80](../../../packages/contracts/src/diagnostics.ts#L80)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `ComponentBinding`：[packages/contracts/src/diagnostics.ts:88](../../../packages/contracts/src/diagnostics.ts#L88)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `MeasurementItem`：[packages/contracts/src/diagnostics.ts:101](../../../packages/contracts/src/diagnostics.ts#L101)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `DiagnosticStart`：[packages/contracts/src/diagnostics.ts:109](../../../packages/contracts/src/diagnostics.ts#L109)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `DiagnosticVerificationBlueprint`：[packages/contracts/src/diagnostics.ts:111](../../../packages/contracts/src/diagnostics.ts#L111)；字段：`familyIdentityVersion?`、`hypothesisId`、`title`、`cause`、`ruleVersion`、`sourceRuleVersion`、`basisFingerprint`、`supportCondition`、`counterCondition`、`undecidedCondition`、`fullyCovered`、`groups`。
- `DiagnosticVerificationResult`：[packages/contracts/src/diagnostics.ts:118](../../../packages/contracts/src/diagnostics.ts#L118)；字段：`familyIdentityVersion?`、`distinctFamilyRequirementsMet?`、`blueprint`、`independentObservationsComplete`、`groups`、`notice`。
- `AssessmentBlueprint`：[packages/contracts/src/diagnostics.ts:126](../../../packages/contracts/src/diagnostics.ts#L126)；字段：`familyIdentityVersion?`、`version`、`title`、`intent`、`focus`、`itemLimit`、`minutesLimit`、`expectedSeconds`、`groupSize`、`stopReason`、`stopRule`、`targetAtomIds`、`prerequisiteAtomIds`、`groups`、`dimensions`、`warnings`、`verification?`、`routing?`。
- `DiagnosticBlueprintReservation`：[packages/contracts/src/diagnostics.ts:138](../../../packages/contracts/src/diagnostics.ts#L138)；字段：`id`、`studentId`、`actorId`、`command`、`seed`、`fingerprint`、`createdAt`、`expiresAt`、`sessionId`、`requestHash`、`blueprint`、`scopeSnapshot`、`coverage`、`atomNames`、`itemCount`。
- `DiagnosticBlueprintView`：[packages/contracts/src/diagnostics.ts:144](../../../packages/contracts/src/diagnostics.ts#L144)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `DiagnosticSession`：[packages/contracts/src/diagnostics.ts:148](../../../packages/contracts/src/diagnostics.ts#L148)；字段：`id`、`studentId`、`subject`、`intent`、`status`、`scopeSnapshot`、`blueprint?`、`revision?`、`endedAt?`、`stateHistory?`、`atomSnapshots?`、`componentAtomSnapshots?`、`itemIds`、`itemSnapshots`、`questionSnapshots`、`coverage`、`selectionReasons`、`seed`、`algorithmVersion`、`startedAt`、`completedAt`、`hypothesisId`、`reviewTaskId`、`exposedQuestionIds?`、`planId?`、`planRevision?`、`routing?`。
- `DiagnosticRoutingDecision`：[packages/contracts/src/diagnostics.ts:168](../../../packages/contracts/src/diagnostics.ts#L168)；字段：`sequence`、`itemId`、`focusAtomId`、`rule`、`reason`、`at`、`basis`。
- `DiagnosticRouting`：[packages/contracts/src/diagnostics.ts:174](../../../packages/contracts/src/diagnostics.ts#L174)；字段：`version`、`initialItemIds`、`currentItemId`、`decisions`。
- `DiagnosticResponseInput`：[packages/contracts/src/diagnostics.ts:183](../../../packages/contracts/src/diagnostics.ts#L183)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `DiagnosticResponse`：[packages/contracts/src/diagnostics.ts:184](../../../packages/contracts/src/diagnostics.ts#L184)；字段：`id`、`sessionId`、`studentId`、`itemId`、`questionId`、`atomId`、`family`、`dimension`、`questionVersion`、`mappingVersion`、`answer`、`score`、`correct`、`status`、`disposition`、`elapsedMs`、`hintLevel`、`observationCode`、`gradingReason`、`retentionDelayDays`、`submittedAt`、`gradingVersion`、`requestKey`、`priorExposure?`、`atomVersion?`、`atomDefinitionFingerprint?`、`scoreDetails?`。
- `ResponseScoreDetail`：[packages/contracts/src/diagnostics.ts:197](../../../packages/contracts/src/diagnostics.ts#L197)；字段：`key`、`label`、`score`、`origin`、`observation?`。
- `DiagnosticObservation`：[packages/contracts/src/diagnostics.ts:198](../../../packages/contracts/src/diagnostics.ts#L198)；字段：`responseId`、`atomId`、`kind`、`description`、`details`。
- `ComponentObservation`：[packages/contracts/src/diagnostics.ts:201](../../../packages/contracts/src/diagnostics.ts#L201)；字段：`responseId`、`bindingId`、`sourceAtomId`、`atomId`、`atomName`、`state`、`description`、`nextAction`、`scoreDetails`、`upstreamDetails`、`independentEstimateContribution`、`ruleVersion`、`targetDefinitionFingerprint`。
- `ScoringRevision`：[packages/contracts/src/diagnostics.ts:208](../../../packages/contracts/src/diagnostics.ts#L208)；字段：`id`、`responseId`、`score`、`reason`、`reviewerId`、`createdAt`、`version`、`requestKey?`、`requestHash?`、`ratings?`、`rubricSnapshot?`。
- `MasteryEstimate`：[packages/contracts/src/diagnostics.ts:216](../../../packages/contracts/src/diagnostics.ts#L216)；字段：`familyIdentityVersion?`、`atomId`、`atomName`、`grade`、`mastery`、`lower`、`upper`、`status`、`rawCorrect`、`scoredCount`、`effectiveSamples`、`independentFamilies`、`dimensions`、`independentRate`、`transferVerified`、`retentionVerified`、`evidenceIds`、`lastMeasuredAt`、`algorithmVersion`。
- `DiagnosticHypothesis`：[packages/contracts/src/diagnostics.ts:226](../../../packages/contracts/src/diagnostics.ts#L226)；字段：`familyIdentityVersion?`、`id`、`studentId`、`subject`、`atomId`、`cause`、`status`、`title`、`observation`、`explanation`、`alternatives`、`supportingEvidenceIds`、`counterEvidenceIds`、`probeAtomIds`、`reportedEvidenceIds?`、`verification?`、`nextAction`、`confidence`、`ruleVersion`、`updatedAt`、`history`、`atomDefinitionFingerprint?`。
- `LearningSourceCitation`：[packages/contracts/src/diagnostics.ts:241](../../../packages/contracts/src/diagnostics.ts#L241)；字段：`id`、`kind`、`bookId`、`bookVersion`、`title`、`edition`、`chapterName`、`lessonId`、`lessonName`、`mappingId`、`mappingVersion`、`pageStart`、`pageEnd`、`locatorStatus`、`sourceAvailability`、`note`。
- `GuidanceAction`：[packages/contracts/src/diagnostics.ts:260](../../../packages/contracts/src/diagnostics.ts#L260)；字段：`id`、`atomId`、`hypothesisId`、`evidenceIds`、`title`、`activity`、`minutes`、`successCriterion`、`resourceQuestionIds`、`retestAt`、`teachingSnapshot?`、`sourceCitations?`。
- `DiagnosticGuidancePlan`：[packages/contracts/src/diagnostics.ts:267](../../../packages/contracts/src/diagnostics.ts#L267)；字段：`id`、`studentId`、`subject`、`baselineSessionId`、`version`、`source`、`status`、`minutesPerDay`、`summary`、`actions`、`evidenceIds`、`createdAt`、`aiStatus`、`revision?`、`baselineReportVersion?`、`activatedAt?`、`retrospectiveReview?`。
- `GuidancePlanView`：[packages/contracts/src/diagnostics.ts:275](../../../packages/contracts/src/diagnostics.ts#L275)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `GuidancePlanRevision`：[packages/contracts/src/diagnostics.ts:281](../../../packages/contracts/src/diagnostics.ts#L281)；字段：`id`、`planId`、`revision`、`kind`、`at`、`actorId`、`reason`、`snapshot`、`requestKey?`、`inputHash?`。
- `ReviewTask`：[packages/contracts/src/diagnostics.ts:286](../../../packages/contracts/src/diagnostics.ts#L286)；字段：`id`、`planId`、`studentId`、`subject`、`atomId`、`intervalDays`、`dueAt`、`status`、`sessionId`、`planRevision?`、`baselineReportVersion?`、`earliestDueAt?`、`scheduleRevision?`、`scheduleHistory?`。
- `DiagnosticReport`：[packages/contracts/src/diagnostics.ts:294](../../../packages/contracts/src/diagnostics.ts#L294)；字段：`familyIdentityVersion?`、`sessionId`、`studentId`、`subject`、`status`、`answeredCount`、`totalCount`、`scoredCount`、`pendingReviewCount`、`rawScore`、`coverage`、`estimates`、`hypotheses`、`evidence`、`unmeasuredAtomIds`、`observations?`、`componentObservations?`、`verification?`、`summary`、`modelNotice`、`scopeSnapshot?`、`version?`、`generatedAt?`、`revisionReason?`、`scoringRevisionIds?`、`definitionContext?`。

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

- `PracticeAttempt`：[packages/contracts/src/learning.ts:3](../../../packages/contracts/src/learning.ts#L3)；字段：`id`、`sessionId`、`questionId`、`requestKey`、`answer`、`disposition`、`score`、`correct`、`status`、`hintLevel`、`attempt`、`solutionExposedBefore`、`elapsedMs`、`reason`、`submittedAt`。
- `PracticeSession`：[packages/contracts/src/learning.ts:9](../../../packages/contracts/src/learning.ts#L9)；字段：`id`、`studentId`、`subject`、`planId`、`actionId`、`atomId`、`day`、`status`、`questionIds`、`snapshots`、`createdAt`、`completedAt`、`drafts?`、`actionSnapshot?`、`planRevision?`、`snapshotOrigin?`、`origin?`、`notebookEntryId?`、`atomSnapshot?`、`sourceAssessmentId?`。
- `PracticeHint`：[packages/contracts/src/learning.ts:19](../../../packages/contracts/src/learning.ts#L19)；字段：`id`、`sessionId`、`questionId`、`level`、`at`。
- `LearningMemory`：[packages/contracts/src/learning.ts:21](../../../packages/contracts/src/learning.ts#L21)；字段：`generatedAt`、`revision`、`student`、`subject`、`consent`、`summary`、`facts`、`unknowns`、`openHypotheses`、`feed`。
- `NotebookMetadata`：[packages/contracts/src/learning.ts:31](../../../packages/contracts/src/learning.ts#L31)；字段：`tags`、`favorite`、`removed`、`errorSteps`、`reflection`、`reviewState`。
- `MistakeNotebookEntry`：[packages/contracts/src/learning.ts:32](../../../packages/contracts/src/learning.ts#L32)；字段：`id`、`studentId`、`subject`、`kind`、`responseId`、`questionId`、`atomId`、`version`、`metadata`、`createdAt`、`updatedAt`、`redoSessionIds`、`verificationBlueprintIds`、`history`。

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

### packages/contracts/src/reviews.ts

- `EvidenceKind`：[packages/contracts/src/reviews.ts:4](../../../packages/contracts/src/reviews.ts#L4)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `RubricRating`：[packages/contracts/src/reviews.ts:10](../../../packages/contracts/src/reviews.ts#L10)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `ScoringReviewInput`：[packages/contracts/src/reviews.ts:17](../../../packages/contracts/src/reviews.ts#L17)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `TeacherStudentAssignment`：[packages/contracts/src/reviews.ts:18](../../../packages/contracts/src/reviews.ts#L18)；字段：`id`、`studentId`、`teacherUserId`、`grantedBy`、`permission`、`status`、`createdAt`、`revokedAt`、`revokedBy`。
- `EvidenceFeedback`：[packages/contracts/src/reviews.ts:28](../../../packages/contracts/src/reviews.ts#L28)；字段：`id`、`kind`、`responseId`、`studentId`、`subject`、`createdBy`、`category`、`message`、`status`、`version`、`requestKey`、`createdAt`、`updatedAt`、`history`。

### packages/contracts/src/student-access.ts

- `StudentLearningAccess`：[packages/contracts/src/student-access.ts:1](../../../packages/contracts/src/student-access.ts#L1)；字段：`id`、`studentId`、`userId`、`status`、`version`、`createdAt`、`updatedAt`、`createdBy`。
- `StudentLearningCode`：[packages/contracts/src/student-access.ts:5](../../../packages/contracts/src/student-access.ts#L5)；字段：`id`、`studentId`、`accessVersion`、`tokenHash`、`createdBy`、`createdAt`、`expiresAt`、`usedAt`、`revokedAt`、`requestKey`、`requestHash`。
- `StudentAccessRevision`：[packages/contracts/src/student-access.ts:9](../../../packages/contracts/src/student-access.ts#L9)；字段：`id`、`studentId`、`version`、`status`、`actorId`、`at`、`reason`、`requestKey`、`requestHash`。
- `StudentProgressProposal`：[packages/contracts/src/student-access.ts:13](../../../packages/contracts/src/student-access.ts#L13)；字段：`id`、`studentId`、`proposedBy`、`scope`、`baseScopeVersion`、`version`、`status`、`createdAt`、`requestKey`、`requestHash`、`decidedAt?`、`decidedBy?`、`decisionNote?`、`decisionRequestKey?`、`decisionHash?`、`acceptedScopeId?`、`knowledgeSnapshot?`。

### packages/contracts/src/student-media.ts

- `StudentMediaTarget`：[packages/contracts/src/student-media.ts:4](../../../packages/contracts/src/student-media.ts#L4)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudentMedia`：[packages/contracts/src/student-media.ts:7](../../../packages/contracts/src/student-media.ts#L7)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudentMediaView`：[packages/contracts/src/student-media.ts:12](../../../packages/contracts/src/student-media.ts#L12)；别名、联合类型或 Zod 推导类型，具体约束查看源码。

### packages/contracts/src/studio.ts

- `StudioSubject`：[packages/contracts/src/studio.ts:3](../../../packages/contracts/src/studio.ts#L3)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioLessonKind`：[packages/contracts/src/studio.ts:4](../../../packages/contracts/src/studio.ts#L4)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioLessonState`：[packages/contracts/src/studio.ts:5](../../../packages/contracts/src/studio.ts#L5)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioLesson`：[packages/contracts/src/studio.ts:7](../../../packages/contracts/src/studio.ts#L7)；字段：`id`、`atomId`、`title`、`objective`、`kind`、`state`、`href`、`teaching?`。
- `StudioUnit`：[packages/contracts/src/studio.ts:18](../../../packages/contracts/src/studio.ts#L18)；字段：`id`、`title`、`objective`、`lessons`。
- `StudioCourse`：[packages/contracts/src/studio.ts:25](../../../packages/contracts/src/studio.ts#L25)；字段：`id`、`studentId`、`subject`、`grade`、`term`、`title`、`description`、`objective`、`status`、`source`、`scopeVersion`、`textbookVersion`、`focusAtomIds`、`units`、`materials`、`fingerprint`、`createdAt`、`updatedAt`、`learningProgress?`。
- `StudioCoursePreview`：[packages/contracts/src/studio.ts:47](../../../packages/contracts/src/studio.ts#L47)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioActivity`：[packages/contracts/src/studio.ts:49](../../../packages/contracts/src/studio.ts#L49)；字段：`id`、`studentId`、`subject`、`kind`、`title`、`detail`、`href`、`at`、`status`、`requestKey?`、`referenceId?`。
- `StudioPlanSessionKind`：[packages/contracts/src/studio.ts:63](../../../packages/contracts/src/studio.ts#L63)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioPlanSession`：[packages/contracts/src/studio.ts:64](../../../packages/contracts/src/studio.ts#L64)；字段：`id`、`index`、`title`、`kind`、`atomIds`、`objective`、`successCriterion`、`startsAt`、`endsAt`、`status`、`calendarEventId`、`evidenceBasis`、`reviewForSessionId?`、`reviewOffsetDays?`。
- `StudioStudyPlan`：[packages/contracts/src/studio.ts:81](../../../packages/contracts/src/studio.ts#L81)；字段：`id`、`studentId`、`subject`、`title`、`goal`、`targetDate`、`minutesPerDay`、`status`、`sessions`、`fingerprint`、`createdAt`、`updatedAt`、`revision`。
- `StudioStudyPlanPreview`：[packages/contracts/src/studio.ts:97](../../../packages/contracts/src/studio.ts#L97)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioPdfBBox`：[packages/contracts/src/studio.ts:102](../../../packages/contracts/src/studio.ts#L102)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioPdfStructureBlock`：[packages/contracts/src/studio.ts:104](../../../packages/contracts/src/studio.ts#L104)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioSourcePage`：[packages/contracts/src/studio.ts:109](../../../packages/contracts/src/studio.ts#L109)；字段：`page`、`text`、`method?`、`confidence?`、`blocks?`、`warnings?`。
- `StudioMaterialStructure`：[packages/contracts/src/studio.ts:118](../../../packages/contracts/src/studio.ts#L118)；字段：`method`、`ocrPageCount`、`tableCount`、`formulaCount`、`confidence`、`reviewRequired`、`modelAssisted`、`modelSource`、`modelId?`、`reviewedAt?`、`warnings`。
- `StudioSourceMaterial`：[packages/contracts/src/studio.ts:132](../../../packages/contracts/src/studio.ts#L132)；字段：`id`、`studentId`、`subject`、`filename`、`title`、`pageCount`、`pages`、`sha256`、`byteSize`、`hasPageImages?`、`status?`、`structure?`、`processingTaskId?`、`error?`、`createdAt`、`updatedAt?`。
- `StudioLearningCitation`：[packages/contracts/src/studio.ts:151](../../../packages/contracts/src/studio.ts#L151)；字段：`atomId`、`atomName`、`materialId?`、`page?`、`label`。
- `StudioLearningSection`：[packages/contracts/src/studio.ts:159](../../../packages/contracts/src/studio.ts#L159)；字段：`id`、`kind`、`title`、`body`、`bullets`、`citations`。
- `StudioFlashcard`：[packages/contracts/src/studio.ts:168](../../../packages/contracts/src/studio.ts#L168)；字段：`id`、`prompt`、`answer`、`hint`、`citations`。
- `StudioLearningPack`：[packages/contracts/src/studio.ts:176](../../../packages/contracts/src/studio.ts#L176)；字段：`id`、`studentId`、`subject`、`title`、`atomIds`、`sourceMaterialId`、`sections`、`flashcards`、`practiceSteps`、`reviewDays`、`fingerprint`、`createdAt`、`updatedAt`。
- `StudioLearningPackPreview`：[packages/contracts/src/studio.ts:192](../../../packages/contracts/src/studio.ts#L192)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioFeedItem`：[packages/contracts/src/studio.ts:194](../../../packages/contracts/src/studio.ts#L194)；字段：`id`、`kind`、`priority`、`title`、`reason`、`href`。
- `StudioWhiteboardScene`：[packages/contracts/src/studio.ts:203](../../../packages/contracts/src/studio.ts#L203)；字段：`id`、`kind`、`title`、`narration`、`body?`、`bullets?`、`visual?`、`source?`、`durationMs`。
- `StudioWhiteboard`：[packages/contracts/src/studio.ts:215](../../../packages/contracts/src/studio.ts#L215)；字段：`id`、`studentId`、`subject`、`atomId`、`sourceMaterialId?`、`title`、`prompt`、`scenes`、`durationMs`、`width`、`height`、`fingerprint`、`createdAt`、`updatedAt`。
- `StudioConnectorKind`：[packages/contracts/src/studio.ts:232](../../../packages/contracts/src/studio.ts#L232)；别名、联合类型或 Zod 推导类型，具体约束查看源码。
- `StudioConnector`：[packages/contracts/src/studio.ts:233](../../../packages/contracts/src/studio.ts#L233)；字段：`id`、`studentId`、`subject`、`kind`、`label`、`sourceHost`、`status`、`lastSyncedAt`、`eventCount`、`lastError`、`version`、`createdAt`。
- `StudioScheduleEvent`：[packages/contracts/src/studio.ts:248](../../../packages/contracts/src/studio.ts#L248)；字段：`id`、`connectorId`、`studentId`、`subject`、`title`、`description`、`startsAt`、`endsAt`、`allDay`、`externalUid`、`source`、`createdAt`、`requestKey?`、`planId?`、`planSessionId?`、`status?`、`confirmed?`、`revision?`。
- `StudioIntegrationOverview`：[packages/contracts/src/studio.ts:269](../../../packages/contracts/src/studio.ts#L269)；字段：`connectors`、`events`。
- `StudioSpeechVoice`：[packages/contracts/src/studio.ts:274](../../../packages/contracts/src/studio.ts#L274)；字段：`id`、`label`。
- `StudioSpeechCapabilities`：[packages/contracts/src/studio.ts:275](../../../packages/contracts/src/studio.ts#L275)；字段：`available`、`provider`、`voices`、`defaultVoice`。
- `StudioOverview`：[packages/contracts/src/studio.ts:282](../../../packages/contracts/src/studio.ts#L282)；字段：`generatedAt`、`day`、`narrationAvailable`、`speech`、`children`、`selected`、`courses`、`feed`、`activities`、`plans`、`materials`、`studyPacks`、`whiteboards`、`integrations`。

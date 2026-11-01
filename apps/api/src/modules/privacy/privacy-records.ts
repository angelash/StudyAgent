import { teachingAssignmentView,type TeachingAssignmentRecord } from '../learning/assistant-teaching-assignment-record';
import { createHash } from 'node:crypto';
import type { PrivacyCounts, PrivacyReceipt, DiagnosticSession } from '@study-agent/contracts';
import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { generationView } from '../learning/source-course-pipeline';
import { sourceCourseVersioningView, sourceCourseLesson } from '../learning/source-course-content';
import { compilationView } from '../learning/source-course-compilation';
import { studioMaterialView } from '../learning/studio-material-access';
import { publicTopicWhiteboard } from '../learning/topic-whiteboard-projection';
import { publicQuestionTeachingVersion } from '../learning/whiteboard-question-teaching-versions';
import { reviewedPracticePortableView, type AssistantPracticeArtifactRecord } from '../learning/assistant-practice-record';
import { assignmentView, type AssistantPracticeAssignmentRecord } from '../learning/assistant-practice-assignment-record';
import { withdrawalView, type AssistantPracticeWithdrawalRecord } from '../learning/assistant-practice-withdrawal-record';
import { anonymizeControlledEditorial } from '../diagnostics/controlled-editorial-privacy';
import { anonymizeControlledPreviews } from '../diagnostics/controlled-preview-privacy';
import { controlledSessionOf } from '../diagnostics/controlled-session-origin';
import { controlledFeedbackHeld } from '../diagnostics/controlled-contrast-disclosure';
import {paperCaptureAttributedCollections,paperCapturePrivateCollections,paperCaptureCollections,portablePaperCaptureSource} from '../learning/paper-capture-privacy';
import { paperLibraryPrivateCollections } from '../library/paper-export-privacy';
import { textbookTeachingCollections } from '../diagnostics/textbook-teaching-record';

type Row = Record<string, any>;
export type Selection = Record<string, Row[]>;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const privacyHash = digest;
const recordId = (row: Row) => String(row.id ?? row.eventId ?? '');
const rows = (store: InMemoryStoreService, name: string): Row[] => (store as unknown as Record<string, Row[]>)[name] ?? [];
function add(result: Selection, store: InMemoryStoreService, name: string, predicate: (row: Row) => boolean) {
  result[name] = rows(store, name).filter(predicate); return result[name];
}
function ids(result: Selection, ...names: string[]) { return new Set(names.flatMap(name => (result[name] ?? []).map(recordId))); }
const hasReference = (value: unknown, references: Set<string>): boolean => typeof value === 'string' ? references.has(value)
  : Array.isArray(value) ? value.some(item => hasReference(item, references))
  : !!value && typeof value === 'object' && Object.values(value).some(item => hasReference(item, references));

/** Explicit relation registry; shared curriculum, content, originals and other families never enter it. */
export function studentRecords(store: InMemoryStoreService, studentId: string): Selection {
  const result: Selection = {};
  add(result, store, 'textbookTeachingAdoptions', row => row.studentId === studentId);
  add(result, store, 'textbookTeachingCourseRevisions', row => row.studentId === studentId);
  for (const name of paperLibraryPrivateCollections) add(result, store, name, row => row.scope.studentId === studentId);
  add(result, store, 'paperSourceExposures', row => row.studentId === studentId);
  add(result, store, 'students', row => row.id === studentId);
  for (const name of ['bindings', 'subjectEnrollments', 'learningScopes', 'studentLearningAccess', 'studentLearningCodes', 'studentAccessRevisions',
    'studentProgressProposals', 'studentInvitations', 'teacherAssignments', 'diagnosticSessions', 'diagnosticBlueprints', 'controlledContrastPreviews', 'diagnosticResponses', 'diagnosticHypotheses',
    'retentionExposureEvents','diagnosticPlans', 'guidanceModelSuggestions', 'reviewTasks', 'practiceSessions', 'assistantPracticeAssignments', 'assistantPracticeAssignmentWithdrawals', 'assistantPracticeGroupStarts', 'paperPracticeSessions', 'paperPracticeCommands', 'mistakeNotebookEntries', 'assessments', 'assessmentResults', 'studyPlans', 'missions', 'evidenceFeedback', 'studentMedia',
    'gespLearningScopes', 'gespLearningScopeRevisions', 'gespCodeSubmissions', 'gespProbeSubmissions', 'gespHintEvents', 'gespGuidancePlans', 'gespReviewTasks', 'classroomSessions', 'classroomTurns', 'whiteboardQuestionTurns', 'whiteboardQuestionVisuals', 'classroomCodeDrafts', 'classroomVisuals', 'courseProjects','studioSourceMaterials','studioMaterialUploads','studioOriginalRepairs','sourceCourses','sourceCourseStages','sourceCourseChecks',
    'projectAssetUploads','projectAssets','studioCourses','studioActivities','studioStudyPlans','studioLearningPacks','studioWhiteboards','studioTopicWhiteboardDrafts','studioTopicWhiteboards','studioTopicWhiteboardVisuals','studioConnectors','studioScheduleEvents','guidanceCalendarArrangements','studioCalendarCommands']) {
    add(result, store, name, row => row.studentId === studentId);
  }
  const candidateIds = new Set([...(result.studentLearningAccess ?? []).map(row => row.userId), ...result.students.map(row => row.userId)].filter(Boolean));
  for(const name of paperCapturePrivateCollections)add(result,store,name,row=>row.scope.studentId===studentId);
  for(const name of paperCaptureAttributedCollections)add(result,store,name,row=>row.attribution.scope.studentId===studentId);
  const sourceCourseIds=ids(result,'sourceCourses');
  add(result,store,'sourceCourseChecks',row=>row.studentId===studentId||sourceCourseIds.has(row.courseId));
  const sourceCheckIds=ids(result,'sourceCourseChecks');add(result,store,'sourceCourseCheckPublications',row=>row.studentId===studentId||sourceCourseIds.has(row.courseId)||sourceCheckIds.has(row.checkId));
  const learnerIds = new Set(rows(store, 'users').filter(row => candidateIds.has(row.id) && row.role === 'student').map(recordId));
  add(result, store, 'users', row => learnerIds.has(row.id) && row.role === 'student');
  add(result, store, 'sessions', row => row.studentId === studentId || learnerIds.has(row.userId));
  const diagnosticIds = ids(result, 'diagnosticSessions'), practiceIds = ids(result, 'practiceSessions');
  for (const name of ['diagnosticHints', 'diagnosticDrafts', 'diagnosticReports']) add(result, store, name, row => diagnosticIds.has(row.sessionId));
  for (const name of ['practiceAttempts', 'practiceHints']) add(result, store, name, row => practiceIds.has(row.sessionId));
  const diagnosticResponses = ids(result, 'diagnosticResponses'), practiceResponses = ids(result, 'practiceAttempts');
  add(result, store, 'scoringRevisions', row => diagnosticResponses.has(row.responseId));
  add(result, store, 'practiceScoringRevisions', row => practiceResponses.has(row.responseId));
  const plans = ids(result, 'diagnosticPlans'), gespPlans = ids(result, 'gespGuidancePlans');
  add(result, store, 'guidancePlanRevisions', row => plans.has(row.planId));
  add(result, store, 'gespGuidancePlanRevisions', row => gespPlans.has(row.planId));
  const assessments = ids(result, 'assessments'), missions = ids(result, 'missions');
  add(result, store, 'assessmentAnswers', row => assessments.has(row.sessionId));
  add(result, store, 'missionAnswers', row => missions.has(row.missionId));
  add(result, store, 'assistantSessions', row => row.studentId === studentId || learnerIds.has(row.ownerUserId));
  const assistants = ids(result, 'assistantSessions'); add(result, store, 'assistantMessages', row => assistants.has(row.sessionId));
  add(result, store, 'assistantTurns', row => assistants.has(row.sessionId));
  add(result, store, 'assistantArtifactDrafts', row => row.studentId === studentId || assistants.has(row.sessionId));
  add(result, store, 'assistantPracticeArtifacts', row => row.studentId === studentId || assistants.has(row.sourceSessionId));
  add(result, store, 'assistantTeachingPracticeDrafts', row => row.studentId === studentId || assistants.has(row.sourceSessionId));
  add(result, store, 'assistantGuidanceIntents', row => row.studentId===studentId||assistants.has(row.sourceSessionId));
  add(result, store, 'assistantTeachingPractices', row => row.studentId === studentId);
  add(result, store, 'assistantTeachingAssignments', row => row.studentId === studentId);
  add(result, store, 'assistantTeachingSessions', row => row.studentId === studentId);
  add(result, store, 'aiInsights', row => row.studentId === studentId || assistants.has(row.sourceId) || assessments.has(row.sourceId) || missions.has(row.sourceId));
  const allIds = new Set(Object.values(result).flat().map(recordId).filter(Boolean));
  add(result, store, 'events', row => hasReference(row.payload, allIds));
  return result;
}

export function accountRecords(store: InMemoryStoreService, actorId: string, principal: string): Selection {
  const result: Selection = {};
  for (const name of textbookTeachingCollections) add(result, store, name, row => row.actorId === actorId);
  for (const name of paperLibraryPrivateCollections) add(result, store, name, row => row.actorId === actorId);
  add(result, store, 'users', row => row.id === actorId);
  add(result, store, 'sessions', row => row.userId === actorId || row.guardianId === actorId);
  add(result, store, 'bindings', row => row.parentUserId === actorId);
  add(result, store, 'studentInvitations', row => row.issuerId === actorId || row.recipientPrincipal === principal);
  add(result, store, 'studentLearningCodes', row => row.createdBy === actorId);
  add(result, store, 'teacherAssignments', row => row.grantedBy === actorId || row.teacherUserId === actorId);
  add(result, store, 'libraryBookmarks', row => row.userId === actorId);
  add(result, store, 'paperPracticeSessions', row => row.ownerUserId === actorId);
  add(result, store, 'paperPracticeCommands', row => row.ownerUserId === actorId);
  for(const name of paperCapturePrivateCollections)add(result,store,name,row=>row.actorId===actorId);
  for(const name of paperCaptureAttributedCollections)add(result,store,name,row=>row.attribution.ownerUserId===actorId&&row.attribution.scope.studentId===null);
  add(result, store, 'diagnosticBlueprints', row => row.actorId === actorId);
  const publishedControlledReviews = new Set(rows(store, 'controlledContrastPublications').flatMap(row => row.originals.map((original: Row) => original.review.id)));
  add(result, store, 'controlledEditorialCommands', row => row.actorId === actorId);
  add(result, store, 'controlledMaterialReviews', row => row.actorId === actorId && !publishedControlledReviews.has(row.id));
  add(result, store, 'controlledContrastPreviews', row => row.arrangedBy === actorId && !row.sessionId);
  add(result, store, 'assistantSessions', row => row.ownerUserId === actorId);
  add(result, store, 'classroomSessions', row => row.ownerUserId === actorId);
  add(result, store, 'classroomTurns', row => row.ownerUserId === actorId);
  add(result, store, 'whiteboardQuestionTurns', row => row.ownerUserId === actorId);
  add(result, store, 'whiteboardQuestionVisuals', row => row.ownerUserId === actorId);
  add(result, store, 'classroomCodeDrafts', row => row.ownerUserId === actorId);
  add(result, store, 'classroomVisuals', row => row.ownerUserId === actorId);
  add(result, store, 'studioTopicWhiteboardVisuals', row => row.ownerUserId === actorId);
  add(result, store, 'courseProjects', row => row.ownerUserId === actorId);
  const projectIds=ids(result,'courseProjects');
  add(result,store,'projectAssetUploads',row=>projectIds.has(row.projectId));add(result,store,'projectAssets',row=>projectIds.has(row.projectId));
  add(result, store, 'sourceCourses', row => row.ownerUserId === actorId && (!row.studentId || !['active','archived'].includes(row.status) || ['draft','discarded'].includes(row.versioning?.state)));
  const sourceCourseIds=ids(result,'sourceCourses');add(result,store,'sourceCourseStages',row=>sourceCourseIds.has(row.courseId));
  add(result,store,'sourceCourseChecks',row=>sourceCourseIds.has(row.courseId)||row.ownerUserId===actorId&&(!row.studentId||!['published','superseded','withdrawn'].includes(row.status)));
  add(result,store,'studioTopicWhiteboardDrafts',row=>row.ownerUserId===actorId);
  add(result,store,'studioTopicWhiteboards',row=>row.ownerUserId===actorId&&(!row.studentId||row.privateToCreator||row.sourceProtocol==='assistant-topic-whiteboard-v1'
    ||rows(store,'studioTopicWhiteboardDrafts').some(draft=>draft.id===row.sourceDraftId&&draft.prepared?.version==='assistant-topic-whiteboard-v1')));
  const sourceCheckIds=ids(result,'sourceCourseChecks');add(result,store,'sourceCourseCheckPublications',row=>sourceCourseIds.has(row.courseId)||sourceCheckIds.has(row.checkId)||row.ownerUserId===actorId&&!row.studentId);
  add(result, store, 'studioMaterialUploads', row => row.ownerUserId === actorId && (!row.studentId || row.status !== 'completed'));
  add(result,store,'studioOriginalRepairs',row=>row.ownerUserId===actorId);
  add(result, store, 'studioSourceMaterials', row => row.ownerUserId === actorId && !row.studentId);
  const sessions = ids(result, 'assistantSessions'); add(result, store, 'assistantMessages', row => sessions.has(row.sessionId));
  add(result, store, 'assistantTurns', row => sessions.has(row.sessionId));
  add(result, store, 'assistantArtifactDrafts', row => row.ownerUserId === actorId || sessions.has(row.sessionId));
  add(result, store, 'assistantPracticeArtifacts', row => row.ownerUserId === actorId || sessions.has(row.sourceSessionId));
  add(result, store, 'assistantTeachingPracticeDrafts', row => row.ownerUserId === actorId || sessions.has(row.sourceSessionId));
  add(result, store, 'assistantGuidanceIntents', row => row.ownerUserId===actorId||sessions.has(row.sourceSessionId));
  add(result, store, 'assistantTeachingPractices', row => row.ownerUserId === actorId);
  add(result, store, 'assistantTeachingSessions', row => row.ownerUserId === actorId);
  add(result, store, 'guidanceModelSuggestions', row => row.ownerUserId === actorId);
  add(result, store, 'studioCalendarCommands', row => row.actorId === actorId);
  add(result, store, 'teachingToolRuns', row => row.ownerUserId === actorId);
  add(result, store, 'aiInsights', row => sessions.has(row.sourceId));
  const references = new Set([actorId, ...Object.values(result).flat().map(recordId)]);
  add(result, store, 'events', row => hasReference(row.payload, references));
  return result;
}
export function mergeSelections(...selections: Selection[]): Selection {
  const result: Selection = {};
  for (const selected of selections) for (const [name, records] of Object.entries(selected)) {
    result[name] = [...new Map([...(result[name] ?? []), ...records].map(row => [recordId(row), row])).values()];
  }
  return result;
}
export function selectionCounts(selected: Selection): PrivacyCounts {
  const count = (...names: string[]) => names.reduce((sum, name) => sum + (selected[name]?.length ?? 0), 0);
  return { records: Object.values(selected).reduce((sum, records) => sum + records.length, 0),
    observations: count('diagnosticResponses', 'practiceAttempts', 'assessmentAnswers', 'missionAnswers'),
    activities: count('diagnosticSessions', 'practiceSessions', 'assistantTeachingAssignments', 'assistantTeachingSessions', 'assistantPracticeAssignments', 'assessments', 'missions'), plans: count('diagnosticPlans', 'studyPlans', 'reviewTasks', 'guidancePlanRevisions', 'guidanceModelSuggestions', 'gespGuidancePlans', 'gespGuidancePlanRevisions', 'gespReviewTasks'),
    conversations: count('assistantMessages', 'assistantTurns', 'whiteboardQuestionTurns', 'teachingToolRuns'), accessRecords: count('users', 'sessions', 'bindings', 'studentLearningAccess', 'studentLearningCodes', 'studentInvitations', 'teacherAssignments') };
}
export function selectionFingerprint(selection: Selection, context: unknown) {
  return digest({ context, collections: Object.keys(selection).sort().map(name => [name, [...selection[name]].sort((a, b) => recordId(a).localeCompare(recordId(b)))]) });
}
export function removeSelected(store: InMemoryStoreService, selection: Selection) {
  const removedPaperPractice = ids(selection, 'paperPracticeSessions');
  const removedUsers = ids(selection, 'users');
  for (const [name, selected] of Object.entries(selection)) {
    const remove = new Set(selected.map(recordId));
    (store as unknown as Record<string, Row[]>)[name] = rows(store, name).filter(row => !remove.has(recordId(row)));
  }
  // Shared confirmed teaching survives a retained child; all private linkage is removed.
  // The matching account-deletion receipt is checked by the cold semantic validator.
  for (const row of rows(store, 'assistantPracticeAssignments')) if (removedUsers.has(row.publisherUserId)) {
    row.publisherUserId = null; row.privateOrigin = null; row.sourceState = 'account_deleted';
  }
  for (const row of rows(store, 'assistantPracticeAssignmentWithdrawals')) if (removedUsers.has(row.actorUserId)) row.actorUserId = null;
  for (const row of rows(store, 'assistantTeachingAssignments')) {
    if (removedUsers.has(row.publisherUserId)) { row.publisherUserId=null; row.privateOrigin=null; }
    if (row.withdrawal && removedUsers.has(row.withdrawal.actorUserId)) row.withdrawal.actorUserId=null;
  }
  if (removedPaperPractice.size) {
    for (const row of rows(store, 'paperPracticeSessions')) if (row.origin && removedPaperPractice.has(row.origin.sessionId)) delete row.origin;
    for (const row of rows(store, 'diagnosticBlueprints')) if (row.paperReviewOrigin && removedPaperPractice.has(row.paperReviewOrigin.sessionId)) delete row.paperReviewOrigin;
    for (const row of rows(store, 'diagnosticSessions')) if (row.paperReviewOrigin && removedPaperPractice.has(row.paperReviewOrigin.sessionId)) delete row.paperReviewOrigin;
  }
}

/** Called before relation removal in the same actual deletion/restore transaction.
 * Shared originals remain byte-identical; only private links and commands go.
 */
export function anonymizeControlledAttribution(store: InMemoryStoreService, actorId: string, receipt: PrivacyReceipt) {
  const repository = { reviews: store.controlledMaterialReviews ?? [], publications: store.controlledContrastPublications ?? [],
    releases: store.controlledContrastReleases ?? [], commands: store.controlledEditorialCommands ?? [] };
  if (Object.values(repository).some(records => records.length)) {
    const result = anonymizeControlledEditorial(repository, actorId, receipt,
      (store.privacyRequests ?? []).filter(row => row.id !== receipt.id));
    store.controlledMaterialReviews = result.reviews; store.controlledContrastPublications = result.publications;
    store.controlledContrastReleases = result.releases; store.controlledEditorialCommands = result.commands;
  }
  if (rows(store, 'controlledContrastPreviews').length) store.controlledContrastPreviews = anonymizeControlledPreviews(store.controlledContrastPreviews, actorId, receipt);
}
// Tokens, passwords, internal idempotency digests and other guardians' private chats are never exported.
const secretFields = new Set(['passwordHash', 'credential', 'token', 'tokenHash', 'requestHash', 'inputHash', 'scopeKey', 'requestKey', 'decisionHash', 'draftCommands']);
function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !secretFields.has(key)).map(([key, child]) => [key, scrub(child)]));
  return value;
}
export function portableRecords(selected: Selection, actorId: string): Record<string, unknown[]> {
  const heldControlled = new Set((selected.diagnosticSessions ?? []).filter(row => {
    const controlled = controlledSessionOf(row as DiagnosticSession); return controlled && controlledFeedbackHeld(controlled);
  }).map(recordId));
  const heldControlledResponses = new Set((selected.diagnosticResponses ?? []).filter(row => heldControlled.has(row.sessionId)).map(recordId));
  const paperOwners = new Set([actorId, ...(selected.users ?? []).filter(user => user.role === 'student').map(recordId)]);
  const allowedPaperPractice = new Set((selected.paperPracticeSessions ?? []).filter(row => paperOwners.has(row.ownerUserId)).map(recordId));
  const allowedAssistants = new Set((selected.assistantSessions ?? []).filter(row => row.ownerUserId === actorId ||
    (selected.users ?? []).some(user => user.id === row.ownerUserId && user.role === 'student')).map(recordId));
  const allowedCourses = new Set((selected.sourceCourses??[]).filter(row=>row.ownerUserId===actorId||(selected.users??[]).some(user=>user.id===row.ownerUserId&&user.role==='student')||row.studentId&&['active','archived'].includes(row.status)&&!['draft','discarded'].includes(row.versioning?.state)).map(recordId));
  const publishedCourses = new Set((selected.sourceCourses??[]).filter(row=>row.confirmedAt&&['active','archived'].includes(row.status)).map(recordId));
  const allowedProjects=new Set((selected.courseProjects??[]).filter(row=>row.ownerUserId===actorId||(selected.users??[]).some(user=>user.id===row.ownerUserId&&user.role==='student')).map(recordId));
  const result: Selection = {};
  const answeredDrafts = new Set((selected.diagnosticResponses ?? []).map(row => JSON.stringify([row.sessionId, row.itemId])));
  const practiceCounts = new Map<string, number>();
  for (const row of selected.practiceAttempts ?? []) { const key = JSON.stringify([row.sessionId, row.questionId]); practiceCounts.set(key, (practiceCounts.get(key) ?? 0) + 1); }
  for (const [name, records] of Object.entries(selected)) {
    if (['users', 'sessions', 'studentLearningCodes', 'studentInvitations', 'events','sourceCourseCheckPublications','studioCalendarCommands','textbookTeachingAdoptions'].includes(name)) continue;
    if(name==='textbookTeachingCourseRevisions')result[name]=records.map(row=>({protocol:'textbook-teaching-course-history-public-v1',courseId:row.courseId,revision:row.revision,previousFingerprint:row.previousFingerprint,at:row.at,course:row.course}));
    else if (name === 'diagnosticDrafts') result[name] = records.filter(row => row.protocol !== 'answer-draft-v2' || !answeredDrafts.has(JSON.stringify([row.sessionId, row.itemId])));
    else if (name === 'practiceSessions') result[name] = records.map(row => ({ ...row, ...(row.drafts ? { drafts: Object.fromEntries(Object.entries(row.drafts as Record<string, Row>)
      .filter(([questionId, draft]) => draft.protocol !== 'answer-draft-v2' || draft.draftAttempt === (practiceCounts.get(JSON.stringify([row.id, questionId])) ?? 0))) } : {}) }));
    else if (name === 'paperPracticeSessions') result[name] = records.filter(row => allowedPaperPractice.has(row.id)).map(row => { const { origin, ...rest } = row; return !origin || allowedPaperPractice.has(origin.sessionId) ? row : rest; });
    else if (name === 'diagnosticSessions') result[name] = records.map(row => {
      if (row.teachingOrigin) return { id: row.id, studentId: row.studentId, subject: row.subject, intent: row.intent, status: row.status, teachingOrigin: row.teachingOrigin,
        scopeSnapshot: row.scopeSnapshot, blueprint: row.blueprint, coverage: row.coverage, startedAt: row.startedAt, completedAt: row.completedAt, endedAt: row.endedAt,
        items: row.itemSnapshots.map(({ id, questionId, atomId, dimension, questionVersion, version }: Row) => ({ id, questionId, atomId, dimension, questionVersion, version })),
        questions: row.questionSnapshots.map(({ id, stem, document, questionType }: Row) => ({ id, stem, document, questionType })) };
      if (heldControlled.has(row.id)) return { id: row.id, studentId: row.studentId, subject: row.subject, intent: row.intent, status: row.status,
        scopeSnapshot: row.scopeSnapshot, startedAt: row.startedAt, completedAt: row.completedAt, feedbackHeld: true,
        notice: '本组成对任务结束后再导出原评分、参考答案和对照结果。' };
      const { paperReviewOrigin, ...rest } = row; return !paperReviewOrigin || allowedPaperPractice.has(paperReviewOrigin.sessionId) ? row : rest;
    });
    else if (name === 'diagnosticResponses') result[name] = records.map(row => heldControlled.has(row.sessionId) ?
      { id:row.id,sessionId:row.sessionId,studentId:row.studentId,itemId:row.itemId,questionId:row.questionId,answer:row.answer,
        disposition:row.disposition,elapsedMs:row.elapsedMs,submittedAt:row.submittedAt,feedbackHeld:true } : row);
    else if (name === 'scoringRevisions') result[name] = records.filter(row => !heldControlledResponses.has(row.responseId));
    else if (name === 'diagnosticReports') result[name] = records.filter(row => !heldControlled.has(row.sessionId));
    else if (name === 'controlledContrastPreviews') result[name] = records.map(({id,studentId,subject,publicationId,fingerprint,scopeSnapshot,createdAt,expiresAt,sessionId}) =>
      ({id,studentId,subject,publicationId,fingerprint,scopeSnapshot,createdAt,expiresAt,sessionId}));
    else if (name === 'diagnosticBlueprints') result[name] = records.map(row => {
      if (row.teachingOrigin) { const { id, studentId, teachingOrigin, createdAt, expiresAt, sessionId, blueprint, scopeSnapshot, coverage, atomNames, itemCount } = row;
        return { id, studentId, teachingOrigin, createdAt, expiresAt, sessionId, blueprint, scopeSnapshot, coverage, atomNames, itemCount }; }
      const { paperReviewOrigin, ...rest } = row; return !paperReviewOrigin || allowedPaperPractice.has(paperReviewOrigin.sessionId) ? row : rest;
    });
    else if (name === 'paperPracticeCommands') result[name] = records.filter(row => allowedPaperPractice.has(row.sessionId) && paperOwners.has(row.ownerUserId));
    else if(paperLibraryPrivateCollections.includes(name as typeof paperLibraryPrivateCollections[number]))result[name]=records.filter(row=>row.actorId===actorId).map(({authorization:_authorization,...row})=>row);
    else if(name==='paperSourceExposures')result[name]=records.map(({authorization:_authorization,...row})=>row);
    else if(paperCaptureAttributedCollections.includes(name as typeof paperCaptureAttributedCollections[number]))result[name]=records.map(row=>portablePaperCaptureSource(row,paperOwners,actorId));
    else if(name==='paperImageUploads')result[name]=records.filter(row=>paperOwners.has(row.actorId)).map(({learningAccess:_access,guardianDeletionHash:_guardian,preparedFileIds:_prepared,filesCollectedAt:_collected,...row})=>({...row,chunksAvailable:row.status==='uploading'&&!_collected}));
    else if(name==='paperCaptureCommands')result[name]=records.filter(row=>paperOwners.has(row.actorId)).map(({fileIds:_files,authorization:_auth,...row})=>row);
    else if(name==='paperCaptureRepairUploads')result[name]=records.filter(row=>paperOwners.has(row.actorId)).map(({authorization:_auth,commandId:_command,terminalCommandId:_terminal,filesCollectedAt:_collected,stagedChunks:_staged,...row})=>({...row,chunksAvailable:!_collected,unacknowledgedChunks:(_staged??[]).filter((chunk:Row)=>!row.chunks.some((saved:Row)=>saved.index===chunk.index))}));
    else if(name==='paperCaptureRepairCommands')result[name]=records.filter(row=>paperOwners.has(row.actorId)).map(({authorization:_auth,...row})=>row);
    else if (name === 'assistantSessions') result[name] = records.filter(row => allowedAssistants.has(row.id));
    else if (name === 'assistantMessages') result[name] = records.filter(row => allowedAssistants.has(row.sessionId));
    else if (name === 'assistantArtifactDrafts') result[name] = records.filter(row => allowedAssistants.has(row.sessionId))
      .map(({ ownerUserId: _owner, sessionId: _session, studentId: _student, requestKey: _key, requestHash: _hash, commands: _commands, ...row }) => row);
    else if (name === 'assistantPracticeAssignments') result[name] = records.map(row => assignmentView(row as AssistantPracticeAssignmentRecord, true));
    else if (name === 'assistantPracticeAssignmentWithdrawals') result[name] = records.map(row => withdrawalView(row as AssistantPracticeWithdrawalRecord));
    else if (name === 'assistantPracticeGroupStarts') result[name] = records.map(row => ({ id: row.id, assignmentId: row.assignmentId,
      studentId: row.studentId, subject: row.subject, atomId: row.atomId, practiceSessionId: row.practiceSessionId,
      actorId: row.actorId, actorRole: row.actorRole, actorStudentId: row.actorStudentId, createdAt: row.createdAt,
      help: row.commands.filter((item: Row) => item.kind !== 'complete').map((item: Row) => ({ kind: item.kind, questionId: item.questionId, providedAt: item.providedAt })) }));
    else if (name === 'assistantPracticeArtifacts') result[name] = records.filter(row => row.ownerUserId === actorId ||
      (selected.users ?? []).some(user => user.id === row.ownerUserId && user.role === 'student'))
      .map(row => reviewedPracticePortableView(row as AssistantPracticeArtifactRecord));
    else if(name==='guidanceCalendarArrangements')result[name]=records.map(({id,planId,studentId,subject,revision,createdAt,updatedAt,history})=>({id,planId,studentId,subject,revision,createdAt,updatedAt,history:history.map(({actorId:revisionActor,commandId:_command,input,reason,entries,...row}:Row)=>({...row,input:{...input,entries:input.entries.map(({rescheduleReason,...entry}:Row)=>({...entry,...(revisionActor===actorId?{rescheduleReason}:{})}))},entries:entries.map(({input,...entry}:Row)=>({...entry,input:((({rescheduleReason,...value}:Row)=>({...value,...(revisionActor===actorId?{rescheduleReason}:{})}))(input))})),...(revisionActor===actorId?{reason}:{})}))}));
    else if(name==='assistantGuidanceIntents')result[name]=records.filter(row=>row.ownerUserId===actorId||(selected.users??[]).some(user=>user.id===row.ownerUserId&&user.role==='student')).map(({id,sourceSessionId,studentId,subject,sourceInput,observation,report,plan,revision,createdAt,updatedAt})=>({id,sourceSessionId,studentId,subject,objective:sourceInput.objective,observation,reportSessionId:report?.sessionId??null,reportVersion:report?.reportVersion??null,planId:plan?.planId??null,revision,createdAt,updatedAt,isObservationOnly:true,formalEvidenceCreated:false}));
    else if(name==='assistantTeachingPracticeDrafts')result[name]=records.filter(row=>row.ownerUserId===actorId||(selected.users??[]).some(user=>user.id===row.ownerUserId&&user.role==='student')).map(row=>({id:row.id,sourceSessionId:row.sourceSessionId,studentId:row.studentId,subject:row.subject,objective:row.prepared.input.objective,modelId:row.prepared.modelId,modelName:row.modelName,status:row.status,revision:row.revision,originalContent:row.originalContent,content:row.content,contentVersion:row.contentVersion,review:row.review,teacherReviewStatus:'pending',isTeachingOnly:true,formalEvidenceCreated:false,createdAt:row.createdAt,updatedAt:row.updatedAt}));
    else if(name==='assistantTeachingPractices')result[name]=records.filter(row=>row.ownerUserId===actorId||(selected.users??[]).some(user=>user.id===row.ownerUserId&&user.role==='student')).map(({id,sourceDraftId,studentId,subject,content,contentFingerprint,targetScope,modelId,modelName,review,createdAt})=>({id,sourceDraftId,studentId,subject,content,contentFingerprint,targetScope,modelId,modelName,review,createdAt,teacherReviewStatus:'pending',isTeachingOnly:true,formalEvidenceCreated:false,independentFirstPass:0}));
    else if(name==='assistantTeachingAssignments')result[name]=records.map(row=>teachingAssignmentView(row as TeachingAssignmentRecord));
    else if(name==='assistantTeachingSessions')result[name]=records.filter(row=>row.ownerUserId===actorId||row.studentId&&(selected.students??[]).some(student=>student.id===row.studentId)).map(row=>{const {id,practiceId,status,contentSnapshot,contentFingerprint,drafts,attempts,helps,createdAt,updatedAt,completedAt}=row;if(row.protocol==='assistant-generated-student-session-v1')return{id,assignmentId:row.assignmentId,studentId:row.studentId,subject:row.subject,status,contentSnapshot:{protocol:contentSnapshot.protocol,title:contentSnapshot.title,objective:contentSnapshot.objective,questions:contentSnapshot.questions.map(({sourceMap:_sourceMap,...question}:any)=>question)},drafts,attempts,helps,createdAt,updatedAt,completedAt,isTeachingOnly:true,formalEvidenceCreated:false,independentFirstPass:0};return{id,practiceId,status,contentSnapshot,contentFingerprint,drafts,attempts,helps,createdAt,updatedAt,completedAt,isTeachingOnly:true,formalEvidenceCreated:false,independentFirstPass:0};});
    else if (name === 'assistantTurns') result[name] = records.filter(row => allowedAssistants.has(row.sessionId))
      .map(({prepared:_prepared,authorization:_auth,inputHash:_hash,commandHash:_command,taskId:_task,...row})=>row);
    else if (name === 'teachingToolRuns') result[name] = records.filter(row => row.ownerUserId === actorId)
      .map(row => ({ id: row.id, purpose: row.purpose, snapshot: row.snapshot, modelId: row.modelId, modelName: row.modelName,
          status: row.status === 'completed' && row.result ? 'completed' : 'not_completed', result: row.result, revision: row.revision, createdAt: row.createdAt, updatedAt: row.updatedAt, advisoryOnly: true, reviewRequired: true }));
    else if (name === 'guidanceModelSuggestions') result[name] = records.filter(row => row.ownerUserId === actorId)
      .map(({context:_context,taskId:_task,inputHash:_input,commandHash:_command,definitionHash:_definition,planHash:_plan,bindingId:_binding,authorizationRole:_role,requests:_requests,requestKey:_key,status:_state,...row})=>
        ({...row,publication:row.result?'published':'not_published'}));
    else if (name === 'classroomSessions') result[name] = records.filter(row => row.ownerUserId === actorId ||
      (selected.users ?? []).some(user => user.id === row.ownerUserId && user.role === 'student'))
      .map(({ answerKeys: _answerKeys, hintKeys: _hintKeys, requests: _requests,sourceCheckSources:_sourceCheckSources, ...row }) => row);
    else if (name === 'classroomCodeDrafts') result[name] = records.filter(row => row.ownerUserId === actorId ||
      (selected.users ?? []).some(user => user.id === row.ownerUserId && user.role === 'student')).map(({ requests: _requests, baseHash: _base, ...row }) => row);
    else if (name === 'whiteboardQuestionTurns') result[name] = records.filter(row => row.ownerUserId === actorId ||
      (selected.users ?? []).some(user => user.id === row.ownerUserId && user.role === 'student'))
      .map(({ authorization: _auth, prepared: _prepared, history: _history, inputHash: _hash, definitionHash: _definition, taskId: _task, commands: _commands,
        teachingVersions: _versions, figureAdoptionCommands: _adoptions, ...row }) => ({ ...row,
        ...(_versions ? { teachingVersions: _versions.map((version: any) => publicQuestionTeachingVersion(version, version.id === row.currentTeachingVersionId)) } : {}) }));
    else if (name === 'classroomTurns') result[name] = records.filter(row => row.ownerUserId === actorId ||
      (selected.users ?? []).some(user => user.id === row.ownerUserId && user.role === 'student'))
      .map(({ authorization: _auth, context: _context, history: _history, inputHash: _hash, lessonHash: _lesson, taskId: _task, ...row }) => row);
    else if (name === 'classroomVisuals') result[name] = records.filter(row => row.ownerUserId === actorId ||
      (selected.users ?? []).some(user => user.id === row.ownerUserId && user.role === 'student'))
      .map(({prompt:_prompt,requestKey:_key,inputHash:_hash,requests:_requests,selectionKey,files,...row})=>({...row,selected:selectionKey!==null,files:files?{image:files.image,original:files.original}:null}));
    else if (name === 'courseProjects') result[name] = records.filter(row => row.ownerUserId === actorId ||
      (selected.users ?? []).some(user => user.id === row.ownerUserId && user.role === 'student')).map(({ requests: _requests, ...row }) => row);
    else if(name==='projectAssets'||name==='projectAssetUploads')result[name]=records.filter(row=>allowedProjects.has(row.projectId)).map(({authorization:_auth,definitionHash:_definition,inputHash:_hash,requestKey:_key,taskId:_task,commands:_commands,cleanupTaskId:_cleanup,filesCollectedAt:_collected,...row})=>row);
    else if(name==='studioMaterialUploads')result[name]=records.filter(row=>row.ownerUserId===actorId||row.status==='completed').map(({requestKey:_key,requestHash:_hash,aliases:_aliases,guardianId:_guardian,accessVersion:_version,filesCollectedAt:_collected,...row})=>row);
    else if(name==='studioSourceMaterials')result[name]=records.map(row=>studioMaterialView(row as any));
    else if(name==='studioOriginalRepairs')result[name]=records.map(({id,materialId,uploadId,status,revision,createdAt,updatedAt,completedAt,receipt})=>({id,materialId,uploadId,status,revision,createdAt,updatedAt,completedAt,receipt}));
    else if(name==='studioConnectors')result[name]=records.map(({encryptedFeedUrl:_feed,requestKey:_key,requestHash:_hash,...row})=>row);
    else if(name==='sourceCourses')result[name]=records.filter(row=>allowedCourses.has(row.id))
      .map(({requests:_requests,result:_result,originalResult:_original,edits:_edits,generation:_generation,compilation:_compilation,...row})=>({...row,...(row.versioning?{versioning:sourceCourseVersioningView(row as any,actorId,publishedCourses)}:{}),generation:generationView({...row,result:_result,generation:_generation} as any),...(_compilation?{compilation:compilationView({...row,result:_result,compilation:_compilation} as any,actorId)}:{}),lessons:_result?.lessons.map((_:unknown,index:number)=>sourceCourseLesson({...row,result:_result,compilation:_compilation} as any,index))??[]}));
    else if(name==='sourceCourseStages')result[name]=records.filter(row=>allowedCourses.has(row.courseId)).map(({id,courseId,kind,key,createdAt,modelId,modelName,copiedFrom})=>({id,courseId,kind,key,createdAt,modelId,modelName,...(copiedFrom?{copiedFrom}:{})}));
    else if(name==='sourceCourseChecks')result[name]=records.filter(row=>allowedCourses.has(row.courseId)&&['published','superseded','withdrawn'].includes(row.status)).map(row=>({id:row.id,courseId:row.courseId,courseFingerprint:row.courseFingerprint,revision:row.revision,status:row.status,publishedAt:row.publishedAt,withdrawnAt:row.withdrawnAt,title:row.content?.title??null,targets:(row.prepared?.targets??[]).map(({lessonId,title,objective}:Row)=>({lessonId,title,objective}))}));
    else if(name==='studioTopicWhiteboardVisuals'||name==='whiteboardQuestionVisuals')result[name]=[];
    else if(name==='studioTopicWhiteboardDrafts')result[name]=records.filter(row=>row.ownerUserId===actorId)
      .map(({prepared,authorization:_auth,commands:_commands,taskId:_task,requestHash:_hash,...row})=>{
        const withoutFigures=(content:Row|null)=>content&&Array.isArray(content.scenes)?{...content,scenes:content.scenes.map(({figure:_figure,...scene}:Row)=>scene)}:content;
        return {...row,content:withoutFigures(row.content),originalContent:withoutFigures(row.originalContent),
          ...(row.history?{history:row.history.map((item:Row)=>({...item,content:withoutFigures(item.content)}))}:{}),prompt:prepared.input.prompt,objective:prepared.input.objective,modelId:prepared.modelId,
          ...(prepared.version==='assistant-topic-whiteboard-v1'?{source:{protocol:prepared.version,origin:prepared.source.origin,sourceFingerprint:prepared.source.sourceFingerprint}}:{})};
      });
    else if(name==='studioTopicWhiteboards')result[name]=records.filter(row=>row.ownerUserId===actorId||!(row.privateToCreator||row.sourceProtocol==='assistant-topic-whiteboard-v1'
      ||(selected.studioTopicWhiteboardDrafts??[]).some(draft=>draft.id===row.sourceDraftId&&draft.prepared?.version==='assistant-topic-whiteboard-v1'))).map(row=>publicTopicWhiteboard(row as any,actorId));
    else if (name === 'aiInsights') result[name] = records.filter(row => row.sourceType !== 'assistant' || allowedAssistants.has(row.sourceId) || (selected.diagnosticPlans ?? []).some(plan => plan.id === row.sourceId));
    else result[name] = records;
  }
  return scrub(result) as Record<string, unknown[]>;
}

/** Retain shared children's learning history while removing a closed account's attribution. */
export function anonymizeSharedAttribution(store: InMemoryStoreService, studentIds: string[], actorId: string) {
  const actorFields = new Set(['actorId','actorUserId', 'createdBy', 'decidedBy', 'reviewerId', 'grantedBy', 'revokedBy', 'proposedBy', 'ownerUserId', 'confirmedByUserId', 'createdByUserId', 'decidedByUserId']);
  const replace = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) =>
      [key, actorFields.has(key) && child === actorId ? 'deleted-account' : replace(child)]));
    return value;
  };
  const selected = mergeSelections(...studentIds.map(id => studentRecords(store, id)));
  for (const [name, records] of Object.entries(selected)) {
    const affected = new Set(records.map(recordId));
    (store as unknown as Record<string, Row[]>)[name] = rows(store, name).map(row => {
      if (!affected.has(recordId(row))) return row;
      if(name==='guidanceCalendarArrangements')return{...row,...(row.createdBy===actorId?{createdBy:null,creatorDeletionHash:privacyHash({id:actorId})}:{}),history:row.history.map((revision:Row)=>revision.actorId===actorId?{...revision,actorId:null,commandId:null,actorDeletionHash:privacyHash({id:actorId}),reason:'',input:{...revision.input,entries:revision.input.entries.map((entry:Row)=>entry.sourceKind==='review'?{...entry,rescheduleReason:''}:entry)},entries:revision.entries.map((entry:Row)=>({...entry,input:entry.input.sourceKind==='review'?{...entry.input,rescheduleReason:''}:entry.input}))}:revision)};
      if(name==='studioCalendarCommands')return row;
      if((paperLibraryPrivateCollections as readonly string[]).includes(name)||name==='paperSourceExposures')return row;
      if(paperCaptureCollections.includes(name as typeof paperCaptureCollections[number]))return row;
      if(name==='controlledContrastPreviews')return row;
      if (name === 'assistantTeachingAssignments') return row;
      if (name === 'assistantPracticeAssignments') return row;
      if (name === 'assistantPracticeAssignmentWithdrawals') return row;
      if (name === 'assistantPracticeGroupStarts' || name === 'practiceSessions' && row.origin === 'assistant_artifact'
        || name === 'practiceAttempts' && row.assistantInput || name === 'practiceHints' && row.sourceGroupId) return row;
      const anonymous = replace(row) as Row;
      // Different closed upload owners can have used the same request key.
      // A per-file anonymous owner preserves uniqueness without retaining identity.
      if (name === 'studentMedia' && row.ownerUserId === actorId) anonymous.ownerUserId = `deleted-account:${row.id}`;
      if (name === 'sourceCourseChecks' && row.ownerUserId === actorId) anonymous.ownerUserId = `deleted-account:${row.id}`;
      if (name === 'sourceCourseChecks' && row.authorization?.guardianId === actorId) anonymous.authorization.guardianId='deleted-account';
      if (name === 'studioTopicWhiteboards' && row.ownerUserId === actorId && !row.privateToCreator && row.sourceProtocol!=='assistant-topic-whiteboard-v1') anonymous.ownerUserId=`deleted-account:${row.id}`;
      if (['studioTopicWhiteboardDrafts','studioTopicWhiteboardVisuals'].includes(name) && row.authorization?.guardianId === actorId) anonymous.authorization.guardianId='deleted-account';
      if(['projectAssets','projectAssetUploads'].includes(name)&&row.authorization?.guardianId===actorId)anonymous.authorization.guardianId='deleted-account';
      if(name==='studioConnectors'&&row.createdBy===actorId){anonymous.status='revoked';anonymous.encryptedFeedUrl='';anonymous.version=(Number(row.version)||0)+1;anonymous.lastError=null;}
      return anonymous;
    });
  }
}

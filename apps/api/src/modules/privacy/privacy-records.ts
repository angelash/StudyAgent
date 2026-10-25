import { createHash } from 'node:crypto';
import type { PrivacyCounts } from '@study-agent/contracts';
import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { generationView } from '../learning/source-course-pipeline';
import { sourceCourseLesson } from '../learning/source-course-content';
import { compilationView } from '../learning/source-course-compilation';
import { studioMaterialView } from '../learning/studio-material-access';

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
  add(result, store, 'students', row => row.id === studentId);
  for (const name of ['bindings', 'subjectEnrollments', 'learningScopes', 'studentLearningAccess', 'studentLearningCodes', 'studentAccessRevisions',
    'studentProgressProposals', 'studentInvitations', 'teacherAssignments', 'diagnosticSessions', 'diagnosticBlueprints', 'diagnosticResponses', 'diagnosticHypotheses',
    'diagnosticPlans', 'reviewTasks', 'practiceSessions', 'mistakeNotebookEntries', 'assessments', 'assessmentResults', 'studyPlans', 'missions', 'evidenceFeedback', 'studentMedia',
    'gespLearningScopes', 'gespLearningScopeRevisions', 'gespCodeSubmissions', 'gespProbeSubmissions', 'gespHintEvents', 'gespGuidancePlans', 'gespReviewTasks', 'classroomSessions', 'classroomVisuals', 'courseProjects','studioSourceMaterials','studioMaterialUploads','studioOriginalRepairs','sourceCourses','sourceCourseStages',
    'studioCourses','studioActivities','studioStudyPlans','studioLearningPacks','studioWhiteboards','studioConnectors','studioScheduleEvents']) {
    add(result, store, name, row => row.studentId === studentId);
  }
  const candidateIds = new Set([...(result.studentLearningAccess ?? []).map(row => row.userId), ...result.students.map(row => row.userId)].filter(Boolean));
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
  add(result, store, 'aiInsights', row => row.studentId === studentId || assistants.has(row.sourceId) || assessments.has(row.sourceId) || missions.has(row.sourceId));
  const allIds = new Set(Object.values(result).flat().map(recordId).filter(Boolean));
  add(result, store, 'events', row => hasReference(row.payload, allIds));
  return result;
}

export function accountRecords(store: InMemoryStoreService, actorId: string, principal: string): Selection {
  const result: Selection = {};
  add(result, store, 'users', row => row.id === actorId);
  add(result, store, 'sessions', row => row.userId === actorId || row.guardianId === actorId);
  add(result, store, 'bindings', row => row.parentUserId === actorId);
  add(result, store, 'studentInvitations', row => row.issuerId === actorId || row.recipientPrincipal === principal);
  add(result, store, 'studentLearningCodes', row => row.createdBy === actorId);
  add(result, store, 'teacherAssignments', row => row.grantedBy === actorId || row.teacherUserId === actorId);
  add(result, store, 'libraryBookmarks', row => row.userId === actorId);
  add(result, store, 'diagnosticBlueprints', row => row.actorId === actorId);
  add(result, store, 'assistantSessions', row => row.ownerUserId === actorId);
  add(result, store, 'classroomSessions', row => row.ownerUserId === actorId);
  add(result, store, 'classroomVisuals', row => row.ownerUserId === actorId);
  add(result, store, 'courseProjects', row => row.ownerUserId === actorId);
  add(result, store, 'sourceCourses', row => row.ownerUserId === actorId && (!row.studentId || !['active','archived'].includes(row.status)));
  const sourceCourseIds=ids(result,'sourceCourses');add(result,store,'sourceCourseStages',row=>sourceCourseIds.has(row.courseId));
  add(result, store, 'studioMaterialUploads', row => row.ownerUserId === actorId && (!row.studentId || row.status !== 'completed'));
  add(result,store,'studioOriginalRepairs',row=>row.ownerUserId===actorId);
  add(result, store, 'studioSourceMaterials', row => row.ownerUserId === actorId && !row.studentId);
  const sessions = ids(result, 'assistantSessions'); add(result, store, 'assistantMessages', row => sessions.has(row.sessionId));
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
    activities: count('diagnosticSessions', 'practiceSessions', 'assessments', 'missions'), plans: count('diagnosticPlans', 'studyPlans', 'reviewTasks', 'guidancePlanRevisions', 'gespGuidancePlans', 'gespGuidancePlanRevisions', 'gespReviewTasks'),
    conversations: count('assistantMessages'), accessRecords: count('users', 'sessions', 'bindings', 'studentLearningAccess', 'studentLearningCodes', 'studentInvitations', 'teacherAssignments') };
}
export function selectionFingerprint(selection: Selection, context: unknown) {
  return digest({ context, collections: Object.keys(selection).sort().map(name => [name, [...selection[name]].sort((a, b) => recordId(a).localeCompare(recordId(b)))]) });
}
export function removeSelected(store: InMemoryStoreService, selection: Selection) {
  for (const [name, selected] of Object.entries(selection)) {
    const remove = new Set(selected.map(recordId));
    (store as unknown as Record<string, Row[]>)[name] = rows(store, name).filter(row => !remove.has(recordId(row)));
  }
}
// Tokens, passwords, internal idempotency digests and other guardians' private chats are never exported.
const secretFields = new Set(['passwordHash', 'credential', 'token', 'tokenHash', 'requestHash', 'inputHash', 'scopeKey', 'requestKey', 'decisionHash']);
function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !secretFields.has(key)).map(([key, child]) => [key, scrub(child)]));
  return value;
}
export function portableRecords(selected: Selection, actorId: string): Record<string, unknown[]> {
  const allowedAssistants = new Set((selected.assistantSessions ?? []).filter(row => row.ownerUserId === actorId ||
    (selected.users ?? []).some(user => user.id === row.ownerUserId && user.role === 'student')).map(recordId));
  const result: Selection = {};
  for (const [name, records] of Object.entries(selected)) {
    if (['users', 'sessions', 'studentLearningCodes', 'studentInvitations', 'events'].includes(name)) continue;
    if (name === 'assistantSessions') result[name] = records.filter(row => allowedAssistants.has(row.id));
    else if (name === 'assistantMessages') result[name] = records.filter(row => allowedAssistants.has(row.sessionId));
    else if (name === 'classroomSessions') result[name] = records.filter(row => row.ownerUserId === actorId ||
      (selected.users ?? []).some(user => user.id === row.ownerUserId && user.role === 'student'))
      .map(({ answerKeys: _answerKeys, hintKeys: _hintKeys, requests: _requests, ...row }) => row);
    else if (name === 'classroomVisuals') result[name] = records.filter(row => row.ownerUserId === actorId ||
      (selected.users ?? []).some(user => user.id === row.ownerUserId && user.role === 'student'))
      .map(({prompt:_prompt,requestKey:_key,inputHash:_hash,requests:_requests,selectionKey,files,...row})=>({...row,selected:selectionKey!==null,files:files?{image:files.image,original:files.original}:null}));
    else if (name === 'courseProjects') result[name] = records.filter(row => row.ownerUserId === actorId ||
      (selected.users ?? []).some(user => user.id === row.ownerUserId && user.role === 'student')).map(({ requests: _requests, ...row }) => row);
    else if(name==='studioMaterialUploads')result[name]=records.filter(row=>row.ownerUserId===actorId||row.status==='completed').map(({requestKey:_key,requestHash:_hash,aliases:_aliases,guardianId:_guardian,accessVersion:_version,filesCollectedAt:_collected,...row})=>row);
    else if(name==='studioSourceMaterials')result[name]=records.map(row=>studioMaterialView(row as any));
    else if(name==='studioOriginalRepairs')result[name]=records.map(({id,materialId,uploadId,status,revision,createdAt,updatedAt,completedAt,receipt})=>({id,materialId,uploadId,status,revision,createdAt,updatedAt,completedAt,receipt}));
    else if(name==='studioConnectors')result[name]=records.map(({encryptedFeedUrl:_feed,requestKey:_key,requestHash:_hash,...row})=>row);
    else if(name==='sourceCourses')result[name]=records.filter(row=>row.ownerUserId===actorId||
      (selected.users??[]).some(user=>user.id===row.ownerUserId&&user.role==='student')||row.studentId&&['active','archived'].includes(row.status))
      .map(({requests:_requests,result:_result,originalResult:_original,edits:_edits,generation:_generation,compilation:_compilation,...row})=>({...row,generation:generationView({...row,result:_result,generation:_generation} as any),...(_compilation?{compilation:compilationView({...row,result:_result,compilation:_compilation} as any,actorId)}:{}),lessons:_result?.lessons.map((_:unknown,index:number)=>sourceCourseLesson({...row,result:_result,compilation:_compilation} as any,index))??[]}));
    else if(name==='sourceCourseStages')result[name]=records.map(({id,courseId,kind,key,createdAt,modelId,modelName})=>({id,courseId,kind,key,createdAt,modelId,modelName}));
    else if (name === 'aiInsights') result[name] = records.filter(row => row.sourceType !== 'assistant' || allowedAssistants.has(row.sourceId) || (selected.diagnosticPlans ?? []).some(plan => plan.id === row.sourceId));
    else result[name] = records;
  }
  return scrub(result) as Record<string, unknown[]>;
}

/** Retain shared children's learning history while removing a closed account's attribution. */
export function anonymizeSharedAttribution(store: InMemoryStoreService, studentIds: string[], actorId: string) {
  const actorFields = new Set(['actorId', 'createdBy', 'decidedBy', 'reviewerId', 'grantedBy', 'revokedBy', 'proposedBy', 'ownerUserId', 'confirmedByUserId', 'createdByUserId', 'decidedByUserId']);
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
      const anonymous = replace(row) as Row;
      // Different closed upload owners can have used the same request key.
      // A per-file anonymous owner preserves uniqueness without retaining identity.
      if (name === 'studentMedia' && row.ownerUserId === actorId) anonymous.ownerUserId = `deleted-account:${row.id}`;
      if(name==='studioConnectors'&&row.createdBy===actorId){anonymous.status='revoked';anonymous.encryptedFeedUrl='';anonymous.version=(Number(row.version)||0)+1;anonymous.lastError=null;}
      return anonymous;
    });
  }
}

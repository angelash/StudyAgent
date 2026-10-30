import { diagnosticResponseInputSchema, type DiagnosticResponse, type DiagnosticResponseInput, type QuestionAnswerSchema, type PrivacyReceipt } from '@study-agent/contracts';
import { createHash } from 'node:crypto';
import { answerIdentity } from '../../common/answer-draft';
import type { ControlledDiagnosticSession } from './controlled-session-origin';
import { atomDefinitionFingerprint } from './measurement-definition';
import { controlledActorIdentity, controlledActorFingerprint } from './controlled-actor-identity';
import { gradeResponse } from './scoring';

export type ControlledDiagnosticResponse = DiagnosticResponse & {
  controlledOrigin: { protocol: 'controlled-cause-response-v1'; publicationId: string; publicationFingerprint: string; unitId: string; condition: 'control'|'challenge'; actorId: string };
  controlledInput: DiagnosticResponseInput;
};
export function controlledResponseOrigin(session: ControlledDiagnosticSession, itemId: string, actorId: string) {
  const unit = session.controlledContrast.units.find(unit => unit.order.some(arm => arm.packet.itemId === itemId));
  const arm = unit?.order.find(arm => arm.packet.itemId === itemId);
  if (!unit || !arm || !actorId) throw Error('controlled_response_original_source_missing');
  return { protocol: 'controlled-cause-response-v1' as const, publicationId: session.controlledOrigin.publicationId,
    publicationFingerprint: session.controlledOrigin.publicationFingerprint, unitId: unit.unitId, condition: arm.condition, actorId };
}

/** Original raw scores are regraded from frozen originals. Human scoring
 * revisions remain separate records and never rewrite these first responses.
 */
export function assertControlledResponseRecords(input: { sessions: readonly ControlledDiagnosticSession[]; responses: readonly DiagnosticResponse[];
  students: readonly { id: string; userId?: string|null }[]; users: readonly {id:string}[]; receipts: readonly PrivacyReceipt[];
  drafts: readonly {sessionId:string;itemId:string;revision?:number}[]; hints: readonly { sessionId: string; itemId: string; level: number; at?: string }[] }) {
  try {
    const sessionIds = new Set(input.sessions.map(session => session.id));
    if (input.responses.some(row => ('controlledOrigin' in row || 'controlledInput' in row || row.evidencePurpose === 'controlled_cause_observation') && !sessionIds.has(row.sessionId))) throw Error();
    for (const session of input.sessions) {
      const userId = input.students.find(child => child.id === session.studentId)?.userId;
      const responses = input.responses.filter(row => row.sessionId === session.id) as ControlledDiagnosticResponse[];
      if (!userId || responses.length > session.itemIds.length || new Set(responses.map(row => row.id)).size !== responses.length ||
          new Set(responses.map(row => row.itemId)).size !== responses.length || session.status === 'completed' && responses.length !== session.itemIds.length) throw Error();
      const byItem = new Map(responses.map(row => [row.itemId, row]));
      let state='in_progress', revision=1, stateAt=Date.parse(session.startedAt);
      const history = (session.stateHistory ?? []) as Array<NonNullable<ControlledDiagnosticSession['stateHistory']>[number] & {expectedRevision:number}>;
      const states = [{at:stateAt,state}], stateCommands = new Set<string>();
      for(const event of history){
        const command = {action:event.action,expectedRevision:event.expectedRevision,requestKey:event.requestKey,reason:event.reason}, at=Date.parse(event.at);
        const actorKnown=input.users.some(user=>controlledActorIdentity(user.id)===event.actorId)||input.receipts.some(receipt=>receipt.kind==='account_delete'&&controlledActorIdentity(receipt.actorId)===event.actorId&&receipt.retainedStudentHashes?.includes(controlledActorFingerprint(session.studentId))&&Date.parse(receipt.completedAt)>=at);
        if(!actorKnown||!Number.isFinite(at)||at<stateAt||event.expectedRevision!==revision||event.revision!==revision+1||!event.requestKey||event.reason.length<5||
            event.requestHash!==createHash('sha256').update(JSON.stringify(command)).digest('hex')||stateCommands.has(event.actorId+'\0'+event.requestKey)||
            event.action==='pause'&&state!=='in_progress'||event.action==='resume'&&state!=='paused'||event.action==='abort'&&!['in_progress','paused'].includes(state)||!['pause','resume','abort'].includes(event.action))throw Error();
        state=event.action==='pause'?'paused':event.action==='resume'?'in_progress':'aborted';revision++;stateAt=at;stateCommands.add(event.actorId+'\0'+event.requestKey);states.push({at,state});
      }
      if(session.revision!==revision||(session.status==='completed'?(state!=='in_progress'||!session.completedAt||Date.parse(session.completedAt)<stateAt):session.status!==state)||session.status==='aborted'&&Date.parse(session.endedAt??'')!==stateAt)throw Error();
      let priorAt = Date.parse(session.startedAt), missing = false;
      for (const itemId of session.itemIds) {
        const row = byItem.get(itemId); if (!row) { missing = true; continue; }
        const command = diagnosticResponseInputSchema.parse(row.controlledInput), mapping = session.itemSnapshots.find(item => item.id === itemId)!;
        const original = session.questionSnapshots.find(question => question.id === mapping.questionId)!;
        const atom = session.atomSnapshots!.find(atom => atom.id === mapping.atomId)!;
        const at = Date.parse(row.submittedAt), endedAt = session.completedAt ?? session.endedAt;
        const draft = input.drafts.find(draft=>draft.sessionId===session.id&&draft.itemId===itemId), schema=original.answerSchema as QuestionAnswerSchema;
        const hints = input.hints.filter(hint => hint.sessionId === session.id && hint.itemId === itemId && Date.parse(hint.at ?? '') <= at);
        const grade = command.disposition === 'answered' ? gradeResponse(original.answerSchema as QuestionAnswerSchema, original.answer, command.answer) :
          command.disposition === 'dont_know' ? { score: 0, correct: false, status: 'scored', reason: '学生选择暂时不会，作为当前任务表现记录。' } :
            { score: null, correct: null, status: 'skipped', reason: '本题已跳过，不计为错误。' };
        const same = (left: unknown, right: unknown) => answerIdentity(left) === answerIdentity(right);
        if (missing || !Number.isFinite(at) || at < priorAt || endedAt && at > Date.parse(endedAt) ||
            !states.some((event,index)=>event.state==='in_progress'&&event.at<=at&&(states[index+1]?.at??Infinity)>=at)||
            row.id !== `response:${session.id}:${itemId}` || row.studentId !== session.studentId || row.questionId !== mapping.questionId ||
            row.atomId !== mapping.atomId || row.family !== mapping.family || row.dimension !== mapping.dimension ||
            row.questionVersion !== mapping.questionVersion || row.mappingVersion !== mapping.version || row.atomVersion !== atom.version ||
            row.atomDefinitionFingerprint !== atomDefinitionFingerprint(atom) || !same(row.controlledOrigin, controlledResponseOrigin(session, itemId, userId)) ||
            !same(command, row.controlledInput) || !command.requestKey || command.draftFence?.actorId !== userId || command.itemId !== itemId ||
            command.draftFence.attempt!==0||command.draftFence.revision!==(draft?.revision??0)||command.draftFence.baseHash!==answerIdentity(['diagnostic',session.id,itemId,mapping.questionVersion,original.document,schema.mode,schema.responseShape,schema.options])||
            row.requestKey !== command.requestKey || row.requestHash !== answerIdentity(command) || !same(row.answer, command.answer ?? null) ||
            row.elapsedMs !== command.elapsedMs || row.disposition !== command.disposition || row.hintLevel !== Math.max(0, ...hints.map(hint => hint.level)) ||
            !same({ score: row.score, correct: row.correct, status: row.status, reason: row.gradingReason }, { score: grade.score, correct: grade.correct, status: grade.status, reason: grade.reason }) ||
            !same(row.scoreDetails, 'scoreDetails' in grade ? grade.scoreDetails : undefined) || row.gradingVersion !== 'deterministic-rubric-v2' ||
            row.retentionDelayDays !== null || row.retentionEvidence !== undefined || row.evidencePurpose !== 'controlled_cause_observation') throw Error();
        priorAt = at;
      }
    }
  } catch (error) { throw Error('controlled_response_saved_original_integrity_failed', { cause: error }); }
}

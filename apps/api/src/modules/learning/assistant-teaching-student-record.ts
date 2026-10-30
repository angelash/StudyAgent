import { z } from 'zod';
import { assistantTeachingStudentStartSchema } from '@study-agent/contracts';
import { teachingSelfSessionRecordSchema,emptyTeachingSelfState,applyTeachingSelfCommand,teachingSelfHash,type TeachingSelfSessionRecord,type TeachingSelfCommand } from './assistant-teaching-self-record';
import { topicWhiteboardDigest as digest } from './topic-whiteboard-digest';
const id=z.string().min(1).max(180),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.string().datetime();
const schema=teachingSelfSessionRecordSchema.omit({protocol:true,studentId:true,subject:true,startInput:true,startReceipt:true}).extend({protocol:z.literal('assistant-generated-student-session-v1'),ownerRole:z.literal('student'),studentId:id,subject:z.enum(['math','chinese','english','chemistry']),assignmentId:id,assignmentFingerprint:hash,referenceOfferedBeforeStart:z.boolean(),startInput:assistantTeachingStudentStartSchema,startReceipt:z.object({sessionId:id,assignmentId:id,assignmentFingerprint:hash,contentFingerprint:hash,commandFingerprint:hash,startedAt:time}).strict()}).strict();
export type TeachingStudentSessionRecord=Omit<z.infer<typeof schema>,'commands'>&{commands:TeachingSelfCommand[]};
export type TeachingSessionRecord=TeachingSelfSessionRecord|TeachingStudentSessionRecord;
export function assertTeachingStudentSession(value:unknown):TeachingStudentSessionRecord{
 try{const row=schema.parse(value) as TeachingStudentSessionRecord,receipt=row.startReceipt;
  if(digest(row)!==digest(value)||row.contentSnapshot.questions.some(question=>question.targetAtomIds.length!==1||question.sourceMap.messageIds.length||question.sourceMap.referenceKeys.length)||digest(row.contentSnapshot)!==row.contentFingerprint||row.startInput.requestKey!==row.requestKey||row.startInput.assignmentFingerprint!==row.assignmentFingerprint||row.startHash!==teachingSelfHash('start',row.ownerUserId,row.assignmentId,row.startInput)||receipt.sessionId!==row.id||receipt.assignmentId!==row.assignmentId||receipt.assignmentFingerprint!==row.assignmentFingerprint||receipt.contentFingerprint!==row.contentFingerprint||receipt.commandFingerprint!==row.startHash||receipt.startedAt!==row.createdAt)throw Error();
  const state={...structuredClone(row),...emptyTeachingSelfState(row.createdAt),commands:[]} as TeachingStudentSessionRecord,keys=new Set<string>(),effects=new Set<string>();
  for(const command of row.commands){if(keys.has(command.key)||effects.has(command.effectId))throw Error();keys.add(command.key);effects.add(command.effectId);const expected=applyTeachingSelfCommand(state,command as TeachingSelfCommand);if(digest(expected)!==digest(command.receipt))throw Error();state.commands.push(command);}
  for(const key of ['status','stateVersion','draftVersions','drafts','attempts','helps','completedAt','updatedAt']as const)if(digest(state[key])!==digest(row[key]))throw Error();return row;
 }catch(error){throw new Error('assistant_teaching_student_integrity_failed',{cause:error});}
}

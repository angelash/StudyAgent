import type { DiagnosticSession, QuestionRenderPayload, Question, QuestionDocument, QuestionAnswerSchema, QuestionSourceRecord } from '@study-agent/contracts';
import { assertControlledMaterialOriginal, type ControlledMaterialSnapshot } from './controlled-contrast-snapshot';
import { retentionDigest } from './retention-anchor';

/** Staff preflight and frozen originals share a pure display projection. */
export function controlledReadOnlyQuestionPayload(input:{question:Question;document?:QuestionDocument;answerSchema:QuestionAnswerSchema;source:QuestionSourceRecord;blockId:string}):QuestionRenderPayload{
  const {question}=input;
  return structuredClone({question:{id:question.id,subject:question.subject,type:question.type,difficultyLevel:question.difficultyLevel,status:question.status},
    document:input.document??{questionId:question.id,version:1,locale:'zh-CN',blocks:[{id:input.blockId,type:'text',text:question.stem}],attachments:[],layoutMode:'default',accessibilityConfig:{}},
    answerSchema:input.answerSchema,source:input.source});
}

/** Render the actual frozen original. Legacy text-only material gets stable local
 * block identities without adding documents to the mutable question store during preview.
 */
export function controlledMaterialQuestionSnapshot(value: ControlledMaterialSnapshot): DiagnosticSession['questionSnapshots'][number] {
  const original = assertControlledMaterialOriginal(value), records = structuredClone(original.originals), question = records.questions[0];
  // Approval already requires an actual scoring schema and authorized source.
  // Only old text-only documents need a local display block, with the same
  // defaults used by the question workspace and a stable original block id.
  // This pure projection is also safe while a native reader initializes Store.
  const payload=controlledReadOnlyQuestionPayload({question:question as Question,document:records.questionDocuments[0] as QuestionDocument|undefined,
    answerSchema:records.questionAnswerSchemas[0] as QuestionAnswerSchema,source:records.questionSources[0] as QuestionSourceRecord,
    blockId:'controlled_render:'+retentionDigest({materialReviewId:original.review.id,kind:'block',sequence:1})});
  return structuredClone({ id: question.id, stem: question.stem, answer: question.answer, analysis: question.analysis,
    document: payload.document, answerSchema: payload.answerSchema, renderPayload: payload, questionType: question.type });
}

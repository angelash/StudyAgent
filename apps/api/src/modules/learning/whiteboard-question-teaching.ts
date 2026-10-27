import { BadRequestException, ConflictException } from '@nestjs/common';
import { z } from 'zod';
import { classroomBoardProgress, whiteboardPresentation, type StudioQuestionWhiteboard, type StudioWhiteboard,
  type StudioTopicWhiteboard, type StudioWhiteboardScene } from '@study-agent/contracts';
import { classroomReplyPresentationSchema, parseClassroomReplyBoard } from '../ai/classroom-reply-board';
import { freezeSpeechTrack, verifySpeechTrack } from './classroom-presentation';
import { parseWhiteboardQuestionReply, type buildWhiteboardQuestionContext } from './whiteboard-question-context';
import type { WhiteboardQuestionRecord } from './whiteboard-question-record';
import { topicWhiteboardDigest } from './topic-whiteboard-content';

export const whiteboardQuestionTeachingSchema = { type: 'object', properties: {
  reply: { type: 'string' }, anchors: { type: 'array', items: { type: 'string' } }, board: classroomReplyPresentationSchema.properties.board,
}, required: ['reply', 'anchors', 'board'], additionalProperties: false };
export function parseWhiteboardQuestionTeaching(prepared: Pick<ReturnType<typeof buildWhiteboardQuestionContext>, 'view'>, value: unknown) {
  const input = z.object({ reply: z.string(), anchors: z.array(z.string()), board: z.unknown() }).strict().parse(value);
  if (!input.board) throw new BadRequestException('本次回答缺少结构化补充板书');
  const reply = parseWhiteboardQuestionReply(prepared, { reply: input.reply, anchors: input.anchors });
  const teaching = parseClassroomReplyBoard({ reply: reply.reply, evidenceIds: [], board: input.board }, { replyMaxLength: 8000, formulaMaxLength: 4000 });
  return { ...reply, board: teaching.board, speech: freezeSpeechTrack(teaching.reply) };
}

export function whiteboardAnswerFingerprint(reply: NonNullable<WhiteboardQuestionRecord['reply']>) {
  return topicWhiteboardDigest({ version: 'whiteboard-answer-v1', text: reply.text, anchors: reply.anchors, modelId: reply.modelId,
    board: reply.board ?? null, speech: reply.speech ?? null });
}

/** Derive a playable answer from the published turn. The original manuscript is never rewritten. */
export function buildQuestionWhiteboard(turn: WhiteboardQuestionRecord, original: StudioWhiteboard | StudioTopicWhiteboard): StudioQuestionWhiteboard {
  const reply = turn.reply;
  if (turn.status !== 'completed' || !reply) throw new ConflictException('补充讲解尚未完成');
  const speech = reply.speech ?? freezeSpeechTrack(reply.text);
  verifySpeechTrack(reply.text, speech, 'speech-v2');
  const replyFingerprint = whiteboardAnswerFingerprint(reply);
  if (reply.fingerprint && reply.fingerprint !== replyFingerprint) throw new ConflictException('原回答身份不一致');
  const scene: StudioWhiteboardScene = { id: 'question-answer', kind: 'concept', title: reply.board?.title ?? 'AI补充讲解',
    narration: reply.text, durationMs: 1, targetAtomIds: [], bullets: [], exhibits: [] };
  if (reply.board) {
    const board = reply.board, plan = board.reveal;
    if (!plan || classroomBoardProgress(board, speech).mode !== 'verified') throw new ConflictException('补充板书的原句计划不可用');
    const end = (id: string) => {
      const unit = speech.units.find(unit => unit.id === id);
      if (!unit) throw new ConflictException('补充板书引用了其他回答的句子');
      return unit.end;
    };
    scene.bullets = structuredClone(board.points);
    const exhibits: NonNullable<StudioWhiteboardScene['exhibits']> = [], reveal: NonNullable<StudioWhiteboardScene['reveal']> = {
      version: 'whiteboard-reveal-v1', sourceText: reply.text, bulletEnds: plan.pointUnitIds.map(end), exhibits: [],
    };
    if (board.table) {
      const rowEnds = plan.tableRowUnitIds.map(end);
      exhibits.push({ kind: 'table', headers: structuredClone(board.table.headers), rows: structuredClone(board.table.rows) });
      reveal.exhibits.push({ at: rowEnds[0], rowEnds });
    }
    for (const [index, formula] of (board.formulas ?? []).entries()) {
      exhibits.push({ kind: 'formula', latex: formula.latex, explanation: formula.label + '：' + formula.meaning });
      reveal.exhibits.push({ at: end(plan.formulaUnitIds[index]) });
    }
    if (board.diagram) {
      if (!['venn', 'flow'].includes(board.diagram.kind)) throw new ConflictException('不支持的补充关系图');
      scene.diagram = { kind: board.diagram.kind as 'venn' | 'flow', title: board.diagram.title, labels: structuredClone(board.diagram.labels) };
      reveal.diagramAt = reveal.bulletEnds[0];
    }
    scene.exhibits = exhibits; scene.reveal = reveal;
  }
  const fingerprint = topicWhiteboardDigest({ version: 'question-whiteboard-v1', boardKind: turn.boardKind, boardId: turn.boardId,
    turnId: turn.id, originalFingerprint: turn.position.fingerprint, replyFingerprint });
  const scenes = [scene], durationMs = whiteboardPresentation({ fingerprint, scenes }).units.reduce((sum, unit) => sum + unit.estimatedMs, 0);
  scene.durationMs = durationMs;
  return { id: 'question-whiteboard:' + turn.id, kind: 'question-whiteboard', studentId: turn.studentId, subject: original.subject,
    atomId: 'atomId' in original ? original.atomId : null, title: scene.title, prompt: turn.message, scenes, durationMs, width: 1280, height: 720,
    fingerprint, originalBoardKind: turn.boardKind, originalBoardId: turn.boardId, turnId: turn.id, replyFingerprint,
    originalPosition: structuredClone(turn.position), structureStatus: reply.board ? 'structured' : 'text-only',
    origin: { modelId: reply.modelId, modelName: reply.modelName, teacherReviewStatus: 'pending', formalMeasurementEligible: false },
    createdAt: reply.createdAt, updatedAt: reply.createdAt };
}

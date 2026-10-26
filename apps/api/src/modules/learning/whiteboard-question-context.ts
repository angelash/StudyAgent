import { BadRequestException, ConflictException } from '@nestjs/common';
import { z } from 'zod';
import { teachingVisualSchema, whiteboardPresentation, whiteboardTaughtTableRows,
  type StudioWhiteboard, type StudioTopicWhiteboard, type StudioWhiteboardScene, type WhiteboardSpeechUnit,
  type WhiteboardQuestionAnchor, type WhiteboardQuestionBoardKind, type WhiteboardQuestionContextView } from '@study-agent/contracts';
import { topicWhiteboardDigest } from './topic-whiteboard-content';

export const whiteboardQuestionContextVersion = 'whiteboard-question-context-v1';
const previousSceneLimit = 3, contextLimit = 18000;
type QuestionBoard = StudioWhiteboard | StudioTopicWhiteboard;

/** Select public teaching fields explicitly; owner, authorization and provider URLs never enter model data. */
function teachingScene(scene: StudioWhiteboardScene, unit?: WhiteboardSpeechUnit, complete = true) {
  const table = scene.exhibit?.kind === 'table' ? scene.exhibit : null;
  const exhibit = table ? { kind: 'table' as const, headers: [...table.headers],
    rows: table.rows.slice(0, whiteboardTaughtTableRows(scene, unit, complete)).map(row => [...row]),
    unshownRows: table.rows.length - whiteboardTaughtTableRows(scene, unit, complete) } :
    scene.exhibit?.kind === 'formula' ? { kind: 'formula' as const, latex: scene.exhibit.latex, explanation: scene.exhibit.explanation } : undefined;
  const visual = scene.visual ? teachingVisualSchema.parse({ kind: scene.visual.kind, title: scene.visual.title, note: scene.visual.note,
    operator: scene.visual.operator, commonDenominator: scene.visual.commonDenominator,
    terms: scene.visual.terms.map(term => ({ numerator: term.numerator, denominator: term.denominator, label: term.label })),
    result: { numerator: scene.visual.result.numerator, denominator: scene.visual.result.denominator } }) : undefined;
  const figure = scene.figure ? { snapshotId: scene.figure.snapshotId, sha256: scene.figure.sha256,
    width: scene.figure.width, height: scene.figure.height, alt: scene.figure.alt, caption: scene.figure.caption } : undefined;
  const source = scene.source ? { materialId: scene.source.materialId, page: scene.source.page, label: scene.source.label } : undefined;
  if (source && (!source.materialId || !Number.isSafeInteger(source.page) || source.page < 1 || typeof source.label !== 'string'))
    throw new BadRequestException('原白板来源页标识无效，请重新读取原件');
  return { id: scene.id, kind: scene.kind, title: scene.title,
    ...(scene.body ? { body: scene.body } : {}),
    ...(scene.bullets ? { bullets: scene.bullets.filter((_, index) => complete || unit?.visibleBulletIndices.includes(index)) } : {}),
    ...(exhibit ? { exhibit } : {}), ...(visual ? { visual } : {}), ...(figure ? { figure } : {}), ...(source ? { source } : {}),
    targetAtomIds: [...(scene.targetAtomIds ?? [])] };
}

function anchor(boardKind: WhiteboardQuestionBoardKind, boardId: string, value: Omit<WhiteboardQuestionAnchor, 'id'>): WhiteboardQuestionAnchor {
  return { id: 'wq1:' + topicWhiteboardDigest({ boardKind, boardId, sceneId: value.sceneId, unitId: value.unitId, source: value.source }), ...value };
}

/** Authorization must be checked by the caller against this exact server-owned original before and after work. */
export function buildWhiteboardQuestionContext(board: QuestionBoard, boardKind: WhiteboardQuestionBoardKind, unitId: string, fingerprint: string) {
  const topic = 'kind' in board && board.kind === 'ai-topic-whiteboard';
  if ((boardKind === 'topic') !== topic || !['guidance', 'topic'].includes(boardKind)) throw new BadRequestException('白板类型与原件不一致');
  if (board.fingerprint !== fingerprint) throw new ConflictException('原白板版本已变化，请保留问题并重新读取');
  if (new Set(board.scenes.map(scene => scene.id)).size !== board.scenes.length) throw new BadRequestException('原白板存在重复知识块标识');
  const presentation = whiteboardPresentation(board), index = presentation.units.findIndex(unit => unit.id === unitId);
  if (index < 0) throw new ConflictException('原句不属于这份白板，请重新选择讲解位置');
  const unit = presentation.units[index], originalScene = board.scenes.find(scene => scene.id === unit.sceneId)!;
  const seen = new Set(presentation.units.slice(0, index + 1).map(item => item.sceneId)), shown = board.scenes.filter(scene => seen.has(scene.id));
  const prior = shown.filter(scene => scene.id !== unit.sceneId);
  function prompt(previous: StudioWhiteboardScene[]) {
    const blocks = [...previous, originalScene].map(scene => teachingScene(scene, scene.id === unit.sceneId ? unit : undefined, scene.id !== unit.sceneId));
    const anchors: WhiteboardQuestionAnchor[] = [anchor(boardKind, board.id, { sceneId: unit.sceneId, unitId: unit.id, label: unit.text })];
    for (const scene of blocks) {
      anchors.push(anchor(boardKind, board.id, { sceneId: scene.id, label: scene.title }));
      if (scene.source) anchors.push(anchor(boardKind, board.id, { sceneId: scene.id, label: scene.source.label, source: scene.source }));
    }
    const context = { version: whiteboardQuestionContextVersion, boardKind, boardId: board.id, title: board.title, topic: board.prompt,
      audience: board.studentId === null ? 'adult' as const : 'student' as const, subject: board.subject,
      targetAtomIds: [...new Set([...blocks.flatMap(scene => scene.targetAtomIds), ...(!topic && 'atomId' in board && board.atomId ? [board.atomId] : [])])],
      currentSentence: { unitId: unit.id, sceneId: unit.sceneId, text: unit.text }, blocks,
      coverage: { includedSceneIds: blocks.map(scene => scene.id), earlierSceneCountNotIncluded: prior.length - previous.length,
        note: '当前原句、当前完整可读知识块及最近最多三个已讲知识块。未列出的早前内容与未来讲解未进入本次模型上下文。' },
      anchors: structuredClone(anchors), measurementNotice: '这是辅助讲解，不能作为独立首答或知识掌握结论。' };
    return { context, anchors, contextJson: JSON.stringify(context) };
  }
  let selected = prior.slice(-previousSceneLimit), prepared = prompt(selected);
  while (prepared.contextJson.length > contextLimit && selected.length) { selected = selected.slice(1); prepared = prompt(selected); }
  const { context, anchors, contextJson } = prepared;
  if (contextJson.length > contextLimit) throw new BadRequestException('当前原稿知识块过长，请定位到更具体的知识点后提问');
  // The entire public original remains a publication fence, including content outside the bounded prompt.
  const contentHash = topicWhiteboardDigest({ boardKind, boardId: board.id, title: board.title, prompt: board.prompt,
    scope: { studentId: board.studentId, subject: board.subject, atomId: !topic && 'atomId' in board ? board.atomId : null },
    fingerprint: board.fingerprint, scenes: board.scenes.map(scene => ({ ...teachingScene(scene), narration: scene.narration })) });
  const contextVersion = topicWhiteboardDigest({ version: whiteboardQuestionContextVersion, contentHash, context });
  const view: WhiteboardQuestionContextView = { boardKind, boardId: board.id, title: board.title, contextVersion,
    position: { presentationVersion: presentation.version, fingerprint: board.fingerprint, sceneId: unit.sceneId, unitId: unit.id, sentenceText: unit.text },
    anchors: structuredClone(anchors) };
  return { contextVersion, contentHash, contextJson, context, view };
}

const replySchema = z.object({ reply: z.string().trim().min(1).max(8000), anchors: z.array(z.string().min(1).max(100)).max(16).default([]) }).strict();
export function parseWhiteboardQuestionReply(prepared: Pick<ReturnType<typeof buildWhiteboardQuestionContext>, 'view'>, value: unknown) {
  const parsed = replySchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('模型返回的补充讲解格式无效');
  const known = new Map(prepared.view.anchors.map(item => [item.id, item]));
  if (new Set(parsed.data.anchors).size !== parsed.data.anchors.length || parsed.data.anchors.some(id => !known.has(id)))
    throw new BadRequestException('模型引用了本次上下文以外的原稿位置');
  return { reply: parsed.data.reply, anchors: parsed.data.anchors.map(id => structuredClone(known.get(id)!)) };
}

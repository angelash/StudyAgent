import { describe, expect, it } from 'vitest';
import { whiteboardPresentation, whiteboardSceneProgress, type StudioWhiteboard } from '@study-agent/contracts';
import { buildWhiteboardQuestionContext } from './whiteboard-question-context';
import { buildQuestionWhiteboard, parseWhiteboardQuestionTeaching, whiteboardAnswerFingerprint } from './whiteboard-question-teaching';
import type { WhiteboardQuestionRecord } from './whiteboard-question-record';

function original(): StudioWhiteboard {
  return { id: 'original', studentId: 'synthetic-child', subject: 'math', atomId: 'unit', title: '原讲解', prompt: '合成匿名条件',
    fingerprint: 'a'.repeat(64), width: 1280, height: 720, durationMs: 1000, createdAt: '2026-10-27', updatedAt: '2026-10-27',
    scenes: [{ id: 'original-scene', title: '原知识点', kind: 'concept', narration: '原句保持。', bullets: ['原句保持'], durationMs: 1000 }] };
}
function fixture() {
  const source = original(), unit = whiteboardPresentation(source).units[0], prepared = buildWhiteboardQuestionContext(source, 'guidance', unit.id, source.fingerprint);
  const input = { reply: '先统一计数单位。第一行比较单位。第二行对照条件。然后读分数公式。最后读根式公式。', anchors: [prepared.view.anchors[0].id], board: {
    title: '比较之前先确认条件', points: ['统一计数单位'], diagram: { kind: 'flow', title: '思考顺序', labels: ['确认单位','比较条件','独立验证'] },
    table: { title: '同维度比较', headers: ['观察','条件'], rows: [['第一组','单位相同'],['第二组','整体相同']] },
    formulas: [{ label: '分数', latex: '\\frac{1}{2}', meaning: '平均分成两份后的一份。' }, { label: '根式', latex: '\\sqrt{9}=3', meaning: '核对正数平方。' }],
    anchors: { points: ['先统一计数单位'], tableRows: ['第一行比较单位','第二行对照条件'], formulas: ['然后读分数公式','最后读根式公式'] },
  } };
  return { source, prepared, input };
}
function turn(value = fixture()): WhiteboardQuestionRecord {
  const teaching = parseWhiteboardQuestionTeaching(value.prepared, value.input);
  const reply = { text: teaching.reply, anchors: teaching.anchors, board: teaching.board, speech: teaching.speech, modelId: 'deepseek-v4-flash', modelName: '合成模型', createdAt: '2026-10-27' };
  return { id: 'original-turn', boardKind: 'guidance', boardId: value.source.id, ownerUserId: 'owner', studentId: value.source.studentId,
    message: '为什么先统一单位？', modelId: reply.modelId, modelName: reply.modelName, status: 'completed', position: value.prepared.view.position,
    reply: { ...reply, fingerprint: whiteboardAnswerFingerprint(reply) } } as WhiteboardQuestionRecord;
}
describe('structured supplementary whiteboard derived from a frozen original answer', () => {
  it('keeps only one copy of the unchanged narration while retaining the table, diagram and every formula', () => {
    const value = fixture(), record = turn(value), before = structuredClone({ record, source: value.source }), board = buildQuestionWhiteboard(record, value.source);
    expect(board).toMatchObject({ kind: 'question-whiteboard', originalBoardKind: 'guidance', originalBoardId: value.source.id, turnId: record.id,
      structureStatus: 'structured', origin: { formalMeasurementEligible: false, teacherReviewStatus: 'pending' } });
    expect(board.scenes).toHaveLength(1); expect(board.scenes.map(scene => scene.narration).join('')).toBe(value.input.reply);
    expect(board.scenes[0].exhibits).toHaveLength(3); expect(board.scenes[0].diagram?.kind).toBe('flow');
    expect(board.scenes[0].bullets).toEqual(['统一计数单位']); expect(board.scenes[0].bullets).not.toEqual([value.input.reply]);
    expect({ record, source: value.source }).toEqual(before);
  });
  it('reveals complete notes, whole table rows and whole formulas on actual sentence boundaries', () => {
    const value = fixture(), board = buildQuestionWhiteboard(turn(value), value.source), scene = board.scenes[0], units = whiteboardPresentation(board).units;
    expect(whiteboardSceneProgress(scene, 0)).toMatchObject({ mode: 'verified', bullets: [], exhibits: [false,false,false], rows: [0,0,0], diagram: false });
    expect(whiteboardSceneProgress(scene, units[0].end)).toMatchObject({ bullets: [0], exhibits: [false,false,false], diagram: true });
    expect(whiteboardSceneProgress(scene, units[1].end)).toMatchObject({ exhibits: [true,false,false], rows: [1,0,0] });
    expect(whiteboardSceneProgress(scene, units[2].end)).toMatchObject({ rows: [2,0,0] });
    expect(whiteboardSceneProgress(scene, units[3].end)).toMatchObject({ exhibits: [true,true,false] });
    expect(whiteboardSceneProgress(scene, units[4].end)).toMatchObject({ exhibits: [true,true,true] });
  });
  it('rejects foreign sources, forged note quotes and mismatched table dimensions', () => {
    const value = fixture(); value.input.anchors = ['foreign-source']; expect(() => parseWhiteboardQuestionTeaching(value.prepared, value.input)).toThrow('以外');
    const second = fixture(); second.input.board.anchors.points = ['不是原回答中的词句']; expect(() => parseWhiteboardQuestionTeaching(second.prepared, second.input)).toThrow();
    const third = fixture(); third.input.board.table.rows[0] = ['缺少一列']; expect(() => parseWhiteboardQuestionTeaching(third.prepared, third.input)).toThrow();
  });
  it('refuses unbound reply identities and notes that cite another speech track', () => {
    const value = fixture(), record = turn(value); record.reply!.text += '迟到改写。'; expect(() => buildQuestionWhiteboard(record, value.source)).toThrow();
    const other = turn(value); other.reply!.board!.reveal!.pointUnitIds[0] = 'another-speech-unit'; delete other.reply!.fingerprint;
    expect(() => buildQuestionWhiteboard(other, value.source)).toThrow('原句计划');
  });
  it('retains old text-only answers without inventing extracted board notes', () => {
    const value = fixture(), record = turn(value); delete record.reply!.board; delete record.reply!.speech; delete record.reply!.fingerprint;
    const board = buildQuestionWhiteboard(record, value.source); expect(board.structureStatus).toBe('text-only');
    expect(board.scenes[0].bullets).toEqual([]); expect(board.scenes[0].narration).toBe(record.reply!.text);
  });
  it('reveals nothing from a damaged source plan instead of falling back to all future notes', () => {
    const value = fixture(), scene = buildQuestionWhiteboard(turn(value), value.source).scenes[0]; scene.reveal!.sourceText = '不是原回答';
    expect(whiteboardSceneProgress(scene, scene.narration.length)).toMatchObject({ mode: 'invalid', bullets: [], exhibits: [false,false,false], diagram: false });
  });
  it('keeps a long complete formula including its final symbol without imposing the shorter ordinary-classroom output limit', () => {
    const value = fixture(), latex = '\\begin{aligned}' + 'a+'.repeat(600) + 'z\\end{aligned}'; value.input.board.formulas[0].latex = latex;
    const board = buildQuestionWhiteboard(turn(value), value.source);
    expect(board.scenes[0].exhibits?.[1]).toMatchObject({ kind: 'formula', latex });
    expect(board.scenes[0].narration).toBe(value.input.reply);
  });
});

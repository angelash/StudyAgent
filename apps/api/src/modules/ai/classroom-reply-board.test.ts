import { describe, it, expect } from 'vitest';
import { classroomBoardProgress } from '@study-agent/contracts';
import { freezeSpeechTrack } from '../learning/classroom-presentation';
import { parseClassroomReplyBoard, classroomReplyPresentationSchema } from './classroom-reply-board';

const reply = '先固定总量再观察份数。第一种情境有十二颗珠子和三个小组。第二种情境有十二颗珠子和四个小组。平均每份等于总量除以份数。最后用新的总量验证。';
const fixture = () => ({ reply, evidenceIds: [], board: { title: '总量、份数与平均每份', points: ['固定总量', '比较份数'], diagram: null,
  table: { title: '同一总量的两种分法', headers: ['总量','份数','每份'], rows: [['12','3','4'],['12','4','3']] },
  formulas: [{ label: '平均每份', latex: String.raw`\bar{x}=\frac{T}{n}`, meaning: '总量除以份数，份数必须大于零。' }],
  anchors: { points: ['固定总量','观察份数'], tableRows: ['三个小组','四个小组'], formulas: ['平均每份'] } } });

describe('structured reply boards bound to actual frozen speech units', () => {
  it('freezes only exact unit identities and reveals entire points, rows and formulas at their anchors', () => {
    const value = parseClassroomReplyBoard(fixture()), speech = freezeSpeechTrack(value.reply);
    expect(classroomBoardProgress(value.board, speech, null)).toEqual({ mode: 'verified', points: 0, tableRows: 0, formulas: 0 });
    expect(value.board).not.toHaveProperty('anchors'); expect(value.board.reveal?.sourceSha256).toBe(speech.sourceSha256);
    expect(classroomBoardProgress(value.board, speech, speech.units[0].id)).toEqual({ mode: 'verified', points: 2, tableRows: 0, formulas: 0 });
    expect(classroomBoardProgress(value.board, speech, speech.units[1].id).tableRows).toBe(1);
    expect(classroomBoardProgress(value.board, speech, speech.units[2].id)).toEqual({ mode: 'verified', points: 2, tableRows: 2, formulas: 0 });
    expect(classroomBoardProgress(value.board, speech, speech.units[3].id).formulas).toBe(1);
    expect(classroomBoardProgress(value.board, speech)).toEqual({ mode: 'verified', points: 2, tableRows: 2, formulas: 1 });
  });
  it('keeps old notes complete and declines a mismatched plan without inventing alignment', () => {
    const value = parseClassroomReplyBoard(fixture()), speech = freezeSpeechTrack(value.reply);
    expect(classroomBoardProgress({ title: '旧笔记', points: ['原条目'] })).toEqual({ mode: 'legacy', points: 1, tableRows: 0, formulas: 0 });
    expect(classroomBoardProgress(value.board, { ...speech, sourceSha256: 'different' }).mode).toBe('invalid');
    expect(classroomBoardProgress(value.board, speech, 'unknown-unit').mode).toBe('invalid');
    expect(classroomBoardProgress({ ...value.board, reveal: { ...value.board.reveal!, pointUnitIds: [] } }, speech).mode).toBe('invalid');
  });
  it('accepts no unnecessary table or formulas and normalizes only spoken whitespace in exact quotes', () => {
    const value = fixture(); value.board.table = null as any; value.board.formulas = []; value.board.anchors.tableRows = []; value.board.anchors.formulas = [];
    value.reply = value.reply.replace('固定总量', '固定  总量'); value.board.anchors.points[0] = '固定\n总量';
    const parsed = parseClassroomReplyBoard(value); expect(parsed.board.table).toBeUndefined(); expect(parsed.board.formulas).toBeUndefined();
  });
  it.each([
    (value: ReturnType<typeof fixture>) => { value.board.anchors.points[0] = '没有出现在原文'; },
    (value: ReturnType<typeof fixture>) => { value.board.anchors.points[0] = '先固定总量再观察份数。第一种'; },
    (value: ReturnType<typeof fixture>) => { value.board.anchors.tableRows.reverse(); },
    (value: ReturnType<typeof fixture>) => { value.board.anchors.tableRows[0] = '十二颗珠子'; },
    (value: ReturnType<typeof fixture>) => { value.board.anchors.formulas = []; },
    (value: ReturnType<typeof fixture>) => { value.board.table.rows[0].pop(); },
    (value: ReturnType<typeof fixture>) => { value.board.table.headers = ['a','b','c','d','e']; },
    (value: ReturnType<typeof fixture>) => { value.board.table.rows = Array.from({ length: 7 }, () => ['a','b','c']); },
    (value: ReturnType<typeof fixture>) => { value.board.table.rows[0][0] = 'x'.repeat(121); },
    (value: ReturnType<typeof fixture>) => { value.board.formulas[0].latex = String.raw`\href{javascript:alert(1)}{click}`; },
    (value: ReturnType<typeof fixture>) => { value.board.formulas[0].latex = String.raw`\def\x{\x}\x`; },
    (value: ReturnType<typeof fixture>) => { (value.board as any).html = '<script>alert(1)</script>'; },
  ])('rejects malformed structures, invented/ambiguous/out-of-order quotes and active TeX %#', change => {
    const value = fixture(); change(value); expect(() => parseClassroomReplyBoard(value)).toThrow();
  });
  it('requests every new field in the strict provider schema without requesting model-created unit IDs', () => {
    expect(classroomReplyPresentationSchema.properties.board.required).toEqual(['title','points','diagram','table','formulas','anchors']);
    expect(JSON.stringify(classroomReplyPresentationSchema)).not.toContain('unitId');
  });
});

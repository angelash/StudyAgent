import { z } from 'zod';
import { classroomSpeechText, type ClassroomReplyBoard } from '@study-agent/contracts';
import { freezeSpeechTrack } from '../learning/classroom-presentation';

const text = (max: number) => z.string().trim().min(1).max(max);
const unsafeTex = /\\(?:href|url|html[a-z]*|includegraphics|require|def|gdef|edef|xdef|newcommand|renewcommand|csname|input|write|read|openout|special|cssId|class|style)\b/iu;
const table = z.object({ title: text(100), headers: z.array(text(40)).min(2).max(4), rows: z.array(z.array(text(120)).min(2).max(4)).min(1).max(6) }).strict()
  .refine(value => value.rows.every(row => row.length === value.headers.length), { message: '每一行都必须与列名数量一致', path: ['rows'] });
const formula = z.object({ label: text(60), latex: text(300).refine(value => !unsafeTex.test(value), '公式不能包含链接、HTML、宏定义或外部资源命令'), meaning: text(180) }).strict();
const diagram = z.object({ kind: z.enum(['venn','flow']), title: text(100), labels: z.array(text(20)).length(3) }).strict();
const anchors = z.object({ points: z.array(text(100)).min(1).max(5), tableRows: z.array(text(100)).max(6), formulas: z.array(text(100)).max(3) }).strict();
const payload = z.object({ reply: text(4000), evidenceIds: z.array(z.string()).max(50), board: z.object({ title: text(100),
  points: z.array(text(80)).min(1).max(5), diagram: diagram.nullable(), table: table.nullable(), formulas: z.array(formula).max(3), anchors }).strict() }).strict()
  .superRefine((value, context) => {
    const speech = freezeSpeechTrack(value.reply, 'speech-v2'), groups = [
      ['points', value.board.anchors.points, value.board.points.length],
      ['tableRows', value.board.anchors.tableRows, value.board.table?.rows.length ?? 0],
      ['formulas', value.board.anchors.formulas, value.board.formulas.length],
    ] as const;
    for (const [name, quotes, count] of groups) {
      if (quotes.length !== count) { context.addIssue({ code: 'custom', path: ['board','anchors',name], message: '锚点数量必须与实际条目一致' }); continue; }
      let previous = -1;
      quotes.forEach((quote, index) => {
        const normalized = classroomSpeechText(quote), matches = speech.units.flatMap((unit, index) => unit.text.includes(normalized) ? [index] : []);
        if (matches.length !== 1 || matches[0] < previous) context.addIssue({ code: 'custom', path: ['board','anchors',name,index], message: '请引用reply内唯一落在同一句的原词句，按讲解顺序排列；不要创造或拼接锚点' });
        else previous = matches[0];
      });
    }
  });

/** The model emits exact quotes; only application code creates frozen unit identities. */
export function parseClassroomReplyBoard(value: unknown): { reply: string; evidenceIds: string[]; board: ClassroomReplyBoard } {
  const parsed = payload.parse(value), speech = freezeSpeechTrack(parsed.reply, 'speech-v2'), { anchors, table, formulas, ...board } = parsed.board;
  const ids = (quotes: string[]) => quotes.map(quote => speech.units.find(unit => unit.text.includes(classroomSpeechText(quote)))!.id);
  return { reply: parsed.reply, evidenceIds: parsed.evidenceIds, board: { ...board, ...(table ? { table } : {}), ...(formulas.length ? { formulas } : {}),
    reveal: { version: 'speech-v2', sourceSha256: speech.sourceSha256, pointUnitIds: ids(anchors.points), tableRowUnitIds: ids(anchors.tableRows), formulaUnitIds: ids(anchors.formulas) } } };
}

const string = { type: 'string' }, array = (items: object) => ({ type: 'array', items });
const object = <T extends Record<string, object>>(properties: T) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const classroomReplyPresentationSchema = object({ reply: string, evidenceIds: array(string), board: object({
  title: string, points: array(string), diagram: { anyOf: [{ type: 'null' }, object({ kind: { type: 'string', enum: ['venn','flow'] }, title: string, labels: array(string) })] },
  table: { anyOf: [{ type: 'null' }, object({ title: string, headers: array(string), rows: array(array(string)) })] },
  formulas: array(object({ label: string, latex: string, meaning: string })),
  anchors: object({ points: array(string), tableRows: array(string), formulas: array(string) }),
}) });

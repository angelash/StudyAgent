const text = (maxLength: number, minLength = 1) => ({ type: 'string', minLength, maxLength });
const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const array = (items: unknown, minItems: number, maxItems: number) => ({ type: 'array', items, minItems, maxItems });
export const topicWhiteboardJsonSchema = object({
  title: text(120), description: text(600, 3), scenes: array(object({
    kind: { type: 'string', enum: ['title', 'concept', 'steps', 'check'] }, title: text(120),
    narration: text(1800, 3), body: text(1000, 0), bullets: array(text(240), 0, 6), targetAtomIds: array(text(180), 0, 6),
    exhibit: { anyOf: [object({ kind: { const: 'table', type: 'string' }, headers: array(text(120), 2, 5), rows: array(array(text(240), 2, 5), 1, 12) }),
      object({ kind: { const: 'formula', type: 'string' }, latex: text(600), explanation: text(1000) }), { type: 'null' }] },
  }), 3, 8),
});
export const topicWhiteboardReviewJsonSchema = object({ decision: { type: 'string', enum: ['pass', 'revised', 'uncertain'] },
  issues: array(text(600), 0, 12), revisedContent: { anyOf: [topicWhiteboardJsonSchema, { type: 'null' }] },
});

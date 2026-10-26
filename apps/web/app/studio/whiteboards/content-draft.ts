import { z } from 'zod';
// Editable text can be temporarily empty or semantically invalid. Server-save
// validation must not discard an incomplete local draft during recovery.
const text = (max: number) => z.string().max(max);
const exhibit = z.union([z.object({ kind: z.literal('table'), headers: z.array(text(120)).min(2).max(5),
  rows: z.array(z.array(text(240)).min(2).max(5)).min(1).max(12) }).strict(),
z.object({ kind: z.literal('formula'), latex: text(600), explanation: text(1000) }).strict(), z.null()]);
export const editableTopicContentSchema = z.object({ title: text(120), description: text(600),
  scenes: z.array(z.object({ kind: z.enum(['title', 'concept', 'steps', 'check']), title: text(120), narration: text(1800), body: text(1000),
    bullets: z.array(text(240)).max(6), targetAtomIds: z.array(z.string().min(1).max(180)).max(6), exhibit }).strict()).min(3).max(8),
}).strict();

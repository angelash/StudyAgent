import { topicWhiteboardConfirmSchema, topicWhiteboardControlSchema, topicWhiteboardEditSchema,
  topicVisualGenerateSchema, topicVisualEditSchema, topicVisualControlSchema, questionVisualGenerateSchema, questionVisualEditSchema, questionVisualControlSchema } from '@study-agent/contracts';
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export async function topicCommandMatches(action: 'edit' | 'confirm' | 'cancel' | 'retry', body: unknown, fingerprint?: string) {
  if (!fingerprint || !globalThis.crypto?.subtle) return false;
  try {
    const command = (action === 'edit' ? topicWhiteboardEditSchema : action === 'confirm' ? topicWhiteboardConfirmSchema : topicWhiteboardControlSchema).parse(body);
    const identity = { ...(['cancel', 'retry'].includes(action) ? { action } : {}), ...command, requestKey: undefined };
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(identity))));
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('') === fingerprint;
  } catch { return false; }
}
export async function topicFigureCommandMatches(action: 'generate' | 'edit' | 'cancel' | 'retry', body: unknown, fingerprint?: string) {
  if (!fingerprint || !globalThis.crypto?.subtle) return false;
  try {
    const command = (action === 'generate' ? topicVisualGenerateSchema : action === 'edit' ? topicVisualEditSchema : topicVisualControlSchema).parse(body);
    const identity = { ...(['cancel', 'retry'].includes(action) ? { action } : {}), ...command, requestKey: undefined };
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(identity))));
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('') === fingerprint;
  } catch { return false; }
}
export async function questionFigureCommandMatches(action: 'generate' | 'edit' | 'cancel' | 'retry', body: unknown, fingerprint?: string) {
  if (!fingerprint || !globalThis.crypto?.subtle) return false;
  try {
    const command = (action === 'generate' ? questionVisualGenerateSchema : action === 'edit' ? questionVisualEditSchema : questionVisualControlSchema).parse(body);
    const identity = { ...(['cancel', 'retry'].includes(action) ? { action } : {}), ...command, requestKey: undefined };
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(identity))));
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('') === fingerprint;
  } catch { return false; }
}

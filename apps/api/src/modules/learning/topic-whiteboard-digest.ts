import { createHash } from "node:crypto";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function topicWhiteboardDigest(value: unknown): string {
  return createHash('sha256').update(topicWhiteboardSerialize(value)).digest('hex');
}
export function topicWhiteboardSerialize(value: unknown): string { return JSON.stringify(canonical(value)); }

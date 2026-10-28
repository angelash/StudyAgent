import { assistantWhiteboardEditSchema, topicWhiteboardEditSchema } from '@study-agent/contracts';
export type RejectedTopicEdit = { ownerId: string; id: string; at: number; command: ReturnType<typeof topicWhiteboardEditSchema.parse> };
const schema = topicWhiteboardEditSchema.or(assistantWhiteboardEditSchema);
const prefix = (ownerId: string, id: string) => 'studyagent.topic-whiteboard.rejected-edit.v1.' + encodeURIComponent(ownerId) + '.' + encodeURIComponent(id) + '.';
function decode(raw: string, ownerId: string, id: string): RejectedTopicEdit | null {
  if (raw.length > 256000) return null;
  const value = JSON.parse(raw); return value.ownerId === ownerId && value.id === id && Number.isFinite(value.at) && schema.safeParse(value.command).success ? value : null;
}
/** Complete original command, immutable by request key; never replaces unknown bytes. */
export function rememberRejectedTopicEdit(ownerId: string, id: string, command: RejectedTopicEdit['command']): RejectedTopicEdit {
  if (!schema.safeParse(command).success) throw Error('原改稿请求格式无法核对');
  const key = prefix(ownerId, id) + encodeURIComponent(command.requestKey), raw = localStorage.getItem(key);
  if (raw) {
    const previous = decode(raw, ownerId, id);
    if (!previous || JSON.stringify(previous.command) !== JSON.stringify(command)) throw Error('原改稿请求副本已存在，原字节继续保留');
    return previous;
  }
  const value = { ownerId, id, at: Date.now(), command: structuredClone(command) }, bytes = JSON.stringify(value); localStorage.setItem(key, bytes);
  if (localStorage.getItem(key) !== bytes) throw Error('原改稿请求副本尚未核对'); return value;
}
export function readRejectedTopicEdits(ownerId: string, id: string) {
  const result: RejectedTopicEdit[] = [];
  for (const key of Object.keys(localStorage).filter(key => key.startsWith(prefix(ownerId, id)))) try {
    const value = decode(localStorage.getItem(key) ?? '', ownerId, id); if (value) result.push(value);
  } catch { /* Unknown copies remain untouched and never become requests. */ }
  return result.sort((a, b) => b.at - a.at);
}

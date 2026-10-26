// Reuses the document-slot pattern from projects/project-recovery.ts. A reload
// can read its predecessor, while duplicated documents always write new keys.
type Slot = { id: string; previous: string };
let documentSlot: Slot | undefined;
const slotPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function topicDocumentSlot(): Slot {
  if (typeof window === 'undefined') return { id: 'server', previous: '' };
  if (documentSlot) return documentSlot;
  const id = crypto.randomUUID(); let previous = '';
  try { previous = sessionStorage.getItem('studyagent.topic-whiteboard.document-slot') ?? ''; sessionStorage.setItem('studyagent.topic-whiteboard.document-slot', id); } catch { /* Other copies remain explicitly recoverable. */ }
  documentSlot = { id, previous: slotPattern.test(previous) ? previous : '' }; return documentSlot;
}
export function topicStorage(base: string) {
  const slot = topicDocumentSlot(), key = base + '.' + slot.id;
  return { base, key, restoreKeys: [key, ...(slot.previous ? [base + '.' + slot.previous] : []), base] };
}
export function topicCopies<T>(storage: ReturnType<typeof topicStorage>, decode: (raw: string) => T | null, maxLength: number) {
  const result: Array<{ key: string; at: number; value: T }> = [];
  for (const key of Object.keys(localStorage).slice(0, 2000)) {
    if (key === storage.key || key !== storage.base && (!key.startsWith(storage.base + '.') || !slotPattern.test(key.slice(storage.base.length + 1)))) continue;
    try {
      const raw = localStorage.getItem(key); if (!raw || raw.length > maxLength) continue;
      const value = decode(raw); if (!value) continue; const at = JSON.parse(raw).at;
      result.push({ key, at: typeof at === 'number' && Number.isFinite(at) ? at : 0, value });
    } catch { /* Unknown copies stay untouched and cannot become commands. */ }
  }
  return result.sort((a, b) => b.at - a.at).slice(0, 40);
}

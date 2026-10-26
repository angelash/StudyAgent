import type { PaperPracticeSelection } from '@study-agent/contracts';
import { paperPracticeCommandSchema, paperPracticeCreationSchema } from '@study-agent/contracts';

// Reuses the project/whiteboard document-slot pattern: every document writes
// its own copy. Keep the page ancestry so unvisited question drafts also survive
// repeated reloads without reading another tab's newer independent copies.
let documentSlot: { id: string; previous: string[] } | undefined;
const slotPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function paperStorage(base: string) {
  if (typeof window === 'undefined') return { base, key: base + '.server', restoreKeys: [] as string[] };
  if (!documentSlot) {
    const id = crypto.randomUUID(); let previous: string[] = [];
    try {
      const recent = window.sessionStorage.getItem('study.paper-practice.document-slot') ?? ''; if (slotPattern.test(recent)) previous.push(recent);
      let history: unknown; try { history = JSON.parse(window.sessionStorage.getItem('study.paper-practice.document-ancestors') ?? '[]'); } catch { /* Keep the valid immediate predecessor. */ }
      if (Array.isArray(history)) previous = [...new Set([...previous, ...history.filter((value): value is string => typeof value === 'string' && slotPattern.test(value))])];
      window.sessionStorage.setItem('study.paper-practice.document-ancestors', JSON.stringify(previous)); window.sessionStorage.setItem('study.paper-practice.document-slot', id);
    } catch { /* Preserved files and explicit older copies remain available. */ }
    documentSlot = { id, previous };
  }
  return { base, key: base + '.' + documentSlot.id, restoreKeys: [base + '.' + documentSlot.id, ...documentSlot.previous.map(id => base + '.' + id), base] };
}
export function firstPaperCopy<T>(storage: ReturnType<typeof paperStorage>, decode: (value: unknown) => T): T | null {
  for (const key of storage.restoreKeys) { const raw = window.localStorage.getItem(key); if (!raw) continue; if (raw.length > 256 * 1024) continue; try { const value = JSON.parse(raw); if (value?.format === 'paper-practice-cleared-v1' && value.base === storage.base) { if (key !== storage.key) try { storePaperRecovery(storage.key, value); } catch { /* The original clear marker still bounds this read. */ } return null; } return decode(value); } catch { /* Preserve invalid copies for explicit inspection. */ } }
  return null;
}
/** A local clear is not proof of server success. It only ends this page lineage's
 * pending selection; older independent copies remain explicitly inspectable. */
export function clearPaperRecovery(storage: ReturnType<typeof paperStorage>) { storePaperRecovery(storage.key, { format: 'paper-practice-cleared-v1', base: storage.base }); }
export function otherPaperCopies<T>(storage: ReturnType<typeof paperStorage>, decode: (value: unknown) => T): T[] {
  const values: T[] = [];
  for (const key of Object.keys(window.localStorage).slice(0, 2000)) {
    if (key === storage.key || !key.startsWith(storage.base + '.') || !slotPattern.test(key.slice(storage.base.length + 1))) continue;
    const raw = window.localStorage.getItem(key); if (!raw || raw.length > 256 * 1024) continue;
    try { values.push(decode(JSON.parse(raw))); } catch { /* Other scopes never become commands. */ }
  }
  return values.slice(0, 40);
}
export async function paperPracticeInputHash(value: unknown, creation = false) {
  const normalized = (creation ? paperPracticeCreationSchema : paperPracticeCommandSchema).parse(value), bytes = new TextEncoder().encode(JSON.stringify(normalized));
  const digest = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export const paperBasketKey = (ownerId: string) => 'study.paper-practice.selection:' + ownerId;
export function parsePaperSelection(value: unknown): PaperPracticeSelection[] {
  if (!Array.isArray(value) || value.length > 16) throw new Error('本机选题清单无法核对，请回题卷库重新选择。');
  const rows = value.map(row => {
    if (!row || typeof row.paperId !== 'string' || !row.paperId.trim() || row.paperId.length > 180 || Object.keys(row).some(key => !['paperId', 'positions'].includes(key))) throw new Error('选题清单格式不完整。');
    if (row.positions !== undefined && (!Array.isArray(row.positions) || !row.positions.length || row.positions.length > 500 || row.positions.some((n: unknown) => !Number.isSafeInteger(n) || Number(n) < 1) || new Set(row.positions).size !== row.positions.length)) throw new Error('选题位置无法核对，请重新选择。');
    return { paperId: row.paperId, ...(row.positions ? { positions: row.positions as number[] } : {}) };
  });
  if (new Set(rows.map(row => row.paperId)).size !== rows.length) throw new Error('清单中有重复试卷，请重新选择。');
  return rows;
}
export function storePaperRecovery(key: string, value: unknown) {
  const serialized = JSON.stringify(value); if (window.localStorage.getItem(key) !== serialized) window.localStorage.setItem(key, serialized);
  if (window.localStorage.getItem(key) !== serialized) throw new Error('本机未能确认恢复信息已保存。');
}
export function downloadPaperRecovery(value: unknown, name: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), anchor = document.createElement('a');
  try { anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

export type MaterialTextDraft = { format: 'workspace-material-text-v1'; actorId: string; studentId: string | null; subject: string | null; title: string; text: string };
export function materialTextDraftKey(actorId: string, studentId?: string, subject?: string) { return 'study.material-text.v1:' + JSON.stringify([actorId, studentId ?? null, studentId ? subject : null]); }
export function parseMaterialTextDraft(value: unknown, actorId: string, studentId?: string, subject?: string): MaterialTextDraft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as MaterialTextDraft;
  return draft.format === 'workspace-material-text-v1' && draft.actorId === actorId && draft.studentId === (studentId ?? null) && draft.subject === (studentId ? subject : null) &&
    typeof draft.title === 'string' && draft.title.length <= 180 && typeof draft.text === 'string' && draft.text.length <= 180000 ? draft : null;
}
export function materialTextCommand(title: string, text: string) {
  const sections = text.split(/\n\s*---\s*\n/).map(value => value.trim()).filter(Boolean), name = title.trim();
  if (!name || name.length > 180) throw new Error('请填写180字以内的资料名称。');
  if (!sections.length || sections.length > 8 || sections.some(section => section.length < 20 || section.length > 8000)) throw new Error('每段需要20至8000字，最多8段；分段之间单独写一行 ---。较长资料可使用文字文件建课入口。');
  return { title: name, sections };
}

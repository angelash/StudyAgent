import { learningContextIssue, type LearningContext } from './learning-context';

export type MaterialsTab = 'personal' | 'files' | 'packs' | 'papers';
export const materialsTabs: ReadonlyArray<{ id: MaterialsTab; label: string }> = [
  { id: 'personal', label: '学习资料' }, { id: 'files', label: 'PDF页与结构' },
  { id: 'packs', label: '个性化学案' }, { id: 'papers', label: '题卷资源' },
];
export function readMaterialsTab(params: URLSearchParams, independent: boolean): MaterialsTab {
  const value = params.get('tab');
  return materialsTabs.some(tab => tab.id === value) ? value as MaterialsTab : independent ? 'personal' : 'files';
}
const subjects = ['math', 'chinese', 'english', 'chemistry'];
const values: Record<string, readonly string[]> = {
  tab: materialsTabs.map(tab => tab.id), materialKind: ['pdf', 'text'],
  materialStatus: ['queued', 'processing', 'ready', 'needs_review', 'failed', 'cancelled'],
  materialView: ['page', 'text', 'structure'], paperCollection: ['published', 'bookmarks', 'research'],
  paperState: ['complete', 'partial', 'pdf', 'unknown'], paperAnswers: ['1'], paperDesk: ['selection', 'exports'],
};
const lengths: Record<string, number> = { materialQuery: 100, paperQuery: 100, paperGrade: 100, paperSubject: 100, material: 180, paper: 180, capture: 180, paperDraft: 36, paperList: 128, paperExport: 128 };
const integers: Record<string, number> = { materialListPage: 100000, page: 10000, paperPage: 100000, position: 10000, paperScroll: 10000000 };
const fields = [...Object.keys(values), ...Object.keys(lengths), ...Object.keys(integers)];
function usable(key: string, value: string) {
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  if(key==='capture')return value==='new'||/^paper_group_[a-f0-9-]{36}$/.test(value);
  if(key==='paperDraft')return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
  if(key==='paperList'||key==='paperExport')return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);
  if (values[key]) return values[key].includes(value);
  if (lengths[key]) return value.length > 0 && value.length <= lengths[key];
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= (key === 'paperScroll' ? 0 : 1) && Number(value) <= integers[key];
}
export function copyMaterialsState(from: URLSearchParams, to: URLSearchParams, keepSelection = true) {
  for (const key of fields) {
    if (!keepSelection && ['material', 'page', 'materialView', 'paper', 'position', 'paperAnswers', 'paperScroll', 'capture', 'paperDraft', 'paperList', 'paperExport', 'paperDesk'].includes(key)) continue;
    const value = from.get(key); if (value !== null && usable(key, value)) to.set(key, value);
  }
  return to;
}
export function materialsHref(context: LearningContext, tab: MaterialsTab, source?: URLSearchParams) {
  const params = source ? copyMaterialsState(source, new URLSearchParams()) : new URLSearchParams();
  params.set('view', 'materials'); params.set('tab', tab);
  if (context.audience === 'self') params.set('courseScope', 'adult');
  else { params.set('student', context.studentId ?? ''); params.set('subject', context.subject); }
  return '/studio?' + params;
}
export function materialsReturn(value: string | null): string | null {
  if (!value || value.length > 8192 || !value.startsWith('/studio?') || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, 'https://study.invalid'), params = url.searchParams;
    if (url.origin !== 'https://study.invalid' || url.pathname !== '/studio' || params.get('view') !== 'materials' || learningContextIssue(url.search)) return null;
    if ([...params.keys()].some(key => /token|password|credential|materialsReturn|returnTo|calendarReturn|^next$/i.test(key))) return null;
    if (params.has('audience') && !['student', 'independent', 'course'].includes(params.get('audience')!)) return null;
    if (params.has('courseScope') && !['student', 'adult'].includes(params.get('courseScope')!)) return null;
    if (['view', ...fields].some(key => new Set(params.getAll(key)).size > 1)) return null;
    const independent = params.get('courseScope') === 'adult' || params.get('audience') === 'independent';
    return materialsHref({ studentId: params.get('student') ?? params.get('studentId') ?? undefined, subject: (params.get('subject') ?? 'math') as LearningContext['subject'], ...(independent ? { audience: 'self' } : {}) }, readMaterialsTab(params, independent), params);
  } catch { return null; }
}
export function withMaterialsReturn(href: string, value: string | null) {
  const back = materialsReturn(value);
  if (!back) return href;
  const target = new URL(href, 'https://study.invalid');
  if (target.origin !== 'https://study.invalid') return '/studio?view=materials&tab=personal';
  target.searchParams.set('materialsReturn', back);
  return target.pathname + target.search + target.hash;
}
export function materialPaperHref(paperId: string, position: number, value: string | null) {
  const back = materialsReturn(value);
  if (!back) return '/library?' + new URLSearchParams({ paper: paperId, ...(position > 0 ? { position: String(position) } : {}) });
  const url = new URL(back, 'https://study.invalid');url.searchParams.set('tab', 'papers');url.searchParams.set('paper', paperId);
  if (position > 0) url.searchParams.set('position', String(position)); else url.searchParams.delete('position');
  return url.pathname + url.search;
}
export function legacyLibraryHref(source: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams({ view: 'materials', tab: 'papers' });
  for (const key of ['student', 'studentId', 'courseScope', 'audience']) {
    const value = source[key]; for (const part of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, part);
  }
  const subject = Array.isArray(source.subject) ? source.subject[0] : source.subject;
  if (subject && subjects.includes(subject)) params.set('subject', subject);
  const raw = new URLSearchParams();
  for (const key of fields) {
    const value = Array.isArray(source[key]) ? source[key][0] : source[key];
    if (typeof value === 'string') raw.set(key, value);
  }
  for (const [old, next] of [['q', 'paperQuery'], ['grade', 'paperGrade'], ['collection', 'paperCollection'], ['state', 'paperState']]) {
    const value = source[old]; if (!raw.has(next) && typeof value === 'string') raw.set(next, value);
  }
  if (subject && !subjects.includes(subject) && !raw.has('paperSubject')) raw.set('paperSubject', subject);
  copyMaterialsState(raw, params); params.set('tab', 'papers');
  return '/studio?' + params;
}

export type PaperLibraryState = { collection: 'published' | 'bookmarks' | 'research'; query: string; grade: string; subject: string; state: string; page: number; paper: string; position: number; answers: boolean; scroll: number };
export function readPaperLibraryState(params: URLSearchParams): PaperLibraryState {
  const safe = copyMaterialsState(params, new URLSearchParams());
  return { collection: (safe.get('paperCollection') ?? 'published') as PaperLibraryState['collection'], query: safe.get('paperQuery') ?? '',
    grade: safe.get('paperGrade') ?? '', subject: safe.get('paperSubject') ?? '', state: safe.get('paperState') ?? '', page: Number(safe.get('paperPage') ?? 1),
    paper: safe.get('paper') ?? '', position: Number(safe.get('position') ?? 0), answers: safe.get('paperAnswers') === '1', scroll: Number(safe.get('paperScroll') ?? 0) };
}
export function writePaperLibraryState(params: URLSearchParams, state: PaperLibraryState) {
  for (const key of ['paperCollection', 'paperQuery', 'paperGrade', 'paperSubject', 'paperState', 'paperPage', 'paper', 'position', 'paperAnswers', 'paperScroll']) params.delete(key);
  const fields = { paperCollection: state.collection === 'published' ? '' : state.collection, paperQuery: state.query, paperGrade: state.grade, paperSubject: state.subject,
    paperState: state.state, paperPage: state.page === 1 ? '' : String(state.page), paper: state.paper, position: state.position ? String(state.position) : '',
    paperAnswers: state.answers ? '1' : '', paperScroll: state.scroll ? String(state.scroll) : '' };
  for (const [key, value] of Object.entries(fields)) if (value && usable(key, value)) params.set(key, value);
  return params;
}

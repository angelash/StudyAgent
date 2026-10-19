'use client';

import * as React from 'react';
import type { CurriculumBook, CurriculumChapter, CurriculumLesson, Subject } from '@study-agent/contracts';
import { apiRequest, getAuthToken } from '../lib/api';
import './learning-progress-selector.css';

type BookSummary = Omit<CurriculumBook, 'chapters'> & { lessonCount: number; mappedLessonCount: number };
type Detail = Omit<CurriculumBook, 'chapters'> & { chapters: Array<Omit<CurriculumChapter, 'lessons'> & {
  lessons: Array<CurriculumLesson & { atomIds: string[]; mappingState: string }> }> };
export type ProgressSelection = { bookId: string; mode: 'knowledge' | 'textbook'; lessonIds: string[] };
const get = <T,>(path: string) => apiRequest<T>(path, {}, getAuthToken());

export function LearningProgressSelector({ subject, grade, term, selection, onChange, version, onVersion, onLearned }: {
  subject: Subject; grade: number; term: 'upper' | 'lower'; selection: ProgressSelection;
  onChange: (value: ProgressSelection) => void; version: string; onVersion: (value: string) => void; onLearned: (ids: string[]) => void;
}) {
  const [books, setBooks] = React.useState<BookSummary[]>([]), [detail, setDetail] = React.useState<Detail | null>(null);
  const [error, setError] = React.useState(''), [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    let alive = true; setLoading(true); setError('');
    get<BookSummary[]>(`/diagnostics/textbooks?subject=${subject}&grade=${grade}&term=${term}`)
      .then(items => { if (alive) setBooks(items); }).catch(e => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [subject, grade, term]);
  React.useEffect(() => {
    let alive = true; setDetail(null);
    if (selection.bookId) get<Detail>(`/diagnostics/textbooks/${encodeURIComponent(selection.bookId)}`)
      .then(book => { if (alive && book.grade === grade && book.subject === subject && book.term === term) setDetail(book); })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [selection.bookId, grade, subject, term]);
  const selected = books.find(b => b.id === selection.bookId), lessons = detail?.chapters.flatMap(c => c.lessons).filter(l => l.kind !== 'reference') ?? [];
  const currentIds = new Set(selection.lessonIds), chosen = lessons.filter(l => currentIds.has(l.id));
  const uncovered = chosen.filter(l => !l.atomIds.length).length;
  function selectBook(id: string) {
    const book = books.find(b => b.id === id);
    onChange({ bookId: id, mode: book?.chapterState === 'available' && book.mappedLessonCount > 0 ? 'textbook' : 'knowledge', lessonIds: [] });
    onLearned([]); if (book) onVersion(book.title);
  }
  function choose(ids: string[]) {
    onChange({ ...selection, lessonIds: [...new Set(ids)] });
    const set = new Set(ids);
    onLearned([...new Set(lessons.filter(l => set.has(l.id)).flatMap(l => l.atomIds))]);
  }
  return <section className="progress-selection" aria-labelledby="progress-title">
    <div className="studio-point-heading"><h3 id="progress-title">正在学哪一本，学到了哪里</h3>{loading && <small role="status">正在读取目录…</small>}</div>
    {error && <p role="alert" className="studio-error">{error}</p>}
    {!selected && books.some(b => b.source === 'original') && <button className="studio-secondary" onClick={() => selectBook(books.find(b => b.source === 'original')!.id)}>使用本年级原创能力路径 →</button>}
    <label>教材或能力路径<select value={selected ? selection.bookId : ''} onChange={e => selectBook(e.target.value)}>
      <option value="">按已学知识点确认 · 手动填写教材</option>
      <optgroup label="原创能力路径">{books.filter(b => b.source === 'original').map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</optgroup>
      <optgroup label="已有章节目录">{books.filter(b => b.source !== 'original' && b.chapterState === 'available').map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</optgroup>
      <optgroup label="已有教材信息 · 章节待补充">{books.filter(b => b.chapterState === 'missing').map(b => <option key={b.id} value={b.id}>{b.edition} · {b.title}</option>)}</optgroup>
    </select></label>
    {!selected && <label className="studio-textbook">教材版本<input value={version} onChange={e => onVersion(e.target.value)} maxLength={150} placeholder="填写孩子实际使用的教材版本" /></label>}
    {selected?.source === 'original' && <p className="studio-muted">这是原创能力路径。请以孩子实际学过的内容为准；它与具体教材的章节顺序分别管理。</p>}
    {selected?.chapterState === 'missing' && <p className="progress-gap">已保留这本教材的信息，章节目录仍待补充。请在下方勾选孩子实际学过的知识点。</p>}
    {selected?.chapterEvidence && <p className="studio-muted">已对照这本书的目录页核对课名和页码。{selected.mappedLessonCount ? `已有 ${selected.mappedLessonCount} 个课时完成知识对齐。` : '课时与知识点的对齐还在审核中，请先在下方确认孩子实际学过的知识点；也可以展开目录查看进度。'}</p>}
    {detail?.chapterState === 'available' && <>
      <div className="studio-subjects" role="group" aria-label="进度确认方式">
        <button aria-pressed={selection.mode === 'textbook'} onClick={() => { onChange({ ...selection, mode: 'textbook' }); const ids = new Set(selection.lessonIds); onLearned([...new Set(lessons.filter(l => ids.has(l.id)).flatMap(l => l.atomIds))]); }}>按已学课时</button>
        <button aria-pressed={selection.mode === 'knowledge'} onClick={() => onChange({ ...selection, mode: 'knowledge', lessonIds: [] })}>按已学知识点</button>
      </div>
      {selection.mode === 'textbook' && <>
        <label>快速确认进度<select value="" onChange={e => { const index = lessons.findIndex(l => l.id === e.target.value); if (index >= 0) choose(lessons.slice(0, index + 1).map(l => l.id)); }}>
          <option value="">选择“已学到这里”，也可逐课勾选</option>{detail.chapters.filter(c => c.kind !== 'appendix').map(c => <optgroup key={c.id} label={c.name}>{c.lessons.filter(l => l.kind !== 'reference').map(l => <option key={l.id} value={l.id}>{l.number ? `${l.number}. ` : ''}{l.name}{l.printedPage ? ` · 第${l.printedPage}页` : ''}</option>)}</optgroup>)}
        </select></label>
        <div className="progress-chapters">{detail.chapters.map(chapter => <details key={chapter.id} open={chapter.lessons.some(l => currentIds.has(l.id))}>
          <summary>{chapter.name}<small>{chapter.kind === 'appendix' ? '查阅用附录' : `${chapter.lessons.filter(l => currentIds.has(l.id)).length}/${chapter.lessons.length}`}</small></summary>
          {chapter.kind !== 'appendix' && <button className="studio-text-button" onClick={() => choose(chapter.lessons.every(l => currentIds.has(l.id)) ? selection.lessonIds.filter(id => !chapter.lessons.some(l => l.id === id)) : [...selection.lessonIds, ...chapter.lessons.filter(l => l.kind !== 'reference').map(l => l.id)])}>切换本章全部课时</button>}
          {chapter.lessons.map(lesson => <label key={lesson.id}>{lesson.kind !== 'reference' && <input type="checkbox" checked={currentIds.has(lesson.id)}
            onChange={e => choose(e.target.checked ? [...selection.lessonIds, lesson.id] : selection.lessonIds.filter(id => id !== lesson.id))} />
            }<span>{lesson.number ? `${lesson.number}. ` : ''}{lesson.name}{lesson.skim && '（略读）'}<small>{lesson.printedPage ? `第 ${lesson.printedPage} 页 · ` : ''}{lesson.kind === 'reference' ? '查阅用，不计入已学课时' : lesson.atomIds.length ? `已对齐${lesson.atomIds.length}个知识点` : '知识映射待审核'}</small>{lesson.parts?.length ? <small>本课包含：{lesson.parts.map(p => `${p.name}（${p.printedPage}页）`).join('、')}</small> : null}</span></label>)}
        </details>)}</div>
        <p className={uncovered ? 'progress-gap' : 'studio-muted'}>已选 {chosen.length} 个课时，对应 {new Set(chosen.flatMap(l => l.atomIds)).size} 个可确认知识点。
          {uncovered > 0 && `其中 ${uncovered} 个课时还缺少审核映射，本次评测无法覆盖；报告会保留这项缺口。`}</p>
      </>}
    </>}
  </section>;
}

import { describe, expect, it } from 'vitest';
import { copyMaterialsState, legacyLibraryHref, materialPaperHref, materialsHref, materialsReturn, readMaterialsTab, readPaperLibraryState, withMaterialsReturn, writePaperLibraryState } from '../../../web/lib/materials-navigation';
import { materialTextCommand, materialTextDraftKey, parseMaterialTextDraft } from '../../../web/lib/material-text-draft';

describe('materials navigation and full text recovery boundaries', () => {
  const origin = '/studio?view=materials&tab=papers&student=child-a&subject=english&paperQuery=original&paperPage=2&paper=paper-a&position=3&paperScroll=420';
  it('reconstructs only a local unambiguous materials destination', () => {
    for (const value of ['https://elsewhere.test/studio?view=materials', '//elsewhere.test/studio?view=materials', '/studio?view=calendar', '/studio?view=materials&student=a&studentId=b', '/studio?view=materials&courseScope=adult&student=a', '/studio?view=materials&paper=a&paper=b', '/studio?view=materials&view=calendar', '/studio?view=materials&materialsReturn=%2Fstudio', '/studio?view=materials&returnTo=//elsewhere.test', '/studio?view=materials&token=secret', '/studio?view=materials\\outside']) expect(materialsReturn(value)).toBeNull();
    const safe = new URL(materialsReturn(origin + '&unknown=drop')!, 'https://study.invalid');
    expect(safe.searchParams.get('student')).toBe('child-a'); expect(safe.searchParams.get('paperPage')).toBe('2');
    expect(safe.searchParams.has('unknown')).toBe(false);
  });
  it('preserves independent or explicitly empty object intent instead of a cached child', () => {
    const self = new URL(materialsHref({ studentId: 'stale-child', subject: 'english', audience: 'self' }, 'personal'), 'https://study.invalid');
    expect(self.searchParams.get('courseScope')).toBe('adult'); expect(self.searchParams.has('student')).toBe(false);
    expect(new URL(materialsReturn('/studio?view=materials&tab=personal&student=')!, 'https://study.invalid').searchParams.get('student')).toBe('');
    expect(readMaterialsTab(new URLSearchParams(), false)).toBe('files'); expect(readMaterialsTab(new URLSearchParams(), true)).toBe('personal');
  });
  it('clears concrete selections when changing object but keeps lawful list filters', () => {
    const params = copyMaterialsState(new URLSearchParams('tab=personal&material=old&page=3&materialView=text&paper=old-paper&position=2&paperAnswers=1&paperScroll=80&materialQuery=keep&materialListPage=2&paperSubject=数学'), new URLSearchParams(), false);
    for (const key of ['material', 'page', 'materialView', 'paper', 'position', 'paperAnswers', 'paperScroll']) expect(params.has(key)).toBe(false);
    expect(params.get('materialQuery')).toBe('keep'); expect(params.get('paperSubject')).toBe('数学');
  });
  it('adapts old paper filters without losing the original paper or confusing page and position', () => {
    const target = new URL(legacyLibraryHref({ q: '原卷', grade: '五年级', subject: '数学', collection: 'bookmarks', paper: 'old-paper', position: '2', token: 'drop' }), 'https://study.invalid');
    expect(target.pathname).toBe('/studio'); expect(target.searchParams.get('tab')).toBe('papers');
    expect(readPaperLibraryState(target.searchParams)).toMatchObject({ query: '原卷', grade: '五年级', subject: '数学', collection: 'bookmarks', paper: 'old-paper', position: 2 });
    expect(target.searchParams.has('token')).toBe(false);
    const original = readPaperLibraryState(new URL(origin, 'https://study.invalid').searchParams);
    expect(readPaperLibraryState(writePaperLibraryState(new URLSearchParams(), { ...original, answers: true }))).toEqual({ ...original, answers: true });
    const invalid = readPaperLibraryState(new URLSearchParams('paperPage=Infinity&position=-3&paperScroll=NaN&paperAnswers=true'));
    expect(invalid).toMatchObject({ page: 1, position: 0, scroll: 0, answers: false });
  });
  it('keeps the sanitized source on internal course and paper routes without changing activity IDs', () => {
    const href = new URL(withMaterialsReturn('/library/practice?session=original&item=item-a', origin), 'https://study.invalid');
    expect(href.searchParams.get('session')).toBe('original'); expect(href.searchParams.get('item')).toBe('item-a');
    expect(materialsReturn(href.searchParams.get('materialsReturn'))).toBe(materialsReturn(origin));
    const paper = new URL(materialPaperHref('another-paper', 4, origin), 'https://study.invalid');
    expect(paper.searchParams.get('paperQuery')).toBe('original'); expect(paper.searchParams.get('paperPage')).toBe('2');
    expect(paper.searchParams.get('paper')).toBe('another-paper'); expect(paper.searchParams.get('position')).toBe('4');
    expect(withMaterialsReturn('/studio/source-courses?course=kept', '//elsewhere.test')).toBe('/studio/source-courses?course=kept');
  });
  it('accepts complete original text only under the matching actor, object and subject', () => {
    const draft = { format: 'workspace-material-text-v1', actorId: 'actor-a', studentId: 'child-a', subject: 'english', title: '原文', text: '全文'.repeat(5000) };
    expect(parseMaterialTextDraft(draft, 'actor-a', 'child-a', 'english')?.text).toBe(draft.text);
    for (const [actor, child, subject] of [['actor-b','child-a','english'],['actor-a','child-b','english'],['actor-a','child-a','math']]) expect(parseMaterialTextDraft(draft, actor, child, subject)).toBeNull();
    expect(materialTextDraftKey('actor-a', 'child-a', 'english')).not.toBe(materialTextDraftKey('actor-b', 'child-a', 'english'));
    expect(parseMaterialTextDraft({ ...draft, text: '字'.repeat(180001) }, 'actor-a', 'child-a', 'english')).toBeNull();
  });
  it('submits every valid section and rejects excessive input without truncation', () => {
    const first = '原文'.repeat(4000), second = '第二段'.repeat(100);
    expect(materialTextCommand(' 完整资料 ', first + '\n---\n' + second)).toEqual({ title: '完整资料', sections: [first, second] });
    expect(() => materialTextCommand('资料', first + '超出')).toThrow('8000');
    expect(() => materialTextCommand('资料', Array(9).fill(second).join('\n---\n'))).toThrow('8段');
    expect(() => materialTextCommand('资料', '不足')).toThrow('20');
  });
});

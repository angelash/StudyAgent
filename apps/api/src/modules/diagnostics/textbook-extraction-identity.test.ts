import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { textbookExtractionIdentityMatches as matches } from './textbook-extraction-identity';

const sourceSha256 = 'a'.repeat(64), relative = '人教版/带 空格的原件.pdf';
const id = (subject: string) => 'chinatextbook:primary:' + subject + ':' + createHash('sha256').update(relative).digest('hex').slice(0, 20);
describe('exact extraction identity from both saved import formats', () => {
  it('preserves the existing explicit-id extraction contract', () => {
    const source = { id: 'source:original', subject: 'chinese', sha256: sourceSha256 };
    expect(matches({ format: 'chinatextbook-extraction-v1', id: source.id, sourceSha256 }, source)).toBe(true);
    expect(matches({ format: 'chinatextbook-extraction-v1', id: 'other-source', sourceSha256 }, source)).toBe(false);
  });
  it.each(['math', 'english'])('binds %s to the actual importer subject and path-derived identity', subject => {
    const source = { id: id(subject), subject, sha256: sourceSha256 }, extracted = { format: 'chinatextbook-primary-extraction-v1', subject, sourceRelative: relative, sourceSha256 };
    expect(matches(extracted, source)).toBe(true);
    expect(matches({ ...extracted, sourceRelative: 'other/' + relative }, source)).toBe(false);
    expect(matches({ ...extracted, subject: subject === 'math' ? 'english' : 'math' }, source)).toBe(false);
    expect(matches({ ...extracted, sourceSha256: 'b'.repeat(64) }, source)).toBe(false);
    expect(matches({ ...extracted, id: 'another-original' }, source)).toBe(false);
    expect(matches({ ...extracted, format: 'unknown-extraction' }, source)).toBe(false);
  });
  it.each(['../book.pdf', 'dir/../book.pdf', 'C:/book.pdf', '/book.pdf', '\\book.pdf', 'dir\\book.pdf', 'dir//book.pdf', '', 'dir/./book.pdf', 'dir/\u0000book.pdf'])('rejects unsafe identity path %j even if a manifest repeats its derived id', sourceRelative => {
    const source = { id: 'chinatextbook:primary:math:' + createHash('sha256').update(sourceRelative).digest('hex').slice(0, 20), subject: 'math', sha256: sourceSha256 };
    expect(matches({ format: 'chinatextbook-primary-extraction-v1', subject: 'math', sourceRelative, sourceSha256 }, source)).toBe(false);
  });
  it('does not accept a primary schema on another subject or a missing document', () => {
    expect(matches({ format: 'chinatextbook-primary-extraction-v1', subject: 'chinese', sourceRelative: relative, sourceSha256 }, { id: id('chinese'), subject: 'chinese', sha256: sourceSha256 })).toBe(false);
    expect(matches(null, { id: id('math'), subject: 'math', sha256: sourceSha256 })).toBe(false);
  });
});

import { createHash } from 'node:crypto';

/** Both importers bind their full extraction bytes to a verified original PDF.
 * The primary importer identifies a book by subject and its exact relative path. */
export function textbookExtractionIdentityMatches(extracted: any, source: { id: string; subject: string; sha256: string }) {
  if (!extracted || extracted.sourceSha256 !== source.sha256) return false;
  if (extracted.format === 'chinatextbook-extraction-v1') return extracted.id === source.id;
  if (extracted.format !== 'chinatextbook-primary-extraction-v1' || !['math', 'english'].includes(source.subject) ||
      extracted.subject !== source.subject || typeof extracted.sourceRelative !== 'string') return false;
  const relative = extracted.sourceRelative;
  if (/^[a-z]:|^[/\\]|[\\\x00-\x1f]/i.test(relative) || relative.split('/').some((part: string) => !part || part === '.' || part === '..')) return false;
  const identity = 'chinatextbook:primary:' + source.subject + ':' + createHash('sha256').update(relative).digest('hex').slice(0, 20);
  return source.id === identity && (extracted.id === undefined || extracted.id === identity);
}

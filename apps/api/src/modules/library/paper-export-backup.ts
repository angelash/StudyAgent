import { assertPaperExportRecord, paperExportDocumentBytes } from './paper-export-record';
import { assertPaperExportFile } from './paper-export-file-record';

type Row = { collection: string; body: unknown };
/** Only registered, published bytes enter an export backup. Frozen queued
 * intents remain in the native database; unpublished workspaces are fenced and
 * collected on restore, never presented as complete input/media/output files. */
export function paperExportBackupReferences(rows: readonly Row[]) {
  const decode = (body: unknown): any => typeof body === 'string' ? JSON.parse(body) : body;
  const records = rows.filter(row => row.collection === 'paperExports').map(row => assertPaperExportRecord(decode(row.body))),
    files = rows.filter(row => row.collection === 'paperExportFiles').map(row => assertPaperExportFile(decode(row.body)));
  const result = new Map<string, { sha256: string; size: number }>();
  function add(path: string, sha256: string, size: number) {
    const previous = result.get(path); if (previous && (previous.sha256 !== sha256 || previous.size !== size)) throw Error('paper_export_backup_reference_changed');
    result.set(path, { sha256, size });
  }
  for (const file of files) {
    if (file.state !== 'available') continue;
    const record = records.find(record => record.id === file.exportId), slot = record?.slots.find(slot => slot.published?.fileId === file.id);
    if (!record || !slot?.published || !file.output) throw Error('paper_export_backup_original_missing');
    add(file.workspace + '/input.json', record.intent.documentSha256, paperExportDocumentBytes(record.intent.document).length);
    for (const media of record.intent.document.media) add(file.workspace + '/' + media.path, media.sha256, media.bytes);
    add(file.workspace + `/artifacts-${slot.book}/${slot.book}.${slot.format}`, file.output.sha256, file.output.bytes);
  }
  return result;
}

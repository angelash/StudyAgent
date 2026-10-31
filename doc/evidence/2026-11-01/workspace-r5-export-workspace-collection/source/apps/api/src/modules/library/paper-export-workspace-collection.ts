import { constants, promises as fs, type BigIntStats } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { paperExportDocumentSchema } from '@study-agent/contracts';
import { assertNoFileLinks, StudioFileCollectionPending } from '../../infrastructure/studio-file-coordination';
import { workspaceRoot } from '../../infrastructure/workspace-paths';
import { assertPaperExportDocument, paperExportDocumentSha256, type PaperExportRecord } from './paper-export-record';
import { assertPaperExportFile, type PaperExportFileRecord } from './paper-export-file-record';

const limit = { files: 5000, depth: 32, bytes: 400 * 1024 * 1024, path: 800 };
const pending = (code: string): never => { throw new StudioFileCollectionPending('paper_export_collection_' + code); };
const same = (a: BigIntStats, b: BigIntStats) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
const identity = (stat: BigIntStats) => ({ dev: stat.dev.toString(), ino: stat.ino.toString(), size: stat.size.toString(), mtimeNs: stat.mtimeNs.toString(), ctimeNs: stat.ctimeNs.toString() });
type Observed = { path: string; relative: string; stat: BigIntStats; sha256: string; bytes: number };
type Directory = { path: string; relative: string; stat: BigIntStats; children: Set<string> };
export type PaperExportWorkspaceInventory = { root: string; files: Observed[]; directories: Directory[]; absent: boolean };
const escape = (value: string) => value.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');

async function observe(path: string, maximum: number, keep = false) {
  await assertNoFileLinks(path); let handle;
  try {
    handle = await fs.open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = await handle.stat({ bigint: true }), pathBefore = await fs.lstat(path, { bigint: true });
    if (!before.isFile() || before.size > BigInt(maximum) || !same(before, pathBefore)) pending('file_unknown');
    const hash = createHash('sha256'), chunks: Buffer[] = []; let bytes = 0;
    for await (const chunk of handle.createReadStream({ start: 0, autoClose: false })) {
      bytes += chunk.length; if (bytes > maximum) pending('byte_budget'); hash.update(chunk); if (keep) chunks.push(Buffer.from(chunk));
    }
    await assertNoFileLinks(path);
    const after = await handle.stat({ bigint: true }), pathAfter = await fs.lstat(path, { bigint: true });
    if (!same(before, after) || !same(before, pathAfter) || bytes !== Number(before.size)) pending('file_changed');
    return { path, stat: before, bytes, sha256: hash.digest('hex'), data: keep ? Buffer.concat(chunks) : null };
  } finally { await handle?.close(); }
}
async function policy() {
  const file = resolve(workspaceRoot(), 'resources/paper-export/profile-collection-policy-v1.json');
  const input = await observe(file, 128 * 1024, true);
  if (input.sha256 !== '8b8e7070cc9c11282e205b9a3a468f644f0f7f7d51e90c2c56ac9dc3be1f4196') pending('policy_changed');
  const schema = z.object({ protocol: z.literal('paper-export-profile-collection-policy-v1'), officeVersion: z.literal('26.8.2.2'),
    officeManifestSha256: z.literal('332efdeb4344e15eec827de966ff88491d7a0016abc993b72c06bb873a164814'),
    tempSegment: z.literal('lu[0-9]{1,10}[a-z0-9]{4,24}\\.tmp'),
    directories: z.array(z.string().max(600)).max(1000),
    rules: z.array(z.object({ path: z.string().max(600), maxBytes: z.number().int().min(1).max(2 * 1024 * 1024),
      kind: z.enum(['pinned-office-bytes', 'bounded-generated-profile']), sha256: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(100).optional() }).strict()).min(1).max(1000) }).strict();
  const parsed = schema.parse(JSON.parse(input.data!.toString('utf8'))), seen = new Set<string>();
  const rules = parsed.rules.map(row => {
    if (row.path.startsWith('/') || row.path.includes('..') || !/^[a-zA-Z0-9_.{}%\/-]+$/.test(row.path) || seen.has(row.path) ||
        (row.kind === 'pinned-office-bytes') !== Boolean(row.sha256)) pending('policy_invalid');
    seen.add(row.path);
    const pieces = row.path.split('{office-temp}'); if (pieces.length > 2) pending('policy_invalid');
    return { ...row, match: new RegExp('^' + pieces.map(escape).join('(?:' + parsed.tempSegment + ')') + '$') };
  });
  const explicitDirectories = parsed.directories.map(name => {
    if (name.startsWith('/') || name.includes('..') || !/^[a-zA-Z0-9_.{}%\/-]+$/.test(name)) pending('policy_invalid');
    return new RegExp('^' + name.split('{office-temp}').map(escape).join('(?:' + parsed.tempSegment + ')') + '$');
  });
  return { rules, directory: (name: string) => explicitDirectories.some(pattern => pattern.test(name)) || rules.some(row => {
    const parts = row.path.split('/'); parts.pop();
    while (parts.length) {
      if (new RegExp('^' + parts.join('/').split('{office-temp}').map(escape).join('(?:' + parsed.tempSegment + ')') + '$').test(name)) return true;
      parts.pop();
    }
    return false;
  }) };
}
/** Reads the entire bounded tree before returning any deletion authority. */
export async function inspectPaperExportWorkspace(input: { dataRoot: string; file: PaperExportFileRecord; book: 'practice' | 'answers'; record?: PaperExportRecord }) {
  assertPaperExportFile(input.file);
  const root = resolve(input.dataRoot, input.file.workspace), expected = resolve(input.dataRoot, 'paper-exports') + sep;
  if (!root.startsWith(expected) || isAbsolute(relative(resolve(input.dataRoot), root)) || relative(resolve(input.dataRoot), root).startsWith('..')) pending('path_invalid');
  await assertNoFileLinks(root);
  let initial: BigIntStats; try { initial = await fs.lstat(root, { bigint: true }); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { root, files: [], directories: [], absent: true } satisfies PaperExportWorkspaceInventory; throw error; }
  if (!initial.isDirectory()) pending('directory_unknown');
  const known = await policy(), book = input.book, artifact = 'artifacts-' + book;
  const inventory: PaperExportWorkspaceInventory = { root, files: [], directories: [], absent: false };
  const snapshots = new Map<string, Awaited<ReturnType<typeof observe>>>(); let bytes = 0, document = input.record?.intent.document;
  try {
    const saved = await observe(resolve(root, 'input.json'), 12 * 1024 * 1024, true); snapshots.set('input.json', saved);
    const parsed = paperExportDocumentSchema.parse(JSON.parse(saved.data!.toString('utf8'))); assertPaperExportDocument(parsed);
    if (paperExportDocumentSha256(parsed) !== saved.sha256 || input.record && saved.sha256 !== input.record.intent.documentSha256) pending('input_changed');
    document = parsed;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const media = new Map(document?.media.map(row => [row.path, row]) ?? []);
  const directoryAllowed = (name: string) => name === '' || name === 'media' || name === artifact || name === artifact + '/o' || name.startsWith(artifact + '/o/') && known.directory(name.slice((artifact + '/o/').length));
  async function visit(current: string, name: string, depth: number) {
    if (depth > limit.depth || current.length > limit.path) pending('directory_budget');
    await assertNoFileLinks(current); const before = await fs.lstat(current, { bigint: true });
    if (!before.isDirectory() || !directoryAllowed(name)) pending('directory_unknown');
    const entries = await fs.readdir(current, { withFileTypes: true });
    if (inventory.files.length + inventory.directories.length + entries.length > limit.files) pending('entry_budget');
    const directory: Directory = { path: current, relative: name, stat: before, children: new Set(entries.map(entry => entry.name)) }; inventory.directories.push(directory);
    for (const entry of entries) {
      const full = resolve(current, entry.name), child = name ? name + '/' + entry.name : entry.name;
      await assertNoFileLinks(full); const stat = await fs.lstat(full, { bigint: true });
      if (stat.isDirectory()) { await visit(full, child, depth + 1); continue; }
      if (!stat.isFile()) pending('file_unknown');
      let maximum = 0, expectedSha: string | undefined, expectedBytes: number | undefined, acceptedHashes: string[] | undefined;
      if (child === 'input.json') maximum = 12 * 1024 * 1024;
      else if (child === 'cancelled') maximum = 4096;
      else if (child === 'supervisor-' + book + '.log') maximum = 2 * 1024 * 1024;
      else if (child === 'supervisor-' + book + '-process.json') maximum = 65536;
      else if (child.startsWith('media/')) {
        const descriptor = media.get(child), retainedName = document ? null : /^media\/([a-f0-9]{64})\.png$/.exec(child);
        if (!descriptor && !retainedName) pending('media_unknown');
        maximum = descriptor?.bytes ?? 12 * 1024 * 1024; expectedBytes = descriptor?.bytes; expectedSha = descriptor?.sha256 ?? retainedName![1];
      }
      else if (child === artifact + '/' + book + '.pdf' || child === artifact + '/' + book + '.docx') {
        maximum = 80 * 1024 * 1024;
        const format = child.endsWith('.pdf') ? 'pdf' : 'docx';
        if (input.file.output?.book === book && input.file.output.format === format) { expectedBytes = input.file.output.bytes; expectedSha = input.file.output.sha256; }
      } else if ([artifact + '/result.json', artifact + '/office-worker.log', artifact + '/worker-error.log', artifact + '/o-started.json', artifact + '/o-process.json', artifact + '/o-stdout.log', artifact + '/o-stderr.log'].includes(child)) maximum = 2 * 1024 * 1024;
      else if (child.startsWith(artifact + '/o/')) { const rule = known.rules.find(row => row.match.test(child.slice((artifact + '/o/').length))); if (rule) { maximum = rule.maxBytes; acceptedHashes = rule.sha256; } }
      if (!maximum) pending('file_unknown');
      const observed = snapshots.get(child) ?? await observe(full, maximum);
      if (observed.bytes > maximum || expectedBytes !== undefined && observed.bytes !== expectedBytes || expectedSha && observed.sha256 !== expectedSha || acceptedHashes && !acceptedHashes.includes(observed.sha256)) pending('file_changed');
      bytes += observed.bytes; if (bytes > limit.bytes) pending('byte_budget');
      inventory.files.push({ path: full, relative: child, stat: observed.stat, sha256: observed.sha256, bytes: observed.bytes });
    }
    const after = await fs.lstat(current, { bigint: true }); if (!same(before, after)) pending('directory_changed');
  }
  await visit(root, '', 0); return inventory;
}
/** Requires the exact workspace purge fence and fresh native guard for every IO. */
export async function deletePaperExportWorkspace(inventory: PaperExportWorkspaceInventory, guard: () => Promise<void>) {
  if (inventory.absent) { await guard(); return { removedFiles: 0, removedBytes: 0 }; }
  const directories = new Map(inventory.directories.map(row => [row.path, row])); let removedFiles = 0, removedBytes = 0;
  async function unchangedDirectory(directory: Directory) {
    await assertNoFileLinks(directory.path); const stat = await fs.lstat(directory.path, { bigint: true });
    if (!stat.isDirectory() || stat.dev !== directory.stat.dev || stat.ino !== directory.stat.ino) pending('directory_changed');
    const names = await fs.readdir(directory.path); if (names.length !== directory.children.size || names.some(name => !directory.children.has(name))) pending('directory_changed');
  }
  for (const file of inventory.files) {
    await guard(); const parent = directories.get(dirname(file.path))!; await unchangedDirectory(parent);
    const observed = await observe(file.path, file.bytes);
    if (!same(observed.stat, file.stat) || observed.sha256 !== file.sha256 || observed.bytes !== file.bytes) pending('file_changed');
    await guard(); await assertNoFileLinks(file.path);
    if (!same(await fs.lstat(file.path, { bigint: true }), file.stat)) pending('file_changed');
    await fs.unlink(file.path); parent.children.delete(relative(parent.path, file.path)); removedFiles++; removedBytes += file.bytes;
  }
  for (const directory of [...inventory.directories].sort((a, b) => b.path.length - a.path.length)) {
    await guard(); await unchangedDirectory(directory); if (directory.children.size) pending('directory_changed');
    await fs.rmdir(directory.path); const parent = directories.get(dirname(directory.path)); parent?.children.delete(relative(parent.path, directory.path));
  }
  return { removedFiles, removedBytes };
}
export function paperExportCollectionObservation(inventory: PaperExportWorkspaceInventory) {
  return { files: inventory.files.map(file => ({ path: file.relative, bytes: file.bytes, sha256: file.sha256, identity: identity(file.stat) })),
    directories: inventory.directories.map(directory => ({ path: directory.relative, identity: identity(directory.stat) })), absent: inventory.absent };
}

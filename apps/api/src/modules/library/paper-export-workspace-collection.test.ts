import { describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fixture } from './paper-export-fixture.spec';
import { paperExportDocumentBytes } from './paper-export-record';
import { reservePaperExportFile } from './paper-export-file-record';
import { inspectPaperExportWorkspace, deletePaperExportWorkspace } from './paper-export-workspace-collection';
import type { TaskRow } from '../../infrastructure/task-repository';

const repo = resolve(process.cwd(), '../..'), qa = join(repo, 'data/qa'); mkdirSync(qa, { recursive: true });
function setup() {
  const dataRoot = mkdtempSync(join(qa, 'export-collection-')), f = fixture(false, true), at = new Date().toISOString();
  const task: TaskRow = { ...f.tasks[0], state: 'running', attempts: 1, generation: 1, version: 2, availableAt: Date.now(), leaseToken: randomUUID(), leaseUntil: Date.now() + 60000,
    progress: {}, result: null, errorCode: null, updatedAt: at };
  const file = reservePaperExportFile(f.record, task, at).file, root = join(dataRoot, file.workspace);
  mkdirSync(join(root, 'artifacts-practice'), { recursive: true }); writeFileSync(join(root, 'input.json'), paperExportDocumentBytes(f.document));
  writeFileSync(join(root, 'artifacts-practice/practice.pdf'), '%PDF-generated-collection-fixture'); writeFileSync(join(root, 'supervisor-practice.log'), 'Generated deterministic test log');
  return { ...f, file, dataRoot, root, options: { dataRoot, file, book: 'practice' as const, record: f.record } };
}
describe('bounded exact export workspace IO', () => {
  it('inventories the complete known tree and then removes its exact files and empty directories', async () => {
    const f = setup(), observed = await inspectPaperExportWorkspace(f.options); expect(observed.files).toHaveLength(3);
    expect(existsSync(join(f.root, 'input.json'))).toBe(true); let guards = 0;
    expect((await deletePaperExportWorkspace(observed, async () => { guards++; })).removedFiles).toBe(3);
    expect(guards).toBeGreaterThan(3); expect(existsSync(f.root)).toBe(false);
  });
  it('retains an unknown file and every known file before any destructive IO', async () => {
    const f = setup(), unknown = join(f.root, 'DO-NOT-DELETE.txt'); writeFileSync(unknown, 'Generated unknown-entry sentinel');
    await expect(inspectPaperExportWorkspace(f.options)).rejects.toThrow('file_unknown');
    expect(readFileSync(unknown, 'utf8')).toBe('Generated unknown-entry sentinel'); expect(existsSync(join(f.root, 'input.json'))).toBe(true);
  });
  it('retains unknown empty directories and refuses a different book directory', async () => {
    for (const name of ['unknown-empty', 'artifacts-answers']) { const f = setup(); mkdirSync(join(f.root, name)); await expect(inspectPaperExportWorkspace(f.options)).rejects.toThrow('directory_unknown'); expect(existsSync(join(f.root, 'input.json'))).toBe(true); }
  });
  it('refuses an actual generated junction without changing its target', async () => {
    const f = setup(), target = join(f.dataRoot, 'kept-target'); mkdirSync(target); writeFileSync(join(target, 'sentinel.txt'), 'Kept exact generated target');
    symlinkSync(target, join(f.root, 'linked'), 'junction'); await expect(inspectPaperExportWorkspace(f.options)).rejects.toThrow('link_refused');
    expect(readFileSync(join(target, 'sentinel.txt'), 'utf8')).toBe('Kept exact generated target');
  });
  it('rejects a same-size inode-content change after the observed inventory', async () => {
    const f = setup(), observed = await inspectPaperExportWorkspace(f.options), file = observed.files[0], before = readFileSync(file.path), after = Buffer.from(before); after[0] ^= 1; writeFileSync(file.path, after);
    await expect(deletePaperExportWorkspace(observed, async () => {})).rejects.toThrow('file_changed'); expect(readFileSync(file.path)).toEqual(after);
  });
  it('rejects an unknown entry introduced after the initial inventory', async () => {
    const f = setup(), observed = await inspectPaperExportWorkspace(f.options); writeFileSync(join(f.root, 'late.txt'), 'Generated late-entry sentinel');
    await expect(deletePaperExportWorkspace(observed, async () => {})).rejects.toThrow('directory_changed'); expect(existsSync(join(f.root, 'input.json'))).toBe(true);
  });
  it('rechecks the exact inode after the final asynchronous native guard', async () => {
    const f = setup(), observed = await inspectPaperExportWorkspace(f.options), file = observed.files[0]; let called = 0;
    await expect(deletePaperExportWorkspace(observed, async () => { called++; if (called === 2) { await fs.rename(file.path, file.path + '.retained'); writeFileSync(file.path, 'Generated replacement'); } })).rejects.toThrow('file_changed');
    expect(readFileSync(file.path, 'utf8')).toBe('Generated replacement'); expect(existsSync(file.path + '.retained')).toBe(true);
  });
  it('does not start destructive IO after native qualification is withdrawn', async () => {
    const f = setup(), observed = await inspectPaperExportWorkspace(f.options); await expect(deletePaperExportWorkspace(observed, async () => { throw Error('Actual qualification changed'); })).rejects.toThrow('qualification changed'); expect(existsSync(join(f.root, 'input.json'))).toBe(true);
  });
  it('resumes actual partial deletion by inspecting the remaining known files', async () => {
    const f = setup(), observed = await inspectPaperExportWorkspace(f.options); let called = 0;
    await expect(deletePaperExportWorkspace(observed, async () => { if (++called === 3) throw Error('Generated interruption'); })).rejects.toThrow('interruption');
    const remaining = await inspectPaperExportWorkspace(f.options); expect(remaining.files.length).toBeLessThan(observed.files.length);
    await deletePaperExportWorkspace(remaining, async () => {}); expect(existsSync(f.root)).toBe(false);
  });
  it('can finish a genuinely absent workspace without manufacturing file deletions', async () => {
    const f = setup(); const inventory = await inspectPaperExportWorkspace(f.options); await deletePaperExportWorkspace(inventory, async () => {});
    const absent = await inspectPaperExportWorkspace(f.options); expect(absent.absent).toBe(true); expect(await deletePaperExportWorkspace(absent, async () => {})).toEqual({ removedFiles: 0, removedBytes: 0 });
  });
  it.skipIf(!existsSync(join(resolve(process.env.STUDY_TEST_PAPER_EXPORT_PROJECT_ROOT ?? repo), 'data/qa/w175a/actual-render-files.json')))('inventories a copy of the actual full Office profile using exact versioned paths', async () => {
    const project = resolve(process.env.STUDY_TEST_PAPER_EXPORT_PROJECT_ROOT ?? repo), source = join(project, 'data/qa/w175a');
    const db = new DatabaseSync(join(source, 'study-agent.sqlite3'), { readOnly: true });
    let record: any, file: any;
    try {
      const exported = db.prepare("SELECT body FROM domain_records WHERE collection='paperExports' ORDER BY position LIMIT 1").get() as any; record = JSON.parse(exported.body);
      const reference = record.slots[0].published.fileId, retained = db.prepare("SELECT body FROM domain_records WHERE collection='paperExportFiles' AND record_id=?").get(reference) as any; file = JSON.parse(retained.body);
    } finally { db.close(); }
    const dataRoot = mkdtempSync(join(qa, 'actual-office-profile-')), destination = join(dataRoot, file.workspace), original = join(source, file.workspace);
    function copy(from: string, to: string) { mkdirSync(to, { recursive: true }); for (const entry of readdirSync(from, { withFileTypes: true })) { const input = join(from, entry.name), output = join(to, entry.name); if (lstatSync(input).isSymbolicLink()) throw Error('Generated fixture source links refused'); if (entry.isDirectory()) copy(input, output); else copyFileSync(input, output); } }
    copy(original, destination); expect(destination.startsWith(resolve(qa) + sep)).toBe(true);
    const observed = await inspectPaperExportWorkspace({ dataRoot, file, book: 'practice', record }); expect(observed.files.length).toBeGreaterThan(50);
    await deletePaperExportWorkspace(observed, async () => {}); expect(existsSync(destination)).toBe(false); expect(existsSync(original)).toBe(true);
  });
});

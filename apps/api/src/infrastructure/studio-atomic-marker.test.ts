import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat, writeFile, mkdir, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireStudioPurgeFence, inspectStudioFileLeases, pruneDeadStudioFileLeases, revokeStudioUploadFiles, studioCoordinationRoot, acquireStudioFileLease } from './studio-file-coordination';
import { publishStudioMarker, parseStudioMarkerStagingName, type StudioMarkerPhase, type StudioMarkerPurpose } from './studio-atomic-marker';

const phases: StudioMarkerPhase[] = ['created', 'written', 'synced', 'published', 'cleaned'];
const repo = resolve(__dirname, '../../../..');
describe('atomic control marker publication and actual producer crashes', () => {
  const roots: string[] = [], children: ChildProcess[] = [];
  afterEach(async () => {
    for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) { const closed = once(child, 'close'); child.kill('SIGKILL'); await closed; }
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  });
  async function fixture() { const root = await mkdtemp(join(tmpdir(), 'study-atomic-marker-')); roots.push(root); return root; }
  async function start(root: string, key: string, purpose: StudioMarkerPurpose, phase: StudioMarkerPhase, python = false) {
    const args = [root, purpose === 'revoked' ? 'upload' : 'source', key, purpose, phase];
    const child = python
      ? spawn(process.env.STUDY_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3'), ['-X', 'utf8', join(repo, 'scripts/qa/fixtures/studio-marker-child.py'), ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      : spawn(process.execPath, [join(repo, 'scripts/qa/fixtures/studio-marker-child.cjs'), ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    await new Promise<void>((ready, reject) => {
      let stdout = '', stderr = '';
      const timer = setTimeout(() => reject(new Error('Atomic marker child timeout: ' + stderr)), 15000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error('Atomic marker child exited ' + code + ': ' + stderr)); });
      child.stderr!.on('data', chunk => { stderr += chunk; });
      child.stdout!.on('data', chunk => { stdout += chunk; if (stdout.includes('\n')) { clearTimeout(timer); try { expect(JSON.parse(stdout.trim())).toMatchObject({ phase, pid: child.pid }); ready(); } catch (error) { reject(error); } } });
    });
    return child;
  }
  const identity = () => ({ generation: 1, taskId: 'task_' + randomUUID(), token: randomUUID() });
  for (const python of [false, true]) for (const purpose of (python ? ['lease'] : ['lease', 'purge', 'revoked']) as StudioMarkerPurpose[]) for (const phase of phases) {
    it(`${python ? 'Python' : 'Node'} ${purpose}: protects while alive and recovers after forced exit at ${phase}`, async () => {
      const root = await fixture(), kind = purpose === 'revoked' ? 'upload' : 'source', key = kind === 'source' ? 'a'.repeat(64) : 'studio_upload_' + randomUUID();
      const child = await start(root, key, purpose, phase, python), control = studioCoordinationRoot(root, kind, key);
      const finalExists = phase === 'published' || phase === 'cleaned';
      const names = await readdir(join(control, 'leases')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
      const file = purpose === 'lease' ? join(control, 'leases', names[0] ?? 'missing.json') : join(control, purpose + '.json');
      if (finalExists) expect(JSON.parse(await readFile(file, 'utf8')).format).toBe(purpose === 'lease' ? 'study-file-lease-v1' : purpose === 'purge' ? 'study-file-purge-v1' : 'study-upload-revocation-v1');
      else await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
      if (purpose === 'purge' && finalExists) await expect(acquireStudioPurgeFence(root, kind, key, identity())).rejects.toThrow('owner_active');
      else {
        const release = await acquireStudioPurgeFence(root, kind, key, identity());
        try {
          if (purpose === 'revoked' && phase === 'cleaned') expect(await inspectStudioFileLeases(root, kind, key)).toEqual([]);
          else { expect((await inspectStudioFileLeases(root, kind, key)).some(row => row.status === 'active')).toBe(true); await expect(pruneDeadStudioFileLeases(root, kind, key)).rejects.toThrow('active_or_unknown'); }
        } finally { await release(); }
      }
      const closed = once(child, 'close'); child.kill('SIGKILL'); await closed;
      const release = await acquireStudioPurgeFence(root, kind, key, identity());
      try { await pruneDeadStudioFileLeases(root, kind, key); expect(await inspectStudioFileLeases(root, kind, key)).toEqual([]); } finally { await release(); }
      expect(await readdir(join(control, 'staging'))).toEqual([]);
      if (purpose === 'revoked' && finalExists) {
        await revokeStudioUploadFiles(root, key);
        await expect(acquireStudioFileLease(root, 'upload', key)).rejects.toThrow('撤销');
      } else { const lease = await acquireStudioFileLease(root, kind, key); await lease(); }
    });
  }
  it('cleans its unpublished ephemeral owner on exceptions at every phase and never reverses a published revocation', async () => {
    const root = await fixture();
    for (const purpose of ['lease', 'purge', 'revoked'] as StudioMarkerPurpose[]) for (const phase of phases) {
      const key = 'studio_upload_' + randomUUID(), control = studioCoordinationRoot(root, 'upload', key), file = join(control, purpose === 'lease' ? 'leases/' + randomUUID() + '.json' : purpose + '.json');
      const value = { format: 'fixture', pid: process.pid, nonce: randomUUID() };
      await expect(publishStudioMarker(control, file, purpose, value, async current => { if (phase === current) throw new Error('injected publisher exception'); })).rejects.toThrow('injected');
      const permanent = purpose === 'revoked' && (phase === 'published' || phase === 'cleaned');
      if (permanent) expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(value);
      else await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readdir(join(control, 'staging'))).toEqual([]);
    }
  });
  it('never overwrites another owner and rejects unsafe or oversized staging without deleting unknown bytes', async () => {
    const root = await fixture(), key = 'b'.repeat(64), control = studioCoordinationRoot(root, 'source', key), file = join(control, 'purge.json'), release = await acquireStudioPurgeFence(root, 'source', key, identity()), before = await readFile(file);
    await expect(publishStudioMarker(control, file, 'purge', { nonce: randomUUID(), pid: process.pid })).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await readFile(file)).toEqual(before); await release();
    const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { windowsHide: true, stdio: 'ignore' }); const pid = child.pid!; await once(child, 'close');
    const staging = join(control, 'staging'), oversized = `lease-${pid}-${randomUUID()}.pending`;
    await writeFile(join(staging, oversized), Buffer.alloc(4097, 'x')); await writeFile(join(staging, 'operator-note.txt'), 'preserve unknown');
    const outside = join(root, 'outside'); await mkdir(outside); await writeFile(join(outside, 'sentinel'), 'outside');
    await symlink(outside, join(staging, `purge-${pid}-${randomUUID()}.pending`), process.platform === 'win32' ? 'junction' : 'dir');
    const held = await acquireStudioPurgeFence(root, 'source', key, identity());
    try { expect((await inspectStudioFileLeases(root, 'source', key)).every(row => row.status === 'unknown')).toBe(true); await expect(pruneDeadStudioFileLeases(root, 'source', key)).rejects.toThrow('active_or_unknown'); } finally { await held(); }
    expect(await readFile(join(staging, oversized))).toHaveLength(4097); expect(await readFile(join(outside, 'sentinel'), 'utf8')).toBe('outside'); expect(await readFile(join(staging, 'operator-note.txt'), 'utf8')).toBe('preserve unknown');
  });
  it('accepts the same canonical staging names as Python and the independent audit', async () => {
    const { parseMarkerStagingName } = require(join(repo, 'scripts/operations/material-audit.cjs'));
    const examples = ['lease-1-' + randomUUID() + '.pending', 'purge-9007199254740991-' + randomUUID() + '.pending', 'revoked-12-' + randomUUID() + '.pending', 'lease-01-' + randomUUID() + '.pending', 'lease-0-' + randomUUID() + '.pending', 'lease-9007199254740992-' + randomUUID() + '.pending', '../lease-1-' + randomUUID() + '.pending', 'lease-1-unknown.pending'];
    for (const name of examples) expect(parseMarkerStagingName(name)).toEqual(parseStudioMarkerStagingName(name));
    const child = spawn(process.env.STUDY_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3'), ['-X', 'utf8', '-c', 'import json,sys;sys.path.insert(0,sys.argv[1]);from file_leases import parse_staging_name;print(json.dumps([parse_staging_name(n) for n in json.loads(sys.argv[2])]))', join(repo, 'scripts/processing'), JSON.stringify(examples)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout!.on('data', chunk => { output += chunk; }); expect((await once(child, 'close'))[0]).toBe(0); expect(JSON.parse(output)).toEqual(examples.map(parseStudioMarkerStagingName));
  });
});

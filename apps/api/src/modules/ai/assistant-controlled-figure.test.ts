import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { controlledTeachingFigure, previewControlledTeachingFigure } from './assistant-controlled-figure';

describe('frozen original teaching figures', () => {
  const roots: string[] = [];
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'study-controlled-figure-')); roots.push(root);
    const href = '/classroom/chemistry-v2/changes.svg', bytes = '<svg xmlns="http://www.w3.org/2000/svg"><title>Original anonymous model</title></svg>';
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    mkdirSync(join(root, 'resources/curriculum'), { recursive: true }); mkdirSync(join(root, 'apps/web/public/classroom/chemistry-v2'), { recursive: true });
    const file = join(root, 'apps/web/public', href.slice(1)); writeFileSync(file, bytes);
    const manifest = join(root, 'resources/curriculum/chemistry-tutorial-figures-v2.json');
    writeFileSync(manifest, JSON.stringify({ figures: [{ href, sha256 }] })); return { root, href, sha256, file, manifest };
  }
  afterEach(() => {
    for (const root of roots.splice(0)) {
      if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.split(/[\\/]/).at(-1)!.startsWith('study-controlled-figure-')) throw Error('Unsafe figure fixture root');
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('shows only the exact frozen original bytes and retains their identity after replacement or loss', () => {
    const f = fixture(), asset = controlledTeachingFigure(f.href, f.root)!;
    expect(asset).toEqual({ href: f.href, sha256: f.sha256 }); expect(previewControlledTeachingFigure(asset, f.root).status).toBe('verified');
    writeFileSync(f.file, '<svg xmlns="http://www.w3.org/2000/svg"><text>Changed image</text></svg>');
    expect(previewControlledTeachingFigure(asset, f.root)).toEqual({ ...asset, status: 'changed' });
    rmSync(f.file); expect(previewControlledTeachingFigure(asset, f.root)).toEqual({ ...asset, status: 'unavailable' });
  });
  it('refuses remote, uploaded, traversing, unknown and malformed asset identities', () => {
    const f = fixture();
    for (const href of ['https://untrusted.invalid/picture.svg', '/api/private/upload.svg', '/classroom/chemistry-v2/../private.svg', '/classroom/chemistry-v2/unknown.svg']) {
      expect(controlledTeachingFigure(href, f.root)).toBeUndefined();
      expect(previewControlledTeachingFigure({ href, sha256: f.sha256 }, f.root).status).toBe('unavailable');
    }
    expect(previewControlledTeachingFigure({ href: f.href, sha256: 'not-a-hash' }, f.root).status).toBe('unavailable');
  });
  it('fails closed on duplicate or unreadable registry entries', () => {
    const f = fixture(), asset = { href: f.href, sha256: f.sha256 };
    writeFileSync(f.manifest, JSON.stringify({ figures: [asset, asset] }));
    expect(controlledTeachingFigure(f.href, f.root)).toBeUndefined(); expect(previewControlledTeachingFigure(asset, f.root).status).toBe('unavailable');
    writeFileSync(f.manifest, 'invalid-json'); expect(controlledTeachingFigure(f.href, f.root)).toBeUndefined();
    expect(previewControlledTeachingFigure(asset, f.root).status).toBe('unavailable');
  });
});

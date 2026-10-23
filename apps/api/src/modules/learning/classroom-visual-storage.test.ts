import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { newVisualId, publishVisual, visualStage, visualFile, visualDirectory, purgeVisual, visualDirectories, pruneVisualStages } from './classroom-visual-storage';
describe('classroom visual file integrity and owned storage boundary', () => {
    let directory: string | undefined;
    afterEach(() => { vi.unstubAllEnvs(); if (directory)
        rmSync(directory, { recursive: true, force: true }); directory = undefined; });
    function setup() { directory = mkdtempSync(join(tmpdir(), 'study-visual-storage-')); vi.stubEnv('STUDY_DATA_DIR', directory); const id = newVisualId(); return { id, stage: visualStage(id, randomUUID()) }; }
    it('strips source metadata while preserving the original and verifies all content-addressed files', async () => {
        const { id, stage } = setup(), output = join(stage, 'metadata.png');
        await sharp({ create: { width: 1024, height: 1024, channels: 3, background: 'white' } }).withMetadata({ exif: { IFD0: { Artist: 'Anonymous QA source metadata' } } }).png().toFile(output);
        const published = await publishVisual(id, output, 'Anonymous QA prompt'), row = { id, ...published };
        expect((await sharp(visualFile(row, 'original').bytes).metadata()).exif).toBeDefined();
        expect((await sharp(visualFile(row).bytes).metadata()).exif).toBeUndefined();
        expect(visualFile(row, 'prompt').bytes.toString()).toBe('Anonymous QA prompt');
        const file = visualFile(row);
        writeFileSync(file.path, Buffer.alloc(file.size));
        expect(() => visualFile(row)).toThrow('visual_file_changed');
    });
    it('rejects files outside its task directory and decoded dimensions that differ from the contract', async () => {
        const { id, stage } = setup(), outside = join(directory!, 'outside.png'), wrong = join(stage, 'wrong.png');
        await sharp({ create: { width: 32, height: 32, channels: 3, background: 'white' } }).png().toFile(outside);
        await expect(publishVisual(id, outside, 'QA')).rejects.toThrow('visual_output_invalid');
        await sharp({ create: { width: 64, height: 64, channels: 3, background: 'white' } }).png().toFile(wrong);
        await expect(publishVisual(id, wrong, 'QA')).rejects.toThrow('visual_dimensions_invalid');
    });
    it('rejects oversized bytes and invalid IDs before publishing or deleting', async () => {
        const { id, stage } = setup(), output = join(stage, 'oversized.png');
        writeFileSync(output, Buffer.alloc(24 * 1024 * 1024 + 1));
        await expect(publishVisual(id, output, 'QA')).rejects.toThrow('visual_output_invalid');
        expect(() => visualDirectory('../outside')).toThrow('visual_id_invalid');
        expect(() => purgeVisual('../outside')).toThrow('visual_id_invalid');
    });
    it('refuses a junction or symlink rather than traversing it for generated files or cleanup', () => {
        const { id } = setup(), outside = join(directory!, 'unrelated'), root = join(directory!, 'classroom-visuals'), linkedId = newVisualId();
        mkdirSync(outside);
        const sentinel = join(outside, 'keep.txt');
        writeFileSync(sentinel, 'Keep unrelated file');
        symlinkSync(outside, join(root, linkedId), process.platform === 'win32' ? 'junction' : 'dir');
        expect(() => visualDirectory(linkedId)).toThrow('visual_link_rejected');
        expect(() => purgeVisual(linkedId)).toThrow('visual_link_rejected');
        expect(existsSync(sentinel)).toBe(true);
        expect(existsSync(visualDirectory(id))).toBe(true);
    });
    it('gives new directories an orphan grace period and only reclaims stale stages outside the active lease', () => {
        const { id, stage } = setup(), activeToken = randomUUID(), active = visualStage(id, activeToken), fresh = visualStage(id, randomUUID()), old = new Date(Date.now() - 7200000);
        utimesSync(stage, old, old);
        utimesSync(active, old, old);
        expect(visualDirectories(3600000)).toEqual([]);
        pruneVisualStages(id, activeToken);
        expect(existsSync(stage)).toBe(false);
        expect(existsSync(active)).toBe(true);
        expect(existsSync(fresh)).toBe(true);
        utimesSync(visualDirectory(id), old, old);
        expect(visualDirectories(3600000)).toEqual([id]);
    });
});

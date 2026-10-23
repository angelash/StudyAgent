import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, lstatSync, existsSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { resolve, parse, relative, sep, join } from 'node:path';
import sharp from 'sharp';
import type { ClassroomVisualRecord, ClassroomVisualFile } from '@study-agent/contracts';
import { studyDataRoot } from '../../infrastructure/workspace-paths';
export const visualIdPattern = /^classroom_visual_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const visualRoot = () => resolve(studyDataRoot(), 'classroom-visuals');
export const visualSha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
function ordered(value: any): any { return Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value; }
export const visualDigest = (value: unknown) => visualSha(JSON.stringify(ordered(value)));
/** All existing ancestors are checked, including Windows directory junctions. */
export function visualNoLinks(path: string) { const absolute = resolve(path); let current = parse(absolute).root; for (const segment of relative(current, absolute).split(sep).filter(Boolean)) {
    current = join(current, segment);
    if (existsSync(current) && lstatSync(current).isSymbolicLink())
        throw new Error('visual_link_rejected');
} return absolute; }
export function visualDirectory(id: string) { if (!visualIdPattern.test(id))
    throw new Error('visual_id_invalid'); const root = visualNoLinks(visualRoot()), directory = resolve(root, id); if (!directory.startsWith(root + sep))
    throw new Error('visual_path_invalid'); return visualNoLinks(directory); }
export function visualStage(id: string, token: string) { if (!/^[a-f0-9-]{36}$/.test(token))
    throw new Error('visual_lease_invalid'); const directory = visualNoLinks(join(visualDirectory(id), 'staging-' + token)); mkdirSync(directory, { recursive: true }); visualNoLinks(directory); return directory; }
function checkedFile(id: string, file: ClassroomVisualFile) { if (!/^[a-f0-9]{64}\.(?:png|txt)$/.test(file.name) || !file.name.startsWith(file.sha256 + '.') || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > 24 * 1024 * 1024)
    throw new Error('visual_reference_invalid'); const path = visualNoLinks(join(visualDirectory(id), file.name)); if (!lstatSync(path).isFile())
    throw new Error('visual_file_invalid'); const bytes = readFileSync(path); if (bytes.length !== file.size || visualSha(bytes) !== file.sha256)
    throw new Error('visual_file_changed'); return { path, bytes, size: bytes.length, sha256: file.sha256, mediaType: file.name.endsWith('.png') ? 'image/png' : 'text/plain' }; }
export function visualFile(record: Pick<ClassroomVisualRecord, 'id' | 'files'>, part: 'image' | 'original' | 'prompt' = 'image') { if (!record.files)
    throw new Error('visual_not_ready'); return checkedFile(record.id, record.files[part]); }
function save(id: string, bytes: Buffer, extension: 'png' | 'txt'): ClassroomVisualFile { const sha256 = visualSha(bytes), name = sha256 + '.' + extension, path = visualNoLinks(join(visualDirectory(id), name)); mkdirSync(visualDirectory(id), { recursive: true }); if (!existsSync(path))
    writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 }); const descriptor = { name, sha256, size: bytes.length }; checkedFile(id, descriptor); return descriptor; }
export async function publishVisual(id: string, imagePath: string, prompt: string) {
    const directory = visualDirectory(id), path = visualNoLinks(imagePath);
    if (!path.startsWith(directory + sep) || !lstatSync(path).isFile() || lstatSync(path).size > 24 * 1024 * 1024)
        throw new Error('visual_output_invalid');
    const original = readFileSync(path), decoder = sharp(original, { limitInputPixels: 4 * 1024 * 1024, failOn: 'warning' }), meta = await decoder.metadata();
    if (meta.format !== 'png' || meta.width !== 1024 || meta.height !== 1024)
        throw new Error('visual_dimensions_invalid');
    const image = await decoder.rotate().png().toBuffer();
    return { files: { original: save(id, original, 'png'), image: save(id, image, 'png'), prompt: save(id, Buffer.from(prompt, 'utf8'), 'txt') }, width: meta.width, height: meta.height };
}
export function removeVisualStage(id: string, stage: string) { const directory = visualDirectory(id), target = visualNoLinks(stage); if (!target.startsWith(directory + sep) || !/^staging-[a-f0-9-]{36}$/.test(relative(directory, target)))
    throw new Error('visual_stage_invalid'); rmSync(target, { recursive: true, force: true }); }
export function purgeVisual(id: string) { const directory = visualDirectory(id); if (existsSync(directory)) {
    visualNoLinks(directory);
    rmSync(directory, { recursive: true, force: true });
} }
export function pruneVisualFiles(record: ClassroomVisualRecord) { if (!record.files)
    return; const directory = visualDirectory(record.id), keep = new Set(Object.values(record.files).map(file => file.name)); if (existsSync(directory))
    for (const entry of readdirSync(directory)) {
        if (/^[a-f0-9]{64}\.(?:png|txt)$/.test(entry) && !keep.has(entry)) {
            const path = visualNoLinks(join(directory, entry));
            if (lstatSync(path).isFile())
                rmSync(path);
        }
    } }
/** Give newly committed records time to become visible to a concurrent sweep's snapshot. */
export function visualDirectories(minimumAgeMs = 0) { const root = visualNoLinks(visualRoot()); return existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter(row => row.isDirectory() && visualIdPattern.test(row.name) && Date.now() - lstatSync(visualNoLinks(join(root, row.name))).mtimeMs >= minimumAgeMs).map(row => row.name) : []; }
export function pruneVisualStages(id: string, activeToken: string | null, minimumAgeMs = 3600000) { const directory = visualDirectory(id); if (!existsSync(directory))
    return; for (const entry of readdirSync(directory)) {
    if (!/^staging-[a-f0-9-]{36}$/.test(entry) || entry === 'staging-' + activeToken)
        continue;
    const path = visualNoLinks(join(directory, entry)), stat = lstatSync(path);
    if (stat.isDirectory() && Date.now() - stat.mtimeMs >= minimumAgeMs)
        removeVisualStage(id, path);
} }
export const newVisualId = () => 'classroom_visual_' + randomUUID();

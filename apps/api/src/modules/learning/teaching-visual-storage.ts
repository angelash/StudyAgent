import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, lstatSync, existsSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { resolve, parse, relative, sep, join } from 'node:path';
import sharp from 'sharp';
import type { ClassroomVisualFile } from '@study-agent/contracts';
import { studyDataRoot } from '../../infrastructure/workspace-paths';

type StoredVisual = { id: string; files: { original: ClassroomVisualFile; image: ClassroomVisualFile; prompt: ClassroomVisualFile } | null };
export const visualSha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
function ordered(value: any): any { return Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value; }
export const visualDigest = (value: unknown) => visualSha(JSON.stringify(ordered(value)));
export function visualNoLinks(path: string) {
  const absolute = resolve(path); let current = parse(absolute).root;
  for (const segment of relative(current, absolute).split(sep).filter(Boolean)) {
    current = join(current, segment); if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw Error('visual_link_rejected');
  }
  return absolute;
}
/** Domains retain their original paths, IDs and expected image dimensions. */
export function createTeachingVisualStorage(options: { namespace: string; pattern: RegExp; prefix: string; width: number; height: number }) {
  if (!/^[a-z][a-z0-9-]{3,80}$/.test(options.namespace) || !options.pattern.test(options.prefix + randomUUID()) ||
    ![options.width, options.height].every(value => Number.isSafeInteger(value) && value > 0 && value <= 3840) || options.width * options.height > 4 * 1024 * 1024)
    throw Error('visual_storage_configuration_invalid');
  const root = () => resolve(studyDataRoot(), options.namespace);
  function directory(id: string) {
    if (!options.pattern.test(id)) throw Error('visual_id_invalid');
    const base = visualNoLinks(root()), target = resolve(base, id); if (!target.startsWith(base + sep)) throw Error('visual_path_invalid');
    return visualNoLinks(target);
  }
  function stage(id: string, token: string) {
    if (!/^[a-f0-9-]{36}$/.test(token)) throw Error('visual_lease_invalid');
    const target = visualNoLinks(join(directory(id), 'staging-' + token)); mkdirSync(target, { recursive: true }); visualNoLinks(target); return target;
  }
  function checkedFile(id: string, descriptor: ClassroomVisualFile) {
    if (!/^[a-f0-9]{64}\.(?:png|txt)$/.test(descriptor.name) || !descriptor.name.startsWith(descriptor.sha256 + '.') ||
      !Number.isSafeInteger(descriptor.size) || descriptor.size < 1 || descriptor.size > 24 * 1024 * 1024) throw Error('visual_reference_invalid');
    const path = visualNoLinks(join(directory(id), descriptor.name)); if (!lstatSync(path).isFile()) throw Error('visual_file_invalid');
    const bytes = readFileSync(path); if (bytes.length !== descriptor.size || visualSha(bytes) !== descriptor.sha256) throw Error('visual_file_changed');
    return { path, bytes, size: bytes.length, sha256: descriptor.sha256, mediaType: descriptor.name.endsWith('.png') ? 'image/png' : 'text/plain' };
  }
  function file(record: StoredVisual, part: 'image' | 'original' | 'prompt' = 'image') {
    if (!record.files) throw Error('visual_not_ready'); return checkedFile(record.id, record.files[part]);
  }
  function save(id: string, bytes: Buffer, extension: 'png' | 'txt'): ClassroomVisualFile {
    const sha256 = visualSha(bytes), name = sha256 + '.' + extension, target = visualNoLinks(join(directory(id), name)); mkdirSync(directory(id), { recursive: true });
    if (!existsSync(target)) writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
    const descriptor = { name, sha256, size: bytes.length }; checkedFile(id, descriptor); return descriptor;
  }
  async function publish(id: string, source: string, prompt: string) {
    const base = directory(id), path = visualNoLinks(source);
    if (!path.startsWith(base + sep) || !lstatSync(path).isFile() || lstatSync(path).size > 24 * 1024 * 1024) throw Error('visual_output_invalid');
    const original = readFileSync(path), decoder = sharp(original, { limitInputPixels: 4 * 1024 * 1024, failOn: 'warning' }), metadata = await decoder.metadata();
    if (metadata.format !== 'png' || metadata.width !== options.width || metadata.height !== options.height) throw Error('visual_dimensions_invalid');
    const { data: image, info } = await decoder.rotate().png().toBuffer({ resolveWithObject: true });
    if (info.width !== options.width || info.height !== options.height) throw Error('visual_dimensions_invalid');
    return { files: { original: save(id, original, 'png'), image: save(id, image, 'png'), prompt: save(id, Buffer.from(prompt, 'utf8'), 'txt') }, width: info.width, height: info.height };
  }
  function removeStage(id: string, path: string) {
    const base = directory(id), target = visualNoLinks(path);
    if (!target.startsWith(base + sep) || !/^staging-[a-f0-9-]{36}$/.test(relative(base, target))) throw Error('visual_stage_invalid');
    rmSync(target, { recursive: true, force: true });
  }
  function purge(id: string) { const target = directory(id); if (existsSync(target)) { visualNoLinks(target); rmSync(target, { recursive: true, force: true }); } }
  function pruneFiles(record: StoredVisual) {
    if (!record.files) return; const base = directory(record.id), keep = new Set(Object.values(record.files).map(item => item.name));
    if (existsSync(base)) for (const name of readdirSync(base)) {
      if (/^[a-f0-9]{64}\.(?:png|txt)$/.test(name) && !keep.has(name)) { const path = visualNoLinks(join(base, name)); if (lstatSync(path).isFile()) rmSync(path); }
    }
  }
  function directories(minimumAgeMs = 0) {
    const base = visualNoLinks(root()); return existsSync(base) ? readdirSync(base, { withFileTypes: true }).filter(row => row.isDirectory() && options.pattern.test(row.name) &&
      Date.now() - lstatSync(visualNoLinks(join(base, row.name))).mtimeMs >= minimumAgeMs).map(row => row.name) : [];
  }
  function pruneStages(id: string, activeToken: string | null, minimumAgeMs = 3600000) {
    const base = directory(id); if (!existsSync(base)) return;
    for (const name of readdirSync(base)) {
      if (!/^staging-[a-f0-9-]{36}$/.test(name) || name === 'staging-' + activeToken) continue;
      const path = visualNoLinks(join(base, name)), stat = lstatSync(path); if (stat.isDirectory() && Date.now() - stat.mtimeMs >= minimumAgeMs) removeStage(id, path);
    }
  }
  return { root, directory, stage, file, publish, removeStage, purge, pruneFiles, directories, pruneStages, newId: () => options.prefix + randomUUID() };
}

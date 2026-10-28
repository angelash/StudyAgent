import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

export type ControlledTeachingFigure = { href: string; sha256: string; status?: 'verified' | 'changed' | 'unavailable' };
const hrefPattern = /^\/classroom\/chemistry-v2\/[a-z][a-z0-9-]*\.svg$/;
const hashPattern = /^[a-f0-9]{64}$/;

function projectRoot() {
  for (const start of [process.cwd(), __dirname]) {
    let candidate = resolve(start);
    for (let depth = 0; depth < 14; depth++) {
      if (existsSync(join(candidate, 'apps/web/public')) && existsSync(join(candidate, 'resources/curriculum'))) return candidate;
      const parent = dirname(candidate); if (parent === candidate) break; candidate = parent;
    }
  }
  return undefined;
}

function registry(root: string) {
  const parsed: unknown = JSON.parse(readFileSync(join(root, 'resources/curriculum/chemistry-tutorial-figures-v2.json'), 'utf8'));
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { figures?: unknown }).figures)) return [];
  const figures = (parsed as { figures: unknown[] }).figures;
  if (figures.length > 1000) return [];
  return figures.filter((row): row is { href: string; sha256: string } => Boolean(row && typeof row === 'object' &&
    typeof (row as ControlledTeachingFigure).href === 'string' && hrefPattern.test((row as ControlledTeachingFigure).href) &&
    typeof (row as ControlledTeachingFigure).sha256 === 'string' && hashPattern.test((row as ControlledTeachingFigure).sha256)));
}

/** Only the existing published original-figure registry can contribute a bundled image. */
export function controlledTeachingFigure(href: string, root = projectRoot()): ControlledTeachingFigure | undefined {
  if (!root || !hrefPattern.test(href)) return undefined;
  try {
    const matches = registry(root).filter(row => row.href === href);
    if (matches.length !== 1) return undefined;
    return { href: matches[0].href, sha256: matches[0].sha256 };
  } catch { return undefined; }
}

/** A frozen source never receives replacement bytes under its old image identity. */
export function previewControlledTeachingFigure(asset: ControlledTeachingFigure, root = projectRoot()): ControlledTeachingFigure {
  let status: NonNullable<ControlledTeachingFigure['status']> = 'unavailable';
  if (root && hrefPattern.test(asset.href) && hashPattern.test(asset.sha256)) try {
    if (registry(root).filter(row => row.href === asset.href).length !== 1) return { ...asset, status };
    const publicRoot = realpathSync(join(root, 'apps/web/public'));
    const file = realpathSync(join(publicRoot, asset.href.slice(1)));
    if (file.startsWith(publicRoot + sep)) status = createHash('sha256').update(readFileSync(file)).digest('hex') === asset.sha256 ? 'verified' : 'changed';
  } catch { /* Keep the complete description when the original cannot be verified. */ }
  return { href: asset.href, sha256: asset.sha256, status };
}

/* Import verified public reference assets. Standard-library only; no downloaded
 * JavaScript is loaded or executed. Existing different bytes are never replaced. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const capturePath = path.join(root, 'doc/evidence/2026-10-27/hyperknow-original-assets/manifest.json');
const target = path.join(root, 'apps/web/public/reference/hyperknow');
const manifestPath = path.join(target, 'asset-manifest.json');
const origin = 'https://agent.hyperknow.io';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const args = process.argv.slice(2), verify = args.includes('--verify');
const sourceIndex = args.indexOf('--source');
const source = sourceIndex >= 0 && args[sourceIndex + 1] ? path.resolve(args[sourceIndex + 1]) : null;
if (args.filter(arg => arg === '--source').length > 1 || args.filter(arg => arg === '--verify').length > 1) throw Error('Duplicate import option');
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--verify') continue;
  if (args[index] === '--source' && args[index + 1] && !args[index + 1].startsWith('--')) { index++; continue; }
  throw Error('Use --source <captured-directory> or --verify');
}

function assertUnlinked(file) {
  let current = path.resolve(file);
  while (true) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw Error('Linked asset path refused: ' + current);
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
}
function inside(directory, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || /^[a-z]:|^\\/i.test(relative) || relative.split(/[\\/]/).some(part => !part || ['.', '..'].includes(part))) throw Error('Unsafe asset relative path');
  const resolved = path.resolve(directory, relative);
  if (!resolved.startsWith(directory + path.sep)) throw Error('Asset escaped its expected directory');
  assertUnlinked(resolved); return resolved;
}
function resource(value) {
  const url = new URL(value);
  if (url.origin !== origin || url.username || url.password) throw Error('Only the captured public reference origin is allowed');
  url.hash = ''; return url;
}
function kind(url) {
  const extension = path.posix.extname(url.pathname).toLowerCase();
  return ['.woff2', '.woff', '.ttf', '.otf'].includes(extension) ? 'font' : extension === '.css' ? 'stylesheet' : extension === '.svg' ? 'svg' : null;
}
function checkBytes(file, expected, size) {
  const bytes = fs.readFileSync(file);
  if (bytes.length !== size || sha(bytes) !== expected) throw Error('Asset byte mismatch: ' + file);
  return bytes;
}
function main() {
  assertUnlinked(target); assertUnlinked(capturePath); assertUnlinked(manifestPath);
  const capture = JSON.parse(fs.readFileSync(capturePath, 'utf8').replace(/^\uFEFF/, ''));
  if (capture.status !== 'public-reference-assets-verified' || capture.origin !== origin || capture.files !== capture.assets.length) throw Error('Verified capture manifest required');
  const entries = capture.assets.map(entry => {
    const url = resource(entry.url);
    const expectedFile = url.href === origin + '/' ? 'index.html' : 'files' + url.pathname;
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || !/^[a-f0-9]{64}$/.test(entry.sha256) || entry.file !== expectedFile) throw Error('Invalid captured asset entry');
    return { ...entry, url: url.href, kind: kind(url), relative: url.pathname.slice(1), publicPath: '/reference/hyperknow' + url.pathname };
  });
  if (new Set(entries.map(entry => entry.url)).size !== entries.length) throw Error('Duplicate source URLs');
  const selected = entries.filter(entry => entry.kind), byUrl = new Map(selected.map(entry => [entry.url, entry]));
  const publicPaths = new Set(selected.map(entry => entry.publicPath));
  function assertLocalReferences(bytes) {
    const text = bytes.toString('utf8');
    const references = [...text.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)].map(match => match[1]);
    references.push(...[...text.matchAll(/@import\s+(["'])([^"']+)\1/g)].map(match => match[2]));
    for (const value of references) if (!value.startsWith('data:') && !value.startsWith('#') && !publicPaths.has(value.split('#')[0])) throw Error('CSS references an unknown or external product resource');
  }
  const names = selected.map(entry => entry.relative.toLowerCase());
  if (new Set(names).size !== names.length) throw Error('Case-insensitive destination collision');
  const captureFingerprint = sha(Buffer.from(JSON.stringify(entries.map(({ url, bytes, sha256 }) => ({ url, bytes, sha256 })))));
  if (verify) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.format !== 'hyperknow-local-assets-v1' || manifest.captureFingerprint !== captureFingerprint || manifest.files.length !== selected.length) throw Error('Local manifest differs from the captured inputs');
    for (const entry of manifest.files) {
      const original = byUrl.get(entry.sourceUrl);
      if (!original || entry.publicPath !== original.publicPath || entry.sourceSha256 !== original.sha256 || entry.kind !== original.kind) throw Error('Unknown local asset mapping');
      const bytes = checkBytes(inside(target, original.relative), entry.sha256, entry.bytes);
      if (entry.kind === 'stylesheet') assertLocalReferences(bytes);
    }
    if (new Set(manifest.files.map(entry => entry.sourceUrl)).size !== selected.length) throw Error('Local source coverage is incomplete');
    console.log(JSON.stringify({ status: 'verified', files: manifest.files.length, capturedSourceFiles: capture.files, bytes: manifest.files.reduce((sum, entry) => sum + entry.bytes, 0), thirdPartyResourceReferences: 0 }));
    return;
  }
  if (!source) throw Error('A captured --source directory is required');
  assertUnlinked(source);
  // Validate the entire capture before publishing any product asset.
  const originals = new Map(entries.map(entry => [entry.url, checkBytes(inside(source, entry.file), entry.sha256, entry.bytes)]));
  function localUrl(value, entry) {
    if (value.startsWith('data:') || value.startsWith('#')) return value;
    const resolved = new URL(value, entry.url), fragment = resolved.hash;
    const url = resource(resolved.href), referenced = byUrl.get(url.href);
    if (!referenced) throw Error('Uncaptured CSS dependency: ' + url.href);
    return referenced.publicPath + fragment;
  }
  const outputs = selected.map(entry => {
    let bytes = originals.get(entry.url), rewritten = 0;
    if (entry.kind === 'stylesheet') {
      const text = bytes.toString('utf8').replace(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g, (whole, value) => {
        if (value.startsWith('data:') || value.startsWith('#')) return whole;
        rewritten++; return 'url(' + JSON.stringify(localUrl(value, entry)) + ')';
      }).replace(/@import\s+(["'])([^"']+)\1/g, (_whole, _quote, value) => { rewritten++; return '@import ' + JSON.stringify(localUrl(value, entry)); });
      bytes = Buffer.from(text);
      assertLocalReferences(bytes);
    }
    if (entry.kind === 'svg' && /<(?:script|foreignObject)\b|\bon[a-z]+\s*=|(?:href|src)\s*=\s*["'](?:https?:|\/\/|javascript:)/i.test(bytes.toString('utf8'))) throw Error('Active or externally referencing SVG refused');
    return { entry, bytes, record: { sourceUrl: entry.url, sourceSha256: entry.sha256, sourceBytes: entry.bytes, kind: entry.kind, publicPath: entry.publicPath, bytes: bytes.length, sha256: sha(bytes), rewrittenResourceUrls: rewritten } };
  });
  // All dependencies and output bytes are known before this directory is changed.
  for (const output of outputs) {
    const file = inside(target, output.entry.relative);
    if (fs.existsSync(file)) checkBytes(file, output.record.sha256, output.bytes.length);
  }
  const manifest = { format: 'hyperknow-local-assets-v1', capturedAt: capture.at, captureFingerprint, scope: 'Verified fonts, CSS and static icons from the captured public reference. Local CSS URLs are derived; original bytes remain in the source archive.',
    sourceJavaScriptExecuted: false, fontsAndSourceNotices: 'Preserve original font/style notices. Source-specific licensing and attribution remain recorded separately from byte integrity.', files: outputs.map(output => output.record) };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  if (fs.existsSync(manifestPath) && !fs.readFileSync(manifestPath).equals(manifestBytes)) throw Error('Existing asset manifest differs; original target retained');
  for (const output of outputs) {
    const file = inside(target, output.entry.relative); fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, output.bytes, { flag: 'wx' });
    checkBytes(file, output.record.sha256, output.bytes.length);
  }
  fs.mkdirSync(target, { recursive: true });
  if (!fs.existsSync(manifestPath)) fs.writeFileSync(manifestPath, manifestBytes, { flag: 'wx' });
  console.log(JSON.stringify({ status: 'imported', files: outputs.length, capturedSourceFiles: capture.files, fonts: outputs.filter(row => row.entry.kind === 'font').length, stylesheets: outputs.filter(row => row.entry.kind === 'stylesheet').length, svg: outputs.filter(row => row.entry.kind === 'svg').length, rewrittenResourceUrls: outputs.reduce((sum, row) => sum + row.record.rewrittenResourceUrls, 0), bytes: outputs.reduce((sum, row) => sum + row.bytes.length, 0) }));
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }

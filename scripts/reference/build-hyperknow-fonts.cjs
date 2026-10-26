/* Extract font declarations from verified local styles; never evaluate the
 * captured client application or add its global layout rules to our pages. */
const fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto');
const postcss = require('postcss');
const root = path.resolve(__dirname, '../..'), assetRoot = path.join(root, 'apps/web/public/reference/hyperknow');
const sourcePath = path.join(assetRoot, 'asset-manifest.json'), metadataPath = path.join(root, 'apps/web/lib/original-teaching-fonts.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
if (process.argv.slice(2).some(arg => arg !== '--verify')) throw Error('Use no arguments to generate, or --verify');
function unlinked(file) { let current = file; while (true) { if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw Error('Linked font path refused'); const next = path.dirname(current); if (next === current) break; current = next; } }
function bytes(file) { unlinked(file); return fs.readFileSync(file); }
function main() {
  const sourceBytes = bytes(sourcePath), assets = JSON.parse(sourceBytes), knownPaths = new Set(assets.files.map(row => row.publicPath));
  if (assets.format !== 'hyperknow-local-assets-v1') throw Error('Verified local reference assets are required');
  const declarations = [], sources = [], families = new Map(), aliases = {}, unique = new Set();
  for (const item of assets.files.filter(row => row.kind === 'stylesheet')) {
    const file = path.resolve(root, 'apps/web/public', '.' + item.publicPath);
    if (!file.startsWith(assetRoot + path.sep)) throw Error('Stylesheet outside the verified mirror');
    const body = bytes(file); if (sha(body) !== item.sha256 || body.length !== item.bytes) throw Error('Mirrored stylesheet changed');
    const parsed = postcss.parse(body.toString('utf8')); let faceCount = 0;
    parsed.walkAtRules('font-face', rule => {
      let family = '';
      rule.walkDecls('font-family', decl => { family = decl.value.replace(/^['"]|['"]$/g, ''); });
      if (!family) throw Error('A captured font face has no family');
      if (family.startsWith('KaTeX_')) {
        const original = family; family = 'HKOriginal-' + family; aliases[original] = family;
        rule.walkDecls('font-family', decl => { decl.value = '"' + family + '"'; });
      }
      const text = rule.toString().split('\n').map(line => line.trimEnd()).join('\n');
      for (const match of text.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) if (!match[1].startsWith('data:') && !knownPaths.has(match[1])) throw Error('Font source is not a verified local asset: ' + match[1].slice(0,180));
      const digest = sha(Buffer.from(text)); if (unique.has(digest)) return; unique.add(digest);
      declarations.push(text); faceCount++;
      families.set(family, (families.get(family) ?? 0) + 1);
    });
    if (faceCount) sources.push({ path: item.publicPath, sha256: item.sha256, fontFaces: faceCount });
  }
  for (const required of ['Virgil', 'Xiaolai', 'Satoshi-Regular', 'Satoshi-Medium', 'Satoshi-Bold', 'MiSans']) if (!families.has(required)) throw Error('Missing captured family: ' + required);
  const css = Buffer.from('/* Original teaching font faces. Source notices are retained in the mirrored stylesheets listed in original-teaching-fonts.json. Layout rules are excluded. */\n' + declarations.join('\n\n') + '\n');
  const fingerprint = sha(css), publicPath = '/reference/hyperknow/font-faces-' + fingerprint.slice(0, 16) + '.css';
  const metadata = { format: 'original-teaching-fonts-v1', stylesheet: publicPath, sha256: fingerprint, bytes: css.length, faceCount: declarations.length,
    sourceAssetManifestSha256: sha(sourceBytes), families: [...families].map(([family, fontFaces]) => ({ family, fontFaces })), fontFamilyAliases: aliases, sources };
  const encoded = Buffer.from(JSON.stringify(metadata, null, 2) + '\n'), destination = path.join(root, 'apps/web/public', publicPath);
  unlinked(destination); unlinked(metadataPath);
  if (process.argv.includes('--verify')) {
    if (!bytes(metadataPath).equals(encoded) || !bytes(destination).equals(css)) throw Error('Generated font pack differs from captured declarations');
  } else {
    if (fs.existsSync(destination) && !bytes(destination).equals(css)) throw Error('Existing font pack differs; previous bytes retained');
    if (!fs.existsSync(destination)) fs.writeFileSync(destination, css, { flag: 'wx' });
    if (fs.existsSync(metadataPath) && JSON.parse(bytes(metadataPath)).format !== metadata.format) throw Error('Unknown existing font metadata');
    fs.writeFileSync(metadataPath, encoded);
  }
  console.log(JSON.stringify({ status: process.argv.includes('--verify') ? 'verified' : 'generated', faceCount: metadata.faceCount, families: metadata.families.length, stylesheets: sources.length, bytes: css.length, stylesheet: publicPath }));
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }

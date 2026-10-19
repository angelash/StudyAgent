// Serve the editor's licensed fonts locally; no CDN is needed while answering.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'), moduleRoot = path.dirname(require.resolve('mathlive'));
const destination = path.join(root, 'apps/web/public/vendor/mathlive');
const version = JSON.parse(fs.readFileSync(path.join(moduleRoot, 'package.json'), 'utf8')).version;
const files = [];
for (const name of fs.readdirSync(path.join(moduleRoot, 'fonts')).sort()) {
  if (!/^[A-Za-z0-9_-]+\.woff2$/.test(name)) throw new Error('Unexpected editor font asset');
  const bytes = fs.readFileSync(path.join(moduleRoot, 'fonts', name));
  fs.mkdirSync(path.join(destination, 'fonts'), { recursive: true }); fs.writeFileSync(path.join(destination, 'fonts', name), bytes);
  files.push({ path: `fonts/${name}`, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
fs.copyFileSync(path.join(moduleRoot, 'LICENSE.txt'), path.join(destination, 'LICENSE.txt'));
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({ package: 'mathlive', version, source: 'locked npm package', files }, null, 2) + '\n');
console.log(`Prepared ${files.length} local MathLive fonts (${version})`);

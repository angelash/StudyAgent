// HTTP artifact check only. This does not automate or replace browser acceptance.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const base = new URL(process.argv[2] ?? 'http://127.0.0.1:13000');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('Only a local QA server is allowed');
const destination = path.resolve(process.argv[3] ?? 'data/qa/web-delivery.json');
const routes = ['/parent/login', '/student/login', '/student/assessment', '/parent/data', '/admin/reviews'];
const evidence = { at: new Date().toISOString(), base: base.origin, scope: 'HTTP pages, generated scripts, CSS and local editor fonts only; no interactive, visual, keyboard, microphone or authenticated workflow acceptance', pages: [], scripts: 0, stylesheets: 0, fonts: [], passed: false };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function get(relative) {
  const url = new URL(relative, base);
  if (url.origin !== base.origin) throw new Error('Unexpected external asset');
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (response.status !== 200) throw new Error(`HTTP ${response.status}: ${url.pathname}`);
  return { response, bytes: Buffer.from(await response.arrayBuffer()) };
}
async function main() {
  const scripts = new Set(), stylesheets = new Set();
  for (const route of routes) {
    const { response, bytes } = await get(route);
    if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('Expected page HTML');
    const html = bytes.toString('utf8');
    for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^" ]+)"/g)) if (match[1].startsWith('/_next/')) scripts.add(match[1]);
    for (const match of html.matchAll(/<link\b[^>]*\bhref="([^" ]+\.css[^" ]*)"/g)) if (match[1].startsWith('/_next/')) stylesheets.add(match[1]);
    evidence.pages.push({ path: route, status: 200, bytes: bytes.length });
  }
  if (!scripts.size || !stylesheets.size) throw new Error('Expected production JS and CSS assets');
  for (const relative of scripts) {
    const { response } = await get(relative);
    if (!/(java|ecma)script/.test(response.headers.get('content-type') ?? '')) throw new Error('Unexpected script content type');
  }
  for (const relative of stylesheets) {
    const { response } = await get(relative);
    if (!response.headers.get('content-type')?.includes('text/css')) throw new Error('Unexpected stylesheet content type');
  }
  evidence.scripts = scripts.size; evidence.stylesheets = stylesheets.size;
  const manifest = JSON.parse((await get('/vendor/mathlive/manifest.json')).bytes.toString('utf8'));
  const version = JSON.parse(fs.readFileSync(path.join(path.dirname(require.resolve('mathlive')), 'package.json'), 'utf8')).version;
  if (manifest.package !== 'mathlive' || manifest.version !== version || !manifest.files?.length) throw new Error('Editor assets do not match installed version');
  for (const file of manifest.files) {
    if (!/^fonts\/[A-Za-z0-9_-]+\.woff2$/.test(file.path)) throw new Error('Unsafe font path');
    const { bytes } = await get(`/vendor/mathlive/${file.path}`);
    if (file.size !== bytes.length || file.sha256 !== hash(bytes)) throw new Error('Font checksum mismatch');
    evidence.fonts.push({ path: file.path, bytes: bytes.length, sha256: file.sha256 });
  }
  evidence.passed = true;
}
main().catch(error => { evidence.error = error.message; process.exitCode = 1; }).finally(() => {
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, pages: evidence.pages.length, scripts: evidence.scripts, stylesheets: evidence.stylesheets, fonts: evidence.fonts.length, error: evidence.error }));
});

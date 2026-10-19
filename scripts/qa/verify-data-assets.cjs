// This decodes original teaching images locally; it does not exercise a browser.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const { dataProbeAssets, buildDataProbeFamilies } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/authored-data-probes.js');
const root = path.resolve(__dirname, '../..'), output = path.resolve(process.argv[2] ?? 'data/qa/data-assets.json');
const renderDirectory = output.replace(/\.json$/, '') + '-images';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const evidence = { at: new Date().toISOString(), passed: false, scope: 'Canonical original content SVGs and local raster decoding; not browser or accessibility equivalence acceptance.', assets: [] };
async function main() {
  const assets = dataProbeAssets(), directory = path.join(root, 'apps/web/public/question-assets/data-probes-v1');
  assert.equal(Object.keys(assets).length, 16); assert.equal(new Set(Object.values(assets).map(hash)).size, 16);
  assert.deepEqual(fs.readdirSync(directory).sort(), Object.keys(assets).sort()); fs.mkdirSync(renderDirectory, { recursive: true });
  const rasters = new Map(), references = new Set(buildDataProbeFamilies().flatMap(family => family.exercises.flatMap(task =>
    (task.blocks ?? []).filter(block => block.type === 'image').map(block => block.url.split('/').at(-1)))));
  assert.deepEqual([...references].sort(), Object.keys(assets).sort());
  for (const [name, body] of Object.entries(assets)) {
    const actual = fs.readFileSync(path.join(directory, name)); assert.equal(actual.toString('utf8'), body);
    assert(!/<script|<foreignObject|\bon\w+\s*=|\bhref\s*=|url\s*\(/i.test(body));
    const raster = await sharp(actual).ensureAlpha().png().toBuffer(), metadata = await sharp(raster).metadata(), stats = await sharp(raster).stats();
    assert(metadata.width >= 280 && metadata.height >= 280); assert(stats.channels.slice(0, 3).every(channel => channel.stdev > 5), `${name}: empty rendering`);
    fs.writeFileSync(path.join(renderDirectory, name.replace('.svg', '.png')), raster); rasters.set(name, raster);
    evidence.assets.push({ name, bytes: actual.length, sha256: hash(actual), width: metadata.width, height: metadata.height, decoded: true, rasterSha256: hash(raster) });
  }
  evidence.contactSheets = [];
  for (const [group, names] of Object.entries({ clocks: Object.keys(assets).filter(name => name.startsWith('minute-')),
    maps: Object.keys(assets).filter(name => name.startsWith('map-')) })) {
    const columns = group === 'clocks' ? 4 : 2, cellWidth = group === 'clocks' ? 300 : 440, cellHeight = group === 'clocks' ? 320 : 400, layers = [];
    for (let index = 0; index < names.length; index++) {
      const left = index % columns * cellWidth, top = Math.floor(index / columns) * cellHeight, name = names[index];
      layers.push({ input: Buffer.from(`<svg width="${cellWidth}" height="30"><text x="12" y="22" font-family="sans-serif" font-size="16" fill="#244d40">${name}</text></svg>`), left, top });
      layers.push({ input: rasters.get(name), left: left + 10, top: top + 35 });
    }
    const file = path.join(renderDirectory, `${group}-contact.png`);
    await sharp({ create: { width: columns * cellWidth, height: Math.ceil(names.length / columns) * cellHeight, channels: 4, background: '#faf9ef' } }).composite(layers).png().toFile(file);
    evidence.contactSheets.push({ group, file: path.relative(root, file).replaceAll(path.sep, '/'), images: names.length, sha256: hash(fs.readFileSync(file)) });
  }
  evidence.totals = { tasks: buildDataProbeFamilies().reduce((count, family) => count + family.exercises.length, 0), assets: evidence.assets.length,
    bytes: evidence.assets.reduce((count, asset) => count + asset.bytes, 0), decoded: evidence.assets.filter(asset => asset.decoded).length };
  evidence.passed = true;
}
main().catch(error => { evidence.error = error.message; process.exitCode = 1; }).finally(() => {
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, totals: evidence.totals, contactSheets: evidence.contactSheets, error: evidence.error }));
});

// Independent local content-image rendering; this does not exercise a browser or certify page usability.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const { spatialProbeAssets, buildSpatialProbeFamilies } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/authored-spatial-probes.js');
const root = path.resolve(__dirname, '../..'), output = path.resolve(process.argv[2] ?? 'data/qa/spatial-assets.json');
const renderDirectory = output.replace(/\.json$/, '') + '-images';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const evidence = { at: new Date().toISOString(), passed: false, scope: 'Original SVG content geometry and local raster decoding; not browser acceptance.', assets: [] };
async function main() {
  const assets = spatialProbeAssets(), directory = path.join(root, 'apps/web/public/question-assets/spatial-probes-v1');
  assert.equal(Object.keys(assets).length, 43); assert.equal(new Set(Object.values(assets).map(hash)).size, 43);
  assert.deepEqual(fs.readdirSync(directory).sort(), Object.keys(assets).sort()); fs.mkdirSync(renderDirectory, { recursive: true });
  const rasters = new Map();
  for (const [name, body] of Object.entries(assets)) {
    const actual = fs.readFileSync(path.join(directory, name)); assert.equal(actual.toString('utf8'), body);
    assert(!/<script|<foreignObject|\bon\w+\s*=|\bhref\s*=|url\s*\(/i.test(body));
    const raster = await sharp(actual).ensureAlpha().png().toBuffer(), metadata = await sharp(raster).metadata(), stats = await sharp(raster).stats();
    assert(metadata.width >= 260 && metadata.height >= 200); assert(stats.channels.slice(0, 3).every(channel => channel.stdev > 5), `${name}: empty rendering`);
    fs.writeFileSync(path.join(renderDirectory, name.replace('.svg', '.png')), raster); rasters.set(name, raster);
    evidence.assets.push({ name, bytes: actual.length, sha256: hash(actual), width: metadata.width, height: metadata.height, decoded: true, rasterSha256: hash(raster) });
  }
  const sheets = { planar: Object.keys(assets).filter(name => /^(plane|constraint|cut)-/.test(name)),
    clocks: Object.keys(assets).filter(name => /^clock-\d/.test(name)), hidden: Object.keys(assets).filter(name => /^clock-hidden-/.test(name)),
    repair: Object.keys(assets).filter(name => /^clock-model-/.test(name)), solids: ['solids-0.svg'] };
  evidence.contactSheets = [];
  for (const [group, names] of Object.entries(sheets)) {
    const columns = group === 'planar' || group === 'repair' ? 3 : group === 'solids' ? 1 : 4, cellWidth = group === 'solids' ? 600 : 300, cellHeight = 290;
    const layers = [];
    for (let index = 0; index < names.length; index++) {
      const left = index % columns * cellWidth, top = Math.floor(index / columns) * cellHeight, name = names[index];
      const label = `<svg width="${cellWidth}" height="30"><text x="12" y="22" font-family="sans-serif" font-size="16" fill="#244d40">${name}</text></svg>`;
      layers.push({ input: Buffer.from(label), left, top });
      layers.push({ input: await sharp(rasters.get(name)).resize({ width: cellWidth - 20, height: 250, fit: 'inside' }).png().toBuffer(), left: left + 10, top: top + 35 });
    }
    const file = path.join(renderDirectory, `${group}-contact.png`);
    await sharp({ create: { width: columns * cellWidth, height: Math.ceil(names.length / columns) * cellHeight, channels: 4, background: '#faf9ef' } }).composite(layers).png().toFile(file);
    evidence.contactSheets.push({ group, file: path.relative(root, file).replaceAll(path.sep, '/'), images: names.length, sha256: hash(fs.readFileSync(file)) });
  }
  evidence.totals = { tasks: buildSpatialProbeFamilies().reduce((count, family) => count + family.exercises.length, 0), assets: evidence.assets.length,
    bytes: evidence.assets.reduce((count, asset) => count + asset.bytes, 0), decoded: evidence.assets.filter(asset => asset.decoded).length };
  evidence.passed = true;
}
main().catch(error => { evidence.error = error.message; process.exitCode = 1; }).finally(() => {
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, totals: evidence.totals, contactSheets: evidence.contactSheets, error: evidence.error }));
});

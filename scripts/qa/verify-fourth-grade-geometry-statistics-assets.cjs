// Local SVG raster decoding and contact sheets; this does not operate a browser.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto'), { spawnSync } = require('node:child_process'), sharp = require('sharp');
const { buildFourthGradeGeometryStatisticsProbeFamilies } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/authored-fourth-grade-geometry-statistics-probes.js');
const root = path.resolve(__dirname, '../..'), output = path.resolve(process.argv[2] ?? 'data/qa/fourth-grade-geometry-statistics-assets.json');
const renderDirectory = output.replace(/\.json$/, '') + '-images', prefix = 'apps/web/public/question-assets/fourth-grade-geometry-statistics-v1', directory = path.join(root, prefix);
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), families = buildFourthGradeGeometryStatisticsProbeFamilies();
const sources = ['scripts/qa/verify-fourth-grade-geometry-statistics-assets.cjs', 'scripts/content/build-fourth-grade-geometry-statistics.cjs',
  'resources/curriculum/fourth-grade-geometry-statistics-v1.json', 'apps/api/src/modules/diagnostics/authored-fourth-grade-geometry-statistics-probes.ts'];
const evidence = { at: new Date().toISOString(), passed: false,
  scope: 'All 48 original angle, triangle and bar-chart SVGs decoded locally. Contact sheets require separate visual inspection. No browser, accessibility-equivalence, teacher or real-student acceptance.',
  sourceSha256: Object.fromEntries(sources.map(file => [file, hash(fs.readFileSync(path.join(root, file)))])), assets: [] };
async function main() {
  const check = spawnSync(process.execPath, ['scripts/content/build-fourth-grade-geometry-statistics.cjs', '--check'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(check.status, 0, check.stderr);
  const names = [...new Set(families.flatMap(family => family.exercises.flatMap(task => (task.blocks ?? []).filter(block => block.type === 'image').map(block => block.url.split('/').at(-1)))))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.equal(names.length, 48); assert.deepEqual(fs.readdirSync(directory).sort(), [...names].sort());
  fs.mkdirSync(renderDirectory, { recursive: true }); const rasters = new Map();
  for (const name of names) {
    const actual = fs.readFileSync(path.join(directory, name));
    assert(!/<script|<foreignObject|\bon\w+\s*=|\bhref\s*=|url\s*\(/i.test(actual.toString('utf8')));
    const raster = await sharp(actual).ensureAlpha().png().toBuffer(), metadata = await sharp(raster).metadata(), stats = await sharp(raster).stats();
    assert.equal(metadata.width, 480); assert.equal(metadata.height, 340); assert(stats.channels.slice(0, 3).every(channel => channel.stdev > 5), `${name}: empty rendering`);
    fs.writeFileSync(path.join(renderDirectory, name.replace('.svg', '.png')), raster); rasters.set(name, raster);
    evidence.assets.push({ name, bytes: actual.length, sha256: hash(actual), width: metadata.width, height: metadata.height, decoded: true, rasterSha256: hash(raster) });
    evidence.sourceSha256[`${prefix}/${name}`] = hash(actual);
  }
  evidence.contactSheets = [];
  for (const [group, filePrefix] of [['angles', 'rotated-angle-'], ['equal-angles', 'equal-angle-triangle-'], ['exterior-angles', 'exterior-triangle-'], ['bars', 'bar-chart-']]) {
    const groupNames = names.filter(name => name.startsWith(filePrefix)), columns = 3, cellWidth = 480, cellHeight = 370, layers = [];
    assert.equal(groupNames.length, 12);
    for (let index = 0; index < groupNames.length; index++) {
      const name = groupNames[index], left = index % columns * cellWidth, top = Math.floor(index / columns) * cellHeight;
      layers.push({ input: Buffer.from(`<svg width="480" height="28"><text x="10" y="21" font-family="sans-serif" font-size="15" fill="#275345">${name}</text></svg>`), left, top });
      layers.push({ input: rasters.get(name), left, top: top + 30 });
    }
    const file = path.join(renderDirectory, `${group}-contact.png`);
    await sharp({ create: { width: columns * cellWidth, height: Math.ceil(groupNames.length / columns) * cellHeight, channels: 4, background: '#faf9ef' } }).composite(layers).png().toFile(file);
    evidence.contactSheets.push({ group, file: path.relative(root, file).replaceAll(path.sep, '/'), images: groupNames.length, sha256: hash(fs.readFileSync(file)) });
  }
  assert.equal(new Set(evidence.assets.map(asset => asset.sha256)).size, 48);
  evidence.totals = { tasks: families.reduce((count, family) => count + family.exercises.length, 0), assets: evidence.assets.length,
    bytes: evidence.assets.reduce((count, asset) => count + asset.bytes, 0), decoded: evidence.assets.filter(asset => asset.decoded).length };
  evidence.passed = true;
}
main().catch(error => { evidence.error = error.message; process.exitCode = 1; }).finally(() => {
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, totals: evidence.totals, contactSheets: evidence.contactSheets, error: evidence.error }));
});

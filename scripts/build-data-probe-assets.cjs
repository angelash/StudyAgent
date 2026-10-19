// Build the API before generating the self-contained original diagrams.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { dataProbeAssets } = require('../apps/api/dist/apps/api/src/modules/diagnostics/authored-data-probes.js');
const root = path.resolve(__dirname, '../apps/web/public/question-assets/data-probes-v1');
const assets = dataProbeAssets();
fs.mkdirSync(root, { recursive: true });
let bytes = 0;
for (const [name, body] of Object.entries(assets)) {
  assert(/^(minute-(blank|\d+)|map-\d+)\.svg$/.test(name));
  assert(!/<script|<foreignObject|\bon\w+\s*=|\bhref\s*=|url\s*\(/i.test(body), 'Original SVG must be self-contained');
  fs.writeFileSync(path.join(root, name), body); bytes += Buffer.byteLength(body);
}
console.log(JSON.stringify({ assets: Object.keys(assets).length, bytes }));

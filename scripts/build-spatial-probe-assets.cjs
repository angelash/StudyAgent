// API build must precede regeneration. Generated SVGs are committed with the authored tasks.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spatialProbeAssets } = require('../apps/api/dist/apps/api/src/modules/diagnostics/authored-spatial-probes.js');
const root = path.resolve(__dirname, '../apps/web/public/question-assets/spatial-probes-v1');
fs.mkdirSync(root, { recursive: true });
let bytes = 0;
for (const [name, body] of Object.entries(spatialProbeAssets())) {
  assert(/^(plane|cut|constraint|solids|clock|clock-hidden|clock-model)-\d+\.svg$/.test(name));
  assert(!/<script|<foreignObject|\bon\w+\s*=|\bhref\s*=|url\s*\(/i.test(body), 'SVG must be self-contained original geometry');
  fs.writeFileSync(path.join(root, name), body); bytes += Buffer.byteLength(body);
}
console.log(JSON.stringify({ assets: Object.keys(spatialProbeAssets()).length, bytes }));

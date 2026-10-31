const fs = require('node:fs'), path = require('node:path');
let source = fs.readFileSync(path.join(__dirname, 'original-preview-first.cjs'), 'utf8').replaceAll('original-preview-first', 'original-preview-second').replaceAll('browser-original-preview.png', 'browser-original-preview-second.png');
const before = "const imagePath = path.join(__dirname, 'actual-source-originals-first/browser-original-preview-second.png'); await source.screenshot({ path: imagePath });";
if (!source.includes(before)) throw Error('Expected first preview context missing');
source = source.replace(before, `const sharp = require(require.resolve('sharp', { paths: [cfg.candidate] })), renderChecks = []; let rendered = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const png = await iframe.screenshot(), raw = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true }); let light = 0;
      for (let index = 0; index < raw.data.length; index += raw.info.channels) if (raw.data[index] > 225 && raw.data[index + 1] > 225 && raw.data[index + 2] > 215) light++;
      const lightFraction = light / (raw.info.width * raw.info.height); renderChecks.push({ attempt, lightFraction });
      if (lightFraction > 0.25) { rendered = true; break; } await new Promise(resolve => setTimeout(resolve, 500));
    }
    fs.writeFileSync(path.join(__dirname, 'original-preview-render-second.json'), JSON.stringify({ rendered, renderChecks }), { flag: 'wx' }); assert.equal(rendered, true, 'PDF renderer has not displayed a source page');
    const imagePath = path.join(__dirname, 'actual-source-originals-first/browser-original-preview-second.png'); await source.screenshot({ path: imagePath });`);
fs.writeFileSync(path.join(__dirname, 'original-preview-second.cjs'), source, { flag: 'wx' });

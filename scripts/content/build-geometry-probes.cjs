// Deterministic original SVG source. --check verifies bytes without rewriting assets.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..');
const fixtures = require('../../resources/curriculum/geometry-probes-v1.json');
const directory = path.join(root, 'apps/web/public/question-assets/geometry-probes-v1');
const check = process.argv.includes('--check'), assets = new Map();
const ink = '#275345', pale = '#f7f3e9', accent = '#b56a32', tile = '#a5bcb1', grid = '#667c72';
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const num = value => +value.toFixed(5);
const text = (x, y, value, size = 15, extra = '') => `<text x="${num(x)}" y="${num(y)}" font-size="${size}" text-anchor="middle" fill="${ink}" ${extra}>${escape(value)}</text>`;
const line = (x1, y1, x2, y2, attributes = '') => `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" ${attributes}/>`;
const put = (name, title, description, content) => assets.set(name + '.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 300" role="img" aria-labelledby="title desc"><title id="title">${escape(title)}</title><desc id="desc">${escape(description)}</desc><rect width="420" height="300" rx="14" fill="${pale}"/><g font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif">${content}</g></svg>\n`);

fixtures.rectangleGates.forEach(({ length, width, gate }, index) => {
  assert(length > width && width > 0 && gate > 0 && gate + 2 < length);
  const u = Math.min(290 / length, 140 / width), x = (420 - length * u) / 2, y = 55 + (140 - width * u) / 2;
  const right = x + length * u, bottom = y + width * u, start = x + 2 * u, end = start + gate * u;
  const boundary = `stroke="${ink}" stroke-width="4" stroke-linecap="round" data-role="fence"`;
  const content = `<g data-geometry="rectangle-gate" data-unit="m" data-scale="${u}">` +
    `<rect x="${num(x)}" y="${num(y)}" width="${num(length * u)}" height="${num(width * u)}" fill="#e6ede2"/>` +
    line(x, y, right, y, boundary) + line(x, y, x, bottom, boundary) + line(right, y, right, bottom, boundary) +
    line(x, bottom, start, bottom, boundary) + line(end, bottom, right, bottom, boundary) +
    line(start, bottom, end, bottom, `stroke="${accent}" stroke-width="3" stroke-dasharray="3 5" data-role="gate"`) +
    line(x + u, y + width * u / 2, right - u, y + width * u / 2, `stroke="${grid}" stroke-width="2" stroke-dasharray="7 5" data-role="interior-path"`) +
    text((x + right) / 2, y - 14, `长 ${length} 米`) + text(right + 22, (y + bottom) / 2 + 5, `${width}米`, 14) +
    text((start + end) / 2, bottom + 26, `门 ${gate} 米`, 14) + text(210, y + width * u / 2 - 10, '内部小路', 13) +
    text(210, 278, '实线是围栏 · 虚线标出门和内部小路', 13) + '</g>';
  put(`rectangle-gate-${index}`, '留一个门的长方形菜地', `长${length}米、宽${width}米，下边留${gate}米的门，其余四边围栏。内部虚线小路不属于边界。`, content);
});

function gridContent(columns, rows, emptyCells, kind, unit) {
  const u = Math.min(260 / columns, 205 / rows), x = (420 - columns * u) / 2, y = 42 + (205 - rows * u) / 2;
  const empty = new Set(emptyCells); assert(empty.size === emptyCells.length && emptyCells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < columns * rows));
  let content = `<g data-geometry="${kind}" data-unit="${unit}">`;
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const covered = !empty.has(row * columns + column);
    content += `<rect x="${num(x + column * u)}" y="${num(y + row * u)}" width="${num(u)}" height="${num(u)}" fill="${covered ? tile : '#ffffff'}" stroke="${grid}" stroke-width="1" data-role="unit-cell" data-covered="${covered}"/>`;
  }
  // Each outer edge is represented by actual unit-length segments, separate from the interior grid.
  for (let col = 0; col < columns; col++) content += line(x + col * u, y, x + (col + 1) * u, y, `stroke="${ink}" stroke-width="3" data-role="boundary-unit"`) +
    line(x + col * u, y + rows * u, x + (col + 1) * u, y + rows * u, `stroke="${ink}" stroke-width="3" data-role="boundary-unit"`);
  for (let row = 0; row < rows; row++) content += line(x, y + row * u, x, y + (row + 1) * u, `stroke="${ink}" stroke-width="3" data-role="boundary-unit"`) +
    line(x + columns * u, y + row * u, x + columns * u, y + (row + 1) * u, `stroke="${ink}" stroke-width="3" data-role="boundary-unit"`);
  return { content, x, y, u };
}

fixtures.squareGrids.forEach((edge, index) => {
  assert(Number.isInteger(edge) && edge > 0);
  const grid = gridContent(edge, edge, [], 'square-grid', 'cm');
  put(`square-grid-${index}`, '只追踪最外边的正方形网格', `横向${edge}格、纵向${edge}格，每格边长1厘米，最外框加粗。`,
    grid.content + text(210, 23, '每个小格边长 1 厘米', 15) + text(210, 280, '只沿最外框走 · 内部格线不计入', 14) + '</g>');
});

fixtures.rectangleCoverage.forEach(({ columns, rows, emptyCells }, index) => {
  const grid = gridContent(columns, rows, emptyCells, 'rectangle-coverage', 'sqdm');
  put(`rectangle-coverage-${index}`, '完整地块中的待补方砖', `${columns}列${rows}行，每格1平方分米，深色已铺，白色未铺；白格不是挖空的洞。`,
    grid.content + text(210, 23, '每个小格面积 1 平方分米', 15) + text(210, 280, '深色已铺 · 白色待补 · 外框内全部要铺满', 13) + '</g>');
});

fixtures.areaUnitGrids.forEach(unit => {
  const grid = gridContent(10, 10, [], 'area-unit-grid', unit.smallAreaUnit);
  put(`area-unit-${unit.id}`, '面积单位的两个方向', `正方形边长1${unit.largeLengthUnit}，也就是10${unit.smallLengthUnit}，每小格边长1${unit.smallLengthUnit}；两个方向都划分。`,
    grid.content + text(210, 23, `一边 1${unit.largeLengthUnit} = 10${unit.smallLengthUnit}`, 15) +
    text(210, 278, `每个小格边长 1${unit.smallLengthUnit} · 两个方向相同`, 14) + '</g>');
});

if (!check) fs.mkdirSync(directory, { recursive: true });
for (const [name, content] of assets) {
  const target = path.join(directory, name);
  if (check) assert.equal(fs.readFileSync(target, 'utf8'), content, `Changed generated SVG: ${name}`);
  else fs.writeFileSync(target, content);
}
assert.deepEqual(fs.readdirSync(directory).sort(), [...assets.keys()].sort(), 'Unexpected or missing geometry assets');
console.log(JSON.stringify({ mode: check ? 'check' : 'build', originalFigures: assets.size, directory: path.relative(root, directory) }));

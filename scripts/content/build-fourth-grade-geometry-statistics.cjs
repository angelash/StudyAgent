// Deterministic code-native diagrams. --check validates published bytes without rewriting them.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const fixtures = require('../../resources/curriculum/fourth-grade-geometry-statistics-v1.json');
const directory = path.resolve(__dirname, '../../apps/web/public/question-assets/fourth-grade-geometry-statistics-v1');
const check = process.argv.includes('--check'), assets = new Map();
const ink = '#275345', blue = '#176b8a', pale = '#f7f3e9', rust = '#b56a32';
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const number = value => +value.toFixed(6), rad = value => value * Math.PI / 180;
const text = (x, y, value, size = 17, extra = '') => `<text x="${number(x)}" y="${number(y)}" font-size="${size}" text-anchor="middle" fill="${ink}" ${extra}>${escape(value)}</text>`;
const line = (x1, y1, x2, y2, extra = '') => `<line x1="${number(x1)}" y1="${number(y1)}" x2="${number(x2)}" y2="${number(y2)}" ${extra}/>`;
const put = (name, title, description, body) => assets.set(name + '.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 340" role="img" aria-labelledby="title desc"><title id="title">${escape(title)}</title><desc id="desc">${escape(description)}</desc><rect width="480" height="340" rx="14" fill="${pale}"/><g font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif">${body}</g></svg>\n`);

fixtures.angles.forEach(({ degrees, rotation, lengths }, index) => {
  assert(degrees > 0 && degrees < 180 && lengths.every(value => value > 0));
  const x = 155, y = 166, ends = lengths.map((length, i) => [x + length * Math.cos(rad(rotation + i * degrees)), y - length * Math.sin(rad(rotation + i * degrees))]);
  const start = [x + 25 * Math.cos(rad(rotation)), y - 25 * Math.sin(rad(rotation))];
  const end = [x + 25 * Math.cos(rad(rotation + degrees)), y - 25 * Math.sin(rad(rotation + degrees))];
  const rays = ends.map(point => line(x, y, ...point, `data-role="angle-ray" stroke="${blue}" stroke-width="4" stroke-linecap="round"`)).join('');
  const arc = `<path d="M${number(start[0])},${number(start[1])} A25,25 0 0 0 ${number(end[0])},${number(end[1])}" fill="none" stroke="${blue}" stroke-width="2"/>`;
  const labelDirection = rad(rotation + degrees / 2 + 180), labelX = x + 23 * Math.cos(labelDirection), labelY = y - 23 * Math.sin(labelDirection) + 5;
  const reference = line(355, 192, 426, 192, `data-role="reference-ray" stroke="${rust}" stroke-width="3"`) + line(355, 192, 355, 121, `data-role="reference-ray" stroke="${rust}" stroke-width="3"`) + `<path d="M355,174 L373,174 L373,192" fill="none" stroke="${rust}" stroke-width="2"/>`;
  put(`rotated-angle-${index}`, '比较开口与直角', '左边蓝色角按真实比例绘制；右边为带直角标记的参照。两边长度和整体方向不决定角的类别。',
    text(240, 32, '比较角的开口') + rays + arc + text(labelX, labelY, 'O', 15) + reference + text(390, 231, '直角参照', 16) + text(240, 312, '只比较开口，不比较边长与方向', 16));
});

// Construct the intersection of the two rays at base A and B, then fit the actual triangle.
const triangle = (a, b) => {
  assert(a > 0 && b > 0 && a + b < 180);
  const height = 1 / (1 / Math.tan(rad(a)) + 1 / Math.tan(rad(b))), across = height / Math.tan(rad(a));
  const scale = Math.min(310, 180 / height), left = (480 - scale) / 2, bottom = 251;
  return [[left, bottom], [left + scale, bottom], [left + across * scale, bottom - height * scale]];
};
const outline = points => `<polygon data-role="triangle" points="${points.map(point => point.map(number).join(',')).join(' ')}" fill="#e3eee9" stroke="${blue}" stroke-width="3" stroke-linejoin="round"/>`;
const vertexLabels = points => points.map(([x, y], index) => text(x + (index === 0 ? -18 : index === 1 ? 18 : 0), y + (index === 2 ? -12 : 23), ['A', 'B', 'C'][index], 16)).join('');
fixtures.isosceles.forEach(({ apex, given }, index) => {
  const base = (180 - apex) / 2, points = triangle(base, base), known = given === 'C' ? apex : base;
  assert(['A', 'C'].includes(given));
  put(`equal-angle-triangle-${index}`, '等角条件下恢复三角形内角', `三角形ABC，已明确给出角A等于角B，角${given}为${known}度。图形按真实角度绘制。`,
    text(240, 31, '已知：∠A = ∠B') + outline(points) + vertexLabels(points) + text(240, 315, `∠${given} = ${known}°；其余内角待核对`, 17));
});
fixtures.exteriorTriangles.forEach(({ a, b }, index) => {
  const points = triangle(a, b), [origin] = points, external = 180 - a;
  const extension = line(origin[0] - 55, origin[1], ...origin, `data-role="extension" stroke="${rust}" stroke-width="3" stroke-dasharray="6 4"`);
  put(`exterior-triangle-${index}`, '平角相邻与三角形内角', `三角形ABC，边BA经过A向左延长至D；D、A、B共线且A位于D和B之间。角DAC为${external}度，角ABC为${b}度。`,
    text(240, 30, '相邻开口组成平角') + outline(points) + extension + vertexLabels(points) + text(origin[0] - 64, origin[1] + 22, 'D', 16) + text(240, 314, `∠DAC = ${external}°；∠ABC = ${b}°`, 17));
});

fixtures.barCharts.forEach(({ step, labels, values, first, second }, index) => {
  assert(step > 0 && labels.length === 3 && values.length === 3 && new Set(labels).size === 3);
  assert(labels.includes(first) && labels.includes(second) && first !== second && values.every(value => value >= 0 && value % step === 0));
  const baseline = 258, interval = 16, tickCount = 12;
  assert(Math.max(...values) <= step * tickCount);
  let body = text(240, 30, '上学方式统计（单位：人）', 18);
  for (let tick = 0; tick <= tickCount; tick++) {
    const y = baseline - tick * interval;
    body += line(65, y, 447, y, `data-role="scale-line" stroke="${tick ? '#d4ddd6' : ink}" stroke-width="${tick ? 1 : 2}"`);
    body += text(43, y + 5, tick * step, 14, 'data-role="scale-label"');
  }
  body += line(65, baseline, 65, baseline - tickCount * interval - 5, `stroke="${ink}" stroke-width="2"`);
  labels.forEach((label, i) => {
    const x = 104 + i * 116, height = values[i] / step * interval;
    body += `<rect data-role="bar" data-label="${escape(label)}" x="${x}" y="${number(baseline - height)}" width="54" height="${number(height)}" fill="${[blue, rust, '#6e7c5e'][i]}"/>`;
    body += text(x + 27, 287, label, 17, 'data-role="category-label"');
  });
  body += text(240, 320, `横向各类独立；纵轴每格 ${step} 人`, 15);
  put(`bar-chart-${index}`, '从真实刻度读取分类数量', `${labels.map((label, i) => `${label}${values[i]}人`).join('，')}。纵轴从0起，每格${step}人。问题只比较${first}和${second}。`, body);
});

if (check) {
  assert.deepEqual(fs.readdirSync(directory).sort(), [...assets.keys()].sort());
  for (const [name, body] of assets) assert.equal(fs.readFileSync(path.join(directory, name), 'utf8'), body, name);
} else {
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, body] of assets) fs.writeFileSync(path.join(directory, name), body);
}
console.log(JSON.stringify({ passed: true, mode: check ? 'check' : 'write', assets: assets.size, directory: path.relative(path.resolve(__dirname, '../..'), directory) }));
